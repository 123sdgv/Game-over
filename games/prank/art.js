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

/** 钉子：圆形钉帽，上面一个 ＋ 和一个 × */
export function nail(c, x, y, s = 1) {
  const r = 5.5 * s;
  c.beginPath(); c.arc(x, y, r + 1.4, 0, Math.PI * 2); c.fillStyle = PAPER; c.fill();
  c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2);
  c.fillStyle = rad(c, x - r * 0.35, y - r * 0.35, 0.5, r * 1.4, 250, 130); c.fill();
  ink(c, 1.5 * Math.max(1, s * 0.7)); c.stroke();
  ink(c, 1 * Math.max(1, s * 0.7));
  const a = r * 0.62, b = r * 0.46;
  c.beginPath();
  c.moveTo(x - a, y); c.lineTo(x + a, y); c.moveTo(x, y - a); c.lineTo(x, y + a);
  c.moveTo(x - b, y - b); c.lineTo(x + b, y + b); c.moveTo(x + b, y - b); c.lineTo(x - b, y + b);
  c.stroke();
}

/** 气球。x,y 是球心 */
export function balloon(c, x, y, s = 1) {
  const rx = 11 * s, ry = 13 * s;
  c.beginPath(); c.moveTo(x - 2.4, y + ry + 3); c.lineTo(x, y + ry - 1); c.lineTo(x + 2.4, y + ry + 3); c.closePath();
  c.fillStyle = INK; c.fill();
  c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  c.fillStyle = rad(c, x - rx * 0.35, y - ry * 0.4, 1, ry * 1.5, 255, 95); c.fill();
  ink(c, 1.7); c.stroke();
  c.strokeStyle = PAPER; c.lineWidth = 1.6;
  c.beginPath(); c.ellipse(x - rx * 0.32, y - ry * 0.34, rx * 0.26, ry * 0.3, -0.5, Math.PI * 0.9, Math.PI * 1.75); c.stroke();
}

/** 水位小点：像绘图软件钢笔工具的锚点，两边带一截切线手柄 */
export function anchor(c, x, y) {
  const hw = 16;
  // 虚线提示可以上下拖
  c.strokeStyle = INK; c.lineWidth = 1; c.setLineDash([2, 3]);
  c.beginPath(); c.moveTo(x, y - 16); c.lineTo(x, y + 16); c.stroke();
  c.setLineDash([]);
  c.beginPath(); c.moveTo(x - hw, y); c.lineTo(x + hw, y); c.stroke();
  for (const dx of [-hw, hw]) { c.beginPath(); c.arc(x + dx, y, 1.9, 0, Math.PI * 2); c.fillStyle = PAPER; c.fill(); ink(c, 1); c.stroke(); }
  c.fillStyle = INK;
  c.beginPath(); c.moveTo(x, y - 20); c.lineTo(x - 3, y - 15); c.lineTo(x + 3, y - 15); c.closePath(); c.fill();
  c.beginPath(); c.moveTo(x, y + 20); c.lineTo(x - 3, y + 15); c.lineTo(x + 3, y + 15); c.closePath(); c.fill();
  c.beginPath(); c.rect(x - 4, y - 4, 8, 8); c.fillStyle = PAPER; c.fill(); ink(c, 1.8); c.stroke();
}

/* ─────────────── 食物：鸡腿、汉堡、蛋糕 ─────────────── */
// 局部坐标以食物中心为原点，宽 20 左右。bites 0–3：咬了几口，咬痕是从一头一口口啃进去的
export const FOOD_KINDS = ['leg', 'burger', 'cake'];
export const FOOD_BOTTOM = { leg: 6.6, burger: 6.5, cake: 6.5 };   // 中心到底边的距离（放在地上时用）
const BITES = {
  leg: [[-11.5, -1.5, 4.6], [-8.6, 3.4, 4.4], [-5.4, -2.8, 4.8]],
  burger: [[10, -2.6, 4.2], [9.6, 3, 4.2], [5.8, 0.2, 4.6]],
  cake: [[10, 3.4, 4.4], [6.6, -0.4, 4.4], [4, 4.6, 4.4]],
};
/** 这块食物的外轮廓（用来给咬痕描边） */
function foodShape(c, kind) {
  c.beginPath();
  if (kind === 'leg') {
    c.moveTo(4.6, -2.6); c.bezierCurveTo(0.6, -8, -10.4, -8.4, -11.6, -1.4); c.bezierCurveTo(-12, 5.4, -3, 7.6, 4.6, 2.6); c.closePath();
  } else if (kind === 'burger') {
    c.moveTo(-9.6, -0.6); c.bezierCurveTo(-9.6, -8.4, 9.6, -8.4, 9.6, -0.6); c.lineTo(9.6, 3.6); c.lineTo(8.6, 6.5); c.lineTo(-8.6, 6.5); c.lineTo(-9.6, 3.6); c.closePath();
  } else {
    c.moveTo(-9.6, -5.6); c.lineTo(-9.6, 6.5); c.lineTo(10.4, 6.5); c.lineTo(10.4, 3); c.closePath();
  }
}
function foodBody(c, kind) {
  if (kind === 'leg') {
    // 骨头
    c.beginPath(); c.rect(3, -1.5, 9.6, 3); c.fillStyle = PAPER; c.fill(); ink(c, 1.3); c.stroke();
    for (const yy of [-1.9, 1.9]) { c.beginPath(); c.arc(13.4, yy, 2.4, 0, Math.PI * 2); c.fillStyle = PAPER; c.fill(); ink(c, 1.3); c.stroke(); }
    c.fillStyle = PAPER; c.fillRect(11.6, -1.2, 2.2, 2.4);
    // 肉：烤得焦黄，上亮下暗
    foodShape(c, 'leg');
    c.fillStyle = rad(c, -6, -4.6, 0.5, 13, 238, 40); c.fill(); ink(c, 1.6); c.stroke();
    ink(c, 0.9);
    c.beginPath(); c.moveTo(-7.4, 0.8); c.quadraticCurveTo(-5, 2.4, -2.4, 1.4); c.moveTo(-3.4, -3.6); c.quadraticCurveTo(-1.4, -2.6, 0.4, -3.4); c.stroke();
    c.strokeStyle = PAPER; c.lineWidth = 1.3;
    c.beginPath(); c.arc(-5.6, -1.6, 4, Math.PI * 1.1, Math.PI * 1.6); c.stroke();
  } else if (kind === 'burger') {
    // 下层面包
    c.beginPath(); c.moveTo(-9.2, 3.4); c.lineTo(9.2, 3.4); c.lineTo(8.4, 6.5); c.lineTo(-8.4, 6.5); c.closePath();
    c.fillStyle = lin(c, 0, 3, 0, 6.5, 210, 120); c.fill(); ink(c, 1.3); c.stroke();
    // 肉饼
    c.beginPath(); c.roundRect(-9.8, 0.6, 19.6, 3.2, 1.4); c.fillStyle = gray(38); c.fill(); ink(c, 1.3); c.stroke();
    // 芝士往下滴
    c.beginPath(); c.moveTo(-9, 0.2); c.lineTo(9, 0.2); c.lineTo(7.4, 1.4); c.lineTo(5.6, 3.2); c.lineTo(4, 1.4); c.lineTo(-2, 1.4); c.lineTo(-3.6, 3.4); c.lineTo(-5.2, 1.4); c.lineTo(-9, 1.2); c.closePath();
    c.fillStyle = gray(235); c.fill(); ink(c, 1); c.stroke();
    // 生菜
    ink(c, 1.6); c.beginPath(); c.moveTo(-10, -0.4);
    for (let i = 1; i <= 8; i++) c.quadraticCurveTo(-10 + i * 2.5 - 1.25, i % 2 ? -2.2 : 1, -10 + i * 2.5, -0.4);
    c.stroke();
    // 上层面包，芝麻
    c.beginPath(); c.moveTo(-9.4, -0.8); c.bezierCurveTo(-9.4, -8.4, 9.4, -8.4, 9.4, -0.8); c.closePath();
    c.fillStyle = rad(c, -3.4, -5.6, 0.5, 12, 252, 150); c.fill(); ink(c, 1.5); c.stroke();
    c.fillStyle = INK;
    for (const [sx, sy] of [[-4.6, -4.4], [-0.6, -5.8], [3.4, -4.8], [5.8, -2.8], [-6.8, -2.2], [1.4, -3]]) c.fillRect(sx - 0.5, sy - 0.4, 1.1, 0.8);
  } else {
    // 一角蛋糕（侧面）：两层蛋糕夹奶油，顶上厚奶油往下淌，一颗樱桃
    c.save(); foodShape(c, 'cake'); c.clip();
    c.fillStyle = lin(c, 0, -6, 0, 6.5, 230, 150); c.fillRect(-11, -8, 23, 15);
    c.fillStyle = PAPER; c.fillRect(-11, 1, 23, 1.8);
    c.restore();
    foodShape(c, 'cake'); ink(c, 1.5); c.stroke();
    c.beginPath(); c.moveTo(-10.4, -6.4); c.lineTo(11, 2.6); c.lineTo(10.6, 4.4);
    c.quadraticCurveTo(8.6, 3, 7, 3.6); c.quadraticCurveTo(5.4, 6, 4, 2.6); c.quadraticCurveTo(-1, -0.4, -3.4, -0.6);
    c.quadraticCurveTo(-5, 2.4, -6.6, -1.4); c.lineTo(-10.4, -3); c.closePath();
    c.fillStyle = PAPER; c.fill(); ink(c, 1.2); c.stroke();
    // 樱桃
    ink(c, 1); c.beginPath(); c.moveTo(-5.6, -8.4); c.quadraticCurveTo(-4.4, -12, -1.6, -12.6); c.stroke();
    c.beginPath(); c.arc(-6, -6.6, 2.8, 0, Math.PI * 2); c.fillStyle = rad(c, -7, -7.6, 0.3, 3.2, 200, 25); c.fill(); ink(c, 1.1); c.stroke();
    c.fillStyle = PAPER; c.fillRect(-7.4, -8, 1.1, 1.1);
  }
}
/** 食物。cx,cy 是中心 */
export function food(c, kind, cx, cy, s = 1, ang = 0, bites = 0, dir = 1) {
  begin(c, cx, cy, s, ang);
  if (dir < 0) c.scale(-1, 1);
  const B = BITES[kind] || BITES.leg, n = Math.min(3, bites | 0);
  if (!n) { foodBody(c, kind); c.restore(); return; }
  // 咬掉的地方挖空，再沿着咬痕补一圈描边
  c.save();
  c.beginPath(); c.rect(-20, -20, 40, 40);
  for (let i = 0; i < n; i++) { const [bx, by, br] = B[i]; c.moveTo(bx + br, by); c.arc(bx, by, br, 0, Math.PI * 2); }
  c.clip('evenodd');
  foodBody(c, kind);
  c.restore();
  for (let i = 0; i < n; i++) {
    // 每一口的边只描还剩下的那一段（别的咬痕里已经空了）
    c.save(); foodShape(c, kind); c.clip();
    c.beginPath(); c.rect(-20, -20, 40, 40);
    for (let k = 0; k < n; k++) if (k !== i) { const [bx, by, br] = B[k]; c.moveTo(bx + br - 0.6, by); c.arc(bx, by, br - 0.6, 0, Math.PI * 2); }
    c.clip('evenodd');
    const [bx, by, br] = B[i];
    ink(c, 1.4); c.beginPath(); c.arc(bx, by, br, 0, Math.PI * 2); c.stroke();
    c.restore();
  }
  c.restore();
}
/** 啃剩的骨头 */
export function bone(c, x, y, s = 1, ang = 0) {
  begin(c, x, y, s, ang);
  c.beginPath(); c.rect(-5, -1.3, 10, 2.6); c.fillStyle = PAPER; c.fill(); ink(c, 1.2); c.stroke();
  for (const bx of [-5.6, 5.6]) for (const yy of [-1.7, 1.7]) { c.beginPath(); c.arc(bx, yy, 2.1, 0, Math.PI * 2); c.fillStyle = PAPER; c.fill(); ink(c, 1.2); c.stroke(); }
  c.fillStyle = PAPER; c.fillRect(-6, -1, 12, 2);
  c.restore();
}

/** 菜刀。x,y 是握把的位置，ang 是刀尖的方向 */
export const KNIFE_TIP = 24;
export function knife(c, x, y, ang = 0, s = 1) {
  begin(c, x, y, s, ang);
  // 刀把
  c.beginPath(); c.roundRect(-6.4, -1.8, 9, 3.6, 1.4); c.fillStyle = lin(c, 0, -1.8, 0, 1.8, 120, 15); c.fill(); ink(c, 1.1); c.stroke();
  c.fillStyle = PAPER; c.fillRect(-4.4, -0.5, 1, 1); c.fillRect(-1.2, -0.5, 1, 1);
  c.fillStyle = INK; c.fillRect(2.4, -2.8, 1.6, 5.6);
  // 刀身：刀背直，刀刃往刀尖收
  c.beginPath(); c.moveTo(4, -2.4); c.lineTo(19, -2.4); c.lineTo(22.4, -1.8); c.quadraticCurveTo(17, 3.2, 4, 3.2); c.closePath();
  c.fillStyle = lin(c, 0, -2.4, 0, 3.2, 248, 135); c.fill(); ink(c, 1.1); c.stroke();
  c.strokeStyle = PAPER; c.lineWidth = 0.9;
  c.beginPath(); c.moveTo(6, -1); c.lineTo(17.6, -1); c.stroke();
  c.restore();
}

/* ─────────────── 拿在手里的工具 ─────────────── */

/** 鼠标箭头。x,y 是箭头尖 */
export function cursor(c, x, y, s = 1, pressed = false) {
  begin(c, x, y, s);
  c.beginPath();
  c.moveTo(0, 0); c.lineTo(0, 19); c.lineTo(4.6, 14.6); c.lineTo(8, 22); c.lineTo(11.4, 20.6); c.lineTo(8, 13.4); c.lineTo(14, 13.4); c.closePath();
  c.fillStyle = pressed ? gray(120) : PAPER; c.fill();
  ink(c, 1.7 / s); c.lineJoin = 'miter'; c.stroke();
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
  // 中毒：脸色发青（黑白里就是整张脸一层网点）
  if (f.sick) { c.fillStyle = gray(244 - f.sick * 24); c.fillRect(-r - 2, -r - 2, 2 * r + 4, 2 * r + 4); }
  c.beginPath(); c.arc(r * 0.35, r * 0.4, r * 1.05, 0, Math.PI * 2);
  c.beginPath(); c.arc(-r * 0.32, -r * 0.34, r * 1.15, 0, Math.PI * 2, true); c.rect(-r - 2, -r - 2, 2 * r + 4, 2 * r + 4);
  c.fillStyle = gray(f.sick ? 150 : 168); c.fill('evenodd');
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
  } else if (m === 'grit') {
    // 疼得龇牙咧嘴
    c.beginPath(); c.moveTo(-6 + lx, -4.6); c.lineTo(-1.6 + lx, -2.6); c.moveTo(6 + lx, -4.6); c.lineTo(1.6 + lx, -2.6); c.stroke();
    c.beginPath(); c.moveTo(-5 + lx, -1); c.lineTo(-1.8 + lx, -1); c.moveTo(1.8 + lx, -1); c.lineTo(5 + lx, -1); c.stroke();
    c.beginPath(); c.rect(-4 + lx, 2.8, 8, 3.4); c.fillStyle = PAPER; c.fill(); ink(c, 1.2); c.stroke();
    c.beginPath(); c.moveTo(-1.4 + lx, 2.8); c.lineTo(-1.4 + lx, 6.2); c.moveTo(1.4 + lx, 2.8); c.lineTo(1.4 + lx, 6.2); c.stroke();
  } else if (m === 'wow') {
    // 吓一跳：眉毛上挑，圆嘴
    c.beginPath(); c.arc(-3.4 + lx, -5, 2.2, Math.PI * 1.15, Math.PI * 1.85); c.moveTo(1.6 + lx, -5.6); c.arc(3.4 + lx, -5, 2.2, Math.PI * 1.15, Math.PI * 1.85); c.stroke();
    dot(-3.2, -1.4, 2.2, 2.6); dot(3.2, -1.4, 2.2, 2.6);
    c.beginPath(); c.ellipse(lx, 4.6, 2, 2.6, 0, 0, Math.PI * 2); c.stroke();
  } else if (m === 'pout') {
    // 委屈：八字眉，眼泪汪汪，嘴抖
    c.beginPath(); c.moveTo(-5.6 + lx, -3); c.lineTo(-1.8 + lx, -5); c.moveTo(5.6 + lx, -3); c.lineTo(1.8 + lx, -5); c.stroke();
    for (const ax of [-3.2, 3.2]) { c.beginPath(); c.arc(ax + lx, -1, 2.2, 0, Math.PI * 2); c.fillStyle = INK; c.fill(); c.fillStyle = PAPER; c.fillRect(ax + lx - 1.3, -2.2, 1.2, 1.2); }
    ink(c, 1.2); c.beginPath(); c.moveTo(-3 + lx, 5); c.lineTo(-1 + lx, 4); c.lineTo(1 + lx, 5); c.lineTo(3 + lx, 4); c.stroke();
    c.fillStyle = INK;
    if (f.tear) c.fillRect(3.4 + lx, 1.6 + ((f.t || 0) * 6 % 4), 1.2, 2);
  } else if (m === 'smug') {
    // 得意：一边眉毛挑起来，歪嘴笑
    c.beginPath(); c.moveTo(-5.6 + lx, -3.2); c.lineTo(-1.8 + lx, -3.2); c.moveTo(1.8 + lx, -3.2); c.lineTo(5.6 + lx, -5.4); c.stroke();
    dot(-3.2, -1.2, 2, 1.8); dot(3.4, -1.4, 2, 2.4);
    c.beginPath(); c.moveTo(-2.6 + lx, 4.6); c.quadraticCurveTo(1 + lx, 5.4, 3.6 + lx, 2.8); c.stroke();
  } else if (m === 'yawn') {
    // 打哈欠：眼睛眯成线，大张嘴
    c.beginPath(); c.moveTo(-5 + lx, -2); c.lineTo(-1.6 + lx, -2.6); c.moveTo(1.6 + lx, -2.6); c.lineTo(5 + lx, -2); c.stroke();
    c.beginPath(); c.ellipse(lx, 3.8, 3.2, 3.4, 0, 0, Math.PI * 2); c.fillStyle = INK; c.fill();
  } else if (m === 'joy') {
    // 开心：眼睛笑成弯，大笑
    c.beginPath(); c.arc(-3.3 + lx, -1, 2.2, Math.PI * 1.1, Math.PI * 1.9); c.moveTo(1.2 + lx, -1.6); c.arc(3.3 + lx, -1, 2.2, Math.PI * 1.1, Math.PI * 1.9); c.stroke();
    c.beginPath(); c.arc(lx, 1.8, 3.4, 0.1, Math.PI - 0.1); c.closePath(); c.fillStyle = INK; c.fill();
  } else if (m === 'mad') {
    // 发狂：眉毛竖成八字，眼睛只剩两个小点，咧着嘴露牙笑
    ink(c, 1.7);
    c.beginPath(); c.moveTo(-6 + lx, -5.6); c.lineTo(-1.4 + lx, -2.6); c.moveTo(6 + lx, -5.6); c.lineTo(1.4 + lx, -2.6); c.stroke();
    dot(-3.3, -0.6, 1.6, 1.6); dot(3.3, -0.6, 1.6, 1.6);
    c.beginPath(); c.moveTo(-4.6 + lx, 2.2); c.lineTo(4.6 + lx, 2.2); c.quadraticCurveTo(lx, 9.4, -4.6 + lx, 2.2); c.closePath();
    c.fillStyle = PAPER; c.fill(); ink(c, 1.2); c.stroke();
    ink(c, 0.9); c.beginPath(); c.moveTo(-3.4 + lx, 3.8); c.lineTo(3.4 + lx, 3.8); c.moveTo(lx, 2.2); c.lineTo(lx, 5.6); c.stroke();
  } else if (m === 'sick') {
    // 中毒：眼睛无神往下耷拉，嘴歪歪扭扭
    ink(c, 1.3);
    c.beginPath(); c.moveTo(-5.4 + lx, -3.4); c.lineTo(-1.8 + lx, -2.2); c.moveTo(5.4 + lx, -3.4); c.lineTo(1.8 + lx, -2.2); c.stroke();
    dot(-3.4, -0.4, 2, 1.6); dot(3.4, -0.4, 2, 1.6);
    c.beginPath(); c.moveTo(-3.8 + lx, 5); c.quadraticCurveTo(-2 + lx, 3.4, -0.4 + lx, 5); c.quadraticCurveTo(1.4 + lx, 6.6, 3.4 + lx, 4.4); c.stroke();
  } else if (m === 'heave') {
    // 要吐了：眼睛紧闭，腮帮子鼓起来
    ink(c, 1.4);
    c.beginPath(); c.moveTo(-5.4 + lx, -3); c.lineTo(-2 + lx, -1.4); c.lineTo(-5.4 + lx, 0.2); c.moveTo(5.4 + lx, -3); c.lineTo(2 + lx, -1.4); c.lineTo(5.4 + lx, 0.2); c.stroke();
    c.beginPath(); c.ellipse(lx, 4.4, 4.4, 2.6, 0, 0, Math.PI * 2); c.fillStyle = PAPER; c.fill(); ink(c, 1.3); c.stroke();
    c.beginPath(); c.moveTo(-1.6 + lx, 4.4); c.lineTo(1.6 + lx, 4.4); c.stroke();
  } else if (m === 'crave') {
    // 馋：眼睛发亮，张着嘴流口水
    for (const ax of [-3.3, 3.3]) { c.beginPath(); c.arc(ax + lx, -1.4 + ly, 2.3, 0, Math.PI * 2); c.fillStyle = INK; c.fill(); c.fillStyle = PAPER; c.fillRect(ax + lx - 1.4, -2.8 + ly, 1.3, 1.3); }
    c.beginPath(); c.arc(lx, 2.6, 3, 0.15, Math.PI - 0.15); c.closePath(); c.fillStyle = INK; c.fill();
    const dy = ((f.t || 0) * 2.2) % 1;
    c.beginPath(); c.moveTo(2.4 + lx, 3.4); c.lineTo(2.4 + lx, 5 + dy * 2.4); c.arc(2.4 + lx, 5.6 + dy * 2.4, 1.1, -Math.PI / 2, Math.PI * 1.5);
    c.fillStyle = PAPER; c.fill(); ink(c, 0.9); c.stroke();
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
  if (f.mad) {
    // 头顶冒青筋
    const ax = r * 0.95, ay = -r * 0.95, k = 1 + Math.sin((f.t || 0) * 14) * 0.12;
    c.beginPath(); c.arc(ax, ay, 4.4 * k, 0, Math.PI * 2); c.fillStyle = PAPER; c.fill();
    ink(c, 1.3);
    c.beginPath();
    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      c.moveTo(ax + sx * 1.1 * k, ay + sy * 3.4 * k); c.quadraticCurveTo(ax + sx * 1.1 * k, ay + sy * 1.1 * k, ax + sx * 3.4 * k, ay + sy * 1.1 * k);
    }
    c.stroke();
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

/* ─────────────── 工具栏图标（36×36） ─────────────── */

const ICONS = {
  mouse: (c) => cursor(c, 10, 6, 1.1),
  anvil: (c) => anvil(c, 18.5, 28, 0.82),
  peel: (c) => peel(c, 18, 28, 1.25),
  spring: (c) => spring(c, 18, 31, 1, 0),
  spikes: (c) => spikes(c, 18, 28, 0.8, 0, 1.4, 38),
  bolt: (c) => boltIcon(c, 18, 18, 1),
  roller: (c) => roller(c, 28, 31, 0.3, 1, 0.6),
  freeze: (c) => snow(c, 18, 18, 1),
  hole: (c) => hole(c, 18, 18, 7.2, 0.6),
  eraser: (c) => eraser(c, 8, 23, 0.78),
  pencil: (c) => pencil(c, 7, 29, 0.62),
  nail: (c) => nail(c, 18, 18, 2.3),
  rope: (c) => {
    // 一圈绳子
    for (const [y, w] of [[25, 12], [19, 11], [13, 9]]) {
      c.beginPath(); c.ellipse(18, y, w, 5, 0, 0, Math.PI * 2);
      ink(c, 2.8); c.stroke();
      c.strokeStyle = PAPER; c.lineWidth = 0.9; c.setLineDash([2, 3]); c.stroke(); c.setLineDash([]);
    }
    ink(c, 2.8); c.beginPath(); c.moveTo(27, 12); c.quadraticCurveTo(33, 8, 31, 3); c.stroke();
  },
  balloon: (c) => {
    balloon(c, 18, 13, 0.82);
    ink(c, 1.2); c.beginPath(); c.moveTo(18, 26); c.quadraticCurveTo(15, 29, 19, 34); c.stroke();
  },
  food: (c) => food(c, 'leg', 17, 19, 1.32, -0.62),
  knife: (c) => knife(c, 7.4, 29, -0.86, 1.32),
  water: (c) => {
    // 一滴水和两条波浪
    c.beginPath(); c.moveTo(18, 3); c.bezierCurveTo(24, 11, 27, 15, 27, 19); c.arc(18, 19, 9, 0, Math.PI); c.bezierCurveTo(9, 15, 12, 11, 18, 3); c.closePath();
    c.fillStyle = rad(c, 15, 16, 1, 13, 245, 90); c.fill(); ink(c, 2); c.stroke();
    ink(c, 1.8);
    c.beginPath(); c.moveTo(4, 31); c.quadraticCurveTo(8, 28, 12, 31); c.quadraticCurveTo(16, 34, 20, 31); c.quadraticCurveTo(24, 28, 28, 31); c.quadraticCurveTo(30, 32.5, 32, 31); c.stroke();
  },
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

/** 放道具之前手指下面那个预览。gy 是手指下面的落脚点（地面或者铅笔线） */
export function ghost(c, id, x, y, s, t, gy, f = {}) {
  switch (id) {
    case 'anvil': anvil(c, x, y, s); break;
    case 'peel': peel(c, x, gy, s); break;
    case 'spring': spring(c, x, gy, s, 0); break;
    case 'bolt': boltIcon(c, x, y, s); break;
    case 'freeze': snow(c, x, y, s); break;
    case 'hole': hole(c, x, y, 18 * s, t); break;
    case 'spikes': spikes(c, x, gy + 1, s, 0, 1); break;
    case 'roller': roller(c, x, gy + 1, s, 1, t); break;
    case 'food': food(c, f.kind || 'leg', x, gy - FOOD_BOTTOM[f.kind || 'leg'] * s * 1.15, s * 1.15); break;
    default: break;
  }
}
