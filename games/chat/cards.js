// 卡片类消息：红包、转账、链接、通话、转发的聊天记录（画法 + 点开以后的界面）
import { h, sheet } from './ui.js';
import { I } from './icons.js';
import { media } from './media.js';
import { avatarEl } from './look.js';
import { A, money, callText, nameOf, sfx, hb, snippet } from './state.js';
import { fmtTime } from './data.js';
import { pop } from './nav.js';

// ---------- 链接模板（不画各家的 logo，只写平台名字 + 通用小图标） ----------
export const LINKS = [
  { id: 'web', name: '网页', kind: 'article', color: '#64748B', icon: 'link', hosts: [] },
  { id: 'x', name: 'X', kind: 'post', color: '#15171C', icon: 'post', hosts: ['x.com', 'twitter.com'] },
  { id: 'ins', name: 'Instagram', kind: 'photo', color: '#D6497F', icon: 'camera', hosts: ['instagram.com'] },
  { id: 'tiktok', name: 'TikTok', kind: 'tall', color: '#15171C', icon: 'play', hosts: ['tiktok.com'] },
  { id: 'youtube', name: 'YouTube', kind: 'wide', color: '#E53935', icon: 'play', hosts: ['youtube.com', 'youtu.be'] },
  { id: 'douyin', name: '抖音', kind: 'tall', color: '#15171C', icon: 'play', hosts: ['douyin.com', 'iesdouyin.com'] },
  { id: 'xhs', name: '小红书', kind: 'note', color: '#F23B4F', icon: 'book', hosts: ['xiaohongshu.com', 'xhslink.com'] },
  { id: 'bili', name: '哔哩哔哩', kind: 'wide', color: '#F0679B', icon: 'play', hosts: ['bilibili.com', 'b23.tv'] },
  { id: 'weibo', name: '微博', kind: 'post', color: '#E6162D', icon: 'post', hosts: ['weibo.com', 'weibo.cn'] },
  { id: 'zhihu', name: '知乎', kind: 'article', color: '#1772F6', icon: 'quote', hosts: ['zhihu.com'] },
  { id: 'netease', name: '网易云音乐', kind: 'music', color: '#E83C3C', icon: 'music', hosts: ['music.163.com', '163cn.tv'] },
  { id: 'qqmusic', name: 'QQ音乐', kind: 'music', color: '#1FB86A', icon: 'music', hosts: ['y.qq.com'] },
  { id: 'spotify', name: 'Spotify', kind: 'music', color: '#1DB954', icon: 'music', hosts: ['open.spotify.com', 'spotify.link'] },
  { id: 'chatgpt', name: 'ChatGPT', kind: 'ai', color: '#10A37F', icon: 'spark', hosts: ['chatgpt.com', 'chat.openai.com'] },
  { id: 'claude', name: 'Claude', kind: 'ai', color: '#C96442', icon: 'spark', hosts: ['claude.ai'] },
  { id: 'grok', name: 'Grok', kind: 'ai', color: '#15171C', icon: 'spark', hosts: ['grok.com'] },
  { id: 'gemini', name: 'Gemini', kind: 'ai', color: '#4E7CF6', icon: 'spark', hosts: ['gemini.google.com'] },
  { id: 'deepseek', name: 'DeepSeek', kind: 'ai', color: '#4D6BFE', icon: 'spark', hosts: ['deepseek.com'] },
  { id: 'kimi', name: 'Kimi', kind: 'ai', color: '#15171C', icon: 'spark', hosts: ['kimi.com', 'moonshot.cn'] },
  { id: 'doubao', name: '豆包', kind: 'ai', color: '#3B6CF5', icon: 'spark', hosts: ['doubao.com'] },
];
export const linkTpl = (id) => LINKS.find((x) => x.id === id) || LINKS[0];

/** 粘贴的链接认出是哪个平台 */
export function detectLink(url) {
  let u;
  try { u = new URL(/^[a-z]+:\/\//i.test(url) ? url : 'https://' + url.trim()); } catch { return null; }
  const host = u.hostname.replace(/^www\.|^m\./, '').toLowerCase();
  if ((host === 'x.com' || host === 'twitter.com') && u.pathname.startsWith('/i/grok')) return 'grok';
  for (const t of LINKS) if (t.hosts.some((d) => host === d || host.endsWith('.' + d))) return t.id;
  return 'web';
}
export function shortUrl(url) {
  const s = String(url || '').trim().replace(/^[a-z]+:\/\//i, '').replace(/^www\./, '');
  return s.length > 42 ? s.slice(0, 40) + '…' : s;
}

/** 文字里的说明叫什么（表单和预览都用） */
export const LINK_FIELDS = {
  article: { title: '标题', desc: '摘要', author: null },
  post: { title: null, desc: '正文', author: '作者' },
  photo: { title: null, desc: '配文', author: '作者' },
  tall: { title: '标题', desc: null, author: '作者' },
  wide: { title: '标题', desc: null, author: '作者' },
  note: { title: '标题', desc: null, author: '作者' },
  music: { title: '歌名', desc: null, author: '歌手' },
  ai: { title: '对话标题', desc: '第一句话', author: null },
};

function cover(m, cls) {
  const el = h('div', { class: 'lk-cover ' + cls });
  if (m.cover) media.url(m.cover).then((u) => { if (u) el.style.backgroundImage = `url("${u}")`; });
  else el.classList.add('empty');
  return el;
}

export function linkCard(m) {
  const t = linkTpl(m.tpl);
  const k = t.kind;
  const tint = { style: { '--tint': t.color } };
  const foot = h('div', { class: 'lk-foot' }, h('i', { class: 'lk-ic', html: I[t.icon] }), h('span', { class: 'lk-src', text: t.name }), m.url && h('span', { class: 'lk-url', text: shortUrl(m.url) }));
  const title = (n = 2) => m.title && h('div', { class: 'lk-title l' + n, text: m.title });
  const desc = (n = 3) => m.desc && h('div', { class: 'lk-desc l' + n, text: m.desc });
  const author = () => m.author && h('div', { class: 'lk-author' }, h('i', { class: 'lk-dot' }), h('span', { text: m.author }));
  let body;
  if (k === 'article') body = [title(2), h('div', { class: 'lk-row' }, desc(3) || h('div', { class: 'lk-desc l3 muted', text: shortUrl(m.url) }), m.cover && cover(m, 'sq'))];
  else if (k === 'post') body = [author(), desc(5), m.cover && cover(m, 'wide')];
  else if (k === 'photo') body = [author(), cover(m, 'square'), desc(2)];
  else if (k === 'tall') body = [h('div', { class: 'lk-media' }, cover(m, 'tall'), h('i', { class: 'lk-play', html: I.play })), title(2), author()];
  else if (k === 'wide') body = [h('div', { class: 'lk-media' }, cover(m, 'wide'), h('i', { class: 'lk-play', html: I.play })), title(2), author()];
  else if (k === 'note') body = [cover(m, 'note'), title(2), author()];
  else if (k === 'music') body = [h('div', { class: 'lk-music' }, h('div', { class: 'lk-media' }, cover(m, 'disc'), h('i', { class: 'lk-play sm', html: I.play })), h('div', { class: 'lk-mt' }, title(1), m.author && h('div', { class: 'lk-desc l1', text: m.author })))];
  else if (k === 'ai') body = [h('div', { class: 'lk-ai' }, h('i', { html: I.spark }), h('span', { text: '分享的对话' })), title(2), m.desc && h('div', { class: 'lk-ask' }, h('span', { class: 'l3', text: m.desc }))];
  return h('div', { class: `card link k-${k}`, ...tint }, h('div', { class: 'lk-body' }, body), foot);
}

// ---------- 红包 ----------
const RP_STATE = { new: '', open: '已领取', gone: '已被领完', expired: '已过期' };
export function redpacketCard(m) {
  return h('div', { class: 'card rp' + (m.state && m.state !== 'new' ? ' done' : '') },
    h('div', { class: 'rp-top' },
      h('i', { class: 'rp-env', html: envelope }),
      h('div', { class: 'rp-t' }, h('b', { text: m.text || '恭喜发财，大吉大利' }), RP_STATE[m.state] && h('small', { text: RP_STATE[m.state] }))),
    h('div', { class: 'rp-foot', text: '红包' }));
}
const envelope = `<svg viewBox="0 0 30 38" aria-hidden="true"><rect x="1" y="1" width="28" height="36" rx="4" fill="#FFE2B8"/><path d="M1 10c4.5 3.6 9 5.4 14 5.4S24.5 13.6 29 10V5a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4z" fill="#F7C27A"/><circle cx="15" cy="15.4" r="4.6" fill="#E9503F"/><circle cx="15" cy="15.4" r="2.2" fill="#FFD27A"/></svg>`;

/** 点开红包：金色「開」转几圈，然后露出金额 */
export function openRedpacket(c, m, { onOpened }) {
  const from = nameOf(c, m.s, m.who);
  const sender = avatarEl(m.s === 'R' ? (c.right || A.D.me) : (c.members.find((x) => x.id === m.who) || c.left), 's44');
  const amount = h('div', { class: 'rpo-amt' }, h('span', { text: money(m.amount) }), h('small', { text: '元' }));
  const note = h('div', { class: 'rpo-note' });
  const coin = h('button', { class: 'rpo-coin', 'aria-label': '开', text: '開' });
  const flap = h('div', { class: 'rpo-flap' }, h('div', { class: 'rpo-who' }, sender, h('b', { text: `${from}的红包` })), h('div', { class: 'rpo-bless', text: m.text || '恭喜发财，大吉大利' }));
  const box = h('div', { class: 'rpo' }, flap, h('div', { class: 'rpo-res' }, amount, note), coin);
  const close = h('button', { class: 'rpo-x', html: I.close, 'aria-label': '关闭' });
  const wrap = h('div', { class: 'rpo-wrap' }, box, close);
  document.getElementById('layer').append(wrap);
  wrap.getBoundingClientRect();
  wrap.classList.add('on');
  const shut = () => { wrap.classList.remove('on'); setTimeout(() => wrap.remove(), 260); };
  close.addEventListener('click', shut);
  wrap.addEventListener('click', (e) => { if (e.target === wrap) shut(); });
  const showResult = (text) => { note.textContent = `${from}的红包 · ${text}`; box.classList.add('opened'); };
  if (m.state === 'open') { showResult('已领取'); return; }
  if (m.state === 'gone') { amount.hidden = true; note.textContent = '手慢了，红包派完了'; box.classList.add('opened'); return; }
  if (m.state === 'expired') { amount.hidden = true; note.textContent = '这个红包已过期'; box.classList.add('opened'); return; }
  coin.addEventListener('click', () => {
    if (box.classList.contains('spinning')) return;
    box.classList.add('spinning');
    sfx.coin(); hb.haptic([8, 40, 8]);
    setTimeout(() => { sfx.open(); showResult('已领取'); onOpened(); }, 1000);
  });
}

// ---------- 转账 ----------
export function transferCard(c, m) {
  const r = m.receipt;
  const st = r ? (r === 'back' ? '已退还' : '已收款') : m.state === 'done' ? '已收款' : m.state === 'back' ? '已退还' : '';
  const sub = r ? st : st || (m.note || (m.s === 'R' ? `转账给${nameOf(c, 'L')}` : '转账给你'));
  return h('div', { class: 'card tf' + (r ? ' receipt' : '') + (!r && m.state !== 'wait' ? ' done' : '') },
    h('div', { class: 'tf-top' },
      h('i', { class: 'tf-ic', html: r ? (r === 'back' ? I.undo : I.check) : I.transfer }),
      h('div', { class: 'tf-t' }, h('b', { text: `¥${money(m.amount)}` }), h('small', { text: sub }))),
    h('div', { class: 'tf-foot', text: '转账' }));
}

/** 点开待收款的转账：收款或退还 */
export function openTransfer(c, m, { onDone }) {
  const waiting = m.state === 'wait' && !m.receipt;
  const s = sheet({
    body: h('div', { class: 'sheet-body tfo' },
      h('i', { class: 'tfo-ic' + (waiting ? '' : ' ok'), html: waiting ? I.transfer : I.check }),
      h('div', { class: 'tfo-st', text: waiting ? '待收款' : m.receipt === 'back' || m.state === 'back' ? '已退还' : '已收款' }),
      h('div', { class: 'tfo-amt', text: `¥${money(m.amount)}` }),
      m.note && h('div', { class: 'tfo-note', text: m.note }),
      waiting && h('button', { class: 'btn-primary', text: '收款', onclick: () => { s.close(); onDone('done'); } }),
      waiting && h('button', { class: 'btn-text', text: '退还', onclick: () => { s.close(); onDone('back'); } })),
  });
}

// ---------- 通话 ----------
export function callBubble(m) {
  return [h('span', { class: 'call-ic', html: m.video ? I.video : I.phone }), h('span', { class: 'call-t', text: callText(m) })];
}

// ---------- 转发的聊天记录 ----------
export function historyCard(m) {
  const lines = m.items.filter((x) => x.k !== 'time').slice(0, 4);
  return h('div', { class: 'card hist' },
    h('div', { class: 'hs-title', text: m.title }),
    h('div', { class: 'hs-lines' }, lines.map((x) => h('div', { class: 'hs-line', text: `${(m.people[x.p] || {}).name || ''}：${itemText(x)}` }))),
    h('div', { class: 'hs-foot', text: '聊天记录' }));
}
export function itemText(x) {
  switch (x.k) {
    case 'text': return x.text.replace(/\s+/g, ' ');
    case 'img': return '[图片]';
    case 'sticker': return '[表情]';
    case 'voice': return `[语音] ${x.sec}″`;
    default: return x.t || '';
  }
}

/** 从一段对话里挑出来的消息做成「聊天记录」 */
export function makeHistory(c, msgs) {
  const people = {};
  const items = [];
  const key = (m) => (m.s === 'R' ? 'R' : m.who || 'L');
  for (const m of msgs) {
    if (m.k === 'time') { items.push({ k: 'time', t: m.t }); continue; }
    if (!m.s) continue;
    const p = key(m);
    if (!people[p]) { const ps = m.s === 'R' ? (c.right || A.D.me) : c.type === 'group' ? (c.members.find((x) => x.id === m.who) || {}) : c.left; people[p] = { name: nameOf(c, m.s, m.who), av: ps.av || {} }; }
    const it = { p, k: m.k };
    if (m.k === 'text') it.text = m.text;
    else if (m.k === 'img' || m.k === 'sticker') Object.assign(it, { media: m.media, w: m.w, h: m.h });
    else if (m.k === 'voice') it.sec = m.sec;
    else { it.k = 'other'; it.t = snippet(c, m); }
    items.push(it);
  }
  const names = Object.values(people).map((p) => p.name);
  const title = c.type === 'group' ? '群聊的聊天记录' : names.length >= 2 ? `${names[0]}和${names[1]}的聊天记录` : `${names[0] || ''}的聊天记录`;
  return { k: 'history', title, people, items };
}

/** 点开聊天记录：一页列表 */
export function historyPage(m) {
  const list = h('div', { class: 'hv-list' });
  const times = m.items.filter((x) => x.k === 'time').map((x) => x.t);
  if (times.length) {
    const day = (t) => { const d = new Date(t); return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`; };
    const a = day(times[0]), b = day(times[times.length - 1]);
    list.append(h('div', { class: 'hv-date', text: a === b ? a : `${a} 至 ${b}` }));
  }
  let lastT = null;
  for (const x of m.items) {
    if (x.k === 'time') { lastT = x.t; continue; }
    const p = m.people[x.p] || { name: '', av: {} };
    let content;
    if (x.k === 'text') content = h('div', { class: 'hv-text', text: x.text });
    else if (x.k === 'img' || x.k === 'sticker') {
      const img = h('img', { alt: '', class: x.k === 'sticker' ? 'hv-stk' : 'hv-img' });
      media.url(x.media).then((u) => { if (u) img.src = u; });
      content = img;
    } else content = h('div', { class: 'hv-text muted', text: itemText(x) });
    list.append(h('div', { class: 'hv-item' }, avatarEl(p, 's38'),
      h('div', { class: 'hv-main' }, h('div', { class: 'hv-top' }, h('span', { text: p.name }), lastT && h('time', { text: fmtTime(lastT) })), content)));
  }
  const el = h('section', { class: 'page hv' },
    h('header', { class: 'cnav solid white' },
      h('button', { class: 'nbtn back', 'aria-label': '返回', onclick: () => pop() }, h('span', { class: 'ic', html: I.back })),
      h('div', { class: 'ctitle' }, h('b', { text: m.title })),
      h('span', { class: 'nbtn' })),
    h('div', { class: 'groups' }, list));
  return { el };
}
