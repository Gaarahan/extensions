#!/usr/bin/env python3
"""
根据 baseUrl 批量删除不可访问的插件
"""

import json
import os
import sys

UNREACHABLE_URLS = [
    "https://cosplaytele.com",
    "https://hentai-cosplay-xxx.com",
    "https://www.izneo.com/en/webtoon",
    "https://vortexscans.org",
    "https://baektoons.com",
    "https://freecomiconline.me",
    "https://grimscans.com",
    "https://hentai3z.cc",
    "https://dexhentai.com",
    "https://dexyscan.com",
    "https://lunatoons.org",
    "https://magustoon.org",
    "https://hachi.moe",
    "https://manga18free.com",
    "https://manga.madokami.al",
]

PRESERVE_URLS = [
    "https://batcave.biz",
]

def main():
    index_json_path = 'index.json'
    index_min_json_path = 'index.min.json'
    index_html_path = 'index.html'
    apk_dir = 'apk'
    icon_dir = 'icon'
    
    with open(index_json_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    to_remove = []
    for item in data:
        sources = item.get('sources', [])
        for source in sources:
            base_url = source.get('baseUrl', '')
            if base_url in UNREACHABLE_URLS:
                to_remove.append(item)
                break
    
    print(f"找到 {len(to_remove)} 个不可访问的插件需要删除\n")
    
    for item in to_remove:
        name = item.get('name', '')
        pkg = item.get('pkg', '')
        apk = item.get('apk', '')
        print(f"  - {name}")
        print(f"    包名: {pkg}")
        print(f"    APK: {apk}")
    
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
