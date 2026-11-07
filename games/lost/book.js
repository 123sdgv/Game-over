// 小圆球里的四本东西：线索本、推理、提示、结案
import { h, icon, ic, sheet, dialog, toast, nl } from './ui.js';
import { S, save, emit } from './state.js';
import { sfx } from './sfx.js';
import { CLUES, QUESTIONS, CONCLUSIONS, CHOICE_TEXT, HINTS } from './story.js';
import { clueList, TOTAL_CLUES, visibleQuestions, solved, tryDeduce, conclusionList, hintFor, moreHint, choicesFor, unlocked } from './logic.js';

// ═════════════ 线索本 ═════════════
export function openClues() {
  const ids = clueList();
  const fresh = new Set(S.fresh);
  S.fresh = []; save(); emit('book');
  const groups = {};
  ids.forEach((id) => { const src = CLUES[id].src.split(' · ')[0]; (groups[src] ||= []).push(id); });
  const body = h('div', { class: 'book' });
  if (!ids.length) body.append(h('p', { class: 'empty', text: '还什么都没记下。翻翻这台手机吧——看到要紧的东西，会自动记在这里。' }));
  for (const [src, list] of Object.entries(groups)) {
    body.append(h('div', { class: 'bk-src', text: src }));
    list.slice().reverse().forEach((id) => body.append(card(id, fresh.has(id))));
  }
  sheet({ title: '线索本', sub: `记下了 ${ids.length} 条`, body, cls: 'nb' });
}
function card(id, isNew, extra = {}) {
  const c = CLUES[id];
  return h('div', { class: 'cc' + (isNew ? ' new' : ''), ...extra },
    h('small', { text: c.src }), h('p', { text: c.text }));
}

// ═════════════ 推理 ═════════════
export function openThink() {
  const freshC = new Set(S.freshConcl);
  S.freshConcl = []; save(); emit('book');
  const body = h('div', { class: 'book think' });
  const ideas = conclusionList();
  body.append(h('div', { class: 'bk-src', text: '你的想法' }));
  if (!ideas.length) body.append(h('p', { class: 'empty', text: '还没有。先弄清楚手机的主人在跟谁说话、说了些什么。' }));
  ideas.forEach((c, i) => body.append(h('div', { class: 'idea' + (freshC.has(c) ? ' new' : '') }, h('span', { text: '想法 ' + (i + 1) }), h('p', { text: CONCLUSIONS[c] }))));
  body.append(h('div', { class: 'bk-src', text: '想不通的事' }));
  const qs = visibleQuestions();
  if (!qs.length) body.append(h('p', { class: 'empty', text: '看到可疑的东西，这里会冒出问题。' }));
  qs.forEach((q) => body.append(h('button', { class: 'q' + (solved(q.id) ? ' done' : ''), onclick: () => (solved(q.id) ? null : solve(q, sh)) },
    h('b', { text: q.q }),
    solved(q.id) ? h('p', { text: q.ans }) : h('small', { text: '挑两条线索，把它说清楚 →' }))));
  body.append(h('p', { class: 'bk-foot', text: `想通了 ${Object.keys(S.deds).length} 件事` }));
  const sh = sheet({ title: '推理', sub: '把两条线索放在一起看', body, cls: 'nb' });
}

function solve(q, parent) {
  sfx.paper();
  const picked = [];
  const ids = clueList();
  const list = h('div', { class: 'pick-list' });
  const go = h('button', { class: 'go', text: '就是这两条', disabled: true });
  // 按来源筛一筛，线索多了好找
  const srcs = [...new Set(ids.map((id) => CLUES[id].src.split(' · ')[0]))];
  let filt = '全部';
  const chips = h('div', { class: 'chips' });
  const paintChips = () => {
    chips.innerHTML = '';
    ['全部', ...srcs].forEach((s) => chips.append(h('button', { class: s === filt ? 'on' : '', text: s, onclick: () => { filt = s; sfx.tap(); paintChips(); list.querySelectorAll('.cc').forEach((c) => { c.hidden = !(s === '全部' || CLUES[c.dataset.id].src.startsWith(s) || picked.includes(c.dataset.id)); }); } })));
  };
  paintChips();
  list.append(chips);
  ids.slice().reverse().forEach((id) => {
    const el = card(id, false, { role: 'button' });
    el.addEventListener('click', () => {
      const i = picked.indexOf(id);
      if (i >= 0) { picked.splice(i, 1); el.classList.remove('on'); }
      else { if (picked.length === 2) { const old = picked.shift(); list.querySelector(`[data-id="${old}"]`).classList.remove('on'); } picked.push(id); el.classList.add('on'); }
      sfx.pick();
      go.disabled = picked.length !== 2;
      go.textContent = picked.length === 2 ? '就是这两条' : `再挑 ${2 - picked.length} 条`;
    });
    el.dataset.id = id;
    list.append(el);
  });
  go.textContent = '挑两条';
  const foot = h('div', { class: 'sh-foot' }, go);
  const sh = sheet({ title: q.q, sub: '挑出能说清楚这件事的两条线索', body: list, foot, cls: 'nb solve' });
  go.onclick = () => {
    if (picked.length !== 2) return;
    if (tryDeduce(q.id, picked[0], picked[1])) {
      sfx.deduce();
      const ans = h('div', { class: 'eureka' }, h('small', { text: '想通了' }), h('p', { text: q.ans }));
      sh.body.innerHTML = '';
      sh.body.append(ans);
      go.textContent = '好';
      go.onclick = () => { sh.close(); parent.close(); setTimeout(openThink, 380); };
      requestAnimationFrame(() => ans.classList.add('on'));
    } else {
      sfx.nope();
      sh.box.classList.remove('shake'); void sh.box.offsetWidth; sh.box.classList.add('shake');
      toast('这两条好像说明不了这件事。');
    }
  };
}

// ═════════════ 提示 ═════════════
export function openHint() {
  const body = h('div', { class: 'book hint' });
  const paint = () => {
    const hf = hintFor();
    body.innerHTML = '';
    if (!hf.lines.length) body.append(h('p', { class: 'empty', text: '卡住了的话，可以让它推你一把。先给方向，再给位置，最后直接给答案。' }));
    hf.lines.forEach((l, i) => body.append(h('div', { class: 'hl' }, h('small', { text: ['方向', '位置', '答案'][i] }), h('p', { text: l }))));
    const n = hf.lines.length, total = HINTS[hf.stage].length;
    if (n < total) {
      const label = n === 0 ? '给我一点方向' : n === 1 ? '再具体一点' : '直接告诉我';
      body.append(h('button', { class: 'go', text: label, onclick: async () => {
        if (n === total - 1 && hf.stage !== 'end') {
          const ok = await dialog({ title: '直接看答案？', text: '会记在结案报告里。', buttons: [['算了', false], ['看', true, 'strong']] });
          if (!ok) return;
        }
        sfx.paper(); moreHint(hf.stage); paint();
      } }));
    }
    body.append(h('p', { class: 'bk-foot', text: `一共求助了 ${S.hints.used} 次` }));
  };
  paint();
  sheet({ title: '提示', sub: '只说你现在卡住的那一步', body, cls: 'nb' });
}

// ═════════════ 结案 ═════════════
export function openClose(onEnd, preset = null) {
  const ideas = conclusionList();
  if (!unlocked('phone')) { toast('你连这台手机都还没打开。'); return; }
  if (!ideas.length) {
    dialog({ title: '还不能结案', text: '你还没弄明白任何事。\n再翻翻这台手机吧。', buttons: [['好', true, 'strong']] });
    return;
  }
  let concl = ideas[ideas.length - 1], choice = null;
  const body = h('div', { class: 'book close' });
  const go = h('button', { class: 'go', text: '结案', disabled: true });
  const paint = () => {
    body.innerHTML = '';
    body.append(h('p', { class: 'warn' }, ic('stamp'), h('span', { text: '结案只有一次。结案以后，这台手机会被抹掉。' })));
    body.append(h('div', { class: 'bk-src', text: '一、你认为发生了什么？' }));
    ideas.forEach((c) => body.append(h('button', { class: 'opt' + (c === concl ? ' on' : ''), onclick: () => { concl = c; choice = null; sfx.pick(); paint(); setTimeout(() => body.querySelector('.q2') && body.querySelector('.q2').scrollIntoView({ behavior: 'smooth', block: 'start' }), 60); } }, h('i'), h('span', { text: CONCLUSIONS[c] }))));
    body.append(h('div', { class: 'bk-src q2', text: '二、这台手机，你打算怎么办？' }));
    choicesFor(concl).forEach((k) => {
      const need = k === 'cancel' && !unlocked('key');
      body.append(h('button', { class: 'opt' + (k === choice ? ' on' : '') + (need ? ' off' : ''), onclick: () => { if (need) { sfx.nope(); toast('你没有她的钥匙。'); return; } choice = k; sfx.pick(); paint(); } },
        h('i'), h('span', { text: CHOICE_TEXT[k] }), need ? h('small', { text: '需要创建者钥匙' }) : null));
    });
    go.disabled = !choice;
  };
  if (preset && choicesFor(concl).includes(preset)) choice = preset;
  paint();
  const sh = sheet({ title: '结案', sub: '剩下的，你来决定', body, foot: h('div', { class: 'sh-foot' }, go), cls: 'nb' });
  go.onclick = async () => {
    if (!choice) return;
    const ok = await dialog({ title: '想好了吗？', text: '「' + CHOICE_TEXT[choice] + '」\n这是一次性的。', buttons: [['再想想', false], ['就这样', true, 'strong']] });
    if (!ok) return;
    sfx.stamp();
    sh.close();
    setTimeout(() => onEnd(concl, choice), 420);
  };
}
