// 钉子画：把闯关攒的螺丝一颗颗钉到画布上（像钻石画）。
//   单指点格子：空格 → 放当前颜色（扣仓库 1 颗）；普通螺丝 → 拿掉（退回仓库）；变色钉 → 弹出调色盘
//   单指拖：连着放 / 连着拿（设置里可以改成拖动画布）；双指：缩放、移动
// 画布很大（最大 100×100）：缩小时画缓存好的整张图，放大到看得清时只画屏幕里的格子。
import { sfx } from './sfx.js';
import { COLORS, headSprite, screwIcon, hexRgb, rgbHex } from './art.js';
import { PATTERNS, patternCells } from './patterns.js';
import { h, toast, card, sheet, closeSheet } from './ui.js';

const $ = (id) => document.getElementById(id);
const SPECIAL_CH = 7;
const MAXN = 100, MINN = 4;

let api = null;        // 外壳给的：inv() saveInv() settings() stats() saveStats() load() save() haptic() onClose()
let works = [];
let W = null;          // 正在画的作品
let view = { scale: 10, ox: 0, oy: 0, fit: 10 };
let dpr = 2, cw = 0, ch = 0;
let refCv = null, refData = null;
let holeCache = null, screwCache = null, cachePx = 8;
let sel = 0;           // 0–5 普通色，6 = 变色钉
let dirty = true, raf = 0, openFlag = false;
let saveT = 0;
const cv = $('edCv'), g = cv.getContext('2d');
const stage = $('edStage');

/* ======================================================================
   存档
   ====================================================================== */
function encode(w) {
  let s = '';
  for (let i = 0; i < w.cells.length; i++) s += String.fromCharCode(48 + w.cells[i]);
  return { id: w.id, name: w.name, w: w.w, h: w.h, cells: s, sp: w.sp, ref: w.ref, refOn: w.refOn, spColor: w.spColor, created: w.created, updated: w.updated };
}
function decode(o) {
  const cells = new Uint8Array(o.w * o.h);
  const s = o.cells || '';
  for (let i = 0; i < cells.length; i++) { const v = s.charCodeAt(i) - 48; cells[i] = v >= 0 && v <= 7 ? v : 0; }
  return { ...o, cells, sp: o.sp || {}, refOn: o.refOn !== false, spColor: o.spColor || '#FFFFFF' };
}
function saveWorks(now = false) {
  clearTimeout(saveT);
  const go = () => {
    api.save('works', works.map((w) => (w._enc && !w._dirty ? w._enc : (w._enc = encode(w), w._dirty = false, w._enc))));
    api.saveInv();
  };
  if (now) go(); else saveT = setTimeout(go, 400);
}
const touch = () => { if (W) { W._dirty = true; W.updated = Date.now(); } saveWorks(); };

export function initPaint(a) {
  api = a;
  works = (api.load('works', []) || []).map(decode);
}
export const allWorks = () => works;
export const placedCount = () => works.reduce((a, w) => a + w.cells.reduce((b, v) => b + (v ? 1 : 0), 0), 0);

/* ======================================================================
   底图
   ====================================================================== */
async function buildRef(w) {
  refCv = null; refData = null;
  if (!w.ref) return;
  const c = document.createElement('canvas');
  c.width = w.w; c.height = w.h;
  const x = c.getContext('2d');
  if (w.ref.type === 'pattern') {
    const cells = patternCells(w.ref.id, w.w, w.h);
    const img = x.createImageData(w.w, w.h);
    cells.forEach((v, i) => {
      if (v < 0) return;
      const [r, gg, b] = hexRgb(COLORS[v].base);
      img.data.set([r, gg, b, 255], i * 4);
    });
    x.putImageData(img, 0, 0);
  } else if (w.ref.type === 'image') {
    const im = new Image();
    im.src = w.ref.data;
    try { await im.decode(); } catch { return; }
    x.drawImage(im, 0, 0, w.w, w.h);
  }
  refCv = c;
  refData = x.getImageData(0, 0, w.w, w.h).data;
}
function refColorAt(i) {
  if (!refData || refData[i * 4 + 3] < 128) return null;
  return rgbHex([refData[i * 4], refData[i * 4 + 1], refData[i * 4 + 2]]);
}

/* ======================================================================
   缓存：空孔一张、螺丝一张，缩小时直接贴
   ====================================================================== */
const colorOf = (i) => (W.cells[i] === SPECIAL_CH ? (W.sp[i] || '#FFFFFF') : COLORS[W.cells[i] - 1].base);

const holeCacheMap = new Map();
function holeSprite(px) {
  px = Math.max(1, Math.round(px));
  if (holeCacheMap.has(px)) return holeCacheMap.get(px);
  const c = document.createElement('canvas');
  c.width = c.height = px;
  const x = c.getContext('2d');
  const r = Math.max(0.8, px * 0.15), m = px / 2;
  const rg = x.createRadialGradient(m, m - r * 0.3, 0, m, m, r);
  rg.addColorStop(0, 'rgba(55,65,90,.34)'); rg.addColorStop(1, 'rgba(55,65,90,.16)');
  x.beginPath(); x.arc(m, m, r, 0, Math.PI * 2); x.fillStyle = rg; x.fill();
  if (px >= 10) {
    x.beginPath(); x.arc(m, m, r + px * 0.025, Math.PI * 0.2, Math.PI * 0.8);
    x.strokeStyle = 'rgba(255,255,255,.95)'; x.lineWidth = Math.max(0.6, px * 0.025); x.stroke();
  }
  if (holeCacheMap.size > 40) holeCacheMap.clear();
  holeCacheMap.set(px, c);
  return c;
}

function buildCaches() {
  cachePx = Math.max(4, Math.min(32, Math.floor(1600 / Math.max(W.w, W.h))));
  holeCache = document.createElement('canvas');
  holeCache.width = W.w * cachePx; holeCache.height = W.h * cachePx;
  const hx = holeCache.getContext('2d');
  if (cachePx >= 6) {
    const hs = holeSprite(cachePx);
    for (let j = 0; j < W.h; j++) for (let i = 0; i < W.w; i++) hx.drawImage(hs, i * cachePx, j * cachePx);
  }
  screwCache = document.createElement('canvas');
  screwCache.width = W.w * cachePx; screwCache.height = W.h * cachePx;
  for (let i = 0; i < W.cells.length; i++) if (W.cells[i]) paintCache(i);
}
function paintCache(i) {
  const x = screwCache.getContext('2d');
  const cx = (i % W.w) * cachePx, cy = Math.floor(i / W.w) * cachePx;
  x.clearRect(cx, cy, cachePx, cachePx);
  if (!W.cells[i]) return;
  const sp = headSprite(colorOf(i), cachePx * 0.46, { shine: true });
  x.drawImage(sp.c, cx + cachePx / 2 - sp.c.width / 2, cy + cachePx / 2 - sp.c.height / 2);
}

/* ======================================================================
   画
   ====================================================================== */
function resize() {
  const r = stage.getBoundingClientRect();
  dpr = Math.min(3, devicePixelRatio || 1);
  cw = r.width; ch = r.height;
  cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr);
  cv.style.width = cw + 'px'; cv.style.height = ch + 'px';
  dirty = true;
}
function fitView() {
  const pad = 18;
  const s = Math.min((cw - pad * 2) / W.w, (ch - pad * 2) / W.h);
  view.fit = s;
  view.scale = s;
  view.ox = (cw - W.w * s) / 2;
  view.oy = (ch - W.h * s) / 2;
}
function clampView() {
  const bw = W.w * view.scale, bh = W.h * view.scale, keep = 60;
  view.ox = Math.min(cw - keep, Math.max(keep - bw, view.ox));
  view.oy = Math.min(ch - keep, Math.max(keep - bh, view.oy));
}

function draw() {
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, cw, ch);
  if (!W) return;
  const { scale: s, ox, oy } = view;
  const bw = W.w * s, bh = W.h * s;
  const pad = Math.max(6, Math.min(18, s * 0.6));
  // 画板
  g.save();
  g.shadowColor = 'rgba(30,45,80,.18)'; g.shadowBlur = 18; g.shadowOffsetY = 6;
  g.beginPath(); g.roundRect(ox - pad, oy - pad, bw + pad * 2, bh + pad * 2, Math.min(18, pad * 1.4));
  g.fillStyle = '#FFFFFF'; g.fill();
  g.restore();
  g.save();
  g.beginPath(); g.rect(ox, oy, bw, bh); g.clip();
  g.fillStyle = '#F7F8FB'; g.fillRect(ox, oy, bw, bh);
  if (W.refOn && refCv) {
    g.globalAlpha = 0.4;
    g.imageSmoothingEnabled = false;
    g.drawImage(refCv, ox, oy, bw, bh);
    g.globalAlpha = 1;
  }
  const direct = s * dpr > cachePx * 1.15;
  if (!direct) {
    g.imageSmoothingEnabled = true;
    g.drawImage(holeCache, ox, oy, bw, bh);
    g.drawImage(screwCache, ox, oy, bw, bh);
  } else {
    const i0 = Math.max(0, Math.floor(-ox / s)), i1 = Math.min(W.w - 1, Math.floor((cw - ox) / s));
    const j0 = Math.max(0, Math.floor(-oy / s)), j1 = Math.min(W.h - 1, Math.floor((ch - oy) / s));
    const hs = holeSprite(s * dpr);
    const rr = s * 0.46;
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const k = j * W.w + i;
        const x = ox + i * s, y = oy + j * s;
        if (!W.cells[k]) { g.drawImage(hs, x, y, s, s); continue; }
        const sp = headSprite(colorOf(k), rr * dpr, { shine: true });
        const ww = sp.c.width / dpr;
        g.drawImage(sp.c, x + s / 2 - ww / 2, y + s / 2 - ww / 2, ww, ww);
        if (W.cells[k] === SPECIAL_CH && s >= 16) {
          // 变色钉的小记号
          const cx = x + s * 0.8, cy = y + s * 0.2, r = s * 0.11;
          g.beginPath();
          for (let q = 0; q < 8; q++) { const a = (q / 8) * Math.PI * 2, rr2 = q % 2 ? r * 0.35 : r; g.lineTo(cx + Math.cos(a) * rr2, cy + Math.sin(a) * rr2); }
          g.closePath(); g.fillStyle = '#FFFFFF'; g.strokeStyle = 'rgba(40,50,80,.5)'; g.lineWidth = 0.8; g.fill(); g.stroke();
        }
      }
    }
  }
  g.restore();
}

function loop() {
  raf = requestAnimationFrame(loop);
  if (dirty) { dirty = false; draw(); }
}

/* ======================================================================
   调色板
   ====================================================================== */
function buildPalette() {
  const inv = api.inv();
  const el = $('palette');
  el.replaceChildren(...COLORS.map((c, i) => h('button.chip', { 'data-i': i, onclick: () => choose(i) },
    h('img', { src: screwIcon(c.base, 56), alt: '' }), h('b', {}, String(inv.c[i])), h('small', {}, c.name))),
  h('button.chip.sp', { 'data-i': 6, onclick: () => choose(6) },
    h('span.sp-icon', {}, h('img', { src: screwIcon('#F2F3F6', 56, { mode: 'star', rainbow: true }), alt: '' }), h('i.sp-dot', { style: { background: W.spColor } })),
    h('b', {}, String(inv.s)), h('small', {}, '变色钉')));
  markSel();
}
function updateCounts() {
  const inv = api.inv();
  $('palette').querySelectorAll('.chip').forEach((el) => {
    const i = +el.dataset.i;
    const n = i < 6 ? inv.c[i] : inv.s;
    el.querySelector('b').textContent = n;
    el.classList.toggle('zero', n <= 0);
  });
  const dotEl = $('palette').querySelector('.sp-dot');
  if (dotEl) dotEl.style.background = W.spColor;
}
function markSel() {
  $('palette').querySelectorAll('.chip').forEach((el) => el.classList.toggle('on', +el.dataset.i === sel));
  updateCounts();
}
function choose(i) {
  if (i === 6 && sel === 6) { pickColor(null); return; }
  sel = i;
  sfx.tap();
  markSel();
  if (i === 6 && !choose.told) { choose.told = true; tip('变色钉：钉上去以后点它可以改颜色；再点一下这里，换新钉的颜色'); }
}
function tip(t) {
  const el = $('edTip');
  el.textContent = t;
  el.classList.add('show');
  clearTimeout(tip._t);
  tip._t = setTimeout(() => el.classList.remove('show'), 2600);
}

/* ======================================================================
   放 / 拿
   ====================================================================== */
let warned = false;
function placeAt(k) {
  if (W.cells[k]) return false;
  const inv = api.inv();
  if (sel < 6) {
    if (inv.c[sel] <= 0) { if (!warned) { warned = true; sfx.empty(); toast(`${COLORS[sel].name}的螺丝用完了，去闯关攒一些吧`); } return false; }
    inv.c[sel]--;
    W.cells[k] = sel + 1;
  } else {
    if (inv.s <= 0) { if (!warned) { warned = true; sfx.empty(); toast('变色钉用完了：每通关几关会发一批'); } return false; }
    inv.s--;
    W.cells[k] = SPECIAL_CH;
    W.sp[k] = W.spColor;
  }
  sfx.place(sel);
  api.haptic(4);
  paintCache(k);
  bumpStat('placed', 1);
  dirty = true;
  return true;
}
function removeAt(k, special = false) {
  const v = W.cells[k];
  if (!v || (v === SPECIAL_CH && !special)) return false;
  const inv = api.inv();
  if (v === SPECIAL_CH) { inv.s++; delete W.sp[k]; } else inv.c[v - 1]++;
  W.cells[k] = 0;
  sfx.remove();
  paintCache(k);
  dirty = true;
  return true;
}
function bumpStat(key, n) {
  const st = api.stats();
  st[key] = (st[key] || 0) + n;
  api.saveStats(st);
}

function cellAt(x, y) {
  const i = Math.floor((x - view.ox) / view.scale), j = Math.floor((y - view.oy) / view.scale);
  if (i < 0 || j < 0 || i >= W.w || j >= W.h) return -1;
  return j * W.w + i;
}

/* ---------- 手势 ---------- */
const ptrs = new Map();
let stroke = null, gest = null, blocked = false;
const local = (e) => { const r = stage.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };

function beginStroke() {
  if (!stroke || stroke.started) return;
  clearTimeout(stroke.timer);
  stroke.started = true;
  warned = false;
  const k = cellAt(stroke.x0, stroke.y0);
  stroke.last = k;
  if (k < 0) { stroke.mode = 'pan'; return; }
  const v = W.cells[k];
  stroke.mode = !v ? 'place' : v === SPECIAL_CH ? 'pick' : 'erase';
  stroke.k0 = k;
  if (api.settings().dragPaint) {
    if (stroke.mode === 'place') placeAt(k);
    else if (stroke.mode === 'erase') removeAt(k);
    stroke.acted = true;
  }
}
function lineCells(a, b, fn) {
  let x0 = a % W.w, y0 = Math.floor(a / W.w);
  const x1 = b % W.w, y1 = Math.floor(b / W.w);
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (let n = 0; n < 400; n++) {
    fn(y0 * W.w + x0);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}

stage.addEventListener('pointerdown', (e) => {
  if (!W) return;
  e.preventDefault();
  try { stage.setPointerCapture(e.pointerId); } catch {}
  const [x, y] = local(e);
  ptrs.set(e.pointerId, { x, y });
  if (ptrs.size === 1 && !blocked) {
    stroke = { id: e.pointerId, x0: x, y0: y, x, y, started: false, moved: false };
    stroke.timer = setTimeout(beginStroke, 90);
  } else if (ptrs.size === 2) {
    if (stroke) { clearTimeout(stroke.timer); stroke = null; }
    const [a, b] = [...ptrs.values()];
    gest = { d0: Math.hypot(a.x - b.x, a.y - b.y), s0: view.scale, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, ox: view.ox, oy: view.oy };
    blocked = true;
  }
});
stage.addEventListener('pointermove', (e) => {
  if (!W || !ptrs.has(e.pointerId)) return;
  const [x, y] = local(e);
  ptrs.set(e.pointerId, { x, y });
  if (gest && ptrs.size >= 2) {
    const [a, b] = [...ptrs.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    const ns = Math.max(view.fit * 0.6, Math.min(64, gest.s0 * (d / Math.max(10, gest.d0))));
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    // 双指中点下面那个点保持不动
    const wx = (gest.mx - gest.ox) / gest.s0, wy = (gest.my - gest.oy) / gest.s0;
    view.scale = ns;
    view.ox = mx - wx * ns; view.oy = my - wy * ns;
    clampView();
    showZoom();
    dirty = true;
    return;
  }
  if (!stroke || stroke.id !== e.pointerId) return;
  const moved = Math.hypot(x - stroke.x0, y - stroke.y0) > 7;
  if (moved && !stroke.started) beginStroke();
  if (!stroke.started) return;
  const drag = api.settings().dragPaint;
  if (moved && !stroke.moved) {
    stroke.moved = true;
    if (!drag && stroke.mode !== 'pan') stroke.mode = 'pan';
  }
  if (stroke.mode === 'pan') {
    view.ox += x - stroke.x; view.oy += y - stroke.y;
    clampView();
    dirty = true;
  } else if (stroke.mode === 'place' || stroke.mode === 'erase') {
    const k = cellAt(x, y);
    if (k >= 0 && k !== stroke.last) {
      lineCells(stroke.last >= 0 ? stroke.last : k, k, (q) => (stroke.mode === 'place' ? placeAt(q) : removeAt(q)));
      stroke.last = k;
    }
  }
  stroke.x = x; stroke.y = y;
});
const endPtr = (e) => {
  if (!ptrs.has(e.pointerId)) return;
  ptrs.delete(e.pointerId);
  if (stroke && stroke.id === e.pointerId) {
    if (!stroke.started) beginStroke();
    const st = stroke;
    stroke = null;
    if (!st.moved) {
      if (st.mode === 'pick') pickColor(st.k0);
      else if (!st.acted && st.mode === 'place') placeAt(st.k0);
      else if (!st.acted && st.mode === 'erase') removeAt(st.k0);
    }
    if (st.mode !== 'pan') { updateCounts(); touch(); }
  }
  if (ptrs.size < 2) gest = null;
  if (ptrs.size === 0) blocked = false;
};
stage.addEventListener('pointerup', endPtr);
stage.addEventListener('pointercancel', endPtr);
stage.addEventListener('wheel', (e) => {
  if (!W) return;
  e.preventDefault();
  const [x, y] = local(e);
  const ns = Math.max(view.fit * 0.6, Math.min(64, view.scale * Math.exp(-e.deltaY * 0.0022)));
  const wx = (x - view.ox) / view.scale, wy = (y - view.oy) / view.scale;
  view.scale = ns; view.ox = x - wx * ns; view.oy = y - wy * ns;
  clampView(); showZoom(); dirty = true;
}, { passive: false });

function showZoom() {
  const el = $('edZoom');
  el.textContent = `${Math.round((view.scale / view.fit) * 100)}%`;
  el.classList.add('show');
  clearTimeout(showZoom._t);
  showZoom._t = setTimeout(() => el.classList.remove('show'), 700);
}

/* ======================================================================
   调色盘（变色钉）
   ====================================================================== */
const hsl = (hh, s, l) => {
  s /= 100; l /= 100;
  const k = (n) => (n + hh / 30) % 12, a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return rgbHex([f(0) * 255, f(8) * 255, f(4) * 255]);
};
const SWATCHES = (() => {
  const out = [];
  for (const [s, l] of [[90, 80], [88, 64], [82, 50], [78, 34]]) for (let i = 0; i < 12; i++) out.push(hsl(i * 30, s, l));
  for (let i = 0; i < 8; i++) { const v = Math.round(255 - (i * 255) / 7); out.push(rgbHex([v, v, v])); }
  return out;
})();

/** k = 点到的那颗（null = 设定之后新放的变色钉用什么颜色） */
function pickColor(k) {
  const editing = k != null;
  const old = editing ? (W.sp[k] || '#FFFFFF') : W.spColor;
  const group = editing ? [...W.cells.keys()].filter((i) => W.cells[i] === SPECIAL_CH && (W.sp[i] || '#FFFFFF') === old) : [];
  let batch = false, cur = old;
  const apply = (hex) => {
    cur = hex;
    if (!editing) { W.spColor = hex; updateCounts(); }
    else {
      for (const i of batch ? group : [k]) { W.sp[i] = hex; paintCache(i); }
      W.spColor = hex;
      updateCounts();
    }
    sw.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.c === cur));
    prev.style.background = hex;
    dirty = true;
    touch();
  };
  const sw = h('div.swatches', {}, ...SWATCHES.map((c) => h('button', { 'data-c': c, style: { background: c }, onclick: () => apply(c) })));
  const prev = h('i.pick-prev', { style: { background: old } });
  const refC = editing ? refColorAt(k) : null;
  const more = h('input', { type: 'color', value: old.length === 7 ? old : '#ffffff', oninput: (e) => apply(e.target.value.toUpperCase()) });
  const seg = editing && group.length > 1 ? h('div.seg2', {},
    h('button.on', { onclick: (e) => { batch = false; e.currentTarget.classList.add('on'); e.currentTarget.nextSibling.classList.remove('on'); } }, '只改这一颗'),
    h('button', { onclick: (e) => { batch = true; e.currentTarget.classList.add('on'); e.currentTarget.previousSibling.classList.remove('on'); if (cur !== old) apply(cur); } }, `同色的一起改 · ${group.length} 颗`)) : null;
  const body = h('div.pick', {},
    h('div.sheet-title', {}, prev, editing ? '改这颗变色钉的颜色' : '新放的变色钉用什么颜色'),
    seg,
    sw,
    h('div.pick-row', {},
      refC ? h('button.pick-ref', { onclick: () => apply(refC) }, h('i', { style: { background: refC } }), '用底图这一格的颜色') : null,
      h('label.pick-more', {}, h('i'), '更多颜色…', more)),
    h('div.sheet-btns', {},
      editing ? h('button.btn.ghost', { onclick: () => { closeSheet(); removeAt(k, true); updateCounts(); touch(); } }, '取下这颗') : null,
      h('button.btn', { onclick: () => closeSheet() }, '好')));
  sheet(body);
  sw.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.c === cur));
}

/* ======================================================================
   打开 / 关闭编辑器
   ====================================================================== */
export async function openEditor(w) {
  W = w;
  openFlag = true;
  $('editor').hidden = false;
  $('edName').textContent = w.name;
  $('edSize').textContent = `${w.w}×${w.h}`;
  $('edRef').hidden = !w.ref;
  $('edRef').classList.toggle('on', !!w.refOn);
  await buildRef(w);
  resize();
  fitView();
  buildCaches();
  buildPalette();
  dirty = true;
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(loop);
  const flags = api.load('flags', {});
  if (!flags.paintTip) {
    flags.paintTip = 1; api.save('flags', flags);
    setTimeout(() => tip(api.settings().dragPaint ? '单指点格子放螺丝，拖着能连着放；双指拖动、缩放' : '单指点格子放螺丝，拖动挪画布；双指缩放'), 300);
  }
}
export function closeEditor() {
  if (!W) return;
  saveWorks(true);
  cancelAnimationFrame(raf); raf = 0;
  W = null; openFlag = false;
  $('editor').hidden = true;
  api.onClose && api.onClose();
}
export const editorOpen = () => openFlag;
export function pauseEditor() { if (W) { saveWorks(true); cancelAnimationFrame(raf); raf = 0; } }
export function resumeEditor() { if (W) { resize(); clampView(); dirty = true; cancelAnimationFrame(raf); raf = requestAnimationFrame(loop); } }
export function refreshEditor() { if (W) { resize(); clampView(); dirty = true; } }

$('edBack').addEventListener('click', closeEditor);
$('edRef').addEventListener('click', () => {
  if (!W || !W.ref) return;
  W.refOn = !W.refOn;
  $('edRef').classList.toggle('on', W.refOn);
  tip(W.refOn ? '显示底图' : '隐藏底图');
  dirty = true; touch();
});
$('edTitle').addEventListener('click', () => renameSheet());
$('edMore').addEventListener('click', () => {
  if (!W) return;
  const n = W.cells.reduce((a, v) => a + (v ? 1 : 0), 0);
  sheet(h('div', {},
    h('div.sheet-title', {}, W.name),
    h('p.sheet-note', {}, `${W.w}×${W.h}，钉了 ${n} 颗`),
    h('button.row-btn', { onclick: () => renameSheet() }, '重命名'),
    h('button.row-btn', { onclick: () => { closeSheet(); fitView(); dirty = true; } }, '缩放到整张'),
    h('button.row-btn', { onclick: () => clearAllConfirm() }, '全部拿下来（退回仓库）'),
    h('button.row-btn.danger', { onclick: () => deleteConfirm() }, '删除这幅画')));
});
$('edExport').addEventListener('click', () => exportSheet());

function renameSheet() {
  if (!W) return;
  const inp = h('input.text-in', { value: W.name, maxLength: 16 });
  sheet(h('div', {},
    h('div.sheet-title', {}, '给这幅画起个名字'),
    inp,
    h('div.sheet-btns', {}, h('button.btn', { onclick: () => {
      const v = inp.value.trim();
      if (v) { W.name = v; $('edName').textContent = v; touch(); }
      closeSheet();
    } }, '好'))));
  setTimeout(() => inp.focus(), 250);
}
function returnAll(w) {
  const inv = api.inv();
  let n = 0;
  w.cells.forEach((v, i) => { if (!v) return; n++; if (v === SPECIAL_CH) inv.s++; else inv.c[v - 1]++; w.cells[i] = 0; });
  w.sp = {};
  return n;
}
function clearAllConfirm() {
  closeSheet();
  const n = W.cells.reduce((a, v) => a + (v ? 1 : 0), 0);
  if (!n) { toast('画布上还没有螺丝'); return; }
  card({ title: '全部拿下来？', meta: `画布上的 <b>${n}</b> 颗螺丝会退回仓库，底图还在。`, main: ['拿下来', () => { returnAll(W); buildCaches(); updateCounts(); touch(); dirty = true; }], alt: ['算了', null] });
}
function deleteConfirm() {
  closeSheet();
  const n = W.cells.reduce((a, v) => a + (v ? 1 : 0), 0);
  card({
    title: `删除「${W.name}」？`,
    meta: n ? `上面的 <b>${n}</b> 颗螺丝会退回仓库。` : '这幅画还是空的。',
    main: ['删除', () => { returnAll(W); works = works.filter((x) => x !== W); saveWorks(true); closeEditor(); }],
    alt: ['算了', null],
  });
}

/* ======================================================================
   导出图片
   ====================================================================== */
function renderExport(withRef) {
  const E = Math.max(8, Math.min(48, Math.floor(1800 / Math.max(W.w, W.h))));
  const pad = Math.round(E * 1.2);
  const c = document.createElement('canvas');
  c.width = W.w * E + pad * 2; c.height = W.h * E + pad * 2;
  const x = c.getContext('2d');
  x.fillStyle = '#FFFFFF'; x.fillRect(0, 0, c.width, c.height);
  x.fillStyle = '#F7F8FB'; x.fillRect(pad, pad, W.w * E, W.h * E);
  if (withRef && refCv) { x.globalAlpha = 0.4; x.imageSmoothingEnabled = false; x.drawImage(refCv, pad, pad, W.w * E, W.h * E); x.globalAlpha = 1; x.imageSmoothingEnabled = true; }
  const hs = holeSprite(E);
  for (let i = 0; i < W.cells.length; i++) {
    const cx = pad + (i % W.w) * E, cy = pad + Math.floor(i / W.w) * E;
    if (!W.cells[i]) { x.drawImage(hs, cx, cy); continue; }
    const sp = headSprite(colorOf(i), E * 0.46, { shine: true });
    x.drawImage(sp.c, cx + E / 2 - sp.c.width / 2, cy + E / 2 - sp.c.height / 2);
  }
  return c;
}
function exportSheet() {
  if (!W) return;
  let withRef = false;
  const go = () => {
    const c = renderExport(withRef);
    c.toBlob((blob) => {
      if (!blob) { toast('图片生成失败'); return; }
      const url = URL.createObjectURL(blob);
      const file = new File([blob], `${W.name}.png`, { type: 'image/png' });
      const canShare = navigator.canShare && navigator.canShare({ files: [file] });
      sheet(h('div.export', {},
        h('div.sheet-title', {}, '导出好了'),
        h('img.export-img', { src: url, alt: W.name }),
        h('p.sheet-note', {}, canShare ? '点下面存到相册，也可以长按图片保存。' : '长按图片就能存到相册。'),
        h('div.sheet-btns', {},
          h('button.btn.ghost', { onclick: () => closeSheet() }, '关闭'),
          canShare ? h('button.btn', { onclick: async () => { try { await navigator.share({ files: [file] }); } catch {} } }, '存到相册 / 分享') : null)),
      { onClose: () => setTimeout(() => URL.revokeObjectURL(url), 1000) });
      bumpStat('exports', 1);
    }, 'image/png');
  };
  if (!W.ref) { go(); return; }
  const tg = h('button.toggle', { 'aria-pressed': 'false', onclick: () => { withRef = !withRef; tg.setAttribute('aria-pressed', String(withRef)); } }, h('i'));
  sheet(h('div', {},
    h('div.sheet-title', {}, '导出图片'),
    h('div.opt-row', {}, h('span', {}, '把底图也画上去', h('small', {}, '没钉的格子会留着淡淡的底图颜色')), tg),
    h('div.sheet-btns', {}, h('button.btn', { onclick: go }, '生成图片'))));
}

/* ======================================================================
   新建
   ====================================================================== */
const clampN = (v) => Math.max(MINN, Math.min(MAXN, Math.round(+v || 0)));

export function newArtSheet(onDone) {
  let mode = 'blank', pat = PATTERNS[0].id, img = null, wv = 24, hv = 24;
  const preview = h('canvas.np-prev');
  const wIn = h('input.num', { type: 'number', inputMode: 'numeric', value: wv, min: MINN, max: MAXN });
  const hIn = h('input.num', { type: 'number', inputMode: 'numeric', value: hv, min: MINN, max: MAXN });
  const step = (inp, d) => h('button.step', { onclick: () => { inp.value = clampN(+inp.value + d); sync(); } }, d > 0 ? '+' : '−');
  const sync = () => { wv = clampN(wIn.value); hv = clampN(hIn.value); drawPreview(); };
  wIn.addEventListener('change', () => { wIn.value = clampN(wIn.value); if (mode === 'photo' && img) hIn.value = clampN(wIn.value * img.height / img.width); sync(); });
  hIn.addEventListener('change', () => { hIn.value = clampN(hIn.value); sync(); });

  const patGrid = h('div.pat-grid', {}, ...PATTERNS.map((p) => {
    const c = h('canvas');
    thumbPattern(c, p.id);
    return h('button.pat', { 'data-id': p.id, onclick: (e) => { pat = p.id; patGrid.querySelectorAll('.pat').forEach((b) => b.classList.toggle('on', b === e.currentTarget)); sync(); } }, c, h('span', {}, p.name));
  }));
  patGrid.firstChild.classList.add('on');
  const photoBtn = h('button.photo-btn', { onclick: () => $('fileIn').click() }, '从相册选一张照片');
  const photoBox = h('div.photo-box', {}, photoBtn);
  $('fileIn').onchange = async (e) => {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!f) return;
    const url = URL.createObjectURL(f);
    const im = new Image();
    im.src = url;
    try { await im.decode(); } catch { toast('这张图片读不出来'); return; }
    img = im;
    hIn.value = clampN(+wIn.value * im.height / im.width);
    photoBtn.textContent = '换一张';
    sync();
  };
  const segBtns = [['blank', '空白'], ['pattern', '图案'], ['photo', '照片']].map(([m, t]) => h('button', { 'data-m': m, onclick: () => setMode(m) }, t));
  const seg = h('div.seg3', {}, ...segBtns);
  const setMode = (m) => {
    mode = m;
    segBtns.forEach((b) => b.classList.toggle('on', b.dataset.m === m));
    patGrid.hidden = m !== 'pattern';
    photoBox.hidden = m !== 'photo';
    sync();
  };
  function refCells() {
    if (mode === 'pattern') return { pattern: patternCells(pat, wv, hv) };
    if (mode === 'photo' && img) return { image: photoData(img, wv, hv) };
    return null;
  }
  function drawPreview() {
    const n = Math.max(wv, hv);
    const box = 150, cs = box / n;
    preview.width = Math.round(wv * cs * 2); preview.height = Math.round(hv * cs * 2);
    preview.style.width = wv * cs + 'px'; preview.style.height = hv * cs + 'px';
    const x = preview.getContext('2d');
    x.fillStyle = '#F7F8FB'; x.fillRect(0, 0, preview.width, preview.height);
    const r = refCells();
    if (r && r.pattern) r.pattern.forEach((v, i) => { if (v < 0) return; x.fillStyle = COLORS[v].base; x.fillRect((i % wv) * cs * 2, Math.floor(i / wv) * cs * 2, cs * 2 + 0.5, cs * 2 + 0.5); });
    if (r && r.image) { x.imageSmoothingEnabled = false; x.drawImage(r.image, 0, 0, preview.width, preview.height); }
    if (cs * 2 >= 5) {
      x.fillStyle = 'rgba(70,82,110,.22)';
      for (let j = 0; j < hv; j++) for (let i = 0; i < wv; i++) { x.beginPath(); x.arc((i + 0.5) * cs * 2, (j + 0.5) * cs * 2, cs * 0.3, 0, Math.PI * 2); x.fill(); }
    }
  }
  const body = h('div.newart', {},
    h('div.sheet-title', {}, '新建画布'),
    seg, patGrid, photoBox,
    h('div.size-row', {},
      h('label', {}, '宽', step(wIn, -1), wIn, step(wIn, 1)),
      h('span.times', {}, '×'),
      h('label', {}, '高', step(hIn, -1), hIn, step(hIn, 1))),
    h('div.np-wrap', {}, preview),
    h('p.sheet-note', {}, `画布最大 ${MAXN}×${MAXN}，大画布可以双指放大了慢慢钉。`),
    h('div.sheet-btns', {}, h('button.btn', { onclick: () => create() }, '开始画')));
  function create() {
    sync();
    if (mode === 'photo' && !img) { toast('先选一张照片'); return; }
    let ref = null;
    if (mode === 'pattern') ref = { type: 'pattern', id: pat };
    if (mode === 'photo') ref = { type: 'image', data: photoData(img, wv, hv).toDataURL('image/png') };
    const num = works.length + 1;
    const name = mode === 'pattern' ? PATTERNS.find((p) => p.id === pat).name : `作品 ${num}`;
    const w = { id: 'w' + Date.now().toString(36), name, w: wv, h: hv, cells: new Uint8Array(wv * hv), sp: {}, ref, refOn: true, spColor: '#FFFFFF', created: Date.now(), updated: Date.now(), _dirty: true };
    works.unshift(w);
    saveWorks(true);
    bumpStat('paintings', 1);
    closeSheet();
    onDone && onDone(w);
  }
  sheet(body, { cls: 'tall' });
  setMode('blank');
}

/** 照片 → w×h（居中裁成画布的比例） */
function photoData(im, w, hh) {
  const c = document.createElement('canvas');
  c.width = w; c.height = hh;
  const x = c.getContext('2d');
  const ar = w / hh, iar = im.width / im.height;
  let sw = im.width, sh = im.height, sx = 0, sy = 0;
  if (iar > ar) { sw = im.height * ar; sx = (im.width - sw) / 2; } else { sh = im.width / ar; sy = (im.height - sh) / 2; }
  // 先缩到 4 倍再缩到格子大小，颜色更平均
  const mid = document.createElement('canvas');
  mid.width = w * 4; mid.height = hh * 4;
  const mx = mid.getContext('2d');
  mx.imageSmoothingQuality = 'high';
  mx.drawImage(im, sx, sy, sw, sh, 0, 0, mid.width, mid.height);
  x.imageSmoothingQuality = 'high';
  x.drawImage(mid, 0, 0, w, hh);
  return c;
}

function thumbPattern(c, id) {
  const n = 18, px = 3;
  c.width = n * px * 2; c.height = n * px * 2;
  c.style.width = n * px + 'px'; c.style.height = n * px + 'px';
  const x = c.getContext('2d');
  patternCells(id, n, n).forEach((v, i) => {
    if (v < 0) return;
    x.fillStyle = COLORS[v].base;
    x.beginPath(); x.arc(((i % n) + 0.5) * px * 2, (Math.floor(i / n) + 0.5) * px * 2, px * 0.92, 0, Math.PI * 2); x.fill();
  });
}

/* ======================================================================
   作品列表的缩略图
   ====================================================================== */
const thumbRefCache = new Map();
export function drawThumb(c, w, size = 150) {
  const n = Math.max(w.w, w.h), cs = size / n;
  const d = Math.min(3, devicePixelRatio || 1);
  c.width = Math.round(w.w * cs * d); c.height = Math.round(w.h * cs * d);
  c.style.width = w.w * cs + 'px'; c.style.height = w.h * cs + 'px';
  const x = c.getContext('2d');
  x.scale(d, d);
  x.fillStyle = '#F7F8FB'; x.fillRect(0, 0, w.w * cs, w.h * cs);
  const draw = (ref) => {
    if (ref) { x.globalAlpha = 0.28; x.imageSmoothingEnabled = false; x.drawImage(ref, 0, 0, w.w * cs, w.h * cs); x.globalAlpha = 1; }
    for (let i = 0; i < w.cells.length; i++) {
      const v = w.cells[i];
      if (!v) continue;
      x.fillStyle = v === SPECIAL_CH ? (w.sp[i] || '#FFFFFF') : COLORS[v - 1].base;
      const cx = ((i % w.w) + 0.5) * cs, cy = (Math.floor(i / w.w) + 0.5) * cs;
      if (cs >= 3) { x.beginPath(); x.arc(cx, cy, cs * 0.46, 0, Math.PI * 2); x.fill(); }
      else x.fillRect(cx - cs / 2, cy - cs / 2, cs, cs);
    }
  };
  if (w.ref && w.refOn !== false) {
    const key = w.id + JSON.stringify(w.ref).length + w.w + 'x' + w.h;
    const cached = thumbRefCache.get(key);
    if (cached) { draw(cached); return; }
    const rc = document.createElement('canvas');
    rc.width = w.w; rc.height = w.h;
    const rx = rc.getContext('2d');
    if (w.ref.type === 'pattern') {
      const img = rx.createImageData(w.w, w.h);
      patternCells(w.ref.id, w.w, w.h).forEach((v, i) => { if (v >= 0) img.data.set([...hexRgb(COLORS[v].base), 255], i * 4); });
      rx.putImageData(img, 0, 0);
      thumbRefCache.set(key, rc);
      draw(rc);
    } else {
      draw(null);
      const im = new Image();
      im.onload = () => { rx.drawImage(im, 0, 0, w.w, w.h); thumbRefCache.set(key, rc); x.clearRect(0, 0, w.w * cs, w.h * cs); x.fillStyle = '#F7F8FB'; x.fillRect(0, 0, w.w * cs, w.h * cs); draw(rc); };
      im.src = w.ref.data;
    }
  } else draw(null);
}

export const debug = { get W() { return W; }, get view() { return view; }, placeAt, removeAt, cellAt, draw: () => draw(), choose, pickColor, get sel() { return sel; } };
