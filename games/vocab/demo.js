// 没填 Token 时给看的示例数据：数量、比例都按一个普通的复习日来编，单词是常见的考试词。
import { bjDay, addDays } from './api.js';

const WORDS = `abandon absorb abstract abundant accelerate accommodate accumulate accurate acknowledge acquire adapt adequate adjacent
advocate aggregate allocate ambiguous amend analogy anticipate apparent appreciate arbitrary articulate aspire assert assess
assume attain attribute authentic autonomy beneficial bias bulk capacity cease chronic clarify coherent coincide collapse
commence commodity compatible compensate compile complement comprehensive comprise conceive concurrent confer configure
conform consent consequent considerable consistent constitute constrain consult contemporary controversy convene convert
convince cooperate coordinate core correspond crucial deduce define demonstrate denote derive designate deviate devote
diminish discrete displace dispose distinct distort diverse domain dominate drastic dynamic elaborate eliminate empirical
enable encounter enhance enormous ensure entity equate equip erode estate evaluate eventual evident evolve exceed exclude
exhibit explicit exploit expose external facilitate feasible fluctuate format foundation framework fundamental generate
hierarchy hypothesis identical ideology ignorant illustrate immense impose incentive incidence inclined incorporate index
induce inevitable infer inherent inhibit initial innovate insert insight inspect integral integrity intervene intrinsic
invoke isolate justify layer legislate likewise logic maintain manipulate marginal mature mediate migrate minimal modify
monitor mutual neutral nevertheless notion novel nuclear objective obscure obtain obvious offset ongoing orient outcome`.split(/\s+/);

const STICKY = [
  ['ubiquitous', 19], ['ephemeral', 17], ['meticulous', 15], ['pragmatic', 14], ['scrutinize', 13], ['ambivalent', 12],
  ['conscientious', 11], ['indispensable', 10], ['reconcile', 9], ['substantiate', 9], ['predominant', 8], ['tentative', 8],
  ['alleviate', 7], ['compromise', 7], ['deteriorate', 6], ['prerequisite', 6],
];

function rng(seed) {
  return () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
}

export function demoSnapshot() {
  const r = rng(20261029);
  const today = bjDay();
  const pool = [...WORDS];
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  const total = 120, finished = 74, nNew = 20;
  const items = pool.slice(0, total).map((w, i) => {
    const done = i < finished;
    let first = null;
    if (done) {
      const x = r();
      first = x < 0.62 ? 'FAMILIAR' : x < 0.78 ? 'VAGUE' : x < 0.92 ? 'FORGET' : 'WELL_FAMILIAR';
    }
    return { w, order: i + 1, isNew: false, done, first };
  });
  // 新词插在中间，前面背完的里面有 9 个是新词
  const newIdx = [3, 9, 15, 22, 28, 35, 41, 50, 63, 78, 84, 90, 95, 101, 106, 110, 113, 116, 118, 119];
  newIdx.slice(0, nNew).forEach((i) => { items[i].isNew = true; if (items[i].first === 'WELL_FAMILIAR') items[i].first = 'FAMILIAR'; });

  const history = {};
  for (let i = 13; i >= 1; i--) {
    const day = addDays(today, -i);
    if (i === 6 || i === 11) continue; // 有两天没打开
    const t = 90 + Math.floor(r() * 70);
    const f = i === 9 ? Math.floor(t * 0.55) : t;
    history[day] = { f, t, ms: (14 + Math.floor(r() * 24)) * 60000 };
  }
  history[today] = { f: finished, t: total, ms: 26 * 60000 };

  return {
    at: Date.now(), day: today, demo: true,
    progress: { finished, total, ms: 26 * 60000 + 31000 },
    items,
    plan: 3482,
    forecast: [96, 132, 88, 104, 141, 77, 90, 118, 99, 84].map((n, i) => ({ day: addDays(today, i + 1), n })),
    sticky: STICKY.map(([w, n], i) => ({ w, n, last: i % 3 ? 'FORGET' : 'VAGUE', next: null })),
    stickyMore: false,
    notepads: [
      { id: 'demo-1', title: '考研核心词', brief: '按章节整理的高频词', tags: ['考研'], type: 'NOTEPAD', updated: addDays(today, -2) + 'T09:20:00+08:00' },
      { id: 'demo-2', title: '雅思写作替换词', brief: '写作里用来换掉 important、show 这类词', tags: ['雅思'], type: 'NOTEPAD', updated: addDays(today, -9) + 'T21:04:00+08:00' },
      { id: 'demo-3', title: '读外刊摘的词', brief: '', tags: [], type: 'NOTEPAD', updated: addDays(today, -23) + 'T13:45:00+08:00' },
    ],
    history,
    errors: {},
  };
}

const DEMO_NOTEPADS = {
  'demo-1': [
    { chapter: '第一章 · 动词', words: ['abandon', 'acquire', 'allocate', 'anticipate', 'assess', 'attain', 'clarify', 'compile', 'conceive', 'deduce', 'diminish', 'enhance'] },
    { chapter: '第二章 · 形容词', words: ['abundant', 'adequate', 'ambiguous', 'arbitrary', 'coherent', 'compatible', 'considerable', 'explicit', 'feasible', 'inherent'] },
  ],
  'demo-2': [
    { chapter: '', words: ['crucial', 'fundamental', 'indispensable', 'pivotal', 'demonstrate', 'illustrate', 'reveal', 'indicate', 'substantial', 'considerable', 'facilitate', 'enable'] },
  ],
  'demo-3': [
    { chapter: '', words: ['ubiquitous', 'ephemeral', 'pragmatic', 'scrutinize', 'reconcile', 'tentative', 'nuance', 'paradigm', 'resilient', 'unprecedented'] },
  ],
};
export const demoNotepad = (id) => DEMO_NOTEPADS[id] || [];
