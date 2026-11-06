// 聊天信息页：对方的头像备注、标题小字、「我」用哪套资料、背景、置顶、未读数、清空、删除
import { A, save, sfx, pname, person } from './state.js';
import { h, confirm, toast } from './ui.js';
import { I } from './icons.js';
import { avatarEl, WALLS } from './look.js';
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
    body.replaceChildren(
      group('对方',
        cell({ left: avatarEl(c.left, 's44'), label: pname(c, 'L'), sub: '头像和备注', onclick: () => F.personSheet({
          title: '对方', person: c.left, nameLabel: '备注', placeholder: '对方的名字', okLabel: '保存',
          onSave: (p) => { c.left = { name: p.name || '对方', av: p.av }; changed(); },
        }) }),
        cell({ label: '标题下的小字', value: c.sub || '不显示', onclick: () => F.subSheet({ text: c.sub, onSave: (v) => { c.sub = v; changed(); } }) })),
      group('我（右边）',
        cell({ label: '用「我」页里的头像和名字', right: toggle(meSame, (on) => {
          c.right = on ? null : { name: A.D.me.name, av: { ...A.D.me.av } };
          changed();
        }) }),
        !meSame && cell({ left: avatarEl(person(c, 'R'), 's44'), label: pname(c, 'R'), sub: '只在这段对话里用', onclick: () => F.personSheet({
          title: '这段对话里的我', person: c.right, okLabel: '保存',
          onSave: (p) => { c.right = { name: p.name || '我', av: p.av }; changed(); },
        }) })),
      group('',
        cell({ label: '聊天背景', value: wallName(c.wall), onclick: () => F.wallSheet({
          current: c.wall, follow: true, onPick: (spec) => { const old = c.wall; c.wall = spec; releaseWall(old); changed(); },
        }) }),
        cell({ label: '置顶', right: toggle(!!c.pin, (on) => { c.pin = on; changed(); }) }),
        cell({ label: '列表里的未读数', right: stepper(c.unread, (v) => { c.unread = v; save(); hooks.changed(); }) })),
      group('',
        cell({ label: '清空聊天记录', cls: 'danger center-cell', right: null, onclick: async () => {
          if (!(await confirm({ title: '清空聊天记录？', message: '这段对话里的消息全部删掉，头像和备注留着。', ok: '清空', danger: true }))) return;
          for (const m of c.msgs) { if (m.k === 'img') media.del(m.media); if (m.k === 'recall' && m.orig && m.orig.k === 'img') media.del(m.orig.media); }
          c.msgs = [];
          save(); hooks.changed(); hooks.cleared(); sfx.del(); toast('已清空');
        } }),
        cell({ label: '删除这段对话', cls: 'danger center-cell', right: null, onclick: async () => {
          if (!(await confirm({ title: '删除这段对话？', message: '删掉以后找不回来。', ok: '删除', danger: true }))) return;
          hooks.deleted();
        } })),
    );
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
