// 便便超人的世界：协程调度、缓动、角色物理、飞弹、粒子、糊在身上的东西、绘制。
import {
  INK, TAU, FONT, SKINS, mk, rng, put, drawSplat, buildHero, drawHero, buildPoopSprites, drawFuse,
  DOLL_PARTS, drawDollFace, drawHat, hatTop, drawUmbrella, drawTrampoline, drawCloud, drawNozzle, drawShower, drawToilet,
  drawBg, drawPlaque, drawWord, drawBubble, starPath,
} from './art.js';
import { sfx } from './sfx.js';

export const E = {
  linear: (k) => k,
  in: (k) => k * k,
  out: (k) => 1 - (1 - k) * (1 - k),
  inOut: (k) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2),
  back: (k) => { const c = 1.9; return 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2); },
  elastic: (k) => (k === 0 || k === 1 ? k : Math.pow(2, -9 * k) * Math.sin((k * 8 - 0.75) * (TAU / 3)) + 1),
};
export const rand = (a, b) => a + Math.random() * (b - a);
export const pick = (a) => a[Math.floor(Math.random() * a.length)];
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

const heroDefaults = () => ({
  x: 0, y: 0, sx: 1, sy: 1, rot: 0, flip: 1, face: 'ok', faceT: 0, blink: 0, blinkIn: 2,
  lookX: 0.5, lookY: 0, armF: { x: 44, y: -26 }, armB: { x: -46, y: -26 }, legF: { x: 20, y: 0 }, legB: { x: -20, y: 0 },
  capeUp: 0, j: 0, jv: 0, px: 0, starsT: 0, holdDraw: null,
});
const dollDefaults = () => ({
  x: 0, y: 0, vx: 0, vy: 0, rot: 0, vr: 0, sq: 0, sv: 0, pan: 0, pv: 10, grabbed: false, gx: 0, gy: 0,
  face: 'idle', faceT: 0, look: null, pupil: [{ x: -0.2, y: 0, vx: 0, vy: 0 }, { x: -0.2, y: 0, vx: 0, vy: 0 }],
  hop: 0, pvx: 0, pvy: 0, cover: 0, umb: null, arms: 'down', onGround: true, hatPop: 1, line: 0,
});

export const w = {
  W: 390, H: 560, U: 1, G: 480, wallY: 410, dpr: 2, safeT: 0, heroHome: 90, dollHome: 285,
  skinId: 'choco', skin: SKINS.choco, S: {}, hb: null,
  t: 0, dt: 0, timeScale: 1,
  tasks: [], tweens: [], projs: [], parts: [], words: [], bubbles: [], props: [], drips: [],
  shake: 0, flash: 0, flashCol: '#FFF',
  hero: heroDefaults(), doll: dollDefaults(),
  dollParts: [], heroSp: null, poopSp: null, bg: null, stainCv: null, stainCtx: null,
  mess: [], stains: [], hat: 0, cherry: false, name: '小布偶', hits: 0, fresh: true,
  stats: {}, dirty: false, plaquePressed: 0,
};

/* ─────────────── 协程和缓动 ─────────────── */

/** yield 数字 = 等几秒；yield 函数 = 等它返回 true；yield null = 等一帧 */
export function spawn(gen) {
  const t = { gen, wait: 0, cond: null, done: false };
  w.tasks.push(t);
  return t;
}
function stepTasks(dt) {
  for (let i = 0; i < w.tasks.length; i++) {
    const t = w.tasks[i];
    if (t.done) continue;
    if (t.wait > 0) { t.wait -= dt; if (t.wait > 0) continue; }
    if (t.cond) { if (!t.cond()) continue; t.cond = null; }
    const r = t.gen.next();
    if (r.done) { t.done = true; continue; }
    const v = r.value;
    if (typeof v === 'number') t.wait = v;
    else if (typeof v === 'function') t.cond = v;
  }
  if (w.tasks.some((t) => t.done)) w.tasks = w.tasks.filter((t) => !t.done);
}
export function tw(obj, to, dur, ease = E.out) {
  for (const o of w.tweens) if (o.obj === obj) for (const k in to) delete o.to[k];
  const t = { obj, to: { ...to }, from: {}, t: 0, dur: Math.max(0.001, dur), ease, done: false };
  for (const k in to) t.from[k] = obj[k];
  w.tweens.push(t);
  return () => t.done;
}
function stepTweens(dt) {
  for (const t of w.tweens) {
    t.t += dt;
    const k = Math.min(1, t.t / t.dur), e = t.ease(k);
    for (const key in t.to) t.obj[key] = t.from[key] + (t.to[key] - t.from[key]) * e;
    if (k >= 1) t.done = true;
  }
  if (w.tweens.some((t) => t.done)) w.tweens = w.tweens.filter((t) => !t.done);
}

/* ─────────────── 布局和贴图 ─────────────── */

export function setSkin(id) {
  w.skinId = id;
  w.skin = SKINS[id] || SKINS.choco;
  if (w.bg) rebuild();
}
export function layout(W, H, dpr, safeT) {
  const firstTime = !w.bg;
  const oldHero = w.hero.x, oldDoll = w.doll.x;
  w.W = W; w.H = H; w.dpr = dpr; w.safeT = safeT;
  w.U = Math.min(W / 390, H / 500);
  const U = w.U;
  w.G = H - 92 * U;
  w.wallY = w.G - 62 * U;
  w.heroHome = W * 0.235;
  w.dollHome = W * 0.735;
  rebuild();
  const h = w.hero, d = w.doll;
  h.x = w.heroHome; h.y = w.G; h.px = h.x;
  d.x = w.dollHome; d.y = w.G; d.vx = d.vy = 0;
  void firstTime; void oldHero; void oldDoll;
}
function rebuild() {
  const { W, H, U, dpr, skin } = w, ps = U * dpr;
  w.heroSp = buildHero(skin, ps);
  w.poopSp = buildPoopSprites(skin, ps);
  buildDoll();
  // 背景
  const bg = mk(W * dpr, H * dpr), c = bg.getContext('2d');
  c.scale(dpr, dpr);
  const portrait = heroDefaults();
  drawBg(c, W, H, w.G, w.wallY, U, w.safeT, w.heroSp, (cc) => { portrait.face = 'grin'; drawHero(cc, portrait, w.heroSp, 0); });
  w.bg = bg;
  // 污渍层
  w.stainCv = mk(W * dpr, H * dpr);
  w.stainCtx = w.stainCv.getContext('2d');
  w.stainCtx.scale(dpr, dpr);
  w.drips = [];
  replay();
}
function buildDoll() {
  const ps = w.U * w.dpr;
  const old = w.dollParts;
  w.dollParts = DOLL_PARTS.map((def, i) => {
    const [bx, by, bw, bh] = def.bbox;
    const cw = bw * ps, ch = bh * ps;
    const sprite = mk(cw, ch), c = sprite.getContext('2d');
    c.scale(ps, ps); c.translate(-bx, -by); c.lineJoin = 'round'; c.lineCap = 'round';
    def.draw(c);
    const mask = mk(cw, ch), mc = mask.getContext('2d');
    const o = 3 * ps;
    for (let k = 0; k < 8; k++) mc.drawImage(sprite, Math.cos((k / 8) * TAU) * o, Math.sin((k / 8) * TAU) * o);
    mc.drawImage(sprite, 0, 0);
    const prev = old[i];
    return {
      def, sprite, mask, fill: mk(cw, ch), final: mk(cw, ch), tint: mk(cw, ch), dirty: false,
      a: prev ? prev.a : def.a0, v: prev ? prev.v : 0, rest: def.a0, m: [1, 0, 0, 1, 0, 0], ps,
    };
  });
}
function bakePart(p) {
  const tc = p.tint.getContext('2d');
  tc.globalCompositeOperation = 'source-over';
  tc.clearRect(0, 0, p.tint.width, p.tint.height);
  tc.drawImage(p.fill, 0, 0);
  tc.globalCompositeOperation = 'source-in';
  tc.fillStyle = INK; tc.fillRect(0, 0, p.tint.width, p.tint.height);
  const c = p.final.getContext('2d');
  c.clearRect(0, 0, p.final.width, p.final.height);
  const o = 1.5 * p.ps;
  for (let k = 0; k < 8; k++) c.drawImage(p.tint, Math.cos((k / 8) * TAU) * o, Math.sin((k / 8) * TAU) * o);
  c.drawImage(p.fill, 0, 0);
  p.dirty = false;
}
function paintMess(m) {
  const p = w.dollParts[m.p];
  if (!p) return;
  const [bx, by] = p.def.bbox, ps = p.ps;
  const c = p.fill.getContext('2d');
  c.setTransform(ps, 0, 0, ps, -bx * ps, -by * ps);
  drawSplat(c, m.x, m.y, m.r, m.s, w.skin, { outline: false, drops: m.r > 8 });
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.globalCompositeOperation = 'destination-in';
  c.drawImage(p.mask, 0, 0);
  c.globalCompositeOperation = 'source-over';
  p.dirty = true;
}
function paintStain(s) {
  const { W, H, U } = w, x = s.x * W, y = s.y * H, r = s.r * U;
  drawSplat(w.stainCtx, x, y, r, s.s, w.skin, { squash: s.f ? 0.36 : 1, lw: 2.2 * U });
}
function replay() {
  for (const m of w.mess) paintMess(m);
  for (const p of w.dollParts) if (p.dirty) bakePart(p);
  for (const s of w.stains) paintStain(s);
  recountCover();
}
function recountCover() {
  let sum = 0;
  for (const m of w.mess) sum += m.r * m.r;
  w.doll.cover = Math.min(1, sum / 11000);
}

/* ─────────────── 存档 ─────────────── */

export function snapshot() {
  const round = (v) => Math.round(v * 10) / 10;
  const r3 = (v) => Math.round(v * 1000) / 1000;
  return {
    name: w.name, hat: w.hat, cherry: w.cherry, hits: w.hits, fresh: w.fresh,
    mess: w.mess.map((m) => [m.p, round(m.x), round(m.y), round(m.r), m.s]),
    stains: w.stains.map((s) => [r3(s.x), r3(s.y), round(s.r), s.s, s.f ? 1 : 0]),
  };
}
export function restore(o) {
  if (!o) return;
  w.name = typeof o.name === 'string' && o.name ? o.name : w.name;
  w.hat = o.hat | 0; w.cherry = !!o.cherry; w.hits = o.hits | 0; w.fresh = o.fresh !== false;
  w.mess = (o.mess || []).map((a) => ({ p: a[0], x: a[1], y: a[2], r: a[3], s: a[4] }));
  w.stains = (o.stains || []).map((a) => ({ x: a[0], y: a[1], r: a[2], s: a[3], f: !!a[4] }));
}

/* ─────────────── 小工具：坐标、说话、特效 ─────────────── */

export function heroPt(lx, ly) {
  const h = w.hero, U = w.U, pv = 58 * U;
  const px = lx * U * h.flip * h.sx, py = ly * U * h.sy + pv;
  const co = Math.cos(h.rot), si = Math.sin(h.rot);
  return { x: h.x + px * co - py * si, y: h.y - pv + px * si + py * co };
}
export const heroHand = () => heroPt(w.hero.armF.x, w.hero.armF.y);

const mul = (m, n) => [
  m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
];
const trans = (x, y) => [1, 0, 0, 1, x, y];
const rotM = (a) => { const c = Math.cos(a), s = Math.sin(a); return [c, s, -s, c, 0, 0]; };
const scaleM = (x, y) => [x, 0, 0, y, 0, 0];
const app = (m, x, y) => ({ x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] });
const inv = (m) => {
  const d = m[0] * m[3] - m[1] * m[2] || 1e-6;
  return [m[3] / d, -m[1] / d, -m[2] / d, m[0] / d, (m[2] * m[5] - m[3] * m[4]) / d, (m[1] * m[4] - m[0] * m[5]) / d];
};
const IDX = { legB: 0, legF: 1, armB: 2, torso: 3, armF: 4, head: 5 };
export const PART = IDX;

function updateDollMatrices() {
  const d = w.doll, U = w.U, pv = d.pv * U;
  const sx = (1 + d.sq * 0.55) * (1 + d.pan * 0.85), sy = (1 - d.sq * 0.55) * (1 - d.pan * 0.76);
  d.sx = sx; d.sy = sy;
  let root = trans(d.x, d.y - pv);
  root = mul(root, rotM(d.rot));
  root = mul(root, trans(0, pv));
  root = mul(root, scaleM(sx * U, sy * U));
  d.root = root;
  for (const p of w.dollParts) p.m = mul(mul(root, trans(p.def.px, p.def.py)), rotM(p.a));
}
export function dollPoint(pi, lx = null, ly = null) {
  const p = w.dollParts[pi], h = p.def.hit;
  return app(p.m, lx == null ? h[0] : lx, ly == null ? h[1] : ly);
}
export const dollHead = () => dollPoint(IDX.head);
export const dollTorso = () => dollPoint(IDX.torso);
export const dollTop = () => dollPoint(IDX.head, 0, hatTop(w.hat) - (w.hat ? 8 : 16));

export function say(who, text, life = 1.8, force = false) {
  if (!force && w.S.lines === false) return;
  const t = text.replaceAll('{name}', w.name);
  w.bubbles = w.bubbles.filter((b) => b.who !== who);
  w.bubbles.push({ who, text: t, t: 0, life, x: 0, y: 0 });
}
export function heroFace(f, dur = 0) { w.hero.face = f; w.hero.faceT = dur; }
export function dollFace(f, dur = 0.7) { w.doll.face = f; w.doll.faceT = dur; }
export function word(text, x, y, size = 30, color = '#FFE04A') {
  const U = w.U;
  w.words.push({
    text: text.replaceAll('\uff01', '!'), size, color, t: 0, life: 0.75, rot: rand(-0.16, 0.16),
    x: clamp(x, 44 * U, w.W - 44 * U), y: clamp(y, w.safeT + 40 * U, w.H - 20 * U),
  });
}
export function shake(v) { if (w.S.shake !== false) w.shake = Math.max(w.shake, v * w.U); }
export function flash(v, col = '#FFF') { w.flash = Math.max(w.flash, v); w.flashCol = col; }
export const haptic = (ms = 8) => w.hb && w.hb.haptic(ms);

const pMul = () => [0.45, 1, 1.7][(w.S.particles || 2) - 1];
function addP(o) {
  if (w.parts.length > 240) w.parts.shift();
  w.parts.push(Object.assign({ t: 0, life: 1, vx: 0, vy: 0, g: 0, r: 4, rot: 0, vr: 0 }, o));
}
export function drops(x, y, dir, n, spread = 1) {
  const U = w.U, N = Math.round(n * pMul());
  for (let i = 0; i < N; i++) {
    const a = rand(0, TAU), sp = rand(120, 430) * spread * U;
    addP({
      type: 'drop', x, y, vx: Math.cos(a) * sp + dir * rand(40, 180) * U, vy: Math.sin(a) * sp - rand(60, 240) * U,
      g: 1150 * U, r: rand(1.8, 5) * U, life: 1.5, floorAt: w.G + rand(-6, 48) * U,
    });
  }
}
export function puffs(x, y, n, size = 1, col = '#FFFFFF') {
  const U = w.U;
  for (let i = 0; i < n; i++) {
    const a = rand(0, TAU), sp = rand(30, 130) * size * U;
    addP({ type: 'puff', col, x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 20 * U, r: rand(8, 15) * size * U, life: rand(0.35, 0.65) });
  }
}
export function stars(x, y, n, sp = 240) {
  const U = w.U;
  for (let i = 0; i < n; i++) {
    const a = rand(0, TAU), s = rand(0.45, 1) * sp * U;
    addP({ type: 'star', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, g: 420 * U, r: rand(5, 9) * U, life: rand(0.4, 0.75), rot: rand(0, TAU), vr: rand(-9, 9) });
  }
}
export function note(x, y) {
  const U = w.U;
  addP({ type: 'note', x, y, vx: rand(-34, 34) * U, vy: rand(-90, -60) * U, life: 1.1, r: 12 * U, rot: rand(-0.3, 0.3), ch: pick(['♪', '♫', '♩']) });
}
export function waterDrop(x, y, spread = 34) {
  const U = w.U;
  addP({ type: 'water', x: x + rand(-spread, spread) * U, y, vx: rand(-20, 20) * U, vy: rand(380, 560) * U, g: 900 * U, r: rand(1.6, 3) * U, life: 1.3, floorAt: w.G + rand(-6, 36) * U });
}
export function soap(x, y) {
  const U = w.U;
  addP({ type: 'bubble', x, y, vx: rand(-34, 34) * U, vy: rand(-90, -40) * U, r: rand(4, 9) * U, life: rand(0.8, 1.5) });
}

/* ─────────────── 糊 ─────────────── */

let seedN = Math.floor(Math.random() * 1e6);
const nextSeed = () => (seedN = (seedN + 104729) % 2147483647);

export function stain(x, y, r, floor = false, drip = true) {
  const U = w.U;
  const s = { x: x / w.W, y: y / w.H, r: r / U, s: nextSeed(), f: !!floor };
  w.stains.push(s);
  if (w.stains.length > 170) w.stains.shift();
  paintStain(s);
  w.dirty = true;
  if (!floor && drip && r > 9 * U && y < w.wallY - 30 * U && Math.random() < 0.7) {
    w.drips.push({
      x: x + rand(-r * 0.35, r * 0.35), y: y + r * 0.42, len: 0, max: r * rand(0.9, 2.1),
      wd: rand(2.4, Math.max(3, r * 0.26)), sp: rand(16, 34) * U,
    });
  }
}
/** 飞到某个位置就地糊上：墙线以下算地板 */
export function stainAt(x, y, r) {
  stain(x, y, r, y > w.wallY - 2 * w.U);
}
function stepDrips(dt) {
  const c = w.stainCtx;
  if (!c) return;
  const U = w.U;
  for (const d of w.drips) {
    const dy = d.sp * dt, y0 = d.y + d.len;
    d.len += dy;
    const y = d.y + d.len, wallEnd = w.wallY - 15 * U;
    c.lineCap = 'round';
    // 描边垫在已有污渍下面，这样流痕和那一坨是连在一起的
    c.globalCompositeOperation = 'destination-over';
    c.strokeStyle = INK; c.lineWidth = d.wd + 3 * U;
    c.beginPath(); c.moveTo(d.x, y0 - 1); c.lineTo(d.x, y); c.stroke();
    c.globalCompositeOperation = 'source-over';
    c.strokeStyle = w.skin.goo; c.lineWidth = d.wd;
    c.beginPath(); c.moveTo(d.x, Math.max(d.y, y0 - 3 * U)); c.lineTo(d.x, y); c.stroke();
    d.sp *= 1 - dt * 0.7;
    if (d.len >= d.max || y >= wallEnd || d.sp < 3 * U) {
      d.done = true;
      // 末端鼓成一滴
      const q = d.wd * 0.86;
      c.fillStyle = INK; c.beginPath(); c.arc(d.x, y, q + 1.5 * U, 0, TAU); c.fill();
      c.fillStyle = w.skin.goo; c.beginPath(); c.arc(d.x, y, q, 0, TAU); c.fill();
      c.fillStyle = w.skin.gooHi; c.beginPath(); c.arc(d.x - q * 0.3, y - q * 0.3, q * 0.26, 0, TAU); c.fill();
    }
  }
  if (w.drips.some((d) => d.done)) w.drips = w.drips.filter((d) => !d.done);
}

function firstHit() {
  if (w.fresh) {
    w.fresh = false;
    w.stats.played = (w.stats.played || 0) + 1;
    w.statsDirty = true;
  }
}
export function countHit(n = 1) {
  firstHit();
  w.hits += n;
  w.stats.hits = (w.stats.hits || 0) + n;
  w.statsDirty = true;
  w.dirty = true;
}
/** 没糊到小人、落在墙上地上的：只进总记录 */
export function countMiss() {
  firstHit();
  w.stats.hits = (w.stats.hits || 0) + 1;
  w.statsDirty = true;
}
export function addSplat(pi, lx, ly, r) {
  const m = { p: pi, x: lx, y: ly, r, s: nextSeed() };
  w.mess.push(m);
  if (w.mess.length > 150) w.mess.shift();
  paintMess(m);
  recountCover();
  w.dirty = true;
}
export function hitDoll(pi, x, y, r, dir = 0, power = 1, { silent = false } = {}) {
  const d = w.doll, U = w.U, p = w.dollParts[pi];
  const l = app(inv(p.m), x, y);
  const lr = Math.min(25, (r / U) * 0.82);
  addSplat(pi, clamp(l.x, p.def.bbox[0] + 4, p.def.bbox[0] + p.def.bbox[2] - 4), clamp(l.y, p.def.bbox[1] + 4, p.def.bbox[1] + p.def.bbox[3] - 4), lr);
  if (power > 1.2) {
    // 大坨会连带糊到旁边
    addSplat(IDX.torso, rand(-22, 22), rand(-44, -8), lr * 0.5);
    addSplat(IDX.head, rand(-26, 26), rand(-58, -18), lr * 0.42);
    if (power > 1.9) {
      addSplat(IDX.armF, rand(-4, 4), rand(4, 30), lr * 0.36);
      addSplat(IDX.armB, rand(-4, 4), rand(4, 30), lr * 0.36);
      addSplat(IDX.legF, rand(-4, 4), rand(4, 22), lr * 0.36);
      addSplat(IDX.legB, rand(-4, 4), rand(4, 22), lr * 0.36);
    }
  }
  if (!d.grabbed) {
    d.vx += dir * Math.min(1.9, power) * 130 * U;
    d.vy -= (dir ? power * 70 : power * 10) * U;
    d.vr += dir * Math.min(2, power) * 2.4 + rand(-0.4, 0.4);
  }
  d.sv += (0.9 + power * 2.1);
  p.v += rand(-3, 3) * power + dir * 2;
  for (const q of w.dollParts) q.v += rand(-5, 5) * Math.min(1.6, power);
  d.pupil.forEach((e) => { e.vx += rand(-16, 16); e.vy += rand(-22, 6); });
  drops(x, y, -dir, 5 + power * 9);
  if (!silent) {
    sfx.splat(power);
    if (power >= 0.75 || Math.random() < 0.3) {
      word(pick(power >= 1.8 ? ['吧唧！！', '啪叽！！', '咚！！'] : power >= 0.75 ? ['啪叽！', '吧唧！', '噗叽！', '糊！'] : ['啪', '叽', '噗']), x + rand(-14, 14) * U, y - 26 * U, power >= 1.8 ? 42 : power >= 0.75 ? 30 : 20);
    }
    shake(Math.min(14, 2 + power * 5));
    if (power >= 0.75) haptic(power > 1.5 ? 24 : 12);
    dollFace(power >= 2 ? 'dizzy' : 'wince', power >= 2 ? 1.5 : 0.6);
    if (d.line <= 0 && Math.random() < (power >= 0.75 ? 0.42 : 0.1)) {
      d.line = 2.2;
      const L = d.cover > 0.72 ? LINES.covered : LINES.hit;
      say('doll', pick(L));
    }
  }
  countHit(1);
}
export const LINES = {
  hit: ['哎哟！', '又来？！', '我招谁惹谁了', '我可是手工缝的！', '下次能轻点吗', '这是新衣服！', '我要告诉我妈', '我是{name}，我很好', '求你换个人吧', '能不能讲点道理', '呜呜呜', '你给我等着'],
  covered: ['已经没地方了…', '我看不见了', '帮我叫个洗澡的', '我现在算哪种口味', '还要多久…', '放弃挣扎了'],
  poke: ['别戳！', '痒！', '干嘛？', '还有完没完', '你的手好冰', '戳一下一块钱', '再戳我咬你', '嘿嘿，那里不行'],
  fly: ['哇啊啊啊！', '放我下来！', '我会飞了？！', '恐高！！', '头好晕'],
  land: ['咚…', '摔扁了', '再来一次？不了', '我的腰'],
  start: ['看招！', '新鲜出炉！', '接好了！', '{name}，接招！', '今日份快递！', '热乎的！', '正义的一坨！', '不用谢！', '请签收！'],
};

/* ─────────────── 飞弹 ─────────────── */

export function proj(o) {
  const U = w.U;
  const p = Object.assign({
    x: 0, y: 0, vx: 0, vy: 0, r: 14 * U, rot: rand(-0.3, 0.3), vr: rand(-7, 7), g: 900 * U, kind: 'poop',
    ghost: 0, done: false, t: 0, trail: 0, floor: true, power: 1, wallAt: 0, scripted: false, deflect: true, burn: 0, blink: 0, floorZ: rand(-2, 44) * U,
  }, o);
  w.projs.push(p);
  return p;
}
/** 让 p 在 T 秒后到达 (tx,ty) */
export function aim(p, tx, ty, T) {
  p.vx = (tx - p.x) / T;
  p.vy = (ty - p.y - 0.5 * p.g * T * T) / T;
}
function landProj(p) {
  stainAt(p.x, p.y, p.r * 1.2);
  sfx.splat(Math.min(0.8, p.power) * 0.7);
  drops(p.x, p.y, 0, 3 + (p.power * 4));
  countMiss();
  p.done = true;
}
function stepProjs(dt) {
  const U = w.U, d = w.doll;
  for (const p of w.projs) {
    p.t += dt;
    if (!p.scripted) {
      p.vy += p.g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    p.rot += p.vr * dt;
    // 雨伞挡一下
    if (d.umb && d.umb.open > 0.6 && !d.umb.broken && p.deflect && p.vy > 0) {
      const top = d.root ? app(d.root, 2, -220).y : 0, cxy = app(d.root, 2, -192);
      if (p.y > top && p.y < cxy.y + 12 * U && Math.abs(p.x - cxy.x) < 66 * U) {
        p.vy = -rand(150, 260) * U; p.vx = (p.x < cxy.x ? -1 : 1) * rand(90, 190) * U;
        p.ghost = 1e9; p.deflect = false;
        d.umb.kick = 1;
        sfx.plop();
        drops(p.x, p.y, 0, 2);
      }
    }
    if (!(p.ghost > p.t)) {
      for (const pi of HIT_ORDER) {
        const part = w.dollParts[pi], h = part.def.hit;
        const c = app(part.m, h[0], h[1]);
        const dx = p.x - c.x, dy = p.y - c.y, rr = h[2] * U * Math.max(0.7, Math.min(d.sx || 1, 1.3)) + p.r * 0.5;
        if (dx * dx + dy * dy < rr * rr) {
          p.done = true;
          const dir = Math.abs(p.vx) > 60 * U || p.scripted ? (p.dirX != null ? p.dirX : Math.sign(p.vx)) : 0;
          hitDoll(pi, p.x, p.y, p.r, dir, p.power, { silent: !!p.silent });
          if (p.onHit) p.onHit(pi);
          break;
        }
      }
      if (p.done) continue;
    }
    if (p.wallAt && p.t >= p.wallAt) { landProj(p); continue; }
    if (p.floor && p.y >= w.G + p.floorZ) {
      p.y = w.G + p.floorZ;
      stain(p.x, p.y, p.r * 1.25, true);
      sfx.splat(0.5);
      drops(p.x, p.y, 0, 4);
      countMiss();
      p.done = true;
      continue;
    }
    if (p.x < -90 * U || p.x > w.W + 90 * U || p.y > w.H + 90 * U || p.t > 7) {
      if (!p.keep) p.done = true;
    }
  }
  if (w.projs.some((p) => p.done)) w.projs = w.projs.filter((p) => !p.done);
}
const HIT_ORDER = [IDX.head, IDX.torso, IDX.armF, IDX.armB, IDX.legF, IDX.legB];

/* ─────────────── 主角和布偶的物理 ─────────────── */

function stepHero(dt) {
  const h = w.hero;
  // 身体的层叠晃动
  const dx = (h.x - h.px) / Math.max(dt, 1e-3) / w.U;
  h.px = h.x;
  h.jv += (-h.j * 150 - h.jv * 11 - dx * 0.5) * dt;
  h.j = clamp(h.j + h.jv * dt, -1.6, 1.6);
  h.blinkIn -= dt;
  if (h.blinkIn <= 0) { h.blink = 0.11; h.blinkIn = rand(1.5, 4.2); }
  h.blink = Math.max(0, h.blink - dt);
  if (h.faceT > 0) { h.faceT -= dt; if (h.faceT <= 0) h.face = 'ok'; }
  if (h.starsT > 0) h.starsT -= dt;
  // 眼睛盯着布偶（或者正在飞的东西）
  const tx = w.doll.x - h.x, ty = w.doll.y - 110 * w.U - (h.y - 70 * w.U);
  const L = Math.hypot(tx, ty) || 1;
  const want = (h.flip < 0 ? -1 : 1);
  h.lookX += ((tx / L) * want * 0.9 - h.lookX) * Math.min(1, dt * 10);
  h.lookY += ((ty / L) * 0.8 - h.lookY) * Math.min(1, dt * 10);
}

function stepDoll(dt) {
  const d = w.doll, U = w.U, W = w.W;
  const ivx = d.vx, ivy = d.vy;
  if (d.line > 0) d.line -= dt;
  if (d.grabbed) {
    const k = 1 - Math.pow(0.0006, dt);
    const nx = d.x + (d.gx - d.x) * k, ny = d.y + (d.gy - d.y) * k;
    d.vx = (nx - d.x) / Math.max(dt, 1e-3); d.vy = (ny - d.y) / Math.max(dt, 1e-3);
    d.x = nx; d.y = Math.min(ny, w.G);
    d.vr += (d.vx / U) * 0.012 * dt * 60 * 0.3;
    d.onGround = false;
  } else {
    d.vy += 1700 * U * dt;
    d.x += d.vx * dt; d.y += d.vy * dt;
    const pad = 56 * U;
    if (d.x < pad || d.x > W - pad) {
      const speed = Math.abs(d.vx);
      const side = d.x < pad ? -1 : 1;
      d.x = side < 0 ? pad : W - pad;
      d.vx *= -0.55;
      if (speed > 240 * U) {
        d.sv += 1.4;
        d.vr += side * -speed * 0.006 / U;
        sfx.thud(); shake(4);
        const wy = d.y - rand(50, 110) * U;
        if (w.mess.length && wy < w.wallY) { stain(side < 0 ? rand(8, 24) * U : W - rand(8, 24) * U, wy, rand(10, 18) * U, false); }
        drops(d.x + side * 20 * U, wy, -side, 6);
      }
    }
    const ceil = w.safeT + 170 * U;
    if (d.y < ceil && d.vy < 0) { d.y = ceil; d.vy *= -0.3; }
    if (d.y >= w.G) {
      d.y = w.G;
      if (d.vy > 330 * U) {
        const imp = d.vy / U;
        d.vy *= -0.34; d.vx *= 0.7;
        d.sv += Math.min(4.2, imp * 0.0052);
        d.vr *= 0.6;
        sfx.thud();
        if (imp > 620) { shake(3 + imp * 0.004); puffs(d.x, w.G, 4, 0.7); if (w.mess.length > 2) drops(d.x, w.G - 30 * U, 0, 5); }
        if (d.wasThrown && imp > 500) { d.wasThrown = false; if (d.line <= 0) { d.line = 2; say('doll', pick(LINES.land)); } dollFace('dizzy', 1.1); }
      } else {
        d.vy = 0;
      }
      d.onGround = d.vy === 0;
      d.vx *= Math.exp(-8 * dt);
    } else {
      d.onGround = false;
    }
    // 走回原位：一蹦一蹦
    d.hop -= dt;
    if (d.onGround && Math.abs(d.vx) < 26 * U && d.hop <= 0 && Math.abs(d.x - w.dollHome) > 5 * U && Math.abs(d.rot) < 0.4 && !d.noHop) {
      const dist = w.dollHome - d.x;
      d.vx = clamp(dist / 0.34, -240 * U, 240 * U);
      d.vy = -260 * U;
      d.hop = 0.42;
    }
  }
  // 旋转回正（不倒翁）
  d.vr += (-d.rot * (d.onGround ? 62 : 7) - d.vr * (d.onGround ? 8.5 : 0.9)) * dt;
  d.vr = clamp(d.vr, -26, 26);
  d.rot += d.vr * dt;
  if (Math.abs(d.rot) > TAU) d.rot %= TAU;
  if (d.onGround && Math.abs(d.rot) > Math.PI) d.rot -= Math.sign(d.rot) * TAU;
  // 压扁回弹
  d.sv += (-d.sq * 230 - d.sv * 15) * dt;
  d.sq = clamp(d.sq + d.sv * dt, -0.34, 0.8);
  // 转动的支点：在地上靠近脚，在空中在肚子
  const pvT = d.onGround ? 8 : 74;
  d.pv += (pvT - d.pv) * Math.min(1, dt * 7);
  // 四肢和头的弹簧
  const ax = clamp((d.vx - ivx) / Math.max(dt, 1e-3) / U, -9000, 9000);
  const ay = clamp((d.vy - ivy) / Math.max(dt, 1e-3) / U, -9000, 9000);
  const P = w.dollParts;
  if (P.length) {
    const arm = d.arms;
    P[IDX.armF].rest = arm === 'ears' ? 2.72 : arm === 'cheer' ? 2.3 : 0.55;
    P[IDX.armB].rest = arm === 'ears' || arm === 'umb' ? -2.72 : arm === 'cheer' ? -2.3 : -0.55;
    for (let i = 0; i < P.length; i++) {
      const p = P[i], id = p.def.id;
      let f = 0, c = 8;
      if (id === 'armF') { f = ax * 0.0075 + (ay - 0) * 0.005 + d.vr * 3; c = 3.6; }
      else if (id === 'armB') { f = ax * 0.0075 - ay * 0.005 + d.vr * 3; c = 3.6; }
      else if (id === 'legF') { f = ax * 0.004 + ay * 0.0025; c = 7; }
      else if (id === 'legB') { f = ax * 0.004 - ay * 0.0025; c = 7; }
      else if (id === 'head') { f = -ax * 0.0035 - d.vr * 1.4; c = 7.5; }
      else { f = -ax * 0.0012; c = 13; }
      p.v += (-(p.a - p.rest) * p.def.k - p.v * c + f * 5.5) * dt;
      p.a += p.v * dt;
      if (id === 'head') p.a = clamp(p.a, -0.62, 0.62);
      else if (id === 'torso') p.a = clamp(p.a, -0.26, 0.26);
      else if (id === 'legF' || id === 'legB') p.a = clamp(p.a, -0.95, 0.95);
    }
  }
  // 眼珠子：塑料活动眼，有重力、会盯东西
  let lx = -0.35, ly = 0.15;
  const head = P.length ? app(P[IDX.head].m, 0, -40) : { x: d.x, y: d.y };
  if (d.look) {
    const tx = (d.look.x ?? 0) - head.x, ty = (d.look.y ?? 0) - head.y, L = Math.hypot(tx, ty) || 1;
    lx = (tx / L) * 0.95; ly = (ty / L) * 0.95;
  } else if (!d.grabbed) {
    const tx = w.hero.x - head.x, ty = w.hero.y - 70 * U - head.y, L = Math.hypot(tx, ty) || 1;
    lx = (tx / L) * 0.75; ly = (ty / L) * 0.75;
  } else { ly = 0.9; lx = 0; }
  for (const e of d.pupil) {
    e.vx += ((lx - e.x) * 230 - e.vx * 13 - ax * 0.008) * dt;
    e.vy += ((ly - e.y) * 230 - e.vy * 13 - ay * 0.008) * dt;
    e.x += e.vx * dt; e.y += e.vy * dt;
    const L = Math.hypot(e.x, e.y);
    if (L > 1) { e.x /= L; e.y /= L; e.vx *= -0.3; e.vy *= -0.3; }
  }
  if (d.faceT > 0) {
    d.faceT -= dt;
    if (d.faceT <= 0) d.face = d.cover > 0.72 ? 'blank' : d.cover > 0.28 ? 'grump' : 'idle';
  }
  d.hatPop += (1 - d.hatPop) * Math.min(1, dt * 12);
  if (d.umb) {
    d.umb.kick += (0 - d.umb.kick) * Math.min(1, dt * 12);
  }
  updateDollMatrices();
  for (const p of P) if (p.dirty) bakePart(p);
}

function stepParts(dt) {
  const U = w.U;
  for (const p of w.parts) {
    p.t += dt;
    p.vy += p.g * dt;
    p.x += p.vx * dt; p.y += p.vy * dt;
    p.rot += p.vr * dt;
    if (p.type === 'drop' && p.y >= p.floorAt) {
      if (Math.random() < 0.5) stain(p.x, p.y, p.r * 1.3, true, false);
      p.t = 1e9;
    }
    if (p.type === 'water' && p.y >= p.floorAt) {
      addP({ type: 'ring', x: p.x, y: p.y, r: 2 * U, life: 0.26 });
      p.t = 1e9;
    }
  }
  if (w.parts.some((p) => p.t >= p.life)) w.parts = w.parts.filter((p) => p.t < p.life);
  for (const wd of w.words) wd.t += dt;
  if (w.words.some((x) => x.t >= x.life)) w.words = w.words.filter((x) => x.t < x.life);
}
function stepBubbles(rdt) {
  const U = w.U;
  for (const b of w.bubbles) {
    b.t += rdt;
    if (b.who === 'hero') {
      const h = w.hero;
      b.x = clamp(h.x + 8 * U, 10 * U, w.W - 10 * U);
      b.y = clamp(h.y - 132 * U * Math.max(0.5, h.sy), w.safeT + 80 * U, w.H);
    } else {
      const p = dollTop();
      b.x = clamp(p.x, 10 * U, w.W - 10 * U);
      b.y = clamp(p.y, w.safeT + 80 * U, w.H);
    }
  }
  if (w.bubbles.some((b) => b.t >= b.life)) w.bubbles = w.bubbles.filter((b) => b.t < b.life);
}

export function step(rdt) {
  const dt = rdt * w.timeScale;
  w.dt = dt; w.t += dt;
  stepTweens(dt);
  stepTasks(dt);
  stepHero(dt);
  stepDoll(dt);
  stepProjs(dt);
  stepParts(dt);
  stepDrips(dt);
  stepBubbles(rdt);
  w.shake *= Math.exp(-9 * rdt);
  if (w.shake < 0.2) w.shake = 0;
  w.flash = Math.max(0, w.flash - rdt * 3.2);
  if (w.plaquePressed > 0) w.plaquePressed -= rdt;
}

/* ─────────────── 输入判定 ─────────────── */

export function hitTestDoll(x, y) {
  const U = w.U;
  for (const pi of HIT_ORDER) {
    const p = w.dollParts[pi], h = p.def.hit, c = app(p.m, h[0], h[1]);
    const r = (h[2] + 6) * U;
    if ((x - c.x) ** 2 + (y - c.y) ** 2 < r * r) return true;
  }
  return false;
}
export function hitTestHero(x, y) {
  const h = w.hero, U = w.U;
  return Math.abs(x - h.x) < 56 * U && y < h.y + 4 * U && y > h.y - 132 * U;
}
export const plaquePos = () => ({ x: w.W - 82 * w.U, y: w.safeT + 34 * w.U + 26 * w.U });
export function hitTestPlaque(x, y) {
  const p = plaquePos(), U = w.U;
  return Math.abs(x - p.x) < 76 * U && y > p.y - 10 * U && y < p.y + 62 * U;
}

/* ─────────────── 绘制 ─────────────── */

function shadow(c, x, sizeK, alpha = 0.22, y = w.G + 4 * w.U) {
  c.fillStyle = `rgba(31,19,12,${alpha})`;
  c.beginPath(); c.ellipse(x, y, 54 * w.U * sizeK, 11 * w.U * sizeK, 0, 0, TAU); c.fill();
}
function drawDollFull(c) {
  const d = w.doll, P = w.dollParts, t = w.t;
  const place = (p) => {
    const [bx, by, bw, bh] = p.def.bbox;
    c.save();
    c.transform(p.m[0], p.m[1], p.m[2], p.m[3], p.m[4], p.m[5]);
    c.drawImage(p.sprite, bx, by, bw, bh);
    c.drawImage(p.final, bx, by, bw, bh);
    return true;
  };
  for (const id of ['legB', 'legF', 'armB', 'torso']) { place(P[IDX[id]]); c.restore(); }
  if (d.umb) {
    c.save();
    const r = d.root; c.transform(r[0], r[1], r[2], r[3], r[4], r[5]);
    const ab = P[IDX.armB], a = ab.a;
    drawUmbrella(c, d.umb, ab.def.px - Math.sin(a) * 34, ab.def.py + Math.cos(a) * 34);
    c.restore();
  }
  place(P[IDX.head]);
  drawDollFace(c, d, t);
  drawHat(c, w.hat, w.skin, w.cherry, clamp(P[IDX.head].v * 0.35 + d.vx * 0.002 / w.U, -2.2, 2.2), d.hatPop, t);
  c.restore();
  place(P[IDX.armF]); c.restore();
}
function drawHeroFull(c) {
  const h = w.hero, U = w.U, pv = 58 * U;
  c.save();
  c.translate(h.x, h.y - pv);
  c.rotate(h.rot);
  c.translate(0, pv);
  c.scale((Math.abs(h.flip) < 0.02 ? 0.02 : h.flip) * h.sx * U, h.sy * U);
  drawHero(c, h, w.heroSp, w.t);
  c.restore();
  if (h.starsT > 0) {
    const n = 4, y = h.y - 136 * U * h.sy;
    for (let i = 0; i < n; i++) {
      const a = w.t * 6 + (i / n) * TAU;
      const x = h.x + Math.cos(a) * 34 * U, yy = y + Math.sin(a) * 9 * U;
      starPath(c, x, yy, 6.5 * U, a);
      c.fillStyle = '#FFE04A'; c.fill(); c.strokeStyle = INK; c.lineWidth = 2 * U; c.stroke();
    }
  }
}
function drawProj(c, p) {
  const U = w.U;
  const speed = Math.hypot(p.vx, p.vy);
  if (p.trail && speed > 240 * U && !p.scripted) {
    const a = Math.atan2(p.vy, p.vx), L = Math.min(90 * U, speed * 0.075);
    c.save(); c.translate(p.x, p.y); c.rotate(a);
    c.strokeStyle = 'rgba(255,255,255,.85)'; c.lineCap = 'round'; c.lineWidth = 3.2 * U;
    c.beginPath();
    c.moveTo(-p.r * 1.1, -p.r * 0.5); c.lineTo(-p.r * 1.1 - L, -p.r * 0.5);
    c.moveTo(-p.r * 1.25, 0); c.lineTo(-p.r * 1.25 - L * 1.3, 0);
    c.moveTo(-p.r * 1.1, p.r * 0.5); c.lineTo(-p.r * 1.1 - L * 0.8, p.r * 0.5);
    c.stroke(); c.restore();
  }
  const sp = w.poopSp[p.kind] || w.poopSp.poop, R = p.r * 1.42;
  c.save(); c.translate(p.x, p.y); c.rotate(p.rot);
  if (p.kind === 'disc') c.scale(1, 0.72);
  c.drawImage(sp.img, -R, -R, R * 2, R * 2);
  if (p.kind === 'bomb' && !p.hideFuse) {
    if (p.blink > 0 && Math.sin(w.t * (10 + p.blink * 26)) > 0) {
      c.fillStyle = 'rgba(226,52,44,.55)';
      c.beginPath(); c.arc(0, 0, p.r * 0.96, 0, TAU); c.fill();
    }
    drawFuse(c, p.r, w.t, p.burn);
  }
  c.restore();
}
function drawPart(c, p) {
  const U = w.U, k = p.t / p.life;
  switch (p.type) {
    case 'drop':
      c.fillStyle = w.skin.goo; c.strokeStyle = INK; c.lineWidth = 1.4 * U;
      c.beginPath(); c.arc(p.x, p.y, p.r, 0, TAU); c.fill(); c.stroke();
      break;
    case 'puff':
      c.globalAlpha = (1 - k) * 0.95;
      c.fillStyle = p.col; c.strokeStyle = INK; c.lineWidth = 2 * U;
      c.beginPath(); c.arc(p.x, p.y, p.r * (0.6 + k * 0.9), 0, TAU); c.fill(); c.stroke();
      c.globalAlpha = 1;
      break;
    case 'star':
      c.globalAlpha = 1 - k * k;
      starPath(c, p.x, p.y, p.r, p.rot);
      c.fillStyle = '#FFE04A'; c.fill(); c.strokeStyle = INK; c.lineWidth = 1.8 * U; c.stroke();
      c.globalAlpha = 1;
      break;
    case 'note':
      c.globalAlpha = k > 0.7 ? (1 - k) / 0.3 : 1;
      c.save(); c.translate(p.x + Math.sin(p.t * 7) * 6 * U, p.y); c.rotate(p.rot);
      c.font = `900 ${22 * U}px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.lineWidth = 4 * U; c.strokeStyle = '#FFF'; c.strokeText(p.ch, 0, 0);
      c.fillStyle = INK; c.fillText(p.ch, 0, 0);
      c.restore(); c.globalAlpha = 1;
      break;
    case 'water':
      c.strokeStyle = '#4FB6F0'; c.lineWidth = p.r * 1.3; c.lineCap = 'round';
      c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(p.x, p.y - 13 * U); c.stroke();
      break;
    case 'ring':
      c.globalAlpha = 1 - k; c.strokeStyle = '#4FB6F0'; c.lineWidth = 1.6 * U;
      c.beginPath(); c.ellipse(p.x, p.y, (3 + k * 14) * U, (1 + k * 4) * U, 0, 0, TAU); c.stroke();
      c.globalAlpha = 1;
      break;
    case 'bubble':
      c.globalAlpha = k > 0.75 ? (1 - k) / 0.25 : 0.95;
      c.fillStyle = 'rgba(255,255,255,.45)'; c.strokeStyle = '#2F7FB5'; c.lineWidth = 1.6 * U;
      c.beginPath(); c.arc(p.x + Math.sin(p.t * 6) * 4 * U, p.y, p.r, 0, TAU); c.fill(); c.stroke();
      c.globalAlpha = 1;
      break;
  }
}
function drawProp(c, p) {
  switch (p.type) {
    case 'tramp': drawTrampoline(c, p); break;
    case 'cloud': drawCloud(c, p, w.t); break;
    case 'nozzle': drawNozzle(c, p); break;
    case 'shower': drawShower(c, p); break;
    case 'toilet': drawToilet(c, p, w.t); break;
    case 'target':
      c.fillStyle = `rgba(31,19,12,${0.26 * p.s})`;
      c.beginPath(); c.ellipse(p.x, p.y, 56 * p.u * p.s, 13 * p.u * p.s, 0, 0, TAU); c.fill();
      break;
  }
}
export function addProp(o) {
  const p = Object.assign({ u: w.U, s: 1, front: false }, o);
  w.props.push(p);
  return p;
}
export function dropProp(p) { w.props = w.props.filter((q) => q !== p); }

export function render(c) {
  const { W, H, dpr, U } = w;
  const sk = w.shake;
  const ox = sk ? rand(-sk, sk) : 0, oy = sk ? rand(-sk, sk) : 0;
  c.setTransform(dpr, 0, 0, dpr, ox * dpr, oy * dpr);
  c.lineJoin = 'round'; c.lineCap = 'round';
  c.drawImage(w.bg, 0, 0, W, H);
  const pq = plaquePos();
  drawPlaque(c, pq.x, pq.y, U, w.name, w.hits, w.plaquePressed > 0);
  c.drawImage(w.stainCv, 0, 0, W, H);
  // 影子
  const h = w.hero, d = w.doll;
  shadow(c, h.x, clamp(1 - (w.G - h.y) / (420 * U), 0.25, 1));
  shadow(c, d.x, clamp(1 - (w.G - d.y) / (420 * U), 0.25, 1) * (1 + d.pan * 0.5));
  for (const p of w.projs) {
    if (p.y < w.G && p.y > -40 * U) {
      c.fillStyle = 'rgba(31,19,12,.16)';
      c.beginPath(); c.ellipse(p.x, w.G + p.floorZ * 0.4, p.r * 1.1, p.r * 0.32, 0, 0, TAU); c.fill();
    }
  }
  for (const p of w.props) if (!p.front) drawProp(c, p);
  drawDollFull(c);
  drawHeroFull(c);
  for (const p of w.projs) drawProj(c, p);
  for (const p of w.parts) drawPart(c, p);
  for (const p of w.props) if (p.front) drawProp(c, p);
  for (const wd of w.words) drawWord(c, wd, U);
  const minY = w.safeT + 8 * U;
  for (const b of w.bubbles) drawBubble(c, b, U, W, minY);
  if (w.flash > 0) {
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.globalAlpha = Math.min(1, w.flash);
    c.fillStyle = w.flashCol; c.fillRect(0, 0, W, H);
    c.globalAlpha = 1;
  }
}

/* ─────────────── 给招式用的 ─────────────── */

export function poopHold(kind = 'poop', r = 15) {
  return (c) => {
    const sp = w.poopSp[kind], R = r * 1.42;
    c.drawImage(sp.img, -R, -R, R * 2, R * 2);
    if (kind === 'bomb') drawFuse(c, r, w.t, 0);
  };
}
export function eraseMess(power) {
  // 洗澡：一点点把糊的冲掉
  for (const p of w.dollParts) {
    const c = p.fill.getContext('2d'), cw = p.fill.width, ch = p.fill.height;
    c.globalCompositeOperation = 'destination-out';
    c.fillStyle = `rgba(0,0,0,${power})`;
    c.fillRect(0, 0, cw, ch);
    for (let i = 0; i < 3; i++) {
      c.fillStyle = '#000';
      c.beginPath(); c.arc(Math.random() * cw, Math.random() * ch, cw * rand(0.04, 0.1), 0, TAU); c.fill();
    }
    c.globalCompositeOperation = 'source-over';
    p.dirty = true;
  }
  const s = w.stainCtx;
  s.save();
  s.setTransform(1, 0, 0, 1, 0, 0);
  s.globalCompositeOperation = 'destination-out';
  s.fillStyle = `rgba(0,0,0,${power * 0.7})`;
  s.fillRect(0, 0, w.stainCv.width, w.stainCv.height);
  s.restore();
}
export function clearAllMess() {
  w.mess = []; w.stains = []; w.drips = [];
  w.hat = 0; w.cherry = false; w.hits = 0; w.fresh = true;
  w.doll.cover = 0;
  for (const p of w.dollParts) {
    p.fill.getContext('2d').clearRect(0, 0, p.fill.width, p.fill.height);
    p.final.getContext('2d').clearRect(0, 0, p.final.width, p.final.height);
  }
  const s = w.stainCtx;
  s.save(); s.setTransform(1, 0, 0, 1, 0, 0); s.clearRect(0, 0, w.stainCv.width, w.stainCv.height); s.restore();
  w.dirty = true;
}
export { rng, hatTop };
