// Sdilena knihovna pro nasazeni CDN do Azure Blob Storage (static website, kontejner $web).
// Bez zavislosti – jen node:crypto + fetch (Node 20+).
//
// Prihlaseni:
//   - GitHub Actions: federovana identita (OIDC) – AZURE_CLIENT_ID + AZURE_TENANT_ID, workflow s `id-token: write`
//   - lokalne: AZURE_STORAGE_TOKEN (napr. z PowerShellu: Get-AzAccessToken -ResourceUrl https://storage.azure.com/)
import crypto from 'node:crypto';

export const ACCOUNT = process.env.STORAGE_ACCOUNT || 'ep365cdnweu';
export const WEB = '$web';
export const STATE_CONTAINER = 'deploy';
export const STATE_BLOB = 'state.json';
const XMS_VERSION = '2023-11-03';

// Stejne chovani jako GitHub Pages: max-age=600 na vsechno (appky s tim pocitaji – lessons, vault
// overwritten-stable-bundle-keeps-serving-old-code). Nemenit bez revize cache-bustingu.
export const CACHE_CONTROL = 'max-age=600';

const MIME = {
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.pdf': 'application/pdf',
  '.zip': 'application/zip',
  '.gz': 'application/gzip',
  '.csv': 'text/csv; charset=utf-8',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.enc': 'application/octet-stream',
  '.sppkg': 'application/octet-stream',
  '.ps1': 'text/plain; charset=utf-8',
  '.yml': 'text/plain; charset=utf-8',
  '.yaml': 'text/plain; charset=utf-8',
};
export function contentType(p) {
  const base = p.split('/').pop();
  const dot = base.lastIndexOf('.');
  const ext = dot > 0 ? base.slice(dot).toLowerCase() : '';
  return MIME[ext] || 'application/octet-stream';
}

// Soubory repa, ktere se na CDN nenahravaji (jen konfigurace repa / GitHub Pages).
export function isPublished(p) {
  if (p.startsWith('.github/')) return false;
  if (p === '.gitignore' || p === '.nojekyll' || p === 'CNAME' || p === '.publish.lock') return false;
  return true;
}

// Poradi nahravani: nejdriv soubory s obsahem (bundly, chunky, zvuk, fonty), pak "ukazatele"
// (json, stabilni zavadece, index.html), ktere na ne odkazuji – aby klient nikdy nedostal
// ukazatel na soubor, ktery jeste neni nahrany. Mazani az nakonec.
export function phaseOf(p) {
  const base = p.split('/').pop();
  if (base.endsWith('.json')) {
    if (/^(versions|catalog|releases|trust)\.json$/.test(base)) return 3;
    return 2;
  }
  if (/-loader\.js$/.test(base)) return 2;
  if (base === 'index.html') return 2;
  return 1;
}

export function md5b64(buf) { return crypto.createHash('md5').update(buf).digest('base64'); }
export function gitBlobSha1(buf) {
  return crypto.createHash('sha1').update(`blob ${buf.length}\0`).update(buf).digest('hex');
}

export async function getToken() {
  if (process.env.AZURE_STORAGE_TOKEN) return process.env.AZURE_STORAGE_TOKEN;
  const { ACTIONS_ID_TOKEN_REQUEST_URL: u, ACTIONS_ID_TOKEN_REQUEST_TOKEN: t, AZURE_CLIENT_ID: cid, AZURE_TENANT_ID: tid } = process.env;
  if (!u || !t || !cid || !tid) throw new Error('Chybi prihlaseni: AZURE_STORAGE_TOKEN, nebo OIDC v GitHub Actions (id-token: write + AZURE_CLIENT_ID + AZURE_TENANT_ID).');
  const idr = await fetch(`${u}&audience=${encodeURIComponent('api://AzureADTokenExchange')}`, { headers: { Authorization: `bearer ${t}` } });
  if (!idr.ok) throw new Error(`OIDC token GitHub: HTTP ${idr.status}`);
  const { value: assertion } = await idr.json();
  const body = new URLSearchParams({
    client_id: cid, grant_type: 'client_credentials', scope: 'https://storage.azure.com/.default',
    client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer', client_assertion: assertion,
  });
  const tr = await fetch(`https://login.microsoftonline.com/${tid}/oauth2/v2.0/token`, { method: 'POST', body });
  const tj = await tr.json();
  if (!tr.ok || !tj.access_token) throw new Error(`Entra token: HTTP ${tr.status} ${tj.error || ''} ${tj.error_description || ''}`);
  return tj.access_token;
}

export function blobUrl(container, name) {
  const enc = name.split('/').map(encodeURIComponent).join('/');
  return `https://${ACCOUNT}.blob.core.windows.net/${container === WEB ? '$web' : container}/${enc}`;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function call(token, url, init = {}, okStatuses = [200, 201, 202]) {
  let last;
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      const res = await fetch(url, {
        ...init,
        headers: { Authorization: `Bearer ${token}`, 'x-ms-version': XMS_VERSION, 'x-ms-date': new Date().toUTCString(), ...(init.headers || {}) },
      });
      if (okStatuses.includes(res.status)) return res;
      const text = await res.text().catch(() => '');
      last = new Error(`${init.method || 'GET'} ${url} -> HTTP ${res.status} ${text.slice(0, 300)}`);
      if (res.status !== 429 && res.status < 500) throw last;
    } catch (e) {
      last = e;
      if (/HTTP 4\d\d/.test(e.message) && !/HTTP 429/.test(e.message)) throw e;
    }
    await sleep(500 * 2 ** attempt);
  }
  throw last;
}

export async function putBlob(token, container, name, buf, { type, cacheControl } = {}) {
  const md5 = md5b64(buf);
  await call(token, blobUrl(container, name), {
    method: 'PUT', body: buf,
    headers: {
      'x-ms-blob-type': 'BlockBlob',
      'Content-MD5': md5,                       // sluzba overi, ze dosly presne tyto bajty
      'x-ms-blob-content-md5': md5,             // ulozi se jako vlastnost – podle ni overuje verify
      'x-ms-blob-content-type': type || contentType(name),
      'x-ms-blob-cache-control': cacheControl ?? CACHE_CONTROL,
      'Content-Length': String(buf.length),
    },
  }, [201]);
  return md5;
}

export async function deleteBlob(token, container, name) {
  await call(token, blobUrl(container, name), { method: 'DELETE' }, [202, 404]);
}

export async function getBlobText(token, container, name) {
  const res = await call(token, blobUrl(container, name), {}, [200, 404]);
  if (res.status === 404) return null;
  return res.text();
}

export async function ensureContainer(token, name) {
  await call(token, `https://${ACCOUNT}.blob.core.windows.net/${name}?restype=container`, { method: 'PUT' }, [201, 409]);
}

const xmlUnescape = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
export async function listBlobs(token, container) {
  const out = new Map();
  let marker = '';
  do {
    const url = `https://${ACCOUNT}.blob.core.windows.net/${container === WEB ? '$web' : container}?restype=container&comp=list&maxresults=5000${marker ? `&marker=${encodeURIComponent(marker)}` : ''}`;
    const xml = await (await call(token, url)).text();
    for (const m of xml.matchAll(/<Blob>([\s\S]*?)<\/Blob>/g)) {
      const b = m[1];
      const name = xmlUnescape((b.match(/<Name>([\s\S]*?)<\/Name>/) || [])[1] || '');
      out.set(name, {
        md5: (b.match(/<Content-MD5>([^<]*)<\/Content-MD5>/) || [])[1] || '',
        type: xmlUnescape((b.match(/<Content-Type>([^<]*)<\/Content-Type>/) || [])[1] || ''),
        cache: xmlUnescape((b.match(/<Cache-Control>([^<]*)<\/Cache-Control>/) || [])[1] || ''),
        size: Number((b.match(/<Content-Length>(\d+)<\/Content-Length>/) || [])[1] || 0),
      });
    }
    marker = (xml.match(/<NextMarker>([^<]*)<\/NextMarker>/) || [])[1] || '';
  } while (marker);
  return out;
}

export async function pool(items, size, fn) {
  let i = 0, done = 0;
  const errors = [];
  async function worker() {
    while (i < items.length) {
      const it = items[i++];
      try { await fn(it); } catch (e) { errors.push(e); }
      done++;
      if (done % 250 === 0) console.log(`  … ${done}/${items.length}`);
    }
  }
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, worker));
  if (errors.length) { for (const e of errors.slice(0, 10)) console.error('  CHYBA', e.message); throw new Error(`${errors.length} operaci selhalo`); }
}
