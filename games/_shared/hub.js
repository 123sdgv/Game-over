/**
 * 游戏与大厅之间的小桥。每个游戏在 game.js 里：
 *   import { hub } from '../_shared/hub.js';
 *   const h = hub('minesweeper');
 *   h.settings()          读取设置（已合并默认值并校正范围）
 *   h.onSettings(fn)      设置页改动后回调
 *   h.stats() / h.saveStats(obj)
 *   h.load(name, d) / h.save(name, v)   游戏自己的存档，比如进行到一半的局面
 *   h.onPause(fn) / h.onResume(fn)   回到主屏幕 / 重新打开
 *   h.haptic()            轻微震动（支持的设备上）
 *   h.home()              回到主屏幕
 */
import { games } from '../registry.js';

const PREFIX = 'pp.';
const read = (k, d) => {
  try { const v = localStorage.getItem(PREFIX + k); return v == null ? d : JSON.parse(v); } catch { return d; }
};
const write = (k, v) => { try { localStorage.setItem(PREFIX + k, JSON.stringify(v)); } catch {} };

export const settingsKey = (id) => `game.${id}.settings`;
export const statsKey = (id) => `game.${id}.stats`;

/** 把存储的设置和默认值合并，并按 min/max 校正 */
export function resolveSettings(meta, stored = {}) {
  const s = {};
  for (const f of meta.settings || []) s[f.key] = stored[f.key] ?? f.default;
  for (const f of meta.settings || []) {
    if (f.options && !f.options.some((o) => o.value === s[f.key])) s[f.key] = f.default;   // color：存的值不在选项里就用默认
    if (f.type !== 'stepper') continue;
    const max = typeof f.max === 'function' ? f.max(s) : f.max;
    s[f.key] = Math.min(max, Math.max(f.min, Math.round(s[f.key])));
  }
  return s;
}

/** iframe 里拿不到刘海/底部的安全区域，从大厅那边量出来传进来 */
function syncSafeArea() {
  try {
    const dev = parent !== window && parent.document.getElementById('device');
    if (!dev) return;
    const probe = parent.document.createElement('div');
    probe.style.cssText = 'position:absolute;visibility:hidden;padding-top:var(--safe-t);padding-bottom:var(--safe-b)';
    dev.append(probe);
    const cs = parent.getComputedStyle(probe);
    document.documentElement.style.setProperty('--safe-t', cs.paddingTop);
    document.documentElement.style.setProperty('--safe-b', cs.paddingBottom);
    probe.remove();
  } catch {}
}

export function hub(id) {
  syncSafeArea();
  window.addEventListener('resize', syncSafeArea);
  const meta = games.find((g) => g.id === id);
  if (!meta) throw new Error(`registry.js 里没有 ${id}`);
  const listeners = { settings: [], pause: [], resume: [] };

  window.addEventListener('storage', (e) => {
    if (e.key === PREFIX + settingsKey(id)) listeners.settings.forEach((f) => f(api.settings()));
  });
  window.addEventListener('message', (e) => {
    if (e.origin !== location.origin) return;
    const t = e.data && e.data.type;
    if (t === 'pp:pause') listeners.pause.forEach((f) => f());
    if (t === 'pp:resume') listeners.resume.forEach((f) => f());
  });

  const api = {
    meta,
    settings: () => resolveSettings(meta, read(settingsKey(id), {})),
    onSettings: (f) => listeners.settings.push(f),
    stats: () => read(statsKey(id), {}),
    saveStats: (obj) => write(statsKey(id), obj),
    load: (name, d) => read(`game.${id}.${name}`, d),   // 游戏自己的存档（会跟着导出 / 导入）
    save: (name, v) => write(`game.${id}.${name}`, v),
    onPause: (f) => listeners.pause.push(f),
    onResume: (f) => listeners.resume.push(f),
    haptic: (ms = 8) => { try { navigator.vibrate && navigator.vibrate(ms); } catch {} },
    home: () => { try { parent.postMessage({ type: 'pp:home' }, location.origin); } catch {} }, // 回到主屏幕
  };
  return api;
}
