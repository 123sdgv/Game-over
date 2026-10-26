// 3D 画面：蓝天白云、悬浮方块拼成的轨道、球、特效、镜头（three.js r169）
import * as THREE from '../_shared/lib/three.module.min.js';

const SKY = 0x8fc4f2;

export function createScene(canvas, opts = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setClearColor(SKY);
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(SKY, 30, 90);
  const camera = new THREE.PerspectiveCamera(58, 1, 0.1, 200);

  // 光：一盏柔阳光 + 环境光
  const sun = new THREE.DirectionalLight(0xffffff, 2.2);
  sun.position.set(-6, 14, 6);
  scene.add(sun);
  scene.add(new THREE.AmbientLight(0xbdd9f5, 1.4));
  scene.add(new THREE.HemisphereLight(0xcfe8fb, 0x7fae6a, 0.9));

  /* ---------- 云 ---------- */
  const cloudMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.92, fog: false });
  const clouds = new THREE.Group();
  {
    const geo = new THREE.SphereGeometry(1, 10, 8);
    for (let i = 0; i < 26; i++) {
      const g = new THREE.Group();
      const n = 3 + Math.floor(Math.random() * 3);
      for (let k = 0; k < n; k++) {
        const m = new THREE.Mesh(geo, cloudMat);
        m.position.set((Math.random() - 0.5) * 3.4, (Math.random() - 0.5) * 0.9, (Math.random() - 0.5) * 1.6);
        m.scale.set(1 + Math.random() * 1.6, 0.7 + Math.random() * 0.5, 1 + Math.random() * 0.8);
        g.add(m);
      }
      const zz = -20 - Math.random() * 120;
      g.position.set((Math.random() - 0.5) * 60, 4 + Math.random() * 14, zz);
      g.scale.setScalar(1 + Math.random() * 1.5);
      clouds.add(g);
    }
  }
  scene.add(clouds);

  /* ---------- 材质 ---------- */
  const blockMat = new THREE.MeshLambertMaterial({ color: 0x7fae6a });       // 草绿块
  const blockTop = new THREE.MeshLambertMaterial({ color: 0x9cc97f });
  const barMat = new THREE.MeshLambertMaterial({ color: 0xe05656 });         // barrier 红色
  const coinMat = new THREE.MeshLambertMaterial({ color: 0xf4c542, emissive: 0x8a6b12 });

  // 方块：顶部亮一点，做法 = 一个 Box + 顶面盖一片亮色 plane
  const blockGeo = new THREE.BoxGeometry(1.4, 1, 2);
  const topGeo = new THREE.PlaneGeometry(1.4, 2).rotateX(-Math.PI / 2);
  const barGeo = new THREE.BoxGeometry(1.4, 0.9, 0.35);
  const coinGeo = new THREE.CylinderGeometry(0.32, 0.32, 0.09, 14).rotateX(Math.PI / 2);

  const pool = { block: [], bar: [], coin: [] };
  function grab(kind) {
    const arr = pool[kind];
    let m = arr.pop();
    if (!m) {
      if (kind === 'block') {
        m = new THREE.Group();
        const b = new THREE.Mesh(blockGeo, blockMat);
        const t = new THREE.Mesh(topGeo, blockTop);
        t.position.y = 0.501;
        m.add(b, t);
      } else if (kind === 'barrier') {
        m = new THREE.Mesh(barGeo, barMat);
      } else {
        m = new THREE.Mesh(coinGeo, coinMat);
      }
      scene.add(m);
    }
    m.visible = true;
    return m;
  }
  function release(kind, m) { m.visible = false; pool[kind].push(m); }

  // 每种 kind 维护一组激活的 mesh：piece -> mesh
  const live = new Map(); // piece 对象 -> { kind, mesh }

  function syncPieces(pieces) {
    const seen = new Set(pieces);
    for (const [piece, entry] of live) if (!seen.has(piece)) { release(entry.kind, entry.mesh); live.delete(piece); }
    for (const p of pieces) {
      if (live.has(p)) { const e = live.get(p); e.mesh.position.set(p.x, p.y + (e.kind === 'block' ? -0.5 : 0), p.z); continue; }
      const kind = p.kind === 'coin' ? 'coin' : p.kind;
      const mesh = grab(kind);
      mesh.position.set(p.x, p.y + (kind === 'block' ? -0.5 : 0), p.z);
      mesh.rotation.set(0, 0, 0);
      live.set(p, { kind, mesh });
    }
  }
  function clearPieces() { for (const [, e] of live) release(e.kind, e.mesh); live.clear(); }

  /* ---------- 球 ---------- */
  const ball = new THREE.Group();
  const ballCore = new THREE.Mesh(new THREE.SphereGeometry(0.42, 20, 16), new THREE.MeshLambertMaterial({ color: 0xf3f5f8 }));
  const bandMat = new THREE.MeshBasicMaterial({ color: 0x2f56e0 });
  const bands = [];
  for (let i = 0; i < 2; i++) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.425, 0.05, 8, 28), bandMat);
    ring.rotation.x = i ? Math.PI / 2 : 0;
    ring.rotation.y = i ? 0 : Math.PI / 3;
    bands.push(ring); ball.add(ring);
  }
  ball.add(ballCore);
  scene.add(ball);

  /* ---------- 特效粒子（吃金币 / 摔掉） ---------- */
  const fx = [];
  const fxGeo = new THREE.SphereGeometry(0.07, 6, 5);
  function burst(pos, color, n = 10, speed = 3) {
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(fxGeo, new THREE.MeshBasicMaterial({ color, transparent: true }));
      m.position.copy(pos);
      const a = Math.random() * Math.PI * 2, up = 1 + Math.random() * 2;
      fx.push({ m, vx: Math.cos(a) * speed * (0.3 + Math.random()), vy: up * speed * 0.6, vz: Math.sin(a) * speed * (0.3 + Math.random()), life: 1 });
      scene.add(m);
    }
  }
  function stepFx(dt) {
    for (let i = fx.length - 1; i >= 0; i--) {
      const p = fx[i];
      p.life -= dt * 1.6;
      if (p.life <= 0) { scene.remove(p.m); p.m.material.dispose(); fx.splice(i, 1); continue; }
      p.vy -= 9 * dt;
      p.m.position.x += p.vx * dt; p.m.position.y += p.vy * dt; p.m.position.z += p.vz * dt;
      p.m.material.opacity = p.life;
      p.m.scale.setScalar(p.life);
    }
  }

  /* ---------- 镜头 ---------- */
  const camTarget = new THREE.Vector3();
  function updateCamera(ballPos, dt) {
    const z = ballPos.z - 6.2;
    camera.position.x += (ballPos.x * 0.55 - camera.position.x) * Math.min(1, dt * 6);
    camera.position.y += (ballPos.y + 3.4 - camera.position.y) * Math.min(1, dt * 6);
    camera.position.z = z;
    camTarget.set(ballPos.x * 0.8, ballPos.y + 1.1, ballPos.z + 6);
    camera.lookAt(camTarget);
  }

  function resize(w, h, dpr) {
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  function setLowPower(on) {
    renderer.setPixelRatio(on ? Math.min(window.devicePixelRatio, 1.5) : Math.min(window.devicePixelRatio, 3));
  }

  function render() { renderer.render(scene, camera); }

  function spinBall(ballMesh, dt, speed) {
    // 让球的花纹转起来，看起来在滚
    ballMesh.children.forEach((c) => { if (c !== ballCore) { c.rotation.z -= dt * speed; } });
  }

  return { renderer, scene, camera, ball, bands, syncPieces, clearPieces, burst, stepFx, updateCamera, resize, setLowPower, render, spinBall, THREE };
}
