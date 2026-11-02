// 便便超人：全部原创的 Flash 涂鸦风美术。粗描边 + 平涂 + 一层硬阴影，没有贴图文件，全靠 canvas 现画。
if (typeof CanvasRenderingContext2D !== 'undefined' && !CanvasRenderingContext2D.prototype.roundRect) {
  const rr = function (x, y, w, h, r = 0) {
    const q = Math.min(typeof r === 'number' ? r : r[0] || 0, Math.abs(w) / 2, Math.abs(h) / 2);
    this.moveTo(x + q, y); this.lineTo(x + w - q, y); this.quadraticCurveTo(x + w, y, x + w, y + q);
    this.lineTo(x + w, y + h - q); this.quadraticCurveTo(x + w, y + h, x + w - q, y + h);
    this.lineTo(x + q, y + h); this.quadraticCurveTo(x, y + h, x, y + h - q);
    this.lineTo(x, y + q); this.quadraticCurveTo(x, y, x + q, y); this.closePath();
  };
  CanvasRenderingContext2D.prototype.roundRect = rr;
  if (typeof Path2D !== 'undefined') Path2D.prototype.roundRect = rr;
}

export const INK = '#1F130C';
export const TAU = Math.PI * 2;
export const FONT = '-apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Helvetica Neue", "Noto Sans CJK SC", "Microsoft YaHei", sans-serif';

export const SKINS = {
  choco:  { base: '#8E5B2F', dark: '#6C4321', light: '#AD7840', hi: '#EBCFA8', goo: '#86552B', gooDark: '#633C1C', gooLight: '#A2703C', gooHi: '#DDB88D' },
  gold:   { base: '#E8B425', dark: '#C48A14', light: '#F6CF4E', hi: '#FFF4BC', goo: '#E0AC22', gooDark: '#B57F10', gooLight: '#F3CB4B', gooHi: '#FFF0AE' },
  berry:  { base: '#EE7DA2', dark: '#CC5A82', light: '#F7A0BC', hi: '#FFE3EC', goo: '#E97399', gooDark: '#BF4F76', gooLight: '#F497B5', gooHi: '#FFDDE8' },
  matcha: { base: '#8FB356', dark: '#6E9139', light: '#A9CA72', hi: '#EAF5CF', goo: '#86AB4F', gooDark: '#628233', gooLight: '#A2C36B', gooHi: '#E3F0C4' },
};

export function mk(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h));
  return c;
}
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function sprite(wu, hu, ox, oy, ps, draw) {
  const cv = mk(wu * ps, hu * ps), c = cv.getContext('2d');
  c.scale(ps, ps); c.translate(ox, oy);
  c.lineJoin = 'round'; c.lineCap = 'round';
  draw(c);
  return { img: cv, ox, oy, w: wu, h: hu };
}
export const put = (c, s, x = 0, y = 0) => c.drawImage(s.img, x - s.ox, y - s.oy, s.w, s.h);

/* ─────────────── 飞溅 ─────────────── */

function blobPts(R, r, n, spiky) {
  const off = R() * TAU, pts = [];
  for (let i = 0; i < n; i++) {
    const a = off + (i / n) * TAU + (R() - 0.5) * 0.28;
    const rr = r * (i % 2 ? 0.58 + R() * 0.16 : 0.84 + R() * spiky);
    pts.push([Math.cos(a) * rr, Math.sin(a) * rr]);
  }
  return pts;
}
function smoothClosed(pts, k = 1, ox = 0, oy = 0) {
  const p = new Path2D(), n = pts.length;
  const mid = (a, b) => [((a[0] + b[0]) / 2) * k + ox, ((a[1] + b[1]) / 2) * k + oy];
  const s = mid(pts[n - 1], pts[0]);
  p.moveTo(s[0], s[1]);
  for (let i = 0; i < n; i++) {
    const m = mid(pts[i], pts[(i + 1) % n]);
    p.quadraticCurveTo(pts[i][0] * k + ox, pts[i][1] * k + oy, m[0], m[1]);
  }
  p.closePath();
  return p;
}
/**
 * 一坨溅开的样子。同一个 seed 永远画出同一个形状，存档只记 seed 就能重放。
 * outline=true 是溅在墙上、地上的（自带描边）；糊在小人身上的不描边，描边统一在烘焙时加。
 */
export function drawSplat(c, x, y, r, seed, sk, { squash = 1, outline = true, lw = 2.2, drops = true } = {}) {
  const R = rng(seed);
  c.save();
  c.translate(x, y); c.scale(1, squash);
  c.lineJoin = 'round';
  const pts = blobPts(R, r, 10 + Math.floor(R() * 5), 0.42);
  const body = smoothClosed(pts);
  if (drops) {
    const n = 3 + Math.floor(R() * 4);
    for (let i = 0; i < n; i++) {
      const a = R() * TAU, d = r * (1.2 + R() * 0.65), q = r * (0.07 + R() * 0.13);
      c.beginPath(); c.arc(Math.cos(a) * d, Math.sin(a) * d, q, 0, TAU);
      c.fillStyle = sk.goo; c.fill();
      if (outline) { c.strokeStyle = INK; c.lineWidth = lw * 0.8; c.stroke(); }
    }
  }
  c.fillStyle = sk.goo; c.fill(body);
  if (outline) { c.strokeStyle = INK; c.lineWidth = lw; c.stroke(body); }
  else { c.strokeStyle = sk.gooDark; c.lineWidth = Math.max(1, r * 0.06); c.stroke(body); }
  c.fillStyle = sk.gooLight; c.fill(smoothClosed(pts, 0.6, -r * 0.1, -r * 0.14));
  c.fillStyle = sk.gooHi;
  c.beginPath(); c.ellipse(-r * 0.3, -r * 0.34, r * 0.17, r * 0.09, -0.5, 0, TAU); c.fill();
  c.beginPath(); c.arc(-r * 0.03, -r * 0.42, r * 0.045, 0, TAU); c.fill();
  c.restore();
}

/* ─────────────── 便便超人 ─────────────── */

function lumpPath(rx, ry) {
  const p = new Path2D(), k = 0.6;
  p.moveTo(-rx, 0);
  p.bezierCurveTo(-rx, -ry * k * 1.25, -rx * k, -ry, 0, -ry);
  p.bezierCurveTo(rx * k, -ry, rx, -ry * k * 1.25, rx, 0);
  p.bezierCurveTo(rx, ry * k * 1.1, rx * k, ry, 0, ry);
  p.bezierCurveTo(-rx * k, ry, -rx, ry * k * 1.1, -rx, 0);
  p.closePath();
  return p;
}
function lump(c, cx, cy, rx, ry, tilt, sk, lw = 3.2) {
  const p = lumpPath(rx, ry);
  c.save();
  c.translate(cx, cy); c.rotate(tilt);
  c.fillStyle = sk.base; c.fill(p);
  c.save(); c.clip(p);
  c.fillStyle = sk.dark;
  c.beginPath(); c.ellipse(rx * 0.14, ry * 0.86, rx * 1.1, ry * 0.58, 0, 0, TAU); c.fill();
  c.fillStyle = sk.light;
  c.beginPath(); c.ellipse(-rx * 0.2, -ry * 0.5, rx * 0.68, ry * 0.32, -0.12, 0, TAU); c.fill();
  c.restore();
  c.strokeStyle = sk.hi; c.lineWidth = Math.max(1.8, ry * 0.11); c.lineCap = 'round';
  c.beginPath(); c.arc(-rx * 0.28, -ry * 0.1, rx * 0.5, Math.PI * 1.08, Math.PI * 1.4); c.stroke();
  c.strokeStyle = INK; c.lineWidth = lw; c.stroke(p);
  c.restore();
}
function tipShape(c, sk) {
  // 顶上那个小卷
  const p = new Path2D();
  p.moveTo(-15, -101);
  p.bezierCurveTo(-14, -113, -5, -115, 1, -120);
  p.bezierCurveTo(5, -124, 11, -129, 15, -125);
  p.bezierCurveTo(19, -120, 15, -113, 16, -105);
  p.bezierCurveTo(17, -99, 8, -95, 0, -95);
  p.bezierCurveTo(-9, -95, -15, -96, -15, -101);
  p.closePath();
  c.fillStyle = sk.base; c.fill(p);
  c.save(); c.clip(p);
  c.fillStyle = sk.light; c.beginPath(); c.ellipse(-2, -112, 11, 8, -0.5, 0, TAU); c.fill();
  c.restore();
  c.strokeStyle = sk.hi; c.lineWidth = 2; c.lineCap = 'round';
  c.beginPath(); c.moveTo(-8, -106); c.quadraticCurveTo(-5, -112, 1, -115); c.stroke();
  c.strokeStyle = INK; c.lineWidth = 3.2; c.stroke(p);
}
function starPath(c, x, y, r, rot = -Math.PI / 2, inner = 0.45) {
  c.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = rot + (i / 10) * TAU, q = i % 2 ? r * inner : r;
    c[i ? 'lineTo' : 'moveTo'](x + Math.cos(a) * q, y + Math.sin(a) * q);
  }
  c.closePath();
}

export function buildHero(sk, ps) {
  const box = (cy, rx, ry) => [rx * 2 + 16, ry * 2 + 16, rx + 8, ry + 8 - cy];
  const tier = (cy, rx, ry, tilt, extra) => {
    const [w, h, ox, oy] = box(cy, rx, ry);
    return sprite(w, h, ox, oy, ps, (c) => { lump(c, 0, cy, rx, ry, tilt, sk); if (extra) extra(c); });
  };
  return {
    t1: tier(-38, 49, 28, 0.04, (c) => {
      // 腰带
      const p = new Path2D();
      p.moveTo(-46, -30); p.quadraticCurveTo(0, -11, 46, -30);
      p.lineTo(47.5, -21); p.quadraticCurveTo(0, -1, -47.5, -21); p.closePath();
      c.save();
      const clip = lumpPath(49, 28);
      c.translate(0, -38); c.rotate(0.04); c.clip(clip); c.rotate(-0.04); c.translate(0, 38);
      c.fillStyle = '#F7C531'; c.fill(p);
      c.strokeStyle = INK; c.lineWidth = 2.6; c.stroke(p);
      c.restore();
      c.strokeStyle = INK; c.lineWidth = 3.2;
      c.save(); c.translate(0, -38); c.rotate(0.04); c.stroke(lumpPath(49, 28)); c.restore();
      c.beginPath(); c.arc(8, -13.5, 9, 0, TAU); c.fillStyle = '#F7C531'; c.fill();
      c.lineWidth = 2.6; c.stroke();
      starPath(c, 8, -13.5, 6);
      c.fillStyle = '#D8342B'; c.fill();
    }),
    t2: tier(-70, 37, 22, -0.05),
    t3: tier(-94, 24, 15, 0.08),
    tip: sprite(52, 56, 26, 134, ps, (c) => tipShape(c, sk)),
    sk,
  };
}

function hose(c, x0, y0, x1, y1, bend, col) {
  const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
  const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy) || 1;
  const cx = mx + (-dy / L) * bend, cy = my + (dx / L) * bend;
  c.beginPath(); c.moveTo(x0, y0); c.quadraticCurveTo(cx, cy, x1, y1);
  c.lineCap = 'round';
  c.strokeStyle = INK; c.lineWidth = 8.5; c.stroke();
  c.strokeStyle = col; c.lineWidth = 3.4; c.stroke();
}
function glove(c, x, y, a) {
  c.save(); c.translate(x, y); c.rotate(a);
  c.fillStyle = '#FFFFFF'; c.strokeStyle = INK; c.lineWidth = 2.8;
  c.beginPath(); c.ellipse(4, 0, 10, 9, 0, 0, TAU); c.fill(); c.stroke();
  c.beginPath(); c.ellipse(5, -9, 3.6, 5.4, 0.3, 0, TAU); c.fill(); c.stroke();
  c.lineWidth = 2;
  c.beginPath(); c.moveTo(9, -3); c.lineTo(13, -3); c.moveTo(9, 2.5); c.lineTo(13, 2.5); c.stroke();
  c.fillStyle = '#F7C531'; c.lineWidth = 2.6;
  c.beginPath(); c.roundRect(-8, -7, 6, 14, 2.5); c.fill(); c.stroke();
  c.restore();
}
function boot(c, x, y) {
  c.save(); c.translate(x, y);
  c.fillStyle = '#D8342B'; c.strokeStyle = INK; c.lineWidth = 3;
  c.beginPath();
  c.moveTo(-10, -13); c.lineTo(5, -13);
  c.quadraticCurveTo(21, -9, 19, 0);
  c.lineTo(-11, 0);
  c.quadraticCurveTo(-13, -8, -10, -13);
  c.closePath(); c.fill(); c.stroke();
  c.fillStyle = '#F7C531'; c.lineWidth = 2.4;
  c.beginPath(); c.roundRect(-12, -17, 19, 6, 2); c.fill(); c.stroke();
  c.restore();
}
function cape(c, up, t) {
  const n = 7, a = [], b = [];
  for (let i = 0; i <= n; i++) {
    const s = i / n;
    const wave = Math.sin(s * 5 - t * (5 + up * 7)) * (2 + up * 5) * s;
    const L = 82;
    a.push([-14 - s * L * (0.84 + 0.3 * up), -92 + s * L * (1.08 - 0.9 * up) + wave]);
    b.push([12 - s * L * (0.3 + 0.72 * up), -90 + s * L * (1.08 - 0.42 * up) + wave * 0.8]);
  }
  c.beginPath();
  c.moveTo(a[0][0], a[0][1]);
  for (let i = 1; i <= n; i++) c.lineTo(a[i][0], a[i][1]);
  // 下摆锯齿
  const ax = a[n], bx = b[n];
  c.quadraticCurveTo((ax[0] * 0.67 + bx[0] * 0.33), (ax[1] * 0.67 + bx[1] * 0.33) - 6, (ax[0] + bx[0]) / 2, (ax[1] + bx[1]) / 2 + 3);
  c.quadraticCurveTo((ax[0] * 0.33 + bx[0] * 0.67), (ax[1] * 0.33 + bx[1] * 0.67) - 6, bx[0], bx[1]);
  for (let i = n - 1; i >= 0; i--) c.lineTo(b[i][0], b[i][1]);
  c.closePath();
  c.fillStyle = '#D8342B'; c.fill();
  c.strokeStyle = INK; c.lineWidth = 3.2; c.lineJoin = 'round'; c.stroke();
  // 里子的暗面
  c.beginPath();
  c.moveTo(a[1][0] * 0.5 + b[1][0] * 0.5, a[1][1] * 0.5 + b[1][1] * 0.5);
  for (let i = 2; i <= n; i++) c.lineTo(a[i][0] * 0.5 + b[i][0] * 0.5, a[i][1] * 0.5 + b[i][1] * 0.5);
  c.strokeStyle = '#A9221B'; c.lineWidth = 2.4; c.stroke();
}
function heroEye(c, x, y, rx, ry, lx, ly, pr) {
  c.fillStyle = '#FFFFFF'; c.strokeStyle = INK; c.lineWidth = 2.6;
  c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, TAU); c.fill(); c.stroke();
  const px = x + lx * (rx - pr - 1), py = y + ly * (ry - pr - 1);
  c.fillStyle = INK; c.beginPath(); c.arc(px, py, pr, 0, TAU); c.fill();
  c.fillStyle = '#FFF'; c.beginPath(); c.arc(px - pr * 0.3, py - pr * 0.35, pr * 0.3, 0, TAU); c.fill();
}
function mask(c, t) {
  // 飘带在后面
  const w1 = Math.sin(t * 7) * 2.5, w2 = Math.sin(t * 7 + 1) * 2.5;
  c.fillStyle = '#D8342B'; c.strokeStyle = INK; c.lineWidth = 2.6; c.lineJoin = 'round';
  c.beginPath();
  c.moveTo(-23, -78);
  c.quadraticCurveTo(-36, -80 + w1, -46, -86 + w1);
  c.quadraticCurveTo(-37, -73 + w2, -24, -70);
  c.closePath(); c.fill(); c.stroke();
  c.beginPath();
  c.moveTo(-26, -82); c.quadraticCurveTo(-8, -91, 11, -85);
  c.quadraticCurveTo(26, -92, 39, -81);
  c.quadraticCurveTo(40, -66, 25, -60);
  c.quadraticCurveTo(15, -60, 11, -67);
  c.quadraticCurveTo(6, -60, -6, -60);
  c.quadraticCurveTo(-23, -62, -26, -82);
  c.closePath(); c.fill(); c.stroke();
}
function heroFaceArt(c, h, t) {
  mask(c, t);
  const blink = h.blink > 0;
  const lx = h.lookX, ly = h.lookY;
  const f = h.face;
  const E1 = [-5, -73, 12, 13], E2 = [24, -73, 11, 12.5];
  const closedArc = (e, up) => {
    c.strokeStyle = INK; c.lineWidth = 3.2; c.lineCap = 'round';
    c.beginPath();
    c.arc(e[0], e[1] + (up ? 4 : -2), e[2] * 0.72, up ? Math.PI * 1.12 : Math.PI * 0.12, up ? Math.PI * 1.88 : Math.PI * 0.88);
    c.stroke();
  };
  if (f === 'strain') {
    c.strokeStyle = INK; c.lineWidth = 3.4; c.lineCap = 'round';
    c.beginPath(); c.moveTo(-13, -79); c.lineTo(1, -73); c.lineTo(-13, -67); c.stroke();
    c.beginPath(); c.moveTo(32, -79); c.lineTo(18, -73); c.lineTo(32, -67); c.stroke();
  } else if (f === 'dizzy') {
    [E1, E2].forEach((e) => {
      c.fillStyle = '#FFF'; c.strokeStyle = INK; c.lineWidth = 2.6;
      c.beginPath(); c.ellipse(e[0], e[1], e[2], e[3], 0, 0, TAU); c.fill(); c.stroke();
      c.lineWidth = 2; c.beginPath();
      for (let i = 0; i <= 26; i++) {
        const a = i * 0.62 + t * 7, r = (i / 26) * e[2] * 0.82;
        c[i ? 'lineTo' : 'moveTo'](e[0] + Math.cos(a) * r, e[1] + Math.sin(a) * r);
      }
      c.stroke();
    });
  } else if (f === 'sing' || blink) {
    closedArc(E1, f === 'sing'); closedArc(E2, f === 'sing');
  } else {
    const wow = f === 'wow', blank = f === 'blank';
    const pr = blank ? 2 : wow ? 3.2 : 5.4;
    const g = wow ? 1.14 : 1;
    heroEye(c, E1[0], E1[1], E1[2] * g, E1[3] * g, lx, ly, pr);
    heroEye(c, E2[0], E2[1], E2[2] * g, E2[3] * g, lx, ly, pr);
    if (f === 'smug') {
      c.fillStyle = '#D8342B'; c.strokeStyle = INK; c.lineWidth = 2.6;
      [E1, E2].forEach((e) => {
        c.beginPath(); c.moveTo(e[0] - e[2] - 1, e[1] - 2); c.lineTo(e[0] + e[2] + 1, e[1] - 2);
        c.lineTo(e[0] + e[2] * 0.7, e[1] - e[3]); c.lineTo(e[0] - e[2] * 0.7, e[1] - e[3]); c.closePath(); c.fill(); c.stroke();
      });
    }
  }
  // 嘴
  c.lineCap = 'round'; c.lineJoin = 'round';
  c.strokeStyle = INK;
  if (f === 'strain') {
    c.fillStyle = '#FFF'; c.lineWidth = 2.8;
    c.beginPath(); c.roundRect(-8, -52, 36, 14, 5); c.fill(); c.stroke();
    c.lineWidth = 1.8; c.beginPath();
    for (let i = 0; i < 6; i++) c[i ? 'lineTo' : 'moveTo'](-6 + i * 6.4, -45 + (i % 2 ? 3 : -3));
    c.stroke();
    c.fillStyle = 'rgba(216,52,43,.55)';
    c.beginPath(); c.ellipse(-24, -48, 8, 5, 0, 0, TAU); c.fill();
    c.beginPath(); c.ellipse(36, -48, 7, 5, 0, 0, TAU); c.fill();
  } else if (f === 'wow') {
    c.fillStyle = '#5B1712'; c.lineWidth = 2.8;
    c.beginPath(); c.ellipse(10, -43, 9, 10, 0, 0, TAU); c.fill(); c.stroke();
  } else if (f === 'sing') {
    c.fillStyle = '#5B1712'; c.lineWidth = 2.8;
    c.beginPath(); c.moveTo(-8, -52); c.quadraticCurveTo(10, -48, 28, -52); c.quadraticCurveTo(26, -28, 10, -28); c.quadraticCurveTo(-6, -28, -8, -52); c.closePath(); c.fill(); c.stroke();
    c.fillStyle = '#F2787C'; c.beginPath(); c.ellipse(10, -33, 8, 5, 0, 0, TAU); c.fill();
  } else if (f === 'dizzy') {
    c.lineWidth = 3; c.beginPath();
    for (let i = 0; i <= 12; i++) c[i ? 'lineTo' : 'moveTo'](-8 + i * 3, -43 + Math.sin(i * 1.5 + t * 6) * 2.4);
    c.stroke();
  } else if (f === 'blank') {
    c.lineWidth = 3; c.beginPath(); c.moveTo(0, -43); c.lineTo(20, -43); c.stroke();
  } else if (f === 'smug') {
    c.lineWidth = 3; c.beginPath(); c.moveTo(-4, -44); c.quadraticCurveTo(12, -38, 28, -50); c.stroke();
  } else {
    // 大白牙
    const wide = f === 'grin' ? 1 : 0.72;
    c.fillStyle = '#FFF'; c.lineWidth = 2.8;
    c.beginPath();
    c.moveTo(10 - 24 * wide, -53);
    c.quadraticCurveTo(10, -46, 10 + 24 * wide, -53);
    c.quadraticCurveTo(10 + 20 * wide, -33, 10, -33);
    c.quadraticCurveTo(10 - 20 * wide, -33, 10 - 24 * wide, -53);
    c.closePath(); c.fill(); c.stroke();
    c.lineWidth = 1.6; c.beginPath();
    c.moveTo(10 - 19 * wide, -43.5); c.quadraticCurveTo(10, -38, 10 + 19 * wide, -43.5);
    for (let i = -1; i <= 1; i++) { c.moveTo(10 + i * 9 * wide, -49); c.lineTo(10 + i * 9 * wide, -34.5); }
    c.stroke();
  }
  if (f === 'strain') {
    // 汗
    const k = (t * 2.4) % 1;
    c.fillStyle = '#7FD6FF'; c.strokeStyle = INK; c.lineWidth = 1.8;
    c.beginPath(); c.ellipse(42, -92 + k * 12, 3, 4.4, 0, 0, TAU); c.fill(); c.stroke();
  }
}
/** 手里拿的东西（局部坐标，已经在手上）。由 world 传进来 sp */
export function drawHero(c, h, sp, t) {
  const breath = Math.sin(t * 2.6) * 0.016;
  const lift = -9; // 身体比脚高一截，露出腿
  cape(c, h.capeUp, t);
  hose(c, -17, -16 + lift, h.legB.x - 4, h.legB.y - 12, 3, sp.sk.dark); boot(c, h.legB.x, h.legB.y);
  hose(c, 17, -16 + lift, h.legF.x - 4, h.legF.y - 12, 3, sp.sk.dark); boot(c, h.legF.x, h.legF.y);
  hose(c, -36, -54 + lift, h.armB.x, h.armB.y, -6, sp.sk.dark);
  glove(c, h.armB.x, h.armB.y, Math.atan2(h.armB.y + 54 - lift, h.armB.x + 36));
  c.save(); c.translate(0, lift - 2); c.scale(1, 1 + breath); c.translate(0, 2);
  const jg = h.j || 0;
  put(c, sp.t1, 0, 0);
  put(c, sp.t2, jg * 5, 0);
  put(c, sp.t3, jg * 10, 0);
  put(c, sp.tip, jg * 14, 0);
  c.translate(jg * 5, 0);
  heroFaceArt(c, h, t);
  c.restore();
  hose(c, 36, -54 + lift, h.armF.x, h.armF.y, 7, sp.sk.dark);
  const fa = Math.atan2(h.armF.y + 54 - lift, h.armF.x - 36);
  if (h.holdDraw) { c.save(); c.translate(h.armF.x + Math.cos(fa) * 12, h.armF.y + Math.sin(fa) * 12); c.rotate(-0.3); h.holdDraw(c); c.restore(); }
  glove(c, h.armF.x, h.armF.y, fa);
}

/* ─────────────── 飞出去的小便便 ─────────────── */

export function buildPoopSprites(sk, ps) {
  const S = 120;
  const body = (c) => {
    c.save(); c.translate(0, 34); c.scale(0.86, 0.86); c.translate(0, 8);
    lump(c, 0, -38, 49, 28, 0.05, sk, 4.2);
    lump(c, 0, -70, 37, 22, -0.05, sk, 4.2);
    lump(c, 2, -94, 24, 15, 0.08, sk, 4.2);
    c.scale(1, 1); tipShape(c, sk);
    c.restore();
  };
  const faceHappy = (c) => {
    c.fillStyle = '#FFF'; c.strokeStyle = INK; c.lineWidth = 3;
    [-15, 15].forEach((x) => {
      c.beginPath(); c.ellipse(x, -22, 10, 12, 0, 0, TAU); c.fill(); c.stroke();
      c.fillStyle = INK; c.beginPath(); c.arc(x + 2.5, -21, 5, 0, TAU); c.fill(); c.fillStyle = '#FFF';
    });
    c.lineWidth = 3.4; c.lineCap = 'round';
    c.beginPath(); c.arc(0, 0, 16, 0.2, Math.PI - 0.2); c.stroke();
  };
  return {
    poop: sprite(S, S, S / 2, S / 2, ps * 1.1, (c) => { c.translate(0, 8); body(c); faceHappy(c); }),
    disc: sprite(S, S, S / 2, S / 2, ps * 1.1, (c) => {
      c.fillStyle = sk.base; c.strokeStyle = INK; c.lineWidth = 4.2;
      c.beginPath(); c.arc(0, 0, 48, 0, TAU); c.fill();
      c.fillStyle = sk.dark; c.beginPath(); c.arc(4, 6, 42, 0, TAU); c.fill();
      c.fillStyle = sk.base; c.beginPath(); c.arc(-2, -2, 40, 0, TAU); c.fill();
      c.strokeStyle = INK; c.lineWidth = 4; c.lineCap = 'round';
      c.beginPath();
      for (let i = 0; i <= 44; i++) {
        const a = i * 0.34, r = 6 + i * 0.92;
        c[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r, Math.sin(a) * r);
      }
      c.stroke();
      c.lineWidth = 4.2; c.beginPath(); c.arc(0, 0, 48, 0, TAU); c.stroke();
    }),
    bomb: sprite(S, S, S / 2, S / 2, ps * 1.1, (c) => {
      const p = new Path2D(); p.arc(0, 0, 42, 0, TAU);
      c.fillStyle = sk.base; c.fill(p);
      c.save(); c.clip(p);
      c.fillStyle = sk.dark; c.beginPath(); c.arc(9, 13, 44, 0, TAU); c.fill();
      c.fillStyle = sk.base; c.beginPath(); c.arc(-4, -5, 36, 0, TAU); c.fill();
      c.fillStyle = sk.light; c.beginPath(); c.ellipse(-12, -19, 20, 11, -0.5, 0, TAU); c.fill();
      c.restore();
      c.strokeStyle = sk.hi; c.lineWidth = 4; c.lineCap = 'round';
      c.beginPath(); c.arc(-4, -4, 27, Math.PI * 1.08, Math.PI * 1.42); c.stroke();
      c.strokeStyle = INK; c.lineWidth = 4.2; c.stroke(p);
      // 引信的小铁帽
      c.fillStyle = '#5A5E6E'; c.lineWidth = 3.6; c.lineJoin = 'round';
      c.beginPath(); c.roundRect(-9, -50, 22, 11, 3); c.fill(); c.stroke();
      // 一对害怕的小眼睛
      c.fillStyle = '#FFF'; c.lineWidth = 3;
      [-15, 13].forEach((x) => {
        c.beginPath(); c.ellipse(x, -2, 9, 11, 0, 0, TAU); c.fill(); c.stroke();
      });
      c.fillStyle = INK;
      c.beginPath(); c.arc(-14, 1, 4, 0, TAU); c.arc(14, 1, 4, 0, TAU); c.fill();
      c.strokeStyle = INK; c.lineWidth = 3.4; c.lineCap = 'round';
      c.beginPath(); c.moveTo(-7, 20); c.quadraticCurveTo(0, 16, 7, 20); c.stroke();
    }),
  };
}

export function drawFuse(c, r, t, burn) {
  // 引线：r 是便便的大小
  const x0 = r * 0.05, y0 = -r * 1.16;
  c.strokeStyle = INK; c.lineWidth = r * 0.13; c.lineCap = 'round';
  const L = 1 - burn * 0.75;
  const xe = x0 + r * 0.55 * L, ye = y0 - r * 0.5 * L;
  c.beginPath(); c.moveTo(x0, y0); c.quadraticCurveTo(x0 + r * 0.05, y0 - r * 0.45 * L, xe, ye); c.stroke();
  const f = 0.7 + Math.sin(t * 40) * 0.3;
  starPath(c, xe, ye, r * 0.3 * f, t * 9);
  c.fillStyle = '#FFD23F'; c.fill();
  c.strokeStyle = '#FF6A1C'; c.lineWidth = r * 0.06; c.stroke();
}

/* ─────────────── 布偶 ─────────────── */

const BURLAP = '#DCB77F', BURLAP_D = '#C3975D', BURLAP_L = '#EACE9D', SEAM = '#7A3A22';

function weave(c, x, y, w, h) {
  c.save();
  c.strokeStyle = 'rgba(120,84,40,.26)'; c.lineWidth = 0.9;
  c.beginPath();
  for (let i = x; i < x + w; i += 4.2) { c.moveTo(i, y); c.lineTo(i, y + h); }
  for (let j = y; j < y + h; j += 4.2) { c.moveTo(x, j); c.lineTo(x + w, j); }
  c.stroke();
  c.restore();
}
function clothShape(c, p, x, y, w, h, shade) {
  c.fillStyle = BURLAP; c.fill(p);
  c.save(); c.clip(p);
  weave(c, x, y, w, h);
  shade(c);
  c.restore();
  c.strokeStyle = INK; c.lineWidth = 3.2; c.stroke(p);
}
function stitches(c, pts, col = SEAM, lw = 2.2) {
  c.strokeStyle = col; c.lineWidth = lw; c.lineCap = 'round';
  c.beginPath();
  for (let i = 0; i < pts.length; i++) {
    const [x, y, a] = pts[i], d = 3;
    c.moveTo(x - Math.cos(a) * d, y - Math.sin(a) * d);
    c.lineTo(x + Math.cos(a) * d, y + Math.sin(a) * d);
  }
  c.stroke();
}
function pin(c, x0, y0, x1, y1, col) {
  c.strokeStyle = INK; c.lineWidth = 3.2; c.lineCap = 'round';
  c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke();
  c.strokeStyle = '#D9DEE3'; c.lineWidth = 1.5;
  c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke();
  c.fillStyle = col; c.strokeStyle = INK; c.lineWidth = 2.4;
  c.beginPath(); c.arc(x1, y1, 5, 0, TAU); c.fill(); c.stroke();
  c.fillStyle = 'rgba(255,255,255,.75)';
  c.beginPath(); c.arc(x1 - 1.6, y1 - 1.8, 1.5, 0, TAU); c.fill();
}
function limbPath(len, r) {
  const p = new Path2D();
  p.moveTo(-r * 0.86, 0);
  p.quadraticCurveTo(-r, len * 0.6, -r, len - r * 0.2);
  p.bezierCurveTo(-r, len + r * 1.05, r, len + r * 1.05, r, len - r * 0.2);
  p.quadraticCurveTo(r, len * 0.6, r * 0.86, 0);
  p.quadraticCurveTo(0, -r * 0.7, -r * 0.86, 0);
  p.closePath();
  return p;
}
function drawLimb(c, len, r) {
  const p = limbPath(len, r);
  clothShape(c, p, -r - 2, -r - 2, r * 2 + 4, len + r * 2 + 6, (c2) => {
    c2.fillStyle = BURLAP_D; c2.globalAlpha = 0.7;
    c2.beginPath(); c2.ellipse(r * 0.75, len * 0.45, r * 0.6, len * 0.9, 0, 0, TAU); c2.fill(); c2.globalAlpha = 1;
  });
  stitches(c, [[0, len + r * 0.22, 0], [-r * 0.55, len + r * 0.08, 0.5], [r * 0.55, len + r * 0.08, -0.5]]);
}
/** 身体各部分。pivot 在父节点坐标里；bbox 是局部坐标范围；hit 是碰撞圆 */
export const DOLL_PARTS = [
  { id: 'legB', px: 13, py: -30, a0: -0.08, bbox: [-20, -12, 40, 54], hit: [0, 16, 14], k: 120,
    draw: (c) => drawLimb(c, 21, 13) },
  { id: 'legF', px: -13, py: -30, a0: 0.08, bbox: [-20, -12, 40, 54], hit: [0, 16, 14], k: 120,
    draw: (c) => drawLimb(c, 21, 13) },
  { id: 'armB', px: 28, py: -70, a0: -0.55, bbox: [-18, -12, 36, 62], hit: [0, 20, 12], k: 42,
    draw: (c) => drawLimb(c, 31, 10.5) },
  { id: 'torso', px: 0, py: -22, a0: 0, bbox: [-44, -68, 88, 80], hit: [0, -26, 31], k: 150,
    draw: (c) => {
      const p = new Path2D();
      p.moveTo(-22, -54); p.bezierCurveTo(-35, -46, -38, -14, -30, -4);
      p.bezierCurveTo(-20, 8, 20, 8, 30, -4);
      p.bezierCurveTo(38, -14, 35, -46, 22, -54);
      p.bezierCurveTo(12, -60, -12, -60, -22, -54);
      p.closePath();
      clothShape(c, p, -40, -62, 80, 74, (c2) => {
        c2.fillStyle = BURLAP_D; c2.globalAlpha = 0.75;
        c2.beginPath(); c2.ellipse(20, -8, 26, 42, -0.15, 0, TAU); c2.fill(); c2.globalAlpha = 1;
      });
      // 红心补丁
      const h = new Path2D();
      h.moveTo(-6, -22); h.bezierCurveTo(-24, -34, -18, -48, -6, -40); h.bezierCurveTo(6, -48, 12, -34, -6, -22); h.closePath();
      c.fillStyle = '#D93A32'; c.fill(h);
      c.strokeStyle = INK; c.lineWidth = 2.6; c.stroke(h);
      c.strokeStyle = 'rgba(255,255,255,.6)'; c.lineWidth = 1.8;
      c.beginPath(); c.moveTo(-13, -38); c.quadraticCurveTo(-14, -42, -10, -41.5); c.stroke();
      stitches(c, [[-6, -3, 1.57], [4, -3, 1.57], [-16, -3, 1.57], [14, -3.6, 1.57], [-23, -6, 1.2], [21, -7, 1.9]]);
      pin(c, 14, -30, 40, -48, '#3F7FD8');
    } },
  { id: 'armF', px: -28, py: -70, a0: 0.55, bbox: [-18, -12, 36, 62], hit: [0, 20, 12], k: 42,
    draw: (c) => drawLimb(c, 31, 10.5) },
  { id: 'head', px: 0, py: -74, a0: 0, bbox: [-54, -96, 108, 108], hit: [0, -38, 39], k: 90,
    draw: (c) => {
      // 头顶的麻绳辫子
      c.strokeStyle = INK; c.lineCap = 'round';
      [[-9, -84], [-1, -89], [8, -84]].forEach(([x, y]) => {
        c.lineWidth = 6.5; c.beginPath(); c.moveTo(0, -72); c.quadraticCurveTo(x * 0.5, -80, x, y); c.stroke();
        c.strokeStyle = '#B98B4E'; c.lineWidth = 2.6; c.beginPath(); c.moveTo(0, -72); c.quadraticCurveTo(x * 0.5, -80, x, y); c.stroke();
        c.strokeStyle = INK;
      });
      const p = new Path2D();
      p.moveTo(-41, -38);
      p.bezierCurveTo(-42, -62, -24, -77, 0, -77);
      p.bezierCurveTo(24, -77, 42, -62, 41, -38);
      p.bezierCurveTo(41, -14, 24, -1, 0, -1);
      p.bezierCurveTo(-24, -1, -41, -14, -41, -38);
      p.closePath();
      clothShape(c, p, -44, -80, 88, 82, (c2) => {
        c2.fillStyle = BURLAP_D; c2.globalAlpha = 0.75;
        c2.beginPath(); c2.ellipse(14, -6, 40, 20, -0.15, 0, TAU); c2.fill(); c2.globalAlpha = 1;
        c2.fillStyle = BURLAP_L; c2.globalAlpha = 0.85;
        c2.beginPath(); c2.ellipse(-12, -63, 20, 8, -0.3, 0, TAU); c2.fill(); c2.globalAlpha = 1;
      });
      // 绑绳
      c.fillStyle = '#B98B4E'; c.strokeStyle = INK; c.lineWidth = 2.4;
      c.beginPath(); c.roundRect(-7, -78, 14, 6, 2); c.fill(); c.stroke();
      // 侧边缝线 + 大头针
      stitches(c, [[36, -52, 0.2], [39, -41, 0], [38, -30, -0.2], [33, -19, -0.5]]);
      pin(c, 26, -62, 48, -82, '#E8B425');
      pin(c, -30, -57, -49, -74, '#39A86A');
    } },
];

/** 布偶的表情（在头部的局部坐标里画，盖在糊的东西上面，这样糊满了也能看到眼睛） */
export function drawDollFace(c, d, t) {
  const f = d.face;
  const eyes = [[-17, -46, 13], [14, -46, 12]];
  c.lineCap = 'round'; c.lineJoin = 'round';
  eyes.forEach((e, i) => {
    const [x, y, r0] = e;
    if (f === 'wince') {
      c.strokeStyle = INK; c.lineWidth = 3.4;
      const s = i ? -1 : 1;
      c.beginPath(); c.moveTo(x - 8 * s, y - 7); c.lineTo(x + 7 * s, y); c.lineTo(x - 8 * s, y + 7); c.stroke();
      return;
    }
    if (f === 'bliss') {
      c.strokeStyle = INK; c.lineWidth = 3.4;
      c.beginPath(); c.arc(x, y + 4, 8, Math.PI * 1.12, Math.PI * 1.88); c.stroke();
      return;
    }
    const r = f === 'shock' ? r0 * 1.26 : r0;
    c.fillStyle = '#FFF'; c.strokeStyle = INK; c.lineWidth = 3;
    c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill(); c.stroke();
    if (f === 'dizzy') {
      c.lineWidth = 2; c.beginPath();
      for (let k = 0; k <= 24; k++) {
        const a = k * 0.66 + t * (i ? -8 : 8), q = (k / 24) * r * 0.8;
        c[k ? 'lineTo' : 'moveTo'](x + Math.cos(a) * q, y + Math.sin(a) * q);
      }
      c.stroke();
    } else {
      const pr = f === 'shock' || f === 'blank' ? r * 0.26 : r * 0.47;
      const m = r - pr - 1.5;
      const px = x + d.pupil[i].x * m, py = y + d.pupil[i].y * m;
      c.fillStyle = INK; c.beginPath(); c.arc(px, py, pr, 0, TAU); c.fill();
      c.fillStyle = '#FFF'; c.beginPath(); c.arc(px - pr * 0.3, py - pr * 0.35, pr * 0.28, 0, TAU); c.fill();
    }
    if (f === 'smug' || f === 'grump') {
      const tilt = f === 'grump' ? (i ? 0.26 : -0.26) : 0;
      c.save(); c.translate(x, y); c.rotate(-tilt);
      c.fillStyle = BURLAP_D; c.strokeStyle = INK; c.lineWidth = 3;
      c.beginPath(); c.moveTo(-r - 1.5, -1); c.lineTo(r + 1.5, -1); c.arc(0, -1, r + 1.5, 0, Math.PI, true); c.closePath(); c.fill(); c.stroke();
      c.restore();
    }
  });
  // 缝出来的嘴
  const stitch = (pts) => {
    c.strokeStyle = INK; c.lineWidth = 3;
    c.beginPath();
    pts.forEach((p, i) => c[i ? 'lineTo' : 'moveTo'](p[0], p[1]));
    c.stroke();
    c.lineWidth = 2.2; c.beginPath();
    const n = pts.length;
    for (let i = 0; i < n; i++) {
      const [x, y] = pts[i];
      c.moveTo(x, y - 4); c.lineTo(x, y + 4);
    }
    c.stroke();
  };
  const my = -19, mx = -3;
  if (f === 'shock') {
    c.fillStyle = '#4A1712'; c.strokeStyle = INK; c.lineWidth = 3;
    c.beginPath(); c.ellipse(mx, my + 1, 8, 10, 0, 0, TAU); c.fill(); c.stroke();
  } else if (f === 'bliss') {
    stitch(Array.from({ length: 5 }, (_, i) => [mx - 13 + i * 6.5, my + 5 - Math.pow(i - 2, 2) * 1.6]));
  } else if (f === 'smug') {
    stitch(Array.from({ length: 5 }, (_, i) => [mx - 13 + i * 6.5, my + 3 - i * 1.6 - (i === 4 ? 1.5 : 0)]));
  } else if (f === 'wince' || f === 'grump') {
    stitch(Array.from({ length: 5 }, (_, i) => [mx - 13 + i * 6.5, my + (i % 2 ? -3 : 3)]));
  } else if (f === 'dizzy') {
    stitch(Array.from({ length: 6 }, (_, i) => [mx - 14 + i * 5.6, my + Math.sin(i * 1.7 + t * 6) * 3]));
  } else if (f === 'blank') {
    c.strokeStyle = INK; c.lineWidth = 3; c.beginPath(); c.moveTo(mx - 8, my); c.lineTo(mx + 8, my); c.stroke();
  } else {
    stitch(Array.from({ length: 5 }, (_, i) => [mx - 12 + i * 6, my]));
  }
}

/** 冰淇淋帽子：n 层，画在头部局部坐标 */
export function drawHat(c, n, sk, cherry, sway, popS, t) {
  if (n <= 0) return;
  let y = -70;
  for (let i = 0; i < n; i++) {
    const k = i / Math.max(1, n);
    const rx = Math.max(9, 34 - i * 3.5 - 0.5);
    const ry = Math.max(7, 12 - i * 0.5);
    const pop = i === n - 1 ? popS : 1;
    const off = sway * (i + 1) * 2.6 + Math.sin(i * 1.3) * 2;
    c.save(); c.translate(off, y - ry * 0.25); c.scale(pop, pop);
    lump(c, 0, 0, rx, ry, (i % 2 ? -1 : 1) * 0.1, sk, 2.8);
    c.restore();
    y -= ry * 1.28;
    if (k > 1) break;
  }
  const topOff = sway * (n + 1) * 2.6;
  if (cherry) {
    c.save(); c.translate(topOff, y - 4);
    c.strokeStyle = INK; c.lineWidth = 2.4; c.lineCap = 'round';
    c.beginPath(); c.moveTo(1, -6); c.quadraticCurveTo(4, -16, 12, -18); c.stroke();
    c.fillStyle = '#E2342C'; c.lineWidth = 2.6;
    c.beginPath(); c.arc(0, 0, 8, 0, TAU); c.fill(); c.stroke();
    c.fillStyle = '#FFC9C4'; c.beginPath(); c.arc(-2.6, -3, 2, 0, TAU); c.fill();
    c.restore();
  }
}
export function hatTop(n) {
  let y = -70;
  for (let i = 0; i < n; i++) y -= Math.max(7, 12 - i * 0.5) * 1.28;
  return y;
}

/** 小雨伞：在布偶本地坐标里画 */
export function drawUmbrella(c, u, hx, hy) {
  const open = u.open, cx = 2 + u.kick * 2, cy = -192 + u.kick * 6;
  c.lineCap = 'round';
  c.strokeStyle = INK; c.lineWidth = 3.4;
  c.beginPath(); c.moveTo(hx, hy); c.lineTo(cx, cy); c.stroke();
  c.save(); c.translate(cx, cy);
  const W = 66 * Math.max(0.12, open), H = 36 * Math.max(0.2, open);
  const flip = u.broken;
  const cols = ['#F5CE42', '#E5493E', '#F5CE42', '#E5493E'];
  c.scale(1, 1 - flip * 1.7);
  for (let i = 0; i < 4; i++) {
    const x0 = -W + (i / 4) * 2 * W, x1 = -W + ((i + 1) / 4) * 2 * W;
    c.beginPath();
    c.moveTo(0, -H);
    c.quadraticCurveTo(x0, -H * 0.8, x0, 0);
    c.quadraticCurveTo((x0 + x1) / 2, -7 * open, x1, 0);
    c.quadraticCurveTo(x1, -H * 0.8, 0, -H);
    c.closePath();
    c.fillStyle = cols[i]; c.fill();
    c.strokeStyle = INK; c.lineWidth = 2.8; c.lineJoin = 'round'; c.stroke();
  }
  c.restore();
}

/* ─────────────── 道具 ─────────────── */

export function drawTrampoline(c, p) {
  // 原点在地面中心。sag 是垫子往下凹多少
  c.save(); c.translate(p.x, p.y); c.scale(p.u * p.s * 1.25, p.u * p.s * 1.25);
  c.lineCap = 'round'; c.lineJoin = 'round';
  c.strokeStyle = INK; c.lineWidth = 7;
  c.beginPath(); c.moveTo(-30, -26); c.lineTo(-37, 0); c.moveTo(30, -26); c.lineTo(37, 0); c.stroke();
  c.strokeStyle = '#3F7FD8'; c.lineWidth = 3;
  c.beginPath(); c.moveTo(-30, -26); c.lineTo(-37, 0); c.moveTo(30, -26); c.lineTo(37, 0); c.stroke();
  // 垫子
  c.strokeStyle = INK; c.lineWidth = 7;
  c.beginPath(); c.moveTo(-36, -28); c.quadraticCurveTo(0, -28 + p.sag * 26, 36, -28); c.stroke();
  c.strokeStyle = '#2A2F3A'; c.lineWidth = 3.4;
  c.beginPath(); c.moveTo(-36, -28); c.quadraticCurveTo(0, -28 + p.sag * 26, 36, -28); c.stroke();
  [-1, 1].forEach((s) => {
    c.fillStyle = '#F7C531'; c.strokeStyle = INK; c.lineWidth = 2.8;
    c.beginPath(); c.arc(s * 37, -28, 6, 0, TAU); c.fill(); c.stroke();
  });
  c.restore();
}
export function drawCloud(c, p, t) {
  c.save(); c.translate(p.x, p.y); c.scale(p.u * p.s, p.u * p.s);
  const mix = (a, b, k) => {
    const pa = a.match(/\w\w/g).map((h) => parseInt(h, 16)), pb = b.match(/\w\w/g).map((h) => parseInt(h, 16));
    return `rgb(${pa.map((v, i) => Math.round(v + (pb[i] - v) * k)).join(',')})`;
  };
  const col = mix('FFFFFF', '5A5E6E', p.dark), shade = mix('CFE4EE', '3C4050', p.dark);
  const lobes = [[-46, 4, 26], [-20, -14, 32], [16, -18, 34], [46, 2, 26], [0, 10, 36]];
  c.strokeStyle = INK; c.lineWidth = 6.4;
  lobes.forEach(([x, y, r]) => { c.beginPath(); c.arc(x, y, r, 0, TAU); c.stroke(); });
  c.fillStyle = col;
  lobes.forEach(([x, y, r]) => { c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill(); });
  c.fillStyle = shade;
  c.beginPath(); c.ellipse(4, 22, 54, 12, 0, 0, TAU); c.fill();
  // 小脸
  c.fillStyle = INK; c.strokeStyle = INK; c.lineCap = 'round';
  if (p.dark > 0.5) {
    c.lineWidth = 3.4;
    c.beginPath(); c.moveTo(-24, -12); c.lineTo(-9, -5); c.moveTo(24, -12); c.lineTo(9, -5); c.stroke();
    c.beginPath(); c.arc(-14, 0, 3.4, 0, TAU); c.arc(14, 0, 3.4, 0, TAU); c.fill();
    c.lineWidth = 3; c.beginPath(); c.moveTo(-10, 16); c.quadraticCurveTo(0, 7, 10, 16); c.stroke();
  } else {
    c.beginPath(); c.arc(-14, -4, 3.4, 0, TAU); c.arc(14, -4, 3.4, 0, TAU); c.fill();
    c.lineWidth = 3; c.beginPath(); c.arc(0, 2, 7, 0.25, Math.PI - 0.25); c.stroke();
  }
  c.restore();
}
export function drawNozzle(c, p) {
  c.save(); c.translate(p.x, p.y); c.scale(p.u, p.u);
  c.lineJoin = 'round'; c.lineWidth = 3.2; c.strokeStyle = INK;
  const top = -p.y / p.u - 4;
  c.fillStyle = '#C7D0D8';
  c.beginPath(); c.rect(-9, top, 18, -top - 30); c.fill(); c.stroke();
  c.fillStyle = '#EAF0F4'; c.fillRect(-6, top, 4, -top - 30);
  c.fillStyle = '#F2779B';
  c.beginPath(); c.roundRect(-24, -44, 48, 16, 4); c.fill(); c.stroke();
  c.fillStyle = '#E3E8EC';
  c.beginPath(); c.moveTo(-18, -28); c.lineTo(18, -28); c.lineTo(8 * (1 + p.sq * 0.2), 0); c.lineTo(-8 * (1 + p.sq * 0.2), 0); c.closePath(); c.fill(); c.stroke();
  c.strokeStyle = 'rgba(31,19,12,.5)'; c.lineWidth = 1.8;
  c.beginPath(); c.moveTo(-7, -26); c.lineTo(-3, -2); c.moveTo(7, -26); c.lineTo(3, -2); c.stroke();
  c.restore();
}
export function drawShower(c, p) {
  c.save(); c.translate(p.x, p.y); c.scale(p.u, p.u);
  c.lineJoin = 'round'; c.lineWidth = 3.2; c.strokeStyle = INK;
  const top = -p.y / p.u - 4;
  c.fillStyle = '#C7D0D8';
  c.beginPath(); c.rect(-5, top, 10, -top - 14); c.fill(); c.stroke();
  c.fillStyle = '#E9EFF3';
  c.beginPath(); c.moveTo(-10, -16); c.lineTo(10, -16); c.lineTo(38, 8); c.lineTo(-38, 8); c.closePath(); c.fill(); c.stroke();
  c.fillStyle = '#9AA7B2';
  c.beginPath(); c.roundRect(-40, 6, 80, 8, 3); c.fill(); c.stroke();
  c.fillStyle = INK;
  for (let i = -3; i <= 3; i++) { c.beginPath(); c.arc(i * 10.5, 10, 1.5, 0, TAU); c.fill(); }
  c.restore();
}
/** 马桶炮：原点在底座中心。mouth() 给出炮口的本地坐标 */
export const TOILET_MOUTH = [38, -74];
export function drawToilet(c, p, t) {
  c.save(); c.translate(p.x + (p.shake ? Math.sin(t * 70) * p.shake * 2.4 * p.u : 0), p.y);
  c.scale(p.u * p.s, p.u * p.s);
  c.rotate(p.tilt);
  c.lineJoin = 'round'; c.lineCap = 'round'; c.strokeStyle = INK; c.lineWidth = 3.4;
  // 水箱
  c.fillStyle = '#FFFFFF';
  c.beginPath(); c.roundRect(-58, -92, 34, 58, 5); c.fill(); c.stroke();
  c.fillStyle = '#D3E7EE'; c.beginPath(); c.roundRect(-34, -88, 7, 50, 3); c.fill();
  c.fillStyle = '#FFFFFF'; c.beginPath(); c.roundRect(-62, -100, 42, 10, 4); c.fill(); c.stroke();
  // 手柄
  c.strokeStyle = INK; c.lineWidth = 5.5; c.beginPath(); c.moveTo(-52, -82); c.lineTo(-68, -80 + p.lever * 12); c.stroke();
  c.strokeStyle = '#C7D0D8'; c.lineWidth = 2.2; c.beginPath(); c.moveTo(-52, -82); c.lineTo(-68, -80 + p.lever * 12); c.stroke();
  c.fillStyle = '#E5493E'; c.strokeStyle = INK; c.lineWidth = 2.6; c.beginPath(); c.arc(-69, -80 + p.lever * 12, 4.6, 0, TAU); c.fill(); c.stroke();
  // 马桶身
  c.lineWidth = 3.4;
  c.fillStyle = '#FFFFFF';
  c.beginPath();
  c.moveTo(-30, -56); c.lineTo(50, -56);
  c.bezierCurveTo(50, -22, 28, -18, 20, -14);
  c.lineTo(22, 0); c.lineTo(-22, 0); c.lineTo(-18, -18);
  c.bezierCurveTo(-30, -26, -30, -40, -30, -56);
  c.closePath(); c.fill(); c.stroke();
  c.fillStyle = '#D3E7EE';
  c.beginPath(); c.moveTo(20, -14); c.bezierCurveTo(28, -18, 44, -24, 48, -46); c.bezierCurveTo(36, -32, 12, -28, -8, -28); c.lineTo(-18, -18); c.closePath(); c.fill();
  // 坐圈
  c.fillStyle = '#FFFFFF';
  c.beginPath(); c.roundRect(-32, -62, 86, 10, 5); c.fill(); c.stroke();
  // 炮口：黑洞洞的一圈 + 水
  c.fillStyle = '#2A2F3A';
  c.beginPath(); c.ellipse(11, -57.5, 36, 4.2, 0, 0, TAU); c.fill(); c.stroke();
  // 盖子（翻开）
  c.save(); c.translate(-30, -62); c.rotate(-1.42 * p.lid);
  c.fillStyle = '#FFFFFF';
  c.beginPath(); c.roundRect(-2, -11, 78, 11, 5); c.fill(); c.stroke();
  c.fillStyle = '#D3E7EE';
  c.beginPath(); c.roundRect(6, -4, 62, 2.6, 1.3); c.fill();
  c.restore();
  c.restore();
}

/* ─────────────── 背景 ─────────────── */

export function drawBg(c, W, H, G, wallY, U, safeT, sp, heroPortrait) {
  c.lineJoin = 'round'; c.lineCap = 'round';
  // 墙
  const bandY = safeT + 34 * U;
  c.fillStyle = '#A9E0D9'; c.fillRect(0, 0, W, wallY);
  c.strokeStyle = '#8CCFC7'; c.lineWidth = 2 * U;
  const T = 46 * U;
  c.beginPath();
  for (let y = bandY; y < wallY; y += T) { c.moveTo(0, y); c.lineTo(W, y); }
  let row = 0;
  for (let y = bandY; y < wallY; y += T, row++) {
    for (let x = (row % 2 ? T / 2 : 0); x < W; x += T) { c.moveTo(x, y); c.lineTo(x, y + T); }
  }
  c.stroke();
  c.fillStyle = 'rgba(255,255,255,.28)';
  row = 0;
  for (let y = bandY; y < wallY; y += T, row++) {
    for (let x = (row % 2 ? T / 2 : 0); x < W; x += T) {
      c.fillRect(x + 4 * U, y + 4 * U, 12 * U, 3 * U);
      c.fillRect(x + 4 * U, y + 4 * U, 3 * U, 10 * U);
    }
  }
  // 顶上的奶油色条 + 线脚
  c.fillStyle = '#FBF2D3'; c.fillRect(0, 0, W, bandY);
  c.fillStyle = '#E6D7A9'; c.fillRect(0, bandY - 5 * U, W, 5 * U);
  c.strokeStyle = INK; c.lineWidth = 3 * U;
  c.beginPath(); c.moveTo(0, bandY); c.lineTo(W, bandY); c.stroke();

  // 窗户
  const wx = 18 * U, wy = bandY + 26 * U, ww = 104 * U, wh = 112 * U;
  c.fillStyle = '#8FD6FF'; c.fillRect(wx, wy, ww, wh);
  c.save(); c.beginPath(); c.rect(wx, wy, ww, wh); c.clip();
  c.fillStyle = '#FFE06A'; c.strokeStyle = INK; c.lineWidth = 2.4 * U;
  c.beginPath(); c.arc(wx + ww * 0.72, wy + wh * 0.3, 15 * U, 0, TAU); c.fill(); c.stroke();
  c.fillStyle = '#FFF';
  [[0.28, 0.42, 16], [0.42, 0.36, 19], [0.56, 0.44, 14]].forEach(([a, b, r]) => {
    c.beginPath(); c.arc(wx + ww * a, wy + wh * b, r * U, 0, TAU); c.stroke();
  });
  [[0.28, 0.42, 16], [0.42, 0.36, 19], [0.56, 0.44, 14]].forEach(([a, b, r]) => {
    c.beginPath(); c.arc(wx + ww * a, wy + wh * b, r * U, 0, TAU); c.fill();
  });
  c.fillStyle = '#82C96A'; c.beginPath(); c.ellipse(wx + ww * 0.4, wy + wh * 1.06, ww * 0.9, wh * 0.3, 0, 0, TAU); c.fill(); c.stroke();
  c.restore();
  c.strokeStyle = INK; c.fillStyle = '#FFF'; c.lineWidth = 3 * U;
  const bar = 6 * U;
  c.beginPath();
  c.rect(wx - bar, wy - bar, ww + bar * 2, bar); c.rect(wx - bar, wy + wh, ww + bar * 2, bar);
  c.rect(wx - bar, wy, bar, wh); c.rect(wx + ww, wy, bar, wh);
  c.rect(wx + ww / 2 - bar / 2, wy, bar, wh); c.rect(wx, wy + wh / 2 - bar / 2, ww, bar);
  c.fill(); c.stroke();
  c.beginPath(); c.roundRect(wx - bar * 2, wy + wh + bar, ww + bar * 4, 7 * U, 3 * U); c.fill(); c.stroke();

  // 中间的英雄相框
  const fx = W * 0.5, fy = bandY + 66 * U, fw = 66 * U, fh = 78 * U;
  c.save();
  c.translate(fx, fy); c.rotate(-0.03);
  c.fillStyle = '#E8B425'; c.strokeStyle = INK; c.lineWidth = 3 * U;
  c.beginPath(); c.roundRect(-fw / 2, -fh / 2, fw, fh, 3 * U); c.fill(); c.stroke();
  c.fillStyle = '#FFF8E0';
  c.beginPath(); c.rect(-fw / 2 + 7 * U, -fh / 2 + 7 * U, fw - 14 * U, fh - 14 * U); c.fill(); c.stroke();
  c.save();
  c.beginPath(); c.rect(-fw / 2 + 7 * U, -fh / 2 + 7 * U, fw - 14 * U, fh - 14 * U); c.clip();
  c.translate(0, fh / 2 - 4 * U);
  c.scale(U * 0.42, U * 0.42);
  heroPortrait(c);
  c.restore();
  c.restore();

  // 置物架 + 小黄鸭 + 瓶子
  const sy = bandY + 182 * U, sx0 = W - 150 * U, sx1 = W - 14 * U;
  // 瓶子
  c.lineWidth = 2.8 * U; c.strokeStyle = INK;
  c.fillStyle = '#F2779B'; c.beginPath(); c.roundRect(sx0 + 12 * U, sy - 40 * U, 22 * U, 40 * U, 5 * U); c.fill(); c.stroke();
  c.fillStyle = '#FFF'; c.beginPath(); c.roundRect(sx0 + 18 * U, sy - 49 * U, 10 * U, 9 * U, 2 * U); c.fill(); c.stroke();
  c.fillStyle = '#FFF'; c.beginPath(); c.rect(sx0 + 15 * U, sy - 30 * U, 16 * U, 14 * U); c.fill();
  c.fillStyle = '#7FC4F2'; c.beginPath(); c.roundRect(sx0 + 44 * U, sy - 30 * U, 18 * U, 30 * U, 4 * U); c.fill(); c.stroke();
  c.fillStyle = '#FFF'; c.beginPath(); c.roundRect(sx0 + 48 * U, sy - 37 * U, 10 * U, 7 * U, 2 * U); c.fill(); c.stroke();
  // 鸭子
  const dx = sx1 - 42 * U, dy = sy;
  c.fillStyle = '#FFD84A';
  c.beginPath(); c.moveTo(dx - 24 * U, dy - 12 * U); c.quadraticCurveTo(dx - 20 * U, dy, dx, dy); c.quadraticCurveTo(dx + 24 * U, dy, dx + 22 * U, dy - 16 * U);
  c.quadraticCurveTo(dx + 8 * U, dy - 22 * U, dx - 6 * U, dy - 17 * U); c.quadraticCurveTo(dx - 16 * U, dy - 12 * U, dx - 24 * U, dy - 12 * U); c.closePath(); c.fill(); c.stroke();
  c.beginPath(); c.arc(dx - 11 * U, dy - 27 * U, 12 * U, 0, TAU); c.fill(); c.stroke();
  c.fillStyle = '#FF8A1C'; c.beginPath(); c.ellipse(dx - 24 * U, dy - 25 * U, 6 * U, 3.4 * U, 0.1, 0, TAU); c.fill(); c.stroke();
  c.fillStyle = INK; c.beginPath(); c.arc(dx - 14 * U, dy - 29 * U, 2 * U, 0, TAU); c.fill();
  // 架子
  c.fillStyle = '#C98E52'; c.lineWidth = 3 * U;
  c.beginPath(); c.roundRect(sx0, sy, sx1 - sx0, 9 * U, 2 * U); c.fill(); c.stroke();
  c.fillStyle = '#9C6A38';
  [[sx0 + 16 * U], [sx1 - 22 * U]].forEach(([x]) => {
    c.beginPath(); c.moveTo(x, sy + 9 * U); c.lineTo(x + 8 * U, sy + 9 * U); c.lineTo(x + 8 * U, sy + 20 * U); c.closePath(); c.fill(); c.stroke();
  });

  // 墙根
  c.fillStyle = '#FBF2D3'; c.fillRect(0, wallY - 14 * U, W, 14 * U);
  c.strokeStyle = INK; c.lineWidth = 3 * U;
  c.beginPath(); c.moveTo(0, wallY - 14 * U); c.lineTo(W, wallY - 14 * U); c.stroke();

  // 地板：带透视的棋盘格
  c.fillStyle = '#F7F0DC'; c.fillRect(0, wallY, W, H - wallY);
  const vx = W / 2, vy = wallY - 240 * U;
  const rows = [];
  { let y = wallY, step = 14 * U; while (y < H + 40 * U) { rows.push(y); y += step; step *= 1.32; } rows.push(y); }
  const xAt = (i, y) => vx + (i * 44 * U) * ((y - vy) / (wallY - vy));
  c.fillStyle = '#90B0BE';
  for (let r = 0; r < rows.length - 1; r++) {
    for (let i = -14; i < 14; i++) {
      if ((i + r + 100) % 2) continue;
      const y0 = rows[r], y1 = rows[r + 1];
      c.beginPath();
      c.moveTo(xAt(i, y0), y0); c.lineTo(xAt(i + 1, y0), y0);
      c.lineTo(xAt(i + 1, y1), y1); c.lineTo(xAt(i, y1), y1); c.closePath(); c.fill();
    }
  }
  c.strokeStyle = 'rgba(31,19,12,.28)'; c.lineWidth = 1.2 * U;
  c.beginPath();
  rows.forEach((y) => { c.moveTo(0, y); c.lineTo(W, y); });
  for (let i = -14; i <= 14; i++) { c.moveTo(xAt(i, wallY), wallY); c.lineTo(xAt(i, H + 200 * U), H + 200 * U); }
  c.stroke();
  c.strokeStyle = INK; c.lineWidth = 3 * U;
  c.beginPath(); c.moveTo(0, wallY); c.lineTo(W, wallY); c.stroke();
  // 地漏
  const dgx = W * 0.5, dgy = G + 42 * U;
  c.fillStyle = '#C7D0D8'; c.strokeStyle = INK; c.lineWidth = 2.6 * U;
  c.beginPath(); c.ellipse(dgx, dgy, 22 * U, 8 * U, 0, 0, TAU); c.fill(); c.stroke();
  c.lineWidth = 1.8 * U; c.beginPath();
  for (let i = -2; i <= 2; i++) { c.moveTo(dgx + i * 7 * U, dgy - 5 * U); c.lineTo(dgx + i * 7 * U, dgy + 5 * U); }
  c.stroke();
}

/** 墙上写名字的牌子 */
export function drawPlaque(c, x, y, U, name, count, pressed) {
  const w = 138 * U, h = 56 * U;
  c.save(); c.translate(x, y);
  if (pressed) c.scale(0.96, 0.96);
  c.lineJoin = 'round'; c.lineCap = 'round';
  c.strokeStyle = INK; c.lineWidth = 3 * U;
  c.beginPath(); c.moveTo(-w * 0.32, 0); c.lineTo(-w * 0.2, -20 * U); c.lineTo(w * 0.2, -20 * U); c.lineTo(w * 0.32, 0); c.stroke();
  c.fillStyle = '#FFF'; c.lineWidth = 2.4 * U;
  c.beginPath(); c.arc(0, -20 * U, 3.4 * U, 0, TAU); c.fill(); c.stroke();
  c.fillStyle = '#D9A566'; c.lineWidth = 3.2 * U;
  c.beginPath(); c.roundRect(-w / 2, 0, w, h, 6 * U); c.fill(); c.stroke();
  c.fillStyle = '#BE8848';
  c.fillRect(-w / 2 + 3 * U, h - 11 * U, w - 6 * U, 8 * U);
  c.strokeStyle = 'rgba(90,50,18,.4)'; c.lineWidth = 1.2 * U;
  c.beginPath(); c.moveTo(-w / 2 + 12 * U, 14 * U); c.quadraticCurveTo(0, 8 * U, w / 2 - 22 * U, 15 * U); c.stroke();
  c.fillStyle = INK; c.textAlign = 'center'; c.textBaseline = 'middle';
  let fs = 19 * U;
  c.font = `900 ${fs}px ${FONT}`;
  const tw = c.measureText(name).width;
  if (tw > w - 22 * U) { fs *= (w - 22 * U) / tw; c.font = `900 ${fs}px ${FONT}`; }
  c.fillText(name, 0, 21 * U);
  c.font = `700 ${11 * U}px ${FONT}`;
  c.fillStyle = '#4F2E12';
  c.fillText(count > 0 ? `已被糊 ${count} 坨` : '点牌子起名', 0, 41 * U);
  c.restore();
}

/* ─────────────── 文字 ─────────────── */

export function drawWord(c, wd, U) {
  const k = wd.t / wd.life;
  const pop = k < 0.2 ? 0.4 + (k / 0.2) * 0.85 : k < 0.32 ? 1.25 - ((k - 0.2) / 0.12) * 0.25 : 1;
  c.save();
  c.translate(wd.x, wd.y - k * 22 * U);
  c.rotate(wd.rot);
  c.scale(pop, pop);
  c.globalAlpha = k > 0.72 ? 1 - (k - 0.72) / 0.28 : 1;
  c.font = `900 ${wd.size * U}px ${FONT}`;
  c.textAlign = 'center'; c.textBaseline = 'middle';
  c.lineJoin = 'round';
  c.strokeStyle = INK; c.lineWidth = wd.size * 0.26 * U;
  c.strokeText(wd.text, 0, 0);
  c.fillStyle = wd.color; c.fillText(wd.text, 0, 0);
  c.restore();
}

function wrapChars(c, text, maxW) {
  const out = []; let line = '';
  for (const ch of text) {
    if (c.measureText(line + ch).width > maxW && line) { out.push(line); line = ch; }
    else line += ch;
  }
  if (line) out.push(line);
  return out;
}
export function drawBubble(c, b, U, W, minY) {
  c.save();
  c.font = `800 ${14.5 * U}px ${FONT}`;
  const lines = wrapChars(c, b.text, 156 * U);
  const lh = 19 * U, pad = 10 * U;
  const tw = Math.max(...lines.map((l) => c.measureText(l).width));
  const bw = tw + pad * 2, bh = lines.length * lh + pad * 1.3;
  const by = Math.max(minY, b.y - bh - 14 * U);
  const bx = Math.min(W - 8 * U - bw, Math.max(8 * U, b.x - bw / 2));
  const k = b.t < 0.12 ? 0.5 + (b.t / 0.12) * 0.6 : b.t < 0.2 ? 1.1 - ((b.t - 0.12) / 0.08) * 0.1 : 1;
  const a = b.life - b.t < 0.18 ? Math.max(0, (b.life - b.t) / 0.18) : 1;
  c.globalAlpha = a;
  const cx = bx + bw / 2, cy = by + bh / 2;
  c.translate(cx, cy); c.scale(k, k); c.translate(-cx, -cy);
  c.lineJoin = 'round';
  c.fillStyle = '#FFF'; c.strokeStyle = INK; c.lineWidth = 3 * U;
  const tailX = Math.min(bx + bw - 14 * U, Math.max(bx + 14 * U, b.x));
  c.beginPath();
  c.roundRect(bx, by, bw, bh, 11 * U);
  c.fill(); c.stroke();
  c.beginPath();
  c.moveTo(tailX - 7 * U, by + bh - 1.5 * U);
  c.lineTo(tailX + (b.x > tailX ? 3 : -3) * U, by + bh + 11 * U);
  c.lineTo(tailX + 7 * U, by + bh - 1.5 * U);
  c.fill();
  c.beginPath();
  c.moveTo(tailX - 7 * U, by + bh);
  c.lineTo(tailX + (b.x > tailX ? 3 : -3) * U, by + bh + 11 * U);
  c.lineTo(tailX + 7 * U, by + bh);
  c.stroke();
  c.fillStyle = INK; c.textAlign = 'center'; c.textBaseline = 'middle';
  lines.forEach((l, i) => c.fillText(l, cx, by + pad * 0.65 + lh * (i + 0.5)));
  c.restore();
}

export { starPath };
