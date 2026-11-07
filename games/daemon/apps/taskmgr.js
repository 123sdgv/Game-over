// 任务管理器：进程列表（能结束任务）、性能（CPU、内存、温度）。
import { G, on, dn } from '../state.js';
import { h, register, msg, gesture, scrollable } from '../os.js';
import { icon } from '../art.js';
import { sfx } from '../sfx.js';
import { M, RAM, kill } from '../machine.js';

const ICON = { system: 'pc', explorer: 'folder', daemon: 'term', app: 'f_exe', loop: 'f_exe', cache: 'f_dat', heartbeat: 'f_log', spool: 'printer' };

function create(w) {
  let tab = 'proc', sel = null;
  const tabs = h('div.tm-tabs');
  const page = h('div.tm-page');
  w.body.append(tabs, page);
  for (const [k, name] of [['proc', '进程'], ['perf', '性能']]) {
    tabs.append(h('button', { 'data-t': k, text: name, onclick: () => { tab = k; sfx.click(); build(); } }));
  }
  let table, foot, endBtn, cvC, cvR, meterC, meterR, tempBar, tempTxt;

  function build() {
    for (const b of tabs.children) b.classList.toggle('on', b.dataset.t === tab);
    page.innerHTML = '';
    if (tab === 'proc') {
      table = h('div.ptable.field.scroll');
      scrollable(table);
      endBtn = h('button.btn', { text: '结束任务', disabled: true, onclick: endTask });
      foot = h('span');
      page.append(table, h('div.tm-foot', null, foot, endBtn));
      renderProcs(true);
    } else {
      cvC = h('canvas'); cvR = h('canvas');
      meterC = h('div.meter', null, h('i'), h('span'));
      meterR = h('div.meter', null, h('i'), h('span'));
      tempBar = h('div.bar', null, h('i'));
      tempTxt = h('span');
      page.append(h('div.perf', null,
        h('div.gbox', null, h('b', { text: 'CPU' }), meterC), h('div.gbox', null, h('b', { text: 'CPU 使用记录' }), cvC),
        h('div.gbox', null, h('b', { text: '内存' }), meterR), h('div.gbox', null, h('b', { text: `内存使用记录（共 ${RAM} MB）` }), cvR),
        h('div.temp', null, h('b', { text: '温度', style: { fontWeight: 400, color: 'var(--ink2)' } }), tempBar, tempTxt)));
      renderPerf();
    }
  }
  function renderProcs(full) {
    if (!table) return;
    const rows = [...G.procs].sort((a, b) => a.pid - b.pid);   // 顺序固定，手指点下去的时候不会跳
    if (sel && !rows.some((p) => p.pid === sel)) sel = null;
    if (full || table.childElementCount - 1 !== rows.length || rows.some((p, i) => table.children[i + 1]?.dataset.pid !== String(p.pid))) {
      const top = table.scrollTop;
      table.innerHTML = '';
      table.append(h('div.prow.head', null, h('span', { text: '名称' }), h('span', { text: 'CPU' }), h('span', { text: '内存' })));
      for (const p of rows) {
        const r = h('div.prow', { 'data-pid': p.pid }, h('span.pn', { html: `${icon(ICON[p.kind] || 'f_exe')}<em style="font-style:normal"></em>` }), h('span'), h('span'));
        r.querySelector('em').textContent = p.name;
        if (p.by === 'daemon') r.classList.add('dm');
        gesture(r, { scroll: () => table, tap: () => { sel = p.pid; sfx.click(); renderProcs(); } });
        table.append(r);
      }
      table.scrollTop = top;
    }
    for (const r of table.querySelectorAll('.prow[data-pid]')) {
      const p = G.procs.find((x) => String(x.pid) === r.dataset.pid);
      if (!p) continue;
      r.children[1].textContent = `${Math.round(p.cpu)}%`;
      r.children[2].textContent = `${p.mem.toFixed(1)} MB`;
      r.classList.toggle('hot', p.cpu >= 50);
      r.classList.toggle('sel', p.pid === sel);
    }
    endBtn.disabled = !sel;
    foot.textContent = `进程 ${G.procs.length} 个　CPU ${Math.round(M.cpu)}%　内存 ${Math.round(M.ramPct * 100)}%`;
  }
  async function endTask() {
    const p = G.procs.find((x) => x.pid === sel);
    if (!p) return;
    sfx.click();
    if (p.kind === 'daemon') {
      const i = await msg({ title: '结束任务', text: `确定要结束 daemon.exe 吗？\n\n它没有在做坏事。\n（大概。）`, ic: 'warn', buttons: ['结束', '取消'] });
      if (i !== 0) return;
    } else if (p.kind === 'explorer') {
      const i = await msg({ title: '结束任务', text: '结束 explorer.exe 以后，桌面和任务栏会消失一会儿。\n确定吗？', ic: 'warn', buttons: ['结束', '取消'] });
      if (i !== 0) return;
    }
    const r = kill(p.pid);
    if (r.err) { msg({ title: '无法结束进程', text: r.err, ic: 'err' }); return; }
    sfx.close();
    // 同名的还有：直接选中下一个，连着点「结束任务」就行
    const next = G.procs.find((x) => x.name === p.name && x.kind !== 'daemon');
    sel = next ? next.pid : null;
    renderProcs(true);
  }
  function graph(cv, data, color) {
    const r = cv.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = Math.max(10, Math.round(cv.clientWidth * dpr)), H = Math.max(10, Math.round(cv.clientHeight * dpr));
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
    const c = cv.getContext('2d');
    c.fillStyle = '#000'; c.fillRect(0, 0, W, H);
    c.strokeStyle = '#0d4a1a'; c.lineWidth = 1;
    const off = (G.t * 6 * dpr) % (12 * dpr);
    for (let x = W - off; x > 0; x -= 12 * dpr) { c.beginPath(); c.moveTo(x + 0.5, 0); c.lineTo(x + 0.5, H); c.stroke(); }
    for (let y = 0; y < H; y += 12 * dpr) { c.beginPath(); c.moveTo(0, y + 0.5); c.lineTo(W, y + 0.5); c.stroke(); }
    c.strokeStyle = color; c.lineWidth = 1.6 * dpr; c.beginPath();
    const n = 80;
    data.forEach((v, i) => { const x = W - (data.length - 1 - i) * (W / (n - 1)); const y = H - (v / 100) * (H - 4) - 2; i ? c.lineTo(x, y) : c.moveTo(x, y); });
    c.stroke();
    void r;
  }
  function renderPerf() {
    if (tab !== 'perf' || !cvC) return;
    meterC.firstChild.style.height = `${Math.max(2, M.cpu * 0.82)}%`;
    meterC.lastChild.textContent = `${Math.round(M.cpu)}%`;
    meterR.firstChild.style.height = `${Math.max(2, M.ramPct * 82)}%`;
    meterR.lastChild.textContent = `${Math.round(M.ram)} MB`;
    graph(cvC, M.cpuHist, '#5dff74');
    graph(cvR, M.ramHist, '#ffd34d');
    tempBar.firstChild.style.width = `${Math.min(100, ((M.temp - 30) / 70) * 100)}%`;
    tempTxt.textContent = `${M.temp}°C`;
  }
  build();
  const iv = setInterval(() => { if (document.body.classList.contains('away')) return; if (tab === 'proc') renderProcs(); else renderPerf(); }, 600);
  const off = on('procs', () => tab === 'proc' && renderProcs());
  return { title: '任务管理器', close: () => { clearInterval(iv); off(); }, resize: () => renderPerf() };
}

register('taskmgr', { title: '任务管理器', icon: 'taskmgr', single: true, create, size: { w: 0.5, h: 0.92, minW: 270, minH: 210, maxW: 440, maxH: 480 } });
