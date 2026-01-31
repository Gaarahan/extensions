#!/usr/bin/env python3
import json
import os

# 读取 index.json
with open('index.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

# 分离空源和非空源插件
empty_plugins = []
keep_plugins = []

for plugin in data:
    if 'sources' in plugin and len(plugin['sources']) == 0:
        empty_plugins.append(plugin)
    else:
        keep_plugins.append(plugin)

# 保存处理后的数据
with open('index.json', 'w', encoding='utf-8') as f:
    json.dump(keep_plugins, f, ensure_ascii=False, indent=2)

with open('index.min.json', 'w', encoding='utf-8') as f:
    json.dump(keep_plugins, f, separators=(',', ':'), ensure_ascii=False)

# 删除二进制文件
apk_deleted = 0
icon_deleted = 0

for plugin in empty_plugins:
    # 删除 APK
    if plugin.get('apk'):
        apk_path = os.path.join('apk', plugin['apk'])
        if os.path.exists(apk_path):
            os.remove(apk_path)
            apk_deleted += 1
    
    # 删除 icon
    if plugin.get('icon'):
        icon_path = os.path.join('icon', plugin['icon'])
        if os.path.exists(icon_path):
            os.remove(icon_path)
            icon_deleted += 1

print(f'✓ 删除了 {len(empty_plugins)} 个空源插件')
print(f'✓ 剩余插件: {len(keep_plugins)}')
print(f'✓ 删除 APK 文件: {apk_deleted} 个')
print(f'✓ 删除 icon 文件: {icon_deleted} 个')
