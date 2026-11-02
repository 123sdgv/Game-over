// 特效：粒子（火花、汽水、烟、火球、尘土、星星）、子弹的光迹、爆炸飞出去的铁皮碎片。
import * as THREE from '../_shared/lib/three.module.min.js';

/* ================================================================ 粒子 */
// 一批点精灵，CPU 上算运动，GPU 上画。tile 选图集里的哪一格：0 圆点、1 烟、2 火光、3 星
const VERT = `
attribute float aSize; attribute float aAlpha; attribute float aTile; attribute float aRot; attribute vec3 aColor;
uniform float uScale;
varying float vAlpha; varying float vTile; varying float vRot; varying vec3 vColor;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = min(aSize * uScale / max(0.2, -mv.z), 480.0);
  vAlpha = aAlpha; vTile = aTile; vRot = aRot; vColor = aColor;
}`;
const FRAG = `
uniform sampler2D uMap;
varying float vAlpha; varying float vTile; varying float vRot; varying vec3 vColor;
void main() {
  vec2 p = gl_PointCoord - 0.5;
  float c = cos(vRot), s = sin(vRot);
  p = vec2(c * p.x - s * p.y, s * p.x + c * p.y) + 0.5;
  if (p.x < 0.0 || p.y < 0.0 || p.x > 1.0 || p.y > 1.0) discard;
  float tx = mod(vTile, 2.0), ty = floor(vTile / 2.0);
  vec4 t = texture2D(uMap, vec2((tx + p.x) * 0.5, 1.0 - (ty + p.y) * 0.5));
  float a = t.a * vAlpha;
  if (a < 0.004) discard;
  gl_FragColor = vec4(vColor * t.rgb, a);
}`;

export class Particles {
  constructor(max, atlas, additive) {
    this.max = max;
    this.n = 0;
    const g = (this.geo = new THREE.BufferGeometry());
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.alpha = new Float32Array(max);
    this.tile = new Float32Array(max);
    this.rot = new Float32Array(max);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aTile', new THREE.BufferAttribute(this.tile, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aRot', new THREE.BufferAttribute(this.rot, 1).setUsage(THREE.DynamicDrawUsage));
    g.setDrawRange(0, 0);
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG,
      uniforms: { uMap: { value: atlas }, uScale: { value: 800 } },
      transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 3 : 2;
    this.p = [];   // 每个粒子的状态
  }

  /**
   * o: { p:[x,y,z], v:[x,y,z], life, s0, s1, c0:[r,g,b], c1, a0, a1, tile, rot, spin, drag, grav, fadeIn }
   */
  spawn(o) {
    if (this.p.length >= this.max) this.p.shift();
    this.p.push({
      x: o.p[0], y: o.p[1], z: o.p[2],
      vx: o.v ? o.v[0] : 0, vy: o.v ? o.v[1] : 0, vz: o.v ? o.v[2] : 0,
      t: 0, life: o.life || 1,
      s0: o.s0 ?? 0.3, s1: o.s1 ?? o.s0 ?? 0.3,
      c0: o.c0 || [1, 1, 1], c1: o.c1 || o.c0 || [1, 1, 1],
      a0: o.a0 ?? 1, a1: o.a1 ?? 0,
      tile: o.tile || 0, rot: o.rot ?? Math.random() * 6.28, spin: o.spin || 0,
      drag: o.drag || 0, grav: o.grav || 0, fadeIn: o.fadeIn || 0, floor: o.floor ?? -1e9,
    });
  }

  update(dt) {
    const P = this.p;
    let w = 0;
    for (let i = 0; i < P.length; i++) {
      const q = P[i];
      q.t += dt;
      if (q.t >= q.life) continue;
      const dk = Math.exp(-q.drag * dt);
      q.vx *= dk; q.vy = q.vy * dk - q.grav * dt; q.vz *= dk;
      q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt;
      if (q.y < q.floor) { q.y = q.floor; q.vy *= -0.25; q.vx *= 0.5; q.vz *= 0.5; }
      q.rot += q.spin * dt;
      P[w++] = q;
    }
    P.length = w;
    for (let i = 0; i < w; i++) {
      const q = P[i];
      const k = q.t / q.life;
      this.pos[i * 3] = q.x; this.pos[i * 3 + 1] = q.y; this.pos[i * 3 + 2] = q.z;
      this.col[i * 3] = q.c0[0] + (q.c1[0] - q.c0[0]) * k;
      this.col[i * 3 + 1] = q.c0[1] + (q.c1[1] - q.c0[1]) * k;
      this.col[i * 3 + 2] = q.c0[2] + (q.c1[2] - q.c0[2]) * k;
      this.size[i] = q.s0 + (q.s1 - q.s0) * (1 - (1 - k) * (1 - k));
      let a = q.a0 + (q.a1 - q.a0) * k;
      if (q.fadeIn) a *= Math.min(1, q.t / q.fadeIn);
      this.alpha[i] = a;
      this.tile[i] = q.tile;
      this.rot[i] = q.rot;
    }
    const g = this.geo;
    for (const k of ['position', 'aColor', 'aSize', 'aAlpha', 'aTile', 'aRot']) g.attributes[k].needsUpdate = true;
    g.setDrawRange(0, w);
  }

  clear() { this.p.length = 0; this.geo.setDrawRange(0, 0); }
}

/* ================================================================ 子弹光迹 */
// 一条面朝相机的细长光带，从枪口飞到打中的地方
export class Tracers {
  constructor(scene) {
    const c = document.createElement('canvas');
    c.width = 64; c.height = 16;
    const g = c.getContext('2d');
    const gr = g.createLinearGradient(0, 0, 0, 16);
    gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 16);
    const hg = g.createLinearGradient(0, 0, 64, 0);
    hg.addColorStop(0, 'rgba(0,0,0,1)'); hg.addColorStop(1, 'rgba(0,0,0,0)');
    g.globalCompositeOperation = 'destination-out';
    g.fillStyle = hg; g.fillRect(0, 0, 64, 16);
    this.tex = new THREE.CanvasTexture(c);
    this.list = [];
    this.scene = scene;
    this.mat = new THREE.MeshBasicMaterial({ map: this.tex, color: 0xffe2a0, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  }
  add(from, to, speed = 260) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(12), 3));
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 0, 0, 1, 1, 0, 1, 1]), 2));
    g.setIndex([0, 2, 1, 2, 3, 1]);
    const m = new THREE.Mesh(g, this.mat.clone());
    m.frustumCulled = false;
    m.renderOrder = 4;
    this.scene.add(m);
    const a = new THREE.Vector3(...from), b = new THREE.Vector3(...to);
    this.list.push({ m, a, b, len: a.distanceTo(b), t: 0, speed });
  }
  update(dt, cam) {
    const tmp = new THREE.Vector3(), side = new THREE.Vector3(), dir = new THREE.Vector3(), h = new THREE.Vector3(), tl = new THREE.Vector3();
    for (let i = this.list.length - 1; i >= 0; i--) {
      const tr = this.list[i];
      tr.t += dt;
      const head = Math.min(tr.len, tr.t * tr.speed);
      const tail = Math.max(0, head - Math.max(4, tr.len * 0.45)) + Math.max(0, tr.t * tr.speed - tr.len) * 1.2;
      if (tail >= tr.len - 0.01) {
        this.scene.remove(tr.m); tr.m.geometry.dispose(); tr.m.material.dispose();
        this.list.splice(i, 1);
        continue;
      }
      dir.subVectors(tr.b, tr.a).normalize();
      h.copy(tr.a).addScaledVector(dir, head);
      tl.copy(tr.a).addScaledVector(dir, tail);
      tmp.subVectors(cam.position, h);
      side.crossVectors(dir, tmp).normalize();
      const pa = tr.m.geometry.attributes.position;
      const wt = 0.035 + head * 0.0016, wh = 0.012;
      pa.setXYZ(0, tl.x + side.x * wh, tl.y + side.y * wh, tl.z + side.z * wh);
      pa.setXYZ(1, tl.x - side.x * wh, tl.y - side.y * wh, tl.z - side.z * wh);
      pa.setXYZ(2, h.x + side.x * wt, h.y + side.y * wt, h.z + side.z * wt);
      pa.setXYZ(3, h.x - side.x * wt, h.y - side.y * wt, h.z - side.z * wt);
      pa.needsUpdate = true;
      tr.m.material.opacity = 1 - Math.max(0, (tr.t * tr.speed - tr.len) / (tr.len * 0.8));
    }
  }
  clear() { for (const tr of this.list) { this.scene.remove(tr.m); tr.m.geometry.dispose(); tr.m.material.dispose(); } this.list = []; }
}

/* ================================================================ 爆炸碎片 */
// 一批小铁皮，抛出去、打着转、落地弹两下
export class Shards {
  constructor(scene, envMap, max = 60) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-0.12, -0.05, 0, 0.13, -0.07, 0.01, 0.02, 0.09, -0.01, -0.12, -0.05, 0, 0.02, 0.09, -0.01, -0.05, 0.03, 0.03]), 3));
    g.computeVertexNormals();
    this.mesh = new THREE.InstancedMesh(g, new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.8, roughness: 0.35, side: THREE.DoubleSide, envMap }), max);
    this.mesh.count = 0;
    this.mesh.castShadow = true;
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(this.mesh);
    this.max = max;
    this.list = [];
    this.m = new THREE.Matrix4();
    this.q = new THREE.Quaternion();
    this.e = new THREE.Euler();
    this.s = new THREE.Vector3();
    this.p = new THREE.Vector3();
    this.c = new THREE.Color();
  }
  burst(at, n, colors) {
    for (let i = 0; i < n; i++) {
      if (this.list.length >= this.max) this.list.shift();
      const a = Math.random() * Math.PI * 2, up = 0.3 + Math.random() * 0.9, sp = 8 + Math.random() * 16;
      this.list.push({
        x: at[0], y: at[1], z: at[2],
        vx: Math.cos(a) * sp * (1 - up * 0.5), vy: up * sp, vz: Math.sin(a) * sp * (1 - up * 0.5),
        rx: Math.random() * 6, ry: Math.random() * 6, rz: Math.random() * 6,
        sx: (Math.random() - 0.5) * 30, sy: (Math.random() - 0.5) * 30, sz: (Math.random() - 0.5) * 30,
        sc: 0.6 + Math.random() * 1.1, t: 0, life: 2.2 + Math.random(),
        col: colors[i % colors.length],
      });
    }
  }
  update(dt, G) {
    let w = 0;
    for (const s of this.list) {
      s.t += dt;
      if (s.t > s.life) continue;
      s.vy -= G * dt;
      s.x += s.vx * dt; s.y += s.vy * dt; s.z += s.vz * dt;
      s.rx += s.sx * dt; s.ry += s.sy * dt; s.rz += s.sz * dt;
      if (s.y < 0.03) { s.y = 0.03; s.vy *= -0.3; s.vx *= 0.6; s.vz *= 0.6; s.sx *= 0.6; s.sy *= 0.6; s.sz *= 0.6; }
      const fade = Math.min(1, (s.life - s.t) * 3);
      this.p.set(s.x, s.y, s.z);
      this.q.setFromEuler(this.e.set(s.rx, s.ry, s.rz));
      this.s.setScalar(s.sc * fade);
      this.m.compose(this.p, this.q, this.s);
      this.mesh.setMatrixAt(w, this.m);
      this.mesh.setColorAt(w, this.c.set(s.col));
      this.list[w++] = s;
    }
    this.list.length = w;
    this.mesh.count = w;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
  clear() { this.list.length = 0; this.mesh.count = 0; }
}
