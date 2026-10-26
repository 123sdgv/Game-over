// 合成大西瓜的 11 种水果：从小到大，两个一样的合成下一个。
// 大部分直接用切水果里画好的（整颗或者切面），葡萄和樱桃是新画的。
import { FRUITS, EXT, spritesFor, rng, rad, gloss, rimShade, leaf } from '../fruit/fruits.js';

const TAU = Math.PI * 2;
const fi = (id) => FRUITS.findIndex((f) => f.id === id);

// r：半径占场地宽度的比例；src：[切水果里的水果, 'skin' 整颗 | 'flesh' 切面]；sx/sy/dy：把它摆成圆的
export const LEVELS = [
  { name: '葡萄', r: 0.046, color: '#9B4DCA', own: 'grape' },
  { name: '樱桃', r: 0.063, color: '#D7263D', own: 'cherry' },
  { name: '橙子', r: 0.081, color: '#FF9A1A', src: ['orange', 'skin'], sx: 1.03, sy: 1.05 },
  { name: '柠檬', r: 0.096, color: '#FFD93A', src: ['lemon', 'skin'], sx: 1.06, sy: 1.28 },
  { name: '猕猴桃', r: 0.116, color: '#8FCB2E', src: ['kiwi', 'flesh'], sx: 1.0, sy: 1.18 },
  { name: '苹果', r: 0.135, color: '#E0182F', src: ['apple', 'skin'], sx: 1.0, sy: 1.04 },
  { name: '桃子', r: 0.153, color: '#FFAE5C', src: ['peach', 'skin'], sx: 1.02, sy: 1.02 },
  { name: '菠萝', r: 0.176, color: '#FFD12E', src: ['pine', 'flesh'], sx: 1.27, sy: 1.1, dy: -0.155 },
  { name: '火龙果', r: 0.2, color: '#F0287D', src: ['dragon', 'skin'], sx: 1.17, sy: 1.02 },
  { name: '半个西瓜', r: 0.226, color: '#E8293F', src: ['melon', 'flesh'], sx: 1.0, sy: 1.22 },
  { name: '大西瓜', r: 0.262, color: '#3E9B32', src: ['melon', 'skin'], sx: 1.0, sy: 1.22 },
];
export const LAST = LEVELS.length - 1;

/* ---------- 新画的两种 ---------- */
function grape(x, r, rnd) {
  const body = (c, rr) => { c.beginPath(); c.arc(0, 0, rr, 0, TAU); };
  // 果梗
  x.strokeStyle = '#6B4A22'; x.lineWidth = 0.1 * r; x.lineCap = 'round';
  x.beginPath(); x.moveTo(0, -0.9 * r); x.quadraticCurveTo(0.02 * r, -1.12 * r, 0.14 * r, -1.24 * r); x.stroke();
  x.save(); body(x, r); x.clip();
  x.fillStyle = rad(x, -0.32 * r, -0.34 * r, 1.25 * r, [[0, '#E2B8F7'], [0.22, '#B06BE0'], [0.66, '#7231A8'], [1, '#3A0F5E']]);
  x.fillRect(-r, -r, 2 * r, 2 * r);
  // 葡萄表面那层白霜
  for (let i = 0; i < 140; i++) {
    const a = rnd() * TAU, d = Math.sqrt(rnd()) * r;
    x.fillStyle = `rgba(235,220,255,${0.05 + rnd() * 0.08})`;
    x.beginPath(); x.arc(Math.cos(a) * d, Math.sin(a) * d, (0.02 + rnd() * 0.05) * r, 0, TAU); x.fill();
  }
  rimShade(x, r, 0.5, '30,0,50');
  gloss(x, r, { cx: -0.34, cy: -0.38, rx: 0.34, ry: 0.22, rot: -0.7, a: 0.7 });
  x.restore();
  x.fillStyle = 'rgba(60,20,90,.55)'; x.beginPath(); x.ellipse(0, -0.9 * r, 0.1 * r, 0.05 * r, 0, 0, TAU); x.fill();
  body(x, r); x.strokeStyle = 'rgba(40,0,60,.45)'; x.lineWidth = 0.04 * r; x.stroke();
}

function cherryPath(x, r) {
  x.beginPath();
  x.moveTo(0, -0.7 * r);
  x.bezierCurveTo(0.32 * r, -1.0 * r, 1.0 * r, -0.88 * r, 0.98 * r, -0.08 * r);
  x.bezierCurveTo(0.96 * r, 0.62 * r, 0.5 * r, 0.98 * r, 0, 0.98 * r);
  x.bezierCurveTo(-0.5 * r, 0.98 * r, -0.96 * r, 0.62 * r, -0.98 * r, -0.08 * r);
  x.bezierCurveTo(-1.0 * r, -0.88 * r, -0.32 * r, -1.0 * r, 0, -0.7 * r);
  x.closePath();
}
function cherry(x, r) {
  // 长长的果梗和一片小叶子
  x.lineCap = 'round';
  x.strokeStyle = '#4E7A24'; x.lineWidth = 0.09 * r;
  x.beginPath(); x.moveTo(0, -0.66 * r); x.bezierCurveTo(0.05 * r, -1.1 * r, 0.25 * r, -1.4 * r, 0.5 * r, -1.62 * r); x.stroke();
  x.strokeStyle = 'rgba(200,230,150,.5)'; x.lineWidth = 0.03 * r;
  x.beginPath(); x.moveTo(-0.02 * r, -0.72 * r); x.bezierCurveTo(0.02 * r, -1.1 * r, 0.2 * r, -1.38 * r, 0.45 * r, -1.58 * r); x.stroke();
  leaf(x, 0.48 * r, -1.6 * r, -0.2, 0.62 * r, 0.2 * r, '#8EDB5A', '#2F8A2E');
  x.save(); cherryPath(x, r); x.clip();
  x.fillStyle = rad(x, -0.3 * r, -0.3 * r, 1.25 * r, [[0, '#FF9A9A'], [0.2, '#F0263F'], [0.62, '#B00F27'], [1, '#580512']]);
  x.fillRect(-r, -r, 2 * r, 2 * r);
  rimShade(x, r, 0.5, '40,0,8');
  gloss(x, r, { cx: -0.36, cy: -0.36, rx: 0.32, ry: 0.22, rot: -0.75, a: 0.8 });
  x.fillStyle = 'rgba(255,255,255,.35)';
  x.beginPath(); x.ellipse(0.42 * r, 0.42 * r, 0.12 * r, 0.06 * r, -0.8, 0, TAU); x.fill();
  x.fillStyle = rad(x, 0, -0.66 * r, 0.3 * r, [[0, 'rgba(60,0,10,.5)'], [1, 'rgba(60,0,10,0)']]);
  x.fillRect(-r, -r, 2 * r, 2 * r);
  x.restore();
  cherryPath(x, r); x.strokeStyle = 'rgba(50,0,8,.45)'; x.lineWidth = 0.04 * r; x.stroke();
}

/* ---------- 贴图 ---------- */
const cache = new Map();
function ownSprite(kind, r, dpr) {
  const key = `${kind}|${r.toFixed(1)}|${dpr}`;
  if (cache.has(key)) return cache.get(key);
  const size = Math.ceil(2 * EXT * r * dpr);
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const x = c.getContext('2d');
  x.scale(dpr, dpr); x.translate(EXT * r, EXT * r);
  if (kind === 'grape') grape(x, r, rng(7)); else cherry(x, r);
  cache.set(key, c);
  return c;
}

/** 在 (0,0) 画第 t 种水果，半径 r（调用前已经平移、旋转好） */
export function drawLevel(ctx, t, r, baseR, dpr) {
  const L = LEVELS[t];
  const k = r / baseR;
  const e = EXT * baseR;
  ctx.save();
  ctx.scale(k, k);
  if (L.own) {
    ctx.drawImage(ownSprite(L.own, baseR, dpr), -e, -e, 2 * e, 2 * e);
  } else {
    const sp = spritesFor(fi(L.src[0]), baseR, dpr)[L.src[1]];
    ctx.translate(0, (L.dy || 0) * baseR);
    ctx.scale(L.sx || 1, L.sy || 1);
    ctx.drawImage(sp, -e, -e, 2 * e, 2 * e);
  }
  ctx.restore();
}

export function clearArt() { cache.clear(); }
