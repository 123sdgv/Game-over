// 墨墨开放 API 的只读中转，给 Game Over 的「单词」用（部署在 gray 的 Vercel，项目 game-over-memo）。
//   为什么要有：墨墨只让「审核通过的应用」所在的网站跨域访问，github.io 直连会被浏览器拦下。
//   做的事很少：只接受 Game Over 的网页发来的请求，只转发几个只读接口，原样带上 Authorization，
//   把墨墨的状态码和内容原样返回并补上跨域头（这样 App 能看到真正的错误，比如 Token 不对）。
//   不记录、不缓存、不保存 Token。
//   Vercel 项目连着这个仓库（Root Directory = relay），改完推到 main 就会自动重新部署。
const UPSTREAM = 'https://open.maimemo.com/open';
const ORIGINS = ['https://123sdgv.github.io', 'http://localhost:8765'];
const ALLOW = [
  ['POST', /^\/api\/v1\/(memo\/)?study\/(get_study_progress|get_today_items|query_study_records)$/],
  ['GET', /^\/api\/v1\/(memo\/)?notepads(\/[A-Za-z0-9_-]{1,64})?$/],
  ['GET', /^\/api\/v1\/(memo\/)?vocabulary$/],
];

function send(res, status, obj) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(obj));
}
const fail = (res, status, code, msg) => send(res, status, { errors: [{ code, msg }], success: false });

async function readBody(req) {
  try {
    const b = req.body;
    if (b !== undefined && b !== null) {
      if (typeof b === 'string') return b;
      if (Buffer.isBuffer(b)) return b.toString('utf8');
      return JSON.stringify(b);
    }
  } catch {}
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return Buffer.concat(chunks).toString('utf8');
}

async function upstream(target, init) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 15000);
  try {
    return await fetch(target, { ...init, signal: ctl.signal });
  } catch (e) {
    e.timeout = ctl.signal.aborted;
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = async (req, res) => {
  const origin = req.headers.origin || '';
  res.setHeader('Cache-Control', 'no-store');
  if (origin && !ORIGINS.includes(origin)) return fail(res, 403, 'relay_origin', '这个中转只给 Game Over 用');
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, Accept');
    res.setHeader('Access-Control-Expose-Headers', 'Retry-After');
    res.setHeader('Access-Control-Max-Age', '86400');
  }
  if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end(); }

  const u = new URL(req.url, 'https://relay.local');
  let p = u.searchParams.get('__p');
  if (p == null) { const m = u.pathname.match(/^\/open(\/.*)?$/); p = m && m[1] ? m[1] : u.pathname; }
  u.searchParams.delete('__p');
  p = '/' + String(p).replace(/^\/+/, '');

  // 自检：用一个假的 Token 请求墨墨，看中转能不能连到墨墨（正常应该回 401）
  if (p === '/__ping') {
    const t0 = Date.now();
    try {
      const r = await upstream(`${UPSTREAM}/api/v1/memo/study/get_study_progress`, {
        method: 'POST', headers: { Authorization: 'Bearer ping', 'Content-Type': 'application/json', Accept: 'application/json' }, body: '{}',
      });
      return send(res, 200, { ok: true, upstream: r.status, ms: Date.now() - t0, region: process.env.VERCEL_REGION || null });
    } catch (e) {
      return send(res, 200, { ok: false, error: e.timeout ? 'timeout' : String(e && e.message), ms: Date.now() - t0, region: process.env.VERCEL_REGION || null });
    }
  }

  if (!ALLOW.some(([m, re]) => m === req.method && re.test(p))) return fail(res, 404, 'relay_path', '中转只转发只读接口');
  const auth = String(req.headers.authorization || '');
  if (!/^Bearer\s+\S+/i.test(auth)) return fail(res, 401, 'relay_token', '缺少 Token');

  const qs = u.searchParams.toString();
  try {
    const r = await upstream(UPSTREAM + p + (qs ? `?${qs}` : ''), {
      method: req.method,
      headers: { Authorization: auth, Accept: 'application/json', ...(req.method === 'POST' ? { 'Content-Type': 'application/json' } : {}) },
      body: req.method === 'POST' ? (await readBody(req)) || '{}' : undefined,
    });
    const text = await r.text();
    res.statusCode = r.status;
    res.setHeader('Content-Type', r.headers.get('content-type') || 'application/json; charset=utf-8');
    const ra = r.headers.get('retry-after');
    if (ra) res.setHeader('Retry-After', ra);
    res.end(text);
  } catch (e) {
    fail(res, 502, e.timeout ? 'relay_timeout' : 'relay_upstream', e.timeout ? '墨墨 15 秒没有回应' : '中转连不上墨墨');
  }
};
