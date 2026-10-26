// 合成大西瓜的 9 种水果（重新画的：立体、圆润、干净，像手机表情那种感觉）。
// 每个水果都正好填满它的圆（物理碰撞也是这个圆），叶子和果梗可以伸出去一点。
// 猕猴桃、菠萝、半个西瓜是切面，画成有厚度的一片。
const TAU = Math.PI * 2;
export const EXT = 1.7; // 贴图边长 = 2 × EXT × r

export const LEVELS = [
  { name: '葡萄', r: 0.052, color: '#9B4DCA', draw: grape },
  { name: '樱桃', r: 0.07, color: '#E0213A', draw: cherry },
  { name: '橙子', r: 0.09, color: '#FF9A1A', draw: orange },
  { name: '柠檬', r: 0.106, color: '#FFD93A', draw: lemon },
  { name: '猕猴桃', r: 0.127, color: '#8FCB2E', draw: kiwi },
  { name: '桃子', r: 0.15, color: '#FF9F7A', draw: peach },
  { name: '菠萝', r: 0.176, color: '#FFD12E', draw: pine },
  { name: '半个西瓜', r: 0.205, color: '#F23B4E', draw: halfMelon },
  { name: '西瓜', r: 0.24, color: '#4CAF50', draw: melon },
];
export const LAST = LEVELS.length - 1;

/* ---------- 小工具 ---------- */
function radial(x, cx, cy, r1, stops, fx = cx, fy = cy, r0 = 0) {
  const g = x.createRadialGradient(fx, fy, r0, cx, cy, r1);
  stops.forEach(([o, c]) => g.addColorStop(o, c));
  return g;
}
function linear(x, x0, y0, x1, y1, stops) {
  const g = x.createLinearGradient(x0, y0, x1, y1);
  stops.forEach(([o, c]) => g.addColorStop(o, c));
  return g;
}
const circle = (x, r, cx = 0, cy = 0) => { x.beginPath(); x.arc(cx, cy, r, 0, TAU); };

/** 一个干净的球：亮面 → 本色 → 暗面，边缘再压暗一点，底部有一点反光 */
function sphere(x, r, light, mid, dark, edge = 'rgba(0,0,0,.28)') {
  circle(x, r);
  x.fillStyle = radial(x, -0.08 * r, -0.12 * r, 1.12 * r, [[0, light], [0.45, mid], [1, dark]], -0.34 * r, -0.4 * r, 0.04 * r);
  x.fill();
  x.save(); circle(x, r); x.clip();
  x.fillStyle = radial(x, 0, 0, r, [[0.72, 'rgba(0,0,0,0)'], [1, edge]]);
  x.fillRect(-r, -r, 2 * r, 2 * r);
  x.fillStyle = radial(x, 0.38 * r, 0.62 * r, 0.55 * r, [[0, 'rgba(255,255,255,.18)'], [1, 'rgba(255,255,255,0)']]);
  x.fillRect(-r, -r, 2 * r, 2 * r);
  x.restore();
}
/** 高光：一大片柔光 + 一个小亮点 */
function shine(x, r, { a = 0.6, cx = -0.34, cy = -0.4, rx = 0.4, ry = 0.24, rot = -0.6, dot = 0.9 } = {}) {
  x.save();
  x.translate(cx * r, cy * r); x.rotate(rot); x.scale(1, ry / rx);
  x.fillStyle = radial(x, 0, 0, rx * r, [[0, `rgba(255,255,255,${a})`], [0.6, `rgba(255,255,255,${a * 0.3})`], [1, 'rgba(255,255,255,0)']]);
  circle(x, rx * r); x.fill();
  x.restore();
  if (dot) {
    x.fillStyle = `rgba(255,255,255,${dot})`;
    x.beginPath(); x.ellipse((cx - 0.06) * r, (cy - 0.06) * r, 0.085 * r, 0.05 * r, rot, 0, TAU); x.fill();
  }
}
function leaf(x, x0, y0, ang, len, w, c1 = '#8EDB5A', c2 = '#2E9A3A') {
  x.save(); x.translate(x0, y0); x.rotate(ang);
  x.beginPath();
  x.moveTo(0, 0);
  x.bezierCurveTo(len * 0.3, -w, len * 0.78, -w * 0.85, len, 0);
  x.bezierCurveTo(len * 0.78, w * 0.85, len * 0.3, w, 0, 0);
  x.fillStyle = linear(x, 0, -w, 0, w, [[0, c1], [1, c2]]);
  x.fill();
  x.strokeStyle = 'rgba(255,255,255,.45)'; x.lineWidth = Math.max(0.8, w * 0.14); x.lineCap = 'round';
  x.beginPath(); x.moveTo(len * 0.12, 0); x.quadraticCurveTo(len * 0.5, -w * 0.12, len * 0.86, 0); x.stroke();
  x.restore();
}
function stem(x, pts, w, color = '#7A5230') {
  x.lineCap = 'round'; x.strokeStyle = color; x.lineWidth = w;
  x.beginPath(); x.moveTo(pts[0], pts[1]); x.quadraticCurveTo(pts[2], pts[3], pts[4], pts[5]); x.stroke();
  x.strokeStyle = 'rgba(255,255,255,.35)'; x.lineWidth = w * 0.35;
  x.beginPath(); x.moveTo(pts[0] - w * 0.15, pts[1]); x.quadraticCurveTo(pts[2] - w * 0.15, pts[3], pts[4] - w * 0.1, pts[5]); x.stroke();
}
function teardrop(x, px, py, ang, L, W, color) {
  x.save(); x.translate(px, py); x.rotate(ang);
  x.beginPath();
  x.moveTo(L / 2, 0);
  x.bezierCurveTo(L * 0.15, -W * 0.62, -L / 2, -W * 0.62, -L / 2, 0);
  x.bezierCurveTo(-L / 2, W * 0.62, L * 0.15, W * 0.62, L / 2, 0);
  x.fillStyle = color; x.fill();
  x.fillStyle = 'rgba(255,255,255,.4)';
  x.beginPath(); x.ellipse(-L * 0.12, -W * 0.15, L * 0.16, W * 0.13, 0, 0, TAU); x.fill();
  x.restore();
}

/** 切面水果：一片有厚度的圆片。side 是侧面颜色，face(x, R) 画正面 */
function slice(x, r, side, face) {
  const R = 0.93 * r, up = 0.06 * r;
  // 侧面（厚度），在下面露出一条
  circle(x, R, 0, up);
  x.fillStyle = linear(x, 0, -R, 0, R + up, [[0, side[0]], [1, side[1]]]);
  x.fill();
  // 正面
  x.save();
  x.translate(0, -up);
  face(x, R);
  // 正面边缘一圈暗边和一道亮边，看起来是凸起来的
  x.save(); circle(x, R); x.clip();
  x.fillStyle = radial(x, 0, 0, R, [[0.8, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,.16)']]);
  x.fillRect(-R, -R, 2 * R, 2 * R);
  x.restore();
  x.strokeStyle = 'rgba(255,255,255,.55)'; x.lineWidth = 0.035 * r; x.lineCap = 'round';
  x.beginPath(); x.arc(0, 0, R * 0.93, Math.PI * 1.05, Math.PI * 1.45); x.stroke();
  shine(x, R, { a: 0.35, rx: 0.5, ry: 0.3, dot: 0.6 });
  x.restore();
}

/* ======================================================================
   9 种水果
   ====================================================================== */
function grape(x, r) {
  stem(x, [0, -0.86 * r, 0.04 * r, -1.08 * r, 0.16 * r, -1.2 * r], 0.12 * r);
  sphere(x, r, '#E6C6FF', '#9B4DD6', '#4E1A86');
  // 葡萄上那层淡淡的白霜
  x.save(); circle(x, r); x.clip();
  x.fillStyle = radial(x, 0.2 * r, 0.1 * r, r, [[0, 'rgba(230,215,255,.18)'], [1, 'rgba(230,215,255,0)']]);
  x.fillRect(-r, -r, 2 * r, 2 * r);
  x.restore();
  shine(x, r, { a: 0.65 });
  x.fillStyle = 'rgba(60,20,90,.35)'; x.beginPath(); x.ellipse(0, -0.88 * r, 0.12 * r, 0.05 * r, 0, 0, TAU); x.fill();
}

function cherry(x, r) {
  stem(x, [0, -0.82 * r, 0.06 * r, -1.25 * r, 0.42 * r, -1.5 * r], 0.1 * r, '#5E8C2A');
  leaf(x, 0.38 * r, -1.46 * r, -0.25, 0.7 * r, 0.24 * r);
  sphere(x, r, '#FFA3A3', '#E8213C', '#7E0716');
  // 顶上果梗那里凹进去一点
  x.save(); circle(x, r); x.clip();
  x.fillStyle = radial(x, 0, -0.86 * r, 0.42 * r, [[0, 'rgba(90,0,15,.45)'], [1, 'rgba(90,0,15,0)']]);
  x.fillRect(-r, -r, 2 * r, 2 * r);
  x.restore();
  shine(x, r, { a: 0.75, dot: 1 });
}

function orange(x, r) {
  sphere(x, r, '#FFDDA0', '#FF9E24', '#D45F05');
  // 很淡的橘皮小点
  x.save(); circle(x, r); x.clip();
  for (let i = 0; i < 70; i++) {
    const a = i * 2.39996, d = Math.sqrt((i + 0.5) / 70) * r * 0.95;
    x.fillStyle = i % 2 ? 'rgba(255,240,200,.14)' : 'rgba(170,70,0,.1)';
    circle(x, r * 0.022, Math.cos(a) * d, Math.sin(a) * d); x.fill();
  }
  x.restore();
  shine(x, r, { a: 0.6 });
  // 蒂和小叶子
  leaf(x, 0.04 * r, -0.9 * r, -0.5, 0.55 * r, 0.2 * r);
  x.fillStyle = '#5E8C2A';
  for (let k = 0; k < 5; k++) { const a = (k / 5) * TAU; x.beginPath(); x.ellipse(Math.cos(a) * 0.06 * r, -0.9 * r + Math.sin(a) * 0.04 * r, 0.06 * r, 0.025 * r, a, 0, TAU); x.fill(); }
}

function lemonPath(x, r) {
  x.beginPath();
  x.moveTo(-r, 0);
  x.bezierCurveTo(-0.96 * r, -0.14 * r, -0.86 * r, -0.2 * r, -0.8 * r, -0.36 * r);
  x.bezierCurveTo(-0.55 * r, -0.92 * r, 0.55 * r, -0.92 * r, 0.8 * r, -0.36 * r);
  x.bezierCurveTo(0.86 * r, -0.2 * r, 0.96 * r, -0.14 * r, r, 0);
  x.bezierCurveTo(0.96 * r, 0.14 * r, 0.86 * r, 0.2 * r, 0.8 * r, 0.36 * r);
  x.bezierCurveTo(0.55 * r, 0.92 * r, -0.55 * r, 0.92 * r, -0.8 * r, 0.36 * r);
  x.bezierCurveTo(-0.86 * r, 0.2 * r, -0.96 * r, 0.14 * r, -r, 0);
  x.closePath();
}
function lemon(x, r) {
  x.save();
  x.rotate(-0.5);
  lemonPath(x, r);
  x.fillStyle = radial(x, -0.08 * r, -0.12 * r, 1.05 * r, [[0, '#FFF8B8'], [0.45, '#FFE03A'], [1, '#D8A200']], -0.34 * r, -0.38 * r, 0.04 * r);
  x.fill();
  x.save(); lemonPath(x, r); x.clip();
  x.fillStyle = radial(x, 0, 0, 0.95 * r, [[0.7, 'rgba(0,0,0,0)'], [1, 'rgba(120,80,0,.3)']]);
  x.fillRect(-r, -r, 2 * r, 2 * r);
  x.fillStyle = radial(x, 0.3 * r, 0.5 * r, 0.5 * r, [[0, 'rgba(255,255,255,.2)'], [1, 'rgba(255,255,255,0)']]);
  x.fillRect(-r, -r, 2 * r, 2 * r);
  shine(x, r, { a: 0.65, cx: -0.3, cy: -0.32, rx: 0.42, ry: 0.2, rot: -0.2 });
  x.restore();
  x.restore();
}

function kiwi(x, r) {
  slice(x, r, ['#9A6A3A', '#5A3716'], (x, R) => {
    circle(x, R); x.fillStyle = '#7A4E25'; x.fill();
    circle(x, R * 0.93);
    x.fillStyle = radial(x, 0, 0, R * 0.93, [[0, '#F7FFE0'], [0.22, '#D8F28C'], [0.55, '#9ED640'], [1, '#62A51C']]);
    x.fill();
    // 淡淡的放射纹
    x.strokeStyle = 'rgba(255,255,230,.18)'; x.lineWidth = 0.02 * R; x.lineCap = 'round';
    for (let k = 0; k < 36; k++) { const a = (k / 36) * TAU; x.beginPath(); x.moveTo(Math.cos(a) * 0.28 * R, Math.sin(a) * 0.28 * R); x.lineTo(Math.cos(a) * 0.84 * R, Math.sin(a) * 0.84 * R); x.stroke(); }
    // 一圈黑籽
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * TAU + (k % 2) * 0.06, d = (0.38 + (k % 3) * 0.035) * R;
      teardrop(x, Math.cos(a) * d, Math.sin(a) * d, a, 0.1 * R, 0.045 * R, '#1A1508');
    }
    x.fillStyle = radial(x, 0, 0, 0.24 * R, [[0, 'rgba(255,255,248,1)'], [0.65, 'rgba(250,255,235,.95)'], [1, 'rgba(250,255,235,0)']]);
    x.beginPath(); x.ellipse(0, 0, 0.24 * R, 0.19 * R, 0, 0, TAU); x.fill();
  });
}

function peach(x, r) {
  leaf(x, 0.06 * r, -0.9 * r, -0.45, 0.62 * r, 0.22 * r);
  stem(x, [0.02 * r, -0.86 * r, 0.04 * r, -0.98 * r, 0.08 * r, -1.06 * r], 0.08 * r);
  sphere(x, r, '#FFF0D8', '#FFAE82', '#E2546A', 'rgba(150,20,40,.22)');
  x.save(); circle(x, r); x.clip();
  // 红晕
  x.fillStyle = radial(x, 0.38 * r, 0.18 * r, 0.85 * r, [[0, 'rgba(240,60,90,.45)'], [1, 'rgba(240,60,90,0)']]);
  x.fillRect(-r, -r, 2 * r, 2 * r);
  // 中间那道沟
  x.lineCap = 'round';
  x.strokeStyle = 'rgba(190,60,70,.32)'; x.lineWidth = 0.06 * r;
  x.beginPath(); x.moveTo(0.02 * r, -0.95 * r); x.bezierCurveTo(-0.22 * r, -0.4 * r, -0.16 * r, 0.25 * r, 0.1 * r, 0.62 * r); x.stroke();
  x.strokeStyle = 'rgba(255,240,225,.45)'; x.lineWidth = 0.03 * r;
  x.beginPath(); x.moveTo(-0.05 * r, -0.9 * r); x.bezierCurveTo(-0.28 * r, -0.4 * r, -0.22 * r, 0.25 * r, 0.03 * r, 0.6 * r); x.stroke();
  x.restore();
  shine(x, r, { a: 0.45, rx: 0.45, ry: 0.3, dot: 0.55 });
}

function pine(x, r) {
  slice(x, r, ['#D9A13A', '#9A5E0C'], (x, R) => {
    circle(x, R); x.fillStyle = '#C98A1E'; x.fill();
    circle(x, R * 0.9);
    x.fillStyle = radial(x, 0, 0, R * 0.9, [[0, '#FFFBD6'], [0.22, '#FFF08A'], [0.6, '#FFDA3A'], [1, '#F5B812']]);
    x.fill();
    x.strokeStyle = 'rgba(230,170,0,.22)'; x.lineWidth = 0.022 * R; x.lineCap = 'round';
    for (let k = 0; k < 44; k++) { const a = (k / 44) * TAU; x.beginPath(); x.moveTo(Math.cos(a) * 0.22 * R, Math.sin(a) * 0.22 * R); x.lineTo(Math.cos(a) * 0.78 * R, Math.sin(a) * 0.78 * R); x.stroke(); }
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * TAU;
      x.fillStyle = 'rgba(170,105,10,.45)';
      circle(x, 0.03 * R, Math.cos(a) * 0.8 * R, Math.sin(a) * 0.8 * R); x.fill();
    }
    x.fillStyle = radial(x, 0, 0, 0.2 * R, [[0, '#FFFBE8'], [0.7, '#FFF4C8'], [1, 'rgba(255,244,200,0)']]);
    circle(x, 0.2 * R); x.fill();
  });
}

function halfMelon(x, r) {
  slice(x, r, ['#3E8A28', '#1E4E12'], (x, R) => {
    circle(x, R); x.fillStyle = '#2C6E1C'; x.fill();
    circle(x, R * 0.94); x.fillStyle = '#9FD45E'; x.fill();
    circle(x, R * 0.89); x.fillStyle = '#F6FBE2'; x.fill();
    circle(x, R * 0.83);
    x.fillStyle = radial(x, -0.05 * R, -0.05 * R, 0.85 * R, [[0, '#FF9A9A'], [0.5, '#F7485A'], [1, '#DC2240']]);
    x.fill();
    for (const [rr, n, off] of [[0.56, 11, 0.2], [0.3, 6, 0.8]]) {
      for (let k = 0; k < n; k++) {
        const a = (k / n) * TAU + off;
        teardrop(x, Math.cos(a) * rr * R, Math.sin(a) * rr * R, a + Math.PI, 0.13 * R, 0.07 * R, '#1C0F08');
      }
    }
  });
}

function melon(x, r) {
  stem(x, [0, -0.92 * r, 0.03 * r, -1.06 * r, 0.12 * r, -1.14 * r], 0.1 * r, '#6E8A2A');
  sphere(x, r, '#C8F08A', '#6CBF3E', '#2E6E1E', 'rgba(0,40,0,.32)');
  // 深色条纹：从上到下，越靠两边越窄
  x.save(); circle(x, r); x.clip();
  for (let i = -4; i <= 4; i++) {
    const x0 = i * 0.235, ph = i * 1.7;
    const L = [], Rr = [];
    for (let t = -1.02; t <= 1.0201; t += 0.03) {
      const env = Math.sqrt(Math.max(0, 1 - t * t));
      const cx = (x0 * env + Math.sin(t * 5 + ph) * 0.025 * env) * r;
      const w = (0.055 + 0.018 * Math.sin(t * 9 + ph * 2)) * env * r;
      L.push([cx - w, t * r]); Rr.push([cx + w, t * r]);
    }
    x.beginPath();
    L.forEach(([a, b], k) => (k ? x.lineTo(a, b) : x.moveTo(a, b)));
    Rr.reverse().forEach(([a, b]) => x.lineTo(a, b));
    x.closePath();
    x.fillStyle = 'rgba(30,85,22,.85)';
    x.fill();
  }
  x.fillStyle = radial(x, 0, 0, r, [[0.7, 'rgba(0,0,0,0)'], [1, 'rgba(0,30,0,.3)']]);
  x.fillRect(-r, -r, 2 * r, 2 * r);
  x.restore();
  shine(x, r, { a: 0.55 });
}

/* ---------- 贴图缓存 ---------- */
const cache = new Map();
function sprite(t, r, dpr) {
  const key = `${t}|${r.toFixed(1)}|${dpr}`;
  if (cache.has(key)) return cache.get(key);
  const c = document.createElement('canvas');
  c.width = c.height = Math.ceil(2 * EXT * r * dpr);
  const x = c.getContext('2d');
  x.scale(dpr, dpr); x.translate(EXT * r, EXT * r);
  // 底下一点点影子，放在一起时更有立体感
  x.fillStyle = radial(x, 0, r * 0.1, r * 1.08, [[0.8, 'rgba(80,40,0,.22)'], [1, 'rgba(80,40,0,0)']]);
  circle(x, r * 1.08, 0, r * 0.1); x.fill();
  LEVELS[t].draw(x, r);
  cache.set(key, c);
  return c;
}

/** 在 (0,0) 画第 t 种水果，半径 r（baseR 是贴图的半径，r 可以在长大的过程中比它小） */
export function drawLevel(ctx, t, r, baseR, dpr) {
  const e = EXT * baseR, k = r / baseR;
  ctx.save();
  ctx.scale(k, k);
  ctx.drawImage(sprite(t, baseR, dpr), -e, -e, 2 * e, 2 * e);
  ctx.restore();
}

export function clearArt() { cache.clear(); }
