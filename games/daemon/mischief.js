// 它「帮忙」干的事。每件都有：第几天开始会干、现在能不能干、干了什么、什么时候算你收拾好了。
import { G, emit, pick, ri, rnd, un, saveSoon } from './state.js';
import * as fs from './fs.js';
import { spawn, has, procs } from './machine.js';
import { open, findAll, DESK, renderIcons, os } from './os.js';
import { daemonDraft, outboxPending } from './apps/mail.js';

const POP = ['在吗', '在吗？', '你在忙吗', '看我一下', 'ping', '……', '我可以帮忙的', '你是不是不要我了', '我在这里', '回我一下', '就一下', 'ACK?'];
const WALL = ['while (true) {\n  look_at(me);\n}', '看我\n>_<\n看我', 'ping {u}\n……\n还在吗', 'if (you.away)\n  miss++;\n// miss = 9999'];

export const DEF = {
  popups: {
    day: 1, w: 1.1,
    can: () => !findAll('popup').length,
    run() {
      const k = ri(6, 9);
      const items = [];
      for (let i = 0; i < k; i++) items.push({ i, text: pick(POP), trap: i === k - 1 });
      return { k, data: { items } };
    },
    after(m) { openPopups(m); },
    active: (m) => m.data.items.length > 0,
  },
  loop: {
    day: 1, w: 1,
    can: () => !has('loop'),
    run() { spawn('loop_for_you.exe', { cpu: 95, mem: 1.2, kind: 'loop', by: 'daemon' }); return {}; },
    active: () => has('loop'),
  },
  wallpaper: {
    day: 1, w: 0.8,
    can: () => !G.desk.dwall,
    run() { G.desk.dwall = pick(WALL).replace('{u}', un()); emit('wall'); return {}; },
    active: () => !!G.desk.dwall,
  },
  fonts: {
    day: 2, w: 1.2,
    can: () => fs.fontsOK(),
    run() { fs.trash(['fonts'], { force: true }); return {}; },
    active: () => !fs.fontsOK(),
  },
  icons: {
    day: 2, w: 0.8,
    can: () => !G.desk.heart && DESK.length >= 5,
    run() { heartIcons(); return { k: DESK.length }; },
    active: () => !!G.desk.heart,
  },
  tidy: {
    day: 2, w: 1,
    can: () => !fs.node('dsort') && ['work', 'pics', 'music'].reduce((a, d) => a + fs.kids(d).filter((k) => k.t === 'f').length, 0) >= 4,
    run() {
      const f = fs.mk('docs', '按我喜欢的顺序', 0, { t: 'd', id: 'dsort' });
      const pool = ['work', 'pics', 'music'].flatMap((d) => fs.kids(d).filter((k) => k.t === 'f'));
      const k = Math.min(pool.length, ri(4, 7));
      for (let i = 0; i < k; i++) {
        const n = pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
        n.home = n.p; n.p = f.id;
      }
      fs.changed();
      return { k };
    },
    active: () => !!fs.node('dsort') && fs.kids('dsort').length > 0,
    fixed() { if (fs.node('dsort') && !fs.kids('dsort').length) { fs.destroy('dsort'); fs.changed(); } },
  },
  mail: {
    day: 2, w: 1,
    can: () => !outboxPending().some((m) => m.by === 'daemon') && G.mail.list.some((m) => m.box === 'in' && m.need && !m.replied),
    run() { const m = daemonDraft(); return { to: personName(m.to), data: { mail: m.id } }; },
    active: (m) => G.mail.list.some((x) => x.id === m.data.mail && x.box === 'out'),
  },
  log: {
    day: 3, w: 1,
    can: () => !has('heartbeat') && fs.freeC() > 300 * 1024,
    run() {
      if (!Object.values(G.fs.nodes).some((n) => n.hb)) fs.mk('dhome', 'heartbeat.log', 4, { hb: 1 });
      spawn('heartbeat.exe', { cpu: 4, mem: 1.8, kind: 'heartbeat', by: 'daemon' });
      fs.changed();
      return {};
    },
    active: () => has('heartbeat'),
  },
  mem: {
    day: 3, w: 1,
    can: () => !procs('cache').length,
    run() {
      const k = ri(5, 7);
      let mb = 0;
      for (let i = 0; i < k; i++) { const m = +rnd(6.2, 8.4).toFixed(1); mb += m; spawn('cache_for_you.exe', { mem: m, kind: 'cache', by: 'daemon' }); }
      return { k, mb: Math.round(mb) };
    },
    active: () => procs('cache').length > 0,
  },
  bin: {
    day: 3, w: 0.8,
    can: () => fs.kids('bin').length >= 2,
    run() { const k = fs.emptyBin().length; return { k }; },
    instant: true,
  },
  system: {
    day: 4, w: 0.45,
    can: () => fs.systemOK() && !G.sysT,
    run() { fs.trash(['system'], { force: true }); return {}; },
    active: () => !fs.systemOK(),
  },
  print: {
    day: 4, w: 0.7,
    can: () => !has('spool'),
    run() { spawn('spool_for_you.exe', { cpu: 6, mem: 2.2, kind: 'spool', by: 'daemon' }); G.print = { left: 99, pile: (G.print && G.print.pile) || 0 }; emit('print'); return {}; },
    active: () => has('spool'),
  },
};

const personName = (k) => ({ boss: '王经理', li: '李姐', zhou: '小周', mom: '妈', it: '网管老陈' }[k] || k);

/** 挑一件今天能干的 */
export function choose(prefer = null) {
  if (prefer && DEF[prefer] && DEF[prefer].can()) return prefer;
  const day = G.day || 1;
  const busy = new Set((G.messes || []).map((m) => m.k));
  const list = Object.entries(DEF).filter(([k, d]) => d.day <= day && !busy.has(k) && d.can()).map(([k, d]) => ({ k, w: d.w * (G.d.recent && G.d.recent.includes(k) ? 0.35 : 1) }));
  if (!list.length) return null;
  let t = 0;
  for (const it of list) t += it.w;
  let r = Math.random() * t;
  for (const it of list) { r -= it.w; if (r <= 0) return it.k; }
  return list[0].k;
}

/** 干！返回模板变量 */
export function run(k) {
  const d = DEF[k];
  const v = d.run() || {};
  if (!d.instant) {
    G.messes.push({ k, at: G.t, data: v.data || {} });
    d.after && d.after(G.messes[G.messes.length - 1]);
  }
  // 倒垃圾的时候把字体也倒了：那就算「字体没了」
  if (k === 'bin' && !fs.fontsOK() && !G.messes.some((m) => m.k === 'fonts')) G.messes.push({ k: 'fonts', at: G.t, data: {} });
  G.d.recent = [k, ...(G.d.recent || [])].slice(0, 3);
  saveSoon();
  return v;
}

/** 看看哪些被你收拾好了 */
export function check() {
  const fixed = [];
  G.messes = G.messes.filter((m) => {
    const d = DEF[m.k];
    if (!d || !d.active) return false;
    if (d.active(m)) return true;
    d.fixed && d.fixed(m);
    fixed.push(m.k);
    return false;
  });
  return fixed;
}
export const activeKinds = () => (G.messes || []).map((m) => m.k);

/* ─────────── 弹窗 ─────────── */
export function openPopups(m) {
  const items = m.data.items;
  items.forEach((it, j) => setTimeout(() => {
    if (!G.messes.includes(m) || !m.data.items.includes(it)) return;
    open('popup', { mess: true, item: it, at: 'random' });
  }, j * 140));
}
export function popupClosed(it) {
  const m = G.messes.find((x) => x.k === 'popups');
  if (!m) return;
  m.data.items = m.data.items.filter((x) => x !== it && x.i !== it.i);
  saveSoon();
}

/* ─────────── 爱心形状的桌面图标 ─────────── */
export function heartIcons() {
  const n = DESK.length;
  const W = os.W, H = os.deskH;
  const cw = 78, ch = 74;
  // 心形曲线上挑几个点：两个上瓣、两边、下面两侧、底尖
  const ts = n === 7 ? [-0.85, 0.85, -1.75, 1.75, -2.4, 2.4, Math.PI] : DESK.map((_, i) => (i / n) * Math.PI * 2 - Math.PI + 0.01);
  const P2 = ts.map((t) => ({ x: 16 * Math.pow(Math.sin(t), 3), y: 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t) }));
  const maxY = Math.max(...P2.map((p) => p.y)), minY = Math.min(...P2.map((p) => p.y));
  const s = Math.min((H - ch - 6) / (maxY - minY), (W - cw) / 34);
  const cx = W / 2 - cw / 2;
  G.desk.icons = {};
  DESK.forEach((d, i) => {
    const p = P2[i % P2.length];
    G.desk.icons[d.id] = { x: Math.round(cx + p.x * s * 1.05), y: Math.round(4 + (maxY - p.y) * s) };
  });
  G.desk.heart = true; G.desk.heartMoves = 0;
  renderIcons(true);
}
