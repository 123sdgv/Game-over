// 色感：在一堆同色方块里找出颜色不一样的那一块。
// 倒计时开局，答对加时、点错扣时；答得越多，格子越多、颜色差别越小。
// 时间、加减秒数、格子范围都在 设置 → 色感 里调整。
import { hub } from '../_shared/hub.js';

const hb = hub('colorspot');
const $ = (id) => document.getElementById(id);
const board = $('board');
const clock = $('clock');

const OKLCH = typeof CSS !== 'undefined' && CSS.supports && CSS.supports('color', 'oklch(0.6 0.1 120)');

let cfg = hb.settings();
let pendingCfg = null;
let g; // 当前这一局

/* ---------- 难度 ---------- */
// 格子边长：起步快，后面慢（答对 1、3、6、10、16、23… 次时各加一圈）
const sizeFor = (score) => Math.min(cfg.maxSize, cfg.startSize + Math.floor(Math.sqrt(score * 1.6)));
// 颜色差（OKLCH 亮度）：从 0.13 一路缩小到 0.018
const diffFor = (score) => Math.max(0.018, 0.13 * Math.pow(0.93, score));

const rand = (a, b) => a + Math.random() * (b - a);

function makeColors(score) {
  const H = rand(0, 360);
  const d = diffFor(score);
  if (OKLCH) {
    const L = rand(0.52, 0.78), C = rand(0.06, 0.13);
    // 往亮还是往暗偏，看哪边空间更大，再加点随机
    const dir = L + d > 0.9 ? -1 : L - d < 0.4 ? 1 : (Math.random() < 0.5 ? -1 : 1);
    return { base: `oklch(${L.toFixed(3)} ${C.toFixed(3)} ${H.toFixed(1)})`, odd: `oklch(${(L + dir * d).toFixed(3)} ${C.toFixed(3)} ${H.toFixed(1)})` };
  }
  // 旧浏览器：HSL 近似
  const S = rand(45, 70), L = rand(45, 65), dl = d * 100;
  const dir = L + dl > 88 ? -1 : L - dl < 25 ? 1 : (Math.random() < 0.5 ? -1 : 1);
  return { base: `hsl(${H.toFixed(1)} ${S.toFixed(1)}% ${L.toFixed(1)}%)`, odd: `hsl(${H.toFixed(1)} ${S.toFixed(1)}% ${(L + dir * dl).toFixed(1)}%)` };
}

/* ---------- 一局 ---------- */
function newGame() {
  if (pendingCfg) { cfg = pendingCfg; pendingCfg = null; $('notice').hidden = true; }
  stopLoop();
  g = {
    score: 0, size: 0, odd: -1,
    left: cfg.time * 1000, // 剩余毫秒
    started: false, running: false, over: false, paused: false,
    last: 0,
  };
  $('result').hidden = true;
  $('paused').hidden = true;
  board.className = 'board';
  $('tip').textContent = '找出颜色不一样的那一块，点一下就开始计时';
  nextRound();
  updateHud();
}

function nextRound() {
  const size = sizeFor(g.score);
  const grew = size !== g.size;
  g.size = size;
  g.odd = Math.floor(Math.random() * size * size);
  const { base, odd } = makeColors(g.score);

  if (grew || board.children.length !== size * size) {
    board.replaceChildren();
    board.style.gridTemplateColumns = `repeat(${size}, 1fr)`;
    const frag = document.createDocumentFragment();
    for (let i = 0; i < size * size; i++) {
      const el = document.createElement('button');
      el.className = 't';
      el.dataset.i = i;
      el.setAttribute('role', 'gridcell');
      el.setAttribute('aria-label', '色块');
      frag.append(el);
    }
    board.append(frag);
    layout();
  }
  [...board.children].forEach((el, i) => {
    el.className = 't';
    el.classList.toggle('odd', i === g.odd);
    el.style.background = i === g.odd ? odd : base;
    // 重新触发出场动画，按离中心的距离错开一点
    const c = (size - 1) / 2;
    el.style.setProperty('--d', `${Math.round(Math.hypot(i % size - c, Math.floor(i / size) - c) * 18)}ms`);
    el.style.animation = 'none';
    void el.offsetWidth;
    el.style.animation = '';
  });
  $('level').textContent = `第 ${g.score + 1} 关 · ${size}×${size}`;
}

function tap(i) {
  if (g.over || g.paused || i < 0) return;
  if (!g.started) start();
  const el = board.children[i];
  if (i === g.odd) {
    g.score++;
    g.left += cfg.bonus * 1000;
    if (cfg.bonus) flash(`+${cfg.bonus}`, 'up');
    const sc = $('score');
    sc.classList.remove('bump'); void sc.offsetWidth; sc.classList.add('bump');
    hb.haptic(8);
    nextRound();
  } else {
    el.classList.remove('miss'); void el.offsetWidth; el.classList.add('miss');
    hb.haptic([20, 30, 20]);
    if (cfg.penalty) {
      g.left -= cfg.penalty * 1000;
      flash(`−${cfg.penalty}`, 'down');
      if (g.left <= 0) { g.left = 0; end(); return; }
    }
  }
  updateHud();
}

function flash(text, cls) {
  const el = $('gain');
  el.className = 'gain';
  el.textContent = text;
  void el.offsetWidth;
  el.className = `gain ${cls}`;
}

/* ---------- 计时 ---------- */
let raf = 0;
function start() {
  g.started = true;
  $('tip').textContent = '答对加时，点错扣时';
  resumeLoop();
}
function resumeLoop() {
  if (g.over || g.running) return;
  g.running = true;
  g.last = performance.now();
  const step = (t) => {
    if (!g.running) return;
    g.left -= t - g.last;
    g.last = t;
    if (g.left <= 0) { g.left = 0; updateHud(); end(); return; }
    updateHud();
    raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
}
function stopLoop() {
  if (g && g.running) { g.left -= performance.now() - g.last; g.running = false; }
  cancelAnimationFrame(raf);
}

const fmt = (ms) => (Math.max(0, ms) / 1000).toFixed(1);

function updateHud() {
  $('score').querySelector('span').textContent = g.score;
  clock.textContent = fmt(g.left);
  const low = g.started && !g.over && g.left < 5000;
  clock.classList.toggle('idle', !g.started);
  clock.classList.toggle('low', low);
  $('timefill').style.transform = `scaleX(${Math.min(1, g.left / (cfg.time * 1000))})`;
  document.querySelector('.timebar').classList.toggle('low', low);
}

/* ---------- 结束 ---------- */
function record() {
  const s = hb.stats();
  s.played = (s.played || 0) + 1;
  const prev = s.best || 0;
  s.best = Math.max(prev, g.score);
  s.last = g.score;
  hb.saveStats(s);
  return { s, isRecord: g.score > prev && prev > 0 };
}

function end() {
  stopLoop();
  g.over = true;
  const { s, isRecord } = record();
  board.classList.add('over');
  hb.haptic([30, 40, 30]);
  updateHud();
  setTimeout(() => {
    $('result').hidden = false;
    $('resultTitle').textContent = isRecord ? '新纪录' : '时间到';
    $('resultScore').textContent = g.score;
    $('resultMeta').innerHTML = isRecord
      ? `最高到了 <b>${g.size}×${g.size}</b>`
      : `最高分 <b>${s.best}</b> · 最后一关 ${g.size}×${g.size}`;
  }, 900);
}

/* ---------- 暂停 ---------- */
function pause() {
  if (!g.started || g.over || g.paused) return;
  stopLoop();
  g.paused = true;
  board.classList.add('hide');
  $('pausedTime').textContent = fmt(g.left);
  $('paused').hidden = false;
}
function resume() {
  if (!g.paused) return;
  g.paused = false;
  board.classList.remove('hide');
  $('paused').hidden = true;
  resumeLoop();
}

/* ---------- 尺寸 ---------- */
function layout() {
  const st = $('stage');
  const W = st.clientWidth - 36, H = st.clientHeight - 28;
  const side = Math.max(160, Math.floor(Math.min(W, H, 440)));
  const n = g.size;
  const gap = n <= 3 ? 10 : n <= 5 ? 8 : n <= 7 ? 6 : 5;
  const cell = (side - 16 - gap * (n - 1)) / n;
  board.style.width = `${side}px`;
  board.style.setProperty('--gap', `${gap}px`);
  board.style.setProperty('--r', `${Math.round(Math.min(18, cell * 0.22))}px`);
}
window.addEventListener('resize', () => g && layout());

/* ---------- 触摸 ---------- */
board.addEventListener('pointerdown', (e) => {
  const el = e.target.closest('.t');
  if (!el) return;
  e.preventDefault();
  tap(+el.dataset.i);
});
board.addEventListener('contextmenu', (e) => e.preventDefault());

$('restart').addEventListener('click', () => {
  if (g.started && !g.over) record();
  newGame();
});
$('next').addEventListener('click', newGame);
$('resume').addEventListener('click', resume);

/* ---------- 和大厅的联动 ---------- */
hb.onSettings((next) => {
  if (!g.started || g.over) { cfg = next; newGame(); }
  else { pendingCfg = next; $('notice').hidden = false; }
});
hb.onPause(pause);
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });

newGame();
