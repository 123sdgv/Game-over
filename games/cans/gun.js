// 玩具左轮：八角枪管、带凹槽的转轮、击锤、扳机护圈、胡桃木枪柄 + 铜徽章。全部用几何体拼出来。
// 枪管朝 -Z，枪管中心线在 y = 0。挂在相机下面，右下角伸出来，跟着准星转。
import * as THREE from '../_shared/lib/three.module.min.js';

function extrudeYZ(points, depth, bevel = 0.012, holes = [], curveSegments = 10) {
  const s = new THREE.Shape(points.map(([z, y]) => new THREE.Vector2(z, y)));
  for (const h of holes) s.holes.push(new THREE.Path(h.map(([z, y]) => new THREE.Vector2(z, y))));
  const g = new THREE.ExtrudeGeometry(s, {
    depth: depth - bevel * 2, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelOffset: -bevel, bevelSegments: 3, curveSegments,
  });
  g.rotateY(-Math.PI / 2);                 // 形状的 x → 枪的 z，挤出方向 → 枪的 -x
  g.translate((depth - bevel * 2) / 2, 0, 0);
  g.computeVertexNormals();
  return g;
}

/** 平滑的曲线点（给枪柄这种圆弧外形用） */
function curve(pts, n = 40) {
  const c = new THREE.SplineCurve(pts.map(([z, y]) => new THREE.Vector2(z, y)));
  c.closed = true;
  return c.getPoints(n).map((p) => [p.x, p.y]);
}

/** 转轮：外圈有 6 道凹槽 */
function flutedCylinder(R, len, flutes = 6, depth = 0.035, seg = 96) {
  const g = new THREE.CylinderGeometry(R, R, len, seg, 1, false);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const r = Math.hypot(x, z);
    if (r < 1e-4) continue;
    const a = Math.atan2(z, x);
    // 两个弹膛之间挖一道
    let d = 0;
    for (let k = 0; k < flutes; k++) {
      const c = ((k + 0.5) / flutes) * Math.PI * 2;
      let da = Math.abs(a - c);
      da = Math.min(da, Math.PI * 2 - da);
      const w = 0.24;
      if (da < w) d = Math.max(d, Math.cos((da / w) * Math.PI * 0.5) * depth);
    }
    const nr = r === R ? R - d : r;
    pos.setXYZ(i, (x / r) * nr, pos.getY(i), (z / r) * nr);
  }
  g.computeVertexNormals();
  g.rotateX(Math.PI / 2);                  // 轴朝 z
  return g;
}

export class Gun {
  constructor(art, envMap) {
    const steel = new THREE.MeshStandardMaterial({ color: 0xc4c9d2, metalness: 1, roughness: 0.2, envMap, envMapIntensity: 1.35 });
    const steelFlat = new THREE.MeshStandardMaterial({ color: 0xc9ced7, metalness: 1, roughness: 0.18, flatShading: true, envMap, envMapIntensity: 1.4 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x15161a, metalness: 0.5, roughness: 0.5 });
    const brass = new THREE.MeshStandardMaterial({ color: 0xe0ac4f, metalness: 1, roughness: 0.3, envMap, envMapIntensity: 1.2 });
    const wood = new THREE.MeshPhysicalMaterial({ color: 0xffffff, map: art.walnut, roughness: 0.42, metalness: 0, clearcoat: 0.6, clearcoatRoughness: 0.25, envMap, envMapIntensity: 0.8 });
    art.walnut.wrapS = art.walnut.wrapT = THREE.RepeatWrapping;
    art.walnut.repeat.set(2.4, 2.4);
    this.mats = [steel, steelFlat, dark, brass, wood];

    const root = (this.root = new THREE.Group());     // 跟着准星转
    const model = (this.model = new THREE.Group());   // 后坐力
    root.add(model);
    const add = (geo, mat, x = 0, y = 0, z = 0, parent = model) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      parent.add(m);
      return m;
    };

    // 枪管：八角，前面一圈口
    const bl = 0.98;
    const barrel = new THREE.CylinderGeometry(0.083, 0.088, bl, 8, 1);
    barrel.rotateX(Math.PI / 2);
    barrel.rotateZ(Math.PI / 8);
    add(barrel, steelFlat, 0, 0, -0.3 - bl / 2);
    const crown = new THREE.TorusGeometry(0.068, 0.02, 10, 28);
    add(crown, steel, 0, 0, -0.3 - bl);
    add(new THREE.CircleGeometry(0.05, 20).rotateY(Math.PI), dark, 0, 0, -0.3 - bl + 0.004);
    add(new THREE.BoxGeometry(0.022, 0.055, 0.09), steel, 0, 0.1, -0.3 - bl + 0.06);
    // 退壳杆套筒
    const ej = new THREE.CylinderGeometry(0.042, 0.042, 0.62, 18);
    ej.rotateX(Math.PI / 2);
    add(ej, steel, 0, -0.118, -0.32 - 0.31);
    add(new THREE.SphereGeometry(0.046, 16, 12), steel, 0, -0.118, -0.95);

    // 枪身框架：中间留出转轮的窗口
    const frame = extrudeYZ(
      [[-0.42, 0.1], [0.1, 0.1], [0.16, 0.13], [0.24, 0.13], [0.3, 0.06], [0.32, -0.08], [0.33, -0.26], [0.18, -0.355], [-0.24, -0.355], [-0.37, -0.3], [-0.42, -0.18]],
      0.15, 0.018,
      [[[-0.31, 0.065], [0.1, 0.065], [0.1, -0.31], [-0.31, -0.31]]],
    );
    add(frame, steel);

    // 转轮
    const drum = (this.drum = new THREE.Group());
    drum.position.set(0, -0.118, -0.1);
    model.add(drum);
    add(flutedCylinder(0.198, 0.4), steel, 0, 0, 0, drum);
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + Math.PI / 2;
      const c = add(new THREE.CircleGeometry(0.046, 18).rotateY(Math.PI), dark, Math.cos(a) * 0.118, Math.sin(a) * 0.118, -0.203, drum);
      c.renderOrder = 1;
      // 弹壳底部（从后面看不到，前面能看到弹头）
      add(new THREE.SphereGeometry(0.036, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(-Math.PI / 2), brass, Math.cos(a) * 0.118, Math.sin(a) * 0.118, -0.2, drum);
    }
    add(new THREE.CylinderGeometry(0.03, 0.03, 0.44, 12).rotateX(Math.PI / 2), steel, 0, 0, 0, drum);

    // 击锤：绕底下的轴转
    const hammer = (this.hammer = new THREE.Group());
    hammer.position.set(0, 0.06, 0.2);
    model.add(hammer);
    add(extrudeYZ([[-0.03, -0.04], [0.04, -0.03], [0.1, 0.07], [0.16, 0.15], [0.13, 0.18], [0.06, 0.12], [-0.02, 0.06]], 0.07, 0.012), steel, 0, 0, 0, hammer);
    // 扳机和护圈
    add(extrudeYZ([[0.02, -0.33], [0.07, -0.33], [0.1, -0.4], [0.09, -0.47], [0.06, -0.48], [0.07, -0.41]], 0.045, 0.01), steel);
    const guard = new THREE.TorusGeometry(0.135, 0.02, 10, 36, Math.PI);
    guard.rotateZ(Math.PI);
    guard.rotateY(Math.PI / 2);
    add(guard, steel, 0, -0.355, 0.07);

    // 枪柄
    const gripPts = curve([[0.33, -0.27], [0.4, -0.46], [0.47, -0.66], [0.44, -0.77], [0.3, -0.79], [0.2, -0.72], [0.19, -0.56], [0.16, -0.4], [0.17, -0.33]], 60);
    add(extrudeYZ(gripPts, 0.22, 0.045), wood);
    // 枪柄底的金属护套
    add(new THREE.CylinderGeometry(0.055, 0.055, 0.2, 14).rotateZ(Math.PI / 2).rotateY(Math.PI / 2).rotateX(-0.25), steel, 0, -0.77, 0.37).scale.set(1, 1, 1.25);
    for (const s of [-1, 1]) {
      const med = add(new THREE.CylinderGeometry(0.05, 0.05, 0.012, 24).rotateZ(Math.PI / 2), brass, s * 0.112, -0.53, 0.31);
      med.scale.set(1, 1, 1);
      add(new THREE.CylinderGeometry(0.014, 0.014, 0.012, 10).rotateZ(Math.PI / 2), steel, s * 0.079, -0.08, 0.2);
      add(new THREE.CylinderGeometry(0.014, 0.014, 0.012, 10).rotateZ(Math.PI / 2), steel, s * 0.079, -0.22, -0.33);
    }

    model.traverse((m) => { if (m.isMesh) { m.castShadow = false; m.receiveShadow = false; } });

    // 枪口：火光从这里出来
    this.muzzle = new THREE.Object3D();
    this.muzzle.position.set(0, 0, -0.3 - bl - 0.04);
    model.add(this.muzzle);

    // 状态
    this.aim = 0;          // 0 放下 → 1 举起
    this.kick = 0;         // 后坐
    this.kickV = 0;
    this.cock = 0;         // 击锤扳起来多少
    this.drumAngle = 0;
    this.drumTarget = 0;
    this.yaw = 0; this.pitch = 0;
    this.time = 0;
  }

  /** 开一枪：后坐、击锤落下、转轮转一格 */
  fire() {
    this.kickV = 13;
    this.cock = 0;
    this.drumTarget += Math.PI / 3;
  }

  /**
   * 每帧更新。dir：在相机坐标里枪口该指向的方向（已经归一化）；aiming：手指按着没有
   */
  update(dt, dir, aiming) {
    this.time += dt;
    const k = 1 - Math.exp(-dt * 14);
    this.aim += ((aiming ? 1 : 0) - this.aim) * (1 - Math.exp(-dt * 9));
    this.cock += ((aiming ? 1 : 0) - this.cock) * (1 - Math.exp(-dt * 18));
    // 后坐是个弹簧
    this.kickV += (-this.kick * 260 - this.kickV * 22) * dt;
    this.kick += this.kickV * dt;
    this.drumAngle += (this.drumTarget - this.drumAngle) * (1 - Math.exp(-dt * 16));

    const yaw = Math.atan2(-dir.x, -dir.z);
    const pitch = Math.atan2(dir.y, Math.hypot(dir.x, dir.z));
    this.yaw += (yaw - this.yaw) * k;
    this.pitch += (pitch - this.pitch) * k;
    const idle = 1 - this.aim;
    const sway = Math.sin(this.time * 1.3) * 0.012 * idle;
    // 故意比准星再偏左、偏上一点，露出枪的右侧面（正对着就只看得到枪屁股）
    this.root.rotation.set(this.pitch + 0.1 - idle * 0.26 + sway, this.yaw + 0.42 - idle * 0.06, 0, 'YXZ');
    this.root.rotation.z = -0.16 - idle * 0.1;
    this.model.rotation.x = this.kick * 0.9;
    this.model.position.set(0, -idle * 0.12 + this.kick * 0.05, this.kick * 0.5);
    this.hammer.rotation.x = this.cock * 0.55;
    this.drum.rotation.z = this.drumAngle;
  }
}
