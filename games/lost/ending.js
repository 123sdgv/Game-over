// 结局：一段一段的后记 →（立冬）那封信和回信 → 结案报告 → 抹掉 → 「你好」
import { h, icon, nl, paras, typeIn, dialog } from './ui.js';
import { S, save, stat, resetAll, hb } from './state.js';
import { sfx } from './sfx.js';
import { CONCLUSIONS, CHOICE_TEXT, QUESTIONS, ENDING_NAMES, ENDING_COUNT, LETTER, REPLY, REPORT_NOTE } from './story.js';
import { endingText, ENDING_OF, clueList, TOTAL_CLUES } from './logic.js';

const $e = () => document.getElementById('ending');

export function finish(concl, choice) {
  const ending = ENDING_OF[choice];
  S.ending = {
    concl, choice, ending,
    playMs: S.playMs, clues: clueList().length, deds: Object.keys(S.deds), hints: S.hints.used,
    talked: S.talk.log.length > 0, finder: !!S.seen.finder,
  };
  S.phase = 'ending';
  save(true);
  stat((st) => {
    const seen = new Set(st.seenEndings || []);
    seen.add(ending);
    st.seenEndings = [...seen];
    st.endings = `${seen.size} / ${ENDING_COUNT}`;
    st.closed = (st.closed || 0) + 1;
    st.bestClues = Math.max(st.bestClues || 0, S.ending.clues);
    st.last = ENDING_NAMES[ending];
  });
  playEnding();
}

/** 结局那一段（读档回来也从这里接着放） */
export function playEnding() {
  const E = S.ending;
  const el = $e();
  el.hidden = false;
  el.innerHTML = '';
  el.className = 'end-' + E.ending;
  const text = h('div', { class: 'end-text' });
  const next = h('button', { class: 'end-next', text: '继续' });
  el.append(h('div', { class: 'end-scroll' }, h('div', { class: 'end-kicker', text: '结局 · ' + ENDING_NAMES[E.ending] }), text), next);
  const t = typeIn(text, endingText(E.choice, E.concl), { cls: 'end-p', gap: 1100, onDone: () => next.classList.add('on') });
  el.querySelector('.end-scroll').onclick = () => t.hurry();
  next.onclick = () => {
    sfx.tap();
    if (E.ending === 'wait') showLetter();
    else showReport();
  };
}

function showLetter() {
  const E = S.ending;
  const el = $e();
  el.innerHTML = '';
  const scroll = h('div', { class: 'end-scroll letter-scroll' });
  const next = h('button', { class: 'end-next', text: '继续' });
  scroll.append(
    h('div', { class: 'end-kicker', text: '最后一封信 · 17:52' }),
    h('div', { class: 'letter big' }, paras(LETTER)));
  el.append(scroll, next);
  sfx.paper();
  requestAnimationFrame(() => scroll.querySelector('.letter').classList.add('on'));
  setTimeout(() => next.classList.add('on'), 2500);
  next.onclick = () => {
    sfx.notif();
    next.classList.remove('on');
    const reply = h('div', { class: 'reply' },
      h('div', { class: 'reply-h' }, h('span', { class: 'av', text: '妈' }), h('b', { text: '妈妈' }), h('time', { text: '19:40' })),
      h('div', { class: 'reply-b' }, paras(REPLY[E.concl] || REPLY.c4)),
      h('div', { class: 'reply-f' }, h('span', { text: '!' }), '未送达 · 这台手机已经被抹掉了'));
    scroll.append(h('div', { class: 'end-kicker', text: '两个小时以后' }), reply);
    requestAnimationFrame(() => { reply.classList.add('on'); reply.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
    setTimeout(() => { next.textContent = '继续'; next.classList.add('on'); next.onclick = () => { sfx.tap(); showReport(); }; }, 2600);
  };
}

const redact = (n) => h('span', { class: 'redact', style: { width: n + '%' } });
export function reportEl(E = S.ending) {
  const min = Math.max(1, Math.round(E.playMs / 60000));
  const dur = min >= 60 ? `${Math.floor(min / 60)} 小时 ${min % 60} 分` : `${min} 分钟`;
  const kv = (k, v) => h('div', { class: 'rp-kv' }, h('span', { text: k }), h('b', { text: v }));
  const facts = QUESTIONS.map((q, i) => (E.deds.includes(q.id)
    ? h('li', { text: q.ans })
    : h('li', { class: 'blank' }, redact(55 + ((i * 37) % 40)))));
  return h('div', { class: 'report' },
    h('div', { class: 'rp-head' }, h('b', { text: '结 案 报 告' }), h('small', { text: 'No. TZ-1106-2347' })),
    kv('地点', '汀州 · 轮渡码头 二号泊位 · 长椅'),
    kv('物品', '手机一部（透明手机壳，壳内纸条一张、拍立得一张）'),
    kv('机主', E.deds.includes('D3') ? '苏念（1999—2026）' : '苏念'),
    kv('调查用时', dur),
    kv('记下的线索', `${E.clues} / ${TOTAL_CLUES}`),
    kv('想通的事', `${E.deds.length} / ${QUESTIONS.length}`),
    kv('求助', `${E.hints} 次`),
    h('div', { class: 'rp-sec', text: '案情' }),
    h('ol', { class: 'rp-facts' }, facts),
    h('div', { class: 'rp-sec', text: '结论' }),
    h('p', { class: 'rp-q', text: '「' + CONCLUSIONS[E.concl] + '」' }),
    h('div', { class: 'rp-sec', text: '处理' }),
    h('p', { class: 'rp-q', text: '「' + CHOICE_TEXT[E.choice] + '」' }),
    h('div', { class: 'rp-end' }, h('span', { text: '结局' }), h('b', { text: ENDING_NAMES[E.ending] })),
    h('p', { class: 'rp-note', text: REPORT_NOTE[E.concl] }),
    h('div', { class: 'rp-stamp', text: '已结案' }));
}

function showReport() {
  const el = $e();
  el.innerHTML = '';
  const rp = reportEl();
  const next = h('button', { class: 'end-next', text: '合上' });
  el.append(h('div', { class: 'end-scroll paperbg' }, rp), next);
  sfx.paper();
  requestAnimationFrame(() => rp.classList.add('on'));
  setTimeout(() => { sfx.stamp(); rp.querySelector('.rp-stamp').classList.add('on'); }, 1600);
  setTimeout(() => next.classList.add('on'), 2200);
  next.onclick = () => { sfx.tap(); wipe(); };
}

function wipe() {
  const el = $e();
  el.innerHTML = '';
  el.className = 'end-wipe';
  const bar = h('div', { class: 'wipe-bar' }, h('i'));
  el.append(h('div', { class: 'wipe' }, h('span', { class: 'wipe-ic', html: icon('erase') }), h('p', { text: '正在抹掉此手机…' }), bar));
  sfx.wipe();
  requestAnimationFrame(() => bar.classList.add('go'));
  setTimeout(() => {
    S.phase = 'wiped';
    save(true);
    el.hidden = true;
    showWiped(true);
  }, 4200);
}

// ═════════════ 抹掉以后：「你好」 ═════════════
const HELLO = ['你好', 'Hello', 'Bonjour', 'こんにちは', 'Hola', '안녕하세요', 'Ciao', 'Hallo'];
let helloT = 0;
export function showWiped(first = false) {
  const el = document.getElementById('wiped');
  el.hidden = false;
  el.innerHTML = '';
  const word = h('div', { class: 'hello', text: HELLO[0] });
  const note = h('div', { class: 'wp-note' });
  el.append(word, h('p', { class: 'wp-sub', text: '轻点以继续' }), note);
  if (first) sfx.hello();
  let i = 0;
  clearInterval(helloT);
  helloT = setInterval(() => {
    i = (i + 1) % HELLO.length;
    word.classList.remove('on'); void word.offsetWidth;
    word.textContent = HELLO[i]; word.classList.add('on');
  }, 2600);
  word.classList.add('on');
  // 轻点：说明；长按「你好」三秒：重新捡起来（藏着的）
  let pressT = 0, pressed = false;
  el.onpointerdown = (e) => {
    pressed = false;
    if (!e.target.closest('.hello')) return;
    word.classList.add('hold');
    pressT = setTimeout(async () => {
      pressed = true;
      word.classList.remove('hold');
      hb.haptic(30);
      const ok = await dialog({ title: '重新捡起这台手机？', text: '进度会全部清空，从码头的那张长椅重新开始。', buttons: [['不了', false], ['重新开始', true, 'strong']] });
      if (ok) { resetAll(); location.reload(); }
    }, 3000);
  };
  el.onpointerup = el.onpointercancel = () => { clearTimeout(pressT); word.classList.remove('hold'); };
  el.onclick = (e) => {
    if (pressed || e.target.closest('.wp-note')) return;
    note.innerHTML = '';
    note.append(h('div', {},
      h('p', { text: '这台手机已经被抹掉了。' }),
      S.ending ? h('button', { text: '再看一眼结案报告', onclick: () => openReportOnly() }) : null));
    note.classList.add('on');
  };
}
function openReportOnly() {
  const wrap = h('div', { class: 'ovl report-ovl on' });
  const rp = reportEl();
  rp.classList.add('on');
  rp.querySelector('.rp-stamp').classList.add('on');
  wrap.append(h('div', { class: 'end-scroll paperbg' }, rp), h('button', { class: 'end-next on', text: '合上', onclick: () => wrap.remove() }));
  document.getElementById('sheets').append(wrap);
}
export const stopHello = () => clearInterval(helloT);
