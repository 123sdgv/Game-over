// 右边工具箱里的 16 样东西。kind: place=放在画布上（可以长按调大小）；drag=拖着用。
import { sfx } from './sfx.js';

const hyp = Math.hypot;
const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export const TOOLS = [
  { id: 'hand', name: '大手', kind: 'drag', desc: '抓起来甩，往墙上扔。', how: '拖他 · 松手扔出去 · 点一下戳他' },
  { id: 'anvil', name: '铁砧', kind: 'place', desc: '从天上掉下来，把他拍扁。', how: '点画布 · 长按变大' },
  { id: 'bomb', name: '炸弹', kind: 'place', desc: '放下去倒计时，炸得四肢乱飞。他看见会跑。', how: '点画布 · 长按变大' },
  { id: 'mine', name: '地雷', kind: 'place', desc: '埋在地上，等他自己踩。他不知道那是什么。', how: '点画布 · 长按变大' },
  { id: 'peel', name: '香蕉皮', kind: 'place', desc: '踩上去滑倒，摔个大跟头。', how: '点画布 · 长按变大' },
  { id: 'spring', name: '弹簧板', kind: 'place', desc: '把他弹到天花板上。', how: '点画布 · 长按力气更大' },
  { id: 'spikes', name: '钉板', kind: 'place', desc: '铺在地上，或者点墙边、天花板装在那儿。', how: '点画布 · 长按变长' },
  { id: 'bolt', name: '闪电', kind: 'place', desc: '点哪劈哪。劈中了能看见骨头。', how: '点画布 · 长按更粗' },
  { id: 'saw', name: '电锯', kind: 'drag', desc: '拖到哪儿，就锯断他哪一段。', how: '按住拖着走' },
  { id: 'roller', name: '压路机', kind: 'place', desc: '从一头开到另一头，把他碾成一条线。', how: '点哪边就从哪边开来' },
  { id: 'rocket', name: '火箭', kind: 'place', desc: '点在他身上就绑上；点别处它自己追过去。', how: '点画布 · 长按更猛' },
  { id: 'freeze', name: '冰冻', kind: 'place', desc: '冻住以后再碰一下，碎成一地线段。', how: '点画布 · 长按范围更大' },
  { id: 'hole', name: '黑洞', kind: 'place', desc: '连人带东西全吸进去，最后吐出来。', how: '点画布 · 长按变大' },
  { id: 'eraser', name: '橡皮擦', kind: 'drag', desc: '直接把他擦掉一截。道具和铅笔线也能擦。', how: '按住擦' },
  { id: 'pencil', name: '铅笔', kind: 'drag', desc: '从他身上画出去就多长一条；画在别处是一堵墙。', how: '按住画' },
  { id: 'bin', name: '回收站', kind: 'place', desc: '扣到他头上，或者把他扔进去。', how: '点画布 · 长按变大' },
];
export const toolById = (id) => TOOLS.find((t) => t.id === id);

/** 手指抓得到的东西：优先身上的点，其次残骸和道具 */
function pickAt(W, x, y, r) {
  let best = null, bd = r;
  for (const p of W.pts) {
    if (p.hole) continue;
    const d = hyp(p.x - x, p.y - y) - p.r * 0.5 - (p.body ? 6 : 0);
    if (d < bd) { bd = d; best = { p }; }
  }
  for (const o of W.props) {
    if (!['anvil', 'bomb', 'mine', 'peel', 'spring', 'bin'].includes(o.t)) continue;
    const cy = o.t === 'anvil' ? o.y - 18 * o.s : o.t === 'bin' ? o.y - 23 * o.s : o.t === 'bomb' ? o.y : o.y - 8 * o.s;
    const d = hyp(o.x - x, cy - y) - (o.t === 'anvil' ? 18 : 10) * o.s;
    if (d < bd) { bd = d; best = { o, oy: o.y - cy }; }
  }
  return best;
}

export function makeTools(W, cb = {}) {
  const used = (id) => cb.used && cb.used(id);

  const useAt = (id, x, y, s) => {
    const g = W.ground;
    switch (id) {
      case 'anvil': W.dropAnvil(x, s); break;
      case 'bomb': W.dropBomb(x, y, s); break;
      case 'mine': W.placeMine(x, g, s); break;
      case 'peel': W.placePeel(x, g, s); break;
      case 'spring': W.placeSpring(x, g, s); break;
      case 'spikes': W.placeSpikes(x, y, s); break;
      case 'bolt': W.strike(x, y, s); break;
      case 'roller': W.startRoller(x, s); break;
      case 'rocket': W.launchRocket(x, y, s); break;
      case 'freeze': W.freezeAt(x, y, s); break;
      case 'hole': W.openHole(x, y, s); break;
      case 'bin': W.dropBin(x, s); break;
      default: return;
    }
    used(id);
  };

  /* 拖着用的工具 */
  const drag = {
    hand: {
      down(x, y) {
        W.hand = { x, y, tx: x, ty: y, vx: 0, vy: 0, down: true, t0: performance.now(), moved: 0, sx: x, sy: y };
        const t = pickAt(W, x, y, 30);
        const h = W.hand;
        if (!t) return;
        if (t.p) {
          h.pending = t.p;
        } else {
          h.o = t.o; h.oy = t.oy; t.o.held = true; t.o.rest = false;
          W.unTrap(t.o);
          sfx.click();
          used('hand');
        }
      },
      move(x, y) {
        const h = W.hand; if (!h) return;
        h.tx = x; h.ty = y;
        h.moved = Math.max(h.moved, hyp(x - h.sx, y - h.sy));
        // 动了才算抓起来；不动就是戳
        if (h.pending && h.moved > 6) {
          const p = h.pending; h.pending = null;
          if (W.pts.includes(p)) {
            h.p = p; h.saveIm = p.im; p.im = 0; p.pin = null; p.trap = null;
            h.x = p.x; h.y = p.y;
            if (p.body) W.B.grabbed();
            used('hand');
          }
        }
      },
      up() {
        const h = W.hand; if (!h) return;
        if (h.p) {
          const p = h.p;
          p.im = h.saveIm || 1;
          const v = hyp(h.vx, h.vy), m = 1200;
          const k = v > m ? m / v : 1;
          p.px = p.x - h.vx * k / 120; p.py = p.y - h.vy * k / 120;
          if (p.body) W.B.released();
          if (v > 500) sfx.scratch();
        } else if (h.o) {
          const o = h.o, v = hyp(h.vx, h.vy), m = 1100, k = v > m ? m / v : 1;
          o.vx = h.vx * k; o.vy = h.vy * k; o.held = false; o.rest = false; o.hitB = false; if (o.t === 'anvil') o.life = 6.5;
        } else if (h.pending && W.pts.includes(h.pending)) {
          if (h.pending.body) { W.B.poke(h.sx, h.sy); used('hand'); }
          else { h.pending.py += 120 / 120; }
        }
        W.hand = null;
      },
    },
    saw: {
      down(x, y) {
        W.sawT = { x, y: y + 6, tx: x, ty: y, ang: -0.25, t: 0, snd: 0, cd: 0, load: 0 };
        used('saw');
      },
      move(x, y) { if (W.sawT) { W.sawT.tx = x - Math.cos(W.sawT.ang) * 26; W.sawT.ty = y - Math.sin(W.sawT.ang) * 26; } },
      up() { W.sawT = null; },
    },
    eraser: {
      down(x, y) { W.eraserT = { x, y, last: 0 }; used('eraser'); W.eraseAt(x, y, 8); },
      move(x, y) {
        const E = W.eraserT; if (!E) return;
        const d = hyp(x - E.x, y - E.y), n = Math.ceil(d / 5) || 1;
        for (let i = 1; i <= n; i++) W.eraseAt(E.x + (x - E.x) * i / n, E.y + (y - E.y) * i / n, 8);
        E.x = x; E.y = y;
        if (d > 1) sfx.erase();
      },
      up() { W.eraserT = null; },
    },
    pencil: {
      down(x, y) { W.stroke = { pts: [{ x, y }], len: 0 }; used('pencil'); },
      move(x, y) {
        const S = W.stroke; if (!S) return;
        const q = S.pts[S.pts.length - 1], d = hyp(x - q.x, y - q.y);
        if (d < 5) return;
        S.pts.push({ x, y: Math.min(y, W.ground - 1) });
        S.len += d;
        sfx.scratch();
        if (S.len > 420) drag.pencil.up();
      },
      up() {
        const S = W.stroke; if (!S) return;
        W.stroke = null;
        if (S.pts.length < 2) return;
        if (!W.B.addLimb(S.pts)) W.addWall(S.pts);
      },
    },
  };

  const target = () => {
    const B = W.B;
    const hip = B.j && B.j.hip;
    if (hip) return { x: hip.x, y: hip.y };
    return { x: W.w / 2, y: W.ground - 40 };
  };

  /* 再点一下图标：直接用在他身上。拖着用的工具由 auto 走一段预设路线 */
  let auto = null;
  const autoPaths = {
    hand() {
      const B = W.B, p = B.j.chest || B.j.hip;
      if (!p) return null;
      const dir = p.x < W.w / 2 ? 1 : -1;
      const x0 = p.x, y0 = p.y;
      return { dur: 0.62, path: (u) => (u < 0.55 ? { x: x0 - dir * 18 * (u / 0.55), y: y0 - 56 * (u / 0.55) } : { x: x0 - dir * 18 + dir * (W.w * 0.75) * ((u - 0.55) / 0.45), y: y0 - 56 - 44 * ((u - 0.55) / 0.45) }) };
    },
    saw() {
      const B = W.B;
      const list = ['lKn', 'rKn', 'lEl', 'rEl', 'chest'].map((n) => B.j[n]).filter(Boolean);
      if (!list.length) return null;
      const p = list[(Math.random() * list.length) | 0];
      const dir = p.x < W.w / 2 ? 1 : -1;
      const sx = p.x - dir * 66, ex = p.x + dir * 66, y = p.y - 2;
      return { dur: 0.34, path: (u) => ({ x: sx + (ex - sx) * u, y }) };
    },
    eraser() {
      const B = W.B;
      const list = ['lFo', 'rFo', 'lHa', 'rHa'].map((n) => B.j[n]).filter(Boolean);
      const p = list.length ? list[(Math.random() * list.length) | 0] : B.j.head || B.j.chest;
      if (!p) return null;
      const x0 = p.x, y0 = p.y;
      return { dur: 0.7, path: (u) => ({ x: x0 + Math.sin(u * 14) * 9, y: y0 - 22 + u * 26 }) };
    },
    pencil() {
      const B = W.B;
      const list = ['hip', 'chest', 'head', 'neck'].map((n) => B.j[n]).filter(Boolean);
      if (!list.length) return null;
      const p = list[(Math.random() * list.length) | 0];
      const dir = Math.random() < 0.5 ? -1 : 1, up = rnd(-20, 14);
      const x0 = p.x, y0 = p.y;
      return { dur: 0.6, path: (u) => ({ x: x0 + dir * u * 44, y: y0 + up * u + Math.sin(u * 9) * 5 }) };
    },
  };

  const api = {
    /** 手指放道具 */
    place: useAt,
    /** 再点一下图标：直接用在他身上 */
    auto(id, s = 1) {
      const t = toolById(id), { x, y } = target();
      if (t.kind === 'drag') {
        if (auto) api.cancelAuto();
        const a = autoPaths[id] && W.B.j.chest ? autoPaths[id]() : null;
        if (!a) { sfx.error(); return; }
        const q = a.path(0);
        auto = { id, t: 0, dur: a.dur, path: a.path };
        drag[id].down(q.x, q.y);
        return;
      }
      const g = W.ground, dir = W.B.dir || 1;
      switch (id) {
        case 'anvil': useAt(id, x, 0, s); break;
        case 'bomb': useAt(id, clamp(x + dir * 18, 16, W.w - 16), y - 50, s); break;
        case 'mine': case 'peel': useAt(id, clamp(x + dir * 34, 20, W.w - 20), g, s); break;
        case 'spring': useAt(id, x, g, s); break;
        case 'spikes': useAt(id, x, g, s); break;
        case 'bolt': useAt(id, x, y, s); break;
        case 'roller': useAt(id, x < W.w / 2 ? 0 : W.w, g, s); break;
        case 'rocket': {
          const B = W.B, p = B.j.chest;
          if (p) useAt(id, p.x, p.y, s); else useAt(id, x, y, s);
          break;
        }
        case 'freeze': useAt(id, x, y - 20, s); break;
        case 'hole': useAt(id, clamp(x + dir * 62, 24, W.w - 24), clamp(y - 60, 30, g - 30), s); break;
        case 'bin': useAt(id, x, 0, s); break;
        default: break;
      }
    },
    frame(dt) {
      if (W.sawT) W.sawStep(dt);
      if (!auto) return;
      auto.t += dt;
      const u = Math.min(1, auto.t / auto.dur), q = auto.path(u);
      drag[auto.id].move(q.x, q.y);
      if (u >= 1) { drag[auto.id].up(q.x, q.y); auto = null; }
    },
    cancelAuto() { if (auto) { const q = auto.path(1); drag[auto.id].up(q.x, q.y); auto = null; } },
    get running() { return !!auto; },
    down: (id, x, y) => drag[id].down(x, y),
    move: (id, x, y) => drag[id].move(x, y),
    up: (id, x, y) => drag[id].up(x, y),
  };
  return api;
}
