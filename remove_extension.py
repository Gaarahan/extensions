#!/usr/bin/env python3
"""
Tachiyomi Extensions 清理脚本
用于删除指定的插件及其所有相关资源（JSON、APK、图标、HTML链接）
支持白名单，跳过白名单中的网站
"""

import json
import os
import sys
import re

WHITELIST_FILE = 'whitelist.txt'

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

def remove_extension(extension_name, base_dir='.'):
    """
    删除指定的插件及其所有相关资源
    
    Args:
        extension_name: 要删除的插件名称（可以是插件名称的一部分）
        base_dir: 工作目录
    
    Returns:
        成功删除返回True，否则返回False
    """
    
    # 构建文件路径
    index_json_path = os.path.join(base_dir, 'index.json')
    index_min_json_path = os.path.join(base_dir, 'index.min.json')
    index_html_path = os.path.join(base_dir, 'index.html')
    apk_dir = os.path.join(base_dir, 'apk')
    icon_dir = os.path.join(base_dir, 'icon')
    
    # 读取当前文件
    with open(index_json_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    # 查找这个插件
    found_item = None
    for item in data:
        name = item.get('name', '')
        if extension_name in name:
            found_item = item
            break
    
    if not found_item:
        print(f"❌ 未找到 '{extension_name}' 插件")
        return False
    
    whitelist = load_whitelist()
    sources = found_item.get('sources', [])
    for source in sources:
        base_url = source.get('baseUrl', '').rstrip('/')
        if base_url in whitelist:
            print(f"❌ 错误: '{found_item.get('name')}' 的 baseUrl ({base_url}) 在白名单中，拒绝删除")
            return False
    
    print(f"找到插件: {found_item.get('name')}")
    print(f"包名: {found_item.get('pkg')}")
    print(f"APK: {found_item.get('apk')}")
    print()
    
    pkg = found_item.get('pkg')
    apk = found_item.get('apk')
    
    # 处理 index.json
    cleaned_data = [item for item in data if item.get('pkg') != pkg]
    with open(index_json_path, 'w', encoding='utf-8') as f:
        json.dump(cleaned_data, f, ensure_ascii=False, indent=2)
    
    print(f"✅ index.json: 从 {len(data)} 条 → {len(cleaned_data)} 条")
    
    # 处理 index.min.json
    with open(index_min_json_path, 'r', encoding='utf-8') as f:
        data_min = json.load(f)
    
    cleaned_data_min = [item for item in data_min if item.get('pkg') != pkg]
    with open(index_min_json_path, 'w', encoding='utf-8') as f:
        json.dump(cleaned_data_min, f, ensure_ascii=False, separators=(',', ':'))
    
    print(f"✅ index.min.json: 从 {len(data_min)} 条 → {len(cleaned_data_min)} 条")
    
    # 删除APK文件
    apk_path = os.path.join(apk_dir, apk)
    if os.path.exists(apk_path):
        os.remove(apk_path)
        print(f"✅ APK文件已删除: {apk}")
    
    # 删除图标文件
    icon_path = os.path.join(icon_dir, pkg + '.png')
    if os.path.exists(icon_path):
        os.remove(icon_path)
        print(f"✅ 图标文件已删除: {pkg}.png")
    
    # 从 index.html 删除链接
    with open(index_html_path, 'r', encoding='utf-8') as f:
        html_content = f.read()
    
    link_tag = f'<a href="apk/{apk}">{found_item.get("name")}</a>\n'
    if link_tag in html_content:
        html_content = html_content.replace(link_tag, '')
        with open(index_html_path, 'w', encoding='utf-8') as f:
            f.write(html_content)
        print(f"✅ 从 index.html 删除链接")
    
    print()
    print("=" * 80)
    print("✅ 清理完成!")
    print(f"   - JSON项目: 删除 1 个")
    print(f"   - APK文件: 删除 1 个")
    print(f"   - 图标文件: 删除 1 个")
    print(f"   - HTML链接: 删除 1 个")
    
    return True


def remove_multiple_extensions(extension_names, base_dir='.'):
    """
    删除多个插件
    
    Args:
        extension_names: 要删除的插件名称列表
        base_dir: 工作目录
    """
    
    successful = 0
    failed = 0
    
    for name in extension_names:
        print(f"\n处理: {name}")
        print("-" * 80)
        if remove_extension(name, base_dir):
            successful += 1
        else:
            failed += 1
    
    print()
    print("=" * 80)
    print(f"批处理完成: 成功 {successful}, 失败 {failed}")


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("用法:")
        print("  python remove_extension.py '插件名称'")
        print("  python remove_extension.py '插件1' '插件2' '插件3'")
        print()
        print("示例:")
        print("  python remove_extension.py 'GlobalComix'")
        print("  python remove_extension.py 'MangaPark' 'NamiComi' 'Azuki'")
        sys.exit(1)
    
    extension_names = sys.argv[1:]
    
    if len(extension_names) == 1:
        remove_extension(extension_names[0])
    else:
        remove_multiple_extensions(extension_names)
