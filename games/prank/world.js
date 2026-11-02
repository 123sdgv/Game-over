// 世界：Verlet 物理、地面和铅笔线、所有道具、特效。一个世界单位 = 一个低分辨率像素。
import * as art from './art.js';
import { INK, PAPER, gray, quantize } from './art.js';
import { sfx } from './sfx.js';
import { Body } from './body.js';

export const G = 820;
export const DT = 1 / 120;
const hyp = Math.hypot;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (l) => l[(Math.random() * l.length) | 0];
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

/** 普通往下掉的东西（地雷、香蕉皮、弹簧、回收站） */
function fall(W, o, dt) {
  if (o.held) return false;
  if (o.rest) return true;
  o.vy = (o.vy || 0) + G * dt; o.x += (o.vx || 0) * dt; o.y += o.vy * dt;
  o.x = clamp(o.x, 12, W.w - 12);
  if (o.y >= W.ground) {
    o.y = W.ground; o.vx = 0;
    if (o.vy > 120) { sfx.place(); W.dust(o.x, W.ground, 3); }
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
      o.vy += G * 1.3 * dt; o.y += o.vy * dt; o.x += o.vx * dt;
      const hw = 25 * o.s;
      if (o.x < hw) { o.x = hw; if (Math.abs(o.vx) > 200) W.bang(0.6); o.vx = -o.vx * 0.3; }
      if (o.x > W.w - hw) { o.x = W.w - hw; if (Math.abs(o.vx) > 200) W.bang(0.6); o.vx = -o.vx * 0.3; }
      if (o.y >= W.ground) {
        if (o.vy > 140) {
          const p = Math.min(1.6, o.vy / 600) * o.s;
          sfx.clang(o.s); W.bang(p); W.hitstop = Math.max(W.hitstop, 0.05);
          W.dust(o.x, W.ground, 8); W.word(o.x, W.ground - 46 * o.s, '咣！', 20 + 6 * o.s);
          W.crack(o.x, W.ground, 30 * o.s);
          W.crushProps(o, o.x - hw, o.x + hw);
        }
        o.y = W.ground; o.vy = 0; o.vx *= 0.6; o.rest = true;
      } else o.rest = false;
      W.breakWalls(o.x - hw, o.y - 36 * o.s, o.x + hw, o.y);
    },
    frame(W, o, dt) { if (o.rest && !o.held) { o.life -= dt; if (o.life <= 0) W.vanish(o); } },
    draw(W, c, o) {
      if (o.rest && o.life < 1.2 && Math.sin(o.life * 18) > 0) return;
      art.anvil(c, o.x, o.y, o.s);
    },
    front: true,
  },

  bomb: {
    sub(W, o, dt) {
      if (o.held) return;
      W.circle(o, 12 * o.s, dt);
    },
    frame(W, o, dt) {
      o.fuse -= dt;
      o.tick = (o.tick || 0) - dt;
      if (o.tick <= 0) { o.tick = o.fuse < 0.8 ? 0.09 : 0.26; sfx.tick(); }
      if (o.fuse <= 0) { W.remove(o); W.explode(o.x, o.y, 92 * o.s, o.s, 'bomb'); }
    },
    draw(W, c, o) { art.bomb(c, o.x, o.y, o.s, W.t, true, o.fuse < 0.8 ? 1 : 0); },
    front: true,
  },

  mine: {
    frame(W, o, dt) {
      if (!fall(W, o, dt) || o.held) return;
      o.arm = (o.arm || 0) + dt;
      if (o.boomT > 0) {
        o.boomT -= dt;
        if (o.boomT <= 0) { W.remove(o); W.explode(o.x, o.y - 4, 86 * o.s, o.s * 1.05, 'mine', true); }
        return;
      }
      if (o.arm < 0.35) return;
      const hw = 15 * o.s + 3;
      for (const p of W.pts) {
        if (p.hole || p.pin) continue;
        if (Math.abs(p.x - o.x) < hw && p.y > o.y - 12 * o.s - p.r) {
          o.boomT = 0.13; sfx.mineClick();
          W.word(o.x, o.y - 24, '咔', 15);
          break;
        }
      }
    },
    draw(W, c, o) { art.mine(c, o.x, o.y, o.s, Math.sin(W.t * 7) > 0 || o.boomT > 0); },
  },

  peel: {
    frame(W, o, dt) {
      if (!fall(W, o, dt) || o.held) return;
      o.cd = (o.cd || 0) - dt;
      const B = W.B;
      if (o.cd <= 0 && B.canSlip()) {
        for (const n of ['lFo', 'rFo']) {
          const f = B.j[n];
          if (f && Math.abs(f.x - o.x) < 11 * o.s + 3 && f.y > o.y - 8) { B.slip(o); o.cd = 1.6; o.vx = B.dir * 110; o.vy = -60; o.rest = false; break; }
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
        if (p.hole || p.pin || p.trap) continue;
        if (Math.abs(p.x - o.x) < hw && p.y + p.r > top) { hit = true; break; }
      }
      if (hit) {
        o.press = 1; o.cd = 0.4;
        sfx.boing(o.s);
        const up = 690 + 190 * o.s;
        const B = W.B;
        const side = (Math.random() < 0.5 ? -1 : 1) * rnd(90, 210);
        for (const p of W.pts) {
          if (p.hole || p.pin) continue;
          if (Math.abs(p.x - o.x) < hw + 34 && p.y > top - 96 && p.y < o.y + 4) {
            p.py = p.y + up * DT;
            p.px = p.x - (side + rnd(-30, 30)) * DT;
          }
        }
        if (B.alive && hyp(B.j.hip.x - o.x, B.j.hip.y - top) < 120) B.launched(o);
        for (const q of W.props) if (q.t === 'bomb' && Math.abs(q.x - o.x) < hw + 10 && q.y > top - 20) q.vy = -up;
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
        if (p.pin || p.hole || p.im === 0) continue;
        const dx = p.x - o.x, dy = p.y - o.y;
        const lx = dx * cs + dy * sn, ly = -dx * sn + dy * cs;
        if (Math.abs(lx) < L / 2 + 1 && ly < p.r * 0.2 && ly > -H - p.r) {
          const v = hyp(p.x - p.px, p.y - p.py) / DT;
          if ((v > 70 || o.rise < 1) && (o.pinned || 0) < 5) {
            p.pin = { x: p.x, y: p.y, by: o.id };
            o.pinned = (o.pinned || 0) + 1;
            sfx.stab();
            W.spurt(p.x, p.y, 5, sn, -cs);
            W.B.stabbed(p, o);
          }
        }
      }
    },
    draw(W, c, o) { art.spikes(c, o.x, o.y, o.s, o.ang, o.rise || 0); },
  },

  rocket: {
    sub(W, o, dt) {
      o.tm += dt;
      const B = W.B;
      if (o.st === 'wait') {
        if (o.tm > 0.42) { o.st = 'seek'; o.tm = 0; sfx.launch(); }
        return;
      }
      o.smk = (o.smk || 0) - dt;
      if (o.smk <= 0) {
        o.smk = 0.035;
        W.puff(o.x - Math.cos(o.ang) * 18 * o.s, o.y - Math.sin(o.ang) * 18 * o.s, rnd(4, 8), { g: rnd(130, 220), life: rnd(0.3, 0.6), grow: 22, vx: rnd(-16, 16), vy: rnd(-16, 16) });
      }
      o.snd = (o.snd || 0) - dt;
      if (o.snd <= 0) { o.snd = 0.09; sfx.rocketTick(); }
      if (o.st === 'seek') {
        const tgt = B.alive || B.j.chest ? B.j.chest : null;
        if (tgt) {
          const want = Math.atan2(tgt.y - o.y, tgt.x - o.x);
          let d = want - o.ang;
          while (d > Math.PI) d -= Math.PI * 2;
          while (d < -Math.PI) d += Math.PI * 2;
          o.ang += clamp(d, -dt * 3.8, dt * 3.8);
        }
        o.v = Math.min(o.v + dt * 720, 380);
        o.x += Math.cos(o.ang) * o.v * dt;
        o.y += Math.sin(o.ang) * o.v * dt;
        if (o.y > W.ground - 3 || o.y < 3 || o.x < 3 || o.x > W.w - 3) {
          if (o.tm > 0.55 || o.y < 3) { W.remove(o); W.explode(o.x, o.y, 78 * o.s, o.s, 'rocket'); return; }
          o.y = Math.min(o.y, W.ground - 3);
        }
        if (o.tm > 4) { W.remove(o); W.explode(o.x, o.y, 78 * o.s, o.s, 'rocket'); return; }
        for (const p of B.all) {
          if (hyp(p.x - o.x, p.y - o.y) < 11 + p.r) { W.strap(o, p); break; }
        }
        return;
      }
      // 绑上了：带着他乱飞
      const p = o.p;
      o.x = p.x; o.y = p.y;
      o.wander = (o.wander || 0) + rnd(-1, 1) * dt * 42;
      o.wander *= 0.985;
      o.ang += o.wander * dt;
      // 快撞墙了往回拐，别一头顶着不动
      const cx = Math.cos(o.ang), cy = Math.sin(o.ang);
      const fx = o.x + cx * 46, fy = o.y + cy * 46;
      if (fx < 8 || fx > W.w - 8 || fy < 8 || fy > W.ground - 8) {
        const want = Math.atan2(W.ground * 0.45 - o.y, W.w / 2 - o.x);
        let d = want - o.ang;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        o.ang += clamp(d, -dt * 6.4, dt * 6.4);
      }
      const a = 1560 * dt * dt;
      if (p.body) {
        for (const q of B.all) {
          if (q.pin || q.hole || q.im === 0) continue;
          q.x += cx * a; q.y += cy * a;
          q.px += (q.x - q.px) * 0.018; q.py += (q.y - q.py) * 0.018;
        }
      }
      if (!p.pin && !p.hole && p.im !== 0) { const e = 3600 * dt * dt; p.x += cx * e; p.y += cy * e; }
      if (o.tm > o.dur || !W.pts.includes(p)) { W.remove(o); W.explode(o.x, o.y, 78 * o.s, o.s * 1.05, 'rocket'); }
    },
    draw(W, c, o) { art.rocket(c, o.x, o.y, o.s, o.ang, W.t, o.st !== 'wait'); },
    front: true,
  },

  hole: {
    sub(W, o, dt) {
      o.tm += dt;
      const k = o.tm < 0.3 ? o.tm / 0.3 : o.tm > o.dur - 0.25 ? Math.max(0, (o.dur - o.tm) / 0.25) : 1;
      o.k = k;
      const R = 190 * o.s, r = 17 * o.s * k + 1;
      const a = (6200 + 2600 * o.s) * dt * dt;
      for (const p of W.pts) {
        if (p.hole || p.pin || p.im === 0) { continue; }
        const dx = o.x - p.x, dy = o.y - p.y, d = hyp(dx, dy) || 1;
        if (d > R) continue;
        const f = (1 - d / R) * (1 - d / R) * a * k + a * 0.05 * k;
        p.x += (dx / d) * f - (dy / d) * f * 0.55;
        p.y += (dy / d) * f + (dx / d) * f * 0.55;
        if (d < r) {
          p.hole = o; o.eaten = (o.eaten || 0) + 1;
          if (p.body) W.B.sucked(p, o);
        }
      }
      const hip = W.B.j.hip;
      if (hip && W.B.alive && k > 0.5 && hyp(hip.x - o.x, hip.y - o.y) < R * 0.72) W.B.sucked(hip, o);
      for (const q of W.props) {
        if (q === o || q.dead || q.t === 'hole' || q.t === 'spikes' || q.t === 'roller' || q.held) continue;
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
    shadow: false,
  },

  roller: {
    solidRoller: true,
    sub(W, o, dt) {
      o.x += o.dir * o.v * dt;
      o.tm += dt;
      o.snd = (o.snd || 0) - dt;
      if (o.snd <= 0) { o.snd = 0.17; sfx.rollerTick(); W.bang(0.1 * o.s); }
      o.smk = (o.smk || 0) - dt;
      if (o.smk <= 0) {
        o.smk = 0.28;
        W.puff(o.x - o.dir * 83 * o.s, W.ground - 46 * o.s, rnd(3, 5) * o.s, { g: rnd(90, 180), life: 0.9, grow: 11, vy: -38, vx: rnd(-8, 8) - o.dir * 10 });
      }
      const R = 24 * o.s, dx0 = R * 0.92;
      for (const p of W.pts) {
        if (p.hole || p.im === 0) continue;
        const dx = p.x - o.x;
        if (Math.abs(dx) < dx0 && p.y > W.ground - R * 2 - p.r - 16) {
          if (W.B.all.includes(p)) { W.B.flatten('roller', 56 * o.s); }
          else { p.flat = true; p.y = W.ground - 1; p.py = p.y; }
        }
      }
      const a = o.x - dx0, b = o.x + dx0;
      W.crushProps(o, a, b);
      W.breakWalls(a, W.ground - R * 2, b, W.ground);
      const back = o.x - o.dir * 112 * o.s;
      if ((o.dir > 0 && back > W.w + 20) || (o.dir < 0 && back < -20)) W.remove(o);
    },
    draw(W, c, o) { art.roller(c, o.x, W.ground + 1, o.s, o.dir, o.dir * o.x * 0.1 / Math.max(0.5, o.s)); },
    front: true,
  },

  bin: {
    solid: true,
    box: (o) => ({ hw: 17 * o.s, h: 46 * o.s }),
    frame(W, o, dt) {
      if (o.t0 == null) o.t0 = 0;
      if (o.shake > 0) o.shake -= dt;
      const was = o.rest;
      const moving = !was && !o.held;
      fall(W, o, dt);
      if (!was && o.rest) { W.bang(0.4); o.life = 18; }
      if (o.rest && !o.held) { o.life -= dt; if (o.life <= 0) { W.vanish(o); return; } }
      const B = W.B;
      if (!B.alive && !B.j.chest) return;
      const hw = 17 * o.s + 2, top = o.y - 46 * o.s;
      const core = [B.j.hip, B.j.chest, B.j.head];
      for (const p of core) {
        if (!p) continue;
        const inMouth = Math.abs(p.x - o.x) < hw && p.y > top - 8 && p.y < o.y;
        if (inMouth && (moving || B.state === 'rag' || B.state === 'frozen' || B.state === 'flat')) { W.askBin(o); return; }
      }
    },
    draw(W, c, o) {
      const dx = o.shake > 0 ? Math.sin(W.t * 60) * 2 : 0;
      art.bin(c, o.x + dx, o.y, o.s);
    },
  },
};

/* ─────────────── 世界 ─────────────── */

let nextId = 1;

export class World {
  constructor(cb = {}) {
    this.cb = cb;
    this.w = 480; this.h = 260; this.ground = 238;
    this.pts = []; this.sticks = []; this.props = []; this.walls = []; this.fx = [];
    this.t = 0; this.acc = 0;
    this.flashT = 0; this.shakeA = 0; this.hitstop = 0;
    this.slow = false; this.paused = false;
    this.opts = { particles: 2, shake: true, flash: true };
    this.decal = document.createElement('canvas');
    this.dc = this.decal.getContext('2d');
    this.hand = null; this.sawT = null; this.eraserT = null; this.stroke = null; this.preview = null;
    this.B = new Body(this);
    this.say = (...a) => this.cb.say && this.cb.say(...a);
  }

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
      p.y += dy; p.py += dy;
      if (p.pin) p.pin.y += dy;
      if (p.x > w - 4) { const d = p.x - (w - 4); p.x -= d; p.px -= d; if (p.pin) p.pin.x -= d; }
    }
    for (const o of this.props) { o.y += dy; o.x = Math.min(o.x, w - 12); }
    for (const l of this.walls) for (const q of l.pts) { q.y += dy; q.x = Math.min(q.x, w - 2); }
    this.B.onResize(dy);
  }

  /* 点和杆 */
  addPt(x, y, o = {}) {
    const p = { x, y, px: x, py: y, r: o.r ?? 2, im: o.im ?? 1, part: o.part || null, body: !!o.body, pin: null, trap: null, hole: null, ang: 0, flat: false, id: nextId++ };
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

  /** 从 t 的位置切断一根杆，两头都留下断茬 */
  cutStick(s, t = 0.5, spurt = true) {
    const { a, b, kind, len } = s;
    this.removeStick(s);
    const x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t;
    if (t > 0.14 && t < 0.86) {
      const m1 = this.addPt(x, y, { body: a.body }); this.addStick(a, m1, kind, len * t);
      const m2 = this.addPt(x, y, { body: b.body }); this.addStick(m2, b, kind, len * (1 - t));
      m1.px = x - rnd(-40, 40) * DT; m2.px = x - rnd(-40, 40) * DT;
    }
    if (spurt) this.spurt(x, y, 10);
    this.prune();
    this.B.recalc();
    return { x, y };
  }
  /** 整根抹掉（橡皮） */
  eraseStick(s) {
    this.removeStick(s);
    this.prune();
    this.B.recalc();
  }
  /** 没有杆连着的点（脑袋除外）就没用了 */
  prune() {
    const used = new Set();
    for (const s of this.sticks) { used.add(s.a); used.add(s.b); }
    this.pts = this.pts.filter((p) => used.has(p) || p.part === 'head' || p.part === 'shard');
  }

  /* 物理 */
  update(rdt) {
    rdt = Math.min(rdt, 1 / 20);
    if (this.paused) return;
    this.t += rdt;
    if (this.hitstop > 0) { this.hitstop -= rdt; this.updateFx(rdt * 0.3); return; }
    const dt = this.slow ? rdt * 0.32 : rdt;
    this.acc += dt;
    let n = 0;
    while (this.acc >= DT && n < 8) { this.sub(DT); this.acc -= DT; n++; }
    if (n === 8) this.acc = 0;
    this.B.update(dt);
    for (const o of this.props) { const f = P[o.t].frame; if (f && !o.dead) f(this, o, dt); }
    this.props = this.props.filter((o) => !o.dead);
    this.updateFx(dt);
    this.flashT = Math.max(0, this.flashT - rdt);
    this.shakeA *= Math.pow(0.0015, rdt);
    if (this.shakeA < 0.2) this.shakeA = 0;
  }

  sub(dt) {
    const pts = this.pts, g = G * dt * dt, B = this.B;
    for (const p of pts) {
      if (p.pin) { p.x = p.pin.x; p.y = p.pin.y; p.px = p.x; p.py = p.y; continue; }
      if (p.hole) { p.x = p.hole.x; p.y = p.hole.y; p.px = p.x; p.py = p.y; continue; }
      if (p.im === 0) continue;
      let vx = p.x - p.px, vy = p.y - p.py;
      const sp = hyp(vx, vy);
      if (sp > 15) { vx *= 15 / sp; vy *= 15 / sp; }
      p.px = p.x; p.py = p.y;
      p.x += vx * 0.9994; p.y += vy * 0.9994 + g;
    }
    B.control(dt);
    const h = this.hand;
    if (h) {
      const nx = h.x + (h.tx - h.x) * 0.45, ny = h.y + (h.ty - h.y) * 0.45;
      h.vx += ((nx - h.x) / dt - h.vx) * 0.16; h.vy += ((ny - h.y) / dt - h.vy) * 0.16;
      h.x = nx; h.y = ny;
      if (h.p) { h.p.x = h.x; h.p.y = h.y; h.p.px = h.x - h.vx * dt; h.p.py = h.y - h.vy * dt; }
      if (h.o) { h.o.x = h.x; h.o.y = h.y + h.oy; h.o.vx = h.vx; h.o.vy = h.vy; }
    }
    for (const o of this.props) { const f = P[o.t].sub; if (f && !o.dead) f(this, o, dt); }
    for (let it = 0; it < 5; it++) {
      for (const s of this.sticks) {
        const a = s.a, b = s.b;
        const wa = a.pin || a.hole ? 0 : a.im, wb = b.pin || b.hole ? 0 : b.im;
        const w = wa + wb;
        if (w === 0) continue;
        const dx = b.x - a.x, dy = b.y - a.y, d = hyp(dx, dy) || 0.001;
        const f = (d - s.len) / d / w;
        a.x += dx * f * wa; a.y += dy * f * wa;
        b.x -= dx * f * wb; b.y -= dy * f * wb;
      }
    }
    for (const p of this.pts) this.collide(p, dt);
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
      if (v > 200) this.B.impact(p, v);
    }
    if (p.y - r < 0) {
      const v = (p.py - p.y) / dt;
      p.y = r; p.py = p.y - v * dt * 0.3; p.px += (p.x - p.px) * 0.2;
      if (v > 200) this.B.impact(p, v);
    }
    if (p.x - r < 0) {
      const v = (p.px - p.x) / dt;
      p.x = r; p.px = p.x - v * dt * 0.3; p.py += (p.y - p.py) * 0.2;
      if (v > 200) this.B.impact(p, v);
    }
    if (p.x + r > this.w) {
      const v = (p.x - p.px) / dt;
      p.x = this.w - r; p.px = p.x + v * dt * 0.3; p.py += (p.y - p.py) * 0.2;
      if (v > 200) this.B.impact(p, v);
    }
    // 铅笔线
    for (const l of this.walls) {
      if (p.x < l.x0 - r - 3 || p.x > l.x1 + r + 3 || p.y < l.y0 - r - 3 || p.y > l.y1 + r + 3) continue;
      const q = l.pts;
      for (let i = 1; i < q.length; i++) {
        const a = q[i - 1], b = q[i];
        const n = segNear(p.x, p.y, a.x, a.y, b.x, b.y);
        if (n.d < r + 1.6) {
          let nx = p.x - n.cx, ny = p.y - n.cy;
          if (n.d < 0.01) { const pn = segNear(p.px, p.py, a.x, a.y, b.x, b.y); nx = p.px - pn.cx; ny = p.py - pn.cy; }
          const ln = hyp(nx, ny) || 1; nx /= ln; ny /= ln;
          const vx = (p.x - p.px) / dt, vy = (p.y - p.py) / dt;
          const vn = vx * nx + vy * ny;
          p.x = n.cx + nx * (r + 1.7); p.y = n.cy + ny * (r + 1.7);
          if (vn < 0) {
            const tx = vx - vn * nx, ty = vy - vn * ny;
            const nvx = tx * 0.72 - vn * nx * 0.18, nvy = ty * 0.72 - vn * ny * 0.18;
            p.px = p.x - nvx * dt; p.py = p.y - nvy * dt;
            if (vn < -200) this.B.impact(p, -vn);
          }
        } else if (hyp(p.x - p.px, p.y - p.py) > 2) {
          const c = segSeg(p.px, p.py, p.x, p.y, a.x, a.y, b.x, b.y);
          if (c.d === 0) { const v = hyp(p.x - p.px, p.y - p.py) / dt; p.x = p.px; p.y = p.py; p.px = p.x + (p.x - p.px) * 0.2; if (v > 200) this.B.impact(p, v); }
        }
      }
    }
    // 铁砧和回收站这种实心的东西
    for (const o of this.props) {
      if (!P[o.t].solid || o.dead) continue;
      if (o.t === 'bin' && (!o.rest || o.held)) continue; // 回收站掉下来是把他扣住，不是撞他
      const box = P[o.t].box(o), hw = box.hw + r, h = box.h;
      if (Math.abs(p.x - o.x) >= hw || p.y + r <= o.y - h || p.y - r >= o.y) continue;
      const pvx = (p.x - p.px) / dt, pvy = (p.y - p.py) / dt;
      const ovx = o.vx || 0, ovy = o.vy || 0;
      const rel = hyp(pvx - ovx, pvy - ovy);
      if (o.t === 'anvil' && ovy > 110) {
        p.trap = o;
        p.y = Math.min(o.y, this.ground) - Math.min(r, 3); p.py = p.y;
        this.B.crushed(p, o, ovy);
        continue;
      }
      const L = p.x - (o.x - hw), R = o.x + hw - p.x, T = p.y + r - (o.y - h);
      if (T < L && T < R) {
        p.y = o.y - h - r;
        if (pvy > ovy) { p.py = p.y + (pvy - ovy) * dt * 0.2; if (rel > 220) this.B.impact(p, rel); }
        p.px += (p.x - p.px) * 0.34;
      } else if (L < R) {
        p.x = o.x - hw;
        p.px = p.x - Math.min(0, pvx - ovx) * dt * 0.25 - ovx * dt;
        if (rel > 220) { this.B.impact(p, rel, o); }
      } else {
        p.x = o.x + hw;
        p.px = p.x - Math.max(0, pvx - ovx) * dt * 0.25 - ovx * dt;
        if (rel > 220) { this.B.impact(p, rel, o); }
      }
    }
  }

  /** 一个球形道具（炸弹）的运动 */
  circle(o, r, dt) {
    o.vy += G * dt;
    o.x += o.vx * dt; o.y += o.vy * dt;
    if (o.y + r > this.ground) {
      o.y = this.ground - r;
      if (o.vy > 90) { sfx.place(); }
      o.vy = -o.vy * 0.42; o.vx *= 0.94;
      if (Math.abs(o.vy) < 26) o.vy = 0;
    }
    if (o.y - r < 0) { o.y = r; o.vy = Math.abs(o.vy) * 0.5; }
    if (o.x - r < 0) { o.x = r; o.vx = Math.abs(o.vx) * 0.6; }
    if (o.x + r > this.w) { o.x = this.w - r; o.vx = -Math.abs(o.vx) * 0.6; }
    for (const l of this.walls) {
      const q = l.pts;
      if (o.x < l.x0 - r || o.x > l.x1 + r || o.y < l.y0 - r || o.y > l.y1 + r) continue;
      for (let i = 1; i < q.length; i++) {
        const n = segNear(o.x, o.y, q[i - 1].x, q[i - 1].y, q[i].x, q[i].y);
        if (n.d < r + 1.5) {
          const nx = (o.x - n.cx) / (n.d || 1), ny = (o.y - n.cy) / (n.d || 1);
          o.x = n.cx + nx * (r + 1.5); o.y = n.cy + ny * (r + 1.5);
          const vn = o.vx * nx + o.vy * ny;
          if (vn < 0) { o.vx -= vn * nx * 1.4; o.vy -= vn * ny * 1.4; }
        }
      }
    }
    // 轻轻碰到他就停一点（不算伤害）
    for (const p of this.B.all) {
      if (hyp(p.x - o.x, p.y - o.y) < r + p.r + 2) { o.vx *= 0.9; break; }
    }
  }

  /** 他脚底下的落脚点：地面或者铅笔线 */
  supportY(x, y) {
    let best = this.ground;
    for (const l of this.walls) {
      if (x < l.x0 || x > l.x1) continue;
      const q = l.pts;
      for (let i = 1; i < q.length; i++) {
        const a = q[i - 1], b = q[i];
        const lo = Math.min(a.x, b.x), hi = Math.max(a.x, b.x);
        if (x < lo || x > hi || hi - lo < 0.01) continue;
        const sl = Math.abs((b.y - a.y) / (b.x - a.x));
        if (sl > 1.5) continue;
        const yy = a.y + (b.y - a.y) * (x - a.x) / (b.x - a.x);
        if (yy >= y - 8 && yy < best) best = yy;
      }
    }
    return best;
  }

  /** 前面有没有挡路的东西（走路时绕开） */
  obstacleAhead(x, dir, gy) {
    const nx = x + dir * 16;
    for (const o of this.props) {
      if (o.t === 'spikes' && o.ang === 0 && Math.abs(o.x - nx) < 36 * o.s + 4) return true;
      if ((o.t === 'anvil' && o.rest) && Math.abs(o.x - nx) < 25 * o.s + 4) return true;
      if (o.t === 'bin' && Math.abs(o.x - nx) < 18 * o.s + 4) return true;
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

  threatNear(x, y) {
    let best = null, bd = 1e9;
    const take = (tx, r, kind) => { const d = Math.abs(tx - x); if (d < r && d < bd) { bd = d; best = { x: tx, d, kind }; } };
    for (const o of this.props) {
      if (o.t === 'bomb') take(o.x, 115 * o.s, 'bomb');
      else if (o.t === 'rocket' && o.st !== 'strap') take(o.x, 100, 'rocket');
      else if (o.t === 'roller') {
        const ahead = (x - o.x) * o.dir;
        if (ahead > -30) take(o.x, 160 + 40 * o.s, 'roller');
      } else if (o.t === 'hole') take(o.x, 190 * o.s, 'hole');
    }
    if (this.sawT) take(this.sawT.x, 96, 'saw');
    return best;
  }

  /* 道具 */
  addProp(o) {
    const q = { id: nextId++, vx: 0, vy: 0, s: 1, ...o };
    this.props.push(q);
    return q;
  }
  remove(o) { o.dead = true; if (this.hand && this.hand.o === o) { this.hand.o = null; } }
  vanish(o) {
    this.remove(o);
    this.puff(o.x, o.y - 12, 16 * o.s, { g: 200, life: 0.3, grow: 30 });
    this.unTrap(o);
    sfx.pop();
  }
  unTrap(o) { for (const p of this.pts) if (p.trap === o) p.trap = null; }
  unpin(o) {
    for (const p of this.pts) if (p.pin && p.pin.by === o.id) p.pin = null;
    o.pinned = 0;
  }
  /** 东西被碾、被砧子砸中 */
  crushProps(by, a, b) {
    for (const q of this.props) {
      if (q === by || q.dead || q.held) continue;
      if (q.x < a - 6 || q.x > b + 6) continue;
      if (by.t === 'anvil' && q.y < by.y - 40 * by.s) continue;
      if (q.t === 'bomb' || q.t === 'mine') { this.remove(q); this.explode(q.x, q.y - 3, (q.t === 'bomb' ? 92 : 86) * q.s, q.s, q.t); }
      else if (q.t === 'peel' || q.t === 'spring' || q.t === 'bin') { this.remove(q); this.dust(q.x, this.ground, 4); }
    }
  }
  breakWalls(x0, y0, x1, y1) {
    for (const l of this.walls) {
      if (l.x1 < x0 || l.x0 > x1 || l.y1 < y0 || l.y0 > y1) continue;
      this.eraseWalls((q) => q.x >= x0 && q.x <= x1 && q.y >= y0 && q.y <= y1, true);
      return;
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
    if (hit) { this.walls = []; for (const q of out) this.walls.push(this.makeWall(q)); }
    return hit;
  }
  makeWall(pts) {
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    for (const q of pts) { x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); y0 = Math.min(y0, q.y); y1 = Math.max(y1, q.y); }
    return { pts, x0, x1, y0, y1 };
  }
  addWall(pts) {
    this.walls.push(this.makeWall(pts));
    if (this.walls.length > 24) this.walls.shift();
  }

  /* 工具效果 */
  dropAnvil(x, s) { sfx.whistle(); return this.addProp({ t: 'anvil', x: clamp(x, 25 * s, this.w - 25 * s), y: -8, s, vy: 40, life: 6.5 }); }
  dropBomb(x, y, s) { sfx.place(); return this.addProp({ t: 'bomb', x: clamp(x, 14, this.w - 14), y: Math.min(y, this.ground - 12 * s), s, fuse: 2.1 + s * 0.2, vx: 0, vy: 0 }); }
  placeMine(x, y, s) { sfx.place(); return this.addProp({ t: 'mine', x: clamp(x, 16, this.w - 16), y: Math.min(y, this.ground), s, rest: y >= this.ground }); }
  placePeel(x, y, s) { sfx.place(); return this.addProp({ t: 'peel', x: clamp(x, 14, this.w - 14), y: Math.min(y, this.ground), s, rest: y >= this.ground }); }
  placeSpring(x, y, s) { sfx.place(); return this.addProp({ t: 'spring', x: clamp(x, 18, this.w - 18), y: Math.min(y, this.ground), s, rest: y >= this.ground }); }
  placeSpikes(x, y, s) {
    const L = 36 * s;
    const hw = this.w, g = this.ground;
    let o;
    if (x < 34 && y < g - 30) o = { x: 3, y: clamp(y, L + 4, g - L), ang: Math.PI / 2 };
    else if (x > hw - 34 && y < g - 30) o = { x: hw - 3, y: clamp(y, L + 4, g - L), ang: -Math.PI / 2 };
    else if (y < 34) o = { x: clamp(x, L + 4, hw - L - 4), y: 3, ang: Math.PI };
    else o = { x: clamp(x, L + 4, hw - L - 4), y: g + 1, ang: 0 };
    sfx.stab(); this.bang(0.3);
    return this.addProp({ t: 'spikes', ...o, s, life: 16, rise: 0 });
  }
  strike(x, y, s) {
    const B = this.B;
    let tx = x, ty = this.supportY(x, 0);
    let target = null;
    const reach = 44 * s;
    if (B.j.chest && !B.gone) {
      let bd = reach;
      for (const n of ['head', 'chest', 'hip']) {
        const p = B.j[n];
        if (p) { const d = Math.abs(p.x - x); if (d < bd) { bd = d; target = p; } }
      }
    }
    if (target) { tx = B.j.head ? B.j.head.x : target.x; ty = B.j.head ? B.j.head.y : target.y; }
    else {
      for (const o of this.props) {
        if ((o.t === 'bomb' || o.t === 'mine') && Math.abs(o.x - x) < 26 * s) {
          tx = o.x; ty = o.y; this.remove(o);
          this.explode(o.x, o.y, (o.t === 'bomb' ? 92 : 86) * o.s, o.s, o.t);
          break;
        }
      }
    }
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
    if (target) B.shocked(s);
    else if (ty >= this.ground - 1) { this.scorch(tx, this.ground, 16 * s); this.dust(tx, this.ground, 5); }
  }
  startRoller(x, s) {
    const dir = x < this.w / 2 ? 1 : -1;
    sfx.rollerTick();
    return this.addProp({ t: 'roller', x: dir > 0 ? -28 * s : this.w + 28 * s, y: this.ground, s, dir, v: 132 + 24 * s, tm: 0 });
  }
  launchRocket(x, y, s) {
    const B = this.B;
    if (B.j.chest) {
      let best = null, bd = 28;
      for (const p of B.all) { const d = hyp(p.x - x, p.y - y); if (d < bd) { bd = d; best = p; } }
      if (best) {
        const o = this.addProp({ t: 'rocket', x, y, s, ang: -Math.PI / 2 + rnd(-0.5, 0.5), st: 'seek', tm: 0, v: 0 });
        this.strap(o, best);
        return o;
      }
    }
    return this.addProp({ t: 'rocket', x: clamp(x, 14, this.w - 14), y: Math.min(y, this.ground - 22 * s), s, ang: -Math.PI / 2, st: 'wait', tm: 0, v: 60 });
  }
  strap(o, p) {
    o.st = 'strap'; o.p = p; o.tm = 0; o.dur = 2.2 + o.s * 0.4;
    sfx.launch();
    if (p.body) this.B.strapped(o);
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
    const B = this.B;
    if (!B.j.chest) return false;
    let hit = false;
    for (const p of B.all) if (hyp(p.x - x, p.y - y) < R) { hit = true; break; }
    if (hit) B.freeze();
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
    const out = [];
    for (const p of this.pts) {
      if (p.hole !== o) continue;
      p.hole = null;
      const a = Math.random() * Math.PI * 2, v = rnd(320, 820);
      p.px = p.x - Math.cos(a) * v * DT; p.py = p.y - Math.sin(a) * v * DT;
      out.push(p);
    }
    if (out.length) this.B.spatOut(out, o);
  }
  dropBin(x, s) {
    sfx.place();
    return this.addProp({ t: 'bin', x: clamp(x, 20, this.w - 20), y: -4, s, vy: 80, life: 18, rest: false });
  }
  askBin(o) {
    if (this.binAsk) return;
    this.binAsk = o;
    o.shake = 0.5;
    this.paused = true;
    this.cb.askBin && this.cb.askBin(o);
  }
  /** 回收站对话框点了「是」 */
  binConfirm() {
    const o = this.binAsk;
    this.binAsk = null;
    this.paused = false;
    if (!o) return;
    o.shake = 0.8;
    sfx.trash(); this.bang(0.6);
    this.puff(o.x, o.y - 46 * o.s, 14, { g: 210, life: 0.4, grow: 30 });
    this.B.deleted();
  }

  /** 爆炸 */
  explode(x, y, R, pow = 1, cause = 'bomb', up = false) {
    sfx.boom(pow);
    if (this.opts.flash) this.flashT = Math.max(this.flashT, 0.09);
    this.hitstop = Math.max(this.hitstop, 0.05);
    this.bang(2 * pow);
    this.fx.push({ k: 'burst', x, y, r: R * 0.62, life: 0.16, t: 0 });
    this.fx.push({ k: 'ring', x, y, r0: R * 0.3, r1: R * 1.15, life: 0.26, t: 0, w: 3 });
    const n = 7 * this.opts.particles;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, d = rnd(0.1, 0.6) * R;
      this.puff(x + Math.cos(a) * d * 0.4, y + Math.sin(a) * d * 0.4, rnd(8, 15) * pow, { g: rnd(40, 200), life: rnd(0.5, 1.1), grow: 28, vx: Math.cos(a) * d * 1.4, vy: Math.sin(a) * d * 1.4 - 28 });
    }
    for (let i = 0; i < 8 * this.opts.particles; i++) {
      const a = Math.random() * Math.PI * 2, v = rnd(180, 520) * pow;
      this.spark(x, y, Math.cos(a) * v, Math.sin(a) * v, rnd(4, 11));
    }
    this.word(x, y - R * 0.45, pick(['轰！', '砰！', '嘭！']), 24 + 7 * pow);
    if (y > this.ground - 34) this.scorch(x, this.ground, R * 0.36);
    // 推开所有东西
    for (const p of this.pts) {
      if (p.pin || p.hole || p.im === 0) continue;
      const dx = p.x - x, dy = p.y - y, d = hyp(dx, dy) || 1;
      if (d > R) continue;
      const f = 1 - d / R;
      const v = (620 + 820 * pow) * f;
      p.px -= (dx / d) * v * DT;
      p.py -= ((up ? -0.8 : dy / d) * v + 200 * f) * DT;
      p.trap = null;
    }
    for (const o of this.props) {
      const dx = o.x - x, dy = o.y - y, d = hyp(dx, dy) || 1;
      if (d > R || o.dead || o.held) continue;
      const f = 1 - d / R;
      if (o.t === 'bomb') { o.fuse = Math.min(o.fuse, 0.2 + d * 0.0015); o.vx += (dx / d) * 520 * f; o.vy += (dy / d) * 520 * f - 200 * f; }
      else if (o.t === 'mine') { o.boomT = o.boomT > 0 ? o.boomT : 0.1 + d * 0.001; }
      else if (o.t === 'peel' || o.t === 'spring' || o.t === 'bin') { if (o.t === 'peel' || f > 0.5) { o.rest = false; o.vx = (dx / d) * 420 * f; o.vy = -560 * f; } }
      else if (o.t === 'spikes') { if (f > 0.6) this.unpin(o); }
      else if (o.t === 'anvil') { o.vx += (dx / d) * 200 * f; o.vy -= 120 * f; o.rest = false; }
    }
    this.eraseWalls((q) => hyp(q.x - x, q.y - y) < R * 0.42, true);
    this.B.blast(x, y, R, pow, cause);
  }

  /* 拿在手里的工具 */
  sawStep(dt) {
    const T = this.sawT;
    if (!T) return;
    T.t += dt;
    T.snd -= dt;
    const dx = T.tx - T.x, dy = T.ty - T.y;
    T.x += dx * Math.min(1, dt * 22); T.y += dy * Math.min(1, dt * 22);
    if (hyp(dx, dy) > 3) {
      const want = Math.atan2(dy, dx);
      let d = want - T.ang;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      T.ang += d * Math.min(1, dt * 10);
    }
    const cs = Math.cos(T.ang), sn = Math.sin(T.ang);
    const ax = T.x + cs * 6, ay = T.y + sn * 6, bx = T.x + cs * 46, by = T.y + sn * 46;
    T.cd -= dt;
    let load = false;
    // 碰到身体：切
    const B = this.B;
    for (const s of this.sticks.slice()) {
      if (s.kind === 'ice') continue;
      const c = segSeg(ax, ay, bx, by, s.a.x, s.a.y, s.b.x, s.b.y);
      if (c.d < 5.5) {
        load = true;
        if (T.cd <= 0) {
          T.cd = 0.1;
          if (s.a.body || s.b.body) B.sawn(s, c.t);
          else { this.cutStick(s, c.t); }
          sfx.cut();
          this.bang(0.5);
        }
        break;
      }
    }
    if (!load) {
      for (const p of this.pts) {
        if (p.part !== 'head' || p.hole) continue;
        const n = segNear(p.x, p.y, ax, ay, bx, by);
        if (n.d < p.r + 2) {
          load = true;
          if (T.cd <= 0) { T.cd = 0.1; if (p.body) B.sawHead(p); this.spurt(p.x, p.y, 6); }
          break;
        }
      }
    }
    if (load) {
      T.load = 0.1;
      T.x -= dx * Math.min(1, dt * 14); T.y -= dy * Math.min(1, dt * 14); // 锯东西时手会被拖慢一点
      for (let i = 0; i < this.opts.particles; i++) this.spark(bx - cs * rnd(0, 34), by - sn * rnd(0, 34), rnd(-140, 140), rnd(-220, 40), 3);
    }
    T.load = Math.max(0, (T.load || 0) - dt);
    // 碰到地和墙冒火星
    if (by > this.ground - 8 || ay > this.ground - 8) {
      for (let i = 0; i < this.opts.particles; i++) this.spark(Math.min(bx, this.w), this.ground - 1, rnd(-180, 180), rnd(-260, -60), 4);
      load = true;
    }
    for (const q of this.props) {
      if (q.t === 'bomb' || q.t === 'mine') {
        const n = segNear(q.x, q.y, ax, ay, bx, by);
        if (n.d < 14 * q.s) { this.remove(q); this.explode(q.x, q.y, (q.t === 'bomb' ? 92 : 86) * q.s, q.s, q.t); }
      }
    }
    if (this.eraseWalls((q) => segNear(q.x, q.y, ax, ay, bx, by).d < 7, true)) load = true;
    if (T.snd <= 0) { T.snd = 0.07; sfx.sawTick(load); }
  }

  eraseAt(x, y, r) {
    // 墙和污渍
    this.eraseWalls((q) => hyp(q.x - x, q.y - y) < r, true);
    const d = this.dc;
    d.save(); d.globalCompositeOperation = 'destination-out'; d.beginPath(); d.arc(x, y, r, 0, Math.PI * 2); d.fill(); d.restore();
    // 道具
    for (const o of this.props) {
      if (o.dead || o.t === 'roller' || o.t === 'hole' || o.held) continue;
      if (hyp(o.x - x, o.y - 10 * o.s - y) < r + 12 * o.s) {
        if (o.t === 'spikes') this.unpin(o);
        this.unTrap(o);
        this.remove(o);
        for (let i = 0; i < 12; i++) this.crumb(o.x + rnd(-14, 14), o.y - rnd(0, 20), 2);
        return true;
      }
    }
    // 身上和散落的东西
    let hit = false;
    for (const p of this.pts.slice()) {
      if (p.part !== 'head' || hyp(p.x - x, p.y - y) > r + p.r * 0.6) continue;
      if (p.body) this.B.eraseHead(p);
      else this.removeHead(p);
      hit = true;
    }
    for (const s of this.sticks.slice()) {
      if (s.kind === 'ice') continue;
      if (segNear(x, y, s.a.x, s.a.y, s.b.x, s.b.y).d < r) {
        const body = s.a.body || s.b.body;
        const mx = (s.a.x + s.b.x) / 2, my = (s.a.y + s.b.y) / 2;
        for (let i = 0; i < 6; i++) this.crumb(mx + rnd(-8, 8), my + rnd(-8, 8), 2);
        if (body) this.B.erased(s); else this.eraseStick(s);
        hit = true;
      }
    }
    return hit;
  }
  removeHead(p) {
    for (const s of this.sticksOf(p)) this.removeStick(s);
    this.pts = this.pts.filter((q) => q !== p);
    this.prune();
    for (let i = 0; i < 10; i++) this.crumb(p.x + rnd(-8, 8), p.y + rnd(-8, 8), 2);
  }

  /** 全部清场：道具、残骸、铅笔线、污渍。留着他本人 */
  clearAll() {
    for (const o of this.props) { if (o.t === 'spikes') this.unpin(o); o.dead = true; }
    this.props = [];
    this.walls = [];
    this.fx = [];
    this.dc.clearRect(0, 0, this.w, this.h);
    this.hand = null; this.sawT = null; this.eraserT = null; this.stroke = null; this.preview = null;
    const keep = new Set(this.B.all);
    this.sticks = this.sticks.filter((s) => keep.has(s.a) && keep.has(s.b));
    this.pts = this.pts.filter((p) => keep.has(p));
    for (const p of this.pts) { p.trap = null; p.pin = null; p.hole = null; p.flat = false; }
  }

  /** 残骸太多就删最老的 */
  trimDebris(limit = 110) {
    const free = this.pts.filter((p) => !p.body);
    if (free.length <= limit) return;
    const drop = new Set(free.slice(0, free.length - limit));
    this.sticks = this.sticks.filter((s) => !drop.has(s.a) && !drop.has(s.b));
    this.pts = this.pts.filter((p) => !drop.has(p));
    this.prune();
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
        case 'burst': art.burst(c, f.x, f.y, f.r * (0.5 + u * 0.8), f.t); break;
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
  draw(c, away = false) {
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
    for (const o of this.props) {
      if (o.t === 'anvil') shadow(o.x, 28 * o.s, ground - o.y);
      else if (o.t === 'bomb') shadow(o.x, 12 * o.s, ground - o.y);
      else if (o.t === 'bin') shadow(o.x, 18 * o.s, ground - o.y);
    }
    this.B.drawShadow(c, shadow);

    for (const o of this.props) if (!P[o.t].front) P[o.t].draw(this, c, o);
    this.drawSticks(c);
    this.B.draw(c);
    for (const o of this.props) if (P[o.t].front) P[o.t].draw(this, c, o);
    this.drawFx(c);
    this.drawTool(c);
    c.restore();

    const inv = this.flashT > 0 || this.B.xrayFlip();
    quantize(c, w, h, inv);
  }

  drawSticks(c) {
    const B = this.B;
    const vis = this.sticks.filter((s) => s.kind !== 'ice' && !(s.a.hole && s.b.hole) && !(B.state === 'draw' && s.a.body));
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
      if (p.part !== 'head' || p.hole) continue;
      if (B.state === 'draw' && p.body) continue;
      if (!p.body) {
        p.ang += (p.x - p.px) / (p.r || 1);
        art.head(c, p.x, p.y, p.r, p.ang, { mood: 'dead', squash: p.flat ? 1 : 0 });
      }
    }
  }

  drawTool(c) {
    const h = this.hand;
    if (h) art.hand(c, h.x, h.y, 1.05, !!(h.p || h.o || h.down));
    const T = this.sawT;
    if (T) {
      const jx = T.load > 0 ? rnd(-1.4, 1.4) : rnd(-0.5, 0.5), jy = T.load > 0 ? rnd(-1.4, 1.4) : rnd(-0.5, 0.5);
      art.saw(c, T.x + jx, T.y + jy, 1, T.ang, this.t, true);
    }
    const E = this.eraserT;
    if (E) art.eraser(c, E.x, E.y, 1);
    const S = this.stroke;
    if (S) {
      c.strokeStyle = INK; c.lineWidth = S.limb ? 3 : 3;
      c.beginPath(); S.pts.forEach((q, i) => (i ? c.lineTo(q.x, q.y) : c.moveTo(q.x, q.y))); c.stroke();
      const q = S.pts[S.pts.length - 1];
      art.pencil(c, q.x, q.y, 1);
    }
    const G0 = this.preview;
    if (G0) {
      art.ghost(c, G0.id, G0.x, G0.y, G0.s, this.t, this.ground);
      c.strokeStyle = INK; c.lineWidth = 1.4; c.setLineDash([3, 3]);
      c.beginPath(); c.arc(G0.x, G0.id === 'mine' || G0.id === 'peel' || G0.id === 'spring' ? this.ground - 8 : G0.y, 30 * G0.s, 0, Math.PI * 2); c.stroke();
      c.setLineDash([]);
      if (G0.s > 1.02) {
        const label = `×${G0.s.toFixed(1)}`;
        c.font = `800 12px ${FONT}`; c.textAlign = 'center';
        const yy = Math.max(14, G0.y - 30 * G0.s - 6);
        c.lineWidth = 4; c.strokeStyle = PAPER; c.strokeText(label, G0.x, yy);
        c.fillStyle = INK; c.fillText(label, G0.x, yy);
      }
    }
  }

  /* 存档（只存站得住的东西：会动的道具都是一次性的，不存） */
  snapshot() {
    const idx = new Map(this.pts.map((p, i) => [p, i]));
    const r1 = (v) => Math.round(v * 10) / 10;
    return {
      w: this.w, h: this.h, ground: this.ground,
      pts: this.pts.map((p) => [r1(p.x), r1(p.y), p.r, p.im || 1, p.part || 0, p.body ? 1 : 0, p.flat ? 1 : 0]),
      sticks: this.sticks.filter((s) => s.kind !== 'ice').map((s) => [idx.get(s.a), idx.get(s.b), r1(s.len), s.kind]),
      props: this.props.filter((o) => ['mine', 'peel', 'spring', 'bin'].includes(o.t) && !o.held).map((o) => ({ t: o.t, x: r1(o.x), y: r1(o.y), s: o.s, rest: o.rest, life: o.life })),
      walls: this.walls.map((l) => l.pts.map((q) => [r1(q.x), r1(q.y)])),
      body: this.B.snapshot(idx),
    };
  }
  restore(d) {
    try {
      this.pts = d.pts.map((a) => this.addPtRaw(a));
      this.sticks = d.sticks.filter((a) => this.pts[a[0]] && this.pts[a[1]]).map((a) => ({ a: this.pts[a[0]], b: this.pts[a[1]], len: a[2], kind: a[3] }));
      this.props = (d.props || []).map((o) => ({ id: nextId++, vx: 0, vy: 0, ...o }));
      this.walls = (d.walls || []).map((l) => this.makeWall(l.map((q) => ({ x: q[0], y: q[1] }))));
      this.B.restore(d.body, this.pts);
      // 存档时的画布大小和现在不一样，按地面对齐
      if (d.ground !== this.ground) {
        const dy = this.ground - d.ground;
        for (const p of this.pts) { p.y += dy; p.py += dy; }
        for (const o of this.props) o.y += dy;
        for (const l of this.walls) { for (const q of l.pts) q.y += dy; l.y0 += dy; l.y1 += dy; }
        this.B.gy += dy;
      }
      for (const p of this.pts) { if (p.x > this.w - 4) { p.x = this.w - 4; p.px = p.x; } }
      return true;
    } catch { return false; }
  }
  addPtRaw(a) {
    return { x: a[0], y: a[1], px: a[0], py: a[1], r: a[2], im: a[3], part: a[4] || null, body: !!a[5], flat: !!a[6], pin: null, trap: null, hole: null, ang: 0, id: nextId++ };
  }
}
