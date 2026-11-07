// 规则：线索、推理、想法、提示、陆续冒出来的消息。不碰界面，只发事件。
import { S, save, emit, gameMin, clock, playMin, minutesSince } from './state.js';
import { CLUES, QUESTIONS, CONCLUSIONS, HINTS, PASS, ENDINGS, ENDING_OF, CHOICES } from './story.js';
import { CHATS, LIVE } from './chats.js';

// ── 线索 ──
export const hasClue = (id) => S.clues[id] != null;
export function addClue(id) {
  if (!id || !CLUES[id] || hasClue(id)) return false;
  S.clues[id] = Object.keys(S.clues).length + 1;
  S.fresh.push(id);
  save();
  emit('clue', id);
  checkConclusions();
  return true;
}
export const clueList = () => Object.keys(S.clues).sort((a, b) => S.clues[a] - S.clues[b]);
export const TOTAL_CLUES = Object.keys(CLUES).length;

// ── 推理 ──
export const solved = (qid) => !!S.deds[qid];
export function questionVisible(q) {
  if (q.need && !q.need.every(solved)) return false;
  return [...q.a, ...q.b].some(hasClue);
}
export const visibleQuestions = () => QUESTIONS.filter((q) => solved(q.id) || questionVisible(q));
export function tryDeduce(qid, x, y) {
  const q = QUESTIONS.find((v) => v.id === qid);
  if (!q || solved(qid)) return false;
  const ok = (q.a.includes(x) && q.b.includes(y)) || (q.a.includes(y) && q.b.includes(x));
  if (!ok) return false;
  S.deds[qid] = true;
  save();
  emit('deduce', qid);
  checkConclusions();
  return true;
}
export const solvedCount = () => Object.keys(S.deds).length;

// ── 想法（结论） ──
const d = solved;
const RULES = {
  c1: () => hasClue('mom_dali') && hasClue('cy_cold'),
  c2: () => d('D3') && (d('D1') || d('D2')),
  c3: () => S.concl.c2 && d('D4') && hasClue('money_in'),
  c4: () => S.concl.c2 && d('D5') && ['D6', 'D7', 'D8'].filter(d).length >= 2,
  c5: () => S.concl.c4 && d('D9') && d('D10'),
};
export function checkConclusions() {
  let added = false;
  for (const id of Object.keys(RULES)) {
    if (!S.concl[id] && RULES[id]()) {
      S.concl[id] = true;
      S.freshConcl.push(id);
      added = true;
      emit('conclusion', id);
    }
  }
  if (added) save();
}
export const conclusionList = () => Object.keys(CONCLUSIONS).filter((c) => S.concl[c]);
export const deepest = () => conclusionList().pop() || null;

// ── 密码 ──
const norm = (v) => String(v || '').trim().toLowerCase().replace(/\s+/g, '');
export const checkPass = (kind, v) => PASS[kind].some((p) => norm(p) === norm(v));
export function unlock(flag) {
  if (S.flags[flag] != null) return;
  S.flags[flag] = S.playMs;
  save();
  emit('unlock', flag);
}
export const unlocked = (flag) => S.flags[flag] != null;

// ── 提示：第一件还没做到的事 ──
const STAGES = [
  ['unlock', () => unlocked('phone')],
  ['c1', () => !!S.concl.c1],
  ['D12', () => d('D1') || d('D2')],
  ['notes', () => unlocked('notes')],
  ['D3', () => d('D3')],
  ['echo', () => unlocked('echo')],
  ['D4', () => d('D4')],
  ['D5', () => d('D5')],
  ['c4', () => !!S.concl.c4],
  ['key', () => unlocked('key')],
  ['c5', () => !!S.concl.c5],
  ['end', () => false],
];
export const stage = () => STAGES.find(([, done]) => !done())[0];
export function hintFor(st = stage()) {
  const tier = S.hints.tier[st] || 0;
  return { stage: st, tier, lines: HINTS[st].slice(0, tier) };
}
export function moreHint(st) {
  const cur = S.hints.tier[st] || 0;
  if (cur >= HINTS[st].length) return;
  S.hints.tier[st] = cur + 1;
  if (st !== 'end') S.hints.used++;
  save();
}

// ── 聊天：固定的记录 + 玩的时候冒出来的 ──
export function messagesOf(chatId) {
  const c = CHATS.find((x) => x.id === chatId);
  const out = c.msgs.slice();
  const live = LIVE.filter((l) => l.chat === chatId && S.live[l.id]).map((l) => ({ ...l.msg, t: S.live[l.id], live: true }));
  live.sort((a, b) => a.t.localeCompare(b.t));
  return out.concat(live);
}
export const lastMsg = (chatId) => { const m = messagesOf(chatId); return m[m.length - 1]; };
export function unreadOf(chatId) {
  const all = messagesOf(chatId);
  const fresh = (m) => !m.me && !m.sys && !m.call;
  if (S.read[chatId] != null) return all.slice(S.read[chatId]).filter(fresh).length;
  const c = CHATS.find((x) => x.id === chatId);
  return (c.unread || 0) + all.filter((m) => m.live && fresh(m)).length;
}
export function markRead(chatId) {
  const n = messagesOf(chatId).length;
  if (S.read[chatId] !== n) { S.read[chatId] = n; save(); emit('read', chatId); }
}
export const totalUnread = () => CHATS.reduce((n, c) => n + unreadOf(c.id), 0);

/** 每秒看一下有没有该冒出来的消息 */
export function pumpLive() {
  const pm = playMin(), gm = gameMin();
  for (const l of LIVE) {
    if (S.live[l.id]) continue;
    let due = false;
    if (l.at != null) due = pm >= l.at;
    else if (l.clock != null) due = gm >= l.clock;
    else if (l.after) due = minutesSince(l.after[0]) >= l.after[1];
    if (!due) continue;
    S.live[l.id] = clock().stamp;
    save();
    emit('live', l);
  }
}

// ── 结局 ──
export const choicesFor = (c) => CHOICES[c] || [];
export function endingText(choice, concl) {
  const e = ENDINGS[ENDING_OF[choice]];
  return e[concl] || (concl !== 'c1' && e.deep) || e.c4 || e.c2 || e.c1;
}
export { ENDING_OF };
