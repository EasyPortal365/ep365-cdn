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
 * POUZITI
 *   node tools/sign-licenses.mjs [--dry-run] [--force] [--file <nazev>] [--key <cesta.pem>]
 *        podepise soubory bez platneho podpisu (--force: vsechny znovu timto klicem)
 *   node tools/sign-licenses.mjs --check
 *        jen overi lokalni soubory (exit 2, kdyz nektery nema platny podpis)
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
const LIC_DIR = path.resolve(HERE, '..', 'licenses');
const LIVE_BASE = 'https://cdn.easyportal365.cz/licenses/';
const SIG_CONTEXT = 'ep365-license-sig-v1';
const NAME_RE = /^[0-9a-f]{64}$/;
const B64_RE = /^[A-Za-z0-9+/]+={0,2}$/;
const KID_RE = /^ep365lic-[0-9a-f]{16}$/;
const ENVELOPE_KEYS = ['v', 'iv', 'data', 'kid', 'sig'];
const KEYS = JSON.parse(fs.readFileSync(path.join(HERE, 'license-keys.json'), 'utf8')).keys;

function fail(msg) { console.error('SIGN-LICENSES: ' + msg); process.exit(1); }
function arg(name) { const i = process.argv.indexOf(name); return i === -1 ? null : (process.argv[i + 1] || ''); }
const has = (name) => process.argv.indexOf(name) !== -1;

/** Retezec, ktery se podepisuje – doslovna kopie licenseSignedPayload() z balicku. */
export function signedPayload(fileName, env) {
  return [SIG_CONTEXT, String(fileName || '').toLowerCase(), String(env.v), env.iv, env.data].join('\n');
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
  let bad = 0;
  for (const n of names) {
    const env = readEnv(n);
    const prob = env === undefined ? 'neni JSON' : envelopeProblem(env);
    const kid = prob ? null : validSignature(n, env);
    if (kid) console.log('OK    ' + short(n) + '  ' + kid);
    else { bad++; console.log('CHYBA ' + short(n) + '  ' + (prob || (env.sig ? 'podpis nesedi' : 'bez podpisu'))); }
  }
  console.log((bad ? 'NESEDI ' + bad : 'OK') + ' – ' + names.length + ' souboru');
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
          else if (!local || local.sig !== env.sig) why = 'zive != lokalni (propagace?)';
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

const DRY = has('--dry-run'), FORCE = has('--force');
const names = listFiles();
const plan = [];
for (const n of names) {
  const env = readEnv(n);
  if (env === undefined) fail(short(n) + ' neni JSON – nic nezapsano');
  const prob = envelopeProblem(env);
  if (prob) fail(short(n) + ': ' + prob + ' – nic nezapsano');
  const kid = validSignature(n, env);
  if (kid && !FORCE) { console.log('SKIP  ' + short(n) + '  uz podepsano (' + kid + ')'); continue; }
  const out = { v: env.v, iv: env.iv, data: env.data, kid: myKid };
  out.sig = sign('sha256', Buffer.from(signedPayload(n, out), 'utf8'), { key: priv, dsaEncoding: 'ieee-p1363' }).toString('base64');
  if (validSignature(n, out) !== myKid) fail(short(n) + ': self-check podpisu selhal – nic nezapsano');
  plan.push({ n, out, was: env.sig ? 'prepodpis' : 'novy podpis' });
}
for (const p of plan) {
  if (!DRY) fs.writeFileSync(path.join(LIC_DIR, p.n + '.json'), JSON.stringify(p.out, null, 2), 'utf8');
  console.log((DRY ? 'PLAN  ' : 'SIGN  ') + short(p.n) + '  ' + p.was + ' ' + myKid);
}
console.log((DRY ? '[dry-run] ' : '') + 'podepsano ' + plan.length + ' z ' + names.length + (plan.length && !DRY ? ' – dal: git add licenses/*.json, commit, push, --verify-live' : ''));
