// 火柴人本人：骨架、动作、反应、伤情。
import * as art from './art.js';
import { INK, PAPER, gray } from './art.js';
import { sfx } from './sfx.js';

const DT = 1 / 120;
const hyp = Math.hypot;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (l) => l[(Math.random() * l.length) | 0];
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => t * t * (3 - 2 * t);

const NAMES = ['head', 'neck', 'chest', 'hip', 'lEl', 'lHa', 'rEl', 'rHa', 'lKn', 'lFo', 'rKn', 'rFo'];
export const LIMBS = {
  lArm: { root: 'neck', a: 'lEl', b: 'lHa', arm: true },
  rArm: { root: 'neck', a: 'rEl', b: 'rHa', arm: true },
  lLeg: { root: 'hip', a: 'lKn', b: 'lFo', arm: false },
  rLeg: { root: 'hip', a: 'rKn', b: 'rFo', arm: false },
};
const LEN = { neck: 12, t: 15, up: 15, lo: 15, th: 21, sh: 21 };
const STAND = 39; // 站着时胯离地多高

const LINES = {
  idle: ['今天天气不错', '这是哪儿', '我是谁', '有人吗', '……', '你在看我吗', '好无聊', '这屏幕真白', '你手机该充电了', '地板有点硬', '想吃火锅'],
  hello: ['我回来了', '又来？', '这次轻点', '我记得你', '放过我吧', '又是你', '刚才那个不是我', '新的一天'],
  hurt: ['啊！', '嗷！', '疼疼疼', '哎哟', '你有病吧', '打人不打脸', '我的腰', '救命', '住手！', '嘶——'],
  big: ['啊啊啊！', '我的天！', '要命了', '妈呀', '你是魔鬼吧', '这谁顶得住'],
  low: ['别打了……', '我错了', '我还有房贷', '告诉我妈……', '我看到光了', '求你了'],
  arm: ['我胳膊呢？', '还挺凉快', '这还能接吗', '我投诉你', '手！我的手！'],
  leg: ['我的腿！', '站不住了', '这下省裤子了', '这还能接吗', '我腿呢？'],
  bomb: ['炸弹！！', '不不不不', '快跑', '谁放的！'],
  bombOn: ['拿开！拿开！', '它粘我身上了！', '救命救命救命', '这怎么弄下来！'],
  saw: ['别过来！', '那是电锯！！', '有话好好说'],
  roller: ['刹车！', '看路啊！', '有人！有人！'],
  hole: ['这也太黑了', '好吸啊', '抓不住了'],
  rocket: ['它在追我！', '什么东西！'],
  strap: ['啊啊啊啊啊', '放我下来', '我恐高'],
  spring: ['哇——', '我会飞了', '天花板好近'],
  slip: ['哎哟我的屁股', '谁扔的', '这皮不讲武德'],
  thaw: ['阿嚏！', '好冷', '腿麻了'],
  flat: ['好……扁……', '我……变……薄……了'],
  poke: ['别戳我', '干嘛', '手拿开', '痒', '再戳试试'],
  grab: ['放我下来！', '我恐高', '轻点轻点'],
  limbAdd: ['这是什么', '多了点什么', '谁给我画的', '还挺好用'],
  stab: ['扎到了！', '钉住了', '拔不出来'],
  anvil: ['拿开……', '好重', '喘不上气'],
  gape: ['？', '那是什么', '咦'],
  angry: ['你等着', '有本事单挑', '我记住你了', '我要报警'],
};

function ik(ax, ay, bx, by, l1, l2, bend) {
  let dx = bx - ax, dy = by - ay, d = hyp(dx, dy) || 0.01;
  const m = l1 + l2 - 0.05;
  if (d > m) { bx = ax + dx / d * m; by = ay + dy / d * m; dx = bx - ax; dy = by - ay; d = m; }
  const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  const mx = ax + dx / d * a, my = ay + dy / d * a;
  return { mid: [mx - dy / d * h * bend, my + dx / d * h * bend], end: [bx, by] };
}

export class Body {
  constructor(W) {
    this.W = W;
    this.j = {};
    this.all = [];
    this.T = {};
    this.gone = true;
    this.dead = true;
    this.state = 'none';
    this.ctrl = 0;
    this.hp = 100; this.pain = 0; this.fear = 0;
    this.broken = {};
    this.limbOK = {};
    this.tough = 1;
    this.num = 0;
    this.t = 0;
    this.spurts = [];
    this.ice = [];
    this.dir = 1; this.x = 0; this.gy = 0;
  }

  get alive() { return !this.dead && !this.gone && !!this.j.hip && !!this.j.head; }

  /* ─────────────── 出生 ─────────────── */

  /** 把上一个留在原地当残骸，用铅笔画一个新的 */
  spawn(x, animate = true) {
    const W = this.W;
    this.release();
    W.trimDebris();
    const gy = W.ground;
    this.gy = gy;
    this.x = x;
    this.dir = x > W.w / 2 ? -1 : 1;
    const hipY = gy - STAND, d = this.dir;
    const P = (n, px, py, o = {}) => (this.j[n] = W.addPt(px, py, { part: n, body: true, ...o }));
    P('hip', x, hipY, { im: 0.55 });
    P('chest', x, hipY - LEN.t, { im: 0.6 });
    P('neck', x, hipY - LEN.t * 2, { im: 0.8 });
    P('head', x, hipY - LEN.t * 2 - LEN.neck, { r: 9, im: 0.7 });
    const leg = (side, sx) => {
      const n = ik(x, hipY, x + sx * 9, gy - 2, LEN.th, LEN.sh, -d);
      P(side + 'Kn', n.mid[0], n.mid[1]); P(side + 'Fo', n.end[0], n.end[1]);
    };
    const arm = (side, sx) => {
      const nx = x, ny = hipY - LEN.t * 2;
      const n = ik(nx, ny, nx + sx * 7, ny + 28, LEN.up, LEN.lo, d);
      P(side + 'El', n.mid[0], n.mid[1]); P(side + 'Ha', n.end[0], n.end[1]);
    };
    leg('l', -1); leg('r', 1); arm('l', -1); arm('r', 1);
    const S = (a, b, kind, len) => W.addStick(this.j[a], this.j[b], kind, len);
    S('head', 'neck', 'neck', LEN.neck);
    S('neck', 'chest', 'torso', LEN.t); S('chest', 'hip', 'torso', LEN.t);
    for (const l of Object.values(LIMBS)) {
      S(l.root, l.a, 'limb', l.arm ? LEN.up : LEN.th);
      S(l.a, l.b, 'limb', l.arm ? LEN.lo : LEN.sh);
    }
    this.hp = 100; this.pain = 0; this.fear = 0;
    this.broken = {}; this.spurts = []; this.ice = [];
    this.dead = false; this.gone = false; this.deathSent = false;
    this.hair = false; this.lump = 0; this.dizzy = 0; this.soot = 0; this.xray = 0; this.squash = 0;
    this.cause = 'fall'; this.causeT = 0;
    this.hitCount = 0; this.hitCd = 0; this.age = 0; this.lost = 0;
    this.moodT = 0; this.mood = 'norm';
    this.sayCd = 1.5; this.idleCd = 4;
    this.act = 'idle'; this.actT = 1.5; this.phase = 0; this.tx = x; this.gapeO = null;
    this.num++;
    this.recalc(true);
    if (animate) {
      this.state = 'draw';
      this.drawT = 0;
      for (const p of this.all) p.pin = { x: p.x, y: p.y };
      this.strokes = this.buildStrokes();
    } else {
      this.state = 'ctrl';
      this.ctrl = 1;
    }
  }

  /** 把现在这一个变成残骸 */
  release() {
    for (const s of this.ice) this.W.removeStick(s);
    this.ice = [];
    for (const p of this.all) { p.body = false; p.flat = false; p.pin = null; }
    this.all = [];
    this.j = {};
    this.state = 'none';
    this.ctrl = 0;
  }

  buildStrokes() {
    const j = this.j;
    const poly = (...names) => names.map((n) => j[n]);
    return [poly('neck', 'chest', 'hip'), poly('neck', 'lEl', 'lHa'), poly('neck', 'rEl', 'rHa'), poly('hip', 'lKn', 'lFo'), poly('hip', 'rKn', 'rFo')];
  }

  /* ─────────────── 图结构：哪些点还连在他身上 ─────────────── */

  recalc(first = false) {
    const W = this.W, core = this.j.chest;
    if (!core) { this.all = []; return; }
    const seen = new Set([core]), stack = [core];
    const adj = new Map();
    for (const s of W.sticks) {
      if (s.kind === 'ice') continue;
      if (!adj.has(s.a)) adj.set(s.a, []);
      if (!adj.has(s.b)) adj.set(s.b, []);
      adj.get(s.a).push(s.b); adj.get(s.b).push(s.a);
    }
    while (stack.length) {
      for (const q of adj.get(stack.pop()) || []) if (!seen.has(q)) { seen.add(q); stack.push(q); }
    }
    for (const n of NAMES) {
      const p = this.j[n];
      if (p && !seen.has(p)) this.j[n] = null;
    }
    for (const p of this.all) if (!seen.has(p)) { p.body = false; p.flat = false; }
    for (const p of W.pts) if (p.body && !seen.has(p)) p.body = false;
    this.all = W.pts.filter((p) => seen.has(p));
    for (const p of this.all) p.body = true;

    for (const [k, l] of Object.entries(LIMBS)) {
      const ok = !!(this.j[l.a] && this.j[l.b]);
      if (!first && this.limbOK[k] && !ok && !this.dead) this.onLimbLost(k);
      this.limbOK[k] = ok;
    }
    if (!first && !this.dead) {
      if (!this.j.head) this.die(this.causeFor('head'));
      else if (!this.j.hip) this.die(this.causeFor('torso'));
    }
  }

  causeFor(part) { return `${this.cause}:${part}`; }

  onLimbLost(k) {
    const l = LIMBS[k];
    this.lost = (this.lost || 0) + 1;
    delete this.broken[k];
    const root = this.j[l.root];
    if (root) this.spurts.push({ p: root, t: 1.1, e: 0 });
    this.W.cb.limb && this.W.cb.limb();
    this.hurt(16, this.cause, { quiet: true });
    if (!this.dead) this.say(pick(l.arm ? LINES.arm : LINES.leg), 1.7, true);
    if (!l.arm) this.knock(0.9);
  }

  /** 切断某条胳膊或腿跟身体的连接 */
  detachLimb(k) {
    const l = LIMBS[k], a = this.j[l.a], r = this.j[l.root];
    if (!a || !r) return;
    const s = this.W.sticks.find((q) => (q.a === r && q.b === a) || (q.a === a && q.b === r));
    if (s) this.W.cutStick(s, 0);
  }
  decapitate() {
    const h = this.j.head, n = this.j.neck;
    if (!h || !n) return;
    const s = this.W.sticks.find((q) => (q.a === h && q.b === n) || (q.a === n && q.b === h));
    if (s) { h.py = h.y + rnd(240, 420) * DT; h.px = h.x + rnd(-200, 200) * DT; this.W.cutStick(s, 0); }
  }
  limbOf(p) {
    for (const [k, l] of Object.entries(LIMBS)) if (this.j[l.a] === p || this.j[l.b] === p) return k;
    return null;
  }

  /* ─────────────── 受伤 ─────────────── */

  say(text, dur = 1.5, force = false) {
    if (this.dead || this.gone) return;
    if (!force && this.sayCd > 0) return;
    this.sayCd = dur + 0.5;
    this.W.say(text, dur);
    sfx.gibber();
  }
  setMood(m, t = 0.6) { this.mood = m; this.moodT = t; }

  hurt(d, cause, o = {}) {
    if (this.gone || this.state === 'draw') return;
    if (cause && !this.dead) { this.cause = cause; this.causeT = 2; }
    this.W.cb.hit && this.W.cb.hit(d, cause);
    if (this.hitCd <= 0) { this.hitCount++; this.hitCd = 0.25; }
    if (this.dead) return;
    const dmg = d * this.tough;
    this.hp -= dmg;
    this.pain = Math.min(100, this.pain + dmg * 1.5);
    this.setMood('ouch', 0.55);
    if (!o.quiet) {
      sfx.ouch(dmg / 12);
      if (this.hp < 25) this.say(pick(LINES.low), 1.6);
      else this.say(pick(dmg > 26 ? LINES.big : LINES.hurt), 1.1);
    }
    if (this.hp <= 0) this.die(cause || this.cause);
  }

  die(cause) {
    if (this.dead) return;
    this.dead = true;
    this.hp = 0;
    this.cause = cause || this.cause;
    this.ctrl = 0;
    this.removeIce();
    this.state = 'dead';
    this.deathT = 0.85;
    this.W.say('', 0);
  }
  removeIce() {
    for (const s of this.ice) this.W.removeStick(s);
    this.ice = [];
    for (const p of this.all) if (p.pin && p.pin.by === 'ice') p.pin = null;
  }

  knock(dur = 0.8) {
    if (this.dead || this.gone) return;
    if (this.state === 'frozen' || this.state === 'draw' || this.state === 'flat') return;
    this.ragT = Math.max(this.state === 'rag' ? this.ragT : 0, dur);
    this.state = 'rag';
    this.ctrl = 0;
  }

  impact(p, v, o) {
    const W = this.W;
    if (v > 300) {
      W.dust(p.x, p.y + p.r, v > 620 ? 4 : 2);
      sfx.thud((v - 200) / 520);
    }
    if (!p.body || this.gone || this.state === 'draw') return;
    if (this.state === 'frozen') { if (v > 170) this.shatter(o ? `${o.t}` : 'fall'); return; }
    // 自己走路跑步时脚踩地不算受伤；只有真被东西撞上才算
    if ((this.state === 'ctrl' || this.state === 'getup') && !o && v < 720) return;
    if (v < 300) return;
    const head = p === this.j.head;
    const dragged = this.cause === 'hole' && this.causeT > 0;
    const d = (v - 300) * 0.036 * (head ? 1.5 : 1) * (dragged ? 0.25 : 1);
    this.frameMax = Math.max(this.frameMax || 0, d);
    this.frameSum = (this.frameSum || 0) + d;
    if (this.dead || dragged) return;
    const limb = this.limbOf(p);
    if (limb && v > 760 && !this.broken[limb] && Math.random() < 0.3) this.breakLimb(limb);
    if (limb && v > 1300 && this.tearCd <= 0 && Math.random() < 0.28) { this.tearCd = 0.8; this.detachLimb(limb); }
    if (head && v > 400) { this.lump = Math.min(6, this.lump + 1.2); this.dizzy = Math.max(this.dizzy, 1.8); }
    if (v > 330 && (this.state === 'ctrl' || this.state === 'getup')) this.knock(0.9);
  }

  breakLimb(k) {
    if (this.broken[k] || !this.limbOK[k]) return;
    this.broken[k] = true;
    const a = this.j[LIMBS[k].a];
    sfx.stab();
    if (a) this.W.word(a.x, a.y - 8, '咔嚓', 13);
    this.W.cb.broke && this.W.cb.broke();
    if (!this.dead) this.say(LIMBS[k].arm ? '胳膊折了！' : '腿折了！', 1.4, true);
  }

  crushed(p, o, v) {
    if (!p.body || this.state === 'draw') return;
    if (this.state === 'frozen') { this.shatter('anvil'); return; }
    if (o.hitB) return;
    o.hitB = true;
    const core = p === this.j.head || p === this.j.neck || p === this.j.chest || p === this.j.hip;
    this.W.spurt(p.x, p.y, 8);
    const d = (core ? 50 : 22) * o.s * (0.55 + v / 900);
    this.hurt(d, 'anvil');
    if (!this.dead) this.knock(1.4);
    if (!core) { const k = this.limbOf(p); if (k) this.breakLimb(k); }
    this.lump = Math.min(6, this.lump + 2);
    this.dizzy = Math.max(this.dizzy, 2.4);
  }

  flatten(cause, dmg) {
    if (this.gone || this.state === 'draw') return;
    if (this.state === 'frozen') { this.shatter(cause); return; }
    if (this.state === 'flat') return;
    const W = this.W;
    const hip = this.j.hip;
    for (const p of this.all) {
      if (hip) { p.x += (p.x - hip.x) * 0.15; }
      p.flat = true; p.y = W.ground - 1; p.py = p.y; p.px = p.x; p.trap = null;
      if (p.pin) p.pin = null;
    }
    sfx.thud(1.4);
    W.bang(0.8);
    W.spurt(hip ? hip.x : this.x, W.ground - 2, 10);
    W.word(hip ? hip.x : this.x, W.ground - 36, '嘎吱', 18);
    this.hurt(dmg, cause);
    if (!this.dead) {
      this.state = 'flat';
      this.flatT = 2.3;
      this.ctrl = 0;
      this.say(pick(LINES.flat), 1.6, true);
    }
    this.squash = 1;
  }

  shocked(s) {
    if (this.gone || this.state === 'draw') return;
    if (this.state === 'frozen') { this.shatter('bolt'); return; }
    this.xray = 0.6;
    this.hair = true;
    this.soot = 6;
    const W = this.W;
    for (const p of this.all) { p.pin = null; p.px += rnd(-260, 260) * DT; p.py += rnd(0, 240) * DT; }
    this.hurt(32 * s, 'bolt', { quiet: true });
    sfx.ouch(2);
    if (!this.dead) this.knock(1.5);
    this.dizzy = Math.max(this.dizzy, 2.2);
    W.dust(this.j.hip ? this.j.hip.x : this.x, W.ground, 4);
  }

  blast(x, y, R, pow, cause) {
    if (this.gone || !this.j.chest || this.state === 'draw') return;
    const c = this.j.chest, d = hyp(c.x - x, c.y - y);
    const f = clamp(1 - d / R, 0, 1);
    if (this.state === 'flat' && f > 0) { this.popUp(); }
    if (this.state === 'frozen' && f > 0.05) { this.shatter(cause); return; }
    if (f <= 0) return;
    this.hurt((16 + 84 * f) * pow, cause);
    this.knock(1.1 + f);
    this.hair = true;
    this.soot = Math.max(this.soot, 4);
    this.dizzy = Math.max(this.dizzy, 1.6);
    for (const p of this.all) if (p.pin && Math.random() < f + 0.2) p.pin = null;
    for (const k of Object.keys(LIMBS)) {
      const a = this.j[LIMBS[k].a];
      if (!a) continue;
      const df = 1 - hyp(a.x - x, a.y - y) / R;
      if (df > 0.42 && Math.random() < df * 1.15 * pow) this.detachLimb(k);
      else if (df > 0.2 && Math.random() < df) this.breakLimb(k);
    }
    if (f > 0.74 && Math.random() < 0.55 * pow) { this.cause = cause; this.decapitate(); }
  }

  sawn(s, t) {
    this.cause = 'saw'; this.causeT = 2;
    if (this.state === 'frozen') { this.shatter('saw'); return; }
    const flat = this.state === 'flat';
    if (flat) this.popUp();
    const hip = this.j.hip;
    if (hip) { hip.px += rnd(-120, 120) * DT; }
    this.W.cutStick(s, t);
    this.hurt(12, 'saw');
    if (!this.dead) this.knock(1);
  }
  sawHead(p) {
    this.cause = 'saw'; this.causeT = 2;
    if (this.state === 'frozen') { this.shatter('saw'); return; }
    if (p === this.j.head) this.decapitate();
  }
  erased(s) {
    this.cause = 'eraser'; this.causeT = 2;
    if (this.state === 'frozen') { this.removeIce(); this.state = 'rag'; this.ragT = 0.6; }
    sfx.erase();
    this.W.eraseStick(s);
    this.hurt(5, 'eraser', { quiet: true });
    if (!this.dead) this.setMood('scared', 0.8);
  }
  eraseHead(p) {
    this.cause = 'eraser'; this.causeT = 2;
    this.W.removeHead(p);
    this.j.head = null;
    this.recalc();
  }

  stabbed(p, o) {
    if (!p.body || this.state === 'draw') return;
    this.hurt(13 * o.s, 'spikes');
    this.knock(1.5);
    if (!this.dead) this.say(pick(LINES.stab), 1.3, true);
  }
  sucked(p, o) {
    if (this.state === 'draw') return;
    if (this.cause !== 'hole') this.say(pick(LINES.hole), 1.2, true);
    this.cause = 'hole'; this.causeT = 3;
    if (this.state === 'flat') this.popUp();
    this.knock(0.6);
  }
  spatOut(list, o) {
    const mine = list.filter((p) => p.body);
    if (!mine.length) return;
    this.hurt(58 * o.s, 'hole');
    if (this.dead) return;
    this.knock(1.4);
    const keys = Object.keys(LIMBS).sort(() => Math.random() - 0.5);
    const n = Math.min(keys.length, Math.round(mine.length / 3));
    for (let i = 0; i < n; i++) this.detachLimb(keys[i]);
    this.dizzy = 3;
  }
  strapped(o) {
    if (this.state === 'flat') this.popUp();
    this.cause = 'rocket'; this.causeT = 4;
    this.knock(2.4);
    this.say(pick(LINES.strap), 1.6, true);
    sfx.scream();
  }
  launched() {
    this.cause = 'spring'; this.causeT = 2.4;
    if (this.state === 'flat') this.popUp();
    this.knock(1.5);
    this.say(pick(LINES.spring), 1.3, true);
  }
  canSlip() { return this.alive && this.state === 'ctrl' && this.mob === 'walk' && (this.act === 'walk' || this.act === 'run'); }
  slip() {
    const d = this.dir, j = this.j;
    sfx.whistle();
    for (const n of ['lFo', 'rFo', 'lKn', 'rKn']) {
      const p = j[n];
      if (p) { p.px -= d * rnd(420, 560) * DT; p.py += rnd(240, 400) * DT; }
    }
    for (const n of ['head', 'neck', 'chest']) {
      const p = j[n];
      if (p) { p.px += d * 160 * DT; }
    }
    this.cause = 'peel'; this.causeT = 2;
    this.knock(1.2);
    this.hurt(6, 'peel', { quiet: true });
    this.say(pick(LINES.slip), 1.4, true);
    this.W.word(this.j.hip.x, this.j.hip.y - 50, '呲溜', 16);
  }

  /** 慌不择路，脸朝下摔一跤 */
  stumble() {
    const d = this.dir, j = this.j;
    for (const n of ['lFo', 'rFo', 'lKn', 'rKn']) { const p = j[n]; if (p) p.px += d * rnd(180, 300) * DT; }
    for (const n of ['head', 'neck', 'chest']) { const p = j[n]; if (p) { p.px -= d * rnd(200, 280) * DT; p.py += 40 * DT; } }
    this.knock(1.1);
    this.say('摔了！！', 1, true);
  }
  /** 走到某个地方去（他不知道那儿有什么） */
  walkTo(x) {
    if (this.state !== 'ctrl' || this.mob === 'crawl' || this.mob === 'worm') return;
    this.tx = clamp(x, 26, this.W.w - 26);
    this.dir = this.tx > this.x ? 1 : -1;
    this.act = 'walk';
    this.actT = 8;
  }
  /** 把他整个人往上一颠 */
  hop(vy = 220) {
    if (!this.alive || this.state === 'draw' || this.state === 'frozen') return;
    if (this.state === 'flat') this.popUp();
    this.knock(1);
    for (const p of this.all) { if (!p.pin && p.im !== 0 && !p.hole && !p.trap) p.py = p.y + vy * DT; }
  }

  /* 冰冻 */
  freeze() {
    if (this.dead || this.gone || this.state === 'frozen' || this.state === 'draw') return;
    if (this.state === 'flat') this.popUp();
    const a = this.all.filter((p) => p.part && NAMES.includes(p.part));
    this.ice = [];
    for (let i = 0; i < a.length; i++) for (let k = i + 1; k < a.length; k++) this.ice.push(this.W.addStick(a[i], a[k], 'ice'));
    this.state = 'frozen';
    this.ctrl = 0;
    for (const n of ['lFo', 'rFo']) {
      const p = this.j[n];
      if (p && !p.pin && p.y > this.W.supportY(p.x, p.y - 12) - 20) p.pin = { x: p.x, y: p.y, by: 'ice' }; // 走路抬着的脚也算，免得自己倒了摔碎
    }
    this.iceT = 8;
    this.mood = 'scared'; this.moodT = 99;
    this.W.say('', 0);
  }
  thaw() {
    this.removeIce();
    this.state = 'rag';
    this.ragT = 0.5;
    this.moodT = 0;
    this.shiver = 1.4;
    this.say(pick(LINES.thaw), 1.2, true);
  }
  shatter(cause) {
    const W = this.W;
    this.hitCount++;
    this.removeIce();
    sfx.shatter();
    W.bang(1);
    W.hitstop = Math.max(W.hitstop, 0.05);
    W.word(this.j.chest ? this.j.chest.x : this.x, (this.j.chest ? this.j.chest.y : this.gy) - 30, '哗啦', 22);
    const sticks = W.sticks.filter((s) => this.all.includes(s.a) && this.all.includes(s.b));
    const pts = this.all.slice();
    for (const s of sticks) W.removeStick(s);
    W.cb.limb && W.cb.limb();
    for (const s of sticks) {
      if (s.kind === 'extra') continue;
      const n = 2;
      for (let i = 0; i < n; i++) {
        const u0 = i / n, u1 = (i + 1) / n;
        const a = W.addPt(lerp(s.a.x, s.b.x, u0), lerp(s.a.y, s.b.y, u0));
        const b = W.addPt(lerp(s.a.x, s.b.x, u1), lerp(s.a.y, s.b.y, u1));
        const vx = rnd(-300, 300), vy = rnd(-420, -40);
        a.px = a.x - vx * DT; a.py = a.y - vy * DT;
        b.px = b.x - (vx + rnd(-90, 90)) * DT; b.py = b.y - (vy + rnd(-90, 90)) * DT;
        W.addStick(a, b, 'limb');
      }
    }
    for (const p of pts) {
      p.body = false;
      if (p.part === 'head') { p.px = p.x - rnd(-240, 240) * DT; p.py = p.y + rnd(160, 380) * DT; }
    }
    const c = this.j.chest || { x: this.x, y: this.gy - 50 };
    for (let i = 0; i < 16 * W.opts.particles; i++) W.shard(c.x + rnd(-22, 22), c.y + rnd(-44, 44), rnd(-320, 320), rnd(-420, 40), rnd(2, 6));
    W.prune();
    this.all = [];
    this.j = {};
    this.die(`${cause || 'fall'}:shatter`);
  }

  deleted() {
    const W = this.W, mine = new Set(this.all);
    this.removeIce();
    W.sticks = W.sticks.filter((s) => !mine.has(s.a) && !mine.has(s.b));
    W.pts = W.pts.filter((p) => !mine.has(p));
    W.prune();
    this.all = []; this.j = {};
    this.dead = true; this.gone = true; this.state = 'gone'; this.hp = 0;
    this.cause = 'bin';
    W.cb.deleted && W.cb.deleted();
  }

  popUp() {
    for (const p of this.all) {
      p.flat = false;
      p.y -= rnd(1, 6);
      p.py = p.y + rnd(160, 360) * DT;
      p.px = p.x - rnd(-80, 80) * DT;
    }
    if (this.j.hip) { this.W.puff(this.j.hip.x, this.W.ground, 10, { g: 215, life: 0.28, grow: 44 }); }
    sfx.pop();
    this.state = 'rag';
    this.ragT = 0.5;
  }

  poke(x, y) {
    if (this.state === 'frozen') { this.shatter('poke'); return; }
    if (!this.alive) { for (const p of this.all) { p.px += rnd(-40, 40) * DT; p.py += rnd(20, 120) * DT; } sfx.thud(0.2); return; }
    let best = null, bd = 1e9;
    for (const p of this.all) { const d = hyp(p.x - x, p.y - y); if (d < bd) { bd = d; best = p; } }
    if (best) { const dx = best.x - x; best.px -= (dx >= 0 ? 1 : -1) * 200 * DT; best.py += 110 * DT; }
    this.hurt(1.2, 'poke', { quiet: true });
    this.setMood('angry', 0.8);
    this.say(pick(LINES.poke), 1);
    sfx.ouch(0.3);
    if (this.state === 'ctrl' && this.pain > 25) this.act = 'fist';
  }

  /** 铅笔：从他身上画出去，就多长一条软趴趴的东西 */
  addLimb(pts) {
    const W = this.W;
    if (!this.all.length) return false;
    const start = pts[0];
    let root = null, bd = 16;
    for (const p of this.all) { const d = hyp(p.x - start.x, p.y - start.y) - p.r; if (d < bd) { bd = d; root = p; } }
    if (!root) return false;
    let prev = root;
    const step = Math.max(1, Math.round(pts.length / 12));
    for (let i = step; i < pts.length; i += step) {
      const q = pts[i];
      const p = W.addPt(q.x, q.y, { body: true, im: 1.3 });
      W.addStick(prev, p, 'extra');
      prev = p;
    }
    this.recalc();
    this.say(pick(LINES.limbAdd), 1.4, true);
    return true;
  }

  grabbed() {
    if (this.state === 'flat') this.popUp();
    for (const p of this.all) { p.flat = false; if (p.pin && p.pin.by === 'ice') p.pin = null; }
    if (this.dead) return;
    this.held = true;
    if (this.state !== 'frozen') this.knock(0.5);
    this.say(pick(LINES.grab), 1.3);
    sfx.gibber();
  }
  released() { this.held = false; if (this.state === 'rag') this.ragT = Math.max(this.ragT, 0.7); }

  /* ─────────────── 每帧 ─────────────── */

  mobility() {
    const j = this.j, b = this.broken;
    const leg = (k, l) => (j[l.a] && j[l.b] && !b[k] ? 1 : 0);
    const legs = leg('lLeg', LIMBS.lLeg) + leg('rLeg', LIMBS.rLeg);
    const arms = leg('lArm', LIMBS.lArm) + leg('rArm', LIMBS.rArm);
    if (legs === 2) return 'walk';
    if (legs === 1) return 'hop';
    return arms ? 'crawl' : 'worm';
  }

  stuck() {
    const W = this.W;
    if (this.held) return true;
    for (const p of this.all) if (p.pin || p.trap || p.hole) return true;
    for (const o of W.props) if (o.t === 'rocket' && o.st === 'strap' && o.p && o.p.body) return true;
    return false;
  }

  update(dt) {
    if (this.gone || this.state === 'none') return;
    this.t += dt;
    this.age += dt;
    this.hitCd -= dt; this.sayCd -= dt; this.moodT -= dt;
    this.causeT -= dt;
    if (this.causeT <= 0 && !this.dead) this.cause = 'fall';
    this.pain = Math.max(0, this.pain - dt * 7);
    this.fear = Math.max(0, this.fear - dt * 12);
    this.dizzy = Math.max(0, (this.dizzy || 0) - dt);
    this.xray = Math.max(0, (this.xray || 0) - dt);
    this.shiver = Math.max(0, (this.shiver || 0) - dt);
    this.lump = Math.max(0, this.lump - dt * 0.05);

    this.winT = (this.winT || 0) - dt;
    this.tearCd = (this.tearCd || 0) - dt;
    if (this.frameMax) {
      // 一个身子撞上去，头、胸、胯、四肢是前后几帧陆续碰到的：0.25 秒内只算最重的那一下
      if (this.winT <= 0) { this.winT = 0.25; this.winD = 0; }
      const extra = this.frameMax - this.winD;
      this.frameMax = 0; this.frameSum = 0;
      if (extra > 1) {
        this.winD += extra;
        this.hurt(extra, this.causeT > 0 ? this.cause : 'fall', { quiet: extra < 5 });
      }
    }

    // 断口喷墨
    const W = this.W;
    for (const s of this.spurts) {
      s.t -= dt; s.e -= dt;
      if (s.t > 0 && s.e <= 0) { s.e = 0.05; W.spurt(s.p.x, s.p.y, 2, rnd(-0.5, 0.5), -0.7); }
    }
    this.spurts = this.spurts.filter((s) => s.t > 0);

    // 烧焦冒烟
    if (this.soot > 0 && this.j.head) {
      this.soot -= dt;
      this.smk = (this.smk || 0) - dt;
      if (this.smk <= 0) { this.smk = 0.2; W.puff(this.j.head.x + rnd(-5, 5), this.j.head.y - 9, rnd(2, 3.5), { g: rnd(120, 200), life: 0.8, grow: 7, vy: -34, vx: rnd(-6, 6) }); }
    }

    // 被电的时候抖
    if (this.xray > 0) for (const p of this.all) { p.x += rnd(-1.8, 1.8); p.y += rnd(-1.8, 1.8); }
    // 脑袋压扁的程度
    const hd = this.j.head;
    const sq = (hd && hd.trap) || this.state === 'flat' || (hd && hd.flat) ? 1 : 0;
    this.squash = lerp(this.squash, sq, Math.min(1, dt * (sq ? 22 : 7)));

    switch (this.state) {
      case 'draw': this.updDraw(dt); break;
      case 'ctrl': this.think(dt); if (this.state === 'ctrl') this.pose(dt); break;
      case 'getup': this.updGetup(dt); break;
      case 'rag': this.updRag(dt); break;
      case 'frozen':
        this.iceT -= dt;
        if (this.iceT <= 0) this.thaw();
        break;
      case 'flat':
        this.flatT -= dt;
        if (this.flatT <= 0) { this.popUp(); this.say('噗', 0.8, true); this.hair = this.hair; }
        break;
      case 'dead':
        if (!this.deathSent) {
          this.deathT -= dt;
          if (this.deathT <= 0) { this.deathSent = true; W.cb.death && W.cb.death(this.cause, this); }
        }
        break;
      default: break;
    }
  }

  updDraw(dt) {
    const prev = this.drawT;
    this.drawT += dt / 1.15;
    if (Math.floor(prev * 26) !== Math.floor(this.drawT * 26)) sfx.scratch();
    if (this.drawT >= 1) {
      for (const p of this.all) p.pin = null;
      this.state = 'ctrl';
      this.ctrl = 1;
      this.mob = this.mobility();
      this.setPoseIdle();
      this.say(this.num > 1 ? (Math.random() < 0.2 ? `我是第 ${this.num} 个我` : pick(LINES.hello)) : '你好', 1.6, true);
      this.setMood('happy', 1.2);
      this.W.cb.born && this.W.cb.born();
    }
  }
  setPoseIdle() { this.act = 'idle'; this.actT = rnd(0.8, 1.8); }

  updRag(dt) {
    this.ragT -= dt;
    const st = this.stuck();
    if (this.all.length === 0) return;
    let sp = 0;
    for (const p of this.all) sp += hyp(p.x - p.px, p.y - p.py) / DT;
    sp /= this.all.length;
    if (st) {
      // 动弹不得：挣扎
      this.strug = (this.strug || 0) - dt;
      if (this.strug <= 0) {
        this.strug = rnd(0.25, 0.6);
        for (const n of ['lHa', 'rHa', 'lFo', 'rFo']) {
          const p = this.j[n];
          if (p && !p.pin && !p.trap && p.im !== 0 && !p.hole) { p.px += rnd(-170, 170) * DT; p.py += rnd(0, 260) * DT; }
        }
        if (this.j.head && this.j.head.trap) this.say(pick(LINES.anvil), 1.2);
      }
      this.pinT = (this.pinT || 0) + dt;
      // 钉太久自己会挣脱（不算回收站和手）
      if (this.pinT > 4 && !this.held) { for (const p of this.all) if (p.pin) p.pin = null; this.pinT = 0; }
      return;
    }
    this.pinT = 0;
    if ((this.ragT <= 0 && sp < 46) || this.ragT < -2.4) this.startGetup();
  }

  startGetup() {
    const hip = this.j.hip, ch = this.j.chest, W = this.W;
    if (!hip) return;
    this.mob = this.mobility();
    this.state = 'getup';
    this.gT = 0;
    this.gDur = 0.55 + this.pain * 0.007 + (this.dizzy > 0 ? 0.35 : 0);
    this.x = clamp(hip.x, 22, W.w - 22);
    this.gy = W.supportY(this.x, hip.y - 10);
    this.g0y = hip.y;
    this.g0l = ch ? Math.atan2(ch.x - hip.x, hip.y - ch.y) : 0;
    this.g0l = clamp(this.g0l, -1.3, 1.3);
    if (this.j.head && this.j.neck && this.g0l !== 0) this.dir = this.g0l > 0 ? 1 : -1;
    this.T = {};
    this.act = 'idle';
  }

  updGetup(dt) {
    this.gT += dt;
    const t = Math.min(1, this.gT / this.gDur);
    this.ctrl = 0.05 + smooth(t) * 0.95;
    this.T = {};
    if (this.mob === 'walk' || this.mob === 'hop') {
      const st = this.gy - STAND;
      const u = t < 0.5 ? smooth(t / 0.5) * 0.55 : 0.55 + smooth((t - 0.5) / 0.5) * 0.45;
      const hy = lerp(this.g0y, st, u);
      this.torso(this.x, hy, lerp(this.g0l, 0, smooth(t)));
      const footY = this.gy - 2;
      if (this.mob === 'walk') { this.leg('l', this.x - 9, footY); this.leg('r', this.x + 9, footY); }
      else this.hopLeg(this.x, footY);
      const n = this.T.neck;
      this.arm('l', n[0] - 11, n[1] + 24);
      this.arm('r', n[0] + 11, n[1] + 24);
    } else {
      this.poseLow(0, false);
    }
    if (t >= 1) {
      this.state = 'ctrl';
      this.ctrl = 1;
      this.act = 'idle';
      this.actT = this.pain > 30 ? 0.4 : rnd(0.4, 1);
    }
  }

  think(dt) {
    const W = this.W, hip = this.j.hip;
    if (!hip) return;
    this.mob = this.mobility();
    this.actT -= dt;
    // 脑袋上有东西掉下来：愣住
    this.gapeO = null;
    for (const o of W.props) {
      if ((o.t === 'anvil' || o.t === 'bin') && !o.rest && !o.held && (o.vy || 0) > 0 && Math.abs(o.x - hip.x) < 70 * o.s && o.y < hip.y - 40) {
        this.gapeO = o;
        if (!o.seen) { o.seen = true; this.say(pick(LINES.gape), 0.9, true); }
      }
    }
    if (this.gapeO) { this.act = 'gape'; this.fear = Math.min(100, this.fear + dt * 60); return; }

    // 炸弹粘在自己身上：怎么跑都甩不掉
    if (W.props.some((o) => o.t === 'bomb' && o.on && this.all.includes(o.on))) {
      this.fear = Math.min(100, this.fear + dt * 90);
      if (this.act !== 'run' && this.act !== 'move') this.say(pick(LINES.bombOn), 1.2, true);
      this.act = this.mob === 'walk' || this.mob === 'hop' ? 'run' : 'move';
      this.actT = 0.4;
      return;
    }

    const th = W.threatNear(hip.x, hip.y);
    if (th && (th.kind === 'saw' || th.kind === 'bomb')) {
      this.sawSeen = (this.sawSeen || 0) + dt;
      if (this.sawSeen < (th.kind === 'bomb' ? 0.55 : 0.42)) {
        if (th.kind === 'bomb' && this.act !== 'gape') this.say(pick(LINES.bomb), 1.2, true);
        this.act = 'gape'; this.dir = hip.x < th.x ? 1 : -1; this.fear = Math.min(100, this.fear + dt * 80);
        return;
      }
    } else if (!th) { this.sawSeen = 0; this.panic = null; }
    if (th) {
      this.fear = Math.min(100, this.fear + dt * (th.d < 60 ? 90 : 45));
      const dirAway = hip.x < th.x ? -1 : 1;
      const edge = dirAway < 0 ? hip.x - 26 : W.w - 26 - hip.x;
      const wasScared = this.act === 'run' || this.act === 'cower';
      if (!wasScared) { this.say(pick(LINES[th.kind] || LINES.bomb), 1.2, true); }
      if (this.mob !== 'walk' && this.mob !== 'hop') { this.act = 'move'; this.dir = dirAway; this.actT = 0.4; return; }
      if (th.kind === 'bomb') {
        if (!this.panic) { const r = Math.random(); this.panic = r < 0.45 ? 'run' : r < 0.72 ? 'trip' : 'cower'; this.panicT = rnd(0.15, 0.4); }
        if (this.panic === 'cower') { this.act = 'cower'; this.dir = dirAway; this.actT = 0.4; return; }
        if (this.panic === 'trip') {
          this.panicT -= dt;
          if (this.panicT <= 0) { this.panic = 'run'; this.dir = dirAway; this.stumble(); return; }
        }
      }
      this.act = edge < 14 ? 'cower' : 'run';
      this.dir = dirAway;
      this.actT = 0.4;
      return;
    }
    if (this.actT > 0) return;
    this.choose();
  }

  choose() {
    const W = this.W, hip = this.j.hip;
    if (this.mob === 'crawl' || this.mob === 'worm') {
      if (this.act === 'move') { this.act = 'rest'; this.actT = rnd(1, 2.4); if (this.hp < 40) this.say(pick(LINES.low), 1.5); } else {
        this.act = 'move'; this.actT = rnd(1.6, 3.4);
        if (hip.x < 40) this.dir = 1; else if (hip.x > W.w - 40) this.dir = -1; else if (Math.random() < 0.35) this.dir = -this.dir;
      }
      return;
    }
    if (this.hp < 28 && Math.random() < 0.5) { this.act = 'beg'; this.actT = rnd(1.6, 3); this.dir = hip.x > W.w / 2 ? -1 : 1; this.say(pick(LINES.low), 1.6); return; }
    if (this.pain > 28 && Math.random() < 0.6) { this.act = 'fist'; this.actT = rnd(1.1, 2); this.say(pick(LINES.angry), 1.3); return; }
    const r = Math.random();
    if (r < 0.56) {
      this.act = 'walk';
      // 他不知道地上那些东西是干什么的，偏偏爱往那儿走
      const traps = W.props.filter((o) => (o.t === 'mine' || o.t === 'peel' || o.t === 'spring') && o.rest);
      if (traps.length && Math.random() < 0.55) this.tx = clamp(pick(traps).x, 26, W.w - 26);
      else this.tx = rnd(30, W.w - 30);
      this.dir = this.tx > hip.x ? 1 : -1;
      this.actT = 8;
    } else if (r < 0.68) { this.act = 'idle'; this.actT = rnd(1.2, 2.6); }
    else if (r < 0.76) { this.act = 'phone'; this.actT = rnd(2, 4); }
    else if (r < 0.83) { this.act = 'scratch'; this.actT = rnd(1, 1.8); }
    else if (r < 0.9) { this.act = 'wave'; this.actT = rnd(1, 1.8); }
    else { this.act = 'sit'; this.actT = rnd(2.5, 5); }
    if (r >= 0.56) { if (Math.random() < 0.4) this.say(pick(LINES.idle), 1.7); }
  }

  /* ─────────────── 姿势 ─────────────── */

  torso(x, y, lean = 0, tilt = 0) {
    const T = this.T, sn = Math.sin(lean), cs = Math.cos(lean);
    T.hip = [x, y];
    T.chest = [x + sn * LEN.t, y - cs * LEN.t];
    T.neck = [x + sn * LEN.t * 2, y - cs * LEN.t * 2];
    const a = lean + tilt;
    T.head = [T.neck[0] + Math.sin(a) * LEN.neck, T.neck[1] - Math.cos(a) * LEN.neck];
  }
  leg(side, fx, fy, bend) {
    const k = side === 'l' ? 'lLeg' : 'rLeg', l = LIMBS[k], T = this.T;
    if (!this.j[l.a] || !this.j[l.b] || this.broken[k]) return;
    const r = ik(T.hip[0], T.hip[1], fx, fy, LEN.th, LEN.sh, bend ?? -this.dir);
    T[l.a] = r.mid; T[l.b] = r.end;
  }
  arm(side, hx, hy, bend) {
    const k = side === 'l' ? 'lArm' : 'rArm', l = LIMBS[k], T = this.T;
    if (!this.j[l.a] || !this.j[l.b] || this.broken[k]) return;
    const r = ik(T.neck[0], T.neck[1], hx, hy, LEN.up, LEN.lo, bend ?? this.dir);
    T[l.a] = r.mid; T[l.b] = r.end;
  }
  /** 只有一条好腿时，用那条站 */
  hopLeg(x, fy) {
    const ok = (k, l) => this.j[l.a] && this.j[l.b] && !this.broken[k];
    if (ok('lLeg', LIMBS.lLeg)) this.leg('l', x, fy); else this.leg('r', x, fy);
  }
  /** 没腿：趴着 */
  poseLow(phase, moving) {
    const d = this.dir, x = this.x, g = this.gy, T = this.T;
    const w = this.mob === 'worm';
    const wave = moving && w ? Math.abs(Math.sin(phase)) * 5 : 0;
    T.hip = [x, g - 5];
    T.chest = [x + d * 15, g - 6 - wave];
    T.neck = [x + d * 29, g - 8];
    T.head = [x + d * 40, g - 11];
    if (!w) {
      for (const [i, s] of ['l', 'r'].entries()) {
        const ph = phase + i * Math.PI;
        const hx = x + d * (40 + (moving ? Math.cos(ph) * 12 : 2) + i * 2), hy = g - 2 - (moving ? Math.max(0, -Math.sin(ph)) * 7 : 0);
        this.arm(s, hx, hy, -d);
      }
    }
  }

  pose(dt) {
    const W = this.W, d = this.dir;
    this.T = {};
    const hip = this.j.hip;
    // 脚下的高度（走到铅笔线上会跟着走）
    const want = W.supportY(this.x, this.gy - 6);
    if (want - this.gy > 26) { this.knock(0.6); return; } // 踩空
    this.gy = lerp(this.gy, want, Math.min(1, dt * 14));
    const g = this.gy, foot = g - 2;
    const t = this.t;

    // 被挡住了（撞上铅笔线）
    if (Math.abs(hip.x - this.x) > 18 && this.mob === 'walk') {
      if (this.act === 'run') {
        W.word(hip.x, hip.y - 50, '嘭', 16); sfx.thud(0.9);
        this.hurt(8, 'wall');
        hip.px += this.dir * 200 * DT;
        this.knock(0.9);
        return;
      }
      this.x = hip.x;
      this.dir = -this.dir;
      this.act = 'idle'; this.actT = 0.5;
      return;
    }

    if (this.mob === 'crawl' || this.mob === 'worm') {
      const moving = this.act === 'move';
      const sp = this.mob === 'crawl' ? 26 : 13;
      if (moving) {
        this.x += d * sp * dt;
        this.phase += dt * (this.mob === 'crawl' ? 5 : 7);
        if (this.x < 16 || this.x > W.w - 50) { this.dir = -d; }
        this.x = clamp(this.x, 14, W.w - 14);
      }
      this.poseLow(this.phase, moving);
      return;
    }

    const hop = this.mob === 'hop';
    let act = this.act;
    if (act === 'move' || act === 'rest') act = 'idle';

    if (act === 'walk' || act === 'run') {
      const run = act === 'run';
      if (!run && W.obstacleAhead(this.x, d, g)) { this.dir = -d; this.tx = this.x - d * rnd(60, 180); this.tx = clamp(this.tx, 26, W.w - 26); return; }
      const hpK = this.hp < 35 ? 0.72 : 1;
      if (hop) {
        const sp = (run ? 84 : 42);
        this.x += d * sp * dt;
        this.phase += dt * (run ? 12 : 7.5);
        const h = Math.abs(Math.sin(this.phase));
        const y = g - STAND - h * 13;
        this.torso(this.x, y, d * 0.1);
        this.hopLeg(this.x + d * 2, Math.min(foot, y + 40));
        const n = this.T.neck;
        this.arm('l', n[0] - 18, n[1] + 10 - h * 9, 1);
        this.arm('r', n[0] + 18, n[1] + 10 - h * 9, -1);
      } else {
        const om = (run ? 11.5 : 7.5) * hpK, stride = run ? 21 : 13, lift = run ? 14 : 7;
        const sp = om * stride * 0.62;
        this.x += d * sp * dt;
        this.phase += om * dt;
        const a = this.phase, b = a + Math.PI;
        const bob = Math.abs(Math.sin(a)) * (run ? 2.6 : 1.5);
        const y = g - (run ? STAND - 3 : STAND) - bob;
        this.torso(this.x, y, d * (run ? 0.3 : 0.07), run ? -d * 0.15 : 0);
        this.leg('l', this.x + d * stride * Math.cos(a), foot - lift * Math.max(0, -Math.sin(a)));
        this.leg('r', this.x + d * stride * Math.cos(b), foot - lift * Math.max(0, -Math.sin(b)));
        const n = this.T.neck;
        if (run) {
          this.arm('l', n[0] - d * 8 + Math.sin(a * 1.3) * 9, n[1] - 15 + Math.cos(a) * 7, -d);
          this.arm('r', n[0] + d * 10 + Math.cos(a * 1.1) * 9, n[1] - 17 + Math.sin(a) * 7, -d);
        } else {
          this.arm('l', n[0] + d * 11 * Math.cos(b), n[1] + 27 - Math.abs(Math.cos(b)) * 3);
          this.arm('r', n[0] + d * 11 * Math.cos(a), n[1] + 27 - Math.abs(Math.cos(a)) * 3);
        }
      }
      if (this.x < 24) { this.x = 24; this.dir = 1; if (act === 'walk') this.tx = rnd(90, W.w - 30); }
      if (this.x > W.w - 24) { this.x = W.w - 24; this.dir = -1; if (act === 'walk') this.tx = rnd(30, W.w - 90); }
      if (act === 'walk' && Math.abs(this.tx - this.x) < 7) { this.act = 'idle'; this.actT = rnd(0.5, 1.8); }
      return;
    }

    const breathe = Math.sin(t * 2.3) * 0.7;
    const stand = () => {
      this.torso(this.x, g - STAND + breathe, 0);
      if (hop) this.hopLeg(this.x, foot);
      else { this.leg('l', this.x - 9, foot); this.leg('r', this.x + 9, foot); }
    };
    switch (act) {
      case 'gape': {
        stand();
        const n = this.T.neck;
        this.arm('l', n[0] - 13, n[1] + 20); this.arm('r', n[0] + 13, n[1] + 20);
        this.T.head[1] += 0.5;
        break;
      }
      case 'phone': {
        this.torso(this.x, g - STAND + breathe, 0, d * 0.32);
        if (hop) this.hopLeg(this.x, foot); else { this.leg('l', this.x - 9, foot); this.leg('r', this.x + 9, foot); }
        const n = this.T.neck;
        this.arm('l', n[0] + d * 3, n[1] + 27);
        this.arm('r', n[0] + d * 14, n[1] + 6, d);
        break;
      }
      case 'scratch': {
        stand();
        const n = this.T.neck, h = this.T.head;
        this.arm('l', n[0] - d * 5, n[1] + 27);
        this.arm('r', h[0] + d * 8 + Math.sin(t * 16), h[1] - 6 + Math.cos(t * 16), -d);
        break;
      }
      case 'wave': {
        stand();
        const n = this.T.neck;
        this.arm('l', n[0] - d * 5, n[1] + 27);
        this.arm('r', n[0] + d * (12 + Math.sin(t * 11) * 7), n[1] - 22, -d);
        break;
      }
      case 'fist': {
        stand();
        const n = this.T.neck;
        this.arm('l', n[0] - d * 8, n[1] + 24);
        this.arm('r', n[0] + d * 14, n[1] - 18 + Math.sin(t * 19) * 4, -d);
        this.T.head[0] += Math.sin(t * 19) * 0.8;
        break;
      }
      case 'beg': {
        const bow = Math.sin(t * 5) * 0.09;
        this.torso(this.x, g - 21, d * (0.08 + bow));
        this.leg('l', this.x - d * 18, foot, -d);
        this.leg('r', this.x - d * 14, foot, -d);
        const n = this.T.neck;
        this.arm('l', n[0] + d * 15, n[1] - 3, d);
        this.arm('r', n[0] + d * 15, n[1] - 4, d);
        break;
      }
      case 'cower': {
        const jit = Math.sin(t * 46) * 0.9;
        this.torso(this.x + jit, g - 21, d * 0.5, -d * 0.2);
        this.leg('l', this.x - 11, foot); this.leg('r', this.x + 11, foot);
        const h = this.T.head;
        this.arm('l', h[0] - 7, h[1] - 8, -d);
        this.arm('r', h[0] + 7, h[1] - 8, -d);
        break;
      }
      case 'sit': {
        this.torso(this.x, g - 7, -d * 0.24 + breathe * 0.01);
        this.leg('l', this.x + d * 31, foot);
        this.leg('r', this.x + d * 25, foot);
        const n = this.T.neck;
        this.arm('l', n[0] + d * 22, n[1] + 16);
        this.arm('r', n[0] + d * 17, n[1] + 18);
        break;
      }
      default: {
        stand();
        const n = this.T.neck, s = Math.sin(t * 1.7) * 0.8;
        if (hop) { this.arm('l', n[0] - 16, n[1] + 14, 1); this.arm('r', n[0] + 16, n[1] + 14, -1); }
        else { this.arm('l', n[0] - 8 + s, n[1] + 28); this.arm('r', n[0] + 8 + s, n[1] + 28); }
      }
    }
  }

  /** 物理子步里调用：把关节拉向姿势 */
  control() {
    if (this.ctrl <= 0.001 || this.dead || this.gone) return;
    if (this.state !== 'ctrl' && this.state !== 'getup') return;
    const k = this.ctrl * 0.36, T = this.T;
    for (const n of NAMES) {
      const q = T[n], p = this.j[n];
      if (!q || !p || p.pin || p.hole || p.trap || p.im === 0) continue;
      p.x += (q[0] - p.x) * k; p.y += (q[1] - p.y) * k;
      p.px += (q[0] - p.px) * k * 0.94; p.py += (q[1] - p.py) * k * 0.94;
    }
  }

  onResize() { this.gy = this.W.ground; this.T = {}; }

  /* ─────────────── 给界面看的 ─────────────── */

  statusText() {
    if (this.gone) return '已被删除';
    if (this.dead) return '已停止工作';
    switch (this.state) {
      case 'draw': return '正在重画……';
      case 'frozen': return '冻住了';
      case 'flat': return '被压扁了';
      case 'getup': return '正在爬起来';
      case 'rag': return this.held ? '被抓着' : this.stuck() ? '动弹不得' : this.dizzy > 0 ? '晕了' : '躺着';
      default: break;
    }
    if (this.mob === 'crawl') return this.act === 'move' ? '在地上爬' : '趴着喘气';
    if (this.mob === 'worm') return this.act === 'move' ? '像虫一样蠕动' : '放弃思考';
    const m = { idle: '发呆', walk: this.mob === 'hop' ? '单脚蹦' : '散步', run: '逃命', cower: '缩成一团', phone: '玩手机', scratch: '挠头', wave: '跟你打招呼', fist: '冲你挥拳', beg: '跪地求饶', sit: '坐着', gape: '抬头看' };
    return m[this.act] || '发呆';
  }
  injury() {
    let lost = 0, broke = 0;
    for (const k of Object.keys(LIMBS)) {
      if (!this.limbOK[k]) lost++;
      else if (this.broken[k]) broke++;
    }
    return { lost, broke };
  }

  /* ─────────────── 绘制 ─────────────── */

  moodNow() {
    if (this.dead) return 'dead';
    if (this.moodT > 0) return this.mood;
    if (this.dizzy > 0) return 'dizzy';
    if (this.fear > 35) return 'scared';
    if (this.state === 'frozen') return 'scared';
    if (this.hp < 28) return 'sad';
    if (this.pain > 34) return 'angry';
    if (this.act === 'phone' || this.act === 'sit') return 'bored';
    if (this.act === 'wave') return 'happy';
    return 'norm';
  }

  drawShadow(c, shadow) {
    const hip = this.j.hip;
    if (!hip || this.gone || this.state === 'draw' || hip.hole) return;
    shadow(hip.x, 19, this.W.ground - hip.y - STAND);
  }

  draw(c) {
    if (this.state === 'draw') { this.drawStrokes(c); return; }
    const j = this.j, W = this.W;
    if (!this.all.length) return;

    if (this.xray > 0) this.drawBones(c);

    // 骨折的地方画一道闪电形的小折线
    c.strokeStyle = INK; c.lineWidth = 1.3;
    for (const k of Object.keys(this.broken)) {
      const a = j[LIMBS[k].a];
      if (!a) continue;
      c.beginPath(); c.moveTo(a.x - 5, a.y - 3); c.lineTo(a.x - 1, a.y - 5); c.lineTo(a.x + 1, a.y - 1); c.lineTo(a.x + 5, a.y - 3); c.stroke();
    }

    // 手机
    if (this.state === 'ctrl' && this.act === 'phone' && this.mob !== 'crawl' && this.mob !== 'worm' && j.rHa) {
      c.fillStyle = INK; c.fillRect(j.rHa.x + this.dir * 2 - 2, j.rHa.y - 7, 4, 8);
    }

    const h = j.head;
    if (h && !h.hole) {
      const n = j.neck;
      const flat = h.flat || this.squash > 0.5;
      const ang = flat ? 0 : n ? Math.atan2(h.x - n.x, n.y - h.y) : h.ang;
      const look = this.state === 'ctrl' && (this.act === 'wave' || this.act === 'idle') ? this.dir * 0.2 : this.dir * 0.8;
      art.head(c, h.x, h.y, 9, ang, {
        mood: this.moodNow(), look, lookY: this.act === 'gape' ? -1 : this.act === 'phone' ? 1 : 0,
        squash: this.squash, hair: this.hair, lump: this.lump > 0.4 ? this.lump : 0, dizzy: !this.dead && this.dizzy > 0, t: this.t, tear: this.hp < 28,
      });
    }

    if (this.state === 'frozen') this.drawIce(c);
  }

  drawStrokes(c) {
    const t = this.drawT, ST = this.strokes;
    const hd = this.j.head;
    const headShare = 0.3;
    let tip = null;
    c.strokeStyle = INK; c.lineWidth = 3; c.lineCap = 'round';
    const u0 = Math.min(1, t / headShare);
    c.beginPath(); c.arc(hd.x, hd.y, 9, -Math.PI / 2, -Math.PI / 2 + u0 * Math.PI * 2); c.stroke();
    const a0 = -Math.PI / 2 + u0 * Math.PI * 2;
    tip = { x: hd.x + Math.cos(a0) * 9, y: hd.y + Math.sin(a0) * 9 };
    if (u0 >= 1) {
      c.fillStyle = INK; c.fillRect(hd.x + this.dir * 2.4 - 1, hd.y - 2.6, 2.2, 3); c.fillRect(hd.x + this.dir * 7 - 1, hd.y - 2.6, 2.2, 3);
      c.lineWidth = 1.4; c.beginPath(); c.moveTo(hd.x + this.dir * 3, hd.y + 4); c.lineTo(hd.x + this.dir * 6.5, hd.y + 4); c.stroke();
      c.lineWidth = 4;
      c.beginPath(); c.moveTo(hd.x, hd.y + 9); c.lineTo(this.j.neck.x, this.j.neck.y); c.stroke();
    }
    const rest = Math.max(0, (t - headShare) / (1 - headShare));
    const n = ST.length, seg = rest * n;
    c.lineWidth = 4;
    for (let i = 0; i < n; i++) {
      const u = clamp(seg - i, 0, 1);
      if (u <= 0) break;
      const L = ST[i];
      c.beginPath(); c.moveTo(L[0].x, L[0].y);
      if (u < 0.5) {
        const v = u / 0.5, x = lerp(L[0].x, L[1].x, v), y = lerp(L[0].y, L[1].y, v);
        c.lineTo(x, y); tip = { x, y };
      } else {
        c.lineTo(L[1].x, L[1].y);
        const v = (u - 0.5) / 0.5, x = lerp(L[1].x, L[2].x, v), y = lerp(L[1].y, L[2].y, v);
        c.lineTo(x, y); tip = { x, y };
      }
      c.stroke();
    }
    art.pencil(c, tip.x, tip.y, 1.15);
  }

  drawBones(c) {
    const W = this.W;
    const sticks = W.sticks.filter((s) => s.a.body && s.b.body && s.kind !== 'ice');
    for (const s of sticks) {
      c.lineWidth = 6; c.strokeStyle = INK;
      c.beginPath(); c.moveTo(s.a.x, s.a.y); c.lineTo(s.b.x, s.b.y); c.stroke();
      c.lineWidth = 2.4; c.strokeStyle = PAPER;
      c.beginPath(); c.moveTo(s.a.x, s.a.y); c.lineTo(s.b.x, s.b.y); c.stroke();
    }
    const { neck, hip } = this.j;
    if (neck && hip) {
      c.strokeStyle = PAPER; c.lineWidth = 1.5;
      for (let i = 1; i <= 4; i++) {
        const u = i / 6, x = lerp(neck.x, hip.x, u), y = lerp(neck.y, hip.y, u);
        c.beginPath(); c.moveTo(x - 7, y); c.lineTo(x + 7, y); c.stroke();
      }
    }
  }
  /** 被电的时候整个画面黑白闪 */
  xrayFlip() {
    if (this.xray <= 0 || !this.W.opts.flash) return false;
    const t = 0.6 - this.xray;
    return t < 0.1 || (t > 0.2 && t < 0.3); // 只闪两下，看清骨头就行，不一直晃眼
  }

  drawIce(c) {
    const pts = this.all.map((p) => ({ x: p.x, y: p.y, r: p.r + 7 }));
    const ring = [];
    for (const p of pts) for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; ring.push({ x: p.x + Math.cos(a) * p.r, y: p.y + Math.sin(a) * p.r }); }
    ring.sort((a, b) => a.x - b.x || a.y - b.y);
    const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
    const lo = [];
    for (const p of ring) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
    const up = [];
    for (let i = ring.length - 1; i >= 0; i--) { const p = ring[i]; while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
    const hull = lo.slice(0, -1).concat(up.slice(0, -1));
    const path = () => { c.beginPath(); hull.forEach((p, i) => (i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y))); c.closePath(); };
    // 冰是半透明的：只在外圈铺一层网点，他本人还看得见
    c.save(); path(); c.clip();
    const b = hull.reduce((m, p) => ({ x0: Math.min(m.x0, p.x), y0: Math.min(m.y0, p.y), x1: Math.max(m.x1, p.x), y1: Math.max(m.y1, p.y) }), { x0: 1e9, y0: 1e9, x1: -1e9, y1: -1e9 });
    c.strokeStyle = INK; c.lineWidth = 1;
    for (let i = -6; i < 12; i++) {
      const x = b.x0 + i * 12;
      c.beginPath(); c.moveTo(x, b.y1); c.lineTo(x + 26, b.y1 - 26); c.stroke();
      c.beginPath(); c.moveTo(x + 40, b.y0 + 12); c.lineTo(x + 56, b.y0 - 4); c.stroke();
    }
    c.restore();
    path(); c.strokeStyle = INK; c.lineWidth = 2.5; c.stroke();
    c.strokeStyle = PAPER; c.lineWidth = 1;
    c.beginPath(); c.moveTo(b.x0 + 8, b.y0 + 20); c.lineTo(b.x0 + 18, b.y0 + 8); c.stroke();
  }

  /* 存档 */
  snapshot(idx) {
    const j = {};
    for (const n of NAMES) if (this.j[n]) j[n] = idx.get(this.j[n]);
    return {
      j, hp: Math.round(this.hp), dir: this.dir, x: Math.round(this.x), gy: this.gy, num: this.num,
      dead: this.dead, gone: this.gone, broken: this.broken, hair: this.hair, lump: this.lump,
      hitCount: this.hitCount, age: Math.round(this.age), cause: this.cause, flat: this.state === 'flat', deathSent: this.deathSent,
    };
  }
  restore(d, pts) {
    this.j = {};
    for (const [n, i] of Object.entries(d.j || {})) if (pts[i]) this.j[n] = pts[i];
    this.hp = d.hp; this.dir = d.dir || 1; this.x = d.x; this.gy = d.gy; this.num = d.num || 1;
    this.dead = !!d.dead; this.gone = !!d.gone; this.broken = d.broken || {}; this.hair = !!d.hair; this.lump = d.lump || 0;
    this.hitCount = d.hitCount || 0; this.age = d.age || 0; this.cause = d.cause || 'fall';
    this.pain = 0; this.fear = 0; this.spurts = []; this.ice = []; this.xray = 0; this.squash = 0; this.dizzy = 0; this.soot = 0;
    this.moodT = 0; this.sayCd = 2; this.hitCd = 0; this.causeT = 0; this.T = {}; this.ctrl = 0;
    this.deathSent = d.deathSent !== false;
    this.deathT = 0;
    this.limbOK = {};
    this.all = pts.filter((p) => p.body);
    for (const [k, l] of Object.entries(LIMBS)) this.limbOK[k] = !!(this.j[l.a] && this.j[l.b]);
    this.mob = this.mobility();
    this.act = 'idle'; this.actT = 0.6; this.phase = 0; this.tx = this.x;
    if (this.gone) { this.state = 'gone'; this.all = []; }
    else if (this.dead) { this.state = 'dead'; }
    else { for (const p of this.all) p.flat = false; this.state = 'rag'; this.ragT = 0.15; }
  }
}
