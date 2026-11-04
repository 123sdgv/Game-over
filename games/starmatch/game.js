// 星星消消乐：点一颗星星，再点旁边那颗互换（也能直接滑），连成 3 颗以上就消掉。
// 规则全在 logic.js：走一步马上算出最终结果并存档，这里只照着事件一段段播放动画。
import { hub } from '../_shared/hub.js';
import { sound } from '../_shared/sound.js';
import { sfx } from './sfx.js';
import { Art, COLORS, goalIcon, drawStar } from './art.js';
import { FX } from './fx.js';
import { K, newGame, play, status, finale, bestMove, adjacent, colOf, rowOf, ensurePlayable, ENERGY_START } from './logic.js';
import { levelSpec, C as LV_C, R as LV_R } from './levels.js';

if (!CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    this.moveTo(x + r, y); this.arcTo(x + w, y, x + w, y + h, r); this.arcTo(x + w, y + h, x, y + h, r);
    this.arcTo(x, y + h, x, y, r); this.arcTo(x, y, x + w, y, r); this.closePath();
  };
}

const hb = hub('starmatch');
const $ = (id) => document.getElementById(id);
const canvas = $('board'), ctx = canvas.getContext('2d');
const stage = $('stage');

let S = hb.settings();
sound.enabled = S.sound;
let mode = hb.load('mode', 'levels') === 'inf' ? 'inf' : 'levels';

let s = null;               // 规则状态（永远是最终结果）
let spec = null;            // 这一关的定义
const vis = new Map();      // 画面上的星星：id → V
let visIce = [];            // 画面上的冰（比规则状态慢一拍）
let busy = false;           // 正在播放动画
let sel = -1;               // 选中的格子
let hint = null;            // 提示的那一步
let idleT = 0;
let tutoring = false;       // 第一次玩：一上来就示范
let clipAll = false;        // 开局 / 退场时，星星只在棋盘里显示
let cardOpen = false;
let shownMoves = 0, shownScore = 0, targetScore = 0;
let shownGoals = [];
let goalEls = [];
let prevBest = 0;
let statMark = { k: 0, sp: 0 };
let fallPending = 0;
let fallWaiters = [];

const fx = new FX();
let art = null;
let view = { cs: 40, bx: 0, by: 0, bw: 0, bh: 0, W: 390, H: 844, dpr: 2 };

/* ======================================================================
   时间：所有动画都按游戏时间走，回主屏幕就整个停住
   ====================================================================== */
let T = 0;
let timers = [];
let tweens = [];
const after = (sec, fn) => { timers.push({ at: T + sec, fn }); };
const wait = (sec) => new Promise((res) => after(sec, res));
const easeOut = (k) => 1 - (1 - k) * (1 - k) * (1 - k);
const easeInOut = (k) => k * k * (3 - 2 * k);
const tween = (dur, fn, ease = easeOut) => new Promise((res) => tweens.push({ t: 0, dur, fn, ease, res }));

/* ======================================================================
   棋盘坐标
   ====================================================================== */
const cx = (x) => view.bx + (x + 0.5) * view.cs;
const cy = (y) => view.by + (y + 0.5) * view.cs;
const bounds = () => ({ x: view.bx, y: view.by, w: view.bw, h: view.bh });

function makeV(p, x, y) {
  const V = {
    id: p.id, c: p.c, k: p.k, lock: p.lock, x, y,
    scale: 1, rot: 0, flash: 0, land: 9, sel: false, shakeT: 0,
    path: null, popT: -1, z: 0, born: 9, phase: Math.random() * 6.28,
  };
  vis.set(p.id, V);
  return V;
}

function syncVis() {
  vis.clear();
  s.grid.forEach((p, i) => { if (p) makeV(p, colOf(s, i), rowOf(s, i)); });
  visIce = s.ice.slice();
}

/** 让星星沿路径落下。pts: [[x, y], ...] */
function startPath(V, pts, delay = 0, v0 = 3) {
  V.path = { pts, seg: 0, d: 0, v: v0, delay };
  fallPending++;
}
const fallsDone = () => (fallPending <= 0 ? Promise.resolve() : new Promise((res) => fallWaiters.push(res)));

/* ======================================================================
   开局 / 存档
   ====================================================================== */
const newSeed = () => (Math.random() * 2 ** 31) | 0;

function reset() {
  timers = []; tweens = []; fallPending = 0; fallWaiters = [];
  fx.clear();
  busy = false; sel = -1; hint = null; idleT = 0; clipAll = false;
  hideCard();
}

function saveState() {
  if (!s) return;
  hb.save(mode === 'inf' ? 'inf' : 'lv', s);
}
const clearSave = () => hb.save(mode === 'inf' ? 'inf' : 'lv', null);

function bumpPlayed() {
  const st = hb.stats();
  st.played = (st.played || 0) + 1;
  hb.saveStats(st);
}

function dropInBoard() {
  clipAll = true;
  let maxDelay = 0;
  vis.forEach((V) => {
    const r = V.y, c = V.x;
    const delay = (s.R - 1 - r) * 0.035 + c * 0.012;
    maxDelay = Math.max(maxDelay, delay);
    const start = r - s.R - 0.5;
    V.y = start;
    startPath(V, [[c, start], [c, r]], delay, 6);
  });
  sfx.dropIn();
  return fallsDone().then(() => { clipAll = false; });
}

async function fallOutOld() {
  if (!vis.size) return;
  clipAll = true;
  const myBoardR = s ? s.R : LV_R;
  vis.forEach((V) => {
    const delay = (myBoardR - 1 - V.y) * 0.02 + Math.random() * 0.03;
    V.sel = false; V.popT = -1; V.flash = 0; V.scale = 1; V.rot = 0;
    startPath(V, [[V.x, V.y], [V.x, myBoardR + 1.5]], delay, 4);
  });
  await fallsDone();
  vis.clear();
  clipAll = false;
}

async function beginBoard(makeSpec, bannerArgs) {
  const old = s;
  reset();
  busy = true;
  if (old && vis.size) { s = old; await fallOutOld(); }
  const made = makeSpec();
  s = made;
  statMark = { k: 0, sp: 0 };
  syncVis();
  layout();
  shownMoves = s.moves; shownScore = 0; targetScore = 0;
  buildHud();
  banner(...bannerArgs);
  saveState();
  await dropInBoard();
  busy = false;
  idleT = 0;
}

function startLevel(n) {
  spec = levelSpec(n);
  bumpPlayed();
  const st = hb.stats();
  st.level = n;
  st.bestLevel = Math.max(st.bestLevel || 1, n);
  hb.saveStats(st);
  tutoring = n === 1 && !hb.load('tutored', false);
  return beginBoard(() => {
    const g = newGame({ ...spec, seed: newSeed() });
    g.n = n;
    return g;
  }, [`第 ${n} 关`, `${spec.moves} 步内完成目标`]);
}

function startInf() {
  spec = null;
  bumpPlayed();
  tutoring = false;
  prevBest = hb.stats().infBest || 0;
  return beginBoard(() => newGame({
    C: S.cols, R: S.rows, colors: [0, 1, 2, 3, 4, 5].slice(0, S.colors), moves: S.startMoves, goals: [],
    endless: true, energyNeed: ENERGY_START, seed: newSeed(),
  }), ['无尽模式', '步数用完才结束']);
}

function load() {
  reset();
  s = null;
  vis.clear();
  const sv = hb.load(mode === 'inf' ? 'inf' : 'lv', null);
  const valid = sv && Array.isArray(sv.grid) && sv.grid.length === sv.C * sv.R && typeof sv.moves === 'number';
  if (mode === 'levels') {
    const n = hb.stats().level || 1;
    if (valid && sv.n === n) { resume(sv, levelSpec(n)); return; }
    startLevel(n);
  } else {
    prevBest = hb.stats().infBest || 0;
    if (valid && sv.endless) { resume(sv, null); return; }
    startInf();
  }
}

function resume(sv, sp) {
  s = sv;
  spec = sp;
  tutoring = !!sp && sp.n === 1 && !hb.load('tutored', false);
  statMark = { k: s.totalKills, sp: s.totalSpecials };
  syncVis();
  layout();
  shownMoves = s.moves; shownScore = s.score; targetScore = s.score;
  buildHud();
  const st = status(s);
  if (st !== 'play') { afterMove(); return; }
  const ev = ensurePlayable(s);
  if (ev.length) { busy = true; playEvents(ev).then(() => { busy = false; saveState(); }); }
}

/* ======================================================================
   HUD
   ====================================================================== */
function buildHud() {
  const dpr = view.dpr;
  document.body.classList.toggle('inf', mode === 'inf');
  $('segLevels').setAttribute('aria-checked', String(mode === 'levels'));
  $('segInf').setAttribute('aria-checked', String(mode === 'inf'));
  $('seg').classList.toggle('right', mode === 'inf');
  const goals = $('goals');
  goals.replaceChildren();
  goalEls = [];
  shownGoals = s.goals.map((g) => Math.max(0, g.need - g.got));
  s.goals.forEach((g, i) => {
    const el = document.createElement('div');
    el.className = 'goal';
    el.append(goalIcon(g, 32, dpr));
    const b = document.createElement('b');
    b.textContent = String(shownGoals[i]);
    el.append(b);
    if (shownGoals[i] === 0) el.classList.add('done');
    goals.append(el);
    goalEls.push(el);
  });
  goals.hidden = mode === 'inf';
  $('energy').hidden = mode !== 'inf';
  updateHud();
  setTip();
}

function setTip() {
  let text = '';
  if (mode === 'inf') text = '点一颗星星，再点旁边那颗互换。消得越多，奖励的步数越多';
  else if (spec && spec.tip) text = spec.tip;
  else text = '点一颗星星，再点旁边那颗互换，连成 3 颗就消掉';
  if (!S.swipe) text = text.replace('（或者直接滑）', '');
  $('tip').textContent = text;
}

function updateHud() {
  $('movesN').textContent = String(Math.max(0, shownMoves));
  $('moves').classList.toggle('low', shownMoves > 0 && shownMoves <= 5);
  if (mode === 'inf') {
    $('hudTitle').textContent = '无尽模式';
    $('hudBest').textContent = `最高 ${Math.max(hb.stats().infBest || 0, targetScore)}`;
    const left = Math.max(0, s.energyNeed - s.energy);
    $('energyText').innerHTML = `再消 <b>${left}</b> 颗，奖励 <b>3</b> 步`;
    $('energyFill').style.width = `${Math.min(100, (s.energy / s.energyNeed) * 100)}%`;
  } else {
    $('hudTitle').textContent = `第 ${s.n} 关`;
    $('hudBest').textContent = `最高 ${Math.max(hb.stats().best || 0, targetScore)}`;
  }
}

function bump(el) { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }

function goalArrive(i) {
  shownGoals[i] = Math.max(0, shownGoals[i] - 1);
  const el = goalEls[i];
  if (!el) return;
  el.querySelector('b').textContent = String(shownGoals[i]);
  bump(el);
  sfx.collect(shownGoals[i]);
  if (shownGoals[i] === 0 && !el.classList.contains('done')) {
    el.classList.add('done');
    el.querySelector('b').textContent = '✓';
    sfx.goalDone();
    hb.haptic(10);
  }
}

function goalTarget(i) {
  const el = goalEls[i];
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return [r.left + 18, r.top + r.height / 2];
}

/** 一颗东西飞向目标 */
function flyToGoal(i, spr, x, y, delay = 0) {
  const to = goalTarget(i);
  if (!to) { goalArrive(i); return; }
  fx.fly({ spr, x0: x, y0: y, x1: to[0], y1: to[1], dur: 0.55 + Math.random() * 0.12, delay, size0: view.cs * 1.15, size1: 26, trail: art.spark(), onDone: () => goalArrive(i) });
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
  cardOpen = true;
}
function hideCard() { $('cardWrap').hidden = true; cardOpen = false; }
$('cardMain').addEventListener('click', () => { const f = cardActions.main; hideCard(); if (f) f(); });
$('cardAlt').addEventListener('click', () => { const f = cardActions.alt; hideCard(); if (f) f(); });

function banner(title, sub) {
  const b = $('banner');
  $('bannerTitle').textContent = title;
  $('bannerSub').textContent = sub;
  b.hidden = true; void b.offsetWidth; b.hidden = false;
  clearTimeout(banner.t);
  banner.t = setTimeout(() => { b.hidden = true; }, 1650);
}

/* ======================================================================
   事件播放
   ====================================================================== */
async function playEvents(events) {
  for (const e of events) {
    if (e.t === 'swap') await animSwap(e);
    else if (e.t === 'clear') await animClear(e);
    else if (e.t === 'fall') await animFall(e);
    else if (e.t === 'shuffle') await animShuffle(e);
    else if (e.t === 'bonus') await animBonus(e);
  }
}

function moveArc(V, x1, y1, dur, { lift = 0.22, sign = 1, big = 1.1 } = {}) {
  const x0 = V.x, y0 = V.y;
  const nx = -(y1 - y0), ny = x1 - x0;
  V.z = big > 1 ? 2 : 1;
  return tween(dur, (k) => {
    const arc = Math.sin(k * Math.PI) * lift * sign;
    V.x = x0 + (x1 - x0) * k + nx * arc;
    V.y = y0 + (y1 - y0) * k + ny * arc;
    V.scale = 1 + (big - 1) * Math.sin(k * Math.PI);
  }, easeInOut).then(() => { V.scale = 1; V.z = 0; });
}

function animSwap(e) {
  const A = vis.get(e.ida), B = vis.get(e.idb);
  if (A) A.sel = false;
  sfx.swap();
  shownMoves -= 1;
  updateHud();
  bump($('moves'));
  return Promise.all([
    A ? moveArc(A, colOf(s, e.b), rowOf(s, e.b), 0.17, { sign: 1, big: 1.14 }) : null,
    B ? moveArc(B, colOf(s, e.a), rowOf(s, e.a), 0.17, { sign: 1, big: 0.9 }) : null,
  ]);
}

async function animBadSwap(a, b) {
  const pa = s.grid[a], pb = s.grid[b];
  const A = vis.get(pa.id), B = vis.get(pb.id);
  const ax = colOf(s, a), ay = rowOf(s, a), bx = colOf(s, b), by = rowOf(s, b);
  sfx.swap();
  A.sel = false;
  await Promise.all([moveArc(A, bx, by, 0.14, { big: 1.12 }), moveArc(B, ax, ay, 0.14, { big: 0.92 })]);
  sfx.bad();
  hb.haptic(14);
  await Promise.all([moveArc(A, ax, ay, 0.16, { sign: -1, big: 1.06 }), moveArc(B, bx, by, 0.16, { sign: -1, big: 0.96 })]);
  A.x = ax; A.y = ay; B.x = bx; B.y = by;
  A.land = 0; B.land = 0;
}

const PRAISE = ['', '', '不错！', '很好！', '太棒了！', '超厉害！', '无敌了！', '星光爆发！'];

function popPiece(rec, i, combo) {
  const V = vis.get(rec.id);
  const x = cx(colOf(s, rec.idx)), y = cy(rowOf(s, rec.idx));
  if (rec.ice !== undefined) {
    visIce[rec.idx] = rec.ice;
    fx.iceBreak(art, x, y, rec.ice);
    sfx.ice(rec.ice);
    if (rec.iceGoal !== undefined) flyToGoal(rec.iceGoal, art.ice(1), x, y);
  }
  if (!V) return;
  V.popT = 0;
  V.z = 2;
  V.c0 = rec.c;
  V.rec = rec;
  V.chimeI = i;
  V.combo = combo;
}

function finishPop(V) {
  const rec = V.rec;
  const c = rec.c;
  const x = cx(V.x), y = cy(V.y);
  fx.burst(art, x, y, c >= 0 ? c : 2, 1);
  sfx.chime(V.combo, V.chimeI);
  if (rec.goal !== undefined) flyToGoal(rec.goal, art.piece(c, 0), x, y);
  vis.delete(V.id);
}

async function animClear(e) {
  const { combo } = e;
  let end = 0.12;

  // 特效发动
  for (const ef of e.effects) {
    end = Math.max(end, ef.delay + 0.22);
    after(ef.delay, () => fireEffect(ef));
    if (ef.targets) for (const t of ef.targets) end = Math.max(end, t.delay + 0.2);
  }

  // 消星星
  e.kills.forEach((rec, i) => {
    end = Math.max(end, rec.delay + 0.2);
    const V = vis.get(rec.id);
    if (rec.morph && V) {
      after(rec.morphAt, () => {
        V.k = rec.morph; V.flash = 1; V.born = 0;
        sfx.morph(i);
      });
    }
    if (rec.merge !== null && rec.merge !== undefined && V) {
      // 飞到特效星那儿合进去
      const tx = colOf(s, rec.merge), ty = rowOf(s, rec.merge);
      const x0 = V.x, y0 = V.y;
      V.z = 1;
      tween(0.15, (k) => {
        V.x = x0 + (tx - x0) * k; V.y = y0 + (ty - y0) * k;
        V.scale = 1 - 0.35 * k;
      }, (k) => k * k).then(() => {
        if (rec.goal !== undefined) flyToGoal(rec.goal, art.piece(rec.c, 0), cx(tx), cy(ty));
        if (rec.ice !== undefined) {
          const gx = cx(colOf(s, rec.idx)), gy = cy(rowOf(s, rec.idx));
          visIce[rec.idx] = rec.ice;
          fx.iceBreak(art, gx, gy, rec.ice);
          sfx.ice(rec.ice);
          if (rec.iceGoal !== undefined) flyToGoal(rec.iceGoal, art.ice(1), gx, gy);
        }
        sfx.chime(combo, i);
        vis.delete(V.id);
      });
      return;
    }
    after(rec.delay, () => popPiece(rec, i, combo));
  });

  // 砸开锁链
  for (const rec of e.unlocks) {
    end = Math.max(end, rec.delay + 0.2);
    after(rec.delay, () => {
      const V = vis.get(rec.id);
      if (!V) return;
      V.lock = 0; V.flash = 0.9; V.land = 0;
      const x = cx(V.x), y = cy(V.y);
      fx.chainBreak(art, x, y);
      sfx.chain();
      if (rec.goal !== undefined) flyToGoal(rec.goal, art.lock(), x, y);
    });
  }

  // 新的特效星
  for (const sp of e.spawns) {
    end = Math.max(end, 0.34);
    after(0.15, () => {
      const V = vis.get(sp.id);
      if (!V) return;
      V.k = sp.k; V.c = sp.k === K.RAINBOW ? -1 : V.c;
      V.flash = 1; V.born = 0; V.lock = 0;
      fx.birth(art, cx(V.x), cy(V.y), V.c, sp.k === K.RAINBOW);
      sfx.newSpecial(sp.k);
      hb.haptic(10);
    });
  }
  for (const rec of e.chips) {
    after(0.15, () => {
      const x = cx(colOf(s, rec.idx)), y = cy(rowOf(s, rec.idx));
      visIce[rec.idx] = rec.ice;
      fx.iceBreak(art, x, y, rec.ice);
      sfx.ice(rec.ice);
      if (rec.iceGoal !== undefined) flyToGoal(rec.iceGoal, art.ice(1), x, y);
    });
  }

  // 分数
  targetScore = e.score;
  for (const f of e.floats) {
    fx.text({ text: `+${f.pts}`, x: cx(colOf(s, f.idx)), y: cy(rowOf(s, f.idx)) - view.cs * 0.1, size: 19 + Math.min(10, combo), color: f.c >= 0 ? COLORS[f.c].hi : '#FFFFFF' });
  }
  if (combo >= 2) {
    const word = PRAISE[Math.min(combo, PRAISE.length - 1)];
    if (word) fx.text({ text: word, x: view.bx + view.bw / 2, y: view.by + view.bh * 0.38, size: 30 + Math.min(14, combo * 2), color: '#FFD45C', big: true, life: 0.9 });
  }
  if (e.bonusMoves) {
    after(0.15, () => {
      shownMoves += e.bonusMoves;
      updateHud(); bump($('moves'));
      sfx.bonusMoves();
      fx.text({ text: `+${e.bonusMoves} 步`, x: view.bx + view.bw / 2, y: view.by + view.bh * 0.5, size: 30, color: '#7CF0B0', big: true, life: 1 });
    });
  }
  hb.haptic(e.kills.length >= 10 ? [10, 20, 10] : 6);

  await wait(end + 0.02);
  updateHud();
}

function fireEffect(ef) {
  const x = cx(colOf(s, ef.idx)), y = cy(rowOf(s, ef.idx));
  if (ef.type === 'line') {
    fx.beam(art, x, y, ef.dir, ef.c, bounds());
    sfx.line();
    hb.haptic(12);
  } else if (ef.type === 'bomb') {
    fx.bomb(art, x, y, ef.c, ef.radius);
    sfx.bomb(ef.radius > 2);
    hb.haptic([14, 20, 14]);
  } else if (ef.type === 'rainbow') {
    fx.rainbow(art, x, y);
    sfx.rainbow();
    hb.haptic(14);
    ef.targets.forEach((t, i) => after(t.delay - ef.delay, () => {
      fx.bolt(x, y, cx(colOf(s, t.idx)), cy(rowOf(s, t.idx)), ef.c, Math.max(2, view.cs * 0.07));
      sfx.zap(i);
    }));
  } else if (ef.type === 'nova') {
    fx.nova(art, x, y);
    sfx.nova();
    hb.haptic([20, 30, 20]);
  }
}

async function animFall(e) {
  for (const m of e.moves) {
    const V = vis.get(m.id);
    if (!V) continue;
    // 路径的起点用星星现在的位置
    startPath(V, m.pts);
  }
  for (const n of e.news) {
    const [x, y] = n.pts[0];
    const V = makeV(n.piece, x, y);
    startPath(V, n.pts);
  }
  await fallsDone();
}

async function animShuffle(e) {
  fx.text({ text: '没得换了，洗牌', x: view.bx + view.bw / 2, y: view.by + view.bh * 0.45, size: 26, color: '#FFFFFF', big: true, life: 1 });
  sfx.shuffle();
  await wait(0.45);
  const jobs = [];
  for (const m of e.moves) {
    const V = vis.get(m.id);
    if (!V) continue;
    V.c = m.c;
    const x0 = V.x, y0 = V.y, x1 = colOf(s, m.to), y1 = rowOf(s, m.to);
    const mx = (s.C - 1) / 2, my = (s.R - 1) / 2;
    jobs.push(tween(0.55, (k) => {
      const pull = Math.sin(k * Math.PI);
      V.x = x0 + (x1 - x0) * k + (mx - x0) * pull * 0.55;
      V.y = y0 + (y1 - y0) * k + (my - y0) * pull * 0.55;
      V.rot = k * 6.283;
    }, easeInOut).then(() => { V.rot = 0; V.land = 0; }));
  }
  await Promise.all(jobs);
}

async function animBonus(e) {
  const r = $('moves').getBoundingClientRect();
  const from = [r.left + r.width / 2, r.top + r.height / 2];
  const gold = art.piece(2, 0);
  const n = e.items.length;
  const jobs = e.items.map((it, i) => new Promise((res) => {
    fx.fly({
      spr: gold, x0: from[0], y0: from[1], x1: cx(colOf(s, it.idx)), y1: cy(rowOf(s, it.idx)), dur: 0.42, delay: i * 0.09,
      size0: 22, size1: view.cs, trail: art.spark(),
      onDone: () => {
        const V = vis.get(it.id);
        if (V) { V.k = it.k; V.flash = 1; V.born = 0; fx.birth(art, cx(V.x), cy(V.y), V.c, false); }
        shownMoves = Math.max(0, shownMoves - 1);
        updateHud();
        sfx.moveToStar(i);
        res();
      },
    });
  }));
  targetScore = e.score;
  await Promise.all(jobs);
  if (e.left > n) { shownMoves = 0; updateHud(); }
  await wait(0.2);
}

/* ======================================================================
   走一步
   ====================================================================== */
async function tryMove(a, b) {
  if (busy || cardOpen) return;
  clearSel();
  hint = null; idleT = 0;
  busy = true;
  const r = play(s, a, b);
  if (!r.ok) {
    await animBadSwap(a, b);
    busy = false;
    return;
  }
  if (tutoring) { tutoring = false; hb.save('tutored', true); }
  saveState();
  recordStats();
  await playEvents(r.events);
  shownMoves = s.moves;
  updateHud();
  await afterMove();
}

function recordStats() {
  const st = hb.stats();
  st.stars = (st.stars || 0) + (s.totalKills - statMark.k);
  st.specials = (st.specials || 0) + (s.totalSpecials - statMark.sp);
  st.bestCombo = Math.max(st.bestCombo || 0, s.bestCombo);
  if (mode === 'inf') st.infBest = Math.max(st.infBest || 0, s.score);
  statMark = { k: s.totalKills, sp: s.totalSpecials };
  hb.saveStats(st);
}

async function afterMove() {
  const st = status(s);
  if (st === 'win') { await winFlow(); return; }
  if (st === 'lose') { await loseFlow(); return; }
  busy = false;
  idleT = 0;
}

async function winFlow() {
  busy = true;
  const n = s.n;
  const left = s.moves;
  // 规则先结算：中途退出也已经算过关了
  const events = finale(s);
  const stats = hb.stats();
  stats.level = n + 1;
  stats.bestLevel = Math.max(stats.bestLevel || 1, n + 1);
  stats.best = Math.max(stats.best || 0, s.score);
  stats.stars = (stats.stars || 0) + (s.totalKills - statMark.k);
  statMark = { k: s.totalKills, sp: s.totalSpecials };
  hb.saveStats(stats);
  clearSave();
  sfx.win();
  hb.haptic([12, 60, 12]);
  fx.text({ text: '过关！', x: view.bx + view.bw / 2, y: view.by + view.bh * 0.42, size: 46, color: '#7CF0B0', big: true, life: 1.3 });
  await wait(0.9);
  await playEvents(events);
  await wait(0.35);
  showCard({
    title: `第 ${n} 关 过关`,
    big: String(s.score),
    meta: left ? `剩下 <b>${left}</b> 步，每步奖励 <b>200</b> 分` : '最后一步过的，好险',
    main: ['下一关', () => startLevel(n + 1)],
  });
  busy = false;
}

async function loseFlow() {
  busy = true;
  clearSave();
  if (mode === 'inf') {
    const stats = hb.stats();
    const isNew = s.score > prevBest && prevBest > 0;
    stats.infBest = Math.max(stats.infBest || 0, s.score);
    hb.saveStats(stats);
    sfx.lose();
    await wait(0.4);
    showCard({
      title: isNew ? '新纪录！' : '步数用完了',
      big: String(s.score),
      meta: `最高 <b>${Math.max(prevBest, s.score)}</b> 分，这一局走了 <b>${s.usedMoves}</b> 步`,
      main: ['再来一局', startInf],
    });
  } else {
    const n = s.n;
    const parts = s.goals.map((g) => {
      const need = g.need - g.got;
      if (need <= 0) return null;
      if (g.type === 'color') return `${COLORS[g.c].name}色星星 <b>${need}</b> 颗`;
      if (g.type === 'ice') return `冰块 <b>${need}</b> 块`;
      return `锁链 <b>${need}</b> 条`;
    }).filter(Boolean);
    const stats = hb.stats();
    stats.best = Math.max(stats.best || 0, s.score);
    hb.saveStats(stats);
    sfx.lose();
    hb.haptic([30, 40, 30]);
    await wait(0.4);
    showCard({
      title: '步数用完了',
      big: String(s.score),
      meta: `还差 ${parts.join('、')}`,
      main: ['再试一次', () => startLevel(n)],
    });
  }
  busy = false;
}

/* ======================================================================
   排版和绘制
   ====================================================================== */
let bgStars = [];

function layout() {
  const W = window.innerWidth, H = window.innerHeight;
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const st = stage.getBoundingClientRect();
  const C = s ? s.C : LV_C, R = s ? s.R : LV_R;
  const cs = Math.max(20, Math.floor(Math.min((W - 18) / C, (st.height - 14) / R)));
  const bw = cs * C, bh = cs * R;
  view = { cs, bw, bh, bx: Math.round((W - bw) / 2), by: Math.round(st.top + (st.height - bh) / 2), W, H, dpr };
  if (!art || art.cs !== cs || art.dpr !== dpr) art = new Art(cs, dpr);
  if (bgStars.length === 0 || layout.W !== W || layout.H !== H) {
    layout.W = W; layout.H = H;
    bgStars = Array.from({ length: 44 }, () => ({ x: Math.random() * W, y: Math.random() * H, r: 0.5 + Math.random() * 1.2, p: Math.random() * 6.28, sp: 0.5 + Math.random() * 1.6 }));
  }
}
window.addEventListener('resize', () => { layout(); if (s) buildHud(); });

function drawPiece(V) {
  const { cs } = view;
  const S0 = art.S;
  const x = cx(V.x), y = cy(V.y);
  let sx = V.scale, sy = V.scale, ox = 0, oy = 0, rot = V.rot;

  if (V.land < 0.6) {
    const q = Math.exp(-V.land * 9) * Math.cos(V.land * 26);
    sy *= 1 - 0.2 * q; sx *= 1 + 0.12 * q;
    oy += cs * 0.42 * 0.2 * q;
  }
  if (V.popT >= 0) {
    const k = Math.min(1, V.popT / 0.08);
    const g = 1 + 0.26 * k;
    sx *= g; sy *= g;
  }
  if (V.born < 0.5) {
    const k = V.born / 0.5;
    const g = 1 + 0.5 * (1 - k) * Math.cos(k * 14);
    sx *= g; sy *= g;
  }
  if (V.sel) {
    const pump = 0.5 + 0.5 * Math.sin(T * 9);
    sx *= 1.07 + 0.05 * pump; sy *= 1.07 + 0.05 * (1 - pump);
    oy -= cs * 0.03 * pump;
    rot += Math.sin(T * 7) * 0.05;
  }
  if (V.shakeT > 0) ox += Math.sin(V.shakeT * 40) * cs * 0.07 * Math.min(1, V.shakeT * 3);
  if (hint && (hint.ia === V.id || hint.ib === V.id)) {
    const dir = hint.ia === V.id ? 1 : -1;
    const k = Math.sin(T * 7) * 0.5 + 0.5;
    ox += hint.dx * dir * cs * 0.09 * k;
    oy += hint.dy * dir * cs * 0.09 * k;
    sx *= 1 + 0.06 * k; sy *= 1 + 0.06 * k;
  }

  ctx.save();
  ctx.translate(x + ox, y + oy);
  if (rot) ctx.rotate(rot);
  ctx.scale(sx, sy);

  if (V.k === K.BOMB) {
    const c = V.c >= 0 ? V.c : 2;
    ctx.save();
    ctx.rotate(T * 1.1 + V.phase);
    const g = (0.92 + 0.08 * Math.sin(T * 5 + V.phase)) * S0;
    ctx.drawImage(art.halo(c), -g / 2, -g / 2, g, g);
    ctx.restore();
    ctx.drawImage(art.piece(c, 0), -S0 / 2, -S0 / 2, S0, S0);
    const m = S0 * (1 + 0.08 * Math.sin(T * 5 + V.phase));
    ctx.drawImage(art.bombMark(c), -m / 2, -m / 2, m, m);
  } else if (V.k === K.RAINBOW) {
    ctx.save();
    ctx.rotate(T * 0.9 + V.phase);
    ctx.drawImage(art.piece(-1, K.RAINBOW), -S0 / 2, -S0 / 2, S0, S0);
    ctx.restore();
  } else {
    const c = V.c >= 0 ? V.c : 2;
    ctx.drawImage(art.piece(c, V.k), -S0 / 2, -S0 / 2, S0, S0);
    if (V.k === K.H || V.k === K.V) {
      const d = Math.sin(T * 5 + V.phase) * cs * 0.025;
      const a = art.arrow(c, V.k);
      if (V.k === K.H) ctx.drawImage(a, -S0 / 2 + d, -S0 / 2, S0, S0);
      else ctx.drawImage(a, -S0 / 2, -S0 / 2 + d, S0, S0);
    }
  }
  if (V.flash > 0) {
    ctx.globalAlpha = Math.min(1, V.flash);
    ctx.drawImage(art.flash(V.k === K.RAINBOW ? K.RAINBOW : 0), -S0 / 2, -S0 / 2, S0, S0);
    ctx.globalAlpha = 1;
  }
  if (V.lock) ctx.drawImage(art.lock(), -S0 / 2, -S0 / 2, S0, S0);
  ctx.restore();
}

function draw() {
  const { W, H, cs, bx, by, bw, bh } = view;
  ctx.clearRect(0, 0, W, H);

  // 背景里闪烁的小星星
  for (const st of bgStars) {
    ctx.globalAlpha = 0.2 + 0.35 * (0.5 + 0.5 * Math.sin(T * st.sp + st.p));
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(st.x, st.y, st.r, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
  if (!s || !art) return;

  ctx.save();
  ctx.translate(fx.sx, fx.sy);

  const board = art.board(s.C, s.R);
  ctx.drawImage(board, bx - board.pad, by - board.pad, bw + board.pad * 2, bh + board.pad * 2);

  // 冰
  for (let i = 0; i < visIce.length; i++) {
    const n = visIce[i];
    if (!n) continue;
    ctx.drawImage(art.ice(n), bx + colOf(s, i) * cs, by + rowOf(s, i) * cs, cs, cs);
  }

  // 选中的格子
  if (sel >= 0) {
    const x = bx + colOf(s, sel) * cs, y = by + rowOf(s, sel) * cs;
    const a = 0.55 + 0.3 * Math.sin(T * 8);
    ctx.fillStyle = `rgba(255,255,255,${0.16 + 0.06 * Math.sin(T * 8)})`;
    ctx.beginPath(); ctx.roundRect(x + 1, y + 1, cs - 2, cs - 2, cs * 0.18); ctx.fill();
    ctx.strokeStyle = `rgba(255,255,255,${a + 0.2})`; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.roundRect(x + 1.5, y + 1.5, cs - 3, cs - 3, cs * 0.18); ctx.stroke();
  }

  // 星星：先画不动的，再画飞在上面的
  const list = [...vis.values()].sort((a, b) => a.z - b.z);
  const above = [];
  ctx.save();
  if (clipAll) { ctx.beginPath(); ctx.rect(bx - 6, by - 2, bw + 12, bh + 6); ctx.clip(); }
  for (const V of list) {
    if (!clipAll && V.y < 0) { above.push(V); continue; }
    drawPiece(V);
  }
  ctx.restore();
  if (above.length) {
    ctx.save();
    ctx.beginPath(); ctx.rect(bx - 6, by - 2, bw + 12, bh + 6); ctx.clip();
    for (const V of above) drawPiece(V);
    ctx.restore();
  }

  fx.drawWorld(ctx);

  // 第一次玩：手指示范
  if (tutoring && hint && !busy) drawTutor();

  ctx.restore();
  fx.drawTop(ctx, view);
}

function drawTutor() {
  const { cs } = view;
  const ax = cx(colOf(s, hint.a)), ay = cy(rowOf(s, hint.a));
  const bx2 = cx(colOf(s, hint.b)), by2 = cy(rowOf(s, hint.b));
  const k = (T % 1.5) / 1.5;
  // 两下：先点第一颗，再点第二颗
  const onFirst = k < 0.45;
  const x = onFirst ? ax : bx2, y = onFirst ? ay : by2;
  const local = onFirst ? k / 0.45 : (k - 0.45) / 0.55;
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,.95)';
  ctx.lineWidth = 3;
  ctx.globalAlpha = 1 - local;
  ctx.beginPath(); ctx.arc(x, y, cs * (0.2 + 0.42 * local), 0, Math.PI * 2); ctx.stroke();
  ctx.globalAlpha = 0.85;
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(x, y, cs * 0.14, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

/* ======================================================================
   主循环
   ====================================================================== */
function update(dt) {
  T += dt;
  if (timers.length) {
    const due = timers.filter((t) => t.at <= T);
    if (due.length) {
      timers = timers.filter((t) => t.at > T);
      due.sort((a, b) => a.at - b.at).forEach((t) => t.fn());
    }
  }
  if (tweens.length) {
    const list = tweens;
    tweens = [];
    for (const tw of list) {
      tw.t += dt;
      const k = Math.min(1, tw.t / tw.dur);
      tw.fn(tw.ease(k));
      if (k < 1) tweens.push(tw); else tw.res();
    }
  }
  // 星星
  let landed = 0;
  for (const V of vis.values()) {
    if (V.path) {
      const P = V.path;
      if (P.delay > 0) { P.delay -= dt; continue; }
      P.v = Math.min(26, P.v + 62 * dt);
      let step = P.v * dt;
      while (step > 0 && P.seg < P.pts.length - 1) {
        const a = P.pts[P.seg], b = P.pts[P.seg + 1];
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1e-6;
        const rest = len - P.d;
        if (step < rest) { P.d += step; step = 0; }
        else { step -= rest; P.seg++; P.d = 0; }
      }
      if (P.seg >= P.pts.length - 1) {
        const e = P.pts[P.pts.length - 1];
        V.x = e[0]; V.y = e[1];
        V.path = null;
        V.land = 0;
        landed++;
        fallPending--;
      } else {
        const a = P.pts[P.seg], b = P.pts[P.seg + 1];
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1e-6;
        V.x = a[0] + ((b[0] - a[0]) * P.d) / len;
        V.y = a[1] + ((b[1] - a[1]) * P.d) / len;
      }
    }
    if (V.land < 0.7) V.land += dt;
    if (V.born < 0.6) V.born += dt;
    if (V.flash > 0) V.flash = Math.max(0, V.flash - dt * 4.5);
    if (V.shakeT > 0) V.shakeT = Math.max(0, V.shakeT - dt);
    if (V.popT >= 0) {
      V.popT += dt;
      V.flash = Math.min(1, V.popT / 0.07);
      if (V.popT >= 0.09) finishPop(V);
    }
  }
  if (landed) sfx.land(landed);
  if (fallPending <= 0 && fallWaiters.length) {
    fallPending = 0;
    const w = fallWaiters;
    fallWaiters = [];
    w.forEach((f) => f());
  }
  fx.update(dt);

  // 分数滚动
  if (shownScore !== targetScore) {
    const d = targetScore - shownScore;
    shownScore = Math.abs(d) < 2 ? targetScore : shownScore + d * (1 - Math.exp(-dt * 11));
    const pill = $('score');
    const txt = String(Math.round(shownScore));
    if (pill.textContent !== txt) pill.textContent = txt;
    if (shownScore === targetScore) bump(pill);
  } else if ($('score').textContent !== String(targetScore)) $('score').textContent = String(targetScore);

  // 偶尔闪一下
  if (!busy && Math.random() < dt * 1.3 && vis.size && art) {
    const arr = [...vis.values()];
    const V = arr[Math.floor(Math.random() * arr.length)];
    if (!V.lock) {
      const a = -Math.PI / 2 + Math.floor(Math.random() * 5) * (Math.PI * 2 / 5);
      fx.twinkle(cx(V.x) + Math.cos(a) * view.cs * 0.34, cy(V.y) + Math.sin(a) * view.cs * 0.34 - view.cs * 0.03, view.cs * 0.46, art.spark());
    }
  }

  // 发呆提示
  if (!busy && !cardOpen && s && status(s) === 'play') {
    idleT += dt;
    const delay = tutoring ? 0.5 : S.hintDelay;
    if (!hint && (S.hint || tutoring) && idleT >= delay && sel < 0) {
      const m = bestMove(s);
      if (m) {
        hint = {
          a: m.a, b: m.b, ia: s.grid[m.a].id, ib: s.grid[m.b].id,
          dx: colOf(s, m.b) - colOf(s, m.a), dy: rowOf(s, m.b) - rowOf(s, m.a),
        };
      }
    }
  }
}

let raf = 0, last = 0, paused = false, frameNo = 0;
function frame(t) {
  raf = requestAnimationFrame(frame);
  const raw = Math.min(0.05, (t - last) / 1000);
  last = t;
  const speed = [0.72, 1, 1.4][S.speed - 1] || 1;
  update(raw * speed);
  frameNo++;
  // 棋盘没动静的时候降到 30 帧，省电
  const calm = !busy && !fx.busy && sel < 0 && !hint && !tweens.length;
  if (calm && frameNo % 2) return;
  draw();
}
function startLoop() { if (paused) return; cancelAnimationFrame(raf); last = performance.now(); raf = requestAnimationFrame(frame); }
function stopLoop() { cancelAnimationFrame(raf); raf = 0; }

/* ======================================================================
   操作：点一颗再点旁边那颗，或者按住往旁边滑
   ====================================================================== */
function cellAt(e) {
  const x = e.clientX - view.bx, y = e.clientY - view.by;
  if (!s) return -1;
  const c = Math.floor(x / view.cs), r = Math.floor(y / view.cs);
  if (c < 0 || c >= s.C || r < 0 || r >= s.R) return -1;
  return r * s.C + c;
}
function setSel(i) {
  if (sel >= 0 && s.grid[sel]) { const V = vis.get(s.grid[sel].id); if (V) V.sel = false; }
  sel = i;
  if (i >= 0 && s.grid[i]) { const V = vis.get(s.grid[i].id); if (V) V.sel = true; }
}
const clearSel = () => setSel(-1);

let press = null;
stage.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  if (!s || busy || cardOpen) return;
  hint = null; idleT = 0;
  const i = cellAt(e);
  if (i < 0 || !s.grid[i]) { if (sel >= 0) { clearSel(); sfx.deselect(); } return; }
  const p = s.grid[i];
  if (p.lock) {
    const V = vis.get(p.id);
    if (V) V.shakeT = 0.34;
    sfx.locked();
    hb.haptic(12);
    clearSel();
    return;
  }
  if (sel >= 0 && sel !== i && adjacent(s, sel, i)) { const a = sel; press = null; tryMove(a, i); return; }
  const was = sel === i;
  if (!was) { setSel(i); sfx.select(); hb.haptic(5); }
  press = { i, x: e.clientX, y: e.clientY, was, id: e.pointerId };
  try { stage.setPointerCapture(e.pointerId); } catch {}
});
stage.addEventListener('pointermove', (e) => {
  if (!press || e.pointerId !== press.id || !S.swipe || busy) return;
  const dx = e.clientX - press.x, dy = e.clientY - press.y;
  const reach = Math.max(10, view.cs * 0.32);
  if (Math.max(Math.abs(dx), Math.abs(dy)) < reach) return;
  const c = colOf(s, press.i), r = rowOf(s, press.i);
  const horiz = Math.abs(dx) > Math.abs(dy);
  const nc = c + (horiz ? Math.sign(dx) : 0), nr = r + (horiz ? 0 : Math.sign(dy));
  const from = press.i;
  press = null;
  if (nc < 0 || nc >= s.C || nr < 0 || nr >= s.R) return;
  const to = nr * s.C + nc;
  const q = s.grid[to];
  if (!q) return;
  if (q.lock) { const V = vis.get(q.id); if (V) V.shakeT = 0.34; sfx.locked(); return; }
  tryMove(from, to);
});
const endPress = (e) => {
  if (!press || e.pointerId !== press.id) return;
  if (press.was) { clearSel(); sfx.deselect(); }
  press = null;
};
stage.addEventListener('pointerup', endPress);
stage.addEventListener('pointercancel', () => { press = null; });

function askRestart() {
  if (!s || cardOpen) return;
  const restart = () => (mode === 'inf' ? startInf() : startLevel(s.n));
  if (s.usedMoves === 0 && !busy) { restart(); return; }
  showCard(mode === 'inf'
    ? { title: '重新开始无尽模式？', meta: `这一局已经 <b>${targetScore}</b> 分了`, main: ['重新开始', restart], alt: ['继续玩', null] }
    : { title: `重来第 ${s.n} 关？`, meta: '这一关的进度和分数都不要了', main: ['重来', restart], alt: ['继续玩', null] });
}
$('restart').addEventListener('click', askRestart);

function switchMode(m) {
  if (m === mode) return;
  if (s && !cardOpen) saveState();
  mode = m;
  hb.save('mode', mode);
  document.body.classList.toggle('inf', mode === 'inf');
  $('seg').classList.toggle('right', mode === 'inf');
  $('segLevels').setAttribute('aria-checked', String(mode === 'levels'));
  $('segInf').setAttribute('aria-checked', String(mode === 'inf'));
  load();
}
$('segLevels').addEventListener('click', () => switchMode('levels'));
$('segInf').addEventListener('click', () => switchMode('inf'));

/* ---------- 和大厅的联动 ---------- */
hb.onSettings((next) => {
  const sizeChanged = ['cols', 'rows', 'colors', 'startMoves'].some((k) => next[k] !== S[k]);
  S = next;
  sound.enabled = S.sound;
  fx.amount = [0.55, 1, 1.5][S.particles - 1] || 1;
  fx.shakeOn = S.shake;
  if (s) setTip();
  // 无尽这一局还没动过，就马上换成新棋盘
  if (sizeChanged && mode === 'inf' && s && s.usedMoves === 0 && !busy && !cardOpen) startInf();
});
hb.onPause(() => { paused = true; stopLoop(); if (s && !cardOpen) saveState(); });
hb.onResume(() => { paused = false; startLoop(); });
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { stopLoop(); if (s && !cardOpen) saveState(); } else startLoop();
});

fx.amount = [0.55, 1, 1.5][S.particles - 1] || 1;
fx.shakeOn = S.shake;
layout();
load();
startLoop();

// 方便自动测试
window.__starmatch = {
  get s() { return s; }, get busy() { return busy; }, get view() { return view; }, get vis() { return vis; }, get mode() { return mode; },
  get cardOpen() { return cardOpen; }, get hint() { return hint; }, get fx() { return fx; }, get T() { return T; },
  tryMove, bestMove: () => bestMove(s), startLevel, startInf, saveState, syncVis, buildHud, drawStar,
  /** 摆局面：直接改规则状态后调用 */
  redraw() { syncVis(); buildHud(); },
  /** 手动走帧（截图、快进用）：先 freeze，再 await step(秒) */
  freeze() { paused = true; stopLoop(); },
  async step(sec, n = 1) { for (let i = 0; i < n; i++) { update(sec); for (let j = 0; j < 4; j++) await Promise.resolve(); if (i % 5 === 4) await new Promise((r) => setTimeout(r)); } draw(); },
};
