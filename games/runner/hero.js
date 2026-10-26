// 主角：低多边形的小探险家（帽子、背包），用简单的几何体拼起来，关节可以摆动做动作。
// 模型面朝 -Z。
import * as THREE from './lib/three.module.min.js';

const lam = (c) => new THREE.MeshLambertMaterial({ color: c, flatShading: true });
const M = {
  skin: lam(0xf2c29a), shirt: lam(0xe3c07e), pants: lam(0x5f5038), boot: lam(0x4a3220),
  hat: lam(0x8a5a2e), band: lam(0x4d2f17), pack: lam(0x9a6534), belt: lam(0x5a3a1e), scarf: lam(0xd8452f),
};
const box = (w, h, d, m) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);

export class Hero {
  constructor() {
    const g = this.group = new THREE.Group();
    const hips = this.hips = new THREE.Group();
    hips.position.y = 0.95;
    g.add(hips);
    g.scale.setScalar(1.1);

    // 身体
    const torso = this.torso = new THREE.Group();
    hips.add(torso);
    const chest = box(0.62, 0.72, 0.38, M.shirt); chest.position.y = 0.38; torso.add(chest);
    const belt = box(0.64, 0.1, 0.4, M.belt); belt.position.y = 0.04; torso.add(belt);
    const scarf = box(0.5, 0.12, 0.42, M.scarf); scarf.position.y = 0.74; torso.add(scarf);
    const pack = box(0.48, 0.52, 0.24, M.pack); pack.position.set(0, 0.42, 0.3); torso.add(pack);
    const flap = box(0.5, 0.14, 0.26, M.belt); flap.position.set(0, 0.66, 0.3); torso.add(flap);
    // 头和帽子
    const head = this.head = new THREE.Group();
    head.position.y = 0.98; torso.add(head);
    const face = new THREE.Mesh(new THREE.IcosahedronGeometry(0.27, 1), M.skin); head.add(face);
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.46, 0.05, 10), M.hat); brim.position.y = 0.14; head.add(brim);
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.29, 0.24, 8), M.hat); crown.position.y = 0.27; head.add(crown);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.295, 0.3, 0.06, 8), M.band); band.position.y = 0.19; head.add(band);
    // 手臂
    this.arms = [-1, 1].map((side) => {
      const sh = new THREE.Group(); sh.position.set(side * 0.38, 0.66, 0); torso.add(sh);
      const upper = box(0.17, 0.46, 0.17, M.shirt); upper.position.y = -0.21; sh.add(upper);
      const hand = box(0.14, 0.14, 0.14, M.skin); hand.position.y = -0.5; sh.add(hand);
      return sh;
    });
    // 腿
    this.legs = [-1, 1].map((side) => {
      const hp = new THREE.Group(); hp.position.set(side * 0.16, 0, 0); hips.add(hp);
      const leg = box(0.21, 0.52, 0.23, M.pants); leg.position.y = -0.26; hp.add(leg);
      const boot = box(0.23, 0.18, 0.32, M.boot); boot.position.set(0, -0.56, -0.04); hp.add(boot);
      return hp;
    });
    // 脚下的影子
    const sh = this.shadow = new THREE.Mesh(new THREE.CircleGeometry(0.55, 16), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3, depthWrite: false }));
    sh.rotation.x = -Math.PI / 2;
    this.shadowHolder = new THREE.Group();
    this.shadowHolder.add(sh);
    this.phase = 0;
    this.fallT = 0;
  }

  /** state: { mode: 'idle'|'run'|'jump'|'slide'|'fall'|'crash', y, speed, t } */
  update(st, dt) {
    const g = this.group, k = 1 - Math.exp(-dt * 16);
    const L = this.legs, A = this.arms;
    const lerp = (o, key, v) => { o[key] += (v - o[key]) * k; };
    let hipsY = 0.95, lean = 0.16, legA = 0, armA = 0, bodyRot = 0, tuck = 0;
    if (st.mode === 'run' || st.mode === 'jump' || st.mode === 'slide') this.phase += dt * (6 + st.speed * 0.42);
    const p = this.phase;
    if (st.mode === 'idle') {
      lean = 0.02; hipsY = 0.95 + Math.sin(st.t * 2) * 0.01;
      A.forEach((a, i) => lerp(a.rotation, 'x', Math.sin(st.t * 2 + i) * 0.05));
      L.forEach((l) => lerp(l.rotation, 'x', 0));
      A.forEach((a, i) => lerp(a.rotation, 'z', (i ? -1 : 1) * 0.08));
    } else if (st.mode === 'run') {
      hipsY = 0.95 + Math.abs(Math.sin(p)) * 0.09;
      legA = Math.sin(p) * 0.95; armA = -Math.sin(p) * 0.85;
      L[0].rotation.x = legA; L[1].rotation.x = -legA;
      A[0].rotation.x = armA; A[1].rotation.x = -armA;
      A.forEach((a, i) => lerp(a.rotation, 'z', (i ? -1 : 1) * 0.12));
    } else if (st.mode === 'jump') {
      tuck = 1; lean = 0.05;
      lerp(L[0].rotation, 'x', 1.1); lerp(L[1].rotation, 'x', 0.35);
      lerp(A[0].rotation, 'x', 2.5); lerp(A[1].rotation, 'x', 2.1);
      A.forEach((a, i) => lerp(a.rotation, 'z', (i ? -1 : 1) * 0.35));
    } else if (st.mode === 'slide') {
      hipsY = 0.42; lean = -1.05;
      lerp(L[0].rotation, 'x', 1.45); lerp(L[1].rotation, 'x', 1.25);
      lerp(A[0].rotation, 'x', -0.6); lerp(A[1].rotation, 'x', 0.5);
      A.forEach((a, i) => lerp(a.rotation, 'z', (i ? -1 : 1) * 0.6));
    } else if (st.mode === 'fall') {
      this.fallT += dt;
      lean = 0.6; bodyRot = this.fallT * 3;
      A.forEach((a, i) => { a.rotation.x = -2.6 + Math.sin(this.fallT * 20 + i * 2) * 0.5; a.rotation.z = (i ? -1 : 1) * 0.6; });
      L.forEach((l, i) => { l.rotation.x = Math.sin(this.fallT * 18 + i * 3) * 0.8; });
    } else if (st.mode === 'crash') {
      this.fallT += dt;
      const c = Math.min(1, this.fallT / 0.35);
      lean = -1.5 * c; hipsY = 0.95 - 0.7 * c;
      lerp(L[0].rotation, 'x', 0.7); lerp(L[1].rotation, 'x', 1.0);
      lerp(A[0].rotation, 'x', -2.2); lerp(A[1].rotation, 'x', -1.6);
    }
    if (st.mode !== 'fall' && st.mode !== 'crash') this.fallT = 0;
    lerp(this.hips.position, 'y', hipsY + (tuck ? 0.12 : 0));
    lerp(this.torso.rotation, 'x', -lean);
    this.group.rotation.z = st.mode === 'fall' ? Math.sin(bodyRot) * 0.5 : 0;
    this.head.rotation.x = st.mode === 'run' ? 0.12 : 0;
    // 影子：离地越高越淡、越小
    const air = Math.max(0, st.y);
    this.shadow.material.opacity = st.overGap ? 0 : Math.max(0.05, 0.3 - air * 0.08);
    this.shadow.scale.setScalar(Math.max(0.4, 1 - air * 0.15) * (st.mode === 'slide' ? 1.4 : 1));
    void g;
  }
}
