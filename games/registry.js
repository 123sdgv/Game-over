/**
 * 游戏清单 —— 加新游戏只需要两步：
 *   1. 在 games/ 下新建一个文件夹（index.html + style.css + game.js + icons/）
 *   2. 在下面的数组里加一项
 *
 * 字段说明
 *   id        唯一英文名，也用作存档的键
 *   name      主屏幕上显示的名字
 *   path      文件夹路径（以 / 结尾），入口固定是 index.html
 *   icons     可选图标（相对 path），第一个是默认图标；设置里可以切换
 *   settings  可调设置，设置 → App 里会自动生成对应的界面
 *             type: 'stepper'（加减）| 'toggle'（开关）| 'choice'（选项）
 *             max 可以写成函数，根据其他设置算出上限
 *   presets   一键套用的设置组合（可选），note 是显示在按钮上的说明
 *   stats     设置页里展示的记录（读取 game.<id>.stats）
 */
export const games = [
  {
    id: 'minesweeper',
    name: '扫雷',
    path: 'games/minesweeper/',
    icons: ['icons/mine.svg', 'icons/tiles.svg', 'icons/flag.svg', 'icons/night.svg'],
    settings: [
      { key: 'cols', label: '列数', type: 'stepper', min: 6, max: 12, default: 9 },
      { key: 'rows', label: '行数', type: 'stepper', min: 6, max: 16, default: 12 },
      { key: 'mines', label: '地雷', type: 'stepper', min: 3, max: (s) => Math.floor(s.cols * s.rows * 0.4), default: 16 },
      { key: 'longPress', label: '长按插旗', type: 'toggle', default: true },
    ],
    presets: [
      { label: '轻松', values: { cols: 8, rows: 10, mines: 10 }, note: '8×10，10 雷' },
      { label: '标准', values: { cols: 9, rows: 12, mines: 16 }, note: '9×12，16 雷' },
      { label: '烧脑', values: { cols: 10, rows: 15, mines: 30 }, note: '10×15，30 雷' },
      { label: '极限', values: { cols: 12, rows: 16, mines: 48 }, note: '12×16，48 雷' },
    ],
    stats: [
      { key: 'played', label: '已玩局数' },
      { key: 'won', label: '胜局', format: 'ratio' },
      { key: 'bestStreak', label: '最长连胜' },
      { key: 'best', label: '当前设置最快', format: 'best' },
    ],
  },
];
