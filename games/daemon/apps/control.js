// 控制面板：外观、壁纸、终端、名字、声音、字体、系统。个性化都在这里。
import { G, P, S, ST, on, emit, setPref, setSetting, dn, un, saveSoon, fmtMB } from '../state.js';
import * as fs from '../fs.js';
import { h, register, msg, scrollable, open, os } from '../os.js';
import { icon, WALLS, WALL_COLORS, wallpaper } from '../art.js';
import { sfx } from '../sfx.js';

export const THEMES = [
  { id: 'classic', name: '经典', a: '#0d2c7e', b: '#3a86d8', c: '#cdcbc4' },
  { id: 'milk', name: '奶茶', a: '#7a4a36', b: '#c98d6b', c: '#e6dccf' },
  { id: 'mint', name: '薄荷', a: '#23705d', b: '#62b89d', c: '#d3e2da' },
  { id: 'sakura', name: '樱花', a: '#a8476a', b: '#e78ea8', c: '#f0dfe3' },
  { id: 'night', name: '夜', a: '#3c2f86', b: '#8a68d6', c: '#353846' },
  { id: 'mono', name: '黑白', a: '#111111', b: '#555555', c: '#e2e2e2' },
];
export const TERMS = [
  { id: 'blue', name: '蓝底', bg: '#012456', fg: '#eef1f8', d: '#ffd34d' },
  { id: 'green', name: '绿字', bg: '#050d07', fg: '#8dff9e', d: '#d6ffdc' },
  { id: 'amber', name: '琥珀', bg: '#140c02', fg: '#ffbf4d', d: '#ffe2a8' },
  { id: 'night', name: '夜紫', bg: '#12141c', fg: '#d8dbe8', d: '#c9a8ff' },
  { id: 'peach', name: '桃子', bg: '#2a1420', fg: '#ffe1ea', d: '#ff8fb8' },
  { id: 'paper', name: '白纸', bg: '#fbfaf6', fg: '#2a2a2a', d: '#b0306a' },
];

/* 相册里的壁纸存在 IndexedDB（和大厅同一个库） */
let dbp;
function db() {
  return (dbp ||= new Promise((res, rej) => {
    const r = indexedDB.open('pp-files', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('files');
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  }));
}
export async function photoURL() {
  try {
    const d = await db();
    const blob = await new Promise((res, rej) => { const t = d.transaction('files', 'readonly').objectStore('files').get('daemon.wall'); t.onsuccess = () => res(t.result); t.onerror = () => rej(t.error); });
    return blob ? URL.createObjectURL(blob) : null;
  } catch { return null; }
}
async function savePhoto(file) {
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.src = url;
  await img.decode().catch(() => {});
  const k = Math.min(1, 1600 / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
  const cv = document.createElement('canvas');
  cv.width = Math.max(1, Math.round(img.naturalWidth * k)); cv.height = Math.max(1, Math.round(img.naturalHeight * k));
  cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
  URL.revokeObjectURL(url);
  const blob = await new Promise((r) => cv.toBlob(r, 'image/jpeg', 0.86));
  const d = await db();
  await new Promise((res, rej) => { const t = d.transaction('files', 'readwrite'); t.objectStore('files').put(blob, 'daemon.wall'); t.oncomplete = res; t.onerror = () => rej(t.error); });
}

const seg = (opts, cur, set) => {
  const s = h('div.seg');
  for (const [v, label] of opts) s.append(h('button', { text: label, class: v === cur ? 'on' : null, onclick: () => { sfx.click(); set(v); } }));
  return s;
};
const chk = (label, on0, set) => {
  const b = h('button.chk', { class: on0 ? 'on' : null }, h('i'), h('span', { text: label }));
  b.addEventListener('click', () => { sfx.click(); set(!b.classList.contains('on')); });
  return b;
};

function create(w, args) {
  let page = args.page || 'look';
  const side = h('div.cp-side.field');
  const body = h('div.cp-page.field.scroll');
  w.body.append(h('div.cp-main', null, side, body));
  scrollable(body);
  const PAGES = [['look', '外观'], ['wall', '壁纸'], ['term', '终端'], ['name', '名字'], ['sound', '声音'], ['font', '字体'], ['sys', '系统']];
  for (const [k, name] of PAGES) side.append(h('button', { 'data-p': k, text: name, onclick: () => { page = k; sfx.click(); render(); } }));

  function render() {
    for (const b of side.children) b.classList.toggle('on', b.dataset.p === page);
    body.innerHTML = '';
    const grp = (title, ...kids) => h('div.grp', null, h('h4', { text: title }), ...kids);
    if (page === 'look') {
      const sw = h('div.swatches');
      for (const t of THEMES) {
        const b = h('button.swatch', { class: P.theme === t.id ? 'on' : null }, h('div.sw.th', { style: { '--a': t.a, '--b': t.b, '--c': t.c } }, h('i'), h('i')), h('span', { text: t.name }));
        b.querySelector('.sw').style.setProperty('--a', t.a); b.querySelector('.sw').style.setProperty('--b', t.b); b.querySelector('.sw').style.setProperty('--c', t.c);
        b.addEventListener('click', () => { sfx.click(); setPref('theme', t.id); render(); });
        sw.append(b);
      }
      const prev = h('div.cp-preview', null, h('div.mini', null, h('i')));
      prev.style.backgroundColor = 'var(--wall0)';
      body.append(grp('主题', sw),
        grp('窗口', h('div.line', null, h('b', { text: '样式' }), seg([['bevel', '立体'], ['soft', '圆润']], P.style, (v) => { setPref('style', v); render(); })),
          h('div.line', null, h('b', { text: '字号' }), seg([[1, '小'], [2, '中'], [3, '大']], P.fontSize, (v) => { setPref('fontSize', v); render(); })), prev),
        grp('效果', chk('窗口动画', P.anim, (v) => { setPref('anim', v); render(); }), chk('老显示器扫描线', P.crt, (v) => { setPref('crt', v); render(); })));
    } else if (page === 'wall') {
      if (G.desk.dwall) body.append(h('div.grp', null, h('div.hint', { text: `现在的壁纸是 ${dn()} 画的。` }), h('div.line', null, h('button.btn.def', { text: '恢复我的壁纸', onclick: () => { G.desk.dwall = null; emit('wall'); saveSoon(); sfx.click(); render(); } }))));
      const sw = h('div.swatches');
      for (const wl of WALLS) {
        const b = h('button.swatch', { class: P.wall === wl.id && !G.desk.dwall ? 'on' : null }, h('div.sw'), h('span', { text: wl.name }));
        b.querySelector('.sw').style.backgroundImage = `url(${wallpaper(wl.id, 120, 70)})`;
        b.addEventListener('click', () => { sfx.click(); G.desk.dwall = null; setPref('wall', wl.id); emit('wall'); saveSoon(); render(); });
        sw.append(b);
      }
      const ph = h('button.swatch', { class: P.wall === 'photo' && !G.desk.dwall ? 'on' : null }, h('div.sw', { style: { display: 'grid', placeItems: 'center', background: 'var(--face-hi)' }, html: icon('f_jpg') }), h('span', { text: '照片' }));
      ph.querySelector('.ic').style.cssText = 'width:1.8em;height:1.8em';
      if (P.photo) photoURL().then((u) => { if (u) { const s = ph.querySelector('.sw'); s.innerHTML = ''; s.style.backgroundImage = `url(${u})`; } });
      const file = h('input', { type: 'file', accept: 'image/*', style: { display: 'none' } });
      file.addEventListener('change', async () => {
        const f = file.files && file.files[0];
        if (!f) return;
        try { await savePhoto(f); setPref('photo', true); G.desk.dwall = null; setPref('wall', 'photo'); emit('wall'); saveSoon(); render(); }
        catch { msg({ title: '壁纸', text: '这张图片读不出来。', ic: 'err' }); }
      });
      ph.addEventListener('click', () => { sfx.click(); if (P.photo) { G.desk.dwall = null; setPref('wall', 'photo'); emit('wall'); render(); } else file.click(); });
      sw.append(ph);
      const dots = h('div.swatches');
      for (const c of WALL_COLORS) {
        const d = h('button.cdot', { class: P.wallColor === c ? 'on' : null, style: { background: c }, 'aria-label': c });
        d.addEventListener('click', () => { sfx.click(); setPref('wallColor', c); if (!['teal', 'grid'].includes(P.wall)) setPref('wall', 'teal'); G.desk.dwall = null; emit('wall'); render(); });
        dots.append(d);
      }
      body.append(grp('图案', sw), grp('颜色（纯色和格子用）', dots), h('div.line', null, h('button.btn', { text: '从相册换一张照片…', onclick: () => file.click() })), file);
    } else if (page === 'term') {
      const sw = h('div.swatches');
      for (const t of TERMS) {
        const b = h('button.swatch', { class: P.term === t.id ? 'on' : null }, h('div.sw', { style: { background: t.bg, color: t.fg, fontFamily: 'var(--mono)', fontSize: '.8em', display: 'flex', alignItems: 'center', justifyContent: 'center' } }), h('span', { text: t.name }));
        const sp = b.querySelector('.sw');
        sp.append(h('span', { style: { color: t.d }, text: '>' }), h('span', { text: '_ hi' }));
        b.addEventListener('click', () => { sfx.click(); setPref('term', t.id); render(); });
        sw.append(b);
      }
      body.append(grp('配色', sw), grp('它打字的速度', seg([[1, '慢'], [2, '正常'], [3, '快']], S.typeSpeed || 2, (v) => { setSetting('typeSpeed', v); render(); })));
    } else if (page === 'name') {
      const mk = (label, key, ph) => {
        const inp = h('input.tinput', { value: P[key], placeholder: ph, maxlength: 12 });
        const commit = () => { const v = inp.value.trim().slice(0, 12) || ph; if (v !== P[key]) { setPref(key, v); sfx.click(); emit('names'); } };
        inp.addEventListener('change', commit); inp.addEventListener('blur', commit);
        inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') inp.blur(); });
        return h('div.line', null, h('b', { text: label }), inp);
      };
      body.append(grp('名字', mk('它叫', 'dname', 'daemon'), mk('你叫', 'uname', 'gray')), h('div.hint', { text: '改了以后，终端里它就用新名字跟你说话。任务管理器里的进程名还是 daemon.exe（进程名是改不了的）。' }));
    } else if (page === 'sound') {
      body.append(grp('声音', chk('音效', S.sound, (v) => { setSetting('sound', v); render(); }), chk('发邮件时的拨号声', P.modem, (v) => { setPref('modem', v); render(); })),
        h('div.hint', { text: '手机静音开关打开的时候听不到。' }));
    } else if (page === 'font') {
      const ok = fs.fontsOK();
      const inBin = fs.node('fonts') && fs.node('fonts').p === 'bin';
      const kv = h('dl.kv', null, h('dt', { text: '字体文件夹' }), h('dd', { text: ok ? 'C:\\WINDOWS\\FONTS' : inBin ? '在回收站里' : '没有了' }), h('dt', { text: '字体数量' }), h('dd', { text: ok ? `${fs.kids('fonts').length} 个` : '0 个' }));
      body.append(grp('字体', kv));
      if (inBin) body.append(h('div.line', null, h('button.btn.def', { text: '打开回收站', onclick: () => open('explorer', { dir: 'bin' }) })), h('div.hint', { text: '在回收站里选中 FONTS，点「还原」。' }));
      else if (!ok) {
        const bar = h('div.bar', null, h('i', { style: { width: '0%' } }));
        const go = h('button.btn.def', { html: `${icon('cd')}<span>从光盘重新安装字体</span>`, style: { display: 'inline-flex', alignItems: 'center', gap: '.5em' }, onclick: () => {
          go.disabled = true; sfx.cd();
          let k = 0;
          const t = setInterval(() => {
            k += 2; bar.firstChild.style.width = `${Math.min(100, k)}%`;
            if (k % 20 === 0) sfx.cd();
            if (k >= 100) { clearInterval(t); fs.rebuildFonts(); G.fontsGone = false; emit('fonts'); emit('fs:reinstalled'); sfx.check(); render(); }
          }, 300);
        } });
        go.querySelector('.ic').style.cssText = 'width:2em;height:2em';
        body.append(h('div.line', null, go), bar, h('div.hint', { text: '要读一会儿光盘。' }));
      } else body.append(h('div.hint', { text: '字体都在。' }));
    } else if (page === 'sys') {
      body.append(grp('这台电脑', h('dl.kv', null,
        h('dt', { text: '已经运行' }), h('dd', { text: `${G.day} 天` }),
        h('dt', { text: '内存' }), h('dd', { text: '64 MB' }),
        h('dt', { text: '硬盘' }), h('dd', { text: `2 GB（可用 ${fmtMB(fs.freeC())}）` }),
        h('dt', { text: '守护进程' }), h('dd', { text: `${dn()}（daemon.exe）` }),
        h('dt', { text: '它闯过的祸' }), h('dd', { text: `${ST.mischief || 0} 次` }),
        h('dt', { text: '你收拾的' }), h('dd', { text: `${ST.fixed || 0} 次` }),
        h('dt', { text: '蓝屏' }), h('dd', { text: `${ST.crashes || 0} 次` }))),
        grp('重来', h('div.hint', { text: '换一台新电脑：文件、邮件、它记得的事都会清空，天数从第 1 天开始。外观设置和记录会留着。' }),
          h('div.line', null, h('button.btn', { text: '重置这台电脑…', onclick: async () => {
            const i = await msg({ title: '重置这台电脑', text: `真的要重置吗？\n${dn()} 会忘记你。`, ic: 'warn', buttons: ['重置', '取消'] });
            if (i !== 0) return;
            const j = await msg({ title: dn(), text: '……真的吗。', ic: 'q', buttons: ['真的', '算了'] });
            if (j === 0) emit('reset');
          } }))));
    }
  }
  render();
  const off = on('fonts', () => page === 'font' && render());
  const off2 = on('prefs', (k) => { if (k === 'theme' || k === 'style') {} });
  return { title: '控制面板', close: () => { off(); off2(); }, reopen: (a) => { if (a.page) { page = a.page; render(); } } };
}

register('control', { title: '控制面板', icon: 'control', single: true, create, size: { w: 0.66, h: 0.94, minW: 300, minH: 210, maxW: 560 } });
