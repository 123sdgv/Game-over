// 拧螺丝的音效：全部现场合成。
import { sound } from '../_shared/sound.js';

const now = () => performance.now();
const gate = {};
const ok = (k, ms) => { const t = now(); if (t - (gate[k] || 0) < ms) return false; gate[k] = t; return true; };

export const sfx = {
  /** 拧出来：一串越来越快的棘轮声 + 啵 */
  unscrew() {
    for (let i = 0; i < 4; i++) {
      const d = i * 0.034 - i * i * 0.003;
      sound.hiss({ f: 3800 + i * 500, dur: 0.02, filter: 'bandpass', q: 6, vol: 0.12, delay: d });
      sound.tone({ f: 1500 + i * 180, dur: 0.018, type: 'square', vol: 0.018, delay: d });
    }
    sound.tone({ f: 520, to: 980, dur: 0.07, type: 'sine', vol: 0.12, delay: 0.12 });
  },
  /** 掉进工具箱：清脆的金属声，第几颗越高 */
  clink(i = 0) {
    if (!ok('clink', 30)) return;
    const f = 1900 + i * 110;
    sound.tone({ f, dur: 0.11, type: 'sine', vol: 0.12 });
    sound.tone({ f: f * 2.71, dur: 0.06, type: 'sine', vol: 0.04 });
    sound.hiss({ f: 6000, dur: 0.03, filter: 'highpass', vol: 0.06 });
  },
  stage() {
    if (!ok('stage', 30)) return;
    sound.tone({ f: 980, dur: 0.1, type: 'triangle', vol: 0.12 });
    sound.tone({ f: 2400, dur: 0.05, type: 'sine', vol: 0.04 });
  },
  bank() {
    sound.arp([1318, 1760, 2349], { gap: 0.05, dur: 0.14, type: 'sine', vol: 0.08 });
  },
  locked() {
    if (!ok('locked', 80)) return;
    sound.tone({ f: 240, to: 190, dur: 0.07, type: 'triangle', vol: 0.12 });
    sound.hiss({ f: 900, dur: 0.04, filter: 'lowpass', vol: 0.08 });
  },
  full() {
    sound.tone({ f: 180, dur: 0.16, type: 'sawtooth', vol: 0.05 });
    sound.tone({ f: 150, dur: 0.18, type: 'sawtooth', vol: 0.05, delay: 0.12 });
  },
  /** 箱子打开（绑定颜色） */
  open() {
    sound.tone({ f: 420, to: 640, dur: 0.08, type: 'triangle', vol: 0.07 });
  },
  /** 盖子合上 */
  close(i = 0) {
    sound.hiss({ f: 1400, to: 300, dur: 0.07, filter: 'lowpass', vol: 0.2 });
    sound.tone({ f: 330, to: 190, dur: 0.08, type: 'sine', vol: 0.18 });
    sound.arp([784 * (1 + i * 0.06), 988 * (1 + i * 0.06), 1319 * (1 + i * 0.06)], { gap: 0.06, dur: 0.16, type: 'triangle', vol: 0.09, delay: 0.08 });
  },
  /** 玻璃板掉下去 */
  fall() {
    if (!ok('fall', 50)) return;
    sound.tone({ f: 2600, dur: 0.18, type: 'sine', vol: 0.06 });
    sound.tone({ f: 3370, dur: 0.14, type: 'sine', vol: 0.04, delay: 0.01 });
    sound.hiss({ f: 1600, to: 320, dur: 0.4, filter: 'bandpass', q: 0.8, vol: 0.07, delay: 0.03 });
  },
  /** 板子落地（掉出画面） */
  thud() {
    if (!ok('thud', 70)) return;
    sound.tone({ f: 2100, dur: 0.07, type: 'sine', vol: 0.04 });
    sound.hiss({ f: 3000, dur: 0.05, filter: 'highpass', vol: 0.04 });
  },
  unlock() {
    if (!ok('unlock', 60)) return;
    sound.tone({ f: 760, to: 1180, dur: 0.09, type: 'sine', vol: 0.06 });
  },
  drill() {
    sound.tone({ f: 140, to: 260, dur: 0.38, type: 'sawtooth', vol: 0.035 });
    sound.hiss({ f: 2400, to: 4200, dur: 0.38, filter: 'bandpass', q: 3, vol: 0.06 });
    sound.tone({ f: 700, to: 1100, dur: 0.08, type: 'sine', vol: 0.1, delay: 0.36 });
  },
  whoosh() {
    sound.hiss({ f: 500, to: 3200, dur: 0.3, filter: 'bandpass', q: 1.2, vol: 0.16 });
  },
  melt() {
    sound.hiss({ f: 5000, to: 2500, dur: 0.7, filter: 'highpass', vol: 0.09 });
    sound.tone({ f: 600, to: 140, dur: 0.6, type: 'triangle', vol: 0.05 });
  },
  stuck() {
    sound.tone({ f: 220, to: 160, dur: 0.24, type: 'triangle', vol: 0.12 });
    sound.tone({ f: 165, to: 120, dur: 0.3, type: 'triangle', vol: 0.11, delay: 0.18 });
  },
  win() {
    sound.arp([523, 659, 784, 1047, 1319, 1568], { gap: 0.075, dur: 0.24, type: 'triangle', vol: 0.12 });
    sound.hiss({ f: 6000, to: 9000, dur: 0.5, filter: 'highpass', vol: 0.04, delay: 0.3 });
  },
  reward() {
    sound.arp([1047, 1319, 1568, 2093, 2637, 3136], { gap: 0.055, dur: 0.3, type: 'sine', vol: 0.09 });
    sound.hiss({ f: 7000, to: 11000, dur: 0.8, filter: 'highpass', vol: 0.05 });
  },
  tap() { sound.tone({ f: 900, dur: 0.04, type: 'triangle', vol: 0.06 }); },
  /** 钉子画：放一颗 / 拿掉一颗 */
  place(c = 0) {
    if (!ok('place', 22)) return;
    const f = [1700, 1500, 1900, 2100, 1600, 1800][c] || 1750;
    sound.tone({ f, dur: 0.05, type: 'sine', vol: 0.1 });
    sound.hiss({ f: 5000, dur: 0.02, filter: 'highpass', vol: 0.05 });
  },
  remove() {
    if (!ok('remove', 22)) return;
    sound.tone({ f: 1300, to: 800, dur: 0.06, type: 'triangle', vol: 0.08 });
  },
  empty() {
    if (!ok('empty', 120)) return;
    sound.tone({ f: 300, to: 240, dur: 0.09, type: 'triangle', vol: 0.1 });
  },
};
