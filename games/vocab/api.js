// 墨墨背单词开放 API（只读）。
//   文档：https://open.maimemo.com/api_bundle.yaml   Token：墨墨 App → 我的 → 更多设置 → 实验功能 → 开放 API
//   频控：10 秒 20 次 / 60 秒 40 次 / 5 小时 2000 次，这里在本地先排队，留一点余量。
//   墨墨出错时的响应不带跨域头，浏览器里只能看到「网络错误」，分不出是 Token 错还是跨域被拦，所以错误分类里有个 'network'。
//   路径：现在的文档是 /api/v1/memo/...，以前的是 /api/v1/...；第一次请求失败时会换旧路径再试一次，哪个能用就记住哪个。
export const DEFAULT_BASE = 'https://open.maimemo.com/open';
const PREFIXES = ['/api/v1/memo', '/api/v1'];

export class ApiError extends Error {
  constructor(kind, message = '', status = 0) {
    super(message || kind);
    this.kind = kind; // network / timeout / auth / rate / server / notfound / bad
    this.status = status;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const hits = [];
async function slot() {
  for (;;) {
    const now = Date.now();
    while (hits.length && now - hits[0] > 60000) hits.shift();
    const recent = hits.filter((t) => now - t < 10000);
    if (recent.length < 18 && hits.length < 38) { hits.push(now); return; }
    const wait = recent.length >= 18 ? 10000 - (now - recent[recent.length - 18]) : 60000 - (now - hits[0]);
    await sleep(Math.max(60, wait + 30));
  }
}

function kindOf(status) {
  if (status === 401 || status === 403) return 'auth';
  if (status === 429) return 'rate';
  if (status === 404) return 'notfound';
  if (status >= 500) return 'server';
  return 'bad';
}

/**
 * @param {{ token: string, base?: string, prefix?: string, onPrefix?: (p: string) => void }} o
 */
export function client({ token, base, prefix, onPrefix }) {
  const root = (base || DEFAULT_BASE).trim().replace(/\/+$/, '');
  let pre = PREFIXES.includes(prefix) ? prefix : PREFIXES[0];
  let settled = false;

  async function raw(p, path, { method = 'GET', body, query } = {}) {
    await slot();
    const url = new URL(root + p + path);
    for (const [k, v] of Object.entries(query || {})) {
      if (Array.isArray(v)) v.forEach((x) => url.searchParams.append(k, x));
      else if (v != null) url.searchParams.set(k, v);
    }
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 20000);
    let res;
    try {
      res = await fetch(url, {
        method,
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined,
        signal: ctl.signal,
        cache: 'no-store',
      });
    } catch {
      throw new ApiError(ctl.signal.aborted ? 'timeout' : 'network');
    } finally {
      clearTimeout(timer);
    }
    const text = await res.text().catch(() => '');
    let json = null;
    try { json = text ? JSON.parse(text) : {}; } catch {}
    const msg = json && Array.isArray(json.errors) && json.errors[0] ? json.errors[0].msg || json.errors[0].code || '' : '';
    if (!res.ok) throw new ApiError(kindOf(res.status), msg, res.status);
    if (!json) throw new ApiError('bad', '墨墨返回的不是 JSON');
    if (json.success === false || (Array.isArray(json.errors) && json.errors.length)) throw new ApiError('bad', msg);
    return json.data && typeof json.data === 'object' && !Array.isArray(json.data) ? json.data : json;
  }

  async function req(path, opts) {
    if (settled) return raw(pre, path, opts);
    try {
      const out = await raw(pre, path, opts);
      settled = true;
      return out;
    } catch (e) {
      if (e.kind !== 'network' && e.kind !== 'notfound') throw e;
      const other = PREFIXES.find((x) => x !== pre);
      const out = await raw(other, path, opts).catch(() => { throw e; });
      pre = other; settled = true;
      if (onPrefix) onPrefix(pre);
      return out;
    }
  }

  return {
    get prefix() { return pre; },
    progress: () => req('/study/get_study_progress', { method: 'POST', body: {} }).then((d) => d.progress || {}),
    today: () => req('/study/get_today_items', { method: 'POST', body: { limit: 1000 } }).then((d) => d.today_items || []),
    records: (body) => req('/study/query_study_records', { method: 'POST', body }),
    notepads: () => req('/notepads', { query: { limit: 30, offset: 0 } }).then((d) => d.notepads || []),
    notepad: (id) => req(`/notepads/${encodeURIComponent(id)}`).then((d) => d.notepad || null),
  };
}

/* ---------- 日期：墨墨按北京时间 ---------- */
const dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' });
export const bjDay = (d = new Date()) => dayFmt.format(d); // YYYY-MM-DD
export function addDays(day, n) {
  const t = new Date(`${day}T12:00:00+08:00`);
  t.setUTCDate(t.getUTCDate() + n);
  return bjDay(t);
}
export const weekday = (day) => new Date(`${day}T12:00:00+08:00`).getUTCDay();

const tagList = (t) => (Array.isArray(t) ? t : typeof t === 'string' && t ? [t] : []);

/**
 * 拉一次完整的数据。onPart(snapshot) 在今日进度到手、全部到手时各调一次，界面可以先画圆环。
 * 次要的部分（预报、顽固词、云词本）失败了不影响主体，只在那一块显示出错。
 */
export async function fetchAll(c, { days = 7, onPart } = {}) {
  const today = bjDay();
  const [progress, items] = await Promise.all([c.progress(), c.today()]);
  const snap = {
    at: Date.now(), day: today, demo: false,
    progress: { finished: +progress.finished || 0, total: +progress.total || 0, ms: +progress.study_time || 0 },
    items: items.map((it) => ({
      w: String(it.voc_spelling || ''), order: +it.order || 0, isNew: !!it.is_new, done: !!it.is_finished, first: it.first_response || null,
    })).sort((a, b) => a.order - b.order),
    plan: null, forecast: null, sticky: null, stickyMore: false, notepads: null, errors: {},
  };
  if (onPart) onPart(snap);

  const forecastDays = Array.from({ length: days }, (_, i) => addDays(today, i + 1));
  const jobs = {
    plan: c.records({ as_count: true }).then((d) => +d.count || 0),
    forecast: Promise.all(forecastDays.map((day) =>
      c.records({ as_count: true, limit: 1, next_study_date: { start: `${day}T00:00:00+08:00`, end: `${day}T23:59:59+08:00` } })
        .then((d) => ({ day, n: +d.count || 0 })))),
    records: c.records({ limit: 1000 }).then((d) => d.records || []),
    notepads: c.notepads(),
  };
  const keys = Object.keys(jobs);
  const out = await Promise.allSettled(keys.map((k) => jobs[k]));
  out.forEach((r, i) => {
    const k = keys[i];
    if (r.status === 'rejected') { snap.errors[k] = r.reason && r.reason.kind || 'bad'; return; }
    if (k === 'plan') snap.plan = r.value;
    if (k === 'forecast') snap.forecast = r.value;
    if (k === 'records') {
      const recs = r.value;
      snap.sticky = recs.filter((x) => tagList(x.tags).includes('STICKING'))
        .map((x) => ({ w: String(x.voc_spelling || ''), n: +x.study_count || 0, last: x.last_response || null, next: x.next_study_date || null }))
        .sort((a, b) => b.n - a.n || a.w.localeCompare(b.w));
      snap.stickyMore = recs.length >= 1000;
    }
    if (k === 'notepads') {
      snap.notepads = r.value.filter((n) => n.status !== 'DELETED').map((n) => ({
        id: n.id, title: n.title || '没有标题', brief: n.brief || '', tags: tagList(n.tags), type: n.type, updated: n.updated_time || n.created_time || null,
      }));
    }
  });
  if (onPart) onPart(snap);
  return snap;
}

/** 云词本正文 → [{ chapter, words: [] }] */
export function chaptersOf(np) {
  const out = [];
  let cur = null;
  for (const it of (np && np.list) || []) {
    const d = it.data || {};
    const name = d.chapter || '';
    if (!cur || cur.chapter !== name) { cur = { chapter: name, words: [] }; out.push(cur); }
    if (it.type === 'WORD' && d.word) cur.words.push(d.word);
  }
  const filled = out.filter((c) => c.words.length);
  if (filled.length || !np || !np.content) return filled;
  // 没有解析结果时，按行粗略拆一下
  const words = String(np.content).split(/\n+/).map((s) => s.trim()).filter((s) => s && !s.startsWith('#'));
  return words.length ? [{ chapter: '', words }] : [];
}
