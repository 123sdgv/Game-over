// 同一个中转的「边缘网络」版本（Vercel Edge Runtime，在离用户最近的节点上跑）。
//   香港的 Node 函数连不上墨墨时用来对比：出口网络不一样，可能连得上。规则和 open.js 完全一样。
export const config = { runtime: 'edge' };

const UPSTREAM = 'https://open.maimemo.com/open';
const ORIGINS = ['https://123sdgv.github.io', 'http://localhost:8765'];
const ALLOW = [
  ['POST', /^\/api\/v1\/(memo\/)?study\/(get_study_progress|get_today_items|query_study_records)$/],
  ['GET', /^\/api\/v1\/(memo\/)?notepads(\/[A-Za-z0-9_-]{1,64})?$/],
  ['GET', /^\/api\/v1\/(memo\/)?vocabulary$/],
];

const why = (e) => (e && e.cause && (e.cause.code || e.cause.message)) || (e && (e.code || e.message)) || String(e);

async function upstream(target, init, ms = 15000) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  try {
    return await fetch(target, { ...init, signal: ctl.signal });
  } catch (e) {
    e.timeout = ctl.signal.aborted;
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

export default async function handler(request) {
  const origin = request.headers.get('origin') || '';
  const headers = { 'Cache-Control': 'no-store' };
  const json = (status, obj) => new Response(JSON.stringify(obj), { status, headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8' } });
  const fail = (status, code, msg) => json(status, { errors: [{ code, msg }], success: false });
  if (origin && !ORIGINS.includes(origin)) return fail(403, 'relay_origin', '这个中转只给 Game Over 用');
  if (origin) Object.assign(headers, {
    'Access-Control-Allow-Origin': origin, Vary: 'Origin',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, Accept',
    'Access-Control-Expose-Headers': 'Retry-After',
    'Access-Control-Max-Age': '86400',
  });
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });

  const u = new URL(request.url);
  let p = u.searchParams.get('__p');
  if (p == null) { const m = u.pathname.match(/^\/edge(\/.*)?$/); p = m && m[1] ? m[1] : u.pathname; }
  u.searchParams.delete('__p');
  p = '/' + String(p).replace(/^\/+/, '');

  if (p === '/__ping') {
    const out = { region: process.env.VERCEL_REGION || null, runtime: 'edge', api: null, site: null };
    let t0 = Date.now();
    try {
      const r = await upstream(`${UPSTREAM}/api/v1/memo/study/get_study_progress`, {
        method: 'POST', headers: { Authorization: 'Bearer ping', 'Content-Type': 'application/json', Accept: 'application/json' }, body: '{}',
      });
      out.api = { status: r.status, ms: Date.now() - t0 };
    } catch (e) { out.api = { error: e.timeout ? 'timeout' : why(e), ms: Date.now() - t0 }; }
    t0 = Date.now();
    try {
      const r = await upstream('https://www.maimemo.com/', { method: 'HEAD' });
      out.site = { status: r.status, ms: Date.now() - t0 };
    } catch (e) { out.site = { error: e.timeout ? 'timeout' : why(e), ms: Date.now() - t0 }; }
    out.ok = !!(out.api && out.api.status);
    return json(200, out);
  }

  if (!ALLOW.some(([m, re]) => m === request.method && re.test(p))) return fail(404, 'relay_path', '中转只转发只读接口');
  const auth = request.headers.get('authorization') || '';
  if (!/^Bearer\s+\S+/i.test(auth)) return fail(401, 'relay_token', '缺少 Token');

  const qs = u.searchParams.toString();
  try {
    const r = await upstream(UPSTREAM + p + (qs ? `?${qs}` : ''), {
      method: request.method,
      headers: { Authorization: auth, Accept: 'application/json', ...(request.method === 'POST' ? { 'Content-Type': 'application/json' } : {}) },
      body: request.method === 'POST' ? (await request.text()) || '{}' : undefined,
    });
    const text = await r.text();
    const h = { ...headers, 'Content-Type': r.headers.get('content-type') || 'application/json; charset=utf-8' };
    const ra = r.headers.get('retry-after');
    if (ra) h['Retry-After'] = ra;
    return new Response(text, { status: r.status, headers: h });
  } catch (e) {
    return fail(502, e.timeout ? 'relay_timeout' : 'relay_upstream', e.timeout ? '墨墨 15 秒没有回应' : '中转连不上墨墨');
  }
}
