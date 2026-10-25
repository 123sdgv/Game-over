// iOS 加到主屏幕以后，有些版本会在底部留出一条系统画的空白（WebKit 的 bug，约等于状态栏高度）。
// 打开"铺满屏幕底部"后，把整个界面的高度直接设成屏幕高度，试着盖住那一条。
// 不同 iOS 版本表现不一样，所以做成开关，默认关。
import { store } from './store.js';

const standalone = () => navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;

export function applyFill() {
  const dev = document.getElementById('device');
  if (!dev) return;
  const gap = screen.height - window.innerHeight;
  const on = store.get('display.fill', false) && standalone() && gap > 8 && gap < 160 && window.innerWidth < 640;
  dev.style.height = on ? `${screen.height}px` : '';
  dev.style.bottom = on ? 'auto' : '';
}

export const fillGap = () => Math.max(0, screen.height - window.innerHeight);
export const isStandalone = standalone;

window.addEventListener('resize', applyFill);
window.addEventListener('orientationchange', applyFill);
