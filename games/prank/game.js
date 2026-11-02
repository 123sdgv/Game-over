// 整蛊火柴人：沙盒。黑白老 Windows 外壳，左边画布和状态，右边工具箱。
import { hub } from '../_shared/hub.js';
import { sound } from '../_shared/sound.js';
import { World } from './world.js';
import { TOOLS, toolById, makeTools } from './tools.js';
import { makeIcon } from './art.js';
import { sfx } from './sfx.js';

const hb = hub('prank');
let S = hb.settings();
const $ = (id) => document.getElementById(id);
const desk = $('desk'), win = $('win'), stage = $('stage'), cv = $('cv'), plate = $('plate'), right = $('right'), pad = $('pad');
const c = cv.getContext('2d', { willReadFrequently: true, alpha: false });

/* ─────────────── 网点贴图（桌面、进度条用） ─────────────── */
function pattern(size, cells) {
  const p = document.createElement('canvas');
  p.width = p.height = size;
  const x = p.getContext('2d');
  x.fillStyle = '#fff'; x.fillRect(0, 0, size, size);
  x.fillStyle = '#000';
  for (const [a, b] of cells) x.fillRect(a, b, 1, 1);
  return `url(${p.toDataURL()})`;
}
document.documentElement.style.setProperty('--check', pattern(2, [[0, 0], [1, 1]]));
document.documentElement.style.setProperty('--check25', pattern(2, [[0, 0]]));

/* ─────────────── 记录 ─────────────── */
const st = { played: 0, hits: 0, deaths: 0, limbs: 0, breaks: 0, biggest: 0, favorite: '—', uses: {}, ...hb.stats() };
if (typeof st.uses !== 'object' || !st.uses) st.uses = {};
if (st.uses.hand) { st.uses.mouse = (st.uses.mouse || 0) + st.uses.hand; delete st.uses.hand; }
let statsDirty = false;
const touchStats = () => { statsDirty = true; };
function bumpUse(id) {
  st.uses[id] = (st.uses[id] || 0) + 1;
  let best = null, n = 0;
  for (const [k, v] of Object.entries(st.uses)) if (v > n && toolById(k)) { n = v; best = k; }
  if (best) st.favorite = toolById(best).name;
  touchStats();
}

/* ─────────────── 世界 ─────────────── */
const CAUSE_NAME = { anvil: '铁砧', bolt: '闪电', roller: '压路机', spikes: '钉板', peel: '香蕉皮', spring: '弹簧板', hole: '黑洞', eraser: '橡皮擦', fall: '地板', poke: '鼠标', wall: '铅笔线', nail: '钉子', yank: '鼠标', water: '水', melt: '水' };

const logEl = $('log');
function logLine(text) {
  const d = new Date();
  const line = document.createElement('div');
  line.textContent = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')} ${text}`;
  logEl.append(line);
  while (logEl.childElementCount > 40) logEl.firstChild.remove();
  logEl.scrollTop = logEl.scrollHeight;
}

/* 每个人一个台词气泡 */
const bubbles = [];
for (let i = 0; i < 6; i++) {
  const el = document.createElement('div');
  el.className = 'bubble'; el.hidden = true;
  const sp = document.createElement('span');
  el.append(sp);
  stage.append(el);
  bubbles.push({ el, sp, t: 0, B: null, w: 0, h: 0 });
}

const W = new World({
  say(B, text, dur) {
    const b = bubbles[B.slot % bubbles.length];
    if (!text || !S.lines) { if (b.B === B || !text) { b.t = 0; b.el.hidden = true; } return; }
    b.sp.textContent = text;
    b.el.hidden = false;
    b.t = dur; b.B = B;
    b.w = b.el.offsetWidth; b.h = b.el.offsetHeight;
  },
  hit(d, cause) {
    const v = Math.round(d);
    if (v > st.biggest) st.biggest = v;
    touchStats();
    if (v >= 4) logLine(`${CAUSE_NAME[String(cause).split(':')[0]] || '不明物体'}　生命 -${v}`);
  },
  counted() { st.hits++; touchStats(); batchHits++; },
  limb() { st.limbs++; touchStats(); logLine('少了一块'); },
  broke() { st.breaks++; touchStats(); logLine('骨折'); },
  born(B) { st.played++; touchStats(); saveNow(); logLine(`第 ${B.num} 个火柴人已启动`); },
  death() { st.deaths++; touchStats(); saveNow(); logLine('火柴人.exe 已停止工作'); sfx.error(); cancelPressIfNeeded(); },
  jolt(a) { jolt(a); },
});
let batchHits = 0;
const tools = makeTools(W, { used: bumpUse });

function applySettings() {
  sound.enabled = S.sound;
  W.opts.particles = S.particles;
  W.opts.shake = S.shake;
  W.opts.flash = S.flash;
  W.setMax(S.hpMax);
  if (!S.lines) for (const b of bubbles) { b.el.hidden = true; b.t = 0; }
}
hb.onSettings((s) => { S = s; applySettings(); });
applySettings();

function jolt(a) {
  if (!S.shake) return;
  const m = Math.min(6, 2 + a * 2);
  win.animate([
    { transform: 'translate(0,0)' }, { transform: `translate(${-m}px,${m * 0.5}px)` }, { transform: `translate(${m}px,${-m * 0.4}px)` },
    { transform: `translate(${-m * 0.4}px,${-m * 0.3}px)` }, { transform: 'translate(0,0)' },
  ], { duration: 190, easing: 'steps(4, end)' });
}

/* ─────────────── 布局：手机竖着拿就把整个界面转 90°，所有东西都在转过来的坐标里 ─────────────── */
let rotated = false, px = 1, dpr = 1, stageW = 0, stageH = 0, cellPx = 56;

function safeAreas() {
  const o = { t: 0, b: 0, l: 0, r: 0 };
  try {
    const dev = parent !== window && parent.document.getElementById('device');
    const doc = dev ? parent.document : document, host = dev || document.body, w0 = dev ? parent : window;
    const probe = doc.createElement('div');
    probe.style.cssText = 'position:absolute;visibility:hidden;padding:var(--safe-t,0px) env(safe-area-inset-right,0px) var(--safe-b,0px) env(safe-area-inset-left,0px)';
    host.append(probe);
    const cs = w0.getComputedStyle(probe);
    o.t = parseFloat(cs.paddingTop) || 0; o.b = parseFloat(cs.paddingBottom) || 0;
    o.l = parseFloat(cs.paddingLeft) || 0; o.r = parseFloat(cs.paddingRight) || 0;
    probe.remove();
  } catch {}
  return o;
}

/** 工具图标：整数倍放大才不糊 */
function sizeIcons() {
  const size = right.classList.contains('mini') ? cellPx / 2 : cellPx;
  const k = Math.max(1, Math.floor((size - (size < 40 ? 3 : 8)) * dpr / 36));
  for (const ic of document.querySelectorAll('.tool canvas')) ic.style.width = ic.style.height = `${(36 * k) / dpr}px`;
}

function layout() {
  const vw = window.innerWidth, vh = window.innerHeight;
  dpr = Math.max(1, window.devicePixelRatio || 1);
  rotated = vh > vw && vw < 600;
  const CW = rotated ? vh : vw, CH = rotated ? vw : vh;
  desk.style.width = `${CW}px`; desk.style.height = `${CH}px`;
  desk.style.transform = rotated ? `translateX(${vw}px) rotate(90deg)` : 'none';

  const big = Math.min(CW, CH) >= 600;
  $('log').hidden = !big;
  const s = safeAreas();
  const bar = s.b + 24;
  let L, R, T, Bt;
  if (rotated) { L = Math.max(s.t, 6); R = bar; T = 6; Bt = 8; }
  else { L = Math.max(s.l, 6); R = Math.max(s.r, 8); T = Math.max(s.t, 6); Bt = bar; }
  if (big) { L += 14; R += 14; T += 12; Bt += 2; }
  Object.assign(win.style, { left: `${L}px`, top: `${T}px`, width: `${CW - L - R}px`, height: `${CH - T - Bt}px` });
  if (rotated) Object.assign(plate.style, { left: `${CW - bar + 2}px`, top: `${CH / 2 - 100}px`, width: `${bar + 4}px`, height: '200px' });
  else Object.assign(plate.style, { left: `${CW / 2 - 100}px`, top: `${CH - bar + 2}px`, width: '200px', height: `${bar + 4}px` });

  const WW = CW - L - R - 4, WH = CH - T - Bt - 4;
  const fs = big ? 15 : 12;
  const th = big ? 30 : 24, mh = big ? 30 : 24, stb = big ? 92 : 60;
  const inner = WH - th - mh - 4;
  const minDesc = big ? 150 : 96;
  const cell = Math.floor(Math.max(36, Math.min((inner - minDesc) / 4, WW * 0.42 / 4, big ? 78 : 60)));
  cellPx = cell;
  const root = document.documentElement.style;
  root.setProperty('--fs', `${fs}px`); root.setProperty('--th', `${th}px`); root.setProperty('--mh', `${mh}px`);
  root.setProperty('--stb', `${stb}px`); root.setProperty('--cell', `${cell}px`); root.setProperty('--rw', `${cell * 4}px`);
  // 圆盘：道具缩成两排以后，剩下的地方能放多大放多大
  const padSize = Math.floor(Math.max(90, Math.min(cell * 4 - 18, inner - cell - 22, big ? 330 : 400)));
  root.setProperty('--pad', `${padSize}px`);
  sizeIcons();

  // 画布：所有设备差不多同样的低分辨率，每个逻辑像素对齐到整数个物理像素
  const cssW = stage.clientWidth, cssH = stage.clientHeight;
  if (!cssW || !cssH) return;
  px = Math.max(1, Math.round(Math.min(cssH * dpr / 240, cssW * dpr / 340)));
  const bw = Math.floor(cssW * dpr / px), bh = Math.floor(cssH * dpr / px);
  stageW = (bw * px) / dpr; stageH = (bh * px) / dpr;
  cv.style.width = `${stageW}px`; cv.style.height = `${stageH}px`;
  if (cv.width !== bw || cv.height !== bh) {
    cv.width = bw; cv.height = bh;
    W.resize(bw, bh);
  }
}

/** 屏幕坐标 → 世界坐标 */
function toWorld(e) {
  const r = cv.getBoundingClientRect();
  let dx, dy;
  if (rotated) { dx = e.clientY - r.top; dy = r.right - e.clientX; }
  else { dx = e.clientX - r.left; dy = e.clientY - r.top; }
  return { x: Math.max(1, Math.min(W.w - 1, dx * dpr / px)), y: Math.max(1, Math.min(W.h - 1, dy * dpr / px)) };
}
/** 屏幕上的位移 → 界面（转过来以后）的位移 */
const toLocal = (dx, dy) => (rotated ? { x: dy, y: -dx } : { x: dx, y: dy });

/* ─────────────── 工具箱 ─────────────── */
let sel = hb.load('tool', 'mouse');
if (!toolById(sel)) sel = 'mouse';
W.pencilLine = !!hb.load('penLine', false);
const cells = {};
for (const t of TOOLS) {
  const b = document.createElement('button');
  b.className = 'tool';
  b.setAttribute('aria-label', t.name);
  b.append(makeIcon(t.id));
  b.addEventListener('click', () => pressTool(t.id));
  $('grid').append(b);
  cells[t.id] = b;
}
// 15 样道具排不满 4×4，补一个空格子
const blank = document.createElement('div');
blank.className = 'tool blank';
$('grid').append(blank);

function showTool() {
  const t = toolById(sel);
  for (const [id, b] of Object.entries(cells)) b.classList.toggle('on', id === sel);
  $('dName').textContent = t.name;
  $('dText').textContent = t.desc;
  $('dHow').textContent = t.how;
  const isMouse = sel === 'mouse';
  right.classList.toggle('mini', isMouse);
  $('padWrap').hidden = !isMouse;
  W.cursor.on = isMouse;
  W.showHandles = sel === 'water';
  $('penMode').hidden = sel !== 'pencil';
  $('penFree').classList.toggle('on', !W.pencilLine);
  $('penLine').classList.toggle('on', W.pencilLine);
  sizeIcons();
}
function pressTool(id) {
  if (cardOpen || id === sel) return;
  cancelPress();
  sel = id;
  sfx.select();
  showTool();
  hb.save('tool', sel);
  // 他看见你换了什么道具，会念叨一句
  const live = W.bodies.filter((b) => b.alive && b.state === 'ctrl');
  if (live.length && Math.random() < 0.45) live[(Math.random() * live.length) | 0].reactTool(id);
}
$('penFree').addEventListener('click', () => { W.pencilLine = false; sfx.click(); hb.save('penLine', false); showTool(); });
$('penLine').addEventListener('click', () => { W.pencilLine = true; sfx.click(); hb.save('penLine', true); showTool(); });

/* ─────────────── 触摸画布 ─────────────── */
let press = null;
cv.addEventListener('pointerdown', (e) => {
  if (cardOpen || W.paused || press) return;
  e.preventDefault();
  try { cv.setPointerCapture(e.pointerId); } catch {}
  const q = toWorld(e), t = toolById(sel);
  press = { id: e.pointerId, t0: performance.now(), tool: sel, kind: t.kind, x: q.x, y: q.y, tick: 0 };
  if (t.kind === 'drag') tools.down(sel, q.x, q.y);
  else if (t.kind === 'place') W.preview = { id: sel, x: q.x, y: q.y, s: 1 };
  else if (t.kind === 'water') tools.waterDown(q.x, q.y);
});
cv.addEventListener('pointermove', (e) => {
  if (!press || e.pointerId !== press.id) return;
  const q = toWorld(e);
  press.x = q.x; press.y = q.y;
  if (press.kind === 'drag') tools.move(press.tool, q.x, q.y);
  else if (press.kind === 'place' && W.preview) { W.preview.x = q.x; W.preview.y = q.y; }
  else if (press.kind === 'water') tools.waterMove(q.y);
});
function endPress(e, cancel) {
  if (!press || (e && e.pointerId !== press.id)) return;
  const p = press;
  press = null;
  // 抬手那一下的位置才算数（快速划的时候最后一段 move 可能来不及发）
  if (e && !cancel) {
    const q = toWorld(e);
    p.x = q.x; p.y = q.y;
    if (p.kind === 'drag') tools.move(p.tool, q.x, q.y);
  }
  if (p.kind === 'drag') { tools.up(p.tool, p.x, p.y); return; }
  if (p.kind === 'water') { tools.waterUp(); return; }
  if (p.kind === 'tap') { if (!cancel) tools.place(p.tool, p.x, p.y, 1); return; }
  const s = W.preview ? W.preview.s : 1;
  W.preview = null;
  if (!cancel) tools.place(p.tool, p.x, p.y, s);
}
cv.addEventListener('pointerup', (e) => endPress(e, false));
cv.addEventListener('pointercancel', (e) => endPress(e, true));
function cancelPress() {
  if (padP) endPad(null, true);
  if (!press) return;
  const p = press;
  press = null;
  if (p.kind === 'drag') tools.up(p.tool, p.x, p.y);
  else if (p.kind === 'water') tools.waterUp();
  W.preview = null;
}
/** 有人死了：手指正按着的东西可能已经没了，松开抓着的 */
function cancelPressIfNeeded() {
  const h = W.hand;
  if (h && h.p && !W.pts.includes(h.p)) { W.hand = null; press = null; }
}

/** 长按：预览慢慢变大 */
function growPreview() {
  if (!press || press.kind !== 'place' || !W.preview) return;
  const hold = (performance.now() - press.t0) / 1000;
  if (hold < 0.18) return;
  const u = Math.min(1, (hold - 0.18) / 1.05);
  const max = press.tool === 'roller' ? 2 : press.tool === 'hole' ? 2.2 : 2.5;
  W.preview.s = 1 + u * (max - 1);
  if (u < 1 && Math.floor(hold * 12) !== press.tick) { press.tick = Math.floor(hold * 12); sfx.grow(u); }
}

/* ─────────────── 鼠标圆盘：像笔记本触控板 ─────────────── */
let padP = null;
pad.addEventListener('pointerdown', (e) => {
  if (cardOpen || W.paused || padP) return;
  e.preventDefault();
  try { pad.setPointerCapture(e.pointerId); } catch {}
  const r = pad.getBoundingClientRect();
  const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  padP = { id: e.pointerId, x: e.clientX, y: e.clientY, t0: performance.now(), moved: 0, center: Math.hypot(e.clientX - cx, e.clientY - cy) <= r.width * 0.2, cx, cy, r: r.width / 2 };
  pad.classList.add('on');
  moveKnob(e);
  tools.padDown();
});
function moveKnob(e) {
  const l = toLocal(e.clientX - padP.cx, e.clientY - padP.cy), d = Math.hypot(l.x, l.y), m = padP.r - 11, k = d > m ? m / d : 1;
  $('padKnob').style.transform = `translate(${l.x * k}px, ${l.y * k}px)`;
}
pad.addEventListener('pointermove', (e) => {
  if (!padP || e.pointerId !== padP.id) return;
  const ev = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
  const list = ev.length ? ev : [e];
  for (const q of list) {
    const l = toLocal(q.clientX - padP.x, q.clientY - padP.y);
    padP.x = q.clientX; padP.y = q.clientY;
    padP.moved += Math.hypot(l.x, l.y);
    const gain = 2.6 * dpr / px;                 // 手指滑一点，鼠标走一大段
    tools.padMove(l.x * gain, l.y * gain);
  }
  moveKnob(e);
});
function endPad(e, cancel) {
  if (!padP || (e && e.pointerId !== padP.id)) return;
  const p = padP;
  padP = null;
  pad.classList.remove('on');
  $('padKnob').style.transform = '';
  const tap = !cancel && p.moved < 7 && performance.now() - p.t0 < 320;
  tools.padUp(tap, p.center);
}
pad.addEventListener('pointerup', (e) => endPad(e, false));
pad.addEventListener('pointercancel', (e) => endPad(e, true));

/* ─────────────── 对话框：只剩欢迎、帮助、关于 ─────────────── */
let cardOpen = false;
const ICONS = {
  info: '<svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="18" fill="#fff" stroke="#000" stroke-width="3"/><path d="M17.5 9h5v5h-5zM15 17h7v13h3v3H15v-3h3V20h-3z"/></svg>',
  warn: '<svg viewBox="0 0 40 40"><path d="M20 3l18 33H2z" fill="#fff" stroke="#000" stroke-width="3" stroke-linejoin="round"/><path d="M18 14h4l-1 12h-2zM18 28h4v4h-4z"/></svg>',
};
function showCard({ title, big, meta = '', icon = 'info', main = '确定' }) {
  cancelPress();
  cardOpen = true;
  const wasPaused = W.paused;
  W.paused = true;
  $('cardTitle').textContent = title;
  $('cardBig').textContent = big;
  $('cardMeta').textContent = meta;
  $('cardIcon').innerHTML = ICONS[icon] || '';
  $('cardMain').textContent = main;
  $('cardAlt').hidden = true;
  $('cardWrap').hidden = false;
  $('cardMain').onclick = () => {
    sfx.click();
    cardOpen = false;
    $('cardWrap').hidden = true;
    W.paused = wasPaused;
    last = performance.now();
  };
}

/** 画一个新的。活着的时候点就多一个人；点了也会接着自动画 */
function redraw() {
  cancelPress();
  W.autoDraw = true;
  $('mStop').classList.remove('on');
  if (!W.spawnOne(true)) {
    sfx.error();
    W.word(W.w / 2, 44, '画不下了，最多 5 个', 15);
  }
}

/* ─────────────── 菜单和标题栏 ─────────────── */
$('mNew').addEventListener('click', () => { if (!cardOpen) { sfx.click(); redraw(); } });
$('mClear').addEventListener('click', () => {
  if (cardOpen) return;
  sfx.click();
  cancelPress();
  W.clearAll();
});
// 停止：不再自动画新的；点「重画」接着画
$('mStop').addEventListener('click', (e) => {
  if (cardOpen) return;
  sfx.click();
  W.autoDraw = false;
  W.drawT = 0;
  e.currentTarget.classList.add('on');
});
const showHelp = () => showCard({
  title: '帮助',
  big: '怎么整他',
  meta: '点右边选道具，再点画布，用在那个位置；有些道具长按变大。\n鼠标：滑圆盘移动，碰到他就抓起来，松手扔；点圆盘中央戳他。\n钉子点手腕脚踝；绳子按住拖，靠近钉子、手腕、脚踝就连上。\n水：拖小点调水位。\n死了一个自动画一个；「停止」就不画了，「重画」接着画。\n活着的时候点「重画」多一个人，血条共用。',
});
$('mHelp').addEventListener('click', () => { if (!cardOpen) { sfx.click(); showHelp(); } });
$('btnSys').addEventListener('click', () => {
  if (cardOpen) return;
  sfx.click();
  showCard({ title: '关于', big: '整蛊火柴人 2.0', meta: `已经画过 ${st.played} 个火柴人，弄坏了 ${st.deaths} 个。\n一共断了 ${st.limbs} 条胳膊腿。\n最爱的道具：${st.favorite}。` });
});
$('btnMin').addEventListener('click', () => { sfx.click(); hb.home(); });
$('btnMax').addEventListener('click', () => {
  if (cardOpen) return;
  sfx.ding();
  showCard({ title: '整蛊火柴人', icon: 'warn', big: '已经是最大了', meta: Math.min(window.innerWidth, window.innerHeight) >= 600 ? '这屏幕还不够你用的？' : '你手机就这么大。' });
});

/* ─────────────── 状态栏 ─────────────── */
let hudT = 0;
function setBar(id, numId, v, max = 100, show = v) {
  const pct = Math.max(0, Math.min(100, Math.round(v / max * 100)));
  const el = $(id);
  if (el._v !== pct) { el._v = pct; el.style.width = `${pct}%`; }
  const n = $(numId), s = String(Math.max(0, Math.ceil(show)));
  if (n.textContent !== s) n.textContent = s;
}
const text = (id, v) => { const el = $(id); if (el.textContent !== v) el.textContent = v; };
const FIG = { lArm: 'fLArm', rArm: 'fRArm', lLeg: 'fLLeg', rLeg: 'fRLeg' };
function hud(dt) {
  hudT -= dt;
  if (hudT > 0) return;
  hudT = 0.09;
  const live = W.bodies.filter((b) => !b.dead);
  const B = W.focus && !W.focus.dead ? W.focus : live[0] || null;
  const V = W.vit;
  setBar('bHp', 'nHp', live.length ? V.hp : 0, V.max);
  setBar('bPain', 'nPain', B ? B.pain : 0);
  const under = B && B.headUnder;
  text('lFear', under ? '氧气' : '恐惧');
  setBar('bFear', 'nFear', B ? (under ? B.air * 100 : B.fear) : 0);
  text('iState', B ? B.statusText() : W.autoDraw ? '正在画下一个' : '没人了');
  if (B) {
    const { lost, broke } = B.injury();
    text('iHurt', !lost && !broke ? (V.hp < V.max ? '有伤' : '完好') : [lost ? `断 ${lost}` : '', broke ? `折 ${broke}` : ''].filter(Boolean).join(' · '));
  } else text('iHurt', '—');
  text('iHits', `${batchHits} 下`);
  text('menuInfo', `活着 ${live.length} · 第 ${W.drawn} 个`);
  for (const [k, id] of Object.entries(FIG)) {
    const el = $(id);
    el.classList.toggle('lost', !B || !B.limbOK[k]);
    el.classList.toggle('broken', !!(B && B.broken[k]));
  }
  $('fHead').classList.toggle('lost', !B || !B.j.head);
  $('fTorso').classList.toggle('lost', !B);
  $('fX').toggleAttribute('hidden', !!B);
}

function bubblePos(dt) {
  for (const b of bubbles) {
    if (b.el.hidden) continue;
    b.t -= dt;
    const B = b.B, h = B && B.j && B.j.head;
    if (b.t <= 0 || !h || B.dead || h.hole || h.trap) { b.el.hidden = true; continue; }
    const k = px / dpr;
    const sx = h.x * k, sy = h.y * k;
    const left = Math.max(3, Math.min(stageW - b.w - 5, sx - b.w / 2));
    const top = Math.max(2, sy - 12 * k - b.h - 9);
    b.el.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
    b.el.style.setProperty('--tail', `${Math.max(8, Math.min(b.w - 10, sx - left))}px`);
  }
}

/* ─────────────── 存档 ─────────────── */
function saveNow() {
  try {
    hb.save('world', W.snapshot());
    hb.save('tool', sel);
    if (statsDirty) { hb.saveStats(st); statsDirty = false; }
  } catch {}
}
let saveT = 4;

/* ─────────────── 主循环 ─────────────── */
let raf = 0, last = 0, away = false;
function frame(ts) {
  raf = requestAnimationFrame(frame);
  const dt = Math.min(0.05, Math.max(0, (ts - last) / 1000));
  last = ts;
  step(dt);
}
function step(dt) {
  growPreview();
  W.update(dt);
  W.draw(c);
  hud(dt);
  if (!W.paused) bubblePos(dt);
  saveT -= dt;
  if (saveT <= 0) { saveT = 5; saveNow(); }
}
function start() { if (raf) return; last = performance.now(); raf = requestAnimationFrame(frame); }
function stop() { if (raf) cancelAnimationFrame(raf); raf = 0; }

hb.onPause(() => { away = true; cancelPress(); saveNow(); stop(); });
hb.onResume(() => { away = false; layout(); start(); });
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { cancelPress(); saveNow(); stop(); } else if (!away) start();
});
window.addEventListener('pagehide', saveNow);
window.addEventListener('resize', () => { layout(); });
window.addEventListener('orientationchange', () => setTimeout(layout, 120));

/* ─────────────── 开工 ─────────────── */
layout();
const saved = hb.load('world', null);
let restored = false;
if (saved && saved.pts && saved.pts.length) restored = W.restore(saved);
if (W.vit.hp > W.vit.max) W.vit.hp = W.vit.max;
if (!restored) { W.pts = []; W.sticks = []; W.props = []; W.bodies = []; W.ropes = []; W.walls = []; W.waters = []; W.waterDirty = true; W.drawn = 0; }
W.rebuildGrid();
$('mStop').classList.toggle('on', !W.autoDraw);
showTool();
if (!W.bodies.length && W.autoDraw) W.spawnOne(true);
start();
if (!hb.load('seen2', false)) {
  hb.save('seen2', true);
  setTimeout(() => showCard({
    title: '欢迎使用',
    big: '欢迎使用 整蛊火柴人',
    meta: '点右边选道具，再点画布。\n鼠标用右边的圆盘滑动，碰到他就抓起来。\n死了会自动画新的，点「停止」就不画了。',
    main: '开始整他',
  }), 1300);
}

// 测试钩子
window.__prank = { W, tools, TOOLS, select: (id) => { pressTool(id); }, step, layout, saveNow, redraw, stats: () => st, get B() { return W.focus && !W.focus.dead ? W.focus : W.bodies[0]; }, get rotated() { return rotated; }, get px() { return px; }, stop, start };
