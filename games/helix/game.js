// 螺旋跳跃：小球在柱子上的一层层平台上一直弹。
//   按住屏幕左右拖，转动柱子，让小球从缺口掉到下一层；碰到红色就输。
//   连着穿过 3 层不落地，小球变成火球，下一次落地连红色一起砸碎。
// 闯关：每关层数固定，落到最底下的金色终点就过关。无尽：一直往下，越往下越难，每 30 层每穿一层多加 1 分。
import { hub } from '../_shared/hub.js';
import { sound } from '../_shared/sound.js';
import { Tower, BALL_R, BALL_DIST, PLAT_H, GAP, RED, topY, wrap } from './tower.js';
import { World, THEMES } from './scene.js';

const hb = hub('helix');
const $ = (id) => document.getElementById(id);
let cfg = hb.settings();
sound.enabled = cfg.sound;
const colorOf = (v) => {
  const f = hb.meta.settings.find((x) => x.key === 'ball');
  return (f.options.find((o) => o.value === v) || f.options[0]).color;
};

/* ======================================================================
   画面
   ====================================================================== */
const world = new World($('cv'));
world.setLowPower(cfg.lowPower);
world.setBallColor(colorOf(cfg.ball));
let needRender = true;
function resize() { world.resize(); needRender = true; }
window.addEventListener('resize', resize);
resize();

/* ======================================================================
   状态
   ====================================================================== */
const G = 36;                       // 重力
const HOP = 2.3;                    // 每次弹多高
const V0 = Math.sqrt(2 * G * HOP);
const VMAX = 24;                    // 最快下落速度
const TIME = [0.8, 0.9, 1, 1.1, 1.22];
const SENS = [0.0065, 0.0085, 0.0105, 0.013, 0.016];   // 手指挪 1 像素转多少（按 390 宽的屏幕算）
const THEME_EVERY = 30;             // 无尽模式每几层换配色、加分

const R = {
  phase: 'menu',     // menu | play | dead | win
  paused: false,
  mode: 'level', level: 1, seed: 1,
  rot: 0, y: 0, vy: 0, squash: 0,
  cur: 0, passing: false, chain: 0, fire: false,
  score: 0, passedRun: 0, smashedRun: 0,
  time: 0, endT: 0, dragged: 0,
  gone: new Set(),
};
let tower = null;

const levelSeed = (n) => 1000 + n * 7919;
const maxLevel = () => Math.max(1, hb.stats().level || 1);
const themeFor = (i) => (R.mode === 'level' ? THEMES[(R.level - 1) % THEMES.length] : THEMES[Math.floor(i / THEME_EVERY) % THEMES.length]);
const base = () => (R.mode === 'level' ? R.level : 1 + Math.floor(R.cur / THEME_EVERY));

/* ======================================================================
   声音
   ====================================================================== */
const sfx = {
  bounce() {
    if (R.phase === 'menu') return;
    const f = 150 + Math.random() * 20;
    sound.tone({ f, to: f * 0.7, dur: 0.13, vol: 0.2 });
    sound.tone({ f: 560, to: 760, dur: 0.05, type: 'triangle', vol: 0.035 });
    sound.hiss({ f: 900, to: 300, dur: 0.06, filter: 'lowpass', vol: 0.05 });
  },
  pass(n) {
    const f = 560 * Math.pow(2, (Math.min(n, 10) - 1) * 2 / 12);
    sound.tone({ f, dur: 0.11, type: 'triangle', vol: 0.085 });
    sound.tone({ f: f * 1.5, dur: 0.16, type: 'sine', vol: 0.06, delay: 0.045 });
    sound.hiss({ f: 2600, to: 700, dur: 0.16, q: 0.9, vol: 0.05 });
  },
  fire() {
    sound.hiss({ f: 700, to: 3200, dur: 0.4, q: 0.8, vol: 0.12 });
    sound.tone({ f: 260, to: 820, dur: 0.35, type: 'sawtooth', vol: 0.035 });
  },
  smash() {
    sound.tone({ f: 130, to: 40, dur: 0.42, vol: 0.32 });
    sound.hiss({ f: 5200, to: 700, dur: 0.38, filter: 'lowpass', vol: 0.24 });
    for (let i = 0; i < 6; i++) sound.tone({ f: 1500 + Math.random() * 2500, dur: 0.05, type: 'triangle', vol: 0.045, delay: 0.02 + i * 0.03 });
  },
  die() {
    sound.tone({ f: 210, to: 55, dur: 0.4, vol: 0.28 });
    sound.hiss({ f: 1400, to: 200, dur: 0.32, filter: 'lowpass', vol: 0.2 });
    sound.hiss({ f: 500, dur: 0.12, q: 2, vol: 0.12, delay: 0.02 });
  },
  win() { sound.arp([523, 659, 784, 1047, 1319], { gap: 0.08, dur: 0.24, type: 'triangle', vol: 0.11 }); },
  click() { sound.tone({ f: 900, dur: 0.04, type: 'triangle', vol: 0.05 }); },
};

function applyTheme(th, instant = false) {
  world.setTheme(th, instant);
  document.body.style.setProperty('--plat', th.plat);
  document.body.classList.toggle('night', th.name === '夜色');
}

/* ======================================================================
   开一局
   ====================================================================== */
function setup(mode, level, seed, instantTheme) {
  R.mode = mode; R.level = level; R.seed = seed;
  tower = new Tower({ seed, mode, level });
  world.setTower(tower);
  R.gone = new Set();
  Object.assign(R, { cur: 0, passing: false, chain: 0, fire: false, rot: 0, time: 0, y: topY(0) + BALL_R + 1.6, vy: 0, squash: 0 });
  applyTheme(themeFor(0), instantTheme);
  snap = true;
}

function start(mode, opts = {}) {
  hideCard();
  const level = mode === 'level' ? opts.level || maxLevel() : 1;
  const seed = mode === 'level' ? levelSeed(level) : (Math.random() * 1e9) | 0;
  const same = R.phase === 'menu' && mode === 'level' && R.mode === 'level' && R.level === level;
  if (!same) setup(mode, level, seed, false);
  Object.assign(R, { phase: 'play', paused: false, score: 0, passedRun: 0, smashedRun: 0, chain: 0, fire: false, endT: 0, dragged: 0 });
  enterPlay();
}

/** 读档：从上次落地的那一层接着弹 */
function resume(run) {
  hideCard();
  setup(run.mode, run.level, run.seed, true);
  for (let i = 0; i < run.cur; i++) R.gone.add(i);
  Object.assign(R, {
    cur: run.cur, rot: run.rot, time: run.time, score: run.score,
    y: topY(run.cur) + BALL_R + 0.01, vy: V0 * 0.9, squash: 0,
    phase: 'play', paused: false, passedRun: 0, smashedRun: 0, chain: 0, fire: false, endT: 0, dragged: 0,
  });
  applyTheme(themeFor(R.cur), true);
  snap = true;
  enterPlay();
}

function enterPlay() {
  document.body.classList.remove('menu-on');
  document.body.classList.toggle('lv', R.mode === 'level');
  $('menu').hidden = true;
  $('lvA').textContent = R.level;
  $('lvB').textContent = R.level + 1;
  shown = {};
  $('tip').hidden = !!hb.load('tip', 0);
  ui();
}

/* ======================================================================
   操作：按住左右拖，转柱子
   ====================================================================== */
const cv = $('cv');
let drag = null;
const canTurn = () => R.phase === 'play' && !R.paused;
const radPerPx = () => SENS[cfg.sens - 1] * (390 / Math.max(280, Math.min(window.innerWidth, 700)));

cv.addEventListener('pointerdown', (e) => {
  try { cv.setPointerCapture(e.pointerId); } catch {}
  drag = { id: e.pointerId, x: e.clientX };
});
cv.addEventListener('pointermove', (e) => {
  if (!drag || drag.id !== e.pointerId) return;
  const dx = e.clientX - drag.x;
  drag.x = e.clientX;
  if (!canTurn()) return;
  R.rot += dx * radPerPx();
  R.dragged += Math.abs(dx);
  if (R.dragged > 140 && !$('tip').hidden) { $('tip').hidden = true; hb.save('tip', 1); }
});
const endPtr = (e) => { if (drag && drag.id === e.pointerId) drag = null; };
cv.addEventListener('pointerup', endPtr);
cv.addEventListener('pointercancel', endPtr);

const keys = new Set();
window.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') keys.add(e.key);
  if (e.key === 'Escape') pause();
});
window.addEventListener('keyup', (e) => keys.delete(e.key));

/* ======================================================================
   物理
   ====================================================================== */
function step(dt) {
  R.time += dt;
  const prevY = R.y;
  R.vy = Math.max(-VMAX, R.vy - G * dt);
  R.y += R.vy * dt;
  const p = tower.get(R.cur);
  const top = topY(R.cur);

  if (!R.passing && R.vy < 0 && R.y - BALL_R <= top && prevY - BALL_R >= top - 0.3) {
    if (p.finish) return land(p, top);
    const kind = tower.kindUnder(p, R.rot, R.time);
    if (kind === GAP) R.passing = true;
    else if (R.fire && R.phase === 'play') return smash(top);
    else if (kind === RED && R.phase === 'play') return die(p, top);
    else return land(p, top);
  }
  if (R.passing && R.y + BALL_R < top - PLAT_H) pass();
}

const localAngle = (p) => wrap(-R.rot - p.rot - tower.spinAt(p, R.time));

function land(p, top) {
  R.y = top + BALL_R;
  R.vy = V0;
  R.squash = 1;
  R.chain = 0;
  R.fire = false;
  world.splat(R.cur, localAngle(p));
  sfx.bounce();
  if (p.finish && R.phase === 'play') return win();
  if (R.phase === 'play') {
    hb.haptic(5);
    hb.save('run', { mode: R.mode, level: R.level, seed: R.seed, cur: R.cur, rot: R.rot, time: R.time, score: R.score });
  }
}

function pass() {
  R.passing = false;
  R.gone.add(R.cur);
  world.explode(R.cur, false);
  if (R.phase !== 'play') { R.cur++; return; }
  R.chain++;
  R.passedRun++;
  const pts = base() * R.chain;
  R.score += pts;
  popup(`+${pts}`, R.chain);
  sfx.pass(R.chain);
  R.cur++;
  if (cfg.fire && R.chain >= 3 && !R.fire) { R.fire = true; sfx.fire(); }
  if (R.mode === 'endless' && R.cur % THEME_EVERY === 0) applyTheme(themeFor(R.cur));
}

function smash(top) {
  R.gone.add(R.cur);
  world.explode(R.cur, true);
  world.shake = 0.6;
  const pts = base() * (R.chain + 1) * 2;
  R.score += pts;
  R.passedRun++; R.smashedRun++;
  popup(`+${pts}`, 9, true);
  sfx.smash();
  hb.haptic([10, 20, 30]);
  const f = $('flash'); f.classList.remove('on'); void f.offsetWidth; f.classList.add('on');
  R.cur++;
  R.y = top + BALL_R; R.vy = V0 * 0.85; R.squash = 0.7;
  R.chain = 0; R.fire = false;
  if (R.mode === 'endless' && R.cur % THEME_EVERY === 0) applyTheme(themeFor(R.cur));
}

function die(p, top) {
  R.phase = 'dead';
  $('tip').hidden = true;
  R.endT = 0;
  R.y = top + BALL_R; R.vy = 0;
  world.splat(R.cur, localAngle(p), true);
  world.burstBall(top + BALL_R * 0.6, world.ballColor);
  sfx.die();
  hb.haptic([30, 30, 60]);
  const f = $('flash'); f.classList.remove('on', 'red'); void f.offsetWidth; f.classList.add('on', 'red');
  hb.save('run', null);
  const res = record(false);
  setTimeout(() => {
    if (R.mode === 'level') {
      showCard({
        title: '碰到红色了', big: `${res.pct}%`,
        meta: `第 <b>${R.level}</b> 关 · 得分 <b>${R.score}</b>`,
        main: ['再试一次', () => start('level', { level: R.level })], alt: ['返回', toMenu],
      });
    } else {
      showCard({
        title: res.record ? '新纪录！' : '碰到红色了', big: `${R.score}`,
        meta: `到了第 <b>${R.cur + 1}</b> 层 · 最高 <b>${res.best}</b>`,
        main: ['再来一局', () => start('endless')], alt: ['返回', toMenu],
      });
    }
  }, 950);
}

function win() {
  R.phase = 'win';
  $('tip').hidden = true;
  R.endT = 0;
  sfx.win();
  world.confetti(topY(R.cur));
  hb.haptic([15, 40, 15]);
  hb.save('run', null);
  record(true);
  setTimeout(() => {
    showCard({
      title: '过关啦！', big: `第 ${R.level} 关`,
      meta: `得分 <b>${R.score}</b>${R.smashedRun ? ` · 火球砸碎 <b>${R.smashedRun}</b> 层` : ''}`,
      main: ['下一关', () => start('level', { level: R.level + 1 })], alt: ['返回', toMenu],
    });
  }, 1400);
}

/** 记一局 */
function record(won) {
  const st = hb.stats();
  st.played = (st.played || 0) + 1;
  st.passed = (st.passed || 0) + R.passedRun;
  st.smashed = (st.smashed || 0) + R.smashedRun;
  const prev = st.best || 0;
  let pct = 0;
  if (R.mode === 'endless') {
    st.best = Math.max(prev, R.score);
    st.bestDepth = Math.max(st.bestDepth || 0, R.cur + 1);
  } else {
    pct = Math.min(99, Math.floor((R.cur / tower.total) * 100));
    if (won) {
      st.cleared = Math.max(st.cleared || 0, R.level);
      st.level = Math.max(st.level || 1, R.level + 1);
    }
  }
  hb.saveStats(st);
  return { best: Math.max(prev, R.score), record: R.mode === 'endless' && R.score > prev && prev > 0, pct };
}

/* ======================================================================
   界面
   ====================================================================== */
let shown = {};
function ui() {
  if (shown.score !== R.score) {
    $('score').textContent = R.score;
    if (shown.score != null && R.score > shown.score) { const el = $('score'); el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
    shown.score = R.score;
  }
  if (R.mode === 'level') {
    const p = Math.max(0, Math.min(1, R.cur / tower.total));
    if (shown.p !== p) { $('progFill').style.transform = `scaleX(${p})`; shown.p = p; }
  } else if (shown.depth !== R.cur) {
    $('sub').textContent = `第 ${R.cur + 1} 层`;
    shown.depth = R.cur;
  }
}

function popup(text, n, big = false) {
  const el = document.createElement('div');
  el.className = `pop${big ? ' big' : ''}${n >= 3 ? ' hot' : ''}`;
  el.textContent = text;
  const pt = world.project(0.55, R.y + 0.3, BALL_DIST);
  el.style.left = `${pt.x + 26}px`;
  el.style.top = `${pt.y - 16}px`;
  document.body.append(el);
  setTimeout(() => el.remove(), 900);
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
$('cardMain').addEventListener('click', () => { const f = cardActions.main; hideCard(); sfx.click(); if (f) f(); });
$('cardAlt').addEventListener('click', () => { const f = cardActions.alt; hideCard(); sfx.click(); if (f) f(); });

/* ---------- 开始界面 ---------- */
function toMenu() {
  hideCard();
  const n = maxLevel();
  setup('level', n, levelSeed(n), R.phase === 'menu');
  R.phase = 'menu';
  R.paused = false;
  document.body.classList.add('menu-on');
  $('menu').hidden = false;
  $('tip').hidden = true;
  const st = hb.stats();
  const bits = [];
  if (st.cleared) bits.push(`已过 ${st.cleared} 关`);
  if (st.best) bits.push(`无尽最高 ${st.best}`);
  $('menuSub').textContent = bits.join(' · ');
  $('lvNum').textContent = n;
  const run = hb.load('run', null);
  $('goResume').hidden = !run;
  if (run) {
    $('resumeSub').textContent = run.mode === 'level'
      ? `第 ${run.level} 关 · ${Math.min(99, Math.floor((run.cur / new Tower(run).total) * 100))}%`
      : `无尽 · 第 ${run.cur + 1} 层 · ${run.score} 分`;
  }
  document.body.classList.toggle('has-run', !!run);
}
$('goLevel').addEventListener('click', () => { sfx.click(); hb.save('run', null); start('level', { level: maxLevel() }); });
$('goEndless').addEventListener('click', () => { sfx.click(); hb.save('run', null); start('endless'); });
$('goResume').addEventListener('click', () => { sfx.click(); const run = hb.load('run', null); if (run) resume(run); });

/* ---------- 暂停 ---------- */
function pause() {
  if (R.paused || R.phase !== 'play') return;
  R.paused = true;
  drag = null;
  const lv = R.mode === 'level';
  showCard({
    title: '已暂停',
    big: lv ? `第 ${R.level} 关` : `${R.score}`,
    meta: lv ? `进度 <b>${Math.floor((R.cur / tower.total) * 100)}%</b> · 得分 <b>${R.score}</b>` : `第 <b>${R.cur + 1}</b> 层`,
    main: ['继续', () => { R.paused = false; last = performance.now(); }],
    alt: ['结束这局', () => {
      hb.save('run', null);
      if (R.mode === 'endless' && R.score > 0) record(false);
      toMenu();
    }],
  });
  needRender = true;
}
$('pause').addEventListener('click', pause);
// 回到主屏幕：这一局暂停，而且整个画面停下来不画（开始界面也一样，省电）
let away = false;
hb.onPause(() => { pause(); away = true; });
hb.onResume(() => { away = false; last = performance.now(); needRender = true; });
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); else { last = performance.now(); needRender = true; } });

hb.onSettings((next) => {
  cfg = next;
  sound.enabled = cfg.sound;
  world.setBallColor(colorOf(cfg.ball));
  world.setLowPower(cfg.lowPower);
  needRender = true;
});

/* ======================================================================
   主循环
   ====================================================================== */
const SUB = 1 / 120;
function simulate(dt) {
  const n = Math.max(1, Math.ceil(dt / SUB));
  const h = dt / n;
  for (let i = 0; i < n && R.phase !== 'dead'; i++) step(h);
}

/** 影子落在哪一层：小球正下方第一块不是缺口的平台 */
function shadowY() {
  for (let j = R.cur; j <= Math.min(R.cur + 4, tower.total); j++) {
    if (R.gone.has(j) || (j === R.cur && R.passing)) continue;
    const p = tower.get(j);
    if (p.finish || tower.kindUnder(p, R.rot, R.time) !== GAP) return topY(j) + (!p.finish && tower.kindUnder(p, R.rot, R.time) === RED ? 0.05 : 0);
  }
  return null;
}

let last = performance.now();
let snap = true;
let warp = 1;          // 自动测试时快进用
const gone = (i) => R.gone.has(i);
function frame(t) {
  requestAnimationFrame(frame);
  const raw = Math.min(0.05, (t - last) / 1000);
  last = t;
  if (away || document.hidden) return;
  if (R.paused) {
    if (needRender) { world.render(); needRender = false; }
    return;
  }
  if (keys.size && canTurn()) R.rot += (keys.has('ArrowRight') ? 1 : -1) * raw * 3.2;
  if (R.phase === 'dead') { R.endT += raw; R.time += raw; }
  else simulate(raw * TIME[cfg.speed - 1] * warp);
  R.squash = Math.max(0, R.squash - raw * 7);
  if (R.phase === 'play') ui();

  world.update({
    rot: R.rot, time: R.time, dt: raw, y: R.y, vy: R.vy, squash: R.squash,
    ballVisible: R.phase !== 'dead', fire: R.fire, trail: cfg.trail && R.phase !== 'menu',
    camTarget: topY(R.cur), shadowY: R.phase === 'dead' ? null : shadowY(), cur: R.cur, gone, snap,
  });
  snap = false;
  world.render();
  needRender = false;
}

toMenu();
requestAnimationFrame(frame);

// 自动测试用
window.__helix = {
  R, get tower() { return tower; }, world, start, toMenu, pause, resume, step: (dt) => step(dt), simulate,
  setRot: (r) => { R.rot = r; },
  set warp(v) { warp = v; },
};
