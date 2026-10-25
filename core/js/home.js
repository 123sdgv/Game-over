// 主屏幕：每页 4 列 × 6 行的格子，图标可以放在任意一格（中间留空也行）、分页、Dock、长按整理。
// 整理时：拖到空格子就放过去；拖到别的图标上就和它交换位置；最后一页后面会多一页空白，可以拖过去开新页。
import { store, on } from './store.js';
import { h, toast } from './ui.js';
import { APPS, appById, iconOf, openApp } from './apps.js';

const COLS = 4, ROWS = 6, PER_PAGE = COLS * ROWS;
const DOCK_MAX = 4;

const $ = (id) => document.getElementById(id);
let editing = false;
let press = null;
let drag = null;

const emptyPage = () => new Array(PER_PAGE).fill(null);
const clone = (l) => ({ pages: l.pages.map((p) => p.slice()), dock: l.dock.slice() });

export function defaultLayout() {
  const pages = [emptyPage()];
  APPS.filter((a) => !a.system).forEach((a, i) => {
    const p = Math.floor(i / PER_PAGE);
    (pages[p] ||= emptyPage())[i % PER_PAGE] = a.id;
  });
  return { pages, dock: APPS.filter((a) => a.system).map((a) => a.id) };
}

export function getLayout() {
  let l = store.get('layout') || defaultLayout();
  if (!l.pages && Array.isArray(l.home)) { // 旧的格式：一串按顺序排好的图标
    const pages = [];
    l.home.forEach((id, i) => { (pages[Math.floor(i / PER_PAGE)] ||= emptyPage())[i % PER_PAGE] = id; });
    l = { pages, dock: l.dock || [] };
  }
  const known = new Set(APPS.map((a) => a.id));
  const seen = new Set();
  const ok = (id) => !!id && known.has(id) && !seen.has(id) && !!seen.add(id);
  const pages = (l.pages || []).map((pg) => {
    const out = emptyPage();
    (pg || []).slice(0, PER_PAGE).forEach((id, k) => { if (ok(id)) out[k] = id; });
    return out;
  }).filter((pg) => pg.some(Boolean));
  if (!pages.length) pages.push(emptyPage());
  const dock = (l.dock || []).filter(ok).slice(0, DOCK_MAX);
  // 新加入的游戏：放进第一个空格子
  for (const a of APPS) {
    if (seen.has(a.id)) continue;
    seen.add(a.id);
    if (a.system && dock.length < DOCK_MAX) { dock.push(a.id); continue; }
    const pg = pages.find((p) => p.includes(null)) || (pages.push(emptyPage()), pages[pages.length - 1]);
    pg[pg.indexOf(null)] = a.id;
  }
  return { pages, dock };
}

function saveLayout(l) {
  const pages = l.pages.filter((pg) => pg.some(Boolean));
  store.set('layout', { pages: pages.length ? pages : [emptyPage()], dock: l.dock });
}

/* ---------- 画 ---------- */
// 重画时沿用已有的图标元素：拖动途中手指按着的那个元素不能被换掉，否则手机会把手势当成滑动
let pool = new Map();
const appEl = (id, p, k) => {
  const a = appById(id);
  let el = pool.get(id);
  if (el) {
    pool.delete(id);
    const img = el.querySelector('img'), src = iconOf(a);
    if (img.getAttribute('src') !== src) img.setAttribute('src', src);
  } else {
    el = h('button', { class: 'app', 'data-id': id, 'aria-label': a.name },
      h('span', { class: 'icon' }, h('img', { src: iconOf(a), alt: '', draggable: 'false' })),
      h('span', { class: 'label' }, a.name));
  }
  el.dataset.p = p; el.dataset.k = k;
  return el;
};
const pageEl = (pg, p) => h('div', { class: 'page', 'data-p': p },
  pg.map((id, k) => (id ? appEl(id, p, k) : h('div', { class: 'slot', 'data-p': p, 'data-k': k }))));

function render(l) {
  pool = new Map([...document.querySelectorAll('#home .app')].map((e) => [e.dataset.id, e]));
  const pages = $('pages');
  const keep = pages.scrollLeft;
  const list = l.pages.slice();
  if (editing && list[list.length - 1].some(Boolean)) list.push(emptyPage());
  const pageEls = list.map(pageEl);
  const dockEls = l.dock.map((id, i) => appEl(id, -1, i));
  pages.replaceChildren(...pageEls);
  $('dock').replaceChildren(...dockEls);
  pool.clear();
  $('dots').replaceChildren(...list.map((_, i) => h('i', { class: 'dot', 'data-i': i })));
  $('dots').hidden = list.length < 2;
  pages.scrollLeft = keep;
  updateDots();
  $('device').classList.add('hide-labels');
}

export function renderHome() { render(getLayout()); }

function updateDots() {
  const pages = $('pages');
  const i = Math.round(pages.scrollLeft / Math.max(1, pages.clientWidth));
  $('dots').querySelectorAll('.dot').forEach((d, k) => d.classList.toggle('on', k === i));
}

/** 整理模式：最后一页后面多一页空白 */
function ensureExtraPage() {
  const pages = $('pages');
  const last = pages.lastElementChild;
  if (last && last.querySelector('.app')) {
    const p = pages.children.length;
    pages.append(pageEl(emptyPage(), p));
    $('dots').append(h('i', { class: 'dot', 'data-i': p }));
    $('dots').hidden = false;
  }
}

export function enterEdit() {
  if (editing) return;
  editing = true;
  $('home').classList.add('editing');
  ensureExtraPage();
  try { navigator.vibrate && navigator.vibrate(12); } catch {}
}
export function exitEdit() {
  if (!editing) return;
  editing = false;
  $('home').classList.remove('editing');
  renderHome();
}

/* ---------- 拖动 ---------- */
function rectInDevice(el) {
  const d = $('device').getBoundingClientRect();
  const r = el.getBoundingClientRect();
  return { x: r.left - d.left, y: r.top - d.top, w: r.width, h: r.height };
}
const appNode = (id) => document.querySelector(`#home .app[data-id="${id}"]`);
const posOf = (el) => (+el.dataset.p < 0 ? { dock: +el.dataset.k } : { p: +el.dataset.p, k: +el.dataset.k });
const sameTarget = (a, b) => !!a && !!b && a.dock === b.dock && a.p === b.p && a.k === b.k;

function startDrag() {
  const el = appNode(press.id);
  if (!el) return;
  const icon = el.querySelector('.icon');
  const r = rectInDevice(icon);
  const ghost = h('div', { class: 'ghost', style: { left: `${r.x}px`, top: `${r.y}px` } }, icon.cloneNode(true));
  $('device').append(ghost);
  el.classList.add('placeholder');
  const d = $('device').getBoundingClientRect();
  const base = getLayout();
  drag = { id: press.id, ghost, offX: press.x0 - d.left - r.x, offY: press.y0 - d.top - r.y, base, view: base, from: posOf(el), at: posOf(el), pending: null, timer: null, edgeTimer: null };
}

/** 从拖动开始时的布局出发，把图标挪到 to：空格子直接放，有图标就交换 */
function moveTo(base, id, from, to) {
  const l = clone(base);
  if (sameTarget(from, to)) return l;
  while (to.p !== undefined && to.p >= l.pages.length) l.pages.push(emptyPage());
  const fromDock = from.dock !== undefined, toDock = to.dock !== undefined;
  if (!fromDock && !toDock) {
    const other = l.pages[to.p][to.k];
    l.pages[to.p][to.k] = id;
    l.pages[from.p][from.k] = other === id ? null : other;
  } else if (fromDock && toDock) {
    l.dock.splice(from.dock, 1);
    l.dock.splice(Math.min(to.dock, l.dock.length), 0, id);
  } else if (!fromDock && toDock) {
    if (to.dock < l.dock.length && l.dock.length >= DOCK_MAX) {
      const other = l.dock[to.dock];
      l.dock[to.dock] = id; l.pages[from.p][from.k] = other;
    } else if (l.dock.length < DOCK_MAX) {
      l.pages[from.p][from.k] = null;
      l.dock.splice(Math.min(to.dock, l.dock.length), 0, id);
    } else return null;
  } else {
    const other = l.pages[to.p][to.k];
    l.pages[to.p][to.k] = id;
    if (other) l.dock[from.dock] = other; else l.dock.splice(from.dock, 1);
  }
  return l;
}

function applyTarget(to) {
  const next = moveTo(drag.base, drag.id, drag.from, to);
  if (!next) return;
  const before = new Map([...document.querySelectorAll('#home .app')].map((e) => [e.dataset.id, e.getBoundingClientRect()]));
  drag.view = next;
  render(next);
  const el = appNode(drag.id);
  if (el) { el.classList.add('placeholder'); drag.at = posOf(el); }
  for (const e of document.querySelectorAll('#home .app')) {
    if (e.dataset.id === drag.id) continue;
    const b = before.get(e.dataset.id), a = e.getBoundingClientRect();
    if (!b) continue;
    const dx = b.left - a.left, dy = b.top - a.top;
    if (dx || dy) e.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: 260, easing: 'cubic-bezier(.2,.8,.2,1)' });
  }
}

function moveDrag(x, y) {
  const d = $('device').getBoundingClientRect();
  drag.ghost.style.left = `${x - d.left - drag.offX}px`;
  drag.ghost.style.top = `${y - d.top - drag.offY}px`;

  // 靠近左右边缘时翻页
  const pages = $('pages');
  const edge = x - d.left < 22 ? -1 : d.right - x < 22 ? 1 : 0;
  if (edge && !drag.edgeTimer) {
    drag.edgeTimer = setTimeout(() => {
      if (drag) { pages.scrollBy({ left: edge * pages.clientWidth, behavior: 'smooth' }); drag.edgeTimer = null; }
    }, 550);
  } else if (!edge && drag.edgeTimer) { clearTimeout(drag.edgeTimer); drag.edgeTimer = null; }

  const hit = document.elementFromPoint(x, y);
  if (!hit) return;
  let to = null;
  const cell = hit.closest('#home .slot, #home .app');
  if (cell) to = posOf(cell);
  else if (hit.closest('#dock')) to = { dock: drag.view.dock.length };
  if (!to || sameTarget(to, drag.at) || sameTarget(to, drag.pending)) return;
  if (to.dock !== undefined && drag.at.dock !== undefined && to.dock >= drag.view.dock.length) return;
  drag.pending = to;
  clearTimeout(drag.timer);
  drag.timer = setTimeout(() => { if (drag && drag.pending) { const t = drag.pending; drag.pending = null; applyTarget(t); } }, 110);
}

function endDrag() {
  clearTimeout(drag.edgeTimer);
  clearTimeout(drag.timer);
  if (drag.pending) { const t = drag.pending; drag.pending = null; applyTarget(t); }
  const { ghost, id, view } = drag;
  saveLayout(view);
  const el = appNode(id);
  const r = el ? rectInDevice(el.querySelector('.icon')) : { x: 0, y: 0 };
  const a = ghost.animate([
    { left: ghost.style.left, top: ghost.style.top, transform: 'scale(1.12)' },
    { left: `${r.x}px`, top: `${r.y}px`, transform: 'scale(1)' },
  ], { duration: 220, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'forwards' });
  drag = null;
  a.onfinish = () => {
    ghost.remove();
    if (el) el.classList.remove('placeholder');
    render(getLayout());
    if (editing) ensureExtraPage();
  };
}

/* ---------- 手势 ---------- */
function wire() {
  const home = $('home');

  home.addEventListener('pointerdown', (e) => {
    if (e.button > 0) return;
    const el = e.target.closest('.app');
    if (!el) { press = { empty: true, x0: e.clientX, y0: e.clientY }; return; }
    press = { id: el.dataset.id, x0: e.clientX, y0: e.clientY, armed: editing, pid: e.pointerId };
    if (!editing) {
      press.timer = setTimeout(() => {
        if (!press || press.id !== el.dataset.id) return;
        press.timer = null;
        press.armed = true;
        enterEdit();
      }, 480);
    }
  });

  home.addEventListener('pointermove', (e) => {
    if (!press || press.empty) return;
    const dist = Math.hypot(e.clientX - press.x0, e.clientY - press.y0);
    if (drag) { moveDrag(e.clientX, e.clientY); return; }
    if (!press.armed && dist > 10) { clearTimeout(press.timer); press = null; return; }
    if (press.armed && dist > 5) {
      try { home.setPointerCapture(press.pid); } catch {}
      startDrag();
      if (drag) moveDrag(e.clientX, e.clientY);
    }
  });

  const up = (e, cancelled) => {
    if (!press) return;
    if (drag) { endDrag(); press = null; return; }
    if (press.empty) {
      const dist = Math.hypot(e.clientX - press.x0, e.clientY - press.y0);
      if (editing && dist < 8 && !cancelled) exitEdit();
      press = null; return;
    }
    if (press.timer && !cancelled) { clearTimeout(press.timer); openApp(press.id); }
    press = null;
  };
  home.addEventListener('pointerup', (e) => up(e, false));
  home.addEventListener('pointercancel', (e) => up(e, true));

  // 拖动时阻止页面滚动（iOS 需要在 touchmove 上 preventDefault）
  home.addEventListener('touchmove', (e) => { if (drag || (press && press.armed)) e.preventDefault(); }, { passive: false });
  home.addEventListener('contextmenu', (e) => e.preventDefault());

  $('done').addEventListener('click', exitEdit);
  $('pages').addEventListener('scroll', updateDots, { passive: true });

  on('layout', renderHome);
  on('icons', renderHome);
  on('app:open', exitEdit);
}

export function initHome() {
  renderHome();
  wire();
  if (!store.get('hint.edit')) {
    setTimeout(() => { toast('长按图标可以整理主屏幕'); store.set('hint.edit', 1); }, 1400);
  }
}
