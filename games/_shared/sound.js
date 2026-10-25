// 合成音效：用 Web Audio 现场生成，不需要音频文件。
//   import { sound } from '../_shared/sound.js';
//   sound.enabled = settings.sound;
//   sound.tone({ f: 600, to: 900, dur: 0.08 });
//   sound.hiss({ f: 4000, to: 1200, dur: 0.12 });
// iPhone 打开静音开关时听不到（设成 ambient，不会打断正在放的音乐）。
let ac = null, master = null, noiseBuf = null;
let enabled = true;

function audio() {
  if (!enabled) return null;
  if (!ac) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try { if (navigator.audioSession) navigator.audioSession.type = 'ambient'; } catch {}
    try { ac = new AC(); } catch { return null; }
    master = ac.createGain();
    master.gain.value = 0.7;
    const comp = ac.createDynamicsCompressor(); // 几个声音叠在一起时不会爆
    master.connect(comp);
    comp.connect(ac.destination);
  }
  if (ac.state === 'suspended') ac.resume().catch(() => {});
  return ac;
}

// 浏览器要求第一次触摸以后才能出声
const unlock = () => { if (enabled) audio(); };
window.addEventListener('pointerdown', unlock, { capture: true });
window.addEventListener('touchend', unlock, { capture: true });

function noise() {
  if (!noiseBuf) {
    const n = Math.floor(ac.sampleRate * 1.2);
    noiseBuf = ac.createBuffer(1, n, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  }
  return noiseBuf;
}

function envelope(g, t0, vol, attack, dur) {
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
}

export const sound = {
  get enabled() { return enabled; },
  set enabled(v) { enabled = !!v; if (!enabled && ac) ac.suspend().catch(() => {}); },

  /** 一个音：f 起始频率，to 结束频率（可选，滑音） */
  tone({ f = 440, to = null, dur = 0.15, type = 'sine', vol = 0.25, delay = 0, attack = 0.006 } = {}) {
    const a = audio();
    if (!a) return;
    const t0 = a.currentTime + delay;
    const o = a.createOscillator(), g = a.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, t0);
    if (to) o.frequency.exponentialRampToValueAtTime(Math.max(20, to), t0 + dur);
    envelope(g, t0, vol, attack, dur);
    o.connect(g); g.connect(master);
    o.start(t0); o.stop(t0 + dur + 0.05);
  },

  /** 一段噪声：用滤波器塑形，f → to 扫频 */
  hiss({ f = 2000, to = null, dur = 0.2, filter = 'bandpass', q = 1, vol = 0.25, delay = 0, attack = 0.004 } = {}) {
    const a = audio();
    if (!a) return;
    const t0 = a.currentTime + delay;
    const src = a.createBufferSource();
    src.buffer = noise();
    const bf = a.createBiquadFilter();
    bf.type = filter; bf.Q.value = q;
    bf.frequency.setValueAtTime(f, t0);
    if (to) bf.frequency.exponentialRampToValueAtTime(Math.max(30, to), t0 + dur);
    const g = a.createGain();
    envelope(g, t0, vol, attack, dur);
    src.connect(bf); bf.connect(g); g.connect(master);
    src.start(t0, Math.random() * 0.5); src.stop(t0 + dur + 0.05);
  },

  /** 一串音（琶音） */
  arp(freqs, { gap = 0.07, dur = 0.18, type = 'triangle', vol = 0.16, delay = 0 } = {}) {
    freqs.forEach((f, i) => this.tone({ f, dur, type, vol, delay: delay + i * gap }));
  },
};
