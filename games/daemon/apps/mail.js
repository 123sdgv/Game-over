// 邮件：收件箱、发件箱（它替你写的信在这里倒计时）、已发送。回信只能从几个写好的里面挑。
import { G, P, on, emit, pick, fill, dn, un, saveSoon, stat } from '../state.js';
import * as fs from '../fs.js';
import { os, h, register, open, find, msg, balloon, scrollable, gesture, focus, menu } from '../os.js';
import { icon, nodeIcon } from '../art.js';
import { sfx } from '../sfx.js';
import { PEOPLE, MAILS, JUNK, DAEMON_MAIL, BOSS_REACT } from '../content.js';
import { pickFile } from './explorer.js';

const person = (k) => PEOPLE[k] || { name: k, addr: '' };
export const mails = () => G.mail.list;
const byId = (id) => G.mail.list.find((m) => m.id === id);

function ago(m) {
  if (m.day < G.day) return `第 ${m.day} 天`;
  const d = new Date(m.at || Date.now());
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** 收到一封信 */
export function deliver(m, { quiet = false } = {}) {
  m.id = `m${G.mail.seq++}`;
  m.box = m.box || 'in';
  m.day = G.day; m.at = Date.now();
  G.mail.list.unshift(m);
  if (G.mail.list.length > 60) {
    // 太多了：删掉最老的、已读的、不用回的
    for (let i = G.mail.list.length - 1; i >= 0 && G.mail.list.length > 60; i--) { const x = G.mail.list[i]; if (x.read && (!x.need || x.replied) && x.box !== 'out') G.mail.list.splice(i, 1); }
  }
  emit('mail');
  saveSoon();
  if (!quiet && m.box === 'in') balloon('新邮件', `${person(m.from).name}：${m.sub}`, () => open('mail', { read: m.id }));
  return m;
}
/** 今天来的信 */
export function newWorkMail(exclude = []) {
  const pool = MAILS.filter((t, i) => !exclude.includes(i));
  const t = pick(pool);
  return deliver({ from: t.from, sub: t.sub, body: t.body, need: true, replies: t.replies, tpl: MAILS.indexOf(t) }, { quiet: true });
}
export function junkMail() {
  const t = pick(JUNK);
  return deliver({ from: t.from, sub: t.sub, body: t.body }, { quiet: true });
}

/** 它替你写好的信：45 秒后自动发 */
export function daemonDraft() {
  const target = G.mail.list.find((m) => m.box === 'in' && m.need && !m.replied && m.from !== 'spam') || { from: 'boss', sub: '周报' };
  const to = target.from;
  const m = {
    box: 'out', by: 'daemon', from: 'me', to, sub: `Re: ${target.sub}`, body: fill(pick(DAEMON_MAIL), { to: person(to).name }),
    sendAt: G.t + 45, replyTo: target.id || null,
  };
  return deliver(m, { quiet: true });
}

/** 真的寄出去（拨号动画由界面那边放） */
function doSend(m) {
  m.box = 'sent'; m.at = Date.now(); m.day = G.day;
  delete m.sendAt;
  if (m.replyTo) { const o = byId(m.replyTo); if (o) { o.replied = true; } }
  emit('mail');
  emit('mail:sent', m);
  saveSoon();
}

/** 它直接替你发（Start-Job 用）：不走发件箱，马上寄出去 */
export function sendDirect({ to, sub, body, att = null, replyTo = null, by = 'daemon' }) {
  const n = att && fs.node(att);
  const m = deliver({ box: 'out', by, from: 'me', to, sub, body, att: n ? n.id : null, attName: n ? n.n : null, attSrc: n ? n.src || n.id : null, replyTo }, { quiet: true });
  doSend(m);
  if (P.modem) sfx.modem();
  return m;
}

/** 每秒看一眼发件箱 */
export function mailTick() {
  for (const m of G.mail.list) {
    if (m.box === 'out' && m.sendAt != null && G.t >= m.sendAt) {
      if (fs.freeC() <= 0) { m.sendAt = G.t + 20; continue; }
      doSend(m);
      if (P.modem) sfx.modem();
      if (m.by === 'daemon') {
        stat('oops');
        emit('daemon:mailSent', m);
        G.mail.react = { at: G.t + 16, to: m.to };
      }
    }
  }
  if (G.mail.react && G.t >= G.mail.react.at) {
    const r = G.mail.react;
    G.mail.react = null;
    const rm = deliver({ from: r.to, sub: r.to === 'boss' ? '？？？' : '你还好吗', body: r.to === 'boss' ? pick(BOSS_REACT) : '你刚才发的邮件……是不是发错人了？', need: true, explain: true, replies: r.to === 'boss' ? ['王经理不好意思，刚才电脑中了毒，那封不是我写的。', '对不起王经理，是我手滑了。', '……是电脑自己发的，真的。'] : ['发错了发错了，别看！', '电脑中毒了，不是我写的。', '没事，当我没说。'] });
    emit('mail:explain', rm);
  }
}
export const outboxPending = () => G.mail.list.filter((m) => m.box === 'out' && m.sendAt != null);

/* ─────────── 窗口 ─────────── */
function create(w, args) {
  const st = { box: 'in', view: 'list', cur: null, sel: null, compose: null };
  const side = h('div.mail-side.field');
  const pane = h('div.mail-pane');
  const tools = h('div.toolbar');
  w.body.append(tools, h('div.mail-main', null, side, pane));
  const BOXES = [['in', '收件箱', 'mail'], ['out', '发件箱', 'f_exe'], ['sent', '已发送', 'folder']];
  for (const [k, name, ic] of BOXES) {
    const b = h('button', { 'data-box': k, html: `${icon(ic)}<span></span><em hidden></em>` });
    b.querySelector('span').textContent = name;
    b.addEventListener('click', () => { sfx.click(); st.box = k; st.view = 'list'; st.sel = null; render(); });
    side.append(b);
  }
  const T = (label, fn, dis = false) => { const b = h('button.btn', { text: label, disabled: dis || null }); b.addEventListener('click', () => { sfx.click(); fn(); }); tools.append(b); return b; };

  function renderSide() {
    for (const b of side.children) {
      const k = b.dataset.box;
      b.classList.toggle('on', k === st.box);
      const em = b.querySelector('em');
      const n = k === 'in' ? G.mail.list.filter((m) => m.box === 'in' && !m.read).length : k === 'out' ? G.mail.list.filter((m) => m.box === 'out').length : 0;
      em.hidden = !n; em.textContent = n;
    }
  }
  function renderTools() {
    tools.innerHTML = '';
    const m = st.cur && byId(st.cur);
    if (st.view === 'compose') {
      T('◀ 返回', () => { st.view = st.compose.back || 'list'; st.compose = null; render(); });
      return;
    }
    T('写邮件', () => startCompose({}));
    if (st.view === 'read' && m) {
      T('◀ 返回', () => { st.view = 'list'; render(); });
      if (m.box === 'in' && m.from !== 'spam' && m.from !== 'news') T(m.replied ? '再回一封' : '回复', () => startCompose({ reply: m.id }));
      if (m.box === 'out') { T('取消发送', () => cancelOut(m)); T('立即发送', () => sendNow(m)); }
      T('删除', () => del(m));
    } else {
      const s = st.sel && byId(st.sel);
      T('回复', () => s && startCompose({ reply: s.id }), !(s && s.box === 'in' && s.from !== 'spam' && s.from !== 'news'));
      T('删除', () => s && del(s), !s);
    }
  }

  function render() {
    renderSide(); renderTools();
    pane.innerHTML = '';
    if (st.view === 'compose') return renderCompose();
    if (st.view === 'read') return renderRead();
    const list = h('div.mlist.field.scroll');
    const items = G.mail.list.filter((m) => m.box === st.box);
    if (!items.length) list.append(h('div', { style: { padding: '2em', textAlign: 'center', color: 'var(--ink2)' }, text: st.box === 'out' ? '没有要发的邮件' : '空的' }));
    for (const m of items) {
      const who = m.box === 'in' ? person(m.from).name : `给 ${person(m.to).name}`;
      const row = h('div.mrowi', { 'data-id': m.id, html: `${icon(m.box === 'in' ? 'mail' : m.by === 'daemon' ? 'term' : 'mail')}<span class="who"></span><span class="sub"></span><span class="when"></span>` });
      row.querySelector('.who').textContent = who;
      const sub = row.querySelector('.sub');
      sub.textContent = m.sub;
      if (m.box === 'in' && m.need && !m.replied) sub.append(h('span.tag', { text: '待回' }));
      if (m.box === 'out' && m.sendAt != null) sub.append(h('span.tag.red', { text: `${Math.max(0, Math.ceil(m.sendAt - G.t))} 秒后发送` }));
      if (m.att) sub.prepend('📎 ');
      row.querySelector('.when').textContent = ago(m);
      if (m.box === 'in' && !m.read) row.classList.add('unread');
      if (st.sel === m.id) row.classList.add('sel');
      let last = 0;
      gesture(row, {
        scroll: () => list,
        tap: () => {
          const t = performance.now();
          if (st.sel === m.id && t - last < 1100) { openRead(m.id); return; }
          st.sel = m.id; last = t; sfx.click();
          for (const r of list.children) r.classList && r.classList.toggle('sel', r.dataset.id === m.id);
          renderTools();
          // 手机上点一下就打开更顺手
          openRead(m.id);
        },
        long: (g) => menu(g.x, g.y, [{ label: '打开', bold: true, act: () => openRead(m.id) }, { label: '删除', act: () => del(m) }]),
      });
      list.append(row);
    }
    pane.append(list);
  }
  function openRead(id) { st.cur = id; st.view = 'read'; const m = byId(id); if (m && !m.read) { m.read = true; emit('mail'); saveSoon(); } render(); }

  function renderRead() {
    const m = byId(st.cur);
    if (!m) { st.view = 'list'; return render(); }
    const head = h('div.mhead', null, h('h3', { text: m.sub }),
      h('div', { text: m.box === 'in' ? `发件人：${person(m.from).name} <${person(m.from).addr}>` : `收件人：${person(m.to).name} <${person(m.to).addr}>` }),
      h('div', { text: `时间：${ago(m)}${m.by === 'daemon' ? `　（${dn()} 写的）` : ''}` }));
    const body = h('div.mbody.scroll');
    body.textContent = m.body;
    if (m.att) {
      const n = fs.node(m.att);
      const chip = h('div.att', { html: `${icon(n ? nodeIcon(n) : 'f_txt')}<span></span>` });
      chip.querySelector('span').textContent = m.attName || (n ? n.n : '附件');
      body.append(h('br'), chip);
    }
    if (m.box === 'out' && m.sendAt != null) body.prepend(h('div', { style: { marginBottom: '.6em' } }, '⚠ 这封信会在 ', h('span.outbox-count', { 'data-cd': m.id, text: `${Math.max(0, Math.ceil(m.sendAt - G.t))}` }), ' 秒后自动发出去。'));
    scrollable(body);
    pane.append(h('div.mread.field', null, head, body));
  }

  function startCompose(o) {
    const m = o.reply ? byId(o.reply) : null;
    st.compose = { reply: o.reply || null, to: m ? m.from : null, sub: m ? `Re: ${m.sub}` : '', att: null, pickI: -1, opts: m ? m.replies || ['好的。', '收到。', '谢谢。'] : null, back: st.view };
    st.view = 'compose';
    render();
  }
  function renderCompose() {
    const c = st.compose;
    const box = h('div.compose');
    const toF = h('div.field');
    if (c.reply) toF.textContent = `${person(c.to).name} <${person(c.to).addr}>`;
    else for (const k of ['boss', 'li', 'zhou', 'mom']) {
      const b = h('button.chipbtn', { text: person(k).name });
      if (c.to === k) { b.style.background = 'var(--sel)'; b.style.color = 'var(--sel-ink)'; }
      b.addEventListener('click', () => { c.to = k; sfx.click(); render(); });
      toF.append(b);
    }
    const attF = h('div.field');
    if (c.att && fs.node(c.att)) {
      const n = fs.node(c.att);
      const chip = h('span.chipbtn', { html: `${icon(nodeIcon(n))}<span></span>` });
      chip.querySelector('span').textContent = n.n;
      attF.append(chip, h('button.btn.small', { text: '去掉', onclick: () => { c.att = null; render(); } }));
    } else attF.append(h('button.btn.small', { text: '添加附件…', onclick: async () => { const id = await pickFile(); if (id) { c.att = id; if (!c.sub) c.sub = fs.node(id).n; render(); } } }));
    const subF = h('div.field', { text: c.sub || (c.att ? fs.node(c.att)?.n : '（选好附件会自动填）') });
    box.append(h('div.row', null, h('b', { text: '收件人' }), toF), h('div.row', null, h('b', { text: '主题' }), subF), h('div.row', null, h('b', { text: '附件' }), attF));
    const opts = h('div.opts.field.scroll');
    const choices = c.opts || (c.att ? [`附件是「${fs.node(c.att)?.n}」，请查收。`, '你要的文件，看一下。', `${person(c.to || 'boss').name}，文件发你了。`] : ['在吗？', '有空的时候回我一下。', '没事，就是想发封邮件。']);
    opts.append(h('div', { style: { color: 'var(--ink2)', fontSize: '.88em' }, text: '选一段话：' }));
    choices.forEach((t, i) => {
      const b = h('button.opt', { text: t });
      if (c.pickI === i) b.classList.add('on');
      b.addEventListener('click', () => { c.pickI = i; sfx.click(); for (const x of opts.querySelectorAll('.opt')) x.classList.toggle('on', x === b); send.disabled = !c.to; });
      opts.append(b);
    });
    scrollable(opts);
    const send = h('button.btn.def', { text: '发送', disabled: !(c.to && c.pickI >= 0) || null });
    send.addEventListener('click', () => doCompose(choices[c.pickI]));
    box.append(opts, h('div', { style: { display: 'flex', justifyContent: 'flex-end', gap: '6px' } }, send));
    pane.append(box);
  }

  async function doCompose(text) {
    const c = st.compose;
    if (fs.freeC() <= 0) { msg({ title: '发送失败', text: 'C 盘满了，邮件存不下。\n先清理一下硬盘。', ic: 'err' }); return; }
    const att = c.att && fs.node(c.att);
    const m = { box: 'out', by: 'me', from: 'me', to: c.to, sub: c.sub || (att ? att.n : '（无主题）'), body: text + (c.reply ? `\n\n——— 原邮件 ———\n${byId(c.reply)?.body || ''}` : ''), att: att ? att.id : null, attName: att ? att.n : null, attSrc: att ? att.src || att.id : null, replyTo: c.reply };
    deliver(m, { quiet: true });
    st.compose = null; st.view = 'list'; st.box = 'sent';
    await dial();
    doSend(m);
    render();
  }
  function dial() {
    return new Promise((res) => {
      const dlg = h('div.dialing', null, h('b', { text: '正在拨号上网…' }), h('div.bar', null, h('i', { style: { width: '0%' } })));
      pane.innerHTML = ''; pane.append(dlg);
      if (P.modem) sfx.modem();
      const bar = dlg.querySelector('i');
      let k = 0;
      const t = setInterval(() => { k += 9; bar.style.width = `${Math.min(100, k)}%`; if (k >= 100) { clearInterval(t); res(); } }, P.modem ? 140 : 40);
    });
  }
  function cancelOut(m) {
    G.mail.list = G.mail.list.filter((x) => x !== m);
    sfx.crumple();
    emit('mail'); emit('mail:canceled', m);
    saveSoon();
    st.view = 'list'; render();
  }
  async function sendNow(m) {
    await dial();
    doSend(m);
    if (m.by === 'daemon') { stat('oops'); emit('daemon:mailSent', m); G.mail.react = { at: G.t + 12, to: m.to }; }
    st.view = 'list'; render();
  }
  async function del(m) {
    if (m.box === 'out' && m.sendAt != null) return cancelOut(m);
    if (m.box === 'in' && m.need && !m.replied) {
      const i = await msg({ title: '删除邮件', text: '这封还没回呢。确定删掉吗？', ic: 'q', buttons: ['删除', '取消'] });
      if (i !== 0) return;
    }
    G.mail.list = G.mail.list.filter((x) => x !== m);
    sfx.crumple();
    if (st.sel === m.id) st.sel = null;
    st.view = 'list';
    emit('mail'); saveSoon();
    render();
  }

  if (args.read) { st.box = byId(args.read)?.box || 'in'; openRead(args.read); }
  else if (args.box) { st.box = args.box; render(); }
  else render();
  const off = on('mail', () => { if (st.view !== 'compose') render(); else renderSide(); });
  const cd = setInterval(() => {
    for (const e of w.body.querySelectorAll('[data-cd]')) { const m = byId(e.dataset.cd); if (m && m.sendAt != null) e.textContent = Math.max(0, Math.ceil(m.sendAt - G.t)); }
    if (st.view === 'list' && st.box === 'out') for (const t of w.body.querySelectorAll('.tag.red')) { const row = t.closest('[data-id]'); const m = row && byId(row.dataset.id); if (m && m.sendAt != null) t.textContent = `${Math.max(0, Math.ceil(m.sendAt - G.t))} 秒后发送`; }
  }, 500);
  return {
    title: '邮件',
    close: () => { off(); clearInterval(cd); },
    reopen: (a) => { if (a.read) openRead(a.read); else if (a.box) { st.box = a.box; st.view = 'list'; render(); } },
  };
}

register('mail', { title: '邮件', icon: 'mail', single: true, create, size: { w: 0.8, h: 0.92, minW: 320, minH: 200, maxW: 700 } });
