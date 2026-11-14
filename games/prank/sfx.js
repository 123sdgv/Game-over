// 音效全部现场合成：界面是老电脑喇叭的方波，打在身上是低频闷响加噪声。
import { sound } from '../_shared/sound.js';

const r = (a, b) => a + Math.random() * (b - a);
let lastThud = 0;
const now = () => performance.now();

export const sfx = {
  click() { sound.tone({ f: 1250, dur: 0.018, type: 'square', vol: 0.09 }); },
  select() { sound.tone({ f: 880, dur: 0.03, type: 'square', vol: 0.09 }); sound.tone({ f: 1320, dur: 0.03, type: 'square', vol: 0.08, delay: 0.035 }); },
  ding() { sound.tone({ f: 523, dur: 0.1, type: 'square', vol: 0.1 }); sound.tone({ f: 659, dur: 0.16, type: 'square', vol: 0.1, delay: 0.09 }); },
  error() { sound.tone({ f: 196, dur: 0.16, type: 'square', vol: 0.15 }); sound.tone({ f: 147, dur: 0.3, type: 'square', vol: 0.15, delay: 0.17 }); },
  place() { sound.tone({ f: 340, to: 200, dur: 0.05, type: 'triangle', vol: 0.18 }); },
  grow(p) { sound.tone({ f: 300 + p * 500, dur: 0.03, type: 'square', vol: 0.05 }); },
  whistle() { sound.tone({ f: 1500, to: 420, dur: 0.5, type: 'sine', vol: 0.13 }); },
  thud(p = 1) {
    if (now() - lastThud < 45) return;
    lastThud = now();
    const v = Math.min(1.6, p);
    sound.tone({ f: r(120, 160), to: 45, dur: 0.1 + v * 0.07, type: 'sine', vol: 0.2 + v * 0.17, attack: 0.002 });
    sound.hiss({ f: 900, to: 150, dur: 0.07 + v * 0.05, filter: 'lowpass', vol: 0.09 + v * 0.1 });
  },
  clang(s = 1) {
    sound.tone({ f: 90, to: 38, dur: 0.34, type: 'sine', vol: 0.5, attack: 0.002 });
    [1340, 2120, 3180].forEach((f, i) => sound.tone({ f: f / Math.max(0.7, s * 0.8), dur: 0.5 - i * 0.1, type: 'triangle', vol: 0.09, attack: 0.001 }));
    sound.hiss({ f: 2400, to: 300, dur: 0.14, filter: 'bandpass', q: 0.7, vol: 0.28 });
  },
  boing(s = 1) {
    [0, 0.04, 0.09].forEach((d, k) => sound.tone({ f: (170 / s) * (k % 2 ? 1.2 : 1), to: 720, dur: 0.2, type: 'triangle', vol: 0.21 - k * 0.04, delay: d }));
  },
  zap() {
    for (let i = 0; i < 6; i++) sound.tone({ f: r(90, 1300), to: r(60, 900), dur: 0.05, type: 'sawtooth', vol: 0.16, delay: i * 0.035 });
    sound.hiss({ f: 6000, to: 800, dur: 0.3, filter: 'highpass', vol: 0.34 });
    sound.tone({ f: 60, to: 34, dur: 0.5, type: 'sine', vol: 0.5, delay: 0.04 });
  },
  rollerTick() { sound.tone({ f: r(52, 64), dur: 0.14, type: 'sawtooth', vol: 0.16 }); },
  freeze() {
    for (let i = 0; i < 7; i++) sound.tone({ f: r(1800, 5200), dur: 0.05, type: 'triangle', vol: 0.09, delay: i * 0.03 });
    sound.hiss({ f: 7000, to: 3000, dur: 0.3, filter: 'highpass', vol: 0.14 });
  },
  shatter() {
    for (let i = 0; i < 14; i++) sound.tone({ f: r(1400, 6400), dur: r(0.03, 0.09), type: 'triangle', vol: 0.11, delay: i * 0.017 });
    sound.hiss({ f: 6000, to: 1600, dur: 0.24, filter: 'highpass', vol: 0.3 });
  },
  holeOpen() { sound.tone({ f: 500, to: 42, dur: 0.7, type: 'sine', vol: 0.4 }); sound.hiss({ f: 2000, to: 150, dur: 0.7, filter: 'lowpass', vol: 0.25 }); },
  holeTick() { sound.tone({ f: r(40, 56), dur: 0.2, type: 'sine', vol: 0.15 }); },
  holeSpit() { sound.tone({ f: 44, to: 700, dur: 0.22, type: 'sine', vol: 0.4 }); sound.hiss({ f: 300, to: 4000, dur: 0.22, filter: 'bandpass', vol: 0.3 }); },
  erase() { sound.hiss({ f: r(2400, 3800), dur: 0.05, filter: 'bandpass', q: 3, vol: 0.15 }); },
  scratch() { sound.hiss({ f: r(3800, 5600), dur: 0.035, filter: 'highpass', vol: 0.07 }); },
  pop() { sound.tone({ f: 170, to: 760, dur: 0.1, type: 'sine', vol: 0.3 }); sound.hiss({ f: 1800, dur: 0.05, vol: 0.14 }); },
  stab() { sound.tone({ f: 620, to: 180, dur: 0.05, type: 'square', vol: 0.14 }); sound.hiss({ f: 2600, to: 500, dur: 0.08, vol: 0.2 }); },
  inflate(s = 1) { sound.tone({ f: 260 + s * 130, to: 420 + s * 200, dur: 0.16, type: 'sine', vol: 0.14 }); sound.hiss({ f: 1800, dur: 0.14, filter: 'highpass', vol: 0.05 }); },
  balloonPop(s = 1) { sound.hiss({ f: 3400 / Math.max(0.8, s), to: 800, dur: 0.06 + s * 0.03, filter: 'bandpass', q: 0.7, vol: 0.42 }); sound.tone({ f: 420, to: 90, dur: 0.07, type: 'square', vol: 0.18 }); },
  tie() { sound.tone({ f: 760, to: 520, dur: 0.05, type: 'triangle', vol: 0.15 }); sound.hiss({ f: 2400, dur: 0.04, vol: 0.09 }); },
  rope() { sound.hiss({ f: 1100, to: 2600, dur: 0.11, filter: 'bandpass', q: 2, vol: 0.13 }); },
  water() { sound.hiss({ f: r(500, 1100), to: r(800, 1500), dur: 0.16, filter: 'bandpass', q: 1.1, vol: 0.14 }); sound.tone({ f: r(240, 380), to: r(460, 660), dur: 0.08, type: 'sine', vol: 0.07, delay: 0.05 }); },
  bubble() { sound.tone({ f: r(320, 520), to: r(620, 900), dur: 0.05, type: 'sine', vol: 0.09 }); },
  clap() { sound.hiss({ f: 2600, to: 1200, dur: 0.05, filter: 'bandpass', q: 0.8, vol: 0.32 }); },
  yawn() { sound.tone({ f: 330, to: 200, dur: 0.5, type: 'triangle', vol: 0.06, attack: 0.08 }); },
  /* 食物 */
  munch() { sound.hiss({ f: r(1300, 1900), to: r(500, 800), dur: 0.07, filter: 'bandpass', q: 1.4, vol: 0.2 }); sound.tone({ f: r(180, 240), to: 120, dur: 0.05, type: 'square', vol: 0.05, delay: 0.02 }); },
  gurgle() { for (let i = 0; i < 4; i++) sound.tone({ f: r(70, 120), to: r(140, 230), dur: 0.09, type: 'sine', vol: 0.24, delay: i * 0.075 }); },
  retch() { sound.tone({ f: 250, to: 105, dur: 0.34, type: 'sawtooth', vol: 0.08 }); sound.hiss({ f: 700, to: 280, dur: 0.3, filter: 'bandpass', q: 1.2, vol: 0.13 }); },
  fuse() { sound.hiss({ f: r(4200, 6800), dur: 0.05, filter: 'highpass', vol: 0.12 }); },
  boom(s = 1) {
    sound.tone({ f: 120, to: 26, dur: 0.75, type: 'sine', vol: 0.6, attack: 0.002 });
    sound.hiss({ f: 1700, to: 80, dur: 0.6 + s * 0.15, filter: 'lowpass', vol: 0.55 });
    sound.hiss({ f: 5200, to: 900, dur: 0.16, filter: 'bandpass', q: 0.6, vol: 0.3 });
  },
  /* 刀子 */
  knife() { sound.hiss({ f: 5200, to: 7800, dur: 0.24, filter: 'bandpass', q: 6, vol: 0.2 }); sound.tone({ f: 2900, to: 3500, dur: 0.26, type: 'triangle', vol: 0.06, delay: 0.05 }); },
  growl() { sound.tone({ f: 96, to: 68, dur: 0.42, type: 'sawtooth', vol: 0.08, delay: 0.08 }); },
  swish() { sound.hiss({ f: r(1500, 2400), to: r(500, 800), dur: 0.09, filter: 'bandpass', q: 1.6, vol: 0.17 }); },
  slash() { sound.hiss({ f: 3600, to: 1100, dur: 0.07, filter: 'bandpass', q: 0.9, vol: 0.3 }); sound.tone({ f: 150, to: 70, dur: 0.08, type: 'sine', vol: 0.3 }); },
  calm() { sound.tone({ f: 660, to: 420, dur: 0.2, type: 'triangle', vol: 0.12 }); },
  clink(metal = true) { if (metal) { sound.tone({ f: r(2400, 3200), dur: 0.12, type: 'triangle', vol: 0.08 }); sound.tone({ f: r(3800, 4400), dur: 0.08, type: 'triangle', vol: 0.05 }); } else sound.tone({ f: r(500, 700), dur: 0.05, type: 'triangle', vol: 0.1 }); },
  // 火柴人的声音：几个方波音节，像老游戏里的小人叫
  ouch(p = 1) {
    const f = r(440, 620);
    sound.tone({ f, to: f * 0.45, dur: 0.1 + Math.min(0.14, p * 0.06), type: 'square', vol: 0.1 });
  },
  scream() {
    const f = r(600, 800);
    for (let i = 0; i < 5; i++) sound.tone({ f: f * (i % 2 ? 1.14 : 1), dur: 0.09, type: 'square', vol: 0.09, delay: i * 0.08 });
  },
  gibber() {
    const n = 2 + (Math.random() * 3 | 0), f = r(420, 640);
    for (let i = 0; i < n; i++) sound.tone({ f: f * r(0.84, 1.2), dur: 0.05, type: 'square', vol: 0.05, delay: i * 0.075 });
  },
};
