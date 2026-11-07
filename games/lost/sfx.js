// 合成音效：都很轻，夜里捡到手机的那种安静
import { sound } from '../_shared/sound.js';

export const sfx = {
  tap() { sound.tone({ f: 1500, to: 1100, dur: 0.035, type: 'sine', vol: 0.05 }); },
  key() { sound.tone({ f: 900, to: 760, dur: 0.05, type: 'triangle', vol: 0.07 }); sound.hiss({ f: 3000, dur: 0.03, vol: 0.03 }); },
  del() { sound.tone({ f: 600, to: 500, dur: 0.05, type: 'triangle', vol: 0.06 }); },
  open() { sound.hiss({ f: 900, to: 2600, dur: 0.18, filter: 'bandpass', q: 0.7, vol: 0.05 }); },
  close() { sound.hiss({ f: 2400, to: 700, dur: 0.18, filter: 'bandpass', q: 0.7, vol: 0.05 }); },
  unlock() {
    sound.tone({ f: 660, dur: 0.12, type: 'sine', vol: 0.09 });
    sound.tone({ f: 990, dur: 0.22, type: 'sine', vol: 0.08, delay: 0.08 });
    sound.hiss({ f: 1200, to: 4000, dur: 0.3, filter: 'bandpass', q: 0.6, vol: 0.04, delay: 0.05 });
  },
  wrong() {
    sound.tone({ f: 180, dur: 0.09, type: 'square', vol: 0.05 });
    sound.tone({ f: 160, dur: 0.12, type: 'square', vol: 0.05, delay: 0.11 });
  },
  notif() {
    sound.tone({ f: 1318, dur: 0.22, type: 'sine', vol: 0.08 });
    sound.tone({ f: 988, dur: 0.34, type: 'sine', vol: 0.07, delay: 0.12 });
  },
  sent() { sound.hiss({ f: 1800, to: 5200, dur: 0.16, filter: 'bandpass', q: 1.2, vol: 0.05 }); sound.tone({ f: 1400, to: 1900, dur: 0.08, vol: 0.04 }); },
  clue() {
    sound.hiss({ f: 5200, to: 3800, dur: 0.07, filter: 'highpass', vol: 0.035 });
    sound.hiss({ f: 4600, to: 3400, dur: 0.06, filter: 'highpass', vol: 0.03, delay: 0.09 });
    sound.tone({ f: 1760, dur: 0.18, type: 'sine', vol: 0.04, delay: 0.12 });
  },
  pick() { sound.tone({ f: 1200, to: 1500, dur: 0.06, type: 'sine', vol: 0.05 }); },
  nope() { sound.tone({ f: 340, to: 260, dur: 0.18, type: 'triangle', vol: 0.07 }); },
  deduce() { sound.arp([523, 659, 784, 1047], { gap: 0.09, dur: 0.5, type: 'sine', vol: 0.07 }); },
  idea() {
    [392, 494, 587, 740].forEach((f, i) => sound.tone({ f, dur: 1.4, type: 'sine', vol: 0.045, delay: i * 0.05, attack: 0.08 }));
  },
  flip() { sound.hiss({ f: 600, to: 1800, dur: 0.22, filter: 'bandpass', q: 0.8, vol: 0.06 }); },
  paper() { sound.hiss({ f: 2800, to: 1600, dur: 0.25, filter: 'bandpass', q: 0.5, vol: 0.05 }); sound.hiss({ f: 3400, dur: 0.12, filter: 'bandpass', vol: 0.03, delay: 0.2 }); },
  wave(vol = 0.05) { sound.hiss({ f: 380, to: 900, dur: 2.6, filter: 'lowpass', q: 0.4, vol, attack: 1.1 }); },
  type() { sound.tone({ f: 2200 + Math.random() * 400, dur: 0.02, type: 'square', vol: 0.012 }); },
  wipe() {
    sound.tone({ f: 220, to: 110, dur: 3.2, type: 'sine', vol: 0.08, attack: 0.4 });
    sound.tone({ f: 330, to: 165, dur: 3.2, type: 'sine', vol: 0.05, attack: 0.6 });
  },
  hello() { sound.arp([784, 988, 1175], { gap: 0.14, dur: 0.9, type: 'sine', vol: 0.05 }); },
  stamp() { sound.tone({ f: 120, to: 60, dur: 0.18, type: 'sine', vol: 0.14 }); sound.hiss({ f: 900, dur: 0.1, filter: 'lowpass', vol: 0.08 }); },
};
