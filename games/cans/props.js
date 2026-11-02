// 台子拆成一个个零件（方块 / 圆柱），物理碰撞和画面用同一份尺寸，保证看到的就是碰到的。
//   part: { type: 'box', size: [x, y, z] } 或 { type: 'cyl', r, h }，加上 pos、quat、mat（画面用哪种材质）
import * as THREE from '../_shared/lib/three.module.min.js';

const UP = new THREE.Vector3(0, 1, 0);

function boxPart(out, sx, sy, sz, x, y, z, mat, q) {
  out.push({ type: 'box', size: [sx, sy, sz], pos: [x, y, z], quat: q ? [q.x, q.y, q.z, q.w] : [0, 0, 0, 1], mat });
}
/** 一根方木，从 a 到 b */
function beam(out, a, b, w, d, mat) {
  const dir = new THREE.Vector3().subVectors(a, b);
  const len = dir.length();
  const q = new THREE.Quaternion().setFromUnitVectors(UP, dir.normalize());
  const c = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
  boxPart(out, w, len, d, c.x, c.y, c.z, mat, q);
}

/** 小车的轨道高度、长度 */
export const cartRail = (p) => ({ y: p.top - 0.36 - 0.62, len: p.amp * 2 + p.w + 1.6 });
/** 小车第 t 秒在哪 */
export const cartX = (p, t) => p.x + p.amp * Math.sin((t / p.period) * Math.PI * 2 + p.phase);

/** 固定不动的零件 */
export function staticParts(p) {
  const out = [];
  if (p.kind === 'plank') {
    boxPart(out, p.w, 0.4, p.d, p.x, p.top - 0.2, p.z, 'plank');
    // 两头各一个木马架：横梁沿着前后方向，两对腿从正面看是个「人」字
    for (const s of [-1, 1]) {
      const sx = p.x + s * (p.w / 2 - 1.05);
      const by = p.top - 0.4 - 0.19;
      boxPart(out, 0.44, 0.38, p.d + 0.9, sx, by, p.z, 'horse');
      const yTop = by - 0.1;
      for (const sz of [-1, 1]) {
        const z = p.z + sz * (p.d / 2 + 0.22);
        const zf = p.z + sz * (p.d / 2 + 0.75);
        for (const sxx of [-1, 1]) beam(out, new THREE.Vector3(sx + sxx * 0.12, yTop, z), new THREE.Vector3(sx + sxx * 1.25, 0, zf), 0.26, 0.3, 'horse');
        // 一根横撑
        const hy = yTop * 0.4;
        const t = 1 - hy / yTop;
        const half = 0.12 + (1.25 - 0.12) * t;
        boxPart(out, half * 2 + 0.3, 0.22, 0.14, sx, hy, z + (zf - z) * t + sz * 0.17, 'horse');
      }
    }
  } else if (p.kind === 'stump') {
    out.push({ type: 'cyl', r: p.r, h: p.top, pos: [p.x, p.top / 2, p.z], quat: [0, 0, 0, 1], mat: 'stump' });
  } else if (p.kind === 'drum') {
    out.push({ type: 'cyl', r: p.r, h: p.top, pos: [p.x, p.top / 2, p.z], quat: [0, 0, 0, 1], mat: 'drum' });
  } else if (p.kind === 'crate') {
    boxPart(out, p.s, p.s, p.s, p.x, p.base + p.s / 2, p.z, 'crate');
  } else if (p.kind === 'cart') {
    const r = cartRail(p);
    boxPart(out, r.len, 0.2, 0.2, p.x, r.y, p.z, 'rail');
    for (const s of [-1, 1]) boxPart(out, 0.34, r.y + 0.3, 0.34, p.x + s * (r.len / 2 + 0.05), (r.y + 0.3) / 2 - 0.0, p.z, 'post');
  }
  return out;
}

/** 小车上面会动的那块板（相对小车中心，小车中心在台面高度） */
export const cartDeck = (p) => ({ type: 'box', size: [p.w, 0.36, p.d], pos: [0, -0.18, 0], quat: [0, 0, 0, 1], mat: 'cart' });
