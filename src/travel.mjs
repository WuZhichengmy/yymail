import { validateWorkspace } from '../public/travel/model.js';

const initialized = new WeakMap();
const buckets = new Map();
const SCHEMA = `CREATE TABLE IF NOT EXISTS travel_workspaces (
  owner_hash TEXT PRIMARY KEY,
  document TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL
)`;
const json = (data, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });

async function ownerFor(request) {
  const token = request.headers.get('Authorization')?.match(/^Bearer (yy_[a-f0-9]{64})$/)?.[1];
  if (!token) throw Object.assign(new Error('请先设置有效的私人同步码'), { status: 401 });
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}
async function readJSON(request) {
  if (!request.headers.get('Content-Type')?.includes('application/json')) throw Object.assign(new Error('需要 JSON 格式'), { status: 415 });
  if (Number(request.headers.get('Content-Length')) > 262144) throw Object.assign(new Error('数据超过 256 KB'), { status: 413 });
  const reader = request.body?.getReader();
  if (!reader) throw new Error('缺少请求内容');
  const chunks = []; let size = 0;
  while (true) {
    const { done, value } = await reader.read(); if (done) break;
    size += value.length;
    if (size > 262144) { await reader.cancel(); throw Object.assign(new Error('数据超过 256 KB'), { status: 413 }); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size); let offset = 0;
  chunks.forEach(chunk => { bytes.set(chunk, offset); offset += chunk.length; });
  return JSON.parse(new TextDecoder().decode(bytes));
}
function throttle(owner) {
  const now = Date.now();
  if (buckets.size > 2000) for (const [key, entry] of buckets) if (entry.until < now) buckets.delete(key);
  const entry = buckets.get(owner);
  if (!entry || entry.until < now) buckets.set(owner, { count: 1, until: now + 60000 });
  else if (++entry.count > 90) throw Object.assign(new Error('操作太快，请稍后再试'), { status: 429 });
}
async function prepareDB(db) {
  if (!db) throw Object.assign(new Error('云端数据库尚未连接，本机草稿仍会保留'), { status: 503 });
  if (!initialized.has(db)) {
    const task = db.prepare(SCHEMA).run().catch(e => { initialized.delete(db); throw e; });
    initialized.set(db, task);
  }
  await initialized.get(db);
}
async function proxyMap(request, env, url) {
  if (request.method !== 'GET') return json({ error: '不支持的请求' }, 405);
  if (!env.AMAP_JS_KEY || !env.AMAP_JS_SECURITY) return json({ error: '地图配置尚未就绪' }, 503);
  const path = url.pathname.replace('/_AMapService', '');
  // Only proxy SDK map/style endpoints; never allow arbitrary hosts or paths.
  if (!/^\/(v3|v4|v5)\/[a-zA-Z0-9/_-]+$/.test(path)) return json({ error: '无效地图地址' }, 400);
  const upstream = new URL(path, path.startsWith('/v4/map/styles') ? 'https://webapi.amap.com' : 'https://restapi.amap.com');
  upstream.search = url.search;
  upstream.searchParams.set('key', env.AMAP_JS_KEY);
  upstream.searchParams.set('jscode', env.AMAP_JS_SECURITY);
  const response = await fetch(upstream, { signal: AbortSignal.timeout(15000) });
  const headers = new Headers({ 'Content-Type': response.headers.get('Content-Type') || 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  return new Response(response.body, { status: response.status, headers });
}
export async function handleTravel(request, env) {
  try {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin');
    if ((origin && origin !== url.origin) || request.headers.get('Sec-Fetch-Site') === 'cross-site') return json({ error: '不支持跨站请求' }, 403);
    if (url.pathname.startsWith('/_AMapService/')) return await proxyMap(request, env, url);
    if (url.pathname === '/api/travel/config' && request.method === 'GET') {
      return json({ mapKey: env.AMAP_JS_KEY || '', mapReady: Boolean(env.AMAP_JS_KEY && env.AMAP_JS_SECURITY), searchReady: Boolean(env.AMAP_WEB_KEY), cloudReady: Boolean(env.YY_DB) });
    }
    if (!['/api/travel/workspace', '/api/travel/search'].includes(url.pathname)) return json({ error: '接口不存在' }, 404);
    const owner = await ownerFor(request);
    throttle(owner);
    if (url.pathname === '/api/travel/search') {
      if (request.method !== 'POST') return json({ error: '请使用 POST' }, 405);
      if (!env.AMAP_WEB_KEY) return json({ error: '地点搜索尚未配置' }, 503);
      const input = await readJSON(request);
      if (typeof input.query !== 'string' || !input.query.trim() || input.query.length > 100 || typeof input.city !== 'string' || !input.city.trim() || input.city.length > 80) return json({ error: '请填写城市和地点名称' }, 400);
      const target = new URL('https://restapi.amap.com/v3/place/text');
      target.search = new URLSearchParams({ key: env.AMAP_WEB_KEY, keywords: input.query.trim(), city: input.city.trim(), citylimit: 'true', offset: '6', extensions: 'base', output: 'JSON' });
      const response = await fetch(target, { signal: AbortSignal.timeout(15000) });
      if (!response.ok) return json({ error: '地图服务暂时繁忙，请重试' }, 502);
      const data = await response.json();
      if (data.status !== '1') return json({ error: '高德搜索暂不可用，请检查 Key 配额及服务权限', code: data.infocode }, 502);
      const places = (data.pois || []).filter(p => /^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/.test(p.location)).map(p => ({
        poiId: p.id, name: p.name, address: [p.pname, p.cityname, p.adname, typeof p.address === 'string' ? p.address : ''].filter(x => typeof x === 'string').join(''), location: p.location.split(',').map(Number), type: p.type || '',
      }));
      return json({ places });
    }
    await prepareDB(env.YY_DB);
    if (request.method === 'GET') {
      const record = await env.YY_DB.prepare('SELECT document, revision, updated_at FROM travel_workspaces WHERE owner_hash = ?').bind(owner).first();
      return json(record ? { workspace: JSON.parse(record.document), revision: record.revision, updatedAt: record.updated_at } : { workspace: null, revision: 0 });
    }
    if (request.method === 'PUT') {
      const body = await readJSON(request);
      if (!Number.isSafeInteger(body.revision) || body.revision < 0) return json({ error: '保存版本无效' }, 400);
      const workspace = validateWorkspace(body.workspace);
      const updatedAt = new Date().toISOString();
      const record = await env.YY_DB.prepare(`INSERT INTO travel_workspaces (owner_hash, document, revision, updated_at)
        SELECT ?, ?, 1, ? WHERE ? = 0 OR EXISTS (SELECT 1 FROM travel_workspaces WHERE owner_hash = ?)
        ON CONFLICT(owner_hash) DO UPDATE SET document = excluded.document, revision = travel_workspaces.revision + 1, updated_at = excluded.updated_at
        WHERE travel_workspaces.revision = ? RETURNING revision, updated_at`).bind(owner, JSON.stringify(workspace), updatedAt, body.revision, owner, body.revision).first();
      if (!record) return json({ error: '另一台设备已更新行程，请先取回云端版本再修改' }, 409);
      return json({ revision: record.revision, updatedAt: record.updated_at });
    }
    return json({ error: '不支持的请求方法' }, 405);
  } catch (error) {
    const status = error.status || (error instanceof SyntaxError || /行程|地点|文字|酒店|格式/.test(error.message) ? 400 : 500);
    return json({ error: status === 500 ? '服务暂时不可用，本机草稿不会丢失，请稍后重试' : error.message }, status);
  }
}
