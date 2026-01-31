import json

with open('index.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

empty_plugins = []
for idx, plugin in enumerate(data):
    if len(plugin.get('sources', [])) == 0:
        empty_plugins.append({
            'index': idx,
            'name': plugin.get('name'),
            'apk': plugin.get('apk')
        })

print(f'找到 {len(empty_plugins)} 个没有任何源的插件\n')
for item in empty_plugins:
    print(f"{item['name']} ({item['apk']})")
