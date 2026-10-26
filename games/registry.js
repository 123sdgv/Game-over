/**
 * 游戏清单 —— 加新游戏只需要两步：
 *   1. 在 games/ 下新建一个文件夹（index.html + style.css + game.js + icons/）
 *   2. 在下面的数组里加一项
 *
 * 字段说明
 *   id        唯一英文名，也用作存档的键
 *   name      主屏幕上显示的名字
 *   path      文件夹路径（以 / 结尾），入口固定是 index.html
 *   icons     图标（相对 path）；写一个就够，写多个时设置里可以切换
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
    icons: ['icons/mine.svg'],
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
    icons: ['icons/grid.svg'],
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
  {
    id: 'watersort',
    name: '倒水',
    path: 'games/watersort/',
    icons: ['icons/layers.svg'],
    settingsNote: '闯关：改动从下一关开始生效。无限模式：固定 15 个瓶子，改动在重新开始后生效。还没倒过的话会立刻换成新的。',
    settings: [
      { key: 'hidden', label: '下层颜色先藏起来', type: 'toggle', default: true },
      { key: 'extra', label: '每关可以加一个空瓶', type: 'toggle', default: true },
      { key: 'capacity', label: '每瓶几格', type: 'stepper', min: 3, max: 6, default: 4, unit: ' 格' },
      { key: 'empty', label: '空瓶', type: 'stepper', min: 1, max: 3, default: 2, unit: ' 个', sub: '只有 1 个时颜色一多会出不了题，会自动多给一个' },
      { key: 'maxColors', label: '最多颜色', type: 'stepper', min: 4, max: 12, default: 10, unit: ' 种', sub: '关卡越往后颜色越多，到这里封顶' },
    ],
    presets: [
      { label: '轻松', values: { hidden: false, capacity: 4, empty: 2, maxColors: 7 }, note: '不藏颜色，最多 7 种' },
      { label: '标准', values: { hidden: true, capacity: 4, empty: 2, maxColors: 10 }, note: '藏颜色，最多 10 种' },
      { label: '烧脑', values: { hidden: true, capacity: 5, empty: 2, maxColors: 12 }, note: '每瓶 5 格，最多 12 种' },
    ],
    stats: [
      { key: 'level', label: '当前关卡' },
      { key: 'cleared', label: '已通关' },
      { key: 'infBest', label: '无限模式最多' },
    ],
  },
  {
    id: 'blocks',
    name: '方块',
    path: 'games/blocks/',
    icons: ['icons/tee.svg'],
    settingsNote: '改动从下一局生效；这一局还没开始的话会立刻换。闯关会随关卡慢慢加颜色、加速度，这里的颜色和速度是起点和上限。',
    settings: [
      { key: 'cols', label: '每行几格', type: 'stepper', min: 6, max: 10, default: 8, unit: ' 格' },
      { key: 'rows', label: '一共几行', type: 'stepper', min: 12, max: 20, default: 16, unit: ' 行' },
      { key: 'speed', label: '下落速度', type: 'stepper', min: 1, max: 10, default: 3, sub: '无限模式每消 8 行还会再快一档' },
      { key: 'colors', label: '颜色种类', type: 'stepper', min: 2, max: 5, default: 3, unit: ' 种' },
      { key: 'layers', label: '无限模式开局彩色行', type: 'stepper', min: 2, max: (s) => Math.min(10, s.rows - 6), default: 4, unit: ' 行' },
      { key: 'ghost', label: '显示落点', type: 'toggle', default: true },
    ],
    presets: [
      { label: '轻松', values: { speed: 2, colors: 2 }, note: '慢一点，2 种颜色' },
      { label: '标准', values: { speed: 3, colors: 3 }, note: '3 种颜色' },
      { label: '烧脑', values: { speed: 5, colors: 4 }, note: '快，4 种颜色' },
    ],
    stats: [
      { key: 'level', label: '当前关卡' },
      { key: 'cleared', label: '已通关' },
      { key: 'infBest', label: '无限模式最高分' },
    ],
  },
  {
    id: 'popstar',
    name: '消灭星星',
    path: 'games/popstar/',
    icons: ['icons/star.svg'],
    settingsNote: '改动从下一盘开始生效；这一盘还没动过的话会立刻换。闯关的目标分会按格子数量自动调整。',
    settings: [
      { key: 'cols', label: '每行几颗', type: 'stepper', min: 6, max: 12, default: 10, unit: ' 颗' },
      { key: 'rows', label: '一共几行', type: 'stepper', min: 6, max: 14, default: 10, unit: ' 行' },
      { key: 'colors', label: '颜色种类', type: 'stepper', min: 3, max: 6, default: 5, unit: ' 种' },
      { key: 'confirm', label: '点两下才消除', type: 'toggle', default: true },
      { key: 'riseEvery', label: '无尽模式每几步升一行', type: 'stepper', min: 1, max: 6, default: 3, unit: ' 步' },
      { key: 'sound', label: '音效', type: 'toggle', default: true },
    ],
    presets: [
      { label: '轻松', values: { colors: 4, riseEvery: 4 }, note: '4 种颜色，慢慢升' },
      { label: '经典', values: { cols: 10, rows: 10, colors: 5, riseEvery: 3 }, note: '10×10，5 种颜色' },
      { label: '烧脑', values: { colors: 6, riseEvery: 2 }, note: '6 种颜色，升得快' },
    ],
    stats: [
      { key: 'level', label: '当前关卡' },
      { key: 'bestLevel', label: '最远到过' },
      { key: 'best', label: '闯关最高分' },
      { key: 'infBest', label: '无尽最高分' },
    ],
  },
  {
    id: 'fruit',
    name: '切水果',
    path: 'games/fruit/',
    icons: ['icons/slice.svg'],
    settingsNote: '改动从下一局开始生效。',
    settings: [
      { key: 'time', label: '限时模式时长', type: 'stepper', min: 30, max: 120, step: 10, default: 60, unit: ' 秒' },
      { key: 'bombs', label: '限时模式有炸弹', type: 'toggle', default: true },
      { key: 'specials', label: '限时模式有特殊水果', type: 'toggle', default: true },
      { key: 'lives', label: '闯关可以漏几个', type: 'stepper', min: 1, max: 5, default: 3, unit: ' 个' },
      { key: 'speed', label: '水果速度', type: 'stepper', min: 1, max: 5, default: 3, sub: '3 是正常速度' },
      { key: 'sound', label: '音效', type: 'toggle', default: true },
    ],
    stats: [
      { key: 'arcadeBest', label: '限时最高分' },
      { key: 'level', label: '当前关卡' },
      { key: 'cleared', label: '已通关' },
    ],
  },
  {
    id: 'leave',
    name: '假条',
    path: 'games/leave/',
    icons: ['icons/leave.svg'],
    settingsNote: '到了设定那天的 0 点自动加上；隔了几周才打开的话，会把这几周的一起补上。数量最少是 0。',
    settings: [
      { key: 'perWeek', label: '每周自动加', type: 'stepper', min: 1, max: 10, default: 2, unit: ' 张' },
      { key: 'weekday', label: '在每周几加', type: 'stepper', min: 1, max: 7, default: 1, display: (v) => ['周一', '周二', '周三', '周四', '周五', '周六', '周日'][v - 1] },
    ],
    stats: [
      { key: 'granted', label: '自动加过' },
      { key: 'used', label: '用掉过' },
    ],
  },
  {
    id: 'merge',
    name: '合成大西瓜',
    path: 'games/merge/',
    icons: ['icons/melon.png'],
    settingsNote: '两个一样的水果碰到一起会合成更大的：葡萄 → 樱桃 → 橙子 → 柠檬 → 猕猴桃 → 桃子 → 菠萝 → 半个西瓜 → 西瓜。合出西瓜它就会消失，腾出地方继续玩。堆过红线超过两秒就结束。',
    settings: [
      { key: 'dropMax', label: '掉下来的水果最大到', type: 'stepper', min: 3, max: 6, default: 5, display: (v) => ['葡萄', '樱桃', '橙子', '柠檬', '猕猴桃', '桃子'][v - 1] },
      { key: 'guide', label: '显示瞄准线', type: 'toggle', default: true },
      { key: 'sound', label: '音效', type: 'toggle', default: true },
    ],
    stats: [
      { key: 'best', label: '最高分' },
      { key: 'melons', label: '合出西瓜' },
      { key: 'played', label: '已玩局数' },
    ],
  },
  {
    id: 'runner',
    name: '丛林狂奔',
    path: 'games/runner/',
    icons: ['icons/path.svg'],
    settingsNote: '跑得越远越快。分数 = 跑的米数 + 金币 × 10。倾斜吃金币第一次会请你允许使用手机的动作传感器。',
    settings: [
      { key: 'tilt', label: '倾斜手机吃金币', type: 'toggle', default: true },
      { key: 'tiltSens', label: '倾斜灵敏度', type: 'stepper', min: 1, max: 5, default: 3 },
      { key: 'startSpeed', label: '起跑速度', type: 'stepper', min: 1, max: 5, default: 3, sub: '3 是正常速度' },
      { key: 'lowPower', label: '省电模式', type: 'toggle', default: false },
      { key: 'sound', label: '音效', type: 'toggle', default: true },
    ],
    stats: [
      { key: 'best', label: '最高分' },
      { key: 'bestDist', label: '最远（米）' },
      { key: 'coins', label: '一共吃到金币' },
      { key: 'played', label: '跑了几次' },
    ],
  },
];
