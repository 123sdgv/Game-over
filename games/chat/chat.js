// 聊天页：消息列表、输入栏、长按菜单、多选转发、加号面板、表情面板
import { A, save, bump, sender, nameOf, pname, isGroup, patText, recallText, rpText, snippet, unreadTotal, mediaUsed, sfx, hb } from './state.js';
import { h, popMenu, toast, viewer, confirm, blurActive, swallowClick } from './ui.js';
import { I, WAVE } from './icons.js';
import { avatarEl, groupAvatarEl, applyWall, isLoud } from './look.js';
import { media, pickFiles, shrink } from './media.js';
import { fmtTime, uid } from './data.js';
import * as F from './sheets.js';
import { linkCard, redpacketCard, transferCard, callBubble, historyCard, openRedpacket, openTransfer, makeHistory, historyPage } from './cards.js';
import { push, pop } from './nav.js';
import { infoPage } from './info.js';

const LONG = 420;
const BUBBLE_KINDS = ['text', 'img', 'voice', 'sticker', 'link', 'redpacket', 'transfer', 'call', 'history'];
const isMsg = (m) => BUBBLE_KINDS.includes(m.k);

export function chatPage(c, hooks) {
  // ---------- DOM ----------
  const wall = h('div', { class: 'wall' });
  const backBadge = h('span', { class: 'back-badge' });
  const titleName = h('b');
  const titleSub = h('small');
  const backBtn = h('button', { class: 'nbtn back', 'aria-label': '返回', onclick: () => (sel ? exitSelect() : pop()) }, h('span', { class: 'ic', html: I.back }), backBadge);
  const cancelSel = h('button', { class: 'nbtn txt sel-only', text: '取消', onclick: () => exitSelect() });
  const moreBtn = h('button', { class: 'nbtn more', 'aria-label': '聊天信息', html: I.more, onclick: () => openInfo() });
  const nav = h('header', { class: 'cnav' }, h('div', { class: 'nl' }, backBtn, cancelSel), h('div', { class: 'ctitle' }, titleName, titleSub), moreBtn);
  const inner = h('div', { class: 'msgs-in' });
  const list = h('div', { class: 'msgs' }, inner);

  const ta = h('textarea', { rows: 1, enterkeyhint: 'send', autocomplete: 'off', 'aria-label': '输入消息' });
  const emoBtn = h('button', { class: 'cbtn emo', html: I.smile, 'aria-label': '表情' });
  const addBtn = h('button', { class: 'cbtn add', html: I.plus, 'aria-label': '更多' });
  const sendBtn = h('button', { class: 'sendbtn', text: '发送' });
  const banners = h('div', { class: 'banners' });
  const atPop = h('div', { class: 'at-pop', hidden: true });
  const plusGrid = h('div', { class: 'pp-grid' });
  const stkGrid = h('div', { class: 'stk-grid' });
  const panel = h('div', { class: 'panel' }, h('div', { class: 'pp plus' }, plusGrid), h('div', { class: 'pp stk' }, stkGrid));
  const composer = h('div', { class: 'composer' }, atPop, banners,
    h('div', { class: 'cbar' }, h('div', { class: 'field' }, ta), emoBtn, h('div', { class: 'addsend' }, addBtn, sendBtn)),
    panel);
  const selBtn = (icon, label, fn, cls = '') => h('button', { class: 'selb ' + cls, onclick: fn }, h('span', { class: 'ic', html: icon }), h('span', { text: label }));
  const selBar = h('div', { class: 'selbar' },
    selBtn(I.forward, '逐条转发', () => forward(false)),
    selBtn(I.chatlog, '合并转发', () => forward(true)),
    selBtn(I.trash, '删除', () => delSelected(), 'danger'));
  const el = h('section', { class: 'page chat' }, wall, list, nav, composer, selBar);

  // ---------- 状态 ----------
  let mode = { edit: null, quote: null, before: null };
  let panelOn = null;
  let atBottom = true;
  let sel = null; // 多选时是一个 Set
  const nodes = new Map(); // id → { m, el }

  // ---------- 外观 ----------
  function paintHead() {
    if (sel) {
      titleName.textContent = sel.size ? `已选 ${sel.size} 条` : '选择消息';
      titleSub.textContent = '';
      nav.classList.remove('has-sub');
    } else {
      titleName.textContent = isGroup(c) ? `${pname(c)}(${c.members.length + 1})` : pname(c);
      titleSub.textContent = c.sub || '';
      nav.classList.toggle('has-sub', !!c.sub);
    }
    const n = unreadTotal(c.id);
    backBadge.textContent = n > 99 ? '99+' : n ? String(n) : '';
    backBadge.hidden = !n;
    const spec = c.wall ?? A.D.wall;
    applyWall(wall, spec);
    el.classList.toggle('loud', !!isLoud(spec));
    el.classList.toggle('walled', spec !== 'none' && spec != null);
    el.dataset.bub = c.bub || 'classic';
    el.dataset.font = c.font || 'normal';
  }

  // ---------- 消息 ----------
  /** 引用的快照：图片只留图，文字只留那句话 */
  function quoteOf(m) {
    const q = { id: m.id, s: m.s, who: m.who, k: m.k };
    if (m.k === 'img' || m.k === 'sticker') Object.assign(q, { media: m.media, w: m.w, h: m.h });
    else if (m.k === 'text') q.t = m.text;
    else if (m.k === 'voice') q.t = `${m.sec}″`;
    else if (m.k === 'link') q.t = m.title || m.url;
    else q.t = snippet(c, m);
    return q;
  }
  function qBox(m) {
    if (!m.q) return null;
    const src = c.msgs.find((x) => x.id === m.q.id);
    if (src && src.k === 'recall') return h('div', { class: 'qbox gone', 'data-q': m.q.id, text: '原消息已撤回' });
    const q = src && isMsg(src) ? quoteOf(src) : m.q;
    if (q.k === 'img' || q.k === 'sticker') {
      const img = h('img', { alt: '', draggable: 'false' });
      media.url(q.media).then((u) => { if (u) img.src = u; });
      const r = (q.w || 1) / (q.h || 1);
      return h('div', { class: 'qbox pic' + (q.k === 'sticker' ? ' stk' : ''), 'data-q': q.id }, h('div', { class: 'qpic', style: { width: Math.round(Math.min(96, Math.max(32, 52 * r))) + 'px' } }, img));
    }
    if (q.k === 'voice') return h('div', { class: 'qbox', 'data-q': q.id }, h('span', { class: 'qwave', html: WAVE }), h('span', { text: q.t }));
    return h('div', { class: 'qbox', 'data-q': q.id }, h('span', { class: 'qt', text: q.t }));
  }
  function mediaSize(w, hh, maxW, maxH, minS, up) {
    let k = Math.min(maxW / w, maxH / hh);
    k = Math.min(k, up);
    let dw = w * k, dh = hh * k;
    if (Math.max(dw, dh) < minS) { const g = minS / Math.max(dw, dh); dw *= g; dh *= g; }
    return [Math.round(dw), Math.round(dh)];
  }
  const center = (m, cls, ...kids) => h('div', { class: 'center ' + cls, 'data-id': m.id }, h('span', {}, ...kids));
  function build(m) {
    if (m.k === 'time') return center(m, 'time', fmtTime(m.t));
    if (m.k === 'sys') return center(m, 'sys', m.text);
    if (m.k === 'pat') return center(m, 'sys pat', patText(c, m));
    if (m.k === 'rpnote') return center(m, 'sys', h('i', { class: 'rp-mini' }), rpText(c, m));
    if (m.k === 'recall') {
      const canRe = m.s === 'R' && m.orig && m.orig.k === 'text';
      return center(m, 'sys', recallText(c, m), canRe && h('a', { class: 'reedit', text: ' 重新编辑' }));
    }
    const side = m.s === 'L' ? 'L' : 'R';
    const av = avatarEl(sender(c, m), 's40 m-av', { frame: true });
    let body;
    if (m.k === 'text') body = h('div', { class: 'bub text' }, h('span', { class: 'tx', text: m.text }));
    else if (m.k === 'voice') {
      const w = Math.round(Math.min(220, 72 + m.sec * 3));
      body = h('div', { class: 'bub voice', style: { width: w + 'px' } }, h('span', { class: 'wv', html: WAVE }), h('span', { class: 'sec', text: `${m.sec}″` }));
    } else if (m.k === 'call') body = h('div', { class: 'bub call' }, callBubble(m));
    else if (m.k === 'img' || m.k === 'sticker') {
      const stk = m.k === 'sticker';
      const [w, hh] = stk ? mediaSize(m.w || 120, m.h || 120, 128, 128, 64, 2) : mediaSize(m.w || 300, m.h || 300, 196, 236, 72, 1);
      const img = h('img', { alt: '', draggable: 'false' });
      body = h('div', { class: 'media ' + (stk ? 'stk' : 'img'), style: { width: w + 'px', height: hh + 'px' } }, img);
      media.url(m.media).then((u) => { if (u) img.src = u; else body.classList.add('lost'); });
    } else if (m.k === 'link') body = linkCard(m);
    else if (m.k === 'redpacket') body = redpacketCard(m);
    else if (m.k === 'transfer') body = transferCard(c, m);
    else if (m.k === 'history') body = historyCard(m);
    const line = h('div', { class: 'line' }, body,
      m.fail && h('i', { class: 'fail', text: '!' }),
      m.k === 'voice' && side === 'L' && !m.heard && h('i', { class: 'vdot' }));
    const col = h('div', { class: 'col' },
      isGroup(c) && side === 'L' && c.showNames && h('div', { class: 'mname', text: nameOf(c, 'L', m.who) }),
      line,
      m.k === 'voice' && m.showText && m.text ? h('div', { class: 'vtext', text: m.text }) : null,
      qBox(m));
    return h('div', { class: 'msg ' + side + (m.k === 'sticker' ? ' is-stk' : ''), 'data-id': m.id }, h('i', { class: 'chk' }), av, col);
  }

  function render(anim) {
    const seen = new Set();
    const order = [];
    for (const m of c.msgs) {
      let n = nodes.get(m.id);
      if (n && n.m !== m) { n.el.remove(); n = null; }
      if (!n) { n = { m, el: build(m) }; nodes.set(m.id, n); }
      seen.add(m.id);
      order.push(n.el);
    }
    for (const [id, n] of nodes) if (!seen.has(id)) { n.el.remove(); nodes.delete(id); }
    let prev = null;
    for (const node of order) {
      const want = prev ? prev.nextSibling : inner.firstChild;
      if (node !== want) inner.insertBefore(node, want);
      prev = node;
    }
    if (anim) for (const id of anim) { const n = nodes.get(id); if (n) { n.el.classList.remove('pop-in'); void n.el.offsetWidth; n.el.classList.add('pop-in'); } }
    markAnchor();
    if (sel) paintSel();
  }
  function rebuild() { for (const n of nodes.values()) n.el.remove(); nodes.clear(); render(); }
  function markAnchor() { for (const n of nodes.values()) n.el.classList.toggle('anchor', n.m.id === mode.before); }

  const scrollBottom = (smooth) => {
    const top = list.scrollHeight - list.clientHeight;
    if (smooth) list.scrollTo({ top, behavior: 'smooth' }); else list.scrollTop = top;
    atBottom = true;
  };
  list.addEventListener('scroll', () => { atBottom = list.scrollHeight - list.clientHeight - list.scrollTop < 48; }, { passive: true });
  new ResizeObserver(() => { if (atBottom) scrollBottom(false); }).observe(list);

  function touch() { c.updated = Date.now(); save(); hooks.changed(); }

  /** 放一条新消息：插入模式就插到选中那条前面，不然放最后 */
  function place(m, { sound = true } = {}) {
    const anim = [m.id];
    const idx = mode.before ? c.msgs.findIndex((x) => x.id === mode.before) : -1;
    if (mode.before && idx < 0) mode.before = null;
    if (idx >= 0) c.msgs.splice(idx, 0, m);
    else {
      if (!c.msgs.length && m.k !== 'time') { const t = { id: uid(), k: 'time', t: Date.now() }; c.msgs.push(t); anim.push(t.id); }
      c.msgs.push(m);
    }
    if (m.k !== 'time') bump('sent');
    render(anim);
    if (idx < 0) requestAnimationFrame(() => scrollBottom(true));
    if (sound) { if (m.s === 'L') sfx.recv(); else if (m.s === 'R') sfx.send(); else sfx.pop(); }
    touch();
  }
  function replace(id, next) {
    const i = c.msgs.findIndex((x) => x.id === id);
    if (i < 0) return;
    c.msgs[i] = next;
    // 引用了它的消息也要重画
    for (const x of c.msgs) if (x.q && x.q.id === id) { const n = nodes.get(x.id); if (n) { n.el.remove(); nodes.delete(x.id); } }
    render();
    touch();
  }
  /** 删掉以后没人用的图片才真删 */
  function dropMedia(m) {
    const ids = [];
    const walk = (x) => { if (!x) return; if (x.media) ids.push(x.media); if (x.cover) ids.push(x.cover); if (x.k === 'recall') walk(x.orig); };
    walk(m);
    setTimeout(() => { for (const id of ids) if (!mediaUsed(id)) media.del(id); }, 0);
  }
  async function remove(ids) {
    const set = new Set(ids);
    await Promise.all([...set].map((id) => {
      const n = nodes.get(id);
      if (!n) return null;
      const hgt = n.el.offsetHeight;
      return n.el.animate([{ opacity: 1, height: hgt + 'px', transform: 'scale(1)' }, { opacity: 0, height: '0px', marginTop: '0px', marginBottom: '0px', transform: 'scale(.92)' }],
        { duration: 200, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'forwards' }).finished.catch(() => {});
    }));
    const gone = c.msgs.filter((x) => set.has(x.id));
    c.msgs = c.msgs.filter((x) => !set.has(x.id));
    gone.forEach(dropMedia);
    if (set.has(mode.before)) mode.before = null;
    if (set.has(mode.edit)) { mode.edit = null; ta.value = c.draft || ''; autosize(); }
    if (mode.quote && set.has(mode.quote.id)) mode.quote = null;
    paintBanners();
    render();
    touch();
  }

  // ---------- 输入栏（一律发在右边） ----------
  function autosize() {
    ta.style.height = 'auto';
    ta.style.height = Math.min(118, ta.scrollHeight) + 'px';
    composer.classList.toggle('typing', ta.value.trim().length > 0);
  }
  ta.addEventListener('input', (e) => {
    autosize();
    if (!mode.edit) { c.draft = ta.value; save(); }
    if (isGroup(c) && e.data === '@') showAt(); else hideAt();
  });
  ta.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.shiftKey || e.isComposing || e.keyCode === 229) return;
    if (!A.S.enterSend) return;
    e.preventDefault();
    send();
  });
  ta.addEventListener('focus', () => { if (panelOn) setPanel(null, true); });
  sendBtn.addEventListener('pointerdown', (e) => e.preventDefault()); // 点发送不收键盘
  sendBtn.addEventListener('click', send);

  function send() {
    const text = ta.value.replace(/^\s*\n+|\n+\s*$/g, '');
    if (!text.trim()) return;
    hideAt();
    if (mode.edit) {
      const m = c.msgs.find((x) => x.id === mode.edit);
      if (m) replace(m.id, { ...m, text });
      mode.edit = null;
      paintBanners();
      ta.value = c.draft || '';
      autosize();
      sfx.pop();
      return;
    }
    const m = { id: uid(), k: 'text', s: 'R', text };
    if (mode.quote) m.q = mode.quote;
    mode.quote = null;
    ta.value = '';
    c.draft = '';
    autosize();
    paintBanners();
    place(m);
  }

  // 群聊里打 @ 弹出成员
  function showAt() {
    atPop.replaceChildren(...c.members.map((p) => h('button', { class: 'at-row', onpointerdown: (e) => e.preventDefault(), onclick: () => {
      const pos = ta.selectionStart;
      ta.value = ta.value.slice(0, pos) + p.name + ' ' + ta.value.slice(pos);
      ta.setSelectionRange(pos + p.name.length + 1, pos + p.name.length + 1);
      hideAt(); autosize(); c.draft = ta.value; save(); ta.focus();
    } }, avatarEl(p, 's28'), h('span', { text: p.name }))));
    atPop.hidden = !c.members.length;
  }
  function hideAt() { atPop.hidden = true; }

  function setMode(patch, quiet) {
    Object.assign(mode, patch);
    paintBanners();
    markAnchor();
    if (!quiet) sfx.tick();
  }
  function paintBanners() {
    const rows = [];
    const x = (fn) => h('button', { class: 'b-x', html: I.close, 'aria-label': '取消', onpointerdown: (e) => e.preventDefault(), onclick: fn });
    if (mode.edit) rows.push(h('div', { class: 'banner' }, h('span', { class: 'b-tx', text: '正在编辑这条消息，改完点发送' }), x(() => { setMode({ edit: null }); ta.value = c.draft || ''; autosize(); })));
    if (mode.quote) {
      const q = mode.quote;
      let content;
      if (q.k === 'img' || q.k === 'sticker') {
        const img = h('img', { alt: '' });
        media.url(q.media).then((u) => { if (u) img.src = u; });
        content = h('span', { class: 'b-pic' }, img);
      } else content = h('span', { class: 'b-tx', text: q.k === 'voice' ? `语音 ${q.t}` : q.t });
      rows.push(h('div', { class: 'banner quote' }, h('span', { class: 'b-lab', text: `回复 ${nameOf(c, q.s, q.who)}：` }), content, x(() => setMode({ quote: null }))));
    }
    if (mode.before) rows.push(h('div', { class: 'banner' }, h('span', { class: 'b-tx', text: '新消息会插到虚线那里' }), x(() => setMode({ before: null }))));
    banners.replaceChildren(...rows);
  }

  // ---------- 加号面板 / 表情面板 ----------
  const tool = (icon, label, fn) => h('button', { class: 'tool', onclick: fn }, h('span', { class: 'tool-ic', html: icon }), h('span', { text: label }));
  const R = () => ({ s: 'R' });
  plusGrid.append(
    tool(I.photo, '相册', () => pickFiles({ multiple: true }).then(sendImages)),
    tool(I.mic, '语音', () => F.voiceSheet({ onSave: (v) => place({ id: uid(), k: 'voice', ...R(), sec: v.sec, text: v.text || undefined }) })),
    tool(I.redpacket, '红包', () => F.redpacketSheet({ onSave: (v) => { place({ id: uid(), k: 'redpacket', ...R(), ...v }); setPanel(null, true); } })),
    tool(I.transfer, '转账', () => F.transferSheet({ onSave: (v) => { place({ id: uid(), k: 'transfer', ...R(), ...v }); setPanel(null, true); } })),
    tool(I.link, '链接', () => F.linkSheet({ onSave: (v) => { place({ id: uid(), k: 'link', ...R(), ...v }); setPanel(null, true); } })),
    tool(I.phone, '通话', () => F.callSheet({ onSave: (v) => { place({ id: uid(), k: 'call', ...R(), ...v }); setPanel(null, true); } })),
    tool(I.clock, '时间', () => F.timeSheet({ t: lastTime() + 5 * 60e3, onSave: (t) => place({ id: uid(), k: 'time', t }) })),
    tool(I.text, '小字', () => F.sysSheet({ onSave: (text) => place({ id: uid(), k: 'sys', text }) })),
    tool(I.hand, '拍一拍', () => {
      if (isGroup(c)) pickPerson('拍一拍谁', null, (p) => doPat(p.s, p.who));
      else doPat('L');
    }),
  );
  function doPat(toS, toWho) {
    place({ id: uid(), k: 'pat', from: 'R', to: toS, ...(toWho ? { toWho } : {}) }, { sound: false });
    sfx.pat(); hb.haptic([10, 30, 10]);
  }
  function lastTime() {
    for (let i = c.msgs.length - 1; i >= 0; i--) if (c.msgs[i].k === 'time') return c.msgs[i].t;
    return Date.now() - 5 * 60e3;
  }
  async function sendImages(files) {
    for (const f of files.slice(0, 9)) {
      try {
        const { blob, w, h: hh } = await shrink(f, { max: 1280, q: 0.84 });
        const id = 'i' + uid();
        await media.put(id, blob);
        place({ id: uid(), k: 'img', s: 'R', media: id, w, h: hh });
      } catch { toast('有一张图读不出来'); }
    }
    if (files.length) setPanel(null);
  }
  function paintStickers() {
    stkGrid.replaceChildren(
      h('button', { class: 'stk-cell add', html: I.add, 'aria-label': '加表情', onclick: () => F.addStickers().then((n) => n && paintStickers()) }),
      ...A.D.stickers.map((st) => h('button', { class: 'stk-cell', 'data-sid': st.id }, F.stickerImg(st))),
    );
    if (!A.D.stickers.length) stkGrid.append(h('div', { class: 'stk-empty', text: '点 ＋ 从相册加表情包' }));
  }
  // 表情：点一下发出去，长按删掉
  {
    let t = 0, fired = false, sx = 0, sy = 0;
    stkGrid.addEventListener('pointerdown', (e) => {
      const cell = e.target.closest('[data-sid]');
      if (!cell) return;
      fired = false; sx = e.clientX; sy = e.clientY;
      t = setTimeout(async () => {
        fired = true; hb.haptic(10);
        const ok = await confirm({ title: '从表情里删掉？', message: '已经发出去的不受影响。', ok: '删掉', danger: true });
        if (ok) { A.D.stickers = A.D.stickers.filter((x) => x.id !== cell.dataset.sid); save(); paintStickers(); sfx.del(); }
      }, 520);
    });
    stkGrid.addEventListener('pointermove', (e) => { if (Math.hypot(e.clientX - sx, e.clientY - sy) > 8) clearTimeout(t); });
    const end = () => clearTimeout(t);
    stkGrid.addEventListener('pointerup', end);
    stkGrid.addEventListener('pointercancel', end);
    stkGrid.addEventListener('click', (e) => {
      const cell = e.target.closest('[data-sid]');
      if (!cell || fired) return;
      const st = A.D.stickers.find((x) => x.id === cell.dataset.sid);
      if (!st) return;
      cell.animate([{ transform: 'scale(1)' }, { transform: 'scale(.86)' }, { transform: 'scale(1)' }], { duration: 220 });
      place({ id: uid(), k: 'sticker', s: 'R', media: st.id, w: st.w, h: st.h, ...(mode.quote ? { q: mode.quote } : {}) });
      if (mode.quote) setMode({ quote: null }, true);
    });
  }

  function setPanel(which, quiet) {
    if (which === panelOn) which = null;
    panelOn = which;
    composer.classList.toggle('p-plus', which === 'plus');
    composer.classList.toggle('p-stk', which === 'stk');
    if (which) panel.dataset.show = which;
    emoBtn.innerHTML = which === 'stk' ? I.keyboard : I.smile;
    if (which) { blurActive(); hideAt(); if (which === 'stk') paintStickers(); }
    if (!quiet) sfx.tick();
  }
  emoBtn.addEventListener('click', () => {
    if (panelOn === 'stk') { setPanel(null, true); ta.focus(); return; }
    setPanel('stk');
  });
  addBtn.addEventListener('click', () => setPanel('plus'));

  // ---------- 手势：长按出菜单、双击头像拍一拍、点卡片打开 ----------
  let lp = null;
  let lastAv = { id: null, at: 0 };
  const cancelLP = () => { if (lp) { clearTimeout(lp.t); lp = null; } };

  list.addEventListener('pointerdown', (e) => {
    cancelLP();
    const row = e.target.closest('[data-id]');
    const target = e.target.closest('.bub, .media, .card, .center span, .vtext');
    lp = { x: e.clientX, y: e.clientY, fired: false, t: 0, at: performance.now(), raw: e.target };
    if (row && target && !sel) lp.t = setTimeout(() => { lp.fired = true; openMenu(row.dataset.id, target); }, LONG);
  });
  list.addEventListener('pointermove', (e) => {
    if (lp && Math.hypot(e.clientX - lp.x, e.clientY - lp.y) > 9) { clearTimeout(lp.t); lp.moved = true; }
  });
  list.addEventListener('pointercancel', () => { if (lp) { clearTimeout(lp.t); lp.moved = true; } });
  list.addEventListener('pointerup', () => {
    if (!lp) return;
    clearTimeout(lp.t);
    if (!lp.fired && !lp.moved && performance.now() - lp.at < LONG) { swallowClick(); onTap(lp.raw); }
    else if (lp.fired) swallowClick();
    lp = null;
  });

  function onTap(raw) {
    const row = raw.closest('[data-id]');
    const m = row && c.msgs.find((x) => x.id === row.dataset.id);
    if (sel) { if (m && isMsg(m)) toggleSel(m.id); return; }
    if (raw.closest('.reedit') && m) { reEdit(m); return; }
    const qb = raw.closest('.qbox');
    if (qb) { jumpTo(qb.dataset.q); return; }
    const av = raw.closest('.m-av');
    if (av && m) {
      const now = performance.now();
      if (lastAv.id === m.id && now - lastAv.at < 340) {
        lastAv = { id: null, at: 0 };
        av.animate([{ transform: 'rotate(0)' }, { transform: 'rotate(-14deg) scale(1.06)' }, { transform: 'rotate(12deg)' }, { transform: 'rotate(-6deg)' }, { transform: 'rotate(0)' }], { duration: 420, easing: 'ease-out' });
        doPat(m.s, m.s === 'L' && isGroup(c) ? m.who : undefined);
        return;
      }
      lastAv = { id: m.id, at: now };
      return;
    }
    if (m && raw.closest('.bub.voice')) { playVoice(m, row); return; }
    if (m && raw.closest('.media')) {
      const img = row.querySelector('.media img');
      if (img && img.src) viewer(img.src, img);
      return;
    }
    if (m && m.k === 'redpacket' && raw.closest('.card')) { tapRedpacket(m); return; }
    if (m && m.k === 'transfer' && raw.closest('.card')) { tapTransfer(m); return; }
    if (m && m.k === 'history' && raw.closest('.card')) { push(historyPage(m)); return; }
    if (m && raw.closest('.card')) { raw.closest('.card').animate([{ transform: 'scale(1)' }, { transform: 'scale(.97)' }, { transform: 'scale(1)' }], { duration: 200 }); return; }
    if (!raw.closest('.center')) {
      if (panelOn) setPanel(null, true);
      if (document.activeElement === ta) ta.blur();
      hideAt();
    }
  }

  /** 点引用：滚到原消息，闪一下 */
  function jumpTo(id) {
    const n = nodes.get(id);
    if (!n) { toast('原消息已经删掉了'); return; }
    const r = n.el.getBoundingClientRect(), lr = list.getBoundingClientRect();
    list.scrollTo({ top: list.scrollTop + r.top - lr.top - lr.height / 2 + r.height / 2, behavior: 'smooth' });
    n.el.classList.remove('flash'); void n.el.offsetWidth; n.el.classList.add('flash');
    sfx.tick();
  }

  function tapRedpacket(m) {
    const opener = m.s === 'L' ? { s: 'R' } : isGroup(c) ? { s: 'L', who: (c.members[0] || {}).id } : { s: 'L' };
    openRedpacket(c, m, {
      onOpened: () => {
        const cur = c.msgs.find((x) => x.id === m.id) || m;
        replace(m.id, { ...cur, state: 'open' });
        place({ id: uid(), k: 'rpnote', by: opener.s, ...(opener.who ? { byWho: opener.who } : {}), of: m.s, ...(m.who ? { ofWho: m.who } : {}) }, { sound: false });
      },
    });
  }
  function tapTransfer(m) {
    if (m.receipt) return;
    openTransfer(c, m, {
      onDone: (r) => {
        const to = m.s === 'L' ? { s: 'R' } : isGroup(c) ? { s: 'L', who: (c.members[0] || {}).id } : { s: 'L' };
        replace(m.id, { ...m, state: r });
        place({ id: uid(), k: 'transfer', s: to.s, ...(to.who ? { who: to.who } : {}), amount: m.amount, note: '', state: r, receipt: r });
        sfx.coin();
      },
    });
  }

  let playing = null;
  function playVoice(m, row) {
    const bub = row.querySelector('.bub.voice');
    if (playing) { clearTimeout(playing.t); playing.bub.classList.remove('playing'); const same = playing.id === m.id; playing = null; if (same) return; }
    bub.classList.add('playing');
    playing = { id: m.id, bub, t: setTimeout(() => { bub.classList.remove('playing'); playing = null; }, Math.min(60, m.sec) * 1000) };
    if (m.s === 'L' && !m.heard) {
      m.heard = true;
      const d = row.querySelector('.vdot');
      if (d) d.animate([{ transform: 'scale(1)' }, { transform: 'scale(0)' }], { duration: 180, fill: 'forwards' }).onfinish = () => d.remove();
      save();
    }
    sfx.tick();
  }

  function reEdit(m) {
    ta.value = m.orig.text;
    autosize();
    ta.focus();
  }

  // ---------- 换人（群聊）/ 换边（单聊） ----------
  function people(includeMe = true) {
    const out = includeMe ? [{ key: 'R', s: 'R', label: `${nameOf(c, 'R')}（我）`, person: c.right || A.D.me }] : [];
    for (const p of c.members) out.push({ key: p.id, s: 'L', who: p.id, label: p.name, person: p });
    return out;
  }
  function pickPerson(title, current, fn) { F.memberPicker({ title, people: people(), current, onPick: fn }); }
  function flip(m) {
    if (m.k === 'pat') { replace(m.id, { ...m, from: m.to, to: m.from, fromWho: m.toWho, toWho: m.fromWho }); return; }
    if (isGroup(c)) {
      pickPerson('换成谁说的', m.s === 'R' ? 'R' : m.who, (p) => {
        const next = { ...m, s: p.s, heard: true };
        if (p.who) next.who = p.who; else delete next.who;
        replace(m.id, next);
      });
      return;
    }
    replace(m.id, { ...m, s: m.s === 'L' ? 'R' : 'L', heard: true });
  }

  // ---------- 长按菜单 ----------
  async function openMenu(id, target) {
    const m = c.msgs.find((x) => x.id === id);
    if (!m) return;
    if (document.activeElement === ta) ta.blur();
    hb.haptic(12);
    sfx.tick();
    const hl = target;
    hl.classList.add('pressed');
    const it = (key, label, icon, danger) => ({ key, label, icon, danger });
    const L = [];
    const k = m.k;
    if (k === 'text') L.push(it('copy', '复制', I.copy));
    if (k === 'link') L.push(it('copy', '复制链接', I.copy));
    if (k === 'voice') L.push(it('vt', m.showText && m.text ? '收起文字' : '转文字', I.vtext));
    if (['text', 'voice', 'time', 'sys', 'redpacket', 'link', 'call'].includes(k) || (k === 'transfer' && !m.receipt)) L.push(it('edit', '编辑', I.edit));
    if (isMsg(m) && k !== 'call') L.push(it('quote', '引用', I.quote));
    if (isMsg(m)) L.push(it('flip', isGroup(c) ? '换人' : '换边', I.swap));
    if (k === 'pat') L.push(it('flip', '反过来', I.swap));
    if (isMsg(m) && k !== 'call') L.push(it('recall', '撤回', I.undo));
    if (k === 'recall') L.push(it('restore', '恢复', I.restore));
    L.push(it('insert', '插入', I.insert));
    if (isMsg(m)) L.push(it('select', '多选', I.select));
    if (['text', 'img', 'voice', 'link'].includes(k)) L.push(it('fail', m.fail ? '取消失败' : '发送失败', I.alert));
    L.push(it('del', '删除', I.trash, true));
    const navB = nav.getBoundingClientRect().bottom;
    const key = await popMenu(hl.getBoundingClientRect(), L, { minTop: navB + 6 });
    hl.classList.remove('pressed');
    if (key) act(key, m);
  }

  async function act(key, m) {
    switch (key) {
      case 'copy': {
        const text = m.k === 'link' ? m.url : m.text;
        try { await navigator.clipboard.writeText(text); }
        catch {
          const t = h('textarea', { style: { position: 'fixed', opacity: 0 } }); t.value = text; document.body.append(t); t.select();
          try { document.execCommand('copy'); } catch {} t.remove();
        }
        toast('已复制');
        break;
      }
      case 'edit': edit(m); break;
      case 'vt':
        if (!m.text) F.voiceSheet({ title: '这条语音说了什么', sec: m.sec, okLabel: '转文字', onSave: (v) => replace(m.id, { ...m, sec: v.sec, text: v.text || undefined, showText: !!v.text }) });
        else replace(m.id, { ...m, showText: !m.showText });
        break;
      case 'quote':
        setMode({ quote: quoteOf(m), edit: null });
        if (m.k !== 'sticker') ta.focus();
        break;
      case 'flip': flip(m); sfx.tick(); break;
      case 'recall': replace(m.id, { id: m.id, k: 'recall', s: m.s, ...(m.who ? { who: m.who } : {}), orig: m }); sfx.del(); break;
      case 'restore': replace(m.id, { ...m.orig, id: m.id }); sfx.pop(); break;
      case 'insert': setMode({ before: m.id }); break;
      case 'select': enterSelect(m.id); break;
      case 'fail': replace(m.id, { ...m, fail: !m.fail || undefined }); break;
      case 'del': sfx.del(); remove([m.id]); break;
    }
  }
  function edit(m) {
    const save2 = (patch) => replace(m.id, { ...m, ...patch });
    switch (m.k) {
      case 'text':
        setMode({ edit: m.id, quote: null }, true);
        ta.value = m.text; autosize();
        setPanel(null, true);
        ta.focus();
        ta.setSelectionRange(ta.value.length, ta.value.length);
        break;
      case 'voice': F.voiceSheet({ title: '改语音', sec: m.sec, text: m.text || '', okLabel: '保存', onSave: (v) => save2({ sec: v.sec, text: v.text || undefined, showText: v.text ? m.showText : false }) }); break;
      case 'time': F.timeSheet({ title: '改时间', t: m.t, okLabel: '保存', onSave: (t) => save2({ t }) }); break;
      case 'sys': F.sysSheet({ title: '改小字', text: m.text, okLabel: '保存', onSave: (text) => save2({ text }) }); break;
      case 'redpacket': F.redpacketSheet({ init: m, okLabel: '保存', onSave: save2 }); break;
      case 'transfer': F.transferSheet({ init: m, okLabel: '保存', onSave: save2 }); break;
      case 'link': F.linkSheet({ init: m, okLabel: '保存', onSave: (v) => { const old = m.cover; replace(m.id, { ...m, ...v, cover: v.cover }); if (old && old !== v.cover) dropMedia({ cover: old }); } }); break;
      case 'call': F.callSheet({ init: m, okLabel: '保存', onSave: save2 }); break;
    }
  }

  // ---------- 多选：转发 / 删除 ----------
  function enterSelect(id) {
    sel = new Set([id]);
    if (panelOn) setPanel(null, true);
    blurActive(); hideAt();
    el.classList.add('selecting');
    paintSel();
    sfx.tick();
  }
  function exitSelect() {
    sel = null;
    el.classList.remove('selecting');
    for (const n of nodes.values()) n.el.classList.remove('sel');
    paintHead();
  }
  function toggleSel(id) {
    if (sel.has(id)) sel.delete(id); else sel.add(id);
    paintSel();
    sfx.tick();
  }
  function paintSel() {
    for (const n of nodes.values()) n.el.classList.toggle('sel', sel.has(n.m.id));
    selBar.classList.toggle('none', !sel.size);
    paintHead();
  }
  /** 选中的消息（按顺序），合并转发时把中间的时间也带上 */
  function picked(withTimes) {
    const idx = c.msgs.map((m, i) => (sel.has(m.id) ? i : -1)).filter((i) => i >= 0);
    if (!idx.length) return [];
    if (!withTimes) return idx.map((i) => c.msgs[i]);
    const out = [];
    let lastTime = null;
    for (let i = 0; i <= idx[idx.length - 1]; i++) {
      const m = c.msgs[i];
      if (m.k === 'time') { lastTime = m; continue; }
      if (sel.has(m.id)) { if (lastTime) { out.push(lastTime); lastTime = null; } out.push(m); }
    }
    return out;
  }
  function forward(merge) {
    if (!sel || !sel.size) return;
    const msgs = picked(merge);
    hooks.pickChat((target) => {
      let add;
      if (merge) add = [{ id: uid(), s: 'R', ...makeHistory(c, msgs) }];
      else add = msgs.filter((m) => ['text', 'img', 'sticker', 'voice', 'link', 'history'].includes(m.k))
        .map((m) => { const x = { ...m, id: uid(), s: 'R', heard: true }; delete x.who; delete x.q; delete x.fail; delete x.showText; return x; });
      if (!add.length) { toast('这些消息不能逐条转发'); return; }
      exitSelect();
      if (target === c) { for (const m of add) place(m); return; }
      if (!target.msgs.length) target.msgs.push({ id: uid(), k: 'time', t: Date.now() });
      target.msgs.push(...add);
      target.updated = Date.now();
      bump('sent', add.length);
      save(); hooks.changed();
      toast('已转发'); sfx.send();
    });
  }
  async function delSelected() {
    if (!sel || !sel.size) return;
    if (!(await confirm({ title: `删除 ${sel.size} 条消息？`, ok: '删除', danger: true }))) return;
    const ids = [...sel];
    exitSelect();
    sfx.del();
    remove(ids);
  }

  // ---------- 聊天信息 ----------
  function openInfo() {
    if (sel) return;
    blurActive();
    if (panelOn) setPanel(null, true);
    push(infoPage(c, {
      changed: () => { touch(); },
      cleared: () => { mode = { edit: null, quote: null, before: null }; paintBanners(); rebuild(); },
      deleted: () => { hooks.deleted(); },
    }));
  }

  // ---------- 第一次打开的提示 ----------
  function coach() {
    if (hb.load('tutored2', false)) return;
    const tip = h('div', { class: 'coach' },
      h('div', { class: 'coach-card mid' },
        h('b', { text: '两边都是你来写' }),
        h('p', { text: '新消息都发在右边。想让对方说，长按那条消息点「换边」。' }),
        h('p', { text: '长按还能编辑、引用、撤回、插入、多选转发、删除；双击头像是拍一拍。' }),
        h('button', { class: 'btn-primary', text: '知道了', onclick: () => { hb.save('tutored2', true); tip.classList.remove('on'); setTimeout(() => tip.remove(), 260); } })));
    el.append(tip);
    tip.getBoundingClientRect();
    tip.classList.add('on');
  }

  // ---------- 生命周期 ----------
  c.unread = 0;
  ta.value = c.draft || '';
  paintHead();
  paintBanners();
  render();
  requestAnimationFrame(() => { autosize(); scrollBottom(false); });
  save();

  return {
    el,
    chat: c,
    onShown: () => { scrollBottom(false); coach(); },
    onShow: () => { paintHead(); rebuild(); },
    onHide: () => { cancelLP(); blurActive(); hideAt(); if (playing) { clearTimeout(playing.t); playing.bub.classList.remove('playing'); playing = null; } },
    onEdgeStart: () => { cancelLP(); },
    onDestroy: () => { hooks.closed(); },
    closeTransient: () => { cancelLP(); if (panelOn) setPanel(null, true); hideAt(); },
    // 测试用
    api: {
      send: (text) => { ta.value = text; send(); },
      say: (text, s = 'L', who) => place({ id: uid(), k: 'text', s, ...(who ? { who } : {}), text }),
      place, act, get mode() { return mode; }, get sel() { return sel; }, setPanel, render, enterSelect, toggleSel, forward, tapRedpacket, tapTransfer, jumpTo,
      openMenu: (id) => { const n = nodes.get(id); if (n) openMenu(id, n.el.querySelector('.bub, .media, .card, .center span')); },
    },
  };
}
