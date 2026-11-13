#!/usr/bin/env node
// Overeni ZIVE CDN proti gitu bajt po bajtu (HTTP, ne Azure API) – pred i po prepnuti DNS.
// Bezpecne i lokalne ve Windows: bajty bere `git cat-file --batch` (surove bloby, bez autocrlf), nic nemeni.
//
//   node tools/verify-live.mjs [--base https://cdn.easyportal365.cz] [--sha <commit>] [--sample N] [--concurrency 24]
//
// Kontroluje u kazdeho souboru: HTTP 200, SHA-256 obsahu = git blob, Access-Control-Allow-Origin: *,
// Content-Type podle mapy v azure-blob-lib.mjs, Cache-Control max-age=600.
// Navic: neexistujici soubor = 404 (s ACAO), Range = 206, query string je soucasti cache klice,
// index slozky (diag/), gzip u .js.
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { contentType, isPublished, CACHE_CONTROL } from './azure-blob-lib.mjs';

const args = process.argv.slice(2);
const arg = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const BASE = arg('--base', 'https://cdn.easyportal365.cz').replace(/\/$/, '');
const SHA = arg('--sha', execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim());
const SAMPLE = Number(arg('--sample', 0));
const CONC = Number(arg('--concurrency', 24));
const strictType = !args.includes('--loose-type');

const entries = [];
for (const rec of execFileSync('git', ['ls-tree', '-r', '-z', '--full-tree', SHA], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 }).split('\0')) {
  if (!rec) continue;
  const [meta, p] = rec.split('\t');
  const [, type, oid] = meta.split(' ');
  if (type === 'blob' && isPublished(p)) entries.push({ p, oid });
}
let list = entries;
if (SAMPLE) list = entries.filter((_, i) => i % Math.max(1, Math.floor(entries.length / SAMPLE)) === 0);

// git cat-file --batch: sekvencni cteni blobu
const cat = spawn('git', ['cat-file', '--batch']);
let buf = Buffer.alloc(0); const waiting = [];
cat.stdout.on('data', (d) => { buf = Buffer.concat([buf, d]); drain(); });
function drain() {
  while (waiting.length) {
    const nl = buf.indexOf(10); if (nl < 0) return;
    const head = buf.subarray(0, nl).toString(); const size = Number(head.split(' ')[2]);
    if (buf.length < nl + 1 + size + 1) return;
    const body = buf.subarray(nl + 1, nl + 1 + size); buf = buf.subarray(nl + 1 + size + 1);
    waiting.shift()(Buffer.from(body));
  }
}
let chain = Promise.resolve();
const readBlob = (oid) => (chain = chain.then(() => new Promise((res) => { waiting.push(res); cat.stdin.write(oid + '\n'); })));

const sha256 = (b) => crypto.createHash('sha256').update(b).digest('hex');
const enc = (p) => p.split('/').map(encodeURIComponent).join('/');
const problems = [];
let ok = 0, bytes = 0;
async function check({ p, oid }) {
  const want = await readBlob(oid);
  let res, body;
  for (let a = 0; a < 3; a++) {
    try { res = await fetch(`${BASE}/${enc(p)}`, { headers: { Origin: 'https://contoso.sharepoint.com', 'Accept-Encoding': 'identity' } }); body = Buffer.from(await res.arrayBuffer()); break; }
    catch (e) { if (a === 2) { problems.push(`${p}: sit ${e.message}`); return; } }
  }
  const issues = [];
  if (res.status !== 200) issues.push(`HTTP ${res.status}`);
  else if (sha256(body) !== sha256(want)) issues.push(`obsah se lisi (${body.length} B vs git ${want.length} B)`);
  if (res.headers.get('access-control-allow-origin') !== '*') issues.push(`ACAO=${res.headers.get('access-control-allow-origin')}`);
  // Prazdne soubory (.gitkeep) vraci Front Door bez Content-Type a Cache-Control – nikdo je nenacita.
  if (want.length > 0) {
    const ct = (res.headers.get('content-type') || '').toLowerCase().replace(/\s+/g, '');
    if (strictType && ct !== contentType(p).toLowerCase().replace(/\s+/g, '')) issues.push(`Content-Type=${ct}`);
    const cc = res.headers.get('cache-control') || '';
    if (!cc.includes(CACHE_CONTROL)) issues.push(`Cache-Control=${cc}`);
  }
  if (issues.length) problems.push(`${p}: ${issues.join('; ')}`); else { ok++; bytes += body.length; }
}

async function extra() {
  const out = [];
  const nf = await fetch(`${BASE}/__neexistuje__/${Date.now()}.json`, { headers: { Origin: 'https://contoso.sharepoint.com' } });
  out.push([`404 neexistujiciho souboru`, nf.status === 404 && nf.headers.get('access-control-allow-origin') === '*', `${nf.status} ACAO=${nf.headers.get('access-control-allow-origin')}`]);
  const mp3 = entries.find((e) => e.p.endsWith('.mp3'));
  if (mp3) { const r = await fetch(`${BASE}/${enc(mp3.p)}`, { headers: { Range: 'bytes=0-99' } }); await r.arrayBuffer(); out.push([`Range na mp3`, r.status === 206, `${r.status} ${r.headers.get('content-range')}`]); }
  const q1 = await (await fetch(`${BASE}/diag/probe.js?cb=${Date.now()}a`)).text();
  out.push([`query string ?cb= (probe.js)`, /EP365_PROBE_OK/.test(q1), q1.slice(0, 40)]);
  const ix = await fetch(`${BASE}/diag/`); out.push([`index slozky diag/`, ix.status === 200, `${ix.status} ${ix.headers.get('content-type')}`]);
  const js = entries.find((e) => e.p.endsWith('.js') && e.p.includes('/chunks/'));
  if (js) { const r = await fetch(`${BASE}/${enc(js.p)}`, { headers: { 'Accept-Encoding': 'gzip, br' } }); await r.arrayBuffer(); out.push([`komprese .js`, !!r.headers.get('content-encoding'), r.headers.get('content-encoding') || '(zadna)']); }
  return out;
}

const t0 = Date.now();
console.log(`Overuji ${list.length} z ${entries.length} souboru commitu ${SHA.slice(0, 12)} na ${BASE}`);
let i = 0;
await Promise.all(Array.from({ length: CONC }, async () => { while (i < list.length) { const e = list[i++]; await check(e); if ((ok + problems.length) % 500 === 0) console.log(`  … ${ok + problems.length}/${list.length}`); } }));
cat.stdin.end();
const ex = await extra();
console.log(`\nSoubory: OK ${ok}, problemy ${problems.length}, ${(bytes / 1048576).toFixed(1)} MB, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
for (const p of problems.slice(0, 40)) console.log('  ✗ ' + p);
if (problems.length > 40) console.log(`  … a dalsich ${problems.length - 40}`);
console.log('Chovani:');
for (const [n, pass, d] of ex) console.log(`  ${pass ? '✓' : '✗'} ${n}: ${d}`);
process.exit(problems.length || ex.some((x) => !x[1]) ? 1 : 0);
