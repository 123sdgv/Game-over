// 便便超人的 12 招，每招是一段协程。yield 数字=等几秒，yield 函数=等它变 true，yield null=等一帧。
import {
  w, E, spawn, tw, proj, aim, say, pick, rand, clamp, heroPt, heroHand, poopHold, heroFace, dollFace, word, shake, flash, haptic,
  puffs, stars, drops, note, waterDrop, soap, stain, hitDoll, dollHead, dollTorso, dollTop, PART, addProp, dropProp, addSplat, countHit,
  LINES, eraseMess, clearAllMess, hatTop,
} from './world.js';
import { sfx } from './sfx.js';
import { TOILET_MOUTH } from './art.js';

const TAU = Math.PI * 2;
const U = () => w.U;

/* ─────────────── 公共动作 ─────────────── */

function* rest(d = 0.24) {
  const h = w.hero;
  h.holdDraw = null;
  tw(h, { sx: 1, sy: 1, rot: 0, capeUp: 0 }, d, E.inOut);
  tw(h, { flip: 1 }, d * 0.8, E.inOut);
  tw(h.armF, { x: 44, y: -26 }, d, E.out);
  tw(h.armB, { x: -46, y: -26 }, d, E.out);
  tw(h.legF, { x: 20, y: 0 }, d, E.out);
  tw(h.legB, { x: -20, y: 0 }, d, E.out);
  if (Math.abs(h.x - w.heroHome) > 3 * U()) yield* hop(w.heroHome);
  h.y = w.G;
  yield d;
}
function* hop(x, dur = 0.3, height = 30) {
  const h = w.hero, x0 = h.x, y0 = h.y;
  let t = 0;
  while (t < dur) {
    t += w.dt;
    const k = Math.min(1, t / dur);
    h.x = x0 + (x - x0) * k;
    h.y = y0 + (w.G - y0) * k - Math.sin(k * Math.PI) * height * U();
    h.rot = Math.sin(k * TAU) * 0.09;
    yield null;
  }
  h.x = x; h.y = w.G; h.rot = 0;
  h.sx = 1.16; h.sy = 0.86;
  tw(h, { sx: 1, sy: 1 }, 0.2, E.back);
  sfx.tap(0);
}
function* tremble(dur) {
  const h = w.hero, x0 = h.x;
  let t = 0;
  while (t < dur) {
    t += w.dt;
    h.x = x0 + Math.sin(t * 90) * 1.8 * U();
    yield null;
  }
  h.x = x0;
}
/** 背过身去、撅起来、使劲 */
function* buttReady(d = 0.26) {
  const h = w.hero;
  tw(h, { flip: -1 }, 0.14, E.inOut);
  yield 0.14;
  heroFace('strain');
  tw(h, { sx: 1.16, sy: 0.8, rot: -0.42 }, 0.2, E.out);
  tw(h.armF, { x: 42, y: -14 }, 0.2);
  tw(h.armB, { x: -30, y: -30 }, 0.2);
  sfx.strain(d);
  yield* tremble(d);
}
const rearPt = () => heroPt(-48, -36);

function* pullOut(kind, r, flipBack = false) {
  // 从身后掏出一坨
  const h = w.hero;
  heroFace('grin');
  tw(h.armF, { x: -18, y: -18 }, 0.13, E.out);
  yield 0.14;
  h.holdDraw = poopHold(kind, r);
  sfx.pop();
  tw(h.armF, { x: 50, y: -70 }, 0.14, E.back);
  yield 0.15;
}
function* windUp(dur = 0.45, turns = 2) {
  const h = w.hero;
  let t = 0;
  while (t < dur) {
    t += w.dt;
    const a = (t / dur) * turns * TAU - 1;
    h.armF.x = 30 + Math.cos(a) * 34;
    h.armF.y = -72 + Math.sin(a) * 34;
    h.rot = Math.sin(a) * 0.05;
    yield null;
  }
  h.rot = 0;
}

/* ─────────────── 12 招 ─────────────── */

function* mvShot() {
  const h = w.hero;
  say('hero', pick(LINES.start));
  yield* buttReady(0.26);
  const o = rearPt(), t = dollTorso();
  const p = proj({ x: o.x, y: o.y, r: 18 * U(), trail: 1, g: 420 * U(), power: 1.15, vr: 7 });
  aim(p, t.x, t.y, 0.25);
  sfx.toot(0.26, 86);
  puffs(o.x, o.y, 4, 0.8);
  word('噗！', o.x + 24 * U(), o.y - 24 * U(), 30, '#FFF');
  shake(4);
  heroFace('wow', 0.5);
  h.sx = 0.86; h.sy = 1.24;
  const home = h.x;
  h.x = home - 22 * U();
  tw(h, { x: home, sx: 1, sy: 1, rot: -0.1 }, 0.38, E.back);
  yield () => p.done;
  yield 0.14;
  heroFace('grin', 0.8);
  yield* rest();
}

function* mvLob() {
  const h = w.hero, d = w.doll, u = U();
  say('hero', pick(LINES.start));
  yield* pullOut('poop', 15);
  yield* windUp(0.42, 2);
  h.holdDraw = null;
  tw(h.armF, { x: 22, y: -158 }, 0.08, E.out);
  tw(h, { sx: 0.88, sy: 1.22 }, 0.08, E.out);
  const o = heroHand();
  const p = proj({ x: o.x, y: o.y, vx: 40 * u, vy: -1320 * u, g: 700 * u, r: 16 * u, ghost: 1e9, floor: false, keep: true, deflect: false });
  sfx.whoosh(0.28, true);
  yield 0.1;
  tw(h, { sx: 1, sy: 1 }, 0.16, E.back);
  yield () => p.y < -130 * u;
  // 天上转一圈再掉下来，变大一点
  heroFace('smug');
  const tx = d.x;
  p.x = tx; p.y = -240 * u; p.vx = 0; p.vy = 80 * u; p.g = 1050 * u; p.r = 30 * u; p.ghost = 0; p.floor = true; p.power = 1.55; p.dirX = 0; p.keep = false; p.floorZ = 6 * u; p.trail = 1;
  const mark = addProp({ type: 'target', x: tx, y: w.G + 4 * u, s: 0.1 });
  tw(mark, { s: 1 }, 0.62, E.in);
  d.look = p;
  dollFace('shock', 1.2);
  say('doll', pick(['嗯？', '什么声音？', '天怎么黑了']), 1);
  sfx.whistle(0.62);
  yield () => p.done;
  dropProp(mark);
  d.look = null;
  yield 0.2;
  heroFace('grin', 0.8);
  yield* rest();
}

function* mvJuggle() {
  const h = w.hero, u = U();
  say('hero', pick(['颠一个！', '看好了！', '基本功！']));
  heroFace('grin');
  const head = () => h.y - 128 * u * h.sy;
  // 从身后弹出来
  const start = heroPt(-46, -40);
  sfx.toot(0.12, 120);
  puffs(start.x, start.y, 2, 0.6);
  const p = proj({ x: start.x, y: start.y, g: 1180 * u, r: 13 * u, ghost: 1e9, floor: false, keep: true, deflect: false });
  aim(p, h.x, head() - 12 * u, 0.42);
  h.lookY = -1;
  tw(h, { x: h.x + 2 * u }, 0.1);
  for (let i = 0; i < 3; i++) {
    yield () => p.vy > 0 && p.y >= head() - p.r * 0.7;
    p.y = head() - p.r * 0.7;
    p.vy = -(470 + i * 66) * u;
    p.vx = (h.x - p.x) * 2.2;
    p.vr = rand(-5, 5);
    sfx.tap(i);
    h.sx = 1.12; h.sy = 0.86;
    tw(h, { sx: 1, sy: 1 }, 0.18, E.back);
  }
  yield () => p.vy > 0 && p.y >= head() - p.r * 0.7;
  p.vy = -760 * u; p.vx = 0;
  sfx.tap(4);
  // 空翻踢
  h.sx = 1.2; h.sy = 0.78;
  tw(h, { sx: 1, sy: 1 }, 0.12);
  yield 0.1;
  sfx.whoosh(0.3, true);
  tw(h.legF, { x: 42, y: -26 }, 0.2);
  tw(h.armF, { x: 30, y: -94 }, 0.2);
  let t = 0, kicked = false;
  const D = 0.62;
  while (t < D) {
    t += w.dt;
    const k = Math.min(1, t / D);
    h.y = w.G - Math.sin(k * Math.PI) * 160 * u;
    h.rot = -E.inOut(k) * TAU;
    if (!kicked && k > 0.46) {
      kicked = true;
      const hd = dollHead();
      p.g = 200 * u; p.trail = 1; p.ghost = 0; p.power = 1.2; p.floor = true; p.keep = false; p.r = 17 * u; p.vr = 18;
      aim(p, hd.x, hd.y, 0.2);
      sfx.kick();
      stars(p.x, p.y, 5);
      word('踢！', p.x, p.y - 16 * u, 32);
      shake(3);
    }
    yield null;
  }
  h.y = w.G; h.rot = 0;
  tw(h.legF, { x: 20, y: 0 }, 0.12);
  h.sx = 1.26; h.sy = 0.72;
  tw(h, { sx: 1, sy: 1 }, 0.32, E.back);
  sfx.thud();
  heroFace('grin', 1);
  tw(h.armF, { x: 40, y: -118 }, 0.2, E.back);
  yield () => p.done;
  yield 0.2;
  yield* rest();
}

function* mvTramp() {
  const h = w.hero, u = U();
  const mkT = (x) => addProp({ type: 'tramp', x, y: w.G + 3 * u, s: 0, sag: 0 });
  const a = mkT(w.W * 0.385), b = mkT(w.W * 0.565);
  say('hero', pick(['蹦一个！', '弹弹弹！', '{name}，看这里！']));
  tw(a, { s: 1 }, 0.3, E.back); sfx.pop();
  yield 0.1;
  tw(b, { s: 1 }, 0.3, E.back); sfx.pop();
  yield 0.2;
  yield* pullOut('poop', 15);
  h.holdDraw = null;
  tw(h.armF, { x: 58, y: -40 }, 0.1, E.out);
  const o = heroHand();
  const matY = (t) => t.y - 40 * u;
  const p = proj({ x: o.x, y: o.y, g: 1250 * u, r: 15 * u, ghost: 1e9, floor: false, keep: true, deflect: false, vr: 6 });
  aim(p, a.x, matY(a), 0.44);
  sfx.whoosh(0.2, false);
  const land = (t, i) => {
    p.x = t.x; p.y = matY(t);
    t.sag = 1; tw(t, { sag: 0 }, 0.5, E.elastic);
    sfx.boing(i);
    word(['嘣！', '嘣嘣！', '嘣嘣嘣！'][i], t.x, t.y - 70 * u, 20 + i * 5, '#FFF');
    h.lookX = 1;
  };
  yield 0.44;
  land(a, 0);
  aim(p, b.x, matY(b), 0.72);
  yield 0.72;
  land(b, 1);
  aim(p, a.x, matY(a), 0.86);
  dollFace('smug', 1);
  yield 0.86;
  land(a, 2);
  const hd = dollHead();
  p.ghost = 0; p.r = 21 * u; p.power = 1.4; p.trail = 1; p.floor = true; p.keep = false; p.vr = 14;
  aim(p, hd.x, hd.y, 0.66);
  w.doll.look = p;
  dollFace('shock', 0.7);
  yield () => p.done;
  w.doll.look = null;
  heroFace('grin', 0.9);
  yield 0.1;
  tw(a, { s: 0 }, 0.22, E.in); tw(b, { s: 0 }, 0.22, E.in);
  yield 0.24;
  dropProp(a); dropProp(b);
  yield* rest();
}

function* mvGatling() {
  const h = w.hero, u = U();
  say('hero', pick(['火力全开！', '哒哒哒哒！', '今天吃得多！']));
  yield* buttReady(0.32);
  const home = h.x;
  const N = 14;
  for (let i = 0; i < N; i++) {
    const o = rearPt();
    proj({ x: o.x, y: o.y, vx: rand(620, 700) * u, vy: rand(-110, -30) * u, g: 240 * u, r: rand(8, 11) * u, power: 0.32, silent: i % 3 !== 0, vr: rand(-12, 12) });
    sfx.toot(0.05, 94 + i * 7);
    puffs(o.x, o.y, 1, 0.45);
    h.x = Math.max(home - 34 * u, h.x - 2.6 * u);
    h.sy = 0.8 + (i % 2) * 0.06; h.sx = 1.16 - (i % 2) * 0.05;
    if (i % 3 === 0) shake(1.6);
    yield 0.085 - i * 0.0018;
  }
  yield 0.12;
  heroFace('blank');
  const o = rearPt();
  puffs(o.x, o.y, 1, 0.4);
  sfx.fizzle();
  say('hero', pick(['…没货了', '…等我喝口水', '库存告急']), 1.2);
  yield 0.8;
  tw(h, { x: home }, 0.3, E.inOut);
  yield* rest();
}

function* mvBomb() {
  const h = w.hero, d = w.doll, u = U();
  say('hero', pick(['小心轻放~', '送你个礼物', '这个有点猛']));
  heroFace('grin');
  tw(h.armF, { x: -18, y: -18 }, 0.13);
  yield 0.14;
  h.holdDraw = poopHold('bomb', 20);
  sfx.pop();
  sfx.sizzle(0.5);
  tw(h.armF, { x: -42, y: -28 }, 0.24, E.out);
  tw(h, { rot: -0.1, sx: 1.08, sy: 0.92 }, 0.24, E.out);
  yield 0.26;
  tw(h.armF, { x: 58, y: -10 }, 0.1, E.out);
  tw(h, { rot: 0.14, sx: 1, sy: 1 }, 0.1);
  yield 0.08;
  h.holdDraw = null;
  const startX = heroHand().x;
  const p = proj({ x: startX, y: w.G - 12 * u, r: 20 * u, kind: 'bomb', g: 0, ghost: 1e9, floor: false, keep: true, scripted: true, vr: 0, rot: 0, deflect: false });
  sfx.roll(0.82);
  const target = Math.max(startX + 30 * u, d.x - 56 * u);
  tw(p, { x: target }, 0.85, E.out);
  tw(h, { rot: 0 }, 0.2);
  // 地上滚
  // 滚完正好立住，引线朝上
  const turns = Math.max(1, Math.round((target - startX) / (20 * u) / TAU));
  let t = 0;
  while (t < 0.85) { t += w.dt; p.rot = ((p.x - startX) / (target - startX)) * turns * TAU; yield null; }
  p.rot = 0;
  d.look = { x: p.x, y: p.y };
  dollFace('shock', 1.3);
  say('doll', pick(['…这是啥？', '不是吧', '妈…']), 1.1);
  sfx.sizzle(1.05);
  // 主角捂耳朵
  heroFace('wow');
  tw(h.armF, { x: 30, y: -96 }, 0.2, E.back);
  tw(h.armB, { x: -24, y: -96 }, 0.2, E.back);
  tw(h, { sy: 0.84, sx: 1.12 }, 0.2);
  t = 0;
  const FUSE = 1.05;
  while (t < FUSE) {
    t += w.dt;
    p.burn = t / FUSE;
    p.blink = t / FUSE;
    const g = 1 + Math.sin(t * 34) * 0.03 * (t / FUSE) + (t / FUSE) * 0.12;
    p.r = 20 * u * g;
    yield null;
  }
  // 轰！
  p.done = true;
  flash(0.9);
  shake(20);
  haptic([30, 20, 40]);
  sfx.boom();
  word('轰！！', p.x, p.y - 70 * u, 58, '#FF7A2B');
  puffs(p.x, p.y - 8 * u, 12, 2.1, '#FFF3C8');
  stars(p.x, p.y, 10, 360);
  drops(p.x, p.y, 0, 34, 1.7);
  for (let i = 0; i < 9; i++) {
    const a = rand(-Math.PI, 0), R = rand(50, 190) * u;
    stain(p.x + Math.cos(a) * R * 1.3, p.y - 60 * u + Math.sin(a) * R, rand(8, 20) * u, false);
  }
  for (let i = 0; i < 6; i++) stain(p.x + rand(-110, 110) * u, w.G + rand(-4, 46) * u, rand(9, 20) * u, true);
  [[PART.head, rand(-24, 24), rand(-60, -18), 24], [PART.head, rand(-24, 24), rand(-60, -18), 18], [PART.torso, rand(-20, 20), rand(-46, -8), 24], [PART.armF, 0, 22, 12], [PART.armB, 0, 22, 12], [PART.legF, 0, 18, 13], [PART.legB, 0, 18, 13]].forEach(([pi, x, y, r]) => addSplat(pi, x, y, r));
  countHit(7);
  d.vy = -880 * u; d.vx = 150 * u; d.vr = 14; d.sv += 4; d.look = null; d.wasThrown = true;
  dollFace('dizzy', 2.2);
  say('doll', pick(LINES.fly), 1.2);
  heroFace('grin', 1.4);
  yield 0.5;
  tw(h, { sx: 1, sy: 1 }, 0.2, E.back);
  yield 0.7;
  yield* rest();
}

function* mvRain() {
  const h = w.hero, d = w.doll, u = U();
  say('hero', pick(['下雨咯~', '天气预报:局部有糊', '收衣服啦！']));
  heroFace('smug');
  tw(h.armF, { x: 36, y: -128 }, 0.14, E.back);
  yield 0.14;
  sfx.snap();
  stars(heroPt(36, -128).x, heroPt(36, -128).y, 2, 120);
  const cloudY = Math.max(w.safeT + 96 * u, w.G - 322 * u);
  const cl = addProp({ type: 'cloud', x: w.W + 110 * u, y: cloudY, s: 1, dark: 0, front: true });
  tw(cl, { x: d.x }, 0.55, E.back);
  sfx.whoosh(0.4, false);
  yield 0.42;
  d.look = { x: d.x, y: cloudY };
  dollFace('smug', 1.9);
  d.arms = 'umb';
  d.umb = { open: 0, kick: 0, broken: 0 };
  tw(d.umb, { open: 1 }, 0.24, E.back);
  sfx.pop();
  say('doll', pick(['早有准备！', '哼，我有伞', '这次淋不到我']), 1.4);
  yield 0.42;
  for (let i = 0; i < 12; i++) {
    proj({ x: cl.x + rand(-54, 54) * u, y: cl.y + 26 * u, vy: 240 * u, g: 900 * u, r: rand(7, 10) * u, power: 0.28, silent: true, vr: rand(-6, 6) });
    cl.x = d.x + Math.sin(i * 1.7) * 4 * u;
    yield 0.085;
  }
  yield 0.42;
  // 乌云生气了
  tw(cl, { dark: 1, s: 1.34 }, 0.42, E.back);
  sfx.rumble(0.7);
  dollFace('blank', 2);
  d.look = { x: d.x, y: cl.y };
  yield 0.72;
  const big = proj({ x: d.x, y: cl.y + 30 * u, vy: 240 * u, g: 1500 * u, r: 36 * u, power: 1.8, trail: 1, deflect: false, dirX: 0, floorZ: 6 * u });
  d.look = big;
  sfx.whistle(0.36);
  yield () => big.y > d.y - 212 * u || big.done;
  if (d.umb) {
    d.umb.broken = 1;
    sfx.crack();
    word('咔！', d.x + 58 * u, d.y - 196 * u, 24, '#FFF');
    tw(d.umb, { open: 0.3 }, 0.1);
  }
  yield () => big.done;
  d.look = null;
  d.arms = 'down';
  d.umb = null;
  dollFace('blank', 1.3);
  say('doll', pick(['…我的伞', '…好吧', '算你狠']), 1.3);
  heroFace('grin', 1);
  yield 0.3;
  tw(cl, { dark: 0, s: 1, x: w.W + 130 * u }, 0.5, E.in);
  yield 0.5;
  dropProp(cl);
  yield* rest();
}

function* mvDive() {
  const h = w.hero, d = w.doll, u = U();
  say('hero', pick(['超人出击！', '正义从天而降！', '看我的！']));
  heroFace('grin');
  tw(h.armF, { x: 36, y: -146 }, 0.2, E.back);
  tw(h, { sx: 1.22, sy: 0.74, capeUp: 0.5 }, 0.22, E.out);
  yield 0.24;
  sfx.whoosh(0.35, true);
  puffs(h.x, w.G, 4, 0.8);
  tw(h, { y: -240 * u, sx: 0.82, sy: 1.3, capeUp: 1 }, 0.26, E.in);
  yield 0.42;
  // 从左上俯冲回来
  const t0 = dollTorso();
  h.sx = 1; h.sy = 1; h.rot = 1.02; h.flip = 1;
  h.x = -140 * u; h.y = t0.y - 280 * u;
  h.armF.x = 58; h.armF.y = -102; h.armB.x = 50; h.armB.y = -92;
  h.legF.x = -8; h.legF.y = 2; h.legB.x = -24; h.legB.y = 0;
  d.look = { x: h.x, y: h.y };
  dollFace('shock', 1);
  say('doll', pick(['等等等等！', '不不不不！']), 0.8);
  sfx.whistle(0.26);
  const tx = t0.x - 48 * u, ty = t0.y + 62 * u;
  tw(h, { x: tx, y: ty }, 0.26, E.in);
  let t = 0;
  while (t < 0.26) {
    t += w.dt;
    if (d.look) { d.look.x = h.x; d.look.y = h.y; }
    yield null;
  }
  // 拍扁
  d.look = null;
  d.pan = 1; d.vx = 30 * u; d.noHop = true;
  flash(0.25);
  shake(16);
  haptic([20, 10, 30]);
  sfx.slam();
  sfx.splat(2);
  word('咚！！', d.x, d.y - 70 * u, 50, '#FF7A2B');
  stars(d.x, d.y - 26 * u, 8, 340);
  drops(d.x, d.y - 20 * u, 1, 24, 1.3);
  addSplat(PART.torso, rand(-10, 10), rand(-34, -16), 30);
  addSplat(PART.head, rand(-10, 10), rand(-46, -28), 30);
  countHit(1);
  stain(d.x + rand(-40, 40) * u, w.G + rand(4, 30) * u, 26 * u, true);
  dollFace('dizzy', 1.8);
  // 弹回家
  const x0 = h.x, y0 = h.y;
  tw(h.armF, { x: 60, y: -60 }, 0.2);
  tw(h.armB, { x: -60, y: -60 }, 0.2);
  heroFace('wow');
  t = 0;
  const D = 0.72;
  while (t < D) {
    t += w.dt;
    const k = Math.min(1, t / D);
    h.x = x0 + (w.heroHome - x0) * k;
    h.y = y0 + (w.G - y0) * k - Math.sin(k * Math.PI) * 190 * u;
    h.rot = 1.02 - (1.02 + 2 * TAU) * E.out(k);
    yield null;
  }
  h.x = w.heroHome; h.y = w.G; h.rot = 0;
  h.sx = 1.26; h.sy = 0.7;
  tw(h, { sx: 1, sy: 1, capeUp: 0 }, 0.34, E.back);
  sfx.thud();
  shake(4);
  heroFace('dizzy', 0.9);
  h.starsT = 0.9;
  tw(h.armF, { x: 44, y: -26 }, 0.2); tw(h.armB, { x: -46, y: -26 }, 0.2);
  tw(h.legF, { x: 20, y: 0 }, 0.2); tw(h.legB, { x: -20, y: 0 }, 0.2);
  yield 0.42;
  // 布偶"噗"地一下鼓回来
  tw(d, { pan: 0 }, 0.28, E.back);
  sfx.pop();
  d.sv -= 3.4;
  d.noHop = false;
  yield 0.55;
  yield* rest();
}

function* mvBoomerang() {
  const h = w.hero, d = w.doll, u = U();
  say('hero', pick(['飞盘！', '这招叫回头是岸', '接着！']));
  yield* pullOut('disc', 20);
  yield* windUp(0.32, 1.5);
  h.holdDraw = null;
  tw(h.armF, { x: 62, y: -50 }, 0.08, E.out);
  const o = heroHand(), hd = dollHead();
  const p = proj({ x: o.x, y: o.y, r: 20 * u, kind: 'disc', g: 0, ghost: 1e9, floor: false, keep: true, scripted: true, vr: 20, deflect: false, dirX: -1, power: 1.25 });
  sfx.whoosh(0.5, false);
  d.look = p;
  const passY = hd.y - 96 * u;
  tw(p, { x: w.W + 90 * u }, 0.62, E.linear);
  // 从上方掠过
  const y0 = p.y;
  let t = 0;
  while (t < 0.62) {
    t += w.dt;
    const k = Math.min(1, t / 0.62);
    p.y = y0 + (passY - y0) * Math.sin(k * Math.PI * 0.62);
    yield null;
  }
  // 布偶得意
  d.look = null;
  dollFace('smug', 1.2);
  d.arms = 'cheer';
  d.vy = -210 * u;
  sfx.tada();
  say('doll', pick(['哈！没打中！', '就这？', '手艺不行啊！']), 1.2);
  heroFace('smug');
  yield 0.72;
  // 从背后回来
  p.x = w.W + 90 * u;
  const hd2 = dollHead();
  p.y = hd2.y - 8 * u;
  p.r = 22 * u; p.vr = 26; p.ghost = 0;
  sfx.whoosh(0.2, true);
  tw(p, { x: hd2.x - 10 * u, y: hd2.y }, 0.2, E.in);
  yield 0.22;
  if (!p.done) { p.scripted = false; p.vx = -560 * u; p.vy = 0; p.g = 300 * u; p.floor = true; p.keep = false; }
  yield () => p.done;
  d.arms = 'down';
  dollFace('wince', 0.9);
  say('doll', pick(['…啊', '……当我没说', '从后面来是吧']), 1.2);
  heroFace('grin', 0.8);
  yield 0.3;
  yield* rest();
}

function* mvToilet() {
  const h = w.hero, d = w.doll, u = U();
  say('hero', pick(['请出镇馆之宝！', '抽水马桶，启动！', '这招是祖传的']));
  yield* hop(w.W * 0.16, 0.26, 26);
  const T = addProp({ type: 'toilet', x: w.W * 0.47, y: w.G + 6 * u, s: 0, tilt: 0, lid: 0, shake: 0, lever: 0 });
  tw(T, { s: 1 }, 0.42, E.back);
  sfx.clank();
  puffs(T.x, w.G, 5, 1);
  yield 0.44;
  tw(T, { lid: 1 }, 0.22, E.back);
  sfx.clank();
  yield 0.18;
  tw(T, { tilt: -0.3 }, 0.28, E.back);
  yield 0.2;
  // 拉手柄
  const lever = () => ({ x: T.x - 69 * u, y: T.y - 80 * u });
  const L = lever();
  const lx = (L.x - h.x) / u, ly = (L.y - h.y) / u;
  tw(h.armF, { x: lx, y: ly - 4 }, 0.16, E.out);
  heroFace('grin');
  yield 0.18;
  tw(h.armF, { x: lx, y: ly + 16 }, 0.1, E.in);
  tw(T, { lever: 1 }, 0.1, E.in);
  sfx.flush(1);
  d.look = { x: T.x, y: T.y - 50 * u };
  dollFace('shock', 1.3);
  say('doll', pick(['那是马桶吗？！', '这不合理！', '等一下等一下']), 1);
  let t = 0;
  while (t < 0.92) {
    t += w.dt;
    T.shake = t / 0.92;
    if (Math.random() < 0.3) {
      const a = T.tilt, mx = T.x + (TOILET_MOUTH[0] * Math.cos(a) - TOILET_MOUTH[1] * Math.sin(a) * -1) * u;
      soap(T.x + rand(-10, 30) * u, T.y - 66 * u);
      void mx;
    }
    yield null;
  }
  T.shake = 0;
  const hd = dollTorso();
  const ma = T.tilt;
  const mx = T.x + (12 * Math.cos(ma) + 62 * Math.sin(ma)) * u, my = T.y + (12 * Math.sin(ma) - 62 * Math.cos(ma)) * u;
  const p = proj({ x: mx, y: my, r: 42 * u, trail: 1, g: 200 * u, power: 2.5, vr: 8, deflect: false, floorZ: 4 * u });
  aim(p, hd.x, hd.y, 0.2);
  flash(0.28);
  shake(14);
  haptic(30);
  sfx.cannon();
  sfx.toot(0.3, 62);
  word('轰！', mx + 10 * u, my - 44 * u, 44, '#FF7A2B');
  puffs(mx, my, 8, 1.3);
  tw(T, { x: T.x - 26 * u, tilt: -0.62 }, 0.1, E.out);
  heroFace('wow', 0.8);
  d.look = p;
  yield 0.14;
  tw(T, { tilt: 0, lever: 0 }, 0.4, E.back);
  yield () => p.done;
  d.look = null;
  d.vx += 120 * u; d.vy -= 180 * u; d.vr += 3; d.wasThrown = true;
  stain(Math.min(d.x + 56 * u, w.W - 14 * u), d.y - rand(70, 120) * u, 26 * u, false);
  dollFace('dizzy', 1.9);
  yield 0.5;
  tw(T, { s: 0 }, 0.26, E.in);
  sfx.clank();
  tw(h.armF, { x: 44, y: -26 }, 0.2);
  yield 0.28;
  dropProp(T);
  heroFace('grin', 0.7);
  yield* rest();
}

function* mvTornado() {
  const h = w.hero, u = U();
  say('hero', pick(['大风车！', '转转转！', '全屏攻击！']));
  yield* hop(w.W * 0.4, 0.26, 26);
  heroFace('grin');
  tw(h.armF, { x: 62, y: -70 }, 0.14, E.out);
  tw(h.armB, { x: -62, y: -70 }, 0.14, E.out);
  tw(h, { capeUp: 1 }, 0.3);
  yield 0.14;
  let t = 0, ph = 0, nextShot = 0, nextWhoosh = 0;
  const D = 1.7;
  while (t < D) {
    t += w.dt;
    const k = t / D;
    ph += (10 + Math.sin(k * Math.PI) * 26) * w.dt;
    h.flip = Math.cos(ph) || 0.02;
    h.y = w.G - Math.abs(Math.sin(ph * 0.5)) * 6 * u;
    h.x = w.W * 0.4 + Math.sin(ph * 0.25) * 20 * u;
    if (t >= nextWhoosh) { nextWhoosh = t + 0.24; sfx.whoosh(0.22, Math.random() < 0.5); }
    if (t >= nextShot) {
      nextShot = t + 0.058;
      const o = { x: h.x, y: h.y - 68 * u };
      const a = rand(-Math.PI * 1.08, Math.PI * 0.08), s = rand(420, 780) * u;
      proj({
        x: o.x, y: o.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, g: 480 * u, r: rand(7, 11) * u, power: 0.32, silent: true, floor: true,
        wallAt: rand(0.22, 0.72), vr: rand(-12, 12),
      });
      if (Math.random() < 0.45) sfx.toot(0.04, rand(90, 130));
    }
    yield null;
  }
  h.flip = 1; h.y = w.G;
  tw(h.armF, { x: 50, y: -40 }, 0.2); tw(h.armB, { x: -50, y: -40 }, 0.2);
  tw(h, { capeUp: 0 }, 0.3);
  heroFace('dizzy', 1.2);
  h.starsT = 1.2;
  say('hero', pick(['世界在转…', '我是谁…', '有点想吐…不是']), 1.2);
  sfx.fizzle();
  t = 0;
  while (t < 1.1) {
    t += w.dt;
    h.rot = Math.sin(t * 8) * 0.24 * (1 - t / 1.1);
    yield null;
  }
  h.rot = 0;
  yield* rest();
}

function* mvSoftServe() {
  const h = w.hero, d = w.doll, u = U();
  say('hero', pick(['甜筒时间！', '给你加个帽子', '第二份半价']));
  heroFace('grin');
  tw(h.armF, { x: 40, y: -118 }, 0.14, E.back);
  yield 0.14;
  sfx.snap();
  const headY = () => dollHeadPivotY() + (hatTop(w.hat) + 2) * u;
  const N = addProp({ type: 'nozzle', x: d.x, y: -20 * u, sq: 0, front: true });
  tw(N, { y: headY() - 14 * u }, 0.44, E.back);
  sfx.clank();
  d.look = { x: d.x, y: 0 };
  dollFace('shock', 3.4);
  say('doll', pick(['嗯？？', '这又是什么', '头上有东西']), 1.1);
  d.noHop = true;
  yield 0.5;
  const before = w.hat;
  const add = Math.min(3, 9 - before);
  for (let i = 0; i < add; i++) {
    N.sq = 1; tw(N, { sq: 0 }, 0.28, E.out);
    sfx.squirt(i);
    w.hat += 1;
    d.hatPop = 0.25;
    d.sv += 1.6;
    d.vr += rand(-0.5, 0.5);
    countHit(1);
    w.dirty = true;
    N.x = d.x;
    tw(N, { y: headY() - 14 * u }, 0.24, E.out);
    yield 0.3;
  }
  if (!w.cherry) {
    w.cherry = true;
    sfx.ding();
    stars(d.x, headY() - 6 * u, 3, 120);
  }
  tw(N, { y: -50 * u }, 0.32, E.in);
  yield 0.34;
  dropProp(N);
  d.look = null;
  d.noHop = false;
  // 太高就塌
  if (w.hat >= 9) {
    say('doll', '要、要塌了！', 1.1, false);
    dollFace('shock', 0.9);
    let t = 0;
    while (t < 0.75) { t += w.dt; d.rot = Math.sin(t * 14) * 0.06 * (1 + t * 2); yield null; }
    const hd = dollHead();
    w.hat = 0; w.cherry = false;
    addSplat(PART.head, rand(-14, 14), rand(-60, -44), 36);
    addSplat(PART.head, rand(-24, 24), rand(-40, -20), 26);
    addSplat(PART.torso, rand(-20, 20), rand(-46, -20), 26);
    addSplat(PART.armF, 0, 18, 14); addSplat(PART.armB, 0, 18, 14);
    drops(hd.x, hd.y - 30 * u, 0, 30, 1.5);
    stain(d.x + rand(-30, 30) * u, w.G + rand(8, 28) * u, 30 * u, true);
    sfx.splat(2.2); shake(10);
    word('塌啦！！', hd.x, hd.y - 60 * u, 36);
    dollFace('blank', 1.4);
    countHit(3);
    d.sv += 4;
    yield 0.6;
    say('hero', '…下次少放点', 1.2);
  } else {
    say('doll', pick(['…有点甜？', '这帽子还挺沉', '我要加钱']), 1.4);
    say('hero', pick(['请慢用~', '不用谢~', '记得给好评']), 1.3);
    heroFace('grin', 1);
    dollFace('smug', 0.9);
  }
  yield 0.4;
  yield* rest();
}
function dollHeadPivotY() {
  const p = w.dollParts[PART.head];
  return p.m[1] * 0 + p.m[3] * 0 + p.m[5];
}

/* ─────────────── 招式表 ─────────────── */

export const MOVES = [
  { id: 'shot', name: '屁股炮', run: mvShot },
  { id: 'lob', name: '高抛', run: mvLob },
  { id: 'juggle', name: '空翻踢', run: mvJuggle },
  { id: 'tramp', name: '蹦床', run: mvTramp },
  { id: 'gatling', name: '连发', run: mvGatling },
  { id: 'bomb', name: '炸弹', run: mvBomb },
  { id: 'rain', name: '下雨', run: mvRain },
  { id: 'dive', name: '俯冲', run: mvDive },
  { id: 'boomerang', name: '回旋', run: mvBoomerang },
  { id: 'toilet', name: '马桶炮', run: mvToilet },
  { id: 'tornado', name: '大风车', run: mvTornado },
  { id: 'softserve', name: '甜筒', run: mvSoftServe },
];
const BYID = Object.fromEntries(MOVES.map((m) => [m.id, m]));

/* ─────────────── 不算招式的小动作 ─────────────── */

const NOTE = { C4: 262, D4: 294, E4: 330, F4: 349, G4: 392, A4: 440, B4: 494, C5: 523, D5: 587, E5: 659, G3: 196, A3: 220 };
const SONGS = [
  { lyric: ['噗~噗~噗~', '我是便便超人~', '哪里有人欠糊~', '我就噗到哪~'],
    notes: 'C4 E4 G4 - G4 A4 G4 E4 F4 F4 A4 - A4 G4 F4 E4 D4 D4 E4 F4 E4 D4 C4 -'.split(' ') },
  { lyric: ['披风飘啊飘~', '腰带闪闪亮~', '世界需要我~', '一坨又一坨~'],
    notes: 'G4 G4 E4 - C5 C5 A4 - A4 G4 F4 E4 D4 - E4 F4 G4 A4 G4 E4 C4 -'.split(' ') },
  { lyric: ['今天天气好~', '适合糊一糊~', '{name}别跑~', '我来抱抱你~'],
    notes: 'E4 G4 A4 G4 E4 - D4 E4 G4 E4 D4 - C4 D4 E4 G4 A4 - G4 E4 D4 C4 -'.split(' ') },
];
function* mvSing() {
  const h = w.hero, d = w.doll, u = U();
  const song = SONGS[(w.stats.sings || 0) % SONGS.length];
  w.stats.sings = (w.stats.sings || 0) + 1;
  w.statsDirty = true;
  heroFace('sing');
  tw(h.armF, { x: 52, y: -92 }, 0.16, E.back);
  tw(h.armB, { x: -54, y: -88 }, 0.16, E.back);
  const beat = 0.2;
  const perLine = Math.ceil(song.notes.length / song.lyric.length);
  for (let i = 0; i < song.notes.length; i++) {
    if (i % perLine === 0) say('hero', song.lyric[Math.floor(i / perLine)], beat * perLine + 0.15, true);
    const n = song.notes[i];
    if (n !== '-') {
      sfx.note(NOTE[n], beat * 0.92);
      note(h.x + rand(-26, 30) * u, h.y - 124 * u);
    }
    h.rot = (i % 2 ? 1 : -1) * 0.07;
    h.sy = i % 2 ? 1.05 : 0.95; h.sx = i % 2 ? 0.96 : 1.04;
    h.armF.y = -92 + (i % 2 ? 8 : -8);
    h.armB.y = -88 + (i % 2 ? -8 : 8);
    if (i === Math.floor(perLine * 1.2)) { d.arms = 'ears'; dollFace('wince', 3); }
    yield beat;
  }
  d.arms = 'down';
  say('doll', pick(['别唱了！', '比糊我还难受', '耳朵进去了…', '求你了']), 1.5);
  dollFace('grump', 1.2);
  sfx.tada();
  heroFace('grin', 0.8);
  yield* rest();
}
function* mvToss(tx, ty) {
  const h = w.hero, u = U();
  const toRight = tx >= h.x;
  tw(h, { flip: toRight ? 1 : -1 }, 0.08);
  heroFace('grin', 0.6);
  tw(h.armF, { x: -26, y: -60 }, 0.08, E.out);
  yield 0.08;
  tw(h.armF, { x: 62, y: -86 }, 0.07, E.out);
  tw(h, { rot: toRight ? 0.1 : -0.1, sx: 0.96, sy: 1.08 }, 0.07);
  const o = heroHand();
  const dist = Math.hypot(tx - o.x, ty - o.y);
  const T = clamp(dist / (720 * u), 0.26, 0.56);
  const p = proj({ x: o.x, y: o.y, r: rand(12, 15) * u, g: 900 * u, power: 0.7, wallAt: T, floor: false, vr: rand(-9, 9) });
  aim(p, tx, ty, T);
  sfx.whoosh(0.13, false);
  yield 0.16;
  yield* rest(0.14);
}
export function* mvWash() {
  const h = w.hero, d = w.doll, u = U();
  say('hero', pick(['洗白白，下一轮！', '洗干净才好糊~', '该搓澡了']), 1.8);
  heroFace('grin');
  d.noHop = false;
  yield () => Math.abs(d.x - w.dollHome) < 10 * u && d.onGround;
  d.noHop = true;
  const Y = Math.max(w.safeT + 74 * u, d.y - 230 * u - Math.max(0, -hatTop(w.hat) - 70) * u);
  const sh = addProp({ type: 'shower', x: d.x, y: -30 * u, front: true });
  tw(sh, { y: Y }, 0.4, E.back);
  sfx.clank();
  yield 0.42;
  sfx.water(2.3);
  dollFace('bliss', 3);
  say('doll', pick(['啊~~舒服~', '终于…', '这才是人过的日子', '再也不出门了']), 2.2);
  let t = 0;
  const D = 2.25;
  const startHat = w.hat;
  while (t < D) {
    t += w.dt;
    for (let i = 0; i < 2; i++) waterDrop(sh.x, sh.y + 14 * u, 40);
    if (Math.random() < 0.3) {
      soap(d.x + rand(-44, 44) * u, d.y - rand(30, 140) * u);
      if (Math.random() < 0.3) sfx.bubble();
    }
    eraseMess(Math.min(0.12, 2 * w.dt) * 0.55);
    const k = t / D;
    w.hat = Math.ceil(startHat * (1 - Math.min(1, k * 1.5)));
    if (w.hat === 0) w.cherry = false;
    d.rot = Math.sin(t * 5) * 0.03;
    d.sq = Math.sin(t * 9) * 0.02;
    yield null;
  }
  clearAllMess();
  d.rot = 0;
  w.stats.washes = (w.stats.washes || 0) + 1;
  w.statsDirty = true;
  tw(sh, { y: -60 * u }, 0.32, E.in);
  sfx.tada();
  stars(d.x, d.y - 120 * u, 5, 200);
  yield 0.34;
  dropProp(sh);
  d.noHop = false;
  dollFace('idle', 0.2);
}

/* ─────────────── 队列 ─────────────── */

export const queue = { list: [], current: null, task: null, t: 0, auto: false, autoT: 0, last: null, onChange: null };
const QMAX = 3;
const notify = () => queue.onChange && queue.onChange();

export function enqueue(kind, payload) {
  if (queue.list.length >= QMAX) return false;
  queue.list.push({ kind, payload });
  notify();
  return true;
}
export function queueCount(kind) { return queue.list.filter((q) => q.kind === kind).length; }

function start(item) {
  const { kind, payload } = item;
  queue.current = kind;
  queue.t = 0;
  let gen;
  if (kind === 'wash') gen = mvWash();
  else if (kind === 'sing') gen = mvSing();
  else if (kind === 'toss') gen = mvToss(payload.x, payload.y);
  else {
    gen = BYID[kind].run();
    w.stats.moves = (w.stats.moves || 0) + 1;
    const use = w.stats.usage || (w.stats.usage = {});
    use[kind] = (use[kind] || 0) + 1;
    let best = kind;
    for (const k in use) if (use[k] > (use[best] || 0)) best = k;
    w.stats.favorite = BYID[best].name;
    w.statsDirty = true;
    w.hb.haptic(6);
    queue.last = kind;
  }
  queue.task = spawn((function* () {
    yield* gen;
    queue.current = null;
    queue.task = null;
    notify();
  })());
  notify();
}
/** 招式卡住了（极少见）就收拾一下继续：不让玩具死掉 */
function abortCurrent() {
  if (queue.task) queue.task.done = true;
  queue.current = null; queue.task = null;
  w.props = []; w.projs = [];
  const d = w.doll, h = w.hero;
  d.umb = null; d.arms = 'down'; d.look = null; d.noHop = false; d.pan = 0;
  h.starsT = 0; h.holdDraw = null; h.capeUp = 0; h.flip = 1; h.rot = 0; h.sx = h.sy = 1;
  h.x = w.heroHome; h.y = w.G;
  h.armF.x = 44; h.armF.y = -26; h.armB.x = -46; h.armB.y = -26; h.legF.x = 20; h.legF.y = 0; h.legB.x = -20; h.legB.y = 0;
  heroFace('ok');
  notify();
}
export function stepQueue(dt) {
  if (queue.current) {
    queue.t += dt;
    if (queue.t > 16) abortCurrent();
    return;
  }
  if (queue.list.length) { start(queue.list.shift()); return; }
  if (queue.auto) {
    queue.autoT -= dt;
    if (queue.autoT <= 0) {
      const opts = MOVES.filter((m) => m.id !== queue.last);
      start({ kind: pick(opts).id });
      queue.autoT = 0.25;
    }
  }
}
