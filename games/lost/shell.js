// 手机的外壳：开场、手机背面、锁屏、主屏幕、悬浮小圆球、通知横幅
import { h, $, icon, ic, nl, toast } from './ui.js';
import { S, save, emit, on, clock, weekday, SET } from './state.js';
import { sfx } from './sfx.js';
import { addClue, checkPass, unlock, totalUnread, lastMsg, hasClue } from './logic.js';
import { INTRO, BACK, CLUES } from './story.js';
import { CHATS, LIVE } from './chats.js';
import { MEDICAL } from './content.js';
import { hb } from './state.js';

// ── 颗粒：画一张噪点图当底纹 ──
export function grain() {
  const c = document.createElement('canvas');
  c.width = c.height = 160;
  const g = c.getContext('2d');
  const img = g.createImageData(160, 160);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.random() * 255;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 22;
  }
  g.putImageData(img, 0, 0);
  document.documentElement.style.setProperty('--grain', `url(${c.toDataURL()})`);
}

// ═════════════ 开场 ═════════════
let introRaf = 0, waveT = 0;
export function showIntro(onPick) {
  const el = $('#intro');
  el.hidden = false;
  el.innerHTML = '';
  const cv = h('canvas', { class: 'sea' });
  const text = h('div', { class: 'intro-text' });
  const btn = h('button', { class: 'pick', text: '拿起它', onclick: () => { sfx.flip(); stopIntro(); onPick(); } });
  const skip = h('button', { class: 'intro-skip', text: '跳过', onclick: () => { [...text.children].forEach((p) => p.classList.add('on')); btn.classList.add('on'); } });
  el.append(cv, h('div', { class: 'intro-glow' }), text, btn, skip);
  INTRO.forEach((line, i) => {
    const p = h('p', { text: line });
    text.append(p);
    setTimeout(() => p.classList.add('on'), 700 + i * 2300);
  });
  setTimeout(() => btn.classList.add('on'), 700 + INTRO.length * 2300);
  introCv = cv;
  drawSea(cv);
  sfx.wave(0.04);
  waveT = setInterval(() => sfx.wave(0.035 + Math.random() * 0.02), 4200);
}
let introCv = null;
export function pauseIntro() { cancelAnimationFrame(introRaf); clearInterval(waveT); }
export function resumeIntro() {
  if ($('#intro').hidden || !introCv) return;
  pauseIntro();
  drawSea(introCv);
  waveT = setInterval(() => sfx.wave(0.035 + Math.random() * 0.02), 4200);
}
export function stopIntro() {
  cancelAnimationFrame(introRaf); clearInterval(waveT);
  $('#intro').hidden = true;
}
function drawSea(cv) {
  const g = cv.getContext('2d');
  const dpr = Math.min(2, devicePixelRatio || 1);
  const fit = () => { cv.width = cv.clientWidth * dpr; cv.height = cv.clientHeight * dpr; };
  fit();
  const t0 = performance.now();
  const frame = (now) => {
    if (cv.clientWidth * dpr !== cv.width) fit();
    const W = cv.width, H = cv.height, t = (now - t0) / 1000;
    g.clearRect(0, 0, W, H);
    const hz = H * 0.46;
    // 天和海
    const sky = g.createLinearGradient(0, 0, 0, hz);
    sky.addColorStop(0, '#07080b'); sky.addColorStop(1, '#14171d');
    g.fillStyle = sky; g.fillRect(0, 0, W, hz);
    const sea = g.createLinearGradient(0, hz, 0, H);
    sea.addColorStop(0, '#0d1015'); sea.addColorStop(1, '#040506');
    g.fillStyle = sea; g.fillRect(0, hz, W, H - hz);
    // 浪：一条条细线，越近越宽、越亮
    for (let i = 0; i < 26; i++) {
      const k = i / 26, y = hz + Math.pow(k, 1.8) * (H - hz) * 0.9 + 4 * dpr;
      g.beginPath();
      g.strokeStyle = `rgba(160,175,195,${0.03 + k * 0.08})`;
      g.lineWidth = (0.6 + k * 1.4) * dpr;
      for (let x = 0; x <= W; x += 8 * dpr) {
        const yy = y + Math.sin(x / (40 + k * 120) / dpr + t * (0.6 + k) + i) * (1 + k * 5) * dpr;
        x === 0 ? g.moveTo(x, yy) : g.lineTo(x, yy);
      }
      g.stroke();
    }
    // 远处的航标灯
    const blink = (Math.sin(t * 1.6) + 1) / 2;
    g.fillStyle = `rgba(220,70,60,${0.25 + blink * 0.6})`;
    g.beginPath(); g.arc(W * 0.78, hz - 3 * dpr, 2.2 * dpr, 0, 7); g.fill();
    g.fillStyle = `rgba(220,70,60,${blink * 0.12})`;
    g.beginPath(); g.arc(W * 0.78, hz + 10 * dpr, 6 * dpr, 0, 7); g.fill();
    // 栈道的木板（近处）
    g.fillStyle = '#0a0b0d';
    g.fillRect(0, H * 0.84, W, H * 0.16);
    g.strokeStyle = 'rgba(255,255,255,.035)'; g.lineWidth = dpr;
    for (let i = 0; i < 6; i++) { const y = H * 0.84 + i * H * 0.03; g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
    introRaf = requestAnimationFrame(frame);
  };
  introRaf = requestAnimationFrame(frame);
}

// ═════════════ 手机背面 ═════════════
export function showBack(onFlip, label = '翻过来') {
  const el = $('#backside');
  el.hidden = false;
  el.innerHTML = '';
  const note = h('button', { class: 'tuck note', 'aria-label': '纸条', onclick: () => openNote() },
    h('span', { class: 'fold' }), h('span', { class: 'scrawl', text: '捡到它的人：' }));
  const pola = h('button', { class: 'tuck pola', 'aria-label': '拍立得', onclick: () => openPola() },
    h('span', { class: 'pola-img' }), h('span', { class: 'pola-cap', text: '2.11 · 第一天' }));
  const ph = h('div', { class: 'pback' },
    h('div', { class: 'cam' }, h('i'), h('i'), h('i', { class: 'fl' })),
    h('div', { class: 'logo-mark' }),
    pola, note,
    h('div', { class: 'case-gloss' }));
  el.append(
    h('div', { class: 'bench' }),
    h('p', { class: 'back-cap', text: '透明手机壳里夹着两样东西。点一点看看。' }),
    ph,
    h('button', { class: 'flip-btn', onclick: () => { sfx.flip(); ph.classList.add('flipping'); setTimeout(onFlip, 420); } }, ic('flip'), h('span', { text: label })));
}
export function hideBack() { $('#backside').hidden = true; }

function overlay(cls, ...kids) {
  const wrap = h('div', { class: 'ovl ' + cls, onclick: (e) => { if (e.target === wrap || e.target.closest('.ovl-x')) close(); } },
    h('div', { class: 'ovl-box' }, ...kids, h('button', { class: 'ovl-x', 'aria-label': '关闭', html: icon('close') })));
  const close = () => { wrap.classList.remove('on'); setTimeout(() => wrap.remove(), 300); };
  $('#sheets').append(wrap);
  requestAnimationFrame(() => wrap.classList.add('on'));
  return { wrap, close };
}
export function openNote() {
  sfx.paper();
  overlay('paper-ovl', h('div', { class: 'paper' }, nl(BACK.note)));
  addClue('note');
}
export function openPola() {
  sfx.paper();
  overlay('pola-ovl',
    h('div', { class: 'pola-big' },
      h('div', { class: 'pola-shot' }, h('span', { text: '照片里' })),
      h('p', { class: 'pola-desc' }, nl(BACK.polaroid)),
      h('div', { class: 'pola-hand', text: BACK.polaroidText })));
  addClue('polaroid');
}
export function openMedical() {
  overlay('med-ovl',
    h('div', { class: 'med' },
      h('div', { class: 'med-head' }, h('b', { text: '医疗急救卡' }), h('small', { text: '锁屏时也能看到' })),
      h('div', { class: 'med-name', text: MEDICAL.name }),
      row('出生日期', MEDICAL.birth), row('血型', MEDICAL.blood), row('过敏', MEDICAL.allergy),
      h('div', { class: 'med-sec', text: '紧急联系人' }),
      MEDICAL.contacts.map(([n, r]) => row(r, n)),
      h('div', { class: 'med-sec', text: '备注' }),
      h('p', { class: 'med-note', text: MEDICAL.note })));
  addClue('medical');
  function row(k, v) { return h('div', { class: 'med-row' }, h('span', { text: k }), h('b', { text: v })); }
}

// ═════════════ 锁屏 ═════════════
const LOCK_NOTIFS = () => {
  const arr = [
    { app: '信息', who: '程屿', text: '我把你留在这儿了', t: '22:52' },
    { app: '信息', who: '程屿', text: '我做不到', t: '22:51' },
    { app: '信息', who: '程屿', text: '我在码头', t: '21:40' },
    { app: '回声', who: '', text: '「第一千天」已完成。「立冬」将于明天 17:52 执行。', t: '21:00', echo: true },
    { app: '信息', who: '许棠', text: '明天九点我到阿姨家，饺子我陪她包。程屿，你答应过念念的', t: '20:00' },
    { app: '信息', who: '妈妈', text: '记得。妈包好了，荠菜的，两大袋，冻在冰箱里。明天小许说要来', t: '19:12' },
  ];
  // 玩的时候冒出来的，也排在最上面
  const live = LIVE.filter((l) => S.live[l.id] && (l.msg ? !l.msg.me : true)).map((l) => {
    const c = l.chat && CHATS.find((x) => x.id === l.chat);
    return { app: l.notify ? l.notify.app : '信息', who: c ? c.name : '', text: l.notify ? l.notify.text : l.msg.text, t: S.live[l.id].slice(11) };
  }).reverse();
  return [...live, ...arr];
};

export function buildLock() {
  const el = $('#lock');
  el.innerHTML = '';
  const c = clock();
  const time = h('div', { class: 'lk-time', text: c.text });
  const date = h('div', { class: 'lk-date', text: `${c.day === 6 ? '11月6日' : '11月7日'} 星期${weekday(c.date)}` });
  const widget = h('button', { class: 'lk-widget', onclick: () => { addClue('widget1000'); toast('认识程屿的第 1000 天', { icon: 'cal' }); } },
    h('span', { class: 'w-k', text: '认识 程屿 ☂' }), h('span', { class: 'w-d' }, h('b', { text: '1000' }), ' 天'));
  const list = h('div', { class: 'lk-notifs' });
  for (const n of LOCK_NOTIFS()) {
    list.append(h('button', { class: 'nt' + (n.echo ? ' echo' : ''), onclick: () => openPad() },
      h('div', { class: 'nt-h' }, h('span', { class: 'nt-ic', html: icon(n.app === '回声' ? 'echo' : n.app === '日历' ? 'cal' : 'msg') }), h('span', { text: n.app }), h('time', { text: n.t })),
      n.who ? h('b', { text: n.who }) : null,
      h('p', { text: n.text })));
  }
  const swipe = h('div', { class: 'lk-swipe' }, h('i'), h('span', { text: '向上轻扫以解锁' }));
  el.append(
    h('div', { class: 'lk-top' }, h('span', { class: 'lk-lock', html: icon('lock') }), date, time, widget),
    list, swipe);
  // 上滑或者点底部 → 输入密码
  let y0 = null;
  el.onpointerdown = (e) => { if (e.target.closest('.nt,.lk-widget')) return; y0 = e.clientY; };
  el.onpointerup = (e) => {
    if (y0 == null) return;
    const dy = y0 - e.clientY; y0 = null;
    if (dy > 50 || e.target.closest('.lk-swipe')) openPad();
  };
  lockEls = { time, date };
  if (!lockWired) { lockWired = true; on('minute', () => { if (!lockEls) return; const cc = clock(); lockEls.time.textContent = cc.text; lockEls.date.textContent = `11月${cc.day}日 星期${weekday(cc.date)}`; }); }
  setTimeout(() => addClue('widget1000'), 2500);
}
let lockEls = null, lockWired = false;
export function refreshLockNotifs() { if (S.phase === 'lock') buildLock(); }

let padOpen = false;
export function openPad() {
  if (padOpen) return;
  padOpen = true;
  sfx.tap();
  let code = '';
  const dots = h('div', { class: 'dots' }, [...Array(6)].map(() => h('i')));
  const msg = h('div', { class: 'pad-msg', text: '输入密码' });
  const paint = () => [...dots.children].forEach((d, i) => d.classList.toggle('on', i < code.length));
  const keyBtn = (n, sub) => h('button', { class: 'pk', onclick: () => press(n) }, h('b', { text: n }), h('small', { text: sub }));
  const subs = ['', 'A B C', 'D E F', 'G H I', 'J K L', 'M N O', 'P Q R S', 'T U V', 'W X Y Z'];
  const delBtn = h('button', { class: 'pad-link', text: '取消', onclick: () => { if (code) { code = code.slice(0, -1); sfx.del(); paint(); delBtn.textContent = code ? '删除' : '取消'; } else close(); } });
  const pad = h('div', { class: 'pad' },
    h('div', { class: 'pad-top' }, h('span', { class: 'lk-lock', html: icon('lock') }), msg, dots),
    h('div', { class: 'pkeys' }, [1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => keyBtn(String(n), subs[n - 1])), h('i'), keyBtn('0', ''), h('i')),
    h('div', { class: 'pad-foot' }, h('button', { class: 'pad-link', text: '紧急情况', onclick: openMedical }), delBtn));
  const wrap = h('div', { class: 'pad-wrap' }, pad);
  $('#phone').append(wrap);
  requestAnimationFrame(() => wrap.classList.add('on'));
  function close() { padOpen = false; wrap.classList.remove('on'); setTimeout(() => wrap.remove(), 300); }
  function press(n) {
    if (Date.now() < S.lockUntil) { sfx.wrong(); return; }
    if (code.length >= 6) return;
    sfx.key(); hb.haptic(6);
    code += n; paint(); delBtn.textContent = '删除';
    if (code.length === 6) setTimeout(() => {
      if (checkPass('phone', code)) {
        sfx.unlock();
        S.wrong = 0;
        unlock('phone');
        close();
        emit('unlocked-phone');
      } else {
        sfx.wrong(); hb.haptic([20, 40, 20]);
        dots.classList.remove('shake'); void dots.offsetWidth; dots.classList.add('shake');
        S.wrong++;
        code = ''; paint(); delBtn.textContent = '取消';
        if (S.wrong % 6 === 0) {
          S.lockUntil = Date.now() + 30000;
          msg.textContent = '手机已停用，30 秒后再试';
          setTimeout(() => { msg.textContent = '输入密码'; }, 30000);
        } else msg.textContent = '密码错误';
        save();
      }
    }, 140);
  }
}

// ═════════════ 主屏幕 ═════════════
export const HOME_APPS = [
  ['calendar', '日历', 'cal'], ['weather', '天气', 'weather'], ['clock', '时钟', 'clock'], ['gallery', '画框', 'frame'],
  ['health', '健康', 'health'], ['wallet', '钱包', 'wallet'], ['mail', '邮件', 'mail'], ['maps', '足迹', 'map'],
  ['notes', '备忘录', 'note'], ['voice', '录音', 'voice'], ['echo', '回声', 'echo'], ['settings', '设置', 'gear'],
];
export const DOCK = [['phone', '电话', 'phone'], ['msgs', '信息', 'msg'], ['photos', '相册', 'photo'], ['browser', '浏览器', 'web']];

export function buildHome(openApp) {
  const el = $('#home');
  el.innerHTML = '';
  const c = clock();
  const cal = h('button', { class: 'wg wg-cal', onclick: (e) => openApp('calendar', e.currentTarget) },
    h('div', { class: 'wg-week', text: `星期${weekday(c.date)}` }),
    h('div', { class: 'wg-day', text: String(c.day) }),
    h('div', { class: 'wg-ev' }, h('i'), h('span', { text: c.day === 6 ? '21:00 第一千天' : '今天 立冬' })),
    h('div', { class: 'wg-ev dim' }, h('i'), h('span', { text: c.day === 6 ? '明天 立冬' : '17:52' })));
  const ph = h('button', { class: 'wg wg-photo', onclick: (e) => openApp('photos', e.currentTarget, { photo: 'lighthouse' }) },
    h('div', { class: 'wg-ph-cap' }, h('i', { text: '精选照片' }), h('b', { text: '灯塔下' }), h('small', { text: '屿岛 · 2024年10月1日' })));
  const tile = ([id, name, icn]) => h('button', { class: 'app', 'data-app': id, onclick: (e) => openApp(id, e.currentTarget.querySelector('.tile')) },
    h('span', { class: 'tile t-' + id, html: icon(icn) }, h('em', { class: 'badge', hidden: true })),
    h('span', { class: 'lbl', text: name }));
  el.append(
    h('div', { class: 'widgets' }, cal, ph),
    h('div', { class: 'grid' }, HOME_APPS.map(tile)),
    h('div', { class: 'home-dots' }, h('i', { class: 'on' }), h('i')),
    h('div', { class: 'dock' }, DOCK.map(tile)));
  refreshBadges();
}
export function refreshBadges() {
  const set = (id, n) => {
    const b = document.querySelector(`.app[data-app="${id}"] .badge`);
    if (!b) return;
    b.hidden = !n; b.textContent = n > 99 ? '99+' : n;
  };
  set('msgs', totalUnread());
  set('phone', S.seen.vm ? 0 : 1);
  set('mail', S.flags.mail != null && !S.seen.m_task ? 1 : 0);
}

// ═════════════ 通知横幅 ═════════════
export function banner({ app, who, text, onTap }) {
  const host = $('#banners');
  const b = h('button', { class: 'bn' },
    h('span', { class: 'nt-ic', html: icon(app === '日历' ? 'cal' : app === '回声' ? 'echo' : 'msg') }),
    h('div', { class: 'bn-t' }, h('div', { class: 'bn-h' }, h('b', { text: who || app }), h('time', { text: '现在' })), h('p', { text })));
  b.onclick = () => { dismiss(); onTap && onTap(); };
  host.append(b);
  requestAnimationFrame(() => b.classList.add('on'));
  let y0 = null;
  b.addEventListener('pointerdown', (e) => { y0 = e.clientY; });
  b.addEventListener('pointerup', (e) => { if (y0 != null && y0 - e.clientY > 20) dismiss(); y0 = null; });
  const t = setTimeout(dismiss, 4600);
  function dismiss() { clearTimeout(t); b.classList.remove('on'); setTimeout(() => b.remove(), 400); }
  sfx.notif(); hb.haptic(10);
}

// ═════════════ 小圆球 ═════════════
let ballMenuFn = null;
export function buildBall(menu) {
  const el = $('#ball');
  el.hidden = false;
  el.innerHTML = '';
  el.append(h('i'), h('i'), h('i'), h('em', { class: 'badge', hidden: true }));
  const W = () => innerWidth, H = () => innerHeight;
  const place = (anim) => {
    const size = 54, m = 6;
    const x = S.ball.side > 0 ? W() - size - m : m;
    const top = Math.max(60, Math.min(H() - 120, S.ball.y * H()));
    el.style.transition = anim ? 'transform .32s cubic-bezier(.2,.85,.25,1), opacity .4s' : 'opacity .4s';
    el.style.transform = `translate3d(${x}px,${top}px,0)`;
  };
  place(false);
  ballMenuFn = menu;
  if (el.dataset.wired) return {};
  el.dataset.wired = '1';
  addEventListener('resize', () => place(false));
  let id = null, sx = 0, sy = 0, ox = 0, oy = 0, moved = false, idle = 0;
  const wake = () => { el.classList.remove('idle'); clearTimeout(idle); idle = setTimeout(() => el.classList.add('idle'), 2800); };
  wake();
  el.addEventListener('pointerdown', (e) => {
    id = e.pointerId; sx = e.clientX; sy = e.clientY; moved = false;
    const r = el.getBoundingClientRect(); ox = r.left; oy = r.top;
    el.setPointerCapture(id); el.style.transition = 'opacity .2s'; wake();
    el.classList.add('press');
  });
  el.addEventListener('pointermove', (e) => {
    if (e.pointerId !== id) return;
    const dx = e.clientX - sx, dy = e.clientY - sy;
    if (!moved && Math.hypot(dx, dy) < 6) return;
    moved = true;
    el.style.transform = `translate3d(${ox + dx}px,${oy + dy}px,0)`;
  });
  const end = (e) => {
    if (e.pointerId !== id) return;
    id = null;
    el.classList.remove('press');
    if (moved) {
      S.ball.side = e.clientX > W() / 2 ? 1 : -1;
      S.ball.y = Math.max(0.08, Math.min(0.86, (e.clientY - 27) / H()));
      save(); place(true); wake();
    } else { sfx.tap(); ballMenuFn(el); }
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
  return { wake };
}
export function ballBadge(n) {
  const b = $('#ball .badge');
  if (!b) return;
  b.hidden = !n;
  b.textContent = n;
}

/** 点小圆球弹出来的方块 */
export function ballMenu(items) {
  const wrap = h('div', { class: 'bm-wrap' });
  const close = () => { wrap.classList.remove('on'); setTimeout(() => wrap.remove(), 260); };
  const box = h('div', { class: 'bm' }, items.map(([key, label, icn, fn, badge, disabled]) =>
    h('button', { class: 'bm-it' + (disabled ? ' off' : ''), onclick: () => { if (disabled) { sfx.nope(); return; } close(); setTimeout(fn, 120); } },
      h('span', { class: 'bm-ic', html: icon(icn) }, badge ? h('em', { class: 'badge', text: badge === true ? '' : badge }) : null),
      h('span', { text: label }))));
  wrap.append(box);
  wrap.addEventListener('click', (e) => { if (e.target === wrap) close(); });
  $('#sheets').append(wrap);
  requestAnimationFrame(() => wrap.classList.add('on'));
}

/** 第一次见到小圆球时的说明 */
export function ballTip() {
  if (S.tips.ball) return;
  const b = $('#ball').getBoundingClientRect();
  const tip = h('div', { class: 'coach' },
    h('p', {}, '这是你的小圆球。', h('br'), '线索、推理、提示、结案，都在里面。卡住了就点它。'),
    h('button', { text: '知道了', onclick: () => { S.tips.ball = true; save(); tip.classList.remove('on'); setTimeout(() => tip.remove(), 300); } }));
  tip.style.top = Math.max(70, b.top - 10) + 'px';
  tip.classList.add(b.left > innerWidth / 2 ? 'r' : 'l');
  $('#sheets').append(tip);
  requestAnimationFrame(() => tip.classList.add('on'));
}
