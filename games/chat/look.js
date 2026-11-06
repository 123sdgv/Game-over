// 头像（含挂件、群头像拼图）、聊天背景、气泡花样、字体效果
import { PALETTE, hashColor, initial } from './data.js';
import { media } from './media.js';

export function avatarEl(p, cls = '', { frame = false } = {}) {
  const el = document.createElement('div');
  el.className = 'av ' + cls;
  setAvatar(el, p, { frame });
  return el;
}

export function setAvatar(el, p, { frame = false } = {}) {
  const av = (p && p.av) || {};
  if (av.img) {
    el.classList.add('img');
    el.textContent = '';
    el.style.backgroundImage = `url("${av.img}")`;
  } else {
    el.classList.remove('img');
    const [a, b] = PALETTE[(av.c ?? hashColor(p && p.name)) % PALETTE.length];
    el.style.backgroundImage = `linear-gradient(155deg, ${a}, ${b})`;
    el.textContent = initial(p && p.name);
  }
  if (frame && p && p.frame && p.frame.id) el.append(pendantEl(p.frame));
}

/** 群头像：上传了就用上传的，没有就把成员头像拼成宫格 */
export function groupAvatarEl(c, cls = '') {
  if (c.left.av && c.left.av.img) { const el = avatarEl(c.left, cls); el.classList.add('grp'); return el; }
  const el = document.createElement('div');
  el.className = 'av grp collage ' + cls;
  const ms = c.members.slice(0, 9);
  el.dataset.n = ms.length <= 4 ? 2 : 3;
  for (const m of ms) {
    const cell = document.createElement('i');
    const av = m.av || {};
    if (av.img) cell.style.backgroundImage = `url("${av.img}")`;
    else {
      const [a, b] = PALETTE[(av.c ?? hashColor(m.name)) % PALETTE.length];
      cell.style.backgroundImage = `linear-gradient(155deg, ${a}, ${b})`;
      cell.textContent = initial(m.name);
    }
    el.append(cell);
  }
  return el;
}

// ---------- 头像挂件（全部原创；坐标系：头像是 0..100 的圆，挂件画在 -30..130 里） ----------
const svg = (body) => `<svg class="pend-svg" viewBox="-30 -30 160 160" aria-hidden="true">${body}</svg>`;
const star4 = (x, y, r, fill) => `<path d="M${x} ${y - r}C${x + r * .18} ${y - r * .18} ${x + r * .18} ${y - r * .18} ${x + r} ${y}C${x + r * .18} ${y + r * .18} ${x + r * .18} ${y + r * .18} ${x} ${y + r}C${x - r * .18} ${y + r * .18} ${x - r * .18} ${y + r * .18} ${x - r} ${y}C${x - r * .18} ${y - r * .18} ${x - r * .18} ${y - r * .18} ${x} ${y - r}Z" fill="${fill}"/>`;
const heart = (x, y, r, fill) => `<path d="M${x} ${y + r * .9}C${x - r * 1.6} ${y - r * .1} ${x - r * .9} ${y - r * 1.3} ${x} ${y - r * .45}C${x + r * .9} ${y - r * 1.3} ${x + r * 1.6} ${y - r * .1} ${x} ${y + r * .9}Z" fill="${fill}" stroke="#fff" stroke-width="1.6"/>`;

export const PENDANTS = [
  { id: 'cat', name: '猫耳', art: svg(`
    <path d="M10 26 18 -12 44 8Z" fill="#33333B" stroke="#fff" stroke-width="3" stroke-linejoin="round"/>
    <path d="M90 26 82 -12 56 8Z" fill="#33333B" stroke="#fff" stroke-width="3" stroke-linejoin="round"/>
    <path d="M17 17 21 -2 34 9Z" fill="#FF9DB5"/><path d="M83 17 79 -2 66 9Z" fill="#FF9DB5"/>`) },
  { id: 'bunny', name: '兔耳', art: svg(`
    <g transform="rotate(-14 30 0)"><ellipse cx="30" cy="-6" rx="11" ry="27" fill="#fff" stroke="#E8CBD6" stroke-width="2"/><ellipse cx="30" cy="-4" rx="5" ry="19" fill="#FFC2D3"/></g>
    <g transform="rotate(14 70 0)"><ellipse cx="70" cy="-6" rx="11" ry="27" fill="#fff" stroke="#E8CBD6" stroke-width="2"/><ellipse cx="70" cy="-4" rx="5" ry="19" fill="#FFC2D3"/></g>`) },
  { id: 'crown', name: '小皇冠', art: svg(`
    <g transform="rotate(18 74 2)"><path d="M54 14 52 -8 63 2 74 -14 85 2 96 -8 94 14Z" fill="#FFCB3D" stroke="#C98A12" stroke-width="2.4" stroke-linejoin="round"/>
    <rect x="53" y="12" width="42" height="6" rx="2" fill="#F5A912" stroke="#C98A12" stroke-width="2"/>
    <circle cx="74" cy="6" r="3.4" fill="#FF5577"/><circle cx="62" cy="8" r="2.2" fill="#5AB6FF"/><circle cx="86" cy="8" r="2.2" fill="#5AB6FF"/></g>`) },
  { id: 'horns', name: '小恶魔', art: svg(`
    <path d="M18 18C8 6 8 -8 14 -16 18 -4 26 4 34 8Z" fill="#E8344E" stroke="#fff" stroke-width="2.6" stroke-linejoin="round"/>
    <path d="M82 18C92 6 92 -8 86 -16 82 -4 74 4 66 8Z" fill="#E8344E" stroke="#fff" stroke-width="2.6" stroke-linejoin="round"/>
    <path d="M104 88c10 4 14 12 10 20l-5-6-4 7c-1-8 0-14-1-21Z" fill="#E8344E" stroke="#fff" stroke-width="2"/>`) },
  { id: 'halo', name: '光环', art: svg(`
    <ellipse cx="50" cy="-12" rx="30" ry="8" fill="none" stroke="#FFE27A" stroke-width="9" opacity=".45"/>
    <ellipse cx="50" cy="-12" rx="30" ry="8" fill="none" stroke="#F6C232" stroke-width="4.5"/>`) },
  { id: 'wreath', name: '花环', art: svg(`
    <circle cx="50" cy="50" r="54" fill="none" stroke="#7CC48A" stroke-width="3" stroke-dasharray="2 9" stroke-linecap="round"/>
    ${[200, 240, 280, 320, 20, 60].map((a, i) => { const r = 54, x = 50 + r * Math.cos(a * Math.PI / 180), y = 50 + r * Math.sin(a * Math.PI / 180); const c = ['#FF8FB1', '#FFD166', '#FFFFFF', '#FF8FB1', '#B8A6FF', '#FFD166'][i]; return `<g><circle cx="${x}" cy="${y}" r="7" fill="${c}" stroke="#E7A0B5" stroke-width="1.4"/><circle cx="${x}" cy="${y}" r="2.6" fill="#F7B733"/></g>`; }).join('')}
    ${[220, 300, 40].map((a) => { const x = 50 + 56 * Math.cos(a * Math.PI / 180), y = 50 + 56 * Math.sin(a * Math.PI / 180); return `<ellipse cx="${x}" cy="${y}" rx="8" ry="3.6" fill="#62B576" transform="rotate(${a + 90} ${x} ${y})"/>`; }).join('')}`) },
  { id: 'sparkle', name: '星光', art: svg(`${star4(104, -2, 13, '#FFD34D')}${star4(-10, 88, 9, '#9BD3FF')}${star4(-14, 22, 6, '#FFB3CF')}${star4(112, 74, 6, '#FFB3CF')}${star4(84, -20, 5, '#9BD3FF')}`) },
  { id: 'hearts', name: '爱心', art: svg(`
    <circle cx="50" cy="50" r="54" fill="none" stroke="#FF8FB1" stroke-width="4"/>
    ${heart(98, 2, 11, '#FF5C8A')}${heart(-2, 86, 8, '#FF8FB1')}${heart(4, 4, 6, '#FFB3CF')}`) },
  { id: 'wings', name: '翅膀', art: svg(`
    <path d="M2 40C-14 30-28 34-28 46c6-2 10 0 12 4-8 0-12 4-12 10 6-2 11-1 14 3-6 2-8 7-6 12 10-6 18-8 26-8Z" fill="#fff" stroke="#F2B6CB" stroke-width="2.2" stroke-linejoin="round"/>
    <path d="M98 40c16-10 30-6 30 6-6-2-10 0-12 4 8 0 12 4 12 10-6-2-11-1-14 3 6 2 8 7 6 12-10-6-18-8-26-8Z" fill="#fff" stroke="#F2B6CB" stroke-width="2.2" stroke-linejoin="round"/>`) },
  { id: 'phones', name: '耳机', art: svg(`
    <path d="M4 54C4 14 24 -6 50 -6S96 14 96 54" fill="none" stroke="#3A3F4B" stroke-width="7" stroke-linecap="round"/>
    <rect x="-8" y="40" width="18" height="30" rx="8" fill="#FF6FA0" stroke="#3A3F4B" stroke-width="3"/>
    <rect x="90" y="40" width="18" height="30" rx="8" fill="#FF6FA0" stroke="#3A3F4B" stroke-width="3"/>`) },
  { id: 'ring', name: '彩环', art: svg(`
    <defs><linearGradient id="pend-ring" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FF7AA8"/><stop offset=".35" stop-color="#FFC861"/><stop offset=".7" stop-color="#5FD3B5"/><stop offset="1" stop-color="#6F8BFF"/></linearGradient></defs>
    <circle cx="50" cy="50" r="54.5" fill="none" stroke="url(#pend-ring)" stroke-width="5.5"/>`) },
  { id: 'bubble', name: '小气泡', text: '陪我。' },
  { id: 'tag', name: '名牌', text: '妈妈' },
  { id: 'banner', name: '横幅', text: '没有你活不了' },
];

export function pendantEl(frame) {
  const d = PENDANTS.find((x) => x.id === frame.id);
  const el = document.createElement('span');
  el.className = 'pend pend-' + (d ? d.id : 'none');
  if (!d) return el;
  if (d.art) el.innerHTML = d.art;
  else {
    const t = document.createElement('b');
    t.textContent = (frame.text || d.text || '').slice(0, 12);
    el.append(t);
  }
  return el;
}

// ---------- 聊天背景 ----------
/** 内置背景（样子在 style.css 的 .wall[data-wall=...]），深色模式下各自有一套暗的 */
export const WALLS = [
  { id: 'none', name: '纯白' },
  { id: 'mist', name: '晴空' },
  { id: 'dots', name: '圆点' },
  { id: 'peach', name: '暖阳' },
  { id: 'grid', name: '格纸' },
  { id: 'dusk', name: '暮色' },
];
/** 这些背景比较深或者是照片，时间小字要加底 */
export const isLoud = (spec) => spec === 'dusk' || (spec && typeof spec === 'object');

export function applyWall(el, spec) {
  const id = spec && typeof spec === 'object' ? 'photo' : WALLS.some((w) => w.id === spec) ? spec : 'none';
  el.dataset.wall = id;
  el.style.backgroundImage = '';
  if (id === 'photo') {
    const token = (el._wallToken = {});
    media.url(spec.img).then((u) => {
      if (el._wallToken !== token) return;
      if (u) el.style.backgroundImage = `url("${u}")`;
      else el.dataset.wall = 'none';
    });
  }
}

// ---------- 气泡花样（每段对话自己选；样子全在 style.css 的 [data-bub=...]） ----------
export const BUBBLES = [
  { id: 'classic', name: '默认' },
  { id: 'mono', name: '纯黑' },
  { id: 'soft', name: '灰白' },
  { id: 'gold', name: '黑金' },
  { id: 'redblack', name: '黑红' },
  { id: 'cream', name: '奶油' },
  { id: 'mint', name: '薄荷' },
  { id: 'bunny', name: '粉兔' },
  { id: 'sprout', name: '发芽' },
  { id: 'cloud', name: '云朵' },
  { id: 'cat', name: '猫耳' },
  { id: 'tape', name: '手账' },
  { id: 'comic', name: '漫画' },
  { id: 'pixel', name: '像素' },
  { id: 'neon', name: '霓虹' },
  { id: 'night', name: '星空' },
  { id: 'heart', name: '心动' },
  { id: 'glass', name: '透明' },
];

// ---------- 字体效果（只用系统字体） ----------
export const FONTS = [
  { id: 'normal', name: '默认' },
  { id: 'thin', name: '细体' },
  { id: 'bold', name: '粗体' },
  { id: 'tw', name: '符号居中', sub: '标点放在格子正中间，台湾那种排法' },
  { id: 'tiny', name: '超小字' },
  { id: 'big', name: '大字' },
  { id: 'airy', name: '宽松' },
  { id: 'slant', name: '倾斜' },
  { id: 'outline', name: '描边' },
  { id: 'glow', name: '发光' },
  { id: 'shadow', name: '投影' },
];
