// 一个火柴人：骨架、性格、动作、反应、伤情。血条是大家共用的（World.vit）。
import * as art from './art.js';
import { INK, PAPER } from './art.js';
import { sfx } from './sfx.js';

const DT = 1 / 120;
const hyp = Math.hypot;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (l) => l[(Math.random() * l.length) | 0];
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => t * t * (3 - 2 * t);

const NAMES = ['head', 'neck', 'chest', 'hip', 'lEl', 'lHa', 'rEl', 'rHa', 'lKn', 'lFo', 'rKn', 'rFo'];
export const HANDS_FEET = ['lHa', 'rHa', 'lFo', 'rFo'];
export const LIMB_JOINTS = ['lHa', 'rHa', 'lFo', 'rFo', 'lEl', 'rEl', 'lKn', 'rKn'];
export const LIMBS = {
  lArm: { root: 'neck', a: 'lEl', b: 'lHa', arm: true },
  rArm: { root: 'neck', a: 'rEl', b: 'rHa', arm: true },
  lLeg: { root: 'hip', a: 'lKn', b: 'lFo', arm: false },
  rLeg: { root: 'hip', a: 'rKn', b: 'rFo', arm: false },
};
const LEN = { neck: 12, t: 15, up: 15, lo: 15, th: 21, sh: 21 };
const STAND = 39; // 站着时胯离地多高
const KINDS = ['office', 'sunny', 'sharp'];
// 躲开的本事：上班族懒得动，开朗的一般，认真的最灵敏；平均下来大约一半
const SKILL = { office: 0.38, sunny: 0.5, sharp: 0.74 };
const SPEED = { office: 0.85, sunny: 1, sharp: 1.16 };
const CHATTY = { office: 0.3, sunny: 1, sharp: 0.55 };

// 大家都会说的
const LINES = {
  hurt: ['啊！', '嗷！', '疼疼疼', '哎哟', '你有病吧', '打人不打脸', '我的腰', '救命', '住手！', '嘶——'],
  big: ['啊啊啊！', '我的天！', '要命了', '妈呀', '你是魔鬼吧', '这谁顶得住'],
  low: ['别打了……', '我错了', '告诉我妈……', '我看到光了', '求你了'],
  arm: ['我胳膊呢？', '还挺凉快', '这还能接吗', '我投诉你', '手！我的手！'],
  leg: ['我的腿！', '站不住了', '这下省裤子了', '这还能接吗', '我腿呢？'],
  roller: ['刹车！', '看路啊！', '有人！有人！'],
  hole: ['这也太黑了', '好吸啊', '抓不住了'],
  strap: ['啊啊啊啊啊', '放我下来', '我恐高'],
  spring: ['哇——', '我会飞了', '天花板好近'],
  slip: ['哎哟我的屁股', '谁扔的', '这皮不讲武德'],
  thaw: ['阿嚏！', '好冷', '腿麻了'],
  melt: ['化了化了', '好疼！', '冷热交替啊'],
  flat: ['好……扁……', '我……变……薄……了'],
  poke: ['别戳我', '干嘛', '手拿开', '痒', '再戳试试'],
  grab: ['放我下来！', '我恐高', '轻点轻点'],
  limbAdd: ['这是什么', '多了点什么', '谁给我画的', '还挺好用'],
  stab: ['扎到了！', '钉住了', '拔不出来'],
  nail: ['我的手！', '钉住了！', '拔出来！', '这得打破伤风'],
  rope: ['绑我干嘛', '解开！', '这谁系的'],
  balloon: ['这什么？', '好轻', '气球！……等等'],
  free: ['挣开了！', '哈！', '自由了！'],
  anvil: ['拿开……', '好重', '喘不上气'],
  gape: ['？', '那是什么', '咦'],
  angry: ['你等着', '有本事单挑', '我记住你了', '我要报警'],
  bubble: ['咕噜', '咕噜咕噜', '救……咕'],
  water: ['水！', '水怎么来了', '我会游的', '好凉'],
  scared: ['别过来', '你想干嘛', '离我远点', '别碰我'],
  grudge: ['你到底想干嘛', '我都这样了', '我记着呢', '放过我吧', '你还来？'],
  grief: ['喂！', '醒醒！', '你别吓我', '不会吧……', '他刚才还在说话'],
  griefNear: ['你醒醒', '起来啊', '别睡这儿', '我拉你起来'],
};

// 每种性格自己说的（只有上班族透露身世）
const PLINES = {
  office: {
    idle: ['……', '我只是个上班的', '今天的报表还没交', '没人会来找我的', '我到底得罪谁了', '这比加班还难受', '我妈不会打电话的', '算了', '几点了', '手机没信号', '我不是什么重要的人', '随便吧'],
    hello: ['又来？', '哦', '随便你', '报表谁帮我交', '刚才那个不是我'],
    hurt: ['……嘶', '行吧', '工伤能报吗', '算了', '嗯。'],
    low: ['没人会发现的', '也没人等我', '算了……', '我请个假行吗'],
    dodge: ['哦', '差点', '……躲开了', '就这'],
    water: ['又是水', '我不想动', '这也不算工伤吧'],
    grudge: ['你跟那帮人是一伙的吧', '我真的只是上班的', '我什么都没看见', '我不会说出去的'],
    chat: ['……', '嗯', '别跟我说话', '你怎么进来的', '我还有报表没交', '没事别叫我', '你家人会来找你吗'],
  },
  sunny: {
    idle: ['今天天气真好！', '嗨！', '你好呀！', '要不要跳舞', '想吃火锅', '我们会出去的！', '这屏幕真白！', '有人一起玩吗', '你手机该充电啦'],
    hello: ['我来啦！', '大家好！', '新的一天！', '你好你好！', '今天也要加油！'],
    hurt: ['哎呀！', '好疼好疼！', '别闹啦！', '嗷呜！', '轻点嘛！'],
    low: ['我还想吃火锅……', '再给我一次机会嘛', '还能再坚持一下……'],
    dodge: ['嘿嘿！', '没打着！', '耶！', '略略略'],
    water: ['下水啦！', '我会游泳哦！', '好好玩！'],
    grudge: ['你为什么要这样嘛', '我们不是朋友吗', '我不跟你玩了！'],
    chat: ['你好呀！', '你叫什么？', '一起玩吧！', '我们会出去的！', '要不要击掌！', '你笑一个嘛', '别担心！'],
  },
  sharp: {
    idle: ['这里没有门', '我观察一下', '地面是实的', '刚才那招有规律', '记下来', '不能慌', '先活动一下', '这屏幕边界很硬'],
    hello: ['报到', '情况不妙', '先看看地形', '都小心'],
    hurt: ['失误了', '记住了', '下次不会', '啧', '可恶'],
    low: ['撑住……', '还有办法', '不能倒在这儿'],
    dodge: ['看到了', '太慢了', '预判到了', '这招我见过'],
    water: ['水位在涨', '先上浮', '留一口气'],
    grudge: ['我已经摸清你了', '你的习惯很明显', '别以为我不知道'],
    chat: ['小心点', '我观察过了，这里没有门', '别站那儿', '刚才那招有规律', '记住路线', '你听我说', '分开走'],
  },
};

const ARGUE = ['你踩我了', '都怪你', '是你先的', '你别动！', '离我远点', '你说谁呢'];
const TOOL_LINES = {
  mouse: ['别抓我', '鼠标拿开', '又是这个箭头'],
  anvil: ['那是铁砧吧', '别拿那个', '这太重了'],
  peel: ['香蕉皮？', '我看见了', '谁吃的'],
  spring: ['这是干嘛的', '看着挺好玩'],
  spikes: ['你认真的？', '那东西扎人'],
  bolt: ['要打雷了？', '我感觉头发竖起来了'],
  roller: ['我听到马达声', '那司机有驾照吗'],
  freeze: ['好冷', '别，我怕冷'],
  hole: ['那东西不能碰吧', '这个会吸人的'],
  eraser: ['别擦我', '那是橡皮吧', '我是画出来的？'],
  pencil: ['你要画什么', '画个门吧'],
  nail: ['钉子不行，真的不行', '你拿钉子干嘛', '我怕疼'],
  rope: ['你拿绳子干嘛', '我不玩这个'],
  balloon: ['气球！', '是给我的吗', '有点可疑'],
  water: ['要下雨了？', '我会游泳的', '水是哪来的'],
};

function ik(ax, ay, bx, by, l1, l2, bend) {
  let dx = bx - ax, dy = by - ay, d = hyp(dx, dy) || 0.01;
  const m = l1 + l2 - 0.05;
  if (d > m) { bx = ax + dx / d * m; by = ay + dy / d * m; dx = bx - ax; dy = by - ay; d = m; }
  const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  const mx = ax + dx / d * a, my = ay + dy / d * a;
  return { mid: [mx - dy / d * h * bend, my + dx / d * h * bend], end: [bx, by] };
}

let nextBody = 1;

export class Body {
  constructor(W, slot = 0) {
    this.W = W;
    this.slot = slot;
    this.id = nextBody++;
    this.kind = pick(KINDS);
    this.j = {};
    this.all = [];
    this.T = {};
    this.dead = false;
    this.state = 'none';
    this.ctrl = 0;
    this.pain = 0; this.fear = 0; this.air = 1;
    this.broken = {};
    this.limbOK = {};
    this.tied = {}; this.anchors = []; this.liftU = 0; this.hoisted = false;
    this.t = 0;
    this.spurts = [];
    this.ice = [];
    this.dir = 1; this.x = 0; this.gy = 0;
    this.seen = new WeakSet();
    this.hitCount = 0; this.age = 0;
    this.dodgeCd = 0;
    this.strain = 0; this.strainAt = rnd(9, 18);
  }

  get alive() { return !this.dead && !!this.j.hip && !!this.j.head; }
  get hp() { return this.W.vit.hp; }
  set hp(v) { this.W.vit.hp = v; }
  get hpf() { return this.W.vit.hp / (this.W.vit.max || 1); }

  /** 取这种性格的台词；没有就用公共的。公共里也有的话，两边混着说 */
  line(key) {
    const own = PLINES[this.kind][key], com = LINES[key];
    if (own && com) return pick(Math.random() < 0.7 ? own : com);
    return pick(own || com || ['……']);
  }
  get skill() {
    let s = SKILL[this.kind];
    if (this.pain > 55) s *= 0.6;
    if (this.dizzy > 0) s *= 0.3;
    if (this.mob === 'hop') s *= 0.6;
    if (this.mob === 'crawl' || this.mob === 'worm') s = 0;
    return s;
  }

  /* ─────────────── 出生 ─────────────── */
  spawn(x, animate = true) {
    const W = this.W;
    const gy = W.ground;
    this.gy = gy;
    this.x = x;
    this.dir = x > W.w / 2 ? -1 : 1;
    const hipY = gy - STAND, d = this.dir;
    const P = (n, px, py, o = {}) => (this.j[n] = W.addPt(px, py, { part: n, body: true, owner: this, group: this.id, ...o }));
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
    this.broken = {}; this.spurts = []; this.ice = [];
    this.hair = false; this.lump = 0; this.dizzy = 0; this.soot = 0; this.xray = 0; this.squash = 0;
    this.cause = 'fall'; this.causeT = 0;
    this.hitCount = 0; this.hitCd = 0; this.age = 0; this.lost = 0;
    this.moodT = 0; this.mood = 'norm';
    this.sayCd = 1.5;
    this.act = 'idle'; this.actT = 1.5; this.phase = 0; this.tx = x;
    this.mob = 'walk';
    this.num = W.drawn;
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

  /** 死了：身子留在原地当尸体，钉子和绳子都还连着 */
  release() {
    if (this.released) return;
    this.released = true;
    this.removeIce();
    for (const p of this.all) {
      p.body = false; p.owner = null; p.flat = false; p.corpse = true;
      if (p.pin && !p.pin.by) p.pin = null;
    }
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
    if (this.released) return;
    const W = this.W, core = this.j.chest;
    if (!core) { this.all = []; return; }
    const seen = new Set([core]), stack = [core];
    const adj = new Map();
    for (const s of W.sticks) {
      if (s.kind === 'ice' || s.kind === 'rope' || s.kind === 'ropeMax' || s.kind === 'tie') continue;
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
    for (const p of W.pts) {
      if (p.owner === this && !seen.has(p)) { p.body = false; p.owner = null; p.flat = false; p.sleep = 0; }
    }
    this.all = W.pts.filter((p) => seen.has(p));
    for (const p of this.all) { p.body = true; p.owner = this; p.group = this.id; }

    for (const [k, l] of Object.entries(LIMBS)) {
      const ok = !!(this.j[l.a] && this.j[l.b]);
      if (!first && this.limbOK[k] && !ok && !this.dead) this.onLimbLost(k);
      this.limbOK[k] = ok;
    }
    if (!first && !this.dead) {
      if (!this.j.head) this.fatal('head');
      else if (!this.j.hip) this.fatal('torso');
    }
  }

  /** 脑袋掉了或者拦腰断了：这一个立刻死，共用血条扣三分之一 */
  fatal(part) {
    const V = this.W.vit;
    V.hp = Math.max(0, V.hp - V.max / 3);
    this.die(`${this.cause}:${part}`);
    if (V.hp <= 0) this.W.killAll(this.cause);
  }

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

  limbOf(p) {
    for (const [k, l] of Object.entries(LIMBS)) if (this.j[l.a] === p || this.j[l.b] === p) return k;
    return null;
  }

  /* ─────────────── 受伤 ─────────────── */
  say(text, dur = 1.5, force = false) {
    if (this.dead || this.released) return;
    if (!force && this.sayCd > 0) return;
    this.sayCd = dur + 0.5;
    this.W.cb.say && this.W.cb.say(this, text, dur);
    sfx.gibber();
  }
  setMood(m, t = 0.6) { this.mood = m; this.moodT = t; }

  hurt(d, cause, o = {}) {
    if (this.dead || this.state === 'draw') return;
    const W = this.W;
    if (cause) { this.cause = cause; this.causeT = 2; }
    W.focus = this;
    W.grudge = Math.min(100, W.grudge + d * 0.06);
    W.cb.hit && W.cb.hit(d, cause);
    if (this.hitCd <= 0) { this.hitCount++; this.hitCd = 0.25; W.cb.counted && W.cb.counted(); }
    this.hp -= d;
    this.pain = Math.min(100, this.pain + d * 1.5);
    this.setMood(this.pain > 45 ? 'grit' : 'ouch', 0.55);
    if (!o.quiet) {
      sfx.ouch(d / 12);
      if (this.hpf < 0.25) this.say(this.line('low'), 1.6);
      else this.say(d > 26 ? pick(LINES.big) : this.line('hurt'), 1.1);
    }
    if (this.hp <= 0) { this.hp = 0; W.killAll(cause || this.cause); }
  }

  die(cause) {
    if (this.dead) return;
    this.dead = true;
    this.cause = cause || this.cause;
    this.ctrl = 0;
    this.removeIce();
    this.state = 'dead';
    if (this.partner) { const o = this.partner; this.partner = null; if (o.partner === this) o.endMeet(); }
    this.W.cb.say && this.W.cb.say(this, '', 0);
    this.W.noteDeath(this, this.cause);
  }
  removeIce() {
    for (const s of this.ice) this.W.removeStick(s);
    this.ice = [];
    for (const p of this.all) if (p.pin && p.pin.by === 'ice') p.pin = null;
  }

  knock(dur = 0.8) {
    if (this.dead) return;
    if (this.state === 'frozen' || this.state === 'draw' || this.state === 'flat') return;
    this.ragT = Math.max(this.state === 'rag' ? this.ragT : 0, dur);
    this.state = 'rag';
    this.ctrl = 0;
    if (this.partner) this.endMeet();
  }

  impact(p, v, o) {
    if (this.dead || this.state === 'draw') return;
    if (this.state === 'frozen') { if (v > 170) this.shatter(o ? `${o.t}` : 'fall'); return; }
    // 自己走路跑步时脚踩地不算受伤；只有真被东西撞上才算
    if ((this.state === 'ctrl' || this.state === 'getup') && !o && v < 720) return;
    if (v < 300) return;
    const head = p === this.j.head;
    const dragged = this.cause === 'hole' && this.causeT > 0;
    const d = (v - 300) * 0.036 * (head ? 1.5 : 1) * (dragged ? 0.25 : 1);
    this.frameMax = Math.max(this.frameMax || 0, d);
    if (dragged) return;
    const limb = this.limbOf(p);
    if (limb && v > 760 && !this.broken[limb] && Math.random() < 0.3) this.breakLimb(limb);
    if (limb && v > 1300 && this.tearCd <= 0 && Math.random() < 0.28) { this.tearCd = 0.8; this.detachLimb(limb); }
    if (head && v > 400) { this.lump = Math.min(6, this.lump + 1.2); this.dizzy = Math.max(this.dizzy, 1.8); }
    if (v > 330 && (this.state === 'ctrl' || this.state === 'getup')) this.knock(0.9);
  }
  detachLimb(k) {
    const l = LIMBS[k], a = this.j[l.a], r = this.j[l.root];
    if (!a || !r) return;
    const s = this.W.sticks.find((q) => (q.a === r && q.b === a) || (q.a === a && q.b === r));
    if (s) this.W.cutStick(s, 0);
  }

  breakLimb(k) {
    if (this.broken[k] || !this.limbOK[k]) return;
    this.broken[k] = true;
    const a = this.j[LIMBS[k].a];
    sfx.stab();
    if (a) this.W.word(a.x, a.y - 8, '咔嚓', 13);
    this.W.cb.broke && this.W.cb.broke();
    this.say(LIMBS[k].arm ? '胳膊折了！' : '腿折了！', 1.4, true);
  }

  crushed(p, o, v) {
    if (this.state === 'draw' || this.dead) return;
    if (this.state === 'frozen') { this.shatter('anvil'); return; }
    if (o.hitB && o.hitB.has(this)) return;
    if (!o.hitB) o.hitB = new Set();
    o.hitB.add(this);
    const core = p === this.j.head || p === this.j.neck || p === this.j.chest || p === this.j.hip;
    this.W.spurt(p.x, p.y, 8);
    const d = (core ? 50 : 22) * o.s * (0.55 + v / 900);
    this.hurt(d, 'anvil');
    if (this.dead) return;
    this.knock(1.4);
    if (!core) { const k = this.limbOf(p); if (k) this.breakLimb(k); }
    this.lump = Math.min(6, this.lump + 2);
    this.dizzy = Math.max(this.dizzy, 2.4);
  }

  flatten(cause, dmg, y) {
    if (this.dead || this.state === 'draw') return;
    if (this.state === 'frozen') { this.shatter(cause); return; }
    if (this.state === 'flat') return;
    const W = this.W, g = y ?? W.ground;
    const hip = this.j.hip;
    for (const p of this.all) {
      if (hip) p.x += (p.x - hip.x) * 0.15;
      p.flat = true; p.y = g - 1; p.py = p.y; p.px = p.x; p.trap = null;
      if (p.pin) p.pin = null;
    }
    sfx.thud(1.4);
    W.bang(0.8);
    W.spurt(hip ? hip.x : this.x, g - 2, 10);
    W.word(hip ? hip.x : this.x, g - 36, '嘎吱', 18);
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
    if (this.dead || this.state === 'draw') return;
    if (this.state === 'frozen') { this.shatter('bolt'); return; }
    this.xray = 0.6;
    this.hair = true;
    this.soot = 6;
    const W = this.W;
    for (const p of this.all) { if (!p.pin) { p.px += rnd(-260, 260) * DT; p.py += rnd(0, 240) * DT; } }
    this.hurt(32 * s, 'bolt', { quiet: true });
    sfx.ouch(2);
    if (this.dead) return;
    this.knock(1.5);
    this.dizzy = Math.max(this.dizzy, 2.2);
    W.dust(this.j.hip ? this.j.hip.x : this.x, W.ground, 4);
  }

  erased(s) {
    this.cause = 'eraser'; this.causeT = 2;
    if (this.state === 'frozen') { this.removeIce(); this.state = 'rag'; this.ragT = 0.6; }
    sfx.erase();
    for (const p of [s.a, s.b]) this.W.dropTiesIfGone(p, s);
    this.W.eraseStick(s);
    if (this.dead) return;
    this.hurt(5, 'eraser', { quiet: true });
    if (!this.dead) this.setMood('wow', 0.8);
  }
  eraseHead(p) {
    this.cause = 'eraser'; this.causeT = 2;
    this.W.removeHead(p);
    this.j.head = null;
    this.recalc();
  }

  stabbed(p, o) {
    if (this.state === 'draw' || this.dead) return;
    this.hurt(13 * o.s, 'spikes');
    if (this.dead) return;
    this.knock(1.5);
    this.say(pick(LINES.stab), 1.3, true);
  }
  nailed() {
    if (this.state === 'draw' || this.dead) return;
    this.hurt(14, 'nail', { quiet: true });
    if (this.dead) return;
    sfx.ouch(1);
    this.setMood('grit', 1.2);
    this.knock(1.2);
    this.strain = 0; this.strainAt = rnd(9, 18);
    this.say(pick(LINES.nail), 1.4, true);
  }
  tiedOn(kind) {
    if (this.dead || this.state === 'draw') return;
    this.setMood('wow', 1);
    this.strain = 0; this.strainAt = rnd(9, 18);
    this.hoistSaid = false;
    this.say(pick(kind === 'balloon' ? LINES.balloon : LINES.rope), 1.3, true);
  }
  hoistBump() {
    if (this.hoistSaid) return;
    this.hoistSaid = true;
    this.say(pick(LINES.strap), 1.4, true);
  }
  balloonGone() {
    if (this.dead) return;
    this.setMood('wow', 0.8);
    if (this.j.hip && this.W.ground - this.j.hip.y > 70) this.say('啊啊啊！', 1, true);
  }
  sucked() {
    if (this.state === 'draw' || this.dead) return;
    if (this.cause !== 'hole') this.say(pick(LINES.hole), 1.2, true);
    this.cause = 'hole'; this.causeT = 3;
    if (this.state === 'flat') this.popUp();
    this.knock(0.6);
  }
  spatOut(list, o) {
    const mine = list.filter((p) => p.owner === this);
    if (!mine.length || this.dead) return;
    this.hurt(58 * o.s, 'hole');
    if (this.dead) return;
    this.knock(1.4);
    const keys = Object.keys(LIMBS).sort(() => Math.random() - 0.5);
    const n = Math.min(keys.length, Math.round(mine.length / 3));
    for (let i = 0; i < n; i++) { this.detachLimb(keys[i]); if (this.dead) return; }
    this.dizzy = 3;
  }
  launched() {
    this.cause = 'spring'; this.causeT = 2.4;
    if (this.state === 'flat') this.popUp();
    this.knock(1.5);
    this.say(pick(LINES.spring), 1.3, true);
  }
  canSlip() { return this.alive && this.state === 'ctrl' && this.mob === 'walk' && (this.act === 'walk' || this.act === 'run') && !this.swimming; }
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
    if (this.dead) return;
    this.say(pick(LINES.slip), 1.4, true);
    this.W.word(this.j.hip.x, this.j.hip.y - 50, '呲溜', 16);
  }

  /* 冰冻 */
  freeze() {
    if (this.dead || this.state === 'frozen' || this.state === 'draw') return;
    if (this.state === 'flat') this.popUp();
    const a = this.all.filter((p) => p.part && NAMES.includes(p.part));
    this.ice = [];
    for (let i = 0; i < a.length; i++) for (let k = i + 1; k < a.length; k++) this.ice.push(this.W.addStick(a[i], a[k], 'ice'));
    this.state = 'frozen';
    this.ctrl = 0;
    if (this.partner) this.endMeet();
    for (const n of ['lFo', 'rFo']) {
      const p = this.j[n];
      if (p && !p.pin && p.y > this.W.supportY(p.x, p.y - 12) - 20) p.pin = { x: p.x, y: p.y, by: 'ice', kind: 'ice' }; // 走路抬着的脚也算，免得自己倒了摔碎
    }
    this.iceT = 8;
    this.mood = 'scared'; this.moodT = 99;
    this.W.cb.say && this.W.cb.say(this, '', 0);
  }
  thaw() {
    this.removeIce();
    this.state = 'rag';
    this.ragT = 0.5;
    this.moodT = 0;
    this.shiver = 1.4;
    this.say(pick(LINES.thaw), 1.2, true);
  }
  /** 冻着的时候被水泡到：化开，掉一部分血 */
  melt() {
    this.removeIce();
    this.state = 'rag';
    this.ragT = 0.7;
    this.moodT = 0;
    this.W.word(this.j.chest ? this.j.chest.x : this.x, (this.j.chest ? this.j.chest.y : this.gy) - 30, '滋——', 16);
    sfx.water();
    this.hurt(this.W.vit.max * 0.15, 'melt', { quiet: true });
    this.say(pick(LINES.melt), 1.2, true);
  }
  shatter(cause) {
    const W = this.W;
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
      p.body = false; p.owner = null; p.corpse = true; p.sleep = 0;
      if (p.part === 'head') { p.px = p.x - rnd(-240, 240) * DT; p.py = p.y + rnd(160, 380) * DT; }
      if (p.pin && p.pin.by === 'ice') p.pin = null;
    }
    const c = this.j.chest || { x: this.x, y: this.gy - 50 };
    for (let i = 0; i < 16 * W.opts.particles; i++) W.shard(c.x + rnd(-22, 22), c.y + rnd(-44, 44), rnd(-320, 320), rnd(-420, 40), rnd(2, 6));
    W.prune();
    this.all = [];
    this.j = {};
    const V = W.vit;
    V.hp = Math.max(0, V.hp - V.max / 3);
    this.die(`${cause || 'fall'}:shatter`);
    if (V.hp <= 0) W.killAll(cause);
  }

  popUp() {
    for (const p of this.all) {
      p.flat = false;
      p.y -= rnd(1, 6);
      p.py = p.y + rnd(160, 360) * DT;
      p.px = p.x - rnd(-80, 80) * DT;
    }
    if (this.j.hip) this.W.puff(this.j.hip.x, this.W.ground, 10, { g: 215, life: 0.28, grow: 44 });
    sfx.pop();
    this.state = 'rag';
    this.ragT = 0.5;
  }

  poke(x, y) {
    if (this.state === 'frozen') { this.shatter('poke'); return; }
    if (!this.alive || this.state === 'draw') return;
    let best = null, bd = 1e9;
    for (const p of this.all) { const d = hyp(p.x - x, p.y - y); if (d < bd) { bd = d; best = p; } }
    if (best) { const dx = best.x - x; best.px -= (dx >= 0 ? 1 : -1) * 200 * DT; best.py += 110 * DT; }
    this.hurt(1.2, 'poke', { quiet: true });
    if (this.dead) return;
    this.setMood('angry', 0.8);
    this.say(pick(LINES.poke), 1);
    sfx.ouch(0.3);
    if (this.state === 'ctrl' && this.pain > 25) this.act = 'fist';
  }

  /** 铅笔：从他身上画出去，就多长一条软趴趴的东西 */
  addLimb(pts) {
    const W = this.W;
    if (!this.all.length || this.state === 'draw') return false;
    const start = pts[0];
    let root = null, bd = 12;
    for (const p of this.all) { const d = hyp(p.x - start.x, p.y - start.y) - p.r; if (d < bd) { bd = d; root = p; } }
    if (!root) return false;
    let prev = root;
    const step = Math.max(1, Math.round(pts.length / 12));
    for (let i = step; i < pts.length; i += step) {
      const q = pts[i];
      const p = W.addPt(q.x, q.y, { body: true, owner: this, group: this.id, im: 1.3 });
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
  released_() { this.held = false; if (this.state === 'rag') this.ragT = Math.max(this.ragT, 0.7); }

  /** 你选了什么道具，他会念叨一句 */
  reactTool(id) {
    if (!this.alive || this.state !== 'ctrl') return;
    const l = TOOL_LINES[id];
    if (l) { this.say(pick(l), 1.4, true); this.setMood(this.W.grudge > 35 ? 'scared' : 'wow', 0.8); }
  }
  /** 同伴死了 */
  mateDied(B) {
    if (!this.alive || this.state !== 'ctrl' || this.swimming) return;
    this.setMood('wow', 1.4);
    if (Math.random() < 0.7) this.say(pick(LINES.grief), 1.5, true);
    const hip = B.j.hip || B.j.chest || B.j.head;
    if (hip && Math.random() < 0.55 && !this.partner) {
      this.act = 'mourn'; this.actT = 5.5;
      this.mournX = clamp(hip.x + (this.x < hip.x ? -20 : 20), 20, this.W.w - 20);
      this.mournAt = hip.x; this.mournSaid = false;
    }
  }
  meet(other) {
    this.partner = other; this.meetT = 0.2; this.talkN = 0;
    this.lead = other.partner !== this;
    this.act = 'walk'; this.actT = 12; this.meetKind = null;
  }
  endMeet() {
    if (this.partner) { const o = this.partner; this.partner = null; if (o.partner === this) o.endMeet(); }
    if (['talk', 'five', 'fist', 'walk'].includes(this.act)) { this.act = 'idle'; this.actT = rnd(0.4, 1.2); }
  }

  /* ─────────────── 绳子、气球、钉子的情况 ─────────────── */
  updateBonds() {
    const W = this.W;
    this.tied = {}; this.anchors = []; this.liftU = 0; this.hoisted = false;
    const keyOf = (p) => { for (const [k, l] of Object.entries(LIMBS)) if (this.j[l.b] === p) return k; return null; };
    for (const r of W.ropes) {
      for (const i of [0, 1]) {
        const e = r.ends[i];
        if (!e || !e.p || e.p.owner !== this) continue;
        const other = r.ends[1 - i];
        let a = null;
        if (other && other.nail) a = other.nail;
        else if (other && other.p && (other.p.pin || (other.p.owner && other.p.owner !== this))) a = other.p;
        if (!a) continue;
        const key = keyOf(e.p);
        const anc = { x: a.x, y: a.y, L: r.L * 1.1 };
        this.anchors.push(anc);
        if (key) this.tied[key] = anc;
        // 钉子太高，够不着地就吊起来了
        if (this.gy - 69 - a.y > anc.L + 34) this.hoisted = true;
      }
    }
    for (const o of W.props) {
      if (o.t !== 'balloon' || !o.to || o.to.owner !== this) continue;
      this.liftU += o.s * o.s;
      const key = keyOf(o.to);
      if (key) this.tied[key] = { x: o.x, y: o.y, balloon: true };
    }
  }
  /** 被钉住或者被绳子拴在固定的东西上（鼠标硬拽会扯断） */
  bonded() {
    if (this.anchors.length) return true;
    return this.all.some((p) => p.pin && p.pin.by && p.pin.by !== 'ice');
  }
  /** 气球够力气：整个人慢慢飘起来，靠近绑绳的地方力气大，所以是吊在气球底下；到天花板就停 */
  applyLift(dt) {
    const W = this.W, G = 820;
    const tied = W.props.filter((o) => o.t === 'balloon' && o.to && o.to.owner === this);
    if (!tied.length) return;
    const top = tied.some((o) => o.y - 13 * o.s < 9);
    // 到顶了正好抵消重力，吊在那儿不动；没到顶就慢慢往上飘，气球越多越快
    const k = top ? 1 : Math.min(1.5, 1.14 + 0.09 * (this.liftU - 1.8));
    const weight = (p) => {
      let d = 1e9;
      for (const o of tied) d = Math.min(d, hyp(p.x - o.to.x, p.y - o.to.y));
      return 1 / (1 + (d / 26) * (d / 26));
    };
    let sum = 0;
    for (const p of this.all) sum += weight(p);
    const unit = G * k * dt * dt * this.all.length / (sum || 1);
    for (const p of this.all) {
      if (p.pin || p.hole || !p.im) continue;
      p.y -= unit * weight(p);
      p.py += (p.y - p.py) * 0.03; // 空气阻力，别升得太猛，到顶也不会上下乱晃
    }
  }

  /** 挣扎久了挣脱一处 */
  freeOne() {
    const W = this.W, list = [];
    for (const p of this.all) if (p.pin && p.pin.kind === 'nail') list.push(() => {
      const o = W.props.find((q) => q.id === p.pin.by);
      p.pin = null; p.sleep = 0;
      if (o) { o.cd = 3; o.direct = false; o.caught = Math.max(0, (o.caught || 1) - 1); }
    });
    for (const r of W.ropes) r.ends.forEach((e, i) => { if (e && e.p && e.p.owner === this && this.anchors.length) list.push(() => W.untie(r, i)); });
    for (const o of W.props) if (o.t === 'balloon' && o.to && o.to.owner === this) list.push(() => { o.to = null; o.cd = 2; });
    if (!list.length) return false;
    pick(list)();
    sfx.pop();
    if (this.j.chest) W.word(this.j.chest.x, this.j.chest.y - 24, '挣脱！', 15);
    this.say(pick(LINES.free), 1.2, true);
    this.setMood('smug', 1);
    return true;
  }

  /* ─────────────── 每帧 ─────────────── */
  mobility() {
    const j = this.j, b = this.broken, tied = this.tied;
    const leg = (k, l) => (j[l.a] && j[l.b] && !b[k] && !tied[k] ? 1 : 0);
    const legs = leg('lLeg', LIMBS.lLeg) + leg('rLeg', LIMBS.rLeg);
    const arms = leg('lArm', LIMBS.lArm) + leg('rArm', LIMBS.rArm);
    if (legs === 2) return 'walk';
    if (legs === 1) return 'hop';
    return arms ? 'crawl' : 'worm';
  }

  stuck() {
    if (this.held) return true;
    if (this.liftU >= 1.8 || this.hoisted) return true;
    for (const p of this.all) if (p.pin || p.trap || p.hole) return true;
    return false;
  }

  update(dt) {
    if (this.dead || this.state === 'none') return;
    this.t += dt;
    this.age += dt;
    this.hitCd -= dt; this.sayCd -= dt; this.moodT -= dt; this.dodgeCd -= dt;
    this.causeT -= dt;
    if (this.causeT <= 0) this.cause = 'fall';
    this.pain = Math.max(0, this.pain - dt * 7);
    this.fear = Math.max(0, this.fear - dt * 12);
    this.dizzy = Math.max(0, (this.dizzy || 0) - dt);
    this.xray = Math.max(0, (this.xray || 0) - dt);
    this.shiver = Math.max(0, (this.shiver || 0) - dt);
    this.lump = Math.max(0, this.lump - dt * 0.05);
    this.winT = (this.winT || 0) - dt;
    this.tearCd = (this.tearCd || 0) - dt;
    const W = this.W;
    if (this.state !== 'draw') this.updateBonds();
    if (this.frameMax) {
      // 一个身子撞上去，头、胸、胯、四肢是前后几帧陆续碰到的：0.25 秒内只算最重的那一下
      if (this.winT <= 0) { this.winT = 0.25; this.winD = 0; }
      const extra = this.frameMax - this.winD;
      this.frameMax = 0;
      if (extra > 1) {
        this.winD += extra;
        this.hurt(extra, this.causeT > 0 ? this.cause : 'fall', { quiet: extra < 5 });
        if (this.dead) return;
      }
    }

    // 断口喷墨
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
    if (this.xray > 0) for (const p of this.all) { if (!p.pin) { p.x += rnd(-1.8, 1.8); p.y += rnd(-1.8, 1.8); } }
    // 脑袋压扁的程度
    const hd = this.j.head;
    const sq = (hd && hd.trap) || this.state === 'flat' || (hd && hd.flat) ? 1 : 0;
    this.squash = lerp(this.squash, sq, Math.min(1, dt * (sq ? 22 : 7)));

    if (this.state !== 'draw') { this.updateWater(dt); if (this.dead) return; }

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
        if (this.flatT <= 0) { this.popUp(); this.say('噗', 0.8, true); }
        break;
      default: break;
    }
  }

  /** 水：头在水下就憋气，憋不住开始掉血；冻着遇水会化 */
  updateWater(dt) {
    const W = this.W, hip = this.j.hip, head = this.j.head;
    if (!hip) return;
    const wt = W.waterAt(hip.x, hip.y);
    this.wetNow = !!wt;
    this.level = wt ? wt.level : null;
    if (this.state === 'frozen') {
      for (const p of this.all) if (W.waterAt(p.x, p.y)) { this.melt(); return; }
    }
    // 水没过胸口才游；只剩脑袋和躯干的游不动
    this.swimming = !!(wt && wt.level < hip.y - 15 && this.mob !== 'worm' && !this.stuck());
    this.headUnder = !!(head && W.waterAt(head.x, head.y - 3));
    if (wt && !this.wetSaid && this.state === 'ctrl') { this.wetSaid = true; this.say(this.line('water'), 1.3, true); }
    if (!wt) this.wetSaid = false;
    if (this.headUnder) {
      this.air = Math.max(0, this.air - dt / 9);
      this.bub = (this.bub || 0) - dt;
      if (this.bub <= 0) {
        this.bub = this.air > 0.25 ? 0.5 : 0.16;
        W.bubble(head.x + rnd(-4, 4), head.y - 6);
        if (Math.random() < 0.2) sfx.bubble();
      }
      if (this.air < 0.5) this.setMood('scared', 0.4);
      if (this.air <= 0) {
        this.drownT = (this.drownT || 0) - dt;
        this.hp -= W.vit.max * 0.06 * dt;
        this.cause = 'water'; this.causeT = 2;
        W.focus = this;
        if (this.drownT <= 0) { this.drownT = 1.6; this.say(pick(LINES.bubble), 1, true); }
        if (this.hp <= 0) { this.hp = 0; W.killAll('water'); }
      }
    } else {
      this.air = Math.min(1, this.air + dt / 1.6);
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
      this.act = 'idle'; this.actT = rnd(0.8, 1.8);
      this.say(this.num > 1 && Math.random() < 0.2 ? `我是第 ${this.num} 个` : this.line('hello'), 1.6, true);
      this.setMood(this.kind === 'office' ? 'bored' : 'happy', 1.2);
      this.W.cb.born && this.W.cb.born(this);
    }
  }

  updRag(dt) {
    this.ragT -= dt;
    const st = this.stuck();
    if (this.all.length === 0) return;
    let sp = 0;
    for (const p of this.all) sp += hyp(p.x - p.px, p.y - p.py) / DT;
    sp /= this.all.length;
    if (st) {
      this.ragT = Math.max(this.ragT, 0.4); // 一松开还在半空，要落地才爬得起来
      // 动弹不得：挣扎
      this.strug = (this.strug || 0) - dt;
      if (this.strug <= 0) {
        this.strug = rnd(0.25, 0.6);
        for (const n of ['lHa', 'rHa', 'lFo', 'rFo']) {
          const p = this.j[n];
          if (p && !p.pin && !p.trap && p.im !== 0 && !p.hole) { p.px += rnd(-170, 170) * DT; p.py += rnd(0, 260) * DT; }
        }
        if (this.j.head && this.j.head.trap) this.say(pick(LINES.anvil), 1.2);
        else if (Math.random() < 0.3) this.say(this.liftU >= 1.8 ? pick(LINES.strap) : this.hoisted ? pick(LINES.rope) : pick(LINES.nail), 1.2);
      }
      this.pinT = (this.pinT || 0) + dt;
      // 钉板扎太久自己会下来
      if (this.pinT > 4) {
        for (const p of this.all) if (p.pin && p.pin.kind === 'spikes') { p.pin = null; p.sleep = 0; }
      }
      // 钉子、绳子、气球：一直挣扎才挣得开
      if (!this.held) {
        this.strain += dt * (this.kind === 'sharp' ? 1.3 : 1);
        if (this.strain > this.strainAt) {
          this.strain = 0; this.strainAt = rnd(9, 18);
          this.freeOne();
        }
      }
      return;
    }
    this.pinT = 0;
    if ((this.ragT <= 0 && sp < 46) || this.ragT < -2.4) this.startGetup();
  }

  startGetup() {
    const hip = this.j.hip, ch = this.j.chest, W = this.W;
    if (!hip) return;
    this.mob = this.mobility();
    this.x = clamp(hip.x, 22, W.w - 22);
    if (this.swimming) { this.state = 'ctrl'; this.ctrl = 0.2; this.act = 'swim'; this.actT = 1; this.T = {}; return; }
    this.state = 'getup';
    this.gT = 0;
    this.gDur = 0.55 + this.pain * 0.007 + (this.dizzy > 0 ? 0.35 : 0);
    this.gy = W.support(this.x, hip.y - 10, this.id).y;
    this.g0y = hip.y;
    this.g0l = ch ? Math.atan2(ch.x - hip.x, hip.y - ch.y) : 0;
    this.g0l = clamp(this.g0l, -1.3, 1.3);
    if (this.j.head && this.j.neck && this.g0l !== 0) this.dir = this.g0l > 0 ? 1 : -1;
    this.T = {};
    this.act = 'idle';
    this.getupDust = this.pain > 8;
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
      // 爬起来先拍拍灰或者揉揉伤口
      if (this.getupDust && this.mob === 'walk') { this.act = this.pain > 30 ? 'rub' : 'dust'; this.actT = rnd(0.8, 1.4); }
      else { this.act = 'idle'; this.actT = this.pain > 30 ? 0.4 : rnd(0.4, 1); }
    }
  }

  /* ─────────────── 想事情 ─────────────── */
  think(dt) {
    const W = this.W, hip = this.j.hip;
    if (!hip) return;
    this.mob = this.mobility();
    if (this.ctrl < 1) this.ctrl = Math.min(1, this.ctrl + dt * 2.5);
    this.actT -= dt;
    if (this.liftU >= 1.8 || this.hoisted) { this.hoistBump(); this.knock(1); return; }
    // 正在做的躲避动作不打断
    if (this.act === 'dive' || this.act === 'duck' || this.act === 'jump') {
      if (this.actT <= 0) {
        if (this.dodged) { this.dodged = false; this.setMood('smug', 1); if (Math.random() < 0.5) this.say(this.line('dodge'), 1); }
        this.act = 'idle'; this.actT = rnd(0.2, 0.6);
      }
      return;
    }
    if (this.swimming) {
      if (this.act !== 'swim') { this.act = 'swim'; this.actT = rnd(1, 3); if (this.partner) this.endMeet(); }
      if (this.actT <= 0) { this.actT = rnd(1.5, 3.5); this.swimDir = Math.random() < 0.5 ? -1 : 1; this.dir = this.swimDir; }
      return;
    }
    if (this.act === 'swim') { this.act = 'idle'; this.actT = 0.4; this.gy = W.support(this.x, hip.y, this.id).y; }

    if (this.dodgeCheck(dt)) return;
    if (this.gapeO) return;

    const th = W.threatNear(hip.x);
    if (th) {
      this.fear = Math.min(100, this.fear + dt * (th.d < 60 ? 90 : 45));
      const dirAway = hip.x < th.x ? -1 : 1;
      const edge = dirAway < 0 ? hip.x - 26 : W.w - 26 - hip.x;
      const wasScared = this.act === 'run' || this.act === 'cower';
      if (!wasScared) { this.say(pick(LINES[th.kind] || LINES.scared), 1.2, true); if (this.partner) this.endMeet(); }
      if (this.mob !== 'walk' && this.mob !== 'hop') { this.act = 'move'; this.dir = dirAway; this.actT = 0.4; return; }
      this.act = edge < 14 ? 'cower' : 'run';
      this.dir = dirAway;
      this.actT = 0.4;
      return;
    }
    if (this.partner) { this.doMeet(dt); return; }
    if (this.act === 'mourn') { this.doMourn(dt); return; }
    if (this.actT > 0) return;
    this.choose();
  }

  /** 看见东西过来：弯腰、跳、扑开、往后退。躲不躲得开看本事 */
  dodgeCheck(dt) {
    const W = this.W, hip = this.j.hip, head = this.j.head;
    this.gapeO = null;
    // 头上掉东西：扑开，或者愣住
    for (const o of W.props) {
      if (o.t !== 'anvil' || o.rest || o.held || (o.vy || 0) <= 0) continue;
      if (Math.abs(o.x - hip.x) < 28 * o.s + 12 && o.y < hip.y - 30) {
        if (!this.seen.has(o)) {
          this.seen.add(o);
          this.say(pick(LINES.gape), 0.9, true);
          if (Math.random() < this.skill) {
            const side = hip.x < o.x ? -1 : 1, room = side < 0 ? hip.x : W.w - hip.x;
            this.dive(room > 50 ? side : -side);
            return true;
          }
        }
        this.gapeO = o;
        this.act = 'gape';
        this.fear = Math.min(100, this.fear + dt * 60);
        return false;
      }
    }
    // 东西横着飞过来（被甩过来的铁砧之类）
    for (const o of W.props) {
      if (o.held || o.t === 'nail' || o.t === 'balloon' || o.t === 'hole' || o.t === 'roller' || o.t === 'spikes') continue;
      const v = hyp(o.vx || 0, o.vy || 0);
      if (v < 220 || this.seen.has(o)) continue;
      if (Math.abs(o.x - hip.x) > 100 || (o.vx || 0) * (hip.x - o.x) < 0) continue;
      this.seen.add(o);
      if (Math.random() < this.skill) { this.evade(o.y); return true; }
    }
    // 橡皮：高的弯腰，低的跳，太近就往后退
    if (this.dodgeCd <= 0 && W.eraserT) {
      const E = W.eraserT, dx = Math.abs(E.x - hip.x);
      if (dx < 70) {
        this.dodgeCd = 0.9;
        if (Math.random() < this.skill) { this.evade(E.y, E.x); return true; }
        this.setMood('wow', 0.5);
      }
    }
    // 鼠标：靠近了往后退
    const C = W.cursor;
    if (this.dodgeCd <= 0 && C.on && W.t - C.moved < 0.35 && !(W.hand && (W.hand.p || W.hand.o)) && head) {
      const dx = Math.abs(C.x - hip.x);
      if (dx < 58 && C.y < hip.y + 30 && C.y > head.y - 40) {
        this.dodgeCd = 1.1;
        if (Math.random() < this.skill) {
          this.dir = C.x > hip.x ? 1 : -1;     // 脸朝着鼠标往后退
          this.act = 'back'; this.actT = 0.75;
          this.fear = Math.min(100, this.fear + 16);
          if (Math.random() < (W.grudge > 35 ? 0.6 : 0.25)) this.say(pick(W.grudge > 35 ? PLINES[this.kind].grudge : LINES.scared), 1);
          return true;
        }
      }
    }
    if (this.act === 'back') {
      if (this.actT > 0) return true;
      this.act = 'idle'; this.actT = 0.5;
    }
    return false;
  }
  /** 东西在头那么高就弯腰，在脚那么高就跳，不高不低就后退 */
  evade(y, x) {
    const hip = this.j.hip, ch = this.j.chest;
    if (y < (ch ? ch.y + 2 : hip.y - 15)) { this.act = 'duck'; this.actT = 0.6; this.dodged = true; }
    else if (y > hip.y + 6) { this.act = 'jump'; this.actT = 0.5; this.jT = 0; this.dodged = true; }
    else {
      this.dir = (x ?? hip.x + 1) > hip.x ? 1 : -1;
      this.act = 'back'; this.actT = 0.75;
    }
    this.fear = Math.min(100, this.fear + 14);
    if (this.partner) this.endMeet();
  }
  dive(side) {
    if (this.partner) this.endMeet();
    this.act = 'dive'; this.actT = 0.46;
    this.dir = side; this.dodged = true;
    this.fear = Math.min(100, this.fear + 20);
    sfx.scratch();
  }

  doMeet(dt) {
    const o = this.partner;
    if (!o || !o.alive || o.state !== 'ctrl' || o.partner !== this || this.actT <= 0) { this.endMeet(); return; }
    const d = o.x - this.x;
    this.dir = d >= 0 ? 1 : -1;
    if (Math.abs(d) > 42) {
      if (this.act !== 'walk') this.act = 'walk';
      this.tx = o.x - this.dir * 36;
      return;
    }
    if (this.act === 'walk') this.act = 'talk';
    if (!this.lead) return;
    this.meetT -= dt;
    if (this.meetT > 0) return;
    if (!this.meetKind) {
      const r = Math.random();
      const friendly = this.kind === 'sunny' || o.kind === 'sunny';
      this.meetKind = friendly && r < 0.35 ? 'five' : r > 0.8 ? 'argue' : 'chat';
    }
    const spk = this.talkN % 2 ? o : this;
    if (this.meetKind === 'five') {
      if (this.talkN === 0) { this.act = 'five'; o.act = 'five'; this.say(this.kind === 'sunny' ? '来！击掌！' : '……来吧', 1.1, true); this.meetT = 0.9; this.talkN = 1; }
      else { this.W.word((this.x + o.x) / 2, this.gy - 96, '啪！', 15); sfx.clap(); this.setMood('joy', 1); o.setMood('joy', 1); this.endMeet(); }
      return;
    }
    if (this.meetKind === 'argue') {
      if (this.talkN >= 4) { this.endMeet(); return; }
      spk.act = 'fist';
      spk.say(pick(ARGUE), 1.3, true);
      spk.setMood('angry', 1.4);
      this.meetT = 1.5; this.talkN++;
      return;
    }
    if (this.talkN >= 4) { this.endMeet(); return; }
    spk.act = 'talk'; (spk === this ? o : this).act = 'talk';
    spk.talking = 1.3;
    spk.say(pick(PLINES[spk.kind].chat), 1.4, true);
    this.meetT = 1.7; this.talkN++;
  }

  doMourn(dt) {
    if (this.actT <= 0) { this.act = 'idle'; this.actT = rnd(0.5, 1.2); return; }
    const d = this.mournX - this.x;
    if (Math.abs(d) > 4) { this.dir = d >= 0 ? 1 : -1; this.tx = this.mournX; return; }
    this.dir = this.mournAt >= this.x ? 1 : -1;
    if (!this.mournSaid) { this.mournSaid = true; this.say(pick(LINES.griefNear), 1.6, true); this.setMood('sad', 3); }
    // 拉一拉尸体
    this.tug = (this.tug || 0) - dt;
    if (this.tug <= 0) {
      this.tug = 0.7;
      for (const p of this.W.pts) {
        if (!p.corpse || p.owner || Math.abs(p.x - this.mournAt) > 26) continue;
        p.sleep = 0; p.px += this.dir * 26 * DT; p.py += 18 * DT;
      }
    }
  }

  choose() {
    const W = this.W, hip = this.j.hip, k = this.kind;
    if (this.mob === 'crawl' || this.mob === 'worm') {
      if (this.act === 'move') { this.act = 'rest'; this.actT = rnd(1, 2.4); if (this.hpf < 0.4) this.say(this.line('low'), 1.5); } else {
        this.act = 'move'; this.actT = rnd(1.6, 3.4);
        if (hip.x < 40) this.dir = 1; else if (hip.x > W.w - 40) this.dir = -1; else if (Math.random() < 0.35) this.dir = -this.dir;
      }
      return;
    }
    if (this.hpf < 0.28 && Math.random() < 0.5) { this.act = 'beg'; this.actT = rnd(1.6, 3); this.dir = hip.x > W.w / 2 ? -1 : 1; this.say(this.line('low'), 1.6); return; }
    if (this.pain > 28 && Math.random() < 0.6) {
      if (k === 'office' || Math.random() < 0.3) { this.act = 'rub'; this.actT = rnd(1.1, 2); this.say(this.line('hurt'), 1.1); }
      else { this.act = 'fist'; this.actT = rnd(1.1, 2); this.say(pick(LINES.angry), 1.3); }
      return;
    }
    if (W.grudge > 45 && Math.random() < 0.18) {
      this.act = Math.random() < 0.5 ? 'cower' : 'fist'; this.actT = rnd(1, 2);
      this.say(pick(Math.random() < 0.6 ? PLINES[k].grudge : LINES.grudge), 1.5);
      return;
    }
    // 每种性格爱干的事不一样
    const TABLE = {
      office: [['walk', 3], ['phone', 3], ['idle', 2], ['yawn', 1.2], ['sit', 1], ['stretch', 0.6], ['scratch', 0.5]],
      sunny: [['walk', 4], ['wave', 2], ['dance', 2], ['idle', 0.5], ['stretch', 0.6], ['belly', 0.7], ['sit', 0.4]],
      sharp: [['walk', 5], ['scan', 2.2], ['stretch', 1.6], ['scratch', 0.8], ['idle', 0.6], ['dust', 0.6]],
    };
    const tb = TABLE[k]; let sum = 0; for (const e of tb) sum += e[1];
    let r = Math.random() * sum, act = 'idle';
    for (const e of tb) { r -= e[1]; if (r <= 0) { act = e[0]; break; } }
    this.act = act;
    if (act === 'walk') {
      // 他不知道地上那些东西是干什么的，偏偏爱往那儿走
      const traps = W.props.filter((o) => (o.t === 'peel' || o.t === 'spring') && o.rest);
      if (traps.length && Math.random() < 0.55) this.tx = clamp(traps[(Math.random() * traps.length) | 0].x, 26, W.w - 26);
      else this.tx = rnd(30, W.w - 30);
      this.dir = this.tx > hip.x ? 1 : -1;
      this.actT = 8;
      return;
    }
    this.actT = { idle: rnd(1.2, 2.6), phone: rnd(2.4, 4.4), scratch: rnd(1, 1.8), wave: rnd(1, 1.8), sit: rnd(2.5, 5), yawn: 1.6, stretch: 1.8, dance: rnd(2.4, 4), belly: 1.8, dust: 1.2, scan: rnd(1.4, 2.4) }[act] || 1.5;
    if (Math.random() < 0.4 * CHATTY[k]) this.say(this.line('idle'), 1.7);
    if (act === 'dance') this.setMood('joy', this.actT);
    if (act === 'yawn') { this.setMood('yawn', 1.4); sfx.yawn(); }
    if (act === 'belly') this.say('好饿', 1.1);
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
    if (!this.j[l.a] || !this.j[l.b] || this.broken[k] || this.tied[k]) return;
    const r = ik(T.hip[0], T.hip[1], fx, fy, LEN.th, LEN.sh, bend ?? -this.dir);
    T[l.a] = r.mid; T[l.b] = r.end;
  }
  arm(side, hx, hy, bend) {
    const k = side === 'l' ? 'lArm' : 'rArm', l = LIMBS[k], T = this.T;
    if (!this.j[l.a] || !this.j[l.b] || this.broken[k]) return;
    const a = this.tied[k];
    if (a) {
      // 绑着的那只手朝绳子、气球那边抬
      const nx = T.neck[0], ny = T.neck[1], dx = a.x - nx, dy = a.y - ny, d = hyp(dx, dy) || 1, m = Math.min(29, d);
      hx = nx + dx / d * m; hy = ny + dy / d * m;
    }
    const r = ik(T.neck[0], T.neck[1], hx, hy, LEN.up, LEN.lo, bend ?? this.dir);
    T[l.a] = r.mid; T[l.b] = r.end;
  }
  /** 只有一条好腿时，用那条站 */
  hopLeg(x, fy) {
    const ok = (k, l) => this.j[l.a] && this.j[l.b] && !this.broken[k] && !this.tied[k];
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
  /** 游泳：脑袋露在水面，手脚划水 */
  poseSwim(dt) {
    const W = this.W, t = this.t, d = this.dir || 1;
    this.T = {};
    const level = this.level ?? this.gy;
    this.phase += dt * 7;
    this.x += (this.act === 'swim' && this.swimDir ? this.swimDir : 0) * 24 * dt;
    if (this.x < 22) { this.x = 22; this.swimDir = 1; this.dir = 1; }
    if (this.x > W.w - 22) { this.x = W.w - 22; this.swimDir = -1; this.dir = -1; }
    const hip = this.j.hip;
    if (hip && Math.abs(hip.x - this.x) > 16) { this.x = hip.x; this.swimDir = -(this.swimDir || 1); this.dir = this.swimDir; }
    const bob = Math.sin(t * 3) * 1.6;
    const y = Math.max(level + 34 + bob, 45);
    this.gy = y + STAND; // 爬上岸的时候从这里接着算
    this.torso(this.x, y, d * 0.16, 0);
    const n = this.T.neck, a = this.phase;
    this.arm('l', n[0] - 15 - Math.cos(a) * 7, n[1] + 6 + Math.sin(a) * 7, 1);
    this.arm('r', n[0] + 15 + Math.cos(a) * 7, n[1] + 6 - Math.sin(a) * 7, -1);
    this.leg('l', this.x - 8 + Math.sin(a * 1.2) * 8, y + 36);
    this.leg('r', this.x + 8 - Math.sin(a * 1.2) * 8, y + 36);
  }

  applyLeash() {
    // 被绳子拴着走不远
    for (const a of this.anchors) {
      const dy = Math.abs(this.gy - 69 - a.y), R = a.L + 34;
      if (dy >= R) continue;
      const mx = Math.sqrt(R * R - dy * dy), dx = this.x - a.x;
      if (Math.abs(dx) > mx) {
        this.x = a.x + Math.sign(dx) * mx;
        if (this.act === 'walk' || this.act === 'run') {
          this.dir = -this.dir; this.tx = clamp(this.x + this.dir * rnd(30, 90), 26, this.W.w - 26);
          if (Math.random() < 0.3) this.say(pick(LINES.rope), 1);
        }
      }
    }
  }

  pose(dt) {
    const W = this.W;
    let d = this.dir;
    this.T = {};
    const hip = this.j.hip;
    if (this.swimming && this.mob !== 'worm') { this.poseSwim(dt); return; }
    // 脚下的高度（走到铅笔线、绳子上会跟着走）
    const sp = W.support(this.x, this.gy - 6, this.id);
    const want = sp.y;
    this.onRope = sp.rope;
    if (want - this.gy > 26) { this.knock(0.6); return; } // 踩空
    this.gy = lerp(this.gy, want, Math.min(1, dt * 14));
    const g = this.gy, foot = g - 2;
    const t = this.t;

    // 被挡住了（撞上铅笔线）
    if (Math.abs(hip.x - this.x) > 18 && this.mob === 'walk' && !this.anchors.length) {
      if (this.act === 'run') {
        W.word(hip.x, hip.y - 50, '嘭', 16); sfx.thud(0.9);
        this.hurt(8, 'wall');
        if (this.dead) return;
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
      const spd = this.mob === 'crawl' ? 26 : 13;
      if (moving) {
        this.x += d * spd * dt;
        this.phase += dt * (this.mob === 'crawl' ? 5 : 7);
        if (this.x < 16 || this.x > W.w - 50) this.dir = -d;
        this.x = clamp(this.x, 14, W.w - 14);
      }
      this.poseLow(this.phase, moving);
      return;
    }

    const hop = this.mob === 'hop';
    let act = this.act;
    if (act === 'move' || act === 'rest') act = 'idle';
    if (act === 'mourn') act = Math.abs(this.mournX - this.x) > 4 ? 'walk' : 'kneel';
    const wade = this.wetNow ? 0.6 : 1;

    if (act === 'walk' || act === 'run') {
      const run = act === 'run';
      if (!run && W.obstacleAhead(this.x, d, g)) { this.dir = -d; this.tx = clamp(this.x - d * rnd(60, 180), 26, W.w - 26); return; }
      // 走钢丝：快到头了小心转身
      if (this.onRope) {
        const s2 = W.support(this.x + d * 14, g - 6, this.id);
        if (s2.y - g > 26 && Math.random() > 0.006) { this.dir = -d; d = -d; this.tx = clamp(this.x + d * rnd(40, 120), 26, W.w - 26); }
      }
      const hpK = this.hpf < 0.35 ? 0.72 : 1;
      if (hop) {
        const spd = (run ? 84 : 42) * wade;
        this.x += d * spd * dt;
        this.phase += dt * (run ? 12 : 7.5);
        const h = Math.abs(Math.sin(this.phase));
        const y = g - STAND - h * 13;
        this.torso(this.x, y, d * 0.1);
        this.hopLeg(this.x + d * 2, Math.min(foot, y + 40));
        const n = this.T.neck;
        this.arm('l', n[0] - 18, n[1] + 10 - h * 9, 1);
        this.arm('r', n[0] + 18, n[1] + 10 - h * 9, -1);
      } else {
        const om = (run ? 11.5 : 7.5) * hpK * (run ? 1 : SPEED[this.kind]) * wade, stride = run ? 21 : 13, lift = run ? 14 : 7;
        const spd = om * stride * 0.62 * (this.onRope ? 0.5 : 1);
        this.x += d * spd * dt;
        this.phase += om * dt * (this.onRope ? 0.5 : 1);
        const a = this.phase, b = a + Math.PI;
        const bob = Math.abs(Math.sin(a)) * (run ? 2.6 : 1.5);
        const y = g - (run ? STAND - 3 : STAND) - bob;
        const rs = this.onRope ? 0.55 : 1;
        this.torso(this.x, y, d * (run ? 0.3 : 0.07) + (this.onRope ? Math.sin(t * 5) * 0.14 : 0), run ? -d * 0.15 : 0);
        this.leg('l', this.x + d * stride * rs * Math.cos(a), foot - lift * Math.max(0, -Math.sin(a)));
        this.leg('r', this.x + d * stride * rs * Math.cos(b), foot - lift * Math.max(0, -Math.sin(b)));
        const n = this.T.neck;
        if (this.onRope) {
          // 张开手臂保持平衡
          this.arm('l', n[0] - 28, n[1] + 2 + Math.sin(t * 5) * 6, 1);
          this.arm('r', n[0] + 28, n[1] + 2 - Math.sin(t * 5) * 6, -1);
        } else if (run) {
          this.arm('l', n[0] - d * 8 + Math.sin(a * 1.3) * 9, n[1] - 15 + Math.cos(a) * 7, -d);
          this.arm('r', n[0] + d * 10 + Math.cos(a * 1.1) * 9, n[1] - 17 + Math.sin(a) * 7, -d);
        } else {
          this.arm('l', n[0] + d * 11 * Math.cos(b), n[1] + 27 - Math.abs(Math.cos(b)) * 3);
          this.arm('r', n[0] + d * 11 * Math.cos(a), n[1] + 27 - Math.abs(Math.cos(a)) * 3);
        }
      }
      if (this.x < 24) { this.x = 24; this.dir = 1; if (act === 'walk') this.tx = rnd(90, W.w - 30); }
      if (this.x > W.w - 24) { this.x = W.w - 24; this.dir = -1; if (act === 'walk') this.tx = rnd(30, W.w - 90); }
      this.applyLeash();
      if (this.act === 'walk' && !this.partner && Math.abs(this.tx - this.x) < 7) { this.act = 'idle'; this.actT = rnd(0.5, 1.8); }
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
      case 'dive': {
        // 侧身扑开：身子放低朝一边窜出去
        const u = 1 - clamp(this.actT / 0.46, 0, 1);
        this.x += d * 215 * (1 - u * 0.6) * dt;
        this.x = clamp(this.x, 18, W.w - 18);
        const y = g - 26 + Math.sin(u * Math.PI) * -8;
        this.torso(this.x, y, d * 1.05);
        const n = this.T.neck;
        this.arm('l', n[0] + d * 26, n[1] + 3, -d);
        this.arm('r', n[0] + d * 24, n[1] + 8, -d);
        this.leg('l', this.x - d * 26, foot - 2);
        this.leg('r', this.x - d * 18, foot, -d);
        break;
      }
      case 'duck': {
        // 弯腰：脑袋低到胯那么高，手护着头
        const u = clamp(1 - this.actT / 0.6, 0, 1), k = u < 0.2 ? u / 0.2 : u > 0.75 ? (1 - u) / 0.25 : 1;
        this.torso(this.x, g - STAND + 7 * k, d * 1.5 * smooth(k));
        this.leg('l', this.x - 9, foot); this.leg('r', this.x + 9, foot);
        const h = this.T.head;
        this.arm('l', h[0] - 6, h[1] - 6, -d);
        this.arm('r', h[0] + 6, h[1] - 6, -d);
        break;
      }
      case 'jump': {
        this.jT = (this.jT || 0) + dt;
        const u = clamp(this.jT / 0.5, 0, 1), h = Math.sin(u * Math.PI) * 44;
        this.torso(this.x, g - STAND - h, 0);
        const y = this.T.hip[1];
        this.leg('l', this.x - 10, Math.min(foot, y + 22));
        this.leg('r', this.x + 10, Math.min(foot, y + 22));
        const n = this.T.neck;
        this.arm('l', n[0] - 13, n[1] - 14); this.arm('r', n[0] + 13, n[1] - 14);
        break;
      }
      case 'back': {
        // 脸朝着对方往后退
        this.x -= d * 88 * dt;
        this.x = clamp(this.x, 22, W.w - 22);
        this.phase += dt * 9;
        const a = this.phase;
        this.torso(this.x, g - STAND + 3, -d * 0.2);
        this.leg('l', this.x + 9 * Math.cos(a), foot - 5 * Math.max(0, -Math.sin(a)));
        this.leg('r', this.x - 9 * Math.cos(a), foot - 5 * Math.max(0, Math.sin(a)));
        const n = this.T.neck;
        this.arm('l', n[0] + d * 15, n[1] + 6, d);
        this.arm('r', n[0] + d * 13, n[1] + 2, d);
        this.applyLeash();
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
      case 'kneel': {
        // 跪在同伴旁边，伸手去拉他
        const sway = Math.sin(t * 4) * 0.06;
        this.torso(this.x, g - 21, d * (0.45 + sway));
        this.leg('l', this.x - d * 18, foot, -d);
        this.leg('r', this.x - d * 14, foot, -d);
        const n = this.T.neck;
        this.arm('l', n[0] + d * 22, n[1] + 14 + Math.sin(t * 5) * 3, d);
        this.arm('r', n[0] + d * 18, n[1] + 18 - Math.sin(t * 5) * 3, d);
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
      case 'stretch': {
        // 伸懒腰
        const u = clamp(1 - this.actT / 1.8, 0, 1), k = Math.sin(u * Math.PI);
        this.torso(this.x, g - STAND - k * 2, -d * 0.12 * k);
        if (hop) this.hopLeg(this.x, foot); else { this.leg('l', this.x - 9, foot); this.leg('r', this.x + 9, foot); }
        const n = this.T.neck;
        this.arm('l', n[0] - 8 - k * 6, n[1] + 20 - k * 48);
        this.arm('r', n[0] + 8 + k * 6, n[1] + 20 - k * 48);
        break;
      }
      case 'yawn': {
        // 打哈欠：头往后仰，一只手捂嘴
        const u = clamp(1 - this.actT / 1.6, 0, 1), k = Math.sin(u * Math.PI);
        this.torso(this.x, g - STAND + breathe, 0, -d * 0.3 * k);
        if (hop) this.hopLeg(this.x, foot); else { this.leg('l', this.x - 9, foot); this.leg('r', this.x + 9, foot); }
        const n = this.T.neck, h = this.T.head;
        this.arm('l', n[0] - d * 6, n[1] + 27);
        this.arm('r', h[0] + d * 8, h[1] + 3, d);
        break;
      }
      case 'dance': {
        const a = t * 9, sx = Math.sin(a) * 6, h = Math.abs(Math.cos(a)) * 4;
        this.torso(this.x + sx, g - STAND - h, Math.sin(a) * 0.18);
        if (hop) this.hopLeg(this.x, foot); else {
          this.leg('l', this.x - 10 + sx * 0.3, foot - Math.max(0, Math.sin(a)) * 6);
          this.leg('r', this.x + 10 + sx * 0.3, foot - Math.max(0, -Math.sin(a)) * 6);
        }
        const n = this.T.neck;
        this.arm('l', n[0] - 16, n[1] - 8 + Math.sin(a) * 15, 1);
        this.arm('r', n[0] + 16, n[1] - 8 - Math.sin(a) * 15, -1);
        break;
      }
      case 'belly': {
        // 揉肚子
        stand();
        const n = this.T.neck, c = this.T.chest;
        this.arm('l', c[0] + d * 7 + Math.sin(t * 9) * 3, c[1] + 6, d);
        this.arm('r', n[0] + d * 3, n[1] + 27);
        break;
      }
      case 'dust': {
        // 拍拍身上的灰
        const a = t * 13;
        this.torso(this.x, g - STAND + 3, d * 0.16);
        if (hop) this.hopLeg(this.x, foot); else { this.leg('l', this.x - 9, foot); this.leg('r', this.x + 9, foot); }
        const h = this.T.hip;
        this.arm('l', h[0] + d * 10, h[1] - 4 + Math.sin(a) * 6, d);
        this.arm('r', h[0] + d * 13, h[1] + 2 - Math.sin(a) * 6, d);
        break;
      }
      case 'rub': {
        // 揉伤口
        stand();
        const h = this.T.head, n = this.T.neck;
        this.arm('l', h[0] - d * 2 + Math.sin(t * 12) * 2, h[1] - 7 + Math.cos(t * 12), -d);
        this.arm('r', n[0] + d * 3, n[1] + 27);
        break;
      }
      case 'scan': {
        // 东张西望
        stand();
        this.dir = Math.sin(t * 2.4) > 0 ? 1 : -1;
        const n = this.T.neck;
        this.arm('l', n[0] - 8, n[1] + 24); this.arm('r', n[0] + 8, n[1] + 24);
        break;
      }
      case 'talk': {
        stand();
        const n = this.T.neck;
        this.talking = (this.talking || 0) - dt;
        this.arm('l', n[0] - d * 6, n[1] + 26);
        if (this.talking > 0) this.arm('r', n[0] + d * 15, n[1] + 6 + Math.sin(t * 12) * 5, d);
        else this.arm('r', n[0] + d * 6, n[1] + 26);
        break;
      }
      case 'five': {
        stand();
        const n = this.T.neck;
        this.arm('l', n[0] - d * 6, n[1] + 26);
        this.arm('r', n[0] + d * 22, n[1] - 18, -d);
        break;
      }
      default: {
        stand();
        const n = this.T.neck, s = Math.sin(t * 1.7) * 0.8;
        if (hop) { this.arm('l', n[0] - 16, n[1] + 14, 1); this.arm('r', n[0] + 16, n[1] + 14, -1); }
        else if (this.onRope) { this.arm('l', n[0] - 28, n[1] + 2 + Math.sin(t * 3) * 3, 1); this.arm('r', n[0] + 28, n[1] + 2 - Math.sin(t * 3) * 3, -1); }
        else { this.arm('l', n[0] - 8 + s, n[1] + 28); this.arm('r', n[0] + 8 + s, n[1] + 28); }
      }
    }
  }

  /** 物理子步里调用：把关节拉向姿势 */
  control(dt) {
    if (this.ctrl <= 0.001 || this.dead) return;
    if (this.state !== 'ctrl' && this.state !== 'getup') return;
    const k = this.ctrl * 0.36, T = this.T;
    for (const n of NAMES) {
      const q = T[n], p = this.j[n];
      if (!q || !p || p.pin || p.hole || p.trap || p.im === 0) continue;
      p.x += (q[0] - p.x) * k; p.y += (q[1] - p.y) * k;
      p.px += (q[0] - p.px) * k * 0.94; p.py += (q[1] - p.py) * k * 0.94;
    }
    // 站在绳子上，绳子被他压下去一点
    const r = this.onRope;
    if (r && r.spanned && this.state === 'ctrl') {
      const q = r.pts;
      for (let i = 1; i < q.length; i++) {
        if ((q[i - 1].x - this.x) * (q[i].x - this.x) <= 0) {
          const a = 1500 * dt * dt;
          if (!q[i - 1].pin) q[i - 1].y += a;
          if (!q[i].pin) q[i].y += a;
          break;
        }
      }
    }
  }

  onResize(dy = 0) { this.gy += dy; this.T = {}; }

  /* ─────────────── 给界面看的 ─────────────── */
  statusText() {
    if (this.dead) return '已停止工作';
    switch (this.state) {
      case 'draw': return '正在重画……';
      case 'frozen': return '冻住了';
      case 'flat': return '被压扁了';
      case 'getup': return '正在爬起来';
      case 'rag':
        if (this.held) return '被抓着';
        if (this.liftU >= 1.8) return '飞走了';
        if (this.hoisted) return '被吊着';
        if (this.all.some((p) => p.pin && p.pin.kind === 'nail')) return '被钉住了';
        return this.stuck() ? '动弹不得' : this.dizzy > 0 ? '晕了' : '躺着';
      default: break;
    }
    if (this.swimming) return this.headUnder ? '憋气' : '游泳';
    if (this.mob === 'crawl') return this.act === 'move' ? '在地上爬' : '趴着喘气';
    if (this.mob === 'worm') return this.act === 'move' ? '像虫一样蠕动' : '放弃思考';
    if (this.onRope && (this.act === 'walk' || this.act === 'run')) return '走钢丝';
    const m = { idle: '发呆', walk: this.mob === 'hop' ? '单脚蹦' : '散步', run: '逃命', cower: '缩成一团', phone: '玩手机', scratch: '挠头', wave: '跟你打招呼', fist: '冲你挥拳', beg: '跪地求饶', sit: '坐着', gape: '抬头看', duck: '弯腰躲', jump: '跳起来躲', dive: '扑开', back: '往后退', stretch: '伸懒腰', yawn: '打哈欠', dance: '跳舞', belly: '揉肚子', dust: '拍灰', rub: '揉伤口', scan: '东张西望', talk: '聊天', five: '击掌', mourn: '守着同伴', swim: '游泳' };
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
    if (this.headUnder && this.air < 0.7) return 'scared';
    if (this.dizzy > 0) return 'dizzy';
    if (this.liftU >= 1.8 || this.hoisted) return 'wow';
    if (this.fear > 55) return 'scared';
    if (this.fear > 30) return 'wow';
    if (this.state === 'frozen') return 'scared';
    if (this.hpf < 0.28) return this.kind === 'office' ? 'sad' : 'pout';
    if (this.pain > 50) return 'grit';
    if (this.pain > 28) return this.kind === 'sunny' ? 'pout' : 'angry';
    if (this.act === 'dance' || this.act === 'wave') return 'joy';
    if (this.act === 'phone' || this.act === 'sit') return 'bored';
    if (this.kind === 'office') return 'bored';
    if (this.kind === 'sunny') return 'happy';
    return 'norm';
  }

  drawShadow(shadow) {
    const hip = this.j.hip;
    if (!hip || this.dead || this.state === 'draw' || hip.hole) return;
    shadow(hip.x, 19, this.W.ground - hip.y - STAND);
  }

  draw(c) {
    if (this.dead || this.released) return;
    if (this.state === 'draw') { this.drawStrokes(c); return; }
    const j = this.j;
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
        squash: this.squash, hair: this.hair, lump: this.lump > 0.4 ? this.lump : 0, dizzy: this.dizzy > 0, t: this.t, tear: this.hpf < 0.28 || (this.moodT > 0 && this.mood === 'sad'),
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
    const sticks = this.W.sticks.filter((s) => s.a.owner === this && s.b.owner === this && s.kind !== 'ice');
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
    for (const n of NAMES) if (this.j[n] && idx.has(this.j[n])) j[n] = idx.get(this.j[n]);
    return {
      id: this.id, kind: this.kind, j, dir: this.dir, x: Math.round(this.x), gy: this.gy, num: this.num, slot: this.slot,
      broken: this.broken, hair: this.hair, lump: this.lump, hitCount: this.hitCount, age: Math.round(this.age),
    };
  }
  restore(d, pts) {
    this.j = {};
    this.id = d.id || this.id;
    nextBody = Math.max(nextBody, this.id + 1);
    this.kind = KINDS.includes(d.kind) ? d.kind : this.kind;
    this.slot = d.slot ?? this.slot;
    for (const [n, i] of Object.entries(d.j || {})) if (pts[i]) this.j[n] = pts[i];
    this.dir = d.dir || 1; this.x = d.x; this.gy = d.gy; this.num = d.num || 1;
    this.broken = d.broken || {}; this.hair = !!d.hair; this.lump = d.lump || 0;
    this.hitCount = d.hitCount || 0; this.age = d.age || 0; this.cause = 'fall';
    this.pain = 0; this.fear = 0; this.spurts = []; this.ice = []; this.xray = 0; this.squash = 0; this.dizzy = 0; this.soot = 0;
    this.moodT = 0; this.sayCd = 2; this.hitCd = 0; this.causeT = 0; this.T = {}; this.ctrl = 0;
    this.limbOK = {};
    this.all = pts.filter((p) => p.owner === this);
    for (const [k, l] of Object.entries(LIMBS)) this.limbOK[k] = !!(this.j[l.a] && this.j[l.b]);
    this.mob = this.mobility();
    this.act = 'idle'; this.actT = 0.6; this.phase = 0; this.tx = this.x;
    for (const p of this.all) p.flat = false;
    this.state = 'rag'; this.ragT = 0.15;
  }
}
