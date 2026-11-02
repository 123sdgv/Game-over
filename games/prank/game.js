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
const desk = $('desk'), win = $('win'), stage = $('stage'), cv = $('cv'), plate = $('plate');
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
let statsDirty = false;
const touchStats = () => { statsDirty = true; };
function bumpUse(id) {
  st.uses[id] = (st.uses[id] || 0) + 1;
  let best = null, n = 0;
  for (const [k, v] of Object.entries(st.uses)) if (v > n) { n = v; best = k; }
  if (best) st.favorite = toolById(best).name;
  touchStats();
}

/* ─────────────── 世界 ─────────────── */
const CAUSE_NAME = { anvil: '铁砧', bomb: '炸弹', mine: '地雷', bolt: '闪电', saw: '电锯', roller: '压路机', spikes: '钉板', peel: '香蕉皮', spring: '弹簧板', rocket: '火箭', hole: '黑洞', eraser: '橡皮擦', fall: '地板', poke: '手指', wall: '铅笔线', throw: '地板' };
const CAUSE_TEXT = { anvil: '被铁砧拍死了', bomb: '被炸弹炸没了', mine: '踩了地雷', bolt: '被雷劈死了', saw: '被电锯锯死了', roller: '被碾成了一张纸', spikes: '被钉板扎穿了', peel: '踩香蕉皮摔死了', spring: '被弹上天花板撞死了', rocket: '跟火箭一起上了天', hole: '被黑洞吃了又吐出来', eraser: '被橡皮擦掉了', fall: '摔死了', poke: '被你活活戳死了', wall: '一头撞死在铅笔线上', throw: '摔死了' };
function causeText(cause) {
  const [base, part] = String(cause || 'fall').split(':');
  const name = CAUSE_NAME[base] || '地板';
  if (part === 'head') return `脑袋被${name}弄掉了`;
  if (part === 'torso') return `被${name}弄成了两截`;
  if (part === 'shatter') return `冻住以后被${name}碰碎了`;
  return CAUSE_TEXT[base] || '摔死了';
}

const logEl = $('log');
function logLine(text) {
  const d = new Date();
  const line = document.createElement('div');
  line.textContent = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')} ${text}`;
  logEl.append(line);
  while (logEl.childElementCount > 40) logEl.firstChild.remove();
  logEl.scrollTop = logEl.scrollHeight;
}

let bubbleT = 0;
const W = new World({
  say(text, dur) {
    if (!text || !S.lines) { bubbleT = 0; $('bubble').hidden = true; return; }
    $('bubbleText').textContent = text;
    $('bubble').hidden = false;
    bubbleT = dur;
    bubbleW = $('bubble').offsetWidth; bubbleH = $('bubble').offsetHeight;
  },
  hit(d, cause) {
    const v = Math.round(d);
    if (v > st.biggest) st.biggest = v;
    touchStats();
    if (v >= 4) logLine(`${CAUSE_NAME[String(cause).split(':')[0]] || '不明物体'}　生命 -${Math.round(v * B.tough)}`);
  },
  limb() { st.limbs++; touchStats(); logLine('少了一块'); },
  broke() { st.breaks++; touchStats(); logLine('骨折'); },
  born() { st.played++; touchStats(); saveNow(); logLine(`第 ${B.num} 个火柴人已启动`); },
  death(cause, B) { onDeath(cause, B); },
  askBin() { onAskBin(); },
  deleted() { onDeleted(); },
  jolt(a) { jolt(a); },
});
const B = W.B;
const tools = makeTools(W, { used: bumpUse });
let lastHits = 0;

function applySettings() {
  sound.enabled = S.sound;
  W.opts.particles = S.particles;
  W.opts.shake = S.shake;
  W.opts.flash = S.flash;
  B.tough = [1.7, 1, 0.55][S.tough - 1] ?? 1;
  if (!S.lines) { $('bubble').hidden = true; }
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
let rotated = false, px = 1, dpr = 1, stageW = 0, stageH = 0, bubbleW = 0, bubbleH = 0;

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
  const root = document.documentElement.style;
  root.setProperty('--fs', `${fs}px`); root.setProperty('--th', `${th}px`); root.setProperty('--mh', `${mh}px`);
  root.setProperty('--stb', `${stb}px`); root.setProperty('--cell', `${cell}px`); root.setProperty('--rw', `${cell * 4}px`);

  // 工具图标：整数倍放大才不糊
  const k = Math.max(1, Math.floor((cell - 8) * dpr / 36));
  for (const ic of document.querySelectorAll('.tool canvas')) ic.style.width = ic.style.height = `${(36 * k) / dpr}px`;

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

/* ─────────────── 工具箱 ─────────────── */
let sel = hb.load('tool', 'hand');
if (!toolById(sel)) sel = 'hand';
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
function showTool() {
  const t = toolById(sel);
  for (const [id, b] of Object.entries(cells)) b.classList.toggle('on', id === sel);
  $('dName').textContent = t.name;
  $('dText').textContent = t.desc;
  $('dHow').textContent = `${t.how} · 再点图标：用在他身上`;
}
function pressTool(id) {
  if (cardOpen) return;
  if (id !== sel) {
    tools.cancelAuto();
    sel = id;
    sfx.select();
    showTool();
    hb.save('tool', sel);
    return;
  }
  // 已经选中了，再点一下就直接用在他身上
  if (B.state === 'draw' || W.paused) return;
  sfx.click();
  if (B.gone) { redraw(); return; }
  tools.auto(id, 1);
}

/* ─────────────── 触摸画布 ─────────────── */
let press = null;
cv.addEventListener('pointerdown', (e) => {
  if (cardOpen || W.paused || press) return;
  if (B.state === 'draw') return;
  e.preventDefault();
  try { cv.setPointerCapture(e.pointerId); } catch {}
  tools.cancelAuto();
  const q = toWorld(e), t = toolById(sel);
  press = { id: e.pointerId, t0: performance.now(), tool: sel, kind: t.kind, x: q.x, y: q.y, tick: 0 };
  if (t.kind === 'drag') tools.down(sel, q.x, q.y);
  else W.preview = { id: sel, x: q.x, y: q.y, s: 1 };
});
cv.addEventListener('pointermove', (e) => {
  if (!press || e.pointerId !== press.id) return;
  const q = toWorld(e);
  press.x = q.x; press.y = q.y;
  if (press.kind === 'drag') tools.move(press.tool, q.x, q.y);
  else if (W.preview) { W.preview.x = q.x; W.preview.y = q.y; }
});
function endPress(e, cancel) {
  if (!press || (e && e.pointerId !== press.id)) return;
  const p = press;
  press = null;
  if (p.kind === 'drag') { tools.up(p.tool, p.x, p.y); return; }
  const s = W.preview ? W.preview.s : 1;
  W.preview = null;
  if (!cancel) tools.place(p.tool, p.x, p.y, s);
}
cv.addEventListener('pointerup', (e) => endPress(e, false));
cv.addEventListener('pointercancel', (e) => endPress(e, true));

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

/* ─────────────── 对话框 ─────────────── */
let cardOpen = false;
const ICONS = {
  stop: '<svg viewBox="0 0 40 40"><path d="M12 1h16l11 11v16L28 39H12L1 28V12z" fill="#000"/><path d="M12 12l16 16M28 12L12 28" stroke="#fff" stroke-width="5"/></svg>',
  ask: '<svg viewBox="0 0 40 40"><path d="M3 3h34v26H18l-8 9v-9H3z" fill="#fff" stroke="#000" stroke-width="3"/><path d="M15 12c0-7 11-7 11 0 0 4-6 4-6 8" fill="none" stroke="#000" stroke-width="3.4"/><path d="M18 23h4v4h-4z"/></svg>',
  info: '<svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="18" fill="#fff" stroke="#000" stroke-width="3"/><path d="M17.5 9h5v5h-5zM15 17h7v13h3v3H15v-3h3V20h-3z"/></svg>',
  warn: '<svg viewBox="0 0 40 40"><path d="M20 3l18 33H2z" fill="#fff" stroke="#000" stroke-width="3" stroke-linejoin="round"/><path d="M18 14h4l-1 12h-2zM18 28h4v4h-4z"/></svg>',
};
function showCard({ title, big, meta = '', icon = 'info', main = '确定', alt = null, onMain, onAlt, keepPaused = false }) {
  cardOpen = true;
  const wasPaused = W.paused;
  W.paused = true;
  $('cardTitle').textContent = title;
  $('cardBig').textContent = big;
  $('cardMeta').textContent = meta;
  $('cardIcon').innerHTML = ICONS[icon] || '';
  $('cardMain').textContent = main;
  $('cardAlt').hidden = !alt;
  if (alt) $('cardAlt').textContent = alt;
  $('cardWrap').hidden = false;
  const close = () => {
    cardOpen = false;
    $('cardWrap').hidden = true;
    if (!keepPaused) W.paused = wasPaused;
    last = performance.now();
  };
  $('cardMain').onclick = () => { sfx.click(); close(); onMain && onMain(); };
  $('cardAlt').onclick = () => { sfx.click(); close(); onAlt && onAlt(); };
}

function onDeath(cause, b) {
  st.deaths++;
  touchStats();
  sfx.error();
  saveNow();
  logLine('火柴人.exe 已停止工作');
  cancelPress();
  if (!S.deathCard) return;
  const secs = Math.round(b.age);
  const life = secs >= 60 ? `${Math.floor(secs / 60)} 分 ${secs % 60} 秒` : `${secs} 秒`;
  showCard({
    title: '火柴人.exe',
    icon: 'stop',
    big: '火柴人.exe 已停止工作',
    meta: `原因：${causeText(cause)}。\n这一个活了 ${life}，被整了 ${b.hitCount} 下。`,
    main: '重画', alt: '留着尸体',
    onMain: () => redraw(),
  });
}
function onAskBin() {
  cancelPress();
  sfx.ding();
  showCard({
    title: '确认文件删除',
    icon: 'ask',
    big: '确实要删除“火柴人”吗？',
    meta: '他还没活够，而且删除后无法恢复。',
    main: '是', alt: '是',
    keepPaused: true,
    onMain: () => W.binConfirm(),
    onAlt: () => W.binConfirm(),
  });
}
let deletedTimer = 0;
function onDeleted() {
  st.deaths++;
  touchStats();
  saveNow();
  deletedTimer = setTimeout(() => {
    sfx.error();
    showCard({ title: '回收站', icon: 'warn', big: '火柴人已被永久删除', meta: `这一个活了 ${Math.round(B.age)} 秒。\n你现在满意了吧。`, main: '重画一个', onMain: () => redraw() });
  }, 650);
}
function cancelPress() {
  if (!press) return;
  const p = press;
  press = null;
  if (p.kind === 'drag') tools.up(p.tool, p.x, p.y);
  W.preview = null;
}

function redraw() {
  if (B.state === 'draw') return;
  clearTimeout(deletedTimer);
  cancelPress();
  tools.cancelAuto();
  W.say('', 0);
  const x = W.w * (0.28 + Math.random() * 0.44);
  W.hand = null;
  B.spawn(x, true);
  lastHits = 0;
  $('bubble').hidden = true;
}

/* ─────────────── 菜单和标题栏 ─────────────── */
$('mNew').addEventListener('click', () => { if (!cardOpen) { sfx.click(); redraw(); } });
$('mClear').addEventListener('click', () => {
  if (cardOpen) return;
  sfx.click();
  cancelPress();
  tools.cancelAuto();
  W.clearAll();
  if (B.state === 'rag') B.ragT = 0.1;
});
$('mSlow').addEventListener('click', (e) => {
  if (cardOpen) return;
  sfx.click();
  W.slow = !W.slow;
  e.currentTarget.classList.toggle('on', W.slow);
});
const showHelp = () => showCard({
  title: '帮助',
  icon: 'info',
  big: '怎么整他',
  meta: '点右边选道具，再点画布，用在那个位置。\n长按画布：道具变大。\n选中的道具再点一下：直接用在他身上。\n他死了可以留着尸体接着玩，也可以点「重画」。',
});
$('mHelp').addEventListener('click', () => { if (!cardOpen) { sfx.click(); showHelp(); } });
$('btnSys').addEventListener('click', () => {
  if (cardOpen) return;
  sfx.click();
  showCard({ title: '关于', icon: 'info', big: '整蛊火柴人 1.0', meta: `已经画过 ${st.played} 个火柴人，弄坏了 ${st.deaths} 个。\n一共断了 ${st.limbs} 条胳膊腿。\n最爱的道具：${st.favorite}。` });
});
$('btnMin').addEventListener('click', () => { sfx.click(); hb.home(); });
$('btnMax').addEventListener('click', () => {
  if (cardOpen) return;
  sfx.ding();
  showCard({ title: '整蛊火柴人', icon: 'warn', big: '已经是最大了', meta: Math.min(window.innerWidth, window.innerHeight) >= 600 ? '这屏幕还不够你用的？' : '你手机就这么大。' });
});

/* ─────────────── 状态栏 ─────────────── */
let hudT = 0;
function setBar(id, numId, v) {
  v = Math.max(0, Math.min(100, Math.round(v)));
  const el = $(id);
  if (el._v !== v) { el._v = v; el.style.width = `${v}%`; $(numId).textContent = v; }
}
const FIG = { lArm: 'fLArm', rArm: 'fRArm', lLeg: 'fLLeg', rLeg: 'fRLeg' };
function hud(dt) {
  hudT -= dt;
  if (B.hitCount !== lastHits) {
    if (B.hitCount > lastHits) { st.hits += B.hitCount - lastHits; touchStats(); }
    lastHits = B.hitCount;
  }
  if (hudT > 0) return;
  hudT = 0.09;
  setBar('bHp', 'nHp', B.hp);
  setBar('bPain', 'nPain', B.pain);
  setBar('bFear', 'nFear', B.fear);
  const text = (id, v) => { const el = $(id); if (el.textContent !== v) el.textContent = v; };
  text('iState', B.statusText());
  const { lost, broke } = B.injury();
  text('iHurt', B.gone ? '查无此人' : !lost && !broke ? (B.dead ? '不完好' : '完好') : [lost ? `断 ${lost}` : '', broke ? `折 ${broke}` : ''].filter(Boolean).join(' · '));
  text('iHits', `${B.hitCount || 0} 下`);
  text('menuInfo', `第 ${B.num || 1} 个`);
  for (const [k, id] of Object.entries(FIG)) {
    const el = $(id);
    el.classList.toggle('lost', B.gone || !B.limbOK[k]);
    el.classList.toggle('broken', !!B.broken[k]);
  }
  $('fHead').classList.toggle('lost', B.gone || (!B.j.head && B.dead));
  $('fTorso').classList.toggle('lost', B.gone);
  $('fX').toggleAttribute('hidden', !(B.dead && !B.gone && B.j.head));
}

function bubblePos(dt) {
  const el = $('bubble');
  if (el.hidden) return;
  bubbleT -= dt;
  const h = B.j.head;
  if (bubbleT <= 0 || !h || h.hole || h.trap) { el.hidden = true; return; }
  const k = px / dpr;
  const sx = h.x * k, sy = h.y * k;
  const left = Math.max(3, Math.min(stageW - bubbleW - 5, sx - bubbleW / 2));
  const top = Math.max(2, sy - 12 * k - bubbleH - 9);
  el.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
  el.style.setProperty('--tail', `${Math.max(8, Math.min(bubbleW - 10, sx - left))}px`);
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
  if (!W.paused) tools.frame(dt);
  W.update(dt);
  W.draw(c, away);
  hud(dt);
  if (!W.paused) bubblePos(dt);
  saveT -= dt;
  if (saveT <= 0) { saveT = 5; if (B.state !== 'draw') saveNow(); }
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
showTool();
const saved = hb.load('world', null);
let restored = false;
if (saved && saved.pts && saved.pts.length) restored = W.restore(saved);
if (!restored || B.gone || !B.all.length) {
  if (restored) { W.pts = W.pts.filter((p) => !p.body); }
  B.spawn(W.w * 0.42, true);
}
lastHits = B.hitCount;
start();
if (!hb.load('seen', false)) {
  hb.save('seen', true);
  setTimeout(() => showCard({
    title: '欢迎使用',
    icon: 'info',
    big: '欢迎使用 整蛊火柴人',
    meta: '点右边选道具，再点画布。\n长按画布，道具变大。\n选中的道具再点一下，直接用在他身上。',
    main: '开始整他',
  }), 1300);
}

// 测试钩子
window.__prank = { W, B, tools, TOOLS, select: (id) => { sel = id; showTool(); }, step, layout, saveNow, redraw, stats: () => st, get rotated() { return rotated; }, get px() { return px; }, stop, start };
