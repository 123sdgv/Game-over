// 共用状态：数据、存档、音效、查名字、消息摘要
import { hub } from '../_shared/hub.js';
import { sound } from '../_shared/sound.js';
import { repair } from './data.js';
import { toast } from './ui.js';

export const hb = hub('chat');
export const A = { S: hb.settings(), D: repair(hb.load('data', null)) };
sound.enabled = A.S.sound;
hb.onSettings((s) => { A.S = s; sound.enabled = s.sound; });

const KEY = 'pp.game.chat.data';
let timer = 0, warned = false;
export function save() { clearTimeout(timer); timer = setTimeout(flush, 300); }
export function flush() {
  clearTimeout(timer);
  try { localStorage.setItem(KEY, JSON.stringify(A.D)); warned = false; }
  catch {
    if (!warned) toast('存储空间满了，最近的改动没存上');
    warned = true;
  }
}
addEventListener('pagehide', flush);
hb.onPause(flush);

export function bump(key, n = 1) {
  const st = hb.stats();
  st[key] = (st[key] || 0) + n;
  st.chats = A.D.chats.length;
  hb.saveStats(st);
}
export function syncStats() {
  const st = hb.stats();
  st.chats = A.D.chats.length;
  hb.saveStats(st);
}

export const chatById = (id) => A.D.chats.find((c) => c.id === id);
export const isGroup = (c) => c && c.type === 'group';

/** 某一边、某个成员是谁 */
export function personOf(c, s, who) {
  if (s === 'R') return c.right || A.D.me;
  if (isGroup(c)) return c.members.find((x) => x.id === who) || c.members[0] || { name: '群成员', av: {} };
  return c.left;
}
export const nameOf = (c, s, who) => (personOf(c, s, who).name || '').trim() || (s === 'R' ? '我' : isGroup(c) ? '群成员' : '对方');
/** 列表和标题里的名字：单聊是对方备注，群聊是群名 */
export const pname = (c, s = 'L') => (s === 'R' ? nameOf(c, 'R') : (c.left.name || '').trim() || (isGroup(c) ? '群聊' : '对方'));
export const person = (c, s, who) => personOf(c, s, who);
/** 消息是谁发的 */
export const sender = (c, m) => personOf(c, m.s, m.who);
const whoText = (c, s, who) => (s === 'R' ? '你' : `「${nameOf(c, s, who)}」`);

export function patText(c, m) {
  const same = m.from === m.to && (m.from === 'R' || m.fromWho === m.toWho || !isGroup(c));
  return same ? `${whoText(c, m.from, m.fromWho)}拍了拍自己` : `${whoText(c, m.from, m.fromWho)}拍了拍${whoText(c, m.to, m.toWho)}`;
}
export const recallText = (c, m) => `${whoText(c, m.s, m.who)}撤回了一条消息`;
export function rpText(c, m) {
  const by = whoText(c, m.by, m.byWho), of = m.of === m.by && m.ofWho === m.byWho ? '自己' : whoText(c, m.of, m.ofWho);
  return `${by}领取了${of}的红包`;
}

export const money = (v) => { const n = Number(v); return Number.isFinite(n) ? n.toFixed(2) : '0.00'; };
export const fmtDur = (sec) => `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;

/** 通话那一行字（按谁打的来说） */
export function callText(m) {
  if (m.res === 'done') return `通话时长 ${fmtDur(m.dur || 0)}`;
  const mine = m.s === 'R';
  return {
    cancel: mine ? '已取消' : '对方已取消',
    reject: mine ? '对方已拒绝' : '已拒绝',
    noanswer: mine ? '对方无应答' : '未接听',
    busy: mine ? '对方忙线中' : '忙线未接听',
  }[m.res] || '已取消';
}

/** 一条消息的简短文字（列表预览、转发都用） */
export function snippet(c, m) {
  switch (m.k) {
    case 'text': return m.text.replace(/\s+/g, ' ');
    case 'img': return '[图片]';
    case 'voice': return `[语音] ${m.sec}″`;
    case 'sticker': return '[表情]';
    case 'redpacket': return `[红包] ${m.text || '恭喜发财，大吉大利'}`;
    case 'transfer': return m.receipt ? `[转账] ${m.receipt === 'back' ? '已退还' : '已收款'}` : `[转账] ¥${money(m.amount)}`;
    case 'link': return `[链接] ${m.title || m.url || ''}`;
    case 'call': return m.video ? '[视频通话]' : '[语音通话]';
    case 'history': return '[聊天记录]';
    case 'sys': return m.text;
    case 'recall': return recallText(c, m);
    case 'pat': return patText(c, m);
    case 'rpnote': return rpText(c, m);
    default: return '';
  }
}

/** 列表里显示的时间：最后一条时间标记，没有就用创建时间 */
export function storyTime(c) {
  for (let i = c.msgs.length - 1; i >= 0; i--) if (c.msgs[i].k === 'time') return c.msgs[i].t;
  return c.created;
}

export const unreadTotal = (exceptId) => A.D.chats.reduce((n, c) => n + (c.id === exceptId ? 0 : c.unread), 0);

/** 这张图还有没有人在用（消息、引用、转发的聊天记录、表情、背景） */
export function mediaUsed(id) {
  if (!id) return false;
  if (A.D.stickers.some((s) => s.id === id)) return true;
  if (A.D.wall && A.D.wall.img === id) return true;
  const inMsg = (m) => {
    if (!m) return false;
    if (m.media === id || m.cover === id) return true;
    if (m.q && m.q.media === id) return true;
    if (m.k === 'recall') return inMsg(m.orig);
    if (m.k === 'history') return m.items.some(inMsg);
    return false;
  };
  return A.D.chats.some((c) => (c.wall && c.wall.img === id) || c.msgs.some(inMsg));
}

// 音效：轻、短，不抢戏
export const sfx = {
  send() { sound.tone({ f: 560, to: 980, dur: 0.07, type: 'sine', vol: 0.12 }); sound.hiss({ f: 3200, to: 6000, dur: 0.05, filter: 'bandpass', q: 1.2, vol: 0.04 }); },
  recv() { sound.tone({ f: 880, dur: 0.12, type: 'triangle', vol: 0.09 }); sound.tone({ f: 1318, dur: 0.16, type: 'triangle', vol: 0.08, delay: 0.07 }); },
  tick() { sound.tone({ f: 1500, dur: 0.025, type: 'sine', vol: 0.06 }); },
  pop() { sound.tone({ f: 420, to: 640, dur: 0.06, type: 'sine', vol: 0.08 }); },
  pat() { sound.tone({ f: 190, to: 95, dur: 0.14, type: 'sine', vol: 0.22 }); sound.hiss({ f: 900, to: 300, dur: 0.08, filter: 'lowpass', vol: 0.06 }); },
  del() { sound.hiss({ f: 2400, to: 500, dur: 0.16, filter: 'bandpass', q: 0.8, vol: 0.07 }); },
  coin() { sound.arp([1046, 1318, 1568, 2093], { gap: 0.06, dur: 0.14, type: 'triangle', vol: 0.09 }); },
  open() { sound.hiss({ f: 1800, to: 400, dur: 0.22, filter: 'bandpass', q: 0.7, vol: 0.08 }); sound.tone({ f: 660, to: 1320, dur: 0.18, type: 'sine', vol: 0.08 }); },
};
