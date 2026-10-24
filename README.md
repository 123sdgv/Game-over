# Game-over

装在手机里的手机：一个仿 iOS 的小游戏大厅。每个 App 都是一个小游戏。

## 放到手机上

1. 仓库 Settings → Pages → Source 选 `Deploy from a branch`，分支选 `main`，目录选 `/ (root)`。
2. 等一两分钟，用 iPhone 的 Safari 打开 `https://123sdgv.github.io/Game-over/`。
3. 点分享 → 添加到主屏幕。名称默认是一个看不见的空白字符，直接点"添加"。

## 目录

```
index.html              大厅入口
manifest.webmanifest    添加到主屏幕用的配置
core/
  assets/               大厅图标、设置图标
  css/                  base 基础 / home 主屏幕 / window 窗口 / settings 设置 / overlay 弹窗与锁定
  js/
    main.js             启动
    store.js            本地存储（localStorage + IndexedDB）
    apps.js             App 列表、打开与关闭动画、底部横条手势
    home.js             主屏幕网格、Dock、长按整理
    settings.js         设置 App
    wallpaper.js        壁纸
    guard.js            防沉迷
    backup.js           导出 / 导入 / 抹掉
games/
  registry.js           游戏清单（加游戏改这里）
  _shared/
    hub.js              游戏和大厅的连接：读设置、存记录、暂停 / 继续
    base.css            游戏通用样式
  minesweeper/          扫雷
    index.html  style.css  game.js  icons/
```

## 加一个新游戏

1. 复制 `games/minesweeper/` 改名，比如 `games/2048/`，写好 `index.html`、`style.css`、`game.js`，在 `icons/` 里放一个或几个 120×120 的 SVG 图标。
2. 在 `games/registry.js` 的数组里加一项（字段说明在文件顶部）。
3. 刷新，主屏幕上就会多出这个 App；设置 → App 里会自动出现它的设置页。

游戏里通过 `hub.js` 读设置、存记录：

```js
import { hub } from '../_shared/hub.js';
const h = hub('2048');
const s = h.settings();          // registry 里声明的设置
h.saveStats({ ...h.stats(), played: 1 });
h.onPause(() => {});             // 回到主屏幕时
```

## 规则

- 防沉迷：连续使用满 30 分钟锁定 30 分钟；中途离开满 10 分钟，连续计时清零。不能关闭，也不会被"抹掉所有内容和设置"清除。
- 所有数据只存在当前浏览器里。换手机前在 设置 → 通用 → 传输或还原 里导出。
