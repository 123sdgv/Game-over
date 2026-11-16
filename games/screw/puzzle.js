// 拧螺丝的拼图画面：规则在 logic.js（总是先算完），这里只照着事件放动画。
// 画面上的东西：玻璃板（按层画，最上面的最后画）、板上的螺丝、飞行中的螺丝、四个工具箱、暂存格。
import { sound } from '../_shared/sound.js';
import { sfx } from './sfx.js';
import { COLORS, SPECIAL, TINTS, headSprite, shadowSprite, lockedColor, plateSprite, plateShadow, drawBox, drawLid, boxSlots, drawStageHole, screwIcon } from './art.js';
import { plateGeom } from './levels.js';
import { tap, addSlot, clearBox, melt, status, screwFree, placeFor, plateFree, MAX_STAGE } from './logic.js';

const $ = (id) => document.getElementById(id);
const cv = $('cv'), g = cv.getContext('2d');
const easeOut = (k) => 1 - (1 - k) ** 3;
const easeInOut = (k) => (k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2);
const backOut = (k) => { const c = 1.6; return 1 + (c + 1) * (k - 1) ** 3 + c * (k - 1) ** 2; };
const lerp = (a, b, t) => a + (b - a) * t;

let s = null;            // 规则状态
let hooks = {};
let S = { speed: 2 };
let L = null;            // 版面
let geo = [];            // 每块板：{ poly, cx, cy, sprite, shadow }
let vp = [];             // 每块板的画面状态：{ gone(开始掉了), fall }
let vs = [];             // 每颗螺丝：{ state: 'in'|'fly'|'done', pulse, shake }
let flights = [];
let boxQ = [[], [], [], []]; // 每个位置排着的箱子（第一个是看得见的）
let leaving = [];
let vstage = [];         // 暂存格：{ occ: 螺丝 id | null, pop, color, sp }
let texts = [], sparks = [];
let gotShown = 0, gotPulse = 0;
let picking = false;     // 「清空孔位」在等你点箱子
let stuckShown = false, winAt = -1;
let T = 0, running = false, raf = 0, last = 0, dirty = true;
let delayed = [];
let shakeStage = 0;
let highlight = null;    // 点了被压住的螺丝：把压着它的板子描一下 { plates, t }

const after = (sec, fn) => delayed.push({ at: T + sec, fn });
const rot0 = (j) => 0.3 + ((j * 1.7) % 1.2);

/* ======================================================================
   版面
   ====================================================================== */
export function measure() {
  const W = innerWidth, H = innerHeight;
  const cs = getComputedStyle(document.documentElement);
  const safeT = parseFloat(cs.getPropertyValue('--safe-t')) || 0;
  const safeB = parseFloat(cs.getPropertyValue('--safe-b')) || 0;
  const head = Math.max(safeT, 10) + 6 + 44;
  const bw = Math.min(96, (W - 24 - 3 * 9) / 4);
  const bh = Math.round(Math.min(84, Math.max(62, H * 0.088)));
  const boxTop = head + 6;
  const gap = (W - bw * 4) / 5;
  const boxes = [0, 1, 2, 3].map((i) => ({ x: gap + i * (bw + gap), y: boxTop, w: bw, h: bh }));
  const stageTop = boxTop + bh + 8;
  const skillsH = 64;
  const bottom = H - safeB - 26 - skillsH - 6;
  return { W, H, head, boxes, bw, bh, stageTop, bottom, safeB, skillsH };
}

/** 生成关卡时用的棋盘宽高比 */
export function boardAspect(cap = 6) {
  const m = measure();
  const sr = boxSlots(m.bw, m.bh, cap).sr;
  const stageH = sr * 2.4 + 14;
  const top = m.stageTop + stageH + 10;
  return (m.W - 16) / Math.max(200, m.bottom - top);
}

function layout() {
  const m = measure();
  const dpr = Math.min(3, devicePixelRatio || 1);
  cv.width = Math.round(m.W * dpr); cv.height = Math.round(m.H * dpr);
  const { slots, sr } = boxSlots(m.bw, m.bh, s ? s.cap : 6);
  const stageH = sr * 2.4 + 14;
  const stageY = m.stageTop + stageH / 2;
  const boardTop = m.stageTop + stageH + 10;
  const aw = m.W - 16, ah = m.bottom - boardTop;
  const k = s ? Math.min(aw / s.W, ah / s.H) : 1;
  const bx = (m.W - (s ? s.W : 360) * k) / 2;
  const by = boardTop + (ah - (s ? s.H : 400) * k) / 2;
  L = { ...m, dpr, slots, sr, stageY, stageH, k, bx, by, boardTop, ah };
  buildGeo();
  dirty = true;
}

function stageXs(n = vstage.length) {
  const hole = L.sr * 2.4, gap = Math.min(14, (L.W - 40 - hole * n) / Math.max(1, n - 1));
  const total = n * hole + (n - 1) * gap;
  const x0 = (L.W - total) / 2 + hole / 2;
  return Array.from({ length: n }, (_, i) => x0 + i * (hole + gap));
}
const stagePos = (i) => [stageXs()[i], L.stageY];

function buildGeo() {
  if (!s) return;
  const K = L.k * L.dpr;
  geo = s.plates.map((p) => {
    const pts = p.screws.map((j) => [s.screws[j].x, s.screws[j].y]);
    const gm = plateGeom(p, s.r, pts);
    let cx = 0, cy = 0;
    gm.poly.forEach(([x, y]) => { cx += x; cy += y; });
    cx /= gm.poly.length; cy /= gm.poly.length;
    return {
      poly: gm.poly, cx, cy,
      sprite: plateSprite(gm.poly, pts, s.r, TINTS[p.tint % TINTS.length], K, gm.hub),
      shadow: plateShadow(gm.poly, K),
    };
  });
}

const sx = (x) => L.bx + x * L.k;
const sy = (y) => L.by + y * L.k;

/* ======================================================================
   开局 / 读档
   ====================================================================== */
export function setup(opts) { hooks = opts.hooks; S = opts.settings || S; }
export function setSettings(next) { S = next; }

function newBoxInst(uid, c, n, ready = true) {
  return {
    uid, c, color: c >= 0 ? COLORS[c].base : null, colorT: c >= 0 ? 1 : 0, lid: c >= 0 ? 0 : 1,
    lidTo: c >= 0 ? 0 : 1, n, pending: 0, collect: false, state: ready ? 'ready' : 'wait', t: 0, dy: 0, alpha: 1, bump: 0,
  };
}

/** 打开一局（新的或读档的） */
export function open(state) {
  s = state;
  flights = []; leaving = []; texts = []; sparks = []; delayed = [];
  picking = false; stuckShown = false; winAt = -1; highlight = null;
  layout();
  vp = s.plates.map((p) => ({ gone: p.gone, fall: null, done: p.gone }));
  vs = s.screws.map((sc) => ({ state: sc.out ? 'done' : 'in', pulse: 0, shake: 0 }));
  boxQ = s.boxes.map((b) => [newBoxInst(b.uid, b.c, b.n)]);
  vstage = s.stage.map((x) => ({ occ: x ? x.id : null, c: x ? x.c : -1, pop: 0, melt: 0, add: 1 }));
  const got = s.got.c.reduce((a, b) => a + b, 0) + s.got.s;
  gotShown = got;
  $('gotIcon').src = screwIcon(COLORS[0].base, 40);
  updateHud();
  $('pickTip').hidden = true;
  document.body.classList.remove('picking');
  start();
  const st = status(s);
  if (st === 'stuck') after(0.4, showStuck);
  if (st === 'win') winAt = 0.4;          // 过关动画没放完就退出了：回来直接结算
}

export function close() { stop(); s = null; }
export const state = () => s;

function updateHud() {
  $('lvTitle').textContent = s.n > 15 ? `第 ${s.n} 关 · 无限` : `第 ${s.n} 关`;
  $('lvFill').style.width = `${(s.removed / s.screws.length) * 100}%`;
  $('gotN').textContent = gotShown;
  $('skMelt').classList.toggle('off', !s.stage.some(Boolean));
  $('skClear').classList.toggle('off', !s.boxes.some((b) => b.c >= 0));
  $('skAdd').classList.toggle('off', s.stage.length >= MAX_STAGE);
}

/* ======================================================================
   事件 → 动画
   ====================================================================== */
const speed = () => [0.75, 1, 1.35][S.speed - 1] || 1;

function screwPos(id) { const sc = s.screws[id]; return [sx(sc.x), sy(sc.y)]; }
const rBoard = () => s.r * L.k;

function boxInst(i, uid) { return boxQ[i].find((b) => b.uid === uid); }
function boxXY(i, inst) {
  const B = L.boxes[i];
  return [B.x, B.y + (inst ? inst.dy : 0)];
}
function slotXY(i, slot, uid) {
  const inst = boxInst(i, uid);
  const [x, y] = boxXY(i, inst && boxQ[i][0] === inst ? inst : null);
  const [ox, oy] = L.slots[Math.min(slot, L.slots.length - 1)];
  return [x + ox, y + oy];
}
function pillXY() {
  const r = $('gotPill').getBoundingClientRect();
  return [r.left + 16, r.top + r.height / 2];
}

function targetXY(f) {
  const to = f.to;
  if (to.kind === 'box') return slotXY(to.i, to.slot, to.uid);
  if (to.kind === 'stage') return stagePos(to.i);
  return pillXY();
}
function targetR(f) { return f.to.kind === 'bank' ? 9 : L.sr; }

/** 落地前要满足的条件：箱子已经在那儿了 / 暂存格空着 */
function canLand(f) {
  const to = f.to;
  if (to.kind === 'box') { const b = boxInst(to.i, to.uid); return b && boxQ[to.i][0] === b && b.state === 'ready'; }
  if (to.kind === 'stage') return vstage[to.i] && vstage[to.i].occ == null;
  return true;
}

function land(f) {
  const to = f.to;
  if (to.kind === 'box') {
    const b = boxInst(to.i, to.uid);
    b.n++; b.pending--; b.bump = 1;
    sfx.clink(b.n);
    hb_haptic(6);
  } else if (to.kind === 'stage') {
    const v = vstage[to.i];
    v.occ = f.id; v.c = f.c; v.pop = 1;
    sfx.stage();
  } else {
    bumpGot(1);
    sfx.bank();
    spark(...pillXY(), '#FFE680', 10);
  }
  dirty = true;
}
let hb_haptic = () => {};

function bumpGot(n) {
  gotShown += n; gotPulse = 1;
  $('gotN').textContent = gotShown;
  const el = $('gotPill');
  el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump');
}

function play(ev) {
  let fallDelay = 0;
  for (const e of ev) {
    if (e.t === 'out') {
      const [x, y] = screwPos(e.id);
      vs[e.id].state = 'fly';
      const sc = s.screws[e.id];
      flights.push({ id: e.id, c: e.c, sp: sc.sp, x0: x, y0: y, r0: rBoard(), to: e.to, phase: 'unscrew', t: 0, rot: rot0(e.id), fromBoard: true });
      if (e.to.kind === 'box') { const b = boxInst(e.to.i, e.to.uid); if (b) b.pending++; }
      sfx.unscrew();
      fallDelay = 0.13;
    } else if (e.t === 'bind') {
      const b = boxInst(e.i, e.uid);
      if (b) { b.c = e.c; b.color = COLORS[e.c].base; b.lidTo = 0; }
    } else if (e.t === 'collect') {
      const b = boxInst(e.i, e.uid);
      if (b) { b.collect = true; b.forced = e.forced; b.got = e.n; }
    } else if (e.t === 'newbox') {
      boxQ[e.i].push(newBoxInst(e.uid, -1, 0, false));
    } else if (e.t === 'transfer') {
      flights.push({ id: e.id, c: e.c, to: e.to, phase: 'wait-stage', from: e.from, t: 0, rot: 0 });
      const b = boxInst(e.to.i, e.to.uid); if (b) b.pending++;
    } else if (e.t === 'fall') {
      const id = e.plate, freed = e.freed;
      after(fallDelay, () => startFall(id, freed));
    } else if (e.t === 'slot') {
      vstage.push({ occ: null, c: -1, pop: 0, melt: 0, add: 0 });
      sfx.drill();
    } else if (e.t === 'melt') {
      sfx.melt();
      e.items.forEach((it, n) => flights.push({ id: it.id, c: it.c, to: { kind: 'bank' }, phase: 'wait-melt', from: it.k, t: -n * 0.06, rot: 0, melt: true }));
    } else if (e.t === 'bankAll') {
      for (const it of e.items) {
        if (it.box != null) { const b = boxInst(it.box, it.uid); if (b) { b.collect = true; b.got = it.n; b.final = true; } }
        else flights.push({ id: it.id, c: it.c, to: { kind: 'bank' }, phase: 'wait-stage', from: it.stage, t: 0, rot: 0, final: true });
      }
    } else if (e.t === 'win') {
      winAt = 1;
    } else if (e.t === 'stuck') {
      after(0.9, () => { if (s && status(s) === 'stuck') showStuck(); });
    }
  }
  updateHud();
  dirty = true;
  wake();
}

function startFall(id, freed) {
  if (!s) return;
  const v = vp[id], G = geo[id];
  v.gone = true;
  v.fall = { t: 0, x: 0, y: 0, a: 0, vx: (Math.random() - 0.5) * 70, vy: -60 - Math.random() * 40, va: (Math.random() - 0.5) * 2.6 };
  sfx.fall();
  for (const pid of freed || []) {
    for (const j of s.plates[pid].screws) if (vs[j].state === 'in') vs[j].pulse = 1;
  }
  if (freed && freed.length) after(0.05, () => sfx.unlock());
  dirty = true;
  void G;
}

function spark(x, y, color, n = 12) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, v = 60 + Math.random() * 140;
    sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 40, t: 0, life: 0.45 + Math.random() * 0.3, color, r: 1.5 + Math.random() * 2 });
  }
}

/* ======================================================================
   每帧
   ====================================================================== */
function update(dt) {
  T += dt;
  for (let i = delayed.length - 1; i >= 0; i--) if (T >= delayed[i].at) { const d = delayed.splice(i, 1)[0]; d.fn(); }

  // 飞行
  for (let i = flights.length - 1; i >= 0; i--) {
    const f = flights[i];
    f.t += dt;
    if (f.t < 0) continue;
    if (f.phase === 'wait-stage' || f.phase === 'wait-melt') {
      const v = vstage[f.from];
      if (!v || v.occ !== f.id) { f.t = 0; continue; }
      if (f.phase === 'wait-melt') { v.occ = 'melt'; f.phase = 'melt'; f.t = 0; }
      else { v.occ = null; f.phase = 'fly'; f.t = 0; }
      const [x, y] = stagePos(f.from);
      f.x0 = x; f.y0 = y; f.r0 = L.sr;
      continue;
    }
    if (f.phase === 'melt') {
      if (f.t >= 0.32) {
        const v = vstage[f.from]; if (v && v.occ === 'melt') v.occ = null;
        f.phase = 'fly'; f.t = 0;
        spark(f.x0, f.y0, '#FF8A3D', 8);
      }
      continue;
    }
    if (f.phase === 'unscrew') {
      f.rot -= dt * 26;
      if (f.t >= 0.15) { f.phase = 'fly'; f.t = 0; }
      continue;
    }
    if (f.phase === 'fly') {
      f.rot -= dt * (f.melt ? 4 : 16);
      const dur = f.to.kind === 'bank' ? 0.5 : 0.36;
      if (f.t >= dur) {
        if (canLand(f)) { land(f); flights.splice(i, 1); if (f.fromBoard) vs[f.id].state = 'done'; }
        else { f.phase = 'hover'; f.t = 0; }
      }
      continue;
    }
    if (f.phase === 'hover') {
      f.rot -= dt * 3;
      if (canLand(f)) { land(f); flights.splice(i, 1); if (f.fromBoard) vs[f.id].state = 'done'; }
    }
  }

  // 工具箱
  for (let i = 0; i < 4; i++) {
    const q = boxQ[i];
    const b = q[0];
    if (!b) continue;
    if (b.state === 'wait') { b.state = 'arrive'; b.t = -0.12; b.alpha = 0; }
    if (b.state === 'arrive') {
      // 旧箱子往上飞走的同时，新箱子在原地弹出来
      b.t += dt * 4;
      const k = Math.max(0, Math.min(1, b.t));
      b.scale = 0.5 + backOut(k) * 0.5;
      b.alpha = Math.min(1, k * 2.5);
      if (b.t >= 1) { b.state = 'ready'; b.scale = 1; b.alpha = 1; }
    }
    if (b.state === 'ready') {
      if (b.lid !== b.lidTo) {
        const was = b.lid;
        b.lid += Math.sign(b.lidTo - b.lid) * dt * 5.5;
        if ((b.lidTo - was) * (b.lidTo - b.lid) <= 0) b.lid = b.lidTo;
        if (b.lidTo === 0 && was === 1) sfx.open();
      }
      if (b.color && b.colorT < 1) b.colorT = Math.min(1, b.colorT + dt * 5);
      if (b.collect && b.pending <= 0 && b.lid === 0 && b.colorT >= 1) { b.state = 'closing'; b.lidTo = 1; }
    }
    if (b.state === 'closing') {
      b.lid = Math.min(1, b.lid + dt * 6.5);
      if (b.lid >= 1) {
        b.state = 'leave'; b.t = 0;
        sfx.close(i * 0.5);
        const B = L.boxes[i];
        spark(B.x + B.w / 2, B.y + B.h / 2, b.color, 14);
        q.shift();
        leaving.push({ ...b, i });
      }
    }
    if (b.bump > 0) b.bump = Math.max(0, b.bump - dt * 6);
  }
  for (let i = leaving.length - 1; i >= 0; i--) {
    const b = leaving[i];
    b.t += dt * 2.6;
    const k = Math.min(1, b.t);
    b.dy = -easeInOut(k) * (L.boxes[b.i].y + L.bh + 20);
    b.scale = 1 + Math.sin(k * Math.PI) * 0.08;
    b.alpha = k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1;
    if (k >= 1) {
      leaving.splice(i, 1);
      bumpGot(b.got || 0);
      const B = L.boxes[b.i];
      texts.push({ x: B.x + B.w / 2, y: B.y + B.h * 0.5, s: `+${b.got || 0}`, t: 0, color: b.color });
    }
  }

  // 掉下去的板子
  vp.forEach((v) => {
    if (!v.fall || v.done) return;
    const f = v.fall;
    f.t += dt;
    f.vy += 2300 * dt;
    f.x += f.vx * dt; f.y += f.vy * dt; f.a += f.va * dt;
    if (f.y > L.H + 60 || f.t > 1.6) { v.done = true; sfx.thud(); }
  });

  // 螺丝解锁时闪一下
  for (const v of vs) {
    if (v.pulse > 0) v.pulse = Math.max(0, v.pulse - dt * 2.6);
    if (v.shake > 0) v.shake = Math.max(0, v.shake - dt);
  }
  for (const v of vstage) {
    if (v.pop > 0) v.pop = Math.max(0, v.pop - dt * 5);
    if (v.add < 1) v.add = Math.min(1, v.add + dt * 2.5);
  }
  if (shakeStage > 0) shakeStage = Math.max(0, shakeStage - dt);
  if (highlight) { highlight.t -= dt; if (highlight.t <= 0) highlight = null; }
  for (let i = texts.length - 1; i >= 0; i--) { texts[i].t += dt; if (texts[i].t > 0.9) texts.splice(i, 1); }
  for (let i = sparks.length - 1; i >= 0; i--) {
    const p = sparks[i];
    p.t += dt; p.vy += 500 * dt; p.x += p.vx * dt; p.y += p.vy * dt;
    if (p.t > p.life) sparks.splice(i, 1);
  }
  if (gotPulse > 0) gotPulse = Math.max(0, gotPulse - dt * 4);

  // 过关：等动画都放完
  if (winAt > 0 && !flights.length && !leaving.length && boxQ.every((q) => q.length <= 1 && (!q[0] || q[0].state === 'ready'))) {
    winAt -= dt * 2.2;
    if (winAt <= 0) { winAt = -1; sfx.win(); hooks.onWin && hooks.onWin(s); }
  }
}

function busy() {
  return flights.length || leaving.length || texts.length || sparks.length || delayed.length || highlight || shakeStage > 0
    || vp.some((v) => v.fall && !v.done) || vs.some((v) => v.pulse > 0 || v.shake > 0)
    || boxQ.some((q) => q.length > 1 || (q[0] && (q[0].state !== 'ready' || q[0].lid !== q[0].lidTo || q[0].colorT < 1 || q[0].bump > 0)))
    || vstage.some((v) => v.pop > 0 || v.add < 1) || picking || winAt > 0 || hintOn;
}

/* ======================================================================
   画
   ====================================================================== */
function drawImg(sp, x, y, scale = 1) {
  const w = sp.c.width / L.dpr * scale, h = sp.c.height / L.dpr * scale;
  g.drawImage(sp.c, x - w / 2, y - h / 2, w, h);
}
function screwSprite(c, sp, rpx, locked = false) {
  if (c < 0) return headSprite(locked ? lockedColor(SPECIAL[sp || 0]) : SPECIAL[sp || 0], rpx, { mode: 'star', rainbow: true });
  return headSprite(locked ? lockedColor(COLORS[c].base) : COLORS[c].base, rpx);
}
const shineCache = new Map();
function shineSprite(rpx) {
  rpx = Math.round(rpx * 2) / 2;
  if (shineCache.has(rpx)) return shineCache.get(rpx);
  const c = document.createElement('canvas');
  c.width = c.height = Math.ceil(rpx * 2 + 4);
  const gg = c.getContext('2d');
  gg.translate(c.width / 2, c.height / 2);
  const rg = gg.createRadialGradient(-rpx * 0.36, -rpx * 0.44, 0, -rpx * 0.36, -rpx * 0.44, rpx * 0.45);
  rg.addColorStop(0, 'rgba(255,255,255,.8)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
  gg.fillStyle = rg; gg.beginPath(); gg.ellipse(-rpx * 0.36, -rpx * 0.44, rpx * 0.42, rpx * 0.26, -0.6, 0, Math.PI * 2); gg.fill();
  const sp = { c, s: c.width / 2 };
  shineCache.set(rpx, sp);
  return sp;
}

/** 画一颗螺丝（x, y, r 都是 css 像素） */
function drawScrew(c, sp, x, y, r, { rot = 0, lift = 0, locked = false, alpha = 1, scale = 1 } = {}) {
  const rr = r * scale;
  const rpx = rr * L.dpr;
  g.globalAlpha = alpha * (locked ? 0.9 : 1);
  const sh = shadowSprite(rpx);
  const sw = sh.width / L.dpr;
  g.drawImage(sh, x - sw / 2 + lift * 0.4, y - sw / 2 + rr * 0.22 + lift, sw, sw);
  const head = screwSprite(c, sp, rpx, locked);
  g.save();
  g.translate(x, y - lift * 0.3);
  g.rotate(rot);
  const w = head.c.width / L.dpr;
  g.drawImage(head.c, -w / 2, -w / 2, w, w);
  g.restore();
  if (!locked) { const shp = shineSprite(rpx); const w2 = shp.c.width / L.dpr; g.drawImage(shp.c, x - w2 / 2, y - lift * 0.3 - w2 / 2, w2, w2); }
  g.globalAlpha = 1;
}

function tracePolyCss(poly) {
  g.beginPath();
  poly.forEach(([x, y], i) => (i ? g.lineTo(sx(x), sy(y)) : g.moveTo(sx(x), sy(y))));
  g.closePath();
}

function drawPlate(i, ox = 0, oy = 0) {
  const G = geo[i];
  const sh = G.shadow, sp = G.sprite;
  g.drawImage(sh.c, L.bx + sh.ox / L.dpr + 2 + ox, L.by + sh.oy / L.dpr + 5 + oy, sh.c.width / L.dpr, sh.c.height / L.dpr);
  g.drawImage(sp.c, L.bx + sp.ox / L.dpr + ox, L.by + sp.oy / L.dpr + oy, sp.c.width / L.dpr, sp.c.height / L.dpr);
}

function plateLockedVisual(pid) {
  return s.plates[pid].above.some((j) => !vp[j].gone);
}

function draw() {
  g.setTransform(L.dpr, 0, 0, L.dpr, 0, 0);
  g.clearRect(0, 0, L.W, L.H);
  if (!s) return;
  const r = rBoard();

  // 底板
  g.save();
  g.beginPath(); g.roundRect(8, L.boardTop - 4, L.W - 16, L.ah + 8, 22);
  const bg = g.createLinearGradient(0, L.boardTop, 0, L.boardTop + L.ah);
  bg.addColorStop(0, 'rgba(255,255,255,.55)'); bg.addColorStop(1, 'rgba(255,255,255,.25)');
  g.fillStyle = bg; g.fill();
  g.strokeStyle = 'rgba(140,155,185,.18)'; g.lineWidth = 1; g.stroke();
  g.restore();

  // 玻璃板 + 板上的螺丝（按层，从下往上）
  for (let i = 0; i < s.plates.length; i++) {
    if (vp[i].gone) continue;
    drawPlate(i);
    const locked = plateLockedVisual(i);
    for (const j of s.plates[i].screws) {
      const v = vs[j];
      if (v.state !== 'in') continue;
      const sc = s.screws[j];
      const pulse = v.pulse > 0 ? Math.sin((1 - v.pulse) * Math.PI) * 0.22 : 0;
      const shake = v.shake > 0 ? Math.sin(v.shake * 60) * 3 * v.shake / 0.35 : 0;
      drawScrew(sc.c, sc.sp, sx(sc.x) + shake, sy(sc.y), r, { locked, scale: 1 + pulse, rot: rot0(j) });
    }
  }
  // 被点到的锁住螺丝：描出压着它的板子
  if (highlight) {
    const a = Math.min(1, highlight.t / 0.3);
    g.save();
    g.lineWidth = 3; g.strokeStyle = `rgba(255,90,60,${0.85 * a})`; g.setLineDash([7, 5]); g.lineDashOffset = -T * 40;
    for (const pid of highlight.plates) { if (!vp[pid].gone) { tracePolyCss(geo[pid].poly); g.stroke(); } }
    g.restore();
  }

  // 掉下去的板子画在最上面
  vp.forEach((v, i) => {
    if (!v.fall || v.done) return;
    const f = v.fall, G = geo[i];
    const cx = sx(G.cx), cy = sy(G.cy);
    g.save();
    g.globalAlpha = Math.max(0, 1 - Math.max(0, f.t - 0.5) * 1.6);
    g.translate(cx + f.x, cy + f.y);
    g.rotate(f.a);
    const sc = 1 + Math.min(0.08, f.t * 0.12);
    g.scale(sc, sc);
    g.translate(-cx, -cy);
    drawPlate(i);
    g.restore();
  });

  // 暂存格
  const xs = stageXs();
  const n = vstage.length;
  const hole = L.sr * 2.4;
  const pw = (xs[n - 1] - xs[0]) + hole + 22;
  const sxShake = shakeStage > 0 ? Math.sin(shakeStage * 50) * 5 * shakeStage / 0.4 : 0;
  g.save();
  g.translate(sxShake, 0);
  g.beginPath(); g.roundRect((L.W - pw) / 2, L.stageY - L.stageH / 2 + 2, pw, L.stageH - 4, (L.stageH - 4) / 2);
  const pg = g.createLinearGradient(0, L.stageY - L.stageH / 2, 0, L.stageY + L.stageH / 2);
  pg.addColorStop(0, '#FAFBFD'); pg.addColorStop(1, '#E3E7EE');
  g.fillStyle = pg;
  g.shadowColor = 'rgba(40,55,90,.16)'; g.shadowBlur = 10; g.shadowOffsetY = 3; g.fill();
  g.shadowBlur = 0; g.shadowOffsetY = 0;
  if (shakeStage > 0) { g.strokeStyle = `rgba(255,70,50,${shakeStage * 2})`; g.lineWidth = 2; g.stroke(); }
  for (let i = 0; i < n; i++) {
    const v = vstage[i];
    const t = easeOut(v.add);
    drawStageHole(g, xs[i], L.stageY, L.sr * t, t);
    if (v.occ != null && v.occ !== 'melt') {
      const pop = v.pop > 0 ? Math.sin((1 - v.pop) * Math.PI) * 0.18 : 0;
      drawScrew(v.c, 0, xs[i], L.stageY, L.sr, { scale: 1 + pop, rot: 0.5 });
    }
  }
  g.restore();

  // 工具箱
  const drawInst = (b, i, extra = 1) => {
    const B = L.boxes[i];
    g.save();
    g.globalAlpha = b.alpha ?? 1;
    const bump = b.bump > 0 ? Math.sin(b.bump * Math.PI) * 0.05 : 0;
    const sc = (b.scale || 1) * (1 + bump) * extra;
    g.translate(B.x + B.w / 2, B.y + B.h / 2 + b.dy);
    g.scale(sc, sc);
    g.translate(-B.w / 2, -B.h / 2);
    drawBox(g, 0, 0, B.w, B.h, b, L.slots, L.sr, 1);
    if (b.color) for (let k = 0; k < Math.min(b.n, L.slots.length); k++) {
      const [ox, oy] = L.slots[k];
      drawScrew(b.c, 0, ox, oy, L.sr, { rot: 0.4 + k * 0.7 });
    }
    drawLid(g, 0, 0, B.w, B.h, b, 1);
    g.restore();
  };
  for (let i = 0; i < 4; i++) {
    const b = boxQ[i][0];
    if (b && b.state !== 'wait') {
      const wig = picking && b.c >= 0 ? 1 + Math.sin(T * 14 + i) * 0.025 : 1;
      drawInst(b, i, wig);
    }
  }
  for (const b of leaving) drawInst(b, b.i);
  if (picking) {
    g.save();
    for (let i = 0; i < 4; i++) {
      const b = boxQ[i][0], B = L.boxes[i];
      if (!b || b.c < 0) continue;
      g.beginPath(); g.roundRect(B.x - 4, B.y + B.h * 0.16 - 4, B.w + 8, B.h * 0.84 + 8, 16);
      g.strokeStyle = `rgba(255,178,31,${0.6 + Math.sin(T * 8) * 0.3})`; g.lineWidth = 3; g.setLineDash([6, 4]); g.lineDashOffset = -T * 30; g.stroke();
    }
    g.restore();
  }

  // 飞行中的螺丝
  for (const f of flights) {
    if (f.t < 0 && f.phase !== 'unscrew') continue;
    if (f.phase === 'wait-stage' || f.phase === 'wait-melt') continue;
    if (f.phase === 'unscrew') {
      const k = Math.min(1, f.t / 0.15);
      drawScrew(f.c, f.sp, f.x0, f.y0, f.r0, { rot: f.rot, lift: k * f.r0 * 0.5, scale: 1 + k * 0.2 });
      continue;
    }
    if (f.phase === 'melt') {
      const k = Math.min(1, f.t / 0.32);
      drawScrew(f.c, 0, f.x0 + Math.sin(T * 60) * k * 1.5, f.y0, L.sr, { rot: 0.5, scale: 1 - k * 0.15 });
      g.save();
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = k * 0.85;
      const rg = g.createRadialGradient(f.x0, f.y0, 0, f.x0, f.y0, L.sr * 1.4);
      rg.addColorStop(0, '#FFD25A'); rg.addColorStop(0.6, '#FF6A2B'); rg.addColorStop(1, 'rgba(255,60,20,0)');
      g.fillStyle = rg; g.beginPath(); g.arc(f.x0, f.y0, L.sr * 1.4, 0, Math.PI * 2); g.fill();
      g.restore();
      continue;
    }
    const [tx, ty] = targetXY(f);
    const tr = targetR(f);
    if (f.phase === 'hover') {
      drawScrew(f.c, f.sp, tx, ty - 6 + Math.sin(T * 10) * 2, tr, { rot: f.rot, lift: 4 });
      continue;
    }
    const dur = f.to.kind === 'bank' ? 0.5 : 0.36;
    const k = easeInOut(Math.min(1, f.t / dur));
    const x0 = f.x0, y0 = f.y0 - (f.fromBoard ? f.r0 * 0.15 : 0);
    const mx = (x0 + tx) / 2 + (x0 < tx ? -1 : 1) * Math.min(60, Math.abs(tx - x0) * 0.2);
    const my = Math.min(y0, ty) - 50 - Math.abs(tx - x0) * 0.12;
    const x = (1 - k) * (1 - k) * x0 + 2 * (1 - k) * k * mx + k * k * tx;
    const y = (1 - k) * (1 - k) * y0 + 2 * (1 - k) * k * my + k * k * ty;
    const rr = lerp(f.r0 * (f.fromBoard ? 1.2 : 1), tr, k);
    if (f.melt) {
      g.save();
      g.fillStyle = '#FF7A2B'; g.shadowColor = '#FFB24A'; g.shadowBlur = 12;
      g.beginPath(); g.arc(x, y, Math.max(3, rr * (0.55 - k * 0.2)), 0, Math.PI * 2); g.fill();
      g.restore();
    } else {
      drawScrew(f.c, f.sp, x, y, rr, { rot: f.rot, lift: (1 - k) * 8 + Math.sin(k * Math.PI) * 6 });
    }
  }

  // 粒子、飘字
  for (const p of sparks) {
    g.globalAlpha = Math.max(0, 1 - p.t / p.life);
    g.fillStyle = p.color;
    g.beginPath(); g.arc(p.x, p.y, p.r, 0, Math.PI * 2); g.fill();
  }
  g.globalAlpha = 1;
  for (const tx of texts) {
    const k = tx.t / 0.9;
    g.globalAlpha = 1 - k * k;
    g.font = '800 20px -apple-system, "PingFang SC", sans-serif';
    g.textAlign = 'center';
    g.lineWidth = 4; g.strokeStyle = '#fff'; g.strokeText(tx.s, tx.x, tx.y - k * 40);
    g.fillStyle = tx.color || '#333'; g.fillText(tx.s, tx.x, tx.y - k * 40);
  }
  g.globalAlpha = 1;
}

/* ======================================================================
   循环
   ====================================================================== */
function frame(t) {
  raf = requestAnimationFrame(frame);
  const dt = Math.min(0.05, (t - last) / 1000) * speed();
  last = t;
  const was = busy();
  update(dt);
  if (was || dirty || busy()) { draw(); dirty = false; }
  if (hintOn) placeHint();
}
function start() { running = true; cancelAnimationFrame(raf); last = performance.now(); raf = requestAnimationFrame(frame); }
function stop() { running = false; cancelAnimationFrame(raf); raf = 0; }
function wake() { dirty = true; if (running && !raf) start(); }
export function pause() { stop(); }
export function resume() { if (s) { layout(); start(); } }
export function relayout() { if (s) { layout(); draw(); } }

/* ======================================================================
   操作
   ====================================================================== */
function apply(res) {
  if (!res.ok) return false;
  const delta = { c: [0, 0, 0, 0, 0, 0], s: 0 };
  for (const e of res.ev) {
    if (e.t === 'collect') delta.c[e.c] += e.n;
    if (e.t === 'out' && e.to.kind === 'bank') delta.s++;
    if (e.t === 'melt') e.items.forEach((it) => delta.c[it.c]++);
    if (e.t === 'bankAll') e.items.forEach((it) => { delta.c[it.c] += it.n || 1; });
  }
  play(res.ev);
  hooks.onChange && hooks.onChange(s, delta);
  return true;
}

function hitScrew(x, y) {
  const r = rBoard();
  let best = null, bd = Infinity, lockedHit = null, ld = Infinity;
  for (const sc of s.screws) {
    if (sc.out) continue;
    const d = Math.hypot(sx(sc.x) - x, sy(sc.y) - y);
    if (screwFree(s, sc)) { if (d < r * 1.8 && d < bd) { bd = d; best = sc; } }
    else if (d < r * 1.15 && d < ld) { ld = d; lockedHit = sc; }
  }
  return best || (lockedHit ? { locked: lockedHit } : null);
}

function onDown(e) {
  if (!s || winAt > 0 || !$('cardWrap').hidden) return;
  e.preventDefault();
  const x = e.clientX, y = e.clientY;
  if (picking) {
    const i = L.boxes.findIndex((B) => x >= B.x - 6 && x <= B.x + B.w + 6 && y >= B.y - 6 && y <= B.y + B.h + 6);
    if (i >= 0 && s.boxes[i].c >= 0) {
      setPicking(false);
      sfx.whoosh();
      apply(clearBox(s, i));
    } else setPicking(false);
    return;
  }
  const h = hitScrew(x, y);
  if (!h) return;
  if (h.locked) {
    const sc = h.locked;
    vs[sc.id].shake = 0.35;
    highlight = { plates: s.plates[sc.plate].above.filter((j) => !s.plates[j].gone), t: 0.9 };
    sfx.locked();
    hb_haptic(10);
    if (hooks.onLockedTap) hooks.onLockedTap();
    wake();
    return;
  }
  if (!placeFor(s, h.c)) {
    vs[h.id].shake = 0.35;
    shakeStage = 0.4;
    sfx.full();
    if (status(s) === 'stuck') showStuck();
    else hooks.toast && hooks.toast('暂存格满了，先拧能放进工具箱的颜色');
    wake();
    return;
  }
  hideHint();
  apply(tap(s, h.id));
  if (hooks.onTapped) hooks.onTapped(h);
}
cv.addEventListener('pointerdown', onDown);

function setPicking(on) {
  picking = on;
  $('pickTip').hidden = !on;
  document.body.classList.toggle('picking', on);
  $('skClear').classList.toggle('on', on);
  wake();
}

export function skill(name) {
  if (!s || winAt > 0) return;
  if (name === 'add') {
    const r = addSlot(s);
    if (!r.ok) { hooks.toast && hooks.toast(`暂存格最多 ${MAX_STAGE} 个`); return; }
    setPicking(false);
    apply(r);
  } else if (name === 'clear') {
    if (picking) { setPicking(false); return; }
    if (!s.boxes.some((b) => b.c >= 0)) { hooks.toast && hooks.toast('工具箱都是空的'); return; }
    sfx.tap();
    setPicking(true);
  } else if (name === 'melt') {
    setPicking(false);
    const r = melt(s);
    if (!r.ok) { hooks.toast && hooks.toast('暂存格里没有螺丝'); return; }
    apply(r);
  }
}

function showStuck() {
  if (!s || status(s) !== 'stuck' || !$('cardWrap').hidden) return;
  sfx.stuck();
  document.body.classList.add('stuck');
  hooks.onStuck && hooks.onStuck();
}

/* ======================================================================
   第一次玩的提示：一只手指着能点的螺丝
   ====================================================================== */
let hintOn = false, hintTarget = null;
export function showHint(text, target) {
  hintOn = true; hintTarget = target;
  $('hintText').textContent = text;
  $('hint').hidden = false;
  placeHint();
  wake();
}
export function hideHint() { if (!hintOn) return; hintOn = false; $('hint').hidden = true; }
function placeHint() {
  const el = $('hint');
  let x = L.W / 2, y = L.boardTop + L.ah / 2;
  if (hintTarget && hintTarget.screw != null && s) { const sc = s.screws[hintTarget.screw]; x = sx(sc.x); y = sy(sc.y); }
  el.style.setProperty('--hx', `${x}px`);
  el.style.setProperty('--hy', `${y}px`);
}
/** 给提示挑一颗：能直接放进工具箱的 */
export function hintScrew() {
  if (!s) return null;
  const free = s.screws.filter((sc) => screwFree(s, sc));
  free.sort((a, b) => a.y - b.y);
  return free.find((sc) => placeFor(s, sc.c)) || null;
}
export function lockedVisibleScrew() {
  if (!s) return null;
  return s.screws.find((sc) => !sc.out && !plateFree(s, s.plates[sc.plate])) || null;
}

export function setHaptic(fn) { hb_haptic = fn; }
export const debug = { get flights() { return flights; }, get boxQ() { return boxQ; }, get vstage() { return vstage; }, get L() { return L; }, get vp() { return vp; }, draw: () => draw(), update: (dt) => update(dt), sx, sy };
