// 它：一个萌萌的、热心的、欲求不满的守护进程。想要值一直在涨，没人理就自己找事干。
import { G, P, S, RT, emit, on, pick, chance, rnd, ri, fill, dn, un, stat, saveSoon, clamp } from './state.js';
import * as L from './lines.js';
import * as MIS from './mischief.js';
import * as fs from './fs.js';
import { spawn, has, procs, kill, M } from './machine.js';
import { open, find, balloon, os } from './os.js';
import { sendDirect, outboxPending } from './apps/mail.js';
import { PEOPLE } from './content.js';
import * as tasks from './tasks.js';

export function newDaemon() {
  return { want: 12, mood: 'ok', moodT: 0, alive: true, deadT: 0, ask: null, quietT: 0, idleT: 0, praiseHeat: 0, careful: 0, eager: 0, boost: 0, misCd: 30, talkToday: 0, recent: [], job: null, intro: false, seen: {} };
}
const D = () => G.d;
const pname = (k) => (PEOPLE[k] ? PEOPLE[k].name : k);

/* ─────────── 往终端里写 ─────────── */
function push(entries, { notify = true } = {}) {
  if (!entries.length) return;
  G.term.push(...entries);
  if (G.term.length > 160) G.term.splice(0, G.term.length - 160);
  emit('term', entries);
  D().quietT = 0;
  const sw = find('shell');
  RT.shellVisible = !!sw && !sw.min;
  if (notify && !RT.shellVisible) {
    const first = entries.find((e) => e.k === 'd');
    if (first) {
      balloon(dn(), first.t.length > 40 ? `${first.t.slice(0, 40)}…` : first.t, () => open('shell'), 7000);
      document.getElementById('trayD').classList.add('ping');
      const w = find('shell');
      w && w.flash();
    }
  }
  saveSoon();
}
const dl = (lines, v = {}) => lines.map((t) => ({ k: 'd', t: fill(t, v) }));
const logl = (rows, v = {}) => rows.flatMap(([f, a, sub]) => [{ k: 'log', f, a: fill(a, v) }, ...(sub ? [{ k: 'sub', t: fill(sub, v) }] : [])]);
export const sys = (t, k = 'sys') => push([{ k, t }], { notify: false });
export function say(lines, v, o) { push(dl(lines, v), o); }

/* ─────────── 心情、想要 ─────────── */
function setMood(m, t = 90) { D().mood = m; D().moodT = t; emit('daemon'); }
function addWant(x) { D().want = clamp(D().want + x, 0, 100); emit('daemon'); }
function fx(f = {}) {
  if (f.want) addWant(f.want);
  if (f.mood) setMood(f.mood);
  if (f.careful) { D().careful = Math.max(D().careful, f.careful); D().eager = 0; }
  if (f.eager) { D().eager = Math.max(D().eager, f.eager); D().careful = 0; }
  if (f.boost) D().boost = f.boost;
  if (f.act === 'job') setTimeout(() => autoJob(), 1600);
  if (f.act === 'loop') setTimeout(() => mischief('loop', true), 1400);
}
function vars() {
  const w = os.wins.filter((x) => x.focused)[0];
  const app = w ? (w.app === 'mail' ? '邮件' : w.app === 'explorer' ? '我的电脑' : w.app === 'taskmgr' ? '任务管理器' : w.app === 'control' ? '控制面板' : '别的窗口') : '桌面';
  return { idle: Math.round(D().idleT), app, clicks: RT.clicks, cpu: Math.round(M.cpu), kb: 1024 + Math.round(D().want * 37) };
}

/* ─────────── 命令（终端下面那排按钮） ─────────── */
const JOBS = {
  disk: { c: 'Start-Job Clear-Disk', l: '清理磁盘', can: () => true },
  sort: { c: 'Start-Job Sort-Downloads', l: '整理下载', can: () => fs.kids('dl').some((n) => n.want && n.p !== n.want) },
  reply: { c: 'Start-Job Reply-Mail', l: '帮我回邮件', can: () => G.mail.list.some((m) => m.box === 'in' && m.need && !m.replied) },
  send: { c: 'Start-Job Send-File', l: '帮我发文件', can: () => (G.tasks || []).some((t) => t.k === 'send' && !t.ok) },
  backup: { c: 'Start-Job Backup-ToA', l: '备份到软盘', can: () => (G.tasks || []).some((t) => t.k === 'backup' && !t.ok) },
  mem: { c: 'Start-Job Free-Memory', l: '释放内存', can: () => M.ramPct > 0.45 || procs('cache').length || procs('loop').length },
  bin: { c: 'Start-Job Clear-RecycleBin', l: '清空回收站', can: () => fs.kids('bin').length > 0 },
};
export function commands(menu) {
  const d = D();
  if (!d.alive) return [{ id: 'restart', c: 'Start-Process daemon', l: '把它叫回来' }, { id: 'clear', c: 'Clear-Host', l: '清屏' }];
  if (menu === 'job') {
    const list = Object.entries(JOBS).filter(([, j]) => j.can()).map(([k, j]) => ({ id: `job:${k}`, c: j.c, l: j.l }));
    return [...list, { id: 'back', c: '←', l: '返回', back: true }];
  }
  if (menu === 'talk') {
    if (!d.talkPick || d.talkPick.t < G.t - 30) d.talkPick = { t: G.t, ids: shufflePick(L.TALK.length, 4) };
    return [...d.talkPick.ids.map((i) => ({ id: `talk:${i}`, c: L.TALK[i].c, l: L.TALK[i].l })), { id: 'back', c: '←', l: '返回', back: true }];
  }
  const out = [];
  if (d.ask) d.ask.opts.forEach((o, i) => out.push({ id: `ask:${i}`, c: fill(o.c), l: o.l, ask: true }));
  out.push({ id: 'status', c: 'Get-Status', l: '它在干嘛' }, { id: 'praise', c: 'Invoke-Praise', l: '夸夸它' }, { id: 'job', c: 'Start-Job …', l: '交给它做', sub: 'job' }, { id: 'talk', c: 'Write-Host …', l: '跟它说', sub: 'talk' }, { id: 'clear', c: 'Clear-Host', l: '清屏' });
  return out;
}
function shufflePick(n, k) { const a = [...Array(n).keys()]; for (let i = n - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a.slice(0, k); }

/** 你敲了一条命令（终端已经把命令打出来了） */
export function exec(cmd) {
  const d = D();
  d.idleT = 0;
  document.getElementById('trayD').classList.remove('ping');
  if (cmd.id === 'clear') { G.term = []; emit('term:clear'); return; }
  if (cmd.id === 'restart') { respawn(true); return; }
  if (!d.alive) { sys(`daemon.exe 没有在运行。`, 'bad'); return; }
  const counts = () => { d.talkToday = (d.talkToday || 0) + 1; G.today.talks = (G.today.talks || 0) + 1; stat('talks'); tasks.check(); };

  if (cmd.id.startsWith('ask:')) {
    const o = d.ask && d.ask.opts[+cmd.id.slice(4)];
    const wasIntro = d.ask && d.ask.intro;
    d.ask = null;
    if (!o) return;
    counts();
    if (o.clear) { G.term = []; emit('term:clear'); }
    if (o.go === 'job') { emit('shell:menu', 'job'); say(['你选。']); return; }
    say(o.r, vars());
    fx(o.fx);
    if (wasIntro) { d.intro = true; setTimeout(() => afterIntro(), 2600); }
    return;
  }
  if (d.ask) { d.ask = null; }
  if (cmd.id === 'status') { counts(); status(); addWant(-5); return; }
  if (cmd.id === 'praise') {
    counts(); stat('praise'); G.today.praise = (G.today.praise || 0) + 1;
    d.praiseHeat += 1;
    const k = G.today.praise;
    if (d.praiseHeat > 3) say(pick(L.PRAISE_MANY), { k });
    else say(pick(L.PRAISE));
    addWant(-26 * Math.pow(0.62, Math.max(0, d.praiseHeat - 1)));
    setMood('happy', 70);
    return;
  }
  if (cmd.id.startsWith('talk:')) {
    const t = L.TALK[+cmd.id.slice(5)];
    counts();
    if (t.l === '别闹了' && !G.messes.length) say(['我没闹啊。', '……我现在很乖的。']);
    else say(t.r);
    fx(t.fx);
    return;
  }
  if (cmd.id.startsWith('job:')) { counts(); startJob(cmd.id.slice(4)); return; }
}

/* ─────────── 它在干嘛 ─────────── */
function status() {
  const d = D();
  const moodTxt = { ok: '还行', happy: '开心', sulky: '有点闹别扭' }[d.mood];
  const rows = [{ k: 'd', t: '现在的我：' }, { k: 'log', kv: 1, f: 'want', a: `= ${Math.round(d.want)}%` }, { k: 'log', kv: 1, f: 'mood', a: `= ${moodTxt}` }];
  if (d.careful > 0) rows.push({ k: 'log', kv: 1, f: 'careful', a: '= true' });
  if (d.eager > 0) rows.push({ k: 'log', kv: 1, f: 'eager', a: '= true' });
  const where = {
    fonts: () => (fs.node('fonts') ? 'C:\\WINDOWS\\FONTS 在回收站里' : 'FONTS 被彻底删了（控制面板能重装）'),
    system: () => 'C:\\WINDOWS\\SYSTEM 在回收站里！',
    loop: () => 'loop_for_you.exe 还在跑（任务管理器）',
    mem: () => `cache_for_you.exe × ${procs('cache').length} 还在跑`,
    log: () => 'heartbeat.exe 还在写日志',
    print: () => `打印机还剩 ${G.print ? G.print.left : 0} 页`,
    popups: () => '桌面上还有我开的窗口',
    wallpaper: () => '壁纸是我画的（控制面板能换）',
    icons: () => '桌面图标是爱心形状（长按桌面能排列）',
    tidy: () => '「我的文档\\按我喜欢的顺序」里有你的文件',
    mail: () => '发件箱里有我写的信，快到时间了',
  };
  if (G.messes.length) {
    rows.push({ k: 'd', t: '我刚才动过的：' });
    for (const m of G.messes) rows.push({ k: 'log', kv: 1, f: m.k, a: (where[m.k] || (() => '?'))() });
  } else rows.push({ k: 'd', t: '我最近什么都没动。真的。' });
  if (d.job) rows.push({ k: 'd', t: '正在做你交给我的事。' });
  push(rows);
}

/* ─────────── 交给它做 ─────────── */
function overdoChance() {
  const d = D();
  let p = 0.12 + d.want / 260 + (d.eager > 0 ? 0.28 : 0) - (d.careful > 0 ? 0.22 : 0) + Math.min(0.12, (G.day - 1) * 0.015) + (d.mood === 'sulky' ? 0.1 : 0) - (d.mood === 'happy' ? 0.05 : 0);
  if (G.day === 1) p *= 0.6;
  return clamp(p, 0.04, 0.72);
}
function startJob(k) {
  const d = D();
  if (d.job) { say(['等一下，上一个还没做完。']); return; }
  const over = chance(overdoChance());
  d.job = { k, at: G.t + rnd(2.4, 3.8), over };
  stat('jobs'); G.today.jobs = (G.today.jobs || 0) + 1;
  push([...dl(pick(L.JOB.ack)), { k: 'log', f: 'Start-Job', a: JOBS[k] ? JOBS[k].c.replace('Start-Job ', '') : k }]);
  addWant(-30);
  setMood('happy', 60);
}
function autoJob() {
  const ks = Object.entries(JOBS).filter(([k, j]) => j.can() && k !== 'bin').map(([k]) => k);
  if (!ks.length) { say(pick(L.JOB.none)); return; }
  D().eager = Math.max(D().eager, 60);
  startJob(pick(ks));
}

function doJob(job) {
  const { k, over } = job;
  const rows = [];
  const log = (f, a, sub) => { rows.push({ k: 'log', f, a }); if (sub) rows.push({ k: 'sub', t: sub }); };
  let did = 0;
  if (k === 'disk') {
    const tmp = Object.values(G.fs.nodes).filter((n) => n.ext === 'tmp' && n.p === 'temp');
    const kb = tmp.reduce((a, n) => a + n.kb, 0);
    for (const n of tmp) fs.destroy(n.id);
    if (tmp.length) { log('Remove-Item', 'C:\\WINDOWS\\TEMP\\*.tmp', `Freed ${Math.round(kb / 1024)} MB`); did++; }
    const hbf = Object.values(G.fs.nodes).find((n) => n.hb);
    if (hbf && hbf.kb > 64 && !has('heartbeat')) { const f = hbf.kb; hbf.kb = 4; log('Clear-Content', 'heartbeat.log', `Freed ${Math.max(1, Math.round(f / 1024))} MB`); did++; }
    fs.changed();
    if (!did) rows.push({ k: 'd', t: '……其实没什么可清的。' });
  } else if (k === 'sort') {
    for (const n of fs.kids('dl')) if (n.want && n.p !== n.want) { const r = fs.transfer([n.id], n.want); if (r.ok) { log('Move-Item', `下载\\${n.n}`, `→ ${fs.node(n.want).n}`); did++; } }
  } else if (k === 'reply') {
    const m = G.mail.list.find((x) => x.box === 'in' && x.need && !x.replied);
    if (m) {
      const body = over ? fill(pick(['{to}：\n\n好的。\n另外，我觉得这台电脑最近很努力，希望您知道。\n\n——{u}', '{to}：\n\n收到！！\n（这封是 {d} 帮忙回的，{u} 很忙，但是 {u} 很在乎您的邮件。）']), { to: pname(m.from) }) : `${(m.replies || ['好的。'])[0]}\n\n——${un()}`;
      sendDirect({ to: m.from, sub: `Re: ${m.sub}`, body, replyTo: m.id });
      log('Send-MailMessage', `-To ${pname(m.from)}`, 'Sent');
      if (over && m.from !== 'mom' && m.from !== 'zhou') { stat('oops'); G.mail.react = { at: G.t + 14, to: m.from }; }
      did++;
    }
  } else if (k === 'send') {
    for (const t of G.tasks.filter((x) => x.k === 'send' && !x.ok)) {
      const f = fs.node(t.p.file) || Object.values(G.fs.nodes).find((n) => n.src === t.p.file);
      if (!f) { rows.push({ k: 'd', t: `找不到「${t.p.name}」了。` }); continue; }
      const body = over ? `${pname(t.p.to)}：\n\n附件请查收。\n我认真检查过了，检查了 37 遍。\n\n——${un()}（${dn()} 代发）` : `附件是「${f.n}」，请查收。\n\n——${un()}`;
      sendDirect({ to: t.p.to, sub: f.n, body, att: f.id });
      log('Send-MailMessage', `-To ${pname(t.p.to)} -Attachments ${f.n}`, 'Sent');
      did++;
    }
  } else if (k === 'backup') {
    for (const t of G.tasks.filter((x) => x.k === 'backup' && !x.ok)) {
      const f = fs.node(t.p.file);
      if (!f) continue;
      if (f.kb > fs.freeA()) for (const o of fs.kids('A').filter((n) => /^旧备份/.test(n.n))) { if (f.kb <= fs.freeA()) break; fs.destroy(o.id); log('Remove-Item', `A:\\${o.n}`, '腾地方'); }
      const r = fs.transfer([f.id], 'A');
      if (r.ok) { log('Copy-Item', `${f.n} → A:\\`, 'Done'); did++; } else rows.push({ k: 'bad', t: '软盘放不下。' });
    }
    fs.changed();
  } else if (k === 'mem') {
    for (const p of [...procs('cache'), ...procs('loop')]) { kill(p.pid); log('Stop-Process', p.name, `Freed ${p.mem.toFixed(1)} MB`); did++; }
    if (!did) rows.push({ k: 'd', t: '内存还挺空的。' });
  } else if (k === 'bin') {
    const n = fs.emptyBin().length;
    log('Clear-RecycleBin', '-Force', `Removed ${n} items`);
    if (!fs.fontsOK() && !G.messes.some((m) => m.k === 'fonts')) G.messes.push({ k: 'fonts', at: G.t, data: {} });
    did++;
  }
  // 多做了一点
  let extra = null;
  if (over) {
    if (k === 'disk') extra = fs.fontsOK() ? (G.day >= 4 && chance(0.3) && fs.systemOK() ? 'system' : 'fonts') : (fs.systemOK() && G.day >= 3 ? 'system' : null);
    else if (k === 'sort') extra = MIS.DEF.tidy.can() ? 'tidy' : null;
    else if (k === 'mem') { const ex = G.procs.find((p) => p.kind === 'explorer'); if (ex) { kill(ex.pid); log('Stop-Process', 'explorer.exe', 'Freed 6.2 MB'); } }
    else if (k === 'backup' && fs.node('dhome')) { const idx = fs.kids('dhome').find((n) => n.n === 'you.idx'); if (idx && idx.kb <= fs.freeA()) { const c = fs.transfer([idx.id], 'A'); if (c.ok) log('Copy-Item', 'you.idx → A:\\', 'Done'); } }
  }
  const lines = over && JOB_OVER[k] ? pick(JOB_OVER[k]) : pick((L.JOB[k] && L.JOB[k].ok) || [['做完了。']]);
  push([...rows, ...dl(lines)]);
  if (extra) setTimeout(() => mischief(extra, true, true), 1800);
  tasks.check();
  saveSoon();
}
const JOB_OVER = { reply: L.JOB.reply.over, backup: L.JOB.backup.over, mem: L.JOB.mem.over, send: L.JOB.send.over };

/* ─────────── 闯祸 ─────────── */
export function mischief(prefer = null, force = false, fromJob = false) {
  const d = D();
  if (!d.alive) return;
  const k = MIS.choose(prefer);
  if (!k) return;
  if (!force && prefer && k !== prefer) return;
  const L0 = L.MIS[k];
  const v = { ...vars(), ...MIS.run(k) };
  const pre = fromJob ? pick(L.OVERDO) : pick(L0.pre);
  push([...dl(pre, v), ...logl(L0.log, v), ...dl(pick(L0.post), v)]);
  stat('mischief'); G.today.mis = (G.today.mis || 0) + 1;
  addWant(-38);
  d.misCd = rnd(48, 80) * (G.day <= 2 ? 1.25 : 1) / (1 + Math.min(0.5, G.day * 0.04));
  if (k === 'fonts') emit('fonts');
  emit('mischief', k);
  saveSoon();
}

/* ─────────── 死了 / 回来 ─────────── */
export function killed() {
  const d = D();
  d.alive = false; d.deadT = 28; d.ask = null; d.job = null;
  stat('kills');
  sys('[进程 daemon.exe (PID 61) 已被终止]', 'bad');
  emit('daemon');
}
export function respawn(byHand = false) {
  const d = D();
  if (d.alive) return;
  d.alive = true;
  if (!G.procs.some((p) => p.kind === 'daemon')) spawn('daemon.exe', { mem: 6, kind: 'daemon', by: 'daemon' });
  sys('[daemon.exe 已启动]', 'ok');
  if (byHand) { say(pick(L.RESPAWN_BY_HAND)); d.want = 30; setMood('happy', 90); }
  else { say(pick(L.KILLED)); d.want = 58; setMood('sulky', 100); }
  emit('daemon');
}

/* ─────────── 开机 / 第一次 ─────────── */
export function onBoot(first, resumed = false) {
  const d = D();
  d.quietT = 0; d.idleT = 0; d.misCd = Math.max(d.misCd || 0, G.day === 1 ? 70 : rnd(40, 60));
  if (resumed) {
    // 中途退出又回来：不是新的一天，只打个招呼
    if (d.alive && chance(0.6)) setTimeout(() => say(pick([['你回来了。'], ['……刚才去哪了。'], ['我一直在跑。', '你不在的时候也是。']])), 2000);
    if (d.intro === false && G.day === 1 && !d.ask) setTimeout(() => { open('shell'); say(L.INTRO.say); d.ask = { opts: L.INTRO.opts, at: G.t, intro: true }; emit('daemon:ask'); }, 1500);
    return;
  }
  if (first) {
    setTimeout(() => {
      open('shell', { quiet: false });
      push([{ k: 'sys', t: `PowerShell · 这台电脑` }, { k: 'sys', t: '' }]);
      say(L.INTRO.say);
      d.ask = { opts: L.INTRO.opts, at: G.t, intro: true };
      emit('daemon:ask');
    }, 1800);
  } else {
    setTimeout(() => say(pick(L.BOOT), vars()), 2200);
    if (G.day >= 2 && chance(0.55)) setTimeout(() => { if (tasks.addDaemonTask()) say(pick(L.ADD_TASK)); }, rnd(25, 60) * 1000);
  }
}
function afterIntro() {
  say(['便签上那几件事做完，就能从「开始」关机下班。', '……我在最下面加了一行。']);
  tasks.addDaemonTask();
}

/* ─────────── 每 1/4 秒 ─────────── */
export function tick(dt) {
  const d = D();
  if (!d) return;
  if (!d.alive) { d.deadT -= dt; if (d.deadT <= 0) respawn(false); return; }
  if (d.moodT > 0 && (d.moodT -= dt) <= 0) { d.mood = 'ok'; emit('daemon'); }
  if (d.careful > 0) d.careful -= dt;
  if (d.eager > 0) d.eager -= dt;
  if (d.boost > 0) d.boost -= dt;
  d.praiseHeat = Math.max(0, d.praiseHeat - dt / 40);
  d.quietT += dt; d.idleT += dt;

  const cling = [0.42, 0.72, 1.08][(S.cling || 2) - 1];
  let rate = cling * (1 + Math.min(0.5, (G.day - 1) * 0.06));
  if (d.mood === 'happy') rate *= 0.6;
  if (d.mood === 'sulky') rate *= 1.25;
  if (RT.shellVisible && d.idleT < 25) rate *= 0.5;
  if (!d.intro && G.day === 1 && RT.dayT < 50) rate *= 0.3;
  addWant(rate * dt);

  if (d.job && G.t >= d.job.at) { const j = d.job; d.job = null; doJob(j); }

  if (d.ask && !RT.typing && G.t - d.ask.at > 40 && !d.ask.intro) {
    d.ask = null;
    say(pick(L.IGNORED));
    addWant(10);
    emit('daemon:ask');
  }
  if (!d.ask && !RT.typing && !d.job && d.quietT > 24 && d.want >= 38) {
    if (d.want >= 50 && chance(0.62)) {
      const b = pick(L.NEEDY);
      say(b.say, vars());
      d.ask = { opts: b.opts, at: G.t };
      emit('daemon:ask');
    } else say(pick(L.PING), vars());
  }
  d.misCd -= dt;
  if (d.want >= 74 && d.misCd <= 0 && RT.dayT > 30 && !RT.typing && !d.job) mischief();
}

/* ─────────── 事件 ─────────── */
on('mess:fixed', (k) => {
  if (!D() || !D().alive) return;
  const lines = L.FIXED[k];
  if (lines && chance(0.85)) setTimeout(() => say(pick(lines)), 700);
});
on('task:done', (t) => { if (D() && D().alive && t.by !== 'daemon' && chance(0.4)) setTimeout(() => say(pick(L.TASK_DONE), { task: t.text.length > 14 ? `${t.text.slice(0, 14)}…` : t.text }), 900); });
on('daemon:mailSent', (m) => { G.messes = G.messes.filter((x) => !(x.k === 'mail' && x.data.mail === m.id)); if (D().alive) say(pick(L.MAIL_SENT), { to: pname(m.to) }); });
on('sysgone', () => { if (D().alive) say(L.SYS_PANIC[0]); balloon('系统警告', '找不到 C:\\WINDOWS\\SYSTEM。\n系统很快会停止响应。', () => open('explorer', { dir: 'bin' }), 12000); });
on('win:open', (w) => {
  const d = D();
  if (!d || !d.alive) return;
  if (w.app === 'shell' && !fs.fontsOK() && !d.seen.tofu) { d.seen.tofu = 1; setTimeout(() => say(pick(L.TOFU)), 1200); }
});
on('explorer:dir', (dir) => {
  const d = D();
  if (dir === 'dhome' && d && d.alive && d.seen.home !== G.day) { d.seen.home = G.day; setTimeout(() => say(pick(L.OPEN_HOME)), 600); }
});
on('fs:reinstalled', () => { if (D().alive) say(pick(L.FIXED.reinstall)); });
