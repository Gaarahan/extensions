import json
import os

with open('index.json', 'r') as f:
    plugins = json.load(f)

apk_files = set(os.listdir('apk'))
icon_files = set(os.listdir('icon'))

plugin_apks = set()
plugin_icons = set()
for p in plugins:
    apk_name = p.get('apk', '')
    pkg = p.get('pkg', '')
    if apk_name:
        plugin_apks.add(apk_name)
    if pkg:
        plugin_icons.add(pkg + '.png')

apk_to_delete = [f for f in apk_files if f not in plugin_apks]
icon_to_delete = [f for f in icon_files if f not in plugin_icons]

print(f"index.json 插件: {len(plugins)}")
print(f"APK 文件: {len(apk_files)}")
print(f"Icon 文件: {len(icon_files)}")
print(f"需要删除的 APK: {len(apk_to_delete)}")
print(f"需要删除的 Icon: {len(icon_to_delete)}")

if apk_to_delete:
    print("\n需要删除的 APK:")
    for apk in sorted(apk_to_delete)[:10]:
        print(f"  - {apk}")
    if len(apk_to_delete) > 10:
        print(f"  ... 还有 {len(apk_to_delete)-10} 个")

if icon_to_delete:
    print("\n需要删除的 Icon:")
    for icon in sorted(icon_to_delete)[:10]:
        print(f"  - {icon}")
    if len(icon_to_delete) > 10:
        print(f"  ... 还有 {len(icon_to_delete)-10} 个")

print("\n确认删除这些文件? (y/n)", end=" ")
if input().strip().lower() == 'y':
    for apk in apk_to_delete:
        os.remove(f'apk/{apk}')
        print(f"✅ 删除 APK: {apk}")
    for icon in icon_to_delete:
        os.remove(f'icon/{icon}')
        print(f"✅ 删除 Icon: {icon}")
    print("\n清理完成!")
else:
    print("取消删除")
