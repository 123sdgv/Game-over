// 壁纸：内置几张中性浅色壁纸 + 相册图片 + 模糊
import { store, files, emit } from './store.js';

const svg = (w, h, body) =>
  `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}' viewBox='0 0 ${w} ${h}'>${body}</svg>`)}")`;

function contour() {
  // 等高线：一组缓慢起伏的闭合曲线
  let paths = '';
  const cx = 300, cy = 520;
  for (let k = 1; k <= 22; k++) {
    let d = '';
    for (let i = 0; i <= 120; i++) {
      const a = (i / 120) * Math.PI * 2;
      const r = k * 26 * (1 + 0.09 * Math.sin(3 * a + k * 0.35) + 0.05 * Math.sin(5 * a - k * 0.2) + 0.03 * Math.cos(7 * a + k));
      d += `${i ? 'L' : 'M'}${(cx + r * Math.cos(a)).toFixed(1)} ${(cy + r * Math.sin(a) * 1.12).toFixed(1)}`;
    }
    paths += `<path d='${d}Z' fill='none' stroke='#1C1D20' stroke-opacity='${k % 5 === 0 ? 0.2 : 0.1}' stroke-width='${k % 5 === 0 ? 1.1 : 0.8}'/>`;
  }
  return svg(600, 1300, `<rect width='600' height='1300' fill='#F3F4F6'/>${paths}`);
}

function orbit() {
  let rings = '';
  for (let k = 1; k <= 9; k++) {
    rings += `<circle cx='520' cy='260' r='${k * 78}' fill='none' stroke='#1C1D20' stroke-opacity='${k === 4 ? 0.18 : 0.08}' stroke-width='1'/>`;
  }
  // 一颗绕着第四圈的小卫星
  rings += `<circle cx='${(520 + 312 * Math.cos(2.35)).toFixed(1)}' cy='${(260 + 312 * Math.sin(2.35)).toFixed(1)}' r='5' fill='#1C1D20' fill-opacity='.55'/>`;
  return svg(600, 1300, `<rect width='600' height='1300' fill='#F5F6F8'/>${rings}`);
}

export const WALLPAPERS = [
  { id: 'paper', name: '素白', css: () => '#F5F6F7' },
  {
    id: 'mist', name: '薄雾',
    css: () => 'radial-gradient(120% 70% at 15% 10%, #FFFFFF 0%, rgba(255,255,255,0) 55%), radial-gradient(90% 60% at 90% 95%, #D9DCE1 0%, rgba(217,220,225,0) 60%), #ECEEF1',
  },
  {
    id: 'grid', name: '栅格',
    css: () => 'linear-gradient(rgba(28,29,32,.055) 1px, transparent 1px) 0 0/24px 24px, linear-gradient(90deg, rgba(28,29,32,.055) 1px, transparent 1px) 0 0/24px 24px, radial-gradient(120% 80% at 50% 0%, #FAFBFC, #ECEEF1)',
  },
  {
    id: 'dots', name: '点阵',
    css: () => 'radial-gradient(circle, rgba(28,29,32,.16) 1.1px, transparent 1.4px) 0 0/16px 16px, #F4F5F7',
  },
  { id: 'contour', name: '等高线', css: () => `${contour()} center/cover` },
  { id: 'orbit', name: '轨道', css: () => `${orbit()} center/cover` },
];

export const DEFAULT_WALLPAPER = { id: 'grid', blur: 0 };
export const getWallpaper = () => ({ ...DEFAULT_WALLPAPER, ...store.get('wallpaper', {}) });

let customURL = null;
export async function customImageURL() {
  if (customURL) return customURL;
  const blob = await files.get('wallpaper');
  if (blob) customURL = URL.createObjectURL(blob);
  return customURL;
}

/** 生成某张壁纸的 CSS background */
export async function wallpaperCSS(id) {
  if (id === 'custom') {
    const u = await customImageURL();
    return u ? `url("${u}") center/cover no-repeat, #F5F6F7` : WALLPAPERS[0].css();
  }
  return (WALLPAPERS.find((w) => w.id === id) || WALLPAPERS[0]).css();
}

export async function applyWallpaper(el = document.getElementById('wallpaper')) {
  const w = getWallpaper();
  el.style.background = await wallpaperCSS(w.id);
  el.style.filter = w.blur ? `blur(${w.blur}px)` : '';
  el.style.transform = w.blur ? `scale(${1 + w.blur / 120})` : '';
}

export function setWallpaper(patch) {
  store.set('wallpaper', { ...getWallpaper(), ...patch });
  applyWallpaper();
  emit('wallpaper');
}

/** 把相册图片缩到合适大小再存，避免占太多空间 */
export async function setCustomImage(file) {
  const img = await new Promise((res, rej) => {
    const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = URL.createObjectURL(file);
  });
  const max = 1800;
  const k = Math.min(1, max / Math.max(img.width, img.height));
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  const blob = await new Promise((res) => c.toBlob(res, 'image/jpeg', 0.88));
  await files.set('wallpaper', blob);
  if (customURL) URL.revokeObjectURL(customURL);
  customURL = null;
  setWallpaper({ id: 'custom' });
}
