// PowerShell：跟它说话的地方。它的话一个字一个字打出来；你只能点下面的命令（你不会写代码）。
import { G, P, S, RT, on, emit, un, dn } from '../state.js';
import { h, register, scrollable, os } from '../os.js';
import { sfx } from '../sfx.js';
import * as daemon from '../daemon.js';

const prompt = () => `PS C:\\Users\\${un()}>`;

function lineEl(e) {
  const d = h(`div.tl.${e.k}`);
  if (e.k === 'd') { d.append(h('b', { text: `${dn()}> ` }), h('span')); d.lastChild.textContent = ''; }
  else if (e.k === 'me') { d.append(h('b', { text: `${prompt()} ` }), h('span', { text: e.t })); }
  else if (e.k === 'log') { d.append(h('span.dot', { text: '● ' }), h('span.fn', { text: e.f }), h('span.arg', { text: e.kv ? `  ${e.a}` : `(${e.a})` })); }
  else if (e.k === 'sub') d.textContent = `└ ${e.t}`;
  else d.textContent = e.t;
  return d;
}
const fullText = (e) => (e.k === 'd' ? e.t : '');

function create(w) {
  const term = h('div.term', { 'data-t': P.term });
  const out = h('div.tout.scroll');
  const cmds = h('div.tcmds');
  term.append(out, cmds);
  w.body.append(term);
  scrollable(out);
  const promptLine = h('div.tl.me', null, h('b', { text: `${prompt()} ` }), h('span'), h('i.caret'));
  let menu = null, queue = [], busy = false, typingCmd = false, timer = 0;

  const bottom = () => { out.scrollTop = out.scrollHeight; };
  function renderAll() {
    out.innerHTML = '';
    for (const e of G.term) {
      const el = lineEl(e);
      if (e.k === 'd') el.lastChild.textContent = e.t;
      out.append(el);
    }
    out.append(promptLine);
    bottom();
  }
  const cps = () => [22, 40, 75][(S.typeSpeed || 2) - 1];

  /** 一行一行打出来 */
  function pump() {
    if (busy) return;
    const e = queue.shift();
    if (!e) { RT.typing = typingCmd; renderCmds(); return; }
    busy = true; RT.typing = true;
    renderCmds();
    const el = lineEl(e);
    out.insertBefore(el, promptLine);
    bottom();
    const txt = fullText(e);
    if (!txt) { timer = setTimeout(() => { busy = false; pump(); }, e.k === 'log' || e.k === 'sub' ? 170 : 40); return; }
    let i = 0;
    const span = el.lastChild;
    const step = () => {
      const k = Math.max(1, Math.round(cps() / 30));
      i = Math.min(txt.length, i + k);
      span.textContent = txt.slice(0, i);
      if (i % 2 === 0) sfx.type();
      bottom();
      if (i < txt.length) timer = setTimeout(step, 1000 / 30);
      else timer = setTimeout(() => { busy = false; pump(); }, /[。！？…]$/.test(txt) ? 320 : 160);
    };
    step();
  }
  const offTerm = on('term', (entries) => { queue.push(...entries); pump(); });
  const offClear = on('term:clear', () => { queue = []; clearTimeout(timer); busy = false; renderAll(); renderCmds(); });

  /** 下面那排命令 */
  function renderCmds() {
    cmds.innerHTML = '';
    const list = daemon.commands(menu);
    const dis = busy || typingCmd || queue.length > 0;
    cmds.append(h('div.cap', null, h('span', { text: menu === 'job' ? '交给它做什么？' : menu === 'talk' ? '跟它说什么？' : G.d.ask ? '它在等你回答：' : G.d.alive ? '你不会写代码，只能点命令：' : '它不在了。' }), h('span', { text: G.d.alive ? `想要 ${Math.round(G.d.want)}%` : '' })));
    for (const c of list) {
      const b = h(`button.tcmd${c.ask ? '.ask' : ''}${c.back ? '.back' : ''}`, { disabled: dis || null }, h('code', { text: c.c }), h('small', { text: c.l }));
      b.addEventListener('click', () => choose(c));
      cmds.append(b);
    }
  }
  function choose(c) {
    if (busy || typingCmd) return;
    if (c.back) { menu = null; sfx.click(); renderCmds(); return; }
    if (c.sub) { menu = c.sub; sfx.click(); renderCmds(); return; }
    menu = null;
    typingCmd = true; RT.typing = true;
    renderCmds();
    const span = promptLine.children[1];
    let i = 0;
    const txt = c.c;
    const step = () => {
      i = Math.min(txt.length, i + 2);
      span.textContent = txt.slice(0, i);
      sfx.type();
      if (i < txt.length) timer = setTimeout(step, 28);
      else timer = setTimeout(() => {
        sfx.enter();
        span.textContent = '';
        typingCmd = false;
        if (c.id !== 'clear') {
          const me = { k: 'me', t: txt };
          G.term.push(me);
          out.insertBefore(lineEl(me), promptLine);
        }
        daemon.exec(c);
        RT.typing = busy;
        renderCmds();
        bottom();
      }, 180);
    };
    step();
  }
  const offAsk = on('daemon:ask', () => renderCmds());
  const offD = on('daemon', () => { if (!busy) renderCmds(); });
  const offMenu = on('shell:menu', (m) => { menu = m; renderCmds(); });
  const offPref = on('prefs', (k) => { if (k === 'term') term.dataset.t = P.term; if (k === 'uname' || k === 'dname') renderAll(); });

  renderAll();
  renderCmds();
  document.getElementById('trayD').classList.remove('ping');
  return {
    title: 'PowerShell',
    close: () => { offTerm(); offClear(); offAsk(); offD(); offMenu(); offPref(); clearTimeout(timer); RT.typing = false; },
    focus: () => document.getElementById('trayD').classList.remove('ping'),
    resize: bottom,
  };
}

register('shell', { title: 'PowerShell', icon: 'term', single: true, create, size: { w: 0.62, h: 0.94, minW: 280, minH: 200, maxW: 620, maxH: 520 } });
