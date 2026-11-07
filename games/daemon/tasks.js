// 今日维护单：每天几件事。全划掉了才能关机下班。
import { G, emit, on, pick, ri, chance, dn, saveSoon, fmtMB } from './state.js';
import * as fs from './fs.js';
import { M } from './machine.js';
import { newWorkMail, junkMail } from './apps/mail.js';
import { PEOPLE } from './content.js';
import { h, gesture } from './os.js';
import { sfx } from './sfx.js';

const name = (k) => (PEOPLE[k] ? PEOPLE[k].name : k);
let seq = 1;
const T = (k, text, p = {}, by = 'sys') => ({ id: `t${Date.now().toString(36)}${seq++}`, k, text, p, by, ok: false });

/** 现在做到没有 */
function status(t) {
  const p = t.p;
  switch (t.k) {
    case 'reply': case 'explain': { const m = G.mail.list.find((x) => x.id === p.mail); return !m || !!m.replied; }
    case 'archive': return p.files.every((id) => { const n = fs.node(id); return !n || (n.p === n.want); });
    case 'disk': return fs.freeC() >= p.mb * 1024;
    case 'bin': return fs.kids('bin').length === 0;
    case 'send': return !!t.done || !srcExists(p.file);
    case 'backup': return fs.kids('A').some((n) => n.src === p.file || n.n === p.name) || !fs.node(p.file);
    case 'talk': return (G.d.talkToday || 0) >= p.k;
    case 'mem': return M.ramPct * 100 <= p.pct;
    default: return true;
  }
}
/** 文件被彻底删了（连副本都没了）：这件事就做不成了，算了 */
const srcExists = (id) => !!fs.node(id) || Object.values(G.fs.nodes).some((n) => n.src === id && n.p !== 'bin');
const LATCH = new Set(['reply', 'explain', 'send', 'talk']);

/** 新的一天：来信、下载、临时文件，然后列维护单 */
export function newDay() {
  const day = G.day;
  G.tasks = [];
  const used = [];
  const m1 = newWorkMail();
  used.push(m1.tpl);
  G.tasks.push(T('reply', `回复${name(m1.from)}的邮件「${m1.sub}」`, { mail: m1.id }));
  if (day >= 3 && chance(0.5)) {
    const m2 = newWorkMail(used);
    G.tasks.push(T('reply', `回复${name(m2.from)}的邮件「${m2.sub}」`, { mail: m2.id }));
  }
  if (chance(0.55)) junkMail();
  const files = fs.spawnDownloads(day === 1 ? 2 : ri(2, 4));
  G.tasks.push(T('archive', `把「下载」里 ${files.length} 个新文件放进对应的文件夹`, { files: files.map((f) => f.id) }));
  if (day > 1) fs.spawnTemp(ri(3, 6));

  const extra = day === 1 ? 0 : Math.min(3, 1 + Math.floor((day - 2) / 2));
  const pool = [];
  pool.push({ k: 'disk', w: 1.2 });
  if (fs.kids('work').some((f) => f.t === 'f')) pool.push({ k: 'send', w: 1 });
  if ([...fs.kids('work'), ...fs.kids('pics')].some((f) => f.t === 'f' && f.kb <= 1300)) pool.push({ k: 'backup', w: 0.9 });
  if (fs.kids('bin').length) pool.push({ k: 'bin', w: 0.7 });
  if (day >= 4) pool.push({ k: 'mem', w: 0.4 });
  for (let i = 0; i < extra && pool.length; i++) {
    let tot = 0; for (const x of pool) tot += x.w;
    let r = Math.random() * tot, pickd = pool[0];
    for (const x of pool) { r -= x.w; if (r <= 0) { pickd = x; break; } }
    pool.splice(pool.indexOf(pickd), 1);
    const t = make(pickd.k);
    if (t) G.tasks.push(t);
  }
  G.today = { mis: 0, fixed: 0, crashes: 0, talks: 0, praise: 0, jobs: 0, start: Date.now() };
  G.d.talkToday = 0;
  G.d.addedTask = false;
  check(true);
  emit('tasks');
  saveSoon();
}

function make(k) {
  if (k === 'disk') {
    const free = fs.freeC();
    const junk = Object.values(G.fs.nodes).filter((n) => n.p === 'temp' && n.ext === 'tmp').reduce((a, n) => a + n.kb, 0);
    const mb = Math.floor((free + junk * 0.7) / 1024 / 50) * 50;
    if (mb * 1024 <= free + 40 * 1024) return null;
    return T('disk', `让 C 盘剩余空间超过 ${mb} MB（回收站也占地方）`, { mb });
  }
  if (k === 'send') {
    const f = pick(fs.kids('work').filter((x) => x.t === 'f'));
    const to = pick(['li', 'boss', 'zhou']);
    return T('send', `把「${f.n}」发给${name(to)}`, { file: f.id, to, name: f.n });
  }
  if (k === 'backup') {
    const f = pick([...fs.kids('work'), ...fs.kids('pics')].filter((x) => x.t === 'f' && x.kb <= 1300));
    return T('backup', `把「${f.n}」备份到软盘 A:`, { file: f.id, name: f.n });
  }
  if (k === 'bin') return T('bin', '清空回收站');
  if (k === 'mem') return T('mem', '把内存占用降到 60% 以下', { pct: 60 });
  return null;
}

/** 它自己往便签上加一行 */
export function addDaemonTask() {
  if (G.d.addedTask) return false;
  G.d.addedTask = true;
  const k = G.day === 1 ? 3 : ri(3, 5);
  G.tasks.push(T('talk', `陪我说 ${k} 句话`, { k }, 'daemon'));
  check();
  emit('tasks');
  saveSoon();
  return true;
}
/** 它闯祸发出去的信：得去解释 */
export function addExplain(mail) {
  G.tasks.push(T('explain', `跟${name(mail.from)}解释一下那封邮件`, { mail: mail.id }));
  check();
  emit('tasks');
  saveSoon();
}

/** 发信以后：看看是不是维护单上要发的 */
on('mail:sent', (m) => {
  for (const t of G.tasks || []) if (t.k === 'send' && !t.done && m.to === t.p.to && m.attSrc && (m.attSrc === t.p.file || (fs.node(m.attSrc) && fs.node(m.attSrc).src === t.p.file))) t.done = true;
  check();
});

let lastSig = '';
export function check(silent = false) {
  if (!G.tasks) return;
  let changed = false;
  for (const t of G.tasks) {
    const was = t.ok;
    let ok = status(t);
    if (LATCH.has(t.k) && t.ok) ok = true;
    t.ok = ok;
    if (ok !== was) {
      changed = true;
      if (!silent) {
        if (ok) { sfx.check(); emit('task:done', t); }
        else { sfx.uncheck(); emit('task:undone', t); }
      }
    }
  }
  const sig = G.tasks.map((t) => `${t.id}${t.ok ? 1 : 0}`).join();
  if (changed || sig !== lastSig) { lastSig = sig; renderNote(); saveSoon(); }
}
export const allDone = () => (G.tasks || []).every((t) => t.ok);
export const left = () => (G.tasks || []).filter((t) => !t.ok);

/* ─────────── 便签 ─────────── */
const noteEl = document.getElementById('note');
function fillNote(el, flashId) {
  el.innerHTML = '';
  const done = G.tasks.filter((t) => t.ok).length;
  el.append(h('h4', null, `今日维护单`, h('small', { text: `第 ${G.day} 天` })));
  const ul = h('ul');
  for (const t of G.tasks) {
    const li = h('li', { class: [t.ok ? 'done' : '', t.by === 'daemon' ? 'dm' : '', t.id === flashId ? 'flash' : ''].join(' ') }, h('i'), h('span', { text: t.text }));
    ul.append(li);
  }
  el.append(ul, h('div.foot', { text: done === G.tasks.length ? '都做完了！从「开始」关机下班。' : `还有 ${G.tasks.length - done} 件。做完从「开始」关机。` }));
}
export function renderNote(flashId) {
  if (!G.tasks) return;
  noteEl.hidden = !!G.desk.noteHidden;
  fillNote(noteEl, flashId);
  noteEl.classList.toggle('min', !!G.desk.noteMin);
  const pop = document.getElementById('todoPop');
  if (!pop.hidden) { pop.innerHTML = ''; const c = h('div'); c.id = 'noteCopy'; fillNote(c); pop.append(c); }
  const done = G.tasks.filter((t) => t.ok).length;
  document.getElementById('todoTxt').textContent = `${done}/${G.tasks.length}`;
  document.getElementById('todo').classList.toggle('alldone', done === G.tasks.length);
}
document.getElementById('todo').addEventListener('click', () => {
  const pop = document.getElementById('todoPop');
  pop.hidden = !pop.hidden;
  sfx.click();
  if (!pop.hidden) { pop.innerHTML = ''; const c = h('div'); c.id = 'noteCopy'; fillNote(c); pop.append(c); }
});
// 点便签：收起 / 展开；拖它挪地方
gesture(noteEl, {
  tap: () => { G.desk.noteMin = !G.desk.noteMin; noteEl.classList.toggle('min', G.desk.noteMin); sfx.click(); saveSoon(); },
  drag: {
    move: (g, dx, dy) => {
      const r = noteEl.parentElement.getBoundingClientRect();
      const x = (parseFloat(noteEl.style.right) || 10) - dx, y = (parseFloat(noteEl.style.top) || 8) + dy;
      noteEl.style.right = `${Math.max(-60, x)}px`; noteEl.style.top = `${Math.max(0, y)}px`;
    },
    end: () => { G.desk.notePos = { r: parseFloat(noteEl.style.right), t: parseFloat(noteEl.style.top) }; saveSoon(); },
  },
});
export function placeNote() {
  const p = G.desk.notePos;
  if (p) { noteEl.style.right = `${p.r}px`; noteEl.style.top = `${p.t}px`; }
}
