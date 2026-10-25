// 消灭星星：点一组相连的同色星星消掉，消得越多分越高（颗数² × 5）。
// 闯关：消不动了结算剩余奖励，累计分够目标进下一关。
// 无尽：每走几步从底下升起一行，堆过顶就结束。
import { hub } from '../_shared/hub.js';
import { sound } from '../_shared/sound.js';
import { groupAt, hasMoves, scoreFor, bonusFor, targetFor, makeBoard, makeRow, makeStart, praiseFor, countCells } from './logic.js';

if (!CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    this.moveTo(x + r, y); this.arcTo(x + w, y, x + w, y + h, r); this.arcTo(x + w, y + h, x, y + h, r);
    this.arcTo(x, y + h, x, y, r); this.arcTo(x, y, x + w, y, r); this.closePath();
  };
}

const hb = hub('popstar');
const $ = (id) => document.getElementById(id);
const canvas = $('board'), ctx = canvas.getContext('2d');

const PALETTE = ['#FF4D6A', '#FFC531', '#3DD06B', '#3C9BFF', '#B35CFF', '#FF8A3D']; // 红 黄 绿 蓝 紫 橙

let cfg = hb.settings();
sound.enabled = cfg.sound;
let pendingCfg = null;
let mode = hb.load('mode', 'levels') === 'inf' ? 'inf' : 'levels';
let g = null;
let view = { cs: 30, bx: 0, by: 0, bw: 0, bh: 0, sw: 0, sh: 0, dpr: 1 };
let uid = 1;
let now = 0; // 游戏时间（秒）

/* ======================================================================
   开局 / 存档
   ====================================================================== */
const cell = (color, c, y) => ({ id: uid++, color, x: c, y, vy: 0, squash: 0, wig: 0, dying: false, popT: 0, delay: 0, popped: false });

function base(extra) {
  if (pendingCfg) { cfg = pendingCfg; pendingCfg = null; }
  return {
    mode, C: cfg.cols, R: cfg.rows, colors: cfg.colors, cols: [],
    level: 1, score: 0, shown: 0, levelStart: 0, target: 0, passed: false,
    steps: 0, nextRow: null,
    phase: 'busy', sel: null, particles: [], texts: [], timers: [], shiftAt: 0, onSettle: null,
    dying: 0, touched: false,
    ...extra,
  };
}

/** 新的一盘从上面掉下来 */
function dropIn(colorCols) {
  g.cols = colorCols.map((col, c) => col.map((color, r) => cell(color, c, g.R + 1.5 + r * 1.05 + c * 0.28 + Math.random() * 0.3)));
  while (g.cols.length < g.C) g.cols.push([]);
  g.phase = 'busy';
  g.onSettle = () => { g.phase = 'play'; save(); };
}

function startLevel(level, score) {
  g = base({ level, score, shown: score, levelStart: score });
  g.target = targetFor(level, g.C * g.R);
  const st = hb.stats();
  st.level = level;
  st.levelStart = score;
  st.bestLevel = Math.max(st.bestLevel || 0, level);
  hb.saveStats(st);
  dropIn(makeBoard(g.C, g.R, g.colors));
  banner(`第 ${level} 关`, `目标 ${g.target}`);
  hideCard();
  layout(); ui();
}

function startInf() {
  g = base({});
  const h = Math.max(3, Math.ceil(g.R * 0.5));
  dropIn(makeStart(g.C, h, g.colors));
  g.nextRow = makeRow(colorsOf(), g.C, g.colors);
  banner('无尽模式', `每 ${cfg.riseEvery} 步升起一行`);
  hideCard();
  layout(); ui();
}

const colorsOf = () => g.cols.map((col) => col.map((o) => o.color));

function save() {
  if (!g || g.phase === 'over') return;
  hb.save(mode === 'inf' ? 'inf' : 'lv', {
    C: g.C, R: g.R, colors: g.colors, board: colorsOf(),
    level: g.level, score: g.score, levelStart: g.levelStart, target: g.target, passed: g.passed,
    steps: g.steps, nextRow: g.nextRow, touched: g.touched,
  });
}
const clearSave = () => hb.save(mode === 'inf' ? 'inf' : 'lv', null);

function load() {
  const sv = hb.load(mode === 'inf' ? 'inf' : 'lv', null);
  const fits = sv && sv.C === cfg.cols && sv.R === cfg.rows && sv.colors === cfg.colors && Array.isArray(sv.board);
  if (!fits) {
    if (mode === 'inf') startInf();
    else { const st = hb.stats(); startLevel(st.level || 1, sv && sv.levelStart != null ? sv.levelStart : st.levelStart || 0); }
    return;
  }
  g = base({ ...sv, shown: sv.score });
  g.cols = sv.board.map((col, c) => col.map((color, r) => cell(color, c, r)));
  while (g.cols.length < g.C) g.cols.push([]);
  if (mode === 'inf' && !g.nextRow) g.nextRow = makeRow(colorsOf(), g.C, g.colors);
  g.phase = 'play';
  hideCard();
  layout(); ui();
  if (mode === 'levels' && !hasMoves(colorsOf())) endBoard();
}

/* ======================================================================
   消除
   ====================================================================== */
function pop(group) {
  g.sel = null;
  g.touched = true;
  const n = group.length, pts = scoreFor(n);
  g.score += pts;
  const step = Math.min(0.035, 0.45 / Math.max(1, group[group.length - 1][2]));
  for (const [c, r, d] of group) {
    const o = g.cols[c][r];
    o.dying = true; o.delay = d * step; o.popT = 0;
  }
  g.dying = n;
  g.phase = 'busy';
  // 分数从点的地方飘起来
  const [c0, r0] = group[0];
  const [px, py] = cellXY(c0, r0);
  g.texts.push({ text: `+${pts}`, x: px + view.cs / 2, y: py, t: 0, life: 0.9, size: 18 + Math.min(14, n), color: '#fff' });
  const praise = praiseFor(n);
  if (praise) {
    g.texts.push({ text: praise, x: view.bx + view.bw / 2, y: view.by + view.bh * 0.4, t: 0, life: 1.2, size: 34, color: '#FFD45C', big: true });
    sound.arp([660, 830, 990, 1320].slice(0, n >= 15 ? 4 : n >= 10 ? 3 : 2), { delay: 0.12, vol: 0.12 });
  }
  for (let i = 0; i < Math.min(n, 14); i++) {
    const f = 620 * Math.pow(2, i / 14);
    sound.tone({ f, to: f * 1.7, dur: 0.07, vol: 0.11, delay: (group[i] ? group[i][2] : i) * step });
  }
  hb.haptic(n >= 8 ? [10, 20, 10] : 8);
  g.onSettle = afterMove;
  ui();
}

/** 所有消掉的都爆完了：从列里删掉，空列往左靠 */
function collapse() {
  g.cols = g.cols.map((col) => col.filter((o) => !o.popped)).filter((col) => col.length);
  while (g.cols.length < g.C) g.cols.push([]);
  g.shiftAt = now + 0.2; // 先往下掉，再往左靠
}

function afterMove() {
  if (mode === 'levels') {
    if (!g.passed && g.score >= g.target) {
      g.passed = true;
      g.texts.push({ text: '过关！', x: view.bx + view.bw / 2, y: view.by + view.bh * 0.22, t: 0, life: 1.4, size: 40, color: '#6EF0A0', big: true });
      sound.arp([523, 659, 784, 1046], { vol: 0.14 });
    }
    if (!hasMoves(colorsOf())) { endBoard(); return; }
    g.phase = 'play'; save(); ui();
    return;
  }
  // 无尽
  g.steps++;
  if (countCells(g.cols) === 0) {
    g.score += 2000;
    g.texts.push({ text: '清屏 +2000', x: view.bx + view.bw / 2, y: view.by + view.bh * 0.4, t: 0, life: 1.4, size: 32, color: '#FFD45C', big: true });
  }
  if (g.steps % cfg.riseEvery === 0 || !hasMoves(colorsOf())) { rise(); return; }
  g.phase = 'play'; save(); ui();
}

/** 无尽：底下升起一行 */
function rise() {
  const row = g.nextRow || makeRow(colorsOf(), g.C, g.colors);
  g.cols.forEach((col, c) => col.unshift(cell(row[c], c, -1)));
  g.nextRow = makeRow(colorsOf(), g.C, g.colors);
  g.phase = 'busy';
  sound.hiss({ f: 500, to: 160, dur: 0.22, filter: 'lowpass', vol: 0.18 });
  sound.tone({ f: 140, to: 90, dur: 0.18, vol: 0.12 });
  hb.haptic(10);
  g.onSettle = () => {
    if (g.cols.some((col) => col.length > g.R)) { infOver(); return; }
    if (!hasMoves(colorsOf())) {
      g.texts.push({ text: '没得消了，再升一行', x: view.bx + view.bw / 2, y: view.by + view.bh * 0.3, t: 0, life: 1.1, size: 18, color: '#fff' });
      later(0.5, rise);
      return;
    }
    g.phase = 'play'; save(); ui();
  };
  ui();
}

/* ======================================================================
   结算
   ====================================================================== */
function endBoard() {
  g.phase = 'end';
  g.sel = null;
  const rest = [];
  g.cols.forEach((col, c) => col.forEach((o, r) => rest.push([c, r])));
  const k = rest.length, bonus = bonusFor(k);
  const cx = view.bx + view.bw / 2, cy = view.by + view.bh * 0.36;
  g.texts.push({ text: `剩下 ${k} 颗`, x: cx, y: cy, t: 0, life: 1.9, size: 22, color: '#fff', hold: true });
  g.texts.push({ text: bonus ? `奖励 ${bonus}` : '没有奖励', x: cx, y: cy + 38, t: 0, life: 1.9, size: bonus ? 32 : 22, color: bonus ? '#FFD45C' : 'rgba(255,255,255,.7)', big: !!bonus, hold: true });
  if (bonus) sound.arp([784, 988, 1175], { vol: 0.12 });
  later(0.7, () => {
    if (!k) { finishBoard(bonus); return; }
    const step = Math.min(0.08, 1.6 / k);
    rest.sort((a, b) => a[1] - b[1] || a[0] - b[0]);
    rest.forEach(([c, r], i) => {
      const o = g.cols[c][r];
      o.dying = true; o.delay = i * step; o.popT = 0;
      if (i % 2 === 0 && i < 40) sound.tone({ f: 500 + (i % 8) * 40, to: 900, dur: 0.06, vol: 0.07, delay: i * step });
    });
    g.dying = k;
    g.onSettle = () => finishBoard(bonus);
  });
  ui();
}

function finishBoard(bonus) {
  g.score += bonus;
  const st = hb.stats();
  st.best = Math.max(st.best || 0, g.score);
  hb.saveStats(st);
  ui();
  if (g.score >= g.target) {
    hb.haptic([12, 60, 12]);
    later(0.9, () => startLevel(g.level + 1, g.score));
    return;
  }
  g.phase = 'over';
  clearSave();
  sound.arp([392, 330, 262], { gap: 0.12, vol: 0.12, type: 'sine' });
  later(0.5, () => showCard({
    title: '没过关', big: `${g.score}`,
    meta: `第 ${g.level} 关目标 <b>${g.target}</b>，还差 <b>${g.target - g.score}</b> 分`,
    main: ['重来这关', () => startLevel(g.level, g.levelStart)],
    alt: g.level > 1 ? ['从第 1 关开始', () => startLevel(1, 0)] : null,
  }));
}

function infOver() {
  g.phase = 'over';
  clearSave();
  const st = hb.stats();
  const prev = st.infBest || 0;
  if (g.score > prev) { st.infBest = g.score; hb.saveStats(st); }
  hb.haptic([30, 40, 30]);
  sound.hiss({ f: 800, to: 100, dur: 0.6, filter: 'lowpass', vol: 0.25 });
  sound.arp([392, 330, 262], { gap: 0.14, vol: 0.12, type: 'sine', delay: 0.2 });
  later(0.6, () => showCard({
    title: g.score > prev && prev > 0 ? '新纪录！' : '堆到顶了', big: `${g.score}`,
    meta: `最高 <b>${Math.max(prev, g.score)}</b> 分`,
    main: ['再来一局', startInf],
  }));
}

/* ======================================================================
   卡片 / 提示条
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
$('cardMain').addEventListener('click', () => { const f = cardActions.main; hideCard(); if (f) f(); });
$('cardAlt').addEventListener('click', () => { const f = cardActions.alt; hideCard(); if (f) f(); });

function banner(title, sub) {
  const b = $('banner');
  $('bannerTitle').textContent = title;
  $('bannerSub').textContent = sub;
  b.hidden = true; void b.offsetWidth; b.hidden = false;
  clearTimeout(banner.t);
  banner.t = setTimeout(() => { b.hidden = true; }, 1750);
}

function ui() {
  if (g.shown === g.score) $('score').textContent = String(g.score);
  document.body.classList.toggle('inf', mode === 'inf');
  $('segLevels').setAttribute('aria-checked', String(mode === 'levels'));
  $('segInf').setAttribute('aria-checked', String(mode === 'inf'));
  $('seg').classList.toggle('right', mode === 'inf');
  if (mode === 'levels') {
    $('goal').innerHTML = `<span>第 <b>${g.level}</b> 关 · 目标 <b>${g.target}</b></span><span>最高 ${Math.max(hb.stats().best || 0, g.score)}</span>`;
    const from = g.levelStart, pct = g.target > from ? ((g.score - from) / (g.target - from)) * 100 : 100;
    $('meter').style.width = `${Math.max(0, Math.min(100, pct))}%`;
    $('meter').classList.toggle('done', g.score >= g.target);
  } else {
    const left = cfg.riseEvery - (g.steps % cfg.riseEvery);
    $('goal').innerHTML = `<span>再 <b>${left}</b> 步升起一行</span><span>最高 ${Math.max(hb.stats().infBest || 0, g.score)}</span>`;
    const dots = $('steps');
    dots.replaceChildren(...Array.from({ length: cfg.riseEvery }, (_, i) => {
      const el = document.createElement('i');
      if (i < g.steps % cfg.riseEvery) el.className = 'on';
      return el;
    }));
  }
  $('tip').textContent = pendingCfg ? '新设置会在下一盘生效'
    : cfg.confirm ? '点一组相连的同色星星，再点一下消掉' : '点一组相连的同色星星消掉';
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
  const extraRow = mode === 'inf' ? 0.9 : 0; // 无尽模式底下露出下一行
  const cs = Math.floor(Math.min((st.width - 20) / g.C, (st.height - 20) / (g.R + extraRow)));
  const bw = cs * g.C, bh = cs * g.R;
  view = { cs, bw, bh, bx: Math.round((st.width - bw) / 2), by: Math.round((st.height - bh - extraRow * cs) / 2), sw: st.width, sh: st.height, dpr };
  sprites.clear();
  stars = Array.from({ length: 36 }, () => ({ x: Math.random() * st.width, y: Math.random() * st.height, r: 0.6 + Math.random() * 1.2, p: Math.random() * 6.28, s: 0.6 + Math.random() * 1.6 }));
}
window.addEventListener('resize', layout);
let stars = [];

const cellXY = (c, r) => [view.bx + c * view.cs, view.by + (g.R - 1 - r) * view.cs];

function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  let r = n >> 16, gg = (n >> 8) & 255, b = n & 255;
  if (k >= 0) { r += (255 - r) * k; gg += (255 - gg) * k; b += (255 - b) * k; } else { r *= 1 + k; gg *= 1 + k; b *= 1 + k; }
  return `rgb(${r | 0},${gg | 0},${b | 0})`;
}

function starPath(x, cx, cy, R, r, rot = -Math.PI / 2) {
  x.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = rot + (i * Math.PI) / 5, rr = i % 2 ? r : R;
    const px = cx + Math.cos(a) * rr, py = cy + Math.sin(a) * rr;
    if (i) x.lineTo(px, py); else x.moveTo(px, py);
  }
  x.closePath();
}

// 方块贴图缓存
const sprites = new Map();
function tileSprite(color, cs, dpr) {
  const key = `t${color}|${cs}|${dpr}`;
  if (sprites.has(key)) return sprites.get(key);
  const c = document.createElement('canvas');
  c.width = c.height = Math.ceil(cs * dpr);
  const x = c.getContext('2d');
  x.scale(dpr, dpr);
  const m = Math.max(1, cs * 0.045), s = cs - m * 2, rad = s * 0.2;
  // 底部厚度
  x.fillStyle = shade(color, -0.4);
  x.beginPath(); x.roundRect(m, m + s * 0.05, s, s * 0.95, rad); x.fill();
  // 主体
  const gr = x.createLinearGradient(0, m, 0, m + s);
  gr.addColorStop(0, shade(color, 0.38));
  gr.addColorStop(0.5, color);
  gr.addColorStop(1, shade(color, -0.15));
  x.fillStyle = gr;
  x.beginPath(); x.roundRect(m, m, s, s * 0.92, rad); x.fill();
  // 内圈亮边
  x.strokeStyle = 'rgba(255,255,255,.28)';
  x.lineWidth = Math.max(1, s * 0.035);
  x.beginPath(); x.roundRect(m + s * 0.05, m + s * 0.05, s * 0.9, s * 0.82, rad * 0.8); x.stroke();
  // 星星：先画一层影子，再画亮色星星，像压出来的
  const cx = cs / 2, cy = m + s * 0.48, R = s * 0.33, r = s * 0.145;
  x.lineJoin = 'round';
  starPath(x, cx, cy + s * 0.04, R, r);
  x.fillStyle = shade(color, -0.32); x.strokeStyle = shade(color, -0.32); x.lineWidth = s * 0.06;
  x.fill(); x.stroke();
  starPath(x, cx, cy, R, r);
  const sg = x.createLinearGradient(0, cy - R, 0, cy + R);
  sg.addColorStop(0, shade(color, 0.75));
  sg.addColorStop(1, shade(color, 0.32));
  x.fillStyle = sg; x.strokeStyle = sg;
  x.fill(); x.stroke();
  // 星星上的高光
  x.save();
  starPath(x, cx, cy, R, r); x.clip();
  x.fillStyle = 'rgba(255,255,255,.55)';
  x.beginPath(); x.ellipse(cx - R * 0.25, cy - R * 0.45, R * 0.55, R * 0.3, -0.5, 0, Math.PI * 2); x.fill();
  x.restore();
  // 顶部光泽
  x.fillStyle = 'rgba(255,255,255,.3)';
  x.beginPath(); x.roundRect(m + s * 0.12, m + s * 0.07, s * 0.76, s * 0.11, s * 0.055); x.fill();
  sprites.set(key, c);
  return c;
}

function sparkSprite(color, size, dpr) {
  const key = `p${color}|${size}|${dpr}`;
  if (sprites.has(key)) return sprites.get(key);
  const c = document.createElement('canvas');
  c.width = c.height = Math.ceil(size * dpr);
  const x = c.getContext('2d');
  x.scale(dpr, dpr);
  x.lineJoin = 'round';
  starPath(x, size / 2, size / 2, size * 0.46, size * 0.2);
  x.fillStyle = shade(color, 0.25); x.fill();
  starPath(x, size / 2, size / 2, size * 0.22, size * 0.1);
  x.fillStyle = 'rgba(255,255,255,.85)'; x.fill();
  sprites.set(key, c);
  return c;
}

function burst(o, c, r) {
  const [px, py] = cellXY(o.x, o.y);
  const color = PALETTE[o.color];
  const cs = view.cs;
  for (let k = 0; k < 7; k++) {
    const a = Math.random() * Math.PI * 2, v = cs * (2.5 + Math.random() * 5);
    g.particles.push({ x: px + cs / 2, y: py + cs / 2, vx: Math.cos(a) * v, vy: Math.sin(a) * v - cs * 3, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 10, life: 0, max: 0.5 + Math.random() * 0.35, color, size: cs * (0.28 + Math.random() * 0.22) });
  }
  void c; void r;
}

function draw(dt) {
  const { cs, bx, by, bw, bh, dpr } = view;
  ctx.clearRect(0, 0, view.sw, view.sh);
  // 背景里闪烁的小星星
  for (const s of stars) {
    s.p += dt * s.s;
    ctx.globalAlpha = 0.25 + 0.35 * (0.5 + 0.5 * Math.sin(s.p));
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
  if (!g) return;

  // 棋盘底板
  ctx.fillStyle = 'rgba(6, 10, 40, .5)';
  ctx.beginPath(); ctx.roundRect(bx - 6, by - 6, bw + 12, bh + 12, 16); ctx.fill();
  ctx.strokeStyle = 'rgba(150, 165, 255, .2)'; ctx.lineWidth = 1.5; ctx.stroke();

  // 无尽：快到顶了，顶上那行变红
  if (mode === 'inf') {
    const top = Math.max(...g.cols.map((c) => c.length));
    if (top >= g.R - 1) {
      ctx.fillStyle = `rgba(255, 70, 100, ${0.12 + 0.08 * Math.sin(now * 6)})`;
      ctx.fillRect(bx, by, bw, cs);
    }
    // 下一行预告
    if (g.nextRow) {
      ctx.save();
      ctx.beginPath(); ctx.rect(bx - 6, by + bh + 6, bw + 12, cs); ctx.clip();
      ctx.globalAlpha = 0.38;
      g.nextRow.forEach((color, c) => ctx.drawImage(tileSprite(PALETTE[color], cs, dpr), bx + c * cs, by + bh + 8, cs, cs));
      ctx.restore();
    }
  }

  // 方块
  const selKeys = g.sel ? g.sel.keys : null;
  const pulse = 0.5 + 0.5 * Math.sin(now * 8);
  ctx.save();
  ctx.beginPath(); ctx.rect(bx - 6, by - 6, bw + 12, bh + 12); ctx.clip();
  g.cols.forEach((col, c) => col.forEach((o, r) => {
    if (o.popped) return;
    const [px, py] = cellXY(o.x, o.y);
    const spr = tileSprite(PALETTE[o.color], cs, dpr);
    let sx = 1, sy = 1, ox = 0;
    if (o.squash > 0) { sy = 1 - 0.13 * o.squash; sx = 1 + 0.07 * o.squash; }
    if (o.wig > 0) ox = Math.sin(o.wig * 30) * o.wig * cs * 0.08;
    if (o.dying && o.popT > 0) { const k = 1 + (o.popT / 0.12) * 0.28; sx *= k; sy *= k; }
    const sel = selKeys && selKeys.has(`${c},${r}`);
    if (sel) { const k = 1.03 + 0.03 * pulse; sx *= k; sy *= k; }
    const w = cs * sx, h = cs * sy;
    const dx = px + (cs - w) / 2 + ox, dy = py + (cs - h) - (sel ? 0 : 0);
    if (sel) {
      ctx.save();
      ctx.shadowColor = 'rgba(255,255,255,.9)'; ctx.shadowBlur = cs * 0.35;
      ctx.drawImage(spr, dx, dy, w, h);
      ctx.restore();
      ctx.strokeStyle = `rgba(255,255,255,${0.6 + 0.4 * pulse})`; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.roundRect(dx + 2, dy + 2, w - 4, h - 4, cs * 0.2); ctx.stroke();
    } else {
      ctx.drawImage(spr, dx, dy, w, h);
    }
    if (o.dying && o.popT > 0) {
      ctx.fillStyle = `rgba(255,255,255,${Math.min(0.9, o.popT / 0.12)})`;
      ctx.beginPath(); ctx.roundRect(dx + 2, dy + 2, w - 4, h - 4, cs * 0.2); ctx.fill();
    }
  }));
  ctx.restore();

  // 碎星星
  for (const p of g.particles) {
    const a = 1 - p.life / p.max;
    if (a <= 0) continue;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.translate(p.x, p.y); ctx.rotate(p.rot);
    const s = p.size * (0.6 + 0.4 * a);
    ctx.drawImage(sparkSprite(p.color, Math.round(view.cs * 0.5), dpr), -s / 2, -s / 2, s, s);
    ctx.restore();
  }

  // 飘字
  for (const t of g.texts) {
    const k = t.t / t.life;
    const a = t.t < 0.12 ? t.t / 0.12 : k > 0.7 ? Math.max(0, 1 - (k - 0.7) / 0.3) : 1;
    const s = t.big ? 1 + 0.35 * Math.max(0, 1 - t.t * 5) : 1;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.translate(t.x, t.y - (t.hold ? 0 : t.t * 46));
    ctx.scale(s, s);
    ctx.font = `900 ${t.size}px -apple-system, "PingFang SC", sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(4, t.size * 0.2); ctx.strokeStyle = 'rgba(16, 20, 70, .85)'; ctx.strokeText(t.text, 0, 0);
    ctx.fillStyle = t.color; ctx.fillText(t.text, 0, 0);
    ctx.restore();
  }
}

/* ======================================================================
   主循环
   ====================================================================== */
function later(sec, fn) { g.timers.push({ at: now + sec, fn }); }

function settled() {
  if (g.dying > 0) return false;
  for (let c = 0; c < g.cols.length; c++) {
    const col = g.cols[c];
    for (let r = 0; r < col.length; r++) { const o = col[r]; if (o.y !== r || o.x !== c || o.vy) return false; }
  }
  return true;
}

function update(dt) {
  now += dt;
  // 定时器
  if (g.timers.length) {
    const due = g.timers.filter((t) => t.at <= now);
    g.timers = g.timers.filter((t) => t.at > now);
    due.forEach((t) => t.fn());
  }
  // 消除的动画
  if (g.dying > 0) {
    let left = 0;
    g.cols.forEach((col, c) => col.forEach((o, r) => {
      if (!o.dying || o.popped) return;
      if (o.delay > 0) { o.delay -= dt; left++; return; }
      o.popT += dt;
      if (o.popT >= 0.12) { o.popped = true; burst(o, c, r); } else left++;
    }));
    if (!left) { g.dying = 0; collapse(); }
  }
  // 下落 / 升起 / 左移
  g.cols.forEach((col, c) => col.forEach((o, r) => {
    if (o.y > r) {
      o.vy += 46 * dt;
      o.y -= o.vy * dt;
      if (o.y <= r) { o.y = r; if (o.vy > 5) o.squash = Math.min(1, o.vy / 16); o.vy = 0; }
    } else if (o.y < r) {
      o.y += (r - o.y) * (1 - Math.exp(-dt * 13));
      if (r - o.y < 0.003) o.y = r;
    }
    if (o.x !== c && now >= g.shiftAt) {
      o.x += (c - o.x) * (1 - Math.exp(-dt * 12));
      if (Math.abs(c - o.x) < 0.003) o.x = c;
    }
    if (o.squash > 0) o.squash = Math.max(0, o.squash - dt * 7);
    if (o.wig > 0) o.wig = Math.max(0, o.wig - dt * 2.6);
  }));
  // 粒子、飘字
  for (const p of g.particles) { p.life += dt; p.vy += view.cs * 22 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt; }
  g.particles = g.particles.filter((p) => p.life < p.max);
  for (const t of g.texts) t.t += dt;
  g.texts = g.texts.filter((t) => t.t < t.life);
  // 分数滚动
  if (g.shown !== g.score) {
    const d = g.score - g.shown;
    g.shown = Math.abs(d) < 2 ? g.score : g.shown + d * (1 - Math.exp(-dt * 10));
    const pill = $('score');
    const txt = String(Math.round(g.shown));
    if (pill.textContent !== txt) pill.textContent = txt;
    if (g.shown === g.score) { pill.classList.remove('bump'); void pill.offsetWidth; pill.classList.add('bump'); }
  }
  if (g.onSettle && settled()) { const f = g.onSettle; g.onSettle = null; f(); }
}

let last = performance.now();
function frame(t) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (t - last) / 1000);
  last = t;
  if (g) update(dt);
  draw(dt);
}

/* ======================================================================
   点击
   ====================================================================== */
canvas.addEventListener('pointerdown', (e) => {
  if (!g || g.phase !== 'play') return;
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left, y = e.clientY - rect.top;
  const c = Math.floor((x - view.bx) / view.cs);
  const r = g.R - 1 - Math.floor((y - view.by) / view.cs);
  if (c < 0 || c >= g.C || r < 0 || r >= g.R || !g.cols[c][r]) {
    if (g.sel) { g.sel = null; }
    return;
  }
  const grp = groupAt(colorsOf(), c, r);
  if (grp.length < 2) {
    g.cols[c][r].wig = 1;
    g.sel = null;
    sound.tone({ f: 200, dur: 0.07, type: 'square', vol: 0.035 });
    hb.haptic(12);
    return;
  }
  if (cfg.confirm) {
    if (g.sel && g.sel.keys.has(`${c},${r}`)) { pop(g.sel.list); return; }
    g.sel = { keys: new Set(grp.map(([a, b]) => `${a},${b}`)), list: grp, n: grp.length };
    sound.tone({ f: 880, dur: 0.05, type: 'triangle', vol: 0.08 });
    hb.haptic(5);
    return;
  }
  pop(grp);
});

function askRestart() {
  if (!g) return;
  if (g.phase === 'over') return;
  if (!g.touched && g.phase === 'play') { if (mode === 'inf') startInf(); else startLevel(g.level, g.levelStart); return; }
  showCard(mode === 'inf'
    ? { title: '重新开始无尽模式？', meta: `这一局已经 <b>${g.score}</b> 分了`, main: ['重新开始', startInf], alt: ['继续玩', null] }
    : { title: `重来第 ${g.level} 关？`, meta: `分数回到这关开始时的 <b>${g.levelStart}</b>`, main: ['重来', () => startLevel(g.level, g.levelStart)], alt: ['继续玩', null] });
}
$('restart').addEventListener('click', askRestart);

function switchMode(m) {
  if (m === mode) return;
  if (g && g.phase !== 'over') save();
  mode = m;
  hb.save('mode', mode);
  load();
}
$('segLevels').addEventListener('click', () => switchMode('levels'));
$('segInf').addEventListener('click', () => switchMode('inf'));

/* ---------- 和大厅的联动 ---------- */
hb.onSettings((next) => {
  sound.enabled = next.sound;
  const same = ['cols', 'rows', 'colors'].every((k) => next[k] === cfg[k]);
  const keep = { cols: cfg.cols, rows: cfg.rows, colors: cfg.colors };
  if (same) { cfg = next; ui(); return; }
  if (!g.touched && g.phase === 'play') { cfg = next; if (mode === 'inf') startInf(); else startLevel(g.level, g.levelStart); return; }
  pendingCfg = next;
  cfg = { ...next, ...keep };
  ui();
});
hb.onPause(() => { if (g) save(); });

load();
requestAnimationFrame(frame);
window.__pop = { get g() { return g; }, pop, groupAt, colorsOf, view: () => view }; // 方便自动测试
