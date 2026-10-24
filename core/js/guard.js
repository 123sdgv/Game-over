// 防沉迷：连续使用满 30 分钟锁定 30 分钟；中途离开满 10 分钟，连续计时清零
import { store, emit } from './store.js';
import { h, fmtTime } from './ui.js';
import { goHome } from './apps.js';

export const RULES = { limit: 30 * 60e3, rest: 10 * 60e3, lock: 30 * 60e3 };
const TICK = 5000;

const today = () => { const d = new Date(); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };

function load() {
  return { used: 0, last: 0, lockUntil: 0, days: {}, ...store.get('guard', {}) };
}
let s = load();
const save = () => store.set('guard', s);

export const guardState = () => {
  s = load();
  // 读取时也按"离开满 10 分钟清零"计算，设置页显示才准确
  const idle = Date.now() - s.last;
  return { ...s, used: s.last && idle > RULES.rest ? 0 : s.used, locked: Date.now() < s.lockUntil };
};

function tick() {
  if (document.hidden) return;
  s = load();
  const now = Date.now();
  if (now < s.lockUntil) { showLock(); return; }
  const gap = s.last ? now - s.last : 0;
  if (!s.last || gap > RULES.rest) s.used = 0;
  else if (gap <= TICK * 2) {
    s.used += gap;
    const k = today();
    s.days[k] = (s.days[k] || 0) + gap;
  }
  // 只保留最近 14 天
  const ks = Object.keys(s.days);
  if (ks.length > 14) ks.slice(0, ks.length - 14).forEach((k) => delete s.days[k]);
  s.last = now;
  if (s.used >= RULES.limit) {
    s.used = 0;
    s.lockUntil = now + RULES.lock;
    save();
    showLock();
    return;
  }
  save();
  emit('guard', s);
}

let lockEl = null, lockTimer = null;
function showLock() {
  if (lockEl) return;
  goHome({ instant: true });
  const ringLen = 2 * Math.PI * 52;
  const ring = h('div', { class: 'lock-ring', html: `<svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="52" class="track"/><circle cx="60" cy="60" r="52" class="prog" stroke-dasharray="${ringLen}" stroke-dashoffset="0"/></svg>` });
  const time = h('div', { class: 'lock-time' });
  ring.append(time);
  lockEl = h('div', { class: 'lock', role: 'alertdialog', 'aria-label': '防沉迷锁定' },
    h('div', { class: 'lock-inner' },
      ring,
      h('div', { class: 'lock-title' }, '休息一下'),
      h('div', { class: 'lock-msg' }, '已经连续玩了 30 分钟。站起来走走，看看远处，倒计时结束后再回来。')));
  document.getElementById('device').append(lockEl);
  const prog = ring.querySelector('.prog');
  const update = () => {
    const left = load().lockUntil - Date.now();
    if (left <= 0) { hideLock(); return; }
    time.textContent = fmtTime(left);
    prog.setAttribute('stroke-dashoffset', String(ringLen * (1 - left / RULES.lock)));
  };
  update();
  lockTimer = setInterval(update, 1000);
}
function hideLock() {
  clearInterval(lockTimer);
  if (!lockEl) return;
  const el = lockEl; lockEl = null;
  el.classList.add('out');
  setTimeout(() => el.remove(), 400);
  s = load(); s.last = Date.now(); s.used = 0; save();
}

export function initGuard() {
  tick();
  setInterval(tick, TICK);
  document.addEventListener('visibilitychange', tick);
}
