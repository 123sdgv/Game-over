// 通用小部件：底部面板、操作表、确认框、轻提示、长按菜单、看大图、裁头像
import { I } from './icons.js';
import { loadImage } from './media.js';

export function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'style' && typeof v === 'object') { for (const [sk, sv] of Object.entries(v)) { if (sk.startsWith('--')) el.style.setProperty(sk, sv); else el.style[sk] = sv; } }
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat(3)) if (k != null && k !== false) el.append(k);
  return el;
}

const layer = () => document.getElementById('layer');

// 列表里的点按是用 pointer 事件处理的；手指抬起后浏览器还会补一个 click，
// 如果这时刚好弹出了红包、大图之类的东西，click 会落在它上面。抬手后短时间内的 click 一律吞掉。
let swallowUntil = 0;
export const swallowClick = (ms = 350) => { swallowUntil = performance.now() + ms; };
document.addEventListener('click', (e) => { if (performance.now() < swallowUntil) { e.stopPropagation(); e.preventDefault(); } }, true);
export const blurActive = () => { const a = document.activeElement; if (a && a !== document.body && a.blur) a.blur(); };

/** 往下拖关掉 */
function dragDown(box, handles, close) {
  let id = null, y0 = 0, dy = 0, t0 = 0;
  for (const el of handles.filter(Boolean)) {
    el.style.touchAction = 'none';
    el.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button,input,textarea')) return;
      id = e.pointerId; y0 = e.clientY; dy = 0; t0 = performance.now();
      el.setPointerCapture(id);
      box.style.transition = 'none';
    });
    el.addEventListener('pointermove', (e) => {
      if (e.pointerId !== id) return;
      dy = Math.max(0, e.clientY - y0);
      box.style.transform = `translate3d(0,${dy}px,0)`;
    });
    const end = (e) => {
      if (e.pointerId !== id) return;
      id = null;
      box.style.transition = '';
      const v = dy / Math.max(1, performance.now() - t0);
      if (dy > 110 || (v > 0.6 && dy > 24)) close();
      else box.style.transform = '';
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  }
}

/** 底部面板 */
export function sheet({ title, body, onClose, cls = '' }) {
  const back = h('div', { class: 'backdrop' });
  const grab = h('div', { class: 'grab' }, h('i'));
  const head = title ? h('div', { class: 'sheet-head', text: title }) : null;
  const box = h('div', { class: 'sheet ' + cls }, grab, head, body);
  const wrap = h('div', { class: 'sheet-wrap' }, back, box);
  layer().append(wrap);
  wrap.getBoundingClientRect();
  wrap.classList.add('on');
  let closed = false;
  const close = (v) => {
    if (closed) return;
    closed = true;
    blurActive();
    box.style.transform = '';
    wrap.classList.remove('on');
    setTimeout(() => wrap.remove(), 340);
    onClose && onClose(v);
  };
  back.addEventListener('click', () => close());
  dragDown(box, [grab, head], close);
  return { close, el: box, wrap };
}

/** 操作表。onPick 在点按的同一个事件里调用（选照片要求这样） */
export function actions(items, { title } = {}) {
  return new Promise((res) => {
    const pick = (i) => { s.close(true); if (i >= 0 && items[i].onPick) items[i].onPick(); res(i); };
    const group = h('div', { class: 'as-group' },
      title && h('div', { class: 'as-title', text: title }),
      items.map((it, i) => h('button', { class: 'as-btn' + (it.danger ? ' danger' : ''), text: it.label, onclick: () => pick(i) })));
    const cancel = h('button', { class: 'as-btn cancel', text: '取消', onclick: () => pick(-1) });
    const s = sheet({ body: h('div', { class: 'as' }, group, cancel), cls: 'as-sheet', onClose: (v) => { if (!v) res(-1); } });
  });
}

/** 确认框 */
export function confirm({ title, message, ok = '确定', cancel = '取消', danger = false }) {
  return new Promise((res) => {
    const done = (v) => { wrap.classList.remove('on'); setTimeout(() => wrap.remove(), 220); res(v); };
    const box = h('div', { class: 'alert' },
      h('div', { class: 'alert-body' }, h('b', { text: title }), message && h('p', { text: message })),
      h('div', { class: 'alert-btns' },
        h('button', { text: cancel, onclick: () => done(false) }),
        h('button', { class: danger ? 'danger' : 'strong', text: ok, onclick: () => done(true) })));
    const wrap = h('div', { class: 'alert-wrap' }, box);
    layer().append(wrap);
    wrap.getBoundingClientRect();
    wrap.classList.add('on');
  });
}

let toastEl, toastT;
export function toast(text) {
  if (!toastEl) { toastEl = h('div', { class: 'toast' }); layer().append(toastEl); }
  toastEl.textContent = text;
  toastEl.classList.add('on');
  clearTimeout(toastT);
  toastT = setTimeout(() => toastEl.classList.remove('on'), 1600);
}

/** 长按菜单：黑色圆角块，图标在上字在下，箭头指着那条消息 */
export function popMenu(rect, items, { minTop = 60 } = {}) {
  return new Promise((res) => {
    let done = false;
    const finish = (v) => {
      if (done) return;
      done = true;
      wrap.classList.remove('on');
      setTimeout(() => wrap.remove(), 160);
      res(v);
    };
    const n = items.length;
    const cols = n <= 5 ? n : n === 6 ? 3 : 4;
    const grid = h('div', { class: 'menu', style: { gridTemplateColumns: `repeat(${cols}, 54px)` } },
      items.map((it) => h('button', { class: 'mi' + (it.danger ? ' danger' : ''), onclick: (e) => { e.stopPropagation(); finish(it.key); } },
        h('span', { class: 'mi-ic', html: it.icon }), h('span', { class: 'mi-t', text: it.label }))));
    const arrow = h('i', { class: 'menu-arrow' });
    const back = h('div', { class: 'menu-back' });
    const wrap = h('div', { class: 'menu-wrap' }, back, grid, arrow);
    layer().append(wrap);
    const W = grid.offsetWidth, H = grid.offsetHeight, vw = innerWidth, vh = innerHeight;
    const cx = Math.min(vw - 24, Math.max(24, rect.left + rect.width / 2));
    const x = Math.min(vw - W - 8, Math.max(8, cx - W / 2));
    const above = rect.top - H - 12 >= minTop;
    let y = above ? rect.top - H - 10 : rect.bottom + 10;
    if (!above && y + H > vh - 12) y = Math.max(minTop, Math.min(vh - H - 12, rect.top + 20));
    grid.style.left = x + 'px';
    grid.style.top = y + 'px';
    grid.style.transformOrigin = `${cx - x}px ${above ? H : 0}px`;
    arrow.style.left = cx - 7 + 'px';
    arrow.style.top = (above ? y + H - 1 : y - 7) + 'px';
    arrow.classList.toggle('up', !above);
    wrap.getBoundingClientRect();
    wrap.classList.add('on');
    back.addEventListener('pointerdown', (e) => { e.preventDefault(); finish(null); });
  });
}

/** 看大图：从缩略图的位置放大，点一下缩回去 */
export function viewer(src, fromEl) {
  const r = fromEl.getBoundingClientRect();
  const img = h('img', { class: 'vw-img', src, alt: '' });
  const back = h('div', { class: 'vw-back' });
  const wrap = h('div', { class: 'viewer' }, back, img);
  layer().append(wrap);
  const place = () => {
    const nw = img.naturalWidth || r.width, nh = img.naturalHeight || r.height;
    const k = Math.min(innerWidth / nw, innerHeight / nh);
    const w = nw * k, hh = nh * k;
    Object.assign(img.style, { width: w + 'px', height: hh + 'px', left: (innerWidth - w) / 2 + 'px', top: (innerHeight - hh) / 2 + 'px' });
    return { x: (innerWidth - w) / 2, y: (innerHeight - hh) / 2, w, h: hh };
  };
  const go = () => {
    const t = place();
    const from = `translate(${r.left - t.x}px, ${r.top - t.y}px) scale(${r.width / t.w}, ${r.height / t.h})`;
    img.animate([{ transform: from, borderRadius: '12px' }, { transform: 'none', borderRadius: '0px' }], { duration: 300, easing: 'cubic-bezier(.2,.85,.25,1)' });
    back.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 240, fill: 'forwards' });
    wrap.addEventListener('click', () => {
      const r2 = fromEl.isConnected ? fromEl.getBoundingClientRect() : r;
      const to = `translate(${r2.left - t.x}px, ${r2.top - t.y}px) scale(${r2.width / t.w}, ${r2.height / t.h})`;
      img.animate([{ transform: 'none' }, { transform: to, opacity: fromEl.isConnected ? 1 : 0 }], { duration: 260, easing: 'cubic-bezier(.3,.7,.3,1)', fill: 'forwards' });
      back.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 240, fill: 'forwards' }).onfinish = () => wrap.remove();
    }, { once: true });
  };
  if (img.complete && img.naturalWidth) go(); else { img.onload = go; img.onerror = () => wrap.remove(); }
}

/** 裁头像：拖动、双指缩放，圆形取景。返回 dataURL（size×size 的 JPEG） */
export async function cropper(file, { size = 200 } = {}) {
  let src;
  try { src = await loadImage(file); } catch { return null; }
  if (!src.w) { URL.revokeObjectURL(src.url); return null; }
  return new Promise((res) => {
    const img = h('img', { class: 'crop-img', src: src.url, alt: '' });
    const frame = h('div', { class: 'crop-frame' });
    const stage = h('div', { class: 'crop-stage' }, img, frame);
    const done = (v) => { wrap.classList.remove('on'); setTimeout(() => { wrap.remove(); URL.revokeObjectURL(src.url); }, 260); res(v); };
    const bar = h('div', { class: 'crop-bar' },
      h('button', { text: '取消', onclick: () => done(null) }),
      h('span', { text: '拖动、双指缩放' }),
      h('button', { class: 'strong', text: '选取', onclick: () => done(output()) }));
    const wrap = h('div', { class: 'crop' }, stage, bar);
    layer().append(wrap);
    wrap.getBoundingClientRect();
    wrap.classList.add('on');

    const SW = stage.clientWidth, SH = stage.clientHeight;
    const F = Math.min(SW - 40, SH - 40, 340);
    const fx = (SW - F) / 2, fy = (SH - F) / 2;
    Object.assign(frame.style, { left: fx + 'px', top: fy + 'px', width: F + 'px', height: F + 'px' });
    const minK = F / Math.min(src.w, src.h);
    let k = minK, x = fx + (F - src.w * k) / 2, y = fy + (F - src.h * k) / 2;
    const clamp = () => {
      k = Math.max(minK, Math.min(minK * 6, k));
      x = Math.min(fx, Math.max(fx + F - src.w * k, x));
      y = Math.min(fy, Math.max(fy + F - src.h * k, y));
      img.style.transform = `translate3d(${x}px,${y}px,0) scale(${k})`;
    };
    img.style.width = src.w + 'px';
    img.style.height = src.h + 'px';
    clamp();

    const pts = new Map();
    let last = null;
    const snap = () => {
      const p = [...pts.values()];
      if (p.length === 1) return { cx: p[0].x, cy: p[0].y, d: 0 };
      return { cx: (p[0].x + p[1].x) / 2, cy: (p[0].y + p[1].y) / 2, d: Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y) };
    };
    stage.addEventListener('pointerdown', (e) => {
      stage.setPointerCapture(e.pointerId);
      const sr = stage.getBoundingClientRect();
      pts.set(e.pointerId, { x: e.clientX - sr.left, y: e.clientY - sr.top });
      last = snap();
    });
    stage.addEventListener('pointermove', (e) => {
      if (!pts.has(e.pointerId)) return;
      const sr = stage.getBoundingClientRect();
      pts.set(e.pointerId, { x: e.clientX - sr.left, y: e.clientY - sr.top });
      const now = snap();
      if (last && pts.size >= 2 && last.d > 0) {
        const nk = Math.max(minK, Math.min(minK * 6, k * (now.d / last.d)));
        x = now.cx - (last.cx - x) * (nk / k);
        y = now.cy - (last.cy - y) * (nk / k);
        k = nk;
      } else if (last) {
        x += now.cx - last.cx;
        y += now.cy - last.cy;
      }
      last = now;
      clamp();
    });
    const up = (e) => { pts.delete(e.pointerId); last = pts.size ? snap() : null; };
    stage.addEventListener('pointerup', up);
    stage.addEventListener('pointercancel', up);
    stage.addEventListener('wheel', (e) => {
      e.preventDefault();
      const sr = stage.getBoundingClientRect();
      const cx = e.clientX - sr.left, cy = e.clientY - sr.top;
      const nk = Math.max(minK, Math.min(minK * 6, k * Math.exp(-e.deltaY / 300)));
      x = cx - (cx - x) * (nk / k); y = cy - (cy - y) * (nk / k); k = nk;
      clamp();
    }, { passive: false });

    function output() {
      const c = document.createElement('canvas');
      c.width = c.height = size;
      const g = c.getContext('2d');
      g.fillStyle = '#fff';
      g.fillRect(0, 0, size, size);
      g.imageSmoothingQuality = 'high';
      const sx = (fx - x) / k, sy = (fy - y) / k, sw = F / k;
      g.drawImage(src.img, sx, sy, sw, sw, 0, 0, size, size);
      return c.toDataURL('image/jpeg', 0.86);
    }
  });
}

export const icon = (name) => h('span', { class: 'ic', html: I[name] });
