import { applyWallpaper } from './wallpaper.js';
import { registerSettings } from './apps.js';
import { createSettings } from './settings.js';
import { initHome } from './home.js';
import { initGuard } from './guard.js';

// 已经删掉的 App 留在这台手机上的存档、设置、记录，一起清掉
for (const id of ['lost']) {
  try { Object.keys(localStorage).filter((k) => k.startsWith(`pp.game.${id}.`)).forEach((k) => localStorage.removeItem(k)); } catch {}
}

registerSettings(createSettings);
applyWallpaper();
initHome();
initGuard();

// iOS：禁止双指缩放和双击放大，让它更像一个 App
document.addEventListener('gesturestart', (e) => e.preventDefault());
let lastTouch = 0;
document.addEventListener('touchend', (e) => {
  const now = Date.now();
  if (now - lastTouch < 300 && !e.target.closest('input')) e.preventDefault();
  lastTouch = now;
}, { passive: false });
