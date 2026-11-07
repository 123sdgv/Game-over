// 共用的状态、存档、事件、随机数。别的模块都从这里拿 G（这台电脑的一切）和 P（个性化）。
import { hub } from '../_shared/hub.js';

export const hb = hub('daemon');
export let S = hb.settings();
hb.onSettings((s) => { S = s; emit('settings', s); });

/* ─────────── 事件 ─────────── */
const handlers = {};
export function on(ev, fn) { (handlers[ev] ||= []).push(fn); return () => { handlers[ev] = handlers[ev].filter((f) => f !== fn); }; }
export function emit(ev, ...a) { for (const f of handlers[ev] || []) { try { f(...a); } catch (e) { console.error(e); } } }

/* ─────────── 随机 ─────────── */
export const rnd = (a = 1, b) => (b === undefined ? Math.random() * a : a + Math.random() * (b - a));
export const ri = (a, b) => Math.floor(rnd(a, b + 1));
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
export const chance = (p) => Math.random() < p;
export function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
export function weighted(list) {
  let t = 0;
  for (const it of list) t += Math.max(0, it.w);
  let r = Math.random() * t;
  for (const it of list) { r -= Math.max(0, it.w); if (r <= 0) return it; }
  return list[list.length - 1];
}
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/* ─────────── 个性化（控制面板里改的，「重置这台电脑」也不会清掉） ─────────── */
export const PREF_DEFAULT = {
  theme: 'classic', style: 'bevel', fontSize: 2, wall: 'teal', wallColor: '#2f7480', photo: false,
  term: 'blue', dname: 'daemon', uname: 'gray', crt: true, anim: true, modem: true,
};
export const P = { ...PREF_DEFAULT, ...hb.load('prefs', {}) };
export function setPref(k, v) {
  P[k] = v;
  hb.save('prefs', P);
  emit('prefs', k, v);
}

/* ─────────── 这台电脑 ─────────── */
export const G = {};
export const VERSION = 1;

let saveTimer = 0;
export function saveSoon(ms = 800) {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, ms);
}
export function saveNow() {
  clearTimeout(saveTimer);
  if (!G.v) return;
  emit('beforesave');
  hb.save('pc', G);
}
export function loadSaved() {
  const s = hb.load('pc', null);
  if (!s || s.v !== VERSION) return false;
  for (const k of Object.keys(G)) delete G[k];
  Object.assign(G, s);
  return true;
}
export function replaceG(obj) {
  for (const k of Object.keys(G)) delete G[k];
  Object.assign(G, obj);
}

/* ─────────── 记录 ─────────── */
export const ST = { day: 1, bestDay: 1, mischief: 0, fixed: 0, crashes: 0, talks: 0, praise: 0, kills: 0, oops: 0, played: 0, ...hb.stats() };
let stTimer = 0;
export function stat(k, d = 1) {
  ST[k] = (ST[k] || 0) + d;
  clearTimeout(stTimer);
  stTimer = setTimeout(() => hb.saveStats(ST), 600);
}
export function setStat(k, v) { ST[k] = v; clearTimeout(stTimer); stTimer = setTimeout(() => hb.saveStats(ST), 600); }

/* ─────────── 名字和小工具 ─────────── */
export const dn = () => (P.dname || 'daemon').trim() || 'daemon';
export const un = () => (P.uname || 'gray').trim() || 'gray';
/** 台词模板：{d} 它的名字 {u} 你的名字 {n} 第几天，其余从 vars 里拿 */
export function fill(s, vars = {}) {
  return String(s).replace(/\{(\w+)\}/g, (m, k) => {
    if (k === 'd') return dn();
    if (k === 'u') return un();
    if (k === 'n') return String(G.day || 1);
    return vars[k] != null ? String(vars[k]) : m;
  });
}
export const fmtMB = (kb) => (kb >= 1024 ? `${(kb / 1024).toFixed(kb >= 10240 ? 0 : 1)} MB` : `${Math.max(1, Math.round(kb))} KB`);
export const now = () => Date.now();
export function clockText(d = new Date()) {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** 运行时的小状态（不存档） */
export const RT = { typing: false, shellVisible: false, clicks: 0, dayT: 0 };

/** 改大厅设置页里的那些设置（控制面板里也能改） */
export function setSetting(k, v) {
  let cur = {};
  try { cur = JSON.parse(localStorage.getItem('pp.game.daemon.settings') || '{}') || {}; } catch {}
  cur[k] = v;
  try { localStorage.setItem('pp.game.daemon.settings', JSON.stringify(cur)); } catch {}
  S = hb.settings();
  emit('settings', S);
}
