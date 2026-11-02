// 便便超人的音效：全部用 Web Audio 现场合成，走可爱卡通路线，不恶心。
import { sound } from '../_shared/sound.js';

const r = (a, b) => a + Math.random() * (b - a);

export const sfx = {
  /** 噗——一串抖动的短锯齿波，听起来像放气的气球 */
  toot(len = 0.22, base = 92) {
    const n = Math.max(2, Math.round(len / 0.026));
    for (let i = 0; i < n; i++) {
      const fall = 1 - (i / n) * 0.28;
      sound.tone({ f: base * (i % 2 ? 1 : 1.42) * fall, dur: 0.042, type: 'sawtooth', vol: 0.2, delay: i * 0.026, attack: 0.002 });
    }
    sound.hiss({ f: 420, to: 150, dur: len, filter: 'lowpass', q: 0.8, vol: 0.12 });
  },
  pop() {
    sound.tone({ f: 620, to: 180, dur: 0.09, type: 'sine', vol: 0.3, attack: 0.002 });
  },
  splat(power = 1) {
    const p = Math.min(2.4, power);
    sound.hiss({ f: 1900 - p * 300, to: 170, dur: 0.14 + p * 0.09, filter: 'lowpass', q: 1.3, vol: 0.22 + p * 0.1 });
    sound.tone({ f: r(240, 300) - p * 40, to: 58, dur: 0.1 + p * 0.07, type: 'sine', vol: 0.3 + p * 0.1, attack: 0.002 });
    sound.tone({ f: r(700, 1000), to: 260, dur: 0.05, type: 'sine', vol: 0.09, delay: 0.05, attack: 0.002 });
  },
  whoosh(dur = 0.28, up = true) {
    sound.hiss({ f: up ? 500 : 2600, to: up ? 2600 : 500, dur, filter: 'bandpass', q: 1.4, vol: 0.2 });
  },
  boing(i = 0) {
    const f = 170 * Math.pow(1.26, i);
    [0, 0.05, 0.1].forEach((d, k) => sound.tone({ f: f * (k % 2 ? 1.18 : 1), to: f * 2.6, dur: 0.17, type: 'triangle', vol: 0.2 - k * 0.04, delay: d, attack: 0.003 }));
  },
  whistle(dur = 0.7) {
    sound.tone({ f: 2100, to: 460, dur, type: 'sine', vol: 0.13, attack: 0.03 });
  },
  sizzle(dur = 1) {
    sound.hiss({ f: 6200, to: 5200, dur, filter: 'highpass', q: 0.6, vol: 0.09, attack: 0.02 });
  },
  boom() {
    sound.hiss({ f: 1300, to: 60, dur: 0.95, filter: 'lowpass', q: 0.7, vol: 0.6 });
    sound.tone({ f: 120, to: 26, dur: 0.75, type: 'sine', vol: 0.62, attack: 0.002 });
    sound.tone({ f: 70, to: 30, dur: 0.5, type: 'square', vol: 0.12, attack: 0.002 });
  },
  cannon() {
    sound.tone({ f: 170, to: 34, dur: 0.42, type: 'sine', vol: 0.58, attack: 0.002 });
    sound.hiss({ f: 1600, to: 90, dur: 0.48, filter: 'lowpass', q: 0.8, vol: 0.42 });
  },
  flush(dur = 0.95) {
    sound.hiss({ f: 380, to: 1500, dur: dur * 0.6, filter: 'bandpass', q: 1.1, vol: 0.28, attack: 0.03 });
    sound.hiss({ f: 1500, to: 300, dur: dur * 0.5, filter: 'bandpass', q: 1.1, vol: 0.28, delay: dur * 0.5, attack: 0.03 });
    for (let i = 0; i < 6; i++) sound.tone({ f: r(180, 300), to: r(420, 660), dur: 0.07, type: 'sine', vol: 0.11, delay: 0.15 + i * (dur / 7), attack: 0.004 });
  },
  squeak() {
    sound.tone({ f: 1250, to: 1950, dur: 0.075, type: 'triangle', vol: 0.2, attack: 0.002 });
    sound.tone({ f: 1950, to: 1050, dur: 0.1, type: 'triangle', vol: 0.18, delay: 0.075, attack: 0.002 });
  },
  tap(i = 0) {
    sound.tone({ f: 340 + i * 90, to: 170, dur: 0.07, type: 'sine', vol: 0.3, attack: 0.002 });
  },
  kick() {
    sound.tone({ f: 240, to: 80, dur: 0.1, type: 'square', vol: 0.18, attack: 0.002 });
    sound.hiss({ f: 2600, to: 500, dur: 0.13, filter: 'bandpass', q: 1, vol: 0.26 });
  },
  slam() {
    sound.tone({ f: 150, to: 40, dur: 0.3, type: 'sine', vol: 0.6, attack: 0.002 });
    sound.hiss({ f: 1200, to: 120, dur: 0.3, filter: 'lowpass', vol: 0.4 });
  },
  thud() {
    sound.tone({ f: 130, to: 62, dur: 0.12, type: 'sine', vol: 0.36, attack: 0.002 });
  },
  strain(dur = 0.28) {
    sound.tone({ f: 130, to: 240, dur, type: 'square', vol: 0.05, attack: 0.02 });
  },
  fizzle() {
    sound.hiss({ f: 1500, to: 260, dur: 0.36, filter: 'bandpass', q: 2, vol: 0.13 });
    sound.tone({ f: 330, to: 120, dur: 0.26, type: 'triangle', vol: 0.13, delay: 0.06 });
  },
  snap() {
    sound.tone({ f: 2400, to: 900, dur: 0.035, type: 'square', vol: 0.12, attack: 0.001 });
    sound.hiss({ f: 4000, dur: 0.03, filter: 'highpass', vol: 0.28, attack: 0.001 });
  },
  roll(dur = 0.85) {
    for (let i = 0; i < 9; i++) sound.tone({ f: r(90, 130), dur: 0.05, type: 'triangle', vol: 0.14, delay: i * (dur / 9), attack: 0.003 });
  },
  rumble(dur = 0.6) {
    sound.tone({ f: 68, to: 44, dur, type: 'sawtooth', vol: 0.13, attack: 0.05 });
    sound.hiss({ f: 260, to: 120, dur, filter: 'lowpass', vol: 0.32, attack: 0.05 });
  },
  crack() {
    sound.hiss({ f: 3400, to: 800, dur: 0.1, filter: 'bandpass', q: 1, vol: 0.32, attack: 0.002 });
    sound.tone({ f: 500, to: 180, dur: 0.1, type: 'square', vol: 0.09, attack: 0.002 });
  },
  plop() {
    sound.tone({ f: 460, to: 760, dur: 0.05, type: 'sine', vol: 0.18, attack: 0.002 });
    sound.tone({ f: 760, to: 320, dur: 0.05, type: 'sine', vol: 0.11, delay: 0.05, attack: 0.002 });
  },
  squirt(i = 0) {
    sound.tone({ f: 150 + i * 42, to: 300 + i * 50, dur: 0.17, type: 'sawtooth', vol: 0.08, attack: 0.01 });
    sound.hiss({ f: 800, to: 1500, dur: 0.17, filter: 'bandpass', q: 3, vol: 0.2 });
  },
  clank() {
    sound.tone({ f: 980, to: 840, dur: 0.1, type: 'square', vol: 0.07, attack: 0.002 });
    sound.tone({ f: 1480, to: 1340, dur: 0.08, type: 'triangle', vol: 0.11, attack: 0.002 });
  },
  water(dur = 2) {
    sound.hiss({ f: 5200, to: 3600, dur, filter: 'highpass', q: 0.4, vol: 0.16, attack: 0.12 });
    sound.hiss({ f: 1400, to: 1100, dur, filter: 'bandpass', q: 0.8, vol: 0.14, attack: 0.12 });
  },
  bubble() {
    sound.tone({ f: r(600, 900), to: r(1100, 1700), dur: 0.06, type: 'sine', vol: 0.09, attack: 0.002 });
  },
  note(f, dur = 0.2) {
    sound.tone({ f: f * 0.96, to: f, dur, type: 'square', vol: 0.065, attack: 0.01 });
    sound.tone({ f: f / 2, dur, type: 'triangle', vol: 0.2, attack: 0.01 });
  },
  tada() {
    sound.arp([523, 659, 784, 1047], { gap: 0.07, dur: 0.2, type: 'triangle', vol: 0.17 });
  },
  ding() {
    sound.tone({ f: 1320, dur: 0.22, type: 'sine', vol: 0.14, attack: 0.002 });
    sound.tone({ f: 1760, dur: 0.17, type: 'sine', vol: 0.08, delay: 0.01, attack: 0.002 });
  },
  press() {
    sound.tone({ f: 420, to: 300, dur: 0.035, type: 'triangle', vol: 0.09, attack: 0.001 });
  },
};
