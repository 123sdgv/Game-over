// 聊天页：消息列表、输入栏、长按菜单、加号面板、表情面板
import { A, save, bump, person, pname, patText, recallText, snippet, unreadTotal, sfx, hb } from './state.js';
import { h, popMenu, toast, viewer, confirm, blurActive } from './ui.js';
import { I, WAVE } from './icons.js';
import { avatarEl, setAvatar, applyWall, isLoud } from './look.js';
import { media, pickFiles, shrink } from './media.js';
import { fmtTime, uid } from './data.js';
import * as F from './sheets.js';
import { push, pop } from './nav.js';
import { infoPage } from './info.js';

const other = (s) => (s === 'L' ? 'R' : 'L');
const LONG = 420;

export function chatPage(c, hooks) {
  // ---------- DOM ----------
  const wall = h('div', { class: 'wall' });
  const backBadge = h('span', { class: 'back-badge' });
  const titleName = h('b');
  const titleSub = h('small');
  const nav = h('header', { class: 'cnav' },
    h('button', { class: 'nbtn back', 'aria-label': '返回', onclick: () => pop() }, h('span', { class: 'ic', html: I.back }), backBadge),
    h('div', { class: 'ctitle' }, titleName, titleSub),
    h('button', { class: 'nbtn more', 'aria-label': '聊天信息', html: I.more, onclick: () => openInfo() }));
  const inner = h('div', { class: 'msgs-in' });
  const list = h('div', { class: 'msgs' }, inner);

  const spkAv = h('div', { class: 'av s32' });
  const spkBtn = h('button', { class: 'spk', 'aria-label': '换另一个人说话' }, spkAv, h('i', { class: 'spk-swap', html: I.swap }));
  const ta = h('textarea', { rows: 1, enterkeyhint: 'send', autocomplete: 'off', 'aria-label': '输入消息' });
  const emoBtn = h('button', { class: 'cbtn emo', html: I.smile, 'aria-label': '表情' });
  const addBtn = h('button', { class: 'cbtn add', html: I.plus, 'aria-label': '更多' });
  const sendBtn = h('button', { class: 'sendbtn', text: '发送' });
  const banners = h('div', { class: 'banners' });
  const plusGrid = h('div', { class: 'pp-grid' });
  const stkGrid = h('div', { class: 'stk-grid' });
  const panel = h('div', { class: 'panel' }, h('div', { class: 'pp plus' }, plusGrid), h('div', { class: 'pp stk' }, stkGrid));
  const composer = h('div', { class: 'composer' }, banners,
    h('div', { class: 'cbar' }, spkBtn, h('div', { class: 'field' }, ta), emoBtn, h('div', { class: 'addsend' }, addBtn, sendBtn)),
    panel);
  const el = h('section', { class: 'page chat' }, wall, list, nav, composer);

  // ---------- 状态 ----------
  let spk = c.spk || 'R';
  let mode = { edit: null, quote: null, before: null };
  let panelOn = null;
  let atBottom = true;
  const nodes = new Map(); // id → { m, el }

  // ---------- 外观 ----------
  function paintHead() {
    titleName.textContent = pname(c, 'L');
    titleSub.textContent = c.sub || '';
    nav.classList.toggle('has-sub', !!c.sub);
    const n = unreadTotal(c.id);
    backBadge.textContent = n > 99 ? '99+' : n ? String(n) : '';
    backBadge.hidden = !n;
    const spec = c.wall ?? A.D.wall;
    applyWall(wall, spec);
    el.classList.toggle('loud', !!isLoud(spec));
    el.classList.toggle('walled', spec !== 'none' && spec != null);
  }
  function paintSpeaker(anim) {
    setAvatar(spkAv, person(c, spk));
    spkBtn.classList.toggle('left', spk === 'L');
    if (anim) spkAv.animate([{ transform: 'rotateY(90deg) scale(.8)' }, { transform: 'rotateY(0) scale(1)' }], { duration: 260, easing: 'cubic-bezier(.2,.9,.3,1.2)' });
  }
  function setSpeaker(s, anim = true) {
    if (s === spk) return;
    spk = s; c.spk = s; save();
    paintSpeaker(anim);
    sfx.tick(); hb.haptic(6);
  }

  // ---------- 消息 ----------
  function qBox(m) {
    if (!m.q) return null;
    const src = c.msgs.find((x) => x.id === m.q.id);
    const t = src ? snippet(c, src) : m.q.t;
    return h('div', { class: 'qbox' }, h('b', { text: pname(c, m.q.s) }), h('span', { text: t }));
  }
  function mediaSize(w, hh, maxW, maxH, minS, up) {
    let k = Math.min(maxW / w, maxH / hh);
    k = Math.min(k, up);
    let dw = w * k, dh = hh * k;
    if (Math.max(dw, dh) < minS) { const g = minS / Math.max(dw, dh); dw *= g; dh *= g; }
    return [Math.round(dw), Math.round(dh)];
  }
  function build(m) {
    if (m.k === 'time') return h('div', { class: 'center time', 'data-id': m.id }, h('span', { text: fmtTime(m.t) }));
    if (m.k === 'sys') return h('div', { class: 'center sys', 'data-id': m.id }, h('span', { text: m.text }));
    if (m.k === 'pat') return h('div', { class: 'center sys pat', 'data-id': m.id }, h('span', { text: patText(c, m) }));
    if (m.k === 'recall') {
      const canRe = m.s === 'R' && m.orig && m.orig.k === 'text';
      return h('div', { class: 'center sys', 'data-id': m.id }, h('span', {}, recallText(c, m), canRe && h('a', { class: 'reedit', text: ' 重新编辑' })));
    }
    const side = m.s === 'L' ? 'L' : 'R';
    const av = avatarEl(person(c, side), 's40 m-av');
    let body;
    if (m.k === 'text') {
      body = h('div', { class: 'bub text' }, qBox(m), h('span', { class: 'tx', text: m.text }));
    } else if (m.k === 'voice') {
      const w = Math.round(Math.min(230, 76 + m.sec * 3.2));
      body = h('div', { class: 'bub voice', style: { width: w + 'px' } }, h('span', { class: 'wv', html: WAVE }), h('span', { class: 'sec', text: `${m.sec}″` }));
    } else if (m.k === 'img') {
      const [w, hh] = mediaSize(m.w || 300, m.h || 300, 196, 236, 72, 1);
      const img = h('img', { alt: '', draggable: 'false' });
      body = h('div', { class: 'media img', style: { width: w + 'px', height: hh + 'px' } }, img);
      media.url(m.media).then((u) => { if (u) img.src = u; else body.classList.add('lost'); });
    } else if (m.k === 'sticker') {
      const [w, hh] = mediaSize(m.w || 120, m.h || 120, 128, 128, 64, 2);
      const img = h('img', { alt: '', draggable: 'false' });
      body = h('div', { class: 'media stk', style: { width: w + 'px', height: hh + 'px' } }, img);
      media.url(m.media).then((u) => { if (u) img.src = u; else body.classList.add('lost'); });
    }
    const line = h('div', { class: 'line' }, body,
      m.fail && h('i', { class: 'fail', text: '!' }),
      m.k === 'voice' && side === 'L' && !m.heard && h('i', { class: 'vdot' }));
    const col = h('div', { class: 'col' },
      m.k !== 'text' && qBox(m),
      line,
      m.k === 'voice' && m.showText && m.text ? h('div', { class: 'vtext', text: m.text }) : null);
    return h('div', { class: 'msg ' + side + (m.k === 'sticker' ? ' is-stk' : ''), 'data-id': m.id }, av, col);
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
    inner.classList.toggle('empty', !c.msgs.length);
  }
  function rebuild() { for (const n of nodes.values()) n.el.remove(); nodes.clear(); render(); }
  function markAnchor() {
    for (const n of nodes.values()) n.el.classList.toggle('anchor', n.m.id === mode.before);
  }

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
    render();
    touch();
  }
  function dropMedia(m) {
    if (!m) return;
    if (m.k === 'img') media.del(m.media);
    if (m.k === 'recall') dropMedia(m.orig);
  }
  async function remove(id) {
    const n = nodes.get(id);
    if (n) {
      const hgt = n.el.offsetHeight;
      await n.el.animate([{ opacity: 1, height: hgt + 'px', transform: 'scale(1)' }, { opacity: 0, height: '0px', marginTop: '0px', marginBottom: '0px', transform: 'scale(.92)' }],
        { duration: 200, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'forwards' }).finished.catch(() => {});
    }
    const m = c.msgs.find((x) => x.id === id);
    c.msgs = c.msgs.filter((x) => x.id !== id);
    dropMedia(m);
    if (mode.before === id) mode.before = null;
    if (mode.edit === id) setMode({ edit: null }, true);
    if (mode.quote && mode.quote.id === id) mode.quote = null;
    paintBanners();
    render();
    touch();
  }

  // ---------- 输入栏 ----------
  function autosize() {
    ta.style.height = 'auto';
    ta.style.height = Math.min(118, ta.scrollHeight) + 'px';
    const has = ta.value.trim().length > 0;
    composer.classList.toggle('typing', has);
  }
  ta.addEventListener('input', () => {
    autosize();
    if (!mode.edit) { c.draft = ta.value; save(); }
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
  spkBtn.addEventListener('pointerdown', (e) => e.preventDefault());
  spkBtn.addEventListener('click', () => setSpeaker(other(spk)));

  function send() {
    const text = ta.value.replace(/^\s*\n+|\n+\s*$/g, '');
    if (!text.trim()) return;
    if (mode.edit) {
      const m = c.msgs.find((x) => x.id === mode.edit);
      if (m) replace(m.id, { ...m, text });
      setMode({ edit: null }, true);
      ta.value = c.draft || '';
      autosize();
      sfx.pop();
      return;
    }
    const m = { id: uid(), k: 'text', s: spk, text };
    if (mode.quote) m.q = mode.quote;
    mode.quote = null;
    ta.value = '';
    c.draft = '';
    autosize();
    paintBanners();
    place(m);
  }

  function setMode(patch, quiet) {
    Object.assign(mode, patch);
    paintBanners();
    markAnchor();
    if (!quiet) sfx.tick();
  }
  function paintBanners() {
    const rows = [];
    const row = (icon, label, text, onX) => h('div', { class: 'banner' },
      h('span', { class: 'b-ic', html: icon }), h('b', { text: label }), h('span', { class: 'b-tx', text }),
      h('button', { class: 'b-x', html: I.close, 'aria-label': '取消', onpointerdown: (e) => e.preventDefault(), onclick: onX }));
    if (mode.edit) rows.push(row(I.edit, '编辑', '改完点发送', () => { setMode({ edit: null }); ta.value = c.draft || ''; autosize(); }));
    if (mode.quote) rows.push(row(I.quote, pname(c, mode.quote.s), mode.quote.t, () => setMode({ quote: null })));
    if (mode.before) rows.push(row(I.insert, '插入', '新消息会放到虚线那里', () => setMode({ before: null })));
    banners.replaceChildren(...rows);
  }

  // ---------- 加号面板 / 表情面板 ----------
  const tool = (icon, label, fn) => h('button', { class: 'tool', onclick: fn }, h('span', { class: 'tool-ic', html: icon }), h('span', { text: label }));
  plusGrid.append(
    tool(I.photo, '相册', () => pickFiles({ multiple: true }).then(sendImages)),
    tool(I.mic, '语音', () => F.voiceSheet({ title: spk === 'L' ? `「${pname(c, 'L')}」的语音` : '你的语音', onSave: (v) => place({ id: uid(), k: 'voice', s: spk, sec: v.sec, text: v.text || undefined }) })),
    tool(I.clock, '时间', () => F.timeSheet({ t: lastTime() + 5 * 60e3, onSave: (t) => place({ id: uid(), k: 'time', t }) })),
    tool(I.text, '小字', () => F.sysSheet({ onSave: (text) => place({ id: uid(), k: 'sys', text }) })),
    tool(I.hand, '拍一拍', () => { place({ id: uid(), k: 'pat', from: spk, to: other(spk) }, { sound: false }); sfx.pat(); hb.haptic([10, 30, 10]); }),
  );
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
        place({ id: uid(), k: 'img', s: spk, media: id, w, h: hh });
      } catch { toast('有一张图读不出来'); }
    }
    if (files.length) setPanel(null);
  }
  function paintStickers() {
    stkGrid.replaceChildren(
      h('button', { class: 'stk-cell add', html: I.add, 'aria-label': '加表情', onclick: () => F.addStickers().then((n) => n && paintStickers()) }),
      ...A.D.stickers.map((st) => {
        const cell = h('button', { class: 'stk-cell', 'data-sid': st.id }, F.stickerImg(st));
        return cell;
      }),
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
      place({ id: uid(), k: 'sticker', s: spk, media: st.id, w: st.w, h: st.h, ...(mode.quote ? { q: mode.quote } : {}) });
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
    if (which) { blurActive(); if (which === 'stk') paintStickers(); }
    if (!quiet) sfx.tick();
  }
  emoBtn.addEventListener('click', () => {
    if (panelOn === 'stk') { setPanel(null, true); ta.focus(); return; }
    setPanel('stk');
  });
  addBtn.addEventListener('click', () => setPanel('plus'));

  // ---------- 手势：点头像/气泡换人、双击头像拍一拍、长按出菜单 ----------
  let lp = null; // { t, id, x, y, el, fired }
  let lastAv = { side: null, at: 0, prev: null };
  const cancelLP = () => { if (lp) { clearTimeout(lp.t); lp = null; } };

  list.addEventListener('pointerdown', (e) => {
    cancelLP();
    const row = e.target.closest('[data-id]');
    const target = e.target.closest('.bub, .media, .center span, .vtext');
    lp = { id: row && row.dataset.id, x: e.clientX, y: e.clientY, target, fired: false, t: 0, at: performance.now(), raw: e.target };
    if (row && target) lp.t = setTimeout(() => { lp.fired = true; openMenu(row.dataset.id, target); }, LONG);
  });
  list.addEventListener('pointermove', (e) => {
    if (lp && Math.hypot(e.clientX - lp.x, e.clientY - lp.y) > 9) { clearTimeout(lp.t); lp.moved = true; }
  });
  list.addEventListener('pointercancel', () => { if (lp) { clearTimeout(lp.t); lp.moved = true; } });
  list.addEventListener('pointerup', () => {
    if (!lp) return;
    clearTimeout(lp.t);
    const tap = !lp.fired && !lp.moved && performance.now() - lp.at < LONG;
    const info = lp;
    lp.done = true;
    if (tap) onTap(info);
  });
  // 输入框开着时点头像/气泡不收键盘（iOS 在 touchend 之后才换焦点）
  list.addEventListener('touchend', (e) => {
    if (lp && lp.done && !lp.moved && !lp.fired && document.activeElement === ta && e.target.closest('.m-av, .bub.text')) e.preventDefault();
  }, { passive: false });

  function onTap(info) {
    const raw = info.raw;
    const row = raw.closest('[data-id]');
    const m = row && c.msgs.find((x) => x.id === row.dataset.id);
    if (raw.closest('.reedit') && m) { reEdit(m); return; }
    const av = raw.closest('.m-av');
    if (av && m) {
      const side = m.s;
      const now = performance.now();
      if (lastAv.side === side && now - lastAv.at < 320) {
        // 双击：原来说话的人拍一拍这个头像，说话的人换回去
        const from = lastAv.prev;
        lastAv = { side: null, at: 0, prev: null };
        setSpeaker(from, false);
        paintSpeaker(false);
        av.animate([{ transform: 'rotate(0)' }, { transform: 'rotate(-14deg) scale(1.06)' }, { transform: 'rotate(12deg)' }, { transform: 'rotate(-6deg)' }, { transform: 'rotate(0)' }], { duration: 420, easing: 'ease-out' });
        place({ id: uid(), k: 'pat', from, to: side }, { sound: false });
        sfx.pat(); hb.haptic([10, 30, 10]);
        return;
      }
      lastAv = { side, at: now, prev: spk };
      setSpeaker(side);
      return;
    }
    if (m && raw.closest('.bub.text')) { setSpeaker(m.s); return; }
    if (m && raw.closest('.bub.voice')) { playVoice(m, row); return; }
    if (m && raw.closest('.media')) {
      const img = row.querySelector('.media img');
      if (img && img.src) viewer(img.src, img);
      return;
    }
    if (!raw.closest('.center')) {
      if (panelOn) setPanel(null, true);
      if (document.activeElement === ta) ta.blur();
    }
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
    // 撤回提示留着（跟手机上一样），原来的字放回输入框
    setSpeaker('R', true);
    ta.value = m.orig.text;
    autosize();
    ta.focus();
  }

  // ---------- 长按菜单 ----------
  async function openMenu(id, target) {
    const m = c.msgs.find((x) => x.id === id);
    if (!m) return;
    if (document.activeElement === ta) ta.blur();
    hb.haptic(12);
    sfx.tick();
    const hl = target.closest('.bub, .media, .center span, .vtext');
    hl.classList.add('pressed');
    const it = (key, label, icon, danger) => ({ key, label, icon, danger });
    const L = [];
    const bubble = ['text', 'img', 'voice', 'sticker'].includes(m.k);
    if (m.k === 'text') L.push(it('copy', '复制', I.copy));
    if (m.k === 'voice') L.push(it('vt', m.showText && m.text ? '收起文字' : '转文字', I.vtext));
    if (['text', 'voice', 'time', 'sys'].includes(m.k)) L.push(it('edit', '编辑', I.edit));
    if (bubble) L.push(it('quote', '引用', I.quote), it('flip', '换边', I.swap), it('recall', '撤回', I.undo));
    if (m.k === 'recall') L.push(it('restore', '恢复', I.restore));
    if (m.k === 'pat') L.push(it('flip', '反过来', I.swap));
    L.push(it('insert', '插入', I.insert));
    if (['text', 'img', 'voice'].includes(m.k)) L.push(it('fail', m.fail ? '取消失败' : '发送失败', I.alert));
    L.push(it('del', '删除', I.trash, true));
    const navB = nav.getBoundingClientRect().bottom;
    const key = await popMenu(hl.getBoundingClientRect(), L, { minTop: navB + 6 });
    hl.classList.remove('pressed');
    if (!key) return;
    act(key, m);
  }

  async function act(key, m) {
    switch (key) {
      case 'copy': {
        try { await navigator.clipboard.writeText(m.text); }
        catch {
          const t = h('textarea', { style: { position: 'fixed', opacity: 0 } }); t.value = m.text; document.body.append(t); t.select();
          try { document.execCommand('copy'); } catch {} t.remove();
        }
        toast('已复制');
        break;
      }
      case 'edit':
        if (m.k === 'text') {
          setMode({ edit: m.id, quote: null }, true);
          ta.value = m.text; autosize();
          setPanel(null, true);
          ta.focus();
          ta.setSelectionRange(ta.value.length, ta.value.length);
        } else if (m.k === 'voice') {
          F.voiceSheet({ title: '改语音', sec: m.sec, text: m.text || '', okLabel: '保存', onSave: (v) => replace(m.id, { ...m, sec: v.sec, text: v.text || undefined, showText: v.text ? m.showText : false }) });
        } else if (m.k === 'time') {
          F.timeSheet({ title: '改时间', t: m.t, okLabel: '保存', onSave: (t) => replace(m.id, { ...m, t }) });
        } else if (m.k === 'sys') {
          F.sysSheet({ title: '改小字', text: m.text, okLabel: '保存', onSave: (text) => replace(m.id, { ...m, text }) });
        }
        break;
      case 'vt':
        if (!m.text) F.voiceSheet({ title: '这条语音说了什么', sec: m.sec, okLabel: '转文字', onSave: (v) => replace(m.id, { ...m, sec: v.sec, text: v.text || undefined, showText: !!v.text }) });
        else { replace(m.id, { ...m, showText: !m.showText }); }
        break;
      case 'quote':
        setMode({ quote: { id: m.id, s: m.s, t: snippet(c, m) }, edit: null });
        if (m.k !== 'sticker') ta.focus();
        break;
      case 'flip':
        if (m.k === 'pat') replace(m.id, { ...m, from: m.to, to: m.from });
        else replace(m.id, { ...m, s: other(m.s), heard: true });
        sfx.tick();
        break;
      case 'recall':
        replace(m.id, { id: m.id, k: 'recall', s: m.s, orig: m });
        sfx.del();
        break;
      case 'restore':
        replace(m.id, { ...m.orig, id: m.id });
        sfx.pop();
        break;
      case 'insert':
        setMode({ before: m.id });
        break;
      case 'fail':
        replace(m.id, { ...m, fail: !m.fail || undefined });
        break;
      case 'del':
        sfx.del();
        remove(m.id);
        break;
    }
  }

  // ---------- 聊天信息 ----------
  function openInfo() {
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
    if (hb.load('tutored', false)) return;
    const r = spkBtn.getBoundingClientRect(), pr = el.getBoundingClientRect();
    const tip = h('div', { class: 'coach' },
      h('div', { class: 'coach-hole', style: { left: r.left - pr.left - 6 + 'px', top: r.top - pr.top - 6 + 'px', width: r.width + 12 + 'px', height: r.height + 12 + 'px' } }),
      h('div', { class: 'coach-card', style: { bottom: pr.bottom - r.top + 18 + 'px' } },
        h('b', { text: '两边都是你来发' }),
        h('p', { text: '点这个小头像，或者点聊天里谁的头像、谁的气泡，就换成谁说话。双击头像是拍一拍。' }),
        h('p', { text: '长按消息可以编辑、引用、换边、撤回、插入、删除。' }),
        h('button', { class: 'btn-primary', text: '知道了', onclick: () => { hb.save('tutored', true); tip.classList.remove('on'); setTimeout(() => tip.remove(), 260); } })));
    el.append(tip);
    tip.getBoundingClientRect();
    tip.classList.add('on');
  }

  // ---------- 生命周期 ----------
  c.unread = 0;
  ta.value = c.draft || '';
  paintHead();
  paintSpeaker(false);
  paintBanners();
  render();
  requestAnimationFrame(() => { autosize(); scrollBottom(false); });
  save();

  return {
    el,
    chat: c,
    onShown: () => { scrollBottom(false); coach(); },
    onShow: () => { paintHead(); paintSpeaker(false); rebuild(); },
    onHide: () => { cancelLP(); blurActive(); if (playing) { clearTimeout(playing.t); playing.bub.classList.remove('playing'); playing = null; } },
    onEdgeStart: () => { cancelLP(); },
    onDestroy: () => { hooks.closed(); },
    closeTransient: () => { cancelLP(); if (panelOn) setPanel(null, true); },
    // 测试用
    api: { send: (text, s) => { setSpeaker(s || spk, false); ta.value = text; send(); }, place, act, get mode() { return mode; }, setPanel, setSpeaker, render, openMenu: (id) => { const n = nodes.get(id); if (n) openMenu(id, n.el.querySelector('.bub, .media, .center span')); } },
  };
}
