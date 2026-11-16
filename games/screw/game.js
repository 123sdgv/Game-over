// 拧螺丝 + 钉子画：外壳。三个标签页（闯关 / 仓库 / 钉子画），存档、仓库库存、成就奖励都在这里。
//   拼图画面在 puzzle.js，规则在 logic.js，关卡在 levels.js，钉子画在 paint.js。
import { hub } from '../_shared/hub.js';
import { sound } from '../_shared/sound.js';
import { sfx } from './sfx.js';
import { COLORS, SPECIAL, TINTS, screwIcon, headSprite, plateSprite, plateShadow } from './art.js';
import { makeLevel, inflate } from './levels.js';
import { newState } from './logic.js';
import * as P from './puzzle.js';
import { initPaint, openEditor, closeEditor, editorOpen, newArtSheet, allWorks, drawThumb, pauseEditor, resumeEditor, refreshEditor, placedCount } from './paint.js';
import { h, toast, card, hideCard, cardOpen, closeSheet, sheetOpen } from './ui.js';

const hb = hub('screw');
const $ = (id) => document.getElementById(id);
let S = hb.settings();
sound.enabled = S.sound;

/* ======================================================================
   存档
   ====================================================================== */
const inv = hb.load('inv', null) || { c: [0, 0, 0, 0, 0, 0], s: 0 };
if (!Array.isArray(inv.c) || inv.c.length !== 6) inv.c = [0, 0, 0, 0, 0, 0];
inv.s = inv.s || 0;
const prog = Object.assign({ level: 1, cleared: 0, rewards: 0 }, hb.load('prog', {}));
let run = hb.load('run', null);   // { level: 原始关卡, state: 规则状态 }
const flags = hb.load('flags', {}) || {};
const saveInv = () => hb.save('inv', inv);
const saveProg = () => hb.save('prog', prog);
const saveRun = () => hb.save('run', run);
const saveFlags = () => hb.save('flags', flags);
const stats = () => hb.stats();
function bump(key, n = 1) { const st = stats(); st[key] = (st[key] || 0) + n; hb.saveStats(st); return st; }
function syncStats() {
  const st = stats();
  st.level = prog.level; st.cleared = prog.cleared;
  st.paintings = allWorks().length;
  hb.saveStats(st);
}

initPaint({
  inv: () => inv, saveInv, settings: () => S, stats, saveStats: (o) => hb.saveStats(o),
  load: (k, d) => hb.load(k, d), save: (k, v) => hb.save(k, v), haptic: (ms) => hb.haptic(ms),
  onClose: () => { showTabs(true); renderArt(); renderBank(); syncStats(); },
});

/* ======================================================================
   标签页
   ====================================================================== */
let tab = 'home';
function setTab(t) {
  tab = t;
  document.querySelectorAll('.page').forEach((p) => { p.hidden = p.dataset.tab !== t; });
  document.querySelectorAll('#tabbar button').forEach((b) => b.setAttribute('aria-current', b.dataset.tab === t ? 'page' : 'false'));
  if (t === 'home') renderHome();
  if (t === 'bank') renderBank();
  if (t === 'art') renderArt();
  heroOn(t === 'home');
}
document.querySelectorAll('#tabbar button').forEach((b) => b.addEventListener('click', () => { if (b.dataset.tab !== tab) { sfx.tap(); setTab(b.dataset.tab); } }));
function showTabs(on) {
  $('tabbar').hidden = !on;
  $('pages').hidden = !on;
}

/* ---------- 闯关首页 ---------- */
const totalOf = (o) => o.c.reduce((a, b) => a + b, 0) + o.s;
function renderHome() {
  const n = prog.level;
  const going = run && run.state && run.state.n === n && run.state.removed > 0;
  $('playBig').textContent = going ? `继续第 ${n} 关` : `开始第 ${n} 关`;
  $('playSub').textContent = going ? `已经拧了 ${run.state.removed} / ${run.state.screws.length} 颗` : n > 15 ? '无限关 · 螺丝越来越多' : n <= 5 ? '新手关' : '';
  $('homeBank').replaceChildren(h('img', { src: screwIcon(COLORS[0].base, 40), alt: '' }), h('span', {}, `${totalOf(inv)}`));
  const every = S.rewardEvery;
  const k = prog.cleared % every;
  $('streakText').innerHTML = `累计通关 <b>${prog.cleared}</b> 关`;
  $('streakReward').replaceChildren(`再过 ${every - k} 关领 `, h('img', { src: screwIcon(SPECIAL[1], 36, { mode: 'star', rainbow: true }), alt: '' }), ` ×${S.rewardN}`);
  $('streakDots').replaceChildren(...Array.from({ length: every }, (_, i) => h('i', { className: i < k ? 'on' : '' })));
  $('homeNote').textContent = n <= 15 ? `第 16 关起是无限关，专门用来攒钉子画的螺丝` : '';
}
$('playBtn').addEventListener('click', () => { sfx.tap(); startPlay(); });
$('homeBank').addEventListener('click', () => setTab('bank'));

/* 首页的装饰：几块叠着的玻璃板 */
function heroOn(on) { if (on) drawHero(); }
function drawHero() {
  const c = $('heroCv');
  const r = c.parentElement.getBoundingClientRect();
  const d = Math.min(3, devicePixelRatio || 1);
  if (!r.width || !r.height) return;
  c.width = r.width * d; c.height = r.height * d;
  c.style.width = r.width + 'px'; c.style.height = r.height + 'px';
  const g = c.getContext('2d');
  g.setTransform(d, 0, 0, d, 0, 0);
  // 用一个小「棋盘」坐标画，k 把它放大到 hero 区域
  const BW = 300, BH = 200, k = Math.min(r.width / BW, r.height / BH);
  const ox = (r.width - BW * k) / 2, oy = (r.height - BH * k) / 2;
  const u = 15;
  const plates = [
    { pts: [[70, 60], [150, 48], [128, 128]], tint: 0, pad: 26 },
    { pts: [[150, 120], [250, 120]], tint: 5, pad: 24 },
    { pts: [[196, 44], [244, 62], [212, 92]], tint: 3, pad: 24 },
    { pts: [[60, 150], [104, 162]], tint: 2, pad: 22 },
    { pts: [[110, 90], [176, 74]], tint: 4, pad: 22 },
  ];
  const cols = [[0, 3, 5], [4, 1], [2, 5, 0], [3, 4], [5, 2]];
  plates.forEach((p, i) => {
    const poly = inflate(p.pts, p.pad);
    const sh = plateShadow(poly, k * d), sp = plateSprite(poly, p.pts, u, TINTS[p.tint], k * d, null);
    g.drawImage(sh.c, ox + sh.ox / d + 2, oy + sh.oy / d + 5, sh.c.width / d, sh.c.height / d);
    g.drawImage(sp.c, ox + sp.ox / d, oy + sp.oy / d, sp.c.width / d, sp.c.height / d);
    p.pts.forEach(([x, y], j) => {
      const hs = headSprite(COLORS[cols[i][j % cols[i].length]].base, u * k * d, { shine: true });
      const w = hs.c.width / d;
      g.drawImage(hs.c, ox + x * k - w / 2, oy + y * k - w / 2, w, w);
    });
  });
}

/* ---------- 仓库 ---------- */
function renderBank() {
  $('bankTotal').textContent = `一共 ${totalOf(inv)} 颗`;
  $('bankGrid').replaceChildren(...COLORS.map((c, i) => h('div.bank-card', { style: { '--c': c.base } },
    h('img', { src: screwIcon(c.base, 96), alt: '' }),
    h('div.bank-info', {}, h('b', {}, String(inv.c[i])), h('span', {}, c.name)))));
  $('bankSpecial').replaceChildren(
    h('div.sp-icons', {}, ...SPECIAL.map((col, i) => h('img', { src: screwIcon(col, 72, { mode: 'star', rainbow: true, rot: i }), alt: '' }))),
    h('div.bank-info', {}, h('b', {}, String(inv.s)), h('span', {}, '变色钉')),
    h('p', {}, `钉到画上以后点它，可以换成任何颜色。关卡里偶尔出现，每累计通关 ${S.rewardEvery} 关发 ${S.rewardN} 颗。`));
  const used = placedCount();
  $('bankNote').textContent = used ? `钉子画上还钉着 ${used} 颗，拿下来会退回仓库。` : '在钉子画里每钉一颗，就从这里扣一颗。';
}

/* ---------- 钉子画列表 ---------- */
function renderArt() {
  const ws = allWorks();
  $('artEmpty').hidden = ws.length > 0;
  if (!ws.length && !$('artEmptyPic').childElementCount) {
    $('artEmptyPic').append(...[5, 3, 0, 4, 2].map((c, i) => h('img', { src: screwIcon(COLORS[c].base, 64, { rot: i }), alt: '' })));
  }
  $('artList').replaceChildren(...ws.map((w) => {
    const c = h('canvas');
    drawThumb(c, w, 150);
    const n = w.cells.reduce((a, v) => a + (v ? 1 : 0), 0);
    return h('button.art-card', { onclick: () => { sfx.tap(); openArt(w); } },
      h('div.art-thumb', {}, c),
      h('b', {}, w.name),
      h('small', {}, `${w.w}×${w.h} · ${n} 颗`));
  }));
}
$('newArt').addEventListener('click', () => { sfx.tap(); newArtSheet((w) => { renderArt(); openArt(w); }); });
function openArt(w) {
  showTabs(false);
  openEditor(w);
}

/* ======================================================================
   闯关
   ====================================================================== */
function freshRun(n) {
  const level = makeLevel(n, { cap: S.cap, stage: S.stage, aspect: P.boardAspect(S.cap), endless: S.endless });
  run = { level, state: newState(level, S.stage) };
  saveRun();
}

function startPlay() {
  if (!run || !run.state || run.state.n !== prog.level) freshRun(prog.level);
  showTabs(false);
  $('play').hidden = false;
  heroOn(false);
  document.body.classList.remove('stuck');
  P.open(run.state);
  firstHints();
}

function leavePlay() {
  if (run) saveRun();
  P.close();
  P.hideHint();
  $('play').hidden = true;
  hideCard();
  document.body.classList.remove('stuck');
  showTabs(true);
  setTab('home');
}
$('backBtn').addEventListener('click', () => { sfx.tap(); leavePlay(); });
$('restartBtn').addEventListener('click', () => {
  const s = P.state();
  if (!s) return;
  if (s.removed === 0) return;
  card({
    title: `重来第 ${s.n} 关？`,
    meta: '已经收进仓库的螺丝不会扣回去。',
    main: ['重来', () => restart()], alt: ['继续玩', null],
  });
});
function restart() {
  run.state = newState(run.level, S.stage);
  saveRun();
  document.body.classList.remove('stuck');
  P.open(run.state);
}

$('skAdd').addEventListener('click', () => P.skill('add'));
$('skClear').addEventListener('click', () => P.skill('clear'));
$('skMelt').addEventListener('click', () => P.skill('melt'));

P.setHaptic((ms) => hb.haptic(ms));
P.setup({
  settings: S,
  hooks: {
    onChange(s, delta) {
      inv.c = inv.c.map((v, i) => v + delta.c[i]);
      inv.s += delta.s;
      saveInv();
      saveRun();
      const got = delta.c.reduce((a, b) => a + b, 0) + delta.s;
      const st = stats();
      if (got) { st.collected = (st.collected || 0) + got; }
      if (delta.s) st.specials = (st.specials || 0) + delta.s;
      hb.saveStats(st);
      document.body.classList.remove('stuck');
    },
    onWin(s) { win(s); },
    onStuck() { stuck(); },
    toast: (m) => toast(m),
    onTapped(sc) {
      if (!flags.lockTip && P.lockedVisibleScrew()) {
        flags.lockTip = 1; saveFlags();
        setTimeout(() => toast('灰色的螺丝被上面的玻璃压着，先把上面那块拆掉', 3200), 500);
      }
      if (!flags.spTip && sc.c === -1) {
        flags.spTip = 1; saveFlags();
        setTimeout(() => toast('拿到一颗变色钉！它直接进仓库，钉子画里能换成任何颜色', 3400), 400);
      }
    },
    onLockedTap() {
      if (!flags.lockTip2) { flags.lockTip2 = 1; saveFlags(); toast('这颗被描红的那块玻璃压着，先把它拆掉', 2600); }
    },
  },
});

function firstHints() {
  if (!flags.tapTip) {
    const sc = P.hintScrew();
    if (sc) {
      P.showHint('点一颗螺丝，把它拧下来', { screw: sc.id });
      flags.tapTip = 1; saveFlags();
    }
  }
}

function stuck() {
  if (cardOpen()) return;
  document.body.classList.add('stuck');
  const btn = (id, label) => `<button class="stuck-sk" data-sk="${id}">${$(id).querySelector('svg').outerHTML}<span>${label}</span></button>`;
  card({
    title: '卡住了',
    meta: `工具箱和暂存格都满了，能拧的螺丝放不下。<br>用个技能解围吧，不限次数：<div class="stuck-row">${btn('skAdd', '加孔位')}${btn('skClear', '清空孔位')}${btn('skMelt', '熔玻璃')}</div>`,
    alt: ['重来本关', () => restart()], main: ['先看看', null],
    cls: 'stuck-card',
  });
  $('cardMeta').querySelectorAll('.stuck-sk').forEach((b) => {
    if ($(b.dataset.sk).classList.contains('off')) b.classList.add('off');
    b.onclick = () => { hideCard(); $(b.dataset.sk).click(); };
  });
}

function win(s) {
  const n = s.n;
  prog.cleared++;
  prog.level = n + 1;
  run = null;
  saveRun(); saveProg();
  const st = bump('played');
  st.level = prog.level; st.cleared = prog.cleared;
  st.bestLevel = Math.max(st.bestLevel || 0, n);
  hb.saveStats(st);
  const got = s.got.c.reduce((a, b) => a + b, 0) + s.got.s;
  const chips = s.got.c.map((v, i) => (v ? `<span class="chip-mini"><img src="${screwIcon(COLORS[i].base, 36)}" alt="">${v}</span>` : '')).join('')
    + (s.got.s ? `<span class="chip-mini"><img src="${screwIcon(SPECIAL[1], 36, { mode: 'star', rainbow: true })}" alt="">${s.got.s}</span>` : '');
  const every = S.rewardEvery;
  const showWin = () => card({
    title: `第 ${n} 关完成`,
    big: `+${got}`,
    meta: `<div class="chips">${chips}</div><div class="win-line">累计通关 <b>${prog.cleared}</b> 关 · 再过 ${every - (prog.cleared % every)} 关领变色钉</div>`,
    main: ['下一关', () => startPlay()], alt: ['回首页', () => leavePlay()],
    cls: 'win-card',
  });
  if (prog.cleared % every === 0) {
    inv.s += S.rewardN;
    prog.rewards++;
    saveInv(); saveProg();
    const st2 = stats(); st2.specials = (st2.specials || 0) + S.rewardN; hb.saveStats(st2);
    setTimeout(() => {
      sfx.reward();
      card({
        title: `成就达成 · 累计通关 ${prog.cleared} 关`,
        big: `<span class="reward-big"><img src="${screwIcon(SPECIAL[0], 80, { mode: 'star', rainbow: true })}" alt=""><img src="${screwIcon(SPECIAL[1], 80, { mode: 'star', rainbow: true, rot: 1 })}" alt=""><img src="${screwIcon(SPECIAL[2], 80, { mode: 'star', rainbow: true, rot: 2 })}" alt="">+${S.rewardN}</span>`,
        meta: '一批变色钉已经放进仓库。钉到画上以后点它，想要什么颜色就是什么颜色。',
        main: ['收下', showWin],
        cls: 'reward-card',
      });
    }, 250);
  } else showWin();
}

/* ======================================================================
   和大厅的联动
   ====================================================================== */
hb.onSettings((next) => {
  S = next;
  sound.enabled = S.sound;
  P.setSettings(S);
  if (tab === 'home') renderHome();
  if (tab === 'bank') renderBank();
});
const isPlaying = () => !$('play').hidden;
hb.onPause(() => {
  if (isPlaying()) { if (run) saveRun(); P.pause(); }
  if (editorOpen()) pauseEditor();
});
hb.onResume(() => {
  if (isPlaying()) P.resume();
  if (editorOpen()) resumeEditor();
  if (!isPlaying() && !editorOpen() && tab === 'home') renderHome();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { if (isPlaying()) { if (run) saveRun(); P.pause(); } if (editorOpen()) pauseEditor(); }
  else { if (isPlaying()) P.resume(); if (editorOpen()) resumeEditor(); }
});
let rzT = 0;
window.addEventListener('resize', () => {
  clearTimeout(rzT);
  rzT = setTimeout(() => {
    if (isPlaying()) P.relayout();
    if (editorOpen()) refreshEditor();
    if (tab === 'home' && !isPlaying()) drawHero();
  }, 80);
});

setTab('home');
syncStats();

// 方便自动测试
window.__screw = {
  get inv() { return inv; }, get prog() { return prog; }, get run() { return run; }, P, S: () => S,
  startPlay, leavePlay, restart, setTab, renderBank, renderArt, closeEditor,
  setLevel(n) { prog.level = n; run = null; saveProg(); saveRun(); renderHome(); },
  give(n = 50, sp = 20) { inv.c = inv.c.map((v) => v + n); inv.s += sp; saveInv(); renderBank(); renderHome(); },
  sheetOpen, closeSheet,
};
