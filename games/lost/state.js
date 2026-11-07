// 存档、时钟、事件。整局只有一份存档：game.lost.case
import { hub } from '../_shared/hub.js';
import { sound } from '../_shared/sound.js';

export const hb = hub('lost');
export let SET = hb.settings();

const VERSION = 1;
const fresh = () => ({
  v: VERSION,
  phase: 'intro',        // intro → back → lock → home → ending → wiped
  playMs: 0,             // 拿起手机以后玩了多久（回主屏幕时不算）
  flags: {},             // phone / notes / mail / echo / key：解开时的 playMs
  clues: {},             // 线索 id → 第几条
  fresh: [],             // 线索本里还没看过的
  deds: {},              // 想通的推理
  concl: {},             // 有了的想法
  freshConcl: [],
  read: {},              // 每段聊天读到了第几条
  live: {},              // 已经冒出来的消息：id → 当时的游戏时间
  seen: {},              // 看过的东西（照片、邮件、备忘录…）用来去掉小红点
  talk: { log: [], asked: [] },
  hints: { used: 0, tier: {} },
  wrong: 0, lockUntil: 0,
  ball: { side: 1, y: 0.62 },
  tips: {},
  ending: null,
});

export let S = hb.load('case', null);
if (!S || S.v !== VERSION) S = fresh();

// 设置里打开「重新捡起这台手机」：清空进度，再把开关拨回去
if (SET.reset) {
  S = fresh();
  try {
    const k = 'pp.game.lost.settings';
    const cur = JSON.parse(localStorage.getItem(k) || '{}');
    cur.reset = false;
    localStorage.setItem(k, JSON.stringify(cur));
  } catch {}
  SET = hb.settings();
}

let saveT = 0;
export function save(now = false) {
  clearTimeout(saveT);
  if (now) hb.save('case', S);
  else saveT = setTimeout(() => hb.save('case', S), 250);
}
export function resetAll() {
  S = fresh();
  hb.save('case', S);
}

// ── 简单事件 ──
const subs = {};
export const on = (ev, f) => { (subs[ev] ||= []).push(f); };
export const emit = (ev, ...a) => { (subs[ev] || []).forEach((f) => f(...a)); };

// ── 设置 ──
export function applySettings() {
  sound.enabled = SET.sound;
  document.documentElement.style.setProperty('--fs', [0.92, 1, 1.1][SET.textSize - 1] || 1);
}
hb.onSettings((s) => { SET = s; applySettings(); emit('settings'); });

// ── 记录 ──
export function stat(fn) {
  const st = hb.stats();
  fn(st);
  hb.saveStats(st);
}

// ── 时钟：从 11月6日 23:47 开始，跟着真实时间走 ──
export const START_MIN = 23 * 60 + 47;                 // 11月6日当天的分钟数
export const gameMin = () => START_MIN + Math.floor(S.playMs / 60000);
export function clock(min = gameMin()) {
  const day = 6 + Math.floor(min / 1440);
  const m = min % 1440;
  const hh = Math.floor(m / 60), mm = m % 60;
  return { day, hh, mm, text: `${hh}:${String(mm).padStart(2, '0')}`, date: `2026-11-${String(day).padStart(2, '0')}`, stamp: `2026-11-${String(day).padStart(2, '0')} ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}` };
}
const WEEK = ['日', '一', '二', '三', '四', '五', '六'];
export const weekday = (d) => WEEK[new Date(d + 'T12:00:00').getDay()];

let running = false, last = 0, raf = 0;
export function startClock() {
  if (running) return;
  running = true;
  last = performance.now();
  tick();
}
export function stopClock() { running = false; clearTimeout(raf); }
function tick() {
  if (!running) return;
  const now = performance.now();
  const before = gameMin();
  S.playMs += Math.min(5000, now - last);  // 卡顿或者后台回来，最多算 5 秒
  last = now;
  if (gameMin() !== before) { emit('minute'); save(); }
  emit('tick');
  raf = setTimeout(tick, 1000);
}
export const minutesSince = (flag) => (S.flags[flag] == null ? -1 : (S.playMs - S.flags[flag]) / 60000);
export const playMin = () => S.playMs / 60000;
