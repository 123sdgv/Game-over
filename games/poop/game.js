// 便便超人：没有输赢的解压玩具。点招式糊布偶，长按连放；点超人唱歌；拖布偶可以扔；点空地扔一坨；点牌子起名。
import { hub } from '../_shared/hub.js';
import { sound } from '../_shared/sound.js';
import {
  w, layout, step, render, setSkin, snapshot, restore, hitTestDoll, hitTestHero, hitTestPlaque, say, pick, LINES,
  dollFace, spawn,
} from './world.js';
import { MOVES, queue, enqueue, queueCount, stepQueue } from './moves.js';
import { sfx } from './sfx.js';

const hb = hub('poop');
w.hb = hb;
let S = hb.settings();
w.S = S;
sound.enabled = S.sound;
w.stats = hb.stats() || {};
w.timeScale = [0.8, 1, 1.35][S.speed - 1];
setSkin(S.color);

const stage = document.getElementById('stage');
const cv = document.getElementById('cv');
const ctx = cv.getContext('2d', { alpha: false });
const hud = document.getElementById('hud');
const panel = document.getElementById('panel');
const btnWash = document.getElementById('btnWash');
const btnAuto = document.getElementById('btnAuto');

/* ─────────────── 招式按钮 ─────────────── */

const I = '#1F130C';
// 小便便图标（共用）
const mini = (x, y, s = 1, col = '#8E5B2F') => `<g transform="translate(${x} ${y}) scale(${s})" stroke="${I}" stroke-width="${1.9 / s}" fill="${col}" stroke-linejoin="round"><ellipse cx="0" cy="3" rx="6.4" ry="3.4"/><ellipse cx="0" cy="-.6" rx="4.6" ry="2.8"/><path d="M-2.2-3 C-1.8-5-.6-5.4.4-7 C1.2-5.8 2.6-5 2.2-3 Z"/></g>`;
const line = (d, w2 = 2.2, c = I, extra = '') => `<path d="${d}" fill="none" stroke="${c}" stroke-width="${w2}" stroke-linecap="round" stroke-linejoin="round" ${extra}/>`;
const ICONS = {
  shot: mini(21, 16, 1.25) + line('M3 10h7M1.5 16h8M3 22h7'),
  lob: line('M4 26C7 8 20 4 27 18', 2.2, I, 'stroke-dasharray="1 4.4"') + mini(25, 19, 1.05) + `<path d="M3 28h26" stroke="${I}" stroke-width="2.2" stroke-linecap="round"/>`,
  juggle: mini(16, 9, 1.05) + `<path d="M6 28c0-9 4.5-12 10-12s10 3 10 12z" fill="#D8342B" stroke="${I}" stroke-width="2.2" stroke-linejoin="round"/>` + line('M4 6l3 2M28 6l-3 2'),
  tramp: `<path d="M5 22c6 3.5 16 3.5 22 0" fill="none" stroke="${I}" stroke-width="3" stroke-linecap="round"/><path d="M6 23l-2 6M26 23l2 6" stroke="${I}" stroke-width="2.6" stroke-linecap="round"/>` + mini(16, 10, 1.15) + line('M6 12c0-3 1-4 2-6M26 12c0-3-1-4-2-6'),
  gatling: mini(25, 16, 0.95) + mini(14.5, 16, 0.78) + mini(5.5, 16, 0.6),
  bomb: `<circle cx="14" cy="19" r="9.5" fill="#3A3F4A" stroke="${I}" stroke-width="2.2"/><path d="M9.5 15.5c1-1.6 2.2-2.4 4-2.6" stroke="#fff" stroke-width="2" stroke-linecap="round" fill="none"/><path d="M20 12c2-4 4-5 7-5" fill="none" stroke="${I}" stroke-width="2.4" stroke-linecap="round"/><path d="M27 2.5l1.2 2.9 3 .3-2.3 2 .8 3-2.7-1.6-2.7 1.6.8-3-2.3-2 3-.3z" fill="#E5493E" stroke="${I}" stroke-width="1.5" stroke-linejoin="round"/>`,
  rain: `<path d="M8 19a5 5 0 0 1-.5-10A7 7 0 0 1 21 7.6 5.8 5.8 0 0 1 24.5 19z" fill="#fff" stroke="${I}" stroke-width="2.2" stroke-linejoin="round"/>` + mini(8, 26, 0.55) + mini(16, 27.5, 0.55) + mini(24, 26, 0.55),
  dive: `<path d="M5 6l14 10-6 3z" fill="#D8342B" stroke="${I}" stroke-width="2.1" stroke-linejoin="round"/>` + mini(21, 20, 1.1) + line('M26 26h4M22 29h6'),
  boomerang: line('M23 5c7 6 6 18-5 22', 2.2, I, 'stroke-dasharray="1 4.2"') + `<path d="M23.5 26l-6 1.6 2.6-5.5" fill="none" stroke="${I}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/><ellipse cx="11" cy="11" rx="8" ry="5.4" fill="#8E5B2F" stroke="${I}" stroke-width="2.2"/><path d="M6.5 11c1-2 3-3 5.5-2.6s2.5 3-1 3.6" fill="none" stroke="${I}" stroke-width="1.5" stroke-linecap="round"/>`,
  toilet: `<rect x="3.5" y="5" width="9" height="14" rx="1.5" fill="#fff" stroke="${I}" stroke-width="2.2"/><path d="M12 15h16c0 6-3.5 8-7 9l.5 4h-9l.4-4c-2-1.2-3.1-3-3.4-5.5z" fill="#fff" stroke="${I}" stroke-width="2.2" stroke-linejoin="round"/><path d="M3 8H1" stroke="${I}" stroke-width="2.4" stroke-linecap="round"/><ellipse cx="20" cy="15" rx="7" ry="1.4" fill="#3A3F4A" stroke="${I}" stroke-width="1.5"/>`,
  tornado: line('M6 7h20M9 12.5h15M11 18h10M13 23h6M15 28h2', 2.6),
  softserve: `<path d="M9 16h14l-5.5 14h-3z" fill="#E8B46C" stroke="${I}" stroke-width="2.2" stroke-linejoin="round"/><path d="M8 15c0-3 2.4-3.5 3-4-.4-2.6 2.5-3.4 3.2-3.8.2-1.6 1.3-3 3-4.2.2 1.8 1 3 1.8 4 1.7.7 3 1.8 2.4 4 1.3.7 2.6 1.8 2.6 4z" fill="#8E5B2F" stroke="${I}" stroke-width="2.2" stroke-linejoin="round"/>`,
};
const buttons = {};
for (const m of MOVES) {
  const b = document.createElement('button');
  b.className = 'mv';
  b.dataset.id = m.id;
  b.innerHTML = `<svg viewBox="0 0 32 32" aria-hidden="true">${ICONS[m.id]}</svg><span>${m.name}</span><i class="q"></i>`;
  b.setAttribute('aria-label', m.name);
  panel.append(b);
  buttons[m.id] = b;
  let holdTimer = 0, repeat = false;
  const fire = () => { if (enqueue(m.id)) { sfx.press(); bumpHints('used'); } else sfx.press(); };
  const stopHold = () => { clearTimeout(holdTimer); holdTimer = 0; repeat = false; b.classList.remove('down'); };
  b.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    b.classList.add('down');
    fire();
    holdTimer = setTimeout(() => { repeat = true; holdCheck(); }, 380);
    const holdCheck = () => {
      if (!repeat) return;
      if (!queueCount(m.id) && queue.list.length < 2) enqueue(m.id);
      holdTimer = setTimeout(holdCheck, 120);
    };
  });
  ['pointerup', 'pointercancel', 'pointerleave', 'lostpointercapture'].forEach((t) => b.addEventListener(t, stopHold));
  b.addEventListener('contextmenu', (e) => e.preventDefault());
  b.addEventListener('click', (e) => { if (e.detail === 0) fire(); }); // 键盘按的
}
const refreshQueueUI = () => {
  for (const m of MOVES) {
    const b = buttons[m.id];
    b.classList.toggle('on', queue.current === m.id);
    const n = queueCount(m.id);
    b.querySelector('.q').textContent = n ? String(n) : '';
  }
};
queue.onChange = refreshQueueUI;

btnWash.addEventListener('click', () => {
  queue.list.length = 0;
  queue.auto = false;
  btnAuto.setAttribute('aria-pressed', 'false');
  enqueue('wash');
  sfx.press();
});
btnAuto.addEventListener('click', () => {
  queue.auto = !queue.auto;
  queue.autoT = 0;
  btnAuto.setAttribute('aria-pressed', String(queue.auto));
  sfx.press();
});

/* ─────────────── 布局和主循环 ─────────────── */

function measure() {
  const r = stage.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  const safeT = Math.max(0, hud.offsetTop - 7);
  cv.width = Math.round(r.width * dpr);
  cv.height = Math.round(r.height * dpr);
  layout(r.width, r.height, dpr, safeT);
}
function applySettings(s) {
  const skinChanged = s.color !== S.color;
  S = s;
  w.S = s;
  sound.enabled = s.sound;
  w.timeScale = [0.8, 1, 1.35][s.speed - 1];
  if (skinChanged) setSkin(s.color);
}
hb.onSettings(applySettings);

let last = 0, raf = 0, paused = false;
function frame(ts) {
  raf = 0;
  if (paused) return;
  const dt = Math.min(0.034, last ? (ts - last) / 1000 : 0.016);
  last = ts;
  stepQueue(dt * w.timeScale);
  step(dt);
  render(ctx);
  saveTick(dt);
  raf = requestAnimationFrame(frame);
}
function go() {
  if (paused || raf) return;
  last = 0;
  raf = requestAnimationFrame(frame);
}
function stop() {
  if (raf) cancelAnimationFrame(raf);
  raf = 0;
}

/* ─────────────── 存档和记录 ─────────────── */

function saveNow() {
  if (w.dirty) { hb.save('state', snapshot()); w.dirty = false; }
  if (w.statsDirty) { hb.saveStats(w.stats); w.statsDirty = false; }
}
let saveClock = 0;
function saveTick(dt) {
  saveClock += dt;
  if (saveClock > 1) { saveClock = 0; saveNow(); }
}
function pause() { paused = true; stop(); saveNow(); pressEnd(); }
function resume() { paused = false; if (!document.hidden) go(); }
hb.onPause(pause);
hb.onResume(resume);
document.addEventListener('visibilitychange', () => { if (document.hidden) { stop(); saveNow(); } else go(); });
window.addEventListener('pagehide', saveNow);

/* ─────────────── 舞台手势 ─────────────── */

let press = null;
function pressEnd() {
  if (press && press.mode === 'doll' && w.doll.grabbed) { w.doll.grabbed = false; dollFace('idle', 0.05); }
  press = null;
}
const pt = (e) => {
  const r = cv.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
};
cv.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  try { cv.setPointerCapture(e.pointerId); } catch {}
  const p = pt(e);
  press = { id: e.pointerId, x: p.x, y: p.y, t: performance.now(), moved: false, mode: 'none' };
  if (hitTestPlaque(p.x, p.y)) { press.mode = 'plaque'; w.plaquePressed = 0.16; return; }
  if (hitTestDoll(p.x, p.y)) {
    press.mode = 'doll';
    const d = w.doll;
    press.ox = d.x - p.x; press.oy = d.y - p.y;
    return;
  }
  if (hitTestHero(p.x, p.y)) { press.mode = 'hero'; return; }
  press.mode = 'floor';
});
cv.addEventListener('pointermove', (e) => {
  if (!press || e.pointerId !== press.id) return;
  const p = pt(e);
  if (Math.hypot(p.x - press.x, p.y - press.y) > 7) press.moved = true;
  if (press.mode === 'doll' && press.moved) {
    const d = w.doll;
    if (!d.grabbed) {
      d.grabbed = true;
      dollFace('shock', 99);
      sfx.squeak();
      if (d.line <= 0) { d.line = 2; say('doll', pick(LINES.fly), 1.3); }
    }
    d.gx = p.x + press.ox;
    d.gy = Math.min(p.y + press.oy, w.G);
  }
});
function endPress(e) {
  if (!press || e.pointerId !== press.id) return;
  const p = press;
  press = null;
  const pos = pt(e);
  if (p.mode === 'doll') {
    const d = w.doll;
    if (d.grabbed) {
      d.grabbed = false;
      d.vx = Math.max(-1500 * w.U, Math.min(1500 * w.U, d.vx));
      d.vy = Math.max(-1500 * w.U, Math.min(1500 * w.U, d.vy));
      d.vr += (d.vx / w.U) * 0.012;
      d.wasThrown = true;
      dollFace('wince', 0.5);
      w.stats.throws = (w.stats.throws || 0) + 1;
      w.statsDirty = true;
    } else if (!p.moved) {
      // 戳一下
      d.sv += 2.6;
      d.vr += (pos.x < d.x ? 1 : -1) * 3;
      for (const part of w.dollParts) part.v += (Math.random() - 0.5) * 8;
      sfx.squeak();
      dollFace('wince', 0.45);
      if (d.line <= 0) { d.line = 1.5; say('doll', pick(LINES.poke), 1.2); }
      bumpHints('poked');
    }
    return;
  }
  if (p.moved) return;
  if (p.mode === 'plaque') { openName(); return; }
  if (p.mode === 'hero') {
    if (!queue.current && !queue.list.length) enqueue('sing');
    else if (queue.current !== 'sing' && !queueCount('sing')) enqueue('sing');
    bumpHints('sang');
    return;
  }
  if (p.mode === 'floor') {
    if (!queue.current && !queue.list.length) enqueue('toss', { x: pos.x, y: pos.y });
    bumpHints('tossed');
  }
}
cv.addEventListener('pointerup', endPress);
cv.addEventListener('pointercancel', endPress);
cv.addEventListener('contextmenu', (e) => e.preventDefault());

/* ─────────────── 起名 ─────────────── */

const cardWrap = document.getElementById('cardWrap');
const cardForm = document.getElementById('cardForm');
const nameInput = document.getElementById('nameInput');
function openName() {
  nameInput.value = w.name;
  cardWrap.hidden = false;
  sfx.press();
  bumpHints('named');
  setTimeout(() => { try { nameInput.focus(); nameInput.select(); } catch {} }, 40);
}
function closeName() { cardWrap.hidden = true; nameInput.blur(); setTimeout(() => { const r = stage.getBoundingClientRect(); if (Math.abs(r.height - w.H) > 1 || Math.abs(r.width - w.W) > 1) measure(); }, 320); }
document.getElementById('cardAlt').addEventListener('click', () => { sfx.press(); closeName(); });
cardForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const v = [...nameInput.value.trim()].slice(0, 8).join('');
  if (v) {
    w.name = v;
    w.dirty = true;
    saveNow();
    say('hero', pick(['{name}，你好啊！', '{name}是吧，记住了', '好的{name}，接招吧']), 1.8);
    say('doll', pick(['不要啊', '我不叫这个！', '…能换一个吗']), 1.6);
    sfx.ding();
  }
  closeName();
});

/* ─────────────── 第一次玩的提示 ─────────────── */

const seen = hb.load('hints', {}) || {};
function bumpHints(k) {
  if (seen[k]) return;
  seen[k] = 1;
  hb.save('hints', seen);
}
function* introTips() {
  yield 0.7;
  if (!seen.used) say('hero', '点下面的招式糊它！', 3.2, true);
  yield () => seen.used || queue.current;
  yield () => !queue.current && !queue.list.length;
  if (seen.intro2) return;
  yield 0.2;
  say('hero', '按住招式能连放', 2.4, true);
  yield 2.6;
  say('doll', '别拖我！也别戳我！', 2.4, true);
  yield 2.6;
  if (!seen.named) say('hero', '点墙上的牌子给它起名', 2.6, true);
  yield 2.8;
  say('hero', '点空地扔一坨，点我唱歌', 2.6, true);
  bumpHints('intro2');
}

/* ─────────────── 启动 ─────────────── */

restore(hb.load('state', null));
measure();
// 弹键盘时不重排，关掉以后再量
window.addEventListener('resize', () => { if (cardWrap.hidden) measure(); });
if (!seen.intro2) spawn(introTips());
requestAnimationFrame(() => { measure(); go(); });
refreshQueueUI();

// 测试用钩子
window.__poop = { w, queue, enqueue, MOVES, snapshot, saveNow };
