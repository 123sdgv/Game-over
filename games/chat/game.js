// 聊天：自己写两边对话的聊天页（给捡手机文学用）。入口：根页面（消息列表 / 我）、主题、键盘适配、测试钩子
import { A, hb, save, flush, sfx, syncStats, storyTime, snippet, pname, chatById } from './state.js';
import { makeChat, fmtTime, uid, hashColor } from './data.js';
import { h, confirm } from './ui.js';
import { I } from './icons.js';
import { avatarEl } from './look.js';
import { media } from './media.js';
import * as F from './sheets.js';
import { initNav, push, popToRoot, depth } from './nav.js';
import { chatPage } from './chat.js';
import { cell, group, wallName, releaseWall } from './info.js';

const $ = (s) => document.querySelector(s);
document.addEventListener('touchstart', () => {}, { passive: true }); // 让 iOS 的 :active 生效

// ---------- 主题 ----------
const darkMQ = matchMedia('(prefers-color-scheme: dark)');
function applyTheme() {
  const t = A.D.theme === 'auto' ? (darkMQ.matches ? 'dark' : 'light') : A.D.theme;
  document.documentElement.dataset.theme = t;
}
darkMQ.addEventListener && darkMQ.addEventListener('change', applyTheme);
applyTheme();

// ---------- 根页面 ----------
const emptyArt = `<svg viewBox="0 0 160 120" aria-hidden="true">
  <defs><linearGradient id="ea-b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5A9BFF"/><stop offset="1" stop-color="#2A70F2"/></linearGradient></defs>
  <rect x="18" y="20" width="84" height="44" rx="20" fill="var(--bub-l)"/>
  <rect x="32" y="36" width="44" height="6" rx="3" fill="var(--text3)" opacity=".55"/>
  <rect x="58" y="58" width="86" height="44" rx="20" fill="url(#ea-b)"/>
  <rect x="72" y="74" width="56" height="6" rx="3" fill="#fff" opacity=".85"/>
  <circle cx="14" cy="30" r="9" fill="var(--text3)" opacity=".35"/><circle cx="150" cy="68" r="9" fill="#2A70F2" opacity=".35"/>
</svg>`;

const listEl = $('#list');
const search = $('#search');
const tabMsgs = $('#tabMsgs'), tabMe = $('#tabMe');
const tabBadge = $('#tabBadge');
let query = '';
let openRow = null;

const sorted = () => [...A.D.chats].sort((a, b) => (b.pin ? 1 : 0) - (a.pin ? 1 : 0) || storyTime(b) - storyTime(a) || b.updated - a.updated);

function preview(c) {
  for (let i = c.msgs.length - 1; i >= 0; i--) {
    const m = c.msgs[i];
    if (m.k === 'time') continue;
    return { text: snippet(c, m), fail: !!m.fail };
  }
  return { text: '' };
}

function renderList() {
  const q = query.trim().toLowerCase();
  const chats = sorted().filter((c) => !q || pname(c, 'L').toLowerCase().includes(q) || c.msgs.some((m) => (m.text || '').toLowerCase().includes(q)));
  openRow = null;
  const rows = chats.map(rowEl);
  listEl.replaceChildren(...rows);
  if (!A.D.chats.length) {
    listEl.append(h('div', { class: 'empty' },
      h('div', { class: 'empty-art', html: emptyArt }),
      h('b', { text: '还没有对话' }),
      h('p', { text: '新建一段对话，两边说什么都由你来写。' }),
      h('button', { class: 'btn-primary', text: '新建对话', onclick: newChat })));
  } else if (!chats.length) {
    listEl.append(h('div', { class: 'empty small' }, h('p', { text: '没有找到' })));
  }
  const n = A.D.chats.reduce((s, c) => s + c.unread, 0);
  tabBadge.textContent = n > 99 ? '99+' : String(n);
  tabBadge.hidden = !n;
}

function rowEl(c) {
  const pv = preview(c);
  const av = avatarEl(c.left, 's50');
  const badge = c.unread ? h('i', { class: 'badge', text: c.unread > 99 ? '99+' : c.unread }) : null;
  const sub = c.draft && c.draft.trim()
    ? h('div', { class: 'row-sub' }, h('em', { text: '[草稿] ' }), c.draft.replace(/\s+/g, ' '))
    : h('div', { class: 'row-sub' }, pv.fail && h('span', { class: 'mini-fail', html: I.alert }), pv.text);
  const row = h('div', { class: 'row' + (c.pin ? ' pinned' : '') },
    h('div', { class: 'row-av' }, av, badge),
    h('div', { class: 'row-main' },
      h('div', { class: 'row-top' }, h('b', { text: pname(c, 'L') }), h('time', { text: c.msgs.length ? fmtTime(storyTime(c), true) : '' })),
      sub));
  const actions = h('div', { class: 'row-acts' },
    h('button', { class: 'ra unread', text: c.unread ? '标为已读' : '标为未读', onclick: () => { c.unread = c.unread ? 0 : 1; save(); renderList(); sfx.tick(); } }),
    h('button', { class: 'ra pin', text: c.pin ? '取消置顶' : '置顶', onclick: () => { c.pin = !c.pin; save(); renderList(); sfx.tick(); } }),
    h('button', { class: 'ra del', text: '删除', onclick: async () => {
      if (!(await confirm({ title: `删除和「${pname(c, 'L')}」的对话？`, message: '删掉以后找不回来。', ok: '删除', danger: true }))) { closeRow(); return; }
      deleteChat(c);
    } }));
  const wrap = h('div', { class: 'row-wrap', 'data-id': c.id }, actions, row);
  swipe(wrap, row, actions);
  return wrap;
}

function closeRow(anim = true) {
  if (!openRow) return;
  const r = openRow.querySelector('.row');
  r.style.transition = anim ? '' : 'none';
  r.style.transform = '';
  openRow.classList.remove('open');
  openRow = null;
}

/** 列表行左滑出按钮 */
function swipe(wrap, row, actions) {
  let id = null, x0 = 0, y0 = 0, base = 0, dx = 0, decided = false, drag = false, lastX = 0, lastT = 0, vx = 0, moved = false;
  const W = () => actions.offsetWidth;
  row.addEventListener('pointerdown', (e) => {
    if (openRow && openRow !== wrap) { closeRow(); moved = true; id = null; return; }
    id = e.pointerId; x0 = lastX = e.clientX; y0 = e.clientY; lastT = performance.now();
    base = wrap.classList.contains('open') ? -W() : 0; dx = base; decided = false; drag = false; moved = false; vx = 0;
  });
  row.addEventListener('pointermove', (e) => {
    if (e.pointerId !== id) return;
    const mx = e.clientX - x0, my = e.clientY - y0;
    if (!decided) {
      if (Math.abs(mx) < 7 && Math.abs(my) < 7) return;
      decided = true; moved = true;
      drag = Math.abs(mx) > Math.abs(my) * 1.2;
      if (!drag) return;
      row.setPointerCapture(id);
      row.style.transition = 'none';
    }
    if (!drag) return;
    const w = W();
    let x = base + mx;
    if (x > 0) x = x * 0.25;
    if (x < -w) x = -w + (x + w) * 0.3;
    dx = x;
    const now = performance.now();
    vx = (e.clientX - lastX) / Math.max(1, now - lastT); lastX = e.clientX; lastT = now;
    row.style.transform = `translate3d(${x}px,0,0)`;
  });
  const end = (e) => {
    if (e.pointerId !== id) return;
    id = null;
    if (!drag) return;
    row.style.transition = '';
    const open = vx < -0.35 || (vx < 0.35 && dx < -W() / 2);
    if (open) { row.style.transform = `translate3d(${-W()}px,0,0)`; wrap.classList.add('open'); openRow = wrap; }
    else { row.style.transform = ''; wrap.classList.remove('open'); if (openRow === wrap) openRow = null; }
  };
  row.addEventListener('pointerup', end);
  row.addEventListener('pointercancel', end);
  row.addEventListener('click', () => {
    if (moved) return;
    if (wrap.classList.contains('open')) { closeRow(); return; }
    openChat(wrap.dataset.id);
  });
}

function deleteChat(c) {
  for (const m of c.msgs) { if (m.k === 'img') media.del(m.media); if (m.k === 'recall' && m.orig && m.orig.k === 'img') media.del(m.orig.media); }
  const oldWall = c.wall;
  A.D.chats = A.D.chats.filter((x) => x !== c);
  releaseWall(oldWall);
  save(); syncStats(); sfx.del();
  if (depth() > 1) popToRoot();
  renderList();
}

// ---------- 打开对话 ----------
let current = null;
function openChat(id) {
  const c = chatById(id);
  if (!c || current) return;
  closeRow(false);
  current = chatPage(c, {
    changed: () => renderList(),
    deleted: () => deleteChat(c),
    closed: () => { current = null; renderList(); },
  });
  push(current);
  renderList();
}

function newChat() {
  F.personSheet({
    title: '新对话', person: { name: '', av: { c: hashColor(uid()) } }, nameLabel: '对方的备注', placeholder: '比如：小林', okLabel: '开始聊天',
    onSave: (p) => {
      const c = makeChat({ name: p.name || '对方', av: p.av });
      A.D.chats.push(c);
      save(); syncStats(); renderList();
      setTimeout(() => openChat(c.id), 120);
    },
  });
}
$('#newBtn').addEventListener('click', newChat);
search.addEventListener('input', () => { query = search.value; renderList(); });
search.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) search.blur(); });

// ---------- 「我」页 ----------
const meBody = $('#meBody');
function renderMe() {
  const me = A.D.me;
  const seg = h('div', { class: 'seg' }, ['auto', 'light', 'dark'].map((t, i) => h('button', {
    class: A.D.theme === t ? 'on' : '', text: ['跟随系统', '浅色', '深色'][i],
    onclick: () => { A.D.theme = t; save(); applyTheme(); renderMe(); sfx.tick(); },
  })));
  meBody.replaceChildren(
    h('button', { class: 'me-card', onclick: () => F.personSheet({
      title: '我的资料', person: me, okLabel: '保存',
      onSave: (p) => { A.D.me = { name: p.name || '我', av: p.av }; save(); renderMe(); renderList(); },
    }) },
      avatarEl(me, 's64'),
      h('div', { class: 'me-main' }, h('b', { text: me.name || '我' }), h('small', { text: '右边那个人默认用这套头像和名字' })),
      h('span', { class: 'chev', html: I.right })),
    group('外观', h('div', { class: 'cell seg-cell' }, seg)),
    group('',
      cell({ left: h('span', { class: 'cell-ic blue', html: I.image }), label: '默认聊天背景', value: wallName(A.D.wall), onclick: () => F.wallSheet({
        title: '默认聊天背景', current: A.D.wall, onPick: (spec) => { const old = A.D.wall; A.D.wall = spec; releaseWall(old); save(); renderMe(); },
      }) }),
      cell({ left: h('span', { class: 'cell-ic orange', html: I.sticker }), label: '我的表情', value: `${A.D.stickers.length} 个`, onclick: () => F.stickerManager(renderMe) })),
    h('p', { class: 'me-foot', text: '对话、头像、名字跟着「设置 → 关于本机」的导出一起备份；图片、表情包、相册背景只存在这台手机上。' }),
  );
}

let tab = 'msgs';
function setTab(t) {
  if (t === tab) return;
  tab = t;
  tabMsgs.hidden = t !== 'msgs';
  tabMe.hidden = t !== 'me';
  document.querySelectorAll('.tabbar button').forEach((b) => b.classList.toggle('on', b.dataset.tab === t));
  if (t === 'me') renderMe();
  closeRow(false);
  sfx.tick();
}
document.querySelectorAll('.tabbar button').forEach((b) => b.addEventListener('click', () => setTab(b.dataset.tab)));
document.querySelectorAll('.tabbar button .t-ic').forEach((s) => { s.innerHTML = s.dataset.ic === 'chat' ? I.bubbleFill : I.userFill; });

initNav($('#nav'), { el: $('#root'), onShow: () => renderList() });
renderList();
syncStats();

// 点空白处收起左滑
$('#root').addEventListener('pointerdown', (e) => { if (openRow && !e.target.closest('.row-wrap.open')) closeRow(); }, true);

// ---------- 回主屏幕 ----------
hb.onPause(() => { flush(); if (current) current.closeTransient(); closeRow(false); document.activeElement && document.activeElement.blur && document.activeElement.blur(); });
hb.onResume(() => { applyTheme(); if (current) current.onShow(); else renderList(); });

// ---------- 键盘：让界面贴着键盘上沿（iOS 在 iframe 里打字时可视区域会变小、还会被推上去） ----------
const vp = $('#vp');
const topWin = (() => { try { return window.top && window.top.visualViewport ? window.top : window; } catch { return window; } })();
const isField = (el) => el && (el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && !['range', 'file', 'checkbox', 'radio', 'button'].includes(el.type)));
function fit() {
  const vv = topWin.visualViewport;
  if (!vv) return;
  let topPx = 0, height = innerHeight;
  try {
    const fr = window.frameElement ? window.frameElement.getBoundingClientRect() : { top: 0, height: innerHeight };
    const a = Math.max(0, vv.offsetTop - fr.top), b = Math.min(fr.height, vv.offsetTop + vv.height - fr.top);
    if (b - a > 200) { topPx = a; height = b - a; }
  } catch {}
  const kb = isField(document.activeElement) && height < innerHeight - 120;
  if (kb) { vp.style.top = topPx + 'px'; vp.style.height = height + 'px'; }
  else { vp.style.top = ''; vp.style.height = ''; }
  vp.classList.toggle('kb', kb);
}
if (topWin.visualViewport) {
  topWin.visualViewport.addEventListener('resize', fit);
  topWin.visualViewport.addEventListener('scroll', fit);
}
document.addEventListener('focusin', () => setTimeout(fit, 60));
document.addEventListener('focusout', () => setTimeout(() => {
  fit();
  if (!isField(document.activeElement)) { try { if (topWin.scrollY) topWin.scrollTo(0, 0); } catch {} }
}, 80));



// ---------- 测试钩子 ----------
window.__chat = {
  get D() { return A.D; },
  get page() { return current; },
  openChat, newChat, renderList, setTab, flush,
  add(name) { const c = makeChat({ name, av: { c: hashColor(name) } }); A.D.chats.push(c); save(); syncStats(); renderList(); return c.id; },
};
