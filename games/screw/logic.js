// 拧螺丝的规则（不碰界面，Node 里也能跑）。
// 走一步马上算出最终结果（规则状态永远比画面快一拍），返回一串事件给画面照着放动画。
//
// 状态 s：
//   plates[i]  { id, above: [压在它上面的板块 id], screws: [螺丝 id], gone }
//   screws[i]  { id, x, y, c: 颜色 0–5（-1 = 变色钉，直接进仓库）, plate, out }
//   boxes[4]   { c: 绑定的颜色（-1 = 空闲）, n: 装了几颗, uid }
//   stage[k]   暂存格：{ id, c } 或 null（位置固定，空出来的格子下次先用最左边的）
//   got        这一关已经收进仓库的：{ c: [6 种颜色的数量], s: 变色钉 }
export const NBOX = 4;
export const MAX_STAGE = 8;

export const plateFree = (s, p) => !p.gone && p.above.every((j) => s.plates[j].gone);
export const screwFree = (s, sc) => !sc.out && plateFree(s, s.plates[sc.plate]);

/** 这颗颜色的螺丝现在能去哪：同色工具箱 → 空闲工具箱 → 暂存格 */
export function placeFor(s, c) {
  if (c < 0) return { kind: 'bank' };
  let i = s.boxes.findIndex((b) => b.c === c && b.n < s.cap);
  if (i >= 0) return { kind: 'box', i };
  i = s.boxes.findIndex((b) => b.c < 0);
  if (i >= 0) return { kind: 'box', i, bind: true };
  i = s.stage.indexOf(null);
  if (i >= 0) return { kind: 'stage', i };
  return null;
}

export function newState(level, stageN) {
  return {
    n: level.n, W: level.W, H: level.H, r: level.r, cap: level.cap,
    plates: level.plates.map((p) => ({ ...p, gone: false })),
    screws: level.screws.map((sc) => ({ ...sc, out: false })),
    boxes: Array.from({ length: NBOX }, (_, i) => ({ c: -1, n: 0, uid: i })),
    uid: NBOX,
    stage: Array(stageN).fill(null),
    got: { c: [0, 0, 0, 0, 0, 0], s: 0 },
    removed: 0, skills: 0,
  };
}

function collect(s, i, ev, forced = false) {
  const b = s.boxes[i];
  s.got.c[b.c] += b.n;
  ev.push({ t: 'collect', i, uid: b.uid, c: b.c, n: b.n, forced });
  s.boxes[i] = { c: -1, n: 0, uid: s.uid++ };
  ev.push({ t: 'newbox', i, uid: s.boxes[i].uid });
}

/** 工具箱有空位了：把暂存格里能放进去的自动挪过去（空闲的箱子挑暂存格里最多的那种颜色） */
function settle(s, ev) {
  for (let guard = 0; guard < 64; guard++) {
    let moved = false;
    for (let i = 0; i < s.boxes.length && !moved; i++) {
      const b = s.boxes[i];
      if (b.c < 0) {
        const cnt = new Map();
        s.stage.forEach((x) => { if (x) cnt.set(x.c, (cnt.get(x.c) || 0) + 1); });
        if (!cnt.size) continue;
        let best = -1, bestN = 0;
        for (const x of s.stage) if (x && cnt.get(x.c) > bestN) { best = x.c; bestN = cnt.get(x.c); }
        b.c = best;
        ev.push({ t: 'bind', i, c: best, uid: b.uid });
      }
      for (let k = 0; k < s.stage.length && b.n < s.cap; k++) {
        const x = s.stage[k];
        if (!x || x.c !== b.c) continue;
        s.stage[k] = null;
        ev.push({ t: 'transfer', id: x.id, c: x.c, from: k, to: { kind: 'box', i, slot: b.n, uid: b.uid } });
        b.n++;
        moved = true;
      }
      if (b.c >= 0 && b.n >= s.cap) { collect(s, i, ev); moved = true; }
    }
    if (!moved) return;
  }
}

export const left = (s) => s.screws.length - s.removed;

export function status(s) {
  if (left(s) === 0) return 'win';
  for (const sc of s.screws) if (screwFree(s, sc) && placeFor(s, sc.c)) return 'play';
  return 'stuck';
}

/** 过关：工具箱里没装满的、暂存格里的，统统收进仓库 */
function bankAll(s, ev) {
  const items = [];
  s.boxes.forEach((b, i) => { if (b.c >= 0 && b.n) { s.got.c[b.c] += b.n; items.push({ box: i, c: b.c, n: b.n, uid: b.uid }); } });
  s.stage.forEach((x, k) => { if (x) { s.got.c[x.c]++; items.push({ stage: k, c: x.c, id: x.id }); } });
  s.boxes = s.boxes.map(() => ({ c: -1, n: 0, uid: s.uid++ }));
  s.stage = s.stage.map(() => null);
  ev.push({ t: 'bankAll', items });
}

/** 点一颗螺丝。返回 { ok, why?, ev } */
export function tap(s, id) {
  const sc = s.screws[id];
  if (!sc || sc.out) return { ok: false, why: 'gone' };
  if (!screwFree(s, sc)) return { ok: false, why: 'locked' };
  const place = placeFor(s, sc.c);
  if (!place) return { ok: false, why: 'full' };
  const ev = [];
  sc.out = true;
  s.removed++;
  if (place.kind === 'bank') {
    s.got.s++;
    ev.push({ t: 'out', id, c: -1, to: { kind: 'bank' } });
  } else if (place.kind === 'box') {
    const b = s.boxes[place.i];
    if (place.bind) { b.c = sc.c; ev.push({ t: 'bind', i: place.i, c: sc.c, uid: b.uid }); }
    ev.push({ t: 'out', id, c: sc.c, to: { kind: 'box', i: place.i, slot: b.n, uid: b.uid } });
    b.n++;
    if (b.n >= s.cap) collect(s, place.i, ev);
  } else {
    s.stage[place.i] = { id, c: sc.c };
    ev.push({ t: 'out', id, c: sc.c, to: { kind: 'stage', i: place.i } });
  }
  const p = s.plates[sc.plate];
  if (p.screws.every((j) => s.screws[j].out)) {
    p.gone = true;
    const freed = s.plates.filter((q) => q.above.includes(p.id) && plateFree(s, q)).map((q) => q.id);
    ev.push({ t: 'fall', plate: p.id, freed });
  }
  settle(s, ev);
  const st = status(s);
  if (st === 'win') { bankAll(s, ev); ev.push({ t: 'win' }); } else if (st === 'stuck') ev.push({ t: 'stuck' });
  return { ok: true, ev };
}

/* ---------------- 三个救急技能（不限次数） ---------------- */

/** 加孔位：多一个暂存格（这一关有效） */
export function addSlot(s) {
  if (s.stage.length >= MAX_STAGE) return { ok: false, why: 'max' };
  s.stage.push(null);
  s.skills++;
  const ev = [{ t: 'slot', i: s.stage.length - 1 }];
  if (status(s) === 'stuck') ev.push({ t: 'stuck' });
  return { ok: true, ev };
}

/** 清空孔位：把一个工具箱（满没满都行）直接收进仓库 */
export function clearBox(s, i) {
  const b = s.boxes[i];
  if (!b || b.c < 0) return { ok: false, why: 'empty' };
  const ev = [];
  s.skills++;
  collect(s, i, ev, true);
  settle(s, ev);
  if (status(s) === 'stuck') ev.push({ t: 'stuck' });
  return { ok: true, ev };
}

/** 熔玻璃：暂存格里的螺丝直接熔进仓库 */
export function melt(s) {
  const items = [];
  s.stage.forEach((x, k) => { if (x) { items.push({ k, id: x.id, c: x.c }); s.got.c[x.c]++; s.stage[k] = null; } });
  if (!items.length) return { ok: false, why: 'empty' };
  s.skills++;
  const ev = [{ t: 'melt', items }];
  if (status(s) === 'stuck') ev.push({ t: 'stuck' });
  return { ok: true, ev };
}

/** 现在能点的螺丝 */
export const freeScrews = (s) => s.screws.filter((sc) => screwFree(s, sc));
