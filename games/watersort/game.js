// 倒水：把同一种颜色的饮料倒进同一个瓶子。
// 两种玩法：
//   闯关：每关随机出题（一定有解），颜色越来越多。
//   无限：15 个瓶子，倒好一瓶它就会被收走，补上一个新瓶子，一直玩下去。
// 画面用 canvas 画（render.js），这里管规则、存档和动画时间线。
import { hub } from '../_shared/hub.js';
import { topRun, isDone, solved, pourAmount, hasUsefulMove, generate, infiniteStart, infiniteNext } from './puzzle.js';
import { makeShape, drawBottle, drawStream } from './render.js';

if (!CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    this.moveTo(x + r, y); this.arcTo(x + w, y, x + w, y + h, r); this.arcTo(x + w, y + h, x, y + h, r);
    this.arcTo(x, y + h, x, y, r); this.arcTo(x, y, x + w, y, r); this.closePath();
  };
}

const hb = hub('watersort');
const $ = (id) => document.getElementById(id);
const canvas = $('canvas');
const ctx = canvas.getContext('2d');

const PALETTE = [
  '#E8322E', // 红
  '#FF8A1F', // 橙
  '#FFCD1F', // 黄
  '#9BD12E', // 草绿
  '#1FA34A', // 绿
  '#33E0BE', // 薄荷
  '#2AB3F5', // 天蓝
  '#2F46E6', // 蓝
  '#A13FE6', // 紫
  '#FF5FA8', // 粉
  '#8A4A2F', // 棕
  '#EDEFF5', // 牛奶白
];
const INF_SLOTS = 15;

const colorsFor = (level, max) => Math.min(max, 3 + Math.floor((level - 1) / 2));
const cfgSig = (c) => `${c.capacity}/${c.empty}/${c.maxColors}/${c.hidden ? 1 : 0}`;
const easeInOut = (x) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2);
const easeOutBack = (x) => 1 + 2.2 * (x - 1) ** 3 + 1.2 * (x - 1) ** 2;
const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (x) => Math.max(0, Math.min(1, x));

let cfg = hb.settings();
const pending = { levels: null, inf: null };
let mode = hb.load('mode', 'levels') === 'inf' ? 'inf' : 'levels';
let s;              // 当前玩法的全部状态（就是存档）
let vis = [];       // 每个瓶子的画面状态
let shape;          // 瓶子形状（所有瓶子一样）
let slots = [];     // 每个瓶子立着时的位置 {x, top}
let geo = { W: 50, L: 14, cg: 12 };
let sel = -1;
let pouring = null; // 正在倒：{a, b, color, n, t, hfBefore}
let stream = null;  // 水流 {a:[x,y], b:[x,y], color, tail, head}
const busy = new Set(); // 正在动画的瓶子，不能点
const anims = new Set();

/* ======================================================================
   存档 / 开局
   ====================================================================== */
const saveKey = () => (mode === 'inf' ? 'inf' : 'save');
const save = () => hb.save(saveKey(), s);
const hidden0 = (b, c) => (c.hidden ? Math.max(0, b.length - 1) : 0);

function startLevel(level) {
  if (pending.levels) { cfg = pending.levels; pending.levels = null; }
  const colors = colorsFor(level, cfg.maxColors);
  const { bottles } = generate(colors, cfg.capacity, cfg.empty);
  s = {
    mode: 'levels', level, cfg: { ...cfg }, cap: cfg.capacity, colors,
    init: bottles.map((b) => b.slice()),
    bottles: bottles.map((b) => b.slice()),
    hf: bottles.map((b) => hidden0(b, cfg)),
    history: [], moves: 0, extraUsed: false, won: false,
  };
  const st = hb.stats();
  if (st.level !== level) { st.level = level; hb.saveStats(st); }
  afterLoad();
  save();
}

function startInfinite() {
  if (pending.inf) { cfg = pending.inf; pending.inf = null; }
  const colors = Math.min(cfg.maxColors, 12, INF_SLOTS - cfg.empty);
  const bottles = infiniteStart(colors, cfg.capacity, INF_SLOTS - cfg.empty, cfg.empty);
  s = {
    mode: 'inf', cfg: { ...cfg }, cap: cfg.capacity, colors,
    bottles, hf: bottles.map((b) => hidden0(b, cfg)),
    history: [], moves: 0, extraUsed: false, score: 0, tray: [],
  };
  afterLoad();
  save();
}

function restartLevel() {
  s.bottles = s.init.map((b) => b.slice());
  s.hf = s.bottles.map((b) => hidden0(b, s.cfg));
  s.history = []; s.moves = 0; s.extraUsed = false; s.won = false;
  afterLoad();
  save();
}

const newVis = () => ({ lift: 0, scale: 1, alpha: 1, cap: 0, capColor: '#fff', glow: 0, dx: 0, free: null, wob: null, surf: null });
const isFull = (i) => { const b = s.bottles[i]; return b.length === s.cap && topRun(b) === s.cap && s.hf[i] === 0; };

/** 换局面以后：重置画面状态、排版 */
function afterLoad() {
  sel = -1; pouring = null; stream = null;
  anims.clear(); busy.clear();
  $('result').hidden = true;
  $('confirm').hidden = true;
  vis = s.bottles.map(() => newVis());
  s.bottles.forEach((b, i) => { if (isFull(i)) { vis[i].cap = 1; vis[i].capColor = PALETTE[b[0]]; } });
  ui();
  layout();
  kick();
}

/* ======================================================================
   排版
   ====================================================================== */
function layout() {
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  const cw = window.innerWidth, ch = window.innerHeight;
  canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr);
  canvas.style.width = `${cw}px`; canvas.style.height = `${ch}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (!s) return;

  const top = document.querySelector('.sub').getBoundingClientRect().bottom + 6;
  const bottom = document.querySelector('.foot').getBoundingClientRect().top - 4;
  const n = s.bottles.length;
  const cols = n <= 5 ? n : n <= 10 ? Math.ceil(n / 2) : Math.ceil(n / 3);
  const rows = Math.ceil(n / cols);
  const RW = cw - 28, RH = bottom - top;
  const cg = cols >= 6 ? 9 : 15;
  const rg = rows >= 3 ? 10 : 24;
  const hf = 0.71 + 0.56 * s.cap; // 瓶高 / 瓶宽
  const extra = 0.36;              // 拿起来的高度 + 影子
  let W = Math.min(64, (RW - (cols - 1) * cg) / cols, (RH - (rows - 1) * rg) / rows / (hf + extra));
  W = Math.max(22, Math.floor(W));
  shape = makeShape(W, s.cap);
  geo = { W, L: W * 0.3, cg };
  const rowH = W * (hf + extra);
  const totalH = rows * rowH + (rows - 1) * rg;
  let y = top + (RH - totalH) / 2 + W * 0.32;
  slots = [];
  for (let r = 0; r < rows; r++) {
    const inRow = Math.min(cols, n - r * cols);
    const rowW = inRow * W + (inRow - 1) * cg;
    let x = (cw - rowW) / 2 + W / 2;
    for (let c = 0; c < inRow; c++) { slots.push({ x, top: y }); x += W + cg; }
    y += rowH + rg;
  }
  window.__slots = slots.map((sl) => ({ x: sl.x, top: sl.top, h: shape.height })); // 方便自动测试
  draw();
}
window.addEventListener('resize', () => { if (!busy.size) layout(); });

/* ======================================================================
   画
   ====================================================================== */
function segsOf(i) {
  const b = s.bottles[i];
  let amounts = b.map(() => 1);
  let colors = b.slice();
  let hfv = s.hf[i];
  if (pouring && pouring.a === i) {
    hfv = Math.min(pouring.hfBefore, b.length);
    colors = colors.concat(-1);
    amounts = amounts.concat(pouring.n * (1 - pouring.t));
  }
  if (pouring && pouring.b === i) {
    let left = pouring.n * (1 - pouring.t);
    for (let k = amounts.length - 1; k >= 0 && left > 0; k--) {
      const d = Math.min(amounts[k], left); amounts[k] -= d; left -= d;
    }
  }
  const segs = [];
  colors.forEach((c, p) => {
    const hid = p < hfv;
    const color = hid ? null : (c === -1 ? pouring.color : PALETTE[c]);
    const last = segs[segs.length - 1];
    if (!hid && last && last.color === color) last.amount += amounts[p];
    else segs.push({ color, amount: amounts[p] });
  });
  return segs;
}

function wobble(v) {
  if (!v.wob) return 0;
  const t = (performance.now() - v.wob.t0) / 1000;
  if (t > 1.4) { v.wob = null; return 0; }
  return v.wob.amp * Math.exp(-4.2 * t) * Math.sin(t * 15);
}

function visFor(i) {
  const v = vis[i], sl = slots[i];
  const base = { cap: v.cap, capColor: v.capColor, glow: v.glow, wobble: wobble(v) };
  if (v.free) return { ...base, anchor: v.free.anchor, pivot: v.free.pivot, rot: v.free.rot, scale: v.free.scale ?? 1, alpha: v.free.alpha ?? 1 };
  return { ...base, anchor: [sl.x + v.dx, sl.top - v.lift * geo.L], pivot: [0, 0], rot: 0, scale: 1, alpha: 1 };
}

function draw() {
  ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
  if (!s || !shape) return;
  const front = [];
  s.bottles.forEach((_, i) => {
    if (vis[i].free) { front.push(i); return; }
    vis[i].surf = drawBottle(ctx, shape, visFor(i), segsOf(i));
  });
  if (stream) drawStream(ctx, stream.a, stream.b, stream.color, geo.W * 0.14, stream.tail, stream.head);
  front.forEach((i) => drawBottle(ctx, shape, visFor(i), segsOf(i)));
}

let raf = 0;
function frame(now) {
  raf = 0;
  for (const a of [...anims]) {
    if (now < a.t0) continue;
    const p = clamp01((now - a.t0) / a.dur);
    a.step(p);
    if (p >= 1) { anims.delete(a); if (a.end) a.end(); }
  }
  draw();
  if (anims.size || vis.some((v) => v.wob)) raf = requestAnimationFrame(frame);
}
function kick() { if (!raf) raf = requestAnimationFrame(frame); }
function animate(dur, step, end) {
  const a = { t0: performance.now(), dur, step, end };
  anims.add(a);
  kick();
}

/* ======================================================================
   界面文字
   ====================================================================== */
function ui() {
  document.body.classList.toggle('inf', mode === 'inf');
  $('segLevels').setAttribute('aria-checked', String(mode === 'levels'));
  $('segInf').setAttribute('aria-checked', String(mode === 'inf'));
  $('seg').classList.toggle('right', mode === 'inf');
  if (mode === 'levels') {
    $('score').textContent = `第 ${s.level} 关`;
    $('info').textContent = `${s.moves} 步`;
  } else {
    $('score').textContent = `${s.score} 瓶`;
    const best = Math.max(hb.stats().infBest || 0, s.score);
    $('info').textContent = `最高 ${best} 瓶 · ${s.moves} 步`;
  }
  $('tray').replaceChildren(...(mode === 'inf' ? s.tray.slice(-12) : []).map((c) => {
    const el = document.createElement('i'); el.style.background = PALETTE[c]; return el;
  }));
  $('undo').disabled = !s.history.length || s.won;
  $('add').disabled = !s.cfg.extra || s.extraUsed || s.won;
  $('notice').hidden = !pending[mode];
  tip();
}

function tip() {
  const el = $('tip');
  el.classList.remove('warn');
  if (s.won) { el.textContent = ''; return; }
  if (!s.moves) {
    el.textContent = mode === 'inf' ? '倒好一瓶就会被收走，再送来一个新瓶子' : '点一个瓶子，再点另一个瓶子倒进去';
    return;
  }
  if (!busy.size && !hasUsefulMove(s.bottles, s.cap)) {
    el.classList.add('warn');
    el.textContent = `没有能倒的了：撤销几步${!s.extraUsed && s.cfg.extra ? '，或者加一个空瓶' : ''}`;
    return;
  }
  el.textContent = '只能倒在同样的颜色上，或者倒进空瓶';
}

/* ======================================================================
   操作
   ====================================================================== */
function setLift(i, on) {
  const v = vis[i];
  const from = v.lift, fromG = v.glow, to = on ? 1 : 0;
  animate(170, (p) => { const e = easeInOut(p); v.lift = lerp(from, to, e); v.glow = lerp(fromG, to, e); });
}

function nope(i) {
  hb.haptic(15);
  const v = vis[i];
  animate(320, (p) => { v.dx = Math.sin(p * Math.PI * 4) * (1 - p) * 5; }, () => { v.dx = 0; });
}

const selectable = (i) => s.bottles[i].length && !isDone(s.bottles[i], s.cap) && !busy.has(i);

function tap(i) {
  if (s.won || busy.has(i)) return;
  if (sel < 0) {
    if (!selectable(i)) { nope(i); return; }
    sel = i; hb.haptic(5); setLift(i, true); return;
  }
  if (sel === i) { setLift(i, false); sel = -1; return; }
  if (pouring) return; // 一次只倒一瓶
  const n = pourAmount(s.bottles, sel, i, s.cap);
  if (n) { const a = sel; sel = -1; pour(a, i, n); return; }
  if (selectable(i)) { setLift(sel, false); sel = i; hb.haptic(5); setLift(i, true); return; }
  nope(i);
}

function snapshot() {
  const snap = { bottles: s.bottles.map((x) => x.slice()), hf: s.hf.slice(), moves: s.moves };
  if (mode === 'inf') { snap.score = s.score; snap.tray = s.tray.slice(); }
  s.history.push(snap);
  if (s.history.length > 200) s.history.shift();
}

function pour(a, b, n) {
  const W = geo.W;
  const lenBefore = s.bottles[a].length;
  const color = PALETTE[s.bottles[a][lenBefore - 1]];
  const hfBefore = s.hf[a];

  // 先改规则上的状态（画面靠 pouring.t 慢慢过渡）
  snapshot();
  for (let k = 0; k < n; k++) s.bottles[b].push(s.bottles[a].pop());
  s.hf[a] = Math.min(s.hf[a], Math.max(0, s.bottles[a].length - 1));
  s.moves++;
  const lenAfter = s.bottles[a].length;
  const completes = s.bottles[b].length === s.cap && topRun(s.bottles[b]) === s.cap;
  if (completes) s.hf[b] = 0;
  pouring = { a, b, color, n, t: 0, hfBefore };
  busy.add(a); busy.add(b);
  ui();

  const sa = slots[a], sb = slots[b];
  const dir = sb.x >= sa.x ? 1 : -1;
  const pivot = shape.lip(dir);
  const v = vis[a];
  const start = [sa.x + pivot[0], sa.top - v.lift * geo.L + pivot[1]];
  const P = [sb.x - dir * W * 0.1, sb.top - W * 0.4];
  const th0 = shape.angleFor(lenBefore) + 0.1;
  v.free = { anchor: start.slice(), pivot, rot: 0 };
  v.glow = 0;

  // ① 拿起来，沿弧线飞到目标瓶口上方，边飞边倾斜
  animate(330, (p) => {
    const e = easeInOut(p);
    v.free.anchor = [lerp(start[0], P[0], e), lerp(start[1], P[1], e) - Math.sin(Math.PI * e) * W * 0.55];
    v.free.rot = dir * th0 * easeInOut(clamp01((p - 0.12) / 0.88));
  }, () => {
    // ② 倒：液面始终水平，这边少多少、那边就涨多少
    hb.haptic(8);
    stream = { a: P.slice(), b: P.slice(), color, tail: 0, head: 0 };
    animate(260 + n * 170, (p) => {
      const e = p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2;
      pouring.t = e;
      v.free.rot = dir * (shape.angleFor(lenAfter + n * (1 - e)) + 0.1);
      const surf = vis[b].surf ?? sb.top + shape.y3;
      stream.a = [P[0] + dir * W * 0.03, P[1] + 1];
      stream.b = [sb.x, Math.max(P[1] + 4, surf)];
      stream.head = clamp01(p / 0.12);
      stream.tail = clamp01((p - 0.86) / 0.14);
    }, () => {
      pouring = null;
      stream = null;
      vis[b].wob = { t0: performance.now(), amp: 0.13 * dir };
      busy.delete(b);
      if (completes) complete(b);
      ui();
      // ③ 回到原位，轻轻晃一下
      const rot0 = v.free.rot;
      const back = [sa.x + pivot[0], sa.top + pivot[1]];
      animate(360, (p) => {
        const e = easeInOut(p);
        v.free.anchor = [lerp(P[0], back[0], e), lerp(P[1], back[1], e) - Math.sin(Math.PI * e) * W * 0.3];
        v.free.rot = rot0 * (1 - easeOutBack(p));
      }, () => {
        v.free = null; v.lift = 0;
        v.wob = { t0: performance.now(), amp: -0.1 * dir };
        busy.delete(a);
        ui();
        save();
        if (mode === 'levels' && !busy.size && solved(s.bottles, s.cap) && !s.won) win();
      });
    });
  });
}

/** 一瓶倒满同色：盖上盖子；无限模式里接着收走、补新瓶 */
function complete(i) {
  const v = vis[i];
  v.capColor = PALETTE[s.bottles[i][0]];
  hb.haptic([10, 40, 10]);
  if (mode === 'levels') {
    busy.add(i);
    animate(320, (p) => { v.cap = easeOutBack(p); }, () => {
      v.cap = 1;
      busy.delete(i);
      if (!busy.size && solved(s.bottles, s.cap) && !s.won) win();
    });
    return;
  }
  busy.add(i);
  const color = s.bottles[i][0];
  animate(300, (p) => { v.cap = easeOutBack(p); }, () => {
    const sl = slots[i];
    const pill = $('score').getBoundingClientRect();
    const from = [sl.x, sl.top];
    const to = [pill.left + pill.width / 2, pill.top + pill.height / 2];
    v.free = { anchor: from.slice(), pivot: [0, 0], rot: 0, scale: 1, alpha: 1 };
    animate(520, (p) => {
      const e = easeInOut(p);
      v.free.anchor = [lerp(from[0], to[0], e), lerp(from[1], to[1], e) - Math.sin(Math.PI * e) * 40];
      v.free.scale = lerp(1, 0.22, e);
      v.free.rot = lerp(0, -0.5, e);
      v.free.alpha = 1 - clamp01((p - 0.6) / 0.4);
    }, () => {
      // 收走：计分，补一个新瓶子
      s.score++;
      s.tray.push(color);
      if (s.tray.length > 30) s.tray.shift();
      const st = hb.stats();
      if (s.score > (st.infBest || 0)) { st.infBest = s.score; hb.saveStats(st); }
      const pill2 = $('score');
      pill2.classList.remove('bump'); void pill2.offsetWidth; pill2.classList.add('bump');
      const nb = infiniteNext(s.bottles, i, s.colors, s.cap);
      s.bottles[i] = nb;
      s.hf[i] = hidden0(nb, s.cfg);
      v.cap = 0;
      v.free = { anchor: [sl.x, sl.top + 50], pivot: [0, 0], rot: 0, scale: 0.85, alpha: 0 };
      ui();
      animate(420, (p) => {
        const e = easeOutBack(p);
        v.free.anchor = [sl.x, lerp(sl.top + 50, sl.top, e)];
        v.free.scale = lerp(0.85, 1, e);
        v.free.alpha = clamp01(p * 2);
      }, () => {
        v.free = null;
        v.wob = { t0: performance.now(), amp: 0.08 };
        busy.delete(i);
        ui();
        save();
      });
    });
  });
}

function undo() {
  if (busy.size || pouring || !s.history.length || s.won) return;
  const prev = s.history.pop();
  // 已经露出来的颜色不再藏回去
  const hf = prev.hf.map((h, i) => Math.min(h, s.hf[i] ?? h));
  s.bottles = prev.bottles; s.hf = hf;
  s.moves = prev.moves ?? Math.max(0, s.moves - 1);
  if (mode === 'inf') { s.score = prev.score ?? s.score; s.tray = prev.tray ?? s.tray; }
  hb.haptic(6);
  afterLoad();
  save();
}

function addBottle() {
  if (busy.size || pouring || s.extraUsed || !s.cfg.extra || s.won) return;
  s.extraUsed = true;
  s.bottles.push([]);
  s.hf.push(0);
  s.history.forEach((h) => { h.bottles.push([]); h.hf.push(0); });
  if (sel >= 0) { vis[sel].lift = 0; vis[sel].glow = 0; sel = -1; }
  vis.push(newVis());
  layout();
  const i = vis.length - 1, v = vis[i], sl = slots[i];
  v.free = { anchor: [sl.x, sl.top + 40], pivot: [0, 0], rot: 0, scale: 0.8, alpha: 0 };
  busy.add(i);
  animate(420, (p) => {
    const e = easeOutBack(p);
    v.free.anchor = [sl.x, lerp(sl.top + 40, sl.top, e)];
    v.free.scale = lerp(0.8, 1, e);
    v.free.alpha = clamp01(p * 2);
  }, () => { v.free = null; busy.delete(i); ui(); });
  hb.haptic(8);
  ui();
  save();
}

/* ======================================================================
   过关 / 重新开始 / 切换玩法
   ====================================================================== */
function win() {
  s.won = true;
  const st = hb.stats();
  st.cleared = (st.cleared || 0) + 1;
  st.level = s.level + 1;
  hb.saveStats(st);
  hb.haptic([12, 60, 12]);
  ui();
  save();
  setTimeout(() => {
    $('result').hidden = false;
    $('resultLevel').textContent = `第 ${s.level} 关`;
    $('resultMeta').innerHTML = `用了 <b>${s.moves}</b> 步 · ${s.colors} 种颜色`;
  }, 700);
}

function askRestart() {
  if (busy.size || pouring) return;
  if (mode === 'levels') { restartLevel(); return; }
  if (!s.moves) { startInfinite(); return; }
  $('confirmMeta').innerHTML = `这一局已经倒好 <b>${s.score}</b> 瓶，重新开始会清空这一局。`;
  $('confirm').hidden = false;
}

function switchMode(m) {
  if (m === mode || busy.size || pouring) return;
  save();
  mode = m;
  hb.save('mode', mode);
  load();
}

function load() {
  const saved = hb.load(saveKey(), null);
  if (mode === 'levels') {
    const st = hb.stats();
    const level = st.level || 1;
    if (st.level && saved && saved.level === level && Array.isArray(saved.bottles) && !saved.won) s = saved;
    else { startLevel(level); return; }
  } else if (saved && Array.isArray(saved.bottles)) {
    s = saved;
  } else { startInfinite(); return; }
  s.mode = mode;
  // 设置改过：这一局还没动过就直接换，否则等下一关 / 重新开始
  if (cfgSig(cfg) !== cfgSig(s.cfg)) {
    if (!s.moves && !s.extraUsed) { if (mode === 'levels') startLevel(s.level); else startInfinite(); return; }
    pending[mode] = cfg;
  }
  s.cfg.extra = cfg.extra;
  afterLoad();
}

/* ======================================================================
   事件
   ====================================================================== */
window.addEventListener('pointerdown', (e) => {
  if (e.target.closest('button, .result, .bar, .foot')) return;
  if (!s || s.won || !shape) return;
  const x = e.clientX, y = e.clientY;
  const half = geo.W / 2 + geo.cg / 2;
  const hit = slots.findIndex((sl) => x >= sl.x - half && x <= sl.x + half && y >= sl.top - geo.L - 10 && y <= sl.top + shape.height + 10);
  if (hit >= 0) tap(hit);
  else if (sel >= 0 && !busy.has(sel)) { setLift(sel, false); sel = -1; } // 点空白处放下
});
$('undo').addEventListener('click', undo);
$('add').addEventListener('click', addBottle);
$('restart').addEventListener('click', askRestart);
$('next').addEventListener('click', () => startLevel(s.level + 1));
$('segLevels').addEventListener('click', () => switchMode('levels'));
$('segInf').addEventListener('click', () => switchMode('inf'));
$('confirmNo').addEventListener('click', () => { $('confirm').hidden = true; });
$('confirmYes').addEventListener('click', () => { $('confirm').hidden = true; startInfinite(); });

hb.onSettings((next) => {
  cfg = next;
  const other = mode === 'levels' ? 'inf' : 'levels';
  pending[other] = null; // 另一种玩法下次进入时会自己对比设置
  if (cfgSig(next) === cfgSig(s.cfg)) { s.cfg.extra = next.extra; ui(); save(); return; }
  if (!s.moves && !s.extraUsed && !s.won && !busy.size) { if (mode === 'levels') startLevel(s.level); else startInfinite(); return; }
  pending[mode] = next;
  s.cfg.extra = next.extra;
  ui();
});

load();
