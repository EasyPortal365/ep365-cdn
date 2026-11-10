#!/usr/bin/env node
/**
 * sign-trust.mjs — podepsany index vydani `<app>/trust.json` (TECH-DEBT #514).
 *
 * PROC EXISTUJE
 *   Zavadec appky (od noveho .sppkg) spusti jen to, co ma otisk v tomhle indexu
 *   a co je podepsane klicem, ktery zna z .sppkg. Kdo ovladne push do ep365-cdn,
 *   muze menit soubory, ale bez soukromeho klice nesestavi index, ktery by prosel.
 *   Navrh: ep365-docs/03-technical/cdn-integrita-vydani.md.
 *
 * CO DELA
 *   Pro kazdou verzi `<app>/<ver>/manifest.json` spocita SRI (sha384) manifestu a vsech
 *   jeho skriptu typu `path` (bundle v `<app>/chunks/` nebo ve verzni slozce), prida
 *   nejnovejsi ostrou verzi z `releases.json`, podlahu `minSafe` a zakazane verze
 *   (prenasi z predchoziho indexu, meni se jen prepinaci), zvedne `seq` a podepise
 *   ES256 presne bajty dokumentu.
 *
 * BAJTY Z GITU, NE Z DISKU
 *   Repo ma core.autocrlf=true a zadne .gitattributes: pracovni kopie muze mit CRLF,
 *   Pages servi LF z commitu. Otisky se proto pocitaji z obsahu v INDEXU gitu
 *   (`git cat-file --batch` nad `:<cesta>`) – volej po `git add` souboru verze.
 *   Soubor, ktery v indexu neni, verzi z indexu vyradi (nepodepisuje se, co neni vydane).
 *
 * POUZITI
 *   node tools/sign-trust.mjs --app <app> [--min-safe <ver>] [--revoke <ver>[,<ver>]]
 *                             [--unrevoke <ver>] [--key <cesta.pem>] [--dry-run]
 *   node tools/sign-trust.mjs --app <app> --verify-live [--timeout-s 300]
 *   Klic: --key, jinak env EP365_CDN_SIGNING_KEY, jinak ~/.ep365/signing/ep365-cdn-2026.pem.
 *
 * Exit: 0 OK · 1 chyba (nic nezapsano) · 2 verify-live nesedi
 * Vystupy jsou ASCII (konzole PS 5.1).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash, createPrivateKey, createPublicKey, sign, verify } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CDN_REPO = path.resolve(HERE, '..');
const CDN_URL = 'https://cdn.easyportal365.cz/';
const VER_RE = /^\d+(\.\d+){1,3}$/;
const KEYS = JSON.parse(fs.readFileSync(path.join(HERE, 'trust-keys.json'), 'utf8')).keys;

function fail(msg) { console.error('SIGN-TRUST: ' + msg); process.exit(1); }
function arg(name) { const i = process.argv.indexOf(name); return i === -1 ? null : (process.argv[i + 1] || ''); }
const has = (name) => process.argv.indexOf(name) !== -1;
const cmpV = (a, b) => { const x = a.split('.').map(Number), y = b.split('.').map(Number); for (let i = 0; i < Math.max(x.length, y.length); i++) { const d = (x[i] || 0) - (y[i] || 0); if (d) return d; } return 0; };
const sri = (buf) => 'sha384-' + createHash('sha384').update(buf).digest('base64');

const app = arg('--app');
if (!app || !/^[a-z0-9-]+$/.test(app)) fail('chybi --app <app>');
const appDir = path.join(CDN_REPO, app);
if (!fs.existsSync(appDir)) fail('slozka ' + app + '/ neexistuje');
const trustRel = app + '/trust.json';

/** Obsah souboru z indexu gitu (= co pujde do commitu). null, kdyz v indexu neni. */
function makeIndexReader() {
  const cache = new Map();
  return function read(rel) {
    if (cache.has(rel)) return cache.get(rel);
    const r = spawnSync('git', ['-C', CDN_REPO, 'cat-file', 'blob', ':' + rel], { maxBuffer: 256 * 1024 * 1024 });
    const out = r.status === 0 ? r.stdout : null;
    cache.set(rel, out);
    return out;
  };
}

/** Lokalni cesta skriptu z manifestu (base URL musi byt pod CDN appky). */
function scriptRel(m, p) {
  const base = String((m.loaderConfig.internalModuleBaseUrls || [])[0] || '');
  if (base.indexOf(CDN_URL + app + '/') !== 0) return null;
  if (typeof p !== 'string' || /^[a-z]+:/i.test(p) || p.indexOf('..') !== -1 || p.indexOf('//') === 0) return null;
  return base.slice(CDN_URL.length).replace(/\/+$/, '') + '/' + p;
}

function entriesFor(read, versions, warn) {
  const out = {};
  for (const v of versions) {
    const mBuf = read(app + '/' + v + '/manifest.json');
    if (!mBuf) { warn.push(v + ': manifest neni v indexu gitu – vynechano'); continue; }
    let m;
    try { m = JSON.parse(mBuf.toString('utf8')); } catch (e) { warn.push(v + ': manifest neni JSON – vynechano'); continue; }
    const sr = (m.loaderConfig && m.loaderConfig.scriptResources) || {};
    const scripts = {};
    let bad = null;
    for (const name of Object.keys(sr)) {
      const r = sr[name];
      if (!r || r.type === 'component') continue;
      if (r.type !== 'path') { bad = 'zdroj ' + name + ' typu ' + r.type; break; }
      const p = typeof r.path === 'string' ? r.path : r.path && r.path.path;
      const rel = scriptRel(m, p);
      if (!rel) { bad = 'zdroj ' + name + ' mimo CDN appky'; break; }
      const sBuf = read(rel);
      if (!sBuf) { bad = 'skript ' + rel + ' neni v indexu gitu'; break; }
      scripts[name] = sri(sBuf);
    }
    if (bad) { warn.push(v + ': ' + bad + ' – vynechano'); continue; }
    out[v] = { manifest: sri(mBuf), scripts };
  }
  return out;
}

function listVersions() {
  return fs.readdirSync(appDir, { withFileTypes: true })
    .filter(e => e.isDirectory() && VER_RE.test(e.name))
    .map(e => e.name).sort(cmpV);
}

function latestPublic(read) {
  const buf = read(app + '/releases.json') || (fs.existsSync(path.join(appDir, 'releases.json')) ? fs.readFileSync(path.join(appDir, 'releases.json')) : null);
  if (!buf) return null;
  let list;
  try { list = JSON.parse(buf.toString('utf8').replace(/^﻿/, '')); } catch (e) { return null; }
  if (!Array.isArray(list)) list = [list];
  const vs = list.map(x => x && String(x.version)).filter(v => VER_RE.test(v)).sort(cmpV);
  return vs.length ? vs[vs.length - 1] : null;
}

function verifySigned(signed) {
  const k = KEYS.find(x => x.kid === signed.kid);
  if (!k) return 'neznamy kid ' + signed.kid;
  const pub = createPublicKey({ key: k.jwk, format: 'jwk' });
  const ok = verify('sha256', Buffer.from(signed.doc, 'utf8'), { key: pub, dsaEncoding: 'ieee-p1363' }, Buffer.from(signed.sig, 'base64'));
  return ok ? null : 'podpis nesedi';
}

async function verifyLive() {
  const timeoutS = Number(arg('--timeout-s') || 300);
  const local = JSON.parse(fs.readFileSync(path.join(appDir, 'trust.json'), 'utf8'));
  const deadline = Date.now() + timeoutS * 1000;
  let last = '';
  while (Date.now() < deadline) {
    try {
      const r = await fetch(CDN_URL + trustRel + '?t=' + Date.now(), { cache: 'no-store' });
      if (r.ok) {
        const live = await r.json();
        if (live.sig === local.sig) {
          const why = verifySigned(live);
          if (why) { console.log('VERIFY-LIVE ' + app + ': trust.json ' + why); process.exit(2); }
          const doc = JSON.parse(live.doc);
          const newest = Object.keys(doc.versions).sort(cmpV).pop();
          const e = doc.versions[newest];
          const mb = Buffer.from(await (await fetch(CDN_URL + app + '/' + newest + '/manifest.json?t=' + Date.now(), { cache: 'no-store' })).arrayBuffer());
          if (sri(mb) !== e.manifest) { console.log('VERIFY-LIVE ' + app + ': manifest ' + newest + ' na CDN nesedi s indexem'); process.exit(2); }
          const m = JSON.parse(mb.toString('utf8'));
          for (const name of Object.keys(e.scripts)) {
            const sr = m.loaderConfig.scriptResources[name];
            const rel = scriptRel(m, typeof sr.path === 'string' ? sr.path : sr.path.path);
            const sb = Buffer.from(await (await fetch(CDN_URL + rel + '?t=' + Date.now(), { cache: 'no-store' })).arrayBuffer());
            if (sri(sb) !== e.scripts[name]) { console.log('VERIFY-LIVE ' + app + ': skript ' + rel + ' na CDN nesedi s indexem'); process.exit(2); }
          }
          console.log('VERIFY-LIVE ' + app + ': OK (seq ' + doc.seq + ', ' + Object.keys(doc.versions).length + ' verzi, nejnovejsi ' + newest + ' sedi na CDN)');
          return;
        }
        last = 'na CDN je jiny trust.json (Pages jeste nenasadil)';
      } else last = 'HTTP ' + r.status;
    } catch (e) { last = String(e).slice(0, 80); }
    await new Promise(res => setTimeout(res, 15000));
  }
  console.log('VERIFY-LIVE ' + app + ': do ' + timeoutS + ' s nesedi (' + last + ')');
  process.exit(2);
}

async function main() {
  if (has('--verify-live')) return verifyLive();

  const read = makeIndexReader();
  let prev = null;
  const prevBuf = read(trustRel) || (fs.existsSync(path.join(appDir, 'trust.json')) ? fs.readFileSync(path.join(appDir, 'trust.json')) : null);
  if (prevBuf) {
    try {
      const s = JSON.parse(prevBuf.toString('utf8'));
      const why = verifySigned(s);
      if (why) fail('predchozi trust.json neprosel kontrolou (' + why + ') – nepodepisuji nad podvrzenym stavem. Proverit rucne.');
      prev = JSON.parse(s.doc);
    } catch (e) { if (e && e.code) throw e; fail('predchozi trust.json nejde precist'); }
  }

  const warn = [];
  const versions = entriesFor(read, listVersions(), warn);
  const latest = latestPublic(read) || (prev && prev.latest);
  if (!latest) fail('nejde urcit nejnovejsi ostrou verzi (releases.json chybi)');
  if (!versions[latest]) fail('nejnovejsi ostra verze ' + latest + ' neni mezi podepsatelnymi verzemi' + (warn.length ? ' (' + warn.join('; ') + ')' : ''));

  let minSafe = prev && prev.minSafe;
  let revoked = (prev && prev.revoked) ? prev.revoked.slice() : [];
  const ms = arg('--min-safe');
  if (ms !== null) {
    if (!VER_RE.test(ms)) fail('--min-safe musi byt verze');
    if (minSafe && cmpV(ms, minSafe) < 0 && !has('--lower-floor')) fail('podlahu ' + minSafe + ' snizit na ' + ms + ' jen s --lower-floor');
    minSafe = ms;
  }
  const rv = arg('--revoke');
  if (rv) rv.split(',').forEach(v => { if (!VER_RE.test(v)) fail('--revoke: ' + v + ' neni verze'); if (revoked.indexOf(v) === -1) revoked.push(v); });
  const urv = arg('--unrevoke');
  if (urv) revoked = revoked.filter(v => urv.split(',').indexOf(v) === -1);
  revoked.sort(cmpV);
  if (revoked.indexOf(latest) !== -1) fail('nejnovejsi ostra verze ' + latest + ' je na seznamu zakazanych – nejdriv vydat opravu');
  if (minSafe && cmpV(latest, minSafe) < 0) fail('nejnovejsi ostra verze ' + latest + ' je pod podlahou ' + minSafe);

  const doc = { schema: 1, app, seq: (prev ? prev.seq : 0) + 1, issuedAt: new Date().toISOString(), latest, versions };
  if (minSafe) doc.minSafe = minSafe;
  if (revoked.length) doc.revoked = revoked;

  if (has('--dry-run')) {
    console.log('DRY-RUN ' + app + ': seq ' + doc.seq + ', ' + Object.keys(versions).length + ' verzi, latest ' + latest + (minSafe ? ', minSafe ' + minSafe : '') + (revoked.length ? ', revoked ' + revoked.join(',') : ''));
    warn.forEach(w => console.log('  ! ' + w));
    return;
  }

  const keyPath = arg('--key') || process.env.EP365_CDN_SIGNING_KEY || path.join(os.homedir(), '.ep365', 'signing', 'ep365-cdn-2026.pem');
  let priv;
  try {
    const pem = fs.existsSync(keyPath) ? fs.readFileSync(keyPath, 'utf8') : keyPath;
    priv = createPrivateKey(pem);
  } catch (e) { fail('podpisovy klic nejde nacist (' + keyPath + ')'); }
  const der = createPublicKey(priv).export({ type: 'spki', format: 'der' });
  const kid = 'ep365cdn-' + createHash('sha256').update(der).digest('hex').slice(0, 16);
  if (!KEYS.find(k => k.kid === kid)) fail('klic ' + kid + ' neni v tools/trust-keys.json – zavadec by mu neveril');

  const text = JSON.stringify(doc);
  const sig = sign('sha256', Buffer.from(text, 'utf8'), { key: priv, dsaEncoding: 'ieee-p1363' }).toString('base64');
  const signed = { alg: 'ES256', kid, doc: text, sig };
  const why = verifySigned(signed);
  if (why) fail('kontrola vlastniho podpisu: ' + why);
  fs.writeFileSync(path.join(appDir, 'trust.json'), JSON.stringify(signed, null, 1) + '\n');
  console.log('SIGN-TRUST ' + app + ': seq ' + doc.seq + ', ' + Object.keys(versions).length + ' verzi, latest ' + latest
    + (minSafe ? ', minSafe ' + minSafe : '') + (revoked.length ? ', revoked ' + revoked.join(',') : '') + ' (kid ' + kid + ')');
  warn.forEach(w => console.log('  ! ' + w));
}

main().catch(e => fail(String(e && e.stack || e)));
