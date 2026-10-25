// 切水果：手指划过飞起来的水果把它切开，别碰到炸弹。
//   闯关：每关有目标分，漏掉几个水果或者切到炸弹就失败；越往后水果越多、越快、炸弹越多。
//   限时：在规定时间里切得越多越好；炸弹扣 10 分；偶尔有冰冻、双倍、狂欢这几种特殊水果。
// 一刀切中 3 个以上算连切，有额外加分。
import { hub } from '../_shared/hub.js';
import { sound } from '../_shared/sound.js';
import { FRUITS, EXT, spritesFor, bombSprite, FUSE_TIP, clearSprites } from './fruits.js';

if (!CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    this.moveTo(x + r, y); this.arcTo(x + w, y, x + w, y + h, r); this.arcTo(x + w, y + h, x, y + h, r);
    this.arcTo(x, y + h, x, y, r); this.arcTo(x, y, x + w, y, r); this.closePath();
  };
}

const hb = hub('fruit');
const $ = (id) => document.getElementById(id);
const cv = $('cv'), ctx = cv.getContext('2d');
const TAU = Math.PI * 2;
const rand = (a = 1, b) => (b === undefined ? Math.random() * a : a + Math.random() * (b - a));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

let cfg = hb.settings();
sound.enabled = cfg.sound;
let mode = hb.load('mode', 'levels') === 'arcade' ? 'arcade' : 'levels';
let W = 390, H = 844, DPR = 2, R = 34, G = 900;
let wood = null;

const SPECIALS = {
  freeze: { name: '冰冻', color: '#8FDBFF', rgb: '143,219,255', dur: 5 },
  double: { name: '双倍', color: '#FFD84A', rgb: '255,216,74', dur: 7 },
  frenzy: { name: '狂欢', color: '#FF6FB0', rgb: '255,111,176', dur: 4.5 },
};
const PACE = [0.8, 0.9, 1, 1.1, 1.22];
const WEIGHTS = [0.75, 1, 0.9, 1, 1, 1, 0.85, 0.85, 1];

const sfx = {
  slice() {
    sound.hiss({ f: 6500, to: 1800, dur: 0.12, q: 0.7, vol: 0.2 });
    sound.hiss({ f: 1100, to: 260, dur: 0.14, filter: 'lowpass', vol: 0.3, delay: 0.01 });
    sound.tone({ f: rand(170, 240), to: 70, dur: 0.1, vol: 0.18, delay: 0.005 });
  },
  whoosh() { sound.hiss({ f: 1500, to: 450, dur: 0.22, q: 1.1, vol: 0.07 }); },
  toss() { sound.tone({ f: 90, to: 150, dur: 0.09, vol: 0.05 }); },
  boom() {
    sound.hiss({ f: 1600, to: 70, dur: 1.1, filter: 'lowpass', vol: 0.7, attack: 0.002 });
    sound.tone({ f: 120, to: 32, dur: 0.8, vol: 0.55 });
  },
  combo(n) { sound.arp([660, 880, 1046, 1320, 1568].slice(0, clamp(n - 1, 2, 5)), { gap: 0.06, vol: 0.15 }); },
  miss() { sound.tone({ f: 330, to: 150, dur: 0.25, type: 'square', vol: 0.06 }); },
  special(k) {
    if (k === 'freeze') { sound.tone({ f: 1800, to: 2600, dur: 0.4, vol: 0.1 }); sound.hiss({ f: 8000, to: 4000, dur: 0.5, vol: 0.08 }); }
    else if (k === 'double') sound.arp([784, 1175, 1568], { gap: 0.05, vol: 0.14 });
    else sound.arp([523, 659, 784, 988, 1175], { gap: 0.04, vol: 0.13 });
  },
  tick() { sound.tone({ f: 1100, dur: 0.05, type: 'square', vol: 0.05 }); },
  win() { sound.arp([523, 659, 784, 1046], { vol: 0.16 }); },
  lose() { sound.arp([392, 330, 262], { gap: 0.13, vol: 0.13, type: 'sine' }); },
};

/* ======================================================================
   状态
   ====================================================================== */
const S = {
  phase: 'menu', // menu / play / ending / over
  paused: false,
  score: 0, level: 1, target: 0, lives: 3, time: 60, maxTime: 60, elapsed: 0,
  objs: [], halves: [], drops: [], stains: [], flashes: [], sparks: [], texts: [], misses: [],
  queue: [], simT: 0, nextWave: 0, nextSpecial: 0, frenzyT: 0, freezeT: 0, doubleT: 0, frenzyGap: 0,
  shake: 0, white: 0, explode: null, start: null, bestCombo: 0, sliced: 0, missed: 0, lastTick: 0,
};
const pointers = new Map();
let clock = 0;

/* ======================================================================
   画布 / 案板
   ====================================================================== */
function resize() {
  W = window.innerWidth; H = window.innerHeight;
  DPR = Math.min(2, window.devicePixelRatio || 1);
  cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  R = clamp(Math.min(W, H * 0.55) * 0.088, 26, 48);
  G = H * 1.12;
  clearSprites();
  wood = makeWood();
  if (S.start) placeStart();
}
window.addEventListener('resize', resize);

function rng(seed) {
  return () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
}

function makeWood() {
  const c = document.createElement('canvas');
  c.width = Math.ceil(W * DPR); c.height = Math.ceil(H * DPR);
  const x = c.getContext('2d');
  x.scale(DPR, DPR);
  const rnd = rng(1234);
  const tones = ['#7A4A28', '#6C4122', '#835231', '#704524', '#673C1F', '#7C4D2B'];
  const ph = H / 6.4;
  let y = -rnd() * ph * 0.4, i = 0;
  while (y < H) {
    const h = ph * (0.82 + rnd() * 0.36);
    const base = tones[i % tones.length];
    const lg = x.createLinearGradient(0, y, 0, y + h);
    lg.addColorStop(0, shade(base, -0.1)); lg.addColorStop(0.45, shade(base, 0.07)); lg.addColorStop(1, shade(base, -0.14));
    x.fillStyle = lg; x.fillRect(0, y, W, h);
    x.save(); x.beginPath(); x.rect(0, y, W, h); x.clip();
    // 木纹
    for (let k = 0; k < 34; k++) {
      const gy = y + rnd() * h, amp = 0.8 + rnd() * 3.5, fr = 0.004 + rnd() * 0.012, p0 = rnd() * TAU;
      x.beginPath();
      for (let gx = -10; gx <= W + 10; gx += 6) {
        const yy = gy + Math.sin(gx * fr + p0) * amp + Math.sin(gx * fr * 3.3 + p0 * 2) * amp * 0.3;
        if (gx === -10) x.moveTo(gx, yy); else x.lineTo(gx, yy);
      }
      x.strokeStyle = rnd() < 0.62 ? `rgba(38,16,4,${0.1 + rnd() * 0.18})` : `rgba(255,214,160,${0.035 + rnd() * 0.06})`;
      x.lineWidth = 0.6 + rnd() * 1.7;
      x.stroke();
    }
    // 木节
    if (rnd() < 0.6) {
      const kx = rnd() * W, ky = y + h * (0.3 + rnd() * 0.4), s = 0.7 + rnd() * 0.6;
      for (let ring = 6; ring >= 1; ring--) {
        x.strokeStyle = `rgba(35,14,3,${0.12 + 0.04 * (6 - ring)})`; x.lineWidth = 1.2;
        x.beginPath(); x.ellipse(kx, ky, ring * 5.5 * s, ring * 2.3 * s, 0, 0, TAU); x.stroke();
      }
      x.fillStyle = 'rgba(30,10,2,.55)';
      x.beginPath(); x.ellipse(kx, ky, 5 * s, 2.4 * s, 0, 0, TAU); x.fill();
    }
    // 刀痕
    for (let k = 0; k < 4; k++) {
      const sx = rnd() * W, sy = y + rnd() * h, a = (rnd() - 0.5) * 0.8, L = 20 + rnd() * 50;
      x.strokeStyle = 'rgba(255,225,185,.07)'; x.lineWidth = 1;
      x.beginPath(); x.moveTo(sx, sy); x.lineTo(sx + Math.cos(a) * L, sy + Math.sin(a) * L); x.stroke();
    }
    x.restore();
    // 木板之间的缝
    x.fillStyle = 'rgba(18,7,1,.8)'; x.fillRect(0, y + h - 2.5, W, 3);
    x.fillStyle = 'rgba(255,220,170,.09)'; x.fillRect(0, y + h + 0.5, W, 1);
    y += h; i++;
  }
  // 中间亮、四周暗
  const vg = x.createRadialGradient(W / 2, H * 0.4, 0, W / 2, H * 0.45, Math.max(W, H) * 0.78);
  vg.addColorStop(0, 'rgba(255,205,150,.12)'); vg.addColorStop(0.5, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.62)');
  x.fillStyle = vg; x.fillRect(0, 0, W, H);
  return c;
}

function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  if (k >= 0) { r += (255 - r) * k; g += (255 - g) * k; b += (255 - b) * k; } else { r *= 1 + k; g *= 1 + k; b *= 1 + k; }
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}

/* ======================================================================
   难度
   ====================================================================== */
function levelSpec(n) {
  return {
    target: Math.min(160, 20 + (n - 1) * 6),
    gap: Math.max(0.7, 1.55 - (n - 1) * 0.06),
    maxN: Math.min(6, 2 + Math.floor((n - 1) / 2)),
    bombP: n === 1 ? 0 : Math.min(0.26, 0.06 + (n - 2) * 0.02),
    pace: Math.min(1.25, 0.92 + (n - 1) * 0.025),
  };
}
function waveParams() {
  if (mode === 'levels') return levelSpec(S.level);
  const e = clamp(S.elapsed / Math.max(30, S.maxTime), 0, 1);
  return { gap: 1.25 - 0.5 * e, maxN: 3 + Math.round(3 * e), bombP: cfg.bombs ? 0.1 + 0.07 * e : 0, pace: 1 + 0.12 * e };
}
const pace = () => PACE[clamp(cfg.speed, 1, 5) - 1] * waveParams().pace;

function pickType() {
  let sum = WEIGHTS.reduce((a, b) => a + b, 0), x = rand(sum);
  for (let i = 0; i < WEIGHTS.length; i++) { x -= WEIGHTS[i]; if (x <= 0) return i; }
  return 0;
}

/* ======================================================================
   发射
   ====================================================================== */
function launch(kind, o = {}) {
  const type = kind === 'bomb' ? -1 : (o.type ?? pickType());
  const r = kind === 'bomb' ? R * 0.95 : R * FRUITS[type].size;
  const x0 = o.x ?? W * rand(0.14, 0.86);
  const y0 = o.y ?? H + r * 1.4;
  let vx, vy;
  if (o.side) { // 狂欢：从两边飞进来
    vx = o.side * W * rand(0.55, 0.85);
    vy = -Math.sqrt(G * H) * rand(0.45, 0.75);
  } else {
    const apex = H * (o.apex ?? rand(0.15, 0.42));
    const h = y0 - apex;
    vy = -Math.sqrt(2 * G * h);
    const T = (2 * -vy) / G;
    const toward = x0 < W / 2 ? 1 : -1;
    const xEnd = clamp(x0 + toward * W * rand(0.05, 0.38) + (o.dx || 0), W * 0.08, W * 0.92);
    vx = (xEnd - x0) / T;
  }
  S.objs.push({ kind, type, r, x: x0, y: y0, vx, vy, rot: rand(TAU), vr: rand(-4, 4), special: o.special || null, dead: false, entered: false });
  if (Math.random() < 0.5) sfx.toss();
}

function wave() {
  const p = waveParams();
  let n = 1 + Math.floor(Math.pow(Math.random(), 1.25) * p.maxN);
  const pat = n >= 3 && Math.random() < 0.18 ? 'burst' : n >= 2 && Math.random() < 0.3 ? 'chain' : 'spread';
  const fromLeft = Math.random() < 0.5;
  const bx = W * rand(0.3, 0.7);
  let fruits = 0;
  for (let i = 0; i < n; i++) {
    let kind = 'fruit';
    if (p.bombP && Math.random() < p.bombP && (fruits > 0 || n === 1 && Math.random() < 0.5)) kind = 'bomb';
    if (kind === 'fruit') fruits++;
    let opts = {}, delay;
    if (pat === 'chain') {
      const t = n === 1 ? 0.5 : i / (n - 1);
      opts.x = W * (fromLeft ? 0.14 + 0.72 * t : 0.86 - 0.72 * t);
      opts.apex = rand(0.2, 0.36);
      delay = i * 0.17;
    } else if (pat === 'burst') {
      opts.x = bx + rand(-12, 12);
      opts.dx = (i - (n - 1) / 2) * W * 0.14;
      opts.apex = rand(0.16, 0.3);
      delay = 0;
    } else {
      delay = i * rand(0.04, 0.16);
    }
    S.queue.push({ at: S.simT + delay, kind, opts });
  }
  S.nextWave = S.simT + p.gap + n * 0.1;
}

/* ======================================================================
   切
   ====================================================================== */
function segDist(ax, ay, bx, by, px, py) {
  const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy || 1;
  const t = clamp(((px - ax) * dx + (py - ay) * dy) / L, 0, 1);
  return Math.hypot(ax + dx * t - px, ay + dy * t - py);
}

function sliceFruit(f, ux, uy, ptr, sx, sy) {
  f.dead = true;
  const th = Math.atan2(uy, ux);
  const nx = -Math.sin(th), ny = Math.cos(th);
  const fr = FRUITS[f.type];
  for (const side of [1, -1]) {
    const push = rand(70, 130);
    S.halves.push({
      type: f.type, r: f.r, x: f.x + nx * side * 2, y: f.y + ny * side * 2,
      vx: f.vx * 0.6 + nx * side * push + ux * 50, vy: f.vy * 0.4 + ny * side * push + uy * 50 - 40,
      rot: f.rot, vr: f.vr * 0.5 + side * rand(1.5, 3.5), phi: th - f.rot, side, t: 0,
    });
  }
  // 果汁
  for (let i = 0; i < 18; i++) {
    const a = th + (Math.random() < 0.5 ? 0 : Math.PI) + rand(-0.9, 0.9), v = rand(100, 420);
    S.drops.push({ x: f.x, y: f.y, vx: Math.cos(a) * v + f.vx * 0.3, vy: Math.sin(a) * v + f.vy * 0.2, r: f.r * rand(0.05, 0.13), color: fr.juice, t: 0, max: rand(0.45, 0.85) });
  }
  S.stains.push({ c: makeStain(fr.juice, f.r, th), x: f.x, y: f.y, size: f.r * 4.6, t: 0 });
  if (S.stains.length > 26) S.stains.shift();
  S.flashes.push({ x: f.x, y: f.y, th, len: f.r * 2.6, t: 0 });
  S.sliced++;
  sfx.slice();
  hb.haptic(6);
  if (S.phase === 'menu') return;
  const mult = S.doubleT > 0 ? 2 : 1;
  addScore(mult);
  if (ptr) { ptr.count++; ptr.lastHit = clock; ptr.lx = sx; ptr.ly = sy; }
  if (f.special) triggerSpecial(f.special, f.x, f.y);
}

function makeStain(color, r, th) {
  const size = r * 4.6;
  const c = document.createElement('canvas');
  c.width = c.height = Math.ceil(size * DPR);
  const x = c.getContext('2d');
  x.scale(DPR, DPR);
  x.translate(size / 2, size / 2);
  x.rotate(th);
  x.fillStyle = color;
  x.globalAlpha = 0.5;
  for (let i = 0; i < 6; i++) { x.beginPath(); x.arc(rand(-0.3, 0.3) * r, rand(-0.22, 0.22) * r, rand(0.32, 0.55) * r, 0, TAU); x.fill(); }
  x.beginPath(); x.ellipse(rand(-0.2, 0.2) * r, 0, r * 1.25, r * 0.16, 0, 0, TAU); x.fill();
  for (let i = 0; i < 18; i++) {
    const dir = Math.random() < 0.5 ? 1 : -1, d = rand(0.6, 2.0) * r, a = rand(-0.5, 0.5);
    x.beginPath(); x.arc(Math.cos(a) * d * dir, Math.sin(a) * d * 0.7, rand(0.035, 0.15) * r * (2.2 - d / r) / 1.6, 0, TAU); x.fill();
  }
  x.globalAlpha = 0.25;
  x.fillStyle = '#fff';
  x.beginPath(); x.arc(-0.12 * r, -0.12 * r, 0.18 * r, 0, TAU); x.fill();
  return c;
}

function hitBomb(b) {
  b.dead = true;
  sfx.boom();
  hb.haptic([40, 30, 60]);
  for (let i = 0; i < 40; i++) {
    const a = rand(TAU), v = rand(150, 650);
    S.sparks.push({ x: b.x, y: b.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, t: 0, max: rand(0.4, 0.9), size: rand(2, 5), color: Math.random() < 0.5 ? '#FFD45C' : '#FF7A2E' });
  }
  if (S.phase === 'menu') return;
  if (mode === 'arcade' || S.phase !== 'play') {
    if (mode === 'arcade' && S.phase === 'play') {
      S.score = Math.max(0, S.score - 10);
      S.texts.push({ text: '−10', x: b.x, y: b.y, t: 0, life: 1, size: 34, color: '#FF5A4A' });
      updateHud();
    }
    S.white = 0.55; S.shake = 0.4;
    return;
  }
  // 闯关：切到炸弹就失败
  S.explode = { x: b.x, y: b.y, t: 0 };
  S.shake = 0.6;
  fail('切到炸弹了');
}

function triggerSpecial(k, x, y) {
  const sp = SPECIALS[k];
  sfx.special(k);
  S.texts.push({ text: sp.name + '！', x, y: y - 20, t: 0, life: 1.2, size: 32, color: sp.color, big: true });
  if (k === 'freeze') S.freezeT = sp.dur;
  if (k === 'double') S.doubleT = sp.dur;
  if (k === 'frenzy') { S.frenzyT = sp.dur; S.frenzyGap = 0; }
}

function resolveCombo(p) {
  if (p.count >= 3 && (S.phase === 'play')) {
    const mult = S.doubleT > 0 ? 2 : 1;
    const bonus = p.count * mult;
    S.texts.push({ text: `${p.count} 连切`, sub: `+${bonus}`, x: clamp(p.lx, 70, W - 70), y: clamp(p.ly, 120, H - 120), t: 0, life: 1.2, size: 30, color: '#FFD45C', big: true });
    sfx.combo(p.count);
    S.bestCombo = Math.max(S.bestCombo, p.count);
    addScore(bonus);
  }
  p.count = 0;
}

function addScore(n) {
  S.score += n;
  updateHud(true);
  if (mode === 'levels' && S.phase === 'play' && S.score >= S.target) pass();
}

/* ======================================================================
   开始 / 结束
   ====================================================================== */
function placeStart() {
  const r = R * 1.7;
  S.start = { type: 0, x: W / 2, y: H * 0.56, r, rot: 0, t: 0, ring: 0 };
  document.documentElement.style.setProperty('--hint-y', `${H * 0.56 + r * 1.55}px`);
}

function showMenu() {
  S.st = null;
  S.phase = 'menu';
  S.objs = []; S.queue = [];
  S.explode = null; S.white = 0; S.freezeT = S.doubleT = S.frenzyT = 0;
  placeStart();
  document.body.classList.add('menu-on');
  $('menu').hidden = false;
  hideCard();
  menuText();
  updateHud();
}

function menuText() {
  document.body.classList.toggle('levels', mode === 'levels');
  $('segLevels').setAttribute('aria-checked', String(mode === 'levels'));
  $('segArcade').setAttribute('aria-checked', String(mode === 'arcade'));
  $('seg').classList.toggle('right', mode === 'arcade');
  const st = hb.stats();
  if (mode === 'levels') {
    const lv = st.level || 1;
    $('menuInfo').innerHTML = `第 ${lv} 关 · 目标 ${levelSpec(lv).target} 分<small>漏掉 ${cfg.lives} 个水果或者切到炸弹就失败</small>`;
  } else {
    $('menuInfo').innerHTML = `限时 ${cfg.time} 秒 · 最高 ${st.arcadeBest || 0} 分<small>${cfg.bombs ? '炸弹扣 10 分' : '没有炸弹'}${cfg.specials ? ' · 有冰冻、双倍、狂欢水果' : ''}</small>`;
  }
}

function startGame() {
  S.st = null;
  const st = hb.stats();
  S.phase = 'play';
  S.paused = false;
  S.score = 0; S.sliced = 0; S.missed = 0; S.bestCombo = 0;
  S.level = mode === 'levels' ? st.level || 1 : 0;
  S.target = mode === 'levels' ? levelSpec(S.level).target : 0;
  S.lives = cfg.lives;
  S.maxTime = S.time = cfg.time;
  S.elapsed = 0; S.lastTick = 0;
  S.objs = []; S.queue = []; S.misses = [];
  S.simT = 0; S.nextWave = 0.5; S.nextSpecial = rand(6, 9);
  S.freezeT = S.doubleT = S.frenzyT = 0; S.explode = null; S.white = 0;
  S.start = null;
  document.body.classList.remove('menu-on');
  $('menu').hidden = true;
  hideCard();
  buildLives();
  updateHud();
}

function pass() {
  S.phase = 'ending';
  S.texts.push({ text: '过关！', x: W / 2, y: H * 0.42, t: 0, life: 1.8, size: 56, color: '#7CF08A', big: true, hold: true });
  sfx.win();
  hb.haptic([12, 60, 12]);
  const st = hb.stats();
  st.cleared = (st.cleared || 0) + 1;
  st.level = S.level + 1;
  hb.saveStats(st);
  later(1.9, () => {
    S.phase = 'over';
    showCard({
      title: '过关了', big: `第 ${S.level} 关`,
      meta: `切了 <b>${S.sliced}</b> 个水果${S.bestCombo >= 3 ? ` · 最多 <b>${S.bestCombo}</b> 连切` : ''}`,
      main: ['下一关', startGame], alt: ['返回', showMenu],
    });
  });
}

function fail(why) {
  S.phase = 'ending';
  if (!S.explode) sfx.lose();
  hb.haptic([30, 40, 30]);
  later(S.explode ? 1.5 : 1.1, () => {
    S.phase = 'over';
    if (S.explode) sfx.lose();
    showCard({
      title: why, big: `${S.score} / ${S.target}`,
      meta: `第 ${S.level} 关 · 还差 <b>${Math.max(0, S.target - S.score)}</b> 分`,
      main: ['再试一次', startGame], alt: ['返回', showMenu],
    });
  });
}

function timeUp() {
  S.phase = 'ending';
  S.texts.push({ text: '时间到', x: W / 2, y: H * 0.42, t: 0, life: 1.8, size: 52, color: '#fff', big: true, hold: true });
  const st = hb.stats();
  const prev = st.arcadeBest || 0;
  if (S.score > prev) { st.arcadeBest = S.score; hb.saveStats(st); }
  sfx.win();
  later(2.0, () => {
    S.phase = 'over';
    showCard({
      title: S.score > prev && prev > 0 ? '新纪录！' : '时间到', big: `${S.score}`,
      meta: `切了 <b>${S.sliced}</b> 个 · 最高 <b>${Math.max(prev, S.score)}</b> 分${S.bestCombo >= 3 ? ` · 最多 ${S.bestCombo} 连切` : ''}`,
      main: ['再来一局', startGame], alt: ['返回', showMenu],
    });
  });
}

const timers = [];
function later(sec, fn) { timers.push({ at: clock + sec, fn }); }

/* ======================================================================
   卡片 / HUD
   ====================================================================== */
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

function buildLives() {
  $('lives').replaceChildren(...Array.from({ length: cfg.lives }, () => document.createElement('i')));
}

let lastScore = -1;
function updateHud(bump) {
  const sc = $('scoreBox');
  if (lastScore !== S.score) {
    sc.querySelector('span').textContent = S.score;
    if (bump) { sc.classList.remove('bump'); void sc.offsetWidth; sc.classList.add('bump'); }
    lastScore = S.score;
  }
  const st = S.st || (S.st = hb.stats());
  if (mode === 'levels') {
    $('best').textContent = S.phase === 'menu' ? `最高到第 ${st.level || 1} 关` : `第 ${S.level} 关`;
    $('goal').hidden = S.phase === 'menu';
    $('goalText').textContent = `目标 ${S.target}`;
    $('meter').style.width = `${S.target ? Math.min(100, (S.score / S.target) * 100) : 0}%`;
    const lost = cfg.lives - S.lives;
    [...$('lives').children].forEach((el, i) => el.classList.toggle('lost', i < lost));
  } else {
    $('best').textContent = `最高 ${Math.max(st.arcadeBest || 0, S.score)}`;
    const t = Math.max(0, Math.ceil(S.time));
    $('timer').textContent = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
    $('timer').classList.toggle('low', S.time <= 5 && S.phase === 'play');
    $('timer').classList.toggle('frozen', S.freezeT > 0);
  }
  const fx = [];
  for (const [k, v] of [['freeze', S.freezeT], ['double', S.doubleT], ['frenzy', S.frenzyT]]) {
    if (v > 0) fx.push(`<span style="--c:${SPECIALS[k].color}">${SPECIALS[k].name} ${Math.ceil(v)}</span>`);
  }
  const html = fx.join('');
  if ($('fx').innerHTML !== html) $('fx').innerHTML = html;
}

/* ======================================================================
   更新
   ====================================================================== */
function update(dt) {
  clock += dt;
  if (timers.length) {
    const due = timers.filter((t) => t.at <= clock);
    for (const t of due) timers.splice(timers.indexOf(t), 1);
    due.forEach((t) => t.fn());
  }
  const frozenSim = S.explode && S.explode.t < 1.3;
  const slow = S.freezeT > 0 ? 0.4 : 1;
  const sdt = frozenSim ? 0 : dt * pace() * slow;
  S.simT += sdt;

  if (S.phase === 'play') {
    S.elapsed += dt;
    if (mode === 'arcade') {
      if (S.freezeT <= 0) S.time -= dt;
      const sec = Math.ceil(S.time);
      if (S.time <= 5 && sec !== S.lastTick && sec > 0) { S.lastTick = sec; sfx.tick(); }
      if (S.time <= 0) { S.time = 0; timeUp(); }
    }
    // 出水果
    if (S.simT >= S.nextWave && S.frenzyT <= 0) wave();
    if (mode === 'arcade' && cfg.specials && S.simT >= S.nextSpecial) {
      const ks = Object.keys(SPECIALS);
      launch('fruit', { special: ks[Math.floor(rand(ks.length))], apex: rand(0.2, 0.32) });
      S.nextSpecial = S.simT + rand(9, 13);
    }
    if (S.frenzyT > 0) {
      S.frenzyGap -= sdt;
      if (S.frenzyGap <= 0) {
        const side = Math.random() < 0.5 ? 1 : -1;
        launch('fruit', { side, x: side > 0 ? -R : W + R, y: H * rand(0.45, 0.8) });
        S.frenzyGap = 0.13;
      }
    }
  }
  for (const q of S.queue.filter((q) => q.at <= S.simT)) launch(q.kind, q.opts);
  S.queue = S.queue.filter((q) => q.at > S.simT);
  for (const k of ['freezeT', 'doubleT', 'frenzyT']) if (S[k] > 0) S[k] = Math.max(0, S[k] - dt);

  // 物体
  for (const o of S.objs) {
    o.vy += G * sdt; o.x += o.vx * sdt; o.y += o.vy * sdt; o.rot += o.vr * sdt;
    if (o.y < H) o.entered = true;
    if (!o.dead && o.entered && o.vy > 0 && o.y - o.r * 1.6 > H) {
      o.dead = true;
      if (o.kind === 'fruit' && mode === 'levels' && S.phase === 'play') {
        S.lives--; S.missed++;
        S.misses.push({ x: clamp(o.x, 30, W - 30), t: 0 });
        sfx.miss();
        hb.haptic(20);
        updateHud();
        if (S.lives <= 0) fail(`漏掉了 ${cfg.lives} 个`);
      }
    }
    if (!o.dead && (o.x < -o.r * 3 || o.x > W + o.r * 3) && o.vy > 0) o.dead = true;
  }
  S.objs = S.objs.filter((o) => !o.dead);
  for (const h of S.halves) { h.t += dt; h.vy += G * sdt; h.x += h.vx * sdt; h.y += h.vy * sdt; h.rot += h.vr * sdt; }
  S.halves = S.halves.filter((h) => h.y - h.r * 2 < H);
  for (const d of S.drops) { d.t += dt; d.vy += G * 0.9 * dt; d.x += d.vx * dt; d.y += d.vy * dt; }
  S.drops = S.drops.filter((d) => d.t < d.max);
  for (const s of S.sparks) { s.t += dt; s.vy += 500 * dt; s.x += s.vx * dt; s.y += s.vy * dt; s.vx *= 0.98; }
  S.sparks = S.sparks.filter((s) => s.t < s.max);
  for (const s of S.stains) s.t += dt;
  S.stains = S.stains.filter((s) => s.t < 4.6);
  for (const f of S.flashes) f.t += dt;
  S.flashes = S.flashes.filter((f) => f.t < 0.2);
  for (const t of S.texts) t.t += dt;
  S.texts = S.texts.filter((t) => t.t < t.life);
  for (const m of S.misses) m.t += dt;
  S.misses = S.misses.filter((m) => m.t < 1.2);
  if (S.explode) S.explode.t += dt;
  S.shake = Math.max(0, S.shake - dt);
  S.white = Math.max(0, S.white - dt * 1.6);
  if (S.start) { S.start.t += dt; S.start.rot += dt * 0.6; S.start.ring += dt * 0.5; }
  // 一刀结束了吗
  for (const p of pointers.values()) if (p.count && clock - p.lastHit > 0.22) resolveCombo(p);
  for (const [id, p] of pointers) {
    if (!p.down && clock - p.upAt > 0.2) pointers.delete(id);
  }
  if (S.phase === 'play' || S.freezeT || S.doubleT || S.frenzyT) updateHud();
}

/* ======================================================================
   绘制
   ====================================================================== */
function drawSprite(img, x, y, rot, r) {
  const e = EXT * r;
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
  ctx.drawImage(img, -e, -e, 2 * e, 2 * e);
  ctx.restore();
}

function drawHalf(h) {
  const sp = spritesFor(h.type, h.r, DPR), e = EXT * h.r;
  ctx.save();
  ctx.translate(h.x, h.y); ctx.rotate(h.rot + h.phi);
  ctx.beginPath(); ctx.rect(-e, h.side > 0 ? 0 : -e, 2 * e, e); ctx.clip();
  ctx.save(); ctx.translate(0, h.side * h.r * 0.12); ctx.rotate(-h.phi); ctx.drawImage(sp.skin, -e, -e, 2 * e, 2 * e); ctx.restore();
  ctx.rotate(-h.phi); ctx.drawImage(sp.flesh, -e, -e, 2 * e, 2 * e);
  ctx.restore();
}

function drawBomb(b) {
  // 红色的警告光
  const pulse = 0.5 + 0.5 * Math.sin(clock * 10);
  const g = ctx.createRadialGradient(b.x, b.y, b.r * 0.5, b.x, b.y, b.r * 1.6);
  g.addColorStop(0, `rgba(255,40,30,${0.35 + 0.2 * pulse})`); g.addColorStop(1, 'rgba(255,40,30,0)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(b.x, b.y, b.r * 1.6, 0, TAU); ctx.fill();
  drawSprite(bombSprite(b.r, DPR), b.x, b.y, b.rot, b.r);
  // 引线火花
  const c = Math.cos(b.rot), s = Math.sin(b.rot);
  const fx = b.x + (FUSE_TIP[0] * c - FUSE_TIP[1] * s) * b.r, fy = b.y + (FUSE_TIP[0] * s + FUSE_TIP[1] * c) * b.r;
  const fl = 0.7 + Math.random() * 0.5;
  const sg = ctx.createRadialGradient(fx, fy, 0, fx, fy, b.r * 0.5 * fl);
  sg.addColorStop(0, 'rgba(255,255,230,1)'); sg.addColorStop(0.3, 'rgba(255,210,80,.9)'); sg.addColorStop(1, 'rgba(255,120,20,0)');
  ctx.fillStyle = sg;
  ctx.beginPath(); ctx.arc(fx, fy, b.r * 0.5 * fl, 0, TAU); ctx.fill();
  ctx.strokeStyle = 'rgba(255,230,140,.9)'; ctx.lineWidth = 1.4;
  for (let i = 0; i < 5; i++) {
    const a = rand(TAU), L = b.r * rand(0.25, 0.55);
    ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(fx + Math.cos(a) * L, fy + Math.sin(a) * L); ctx.stroke();
  }
}

function drawSpecialAura(f) {
  const sp = SPECIALS[f.special];
  const pulse = 0.5 + 0.5 * Math.sin(clock * 7);
  const g = ctx.createRadialGradient(f.x, f.y, f.r * 0.7, f.x, f.y, f.r * 1.7);
  g.addColorStop(0, `rgba(${sp.rgb},${0.55 + 0.25 * pulse})`); g.addColorStop(1, `rgba(${sp.rgb},0)`);
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(f.x, f.y, f.r * 1.7, 0, TAU); ctx.fill();
  ctx.save();
  ctx.translate(f.x, f.y); ctx.rotate(clock * 2);
  ctx.strokeStyle = `rgba(${sp.rgb},.9)`; ctx.lineWidth = 3; ctx.setLineDash([6, 7]);
  ctx.beginPath(); ctx.arc(0, 0, f.r * 1.3, 0, TAU); ctx.stroke();
  ctx.restore();
}

function drawTrails() {
  const now = performance.now();
  for (const p of pointers.values()) {
    const pts = p.pts.filter((q) => now - q.t < 110);
    p.pts = pts.length ? pts : p.pts.slice(-1);
    if (pts.length < 2) continue;
    for (const [wMul, fill] of [[2.4, 'rgba(160,210,255,.28)'], [1, '#FFFFFF']]) {
      const left = [], right = [];
      const n = pts.length;
      for (let i = 0; i < n; i++) {
        const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
        let dx = b.x - a.x, dy = b.y - a.y; const L = Math.hypot(dx, dy) || 1; dx /= L; dy /= L;
        const w = 5.5 * wMul * Math.pow(i / (n - 1), 0.85);
        left.push([pts[i].x - dy * w, pts[i].y + dx * w]);
        right.push([pts[i].x + dy * w, pts[i].y - dx * w]);
      }
      ctx.beginPath();
      left.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      for (let i = right.length - 1; i >= 0; i--) ctx.lineTo(right[i][0], right[i][1]);
      ctx.closePath();
      ctx.fillStyle = fill;
      if (wMul > 1) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fill(); ctx.restore(); } else ctx.fill();
      const head = pts[n - 1];
      ctx.beginPath(); ctx.arc(head.x, head.y, 5.5 * wMul, 0, TAU); ctx.fill();
    }
  }
}

function drawText(t) {
  const k = t.t / t.life;
  const a = t.t < 0.1 ? t.t / 0.1 : k > 0.72 ? Math.max(0, 1 - (k - 0.72) / 0.28) : 1;
  const s = t.big ? 1 + 0.4 * Math.max(0, 1 - t.t * 6) : 1;
  ctx.save();
  ctx.globalAlpha = a;
  ctx.translate(t.x, t.y - (t.hold ? 0 : t.t * 40));
  ctx.scale(s, s);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
  ctx.font = `900 ${t.size}px -apple-system, "PingFang SC", sans-serif`;
  ctx.lineWidth = Math.max(5, t.size * 0.22); ctx.strokeStyle = 'rgba(70,25,0,.9)';
  ctx.strokeText(t.text, 0, 0);
  ctx.fillStyle = t.color; ctx.fillText(t.text, 0, 0);
  if (t.sub) {
    ctx.font = `900 ${t.size * 0.7}px -apple-system, "PingFang SC", sans-serif`;
    ctx.strokeText(t.sub, 0, t.size * 0.9); ctx.fillStyle = '#fff'; ctx.fillText(t.sub, 0, t.size * 0.9);
  }
  ctx.restore();
}

function draw() {
  ctx.save();
  if (S.shake > 0) ctx.translate(rand(-1, 1) * S.shake * 18, rand(-1, 1) * S.shake * 18);
  if (wood) ctx.drawImage(wood, -10, -10, W + 20, H + 20);
  // 果汁印子
  for (const s of S.stains) {
    ctx.globalAlpha = s.t < 2.2 ? 1 : Math.max(0, 1 - (s.t - 2.2) / 2.4);
    ctx.drawImage(s.c, s.x - s.size / 2, s.y - s.size / 2, s.size, s.size);
  }
  ctx.globalAlpha = 1;
  for (const h of S.halves) drawHalf(h);
  // 开始用的那颗西瓜
  if (S.start) {
    const st = S.start, bob = Math.sin(st.t * 2) * 6;
    ctx.save();
    ctx.translate(st.x, st.y + bob); ctx.rotate(st.ring);
    ctx.strokeStyle = 'rgba(255,240,210,.55)'; ctx.lineWidth = 3; ctx.setLineDash([10, 9]);
    ctx.beginPath(); ctx.arc(0, 0, st.r * 1.45, 0, TAU); ctx.stroke();
    ctx.rotate(-st.ring * 2); ctx.setLineDash([3, 12]); ctx.strokeStyle = 'rgba(255,200,120,.45)';
    ctx.beginPath(); ctx.arc(0, 0, st.r * 1.62, 0, TAU); ctx.stroke();
    ctx.restore();
    drawSprite(spritesFor(st.type, st.r, DPR).skin, st.x, st.y + bob, Math.sin(st.t) * 0.25, st.r);
  }
  for (const o of S.objs) {
    if (o.kind === 'bomb') drawBomb(o);
    else {
      if (o.special) drawSpecialAura(o);
      drawSprite(spritesFor(o.type, o.r, DPR).skin, o.x, o.y, o.rot, o.r);
    }
  }
  for (const d of S.drops) {
    ctx.globalAlpha = Math.max(0, 1 - d.t / d.max);
    ctx.fillStyle = d.color;
    ctx.beginPath(); ctx.arc(d.x, d.y, d.r * (1 - 0.4 * d.t / d.max), 0, TAU); ctx.fill();
  }
  ctx.globalAlpha = 1;
  for (const f of S.flashes) {
    const a = 1 - f.t / 0.2;
    ctx.save(); ctx.translate(f.x, f.y); ctx.rotate(f.th);
    ctx.fillStyle = `rgba(255,255,255,${a * 0.9})`;
    ctx.beginPath(); ctx.ellipse(0, 0, f.len / 2, 2.5 * a + 0.5, 0, 0, TAU); ctx.fill();
    ctx.restore();
  }
  for (const s of S.sparks) {
    ctx.globalAlpha = Math.max(0, 1 - s.t / s.max);
    ctx.fillStyle = s.color;
    ctx.beginPath(); ctx.arc(s.x, s.y, s.size, 0, TAU); ctx.fill();
  }
  ctx.globalAlpha = 1;
  // 漏掉的水果：底部画一个红叉
  for (const m of S.misses) {
    const a = m.t < 0.8 ? 1 : 1 - (m.t - 0.8) / 0.4, s = 1 + Math.max(0, 0.6 - m.t * 3);
    ctx.save(); ctx.globalAlpha = a; ctx.translate(m.x, H - 56); ctx.scale(s, s);
    ctx.lineCap = 'round';
    for (const [w, c] of [[11, '#6A0808'], [6.5, '#FF3B30']]) {
      ctx.strokeStyle = c; ctx.lineWidth = w;
      ctx.beginPath(); ctx.moveTo(-13, -13); ctx.lineTo(13, 13); ctx.moveTo(13, -13); ctx.lineTo(-13, 13); ctx.stroke();
    }
    ctx.restore();
  }
  ctx.restore();

  drawTrails();
  for (const t of S.texts) drawText(t);

  // 冰冻：屏幕边缘泛蓝
  if (S.freezeT > 0) {
    const a = Math.min(1, S.freezeT * 2);
    const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
    g.addColorStop(0, 'rgba(150,215,255,0)'); g.addColorStop(1, `rgba(150,215,255,${0.45 * a})`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }
  if (S.doubleT > 0) {
    ctx.strokeStyle = `rgba(255,216,74,${0.25 + 0.15 * Math.sin(clock * 6)})`; ctx.lineWidth = 8;
    ctx.strokeRect(4, 4, W - 8, H - 8);
  }
  // 炸弹爆炸：白光
  if (S.explode) {
    const e = S.explode;
    ctx.save();
    ctx.translate(e.x, e.y); ctx.rotate(e.t * 0.6);
    const L = Math.hypot(W, H);
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * TAU;
      ctx.fillStyle = `rgba(255,255,255,${Math.min(0.85, e.t * 1.6) * (i % 2 ? 0.6 : 1)})`;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, L, a, a + 0.12); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
    ctx.fillStyle = `rgba(255,255,255,${Math.min(0.85, Math.max(0, e.t - 0.5) * 1.3)})`;
    ctx.fillRect(0, 0, W, H);
  }
  if (S.white > 0) { ctx.fillStyle = `rgba(255,255,255,${S.white})`; ctx.fillRect(0, 0, W, H); }
}

let last = performance.now();
function frame(t) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (t - last) / 1000);
  last = t;
  if (!S.paused) update(dt);
  draw();
}

/* ======================================================================
   手指
   ====================================================================== */
function startFruitHit(ax, ay, bx, by) {
  const st = S.start;
  if (!st || S.phase !== 'menu') return false;
  const bob = Math.sin(st.t * 2) * 6;
  if (segDist(ax, ay, bx, by, st.x, st.y + bob) > st.r) return false;
  const dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy) || 1;
  sliceFruit({ type: st.type, r: st.r, x: st.x, y: st.y + bob, vx: 0, vy: -120, rot: Math.sin(st.t) * 0.25, vr: 0 }, dx / L, dy / L, null);
  S.start = null;
  $('menuHint').textContent = '';
  later(0.55, () => { $('menuHint').textContent = '划一刀开始'; startGame(); });
  return true;
}

function cutAlong(p, x0, y0, x1, y1) {
  const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy);
  if (L < 1) return;
  const ux = dx / L, uy = dy / L;
  if (startFruitHit(x0, y0, x1, y1)) return;
  if (S.phase !== 'play' && S.phase !== 'ending') return;
  for (const o of S.objs) {
    if (o.dead) continue;
    const hitR = o.kind === 'bomb' ? o.r * 0.85 : o.r * FRUITS[o.type].hit;
    if (segDist(x0, y0, x1, y1, o.x, o.y) > hitR) continue;
    if (o.kind === 'bomb') { if (S.phase === 'play' || mode === 'arcade') hitBomb(o); }
    else sliceFruit(o, ux, uy, p, x1, y1);
  }
}

cv.addEventListener('pointerdown', (e) => {
  if (S.paused) return;
  cv.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { pts: [{ x: e.clientX, y: e.clientY, t: performance.now() }], down: true, count: 0, lastHit: 0, lx: e.clientX, ly: e.clientY, whoosh: false, sx: e.clientX, sy: e.clientY, st: performance.now() });
});
cv.addEventListener('pointermove', (e) => {
  const p = pointers.get(e.pointerId);
  if (!p || !p.down || S.paused) return;
  const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
  for (const ev of evs.length ? evs : [e]) {
    const prev = p.pts[p.pts.length - 1];
    const t = performance.now(), x = ev.clientX, y = ev.clientY;
    const dist = Math.hypot(x - prev.x, y - prev.y);
    if (dist < 1.5) continue;
    const v = dist / Math.max(1, t - prev.t);
    p.pts.push({ x, y, t });
    if (v > 0.28) cutAlong(p, prev.x, prev.y, x, y);
    if (!p.whoosh && v > 0.9) { p.whoosh = true; sfx.whoosh(); }
  }
});
const up = (e) => {
  const p = pointers.get(e.pointerId);
  if (!p) return;
  p.down = false; p.upAt = clock;
  resolveCombo(p);
  // 开始界面：点一下西瓜也能开始
  if (S.phase === 'menu' && S.start && performance.now() - p.st < 300 && Math.hypot(e.clientX - p.sx, e.clientY - p.sy) < 12) {
    const st = S.start;
    if (Math.hypot(e.clientX - st.x, e.clientY - st.y) < st.r * 1.4) startFruitHit(st.x - st.r * 2, st.y - st.r * 0.3, st.x + st.r * 2, st.y + st.r * 0.3);
  }
};
cv.addEventListener('pointerup', up);
cv.addEventListener('pointercancel', up);

/* ---------- 暂停 ---------- */
function pause() {
  if (S.paused || (S.phase !== 'play' && S.phase !== 'ending')) return;
  S.paused = true;
  showCard({
    title: '已暂停', big: `${S.score}`,
    meta: mode === 'levels' ? `第 ${S.level} 关 · 目标 ${S.target}` : `还剩 ${Math.ceil(S.time)} 秒`,
    main: ['继续', () => { S.paused = false; last = performance.now(); }],
    alt: ['结束这局', () => { S.paused = false; showMenu(); }],
  });
}
$('pause').addEventListener('click', pause);
hb.onPause(pause);
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });

function switchMode(m) {
  if (m === mode || S.phase !== 'menu') return;
  mode = m;
  hb.save('mode', mode);
  menuText();
  updateHud();
}
$('segLevels').addEventListener('click', () => switchMode('levels'));
$('segArcade').addEventListener('click', () => switchMode('arcade'));

hb.onSettings((next) => {
  cfg = next;
  sound.enabled = cfg.sound;
  if (S.phase === 'menu') { menuText(); buildLives(); updateHud(); }
});

resize();
buildLives();
showMenu();
requestAnimationFrame(frame);
window.__fruit = { S, launch, startGame, cutAlong }; // 方便自动测试
