// 这台机器的「身体」：进程、CPU、内存、温度、磁盘被写满、打印机。撑不住了就蓝屏（emit('crash')）。
import { G, emit, rnd, ri, clamp, saveSoon, S } from './state.js';
import { node, hooks, freeC, systemOK, changed } from './fs.js';
import { sfx } from './sfx.js';

export const RAM = 64;   // MB

const APP_PROC = { explorer: null, bin: null, mail: ['mailer.exe', 5.5], shell: ['powershell.exe', 4.2], taskmgr: ['taskmgr.exe', 2.1], control: ['control.exe', 2.4], viewer: ['notepad.exe', 1.4], printq: ['spoolview.exe', 1.2], help: ['help.exe', 1.6] };

export function baseProcs() {
  G.pseq = 100;
  G.procs = [
    { pid: 4, name: 'System', cpu: 1, mem: 9, by: 'sys', kind: 'system' },
    { pid: 48, name: 'explorer.exe', cpu: 0, mem: 6.2, by: 'sys', kind: 'explorer' },
    { pid: 61, name: 'daemon.exe', cpu: 1, mem: 6.5, by: 'daemon', kind: 'daemon' },
  ];
  G.heat = 0; G.ramT = 0; G.sysT = 0;
}

export function spawn(name, o = {}) {
  const p = { pid: (G.pseq += ri(3, 17)), name, cpu: o.cpu || 0, mem: o.mem || 1, by: o.by || 'user', kind: o.kind || 'app', win: o.win || null };
  G.procs.push(p);
  emit('procs');
  return p;
}
export const procs = (kind) => G.procs.filter((p) => p.kind === kind);
export const has = (kind) => G.procs.some((p) => p.kind === kind);

/** 打开 / 关掉窗口时跟着加减进程 */
export function appOpened(w) {
  const d = APP_PROC[w.app];
  if (!d) return;
  if (G.procs.some((p) => p.win === w.id)) return;
  spawn(d[0], { mem: d[1], kind: 'app', win: w.id, by: 'user' });
}
export function appClosed(w) {
  const i = G.procs.findIndex((p) => p.win === w.id);
  if (i >= 0) { G.procs.splice(i, 1); emit('procs'); }
}

/** 结束任务。返回 { ok, err } */
export function kill(pid) {
  const p = G.procs.find((x) => x.pid === pid);
  if (!p) return { err: '这个进程已经不在了。' };
  if (p.kind === 'system') return { err: '拒绝访问。\n这个进程关掉的话，电脑就没了。' };
  G.procs = G.procs.filter((x) => x !== p);
  emit('procs');
  emit('killed', p);
  if (p.kind === 'heartbeat') changed();
  saveSoon();
  return { ok: true, p };
}

/* 现在的读数（tick 里算好存着） */
export const M = { cpu: 3, ram: 20, ramPct: 0.3, lag: 0, temp: 40, cpuHist: [], ramHist: [] };

hooks.inUse = (n) => {
  if (n && n.hb && has('heartbeat')) return `文件正在被 heartbeat.exe 使用。\n先在任务管理器里结束它，才能删。`;
  return null;
};

let fanT = 0, warned = {}, printT = 0;
export function tick(dt, ctx) {
  const want = G.d ? G.d.want : 0;
  let cpu = 0, mem = 0;
  for (const p of G.procs) {
    if (p.kind === 'system') p.cpu = rnd(0.5, 3.5);
    else if (p.kind === 'explorer') p.cpu = rnd(0, 1.8);
    else if (p.kind === 'daemon') { p.cpu = 0.6 + want / 28 + (ctx.typing ? rnd(4, 9) : 0) + (G.d && G.d.boost > 0 ? 18 : 0); p.mem = 5.5 + want / 22; }
    else if (p.kind === 'loop') p.cpu = rnd(92, 98);
    else if (p.kind === 'cache') p.cpu = rnd(0.3, 2.5);
    else if (p.kind === 'heartbeat') p.cpu = rnd(2.5, 6);
    else if (p.kind === 'spool') p.cpu = rnd(4, 9);
    else if (p.kind === 'app') p.cpu = rnd(0, 1.2);
    cpu += p.cpu; mem += p.mem;
  }
  M.cpu = clamp(cpu, 1, 100);
  M.ram = mem;
  M.ramPct = clamp(mem / RAM, 0, 1);
  M.lag = clamp((M.ramPct - 0.82) / 0.14, 0, 1) * (mem > RAM ? 1 : 0.8) + (M.cpu > 95 ? 0.25 : 0);
  M.lag = clamp(M.lag, 0, 1);

  // 温度：CPU 一直顶满就越来越烫
  if (M.cpu >= 88) G.heat = Math.min(100, G.heat + dt * 1.1);
  else G.heat = Math.max(0, G.heat - dt * 3.5);
  M.temp = Math.round(38 + G.heat * 0.6 + M.cpu * 0.06);
  if (M.cpu >= 88 || G.heat > 20) {
    fanT -= dt;
    if (fanT <= 0) { sfx.fan(0.6 + G.heat / 70); fanT = 0.55; }
  }
  if (G.heat >= 38 && !warned.heat) { warned.heat = 1; ctx.balloon('CPU 温度过高', `现在 ${M.temp}°C，风扇已经转到最大了。\n打开任务管理器看看是谁在占着 CPU。`, () => ctx.open('taskmgr')); }
  if (G.heat < 20) warned.heat = 0;
  if (G.heat >= 100) { emit('crash', 'heat'); return; }

  // 内存
  if (M.ramPct >= 0.97) {
    if (!warned.ram) { warned.ram = 1; ctx.balloon('内存不足', '系统内存快用完了，程序会变得很慢。\n可以在任务管理器里结束不需要的程序。', () => ctx.open('taskmgr')); }
    G.ramT += dt;
    if (G.ramT >= 60) { emit('crash', 'ram'); return; }
  } else { G.ramT = Math.max(0, G.ramT - dt * 2); if (M.ramPct < 0.85) warned.ram = 0; }

  // 系统文件夹没了：倒计时
  if (!systemOK()) {
    if (!G.sysT) { G.sysT = 26; emit('sysgone'); }
    G.sysT -= dt;
    if (G.sysT <= 0) { G.sysT = 0; emit('crash', 'system'); return; }
  } else if (G.sysT) { G.sysT = 0; emit('sysback'); }

  // 心跳日志：一直往里写
  if (has('heartbeat')) {
    const f = Object.values(G.fs.nodes).find((n) => n.hb);
    const free = freeC();
    if (f && free > 0) {
      f.kb += Math.min(free, 2600 * dt);
      G._hbT = (G._hbT || 0) + dt;
      if (G._hbT > 1) { G._hbT = 0; changed(); }
    }
    if (freeC() < 20 * 1024 && !warned.disk) { warned.disk = 1; ctx.balloon('C 盘空间不足', '硬盘快满了。\n有个文件一直在变大……', () => ctx.open('explorer', { dir: 'dhome' })); }
  }
  if (freeC() > 80 * 1024) warned.disk = 0;

  // 打印机
  if (has('spool') && G.print && G.print.left > 0) {
    printT -= dt;
    if (printT <= 0) {
      printT = 1.7;
      G.print.left--; G.print.pile = Math.min(999, (G.print.pile || 0) + 1);
      sfx.printer();
      emit('print');
      if (G.print.left <= 0) { const sp = procs('spool')[0]; if (sp) { G.procs = G.procs.filter((x) => x !== sp); emit('procs'); } }
    }
  }

  M.cpuHist.push(M.cpu); M.ramHist.push(M.ramPct * 100);
  if (M.cpuHist.length > 80) { M.cpuHist.shift(); M.ramHist.shift(); }
}
export function resetWarnings() { warned = {}; }
