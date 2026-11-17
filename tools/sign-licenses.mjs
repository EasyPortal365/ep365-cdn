#!/usr/bin/env node
/**
 * sign-licenses.mjs — podpis licencnich souboru `licenses/<nazev>.json` (TECH-DEBT #515).
 *
 * PROC EXISTUJE
 *   Licencni soubor je jen zasifrovany klicem odvozenym ze SALTu v bundlu a z verejneho
 *   tenantId. Kdo ovladne push do ep365-cdn, vyrobi platne zasifrovany soubor s libovolnym
 *   obsahem. Od @ep365/license 0.6.0 appky soubor bez platneho ES256 podpisu odmitnou
 *   (Invalid, bez grace). Tenhle nastroj podepisuje soubory, ktere uz na CDN jsou,
 *   a overuje je lokalne i zive. Novy a zmeneny soubor podepisuje uz Control Center
 *   (Licence → Ulozit vse) a gen-license-files.js.
 *
 * CO SE PODEPISUJE (shodne s ep365-shared/packages/license/src/signature.ts)
 *   'ep365-license-sig-v1' \n <nazev souboru bez .json, lowercase> \n <v> \n <iv> \n <data>
 *   Podpis = ES256, r||s (ieee-p1363) v base64 → pole `sig`; `kid` = 'ep365lic-' + 16 hex
 *   SHA-256 ze SPKI verejneho klice. Obsah se NEDESIFRUJE – nastroj tenantId nezna.
 *   Podepsat lze jen to, co uz v repu je: pred prvnim podpisem over, ze soubory odpovidaji
 *   registry (`node ep365-shared/packages/license/scripts/gen-license-files.js --dry` = vse SKIP).
 *
 * PODPIS v2 (B5 auditu jadra 2026-11, schvaleno Kamim 17. 11.)
 *   Soubor nese navic `iat` (cas podpisu), `exp` (iat + 400 dni) a `sig2` nad
 *   'ep365-license-sig-v2' \n <nazev> \n <v> \n <iv> \n <data> \n <iat> \n <exp>
 *   (doslovna kopie licenseSignedPayloadV2 z balicku). `sig` v1 zustava – starsi appky
 *   a sluzba konektoru ho overuji dal. Appka s @ep365/license >= 0.7.0 si pamatuje nejvyssi
 *   videne iat a starsi soubor nepouzije, takze KAZDY zapis souboru musi nest novy iat
 *   (Control Center i gen-license-files.js podepisuji v2 tez).
 *
 * POUZITI
 *   node tools/sign-licenses.mjs [--dry-run] [--force] [--file <nazev>] [--key <cesta.pem>]
 *        podepise soubory bez platneho podpisu v1+v2 (--force: vsechny znovu timto klicem)
 *   node tools/sign-licenses.mjs --resign-expiring [--days 120] [--dry-run]
 *        prepodepise soubory, kterym do exp zbyva mene nez --days dni, a soubory jen s v1
 *        (mesicni uloha tools/license-resign-job.mjs)
 *   node tools/sign-licenses.mjs --check [--json] [--require-v2]
 *        jen overi lokalni soubory (exit 2, kdyz nektery nema platny podpis; s --require-v2
 *        i soubor jen s v1). --json = souhrn pro health a ulohu (nejblizsi exp)
 *   node tools/sign-licenses.mjs --verify-live [--timeout-s 300]
 *        overi soubory na https://cdn.easyportal365.cz/licenses/ (ceka na propagaci Pages)
 *   Klic: --key, jinak env EP365_LICENSE_SIGNING_KEY, jinak ~/.ep365/signing/ep365-license-2026.pem.
 *
 * Po podpisu: git add jen licenses/*.json + commit + push (nikdy git add -A; repo je PUBLIC).
 * Exit: 0 OK · 1 chyba (nic nezapsano) · 2 overeni nesedi
 * Vystupy jsou ASCII (konzole PS 5.1).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash, createPrivateKey, createPublicKey, sign, verify } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
// --dir = jina slozka (mesicni uloha ji v suchem behu pousti nad KOPII licenses/)
const LIC_DIR = (function () { const i = process.argv.indexOf('--dir'); return i !== -1 && process.argv[i + 1] ? path.resolve(process.argv[i + 1]) : path.resolve(HERE, '..', 'licenses'); })();
const LIVE_BASE = 'https://cdn.easyportal365.cz/licenses/';
const SIG_CONTEXT = 'ep365-license-sig-v1';
const SIG_CONTEXT_V2 = 'ep365-license-sig-v2';
/** Platnost podpisu v2 ve dnech = LICENSE_SIG_VALID_DAYS v balicku (hlida licenseKeys.test.cjs). */
export const VALID_DAYS = 400;
/** Vychozi rezerva pro --resign-expiring = LICENSE_RESIGN_BEFORE_DAYS v balicku. */
export const RESIGN_BEFORE_DAYS = 120;
const DAY_MS = 86400000;
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;
const NAME_RE = /^[0-9a-f]{64}$/;
const B64_RE = /^[A-Za-z0-9+/]+={0,2}$/;
const KID_RE = /^ep365lic-[0-9a-f]{16}$/;
const ENVELOPE_KEYS = ['v', 'iv', 'data', 'kid', 'sig', 'iat', 'exp', 'sig2'];
const KEYS = JSON.parse(fs.readFileSync(path.join(HERE, 'license-keys.json'), 'utf8')).keys;

function fail(msg) { console.error('SIGN-LICENSES: ' + msg); process.exit(1); }
function arg(name) { const i = process.argv.indexOf(name); return i === -1 ? null : (process.argv[i + 1] || ''); }
const has = (name) => process.argv.indexOf(name) !== -1;

/** Retezec, ktery se podepisuje – doslovna kopie licenseSignedPayload() z balicku. */
export function signedPayload(fileName, env) {
  return [SIG_CONTEXT, String(fileName || '').toLowerCase(), String(env.v), env.iv, env.data].join('\n');
}

/** Retezec podpisu v2 – doslovna kopie licenseSignedPayloadV2() z balicku. */
export function signedPayloadV2(fileName, env) {
  return [SIG_CONTEXT_V2, String(fileName || '').toLowerCase(), String(env.v), env.iv, env.data, String(env.iat || ''), String(env.exp || '')].join('\n');
}

const publicKeys = KEYS.map(k => ({ kid: k.kid, key: createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: k.jwk.x, y: k.jwk.y }, format: 'jwk' }) }));

function kidOf(pub) {
  return 'ep365lic-' + createHash('sha256').update(pub.export({ type: 'spki', format: 'der' })).digest('hex').slice(0, 16);
}

/** Obalka ve tvaru, ktery appka cte; jinak duvod. Podpis se tu nekontroluje. */
function envelopeProblem(env) {
  if (!env || typeof env !== 'object' || Array.isArray(env)) return 'neni objekt';
  const extra = Object.keys(env).filter(k => ENVELOPE_KEYS.indexOf(k) === -1);
  if (extra.length) return 'nezname pole: ' + extra.join(',');
  if (env.v !== 1) return 'v neni 1';
  const v2 = ['iat', 'exp', 'sig2'].filter(k => env[k] !== undefined).length;
  if (v2 !== 0 && v2 !== 3) return 'podpis v2 jen castecne (iat/exp/sig2)';
  if (typeof env.iv !== 'string' || !B64_RE.test(env.iv) || Buffer.from(env.iv, 'base64').length !== 12) return 'iv neni 12 bajtu base64';
  if (typeof env.data !== 'string' || !B64_RE.test(env.data) || Buffer.from(env.data, 'base64').length < 17) return 'data nejsou base64 sifra';
  return null;
}

/** Ma obalka platny podpis nekterym z duveryhodnych klicu? Vraci kid, nebo null. */
export function validSignature(fileName, env) {
  if (!env || typeof env.sig !== 'string' || typeof env.kid !== 'string') return null;
  if (!KID_RE.test(env.kid) || !B64_RE.test(env.sig) || !NAME_RE.test(fileName)) return null;
  const pk = publicKeys.find(k => k.kid === env.kid);
  if (!pk) return null;
  const sig = Buffer.from(env.sig, 'base64');
  if (sig.length !== 64) return null;
  try {
    return verify('sha256', Buffer.from(signedPayload(fileName, env), 'utf8'), { key: pk.key, dsaEncoding: 'ieee-p1363' }, sig) ? env.kid : null;
  } catch (e) { return null; }
}

/**
 * Podpis v2: { iat, exp } v ms, kdyz soubor nese platne v2; null = soubor v2 nema;
 * 'bad' = ma ho jen castecne nebo neplatne (appka by soubor odmitla jako pozmeneny).
 */
export function validV2(fileName, env) {
  const any = env && (env.iat !== undefined || env.exp !== undefined || env.sig2 !== undefined);
  if (!any) return null;
  if (typeof env.iat !== 'string' || typeof env.exp !== 'string' || typeof env.sig2 !== 'string') return 'bad';
  if (!ISO_RE.test(env.iat) || !ISO_RE.test(env.exp) || !B64_RE.test(env.sig2)) return 'bad';
  const iat = Date.parse(env.iat), exp = Date.parse(env.exp);
  if (!isFinite(iat) || !isFinite(exp) || exp <= iat) return 'bad';
  const pk = publicKeys.find(k => k.kid === env.kid);
  if (!pk) return 'bad';
  const sig = Buffer.from(env.sig2, 'base64');
  if (sig.length !== 64) return 'bad';
  try {
    return verify('sha256', Buffer.from(signedPayloadV2(fileName, env), 'utf8'), { key: pk.key, dsaEncoding: 'ieee-p1363' }, sig) ? { iat, exp } : 'bad';
  } catch (e) { return 'bad'; }
}

const daysLeft = (exp) => Math.floor((exp - Date.now()) / DAY_MS);

function listFiles() {
  if (!fs.existsSync(LIC_DIR)) fail('slozka licenses/ neexistuje: ' + LIC_DIR);
  const only = arg('--file');
  const all = fs.readdirSync(LIC_DIR).filter(f => f.endsWith('.json')).map(f => f.slice(0, -5));
  const bad = all.filter(n => !NAME_RE.test(n));
  if (bad.length) fail('nazev mimo tvar 64 hex: ' + bad.join(', '));
  if (only) {
    const n = only.replace(/\.json$/, '').toLowerCase();
    if (all.indexOf(n) === -1) fail('soubor ' + n + '.json v licenses/ neni');
    return [n];
  }
  return all.sort();
}

function readEnv(name) {
  const raw = fs.readFileSync(path.join(LIC_DIR, name + '.json'), 'utf8');
  try { return JSON.parse(raw); } catch (e) { return undefined; }
}

const short = (n) => n.slice(0, 12) + '...';

// ─── --check ────────────────────────────────────────────────────────────────
if (has('--check')) {
  const names = listFiles();
  const JSON_OUT = has('--json'), REQ_V2 = has('--require-v2');
  let bad = 0, v1only = 0, nearest = null;
  const rows = [];
  for (const n of names) {
    const env = readEnv(n);
    const prob = env === undefined ? 'neni JSON' : envelopeProblem(env);
    const kid = prob ? null : validSignature(n, env);
    const v2 = kid ? validV2(n, env) : null;
    let line;
    if (!kid) { bad++; line = 'CHYBA ' + short(n) + '  ' + (prob || (env.sig ? 'podpis nesedi' : 'bez podpisu')); }
    else if (v2 === 'bad') { bad++; line = 'CHYBA ' + short(n) + '  podpis v2 nesedi'; }
    else if (v2 === null) { v1only++; if (REQ_V2) bad++; line = (REQ_V2 ? 'CHYBA ' : 'V1    ') + short(n) + '  ' + kid + '  jen v1 (bez casu)'; }
    else { if (nearest === null || v2.exp < nearest) nearest = v2.exp; line = 'OK    ' + short(n) + '  ' + kid + '  exp ' + new Date(v2.exp).toISOString().slice(0, 10) + ' (' + daysLeft(v2.exp) + ' dni)'; }
    rows.push({ name: n, line, exp: v2 && v2 !== 'bad' ? new Date(v2.exp).toISOString() : null });
    if (!JSON_OUT) console.log(line);
  }
  if (JSON_OUT) {
    console.log(JSON.stringify({ checkedAt: new Date().toISOString(), files: names.length, bad, v1only, nearestExp: nearest === null ? null : new Date(nearest).toISOString(), nearestDays: nearest === null ? null : daysLeft(nearest) }));
  } else {
    console.log((bad ? 'NESEDI ' + bad : 'OK') + ' – ' + names.length + ' souboru' + (v1only ? ', jen v1: ' + v1only : '') + (nearest !== null ? ', nejblizsi exp za ' + daysLeft(nearest) + ' dni' : ''));
  }
  process.exit(bad ? 2 : 0);
}

// ─── --verify-live ──────────────────────────────────────────────────────────
if (has('--verify-live')) {
  const timeoutS = Math.max(0, parseInt(arg('--timeout-s') || '300', 10) || 0);
  const names = listFiles();
  const deadline = Date.now() + timeoutS * 1000;
  let pending = names.slice();
  for (;;) {
    const still = [];
    for (const n of pending) {
      let ok = false, why = '';
      try {
        const r = await fetch(LIVE_BASE + n + '.json?cb=' + Date.now(), { cache: 'no-store' });
        if (r.status !== 200) why = 'HTTP ' + r.status;
        else {
          const env = await r.json();
          const local = readEnv(n);
          const kid = validSignature(n, env);
          if (!kid) why = env && env.sig ? 'podpis nesedi' : 'bez podpisu';
          else if (!local || local.sig !== env.sig || local.sig2 !== env.sig2) why = 'zive != lokalni (propagace?)';
          else if (validV2(n, env) === 'bad') why = 'podpis v2 nesedi';
          else ok = true;
        }
      } catch (e) { why = 'sit: ' + String(e && e.message || e).slice(0, 60); }
      if (ok) console.log('LIVE OK  ' + short(n));
      else still.push({ n, why });
    }
    if (!still.length) { console.log('LIVE OK – ' + names.length + ' souboru'); process.exit(0); }
    if (Date.now() >= deadline) {
      still.forEach(s => console.log('LIVE CHYBA ' + short(s.n) + '  ' + s.why));
      process.exit(2);
    }
    pending = still.map(s => s.n);
    console.log('ceka ' + pending.length + ' souboru na propagaci…');
    await new Promise(r => setTimeout(r, 15000));
  }
}

// ─── podpis ─────────────────────────────────────────────────────────────────
const keyPath = arg('--key') || process.env.EP365_LICENSE_SIGNING_KEY || path.join(os.homedir(), '.ep365', 'signing', 'ep365-license-2026.pem');
if (!fs.existsSync(keyPath)) fail('soukromy klic nenalezen: ' + keyPath);
let priv;
try { priv = createPrivateKey(fs.readFileSync(keyPath, 'utf8')); } catch (e) { fail('klic nejde nacist: ' + e.message); }
if (priv.asymmetricKeyType !== 'ec' || (priv.asymmetricKeyDetails || {}).namedCurve !== 'prime256v1') fail('klic neni EC P-256');
const myKid = kidOf(createPublicKey(priv));
if (!publicKeys.some(k => k.kid === myKid)) fail('klic ' + myKid + ' neni v tools/license-keys.json – appky by mu neverily');

const DRY = has('--dry-run'), FORCE = has('--force'), EXPIRING = has('--resign-expiring');
const minDays = EXPIRING ? Math.max(1, parseInt(arg('--days') || String(RESIGN_BEFORE_DAYS), 10) || RESIGN_BEFORE_DAYS) : 0;
const names = listFiles();
const plan = [];
const nowMs = Date.now();
const iatIso = new Date(nowMs).toISOString();
const expIso = new Date(nowMs + VALID_DAYS * DAY_MS).toISOString();
for (const n of names) {
  const env = readEnv(n);
  if (env === undefined) fail(short(n) + ' neni JSON – nic nezapsano');
  const prob = envelopeProblem(env);
  if (prob) fail(short(n) + ': ' + prob + ' – nic nezapsano');
  const kid = validSignature(n, env);
  const v2 = kid ? validV2(n, env) : null;
  const fine = kid && v2 && v2 !== 'bad';
  if (EXPIRING) {
    if (fine && daysLeft(v2.exp) >= minDays) { console.log('SKIP  ' + short(n) + '  exp za ' + daysLeft(v2.exp) + ' dni'); continue; }
  } else if (fine && !FORCE) { console.log('SKIP  ' + short(n) + '  uz podepsano v2 (' + kid + ')'); continue; }
  const out = { v: env.v, iv: env.iv, data: env.data, kid: myKid };
  out.sig = sign('sha256', Buffer.from(signedPayload(n, out), 'utf8'), { key: priv, dsaEncoding: 'ieee-p1363' }).toString('base64');
  out.iat = iatIso;
  out.exp = expIso;
  out.sig2 = sign('sha256', Buffer.from(signedPayloadV2(n, out), 'utf8'), { key: priv, dsaEncoding: 'ieee-p1363' }).toString('base64');
  if (validSignature(n, out) !== myKid) fail(short(n) + ': self-check podpisu v1 selhal – nic nezapsano');
  const chk = validV2(n, out);
  if (!chk || chk === 'bad') fail(short(n) + ': self-check podpisu v2 selhal – nic nezapsano');
  plan.push({ n, out, was: !env.sig ? 'novy podpis' : (v2 && v2 !== 'bad' ? 'prepodpis v2 (exp za ' + daysLeft(v2.exp) + ' dni)' : 'doplneni v2') });
}
for (const p of plan) {
  if (!DRY) fs.writeFileSync(path.join(LIC_DIR, p.n + '.json'), JSON.stringify(p.out, null, 2), 'utf8');
  console.log((DRY ? 'PLAN  ' : 'SIGN  ') + short(p.n) + '  ' + p.was + ' ' + myKid + '  exp ' + expIso.slice(0, 10));
}
console.log((DRY ? '[dry-run] ' : '') + 'podepsano ' + plan.length + ' z ' + names.length + (plan.length && !DRY ? ' – dal: git add licenses/*.json, commit, push, --verify-live' : ''));
