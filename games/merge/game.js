// 合成大西瓜：从上面往下放水果，两个一样的碰到一起就合成更大的一个，一直合到大西瓜。
// 水果堆过红线并且停在那里超过两秒，这一局就结束。
// 物理是自己写的：位置积分（Verlet）+ 多轮推开重叠的圆，带一点摩擦，够稳定也够自然。
import { hub } from '../_shared/hub.js';
import { sound } from '../_shared/sound.js';
import { LEVELS, LAST, drawLevel, clearArt } from './art.js';

const hb = hub('merge');
const $ = (id) => document.getElementById(id);
const cv = $('cv'), ctx = cv.getContext('2d');
const ncv = $('nextCv'), nctx = ncv.getContext('2d');
const TAU = Math.PI * 2;
const STEP = 1 / 120, ITER = 10;

let cfg = hb.settings();
sound.enabled = cfg.sound;
let DPR = 2;
let F = { x0: 0, x1: 0, W: 300, top: 0, floor: 0, lineY: 0, dropY: 0, sw: 0, sh: 0 };
let G = 2000;
let balls = [];
let uid = 1;
const fx = { drops: [], rings: [], texts: [], confetti: [] };
const S = {
  phase: 'play', score: 0, shown: 0, best: 0, melons: 0, maxMade: 1,
  cur: null, next: 0, aimX: null, aiming: false, cooldown: 0, overT: 0, dirty: false, saveT: 0, paused: false,
};

const R = (t) => LEVELS[t].r * F.W;

/* ======================================================================
   场地
   ====================================================================== */
function layout() {
  const st = $('stage').getBoundingClientRect();
  DPR = Math.min(2, window.devicePixelRatio || 1);
  cv.width = Math.round(st.width * DPR); cv.height = Math.round(st.height * DPR);
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  const oldW = F.W, oldX0 = F.x0, oldFloor = F.floor;
  const W = Math.min(st.width - 20, st.height * 0.72);
  F = { W, x0: (st.width - W) / 2, x1: (st.width + W) / 2, top: 6, floor: st.height - 22, sw: st.width, sh: st.height };
  F.dropY = F.top + R(cfg.dropMax - 1) + 10;
  F.lineY = F.dropY + R(cfg.dropMax - 1) + 18;
  G = F.W * 5.2;
  // 换了尺寸：按比例挪过去
  if (oldW && balls.length && Math.abs(oldW - W) > 0.5) {
    const k = W / oldW;
    for (const b of balls) {
      b.x = F.x0 + (b.x - oldX0) * k; b.y = F.floor - (oldFloor - b.y) * k;
      b.px = b.x; b.py = b.y; b.r = b.tr = R(b.t);
    }
  }
  clearArt();
  drawNext();
}
window.addEventListener('resize', layout);

/* ======================================================================
   一局
   ====================================================================== */
function pickDrop() {
  const top = Math.max(1, Math.min(cfg.dropMax - 1, S.maxMade));
  // 小的多来一点
  const w = Array.from({ length: top + 1 }, (_, i) => 1 / Math.pow(i + 1, 0.55));
  let x = Math.random() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < w.length; i++) { x -= w[i]; if (x <= 0) return i; }
  return 0;
}

function newGame() {
  balls = [];
  fx.drops = []; fx.rings = []; fx.texts = []; fx.confetti = [];
  S.phase = 'play'; S.score = 0; S.shown = 0; S.melons = 0; S.maxMade = 1; S.overT = 0; S.paused = false; S.modal = false;
  S.best = hb.stats().best || 0;
  S.cur = { t: 0, x: (F.x0 + F.x1) / 2, appear: 0 };
  S.next = pickDrop();
  hideCard();
  ui();
  drawNext();
  const st = hb.stats(); st.played = (st.played || 0) + 1; hb.saveStats(st);
  save();
}

function addBall(t, x, y, opts = {}) {
  const r = R(t);
  const b = { id: uid++, t, x, y, px: x - (opts.vx || 0) * STEP, py: y - (opts.vy || 0) * STEP, r: opts.r0 || r, tr: r, rot: opts.rot ?? Math.random() * TAU, age: 0, falling: !!opts.falling, gone: false, pop: opts.pop || 0 };
  balls.push(b);
  return b;
}

function drop() {
  if (S.phase !== 'play' || !S.cur || S.cooldown > 0) return;
  const t = S.cur.t, r = R(t);
  const x = clamp(S.cur.x, F.x0 + r, F.x1 - r);
  addBall(t, x, F.dropY, { vy: 60, falling: true });
  sound.hiss({ f: 1200, to: 500, dur: 0.12, vol: 0.05 });
  S.cur = null;
  S.cooldown = 0.45;
  S.dirty = true;
}

/* ======================================================================
   物理
   ====================================================================== */
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function step(h) {
  const g = G * h * h;
  for (const b of balls) {
    let vx = (b.x - b.px) * 0.996, vy = (b.y - b.py) * 0.996;
    const sp = Math.hypot(vx, vy), lim = Math.max(6, b.r * 0.5);
    if (sp > lim) { vx *= lim / sp; vy *= lim / sp; }
    b.px = b.x; b.py = b.y;
    b.x += vx; b.y += vy + g;
    b.rot += vx / Math.max(4, b.r);
    if (b.r < b.tr) b.r = Math.min(b.tr, b.r + (b.tr - b.r) * 0.22 + 0.2);
  }
  const merges = [];
  const n = balls.length;
  for (let it = 0; it < ITER; it++) {
    for (let i = 0; i < n; i++) {
      const a = balls[i];
      if (a.gone) continue;
      for (let j = i + 1; j < n; j++) {
        const b = balls[j];
        if (b.gone) continue;
        const dx = b.x - a.x, dy = b.y - a.y, rr = a.r + b.r;
        const d2 = dx * dx + dy * dy;
        if (d2 >= rr * rr) continue;
        if (a.t === b.t && a.t < LAST && a.age > 0.04 && b.age > 0.04) {
          a.gone = b.gone = true;
          merges.push([a, b]);
          continue;
        }
        const d = Math.sqrt(d2) || 0.001, nx = dx / d, ny = dy / d, ov = (rr - d) * 0.9;
        const ma = a.r * a.r, mb = b.r * b.r, wa = mb / (ma + mb), wb = ma / (ma + mb);
        a.x -= nx * ov * wa; a.y -= ny * ov * wa;
        b.x += nx * ov * wb; b.y += ny * ov * wb;
        // 一点摩擦：减少两个水果互相贴着滑动
        const tx = -ny, ty = nx;
        const vt = ((a.x - a.px) - (b.x - b.px)) * tx + ((a.y - a.py) - (b.y - b.py)) * ty;
        const k = 0.012;
        a.px += tx * vt * k * wa; a.py += ty * vt * k * wa;
        b.px -= tx * vt * k * wb; b.py -= ty * vt * k * wb;
        if (a.falling || b.falling) land(a.falling ? a : b);
      }
    }
    for (const b of balls) {
      if (b.gone) continue;
      if (b.x < F.x0 + b.r) { b.x = F.x0 + b.r; b.py = b.y - (b.y - b.py) * 0.98; }
      if (b.x > F.x1 - b.r) { b.x = F.x1 - b.r; b.py = b.y - (b.y - b.py) * 0.98; }
      if (b.y > F.floor - b.r) {
        b.y = F.floor - b.r;
        b.px = b.x - (b.x - b.px) * 0.93; // 地面摩擦
        if (b.falling) land(b);
      }
    }
  }
  if (merges.length) doMerges(merges);
  balls = balls.filter((b) => !b.gone);
}

function land(b) {
  if (!b.falling) return;
  b.falling = false;
  const f = 260 - b.t * 14;
  sound.tone({ f, to: f * 0.55, dur: 0.08, vol: 0.09 });
}

function doMerges(list) {
  for (const [a, b] of list) {
    const t = a.t + 1;
    const ma = a.r * a.r, mb = b.r * b.r;
    const x = (a.x * ma + b.x * mb) / (ma + mb), y = (a.y * ma + b.y * mb) / (ma + mb);
    const nb = addBall(t, x, y, { r0: Math.max(a.r, b.r), vy: -40, rot: (a.rot + b.rot) / 2, pop: 1 });
    nb.age = 0;
    S.maxMade = Math.max(S.maxMade, t);
    const pts = t + 1 + (t === LAST ? 100 : 0);
    S.score += pts;
    S.dirty = true;
    splash(nb, LEVELS[a.t].color);
    const f = Math.max(220, 900 - t * 62);
    sound.tone({ f, to: f * 1.6, dur: 0.1, vol: 0.16 });
    sound.hiss({ f: 1400, to: 300, dur: 0.12, filter: 'lowpass', vol: 0.12 });
    hb.haptic(t >= 7 ? [10, 30, 10] : 8);
    if (t === LAST) { nb.vanishAt = 0.65; S.dirty = true; }
    else if (t >= 6) fx.texts.push({ text: LEVELS[t].name + '！', x: nb.x, y: nb.y - nb.tr, t: 0, life: 1.1, size: 26, color: '#fff' });
  }
  ui(true);
}

function splash(b, color) {
  fx.rings.push({ x: b.x, y: b.y, r: b.r, t: 0, color });
  for (let i = 0; i < 14; i++) {
    const a = Math.random() * TAU, v = (0.6 + Math.random()) * b.tr * 3.2;
    fx.drops.push({ x: b.x + Math.cos(a) * b.r * 0.6, y: b.y + Math.sin(a) * b.r * 0.6, vx: Math.cos(a) * v, vy: Math.sin(a) * v - b.tr, r: b.tr * (0.06 + Math.random() * 0.08), t: 0, max: 0.45 + Math.random() * 0.3, color });
  }
}

function celebrate(b) {
  balls = balls.filter((x) => x !== b);
  splash(b, '#F23B4E');
  splash(b, '#4CAF50');
  S.melons++;
  const st = hb.stats(); st.melons = (st.melons || 0) + 1; hb.saveStats(st);
  fx.texts.push({ text: '西瓜！', x: b.x, y: b.y, t: 0, life: 1.2, size: 40, color: '#4CD964', big: true });
  const cols = ['#FF5C8D', '#FFC531', '#3DD06B', '#3C9BFF', '#B35CFF', '#FF8A3D'];
  for (let i = 0; i < 90; i++) {
    const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.2, v = 300 + Math.random() * 600;
    fx.confetti.push({ x: b.x, y: b.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, rot: Math.random() * TAU, vr: (Math.random() - 0.5) * 14, w: 5 + Math.random() * 5, h: 3 + Math.random() * 3, color: cols[i % cols.length], t: 0, max: 1.6 + Math.random() * 0.8 });
  }
  sound.arp([523, 659, 784, 1046, 1318], { gap: 0.08, vol: 0.16 });
  hb.haptic([20, 40, 20, 40, 60]);
  save();
  // 弹窗：只有「继续」
  later(0.9, () => {
    S.modal = true; S.paused = true;
    showCard({
      title: '恭喜合成一个西瓜！', big: '+100', art: LAST,
      meta: `这一局已经合出 <b>${S.melons}</b> 个西瓜了，还要继续吗？`,
      main: ['继续', () => { S.modal = false; S.paused = false; last = performance.now(); }],
    });
  });
}

/* ======================================================================
   结束
   ====================================================================== */
function gameOver() {
  S.phase = 'over';
  S.cur = null;
  const st = hb.stats();
  const prev = st.best || 0;
  if (S.score > prev) st.best = S.score;
  st.biggest = Math.max(st.biggest || 0, S.maxMade);
  hb.saveStats(st);
  hb.save('state', null);
  sound.arp([392, 330, 262, 196], { gap: 0.14, vol: 0.13, type: 'sine' });
  hb.haptic([30, 40, 30]);
  // 从上往下一个个爆掉
  const order = balls.slice().sort((a, b) => a.y - b.y);
  order.forEach((b, i) => later(0.3 + i * 0.07, () => { if (!b.gone) { b.gone = true; splash(b, LEVELS[b.t].color); balls = balls.filter((x) => x !== b); } }));
  later(0.6 + order.length * 0.07 + 0.3, () => showCard({
    title: S.score > prev && prev > 0 ? '新纪录！' : '堆满了', big: `${S.score}`,
    meta: `最大合出了 <b>${LEVELS[S.maxMade].name}</b>${S.melons ? ` · 西瓜 <b>${S.melons}</b> 个` : ''} · 最高 <b>${Math.max(prev, S.score)}</b>`,
    main: ['再来一局', newGame],
  }));
}

const timers = [];
let clock = 0;
function later(sec, fn) { timers.push({ at: clock + sec, fn }); }

/* ======================================================================
   存档：关掉再打开能接着玩
   ====================================================================== */
function save() {
  if (S.phase !== 'play') return;
  const st = hb.stats();
  if (S.score > (st.best || 0)) { st.best = S.score; hb.saveStats(st); }
  hb.save('state', {
    v: 2, score: S.score, melons: S.melons, maxMade: S.maxMade, next: S.next,
    cur: S.cur ? S.cur.t : null,
    balls: balls.map((b) => ({ t: b.t, x: (b.x - F.x0) / F.W, y: (F.floor - b.y) / F.W, rot: +b.rot.toFixed(2) })),
  });
  S.dirty = false;
}
function load() {
  const s = hb.load('state', null);
  if (!s || s.v !== 2 || !Array.isArray(s.balls)) { newGame(); return; }
  balls = [];
  for (const b of s.balls) if (b.t < LAST) addBall(b.t, F.x0 + b.x * F.W, F.floor - b.y * F.W, { rot: b.rot });
  balls.forEach((b) => { b.age = 1; });
  Object.assign(S, { phase: 'play', score: s.score, shown: s.score, melons: s.melons || 0, maxMade: s.maxMade || 1, next: s.next ?? pickDrop(), overT: 0 });
  S.best = hb.stats().best || 0;
  S.cur = { t: s.cur ?? pickDrop(), x: (F.x0 + F.x1) / 2, appear: 0 };
  ui(); drawNext();
}

/* ======================================================================
   画面
   ====================================================================== */
let cardActions = {};
function showCard({ title, big = '', meta = '', main, alt, art = null }) {
  const ac = $('cardArt');
  ac.hidden = art === null;
  if (art !== null) {
    const d = Math.min(2, window.devicePixelRatio || 1);
    ac.width = 96 * d; ac.height = 96 * d;
    const x = ac.getContext('2d'); x.setTransform(d, 0, 0, d, 0, 0); x.clearRect(0, 0, 96, 96);
    x.translate(48, 52); x.rotate(-0.2); drawLevel(x, art, 36, 36, d);
  }
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

function ui(bump) {
  if (S.shown === S.score) $('score').textContent = S.score;
  $('best').textContent = `最高 ${Math.max(S.best, S.score)}`;
  if (bump) { const s = $('score'); s.classList.remove('bump'); void s.offsetWidth; s.classList.add('bump'); }
}

function drawNext() {
  const d = Math.min(2, window.devicePixelRatio || 1);
  ncv.width = 44 * d; ncv.height = 44 * d;
  nctx.setTransform(d, 0, 0, d, 0, 0);
  nctx.clearRect(0, 0, 44, 44);
  if (S.phase !== 'play') return;
  const r = 15 * (0.6 + 0.4 * Math.min(1, LEVELS[S.next].r / LEVELS[4].r));
  nctx.save(); nctx.translate(22, 23); drawLevel(nctx, S.next, r, r, d); nctx.restore();
}

function drawField() {
  const { x0, x1, floor, top, W } = F;
  ctx.clearRect(0, 0, F.sw, F.sh);
  // 场地底色
  ctx.fillStyle = 'rgba(255,255,255,.28)';
  ctx.beginPath(); ctx.roundRect(x0 - 4, top - 4, W + 8, floor - top + 8, 18); ctx.fill();
  ctx.strokeStyle = 'rgba(138,83,32,.16)'; ctx.lineWidth = 1.5; ctx.stroke();
  // 地面：一条木头
  const gy = floor;
  const wg = ctx.createLinearGradient(0, gy, 0, gy + 18);
  wg.addColorStop(0, '#C98A4B'); wg.addColorStop(0.35, '#A86A32'); wg.addColorStop(1, '#7A4A1E');
  ctx.fillStyle = wg;
  ctx.beginPath(); ctx.roundRect(x0 - 8, gy, W + 16, 16, 6); ctx.fill();
  ctx.fillStyle = 'rgba(255,230,190,.35)'; ctx.fillRect(x0 - 4, gy + 2, W + 8, 2);
  ctx.strokeStyle = 'rgba(90,50,15,.25)'; ctx.lineWidth = 1;
  for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.moveTo(x0 + k * W * 0.27 + 10, gy + 7 + (k % 2) * 3); ctx.lineTo(x0 + k * W * 0.27 + 60, gy + 7 + (k % 2) * 3); ctx.stroke(); }
}

function drawLine() {
  // 红线：平时淡淡的，快堆到的时候变亮，超过以后闪
  const near = balls.reduce((m, b) => (b.age > 0.8 ? Math.min(m, b.y - b.r - F.lineY) : m), Infinity);
  let a = 0.22;
  if (near < 60) a = 0.45 + 0.35 * (1 - Math.max(0, near) / 60);
  if (S.overT > 0) a = 0.6 + 0.4 * Math.abs(Math.sin(clock * 10));
  ctx.save();
  ctx.strokeStyle = `rgba(230,40,40,${a})`; ctx.lineWidth = 3; ctx.setLineDash([12, 8]);
  ctx.beginPath(); ctx.moveTo(F.x0, F.lineY); ctx.lineTo(F.x1, F.lineY); ctx.stroke();
  ctx.restore();
}

function drawBall(b) {
  let s = 1;
  if (b.pop > 0) s = 1 + 0.12 * Math.sin((1 - b.pop) * Math.PI);
  ctx.save();
  ctx.translate(b.x, b.y); ctx.rotate(b.rot); ctx.scale(s, s);
  drawLevel(ctx, b.t, b.r, b.tr, DPR);
  ctx.restore();
}

function drawCurrent() {
  if (!S.cur || S.phase !== 'play') return;
  const t = S.cur.t, r = R(t);
  const x = clamp(S.cur.x, F.x0 + r, F.x1 - r);
  const k = Math.min(1, S.cur.appear / 0.18);
  if (cfg.guide) {
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = 2; ctx.setLineDash([4, 8]);
    ctx.globalAlpha = 0.6 * k;
    ctx.beginPath(); ctx.moveTo(x, F.dropY + r + 4); ctx.lineTo(x, F.floor); ctx.stroke();
    ctx.restore();
  }
  ctx.save();
  ctx.globalAlpha = k;
  ctx.translate(x, F.dropY); ctx.scale(0.6 + 0.4 * k, 0.6 + 0.4 * k);
  drawLevel(ctx, t, r, r, DPR);
  ctx.restore();
}

function drawFx(dt) {
  for (const g of fx.rings) {
    g.t += dt;
    const p = g.t / 0.35;
    if (p >= 1) continue;
    ctx.strokeStyle = g.color; ctx.globalAlpha = 1 - p; ctx.lineWidth = 4 * (1 - p) + 1;
    ctx.beginPath(); ctx.arc(g.x, g.y, g.r * (1 + p * 0.6), 0, TAU); ctx.stroke();
  }
  fx.rings = fx.rings.filter((g) => g.t < 0.35);
  for (const d of fx.drops) {
    d.t += dt; d.vy += G * 0.6 * dt; d.x += d.vx * dt; d.y += d.vy * dt;
    ctx.globalAlpha = Math.max(0, 1 - d.t / d.max);
    ctx.fillStyle = d.color;
    ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, TAU); ctx.fill();
  }
  fx.drops = fx.drops.filter((d) => d.t < d.max);
  for (const c of fx.confetti) {
    c.t += dt; c.vy += 900 * dt; c.vx *= 0.99; c.x += c.vx * dt; c.y += c.vy * dt; c.rot += c.vr * dt;
    ctx.globalAlpha = Math.max(0, 1 - c.t / c.max);
    ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(c.rot);
    ctx.fillStyle = c.color; ctx.fillRect(-c.w / 2, -c.h / 2, c.w, c.h);
    ctx.restore();
  }
  fx.confetti = fx.confetti.filter((c) => c.t < c.max);
  ctx.globalAlpha = 1;
  for (const t of fx.texts) {
    t.t += dt;
    const k = t.t / t.life;
    const a = t.t < 0.1 ? t.t / 0.1 : k > 0.72 ? Math.max(0, 1 - (k - 0.72) / 0.28) : 1;
    const s = t.big ? 1 + 0.4 * Math.max(0, 1 - t.t * 6) : 1;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.translate(t.x, t.y - (t.big ? 0 : t.t * 40)); ctx.scale(s, s);
    ctx.font = `900 ${t.size}px -apple-system, "PingFang SC", sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(5, t.size * 0.22); ctx.strokeStyle = '#8A5320'; ctx.strokeText(t.text, 0, 0);
    ctx.fillStyle = t.color; ctx.fillText(t.text, 0, 0);
    ctx.restore();
  }
  fx.texts = fx.texts.filter((t) => t.t < t.life);
}

/* ======================================================================
   主循环
   ====================================================================== */
let acc = 0, last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (!S.paused) update(dt);
  drawField();
  balls.forEach(drawBall);
  drawLine();
  drawCurrent();
  drawFx(S.paused ? 0 : dt);
}

function update(dt) {
  clock += dt;
  if (timers.length) {
    const due = timers.filter((t) => t.at <= clock);
    for (const t of due) timers.splice(timers.indexOf(t), 1);
    due.forEach((t) => t.fn());
  }
  if (S.phase === 'play') {
    acc += dt;
    let n = 0;
    while (acc >= STEP && n < 4) { step(STEP); acc -= STEP; n++; }
    if (n === 4) acc = 0;
  }
  for (const b of balls) { b.age += dt; if (b.pop > 0) b.pop = Math.max(0, b.pop - dt * 4); }
  for (const b of balls.filter((b) => b.vanishAt && b.age >= b.vanishAt)) celebrate(b);
  // 下一个水果
  if (S.phase === 'play' && !S.cur) {
    S.cooldown -= dt;
    if (S.cooldown <= 0) {
      S.cur = { t: S.next, x: S.aimX ?? (F.x0 + F.x1) / 2, appear: 0 };
      S.next = pickDrop();
      drawNext();
    }
  }
  if (S.cur) S.cur.appear += dt;
  // 堆过红线了吗
  if (S.phase === 'play') {
    const over = balls.some((b) => b.age > 1 && !b.falling && b.y - b.r < F.lineY);
    S.overT = over ? S.overT + dt : Math.max(0, S.overT - dt * 2);
    $('tip').textContent = S.overT > 0.3 ? '快堆到顶了！' : '按住左右移动，松手放下水果';
    if (S.overT > 2.2) gameOver();
  }
  // 分数滚动
  if (S.shown !== S.score) {
    const d = S.score - S.shown;
    S.shown = Math.abs(d) < 1 ? S.score : S.shown + d * (1 - Math.exp(-dt * 12));
    $('score').textContent = Math.round(S.shown);
  }
  // 停稳了就存一下
  S.saveT += dt;
  if (S.dirty && S.saveT > 1.5) { S.saveT = 0; save(); }
}

/* ======================================================================
   手指
   ====================================================================== */
const stage = $('stage');
function aimAt(e) {
  const rect = cv.getBoundingClientRect();
  S.aimX = e.clientX - rect.left;
  if (S.cur) S.cur.x = S.aimX;
}
stage.addEventListener('pointerdown', (e) => {
  if (S.phase !== 'play' || S.paused) return;
  stage.setPointerCapture(e.pointerId);
  S.aiming = true;
  aimAt(e);
});
stage.addEventListener('pointermove', (e) => { if (S.aiming) aimAt(e); });
stage.addEventListener('pointerup', (e) => {
  if (!S.aiming) return;
  S.aiming = false;
  aimAt(e);
  drop();
});
stage.addEventListener('pointercancel', () => { S.aiming = false; });

$('restart').addEventListener('click', () => {
  if (S.phase !== 'play') { newGame(); return; }
  if (S.score < 20) { newGame(); return; }
  showCard({ title: '重新开始？', big: `${S.score}`, meta: '这一局的分数不会保留', main: ['重新开始', newGame], alt: ['继续玩', null] });
});

/* ---------- 和大厅的联动 ---------- */
hb.onPause(() => { save(); S.paused = true; });
hb.onResume(() => { S.paused = !!S.modal; last = performance.now(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });
hb.onSettings((next) => {
  const relayout = next.dropMax !== cfg.dropMax;
  cfg = next;
  sound.enabled = cfg.sound;
  if (relayout) layout();
});

layout();
load();
requestAnimationFrame(frame);
window.__merge = { S, get balls() { return balls; }, addBall, drop, F: () => F, LEVELS }; // 方便自动测试
