// 瓶子的形状和绘制（canvas）。
// 坐标约定：每个瓶子有自己的"本地坐标"，原点在瓶口正中最上沿，y 向下。
// 饮料按面积算体积：不管瓶子歪多少度，液面都保持水平、体积不变。

/* ---------- 几何小工具 ---------- */
const dot = (p, g) => p[0] * g[0] + p[1] * g[1];

/** 多边形和半平面 dot(p,g) >= c 求交（Sutherland–Hodgman） */
function clipGE(poly, g, c) {
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const da = dot(a, g) - c, db = dot(b, g) - c;
    if (da >= 0) out.push(a);
    if ((da >= 0) !== (db >= 0)) {
      const t = da / (da - db);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return out;
}
const clipLE = (poly, g, c) => clipGE(poly, [-g[0], -g[1]], -c);

function area(poly) {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    s += a[0] * b[1] - b[0] * a[1];
  }
  return Math.abs(s) / 2;
}

function pathOf(ctx, poly) {
  ctx.beginPath();
  poly.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
  ctx.closePath();
}

/* ---------- 瓶子形状 ---------- */
/**
 * W：瓶身宽度（CSS 像素），cap：一瓶几格。
 * 返回外轮廓、内腔多边形、每格面积、倾倒角度表等。
 */
export function makeShape(W, cap) {
  const t = Math.max(2, W * 0.055);       // 玻璃厚度
  const rimH = W * 0.13, rimW = W * 0.66;  // 瓶口外沿
  const nw = W * 0.5;                      // 瓶颈外宽
  const neckTop = rimH * 0.55;
  const y1 = rimH + W * 0.12;              // 瓶颈结束
  const y2 = y1 + W * 0.3;                 // 肩膀结束
  const u = W * 0.56;                      // 一格的高度（直筒部分）
  const y3 = y2 + cap * u + W * 0.16;      // 瓶底
  const R = W * 0.36;

  const outline = (hw, nhw, bottom, r, top) => {
    const pts = [];
    pts.push([-nhw, top], [-nhw, y1]);
    for (let i = 1; i <= 10; i++) { // 肩膀：二次曲线
      const s = i / 10, x0 = -nhw, x1 = -hw, cx = -hw, cy = y1;
      const x = (1 - s) ** 2 * x0 + 2 * (1 - s) * s * cx + s * s * x1;
      const y = (1 - s) ** 2 * y1 + 2 * (1 - s) * s * cy + s * s * y2;
      pts.push([x, y]);
    }
    for (let i = 0; i <= 10; i++) { // 左下圆角
      const a = Math.PI - (i / 10) * (Math.PI / 2);
      pts.push([-hw + r + Math.cos(a) * r, bottom - r + Math.sin(a) * r]);
    }
    for (let i = 0; i <= 10; i++) { // 右下圆角
      const a = Math.PI / 2 - (i / 10) * (Math.PI / 2);
      pts.push([hw - r + Math.cos(a) * r, bottom - r + Math.sin(a) * r]);
    }
    for (let i = 0; i < 10; i++) {
      const s = 1 - i / 10, x0 = nhw, x1 = hw, cx = hw, cy = y1;
      const x = (1 - s) ** 2 * x0 + 2 * (1 - s) * s * cx + s * s * x1;
      const y = (1 - s) ** 2 * y1 + 2 * (1 - s) * s * cy + s * s * y2;
      pts.push([x, y]);
    }
    pts.push([nhw, y1], [nhw, top]);
    return pts;
  };

  const outer = outline(W / 2, nw / 2, y3, R, neckTop);
  const inner = outline(W / 2 - t, nw / 2 - t, y3 - t, R - t * 0.8, neckTop);
  const fullLine = y3 - t - cap * u;
  const unitArea = area(clipGE(inner, [0, 1], fullLine)) / cap;

  const shape = { W, cap, t, rimH, rimW, nw, neckTop, y1, y2, y3, u, outer, inner, unitArea, height: y3 };
  shape.lip = (dir) => [dir * (nw / 2 - t), neckTop]; // 倒水时的出口（靠目标那一侧的瓶口内沿）

  // 倾倒角度表：瓶子以瓶口为轴转 θ 时，液面刚好到瓶口能装多少格
  const table = [];
  for (let d = 0; d <= 175; d += 1) {
    const th = (d * Math.PI) / 180;
    const g = [Math.sin(th), Math.cos(th)];
    const lp = shape.lip(1);
    table.push(area(clipGE(inner, g, dot(lp, g))) / unitArea);
  }
  /** 剩 v 格时，至少要转多少度（弧度）液面才到瓶口 */
  shape.angleFor = (v) => {
    for (let d = 0; d < table.length; d++) {
      if (table[d] <= v) {
        if (!d) return 0;
        const a = table[d - 1], b = table[d];
        return ((d - 1 + (a - v) / (a - b)) * Math.PI) / 180;
      }
    }
    return (175 * Math.PI) / 180;
  };
  return shape;
}

/** 体积（格）对应的液面位置：dot(p,g) >= c 的那部分面积 = v 格 */
function levelFor(shape, g, v) {
  const pts = shape.inner;
  let lo = Infinity, hi = -Infinity;
  for (const p of pts) { const d = dot(p, g); if (d < lo) lo = d; if (d > hi) hi = d; }
  if (v <= 0) return hi;
  const target = v * shape.unitArea;
  for (let i = 0; i < 26; i++) {
    const mid = (lo + hi) / 2;
    if (area(clipGE(pts, g, mid)) > target) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

/* ---------- 颜色 ---------- */
function shade(hex, k) { // k>0 变亮，k<0 变暗
  const n = parseInt(hex.slice(1), 16);
  let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  if (k >= 0) { r += (255 - r) * k; g += (255 - g) * k; b += (255 - b) * k; }
  else { r *= 1 + k; g *= 1 + k; b *= 1 + k; }
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}
const HIDDEN = '#101218';

/* ---------- 画一个瓶子 ---------- */
/**
 * v: { anchor:[x,y], pivot:[x,y], rot, scale, alpha, wobble(弧度), cap(0..1 盖子), capColor, glow }
 * segs: 从瓶底往上的 [{ color | null(藏着), amount }]
 * 返回顶部液面在世界坐标里的 y（给水流用）
 */
export function drawBottle(ctx, shape, v, segs) {
  const { W } = shape;
  const rot = v.rot || 0, s = v.scale ?? 1;
  ctx.save();
  ctx.globalAlpha = v.alpha ?? 1;
  ctx.translate(v.anchor[0], v.anchor[1]);
  ctx.rotate(rot);
  ctx.scale(s, s);
  ctx.translate(-v.pivot[0], -v.pivot[1]);

  // 地面上的影子（只在立着的时候）
  if (Math.abs(rot) < 0.02 && s > 0.95) {
    const sh = ctx.createRadialGradient(0, shape.y3 + 2, 0, 0, shape.y3 + 2, W * 0.7);
    sh.addColorStop(0, 'rgba(0,0,0,.45)');
    sh.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = sh;
    ctx.beginPath(); ctx.ellipse(0, shape.y3 + 2, W * 0.7, W * 0.12, 0, 0, Math.PI * 2); ctx.fill();
  }

  // 被选中时的光晕
  if (v.glow) {
    ctx.save();
    ctx.shadowColor = `rgba(120,150,255,${0.75 * v.glow})`;
    ctx.shadowBlur = W * 0.45;
    pathOf(ctx, shape.outer);
    ctx.fillStyle = 'rgba(40,60,160,.25)';
    ctx.fill();
    ctx.restore();
  }

  // 玻璃内腔底色
  pathOf(ctx, shape.inner);
  const back = ctx.createLinearGradient(0, 0, 0, shape.y3);
  back.addColorStop(0, 'rgba(70,90,200,.10)');
  back.addColorStop(1, 'rgba(40,60,190,.26)');
  ctx.fillStyle = back;
  ctx.fill();

  // 饮料
  ctx.save();
  pathOf(ctx, shape.inner);
  ctx.clip();
  const wob = v.wobble || 0;
  const th = rot + wob;
  const g = [Math.sin(th), Math.cos(th)]; // 本地坐标里"向下"的方向
  let cum = 0, prevC = Infinity, topC = null, topColor = null;
  const qMarks = [];
  for (const seg of segs) {
    if (seg.amount <= 0.001) continue;
    cum += seg.amount;
    const c = levelFor(shape, g, cum);
    let poly = clipGE(shape.inner, g, c);
    if (prevC !== Infinity) poly = clipLE(poly, g, prevC);
    if (poly.length > 2) {
      pathOf(ctx, poly);
      if (seg.color) {
        const lg = ctx.createLinearGradient(-W / 2, 0, W / 2, 0);
        lg.addColorStop(0, shade(seg.color, -0.38));
        lg.addColorStop(0.3, seg.color);
        lg.addColorStop(0.55, shade(seg.color, 0.12));
        lg.addColorStop(1, shade(seg.color, -0.45));
        ctx.fillStyle = lg;
      } else {
        ctx.fillStyle = HIDDEN;
      }
      ctx.fill();
      if (!seg.color) qMarks.push((c + (prevC === Infinity ? shape.y3 - shape.t : prevC)) / 2);
    }
    prevC = c; topC = c; topColor = seg.color;
  }

  // 顶部液面：一个亮一点的椭圆，看起来像圆柱的顶
  if (topC !== null && cum > 0.04) {
    const pts = clipGE(shape.inner, g, topC - 0.01).filter((p) => Math.abs(dot(p, g) - topC) < 0.6);
    if (pts.length >= 2) {
      const tg = [g[1], -g[0]];
      let a = pts[0], b = pts[0];
      for (const p of pts) { if (dot(p, tg) < dot(a, tg)) a = p; if (dot(p, tg) > dot(b, tg)) b = p; }
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const cx = (a[0] + b[0]) / 2, cy = (a[1] + b[1]) / 2;
      const ry = Math.min(W * 0.11, len * 0.17) * Math.max(0.25, Math.cos(th));
      ctx.beginPath();
      ctx.ellipse(cx, cy, len / 2, ry, Math.atan2(b[1] - a[1], b[0] - a[0]), 0, Math.PI * 2);
      ctx.fillStyle = topColor ? shade(topColor, 0.28) : '#2A2D36';
      ctx.fill();
    }
  }

  // 问号（立着的时候才画）
  if (Math.abs(rot) < 0.05) {
    ctx.fillStyle = 'rgba(255,255,255,.32)';
    ctx.font = `700 ${Math.round(shape.u * 0.5)}px -apple-system, "PingFang SC", sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const y of qMarks) ctx.fillText('?', 0, y + 1);
  }

  // 圆柱体的明暗
  const cyl = ctx.createLinearGradient(-W / 2, 0, W / 2, 0);
  cyl.addColorStop(0, 'rgba(0,0,10,.42)');
  cyl.addColorStop(0.16, 'rgba(0,0,10,0)');
  cyl.addColorStop(0.42, 'rgba(255,255,255,.07)');
  cyl.addColorStop(0.8, 'rgba(0,0,10,0)');
  cyl.addColorStop(1, 'rgba(0,0,10,.48)');
  ctx.fillStyle = cyl;
  ctx.fillRect(-W / 2, 0, W, shape.y3);
  ctx.restore();

  // 玻璃高光
  ctx.save();
  pathOf(ctx, shape.inner);
  ctx.clip();
  const hl = (x, y, w, h, a) => {
    const gr = ctx.createLinearGradient(0, y, 0, y + h);
    gr.addColorStop(0, `rgba(255,255,255,${a})`);
    gr.addColorStop(0.7, `rgba(255,255,255,${a * 0.6})`);
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gr;
    ctx.beginPath(); ctx.roundRect(x, y, w, h, w / 2); ctx.fill();
  };
  hl(-W * 0.33, shape.y2 - W * 0.05, W * 0.085, (shape.y3 - shape.y2) * 0.62, 0.55);
  hl(W * 0.25, shape.y2 + W * 0.02, W * 0.045, (shape.y3 - shape.y2) * 0.35, 0.22);
  // 肩膀上的反光
  ctx.strokeStyle = 'rgba(255,255,255,.35)';
  ctx.lineWidth = W * 0.05;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-shape.nw / 2 + shape.t * 1.5, shape.y1 + W * 0.04);
  ctx.quadraticCurveTo(-W / 2 + shape.t * 2, shape.y1 + W * 0.05, -W / 2 + shape.t * 2.2, shape.y2);
  ctx.stroke();
  ctx.restore();

  // 玻璃外轮廓
  pathOf(ctx, shape.outer);
  const edge = ctx.createLinearGradient(-W / 2, 0, W / 2, shape.y3);
  edge.addColorStop(0, '#8E9BFF');
  edge.addColorStop(0.5, '#5161E8');
  edge.addColorStop(1, '#2B37A8');
  ctx.strokeStyle = edge;
  ctx.lineWidth = Math.max(1.6, W * 0.05);
  ctx.lineJoin = 'round';
  ctx.stroke();
  pathOf(ctx, shape.inner);
  ctx.strokeStyle = 'rgba(190,200,255,.22)';
  ctx.lineWidth = 1;
  ctx.stroke();

  // 瓶口外沿
  const rw = shape.rimW, rh = shape.rimH;
  const rim = ctx.createLinearGradient(0, 0, 0, rh);
  rim.addColorStop(0, '#9AA6FF');
  rim.addColorStop(0.5, '#4E5EE0');
  rim.addColorStop(1, '#2A35A0');
  ctx.fillStyle = rim;
  ctx.beginPath(); ctx.roundRect(-rw / 2, 0, rw, rh, rh * 0.45); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.45)';
  ctx.beginPath(); ctx.roundRect(-rw / 2 + rh * 0.4, rh * 0.18, rw - rh * 0.8, rh * 0.22, rh * 0.11); ctx.fill();

  // 倒好之后盖上的盖子
  if (v.cap > 0) {
    const k = Math.min(1, v.cap);
    const drop = (1 - k) * -W * 0.6;
    const cw = rw * 1.08, ch = rh * 1.7;
    ctx.globalAlpha = (v.alpha ?? 1) * Math.min(1, k * 1.6);
    const cg = ctx.createLinearGradient(-cw / 2, 0, cw / 2, 0);
    cg.addColorStop(0, shade(v.capColor, -0.35));
    cg.addColorStop(0.4, shade(v.capColor, 0.15));
    cg.addColorStop(1, shade(v.capColor, -0.45));
    ctx.fillStyle = cg;
    ctx.beginPath(); ctx.roundRect(-cw / 2, -ch * 0.55 + drop, cw, ch, ch * 0.3); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.4)';
    ctx.beginPath(); ctx.roundRect(-cw / 2 + ch * 0.25, -ch * 0.42 + drop, cw - ch * 0.5, ch * 0.2, ch * 0.1); ctx.fill();
  }
  ctx.restore();

  // 顶部液面的世界坐标（立着时有效）
  return topC === null ? null : v.anchor[1] + (topC - v.pivot[1]) * s;
}

/** 水流：从 a 弯到 b，head / tail 是 0..1 的可见区间 */
export function drawStream(ctx, a, b, color, width, tail, head) {
  if (head <= tail) return;
  const c = [a[0] + (b[0] - a[0]) * 0.85, a[1] + (b[1] - a[1]) * 0.18];
  const at = (t) => [
    (1 - t) ** 2 * a[0] + 2 * (1 - t) * t * c[0] + t * t * b[0],
    (1 - t) ** 2 * a[1] + 2 * (1 - t) * t * c[1] + t * t * b[1],
  ];
  const pts = [];
  for (let i = 0; i <= 16; i++) pts.push(at(tail + ((head - tail) * i) / 16));
  ctx.save();
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,.35)';
  ctx.lineWidth = width * 0.28;
  ctx.beginPath();
  pts.forEach((p, i) => (i ? ctx.lineTo(p[0] - width * 0.18, p[1]) : ctx.moveTo(p[0] - width * 0.18, p[1])));
  ctx.stroke();
  ctx.restore();
}
