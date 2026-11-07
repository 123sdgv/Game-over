// 打开文件：记事本、看图、字体预览、放音乐。
import { on, dn, un } from '../state.js';
import * as fs from '../fs.js';
import { h, register, msg, scrollable, close } from '../os.js';
import { picture } from '../art.js';
import { sfx } from '../sfx.js';
import { textOf } from '../content.js';

function create(w, args) {
  const n = fs.node(args.id);
  if (!n) { setTimeout(() => close(w, true)); return {}; }
  const kind = ['jpg', 'bmp'].includes(n.ext) ? 'img' : n.ext === 'ttf' ? 'font' : n.ext === 'mp3' ? 'mp3' : 'text';
  if (kind === 'img') {
    const box = h('div.viewer-img');
    box.append(picture(n.n, 240, 180));
    w.body.append(box, h('div.status', null, h('span', { text: `${n.n}　240 × 180` })));
  } else if (kind === 'font') {
    const serif = /宋|仿宋|Courier|楷/.test(n.n);
    const box = h('div.viewer-font.field', { style: { fontFamily: serif ? '"Songti SC", "STSong", serif' : 'var(--ui)' } });
    const name = n.n.replace(/\.ttf$/, '');
    box.append(h('p', { style: { fontSize: '1.6em', fontWeight: 700 }, text: name }));
    for (const [s, t] of [[1, '天地玄黄，宇宙洪荒。'], [1.3, 'The quick brown fox jumps.'], [1.7, '1234567890'], [2.2, `你好，${un()}`]]) box.append(h('p', { style: { fontSize: `${s}em` }, text: t }));
    w.body.append(box);
  } else if (kind === 'mp3') {
    let seed = 0;
    for (const ch of n.n) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
    const bar = h('div.bar', null, h('i', { style: { width: '0%' } }));
    const play = h('button.btn.def', { text: '▶ 播放' });
    let t = 0;
    play.addEventListener('click', () => {
      sfx.tune(seed);
      let k = 0;
      clearInterval(t);
      t = setInterval(() => { k += 4; bar.firstChild.style.width = `${Math.min(100, k)}%`; if (k >= 100) clearInterval(t); }, 110);
    });
    w.body.append(h('div', { style: { padding: '12px', display: 'flex', flexDirection: 'column', gap: '10px' } },
      h('b', { text: `♪ ${n.n.replace(/\.mp3$/, '')}` }), bar, h('div', { style: { display: 'flex', gap: '6px' } }, play)));
    return { title: `播放器 - ${n.n}`, close: () => clearInterval(t) };
  } else {
    const box = h('div.viewer-text.field');
    const render = () => { const m = fs.node(args.id); box.textContent = m ? textOf(m) : '（文件已经不在了）'; };
    render();
    scrollable(box);
    w.body.append(box);
    const off = n.hb ? on('fs', render) : null;
    return { title: `${n.n} - 记事本`, close: () => off && off() };
  }
  return { title: n.n };
}

register('viewer', { title: '记事本', icon: 'f_txt', create, size: { w: 0.5, h: 0.72, minW: 240, minH: 160, maxW: 460 } });

/** 双击文件时：有些文件不让开 */
export async function openFile(id, openWin) {
  const n = fs.node(id);
  if (!n) return;
  if (n.ext === 'exe') {
    if (n.dexe) return msg({ title: 'daemon.exe', text: `${dn()} 已经在运行了。\n（它一直在运行。）`, ic: 'info' });
    if (n.n === 'explorer.exe') return msg({ title: 'explorer.exe', text: '桌面已经在运行了。', ic: 'info' });
    return msg({ title: n.n, text: '这个程序太旧了，打不开。', ic: 'err' });
  }
  if (['dll', 'vxd', 'cab', 'dat'].includes(n.ext)) return msg({ title: n.n, text: '这是系统文件。打开它没有任何好处。', ic: 'warn' });
  if (n.ext === 'idx') return msg({ title: n.n, text: `打不开。\n${dn()}：这个是我的。`, ic: 'info' });
  return openWin('viewer', { id });
}
