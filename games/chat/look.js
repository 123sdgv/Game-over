// 头像和聊天背景
import { PALETTE, hashColor, initial } from './data.js';
import { media } from './media.js';

export function avatarEl(p, cls = '') {
  const el = document.createElement('div');
  el.className = 'av ' + cls;
  setAvatar(el, p);
  return el;
}

export function setAvatar(el, p) {
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
}

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
