// 主屏幕：图标网格、分页、Dock、长按整理（拖动排序）
import { store, on, emit } from './store.js';
import { h, toast } from './ui.js';
import { APPS, appById, iconOf, openApp } from './apps.js';

const PER_PAGE = 24;
const DOCK_MAX = 4;

const $ = (id) => document.getElementById(id);
let editing = false;
let press = null;
let drag = null;

export function defaultLayout() {
  return { home: APPS.filter((a) => !a.system).map((a) => a.id), dock: APPS.filter((a) => a.system).map((a) => a.id) };
}

export function getLayout() {
  const l = store.get('layout') || defaultLayout();
  const known = new Set(APPS.map((a) => a.id));
  const seen = new Set();
  const clean = (arr) => arr.filter((id) => known.has(id) && !seen.has(id) && seen.add(id));
  const out = { home: clean(l.home || []), dock: clean(l.dock || []).slice(0, DOCK_MAX) };
  // 新加入的游戏自动出现在主屏幕末尾
  for (const a of APPS) if (!seen.has(a.id)) (a.system && out.dock.length < DOCK_MAX ? out.dock : out.home).push(a.id);
  return out;
}

const appEl = (id) => {
  const a = appById(id);
  return h('button', { class: 'app', 'data-id': id, 'aria-label': a.name },
    h('span', { class: 'icon' }, h('img', { src: iconOf(a), alt: '', draggable: 'false' })),
    h('span', { class: 'label' }, a.name));
};

export function renderHome() {
  const l = getLayout();
  const pages = $('pages');
  const keep = pages.scrollLeft;
  pages.replaceChildren();
  const chunks = [];
  for (let i = 0; i < l.home.length; i += PER_PAGE) chunks.push(l.home.slice(i, i + PER_PAGE));
  if (!chunks.length) chunks.push([]);
  chunks.forEach((c) => pages.append(h('div', { class: 'page' }, c.map(appEl))));
  $('dock').replaceChildren(...l.dock.map(appEl));
  $('dots').replaceChildren(...chunks.map((_, i) => h('i', { class: 'dot', 'data-i': i })));
  $('dots').hidden = chunks.length < 2;
  pages.scrollLeft = keep;
  updateDots();
  document.getElementById('device').classList.toggle('hide-labels', store.get('home.labels', true) === false);
}

function updateDots() {
  const pages = $('pages');
  const i = Math.round(pages.scrollLeft / Math.max(1, pages.clientWidth));
  $('dots').querySelectorAll('.dot').forEach((d, k) => d.classList.toggle('on', k === i));
}

function saveFromDOM() {
  store.set('layout', {
    home: [...document.querySelectorAll('#pages .app')].map((e) => e.dataset.id),
    dock: [...document.querySelectorAll('#dock .app')].map((e) => e.dataset.id),
  });
}

export function enterEdit() {
  if (editing) return;
  editing = true;
  $('home').classList.add('editing');
  try { navigator.vibrate && navigator.vibrate(12); } catch {}
}
export function exitEdit() {
  if (!editing) return;
  editing = false;
  $('home').classList.remove('editing');
}

function rectInDevice(el) {
  const d = $('device').getBoundingClientRect();
  const r = el.getBoundingClientRect();
  return { x: r.left - d.left, y: r.top - d.top, w: r.width, h: r.height };
}

function flip(mutate) {
  const els = [...document.querySelectorAll('#home .app')];
  const before = new Map(els.map((e) => [e, e.getBoundingClientRect()]));
  mutate();
  for (const e of els) {
    if (drag && e === drag.el) continue;
    const b = before.get(e), a = e.getBoundingClientRect();
    const dx = b.left - a.left, dy = b.top - a.top;
    if (dx || dy) e.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: 280, easing: 'cubic-bezier(.2,.8,.2,1)' });
  }
}

function startDrag() {
  const el = press.el;
  const icon = el.querySelector('.icon');
  const r = rectInDevice(icon);
  const ghost = h('div', { class: 'ghost', style: { left: `${r.x}px`, top: `${r.y}px` } }, icon.cloneNode(true));
  $('device').append(ghost);
  el.classList.add('placeholder');
  const d = $('device').getBoundingClientRect();
  drag = { el, ghost, offX: press.x0 - d.left - r.x, offY: press.y0 - d.top - r.y, last: null, edgeTimer: null };
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
      drag && pages.scrollBy({ left: edge * pages.clientWidth, behavior: 'smooth' });
      if (drag) drag.edgeTimer = null;
    }, 550);
  } else if (!edge && drag.edgeTimer) { clearTimeout(drag.edgeTimer); drag.edgeTimer = null; }

  const hit = document.elementFromPoint(x, y);
  if (!hit) return;
  const target = hit.closest('#home .app') || hit.closest('#dock') || hit.closest('.page');
  if (!target || target === drag.last || target === drag.el) return;
  drag.last = target;
  const el = drag.el;
  const dock = $('dock');

  if (target.classList.contains('app')) {
    const intoDock = target.parentElement === dock && el.parentElement !== dock;
    if (intoDock && dock.children.length >= DOCK_MAX) return;
    flip(() => {
      const sameParent = target.parentElement === el.parentElement;
      const sib = [...target.parentElement.children];
      if (sameParent && sib.indexOf(el) < sib.indexOf(target)) target.after(el);
      else target.before(el);
    });
  } else if (target === dock) {
    if (el.parentElement !== dock && dock.children.length < DOCK_MAX) flip(() => dock.append(el));
  } else if (target.classList.contains('page') && el.parentElement !== target) {
    flip(() => target.append(el));
  }
}

function endDrag() {
  const { el, ghost } = drag;
  clearTimeout(drag.edgeTimer);
  const r = rectInDevice(el.querySelector('.icon'));
  const a = ghost.animate([
    { left: ghost.style.left, top: ghost.style.top, transform: 'scale(1.12)' },
    { left: `${r.x}px`, top: `${r.y}px`, transform: 'scale(1)' },
  ], { duration: 220, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'forwards' });
  drag = null;
  a.onfinish = () => {
    ghost.remove();
    el.classList.remove('placeholder');
    saveFromDOM();
    renderHome();
  };
}

function wire() {
  const home = $('home');

  home.addEventListener('pointerdown', (e) => {
    if (e.button > 0) return;
    const el = e.target.closest('.app');
    if (!el) { press = { empty: true, x0: e.clientX, y0: e.clientY }; return; }
    press = { el, id: el.dataset.id, x0: e.clientX, y0: e.clientY, armed: editing, pid: e.pointerId };
    if (!editing) {
      press.timer = setTimeout(() => {
        if (!press || press.el !== el) return;
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
      moveDrag(e.clientX, e.clientY);
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
  on('labels', renderHome);
  on('app:open', exitEdit);
}

export function initHome() {
  renderHome();
  wire();
  if (!store.get('hint.edit')) {
    setTimeout(() => { toast('长按图标可以整理主屏幕'); store.set('hint.edit', 1); }, 1400);
  }
}

export function editHomeNow() {
  emit('home:edit');
  enterEdit();
}
