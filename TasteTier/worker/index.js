// TasteTier link preview service (Cloudflare Worker).
//
//   GET /preview?url=<link>  -> { url, title, siteName, image, source }
//   GET /image?url=<image>   -> the image bytes, with CORS headers so the app can resize it
//
// Restaurant websites are read from their Open Graph tags. Google Maps pages don't expose
// the place name or a photo that way, so Maps links get their name from the expanded URL and,
// when a GOOGLE_PLACES_KEY secret is set, a photo from the Places API.

const ALLOWED_ORIGINS = [
  'https://jasonphe.github.io',
  /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/,
];
const UA = 'Mozilla/5.0 (compatible; TasteTierPreview/1.0; +https://jasonphe.github.io/TasteTier/)';
const MAX_HTML_BYTES = 768 * 1024;
const MAX_IMAGE_BYTES = 6 * 1024 * 1024;
const PREVIEW_TTL = 60 * 60 * 24; // 1 day

// Site names that belong to the platform, not the restaurant.
const PLATFORM_NAMES = /^(google( maps)?|yelp|tripadvisor|opentable|resy|tock|exploretock|sevenrooms|instagram|facebook|tiktok|doordash|uber ?eats|grubhub|postmates|seamless|toast|toasttab|square|squarespace|wix|weebly|linktree|bentobox|popmenu|menufy|chownow|slice)$/i;

export default {
  async fetch(req, env, ctx) {
    const origin = req.headers.get('Origin') || '';
    const cors = corsHeaders(origin);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (req.method !== 'GET') return json({ error: 'Only GET is supported' }, 405, cors);
    if (!isAllowedOrigin(origin)) return json({ error: 'Origin not allowed' }, 403, cors);

    const reqUrl = new URL(req.url);
    const target = safeTarget(reqUrl.searchParams.get('url'));
    if (!target) return json({ error: 'Pass a full http(s) link as ?url=' }, 400, cors);

    try {
      if (reqUrl.pathname === '/preview') return await cachedPreview(target, env, ctx, cors);
      if (reqUrl.pathname === '/image') return await proxyImage(target, cors);
      return json({ error: 'Not found' }, 404, cors);
    } catch (e) {
      return json({ error: 'Could not read that link', detail: String(e && e.message || e) }, 502, cors);
    }
  },
};

/* ---------- request guards ---------- */

function isAllowedOrigin(origin) {
  return ALLOWED_ORIGINS.some(o => (typeof o === 'string' ? o === origin : o.test(origin)));
}

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': isAllowedOrigin(origin) ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

// Only public http(s) URLs on default ports; no IP literals, localhost or credentials.
export function safeTarget(raw) {
  let u;
  try { u = new URL(String(raw || '').trim()) } catch { return null }
  if (!/^https?:$/.test(u.protocol) || u.username || u.password || u.port) return null;
  const h = u.hostname.toLowerCase();
  if (!h.includes('.') || h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal')) return null;
  if (/^[\d.]+$/.test(h) || h.includes(':') || h.startsWith('[')) return null;
  return u;
}

function json(body, status, headers, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8', ...extra },
  });
}

/* ---------- /preview ---------- */

async function cachedPreview(target, env, ctx, cors) {
  const cache = caches.default;
  const key = new Request('https://tastetier-cache/preview?url=' + encodeURIComponent(target.href));
  const hit = await cache.match(key);
  if (hit) return json(await hit.json(), 200, cors, { 'X-Cache': 'HIT' });

  const data = await preview(target, env);
  const stored = json(data, 200, {}, { 'Cache-Control': `public, max-age=${PREVIEW_TTL}` });
  ctx.waitUntil(cache.put(key, stored));
  return json(data, 200, cors, { 'X-Cache': 'MISS' });
}

async function preview(target, env) {
  const res = await fetch(target.href, {
    redirect: 'follow',
    headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5', 'Accept-Language': 'en-US,en;q=0.8' },
    cf: { cacheTtl: 3600 },
  });
  const finalUrl = new URL(res.url || target.href);

  if (isGoogleMaps(finalUrl) || isGoogleMaps(target)) {
    return mapsPreview(unwrapConsent(finalUrl), env);
  }
  if (!res.ok) throw new Error(`Site answered ${res.status}`);
  const type = res.headers.get('Content-Type') || '';
  if (!/html|xml/i.test(type)) throw new Error('Link is not a web page');

  const html = await readText(res, MAX_HTML_BYTES);
  return { url: finalUrl.href, source: 'page', ...pagePreview(html, finalUrl) };
}

// Reads at most `limit` bytes of a response body. Meta tags live in <head>, so a prefix is enough.
async function readText(res, limit) {
  const reader = res.body.getReader();
  const chunks = [];
  let size = 0;
  while (size < limit) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.byteLength;
  }
  reader.cancel().catch(() => {});
  const buf = new Uint8Array(Math.min(size, limit));
  let off = 0;
  for (const c of chunks) {
    const part = c.subarray(0, buf.length - off);
    buf.set(part, off);
    off += part.length;
    if (off >= buf.length) break;
  }
  return new TextDecoder('utf-8').decode(buf);
}

/* ---------- HTML parsing (pure, exported for tests) ---------- */

export function decodeEntities(s) {
  const named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', middot: '·', bull: '•', hellip: '…' };
  return String(s || '')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => safeChar(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => safeChar(parseInt(d, 10)))
    .replace(/&([a-z]+);/gi, (m, n) => named[n.toLowerCase()] ?? m)
    .replace(/\s+/g, ' ')
    .trim();
}
function safeChar(n) { try { return String.fromCodePoint(n) } catch { return '' } }

function attr(tag, name) {
  const m = tag.match(new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
  return m ? (m[2] ?? m[3] ?? m[4] ?? '') : null;
}

export function parseMeta(html) {
  const head = html.slice(0, html.search(/<body[\s>]/i) > 0 ? html.search(/<body[\s>]/i) : html.length);
  const meta = {};
  for (const tag of head.match(/<meta\b[^>]*>/gi) || []) {
    const key = (attr(tag, 'property') || attr(tag, 'name') || attr(tag, 'itemprop') || '').toLowerCase();
    const content = attr(tag, 'content');
    if (key && content != null && !(key in meta)) meta[key] = decodeEntities(content);
  }
  const t = head.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (t) meta['<title>'] = decodeEntities(t[1]);
  return meta;
}

// "Katz's Delicatessen - Since 1888 - NYC's oldest deli" -> "Katz's Delicatessen"
export function cleanTitle(s) {
  let t = decodeEntities(s);
  const parts = t.split(/\s+[|·•–—-]\s+|\s*\|\s*/).map(p => p.trim()).filter(Boolean);
  if (parts.length > 1) {
    t = parts.find(p => !/^(home|homepage|welcome|official site|menu|order online)$/i.test(p) && !PLATFORM_NAMES.test(p)) || parts[0];
  }
  t = t.replace(/^(welcome to|home of)\s+/i, '').replace(/\s*[|·•–—-]\s*$/, '').trim();
  if (t.length > 4 && t === t.toUpperCase()) t = t.toLowerCase().replace(/(^|[\s(-])\p{L}/gu, m => m.toUpperCase());
  return t.slice(0, 80);
}

export function pagePreview(html, baseUrl) {
  const m = parseMeta(html);
  const siteName = m['og:site_name'] || m['application-name'] || '';
  const rawTitle = m['og:title'] || m['twitter:title'] || m['<title>'] || '';
  let title = siteName && !PLATFORM_NAMES.test(siteName) ? cleanTitle(siteName) : cleanTitle(rawTitle);
  if (!title) title = cleanTitle(rawTitle);

  let image = m['og:image:secure_url'] || m['og:image'] || m['og:image:url'] || m['twitter:image'] || m['twitter:image:src'] || '';
  if (image) {
    try { image = new URL(image, baseUrl).href.replace(/^http:\/\//, 'https://') } catch { image = '' }
  }
  if (/maps\/api\/staticmap|\/favicon|\.ico(\?|$)/i.test(image)) image = '';
  return { title, siteName, image };
}

/* ---------- Google Maps ---------- */

function isGoogleMaps(u) {
  const h = u.hostname.replace(/^www\./, '');
  return h === 'maps.app.goo.gl' || h.startsWith('maps.google.') ||
    (/^google\.[a-z.]+$/.test(h) && u.pathname.startsWith('/maps')) ||
    (h === 'goo.gl' && u.pathname.startsWith('/maps'));
}

// Visitors from the EU can be bounced to consent.google.com?continue=<real url>.
function unwrapConsent(u) {
  if (u.hostname.startsWith('consent.')) {
    const next = safeTarget(u.searchParams.get('continue'));
    if (next) return next;
  }
  return u;
}

export function mapsPlace(u) {
  const out = { name: '', lat: null, lng: null, placeId: '' };
  const m = u.pathname.match(/\/maps\/place\/([^/]+)/);
  if (m) out.name = decodeURIComponent(m[1].replace(/\+/g, ' ')).split(',')[0].trim();
  if (!out.name) {
    const q = u.searchParams.get('query') || u.searchParams.get('q') || '';
    out.name = q.split(',')[0].trim();
  }
  out.placeId = u.searchParams.get('query_place_id') || '';
  const at = u.pathname.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/) || (u.pathname + u.search).match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
  if (at) { out.lat = +at[1]; out.lng = +at[2] }
  return out;
}

async function mapsPreview(u, env) {
  const place = mapsPlace(u);
  const base = { url: u.href, source: 'maps', title: place.name, siteName: 'Google Maps', image: '' };
  if (!env.GOOGLE_PLACES_KEY || !place.name) return base;

  const body = { textQuery: place.name, maxResultCount: 1 };
  if (place.lat != null) body.locationBias = { circle: { center: { latitude: place.lat, longitude: place.lng }, radius: 2000 } };
  const search = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': env.GOOGLE_PLACES_KEY,
      'X-Goog-FieldMask': 'places.id,places.displayName,places.photos',
    },
    body: JSON.stringify(body),
  });
  if (!search.ok) return base;
  const found = (await search.json()).places?.[0];
  if (!found) return base;

  const result = { ...base, title: found.displayName?.text || place.name, placeId: found.id };
  const photo = found.photos?.[0];
  if (photo) {
    const media = await fetch(`https://places.googleapis.com/v1/${photo.name}/media?maxWidthPx=480&skipHttpRedirect=true&key=${encodeURIComponent(env.GOOGLE_PLACES_KEY)}`);
    if (media.ok) {
      result.image = (await media.json()).photoUri || '';
      result.imageCredit = (photo.authorAttributions || []).map(a => a.displayName).filter(Boolean).join(', ');
    }
  }
  return result;
}

/* ---------- /image ---------- */

async function proxyImage(target, cors) {
  const res = await fetch(target.href, {
    redirect: 'follow',
    headers: { 'User-Agent': UA, Accept: 'image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8' },
    cf: { cacheTtl: 86400, cacheEverything: true },
  });
  if (!res.ok) return json({ error: `Image host answered ${res.status}` }, 502, cors);
  const type = res.headers.get('Content-Type') || '';
  if (!/^image\/(png|jpe?g|gif|webp|avif)/i.test(type)) return json({ error: 'Link is not a supported image' }, 415, cors);
  const len = +res.headers.get('Content-Length') || 0;
  if (len > MAX_IMAGE_BYTES) return json({ error: 'Image is too large' }, 413, cors);
  return new Response(res.body, {
    headers: { ...cors, 'Content-Type': type, 'Cache-Control': 'public, max-age=86400', 'X-Content-Type-Options': 'nosniff' },
  });
}
