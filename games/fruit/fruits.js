// 水果的样子。每种水果画两张图并缓存：
//   skin  整颗（外皮、叶子、蒂）
//   flesh 切面（果皮一圈 + 果肉 + 籽），切开以后两半各露出一半
// 坐标：原点在水果中心，r 是半径，y 向下。光从左上方来。
const TAU = Math.PI * 2;
export const EXT = 2.1; // 贴图边长 = 2 × EXT × r（给叶子、菠萝顶留地方）

function rng(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function rad(x, cx, cy, r1, stops, fx = cx, fy = cy, r0 = 0) {
  const g = x.createRadialGradient(fx, fy, r0, cx, cy, r1);
  stops.forEach(([o, c]) => g.addColorStop(o, c));
  return g;
}
function lin(x, x0, y0, x1, y1, stops) {
  const g = x.createLinearGradient(x0, y0, x1, y1);
  stops.forEach(([o, c]) => g.addColorStop(o, c));
  return g;
}
/** 先缩放再建路径（路径点在建的时候就被变换了） */
function scaled(x, k, pathFn, r, dx = 0, dy = 0) {
  x.save(); x.translate(dx, dy); x.scale(k, k); pathFn(x, r); x.restore();
}
function ellipsePath(rx, ry, cx = 0, cy = 0) {
  return (x, r) => { x.beginPath(); x.ellipse(cx * r, cy * r, rx * r, ry * r, 0, 0, TAU); };
}

/* ---------- 通用的光影 ---------- */
function rimShade(x, r, a = 0.45, color = '0,0,0') {
  x.fillStyle = rad(x, -0.22 * r, -0.26 * r, 1.25 * r, [[0, `rgba(${color},0)`], [0.5, `rgba(${color},0)`], [1, `rgba(${color},${a})`]]);
  x.fillRect(-2 * r, -2 * r, 4 * r, 4 * r);
}
function gloss(x, r, { cx = -0.36, cy = -0.42, rx = 0.38, ry = 0.22, rot = -0.6, a = 0.6, dot = true } = {}) {
  x.save();
  x.translate(cx * r, cy * r); x.rotate(rot); x.scale(1, ry / rx);
  x.fillStyle = rad(x, 0, 0, rx * r, [[0, `rgba(255,255,255,${a})`], [0.55, `rgba(255,255,255,${a * 0.35})`], [1, 'rgba(255,255,255,0)']]);
  x.beginPath(); x.arc(0, 0, rx * r, 0, TAU); x.fill();
  x.restore();
  if (dot) {
    x.fillStyle = `rgba(255,255,255,${Math.min(1, a + 0.25)})`;
    x.beginPath(); x.ellipse((cx - 0.08) * r, (cy - 0.04) * r, 0.06 * r, 0.04 * r, rot, 0, TAU); x.fill();
  }
}
function outline(x, path, r, color = 'rgba(0,0,0,.3)', w = 0.035) {
  path(x, r); x.strokeStyle = color; x.lineWidth = w * r; x.stroke();
}
function dots(x, rnd, n, inside, r, size, colors) {
  for (let i = 0; i < n; i++) {
    const px = (rnd() * 2 - 1) * r, py = (rnd() * 2 - 1) * r;
    if (!inside(px / r, py / r)) continue;
    x.fillStyle = colors[Math.floor(rnd() * colors.length)];
    x.beginPath(); x.arc(px, py, (size[0] + rnd() * (size[1] - size[0])) * r, 0, TAU); x.fill();
  }
}
const inEllipse = (rx, ry) => (u, v) => (u / rx) ** 2 + (v / ry) ** 2 < 0.96;

/** 叶子：从 (x0,y0) 朝 angle 方向长 len，宽 w */
function leaf(x, x0, y0, angle, len, w, c1, c2, vein = true) {
  x.save();
  x.translate(x0, y0); x.rotate(angle);
  x.beginPath();
  x.moveTo(0, 0);
  x.bezierCurveTo(len * 0.3, -w, len * 0.75, -w * 0.8, len, 0);
  x.bezierCurveTo(len * 0.75, w * 0.8, len * 0.3, w, 0, 0);
  x.fillStyle = lin(x, 0, -w, 0, w, [[0, c1], [1, c2]]);
  x.fill();
  if (vein) {
    x.strokeStyle = 'rgba(20,60,10,.35)'; x.lineWidth = Math.max(0.6, w * 0.12);
    x.beginPath(); x.moveTo(len * 0.05, 0); x.quadraticCurveTo(len * 0.5, -w * 0.1, len * 0.92, 0); x.stroke();
  }
  x.restore();
}
/** 种子：水滴形，尖头朝 angle 方向 */
function seed(x, px, py, angle, L, W, color, hl = 0.45) {
  x.save();
  x.translate(px, py); x.rotate(angle);
  x.beginPath();
  x.moveTo(L / 2, 0);
  x.bezierCurveTo(L * 0.2, -W * 0.6, -L / 2, -W * 0.65, -L / 2, 0);
  x.bezierCurveTo(-L / 2, W * 0.65, L * 0.2, W * 0.6, L / 2, 0);
  x.fillStyle = color; x.fill();
  if (hl) { x.fillStyle = `rgba(255,255,255,${hl})`; x.beginPath(); x.ellipse(-L * 0.12, -W * 0.18, L * 0.18, W * 0.14, 0, 0, TAU); x.fill(); }
  x.restore();
}
/** 橙子、柠檬这类的瓣 */
function wedges(x, r, n, rIn, rOut, stops, gap = 0.04) {
  for (let k = 0; k < n; k++) {
    const a0 = (k / n) * TAU + gap, a1 = ((k + 1) / n) * TAU - gap;
    x.beginPath();
    x.moveTo(Math.cos(a0) * rIn * r, Math.sin(a0) * rIn * r);
    x.arc(0, 0, rOut * r, a0, a1);
    x.lineTo(Math.cos(a1) * rIn * r, Math.sin(a1) * rIn * r);
    x.closePath();
    x.fillStyle = rad(x, 0, 0, rOut * r, stops);
    x.fill();
  }
}
function vesicles(x, r, rnd, n, rIn, rOut, color, w = 0.022) {
  x.strokeStyle = color; x.lineWidth = w * r; x.lineCap = 'round';
  for (let k = 0; k < n; k++) {
    const a = rnd() * TAU, r0 = rIn + rnd() * (rOut - rIn) * 0.6, r1 = r0 + 0.08 + rnd() * 0.12;
    x.beginPath();
    x.moveTo(Math.cos(a) * r0 * r, Math.sin(a) * r0 * r);
    x.lineTo(Math.cos(a + 0.03) * Math.min(rOut, r1) * r, Math.sin(a + 0.03) * Math.min(rOut, r1) * r);
    x.stroke();
  }
}
function wet(x, r, a = 0.22, path = null) {
  x.save();
  if (path) { scaled(x, 0.9, path, r); x.clip(); }
  x.fillStyle = rad(x, -0.3 * r, -0.35 * r, 0.9 * r, [[0, `rgba(255,255,255,${a})`], [1, 'rgba(255,255,255,0)']]);
  x.fillRect(-2 * r, -2 * r, 4 * r, 4 * r);
  x.restore();
}

/* ======================================================================
   各种水果
   ====================================================================== */
const melonPath = ellipsePath(1, 0.82);
const orangePath = ellipsePath(0.97, 0.95);
const kiwiPath = ellipsePath(1, 0.84);
const dragonPath = ellipsePath(0.84, 0.98);
const pinePath = ellipsePath(0.78, 0.9, 0, 0.14);
function lemonPath(x, r) {
  x.beginPath();
  x.moveTo(-1.0 * r, 0);
  x.bezierCurveTo(-0.95 * r, -0.12 * r, -0.88 * r, -0.14 * r, -0.82 * r, -0.3 * r);
  x.bezierCurveTo(-0.6 * r, -0.78 * r, 0.6 * r, -0.78 * r, 0.82 * r, -0.3 * r);
  x.bezierCurveTo(0.88 * r, -0.14 * r, 0.95 * r, -0.12 * r, 1.0 * r, 0);
  x.bezierCurveTo(0.95 * r, 0.12 * r, 0.88 * r, 0.14 * r, 0.82 * r, 0.3 * r);
  x.bezierCurveTo(0.6 * r, 0.78 * r, -0.6 * r, 0.78 * r, -0.82 * r, 0.3 * r);
  x.bezierCurveTo(-0.88 * r, 0.14 * r, -0.95 * r, 0.12 * r, -1.0 * r, 0);
  x.closePath();
}
function applePath(x, r) {
  x.beginPath();
  x.moveTo(0, -0.62 * r);
  x.bezierCurveTo(0.35 * r, -1.0 * r, 1.0 * r, -0.86 * r, 0.98 * r, -0.12 * r);
  x.bezierCurveTo(0.97 * r, 0.52 * r, 0.56 * r, 0.96 * r, 0.24 * r, 0.94 * r);
  x.bezierCurveTo(0.1 * r, 0.93 * r, -0.1 * r, 0.93 * r, -0.24 * r, 0.94 * r);
  x.bezierCurveTo(-0.56 * r, 0.96 * r, -0.97 * r, 0.52 * r, -0.98 * r, -0.12 * r);
  x.bezierCurveTo(-1.0 * r, -0.86 * r, -0.35 * r, -1.0 * r, 0, -0.62 * r);
  x.closePath();
}
function berryPath(x, r) {
  x.beginPath();
  x.moveTo(0, -0.74 * r);
  x.bezierCurveTo(0.52 * r, -0.98 * r, 1.0 * r, -0.66 * r, 0.95 * r, -0.08 * r);
  x.bezierCurveTo(0.9 * r, 0.46 * r, 0.38 * r, 0.96 * r, 0, 1.06 * r);
  x.bezierCurveTo(-0.38 * r, 0.96 * r, -0.9 * r, 0.46 * r, -0.95 * r, -0.08 * r);
  x.bezierCurveTo(-1.0 * r, -0.66 * r, -0.52 * r, -0.98 * r, 0, -0.74 * r);
  x.closePath();
}
const berryWidth = (v) => {
  const pts = [[-0.8, 0.5], [-0.62, 0.82], [-0.2, 0.95], [0.3, 0.8], [0.7, 0.48], [1.02, 0.05]];
  if (v <= pts[0][0] || v >= pts[pts.length - 1][0]) return 0;
  for (let i = 1; i < pts.length; i++) if (v < pts[i][0]) { const [a, wa] = pts[i - 1], [b, wb] = pts[i]; return wa + ((v - a) / (b - a)) * (wb - wa); }
  return 0;
};
function peachPath(x, r) {
  x.beginPath();
  x.moveTo(0.04 * r, -0.96 * r);
  x.bezierCurveTo(0.62 * r, -1.0 * r, 1.0 * r, -0.55 * r, 0.98 * r, 0.03 * r);
  x.bezierCurveTo(0.96 * r, 0.6 * r, 0.55 * r, 0.98 * r, 0, 0.98 * r);
  x.bezierCurveTo(-0.55 * r, 0.98 * r, -0.96 * r, 0.6 * r, -0.98 * r, 0.03 * r);
  x.bezierCurveTo(-1.0 * r, -0.55 * r, -0.55 * r, -0.98 * r, 0.04 * r, -0.96 * r);
  x.closePath();
}

export const FRUITS = [
  /* ---------------- 西瓜 ---------------- */
  {
    id: 'melon', name: '西瓜', size: 1.32, hit: 0.95, juice: '#E8293F', seed: 11, path: melonPath,
    skin(x, r, rnd) {
      x.save(); melonPath(x, r); x.clip();
      x.fillStyle = rad(x, -0.3 * r, -0.3 * r, 1.2 * r, [[0, '#BDE36F'], [0.35, '#74B53C'], [0.75, '#3E8023'], [1, '#2A5C17']]);
      x.fillRect(-r, -r, 2 * r, 2 * r);
      // 浅色斑点
      dots(x, rnd, 70, inEllipse(1, 0.82), r, [0.02, 0.06], ['rgba(210,240,150,.12)', 'rgba(30,70,15,.12)']);
      // 深色条纹：从一头到另一头，越到两端越窄
      for (let i = -5; i <= 5; i++) {
        const y0 = i * 0.165, wob = rnd() * 6;
        const top = [], bot = [];
        for (let t = -1; t <= 1.0001; t += 0.025) {
          const env = Math.sqrt(Math.max(0, 1 - t * t));
          const cy = (y0 * env + Math.sin(t * 4.5 + wob) * 0.03 * env) * 0.82;
          const w = (0.058 + 0.02 * Math.sin(t * 7 + wob * 3) + 0.01 * Math.sin(t * 13 + wob)) * env;
          top.push([t * r, (cy - w) * r]); bot.push([t * r, (cy + w) * r]);
        }
        x.beginPath();
        top.forEach(([a, b], k) => (k ? x.lineTo(a, b) : x.moveTo(a, b)));
        bot.reverse().forEach(([a, b]) => x.lineTo(a, b));
        x.closePath();
        x.fillStyle = 'rgba(24,62,14,.92)';
        x.fill();
      }
      rimShade(x, r, 0.5, '0,25,0');
      // 一头的瓜蒂疤
      x.fillStyle = rad(x, 0.96 * r, 0, 0.09 * r, [[0, '#C9B46A'], [1, 'rgba(120,110,40,0)']]);
      x.beginPath(); x.arc(0.96 * r, 0, 0.09 * r, 0, TAU); x.fill();
      gloss(x, r, { cx: -0.34, cy: -0.4, rx: 0.42, ry: 0.17, rot: -0.3, a: 0.5 });
      x.restore();
      outline(x, melonPath, r, 'rgba(10,40,5,.45)');
    },
    flesh(x, r, rnd) {
      melonPath(x, r); x.fillStyle = '#2C6A1B'; x.fill();
      scaled(x, 0.95, melonPath, r); x.fillStyle = '#A8D166'; x.fill();
      scaled(x, 0.9, melonPath, r); x.fillStyle = '#F4F9DC'; x.fill();
      scaled(x, 0.83, melonPath, r);
      x.fillStyle = rad(x, -0.1 * r, -0.1 * r, 0.9 * r, [[0, '#FF8C8C'], [0.5, '#F7404F'], [1, '#D41E3A']]);
      x.fill();
      x.save(); scaled(x, 0.83, melonPath, r); x.clip();
      dots(x, rnd, 90, inEllipse(0.8, 0.66), r, [0.008, 0.02], ['rgba(255,255,255,.22)', 'rgba(255,200,200,.25)']);
      // 籽：外圈一圈，里面再几颗，尖头朝中心
      const rings = [[0.56, 11, 0.3], [0.3, 6, 1.1]];
      for (const [rr, n, off] of rings) {
        for (let k = 0; k < n; k++) {
          const a = (k / n) * TAU + off + (rnd() - 0.5) * 0.25;
          const px = Math.cos(a) * rr * r, py = Math.sin(a) * rr * r * 0.82;
          seed(x, px, py, Math.atan2(-py, -px), 0.12 * r, 0.065 * r, '#1C0F08', 0.45);
        }
      }
      wet(x, r, 0.2, melonPath);
      x.restore();
    },
  },
  /* ---------------- 橙子 ---------------- */
  {
    id: 'orange', name: '橙子', size: 1.0, hit: 0.98, juice: '#FF9A1A', seed: 23, path: orangePath,
    skin(x, r, rnd) {
      x.save(); orangePath(x, r); x.clip();
      x.fillStyle = rad(x, -0.36 * r, -0.4 * r, 1.25 * r, [[0, '#FFD98A'], [0.28, '#FFAD3A'], [0.72, '#F5820C'], [1, '#C25B00']]);
      x.fillRect(-r, -r, 2 * r, 2 * r);
      dots(x, rnd, 420, inEllipse(0.97, 0.95), r, [0.01, 0.022], ['rgba(255,240,200,.24)', 'rgba(170,70,0,.22)', 'rgba(255,200,120,.18)']);
      rimShade(x, r, 0.42, '90,30,0');
      gloss(x, r, { a: 0.62 });
      x.restore();
      // 蒂
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * TAU - 1.2;
        x.fillStyle = '#5E8A22';
        x.beginPath(); x.ellipse(0.06 * r + Math.cos(a) * 0.06 * r, -0.84 * r + Math.sin(a) * 0.04 * r, 0.06 * r, 0.025 * r, a, 0, TAU); x.fill();
      }
      x.fillStyle = '#7A9A30'; x.beginPath(); x.arc(0.06 * r, -0.84 * r, 0.035 * r, 0, TAU); x.fill();
      outline(x, orangePath, r, 'rgba(120,50,0,.35)');
    },
    flesh(x, r, rnd) {
      orangePath(x, r); x.fillStyle = '#F28A1E'; x.fill();
      scaled(x, 0.9, orangePath, r); x.fillStyle = '#FFF1D2'; x.fill();
      wedges(x, r, 10, 0.08, 0.83, [[0, '#FFD98A'], [0.55, '#FFAE33'], [1, '#FF9416']], 0.035);
      vesicles(x, r, rnd, 90, 0.18, 0.8, 'rgba(255,240,190,.5)');
      x.fillStyle = '#FFF1D2'; x.beginPath(); x.arc(0, 0, 0.08 * r, 0, TAU); x.fill();
      for (let k = 0; k < 2; k++) seed(x, Math.cos(k * 3 + 1) * 0.42 * r, Math.sin(k * 3 + 1) * 0.42 * r, k * 3 + 1, 0.11 * r, 0.06 * r, '#FFF6DF', 0.3);
      wet(x, r, 0.22, orangePath);
    },
  },
  /* ---------------- 柠檬 ---------------- */
  {
    id: 'lemon', name: '柠檬', size: 0.92, hit: 0.92, juice: '#FFE03A', seed: 37, path: lemonPath,
    skin(x, r, rnd) {
      x.save(); lemonPath(x, r); x.clip();
      x.fillStyle = rad(x, -0.32 * r, -0.32 * r, 1.15 * r, [[0, '#FFF7A8'], [0.32, '#FFE452'], [0.75, '#F2C511'], [1, '#C29200']]);
      x.fillRect(-r, -r, 2 * r, 2 * r);
      dots(x, rnd, 320, (u, v) => Math.abs(v) < 0.75, r, [0.01, 0.02], ['rgba(255,255,220,.28)', 'rgba(170,120,0,.2)']);
      rimShade(x, r, 0.4, '100,70,0');
      gloss(x, r, { cx: -0.3, cy: -0.32, rx: 0.36, ry: 0.16, rot: -0.25, a: 0.65 });
      x.restore();
      outline(x, lemonPath, r, 'rgba(120,90,0,.35)');
    },
    flesh(x, r, rnd) {
      lemonPath(x, r); x.fillStyle = '#EFC414'; x.fill();
      scaled(x, 0.9, lemonPath, r); x.fillStyle = '#FFFBE4'; x.fill();
      x.save(); x.scale(1, 0.78);
      wedges(x, r, 8, 0.07, 0.8, [[0, '#FFF8C2'], [0.6, '#FFEB66'], [1, '#FFE03A']], 0.045);
      vesicles(x, r, rnd, 70, 0.16, 0.76, 'rgba(255,255,230,.55)');
      x.fillStyle = '#FFFBE4'; x.beginPath(); x.arc(0, 0, 0.07 * r, 0, TAU); x.fill();
      x.restore();
      wet(x, r, 0.22, lemonPath);
    },
  },
  /* ---------------- 苹果 ---------------- */
  {
    id: 'apple', name: '苹果', size: 1.0, hit: 0.96, juice: '#F2E1A2', seed: 41, path: applePath,
    skin(x, r, rnd) {
      x.save(); applePath(x, r); x.clip();
      x.fillStyle = rad(x, -0.34 * r, -0.3 * r, 1.25 * r, [[0, '#FF9488'], [0.22, '#F5443D'], [0.68, '#C3131F'], [1, '#7A0915']]);
      x.fillRect(-r, -r, 2 * r, 2 * r);
      // 顺着果子的浅色纹路
      x.lineCap = 'round';
      for (let k = 0; k < 16; k++) {
        const s = (k / 15) * 2 - 1;
        x.strokeStyle = `rgba(255,205,110,${0.08 + rnd() * 0.1})`;
        x.lineWidth = (0.03 + rnd() * 0.04) * r;
        x.beginPath();
        x.moveTo(s * 0.18 * r, -0.6 * r);
        x.bezierCurveTo(s * 1.05 * r, -0.4 * r, s * 0.95 * r, 0.5 * r, s * 0.3 * r, 0.9 * r);
        x.stroke();
      }
      dots(x, rnd, 120, (u, v) => u * u + v * v < 0.9, r, [0.008, 0.016], ['rgba(255,235,190,.35)']);
      // 蒂附近凹下去的阴影
      x.fillStyle = rad(x, 0, -0.6 * r, 0.4 * r, [[0, 'rgba(70,0,8,.55)'], [1, 'rgba(70,0,8,0)']]);
      x.fillRect(-r, -r, 2 * r, 2 * r);
      rimShade(x, r, 0.45, '50,0,5');
      gloss(x, r, { cx: -0.4, cy: -0.32, rx: 0.3, ry: 0.22, rot: -0.7, a: 0.65 });
      x.restore();
      outline(x, applePath, r, 'rgba(60,0,8,.4)');
      // 蒂和叶子
      x.lineCap = 'round';
      x.strokeStyle = '#5A3A1E'; x.lineWidth = 0.09 * r;
      x.beginPath(); x.moveTo(0, -0.6 * r); x.quadraticCurveTo(0.02 * r, -0.9 * r, 0.14 * r, -1.08 * r); x.stroke();
      x.strokeStyle = 'rgba(255,220,170,.35)'; x.lineWidth = 0.03 * r;
      x.beginPath(); x.moveTo(-0.02 * r, -0.66 * r); x.quadraticCurveTo(0, -0.9 * r, 0.1 * r, -1.04 * r); x.stroke();
      leaf(x, 0.06 * r, -0.86 * r, -0.55, 0.62 * r, 0.2 * r, '#8EDB5A', '#2F8A2E');
    },
    flesh(x, r, rnd) {
      applePath(x, r); x.fillStyle = '#B5121F'; x.fill();
      scaled(x, 0.93, applePath, r, 0, 0.01 * r);
      x.fillStyle = rad(x, 0, 0, 0.95 * r, [[0, '#FFFDF2'], [0.65, '#FBF0CB'], [1, '#F0DB9C']]);
      x.fill();
      // 果核
      x.strokeStyle = 'rgba(190,160,80,.5)'; x.lineWidth = 0.025 * r;
      x.beginPath();
      for (let k = 0; k <= 60; k++) {
        const a = (k / 60) * TAU, rr = (0.2 + 0.07 * Math.cos(a * 5)) * r;
        const px = Math.cos(a) * rr, py = Math.sin(a) * rr + 0.05 * r;
        if (k) x.lineTo(px, py); else x.moveTo(px, py);
      }
      x.closePath(); x.stroke();
      x.fillStyle = 'rgba(235,215,150,.35)'; x.fill();
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * TAU - Math.PI / 2;
        seed(x, Math.cos(a) * 0.15 * r, Math.sin(a) * 0.15 * r + 0.05 * r, a, 0.12 * r, 0.065 * r, '#5B2E12', 0.4);
      }
      x.strokeStyle = 'rgba(200,175,100,.35)'; x.lineWidth = 0.02 * r;
      x.beginPath(); x.moveTo(0, -0.55 * r); x.lineTo(0, -0.18 * r); x.stroke();
      wet(x, r, 0.25, applePath);
    },
  },
  /* ---------------- 猕猴桃 ---------------- */
  {
    id: 'kiwi', name: '猕猴桃', size: 0.86, hit: 0.95, juice: '#8FCB2E', seed: 53, path: kiwiPath,
    skin(x, r, rnd) {
      x.save(); kiwiPath(x, r); x.clip();
      x.fillStyle = rad(x, -0.3 * r, -0.3 * r, 1.2 * r, [[0, '#C29060'], [0.45, '#8F5D2E'], [1, '#553313']]);
      x.fillRect(-r, -r, 2 * r, 2 * r);
      // 绒毛
      x.lineCap = 'round';
      for (let i = 0; i < 900; i++) {
        const px = (rnd() * 2 - 1) * r, py = (rnd() * 2 - 1) * r * 0.84;
        if ((px / r) ** 2 + (py / (0.84 * r)) ** 2 > 1) continue;
        const a = Math.atan2(py, px) + (rnd() - 0.5) * 1.6, L = (0.025 + rnd() * 0.04) * r;
        x.strokeStyle = rnd() < 0.55 ? 'rgba(55,30,10,.35)' : 'rgba(220,180,125,.22)';
        x.lineWidth = Math.max(0.5, 0.012 * r);
        x.beginPath(); x.moveTo(px, py); x.lineTo(px + Math.cos(a) * L, py + Math.sin(a) * L); x.stroke();
      }
      rimShade(x, r, 0.5, '30,15,0');
      gloss(x, r, { a: 0.3, dot: false, rx: 0.45, ry: 0.25 });
      x.fillStyle = rad(x, 0.97 * r, 0, 0.1 * r, [[0, '#3B2410'], [1, 'rgba(59,36,16,0)']]);
      x.beginPath(); x.arc(0.97 * r, 0, 0.1 * r, 0, TAU); x.fill();
      x.restore();
      outline(x, kiwiPath, r, 'rgba(40,20,5,.45)');
    },
    flesh(x, r, rnd) {
      kiwiPath(x, r); x.fillStyle = '#6B4423'; x.fill();
      scaled(x, 0.94, kiwiPath, r);
      x.fillStyle = rad(x, 0, 0, 0.95 * r, [[0, '#F6FCE4'], [0.18, '#E2F2AE'], [0.42, '#A2D44C'], [0.85, '#6FB222'], [1, '#5B9A17']]);
      x.fill();
      x.save(); x.scale(1, 0.84);
      x.strokeStyle = 'rgba(255,255,230,.16)'; x.lineWidth = 0.015 * r;
      for (let k = 0; k < 56; k++) {
        const a = (k / 56) * TAU + rnd() * 0.05;
        x.beginPath(); x.moveTo(Math.cos(a) * 0.2 * r, Math.sin(a) * 0.2 * r); x.lineTo(Math.cos(a) * 0.88 * r, Math.sin(a) * 0.88 * r); x.stroke();
      }
      for (let k = 0; k < 46; k++) {
        const a = (k / 46) * TAU + (rnd() - 0.5) * 0.1, rr = (0.27 + rnd() * 0.1) * r;
        seed(x, Math.cos(a) * rr, Math.sin(a) * rr, a, 0.07 * r, 0.03 * r, '#16140A', 0.25);
      }
      x.fillStyle = rad(x, 0, 0, 0.19 * r, [[0, 'rgba(255,255,245,.95)'], [0.7, 'rgba(250,255,235,.85)'], [1, 'rgba(250,255,235,0)']]);
      x.beginPath(); x.ellipse(0, 0, 0.19 * r, 0.15 * r, 0, 0, TAU); x.fill();
      x.restore();
      wet(x, r, 0.18, kiwiPath);
    },
  },
  /* ---------------- 草莓 ---------------- */
  {
    id: 'berry', name: '草莓', size: 0.84, hit: 0.98, juice: '#E5173A', seed: 67, path: berryPath,
    skin(x, r, rnd) {
      x.save(); berryPath(x, r); x.clip();
      x.fillStyle = rad(x, -0.26 * r, -0.28 * r, 1.25 * r, [[0, '#FF97A0'], [0.28, '#FF3450'], [0.72, '#D10F2E'], [1, '#880A1E']]);
      x.fillRect(-r, -1.2 * r, 2 * r, 2.4 * r);
      // 籽：错开排列，靠边的小一点（看起来是圆的）
      for (let j = -6; j <= 8; j++) {
        for (let i = -6; i <= 6; i++) {
          const u = i * 0.19 + (j % 2 ? 0.095 : 0), v = j * 0.16 - 0.55;
          if (Math.abs(u) > berryWidth(v) * 0.86) continue;
          const d = Math.min(1, Math.hypot(u, v * 0.9));
          const k = 1 - 0.45 * d * d;
          const px = u * r, py = v * r;
          x.fillStyle = 'rgba(110,0,22,.45)';
          x.beginPath(); x.ellipse(px, py + 0.01 * r, 0.06 * r * k, 0.045 * r * k, 0, 0, TAU); x.fill();
          seed(x, px, py, Math.PI / 2, 0.06 * r * k, 0.036 * r * k, '#FFE27A', 0.5);
        }
      }
      rimShade(x, r, 0.42, '60,0,10');
      gloss(x, r, { cx: -0.34, cy: -0.34, rx: 0.3, ry: 0.2, rot: -0.7, a: 0.55 });
      x.restore();
      outline(x, berryPath, r, 'rgba(70,0,12,.4)');
      // 叶子
      const leaves = [-2.95, -2.5, -2.05, -1.1, -0.65, -0.2, 2.75, 0.4];
      leaves.forEach((a, i) => leaf(x, 0, -0.72 * r, a, (0.42 + (i % 3) * 0.06) * r, 0.13 * r, i % 2 ? '#7DD957' : '#5CC24A', '#23743A', false));
      x.strokeStyle = '#3D8B34'; x.lineWidth = 0.07 * r; x.lineCap = 'round';
      x.beginPath(); x.moveTo(0, -0.76 * r); x.quadraticCurveTo(0.02 * r, -0.95 * r, 0.08 * r, -1.05 * r); x.stroke();
    },
    flesh(x, r, rnd) {
      berryPath(x, r); x.fillStyle = '#D9122F'; x.fill();
      scaled(x, 0.9, berryPath, r, 0, 0.03 * r);
      x.fillStyle = rad(x, 0, 0, 0.95 * r, [[0, '#FFF4F4'], [0.3, '#FFC4CC'], [0.72, '#FF5C72'], [1, '#E8233F']]);
      x.fill();
      x.strokeStyle = 'rgba(232,35,63,.3)'; x.lineWidth = 0.03 * r; x.lineCap = 'round';
      for (let k = 0; k < 18; k++) {
        const a = (k / 18) * TAU;
        x.beginPath(); x.moveTo(Math.cos(a) * 0.2 * r, Math.sin(a) * 0.2 * r + 0.05 * r);
        x.lineTo(Math.cos(a) * 0.62 * r, Math.sin(a) * 0.62 * r * 1.05 + 0.05 * r); x.stroke();
      }
      scaled(x, 0.36, berryPath, r, 0, 0.05 * r);
      x.fillStyle = 'rgba(255,255,255,.7)'; x.fill();
      for (let k = 0; k < 20; k++) {
        const t = (k / 20) * TAU, v = Math.sin(t) * 0.82 + 0.1, u = Math.cos(t) * berryWidth(v) * 0.78;
        x.fillStyle = 'rgba(255,230,150,.9)';
        x.beginPath(); x.arc(u * r, v * r, 0.022 * r, 0, TAU); x.fill();
      }
      wet(x, r, 0.2, berryPath);
    },
  },
  /* ---------------- 菠萝 ---------------- */
  {
    id: 'pine', name: '菠萝', size: 1.08, hit: 0.95, juice: '#FFD12E', seed: 79, path: pinePath,
    skin(x, r, rnd) {
      // 先画叶子（后面的颜色深一点）
      const crown = [[-2.45, 0.7, 1], [-0.7, 0.7, 1], [-2.2, 0.9, 0], [-0.95, 0.9, 0], [-1.9, 1.05, 0], [-1.25, 1.05, 0], [-1.57, 1.15, 0], [-1.72, 0.85, 1], [-1.42, 0.85, 1]];
      crown.forEach(([a, len, back]) => leaf(x, (a + 1.57) * 0.08 * r, -0.62 * r, a, len * r, 0.13 * r, back ? '#4E9F3D' : '#8DD65C', back ? '#1C5520' : '#2E7D32'));
      x.save(); pinePath(x, r); x.clip();
      x.fillStyle = rad(x, -0.28 * r, -0.2 * r, 1.15 * r, [[0, '#FFE58A'], [0.38, '#F5B53B'], [0.78, '#D48414'], [1, '#93540A']]);
      x.fillRect(-r, -r, 2 * r, 2.4 * r);
      // 菱形格子
      const s = 0.26 * r, c = Math.cos(0.85), sn = Math.sin(0.85);
      x.strokeStyle = 'rgba(115,60,5,.55)'; x.lineWidth = 0.035 * r;
      for (let k = -8; k <= 8; k++) {
        for (const dir of [1, -1]) {
          x.beginPath();
          x.moveTo(k * s / c - 2 * r * dir * sn / c, -2 * r);
          x.lineTo(k * s / c + 2 * r * dir * sn / c, 2 * r);
          x.stroke();
        }
      }
      // 每格里的小刺
      for (let i = -7; i <= 7; i++) {
        for (let j = -7; j <= 7; j++) {
          const px = (i + j) * s * 0.62, py = (j - i) * s * 0.85 + 0.14 * r;
          if ((px / (0.78 * r)) ** 2 + ((py - 0.14 * r) / (0.9 * r)) ** 2 > 0.92) continue;
          x.fillStyle = 'rgba(120,65,5,.6)';
          x.beginPath(); x.moveTo(px, py - 0.04 * r); x.lineTo(px + 0.035 * r, py + 0.03 * r); x.lineTo(px - 0.035 * r, py + 0.03 * r); x.closePath(); x.fill();
          x.fillStyle = 'rgba(255,240,170,.45)';
          x.beginPath(); x.arc(px - 0.02 * r, py - 0.06 * r, 0.018 * r, 0, TAU); x.fill();
        }
      }
      rimShade(x, r, 0.45, '70,35,0');
      gloss(x, r, { cx: -0.3, cy: -0.2, rx: 0.3, ry: 0.22, rot: -0.9, a: 0.45 });
      x.restore();
      outline(x, pinePath, r, 'rgba(90,45,0,.4)');
    },
    flesh(x, r, rnd) {
      pinePath(x, r); x.fillStyle = '#B5720F'; x.fill();
      scaled(x, 0.9, pinePath, r, 0, 0.014 * r);
      x.fillStyle = rad(x, 0, 0.14 * r, 0.9 * r, [[0, '#FFFBD8'], [0.22, '#FFF27E'], [0.68, '#FFD93B'], [1, '#F2B90F']]);
      x.fill();
      x.strokeStyle = 'rgba(225,165,0,.25)'; x.lineWidth = 0.02 * r;
      for (let k = 0; k < 64; k++) {
        const a = (k / 64) * TAU + rnd() * 0.04;
        x.beginPath(); x.moveTo(Math.cos(a) * 0.17 * r, 0.14 * r + Math.sin(a) * 0.21 * r);
        x.lineTo(Math.cos(a) * 0.66 * r, 0.14 * r + Math.sin(a) * 0.78 * r); x.stroke();
      }
      x.fillStyle = 'rgba(255,250,220,.95)';
      x.beginPath(); x.ellipse(0, 0.14 * r, 0.15 * r, 0.19 * r, 0, 0, TAU); x.fill();
      for (let k = 0; k < 18; k++) {
        const a = (k / 18) * TAU;
        x.fillStyle = 'rgba(150,90,10,.5)';
        x.beginPath(); x.arc(Math.cos(a) * 0.62 * r, 0.14 * r + Math.sin(a) * 0.72 * r, 0.028 * r, 0, TAU); x.fill();
      }
      wet(x, r, 0.18, pinePath);
    },
  },
  /* ---------------- 火龙果 ---------------- */
  {
    id: 'dragon', name: '火龙果', size: 1.02, hit: 0.92, juice: '#F6B9D2', seed: 97, path: dragonPath,
    skin(x, r, rnd) {
      x.save(); dragonPath(x, r); x.clip();
      x.fillStyle = rad(x, -0.3 * r, -0.32 * r, 1.25 * r, [[0, '#FFA2CD'], [0.32, '#FF3D92'], [0.78, '#D3136A'], [1, '#8E0944']]);
      x.fillRect(-r, -r, 2 * r, 2 * r);
      rimShade(x, r, 0.42, '70,0,30');
      gloss(x, r, { cx: -0.3, cy: -0.4, rx: 0.3, ry: 0.2, rot: -0.8, a: 0.5 });
      x.restore();
      outline(x, dragonPath, r, 'rgba(90,0,40,.4)');
      // 鳞片：粉色的底，尖上是绿色，往外翘
      const scales = [[-0.48, -0.62, -2.3], [0.4, -0.66, -0.9], [-0.78, -0.12, -2.8], [0.0, -0.3, -1.7], [0.74, -0.18, -0.35],
        [-0.42, 0.25, -2.6], [0.36, 0.2, -0.6], [-0.7, 0.58, 2.7], [0.05, 0.6, -1.4], [0.66, 0.6, 0.35], [-0.1, -0.9, -1.75], [0.18, -0.9, -1.3]];
      for (const [u, v, a] of scales) {
        const px = u * r, py = v * r, L = 0.42 * r, W = 0.15 * r;
        x.save(); x.translate(px, py); x.rotate(a);
        x.beginPath();
        x.moveTo(-0.05 * L, 0);
        x.bezierCurveTo(L * 0.3, -W, L * 0.7, -W * 0.6, L, -W * 0.1);
        x.bezierCurveTo(L * 0.7, W * 0.4, L * 0.3, W * 0.8, -0.05 * L, 0);
        x.fillStyle = lin(x, 0, 0, L, 0, [[0, '#FF4FA0'], [0.55, '#E3307C'], [0.8, '#A7D84E'], [1, '#4FA83D']]);
        x.fill();
        x.strokeStyle = 'rgba(120,0,50,.35)'; x.lineWidth = 0.02 * r; x.stroke();
        x.fillStyle = 'rgba(255,255,255,.3)';
        x.beginPath(); x.ellipse(L * 0.35, -W * 0.3, L * 0.2, W * 0.16, -0.1, 0, TAU); x.fill();
        x.restore();
      }
    },
    flesh(x, r, rnd) {
      dragonPath(x, r); x.fillStyle = '#E0186F'; x.fill();
      scaled(x, 0.93, dragonPath, r);
      x.fillStyle = rad(x, 0, 0, 0.95 * r, [[0, '#FFFFFF'], [0.72, '#FFF5F8'], [1, '#FFD9E7']]);
      x.fill();
      for (let i = 0; i < 360; i++) {
        const px = (rnd() * 2 - 1) * 0.76 * r, py = (rnd() * 2 - 1) * 0.9 * r;
        if ((px / (0.76 * r)) ** 2 + (py / (0.9 * r)) ** 2 > 0.92) continue;
        const a = rnd() * TAU;
        x.fillStyle = 'rgba(0,0,0,.06)';
        x.beginPath(); x.arc(px, py, 0.035 * r, 0, TAU); x.fill();
        x.fillStyle = '#141012';
        x.beginPath(); x.ellipse(px, py, 0.026 * r, 0.016 * r, a, 0, TAU); x.fill();
      }
      wet(x, r, 0.25, dragonPath);
    },
  },
  /* ---------------- 桃子 ---------------- */
  {
    id: 'peach', name: '桃子', size: 1.0, hit: 0.96, juice: '#FFB25C', seed: 101, path: peachPath,
    skin(x, r, rnd) {
      x.save(); peachPath(x, r); x.clip();
      x.fillStyle = rad(x, -0.3 * r, -0.36 * r, 1.25 * r, [[0, '#FFEBC0'], [0.3, '#FFC77E'], [0.62, '#FF955C'], [1, '#D2483A']]);
      x.fillRect(-r, -r, 2 * r, 2 * r);
      x.fillStyle = rad(x, 0.36 * r, 0.15 * r, 0.9 * r, [[0, 'rgba(232,40,72,.6)'], [0.6, 'rgba(232,40,72,.25)'], [1, 'rgba(232,40,72,0)']]);
      x.fillRect(-r, -r, 2 * r, 2 * r);
      dots(x, rnd, 360, (u, v) => u * u + v * v < 0.95, r, [0.006, 0.014], ['rgba(255,255,255,.1)', 'rgba(255,235,210,.12)']);
      // 中间那道沟
      x.lineCap = 'round';
      x.strokeStyle = 'rgba(150,35,40,.35)'; x.lineWidth = 0.05 * r;
      x.beginPath(); x.moveTo(0.04 * r, -0.94 * r); x.bezierCurveTo(-0.18 * r, -0.4 * r, -0.12 * r, 0.25 * r, 0.12 * r, 0.62 * r); x.stroke();
      x.strokeStyle = 'rgba(255,230,205,.35)'; x.lineWidth = 0.025 * r;
      x.beginPath(); x.moveTo(-0.02 * r, -0.9 * r); x.bezierCurveTo(-0.24 * r, -0.4 * r, -0.18 * r, 0.25 * r, 0.06 * r, 0.62 * r); x.stroke();
      rimShade(x, r, 0.3, '80,10,10');
      gloss(x, r, { cx: -0.38, cy: -0.36, rx: 0.42, ry: 0.28, rot: -0.7, a: 0.32, dot: false });
      x.restore();
      outline(x, peachPath, r, 'rgba(100,20,20,.32)');
      x.strokeStyle = '#6A4426'; x.lineWidth = 0.07 * r; x.lineCap = 'round';
      x.beginPath(); x.moveTo(0.04 * r, -0.93 * r); x.lineTo(0.08 * r, -1.06 * r); x.stroke();
      leaf(x, 0.07 * r, -1.0 * r, -0.35, 0.55 * r, 0.18 * r, '#8EDB5A', '#2F8A2E');
    },
    flesh(x, r, rnd) {
      peachPath(x, r); x.fillStyle = '#E8604A'; x.fill();
      scaled(x, 0.93, peachPath, r);
      x.fillStyle = rad(x, 0, 0, 0.95 * r, [[0, '#FF8D57'], [0.32, '#FFB760'], [0.72, '#FFD98C'], [1, '#FFC66C']]);
      x.fill();
      x.fillStyle = rad(x, 0, 0, 0.55 * r, [[0, 'rgba(220,55,40,.55)'], [1, 'rgba(220,55,40,0)']]);
      x.fillRect(-r, -r, 2 * r, 2 * r);
      vesicles(x, r, rnd, 50, 0.4, 0.85, 'rgba(255,235,170,.35)', 0.018);
      x.save();
      x.rotate(0.2);
      x.beginPath(); x.ellipse(0, 0, 0.26 * r, 0.36 * r, 0, 0, TAU);
      x.fillStyle = rad(x, -0.08 * r, -0.1 * r, 0.4 * r, [[0, '#B5693A'], [1, '#6B3416']]);
      x.fill();
      x.clip();
      x.strokeStyle = 'rgba(60,25,8,.6)'; x.lineWidth = 0.025 * r;
      for (let k = 0; k < 9; k++) {
        const yy = (-0.32 + k * 0.08) * r;
        x.beginPath(); x.moveTo(-0.3 * r, yy);
        for (let t = -0.3; t <= 0.3; t += 0.06) x.lineTo(t * r, yy + Math.sin(t * 30 + k) * 0.025 * r);
        x.stroke();
      }
      x.restore();
      wet(x, r, 0.22, peachPath);
    },
  },
];

/* ======================================================================
   炸弹（引线上的火花在游戏里每帧画）
   ====================================================================== */
export function drawBombBody(x, r) {
  x.fillStyle = rad(x, 0, 0, 0.95 * r, [[0, '#2A2D33'], [1, '#0A0B0E']], -0.3 * r, -0.36 * r);
  x.beginPath(); x.arc(0, 0, 0.9 * r, 0, TAU); x.fill();
  x.fillStyle = rad(x, 0.1 * r, 0.1 * r, 0.95 * r, [[0, 'rgba(0,0,0,0)'], [0.75, 'rgba(0,0,0,0)'], [1, 'rgba(255,60,40,.35)']]);
  x.beginPath(); x.arc(0, 0, 0.9 * r, 0, TAU); x.fill();
  gloss(x, r * 0.9, { cx: -0.38, cy: -0.42, rx: 0.32, ry: 0.2, rot: -0.7, a: 0.55 });
  // 金属盖
  x.fillStyle = lin(x, -0.22 * r, 0, 0.22 * r, 0, [[0, '#5D636C'], [0.4, '#C9CED6'], [1, '#4A4F57']]);
  x.beginPath(); x.roundRect(-0.2 * r, -1.02 * r, 0.4 * r, 0.22 * r, 0.05 * r); x.fill();
  // 引线
  x.strokeStyle = '#8C6A3C'; x.lineWidth = 0.08 * r; x.lineCap = 'round';
  x.beginPath(); x.moveTo(0, -1.0 * r); x.quadraticCurveTo(0.06 * r, -1.3 * r, 0.32 * r, -1.36 * r); x.stroke();
  x.strokeStyle = 'rgba(255,230,180,.35)'; x.lineWidth = 0.025 * r;
  x.beginPath(); x.moveTo(-0.02 * r, -1.02 * r); x.quadraticCurveTo(0.03 * r, -1.28 * r, 0.3 * r, -1.33 * r); x.stroke();
  // 红色的 ×
  x.strokeStyle = 'rgba(255,70,50,.9)'; x.lineWidth = 0.1 * r;
  x.beginPath(); x.moveTo(-0.22 * r, -0.12 * r); x.lineTo(0.22 * r, 0.32 * r); x.moveTo(0.22 * r, -0.12 * r); x.lineTo(-0.22 * r, 0.32 * r); x.stroke();
}
export const FUSE_TIP = [0.32, -1.36];

/* ======================================================================
   贴图缓存
   ====================================================================== */
const cache = new Map();
function canvasFor(r, dpr, draw) {
  const size = Math.ceil(2 * EXT * r * dpr);
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const x = c.getContext('2d');
  x.scale(dpr, dpr);
  x.translate(EXT * r, EXT * r);
  draw(x);
  return c;
}
export function spritesFor(i, r, dpr) {
  const key = `${i}|${r.toFixed(1)}|${dpr}`;
  if (cache.has(key)) return cache.get(key);
  const f = FRUITS[i];
  const out = {
    skin: canvasFor(r, dpr, (x) => f.skin(x, r, rng(f.seed))),
    flesh: canvasFor(r, dpr, (x) => f.flesh(x, r, rng(f.seed + 1))),
  };
  cache.set(key, out);
  return out;
}
export function bombSprite(r, dpr) {
  const key = `bomb|${r.toFixed(1)}|${dpr}`;
  if (!cache.has(key)) cache.set(key, canvasFor(r, dpr, (x) => drawBombBody(x, r)));
  return cache.get(key);
}
export const clearSprites = () => cache.clear();
