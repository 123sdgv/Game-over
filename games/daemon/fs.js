// 文件系统：C 盘、A 盘（软盘）、回收站。大小用 KB 记。
import { G, emit, pick, ri, rnd, dn } from './state.js';

export const CAP_C = 2048 * 1024;   // 2 GB
export const CAP_A = 1440;          // 1.44 MB
const BASE_C = 118 * 1024;          // 看不见的「其他」：分页文件、隐藏文件……

/** 拿文件当前是不是被占用（machine.js 会接上：heartbeat.log 被进程写着的时候删不掉） */
export const hooks = { inUse: () => null };

const N = () => G.fs.nodes;
export const node = (id) => G.fs.nodes[id];
function nid() { return `n${(G.fs.seq++).toString(36)}`; }

export function mk(p, name, kb = 0, extra = {}) {
  const isDir = extra.t === 'd';
  const dot = name.lastIndexOf('.');
  const n = { id: extra.id || nid(), n: name, t: isDir ? 'd' : 'f', ext: !isDir && dot > 0 ? name.slice(dot + 1).toLowerCase() : '', kb: isDir ? 0 : kb, p, made: G.day || 1, ...extra };
  n.t = isDir ? 'd' : 'f';
  N()[n.id] = n;
  return n;
}
const dir = (p, name, id, extra = {}) => mk(p, name, 0, { t: 'd', id, ...extra });

/** 第一次开机的硬盘 */
export function newFS() {
  G.fs = { seq: 1, nodes: {} };
  dir(null, 'C:', 'C');
  dir(null, 'A:', 'A');
  dir(null, '回收站', 'bin');
  dir('C', '我的文档', 'docs');
  dir('docs', '工作', 'work');
  dir('docs', '图片', 'pics');
  dir('docs', '音乐', 'music');
  dir('C', '下载', 'dl');
  dir('C', 'Program Files', 'prog', { lock: 'sys' });
  dir('C', 'WINDOWS', 'win', { lock: 'sys' });
  dir('win', 'FONTS', 'fonts', { sys: 1 });
  dir('win', 'SYSTEM', 'system', { sys: 1 });
  dir('win', 'TEMP', 'temp');
  dir('C', 'daemon', 'dhome', { lock: 'sys', dhome: 1 });

  const W = (n, kb) => mk('work', n, kb);
  W('周报_第11周.doc', 46); W('报价单.xls', 118); W('合同_初稿.doc', 262); W('会议纪要.txt', 6); W('年度总结.ppt', 940); W('预算.xls', 88);
  mk('pics', '猫.jpg', 384); mk('pics', '毕业合影.jpg', 652); mk('pics', '海边.jpg', 520);
  mk('music', '雨夜.mp3', 4120); mk('music', '慢车.mp3', 3650);
  mk('docs', '待办.txt', 2);
  mk('dl', 'setup_旧版.exe', 12400);

  const fonts = [['宋体.ttf', 10450], ['黑体.ttf', 9980], ['楷体.ttf', 4200], ['仿宋.ttf', 3640], ['等线.ttf', 2250], ['Arial.ttf', 310], ['Courier.ttf', 290], ['Tahoma.ttf', 380], ['符号.ttf', 120]];
  for (const [n, kb] of fonts) mk('fonts', n, kb, { lock: 'sys' });
  fillSystem();
  for (const [n, kb] of [['mailer.exe', 82000], ['shell.exe', 46000], ['画图.exe', 31000], ['驱动备份.cab', 240000], ['帮助.dat', 236000]]) mk('prog', n, kb, { lock: 'sys' });
  mk('win', 'explorer.exe', 1240, { lock: 'sys' });
  mk('win', '注册表.dat', 5600, { lock: 'sys' });
  mk('dhome', 'daemon.exe', 7600, { lock: 'daemon', dexe: 1 });
  mk('dhome', 'you.idx', 2100, { lock: 'daemon' });
  mk('dhome', 'heartbeat.log', 4, { hb: 1 });

  mk('A', '旧备份_通讯录.txt', 14);
  mk('A', '旧备份_照片.jpg', 880);
  spawnTemp(4);
}

function fillSystem() {
  for (const [n, kb] of [['kernel.dll', 64200], ['user.dll', 48100], ['gdi.dll', 52300], ['shell.dll', 38400], ['drivers.cab', 97800], ['vmm.vxd', 21900], ['config.dat', 64300]]) mk('system', n, kb, { lock: 'sys' });
}
/** 系统文件夹被彻底删了：重启时「自动修复」 */
export function rebuildSystem() {
  if (node('system')) return;
  dir('win', 'SYSTEM', 'system', { sys: 1 });
  fillSystem();
  changed();
}
export function rebuildFonts() {
  if (node('fonts')) return;
  dir('win', 'FONTS', 'fonts', { sys: 1 });
  const fonts = [['宋体.ttf', 10450], ['黑体.ttf', 9980], ['楷体.ttf', 4200], ['仿宋.ttf', 3640], ['等线.ttf', 2250], ['Arial.ttf', 310], ['Courier.ttf', 290], ['Tahoma.ttf', 380], ['符号.ttf', 120]];
  for (const [n, kb] of fonts) mk('fonts', n, kb, { lock: 'sys' });
  changed();
}

export function spawnTemp(k) {
  if (!node('temp')) return [];
  const out = [];
  for (let i = 0; i < k; i++) {
    const hex = Math.floor(rnd(0x1000, 0xffff)).toString(16).toUpperCase();
    out.push(mk('temp', `~DF${hex}.tmp`, ri(12, 58) * 1024, { junk: 1 }));
  }
  return out;
}

/* ─────────── 查询 ─────────── */
export function kids(id) {
  const out = [];
  for (const n of Object.values(N())) if (n.p === id) out.push(n);
  return out.sort((a, b) => (a.t === b.t ? a.n.localeCompare(b.n, 'zh') : a.t === 'd' ? -1 : 1));
}
export function size(id) {
  const n = node(id);
  if (!n) return 0;
  if (n.t === 'f') return n.kb;
  let s = 0;
  for (const k of Object.values(N())) if (k.p === id) s += k.t === 'f' ? k.kb : size(k.id);
  return s;
}
export function isUnder(id, anc) {
  let n = node(id);
  while (n) { if (n.p === anc) return true; n = node(n.p); }
  return false;
}
export function driveOf(id) {
  let n = node(id);
  while (n && n.p) n = node(n.p);
  return n ? n.id : null;
}
export function path(id) {
  if (id === 'bin') return '回收站';
  const parts = [];
  let n = node(id);
  while (n) { parts.unshift(n.n); n = node(n.p); }
  return parts.length === 1 ? `${parts[0]}\\` : parts.join('\\');
}
export const usedC = () => size('C') + size('bin') + BASE_C;
export const freeC = () => CAP_C - usedC();
export const freeA = () => CAP_A - size('A');
export const freeOf = (drive) => (drive === 'A' ? freeA() : freeC());
export const fontsOK = () => { const f = node('fonts'); return !!f && f.p === 'win'; };
export const systemOK = () => { const f = node('system'); return !!f && f.p === 'win'; };
export function findByName(parent, name) { return kids(parent).find((k) => k.n === name) || null; }

/** 为什么不能动它（能动就返回 null） */
export function lockReason(n, op = 'move') {
  if (!n) return '找不到这个文件。';
  if (['C', 'A', 'bin', 'docs', 'win', 'dl'].includes(n.id)) return '这个文件夹不能移动或删除。';
  if (n.lock === 'daemon') return `文件正在被 ${dn()} 使用。\n（它说：别动这个。）`;
  if (n.lock === 'sys') return '这是系统文件，不能单独移动或删除。';
  if (n.id === 'dhome') return '这是系统文件夹。';
  const u = hooks.inUse(n);
  if (u) return u;
  if (n.t === 'd') for (const k of Object.values(N())) if (isUnder(k.id, n.id)) { const r = hooks.inUse(k); if (r) return r; if (k.lock === 'daemon') return `里面有文件正在被 ${dn()} 使用。`; }
  return null;
}

export function uniqueName(dest, name) {
  if (!findByName(dest, name)) return name;
  const dot = name.lastIndexOf('.');
  const base = dot > 0 ? name.slice(0, dot) : name, ext = dot > 0 ? name.slice(dot) : '';
  for (let i = 2; ; i++) { const n = `${base} (${i})${ext}`; if (!findByName(dest, n)) return n; }
}

/* ─────────── 改动 ─────────── */
export function changed() { emit('fs'); }

function deepCopy(id, dest) {
  const n = node(id);
  const c = mk(dest, uniqueName(dest, n.n), n.kb, { t: n.t, src: n.src || n.id });
  if (n.t === 'd') for (const k of kids(id)) deepCopy(k.id, c.id);
  return c;
}

/** 拖过去：同一个盘是移动，跨盘是复制。返回 { ok, err, moved:[ids] } */
export function transfer(ids, dest) {
  const D = node(dest);
  if (!D || D.t !== 'd') return { err: '目标不是文件夹。' };
  if (dest === 'bin') return trash(ids);
  const dd = driveOf(dest);
  const out = [];
  for (const id of ids) {
    const n = node(id);
    if (!n) continue;
    if (n.p === dest) continue;
    if (id === dest || isUnder(dest, id)) return { err: '不能把文件夹放进它自己里面。' };
    const sd = n.p === 'bin' ? 'C' : driveOf(id);
    if (sd !== dd) {
      const need = size(id);
      if (need > freeOf(dd)) return { err: dd === 'A' ? `软盘放不下了。\n还剩 ${Math.max(0, Math.floor(freeA()))} KB，这个要 ${need} KB。` : 'C 盘空间不足。', out };
      out.push(deepCopy(id, dest).id);
    } else {
      const r = n.p === 'bin' ? null : lockReason(n);
      if (r) return { err: r, out };
      if (n.p === 'bin') { delete n.from; }
      n.n = uniqueName(dest, n.n);
      n.p = dest;
      out.push(id);
    }
  }
  changed();
  return { ok: true, out };
}

/** 扔进回收站（软盘上的直接删掉） */
export function trash(ids, { force = false } = {}) {
  const out = [];
  for (const id of ids) {
    const n = node(id);
    if (!n || n.p === 'bin') continue;
    if (!force) { const r = lockReason(n, 'delete'); if (r) return { err: r, out }; }
    if (driveOf(id) === 'A') { destroy(id); out.push(id); continue; }
    n.from = n.p;
    n.p = 'bin';
    n.binAt = Date.now();
    out.push(id);
  }
  changed();
  return { ok: true, out };
}

export function restore(ids) {
  for (const id of ids) {
    const n = node(id);
    if (!n || n.p !== 'bin') continue;
    let to = n.from && node(n.from) ? n.from : 'C';
    if (node(to) && node(to).p === 'bin') to = 'C';
    n.n = uniqueName(to, n.n);
    n.p = to;
    delete n.from; delete n.binAt;
  }
  changed();
}

/** 彻底删除（连子文件一起） */
export function destroy(id) {
  const n = node(id);
  if (!n) return;
  for (const k of kids(id)) destroy(k.id);
  delete N()[id];
  if (id === 'fonts') G.fontsGone = true;
  if (id === 'system') G.systemGone = true;
}
export function emptyBin() {
  const items = kids('bin');
  for (const n of items) destroy(n.id);
  changed();
  return items;
}

/** 文件该放哪儿（归档任务用） */
export function targetFor(ext) {
  if (['jpg', 'bmp'].includes(ext)) return 'pics';
  if (['mp3'].includes(ext)) return 'music';
  return 'work';
}

const DL = {
  pics: ['午饭.jpg', '聚餐合影.jpg', '截图.bmp', '樱花.jpg', '海边日落.jpg', '猫猫.jpg', '风景.jpg', '老照片.jpg', '雪.jpg', '表情包.jpg'],
  work: ['报销单.xls', '会议纪要.txt', '方案.doc', '客户名单.xls', '发言稿.doc', '培训材料.ppt', '招标书.doc', '日程.txt', '采购清单.xls', '需求说明.doc'],
  music: ['晚安曲.mp3', '散步.mp3', '磁带A面.mp3', '公交车上.mp3', '下午三点.mp3'],
};
/** 今天下载了几个文件 */
export function spawnDownloads(k) {
  const out = [];
  for (let i = 0; i < k; i++) {
    const to = i === 0 ? 'work' : pick(['pics', 'work', 'pics', 'music', 'work']);
    const base = pick(DL[to]);
    const name = uniqueName('dl', base);
    const ext = base.split('.').pop();
    const kb = ext === 'mp3' ? ri(2800, 4600) : ext === 'jpg' || ext === 'bmp' ? ri(180, 900) : ext === 'ppt' ? ri(500, 1200) : ri(12, 320);
    out.push(mk('dl', name, kb, { want: targetFor(ext) }));
  }
  changed();
  return out;
}

/** 文件夹的中文名（任务文字里用） */
export function folderName(id) {
  const n = node(id);
  return n ? n.n : '?';
}
