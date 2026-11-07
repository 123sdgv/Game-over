// 失物：在码头捡到一部手机，翻一翻它，弄清楚它的主人遇到了什么。只能结案一次。
import { h, $, toast, dialog, Stack } from './ui.js';
import { S, save, on, emit, hb, applySettings, startClock, stopClock, stat, clock } from './state.js';
import { sfx } from './sfx.js';
import { grain, showIntro, stopIntro, pauseIntro, resumeIntro, showBack, hideBack, buildLock, buildHome, refreshBadges, banner, buildBall, ballBadge, ballMenu, ballTip, openNote, openPola } from './shell.js';
import { APPS, currentThread, watchClues } from './apps.js';
import { openClues, openThink, openHint, openClose } from './book.js';
import { finish, playEnding, showWiped } from './ending.js';
import { pumpLive, unlocked, addClue, visibleQuestions } from './logic.js';
import { CHATS } from './chats.js';
import { CLUES } from './story.js';

grain();
applySettings();

// ═════════════ 打开 / 关上 App ═════════════
let cur = null;   // { id, win, ctx, from }
function openApp(id, fromEl, opts = {}) {
  if (!APPS[id]) return;
  if (cur) closeApp(true);
  const host = h('div', { class: 'stack' });
  const win = h('div', { class: 'appwin' }, host);
  $('#apps').append(win);
  const ctx = { id, stack: null, close: () => closeApp() };
  ctx.stack = new Stack(host, () => closeApp());
  const r = fromEl ? fromEl.getBoundingClientRect() : null;
  cur = { id, win, ctx, rect: r };
  APPS[id](ctx, {
    ...opts,
    onErase: () => openClose(finish),
    onCancelTask: () => openClose(finish, 'cancel'),
  });
  sfx.open();
  if (r) {
    const W = innerWidth, H = innerHeight;
    const sx = r.width / W, sy = r.height / H;
    win.animate([
      { transform: `translate(${r.left}px,${r.top}px) scale(${sx},${sy})`, borderRadius: '60px', opacity: 0.4 },
      { transform: 'translate(0,0) scale(1,1)', borderRadius: '0px', opacity: 1 },
    ], { duration: 380, easing: 'cubic-bezier(.2,.85,.25,1)' });
  }
  $('#home').classList.add('behind');
  setTimeout(() => watchClues(win), 450);
}
function closeApp(instant = false) {
  if (!cur) return;
  const { win, rect } = cur;
  cur = null;
  $('#home').classList.remove('behind');
  if (instant || !rect) { win.remove(); return; }
  sfx.close();
  const W = innerWidth, H = innerHeight;
  win.animate([
    { transform: 'translate(0,0) scale(1,1)', borderRadius: '0px', opacity: 1 },
    { transform: `translate(${rect.left}px,${rect.top}px) scale(${rect.width / W},${rect.height / H})`, borderRadius: '60px', opacity: 0 },
  ], { duration: 320, easing: 'cubic-bezier(.3,.7,.3,1)', fill: 'forwards' }).onfinish = () => win.remove();
  refreshBadges();
}

// ═════════════ 小圆球 ═════════════
function menu() {
  const freshClues = S.fresh.length, freshIdeas = S.freshConcl.length;
  const phoneOpen = S.phase === 'home';
  ballMenu([
    ['home', '主屏幕', 'home', () => { if (cur) closeApp(); }, null, !phoneOpen],
    ['clue', '线索', 'clue', openClues, freshClues || null],
    ['think', '推理', 'think', openThink, freshIdeas ? true : null],
    ['hint', '提示', 'hint', openHint],
    ['back', '背面', 'flip', backPeek],
    ['close', '结案', 'stamp', () => openClose(finish), null, !phoneOpen],
  ]);
}
function backPeek() {
  showBack(() => { hideBack(); $('#backside').classList.remove('peek'); }, '翻回去');
  $('#backside').classList.add('peek');
}
function paintBall() { ballBadge(S.fresh.length + S.freshConcl.length); }

// ═════════════ 各个阶段 ═════════════
function toPhone() {
  $('#phone').hidden = false;
  buildHome(openApp);
  if (!unlocked('phone')) { $('#lock').hidden = false; buildLock(); }
  else { $('#lock').hidden = true; S.phase = 'home'; }
  buildBall(menu);
  paintBall();
  setTimeout(ballTip, 900);
  startClock();
}

function boot() {
  if (S.phase === 'intro') {
    showIntro(() => {
      S.phase = 'back'; save(true);
      stat((st) => { st.played = (st.played || 0) + 1; if (!st.endings) st.endings = '0 / 6'; if (!st.last) st.last = '—'; st.bestClues = st.bestClues || 0; });
      startClock();
      showBack(() => { hideBack(); S.phase = 'lock'; save(); toPhone(); });
      buildBall(menu); paintBall();
    });
  } else if (S.phase === 'back') {
    showBack(() => { hideBack(); S.phase = 'lock'; save(); toPhone(); });
    buildBall(menu); paintBall();
    startClock();
  } else if (S.phase === 'lock' || S.phase === 'home') {
    toPhone();
  } else if (S.phase === 'ending') {
    playEnding();
  } else if (S.phase === 'wiped') {
    showWiped();
  }
}

// ═════════════ 事件 ═════════════
let clueToastAt = 0;
on('clue', (id) => {
  paintBall();
  if (!S.tips.q && visibleQuestions().length) {
    S.tips.q = true; save();
    setTimeout(() => { sfx.idea(); toast('有件事不太对劲。去「推理」里看看。', { icon: 'think', cls: 'idea-t', ms: 3200 }); }, 1800);
  }
  const now = performance.now();
  if (now - clueToastAt > 1400) { sfx.clue(); toast('线索本 +1', { icon: 'clue', cls: 'clue-t', ms: 1600 }); clueToastAt = now; }
});
on('conclusion', () => {
  paintBall();
  setTimeout(() => { sfx.idea(); toast('你有了一个新的想法。去「推理」里看看。', { icon: 'think', cls: 'idea-t', ms: 3200 }); }, 600);
});
on('deduce', paintBall);
on('book', paintBall);
on('read', refreshBadges);
on('seen', refreshBadges);
on('unlock', (flag) => {
  refreshBadges();
  if (flag === 'phone') {
    S.phase = 'home'; save();
    const lock = $('#lock');
    lock.animate([{ transform: 'translateY(0)', opacity: 1 }, { transform: 'translateY(-100%)', opacity: 0.6 }], { duration: 480, easing: 'cubic-bezier(.3,.7,.25,1)' }).onfinish = () => { lock.hidden = true; };
    $('#home').animate([{ transform: 'scale(1.08)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }], { duration: 520, easing: 'cubic-bezier(.2,.85,.25,1)' });
  }
});
on('live', (l) => {
  if (l.notify) {
    if (S.phase === 'lock') buildLock();
    banner({ app: l.notify.app, text: l.notify.text });
    return;
  }
  const c = CHATS.find((x) => x.id === l.chat);
  const th = currentThread();
  if (cur && cur.id === 'msgs' && th && th.id === l.chat) {
    th.append({ ...l.msg, t: S.live[l.id], live: true });
  } else if (!l.silent && !l.msg.me) {
    banner({ app: '信息', who: c.name, text: l.msg.text, onTap: () => { if (unlocked('phone')) openApp('msgs', document.querySelector('.app[data-app="msgs"] .tile'), { chat: l.chat }); } });
  }
  if (cur && cur.id === 'msgs' && cur.ctx.repaint) cur.ctx.repaint();
  if (S.phase === 'lock') buildLock();
  refreshBadges();
});
on('tick', () => { if (S.phase === 'lock' || S.phase === 'home') pumpLive(); });
on('minute', () => {
  if (S.phase === 'home' && !cur) {
    const c = clock();
    const d = document.querySelector('.wg-day'); if (d && d.textContent !== String(c.day)) buildHome(openApp);
  }
});

hb.onPause(() => { stopClock(); pauseIntro(); save(true); });
hb.onResume(() => { if (['back', 'lock', 'home'].includes(S.phase)) startClock(); if (S.phase === 'intro') resumeIntro(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) save(true); });

boot();

// 测试用
window.__lost = {
  S, emit, openApp, closeApp, addClue, finish,
  get cur() { return cur; },
  clues: () => Object.keys(CLUES),
};
