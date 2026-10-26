// 螺旋跳跃的 3D 画面：柱子、一层层带缺口的平台、小球、各种特效。
// 只负责「画」，规则都在 tower.js / game.js。
import * as THREE from '../_shared/lib/three.module.min.js';
import { SLICES, SLICE, TAU, PILLAR_R, R_IN, R_OUT, BALL_R, BALL_DIST, PLAT_H, GAP, RED, topY } from './tower.js';

/* ---------------------------------------------------------------- 配色 */
// 每一关换一套；红色永远是「危险」
export const THEMES = [
  { name: '薄荷', top: '#93e4cf', bot: '#effcf7', plat: '#22b496', pillar: '#f3fbf8', red: '#e4243c' },
  { name: '晴空', top: '#a3c3ff', bot: '#f1f5ff', plat: '#4a6ff0', pillar: '#f6f8ff', red: '#ee2b47' },
  { name: '樱花', top: '#ffbfd3', bot: '#fff4f8', plat: '#f7699a', pillar: '#fff8fb', red: '#b80f2c' },
  { name: '青柠', top: '#cdeb94', bot: '#fbffef', plat: '#62b52a', pillar: '#fbfff3', red: '#e3243a' },
  { name: '薰衣草', top: '#cbbaff', bot: '#f8f3ff', plat: '#8360ee', pillar: '#fbf8ff', red: '#ec2a48' },
  { name: '海湾', top: '#95dbfb', bot: '#effaff', plat: '#159fd8', pillar: '#f4fbff', red: '#e8273f' },
  { name: '夜色', top: '#2e3557', bot: '#141725', plat: '#e7eaf3', pillar: '#3a4166', red: '#ff2e4c' },
];

/* ---------------------------------------------------------------- 工具 */
function canvasTex(w, h, draw, srgb = true) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** 从 0 开始、n 片宽的一段圆环（圆角、有厚度），顶面在 y = 0 */
function arcGeometry(n, h) {
  const bs = 0.085, bt = 0.085;
  const s = new THREE.Shape();
  if (n >= SLICES) {
    s.absarc(0, 0, R_OUT, 0, TAU, false);
    const hole = new THREE.Path();
    hole.absarc(0, 0, R_IN, 0, TAU, true);
    s.holes.push(hole);
  } else {
    const ins = 0.014;                       // 两段之间留一条细缝
    const a0 = ins - Math.PI / 2, a1 = n * SLICE - ins - Math.PI / 2;
    s.absarc(0, 0, R_OUT, a0, a1, false);
    s.absarc(0, 0, R_IN, a1, a0, true);
  }
  const g = new THREE.ExtrudeGeometry(s, {
    depth: h - bt * 2, bevelEnabled: true, bevelThickness: bt, bevelSize: bs, bevelOffset: -bs, bevelSegments: 3,
    curveSegments: Math.max(8, Math.min(64, n * 6)),
  });
  g.rotateX(-Math.PI / 2);                    // 形状平放：(u, v) → (x = u, z = -v)
  g.translate(0, -(h - bt), 0);
  return g;
}

/** 把一层平台拆成一串一串（同一种的连在一起），从某个缺口后面开始数 */
function runsOf(slices) {
  const start = slices.indexOf(GAP);
  if (start < 0) return [{ s: 0, n: SLICES, k: slices[0] }];
  const out = [];
  let i = 0;
  while (i < SLICES) {
    const idx = (start + i) % SLICES;
    const k = slices[idx];
    let n = 1;
    while (i + n < SLICES && slices[(start + i + n) % SLICES] === k) n++;
    if (k !== GAP) out.push({ s: idx, n, k });
    i += n;
  }
  return out;
}

const mix = (a, b, t) => a + (b - a) * t;

/* ---------------------------------------------------------------- 世界 */
export class World {
  constructor(canvas) {
    const r = (this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' }));
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.toneMapping = THREE.NeutralToneMapping;
    r.toneMappingExposure = 0.92;
    const scene = (this.scene = new THREE.Scene());
    this.camera = new THREE.PerspectiveCamera(44, 1, 0.5, 120);
    this.lowPower = false;
    this.camY = 0;
    this.shake = 0;

    // 背景：竖着的渐变，换关的时候慢慢变色
    this.bgCanvas = document.createElement('canvas');
    this.bgCanvas.width = 4; this.bgCanvas.height = 256;
    this.bgTex = new THREE.CanvasTexture(this.bgCanvas);
    this.bgTex.colorSpace = THREE.SRGBColorSpace;
    scene.background = this.bgTex;
    scene.fog = new THREE.Fog(0xffffff, 20, 50);

    // 反光用的环境
    const env = new THREE.Scene();
    const envMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      vertexShader: 'varying vec3 d; void main(){ d = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'varying vec3 d; void main(){ float h = d.y; vec3 c = mix(vec3(0.62,0.64,0.7), vec3(1.0), smoothstep(-0.3, 0.6, h)); gl_FragColor = vec4(c,1.0); }',
    });
    env.add(new THREE.Mesh(new THREE.SphereGeometry(30, 32, 16), envMat));
    const panel = new THREE.MeshBasicMaterial({ color: 0xffffff });
    for (const [x, y, z, w, hh] of [[-10, 12, 8, 10, 4], [12, 6, 6, 6, 10], [0, 18, -6, 14, 3]]) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, hh), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      m.material.color.setScalar(2.2);
      m.position.set(x, y, z); m.lookAt(0, 0, 0); env.add(m);
    }
    panel.dispose();
    const pm = new THREE.PMREMGenerator(r);
    scene.environment = pm.fromScene(env, 0.02).texture;
    pm.dispose();
    scene.environmentIntensity = 0.4;

    this.hemi = new THREE.HemisphereLight(0xffffff, 0x8a92a8, 0.75);
    scene.add(this.hemi);
    const key = (this.key = new THREE.DirectionalLight(0xffffff, 1.9));
    key.position.set(-5, 12, 7);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    Object.assign(key.shadow.camera, { left: -5, right: 5, top: 9, bottom: -9, near: 1, far: 40 });
    key.shadow.bias = -0.0008;
    key.shadow.normalBias = 0.03;
    key.shadow.radius = 4;
    scene.add(key, key.target);
    const rim = new THREE.DirectionalLight(0xffffff, 0.6);
    rim.position.set(6, 4, -6);
    scene.add(rim);

    // 塔
    this.tower = new THREE.Group();
    scene.add(this.tower);
    this.mat = {
      safe: new THREE.MeshStandardMaterial({ color: 0x22b496, roughness: 0.38, metalness: 0 }),
      red: new THREE.MeshStandardMaterial({ color: 0xe4243c, roughness: 0.22, metalness: 0.05, emissive: 0x500010, emissiveIntensity: 0.6 }),
      finish: new THREE.MeshStandardMaterial({ color: 0xffd34d, roughness: 0.25, metalness: 0.15, emissive: 0x6b4a00, emissiveIntensity: 0.35 }),
      pillar: new THREE.MeshStandardMaterial({ color: 0xf3fbf8, roughness: 0.3, metalness: 0, emissive: 0xffffff, emissiveIntensity: 0.3 }),
      cap: new THREE.MeshStandardMaterial({ color: 0xf3fbf8, roughness: 0.3, metalness: 0, emissive: 0xffffff, emissiveIntensity: 0.3 }),
    };
    this.mat.pillar.map = canvasTex(256, 4, (c, w, h) => {
      for (let x = 0; x < w; x++) {
        const v = 0.5 + 0.5 * Math.cos((x / w) * TAU * 12);
        const g = Math.round(255 - v * 22);
        c.fillStyle = `rgb(${g},${g},${g})`;
        c.fillRect(x, 0, 1, h);
      }
    });
    this.mat.pillar.map.wrapS = THREE.RepeatWrapping;
    this.geo = new Map();
    this.pillar = new THREE.Mesh(new THREE.CylinderGeometry(PILLAR_R, PILLAR_R, 1, 64, 1, true), this.mat.pillar);
    this.pillar.receiveShadow = true;
    this.tower.add(this.pillar);
    this.cap = new THREE.Mesh(new THREE.SphereGeometry(PILLAR_R, 48, 16, 0, TAU, 0, Math.PI / 2), this.mat.cap);
    this.cap.scale.y = 0.3;
    this.cap.receiveShadow = true;
    this.tower.add(this.cap);
    this.PILLAR_TOP = 3.1;
    this.plats = new Map();     // 序号 → Group

    // 小球
    this.ballMat = new THREE.MeshPhysicalMaterial({ color: 0xff7a1a, roughness: 0.2, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.12, emissive: 0xff5a00, emissiveIntensity: 0 });
    this.ball = new THREE.Mesh(new THREE.SphereGeometry(BALL_R, 40, 28), this.ballMat);
    this.ball.position.set(0, 2, BALL_DIST);
    scene.add(this.ball);

    // 小球正下方的影子（帮你判断会落在哪）
    const blobTex = canvasTex(64, 64, (c) => {
      const g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
      g.addColorStop(0, 'rgba(0,0,0,.55)'); g.addColorStop(0.55, 'rgba(0,0,0,.25)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g; c.fillRect(0, 0, 64, 64);
    });
    this.blob = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, fog: false }));
    this.blob.rotation.x = -Math.PI / 2;
    this.blob.renderOrder = 2;
    scene.add(this.blob);

    // 小球的颜料印子
    this.splatTex = canvasTex(128, 128, (c) => {
      c.fillStyle = '#fff';
      const blob = (x, y, rr) => { c.beginPath(); c.arc(x, y, rr, 0, TAU); c.fill(); };
      blob(64, 64, 30);
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * TAU + Math.sin(i * 7.3) * 0.3;
        const d = 30 + (i % 3) * 6;
        blob(64 + Math.cos(a) * d * 0.72, 64 + Math.sin(a) * d * 0.72, 9 + (i % 4) * 2.5);
        blob(64 + Math.cos(a) * (d + 14), 64 + Math.sin(a) * (d + 14), 2.5 + (i % 3) * 1.6);
      }
    });

    // 拖尾、火焰、碎片
    const dot = canvasTex(64, 64, (c) => {
      const g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
      g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.6, 'rgba(255,255,255,.85)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g; c.fillRect(0, 0, 64, 64);
    });
    const glow = canvasTex(64, 64, (c) => {
      const g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
      g.addColorStop(0, 'rgba(255,236,120,1)'); g.addColorStop(0.35, 'rgba(255,170,40,.95)'); g.addColorStop(0.7, 'rgba(255,90,10,.45)'); g.addColorStop(1, 'rgba(255,60,0,0)');
      c.fillStyle = g; c.fillRect(0, 0, 64, 64);
    });
    this.trail = [];
    for (let i = 0; i < 14; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: dot, color: 0xff7a1a, transparent: true, depthWrite: false, opacity: 0 }));
      s.visible = false;
      scene.add(s);
      this.trail.push({ s, life: 0 });
    }
    this.trailT = 0;
    this.flames = [];
    for (let i = 0; i < 46; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, transparent: true, depthWrite: false, opacity: 0 }));
      s.visible = false;
      scene.add(s);
      this.flames.push({ s, life: 0, v: new THREE.Vector3() });
    }
    this.flameT = 0;
    this.aura = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, transparent: true, depthWrite: false, opacity: 0 }));
    this.aura.renderOrder = -1;
    this.aura.scale.setScalar(BALL_R * 5);
    scene.add(this.aura);

    const MAX = 360;
    this.shards = new THREE.InstancedMesh(new THREE.TetrahedronGeometry(0.15, 0), new THREE.MeshStandardMaterial({ roughness: 0.45, metalness: 0 }), MAX);
    this.shards.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.shards.setColorAt(0, new THREE.Color());
    this.shards.count = 0;
    this.shards.frustumCulled = false;
    scene.add(this.shards);
    this.parts = [];
    this.PMAX = MAX;
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._e = new THREE.Euler(); this._v = new THREE.Vector3(); this._s = new THREE.Vector3();

    // 穿过一层时闪一圈光
    this.rings = [];
    for (let i = 0; i < 4; i++) {
      const m = new THREE.Mesh(new THREE.RingGeometry(0.92, 1, 96), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false, opacity: 0, side: THREE.DoubleSide, fog: false }));
      m.rotation.x = -Math.PI / 2;
      m.visible = false;
      scene.add(m);
      this.rings.push({ m, life: 0 });
    }
    this.debris = [];

    // 配色
    this.theme = null;
    this.from = null; this.to = null; this.themeT = 1;
    this.cur = { top: new THREE.Color(), bot: new THREE.Color(), plat: new THREE.Color(), pillar: new THREE.Color(), red: new THREE.Color() };
    this.setTheme(THEMES[0], true);
  }

  /* ---------- 配色 ---------- */
  setTheme(th, instant = false) {
    const c = (hex) => new THREE.Color(hex);
    const to = { top: c(th.top), bot: c(th.bot), plat: c(th.plat), pillar: c(th.pillar), red: c(th.red) };
    this.theme = th;
    if (instant) { this.from = to; this.to = to; this.themeT = 1; this.applyTheme(1); return; }
    this.from = Object.fromEntries(Object.entries(this.cur).map(([k, v]) => [k, v.clone()]));
    this.to = to;
    this.themeT = 0;
  }

  applyTheme(t) {
    const e = t * t * (3 - 2 * t);
    for (const k of Object.keys(this.cur)) this.cur[k].copy(this.from[k]).lerp(this.to[k], e);
    this.mat.safe.color.copy(this.cur.plat);
    this.mat.red.color.copy(this.cur.red);
    this.mat.pillar.color.copy(this.cur.pillar);
    this.mat.cap.color.copy(this.cur.pillar);
    this.mat.pillar.emissive.copy(this.cur.pillar);
    this.mat.cap.emissive.copy(this.cur.pillar);
    this.scene.fog.color.copy(this.cur.bot);
    const dark = this.cur.bot.getHSL({}).l < 0.4;
    this.hemi.groundColor.set(dark ? 0x30344a : 0x8a92a8);
    this.mat.red.emissive.set(dark ? 0x7a0018 : 0x500010);
    const g = this.bgCanvas.getContext('2d');
    const grd = g.createLinearGradient(0, 0, 0, 256);
    grd.addColorStop(0, `#${this.cur.top.getHexString(THREE.SRGBColorSpace)}`);
    grd.addColorStop(0.78, `#${this.cur.bot.getHexString(THREE.SRGBColorSpace)}`);
    grd.addColorStop(1, `#${this.cur.bot.getHexString(THREE.SRGBColorSpace)}`);
    g.fillStyle = grd; g.fillRect(0, 0, 4, 256);
    this.bgTex.needsUpdate = true;
  }

  setBallColor(hex) {
    this.ballColor = new THREE.Color(hex);
    this.ballMat.color.copy(this.ballColor);
    for (const t of this.trail) t.s.material.color.copy(this.ballColor);
  }

  /* ---------- 平台 ---------- */
  setTower(tower) {
    for (const g of this.plats.values()) this.dropGroup(g);
    this.plats.clear();
    this.towerData = tower;
    for (const d of this.debris) { this.scene.remove(d.g); d.mats.forEach((m) => m.dispose()); }
    this.debris = [];
    this.parts.length = 0; this.shards.count = 0;
  }

  dropGroup(g) {
    this.tower.remove(g);
    for (const m of g.userData.splats || []) m.material.dispose();
  }

  arc(n, red) {
    const key = `${n}${red ? 'r' : ''}`;
    if (!this.geo.has(key)) this.geo.set(key, arcGeometry(n, red ? PLAT_H + 0.05 : PLAT_H));
    return this.geo.get(key);
  }

  buildPlatform(p) {
    const g = new THREE.Group();
    g.position.y = topY(p.i);
    g.userData = { i: p.i, splats: [] };
    if (p.finish) {
      const m = new THREE.Mesh(this.arc(SLICES, false), this.mat.finish);
      m.castShadow = true; m.receiveShadow = true;
      g.add(m);
      return g;
    }
    for (const run of runsOf(p.slices)) {
      const red = run.k === RED;
      const m = new THREE.Mesh(this.arc(run.n, red), red ? this.mat.red : this.mat.safe);
      m.rotation.y = run.s * SLICE;
      if (red) m.position.y = 0.05;
      m.castShadow = true; m.receiveShadow = true;
      m.userData.mid = (run.s + run.n / 2) * SLICE;
      g.add(m);
    }
    return g;
  }

  /** 第 i 层穿过 / 被火球砸碎：整层炸开飞走 */
  explode(i, smash = false) {
    const g = this.plats.get(i);
    if (!g) return;
    this.plats.delete(i);
    g.updateMatrixWorld(true);
    const ry = this.tower.rotation.y + g.rotation.y;
    this.scene.attach(g);
    const mats = [];
    g.children.forEach((m) => {
      if (m.userData.grow != null) { mats.push(m.material); m.userData.mid = Math.atan2(m.position.x, m.position.z); }   // 颜料印子跟着飞
      else {
        const mat = m.material.clone();
        mat.transparent = true;
        m.material = mat;
        mats.push(mat);
      }
      // 往外飞：朝镜头那边的分量压小，免得碎块糊在屏幕上；再换算回这一层自己的坐标（整层带着旋转）
      const a = (m.userData.mid ?? 0) + ry;
      const sp = smash ? 7 + Math.random() * 3 : 6 + Math.random() * 2.5;
      // 朝镜头的那几块往左右甩开，不挡住小球
      const front = Math.cos(a) > 0.3;
      const vx = front ? (Math.sin(a) >= 0 ? 1 : -1) * sp : Math.sin(a) * sp;
      const vz = front ? Math.cos(a) * sp * 0.2 : Math.cos(a) * sp;
      m.userData.v = new THREE.Vector3(vx * Math.cos(ry) - vz * Math.sin(ry), (smash ? 1.5 : -0.5) + Math.random() * 1.5, vx * Math.sin(ry) + vz * Math.cos(ry));
      m.userData.w = new THREE.Vector3((Math.random() - 0.5) * 5, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 5);
      m.castShadow = false;
    });
    this.debris.push({ g, mats, life: 0 });
    // 碎屑
    const p = this.towerData.get(i);
    const n = smash ? 46 : 22;
    for (let k = 0; k < n; k++) {
      const a = Math.random() * TAU;
      const rr = R_IN + Math.random() * (R_OUT - R_IN);
      const local = a - ry;
      const sl = Math.floor((((local % TAU) + TAU) % TAU) / SLICE) % SLICES;
      const kind = p.finish ? 1 : p.slices[sl];
      if (kind === GAP) continue;
      const col = kind === RED ? this.cur.red : this.cur.plat;
      const sp = (smash ? 6 : 3.5) + Math.random() * 4;
      this.spawn(Math.sin(a) * rr, topY(i) - 0.15, Math.cos(a) * rr,
        Math.sin(a) * sp, 1 + Math.random() * (smash ? 6 : 3), Math.cos(a) * sp, col, 0.6 + Math.random() * 0.6, 0.7 + Math.random() * 0.6);
    }
    // 一圈光
    const ring = this.rings.find((x) => x.life <= 0) || this.rings[0];
    ring.life = 1; ring.m.visible = true;
    ring.m.position.y = topY(i) - PLAT_H / 2;
    ring.smash = smash;
  }

  spawn(x, y, z, vx, vy, vz, color, size = 1, life = 1) {
    if (this.parts.length >= this.PMAX) this.parts.shift();
    this.parts.push({ p: new THREE.Vector3(x, y, z), v: new THREE.Vector3(vx, vy, vz), r: new THREE.Vector3(Math.random() * 6, Math.random() * 6, Math.random() * 6), w: new THREE.Vector3((Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14), c: new THREE.Color(color), size, life, max: life });
  }

  /** 弹起来的地方留一个颜料印子 */
  splat(i, localAngle, onRed = false) {
    const g = this.plats.get(i);
    if (!g) return;
    const list = g.userData.splats;
    if (list.length >= 3) { const old = list.shift(); g.remove(old); old.material.dispose(); }
    this.splatGeo ||= new THREE.PlaneGeometry(1.15, 1.15);
    const m = new THREE.Mesh(this.splatGeo, new THREE.MeshStandardMaterial({
      map: this.splatTex, color: this.ballColor, transparent: true, depthWrite: false, roughness: 0.35,
      polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
    }));
    m.rotation.set(-Math.PI / 2, 0, Math.random() * TAU);
    m.position.set(Math.sin(localAngle) * BALL_DIST, onRed ? 0.054 : 0.004, Math.cos(localAngle) * BALL_DIST);
    m.scale.setScalar(0.2);
    m.userData.grow = 0;
    m.receiveShadow = true;
    g.add(m);
    list.push(m);
  }

  /** 撞到红色：小球碎成颜料 */
  burstBall(y, color) {
    for (let k = 0; k < 34; k++) {
      const a = Math.random() * TAU, sp = 2 + Math.random() * 5;
      this.spawn(0, y, BALL_DIST, Math.cos(a) * sp, 2 + Math.random() * 6, Math.sin(a) * sp * 0.7 + 1, color, 0.5 + Math.random() * 0.7, 0.7 + Math.random() * 0.5);
    }
    this.shake = 0.5;
  }

  confetti(y) {
    const cols = [0xff5d5d, 0xffc21a, 0x2f86ff, 0x8b5cf6, 0x22c55e, 0xff5fa2];
    for (let k = 0; k < 90; k++) {
      const a = Math.random() * TAU, sp = 2 + Math.random() * 6;
      this.spawn(Math.sin(a) * 1.5, y + 0.5, Math.cos(a) * 1.5, Math.sin(a) * sp, 6 + Math.random() * 8, Math.cos(a) * sp, cols[k % cols.length], 0.6 + Math.random() * 0.5, 1.6 + Math.random() * 0.8);
    }
  }

  /* ---------- 画面尺寸 / 省电 ---------- */
  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setPixelRatio(this.lowPower ? 1.25 : Math.min(2, window.devicePixelRatio || 1));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // 竖屏的时候要退远一点，整圈平台才放得下
    const half = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * Math.min(this.camera.aspect, 0.75);
    this.dist = Math.min(26, Math.max(11, (R_OUT * 1.2) / half));
    this.camera.far = this.dist + 60;
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

  /** 世界坐标 → 屏幕像素（飘分数用） */
  project(x, y, z) {
    const v = this._v.set(x, y, z).project(this.camera);
    return { x: (v.x * 0.5 + 0.5) * window.innerWidth, y: (-v.y * 0.5 + 0.5) * window.innerHeight };
  }

  /* ---------- 每一帧 ---------- */
  /**
   * st: { rot, time, dt, y, vy, squash, ballVisible, fire, trail, camTarget, shadowY, cur, gone(i), last }
   */
  update(st) {
    const dt = st.dt;
    if (this.themeT < 1) { this.themeT = Math.min(1, this.themeT + dt / 0.9); this.applyTheme(this.themeT); }

    // 镜头：只往下跟；小球掉得太快时不让它出画
    const k = 1 - Math.exp(-dt * 7.5);
    if (st.snap) this.camY = st.camTarget;
    else this.camY += (st.camTarget - this.camY) * k;
    if (st.y - 1.2 < this.camY) this.camY = Math.min(this.camY, st.y + 0.6);
    this.shake = Math.max(0, this.shake - dt * 1.6);
    const sh = this.shake * this.shake * 0.25;
    const EL = 0.6;
    const cy = this.camY;
    this.camera.position.set((Math.random() - 0.5) * sh, cy + Math.sin(EL) * this.dist + 0.6, Math.cos(EL) * this.dist);
    this.camera.lookAt(0, cy - 1.6 + (Math.random() - 0.5) * sh, 0);
    this.scene.fog.near = this.dist + 3;
    this.scene.fog.far = this.dist + 34;

    // 光和影子跟着镜头走
    this.key.position.set(-5, cy + 12, 7);
    this.key.target.position.set(0, cy - 2, 0);

    // 塔
    this.tower.rotation.y = st.rot;
    const top = this.PILLAR_TOP, bottom = cy - 40;
    const ptop = Math.min(top, cy + 22);
    this.pillar.scale.y = ptop - bottom;
    this.pillar.position.y = (ptop + bottom) / 2;
    this.cap.position.y = top;
    this.cap.visible = top < cy + 22;
    const T = this.towerData;
    if (T) {
      const lo = Math.max(0, st.cur - 1), hi = Math.min(st.cur + 7, T.total);
      for (const [i, g] of this.plats) if (i < lo || i > hi || st.gone(i)) { this.dropGroup(g); this.plats.delete(i); }
      for (let i = lo; i <= hi; i++) {
        if (st.gone(i)) continue;
        const p = T.get(i);
        let g = this.plats.get(i);
        if (!g) { g = this.buildPlatform(p); this.plats.set(i, g); this.tower.add(g); }
        g.rotation.y = p.rot + T.spinAt(p, st.time);
        for (const s of g.userData.splats) if (s.userData.grow < 1) { s.userData.grow = Math.min(1, s.userData.grow + dt * 9); const e = 1 - Math.pow(1 - s.userData.grow, 3); s.scale.setScalar(0.25 + e * 0.75); }
      }
    }
    this.mat.red.emissiveIntensity = 0.45 + 0.25 * Math.sin(st.time * 5);
    this.mat.finish.emissiveIntensity = 0.3 + 0.2 * Math.sin(st.time * 4);

    // 小球：落地压扁，掉得快拉长
    const sq = st.squash;
    let sy = 1 - sq * 0.42, sxz = 1 + sq * 0.3;
    if (st.vy < -6 && sq < 0.02) { const s = Math.min(0.16, (-st.vy - 6) / 90); sy += s; sxz -= s * 0.45; }
    this.ball.visible = st.ballVisible;
    this.ball.scale.set(sxz, sy, sxz);
    this.ball.position.set(0, st.y - BALL_R * (1 - sy), BALL_DIST);
    this.ball.rotation.x += dt * (st.vy * 0.4);
    const fireOn = st.fire && st.ballVisible;
    this.ballMat.emissiveIntensity += ((fireOn ? 1.25 : 0) - this.ballMat.emissiveIntensity) * Math.min(1, dt * 10);
    this.aura.material.opacity += ((fireOn ? 0.75 : 0) - this.aura.material.opacity) * Math.min(1, dt * 10);
    this.aura.position.copy(this.ball.position);
    this.aura.scale.setScalar(BALL_R * (3.6 + Math.sin(st.time * 30) * 0.3));

    // 影子
    const hasShadow = st.ballVisible && st.shadowY != null;
    this.blob.visible = hasShadow;
    if (hasShadow) {
      const hgt = Math.max(0, st.y - BALL_R - st.shadowY);
      const s = 0.95 - Math.min(0.45, hgt * 0.08);
      this.blob.scale.set(s, s, 1);
      this.blob.position.set(0, st.shadowY + 0.01, BALL_DIST);
      this.blob.material.opacity = Math.max(0.12, 0.7 - hgt * 0.09) * (this.lowPower ? 1 : 0.75);
    }

    // 拖尾
    this.trailT += dt;
    if (st.trail && !fireOn && st.ballVisible && st.vy < -9 && this.trailT > 0.016) {
      this.trailT = 0;
      const t = this.trail.find((x) => x.life <= 0) || this.trail.reduce((a, b) => (a.life < b.life ? a : b));
      t.life = 1; t.s.visible = true; t.s.position.set(0, st.y + 0.05, BALL_DIST);
    }
    for (const t of this.trail) {
      if (t.life <= 0) continue;
      t.life -= dt * 4;
      if (t.life <= 0) { t.s.visible = false; continue; }
      t.s.material.opacity = t.life * 0.45;
      t.s.scale.setScalar(BALL_R * 2 * (0.4 + t.life * 0.6));
    }

    // 火焰
    this.flameT += dt;
    if (fireOn && this.flameT > 0.012) {
      this.flameT = 0;
      for (let n = 0; n < 2; n++) {
        const f = this.flames.find((x) => x.life <= 0);
        if (!f) break;
        f.life = 1; f.s.visible = true;
        f.s.position.set((Math.random() - 0.5) * 0.3, st.y + (Math.random() - 0.3) * 0.2, BALL_DIST + (Math.random() - 0.5) * 0.3);
        f.v.set((Math.random() - 0.5) * 1.2, 2 + Math.random() * 2 + Math.max(0, -st.vy * 0.5), (Math.random() - 0.5) * 1.2);
      }
    }
    for (const f of this.flames) {
      if (f.life <= 0) continue;
      f.life -= dt * 3.2;
      if (f.life <= 0) { f.s.visible = false; continue; }
      f.s.position.addScaledVector(f.v, dt);
      f.s.material.opacity = Math.min(1, f.life * 1.3) * 0.9;
      f.s.scale.setScalar(BALL_R * (0.5 + f.life * 1.5));
    }

    // 飞走的平台
    for (let n = this.debris.length - 1; n >= 0; n--) {
      const d = this.debris[n];
      d.life += dt;
      for (const m of d.g.children) {
        if (!m.userData.v) continue;
        m.userData.v.y -= 18 * dt;
        m.position.addScaledVector(m.userData.v, dt);
        m.rotation.x += m.userData.w.x * dt; m.rotation.z += m.userData.w.z * dt;
      }
      const o = Math.max(0, 1 - d.life / 0.36);
      d.mats.forEach((m) => (m.opacity = o * o * 0.92));
      const sc = 1 - d.life * 0.9;
      for (const m of d.g.children) if (m.userData.v) m.scale.setScalar(sc);
      if (d.life > 0.36) { this.scene.remove(d.g); d.mats.forEach((m) => m.dispose()); this.debris.splice(n, 1); }
    }

    // 光圈
    for (const r of this.rings) {
      if (r.life <= 0) continue;
      r.life -= dt * 2.6;
      if (r.life <= 0) { r.m.visible = false; continue; }
      const e = 1 - r.life;
      const s = R_OUT * (0.9 + e * (r.smash ? 1.1 : 0.6));
      r.m.scale.set(s, s, s);
      r.m.material.opacity = r.life * r.life * (r.smash ? 0.8 : 0.4);
    }

    // 碎屑
    const P = this.parts;
    for (let n = P.length - 1; n >= 0; n--) {
      const q = P[n];
      q.life -= dt;
      if (q.life <= 0) { P.splice(n, 1); continue; }
      q.v.y -= 20 * dt;
      q.v.multiplyScalar(1 - dt * 0.6);
      q.p.addScaledVector(q.v, dt);
      q.r.addScaledVector(q.w, dt);
    }
    for (let n = 0; n < P.length; n++) {
      const q = P[n];
      const s = q.size * Math.min(1, (q.life / q.max) * 2.5);
      this._m.compose(q.p, this._q.setFromEuler(this._e.set(q.r.x, q.r.y, q.r.z)), this._s.set(s, s, s));
      this.shards.setMatrixAt(n, this._m);
      this.shards.setColorAt(n, q.c);
    }
    this.shards.count = P.length;
    if (P.length) { this.shards.instanceMatrix.needsUpdate = true; this.shards.instanceColor.needsUpdate = true; }
  }

  render() { this.renderer.render(this.scene, this.camera); }
}
