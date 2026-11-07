// 通用小部件：h()、线条图标、页面栈、底部面板、轻提示、时间格式
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
export const $ = (s, r = document) => r.querySelector(s);

// ── 线条图标（界面用，不是照片） ──
const P = {
  msg: '<path d="M4.5 6.5a3 3 0 0 1 3-3h9a3 3 0 0 1 3 3v6.5a3 3 0 0 1-3 3H11l-4.2 3.6v-3.6H7.5a3 3 0 0 1-3-3z"/><path d="M8.6 9.6h6.8M8.6 12.4h4.2"/>',
  photo: '<rect x="3.5" y="4.5" width="17" height="15" rx="2.6"/><circle cx="9" cy="9.6" r="1.7"/><path d="m4 17 4.6-4.4 3.2 3 3.4-3.6 4.8 5"/>',
  note: '<path d="M6.5 3.5h8.2l3.8 3.8v12.2a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1z"/><path d="M14.5 3.7v3.8h3.8M8.6 11.2h7M8.6 14.4h7M8.6 17.6h4.2"/>',
  cal: '<rect x="3.8" y="5.2" width="16.4" height="15" rx="2.4"/><path d="M3.8 9.6h16.4M8.2 3.2v3.6M15.8 3.2v3.6"/><circle cx="12" cy="14.6" r="1.2" fill="currentColor" stroke="none"/>',
  health: '<path d="M12 19.6S4.2 14.8 4.2 9.3A4 4 0 0 1 12 7.6a4 4 0 0 1 7.8 1.7c0 5.5-7.8 10.3-7.8 10.3z"/><path d="M6.4 12.2h3l1.4-2.4 2.2 4.6 1.4-2.2h3.2"/>',
  wallet: '<rect x="3.6" y="6" width="16.8" height="12.6" rx="2.4"/><path d="M3.6 9.8h16.8"/><path d="M15.4 14.6h2.2"/>',
  mail: '<rect x="3.6" y="5.6" width="16.8" height="12.8" rx="2.2"/><path d="m4.4 6.8 7.6 6.2 7.6-6.2"/>',
  map: '<path d="M12 20.4s-6-5.8-6-10.6a6 6 0 0 1 12 0c0 4.8-6 10.6-6 10.6z"/><circle cx="12" cy="9.8" r="2.2"/>',
  voice: '<path d="M4.5 12h1.4M8 8.6v6.8M11 5.6v12.8M14 8.2v7.6M17 10.2v3.6M19.6 11.6v.8"/>',
  web: '<circle cx="12" cy="12" r="8.4"/><path d="m14.9 9.1-1.8 4-4 1.8 1.8-4z"/>',
  frame: '<rect x="4" y="4" width="16" height="16" rx="1.2"/><rect x="7" y="7" width="10" height="10"/><path d="m7.4 14.6 2.6-2.6 2 2 1.6-1.6 2.8 2.8"/>',
  weather: '<path d="M7.6 17.6h9.2a3.4 3.4 0 0 0 .3-6.8 5 5 0 0 0-9.6 1.2 2.8 2.8 0 0 0 .1 5.6z"/>',
  clock: '<circle cx="12" cy="12" r="8.4"/><path d="M12 7.4V12l3.2 2"/>',
  echo: '<circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="4.6"/><circle cx="12" cy="12" r="8" stroke-dasharray="2.2 2.4"/>',
  gear: '<circle cx="12" cy="12" r="2.8"/><path d="M12 3.6v2.2M12 18.2v2.2M3.6 12h2.2M18.2 12h2.2M6 6l1.6 1.6M16.4 16.4 18 18M6 18l1.6-1.6M16.4 7.6 18 6"/>',
  phone: '<path d="M6.2 4.2h2.6l1.6 4-2 1.4a10 10 0 0 0 6 6l1.4-2 4 1.6v2.6a1.8 1.8 0 0 1-1.9 1.8C10.8 19.2 4.8 13.2 4.4 6.1a1.8 1.8 0 0 1 1.8-1.9z"/>',
  back: '<path d="M14.6 5.4 8 12l6.6 6.6"/>',
  info: '<circle cx="12" cy="12" r="8.4"/><path d="M12 10.8v5.4"/><circle cx="12" cy="7.9" r=".9" fill="currentColor" stroke="none"/>',
  lock: '<rect x="5.6" y="10.4" width="12.8" height="9.6" rx="2"/><path d="M8.4 10.4V8a3.6 3.6 0 0 1 7.2 0v2.4"/>',
  play: '<path d="M8.4 5.8v12.4l9.6-6.2z" fill="currentColor"/>',
  pause: '<path d="M8.6 6v12M15.4 6v12" stroke-width="2.6"/>',
  home: '<rect x="5" y="5" width="14" height="14" rx="3.6"/>',
  clue: '<rect x="4.6" y="4.6" width="14.8" height="14.8" rx="2"/><path d="M8 9h8M8 12h8M8 15h5"/>',
  think: '<circle cx="9" cy="9" r="4.2"/><circle cx="15.6" cy="15.4" r="4.2"/><path d="m12 12 .6.6"/>',
  hint: '<path d="M9 17.6h6M10 20.4h4M12 3.8a5.6 5.6 0 0 0-3.4 10c.8.6 1 1.4 1 2.2h4.8c0-.8.2-1.6 1-2.2A5.6 5.6 0 0 0 12 3.8z"/>',
  flip: '<path d="M4.6 9.4A7.6 7.6 0 0 1 18 6.6M19.4 14.6A7.6 7.6 0 0 1 6 17.4"/><path d="m18.6 3.6-.4 3.2-3.2-.4M5.4 20.4l.4-3.2 3.2.4"/>',
  close: '<path d="M7 7l10 10M17 7 7 17"/>',
  stamp: '<path d="M9.6 4.4h4.8l-.8 6.4h3.6l1.4 3.4H5.4l1.4-3.4h3.6z"/><path d="M5 17.6h14M6.4 20h11.2"/>',
  chev: '<path d="m9.4 5.6 6.4 6.4-6.4 6.4"/>',
  wifi: '<path d="M4.4 9.6a11 11 0 0 1 15.2 0M7.2 12.6a7 7 0 0 1 9.6 0M10 15.6a3 3 0 0 1 4 0"/><circle cx="12" cy="18.4" r=".9" fill="currentColor" stroke="none"/>',
  hour: '<path d="M7 4h10M7 20h10M8 4c0 4 8 4 8 8s-8 4-8 8M16 4c0 4-8 4-8 8s8 4 8 8"/>',
  battery: '<rect x="3.6" y="8" width="15" height="8" rx="2"/><path d="M20.4 10.8v2.4"/><rect x="5.4" y="9.8" width="3.4" height="4.4" rx=".6" fill="currentColor" stroke="none"/>',
  erase: '<path d="M4.6 7.4h14.8M9.4 7.4V5h5.2v2.4M6.6 7.4l.9 11.4a1.6 1.6 0 0 0 1.6 1.4h5.8a1.6 1.6 0 0 0 1.6-1.4l.9-11.4"/>',
  user: '<circle cx="12" cy="8.8" r="3.6"/><path d="M5 19.6a7 7 0 0 1 14 0"/>',
  vm: '<circle cx="7.4" cy="12.6" r="3.2"/><circle cx="16.6" cy="12.6" r="3.2"/><path d="M7.4 15.8h9.2"/>',
};
export const icon = (name, cls = '') => `<svg class="ic ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || ''}</svg>`;
export const ic = (name, cls) => h('span', { class: 'ico', html: icon(name, cls) });

// ── 时间格式（以游戏里的「现在」为准：2026-11-06/07） ──
export function when(t, today = '2026-11-06') {
  const [d, tm] = t.split(' ');
  const [y, m, dd] = d.split('-').map(Number);
  if (d === today) return tm;
  const td = new Date(today + 'T12:00:00'), x = new Date(d + 'T12:00:00');
  const diff = Math.round((td - x) / 86400000);
  if (diff === 1) return '昨天';
  if (y !== 2026) return `${y}/${m}/${dd}`;
  return `${m}月${dd}日`;
}
export function stamp(t) {
  const [d, tm] = t.split(' ');
  const [y, m, dd] = d.split('-').map(Number);
  return `${y !== 2026 ? y + '年' : ''}${m}月${dd}日 ${tm || ''}`.trim();
}
export const dayOf = (t) => t.split(' ')[0];
export const nl = (s) => String(s).split('\n').map((line, i, a) => [line, i < a.length - 1 ? h('br') : null]);
export const paras = (s, cls = 'p') => String(s).split(/\n\n+/).map((p) => h('p', { class: cls }, nl(p)));

// ── 页面栈：每个 App 一个。右边滑进来，左边缘往右拖返回 ──
const EASE = 'cubic-bezier(.2,.85,.25,1)';
const UNDER = -26;
export class Stack {
  constructor(host, onEmpty) {
    this.host = host; this.pages = []; this.busy = false; this.onEmpty = onEmpty;
    this.wireEdge();
  }
  get top() { return this.pages[this.pages.length - 1]; }
  root(page) { this.pages = [page]; this.host.append(page.el); page.onShow && page.onShow(); }
  push(page) {
    if (this.busy) return;
    const under = this.top;
    const shade = h('div', { class: 'shade' });
    page.shade = shade;
    this.host.append(shade, page.el);
    this.pages.push(page);
    this.busy = true;
    const dur = 340;
    page.el.animate([{ transform: 'translate3d(100%,0,0)' }, { transform: 'translate3d(0,0,0)' }], { duration: dur, easing: EASE }).onfinish = () => { this.busy = false; page.onShow && page.onShow(); };
    under.el.animate([{ transform: 'translate3d(0,0,0)' }, { transform: `translate3d(${UNDER}%,0,0)` }], { duration: dur, easing: EASE });
    under.el.style.transform = `translate3d(${UNDER}%,0,0)`;
    shade.animate([{ opacity: 0 }, { opacity: 1 }], { duration: dur, easing: EASE });
  }
  pop(fromPx = 0) {
    if (this.pages.length < 2) { this.onEmpty && this.onEmpty(); return; }
    if (this.busy) return;
    const page = this.pages.pop(), under = this.top;
    const W = this.host.clientWidth || 1, p = fromPx / W, dur = Math.max(160, 300 * (1 - p));
    this.busy = true;
    page.el.animate([{ transform: `translate3d(${fromPx}px,0,0)` }, { transform: 'translate3d(100%,0,0)' }], { duration: dur, easing: EASE, fill: 'forwards' }).onfinish = () => { page.el.remove(); page.shade.remove(); this.busy = false; page.onDestroy && page.onDestroy(); };
    under.el.animate([{ transform: `translate3d(${UNDER * (1 - p)}%,0,0)` }, { transform: 'translate3d(0,0,0)' }], { duration: dur, easing: EASE });
    under.el.style.transform = '';
    page.shade.animate([{ opacity: 1 - p }, { opacity: 0 }], { duration: dur, easing: EASE, fill: 'forwards' });
    under.onShow && under.onShow();
  }
  wireEdge() {
    const host = this.host;
    let id = null, x0 = 0, y0 = 0, dx = 0, live = false, lastX = 0, lastT = 0, vx = 0;
    host.addEventListener('pointerdown', (e) => {
      if (this.busy || e.clientX - host.getBoundingClientRect().left > 24) return;
      id = e.pointerId; x0 = lastX = e.clientX; y0 = e.clientY; dx = 0; lastT = performance.now(); live = false; vx = 0;
    }, true);
    host.addEventListener('pointermove', (e) => {
      if (e.pointerId !== id) return;
      const mx = e.clientX - x0, my = e.clientY - y0;
      if (!live) {
        if (Math.abs(my) > 12 && Math.abs(my) > mx) { id = null; return; }
        if (mx < 10) return;
        live = true;
        try { host.setPointerCapture(id); } catch {}
      }
      e.preventDefault();
      const W = host.clientWidth;
      dx = Math.max(0, Math.min(W, mx));
      const now = performance.now();
      vx = (e.clientX - lastX) / Math.max(1, now - lastT); lastX = e.clientX; lastT = now;
      const pg = this.top;
      if (this.pages.length > 1) {
        const under = this.pages[this.pages.length - 2];
        pg.el.style.transform = `translate3d(${dx}px,0,0)`;
        under.el.style.transform = `translate3d(${UNDER * (1 - dx / W)}%,0,0)`;
        pg.shade.style.opacity = 1 - dx / W;
      } else {
        host.style.transform = `translate3d(${dx * 0.35}px,0,0) scale(${1 - dx / W * 0.08})`;
      }
    }, true);
    const end = (e) => {
      if (e.pointerId !== id) return;
      id = null;
      if (!live) return;
      live = false;
      const W = host.clientWidth, go = dx > W * 0.32 || (vx > 0.45 && dx > 30);
      if (this.pages.length > 1) {
        const pg = this.top, under = this.pages[this.pages.length - 2];
        if (go) { pg.el.style.transform = ''; pg.shade.style.opacity = ''; this.pop(dx); }
        else {
          const p = dx / W;
          pg.el.animate([{ transform: `translate3d(${dx}px,0,0)` }, { transform: 'translate3d(0,0,0)' }], { duration: 220, easing: EASE });
          under.el.animate([{ transform: `translate3d(${UNDER * (1 - p)}%,0,0)` }, { transform: `translate3d(${UNDER}%,0,0)` }], { duration: 220, easing: EASE });
          pg.el.style.transform = ''; under.el.style.transform = `translate3d(${UNDER}%,0,0)`; pg.shade.style.opacity = '';
        }
      } else {
        host.style.transform = '';
        if (go) this.onEmpty && this.onEmpty();
      }
    };
    host.addEventListener('pointerup', end, true);
    host.addEventListener('pointercancel', end, true);
  }
}

/** 一页：标题栏 + 滚动区 */
export function page({ title = '', back = '返回', right = null, cls = '', onBack, big = false }) {
  const scroll = h('div', { class: 'scroll' });
  const head = h('header', { class: 'bar' + (big ? ' big' : '') },
    h('button', { class: 'bk', 'aria-label': '返回', onclick: () => onBack && onBack() }, ic('back'), h('span', { text: back })),
    h('b', { class: 'ttl', text: title }),
    h('div', { class: 'rt' }, right));
  const el = h('section', { class: 'pg ' + cls }, head, scroll);
  if (big) scroll.prepend(h('h1', { class: 'bigttl', text: title }));
  // 大标题滚上去以后，小标题再出现
  if (big) scroll.addEventListener('scroll', () => head.classList.toggle('solid', scroll.scrollTop > 34), { passive: true });
  return { el, head, scroll, setTitle: (t) => { head.querySelector('.ttl').textContent = t; } };
}

// ── 轻提示 ──
export function toast(text, { icon: icn = null, ms = 2200, cls = '' } = {}) {
  const host = document.getElementById('toasts');
  const t = h('div', { class: 'toast ' + cls }, icn ? ic(icn) : null, h('span', { text }));
  host.append(t);
  requestAnimationFrame(() => t.classList.add('on'));
  setTimeout(() => { t.classList.remove('on'); setTimeout(() => t.remove(), 400); }, ms);
}

// ── 底部面板（线索本这些） ──
export function sheet({ title, sub, body, cls = '', onClose, foot = null }) {
  const host = document.getElementById('sheets');
  const back = h('div', { class: 'backdrop' });
  const grab = h('div', { class: 'grab' }, h('i'));
  const close = () => {
    if (wrap.closing) return;
    wrap.closing = true;
    wrap.classList.remove('on');
    setTimeout(() => wrap.remove(), 360);
    onClose && onClose();
  };
  const head = h('div', { class: 'sh-head' },
    h('div', {}, h('b', { text: title }), sub ? h('small', { text: sub }) : null),
    h('button', { class: 'sh-x', 'aria-label': '关闭', html: icon('close'), onclick: close }));
  const box = h('div', { class: 'sheet ' + cls }, grab, head, h('div', { class: 'sh-body' }, body), foot);
  const wrap = h('div', { class: 'sheet-wrap' }, back, box);
  host.append(wrap);
  wrap.getBoundingClientRect();
  wrap.classList.add('on');
  back.addEventListener('click', close);
  // 往下拖关掉
  let id = null, y0 = 0, dy = 0;
  for (const el of [grab, head]) {
    el.style.touchAction = 'none';
    el.addEventListener('pointerdown', (e) => { if (e.target.closest('button')) return; id = e.pointerId; y0 = e.clientY; dy = 0; el.setPointerCapture(id); box.style.transition = 'none'; });
    el.addEventListener('pointermove', (e) => { if (e.pointerId !== id) return; dy = Math.max(0, e.clientY - y0); box.style.transform = `translate3d(0,${dy}px,0)`; });
    const end = (e) => { if (e.pointerId !== id) return; id = null; box.style.transition = ''; if (dy > 100) close(); else box.style.transform = ''; };
    el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
  }
  return { close, box, wrap, body: box.querySelector('.sh-body') };
}

/** 居中的小对话框 */
export function dialog({ title, text, buttons }) {
  return new Promise((res) => {
    const host = document.getElementById('sheets');
    const done = (v) => { wrap.classList.remove('on'); setTimeout(() => wrap.remove(), 260); res(v); };
    const wrap = h('div', { class: 'dlg-wrap' },
      h('div', { class: 'dlg' },
        title ? h('b', { text: title }) : null,
        text ? h('p', {}, nl(text)) : null,
        h('div', { class: 'dlg-btns' }, buttons.map(([label, v, cls]) => h('button', { class: cls || '', text: label, onclick: () => done(v) })))));
    host.append(wrap);
    wrap.getBoundingClientRect();
    wrap.classList.add('on');
  });
}

/** 一段一段淡出来的字 */
export function typeIn(container, text, { gap = 900, cls = 'p', onDone } = {}) {
  const ps = String(text).split(/\n\n+/);
  let i = 0, timer = 0, skip = false;
  const next = () => {
    if (i >= ps.length) { onDone && onDone(); return; }
    const p = h('p', { class: cls + ' fade' }, nl(ps[i++]));
    container.append(p);
    requestAnimationFrame(() => p.classList.add('on'));
    p.scrollIntoView && container.scrollHeight > container.clientHeight && container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
    timer = setTimeout(next, skip ? 120 : gap + ps[i - 1].length * 28);
  };
  next();
  return { hurry: () => { skip = true; clearTimeout(timer); next(); } };
}
