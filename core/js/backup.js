// 导出 / 导入 / 还原
import { store, files, PROTECTED, SECRET, blobToDataURL, dataURLToBlob } from './store.js';
import { alert, toast, h } from './ui.js';

const FORMAT = 'phone-in-phone';

export async function exportData() {
  const data = {};
  for (const k of store.keys()) if (!PROTECTED.includes(k) && !SECRET.includes(k)) data[k] = store.get(k);
  const img = await files.get('wallpaper');
  const payload = { format: FORMAT, version: 1, exportedAt: new Date().toISOString(), data, wallpaper: img ? await blobToDataURL(img) : null };
  const d = new Date();
  const name = `小手机备份-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}.json`;
  const file = new File([JSON.stringify(payload)], name, { type: 'application/json' });

  // 手机上优先用系统分享（可以存到"文件"或发给自己）
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: name }); toast('已导出'); return; }
    catch (e) { if (e.name === 'AbortError') return; }
  }
  const a = h('a', { href: URL.createObjectURL(file), download: name });
  document.body.append(a); a.click(); a.remove();
  toast('已导出');
}

export function importData() {
  const input = h('input', { type: 'file', accept: 'application/json,.json', style: { display: 'none' } });
  document.body.append(input);
  input.addEventListener('change', async () => {
    const f = input.files[0];
    input.remove();
    if (!f) return;
    let payload;
    try { payload = JSON.parse(await f.text()); } catch { payload = null; }
    if (!payload || payload.format !== FORMAT || typeof payload.data !== 'object') {
      await alert({ title: '无法导入', message: '这个文件不是小手机的备份。请选择从"导出数据"得到的 .json 文件。' });
      return;
    }
    const ok = await alert({
      title: '导入备份？',
      message: '当前的壁纸、主屏幕布局、图标和游戏记录会被备份里的内容替换。',
      buttons: [{ label: '取消', value: false }, { label: '导入', value: true, style: 'bold' }],
    });
    if (!ok) return;
    for (const k of store.keys()) if (!PROTECTED.includes(k) && !SECRET.includes(k)) store.del(k);
    for (const [k, v] of Object.entries(payload.data)) if (!PROTECTED.includes(k) && !SECRET.includes(k)) store.set(k, v);
    await files.del('wallpaper');
    if (payload.wallpaper) await files.set('wallpaper', await dataURLToBlob(payload.wallpaper));
    location.reload();
  });
  input.click();
}

export async function factoryReset() {
  const ok = await alert({
    title: '抹掉所有内容和设置？',
    message: '壁纸、主屏幕布局、图标和所有游戏记录都会被清除，恢复到第一次打开时的样子。防沉迷计时不受影响。',
    buttons: [{ label: '取消', value: false }, { label: '抹掉', value: true, style: 'danger' }],
  });
  if (!ok) return;
  for (const k of store.keys()) if (!PROTECTED.includes(k)) store.del(k);
  await files.clear();
  document.getElementById('device').classList.add('resetting');
  setTimeout(() => location.reload(), 700);
}
