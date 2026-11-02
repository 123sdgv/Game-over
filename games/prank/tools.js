// 右边工具箱里的 15 样东西。
// kind: place=放在画布上（长按变大）；tap=点一下就用；drag=按住拖着用；water=拖水位小点
import { sfx } from './sfx.js';

const hyp = Math.hypot;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export const TOOLS = [
  { id: 'mouse', name: '鼠标', kind: 'drag', desc: '抓起来甩，往墙上扔。', how: '滑圆盘移动鼠标 · 碰到他就抓 · 松手扔 · 点圆盘中央戳他 · 手指也能直接拖他' },
  { id: 'nail', name: '钉子', kind: 'tap', desc: '点手腕脚踝钉住他；点空白先固定好，把他扔上去；点气球戳破。', how: '橡皮能擦掉' },
  { id: 'rope', name: '绳子', kind: 'drag', desc: '有弹性。靠近钉子、手腕、脚踝就连上，能吊人，能走钢丝。', how: '按住拖 · 橡皮能擦断' },
  { id: 'balloon', name: '气球', kind: 'tap', desc: '点手腕脚踝绑上，两三个才飞。点气球吹大，太大会炸。', how: '钉子能戳破' },
  { id: 'water', name: '水', kind: 'water', desc: '上下拖小点调水位，拖到底没水。点铅笔画的封闭框能单独灌水。', how: '他会游泳，按在水里才淹死' },
  { id: 'anvil', name: '铁砧', kind: 'place', desc: '从天上掉下来，把他拍扁。', how: '点画布 · 长按变大' },
  { id: 'peel', name: '香蕉皮', kind: 'place', desc: '踩上去滑倒，摔个大跟头。用一次就没了。', how: '点画布 · 长按变大' },
  { id: 'spring', name: '弹簧板', kind: 'place', desc: '把他弹到天花板上。', how: '点画布 · 长按力气更大' },
  { id: 'spikes', name: '钉板', kind: 'place', desc: '铺在地上、线上，或者点墙边、天花板装上。', how: '点画布 · 长按变长' },
  { id: 'bolt', name: '闪电', kind: 'place', desc: '点哪劈哪。劈中了能看见骨头。', how: '点画布 · 长按更粗' },
  { id: 'roller', name: '压路机', kind: 'place', desc: '把他碾成一条线。点铅笔线就在线上开。', how: '点哪边从哪边来' },
  { id: 'freeze', name: '冰冻', kind: 'place', desc: '冻住后再碰一下就碎。遇水会化，化的时候掉血。', how: '点画布 · 长按范围更大' },
  { id: 'hole', name: '黑洞', kind: 'place', desc: '连人带东西全吸进去，最后吐出来。', how: '点画布 · 长按变大' },
  { id: 'eraser', name: '橡皮擦', kind: 'drag', desc: '擦掉他一截。道具、钉子、绳子、线也能擦。', how: '按住擦' },
  { id: 'pencil', name: '铅笔', kind: 'drag', desc: '从他身上画出去多长一条；画别处是一条线，东西能放上面。', how: '' },
];
export const toolById = (id) => TOOLS.find((t) => t.id === id);

/** 手指或者鼠标抓得到的东西：优先身上的点，其次残骸、绳头和道具 */
function pickAt(W, x, y, r) {
  let best = null, bd = r;
  for (const p of W.pts) {
    if (p.hole || p.pin) continue;
    if (p.owner && p.owner.state === 'draw') continue;
    const d = hyp(p.x - x, p.y - y) - p.r * 0.5 - (p.owner ? 6 : 0) + (p.rope ? 2 : 0);
    if (d < bd) { bd = d; best = { p }; }
  }
  for (const o of W.props) {
    if (!['anvil', 'peel', 'spring', 'balloon'].includes(o.t) || o.dead) continue;
    const cy = o.t === 'anvil' ? o.y - 18 * o.s : o.t === 'balloon' ? o.y : o.y - 8 * o.s;
    const d = hyp(o.x - x, cy - y) - (o.t === 'anvil' ? 18 : o.t === 'balloon' ? 12 : 10) * o.s;
    if (d < bd) { bd = d; best = { o, oy: o.y - cy }; }
  }
  return best;
}

export function makeTools(W, cb = {}) {
  const used = (id) => cb.used && cb.used(id);

  const useAt = (id, x, y, s) => {
    switch (id) {
      case 'anvil': W.dropAnvil(x, s); break;
      case 'peel': W.placePeel(x, y, s); break;
      case 'spring': W.placeSpring(x, y, s); break;
      case 'spikes': W.placeSpikes(x, y, s); break;
      case 'bolt': W.strike(x, y, s); break;
      case 'roller': W.startRoller(x, y, s); break;
      case 'freeze': W.freezeAt(x, y, s); break;
      case 'hole': W.openHole(x, y, s); break;
      case 'nail': W.useNail(x, y); break;
      case 'balloon': W.useBalloon(x, y); break;
      default: return;
    }
    used(id);
  };

  const grab = (h, t) => {
    if (t.p) {
      const p = t.p;
      h.p = p; h.saveIm = p.im; p.im = 0; p.trap = null; p.sleep = 0;
      h.x = p.x; h.y = p.y;
      if (p.owner) p.owner.grabbed();
    } else {
      h.o = t.o; h.oy = t.oy; t.o.held = true; t.o.rest = false;
      if (t.o.t === 'balloon') t.o.cd = 0;
      W.unTrap(t.o);
      sfx.click();
    }
    used('mouse');
  };
  const letGo = (h) => {
    const M = 1200;
    if (h.p) {
      const p = h.p;
      p.im = h.saveIm || 1;
      const v = hyp(h.vx, h.vy), k = v > M ? M / v : 1;
      p.px = p.x - h.vx * k / 120; p.py = p.y - h.vy * k / 120;
      if (p.owner) p.owner.released_();
      if (v > 500) sfx.scratch();
    } else if (h.o) {
      const o = h.o, v = hyp(h.vx, h.vy), m = 1100, k = v > m ? m / v : 1;
      o.vx = h.vx * k; o.vy = h.vy * k; o.held = false; o.rest = false; o.hitB = null;
      if (o.t === 'anvil') { o.life = 6.5; }
    }
  };
  const clampCursor = (x, y) => ({ x: clamp(x, 1, W.w - 1), y: clamp(y, 1, W.ground - 1) });

  /* 拖着用的工具 */
  const drag = {
    // 手指直接在画布上拖
    mouse: {
      down(x, y) {
        W.cursor.x = x; W.cursor.y = y; W.cursor.moved = W.t;
        W.hand = { x, y, tx: x, ty: y, vx: 0, vy: 0, down: true, moved: 0, sx: x, sy: y };
        const t = pickAt(W, x, y, 26);
        if (!t) return;
        if (t.p) W.hand.pending = t.p;
        else grab(W.hand, t);
      },
      move(x, y) {
        const h = W.hand; if (!h) return;
        h.tx = x; h.ty = y;
        W.cursor.moved = W.t;
        h.moved = Math.max(h.moved, hyp(x - h.sx, y - h.sy));
        // 动了才算抓起来；不动就是戳
        if (h.pending && h.moved > 6) {
          const p = h.pending; h.pending = null;
          if (W.pts.includes(p)) grab(h, { p });
        }
      },
      up() {
        const h = W.hand; if (!h) return;
        if (h.p || h.o) letGo(h);
        else if (h.pending && W.pts.includes(h.pending)) {
          if (h.pending.owner) { h.pending.owner.poke(h.sx, h.sy); used('mouse'); }
          else { h.pending.py += 1; h.pending.sleep = 0; }
        }
        W.hand = null;
      },
    },
    eraser: {
      down(x, y) { W.eraserT = { x, y }; used('eraser'); W.eraseAt(x, y, 8); },
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
      down(x, y) { W.stroke = { pts: [{ x, y }], len: 0, line: W.pencilLine }; if (W.pencilLine) W.stroke.pts.push({ x, y }); used('pencil'); },
      move(x, y) {
        const S = W.stroke; if (!S) return;
        y = Math.min(y, W.ground);
        if (S.line) { const q = S.pts[1]; q.x = x; q.y = y; return; }
        const q = S.pts[S.pts.length - 1], d = hyp(x - q.x, y - q.y);
        if (d < 5) return;
        S.pts.push({ x, y });
        S.len += d;
        sfx.scratch();
        if (S.len > 620) drag.pencil.up();
      },
      up() {
        const S = W.stroke; if (!S) return;
        W.stroke = null;
        let pts = S.pts;
        if (S.line) {
          const a = pts[0], b = pts[1], d = hyp(b.x - a.x, b.y - a.y);
          if (d < 6) return;
          const n = Math.max(1, Math.round(d / 8));
          pts = [];
          for (let i = 0; i <= n; i++) pts.push({ x: a.x + (b.x - a.x) * i / n, y: a.y + (b.y - a.y) * i / n });
        }
        if (pts.length < 2) return;
        for (const B of W.bodies) if (B.addLimb(pts)) return;
        W.addWall(pts);
      },
    },
    rope: {
      down(x, y) { W.ropeDraft = { ax: x, ay: y, bx: x, by: y }; used('rope'); },
      move(x, y) { const D = W.ropeDraft; if (D) { D.bx = x; D.by = Math.min(y, W.ground - 2); } },
      up() {
        const D = W.ropeDraft; if (!D) return;
        W.ropeDraft = null;
        // 只是点了一下：往下垂一根
        if (hyp(D.bx - D.ax, D.by - D.ay) < 10) { D.by = Math.min(D.ay + 70, W.ground - 2); }
        W.makeRope(D.ax, D.ay, D.bx, D.by);
      },
    },
  };

  const api = {
    /** 放道具 */
    place: useAt,
    down: (id, x, y) => drag[id].down(x, y),
    move: (id, x, y) => drag[id].move(x, y),
    up: (id, x, y) => drag[id].up(x, y),

    /* 水：拖小点 */
    waterDown(x, y) {
      const wt = W.waterHandleAt(x, y);
      if (wt) { W.waterDrag = wt; W.setWaterTarget(wt, y); used('water'); }
      return wt;
    },
    waterMove(y) { if (W.waterDrag) W.setWaterTarget(W.waterDrag, y); },
    waterUp() { W.waterDrag = null; },

    /* 圆盘：像笔记本触控板 */
    padDown() {
      W.cursor.on = true;
      const c = W.cursor;
      W.hand = { x: c.x, y: c.y, tx: c.x, ty: c.y, vx: 0, vy: 0, down: true, pad: true, moved: 0 };
    },
    padMove(dx, dy) {
      const h = W.hand; if (!h || !h.pad) return;
      const q = clampCursor(h.tx + dx, h.ty + dy);
      h.tx = q.x; h.ty = q.y;
      h.moved += hyp(dx, dy);
      W.cursor.moved = W.t;
      // 鼠标碰到他就抓起来
      if (!h.p && !h.o) {
        const t = pickAt(W, h.x, h.y, 9);
        if (t) grab(h, t);
      }
    },
    /** tap=手指没怎么动就抬起来了；center=点的是圆盘中央 */
    padUp(tap, center) {
      const h = W.hand; if (!h || !h.pad) return;
      if (h.p || h.o) letGo(h);
      W.hand = null;
      if (!tap) return;
      if (center) {
        // 圆盘中央：鼠标直接点到火柴人身上。优先离得最近的活人
        let best = null, bd = 1e9;
        for (const B of W.bodies) {
          const q = B.j.chest;
          if (!q || B.state === 'draw') continue;
          const d = hyp(q.x - W.cursor.x, q.y - W.cursor.y);
          if (d < bd) { bd = d; best = B; }
        }
        if (best) {
          const q = best.j.chest;
          W.cursor.x = q.x; W.cursor.y = q.y; W.cursor.moved = W.t;
          best.poke(q.x, q.y);
          used('mouse');
        } else sfx.click();
        return;
      }
      // 别的位置：在鼠标现在的位置点一下
      const t = pickAt(W, W.cursor.x, W.cursor.y, 12);
      if (t && t.p && t.p.owner) { t.p.owner.poke(W.cursor.x, W.cursor.y); used('mouse'); } else sfx.click();
    },
  };
  return api;
}
