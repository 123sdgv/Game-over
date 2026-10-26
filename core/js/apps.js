// App 列表 + 窗口管理（打开 / 回到主屏幕的动画、底部横条手势）
import { games } from '../../games/registry.js';
import { store, emit } from './store.js';
import { h } from './ui.js';

export const SYSTEM_APPS = [{ id: 'settings', name: '设置', system: true, icons: ['core/assets/settings.svg'] }];
export const APPS = [...SYSTEM_APPS, ...games.map((g) => ({ ...g, icons: g.icons.map((i) => g.path + i) }))];
export const appById = (id) => APPS.find((a) => a.id === id);
export const iconOf = (app) => app.icons[store.get('icons', {})[app.id] || 0] || app.icons[0];

const device = () => document.getElementById('device');
const windows = new Map();
let current = null;
let busy = false;
let settingsFactory = null;
export const registerSettings = (fn) => { settingsFactory = fn; };
export const currentApp = () => current && current.app.id;

function rectIn(el) {
  const d = device().getBoundingClientRect();
  const r = el.getBoundingClientRect();
  return { x: r.left - d.left, y: r.top - d.top, w: r.width, h: r.height };
}

function iconRect(id) {
  const d = device().getBoundingClientRect();
  const el = document.querySelector(`#home .app[data-id="${id}"] .icon`);
  if (el) {
    const r = el.getBoundingClientRect();
    if (r.width && r.left >= d.left - 1 && r.right <= d.right + 1) return rectIn(el);
  }
  return { x: d.width / 2 - 31, y: d.height / 2 - 31, w: 62, h: 62 };
}

const deviceRadius = () => parseFloat(getComputedStyle(device()).getPropertyValue('--radius-device')) || 0;

function shrinkTo(r) {
  const d = device().getBoundingClientRect();
  const sx = r.w / d.width, sy = r.h / d.height;
  return { transform: `translate(${r.x}px, ${r.y}px) scale(${sx}, ${sy})`, borderRadius: `${15 / sx}px / ${15 / sy}px` };
}

const post = (w, type) => {
  const f = w.body.querySelector('iframe');
  if (f && f.contentWindow) f.contentWindow.postMessage({ type }, location.origin);
};

function build(app) {
  const body = h('div', { class: 'window-body' });
  if (app.system) body.append(settingsFactory());
  else body.append(h('iframe', { src: `${app.path}index.html`, title: app.name }));
  const splashImg = h('img', { src: iconOf(app), alt: '' });
  const splash = h('div', { class: 'splash' }, splashImg);
  const bar = h('div', { class: 'home-bar', 'aria-label': '回到主屏幕', role: 'button' }, h('i'));
  const el = h('section', { class: 'window', 'data-id': app.id }, body, splash, bar);
  const w = { app, el, body, splash, splashImg, loaded: app.system };
  const f = body.querySelector('iframe');
  if (f) f.addEventListener('load', () => { w.loaded = true; fadeSplash(w); });
  wireHomeBar(bar, w);
  document.getElementById('windows').append(el);
  windows.set(app.id, w);
  return w;
}

function fadeSplash(w, delay = 0) {
  w.splash.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 220, delay, fill: 'forwards', easing: 'ease-out' });
}

export function openApp(id) {
  if (busy || current) return;
  const app = appById(id);
  if (!app) return;
  const w = windows.get(id) || build(app);
  w.splashImg.src = iconOf(app);
  w.el.hidden = false;
  current = w;
  busy = true;
  document.body.classList.add('app-open');
  const r = iconRect(id);
  const from = shrinkTo(r);
  const R = deviceRadius();
  w.splash.getAnimations().forEach((a) => a.cancel());
  w.splash.style.opacity = 1;
  const anim = w.el.animate([from, { transform: 'none', borderRadius: `${R}px` }], { duration: 440, easing: 'cubic-bezier(.2,.9,.22,1)' });
  document.getElementById('home').animate([{ transform: 'scale(1)', opacity: 1 }, { transform: 'scale(1.12)', opacity: 0 }], { duration: 380, easing: 'cubic-bezier(.3,.7,.3,1)', fill: 'forwards' });
  if (w.loaded) fadeSplash(w, 160);
  anim.onfinish = () => { busy = false; };
  post(w, 'pp:resume');
  emit('app:open', id);
}

export function goHome({ from, instant } = {}) {
  if (!current) return;
  const w = current;
  current = null;
  post(w, 'pp:pause');
  document.body.classList.remove('app-open');
  const home = document.getElementById('home');
  home.getAnimations().forEach((a) => a.cancel());
  if (instant) { w.el.hidden = true; w.el.style.transform = ''; emit('app:close', w.app.id); return; }
  busy = true;
  const to = shrinkTo(iconRect(w.app.id));
  const start = from || { transform: 'none', borderRadius: `${deviceRadius()}px` };
  w.splash.getAnimations().forEach((a) => a.cancel());
  w.splash.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, delay: 90, fill: 'forwards' });
  const anim = w.el.animate([start, to], { duration: 400, easing: 'cubic-bezier(.25,.85,.3,1)' });
  home.animate([{ transform: 'scale(1.1)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }], { duration: 380, delay: 40, easing: 'cubic-bezier(.2,.8,.3,1)', fill: 'backwards' });
  anim.onfinish = () => {
    w.el.hidden = true;
    w.el.style.transform = '';
    w.el.style.borderRadius = '';
    busy = false;
    emit('app:close', w.app.id);
  };
}

/** 关掉某个 App 的窗口（下次打开会重新加载） */
export function destroyWindow(id) {
  const w = windows.get(id);
  if (!w) return;
  if (current === w) current = null;
  w.el.remove();
  windows.delete(id);
}

// 底部横条：上滑或轻点回到主屏幕，跟手缩小
function wireHomeBar(bar, w) {
  let y0 = 0, x0 = 0, t0 = 0, active = false, moved = false;
  const transformFor = (dx, dy) => {
    const p = Math.min(1, Math.max(0, -dy / 400));
    const s = 1 - p * 0.45;
    return `translate(${dx * 0.6}px, ${Math.min(0, dy) * 0.55}px) scale(${s})`;
  };
  bar.addEventListener('pointerdown', (e) => {
    if (current !== w || busy) return;
    active = true; moved = false; y0 = e.clientY; x0 = e.clientX; t0 = performance.now();
    bar.setPointerCapture(e.pointerId);
    w.el.style.transformOrigin = '50% 100%';
  });
  bar.addEventListener('pointermove', (e) => {
    if (!active) return;
    const dy = e.clientY - y0, dx = e.clientX - x0;
    if (Math.abs(dy) > 4 || Math.abs(dx) > 4) moved = true;
    if (!moved) return;
    w.el.style.transform = transformFor(dx, dy);
    w.el.style.borderRadius = `${Math.max(deviceRadius(), Math.min(34, -dy / 4))}px`;
  });
  const end = (e) => {
    if (!active) return;
    active = false;
    const dy = e.clientY - y0;
    const v = dy / Math.max(1, performance.now() - t0);
    const tr = w.el.style.transform || 'none';
    const br = w.el.style.borderRadius || `${deviceRadius()}px`;
    w.el.style.transformOrigin = '';
    if (!moved || dy < -70 || v < -0.6) {
      // 动画从当前跟手的位置接着缩回图标（transform-origin 需要换算回左上角）
      const rect = w.el.getBoundingClientRect();
      const d = device().getBoundingClientRect();
      const sc = rect.width / d.width;
      const from = moved ? { transform: `translate(${rect.left - d.left}px, ${rect.top - d.top}px) scale(${sc})`, borderRadius: `${parseFloat(br) / sc}px` } : null;
      w.el.style.transform = '';
      w.el.style.borderRadius = '';
      goHome({ from });
    } else {
      w.el.animate([{ transform: tr, borderRadius: br }, { transform: 'none', borderRadius: `${deviceRadius()}px` }], { duration: 260, easing: 'cubic-bezier(.2,.9,.3,1)' });
      w.el.style.transform = '';
      w.el.style.borderRadius = '';
    }
  };
  bar.addEventListener('pointerup', end);
  bar.addEventListener('pointercancel', end);
}

window.addEventListener('keydown', (e) => { if (e.key === 'Escape') goHome(); });

// 游戏里要求回到主屏幕（比如假条窗口右上角的 ×）
window.addEventListener('message', (e) => {
  if (e.origin !== location.origin || !e.data || e.data.type !== 'pp:home') return;
  if (current && current.body.querySelector('iframe') && current.body.querySelector('iframe').contentWindow === e.source) goHome();
});
