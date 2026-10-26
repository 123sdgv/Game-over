// 假条模拟器：显示可用的假条数量，手动加减；每周固定的一天 0 点自动加几张。
// 和原来的版本相比改了这几处：
//   · 自动加的时间：原来是"从第一次打开的那一刻算起，每满 7 天"，现在固定在每周几的 0 点（默认周一，设置里可以改）。
//   · 最少减到 0，不会出现负数。
//   · 数据存在大厅里，会跟着 设置 → 关于本机 → 导出数据 一起备份。
//   · 标题栏的 _ 和 × 可以关掉窗口回到主屏幕。
import { hub } from '../_shared/hub.js';

const hb = hub('leave');
const $ = (id) => document.getElementById(id);
const DAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
const MAX = 999;

let cfg = hb.settings();
let state = loadState();

function loadState() {
  let s = hb.load('state', null);
  if (s && Number.isFinite(s.count) && Number.isFinite(s.lastCheck)) return s;
  // 第一次打开：如果同一个网站上用过原来的「假条模拟器」，把数量接过来
  let count = 0;
  try {
    const old = localStorage.getItem('jiatiao_sim_count');
    if (old !== null) count = Math.max(0, Math.min(MAX, parseInt(old, 10) || 0));
  } catch {}
  s = { count, lastCheck: Date.now() };
  hb.save('state', s);
  return s;
}
const save = () => hb.save('state', state);

/** 严格晚于 t 的下一个「每周几 0 点」（按手机本地时间） */
export function nextGrant(t, weekday) {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  const want = weekday % 7; // 设置里 1 = 周一 … 7 = 周日；Date.getDay() 里 0 是周日
  d.setDate(d.getDate() + ((want - d.getDay() + 7) % 7));
  if (d.getTime() <= t) d.setDate(d.getDate() + 7);
  return d.getTime();
}

/** 结算：上次检查之后又过了几个「每周几 0 点」，每个加几张 */
function settle() {
  const now = Date.now();
  if (now < state.lastCheck) return; // 手机时间被往回调了：等真正的时间追上来再算
  let k = 0;
  for (let b = nextGrant(state.lastCheck, cfg.weekday); b <= now && k < 520; b = nextGrant(b, cfg.weekday)) k++;
  if (!k) return;
  const add = k * cfg.perWeek;
  state.count = Math.min(MAX, state.count + add);
  state.lastCheck = now;
  save();
  const st = hb.stats();
  st.granted = (st.granted || 0) + add;
  hb.saveStats(st);
}

function render() {
  $('counter').textContent = state.count;
  $('btn-minus').disabled = state.count <= 0;
  $('btn-plus').disabled = state.count >= MAX;
  $('rule-tip').textContent = `每${DAYS[cfg.weekday - 1]} +${cfg.perWeek}`;
}

function change(delta) {
  settle();
  const next = Math.max(0, Math.min(MAX, state.count + delta));
  if (next === state.count) {
    const w = $('win');
    w.classList.remove('shake'); void w.offsetWidth; w.classList.add('shake');
    return;
  }
  if (delta < 0) { const st = hb.stats(); st.used = (st.used || 0) + 1; hb.saveStats(st); }
  state.count = next;
  save();
  render();
}

$('btn-plus').addEventListener('click', () => change(1));
$('btn-minus').addEventListener('click', () => change(-1));
$('btn-close').addEventListener('click', () => hb.home());
$('btn-min').addEventListener('click', () => hb.home());

// 底部状态栏实时显示时间，顺带检查是不是到了加假条的时候
function tick() {
  const now = new Date();
  const p = (n) => String(n).padStart(2, '0');
  $('current-time').textContent = `${now.getFullYear()}/${p(now.getMonth() + 1)}/${p(now.getDate())} ${p(now.getHours())}:${p(now.getMinutes())}:${p(now.getSeconds())}`;
  settle();
  render();
}

hb.onSettings((next) => { cfg = next; render(); });
hb.onResume(tick);
document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });
tick();
setInterval(tick, 1000);
