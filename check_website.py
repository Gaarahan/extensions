#!/usr/bin/env python3
"""
网站可访问性检测脚本
检测所有插件的 baseUrl 是否可访问（直连 + 代理两种方式）
"""

import json
import os
import urllib.request
import urllib.error
import ssl
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed

PROXY = "http://127.0.0.1:7890"
TIMEOUT = 10

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
        return response.status == 200
    except Exception as e:
        return False

def main():
    index_json_path = 'index.json'
    
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
    print(f"共检测 {len(urls)} 个唯一 URL...\n")
    print("=" * 80)
    
    results = {
        'both_unreachable': [],
        'direct_only': [],
        'proxy_only': [],
        'both_reachable': []
    }
    
    for i, url in enumerate(urls, 1):
        print(f"[{i}/{len(urls)}] 检测: {url}", end=' ... ', flush=True)
        
        direct_ok = check_url(url, use_proxy=False)
        proxy_ok = check_url(url, use_proxy=True)
        
        if direct_ok and proxy_ok:
            results['both_reachable'].append(extensions_info[url])
            print("✅ 直连 ✅ 代理")
        elif direct_ok and not proxy_ok:
            results['direct_only'].append(extensions_info[url])
            print("✅ 直连 ❌ 代理")
        elif not direct_ok and proxy_ok:
            results['proxy_only'].append(extensions_info[url])
            print("❌ 直连 ✅ 代理")
        else:
            results['both_unreachable'].append(extensions_info[url])
            print("❌ 直连 ❌ 代理")
    
    print("\n" + "=" * 80)
    print("\n📊 检测结果汇总:")
    print(f"   双向可达 (直连+代理): {len(results['both_reachable'])}")
    print(f"   仅直连可达: {len(results['direct_only'])}")
    print(f"   仅代理可达: {len(results['proxy_only'])}")
    print(f"   双向不可达: {len(results['both_unreachable'])}")
    
    print("\n" + "=" * 80)
    print("\n🔴 不可访问的插件列表 (直连和代理都失败):\n")
    
    for info in results['both_unreachable']:
        for name in info['names']:
            print(f"   - {name}")
            print(f"     URL: {info['baseUrl']}")
    
    if results['proxy_only']:
        print("\n🟡 仅代理可访问 (直连失败):\n")
        for info in results['proxy_only']:
            for name in info['names']:
                print(f"   - {name}")
                print(f"     URL: {info['baseUrl']}")
    
    if results['direct_only']:
        print("\n🟢 仅直连可访问 (代理失败):\n")
        for info in results['direct_only']:
            for name in info['names']:
                print(f"   - {name}")
                print(f"     URL: {info['baseUrl']}")
    
    print("\n" + "=" * 80)

if __name__ == "__main__":
    main()
