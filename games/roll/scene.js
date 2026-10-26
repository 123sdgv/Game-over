// 3D 画面：蓝天白云、悬浮方块拼成的轨道、玻璃护栏、块块、金币、小球和各种小特效。
// 只负责「画」，游戏规则都在 game.js / track.js。
import * as THREE from '../_shared/lib/three.module.min.js';
import { COLS, BALL_R, colX, obX } from './track.js';

export const PALETTE = [0xff5d5d, 0x7a5cff, 0x2f86ff, 0xffb21e, 0xff4fae];

const BEHIND = 9, AHEAD = 66;              // 画哪些行
const TILE_W = 0.94, TILE_H = 0.5;
const RAIL_X = COLS / 2 + 0.03;
const TAU = Math.PI * 2;

/* ---------------------------------------------------------------- 工具 */

/** 圆角盒子：k 是每个圆角分几段；atlas=true 时顶面用贴图左半边、侧面用右半边 */
function roundedBox(w, h, d, r, k = 2, atlas = false) {
  const n = 1 + 2 * k;
  const g = new THREE.BoxGeometry(w, h, d, n, n, n);
  const pos = g.attributes.position, nor = g.attributes.normal, uv = g.attributes.uv;
  const half = [w / 2, h / 2, d / 2];
  const remap = (v, hh) => {
    const i = Math.round(((v + hh) / (2 * hh)) * n);
    return i <= k ? -hh + r * (i / k) : hh - r * ((n - i) / k);
  };
  const per = (n + 1) * (n + 1);
  const p = [0, 0, 0], inner = [0, 0, 0];
  for (let i = 0; i < pos.count; i++) {
    for (let a = 0; a < 3; a++) {
      const v = pos.getComponent(i, a);
      // 在面上的那个轴本来就在 ±half，不用重排
      p[a] = Math.abs(Math.abs(v) - half[a]) < 1e-6 ? v : remap(v, half[a]);
    }
    if (atlas) {
      const face = Math.floor(i / per);   // px nx py ny pz nz
      let u, vv;
      if (face === 2) { u = (p[0] / w + 0.5) * 0.5; vv = p[2] / d + 0.5; }
      else if (face === 3) { u = 0.75; vv = 0.02; }
      else if (face < 2) { u = 0.5 + (p[2] / d + 0.5) * 0.5; vv = p[1] / h + 0.5; }
      else { u = 0.5 + (p[0] / w + 0.5) * 0.5; vv = p[1] / h + 0.5; }
      uv.setXY(i, Math.min(0.995, Math.max(0.005, u)), vv);
    }
    let dx = 0, dy = 0, dz = 0;
    for (let a = 0; a < 3; a++) inner[a] = Math.max(-(half[a] - r), Math.min(half[a] - r, p[a]));
    dx = p[0] - inner[0]; dy = p[1] - inner[1]; dz = p[2] - inner[2];
    const L = Math.hypot(dx, dy, dz) || 1;
    pos.setXYZ(i, inner[0] + (dx / L) * r, inner[1] + (dy / L) * r, inner[2] + (dz / L) * r);
    nor.setXYZ(i, dx / L, dy / L, dz / L);
  }
  return g;
}

function canvasTex(w, h, draw, srgb = true) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function hash(a, b) {
  let h = (a * 374761393 + b * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** 远处的方块从下面升上来就位；a 是在小球前面几行 */
function riseOf(a, jitter) {
  const t = Math.min(1, Math.max(0, (a - 27) / 20) * 1.3 - jitter * 0.3);
  if (t <= 0) return 0;
  return t * t;
}

/* ---------------------------------------------------------------- 天空 */

const SKY_VS = `varying vec3 vDir;
void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const SKY_FS = `uniform vec3 top; uniform vec3 mid; uniform vec3 hor; uniform vec3 low; uniform vec3 sunDir;
varying vec3 vDir;
void main(){
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 c = mix(hor, mid, smoothstep(0.0, 0.22, h));
  c = mix(c, top, smoothstep(0.22, 0.85, h));
  c = mix(c, low, smoothstep(0.0, -0.2, h));
  float s = max(dot(d, normalize(sunDir)), 0.0);
  c += vec3(1.0, 0.97, 0.9) * (pow(s, 380.0) * 1.2 + pow(s, 24.0) * 0.18);
  gl_FragColor = vec4(c, 1.0);
  #include <colorspace_fragment>
}`;

function skyMaterial() {
  return new THREE.ShaderMaterial({
    vertexShader: SKY_VS, fragmentShader: SKY_FS, side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      top: { value: new THREE.Color(0x3d8ef5) },
      mid: { value: new THREE.Color(0x8cc6ff) },
      hor: { value: new THREE.Color(0xe4f2ff) },
      low: { value: new THREE.Color(0xf4f9ff) },
      sunDir: { value: new THREE.Vector3(-0.35, 0.5, -1) },
    },
  });
}

/* ---------------------------------------------------------------- 云 */

function cloudGeometry(rand) {
  const parts = [];
  const n = 3 + Math.floor(rand() * 3);
  for (let i = 0; i < n; i++) {
    const r = 1.3 + rand() * 0.9;
    parts.push([(i - (n - 1) / 2) * 1.7 + (rand() - 0.5) * 0.6, r * 0.25, (rand() - 0.5) * 1.4, r]);
  }
  const m = 1 + Math.floor(rand() * 3);
  for (let i = 0; i < m; i++) {
    const r = 1.6 + rand() * 1.0;
    parts.push([(i - (m - 1) / 2) * 1.9 + (rand() - 0.5), 1.1 + rand() * 0.7, (rand() - 0.5) * 1.0, r]);
  }
  const pos = [], nor = [];
  const ball = new THREE.IcosahedronGeometry(1, 3);
  const bp = ball.attributes.position, bn = ball.attributes.normal;
  for (const [x, y, z, r] of parts) {
    for (let i = 0; i < bp.count; i++) {
      let py = bp.getY(i) * r * 0.82 + y;
      if (py < 0) py *= 0.35;                 // 底下压扁一点，像真的云
      pos.push(bp.getX(i) * r + x, py, bp.getZ(i) * r + z);
      nor.push(bn.getX(i), bn.getY(i), bn.getZ(i));
    }
  }
  ball.dispose();
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.computeBoundingSphere();
  return g;
}

/* ---------------------------------------------------------------- 贴图 */

function tileTexture() {
  return canvasTex(512, 256, (c) => {
    // 顶面
    const g = c.createRadialGradient(128, 110, 20, 128, 128, 190);
    g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#e7eef7');
    c.fillStyle = g; c.fillRect(0, 0, 256, 256);
    c.strokeStyle = '#e6edf5'; c.lineWidth = 2.5;
    rr(c, 54, 54, 148, 148, 18); c.stroke();
    c.save();
    c.shadowColor = 'rgba(40,190,255,.55)'; c.shadowBlur = 6;
    c.strokeStyle = '#7fdcff'; c.lineWidth = 3.5;
    rr(c, 15, 15, 226, 226, 26); c.stroke();
    c.restore();
    c.fillStyle = '#c9d8e8';
    for (const [x, y] of [[40, 40], [216, 40], [40, 216], [216, 216]]) { c.beginPath(); c.arc(x, y, 3.2, 0, TAU); c.fill(); }
    // 侧面
    const s = c.createLinearGradient(0, 0, 0, 256);
    s.addColorStop(0, '#edf2f8'); s.addColorStop(0.5, '#cdd8e5'); s.addColorStop(1, '#93a6bd');
    c.fillStyle = s; c.fillRect(256, 0, 256, 256);
    c.save();
    c.shadowColor = 'rgba(40,190,255,.9)'; c.shadowBlur = 8;
    c.fillStyle = '#40c8ff'; c.fillRect(256, 30, 256, 9);
    c.restore();
    c.fillStyle = 'rgba(255,255,255,.55)'; c.fillRect(256, 0, 256, 6);
  });
}

function ballTextures() {
  const draw = (glow) => (c, w, h) => {
    c.fillStyle = glow ? '#000' : '#2a63ff'; c.fillRect(0, 0, w, h);
    if (!glow) {
      const g = c.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#1a3fd6'); g.addColorStop(0.5, '#3a7bff'); g.addColorStop(1, '#1a3fd6');
      c.fillStyle = g; c.fillRect(0, 0, w, h);
    }
    // 赤道 + 一整圈经线：外面一层青色，中间一条白芯
    c.fillStyle = glow ? '#1aa8ff' : '#36d0ff';
    c.fillRect(0, h / 2 - 16, w, 32);
    for (const x of [w * 0.125, w * 0.625]) c.fillRect(x - 14, 0, 28, h);
    c.fillStyle = glow ? '#bff0ff' : '#ffffff';
    c.fillRect(0, h / 2 - 5, w, 10);
    for (const x of [w * 0.125, w * 0.625]) c.fillRect(x - 4.5, 0, 9, h);
  };
  const map = canvasTex(1024, 512, draw(false));
  const emissive = canvasTex(1024, 512, draw(true));
  return { map, emissive };
}

function coinTexture() {
  return canvasTex(256, 256, (c) => {
    const g = c.createRadialGradient(100, 90, 10, 128, 128, 140);
    g.addColorStop(0, '#fff3b8'); g.addColorStop(0.5, '#ffc93c'); g.addColorStop(1, '#d48a00');
    c.fillStyle = g; c.fillRect(0, 0, 256, 256);
    c.lineWidth = 14; c.strokeStyle = '#e6a20c';
    c.beginPath(); c.arc(128, 128, 92, 0, TAU); c.stroke();
    c.lineWidth = 5; c.strokeStyle = '#fff1a8';
    c.beginPath(); c.arc(128, 128, 84, 0, TAU); c.stroke();
    // 星星
    c.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? 26 : 58;
      c.lineTo(128 + Math.cos(a) * r, 128 + Math.sin(a) * r);
    }
    c.closePath();
    c.fillStyle = '#fff6c9'; c.fill();
    c.lineWidth = 4; c.strokeStyle = '#e8a10e'; c.stroke();
  });
}

function blobTexture() {
  return canvasTex(128, 128, (c) => {
    const g = c.createRadialGradient(64, 64, 4, 64, 64, 62);
    g.addColorStop(0, 'rgba(20,40,80,.55)'); g.addColorStop(0.6, 'rgba(20,40,80,.18)'); g.addColorStop(1, 'rgba(20,40,80,0)');
    c.fillStyle = g; c.fillRect(0, 0, 128, 128);
  });
}

function checkerTexture(cols, rows) {
  return canvasTex(cols * 32, rows * 32, (c) => {
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      c.fillStyle = (x + y) % 2 ? '#1b2c4f' : '#ffffff';
      c.fillRect(x * 32, y * 32, 32, 32);
    }
  });
}

/* ---------------------------------------------------------------- 世界 */

export class World {
  constructor(canvas) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    const scene = (this.scene = new THREE.Scene());
    this.camera = new THREE.PerspectiveCamera(62, 1, 0.1, 500);
    this.camera.position.set(0, 5, 6);
    this.lowPower = false;

    // 天空 + 环境光照（反光用）
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(400, 32, 16), skyMaterial());
    this.sky.renderOrder = -1;
    scene.add(this.sky);
    const envScene = new THREE.Scene();
    envScene.add(new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), skyMaterial()));
    const glowMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    for (const [x, y, z, s] of [[-12, 20, -14, 10], [16, 14, 6, 8], [0, -8, 18, 14]]) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(s, s * 0.4, s), glowMat);
      m.position.set(x, y, z); envScene.add(m);
    }
    const pm = new THREE.PMREMGenerator(this.renderer);
    scene.environment = pm.fromScene(envScene, 0.03).texture;
    pm.dispose();
    scene.fog = new THREE.Fog(0xe4f2ff, 34, 92);

    scene.add(new THREE.HemisphereLight(0xeef6ff, 0xb3c3d8, 0.9));
    const sun = (this.sun = new THREE.DirectionalLight(0xffffff, 2.1));
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -6.5, right: 6.5, top: 13, bottom: -9, near: 1, far: 45 });
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.02;
    scene.add(sun, sun.target);

    this.buildClouds();
    this.buildTrackMeshes();
    this.buildBall();
    this.buildFx();
    this.obMeshes = new Map();
    this.obGeo = new Map();
    this.lit = new Map();
    this.track = null;
    this.gate = null;
  }

  /* ---------- 云和远处漂着的方块 ---------- */
  buildClouds() {
    let seed = 7;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const protos = [0, 1, 2, 3, 4].map(() => cloudGeometry(rand));
    const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0xd4e6fa, emissiveIntensity: 0.62 });
    this.clouds = [];
    const spots = [];
    for (let i = 0; i < 9; i++) spots.push([(rand() - 0.5) * 50, -8 - rand() * 10, 2.2 + rand() * 2]);   // 脚下
    for (let i = 0; i < 8; i++) spots.push([(rand() < 0.5 ? -1 : 1) * (17 + rand() * 18), -5 + rand() * 8, 1.8 + rand() * 1.8]); // 两边
    for (let i = 0; i < 3; i++) spots.push([(rand() - 0.5) * 40, 14 + rand() * 6, 2 + rand() * 1.5]);   // 头顶
    spots.forEach(([x, y, s], i) => {
      const m = new THREE.Mesh(protos[i % protos.length], mat);
      m.scale.setScalar(s);
      m.rotation.y = rand() * TAU;
      m.position.set(x, y, -rand() * 200 + 20);
      m.userData.drift = 0.2 + rand() * 0.5;
      this.scene.add(m);
      this.clouds.push(m);
    });
    // 漂浮的小方块（装饰，跟轨道一个材质）
    this.deco = [];
    for (let i = 0; i < 22; i++) {
      const side = i % 2 ? 1 : -1;
      this.deco.push({ x: side * (4.2 + rand() * 9), y: -1 - rand() * 7, z: -rand() * 160 + 20, s: 0.35 + rand() * 0.7, ph: rand() * TAU, sp: 0.4 + rand() * 0.6, rx: rand() * TAU, ry: rand() * TAU });
    }
  }

  buildTrackMeshes() {
    const tileGeo = roundedBox(TILE_W, TILE_H, TILE_W, 0.07, 2, true);
    this.tileMat = new THREE.MeshStandardMaterial({ map: tileTexture(), roughness: 0.4, metalness: 0.05, envMapIntensity: 0.55 });
    this.tileMat.map.anisotropy = 4;
    const cap = (BEHIND + AHEAD + 2) * COLS;
    this.tiles = new THREE.InstancedMesh(tileGeo, this.tileMat, cap);
    this.tiles.receiveShadow = true;
    this.tiles.frustumCulled = false;
    this.tiles.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.scene.add(this.tiles);

    this.decoMesh = new THREE.InstancedMesh(tileGeo, this.tileMat, 22);
    this.decoMesh.frustumCulled = false;
    this.scene.add(this.decoMesh);

    const railCap = (BEHIND + AHEAD + 2) * 2;
    this.glass = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.05, 0.62, 1.0),
      new THREE.MeshStandardMaterial({ color: 0xa8e4ff, transparent: true, opacity: 0.3, roughness: 0.1, metalness: 0.1, depthWrite: false }),
      railCap,
    );
    this.glass.frustumCulled = false;
    this.glass.renderOrder = 2;
    this.railTop = new THREE.InstancedMesh(
      roundedBox(0.1, 0.07, 1.0, 0.03, 1),
      new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x2fc4ff, emissiveIntensity: 0.85, roughness: 0.3 }),
      railCap,
    );
    this.railTop.frustumCulled = false;
    this.scene.add(this.glass, this.railTop);

    // 金币
    const coinGeo = new THREE.CylinderGeometry(0.24, 0.24, 0.07, 32);
    coinGeo.rotateX(Math.PI / 2);
    const face = new THREE.MeshStandardMaterial({ map: coinTexture(), metalness: 0.75, roughness: 0.3, emissive: 0x6b4300, emissiveIntensity: 0.45 });
    const edge = new THREE.MeshStandardMaterial({ color: 0xf2b11f, metalness: 0.85, roughness: 0.3, emissive: 0x6b4300, emissiveIntensity: 0.4 });
    this.coins = new THREE.InstancedMesh(coinGeo, [edge, face, face], 300);
    this.coins.castShadow = true;
    this.coins.frustumCulled = false;
    this.scene.add(this.coins);

    // 块块的材质（糖果一样亮亮的）
    this.obMats = PALETTE.map((c) => new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.32, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.12, emissive: c, emissiveIntensity: 0.1 }));
    this.stripeMat = new THREE.MeshBasicMaterial({ color: 0xc9f4ff });
  }

  buildBall() {
    const { map, emissive } = ballTextures();
    map.anisotropy = 4;
    this.ballMat = new THREE.MeshStandardMaterial({ map, emissive: 0xffffff, emissiveMap: emissive, emissiveIntensity: 0.85, roughness: 0.16, metalness: 0.25, envMapIntensity: 1.2 });
    this.ball = new THREE.Mesh(new THREE.SphereGeometry(BALL_R, 48, 32), this.ballMat);
    this.ball.castShadow = true;
    this.scene.add(this.ball);
    this.blob = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: blobTexture(), transparent: true, depthWrite: false }));
    this.blob.rotation.x = -Math.PI / 2;
    this.blob.visible = false;
    this.scene.add(this.blob);
    this.spin = new THREE.Quaternion();

    // 小球滚过的地方留一道淡蓝色的光痕
    const N = (this.ribN = 26);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 2 * 3), 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(N * 2 * 4), 4));
    const idx = [];
    for (let i = 0; i < N - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    g.setIndex(idx);
    this.ribbon = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
    this.ribbon.frustumCulled = false;
    this.ribbon.renderOrder = 3;
    this.scene.add(this.ribbon);
    this.ribPts = [];
  }

  buildFx() {
    this.parts = [];
    this.partMesh = new THREE.InstancedMesh(new THREE.OctahedronGeometry(1, 0), new THREE.MeshBasicMaterial({ color: 0xffffff }), 260);
    this.partMesh.frustumCulled = false;
    this.partMesh.count = 0;
    this.scene.add(this.partMesh);
    this.shards = [];
    this.shardMesh = new THREE.InstancedMesh(new THREE.TetrahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ color: 0x3a7bff, emissive: 0x1aa8ff, emissiveIntensity: 0.35, roughness: 0.25, flatShading: true }), 40);
    this.shardMesh.frustumCulled = false;
    this.shardMesh.count = 0;
    this.shardMesh.castShadow = true;
    this.scene.add(this.shardMesh);
  }

  /* ---------- 轨道 ---------- */
  setTrack(track) {
    for (const m of this.obMeshes.values()) this.scene.remove(m);
    this.obMeshes.clear();
    this.lit.clear();
    this.track = track;
    if (this.gate) { this.scene.remove(this.gate); this.gate = null; }
    if (Number.isFinite(track.finish)) this.buildGate(track.finish);
    this.ribPts = [];
    this.parts = []; this.shards = [];
  }

  buildGate(row) {
    const g = new THREE.Group();
    const white = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3, emissive: 0x2fc4ff, emissiveIntensity: 0.15 });
    for (const sx of [-1, 1]) {
      const p = new THREE.Mesh(roundedBox(0.34, 7.9, 0.34, 0.08), white);
      p.position.set(sx * (RAIL_X + 0.3), 3.7, 0);
      p.castShadow = true;
      g.add(p);
    }
    const tex = checkerTexture(16, 2);
    const banner = new THREE.Mesh(roundedBox(5.9, 0.56, 0.22, 0.06), [
      white, white, white, white, new THREE.MeshBasicMaterial({ map: tex }), white,
    ]);
    // 圆角盒子的面分组和普通盒子一样：+z 是第 5 个
    banner.position.set(0, 7.35, 0);   // 比镜头高，穿过去的时候不会糊在屏幕上
    g.add(banner);
    const glow = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.06, 0.06), this.stripeMat);
    glow.position.set(0, 6.95, 0.12);
    g.add(glow);
    const line = new THREE.Mesh(new THREE.PlaneGeometry(COLS - 0.06, 0.7), new THREE.MeshBasicMaterial({ map: checkerTexture(14, 2), transparent: true, opacity: 0.92, depthWrite: false }));
    line.rotation.x = -Math.PI / 2;
    line.position.set(0, 0.008, 0);
    g.add(line);
    g.position.z = -row;
    g.userData.row = row;
    this.gate = g;
    this.scene.add(g);
  }

  lightTile(row, col) {
    this.lit.set(row * 8 + col, 1);
  }

  obMesh(o) {
    const key = `${o.w},${o.h},${o.d}`;
    let geo = this.obGeo.get(key);
    if (!geo) {
      geo = roundedBox(o.w, o.h, o.d, Math.min(0.12, o.h / 3, o.w / 3), 2);
      this.obGeo.set(key, geo);
    }
    const m = new THREE.Mesh(geo, this.obMats[o.color]);
    m.castShadow = true;
    m.receiveShadow = true;
    // 发光的细条，科技感
    const strip = (y, w) => {
      const s = new THREE.Mesh(new THREE.BoxGeometry(w, 0.06, 0.02), this.stripeMat);
      s.position.set(0, y, o.d / 2 + 0.004);
      m.add(s);
    };
    if (o.kind === 'pillar') { strip(o.h * 0.32, o.w * 0.8); strip(o.h * 0.38, o.w * 0.8); }
    else if (o.kind === 'wall') strip(0, o.w - 0.25);
    else if (o.kind === 'slider') strip(0.05, o.w * 0.75);
    else if (o.kind === 'slab') strip(0.02, o.w - 0.4);
    else strip(0.12, o.w * 0.6);
    return m;
  }

  /* ---------- 特效 ---------- */
  burst(x, y, s, color, n = 10, speed = 3) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, u = Math.random() * 2 - 1, k = Math.sqrt(1 - u * u);
      const v = speed * (0.5 + Math.random() * 0.7);
      this.parts.push({ p: new THREE.Vector3(x, y, -s), v: new THREE.Vector3(Math.cos(a) * k * v, Math.abs(u) * v + 1.2, Math.sin(a) * k * v), t: 0, life: 0.45 + Math.random() * 0.3, size: 0.05 + Math.random() * 0.05, color: new THREE.Color(color) });
    }
    if (this.parts.length > 250) this.parts.splice(0, this.parts.length - 250);
  }

  shatter(x, y, s, vx, vs) {
    this.shards = [];
    for (let i = 0; i < 22; i++) {
      const a = Math.random() * TAU, u = Math.random() * 2 - 1, k = Math.sqrt(1 - u * u);
      const v = 2.5 + Math.random() * 4;
      this.shards.push({
        p: new THREE.Vector3(x + Math.cos(a) * k * 0.2, y, -s + Math.sin(a) * k * 0.2),
        v: new THREE.Vector3(Math.cos(a) * k * v + vx * 0.3, Math.abs(u) * v + 2, Math.sin(a) * k * v - vs * 0.15),
        r: new THREE.Euler(Math.random() * TAU, Math.random() * TAU, 0), w: (Math.random() - 0.5) * 18,
        size: 0.07 + Math.random() * 0.08,
      });
    }
    this.burst(x, y, s, 0x36d0ff, 18, 5);
    this.burst(x, y, s, 0xffffff, 12, 4);
  }

  confetti(s) {
    for (const c of [0xff5d5d, 0xffb21e, 0x2f86ff, 0x7a5cff, 0x3ccbff, 0xff4fae]) this.burst((Math.random() - 0.5) * 3, 2.6, s, c, 8, 5);
  }

  /* ---------- 画面尺寸 / 省电 ---------- */
  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setPixelRatio(this.lowPower ? 1.25 : Math.min(2, window.devicePixelRatio || 1));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  setLowPower(on) {
    if (on === this.lowPower) return;
    this.lowPower = on;
    this.renderer.shadowMap.enabled = !on;
    this.scene.traverse((o) => {
      const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
      ms.forEach((m) => (m.needsUpdate = true));
    });
    this.resize();
  }

  /* ---------- 每一帧 ---------- */
  /**
   * st: { s, x, y, time, dt, phase, speed, ds, dx, menuT, ballVisible, fallY }
   */
  update(st) {
    const { s, x, y, time, dt } = st;
    const T = this.track;
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v3 = new THREE.Vector3(), sc = new THREE.Vector3();
    const col = new THREE.Color();
    const base = Math.floor(s) - BEHIND, top = Math.floor(s) + AHEAD;
    if (T) T.ensure(top + 2);

    // 亮着的格子慢慢暗下去
    for (const [k, v] of this.lit) { const nv = v - dt * 1.6; if (nv <= 0) this.lit.delete(k); else this.lit.set(k, nv); }

    // 轨道方块 + 护栏
    let ti = 0, ri = 0;
    const baseA = new THREE.Color(0xffffff), baseB = new THREE.Color(0xeef4fb), litC = new THREE.Color(0x7fe1ff);
    for (let row = Math.max(0, base); row <= top && T; row++) {
      const R = T.rows[row];
      if (!R) continue;
      const a = row - s;
      for (let c = 0; c < COLS; c++) {
        if (!R.t[c]) continue;
        const j = hash(row, c);
        const k = riseOf(a, j);
        const yy = -TILE_H / 2 - k * 9 + Math.sin(time * 1.3 + j * 6) * 0.012 * (1 - k);
        const scl = 1 - k * 0.55;
        q.setFromAxisAngle(v3.set(1, 0, 0), k * 1.2 * (j - 0.5));
        m4.compose(v3.set(colX(c), yy, -row - 0.5), q, sc.set(scl, scl, scl));
        this.tiles.setMatrixAt(ti, m4);
        col.copy(row % 2 ? baseA : baseB);
        const l = this.lit.get(row * 8 + c);
        if (l) col.lerp(litC, Math.min(1, l) * 0.75);
        this.tiles.setColorAt(ti, col);
        ti++;
      }
      q.identity();
      for (const side of [0, COLS - 1]) {
        if (!R.t[side]) continue;
        const k = riseOf(a, hash(row, side + 9));
        const sx = (side ? 1 : -1) * RAIL_X;
        m4.compose(v3.set(sx, 0.06 - k * 9, -row - 0.5), q, sc.set(1, 1 - k * 0.6, 1));
        this.glass.setMatrixAt(ri, m4);
        m4.compose(v3.set(sx, 0.39 - k * 9, -row - 0.5), q, sc.set(1, 1, 1));
        this.railTop.setMatrixAt(ri, m4);
        ri++;
      }
    }
    this.tiles.count = ti;
    this.tiles.instanceMatrix.needsUpdate = true;
    if (this.tiles.instanceColor) this.tiles.instanceColor.needsUpdate = true;
    this.glass.count = ri; this.railTop.count = ri;
    this.glass.instanceMatrix.needsUpdate = true;
    this.railTop.instanceMatrix.needsUpdate = true;

    // 金币
    let ci = 0;
    for (let row = Math.max(0, Math.floor(s) - 3); row <= top && T; row++) {
      const R = T.rows[row];
      if (!R) continue;
      const k = riseOf(row - s, 0.5);
      for (const c of R.coins) {
        if (c.taken || ci >= 300) continue;
        q.setFromAxisAngle(v3.set(0, 1, 0), time * 3.2 + row * 0.35);
        const bob = Math.sin(time * 3 + row) * 0.04;
        m4.compose(v3.set(c.x, 0.45 + c.y + bob - k * 9, -row - 0.5), q, sc.setScalar(1 - k * 0.5));
        this.coins.setMatrixAt(ci++, m4);
      }
    }
    this.coins.count = ci;
    this.coins.instanceMatrix.needsUpdate = true;

    // 块块
    const seen = new Set();
    for (let row = Math.max(0, base); row <= top && T; row++) {
      const R = T.rows[row];
      if (!R) continue;
      for (const o of R.obs) {
        seen.add(o.id);
        let m = this.obMeshes.get(o.id);
        if (!m) { m = this.obMesh(o); this.obMeshes.set(o.id, m); this.scene.add(m); }
        const k = riseOf(o.s - s, hash(o.id, 3) * 0.5 + 0.5);
        m.position.set(obX(o, time), o.h / 2 - k * 10, -(o.s + o.d / 2));
        m.scale.setScalar(1 - k * 0.5);
      }
    }
    for (const [id, m] of this.obMeshes) {
      if (seen.has(id)) continue;
      this.scene.remove(m);
      m.children.forEach((c) => c.geometry.dispose());
      this.obMeshes.delete(id);
    }

    // 终点门
    if (this.gate) {
      const a = this.gate.userData.row - s;
      this.gate.visible = a < AHEAD && a > -BEHIND;
      this.gate.position.y = -riseOf(a, 0.6) * 10;
    }

    // 小球
    const by = BALL_R + y;
    if (st.ds || st.dx) {
      const ax = v3.set(-st.ds, 0, -st.dx);       // 往前（-z）滚：绕 x 轴；往右：绕 -z 轴
      const L = ax.length();
      if (L > 1e-6) { q.setFromAxisAngle(ax.normalize(), L / BALL_R); this.spin.premultiply(q); }
    }
    this.ball.position.set(x, by, -s);
    this.ball.quaternion.copy(this.spin);
    this.ball.visible = st.ballVisible;
    this.blob.visible = this.lowPower && st.ballVisible && y > -0.05 && st.onTile;
    if (this.blob.visible) {
      this.blob.position.set(x, 0.01, -s);
      const f = 1 / (1 + Math.max(0, y) * 0.9);
      this.blob.scale.setScalar(0.95 * f + 0.15);
      this.blob.material.opacity = 0.9 * f;
    }

    // 光痕
    this.updateRibbon(st);

    // 光和影子跟着球走
    this.sun.position.set(x - 3, 15, -s - 6);
    this.sun.target.position.set(x, 0, -s - 3);

    // 云、漂浮方块
    const camZ = this.camera.position.z;
    for (const c of this.clouds) {
      c.position.x += c.userData.drift * dt * 0.3;
      if (c.position.z > camZ + 30) c.position.z -= 230;
    }
    this.deco.forEach((d, i) => {
      if (d.z > camZ + 10) d.z -= 170;
      q.setFromEuler(new THREE.Euler(d.rx + time * 0.2 * d.sp, d.ry + time * 0.3 * d.sp, 0));
      m4.compose(v3.set(d.x, d.y + Math.sin(time * d.sp + d.ph) * 0.35, d.z), q, sc.setScalar(d.s));
      this.decoMesh.setMatrixAt(i, m4);
    });
    this.decoMesh.instanceMatrix.needsUpdate = true;

    this.updateFx(dt);
    this.placeCamera(st);
    this.sky.position.copy(this.camera.position);
  }

  updateRibbon(st) {
    const pts = this.ribPts;
    const on = !this.lowPower && st.ballVisible && st.phase === 'run';
    if (on) pts.push({ x: st.x, y: Math.max(0, st.y), s: st.s, t: st.time });
    while (pts.length && (st.time - pts[0].t > 0.22 || pts.length > this.ribN)) pts.shift();
    if (!on) while (pts.length && st.time - pts[0].t > 0.0) pts.shift();
    const pos = this.ribbon.geometry.attributes.position, colA = this.ribbon.geometry.attributes.color;
    const n = pts.length;
    for (let i = 0; i < this.ribN; i++) {
      const p = pts[Math.min(n - 1, i)] || { x: 0, y: -50, s: 0 };
      const k = n > 1 ? Math.min(i, n - 1) / (n - 1) : 0;
      const w = 0.24 * k;
      pos.setXYZ(i * 2, p.x - w, p.y + 0.03, -p.s);
      pos.setXYZ(i * 2 + 1, p.x + w, p.y + 0.03, -p.s);
      const a = n > 1 && i < n ? k * k * 0.6 : 0;
      colA.setXYZW(i * 2, 0.22, 0.78, 1, a);
      colA.setXYZW(i * 2 + 1, 0.22, 0.78, 1, a);
    }
    pos.needsUpdate = true;
    colA.needsUpdate = true;
  }

  updateFx(dt) {
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
    this.parts = this.parts.filter((p) => (p.t += dt) < p.life);
    this.parts.forEach((p, i) => {
      p.v.y -= 9 * dt;
      p.p.addScaledVector(p.v, dt);
      const k = 1 - p.t / p.life;
      q.setFromAxisAngle(sc.set(0, 1, 0), p.t * 9);
      m4.compose(p.p, q, sc.setScalar(p.size * (0.4 + k)));
      this.partMesh.setMatrixAt(i, m4);
      this.partMesh.setColorAt(i, p.color);
    });
    this.partMesh.count = this.parts.length;
    this.partMesh.instanceMatrix.needsUpdate = true;
    if (this.partMesh.instanceColor) this.partMesh.instanceColor.needsUpdate = true;

    this.shards.forEach((p, i) => {
      p.v.y -= 16 * dt;
      p.p.addScaledVector(p.v, dt);
      if (p.p.y < p.size && p.v.y < 0 && p.p.y > -0.5) { p.p.y = p.size; p.v.y *= -0.35; p.v.x *= 0.6; p.v.z *= 0.6; }
      p.r.x += p.w * dt; p.r.y += p.w * 0.7 * dt;
      q.setFromEuler(p.r);
      m4.compose(p.p, q, sc.setScalar(p.size));
      this.shardMesh.setMatrixAt(i, m4);
    });
    this.shardMesh.count = this.shards.length;
    this.shardMesh.instanceMatrix.needsUpdate = true;
  }

  placeCamera(st) {
    const cam = this.camera;
    const mt = st.menuT;                         // 1 = 开始界面的机位，0 = 游戏中
    const play = { px: st.x * 0.5, py: 5.5, pz: -st.s + 5.4, lx: st.x * 0.62, ly: 0, lz: -st.s - 6.5 };
    const menu = { px: 2.4, py: 1.7, pz: -st.s + 3.6, lx: -0.1, ly: 0.55, lz: -st.s - 1.5 };
    const e = mt * mt * (3 - 2 * mt);
    const P = (k) => play[k] + (menu[k] - play[k]) * e;
    const fallY = st.fallY || 0;
    const tx = P('px'), ty = P('py') + Math.max(0, st.y) * 0.25 + fallY, tz = P('pz');
    const k = 1 - Math.exp(-st.dt * 9);
    if (st.snap) cam.position.set(tx, ty, tz);
    else {
      cam.position.x += (tx - cam.position.x) * k;
      cam.position.y += (ty - cam.position.y) * k;
      cam.position.z = tz;
    }
    cam.lookAt(P('lx'), P('ly') + Math.max(0, st.y) * 0.2 + fallY * 0.6, P('lz'));
    const aspect = cam.aspect;
    const fov = (aspect < 0.6 ? 66 : 56) + (1 - e) * Math.min(6, Math.max(0, st.speed - 9) * 0.6);
    if (Math.abs(cam.fov - fov) > 0.01) { cam.fov = fov; cam.updateProjectionMatrix(); }
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}
