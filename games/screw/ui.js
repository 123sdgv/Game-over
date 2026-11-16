// 通用小部件：元素生成、提示条、底部弹窗卡片、底部面板。
const $ = (id) => document.getElementById(id);

/** h('div.cls', { onclick, style }, ...children) */
export function h(tag, props = {}, ...kids) {
  const [name, ...cls] = tag.split('.');
  const el = document.createElement(name || 'div');
  if (cls.length) el.className = cls.join(' ');
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'html') el.innerHTML = v;
    else if (k in el && k !== 'list') el[k] = v;
    else el.setAttribute(k, v);
  }
  for (const k of kids.flat()) if (k != null && k !== false) el.append(k.nodeType ? k : document.createTextNode(String(k)));
  return el;
}

let toastT = 0;
export function toast(msg, ms = 1800) {
  const el = $('toast');
  el.textContent = msg;
  el.hidden = false;
  el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
  clearTimeout(toastT);
  toastT = setTimeout(() => { el.classList.remove('show'); setTimeout(() => { el.hidden = true; }, 250); }, ms);
}

/** 底部卡片：{ title, big, meta(html), main: [文字, fn], alt: [文字, fn], cls } */
export function card(o) {
  $('cardTitle').textContent = o.title || '';
  $('cardBig').innerHTML = o.big || '';
  $('cardMeta').innerHTML = o.meta || '';
  const bind = (id, b) => {
    const el = $(id);
    el.textContent = b ? b[0] : '';
    el.onclick = b ? () => { hideCard(); b[1] && b[1](); } : null;
  };
  bind('cardMain', o.main);
  bind('cardAlt', o.alt);
  $('card').className = 'card' + (o.cls ? ' ' + o.cls : '');
  $('cardWrap').hidden = false;
}
export function hideCard() { $('cardWrap').hidden = true; }
export const cardOpen = () => !$('cardWrap').hidden;

let sheetClose = null;
/** 底部面板：content 是元素；点外面或下拉关掉 */
export function sheet(content, { onClose, cls } = {}) {
  const wrap = $('sheetWrap'), el = $('sheet');
  el.replaceChildren(h('div.sheet-grab'), content);
  el.className = 'sheet' + (cls ? ' ' + cls : '');
  wrap.hidden = false;
  wrap.classList.remove('out');
  sheetClose = onClose || null;
  el.scrollTop = 0;
}
export function closeSheet() {
  const wrap = $('sheetWrap');
  if (wrap.hidden) return;
  wrap.classList.add('out');
  const fn = sheetClose; sheetClose = null;
  setTimeout(() => { wrap.hidden = true; wrap.classList.remove('out'); }, 220);
  fn && fn();
}
export const sheetOpen = () => !$('sheetWrap').hidden;
$('sheetWrap').addEventListener('pointerdown', (e) => { if (e.target === $('sheetWrap')) closeSheet(); });
