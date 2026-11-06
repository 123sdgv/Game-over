// 图片、表情包、聊天背景存在 IndexedDB（和大厅的壁纸同一个库 pp-files，键前缀 chat.m.），
// 「抹掉所有内容」会一起清掉；导出备份只带 localStorage，所以这些不跟着导出。
const PFX = 'chat.m.';
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

const urls = new Map(); // id → Promise<string|null>

export const media = {
  async put(id, blob) {
    await tx('readwrite', (s) => s.put(blob, PFX + id));
    urls.delete(id);
  },
  async del(id) {
    const u = urls.get(id);
    urls.delete(id);
    if (u) u.then((x) => x && URL.revokeObjectURL(x));
    try { await tx('readwrite', (s) => s.delete(PFX + id)); } catch {}
  },
  /** 对象 URL（缓存着，同一张图只读一次） */
  url(id) {
    if (!id) return Promise.resolve(null);
    if (!urls.has(id)) {
      urls.set(id, tx('readonly', (s) => s.get(PFX + id))
        .then((b) => (b ? URL.createObjectURL(b) : null))
        .catch(() => null));
    }
    return urls.get(id);
  },
};

export async function loadImage(file) {
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.decoding = 'async';
  img.src = url;
  try { await img.decode(); } catch { await new Promise((r) => { if (img.complete) r(); else { img.onload = r; img.onerror = r; } }); }
  return { img, url, w: img.naturalWidth, h: img.naturalHeight };
}

/** 缩小图片：长边不超过 max。keepAnim：小一点的 GIF 原样保留（动图表情包） */
export async function shrink(file, { max = 1280, type = 'image/jpeg', q = 0.84, keepAnim = false } = {}) {
  const { img, url, w, h } = await loadImage(file);
  try {
    if (!w || !h) throw new Error('bad image');
    if (keepAnim && file.type === 'image/gif' && file.size < 4e6) return { blob: file, w, h };
    const k = Math.min(1, max / Math.max(w, h));
    if (k === 1 && file.size < 500e3 && /^image\/(jpeg|png|webp|gif)$/.test(file.type)) return { blob: file, w, h };
    const cw = Math.max(1, Math.round(w * k)), ch = Math.max(1, Math.round(h * k));
    const c = document.createElement('canvas');
    c.width = cw; c.height = ch;
    const g = c.getContext('2d');
    if (type === 'image/jpeg') { g.fillStyle = '#fff'; g.fillRect(0, 0, cw, ch); }
    g.imageSmoothingQuality = 'high';
    g.drawImage(img, 0, 0, cw, ch);
    const blob = await new Promise((r) => c.toBlob(r, type, q));
    if (!blob) throw new Error('encode failed');
    return { blob, w: cw, h: ch };
  } finally {
    URL.revokeObjectURL(url);
  }
}

// 选文件：input 要一直在页面里，并且 click() 必须在点按的同一个事件里调用（iOS 的要求）
let input;
export function pickFiles({ multiple = false } = {}) {
  if (!input) {
    input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.style.cssText = 'position:fixed;left:-100px;top:0;width:1px;height:1px;opacity:0';
    document.body.append(input);
  }
  input.multiple = multiple;
  input.value = '';
  return new Promise((res) => {
    input.onchange = () => res([...(input.files || [])]);
    input.click();
  });
}
