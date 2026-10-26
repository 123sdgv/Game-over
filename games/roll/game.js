// 滚滚球：小球在悬浮方块拼成的轨道上一直往前滚。
//   按住屏幕左右拖：小球跟着手指左右挪（手指划过会留下一道白光）
//   躲开块块、别掉进缺口，顺路吃金币。没有跳跃（gray 真机试过，跳太难，删掉了）。
// 闯关：每关路线固定，滚过终点线就过关。无尽：一直滚，分数 = 米数 + 金币 × 10。
import { hub } from '../_shared/hub.js';
import { sound } from '../_shared/sound.js';
import { Track, BALL_R, XMAX, colOf, obX } from './track.js';
import { World } from './scene.js';
import { Trail } from './trail.js';

const hb = hub('roll');
const $ = (id) => document.getElementById(id);
let cfg = hb.settings();
sound.enabled = cfg.sound;
// 旧的「丛林狂奔」已经删掉了，顺手清掉它留下的数据；新手提示也删了
try {
  for (const k of ['settings', 'stats']) localStorage.removeItem(`pp.game.runner.${k}`);
  localStorage.removeItem('pp.game.roll.tips');
} catch {}

/* ======================================================================
   画面
   ====================================================================== */
const world = new World($('cv'));
const trail = new Trail($('fx'));
trail.enabled = cfg.trail;
world.setLowPower(cfg.lowPower);
function resize() { world.resize(); trail.resize(); }
window.addEventListener('resize', resize);
resize();

/* ======================================================================
   状态
   ====================================================================== */
const S0 = 3;                                   // 起点（米）
const SPEED = (v) => 6 + (v - 1) * 1.25;        // 设置里的 1 … 10 → 米/秒
const FALL_G = 42;
const R = {
  phase: 'menu',         // menu | count | run | crash | fall | win
  paused: false,
  mode: 'level', level: 1, seed: 1, base: 11, accel: true,
  s: S0, x: 0, tx: 0, y: 0, vy: 0,
  grounded: true, edgeT: 0, falling: false,
  coins: 0, streak: 0, lastCoin: -9,
  time: 0, endT: 0, countT: 0, menuT: 1,
  speed: 11, lastRow: 0, saveT: 0, bumpT: 0,
};
let track = null;

function speedAt(row) {
  if (R.mode === 'level') return R.base * (1 + 0.03 * Math.min(R.level - 1, 15));
  return R.base * (R.accel ? 1 + 0.55 * (1 - Math.exp(-row / 1300)) : 1);
}

/* ======================================================================
   声音
   ====================================================================== */
const sfx = {
  coin(n) {
    const f = 1250 + Math.min(n, 8) * 85;
    sound.tone({ f, to: f * 1.5, dur: 0.07, type: 'triangle', vol: 0.09 });
    sound.tone({ f: f * 1.5, dur: 0.12, type: 'sine', vol: 0.06, delay: 0.05 });
  },
  crash() {
    sound.tone({ f: 130, to: 45, dur: 0.35, vol: 0.32 });
    sound.hiss({ f: 6500, to: 1800, dur: 0.4, filter: 'highpass', vol: 0.22 });
    for (let i = 0; i < 6; i++) sound.tone({ f: 2200 + Math.random() * 2600, dur: 0.05, type: 'triangle', vol: 0.05, delay: 0.02 + i * 0.035 });
  },
  fall() { sound.tone({ f: 620, to: 90, dur: 1.0, vol: 0.12 }); sound.hiss({ f: 1200, to: 200, dur: 0.8, filter: 'lowpass', vol: 0.06 }); },
  win() { sound.arp([523, 659, 784, 1047, 1319], { gap: 0.08, dur: 0.22, type: 'triangle', vol: 0.11 }); },
  beep(go) { sound.tone({ f: go ? 1040 : 660, dur: go ? 0.2 : 0.09, type: 'triangle', vol: 0.11 }); },
  tick() { sound.hiss({ f: 260, to: 160, dur: 0.035, filter: 'lowpass', vol: 0.03 }); },
  bump() { sound.tone({ f: 240, to: 160, dur: 0.06, vol: 0.06 }); },
};
let swishT = 0;
function swish(speed) {
  const now = performance.now();
  if (now - swishT < 160) return;
  swishT = now;
  const v = Math.min(1, (speed - 1) / 2.5);
  sound.hiss({ f: 1800 + v * 1200, to: 600, dur: 0.13, q: 1.4, vol: 0.025 + v * 0.05 });
}

/* ======================================================================
   开一局 / 读档
   ====================================================================== */
function newTrack() {
  track = new Track({ seed: R.seed, mode: R.mode, level: R.level, speedAt });
  world.setTrack(track);
}

function resetBall() {
  Object.assign(R, { x: 0, tx: 0, y: 0, vy: 0, grounded: true, edgeT: 0, falling: false, streak: 0 });
}

function start(mode, opts = {}) {
  hideCard();
  R.mode = mode;
  R.level = mode === 'level' ? opts.level || menuLevel : 1;
  R.seed = opts.seed ?? (mode === 'level' ? 1000 + R.level * 7919 : (Math.random() * 1e9) | 0);
  R.base = opts.base ?? SPEED(cfg.speed);
  R.accel = opts.accel ?? cfg.accel;
  newTrack();
  resetBall();
  R.s = S0; R.coins = 0; R.time = 0;
  if (opts.resume) {
    const sv = opts.resume;
    track.ensure(Math.ceil(sv.s) + 80);
    const safe = Math.max(0, ...track.safe.filter((r) => r <= sv.s - 0.5));
    R.s = Math.max(S0, safe + 0.6);
    for (let r = 0; r <= Math.floor(sv.s) + 1; r++) track.rows[r]?.coins.forEach((c) => (c.taken = true));
    R.coins = sv.coins || 0;
    R.time = sv.time || 0;
  }
  R.lastRow = Math.floor(R.s);
  R.runStart = R.s;
  R.phase = 'count';
  R.countT = 0;
  R.paused = false;
  R.endT = 0;
  document.body.classList.remove('menu-on');
  document.body.classList.toggle('lv', R.mode === 'level');
  $('menu').hidden = true;
  shownScore = null;
  ui();
  save();
}

function snapshot() {
  return { v: 1, mode: R.mode, level: R.level, seed: R.seed, base: R.base, accel: R.accel, s: R.s, coins: R.coins, time: R.time };
}
function save() {
  if (R.phase === 'run' || R.phase === 'count') hb.save('run', snapshot());
}
function clearSave() { hb.save('run', null); }

/* ======================================================================
   操作：按住左右拖
   ====================================================================== */
const cv = $('cv');
let drag = null;
const SENS = [0.95, 0.8, 0.66, 0.54, 0.44];      // 拖过屏幕宽度的几成 = 从轨道一边挪到另一边
const pxToM = () => (XMAX * 2) / (window.innerWidth * SENS[cfg.sens - 1]);
const canSteer = () => (R.phase === 'run' || R.phase === 'count') && !R.paused && !R.falling;

cv.addEventListener('pointerdown', (e) => {
  try { cv.setPointerCapture(e.pointerId); } catch {}
  if (R.phase === 'run' || R.phase === 'count') trail.down(e.pointerId, e.clientX, e.clientY);
  drag = { id: e.pointerId, x0: e.clientX, tx0: R.tx, lx: e.clientX, ly: e.clientY };
});
cv.addEventListener('pointermove', (e) => {
  // 掉帧的时候浏览器会把好几次移动合成一个事件，拆开一个个处理，划痕更顺
  let evs = [];
  try { evs = e.getCoalescedEvents ? e.getCoalescedEvents() : []; } catch {}
  if (!evs.length) evs = [e];
  for (const ev of evs) {
    trail.move(e.pointerId, ev.clientX, ev.clientY);
    if (drag && drag.id === e.pointerId) moveSample(ev.clientX, ev.clientY, ev.timeStamp || e.timeStamp);
  }
});
function moveSample(x, y, t) {
  // 划得快就有一点「咻」的声音
  const dt = Math.max(1, t - (drag.lt || t - 16));
  const v = Math.hypot(x - drag.lx, y - drag.ly) / dt;
  if (v > 1.1 && trail.enabled && R.phase === 'run') swish(v);
  drag.lx = x; drag.ly = y; drag.lt = t;
  if (canSteer()) {
    R.tx = Math.max(-XMAX, Math.min(XMAX, drag.tx0 + (x - drag.x0) * pxToM()));
    // 手指拖到头了：把起点挪过来，往回拖立刻就有反应
    if (Math.abs(R.tx) >= XMAX - 1e-6) drag.x0 = x - (R.tx - drag.tx0) / pxToM();
  }
}
const endPtr = (e) => {
  trail.up(e.pointerId);
  if (drag && drag.id === e.pointerId) drag = null;
};
cv.addEventListener('pointerup', endPtr);
cv.addEventListener('pointercancel', endPtr);

const keys = new Set();
window.addEventListener('keydown', (e) => {
  keys.add(e.key);
  if (e.key === 'Escape') pause();
});
window.addEventListener('keyup', (e) => keys.delete(e.key));

/* ======================================================================
   每一帧
   ====================================================================== */
function step(dt) {
  R.time += dt;
  R.speed = speedAt(R.s);
  const prevX = R.x, prevS = R.s;

  // 键盘（电脑上测试用）
  if (canSteer()) {
    const k = (keys.has('ArrowRight') || keys.has('d') ? 1 : 0) - (keys.has('ArrowLeft') || keys.has('a') ? 1 : 0);
    if (k) R.tx = Math.max(-XMAX, Math.min(XMAX, R.tx + k * 7 * dt));
  }

  if (!R.falling) {
    const before = R.x;
    R.x += (R.tx - R.x) * (1 - Math.exp(-dt * 26));
    if (Math.abs(R.tx) >= XMAX - 0.001 && Math.abs(R.x - before) > 0.02 && R.time - R.bumpT > 0.4 && Math.abs(R.x) > XMAX - 0.03) { R.bumpT = R.time; sfx.bump(); }
  }
  R.s += R.speed * dt * (R.falling ? 0.55 : 1);

  const row = Math.floor(R.s), col = colOf(R.x);
  const ground = track.has(row, col);

  track.ensure(row + 80);
  if (R.grounded && !ground) { R.grounded = false; R.edgeT = 0.05; R.vy = 0; }
  if (!R.grounded) {
    if (R.edgeT > 0) {
      // 刚压到洞的边：宽容一丁点，又滚回方块上就算没事
      R.edgeT -= dt;
      if (ground) { R.grounded = true; R.edgeT = 0; }
      else if (R.edgeT <= 0) { R.falling = true; R.vy = 0; }
    } else {
      R.vy -= FALL_G * dt;
      R.y += R.vy * dt;
    }
  }
  if (R.falling) {
    // 别穿进前面方块的侧面
    const ahead = Math.floor(R.s + BALL_R);
    if (ahead > row && R.y < -0.05 && track.has(ahead, col)) R.s = ahead - BALL_R - 0.001;
    if (R.y < -0.35) return die('fall');
  }

  // 滚过的格子亮一下 + 很轻的滚动声
  if (R.grounded) {
    world.lightTile(row, col);
    if (row !== R.lastRow && row % 2 === 0) sfx.tick();
  }
  R.lastRow = row;

  // 撞块块
  const cy = R.y + BALL_R;
  for (let r = row - 2; r <= row + 1; r++) {
    const Rw = track.rows[r];
    if (!Rw) continue;
    for (const o of Rw.obs) {
      const ox = obX(o, R.time);
      const px = Math.max(ox - o.w / 2, Math.min(ox + o.w / 2, R.x));
      const ps = Math.max(o.s, Math.min(o.s + o.d, R.s));
      const py = Math.max(0, Math.min(o.h, cy));
      if (Math.hypot(px - R.x, ps - R.s, py - cy) < BALL_R * 0.8) return die('crash', R.x - prevX, R.s - prevS);
    }
  }

  // 吃金币
  for (let r = row - 1; r <= row + 1; r++) {
    const Rw = track.rows[r];
    if (!Rw) continue;
    for (const c of Rw.coins) {
      if (c.taken) continue;
      if (Math.abs(c.x - R.x) > 0.55 || Math.abs(r + 0.5 - R.s) > 0.6 || Math.abs(0.45 + c.y - cy) > 0.62) continue;
      c.taken = true;
      R.coins++;
      R.streak = R.time - R.lastCoin < 0.7 ? R.streak + 1 : 0;
      R.lastCoin = R.time;
      sfx.coin(R.streak);
      world.burst(c.x, 0.45 + c.y, r + 0.5, 0xffd34d, 8, 2.6);
      world.burst(c.x, 0.45 + c.y, r + 0.5, 0xffffff, 4, 2);
      const el = $('coinBox'); el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump');
    }
  }

  // 到终点
  if (R.mode === 'level' && R.s > track.finish + 0.3) return win();

  R.saveT += dt;
  if (R.saveT > 2) { R.saveT = 0; save(); }
  ui();
}

function die(kind, vx = 0, vs = 0) {
  if (R.phase !== 'run') return;
  R.phase = kind;
  R.endT = 0;
  clearSave();
  if (kind === 'crash') {
    world.shatter(R.x, R.y + BALL_R, R.s, vx / (1 / 60), R.speed);
    sfx.crash();
    const f = $('flash'); f.classList.remove('on'); void f.offsetWidth; f.classList.add('on');
    hb.haptic([30, 30, 50]);
  } else {
    sfx.fall();
    hb.haptic(20);
  }
  const res = record(false);
  const why = kind === 'crash' ? '撞到块块了' : '掉下去了';
  setTimeout(() => {
    if (R.mode === 'level') {
      showCard({
        title: why, big: `${res.pct}%`,
        meta: `第 <b>${R.level}</b> 关 · 金币 <b>${R.coins}</b>`,
        main: ['再试一次', () => start('level', { level: R.level })], alt: ['返回', toMenu],
      });
    } else {
      showCard({
        title: res.record ? '新纪录！' : why, big: `${res.score}`,
        meta: `滚了 <b>${res.dist}</b> 米 · 金币 <b>${R.coins}</b> · 最高 <b>${res.best}</b>`,
        main: ['再来一局', () => start('endless')], alt: ['返回', toMenu],
      });
    }
  }, kind === 'crash' ? 1100 : 900);
}

function win() {
  R.phase = 'win';
  R.endT = 0;
  clearSave();
  sfx.win();
  world.confetti(R.s + 1.5);
  hb.haptic([15, 40, 15]);
  record(true);
  menuLevel = Math.min(maxLevel(), R.level + 1);
  setTimeout(() => {
    showCard({
      title: '过关啦！', big: `第 ${R.level} 关`,
      meta: `金币 <b>${R.coins}</b> · 用时 <b>${R.time.toFixed(1)}</b> 秒`,
      main: ['下一关', () => start('level', { level: R.level + 1 })], alt: ['返回', toMenu],
    });
  }, 1300);
}

/** 记一局：played、最高分、金币 */
function record(won) {
  const st = hb.stats();
  st.played = (st.played || 0) + 1;
  st.coins = (st.coins || 0) + R.coins;
  const dist = Math.max(0, Math.floor(R.s - S0));
  const score = dist + R.coins * 10;
  const prev = st.best || 0;
  let pct = 0;
  if (R.mode === 'endless') {
    st.best = Math.max(prev, score);
    st.bestDist = Math.max(st.bestDist || 0, dist);
  } else {
    pct = Math.min(100, Math.floor(((R.s - S0) / (track.finish - S0)) * 100));
    if (won) {
      st.cleared = Math.max(st.cleared || 0, R.level);
      st.level = Math.max(st.level || 1, R.level + 1);
    }
  }
  hb.saveStats(st);
  return { score, dist, best: Math.max(prev, score), record: R.mode === 'endless' && score > prev && prev > 0, pct };
}

/* ======================================================================
   界面
   ====================================================================== */
let shownScore = null;
function ui() {
  if (R.mode === 'endless') {
    const dist = Math.max(0, Math.floor(R.s - S0));
    const score = dist + R.coins * 10;
    if (score !== shownScore) { $('score').textContent = score; shownScore = score; }
    $('sub').textContent = `${dist} 米`;
  } else {
    if (shownScore !== -R.level) { $('score').textContent = `第 ${R.level} 关`; shownScore = -R.level; }
    const p = Math.max(0, Math.min(1, (R.s - S0) / (track.finish - S0)));
    $('progFill').style.transform = `scaleX(${p})`;
    $('progDot').style.left = `${p * 100}%`;
    $('sub').textContent = `${Math.floor(p * 100)}%`;
  }
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

/* ---------- 开始界面 ---------- */
const maxLevel = () => Math.max(1, hb.stats().level || 1);
let menuLevel = maxLevel();

function toMenu() {
  R.phase = 'menu';
  R.paused = false;
  hideCard();
  trail.clear();
  R.mode = 'endless'; R.level = 1; R.seed = 20261026; R.base = 10; R.accel = false;
  newTrack();
  resetBall();
  R.s = S0; R.time = 0; R.coins = 0;
  document.body.classList.add('menu-on');
  $('menu').hidden = false;
  menuLevel = Math.min(menuLevel, maxLevel());
  const st = hb.stats();
  const bits = [];
  if (st.cleared) bits.push(`已过 ${st.cleared} 关`);
  if (st.best) bits.push(`无尽最高 ${st.best}`);
  $('menuSub').textContent = bits.join(' · ');
  const sv = hb.load('run', null);
  $('resume').hidden = !sv;
  if (sv) $('resumeSub').textContent = sv.mode === 'level' ? `第 ${sv.level} 关` : `无尽 · ${Math.max(0, Math.floor(sv.s - S0))} 米`;
  menuLevelUi();
}
function menuLevelUi() {
  $('lvNum').textContent = menuLevel;
  $('lvPrev').disabled = menuLevel <= 1;
  $('lvNext').disabled = menuLevel >= maxLevel();
}
$('lvPrev').addEventListener('click', () => { menuLevel = Math.max(1, menuLevel - 1); menuLevelUi(); sfx.beep(); });
$('lvNext').addEventListener('click', () => { menuLevel = Math.min(maxLevel(), menuLevel + 1); menuLevelUi(); sfx.beep(); });
$('goLevel').addEventListener('click', () => start('level', { level: menuLevel }));
$('goEndless').addEventListener('click', () => start('endless'));
$('resume').addEventListener('click', () => {
  const sv = hb.load('run', null);
  if (!sv) return toMenu();
  start(sv.mode, { level: sv.level, seed: sv.seed, base: sv.base, accel: sv.accel, resume: sv });
});

/* ---------- 暂停 ---------- */
function pause() {
  if (R.paused || !(R.phase === 'run' || R.phase === 'count')) return;
  R.paused = true;
  save();
  trail.clear();
  drag = null;
  const lv = R.mode === 'level';
  showCard({
    title: '已暂停',
    big: lv ? `第 ${R.level} 关` : `${Math.max(0, Math.floor(R.s - S0)) + R.coins * 10}`,
    meta: lv ? `进度 <b>${Math.floor(((R.s - S0) / (track.finish - S0)) * 100)}%</b> · 金币 <b>${R.coins}</b>` : `滚了 <b>${Math.max(0, Math.floor(R.s - S0))}</b> 米 · 金币 <b>${R.coins}</b>`,
    main: ['继续', () => { R.paused = false; R.phase = 'count'; R.countT = 0; lastShown = -1; last = performance.now(); }],
    alt: ['结束这局', () => { clearSave(); if (R.phase === 'run' || R.phase === 'count') { if (R.mode === 'endless' && R.s - S0 > 5) record(false); } toMenu(); }],
  });
}
$('pause').addEventListener('click', pause);
hb.onPause(pause);
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
window.addEventListener('pagehide', save);

hb.onSettings((next) => {
  cfg = next;
  sound.enabled = cfg.sound;
  trail.enabled = cfg.trail;
  if (!cfg.trail) trail.clear();
  world.setLowPower(cfg.lowPower);
});

/* ======================================================================
   主循环
   ====================================================================== */
let last = performance.now();
let lastShown = -1;
let snap = true;
function frame(t) {
  requestAnimationFrame(frame);
  const raw = Math.min(0.05, (t - last) / 1000);
  last = t;
  if (R.paused) { trail.draw(); return; }
  const dt = raw;
  let ds = 0, dx = 0;
  const s0 = R.s, x0 = R.x;

  if (R.phase === 'menu') {
    R.time += raw;
    R.menuT = Math.min(1, R.menuT + raw * 2);
    ds = raw * 0.35;                       // 开始界面：小球在原地慢慢转
  } else if (R.phase === 'count') {
    R.countT += raw;
    R.menuT = Math.max(0, R.menuT - raw * 1.8);
    R.x += (R.tx - R.x) * (1 - Math.exp(-raw * 22));
    dx = R.x - x0;
    const n = 3 - Math.floor(R.countT / 0.5);
    if (n !== lastShown) {
      lastShown = n;
      const el = $('count');
      el.textContent = n > 0 ? n : '';
      el.classList.remove('pop'); void el.offsetWidth; if (n > 0) el.classList.add('pop');
      if (n > 0) sfx.beep(false);
    }
    if (R.countT >= 1.5) {
      R.phase = 'run'; lastShown = -1;
      $('count').textContent = ''; sfx.beep(true);
    }
  } else if (R.phase === 'run') {
    R.menuT = Math.max(0, R.menuT - raw * 1.8);
    step(dt);
    ds = R.s - s0; dx = R.x - x0;
  } else {
    R.endT += raw;
    R.time += dt;
    if (R.phase === 'fall') {
      R.vy -= FALL_G * raw; R.y += R.vy * raw;
      R.s += R.speed * raw * Math.max(0, 0.4 - R.endT);
      ds = R.s - s0;
    } else if (R.phase === 'win') {
      const v = R.speed * Math.max(0, 1 - R.endT * 0.8);
      R.s += v * raw; ds = v * raw;
      R.x += (0 - R.x) * (1 - Math.exp(-raw * 3)); dx = R.x - x0;
    }
  }

  world.update({
    s: R.s, x: R.x, y: R.y, time: R.time, dt: raw, phase: R.phase, speed: R.phase === 'menu' ? 9 : R.speed,
    ds, dx, menuT: R.menuT, ballVisible: R.phase !== 'crash', onTile: R.grounded,
    fallY: R.phase === 'fall' ? Math.max(-2.2, R.y * 0.35) : 0, snap,
  });
  snap = false;
  world.render();
  if (cfg.trail) trail.draw();
}

toMenu();
requestAnimationFrame(frame);

// 自动测试用
window.__roll = {
  R, get track() { return track; }, world, trail, start, toMenu, pause, step: (dt) => step(dt),
  setX: (x) => { R.tx = x; },
};
