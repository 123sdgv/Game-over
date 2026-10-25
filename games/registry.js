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
  {
    id: 'colorspot',
    name: '色感',
    path: 'games/colorspot/',
    icons: ['icons/grid.svg', 'icons/sunset.svg', 'icons/mono.svg'],
    settingsNote: '改动从下一局开始生效。难度会随答对的次数慢慢上升：格子变多、颜色差别变小。',
    settings: [
      { key: 'time', label: '开始时间', type: 'stepper', min: 10, max: 120, step: 5, default: 30, unit: ' 秒' },
      { key: 'bonus', label: '答对加时', type: 'stepper', min: 0, max: 10, default: 2, unit: ' 秒' },
      { key: 'penalty', label: '点错扣时', type: 'stepper', min: 0, max: 10, default: 3, unit: ' 秒', sub: '设为 0 就不扣' },
      { key: 'maxSize', label: '最多格子', type: 'stepper', min: 3, max: 10, default: 8, display: (v) => `${v}×${v}`, sub: '难度上升到这里就不再加格子' },
      { key: 'startSize', label: '起始格子', type: 'stepper', min: 2, max: (s) => Math.min(6, s.maxSize), default: 2, display: (v) => `${v}×${v}` },
    ],
    presets: [
      { label: '轻松', values: { time: 45, bonus: 3, penalty: 1, startSize: 2, maxSize: 6 }, note: '45 秒，答对 +3' },
      { label: '标准', values: { time: 30, bonus: 2, penalty: 3, startSize: 2, maxSize: 8 }, note: '30 秒，答对 +2' },
      { label: '挑战', values: { time: 20, bonus: 1, penalty: 5, startSize: 4, maxSize: 10 }, note: '20 秒，答对 +1' },
    ],
    stats: [
      { key: 'played', label: '已玩局数' },
      { key: 'best', label: '最高分' },
      { key: 'last', label: '上一局' },
    ],
  },
];
