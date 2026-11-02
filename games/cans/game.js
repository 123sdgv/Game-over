// 打罐子：后院的木板、树桩、油桶上叠着易拉罐，用玩具左轮把它们全打下去。
//   按住屏幕出准星（在手指上方一点），拖到想打的地方，松手开枪。
//   罐子掉到台面以下就算打下去了；全部打下去过关，用的子弹越少星越多（三星发数是机器人试打出来的）。
//   轻松模式：子弹不限。挑战模式：每关只有「三星发数 + 设置里多给的几发」，打光了台上还有罐子就重来。
//   红罐子打中会爆炸，周围的一起掀飞（旁边的红罐子也会连着炸）；金罐子打下去送一发子弹。
import { hub } from '../_shared/hub.js';
import { sound } from '../_shared/sound.js';
import { level, downY } from './levels.js';
import { loadAmmo, Physics } from './physics.js';
import { buildArt, warmArt } from './art.js';
import { Scene } from './scene.js';

const hb = hub('cans');
const $ = (id) => document.getElementById(id);
let cfg = hb.settings();
sound.enabled = cfg.sound;

await loadAmmo();
const art = buildArt();
const scene = new Scene($('cv'), art);
const phys = new Physics();
scene.setLowPower(cfg.lowPower);
window.addEventListener('resize', () => scene.resize());

/* ======================================================================
   状态
   ====================================================================== */
const MODE_NAME = { easy: '轻松', hard: '挑战' };
const R = {
  phase: 'menu',          // menu | intro | play | clear | fail
  paused: false,
  mode: 'easy', level: 1, spec: null, cans: 0, dy: 0,
  shots: 0, refunds: 0, bullets: 0, maxBullets: 0,
  down: new Set(), exploded: new Set(),
  shotDown: 0, bestShot: 0, comboT: 9, booms: 0,
  sinceShot: 99, quiet: 0, dirty: false,
  slowT: 0, timeScale: 1, timers: [], endT: 0, lastKnock: 0, clock: 0,
};
const used = () => Math.max(0, R.shots - R.refunds);
const starsFor = (u, par) => (u <= par ? 3 : u <= par + 2 ? 2 : 1);
const left = () => R.cans - [...R.down].filter((i) => R.spec.items[i].k === 'can').length;

function progress() {
  const p = hb.load('prog', null) || {};
  for (const m of ['easy', 'hard']) {
    p[m] = p[m] || {};
    p[m].level = Math.max(1, p[m].level || 1);
    p[m].stars = p[m].stars || {};
  }
  return p;
}
const totalStars = (p, m) => Object.values(p[m].stars).reduce((a, b) => a + b, 0);

/* ======================================================================
   声音
   ====================================================================== */
const rnd = (a, b) => a + Math.random() * (b - a);
const sfx = {
  cock() {
    sound.tone({ f: 2300, dur: 0.025, type: 'triangle', vol: 0.05 });
    sound.tone({ f: 1500, dur: 0.03, type: 'square', vol: 0.025, delay: 0.035 });
  },
  shot() {
    sound.hiss({ f: 2200, to: 520, dur: 0.16, q: 0.7, vol: 0.55 });
    sound.tone({ f: 170, to: 48, dur: 0.2, vol: 0.42 });
    sound.hiss({ f: 1000, to: 180, dur: 0.38, filter: 'lowpass', vol: 0.26 });
    sound.hiss({ f: 1300, to: 500, dur: 0.3, q: 0.8, vol: 0.07, delay: 0.15 });
  },
  dry() {
    sound.tone({ f: 2600, dur: 0.015, type: 'square', vol: 0.05 });
    sound.tone({ f: 1700, dur: 0.02, type: 'triangle', vol: 0.05, delay: 0.04 });
  },
  ping() {
    const f = rnd(1800, 2400);
    sound.tone({ f, dur: 0.14, type: 'triangle', vol: 0.13 });
    sound.tone({ f: f * 1.53, dur: 0.11, vol: 0.07 });
    sound.tone({ f: f * 2.41, dur: 0.07, vol: 0.045 });
    sound.hiss({ f: 6000, dur: 0.05, filter: 'highpass', vol: 0.12 });
  },
  fizz() { sound.hiss({ f: 4200, to: 8000, dur: 0.75, filter: 'highpass', vol: 0.07, attack: 0.04, delay: 0.03 }); },
  clank(s) {
    const v = Math.min(0.13, 0.012 + s * 0.006);
    const f = rnd(650, 1500);
    sound.tone({ f, dur: 0.07, type: 'triangle', vol: v });
    sound.tone({ f: f * 1.37, dur: 0.05, vol: v * 0.6 });
  },
  thud(s) {
    const v = Math.min(0.2, 0.02 + s * 0.008);
    sound.tone({ f: rnd(110, 140), to: 60, dur: 0.11, vol: v });
    sound.hiss({ f: 600, to: 200, dur: 0.08, filter: 'lowpass', vol: v * 0.6 });
    sound.tone({ f: rnd(900, 1300), dur: 0.05, type: 'triangle', vol: v * 0.25 });
  },
  wood() {
    sound.tone({ f: 320, to: 170, dur: 0.07, type: 'triangle', vol: 0.12 });
    sound.hiss({ f: 1600, dur: 0.06, q: 1.2, vol: 0.12 });
  },
  dirt() { sound.hiss({ f: 900, to: 250, dur: 0.14, filter: 'lowpass', vol: 0.16 }); },
  boom() {
    sound.tone({ f: 95, to: 26, dur: 0.95, vol: 0.6 });
    sound.hiss({ f: 3200, to: 110, dur: 1.15, filter: 'lowpass', vol: 0.55 });
    sound.hiss({ f: 650, dur: 0.4, q: 0.8, vol: 0.25 });
    for (let i = 0; i < 7; i++) sound.hiss({ f: rnd(3000, 7000), dur: 0.04, filter: 'highpass', vol: 0.08, delay: 0.08 + i * rnd(0.04, 0.09) });
  },
  gold() { sound.arp([1568, 2093, 2637, 3136], { gap: 0.06, dur: 0.22, type: 'triangle', vol: 0.09 }); },
  count(n) {
    const f = 520 * Math.pow(2, (Math.min(n, 14) * 2) / 12);
    sound.tone({ f, dur: 0.09, type: 'triangle', vol: 0.05 });
  },
  pop(k) { sound.tone({ f: 700 + k * 35, dur: 0.05, vol: 0.025 }); },
  win() {
    sound.arp([523, 659, 784, 1047, 1319], { gap: 0.08, dur: 0.26, type: 'triangle', vol: 0.11 });
    sound.arp([2093, 2637, 3136], { gap: 0.05, dur: 0.15, vol: 0.04, delay: 0.42 });
  },
  star(k) { sound.tone({ f: 880 * Math.pow(1.26, k), dur: 0.2, type: 'triangle', vol: 0.1 }); sound.tone({ f: 1760 * Math.pow(1.26, k), dur: 0.12, vol: 0.04 }); },
  fail() {
    sound.tone({ f: 330, to: 220, dur: 0.25, type: 'triangle', vol: 0.1 });
    sound.tone({ f: 247, to: 160, dur: 0.35, type: 'triangle', vol: 0.1, delay: 0.2 });
  },
  click() { sound.tone({ f: 900, dur: 0.04, type: 'triangle', vol: 0.05 }); },
};
let popK = 0;
scene.onPop = () => { if (R.phase !== 'menu') sfx.pop(popK++); };

/* ======================================================================
   开一关
   ====================================================================== */
function setupLevel(mode, n) {
  R.mode = mode;
  R.level = n;
  const spec = (R.spec = level(n));
  phys.build(spec);
  scene.build(spec);
  popK = 0;
  Object.assign(R, {
    cans: spec.items.filter((it) => it.k === 'can').length, dy: downY(spec),
    shots: 0, refunds: 0, down: new Set(), exploded: new Set(), shotDown: 0, bestShot: 0, comboT: 9, booms: 0,
    sinceShot: 99, quiet: 0, dirty: false, slowT: 0, timeScale: 1, timers: [], endT: 0,
  });
  R.maxBullets = mode === 'hard' ? spec.par + cfg.extra : 0;
  R.bullets = R.maxBullets;
  shown = {};
}

function startLevel(mode, n) {
  hideCard();
  setupLevel(mode, n);
  R.phase = 'intro';
  R.paused = false;
  enterPlay();
  const sub = mode === 'hard'
    ? `${R.maxBullets} 发子弹 · 三星要 ${R.spec.par} 发以内`
    : `三星：${R.spec.par} 发以内打完`;
  banner(`第 ${n} 关`, sub);
}

/** 读档：摆好那一关，再把每个罐子挪回存的位置 */
function resumeRun(run) {
  hideCard();
  setupLevel(run.mode, run.level);
  phys.restore(run.snap);
  scene.skipIntro();
  Object.assign(R, { shots: run.shots, refunds: run.refunds || 0, bestShot: run.best || 0, booms: run.booms || 0 });
  if (run.mode === 'hard') { R.maxBullets = run.maxBullets; R.bullets = run.bullets; }
  R.down = new Set(run.down || []);
  for (const i of R.down) if (phys.items[i]) phys.items[i].down = true;
  R.exploded = new Set(run.exploded || []);
  R.phase = 'play';
  R.paused = false;
  enterPlay();
  banner(`第 ${run.level} 关`, '接着打');
}

function enterPlay() {
  document.body.classList.remove('menu-on');
  document.body.classList.toggle('hard', R.mode === 'hard');
  $('menu').hidden = true;
  $('tip').hidden = !!hb.load('tip', 0);
  ui();
}

/** 换场景时黑一下 */
let fading = false;
function go(fn) {
  if (fading) return;
  fading = true;
  $('fade').classList.add('on');
  setTimeout(() => {
    fn();
    requestAnimationFrame(() => { $('fade').classList.remove('on'); fading = false; });
  }, 300);
}

/* ======================================================================
   操作：按住出准星，松手开枪
   ====================================================================== */
const cv = $('cv');
let touch = null;
const crossPos = () => {
  const x = Math.min(window.innerWidth - 4, Math.max(4, touch.x));
  const y = Math.min(window.innerHeight - 4, Math.max(4, touch.y - cfg.cross));
  return { x, y };
};
const cancelZone = () => touch && touch.y > window.innerHeight - 92;
const canAim = () => R.phase === 'play' && !R.paused && !fading;

cv.addEventListener('pointerdown', (e) => {
  if (!canAim() || touch) return;
  try { cv.setPointerCapture(e.pointerId); } catch {}
  touch = { id: e.pointerId, x: e.clientX, y: e.clientY };
  if (R.mode === 'hard' && R.bullets <= 0) { sfx.dry(); return; }
  sfx.cock();
  hb.haptic(4);
});
cv.addEventListener('pointermove', (e) => {
  if (!touch || touch.id !== e.pointerId) return;
  touch.x = e.clientX; touch.y = e.clientY;
});
cv.addEventListener('pointerup', (e) => {
  if (!touch || touch.id !== e.pointerId) return;
  const c = crossPos();
  const cancel = cancelZone();
  touch = null;
  if (!cancel && canAim()) fire(c.x, c.y);
});
cv.addEventListener('pointercancel', (e) => { if (touch && touch.id === e.pointerId) touch = null; });
window.addEventListener('keydown', (e) => { if (e.key === 'Escape') pause(); });

/** 开枪：先用射线找到准星指着的地方，子弹从那前面一点出发（飞行时间几乎为零，但有真实的冲量） */
function fire(x, y) {
  if (R.mode === 'hard' && R.bullets <= 0) {
    sfx.dry();
    const s = $('shells'); s.classList.remove('shake'); void s.offsetWidth; s.classList.add('shake');
    return;
  }
  const ray = scene.screenRay(x, y);
  const o = ray.origin.toArray(), d = ray.dir.toArray();
  const L = 160;
  const far = o.map((v, i) => v + d[i] * L);
  const hit = phys.ray(o, far);
  let target, spawn;
  if (hit) {
    target = hit.point;
    const back = Math.min(2.6, hit.frac * L - 0.4);
    spawn = target.map((v, i) => v - d[i] * back);
  } else {
    target = o.map((v, i) => v + d[i] * 70);
    spawn = o.map((v, i) => v + d[i] * 1.5);
  }
  phys.fire(spawn, d);
  scene.fire(target);
  R.shots++;
  if (R.mode === 'hard') R.bullets--;
  R.shotDown = 0;
  R.sinceShot = 0;
  R.quiet = 0;
  R.dirty = true;
  sfx.shot();
  hb.haptic(14);
  const st = hb.stats();
  st.shots = (st.shots || 0) + 1;
  hb.saveStats(st);
  if (!$('tip').hidden) { $('tip').hidden = true; hb.save('tip', 1); }
  ui();
}

/* ======================================================================
   物理事件
   ====================================================================== */
function handle(events) {
  for (const ev of events) {
    if (ev.type === 'hit') {
      const it = ev.item != null ? scene.items[ev.item] : null;
      scene.hit(ev, it);
      if (it && it.it.k === 'can') {
        sfx.ping();
        if (it.it.t === 'b') boom(ev.item);
        else if (ev.first) sfx.fizz();
      } else if (ev.ground) sfx.dirt();
      else sfx.wood();
    } else if (ev.type === 'knock') {
      if (R.clock - R.lastKnock < 0.035) continue;
      R.lastKnock = R.clock;
      if (ev.y < 1.2) { sfx.thud(ev.strength); if (ev.strength > 6) scene.dust([ev.x, ev.y, ev.z], Math.min(1.4, ev.strength / 10)); }
      else if (ev.k === 'board') sfx.wood();
      else sfx.clank(ev.strength);
    }
  }
}

/** 爆炸（delay 秒以后），旁边的红罐子跟着炸 */
function boom(i, delay = 0) {
  if (R.exploded.has(i)) return;
  R.exploded.add(i);
  const run = () => {
    const res = phys.explode(i);
    if (!res) return;
    scene.explode(res.center);
    sfx.boom();
    hb.haptic([25, 30, 45]);
    const f = $('flash'); f.classList.remove('on'); void f.offsetWidth; f.classList.add('on');
    if (cfg.slowmo) R.slowT = 1.1;
    if (!cfg.shake) scene.shake = 0;
    R.booms++;
    R.dirty = true;
    const st = hb.stats();
    st.booms = (st.booms || 0) + 1;
    hb.saveStats(st);
    for (const h of res.hits) {
      const it = R.spec.items[h.i];
      if (it.k === 'can' && it.t === 'b' && h.d < 2.8) boom(h.i, 0.1 + h.d * 0.05);
    }
  };
  if (delay) R.timers.push({ t: delay, f: run }); else run();
}

/** 掉下去的罐子 */
const P = {};
function checkDown() {
  for (let i = 0; i < R.spec.items.length; i++) {
    const it = R.spec.items[i];
    if (it.k !== 'can' || R.down.has(i)) continue;
    const pi = phys.items[i];
    let isDown = pi.gone;
    if (!isDown) {
      phys.pose(pi.b, P);
      isDown = P.y < R.dy || Math.abs(P.x) > 70 || P.z > 40 || P.z < -40;
      if (Math.hypot(P.x, P.z) > 90) phys.remove(i);
    }
    if (isDown) markDown(i, it, pi.gone ? null : [P.x, P.y, P.z]);
  }
}

function markDown(i, it, pos) {
  R.down.add(i);
  phys.items[i].down = true;
  R.shotDown++;
  R.bestShot = Math.max(R.bestShot, R.shotDown);
  R.dirty = true;
  if (R.shotDown >= 2) combo(R.shotDown);
  sfx.count(R.shotDown);
  const st = hb.stats();
  st.cans = (st.cans || 0) + 1;
  st.bestShot = Math.max(st.bestShot || 0, R.shotDown);
  hb.saveStats(st);
  if (it.t === 'g') {
    R.refunds++;
    if (R.mode === 'hard') R.bullets++;
    sfx.gold();
    const p = pos || [it.x, it.y, it.z];
    scene.sparkle(p);
    popup('+1 发', scene.project([p[0], Math.max(p[1], R.dy + 1.5), p[2]]), 'gold');
  }
  bumpLeft();
  if (left() === 0 && R.phase === 'play') win();
}

/* ======================================================================
   过关 / 没子弹
   ====================================================================== */
function win() {
  R.phase = 'clear';
  R.endT = 0;
  touch = null;
  const u = used();
  const stars = starsFor(u, R.spec.par);
  const p = progress();
  const pm = p[R.mode];
  pm.stars[R.level] = Math.max(pm.stars[R.level] || 0, stars);
  pm.level = Math.max(pm.level, R.level + 1);
  hb.save('prog', p);
  hb.save('run', null);
  const st = hb.stats();
  st.played = (st.played || 0) + 1;
  st.clears = (st.clears || 0) + 1;
  if (R.shots === 1) st.oneShot = (st.oneShot || 0) + 1;
  st.easyCleared = Math.max(st.easyCleared || 0, p.easy.level - 1);
  st.hardCleared = Math.max(st.hardCleared || 0, p.hard.level - 1);
  st.stars = totalStars(p, 'easy') + totalStars(p, 'hard');
  hb.saveStats(st);
  setTimeout(() => { scene.celebrate(); sfx.win(); }, 500);
  setTimeout(() => {
    if (R.phase !== 'clear') return;
    const title = R.shots === 1 ? '一枪清台！' : stars === 3 ? '漂亮！' : '过关啦！';
    showCard({
      title, stars,
      meta: `用了 <b>${u}</b> 发${R.refunds ? `（金罐送回 ${R.refunds} 发）` : ''} · 三星要 <b>${R.spec.par}</b> 发以内<br>一枪最多打下 <b>${R.bestShot}</b> 个${R.booms ? ` · 炸了 <b>${R.booms}</b> 次` : ''}`,
      main: ['下一关', () => go(() => startLevel(R.mode, R.level + 1))],
      alt: ['再打一次', () => go(() => startLevel(R.mode, R.level))],
    });
  }, 1500);
}

function fail() {
  R.phase = 'fail';
  touch = null;
  sfx.fail();
  hb.save('run', null);
  const st = hb.stats();
  st.played = (st.played || 0) + 1;
  hb.saveStats(st);
  const n = left();
  const red = R.spec.items.some((it, i) => it.t === 'b' && !R.exploded.has(i) && !R.down.has(i));
  setTimeout(() => {
    if (R.phase !== 'fail') return;
    showCard({
      title: '子弹打光了',
      big: `还剩 ${n} 个`,
      meta: `第 <b>${R.level}</b> 关 · 三星要 <b>${R.spec.par}</b> 发以内<br>${red ? '先打红罐子，炸一下能掀翻一大片' : '打最底下一排靠中间的，上面的会一起塌下来'}`,
      main: ['重来', () => go(() => startLevel('hard', R.level))],
      alt: ['返回', () => go(toMenu)],
    });
  }, 500);
}

/** 存档：停稳了才存（每个罐子的位置朝向都存下来） */
function saveRun() {
  if (R.phase !== 'play' || !R.spec) return;
  hb.save('run', {
    mode: R.mode, level: R.level, shots: R.shots, refunds: R.refunds, bullets: R.bullets, maxBullets: R.maxBullets,
    down: [...R.down], exploded: [...R.exploded], best: R.bestShot, booms: R.booms, snap: phys.snapshot(),
  });
  R.dirty = false;
}

/* ======================================================================
   界面
   ====================================================================== */
let shown = {};
function ui() {
  if (!R.spec) return;
  const n = left();
  $('lvName').textContent = `第 ${R.level} 关`;
  $('modeTag').textContent = MODE_NAME[R.mode];
  if (shown.left !== n) { $('canLeft').textContent = n; shown.left = n; }
  if (shown.all !== R.cans) { $('canAll').textContent = R.cans; shown.all = R.cans; }
  const key = `${R.mode}|${R.bullets}|${R.maxBullets}|${used()}`;
  if (shown.ammo !== key) {
    const sh = $('shells');
    if (R.mode === 'hard') {
      const total = Math.max(R.maxBullets, R.bullets);
      const prev = shown.bullets ?? R.bullets;
      if (total <= 10) {
        sh.innerHTML = '';
        for (let i = 0; i < total; i++) {
          const el = document.createElement('i');
          if (i >= R.bullets) el.className = 'spent';
          else if (i >= prev) el.className = 'new';
          sh.append(el);
        }
      } else sh.innerHTML = `<i></i><b>× ${R.bullets}</b>`;
      $('used').textContent = '';
      shown.bullets = R.bullets;
    } else {
      sh.innerHTML = '';
      $('used').innerHTML = `已用 <b>${used()}</b> 发`;
    }
    const s = starsFor(used(), R.spec.par);
    [...$('starsMini').children].forEach((el, i) => el.classList.toggle('off', i >= s));
    shown.ammo = key;
  }
}
function bumpLeft() { const el = $('leftPill'); el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }

function banner(big, sub) {
  const b = $('banner');
  $('bannerBig').textContent = big;
  $('bannerSub').textContent = sub || '';
  b.hidden = true; void b.offsetWidth; b.hidden = false;
  clearTimeout(banner.t);
  banner.t = setTimeout(() => { b.hidden = true; }, 1950);
}

function combo(n) {
  const el = $('combo');
  el.textContent = `一枪 ×${n}`;
  el.classList.add('on');
  el.classList.toggle('hot', n >= 4);
  el.classList.toggle('big', n >= 7);
  el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump');
  R.comboT = 0;
}

function popup(text, at, cls = '') {
  const el = document.createElement('div');
  el.className = `pop ${cls}`;
  el.textContent = text;
  el.style.left = `${at.x}px`;
  el.style.top = `${at.y}px`;
  document.body.append(el);
  setTimeout(() => el.remove(), 1100);
}

let cardActions = {};
function showCard({ title, big = '', meta = '', stars = 0, main, alt, link }) {
  $('cardTitle').textContent = title;
  $('cardBig').textContent = big;
  $('cardMeta').innerHTML = meta;
  $('cardMain').textContent = main ? main[0] : '';
  $('cardAlt').textContent = alt ? alt[0] : '';
  $('cardLink').hidden = !link;
  if (link) $('cardLink').textContent = link[0];
  cardActions = { main: main && main[1], alt: alt && alt[1], link: link && link[1] };
  const cs = $('cardStars');
  cs.hidden = !stars;
  [...cs.children].forEach((el, i) => {
    el.className = '';
    if (i < stars) {
      el.style.animationDelay = `${0.15 + i * 0.22}s`;
      el.className = 'on';
      setTimeout(() => sfx.star(i), 150 + i * 220);
    }
  });
  $('cardWrap').hidden = false;
}
function hideCard() { $('cardWrap').hidden = true; }
for (const k of ['main', 'alt', 'link']) {
  $(`card${k[0].toUpperCase()}${k.slice(1)}`).addEventListener('click', () => { const f = cardActions[k]; hideCard(); sfx.click(); if (f) f(); });
}

/* ---------- 开始界面 ---------- */
function toMenu() {
  hideCard();
  const p = progress();
  const run = hb.load('run', null);
  // 背后摆着接下来要打的那一关
  const prevLv = run ? run.level : p.easy.level;
  setupLevel(run ? run.mode : 'easy', prevLv);
  if (run && run.snap) { phys.restore(run.snap); scene.skipIntro(); }
  R.phase = 'menu';
  R.paused = false;
  touch = null;
  document.body.classList.add('menu-on');
  $('menu').hidden = false;
  $('tip').hidden = true;
  $('banner').hidden = true;
  $('easyNum').textContent = p.easy.level;
  $('hardNum').textContent = p.hard.level;
  const es = totalStars(p, 'easy'), hs = totalStars(p, 'hard');
  $('easySub').textContent = es ? `子弹不限 · ★ ${es}` : '子弹不限，慢慢打';
  $('hardSub').textContent = hs ? `子弹有限 · ★ ${hs}` : '子弹有限，打光了就重来';
  const st = hb.stats();
  const bits = [];
  if (st.cans) bits.push(`一共打下 ${st.cans} 个罐子`);
  if (st.bestShot > 1) bits.push(`一枪最多 ${st.bestShot} 个`);
  $('menuSub').textContent = bits.join(' · ');
  $('goResume').hidden = !run;
  if (run) $('resumeSub').textContent = `${MODE_NAME[run.mode]} · 第 ${run.level} 关`;
  document.body.classList.toggle('has-run', !!run);
}
$('goEasy').addEventListener('click', () => { sfx.click(); hb.save('run', null); go(() => startLevel('easy', progress().easy.level)); });
$('goHard').addEventListener('click', () => { sfx.click(); hb.save('run', null); go(() => startLevel('hard', progress().hard.level)); });
$('goResume').addEventListener('click', () => { sfx.click(); const run = hb.load('run', null); if (run) go(() => resumeRun(run)); });

/* ---------- 暂停 ---------- */
function pause() {
  if (R.paused || !(R.phase === 'play' || R.phase === 'intro')) return;
  R.paused = true;
  touch = null;
  $('combo').classList.remove('on');
  if (R.phase === 'play' && R.shots > 0) saveRun();
  showCard({
    title: '已暂停',
    big: `第 ${R.level} 关`,
    meta: `${MODE_NAME[R.mode]}模式 · 还剩 <b>${left()}</b> 个罐子${R.mode === 'hard' ? ` · <b>${R.bullets}</b> 发子弹` : ` · 已用 <b>${used()}</b> 发`}`,
    main: ['继续', () => { R.paused = false; last = performance.now(); }],
    alt: ['重来这关', () => { if (R.shots) countPlayed(); hb.save('run', null); go(() => startLevel(R.mode, R.level)); }],
    link: ['回到开始界面', () => go(toMenu)],
  });
}
function countPlayed() { const st = hb.stats(); st.played = (st.played || 0) + 1; hb.saveStats(st); }
$('pause').addEventListener('click', pause);
let away = false;
hb.onPause(() => { pause(); away = true; touch = null; });
hb.onResume(() => { away = false; last = performance.now(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); else last = performance.now(); });

hb.onSettings((next) => {
  cfg = next;
  sound.enabled = cfg.sound;
  scene.setLowPower(cfg.lowPower);
});

/* ======================================================================
   主循环
   ====================================================================== */
let last = performance.now();
let warp = 1;
function frame(t) {
  requestAnimationFrame(frame);
  const raw = Math.min(0.05, (t - last) / 1000);
  last = t;
  if (away || document.hidden) return;
  R.clock += raw;

  // 慢镜头：爆炸以后一下子慢下来，再慢慢恢复
  if (R.slowT > 0) {
    R.slowT -= raw;
    const k = Math.max(0, R.slowT) / 1.1;
    R.timeScale = 1 - 0.72 * Math.min(1, k * 1.6);
  } else R.timeScale = 1;
  const dt = R.paused ? 0 : raw * R.timeScale;

  if (!R.paused) {
    if (R.phase === 'intro' && scene.introT >= scene.introLen) R.phase = 'play';
    if (R.phase === 'play' || R.phase === 'clear' || R.phase === 'fail') {
      for (let i = R.timers.length - 1; i >= 0; i--) {
        const tm = R.timers[i];
        tm.t -= dt;
        if (tm.t <= 0) { R.timers.splice(i, 1); tm.f(); }
      }
      for (let w = 0; w < warp; w++) handle(phys.step(dt));
      if (R.phase === 'play') checkDown();
      R.sinceShot += dt;
      R.quiet = phys.quiet() ? R.quiet + dt : 0;
      if (R.phase === 'play') {
        if (R.dirty && R.quiet > 0.5 && R.sinceShot > 0.8 && !R.timers.length) saveRun();
        if (R.mode === 'hard' && R.bullets <= 0 && R.sinceShot > 1.2 && R.quiet > 0.9 && !R.timers.length && left() > 0) fail();
      }
    }
    R.comboT += raw;
    if (R.comboT > 1.4) $('combo').classList.remove('on');
  }

  // 准星
  const aim = touch && R.phase === 'play' && !R.paused ? crossPos() : null;
  const cross = $('cross');
  if (aim) {
    cross.hidden = false;
    cross.style.transform = `translate(${aim.x}px, ${aim.y}px)`;
    const off = cancelZone();
    cross.classList.toggle('off', off);
    cross.classList.toggle('lock', !off && scene.canUnder(aim.x, aim.y) >= 0);
    $('cancel').hidden = false;
    $('cancel').classList.toggle('on', off);
    $('cancel').textContent = off ? '松手取消' : '拖到这里取消';
  } else if (!cross.hidden) {
    cross.hidden = true;
    $('cancel').hidden = true;
  }

  scene.update(dt, phys, aim);
  if (!cfg.shake) scene.shake = Math.min(scene.shake, 0.05);
  scene.render();
  if (R.phase !== 'menu') ui();
}

warmArt(art);
toMenu();
$('loading').classList.add('gone');
setTimeout(() => $('loading').remove(), 500);
requestAnimationFrame(frame);

// 自动测试用
window.__cans = {
  R, scene, phys, start: startLevel, toMenu, pause, fire, level,
  /** 瞄准第 i 个东西开一枪（dy：往上/下偏多少，单位分米） */
  shootItem(i, dy = 0, dx = 0) {
    const p = {};
    phys.pose(phys.items[i].b, p);
    const s = scene.project([p.x + dx, p.y + dy, p.z]);
    fire(s.x, s.y);
    return s;
  },
  set warp(v) { warp = v; },
  get warp() { return warp; },
};
