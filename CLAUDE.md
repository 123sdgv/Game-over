# Game Over 开发手册

这份是写给接手开发的 Claude 看的。每个新对话开工前先读一遍。**做完一个新游戏、或者 gray 提了新的长期要求，就顺手更新这份文件**（尤其是「现有游戏」和「待办」），下一个对话才接得上。

## 概况

- 这是一个「手机里的手机」小游戏大厅：打开后像一台 iPhone，有主屏幕、Dock、设置 App，每个游戏是一个 App。
- 主人 gray 把它「添加到主屏幕」后在 iPhone 上全屏玩，所以**一切以 iPhone 竖屏触摸为准**（测试用 390×844）。
- 纯静态网站，没有构建步骤、没有 npm 依赖，ES module 直接跑。GitHub Pages：https://123sdgv.github.io/Game-over/
- **`.nojekyll` 必须保留**，不然 Pages 会忽略 `games/_shared`，大厅整个白屏。
- 所有数据只存在浏览器 localStorage 里（前缀 `pp.`），设置 → 关于本机 可以导出 / 导入 / 抹掉。

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
   - `settingsNote`：设置页底部的一段说明（改动什么时候生效、规则一句话）
   - `settings`：只支持两种 `type`
     - `toggle`：`{ key, label, type: 'toggle', default }`
     - `stepper`：`{ key, label, type: 'stepper', min, max, default, step?, unit?, display?(v)=>文字, sub?:小字说明 }`，`max` 可以写成函数 `(s) => ...` 依赖别的设置
     - 注释里提到的 `choice` **没有实现**，要用得先去 settings.js 里写
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

## 提交

- 直接推 `main`，不开 PR。commit 作者用 gray 的 GitHub 账号 `123sdgv`，邮箱用 llam1134@outlook.com（gray 说的；项目说明里写的 kaslhbuu 是旧的），commit 信息结尾加会话给的 Co-Authored-By 等署名行。

```bash
git add -A && git -c user.name="123sdgv" -c user.email="<gray 的邮箱>" commit -q -m "..." \
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
| roll | 滚滚球 | three.js 3D：悬浮方块拼成的 **4 条轨道** + 蓝天白云。按住左右拖，**一格一格吸附换道**（手指挪过约 0.6 格才换，有回差防抖；球只停在轨道正中，不能卡在两格之间擦边）；躲块块、绕开洞、吃金币；**没有跳跃、没有新手引导、开始界面下面没有说明小字**（gray 真机试过后要求的）；手指划过有切水果那样的白色刀光（trail.js，读 getCoalescedEvents）；块块：方块 / 墙开口 / 高柱左右绕 / 在两三条轨道间来回滑的块（到头会停一下），每一行都留了空轨道；闯关（种子固定路线）+ 无尽；track.js 同种子同轨道，存档靠种子 + 位置恢复；`window.__roll.step(dt)` 可以无画面快进，`__roll.setLane(n)` 换道，用自动驾驶脚本测过关卡可过 |

设置 App：gray 让删掉的「主屏幕」设置页（连同里面的功能）已经删了，不要再加回来；「通用」里的东西已经并进「关于本机」。主屏幕图标下面不显示名字。

## gray 的偏好（长期有效）

- 永远叫他 **gray**，用中文聊，轻松一点。
- 不确定的地方用**提问工具**问（给选项，推荐的放第一个）；小事自己拿主意。
- **质量第一**：每个游戏都要有画面质感、体积感、顺滑动画、音效、手感；以 倒水 / 切水果 为标准。不糊弄、不做半成品。旧游戏以后也可能被要求按这个水准重做。
- 美术全部原创；可以去搜原版游戏学玩法和风格，但不照抄素材。没有广告。
- 中途退出能接着玩；回主屏幕自动暂停；能调的放设置；第一次玩有简单提示（滚滚球例外，gray 不要）。
- **README 不要每次改**，等游戏做得差不多了一口气重写。
- 扫雷、色感的 logo 以后统一重做，他没说之前别动。

## 待办 / 以后再说

- [ ] 滚滚球：等 gray 真机反馈（速度、换道手感/灵敏度、难度）再调。别再加回跳跃和新手引导，轨道保持 4 条、换道吸附。丛林狂奔已按 gray 要求删掉，不要再加回来。
- [ ] README 一口气重写（等 gray 说）。
- [ ] 扫雷、色感的 logo 重做（等 gray 说）。
- [ ] 远端还留着测试用的 `claude-push-test` 分支和 PR #1，可以清理（先问 gray）。
- [ ] 有些游戏的 stats 没记 `played`（倒水、方块、消灭星星、切水果、假条），所以设置首页「共玩了 N 局」偏少，以后可以补上。
