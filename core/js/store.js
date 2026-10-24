// 本地存储：小数据放 localStorage，壁纸图片放 IndexedDB
const PREFIX = 'pp.';

// 这些键不参与导出 / 导入 / 还原（防沉迷不能被"还原"绕过）
export const PROTECTED = ['guard'];

export const store = {
  get(k, d) {
    try { const v = localStorage.getItem(PREFIX + k); return v == null ? d : JSON.parse(v); } catch { return d; }
  },
  set(k, v) {
    try { localStorage.setItem(PREFIX + k, JSON.stringify(v)); } catch (e) { console.warn('存储失败', e); }
  },
  del(k) { localStorage.removeItem(PREFIX + k); },
  keys() {
    return Object.keys(localStorage).filter((k) => k.startsWith(PREFIX)).map((k) => k.slice(PREFIX.length));
  },
};

let dbp;
function db() {
  return (dbp ||= new Promise((res, rej) => {
    const r = indexedDB.open('pp-files', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('files');
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  }));
}
function tx(mode, fn) {
  return db().then((d) => new Promise((res, rej) => {
    const t = d.transaction('files', mode);
    const req = fn(t.objectStore('files'));
    t.oncomplete = () => res(req && req.result);
    t.onerror = () => rej(t.error);
  }));
}
export const files = {
  get: (k) => tx('readonly', (s) => s.get(k)).then((v) => v ?? null),
  set: (k, v) => tx('readwrite', (s) => s.put(v, k)),
  del: (k) => tx('readwrite', (s) => s.delete(k)),
  clear: () => tx('readwrite', (s) => s.clear()),
};

// 简单的事件总线
const subs = {};
export const on = (ev, fn) => (subs[ev] ||= []).push(fn);
export const emit = (ev, data) => (subs[ev] || []).forEach((f) => f(data));

export const blobToDataURL = (b) => new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(b); });
export const dataURLToBlob = (u) => fetch(u).then((r) => r.blob());
