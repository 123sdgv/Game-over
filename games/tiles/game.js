// 别踩白块：只踩黑块，别碰白块。
//   经典：踩完设定的块数（默认 50），比谁用时最短；「开始」那一块算第 1 块，计时从踩它开始。
//         棋盘不自己动，每踩一块往下挪一行；踩到白块就输。
//   街机：黑块一直往下掉、越踩越快；踩到白块、或者有一块掉出去没踩到，就输。分数 = 踩了几块。
// 暂停 / 回主屏幕 / 读档以后，都要先踩一下标着「继续」的那一块才接着走（经典的计时也停着）。
import { hub } from '../_shared/hub.js';
import { sound } from '../_shared/sound.js';
import { Painter } from './render.js';

const hb = hub('tiles');
const $ = (id) => document.getElementById(id);
let cfg = hb.settings();
sound.enabled = cfg.sound;

const SPEED = [1.8, 2.2, 2.6, 3.0, 3.4, 3.8, 4.3, 4.8, 5.4, 6.0];   // 街机起始速度：每秒往下掉几行
const ACCEL = [0, 0.012, 0.02, 0.028, 0.038, 0.05];                 // 每踩一块再快多少
const VMAX = 13;
const MISS = 1.86;        // 黑块掉到只剩一小截露在外面，就算漏了
const MILESTONE = 50;

/* ======================================================================
   棋盘：每行一块黑块，列是随机的（同一列最多连着两次）
   ====================================================================== */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

class Board {
  constructor(seed, cols, finishAt = Infinity) {
    this.rand = rng(seed);
    this.cols = cols;
    this.finishAt = finishAt;
    this.rows = [];
  }
  row(i) {
    while (this.rows.length <= i) {
      const k = this.rows.length;
      let c = Math.floor(this.rand() * this.cols);
      if (k >= 2 && this.rows[k - 1].col === c && this.rows[k - 2].col === c) c = (c + 1 + Math.floor(this.rand() * (this.cols - 1))) % this.cols;
      this.rows.push({ col: c, state: 0, t: -99, rx: 0, ry: 0 });
    }
    return this.rows[i];
  }
  isFinish(i) { return i >= this.finishAt; }
}

/* ======================================================================
   声音：清脆的敲击，音高随连着踩的块数慢慢往上走（五声音阶，两个八度一轮）
   ====================================================================== */
const PENTA = [0, 2, 4, 7, 9];
const sfx = {
  tap(k) {
    const step = Math.floor(k / 3) % 11;
    const f = 620 * Math.pow(2, (PENTA[step % 5] + 12 * Math.floor(step / 5)) / 12) * (1 + (Math.random() - 0.5) * 0.008);
    sound.tone({ f, to: f * 0.985, dur: 0.1, type: 'sine', vol: 0.24, attack: 0.002 });
    sound.tone({ f: f * 2.76, dur: 0.035, type: 'sine', vol: 0.05, attack: 0.001 });
    sound.hiss({ f: 4200, dur: 0.02, q: 1.4, vol: 0.1, attack: 0.001 });
  },
  fail() {
    sound.tone({ f: 196, to: 92, dur: 0.46, type: 'square', vol: 0.06 });
    sound.tone({ f: 208, to: 98, dur: 0.46, type: 'sawtooth', vol: 0.04 });
    sound.tone({ f: 130, to: 48, dur: 0.32, vol: 0.28 });
    sound.hiss({ f: 1200, to: 200, dur: 0.26, filter: 'lowpass', vol: 0.14 });
  },
  win() {
    sound.arp([784, 988, 1175, 1568], { gap: 0.075, dur: 0.22, type: 'triangle', vol: 0.12 });
    sound.tone({ f: 2093, dur: 0.5, type: 'sine', vol: 0.05, delay: 0.32 });
    sound.hiss({ f: 6000, to: 3000, dur: 0.4, q: 0.8, vol: 0.04, delay: 0.3 });
  },
  milestone() { sound.arp([1047, 1319, 1568], { gap: 0.05, dur: 0.14, type: 'triangle', vol: 0.08 }); },
  click() { sound.tone({ f: 900, dur: 0.04, type: 'triangle', vol: 0.05 }); },
};

/* ======================================================================
   状态
   ====================================================================== */
const R = {
  phase: 'menu',          // menu | ready（等着踩「开始/继续」那块）| play | fail | done
  paused: false,
  mode: 'classic', seed: 1, cols: 4, rows: 4, count: 50, speed: 4, accel: 3,
  board: null,
  pos: 0,                 // 视图位置（行）
  target: 0,              // 经典：pos 要滑到哪
  n: 0,                   // 踩了几块
  first: 0,               // 最下面一块还没踩的行
  elapsed: 0, clockAt: 0, // 经典计时
  v: 0, vPeak: 0,         // 街机速度（行/秒）
  label: '开始',
  fail: null, failPos: 0, shakeT: -9,
  token: 0,
};
let attract = null;       // 开始界面后面自己慢慢滚的棋盘

const fmt = (s) => `${s.toFixed(3)}″`;
const vTarget = () => Math.min(VMAX, SPEED[R.speed - 1] + ACCEL[R.accel] * R.n);
const readyRow = () => (R.mode === 'classic' ? R.n : R.first);

/* ======================================================================
   画面
   ====================================================================== */
const painter = new Painter($('cv'));
let needRender = true;
function relayout() {
  const menu = R.phase === 'menu';
  const bottom = $('probe').getBoundingClientRect().height;
  painter.layout(window.innerWidth, window.innerHeight, bottom, menu ? cfg.cols : R.cols, menu ? cfg.rows : R.rows);
  needRender = true;
}
window.addEventListener('resize', relayout);

function makeAttract() {
  const b = new Board((Math.random() * 1e9) | 0, cfg.cols);
  const a = { board: b, pos: 2.4, next: 0 };
  while (a.next < a.pos + 0.75) { b.row(a.next).state = 1; a.next++; }
  return a;
}

/* ======================================================================
   开一局 / 读档
   ====================================================================== */
function setupGame(run) {
  Object.assign(R, {
    mode: run.mode, seed: run.seed, cols: run.cols, rows: cfg.rows,
    count: run.mode === 'classic' ? run.count : 0,
    speed: run.speed || cfg.speed, accel: run.accel ?? cfg.accel,
    n: 0, first: 0, elapsed: 0, pos: 0, target: 0, v: 0, vPeak: 0, fail: null, shakeT: -9,
  });
  R.board = new Board(run.seed, run.cols, run.mode === 'classic' ? run.count : Infinity);
}

function start(mode) {
  R.token++;
  hideCard(); hideDone();
  hb.save('run', null);
  setupGame({ mode, seed: (Math.random() * 1e9) | 0, cols: cfg.cols, count: cfg.count, speed: cfg.speed, accel: cfg.accel });
  enterReady('开始');
}

function resume(run) {
  R.token++;
  hideCard(); hideDone();
  setupGame(run);
  const b = R.board;
  if (run.mode === 'classic') {
    for (let i = 0; i < run.n; i++) b.row(i).state = 1;
    Object.assign(R, { n: run.n, target: run.n, pos: run.n, elapsed: run.elapsed || 0 });
  } else {
    for (let i = 0; i < run.first; i++) b.row(i).state = 1;
    for (const i of run.tapped || []) b.row(i).state = 1;
    Object.assign(R, { n: run.n, first: run.first, pos: run.first, vPeak: run.vPeak || 0 });
  }
  enterReady('继续');
}

function enterReady(label) {
  document.body.classList.remove('over', 'finished');
  R.phase = 'ready';
  R.paused = false;
  R.label = label;
  document.body.classList.remove('menu-on');
  document.body.classList.toggle('arcade', R.mode === 'arcade');
  $('menu').hidden = true;
  relayout();
  shown = {};
  ui();
  showTip();
}

function saveRun() {
  if (R.phase !== 'play' && R.phase !== 'ready') return;
  if (R.n === 0) { hb.save('run', null); return; }
  if (R.mode === 'classic') {
    hb.save('run', { mode: 'classic', seed: R.seed, cols: R.cols, count: R.count, n: R.n, elapsed: R.elapsed });
  } else {
    const tapped = [];
    for (let i = R.first; i < R.board.rows.length; i++) if (R.board.rows[i].state === 1) tapped.push(i);
    hb.save('run', { mode: 'arcade', seed: R.seed, cols: R.cols, speed: R.speed, accel: R.accel, n: R.n, first: R.first, tapped, vPeak: R.vPeak });
  }
}

/* ======================================================================
   踩
   ====================================================================== */
const cv = $('cv');
cv.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  onTap(e.clientX, e.clientY);
});
cv.addEventListener('contextmenu', (e) => e.preventDefault());

function onTap(x, y) {
  if (R.paused || R.phase === 'menu' || R.phase === 'fail' || R.phase === 'done') return;
  if (y > painter.fb || y < 0) return;
  const now = performance.now() / 1000;
  const col = Math.max(0, Math.min(R.cols - 1, Math.floor(x / painter.colW)));
  // 经典按「滑到位以后」的位置判断（手指总是比动画快一点），街机按画面上的位置
  const ref = R.mode === 'classic' ? R.target : R.pos;
  const i = Math.floor((painter.fb - y) / painter.rowH + ref - 1);
  if (i < 0 || R.board.isFinish(i)) return;
  const row = R.board.row(i);

  if (R.phase === 'ready') {
    if (i === readyRow() && col === row.col) { begin(); hit(i, x, y, now); }
    return;
  }

  if (row.state === 1) return;                       // 已经踩过的这一行，白块也不算错
  if (R.mode === 'classic') {
    if (i < R.n) return;
    if (col === row.col) { if (i === R.n) hit(i, x, y, now); return; }   // 先踩了上面的黑块：不算
    return fail('white', i, col, now);
  }
  if (col === row.col) return hit(i, x, y, now);
  fail('white', i, col, now);
}

function begin() {
  R.phase = 'play';
  R.clockAt = performance.now();
  if (R.mode === 'arcade') R.v = R.n === 0 ? vTarget() : vTarget() * 0.7;   // 接着玩的时候先慢一点
  hb.save(`tip.${R.mode}`, 1);
  hideTip();
}

function hit(i, x, y, now) {
  const r = R.board.row(i);
  r.state = 1;
  r.t = now;
  r.rx = Math.max(12, Math.min(painter.colW - 12, x - r.col * painter.colW));
  r.ry = Math.max(12, Math.min(painter.rowH - 12, y - painter.rowTop(i, R.pos)));
  sfx.tap(R.n);
  R.n++;
  hb.haptic(4);
  if (R.mode === 'classic') {
    R.target = R.n;
    if (R.n >= R.count) return finish();
  } else {
    while (R.board.row(R.first).state === 1) R.first++;
    if (R.n % MILESTONE === 0) milestone();
  }
  if (R.n % 15 === 0) saveRun();
}

function fail(kind, i, col, now) {
  if (R.mode === 'classic' && R.phase === 'play') R.elapsed += Math.max(0, performance.now() - R.clockAt) / 1000;
  R.phase = 'fail';
  R.fail = { kind, row: i, col, t: now };
  R.failPos = i - 0.6;     // 把出错的那一行往上挪一点，别被结算卡片挡住
  R.shakeT = now;
  sfx.fail();
  hb.haptic([30, 40, 60]);
  ui();
  document.body.classList.add('over');
  const f = $('flash'); f.classList.remove('on'); void f.offsetWidth; f.classList.add('on');
  hb.save('run', null);
  const res = record('fail');
  const reason = kind === 'miss' ? '漏掉了一块' : '踩到白块了';
  const tok = R.token;
  setTimeout(() => {
    if (tok !== R.token || R.phase !== 'fail') return;
    if (R.mode === 'classic') {
      showCard({
        title: reason, big: `${R.n} / ${R.count}`,
        meta: `用时 <b>${fmt(R.elapsed)}</b>${res.best ? ` · 最快 <b>${fmt(res.best)}</b>` : ''}`,
        main: ['再试一次', () => start('classic')], alt: ['返回', toMenu],
      });
    } else {
      showCard({
        title: res.record ? '新纪录！' : reason, big: `${R.n}`,
        meta: `${res.record ? reason : `最高 <b>${res.best}</b>`} · 最快 <b>${R.vPeak.toFixed(1)}</b> 块/秒`,
        main: ['再来一局', () => start('arcade')], alt: ['返回', toMenu],
      });
    }
  }, 1050);
}

function finish() {
  R.elapsed += Math.max(0, performance.now() - R.clockAt) / 1000;
  R.phase = 'done';
  R.target = R.count;
  hb.save('run', null);
  const res = record('done');
  sfx.win();
  hb.haptic([15, 40, 15]);
  ui();
  document.body.classList.add('over', 'finished');
  $('doneT').textContent = fmt(R.elapsed);
  $('doneS').textContent = res.record ? '新纪录！' : `${R.count} 块 · 每秒 ${(R.count / R.elapsed).toFixed(1)} 块`;
  const d = $('done'); d.hidden = false; d.classList.remove('on'); void d.offsetWidth; d.classList.add('on');
  const tok = R.token;
  setTimeout(() => {
    if (tok !== R.token || R.phase !== 'done') return;
    hideDone();
    showCard({
      title: res.record ? '新纪录！' : '到终点啦', big: fmt(R.elapsed),
      meta: `${R.count} 块 · 每秒 <b>${(R.count / R.elapsed).toFixed(1)}</b> 块 · 最快 <b>${fmt(res.best)}</b>`,
      main: ['再来一局', () => start('classic')], alt: ['返回', toMenu],
    });
  }, 1500);
}

function milestone() {
  sfx.milestone();
  const el = document.createElement('div');
  el.className = 'pop';
  el.textContent = `${R.n}!`;
  document.body.append(el);
  setTimeout(() => el.remove(), 900);
}

/** 记一局 */
function record(kind) {
  const st = hb.stats();
  st.played = (st.played || 0) + 1;
  st.tiles = (st.tiles || 0) + R.n;
  const out = {};
  if (R.mode === 'classic') {
    st.bests = st.bests || {};
    const prev = st.bests[R.count];
    if (kind === 'done') {
      const ms = Math.round(R.elapsed * 1000);
      if (!prev || ms < prev) st.bests[R.count] = ms;
      out.record = !!prev && ms < prev;
      st.classicBest = `${(st.bests[R.count] / 1000).toFixed(3)} 秒（${R.count} 块）`;
    }
    out.best = st.bests[R.count] ? st.bests[R.count] / 1000 : 0;
  } else {
    const prev = st.arcadeBest || 0;
    st.arcadeBest = Math.max(prev, R.n);
    st.arcadeFastest = Math.max(st.arcadeFastest || 0, Math.round(R.vPeak * 10) / 10);
    out.record = prev > 0 && R.n > prev;
    out.best = st.arcadeBest;
  }
  hb.saveStats(st);
  return out;
}

/* ======================================================================
   界面
   ====================================================================== */
let shown = {};
function ui() {
  let score, sub;
  if (R.mode === 'classic') {
    score = fmt(R.elapsed);
    sub = `${R.n} / ${R.count}`;
  } else {
    score = String(R.n);
    sub = `${(R.phase === 'play' ? R.v : vTarget()).toFixed(1)} 块/秒`;
  }
  if (shown.score !== score) { $('score').textContent = score; shown.score = score; }
  if (shown.sub !== sub) { $('sub').textContent = sub; shown.sub = sub; }
  const p = R.mode === 'classic' ? Math.min(1, R.n / R.count) : 0;
  if (shown.p !== p) { $('progFill').style.transform = `scaleX(${p})`; shown.p = p; }
}

/* ---------- 第一次玩的提示 ---------- */
let tipOn = false;
function showTip() {
  if (R.n > 0 || hb.load(`tip.${R.mode}`, 0)) return hideTip();
  $('tipText').textContent = '只踩黑块，别碰白块';
  $('tipSub').textContent = R.mode === 'classic' ? `从这块踩起，踩完 ${R.count} 块就到终点` : '黑块会越掉越快，漏掉一块也算输';
  $('tip').hidden = false;
  tipOn = true;
}
function hideTip() { $('tip').hidden = true; tipOn = false; }
function placeTip() {
  const el = $('tip');
  const i = readyRow();
  const rect = painter.tileRect(i, R.board.row(i).col, R.pos);
  const w = el.offsetWidth, W = window.innerWidth;
  const cx = rect.x + rect.w / 2;
  const left = Math.max(12, Math.min(W - 12 - w, cx - w / 2));
  el.style.transform = `translate(${left}px, ${rect.y - el.offsetHeight - 14}px)`;
  el.style.setProperty('--ax', `${cx - left}px`);
}

/* ---------- 结算 / 暂停卡片 ---------- */
let cardActions = {};
function showCard({ title, big = '', meta = '', main, alt }) {
  $('cardTitle').textContent = title;
  $('cardBig').textContent = big;
  $('cardMeta').innerHTML = meta;
  $('cardMain').textContent = main ? main[0] : '';
  $('cardAlt').textContent = alt ? alt[0] : '';
  cardActions = { main: main && main[1], alt: alt && alt[1] };
  $('cardWrap').hidden = false;
}
function hideCard() { $('cardWrap').hidden = true; }
function hideDone() { $('done').hidden = true; }
$('cardMain').addEventListener('click', () => { const f = cardActions.main; hideCard(); sfx.click(); if (f) f(); });
$('cardAlt').addEventListener('click', () => { const f = cardActions.alt; hideCard(); sfx.click(); if (f) f(); });

/* ---------- 开始界面 ---------- */
function toMenu() {
  R.token++;
  hideCard(); hideTip(); hideDone();
  R.phase = 'menu';
  R.paused = false;
  document.body.classList.remove('over', 'finished');
  attract = makeAttract();
  document.body.classList.add('menu-on');
  $('menu').hidden = false;
  menuText();
  relayout();
}
function menuText() {
  const st = hb.stats();
  const best = st.bests && st.bests[cfg.count];
  const bits = [];
  if (best) bits.push(`经典最快 ${fmt(best / 1000)}`);
  if (st.arcadeBest) bits.push(`街机最多 ${st.arcadeBest} 块`);
  $('menuSub').textContent = bits.join(' · ');
  $('classicSub').textContent = `踩完 ${cfg.count} 块，越快越好`;
  const run = hb.load('run', null);
  $('goResume').hidden = !run;
  if (run) {
    $('resumeSub').textContent = run.mode === 'classic'
      ? `经典 · ${run.n} / ${run.count} 块 · ${fmt(run.elapsed || 0)}`
      : `街机 · 已踩 ${run.n} 块`;
  }
}
$('goClassic').addEventListener('click', () => { sfx.click(); start('classic'); });
$('goArcade').addEventListener('click', () => { sfx.click(); start('arcade'); });
$('goResume').addEventListener('click', () => { sfx.click(); const run = hb.load('run', null); if (run) resume(run); });

/* ---------- 暂停 ---------- */
function pause() {
  if (R.paused || (R.phase !== 'play' && R.phase !== 'ready')) return;
  if (R.phase === 'play' && R.mode === 'classic') {
    R.elapsed += Math.max(0, performance.now() - R.clockAt) / 1000;
    R.clockAt = performance.now();
  }
  R.paused = true;
  saveRun();
  hideTip();
  ui();
  const cl = R.mode === 'classic';
  showCard({
    title: '已暂停',
    big: cl ? fmt(R.elapsed) : `${R.n}`,
    meta: cl ? `已踩 <b>${R.n}</b> / ${R.count} 块` : `已踩 <b>${R.n}</b> 块 · ${vTarget().toFixed(1)} 块/秒`,
    main: ['继续', () => { last = performance.now(); enterReady(R.n ? '继续' : '开始'); }],
    alt: [R.n ? '结束这局' : '返回', () => {
      hb.save('run', null);
      if (R.n > 0) record('quit');
      toMenu();
    }],
  });
  needRender = true;
}
$('pause').addEventListener('click', (e) => { e.stopPropagation(); sfx.click(); pause(); });
window.addEventListener('keydown', (e) => { if (e.key === 'Escape') pause(); });

// 回到主屏幕：这一局暂停，整个画面也停下来不画（开始界面也一样，省电）
let away = false;
hb.onPause(() => {
  if (R.phase === 'play' || (R.phase === 'ready' && R.n > 0)) pause();
  away = true;
});
hb.onResume(() => { away = false; last = performance.now(); needRender = true; });
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { if (R.phase === 'play') pause(); else saveRun(); }
  else { last = performance.now(); needRender = true; }
});
window.addEventListener('pagehide', saveRun);

hb.onSettings((next) => {
  const old = cfg;
  cfg = next;
  sound.enabled = cfg.sound;
  if (R.phase === 'menu') {
    if (old.cols !== cfg.cols || old.rows !== cfg.rows) attract = makeAttract();
    menuText();
    relayout();
  }
});

/* ======================================================================
   主循环
   ====================================================================== */
const ease = (cur, to, dt, k) => cur + (to - cur) * (1 - Math.exp(-dt * k));

function update(dt, t) {
  const now = t / 1000;
  switch (R.phase) {
    case 'menu': {
      const a = attract;
      a.pos += 1.1 * dt;
      while (a.next < a.pos + 0.75) {
        const r = a.board.row(a.next);
        r.state = 1; r.t = now; r.rx = painter.colW / 2; r.ry = painter.rowH * 0.55;
        a.next++;
      }
      break;
    }
    case 'ready':
      R.pos = ease(R.pos, readyRow(), dt, 14);
      break;
    case 'play':
      if (R.mode === 'classic') {
        R.elapsed += Math.min(0.25, Math.max(0, t - R.clockAt) / 1000);
        R.clockAt = t;
        R.pos = ease(R.pos, R.target, dt, 30);
      } else {
        R.v = ease(R.v, vTarget(), dt, 2.2);
        R.vPeak = Math.max(R.vPeak, R.v);
        R.pos += R.v * dt;
        if (R.pos >= R.first + MISS) fail('miss', R.first, R.board.row(R.first).col, now);
      }
      ui();
      break;
    case 'fail':
      R.pos = ease(R.pos, R.failPos, dt, 9);
      break;
    case 'done':
      R.pos = ease(R.pos, R.target, dt, 26);
      break;
  }
}

function render(t) {
  const now = t / 1000;
  if (R.phase === 'menu') {
    painter.draw({ board: attract.board, pos: attract.pos, now });
    return;
  }
  const st = now - R.shakeT;
  const shake = st < 0.42 ? Math.sin(st * 70) * 9 * (1 - st / 0.42) : 0;
  painter.draw({
    board: R.board, pos: R.pos, now, shake, fail: R.fail,
    label: R.phase === 'ready' ? { row: readyRow(), text: R.label, pulse: true } : null,
    baseText: R.mode === 'classic' ? `经典 · ${R.count} 块` : '街机',
  });
  if (tipOn) placeTip();
}

let last = performance.now();
function frame(t) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, Math.max(0, (t - last) / 1000));
  last = t;
  if (away || document.hidden) return;
  if (R.paused) {
    if (needRender) { render(t); needRender = false; }
    return;
  }
  update(dt, t);
  render(t);
}

// 第一次打开：设置页里的「经典最快」先显示成 —
{
  const st = hb.stats();
  if (st.classicBest == null) { st.classicBest = '—'; hb.saveStats(st); }
}
toMenu();
requestAnimationFrame(frame);

// 自动测试用
window.__tiles = {
  R, painter, start, toMenu, pause, resume, onTap,
  get attract() { return attract; },
  /** 下一块该踩的黑块在屏幕上的中心 */
  next() {
    const i = readyRow();
    const ref = R.mode === 'classic' ? R.target : R.pos;
    const r = painter.tileRect(i, R.board.row(i).col, ref);
    return { x: r.x + r.w / 2, y: r.y + r.h / 2, i };
  },
};
