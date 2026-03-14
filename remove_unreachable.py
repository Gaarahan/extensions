#!/usr/bin/env python3
"""
根据检测日志批量删除不可访问的插件
只删除 check_output.log 中标记为双向不可达的插件
支持白名单，跳过白名单中的网站
"""

import json
import os
import re

WHITELIST_FILE = 'whitelist.txt'
LOG_FILE = 'check_output.log'

def load_whitelist():
    """加载白名单"""
    whitelist = set()
    if os.path.exists(WHITELIST_FILE):
        with open(WHITELIST_FILE, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#'):
                    whitelist.add(line.rstrip('/'))
    return whitelist

def parse_check_log():
    """解析检测日志，提取双向不可达的URL"""
    unreachable = set()
    if not os.path.exists(LOG_FILE):
        print(f"错误: 日志文件 {LOG_FILE} 不存在")
        return unreachable
    
    with open(LOG_FILE, 'r', encoding='utf-8') as f:
        content = f.read()
    
    lines = content.split('\n')
    for line in lines:
        if '❌ 直连 ❌ 代理' in line:
            match = re.search(r'检测:\s*(https?://[^\s]+)', line)
            if match:
                url = match.group(1).rstrip('/')
                unreachable.add(url)
    
    print(f"从日志中解析出 {len(unreachable)} 个双向不可达URL")
    return unreachable

def is_whitelisted(base_url, whitelist):
    """检查baseUrl是否在白名单中（支持部分匹配）"""
    base_url_clean = base_url.rstrip('/').split('#')[0].split(',')[0].strip()
    for wl in whitelist:
        if wl in base_url or base_url_clean.startswith(wl):
            return True
    return False

def main():
    index_json_path = 'index.json'
    index_min_json_path = 'index.min.json'
    apk_dir = 'apk'
    icon_dir = 'icon'
    
    whitelist = load_whitelist()
    print(f"白名单加载完成: {len(whitelist)} 个网站")
    
    unreachable_urls = parse_check_log()
    if not unreachable_urls:
        print("没有找到不可达的URL")
        return
    
    print(f"\n不可达URL列表:")
    for url in sorted(unreachable_urls):
        print(f"  - {url}")
    print()
    
    with open(index_json_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    to_remove = []
    skipped = []
    
    for item in data:
        sources = item.get('sources', [])
        for source in sources:
            base_url = source.get('baseUrl', '').rstrip('/')
            
            if is_whitelisted(base_url, whitelist):
                skipped.append((item, base_url, "白名单"))
                break
            
            if base_url in unreachable_urls:
                to_remove.append(item)
                break
    
    print(f"\n找到 {len(to_remove)} 个不可访问的插件需要删除")
    print(f"白名单跳过: {len(skipped)} 个\n")
    
    if skipped:
        print("白名单跳过的插件:")
        for item, url, reason in skipped:
            print(f"  ⏭️ {item.get('name')} ({url}) - {reason}")
        print()
    
    if to_remove:
        print("将删除的插件:")
        for item in to_remove:
            sources = item.get('sources', [])
            urls = [s.get('baseUrl', '') for s in sources]
            print(f"  - {item.get('name')}")
            print(f"    URL: {urls}")
    else:
        print("没有需要删除的插件")
        return
    
    print("\n确认删除这些插件? (y/n)", end=" ")
    confirm = input().strip().lower()
    if confirm != 'y':
        print("取消删除")
        return
    
    for item in to_remove:
        pkg = item.get('pkg')
        apk = item.get('apk')
        
        data = [x for x in data if x.get('pkg') != pkg]
        
        apk_path = os.path.join(apk_dir, apk)
        if os.path.exists(apk_path):
            os.remove(apk_path)
            print(f"✅ APK已删除: {apk}")
        
        icon_path = os.path.join(icon_dir, pkg + '.png')
        if os.path.exists(icon_path):
            os.remove(icon_path)
            print(f"✅ 图标已删除: {pkg}.png")
    
    with open(index_json_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    
    with open(index_min_json_path, 'r', encoding='utf-8') as f:
        data_min = json.load(f)
    
    for item in to_remove:
        pkg = item.get('pkg')
        data_min = [x for x in data_min if x.get('pkg') != pkg]
    
    with open(index_min_json_path, 'w', encoding='utf-8') as f:
        json.dump(data_min, f, ensure_ascii=False, separators=(',', ':'))
    
    print(f"\n✅ index.json 更新完成")
    print(f"   删除 {len(to_remove)} 个插件")

if __name__ == "__main__":
    main()
