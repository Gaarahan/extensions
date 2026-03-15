#!/usr/bin/env python3
"""
网站可访问性检测脚本（并行版本）
检测所有插件的 baseUrl 是否可访问（直连 + 代理两种方式）
"""

import json
import os
import urllib.request
import urllib.error
import ssl
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime

PROXY = "http://127.0.0.1:7890"
TIMEOUT = 10
MAX_WORKERS = 20
LOG_FILE = "check_output.log"

def check_url(url, use_proxy=False):
    """检测 URL 是否可访问"""
    try:
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        
        if use_proxy:
            proxy_handler = urllib.request.ProxyHandler({
                'http': PROXY,
                'https': PROXY
            })
            opener = urllib.request.build_opener(proxy_handler)
        else:
            opener = urllib.request.build_opener()
        
        req = urllib.request.Request(url, headers={
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': '*/*'
        })
        
        response = opener.open(req, timeout=TIMEOUT)
        if response.status != 200:
            return False, "非200状态码"
        
        content = response.read().decode('utf-8', errors='ignore')
        if '<title>404' in content or '<title>404 Not Found' in content or '<h1>404</h1>' in content:
            return False, "假404(HTTP 200但内容是404)"
        
        return True, "OK"
    except Exception as e:
        return False, str(e)

def check_url_pair(args):
    """检测一个URL的直连和代理状态"""
    url, idx, total = args
    direct_ok, direct_msg = check_url(url, use_proxy=False)
    proxy_ok, proxy_msg = check_url(url, use_proxy=True)
    
    status = ""
    if direct_ok and proxy_ok:
        status = "✅ 直连 ✅ 代理"
    elif direct_ok and not proxy_ok:
        status = f"✅ 直连 ❌ 代理 ({proxy_msg})"
    elif not direct_ok and proxy_ok:
        status = f"❌ 直连 ({direct_msg}) ✅ 代理"
    else:
        status = f"❌ 直连 ({direct_msg}) ❌ 代理 ({proxy_msg})"
    
    return {
        'idx': idx,
        'total': total,
        'url': url,
        'status': status,
        'direct_ok': direct_ok,
        'proxy_ok': proxy_ok
    }

def main():
    index_json_path = 'index.json'
    log_path = LOG_FILE
    
    with open(index_json_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    extensions_info = {}
    for item in data:
        name = item.get('name', '')
        sources = item.get('sources', [])
        for source in sources:
            base_url = source.get('baseUrl', '')
            if base_url:
                key = base_url
                if key not in extensions_info:
                    extensions_info[key] = {
                        'names': [],
                        'baseUrl': base_url
                    }
                if name not in extensions_info[key]['names']:
                    extensions_info[key]['names'].append(name)
    
    urls = list(extensions_info.keys())
    total = len(urls)
    
    print(f"共检测 {total} 个唯一 URL (并行 {MAX_WORKERS} 个线程)...")
    print("=" * 80)
    
    with open(log_path, 'w', encoding='utf-8') as log_file:
        log_file.write(f"检测时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
        log_file.write(f"共检测 {total} 个唯一 URL\n")
        log_file.write("=" * 80 + "\n")
        
        results = {
            'both_unreachable': [],
            'direct_only': [],
            'proxy_only': [],
            'both_reachable': []
        }
        
        tasks = [(url, i+1, total) for i, url in enumerate(urls)]
        
        with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
            futures = {executor.submit(check_url_pair, task): task for task in tasks}
            
            completed = 0
            for future in as_completed(futures):
                result = future.result()
                completed += 1
                
                log_line = f"[{completed}/{total}] 检测: {result['url']} ... {result['status']}\n"
                print(log_line.strip())
                log_file.write(log_line)
                log_file.flush()
                
                info = extensions_info[result['url']]
                if result['direct_ok'] and result['proxy_ok']:
                    results['both_reachable'].append(info)
                elif result['direct_ok'] and not result['proxy_ok']:
                    results['direct_only'].append(info)
                elif not result['direct_ok'] and result['proxy_ok']:
                    results['proxy_only'].append(info)
                else:
                    results['both_unreachable'].append(info)
        
        print("\n" + "=" * 80)
        log_file.write("\n" + "=" * 80 + "\n")
        
        summary = f"\n📊 检测结果汇总:\n"
        summary += f"   双向可达 (直连+代理): {len(results['both_reachable'])}\n"
        summary += f"   仅直连可达: {len(results['direct_only'])}\n"
        summary += f"   仅代理可达: {len(results['proxy_only'])}\n"
        summary += f"   双向不可达: {len(results['both_unreachable'])}\n"
        
        print(summary)
        log_file.write(summary)
        
        print("\n" + "=" * 80)
        log_file.write("\n" + "=" * 80 + "\n")
        
        unreachable_output = "\n🔴 不可访问的插件列表 (直连和代理都失败):\n\n"
        print(unreachable_output)
        log_file.write(unreachable_output)
        
        for info in results['both_unreachable']:
            for name in info['names']:
                line = f"   - {name}\n     URL: {info['baseUrl']}\n"
                print(line)
                log_file.write(line)
        
        if results['proxy_only']:
            proxy_output = "\n🟡 仅代理可访问 (直连失败):\n\n"
            print(proxy_output)
            log_file.write(proxy_output)
            
            for info in results['proxy_only']:
                for name in info['names']:
                    line = f"   - {name}\n     URL: {info['baseUrl']}\n"
                    print(line)
                    log_file.write(line)
        
        if results['direct_only']:
            direct_output = "\n🟢 仅直连可访问 (代理失败):\n\n"
            print(direct_output)
            log_file.write(direct_output)
            
            for info in results['direct_only']:
                for name in info['names']:
                    line = f"   - {name}\n     URL: {info['baseUrl']}\n"
                    print(line)
                    log_file.write(line)
        
        print("\n" + "=" * 80)
        log_file.write("\n" + "=" * 80 + "\n")
        log_file.write(f"日志已保存到: {log_path}\n")
    
    print(f"\n✅ 检测完成，日志已保存到: {log_path}")

if __name__ == "__main__":
    main()
