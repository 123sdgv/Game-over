// 打罐子的 3D 画面：只管「画」。规则在 game.js，碰撞在 physics.js。
//   背景是一张画好的图（img/backdrop.jpg）贴在远处的一块板上；地面、台子、罐子、枪是 3D 的。
import * as THREE from '../_shared/lib/three.module.min.js';
import { canGeometry, LABEL_TINT } from './art.js';
import { staticParts, cartDeck, cartRail, cartX } from './props.js';
import { CAN_R, CAN_H, BOARD_T, bounds } from './levels.js';
import { Gun } from './gun.js';
import { Particles, Tracers, Shards } from './fx.js';

const DEG = Math.PI / 180;
const VFOV = 50;
const BACK_Z = -34;
const BACK_W = 46, BACK_H = 50;
const SUN_DIR = new THREE.Vector3(-4.6, 16, -34).normalize();
const FOG = 0x48532c;
const rgb = (h) => { const c = new THREE.Color(h); return [c.r, c.g, c.b]; };
const lerp = (a, b, t) => a + (b - a) * t;

/** 方块，贴图 u 沿着最长的边（木纹方向），按实际尺寸算，不会拉伸 */
function woodBox(w, h, d, tileU = 6, tileV = 1.5) {
  const g = new THREE.BoxGeometry(w, h, d);
  const pos = g.attributes.position, nor = g.attributes.normal, uv = g.attributes.uv;
  const ext = [w, h, d];
  for (let i = 0; i < pos.count; i++) {
    const n = [Math.abs(nor.getX(i)), Math.abs(nor.getY(i)), Math.abs(nor.getZ(i))];
    const p = [pos.getX(i), pos.getY(i), pos.getZ(i)];
    const ax = n[0] > 0.5 ? [1, 2] : n[1] > 0.5 ? [0, 2] : [0, 1];
    const [a, b] = ext[ax[0]] >= ext[ax[1]] ? ax : [ax[1], ax[0]];
    uv.setXY(i, p[a] / tileU, p[b] / tileV + 0.5);
  }
  return g;
}

/** 树桩：不太圆、根部往外张一点 */
function stumpGeometry(r, h) {
  const g = new THREE.CylinderGeometry(r, r * 1.16, h, 36, 8, true);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const a = Math.atan2(z, x);
    const t = (y + h / 2) / h;
    const k = 1 + Math.sin(a * 3 + 1.3) * 0.04 + Math.sin(a * 7) * 0.025 + (1 - t) * (1 - t) * 0.12 * (0.5 + 0.5 * Math.sin(a * 5));
    pos.setX(i, x * k); pos.setZ(i, z * k);
  }
  g.computeVertexNormals();
  return g;
}

/** 油桶：两道加强筋、上下卷边 */
function drumGeometry(r, h) {
  const pts = [];
  const add = (rr, y) => pts.push(new THREE.Vector2(rr, y));
  add(r * 0.94, 0); add(r * 1.0, 0.04); add(r * 1.015, 0.12); add(r * 1.0, 0.2);
  for (const f of [1 / 3, 2 / 3]) {
    const y = h * f;
    add(r, y - 0.22); add(r * 1.03, y - 0.08); add(r * 1.035, y); add(r * 1.03, y + 0.08); add(r, y + 0.22);
  }
  add(r * 1.0, h - 0.2); add(r * 1.015, h - 0.1); add(r * 1.0, h - 0.02); add(r * 0.95, h);
  const g = new THREE.LatheGeometry(pts, 40);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setY(i, g.attributes.position.getY(i) / h);
  g.computeVertexNormals();
  return g;
}

/** 镜头要框住的范围：罐子和木板（小车上的算上它来回走的距离），台子伸出画面没关系 */
function viewBounds(spec) {
  let x0 = Infinity, x1 = -Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const it of spec.items) {
    const half = it.k === 'board' ? it.w / 2 : CAN_R;
    x0 = Math.min(x0, it.x - half); x1 = Math.max(x1, it.x + half);
    y1 = Math.max(y1, it.y + (it.k === 'can' ? CAN_H / 2 : BOARD_T / 2));
    z0 = Math.min(z0, it.z); z1 = Math.max(z1, it.z);
  }
  for (const p of spec.supports) {
    if (p.kind !== 'cart') continue;
    x0 = Math.min(x0, p.x - p.amp - p.w / 2); x1 = Math.max(x1, p.x + p.amp + p.w / 2);
  }
  const y0 = Math.min(...spec.supports.map((p) => p.top));
  return { x0, x1, y0, y1, z0, z1 };
}

/** 相机取景：罐子横向占屏幕大约 80%（至少有 4.6 分米宽），稍微俯视，罐子在屏幕中间偏上（下面留给枪） */
export function cameraFor(spec, aspect) {
  const b = viewBounds(spec);
  const tanV = Math.tan((VFOV / 2) * DEG), tanH = tanV * aspect;
  const span = Math.max(4.6, b.x1 - b.x0 + 1.6);
  const tall = b.y1 - b.y0 + 2.4;
  const D = Math.max(12, span / (2 * tanH * 0.9), tall / (2 * tanV * 0.58));
  const cx = (b.x0 + b.x1) / 2;
  const cz = (b.z0 + b.z1) / 2;
  const cy = (b.y0 + b.y1) / 2;
  const ly = cy - 0.1 * D * tanV;
  return { pos: [cx * 0.75, ly + D * Math.tan(10 * DEG), cz + D], look: [cx * 0.9, ly, cz], D, span, cx, cz };
}

export class Scene {
  constructor(canvas, art) {
    this.art = art;
    const r = (this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' }));
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.toneMapping = THREE.NeutralToneMapping;
    r.toneMappingExposure = 1.0;
    const scene = (this.scene = new THREE.Scene());
    scene.background = new THREE.Color(0x3a3060);
    scene.fog = new THREE.Fog(FOG, 50, 90);
    const cam = (this.camera = new THREE.PerspectiveCamera(VFOV, 1, 0.08, 260));
    scene.add(cam);
    this.lowPower = false;
    this.shake = 0;
    this.camBase = new THREE.Vector3(0, 13, 30);
    this.camLook = new THREE.Vector3(0, 9, 0);
    this.camGoal = null;

    this.makeEnvironment();

    // 灯：太阳在栅栏后面偏左，逆光；前面有一点暖暖的补光，天光是蓝紫色
    this.hemi = new THREE.HemisphereLight(0xb7b0ff, 0x6b5530, 1.35);
    scene.add(this.hemi);
    const sun = (this.sun = new THREE.DirectionalLight(0xffb06a, 3.1));
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.025;
    sun.shadow.radius = 3;
    scene.add(sun, sun.target);
    this.fill = new THREE.DirectionalLight(0xffd6c2, 1.15);
    scene.add(this.fill, this.fill.target);
    this.flashLight = new THREE.PointLight(0xffc070, 0, 6, 1.6);
    cam.add(this.flashLight);
    this.boomLight = new THREE.PointLight(0xff8a30, 0, 26, 1.4);
    scene.add(this.boomLight);

    // 背景板
    const tl = new THREE.TextureLoader();
    this.backTex = tl.load('img/backdrop.jpg', () => { this.dirty = true; });
    this.backTex.colorSpace = THREE.SRGBColorSpace;
    this.backTex.anisotropy = 4;
    const back = new THREE.Mesh(new THREE.PlaneGeometry(BACK_W, BACK_H), new THREE.MeshBasicMaterial({ map: this.backTex, fog: false, toneMapped: false }));
    back.position.set(0, BACK_H / 2 - 1, BACK_Z);
    scene.add(back);

    // 地面
    art.grass.repeat.set(36, 36);
    const ground = (this.ground = new THREE.Mesh(
      new THREE.PlaneGeometry(260, 260),
      new THREE.MeshStandardMaterial({ map: art.grass, color: 0xd8dcc0, roughness: 0.96, metalness: 0 }),
    ));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    this.tuftMat = new THREE.MeshStandardMaterial({ map: art.tuft, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 1, color: 0xe8ecd0 });
    const tg = new THREE.PlaneGeometry(1.6, 1.25);
    tg.translate(0, 0.62, 0);
    const tg2 = tg.clone().rotateY(Math.PI / 2);
    this.tuftGeo = mergeSimple([tg, tg2]);
    this.tufts = null;

    // 关卡里的东西
    this.level = new THREE.Group();
    scene.add(this.level);
    this.items = [];
    this.carts = [];
    this.sprays = [];
    this.mats = {};
    this.canGeo = canGeometry(40);
    this.lidMat = new THREE.MeshStandardMaterial({ map: art.lid, metalness: 0.95, roughness: 0.28 });
    this.holeMat = new THREE.MeshStandardMaterial({ map: art.hole, transparent: true, alphaTest: 0.1, metalness: 0.85, roughness: 0.3, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
    this.holeGeo = new THREE.PlaneGeometry(0.2, 0.2);

    // 枪
    this.gun = new Gun(art, this.gunEnv);
    cam.add(this.gun.root);
    this.aimPoint = new THREE.Vector3(0, 9, 0);
    this.aiming = false;

    // 特效
    this.fx = new Particles(1400, art.particles, false);
    this.glow = new Particles(900, art.particles, true);
    scene.add(this.fx.points, this.glow.points);
    this.tracers = new Tracers(scene);
    this.shards = new Shards(scene, this.env);

    this.ray = new THREE.Raycaster();
    this.v = new THREE.Vector3();
    this.v2 = new THREE.Vector3();
    this.time = 0;
    this.dirty = true;
  }

  /** 反光用的环境：一个夕阳天空的球，太阳那边很亮 */
  makeEnvironment() {
    const env = new THREE.Scene();
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      uniforms: { sun: { value: SUN_DIR } },
      vertexShader: 'varying vec3 d; void main(){ d = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform vec3 sun; varying vec3 d;
        void main(){
          float h = d.y;
          vec3 top = vec3(0.18,0.2,0.48), mid = vec3(0.95,0.55,0.55), hor = vec3(1.0,0.72,0.42), gnd = vec3(0.2,0.24,0.12);
          vec3 c = h > 0.0 ? mix(mix(hor, mid, smoothstep(0.0,0.25,h)), top, smoothstep(0.2,0.8,h)) : mix(vec3(0.35,0.3,0.2), gnd, smoothstep(0.0,0.3,-h));
          float s = max(0.0, dot(d, sun));
          c += vec3(1.0,0.8,0.5) * (pow(s, 40.0) * 6.0 + pow(s, 6.0) * 0.6);
          gl_FragColor = vec4(c, 1.0);
        }`,
    });
    env.add(new THREE.Mesh(new THREE.SphereGeometry(40, 48, 24), mat));
    // 前面一块柔和的亮板（补光的反光）
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(30, 14), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.4, 1.2, 1.05) }));
    panel.position.set(-8, 10, 30); panel.lookAt(0, 0, 0);
    env.add(panel);
    const pm = new THREE.PMREMGenerator(this.renderer);
    this.env = pm.fromScene(env, 0.03).texture;
    // 枪用的「影棚」：中性灰，上面一块暖光、侧面一条冷光，金属看起来干净
    const studio = new THREE.Scene();
    const sm = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      vertexShader: 'varying vec3 d; void main(){ d = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'varying vec3 d; void main(){ float h = d.y; vec3 c = mix(vec3(0.16,0.15,0.17), vec3(0.62,0.62,0.66), smoothstep(-0.6, 0.7, h)); gl_FragColor = vec4(c, 1.0); }',
    });
    studio.add(new THREE.Mesh(new THREE.SphereGeometry(20, 32, 16), sm));
    for (const [x, y, z, w, h, col] of [[-6, 12, -4, 14, 5, [2.6, 2.1, 1.6]], [10, 3, 4, 3, 14, [1.3, 1.5, 1.9]], [0, 6, 14, 12, 4, [1.5, 1.4, 1.3]]]) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(...col), side: THREE.DoubleSide }));
      m.position.set(x, y, z); m.lookAt(0, 0, 0);
      studio.add(m);
    }
    this.gunEnv = pm.fromScene(studio, 0.02).texture;
    pm.dispose();
    this.scene.environment = this.env;
    this.scene.environmentIntensity = 0.75;
  }

  setLowPower(v) {
    this.lowPower = v;
    this.sun.castShadow = !v;
    this.resize();
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.lowPower ? 1.25 : 2));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    const scale = (h * this.renderer.getPixelRatio()) / (2 * Math.tan((VFOV / 2) * DEG));
    this.fx.mat.uniforms.uScale.value = scale;
    this.glow.mat.uniforms.uScale.value = scale;
    // 枪摆在右下角：按屏幕比例放，窄屏宽屏都露出差不多的一截
    const z = -1.5;
    const hh = -z * Math.tan((VFOV / 2) * DEG), hw = hh * this.camera.aspect;
    this.gun.root.position.set(hw * 0.5, -hh * 0.6, z);
    this.gun.root.scale.setScalar(Math.min(0.48, hw * 1.04));
    if (this.spec) this.fit(this.spec, true);
    this.dirty = true;
  }

  /* ------------------------------------------------------------ 摆一关 */
  material(key) {
    if (this.mats[key]) return this.mats[key];
    const A = this.art;
    let m;
    const std = (o) => new THREE.MeshStandardMaterial(o);
    if (key.startsWith('label')) {
      const k = +key.slice(5);
      m = std({ map: A.labels[k], metalnessMap: A.canMR, roughnessMap: A.canMR, metalness: 1, roughness: 1, envMapIntensity: 1.1 });
    } else if (key === 'boom') m = std({ map: A.boom, metalnessMap: A.canMR, roughnessMap: A.canMR, metalness: 1, roughness: 1, envMapIntensity: 1.1 });
    else if (key === 'gold') m = std({ map: A.gold, metalnessMap: A.goldMR, roughnessMap: A.goldMR, metalness: 1, roughness: 1, envMapIntensity: 1.6, emissive: 0x3a2400, emissiveIntensity: 0.6 });
    else if (key === 'plank') m = std({ map: A.plank, bumpMap: A.plankBump, bumpScale: 1.2, roughness: 0.85 });
    else if (key === 'horse') m = std({ map: A.horse, roughness: 0.9 });
    else if (key === 'board') m = std({ map: A.board, roughness: 0.8 });
    else if (key === 'post') m = std({ map: A.post, roughness: 0.9 });
    else if (key === 'crate') m = std({ map: A.crate, roughness: 0.85 });
    else if (key === 'bark') m = std({ map: A.bark, bumpMap: A.barkBump, bumpScale: 3, roughness: 0.95 });
    else if (key === 'rings') m = std({ map: A.rings, roughness: 0.8 });
    else if (key.startsWith('drumTop')) m = std({ map: A[key], metalness: 0.45, roughness: 0.55 });
    else if (key.startsWith('drum')) m = std({ map: A[key], metalness: 0.45, roughness: 0.5, envMapIntensity: 0.8 });
    else if (key === 'rail') m = std({ color: 0x4a4d55, metalness: 0.9, roughness: 0.38 });
    else if (key === 'cartFrame') m = std({ color: 0xc23b2c, metalness: 0.4, roughness: 0.42 });
    else if (key === 'wheel') m = std({ color: 0x2b2c31, metalness: 0.6, roughness: 0.45 });
    else m = std({ color: 0x999999 });
    this.mats[key] = m;
    return m;
  }

  clearLevel() {
    for (const o of [...this.level.children]) {
      this.level.remove(o);
      o.traverse((m) => { if (m.isMesh && m.geometry !== this.canGeo && m.geometry !== this.holeGeo && !m.userData.sharedGeo) m.geometry.dispose(); });
    }
    this.items = [];
    this.carts = [];
    this.sprays = [];
    this.fx.clear(); this.glow.clear(); this.tracers.clear(); this.shards.clear();
  }

  build(spec) {
    this.clearLevel();
    this.spec = spec;
    const lv = this.level;
    const mesh = (geo, mat, cast = true, recv = true) => {
      const m = new THREE.Mesh(geo, mat);
      m.castShadow = cast; m.receiveShadow = recv;
      return m;
    };
    for (const p of spec.supports) {
      for (const part of staticParts(p)) {
        let m;
        if (part.mat === 'stump') {
          const grp = new THREE.Group();
          const tex = this.art.bark;
          tex.repeat.set(2, part.h / 5);
          grp.add(mesh(stumpGeometry(part.r, part.h), this.material('bark')));
          const top = mesh(new THREE.CircleGeometry(part.r, 36).rotateX(-Math.PI / 2), this.material('rings'));
          top.position.y = part.h / 2;
          grp.add(top);
          m = grp;
        } else if (part.mat === 'drum') {
          const k = p.color || 0;
          const grp = new THREE.Group();
          const body = mesh(drumGeometry(part.r, part.h), this.material(`drum${k}`));
          body.position.y = -part.h / 2;
          grp.add(body);
          const top = mesh(new THREE.CircleGeometry(part.r * 0.95, 40).rotateX(-Math.PI / 2), this.material(`drumTop${k}`));
          top.position.y = part.h / 2 - 0.03;
          grp.add(top);
          m = grp;
        } else if (part.mat === 'rail') {
          m = mesh(new THREE.CylinderGeometry(0.11, 0.11, part.size[0], 14).rotateZ(Math.PI / 2), this.material('rail'));
        } else if (part.mat === 'crate') {
          m = mesh(new THREE.BoxGeometry(...part.size), this.material('crate'));
        } else if (part.mat === 'post') {
          m = mesh(woodBox(...part.size, 4, 1), this.material('post'));
        } else {
          const tile = part.mat === 'plank' ? [6, 1.5] : [4, 1];
          m = mesh(woodBox(...part.size, ...tile), this.material(part.mat));
        }
        m.position.set(...part.pos);
        m.quaternion.set(...part.quat);
        lv.add(m);
      }
      if (p.kind === 'cart') this.buildCart(p, mesh);
    }
    spec.items.forEach((it, i) => {
      let m;
      if (it.k === 'can') {
        const key = it.t === 'b' ? 'boom' : it.t === 'g' ? 'gold' : `label${it.l}`;
        m = mesh(this.canGeo, [this.material(key), this.lidMat]);
        m.rotation.y = ((i * 2.399) % (Math.PI * 2));
        m.userData.tint = it.t === 'b' ? this.art.boomTint : it.t === 'g' ? this.art.goldTint : LABEL_TINT[it.l];
      } else {
        m = mesh(woodBox(it.w, BOARD_T, it.d, 3, 0.8), this.material('board'));
      }
      m.position.set(it.x, it.y, it.z);
      m.scale.setScalar(0.001);
      lv.add(m);
      this.items.push({ m, it, gone: false, intro: 0 });
    });
    // 一个个冒出来：从下往上
    const order = this.items.map((x, i) => i).sort((a, b) => this.items[a].it.y - this.items[b].it.y || this.items[a].it.x - this.items[b].it.x);
    order.forEach((i, k) => { this.items[i].delay = 0.12 + k * Math.min(0.05, 0.9 / order.length); });
    this.introT = 0;
    this.introLen = 0.12 + order.length * Math.min(0.05, 0.9 / order.length) + 0.32;
    this.placeTufts(spec);
    this.fit(spec, !this.camGoal);
    this.dirty = true;
  }

  /** 读档时不用一个个冒出来 */
  skipIntro() {
    this.introT = this.introLen;
    for (const x of this.items) { x.m.scale.setScalar(1); x.popped = true; }
  }

  buildCart(p, mesh) {
    const g = new THREE.Group();
    const d = cartDeck(p);
    const deck = mesh(woodBox(...d.size, 3, 1), this.material('plank'));
    deck.position.set(...d.pos);
    g.add(deck);
    // 红色铁架子 + 底下两对轮子骑在轨道上
    const rail = cartRail(p);
    const drop = p.top - 0.36 - rail.y;
    for (const s of [-1, 1]) {
      const lip = mesh(new THREE.BoxGeometry(p.w + 0.12, 0.16, 0.12), this.material('cartFrame'));
      lip.position.set(0, -0.3, s * (p.d / 2 + 0.02));
      g.add(lip);
      const leg = mesh(new THREE.BoxGeometry(0.18, drop, 0.18), this.material('cartFrame'));
      leg.position.set(s * (p.w / 2 - 0.5), -0.36 - drop / 2, 0);
      g.add(leg);
    }
    const bar = mesh(new THREE.BoxGeometry(p.w - 0.6, 0.14, 0.5), this.material('cartFrame'));
    bar.position.set(0, -0.36 - drop + 0.38, 0);
    g.add(bar);
    const wheels = [];
    for (const s of [-1, 1]) {
      for (const zs of [-1, 1]) {
        const w = mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.1, 20).rotateX(Math.PI / 2), this.material('wheel'));
        w.position.set(s * (p.w / 2 - 0.5), -0.36 - drop + 0.21, zs * 0.17);
        const hub = mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.12, 10).rotateX(Math.PI / 2), this.material('rail'));
        w.add(hub);
        // 轮子上一道亮色，看得出在转
        const mark = mesh(new THREE.BoxGeometry(0.05, 0.16, 0.11), this.material('cartFrame'));
        mark.position.y = 0.08;
        w.add(mark);
        g.add(w);
        wheels.push(w);
      }
    }
    g.position.set(cartX(p, 0), p.top, p.z);
    this.level.add(g);
    this.carts.push({ p, g, wheels });
  }

  placeTufts(spec) {
    if (this.tufts) { this.scene.remove(this.tufts); this.tufts.dispose(); }
    const N = 340;
    const im = new THREE.InstancedMesh(this.tuftGeo, this.tuftMat, N);
    im.receiveShadow = true;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), c = new THREE.Color();
    let seed = 7;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const busy = (x, z) => spec.supports.some((sp) => {
      const half = sp.kind === 'plank' ? sp.w / 2 + 1.5 : sp.kind === 'cart' ? sp.amp + sp.w / 2 + 1.2 : sp.kind === 'crate' ? sp.s / 2 + 0.3 : sp.r + 0.2;
      return Math.abs(x - sp.x) < half && Math.abs(z - sp.z) < (sp.kind === 'plank' ? sp.d / 2 + 1.6 : half);
    });
    let n = 0;
    for (let i = 0; i < N * 3 && n < N; i++) {
      const band = i % 3 === 0;
      const x = (rnd() - 0.5) * (band ? 50 : 44);
      const z = band ? BACK_Z + 0.4 + rnd() * 4 : -30 + rnd() * 52;
      if (!band && busy(x, z)) continue;
      const sc = band ? 1.1 + rnd() * 1.1 : 0.55 + rnd() * 0.85;
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rnd() * Math.PI);
      m.compose(p.set(x, 0, z), q, s.set(sc, sc * (0.8 + rnd() * 0.5), sc));
      im.setMatrixAt(n, m);
      im.setColorAt(n, c.setHSL(0.2 + rnd() * 0.05, 0.4, 0.42 + rnd() * 0.22));
      n++;
    }
    im.count = n;
    this.tufts = im;
    this.scene.add(im);
  }

  /** 相机取景（算法在 cameraFor 里，机器人试打也用它） */
  fit(spec, instant) {
    const c = cameraFor(spec, this.camera.aspect);
    const pos = new THREE.Vector3(...c.pos), look = new THREE.Vector3(...c.look);
    const D = c.D, span = c.span, cx = c.cx, cz = c.cz;
    this.camGoal = { pos, look, D };
    if (instant) { this.camBase.copy(pos); this.camLook.copy(look); }
    if (!this.aiming) this.aimPoint.copy(look);
    // 阴影只照这一块
    const sc = this.sun.shadow.camera;
    const half = Math.max(12, span * 0.75);
    Object.assign(sc, { left: -half, right: half, top: half, bottom: -half * 0.8, near: 1, far: 120 });
    sc.updateProjectionMatrix();
    const center = new THREE.Vector3(cx, 6, cz);
    this.sun.target.position.copy(center);
    this.sun.position.copy(center).addScaledVector(SUN_DIR, 60);
    this.fill.target.position.copy(center);
    this.fill.position.copy(center).add(new THREE.Vector3(-10, 14, 26));
    this.scene.fog.near = D + 14;
    this.scene.fog.far = D + 48;
    this.dirty = true;
  }

  /* ------------------------------------------------------------ 每帧 */
  /** phys：拿位置；aim：{ x, y } 屏幕上的准星（或 null） */
  update(dt, phys, aim) {
    this.time += dt;
    // 相机慢慢挪到位、抖动
    if (this.camGoal) {
      const k = 1 - Math.exp(-dt * 3.2);
      this.camBase.lerp(this.camGoal.pos, k);
      this.camLook.lerp(this.camGoal.look, k);
    }
    this.shake = Math.max(0, this.shake - dt * 2.4);
    const sh = this.shake * this.shake * 0.55;
    this.camera.position.copy(this.camBase).add(this.v.set((Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh, 0));
    this.camera.lookAt(this.camLook);
    this.camera.updateMatrixWorld();

    // 罐子一个个冒出来
    if (this.introT < this.introLen) {
      this.introT += dt;
      for (const x of this.items) {
        const t = Math.max(0, Math.min(1, (this.introT - x.delay) / 0.3));
        const e = t === 1 ? 1 : 1 + 2.4 * Math.pow(t - 1, 3) + 1.4 * Math.pow(t - 1, 2);
        x.m.scale.setScalar(Math.max(0.001, e));
        if (t > 0 && !x.popped) { x.popped = true; this.onPop && this.onPop(x); }
      }
      this.dirty = true;
    }
    // 位置跟着物理走
    if (phys && phys.items.length === this.items.length) {
      const P = this.P || (this.P = {});
      for (let i = 0; i < this.items.length; i++) {
        const x = this.items[i];
        if (x.gone) continue;
        const pi = phys.items[i];
        if (pi.gone) { x.gone = true; x.m.visible = false; continue; }
        if (!pi.b.isActive() && x.synced) continue;
        phys.pose(pi.b, P);
        x.m.position.set(P.x, P.y, P.z);
        x.m.quaternion.set(P.qx, P.qy, P.qz, P.qw);
        x.synced = true;
        this.dirty = true;
      }
      for (const c of this.carts) {
        const nx = cartX(c.p, phys.time);
        const dx = nx - c.g.position.x;
        c.g.position.x = nx;
        for (const w of c.wheels) w.rotation.z -= dx / 0.2;
        this.dirty = true;
      }
    }

    // 汽水喷出来
    for (let i = this.sprays.length - 1; i >= 0; i--) {
      const s = this.sprays[i];
      s.t += dt;
      if (s.t > s.dur || !s.x.m.visible) { this.sprays.splice(i, 1); continue; }
      const k = 1 - s.t / s.dur;
      const wp = s.x.m.localToWorld(this.v.copy(s.lp));
      const wn = this.v2.copy(s.ln).applyQuaternion(s.x.m.quaternion);
      s.acc += dt * 140 * k;
      while (s.acc >= 1) {
        s.acc--;
        const sp = 5 + Math.random() * 5 * k;
        const foam = Math.random() < 0.35;
        this.fx.spawn({
          p: [wp.x, wp.y, wp.z],
          v: [wn.x * sp + (Math.random() - 0.5) * 1.6, wn.y * sp + Math.random() * 1.5, wn.z * sp + (Math.random() - 0.5) * 1.6],
          life: 0.5 + Math.random() * 0.4, s0: foam ? 0.09 : 0.06, s1: foam ? 0.18 : 0.04,
          c0: foam ? [1, 1, 1] : s.col, c1: s.col, a0: foam ? 0.75 : 0.95, a1: 0, tile: 0, grav: 30, drag: 0.6, floor: 0.03,
        });
      }
    }

    // 枪：指着准星；开完枪再举一小会儿，没按着就放下
    if (aim) {
      const o = this.screenRay(aim.x, aim.y);
      this.aimPoint.copy(o.origin).addScaledVector(o.dir, o.hit ? o.hit : 40);
    }
    this.holdT = Math.max(0, (this.holdT || 0) - dt);
    this.aiming = !!aim || this.holdT > 0;
    const local = this.camera.worldToLocal(this.v.copy(this.aimPoint));
    local.sub(this.gun.root.position).normalize();
    this.gun.update(dt, local, this.aiming);

    this.flashLight.intensity *= Math.exp(-dt * 30);
    this.boomLight.intensity *= Math.exp(-dt * 5);
    this.fx.update(dt);
    this.glow.update(dt);
    this.tracers.update(dt, this.camera);
    this.shards.update(dt, 40);
  }

  render() {
    this.renderer.render(this.scene, this.camera);
    this.dirty = false;
  }

  /* ------------------------------------------------------------ 坐标 */
  /** 屏幕上一点 → 世界里的一条射线（hit：大概多远会碰到东西，用 three 自己算一下） */
  screenRay(x, y) {
    const ndc = new THREE.Vector2((x / window.innerWidth) * 2 - 1, -(y / window.innerHeight) * 2 + 1);
    this.camera.updateMatrixWorld();
    this.ray.setFromCamera(ndc, this.camera);
    const hits = this.ray.intersectObjects([this.level, this.ground], true);
    return { origin: this.ray.ray.origin.clone(), dir: this.ray.ray.direction.clone(), hit: hits.length ? hits[0].distance : 0, obj: hits.length ? hits[0].object : null };
  }

  /** 准星下面是不是罐子（给准星变色用） */
  canUnder(x, y) {
    const r = this.screenRay(x, y);
    if (!r.obj) return -1;
    return this.items.findIndex((it) => it.m === r.obj && it.it.k === 'can');
  }

  project(p) {
    const v = this.v.set(p[0], p[1], p[2]).project(this.camera);
    return { x: (v.x * 0.5 + 0.5) * window.innerWidth, y: (-v.y * 0.5 + 0.5) * window.innerHeight };
  }

  muzzle() {
    this.camera.updateMatrixWorld();
    return this.gun.muzzle.getWorldPosition(new THREE.Vector3());
  }

  /* ------------------------------------------------------------ 特效 */
  /** 开枪：枪口火光、烟、光迹、枪往上跳 */
  fire(target) {
    this.gun.fire();
    this.holdT = 0.6;
    this.aimPoint.set(...target);
    const mz = this.muzzle();
    const dir = new THREE.Vector3(...target).sub(mz).normalize();
    this.tracers.add([mz.x + dir.x * 0.2, mz.y + dir.y * 0.2, mz.z + dir.z * 0.2], target);
    this.glow.spawn({ p: [mz.x, mz.y, mz.z], life: 0.07, s0: 0.26, s1: 0.4, c0: [1, 0.85, 0.5], c1: [1, 0.5, 0.2], a0: 1, a1: 0.2, tile: 2 });
    this.glow.spawn({ p: [mz.x + dir.x * 0.12, mz.y + dir.y * 0.12, mz.z + dir.z * 0.12], life: 0.09, s0: 0.5, s1: 0.7, c0: [1, 0.6, 0.25], c1: [0.8, 0.25, 0.05], a0: 0.8, a1: 0, tile: 0 });
    for (let i = 0; i < 6; i++) {
      const sp = 0.6 + Math.random() * 1.2;
      this.fx.spawn({
        p: [mz.x, mz.y, mz.z], v: [dir.x * sp + (Math.random() - 0.5) * 0.3, dir.y * sp + 0.25 + Math.random() * 0.3, dir.z * sp + (Math.random() - 0.5) * 0.3],
        life: 0.8 + Math.random() * 0.6, s0: 0.05, s1: 0.32 + Math.random() * 0.2, c0: [0.92, 0.88, 0.86], c1: [0.8, 0.78, 0.8], a0: 0.4, a1: 0, tile: 1, spin: (Math.random() - 0.5) * 2, drag: 2.2, fadeIn: 0.05,
      });
    }
    this.flashLight.position.copy(this.camera.worldToLocal(mz.clone()));
    this.flashLight.intensity = 8;
    this.shake = Math.max(this.shake, 0.22);
  }

  /** 子弹打中东西 */
  hit(ev, item) {
    const [x, y, z] = ev.point;
    const n = ev.normal;
    const bounce = (k) => [n[0] * k, n[1] * k, n[2] * k];
    if (item && item.it.k === 'can') {
      // 火星 + 一闪
      this.glow.spawn({ p: [x, y, z], life: 0.09, s0: 0.7, s1: 1.1, c0: [1, 0.95, 0.75], c1: [1, 0.7, 0.3], a0: 1, a1: 0, tile: 3, rot: Math.random() * 6 });
      for (let i = 0; i < 12; i++) {
        const b = bounce(4 + Math.random() * 8);
        this.glow.spawn({ p: [x, y, z], v: [b[0] + (Math.random() - 0.5) * 9, b[1] + Math.random() * 6, b[2] + (Math.random() - 0.5) * 9], life: 0.18 + Math.random() * 0.2, s0: 0.07, s1: 0.02, c0: [1, 0.9, 0.6], c1: [1, 0.45, 0.1], a0: 1, a1: 0, grav: 30 });
      }
      if (ev.first) this.hole(item, ev);
    } else {
      // 木头或者地面：木屑 + 一团土
      const wood = !ev.ground;
      const col = wood ? [0.7, 0.55, 0.38] : [0.42, 0.36, 0.24];
      for (let i = 0; i < 10; i++) {
        const b = bounce(2 + Math.random() * 5);
        this.fx.spawn({ p: [x, y, z], v: [b[0] + (Math.random() - 0.5) * 5, b[1] + Math.random() * 5, b[2] + (Math.random() - 0.5) * 5], life: 0.5 + Math.random() * 0.4, s0: 0.07, s1: 0.06, c0: col, c1: col, a0: 1, a1: 0.6, grav: 32, floor: 0.03 });
      }
      for (let i = 0; i < 4; i++) {
        this.fx.spawn({ p: [x, y, z], v: bounce(0.8 + Math.random()), life: 0.9, s0: 0.2, s1: 0.9, c0: col.map((c) => c + 0.15), c1: col.map((c) => c + 0.2), a0: 0.45, a1: 0, tile: 1, drag: 2, spin: 1 });
      }
    }
  }

  /** 罐子上留个弹孔，再从洞里喷汽水 */
  hole(item, ev) {
    const m = item.m;
    m.updateMatrixWorld();
    const lp = m.worldToLocal(new THREE.Vector3(...ev.point));
    const ln = new THREE.Vector3();
    if (Math.abs(lp.y) < CAN_H / 2 - 0.08) {
      ln.set(lp.x, 0, lp.z).normalize();
      lp.set(ln.x * (CAN_R + 0.004), lp.y, ln.z * (CAN_R + 0.004));
    } else {
      ln.set(0, Math.sign(lp.y), 0);
      lp.y = Math.sign(lp.y) * (CAN_H / 2 - 0.02);
    }
    const d = new THREE.Mesh(this.holeGeo, this.holeMat);
    d.position.copy(lp);
    d.lookAt(lp.clone().add(ln));
    d.rotateZ(Math.random() * 6.28);
    d.userData.sharedGeo = true;
    m.add(d);
    this.sprays.push({ x: item, lp: lp.clone().addScaledVector(ln, 0.02), ln, t: 0, dur: 0.9 + Math.random() * 0.4, acc: 0, col: rgb(m.userData.tint || '#ffffff') });
  }

  /** 罐子落地扬起一点土 */
  dust(p, k = 1) {
    for (let i = 0; i < 3; i++) {
      const a = Math.random() * 6.28;
      this.fx.spawn({ p: [p[0], 0.15, p[2]], v: [Math.cos(a) * 1.5 * k, 0.6 + Math.random() * 0.6, Math.sin(a) * 1.5 * k], life: 0.9, s0: 0.25, s1: 0.9 * k, c0: [0.62, 0.55, 0.4], c1: [0.7, 0.64, 0.5], a0: 0.35, a1: 0, tile: 1, drag: 2.5, spin: 1 });
    }
  }

  /** 爆炸 */
  explode(c, tint = [0.85, 0.15, 0.1]) {
    const [x, y, z] = c;
    this.boomLight.position.set(x, y + 0.5, z + 0.6);
    this.boomLight.intensity = 90;
    this.shake = Math.max(this.shake, 0.9);
    this.glow.spawn({ p: [x, y, z], life: 0.16, s0: 4, s1: 7, c0: [1, 0.95, 0.75], c1: [1, 0.6, 0.2], a0: 1, a1: 0, tile: 0 });
    for (let i = 0; i < 22; i++) {
      const a = Math.random() * 6.28, e = Math.random() * 1.4 - 0.2, sp = 3 + Math.random() * 7;
      this.glow.spawn({
        p: [x, y, z], v: [Math.cos(a) * Math.cos(e) * sp, Math.sin(e) * sp + 2, Math.sin(a) * Math.cos(e) * sp],
        life: 0.35 + Math.random() * 0.3, s0: 0.9 + Math.random() * 0.6, s1: 2.2 + Math.random() * 1.4, c0: [1, 0.85, 0.4], c1: [0.9, 0.2, 0.05], a0: 0.95, a1: 0, tile: 1, drag: 4, spin: (Math.random() - 0.5) * 4,
      });
    }
    for (let i = 0; i < 16; i++) {
      const a = Math.random() * 6.28, sp = 1 + Math.random() * 3;
      const g = 0.32 + Math.random() * 0.16;
      this.fx.spawn({
        p: [x + (Math.random() - 0.5) * 0.8, y + Math.random() * 0.8, z + (Math.random() - 0.5) * 0.8], v: [Math.cos(a) * sp, 1.8 + Math.random() * 2.6, Math.sin(a) * sp],
        life: 1.4 + Math.random() * 1, s0: 0.8, s1: 2.2 + Math.random() * 1.4, c0: [g, g * 0.92, g * 0.9], c1: [0.62, 0.58, 0.6], a0: 0.55, a1: 0, tile: 1, drag: 1.4, spin: (Math.random() - 0.5) * 1.5, fadeIn: 0.1,
      });
    }
    for (let i = 0; i < 40; i++) {
      const a = Math.random() * 6.28, e = Math.random() * 1.3, sp = 8 + Math.random() * 16;
      this.glow.spawn({ p: [x, y, z], v: [Math.cos(a) * Math.cos(e) * sp, Math.sin(e) * sp, Math.sin(a) * Math.cos(e) * sp], life: 0.4 + Math.random() * 0.5, s0: 0.1, s1: 0.04, c0: [1, 0.9, 0.5], c1: [1, 0.4, 0.05], a0: 1, a1: 0, grav: 26, floor: 0.05 });
    }
    this.shards.burst(c, 16, ['#d0251c', '#e8eaee', '#ffcf1f', '#b3150f']);
  }

  /** 金罐子掉下去：一圈金色星星 */
  sparkle(p, n = 18) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.28, sp = 2 + Math.random() * 4;
      this.glow.spawn({ p: [p[0], p[1], p[2]], v: [Math.cos(a) * sp, 2 + Math.random() * 5, Math.sin(a) * sp], life: 0.7 + Math.random() * 0.5, s0: 0.5, s1: 0.1, c0: [1, 0.9, 0.45], c1: [1, 0.7, 0.2], a0: 1, a1: 0, tile: 3, grav: 6, spin: 3 });
    }
  }

  /** 过关：从台子上冒出彩色星星 */
  celebrate() {
    const b = bounds(this.spec);
    const cols = [[1, 0.85, 0.3], [1, 0.45, 0.5], [0.5, 0.8, 1], [0.6, 1, 0.55], [1, 1, 1]];
    for (let i = 0; i < 70; i++) {
      const x = lerp(b.x0, b.x1, Math.random()), z = lerp(b.z0, b.z1, Math.random());
      const c = cols[i % cols.length];
      this.glow.spawn({ p: [x, b.y0 + 0.5, z], v: [(Math.random() - 0.5) * 6, 8 + Math.random() * 8, (Math.random() - 0.5) * 4], life: 1.2 + Math.random() * 0.8, s0: 0.55, s1: 0.2, c0: c, c1: c, a0: 1, a1: 0, tile: 3, grav: 12, drag: 0.8, spin: 4 });
    }
  }
}

/** 几个没有 index 的小几何体并起来 */
function mergeSimple(list) {
  const geos = list.map((g) => (g.index ? g.toNonIndexed() : g));
  let n = 0;
  for (const g of geos) n += g.attributes.position.count;
  const out = new THREE.BufferGeometry();
  for (const k of ['position', 'normal', 'uv']) {
    const size = geos[0].attributes[k].itemSize;
    const arr = new Float32Array(n * size);
    let o = 0;
    for (const g of geos) { arr.set(g.attributes[k].array, o); o += g.attributes[k].array.length; }
    out.setAttribute(k, new THREE.BufferAttribute(arr, size));
  }
  return out;
}
