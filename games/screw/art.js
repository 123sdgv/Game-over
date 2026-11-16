// 拧螺丝的美术：螺丝头、玻璃板、工具箱、暂存格。全部现画，画好的缓存成贴图。

/* ---------------- 颜色 ---------------- */
export const COLORS = [
  { name: '橙色', base: '#FF8A1E' },
  { name: '深棕', base: '#8A5230' },
  { name: '嫩绿', base: '#8ED64A' },
  { name: '粉色', base: '#FFB3D3' },
  { name: '紫色', base: '#9A6BFF' },
  { name: '品红', base: '#E0067F' },
];
/** 变色钉在关卡里的样子：红 / 白 / 黑 / 灰 */
export const SPECIAL = ['#E8343A', '#F2F3F6', '#2B2C31', '#9DA1A9'];
/** 玻璃板的颜色（避开螺丝的颜色） */
export const TINTS = ['#7DC4FF', '#6FE0EA', '#A2B0FF', '#76DDBE', '#BFD9F0', '#FFE27E'];

export const hexRgb = (h) => {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
export const rgbHex = ([r, g, b]) => '#' + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
export const mix = (a, b, t) => {
  const A = hexRgb(a), B = hexRgb(b);
  return rgbHex(A.map((v, i) => v + (B[i] - v) * t));
};
const rgba = (h, a) => { const [r, g, b] = hexRgb(h); return `rgba(${r},${g},${b},${a})`; };
const lum = (h) => { const [r, g, b] = hexRgb(h); return (0.299 * r + 0.587 * g + 0.114 * b) / 255; };
const gray = (h) => { const l = Math.round(lum(h) * 255); return rgbHex([l, l, l]); };

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h));
  return c;
}

/* ---------------- 螺丝头 ---------------- */
/**
 * 在 (0,0) 画一个螺丝头（不含影子和高光，方便旋转）。
 * mode: 'cross' 十字 | 'star' 变色钉的星标 | 'none'
 */
export function drawHead(g, r, base, { mode = 'cross', rainbow = false } = {}) {
  const l = lum(base);
  const light = mix(base, '#FFFFFF', l > 0.8 ? 0.6 : 0.45);
  const dark = mix(base, '#000000', l > 0.8 ? 0.28 : 0.38);
  // 侧边（厚度）
  g.beginPath(); g.arc(0, r * 0.06, r, 0, Math.PI * 2); g.fillStyle = mix(base, '#000', 0.48); g.fill();
  // 顶面：左上亮、右下暗
  const rg = g.createRadialGradient(-r * 0.38, -r * 0.42, r * 0.08, 0, 0, r * 1.02);
  rg.addColorStop(0, light); rg.addColorStop(0.5, base); rg.addColorStop(1, dark);
  g.beginPath(); g.arc(0, 0, r * 0.97, 0, Math.PI * 2); g.fillStyle = rg; g.fill();
  if (rainbow) {
    const seg = 36, w = r * 0.2;
    for (let i = 0; i < seg; i++) {
      g.beginPath();
      g.arc(0, 0, r * 0.97 - w / 2, (i / seg) * Math.PI * 2 - 0.02, ((i + 1) / seg) * Math.PI * 2 + 0.02);
      g.strokeStyle = `hsl(${(i / seg) * 360}, 92%, 62%)`; g.lineWidth = w; g.stroke();
    }
    g.beginPath(); g.arc(0, 0, r * 0.97 - w, 0, Math.PI * 2); g.strokeStyle = 'rgba(255,255,255,.7)'; g.lineWidth = r * 0.05; g.stroke();
  }
  // 斜边一圈亮线
  g.beginPath(); g.arc(0, 0, r * 0.8, Math.PI * 1.05, Math.PI * 1.85);
  g.strokeStyle = 'rgba(255,255,255,.45)'; g.lineWidth = r * 0.09; g.lineCap = 'round'; g.stroke();
  g.beginPath(); g.arc(0, 0, r * 0.97, 0, Math.PI * 2); g.strokeStyle = rgba(dark, 0.55); g.lineWidth = r * 0.06; g.stroke();
  if (mode === 'cross') {
    const slot = mix(dark, '#000', 0.35);
    const L = r * 0.56, W = r * 0.15;
    for (const a of [0, Math.PI / 2]) {
      g.save(); g.rotate(a);
      g.beginPath(); g.roundRect(-L, -W, L * 2, W * 2, W);
      g.fillStyle = slot; g.fill();
      // 槽口下沿的反光
      g.beginPath(); g.roundRect(-L + W * 0.6, W * 0.25, L * 2 - W * 1.2, W * 0.55, W * 0.3);
      g.fillStyle = rgba(light, 0.45); g.fill();
      g.restore();
    }
  } else if (mode === 'star') {
    const s = r * 0.55;
    g.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 - Math.PI / 2, rr = i % 2 ? s * 0.32 : s;
      g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    g.closePath();
    g.fillStyle = l > 0.8 ? '#FFD34A' : '#FFFFFF';
    g.shadowColor = 'rgba(255,255,255,.9)'; g.shadowBlur = r * 0.4;
    g.fill();
    g.shadowBlur = 0;
  }
}

/** 不随旋转的高光 */
export function drawShine(g, r) {
  const rg = g.createRadialGradient(-r * 0.36, -r * 0.44, 0, -r * 0.36, -r * 0.44, r * 0.42);
  rg.addColorStop(0, 'rgba(255,255,255,.75)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = rg;
  g.beginPath(); g.ellipse(-r * 0.36, -r * 0.44, r * 0.4, r * 0.24, -0.6, 0, Math.PI * 2); g.fill();
}

const spriteCache = new Map();
/** 螺丝头贴图（不含影子），按颜色 + 尺寸缓存。返回 { c: canvas, s: 半径（贴图像素） } */
export function headSprite(base, rpx, opts = {}) {
  rpx = Math.max(2, Math.round(rpx * 2) / 2);
  const key = `${base}|${rpx}|${opts.mode || 'cross'}|${opts.rainbow ? 1 : 0}|${opts.shine ? 1 : 0}`;
  let sp = spriteCache.get(key);
  if (sp) return sp;
  const pad = Math.ceil(rpx * 0.2) + 2;
  const c = canvas(rpx * 2 + pad * 2, rpx * 2 + pad * 2);
  const g = c.getContext('2d');
  g.translate(c.width / 2, c.height / 2);
  drawHead(g, rpx, base, opts);
  if (opts.shine) drawShine(g, rpx);
  sp = { c, s: c.width / 2 };
  if (spriteCache.size > 600) spriteCache.clear();
  spriteCache.set(key, sp);
  return sp;
}
export const lockedColor = (base) => mix(mix(base, gray(base), 0.55), '#D9DCE2', 0.35);

const shadowCache = new Map();
/** 螺丝在板上的软影子 */
export function shadowSprite(rpx) {
  rpx = Math.max(2, Math.round(rpx));
  let c = shadowCache.get(rpx);
  if (c) return c;
  const pad = rpx;
  c = canvas(rpx * 2 + pad * 2, rpx * 2 + pad * 2);
  const g = c.getContext('2d');
  const rg = g.createRadialGradient(c.width / 2, c.height / 2, rpx * 0.5, c.width / 2, c.height / 2, rpx * 1.5);
  rg.addColorStop(0, 'rgba(20,30,60,.38)'); rg.addColorStop(1, 'rgba(20,30,60,0)');
  g.fillStyle = rg; g.fillRect(0, 0, c.width, c.height);
  shadowCache.set(rpx, c);
  return c;
}

/** 小图标（DOM 里用的 <img>）：一颗螺丝头 */
const iconCache = new Map();
export function screwIcon(base, size = 44, opts = {}) {
  const key = base + size + JSON.stringify(opts);
  if (iconCache.has(key)) return iconCache.get(key);
  const c = canvas(size, size);
  const g = c.getContext('2d');
  const r = size * 0.4;
  g.translate(size / 2, size / 2);
  const sh = g.createRadialGradient(0, r * 0.25, r * 0.6, 0, r * 0.25, r * 1.2);
  sh.addColorStop(0, 'rgba(20,30,60,.3)'); sh.addColorStop(1, 'rgba(20,30,60,0)');
  g.fillStyle = sh; g.fillRect(-size / 2, -size / 2, size, size);
  g.rotate(opts.rot || 0.35);
  drawHead(g, r, base, opts);
  g.rotate(-(opts.rot || 0.35));
  drawShine(g, r);
  const url = c.toDataURL();
  iconCache.set(key, url);
  return url;
}

/* ---------------- 玻璃板 ---------------- */
function tracePoly(g, poly, k, ox, oy) {
  g.beginPath();
  poly.forEach(([x, y], i) => (i ? g.lineTo(x * k - ox, y * k - oy) : g.moveTo(x * k - ox, y * k - oy)));
  g.closePath();
}

/**
 * 一块玻璃板的贴图。poly / holes 是棋盘坐标，k = 棋盘单位 → 贴图像素。
 * 螺丝孔是真的挖空的，下面的东西能透上来。
 */
export function plateSprite(poly, holes, r, tint, k, hub) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of poly) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  const pad = 3;
  const ox = x0 * k - pad, oy = y0 * k - pad;
  const c = canvas((x1 - x0) * k + pad * 2, (y1 - y0) * k + pad * 2);
  const g = c.getContext('2d');
  const light = mix(tint, '#FFFFFF', 0.55), dark = mix(tint, '#1A3060', 0.35);
  tracePoly(g, poly, k, ox, oy);
  const lg = g.createLinearGradient(0, 0, c.width, c.height);
  lg.addColorStop(0, rgba(light, 0.74));
  lg.addColorStop(0.45, rgba(tint, 0.6));
  lg.addColorStop(1, rgba(mix(tint, '#2A4A90', 0.15), 0.66));
  g.fillStyle = lg; g.fill();
  // 玻璃的斜向反光带
  g.save();
  tracePoly(g, poly, k, ox, oy); g.clip();
  const L = Math.max(c.width, c.height);
  const sg = g.createLinearGradient(0, 0, L * 0.7, L * 0.7);
  sg.addColorStop(0.18, 'rgba(255,255,255,0)'); sg.addColorStop(0.3, 'rgba(255,255,255,.3)');
  sg.addColorStop(0.36, 'rgba(255,255,255,.08)'); sg.addColorStop(0.44, 'rgba(255,255,255,.22)'); sg.addColorStop(0.52, 'rgba(255,255,255,0)');
  g.fillStyle = sg; g.fillRect(0, 0, c.width, c.height);
  // 内侧一圈亮边（玻璃的厚度）
  tracePoly(g, poly, k, ox, oy);
  g.lineWidth = Math.max(3, k * 5); g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineJoin = 'round'; g.stroke();
  g.lineWidth = Math.max(1.5, k * 2); g.strokeStyle = rgba(light, 0.9); g.stroke();
  g.restore();
  // 外沿
  tracePoly(g, poly, k, ox, oy);
  g.lineWidth = Math.max(1.2, k * 1.4); g.strokeStyle = rgba(dark, 0.75); g.stroke();
  // 挖孔
  const hole = (x, y, rr) => {
    const cx = x * k - ox, cy = y * k - oy;
    g.save();
    g.globalCompositeOperation = 'destination-out';
    g.beginPath(); g.arc(cx, cy, rr * k, 0, Math.PI * 2); g.fill();
    g.restore();
    g.beginPath(); g.arc(cx, cy, rr * k, 0, Math.PI * 2);
    g.lineWidth = Math.max(1, k * 1.6); g.strokeStyle = rgba(dark, 0.55); g.stroke();
    g.beginPath(); g.arc(cx, cy, rr * k + k * 1.6, Math.PI * 0.15, Math.PI * 0.85);
    g.lineWidth = Math.max(1, k * 1.4); g.strokeStyle = 'rgba(255,255,255,.75)'; g.stroke();
  };
  for (const [x, y] of holes) hole(x, y, r * 0.78);
  if (hub) hole(hub[0], hub[1], r * 0.9);
  return { c, ox, oy };
}

/** 板子的影子（往右下偏一点、糊一点） */
export function plateShadow(poly, k) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of poly) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  const blur = Math.max(4, k * 6), pad = blur * 2;
  const ox = x0 * k - pad, oy = y0 * k - pad;
  const c = canvas((x1 - x0) * k + pad * 2, (y1 - y0) * k + pad * 2);
  const g = c.getContext('2d');
  // 画在画布外面，只留影子（Safari 的 canvas 没有 filter，用 shadowBlur）
  g.shadowColor = 'rgba(25,45,95,.30)'; g.shadowBlur = blur; g.shadowOffsetX = 10000;
  tracePoly(g, poly, k, ox + 10000, oy);
  g.fillStyle = '#000'; g.fill();
  return { c, ox, oy };
}

/* ---------------- 工具箱 ---------------- */
const IDLE = '#DDE2EA';
/**
 * 画一个工具箱。b: { color(null=空闲), colorT 0–1, lid 0=开 1=合, n 装了几颗 }
 * slots: 每个格子的中心（相对 x, y），sr: 格子里螺丝的半径
 */
export function drawBox(g, x, y, w, h, b, slots, sr, dpr) {
  const col = b.color ? mix(IDLE, b.color, b.colorT) : IDLE;
  const body = col, light = mix(col, '#FFFFFF', 0.45), dark = mix(col, '#1A2240', 0.32), deep = mix(col, '#1A2240', 0.5);
  const top = y + h * 0.16, bh = h - h * 0.16;
  const rad = Math.min(14, w * 0.16);
  // 影子
  g.save();
  g.shadowColor = 'rgba(30,40,80,.22)'; g.shadowBlur = 10 * dpr; g.shadowOffsetY = 4 * dpr;
  g.beginPath(); g.roundRect(x, top, w, bh, rad); g.fillStyle = deep; g.fill();
  g.restore();
  // 提手
  g.beginPath();
  g.roundRect(x + w * 0.3, y + 1, w * 0.4, h * 0.3, h * 0.12);
  g.lineWidth = Math.max(3, h * 0.075); g.strokeStyle = dark; g.stroke();
  // 箱体：底下一条厚度
  g.beginPath(); g.roundRect(x, top, w, bh, rad); g.fillStyle = dark; g.fill();
  const lg = g.createLinearGradient(0, top, 0, top + bh);
  lg.addColorStop(0, light); lg.addColorStop(0.5, body); lg.addColorStop(1, mix(body, '#000', 0.08));
  g.beginPath(); g.roundRect(x, top, w, bh - Math.max(4, h * 0.08), rad); g.fillStyle = lg; g.fill();
  // 槽（内胆）
  const ix = x + w * 0.08, iy = top + bh * 0.12, iw = w * 0.84, ih = bh * 0.68;
  g.beginPath(); g.roundRect(ix, iy, iw, ih, rad * 0.6);
  const ig = g.createLinearGradient(0, iy, 0, iy + ih);
  ig.addColorStop(0, mix(col, '#1A2240', 0.28)); ig.addColorStop(0.3, mix(col, '#FFFFFF', 0.1)); ig.addColorStop(1, mix(col, '#FFFFFF', 0.25));
  g.fillStyle = ig; g.fill();
  // 格子
  for (const [sx, sy] of slots) {
    g.beginPath(); g.arc(x + sx, y + sy, sr * 1.05, 0, Math.PI * 2);
    g.fillStyle = rgba(deep, 0.35); g.fill();
    g.beginPath(); g.arc(x + sx, y + sy + sr * 0.15, sr * 0.9, 0, Math.PI); g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = Math.max(1, sr * 0.12); g.stroke();
  }
  return { ix, iy, iw, ih, body, light, dark, rad };
}

/** 盖子：lid 0（开着，看不见）→ 1（盖严） */
export function drawLid(g, x, y, w, h, b, dpr) {
  if (b.lid <= 0.01) return;
  const col = b.color ? mix(IDLE, b.color, b.colorT) : IDLE;
  const top = y + h * 0.16, bh = h - h * 0.16;
  const ix = x + w * 0.04, iy = top + bh * 0.06, iw = w * 0.92, ihFull = bh * 0.8;
  const ih = ihFull * b.lid;
  const rad = Math.min(12, w * 0.14);
  g.save();
  g.beginPath(); g.roundRect(ix, iy, iw, Math.max(2, ih), Math.min(rad, ih / 2));
  const lg = g.createLinearGradient(0, iy, 0, iy + ih);
  lg.addColorStop(0, mix(col, '#FFFFFF', 0.55)); lg.addColorStop(1, mix(col, '#FFFFFF', 0.12));
  g.fillStyle = lg;
  g.shadowColor = 'rgba(30,40,80,.18)'; g.shadowBlur = 4 * dpr; g.shadowOffsetY = 1.5 * dpr;
  g.fill();
  g.restore();
  if (b.lid > 0.6) {
    // 盖子上的压纹和锁扣
    const a = (b.lid - 0.6) / 0.4;
    g.globalAlpha = a;
    g.beginPath(); g.roundRect(ix + iw * 0.12, iy + ih * 0.28, iw * 0.76, ih * 0.16, ih * 0.08);
    g.fillStyle = 'rgba(255,255,255,.55)'; g.fill();
    g.beginPath(); g.roundRect(x + w / 2 - w * 0.09, iy + ih - ih * 0.2, w * 0.18, ih * 0.26, 3 * dpr);
    g.fillStyle = mix(col, '#1A2240', 0.35); g.fill();
    if (!b.color) {
      // 空闲的箱子：盖子上一个淡淡的问号形加号，表示等着装第一种颜色
      g.strokeStyle = 'rgba(120,130,150,.55)'; g.lineWidth = Math.max(2, w * 0.035); g.lineCap = 'round';
      const cx = x + w / 2, cy = iy + ih * 0.62, s = Math.min(w, ih) * 0.12;
      g.beginPath(); g.moveTo(cx - s, cy); g.lineTo(cx + s, cy); g.moveTo(cx, cy - s); g.lineTo(cx, cy + s); g.stroke();
    }
    g.globalAlpha = 1;
  }
}

/** 格子在箱子里的位置（相对箱子左上角） */
export function boxSlots(w, h, cap) {
  const top = h * 0.16, bh = h - top;
  const ix = w * 0.08, iy = top + bh * 0.12, iw = w * 0.84, ih = bh * 0.68;
  const rows = cap <= 3 ? 1 : 2, cols = Math.ceil(cap / rows);
  const sw = iw / cols, shh = ih / rows;
  const sr = Math.min(sw, shh) * 0.36;
  const out = [];
  for (let i = 0; i < cap; i++) {
    const r = Math.floor(i / cols), c = i % cols;
    const inRow = r === rows - 1 ? cap - cols * (rows - 1) : cols;
    const off = (cols - inRow) * sw / 2;
    out.push([ix + off + sw * (c + 0.5), iy + shh * (r + 0.5)]);
  }
  return { slots: out, sr };
}

/* ---------------- 暂存格 ---------------- */
export function drawStageHole(g, x, y, r, t = 1) {
  g.save();
  g.globalAlpha = t;
  g.beginPath(); g.arc(x, y, r * 1.2, 0, Math.PI * 2);
  const rg = g.createRadialGradient(x, y - r * 0.4, r * 0.2, x, y, r * 1.2);
  rg.addColorStop(0, '#9EA6B6'); rg.addColorStop(0.75, '#C4CAD6'); rg.addColorStop(1, '#E9ECF2');
  g.fillStyle = rg; g.fill();
  g.beginPath(); g.arc(x, y, r * 1.2, Math.PI * 1.1, Math.PI * 1.9); g.strokeStyle = 'rgba(60,70,95,.35)'; g.lineWidth = r * 0.12; g.stroke();
  g.beginPath(); g.arc(x, y, r * 1.22, Math.PI * 0.15, Math.PI * 0.85); g.strokeStyle = 'rgba(255,255,255,.9)'; g.lineWidth = r * 0.1; g.stroke();
  g.restore();
}
