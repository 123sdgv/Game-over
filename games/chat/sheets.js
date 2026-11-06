// 各种编辑面板：头像名字、语音、小字、时间、背景、标题小字、表情包管理
import { h, sheet, cropper, toast, confirm } from './ui.js';
import { I, WAVE } from './icons.js';
import { hashColor, fmtTime, dateValue, timeValue, fromInputs, uid } from './data.js';
import { avatarEl, groupAvatarEl, WALLS, applyWall, PENDANTS, BUBBLES, FONTS } from './look.js';
import { LINKS, LINK_FIELDS, detectLink, linkCard } from './cards.js';
import { media, pickFiles, shrink } from './media.js';
import { A, save, sfx } from './state.js';

const field = (label, input) => h('label', { class: 'fld' }, h('span', { class: 'fld-l', text: label }), input);
const primary = (text, onclick) => h('button', { class: 'btn-primary', text, onclick });

/** 头像 + 名字 + 挂件。头像只能点一下从相册换（gray 说不要那排彩色文字头像） */
export function personSheet({ title, person, nameLabel = '名字', placeholder = '', okLabel = '完成', onSave, frames = true }) {
  const p = { name: person.name || '', av: { ...(person.av || {}) }, frame: person.frame ? { ...person.frame } : null };
  if (!p.av.img && p.av.c == null) p.av.c = hashColor(p.name || uid());
  const preview = h('button', { class: 'pv-av', 'aria-label': '换头像' });
  const reset = h('button', { class: 'btn-link', text: '不用照片了' });
  const name = h('input', { class: 'inp', type: 'text', maxlength: 20, value: p.name, placeholder, enterkeyhint: 'done', autocomplete: 'off' });
  const tiles = h('div', { class: 'pend-row' });
  const ftext = h('input', { class: 'inp', type: 'text', maxlength: 12, placeholder: '挂件上的字', enterkeyhint: 'done' });
  const ftextFld = field('挂件上的字', ftext);

  const album = () => pickFiles().then(async ([f]) => {
    if (!f) return;
    const url = await cropper(f);
    if (url) { p.av = { img: url }; refresh(); sfx.pop(); }
  });
  const refresh = () => {
    preview.replaceChildren(avatarEl(p, 's84', { frame: true }), h('i', { class: 'pv-cam', html: I.photo }));
    reset.hidden = !p.av.img;
    if (frames) {
      tiles.replaceChildren(
        h('button', { class: 'pend-tile' + (!p.frame ? ' on' : ''), onclick: () => { p.frame = null; refresh(); sfx.tick(); } }, h('span', { class: 'pend-none', text: '无' }), h('small', { text: '不戴' })),
        ...PENDANTS.map((d) => h('button', { class: 'pend-tile' + (p.frame && p.frame.id === d.id ? ' on' : ''), onclick: () => {
          p.frame = { id: d.id, ...(d.text ? { text: (p.frame && p.frame.text) || d.text } : {}) };
          ftext.value = p.frame.text || '';
          refresh(); sfx.tick();
        } }, avatarEl({ ...p, frame: { id: d.id, text: d.text } }, 's40', { frame: true }), h('small', { text: d.name }))));
      const d = p.frame && PENDANTS.find((x) => x.id === p.frame.id);
      ftextFld.hidden = !(d && d.text);
    }
  };
  name.addEventListener('input', () => { p.name = name.value; refresh(); });
  name.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) name.blur(); });
  ftext.addEventListener('input', () => { if (p.frame) { p.frame.text = ftext.value; preview.replaceChildren(avatarEl(p, 's84', { frame: true }), h('i', { class: 'pv-cam', html: I.photo })); } });
  ftext.value = (p.frame && p.frame.text) || '';
  preview.addEventListener('click', album);
  reset.addEventListener('click', () => { p.av = { c: hashColor(p.name || uid()) }; refresh(); });
  refresh();

  const s = sheet({
    title,
    body: h('div', { class: 'sheet-body' },
      h('div', { class: 'pv' }, preview, h('div', { class: 'pv-tip', text: '点头像从相册换一张' }), reset),
      field(nameLabel, name),
      frames && h('div', { class: 'fld' }, h('span', { class: 'fld-l', text: '头像挂件' }), tiles),
      frames && ftextFld,
      primary(okLabel, () => {
        p.name = name.value.trim();
        if (p.frame && PENDANTS.find((x) => x.id === p.frame.id && x.text)) p.frame.text = ftext.value.trim() || PENDANTS.find((x) => x.id === p.frame.id).text;
        s.close(); onSave(p);
      })),
  });
  return s;
}

/** 分段选择 */
export function seg(options, value, onChange) {
  const el = h('div', { class: 'seg' });
  const draw = () => el.replaceChildren(...options.map((o) => h('button', { class: o.v === value ? 'on' : '', text: o.label, onclick: () => { value = o.v; draw(); sfx.tick(); onChange(value); } })));
  draw();
  return el;
}

const amountInput = (v) => h('input', { class: 'inp amt', type: 'text', inputmode: 'decimal', value: v, placeholder: '0.00', autocomplete: 'off' });
const cleanAmount = (v, d) => { const n = parseFloat(String(v).replace(/[^\d.]/g, '')); return Number.isFinite(n) && n > 0 ? String(Math.round(n * 100) / 100) : d; };

/** 红包 */
export function redpacketSheet({ init = {}, okLabel = '塞进红包', onSave }) {
  let state = init.state || 'new';
  const amt = amountInput(init.amount || '8.88');
  const text = h('input', { class: 'inp', type: 'text', maxlength: 24, value: init.text || '', placeholder: '恭喜发财，大吉大利' });
  const s = sheet({
    title: init.amount ? '改红包' : '红包',
    body: h('div', { class: 'sheet-body' },
      field('金额（元）', amt),
      field('祝福语', text),
      h('div', { class: 'fld' }, h('span', { class: 'fld-l', text: '状态' }),
        seg([{ v: 'new', label: '没领' }, { v: 'open', label: '已领取' }, { v: 'gone', label: '被领完' }, { v: 'expired', label: '已过期' }], state, (v) => { state = v; })),
      h('p', { class: 'sheet-tip', text: '没领的红包，点一下就能拆开。' }),
      primary(okLabel, () => { s.close(); onSave({ amount: cleanAmount(amt.value, '8.88'), text: text.value.trim(), state }); })),
  });
  return s;
}

/** 转账 */
export function transferSheet({ init = {}, okLabel = '转账', onSave }) {
  let state = init.state || 'wait';
  const amt = amountInput(init.amount || '520');
  const note = h('input', { class: 'inp', type: 'text', maxlength: 24, value: init.note || '', placeholder: '添加备注（可以不填）' });
  const s = sheet({
    title: init.amount ? '改转账' : '转账',
    body: h('div', { class: 'sheet-body' },
      field('金额（元）', amt),
      field('备注', note),
      h('div', { class: 'fld' }, h('span', { class: 'fld-l', text: '状态' }),
        seg([{ v: 'wait', label: '待收款' }, { v: 'done', label: '已收款' }, { v: 'back', label: '已退还' }], state, (v) => { state = v; })),
      h('p', { class: 'sheet-tip', text: '待收款的转账，点一下可以替对方收款或者退还。' }),
      primary(okLabel, () => { s.close(); onSave({ amount: cleanAmount(amt.value, '520'), note: note.value.trim(), state }); })),
  });
  return s;
}

/** 通话记录 */
export function callSheet({ init = {}, okLabel = '插入', onSave }) {
  let video = !!init.video, res = init.res || 'done';
  const min = h('input', { class: 'inp num', type: 'number', inputmode: 'numeric', min: 0, max: 599, value: Math.floor((init.dur ?? 204) / 60) });
  const sec = h('input', { class: 'inp num', type: 'number', inputmode: 'numeric', min: 0, max: 59, value: (init.dur ?? 204) % 60 });
  const durRow = h('div', { class: 'fld' }, h('span', { class: 'fld-l', text: '通话时长' }), h('div', { class: 'dur' }, min, h('span', { text: '分' }), sec, h('span', { text: '秒' })));
  const upd = () => { durRow.hidden = res !== 'done'; };
  const s = sheet({
    title: '通话',
    body: h('div', { class: 'sheet-body' },
      seg([{ v: false, label: '语音通话' }, { v: true, label: '视频通话' }], video, (v) => { video = v; }),
      h('div', { class: 'fld' }, h('span', { class: 'fld-l', text: '结果' }),
        seg([{ v: 'done', label: '接通' }, { v: 'cancel', label: '取消' }, { v: 'reject', label: '拒绝' }, { v: 'noanswer', label: '没接' }, { v: 'busy', label: '忙线' }], res, (v) => { res = v; upd(); })),
      durRow,
      h('p', { class: 'sheet-tip', text: '默认是你打过去的；长按「换边」就变成对方打来的，字会自动变（比如「对方已拒绝」变成「已拒绝」）。' }),
      primary(okLabel, () => {
        const dur = Math.max(0, Math.min(599, parseInt(min.value, 10) || 0)) * 60 + Math.max(0, Math.min(59, parseInt(sec.value, 10) || 0));
        s.close(); onSave({ video, res, dur });
      })),
  });
  upd();
  return s;
}

/** 链接卡片：贴链接自动认平台，也可以自己选模板 */
export function linkSheet({ init = {}, okLabel = '发送', onSave }) {
  const m = { tpl: init.tpl || 'web', url: init.url || '', title: init.title || '', desc: init.desc || '', author: init.author || '', cover: init.cover || null, cw: init.cw, ch: init.ch };
  let manual = !!init.tpl;
  const fresh = new Set();
  const stage = h('div', { class: 'lk-stage' });
  const url = h('input', { class: 'inp', type: 'url', inputmode: 'url', value: m.url, placeholder: '粘贴链接，比如 https://…', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false' });
  const chips = h('div', { class: 'tpl-grid' });
  const title = h('input', { class: 'inp', type: 'text', maxlength: 60, value: m.title });
  const desc = h('textarea', { class: 'inp area', rows: 2, maxlength: 200 });
  desc.value = m.desc;
  const author = h('input', { class: 'inp', type: 'text', maxlength: 30, value: m.author });
  const fTitle = field('标题', title), fDesc = field('摘要', desc), fAuthor = field('作者', author);
  const coverBtn = h('button', { class: 'cover-btn' });
  const coverX = h('button', { class: 'btn-link', text: '去掉封面' });
  const draw = () => {
    const t = LINKS.find((x) => x.id === m.tpl);
    const F = LINK_FIELDS[t.kind];
    fTitle.hidden = !F.title; fTitle.firstChild.textContent = F.title || '';
    fDesc.hidden = !F.desc; fDesc.firstChild.textContent = F.desc || '';
    fAuthor.hidden = !F.author; fAuthor.firstChild.textContent = F.author || '';
    chips.replaceChildren(...LINKS.map((x) => h('button', { class: 'tpl' + (x.id === m.tpl ? ' on' : ''), style: { '--tint': x.color }, onclick: () => { m.tpl = x.id; manual = true; draw(); sfx.tick(); } }, h('i', { html: I[x.icon] }), h('span', { text: x.name }))));
    coverBtn.replaceChildren(h('span', { class: 'ic', html: I.image }), h('span', { text: m.cover ? '换封面图' : '加封面图' }));
    coverX.hidden = !m.cover;
    stage.replaceChildren(linkCard(m));
  };
  url.addEventListener('input', () => { m.url = url.value.trim(); if (!manual || m.tpl === 'web') { const d = detectLink(m.url); if (d) m.tpl = d; } draw(); });
  for (const [inp, key] of [[title, 'title'], [desc, 'desc'], [author, 'author']]) inp.addEventListener('input', () => { m[key] = inp.value; draw(); });
  coverBtn.addEventListener('click', () => pickFiles().then(async ([f]) => {
    if (!f) return;
    try {
      const { blob, w, h: hh } = await shrink(f, { max: 900, q: 0.84 });
      const id = 'c' + uid();
      await media.put(id, blob);
      fresh.add(id);
      m.cover = id; m.cw = w; m.ch = hh;
      draw();
    } catch { toast('这张图读不出来'); }
  }));
  coverX.addEventListener('click', () => { m.cover = null; draw(); });
  let saved = false;
  const s = sheet({
    title: '链接',
    onClose: () => { if (!saved) for (const id of fresh) media.del(id); else for (const id of fresh) if (id !== m.cover) media.del(id); },
    body: h('div', { class: 'sheet-body' },
      stage,
      field('链接', url),
      h('div', { class: 'fld' }, h('span', { class: 'fld-l', text: '样式（贴了链接会自动选）' }), chips),
      fTitle, fDesc, fAuthor,
      h('div', { class: 'cover-row' }, coverBtn, coverX),
      primary(okLabel, () => {
        saved = true;
        const out = { tpl: m.tpl, url: m.url, title: m.title.trim(), desc: m.desc.trim(), author: m.author.trim() };
        if (m.cover) Object.assign(out, { cover: m.cover, cw: m.cw, ch: m.ch });
        s.close(); onSave(out);
      })),
  });
  draw();
  return s;
}

/** 气泡花样 */
export function bubbleSheet({ current, onPick }) {
  const grid = h('div', { class: 'bub-grid' }, BUBBLES.map((b) => h('button', { class: 'bub-tile' + (b.id === current ? ' on' : ''), onclick: () => { s.close(); onPick(b.id); sfx.tick(); } },
    h('div', { class: 'bub-pv', 'data-bub': b.id },
      h('div', { class: 'msg L' }, h('div', { class: 'col' }, h('div', { class: 'line' }, h('div', { class: 'bub text' }, h('span', { class: 'tx', text: '在吗' }))))),
      h('div', { class: 'msg R' }, h('div', { class: 'col' }, h('div', { class: 'line' }, h('div', { class: 'bub text' }, h('span', { class: 'tx', text: '在呀' })))))),
    h('span', { text: b.name }))));
  const s = sheet({ title: '气泡', body: h('div', { class: 'sheet-body' }, h('p', { class: 'sheet-tip', text: '只换这段对话，别的对话不受影响。' }), grid) });
  return s;
}

/** 字体效果 */
export function fontSheet({ current, bub, onPick }) {
  const rows = FONTS.map((f) => h('button', { class: 'font-row' + (f.id === current ? ' on' : ''), onclick: () => { s.close(); onPick(f.id); sfx.tick(); } },
    h('div', { class: 'font-pv', 'data-font': f.id, 'data-bub': bub },
      h('div', { class: 'msg R' }, h('div', { class: 'col' }, h('div', { class: 'line' }, h('div', { class: 'bub text' }, h('span', { class: 'tx', text: '你在哪？我马上到。' })))))),
    h('div', { class: 'font-name' }, h('b', { text: f.name }), f.sub && h('small', { text: f.sub })),
    f.id === current && h('i', { class: 'font-check', html: I.check })));
  const s = sheet({ title: '字体', body: h('div', { class: 'sheet-body' }, h('p', { class: 'sheet-tip', text: '用的都是手机自带的字体，只换这段对话。' }), h('div', { class: 'font-list' }, rows)) });
  return s;
}

/** 选人（群聊换人、拍一拍） */
export function memberPicker({ title = '换成谁说的', people, current, onPick }) {
  const s = sheet({
    title,
    body: h('div', { class: 'sheet-body' }, h('div', { class: 'pick-list' }, people.map((p) => h('button', { class: 'pick-row' + (p.key === current ? ' on' : ''), onclick: () => { s.close(); onPick(p); sfx.tick(); } },
      avatarEl(p.person, 's40'), h('span', { text: p.label }), p.key === current && h('i', { class: 'font-check', html: I.check }))))),
  });
  return s;
}

/** 选对话（转发到哪） */
export function chatPicker({ title = '转发给', chats, avatarFor, nameFor, onPick }) {
  const s = sheet({
    title,
    body: h('div', { class: 'sheet-body' }, h('div', { class: 'pick-list' }, chats.map((c) => h('button', { class: 'pick-row', onclick: () => { s.close(); onPick(c); } },
      avatarFor(c), h('span', { text: nameFor(c) }))))),
  });
  return s;
}

/** 新群聊：群名、群头像（不传就用成员头像拼）、成员 */
export function groupSheet({ init, okLabel = '建群', onSave }) {
  const g = { name: init ? init.left.name : '', av: init ? { ...init.left.av } : {}, members: init ? init.members.map((x) => ({ ...x })) : [] };
  const name = h('input', { class: 'inp', type: 'text', maxlength: 24, value: g.name, placeholder: '群名称' });
  const list = h('div', { class: 'mem-list' });
  const avBtn = h('button', { class: 'pv-av sm', 'aria-label': '群头像' });
  const drawAv = () => {
    const fake = { type: 'group', left: { name: g.name, av: g.av }, members: g.members };
    avBtn.replaceChildren(groupAvatarEl(fake, 's64'), h('i', { class: 'pv-cam', html: I.photo }));
  };
  const draw = () => {
    list.replaceChildren(...g.members.map((m, i) => h('div', { class: 'mem-row' },
      avatarEl(m, 's36'), h('span', { text: m.name }),
      h('button', { class: 'mem-edit', text: '编辑', onclick: () => personSheet({ title: '群成员', person: m, okLabel: '保存', onSave: (p) => { Object.assign(m, { name: p.name || '群成员', av: p.av, frame: p.frame }); draw(); } }) }),
      h('button', { class: 'mem-x', html: I.close, 'aria-label': '移出', onclick: () => { g.members.splice(i, 1); draw(); sfx.del(); } }))),
      h('button', { class: 'mem-add', onclick: () => personSheet({ title: '加群成员', person: { name: '' }, placeholder: '名字', okLabel: '加进群', onSave: (p) => { g.members.push({ id: 'p' + uid(), name: p.name || `成员${g.members.length + 1}`, av: p.av, frame: p.frame }); draw(); sfx.pop(); } }) },
        h('span', { class: 'mem-plus', html: I.add }), h('span', { text: '加成员' })));
    drawAv();
  };
  avBtn.addEventListener('click', () => pickFiles().then(async ([f]) => { if (!f) return; const url = await cropper(f); if (url) { g.av = { img: url }; drawAv(); } }));
  name.addEventListener('input', () => { g.name = name.value; drawAv(); });
  draw();
  const s = sheet({
    title: init ? '群资料' : '新群聊',
    body: h('div', { class: 'sheet-body' },
      h('div', { class: 'pv' }, avBtn, h('div', { class: 'pv-tip', text: '不传群头像，就用成员的头像拼起来' })),
      field('群名称', name),
      h('div', { class: 'fld' }, h('span', { class: 'fld-l', text: '群成员（不算你自己）' }), list),
      primary(okLabel, () => {
        if (!g.members.length) { toast('先加一个群成员'); return; }
        s.close(); onSave({ name: name.value.trim() || '群聊', av: g.av, members: g.members });
      })),
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
