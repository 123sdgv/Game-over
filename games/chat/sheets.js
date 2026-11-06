// 各种编辑面板：头像名字、语音、小字、时间、背景、标题小字、表情包管理
import { h, sheet, cropper, toast, confirm } from './ui.js';
import { I, WAVE } from './icons.js';
import { PALETTE, hashColor, initial, fmtTime, dateValue, timeValue, fromInputs, uid } from './data.js';
import { avatarEl, setAvatar, WALLS, applyWall } from './look.js';
import { media, pickFiles, shrink } from './media.js';
import { A, save, sfx } from './state.js';

const field = (label, input) => h('label', { class: 'fld' }, h('span', { class: 'fld-l', text: label }), input);
const primary = (text, onclick) => h('button', { class: 'btn-primary', text, onclick });

/** 头像 + 名字 */
export function personSheet({ title, person, nameLabel = '名字', placeholder = '', okLabel = '完成', onSave }) {
  const p = { name: person.name || '', av: { ...(person.av || {}) } };
  if (!p.av.img && p.av.c == null) p.av.c = hashColor(p.name || uid());
  const preview = avatarEl(p, 's76');
  const chips = h('div', { class: 'chips' });
  const name = h('input', { class: 'inp', type: 'text', maxlength: 20, value: p.name, placeholder, enterkeyhint: 'done', autocomplete: 'off' });

  const album = () => pickFiles().then(async ([f]) => {
    if (!f) return;
    const url = await cropper(f);
    if (url) { p.av = { img: url }; refresh(); sfx.pop(); }
  });
  const refresh = () => {
    setAvatar(preview, p);
    chips.replaceChildren(
      ...PALETTE.map((pal, i) => h('button', {
        class: 'chip-av' + (!p.av.img && p.av.c === i ? ' on' : ''),
        style: { backgroundImage: `linear-gradient(155deg, ${pal[0]}, ${pal[1]})` },
        text: initial(p.name), 'aria-label': '文字头像',
        onclick: () => { p.av = { c: i }; refresh(); sfx.tick(); },
      })),
      h('button', { class: 'chip-av photo' + (p.av.img ? ' on' : ''), html: I.photo, 'aria-label': '从相册选', onclick: album }),
    );
  };
  name.addEventListener('input', () => { p.name = name.value; refresh(); });
  name.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) name.blur(); });
  preview.addEventListener('click', album);
  refresh();

  const s = sheet({
    title,
    body: h('div', { class: 'sheet-body' },
      h('div', { class: 'pv' }, preview, h('div', { class: 'pv-tip', text: '点头像从相册选，或者选一个文字头像' })),
      chips,
      field(nameLabel, name),
      primary(okLabel, () => { p.name = name.value.trim(); s.close(); onSave(p); })),
  });
  return s;
}

/** 语音条：秒数 + 转文字 */
export function voiceSheet({ title = '语音', sec = 6, text = '', okLabel = '发送', onSave }) {
  const big = h('div', { class: 'v-big' });
  const demo = h('div', { class: 'v-demo' }, h('span', { html: WAVE }), big);
  const range = h('input', { type: 'range', class: 'range', min: 1, max: 60, step: 1, value: sec });
  const ta = h('textarea', { class: 'inp area', rows: 3, placeholder: '这条语音说了什么（可以不填，长按语音能转文字）' });
  ta.value = text;
  const upd = () => {
    big.textContent = `${range.value}″`;
    demo.style.width = Math.round(Math.min(230, 76 + range.value * 3.2)) + 'px';
  };
  range.addEventListener('input', () => { upd(); if (+range.value % 5 === 0) sfx.tick(); });
  upd();
  const s = sheet({
    title,
    body: h('div', { class: 'sheet-body' },
      h('div', { class: 'v-stage' }, demo),
      h('div', { class: 'range-row' }, h('span', { text: '1″' }), range, h('span', { text: '60″' })),
      field('转文字', ta),
      primary(okLabel, () => { s.close(); onSave({ sec: +range.value, text: ta.value.trim() }); })),
  });
  return s;
}

/** 居中的灰色小字 */
export function sysSheet({ title = '小字', text = '', okLabel = '插入', onSave }) {
  const ta = h('textarea', { class: 'inp area', rows: 2, maxlength: 120, placeholder: '比如：以下是新消息' });
  ta.value = text;
  const s = sheet({
    title,
    body: h('div', { class: 'sheet-body' },
      h('p', { class: 'sheet-tip', text: '会显示在聊天中间，像系统提示那样的灰色小字。' }),
      field('内容', ta),
      primary(okLabel, () => { const v = ta.value.trim(); if (!v) { ta.focus(); return; } s.close(); onSave(v); })),
  });
  setTimeout(() => ta.focus(), 360);
  return s;
}

/** 时间：日期、时刻、几个快捷按钮 */
export function timeSheet({ title = '时间', t, okLabel = '插入', onSave }) {
  let cur = t;
  const big = h('div', { class: 't-big' });
  const d = h('input', { type: 'date', class: 'inp' });
  const tm = h('input', { type: 'time', class: 'inp' });
  const sync = () => { big.textContent = fmtTime(cur); d.value = dateValue(cur); tm.value = timeValue(cur); };
  const read = () => { cur = fromInputs(d.value, tm.value, cur); big.textContent = fmtTime(cur); };
  d.addEventListener('change', read); tm.addEventListener('change', read);
  d.addEventListener('input', read); tm.addEventListener('input', read);
  const q = (label, fn) => h('button', { class: 'qbtn', text: label, onclick: () => { cur = fn(cur); sync(); sfx.tick(); } });
  sync();
  const s = sheet({
    title,
    body: h('div', { class: 'sheet-body' },
      h('div', { class: 't-show' }, h('span', { class: 't-pill' }, big)),
      h('div', { class: 'two' }, field('日期', d), field('时刻', tm)),
      h('div', { class: 'qrow' },
        q('现在', () => Date.now()), q('+5 分钟', (x) => x + 5 * 60e3), q('+1 小时', (x) => x + 3600e3),
        q('+1 天', (x) => x + 864e5), q('−1 天', (x) => x - 864e5)),
      h('p', { class: 'sheet-tip', text: '跟手机一样按今天来显示：今天只显示时刻，昨天显示「昨天」，一周内显示星期几。' }),
      primary(okLabel, () => { read(); s.close(); onSave(cur); })),
  });
  return s;
}

/** 标题下面那行小字 */
export function subSheet({ text = '', onSave }) {
  const inp = h('input', { class: 'inp', type: 'text', maxlength: 24, value: text, placeholder: '不填就不显示', enterkeyhint: 'done' });
  const chip = (v) => h('button', { class: 'qbtn', text: v || '不显示', onclick: () => { inp.value = v; sfx.tick(); } });
  const s = sheet({
    title: '标题下的小字',
    body: h('div', { class: 'sheet-body' },
      field('内容', inp),
      h('div', { class: 'qrow' }, chip(''), chip('在线'), chip('对方正在输入…'), chip('刚刚在线')),
      primary('完成', () => { s.close(); onSave(inp.value.trim()); })),
  });
  inp.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) inp.blur(); });
  return s;
}

/** 聊天背景。follow：这段对话可以选「跟默认一样」 */
export function wallSheet({ title = '聊天背景', current, follow = false, onPick }) {
  const grid = h('div', { class: 'wall-grid' });
  const tile = (label, spec, extra) => {
    const sw = h('div', { class: 'wall mini' }, h('i', { class: 'mb l' }), h('i', { class: 'mb r' }));
    if (spec === null) sw.dataset.wall = 'follow';
    else applyWall(sw, spec);
    const on = JSON.stringify(spec) === JSON.stringify(current);
    return h('button', { class: 'wall-tile' + (on ? ' on' : ''), onclick: extra || (() => { s.close(); onPick(spec); sfx.tick(); }) },
      sw, h('span', { text: label }), on && h('i', { class: 'wall-check', html: I.check }));
  };
  const fromAlbum = () => pickFiles().then(async ([f]) => {
    if (!f) return;
    try {
      const { blob } = await shrink(f, { max: 1600, q: 0.86 });
      const id = 'w' + uid();
      await media.put(id, blob);
      s.close();
      onPick({ img: id });
      sfx.pop();
    } catch { toast('这张图读不出来'); }
  });
  grid.append(...[
    follow && tile('跟默认一样', null),
    ...WALLS.map((w) => tile(w.name, w.id)),
    current && typeof current === 'object' && tile('相册里的', current),
    h('button', { class: 'wall-tile', onclick: fromAlbum }, h('div', { class: 'wall mini album', html: I.photo }), h('span', { text: '从相册选' })),
  ].filter(Boolean));
  const s = sheet({ title, body: h('div', { class: 'sheet-body' }, grid) });
  return s;
}

/** 表情包：加图、删图 */
export async function addStickers() {
  const files = await pickFiles({ multiple: true });
  let n = 0;
  for (const f of files.slice(0, 30)) {
    try {
      const png = !/jpe?g/i.test(f.type);
      const { blob, w, h: hh } = await shrink(f, { max: 360, type: png ? 'image/png' : 'image/jpeg', q: 0.9, keepAnim: true });
      const id = 's' + uid();
      await media.put(id, blob);
      A.D.stickers.push({ id, w, h: hh });
      n++;
    } catch {}
  }
  if (n) { save(); sfx.pop(); toast(`加了 ${n} 个表情`); }
  return n;
}

export function stickerImg(st, cls = 'stk-img') {
  const img = h('img', { class: cls, alt: '', draggable: 'false' });
  media.url(st.id).then((u) => { if (u) img.src = u; else img.classList.add('lost'); });
  return img;
}

export function stickerManager(onChange) {
  const grid = h('div', { class: 'stk-manage' });
  const draw = () => {
    grid.replaceChildren(
      h('button', { class: 'stk-cell add', html: I.add, 'aria-label': '加表情', onclick: () => addStickers().then((n) => { if (n) { draw(); onChange && onChange(); } }) }),
      ...A.D.stickers.map((st) => h('div', { class: 'stk-cell' }, stickerImg(st),
        h('button', { class: 'stk-x', html: I.close, 'aria-label': '删掉', onclick: async () => {
          if (!(await confirm({ title: '删掉这个表情？', message: '已经发出去的不受影响。', ok: '删掉', danger: true }))) return;
          A.D.stickers = A.D.stickers.filter((x) => x !== st);
          save(); draw(); onChange && onChange(); sfx.del();
        } }))),
    );
  };
  draw();
  return sheet({ title: '我的表情', body: h('div', { class: 'sheet-body' }, h('p', { class: 'sheet-tip', text: '从相册加图片当表情包，动图也行。发出去会按表情包的大小显示，不带气泡。' }), grid) });
}
