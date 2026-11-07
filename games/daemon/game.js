// 老电脑：一台横屏的旧电脑，里面住着一个热心又欲求不满的守护进程。每天把维护单做完就关机下班，天数一直往上记。
import { sound } from '../_shared/sound.js';
import { hb, G, P, S, RT, ST, VERSION, on, emit, saveNow, saveSoon, loadSaved, replaceG, stat, setStat, pick, dn, un, fill, clockText, rnd } from './state.js';
import { sprite, icon, wallpaper, daemonWall } from './art.js';
import { os, h, layout, deskIcons, renderIcons, arrangeIcons, open, close, closeAll, find, findAll, focus, menu, msg, balloon, toggleStart, tickClock, overlay, screen, gesture } from './os.js';
import * as fs from './fs.js';
import * as machine from './machine.js';
import { M } from './machine.js';
import * as daemon from './daemon.js';
import * as MIS from './mischief.js';
import * as tasks from './tasks.js';
import * as L from './lines.js';
import { sfx } from './sfx.js';
import { mailTick } from './apps/mail.js';
import { photoURL } from './apps/control.js';
import './apps/explorer.js';
import './apps/viewer.js';
import './apps/shell.js';
import './apps/taskmgr.js';
import './apps/misc.js';

document.body.insertAdjacentHTML('afterbegin', sprite());
const $ = (id) => document.getElementById(id);

/* ─────────── 外观 ─────────── */
function applyLook() {
  screen.dataset.theme = P.theme;
  screen.dataset.style = P.style;
  screen.classList.toggle('crt', !!P.crt);
}
let wallKey = '';
async function applyWall(force = false) {
  const key = `${G.desk && G.desk.dwall}|${P.wall}|${P.wallColor}|${os.W}x${os.H}`;
  if (key === wallKey && !force) return;
  wallKey = key;
  const el = $('wall');
  if (G.desk && G.desk.dwall) { el.style.backgroundImage = `url(${daemonWall(os.W, os.H, G.desk.dwall)})`; return; }
  if (P.wall === 'photo' && P.photo) {
    const u = await photoURL();
    if (u) { el.style.backgroundImage = `url(${u})`; return; }
  }
  el.style.backgroundImage = `url(${wallpaper(P.wall === 'photo' ? 'teal' : P.wall, os.W, os.H)})`;
}
function applyFonts() { screen.classList.toggle('nofont', !fs.fontsOK()); }
function applySound() { sound.enabled = !!S.sound; }

/* ─────────── 桌面、开始菜单 ─────────── */
function openDir(dir, from) {
  const ex = findAll('explorer').find((w) => w.inst.dir === dir);
  if (ex) { if (ex.min) open('explorer', { dir }); focus(ex); ex.el.hidden = false; ex.min = false; return; }
  open('explorer', { dir }, from);
}
deskIcons([
  { id: 'pc', name: '我的电脑', icon: 'pc', open: (e) => openDir('pc', e) },
  { id: 'docs', name: '我的文档', icon: 'docs', open: (e) => openDir('docs', e), drop: 'docs' },
  { id: 'bin', name: '回收站', icon: () => (G.fs && fs.kids('bin').length ? 'binfull' : 'bin'), open: (e) => openDir('bin', e), drop: 'bin' },
  { id: 'mail', name: '邮件', icon: 'mail', open: (e) => open('mail', {}, e) },
  { id: 'shell', name: 'PowerShell', icon: 'term', open: (e) => open('shell', {}, e) },
  { id: 'taskmgr', name: '任务管理器', icon: 'taskmgr', open: (e) => open('taskmgr', {}, e) },
  { id: 'control', name: '控制面板', icon: 'control', open: (e) => open('control', {}, e) },
]);
on('fs', () => {
  const b = document.querySelector('.dicon[data-id="bin"] use');
  if (b) b.setAttribute('href', `#i-${fs.kids('bin').length ? 'binfull' : 'bin'}`);
});

function buildStart() {
  const sm = $('startMenu');
  sm.innerHTML = '';
  const items = h('div.items');
  const I = (ic, label, fn) => items.append(h('button', { html: `${icon(ic)}<span></span>`, onclick: () => { toggleStart(false); fn(); } }));
  I('term', 'PowerShell', () => open('shell'));
  I('mail', '邮件', () => open('mail'));
  I('pc', '我的电脑', () => openDir('pc'));
  I('docs', '我的文档', () => openDir('docs'));
  I('taskmgr', '任务管理器', () => open('taskmgr'));
  I('control', '控制面板', () => open('control'));
  items.append(h('div.sep'));
  I('q', '帮助', () => open('help'));
  items.append(h('div.sep'));
  I('start', '关机…', shutdownAsk);
  for (const b of items.querySelectorAll('button')) b.querySelector('span').textContent = b.querySelector('span').textContent || '';
  const labels = ['PowerShell', '邮件', '我的电脑', '我的文档', '任务管理器', '控制面板', '帮助', '关机…'];
  items.querySelectorAll('button').forEach((b, i) => { b.querySelector('span').textContent = labels[i]; });
  sm.append(h('div.banner', { html: '<b>这台电脑 <em>98</em></b>' }), items);
}
buildStart();

on('desk:menu', (x, y) => {
  const items = [{ label: '排列图标', act: () => { G.desk.heart = false; arrangeIcons(); sfx.pop(); } }, { label: '刷新', act: () => { renderIcons(true); } }];
  if (G.desk.dwall) items.push({ label: '恢复壁纸', act: () => { G.desk.dwall = null; emit('wall'); saveSoon(); } });
  items.push('-', { label: G.desk.noteHidden ? '显示便签' : '隐藏便签', act: () => { G.desk.noteHidden = !G.desk.noteHidden; tasks.renderNote(); saveSoon(); } }, { label: '属性', act: () => open('control', { page: 'look' }) });
  menu(x, y, items);
});
on('icons:moved', () => { if (G.desk.heart && ++G.desk.heartMoves >= 3) { G.desk.heart = false; } });

/* 托盘：它的小图标 */
function trayD() {
  const t = $('trayD');
  const d = G.d;
  t.classList.toggle('dead', !d.alive);
  t.style.setProperty('--dot', !d.alive ? '#777' : d.want < 40 ? '#48e070' : d.want < 70 ? '#ffc23c' : '#ff5c8a');
  t.title = d.alive ? `${dn()}：想要 ${Math.round(d.want)}%` : `${dn()} 不在`;
}
$('trayD').addEventListener('click', () => { sfx.click(); open('shell'); });
$('trayPrint').addEventListener('click', () => open('printq'));
$('trayDay').addEventListener('click', () => open('control', { page: 'sys' }));

/* 打印出来的纸 */
function paper() {
  const p = $('paper');
  const n = (G.print && G.print.pile) || 0;
  p.hidden = !n;
  $('trayPrint').hidden = !machine.has('spool') && !n;
  $('trayPrint').classList.toggle('busy', machine.has('spool'));
  if (!n) return;
  const k = Math.min(7, Math.ceil(n / 6));
  p.innerHTML = '';
  for (let i = 0; i < k; i++) { const s = h('i'); s.style.transform = `translate(${(i % 2 ? 1 : -1) * (i * 0.8)}px, ${-i * 2.2}px) rotate(${((i * 37) % 9) - 4}deg)`; p.append(s); }
  p.append(h('b', { text: n }));
}
gesture($('paper'), { tap: () => open('printq') });

/* ─────────── 事件 ─────────── */
on('win:open', (w) => machine.appOpened(w));
on('win:close', (w) => machine.appClosed(w));
on('killed', (p) => {
  if (p.kind === 'daemon') daemon.killed();
  else if (p.kind === 'explorer') explorerDown();
  else if (p.kind === 'app' && p.win) { const w = os.wins.find((x) => x.id === p.win); if (w) close(w, true); }
});
function explorerDown() {
  for (const id of ['icons', 'taskbar', 'note', 'startMenu']) $(id).style.visibility = 'hidden';
  toggleStart(false);
  setTimeout(() => {
    for (const id of ['icons', 'taskbar', 'note', 'startMenu']) $(id).style.visibility = '';
    if (!G.procs.some((p) => p.kind === 'explorer')) machine.spawn('explorer.exe', { mem: 6.2, kind: 'explorer', by: 'sys' });
    sfx.ding();
    daemon.sys('[explorer.exe 已自动重新启动]');
  }, 7000);
}
on('fonts', applyFonts);
on('fs', () => { if (screen.classList.contains('nofont') === fs.fontsOK()) applyFonts(); });
on('wall', () => applyWall());
on('prefs', (k) => {
  applyLook();
  if (k === 'fontSize') { layout(); renderIcons(); }
  if (['wall', 'wallColor', 'photo'].includes(k)) applyWall(true);
  if (k === 'dname' || k === 'uname') { buildStart(); }
});
on('settings', applySound);
on('layout', () => { if (!G.v) return; applyWall(); renderIcons(); paper(); });
on('mail:explain', (m) => tasks.addExplain(m));
let chkT = 0;
const checkSoon = () => { clearTimeout(chkT); chkT = setTimeout(() => G.v && tasks.check(), 60); };
on('fs', checkSoon); on('mail', checkSoon); on('procs', checkSoon);
on('popup:yes', () => { G.d.eager = Math.max(G.d.eager, 90); setTimeout(() => daemon.exec({ id: 'job:disk' }), 300); });
on('popup:no', () => setTimeout(() => open('popup', { item: { i: Date.now(), text: '……好吧。' } }), 400));
on('print', paper);
on('procs', paper);
on('crash', (why) => bsod(why));
on('reset', () => { hb.save('pc', null); location.reload(); });
on('user:emptied', (items) => { if (items.some((n) => n.id === 'fonts' || n.id === 'system')) setTimeout(() => G.d.alive && daemon.say(['……你把回收站倒了。', '里面有些东西，好像不该倒。']), 800); });
document.addEventListener('pointerdown', () => { RT.clicks++; }, true);
// 什么都不许把界面滚走（比如输入框弹键盘的时候）
for (const el of [document.documentElement, document.body, $('desk'), screen]) el.addEventListener('scroll', () => { if (el.scrollTop || el.scrollLeft) { el.scrollTop = 0; el.scrollLeft = 0; } }, { passive: true });
window.addEventListener('scroll', () => { if (window.scrollX || window.scrollY) window.scrollTo(0, 0); }, { passive: true });

/* ─────────── 主循环 ─────────── */
let loop = 0, paused = false, busyLayer = false, sec = 0, saveT = 0, glitchT = 0;
function tick() {
  if (paused || busyLayer) return;
  const dt = 0.25;
  G.t += dt; RT.dayT += dt;
  const w = find('shell');
  RT.shellVisible = !!w && !w.min;
  machine.tick(dt, { typing: RT.typing, balloon, open: (a, b) => open(a, b) });
  if (busyLayer) return;
  daemon.tick(dt);
  os.lag = M.lag;
  screen.classList.toggle('shake', !!S.shake && G.heat > 72);
  $('led').classList.toggle('hdd', M.cpu > 80 && Math.random() < 0.5);
  if (G.sysT) glitch(1 - G.sysT / 26); else if (glitchT) glitch(0);
  sec += dt;
  if (sec >= 1) {
    sec = 0;
    mailTick();
    for (const k of MIS.check()) { stat('fixed'); G.today.fixed = (G.today.fixed || 0) + 1; emit('mess:fixed', k); }
    tasks.check();
    trayD();
    tickClock();
  }
  saveT += dt;
  if (saveT >= 8) { saveT = 0; saveNow(); }
}
function glitch(k) {
  const g = $('glitch');
  glitchT = k;
  g.innerHTML = '';
  if (k <= 0) return;
  const n = Math.round(2 + k * 10);
  for (let i = 0; i < n; i++) { const b = h('i'); b.style.top = `${Math.random() * 100}%`; b.style.height = `${2 + Math.random() * 10 * k}px`; b.style.opacity = 0.3 + Math.random() * 0.7; g.append(b); }
  if (Math.random() < 0.3 + k * 0.4) sfx.glitch();
}
function startLoop() { clearInterval(loop); loop = setInterval(tick, 250); }

/* ─────────── 开机 ─────────── */
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let skip = null;
overlay.addEventListener('pointerdown', () => { if (skip) skip(); });
const waitOrTap = (ms) => new Promise((r) => { const t = setTimeout(() => { skip = null; r(); }, ms); skip = () => { clearTimeout(t); skip = null; r(); }; });

async function boot({ quick = false } = {}) {
  busyLayer = true;
  overlay.hidden = false;
  overlay.innerHTML = '';
  $('led').classList.remove('off');
  const bios = h('div.bios');
  overlay.append(bios);
  const lines = [
    ['这台电脑 BIOS  v1.98', ''], ['CPU：老的，但是还能用', ''], ['内存检测：', 'mem'], ['硬盘 C:      2048 MB', ' OK'], ['软驱 A:      1.44 MB', ' OK'],
    [`守护进程：   ${dn()}`, ' …… 已就绪'], ['', ''], [`已经运行：   第 ${G.day} 天`, 'hi'],
  ];
  let cancelled = false;
  const sk = new Promise((r) => { skip = () => { cancelled = true; skip = null; r(); }; });
  const run = (async () => {
    for (const [a, b] of lines) {
      if (cancelled) return;
      const row = h('div');
      if (b === 'mem') {
        row.textContent = a;
        const s = h('span.ok');
        row.append(s);
        bios.append(row);
        for (let k = 0; k <= 65536 && !cancelled; k += quick ? 16384 : 4096) { s.textContent = ` ${k}K`; sfx.beep(); await wait(22); }
        s.textContent = ' 65536K OK';
      } else if (b === 'hi') { row.append(h('span.hi', { text: a })); bios.append(row); }
      else { row.textContent = a; if (b) row.append(h('span.ok', { text: b })); bios.append(row); }
      await wait(quick ? 60 : 160);
    }
    await wait(quick ? 200 : 600);
  })();
  await Promise.race([run, sk]);
  cancelled = true;
  overlay.innerHTML = '';
  const logo = h('div.logo', { html: `<div class="mark">${icon('start')}<h1>这台<b>电脑</b></h1><p></p></div><div class="run"><i></i></div>` });
  logo.querySelector('p').textContent = `第 ${G.day} 天`;
  overlay.append(logo);
  sfx.startup();
  await waitOrTap(quick ? 900 : 2000);
  await new Promise((r) => { const a = overlay.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 380 }); a.onfinish = r; });
  overlay.hidden = true;
  overlay.innerHTML = '';
  busyLayer = false;
}

/* ─────────── 蓝屏 ─────────── */
const BSOD = {
  heat: ['CPU 太烫了。', 'loop_for_you.exe 一直没有 break。'],
  ram: ['内存用完了。', 'cache_for_you.exe 想记住的东西太多了。'],
  system: ['找不到 C:\\WINDOWS\\SYSTEM。', '它说它只是想腾点地方。'],
};
async function bsod(why) {
  if (busyLayer) return;
  busyLayer = true;
  stat('crashes'); G.today.crashes = (G.today.crashes || 0) + 1;
  saveNow();
  sfx.bsod();
  closeAll(true);
  overlay.hidden = false;
  overlay.innerHTML = '';
  const [a, b] = BSOD[why] || BSOD.heat;
  const box = h('div.bsod', null, h('div.hd', { text: dn() }),
    h('p', { text: `一个致命异常 0E 发生在 0028:C0011E36 的 VXD ${dn()}(01)。\n${a}\n${b}` }),
    h('p', { text: '*  按任意键重新启动计算机。\n*  你不会丢失任何东西。天数也不会。' }),
    h('div.go', { text: '点一下继续 _' }));
  overlay.append(box);
  await new Promise((r) => { skip = () => { skip = null; r(); }; });
  overlay.innerHTML = '';
  await wait(500);
  // 修好能修的
  machine.baseProcs();
  machine.resetWarnings();
  G.messes = G.messes.filter((m) => !['loop', 'mem', 'log', 'print', 'popups'].includes(m.k));
  if (!fs.systemOK()) { if (fs.node('system')) fs.restore(['system']); else fs.rebuildSystem(); G.systemGone = false; }
  G.messes = G.messes.filter((m) => m.k !== 'system');
  for (const m of G.mail.list) if (m.box === 'out' && m.by === 'daemon') m.sendAt = null;
  G.mail.list = G.mail.list.filter((m) => !(m.box === 'out' && m.by === 'daemon'));
  G.messes = G.messes.filter((m) => m.k !== 'mail');
  G.heat = 0; G.sysT = 0;
  G.d.alive = true; G.d.job = null; G.d.ask = null; G.d.want = Math.min(G.d.want, 45);
  fs.changed();
  glitch(0);
  busyLayer = false;
  await boot({ quick: true });
  paper(); trayD();
  daemon.sys('[系统已从严重错误中恢复]', 'bad');
  setTimeout(() => daemon.say(pick(L.CRASH)), 1600);
  saveNow();
}

/* ─────────── 关机下班 ─────────── */
async function shutdownAsk() {
  const left = tasks.left();
  if (left.length) {
    await msg({ title: '还不能下班', text: `维护单上还有 ${left.length} 件没做完：\n\n${left.map((t) => `· ${t.text}`).join('\n')}`, ic: 'warn' });
    return;
  }
  const i = await msg({ title: '关机', text: '今天的事都做完了。\n要关机下班吗？', ic: 'q', buttons: ['关机', '取消'] });
  if (i !== 0) return;
  shutdown();
}
async function shutdown() {
  busyLayer = true;
  const td = G.today || {};
  const k = td.mis || 0;
  const line = k >= 2 ? fill(pick(L.SHUTDOWN_MESSY).join('\n'), { k }) : fill(pick(L.SHUTDOWN).join('\n'));
  G.term.push({ k: 'd', t: line.split('\n')[0] });
  saveNow();
  sfx.shutdown();
  overlay.hidden = false;
  overlay.innerHTML = '';
  overlay.append(h('div.logo', { html: `<div class="mark">${icon('start')}<h1>正在关机</h1><p>正在保存你的设置……</p></div>` }));
  overlay.firstChild.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 400 });
  await wait(1700);
  closeAll(true);
  overlay.innerHTML = '';
  const say = h('div.say');
  line.split('\n').forEach((l, i) => { if (i) say.append(h('br')); if (!i) say.append(h('b', { text: `${dn()}> ` })); say.append(l); });
  const dlEl = h('dl');
  for (const [a, b] of [['它闯的祸', `${td.mis || 0} 次`], ['你收拾好的', `${td.fixed || 0} 次`], ['交给它做的事', `${td.jobs || 0} 件`], ['陪它说的话', `${td.talks || 0} 句`], ['夸它', `${td.praise || 0} 次`], ['蓝屏', `${td.crashes || 0} 次`]]) dlEl.append(h('dt', { text: a }), h('dd', { text: b }));
  const btn = h('button.btn.def', { text: '关机' });
  const card = h('div.card', null, h('div.tb', null, h('span.tt', { text: `第 ${G.day} 天 · 下班` })), h('div.wb', null, h('div.big', { text: `第 ${G.day} 天结束了` }), h('div.meta', { text: `这台电脑已经运行了 ${G.day} 天。` }), dlEl, say, h('div.row', null, btn)));
  card.querySelector('.tb').style.background = 'linear-gradient(90deg, var(--t1), var(--t2))';
  card.querySelector('.tb').style.color = '#fff';
  overlay.append(h('div.sum', null, card));
  card.animate([{ transform: 'translateY(14px) scale(.97)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 320, easing: 'cubic-bezier(.2,.9,.3,1.2)' });
  stat('played');
  await new Promise((r) => btn.addEventListener('click', r, { once: true }));
  sfx.click();
  overlay.innerHTML = '';
  $('led').classList.add('off');
  overlay.append(h('div.safe', { html: '现在可以安全地关闭计算机了。<small>点一下开机</small>' }));
  // 第二天
  G.day += 1;
  setStat('day', G.day);
  if (G.day > (ST.bestDay || 0)) setStat('bestDay', G.day);
  newDayState();
  saveNow();
  await new Promise((r) => { skip = () => { skip = null; r(); }; });
  busyLayer = false;
  RT.dayT = 0;
  await boot();
  afterBoot(false);
}
function newDayState() {
  machine.baseProcs();
  machine.resetWarnings();
  G.messes = G.messes.filter((m) => ['fonts', 'wallpaper', 'icons', 'tidy', 'system'].includes(m.k));
  G.mail.list = G.mail.list.filter((m) => !(m.box === 'out' && m.by === 'daemon'));
  G.messes = G.messes.filter((m) => m.k !== 'mail');
  G.print = { left: 0, pile: 0 };
  G.d.want = Math.max(10, G.d.want * 0.4); G.d.ask = null; G.d.job = null; G.d.alive = true; G.d.mood = 'ok';
  G.term.push({ k: 'sys', t: '' }, { k: 'sys', t: `—— 第 ${G.day} 天 ——` });
  G.wins = [];
  tasks.newDay();
}

/* ─────────── 新电脑 / 读档 ─────────── */
function fresh() {
  replaceG({ v: VERSION, day: Math.max(1, 1), t: 0, desk: { icons: null }, mail: { seq: 1, list: [], react: null }, term: [], messes: [], tasks: [], today: {}, print: { left: 0, pile: 0 }, wins: [] });
  fs.newFS();
  machine.baseProcs();
  G.d = daemon.newDaemon();
  tasks.newDay();
  setStat('day', 1);
}
function restoreWindows() {
  for (const s of G.wins || []) {
    if (!os.apps[s.app] || s.app === 'popup') continue;
    const w = open(s.app, { ...(s.args || {}), rect: s.rect, quiet: true });
    if (!w) continue;
    if (s.max && !w.max) { w.max = true; w.el.classList.add('max'); }
    if (s.min) { w.min = true; w.el.hidden = true; w.task && w.task.classList.remove('on'); }
  }
  const pm = G.messes.find((m) => m.k === 'popups');
  if (pm) MIS.openPopups(pm);
}
on('beforesave', () => {
  if (busyLayer && overlay.querySelector('.sum,.safe')) return;
  G.wins = os.wins.filter((w) => w.app !== 'popup').map((w) => ({ app: w.app, args: w.app === 'explorer' ? { dir: w.inst.dir } : w.app === 'viewer' ? { id: w.args.id } : {}, rect: { x: w.x, y: w.y, w: w.w, h: w.h }, max: w.max, min: w.min }));
});

function afterBoot(first, resumed = false) {
  tasks.placeNote();
  tasks.renderNote();
  applyFonts();
  applyWall(true);
  renderIcons(true);
  paper(); trayD(); tickClock();
  $('trayDay').textContent = `第 ${G.day} 天`;
  daemon.onBoot(first, resumed);
  if (first) setTimeout(() => balloon('第一次用这台电脑？', '「开始」→「帮助」里有说明。\n图标点两下打开，按住是右键菜单。', () => open('help'), 9000), 9000);
  RT.dayT = 0;
  saveSoon();
}

/* ─────────── 暂停 ─────────── */
hb.onPause(() => { paused = true; document.body.classList.add('away'); saveNow(); });
hb.onResume(() => { paused = false; document.body.classList.remove('away'); });
document.addEventListener('visibilitychange', () => { if (document.hidden) saveNow(); });
window.addEventListener('pagehide', saveNow);

/* ─────────── 开始 ─────────── */
window.addEventListener('resize', () => layout());
applyLook(); applySound();
layout();
(async () => {
  const had = loadSaved();
  if (!had) fresh();
  G.desk = G.desk || {};
  G.today = G.today || {};
  G.messes = G.messes || [];
  setStat('day', G.day);
  startLoop();
  await boot({ quick: had });
  if (had) {
    tasks.check(true);
    restoreWindows();
    afterBoot(false, true);
  } else afterBoot(true);
})();

/* 测试用 */
window.__daemon = { G, P, S, RT, M, os, open, fs, machine, daemon, MIS, tasks, mischief: (k) => daemon.mischief(k, true), bsod, shutdown, skip: () => skip && skip(), want: (v) => { G.d.want = v; }, tick };
