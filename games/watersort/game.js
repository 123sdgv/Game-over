// 倒水：把同一种颜色的饮料倒进同一个瓶子。
// 点一个瓶子拿起来，再点另一个倒进去：只能倒在同色上面或者空瓶里。
// 开启"藏起来"时，每瓶只看得到最上面一层，下面的要等上面倒走才会露出来。
// 每关随机出题，出题时用求解器确认一定有解；越往后颜色越多。
import { hub } from '../_shared/hub.js';
import { topRun, isDone, solved, pourAmount, hasUsefulMove, generate } from './puzzle.js';

const hb = hub('watersort');
const $ = (id) => document.getElementById(id);
const shelf = $('shelf');

const PALETTE = [
  '#E5484D', // 红
  '#F7841B', // 橙
  '#F9C52C', // 黄
  '#A6D13A', // 草绿
  '#2E9E5B', // 绿
  '#2BC3D6', // 青
  '#3B5BDB', // 蓝
  '#8E4EC6', // 紫
  '#F26FAE', // 粉
  '#8B5A35', // 棕
  '#8A1C3B', // 酒红
  '#7D8A9C', // 灰蓝
];

const colorsFor = (level, max) => Math.min(max, 3 + Math.floor((level - 1) / 2));
const cfgSig = (c) => `${c.capacity}/${c.empty}/${c.maxColors}/${c.hidden ? 1 : 0}`;

let cfg = hb.settings();
let pendingCfg = null;
let s;            // 当前这一关的全部状态（也是存档）
let els = [];     // 瓶子元素
let sel = -1;     // 拿起来的瓶子
let busy = false; // 正在倒

/* ---------- 一关 ---------- */
function startLevel(level) {
  if (pendingCfg) { cfg = pendingCfg; pendingCfg = null; $('notice').hidden = true; }
  const colors = colorsFor(level, cfg.maxColors);
  const { bottles } = generate(colors, cfg.capacity, cfg.empty);
  s = {
    level, cfg: { ...cfg }, cap: cfg.capacity, colors,
    init: bottles.map((b) => b.slice()),
    bottles: bottles.map((b) => b.slice()),
    hf: bottles.map((b) => (cfg.hidden ? Math.max(0, b.length - 1) : 0)), // 每瓶底下藏着几格
    history: [], moves: 0, extraUsed: false, won: false,
  };
  sel = -1;
  $('result').hidden = true;
  const st = hb.stats();
  if (st.level !== level) { st.level = level; hb.saveStats(st); }
  build();
  save();
}

function restartLevel() {
  if (busy) return;
  s.bottles = s.init.map((b) => b.slice());
  s.hf = s.bottles.map((b) => (s.cfg.hidden ? Math.max(0, b.length - 1) : 0));
  s.history = []; s.moves = 0; s.extraUsed = false; s.won = false;
  sel = -1;
  $('result').hidden = true;
  build();
  save();
}

const save = () => hb.save('save', s);

/* ---------- 画面 ---------- */
function build() {
  shelf.replaceChildren();
  els = s.bottles.map((_, i) => {
    const el = document.createElement('button');
    el.className = 'bottle';
    el.dataset.i = i;
    el.setAttribute('aria-label', `第 ${i + 1} 个瓶子`);
    el.innerHTML = '<i class="neck"></i><div class="glass"><div class="liq"></div></div>';
    return el;
  });
  const n = els.length;
  const cols = n <= 5 ? n : n <= 10 ? Math.ceil(n / 2) : Math.ceil(n / 3);
  for (let r = 0; r * cols < n; r++) {
    const row = document.createElement('div');
    row.className = 'row';
    row.append(...els.slice(r * cols, (r + 1) * cols));
    shelf.append(row);
  }
  layout();
  render();
}

function layout() {
  if (!els.length) return;
  const st = $('stage');
  const n = els.length;
  const cols = n <= 5 ? n : n <= 10 ? Math.ceil(n / 2) : Math.ceil(n / 3);
  const rows = Math.ceil(n / cols);
  const W = st.clientWidth - 24, H = st.clientHeight - 16;
  const cg = cols >= 6 ? 10 : 14, rg = rows >= 3 ? 22 : 30;
  // 瓶子总高 ≈ w × (0.2 瓶颈 + 0.16 留白 + 0.7 × 格数) + 边框
  const k = 0.36 + 0.7 * s.cap;
  let w = Math.min(58, (W - 24 - (cols - 1) * cg) / cols, ((H - 18 - (rows - 1) * rg) / rows - 10) / k);
  w = Math.max(26, Math.floor(w));
  document.documentElement.style.setProperty('--col-gap', `${cg}px`);
  document.documentElement.style.setProperty('--row-gap', `${rg}px`);
  els.forEach((el) => {
    el.style.setProperty('--w', `${w}px`);
    el.style.setProperty('--u', `${Math.round(w * 0.7)}px`);
    el.style.setProperty('--cap', s.cap);
  });
}
window.addEventListener('resize', () => s && layout());

/** 重画瓶子里的饮料。fx: { added: {b, n}, revealed: [瓶号] } 用来播动画 */
function render(fx = {}) {
  s.bottles.forEach((b, i) => {
    const el = els[i];
    const liq = el.querySelector('.liq');
    const frag = document.createDocumentFragment();
    b.forEach((c, p) => {
      const u = document.createElement('div');
      u.className = 'u';
      if (p < s.hf[i]) u.classList.add('q');
      else u.style.background = PALETTE[c];
      if (fx.added && fx.added.b === i && p >= b.length - fx.added.n) {
        u.classList.add('new');
        u.style.setProperty('--d', `${(p - (b.length - fx.added.n)) * 70}ms`);
      }
      if (fx.revealed && fx.revealed.includes(i) && p === b.length - 1) u.classList.add('reveal');
      frag.append(u);
    });
    liq.replaceChildren(frag);
    const done = b.length === s.cap && topRun(b) === s.cap && s.hf[i] === 0;
    el.classList.toggle('done', done);
    if (done) el.style.setProperty('--top', PALETTE[b[0]]);
    el.classList.toggle('lift', i === sel);
  });
  $('level').textContent = `第 ${s.level} 关`;
  $('moves').textContent = `${s.moves} 步`;
  $('undo').disabled = !s.history.length || s.won;
  $('add').disabled = !s.cfg.extra || s.extraUsed || s.won;
  updateTip();
}

function updateTip() {
  const tip = $('tip');
  tip.classList.remove('warn');
  if (s.won) { tip.textContent = ''; return; }
  if (!s.moves) { tip.textContent = '点一个瓶子，再点另一个瓶子倒进去'; return; }
  if (!hasUsefulMove(s.bottles, s.cap)) {
    tip.classList.add('warn');
    tip.textContent = !s.extraUsed && s.cfg.extra ? '没有能倒的了：撤销几步，或者加一个空瓶' : '没有能倒的了：撤销几步，或者重来这一关';
    return;
  }
  tip.textContent = '只能倒在同样的颜色上，或者倒进空瓶';
}

/* ---------- 操作 ---------- */
function nope(i) {
  const el = els[i];
  el.classList.remove('nope'); void el.offsetWidth; el.classList.add('nope');
  hb.haptic(15);
}

function tap(i) {
  if (busy || s.won) return;
  const b = s.bottles[i];
  if (sel < 0) {
    if (!b.length || isDone(b, s.cap)) { nope(i); return; }
    sel = i; hb.haptic(5); render(); return;
  }
  if (sel === i) { sel = -1; render(); return; }
  const n = pourAmount(s.bottles, sel, i, s.cap);
  if (n) { pour(sel, i, n); return; }
  // 倒不进去：如果点的是一个能拿起来的瓶子，就换成拿它
  if (b.length && !isDone(b, s.cap)) { sel = i; hb.haptic(5); render(); return; }
  nope(i);
}

function pour(a, b, n) {
  busy = true;
  const src = els[a], dst = els[b];
  const color = PALETTE[s.bottles[a][s.bottles[a].length - 1]];
  const sr = src.getBoundingClientRect(), dr = dst.getBoundingClientRect();
  const lift = 16;
  const dir = dr.left + dr.width / 2 >= sr.left + sr.width / 2 ? 1 : -1;
  // 以瓶口为轴转过去：瓶口对准目标瓶口上方，瓶身翘起来
  const dx = dr.left + dr.width / 2 - (sr.left + sr.width / 2) - dir * sr.width * 0.12;
  const dy = dr.top - (sr.top + lift) - sr.width * 0.3;
  const tilt = dir * 100;
  src.classList.add('pouring');
  const T = 820;
  const anim = src.animate([
    { transform: `translateY(-${lift}px)` },
    { transform: `translate(${dx}px, ${dy}px) rotate(${tilt}deg)`, offset: 0.36 },
    { transform: `translate(${dx}px, ${dy}px) rotate(${tilt}deg)`, offset: 0.7 },
    { transform: 'none' },
  ], { duration: T, easing: 'cubic-bezier(.35,.1,.25,1)' });

  setTimeout(() => {
    // 真正把饮料倒过去
    s.history.push({ bottles: s.bottles.map((x) => x.slice()), hf: s.hf.slice() });
    if (s.history.length > 300) s.history.shift();
    for (let k = 0; k < n; k++) s.bottles[b].push(s.bottles[a].pop());
    const before = s.hf[a];
    s.hf[a] = Math.min(s.hf[a], Math.max(0, s.bottles[a].length - 1));
    s.moves++;
    sel = -1;
    stream(dst, color, s.bottles[b].length);
    render({ added: { b, n }, revealed: s.hf[a] < before ? [a] : [] });
    hb.haptic(10);
  }, T * 0.36);

  anim.onfinish = () => {
    src.classList.remove('pouring', 'lift');
    busy = false;
    if (solved(s.bottles, s.cap)) win();
    save();
  };
}

function stream(dst, color, lenAfter) {
  const el = $('stream');
  const g = dst.querySelector('.glass').getBoundingClientRect();
  const u = parseFloat(getComputedStyle(dst).getPropertyValue('--u'));
  const top = dst.getBoundingClientRect().top - 10;
  const surface = g.bottom - 2.5 - lenAfter * u;
  el.style.left = `${g.left + g.width / 2 - 3}px`;
  el.style.top = `${top}px`;
  el.style.height = `${Math.max(12, surface - top)}px`;
  el.style.background = color;
  el.classList.remove('on'); void el.offsetWidth; el.classList.add('on');
}

function undo() {
  if (busy || !s.history.length || s.won) return;
  const prev = s.history.pop();
  s.bottles = prev.bottles;
  // 已经露出来的颜色不再藏回去
  s.hf = prev.hf.map((h, i) => Math.min(h, s.hf[i] ?? h));
  s.moves = Math.max(0, s.moves - 1);
  sel = -1;
  hb.haptic(6);
  render();
  save();
}

function addBottle() {
  if (busy || s.extraUsed || !s.cfg.extra || s.won) return;
  s.extraUsed = true;
  s.bottles.push([]);
  s.hf.push(0);
  s.history.forEach((h) => { h.bottles.push([]); h.hf.push(0); });
  sel = -1;
  build();
  els[els.length - 1].classList.add('added');
  hb.haptic(8);
  save();
}

/* ---------- 过关 ---------- */
function win() {
  s.won = true;
  const st = hb.stats();
  st.cleared = (st.cleared || 0) + 1;
  st.level = s.level + 1;
  hb.saveStats(st);
  hb.haptic([12, 60, 12]);
  render();
  setTimeout(() => {
    $('result').hidden = false;
    $('resultLevel').textContent = `第 ${s.level} 关`;
    $('resultMeta').innerHTML = `用了 <b>${s.moves}</b> 步 · ${s.colors} 种颜色`;
  }, 650);
}

/* ---------- 事件 ---------- */
$('stage').addEventListener('click', (e) => {
  const el = e.target.closest('.bottle');
  if (el) tap(+el.dataset.i);
  else if (sel >= 0 && !busy) { sel = -1; render(); } // 点空白处放下拿起来的瓶子
});
$('undo').addEventListener('click', undo);
$('add').addEventListener('click', addBottle);
$('restart').addEventListener('click', restartLevel);
$('next').addEventListener('click', () => startLevel(s.level + 1));

hb.onSettings((next) => {
  cfg = next;
  if (cfgSig(next) === cfgSig(s.cfg)) { s.cfg.extra = next.extra; render(); save(); return; }
  if (!s.moves && !s.extraUsed && !s.won) { pendingCfg = null; startLevel(s.level); }
  else { pendingCfg = next; s.cfg.extra = next.extra; $('notice').hidden = false; render(); }
});

/* ---------- 启动：接着上次的进度 ---------- */
(function boot() {
  const st = hb.stats();
  const saved = hb.load('save', null);
  const level = st.level || 1;
  if (st.level && saved && saved.level === level && Array.isArray(saved.bottles)) {
    s = saved;
    if (s.won) { startLevel(level); return; }
    if (cfgSig(cfg) !== cfgSig(s.cfg)) {
      if (!s.moves && !s.extraUsed) { startLevel(level); return; }
      pendingCfg = cfg; $('notice').hidden = false;
    }
    s.cfg.extra = cfg.extra;
    build();
  } else {
    startLevel(level);
  }
})();
