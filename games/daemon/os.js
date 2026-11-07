// 「操作系统」：横屏布局、桌面图标、窗口、任务栏、开始菜单、右键菜单、对话框、气泡提示、手势。
import { G, P, S, emit, on, saveSoon, clockText, dn } from './state.js';
import { icon } from './art.js';
import { sfx } from './sfx.js';

const $ = (id) => document.getElementById(id);
export const desk = $('desk'), screen = $('screen'), winsEl = $('wins'), iconsEl = $('icons'), fx = $('fx');

/** 小工具：h('div.a.b', {attrs}, ...children) */
export function h(sel, attrs, ...kids) {
  const [tag, ...cls] = sel.split('.');
  const e = document.createElement(tag || 'div');
  if (cls.length) e.className = cls.join(' ');
  if (attrs) for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'html') e.innerHTML = v;
    else if (k === 'text') e.textContent = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
    else if (k === 'class') { for (const c of String(v).split(' ')) if (c) e.classList.add(c); }
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(String(c)));
  return e;
}

export const os = {
  rotated: false, W: 800, H: 360, tbH: 30, dpr: 1, big: false,
  apps: {}, wins: [], z: 10, lag: 0, modal: 0, busy: false,
};

/* ─────────── 布局：手机竖着拿就把整个界面转 90° ─────────── */
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

export function layout() {
  const vw = window.innerWidth, vh = window.innerHeight;
  os.dpr = Math.max(1, window.devicePixelRatio || 1);
  os.rotated = vh > vw && vw < 600;
  const CW = os.rotated ? vh : vw, CH = os.rotated ? vw : vh;
  desk.style.width = `${CW}px`; desk.style.height = `${CH}px`;
  desk.style.transform = os.rotated ? `translateX(${vw}px) rotate(90deg)` : 'none';
  desk.classList.toggle('rot', os.rotated);

  const s = safeAreas();
  const bar = s.b + 22;                 // 大厅的横条在这一边
  os.big = Math.min(CW, CH) >= 600;
  let L, R, T, B;
  if (os.rotated) { L = Math.max(s.t, 5); R = bar; T = 5; B = 5; }
  else { L = Math.max(s.l, 5); R = Math.max(s.r, 5); T = Math.max(s.t, 5); B = bar; }
  if (os.big) { L += 10; R += 10; T += 10; B += 6; }
  Object.assign(screen.style, { left: `${L}px`, top: `${T}px`, width: `${CW - L - R}px`, height: `${CH - T - B}px` });
  $('led').style.cssText = os.rotated ? `left:${CW - bar / 2 - 3}px;top:${CH - 18}px` : `left:${CW - 22}px;top:${CH - bar / 2 - 3}px`;
  os.W = CW - L - R; os.H = CH - T - B;

  const fsz = [11.5, 12.5, 14][(P.fontSize || 2) - 1] * (os.big ? 1.18 : 1);
  const root = document.documentElement.style;
  root.setProperty('--fs', `${fsz}px`);
  os.tbH = Math.round(fsz * 2.45);
  root.setProperty('--task', `${os.tbH}px`);
  root.setProperty('--title', `${Math.round(fsz * 2.05)}px`);
  root.setProperty('--icon', `${Math.round(fsz * 2.6)}px`);
  root.setProperty('--cellw', `${Math.round(fsz * 6.2)}px`);
  root.setProperty('--cellh', `${Math.round(fsz * 6)}px`);
  os.deskH = os.H - os.tbH;
  emit('layout');
  for (const w of os.wins) fitWin(w);
}

/** 屏幕坐标 → 「屏幕」里的坐标（考虑旋转） */
export function pt(e) {
  const r = screen.getBoundingClientRect();
  if (os.rotated) return { x: e.clientY - r.top, y: r.right - e.clientX };
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}
/** 元素在「屏幕」里的矩形 */
export function rectOf(el) {
  const r = el.getBoundingClientRect(), s = screen.getBoundingClientRect();
  if (os.rotated) return { x: r.top - s.top, y: s.right - r.right, w: r.height, h: r.width };
  return { x: r.left - s.left, y: r.top - s.top, w: r.width, h: r.height };
}

/* ─────────── 手势：点、双击、长按、拖、滚动（全部自己处理，转过来以后也一样） ─────────── */
export function gesture(el, o) {
  let g = null;
  const LONG = o.longMs || 420;
  el.addEventListener('pointerdown', (e) => {
    if (g || (e.button && e.button !== 0)) return;
    if (o.ignore && o.ignore(e)) return;
    const p = pt(e);
    e.stopPropagation();
    g = { id: e.pointerId, x0: p.x, y0: p.y, x: p.x, y: p.y, t0: performance.now(), mode: null, target: e.target, vy: 0, lastY: p.y, lastT: performance.now() };
    // 先不抓住手指：不然里面按钮的 click 会被吞掉。真开始拖 / 滚的时候再抓
    const grab = () => { try { el.setPointerCapture(g.id); } catch {} };
    g.grab = grab;
    if (o.long || o.drag) g.timer = setTimeout(() => {
      if (!g || g.mode) return;
      if (o.drag && o.dragOnLong) { g.mode = 'drag'; grab(); o.drag.start && o.drag.start(g, e); }
      else if (o.long) { g.mode = 'long'; o.long(g, e); }
    }, LONG);
    o.down && o.down(g, e);
  });
  el.addEventListener('pointermove', (e) => {
    if (!g || e.pointerId !== g.id) return;
    const p = pt(e);
    const dx = p.x - g.x, dy = p.y - g.y;
    g.x = p.x; g.y = p.y;
    if (!g.mode && Math.hypot(p.x - g.x0, p.y - g.y0) > 7) {
      clearTimeout(g.timer);
      if (o.drag && !o.dragOnLong) { g.mode = 'drag'; g.grab(); o.drag.start && o.drag.start(g, e); }
      else if (o.scroll) { g.mode = 'scroll'; g.grab(); stopMomentum(o.scroll()); }
      else g.mode = 'cancel';
    }
    if (g.mode === 'drag') o.drag.move && o.drag.move(g, dx, dy, e);
    else if (g.mode === 'scroll') {
      const sc = o.scroll();
      if (sc) { sc.scrollTop -= dy; if (o.scrollX) sc.scrollLeft -= dx; }
      const t = performance.now();
      g.vy = 0.8 * (-(p.y - g.lastY) / Math.max(1, t - g.lastT)) + 0.2 * g.vy;
      g.lastY = p.y; g.lastT = t;
    }
  });
  const end = (e, cancel) => {
    if (!g || e.pointerId !== g.id) return;
    clearTimeout(g.timer);
    const gg = g;
    g = null;
    if (gg.mode === 'drag') { o.drag.end && o.drag.end(gg, cancel, e); return; }
    if (gg.mode === 'scroll') { if (performance.now() - gg.lastT < 80) momentum(o.scroll(), gg.vy); return; }
    if (gg.mode || cancel) return;
    o.tap && o.tap(gg, e);
  };
  el.addEventListener('pointerup', (e) => end(e, false));
  el.addEventListener('pointercancel', (e) => end(e, true));
}
const moms = new WeakMap();
function stopMomentum(sc) { if (sc && moms.get(sc)) { cancelAnimationFrame(moms.get(sc)); moms.delete(sc); } }
function momentum(sc, v) {
  if (!sc || Math.abs(v) < 0.08) return;
  let last = performance.now();
  const step = (t) => {
    const dt = t - last; last = t;
    sc.scrollTop += v * dt;
    v *= Math.pow(0.994, dt);
    if (Math.abs(v) > 0.02) moms.set(sc, requestAnimationFrame(step)); else moms.delete(sc);
  };
  moms.set(sc, requestAnimationFrame(step));
}
/** 一个能滚的区域：手指拖就滚，点的东西照常点 */
export function scrollable(sc, tapTarget = sc) {
  sc.classList.add('scroll');
  gesture(tapTarget, { scroll: () => sc, tap: () => {} });
}

/* ─────────── 窗口 ─────────── */
export function register(id, def) { os.apps[id] = def; }

function fitWin(w) {
  const W = os.W, H = os.deskH;
  if (w.max) { Object.assign(w.el.style, { left: '0px', top: '0px', width: `${W}px`, height: `${H}px` }); return; }
  w.w = Math.min(w.w, W); w.h = Math.min(w.h, H);
  w.x = Math.max(-w.w + 70, Math.min(W - 60, w.x));
  w.y = Math.max(0, Math.min(H - 22, w.y));
  Object.assign(w.el.style, { left: `${w.x}px`, top: `${w.y}px`, width: `${w.w}px`, height: `${w.h}px` });
}
function place(w, def) {
  const W = os.W, H = os.deskH;
  const sz = def.size || {};
  w.w = Math.round(Math.min(W - 8, Math.max(sz.minW || 240, Math.min(sz.maxW || 620, W * (sz.w || 0.66)))));
  w.h = Math.round(Math.min(H - 4, Math.max(sz.minH || 160, Math.min(sz.maxH || 460, H * (sz.h || 0.86)))));
  if (os.big) { w.w = Math.round(Math.min(W - 40, w.w * 1.25)); w.h = Math.round(Math.min(H - 40, w.h * 1.15)); }
  const n = os.wins.filter((x) => !x.min).length;
  const cx = (W - w.w) / 2, cy = (H - w.h) / 2;
  w.x = Math.round(def.at === 'random' ? 10 + Math.random() * (W - w.w - 20) : cx + ((n % 5) - 2) * 18);
  w.y = Math.round(def.at === 'random' ? 6 + Math.random() * (H - w.h - 12) : Math.max(2, cy + ((n % 5) - 2) * 14));
}

let winSeq = 1;
export function open(appId, args = {}, from = null) {
  const def = os.apps[appId];
  if (!def) return null;
  if (def.single) {
    const ex = os.wins.find((w) => w.app === appId);
    if (ex) { if (ex.min) restoreWin(ex); focus(ex); ex.inst.reopen && ex.inst.reopen(args); return ex; }
  }
  const w = { id: winSeq++, app: appId, args, max: false, min: false };
  place(w, def);
  if (args.rect) Object.assign(w, args.rect);
  if (args.max) w.max = true;
  const tb = h('div.tb', null,
    h('span.tic', { html: icon(def.icon) }),
    h('span.tt', { text: def.title }),
    h('div.tbb', null,
      def.noMin ? null : h('button.b-min', { 'aria-label': '最小化', html: '<i></i>' }),
      def.noMax ? null : h('button.b-max', { 'aria-label': '最大化', html: '<i></i>' }),
      h('button.b-x', { 'aria-label': '关闭', html: '<i></i>' })));
  const body = h('div.wb');
  const el = h(`div.win.app-${appId}`, { 'data-win': w.id }, tb, body, def.noResize ? null : h('div.grip'));
  w.el = el; w.body = body; w.tb = tb;
  w.setTitle = (t) => { tb.querySelector('.tt').textContent = t; if (w.task) w.task.querySelector('span').textContent = t; };
  w.flash = () => { if (w.task && !w.focused) w.task.classList.add('flash'); };
  winsEl.append(el);
  fitWin(w);
  os.wins.push(w);
  w.inst = def.create(w, args) || {};
  if (def.taskbar !== false) {
    w.task = h('button.tbtn', { html: `${icon(def.icon)}<span></span>` });
    w.task.querySelector('span').textContent = w.inst.title || def.title;
    w.task.addEventListener('click', () => {
      if (w.min) { restoreWin(w); focus(w); } else if (w.focused) minimize(w); else focus(w);
    });
    $('tasks').append(w.task);
  }
  if (w.inst.title) w.setTitle(w.inst.title);
  // 标题栏：拖动、双击最大化
  let lastTap = 0;
  gesture(tb, {
    ignore: (e) => !!e.target.closest('button'),
    down: () => focus(w),
    drag: {
      start: () => { if (w.max) return; el.classList.add('dragging'); w._f = 0; },
      move: (g, dx, dy) => {
        if (w.max) return;
        w.x += dx; w.y += dy;
        w._f = (w._f || 0) + 1;
        if (os.lag > 0.05 && w._f % (1 + Math.round(os.lag * 7))) return;
        fitWin(w);
      },
      end: () => { el.classList.remove('dragging'); fitWin(w); saveSoon(); },
    },
    tap: () => { const t = performance.now(); if (t - lastTap < 380 && !def.noMax) toggleMax(w); lastTap = t; },
  });
  tb.querySelector('.b-x').addEventListener('click', (e) => { e.stopPropagation(); close(w); });
  tb.querySelector('.b-min')?.addEventListener('click', (e) => { e.stopPropagation(); minimize(w); });
  tb.querySelector('.b-max')?.addEventListener('click', (e) => { e.stopPropagation(); toggleMax(w); });
  el.addEventListener('pointerdown', () => focus(w), true);
  const grip = el.querySelector('.grip');
  if (grip) gesture(grip, {
    drag: {
      start: () => { w.max = false; el.classList.remove('max'); },
      move: (g, dx, dy) => {
        const sz = def.size || {};
        w.w = Math.max(sz.minW || 200, w.w + dx); w.h = Math.max(sz.minH || 120, w.h + dy);
        fitWin(w); w.inst.resize && w.inst.resize();
      },
      end: () => saveSoon(),
    },
  });
  el.classList.toggle('max', w.max);
  focus(w);
  if (!args.quiet) {
    sfx.open();
    zoom(from ? rectOf(from) : null, w);
  }
  emit('win:open', w);
  saveSoon();
  return w;
}

function zoom(src, w, reverse = false) {
  if (!P.anim) return;
  const dst = w.max ? { x: 0, y: 0, w: os.W, h: os.deskH } : { x: w.x, y: w.y, w: w.w, h: w.h };
  const a = src || { x: dst.x + dst.w / 2 - 20, y: dst.y + dst.h / 2 - 12, w: 40, h: 24 };
  const [p0, p1] = reverse ? [dst, a] : [a, dst];
  const r = h('div.zoomrect');
  fx.append(r);
  const k = (p) => ({ left: `${p.x}px`, top: `${p.y}px`, width: `${p.w}px`, height: `${p.h}px` });
  r.animate([{ ...k(p0), opacity: 1 }, { ...k(p1), opacity: 0.7 }], { duration: 170, easing: 'steps(6, end)' }).onfinish = () => r.remove();
  if (!reverse) w.el.animate([{ opacity: 0, transform: 'scale(.96)' }, { opacity: 1, transform: 'none' }], { duration: 160, delay: 120, easing: 'ease-out', fill: 'backwards' });
}

export function focus(w) {
  if (!w || w.closed) return;
  for (const x of os.wins) { x.focused = x === w; x.el.classList.toggle('on', x === w); x.task && x.task.classList.toggle('on', x === w && !x.min); }
  if (w.task) w.task.classList.remove('flash');
  w.el.style.zIndex = ++os.z;
  w.inst.focus && w.inst.focus();
  emit('win:focus', w);
}
export function close(w, quiet = false) {
  if (!w || w.closed) return;
  if (w.inst.beforeClose && w.inst.beforeClose() === false) return;
  w.closed = true;
  os.wins = os.wins.filter((x) => x !== w);
  w.inst.close && w.inst.close();
  if (w.task) w.task.remove();
  if (!quiet && P.anim) {
    w.el.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(.97)' }], { duration: 120, easing: 'ease-in' }).onfinish = () => w.el.remove();
  } else w.el.remove();
  if (!quiet) sfx.close();
  const top = [...os.wins].filter((x) => !x.min).sort((a, b) => +b.el.style.zIndex - +a.el.style.zIndex)[0];
  if (top) focus(top);
  emit('win:close', w);
  saveSoon();
}
export function minimize(w) {
  if (w.min) return;
  w.min = true;
  if (w.task && P.anim) zoom(rectOf(w.task), w, true);
  w.el.hidden = true;
  w.focused = false;
  w.task && w.task.classList.remove('on');
  sfx.min();
  saveSoon();
}
function restoreWin(w) {
  w.min = false;
  w.el.hidden = false;
  if (w.task && P.anim) zoom(rectOf(w.task), w);
}
export function toggleMax(w) {
  w.max = !w.max;
  w.el.classList.toggle('max', w.max);
  fitWin(w);
  w.inst.resize && w.inst.resize();
  sfx.click();
  saveSoon();
}
export const find = (appId) => os.wins.find((w) => w.app === appId);
export const findAll = (appId) => os.wins.filter((w) => w.app === appId);
export function closeAll(quiet = true) { for (const w of [...os.wins]) close(w, quiet); }

/* ─────────── 对话框 ─────────── */
export function msg({ title = '提示', text = '', ic = 'info', buttons = ['确定'], sound = true, parent = null } = {}) {
  return new Promise((res) => {
    os.modal++;
    const shade = h('div.modal');
    const btns = h('div.mbtns');
    const box = h('div.win.msgbox.on', null,
      h('div.tb', null, h('span.tt', { text: title }), h('div.tbb', null, h('button.b-x', { 'aria-label': '关闭', html: '<i></i>' }))),
      h('div.wb', null, h('div.mrow', null, h('span.mic', { html: icon(ic) }), h('div.mtext', { text })), btns));
    const done = (i) => { os.modal--; shade.remove(); res(i); };
    buttons.forEach((b, i) => btns.append(h('button.btn', { text: b, onclick: () => { sfx.click(); done(i); } })));
    box.querySelector('.b-x').addEventListener('click', () => done(-1));
    shade.append(box);
    $('modal').append(shade);
    if (sound) (ic === 'err' || ic === 'warn' ? sfx.error() : sfx.ding());
    box.animate([{ transform: 'scale(.94)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 140, easing: 'ease-out' });
  });
}

/* ─────────── 右键菜单（长按） ─────────── */
let ctxEl = null;
export function menu(x, y, items) {
  hideMenu();
  ctxEl = h('div.ctx');
  for (const it of items) {
    if (it === '-') { ctxEl.append(h('div.sep')); continue; }
    ctxEl.append(h('button', { text: it.label, disabled: it.disabled || null, class: it.bold ? 'b' : null, onclick: (e) => { e.stopPropagation(); hideMenu(); sfx.click(); it.act && it.act(); } }));
  }
  screen.append(ctxEl);
  const r = { w: ctxEl.offsetWidth, h: ctxEl.offsetHeight };
  ctxEl.style.left = `${Math.max(2, Math.min(os.W - r.w - 2, x))}px`;
  ctxEl.style.top = `${Math.max(2, Math.min(os.H - r.h - 2, y))}px`;
  sfx.pop();
}
export function hideMenu() { if (ctxEl) { ctxEl.remove(); ctxEl = null; } }
screen.addEventListener('pointerdown', (e) => {
  if (ctxEl && !ctxEl.contains(e.target)) hideMenu();
  if (!e.target.closest('#startMenu,#start')) toggleStart(false);
  if (!e.target.closest('#todoPop,#todo')) $('todoPop').hidden = true;
}, true);

/* ─────────── 气泡提示（任务栏右下角） ─────────── */
let balloonT = 0;
export function balloon(title, text, act = null, ms = 6500) {
  const b = $('balloon');
  b.innerHTML = '';
  b.append(h('b', { text: title }), h('p', { text }), h('button.bx', { 'aria-label': '关闭', html: '<i></i>', onclick: (e) => { e.stopPropagation(); b.hidden = true; } }));
  b.onclick = () => { b.hidden = true; act && act(); };
  b.hidden = false;
  b.animate([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: 180, easing: 'ease-out' });
  clearTimeout(balloonT);
  balloonT = setTimeout(() => { b.hidden = true; }, ms);
  sfx.notify();
}

/* ─────────── 开始菜单 ─────────── */
export function toggleStart(show = $('startMenu').hidden) {
  $('startMenu').hidden = !show;
  $('start').classList.toggle('on', show);
  if (show) { sfx.click(); emit('start:open'); }
}
$('start').addEventListener('click', () => toggleStart());

/* ─────────── 任务栏时钟 ─────────── */
export function tickClock() {
  $('clock').textContent = clockText();
}

/* ─────────── 桌面图标 ─────────── */
export const DESK = [];   // { id, name, icon, open }
let selIcon = null;
export function deskIcons(list) { DESK.length = 0; DESK.push(...list); renderIcons(); }

export function defaultSpot(i) {
  const cw = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--cellw')) || 74;
  const ch = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--cellh')) || 72;
  const rows = Math.max(1, Math.floor((os.deskH - 8) / ch));
  return { x: 6 + Math.floor(i / rows) * cw, y: 6 + (i % rows) * ch };
}
export function arrangeIcons() {
  G.desk.icons = {};
  DESK.forEach((d, i) => { G.desk.icons[d.id] = defaultSpot(i); });
  renderIcons(true);
  saveSoon();
}
export function renderIcons(animate = false) {
  iconsEl.innerHTML = '';
  DESK.forEach((d, i) => {
    const pos = (G.desk && G.desk.icons && G.desk.icons[d.id]) || defaultSpot(i);
    const e = h('div.dicon', { 'data-id': d.id, html: `${icon(typeof d.icon === 'function' ? d.icon() : d.icon)}<span></span>` });
    e.querySelector('span').textContent = typeof d.name === 'function' ? d.name() : d.name;
    e.style.left = `${Math.max(0, Math.min(os.W - 60, pos.x))}px`;
    e.style.top = `${Math.max(0, Math.min(os.deskH - 60, pos.y))}px`;
    if (animate && P.anim) e.animate([{ transform: 'scale(.6)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 220, delay: i * 25, easing: 'cubic-bezier(.2,.9,.3,1.3)', fill: 'backwards' });
    if (d.drop) e.dataset.drop = d.drop;
    iconsEl.append(e);
    let last = 0;
    gesture(e, {
      tap: () => {
        const t = performance.now();
        const again = selIcon === d.id && t - last < 900;
        selectIcon(d.id);
        if (again || t - last < 380) { selIcon = null; e.classList.remove('sel'); d.open(e); }
        last = t;
      },
      dragOnLong: false,
      drag: {
        start: () => { selectIcon(d.id); e.classList.add('lift'); },
        move: (g, dx, dy) => { e.style.left = `${parseFloat(e.style.left) + dx}px`; e.style.top = `${parseFloat(e.style.top) + dy}px`; },
        end: () => {
          e.classList.remove('lift');
          const x = Math.max(0, Math.min(os.W - 60, parseFloat(e.style.left))), y = Math.max(0, Math.min(os.deskH - 60, parseFloat(e.style.top)));
          G.desk.icons = G.desk.icons || {};
          // 没摆过的图标先把默认位置记下来，不然拖一个其他的会跳
          DESK.forEach((dd, j) => { if (!G.desk.icons[dd.id]) G.desk.icons[dd.id] = defaultSpot(j); });
          G.desk.icons[d.id] = { x, y };
          e.style.left = `${x}px`; e.style.top = `${y}px`;
          emit('icons:moved');
          saveSoon();
        },
      },
    });
  });
}
function selectIcon(id) {
  selIcon = id;
  for (const e of iconsEl.children) e.classList.toggle('sel', e.dataset.id === id);
}
// 点桌面空白处：取消选中；长按：右键菜单
gesture($('wall'), {
  tap: () => { selectIcon(null); },
  long: (g) => emit('desk:menu', g.x, g.y),
});

/** 窗口外面那层：给游戏用的全屏遮罩（开机、蓝屏、关机） */
export const overlay = $('overlay');
