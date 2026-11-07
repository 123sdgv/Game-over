// 手机里的各个 App。每个 App 是 open(ctx, opts)：ctx.stack 是这个 App 的页面栈
import { h, icon, ic, page, when, stamp, dayOf, nl, paras, toast, dialog } from './ui.js';
import { S, save, emit, on, clock, weekday } from './state.js';
import { sfx } from './sfx.js';
import { addClue, messagesOf, markRead, unreadOf, lastMsg, checkPass, unlock, unlocked } from './logic.js';
import { CHATS } from './chats.js';
import * as C from './content.js';
import { TALK, TALK_MENU, FINDER } from './story.js';

const today = () => clock().date;
const seen = (k) => { if (!S.seen[k]) { S.seen[k] = 1; save(); emit('seen', k); } };

// 进到视野里就记线索（看到了才算）
let io = null;
export function watchClues(root) {
  if (!io) io = new IntersectionObserver((ents) => {
    for (const e of ents) if (e.isIntersecting) { addClue(e.target.dataset.clue); io.unobserve(e.target); }
  }, { threshold: 0.55 });
  root.querySelectorAll('[data-clue]').forEach((el) => io.observe(el));
}
const clueAttr = (id) => (id ? { 'data-clue': id } : {});

function rootPage(ctx, title, opts = {}) {
  const p = page({ title, back: '主屏幕', big: opts.big !== false, cls: opts.cls || '', right: opts.right, onBack: () => ctx.close() });
  return p;
}
function subPage(ctx, title, back, opts = {}) {
  const p = page({ title, back, cls: opts.cls || '', right: opts.right, onBack: () => ctx.stack.pop() });
  return p;
}
const row = (main, sub, right, attrs = {}) => h('button', { class: 'row', ...attrs },
  h('div', { class: 'row-m' }, h('b', {}, main), sub ? h('small', {}, sub) : null),
  right != null ? h('span', { class: 'row-r' }, right) : null,
  attrs.onclick ? ic('chev', 'chev') : null);
const group = (title, ...kids) => h('div', { class: 'grp' }, title ? h('div', { class: 'grp-t', text: title }) : null, h('div', { class: 'grp-b' }, kids));

// ═════════════ 照片：缩略图和大图 ═════════════
export const photoById = (id) => C.PHOTOS.find((p) => p.id === id);
export function photoTile(p, onclick, extra = null) {
  return h('button', { class: 'ph tone-' + p.tone, onclick },
    h('span', { class: 'ph-t', text: p.title }), extra);
}
export function photoPage(ctx, id, back = '返回') {
  const p = photoById(id);
  const pg = subPage(ctx, '', back, { cls: 'viewer' });
  let infoOn = false;
  const info = h('div', { class: 'pv-info', hidden: true },
    h('div', { class: 'pv-i-row' }, ic('info'), h('span', { text: p.info })),
    p.place ? h('div', { class: 'pv-i-row' }, ic('map'), h('span', { text: p.place })) : null);
  pg.head.querySelector('.rt').append(h('button', { class: 'ibtn', 'aria-label': '信息', html: icon('info'), onclick: () => { infoOn = !infoOn; info.hidden = !infoOn; sfx.tap(); } }));
  pg.setTitle(stamp(p.t));
  pg.scroll.append(
    h('div', { class: 'pv-frame tone-' + p.tone }, h('span', { class: 'pv-ttl', text: p.title })),
    info,
    h('div', { class: 'pv-desc' }, h('small', { text: '照片里' }), paras(p.desc)));
  ctx.stack.push({ el: pg.el });
  seen('ph_' + id);
  if (p.clue) setTimeout(() => addClue(p.clue), 500);
}

// ═════════════ 信息 ═════════════
function preview(m) {
  if (!m) return '';
  if (m.voice) return '[语音]';
  if (m.photo) return '[图片]';
  if (m.transfer) return '[转账]';
  if (m.call) return `[${m.call}]`;
  if (m.sys) return m.sys;
  return m.text;
}
let openThread = null;   // 正在看的那段聊天（冒新消息时往里加）
export const currentThread = () => openThread;

export function msgsApp(ctx, opts = {}) {
  const pg = rootPage(ctx, '信息');
  const list = h('div', { class: 'chats' });
  const paint = () => {
    list.innerHTML = '';
    const sorted = CHATS.slice().sort((a, b) => (b.pin ? 1 : 0) - (a.pin ? 1 : 0) || lastMsg(b.id).t.localeCompare(lastMsg(a.id).t));
    for (const c of sorted) {
      const m = lastMsg(c.id), n = unreadOf(c.id);
      list.append(h('button', { class: 'chat-row', onclick: () => thread(ctx, c.id) },
        h('span', { class: 'av', text: c.av }),
        h('div', { class: 'cr-m' },
          h('div', { class: 'cr-top' }, h('b', { text: c.name + (c.mark ? ' ' + c.mark : '') }), h('time', { text: when(m.t, today()) })),
          h('div', { class: 'cr-bot' }, h('p', { text: (m.me && !m.sys ? '' : '') + preview(m) }), n ? h('em', { class: 'badge', text: n }) : null))));
    }
  };
  paint();
  pg.scroll.append(h('div', { class: 'search fake' }, ic('web'), h('span', { text: '搜索' })), list);
  ctx.stack.root({ el: pg.el, onShow: paint });
  ctx.repaint = paint;
  if (opts.chat) setTimeout(() => thread(ctx, opts.chat), 60);
}

function bubble(ctx, m) {
  const side = m.me ? 'me' : 'them';
  if (m.sys) return h('div', { class: 'sysline', ...clueAttr(m.clue) }, h('span', { text: m.sys }));
  if (m.call) return h('div', { class: 'sysline call', ...clueAttr(m.clue) }, h('span', {}, ic('phone'), ` ${m.call} · ${m.status}`));
  let body;
  if (m.voice) {
    const tr = h('div', { class: 'vtext', hidden: true, text: m.text });
    const bars = h('span', { class: 'wave' }, [...Array(Math.min(22, 6 + m.voice))].map((_, i) => h('i', { style: { height: (5 + ((i * 37 + m.voice * 13) % 15)) + 'px' } })));
    body = h('button', { class: 'b voice', onclick: () => { tr.hidden = !tr.hidden; sfx.tap(); b.classList.add('playing'); setTimeout(() => b.classList.remove('playing'), Math.min(4000, m.voice * 250)); } },
      h('span', { class: 'vplay', html: icon('play') }), bars, h('span', { class: 'vdur', text: `${m.voice}″` }));
    const b = body;
    return h('div', { class: 'msg ' + side, ...clueAttr(m.clue) }, h('div', { class: 'col' }, body, tr, h('small', { class: 'vhint', text: '点一下转文字' })));
  }
  if (m.photo) {
    const p = photoById(m.photo);
    body = h('button', { class: 'b photo ph tone-' + p.tone, onclick: () => photoPage(ctx, m.photo) }, h('span', { class: 'ph-t', text: p.title }));
  } else if (m.transfer) {
    body = h('div', { class: 'b xfer' },
      h('div', { class: 'xf-top' }, h('span', { class: 'xf-ic', text: '¥' }), h('div', {}, h('b', { text: m.transfer.toLocaleString('en-US') + '.00' }), h('small', { text: m.note }))),
      h('div', { class: 'xf-bot', text: '转账 · ' + m.status }));
  } else {
    body = h('div', { class: 'b', text: m.text });
  }
  return h('div', { class: 'msg ' + side + (m.live ? ' live' : ''), ...clueAttr(m.clue) }, body);
}

function thread(ctx, chatId) {
  const c = CHATS.find((x) => x.id === chatId);
  const pg = subPage(ctx, c.name + (c.mark ? ' ' + c.mark : ''), '信息', { cls: 'thread' });
  if (c.sub) pg.head.querySelector('.ttl').append(h('small', { text: c.sub }));
  const box = h('div', { class: 'msgs' });
  let prevT = null;
  const add = (m) => {
    if (!prevT || gapBig(prevT, m.t)) box.append(h('div', { class: 'tsep', text: stamp(m.t) }));
    prevT = m.t;
    const el = bubble(ctx, m);
    box.append(el);
    return el;
  };
  messagesOf(chatId).forEach(add);
  const input = h('button', { class: 'composer', onclick: () => { sfx.nope(); toast('这不是你的手机。你不打算替她说话。'); } },
    h('span', { text: '信息' }), h('i', { html: icon('voice') }));
  pg.el.append(input);
  pg.scroll.append(box);
  const api = {
    id: chatId,
    async append(m) {
      if (m.me) {
        const typing = h('div', { class: 'msg me typing' }, h('div', { class: 'b' }, h('i'), h('i'), h('i')));
        box.append(typing); scrollEnd(true);
        await new Promise((r) => setTimeout(r, 1800));
        typing.remove();
        sfx.sent();
      }
      const el = add(m);
      el.classList.add('pop');
      watchClues(el.parentNode);
      scrollEnd(true);
      markRead(chatId);
    },
  };
  const scrollEnd = (smooth) => requestAnimationFrame(() => pg.scroll.scrollTo({ top: pg.scroll.scrollHeight, behavior: smooth ? 'smooth' : 'auto' }));
  ctx.stack.push({ el: pg.el, onShow: () => { openThread = api; }, onDestroy: () => { if (openThread === api) openThread = null; } });
  openThread = api;
  scrollEnd(false);
  setTimeout(() => watchClues(box), 400);
  markRead(chatId);
  if (ctx.repaint) setTimeout(ctx.repaint, 400);
}
function gapBig(a, b) {
  if (dayOf(a) !== dayOf(b)) return true;
  const m = (t) => { const [hh, mm] = t.split(' ')[1].split(':').map(Number); return hh * 60 + mm; };
  return m(b) - m(a) > 60;
}

// ═════════════ 相册 ═════════════
export function photosApp(ctx, opts = {}) {
  const pg = rootPage(ctx, '图库', { big: false, cls: 'photos' });
  const seg = h('div', { class: 'seg' });
  const body = h('div', { class: 'ph-body' });
  const tabs = [['lib', '图库'], ['albums', '相簿']];
  let tab = 'lib';
  const paint = () => {
    seg.innerHTML = '';
    tabs.forEach(([k, l]) => seg.append(h('button', { class: k === tab ? 'on' : '', text: l, onclick: () => { tab = k; sfx.tap(); paint(); } })));
    body.innerHTML = '';
    pg.setTitle(tab === 'lib' ? '图库' : '相簿');
    if (tab === 'lib') {
      const all = C.PHOTOS.filter((p) => p.albums.includes('all')).sort((a, b) => a.t.localeCompare(b.t));
      body.append(h('div', { class: 'ph-grid' }, all.map((p) => photoTile(p, () => photoPage(ctx, p.id, '图库')))), h('p', { class: 'ph-foot', text: `${all.length} 张照片` }));
      requestAnimationFrame(() => { pg.scroll.scrollTop = pg.scroll.scrollHeight; });
    } else {
      body.append(h('div', { class: 'albums' }, C.ALBUMS.filter((a) => a.id !== 'all').map((a) => {
        const ps = C.PHOTOS.filter((p) => p.albums.includes(a.id));
        const cover = ps[ps.length - 1];
        return h('button', { class: 'album', onclick: () => album(ctx, a.id) },
          h('span', { class: 'ph cover tone-' + (cover ? cover.tone : 'grey') }, a.id === 'deleted' ? ic('erase') : null),
          h('b', { text: a.name }), h('small', { text: String(a.count || ps.length) }));
      })));
    }
  };
  pg.scroll.prepend(seg);
  pg.scroll.append(body);
  paint();
  ctx.stack.root({ el: pg.el });
  if (opts.photo) setTimeout(() => photoPage(ctx, opts.photo, '图库'), 60);
}
function album(ctx, id) {
  const a = C.ALBUMS.find((x) => x.id === id);
  const ps = C.PHOTOS.filter((p) => p.albums.includes(id)).sort((x, y) => x.t.localeCompare(y.t));
  const pg = subPage(ctx, a.name, '相簿');
  if (id === 'deleted') {
    pg.scroll.append(h('p', { class: 'ph-note', text: '照片和视频会在这里保留 30 天，然后永久删除。' }));
    pg.scroll.append(h('div', { class: 'ph-grid' }, ps.map((p) => photoTile(p, () => photoPage(ctx, p.id, a.name), h('span', { class: 'ph-left', text: '剩 26 天' })))));
  } else if (id === 'mom') {
    pg.scroll.append(h('p', { class: 'ph-note', ...clueAttr(a.clue) }, `${a.count} 张 · 建于 ${a.made}`));
    pg.scroll.append(h('div', { class: 'ph-grid' }, ps.map((p) => photoTile(p, () => photoPage(ctx, p.id, a.name))), h('div', { class: 'ph more' }, h('span', { text: '+56' }))));
    pg.scroll.append(h('p', { class: 'ph-foot', text: a.note }));
  } else {
    pg.scroll.append(h('div', { class: 'ph-grid' }, ps.map((p) => photoTile(p, () => photoPage(ctx, p.id, a.name)))));
  }
  ctx.stack.push({ el: pg.el });
  setTimeout(() => watchClues(pg.scroll), 400);
  seen('al_' + id);
}

// ═════════════ 备忘录 ═════════════
export function notesApp(ctx) {
  const pg = rootPage(ctx, '文件夹');
  const paint = () => {
    pg.scroll.querySelectorAll('.grp').forEach((g) => g.remove());
    const nMain = C.NOTES.filter((n) => n.folder === 'main').length, nLock = C.NOTES.filter((n) => n.folder === 'lock').length;
    pg.scroll.append(group('我的手机',
      row('备忘录', null, String(nMain), { onclick: () => folder(ctx, 'main') }),
      row(h('span', {}, '私密 ', ic('lock', 'tiny')), null, unlocked('notes') ? String(nLock) : '', { onclick: () => (unlocked('notes') ? folder(ctx, 'lock') : lockedFolder(ctx, paint)) })));
  };
  paint();
  ctx.stack.root({ el: pg.el, onShow: paint });
}
function folder(ctx, f) {
  const pg = subPage(ctx, f === 'lock' ? '私密' : '备忘录', '文件夹');
  const notes = C.NOTES.filter((n) => n.folder === f).sort((a, b) => b.t.localeCompare(a.t));
  pg.scroll.append(h('div', { class: 'grp-b notes' }, notes.map((n) => h('button', { class: 'row note-row', onclick: () => note(ctx, n) },
    h('div', { class: 'row-m' }, h('b', { text: n.title || '（无标题）' }), h('small', {}, h('span', { text: when(n.t, today()) + '  ' }), n.body.split('\n')[0].slice(0, 22)))))));
  ctx.stack.push({ el: pg.el });
}
function note(ctx, n) {
  const pg = subPage(ctx, '', n.folder === 'lock' ? '私密' : '备忘录', { cls: 'note-pg' });
  pg.scroll.append(h('div', {}, h('div', { class: 'note-date', text: stamp(n.t) }), n.title ? h('h2', { class: 'note-ttl', text: n.title }) : null, h('div', { class: 'note-body' }, paras(n.body.replace(/\n/g, '\n\n'), 'nl'))));
  ctx.stack.push({ el: pg.el });
  if (n.clue) setTimeout(() => addClue(n.clue), 700);
  seen(n.id);
}
function lockedFolder(ctx, after) {
  const pg = subPage(ctx, '私密', '文件夹', { cls: 'locked' });
  pg.scroll.append(passBox({
    title: '此文件夹已锁定', hint: C.NOTE_LOCK_HINT, placeholder: '密码', btn: '打开',
    check: (v) => checkPass('notes', v),
    ok: () => { unlock('notes'); after(); ctx.stack.pop(); setTimeout(() => folder(ctx, 'lock'), 380); },
  }));
  ctx.stack.push({ el: pg.el });
}

/** 输入框 + 按钮的锁 */
export function passBox({ title, hint, placeholder, btn, check, ok, numeric = false, icn = 'lock' }) {
  const inp = h('input', { class: 'pb-in', type: 'text', placeholder, autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', inputmode: numeric ? 'numeric' : 'text', enterkeyhint: 'go' });
  const msg = h('p', { class: 'pb-msg' });
  const go = () => {
    if (!inp.value.trim()) return;
    if (check(inp.value)) { sfx.unlock(); inp.blur(); box.classList.add('ok'); setTimeout(ok, 380); }
    else { sfx.wrong(); msg.textContent = '不对。'; box.classList.remove('shake'); void box.offsetWidth; box.classList.add('shake'); inp.select(); }
  };
  inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
  const box = h('div', { class: 'pb' },
    h('span', { class: 'pb-ic', html: icon(icn) }),
    h('b', { text: title }),
    hint ? h('p', { class: 'pb-hint', text: hint }) : null,
    h('div', { class: 'pb-row' }, inp, h('button', { class: 'pb-go', text: btn, onclick: go })),
    msg);
  return box;
}

// ═════════════ 日历 ═════════════
export function calendarApp(ctx) {
  const pg = rootPage(ctx, '日历', { big: false });
  let month = 11, sel = today();
  const head = h('div', { class: 'cal-head' });
  const grid = h('div', { class: 'cal-grid' });
  const list = h('div', { class: 'cal-list' });
  const evOn = (d) => C.EVENTS.filter((e) => e.d === d);
  const paint = () => {
    head.innerHTML = '';
    head.append(
      h('button', { class: 'ibtn', html: icon('back'), disabled: month <= 1, onclick: () => { month--; sfx.tap(); paint(); } }),
      h('b', { text: `2026年${month}月` }),
      h('button', { class: 'ibtn flip', html: icon('back'), disabled: month >= 12, onclick: () => { month++; sfx.tap(); paint(); } }));
    grid.innerHTML = '';
    '一二三四五六日'.split('').forEach((w) => grid.append(h('span', { class: 'cal-w', text: w })));
    const first = new Date(2026, month - 1, 1), days = new Date(2026, month, 0).getDate();
    const pad = (first.getDay() + 6) % 7;
    for (let i = 0; i < pad; i++) grid.append(h('span'));
    for (let d = 1; d <= days; d++) {
      const ds = `2026-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      grid.append(h('button', { class: 'cal-d' + (ds === today() ? ' today' : '') + (ds === sel ? ' sel' : '') + (evOn(ds).length ? ' has' : ''), onclick: () => { sel = ds; sfx.tap(); paint(); } }, h('span', { text: d })));
    }
    list.innerHTML = '';
    const [, mm, dd] = sel.split('-').map(Number);
    list.append(h('div', { class: 'cal-lt', text: `${mm}月${dd}日 星期${weekday(sel)}` }));
    const evs = evOn(sel);
    if (!evs.length) list.append(h('p', { class: 'cal-none', text: '没有日程' }));
    evs.forEach((e) => list.append(h('div', { class: 'cal-ev', ...clueAttr(e.clue) }, h('time', { text: e.time }), h('div', {}, h('b', { text: e.title }), e.note ? h('small', { text: e.note }) : null))));
    watchClues(list);
  };
  pg.scroll.append(head, grid, list);
  paint();
  ctx.stack.root({ el: pg.el });
}

// ═════════════ 健康 ═════════════
export function healthApp(ctx) {
  const pg = rootPage(ctx, '健康');
  const bars = h('div', { class: 'hbars' }, C.STEPS_MONTH.map((v, i) => {
    const val = i === 4 ? Math.round(C.STEPS_MAY.reduce((a, b) => a + b, 0) / 31) : v;
    return h('div', { class: 'hb' }, h('i', { style: { height: Math.max(2, val / 9000 * 100) + '%' } }), h('span', { text: i + 1 }));
  }));
  pg.scroll.append(
    h('button', { class: 'hcard', onclick: () => stepsPage(ctx) },
      h('div', { class: 'hc-h' }, ic('health'), h('b', { text: '步数' }), h('time', { text: '今天' })),
      h('div', { class: 'hc-v' }, h('b', { text: '0' }), ' 步'),
      h('small', { text: '每月平均（2026年）' }), bars),
    h('button', { class: 'hcard', onclick: () => heartPage(ctx) },
      h('div', { class: 'hc-h' }, ic('health'), h('b', { text: '心率' }), h('time', { text: '5月21日' })),
      h('div', { class: 'hc-v small', text: '没有最近的数据' })),
    h('button', { class: 'hcard', onclick: () => medsPage(ctx) },
      h('div', { class: 'hc-h' }, ic('clock'), h('b', { text: '用药' })),
      h('div', { class: 'hc-v small', text: '提醒已关闭' })),
    group('', row('医疗急救卡', null, '', { onclick: () => import('./shell.js').then((m) => m.openMedical()) })));
  ctx.stack.root({ el: pg.el });
}
function stepsPage(ctx) {
  const pg = subPage(ctx, '步数', '健康');
  const max = 2000;
  pg.scroll.append(
    h('div', { class: 'hsec' }, h('b', { text: '2026年5月' }), h('small', { text: '每天' })),
    h('div', { class: 'hbars days' }, C.STEPS_MAY.map((v, i) => h('div', { class: 'hb' + (i === 20 ? ' mark' : '') }, h('i', { style: { height: Math.max(1.5, v / max * 100) + '%' } }), h('span', { text: (i + 1) % 5 === 1 ? i + 1 : '' })))),
    h('div', { class: 'hsec' }, h('b', { text: '最近记录' })),
    group('', ...[['5月1日', '1,830 步'], ['5月7日', '640 步'], ['5月8日', '120 步'], ['5月20日', '3 步'], ['5月21日', '0 步'], ['5月22日 – 今天', '每天 0 步']].map(([a, b]) => row(a, null, b))),
    h('p', { class: 'hfoot', 'data-clue': 'health_zero', text: '从 5月21日起，这台手机没有记录到任何步数。' }));
  ctx.stack.push({ el: pg.el });
  setTimeout(() => watchClues(pg.scroll), 300);
}
function heartPage(ctx) {
  const pg = subPage(ctx, '心率', '健康');
  const pts = [88, 92, 84, 96, 102, 98, 90, 86, 80, 74, 66, 58, 52, 48];
  const path = pts.map((v, i) => `${i ? 'L' : 'M'}${(i / (pts.length - 1) * 300).toFixed(1)},${(120 - v).toFixed(1)}`).join(' ');
  pg.scroll.append(
    h('div', { class: 'hsec' }, h('b', { text: '5月14日 – 5月21日' }), h('small', { text: '每天的平均值' })),
    h('div', { class: 'hline', html: `<svg viewBox="-6 0 312 90" preserveAspectRatio="none"><path d="${path}" fill="none" stroke="currentColor" stroke-width="1.6" vector-effect="non-scaling-stroke"/></svg>` }),
    group('', row('最后一条记录', null, '5月21日 02:58', clueAttr('health_hr_last')), row('来源', null, '手表（已断开）')),
    h('p', { class: 'hfoot', text: '这之后没有新的数据。' }));
  ctx.stack.push({ el: pg.el });
  setTimeout(() => watchClues(pg.scroll), 300);
}
function medsPage(ctx) {
  const pg = subPage(ctx, '用药', '健康');
  pg.scroll.append(group('处方药', row('（处方药）· 每日两次', '08:00 · 20:00 · 饭后', '已关闭'), row('最后一次记录', null, '5月20日 20:00', clueAttr('health_meds'))),
    h('p', { class: 'hfoot', text: '药名被设置为不在锁屏和通知里显示。' }));
  ctx.stack.push({ el: pg.el });
  setTimeout(() => watchClues(pg.scroll), 300);
}

// ═════════════ 钱包 ═════════════
export function walletApp(ctx) {
  const pg = rootPage(ctx, '钱包');
  const money = (v) => (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toLocaleString('en-US') + '.00';
  pg.scroll.append(
    h('div', { class: 'card bank' }, h('small', { text: C.BANK.name }), h('b', { text: '¥ ' + C.BANK.balance }), h('span', { text: '···· ' + C.BANK.tail })),
    h('button', { class: 'card jar', onclick: () => jarPage(ctx) }, h('small', { text: '储蓄罐' }), h('b', { text: C.JAR.name }), h('span', { text: '¥ ' + C.JAR.balance + ' · 到期 11月7日' })),
    h('div', { class: 'hsec' }, h('b', { text: '账单' })),
    h('div', { class: 'grp-b tx' }, C.TRANSACTIONS.map((t) => h('div', { class: 'row', ...clueAttr(t.clue) },
      h('div', { class: 'row-m' }, h('b', { text: t.who }), h('small', { text: `${stamp(t.t)} · ${t.note}` })),
      h('span', { class: 'row-r amt' + (t.amt > 0 ? ' in' : ''), text: t.amt ? money(t.amt) : '—' })))));
  ctx.stack.root({ el: pg.el });
  setTimeout(() => watchClues(pg.scroll), 400);
}
function jarPage(ctx) {
  const pg = subPage(ctx, C.JAR.name, '钱包');
  pg.scroll.append(
    h('div', { class: 'jar-hero' }, h('small', { text: '余额' }), h('b', { text: '¥ ' + C.JAR.balance })),
    group('', row('创建人', null, C.JAR.by), row('创建于', null, C.JAR.created), row('到期日', null, C.JAR.due)),
    group('规则', h('p', { class: 'jar-rule', 'data-clue': 'jar_rule', text: C.JAR.rule + ' ' + C.JAR.after })),
    group('备注', h('p', { class: 'jar-rule memo', text: '「' + C.JAR.memo + '」' })));
  ctx.stack.push({ el: pg.el });
  setTimeout(() => watchClues(pg.scroll), 400);
}

// ═════════════ 邮件 ═════════════
export function mailApp(ctx) {
  const pg = rootPage(ctx, '收件箱');
  const paint = () => {
    pg.scroll.querySelectorAll('.mail-list,.pb,.mail-draft').forEach((x) => x.remove());
    if (!unlocked('mail')) {
      pg.scroll.append(passBox({ title: '需要验证', hint: C.MAIL_Q.note + '\n' + C.MAIL_Q.q, placeholder: '答案', btn: '验证', icn: 'mail',
        check: (v) => checkPass('mail', v), ok: () => { unlock('mail'); paint(); } }));
      return;
    }
    pg.scroll.append(h('div', { class: 'grp-b mail-list' }, C.MAILS.slice().sort((a, b) => b.t.localeCompare(a.t)).map((m) => h('button', { class: 'row mail-row' + (S.seen[m.id] ? '' : ' unread'), onclick: () => mail(ctx, m) },
      h('div', { class: 'row-m' }, h('div', { class: 'mr-top' }, h('b', { text: m.from }), h('time', { text: when(m.t, today()) })), h('span', { class: 'mr-s', text: m.subj }), h('small', { text: m.body.replace(/\n+/g, ' ').slice(0, 40) }))))));
    pg.scroll.append(h('div', { class: 'grp mail-draft' }, h('div', { class: 'grp-t', text: '草稿' }), h('div', { class: 'grp-b' }, h('button', { class: 'row', onclick: () => draft(ctx) }, h('div', { class: 'row-m' }, h('b', { text: '收件人：' + C.MAIL_DRAFT.to }), h('small', { text: stamp(C.MAIL_DRAFT.t) + ' · ' + C.MAIL_DRAFT.subj }))))));
  };
  paint();
  ctx.stack.root({ el: pg.el, onShow: paint });
}
function mail(ctx, m) {
  const pg = subPage(ctx, '', '收件箱', { cls: 'mail-pg' });
  pg.scroll.append(h('div', { class: 'mail-h' }, h('b', { text: m.subj }), h('small', { text: `${m.from} → 苏念 · ${stamp(m.t)}` })), h('div', { class: 'mail-b' }, paras(m.body)));
  ctx.stack.push({ el: pg.el });
  if (m.clue) setTimeout(() => addClue(m.clue), 600);
  seen(m.id);
}
function draft(ctx) {
  const pg = subPage(ctx, '草稿', '收件箱', { cls: 'mail-pg' });
  pg.scroll.append(h('div', { class: 'mail-h' }, h('b', { text: '收件人：妈妈' }), h('small', { text: '最后编辑 ' + stamp(C.MAIL_DRAFT.t) })), h('div', { class: 'mail-b draft' }, h('p', { text: C.MAIL_DRAFT.body }), h('span', { class: 'caret' })));
  ctx.stack.push({ el: pg.el });
}

// ═════════════ 足迹 ═════════════
export function mapsApp(ctx) {
  const pg = rootPage(ctx, '足迹');
  pg.scroll.append(
    h('div', { class: 'mapcard', html: `<svg viewBox="0 0 320 150" preserveAspectRatio="xMidYMid slice"><defs><pattern id="mg" width="14" height="14" patternUnits="userSpaceOnUse"><path d="M14 0H0V14" fill="none" stroke="currentColor" stroke-opacity=".07"/></pattern></defs><rect width="320" height="150" fill="url(#mg)"/><path d="M0 92 C40 88 62 70 96 76 S150 104 186 92 228 58 262 66 300 80 320 74 V150 H0Z" fill="currentColor" fill-opacity=".07"/><path d="M0 92 C40 88 62 70 96 76 S150 104 186 92 228 58 262 66 300 80 320 74" fill="none" stroke="currentColor" stroke-opacity=".35" stroke-width="1"/><path d="M60 40 L120 52 L176 44 L230 30" fill="none" stroke="currentColor" stroke-opacity=".18" stroke-dasharray="3 4"/><circle cx="214" cy="80" r="16" fill="currentColor" fill-opacity=".08"/><circle cx="214" cy="80" r="5" fill="currentColor"/><circle cx="120" cy="52" r="3" fill="none" stroke="currentColor" stroke-opacity=".6"/></svg>` },
      h('div', { class: 'mc-cap' }, h('small', { text: '现在' }), h('b', { text: '汀州 · 轮渡码头' }))),
    ...C.PLACES.map((p) => h('div', { class: 'grp', ...clueAttr(p.clue) }, h('div', { class: 'grp-t', text: p.when }), h('div', { class: 'grp-b' }, p.rows.map(([a, b]) => row(b, null, a))))));
  ctx.stack.root({ el: pg.el });
  setTimeout(() => watchClues(pg.scroll), 400);
}

// ═════════════ 录音 ═════════════
export function voiceApp(ctx) {
  const pg = rootPage(ctx, '录音');
  const fmt = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  pg.scroll.append(h('div', { class: 'grp-b recs' }, C.RECORDINGS.slice().reverse().map((r) => {
    const tr = h('div', { class: 'rec-x', hidden: true },
      h('div', { class: 'rec-bar' }, h('i')),
      h('div', { class: 'rec-t' }, h('small', { text: '转写' }), paras(r.text)));
    const el = h('div', { class: 'rec' },
      h('button', { class: 'row', onclick: () => {
        tr.hidden = !tr.hidden; sfx.tap();
        if (!tr.hidden) { el.classList.add('play'); setTimeout(() => el.classList.remove('play'), 2400); if (r.clue) addClue(r.clue); seen(r.id); }
      } }, h('div', { class: 'row-m' }, h('b', { text: r.title }), h('small', { text: stamp(r.t) })), h('span', { class: 'row-r', text: fmt(r.dur) })),
      tr);
    return el;
  })));
  ctx.stack.root({ el: pg.el });
}

// ═════════════ 浏览器 ═════════════
export function browserApp(ctx) {
  const pg = rootPage(ctx, '历史记录');
  const days = {};
  C.HISTORY.forEach((x) => { (days[dayOf(x.t)] ||= []).push(x); });
  pg.scroll.append(h('div', { class: 'search fake' }, ic('web'), h('span', { text: '搜索或输入网址' })));
  for (const [d, items] of Object.entries(days)) {
    pg.scroll.append(group(when(d + ' 00:00', today()) === '00:00' ? '今天' : stamp(d + ' 00:00').replace(/\s.*$/, '').trim(), ...items.map((x) => row(x.q, `${x.t.slice(11)} · ${x.page}`, null, { onclick: () => site(ctx, x) }))));
  }
  ctx.stack.root({ el: pg.el });
}
function site(ctx, x) {
  const pg = subPage(ctx, '', '历史记录', { cls: 'site' });
  pg.scroll.append(h('div', { class: 'url' }, ic('lock', 'tiny'), h('span', { text: x.q })), h('div', { class: 'site-b' }, h('h2', { text: x.page }), paras(x.body)));
  ctx.stack.push({ el: pg.el });
  if (x.clue) setTimeout(() => addClue(x.clue), 500);
}

// ═════════════ 电话 ═════════════
export function phoneApp(ctx) {
  const pg = rootPage(ctx, '最近通话', { big: false });
  const seg = h('div', { class: 'seg' });
  const body = h('div');
  let tab = 'recent';
  const paint = () => {
    seg.innerHTML = '';
    [['recent', '最近通话'], ['contacts', '通讯录'], ['vm', '语音留言']].forEach(([k, l]) => seg.append(h('button', { class: k === tab ? 'on' : '', text: l, onclick: () => { tab = k; sfx.tap(); paint(); } }, k === 'vm' && !S.seen.vm ? h('em', { class: 'dot' }) : null)));
    pg.setTitle({ recent: '最近通话', contacts: '通讯录', vm: '语音留言' }[tab]);
    body.innerHTML = '';
    if (tab === 'recent') body.append(h('div', { class: 'grp-b' }, C.CALLS.map((c) => h('div', { class: 'row' + (c.status.startsWith('未接') || c.status === '已拒绝' ? ' missed' : '') },
      h('div', { class: 'row-m' }, h('b', { text: c.who }), h('small', { text: `${c.kind} · ${c.status}` })), h('span', { class: 'row-r', text: when(c.t, today()) })))));
    if (tab === 'contacts') body.append(h('div', { class: 'grp-b' }, C.CONTACTS.map((c) => row(c.name, c.sub || null, null))));
    if (tab === 'vm') {
      const v = C.VOICEMAIL;
      const tr = h('div', { class: 'rec-x' }, h('div', { class: 'rec-bar' }, h('i')), h('div', { class: 'rec-t' }, h('small', { text: '转写' }), paras(v.text)));
      tr.hidden = true;
      const el = h('div', { class: 'rec' }, h('button', { class: 'row', onclick: () => { tr.hidden = !tr.hidden; sfx.tap(); if (!tr.hidden) { el.classList.add('play'); setTimeout(() => el.classList.remove('play'), 2400); addClue(v.clue); if (!S.seen.vm) { S.seen.vm = 1; save(); emit('seen', 'vm'); } } } },
        h('div', { class: 'row-m' }, h('b', { text: v.who }), h('small', { text: stamp(v.t) })), h('span', { class: 'row-r', text: `0:${v.dur}` })), tr);
      body.append(h('div', { class: 'grp-b recs' }, el));
    }
  };
  pg.scroll.prepend(seg);
  pg.scroll.append(body);
  paint();
  ctx.stack.root({ el: pg.el });
}

// ═════════════ 时钟 · 天气 · 画框 ═════════════
export function clockApp(ctx) {
  const pg = rootPage(ctx, '闹钟');
  pg.scroll.append(h('div', { class: 'grp-b alarms' }, C.ALARMS.map((a) => h('div', { class: 'row alarm' }, h('div', { class: 'row-m' }, h('b', { text: a.time }), h('small', { text: a.label })), h('span', { class: 'sw' + (a.on ? ' on' : '') }, h('i'))))));
  ctx.stack.root({ el: pg.el });
}
export function weatherApp(ctx) {
  const pg = rootPage(ctx, '天气');
  pg.scroll.append(h('div', { class: 'wx' }, C.WEATHER.map((w) => h('div', { class: 'wx-card' },
    h('div', {}, h('b', { text: w.city }), h('small', { text: w.tag || '' }), h('p', { text: w.cond })),
    h('div', { class: 'wx-r' }, h('span', { class: 'wx-now', text: w.now }), h('small', { text: `最高 ${w.hi}° 最低 ${w.lo}°` }))))));
  ctx.stack.root({ el: pg.el });
}
export function galleryApp(ctx) {
  const pg = rootPage(ctx, '画框', { big: false, cls: 'gallery' });
  const G = C.GALLERY;
  pg.scroll.append(h('div', { class: 'gl-prof' }, h('span', { class: 'av big', text: '念' }), h('div', {}, h('b', { text: G.name }), h('small', { text: G.bio }), h('small', { text: G.fans + ' 关注' }))));
  for (const p of G.posts) {
    const ph = p.photo ? photoById(p.photo) : null;
    pg.scroll.append(h('article', { class: 'gl-post', ...clueAttr(p.clue) },
      ph ? photoTile(ph, () => photoPage(ctx, ph.id, '画框')) : h('div', { class: 'ph tone-warm' }, h('span', { class: 'ph-t', text: p.text })),
      h('p', { class: 'gl-cap', text: p.cap }),
      h('time', { text: stamp(p.t) }),
      h('div', { class: 'gl-cm' }, p.comments.map(([t, d]) => h('div', { class: 'cm' }, h('span', { text: t }), h('time', { text: d.slice(5).replace('-', '/') }))))));
  }
  ctx.stack.root({ el: pg.el });
  setTimeout(() => watchClues(pg.scroll), 400);
}

// ═════════════ 设置 ═════════════
export function settingsApp(ctx, opts = {}) {
  const pg = rootPage(ctx, '设置');
  pg.scroll.append(
    h('div', { class: 'grp-b' }, h('div', { class: 'row prof' }, h('span', { class: 'av', text: '念' }), h('div', { class: 'row-m' }, h('b', { text: '苏念' }), h('small', { text: '账户' })))),
    group('', row('无线局域网', null, '未连接', { onclick: () => wifi(ctx) }), row('屏幕使用时间', null, '', { onclick: () => screenTime(ctx) }), row('电池', null, '23%')),
    group('', row('关于本机', null, '', { onclick: () => about(ctx) })),
    group('', h('button', { class: 'row danger', onclick: () => opts.onErase && opts.onErase() }, h('div', { class: 'row-m' }, h('b', { text: '抹掉所有内容和设置' })))));
  ctx.stack.root({ el: pg.el });
}
function wifi(ctx) {
  const pg = subPage(ctx, '无线局域网', '设置');
  pg.scroll.append(group('我的网络', ...C.WIFI.map((w) => row(w, null, ''))), h('p', { class: 'hfoot', text: '附近没有可用的网络。' }));
  ctx.stack.push({ el: pg.el });
}
function screenTime(ctx) {
  const pg = subPage(ctx, '屏幕使用时间', '设置');
  pg.scroll.append(
    group('一月 – 四月 · 每日平均', ...C.SCREEN_TIME.before.map(([a, b]) => row(a, null, b))),
    h('div', { 'data-clue': 'screen_time' }, group('五月八日以后 · 每日平均', ...C.SCREEN_TIME.after.map(([a, b]) => row(a, null, b)))),
    h('p', { class: 'hfoot', text: '有些 App 在屏幕关着的时候也在运行。' }));
  ctx.stack.push({ el: pg.el });
  setTimeout(() => watchClues(pg.scroll), 400);
}
function about(ctx) {
  const pg = subPage(ctx, '关于本机', '设置');
  pg.scroll.append(group('', row('名称', null, '念的手机'), row('容量', null, '128 GB'), row('可用', null, '3.1 GB'), row('照片', null, '2,816'), row('App', null, '23')));
  ctx.stack.push({ el: pg.el });
}

// ═════════════ 回声 ═════════════
export function echoApp(ctx, opts = {}) {
  const pg = rootPage(ctx, '回声', { big: false, cls: 'echo' });
  const body = h('div', { class: 'echo-body' });
  pg.scroll.append(body);
  let tab = 'talk';
  const paint = () => {
    body.innerHTML = '';
    if (!unlocked('echo')) return lockView();
    const seg = h('div', { class: 'seg' });
    [['talk', '对话'], ['mem', '记忆'], ['task', '任务'], ['about', '关于']].forEach(([k, l]) => seg.append(h('button', { class: k === tab ? 'on' : '', text: l, onclick: () => { tab = k; sfx.tap(); paint(); } })));
    body.append(h('div', { class: 'echo-status' }, h('span', { class: 'pulse' }), h('span', { text: C.ECHO.status })), seg);
    ({ talk: talkTab, mem: memTab, task: taskTab, about: aboutTab })[tab]();
    setTimeout(() => watchClues(body), 300);
  };
  function lockView() {
    let mode = 'carer';
    const holder = h('div');
    const draw = () => {
      holder.innerHTML = '';
      const sw = h('div', { class: 'seg small' },
        h('button', { class: mode === 'carer' ? 'on' : '', text: '照看者', onclick: () => { mode = 'carer'; draw(); } }),
        h('button', { class: mode === 'key' ? 'on' : '', text: '创建者', onclick: () => { mode = 'key'; draw(); } }));
      holder.append(sw, mode === 'carer'
        ? passBox({ title: '照看者口令', hint: '四位数字。', placeholder: '口令', btn: '进入', numeric: true, icn: 'echo', check: (v) => checkPass('echo', v), ok: () => { unlock('echo'); paint(); } })
        : passBox({ title: '创建者钥匙', hint: '只有她知道。', placeholder: '钥匙', btn: '打开', icn: 'lock', check: (v) => checkPass('key', v), ok: () => { unlock('echo'); unlock('key'); tab = 'task'; paint(); } }));
    };
    draw();
    body.append(
      h('div', { class: 'echo-hero' }, h('div', { class: 'rings' }, h('i'), h('i'), h('i'), h('b')), h('p', { class: 'echo-slogan', text: '留下你的声音，让爱你的人还能听见。' })),
      h('div', { class: 'echo-lockinfo', 'data-clue': 'echo_lock' }, h('div', {}, h('span', { class: 'pulse' }), C.ECHO.status), h('div', { text: C.ECHO.carer })),
      holder);
  }
  function talkTab() {
    body.append(h('div', { class: 'grp-b' },
      row('妈妈', '日志 · 挑出来的几条', null, { onclick: () => logPage(ctx, 'mom', '妈妈') }),
      row('程屿', '日志 · 挑出来的几条', null, { onclick: () => logPage(ctx, 'cy', '程屿') }),
      row('你', S.talk.log.length ? '你们说过话' : '它在等你开口', null, { onclick: () => talkPage(ctx) })));
  }
  function memTab() {
    body.append(
      group('它学了些什么', ...C.ECHO.stats.map(([a, b]) => row(a, null, b))),
      group('她的说话习惯', ...C.ECHO.habits.map(([a, b, c]) => row(a, c, b))),
      h('div', { class: 'grp', 'data-clue': 'echo_rules' }, h('div', { class: 'grp-t', text: '她定下的规矩' }), h('ol', { class: 'rules' }, C.ECHO.rules.map((r) => h('li', { text: r })))));
  }
  function taskTab() {
    for (const t of C.ECHO.tasks) {
      body.append(h('div', { class: 'task' + (t.state === 'done' ? ' done' : ''), ...clueAttr(t.state === 'wait' ? 'echo_task' : null) },
        h('div', { class: 'task-h' }, h('b', { text: t.title }), h('span', { text: t.state === 'done' ? '已完成' : '等待中' })),
        h('time', { text: t.when }), h('p', { text: t.what }),
        t.state === 'wait' ? (unlocked('key')
          ? h('button', { class: 'task-x', text: '取消这个任务', onclick: () => opts.onCancelTask && opts.onCancelTask() })
          : h('button', { class: 'task-x off', text: '取消需要创建者钥匙', onclick: () => keyPrompt() })) : null));
    }
  }
  function keyPrompt() {
    const pg2 = subPage(ctx, '创建者钥匙', '回声');
    pg2.scroll.append(passBox({ title: '创建者钥匙', hint: '只有她知道。', placeholder: '钥匙', btn: '打开', check: (v) => checkPass('key', v), ok: () => { unlock('key'); ctx.stack.pop(); paint(); } }));
    ctx.stack.push({ el: pg2.el });
  }
  function aboutTab() {
    body.append(h('div', { 'data-clue': 'echo_creator' }, group('', ...C.ECHO.about.map(([a, b]) => row(a, null, b)))));
    if (unlocked('key')) {
      body.append(group('封存',
        row('给捡到我的人', '她留给陌生人的一段话', null, { onclick: () => finderPage(ctx) }),
        row('最后一封信', '立冬 17:52 自动打开', null, { onclick: () => toast('还没到时候。') })));
    }
  }
  paint();
  ctx.stack.root({ el: pg.el, onShow: paint });
  ctx.repaint = paint;
}
function logPage(ctx, who, name) {
  const pg = subPage(ctx, name, '回声', { cls: 'logs' });
  pg.scroll.append(h('p', { class: 'hfoot', text: '括号里是回声自己的批注。' }), ...C.ECHO.logs[who].map(([t, dir, text, note, clue]) => h('div', { class: 'log', ...clueAttr(clue) },
    h('div', { class: 'log-h' }, h('time', { text: stamp(t) }), h('span', { text: dir === '→' ? '回声 → ' + name : dir === '←' ? name + ' → 回声' : '没有接' })),
    h('p', { class: 'log-t', text: text }), h('p', { class: 'log-n', text: '（' + note + '）' }))));
  ctx.stack.push({ el: pg.el });
  setTimeout(() => watchClues(pg.scroll), 400);
}
function finderPage(ctx) {
  const pg = subPage(ctx, '给捡到我的人', '回声', { cls: 'letter-pg' });
  pg.scroll.append(h('div', { class: 'letter' }, paras(FINDER)));
  ctx.stack.push({ el: pg.el });
  S.seen.finder = 1; save();
}

// 回声和你说话
function talkPage(ctx) {
  const pg = subPage(ctx, '回声', '回声', { cls: 'thread talk' });
  const box = h('div', { class: 'msgs' });
  const opts = h('div', { class: 'talk-opts' });
  pg.scroll.append(box);
  pg.el.append(opts);
  const scrollEnd = () => requestAnimationFrame(() => pg.scroll.scrollTo({ top: pg.scroll.scrollHeight, behavior: 'smooth' }));
  const bub = (who, text) => h('div', { class: 'msg ' + (who === 'me' ? 'me' : 'them echo-b') }, h('div', { class: 'b', text }));
  S.talk.log.forEach(([w, t]) => box.append(bub(w, t)));
  let busy = false;
  const say = async (node) => {
    busy = true; opts.innerHTML = '';
    for (const line of TALK[node].say) {
      const typing = h('div', { class: 'msg them echo-b typing' }, h('div', { class: 'b' }, h('i'), h('i'), h('i')));
      box.append(typing); scrollEnd();
      await new Promise((r) => setTimeout(r, 700 + line.length * 45));
      typing.remove();
      box.append(bub('echo', line)); sfx.pick();
      S.talk.log.push(['echo', line]);
      scrollEnd();
    }
    S.talk.node = TALK[node].end ? 'menu' : node;
    save(); busy = false;
    drawOpts();
  };
  const ask = (text, node) => {
    if (busy) return;
    sfx.tap();
    box.append(bub('me', text)); S.talk.log.push(['me', text]);
    if (!S.talk.asked.includes(node)) S.talk.asked.push(node);
    scrollEnd();
    say(node);
  };
  function drawOpts() {
    opts.innerHTML = '';
    let list;
    const cur = S.talk.node && TALK[S.talk.node];
    if (!S.talk.log.length) list = TALK.start.opts;
    else if (cur && Array.isArray(cur.opts)) list = cur.opts;
    else list = TALK_MENU.filter((k) => !S.talk.asked.includes(k) || k === 'bye').filter((k) => !TALK[k].need || S.talk.asked.includes(TALK[k].need)).map((k) => [TALK[k].q, k]);
    list.forEach(([text, node]) => opts.append(h('button', { text, onclick: () => ask(text, node) })));
  }
  ctx.stack.push({ el: pg.el });
  scrollEnd();
  if (!S.talk.log.length) setTimeout(() => say('start'), 500);
  else drawOpts();
}

export const APPS = {
  msgs: msgsApp, photos: photosApp, notes: notesApp, calendar: calendarApp, health: healthApp, wallet: walletApp,
  mail: mailApp, maps: mapsApp, voice: voiceApp, browser: browserApp, phone: phoneApp, clock: clockApp,
  weather: weatherApp, gallery: galleryApp, settings: settingsApp, echo: echoApp,
};
