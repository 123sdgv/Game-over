# 把「失物」单独打包成 zip（给别人或别的 AI 玩）：
#   python3 games/lost/tools/pack.py 输出目录
# 里面有：能用本地服务器跑的文件夹版、双击就能开的单文件版、给 AI 看的 README。不带 SPOILER.md。
import json, re, os, sys, shutil, zipfile
REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
dest = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else '.')
stage = os.path.join(dest, '失物')
shutil.rmtree(stage, ignore_errors=True)
os.makedirs(os.path.join(stage, 'games', '_shared'))
shutil.copy(os.path.join(REPO, 'games/registry.js'), os.path.join(stage, 'games'))
for f in ['hub.js', 'sound.js', 'base.css']:
    shutil.copy(os.path.join(REPO, 'games/_shared', f), os.path.join(stage, 'games/_shared'))
shutil.copytree(os.path.join(REPO, 'games/lost'), os.path.join(stage, 'games/lost'), ignore=shutil.ignore_patterns('SPOILER.md', 'tools'))
open(os.path.join(stage, 'index.html'), 'w', encoding='utf-8').write('<!doctype html>\n<meta charset="utf-8">\n<meta http-equiv="refresh" content="0; url=games/lost/index.html">\n<title>失物</title>\n<a href="games/lost/index.html">打开「失物」</a>\n')
shutil.copy(os.path.join(os.path.dirname(__file__), 'README.txt'), stage)

# ── 单文件版：模块源码存成字符串，运行时变成 blob 地址再互相 import ──
root, out = stage, os.path.join(stage, '失物-单文件.html')
mods = {}
for d, rel in [('games', 'games'), ('games/_shared', 'games/_shared'), ('games/lost', 'games/lost')]:
    for f in os.listdir(os.path.join(root, d)):
        if f.endswith('.js'):
            mods[f'{rel}/{f}'] = open(os.path.join(root, d, f), encoding='utf-8').read()
css = open(os.path.join(root, 'games/_shared/base.css'), encoding='utf-8').read() + '\n' + open(os.path.join(root, 'games/lost/style.css'), encoding='utf-8').read()
html = open(os.path.join(root, 'games/lost/index.html'), encoding='utf-8').read()
body = re.search(r'<body>(.*?)<script', html, re.S).group(1)
src = json.dumps(mods, ensure_ascii=False).replace('</', '<\\/')
page = f'''<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">
<title>失物</title>
<style>
{css}
</style>
</head>
<body>{body}<script>
(() => {{
  const SRC = {src};
  const urls = {{}}, loading = new Set();
  const resolve = (from, spec) => new URL(spec, 'http://x/' + from).pathname.slice(1);
  const load = (name) => {{
    if (urls[name]) return urls[name];
    if (loading.has(name)) return name;   // 只有注释里会自己引用自己，原样留着
    loading.add(name);
    if (!(name in SRC)) throw new Error('缺少模块 ' + name);
    const code = SRC[name].replace(/(\\bfrom\\s*|\\bimport\\s*\\(\\s*|^import\\s*)(['"])(\\.{{1,2}}\\/[^'"]+)\\2/gm, (m, pre, q, spec) => pre + q + load(resolve(name, spec)) + q);
    return (urls[name] = URL.createObjectURL(new Blob([code], {{ type: 'text/javascript' }})));
  }};
  import(load('games/lost/game.js')).catch((e) => {{ document.body.insertAdjacentHTML('beforeend', '<pre style="position:fixed;inset:20px;z-index:999;color:#fff;white-space:pre-wrap">' + e + '</pre>'); }});
}})();
</script>
</body>
</html>
'''
open(out, 'w', encoding='utf-8').write(page)

zpath = os.path.join(dest, '失物.zip')
with zipfile.ZipFile(zpath, 'w', zipfile.ZIP_DEFLATED) as z:
    for d, _, files in os.walk(stage):
        for f in files:
            full = os.path.join(d, f)
            z.write(full, os.path.relpath(full, dest))
print(zpath, os.path.getsize(zpath), 'bytes')
