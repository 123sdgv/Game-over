// 合成音效：老电脑的提示音、开关机、拨号、风扇、打印机、蓝屏。全部现场合成，旋律是原创的。
import { sound } from '../_shared/sound.js';

let lastType = 0;
export const sfx = {
  click() { sound.tone({ f: 1900, to: 1400, dur: 0.025, type: 'square', vol: 0.05 }); },
  pop() { sound.tone({ f: 620, to: 900, dur: 0.05, type: 'triangle', vol: 0.09 }); },
  open() { sound.tone({ f: 420, to: 760, dur: 0.09, type: 'triangle', vol: 0.08 }); sound.hiss({ f: 2400, to: 5200, dur: 0.07, vol: 0.03, filter: 'highpass' }); },
  close() { sound.tone({ f: 700, to: 380, dur: 0.08, type: 'triangle', vol: 0.07 }); },
  min() { sound.tone({ f: 640, to: 300, dur: 0.1, type: 'sine', vol: 0.07 }); },
  ding() { sound.tone({ f: 988, dur: 0.35, type: 'sine', vol: 0.13 }); sound.tone({ f: 1318, dur: 0.4, type: 'sine', vol: 0.07, delay: 0.06 }); },
  error() { sound.tone({ f: 440, dur: 0.22, type: 'square', vol: 0.06 }); sound.tone({ f: 330, dur: 0.32, type: 'square', vol: 0.06, delay: 0.12 }); },
  notify() { sound.tone({ f: 1046, dur: 0.12, type: 'sine', vol: 0.1 }); sound.tone({ f: 1568, dur: 0.22, type: 'sine', vol: 0.09, delay: 0.09 }); },
  /** 它在打字：很轻的一下，太密就跳过 */
  type() {
    const t = performance.now();
    if (t - lastType < 38) return;
    lastType = t;
    sound.tone({ f: 2600 + Math.random() * 900, dur: 0.012, type: 'square', vol: 0.018 });
  },
  enter() { sound.tone({ f: 1200, to: 800, dur: 0.04, type: 'square', vol: 0.04 }); sound.hiss({ f: 3000, dur: 0.03, vol: 0.03 }); },
  crumple() { for (let i = 0; i < 5; i++) sound.hiss({ f: 1600 + Math.random() * 2600, dur: 0.05, vol: 0.06, delay: i * 0.04, q: 2 }); },
  empty() { for (let i = 0; i < 9; i++) sound.hiss({ f: 1200 + Math.random() * 3000, dur: 0.06, vol: 0.07, delay: i * 0.035, q: 2 }); sound.tone({ f: 200, to: 90, dur: 0.18, type: 'sine', vol: 0.12, delay: 0.3 }); },
  check() { sound.arp([784, 1046, 1318], { gap: 0.06, dur: 0.16, type: 'triangle', vol: 0.11 }); },
  uncheck() { sound.tone({ f: 520, to: 300, dur: 0.16, type: 'triangle', vol: 0.09 }); },
  /** 开机：一段原创的暖和弦 */
  startup() {
    const notes = [[392, 0], [523, 0.18], [659, 0.36], [784, 0.54], [988, 0.9]];
    for (const [f, d] of notes) {
      sound.tone({ f, dur: 1.6, type: 'sine', vol: 0.09, delay: d, attack: 0.08 });
      sound.tone({ f: f * 2.003, dur: 1.1, type: 'triangle', vol: 0.025, delay: d + 0.02, attack: 0.06 });
    }
    sound.tone({ f: 196, dur: 2.2, type: 'sine', vol: 0.08, delay: 0.5, attack: 0.3 });
  },
  shutdown() {
    const notes = [[784, 0], [659, 0.2], [523, 0.4], [392, 0.65]];
    for (const [f, d] of notes) sound.tone({ f, dur: 1.2, type: 'sine', vol: 0.09, delay: d, attack: 0.05 });
  },
  /** 拨号上网：拨号音 + 两声尖叫 + 沙沙 */
  modem() {
    const dt = [[697, 1209], [770, 1336], [852, 1477], [941, 1336], [697, 1477], [770, 1209]];
    dt.forEach(([a, b], i) => { sound.tone({ f: a, dur: 0.07, type: 'sine', vol: 0.05, delay: i * 0.09 }); sound.tone({ f: b, dur: 0.07, type: 'sine', vol: 0.05, delay: i * 0.09 }); });
    sound.tone({ f: 1800, to: 2250, dur: 0.35, type: 'sine', vol: 0.05, delay: 0.62 });
    sound.tone({ f: 980, to: 1200, dur: 0.25, type: 'square', vol: 0.025, delay: 1.0 });
    sound.hiss({ f: 3200, dur: 0.5, vol: 0.05, delay: 1.25, q: 0.6 });
  },
  /** 风扇一小段（循环靠反复叫） */
  fan(k = 1) { sound.hiss({ f: 380 + k * 180, to: 300 + k * 160, dur: 0.6, filter: 'lowpass', q: 0.8, vol: 0.05 * k, attack: 0.15 }); },
  printer() {
    for (let i = 0; i < 6; i++) sound.tone({ f: 180 + (i % 2) * 40, dur: 0.07, type: 'sawtooth', vol: 0.035, delay: i * 0.11 });
    sound.hiss({ f: 900, dur: 0.6, vol: 0.03, filter: 'bandpass', q: 3, delay: 0.1 });
  },
  bsod() { sound.tone({ f: 880, dur: 0.18, type: 'square', vol: 0.08 }); sound.tone({ f: 880, dur: 0.18, type: 'square', vol: 0.08, delay: 0.3 }); },
  cd() { sound.tone({ f: 220, to: 1400, dur: 1.4, type: 'sine', vol: 0.03, attack: 0.3 }); sound.hiss({ f: 6000, dur: 1.2, vol: 0.015, filter: 'highpass', delay: 0.3 }); },
  beep() { sound.tone({ f: 1000, dur: 0.09, type: 'square', vol: 0.05 }); },
  glitch() { for (let i = 0; i < 4; i++) sound.tone({ f: 200 + Math.random() * 1600, dur: 0.03, type: 'square', vol: 0.04, delay: i * 0.03 }); },
  /** 播放 mp3：几个音（每个文件一段固定的小旋律） */
  tune(seed) {
    const scale = [262, 294, 330, 392, 440, 523, 587, 659];
    let s = seed;
    for (let i = 0; i < 12; i++) {
      s = (s * 1103515245 + 12345) >>> 0;
      const f = scale[s % scale.length];
      sound.tone({ f, dur: 0.28, type: 'triangle', vol: 0.08, delay: i * 0.22 });
      if (i % 4 === 0) sound.tone({ f: f / 2, dur: 0.6, type: 'sine', vol: 0.06, delay: i * 0.22 });
    }
  },
};
