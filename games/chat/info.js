// 聊天信息页：对方的头像备注、标题小字、「我」用哪套资料、背景、置顶、未读数、清空、删除
import { A, save, sfx, pname, person, isGroup, mediaUsed } from './state.js';
import { h, confirm, toast, actions } from './ui.js';
import { I } from './icons.js';
import { avatarEl, groupAvatarEl, WALLS, BUBBLES, FONTS } from './look.js';
import { uid } from './data.js';
import { media } from './media.js';
import * as F from './sheets.js';
import { pop } from './nav.js';

export function toggle(on, onChange) {
  const b = h('button', { class: 'switch' + (on ? ' on' : ''), role: 'switch', 'aria-checked': String(on) }, h('i'));
  b.addEventListener('click', () => {
    on = !on;
    b.classList.toggle('on', on);
    b.setAttribute('aria-checked', String(on));
    sfx.tick();
    onChange(on);
  });
  return b;
}
export const cell = ({ left, label, sub, value, right, onclick, cls = '' }) =>
  h(onclick ? 'button' : 'div', { class: 'cell ' + cls, onclick },
    left, h('div', { class: 'cell-main' }, h('span', { class: 'cell-l', text: label }), sub && h('small', { text: sub })),
    value != null && h('span', { class: 'cell-v', text: value }),
    right !== undefined ? right : onclick ? h('span', { class: 'chev', html: I.right }) : null);
export const group = (title, ...cells) => h('div', { class: 'group' }, title && h('div', { class: 'group-t', text: title }), h('div', { class: 'group-b' }, cells));

export const wallName = (spec) => (spec == null ? '跟默认一样' : typeof spec === 'object' ? '相册里的' : (WALLS.find((w) => w.id === spec) || WALLS[0]).name);

/** 换背景时，原来那张相册图没人用了就删掉 */
export function releaseWall(old) {
  if (!old || typeof old !== 'object') return;
  const used = A.D.wall && A.D.wall.img === old.img || A.D.chats.some((c) => c.wall && c.wall.img === old.img);
  if (!used) media.del(old.img);
}

export function infoPage(c, hooks) {
  const body = h('div', { class: 'groups' });
  const el = h('section', { class: 'page info' },
    h('header', { class: 'cnav solid' },
      h('button', { class: 'nbtn back', 'aria-label': '返回', onclick: () => pop() }, h('span', { class: 'ic', html: I.back })),
      h('div', { class: 'ctitle' }, h('b', { text: '聊天信息' })),
      h('span', { class: 'nbtn' })),
    body);

  const changed = () => { save(); hooks.changed(); draw(); };

  function draw() {
    const meSame = !c.right;
    const g = isGroup(c);
    const bubName = (BUBBLES.find((b) => b.id === c.bub) || BUBBLES[0]).name;
    const fontName = (FONTS.find((f) => f.id === c.font) || FONTS[0]).name;
    const editMember = (m) => F.personSheet({
      title: '群成员', person: m, okLabel: '保存',
      onSave: (p) => { Object.assign(m, { name: p.name || '群成员', av: p.av, frame: p.frame || undefined }); changed(); },
    });
    body.replaceChildren(
      g ? group('群聊',
        h('div', { class: 'mem-grid' },
          ...c.members.map((m) => h('button', { class: 'mem-cell', onclick: () => memberActions(m) }, avatarEl(m, 's50', { frame: true }), h('span', { text: m.name }))),
          h('button', { class: 'mem-cell add', onclick: () => F.personSheet({
            title: '加群成员', person: { name: '' }, placeholder: '名字', okLabel: '加进群',
            onSave: (p) => { c.members.push({ id: 'p' + uid(), name: p.name || `成员${c.members.length + 1}`, av: p.av, ...(p.frame ? { frame: p.frame } : {}) }); changed(); sfx.pop(); },
          }) }, h('span', { class: 'mem-plus', html: I.add }), h('span', { text: '加人' }))),
        cell({ left: groupAvatarEl(c, 's44'), label: pname(c), sub: '群名称和群头像', onclick: () => F.personSheet({
          title: '群资料', person: c.left, nameLabel: '群名称', placeholder: '群聊', okLabel: '保存', frames: false,
          onSave: (p) => { c.left = { name: p.name || '群聊', av: p.av }; changed(); },
        }) }),
        cell({ label: '显示成员名字', right: toggle(c.showNames, (on) => { c.showNames = on; changed(); }) }))
      : group('对方',
        cell({ left: avatarEl(c.left, 's44', { frame: true }), label: pname(c), sub: '头像、备注、挂件', onclick: () => F.personSheet({
          title: '对方', person: c.left, nameLabel: '备注', placeholder: '对方的名字', okLabel: '保存',
          onSave: (p) => { c.left = { name: p.name || '对方', av: p.av, ...(p.frame ? { frame: p.frame } : {}) }; changed(); },
        }) })),
      group('',
        cell({ label: '标题下的小字', value: c.sub || '不显示', onclick: () => F.subSheet({ text: c.sub, onSave: (v) => { c.sub = v; changed(); } }) })),
      group('我（右边）',
        cell({ label: '用「我」页里的头像和名字', right: toggle(meSame, (on) => {
          c.right = on ? null : { name: A.D.me.name, av: { ...A.D.me.av }, ...(A.D.me.frame ? { frame: { ...A.D.me.frame } } : {}) };
          changed();
        }) }),
        !meSame && cell({ left: avatarEl(person(c, 'R'), 's44', { frame: true }), label: pname(c, 'R'), sub: '只在这段对话里用', onclick: () => F.personSheet({
          title: '这段对话里的我', person: c.right, okLabel: '保存',
          onSave: (p) => { c.right = { name: p.name || '我', av: p.av, ...(p.frame ? { frame: p.frame } : {}) }; changed(); },
        }) })),
      group('样子',
        cell({ label: '气泡', value: bubName, onclick: () => F.bubbleSheet({ current: c.bub, onPick: (id) => { c.bub = id; changed(); } }) }),
        cell({ label: '字体', value: fontName, onclick: () => F.fontSheet({ current: c.font, bub: c.bub, onPick: (id) => { c.font = id; changed(); } }) }),
        cell({ label: '聊天背景', value: wallName(c.wall), onclick: () => F.wallSheet({
          current: c.wall, follow: true, onPick: (spec) => { const old = c.wall; c.wall = spec; releaseWall(old); changed(); },
        }) })),
      group('',
        cell({ label: '置顶', right: toggle(!!c.pin, (on) => { c.pin = on; changed(); }) }),
        cell({ label: '列表里的未读数', right: stepper(c.unread, (v) => { c.unread = v; save(); hooks.changed(); }) })),
      group('',
        cell({ label: '清空聊天记录', cls: 'danger center-cell', right: null, onclick: async () => {
          if (!(await confirm({ title: '清空聊天记录？', message: '这段对话里的消息全部删掉，头像和名字留着。', ok: '清空', danger: true }))) return;
          const old = c.msgs;
          c.msgs = [];
          for (const m of old) for (const id of [m.media, m.cover, m.orig && m.orig.media]) if (id && !mediaUsed(id)) media.del(id);
          save(); hooks.changed(); hooks.cleared(); sfx.del(); toast('已清空');
        } }),
        cell({ label: g ? '删除这个群聊' : '删除这段对话', cls: 'danger center-cell', right: null, onclick: async () => {
          if (!(await confirm({ title: g ? '删除这个群聊？' : '删除这段对话？', message: '删掉以后找不回来。', ok: '删除', danger: true }))) return;
          hooks.deleted();
        } })),
    );
    function memberActions(m) {
      actions([
        { label: '编辑头像和名字', onPick: () => editMember(m) },
        { label: '移出群聊', danger: true, onPick: async () => {
          if (c.members.length <= 1) { toast('群里至少留一个人'); return; }
          if (!(await confirm({ title: `把「${m.name}」移出群聊？`, message: '他说过的话会显示成第一个群成员说的。', ok: '移出', danger: true }))) return;
          c.members = c.members.filter((x) => x !== m);
          changed();
        } },
      ], { title: m.name });
    }
  }
  draw();
  return { el, onShow: draw };
}

function stepper(v, onChange) {
  const num = h('span', { class: 'st-n', text: v });
  const set = (n) => { v = Math.max(0, Math.min(99, n)); num.textContent = v; onChange(v); sfx.tick(); };
  return h('div', { class: 'stepper' },
    h('button', { text: '−', 'aria-label': '减', onclick: () => set(v - 1) }), num,
    h('button', { text: '+', 'aria-label': '加', onclick: () => set(v + 1) }));
}
