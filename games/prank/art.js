// 整蛊火柴人的全部美术，纯黑白。
// 渲染办法：画到低分辨率画布上，再逐像素二值化。
//   R 通道 = 墨线（硬边，<128 就是黑）
//   G 通道 = 灰度（用 4×4 Bayer 网点抖动成黑白点，体积感全靠它）
// 所以画墨线用 INK，画灰面用 gray(v)，盖白用 PAPER，不要用别的颜色。
export const INK = 'rgb(0,255,255)';
export const PAPER = 'rgb(255,255,255)';
export const gray = (v) => `rgb(255,${v | 0},255)`;

const BAYER = new Uint8Array([0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => ((v + 0.5) * 16) | 0));
const BLACK = 0xff000000, WHITE = 0xffffffff;

export function quantize(c, w, h, invert = false) {
  const img = c.getImageData(0, 0, w, h);
  const u = new Uint32Array(img.data.buffer);
  const k0 = invert ? WHITE : BLACK, k1 = invert ? BLACK : WHITE;
  let i = 0;
  for (let y = 0; y < h; y++) {
    const row = (y & 3) << 2;
    for (let x = 0; x < w; x++, i++) {
      const v = u[i];
      u[i] = ((v & 255) < 128 || ((v >>> 8) & 255) <= BAYER[row | (x & 3)]) ? k0 : k1;
    }
  }
  c.putImageData(img, 0, 0);
}

const lin = (c, x0, y0, x1, y1, a, b) => {
  const g = c.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, gray(a)); g.addColorStop(1, gray(b));
  return g;
};
const rad = (c, x, y, r0, r1, a, b) => {
  const g = c.createRadialGradient(x, y, r0, x, y, r1);
  g.addColorStop(0, gray(a)); g.addColorStop(1, gray(b));
  return g;
};
const begin = (c, x, y, s = 1, ang = 0) => { c.save(); c.translate(x, y); if (ang) c.rotate(ang); if (s !== 1) c.scale(s, s); };
const ink = (c, w = 2) => { c.strokeStyle = INK; c.lineWidth = w; c.lineCap = 'round'; c.lineJoin = 'round'; };

/* ─────────────── 道具 ─────────────── */

/** 铁砧。x,y 是底边中点 */
export function anvil(c, x, y, s = 1) {
  begin(c, x, y, s);
  c.beginPath();
  c.moveTo(-21, 0); c.lineTo(21, 0); c.lineTo(21, -4); c.lineTo(11, -9); c.lineTo(12, -20);
  c.lineTo(27, -26); c.lineTo(27, -36); c.lineTo(-15, -36);
  c.quadraticCurveTo(-30, -36, -36, -32); c.quadraticCurveTo(-27, -25, -13, -24);
  c.lineTo(-11, -9); c.lineTo(-21, -4); c.closePath();
  c.fillStyle = lin(c, -20, -36, 20, 2, 215, 25);
  c.fill(); ink(c, 2 / s); c.stroke();
  c.strokeStyle = PAPER; c.lineWidth = 2 / s;
  c.beginPath(); c.moveTo(-13, -33.5); c.lineTo(23, -33.5); c.stroke();
  c.restore();
}

/** 炸弹。x,y 是球心；lit=引线在烧，danger=快炸了 */
export function bomb(c, x, y, s = 1, t = 0, lit = false, danger = 0) {
  const pulse = danger > 0 ? 1 + Math.abs(Math.sin(t * 22)) * 0.12 * danger : 1;
  begin(c, x, y, s * pulse);
  c.fillStyle = INK; c.fillRect(-4, -15, 8, 5);
  ink(c, 2 / s);
  c.beginPath(); c.moveTo(0, -15); c.quadraticCurveTo(2, -22, 9, -21); c.stroke();
  c.beginPath(); c.arc(0, 0, 12, 0, Math.PI * 2);
  c.fillStyle = rad(c, -4, -5, 1, 15, danger > 0.5 && Math.sin(t * 22) > 0 ? 255 : 170, 0);
  c.fill(); c.stroke();
  c.strokeStyle = PAPER; c.lineWidth = 2 / s;
  c.beginPath(); c.arc(-1, -1, 7.5, Math.PI * 1.05, Math.PI * 1.45); c.stroke();
  if (lit) {
    const r = 3.5 + Math.sin(t * 40) * 1.6;
    ink(c, 1.5 / s);
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * Math.PI * 2 + t * 9;
      c.beginPath(); c.moveTo(9 + Math.cos(a) * 1, -21 + Math.sin(a) * 1); c.lineTo(9 + Math.cos(a) * r, -21 + Math.sin(a) * r); c.stroke();
    }
  }
  c.restore();
}

/** 地雷。x,y 是地面中点 */
export function mine(c, x, y, s = 1, blink = false) {
  begin(c, x, y, s);
  c.beginPath(); c.ellipse(0, -1, 16, 8, 0, Math.PI, 0);
  c.fillStyle = lin(c, -10, -9, 12, 0, 190, 30);
  c.fill(); ink(c, 2 / s); c.stroke();
  c.fillStyle = INK; c.fillRect(-18, -2, 36, 3);
  c.beginPath(); c.arc(0, -9, 2.6, 0, Math.PI * 2);
  c.fillStyle = blink ? INK : PAPER; c.fill(); ink(c, 1.4 / s); c.stroke();
  c.restore();
}

/** 香蕉皮。x,y 是地面中点 */
export function peel(c, x, y, s = 1) {
  begin(c, x, y, s);
  ink(c, 2 / s);
  const flap = (pts) => {
    c.beginPath(); c.moveTo(pts[0], pts[1]);
    c.quadraticCurveTo(pts[2], pts[3], pts[4], pts[5]);
    c.quadraticCurveTo(pts[6], pts[7], pts[0] + 3, pts[1]);
    c.closePath(); c.fill(); c.stroke();
  };
  c.fillStyle = gray(230);
  flap([-3, -5, -12, -8, -17, 0, -10, -2]);
  flap([1, -5, 11, -9, 17, 0, 9, -2]);
  c.fillStyle = gray(120);
  flap([-2, -6, -5, -1, -7, 0, -3, -1]);
  flap([0, -6, 3, -1, 6, 0, 3, -1]);
  c.beginPath(); c.moveTo(-3, -5); c.quadraticCurveTo(-1, -12, 1, -14); c.lineTo(3, -13); c.quadraticCurveTo(2, -9, 2, -5); c.closePath();
  c.fillStyle = gray(200); c.fill(); c.stroke();
  c.restore();
}

/** 弹簧板。press 0–1 压缩量 */
export function spring(c, x, y, s = 1, press = 0) {
  const top = -(20 - press * 13);
  begin(c, x, y, s);
  c.fillStyle = lin(c, 0, -3, 0, 0, 120, 0); c.fillRect(-16, -3, 32, 3);
  ink(c, 2.4 / s);
  c.beginPath(); c.moveTo(-9, -3);
  const n = 4;
  for (let i = 1; i <= n; i++) {
    const yy = -3 + (top + 3 + 3) * (i / n);
    c.lineTo(i % 2 ? 9 : -9, yy);
  }
  c.stroke();
  c.beginPath(); c.rect(-17, top - 3, 34, 4);
  c.fillStyle = lin(c, 0, top - 3, 0, top + 1, 240, 100); c.fill(); ink(c, 1.6 / s); c.stroke();
  c.restore();
}

/** 钉板，局部坐标：x 沿板，y 朝外（负值）。rise 0–1 */
export function spikes(c, x, y, s = 1, ang = 0, rise = 1, L = 72) {
  begin(c, x, y, 1, ang);
  const len = L * s, h = 15 * s * rise, n = Math.max(3, Math.round(len / (11 * s)));
  const step = len / n;
  c.fillStyle = lin(c, 0, -3, 0, 3, 110, 0); c.fillRect(-len / 2 - 2, -3, len + 4, 4);
  ink(c, 1.5);
  c.beginPath(); c.moveTo(-len / 2 - 2, 1); c.lineTo(len / 2 + 2, 1); c.stroke();
  for (let i = 0; i < n; i++) {
    const a = -len / 2 + i * step, m = a + step / 2;
    c.beginPath(); c.moveTo(a, -3); c.lineTo(m, -3 - h); c.lineTo(m, -3); c.closePath(); c.fillStyle = gray(235); c.fill();
    c.beginPath(); c.moveTo(m, -3 - h); c.lineTo(a + step, -3); c.lineTo(m, -3); c.closePath(); c.fillStyle = gray(60); c.fill();
    c.beginPath(); c.moveTo(a, -3); c.lineTo(m, -3 - h); c.lineTo(a + step, -3); ink(c, 1.5); c.stroke();
  }
  c.restore();
}

/** 火箭。x,y 是中心，朝 ang 飞 */
export function rocket(c, x, y, s = 1, ang = 0, t = 0, fire = false) {
  begin(c, x, y, s, ang);
  if (fire) {
    const f = 12 + Math.sin(t * 50) * 4 + Math.sin(t * 31) * 2;
    c.beginPath(); c.moveTo(-16, -5); c.lineTo(-16 - f, 0); c.lineTo(-16, 5); c.closePath();
    c.fillStyle = PAPER; c.fill(); ink(c, 1.6 / s); c.stroke();
    c.beginPath(); c.moveTo(-16, -2.5); c.lineTo(-16 - f * 0.5, 0); c.lineTo(-16, 2.5); c.closePath();
    c.fillStyle = INK; c.fill();
  }
  c.beginPath(); c.moveTo(-15, -9); c.lineTo(-9, -5); c.lineTo(-9, 5); c.lineTo(-15, 9); c.closePath();
  c.fillStyle = gray(50); c.fill(); ink(c, 1.6 / s); c.stroke();
  c.beginPath(); c.moveTo(-15, -6); c.lineTo(8, -6); c.quadraticCurveTo(17, -3, 20, 0); c.quadraticCurveTo(17, 3, 8, 6); c.lineTo(-15, 6); c.closePath();
  c.fillStyle = lin(c, 0, -6, 0, 6, 245, 70); c.fill(); ink(c, 1.8 / s); c.stroke();
  c.beginPath(); c.moveTo(9, -5.5); c.quadraticCurveTo(17, -3, 20, 0); c.quadraticCurveTo(17, 3, 9, 5.5); c.closePath();
  c.fillStyle = INK; c.fill();
  c.beginPath(); c.arc(0, 0, 3, 0, Math.PI * 2); c.fillStyle = PAPER; c.fill(); ink(c, 1.4 / s); c.stroke();
  c.restore();
}

/** 黑洞 */
export function hole(c, x, y, r, t = 0) {
  c.beginPath(); c.arc(x, y, r * 2.5, 0, Math.PI * 2);
  c.fillStyle = (() => {
    const g = c.createRadialGradient(x, y, r * 0.7, x, y, r * 2.5);
    g.addColorStop(0, gray(50)); g.addColorStop(0.45, gray(170)); g.addColorStop(1, 'rgba(255,255,255,0)');
    return g;
  })();
  c.fill();
  // 吸积盘：一圈圈转进去的墨线
  ink(c, 1.6);
  for (let k = 0; k < 5; k++) {
    const a0 = t * (3.4 - k * 0.2) + k * 1.26;
    c.beginPath();
    for (let i = 0; i <= 14; i++) {
      const u = i / 14, a = a0 + u * 2.5, rr = r * (2.2 - u * 1.1);
      const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr * 0.92;
      if (i) c.lineTo(px, py); else c.moveTo(px, py);
    }
    c.stroke();
  }
  c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fillStyle = INK; c.fill();
  c.strokeStyle = PAPER; c.lineWidth = 1.5;
  c.beginPath(); c.arc(x, y, r * 0.78, t * 4, t * 4 + 1.4); c.stroke();
  c.beginPath(); c.arc(x, y, r * 0.5, -t * 5, -t * 5 + 1.1); c.stroke();
}

/** 压路机。x 是前滚筒中心的 x，y 是地面，dir 行进方向 */
export function roller(c, x, y, s = 1, dir = 1, t = 0) {
  begin(c, x, y, 1);
  c.scale(s * dir, s);
  // 车身
  c.beginPath(); c.moveTo(-14, -28); c.lineTo(-92, -28); c.lineTo(-92, -8); c.lineTo(-14, -8); c.closePath();
  c.fillStyle = lin(c, 0, -28, 0, -8, 225, 60); c.fill(); ink(c, 2 / s); c.stroke();
  // 驾驶室
  c.beginPath(); c.moveTo(-70, -28); c.lineTo(-70, -58); c.lineTo(-36, -58); c.lineTo(-30, -28);
  c.fillStyle = PAPER; c.fill(); ink(c, 2 / s); c.stroke();
  c.fillStyle = INK; c.fillRect(-74, -62, 48, 5);
  // 司机：也是个火柴人，开得很开心
  c.beginPath(); c.arc(-50, -46, 5, 0, Math.PI * 2); c.fillStyle = PAPER; c.fill(); ink(c, 1.6 / s); c.stroke();
  c.fillStyle = INK; c.fillRect(-48, -48, 1.4, 1.4); c.fillRect(-45.6, -48, 1.4, 1.4);
  ink(c, 1.2 / s); c.beginPath(); c.arc(-46.6, -45.4, 2, 0.2, 2.2); c.stroke();
  ink(c, 2 / s); c.beginPath(); c.moveTo(-50, -41); c.lineTo(-50, -29); c.moveTo(-50, -37); c.lineTo(-40, -34); c.stroke();
  // 烟囱
  c.fillStyle = INK; c.fillRect(-86, -44, 6, 16);
  // 前滚筒
  c.beginPath(); c.arc(0, -24, 24, 0, Math.PI * 2);
  c.fillStyle = (() => { const g = c.createLinearGradient(0, -48, 0, 0); g.addColorStop(0, gray(215)); g.addColorStop(0.5, gray(150)); g.addColorStop(1, gray(10)); return g; })();
  c.fill(); ink(c, 2.4 / s); c.stroke();
  ink(c, 1.6 / s);
  const a = t * 7 * 1;
  for (let i = 0; i < 4; i++) { const b = a + i * Math.PI / 2; c.beginPath(); c.moveTo(0, -24); c.lineTo(Math.cos(b) * 16, -24 + Math.sin(b) * 16); c.stroke(); }
  c.beginPath(); c.arc(0, -24, 4, 0, Math.PI * 2); c.fillStyle = INK; c.fill();
  // 后轮
  c.beginPath(); c.arc(-84, -14, 14, 0, Math.PI * 2);
  c.fillStyle = rad(c, -84, -14, 3, 14, 200, 0); c.fill(); ink(c, 2 / s); c.stroke();
  c.beginPath(); c.arc(-84, -14, 3, 0, Math.PI * 2); c.fillStyle = PAPER; c.fill();
  c.restore();
}

/** 回收站（垃圾桶）。x,y 是底边中点 */
export function bin(c, x, y, s = 1) {
  begin(c, x, y, s);
  // 桶口露出来的废纸团
  ink(c, 1.6 / s);
  c.fillStyle = PAPER;
  const paper = (pts) => { c.beginPath(); pts.forEach((q, i) => (i ? c.lineTo(q[0], q[1]) : c.moveTo(q[0], q[1]))); c.closePath(); c.fill(); c.stroke(); };
  paper([[-12, -44], [-14, -52], [-7, -57], [-3, -52], [1, -56], [3, -48], [1, -44]]);
  paper([[0, -44], [2, -53], [8, -58], [14, -53], [13, -44]]);
  c.beginPath(); c.moveTo(-9, -53); c.lineTo(-6, -49); c.moveTo(7, -54); c.lineTo(9, -49); c.stroke();
  // 桶身
  c.beginPath(); c.moveTo(-18, -44); c.lineTo(18, -44); c.lineTo(14, 0); c.lineTo(-14, 0); c.closePath();
  c.fillStyle = lin(c, -18, 0, 18, 0, 235, 60); c.fill(); ink(c, 2 / s); c.stroke();
  ink(c, 1.6 / s);
  for (const u of [-0.5, 0, 0.5]) { c.beginPath(); c.moveTo(u * 28, -39); c.lineTo(u * 21, -5); c.stroke(); }
  // 桶沿
  c.beginPath(); c.roundRect(-20, -47, 40, 5, 2);
  c.fillStyle = lin(c, -20, 0, 20, 0, 245, 70); c.fill(); ink(c, 1.8 / s); c.stroke();
  c.restore();
}

/* ─────────────── 拿在手里的工具 ─────────────── */

/** 大手。closed=握拳。x,y 是掌心 */
export function hand(c, x, y, s = 1, closed = false, ang = 0) {
  begin(c, x, y, s, ang);
  ink(c, 2 / s);
  c.fillStyle = PAPER;
  // 袖口
  c.beginPath(); c.rect(-8, 11, 16, 8); c.fillStyle = lin(c, -8, 0, 8, 0, 220, 70); c.fill(); c.stroke();
  c.fillStyle = PAPER;
  if (closed) {
    for (const fx of [-7, -2.4, 2.4, 7]) { c.beginPath(); c.arc(fx, -6, 3.6, 0, Math.PI * 2); c.fill(); c.stroke(); }
    c.beginPath(); c.roundRect(-10, -6, 20, 18, 5); c.fill(); c.stroke();
    c.beginPath(); c.moveTo(-10, 1); c.quadraticCurveTo(-1, -1, 2, 3); c.stroke();
  } else {
    const fingers = [[-8.5, -8, -13, -20], [-3, -10, -4.5, -26], [3, -10, 3.5, -27], [8.5, -8, 11, -22]];
    for (const [a, b, d, e] of fingers) {
      c.lineWidth = 7; c.strokeStyle = INK; c.beginPath(); c.moveTo(a, b); c.lineTo(d, e); c.stroke();
      c.lineWidth = 3.6 / 1; c.strokeStyle = PAPER; c.beginPath(); c.moveTo(a, b); c.lineTo(d, e); c.stroke();
    }
    ink(c, 2 / s);
    c.lineWidth = 7; c.beginPath(); c.moveTo(-10, 4); c.lineTo(-20, -5); c.stroke();
    c.lineWidth = 3.6; c.strokeStyle = PAPER; c.beginPath(); c.moveTo(-10, 4); c.lineTo(-20, -5); c.stroke();
    ink(c, 2 / s);
    c.beginPath(); c.roundRect(-11, -9, 22, 21, 6); c.fillStyle = PAPER; c.fill(); c.stroke();
    c.fillStyle = PAPER; c.fillRect(-9, -11, 18, 5);
  }
  c.restore();
}

/** 电锯。x,y 是握把，朝 ang，锯条长 44 */
export function saw(c, x, y, s = 1, ang = 0, t = 0, on = false) {
  begin(c, x, y, s, ang);
  // 锯条
  c.beginPath(); c.roundRect(4, -5, 42, 10, 5);
  c.fillStyle = lin(c, 0, -5, 0, 5, 240, 120); c.fill(); ink(c, 1.6 / s); c.stroke();
  // 锯齿在链条上跑
  c.fillStyle = INK;
  const off = on ? (t * 90) % 7 : 0;
  for (let i = 0; i < 7; i++) {
    const u = 5 + ((i * 7 + off) % 42);
    c.beginPath(); c.moveTo(u, -5); c.lineTo(u + 2.4, -9); c.lineTo(u + 4.4, -5); c.fill();
    const v = 46 - ((i * 7 + off) % 42);
    c.beginPath(); c.moveTo(v, 5); c.lineTo(v - 2.4, 9); c.lineTo(v - 4.4, 5); c.fill();
  }
  // 机身
  c.beginPath(); c.roundRect(-20, -10, 25, 20, 3);
  c.fillStyle = lin(c, 0, -10, 0, 10, 180, 15); c.fill(); ink(c, 1.8 / s); c.stroke();
  ink(c, 3 / s); c.beginPath(); c.moveTo(-18, -10); c.quadraticCurveTo(-8, -20, 3, -10); c.stroke();
  c.strokeStyle = PAPER; c.lineWidth = 1.4 / s;
  c.beginPath(); c.moveTo(-14, -4); c.lineTo(-2, -4); c.moveTo(-14, 0); c.lineTo(-2, 0); c.stroke();
  c.restore();
}

/** 橡皮。x,y 是擦的那一头 */
export function eraser(c, x, y, s = 1) {
  begin(c, x, y, s, -0.45);
  c.beginPath(); c.roundRect(-4, -9, 40, 18, 3);
  c.fillStyle = PAPER; c.fill(); ink(c, 2 / s); c.stroke();
  c.beginPath(); c.rect(12, -9, 24, 18);
  c.fillStyle = lin(c, 0, -9, 0, 9, 170, 30); c.fill(); ink(c, 2 / s); c.stroke();
  c.strokeStyle = PAPER; c.lineWidth = 1.4 / s;
  c.beginPath(); c.moveTo(16, -5); c.lineTo(32, -5); c.stroke();
  c.restore();
}

/** 铅笔。x,y 是笔尖 */
export function pencil(c, x, y, s = 1, ang = -0.85) {
  begin(c, x, y, s, ang);
  c.beginPath(); c.moveTo(0, 0); c.lineTo(11, -4.5); c.lineTo(11, 4.5); c.closePath();
  c.fillStyle = PAPER; c.fill(); ink(c, 1.6 / s); c.stroke();
  c.beginPath(); c.moveTo(0, 0); c.lineTo(4.5, -1.8); c.lineTo(4.5, 1.8); c.closePath(); c.fillStyle = INK; c.fill();
  c.beginPath(); c.rect(11, -4.5, 30, 9);
  c.fillStyle = lin(c, 0, -4.5, 0, 4.5, 235, 80); c.fill(); ink(c, 1.6 / s); c.stroke();
  c.fillStyle = INK; c.fillRect(41, -4.5, 3, 9);
  c.beginPath(); c.roundRect(44, -4.5, 7, 9, 2); c.fillStyle = PAPER; c.fill(); c.stroke();
  c.restore();
}

/** 一道闪电的小图标 */
export function boltIcon(c, x, y, s = 1) {
  begin(c, x, y, s);
  c.beginPath();
  c.moveTo(3, -16); c.lineTo(-8, 2); c.lineTo(-1, 2); c.lineTo(-4, 16); c.lineTo(9, -4); c.lineTo(2, -4); c.lineTo(7, -16); c.closePath();
  c.fillStyle = lin(c, 0, -16, 0, 16, 240, 90); c.fill(); ink(c, 2 / s); c.stroke();
  c.restore();
}

/** 雪花（冰冻的图标） */
export function snow(c, x, y, s = 1) {
  begin(c, x, y, s);
  ink(c, 2.2 / s);
  for (let i = 0; i < 3; i++) {
    c.save(); c.rotate(i * Math.PI / 3);
    c.beginPath(); c.moveTo(0, -15); c.lineTo(0, 15);
    c.moveTo(-4, -11); c.lineTo(0, -7); c.lineTo(4, -11);
    c.moveTo(-4, 11); c.lineTo(0, 7); c.lineTo(4, 11);
    c.stroke(); c.restore();
  }
  c.restore();
}

/* ─────────────── 火柴人的脑袋 ─────────────── */

export function head(c, x, y, r, ang, f = {}) {
  c.save(); c.translate(x, y); c.rotate(ang);
  if (f.squash) c.scale(1 + f.squash * 0.75, 1 - f.squash * 0.72);
  c.beginPath(); c.arc(0, 0, r + 2, 0, Math.PI * 2); c.fillStyle = PAPER; c.fill();
  c.beginPath(); c.arc(0, 0, r, 0, Math.PI * 2);
  c.fillStyle = PAPER; c.fill();
  // 一点点明暗，脑袋才是个球
  c.save(); c.clip();
  c.beginPath(); c.arc(r * 0.35, r * 0.4, r * 1.05, 0, Math.PI * 2);
  c.beginPath(); c.arc(-r * 0.32, -r * 0.34, r * 1.15, 0, Math.PI * 2, true); c.rect(-r - 2, -r - 2, 2 * r + 4, 2 * r + 4);
  c.fillStyle = gray(168); c.fill('evenodd');
  c.restore();
  c.beginPath(); c.arc(0, 0, r, 0, Math.PI * 2);
  ink(c, 3); c.stroke();
  const lx = (f.look || 0) * 3, ly = (f.lookY || 0) * 2.4;
  const m = f.mood || 'norm';
  c.fillStyle = INK;
  const dot = (ax, ay, w = 2.2, h = 3) => c.fillRect(ax - w / 2 + lx, ay - h / 2 + ly, w, h);
  const X = (ax, ay, sz = 2.4) => { ink(c, 1.5); c.beginPath(); c.moveTo(ax - sz + lx, ay - sz + ly); c.lineTo(ax + sz + lx, ay + sz + ly); c.moveTo(ax + sz + lx, ay - sz + ly); c.lineTo(ax - sz + lx, ay + sz + ly); c.stroke(); };
  ink(c, 1.4);
  if (m === 'dead') {
    X(-3.4, -1.6); X(3.4, -1.6);
    ink(c, 1.4); c.beginPath(); c.moveTo(-3 + lx, 4); c.lineTo(3 + lx, 4); c.stroke();
    c.beginPath(); c.arc(1.6 + lx, 5.4, 1.6, 0, Math.PI); c.fill();
  } else if (m === 'ouch') {
    c.beginPath(); c.moveTo(-5.4 + lx, -3.6); c.lineTo(-2 + lx, -1.6); c.lineTo(-5.4 + lx, 0.2);
    c.moveTo(5.4 + lx, -3.6); c.lineTo(2 + lx, -1.6); c.lineTo(5.4 + lx, 0.2); c.stroke();
    c.beginPath(); c.ellipse(lx, 4.6, 2.8, 2.4, 0, 0, Math.PI * 2); c.fill();
  } else if (m === 'scared') {
    for (const ax of [-3.4, 3.4]) {
      c.beginPath(); c.arc(ax + lx * 0.5, -1.8 + ly * 0.5, 2.8, 0, Math.PI * 2); c.fillStyle = PAPER; c.fill(); ink(c, 1.2); c.stroke();
      c.fillStyle = INK; c.fillRect(ax + lx * 0.8 - 0.7, -2.4 + ly, 1.4, 1.4);
    }
    ink(c, 1.3); c.beginPath(); c.moveTo(-3.6 + lx * 0.5, 5); c.lineTo(-1.8 + lx * 0.5, 3.8); c.lineTo(0 + lx * 0.5, 5); c.lineTo(1.8 + lx * 0.5, 3.8); c.lineTo(3.6 + lx * 0.5, 5); c.stroke();
  } else if (m === 'dizzy') {
    for (const ax of [-3.4, 3.4]) {
      c.beginPath();
      for (let i = 0; i <= 10; i++) { const a = i * 0.9 + (f.t || 0) * 8, rr = i * 0.28; const px = ax + Math.cos(a) * rr, py = -1.8 + Math.sin(a) * rr; if (i) c.lineTo(px, py); else c.moveTo(px, py); }
      ink(c, 0.9); c.stroke();
    }
    ink(c, 1.3); c.beginPath(); c.arc(0, 6, 2.6, Math.PI * 1.15, Math.PI * 1.85); c.stroke();
  } else if (m === 'angry') {
    c.beginPath(); c.moveTo(-6 + lx, -5); c.lineTo(-1.6 + lx, -3); c.moveTo(6 + lx, -5); c.lineTo(1.6 + lx, -3); c.stroke();
    dot(-3.2, -1, 2, 2.2); dot(3.2, -1, 2, 2.2);
    c.beginPath(); c.arc(lx, 6.4, 3, Math.PI * 1.15, Math.PI * 1.85); c.stroke();
  } else if (m === 'sad') {
    c.beginPath(); c.moveTo(-5.6 + lx, -3); c.lineTo(-1.8 + lx, -4.6); c.moveTo(5.6 + lx, -3); c.lineTo(1.8 + lx, -4.6); c.stroke();
    dot(-3.2, -1, 2, 2.4); dot(3.2, -1, 2, 2.4);
    c.beginPath(); c.arc(lx, 6.2, 2.8, Math.PI * 1.15, Math.PI * 1.85); c.stroke();
    if (f.tear) { c.fillRect(-3.8 + lx, 1 + ((f.t || 0) * 6 % 4), 1.2, 2); }
  } else if (m === 'happy') {
    dot(-3.2, -1.6); dot(3.2, -1.6);
    c.beginPath(); c.arc(lx, 1.8, 3, 0.25, Math.PI - 0.25); c.stroke();
  } else if (m === 'bored') {
    c.beginPath(); c.moveTo(-5 + lx, -2); c.lineTo(-1.6 + lx, -2); c.moveTo(1.6 + lx, -2); c.lineTo(5 + lx, -2); c.stroke();
    c.fillRect(-3.6 + lx, -2, 1.6, 1.6); c.fillRect(2.4 + lx, -2, 1.6, 1.6);
    c.beginPath(); c.moveTo(-2.2 + lx, 4.4); c.lineTo(2.2 + lx, 4.4); c.stroke();
  } else {
    dot(-3.2, -1.6); dot(3.2, -1.6);
    c.beginPath(); c.moveTo(-2 + lx, 4.2); c.lineTo(2 + lx, 4.2); c.stroke();
  }
  c.restore();

  // 脑袋顶上的东西不跟着压扁
  c.save(); c.translate(x, y); c.rotate(ang);
  if (f.hair) {
    ink(c, 1.6);
    for (let i = -3; i <= 3; i++) {
      const a = i * 0.32 - Math.PI / 2;
      c.beginPath(); c.moveTo(Math.cos(a) * r, Math.sin(a) * r); c.lineTo(Math.cos(a) * (r + 7 + (i % 2) * 2), Math.sin(a) * (r + 7 + (i % 2) * 2)); c.stroke();
    }
  }
  if (f.lump) {
    const a = -1.0;
    c.beginPath(); c.arc(Math.cos(a) * (r + 0.5), Math.sin(a) * (r + 0.5), 1.8 + Math.min(2.2, f.lump * 0.5), 0, Math.PI * 2);
    c.fillStyle = PAPER; c.fill(); ink(c, 2); c.stroke();
  }
  c.restore();
  if (f.dizzy) {
    for (let i = 0; i < 3; i++) {
      const a = (f.t || 0) * 5 + i * 2.09;
      star(c, x + Math.cos(a) * (r + 7), y - r - 3 + Math.sin(a) * 3, 2.6);
    }
  }
}

export function star(c, x, y, r) {
  c.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r;
    const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
    if (i) c.lineTo(px, py); else c.moveTo(px, py);
  }
  c.closePath(); c.fillStyle = PAPER; c.fill(); ink(c, 1.2); c.stroke();
}

/** 爆炸的星形火球 */
export function burst(c, x, y, r, t) {
  const n = 11;
  c.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const a = i * Math.PI / n + 0.2, rr = i % 2 ? r * 0.58 : r * (0.9 + 0.12 * Math.sin(i * 7.3));
    const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
    if (i) c.lineTo(px, py); else c.moveTo(px, py);
  }
  c.closePath();
  c.fillStyle = (() => { const g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, gray(255)); g.addColorStop(0.5, gray(235)); g.addColorStop(1, gray(70)); return g; })();
  c.fill(); ink(c, 2.5); c.stroke();
}

/* ─────────────── 工具栏图标（36×36） ─────────────── */

const ICONS = {
  hand: (c) => hand(c, 18, 20, 0.86),
  anvil: (c) => anvil(c, 18.5, 28, 0.82),
  bomb: (c) => bomb(c, 16, 22, 1, 0.3, true),
  mine: (c) => mine(c, 18, 26, 0.95, true),
  peel: (c) => peel(c, 18, 28, 1.25),
  spring: (c) => spring(c, 18, 31, 1, 0),
  spikes: (c) => spikes(c, 18, 28, 0.8, 0, 1.4, 38),
  bolt: (c) => boltIcon(c, 18, 18, 1),
  saw: (c) => saw(c, 10, 21, 0.56, -0.5, 0, false),
  roller: (c) => roller(c, 28, 31, 0.3, 1, 0.6),
  rocket: (c) => rocket(c, 17, 19, 0.82, -0.78, 0.4, true),
  freeze: (c) => snow(c, 18, 18, 1),
  hole: (c) => hole(c, 18, 18, 7.2, 0.6),
  eraser: (c) => eraser(c, 8, 23, 0.78),
  pencil: (c) => pencil(c, 7, 29, 0.62),
  bin: (c) => bin(c, 18, 33, 0.53),
};

/** 把一个图标画成二值化的小画布 */
export function makeIcon(id, size = 36) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const c = cv.getContext('2d', { willReadFrequently: true });
  c.fillStyle = PAPER; c.fillRect(0, 0, size, size);
  ICONS[id](c);
  quantize(c, size, size);
  return cv;
}

/** 放道具之前手指下面那个预览 */
export function ghost(c, id, x, y, s, t, ground) {
  switch (id) {
    case 'anvil': anvil(c, x, y, s); break;
    case 'bomb': bomb(c, x, y, s, t, false); break;
    case 'mine': mine(c, x, ground, s, true); break;
    case 'peel': peel(c, x, ground, s); break;
    case 'spring': spring(c, x, ground, s, 0); break;
    case 'bolt': boltIcon(c, x, y, s); break;
    case 'rocket': rocket(c, x, y, s, -Math.PI / 2, t, false); break;
    case 'freeze': snow(c, x, y, s); break;
    case 'hole': hole(c, x, y, 18 * s, t); break;
    case 'bin': bin(c, x, y, s); break;
    case 'spikes': spikes(c, x, ground + 1, s, 0, 1); break;
    case 'roller': roller(c, x, ground + 1, s, 1, t); break;
    default: break;
  }
}
