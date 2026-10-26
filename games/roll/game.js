// 滚滚球：小球在悬浮方块拼成的轨道上一直往前滚。
//   4 条轨道。按住屏幕左右拖：手指每挪一段，小球就换到旁边一条轨道（只停在轨道正中，不会卡在两格之间）
//   躲开块块、别掉进缺口，顺路吃金币。没有跳跃（gray 真机试过，跳太难，删掉了）。
// 闯关：每关路线固定，滚过终点线就过关。无尽：一直滚，分数 = 米数 + 金币 × 10。
import { hub } from '../_shared/hub.js';
import { sound } from '../_shared/sound.js';
import { Track, COLS, BALL_R, colX, colOf, obX } from './track.js';
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
  localStorage.removeItem('pp.game.roll.run');   // 「继续上一局」也删了
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
const START_LANE = 1;
const R = {
  phase: 'menu',         // menu | count | run | crash | fall | win
  paused: false,
  mode: 'level', level: 1, seed: 1, base: 11, accel: true,
  s: S0, lane: START_LANE, x: colX(START_LANE), tx: colX(START_LANE), y: 0, vy: 0,
  grounded: true, edgeT: 0, falling: false,
  coins: 0, streak: 0, lastCoin: -9,
  time: 0, endT: 0, countT: 0, menuT: 1,
  speed: 11, lastRow: 0, bumpT: 0,
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
  lane() { sound.tone({ f: 600, to: 820, dur: 0.05, type: 'triangle', vol: 0.05 }); },
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
  Object.assign(R, { lane: START_LANE, x: colX(START_LANE), tx: colX(START_LANE), y: 0, vy: 0, grounded: true, edgeT: 0, falling: false, streak: 0 });
}

function start(mode, opts = {}) {
  hideCard();
  R.mode = mode;
  R.level = mode === 'level' ? opts.level || maxLevel() : 1;
  R.seed = opts.seed ?? (mode === 'level' ? 1000 + R.level * 7919 : (Math.random() * 1e9) | 0);
  R.base = opts.base ?? SPEED(cfg.speed);
  R.accel = opts.accel ?? cfg.accel;
  newTrack();
  resetBall();
  R.s = S0; R.coins = 0; R.time = 0;
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
}


/* ======================================================================
   操作：按住左右拖，一格一格吸附到轨道上
   ====================================================================== */
const cv = $('cv');
let drag = null;
const SENS = [0.24, 0.2, 0.16, 0.13, 0.1];       // 手指挪屏幕宽度的几成 = 换一条轨道
const lanePx = () => window.innerWidth * SENS[cfg.sens - 1];
const canSteer = () => (R.phase === 'run' || R.phase === 'count') && !R.paused && !R.falling;

function setLane(l, quiet = false) {
  l = Math.max(0, Math.min(COLS - 1, l));
  if (l === R.lane) return;
  R.lane = l;
  R.tx = colX(l);
  if (!quiet) { sfx.lane(); hb.haptic(4); }
}

cv.addEventListener('pointerdown', (e) => {
  try { cv.setPointerCapture(e.pointerId); } catch {}
  if (R.phase === 'run' || R.phase === 'count') trail.down(e.pointerId, e.clientX, e.clientY);
  drag = { id: e.pointerId, x0: e.clientX, lane0: R.lane, off: 0, lx: e.clientX, ly: e.clientY };
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
  if (!canSteer()) return;
  // 手指挪过 0.6 格才换道；往回要再挪回来一点才换回去，手指抖一下不会来回跳
  const raw = (x - drag.x0) / lanePx();
  while (raw > drag.off + 0.6) drag.off++;
  while (raw < drag.off - 0.6) drag.off--;
  const want = drag.lane0 + drag.off;
  const lane = Math.max(0, Math.min(COLS - 1, want));
  if (lane !== want) {
    // 拖到头了：起点跟着挪，往回拖立刻就有反应
    if (R.time - R.bumpT > 0.35) { R.bumpT = R.time; sfx.bump(); }
    drag.off = lane - drag.lane0;
    drag.x0 = x - drag.off * lanePx();
  }
  setLane(lane);
}
const endPtr = (e) => {
  trail.up(e.pointerId);
  if (drag && drag.id === e.pointerId) drag = null;
};
cv.addEventListener('pointerup', endPtr);
cv.addEventListener('pointercancel', endPtr);

window.addEventListener('keydown', (e) => {
  if (canSteer() && (e.key === 'ArrowLeft' || e.key === 'a')) setLane(R.lane - 1);
  if (canSteer() && (e.key === 'ArrowRight' || e.key === 'd')) setLane(R.lane + 1);
  if (e.key === 'Escape') pause();
});

/* ======================================================================
   每一帧
   ====================================================================== */
function step(dt) {
  R.time += dt;
  R.speed = speedAt(R.s);
  const prevX = R.x, prevS = R.s;

  // 往目标轨道滚过去（一条道大概 0.12 秒）
  if (!R.falling) R.x += (R.tx - R.x) * (1 - Math.exp(-dt * 24));
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

  ui();
}

function die(kind, vx = 0, vs = 0) {
  if (R.phase !== 'run') return;
  R.phase = kind;
  R.endT = 0;
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
  sfx.win();
  world.confetti(R.s + 1.5);
  hb.haptic([15, 40, 15]);
  record(true);
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
// 只有两个按钮：「闯关 · 第 N 关」（打到哪关就是哪关，从头开始）和「无尽模式」
const maxLevel = () => Math.max(1, hb.stats().level || 1);

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
  const st = hb.stats();
  const bits = [];
  if (st.cleared) bits.push(`已过 ${st.cleared} 关`);
  if (st.best) bits.push(`无尽最高 ${st.best}`);
  $('menuSub').textContent = bits.join(' · ');
  $('lvNum').textContent = maxLevel();
}
$('goLevel').addEventListener('click', () => start('level', { level: maxLevel() }));
$('goEndless').addEventListener('click', () => start('endless'));

/* ---------- 暂停 ---------- */
function pause() {
  if (R.paused || !(R.phase === 'run' || R.phase === 'count')) return;
  R.paused = true;
  trail.clear();
  drag = null;
  const lv = R.mode === 'level';
  showCard({
    title: '已暂停',
    big: lv ? `第 ${R.level} 关` : `${Math.max(0, Math.floor(R.s - S0)) + R.coins * 10}`,
    meta: lv ? `进度 <b>${Math.floor(((R.s - S0) / (track.finish - S0)) * 100)}%</b> · 金币 <b>${R.coins}</b>` : `滚了 <b>${Math.max(0, Math.floor(R.s - S0))}</b> 米 · 金币 <b>${R.coins}</b>`,
    main: ['继续', () => { R.paused = false; R.phase = 'count'; R.countT = 0; lastShown = -1; last = performance.now(); }],
    alt: ['结束这局', () => { if (R.mode === 'endless' && R.s - S0 > 5) record(false); toMenu(); }],
  });
}
$('pause').addEventListener('click', pause);
hb.onPause(pause);
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });

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
  setLane: (l) => setLane(l, true),
};
