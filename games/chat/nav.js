// 页面栈：推进来从右边滑入，底下那页往左挪一点变暗；从左边缘往右拖可以返回
const EASE = 'cubic-bezier(.2,.85,.25,1)';
const UNDER = -28; // 底下那页挪到 -28%
const stack = [];
let host, busy = false;

const tx = (el, v) => { el.style.transform = v ? `translate3d(${v},0,0)` : ''; };

export function initNav(el, root) {
  host = el;
  stack.push(root);
  wireEdge();
}
export const top = () => stack[stack.length - 1];
export const depth = () => stack.length;
export const isBusy = () => busy;

export function push(page) {
  if (busy) return;
  const under = top();
  const shade = document.createElement('div');
  shade.className = 'shade';
  page.shade = shade;
  host.append(shade, page.el);
  stack.push(page);
  under.el.classList.add('under');
  const dur = 360;
  busy = true;
  page.el.animate([{ transform: 'translate3d(100%,0,0)' }, { transform: 'translate3d(0,0,0)' }], { duration: dur, easing: EASE })
    .onfinish = () => { busy = false; page.onShown && page.onShown(); };
  under.el.animate([{ transform: 'translate3d(0,0,0)' }, { transform: `translate3d(${UNDER}%,0,0)` }], { duration: dur, easing: EASE });
  tx(under.el, UNDER + '%');
  shade.animate([{ opacity: 0 }, { opacity: 1 }], { duration: dur, easing: EASE });
  under.onHide && under.onHide();
}

/** fromPx：手指拖到了哪儿（交互返回时从那儿接着动） */
export function pop(fromPx = 0) {
  if (stack.length < 2) return;
  const page = stack.pop();
  const under = top();
  const W = host.clientWidth || 1;
  const p = fromPx / W;
  const dur = Math.max(160, 320 * (1 - p));
  busy = true;
  page.onHide && page.onHide();
  page.el.animate([{ transform: `translate3d(${fromPx}px,0,0)` }, { transform: 'translate3d(100%,0,0)' }], { duration: dur, easing: EASE, fill: 'forwards' })
    .onfinish = () => { page.el.remove(); page.shade.remove(); busy = false; page.onDestroy && page.onDestroy(); };
  under.el.animate([{ transform: `translate3d(${UNDER * (1 - p)}%,0,0)` }, { transform: 'translate3d(0,0,0)' }], { duration: dur, easing: EASE });
  tx(under.el, '');
  page.shade.animate([{ opacity: 1 - p }, { opacity: 0 }], { duration: dur, easing: EASE, fill: 'forwards' });
  under.el.classList.remove('under');
  under.onShow && under.onShow();
}

/** 一路退回根页面：中间的页面直接拿掉，最上面那页滑走 */
export function popToRoot() {
  while (stack.length > 2) {
    const mid = stack.splice(stack.length - 2, 1)[0];
    mid.el.remove(); mid.shade.remove();
    mid.onDestroy && mid.onDestroy();
  }
  stack[0].el.style.transform = `translate3d(${UNDER}%,0,0)`;
  busy = false;
  pop();
}

function wireEdge() {
  let id = null, x0 = 0, y0 = 0, dx = 0, t0 = 0, live = false, lastX = 0, lastT = 0, vx = 0;
  host.addEventListener('pointerdown', (e) => {
    if (busy || stack.length < 2 || e.clientX - host.getBoundingClientRect().left > 22) return;
    if (document.querySelector('#layer > *:not(.toast)')) return;
    id = e.pointerId; x0 = lastX = e.clientX; y0 = e.clientY; dx = 0; t0 = lastT = performance.now(); live = false; vx = 0;
  }, true);
  host.addEventListener('pointermove', (e) => {
    if (e.pointerId !== id) return;
    const mx = e.clientX - x0, my = e.clientY - y0;
    if (!live) {
      if (Math.abs(my) > 12 && Math.abs(my) > mx) { id = null; return; }
      if (mx < 10) return;
      live = true;
      try { host.setPointerCapture(id); } catch {}
      top().onEdgeStart && top().onEdgeStart();
    }
    e.preventDefault();
    const W = host.clientWidth;
    dx = Math.max(0, Math.min(W, mx));
    const now = performance.now();
    vx = (e.clientX - lastX) / Math.max(1, now - lastT);
    lastX = e.clientX; lastT = now;
    const pg = top(), under = stack[stack.length - 2];
    tx(pg.el, dx + 'px');
    tx(under.el, UNDER * (1 - dx / W) + '%');
    pg.shade.style.opacity = 1 - dx / W;
  }, true);
  const end = (e) => {
    if (e.pointerId !== id) return;
    id = null;
    if (!live) return;
    live = false;
    const W = host.clientWidth;
    const pg = top(), under = stack[stack.length - 2];
    if (dx > W * 0.34 || (vx > 0.45 && dx > 30)) {
      tx(pg.el, ''); pg.shade.style.opacity = '';
      pop(dx);
    } else {
      const p = dx / W;
      pg.el.animate([{ transform: `translate3d(${dx}px,0,0)` }, { transform: 'translate3d(0,0,0)' }], { duration: 240, easing: EASE });
      under.el.animate([{ transform: `translate3d(${UNDER * (1 - p)}%,0,0)` }, { transform: `translate3d(${UNDER}%,0,0)` }], { duration: 240, easing: EASE });
      pg.shade.animate([{ opacity: 1 - p }, { opacity: 1 }], { duration: 240, easing: EASE });
      tx(pg.el, ''); tx(under.el, UNDER + '%'); pg.shade.style.opacity = '';
    }
  };
  host.addEventListener('pointerup', end, true);
  host.addEventListener('pointercancel', end, true);
}
