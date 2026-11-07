// 我的电脑 / 文件夹 / 回收站 / 软盘。点一下选中，再点一下打开；按住一会儿拖到别的文件夹；按住不动松手是右键菜单。
import { G, on, emit, fmtMB, dn } from '../state.js';
import * as fs from '../fs.js';
import { os, h, register, open, msg, menu, gesture, scrollable, fx, find, focus } from '../os.js';
import { icon, nodeIcon } from '../art.js';
import { sfx } from '../sfx.js';
import { FILE_KIND } from '../content.js';
import { openFile } from './viewer.js';

const SIDE = [
  ['pc', '我的电脑', 'pc', 0], ['C', '本地磁盘 (C:)', 'drive', 0], ['docs', '我的文档', 'docs', 1], ['work', '工作', 'folder', 2], ['pics', '图片', 'folder', 2], ['music', '音乐', 'folder', 2],
  ['dl', '下载', 'folder', 1], ['win', 'WINDOWS', 'folder', 1], ['A', '软盘 (A:)', 'floppy', 0], ['bin', '回收站', 'bin', 0],
];
const titleOf = (dir) => (dir === 'pc' ? '我的电脑' : dir === 'bin' ? '回收站' : fs.node(dir) ? (fs.node(dir).id === 'C' ? '本地磁盘 (C:)' : fs.node(dir).id === 'A' ? '软盘 (A:)' : fs.node(dir).n) : '找不到');
const binIcon = () => (fs.kids('bin').length ? 'binfull' : 'bin');

/* ─────────── 拖文件 ─────────── */
let drag = null;
function dragStart(ids, g, e) {
  const first = fs.node(ids[0]);
  const ghost = h('div.ghost', { html: `${icon(nodeIcon(first))}<span></span>` });
  ghost.querySelector('span').textContent = ids.length > 1 ? `${ids.length} 个项目` : first.n;
  fx.append(ghost);
  drag = { ids, ghost, over: null, x0: g.x0, y0: g.y0 };
  dragMove(g, e);
  sfx.pop();
}
function dragMove(g, e) {
  if (!drag) return;
  drag.ghost.style.left = `${g.x}px`; drag.ghost.style.top = `${g.y}px`;
  const el = document.elementFromPoint(e.clientX, e.clientY);
  const t = el && el.closest('[data-drop]');
  const ok = t && !drag.ids.includes(t.dataset.drop) ? t : null;
  if (ok !== drag.over) {
    drag.over && drag.over.classList.remove('drop-on');
    drag.over = ok;
    ok && ok.classList.add('drop-on');
  }
}
async function dragEnd(g, cancel) {
  if (!drag) return false;
  const d = drag;
  drag = null;
  d.ghost.remove();
  d.over && d.over.classList.remove('drop-on');
  if (cancel) return true;
  if (Math.hypot(g.x - d.x0, g.y - d.y0) < 9) return false;   // 没怎么动：当成长按
  if (!d.over) return true;
  await doTransfer(d.ids, d.over.dataset.drop);
  return true;
}

export async function doTransfer(ids, dest) {
  if (dest === 'bin') return doDelete(ids);
  if (dest === 'pc') return;
  const toA = fs.driveOf(dest) === 'A';
  const r = fs.transfer(ids, dest);
  if (r.err) { await msg({ title: toA ? '复制失败' : '移动失败', text: r.err, ic: 'warn' }); return; }
  if (r.out && r.out.length) { toA ? copySound() : sfx.pop(); emit('user:moved', ids, dest); }
}
function copySound() { sfx.beep(); const led = document.getElementById('led'); led.classList.add('hdd'); setTimeout(() => led.classList.remove('hdd'), 900); }

export async function doDelete(ids) {
  ids = ids.filter((id) => fs.node(id));
  if (!ids.length) return;
  const n0 = fs.node(ids[0]);
  if (n0.p === 'bin') return doDestroy(ids);
  if (fs.driveOf(ids[0]) === 'A') {
    const i = await msg({ title: '确认删除', text: `软盘上的文件删了就没了，不会进回收站。\n确定删除${ids.length > 1 ? `这 ${ids.length} 项` : `「${n0.n}」`}吗？`, ic: 'warn', buttons: ['删除', '取消'] });
    if (i !== 0) return;
  } else if (ids.some((id) => fs.node(id).sys)) {
    const sysN = ids.map(fs.node).find((n) => n.sys);
    const i = await msg({ title: '删除系统文件夹', text: `「${sysN.n}」是系统文件夹。\n删掉它，电脑可能会出问题。\n\n真的要删吗？`, ic: 'warn', buttons: ['删除', '取消'] });
    if (i !== 0) return;
  }
  const r = fs.trash(ids);
  if (r.err) { await msg({ title: '无法删除', text: r.err, ic: 'err' }); return; }
  sfx.crumple();
  emit('user:deleted', ids);
}
async function doDestroy(ids) {
  const i = await msg({ title: '确认删除', text: `确定要彻底删除${ids.length > 1 ? `这 ${ids.length} 项` : `「${fs.node(ids[0]).n}」`}吗？\n删了就找不回来了。`, ic: 'warn', buttons: ['删除', '取消'] });
  if (i !== 0) return;
  for (const id of ids) fs.destroy(id);
  fs.changed();
  sfx.empty();
  emit('user:destroyed', ids);
}
export async function emptyBinAsk() {
  const items = fs.kids('bin');
  if (!items.length) { await msg({ title: '回收站', text: '回收站已经是空的了。', ic: 'info' }); return; }
  const kb = fs.size('bin');
  const i = await msg({ title: '清空回收站', text: `确定要永久删除这 ${items.length} 项吗？（${fmtMB(kb)}）`, ic: 'warn', buttons: ['清空', '取消'] });
  if (i !== 0) return;
  const gone = fs.emptyBin();
  sfx.empty();
  emit('user:emptied', gone);
}
export function restoreItems(ids) {
  fs.restore(ids);
  sfx.pop();
  emit('user:restored', ids);
}

/** 选一个文件夹（移动到…） */
export function pickFolder(title = '移动到', exclude = []) {
  return new Promise((res) => {
    const list = h('div.field.scroll', { style: { height: '11em', padding: '3px' } });
    const rows = [['C', 0], ['docs', 1], ['work', 2], ['pics', 2], ['music', 2], ['dl', 1], ['win', 1], ['temp', 2], ['A', 0]];
    for (const n of Object.values(G.fs.nodes)) if (n.t === 'd' && n.p === 'docs' && !['work', 'pics', 'music'].includes(n.id)) rows.splice(5, 0, [n.id, 2]);
    let chosen = null;
    const shade = h('div.modal');
    const ok = h('button.btn.def', { text: '确定', disabled: true });
    for (const [id, lv] of rows) {
      const n = fs.node(id);
      if (!n || exclude.includes(id)) continue;
      const b = h('button', { style: { display: 'flex', alignItems: 'center', gap: '.4em', padding: '.25em .4em', paddingLeft: `${0.4 + lv * 1.1}em`, width: '100%', textAlign: 'left' }, html: `${icon(nodeIcon(n), '')}<span></span>` });
      b.querySelector('.ic').style.cssText = 'width:1.4em;height:1.4em';
      b.querySelector('span').textContent = titleOf(id);
      b.addEventListener('click', () => {
        chosen = id; ok.disabled = false;
        for (const x of list.children) { x.style.background = ''; x.style.color = ''; }
        b.style.background = 'var(--sel)'; b.style.color = 'var(--sel-ink)';
      });
      list.append(b);
    }
    scrollable(list);
    const done = (v) => { os.modal--; shade.remove(); res(v); };
    ok.addEventListener('click', () => done(chosen));
    const box = h('div.win.msgbox.on', { style: { width: 'min(20em, 90%)' } },
      h('div.tb', null, h('span.tt', { text: title }), h('div.tbb', null, h('button.b-x', { html: '<i></i>', onclick: () => done(null) }))),
      h('div.wb', null, list, h('div.mbtns', null, ok, h('button.btn', { text: '取消', onclick: () => done(null) }))));
    os.modal++;
    shade.append(box);
    document.getElementById('modal').append(shade);
    sfx.pop();
  });
}

/** 选一个文件（邮件附件） */
export function pickFile(title = '选择附件') {
  return new Promise((res) => {
    const list = h('div.field.scroll', { style: { height: '12em', padding: '3px' } });
    const dirs = ['work', 'pics', 'music', 'docs', 'dl', 'A'];
    for (const n of Object.values(G.fs.nodes)) if (n.t === 'd' && n.p === 'docs' && !dirs.includes(n.id)) dirs.push(n.id);
    let chosen = null;
    const ok = h('button.btn.def', { text: '附上', disabled: true });
    for (const d of dirs) {
      const files = fs.kids(d).filter((k) => k.t === 'f');
      if (!files.length) continue;
      list.append(h('div', { style: { color: 'var(--ink2)', fontSize: '.86em', padding: '.3em .3em .1em' }, text: fs.path(d) }));
      for (const f of files) {
        const b = h('button', { style: { display: 'flex', alignItems: 'center', gap: '.4em', padding: '.22em .4em .22em 1em', width: '100%', textAlign: 'left' }, html: `${icon(nodeIcon(f))}<span></span><small style="margin-left:auto;color:var(--ink2)"></small>` });
        b.querySelector('.ic').style.cssText = 'width:1.35em;height:1.35em;flex:none';
        b.querySelector('span').textContent = f.n;
        b.querySelector('small').textContent = fmtMB(f.kb);
        b.addEventListener('click', () => {
          chosen = f.id; ok.disabled = false;
          for (const x of list.querySelectorAll('button')) { x.style.background = ''; x.style.color = ''; }
          b.style.background = 'var(--sel)'; b.style.color = 'var(--sel-ink)';
        });
        list.append(b);
      }
    }
    scrollable(list);
    const shade = h('div.modal');
    const done = (v) => { os.modal--; shade.remove(); res(v); };
    ok.addEventListener('click', () => done(chosen));
    const box = h('div.win.msgbox.on', { style: { width: 'min(22em, 92%)' } },
      h('div.tb', null, h('span.tt', { text: title }), h('div.tbb', null, h('button.b-x', { html: '<i></i>', onclick: () => done(null) }))),
      h('div.wb', null, list, h('div.mbtns', null, ok, h('button.btn', { text: '取消', onclick: () => done(null) }))));
    os.modal++;
    shade.append(box);
    document.getElementById('modal').append(shade);
    sfx.pop();
  });
}

export function props(n) {
  const kind = n.t === 'd' ? (n.id === 'C' ? '本地磁盘' : n.id === 'A' ? '软盘' : n.sys ? '系统文件夹' : '文件夹') : (FILE_KIND[n.ext] || '文件');
  let text = `名称：${n.n}\n类型：${kind}\n位置：${n.p ? fs.path(n.p) : '我的电脑'}\n大小：${fmtMB(fs.size(n.id))}`;
  if (n.id === 'C') text += `\n可用：${fmtMB(fs.freeC())} / 2 GB`;
  if (n.id === 'A') text += `\n可用：${Math.max(0, Math.floor(fs.freeA()))} KB / 1440 KB`;
  if (n.p === 'bin') text += `\n原来在：${n.from && fs.node(n.from) ? fs.path(n.from) : '?'}`;
  if (n.id === 'dhome') text += `\n\n${dn()} 住在这里。`;
  msg({ title: `${n.n} 属性`, text, ic: 'info', sound: false });
}

/* ─────────── 窗口 ─────────── */
function create(w, args) {
  const st = { dir: args.dir || 'pc', hist: [], sel: new Set(), multi: false };
  const back = h('button.btn.small', { text: '◀', 'aria-label': '后退' });
  const up = h('button.btn.small', { text: '上一级' });
  const addr = h('div.field');
  const tools = h('div.toolbar');
  const side = h('div.exp-side.field.scroll');
  const list = h('div.exp-list.field.scroll');
  const stL = h('span'), stR = h('span');
  w.body.append(h('div.exp-addr', null, back, up, addr), tools, h('div.exp-main', null, side, list), h('div.status', null, stL, stR));

  const go = (dir, push = true) => {
    if (dir !== 'pc' && dir !== 'bin' && !fs.node(dir)) dir = 'C';
    if (push && dir !== st.dir) st.hist.push(st.dir);
    st.dir = dir; st.sel.clear(); st.multi = false;
    list.scrollTop = 0;
    emit('explorer:dir', dir);
    render();
    w.setTitle(titleOf(dir));
  };
  back.addEventListener('click', () => { if (st.hist.length) { sfx.click(); go(st.hist.pop(), false); } });
  up.addEventListener('click', () => {
    sfx.click();
    if (st.dir === 'pc' || st.dir === 'bin') return;
    const n = fs.node(st.dir);
    go(n && n.p ? n.p : 'pc');
  });

  // 侧栏
  for (const [id, name, ic, lv] of SIDE) {
    const b = h('button', { 'data-side': id, html: `${icon(ic)}<span></span>` });
    if (id !== 'pc') b.dataset.drop = id;
    if (lv) b.classList.add('sub'), b.style.paddingLeft = `${0.35 + lv * 0.75}em`;
    b.querySelector('span').textContent = name;
    gesture(b, { scroll: () => side, tap: () => { sfx.click(); go(id); } });
    side.append(b);
  }

  const selected = () => [...st.sel].filter((id) => fs.node(id));
  const openItem = (n) => {
    if (n.t === 'd') { go(n.id); sfx.click(); return; }
    if (n.p === 'bin') { props(n); return; }
    openFile(n.id, open);
  };

  function itemMenu(n, x, y) {
    if (!st.sel.has(n.id)) { st.sel.clear(); st.sel.add(n.id); paintSel(); }
    const ids = selected();
    const inBin = st.dir === 'bin';
    const items = inBin
      ? [{ label: '还原', bold: true, act: () => restoreItems(ids) }, { label: '彻底删除', act: () => doDestroy(ids) }, '-', { label: '属性', act: () => props(n) }]
      : [
        { label: '打开', bold: true, act: () => openItem(n) },
        '-',
        { label: '移动到…', disabled: fs.driveOf(n.id) === 'A', act: async () => { const d = await pickFolder('移动到', [st.dir]); if (d) doTransfer(ids, d); } },
        { label: '复制到软盘 (A:)', disabled: fs.driveOf(n.id) === 'A', act: () => doTransfer(ids, 'A') },
        { label: '删除', act: () => doDelete(ids) },
        '-',
        { label: '属性', act: () => props(n) },
      ];
    menu(x, y, items);
  }

  function paintSel() {
    for (const e of list.children) e.classList.toggle('sel', st.sel.has(e.dataset.id));
    renderTools();
  }

  function renderTools() {
    tools.innerHTML = '';
    const ids = selected();
    const one = ids.length ? fs.node(ids[0]) : null;
    const T = (label, fn, dis = false, ic = null) => {
      const b = h('button.btn', { disabled: dis || null, html: ic ? `${icon(ic)}<span></span>` : '<span></span>' });
      b.querySelector('span').textContent = label;
      b.addEventListener('click', () => { sfx.click(); fn(); });
      tools.append(b);
    };
    if (st.dir === 'bin') {
      T('还原', () => restoreItems(ids), !ids.length);
      T('彻底删除', () => doDestroy(ids), !ids.length);
      tools.append(h('span.sp'));
      T('清空回收站', emptyBinAsk, !fs.kids('bin').length, 'bin');
    } else if (st.dir === 'pc') {
      T('打开', () => one && openItem(one), !one);
      T('属性', () => one && props(one), !one);
    } else {
      T('打开', () => one && openItem(one), ids.length !== 1);
      const onA = fs.driveOf(st.dir) === 'A';
      if (!onA) T('移动到…', async () => { const d = await pickFolder('移动到', [st.dir]); if (d) doTransfer(ids, d); }, !ids.length);
      if (!onA) T('复制到 A:', () => doTransfer(ids, 'A'), !ids.length, 'floppy');
      T('删除', () => doDelete(ids), !ids.length);
      tools.append(h('span.sp'));
      T(st.multi ? '多选 ✓' : '多选', () => { st.multi = !st.multi; if (!st.multi && st.sel.size > 1) { const f = [...st.sel][0]; st.sel.clear(); st.sel.add(f); } paintSel(); });
    }
  }

  function render() {
    // 侧栏高亮
    for (const b of side.children) {
      b.classList.toggle('on', b.dataset.side === st.dir);
      if (b.dataset.side === 'bin') b.querySelector('use').setAttribute('href', `#i-${binIcon()}`);
    }
    addr.innerHTML = `${icon(st.dir === 'pc' ? 'pc' : st.dir === 'bin' ? binIcon() : nodeIcon(fs.node(st.dir)))}<span></span>`;
    addr.querySelector('span').textContent = st.dir === 'pc' ? '我的电脑' : fs.path(st.dir);
    back.disabled = !st.hist.length;
    up.disabled = st.dir === 'pc' || st.dir === 'bin';

    const keepScroll = list.scrollTop;
    list.innerHTML = '';
    let items;
    if (st.dir === 'pc') items = [fs.node('C'), fs.node('A'), fs.node('bin'), { id: '_cp', n: '控制面板', t: 'x', icon: 'control' }, { id: '_pr', n: '打印机', t: 'x', icon: 'printer' }];
    else items = fs.kids(st.dir);
    items = items.filter(Boolean);
    list.classList.toggle('empty', !items.length);
    list.dataset.empty = st.dir === 'bin' ? '回收站是空的' : '这个文件夹是空的';
    for (const n of items) {
      const ic = n.icon || (n.id === 'bin' ? binIcon() : nodeIcon(n));
      const e = h('div.fitem', { 'data-id': n.id, html: `${icon(ic)}<span></span>` });
      e.querySelector('span').textContent = n.id === 'C' ? '本地磁盘 (C:)' : n.id === 'A' ? '软盘 (A:)' : n.n;
      if (n.id === 'C') e.append(h('small', { text: `可用 ${fmtMB(fs.freeC())}` }));
      if (n.id === 'A') e.append(h('small', { text: `可用 ${Math.max(0, Math.floor(fs.freeA()))} KB` }));
      if (n.t === 'f' && st.dir !== 'pc') e.append(h('small', { text: fmtMB(n.kb) }));
      if (n.t === 'd' && n.id !== 'pc') e.dataset.drop = n.id;
      if (n.want && n.p === 'dl') e.classList.add('new');
      if (n.lock === 'daemon') e.classList.add('dim');
      if (st.sel.has(n.id)) e.classList.add('sel');
      list.append(e);
      let last = 0;
      const tapped = () => {
        if (n.t === 'x') { sfx.click(); n.id === '_cp' ? open('control') : open('printq'); return; }
        const t = performance.now();
        const again = st.sel.has(n.id) && st.sel.size === 1 && t - last < 1100;
        if (st.multi) { st.sel.has(n.id) ? st.sel.delete(n.id) : st.sel.add(n.id); sfx.click(); }
        else {
          if (again || t - last < 380) { openItem(n); last = 0; return; }
          st.sel.clear(); st.sel.add(n.id); sfx.click();
        }
        last = t;
        paintSel();
      };
      gesture(e, {
        scroll: () => list,
        tap: tapped,
        dragOnLong: true,
        longMs: 380,
        drag: n.t === 'x' || st.dir === 'pc' ? null : {
          start: (g, ev) => {
            if (!st.sel.has(n.id)) { if (!st.multi) st.sel.clear(); st.sel.add(n.id); paintSel(); }
            dragStart(selected(), g, ev);
          },
          move: (g, dx, dy, ev) => dragMove(g, ev),
          end: async (g, cancel) => { const moved = await dragEnd(g, cancel); if (!moved && !cancel) itemMenu(n, g.x, g.y); },
        },
        long: (g) => (n.t === 'x' ? null : itemMenu(n, g.x, g.y)),
      });
    }
    list.scrollTop = keepScroll;
    renderTools();
    const cnt = items.length;
    stL.textContent = `${cnt} 个对象${st.sel.size ? `，选中 ${st.sel.size} 个` : ''}`;
    stR.textContent = st.dir === 'pc' ? `C: 可用 ${fmtMB(fs.freeC())}` : fs.driveOf(st.dir) === 'A' ? `软盘可用 ${Math.max(0, Math.floor(fs.freeA()))} KB` : st.dir === 'bin' ? `占用 ${fmtMB(fs.size('bin'))}` : `可用 ${fmtMB(fs.freeC())}`;
  }
  // 列表空白处：长按是「粘贴/刷新」之类，点一下取消选择
  gesture(list, {
    scroll: () => list,
    tap: (g, e) => { if (e.target === list) { st.sel.clear(); paintSel(); } },
    long: (g, e) => {
      if (e.target !== list) return;
      const items = st.dir === 'bin' ? [{ label: '清空回收站', act: emptyBinAsk }] : [{ label: '刷新', act: render }];
      if (st.dir !== 'pc' && st.dir !== 'bin') items.push({ label: '属性', act: () => props(fs.node(st.dir)) });
      menu(g.x, g.y, items);
    },
  });

  const off = on('fs', () => { for (const id of [...st.sel]) { const n = fs.node(id); if (!n || (st.dir !== 'pc' && n.p !== st.dir)) st.sel.delete(id); } if (st.dir !== 'pc' && st.dir !== 'bin' && !fs.node(st.dir)) go('C', false); else render(); });
  go(st.dir, false);
  return {
    title: titleOf(st.dir),
    close: off,
    reopen: (a) => { if (a.dir) go(a.dir); },
    get dir() { return st.dir; },
  };
}

register('explorer', { title: '我的电脑', icon: 'pc', create, size: { w: 0.74, h: 0.9, minW: 300, minH: 190, maxW: 680 } });
