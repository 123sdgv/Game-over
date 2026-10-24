// 小工具：创建元素、iOS 风格弹窗和提示
export function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'html') el.innerHTML = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat(Infinity)) if (c != null && c !== false) el.append(c.nodeType ? c : document.createTextNode(c));
  return el;
}

const root = () => document.getElementById('overlay');

/** iOS 风格的提醒框，返回被点按钮的 value */
export function alert({ title, message, buttons = [{ label: '好', value: true }] }) {
  return new Promise((resolve) => {
    const close = (v) => {
      box.classList.add('out');
      setTimeout(() => box.remove(), 180);
      resolve(v);
    };
    const box = h('div', { class: 'alert-scrim' },
      h('div', { class: 'alert', role: 'alertdialog' },
        h('div', { class: 'alert-text' },
          h('div', { class: 'alert-title' }, title),
          message && h('div', { class: 'alert-msg' }, message)),
        h('div', { class: `alert-btns ${buttons.length === 2 ? 'row' : ''}` },
          buttons.map((b) => h('button', { class: `alert-btn ${b.style || ''}`, onclick: () => close(b.value) }, b.label)))));
    root().append(box);
  });
}

let toastTimer;
export function toast(text) {
  let t = document.querySelector('.toast');
  if (!t) { t = h('div', { class: 'toast' }); root().append(t); }
  t.textContent = text;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 1800);
}

export const fmtTime = (ms) => {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
export const fmtMinutes = (ms) => {
  const m = Math.floor(ms / 60000);
  return m < 60 ? `${m} 分钟` : `${Math.floor(m / 60)} 小时 ${m % 60} 分`;
};
