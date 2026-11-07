// 小窗口：它开的「在吗」弹窗、打印队列、帮助。
import { G, on, emit, dn, un, saveSoon } from '../state.js';
import { h, register, open, close, scrollable } from '../os.js';
import { icon } from '../art.js';
import { sfx } from '../sfx.js';
import { kill, procs } from '../machine.js';
import * as MIS from '../mischief.js';

/* ─────────── 「在吗」 ─────────── */
register('popup', {
  title: 'daemon', icon: 'bubble', taskbar: false, noMax: true, noMin: true, noResize: true, at: 'random',
  size: { w: 0.3, h: 0.32, minW: 190, minH: 112, maxW: 250, maxH: 140 },
  create(w, args) {
    const it = args.item || { text: '在吗' };
    w.setTitle(dn());
    const trap = it.trap;
    const text = trap ? '要我帮你清理一下吗？' : it.text;
    const btns = h('div.pbtns');
    const bye = () => { MIS.popupClosed(it); close(w); };
    if (trap) {
      btns.append(h('button.btn.def', { text: '是', onclick: () => { bye(); emit('popup:yes'); } }), h('button.btn', { text: '否', onclick: () => { bye(); emit('popup:no'); } }));
    } else btns.append(h('button.btn.def', { text: '好', onclick: bye }));
    w.body.append(h('div.pbody', { html: `${icon('bubble')}<p></p>` }), btns);
    w.body.querySelector('p').textContent = text;
    if (!args.quiet) sfx.ding();
    return { close: () => MIS.popupClosed(it) };
  },
});

/* ─────────── 打印队列 ─────────── */
register('printq', {
  title: '打印机', icon: 'printer', single: true, size: { w: 0.5, h: 0.6, minW: 260, minH: 170, maxW: 420 },
  create(w) {
    const box = h('div.pq');
    w.body.append(box);
    const render = () => {
      box.innerHTML = '';
      const pr = G.print || { left: 0, pile: 0 };
      const busy = procs('spool').length > 0;
      const list = h('div.field', { style: { flex: '1', minHeight: '0', overflow: 'auto' } });
      if (busy) {
        const j = h('div.job', { html: `${icon('f_log')}<div style="flex:1"><b>heartbeat.log</b><div class="bar" style="margin-top:4px"><i></i></div></div><small></small>` });
        j.querySelector('i').style.width = `${Math.round(((99 - pr.left) / 99) * 100)}%`;
        j.querySelector('small').textContent = `${99 - pr.left} / 99 页`;
        list.append(j);
      } else list.append(h('div', { style: { padding: '1.4em', textAlign: 'center', color: 'var(--ink2)' }, text: '没有要打印的文档' }));
      box.append(list, h('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap' } },
        h('button.btn', { text: '取消所有文档', disabled: !busy || null, onclick: () => { for (const p of procs('spool')) kill(p.pid); sfx.click(); render(); } }),
        h('span', { style: { flex: '1' } }),
        h('button.btn', { text: `收拾桌上的纸（${pr.pile || 0} 张）`, disabled: !pr.pile || null, onclick: () => { G.print.pile = 0; emit('print'); sfx.crumple(); saveSoon(); render(); } })));
    };
    render();
    const off = on('print', render), off2 = on('procs', render);
    return { close: () => { off(); off2(); } };
  },
});

/* ─────────── 帮助 ─────────── */
register('help', {
  title: '帮助', icon: 'q', single: true, size: { w: 0.66, h: 0.94, minW: 280, maxW: 560 },
  create(w) {
    const box = h('div.help.field');
    box.innerHTML = `
      <h4>这是什么</h4>
      <p>一台老电脑。里面住着一个守护进程，叫 <code></code>。它很热心，很想被你需要。你不理它，它就会自己找事干。</p>
      <h4>每天做什么</h4>
      <p>桌面右上角的便签是今天的维护单。都划掉了，从「开始」→「关机」下班，第二天接着来。电脑运行的天数会一直往上记。</p>
      <h4>怎么操作</h4>
      <p>图标点两下打开。按住一会儿是右键菜单。文件按住一会儿就能拖到别的文件夹，或者拖到回收站。窗口拖标题栏移动，右下角能拉大小。</p>
      <h4>跟它相处</h4>
      <p>它在 PowerShell 里跟你说话。你不会写代码，只能点下面的命令：<code>Get-Status</code> 问它干了什么，<code>Invoke-Praise</code> 夸它，<code>Start-Job</code> 把维护单上的事交给它做——它做得很快，但有时候会多做一点点。</p>
      <p>想要值越高，它越容易闯祸。夸它、陪它说话、给它活干，它就会安静一会儿。</p>
      <h4>它闯了祸怎么办</h4>
      <p>字变成方块：字体在回收站里，去还原。CPU 很烫、内存满了：打开任务管理器，结束它开的进程。实在不知道它动了什么，就问它 <code>Get-Status</code>。蓝屏了也没关系，重启就好，天数不会清零。</p>`;
    box.querySelector('code').textContent = dn();
    scrollable(box);
    w.body.append(box);
    return {};
  },
});
