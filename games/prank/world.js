// 世界：Verlet 物理、地面和铅笔线、绳子、水、所有道具、特效。一个世界单位 = 一个低分辨率像素。
import * as art from './art.js';
import { INK, PAPER, gray, quantize } from './art.js';
import { sfx } from './sfx.js';
import { Body, HANDS_FEET, LIMB_JOINTS } from './body.js';

export const G = 820;
export const DT = 1 / 120;
export const MAX_ALIVE = 5;
const CELL = 3; // 水的格子大小
const hyp = Math.hypot;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const rnd = (a, b) => a + Math.random() * (b - a);
const FONT = '-apple-system, "PingFang SC", "Noto Sans CJK SC", sans-serif';

/* 点到线段：返回距离和最近点的比例 */
function segNear(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1;
  const t = clamp(((px - ax) * dx + (py - ay) * dy) / l2, 0, 1);
  const cx = ax + dx * t, cy = ay + dy * t;
  return { d: hyp(px - cx, py - cy), t, cx, cy };
}
/* 两线段最近距离（粗略：取四个端点到对方的最小值，再查相交） */
function segSeg(ax, ay, bx, by, cx, cy, dx, dy) {
  const d1 = bx - ax, d2 = by - ay, d3 = dx - cx, d4 = dy - cy;
  const den = d1 * d4 - d2 * d3;
  if (Math.abs(den) > 1e-6) {
    const u = ((cx - ax) * d4 - (cy - ay) * d3) / den;
    const v = ((cx - ax) * d2 - (cy - ay) * d1) / den;
    if (u >= 0 && u <= 1 && v >= 0 && v <= 1) return { d: 0, t: v };
  }
  let best = { d: 1e9, t: 0.5 };
  const n1 = segNear(cx, cy, ax, ay, bx, by); if (n1.d < best.d) best = { d: n1.d, t: 0 };
  const n2 = segNear(dx, dy, ax, ay, bx, by); if (n2.d < best.d) best = { d: n2.d, t: 1 };
  const n3 = segNear(ax, ay, cx, cy, dx, dy); if (n3.d < best.d) best = { d: n3.d, t: n3.t };
  const n4 = segNear(bx, by, cx, cy, dx, dy); if (n4.d < best.d) best = { d: n4.d, t: n4.t };
  return best;
}

/* ─────────────── 道具表：每种道具只有数据，行为都写在这里，所以能直接存档 ─────────────── */

/** 普通往下掉的东西：落在地面或者铅笔线上；重的在水里慢慢沉，香蕉皮浮在水面 */
function fall(W, o, dt) {
  if (o.held) return false;
  const wet = W.waterAt(o.x, o.y - 3);
  if (o.t === 'peel' && wet) {
    o.rest = false;
    o.vy = (o.vy || 0) + ((wet.level - o.y) * 30 - (o.vy || 0) * 5) * dt;
    o.y += o.vy * dt;
    o.afloat = true;
    return true;
  }
  o.afloat = false;
  if (o.rest) {
    const sup = W.supportY(o.x, o.y - 2);
    if (sup > o.y + 1) o.rest = false;
    else { o.y = sup; return true; }
  }
  o.vy = (o.vy || 0) + G * dt;
  if (wet) o.vy = Math.min(o.vy, 95);
  o.x += (o.vx || 0) * dt; o.y += o.vy * dt;
  o.x = clamp(o.x, 12, W.w - 12);
  const sup = W.supportY(o.x, o.y - o.vy * dt - 2);
  if (o.y >= sup) {
    o.y = sup; o.vx = 0;
    if (o.vy > 120) { sfx.place(); W.dust(o.x, sup, 3); }
    o.vy = 0; o.rest = true;
  }
  return o.rest;
}

const P = {
  anvil: {
    solid: true,
    box: (o) => ({ hw: 25 * o.s, h: 36 * o.s }),
    sub(W, o, dt) {
      if (o.held) return;
      const wet = W.waterAt(o.x, o.y - 18 * o.s);
      if (wet && !o.wasWet && (o.vy || 0) > 120) W.splash(o.x, wet.level, 14);
      o.wasWet = !!wet;
      o.vy += G * 1.3 * dt;
      if (wet) o.vy = Math.min(o.vy, 170);
      o.y += o.vy * dt; o.x += o.vx * dt;
      const hw = 25 * o.s;
      if (o.x < hw) { o.x = hw; if (Math.abs(o.vx) > 200) W.bang(0.6); o.vx = -o.vx * 0.3; }
      if (o.x > W.w - hw) { o.x = W.w - hw; if (Math.abs(o.vx) > 200) W.bang(0.6); o.vx = -o.vx * 0.3; }
      const sup = W.supportY(o.x, o.y - o.vy * dt - 2);
      if (o.y >= sup) {
        if (o.vy > 140) {
          const p = Math.min(1.6, o.vy / 600) * o.s;
          sfx.clang(o.s); W.bang(p); W.hitstop = Math.max(W.hitstop, 0.05);
          W.dust(o.x, sup, 8); W.word(o.x, sup - 46 * o.s, '咣！', 20 + 6 * o.s);
          if (sup >= W.ground - 1) W.crack(o.x, W.ground, 30 * o.s);
          W.crushProps(o, o.x - hw, o.x + hw);
        }
        o.y = sup; o.vy = 0; o.vx *= 0.6; o.rest = true;
      } else o.rest = false;
    },
    frame(W, o, dt) { if (o.rest && !o.held) { o.life -= dt; if (o.life <= 0) W.vanish(o); } },
    draw(W, c, o) {
      if (o.rest && o.life < 1.2 && Math.sin(o.life * 18) > 0) return;
      art.anvil(c, o.x, o.y, o.s);
    },
    front: true,
  },

  peel: {
    frame(W, o, dt) {
      if (!fall(W, o, dt) || o.held) return;
      for (const B of W.bodies) {
        if (!B.canSlip()) continue;
        for (const n of ['lFo', 'rFo']) {
          const f = B.j[n];
          if (f && Math.abs(f.x - o.x) < 11 * o.s + 3 && f.y > o.y - 8) { B.slip(); W.vanish(o); return; }
        }
      }
    },
    draw(W, c, o) { art.peel(c, o.x, o.y, o.s); },
  },

  spring: {
    frame(W, o, dt) {
      o.press = Math.max(0, (o.press || 0) - dt * 3.4);
      o.cd = (o.cd || 0) - dt;
      if (!fall(W, o, dt) || o.held || o.cd > 0) return;
      const hw = 17 * o.s, top = o.y - 20 * o.s;
      let hit = false;
      for (const p of W.pts) {
        if (p.hole || p.pin || p.trap || p.rope) continue;
        if (Math.abs(p.x - o.x) < hw && p.y + p.r > top && p.y < o.y + 2) { hit = true; break; }
      }
      if (hit) {
        o.press = 1; o.cd = 0.4;
        sfx.boing(o.s);
        const up = 690 + 190 * o.s;
        const side = (Math.random() < 0.5 ? -1 : 1) * rnd(90, 210);
        for (const p of W.pts) {
          if (p.hole || p.pin || p.rope) continue;
          if (Math.abs(p.x - o.x) < hw + 34 && p.y > top - 96 && p.y < o.y + 4) {
            p.py = p.y + up * DT;
            p.px = p.x - (side + rnd(-30, 30)) * DT;
          }
        }
        for (const B of W.bodies) if (B.alive && hyp(B.j.hip.x - o.x, B.j.hip.y - top) < 120) B.launched();
      }
    },
    draw(W, c, o) { art.spring(c, o.x, o.y, o.s, o.press || 0); },
  },

  spikes: {
    frame(W, o, dt) {
      o.rise = Math.min(1, (o.rise || 0) + dt * 9);
      o.life -= dt;
      if (o.life < 0.25) o.rise = Math.max(0, o.life / 0.25);
      if (o.life <= 0) { W.unpin(o); W.remove(o); return; }
      const L = 72 * o.s, H = 18 * o.s * o.rise;
      const cs = Math.cos(o.ang), sn = Math.sin(o.ang);
      for (const p of W.pts) {
        if (p.pin || p.hole || p.im === 0 || p.rope) continue;
        const dx = p.x - o.x, dy = p.y - o.y;
        const lx = dx * cs + dy * sn, ly = -dx * sn + dy * cs;
        if (Math.abs(lx) < L / 2 + 1 && ly < p.r * 0.2 && ly > -H - p.r) {
          const v = hyp(p.x - p.px, p.y - p.py) / DT;
          if ((v > 70 || o.rise < 1) && (o.pinned || 0) < 5) {
            p.pin = { x: p.x, y: p.y, by: o.id, kind: 'spikes' };
            o.pinned = (o.pinned || 0) + 1;
            sfx.stab();
            W.spurt(p.x, p.y, 5, sn, -cs);
            if (p.owner) p.owner.stabbed(p, o);
          }
        }
      }
    },
    draw(W, c, o) { art.spikes(c, o.x, o.y, o.s, o.ang, o.rise || 0); },
  },

  hole: {
    sub(W, o, dt) {
      o.tm += dt;
      const k = o.tm < 0.3 ? o.tm / 0.3 : o.tm > o.dur - 0.25 ? Math.max(0, (o.dur - o.tm) / 0.25) : 1;
      o.k = k;
      const R = 190 * o.s, r = 17 * o.s * k + 1;
      const a = (6200 + 2600 * o.s) * dt * dt;
      for (const p of W.pts) {
        if (p.hole || p.pin || p.im === 0) continue;
        const dx = o.x - p.x, dy = o.y - p.y, d = hyp(dx, dy) || 1;
        if (d > R) continue;
        p.sleep = 0;
        const f = (1 - d / R) * (1 - d / R) * a * k + a * 0.05 * k;
        p.x += (dx / d) * f - (dy / d) * f * 0.55;
        p.y += (dy / d) * f + (dx / d) * f * 0.55;
        if (d < r) {
          p.hole = o; o.eaten = (o.eaten || 0) + 1;
          if (p.owner) p.owner.sucked();
        }
      }
      for (const B of W.bodies) {
        const hip = B.j.hip;
        if (hip && B.alive && k > 0.5 && hyp(hip.x - o.x, hip.y - o.y) < R * 0.72) B.sucked();
      }
      for (const q of W.props) {
        if (q === o || q.dead || q.t === 'hole' || q.t === 'spikes' || q.t === 'roller' || q.t === 'nail' || q.held) continue;
        const dx = o.x - q.x, dy = o.y - q.y, d = hyp(dx, dy) || 1;
        if (d > R) continue;
        const f = (1 - d / R) * (1 - d / R) * 1500 * dt * k;
        q.rest = false; q.vx = (q.vx || 0) + dx / d * f; q.vy = (q.vy || 0) + dy / d * f - G * dt * 0.6;
        if (d < r + 8) { W.remove(q); W.puff(o.x, o.y, 8, { g: 80, life: 0.3 }); }
      }
      o.snd = (o.snd || 0) - dt;
      if (o.snd <= 0) { o.snd = 0.2; sfx.holeTick(); W.bang(0.14); }
      if (o.tm >= o.dur) W.collapse(o);
    },
    draw(W, c, o) { art.hole(c, o.x, o.y, 18 * o.s * (o.k ?? 0) + 0.5, W.t); },
  },

  roller: {
    sub(W, o, dt) {
      o.x += o.dir * o.v * dt;
      o.tm += dt;
      // 沿着地面或者铅笔线开，到头了就掉下去
      const sup = W.supportY(o.x, o.y - 6);
      if (sup > o.y + 1.5) {
        o.vy = (o.vy || 0) + G * dt;
        o.y = Math.min(sup, o.y + o.vy * dt);
        if (o.y >= sup && o.vy > 140) { sfx.clang(o.s); W.bang(0.8 * o.s); W.dust(o.x, sup, 6); }
        if (o.y >= sup) o.vy = 0;
      } else { o.y = sup; o.vy = 0; }
      o.snd = (o.snd || 0) - dt;
      if (o.snd <= 0) { o.snd = 0.17; sfx.rollerTick(); W.bang(0.1 * o.s); }
      o.smk = (o.smk || 0) - dt;
      if (o.smk <= 0) {
        o.smk = 0.28;
        W.puff(o.x - o.dir * 83 * o.s, o.y - 46 * o.s, rnd(3, 5) * o.s, { g: rnd(90, 180), life: 0.9, grow: 11, vy: -38, vx: rnd(-8, 8) - o.dir * 10 });
      }
      const R = 24 * o.s, dx0 = R * 0.92;
      for (const p of W.pts) {
        if (p.hole || p.im === 0 || p.rope) continue;
        const dx = p.x - o.x;
        if (Math.abs(dx) < dx0 && p.y > o.y - R * 2 - p.r - 16 && p.y < o.y + 3) {
          p.sleep = 0;
          if (p.owner) { const hy = p.owner.j.hip ? p.owner.j.hip.y : p.y; if (hy < o.y + 2) p.owner.flatten('roller', 56 * o.s, o.y); }
          else { p.flat = true; p.y = o.y - 1; p.py = p.y; }
        }
      }
      W.crushProps(o, o.x - dx0, o.x + dx0);
      const back = o.x - o.dir * 112 * o.s;
      if ((o.dir > 0 && back > W.w + 20) || (o.dir < 0 && back < -20)) W.remove(o);
    },
    draw(W, c, o) { art.roller(c, o.x, o.y + 1, o.s, o.dir, o.dir * o.x * 0.1 / Math.max(0.5, o.s)); },
    front: true,
  },

  // 钉子：固定在画面上，不会掉。被扔过来的手、脚、胳膊腿会被它钉住
  nail: {
    frame(W, o, dt) {
      o.cd = (o.cd || 0) - dt;
      if (o.cd > 0 || o.direct || (o.caught || 0) >= 2) return;
      for (const p of W.pts) {
        if (p.pin || p.hole || !p.part || !LIMB_JOINTS.includes(p.part)) continue;
        if (hyp(p.x - o.x, p.y - o.y) > 6 + p.r) continue;
        const B = p.owner;
        if (B && B.state !== 'rag') continue;              // 自己走过去不会被钉
        if (W.hand && W.hand.p && (W.hand.p === p || (B && W.hand.p.owner === B))) continue;  // 手还抓着不算扔
        if (hyp(p.x - p.px, p.y - p.py) / DT < 40) continue;
        W.nailPoint(o, p);
        if (B) B.nailed(p);
        break;
      }
    },
    draw(W, c, o) { art.nail(c, o.x, o.y, 1); },
    front: true,
  },

  // 气球：绑在手腕或脚踝上。两三个、或者吹大了才拉得动
  balloon: {
    sub(W, o, dt) {
      if (o.held) return;
      const R = 13 * o.s, len = 26 + 6 * o.s;
      if (o.to && !W.pts.includes(o.to)) o.to = null;
      o.sw = (o.sw || rnd(0, 6)) + dt * 1.6;
      const want = -92;
      o.vy += (want - o.vy) * dt * 3.4;
      o.vx += (Math.sin(o.sw) * 18 - o.vx) * dt * 2;
      o.x += o.vx * dt; o.y += o.vy * dt;
      if (o.y - R < 2) { o.y = R + 2; if (o.vy < 0) o.vy = 0; }
      o.x = clamp(o.x, R + 2, W.w - R - 2);
      // 碰到铅笔线就被挡住
      for (const l of W.walls) {
        if (o.x < l.x0 - R || o.x > l.x1 + R || o.y < l.y0 - R || o.y > l.y1 + R) continue;
        const q = l.pts;
        for (let i = 1; i < q.length; i++) {
          const n = segNear(o.x, o.y, q[i - 1].x, q[i - 1].y, q[i].x, q[i].y);
          if (n.d < R) {
            const nx = (o.x - n.cx) / (n.d || 1), ny = (o.y - n.cy) / (n.d || 1);
            o.x = n.cx + nx * R; o.y = n.cy + ny * R;
            if (o.vy < 0) o.vy = 0;
          }
        }
      }
      if (o.to) {
        const to = o.to;
        // 手不能跑到气球上面：先把气球往上顶；顶到天花板了才一点点压手（一下子挪太多，整条胳膊会被抽飞）
        const over = o.y + R + 4 - to.y;
        if (over > 0 && !to.pin && to.im) {
          const up = Math.min(Math.max(0, o.y - R - 2), over);
          o.y -= up;
          const rest = Math.min(over - up, 0.4);
          if (rest > 0) { to.y += rest; to.py += rest; if (to.py > to.y) to.py = to.y; }
        }
        const dx = o.x - to.x, dy = o.y - to.y, d = hyp(dx, dy) || 1;
        if (d >= len) {
          o.x = to.x + dx / d * len; o.y = to.y + dy / d * len;
          o.vx *= 0.8; if (o.vy < 0) o.vy *= 0.5;
          const B = to.owner;
          // 活人要够力气才拉得动；尸体和断肢轻，一个就够
          if (!to.pin && to.im && (!B || B.liftU >= 1.8)) {
            const a = (B ? 1800 : 15000) * o.s * o.s * dt * dt;
            to.y -= a; to.x += (dx / d) * a * 0.25;
            to.sleep = 0;
          }
        }
      } else {
        // 绳头碰到手腕、脚踝就绑上
        o.cd = (o.cd || 0) - dt;
        if (o.cd <= 0) {
          const tx = o.x, ty = o.y + R + len * 0.8;
          const j = W.jointNear(tx, ty, 9, true);
          if (j) W.tieBalloon(o, j);
        }
      }
    },
    draw(W, c, o) {
      const R = 13 * o.s, tailY = o.y + R + 2;
      c.strokeStyle = INK; c.lineWidth = 1;
      c.beginPath(); c.moveTo(o.x, tailY);
      if (o.to) {
        c.quadraticCurveTo(o.x + Math.sin(W.t * 2 + o.id) * 3, (tailY + o.to.y) / 2, o.to.x, o.to.y);
      } else {
        const len = 26 + 6 * o.s;
        c.quadraticCurveTo(o.x + Math.sin(W.t * 3 + o.id) * 4, tailY + len * 0.5, o.x + Math.sin(W.t * 2 + o.id) * 3, tailY + len * 0.8);
      }
      c.stroke();
      art.balloon(c, o.x, o.y, o.s);
    },
    front: true,
  },
};

/* ─────────────── 世界 ─────────────── */

let nextId = 1;

export class World {
  constructor(cb = {}) {
    this.cb = cb;
    this.w = 480; this.h = 260; this.ground = 238;
    this.pts = []; this.sticks = []; this.props = []; this.walls = []; this.fx = []; this.ropes = [];
    this.bodies = [];
    this.vit = { hp: 300, max: 300 };
    this.autoDraw = true; this.drawT = 0; this.drawn = 0; this.grudge = 0;
    this.t = 0; this.acc = 0;
    this.flashT = 0; this.shakeA = 0; this.hitstop = 0;
    this.paused = false;
    this.opts = { particles: 2, shake: true, flash: true };
    this.decal = document.createElement('canvas');
    this.dc = this.decal.getContext('2d');
    this.hand = null; this.eraserT = null; this.stroke = null; this.preview = null; this.ropeDraft = null;
    this.cursor = { x: 240, y: 120, on: false, moved: -9 };
    this.showHandles = false;
    this.waters = []; this.waterDirty = true; this.socialT = rnd(5, 9);
    this.focus = null;
  }

  get alive() { return this.bodies.filter((b) => b.alive); }
  /** 设置里改血条厚度 */
  setMax(v) {
    const fresh = !this.bodies.length;
    this.vit.max = v;
    this.vit.hp = fresh ? v : Math.min(this.vit.hp, v);
  }

  /* ─────────────── 人 ─────────────── */

  /** 画一个新的。活着的满 5 个就画不下了 */
  spawnOne(animate = true) {
    const live = this.bodies.filter((b) => !b.dead);
    if (live.length >= MAX_ALIVE) return null;
    if (!live.length) this.vit.hp = this.vit.max;
    // 尽量离别人远一点
    let x = 0, best = -1;
    for (let i = 0; i < 6; i++) {
      const tx = rnd(this.w * 0.14, this.w * 0.86);
      const d = live.length ? Math.min(...live.map((b) => Math.abs(b.x - tx))) : 999;
      if (d > best) { best = d; x = tx; }
    }
    const B = new Body(this, this.freeSlot());
    this.bodies.push(B);
    this.drawn++;
    B.spawn(x, animate);
    if (!this.focus || this.focus.dead) this.focus = B;
    return B;
  }
  freeSlot() {
    const used = new Set(this.bodies.map((b) => b.slot));
    for (let i = 0; i < MAX_ALIVE + 1; i++) if (!used.has(i)) return i;
    return 0;
  }
  /** 有人死了：不管一下死几个，只画一个新的 */
  noteDeath(B, cause) {
    this.cb.death && this.cb.death(B, cause);
    if (this.autoDraw && this.drawT <= 0) this.drawT = 1.2;
    for (const o of this.bodies) if (o !== B && o.alive) o.mateDied(B);
  }
  killAll(cause) { for (const b of this.bodies) if (!b.dead) b.die(cause); }

  recalcAll() { for (const b of this.bodies) b.recalc(); }

  resize(w, h) {
    const g = h - 22, dy = g - this.ground;
    const old = this.decal;
    const nd = document.createElement('canvas');
    nd.width = w; nd.height = h;
    const nc = nd.getContext('2d');
    if (old.width) nc.drawImage(old, 0, dy);
    this.decal = nd; this.dc = nc;
    this.w = w; this.h = h; this.ground = g;
    for (const p of this.pts) {
      p.y += dy; p.py += dy; p.sleep = 0;
      if (p.pin) p.pin.y += dy;
      if (p.x > w - 4) { const d = p.x - (w - 4); p.x -= d; p.px -= d; if (p.pin) p.pin.x -= d; }
    }
    for (const o of this.props) { o.y += dy; o.x = Math.min(o.x, w - 12); }
    for (const l of this.walls) { for (const q of l.pts) { q.y += dy; q.x = Math.min(q.x, w - 2); } Object.assign(l, this.makeWall(l.pts)); }
    for (const wt of this.waters) { wt.level += dy; wt.target += dy; if (wt.sy != null) wt.sy += dy; }
    for (const b of this.bodies) b.onResize(dy);
    this.cursor.x = Math.min(this.cursor.x, w - 2); this.cursor.y = clamp(this.cursor.y + dy, 2, g);
    this.waterDirty = true;
  }

  /* 点和杆 */
  addPt(x, y, o = {}) {
    const p = { x, y, px: x, py: y, r: o.r ?? 2, im: o.im ?? 1, part: o.part || null, body: !!o.body, owner: o.owner || null, group: o.group ?? 0, corpse: false, rope: o.rope || null, pin: null, trap: null, hole: null, ang: 0, flat: false, wet: 0, sleep: 0, id: nextId++ };
    this.pts.push(p);
    return p;
  }
  addStick(a, b, kind = 'limb', len) {
    const s = { a, b, len: len ?? hyp(a.x - b.x, a.y - b.y), kind };
    this.sticks.push(s);
    return s;
  }
  removeStick(s) { const i = this.sticks.indexOf(s); if (i >= 0) this.sticks.splice(i, 1); }
  sticksOf(p) { return this.sticks.filter((s) => s.a === p || s.b === p); }

  /** 整根抹掉（橡皮） */
  eraseStick(s) {
    this.removeStick(s);
    this.prune();
    this.recalcAll();
  }
  /** 从 t 的位置切断一根杆，两头都留下断茬 */
  cutStick(s, t = 0.5, spurt = true) {
    const { a, b, kind, len } = s;
    this.removeStick(s);
    const x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t;
    if (t > 0.14 && t < 0.86) {
      const m1 = this.addPt(x, y, { body: a.body, owner: a.owner, group: a.group }); this.addStick(a, m1, kind, len * t);
      const m2 = this.addPt(x, y, { body: b.body, owner: b.owner, group: b.group }); this.addStick(m2, b, kind, len * (1 - t));
      m1.px = x - rnd(-40, 40) * DT; m2.px = x - rnd(-40, 40) * DT;
    }
    if (spurt) this.spurt(x, y, 10);
    this.prune();
    this.recalcAll();
    return { x, y };
  }
  /** 没有杆连着的点（脑袋除外）就没用了 */
  prune() {
    const used = new Set();
    for (const s of this.sticks) { if (s.kind !== 'tie') { used.add(s.a); used.add(s.b); } }
    for (const r of this.ropes) r.ends.forEach((e, i) => { if (e && e.p && !used.has(e.p) && e.p.part !== 'head') this.untie(r, i); });
    for (const o of this.props) if (o.t === 'balloon' && o.to && !used.has(o.to) && o.to.part !== 'head') o.to = null;
    this.pts = this.pts.filter((p) => used.has(p) || p.part === 'head');
  }

  /* 物理 */
  update(rdt) {
    rdt = Math.min(rdt, 1 / 20);
    if (this.paused) return;
    this.t += rdt;
    if (this.hitstop > 0) { this.hitstop -= rdt; this.updateFx(rdt * 0.3); return; }
    const dt = rdt;
    this.acc += dt;
    if (this.waterDirty) this.rebuildGrid();
    this.updateWater(dt);
    let n = 0;
    while (this.acc >= DT && n < 8) { this.sub(DT); this.acc -= DT; n++; }
    if (n === 8) this.acc = 0;
    this.updateRopes(dt);
    this.checkYank(dt);
    for (const b of this.bodies.slice()) b.update(dt);
    // 死掉的变成尸体留在原地
    if (this.bodies.some((b) => b.dead)) {
      for (const b of this.bodies) if (b.dead) b.release();
      this.bodies = this.bodies.filter((b) => !b.dead);
      this.recalcAll();
      if (this.focus && this.focus.dead) this.focus = this.bodies[0] || null;
    }
    this.social(dt);
    if (this.drawT > 0) {
      this.drawT -= dt;
      if (this.drawT <= 0 && this.autoDraw) this.spawnOne(true);
    }
    for (const o of this.props) { const f = P[o.t].frame; if (f && !o.dead) f(this, o, dt); }
    this.props = this.props.filter((o) => !o.dead);
    this.updateFx(dt);
    this.flashT = Math.max(0, this.flashT - rdt);
    this.shakeA *= Math.pow(0.0015, rdt);
    if (this.shakeA < 0.2) this.shakeA = 0;
  }

  sub(dt) {
    const pts = this.pts, g = G * dt * dt, hasWater = this.waters.some((w) => !w.empty);
    for (const p of pts) {
      if (p.pin) { p.x = p.pin.x; p.y = p.pin.y; p.px = p.x; p.py = p.y; continue; }
      if (p.hole) { p.x = p.hole.x; p.y = p.hole.y; p.px = p.x; p.py = p.y; continue; }
      if (p.im === 0) continue;
      const wt = hasWater ? this.waterAt(p.x, p.y - 1) : null;
      if (p.sleep > 1) { if (wt) p.sleep = 0; else continue; }
      let vx = p.x - p.px, vy = p.y - p.py;
      const sp = hyp(vx, vy);
      if (sp > 15) { vx *= 15 / sp; vy *= 15 / sp; }
      if (!p.owner && !p.rope && !wt) {
        // 尸体和断肢停稳了就睡着，省电
        if (sp < 0.05) p.sleep = Math.min(2, p.sleep + dt * 1.2);
        else p.sleep = 0;
      }
      p.px = p.x; p.py = p.y;
      let k = 0.9994, up = 0;
      if (hasWater) {
        if (wt) {
          p.wet = (p.wet || 0) + dt;
          k = 0.975;
          // 尸体先沉，泡一会儿浮起来；断肢浮得更快；活人自己会游
          if (p.rope) up = 0.92;
          else if (p.owner) up = 0.9;
          else {
            const ramp = p.corpse ? 4 : 1.4;
            up = 0.55 + Math.min(1, p.wet / ramp) * (p.corpse ? 0.8 : 1.1);
          }
        } else if (p.wet) p.wet = Math.max(0, p.wet - dt * 0.2);
      }
      p.x += vx * k; p.y += vy * k + g * (1 - up);
    }
    if (this.walls.length) this.updateThrough();
    for (const b of this.bodies) { b.control(dt); if (b.liftU >= 1.8) b.applyLift(dt); }
    const h = this.hand;
    if (h) {
      const nx = h.x + (h.tx - h.x) * 0.45, ny = h.y + (h.ty - h.y) * 0.45;
      h.vx += ((nx - h.x) / dt - h.vx) * 0.16; h.vy += ((ny - h.y) / dt - h.vy) * 0.16;
      h.x = nx; h.y = ny;
      this.cursor.x = h.x; this.cursor.y = h.y;
      if (h.p) { h.p.sleep = 0; h.p.x = h.x; h.p.y = h.y; h.p.px = h.x - h.vx * dt; h.p.py = h.y - h.vy * dt; }
      if (h.o) { h.o.x = h.x; h.o.y = h.y + h.oy; h.o.vx = h.vx; h.o.vy = h.vy; }
    }
    for (const o of this.props) { const f = P[o.t].sub; if (f && !o.dead) f(this, o, dt); }
    for (let it = 0; it < 5; it++) {
      for (const s of this.sticks) {
        const a = s.a, b = s.b;
        if (a.sleep > 1 && b.sleep > 1) continue;
        const wa = a.pin || a.hole ? 0 : a.im, wb = b.pin || b.hole ? 0 : b.im;
        const w = wa + wb;
        if (w === 0) continue;
        const dx = b.x - a.x, dy = b.y - a.y, d = hyp(dx, dy) || 0.001;
        let f = (d - s.len) / d / w;
        // 绳子只能拉不能推，而且是软的（有弹性）
        if (s.kind === 'rope') { if (d <= s.len) continue; if (d < s.len * 1.05) f *= 0.5; }
        else if (s.kind === 'ropeMax') { if (d <= s.len) continue; }
        a.x += dx * f * wa; a.y += dy * f * wa;
        b.x -= dx * f * wb; b.y -= dy * f * wb;
      }
    }
    // 长绳子多解几遍，不然一压就拉得老长
    for (const r of this.ropes) {
      if (!r.spanned) continue;
      for (let it = 0; it < 8; it++) {
        for (const s of r.sticks) {
          const a = s.a, b = s.b, wa = a.pin ? 0 : a.im, wb = b.pin ? 0 : b.im, w = wa + wb;
          if (!w) continue;
          const dx = b.x - a.x, dy = b.y - a.y, d = hyp(dx, dy) || 0.001;
          if (d <= s.len * 1.04) continue;
          const f = (d - s.len * 1.04) / d / w;
          a.x += dx * f * wa; a.y += dy * f * wa;
          b.x -= dx * f * wb; b.y -= dy * f * wb;
        }
      }
    }
    for (const p of this.pts) if (p.sleep <= 1) this.collide(p, dt);
  }

  /** 撞上东西：谁都有声音和灰，人才会疼 */
  impact(p, v, o) {
    if (v > 300 && !p.rope) {
      this.dust(p.x, p.y + p.r, v > 620 ? 4 : 2);
      sfx.thud((v - 200) / 520);
    }
    if (p.owner) p.owner.impact(p, v, o);
  }

  /** 身上的杆子已经穿过某条铅笔线了（走路时头伸过线、被手拖过去）：杆子两头先不管这条线，
   *  不然线上线下两半互相拽，人抖得像触电，还一直掉血。离开了就恢复。 */
  updateThrough() {
    for (const l of this.walls) {
      if (l.through) l.through.clear();
      const q = l.pts;
      for (const s of this.sticks) {
        if (s.kind !== 'limb' && s.kind !== 'torso' && s.kind !== 'neck' && s.kind !== 'extra') continue;
        const a = s.a, b = s.b;
        if (a.sleep > 1 && b.sleep > 1) continue;
        if (Math.max(a.x, b.x) < l.x0 || Math.min(a.x, b.x) > l.x1 || Math.max(a.y, b.y) < l.y0 || Math.min(a.y, b.y) > l.y1) continue;
        for (let i = 1; i < q.length; i++) {
          if (segSeg(a.x, a.y, b.x, b.y, q[i - 1].x, q[i - 1].y, q[i].x, q[i].y).d === 0) {
            if (!l.through) l.through = new Set();
            l.through.add(a); l.through.add(b);
            break;
          }
        }
      }
    }
  }

  collide(p, dt) {
    if (p.pin || p.hole || p.im === 0) return;
    const r = p.flat ? 1 : p.r;
    if (p.trap) {
      const o = p.trap, hw = P[o.t].box(o).hw + 4;
      if (o.dead || o.held || Math.abs(p.x - o.x) > hw + 2 || o.y < p.y - 2) p.trap = null;
      else {
        p.y = Math.min(o.y, this.ground) - Math.min(r, 3);
        p.py = p.y; p.px = p.x;
        return;
      }
    }
    // 地面
    if (p.y + r > this.ground) {
      const v = (p.y - p.py) / dt;
      p.y = this.ground - r;
      p.px += (p.x - p.px) * (p.flat ? 0.9 : 0.34);
      p.py = p.y + v * dt * 0.22;
      if (v > 200) this.impact(p, v);
    }
    if (p.y - r < 0) {
      const v = (p.py - p.y) / dt;
      p.y = r; p.py = p.y - v * dt * 0.3; p.px += (p.x - p.px) * 0.2;
      if (v > 200) this.impact(p, v);
    }
    if (p.x - r < 0) {
      const v = (p.px - p.x) / dt;
      p.x = r; p.px = p.x - v * dt * 0.3; p.py += (p.y - p.py) * 0.2;
      if (v > 200) this.impact(p, v);
    }
    if (p.x + r > this.w) {
      const v = (p.x - p.px) / dt;
      p.x = this.w - r; p.px = p.x + v * dt * 0.3; p.py += (p.y - p.py) * 0.2;
      if (v > 200) this.impact(p, v);
    }
    // 铅笔线
    for (const l of this.walls) {
      if (p.x < l.x0 - r - 3 || p.x > l.x1 + r + 3 || p.y < l.y0 - r - 3 || p.y > l.y1 + r + 3) continue;
      if (l.through && l.through.has(p)) continue;
      const q = l.pts;
      for (let i = 1; i < q.length; i++) {
        const a = q[i - 1], b = q[i];
        const n = segNear(p.x, p.y, a.x, a.y, b.x, b.y);
        if (n.d < r + 1.6) {
          let nx = p.x - n.cx, ny = p.y - n.cy;
          // 这一步已经穿过线了：按上一步在哪一侧推回去，不然会被推到线的另一边，等于穿墙
          const crossed = hyp(p.x - p.px, p.y - p.py) > 1 && segSeg(p.px, p.py, p.x, p.y, a.x, a.y, b.x, b.y).d === 0;
          if (n.d < 0.01 || crossed) { const pn = segNear(p.px, p.py, a.x, a.y, b.x, b.y); nx = p.px - pn.cx; ny = p.py - pn.cy; }
          const ln = hyp(nx, ny) || 1; nx /= ln; ny /= ln;
          const vx = (p.x - p.px) / dt, vy = (p.y - p.py) / dt;
          const vn = vx * nx + vy * ny;
          p.x = n.cx + nx * (r + 1.7); p.y = n.cy + ny * (r + 1.7);
          if (vn < 0) {
            const tx = vx - vn * nx, ty = vy - vn * ny;
            const nvx = tx * 0.72 - vn * nx * 0.18, nvy = ty * 0.72 - vn * ny * 0.18;
            p.px = p.x - nvx * dt; p.py = p.y - nvy * dt;
            if (vn < -200) this.impact(p, -vn);
          }
        } else if (hyp(p.x - p.px, p.y - p.py) > 2) {
          const c = segSeg(p.px, p.py, p.x, p.y, a.x, a.y, b.x, b.y);
          if (c.d === 0) { const v = hyp(p.x - p.px, p.y - p.py) / dt; p.x = p.px; p.y = p.py; p.px = p.x + (p.x - p.px) * 0.2; if (v > 200) this.impact(p, v); }
        }
      }
    }
    // 绳子：从上面掉下来会被接住，绳子跟着往下弹
    if (!p.rope && this.ropes.length) this.ropeCatch(p, r, dt);
    // 铁砧这种实心的东西
    for (const o of this.props) {
      if (!P[o.t].solid || o.dead) continue;
      const box = P[o.t].box(o), hw = box.hw + r, h = box.h;
      if (Math.abs(p.x - o.x) >= hw || p.y + r <= o.y - h || p.y - r >= o.y) continue;
      p.sleep = 0;
      const pvx = (p.x - p.px) / dt, pvy = (p.y - p.py) / dt;
      const ovx = o.vx || 0, ovy = o.vy || 0;
      const rel = hyp(pvx - ovx, pvy - ovy);
      if (o.t === 'anvil' && ovy > 110) {
        p.trap = o;
        p.y = Math.min(o.y, this.ground) - Math.min(r, 3); p.py = p.y;
        if (p.owner) p.owner.crushed(p, o, ovy);
        continue;
      }
      const L = p.x - (o.x - hw), R = o.x + hw - p.x, T = p.y + r - (o.y - h);
      if (T < L && T < R) {
        p.y = o.y - h - r;
        if (pvy > ovy) { p.py = p.y + (pvy - ovy) * dt * 0.2; if (rel > 220) this.impact(p, rel); }
        p.px += (p.x - p.px) * 0.34;
      } else if (L < R) {
        p.x = o.x - hw;
        p.px = p.x - Math.min(0, pvx - ovx) * dt * 0.25 - ovx * dt;
        if (rel > 220) this.impact(p, rel, o);
      } else {
        p.x = o.x + hw;
        p.px = p.x - Math.max(0, pvx - ovx) * dt * 0.25 - ovx * dt;
        if (rel > 220) this.impact(p, rel, o);
      }
    }
  }

  /** 落脚点：地面、铅笔线、两头都系好的绳子。返回最高的那个不高于 y 的面 */
  support(x, y, group = 0) {
    let best = this.ground, rope = null;
    for (const l of this.walls) {
      if (x < l.x0 || x > l.x1) continue;
      const q = l.pts;
      for (let i = 1; i < q.length; i++) {
        const a = q[i - 1], b = q[i];
        const lo = Math.min(a.x, b.x), hi = Math.max(a.x, b.x);
        if (x < lo || x > hi || hi - lo < 0.01) continue;
        if (Math.abs((b.y - a.y) / (b.x - a.x)) > 1.5) continue;
        const yy = a.y + (b.y - a.y) * (x - a.x) / (b.x - a.x);
        if (yy >= y - 8 && yy < best) { best = yy; rope = null; }
      }
    }
    for (const r of this.ropes) {
      if (!r.spanned || x < r.x0 || x > r.x1) continue;
      if (group && r.ends.some((e) => e && e.p && e.p.group === group)) continue;
      const q = r.pts;
      for (let i = 1; i < q.length; i++) {
        const a = q[i - 1], b = q[i];
        const lo = Math.min(a.x, b.x), hi = Math.max(a.x, b.x);
        if (x < lo || x > hi || hi - lo < 0.01) continue;
        if (Math.abs((b.y - a.y) / (b.x - a.x)) > 1.2) continue;
        const yy = a.y + (b.y - a.y) * (x - a.x) / (b.x - a.x);
        if (yy >= y - 8 && yy < best) { best = yy; rope = r; }
      }
    }
    return { y: best, rope };
  }
  supportY(x, y) { return this.support(x, y).y; }

  /** 前面有没有挡路的东西（走路时绕开） */
  obstacleAhead(x, dir, gy) {
    const nx = x + dir * 16;
    for (const o of this.props) {
      if (o.t === 'spikes' && o.ang === 0 && Math.abs(o.x - nx) < 36 * o.s + 4 && Math.abs(o.y - gy) < 10) return true;
      if ((o.t === 'anvil' && o.rest) && Math.abs(o.x - nx) < 25 * o.s + 4 && Math.abs(o.y - gy) < 10) return true;
    }
    for (const l of this.walls) {
      if (nx < l.x0 - 1 || nx > l.x1 + 1) continue;
      const q = l.pts;
      for (let i = 1; i < q.length; i++) {
        const a = q[i - 1], b = q[i];
        const lo = Math.min(a.x, b.x), hi = Math.max(a.x, b.x);
        if (nx < lo - 1 || nx > hi + 1) continue;
        const sl = hi - lo < 0.5 ? 9 : Math.abs((b.y - a.y) / (b.x - a.x));
        const top = Math.min(a.y, b.y), bot = Math.max(a.y, b.y);
        if (sl > 1.5 && bot > gy - 80 && top < gy - 4) return true;
      }
    }
    return false;
  }

  threatNear(x) {
    let best = null, bd = 1e9;
    const take = (tx, r, kind) => { const d = Math.abs(tx - x); if (d < r && d < bd) { bd = d; best = { x: tx, d, kind }; } };
    for (const o of this.props) {
      if (o.t === 'roller') {
        const ahead = (x - o.x) * o.dir;
        if (ahead > -30) take(o.x, 160 + 40 * o.s, 'roller');
      } else if (o.t === 'hole') take(o.x, 190 * o.s, 'hole');
    }
    return best;
  }

  /* ─────────────── 几个人之间 ─────────────── */
  social(dt) {
    const live = this.bodies.filter((b) => b.alive && b.state === 'ctrl');
    if (live.length < 2) return;
    this.socialT -= dt;
    if (this.socialT > 0) return;
    this.socialT = rnd(7, 13);
    const free = live.filter((b) => !b.partner && !['run', 'dive', 'duck', 'jump', 'back', 'mourn', 'swim'].includes(b.act) && !b.swimming);
    if (free.length < 2) return;
    const a = free[(Math.random() * free.length) | 0];
    const others = free.filter((b) => b !== a);
    const b = others.reduce((m, q) => (Math.abs(q.x - a.x) < Math.abs(m.x - a.x) ? q : m), others[0]);
    a.meet(b); b.meet(a);
  }

  /* ─────────────── 道具 ─────────────── */
  addProp(o) {
    const q = { id: nextId++, vx: 0, vy: 0, s: 1, ...o };
    this.props.push(q);
    return q;
  }
  remove(o) {
    o.dead = true;
    if (this.hand && this.hand.o === o) this.hand.o = null;
    if (o.t === 'nail') { this.unpin(o); for (const r of this.ropes) r.ends.forEach((e, i) => { if (e && e.nail === o) { r.ends[i] = null; r.target = null; } }); }
  }
  vanish(o) {
    this.remove(o);
    this.puff(o.x, o.y - 12, 16 * o.s, { g: 200, life: 0.3, grow: 30 });
    this.unTrap(o);
    sfx.pop();
  }
  unTrap(o) { for (const p of this.pts) if (p.trap === o) p.trap = null; }
  unpin(o) {
    for (const p of this.pts) if (p.pin && p.pin.by === o.id) { p.pin = null; p.sleep = 0; }
    o.pinned = 0; o.caught = 0;
  }
  wakeAll() { for (const p of this.pts) p.sleep = 0; }
  /** 东西被碾、被砧子砸中 */
  crushProps(by, a, b) {
    for (const q of this.props) {
      if (q === by || q.dead || q.held) continue;
      if (q.x < a - 6 || q.x > b + 6 || Math.abs(q.y - by.y) > 60) continue;
      if (by.t === 'anvil' && q.y < by.y - 40 * by.s) continue;
      if (q.t === 'peel' || q.t === 'spring') { this.remove(q); this.dust(q.x, q.y, 4); }
    }
  }
  /** 把铅笔线里满足条件的点抹掉，线会断成几段 */
  eraseWalls(test, crumbs = false) {
    const out = [];
    let hit = false;
    for (const l of this.walls) {
      let cur = [];
      for (const q of l.pts) {
        if (test(q)) { hit = true; if (crumbs) this.crumb(q.x, q.y, 2); if (cur.length > 1) out.push(cur); cur = []; } else cur.push(q);
      }
      if (cur.length > 1) out.push(cur);
    }
    if (hit) { this.walls = []; for (const q of out) this.walls.push(this.makeWall(q)); this.waterDirty = true; this.wakeAll(); }
    return hit;
  }
  makeWall(pts) {
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    for (const q of pts) { x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); y0 = Math.min(y0, q.y); y1 = Math.max(y1, q.y); }
    return { pts, x0, x1, y0, y1 };
  }
  /** 铅笔线：两头靠近别的线头就接上，这样才框得住水 */
  addWall(pts) {
    const snap = (q) => {
      let best = null, bd = 9;
      for (const l of this.walls) {
        for (const e of [l.pts[0], l.pts[l.pts.length - 1]]) {
          const d = hyp(e.x - q.x, e.y - q.y);
          if (d < bd) { bd = d; best = e; }
        }
      }
      if (best) { q.x = best.x; q.y = best.y; }
    };
    snap(pts[0]); snap(pts[pts.length - 1]);
    // 自己首尾相接
    const a = pts[0], b = pts[pts.length - 1];
    if (pts.length > 3 && hyp(a.x - b.x, a.y - b.y) < 14) { b.x = a.x; b.y = a.y; }
    // 贴着地面的线头落到地上，免得留一条缝漏水
    for (const q of [a, b]) if (this.ground - q.y < 7) q.y = this.ground;
    this.walls.push(this.makeWall(pts));
    if (this.walls.length > 60) this.walls.shift();
    this.waterDirty = true;
    this.wakeAll();
  }

  /* ─────────────── 钉子 ─────────────── */
  /** 手腕脚踝（hfOnly）或者任何关节，活人和尸体都算 */
  jointNear(x, y, r, hfOnly = false) {
    let best = null, bd = r;
    for (const p of this.pts) {
      if (!p.part || p.hole) continue;
      if (hfOnly ? !HANDS_FEET.includes(p.part) : !LIMB_JOINTS.includes(p.part)) continue;
      if (p.owner && p.owner.state === 'draw') continue;
      const d = hyp(p.x - x, p.y - y);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }
  balloonAt(x, y, extra = 3) {
    for (const o of this.props) if (o.t === 'balloon' && !o.dead && hyp(o.x - x, o.y - y) < 13 * o.s + extra) return o;
    return null;
  }
  nailPoint(o, p) {
    p.pin = { x: o.x, y: o.y, by: o.id, kind: 'nail' };
    p.x = o.x; p.y = o.y; p.px = p.x; p.py = p.y; p.sleep = 0;
    o.caught = (o.caught || 0) + 1;
    sfx.stab();
    this.spurt(p.x, p.y, 4);
    this.word(o.x, o.y - 14, '咚', 13);
  }
  /** 点钉子工具 */
  useNail(x, y) {
    const b = this.balloonAt(x, y);
    if (b) { this.popBalloon(b); return 'pop'; }
    const j = this.jointNear(x, y, 16, true) || this.jointNear(x, y, 12);
    y = Math.min(y, this.ground - 3);
    if (j && !j.pin) {
      const o = this.addProp({ t: 'nail', x: j.x, y: j.y, direct: true }); // 直接钉手腕的这颗只钉这一个地方
      this.nailPoint(o, j);
      if (j.owner) { j.owner.nailed(j); }
      this.trimNails();
      return 'pin';
    }
    sfx.stab();
    this.addProp({ t: 'nail', x, y });
    this.word(x, y - 12, '咚', 12);
    this.trimNails();
    return 'wall';
  }
  trimNails() {
    const list = this.props.filter((o) => o.t === 'nail');
    if (list.length > 30) this.remove(list[0]);
  }

  /* ─────────────── 气球 ─────────────── */
  useBalloon(x, y) {
    const b = this.balloonAt(x, y);
    if (b) {
      b.s = Math.round((b.s + 0.2) * 100) / 100;
      sfx.inflate(b.s);
      if (b.s >= 2.2) this.popBalloon(b, true);
      return 'grow';
    }
    if (this.props.filter((o) => o.t === 'balloon').length >= 16) { sfx.error(); return 'full'; }
    sfx.inflate(1);
    const j = this.jointNear(x, y, 20, true);
    const o = this.addProp({ t: 'balloon', x: j ? j.x : x, y: j ? j.y - 30 : clamp(y, 16, this.ground - 16), s: 1, vx: rnd(-14, 14), vy: -40, cd: 0.5 });
    if (j) this.tieBalloon(o, j);
    return 'new';
  }
  tieBalloon(o, j) {
    o.to = j;
    sfx.tie();
    j.sleep = 0;
    if (j.owner) j.owner.tiedOn('balloon');
  }
  popBalloon(o, big = false) {
    this.remove(o);
    sfx.balloonPop(o.s);
    this.bang(big ? 0.9 : 0.5);
    this.fx.push({ k: 'ring', x: o.x, y: o.y, r0: 6 * o.s, r1: 26 * o.s, life: 0.18, t: 0, w: 2 });
    for (let i = 0; i < 9 * this.opts.particles; i++) {
      const a = Math.random() * Math.PI * 2, v = rnd(70, 260);
      this.crumb(o.x + Math.cos(a) * 10 * o.s, o.y + Math.sin(a) * 10 * o.s, 2);
      const f = this.fx[this.fx.length - 1]; if (f) { f.vx = Math.cos(a) * v; f.vy = Math.sin(a) * v; }
    }
    this.word(o.x, o.y, big ? '嘭！！' : '啪！', big ? 24 : 16);
    if (o.to && o.to.owner) o.to.owner.balloonGone();
  }

  /* ─────────────── 绳子 ─────────────── */
  makeRope(ax, ay, bx, by) {
    const len = Math.max(26, hyp(bx - ax, by - ay));
    const n = Math.max(2, Math.round(len / 13)) + 1;
    const rope = { id: nextId++, pts: [], ends: [null, null], L: len, target: null, x0: 0, x1: 0, spanned: false, seg: len / (n - 1) };
    for (let i = 0; i < n; i++) {
      const u = i / (n - 1);
      rope.pts.push(this.addPt(ax + (bx - ax) * u, ay + (by - ay) * u, { r: 1, im: 2.2, rope, part: 'rope' }));
    }
    rope.sticks = [];
    for (let i = 1; i < n; i++) rope.sticks.push(this.addStick(rope.pts[i - 1], rope.pts[i], 'rope', rope.seg));
    rope.max = this.addStick(rope.pts[0], rope.pts[n - 1], 'ropeMax', len * 1.1);
    this.ropes.push(rope);
    while (this.ropes.length > 16) this.removeRope(this.ropes[0]);
    sfx.rope();
    this.tryAttach(rope, 0, 13, 16);
    this.tryAttach(rope, 1, 13, 16);
    this.refreshRope(rope);
    return rope;
  }
  ropeEnd(rope, i) { return i === 0 ? rope.pts[0] : rope.pts[rope.pts.length - 1]; }
  /** 绳头靠到钉子就连上；靠到手腕脚踝就绑上 */
  tryAttach(rope, i, rn, rj) {
    if (rope.ends[i]) return false;
    const pt = this.ropeEnd(rope, i);
    if (this.hand && this.hand.p === pt && !this.hand.moved) return false;
    let nail = null, bd = rn;
    for (const o of this.props) {
      if (o.t !== 'nail' || o.dead) continue;
      const other = rope.ends[1 - i];
      if (other && other.nail === o) continue;
      const d = hyp(o.x - pt.x, o.y - pt.y);
      if (d < bd) { bd = d; nail = o; }
    }
    if (nail) {
      pt.pin = { x: nail.x, y: nail.y, by: nail.id, kind: 'ropeNail' };
      pt.x = nail.x; pt.y = nail.y;
      rope.ends[i] = { nail };
      if (this.hand && this.hand.p === pt) this.hand.p = null;
      sfx.tie();
      this.refreshRope(rope);
      return true;
    }
    const other = rope.ends[1 - i];
    let best = null; bd = rj;
    for (const p of this.pts) {
      if (!p.part || !HANDS_FEET.includes(p.part) || p.hole) continue;
      if (p.owner && p.owner.state === 'draw') continue;
      if (other && other.p === p) continue;
      const d = hyp(p.x - pt.x, p.y - pt.y);
      if (d < bd) { bd = d; best = p; }
    }
    if (best) {
      const stick = this.addStick(pt, best, 'tie', 0.5);
      rope.ends[i] = { p: best, stick };
      if (this.hand && this.hand.p === pt) this.hand.p = null;
      sfx.tie();
      if (best.owner) best.owner.tiedOn('rope');
      best.sleep = 0;
      this.refreshRope(rope);
      return true;
    }
    return false;
  }
  /** 绳子两头的情况变了：决定要不要收紧把人吊起来 */
  refreshRope(rope) {
    const [a, b] = rope.ends;
    rope.spanned = !!(a && b);
    rope.target = null;
    const hook = (n, t) => {
      if (!n || !n.nail || !t || !t.p) return;
      const nailY = n.nail.y, jy = t.p.y;
      if (jy - nailY < 40) return;
      const want = (this.ground - 118 - nailY) / 1.1;
      if (want >= 24 && want < rope.L) rope.target = want;
    };
    hook(a, b); hook(b, a);
  }
  setRopeLen(rope, L) {
    rope.L = L;
    rope.seg = L / (rope.pts.length - 1);
    for (const s of rope.sticks) s.len = rope.seg;
    if (rope.max) rope.max.len = L * 1.1;
  }
  untie(rope, i) {
    const e = rope.ends[i];
    if (!e) return;
    if (e.stick) this.removeStick(e.stick);
    const pt = this.ropeEnd(rope, i);
    if (e.nail) pt.pin = null;
    rope.ends[i] = null;
    rope.cd = 1.2;
    this.refreshRope(rope);
  }
  removeRope(rope) {
    for (const i of [0, 1]) { const e = rope.ends[i]; if (e && e.stick) this.removeStick(e.stick); }
    const set = new Set(rope.pts);
    this.sticks = this.sticks.filter((s) => !set.has(s.a) && !set.has(s.b));
    this.pts = this.pts.filter((p) => !set.has(p));
    this.ropes = this.ropes.filter((r) => r !== rope);
    if (this.hand && set.has(this.hand.p)) this.hand.p = null;
  }
  /** 橡皮擦断绳子：从第 k 段断开，变成两根 */
  cutRope(rope, k) {
    const A = rope.pts.slice(0, k + 1), B = rope.pts.slice(k + 1);
    const ends = rope.ends;
    const mk = (pts, ea, eb) => {
      if (pts.length < 2) {
        // 太短就不留了
        for (const p of pts) { this.sticks = this.sticks.filter((s) => s.a !== p && s.b !== p); this.pts = this.pts.filter((q) => q !== p); }
        return;
      }
      const r = { id: nextId++, pts, ends: [ea, eb], L: rope.seg * (pts.length - 1), target: null, seg: rope.seg, x0: 0, x1: 0, spanned: !!(ea && eb), cd: 1 };
      for (const p of pts) p.rope = r;
      r.sticks = [];
      for (let i = 1; i < pts.length; i++) r.sticks.push(this.addStick(pts[i - 1], pts[i], 'rope', rope.seg));
      r.max = this.addStick(pts[0], pts[pts.length - 1], 'ropeMax', r.L * 1.1);
      this.ropes.push(r);
    };
    // 先把这根绳子自己的杆去掉（绑在人身上的 tie 留着）
    const own = new Set(rope.sticks); own.add(rope.max);
    this.sticks = this.sticks.filter((s) => !own.has(s));
    this.ropes = this.ropes.filter((r) => r !== rope);
    mk(A, ends[0], null); mk(B, null, ends[1]);
    this.wakeAll();
  }
  updateRopes(dt) {
    for (const r of this.ropes) {
      r.cd = (r.cd || 0) - dt;
      if (r.target && r.L > r.target) {
        this.setRopeLen(r, Math.max(r.target, r.L - 120 * dt));
        for (const e of r.ends) if (e && e.p && e.p.owner) e.p.owner.hoistBump();
      }
      if (r.cd <= 0) {
        if (!r.ends[0]) this.tryAttach(r, 0, 9, 8);
        if (!r.ends[1]) this.tryAttach(r, 1, 9, 8);
      }
      let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
      for (const p of r.pts) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); }
      r.x0 = x0; r.x1 = x1; r.y0 = y0; r.y1 = y1;
    }
  }
  /** 有东西从上面落到绳子上 */
  ropeCatch(p, r0, dt) {
    const vy = (p.y - p.py) / dt;
    for (const r of this.ropes) {
      if (!r.spanned || p.x < r.x0 - 2 || p.x > r.x1 + 2 || p.y < r.y0 - r0 - 4 || p.y > r.y1 + r0 + 4) continue;
      if (p.group && r.ends.some((e) => e && e.p && e.p.group === p.group)) continue;
      const q = r.pts;
      for (let i = 1; i < q.length; i++) {
        const a = q[i - 1], b = q[i];
        const n = segNear(p.x, p.y, a.x, a.y, b.x, b.y);
        if (n.d > r0 + 1.5) continue;
        if (p.py > n.cy + 2 || vy < -20) continue;          // 只接从上面来的
        const push = r0 + 1.5 - n.d;
        p.y = n.cy - r0 - 1.5;
        const down = Math.max(0, vy) * dt * 0.5;
        const wa = a.pin ? 0 : 1 - n.t, wb = b.pin ? 0 : n.t;
        a.y += (push + down) * wa; b.y += (push + down) * wb;
        p.py = p.y + Math.max(0, vy) * dt * 0.35;
        p.px += (p.x - p.px) * 0.25;
        if (vy > 200) this.impact(p, vy * 0.5);
        return;
      }
    }
  }

  /** 鼠标硬拽被钉住、绑住的人：拽太狠胳膊腿或者身子会断 */
  checkYank(dt) {
    const h = this.hand;
    if (!h || !h.p || !h.p.owner) { if (h) h.strain = 0; return; }
    const B = h.p.owner;
    if (!B.bonded()) { h.strain = 0; return; }
    let worst = null, ws = 1.5;
    for (const s of this.sticks) {
      if (s.kind !== 'limb' && s.kind !== 'torso' && s.kind !== 'neck') continue;
      if (s.a.owner !== B) continue;
      const k = hyp(s.a.x - s.b.x, s.a.y - s.b.y) / (s.len || 1);
      if (k > ws) { ws = k; worst = s; }
    }
    if (!worst) { h.strain = 0; return; }
    h.strain = (h.strain || 0) + dt;
    if (h.strain > 0.1) {
      h.strain = 0;
      B.cause = 'yank'; B.causeT = 2;
      sfx.stab();
      this.bang(0.6);
      this.word(worst.a.x, worst.a.y - 10, '咔！', 16);
      this.cutStick(worst, 0.5);
    }
  }

  /* ─────────────── 水 ─────────────── */
  rebuildGrid() {
    this.waterDirty = false;
    const gw = Math.ceil(this.w / CELL), gh = Math.ceil(this.ground / CELL);
    this.gw = gw; this.gh = gh;
    const wall = new Uint8Array(gw * gh);
    const mark = (x, y) => {
      const c = Math.floor(x / CELL), r = Math.floor(y / CELL);
      if (c >= 0 && r >= 0 && c < gw && r < gh) wall[r * gw + c] = 1;
    };
    for (const l of this.walls) {
      const q = l.pts;
      for (let i = 1; i < q.length; i++) {
        const a = q[i - 1], b = q[i], d = hyp(b.x - a.x, b.y - a.y), n = Math.max(1, Math.ceil(d));
        for (let k = 0; k <= n; k++) mark(a.x + (b.x - a.x) * k / n, a.y + (b.y - a.y) * k / n);
      }
    }
    this.gWall = wall;
    // 从屏幕边缘灌进来够得着的地方就是「外面」；够不着的就是封闭的框
    const out = new Uint8Array(gw * gh), st = [];
    const push = (i) => { if (!out[i] && !wall[i]) { out[i] = 1; st.push(i); } };
    for (let c = 0; c < gw; c++) push(c);
    for (let r = 0; r < gh; r++) { push(r * gw); push(r * gw + gw - 1); }
    while (st.length) {
      const i = st.pop(), c = i % gw, r = (i - c) / gw;
      if (c > 0) push(i - 1);
      if (c < gw - 1) push(i + 1);
      if (r > 0) push(i - gw);
      if (r < gh - 1) push(i + gw);
    }
    this.gOut = out;
    if (!this.waters.length || !this.waters[0].room) {
      this.waters.unshift({ room: true, level: this.ground, target: this.ground, empty: true, mask: null, top: 0, bottom: this.ground, hx: this.w / 2, built: -1 });
    }
    const keep = [];
    for (const wt of this.waters) {
      wt.mask = new Uint8Array(gw * gh);
      if (wt.room) {
        wt.top = 0; wt.bottom = this.ground; wt.hx = this.w / 2;
        wt.level = Math.min(wt.level, this.ground); wt.target = Math.min(wt.target, this.ground);
        keep.push(wt);
      } else {
        if (!this.closedRegion(wt)) { this.splash(wt.hx || this.w / 2, wt.level, 10); continue; }  // 框破了，水没了
        keep.push(wt);
      }
      wt.built = -1;
      this.fillWater(wt);
    }
    this.waters = keep;
  }
  /** 找到种子点所在的封闭区域，算出顶、底和中心 */
  closedRegion(wt) {
    const { gw, gh, gWall: wall, gOut: out } = this;
    const c0 = clamp(Math.floor(wt.sx / CELL), 0, gw - 1), r0 = clamp(Math.floor(wt.sy / CELL), 0, gh - 1), s0 = r0 * gw + c0;
    if (wall[s0] || out[s0]) return false;
    const seen = new Uint8Array(gw * gh), st = [s0];
    seen[s0] = 1;
    let top = 1e9, bot = -1, sumC = 0, n = 0;
    const cells = [];
    while (st.length) {
      const i = st.pop(), c = i % gw, r = (i - c) / gw;
      cells.push(i); sumC += c; n++;
      if (r < top) top = r;
      if (r > bot) bot = r;
      for (const j of [c > 0 ? i - 1 : -1, c < gw - 1 ? i + 1 : -1, r > 0 ? i - gw : -1, r < gh - 1 ? i + gw : -1]) {
        if (j >= 0 && !seen[j] && !wall[j]) { seen[j] = 1; st.push(j); }
      }
    }
    wt.cells = cells;
    wt.top = top * CELL; wt.bottom = (bot + 1) * CELL;
    wt.hx = (sumC / n + 0.5) * CELL;
    wt.level = clamp(wt.level, wt.top, wt.bottom); wt.target = clamp(wt.target, wt.top, wt.bottom);
    return true;
  }
  /** 水位变了：重新算水占了哪些格子 */
  fillWater(wt) {
    const { gw, gh, gWall: wall, gOut: out } = this;
    if (!gw) return;
    const lr = Math.max(0, Math.floor(wt.level / CELL));
    wt.empty = wt.level >= wt.bottom - 0.5;
    const key = `${lr}|${wt.empty}`;
    if (wt.built === key) { wt.pathDirty = true; return; }
    wt.built = key;
    const m = wt.mask; m.fill(0);
    if (!wt.empty) {
      if (wt.room) {
        // 从地面往上灌，杯子一样的东西水位没过杯口才进得去
        const st = [];
        const push = (i, r) => { if (!m[i] && !wall[i] && out[i] && r >= lr) { m[i] = 1; st.push(i); } };
        for (let c = 0; c < gw; c++) push((gh - 1) * gw + c, gh - 1);
        while (st.length) {
          const i = st.pop(), c = i % gw, r = (i - c) / gw;
          if (c > 0) push(i - 1, r);
          if (c < gw - 1) push(i + 1, r);
          if (r > 0) push(i - gw, r - 1);
          if (r < gh - 1) push(i + gw, r + 1);
        }
      } else {
        for (const i of wt.cells) if ((i - i % gw) / gw >= lr) m[i] = 1;
      }
    }
    wt.pathDirty = true;
  }
  updateWater(dt) {
    for (const wt of this.waters) {
      if (Math.abs(wt.target - wt.level) < 0.05) continue;
      const d = wt.target - wt.level;
      const step = Math.sign(d) * Math.min(Math.abs(d), dt * (60 + Math.abs(d) * 5));
      if (d < 0 && !wt.empty && Math.abs(d) > 4) { wt.pour = (wt.pour || 0) - dt; if (wt.pour <= 0) { wt.pour = 0.14; sfx.water(); } }
      if (d < 0 && wt.empty) this.splash(wt.hx, wt.bottom, 4);
      wt.level += step;
      this.fillWater(wt);
      this.wakeAll();
    }
  }
  waterAt(x, y) {
    if (!this.gw) return null;
    const c = Math.floor(x / CELL), r = Math.floor(y / CELL);
    if (c < 0 || c >= this.gw || r < 0 || r >= this.gh) {
      if (r >= this.gh && c >= 0 && c < this.gw && y <= this.ground + 2) return this.waterAt(x, this.ground - 1);
      return null;
    }
    const i = r * this.gw + c;
    for (const wt of this.waters) if (!wt.empty && wt.mask[i] && y >= wt.level) return wt;
    return null;
  }
  /** 选中水的时候，点中了哪个小点。点在封闭的框里就给它加一个 */
  waterHandleAt(x, y) {
    if (this.waterDirty) this.rebuildGrid();
    let best = null, bd = 30;
    for (const wt of this.waters) {
      const d = hyp(wt.hx - x, Math.min(wt.level, wt.bottom - 1) - y);
      if (d < bd) { bd = d; best = wt; }
    }
    if (best) return best;
    const c = Math.floor(x / CELL), r = Math.floor(y / CELL);
    if (c < 0 || r < 0 || c >= this.gw || r >= this.gh) return null;
    const i = r * this.gw + c;
    if (this.gWall[i] || this.gOut[i]) return null;
    for (const wt of this.waters) if (!wt.room && wt.cells && wt.cells.includes(i)) return wt;
    const wt = { room: false, sx: x, sy: y, level: 0, target: 0, mask: new Uint8Array(this.gw * this.gh), empty: true, built: -1 };
    if (!this.closedRegion(wt)) return null;
    wt.level = wt.bottom; wt.target = wt.bottom;
    if (this.waters.length > 8) this.waters.splice(1, 1);
    this.waters.push(wt);
    this.fillWater(wt);
    sfx.place();
    return wt;
  }
  setWaterTarget(wt, y) { wt.target = clamp(y, wt.top, wt.bottom); }
  splash(x, y, n = 8) {
    for (let i = 0; i < n * this.opts.particles / 2; i++) {
      if (this.fx.length < 240) this.fx.push({ k: 'crumb', x: x + rnd(-12, 12), y, vx: rnd(-90, 90), vy: rnd(-200, -40), r: rnd(1, 2), life: rnd(0.3, 0.6), t: 0 });
    }
  }

  drawWater(c) {
    for (const wt of this.waters) {
      if (wt.empty || !wt.mask) continue;
      if (wt.pathDirty || !wt.path) {
        wt.pathDirty = false;
        const path = new Path2D(), { gw, gh } = this, m = wt.mask;
        wt.tops = [];
        for (let r = 0; r < gh; r++) {
          let c0 = -1;
          for (let k = 0; k <= gw; k++) {
            const on = k < gw && m[r * gw + k];
            if (on && c0 < 0) c0 = k;
            if (!on && c0 >= 0) {
              const y0 = Math.max(r * CELL, wt.level), y1 = (r + 1) * CELL;
              if (y1 > y0) path.rect(c0 * CELL, y0, (k - c0) * CELL, y1 - y0);
              // 这一段上面没水，就是水面
              for (let q = c0; q < k; q++) {
                if (r === 0 || !m[(r - 1) * gw + q]) { wt.tops.push([q * CELL, Math.max(r * CELL, wt.level)]); }
              }
              c0 = -1;
            }
          }
        }
        wt.path = path;
        if (!wt.grad || wt.gradL !== Math.round(wt.level)) {
          const g = c.createLinearGradient(0, wt.level, 0, Math.max(wt.level + 40, wt.bottom));
          g.addColorStop(0, gray(226)); g.addColorStop(1, gray(158));
          wt.grad = g; wt.gradL = Math.round(wt.level);
        }
      }
      c.save();
      c.globalCompositeOperation = 'darken';
      c.fillStyle = wt.grad;
      if (wt.room) { c.fillStyle = wt.grad; }
      c.fill(wt.path);
      c.restore();
      // 水面一条波浪线
      c.strokeStyle = INK; c.lineWidth = 1.5;
      c.beginPath();
      let last = null;
      for (const [x, y] of wt.tops) {
        const a = y + Math.sin(x * 0.11 + this.t * 2.6) * 1.2;
        if (last && x - last[0] <= CELL && Math.abs(last[1] - y) < CELL) c.lineTo(x + CELL, a);
        else { c.moveTo(x, a); c.lineTo(x + CELL, a); }
        last = [x, y];
      }
      c.stroke();
    }
  }
  drawHandles(c) {
    if (!this.showHandles) return;
    for (const wt of this.waters) {
      const y = wt.empty ? wt.bottom - 1 : wt.level;
      art.anchor(c, wt.hx, y, this.w, wt);
    }
  }

  /* ─────────────── 工具效果 ─────────────── */
  dropAnvil(x, s) { sfx.whistle(); return this.addProp({ t: 'anvil', x: clamp(x, 25 * s, this.w - 25 * s), y: -8, s, vy: 40, life: 6.5, seen: new Set() }); }
  placePeel(x, y, s) { sfx.place(); return this.addProp({ t: 'peel', x: clamp(x, 14, this.w - 14), y: Math.min(y, this.ground), s, rest: false }); }
  placeSpring(x, y, s) { sfx.place(); return this.addProp({ t: 'spring', x: clamp(x, 18, this.w - 18), y: Math.min(y, this.ground), s, rest: false }); }
  placeSpikes(x, y, s) {
    const L = 36 * s;
    const hw = this.w, g = this.ground;
    let o;
    if (x < 34 && y < g - 30) o = { x: 3, y: clamp(y, L + 4, g - L), ang: Math.PI / 2 };
    else if (x > hw - 34 && y < g - 30) o = { x: hw - 3, y: clamp(y, L + 4, g - L), ang: -Math.PI / 2 };
    else if (y < 34) o = { x: clamp(x, L + 4, hw - L - 4), y: 3, ang: Math.PI };
    else { const cx = clamp(x, L + 4, hw - L - 4); o = { x: cx, y: this.supportY(cx, y) + 1, ang: 0 }; }
    sfx.stab(); this.bang(0.3);
    return this.addProp({ t: 'spikes', ...o, s, life: 16, rise: 0 });
  }
  strike(x, y, s) {
    let tx = x, ty = this.supportY(x, y < this.ground ? y : 0);
    let target = null, tb = null;
    const reach = 44 * s;
    let bd = reach;
    for (const B of this.bodies) {
      if (!B.j.chest || B.state === 'draw') continue;
      for (const n of ['head', 'chest', 'hip']) {
        const p = B.j[n];
        if (p) { const d = Math.abs(p.x - x); if (d < bd) { bd = d; target = p; tb = B; } }
      }
    }
    if (target) { tx = tb.j.head ? tb.j.head.x : target.x; ty = tb.j.head ? tb.j.head.y : target.y; }
    // 闪电的折线，从天花板打下来
    const pts = [[tx + rnd(-46, 46), 0]];
    const n = 9;
    for (let i = 1; i < n; i++) pts.push([tx + (pts[0][0] - tx) * (1 - i / n) + rnd(-15, 15), ty * i / n]);
    pts.push([tx, ty]);
    const branches = [];
    for (let k = 0; k < 3; k++) {
      const a = pts[2 + (Math.random() * (n - 3) | 0)];
      const dir = Math.random() < 0.5 ? -1 : 1;
      branches.push([a, [a[0] + dir * rnd(14, 30), a[1] + rnd(12, 28)], [a[0] + dir * rnd(34, 56), a[1] + rnd(30, 56)]]);
    }
    this.fx.push({ k: 'bolt', pts, branches, life: 0.22, t: 0, w: 2 + s });
    if (this.opts.flash) this.flashT = Math.max(this.flashT, 0.2);
    this.bang(1.1 * s); this.hitstop = Math.max(this.hitstop, 0.04);
    sfx.zap();
    this.word(tx + 8, Math.max(26, ty - 42), '噼啪！', 18 + 5 * s);
    if (tb) tb.shocked(s);
    else if (ty >= this.ground - 1) { this.scorch(tx, this.ground, 16 * s); this.dust(tx, this.ground, 5); }
  }
  /** 压路机：点在铅笔线附近就从那条线的一头开过去；否则从屏幕边上开进来 */
  startRoller(x, y, s) {
    sfx.rollerTick();
    for (const l of this.walls) {
      if (x < l.x0 - 4 || x > l.x1 + 4) continue;
      const near = l.pts.some((q) => hyp(q.x - x, q.y - y) < 20);
      if (!near || l.x1 - l.x0 < 30) continue;
      const dir = x < (l.x0 + l.x1) / 2 ? 1 : -1, sx = dir > 0 ? l.x0 + 4 : l.x1 - 4;
      const sy = this.supportY(sx, Math.min(l.y0, l.y1) - 2);
      return this.addProp({ t: 'roller', x: sx, y: sy, s, dir, v: 132 + 24 * s, tm: 0 });
    }
    const dir = x < this.w / 2 ? 1 : -1;
    return this.addProp({ t: 'roller', x: dir > 0 ? -28 * s : this.w + 28 * s, y: this.ground, s, dir, v: 132 + 24 * s, tm: 0 });
  }
  freezeAt(x, y, s) {
    sfx.freeze();
    const R = 70 * s;
    this.fx.push({ k: 'ring', x, y, r0: 8, r1: R, life: 0.3, t: 0, w: 2.5 });
    const n = 12 * this.opts.particles;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, d = rnd(0.2, 1) * R;
      this.fx.push({ k: 'flake', x: x + Math.cos(a) * d * 0.3, y: y + Math.sin(a) * d * 0.3, vx: Math.cos(a) * d * 2, vy: Math.sin(a) * d * 2, s: rnd(1.5, 3.5), life: rnd(0.4, 0.9), t: 0 });
    }
    let hit = false;
    for (const B of this.bodies) {
      if (!B.j.chest) continue;
      if (B.all.some((p) => hyp(p.x - x, p.y - y) < R)) { B.freeze(); hit = true; }
    }
    return hit;
  }
  openHole(x, y, s) {
    sfx.holeOpen();
    return this.addProp({ t: 'hole', x: clamp(x, 18, this.w - 18), y: clamp(y, 18, this.ground - 20), s, tm: 0, dur: 2.6 + s * 0.5, k: 0 });
  }
  collapse(o) {
    this.remove(o);
    sfx.holeSpit();
    if (this.opts.flash) this.flashT = Math.max(this.flashT, 0.1);
    this.bang(1.2 * o.s);
    this.fx.push({ k: 'ring', x: o.x, y: o.y, r0: 6, r1: 110 * o.s, life: 0.32, t: 0, w: 3 });
    this.puff(o.x, o.y, 14, { g: 90, life: 0.5, grow: 70 });
    const byBody = new Map();
    for (const p of this.pts) {
      if (p.hole !== o) continue;
      p.hole = null; p.sleep = 0;
      const a = Math.random() * Math.PI * 2, v = rnd(320, 820);
      p.px = p.x - Math.cos(a) * v * DT; p.py = p.y - Math.sin(a) * v * DT;
      if (p.owner) { if (!byBody.has(p.owner)) byBody.set(p.owner, []); byBody.get(p.owner).push(p); }
    }
    for (const [B, list] of byBody) B.spatOut(list, o);
  }

  eraseAt(x, y, r) {
    // 墙和污渍
    this.eraseWalls((q) => hyp(q.x - x, q.y - y) < r, true);
    const d = this.dc;
    d.save(); d.globalCompositeOperation = 'destination-out'; d.beginPath(); d.arc(x, y, r, 0, Math.PI * 2); d.fill(); d.restore();
    // 道具
    for (const o of this.props) {
      if (o.dead || o.t === 'roller' || o.t === 'hole' || o.held) continue;
      const cy = o.t === 'nail' || o.t === 'balloon' ? o.y : o.y - 10 * o.s;
      const rr = o.t === 'nail' ? 6 : o.t === 'balloon' ? 13 * o.s : 12 * o.s;
      if (hyp(o.x - x, cy - y) < r + rr) {
        if (o.t === 'balloon') { this.popBalloon(o); return true; }
        if (o.t === 'spikes') this.unpin(o);
        this.unTrap(o);
        this.remove(o);
        for (let i = 0; i < 12; i++) this.crumb(o.x + rnd(-14, 14), o.y - rnd(0, 20), 2);
        return true;
      }
    }
    // 绳子
    for (const rope of this.ropes) {
      if (x < rope.x0 - r || x > rope.x1 + r || y < rope.y0 - r || y > rope.y1 + r) continue;
      for (let i = 1; i < rope.pts.length; i++) {
        const a = rope.pts[i - 1], b = rope.pts[i];
        if (segNear(x, y, a.x, a.y, b.x, b.y).d < r) {
          for (let k = 0; k < 4; k++) this.crumb(a.x + rnd(-4, 4), a.y + rnd(-4, 4), 1.5);
          this.cutRope(rope, i - 1);
          return true;
        }
      }
    }
    // 身上和散落的东西
    let hit = false;
    for (const p of this.pts.slice()) {
      if (p.part !== 'head' || hyp(p.x - x, p.y - y) > r + p.r * 0.6) continue;
      if (p.owner) { if (p.owner.state === 'draw') continue; p.owner.eraseHead(p); }
      else this.removeHead(p);
      hit = true;
    }
    for (const s of this.sticks.slice()) {
      if (s.kind === 'ice' || s.kind === 'rope' || s.kind === 'ropeMax' || s.kind === 'tie') continue;
      if (s.a.owner && s.a.owner.state === 'draw') continue;
      if (segNear(x, y, s.a.x, s.a.y, s.b.x, s.b.y).d < r) {
        const body = s.a.owner || s.b.owner;
        const mx = (s.a.x + s.b.x) / 2, my = (s.a.y + s.b.y) / 2;
        for (let i = 0; i < 6; i++) this.crumb(mx + rnd(-8, 8), my + rnd(-8, 8), 2);
        if (body) body.erased(s); else this.eraseStick(s);
        hit = true;
      }
    }
    return hit;
  }
  removeHead(p) {
    for (const s of this.sticksOf(p)) this.removeStick(s);
    this.pts = this.pts.filter((q) => q !== p);
    this.prune();
    this.dropTiesTo(p);
    for (let i = 0; i < 10; i++) this.crumb(p.x + rnd(-8, 8), p.y + rnd(-8, 8), 2);
  }
  /** 擦掉一根杆以后，另一头的手脚如果没有别的杆连着，绑着的绳头也要松开 */
  dropTiesIfGone(p, s) {
    if (!p.part || !HANDS_FEET.includes(p.part)) return;
    const others = this.sticks.filter((q) => (q.a === p || q.b === p) && q !== s && q.kind !== 'tie' && q.kind !== 'ice');
    if (!others.length) this.dropTiesTo(p);
  }
  /** 手脚被擦掉、尸体被清掉时，绑在上面的绳头也要松开 */
  dropTiesTo(p) {
    for (const r of this.ropes) r.ends.forEach((e, i) => { if (e && e.p === p) this.untie(r, i); });
    for (const o of this.props) if (o.t === 'balloon' && o.to === p) o.to = null;
  }

  /** 清场：道具、尸体、断肢、铅笔线、绳子、水全部清掉，活人留着 */
  clearAll() {
    for (const o of this.props) { if (o.t === 'spikes' || o.t === 'nail') this.unpin(o); o.dead = true; }
    this.props = [];
    for (const r of this.ropes.slice()) this.removeRope(r);
    this.ropes = [];
    this.walls = [];
    this.fx = [];
    this.waterDirty = true;
    for (const wt of this.waters) if (wt.room) { wt.target = wt.bottom; }
    this.waters = this.waters.filter((wt) => wt.room);
    this.dc.clearRect(0, 0, this.w, this.h);
    this.hand = null; this.eraserT = null; this.stroke = null; this.preview = null; this.ropeDraft = null;
    const keep = new Set();
    for (const b of this.bodies) for (const p of b.all) keep.add(p);
    this.sticks = this.sticks.filter((s) => keep.has(s.a) && keep.has(s.b));
    this.pts = this.pts.filter((p) => keep.has(p));
    for (const p of this.pts) { p.trap = null; p.pin = null; p.hole = null; p.flat = false; p.sleep = 0; }
    for (const b of this.bodies) { if (b.state === 'frozen') b.removeIce(); if (b.state === 'rag') b.ragT = 0.1; }
  }

  /* 特效 */
  bang(a) { if (this.opts.shake) this.shakeA = Math.min(11, this.shakeA + a * 2.6); if (a > 0.9) this.cb.jolt && this.cb.jolt(a); }
  puff(x, y, r, o = {}) { if (this.fx.length < 240) this.fx.push({ k: 'puff', x, y, r, vx: o.vx || 0, vy: o.vy || 0, g: o.g ?? 190, life: o.life ?? 0.5, grow: o.grow ?? 18, t: 0 }); }
  spark(x, y, vx, vy, len) { if (this.fx.length < 240) this.fx.push({ k: 'spark', x, y, vx, vy, len, life: rnd(0.2, 0.42), t: 0 }); }
  word(x, y, text, size = 20) {
    x = clamp(x, size * 1.6, this.w - size * 1.6); y = clamp(y, size + 2, this.h - 6);
    this.fx.push({ k: 'word', x, y, text, size, life: 0.62, t: 0 });
  }
  crumb(x, y, r = 1.5) { if (this.fx.length < 240) this.fx.push({ k: 'crumb', x, y, vx: rnd(-50, 50), vy: rnd(-90, 0), r, life: rnd(0.4, 0.8), t: 0 }); }
  shard(x, y, vx, vy, s) { this.fx.push({ k: 'shard', x, y, vx, vy, s, a: rnd(0, 6), va: rnd(-12, 12), life: rnd(0.7, 1.3), t: 0 }); }
  /** 喷墨：这个世界只有黑白，所以断肢喷出来的是墨水 */
  spurt(x, y, n = 8, dx = 0, dy = -1) {
    const m = Math.round(n * this.opts.particles / 2);
    for (let i = 0; i < m; i++) {
      const v = rnd(80, 340);
      if (this.fx.length < 240) this.fx.push({ k: 'drop', x, y, vx: dx * v + rnd(-130, 130), vy: dy * v + rnd(-130, 60), r: rnd(0.8, 2.2), life: 2.4, t: 0 });
    }
  }
  bubble(x, y) { if (this.fx.length < 240) this.fx.push({ k: 'bubble', x, y, vx: rnd(-8, 8), vy: rnd(-46, -24), r: rnd(1, 2.4), life: rnd(0.5, 1), t: 0 }); }
  dust(x, y, n = 4) {
    const m = n * this.opts.particles / 2;
    for (let i = 0; i < m; i++) this.puff(x + rnd(-14, 14), y - rnd(0, 4), rnd(3, 7), { g: rnd(170, 230), life: rnd(0.25, 0.5), grow: 18, vx: rnd(-46, 46), vy: rnd(-34, -4) });
  }
  stain(x, y, r) {
    const d = this.dc;
    d.fillStyle = INK;
    d.beginPath(); d.ellipse(x, y, r * rnd(1, 1.7), r * rnd(0.5, 1), 0, 0, Math.PI * 2); d.fill();
  }
  scorch(x, y, r) {
    const d = this.dc;
    const g = d.createRadialGradient(x, y, r * 0.1, x, y, r * 1.5);
    g.addColorStop(0, 'rgb(255,25,255)'); g.addColorStop(0.6, 'rgba(255,110,255,.9)'); g.addColorStop(1, 'rgba(255,240,255,0)');
    d.save(); d.fillStyle = g; d.translate(x, y); d.scale(1, 0.2); d.translate(-x, -y);
    d.beginPath(); d.arc(x, y, r * 1.5, 0, Math.PI * 2); d.fill(); d.restore();
  }
  crack(x, y, r) {
    const d = this.dc;
    d.strokeStyle = INK; d.lineWidth = 1.5;
    for (let k = 0; k < 7; k++) {
      let px = x + rnd(-r, r), py = y + 1;
      d.beginPath(); d.moveTo(px, py);
      const dir = px < x ? -1 : 1;
      for (let i = 0; i < 3; i++) { px += dir * rnd(4, 11); py += rnd(1, 5); d.lineTo(px, Math.min(py, this.h - 1)); }
      d.stroke();
    }
  }

  updateFx(dt) {
    const out = [];
    for (const f of this.fx) {
      f.t += dt;
      if (f.t >= f.life) continue;
      switch (f.k) {
        case 'puff': f.x += f.vx * dt; f.y += f.vy * dt; f.r += f.grow * dt; f.vx *= 0.97; f.vy *= 0.97; break;
        case 'spark': f.vy += G * 0.6 * dt; f.x += f.vx * dt; f.y += f.vy * dt; if (f.y > this.ground) { f.y = this.ground; f.vy *= -0.4; f.vx *= 0.7; } break;
        case 'crumb': f.vy += G * 0.7 * dt; f.x += f.vx * dt; f.y += f.vy * dt; if (f.y > this.ground - 1) { f.y = this.ground - 1; f.vy = 0; f.vx = 0; } break;
        case 'flake': f.x += f.vx * dt; f.y += f.vy * dt; f.vx *= 0.92; f.vy *= 0.92; break;
        case 'bubble': f.x += f.vx * dt; f.y += f.vy * dt; break;
        case 'shard': f.vy += G * 0.8 * dt; f.x += f.vx * dt; f.y += f.vy * dt; f.a += f.va * dt; if (f.y > this.ground - 1) { f.y = this.ground - 1; f.vy *= -0.3; f.vx *= 0.6; f.va *= 0.6; } break;
        case 'drop':
          f.vy += G * dt; f.x += f.vx * dt; f.y += f.vy * dt;
          if (f.y >= this.ground) { this.stain(f.x, this.ground + 1, f.r * 1.3); continue; }
          if (f.x < 1 || f.x > this.w - 1) { this.stain(clamp(f.x, 0, this.w), f.y, f.r); continue; }
          break;
        default: break;
      }
      out.push(f);
    }
    this.fx = out;
  }

  drawFx(c) {
    for (const f of this.fx) {
      const u = f.t / f.life;
      switch (f.k) {
        case 'puff': {
          const v = f.g + (255 - f.g) * u * u;
          c.fillStyle = gray(v);
          c.beginPath(); c.arc(f.x, f.y, f.r, 0, Math.PI * 2); c.fill();
          break;
        }
        case 'spark':
          c.strokeStyle = INK; c.lineWidth = 1.3;
          c.beginPath(); c.moveTo(f.x, f.y); c.lineTo(f.x - f.vx * 0.012 * f.len * 0.3, f.y - f.vy * 0.012 * f.len * 0.3); c.stroke();
          break;
        case 'crumb': c.fillStyle = INK; c.fillRect(f.x, f.y, f.r, f.r); break;
        case 'bubble':
          c.strokeStyle = INK; c.lineWidth = 1; c.fillStyle = PAPER;
          c.beginPath(); c.arc(f.x, f.y, f.r, 0, Math.PI * 2); c.fill(); c.stroke();
          break;
        case 'flake':
          c.strokeStyle = INK; c.lineWidth = 1;
          c.beginPath(); c.moveTo(f.x - f.s, f.y); c.lineTo(f.x + f.s, f.y); c.moveTo(f.x, f.y - f.s); c.lineTo(f.x, f.y + f.s); c.stroke();
          break;
        case 'shard':
          c.save(); c.translate(f.x, f.y); c.rotate(f.a);
          c.beginPath(); c.moveTo(-f.s, f.s * 0.6); c.lineTo(f.s, f.s * 0.8); c.lineTo(0, -f.s); c.closePath();
          c.fillStyle = gray(225); c.fill(); c.strokeStyle = INK; c.lineWidth = 1; c.stroke();
          c.restore();
          break;
        case 'drop': c.fillStyle = INK; c.beginPath(); c.arc(f.x, f.y, f.r, 0, Math.PI * 2); c.fill(); break;
        case 'ring':
          c.strokeStyle = INK; c.lineWidth = f.w * (1 - u) + 0.5;
          c.beginPath(); c.arc(f.x, f.y, f.r0 + (f.r1 - f.r0) * (1 - (1 - u) * (1 - u)), 0, Math.PI * 2); c.stroke();
          break;
        case 'bolt': {
          if (Math.floor(f.t * 60) % 3 === 2) break;
          const line = (l, w) => { c.lineWidth = w; c.beginPath(); l.forEach((q, i) => (i ? c.lineTo(q[0], q[1]) : c.moveTo(q[0], q[1]))); c.stroke(); };
          c.lineJoin = 'miter';
          c.strokeStyle = PAPER; line(f.pts, f.w + 3);
          c.strokeStyle = INK; line(f.pts, f.w);
          c.strokeStyle = INK; for (const b of f.branches) line(b, 1.3);
          c.lineJoin = 'round';
          break;
        }
        case 'word': {
          const p = Math.min(1, f.t / 0.08), sc = 0.6 + p * 0.5 - Math.max(0, u - 0.7) * 0.5;
          c.save(); c.translate(f.x, f.y); c.scale(sc, sc); c.rotate(-0.06);
          c.font = `900 ${f.size}px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle';
          c.lineWidth = 6; c.lineJoin = 'round'; c.strokeStyle = PAPER; c.strokeText(f.text, 0, 0);
          c.fillStyle = INK; c.fillText(f.text, 0, 0);
          c.restore();
          break;
        }
        default: break;
      }
    }
  }

  /* 绘制 */
  draw(c) {
    const { w, h, ground } = this;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.fillStyle = PAPER; c.fillRect(0, 0, w, h);
    c.save();
    if (this.shakeA > 0) c.translate(Math.round(rnd(-this.shakeA, this.shakeA)), Math.round(rnd(-this.shakeA, this.shakeA)));
    c.lineCap = 'round'; c.lineJoin = 'round';

    // 地面：一条硬线，线下一层渐淡的网点
    if (!this._floor || this._floorG !== ground) {
      const g = c.createLinearGradient(0, ground, 0, h);
      g.addColorStop(0, gray(120)); g.addColorStop(1, gray(230));
      this._floor = g; this._floorG = ground;
    }
    c.fillStyle = this._floor; c.fillRect(-14, ground, w + 28, h - ground + 14);
    c.fillStyle = INK; c.fillRect(-14, ground, w + 28, 2);
    c.drawImage(this.decal, 0, 0);

    // 铅笔线
    c.strokeStyle = INK; c.lineWidth = 3;
    for (const l of this.walls) {
      c.beginPath();
      l.pts.forEach((q, i) => (i ? c.lineTo(q.x, q.y) : c.moveTo(q.x, q.y)));
      c.stroke();
    }

    // 影子
    c.fillStyle = gray(70);
    const shadow = (x, r, hgt) => {
      const k = clamp(1 - hgt / 300, 0.25, 1);
      c.beginPath(); c.ellipse(x, ground + 2, r * k, 2.4 * k + 0.5, 0, 0, Math.PI * 2); c.fill();
    };
    for (const o of this.props) if (o.t === 'anvil') shadow(o.x, 28 * o.s, ground - o.y);
    for (const b of this.bodies) b.drawShadow(shadow);

    for (const o of this.props) if (!P[o.t].front) P[o.t].draw(this, c, o);
    this.drawRopes(c);
    this.drawSticks(c);
    for (const b of this.bodies) b.draw(c);
    for (const o of this.props) if (P[o.t].front) P[o.t].draw(this, c, o);
    this.drawWater(c);
    this.drawFx(c);
    this.drawHandles(c);
    this.drawTool(c);
    c.restore();

    const inv = this.flashT > 0 || this.bodies.some((b) => b.xrayFlip());
    quantize(c, w, h, inv);
  }

  drawRopes(c) {
    for (const r of this.ropes) {
      const line = () => { c.beginPath(); r.pts.forEach((p, i) => (i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y))); };
      c.strokeStyle = INK; c.lineWidth = 2.6; line(); c.stroke();
      // 一段段的绳纹
      c.strokeStyle = PAPER; c.lineWidth = 0.9; c.setLineDash([2, 3]); line(); c.stroke(); c.setLineDash([]);
      for (const e of r.ends) {
        if (!e || !e.p) continue;
        c.fillStyle = INK; c.beginPath(); c.arc(e.p.x, e.p.y, 3, 0, Math.PI * 2); c.fill();
      }
    }
  }

  drawSticks(c) {
    const vis = this.sticks.filter((s) => s.kind !== 'ice' && s.kind !== 'rope' && s.kind !== 'ropeMax' && s.kind !== 'tie' && !(s.a.hole && s.b.hole) && !(s.a.owner && s.a.owner.state === 'draw'));
    const batch = (arr, w) => {
      if (!arr.length) return;
      c.lineWidth = w + 2.4; c.strokeStyle = PAPER;
      c.beginPath(); for (const s of arr) { c.moveTo(s.a.x, s.a.y); c.lineTo(s.b.x, s.b.y); } c.stroke();
      c.lineWidth = w; c.strokeStyle = INK;
      c.beginPath(); for (const s of arr) { c.moveTo(s.a.x, s.a.y); c.lineTo(s.b.x, s.b.y); } c.stroke();
    };
    const thick = [], thin = [], flat = [];
    for (const s of vis) {
      if (s.a.flat || s.b.flat) flat.push(s);
      else if (s.kind === 'extra') thin.push(s);
      else thick.push(s);
    }
    batch(flat, 2.4); batch(thin, 3); batch(thick, 4);
    for (const p of this.pts) {
      if (p.part !== 'head' || p.hole || p.owner) continue;
      if (p.sleep <= 1) p.ang += (p.x - p.px) / (p.r || 1);
      art.head(c, p.x, p.y, p.r, p.ang, { mood: 'dead', squash: p.flat ? 1 : 0 });
    }
  }

  drawTool(c) {
    const E = this.eraserT;
    if (E) art.eraser(c, E.x, E.y, 1);
    const S = this.stroke;
    if (S) {
      c.strokeStyle = INK; c.lineWidth = 3;
      c.beginPath(); S.pts.forEach((q, i) => (i ? c.lineTo(q.x, q.y) : c.moveTo(q.x, q.y))); c.stroke();
      const q = S.pts[S.pts.length - 1];
      art.pencil(c, q.x, q.y, 1);
    }
    const D = this.ropeDraft;
    if (D) {
      c.strokeStyle = INK; c.lineWidth = 2.6;
      c.beginPath(); c.moveTo(D.ax, D.ay); c.lineTo(D.bx, D.by); c.stroke();
      c.strokeStyle = PAPER; c.lineWidth = 0.9; c.setLineDash([2, 3]);
      c.beginPath(); c.moveTo(D.ax, D.ay); c.lineTo(D.bx, D.by); c.stroke(); c.setLineDash([]);
      c.fillStyle = INK; c.beginPath(); c.arc(D.bx, D.by, 3, 0, Math.PI * 2); c.fill();
    }
    const G0 = this.preview;
    if (G0) {
      const gy = this.supportY(G0.x, G0.y);
      art.ghost(c, G0.id, G0.x, G0.y, G0.s, this.t, gy);
      if (G0.s > 1.02) {
        c.strokeStyle = INK; c.lineWidth = 1.4; c.setLineDash([3, 3]);
        c.beginPath(); c.arc(G0.x, G0.id === 'peel' || G0.id === 'spring' ? gy - 8 : G0.y, 30 * G0.s, 0, Math.PI * 2); c.stroke();
        c.setLineDash([]);
        const label = `×${G0.s.toFixed(1)}`;
        c.font = `800 12px ${FONT}`; c.textAlign = 'center';
        const yy = Math.max(14, G0.y - 30 * G0.s - 6);
        c.lineWidth = 4; c.strokeStyle = PAPER; c.strokeText(label, G0.x, yy);
        c.fillStyle = INK; c.fillText(label, G0.x, yy);
      }
    }
    if (this.cursor.on) art.cursor(c, this.cursor.x, this.cursor.y, 1, !!(this.hand && (this.hand.p || this.hand.o)));
  }

  /* 存档 */
  snapshot() {
    const live = this.pts.filter((p) => !p.hole);
    const idx = new Map(live.map((p, i) => [p, i]));
    const bi = new Map(this.bodies.map((b, i) => [b, i]));
    const r1 = (v) => Math.round(v * 10) / 10;
    const at = (p) => idx.get(p) ?? -1;
    const keep = ['nail', 'peel', 'spring', 'balloon', 'spikes'];
    return {
      v: 2,
      w: this.w, h: this.h, ground: this.ground, drawn: this.drawn, autoDraw: this.autoDraw, hp: Math.round(this.vit.hp), grudge: Math.round(this.grudge),
      pts: live.map((p) => [r1(p.x), r1(p.y), p.r, p.im || 1, p.part || 0, p.owner ? bi.get(p.owner) ?? -1 : -1, p.flat ? 1 : 0, p.corpse ? 1 : 0, p.group || 0, p.pin && typeof p.pin.by === 'number' ? [p.pin.x, p.pin.y, p.pin.by, p.pin.kind] : 0, r1(p.wet || 0)]),
      sticks: this.sticks.filter((s) => s.kind !== 'ice' && idx.has(s.a) && idx.has(s.b)).map((s) => [at(s.a), at(s.b), r1(s.len), s.kind]),
      props: this.props.filter((o) => keep.includes(o.t) && !o.held).map((o) => ({ id: o.id, t: o.t, x: r1(o.x), y: r1(o.y), s: o.s, rest: o.rest, life: o.life, ang: o.ang, rise: o.rise, caught: o.caught, direct: o.direct, to: o.to ? at(o.to) : undefined })),
      walls: this.walls.map((l) => l.pts.map((q) => [r1(q.x), r1(q.y)])),
      ropes: this.ropes.filter((r) => r.pts.every((p) => idx.has(p))).map((r) => ({ pts: r.pts.map(at), L: r1(r.L), seg: r.seg, target: r.target, ends: r.ends.map((e) => (!e ? 0 : e.nail ? { nail: e.nail.id } : { p: at(e.p) })) })),
      waters: this.waters.map((w) => ({ room: w.room, sx: w.sx, sy: w.sy, level: r1(w.target) })),
      bodies: this.bodies.map((b) => b.snapshot(idx)),
    };
  }
  restore(d) {
    if (!d || d.v !== 2) return false;
    try {
      this.drawn = d.drawn || 0; this.autoDraw = d.autoDraw !== false; this.grudge = d.grudge || 0;
      this.bodies = (d.bodies || []).map((_, i) => new Body(this, i));
      this.pts = d.pts.map((a) => ({ x: a[0], y: a[1], px: a[0], py: a[1], r: a[2], im: a[3], part: a[4] || null, owner: a[5] >= 0 ? this.bodies[a[5]] : null, body: a[5] >= 0, flat: !!a[6], corpse: !!a[7], group: a[8] || 0, rope: null, pin: a[9] ? { x: a[9][0], y: a[9][1], by: a[9][2], kind: a[9][3] } : null, trap: null, hole: null, ang: 0, wet: a[10] || 0, sleep: 0, id: nextId++ }));
      this.sticks = d.sticks.filter((a) => this.pts[a[0]] && this.pts[a[1]]).map((a) => ({ a: this.pts[a[0]], b: this.pts[a[1]], len: a[2], kind: a[3] }));
      const maxId = Math.max(0, ...(d.props || []).map((o) => o.id || 0));
      nextId = Math.max(nextId, maxId + 1);
      this.props = (d.props || []).map((o) => ({ vx: 0, vy: 0, ...o, to: o.to != null && o.to >= 0 ? this.pts[o.to] : null }));
      this.walls = (d.walls || []).map((l) => this.makeWall(l.map((q) => ({ x: q[0], y: q[1] }))));
      this.ropes = (d.ropes || []).map((r) => {
        const pts = r.pts.map((i) => this.pts[i]).filter(Boolean);
        const rope = { id: nextId++, pts, L: r.L, seg: r.seg, target: r.target, x0: 0, x1: 0, ends: [null, null], spanned: false };
        for (const p of pts) p.rope = rope;
        rope.sticks = this.sticks.filter((s) => s.kind === 'rope' && pts.includes(s.a));
        rope.max = this.sticks.find((s) => s.kind === 'ropeMax' && pts.includes(s.a));
        rope.ends = r.ends.map((e, i) => {
          if (!e) return null;
          const pt = i === 0 ? pts[0] : pts[pts.length - 1];
          if (e.nail) { const nail = this.props.find((o) => o.id === e.nail); return nail ? { nail } : null; }
          const p = this.pts[e.p];
          if (!p) return null;
          return { p, stick: this.sticks.find((s) => s.kind === 'tie' && ((s.a === pt && s.b === p) || (s.a === p && s.b === pt))) };
        });
        rope.spanned = !!(rope.ends[0] && rope.ends[1]);
        return rope;
      });
      this.bodies.forEach((b, i) => b.restore(d.bodies[i], this.pts));
      this.waters = [];
      this.waterSaved = d.waters || [];
      if (d.ground !== this.ground) {
        const dy = this.ground - d.ground;
        for (const p of this.pts) { p.y += dy; p.py += dy; if (p.pin) p.pin.y += dy; }
        for (const o of this.props) o.y += dy;
        for (const l of this.walls) { for (const q of l.pts) q.y += dy; l.y0 += dy; l.y1 += dy; }
        for (const b of this.bodies) b.gy += dy;
        for (const w of this.waterSaved) { w.level += dy; if (w.sy != null) w.sy += dy; }
      }
      for (const p of this.pts) { if (p.x > this.w - 4) { p.x = this.w - 4; p.px = p.x; } }
      this.waterDirty = true;
      this.rebuildGrid();
      for (const s of this.waterSaved) {
        if (s.room) { this.waters[0].level = s.level; this.waters[0].target = s.level; this.waters[0].built = -1; this.fillWater(this.waters[0]); }
        else {
          const wt = { room: false, sx: s.sx, sy: s.sy, level: s.level, target: s.level, mask: new Uint8Array(this.gw * this.gh), empty: true, built: -1 };
          if (this.closedRegion(wt)) { this.waters.push(wt); this.fillWater(wt); }
        }
      }
      this.vit.hp = d.hp ?? this.vit.max;
      this.focus = this.bodies[0] || null;
      return true;
    } catch (e) { console.warn('读档失败', e); return false; }
  }
}
