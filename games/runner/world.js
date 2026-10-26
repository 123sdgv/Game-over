// 赛道：一段段石头路，每段尽头是一个路口（左转或右转）。
// 每段路有自己的坐标：s 是沿着路往前的距离，x 是往右的偏移；世界坐标 = 起点 + 前方 × s + 右方 × x。
import * as THREE from './lib/three.module.min.js';

export const W = 6.6;                 // 路宽
export const LANES = [-2, 0, 2];      // 三条道
export const EDGE = 2.85;             // 路边金币的位置（要斜手机才吃得到）
export const GROUND_Y = -7;           // 下面丛林地面的高度

const FWD = [[0, -1], [1, 0], [0, 1], [-1, 0]]; // 朝向 0..3 的前方 (x, z)
export const fwd = (d) => FWD[((d % 4) + 4) % 4];
export const right = (d) => fwd(d + 1);

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

/* ---------- 共用的材质和形状 ---------- */
export const MAT = {
  stone: new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true }),
  wood: new THREE.MeshLambertMaterial({ color: 0x7a4e2a, flatShading: true }),
  root: new THREE.MeshLambertMaterial({ color: 0x6b4a2a, flatShading: true }),
  leaf: new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true }),
  vine: new THREE.MeshLambertMaterial({ color: 0x3f8f3a, flatShading: true }),
  gold: new THREE.MeshPhongMaterial({ color: 0xffc83a, specular: 0xfff1b0, shininess: 70, emissive: 0x5a3600, flatShading: true }),
  flame: new THREE.MeshBasicMaterial({ color: 0xffa23a, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }),
  glow: new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }),
  ground: new THREE.MeshLambertMaterial({ color: 0x2f5a2a }),
  pillar: new THREE.MeshLambertMaterial({ color: 0x9a8d74, flatShading: true }),
  pillarTop: new THREE.MeshLambertMaterial({ color: 0xa99c82, flatShading: true }),
};
const GEO = {
  box: new THREE.BoxGeometry(1, 1, 1),
  trunk: new THREE.CylinderGeometry(0.35, 0.5, 1, 6),
  canopy: new THREE.IcosahedronGeometry(1, 0),
  coin: new THREE.CylinderGeometry(0.38, 0.38, 0.1, 14).rotateX(Math.PI / 2),
  log: new THREE.CylinderGeometry(0.28, 0.32, 1, 7).rotateZ(Math.PI / 2),
  flame: new THREE.ConeGeometry(0.22, 0.6, 6),
  glow: new THREE.SphereGeometry(0.5, 8, 6),
  rock: new THREE.DodecahedronGeometry(1, 0),
};

const STONES = ['#B8AA8E', '#A89B80', '#C2B597', '#9E9178', '#B0A386'];
const CURB = ['#8F826B', '#857961', '#998C74'];
const LEAVES = ['#3F8F3A', '#4FA046', '#2F7A33', '#5AAE4C', '#367F38'];

/* ---------- 生成一段路的数据 ---------- */
/**
 * prev：上一段（第一段为 null）；dist：这段开始时已经跑了多远（用来调难度）
 * tilt：倾斜可用时才放路边的金币
 */
export function makeSegment(prev, dist, tilt) {
  const first = !prev;
  const start = first ? { x: 0, z: 0 } : endOf(prev);
  const dir = first ? 0 : prev.dir + (prev.turn === 'R' ? 1 : -1);
  const len = first ? 78 : Math.round(rand(48, 88));
  // 不连着三次往同一个方向拐（不然路会绕回来）
  let turn = Math.random() < 0.5 ? 'L' : 'R';
  if (prev && prev.turn === turn && prev.prevTurn === turn) turn = turn === 'L' ? 'R' : 'L';
  const seg = { start, dir, len, turn, prevTurn: prev ? prev.turn : null, obstacles: [], coins: [], gaps: [], first };

  const d = Math.min(1, dist / 2600);
  let s = first ? 30 : 14;
  const end = len - 16;
  while (s < end) {
    const r = Math.random();
    if (r < 0.34) addPillars(seg, s, d);
    else if (r < 0.52) addRoot(seg, s);
    else if (r < 0.7) addBeam(seg, s);
    else if (r < 0.82 && s + 4 < end) addGap(seg, s);
    else addCoinRun(seg, s, pick(LANES), 8);
    if (tilt && Math.random() < 0.3) addEdgeCoins(seg, s + 3);
    s += 15 - 6 * d + rand(0, 6);
  }
  return seg;
}

export function endOf(seg) {
  const [fx, fz] = fwd(seg.dir);
  return { x: seg.start.x + fx * seg.len, z: seg.start.z + fz * seg.len };
}

function addCoinRun(seg, s, x, n, y = 0.9) {
  for (let i = 0; i < n; i++) seg.coins.push({ s: s + i * 1.6, x, y, taken: false });
}
function addArc(seg, s, x, n, h) {
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0.5 : i / (n - 1);
    seg.coins.push({ s: s - 3 + t * 6, x, y: 0.9 + Math.sin(t * Math.PI) * h, taken: false });
  }
}
function addPillars(seg, s, d) {
  const lanes = [0, 1, 2].sort(() => Math.random() - 0.5);
  const blocked = Math.random() < 0.25 + 0.4 * d ? 2 : 1;
  for (let k = 0; k < blocked; k++) seg.obstacles.push({ type: 'pillar', s, x: LANES[lanes[k]], w: 1.6, depth: 1.3, h: 2.6 });
  addCoinRun(seg, s - 5, LANES[lanes[2]], 6);
}
function addRoot(seg, s) {
  seg.obstacles.push({ type: 'root', s, h: 0.6 });
  addArc(seg, s, pick(LANES), 5, 1.4);
}
function addBeam(seg, s) {
  seg.obstacles.push({ type: 'beam', s, bottom: 1.15 });
  addCoinRun(seg, s - 2, pick(LANES), 3, 0.45);
}
function addGap(seg, s) {
  const len = 3.2;
  seg.gaps.push({ s, len });
  seg.obstacles.push({ type: 'gap', s, len });
  addArc(seg, s + len / 2, pick(LANES), 5, 1.6);
}
function addEdgeCoins(seg, s) {
  const side = Math.random() < 0.5 ? -1 : 1;
  const x = side * EDGE;
  // 那一侧这段如果有柱子挡着，就不放
  if (seg.obstacles.some((o) => o.type === 'pillar' && Math.sign(o.x) === side && Math.abs(o.s - s - 4) < 7)) return;
  for (let i = 0; i < 6; i++) seg.coins.push({ s: s + i * 1.5, x, y: 0.9, taken: false, edge: true });
}

/* ---------- 把一段路变成 3D 物体 ---------- */
const tmp = new THREE.Object3D();
const col = new THREE.Color();

function toWorld(seg, s, x, y = 0) {
  const [fx, fz] = fwd(seg.dir), [rx, rz] = right(seg.dir);
  return new THREE.Vector3(seg.start.x + fx * s + rx * x, y, seg.start.z + fz * s + rz * x);
}
const yawOf = (dir) => -dir * (Math.PI / 2);

export function buildSegment(seg) {
  const group = new THREE.Group();
  const stones = [];  // [s, x, y, sx, sy, sz, color, rotJitter]
  const inGap = (s) => seg.gaps.some((g) => s > g.s - 0.2 && s < g.s + g.len + 0.2);
  const s0 = seg.first ? -14 : W / 2;
  const s1 = seg.len - W / 2;
  // 路面：每排三块石板
  for (let s = s0; s < s1; s += 2) {
    if (inGap(s + 1)) continue;
    for (let k = -1; k <= 1; k++) {
      stones.push([s + 1, k * (W / 3), -0.45 + rand(-0.03, 0.03), W / 3 - 0.08, 0.9, 1.92, pick(STONES), rand(-0.015, 0.015)]);
    }
    // 两边的矮石沿
    for (const side of [-1, 1]) {
      if (Math.random() < 0.08) continue;
      stones.push([s + 1, side * (W / 2 + 0.25), 0.05 + rand(0, 0.08), 0.5, 0.5 + rand(0, 0.15), 1.9, pick(CURB), rand(-0.04, 0.04)]);
    }
  }
  // 路口：一块方形平台，前面和不能走的那边有墙
  const js = seg.len;
  for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
    stones.push([js + a * (W / 3), b * (W / 3), -0.45 + rand(-0.03, 0.03), W / 3 - 0.08, 0.9, W / 3 - 0.08, pick(STONES), 0]);
  }
  stones.push([js + W / 2 + 0.5, 0, 1.2, W + 2, 3.2, 1, pick(CURB), 0]);        // 正前方的墙
  const blockedSide = seg.turn === 'L' ? 1 : -1;
  stones.push([js, blockedSide * (W / 2 + 0.5), 1.2, 1, 3.2, W + 2, pick(CURB), 0]); // 不能拐的那边
  // 墙上的装饰石块
  for (let k = 0; k < 4; k++) stones.push([js + W / 2 + 0.4, (k - 1.5) * 1.7, 2.95, 1.2, 0.5, 0.9, pick(STONES), 0]);
  // 路边的石柱（带火把）
  const torches = [];
  for (let s = (seg.first ? 6 : 10); s < s1 - 4; s += rand(11, 17)) {
    const side = Math.random() < 0.5 ? -1 : 1;
    if (inGap(s)) continue;
    stones.push([s, side * (W / 2 + 0.9), 0.6, 0.9, 2.4, 0.9, pick(CURB), 0]);
    stones.push([s, side * (W / 2 + 0.9), 1.9, 1.15, 0.25, 1.15, pick(STONES), 0]);
    torches.push([s, side * (W / 2 + 0.9), 2.25]);
  }
  // 断崖的两头：碎石边
  for (const g of seg.gaps) {
    for (const e of [g.s - 0.2, g.s + g.len + 0.2]) {
      for (let k = 0; k < 5; k++) stones.push([e + rand(-0.2, 0.2), rand(-W / 2, W / 2), -0.9 + rand(0, 0.3), rand(0.5, 1), rand(0.4, 0.8), rand(0.4, 0.8), pick(CURB), rand(-0.5, 0.5)]);
    }
  }

  const stoneMesh = new THREE.InstancedMesh(GEO.box, MAT.stone, stones.length);
  stones.forEach(([s, x, y, sx, sy, sz, c, j], i) => {
    tmp.position.copy(toWorld(seg, s, x, y));
    tmp.rotation.set(j, yawOf(seg.dir) + j * 2, j);
    tmp.scale.set(sx, sy, sz);
    tmp.updateMatrix();
    stoneMesh.setMatrixAt(i, tmp.matrix);
    stoneMesh.setColorAt(i, col.set(c));
  });
  group.add(stoneMesh);

  // 火把
  if (torches.length) {
    const flames = new THREE.InstancedMesh(GEO.flame, MAT.flame, torches.length);
    const glows = new THREE.InstancedMesh(GEO.glow, MAT.glow, torches.length);
    torches.forEach(([s, x, y], i) => {
      tmp.position.copy(toWorld(seg, s, x, y + 0.3)); tmp.rotation.set(0, 0, 0); tmp.scale.set(1, 1, 1); tmp.updateMatrix();
      flames.setMatrixAt(i, tmp.matrix);
      tmp.scale.set(1.6, 1.8, 1.6); tmp.updateMatrix();
      glows.setMatrixAt(i, tmp.matrix);
    });
    group.add(flames, glows);
    seg.flames = flames;
  }

  // 树：从下面的丛林里长上来
  const trees = [];
  const turnSide = seg.turn === 'R' ? 1 : -1;
  const fromSide = seg.prevTurn === 'R' ? -1 : seg.prevTurn === 'L' ? 1 : 0; // 上一段从哪边过来
  for (let s = -6; s < seg.len + 10; s += rand(3.5, 6)) {
    for (const side of [-1, 1]) {
      if (Math.random() < 0.15) continue;
      if (side === turnSide && s > seg.len - W / 2 - 6) continue;
      if (side === fromSide && s < W / 2 + 6) continue;
      const cr = rand(2, 3.8);
      trees.push([s, side * rand(W / 2 + cr + 1.6, W / 2 + cr + 14), rand(0.5, 7), cr]); // 树冠不伸到路上
    }
  }
  const trunks = new THREE.InstancedMesh(GEO.trunk, MAT.wood, trees.length);
  const canopies = new THREE.InstancedMesh(GEO.canopy, MAT.leaf, trees.length * 2);
  trees.forEach(([s, x, top, cr], i) => {
    const h = top - GROUND_Y;
    tmp.position.copy(toWorld(seg, s, x, GROUND_Y + h / 2)); tmp.rotation.set(0, rand(0, 6), 0); tmp.scale.set(1, h, 1); tmp.updateMatrix();
    trunks.setMatrixAt(i, tmp.matrix);
    for (let k = 0; k < 2; k++) {
      tmp.position.copy(toWorld(seg, s + rand(-0.8, 0.8), x + rand(-0.8, 0.8), top + k * cr * 0.7)); tmp.rotation.set(rand(0, 3), rand(0, 3), rand(0, 3));
      const sc = cr * (k ? 0.7 : 1); tmp.scale.set(sc, sc * 0.85, sc); tmp.updateMatrix();
      canopies.setMatrixAt(i * 2 + k, tmp.matrix);
      canopies.setColorAt(i * 2 + k, col.set(pick(LEAVES)));
    }
  });
  group.add(trunks, canopies);

  // 障碍物
  for (const o of seg.obstacles) {
    if (o.type === 'pillar') {
      const g = new THREE.Group();
      const base = new THREE.Mesh(GEO.box, MAT.pillar); base.scale.set(o.w, o.h * 0.75, o.depth); base.position.y = o.h * 0.375;
      const top = new THREE.Mesh(GEO.box, MAT.pillarTop); top.scale.set(o.w * 0.8, o.h * 0.3, o.depth * 0.8); top.position.set(0.12, o.h * 0.85, 0); top.rotation.z = 0.12;
      const moss = new THREE.Mesh(GEO.box, MAT.vine); moss.scale.set(o.w * 1.02, 0.18, o.depth * 1.02); moss.position.y = o.h * 0.5;
      g.add(base, top, moss);
      g.position.copy(toWorld(seg, o.s, o.x, 0)); g.rotation.y = yawOf(seg.dir);
      group.add(g);
    } else if (o.type === 'root') {
      const g = new THREE.Group();
      const log = new THREE.Mesh(GEO.log, MAT.root); log.scale.set(W + 1, 1, 1); log.position.y = 0.3;
      g.add(log);
      for (let k = 0; k < 4; k++) {
        const knot = new THREE.Mesh(GEO.rock, MAT.root); knot.scale.set(0.35, 0.3, 0.35); knot.position.set(rand(-W / 2, W / 2), 0.35, rand(-0.2, 0.2));
        g.add(knot);
      }
      g.position.copy(toWorld(seg, o.s, 0, 0)); g.rotation.y = yawOf(seg.dir);
      group.add(g);
    } else if (o.type === 'beam') {
      const g = new THREE.Group();
      const log = new THREE.Mesh(GEO.log, MAT.wood); log.scale.set(W + 1.6, 1.25, 1.25); log.position.y = o.bottom + 0.36;
      g.add(log);
      for (const side of [-1, 1]) {
        const post = new THREE.Mesh(GEO.box, MAT.wood); post.scale.set(0.45, o.bottom + 0.9, 0.45); post.position.set(side * (W / 2 + 0.5), (o.bottom + 0.9) / 2, 0);
        g.add(post);
      }
      for (let k = 0; k < 6; k++) {
        const v = new THREE.Mesh(GEO.box, MAT.vine); const L = rand(0.25, 0.55);
        v.scale.set(0.08, L, 0.08); v.position.set(rand(-W / 2, W / 2), o.bottom - L / 2 + 0.05, 0.1);
        g.add(v);
      }
      g.position.copy(toWorld(seg, o.s, 0, 0)); g.rotation.y = yawOf(seg.dir);
      group.add(g);
    }
  }

  // 金币
  if (seg.coins.length) {
    const coins = new THREE.InstancedMesh(GEO.coin, MAT.gold, seg.coins.length);
    coins.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    seg.coins.forEach((c) => { c.pos = toWorld(seg, c.s, c.x, c.y); c.t = 0; });
    group.add(coins);
    seg.coinMesh = coins;
    updateCoins(seg, 0, 0);
  }
  seg.group = group;
  return group;
}

/** 金币转起来；被吃掉的往上飘、变小 */
export function updateCoins(seg, time, dt) {
  const m = seg.coinMesh;
  if (!m) return;
  const yaw = yawOf(seg.dir);
  seg.coins.forEach((c, i) => {
    let sc = 1, lift = 0;
    if (c.taken) { c.t += dt; sc = Math.max(0, 1 - c.t / 0.25); lift = c.t * 6; }
    tmp.position.set(c.pos.x, c.pos.y + lift + Math.sin(time * 3 + c.s) * 0.06, c.pos.z);
    tmp.rotation.set(0, yaw + time * 4 + c.s * 0.3, 0);
    tmp.scale.setScalar(sc);
    tmp.updateMatrix();
    m.setMatrixAt(i, tmp.matrix);
  });
  m.instanceMatrix.needsUpdate = true;
}

export function disposeSegment(seg) {
  if (!seg.group) return;
  seg.group.traverse((o) => { if (o.isInstancedMesh) o.dispose(); });
  seg.group.removeFromParent();
  seg.group = null;
}

export { toWorld, yawOf };
