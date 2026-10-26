// 丛林狂奔：在古老的石头路上一直往前跑。
//   左右滑：换道；到了路口左右滑：转弯（没拐就会撞墙）
//   上滑：跳（树根、断崖）；下滑：滑铲（横木）；斜手机：往路边挪一点吃金币
// 跑得越远越快。分数 = 跑的米数 + 金币 × 10。
import * as THREE from './lib/three.module.min.js';
import { hub } from '../_shared/hub.js';
import { sound } from '../_shared/sound.js';
import { W, LANES, GROUND_Y, MAT, makeSegment, buildSegment, updateCoins, disposeSegment, toWorld } from './world.js';
import { Hero } from './hero.js';

const hb = hub('runner');
const $ = (id) => document.getElementById(id);
let cfg = hb.settings();
sound.enabled = cfg.sound;

/* ======================================================================
   场景
   ====================================================================== */
const FOG = 0xa9cfae;
const canvas = $('cv');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
const scene = new THREE.Scene();
scene.background = new THREE.Color(FOG);
scene.fog = new THREE.Fog(FOG, 26, 120);
const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 400);
scene.add(new THREE.HemisphereLight(0xeaf7ff, 0x35522a, 1.7));
const sun = new THREE.DirectionalLight(0xfff0d2, 2.3);
scene.add(sun, sun.target);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(700, 700), MAT.ground);
ground.rotation.x = -Math.PI / 2;
ground.position.y = GROUND_Y;
scene.add(ground);
const hero = new Hero();
scene.add(hero.group, hero.shadowHolder);

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setPixelRatio(cfg.lowPower ? 1.25 : Math.min(2, window.devicePixelRatio || 1));
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.fov = w / h < 0.6 ? 66 : 58;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

/* ======================================================================
   状态
   ====================================================================== */
const SPEEDS = [8, 9.5, 11, 12.5, 14];
const GRAV = 27, JUMP = 9.4, SLIDE_T = 0.75;
const R = {
  phase: 'menu', paused: false,
  segs: [], si: 0,
  s: 0, x: 0, lane: 1, y: 0, vy: 0, slideT: 0, speed: 0, dist: 0, coins: 0,
  yaw: 0, camYaw: 0, pendingTurn: null, overGap: false,
  tiltOn: false, tiltSeen: false, gamma: 0, tiltBase: null, tiltOff: 0,
  deadT: 0, death: '', time: 0, stepT: 0, hintT: 0, hinted: new Set(),
};
const cur = () => R.segs[R.si];

function clearTrack() {
  R.segs.forEach(disposeSegment);
  R.segs = [];
  R.si = 0;
}
function ensureAhead() {
  while (R.segs.length - R.si < 5) {
    const prev = R.segs[R.segs.length - 1] || null;
    let ahead = R.dist;
    for (let i = R.si; i < R.segs.length; i++) ahead += R.segs[i].len;
    const seg = makeSegment(prev, ahead, R.tiltOn && R.tiltSeen);
    scene.add(buildSegment(seg));
    R.segs.push(seg);
  }
  // 身后两段以前的拆掉
  while (R.si > 1) { disposeSegment(R.segs.shift()); R.si--; }
}

function resetRun() {
  clearTrack();
  Object.assign(R, { s: 0, x: 0, lane: 1, y: 0, vy: 0, slideT: 0, dist: 0, coins: 0, yaw: 0, camYaw: 0, pendingTurn: null, overGap: false, deadT: 0, death: '', tiltBase: null, tiltOff: 0 });
  R.speed = SPEEDS[cfg.startSpeed - 1];
  hero.phase = 0; hero.fallT = 0;
  ensureAhead();
  placeCamera(1);
  ui();
}

/* ======================================================================
   操作
   ====================================================================== */
function jump() {
  if (R.phase !== 'run' || R.y > 0.01 || R.overGap) return;
  R.vy = JUMP; R.slideT = 0;
  sound.hiss({ f: 500, to: 1600, dur: 0.16, vol: 0.07 });
  sound.tone({ f: 260, to: 520, dur: 0.12, vol: 0.06 });
  hb.haptic(6);
}
function slide() {
  if (R.phase !== 'run') return;
  if (R.y > 0.05) { R.vy = Math.min(R.vy, -14); R.slideT = SLIDE_T; return; } // 空中下滑：赶紧落地接着滑
  R.slideT = SLIDE_T;
  sound.hiss({ f: 900, to: 260, dur: 0.32, filter: 'lowpass', vol: 0.12 });
  hb.haptic(6);
}
function side(dir) {
  if (R.phase !== 'run') return;
  const seg = cur(), want = dir < 0 ? 'L' : 'R';
  if (seg.turn === want && R.s > seg.len - 14) {
    R.pendingTurn = want;
    if (R.s >= seg.len - 0.15) doTurn();
    return;
  }
  const nl = Math.max(0, Math.min(2, R.lane + dir));
  if (nl !== R.lane) { R.lane = nl; sound.hiss({ f: 1500, to: 900, dur: 0.1, vol: 0.04 }); }
}

function doTurn() {
  const seg = cur(), next = R.segs[R.si + 1];
  const p = toWorld(seg, R.s, R.x);
  const fx = Math.round(Math.sin(next.dir * Math.PI / 2)), fz = Math.round(-Math.cos(next.dir * Math.PI / 2));
  const rx = -fz, rz = fx;
  const dx = p.x - next.start.x, dz = p.z - next.start.z;
  R.s = dx * fx + dz * fz;
  R.x = dx * rx + dz * rz;
  R.lane = 1;
  R.si++;
  R.yaw = next.dir * Math.PI / 2;
  R.pendingTurn = null;
  sound.hiss({ f: 2000, to: 700, dur: 0.22, vol: 0.07 });
  hb.haptic(8);
  ensureAhead();
}

// 手势：按下之后滑动超过一段距离就算一次
let touch = null;
canvas.addEventListener('pointerdown', (e) => { touch = { x: e.clientX, y: e.clientY, done: false }; });
canvas.addEventListener('pointermove', (e) => {
  if (!touch || touch.done) return;
  const dx = e.clientX - touch.x, dy = e.clientY - touch.y;
  if (Math.hypot(dx, dy) < 26) return;
  touch.done = true;
  if (Math.abs(dx) > Math.abs(dy)) side(dx < 0 ? -1 : 1);
  else if (dy < 0) jump(); else slide();
});
const endTouch = () => { touch = null; };
canvas.addEventListener('pointerup', endTouch);
canvas.addEventListener('pointercancel', endTouch);
window.addEventListener('keydown', (e) => {
  const k = e.key;
  if (k === 'ArrowLeft' || k === 'a') side(-1);
  else if (k === 'ArrowRight' || k === 'd') side(1);
  else if (k === 'ArrowUp' || k === 'w' || k === ' ') jump();
  else if (k === 'ArrowDown' || k === 's') slide();
});

// 倾斜手机
function onTilt(e) {
  if (e.gamma == null) return;
  R.gamma = e.gamma;
  R.tiltSeen = true;
}
async function enableTilt() {
  if (!cfg.tilt) return false;
  const DOE = window.DeviceOrientationEvent;
  if (!DOE) return false;
  try {
    if (typeof DOE.requestPermission === 'function') {
      const r = await DOE.requestPermission();
      if (r !== 'granted') return false;
    }
  } catch { return false; }
  window.removeEventListener('deviceorientation', onTilt);
  window.addEventListener('deviceorientation', onTilt);
  return true;
}

/* ======================================================================
   每一帧
   ====================================================================== */
function die(kind) {
  if (R.phase !== 'run') return;
  R.phase = 'dead'; R.death = kind; R.deadT = 0;
  if (kind === 'gap') sound.tone({ f: 700, to: 110, dur: 1.1, vol: 0.14 });
  else {
    sound.tone({ f: 140, to: 45, dur: 0.45, vol: 0.4 });
    sound.hiss({ f: 900, to: 120, dur: 0.5, filter: 'lowpass', vol: 0.35 });
  }
  hb.haptic([40, 30, 60]);
  const score = Math.floor(R.dist) + R.coins * 10;
  const st = hb.stats();
  const prev = st.best || 0;
  st.runs = (st.runs || 0) + 1;
  st.best = Math.max(prev, score);
  st.bestDist = Math.max(st.bestDist || 0, Math.floor(R.dist));
  st.coins = (st.coins || 0) + R.coins;
  hb.saveStats(st);
  const why = { pillar: '撞到石柱了', root: '被树根绊倒了', beam: '撞到横木了', gap: '掉下去了', wall: '没拐弯，撞墙了' }[kind];
  setTimeout(() => showCard({
    title: score > prev && prev > 0 ? '新纪录！' : why, big: `${score}`,
    meta: `跑了 <b>${Math.floor(R.dist)}</b> 米 · 金币 <b>${R.coins}</b> · 最高 <b>${Math.max(prev, score)}</b>`,
    main: ['再跑一次', start], alt: ['返回', toMenu],
  }), 1300);
}

function update(dt) {
  R.time += dt;
  MAT.flame.opacity = 0.75 + 0.2 * Math.sin(R.time * 23) * Math.sin(R.time * 7);
  const seg = cur();
  if (R.phase === 'run') {
    R.speed = SPEEDS[cfg.startSpeed - 1] + 13 * (1 - Math.exp(-R.dist / 1100));
    const ds = R.speed * dt;
    R.s += ds; R.dist += ds;
    // 横向：道 + 倾斜
    if (R.tiltOn && R.tiltSeen) {
      if (R.tiltBase === null) R.tiltBase = R.gamma;
      const sens = [0.6, 0.8, 1, 1.25, 1.5][cfg.tiltSens - 1];
      const t = Math.max(-1, Math.min(1, ((R.gamma - R.tiltBase) / 22) * sens));
      R.tiltOff += (t * 1.1 - R.tiltOff) * (1 - Math.exp(-dt * 8));
    }
    const tx = Math.max(-(W / 2 - 0.45), Math.min(W / 2 - 0.45, LANES[R.lane] + R.tiltOff));
    R.x += (tx - R.x) * (1 - Math.exp(-dt * 13));
    // 跳 / 滑
    R.overGap = seg.gaps.some((g) => R.s > g.s + 0.2 && R.s < g.s + g.len - 0.2);
    if (R.y > 0 || R.vy > 0 || R.overGap) {
      R.vy -= GRAV * dt; R.y += R.vy * dt;
      if (R.y <= 0 && !R.overGap) { R.y = 0; R.vy = 0; if (R.slideT > 0) slideSound(); else landSound(); }
      if (R.overGap && R.y < -0.3) die('gap');
    }
    if (R.slideT > 0 && R.y <= 0) R.slideT -= dt;
    // 路口
    if (R.pendingTurn && R.s >= seg.len - 0.15) doTurn();
    else if (R.s > seg.len + W / 2 - 0.9) die('wall');
    // 障碍
    const h = R.slideT > 0 && R.y <= 0.05 ? 0.85 : 1.85;
    for (const o of cur().obstacles) {
      const d = R.s - o.s;
      if (o.type === 'pillar' && Math.abs(d) < o.depth / 2 + 0.3 && Math.abs(R.x - o.x) < o.w / 2 + 0.3 && R.y < o.h) die('pillar');
      else if (o.type === 'root' && Math.abs(d) < 0.45 && R.y < 0.55) die('root');
      else if (o.type === 'beam' && Math.abs(d) < 0.5 && R.y + h > o.bottom) die('beam');
    }
    // 金币
    const s2 = cur();
    for (const c of s2.coins) {
      if (c.taken || Math.abs(c.s - R.s) > 0.9 || Math.abs(c.x - R.x) > 0.75) continue;
      if (c.y < R.y - 0.3 || c.y > R.y + h + 0.3) continue;
      c.taken = true;
      R.coins++;
      const f = 1400 + (R.coins % 5) * 90;
      sound.tone({ f, to: f * 1.35, dur: 0.08, type: 'triangle', vol: 0.09 });
      const el = document.querySelector('.coins'); el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump');
    }
    // 脚步声
    if (R.y <= 0 && R.slideT <= 0) {
      R.stepT -= dt * (R.speed / 10);
      if (R.stepT <= 0) { R.stepT = 0.32; sound.hiss({ f: 320, to: 180, dur: 0.04, filter: 'lowpass', vol: 0.05 }); }
    }
    hints();
    ui();
  } else if (R.phase === 'dead') {
    R.deadT += dt;
    if (R.death === 'gap') { R.vy -= GRAV * dt; R.y += R.vy * dt; }
  }
  // 主角
  const p = toWorld(cur(), R.s, R.x, R.y);
  hero.group.position.copy(p);
  hero.group.rotation.y = -R.yaw;
  let mode = 'idle';
  if (R.phase === 'run') mode = R.y > 0.05 || R.vy > 0 ? 'jump' : R.slideT > 0 ? 'slide' : 'run';
  else if (R.phase === 'dead') mode = R.death === 'gap' ? 'fall' : 'crash';
  hero.update({ mode, y: R.y, speed: R.speed, t: R.time, overGap: R.overGap }, dt);
  hero.shadowHolder.position.set(p.x, 0.03, p.z);
  // 金币转起来
  for (let i = R.si; i < Math.min(R.segs.length, R.si + 2); i++) updateCoins(R.segs[i], R.time, dt);
  placeCamera(dt);
  // 光和地面跟着走
  sun.position.set(p.x - 30, 60, p.z + 20); sun.target.position.copy(p);
  ground.position.x = p.x; ground.position.z = p.z;
}
let landT = 0;
function landSound() { if (R.time - landT > 0.2) { landT = R.time; sound.tone({ f: 160, to: 90, dur: 0.07, vol: 0.08 }); } }
function slideSound() { sound.hiss({ f: 900, to: 260, dur: 0.3, filter: 'lowpass', vol: 0.11 }); }

const camPos = new THREE.Vector3(), look = new THREE.Vector3();
function placeCamera(dt) {
  const k = 1 - Math.exp(-dt * 6);
  R.camYaw += (R.yaw - R.camYaw) * k;
  const fx = Math.sin(R.camYaw), fz = -Math.cos(R.camYaw);
  const p = toWorld(cur(), R.s, R.phase === 'dead' ? R.x : R.x * 0.6, 0);
  const menu = R.phase === 'menu';
  const back = menu ? 5.5 : 7.4, up = menu ? 2.6 : 4.4;
  const y = R.phase === 'dead' && R.death === 'gap' ? 0 : Math.max(0, R.y) * 0.35;
  camPos.set(p.x - fx * back, up + y, p.z - fz * back);
  if (dt >= 1) camera.position.copy(camPos);
  else camera.position.lerp(camPos, 1 - Math.exp(-dt * (R.phase === 'dead' ? 2 : 12)));
  look.set(p.x + fx * 6, 1.2 + y, p.z + fz * 6);
  camera.lookAt(look);
}

/* ---------- 新手提示（前几局） ---------- */
function hints() {
  const el = $('hint');
  R.hintT -= 1 / 60;
  if (R.runsBefore >= 3) { el.classList.remove('on'); return; }
  const seg = cur();
  let text = '';
  if (seg.len - R.s < 16 && seg.len - R.s > 0 && !R.pendingTurn) text = seg.turn === 'L' ? '往左滑，转弯！' : '往右滑，转弯！';
  else {
    const o = seg.obstacles.find((o) => o.s - R.s > 0 && o.s - R.s < 13);
    if (o) text = o.type === 'beam' ? '往下滑，滑过去！' : o.type === 'pillar' ? '左右滑，换条道！' : '往上滑，跳过去！';
  }
  el.textContent = text;
  el.classList.toggle('on', !!text);
}

/* ======================================================================
   界面
   ====================================================================== */
let shownScore = -1;
function ui() {
  const score = Math.floor(R.dist) + R.coins * 10;
  if (score !== shownScore) { $('score').textContent = score; shownScore = score; }
  $('dist').textContent = `${Math.floor(R.dist)} 米`;
  $('coins').textContent = R.coins;
}

let cardActions = {};
function showCard({ title, big = '', meta = '', main, alt }) {
  $('cardTitle').textContent = title;
  $('cardBig').textContent = big;
  $('cardMeta').innerHTML = meta;
  $('cardMain').textContent = main ? main[0] : '';
  $('cardAlt').textContent = alt ? alt[0] : '';
  cardActions = { main: main && main[1], alt: alt && alt[1] };
  $('cardWrap').hidden = false;
}
function hideCard() { $('cardWrap').hidden = true; }
$('cardMain').addEventListener('click', () => { const f = cardActions.main; hideCard(); if (f) f(); });
$('cardAlt').addEventListener('click', () => { const f = cardActions.alt; hideCard(); if (f) f(); });

function toMenu() {
  R.phase = 'menu';
  R.paused = false;
  hideCard();
  resetRun();
  document.body.classList.add('menu-on');
  $('menu').hidden = false;
  $('hint').classList.remove('on');
  const st = hb.stats();
  $('menuSub').textContent = st.best ? `最高 ${st.best} 分 · 最远 ${st.bestDist || 0} 米` : '';
  $('tiltHelp').hidden = !cfg.tilt;
}

async function start() {
  hideCard();
  R.tiltOn = await enableTilt();
  R.runsBefore = hb.stats().runs || 0;
  resetRun();
  R.phase = 'run';
  R.paused = false;
  document.body.classList.remove('menu-on');
  $('menu').hidden = true;
  sound.tone({ f: 523, to: 784, dur: 0.18, type: 'triangle', vol: 0.1 });
}
$('go').addEventListener('click', start);

function pause() {
  if (R.phase !== 'run' || R.paused) return;
  R.paused = true;
  showCard({
    title: '已暂停', big: `${Math.floor(R.dist) + R.coins * 10}`,
    meta: `跑了 <b>${Math.floor(R.dist)}</b> 米 · 金币 <b>${R.coins}</b>`,
    main: ['继续', () => { R.paused = false; last = performance.now(); }],
    alt: ['结束这局', toMenu],
  });
}
$('pause').addEventListener('click', pause);
hb.onPause(pause);
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
hb.onSettings((next) => {
  const lp = next.lowPower !== cfg.lowPower;
  cfg = next;
  sound.enabled = cfg.sound;
  if (lp) resize();
  if (R.phase === 'menu') toMenu();
});

let last = performance.now();
function frame(t) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (t - last) / 1000);
  last = t;
  if (!R.paused) update(dt);
  renderer.render(scene, camera);
}

toMenu();
requestAnimationFrame(frame);
window.__run = { R, side, jump, slide, start, renderer }; // 方便自动测试
