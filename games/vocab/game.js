// 单词：把墨墨背单词开放 API 给的学习数据画出来。
//   三圈圆环（今天全部 / 新词 / 复习）、第一反应分段条、今天单词的格子和列表、复习预报柱状图、
//   顽固词横栏、云词本列表、最近几天（本机每天记一笔）。没填 Token 时显示示例数据。
//   只读：不往墨墨写任何东西。Token 存在 game.vocab.token，导出备份时会跳过（core/js/store.js 的 SECRET）。
import { hub } from '../_shared/hub.js';
import { sound } from '../_shared/sound.js';
import { client, fetchAll, bjDay, addDays, weekday, chaptersOf } from './api.js';
import { demoSnapshot, demoNotepad } from './demo.js';

const hb = hub('vocab');
let S = hb.settings();
sound.enabled = S.sound;

const $ = (id) => document.getElementById(id);
const TAU = Math.PI * 2;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const WEEK = '日一二三四五六';

function h(tag, a = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(a || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'vars') for (const [p, x] of Object.entries(v)) el.style.setProperty(p, x);
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat(Infinity)) if (k != null && k !== false) el.append(k.nodeType ? k : String(k));
  return el;
}

const RESP = {
  WELL_FAMILIAR: { label: '熟知', color: 'var(--well)' },
  FAMILIAR: { label: '认识', color: 'var(--know)' },
  VAGUE: { label: '模糊', color: 'var(--vague)' },
  FORGET: { label: '忘记', color: 'var(--forget)' },
};
const respOf = (c) => (c === 'CANCEL_WELL_FAMILIAR' ? 'FAMILIAR' : RESP[c] ? c : null);

const ICON = {
  speak: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor" stroke-width="1.4"/><path d="M15.5 9a4.2 4.2 0 0 1 0 6M18.2 6.3a8 8 0 0 1 0 11.4"/></svg>',
  chev: '<svg viewBox="0 0 8 14"><path d="M1.5 1.5L6.5 7l-5 5.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};

const sfx = {
  done() { sound.arp([784, 1175], { gap: 0.08, dur: 0.24, type: 'sine', vol: 0.07 }); },
  tap() { sound.tone({ f: 1500, to: 1250, dur: 0.035, type: 'sine', vol: 0.05 }); },
  err() { sound.tone({ f: 320, to: 210, dur: 0.24, type: 'triangle', vol: 0.08 }); },
  open() { sound.hiss({ f: 2600, to: 900, dur: 0.12, q: 0.8, vol: 0.03 }); },
};

/* ======================================================================
   状态
   ====================================================================== */
let token = hb.load('token', '') || '';
let base = hb.load('base', '') || '';
let snap = null;
let loading = false;
let err = null;      // { kind, msg }
let paused = false;
const view = { filter: 'all', mode: hb.load('view', 'grid') === 'list' ? 'list' : 'grid', sel: null, stickyAll: false };
const npCache = new Map();

const api = () => client({ token, base, prefix: hb.load('prefix', null), onPrefix: (p) => hb.save('prefix', p) });

/* ======================================================================
   读数据
   ====================================================================== */
async function refresh() {
  if (!token) { snap = demoSnapshot(); err = null; render(true); return; }
  if (loading) return;
  loading = true; err = null;
  const first = !snap || snap.demo;
  if (first) { snap = null; render(false); }
  setLoading();
  try {
    const s = await fetchAll(api(), {
      days: 10,
      onPart: (part) => { if (first && !part.plan && !Object.keys(part.errors).length) { snap = part; render(true); } },
    });
    snap = s;
    hb.save('cache', s);
    remember(s);
    loading = false;
    render(true);
    sfx.done();
  } catch (e) {
    loading = false;
    err = { kind: (e && e.kind) || 'bad', msg: (e && e.kind === 'bad' && e.message) || '' };
    render(false);
    sfx.err();
  }
}

function setLoading() {
  $('refreshBtn').classList.toggle('spin', loading);
  updatedText();
}

/** 本机每天记一笔：墨墨没有按日期查的接口，「最近」那张图全靠这个 */
function remember(s) {
  if (s.demo) return;
  const hist = hb.load('history', {});
  hist[s.day] = { f: s.progress.finished, t: s.progress.total, ms: s.progress.ms };
  const keys = Object.keys(hist).sort();
  while (keys.length > 120) delete hist[keys.shift()];
  hb.save('history', hist);
  let best = 0, run = 0, prev = null, ms = 0;
  for (const d of Object.keys(hist).sort()) {
    const r = hist[d];
    ms += r.ms || 0;
    const ok = r.t > 0 && r.f >= r.t;
    run = ok ? (prev && addDays(prev, 1) === d ? run + 1 : 1) : 0;
    if (ok) prev = d; else prev = null;
    best = Math.max(best, run);
  }
  hb.saveStats({ ...hb.stats(), days: Object.keys(hist).length, bestStreak: best, minutes: Math.round(ms / 60000) });
}

const histData = () => (snap && snap.demo ? snap.history : hb.load('history', {})) || {};

/* ======================================================================
   顶部
   ====================================================================== */
function renderTop() {
  const d = bjDay();
  const [, m, dd] = d.split('-').map(Number);
  $('date').textContent = `${m}月${dd}日 星期${WEEK[weekday(d)]}`;
  $('keyBtn').classList.toggle('dot', !token);
  $('refreshBtn').classList.toggle('spin', loading);
  updatedText();
}

function clockOf(t) {
  const p = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit', hour12: false }).format(t);
  return p;
}
function updatedText() {
  let t = '';
  if (loading) t = '正在从墨墨读取…';
  else if (snap && snap.demo) t = '示例数据';
  else if (snap) {
    const m = (Date.now() - snap.at) / 60000;
    if (m < 1) t = '刚刚更新';
    else if (m < 60) t = `${Math.floor(m)} 分钟前更新`;
    else if (bjDay(new Date(snap.at)) === bjDay()) t = `今天 ${clockOf(snap.at)} 更新`;
    else { const [, mm, dd] = bjDay(new Date(snap.at)).split('-').map(Number); t = `${mm}月${dd}日 ${clockOf(snap.at)} 更新的数据`; }
  }
  $('updated').textContent = t;
}

const ERR = {
  network: '没连上墨墨。可能是 Token 不对、网络不通，或者墨墨不让网页直接访问，浏览器分不出是哪一种。',
  auth: '墨墨说 Token 不对或者过期了，去墨墨 App 里重新复制一个。',
  rate: '刷新得太勤，墨墨让歇一会儿，过一分钟再试。',
  timeout: '墨墨 20 秒没有回应，稍后再刷新。',
  server: '墨墨那边出错了，稍后再刷新。',
  notfound: '墨墨的接口地址变了，这个 App 需要更新。',
  bad: '墨墨返回的内容看不懂',
};

function renderBanner() {
  const b = $('banner');
  let tone = '', text = '', btn = null;
  if (err) {
    tone = err.kind === 'auth' || err.kind === 'network' ? 'bad' : 'warn';
    text = err.kind === 'bad' ? `${ERR.bad}${err.msg ? `：${err.msg}` : '。'}` : ERR[err.kind] || ERR.bad;
    btn = tone === 'bad' ? ['检查 Token', openKey] : ['再试一次', refresh];
  } else if (!token) {
    text = '现在是示例数据。填上墨墨的 Token，就能看到你自己的。';
    btn = ['填 Token', openKey];
  } else if (snap && !loading && snap.day === bjDay() && !snap.progress.total && !snap.items.length) {
    tone = 'warn';
    text = '今天还没在墨墨里开始背。打开墨墨 App 同步一下，再回来刷新。';
  }
  b.hidden = !text;
  if (!text) return;
  b.className = `banner ${tone}`;
  b.replaceChildren(...[h('p', {}, text), btn && h('button', { onclick: btn[1] }, btn[0])].filter(Boolean));
}

/* ======================================================================
   圆环
   ====================================================================== */
const ringCv = $('rings'), rctx = ringCv.getContext('2d');
let ringVals = [], ringK = [1, 1, 1], ringRaf = 0, ringW = 188;
const RING_COLORS = [
  { c1: '#16966B', c2: '#7DF3C9', track: 'rgba(63,209,155,.16)' },
  { c1: '#1B7FC4', c2: '#93E6FF', track: 'rgba(76,195,242,.16)' },
  { c1: '#5B45D6', c2: '#CDBDFF', track: 'rgba(164,141,255,.17)' },
];

function sizeRings() {
  const r = ringCv.getBoundingClientRect();
  ringW = r.width || 188;
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  ringCv.width = Math.round(r.width * dpr); ringCv.height = Math.round(r.height * dpr);
  rctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function drawRings() {
  const W = ringW;
  const cx = W / 2, lw = W * 0.09, gap = W * 0.019;
  const radii = [cx - lw / 2 - 1, cx - lw * 1.5 - gap - 1, cx - lw * 2.5 - gap * 2 - 1];
  rctx.clearRect(0, 0, W, W);
  rctx.lineCap = 'round';
  ringVals.forEach((rv, i) => {
    const R = radii[i], col = RING_COLORS[i];
    rctx.lineWidth = lw;
    rctx.strokeStyle = col.track;
    rctx.beginPath(); rctx.arc(cx, cx, R, 0, TAU); rctx.stroke();
    const p = Math.min(1, rv) * ringK[i];
    if (p <= 0.002) return;
    const a0 = -Math.PI / 2, a1 = a0 + p * TAU;
    let stroke = col.c2;
    if (rctx.createConicGradient) {
      const g = rctx.createConicGradient(a0, cx, cx);
      const end = Math.max(0.03, p);
      g.addColorStop(0, col.c1); g.addColorStop(end, col.c2);
      if (end < 0.995) g.addColorStop(1, col.c1);
      stroke = g;
    }
    rctx.strokeStyle = stroke;
    rctx.beginPath(); rctx.arc(cx, cx, R, a0, a1); rctx.stroke();
    // 头上的阴影只投在前面，像真的绕过来压住
    if (p > 0.04) {
      const hx = cx + Math.cos(a1) * R, hy = cx + Math.sin(a1) * R;
      rctx.save();
      rctx.translate(hx, hy); rctx.rotate(a1 + Math.PI / 2);
      rctx.beginPath(); rctx.rect(0, -lw, lw * 1.4, lw * 2); rctx.clip();
      rctx.shadowColor = 'rgba(0,0,0,.45)'; rctx.shadowBlur = 7;
      rctx.fillStyle = col.c2;
      rctx.beginPath(); rctx.arc(0, 0, lw / 2, 0, TAU); rctx.fill();
      rctx.restore();
      rctx.fillStyle = col.c2;
      rctx.beginPath(); rctx.arc(hx, hy, lw / 2 - 0.2, 0, TAU); rctx.fill();
    }
  });
}

function animateRings(animate) {
  cancelAnimationFrame(ringRaf);
  if (!animate || reduced || paused) { ringK = [1, 1, 1]; drawRings(); return; }
  const t0 = performance.now();
  const ease = (x) => 1 - Math.pow(1 - x, 4);
  const step = (t) => {
    ringK = [0, 1, 2].map((i) => ease(Math.max(0, Math.min(1, (t - t0 - i * 130) / 1150))));
    drawRings();
    if (ringK[2] < 1 && !paused) ringRaf = requestAnimationFrame(step);
    else { ringK = [1, 1, 1]; drawRings(); }
  };
  ringRaf = requestAnimationFrame(step);
}

function counts(items) {
  const nw = items.filter((i) => i.isNew), rv = items.filter((i) => !i.isNew);
  return {
    nw: nw.length, nwDone: nw.filter((i) => i.done).length,
    rv: rv.length, rvDone: rv.filter((i) => i.done).length,
    done: items.filter((i) => i.done).length,
  };
}

function renderHero(animate) {
  const legend = $('legend'), mid = $('ringsMid'), foot = $('heroFoot');
  if (!snap) {
    ringVals = [0, 0, 0]; animateRings(false);
    mid.replaceChildren(h('b', {}, '—'), h('span', {}, loading ? '读取中' : '还没有数据'));
    legend.replaceChildren(...['全部', '新词', '复习'].map((l, i) => h('li', { vars: { '--c': `var(${['--r-all', '--r-new', '--r-rev'][i]})` } },
      h('i'), h('span', { class: 'lab' }, l), h('span', { class: 'num' }, '—'))));
    foot.textContent = '';
    return;
  }
  const p = snap.progress, c = counts(snap.items);
  const total = p.total || snap.items.length, fin = Math.min(total, p.finished || c.done);
  ringVals = [total ? fin / total : 0, c.nw ? c.nwDone / c.nw : 0, c.rv ? c.rvDone / c.rv : 0];
  animateRings(animate);
  const pct = total ? Math.round((fin / total) * 100) : 0;
  mid.replaceChildren(h('b', {}, total ? pct : '—', total ? h('small', {}, '%') : null), h('span', {}, total ? '今天完成' : '今天没有词'));
  const rows = [
    ['全部', '--r-all', fin, total],
    ['新词', '--r-new', c.nwDone, c.nw],
    ['复习', '--r-rev', c.rvDone, c.rv],
  ];
  legend.replaceChildren(...rows.map(([l, v, a, b]) => h('li', { vars: { '--c': `var(${v})` } },
    h('i'), h('span', { class: 'lab' }, l), h('span', { class: 'num' }, a, h('small', {}, `/ ${b}`)))));
  const min = Math.round(p.ms / 60000);
  const bits = [`今天学了 <b>${min}</b> 分钟`];
  if (snap.plan != null) bits.push(`学习规划里一共 <b>${snap.plan.toLocaleString('zh-CN')}</b> 个词`);
  if (c.done && fin < total) bits.push(`还差 <b>${total - fin}</b> 个`);
  else if (total && fin >= total) bits.push('今天的都背完了');
  foot.innerHTML = bits.join('，') + '。';
}

/* ======================================================================
   各个小块
   ====================================================================== */
const sec = (title, aside, ...body) => h('section', { class: 'sec' },
  h('div', { class: 'sec-h' }, h('h2', {}, title), aside != null && (aside.nodeType ? aside : h('span', { class: 'aside' }, aside))),
  ...body);

/** 横条长出来：先画成 0，下一帧再给真宽度 */
function grow(els, animate) {
  const apply = () => els.forEach(([el, prop, v]) => { el.style[prop] = v; });
  if (!animate || reduced) { apply(); return; }
  requestAnimationFrame(() => requestAnimationFrame(apply));
}

function firstSection(animate) {
  const done = snap.items.filter((i) => i.done);
  const keys = Object.keys(RESP);
  const n = Object.fromEntries(keys.map((k) => [k, 0]));
  let none = 0;
  for (const it of done) { const r = respOf(it.first); if (r) n[r]++; else none++; }
  const sum = keys.reduce((a, k) => a + n[k], 0);
  if (!sum) {
    return sec('第一反应', null, h('div', { class: 'sec-empty' }, done.length ? '墨墨这次没给第一反应的数据。' : '背过的词会在这里按「认识、模糊、忘记」分开。'));
  }
  const shown = keys.filter((k) => n[k]);
  const gapTotal = (shown.length - 1) * 3;
  const segs = shown.map((k) => h('i', { vars: { '--c': RESP[k].color }, title: `${RESP[k].label} ${n[k]}` }));
  grow(segs.map((el, i) => [el, 'width', `calc((100% - ${gapTotal}px) * ${n[shown[i]] / sum})`]), animate);
  return sec('第一反应', `背过的 ${sum + none} 个里`,
    h('div', { class: 'stack' }, segs),
    h('div', { class: 'stack-keys' }, keys.map((k) => h('div', { vars: { '--c': RESP[k].color } },
      h('span', { class: 'k' }, RESP[k].label),
      h('span', { class: 'v' }, n[k], h('small', {}, `${Math.round((n[k] / sum) * 100)}%`))))));
}

/* ---------- 今天的单词 ---------- */
let wordsPanel = null;
function wordsSection() {
  const seg = h('div', { class: 'seg', role: 'group', 'aria-label': '显示方式' },
    ...[['grid', '格子'], ['list', '列表']].map(([m, l]) => h('button', {
      'aria-pressed': String(view.mode === m),
      onclick: () => { if (view.mode === m) return; view.mode = m; hb.save('view', m); sfx.tap(); fillWords(); seg.querySelectorAll('button').forEach((b, i) => b.setAttribute('aria-pressed', String(['grid', 'list'][i] === m))); },
    }, l)));
  wordsPanel = h('div', { class: 'panel words' });
  fillWords();
  return sec('今天的单词', seg, wordsPanel);
}

const matches = (it, f) => f === 'all' || (f === 'new' && it.isNew) || (f === 'rev' && !it.isNew) || (f === 'todo' && !it.done);

function fillWords() {
  const items = snap.items;
  if (!items.length) {
    wordsPanel.replaceChildren(h('div', { class: 'sec-empty' }, '今天的单词列表还没有。打开墨墨 App 同步以后再刷新。'));
    return;
  }
  const c = counts(items);
  const chips = h('div', { class: 'chips' }, [['all', '全部', items.length], ['new', '新词', c.nw], ['rev', '复习', c.rv], ['todo', '没背完', items.length - c.done]]
    .map(([f, l, n]) => h('button', { 'aria-pressed': String(view.filter === f), onclick: () => { view.filter = f; sfx.tap(); fillWords(); } }, l, h('b', {}, n))));
  const colorOf = (it) => (it.done ? (respOf(it.first) ? RESP[respOf(it.first)].color : 'var(--tx-2)') : null);
  let body;
  if (view.mode === 'grid') {
    body = h('div', { class: 'grid' }, items.map((it) => h('button', {
      class: [it.isNew ? 'new' : '', it.done ? 'done' : 'todo', view.sel === it.order ? 'sel' : '', matches(it, view.filter) ? '' : 'dim'].join(' '),
      vars: it.done ? { '--c': colorOf(it) } : null,
      'aria-label': it.w,
      onclick: () => pick(it),
    })));
  } else {
    const shown = items.filter((it) => matches(it, view.filter));
    body = shown.length ? h('div', { class: 'wlist' }, shown.map((it) => h('button', {
      class: [it.done ? '' : 'todo', view.sel === it.order ? 'sel' : ''].join(' '),
      vars: it.done ? { '--c': colorOf(it) } : null,
      onclick: () => pick(it),
    }, it.w))) : h('div', { class: 'sec-empty' }, view.filter === 'todo' ? '都背完了。' : '这一类今天没有。');
  }
  const keys = h('div', { class: 'wkeys' },
    view.mode === 'grid' && h('span', {}, h('i', { class: 'c' }), '新词'),
    view.mode === 'grid' && h('span', {}, h('i'), '复习'),
    h('span', {}, h('i', { class: 'o' }), '还没背'),
    h('span', {}, '颜色是第一反应'));
  wordsPanel.replaceChildren(chips, body, keys, detail());
}

function detail() {
  const it = snap.items.find((x) => x.order === view.sel);
  if (!it) return h('div', { class: 'wdetail' }, h('span', { class: 'hint' }, view.mode === 'grid' ? '点一个格子，看看是哪个词。' : '点一个词听发音。'));
  const r = respOf(it.first);
  return h('div', { class: 'wdetail' },
    h('div', { class: 'grow' },
      h('div', { class: 'wd' }, it.w),
      h('div', { class: 'pills' },
        h('span', { class: 'pill' }, `第 ${it.order} 个`),
        h('span', { class: 'pill' }, it.isNew ? '新词' : '复习'),
        it.done ? (r ? h('span', { class: 'pill c', vars: { '--c': RESP[r].color } }, `第一反应：${RESP[r].label}`) : h('span', { class: 'pill' }, '背完了'))
          : h('span', { class: 'pill' }, '还没背'))),
    h('button', { class: 'speak', 'aria-label': `朗读 ${it.w}`, html: ICON.speak, onclick: () => speak(it.w, true) }));
}

function pick(it) {
  view.sel = view.sel === it.order && view.mode === 'grid' ? null : it.order;
  sfx.tap();
  if (view.sel != null) speak(it.w);
  fillWords();
}

/* ---------- 复习预报 ---------- */
function forecastSection(animate) {
  if (snap.errors.forecast) return sec('接下来要复习', null, h('div', { class: 'sec-empty' }, '复习预报没读到，下次刷新再试。'));
  if (!snap.forecast) return null;
  const fc = snap.forecast.slice(0, S.days);
  const total = snap.progress.total || snap.items.length;
  const cols = [{ day: snap.day, n: total, now: true }, ...fc];
  const max = Math.max(1, ...cols.map((c) => c.n));
  const peak = Math.max(...fc.map((c) => c.n));
  const sum = fc.reduce((a, c) => a + c.n, 0);
  const bars = [];
  const els = cols.map((c, i) => {
    const bar = h('i', { class: 'bar' });
    bars.push([bar, 'height', `${Math.max(c.n ? 4 : 0, (c.n / max) * 100)}%`]);
    const [, m, d] = c.day.split('-').map(Number);
    return h('div', { class: `col ${c.now ? 'now' : ''} ${!c.now && c.n === peak && peak > 0 ? 'peak' : ''}` },
      h('span', { class: 'v' }, c.n),
      h('div', { style: 'width:100%;height:calc(100% - 22px);display:flex;align-items:flex-end;justify-content:center' }, bar),
      h('span', { class: 'lab' }, h('b', {}, c.now ? '今天' : i === 1 ? '明天' : `周${WEEK[weekday(c.day)]}`), `${m}/${d}`));
  });
  grow(bars, animate);
  return sec('接下来要复习', `${fc.length} 天共 ${sum.toLocaleString('zh-CN')} 个`, h('div', { class: 'cols' }, els),
    h('p', { class: 'sec-note' }, '按墨墨排好的下次复习日期数的，斜纹那根是今天要背的。'));
}

/* ---------- 顽固词 ---------- */
function stickySection(animate) {
  if (snap.errors.records) return sec('顽固词', null, h('div', { class: 'sec-empty' }, '顽固词没读到，下次刷新再试。'));
  if (!snap.sticky) return null;
  const list = snap.sticky;
  if (!list.length) return sec('顽固词', '0 个', h('div', { class: 'sec-empty' }, '现在没有顽固词。反复忘记的词墨墨会标出来，到时候会排在这里。'));
  const shown = view.stickyAll ? list : list.slice(0, S.stickyN);
  const max = Math.max(1, ...list.map((x) => x.n));
  const bars = [];
  const rows = shown.map((x) => {
    const bar = h('i');
    bars.push([bar, 'width', `${Math.max(4, (x.n / max) * 100)}%`]);
    return h('button', { class: 'hrow', onclick: () => { sfx.tap(); speak(x.w, true); } },
      h('span', { class: 'wd' }, x.w), h('span', { class: 'track' }, bar), h('span', { class: 'n' }, x.n, h('small', {}, '次')));
  });
  grow(bars, animate);
  const more = list.length > S.stickyN && h('button', { class: 'more', onclick: () => { view.stickyAll = !view.stickyAll; sfx.tap(); render(false); } },
    view.stickyAll ? '收起' : `看全部 ${list.length} 个`);
  return sec('顽固词', `${snap.stickyMore ? '至少 ' : ''}${list.length} 个`, h('div', { class: 'hbars' }, rows), more,
    h('p', { class: 'sec-note' }, '按学过的次数排（每天最多算一次）。点一下听发音。'));
}

/* ---------- 云词本 ---------- */
function relDay(iso) {
  if (!iso) return '';
  const d = bjDay(new Date(iso));
  const diff = Math.round((new Date(`${bjDay()}T12:00:00+08:00`) - new Date(`${d}T12:00:00+08:00`)) / 86400000);
  if (diff <= 0) return '今天改过';
  if (diff === 1) return '昨天改过';
  if (diff < 30) return `${diff} 天前改过`;
  const [y, m, dd] = d.split('-').map(Number);
  return `${y}年${m}月${dd}日改过`;
}

function notepadSection() {
  if (snap.errors.notepads) return sec('云词本', null, h('div', { class: 'sec-empty' }, '云词本没读到，下次刷新再试。'));
  if (!snap.notepads) return null;
  if (!snap.notepads.length) return sec('云词本', '0 本', h('div', { class: 'sec-empty' }, '还没有云词本。在墨墨里建的词本会出现在这里。'));
  return sec('云词本', `${snap.notepads.length} 本`, h('div', { class: 'list' }, snap.notepads.map((np) => h('button', { class: 'lrow', onclick: () => openNotepad(np) },
    h('span', { class: 'ic' }, (np.title || '?').trim().slice(0, 1)),
    h('span', { class: 'main' }, h('div', { class: 't' }, np.title), h('div', { class: 's' }, [np.brief, np.tags.join('、'), relDay(np.updated)].filter(Boolean)[0] || '')),
    h('span', { class: 'chev', html: ICON.chev })))));
}

/* ---------- 最近几天 ---------- */
function historySection(animate) {
  const hist = histData();
  const N = S.historyDays;
  const today = bjDay();
  const days = Array.from({ length: N }, (_, i) => addDays(today, i - N + 1));
  if (!days.some((d) => hist[d])) return null;
  const max = Math.max(1, ...days.map((d) => (hist[d] ? Math.max(hist[d].t, hist[d].f) : 0)));
  // 现在连续背完几天：今天还没背完就从昨天往回数
  let streak = 0;
  for (let d = today, first = true; ; d = addDays(d, -1), first = false) {
    const r = hist[d];
    const ok = r && r.t > 0 && r.f >= r.t;
    if (ok) streak++;
    else if (!(first && d === today)) break;
  }
  const thin = N > 14;
  const anim = [];
  const cols = days.map((d) => {
    const r = hist[d];
    const [, m, dd] = d.split('-').map(Number);
    const wd = weekday(d);
    const showLab = !thin || d === today || wd === 1;
    const lab = h('span', { class: 'lab' }, showLab && h('b', {}, thin ? (d === today ? '今天' : `${m}/${dd}`) : WEEK[wd]), showLab && !thin && `${dd}`);
    if (!r) return h('div', { class: 'col' }, h('i', { class: 'none' }), lab);
    const ghost = h('i', { class: 'ghost' });
    const bar = h('i', { class: `bar ${r.t > 0 && r.f >= r.t ? 'full' : 'part'}`, style: 'position:relative' });
    anim.push([ghost, 'height', `${(Math.max(r.t, r.f) / max) * 100}%`], [bar, 'height', `${Math.max(r.f ? 3 : 0, (r.f / max) * 100)}%`]);
    return h('div', { class: `col ${d === today ? 'today' : ''}` }, h('span', { class: 'v' }, r.f),
      h('div', { style: 'position:relative;width:100%;height:calc(100% - 22px);display:flex;align-items:flex-end;justify-content:center' }, ghost, bar), lab);
  });
  grow(anim, animate);
  return sec(`最近 ${N} 天`, streak ? `连续背完 ${streak} 天` : null, h('div', { class: `cols ${thin ? 'thin' : ''} ${N > 7 ? 'novals' : ''}` }, cols),
    h('p', { class: 'sec-note' }, '墨墨不提供以前的数据，这些是每天打开这里时记下的。浅色框是那天要背的，绿色是全背完了。'));
}

/* ======================================================================
   整页
   ====================================================================== */
function render(animate) {
  renderTop();
  renderBanner();
  renderHero(animate);
  const box = $('sections');
  if (!snap) { box.replaceChildren(); $('foot').textContent = ''; return; }
  box.replaceChildren(...[
    firstSection(animate), wordsSection(), forecastSection(animate), stickySection(animate), notepadSection(), historySection(animate),
  ].filter(Boolean));
  $('foot').textContent = snap.demo ? '示例数据，填好 Token 以后换成你自己的。' : '数据来自墨墨背单词开放 API';
}

/* ======================================================================
   朗读
   ====================================================================== */
let voice = null;
function pickVoice() {
  try {
    const vs = speechSynthesis.getVoices();
    voice = vs.find((v) => /^en[-_]US$/i.test(v.lang) && /samantha|ava|allison|google us/i.test(v.name))
      || vs.find((v) => /^en[-_]US$/i.test(v.lang)) || vs.find((v) => /^en/i.test(v.lang)) || null;
  } catch {}
}
if ('speechSynthesis' in window) { pickVoice(); speechSynthesis.addEventListener && speechSynthesis.addEventListener('voiceschanged', pickVoice); }
function speak(w, force) {
  if ((!S.speak && !force) || !('speechSynthesis' in window) || !w) return;
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(w);
    u.lang = 'en-US'; u.rate = 0.92;
    if (voice) u.voice = voice;
    speechSynthesis.speak(u);
  } catch {}
}

/* ======================================================================
   面板
   ====================================================================== */
function openSheet(el) { el.hidden = false; el.classList.remove('closing'); sfx.open(); }
function closeSheet(el) {
  if (el.hidden || el.classList.contains('closing')) return;
  el.classList.add('closing');
  setTimeout(() => { el.hidden = true; el.classList.remove('closing'); }, 220);
}
for (const el of [$('keySheet'), $('npSheet')]) {
  el.addEventListener('click', (e) => { if (e.target === el || e.target.closest('[data-close]')) closeSheet(el); });
}

function openKey() {
  $('tokenInput').value = token;
  $('tokenInput').type = 'password';
  $('eyeBtn').setAttribute('aria-pressed', 'false');
  $('baseInput').value = base;
  $('adv').open = !!base || (err && err.kind === 'network');
  $('disconnectBtn').hidden = !token;
  $('saveBtn').textContent = token ? '保存并刷新' : '连接';
  openSheet($('keySheet'));
}
$('keyBtn').addEventListener('click', openKey);
$('eyeBtn').addEventListener('click', () => {
  const show = $('tokenInput').type === 'password';
  $('tokenInput').type = show ? 'text' : 'password';
  $('eyeBtn').setAttribute('aria-pressed', String(show));
});
$('saveBtn').addEventListener('click', () => {
  const t = $('tokenInput').value.trim().replace(/^Bearer\s+/i, '');
  let b = $('baseInput').value.trim();
  if (!t) { $('tokenInput').focus(); return; }
  if (b && !/^https:\/\/\S+$/i.test(b)) { $('adv').open = true; $('baseInput').focus(); $('baseInput').select(); return; }
  if (b.replace(/\/+$/, '') === 'https://open.maimemo.com/open') b = '';
  const changed = t !== token || b !== base;
  token = t; base = b;
  hb.save('token', token); hb.save('base', base);
  if (changed) { hb.save('cache', null); hb.save('prefix', null); snap = null; npCache.clear(); }
  err = null;
  $('tokenInput').blur(); $('baseInput').blur();
  closeSheet($('keySheet'));
  refresh();
});
$('disconnectBtn').addEventListener('click', () => {
  token = ''; base = '';
  hb.save('token', ''); hb.save('base', ''); hb.save('cache', null); hb.save('prefix', null);
  npCache.clear(); err = null;
  snap = demoSnapshot();
  closeSheet($('keySheet'));
  render(true);
});

let npOpen = null;
async function openNotepad(np) {
  npOpen = np.id;
  sfx.tap();
  $('npTitle').textContent = np.title;
  const body = $('npBody');
  const meta = h('div', { class: 'np-meta' }, np.tags.map((t) => h('span', { class: 'pill' }, t)), h('span', { id: 'npCount' }), relDay(np.updated));
  body.replaceChildren(meta, np.brief && h('p', { class: 'np-brief' }, np.brief), h('div', { class: 'np-load' }, '正在读取词本…'));
  openSheet($('npSheet'));
  let chapters = npCache.get(np.id);
  if (!chapters) {
    try {
      chapters = snap && snap.demo ? demoNotepad(np.id) : chaptersOf(await api().notepad(np.id));
      npCache.set(np.id, chapters);
    } catch (e) {
      if (npOpen === np.id) body.lastChild.textContent = ERR[(e && e.kind) || 'bad'] || ERR.bad;
      return;
    }
  }
  if (npOpen !== np.id) return;
  const n = chapters.reduce((a, c) => a + c.words.length, 0);
  $('npCount').textContent = `${n} 个词`;
  body.lastChild.remove();
  if (!n) { body.append(h('div', { class: 'np-load' }, '这本词本是空的。')); return; }
  for (const ch of chapters) {
    if (ch.chapter) body.append(h('div', { class: 'np-ch' }, `${ch.chapter}（${ch.words.length}）`));
    body.append(h('div', { class: 'np-words' }, ch.words.map((w) => h('button', {
      onclick: (e) => { sfx.tap(); speak(w, true); body.querySelectorAll('.np-words .on').forEach((x) => x.classList.remove('on')); e.currentTarget.classList.add('on'); },
    }, w))));
  }
}

/* ======================================================================
   开关、暂停、设置
   ====================================================================== */
$('refreshBtn').addEventListener('click', () => { sfx.tap(); refresh(); });

const stale = () => snap && !snap.demo && (Date.now() - snap.at > 5 * 60000 || snap.day !== bjDay());
function onPause() {
  paused = true;
  cancelAnimationFrame(ringRaf); ringK = [1, 1, 1]; drawRings();
  try { speechSynthesis.cancel(); } catch {}
}
function onResume() {
  if (!paused) return;
  paused = false;
  renderTop();
  if (token && S.autoRefresh && stale() && !loading) refresh();
}
hb.onPause(onPause);
hb.onResume(onResume);
document.addEventListener('visibilitychange', () => (document.hidden ? onPause() : onResume()));
setInterval(() => { if (!paused) { updatedText(); if ($('date').textContent && !loading) renderTop(); } }, 30000);

hb.onSettings((next) => {
  S = next;
  sound.enabled = S.sound;
  if (snap) render(false);
});

window.addEventListener('resize', () => { sizeRings(); drawRings(); });

/* ---------- 开始 ---------- */
sizeRings();
if (token) {
  const c = hb.load('cache', null);
  snap = c && !c.demo && Array.isArray(c.items) ? c : null;
} else {
  snap = demoSnapshot();
}
render(true);
if (token && (S.autoRefresh || !snap)) refresh();

window.__vocab = { get snap() { return snap; }, refresh, render, openKey, openNotepad }; // 方便自动测试
