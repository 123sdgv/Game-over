# Game Over 开发手册

这份是写给接手开发的 Claude 看的。每个新对话开工前先读一遍。**做完一个新游戏、或者 gray 提了新的长期要求，就顺手更新这份文件**（尤其是「现有游戏」和「待办」），下一个对话才接得上。

## 概况

- 这是一个「手机里的手机」小游戏大厅：打开后像一台 iPhone，有主屏幕、Dock、设置 App，每个游戏是一个 App。
- 主人 gray 把它「添加到主屏幕」后在 iPhone 上全屏玩，所以**一切以 iPhone 竖屏触摸为准**（测试用 390×844）。
- 纯静态网站，没有构建步骤、没有 npm 依赖，ES module 直接跑。GitHub Pages：https://123sdgv.github.io/Game-over/
- **`.nojekyll` 必须保留**，不然 Pages 会忽略 `games/_shared`，大厅整个白屏。
- 所有数据只存在浏览器 localStorage 里（前缀 `pp.`），设置 → 关于本机 可以导出 / 导入 / 抹掉。
- 密钥类的键（目前只有单词的墨墨 Token `game.vocab.token`）写在 `core/js/store.js` 的 `SECRET` 里：导出时跳过、导入时保留本机原来的、抹掉时照常清。以后再有要填 Token / Key 的 App，把键加进去。

## 目录

```
index.html  manifest.webmanifest  .nojekyll  README.md(故意留空，见待办)
core/
  js/main.js       入口
  js/apps.js       打开 App 的窗口（section.window[data-id] 里放 iframe）、底部横条上滑回主屏幕、
                   给游戏发 pp:pause / pp:resume、收到游戏发来的 pp:home 就回主屏幕
  js/home.js       主屏幕：每页 4×6 格自由摆放、可以留空、多页、Dock 最多 4 个、长按整理（拖到空格=放过去，拖到图标=交换）
                   新加到 registry 的游戏会自动放进第一个空格子
  js/settings.js   设置 App：墙纸、关于本机（导出/导入/抹掉）、每个游戏的设置页（按 registry 自动生成）
  js/store.js  backup.js  guard.js  ui.js  wallpaper.js
  css/  assets/
games/
  registry.js      游戏清单（见下）
  _shared/hub.js   游戏 ↔ 大厅的接口
  _shared/sound.js 合成音效
  _shared/lib/     three.js 等第三方库（3D 游戏共用）
  _shared/base.css 共用样式和颜色变量
  <id>/            每个游戏一个文件夹：index.html  style.css  game.js  icons/  （可以再拆 logic.js、art.js 等模块）
```

## 加一个新游戏

1. 建 `games/<id>/`，`index.html` 从现有游戏（比如 `games/merge/index.html`）抄骨架：viewport meta（含 `viewport-fit=cover`、禁止缩放）、先引 `../_shared/base.css` 再引自己的 `style.css`、`<script type="module" src="game.js">`。
2. 在 `games/registry.js` 的数组**末尾**加一项：
   - `id` 英文唯一名（也是存档键）、`name` 中文名、`path: 'games/<id>/'`、`icons: ['icons/xxx.svg']`（**只放一个**）
   - `wide: true`（可选）：这个 App 在 iPad / 电脑上铺满屏幕，不显示成一台小手机（`apps.js` 的 `setWide`，样式在 `window.css`）。要横屏玩的游戏才加
   - `settingsNote`：设置页底部的一段说明（改动什么时候生效、规则一句话）
   - `settings`：支持三种 `type`
     - `toggle`：`{ key, label, type: 'toggle', default, sub?:小字说明 }`
     - `stepper`：`{ key, label, type: 'stepper', min, max, default, step?, unit?, display?(v)=>文字, sub?:小字说明 }`，`max` 可以写成函数 `(s) => ...` 依赖别的设置
     - `color`：`{ key, label, type: 'color', default, options: [{ value, label, color }] }`，设置页显示一排小色球（螺旋跳跃的小球颜色用的）；存的是 `value`，不在 options 里会自动回到默认；游戏里用 `hb.meta.settings` 找 options 换算成颜色
     - 其他 type（比如 `choice`）**没有实现**，要用得先去 settings.js 里写
   - `presets`（可选）：`{ label, values: {...}, note }` 一键套用
   - `stats`：`{ key, label, format? }`，`format: 'ratio'`（显示成 x（y%），按 played 算）或 `'best'`（扫雷那种按设置组合存的最快时间）
   - **`stats.played` 会被加进设置首页「共玩了 N 局」**，新游戏记得每局 `played + 1`
3. 图标放 `icons/`，见下面「图标」。
4. 在 `game.js` 里接 hub：

```js
import { hub } from '../_shared/hub.js';
import { sound } from '../_shared/sound.js';
const hb = hub('<id>');
let S = hb.settings();                  // 已合并默认值、按 min/max 校正过
hb.onSettings((s) => { S = s; ... });   // 在设置页改了会回调（storage 事件）
hb.stats() / hb.saveStats(obj)          // 记录（设置页里展示）
hb.load('save', null) / hb.save('save', v)   // 自己的存档，键是 game.<id>.<name>，会跟着导出/导入
hb.onPause(fn) / hb.onResume(fn)        // 回到主屏幕 / 再打开（要暂停计时、停动画循环）
hb.haptic(ms 或 [震,停,震])             // 轻震（iPhone Safari 基本不支持 vibrate，但写上无妨）
hb.home()                               // 让大厅回到主屏幕（游戏里自己的「退出」按钮用这个）
sound.enabled = S.sound;
sound.tone({ f, to?, dur, type:'sine'|'square'|'triangle'|'sawtooth', vol, delay, attack })
sound.hiss({ f, to?, dur, filter:'bandpass'|'lowpass'|'highpass', q, vol, delay })   // 噪声：刷、切、爆
sound.arp([频率...], { gap, dur, type, vol, delay })                                   // 一串音：过关、升级
```

5. 页面布局：顶部要让出 `var(--safe-t)`，底部要让出 `var(--safe-b)` 加 `var(--home-bar)`（26px，大厅的横条在那儿）。颜色变量在 base.css（`--paper --white --ink --ink-2 --ink-3 --line --signal --font --ease`）。
6. 结算/暂停弹窗大家都用同一套结构：`#cardWrap > .card > #cardTitle #cardBig #cardMeta .card-row(#cardAlt.ghost, #cardMain)`，样式各游戏自己写在 style.css。
7. Canvas 游戏：按 `devicePixelRatio` 放大画布；复杂的图（水果、方块）先画到离屏 canvas 缓存成贴图再贴，60fps 才稳。

## 图标

- **每个游戏只有一个图标**，**简洁、白底**（白到 #F1F2F5 的浅渐变也行），一眼能看出是什么游戏，带一点立体质感但别花。
- 一般是 120×120 的 SVG（`viewBox="0 0 120 120"`，铺满不留圆角，大厅自己会裁 15px 圆角）。SVG 里渐变 id 加上游戏名后缀避免冲突（如 `bg-path`）。合成大西瓜用的是 240px PNG。
- 不要照抄原版游戏的图标。

## 第三方库

- **npm registry 在这个环境里连不上**（DNS 失败 / 代理 403），GitHub 是通的。要用库就从 GitHub 稀疏 clone 拿构建好的文件，放进游戏自己的 `lib/`，连 LICENSE 一起提交。例：

```bash
git clone --depth 1 --branch r169 --filter=blob:none --no-checkout https://github.com/mrdoob/three.js /tmp/three
cd /tmp/three && git sparse-checkout set --no-cone /build/three.module.min.js /LICENSE && git checkout
```

- three.js r169 放在 `games/_shared/lib/three.module.min.js`（约 690KB，带 LICENSE），3D 游戏直接 `import * as THREE from '../_shared/lib/three.module.min.js'`。
- **物理引擎 Bullet（ammo.js）**：`games/_shared/lib/ammo.wasm.js` + `ammo.wasm.wasm`（共约 1MB，从 three.js r169 仓库的 `examples/jsm/libs/` 拿的），许可证 `AMMO-LICENSE.txt`（zlib，来自 kripken/ammo.js）。不是 ES module：`index.html` 里先 `<script src="../_shared/lib/ammo.wasm.js">`，再在模块里 `await Ammo({ locateFile: (p) => '../_shared/lib/' + p })`。圆柱叠罗汉很稳（打罐子在用，写法见 `games/cans/physics.js`）。几个坑：物体刚摆好不能直接设成睡着，要先算几十步让接触建立起来，不然下面的被打飞了上面的不会醒；`getActivationState` 这个版本没有，用 `isActive()`。**在 Node 里直接跑 ammo 被环境的权限检查拦了**，测试都放在 Playwright 的浏览器里跑。

## 查资料

- 图片搜索的结果只显示给 gray，Claude 只拿到标题；外站图片 shell 也下载不了（连接直接失败，别重试）。想学原版画风只能靠文字描述，或者请 gray 发截图。

## 测试（推之前必须做）

```bash
cd /home/claude/game-over && python3 -m http.server 8765   # 用后台方式跑，会被定时停掉，停了就再开
```

用 Python Playwright（已装好，不要再 `playwright install`）：

```python
b = await p.chromium.launch()   # 3D/WebGL 游戏加 args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']（软件渲染只有 6fps 左右，正常）
ctx = await b.new_context(viewport={'width':390,'height':844}, device_scale_factor=2, has_touch=True, is_mobile=True)
await ctx.add_init_script("localStorage.setItem('pp.hint.edit','1');")   # 跳过主屏幕的整理提示
pg = await ctx.new_page()
pg.on('console', ...); pg.on('pageerror', ...)                           # 收集报错，必须是空的
await pg.goto('http://localhost:8765/')
await pg.click('#home .app[data-id="<id>"]')
f = [x for x in pg.frames if '/<id>/' in x.url][0]                       # 游戏在 iframe 里
# 回主屏幕：pg.click('section.window[data-id="<id>"] .home-bar')
# 设置页：pg.click('#dock .app[data-id="settings"]') 然后点游戏名
```

- 真实的滑动手势用 CDP：`cdp = await ctx.new_cdp_session(pg)`，`Input.dispatchTouchEvent` 发 touchStart / 几次 touchMove / touchEnd。
- 在游戏里挂一个测试用的 `window.__<id>` 钩子方便读状态、摆局面（现有游戏都这么做）。
- 关键界面都截图，**自己打开截图看**：开始界面、游戏中、结算弹窗、设置页。动作游戏写个自动玩的小脚本跑一段。
- 截图放 scratchpad，不要提交进仓库。
- 3D 游戏在软件渲染下很慢，截图常常超过 Playwright 默认的 30 秒：先 `ctx.set_default_timeout(90000)`，再用 `add_init_script` 往 `pp.game.<id>.settings` 写 `{lowPower:true}`（没阴影、低分辨率），只在最后单独开一次全画质看效果。游戏里留个 `warp` 快进钩子，自动玩脚本才跑得完。
- 同一时间只开一个浏览器跑测试（两个一起跑会互相拖慢到超时）。别用 `pkill -f 某个词`：命令行里也有这个词，会把自己的 shell 一起杀掉（退出码 144）。
- 游戏收到 `hb.onPause`（回主屏幕）以后最好连开始界面也停止渲染，不然藏在后台的 iframe 一直在画，又费电又把别的页面拖慢（螺旋跳跃的 `away` 就是这么做的）。

## 提交

- 直接推 `main`，不开 PR。**commit 作者用 `Claude <noreply@anthropic.com>`**（2026-10-28 gray 同意改的：这样 GitHub 不会显示 Unverified，环境的检查也不会拦；以前的 commit 是 123sdgv <llam1134@outlook.com>，不用动），commit 信息结尾加会话给的 Co-Authored-By 等署名行。
- 会话一开始用添加仓库的工具加 `123sdgv/Game-over`（push 权限）。如果被系统拦了，多半是因为 gray 没在当前对话里明确说要推送权限：先接着做，最后请他说一句再加一次。

```bash
git add -A && git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit -q -m "..." \
  && git fetch -q origin main && git rebase -q origin/main && git push origin HEAD:main
git ls-remote origin refs/heads/main    # 确认远端已经是新 commit
```

- 推送时提示 "This repository moved" 无害（仓库名大小写改过，`Game-over`）。
- `gh api .../pages` 这类接口被代理禁止，WebFetch 有时也会失败；以 `ls-remote` 为准，Pages 一两分钟后自动更新。
- 推送如果因为权限检查失败：重试一次；还不行就把改动的文件用发送文件的方式发给 gray，他自己上传。

## 现有游戏

| 文件夹 | 名字 | 要点 |
|---|---|---|
| minesweeper | 扫雷 | 行列雷数可调、长按插旗、4 个预设、按设置组合记最快时间 |
| colorspot | 色感 | 找颜色不同的格子；30 秒倒计时，答对加时、点错扣时，格子越来越多、色差越来越小 |
| watersort | 倒水 | canvas 画的有质感的瓶子和顺滑倒水动画；下层颜色先藏起来；闯关 + 无限模式（固定 15 个瓶子，完成一瓶就补一个新瓶） |
| blocks | 方块 | 俄罗斯方块 + 同色消除：底下是彩色行，同一行颜色相同才消；闯关 / 无限；图标是经典 T 形 |
| popstar | 消灭星星 | 点同色相连的星星消除；闯关 + 无尽（每几步升一行）；没有选中时的分数气泡（gray 要求删掉的） |
| fruit | 切水果 | 9 种精细手绘水果 + 炸弹（fruits.js），限时 / 闯关，有特殊水果；gray 要求水果尽量精致 |
| leave | 假条 | Win95 风格的小工具（白底）；每周设定那天 0 点自动加假条，隔几周会补；从 gray 旧仓库 TakeTimeOff 迁移过来（会导入旧的 `jiatiao_sim_count`） |
| merge | 合成大西瓜 | Verlet 物理；9 级：葡萄→樱桃→橙子→柠檬→猕猴桃→桃子→菠萝→半个西瓜→西瓜（art.js 全部原创重画）；合出西瓜后它消失，弹窗「恭喜」只有「继续」一个按钮；图标是一个完整西瓜 |
| roll | 滚滚球 | three.js 3D：悬浮方块拼成的 **4 条轨道** + 蓝天白云。按住左右拖，**一格一格吸附换道**（手指挪过约 0.6 格才换，有回差防抖；球只停在轨道正中，不能卡在两格之间擦边）；躲块块、绕开洞、吃金币；**没有跳跃、没有新手引导、开始界面下面没有说明小字**（gray 真机试过后要求的）；手指划过有切水果那样的白色刀光（trail.js，读 getCoalescedEvents）；块块：方块 / 墙开口 / 高柱左右绕 / 在两三条轨道间来回滑的块（到头会停一下），每一行都留了空轨道；金币一律在格子正中；闯关（种子固定路线）+ 无尽；**开始界面只有「闯关 · 第 N 关」和「无尽模式」两个按钮**：没有选关箭头、没有「继续上一局」，中途退出下次就从当前关卡开头玩（gray 要求的，回主屏幕仍会自动暂停）；`window.__roll.step(dt)` 可以无画面快进，`__roll.setLane(n)` 换道，用自动驾驶脚本测过关卡可过 |
| helix | 螺旋跳跃 | three.js 3D，仿 Helix Jump：柱子上一层层带缺口的圆环平台，小球一直弹；**按住左右拖转柱子**（直接跟手，没有惯性），从缺口掉下去，碰到**红色**就输（gray 选的红色区块，不做尖刺）。连穿 3 层不落地变火球，下一次落地连红色一起砸碎。穿过的平台炸开飞走、弹过的地方留颜料印子、小球正下方有影子帮瞄准。闯关（`levelLength(n)` 层，落到金色终点过关，每关换一套配色 `THEMES`）+ 无尽（每 30 层换配色、分数加成）。每次落地存档，开始界面有「继续上一局」；第一次玩有左右拖的提示。设置里能换**小球颜色**（`color` 类型）、灵敏度、弹跳速度、火球、拖尾、省电。图标是小球弹起来的状态。规则在 tower.js（12 片一圈：0 缺口 / 1 普通 / 2 红），画面在 scene.js；`window.__helix`（`warp` 可以快进、`setRot` 直接转到某个角度）|
| tiles | 别踩白块 | 仿「别踩白块儿 / 白块达人」，**没有钢琴曲**（gray 选的：清脆的合成敲击声，音高随连击慢慢往上走，设置里一个开关能整个关掉）。canvas 2D，**黑白质感风**：黑块是带厚度、光泽、投影的「键」，踩下去变成沉下去的浅灰键 + 一圈涟漪；踩错的白块变红闪、漏掉的黑块变红闪，棋盘倒回去让你看清。只有两个模式（gray 选的）：**经典**（踩完设定块数，默认 50，计时 0.000″，终点是整片绿色 + 格子终点线）和**街机**（一直往下掉、每踩一块再快一点，漏一块或踩白块就输）。「开始」那块算第 1 块；暂停 / 回主屏幕 / 读档以后要先踩标着「继续」的那块才接着走（经典计时也停着，街机先慢到七成再追回去）。经典按「滑到位以后」的位置判定（手指比动画快），街机按画面位置；已经踩过的那一行里的白块不算错。设置：经典块数、街机起始速度 / 加速、每行几格（3–5）、一屏几行（3–6）、音效。记录：经典最快（按块数分开存在 `bests`，`classicBest` 是显示用的字符串）、街机最多、街机最快速度、一共踩了、局数。棋盘底下留了一条浅灰底座给大厅横条。画面在 render.js（贴图缓存），规则在 game.js；`window.__tiles`（`next()` 给出下一块该踩的位置，`onTap(x,y)` 直接踩）|
| vocab | 单词 | 不是游戏，是墨墨背单词的学习数据看板（gray 要的「abc 图标、点进去用各种格式显示 API 内容」）。**只读**，不往墨墨写。数据：今日进度 + 今日单词（三圈圆环：全部/新词/复习；第一反应分段条；单词格子/列表，圆点=新词、方块=复习、颜色=第一反应、空心=没背）、复习预报（按天 `as_count` 查 10 天，设置决定显示几天，斜纹那根是今天）、顽固词横栏（`query_study_records` 取 1000 条本地筛 STICKING）、云词本列表（点开读词本详情）、最近几天（**墨墨没有历史接口，是每次刷新在本机记一笔** `game.vocab.history`）。没填 Token 显示示例数据（demo.js）。Token 在 App 右上角钥匙里填，「连不上墨墨？」里可以填中转地址。点单词用系统朗读（`speechSynthesis`）。接口在 api.js：本地频控（10 秒 18 次 / 60 秒 38 次）、20 秒超时、错误分类。**github.io 直连墨墨会被跨域拦下（gray 真机确认）**，所以默认走中转 `RELAY_BASE`（`https://game-over-memo-123sdgv.vercel.app/open`），中转连不上（网络错误/超时）才试直连；404 时换路径前缀（`/api/v1/memo` ↔ 旧的 `/api/v1`）。能用的那条记在 `game.vocab.route`。钥匙面板「中转地址」可以填别的中转（只填域名也行，会补 `https://` 和 `/open`）。中转源码在 **`relay/`**（Vercel Node 函数 `api/open.js`，`vercel.json` 把 `/open/*` 改写过去；另有同规则的 Edge 版 `api/edge.js` 走 `/edge/*`，出口网络不同。App 顺序：`/edge` → `/open` → 直连，中转回 502 `relay_upstream/relay_timeout` 也算这条路不通、换下一条）。**实测：香港 hkg1 的 Node 函数连墨墨（阿里云杭州 47.97.211.202）TCP 超时，是墨墨挡了那个机房；Edge 版在新加坡 sin1 能连上（401，257ms）**，所以 Edge 排第一，Node 版函数挪到 sin1 当备用。`__ping` 会列出 DNS、各 IP 的 TCP 连接、API 和官网的结果：只认 `https://123sdgv.github.io`（和测试用的 localhost:8765）发来的请求，只放行 study 三个查询、notepads、vocabulary 这些只读接口，原样转发 Authorization，墨墨的状态码原样返回并补跨域头（所以走中转时能看出 Token 不对）；`/open/__ping` 自检能不能连到墨墨。**Claude 连的 Vercel 权限不能建项目也不能部署（403）**，是 gray 在 Vercel 里从 GitHub 导入本仓库、Root Directory 选 `relay`、项目名 `game-over-memo-123sdgv` 建的；改 relay/ 推到 main 会自动重新部署。测试：Playwright `ctx.route` 同时拦 `https://open.maimemo.com/**`（直连，应该 abort 模拟跨域被拦）和中转域名，要回 CORS 头。`window.__vocab` |
| cans | 打罐子 | 黄昏后院打易拉罐（gray 选的风格；**背景直接贴一张图，不要像滚滚球那样建模**）。three.js + Bullet 物理（ammo，见「第三方库」）。罐子是圆柱刚体，叠成金字塔 / 夹木板的塔 / 一摞摞，放在木马架上的木板、树桩、油桶、木箱、轨道上来回走的小车上；**罐子掉到所有台面最低的那个下面才算打下去**（`downY`），全部打下去过关。**只用准星**（gray 选的）：按住出准星（在手指上方，设置可调），拖动，松手开枪；手指拖到屏幕最下面松手是取消。子弹是一颗很快、有分量的小球（开了连续碰撞），从准星射线打中的地方前面一点发出，所以能把罐子连同后面的一串撞飞；打中罐子留弹孔、喷汽水。**两种模式都要**（gray 选的）：轻松（子弹不限）/ 挑战（三星发数 + 设置里多给几发，打光了台上还有罐子就重来），各自记关卡进度和星星；星星按用了几发（开枪数减金罐子送回的）：≤ 三星发数 3 星，再多 2 发以内 2 星。花样四种都要：红色爆炸罐（打中就炸，旁边的红罐连环炸，有慢镜头）、木板隔层 / 高塔、会动的小车、金罐子（打下去送一发）。前 16 关手工排（`levels.js` 的 `HAND`），后面按种子自动生成（竖屏横向放不下，多堆就前后错开）；相机按罐子取景（`scene.js` 的 `cameraFor`），台子伸出画面没关系。**三星发数 `PAR` 是机器人试打出来的**：`tools/par-bot.html`（每枪试十几个瞄点、挑最好的；罐子 12 个以上再宽限 1 发），改了关卡或者物理参数要重跑。背景图 `img/backdrop.jpg` 是 `tools/backdrop.html` 画出来导出的（天空晚霞、远处的树和小房子、电线杆和小鸟、逆光栅栏）。其余贴图（8 种原创汽水图案、爆炸罐、金罐、木头、树皮、油桶、草地）都在 `art.js` 里现画，开局只画罐子的，其余空闲时慢慢画（`warmArt`）。枪是几何体拼的玩具左轮（`gun.js`），故意比准星偏左一点露出侧面，用单独的中性「影棚」反射环境。存档：每次停稳以后存所有东西的位置朝向，「继续上一局」原样摆回去。`window.__cans`（`start(mode, n)`、`shootItem(i, dy)` 瞄准第 i 个东西开一枪、`fire(x, y)`、`warp`）|
| poop | 便便超人 | 仿 Doodieman Voodoo（大便超人）的**纯解压玩具**（gray 选的：没有输赢、没有关卡、没有评分，12 招一开始全开）。画风是 gray 要的「原版那种」Flash 涂鸦风：粗描边、平涂、夸张变形，全部原创；尺度是他选的「搞笑但不恶心」（糊上去像巧克力奶油，**不要加苍蝇、臭气**）。canvas 2D。主角便便超人（披风、面具、腰带），布偶是缝线麻布 + 大头针 + 会晃的塑料活动眼。12 招：屁股炮 / 高抛 / 空翻踢 / 蹦床 / 连发 / 炸弹 / 下雨（布偶撑伞，最后被大坨砸坏）/ 俯冲（拍扁）/ 回旋（先飞过去骗它得意，再从背后回来）/ 马桶炮 / 大风车 / 甜筒（头上堆冰淇淋帽，9 层就塌）。手势：点招式放招、按住连放（最多排 3 个）；点超人唱歌（3 首原创，布偶捂耳朵）；点布偶戳它、拖它能扔；点空地扔一坨；点墙上牌子起名（最多 8 字）；左上「洗澡」清干净（算一局，`played` 在洗后第一坨时 +1）、「自动」随机放招。糊的东西按身体部位烘焙（`mess` 只存 seed 能重放，跟着四肢动），墙和地的污渍在 `stains`，都存档。设置：便便颜色（4 种 `color`）、动画速度、飞溅数量、屏幕震动、台词气泡、音效。结构：art.js 全部美术，world.js 协程 / 物理 / 绘制，moves.js 招式和队列（`spawn` 的生成器：yield 数字=等秒，yield 函数=等条件，yield null=等一帧；一招超过 16 秒自动中止收拾），sfx.js 合成音效。`window.__poop`（`enqueue('shot')`、`queue`、`w`、`saveNow`）|
| prank | 整蛊火柴人 | gray 选的：**道具栏整他、纯沙盒**（没有关卡和输赢，道具不限量）、**纯黑白**（画面只有黑和白，灰阶全靠网点）、老 Windows 外壳、**狠一点**（骨折、四肢和脑袋能飞出去，但黑白没有血，断口喷的是墨）。**手机横屏玩，iPad 也能玩**：左边画布 + 底下状态（小人示意图、生命 / 疼痛 / 恐惧、状态、伤情、被整几下），右边道具格 + 说明。**横屏的做法**：manifest 是 `portrait`，系统可能不转屏，所以 `game.js` 的 `layout()` 在竖屏且宽度 < 600 时把整个 `#desk` 转 90°（`rotated`，`toWorld`/`toLocal` 换算坐标），系统真转了就按普通横屏排，两种都测过；registry 标了 `wide`。**操作**：点右边选道具，再点画布用在那个位置，长按画布道具变大。**没有**「再点一次图标直接用」（gray 看不懂，删了），同一个图标再点没反应。15 样道具（`tools.js`）：鼠标 / 钉子 / 绳子 / 气球 / 水 / 铁砧 / 香蕉皮（用一次就消失）/ 弹簧板 / 钉板 / 闪电 / 压路机（「小车」）/ 冰冻 / 黑洞 / 橡皮 / 铅笔。**gray 明确删掉的，别加回来**：炸弹、地雷、火箭、电锯、回收站、死亡弹窗、设置里的「抗揍程度」。**鼠标**：选中后道具格缩成一排小格，右栏下面是大圆盘（`#pad`，像笔记本触控板），滑动移动箭头，碰到他就抓、松手放开，点圆盘中央 = 点他身体；手指直接拖画布上的他也保留。**钉子**（圆帽 + ＋×）：哪儿都能钉；点手腕脚踝钉住（`direct` 只钉这一处），或先钉好把他扔上去被困住；点气球戳破。**绳子**：有弹性（`rope` 软约束，超过 1.05 倍才全力拉），两头都能绑钉子、手腕、脚踝（活人或尸体），靠近 9 单位内自动接上；钉子比手腕高 40 以上会自动收紧把人吊起来（`refreshRope`）；两头都固定的能走钢丝。**解开**：挣扎 9–18 秒挣脱一处（`freeOne`）；有束缚时鼠标硬拽会扯断（`checkYank`）；橡皮最好用。**气球**：绑手腕脚踝，`liftU` = 各气球 s² 之和，≥ 1.8 才飞（两个，或者点气球吹大，s ≥ 2.2 自动爆）；升力在 `Body.applyLift` 全身加权，到顶正好抵消重力；手比气球高时先顶气球，别瞬移手（瞬移会把胳膊抽飞、速度几千）。**水**：格子 flood fill（`CELL=3`），只有选中水才显示小点，上下拖调水位，拖到底没水；铅笔框封闭就能单独灌（`closedRegion`）；会游泳，头入水时「恐惧」条换成「氧气」，憋 9 秒后每秒掉 6%；冰冻遇水化开扣 15%；重的沉、轻的浮；尸体沉一会儿浮起来，断肢更快。**铅笔**：右栏「自由 / 直线」两个按钮；线是陆地，东西和小车都能放上去；从他身上画出去多长一条。身上的杆子已经穿过某条线时这条线先不管这几个点（`updateThrough`），不然线上线下互相拽会抖着掉血。**多人**：活着时点「重画」多一个，最多 5 个，血条共用（`W.vit`），加人不回血；断头或拦腰断这一个立刻死，共用血扣三分之一；全死了回满。**死了不弹窗，自动画新的**，一下死几个也只画一个（`noteDeath`）；「停止」后不再自动画，点「重画」接着画；画一个算一局。**尸体不点清场或不用橡皮就一直在**，不出屏幕（睡眠优化 `p.sleep`，在水里不睡）。**性格**（外观完全一样，随机）：`office` 冷淡上班族（gray 的设定：意外得罪坏人被送进来，家人漠不关心，他也冷淡，**只在台词里透露**）、`sunny` 热情开朗、`sharp` 认真灵敏；台词、动作权重、躲避成功率都不同（`SKILL` .38/.5/.74，总体约一半）。躲避：弯腰、跳、侧扑、远离鼠标和橡皮。拟人：表情多、日常小动作多、对你换道具有反应、几个人会互动。设置：血条厚度（100–500，默认 300，条本身不变粗，数字是实际血量）、飞溅数量、画面震动、黑白闪屏、台词气泡、音效。画布是低分辨率：每个逻辑像素对齐到整数个物理像素（`px`），世界大小随屏幕变（手机约 500×260，iPad 约 330×250）。结构：`world.js` Verlet 物理 / 道具 / 水 / 绳 / 绘制，`body.js` 骨架、AI、姿势、伤情，`tools.js` 道具表和手势，`art.js` 全部美术和图标，`sfx.js` 合成音效，`game.js` 外壳、布局、存档（每 5 秒和离开时存 `game.prank.world`，`snapshot` 的 `v:2`，版本不符开新局；读档后他从躺着爬起来）。`window.__prank`（`step(dt)` 手动走帧前先 `stop()`、`tools.place/down/move/up`、`select`、`redraw`、`rotated`、`B`、`W`）|
| starmatch | 星星消消乐 | 仿开心消消乐的三消，小动物换成 gray 喜欢的胖星星（选的画风 A：软糖一样的五角星，art.js 现画）。**点一颗再点旁边那颗互换，也能按住滑**（设置可关滑动）；换了连不成排会弹回去，不扣步。4 连出直线星（横连竖炸、竖连横炸），L/T 形出爆炸星（曼哈顿半径 2），5 连出彩虹星；两颗特效互换合体：直线+直线一行一列、直线+爆炸三行三列、爆炸+爆炸半径 4、彩虹+直线/爆炸把那个颜色全变成特效再引爆、彩虹+彩虹清全屏。闯关（棋盘固定 8×9，40 关，打完在后 20 关循环）：有限步数内收集指定颜色 / 打碎冰（1–2 层）/ 砸开锁链（锁住的星星不能换也不会掉，上面的会斜着滑下来补位）；过关后剩余步数变成直线星放掉再换分。无尽：步数用完结束，每消够一定颗数送 3 步，要的颗数越来越多（`ENERGY_START` / `ENERGY_STEP`）。闯关和无尽用顶上的分段按钮切，各自存档。**规则全在 logic.js（不碰界面，Node 能跑）**：`play(s, a, b)` 一口气算完连锁、状态立刻是最终结果（马上存档），返回事件列表（swap / clear / fall / shuffle / bonus），game.js 只照着事件放动画，所以 `s` 总是比画面快一拍，画面上的星星在 `vis`（id → V）、冰在 `visIce`。**每关步数 `MOVES` 是机器人试打定的**：`node games/starmatch/tools/bot.mjs 60`（每一步用另一个随机种子试所有走法，不偷看真正掉什么），改了图案或目标要重跑，把最后输出的建议抄进 levels.js。4 种颜色连锁太夸张（平均一步消 22 颗），所以关卡最少 5 色。fx.js 特效（粒子、光束、冲击波、闪电、飞向目标的星星），sfx.js 合成音效。`window.__starmatch`（`freeze()` 后 `await step(秒, 帧数)` 手动走帧；`startLevel(n)`、`startInf()`、`tryMove(a, b)`、`bestMove()`、`redraw()`；**frozen 时 evaluate 别直接 return startLevel 的 Promise，会死等**）。第一次玩第 1 关有手指示范（`game.starmatch.tutored`）|
| chat | 聊天 | 不是游戏，是 gray 写「捡手机文学」用的聊天页：**两边的消息都是他自己发**。界面是**原创的白底蓝气泡**（gray 一开始要一模一样的微信，Claude 没做：做到分不出来，截图就能当真聊天记录用；他同意改成「像某个聊天软件、但说不出是哪个」，**以后也别改成像任何真实 App 的样子**，也不要加红包、转账这类钱的东西）。DOM 做的，不是 canvas。根页面两个标签：消息列表（按最后一条「时间」标记排序，置顶在前；左滑出 标为未读 / 置顶 / 删除；搜索；草稿显示「[草稿]」）和「我」（我的头像名字、浅色 / 深色 / 跟随系统、默认聊天背景、我的表情）。聊天页：**点输入框左边的小头像、或点聊天里谁的头像 / 谁的文字气泡就换成谁说话**，双击头像 = 原来说话的人拍一拍他（说话的人不变）。长按消息出黑色图标菜单：复制、编辑、转文字、引用、换边、撤回（右边的人撤回有「重新编辑」）、恢复、插入（虚线标出插到哪儿，新消息连着往那儿插）、发送失败（红色感叹号）、删除。加号面板：相册（多选，存成 JPEG）、语音（1–60 秒 + 可选转文字，左边的有未读红点，点了会「播放」动画但没声音）、时间（日期 + 时刻 + 快捷按钮，按今天显示成「昨天 / 星期三 / 3月4日」）、小字、拍一拍。表情面板是 gray 自己从相册加的图（GIF 原样留着能动），发出去按表情包大小、不带气泡，长按删。聊天信息页：对方头像 + 备注、标题下的小字（在线 / 对方正在输入…）、「我」用全局资料还是这段对话单独一套、聊天背景（6 个内置 + 相册，深色模式下都有暗版本）、置顶、列表未读数、清空、删除。头像可以选 8 色文字头像或相册图（圆形裁剪，拖动 + 双指缩放）。页面推入有 iOS 那种滑入 + 左边缘拖回。**数据**：对话和头像（小 JPEG dataURL）在 `game.chat.data`，跟着导出；图片、表情包、相册背景在 IndexedDB `pp-files` 里（键 `chat.m.*`），**不跟着导出**，「抹掉所有内容」会清掉。键盘：读大厅 `window.top.visualViewport`，把 `#vp` 贴到可见区域（`game.js` 的 `fit()`），**没在真 iPhone 上试过**。设置：换行键直接发送、音效。结构：data.js 数据和时间格式、state.js 存档 / 音效 / 查名字、nav.js 页面栈、chat.js 聊天页、info.js 聊天信息页、sheets.js 各种面板、ui.js 通用部件（面板、菜单、确认框、看大图、裁头像）、media.js 图片库。`window.__chat`（`add(name)`、`openChat(id)`、`page.api.send(text,'L'|'R')`、`page.api.place(m)`、`page.api.act(key, m)`）|

设置 App：gray 让删掉的「主屏幕」设置页（连同里面的功能）已经删了，不要再加回来；「通用」里的东西已经并进「关于本机」。主屏幕图标下面不显示名字。

## gray 的偏好（长期有效）

- 永远叫他 **gray**，用中文聊，轻松一点。
- 不确定的地方用**提问工具**问（给选项，推荐的放第一个）；小事自己拿主意。**别自作主张加花样**（gray：「不要给我你的小巧思」）：他没要的新玩法、新机制先问；细节他说了自己定才自己定，定了的在汇报里说清楚。
- **质量第一**：每个游戏都要有画面质感、体积感、顺滑动画、音效、手感；以 倒水 / 切水果 为标准。不糊弄、不做半成品。旧游戏以后也可能被要求按这个水准重做。
- 美术全部原创；可以去搜原版游戏学玩法和风格，但不照抄素材。没有广告。
- 中途退出能接着玩；回主屏幕自动暂停；能调的放设置；第一次玩有简单提示（滚滚球例外：gray 不要新手提示，也不要「继续上一局」）。
- **README 不要每次改**，等游戏做得差不多了一口气重写。
- 扫雷、色感的 logo 以后统一重做，他没说之前别动。

## 待办 / 以后再说

- [ ] 滚滚球：等 gray 真机反馈（速度、换道手感/灵敏度、难度）再调。别再加回跳跃和新手引导，轨道保持 4 条、换道吸附。丛林狂奔已按 gray 要求删掉，不要再加回来。
- [ ] README 一口气重写（等 gray 说）。
- [ ] 扫雷、色感的 logo 重做（等 gray 说）。
- [ ] 远端还留着测试用的 `claude-push-test` 分支和 PR #1，可以清理（先问 gray）。
- [ ] 螺旋跳跃：等 gray 真机反馈（灵敏度、弹跳节奏、难度曲线、配色）再调。
- [ ] 别踩白块：等 gray 真机反馈（街机速度曲线、敲击声、块的高度）再调。只要经典和街机两个模式，别自己加禅 / 极速。
- [x] 单词：2026-10-29 gray 真机走 Edge 中转读到了自己的数据（Vercel 项目 `game-over-memo-123sdgv`）。
- [ ] 单词：等 gray 用几天的反馈（看他想加什么图、哪块没数据）。
- [ ] 打罐子：等 gray 真机反馈（手感：子弹力道、重力、准星离手指多远；难度：三星发数；iPhone 上的帧率，卡的话先试省电模式）再调。别加「点哪打哪」，只用准星。
- [ ] 便便超人：等 gray 真机反馈（音效 Claude 听不到、招式节奏、哪招不够好笑）。只做解压玩具，别自己加闯关和评分。原版截图 Claude 看不到，画风是照文字描述做的，gray 觉得不像就再调。
- [ ] 整蛊火柴人：等 gray 真机反馈（横屏在主屏幕 App 里到底是系统转还是界面自己转；音效 Claude 听不到；圆盘手感；绳子、气球、水好不好玩；躲避成功率）。外壳是黑白的老 Windows，他想要灰色 + 蓝标题栏的 Win95 就只改 style.css 和 `#desk` 的底纹。只做沙盒，别自己加关卡和评分。
- [ ] 整蛊火柴人：gray 想让钉子、绳子也能作用于脑袋（现在只认手腕和脚踝）。**他说先记着别做，等他想法多了一起做**，他没提之前别动。真机上玩出来的「人头气球」（断下来的一截很轻，一个气球就拎走）和「绳子把身体抻长」都是规则凑出来的，gray 觉得好玩（还开玩笑说能 cos 伊藤润二《首吊气球》），别当 bug 修掉。
- [ ] 星星消消乐：等 gray 真机反馈（难度：现在的步数机器人几乎都能过，人打起来松紧要看他；音效 Claude 听不到；iPhone 上的帧率，卡的话先调少碎星星）。别自己加三星评价、道具、关卡地图，他没要。
- [ ] 聊天：等 gray 真机反馈（**键盘弹起时输入栏有没有贴着键盘**、长按 / 双击手感、气泡和字号像不像真的聊天软件、音效 Claude 听不到）。他说的是「捡手机文学写小说」，没要群聊、朋友圈、通讯录，别自己加；以后想加先问。
- [ ] 有些游戏的 stats 没记 `played`（倒水、方块、消灭星星、切水果、假条），所以设置首页「共玩了 N 局」偏少，以后可以补上。
