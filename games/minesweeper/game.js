// 扫雷：每局随机生成，第一下一定安全；格子和雷数在 设置 → 扫雷 里调整
import { hub } from '../_shared/hub.js';

const hb = hub('minesweeper');
const $ = (id) => document.getElementById(id);
const board = $('board');

const FLAG_SVG = '<svg viewBox="0 0 16 16"><path d="M5 2.5v11" stroke="#1C1D20" stroke-width="1.7" stroke-linecap="round"/><path d="M6 2.6l7.2 3.2L6 9z" fill="#FF4A1C"/></svg>';
const mineSVG = (color) => {
  let spikes = '';
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    spikes += `<line x1="${8 + 3.6 * Math.cos(a)}" y1="${8 + 3.6 * Math.sin(a)}" x2="${8 + 6.6 * Math.cos(a)}" y2="${8 + 6.6 * Math.sin(a)}"/>`;
  }
  return `<svg viewBox="0 0 16 16"><g stroke="${color}" stroke-width="1.5" stroke-linecap="round">${spikes}</g><circle cx="8" cy="8" r="4.3" fill="${color}"/></svg>`;
};

let cfg = hb.settings();
let pendingCfg = null;
let mode = 'dig';
let g; // 当前这一局

/* ---------- 一局 ---------- */
function newGame() {
  if (pendingCfg) { cfg = pendingCfg; pendingCfg = null; $('notice').hidden = true; }
  const { cols, rows, mines } = cfg;
  g = {
    cols, rows, mines,
    cells: Array.from({ length: cols * rows }, () => ({ mine: false, n: 0, open: false, flag: false })),
    els: [],
    placed: false, over: false, won: false,
    opened: 0, flags: 0,
    elapsed: 0, since: 0, running: false,
  };
  board.replaceChildren();
  board.className = 'board';
  board.style.gridTemplateColumns = `repeat(${cols}, var(--cell))`;
  const frag = document.createDocumentFragment();
  g.cells.forEach((_, i) => {
    const el = document.createElement('div');
    el.className = 'c';
    el.dataset.i = i;
    el.setAttribute('role', 'gridcell');
    g.els.push(el);
    frag.append(el);
  });
  board.append(frag);
  $('result').hidden = true;
  $('tip').textContent = cfg.longPress ? (mode === 'dig' ? '长按格子可以插旗' : '长按格子可以挖开') : '点按切换上面的方式';
  layout();
  updateHud();
}

const neighbors = (i) => {
  const x = i % g.cols, y = Math.floor(i / g.cols), out = [];
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    if (!dx && !dy) continue;
    const nx = x + dx, ny = y + dy;
    if (nx >= 0 && ny >= 0 && nx < g.cols && ny < g.rows) out.push(ny * g.cols + nx);
  }
  return out;
};

// 第一下点开时才布雷，保证点到的格子和周围一圈都没有雷
function placeMines(safe) {
  const banned = new Set([safe, ...neighbors(safe)]);
  const pool = [];
  for (let i = 0; i < g.cells.length; i++) if (!banned.has(i)) pool.push(i);
  // 雷太多、安全区放不下时，退一步只保证点到的那格安全
  const list = pool.length >= g.mines ? pool : g.cells.map((_, i) => i).filter((i) => i !== safe);
  for (let k = 0; k < g.mines && list.length; k++) {
    const j = k + Math.floor(Math.random() * (list.length - k));
    [list[k], list[j]] = [list[j], list[k]];
    g.cells[list[k]].mine = true;
  }
  g.cells.forEach((c, i) => { c.n = neighbors(i).filter((j) => g.cells[j].mine).length; });
  g.placed = true;
  startClock();
}

function reveal(start) {
  const c0 = g.cells[start];
  if (c0.open || c0.flag) return;
  if (!g.placed) placeMines(start);
  if (c0.mine) { lose(start); return; }
  // 从点到的格子向外扩散，延迟按距离排，形成一圈圈展开的效果
  const sx = start % g.cols, sy = Math.floor(start / g.cols);
  const queue = [start];
  const seen = new Set(queue);
  while (queue.length) {
    const i = queue.shift();
    const c = g.cells[i];
    if (c.flag || c.open) continue;
    c.open = true;
    g.opened++;
    const d = Math.hypot(i % g.cols - sx, Math.floor(i / g.cols) - sy);
    paint(i, Math.min(420, d * 26));
    if (c.n === 0) for (const j of neighbors(i)) if (!seen.has(j)) { seen.add(j); queue.push(j); }
  }
  hb.haptic(6);
  if (g.opened === g.cells.length - g.mines) win();
}

// 点已经翻开的数字：周围旗子数对得上，就把其余格子一起翻开
function chord(i) {
  const c = g.cells[i];
  if (!c.open || !c.n) return;
  const ns = neighbors(i);
  if (ns.filter((j) => g.cells[j].flag).length !== c.n) { pulse(ns.filter((j) => !g.cells[j].open && !g.cells[j].flag)); return; }
  for (const j of ns) if (!g.over && !g.cells[j].open && !g.cells[j].flag) reveal(j);
}

function pulse(list) {
  list.forEach((j) => { const el = g.els[j]; el.classList.add('press'); setTimeout(() => el.classList.remove('press'), 140); });
}

function toggleFlag(i) {
  const c = g.cells[i];
  if (c.open) return;
  c.flag = !c.flag;
  g.flags += c.flag ? 1 : -1;
  paint(i);
  hb.haptic(c.flag ? 14 : 6);
  updateHud();
}

function paint(i, delay = 0) {
  const c = g.cells[i], el = g.els[i];
  el.style.setProperty('--d', `${delay}ms`);
  if (c.open) {
    el.className = `c open${c.n ? ` n${c.n}` : ''}`;
    el.textContent = c.n || '';
  } else if (c.flag) {
    el.className = 'c flag';
    el.innerHTML = FLAG_SVG;
  } else {
    el.className = 'c';
    el.textContent = '';
  }
}

/* ---------- 结束 ---------- */
function finish(won) {
  g.over = true; g.won = won;
  stopClock();
  const s = hb.stats();
  s.played = (s.played || 0) + 1;
  const key = `${g.cols}x${g.rows}x${g.mines}`;
  let record = false;
  if (won) {
    s.won = (s.won || 0) + 1;
    s.streak = (s.streak || 0) + 1;
    s.bestStreak = Math.max(s.bestStreak || 0, s.streak);
    s.bests = s.bests || {};
    if (!s.bests[key] || g.elapsed < s.bests[key]) { record = !!s.bests[key]; s.bests[key] = g.elapsed; }
  } else s.streak = 0;
  hb.saveStats(s);
  return { s, key, record };
}

function lose(at) {
  const { s } = finish(false);
  const ax = at % g.cols, ay = Math.floor(at / g.cols);
  g.cells.forEach((c, i) => {
    const el = g.els[i];
    const d = Math.hypot(i % g.cols - ax, Math.floor(i / g.cols) - ay) * 45;
    if (c.mine && !c.flag) {
      el.style.setProperty('--d', `${i === at ? 0 : 120 + d}ms`);
      el.className = `c mine${i === at ? ' boom' : ''}`;
      el.innerHTML = mineSVG(i === at ? '#FFFFFF' : '#1C1D20');
    } else if (!c.mine && c.flag) {
      el.className = 'c wrong';
    }
  });
  board.classList.add('shake');
  hb.haptic([30, 40, 30]);
  setTimeout(() => showResult(false, s), 900);
}

function win() {
  const { s, key, record } = finish(true);
  g.cells.forEach((c, i) => { if (c.mine && !c.flag) { c.flag = true; paint(i, 80); } });
  g.flags = g.mines;
  updateHud();
  board.classList.add('won');
  hb.haptic([12, 60, 12]);
  setTimeout(() => showResult(true, s, key, record), 650);
}

function showResult(won, s, key, record) {
  const r = $('result');
  r.hidden = false;
  r.classList.toggle('lost', !won);
  $('resultTitle').textContent = won ? (record ? '新纪录' : '扫完了') : '踩到地雷了';
  $('resultTime').textContent = fmt(g.elapsed);
  const meta = $('resultMeta');
  if (won) {
    const best = s.bests[key];
    meta.innerHTML = `最快 <b>${fmt(best)}</b>${s.streak > 1 ? `，连胜 <b>${s.streak}</b> 局` : ''}`;
  } else {
    const left = g.cells.length - g.mines - g.opened;
    meta.textContent = left <= 3 ? `只差 ${left} 格就扫完了` : `还剩 ${left} 个安全格子`;
  }
}

/* ---------- 计时 ---------- */
let tick = null;
function startClock() { g.running = true; g.since = performance.now(); tick = setInterval(updateHud, 250); updateHud(); }
function stopClock() {
  if (g.running) g.elapsed += performance.now() - g.since;
  g.running = false;
  clearInterval(tick);
  updateHud();
}
const now = () => g.elapsed + (g.running ? performance.now() - g.since : 0);
const fmt = (ms) => { const s = Math.floor(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

function updateHud() {
  $('mines').querySelector('span').textContent = g.mines - g.flags;
  const c = $('clock');
  c.textContent = fmt(now());
  c.classList.toggle('idle', !g.placed);
}

/* ---------- 尺寸 ---------- */
function layout() {
  const st = $('stage');
  const gap = g.cols > 10 ? 2 : 3;
  const W = st.clientWidth - 28 - 12, H = st.clientHeight - 20 - 12;
  const cell = Math.floor(Math.min((W - gap * (g.cols - 1)) / g.cols, (H - gap * (g.rows - 1)) / g.rows, 46));
  board.style.setProperty('--cell', `${Math.max(18, cell)}px`);
  board.style.setProperty('--gap', `${gap}px`);
}
window.addEventListener('resize', () => g && layout());

/* ---------- 触摸 ---------- */
let press = null;
const cellAt = (e) => { const el = e.target.closest('.c'); return el ? +el.dataset.i : -1; };

function act(i, alt) {
  if (g.over || i < 0) return;
  const c = g.cells[i];
  if (c.open) { chord(i); return; }
  const flagMode = (mode === 'flag') !== alt;
  if (flagMode) toggleFlag(i);
  else reveal(i);
}

board.addEventListener('pointerdown', (e) => {
  const i = cellAt(e);
  if (i < 0 || g.over) return;
  const el = g.els[i];
  if (!g.cells[i].open) el.classList.add('press');
  press = { i, el, x: e.clientX, y: e.clientY, done: false };
  if (cfg.longPress && !g.cells[i].open) {
    press.timer = setTimeout(() => {
      if (!press || press.i !== i) return;
      press.done = true;
      el.classList.remove('press');
      act(i, true);
    }, 340);
  }
});
board.addEventListener('pointermove', (e) => {
  if (press && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 12) {
    clearTimeout(press.timer); press.el.classList.remove('press'); press = null;
  }
});
const release = (e, run) => {
  if (!press) return;
  clearTimeout(press.timer);
  press.el.classList.remove('press');
  if (run && !press.done) act(press.i, false);
  press = null;
};
board.addEventListener('pointerup', (e) => release(e, true));
board.addEventListener('pointercancel', (e) => release(e, false));
board.addEventListener('contextmenu', (e) => { e.preventDefault(); const i = cellAt(e); if (i >= 0 && !press) act(i, true); });

$('mode').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  mode = b.dataset.mode;
  $('mode').classList.toggle('flag', mode === 'flag');
  $('mode').querySelectorAll('button').forEach((x) => x.setAttribute('aria-checked', String(x === b)));
  if (cfg.longPress) $('tip').textContent = mode === 'dig' ? '长按格子可以插旗' : '长按格子可以挖开';
  hb.haptic(5);
});
$('restart').addEventListener('click', () => {
  // 正在进行的一局中途重开，算作一局失败（连胜中断）
  if (g.placed && !g.over) finish(false);
  newGame();
});
$('next').addEventListener('click', newGame);
$('result').addEventListener('click', (e) => { if (e.target === $('result')) newGame(); });

/* ---------- 和大厅的联动 ---------- */
hb.onSettings((next) => {
  const changed = next.cols !== cfg.cols || next.rows !== cfg.rows || next.mines !== cfg.mines;
  if (!changed) { cfg = next; newGameTip(); return; }
  if (!g.placed || g.over) { cfg = next; newGame(); }
  else { pendingCfg = next; cfg = { ...cfg, longPress: next.longPress }; $('notice').hidden = false; }
});
function newGameTip() { $('tip').textContent = cfg.longPress ? (mode === 'dig' ? '长按格子可以插旗' : '长按格子可以挖开') : '点按切换上面的方式'; }
let paused = false;
function pauseClock() { if (g.running) { g.elapsed += performance.now() - g.since; g.running = false; clearInterval(tick); } }
function resumeClock() { if (!paused && !document.hidden && g.placed && !g.over && !g.running) startClock(); }
hb.onPause(() => { paused = true; pauseClock(); });
hb.onResume(() => { paused = false; resumeClock(); });
document.addEventListener('visibilitychange', () => (document.hidden ? pauseClock() : resumeClock()));

newGame();
