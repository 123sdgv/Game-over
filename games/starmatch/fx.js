// 星星消消乐的特效层：粒子、光束、冲击波、闪电、飞向目标的星星、飘字。
import { COLORS, RAINBOW } from './art.js';

const MAX_PARTS = 460;
const TAU = Math.PI * 2;
const rnd = (a, b) => a + Math.random() * (b - a);
const glowOf = (c) => (c >= 0 && COLORS[c] ? COLORS[c].glow : '#FFFFFF');

export class FX {
  constructor() { this.clear(); this.amount = 1; this.shakeOn = true; }

  clear() {
    this.parts = []; this.rings = []; this.beams = []; this.bolts = []; this.blooms = [];
    this.flyers = []; this.texts = []; this.twinkles = [];
    this.shakeT = 0; this.shakeDur = 0; this.shakeAmp = 0; this.flashA = 0;
    this.sx = 0; this.sy = 0;
  }

  get busy() {
    return this.parts.length + this.rings.length + this.beams.length + this.bolts.length + this.blooms.length + this.flyers.length + this.texts.length > 0 || this.shakeT > 0 || this.flashA > 0;
  }

  /* ---------- 粒子 ---------- */
  part(p) {
    if (this.parts.length >= MAX_PARTS) this.parts.shift();
    this.parts.push({ t: 0, delay: 0, g: 900, drag: 1, rot: rnd(0, TAU), vr: rnd(-8, 8), add: false, ...p });
  }

  /** 一颗星星碎掉 */
  burst(art, x, y, c, power = 1) {
    const cs = art.cs, n = Math.round(6 * this.amount * power);
    const shard = art.shard(c);
    for (let i = 0; i < n; i++) {
      const a = rnd(0, TAU), v = cs * rnd(2.6, 7.6) * (0.8 + power * 0.2);
      this.part({ spr: shard, x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - cs * 2.6, g: cs * 22, drag: 0.985, max: rnd(0.38, 0.72), size: cs * rnd(0.18, 0.4) });
    }
    const spark = art.spark();
    for (let i = 0; i < Math.round(2 * this.amount); i++) {
      this.part({ spr: spark, x: x + rnd(-cs * 0.2, cs * 0.2), y: y + rnd(-cs * 0.2, cs * 0.2), vx: 0, vy: -cs * 0.6, g: 0, max: rnd(0.2, 0.34), size: cs * rnd(0.5, 0.85), add: true, vr: rnd(-3, 3) });
    }
    this.rings.push({ x, y, r0: cs * 0.18, r1: cs * 0.56, t: 0, life: 0.2, color: glowOf(c), w: cs * 0.07, a: 0.55 });
  }

  /** 冰块碎掉 */
  iceBreak(art, x, y, left) {
    const cs = art.cs, bit = art.iceBit(), n = Math.round((left ? 5 : 8) * this.amount);
    for (let i = 0; i < n; i++) {
      const a = rnd(0, TAU), v = cs * rnd(2, 6);
      this.part({ spr: bit, x: x + rnd(-cs * 0.32, cs * 0.32), y: y + rnd(-cs * 0.32, cs * 0.32), vx: Math.cos(a) * v, vy: Math.sin(a) * v - cs * 2, g: cs * 20, max: rnd(0.4, 0.75), size: cs * rnd(0.14, 0.32), vr: rnd(-12, 12) });
    }
    this.blooms.push({ x, y, r: cs * 0.7, t: 0, life: 0.2, color: '#BFE8FF' });
  }

  /** 锁链断了 */
  chainBreak(art, x, y) {
    const cs = art.cs, bit = art.chainBit(), n = Math.round(7 * this.amount);
    for (let i = 0; i < n; i++) {
      const a = rnd(0, TAU), v = cs * rnd(2.2, 6);
      this.part({ spr: bit, x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - cs * 2.6, g: cs * 26, max: rnd(0.45, 0.8), size: cs * rnd(0.22, 0.36), vr: rnd(-14, 14) });
    }
    this.blooms.push({ x, y, r: cs * 0.55, t: 0, life: 0.16, color: '#FFFFFF' });
  }

  /** 一颗特效星诞生 */
  birth(art, x, y, c, rainbow) {
    const cs = art.cs, spark = art.spark();
    this.rings.push({ x, y, r0: cs * 0.2, r1: cs * 1.05, t: 0, life: 0.36, color: rainbow ? '#FFFFFF' : glowOf(c), w: cs * 0.14 });
    this.blooms.push({ x, y, r: cs * 1.1, t: 0, life: 0.28, color: rainbow ? '#FFFFFF' : glowOf(c) });
    for (let i = 0; i < Math.round(8 * this.amount); i++) {
      const a = (i / 8) * TAU + rnd(-0.2, 0.2), v = cs * rnd(2.4, 4.4);
      this.part({ spr: spark, x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: 0, drag: 0.94, max: rnd(0.3, 0.5), size: cs * rnd(0.32, 0.55), add: true });
    }
  }

  /** 直线星的光束：bounds 是棋盘范围 */
  beam(art, x, y, dir, c, bounds) {
    const cs = art.cs;
    this.beams.push({ x, y, dir, t: 0, life: 0.42, color: glowOf(c), bounds, cs });
    const spark = art.spark();
    const span = dir === 'h' ? bounds.w : bounds.h;
    const n = Math.round(12 * this.amount);
    for (let i = 0; i < n; i++) {
      const off = rnd(-span, span);
      const px = dir === 'h' ? x + off : x + rnd(-cs * 0.35, cs * 0.35);
      const py = dir === 'h' ? y + rnd(-cs * 0.35, cs * 0.35) : y + off;
      if (px < bounds.x || px > bounds.x + bounds.w || py < bounds.y || py > bounds.y + bounds.h) continue;
      this.part({ spr: spark, x: px, y: py, vx: rnd(-cs, cs), vy: rnd(-cs, cs), g: 0, max: rnd(0.25, 0.45), size: cs * rnd(0.3, 0.6), add: true, delay: (Math.abs(off) / span) * 0.2 });
    }
    this.shake(cs * 0.05, 0.14);
  }

  /** 爆炸 */
  bomb(art, x, y, c, radius = 2) {
    const cs = art.cs, reach = cs * (radius + 0.6);
    this.rings.push({ x, y, r0: cs * 0.4, r1: reach, t: 0, life: 0.34, color: '#FFFFFF', w: cs * 0.34 });
    this.rings.push({ x, y, r0: cs * 0.2, r1: reach * 0.8, t: -0.05, life: 0.4, color: glowOf(c), w: cs * 0.22 });
    this.blooms.push({ x, y, r: reach * 1.1, t: 0, life: 0.3, color: glowOf(c) });
    this.blooms.push({ x, y, r: reach * 0.6, t: 0, life: 0.18, color: '#FFFFFF' });
    const spark = art.spark(), shard = art.shard(c);
    const n = Math.round((10 + radius * 5) * this.amount);
    for (let i = 0; i < n; i++) {
      const a = rnd(0, TAU), v = (reach / 0.3) * rnd(0.5, 1.3);
      this.part({ spr: i % 3 ? shard : spark, x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: cs * 12, drag: 0.93, max: rnd(0.35, 0.7), size: cs * rnd(0.22, 0.55), add: !(i % 3) });
    }
    this.shake(cs * (0.12 + radius * 0.05), 0.3);
  }

  /** 彩虹星发动的那一下 */
  rainbow(art, x, y) {
    const cs = art.cs;
    RAINBOW.forEach((color, i) => this.rings.push({ x, y, r0: cs * 0.3, r1: cs * (1.6 + i * 0.2), t: -i * 0.03, life: 0.45, color, w: cs * 0.09 }));
    this.blooms.push({ x, y, r: cs * 2, t: 0, life: 0.34, color: '#FFFFFF' });
    this.shake(cs * 0.08, 0.2);
  }

  bolt(x0, y0, x1, y1, c, width) {
    this.bolts.push({ x0, y0, x1, y1, t: 0, life: 0.26, color: c >= 0 ? glowOf(c) : '#FFFFFF', seed: rnd(0, 100), width });
  }

  /** 两颗彩虹星合体 */
  nova(art, x, y) {
    const cs = art.cs;
    this.flashA = 0.85;
    RAINBOW.forEach((color, i) => this.rings.push({ x, y, r0: cs * 0.4, r1: cs * (8 + i * 1.1), t: -i * 0.05, life: 0.85, color, w: cs * 0.32 }));
    this.blooms.push({ x, y, r: cs * 6, t: 0, life: 0.6, color: '#FFFFFF' });
    this.shake(cs * 0.34, 0.6);
  }

  shake(amp, dur) {
    if (!this.shakeOn) return;
    this.shakeAmp = Math.max(this.shakeAmp * (this.shakeDur ? this.shakeT / this.shakeDur : 0), amp);
    this.shakeDur = dur; this.shakeT = dur;
  }

  /** 从 (x0,y0) 划一道弧飞到 (x1,y1) */
  fly({ spr, x0, y0, x1, y1, dur = 0.6, delay = 0, size0, size1, onDone, trail }) {
    const mx = (x0 + x1) / 2 + rnd(-60, 60), my = Math.min(y0, y1) + (Math.abs(y1 - y0) * 0.35) + rnd(-20, 20);
    this.flyers.push({ spr, x0, y0, x1, y1, cx: mx, cy: my, t: -delay, dur, size0, size1, onDone, trail, rot: rnd(0, TAU), vr: rnd(-5, 5), trailT: 0 });
  }

  text(o) { this.texts.push({ t: 0, life: 0.95, size: 18, color: '#fff', ...o }); }

  twinkle(x, y, size, spr) { this.twinkles.push({ x, y, t: 0, life: 0.7, size, spr }); }

  /* ---------- 更新 ---------- */
  update(dt) {
    for (const p of this.parts) {
      if (p.delay > 0) { p.delay -= dt; continue; }
      p.t += dt;
      p.vy += p.g * dt;
      const d = Math.pow(p.drag, dt * 60);
      p.vx *= d; p.vy *= d;
      p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
    }
    this.parts = this.parts.filter((p) => p.t < p.max);
    for (const r of this.rings) r.t += dt;
    this.rings = this.rings.filter((r) => r.t < r.life);
    for (const b of this.beams) b.t += dt;
    this.beams = this.beams.filter((b) => b.t < b.life);
    for (const b of this.bolts) b.t += dt;
    this.bolts = this.bolts.filter((b) => b.t < b.life);
    for (const b of this.blooms) b.t += dt;
    this.blooms = this.blooms.filter((b) => b.t < b.life);
    for (const t of this.twinkles) t.t += dt;
    this.twinkles = this.twinkles.filter((t) => t.t < t.life);
    for (const t of this.texts) t.t += dt;
    this.texts = this.texts.filter((t) => t.t < t.life);
    for (const f of this.flyers) {
      f.t += dt; f.rot += f.vr * dt;
      if (f.t >= f.dur) { f.done = true; if (f.onDone) f.onDone(); }
      else if (f.trail && f.t > 0) {
        f.trailT -= dt;
        if (f.trailT <= 0) {
          f.trailT = 0.04;
          const [x, y] = flyPos(f);
          this.part({ spr: f.trail, x, y, vx: 0, vy: 0, g: 0, max: 0.24, size: f.size0 * 0.5, add: true });
        }
      }
    }
    this.flyers = this.flyers.filter((f) => !f.done);
    if (this.shakeT > 0) {
      this.shakeT = Math.max(0, this.shakeT - dt);
      const a = this.shakeAmp * (this.shakeT / (this.shakeDur || 1));
      this.sx = rnd(-a, a); this.sy = rnd(-a, a);
    } else { this.sx = 0; this.sy = 0; }
    if (this.flashA > 0) this.flashA = Math.max(0, this.flashA - dt * 1.8);
  }

  /* ---------- 绘制：棋盘上的（跟着震动） ---------- */
  drawWorld(ctx) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const b of this.blooms) {
      const k = b.t / b.life, a = (1 - k) * (1 - k);
      const r = b.r * (0.7 + 0.3 * k);
      const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, r);
      g.addColorStop(0, withAlpha(b.color, 0.8 * a));
      g.addColorStop(1, withAlpha(b.color, 0));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(b.x, b.y, r, 0, TAU); ctx.fill();
    }
    for (const b of this.beams) this.drawBeam(ctx, b);
    for (const b of this.bolts) drawBolt(ctx, b);
    ctx.restore();

    for (const r of this.rings) {
      if (r.t < 0) continue;
      const k = r.t / r.life, e = 1 - (1 - k) * (1 - k);
      ctx.globalAlpha = (1 - k) * (r.a ?? 1);
      ctx.strokeStyle = r.color;
      ctx.lineWidth = Math.max(0.5, r.w * (1 - k * 0.8));
      ctx.beginPath(); ctx.arc(r.x, r.y, r.r0 + (r.r1 - r.r0) * e, 0, TAU); ctx.stroke();
    }
    ctx.globalAlpha = 1;

    for (const t of this.twinkles) {
      const k = t.t / t.life, s = t.size * Math.sin(k * Math.PI);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.translate(t.x, t.y); ctx.rotate(k * 1.2);
      ctx.drawImage(t.spr, -s / 2, -s / 2, s, s);
      ctx.restore();
    }

    for (const p of this.parts) {
      if (p.delay > 0) continue;
      const a = 1 - p.t / p.max;
      ctx.save();
      if (p.add) ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = Math.min(1, a * 1.4);
      ctx.translate(p.x, p.y); ctx.rotate(p.rot);
      const s = p.size * (0.55 + 0.45 * a);
      ctx.drawImage(p.spr, -s / 2, -s / 2, s, s);
      ctx.restore();
    }
  }

  drawBeam(ctx, b) {
    const k = b.t / b.life, b0 = b.bounds;
    const grow = Math.min(1, b.t / 0.17);
    const a = k < 0.4 ? 1 : 1 - (k - 0.4) / 0.6;
    const w = b.cs * (0.98 - 0.72 * k);
    ctx.save();
    ctx.beginPath(); ctx.rect(b0.x, b0.y, b0.w, b0.h); ctx.clip();
    ctx.globalAlpha = a;
    const span = (b.dir === 'h' ? b0.w : b0.h) * 1.05 * grow;
    if (b.dir === 'h') {
      const g = ctx.createLinearGradient(0, b.y - w / 2, 0, b.y + w / 2);
      g.addColorStop(0, withAlpha(b.color, 0)); g.addColorStop(0.3, b.color); g.addColorStop(0.5, '#FFFFFF'); g.addColorStop(0.7, b.color); g.addColorStop(1, withAlpha(b.color, 0));
      ctx.fillStyle = g;
      ctx.fillRect(b.x - span, b.y - w / 2, span * 2, w);
    } else {
      const g = ctx.createLinearGradient(b.x - w / 2, 0, b.x + w / 2, 0);
      g.addColorStop(0, withAlpha(b.color, 0)); g.addColorStop(0.3, b.color); g.addColorStop(0.5, '#FFFFFF'); g.addColorStop(0.7, b.color); g.addColorStop(1, withAlpha(b.color, 0));
      ctx.fillStyle = g;
      ctx.fillRect(b.x - w / 2, b.y - span, w, span * 2);
    }
    ctx.restore();
  }

  /* ---------- 绘制：最上面（不跟着震动） ---------- */
  drawTop(ctx, view) {
    for (const f of this.flyers) {
      if (f.t < 0) continue;
      const k = f.t / f.dur;
      const [x, y] = flyPos(f);
      const s = f.size0 + (f.size1 - f.size0) * k;
      ctx.save();
      ctx.translate(x, y); ctx.rotate(f.rot * k);
      ctx.drawImage(f.spr, -s / 2, -s / 2, s, s);
      ctx.restore();
    }
    for (const t of this.texts) {
      const k = t.t / t.life;
      const a = t.t < 0.1 ? t.t / 0.1 : k > 0.68 ? Math.max(0, 1 - (k - 0.68) / 0.32) : 1;
      const pop = t.big ? 1 + 0.55 * Math.max(0, 1 - t.t * 7) : 1 + 0.2 * Math.max(0, 1 - t.t * 10);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.translate(t.x, t.y - (t.hold ? 0 : t.t * (t.big ? 26 : 44)));
      ctx.scale(pop, pop);
      ctx.font = `900 ${t.size}px -apple-system, "PingFang SC", "Noto Sans CJK SC", sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round';
      ctx.lineWidth = Math.max(4, t.size * 0.24);
      ctx.strokeStyle = 'rgba(16,20,70,.9)';
      ctx.strokeText(t.text, 0, 0);
      if (t.big) {
        const g = ctx.createLinearGradient(0, -t.size / 2, 0, t.size / 2);
        g.addColorStop(0, '#FFFFFF'); g.addColorStop(0.45, t.color); g.addColorStop(1, shadeHex(t.color, -0.15));
        ctx.fillStyle = g;
      } else ctx.fillStyle = t.color;
      ctx.fillText(t.text, 0, 0);
      ctx.restore();
    }
    if (this.flashA > 0) {
      ctx.fillStyle = `rgba(255,255,255,${this.flashA})`;
      ctx.fillRect(0, 0, view.W, view.H);
    }
  }
}

function flyPos(f) {
  const k = Math.max(0, f.t / f.dur), e = k * k * (3 - 2 * k), u = 1 - e;
  return [u * u * f.x0 + 2 * u * e * f.cx + e * e * f.x1, u * u * f.y0 + 2 * u * e * f.cy + e * e * f.y1];
}

function drawBolt(ctx, b) {
  const k = b.t / b.life, a = 1 - k;
  const dx = b.x1 - b.x0, dy = b.y1 - b.y0, len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len, ny = dx / len;
  const n = Math.max(4, Math.round(len / 26));
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, wobble = i === 0 || i === n ? 0 : Math.sin(b.seed + i * 2.4 + b.t * 30) * Math.min(14, len * 0.08);
    pts.push([b.x0 + dx * t + nx * wobble, b.y0 + dy * t + ny * wobble]);
  }
  const path = () => { ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); };
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.globalAlpha = a * 0.75;
  ctx.strokeStyle = b.color; ctx.lineWidth = b.width * 2.2;
  path(); ctx.stroke();
  ctx.globalAlpha = a;
  ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = b.width * 0.7;
  path(); ctx.stroke();
  ctx.globalAlpha = 1;
}

function withAlpha(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
}
function shadeHex(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v) => Math.round(v * (1 + k));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
}
