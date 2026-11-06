// 共用状态：数据、存档、音效、几个查名字的小函数
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
export const person = (c, s) => (s === 'L' ? c.left : c.right || A.D.me);
export const pname = (c, s) => (person(c, s).name || '').trim() || (s === 'L' ? '对方' : '我');
const who = (c, s) => (s === 'R' ? '你' : `「${pname(c, 'L')}」`);

export function patText(c, m) {
  return m.from === m.to ? `${who(c, m.from)}拍了拍自己` : `${who(c, m.from)}拍了拍${who(c, m.to)}`;
}
export function recallText(c, m) { return `${who(c, m.s)}撤回了一条消息`; }

/** 一条消息的简短文字（列表预览、引用都用） */
export function snippet(c, m) {
  switch (m.k) {
    case 'text': return m.text.replace(/\s+/g, ' ');
    case 'img': return '[图片]';
    case 'voice': return `[语音] ${m.sec}″`;
    case 'sticker': return '[表情]';
    case 'sys': return m.text;
    case 'recall': return recallText(c, m);
    case 'pat': return patText(c, m);
    default: return '';
  }
}

/** 列表里显示的时间：最后一条时间标记，没有就用创建时间 */
export function storyTime(c) {
  for (let i = c.msgs.length - 1; i >= 0; i--) if (c.msgs[i].k === 'time') return c.msgs[i].t;
  return c.created;
}

export const unreadTotal = (exceptId) => A.D.chats.reduce((n, c) => n + (c.id === exceptId ? 0 : c.unread), 0);

// 音效：轻、短，不抢戏
export const sfx = {
  send() { sound.tone({ f: 560, to: 980, dur: 0.07, type: 'sine', vol: 0.12 }); sound.hiss({ f: 3200, to: 6000, dur: 0.05, filter: 'bandpass', q: 1.2, vol: 0.04 }); },
  recv() { sound.tone({ f: 880, dur: 0.12, type: 'triangle', vol: 0.09 }); sound.tone({ f: 1318, dur: 0.16, type: 'triangle', vol: 0.08, delay: 0.07 }); },
  tick() { sound.tone({ f: 1500, dur: 0.025, type: 'sine', vol: 0.06 }); },
  pop() { sound.tone({ f: 420, to: 640, dur: 0.06, type: 'sine', vol: 0.08 }); },
  pat() { sound.tone({ f: 190, to: 95, dur: 0.14, type: 'sine', vol: 0.22 }); sound.hiss({ f: 900, to: 300, dur: 0.08, filter: 'lowpass', vol: 0.06 }); },
  del() { sound.hiss({ f: 2400, to: 500, dur: 0.16, filter: 'bandpass', q: 0.8, vol: 0.07 }); },
};
