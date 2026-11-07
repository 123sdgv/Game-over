// 所有图标（一张 SVG 雪碧图，用 <use> 引用）、壁纸、图片文件里的画。全部原创。
import { P } from './state.js';

const D = `
<linearGradient id="g-case" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fbf8ef"/><stop offset="1" stop-color="#cfc6b1"/></linearGradient>
<linearGradient id="g-scr" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4a86e8"/><stop offset="1" stop-color="#0d2a74"/></linearGradient>
<linearGradient id="g-fold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe59a"/><stop offset="1" stop-color="#e9b440"/></linearGradient>
<linearGradient id="g-foldb" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f2c04e"/><stop offset="1" stop-color="#c98c1c"/></linearGradient>
<linearGradient id="g-paper" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#e4e7ee"/></linearGradient>
<linearGradient id="g-metal" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f1f3f6"/><stop offset="1" stop-color="#a3a9b4"/></linearGradient>
<linearGradient id="g-bin" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#c9d3dc"/><stop offset=".45" stop-color="#f4f8fb"/><stop offset="1" stop-color="#9aa8b6"/></linearGradient>
<linearGradient id="g-term" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#22408f"/><stop offset="1" stop-color="#0a1b48"/></linearGradient>
<linearGradient id="g-title" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#5b7fd6"/><stop offset="1" stop-color="#9ec2ff"/></linearGradient>
<linearGradient id="g-green" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6ee07c"/><stop offset="1" stop-color="#1f8a3a"/></linearGradient>
<linearGradient id="g-blue" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6aa3ff"/><stop offset="1" stop-color="#1c4fc4"/></linearGradient>
<linearGradient id="g-red" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff7a6e"/><stop offset="1" stop-color="#c3221a"/></linearGradient>
<linearGradient id="g-yel" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe47a"/><stop offset="1" stop-color="#e9a21a"/></linearGradient>
<linearGradient id="g-floppy" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4e6fbf"/><stop offset="1" stop-color="#22377a"/></linearGradient>
<radialGradient id="g-cd" cx=".38" cy=".35" r=".75"><stop offset="0" stop-color="#ffffff"/><stop offset=".35" stop-color="#cfe9ff"/><stop offset=".55" stop-color="#ffd7f1"/><stop offset=".72" stop-color="#e2ffd5"/><stop offset="1" stop-color="#aab4c4"/></radialGradient>
<radialGradient id="g-sun" cx=".4" cy=".35" r=".7"><stop offset="0" stop-color="#fff4b8"/><stop offset=".55" stop-color="#ffb43c"/><stop offset="1" stop-color="#f0662a"/></radialGradient>
`;

const PAGE = (inner, fold = '#cfd4dd') => `<path d="M7 2.5h13l6 6v21H7z" fill="url(#g-paper)" stroke="#5b6170" stroke-width="1"/><path d="M20 2.5v6h6" fill="${fold}" stroke="#5b6170" stroke-width="1" stroke-linejoin="round"/>${inner}`;

const SYM = {
  pc: `<rect x="4" y="3" width="24" height="18.5" rx="2" fill="url(#g-case)" stroke="#4a463d"/>
    <rect x="6.8" y="5.8" width="18.4" height="12.8" rx="1" fill="url(#g-scr)" stroke="#262626" stroke-width=".9"/>
    <path d="M7.6 6.6h10l-10 7.5z" fill="#fff" opacity=".2"/>
    <rect x="11.5" y="21.5" width="9" height="3" fill="#bcb39d" stroke="#4a463d" stroke-width=".8"/>
    <rect x="5.5" y="24.5" width="21" height="4.5" rx="1.2" fill="url(#g-case)" stroke="#4a463d"/>
    <rect x="21" y="26.2" width="3" height="1.2" rx=".5" fill="#3fbf5a"/>`,
  bin: `<path d="M8 8.5h16l-1.8 20.5H9.8z" fill="url(#g-bin)" stroke="#4f5b69"/>
    <path d="M11.5 11v15.5M16 11v16M20.5 11v15.5" stroke="#7d8b99" stroke-width="1.1" stroke-linecap="round"/>
    <ellipse cx="16" cy="8.5" rx="8.6" ry="2.2" fill="#dfe6ec" stroke="#4f5b69"/>
    <ellipse cx="16" cy="8.7" rx="6.4" ry="1.1" fill="#8d9aa8"/>`,
  binfull: `<path d="M8 8.5h16l-1.8 20.5H9.8z" fill="url(#g-bin)" stroke="#4f5b69"/>
    <path d="M11.5 11v15.5M16 11v16M20.5 11v15.5" stroke="#7d8b99" stroke-width="1.1" stroke-linecap="round"/>
    <path d="M10 8.6c0-4 3-6.5 6-5.6 1.5-2 5-1.6 6 .6 2 .5 2.4 3 1.6 5" fill="#fff" stroke="#5b6170"/>
    <path d="M13 7l2-2.2M17.5 5.5l2.4 1.6" stroke="#9aa3b1" stroke-width=".9"/>
    <ellipse cx="16" cy="8.5" rx="8.6" ry="2.2" fill="none" stroke="#4f5b69"/>`,
  folder: `<path d="M3 8.5c0-1 .7-1.7 1.7-1.7h7.2l2.4 2.6h13c1 0 1.7.7 1.7 1.7v15.6c0 1-.7 1.7-1.7 1.7H4.7c-1 0-1.7-.7-1.7-1.7z" fill="url(#g-foldb)" stroke="#8a5d0e"/>
    <path d="M3 13.2c0-1 .7-1.7 1.7-1.7h22.6c1 0 1.7.7 1.7 1.7v12.9c0 1-.7 1.7-1.7 1.7H4.7c-1 0-1.7-.7-1.7-1.7z" fill="url(#g-fold)" stroke="#8a5d0e"/>
    <path d="M4.5 13.4h23" stroke="#fff" stroke-width="1" opacity=".55"/>`,
  docs: `<path d="M3 8.5c0-1 .7-1.7 1.7-1.7h7.2l2.4 2.6h13c1 0 1.7.7 1.7 1.7v15.6c0 1-.7 1.7-1.7 1.7H4.7c-1 0-1.7-.7-1.7-1.7z" fill="url(#g-foldb)" stroke="#8a5d0e"/>
    <path d="M8 4.5h13l3 3v12H8z" fill="url(#g-paper)" stroke="#5b6170" stroke-width=".9"/><path d="M10.5 8.5h8M10.5 11h10M10.5 13.5h7" stroke="#6f86c9" stroke-width="1"/>
    <path d="M3 14.6c0-1 .7-1.7 1.7-1.7h22.6c1 0 1.7.7 1.7 1.7v11.5c0 1-.7 1.7-1.7 1.7H4.7c-1 0-1.7-.7-1.7-1.7z" fill="url(#g-fold)" stroke="#8a5d0e"/>
    <path d="M4.5 14.8h23" stroke="#fff" stroke-width="1" opacity=".55"/>`,
  mail: `<rect x="3" y="7" width="26" height="18" rx="1.5" fill="url(#g-paper)" stroke="#4a5160"/>
    <path d="M3.6 7.8l12.4 9.4 12.4-9.4" fill="none" stroke="#4a5160" stroke-width="1.1"/>
    <path d="M3.6 24.4l9-8M28.4 24.4l-9-8" stroke="#a7afbd" stroke-width="1"/>
    <rect x="21" y="9.5" width="5.5" height="6" fill="url(#g-red)" stroke="#7a1712" stroke-width=".7"/><path d="M22.2 12.5h3" stroke="#fff" stroke-width=".8" opacity=".8"/>`,
  term: `<rect x="2.5" y="4" width="27" height="24" rx="2" fill="url(#g-term)" stroke="#081233"/>
    <rect x="2.5" y="4" width="27" height="5" rx="2" fill="url(#g-title)"/><path d="M2.5 8.5h27" stroke="#081233" stroke-width=".8"/>
    <circle cx="25.5" cy="6.5" r="1" fill="#fff" opacity=".9"/>
    <path d="M7 13.5l4.5 3.3L7 20" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M13.5 21.2h7" stroke="#ffd34d" stroke-width="2.2" stroke-linecap="round"/>`,
  taskmgr: `<rect x="2.5" y="4" width="27" height="24" rx="2" fill="url(#g-metal)" stroke="#4f5562"/>
    <rect x="5.5" y="9" width="21" height="15.5" fill="#06140a" stroke="#2c3138" stroke-width=".8"/>
    <path d="M5.5 14h21M5.5 19h21M11 9v15.5M16.5 9v15.5M22 9v15.5" stroke="#1b4d25" stroke-width=".6"/>
    <path d="M6 21.5l3.5-2 3 1.2 3.5-6 3 3 3-5.5 4 2" fill="none" stroke="#5dff74" stroke-width="1.5" stroke-linejoin="round"/>
    <rect x="5.5" y="5.6" width="9" height="1.8" rx=".9" fill="#7f8796"/>`,
  control: `<rect x="3" y="4" width="26" height="24" rx="2.5" fill="url(#g-metal)" stroke="#4f5562"/>
    <path d="M9 9v15M16 9v15M23 9v15" stroke="#59606d" stroke-width="1.6" stroke-linecap="round"/>
    <rect x="6" y="17" width="6" height="4" rx="1" fill="url(#g-red)" stroke="#5a1410" stroke-width=".7"/>
    <rect x="13" y="11" width="6" height="4" rx="1" fill="url(#g-blue)" stroke="#12306f" stroke-width=".7"/>
    <rect x="20" y="15" width="6" height="4" rx="1" fill="url(#g-green)" stroke="#11521f" stroke-width=".7"/>`,
  drive: `<path d="M4 12l3-5h18l3 5z" fill="#e8ebef" stroke="#4f5562"/>
    <rect x="4" y="12" width="24" height="12" rx="1.5" fill="url(#g-metal)" stroke="#4f5562"/>
    <rect x="7" y="17" width="12" height="2" rx="1" fill="#6f7684"/><circle cx="23.5" cy="18" r="1.4" fill="#3fdc5f" stroke="#1b6a2c" stroke-width=".6"/>`,
  floppy: `<path d="M4 4h21l3 3v21H4z" fill="url(#g-floppy)" stroke="#121e45"/>
    <rect x="9" y="4" width="13" height="8" fill="url(#g-metal)" stroke="#3a4152" stroke-width=".8"/><rect x="17" y="5.5" width="3" height="5" fill="#3a4152"/>
    <rect x="7" y="16" width="18" height="12" fill="#f7f4ea" stroke="#8e8a7c" stroke-width=".7"/>
    <path d="M9 19.5h14M9 22.5h14M9 25.5h9" stroke="#e06a5a" stroke-width=".8"/>`,
  cd: `<circle cx="16" cy="16" r="12.5" fill="url(#g-cd)" stroke="#5b6170"/><circle cx="16" cy="16" r="3.2" fill="#fff" stroke="#5b6170"/><circle cx="16" cy="16" r="1.4" fill="#5b6170"/>
    <path d="M7.5 10.5a10 10 0 0 1 5-4.5" stroke="#fff" stroke-width="1.6" stroke-linecap="round" opacity=".8"/>`,
  printer: `<rect x="9" y="3" width="14" height="10" fill="url(#g-paper)" stroke="#5b6170"/>
    <path d="M11 6h10M11 8.5h8" stroke="#9aa3b1" stroke-width=".9"/>
    <rect x="3.5" y="11" width="25" height="11" rx="2" fill="url(#g-case)" stroke="#4a463d"/>
    <rect x="8" y="19" width="16" height="10" fill="url(#g-paper)" stroke="#5b6170"/><path d="M10 23h12M10 25.5h9" stroke="#9aa3b1" stroke-width=".9"/>
    <circle cx="24.5" cy="14.5" r="1.1" fill="#3fbf5a"/>`,
  warn: `<path d="M16 3.5l13.5 24H2.5z" fill="url(#g-yel)" stroke="#6b4a00" stroke-linejoin="round"/><path d="M16 11.5v8" stroke="#2a2000" stroke-width="2.8" stroke-linecap="round"/><circle cx="16" cy="23.5" r="1.7" fill="#2a2000"/>`,
  err: `<circle cx="16" cy="16" r="12.5" fill="url(#g-red)" stroke="#6b0f0a"/><path d="M11 11l10 10M21 11L11 21" stroke="#fff" stroke-width="3" stroke-linecap="round"/>`,
  info: `<circle cx="16" cy="16" r="12.5" fill="url(#g-blue)" stroke="#0f2a6b"/><circle cx="16" cy="9.6" r="1.9" fill="#fff"/><path d="M16 14v9" stroke="#fff" stroke-width="3" stroke-linecap="round"/>`,
  q: `<circle cx="16" cy="16" r="12.5" fill="url(#g-blue)" stroke="#0f2a6b"/><path d="M12.2 12.5c0-2.5 1.8-4 3.9-4s3.9 1.4 3.9 3.5c0 2.8-3.8 3-3.8 6" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/><circle cx="16.2" cy="23" r="1.7" fill="#fff"/>`,
  start: `<circle cx="16" cy="16" r="12" fill="url(#g-sun)"/><path d="M5.5 19h21M6.5 22.5h19M9 26h14" stroke="#fff" stroke-width="2" opacity=".85"/><circle cx="12.5" cy="11.5" r="3" fill="#fff" opacity=".45"/>`,
  bubble: `<path d="M5 6h22c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H13l-6 5v-5H5c-1.1 0-2-.9-2-2V8c0-1.1.9-2 2-2z" fill="url(#g-paper)" stroke="#4a5160"/><circle cx="11" cy="14" r="1.6" fill="#4a5160"/><circle cx="16" cy="14" r="1.6" fill="#4a5160"/><circle cx="21" cy="14" r="1.6" fill="#4a5160"/>`,
  hourglass: `<path d="M8 3h16M8 29h16" stroke="#4a3a1a" stroke-width="2.4" stroke-linecap="round"/><path d="M9.5 4c0 7 6.5 8 6.5 12s-6.5 5-6.5 12h13c0-7-6.5-8-6.5-12s6.5-5 6.5-12z" fill="#eef4fb" stroke="#4a5160"/><path d="M12 25.5c1-2.5 3-3.5 4-3.5s3 1 4 3.5zM12.5 8h7c-.8 2-2.6 3-3.5 4-.9-1-2.7-2-3.5-4z" fill="#e8b33b"/>`,
  note: `<path d="M5 4h22v18l-6 6H5z" fill="#ffe680" stroke="#8a6d10"/><path d="M27 22h-6v6" fill="#e9c74c" stroke="#8a6d10" stroke-linejoin="round"/><path d="M9 10h14M9 14h14M9 18h9" stroke="#b08a1a" stroke-width="1.2"/>`,
  // 文件
  f_txt: PAGE(`<path d="M10 12h12M10 15h12M10 18h12M10 21h8" stroke="#8d95a3" stroke-width="1.1"/>`),
  f_doc: PAGE(`<rect x="9.5" y="10" width="13" height="3.2" fill="url(#g-blue)"/><path d="M10 16h12M10 19h12M10 22h9" stroke="#7d8db3" stroke-width="1.1"/>`),
  f_xls: PAGE(`<rect x="9.5" y="11" width="13" height="13" fill="#eafbe9" stroke="#2c8a3e" stroke-width=".9"/><path d="M9.5 15.3h13M9.5 19.6h13M13.8 11v13M18.2 11v13" stroke="#2c8a3e" stroke-width=".8"/>`),
  f_ppt: PAGE(`<path d="M10 23V18M13.5 23v-8M17 23v-5M20.5 23v-9.5" stroke="#e37a2a" stroke-width="2.4"/><path d="M9.5 23.6h13" stroke="#8d95a3"/>`),
  f_jpg: PAGE(`<rect x="9" y="11" width="14" height="12" fill="#bfe1ff" stroke="#4a6fa8" stroke-width=".8"/><circle cx="19" cy="14.5" r="1.8" fill="#ffcf3f"/><path d="M9 23l4.5-6 3 3.5 2-2 4.5 4.5z" fill="#4caf63"/>`),
  f_mp3: PAGE(`<path d="M14 21.5v-9l7-1.8v9" fill="none" stroke="#8a4fd6" stroke-width="1.7"/><ellipse cx="12.6" cy="21.7" rx="2.2" ry="1.7" fill="#8a4fd6"/><ellipse cx="19.6" cy="19.9" rx="2.2" ry="1.7" fill="#8a4fd6"/>`),
  f_exe: `<rect x="4" y="6" width="24" height="20" rx="1.5" fill="url(#g-paper)" stroke="#4a5160"/><rect x="4" y="6" width="24" height="5" rx="1.5" fill="url(#g-blue)"/><path d="M4 11h24" stroke="#4a5160" stroke-width=".8"/><rect x="8" y="14.5" width="7" height="7" fill="#e9eef5" stroke="#8d95a3" stroke-width=".8"/><path d="M17.5 15.5h7M17.5 18h7M17.5 20.5h5" stroke="#8d95a3"/>`,
  f_dll: PAGE(`<circle cx="16" cy="18" r="4.2" fill="none" stroke="#6c7482" stroke-width="2.6" stroke-dasharray="2.2 1.1"/><circle cx="16" cy="18" r="1.6" fill="#6c7482"/>`),
  f_ttf: PAGE(`<path d="M11 24l5-13 5 13M12.8 19.5h6.4" fill="none" stroke="#c0392b" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`),
  f_log: PAGE(`<path d="M9.5 18h3.5l1.6-4 2.4 8 1.8-6 1.3 2h3" fill="none" stroke="#e0485a" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/><path d="M10 25h12" stroke="#c2c7d0"/>`),
  f_tmp: `<path d="M7 2.5h13l6 6v21H7z" fill="#f4f6f9" stroke="#8d95a3" stroke-dasharray="2 1.5"/><path d="M20 2.5v6h6" fill="none" stroke="#8d95a3" stroke-dasharray="2 1.5"/><text x="16.5" y="21.5" font-size="8" font-family="monospace" text-anchor="middle" fill="#8d95a3">~</text>`,
  f_idx: PAGE(`<circle cx="15" cy="16.5" r="3.6" fill="#dff0ff" stroke="#3a6ab8" stroke-width="1.5"/><path d="M17.6 19.2l3.6 3.6" stroke="#3a6ab8" stroke-width="2" stroke-linecap="round"/>`),
  f_dat: PAGE(`<g fill="#7a8292"><rect x="10" y="11" width="2" height="2"/><rect x="14" y="11" width="2" height="2"/><rect x="20" y="11" width="2" height="2"/><rect x="12" y="15" width="2" height="2"/><rect x="18" y="15" width="2" height="2"/><rect x="10" y="19" width="2" height="2"/><rect x="16" y="19" width="2" height="2"/><rect x="20" y="19" width="2" height="2"/><rect x="14" y="23" width="2" height="2"/></g>`),
  f_cab: `<path d="M5 11l11-5 11 5v13l-11 5-11-5z" fill="#d9b27a" stroke="#6b4a1e"/><path d="M5 11l11 5 11-5M16 16v13" fill="none" stroke="#6b4a1e"/><path d="M10.5 8.5l11 5" stroke="#f3e2c2" stroke-width="2.2"/>`,
};

export function sprite() {
  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0" style="position:absolute;width:0;height:0" aria-hidden="true"><defs>${D}</defs>`;
  for (const [k, v] of Object.entries(SYM)) s += `<symbol id="i-${k}" viewBox="0 0 32 32">${v}</symbol>`;
  return s + '</svg>';
}

/** 一个图标的 SVG 字符串 */
export const icon = (name, cls = '') => `<svg class="ic ${cls}" viewBox="0 0 32 32" aria-hidden="true"><use href="#i-${name}"/></svg>`;

const EXT = { txt: 'f_txt', doc: 'f_doc', xls: 'f_xls', ppt: 'f_ppt', jpg: 'f_jpg', bmp: 'f_jpg', mp3: 'f_mp3', exe: 'f_exe', dll: 'f_dll', vxd: 'f_dll', ttf: 'f_ttf', log: 'f_log', tmp: 'f_tmp', idx: 'f_idx', dat: 'f_dat', cab: 'f_cab' };
export function nodeIcon(n) {
  if (!n) return 'f_txt';
  if (n.t === 'd') {
    if (n.id === 'C') return 'drive';
    if (n.id === 'A') return 'floppy';
    if (n.id === 'bin') return 'bin';
    if (n.id === 'docs') return 'docs';
    return 'folder';
  }
  return EXT[n.ext] || 'f_txt';
}

/* ─────────── 壁纸 ─────────── */
export const WALLS = [
  { id: 'teal', name: '纯色' },
  { id: 'clouds', name: '云' },
  { id: 'dusk', name: '黄昏' },
  { id: 'grid', name: '格子' },
  { id: 'stars', name: '星空' },
  { id: 'dots', name: '波点' },
  { id: 'waves', name: '波浪' },
];
export const WALL_COLORS = ['#2f7480', '#3d5a99', '#5b4a7a', '#7a4a5a', '#3f6b4a', '#8a7a5a', '#2b2d33', '#a3a7ae'];

function seeded(seed) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 100000) / 100000; };
}
function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  if (k > 0) { r += (255 - r) * k; g += (255 - g) * k; b += (255 - b) * k; } else { r *= 1 + k; g *= 1 + k; b *= 1 + k; }
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}

const wallCache = new Map();
/** 画一张壁纸，返回 dataURL（按尺寸缓存） */
export function wallpaper(id, w, h, color = P.wallColor) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const W = Math.max(64, Math.round(w * dpr)), H = Math.max(64, Math.round(h * dpr));
  const key = `${id}|${W}|${H}|${color}`;
  if (wallCache.has(key)) return wallCache.get(key);
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const c = cv.getContext('2d');
  const R = seeded(7 + id.length * 131);
  if (id === 'teal') {
    const g = c.createRadialGradient(W * 0.5, H * 0.42, 0, W * 0.5, H * 0.5, Math.max(W, H) * 0.75);
    g.addColorStop(0, shade(color, 0.1)); g.addColorStop(1, shade(color, -0.22));
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    // 很淡的颗粒，像老显示器
    const img = c.getImageData(0, 0, W, H), d = img.data;
    for (let i = 0; i < d.length; i += 4) { const n = (R() - 0.5) * 9; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
    c.putImageData(img, 0, 0);
  } else if (id === 'clouds') {
    const g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#3f7fd9'); g.addColorStop(0.55, '#8fc1f2'); g.addColorStop(1, '#d9ecfb');
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    for (let k = 0; k < 14; k++) {
      const cx = R() * W, cy = H * (0.15 + R() * 0.75), s = (0.06 + R() * 0.1) * W;
      for (let j = 0; j < 7; j++) {
        const rx = cx + (R() - 0.5) * s * 1.8, ry = cy + (R() - 0.5) * s * 0.35, rr = s * (0.35 + R() * 0.4);
        const cg = c.createRadialGradient(rx, ry - rr * 0.3, 0, rx, ry, rr);
        cg.addColorStop(0, 'rgba(255,255,255,.85)'); cg.addColorStop(0.6, 'rgba(255,255,255,.35)'); cg.addColorStop(1, 'rgba(255,255,255,0)');
        c.fillStyle = cg; c.beginPath(); c.arc(rx, ry, rr, 0, Math.PI * 2); c.fill();
      }
    }
  } else if (id === 'dusk') {
    const g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#2b2a5a'); g.addColorStop(0.45, '#a3557a'); g.addColorStop(0.75, '#f39a6b'); g.addColorStop(1, '#ffd59a');
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    const sx = W * 0.68, sy = H * 0.78, sr = Math.min(W, H) * 0.16;
    const sg = c.createRadialGradient(sx, sy, 0, sx, sy, sr * 2.4);
    sg.addColorStop(0, 'rgba(255,240,200,.9)'); sg.addColorStop(0.4, 'rgba(255,190,120,.35)'); sg.addColorStop(1, 'rgba(255,190,120,0)');
    c.fillStyle = sg; c.fillRect(0, 0, W, H);
    c.fillStyle = '#fff3d6'; c.beginPath(); c.arc(sx, sy, sr, 0, Math.PI * 2); c.fill();
    c.fillStyle = 'rgba(80,40,80,.85)';
    for (let i = 0; i < 6; i++) c.fillRect(sx - sr * 1.2, sy - sr * 0.1 + i * sr * 0.22, sr * 2.4, sr * 0.06 + i * sr * 0.02);
    // 远山
    c.fillStyle = '#3a2a4f';
    c.beginPath(); c.moveTo(0, H);
    for (let x = 0; x <= W; x += W / 40) c.lineTo(x, H * 0.86 - Math.sin(x / W * 7 + 1) * H * 0.04 - Math.sin(x / W * 19) * H * 0.015);
    c.lineTo(W, H); c.fill();
  } else if (id === 'grid') {
    c.fillStyle = shade(color, 0.05); c.fillRect(0, 0, W, H);
    const s = Math.round(18 * dpr);
    c.fillStyle = shade(color, -0.08);
    for (let y = 0; y < H; y += s) for (let x = ((y / s) % 2) * s; x < W; x += s * 2) c.fillRect(x, y, s, s);
    c.strokeStyle = 'rgba(255,255,255,.08)'; c.lineWidth = 1;
    for (let x = 0; x < W; x += s) { c.beginPath(); c.moveTo(x + 0.5, 0); c.lineTo(x + 0.5, H); c.stroke(); }
  } else if (id === 'stars') {
    const g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#05060f'); g.addColorStop(1, '#1b1f45');
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    for (let i = 0; i < W * H / 900; i++) {
      const x = R() * W, y = R() * H, b = R();
      c.fillStyle = `rgba(255,255,255,${0.25 + b * 0.75})`;
      const s = b > 0.96 ? 2 * dpr : dpr;
      c.fillRect(x | 0, y | 0, s, s);
      if (b > 0.985) { c.fillStyle = 'rgba(200,220,255,.4)'; c.fillRect((x - 2 * dpr) | 0, y | 0, 5 * dpr, dpr / 1.5); c.fillRect(x | 0, (y - 2 * dpr) | 0, dpr / 1.5, 5 * dpr); }
    }
  } else if (id === 'dots') {
    c.fillStyle = '#f6e7d8'; c.fillRect(0, 0, W, H);
    const s = 26 * dpr;
    const cols = ['#f2a7a0', '#9cc7e8', '#f6d27a', '#a8d8a8'];
    let k = 0;
    for (let y = 0; y < H + s; y += s) for (let x = ((y / s) % 2) * (s / 2); x < W + s; x += s) {
      c.fillStyle = cols[k++ % cols.length];
      c.beginPath(); c.arc(x, y, 5 * dpr, 0, Math.PI * 2); c.fill();
    }
  } else if (id === 'waves') {
    const g = c.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, '#1f3b6b'); g.addColorStop(1, '#3b8a9a');
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    for (let i = 0; i < 14; i++) {
      c.strokeStyle = `rgba(255,255,255,${0.04 + (i % 3) * 0.03})`;
      c.lineWidth = (2 + (i % 4)) * dpr;
      c.beginPath();
      for (let x = 0; x <= W; x += 6) {
        const y = H * (i / 13) + Math.sin(x / W * 6 + i * 0.7) * H * 0.05 + Math.sin(x / W * 13 + i) * H * 0.012;
        x ? c.lineTo(x, y) : c.moveTo(x, y);
      }
      c.stroke();
    }
  }
  const url = cv.toDataURL('image/jpeg', 0.9);
  wallCache.set(key, url);
  if (wallCache.size > 24) wallCache.delete(wallCache.keys().next().value);
  return url;
}

/** 它改的壁纸：黑底大字 */
export function daemonWall(w, h, text) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const W = Math.round(w * dpr), H = Math.round(h * dpr);
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const c = cv.getContext('2d');
  c.fillStyle = '#0c0e14'; c.fillRect(0, 0, W, H);
  c.fillStyle = 'rgba(255,255,255,.04)';
  for (let y = 0; y < H; y += 3 * dpr) c.fillRect(0, y, W, dpr);
  const lines = text.split('\n');
  const fs = Math.min(W / 18, H / (lines.length * 2.2));
  c.font = `700 ${fs}px "SF Mono", Menlo, Consolas, monospace`;
  c.textAlign = 'center'; c.textBaseline = 'middle';
  lines.forEach((l, i) => {
    const y = H / 2 + (i - (lines.length - 1) / 2) * fs * 1.5;
    c.fillStyle = 'rgba(255,90,140,.25)'; c.fillText(l, W / 2 + 2 * dpr, y + 2 * dpr);
    c.fillStyle = i === 1 ? '#ff6fa0' : '#e9eef7'; c.fillText(l, W / 2, y);
  });
  return cv.toDataURL('image/jpeg', 0.9);
}

/* ─────────── 图片文件里的画（按名字生成，每次一样） ─────────── */
export function picture(name, w = 240, h = 180) {
  let seed = 0;
  for (const ch of name) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
  const R = seeded(seed);
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const c = cv.getContext('2d');
  const kind = /猫|cat/i.test(name) ? 'cat' : /照|合影|聚餐/.test(name) ? 'people' : /截图/.test(name) ? 'shot' : ['land', 'flower', 'sea'][seed % 3];
  if (kind === 'cat') {
    c.fillStyle = '#f4e3cf'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#e7cfb3'; c.fillRect(0, h * 0.72, w, h);
    const cx = w / 2, cy = h * 0.55, r = h * 0.26;
    c.fillStyle = ['#f0a24a', '#5b5b63', '#e9e4dc'][seed % 3];
    c.beginPath(); c.moveTo(cx - r * 0.9, cy - r * 0.4); c.lineTo(cx - r * 0.75, cy - r * 1.35); c.lineTo(cx - r * 0.2, cy - r * 0.85); c.fill();
    c.beginPath(); c.moveTo(cx + r * 0.9, cy - r * 0.4); c.lineTo(cx + r * 0.75, cy - r * 1.35); c.lineTo(cx + r * 0.2, cy - r * 0.85); c.fill();
    c.beginPath(); c.ellipse(cx, cy, r * 1.05, r * 0.9, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#2a2a2a';
    c.beginPath(); c.ellipse(cx - r * 0.38, cy - r * 0.05, r * 0.1, r * 0.16, 0, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.ellipse(cx + r * 0.38, cy - r * 0.05, r * 0.1, r * 0.16, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#e88a9a'; c.beginPath(); c.moveTo(cx - r * 0.08, cy + r * 0.18); c.lineTo(cx + r * 0.08, cy + r * 0.18); c.lineTo(cx, cy + r * 0.28); c.fill();
    c.strokeStyle = '#2a2a2a'; c.lineWidth = 1.5;
    for (const s of [-1, 1]) for (const k of [-1, 0, 1]) { c.beginPath(); c.moveTo(cx + s * r * 0.3, cy + r * 0.3); c.lineTo(cx + s * r * 1.1, cy + r * (0.22 + k * 0.12)); c.stroke(); }
  } else if (kind === 'people') {
    const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#cfe4f7'); g.addColorStop(1, '#f2efe6');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    const n = 3 + (seed % 3);
    for (let i = 0; i < n; i++) {
      const x = w * (i + 0.5) / n, y = h * 0.62 + (R() - 0.5) * 8;
      c.fillStyle = ['#2f4a7a', '#7a2f4a', '#3f6b4a', '#6b5a2f', '#4a4a5a'][i % 5];
      c.beginPath(); c.ellipse(x, y + h * 0.28, w / n * 0.36, h * 0.3, 0, Math.PI, 0); c.fill();
      c.fillStyle = '#f2c9a0'; c.beginPath(); c.arc(x, y - h * 0.02, h * 0.1, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#2a2220'; c.beginPath(); c.arc(x, y - h * 0.06, h * 0.1, Math.PI, 0); c.fill();
    }
  } else if (kind === 'shot') {
    c.fillStyle = '#2f7480'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#c8c6c0'; c.fillRect(w * 0.12, h * 0.14, w * 0.7, h * 0.66);
    c.fillStyle = '#16388a'; c.fillRect(w * 0.12, h * 0.14, w * 0.7, h * 0.08);
    c.fillStyle = '#fff'; c.fillRect(w * 0.15, h * 0.27, w * 0.64, h * 0.48);
    c.fillStyle = '#c0392b'; for (let i = 0; i < 5; i++) c.fillRect(w * 0.18, h * (0.32 + i * 0.08), w * (0.2 + R() * 0.38), h * 0.03);
  } else {
    const g = c.createLinearGradient(0, 0, 0, h);
    if (kind === 'sea') { g.addColorStop(0, '#7fb6ea'); g.addColorStop(0.55, '#d9ecf8'); g.addColorStop(0.56, '#2f7fb3'); g.addColorStop(1, '#1d4f7a'); }
    else { g.addColorStop(0, '#8cc3f0'); g.addColorStop(1, '#e8f3fb'); }
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    c.fillStyle = '#fff2b0'; c.beginPath(); c.arc(w * (0.2 + R() * 0.6), h * 0.25, h * 0.08, 0, Math.PI * 2); c.fill();
    if (kind === 'land') {
      for (let k = 0; k < 3; k++) {
        c.fillStyle = ['#6f9f6a', '#4f8a55', '#2f6b3f'][k];
        c.beginPath(); c.moveTo(0, h);
        for (let x = 0; x <= w; x += 8) c.lineTo(x, h * (0.5 + k * 0.13) - Math.sin(x / w * (3 + k) + seed % 7 + k) * h * 0.08);
        c.lineTo(w, h); c.fill();
      }
    } else if (kind === 'flower') {
      c.fillStyle = '#6fae5a'; c.fillRect(0, h * 0.7, w, h);
      for (let i = 0; i < 9; i++) {
        const x = R() * w, y = h * (0.62 + R() * 0.3), r = 5 + R() * 6;
        c.strokeStyle = '#3f7a35'; c.lineWidth = 2; c.beginPath(); c.moveTo(x, y); c.lineTo(x, h); c.stroke();
        c.fillStyle = ['#f27a8a', '#f6c94a', '#c98af0', '#fff'][i % 4];
        for (let a = 0; a < 5; a++) { c.beginPath(); c.arc(x + Math.cos(a * 1.257) * r * 0.7, y + Math.sin(a * 1.257) * r * 0.7, r * 0.55, 0, Math.PI * 2); c.fill(); }
        c.fillStyle = '#f2a53a'; c.beginPath(); c.arc(x, y, r * 0.35, 0, Math.PI * 2); c.fill();
      }
    } else {
      c.strokeStyle = 'rgba(255,255,255,.5)'; c.lineWidth = 1.5;
      for (let i = 0; i < 8; i++) { const y = h * (0.6 + i * 0.05); c.beginPath(); c.moveTo(R() * w * 0.4, y); c.lineTo(w * (0.5 + R() * 0.5), y); c.stroke(); }
    }
  }
  return cv;
}
