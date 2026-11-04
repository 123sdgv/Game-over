// 星星消消乐的音效：全部现场合成。
import { sound } from '../_shared/sound.js';

// 五声音阶，连消一轮就往上走，听起来总是好听的
const PENTA = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.51, 1567.98, 1760, 2093, 2349.32];

let lastChime = 0;
const nowMs = () => performance.now();

export const sfx = {
  select() { sound.tone({ f: 900, to: 1150, dur: 0.06, type: 'triangle', vol: 0.09 }); },
  deselect() { sound.tone({ f: 800, to: 600, dur: 0.05, type: 'triangle', vol: 0.06 }); },
  swap() {
    sound.hiss({ f: 1800, to: 3600, dur: 0.11, filter: 'bandpass', q: 2.5, vol: 0.09 });
    sound.tone({ f: 420, to: 640, dur: 0.1, type: 'sine', vol: 0.08 });
  },
  bad() {
    sound.tone({ f: 260, to: 200, dur: 0.1, type: 'triangle', vol: 0.13 });
    sound.tone({ f: 210, to: 160, dur: 0.13, type: 'triangle', vol: 0.12, delay: 0.1 });
  },
  locked() {
    sound.tone({ f: 2100, dur: 0.05, type: 'square', vol: 0.03 });
    sound.tone({ f: 1500, dur: 0.07, type: 'square', vol: 0.03, delay: 0.04 });
  },
  /** 消一颗星：i 是这一轮第几颗，combo 第几轮连消 */
  chime(combo, i = 0, delay = 0) {
    const t = nowMs();
    if (t - lastChime < 28 && !delay) return;
    lastChime = t;
    const n = Math.min(PENTA.length - 1, combo - 1 + (i % 4));
    const f = PENTA[n];
    sound.tone({ f, dur: 0.16, type: 'sine', vol: 0.15, delay });
    sound.tone({ f: f * 2, dur: 0.09, type: 'triangle', vol: 0.05, delay });
  },
  land(n = 1) {
    const t = nowMs();
    if (t - (sfx._land || 0) < 60) return;
    sfx._land = t;
    sound.tone({ f: 170, to: 110, dur: 0.06, type: 'sine', vol: Math.min(0.12, 0.04 + n * 0.012) });
  },
  newSpecial(k = 1) {
    const base = k === 4 ? [784, 988, 1175, 1568, 1976] : k === 3 ? [659, 880, 1175] : [659, 988];
    sound.arp(base, { gap: 0.05, dur: 0.16, type: 'triangle', vol: 0.12 });
    sound.hiss({ f: 6000, to: 9000, dur: 0.22, filter: 'highpass', vol: 0.05, delay: 0.03 });
  },
  line() {
    sound.hiss({ f: 1200, to: 7000, dur: 0.26, filter: 'bandpass', q: 1.4, vol: 0.2 });
    sound.tone({ f: 1500, to: 300, dur: 0.24, type: 'sawtooth', vol: 0.055 });
  },
  bomb(big = false) {
    sound.tone({ f: big ? 130 : 170, to: 36, dur: big ? 0.55 : 0.34, type: 'sine', vol: big ? 0.42 : 0.34 });
    sound.hiss({ f: big ? 1800 : 2600, to: 120, dur: big ? 0.65 : 0.38, filter: 'lowpass', vol: big ? 0.36 : 0.28 });
  },
  rainbow() {
    sound.arp([1046, 1318, 1568, 2093, 2637], { gap: 0.045, dur: 0.2, type: 'sine', vol: 0.09 });
    sound.hiss({ f: 5000, to: 10000, dur: 0.5, filter: 'highpass', vol: 0.05 });
  },
  zap(i = 0) {
    const t = nowMs();
    if (t - (sfx._zap || 0) < 35) return;
    sfx._zap = t;
    const f = 900 + (i % 10) * 120;
    sound.tone({ f, to: f * 1.5, dur: 0.05, type: 'square', vol: 0.025 });
  },
  nova() {
    sound.tone({ f: 90, to: 30, dur: 0.9, type: 'sine', vol: 0.45 });
    sound.hiss({ f: 3000, to: 200, dur: 0.9, filter: 'lowpass', vol: 0.36 });
    sound.arp([523, 659, 784, 1046, 1318, 1568], { gap: 0.06, dur: 0.3, type: 'triangle', vol: 0.09, delay: 0.1 });
  },
  morph(i = 0) { sound.tone({ f: 1100 + (i % 8) * 90, dur: 0.06, type: 'triangle', vol: 0.05 }); },
  ice(left = 0) {
    const t = nowMs();
    if (t - (sfx._ice || 0) < 40) return;
    sfx._ice = t;
    sound.hiss({ f: 5200, to: 2600, dur: 0.1, filter: 'bandpass', q: 2.5, vol: left ? 0.12 : 0.17 });
    sound.tone({ f: left ? 2300 : 2900, to: 1400, dur: 0.07, type: 'triangle', vol: 0.07 });
  },
  chain() {
    sound.tone({ f: 2500, to: 1800, dur: 0.05, type: 'square', vol: 0.04 });
    sound.tone({ f: 1750, to: 1300, dur: 0.08, type: 'square', vol: 0.035, delay: 0.05 });
    sound.hiss({ f: 6000, dur: 0.08, filter: 'highpass', vol: 0.06, delay: 0.02 });
  },
  collect(i = 0) {
    const t = nowMs();
    if (t - (sfx._col || 0) < 40) return;
    sfx._col = t;
    sound.tone({ f: 1300 + (i % 9) * 70, dur: 0.05, type: 'sine', vol: 0.06 });
  },
  goalDone() { sound.arp([784, 1046, 1318], { gap: 0.07, dur: 0.18, type: 'triangle', vol: 0.12 }); },
  shuffle() {
    sound.hiss({ f: 800, to: 3800, dur: 0.4, filter: 'bandpass', q: 1.2, vol: 0.14 });
    sound.arp([440, 554, 659], { gap: 0.09, dur: 0.14, type: 'triangle', vol: 0.08 });
  },
  bonusMoves() { sound.arp([880, 1175, 1568], { gap: 0.06, dur: 0.16, type: 'sine', vol: 0.12 }); },
  moveToStar(i = 0) {
    const f = 700 * Math.pow(1.06, i);
    sound.tone({ f, to: f * 1.4, dur: 0.1, type: 'triangle', vol: 0.09 });
  },
  win() {
    sound.arp([523, 659, 784, 1046, 1318, 1568], { gap: 0.09, dur: 0.3, type: 'triangle', vol: 0.15 });
    sound.arp([262, 330, 392], { gap: 0.18, dur: 0.4, type: 'sine', vol: 0.1 });
  },
  lose() {
    sound.arp([494, 392, 330, 262], { gap: 0.16, dur: 0.3, type: 'sine', vol: 0.13 });
  },
  dropIn() { sound.hiss({ f: 500, to: 1600, dur: 0.3, filter: 'bandpass', q: 1, vol: 0.06 }); },
};
