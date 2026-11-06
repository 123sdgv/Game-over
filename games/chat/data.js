// 数据结构和格式化（不碰界面）
//
// D = { v, me:{name, av}, chats:[...], stickers:[{id,w,h}], theme:'auto'|'light'|'dark', wall }
// chat = { id, left:{name, av}, right:null|{name, av}, sub, wall:null|墙纸, pin, unread, draft, spk:'L'|'R', msgs:[...], created, updated }
//   right 是 null 时跟着「我」的资料走
// av = { img: dataURL } 或 { c: 颜色序号 }（文字头像，字取名字第一个字）
// 墙纸 = 'none' | 'mist' | ... | { img: 媒体 id }
// 消息 m.k：
//   text    { s, text, q?, fail? }          q = 引用 { id, s, t }
//   img     { s, media, w, h, q?, fail? }
//   voice   { s, sec, text?, showText?, heard?, q?, fail? }
//   sticker { s, media, w, h, q? }
//   time    { t }
//   sys     { text }
//   recall  { s, orig }
//   pat     { from, to }

export const uid = () => Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);

export const PALETTE = [
  ['#5E98FF', '#2D69F0'], ['#45D0BB', '#14A08C'], ['#FFB05C', '#F2781D'], ['#FF8CB2', '#EA4C80'],
  ['#B39AFF', '#7856EF'], ['#79D891', '#33AC54'], ['#B2BAC6', '#7B8596'], ['#FF8A78', '#E9493A'],
];

export function hashColor(s) {
  let h = 7;
  for (const ch of String(s || '')) h = (h * 31 + ch.codePointAt(0)) | 0;
  return Math.abs(h) % PALETTE.length;
}

export function initial(name) {
  const c = Array.from(String(name || '').trim())[0] || '?';
  return /[a-z]/i.test(c) ? c.toUpperCase() : c;
}

export function blank() {
  return { v: 1, me: { name: '我', av: { c: 0 } }, chats: [], stickers: [], theme: 'auto', wall: 'none' };
}

export function makeChat(left) {
  const now = Date.now();
  return {
    id: uid(), left, right: null, sub: '', wall: null, pin: false, unread: 0, draft: '', spk: 'R',
    msgs: [], created: now, updated: now,
  };
}

/** 读档后补齐字段，坏掉的消息丢掉 */
export function repair(D) {
  if (!D || typeof D !== 'object' || D.v !== 1 || !Array.isArray(D.chats)) return blank();
  D.me = D.me && typeof D.me === 'object' ? D.me : { name: '我', av: { c: 0 } };
  D.me.av ||= { c: 0 };
  D.stickers = Array.isArray(D.stickers) ? D.stickers.filter((s) => s && s.id) : [];
  if (!['auto', 'light', 'dark'].includes(D.theme)) D.theme = 'auto';
  D.wall ||= 'none';
  const KINDS = ['text', 'img', 'voice', 'sticker', 'time', 'sys', 'recall', 'pat'];
  D.chats = D.chats.filter((c) => c && c.id && c.left).map((c) => {
    c.left.av ||= {};
    c.msgs = Array.isArray(c.msgs) ? c.msgs.filter((m) => m && m.id && KINDS.includes(m.k)) : [];
    c.spk = c.spk === 'L' ? 'L' : 'R';
    c.unread = Math.max(0, c.unread | 0);
    c.draft = typeof c.draft === 'string' ? c.draft : '';
    c.created ||= Date.now();
    c.updated ||= c.created;
    return c;
  });
  return D;
}

export const WEEK = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
const pad = (n) => String(n).padStart(2, '0');
const dayStart = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };

/** 聊天里的时间：今天 21:30 / 昨天 21:30 / 星期三 21:30 / 3月4日 21:30 / 2025年3月4日 21:30；short 是列表里用的 */
export function fmtTime(t, short = false, now = Date.now()) {
  const d = new Date(t), n = new Date(now);
  const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const diff = Math.round((dayStart(now) - dayStart(t)) / 864e5);
  if (diff === 0) return hm;
  if (diff === 1) return short ? '昨天' : `昨天 ${hm}`;
  if (diff > 1 && diff < 7) return short ? WEEK[d.getDay()] : `${WEEK[d.getDay()]} ${hm}`;
  const md = `${d.getMonth() + 1}月${d.getDate()}日`;
  if (d.getFullYear() === n.getFullYear()) return short ? md : `${md} ${hm}`;
  return short ? `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}` : `${d.getFullYear()}年${md} ${hm}`;
}

export const dateValue = (t) => { const d = new Date(t); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
export const timeValue = (t) => { const d = new Date(t); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
export function fromInputs(date, time, fallback) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date || ''), k = /^(\d{2}):(\d{2})/.exec(time || '');
  if (!m || !k) return fallback;
  return new Date(+m[1], +m[2] - 1, +m[3], +k[1], +k[2]).getTime();
}
