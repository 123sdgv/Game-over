// 方块：俄罗斯方块 + 消消乐。
// 底下是一层层彩色格子，掉下来的方块各自带一种颜色；
// 一行填满并且同色才会消掉，消掉后上面的格子一块块往下掉，可能连消。
// 闯关：方块数量有限，消够指定行数过关。无限：一直玩，越来越快，堆到顶结束。
import { hub } from '../_shared/hub.js';
import { cellsOf, collides, tryRotate, dropY, clearableRows, layered, pickColor, makeBag, levelSpec, pieceBudget, makeGrid } from './logic.js';

if (!CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    this.moveTo(x + r, y); this.arcTo(x + w, y, x + w, y + h, r); this.arcTo(x + w, y + h, x, y + h, r);
    this.arcTo(x, y + h, x, y, r); this.arcTo(x, y, x + w, y, r); this.closePath();
  };
}

const hb = hub('blocks');
const $ = (id) => document.getElementById(id);
const canvas = $('board'), ctx = canvas.getContext('2d');
const nextCanvas = $('nextCanvas'), nctx = nextCanvas.getContext('2d');

const PALETTE = ['#FFC23A', '#3FCB6A', '#FF5C8D', '#3D8BFF', '#A35CFF'];  // 黄 绿 粉 蓝 紫
const INF_STEP = 8; // 无限模式每消 8 行提速一次

let cfg = hb.settings();
let pendingCfg = null;
let mode = hb.load('mode', 'levels') === 'inf' ? 'inf' : 'levels';
let g = null;       // 当前这一局
let view = { cs: 20, x: 0, y: 0, w: 0, h: 0, dpr: 1 };
let paused = false;

/* ======================================================================
   一局
   ====================================================================== */
function newGame(levelOverride) {
  if (pendingCfg) { cfg = pendingCfg; pendingCfg = null; }
  const st = hb.stats();
  const level = levelOverride ?? (st.level || 1);
  const rows = cfg.rows, cols = cfg.cols;
  let spec;
  if (mode === 'levels') spec = levelSpec(level, cfg);
  else spec = { layers: Math.min(cfg.layers, rows - 6), colors: cfg.colors, speed: cfg.speed };
  const grid = layered(rows, cols, spec.layers, spec.colors);
  // 每列是一个从下往上的栈（格子永远压实，所以用栈就够了）
  const stacks = [];
  for (let c = 0; c < cols; c++) {
    stacks.push([]);
    for (let r = 0; r < rows && grid[r][c] !== -1; r++) stacks[c].push({ color: grid[r][c], y: r, vy: 0, flash: 0 });
  }
  g = {
    mode, level, spec, rows, cols, stacks,
    bag: makeBag(), piece: null, pv: null, next: null,
    phase: 'play', fallT: 0, lockT: 0, lockMoves: 0,
    score: 0, lines: 0, used: 0, best: 0, maxChain: 0, chain: 0,
    budget: mode === 'levels' ? pieceBudget(grid, spec.layers, spec.target, level) : Infinity,
    particles: [], texts: [], clearing: null, dropping: null, endWhy: '', started: false,
  };
  if (mode === 'levels' && st.level !== level) { st.level = level; hb.saveStats(st); }
  g.next = makePiece();
  hideCard();
  layout();
  spawn();
  ui();
}

function makePiece() {
  return { kind: g.bag(), color: pickColor(gridOf(), g.spec.colors), rot: 0 };
}

const gridOf = () => {
  const grid = makeGrid(g.rows, g.cols);
  g.stacks.forEach((st, c) => st.forEach((o, r) => { if (r < g.rows) grid[r][c] = o.color; }));
  return grid;
};

function spawn() {
  if (mode === 'levels' && g.used >= g.budget) { lose('方块用完了'); return; }
  const n = g.next;
  const size = n.kind === 'I' ? 4 : n.kind === 'O' ? 2 : 3;
  const p = { ...n, x: Math.floor((g.cols - size) / 2), y: g.rows - size + (n.kind === 'I' ? 1 : 0) };
  g.next = makePiece();
  drawNext();
  if (collides(gridOf(), p.kind, p.rot, p.x, p.y)) { g.piece = null; lose('堆到顶了'); return; }
  g.piece = p;
  g.pv = { x: p.x, y: p.y + 1.2, rotA: 0 };
  g.fallT = 0; g.lockT = 0; g.lockMoves = 0;
  g.phase = 'play';
}

const interval = () => {
  const sp = mode === 'inf' ? g.spec.speed + Math.floor(g.lines / INF_STEP) : g.spec.speed;
  return Math.max(55, 1000 * Math.pow(0.8, sp - 1));
};

/* ---------- 移动 ---------- */
function move(dx, dy) {
  const p = g.piece;
  if (!p || g.phase !== 'play') return false;
  if (collides(gridOf(), p.kind, p.rot, p.x + dx, p.y + dy)) return false;
  p.x += dx; p.y += dy;
  if (dx && g.lockT > 0 && g.lockMoves < 12) { g.lockT = 0; g.lockMoves++; }
  if (dy < 0) g.fallT = 0;
  g.started = true;
  return true;
}

function rotate() {
  const p = g.piece;
  if (!p || g.phase !== 'play') return;
  const r = tryRotate(gridOf(), p, 1);
  if (!r) { hb.haptic(10); return; }
  Object.assign(p, r);
  g.pv.rotA = -Math.PI / 2;
  if (g.lockT > 0 && g.lockMoves < 12) { g.lockT = 0; g.lockMoves++; }
  g.started = true;
  hb.haptic(5);
}

function hardDrop() {
  const p = g.piece;
  if (!p || g.phase !== 'play') return;
  const y = dropY(gridOf(), p);
  const dist = p.y - y;
  if (mode === 'inf') g.score += dist * 2;
  p.y = y;
  g.phase = 'dropping';
  g.dropping = { t: 0, from: g.pv.y, dist };
  g.started = true;
}

/* ---------- 落定和消除 ---------- */
function lock() {
  const p = g.piece;
  g.piece = null;
  g.used++;
  const cells = cellsOf(p.kind, p.rot).map(([x, y]) => [p.x + x, p.y + y]).sort((a, b) => a[1] - b[1]);
  for (const [c, r] of cells) g.stacks[c].push({ color: p.color, y: r, vy: 0, flash: 1 });
  hb.haptic(6);
  if (g.stacks.some((s) => s.length > g.rows)) { ui(); lose('堆到顶了'); return; }
  g.chain = 0;
  g.phase = 'resolve';
  ui();
}

/** 所有格子都落稳了吗 */
const settled = () => g.stacks.every((s) => s.every((o, r) => Math.abs(o.y - r) < 0.001));

function resolveStep() {
  if (!settled() || g.clearing) return;
  const rows = clearableRows(gridOf());
  if (rows.length) {
    g.chain++;
    g.maxChain = Math.max(g.maxChain, g.chain);
    g.clearing = { rows, t: 0 };
    rows.forEach((r) => g.stacks.forEach((s) => { s[r].dying = true; }));
    hb.haptic(g.chain > 1 ? [10, 30, 10, 30, 10] : [10, 30, 10]);
    return;
  }
  // 没有可以消的了：这一手结束
  g.phase = 'play';
  if (mode === 'levels' && g.lines >= g.spec.target) { win(); return; }
  spawn();
  ui();
}

function finishClear() {
  const { rows } = g.clearing;
  const { cs } = view;
  for (const r of rows) {
    g.stacks.forEach((s, c) => {
      const o = s[r];
      const [x, y] = cellXY(c, r);
      for (let k = 0; k < 6; k++) {
        const a = Math.random() * Math.PI * 2, v = 60 + Math.random() * 160;
        g.particles.push({ x: x + cs / 2, y: y + cs / 2, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 80, life: 0, max: 0.55 + Math.random() * 0.3, color: PALETTE[o.color], size: cs * (0.16 + Math.random() * 0.14) });
      }
    });
  }
  // 从上往下删，免得下标乱
  g.stacks.forEach((s) => { for (let i = s.length - 1; i >= 0; i--) if (s[i].dying) s.splice(i, 1); });
  g.lines += rows.length;
  const gained = rows.length * 100 * g.chain;
  g.score += gained;
  const midY = cellXY(0, rows[0])[1];
  g.texts.push({ text: g.chain > 1 ? `连消 ×${g.chain}` : rows.length > 1 ? `${rows.length} 行！` : `+${gained}`, y: midY, t: 0, big: g.chain > 1 || rows.length > 1 });
  g.clearing = null;
  ui();
}

/* ---------- 结束 ---------- */
function win() {
  g.phase = 'over';
  const st = hb.stats();
  st.cleared = (st.cleared || 0) + 1;
  st.level = g.level + 1;
  hb.saveStats(st);
  hb.haptic([12, 60, 12]);
  setTimeout(() => showCard({
    title: '过关了', big: `第 ${g.level} 关`,
    meta: `用了 <b>${g.used}</b> 块${g.maxChain > 1 ? ` · 最多连消 <b>×${g.maxChain}</b>` : ''}`,
    main: ['下一关', () => newGame(g.level + 1)],
  }), 500);
}

function lose(why) {
  g.phase = 'over';
  g.endWhy = why;
  hb.haptic([30, 40, 30]);
  if (mode === 'inf') {
    const st = hb.stats();
    const prev = st.infBest || 0;
    if (g.score > prev) { st.infBest = g.score; hb.saveStats(st); }
    setTimeout(() => showCard({
      title: g.score > prev && prev > 0 ? '新纪录！' : why, big: `${g.score}`,
      meta: `消了 <b>${g.lines}</b> 行 · 最高 <b>${Math.max(prev, g.score)}</b> 分`,
      main: ['再来一局', () => newGame()],
    }), 600);
  } else {
    setTimeout(() => showCard({
      title: why, big: `第 ${g.level} 关`,
      meta: `消了 <b>${g.lines}</b> / ${g.spec.target} 行`,
      main: ['再试一次', () => newGame(g.level)],
    }), 600);
  }
}

/* ======================================================================
   卡片（过关 / 失败 / 暂停）
   ====================================================================== */
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
$('cardMain').addEventListener('click', () => { const f = cardActions.main; hideCard(); f && f(); });
$('cardAlt').addEventListener('click', () => { const f = cardActions.alt; hideCard(); f && f(); });

function pause() {
  if (!g || paused || g.phase === 'over') return;
  paused = true;
  showCard({
    title: '已暂停', big: mode === 'inf' ? `${g.score}` : `第 ${g.level} 关`,
    meta: mode === 'inf' ? `消了 <b>${g.lines}</b> 行` : `还要消 <b>${Math.max(0, g.spec.target - g.lines)}</b> 行`,
    main: ['继续', () => { paused = false; last = performance.now(); }],
    alt: [mode === 'inf' ? '重新开始' : '重来这关', () => { paused = false; newGame(mode === 'levels' ? g.level : undefined); }],
  });
}

/* ======================================================================
   界面文字
   ====================================================================== */
function ui() {
  $('segLevels').setAttribute('aria-checked', String(mode === 'levels'));
  $('segInf').setAttribute('aria-checked', String(mode === 'inf'));
  $('seg').classList.toggle('right', mode === 'inf');
  const pill = $('score');
  if (mode === 'levels') {
    pill.textContent = `第 ${g.level} 关`;
    const need = Math.max(0, g.spec.target - g.lines);
    const left = Math.max(0, g.budget - g.used);
    $('goal').innerHTML = need ? `还要消 <b>${need}</b> 行 · 剩 <b>${left}</b> 块` : '全部消完啦';
    $('meter').style.width = `${Math.min(100, (g.lines / g.spec.target) * 100)}%`;
  } else {
    const prev = pill.textContent;
    pill.textContent = `${g.score} 分`;
    if (prev !== pill.textContent && g.score) { pill.classList.remove('bump'); void pill.offsetWidth; pill.classList.add('bump'); }
    const sp = g.spec.speed + Math.floor(g.lines / INF_STEP);
    $('goal').innerHTML = `速度 <b>${sp}</b> · 消了 ${g.lines} 行 · 最高 ${Math.max(hb.stats().infBest || 0, g.score)}`;
    $('meter').style.width = `${((g.lines % INF_STEP) / INF_STEP) * 100}%`;
  }
  $('tip').textContent = pendingCfg ? '新设置会在下一局生效' : '拖动左右移动 · 轻点旋转 · 往下一甩直接落下';
}

/* ======================================================================
   排版和绘制
   ====================================================================== */
function layout() {
  const st = $('stage').getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  canvas.width = Math.round(st.width * dpr); canvas.height = Math.round(st.height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (!g) return;
  const pad = 10;
  const cs = Math.floor(Math.min((st.width - 24 - pad * 2) / g.cols, (st.height - 16 - pad * 2) / g.rows));
  const w = cs * g.cols, h = cs * g.rows;
  view = { cs, w, h, x: Math.round((st.width - w) / 2), y: Math.round((st.height - h) / 2), dpr, pad, sw: st.width, sh: st.height };
  sprites.clear();
  drawNext();
}
window.addEventListener('resize', layout);

const cellXY = (c, r) => [view.x + c * view.cs, view.y + (g.rows - 1 - r) * view.cs];

// 方块贴图缓存：每种颜色一张
const sprites = new Map();
function sprite(color, cs, dpr) {
  const key = `${color}|${cs}|${dpr}`;
  if (sprites.has(key)) return sprites.get(key);
  const c = document.createElement('canvas');
  c.width = c.height = Math.ceil(cs * dpr);
  const x = c.getContext('2d');
  x.scale(dpr, dpr);
  paintBlock(x, 0, 0, cs, color);
  sprites.set(key, c);
  return c;
}

function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  let r = n >> 16, gg = (n >> 8) & 255, b = n & 255;
  if (k >= 0) { r += (255 - r) * k; gg += (255 - gg) * k; b += (255 - b) * k; } else { r *= 1 + k; gg *= 1 + k; b *= 1 + k; }
  return `rgb(${r | 0},${gg | 0},${b | 0})`;
}

/** 果冻质感的一格 */
function paintBlock(x, px, py, cs, color) {
  const m = Math.max(1, cs * 0.05), s = cs - m * 2, rad = s * 0.24;
  // 底部的厚度（深色）
  x.fillStyle = shade(color, -0.42);
  x.beginPath(); x.roundRect(px + m, py + m + s * 0.06, s, s * 0.94, rad); x.fill();
  // 主体
  const gr = x.createLinearGradient(0, py + m, 0, py + m + s);
  gr.addColorStop(0, shade(color, 0.32));
  gr.addColorStop(0.45, color);
  gr.addColorStop(1, shade(color, -0.18));
  x.fillStyle = gr;
  x.beginPath(); x.roundRect(px + m, py + m, s, s * 0.9, rad); x.fill();
  // 顶部高光
  x.fillStyle = 'rgba(255,255,255,.55)';
  x.beginPath(); x.roundRect(px + m + s * 0.16, py + m + s * 0.09, s * 0.68, s * 0.16, s * 0.08); x.fill();
  // 左上角小亮点
  x.fillStyle = 'rgba(255,255,255,.75)';
  x.beginPath(); x.arc(px + m + s * 0.2, py + m + s * 0.38, s * 0.055, 0, Math.PI * 2); x.fill();
  // 细边
  x.strokeStyle = 'rgba(0,0,0,.18)';
  x.lineWidth = 1;
  x.beginPath(); x.roundRect(px + m + 0.5, py + m + 0.5, s - 1, s - 1, rad); x.stroke();
}

function drawBoard() {
  const { cs, x, y, w, h } = view;
  ctx.clearRect(0, 0, view.sw, view.sh);
  // 棋盘底板
  const pad = 8;
  ctx.fillStyle = 'rgba(8, 4, 24, .45)';
  ctx.beginPath(); ctx.roundRect(x - pad, y - pad, w + pad * 2, h + pad * 2, 18); ctx.fill();
  ctx.strokeStyle = 'rgba(190, 160, 255, .22)';
  ctx.lineWidth = 1.5; ctx.stroke();
  // 格子底纹
  ctx.fillStyle = 'rgba(255,255,255,.035)';
  for (let r = 0; r < g.rows; r++) for (let c = 0; c < g.cols; c++) {
    ctx.beginPath(); ctx.roundRect(x + c * cs + cs * 0.12, y + r * cs + cs * 0.12, cs * 0.76, cs * 0.76, cs * 0.18); ctx.fill();
  }
  // 快堆满时，顶上两行变红提醒
  const top = Math.max(...g.stacks.map((s) => s.length));
  if (top >= g.rows - 4) {
    const a = 0.12 + 0.08 * Math.sin(performance.now() / 180);
    ctx.fillStyle = `rgba(255, 70, 90, ${a})`;
    ctx.fillRect(x, y, w, cs * 2);
  }
}

function drawCells() {
  const { cs, dpr } = view;
  g.stacks.forEach((s, c) => s.forEach((o) => {
    const [px, py] = cellXY(c, o.y);
    if (o.dying && g.clearing) {
      const t = g.clearing.t;
      const k = t < 0.45 ? 1 + Math.sin((t / 0.45) * Math.PI) * 0.12 : 1 - (t - 0.45) / 0.55;
      ctx.save();
      ctx.translate(px + cs / 2, py + cs / 2); ctx.scale(k, k);
      ctx.drawImage(sprite(PALETTE[o.color], cs, dpr), -cs / 2, -cs / 2, cs, cs);
      ctx.fillStyle = `rgba(255,255,255,${Math.min(0.85, t * 2.2)})`;
      ctx.beginPath(); ctx.roundRect(-cs / 2 + 1, -cs / 2 + 1, cs - 2, cs - 2, cs * 0.24); ctx.fill();
      ctx.restore();
      return;
    }
    ctx.drawImage(sprite(PALETTE[o.color], cs, dpr), px, py, cs, cs);
    if (o.flash > 0) {
      ctx.fillStyle = `rgba(255,255,255,${o.flash * 0.45})`;
      ctx.beginPath(); ctx.roundRect(px + 1, py + 1, cs - 2, cs - 2, cs * 0.24); ctx.fill();
    }
  }));
}

function drawPiece() {
  const p = g.piece;
  if (!p) return;
  const { cs, dpr } = view;
  const cells = cellsOf(p.kind, p.rot);
  // 落点提示
  if (cfg.ghost && g.phase === 'play') {
    const gy = dropY(gridOf(), p);
    ctx.save();
    ctx.strokeStyle = PALETTE[p.color]; ctx.globalAlpha = 0.55; ctx.lineWidth = 2;
    ctx.fillStyle = PALETTE[p.color];
    for (const [cx, cy] of cells) {
      const r = gy + cy;
      if (r >= g.rows) continue;
      const [px, py] = cellXY(p.x + cx, r);
      ctx.globalAlpha = 0.14; ctx.beginPath(); ctx.roundRect(px + 2, py + 2, cs - 4, cs - 4, cs * 0.22); ctx.fill();
      ctx.globalAlpha = 0.5; ctx.stroke();
    }
    ctx.restore();
  }
  // 方块本体：位置和旋转都平滑过渡
  const size = p.kind === 'I' ? 4 : p.kind === 'O' ? 2 : 3;
  const cxw = view.x + (g.pv.x + size / 2) * cs;
  const cyw = view.y + (g.rows - (g.pv.y + size / 2)) * cs;
  ctx.save();
  ctx.beginPath(); ctx.rect(view.x - 8, view.y - 8, view.w + 16, view.h + 16); ctx.clip();
  ctx.translate(cxw, cyw);
  ctx.rotate(g.pv.rotA);
  const spr = sprite(PALETTE[p.color], cs, dpr);
  for (const [cx, cy] of cells) {
    const px = (cx - size / 2) * cs, py = (size / 2 - cy - 1) * cs;
    ctx.save(); ctx.translate(px + cs / 2, py + cs / 2); ctx.rotate(-g.pv.rotA);
    ctx.drawImage(spr, -cs / 2, -cs / 2, cs, cs);
    ctx.restore();
  }
  ctx.restore();
}

function drawFx(dt) {
  for (const pt of g.particles) {
    pt.life += dt; pt.vy += 520 * dt; pt.x += pt.vx * dt; pt.y += pt.vy * dt;
    const a = 1 - pt.life / pt.max;
    if (a <= 0) continue;
    ctx.globalAlpha = a;
    ctx.fillStyle = pt.color;
    ctx.beginPath(); ctx.roundRect(pt.x - pt.size / 2, pt.y - pt.size / 2, pt.size, pt.size, pt.size * 0.3); ctx.fill();
  }
  ctx.globalAlpha = 1;
  g.particles = g.particles.filter((pt) => pt.life < pt.max);
  for (const t of g.texts) {
    t.t += dt;
    const a = t.t < 0.15 ? t.t / 0.15 : Math.max(0, 1 - (t.t - 0.6) / 0.5);
    const s = t.big ? 1 + 0.25 * Math.max(0, 1 - t.t * 4) : 1;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.translate(view.x + view.w / 2, t.y - t.t * 40);
    ctx.scale(s, s);
    ctx.font = `800 ${t.big ? 30 : 22}px -apple-system, "PingFang SC", sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(40, 16, 80, .8)'; ctx.strokeText(t.text, 0, 0);
    ctx.fillStyle = t.big ? '#FFD45C' : '#fff'; ctx.fillText(t.text, 0, 0);
    ctx.restore();
  }
  g.texts = g.texts.filter((t) => t.t < 1.1);
}

function drawNext() {
  if (!g || !g.next) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  nextCanvas.width = 56 * dpr; nextCanvas.height = 40 * dpr;
  nctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  nctx.clearRect(0, 0, 56, 40);
  const cells = cellsOf(g.next.kind, 0);
  const xs = cells.map((c) => c[0]), ys = cells.map((c) => c[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const cs = Math.min(13, 52 / (maxX - minX + 1), 36 / (maxY - minY + 1));
  const ox = (56 - (maxX - minX + 1) * cs) / 2, oy = (40 - (maxY - minY + 1) * cs) / 2;
  for (const [x, y] of cells) paintBlock(nctx, ox + (x - minX) * cs, oy + (maxY - y) * cs, cs, PALETTE[g.next.color]);
}

/* ======================================================================
   主循环
   ====================================================================== */
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (!g) return;
  if (!paused) update(dt);
  drawBoard();
  drawCells();
  drawPiece();
  drawFx(paused ? 0 : dt);
}

function update(dt) {
  // 格子下落（带一点重力加速度和落地回弹）
  const { cs } = view;
  g.stacks.forEach((s) => s.forEach((o, r) => {
    if (o.flash > 0) o.flash = Math.max(0, o.flash - dt * 4);
    if (o.y > r) {
      o.vy += 60 * dt;
      o.y = Math.max(r, o.y - o.vy * dt);
      if (o.y === r) o.vy = 0;
    } else { o.y = r; o.vy = 0; }
  }));
  if (g.clearing) {
    g.clearing.t += dt / 0.38;
    if (g.clearing.t >= 1) finishClear();
  }
  if (g.phase === 'resolve') resolveStep();

  const p = g.piece;
  if (!p) return;
  // 画面上的方块跟着逻辑位置走
  const k = 1 - Math.exp(-dt * 28);
  g.pv.x += (p.x - g.pv.x) * k;
  g.pv.rotA += (0 - g.pv.rotA) * (1 - Math.exp(-dt * 22));
  if (g.phase === 'dropping') {
    g.dropping.t += dt;
    const T = 0.06 + g.dropping.dist * 0.012;
    const e = Math.min(1, g.dropping.t / T);
    g.pv.y = g.dropping.from + (p.y - g.dropping.from) * e * e;
    if (e >= 1) { g.pv.y = p.y; lock(); }
    return;
  }
  g.pv.y += (p.y - g.pv.y) * k;
  if (g.phase !== 'play' || !g.started) return;

  const grounded = collides(gridOf(), p.kind, p.rot, p.x, p.y - 1);
  if (grounded) {
    g.lockT += dt * 1000;
    if (g.lockT >= 480) lock();
  } else {
    g.lockT = 0;
    g.fallT += dt * 1000;
    const iv = soft.on ? Math.min(interval(), 45) : interval();
    while (g.fallT >= iv) { g.fallT -= iv; if (!move(0, -1)) break; if (soft.on && mode === 'inf') g.score += 1; }
  }
  void cs;
}

/* ======================================================================
   操作：手势 + 按钮
   ====================================================================== */
const soft = { on: false };
let touch = null;
$('stage').addEventListener('pointerdown', (e) => {
  if (!g || paused || g.phase === 'over') return;
  touch = { x0: e.clientX, y0: e.clientY, lx: e.clientX, ly: e.clientY, t0: performance.now(), moved: false, softSteps: 0, hist: [] };
  $('stage').setPointerCapture(e.pointerId);
  g.started = true;
});
$('stage').addEventListener('pointermove', (e) => {
  if (!touch || !g.piece) return;
  const step = view.cs * 0.85;
  const dx = e.clientX - touch.lx;
  touch.hist.push({ y: e.clientY, t: performance.now() });
  if (touch.hist.length > 6) touch.hist.shift();
  if (Math.abs(e.clientX - touch.x0) > 8 || Math.abs(e.clientY - touch.y0) > 8) touch.moved = true;
  if (Math.abs(dx) >= step) {
    const n = Math.trunc(dx / step);
    for (let i = 0; i < Math.abs(n); i++) move(Math.sign(n), 0);
    touch.lx += n * step;
  }
  // 慢慢往下拖：加速下落
  const dy = e.clientY - touch.y0;
  soft.on = dy > view.cs * 1.2 && Math.abs(dy) > Math.abs(e.clientX - touch.x0) * 1.3;
});
const endTouch = (e, cancelled) => {
  if (!touch) return;
  const t = touch; touch = null; soft.on = false;
  if (cancelled || !g.piece) return;
  const dt = performance.now() - t.t0;
  if (!t.moved && dt < 320) { rotate(); return; }
  // 快速往下甩：直接落下
  const h = t.hist;
  if (h.length >= 2) {
    const a = h[0], b = h[h.length - 1];
    const v = (b.y - a.y) / Math.max(1, b.t - a.t);
    if (v > 0.9 && e.clientY - t.y0 > 40) hardDrop();
  }
};
$('stage').addEventListener('pointerup', (e) => endTouch(e, false));
$('stage').addEventListener('pointercancel', (e) => endTouch(e, true));

function holdKey(id, fn) {
  const el = $(id);
  let timer = null, rep = null;
  const stop = () => { clearTimeout(timer); clearInterval(rep); el.classList.remove('on'); };
  el.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (!g || paused) return;
    el.classList.add('on');
    g.started = true;
    fn();
    timer = setTimeout(() => { rep = setInterval(fn, 55); }, 170);
  });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => el.addEventListener(ev, stop));
}
holdKey('kLeft', () => move(-1, 0));
holdKey('kRight', () => move(1, 0));
$('kRot').addEventListener('pointerdown', (e) => { e.preventDefault(); if (g && !paused) rotate(); });
$('kDrop').addEventListener('pointerdown', (e) => { e.preventDefault(); if (g && !paused) hardDrop(); });

$('pause').addEventListener('click', pause);
function switchMode(m) {
  if (m === mode) return;
  mode = m;
  hb.save('mode', mode);
  paused = false;
  newGame();
}
$('segLevels').addEventListener('click', () => switchMode('levels'));
$('segInf').addEventListener('click', () => switchMode('inf'));

/* ---------- 和大厅的联动 ---------- */
hb.onPause(pause);
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
hb.onSettings((next) => {
  const prevGhost = cfg.ghost;
  const same = ['cols', 'rows', 'speed', 'layers', 'colors'].every((k) => next[k] === cfg[k]);
  if (same) { cfg = next; return; }
  if (!g.started || g.phase === 'over') { cfg = next; newGame(mode === 'levels' ? g.level : undefined); return; }
  pendingCfg = next;
  cfg = { ...cfg, ghost: next.ghost ?? prevGhost };
  ui();
});

newGame();
requestAnimationFrame(frame);
// 方便自动测试摆局面
window.__blocks = { get g() { return g; }, move, rotate, hardDrop, PALETTE };
