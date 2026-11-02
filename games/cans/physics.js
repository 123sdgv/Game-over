// 打罐子的物理：Bullet（ammo.js，games/_shared/lib/ammo.wasm.*，index.html 里用 <script> 先载入）。
// 罐子是圆柱、隔层木板是方块、台子是不动的零件、小车是按时间来回走的运动体。
// 子弹是一颗很快、有分量的小球（开了连续碰撞检测），撞到罐子会把它连同后面的一起撞飞。
import { CAN_R, CAN_H, BOARD_T } from './levels.js';
import { staticParts, cartDeck, cartX } from './props.js';

export const GRAVITY = 44;
export const SUB = 1 / 120;
const CAN_MASS = 1;
const BOARD_MASS = 1.3;
export const BULLET = { r: 0.12, mass: 2.6, speed: 66, life: 0.7 };

let A = null;
export async function loadAmmo(base = '../_shared/lib/') {
  if (!A) A = await window.Ammo({ locateFile: (p) => base + p });
  return A;
}

// userIndex：罐子/木板 = 下标 + 1；台子 = -(下标 + 1)；地面 = -9999；子弹 = 100000 + n
const GROUND = -9999;
const BULLET_ID = 100000;

export class Physics {
  constructor() {
    const cfg = (this.cfg = new A.btDefaultCollisionConfiguration());
    this.disp = new A.btCollisionDispatcher(cfg);
    this.bp = new A.btDbvtBroadphase();
    this.solver = new A.btSequentialImpulseConstraintSolver();
    const w = (this.world = new A.btDiscreteDynamicsWorld(this.disp, this.bp, this.solver, cfg));
    w.setGravity(new A.btVector3(0, -GRAVITY, 0));
    w.getSolverInfo().set_m_numIterations(12);
    this.t = new A.btTransform();
    this.v = new A.btVector3(0, 0, 0);
    this.v2 = new A.btVector3(0, 0, 0);
    this.q = new A.btQuaternion(0, 0, 0, 1);
    this.canShape = new A.btCylinderShape(new A.btVector3(CAN_R, CAN_H / 2, CAN_R));
    this.canShape.setMargin(0.02);
    this.canInertia = new A.btVector3(0, 0, 0);
    this.canShape.calculateLocalInertia(CAN_MASS, this.canInertia);
    this.bulletShape = new A.btSphereShape(BULLET.r);
    this.boardShapes = new Map();
    // 地面
    const g = this.addBody(new A.btBoxShape(new A.btVector3(400, 1, 400)), 0, [0, -1, 0], [0, 0, 0, 1], 0.85, 0.05);
    g.setUserIndex(GROUND);
    g.setRollingFriction(0.05);   // 草地：滚下来的罐子会慢慢停住
    this.items = [];
    this.supports = [];
    this.statics = [];
    this.bullets = [];
    this.bulletN = 0;
    this.time = 0;
    this.acc = 0;
    this.events = [];
  }

  addBody(shape, mass, pos, quat, friction = 0.6, restitution = 0.1, inertia = null) {
    const t = new A.btTransform();
    t.setIdentity();
    const o = new A.btVector3(pos[0], pos[1], pos[2]);
    const q = new A.btQuaternion(quat[0], quat[1], quat[2], quat[3]);
    t.setOrigin(o);
    t.setRotation(q);
    const ms = new A.btDefaultMotionState(t);
    let inr = inertia;
    if (!inr) { inr = new A.btVector3(0, 0, 0); if (mass) shape.calculateLocalInertia(mass, inr); }
    const info = new A.btRigidBodyConstructionInfo(mass, ms, shape, inr);
    const b = new A.btRigidBody(info);
    A.destroy(info);
    A.destroy(t); A.destroy(o); A.destroy(q);
    if (inr !== inertia) A.destroy(inr);
    b.setFriction(friction);
    b.setRestitution(restitution);
    this.world.addRigidBody(b);
    return b;
  }

  removeBody(b) {
    this.world.removeRigidBody(b);
    const ms = b.getMotionState();
    A.destroy(b);
    if (ms) A.destroy(ms);
  }

  /** 摆一关 */
  build(spec) {
    this.clear();
    this.spec = spec;
    this.time = 0;
    spec.supports.forEach((p, j) => {
      const rec = { p, parts: [], body: null };
      for (const part of staticParts(p)) {
        this.v.setValue(...(part.type === 'box' ? [part.size[0] / 2, part.size[1] / 2, part.size[2] / 2] : [part.r, part.h / 2, part.r]));
        const shape = part.type === 'box' ? new A.btBoxShape(this.v) : new A.btCylinderShape(this.v);
        const b = this.addBody(shape, 0, part.pos, part.quat, part.mat === 'drum' || part.mat === 'rail' ? 0.45 : 0.7, 0.1);
        b.setUserIndex(-(j + 1));
        this.statics.push({ b, shape });
      }
      if (p.kind === 'cart') {
        const d = cartDeck(p);
        this.v.setValue(d.size[0] / 2, d.size[1] / 2, d.size[2] / 2);
        const shape = new A.btBoxShape(this.v);
        const b = this.addBody(shape, 0, [cartX(p, 0), p.top + d.pos[1], p.z], [0, 0, 0, 1], 0.8, 0.05);
        b.setCollisionFlags(b.getCollisionFlags() | 2);    // 运动体：位置由我们来定
        b.setActivationState(4);                            // 永远不睡
        b.setUserIndex(-(j + 1));
        rec.body = b;
        rec.deckY = p.top + d.pos[1];
        this.statics.push({ b, shape });
      }
      this.supports.push(rec);
    });
    spec.items.forEach((it, i) => {
      let b;
      if (it.k === 'can') {
        b = this.addBody(this.canShape, CAN_MASS, [it.x, it.y, it.z], [0, 0, 0, 1], 0.5, 0.18, this.canInertia);
        b.setRollingFriction(0.003);
        b.setDamping(0.04, 0.12);
      } else {
        const key = `${it.w.toFixed(3)}x${it.d.toFixed(3)}`;
        let shape = this.boardShapes.get(key);
        if (!shape) { this.v.setValue(it.w / 2, BOARD_T / 2, it.d / 2); shape = new A.btBoxShape(this.v); this.boardShapes.set(key, shape); }
        b = this.addBody(shape, BOARD_MASS, [it.x, it.y, it.z], [0, 0, 0, 1], 0.65, 0.08);
        b.setDamping(0.04, 0.15);
      }
      b.setUserIndex(i + 1);
      b.setSleepingThresholds(0.6, 0.8);
      this.items.push({ i, k: it.k, t: it.t, b, gone: false, vx: 0, vy: 0, vz: 0, quiet: 0 });
    });
    this.settle();
  }

  /**
   * 摆好以后先悄悄算几十步：罐子之间的接触都建立起来（之后睡着了也连在一起，
   * 下面的被打飞，上面的会跟着醒过来掉下去），再从 0 秒开始算
   */
  settle(steps = 45) {
    for (const it of this.items) if (!it.gone) { it.b.forceActivationState(1); it.b.activate(); }
    const t = this.time;
    for (let i = 0; i < steps; i++) {
      for (const rec of this.supports) {
        if (!rec.body) continue;
        this.t.setIdentity();
        this.v.setValue(cartX(rec.p, t), rec.deckY, rec.p.z);
        this.t.setOrigin(this.v);
        rec.body.getMotionState().setWorldTransform(this.t);
      }
      this.world.stepSimulation(SUB, 0);
    }
    for (const it of this.items) if (!it.gone) { const v = it.b.getLinearVelocity(); it.vx = v.x(); it.vy = v.y(); it.vz = v.z(); }
    this.time = t;
    this.events = [];
  }

  /** 把 p 附近的东西都叫醒（打中、爆炸的时候） */
  wake(p, r = 3.5) {
    for (const it of this.items) {
      if (it.gone) continue;
      this.pose(it.b, Q);
      if (Math.hypot(Q.x - p[0], Q.y - p[1], Q.z - p[2]) < r) it.b.activate();
    }
  }

  clear() {
    for (const it of this.items) if (!it.gone) this.removeBody(it.b);
    for (const s of this.statics) { this.removeBody(s.b); A.destroy(s.shape); }
    for (const b of this.bullets) this.removeBody(b.b);
    this.items = []; this.statics = []; this.supports = []; this.bullets = [];
    this.events = [];
  }

  /** 读一个物体的位置和朝向 */
  pose(b, out) {
    b.getMotionState().getWorldTransform(this.t);
    const o = this.t.getOrigin(), r = this.t.getRotation();
    out.x = o.x(); out.y = o.y(); out.z = o.z();
    out.qx = r.x(); out.qy = r.y(); out.qz = r.z(); out.qw = r.w();
    return out;
  }

  /** 设一个物体的位置（读档用） */
  place(b, p) {
    this.t.setIdentity();
    this.v.setValue(p[0], p[1], p[2]);
    this.t.setOrigin(this.v);
    this.q.setValue(p[3], p[4], p[5], p[6]);
    this.t.setRotation(this.q);
    b.setWorldTransform(this.t);
    b.getMotionState().setWorldTransform(this.t);
    this.v.setValue(0, 0, 0);
    b.setLinearVelocity(this.v);
    b.setAngularVelocity(this.v);
  }

  cartPos(rec, t) { return cartX(rec.p, t); }

  /** 往前走 dt 秒（固定小步长），返回这段时间里发生的事 */
  step(dt) {
    this.acc += dt;
    let n = 0;
    while (this.acc >= SUB && n < 8) {
      this.acc -= SUB;
      n++;
      this.subStep();
    }
    if (n === 8) this.acc = 0;
    const ev = this.events;
    this.events = [];
    return ev;
  }

  subStep() {
    this.time += SUB;
    // 小车：按时间摆到该在的位置，Bullet 会自己算出它的速度，上面的罐子靠摩擦力跟着走
    for (const rec of this.supports) {
      if (!rec.body) continue;
      this.t.setIdentity();
      this.v.setValue(cartX(rec.p, this.time), rec.deckY, rec.p.z);
      this.t.setOrigin(this.v);
      rec.body.getMotionState().setWorldTransform(this.t);
    }
    this.world.stepSimulation(SUB, 0);

    // 子弹打中了什么（没有子弹在飞就不用看）
    const disp = this.disp;
    const m = this.bullets.length ? disp.getNumManifolds() : 0;
    for (let k = 0; k < m; k++) {
      const man = disp.getManifoldByIndexInternal(k);
      if (!man.getNumContacts()) continue;
      const b0 = A.castObject(man.getBody0(), A.btRigidBody);
      const b1 = A.castObject(man.getBody1(), A.btRigidBody);
      const u0 = b0.getUserIndex(), u1 = b1.getUserIndex();
      if (u0 < BULLET_ID && u1 < BULLET_ID) continue;
      const bulletIsA = u0 >= BULLET_ID;
      const bu = this.bullets.find((x) => x.id === (bulletIsA ? u0 : u1));
      if (!bu) continue;
      const other = bulletIsA ? u1 : u0;
      if (bu.hit.has(other)) continue;
      bu.hit.add(other);
      const pt = man.getContactPoint(0);
      const pos = bulletIsA ? pt.getPositionWorldOnB() : pt.getPositionWorldOnA();
      const nb = pt.get_m_normalWorldOnB();
      // 法线朝着子弹那边
      const s = bulletIsA ? 1 : -1;
      const ev = {
        type: 'hit', bullet: bu.n, first: bu.hit.size === 1,
        point: [pos.x(), pos.y(), pos.z()], normal: [nb.x() * s, nb.y() * s, nb.z() * s], dir: bu.dir,
      };
      if (other > 0) { ev.item = other - 1; this.wake(ev.point); }
      else if (other === GROUND) ev.ground = true;
      else ev.support = -other - 1;
      this.events.push(ev);
      if (bu.hit.size === 1) {
        // 撞上第一下以后子弹就有了重力，慢慢落下去
        this.v.setValue(0, -GRAVITY, 0);
        bu.b.setGravity(this.v);
      }
    }

    // 子弹寿命
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const bu = this.bullets[i];
      bu.age += SUB;
      if (bu.age > BULLET.life || (bu.hit.size && bu.age - bu.firstHitAge > 0.25)) {
        this.removeBody(bu.b);
        this.bullets.splice(i, 1);
      } else if (bu.hit.size && !bu.firstHitAge) bu.firstHitAge = bu.age;
    }

    // 磕碰声：速度突然变了就是撞到东西了
    for (const it of this.items) {
      if (it.gone || !it.b.isActive()) { it.vx = it.vy = it.vz = 0; continue; }
      const lv = it.b.getLinearVelocity();
      const vx = lv.x(), vy = lv.y(), vz = lv.z();
      const dv = Math.hypot(vx - it.vx, vy - it.vy - (-GRAVITY * SUB), vz - it.vz);
      if (dv > 3.2) {
        this.pose(it.b, P);
        this.events.push({ type: 'knock', item: it.i, k: it.k, strength: dv, y: P.y, x: P.x, z: P.z });
      }
      it.vx = vx; it.vy = vy; it.vz = vz;
    }
  }

  /** 开一枪：子弹从 origin 出发，沿 dir 飞 */
  fire(origin, dir) {
    const b = this.addBody(this.bulletShape, BULLET.mass, origin, [0, 0, 0, 1], 0.2, 0.1);
    this.v.setValue(0, 0, 0);
    b.setGravity(this.v);
    b.setDamping(0, 0);
    b.setCcdMotionThreshold(BULLET.r * 0.4);
    b.setCcdSweptSphereRadius(BULLET.r * 0.9);
    this.v.setValue(dir[0] * BULLET.speed, dir[1] * BULLET.speed, dir[2] * BULLET.speed);
    b.setLinearVelocity(this.v);
    b.setActivationState(4);
    const n = ++this.bulletN;
    b.setUserIndex(BULLET_ID + n);
    this.bullets.push({ b, n, id: BULLET_ID + n, dir, age: 0, hit: new Set(), firstHitAge: 0 });
    return n;
  }

  /** 射线：从 from 到 to 第一个碰到的东西 */
  ray(from, to) {
    const f = new A.btVector3(from[0], from[1], from[2]);
    const t = new A.btVector3(to[0], to[1], to[2]);
    const cb = new A.ClosestRayResultCallback(f, t);
    this.world.rayTest(f, t, cb);
    let res = null;
    if (cb.hasHit()) {
      const p = cb.get_m_hitPointWorld(), nn = cb.get_m_hitNormalWorld();
      const u = cb.get_m_collisionObject().getUserIndex();
      res = { point: [p.x(), p.y(), p.z()], normal: [nn.x(), nn.y(), nn.z()], frac: cb.get_m_closestHitFraction() };
      if (u > 0 && u < BULLET_ID) res.item = u - 1;
      else if (u === GROUND) res.ground = true;
      else if (u < 0) res.support = -u - 1;
    }
    A.destroy(cb); A.destroy(f); A.destroy(t);
    return res;
  }

  /** 推一下（子弹打中时补一点旋转，看起来更带劲） */
  push(i, imp, at) {
    const it = this.items[i];
    if (!it || it.gone) return;
    this.pose(it.b, P);
    it.b.activate();
    this.v.setValue(imp[0], imp[1], imp[2]);
    this.v2.setValue(at[0] - P.x, at[1] - P.y, at[2] - P.z);
    it.b.applyImpulse(this.v, this.v2);
  }

  /** 爆炸：把 i 号罐子拿掉，周围的东西往外掀 */
  explode(i, radius = 4.2, power = 26) {
    const it = this.items[i];
    if (!it || it.gone) return null;
    this.pose(it.b, P);
    const c = [P.x, P.y, P.z];
    it.gone = true;
    this.removeBody(it.b);
    const hits = [];
    for (const o of this.items) {
      if (o.gone) continue;
      this.pose(o.b, Q);
      const dx = Q.x - c[0], dy = Q.y - c[1], dz = Q.z - c[2];
      const d = Math.hypot(dx, dy, dz);
      if (d > radius) continue;
      const f = power * Math.pow(1 - d / radius, 0.8) * (o.k === 'board' ? 1.3 : 1);
      const inv = 1 / Math.max(0.3, d);
      o.b.activate();
      this.v.setValue(dx * inv * f, (dy * inv + 0.55) * f, dz * inv * f - 0.15 * f);
      this.v2.setValue((Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.4);
      o.b.applyImpulse(this.v, this.v2);
      hits.push({ i: o.i, d });
    }
    return { center: c, hits };
  }

  /** 拿掉一个东西（不炸，比如飞出画面太远） */
  remove(i) {
    const it = this.items[i];
    if (!it || it.gone) return;
    it.gone = true;
    this.removeBody(it.b);
  }

  /** 是不是都停下来了（小车上的不算，它们一直跟着动） */
  quiet() {
    for (const it of this.items) {
      if (it.gone || it.down || !it.b.isActive()) continue;     // 已经打下去的在地上滚不算
      const lv = it.b.getLinearVelocity();
      const av = it.b.getAngularVelocity();
      if (Math.hypot(lv.x(), lv.y(), lv.z()) > 0.9 || Math.hypot(av.x(), av.y(), av.z()) > 1.2) {
        if (!this.onCart(it)) return false;
      }
    }
    return this.bullets.length === 0;
  }

  onCart(it) {
    if (!this.supports.some((s) => s.body)) return false;
    this.pose(it.b, P);
    for (const s of this.supports) {
      if (!s.body) continue;
      const cx = cartX(s.p, this.time);
      if (Math.abs(P.x - cx) < s.p.w / 2 + 0.4 && Math.abs(P.z - s.p.z) < s.p.d / 2 + 0.4 && P.y > s.p.top - 0.2 && P.y < s.p.top + 8) return true;
    }
    return false;
  }

  /** 存档：每个东西的位置朝向 */
  snapshot() {
    return {
      time: +this.time.toFixed(3),
      items: this.items.map((it) => {
        if (it.gone) return 0;
        this.pose(it.b, P);
        return [P.x, P.y, P.z, P.qx, P.qy, P.qz, P.qw].map((v) => +v.toFixed(4));
      }),
    };
  }

  restore(snap) {
    this.time = snap.time || 0;
    snap.items.forEach((p, i) => {
      const it = this.items[i];
      if (!it) return;
      if (!p) { if (!it.gone) { it.gone = true; this.removeBody(it.b); } return; }
      this.place(it.b, p);
    });
    this.settle(24);
  }
}

const P = {}, Q = {};
