#!/usr/bin/env node
/**
 * pool-version.mjs — publikace runtime verze appky se SDILENYM ULOZISTEM `<app>/chunks/`.
 *
 * CO DELA
 *   Vstup je vystup buildu appky (`release/cdn-version/`: manifest.json + bundle knihovny +
 *   lazy chunky). Nova verze se publikuje jednim ze dvou tvaru:
 *     ULOZISTE   <app>/<verze>/manifest.json         (internalModuleBaseUrls -> <app>/chunks/)
 *                <app>/chunks/<jmeno>_<hash>.js       (jen soubory, ktere tam jeste nejsou)
 *     SAMOSTATNA <app>/<verze>/manifest.json + vsechny .js   (tvar pred ulozistem)
 *   Ulozistem jde verze jen tehdy, kdyz je to bezpecne; jinak postaru - uloziste je uspora,
 *   nikdy podminka vydani:
 *     - kazde jmeno nese content hash (`_<20 hex>.js`),
 *     - kazdy soubor je dosazitelny z bundlu knihovny touz funkci, kterou znackuje prorez
 *       (`reachable` v pool-lib.mjs) - co by prorez nenasel, do uloziste nepatri,
 *     - zadny soubor v HEAD neni pod stejnym jmenem s JINYM obsahem (konflikt = soubor,
 *       na ktery miri starsi verze; prepsat ho nesmime).
 *   Starsi verze se nemeni. Loader ani .sppkg se nemeni (loader cte jen manifest.json;
 *   webpack runtime knihovny bere adresu chunku z adresy, odkud se nacetl bundle).
 *
 * POROVNANI OBSAHU = GIT BLOB, NE SHA SOUBORU NA DISKU
 *   Pracovni strom ep365-cdn ma `core.autocrlf=true`: soubor obnoveny `git checkout` lezi na
 *   disku s CRLF, prestoze v HEAD (a na Pages) je LF. Porovnani SHA souboru na disku by hlasilo
 *   "jiny obsah" u shodneho souboru. Rozhoduje proto blob v HEAD (to, co Pages servíruje)
 *   proti `git hash-object --path` souboru z buildu (to, co by se commitnulo).
 *
 * POUZITI (spousti publish-cdn.ps1 appky; --src absolutni cesta)
 *   node tools/pool-version.mjs --app <slozka> --version <X.Y.Z.W> --src <dir>            # plan
 *   node tools/pool-version.mjs ... --apply [--replace-allowed] [--no-pool]              # zapis
 *   node tools/pool-version.mjs ... --verify-head [--require-pushed]                     # po commitu
 *   node tools/pool-version.mjs ... --verify-live [--timeout-s 300]                      # po pushi
 *
 *   --replace-allowed  verze uz v HEAD je s JINYM obsahem a volajici overil, ze ji nikdo
 *                      nedrzi (neni vydana ani pripnuta) -> smi se nahradit
 *   --no-pool          vynutit samostatnou verzi (nouzovy navrat ke staremu tvaru)
 *
 * NAVRATOVE KODY
 *   0 = hotovo / overeno   1 = chyba   3 = verze existuje s jinym obsahem a prepis nebyl povolen
 *
 * Vse jde na STDOUT (PS 5.1 s $ErrorActionPreference=Stop umi z nativniho stderr udelat
 * vyjimku); vystup je ASCII.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { CDN_URL, POOL_DIR, VER_RE, POOL_NAME_RE, hashOf, poolUrl, versionUrl, manifestRefs, reachable } from './pool-lib.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const has = (n) => argv.indexOf(n) !== -1;
const val = (n) => { const i = argv.indexOf(n); return i !== -1 && argv[i + 1] && argv[i + 1].indexOf('--') !== 0 ? argv[i + 1] : ''; };

const APP = val('--app');
const VER = val('--version');
const SRC = val('--src') ? path.resolve(val('--src')) : '';
const APPLY = has('--apply');
const REPLACE_OK = has('--replace-allowed');
const NO_POOL = has('--no-pool');
const MODE = has('--verify-head') ? 'verify-head' : (has('--verify-live') ? 'verify-live' : 'publish');

function say(m) { console.log(m); }
function fail(m, code) { say('POOL: CHYBA - ' + m); process.exit(code || 1); }

if (!/^[a-z0-9][a-z0-9-]*$/.test(APP)) fail('--app chybi nebo neni jmeno slozky appky');
if (!VER_RE.test(VER)) fail('--version chybi nebo neni cislo verze');
if (!SRC || !fs.existsSync(path.join(SRC, 'manifest.json'))) fail('--src chybi nebo v nem neni manifest.json (' + SRC + ')');

// ------------------------------------------------------------------ git ---
const git = (a, o) => execFileSync('git', ['-C', ROOT].concat(a), Object.assign({ encoding: 'utf8', maxBuffer: 512 * 1024 * 1024 }, o || {}));
function headTree(prefix) {
  let out = '';
  try { out = git(['ls-tree', '-r', 'HEAD', '--', prefix]); } catch (e) { fail('git ls-tree HEAD selhal (repo bez commitu?)'); }
  const m = new Map();
  out.split('\n').forEach(l => { const r = /^\d+\s+blob\s+([0-9a-f]+)\t(.+)$/.exec(l); if (r) m.set(r[2], r[1]); });
  return m;
}
const blobOfFile = (rel, abs) => git(['hash-object', '--path=' + rel, abs]).trim();
const blobOfBuffer = (rel, buf) => execFileSync('git', ['-C', ROOT, 'hash-object', '--stdin', '--path=' + rel], { input: buf, encoding: 'utf8' }).trim();
const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

// ---------------------------------------------------------------- vstup ---
const verRel = APP + '/' + VER;
const poolRel = APP + '/' + POOL_DIR;
const appAbs = path.join(ROOT, APP);
const verAbs = path.join(appAbs, VER);
const poolAbs = path.join(appAbs, POOL_DIR);

const srcManifestBuf = fs.readFileSync(path.join(SRC, 'manifest.json'));
let refs;
try { refs = manifestRefs(srcManifestBuf.toString('utf8')); } catch (e) { fail('manifest v --src: ' + e.message); }
// Build musi byt PRESNE pro tuhle appku a verzi: stabilize-loader.js zapisuje
// internalModuleBaseUrls = <cdn>/<app>/<verze>/. Cokoli jineho = cizi nebo stary build.
if (refs.baseUrls.length !== 1 || refs.baseUrls[0] !== versionUrl(APP, VER)) {
  fail('manifest v --src miri na ' + refs.baseUrls.join(', ') + ', cekano ' + versionUrl(APP, VER) + ' - build neni pro tuhle appku/verzi');
}
const js = fs.readdirSync(SRC, { withFileTypes: true }).filter(e => e.isFile() && e.name.endsWith('.js')).map(e => e.name).sort();
for (const p of refs.paths) if (js.indexOf(p) === -1) fail('manifest odkazuje ' + p + ', ale v --src neni');
const srcText = (name) => { try { return fs.readFileSync(path.join(SRC, name), 'utf8'); } catch (e) { return null; } };

/** Manifest pro tvar ULOZISTE: jediny rozdil proti buildu je internalModuleBaseUrls. */
const pooledManifestBuf = (() => {
  const o = JSON.parse(srcManifestBuf.toString('utf8'));
  o.loaderConfig.internalModuleBaseUrls = [poolUrl(APP)];
  return Buffer.from(JSON.stringify(o, null, 2), 'utf8');
})();

// Ocekavane bloby obou tvaru (co by se commitnulo).
const want = { poolFile: new Map(), verPool: new Map(), verStandalone: new Map() };
for (const f of js) {
  want.poolFile.set(f, blobOfFile(poolRel + '/' + f, path.join(SRC, f)));
  want.verStandalone.set(f, blobOfFile(verRel + '/' + f, path.join(SRC, f)));
}
want.verPool.set('manifest.json', blobOfBuffer(verRel + '/manifest.json', pooledManifestBuf));
want.verStandalone.set('manifest.json', blobOfBuffer(verRel + '/manifest.json', srcManifestBuf));

/** Obsahuje HEAD verzi PRAVE v tomhle tvaru (a u uloziste i vsechny jeji soubory)? */
function headHas(layout, head) {
  const headVer = new Map(Array.from(head).filter(([p]) => p.indexOf(verRel + '/') === 0));
  const exp = layout === 'pool' ? want.verPool : want.verStandalone;
  if (headVer.size !== exp.size) return false;
  for (const [name, blob] of exp) if (headVer.get(verRel + '/' + name) !== blob) return false;
  if (layout === 'pool') for (const [f, blob] of want.poolFile) if (head.get(poolRel + '/' + f) !== blob) return false;
  return true;
}

// ============================================================ VERIFY-HEAD ===
if (MODE === 'verify-head') {
  const head = headTree(APP + '/');
  const layout = headHas('pool', head) ? 'pool' : (headHas('standalone', head) ? 'standalone' : '');
  if (!layout) fail('HEAD neobsahuje verzi ' + verRel + ' ve tvaru tohoto buildu (ani uloziste, ani samostatnou) - commit neni kompletni');
  if (has('--require-pushed')) {
    let ahead = '';
    try { ahead = git(['rev-list', '--count', '@{u}..HEAD']).trim(); } catch (e) { fail('nejde zjistit stav vuci origin (@{u})'); }
    if (ahead !== '0') fail('HEAD je ' + ahead + ' commit(u) pred origin - vydani neni na CDN (lekce 40.13)');
  }
  const n = layout === 'pool' ? (1 + want.poolFile.size) : want.verStandalone.size;
  say('POOL: HEAD OK - ' + verRel + ' ' + (layout === 'pool' ? 'ULOZISTE' : 'SAMOSTATNA') + ', ' + n + ' souboru s bloby shodnymi s buildem');
  process.exit(0);
}

// ============================================================ VERIFY-LIVE ===
if (MODE === 'verify-live') {
  const head = headTree(APP + '/');
  const layout = headHas('pool', head) ? 'pool' : (headHas('standalone', head) ? 'standalone' : '');
  if (!layout) fail('HEAD neobsahuje verzi ' + verRel + ' ve tvaru tohoto buildu - neni co overovat');
  const base = CDN_URL;
  const items = [];
  const push = (rel, buildBuf) => {
    const blob = head.get(rel);
    const headBuf = execFileSync('git', ['-C', ROOT, 'cat-file', 'blob', blob], { maxBuffer: 256 * 1024 * 1024 });
    items.push({ rel, url: base + rel, sha: sha256(headBuf), buildSha: sha256(buildBuf), size: headBuf.length });
  };
  if (layout === 'pool') {
    push(verRel + '/manifest.json', pooledManifestBuf);
    for (const f of js) push(poolRel + '/' + f, fs.readFileSync(path.join(SRC, f)));
  } else {
    push(verRel + '/manifest.json', srcManifestBuf);
    for (const f of js) push(verRel + '/' + f, fs.readFileSync(path.join(SRC, f)));
  }
  const notBuild = items.filter(i => i.sha !== i.buildSha);
  if (notBuild.length) fail('obsah v HEAD se lisi od buildu (normalizace koncu radku?): ' + notBuild.map(i => i.rel).join(', '));
  const t = parseInt(val('--timeout-s') || '300', 10);
  const deadline = Date.now() + (isNaN(t) ? 300 : t) * 1000;
  let round = 0, last = [];
  for (;;) {
    round++;
    last = [];
    for (const it of items) {
      let status = 0, got = '', acao = '';
      try {
        const r = await fetch(it.url + '?cb=' + Date.now() + '-' + round, { cache: 'no-store' });
        status = r.status;
        acao = r.headers.get('access-control-allow-origin') || '';
        got = sha256(Buffer.from(await r.arrayBuffer()));
      } catch (e) { status = -1; }
      last.push({ it, status, ok: status === 200 && got === it.sha, acao });
    }
    const bad = last.filter(x => !x.ok);
    if (!bad.length) break;
    if (Date.now() > deadline) break;
    say('POOL: kolo ' + round + ' - ' + (last.length - bad.length) + '/' + last.length + ' OK, cekam na deploy (' + bad.map(x => x.it.rel.split('/').pop() + '=' + x.status).join(', ') + ')');
    await new Promise(r => setTimeout(r, 15000));
  }
  for (const x of last) {
    say('  ' + (x.ok ? 'OK   ' : 'CHYBA') + ' ' + x.status + ' ' + (x.ok ? 'sha shodne' : 'sha/status nesedi') + ' ' + (x.acao ? 'ACAO=' + x.acao : 'ACAO=(zadne)') + ' ' + x.it.url);
  }
  const nbad = last.filter(x => !x.ok).length;
  // Konec pres process.exitCode, NE process.exit(): na Windows (Node 24) process.exit() hned po fetch()
  // obcas spadne v libuv ("Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)", kod padu 3221226505) a publikace
  // pak hlasila falesne NEPINOVAT (helpdesk 1.3.0.4; lekce 25.63). Chyby PRED prvnim fetch smi dal koncit pres fail().
  if (nbad) {
    say('POOL: CHYBA - ' + nbad + ' z ' + last.length + ' souboru neni na CDN ve spravnem obsahu (po ' + round + ' kolech)');
    process.exitCode = 1;
  } else {
    say('POOL: LIVE OK - ' + last.length + ' souboru verze ' + verRel + ' vraci 200 a obsah (SHA-256) = build');
    process.exitCode = 0;
  }
} else {
// Publikace je ve vetvi else: verify-live konci pres process.exitCode a na zapis propadnout nesmi.

  // ============================================================== PUBLISH ===
  // Rozpracovany CIZI stav na cestach, na ktere sahame = nevime, co se deje -> stop.
  // Netrackovane soubory (??) jsou zbytky po nedokoncene publikaci: na Pages nejsou,
  // takze je smime nahradit.
  const status = git(['status', '--porcelain=v1', '-uall', '--', verRel, poolRel]).split('\n').filter(Boolean);
  const foreign = status.filter(l => l.slice(0, 2) !== '??');
  if (foreign.length) fail('na ' + verRel + ' / ' + poolRel + ' je rozpracovana zmena, ktera neni z teto publikace:\n  ' + foreign.join('\n  '));

  const head = headTree(APP + '/');
  const headVerCount = Array.from(head.keys()).filter(p => p.indexOf(verRel + '/') === 0).length;
  let verState = 'absent';
  if (headVerCount) verState = headHas('pool', head) ? 'same-pool' : (headHas('standalone', head) ? 'same-standalone' : 'different');

  if (verState === 'same-pool' || verState === 'same-standalone') {
    say('POOL: verze ' + verRel + ' uz na CDN je a obsah je SHODNY s buildem (' + (verState === 'same-pool' ? 'ULOZISTE' : 'SAMOSTATNA') + ') - nic nezapisuji');
    process.exit(0);
  }
  if (verState === 'different' && !REPLACE_OK) {
    say('POOL: verze ' + verRel + ' uz na CDN je a ma JINY obsah nez tento build - prepis nepovolen.');
    process.exit(3);
  }

  // Smi verze do uloziste?
  const reasons = [];
  if (NO_POOL) reasons.push('vynuceno --no-pool');
  for (const f of js) if (!POOL_NAME_RE.test(f)) reasons.push(f + ': jmeno bez content hashe');
  {
    const byHash = new Map();
    js.forEach(f => { const h = hashOf(f); if (h) byHash.set(h, f); });
    const marked = reachable(refs.paths, byHash, srcText);
    for (const f of js) if (!marked.has(f)) reasons.push(f + ': z bundlu knihovny na nej nevede hash - prorez by ho nenasel');
  }
  const add = [], reuse = [];
  for (const f of js) {
    const inHead = head.get(poolRel + '/' + f);
    if (!inHead) { add.push(f); continue; }
    if (inHead === want.poolFile.get(f)) reuse.push(f);
    else reasons.push(f + ': v ulozisti uz je pod stejnym jmenem JINY obsah (konflikt)');
  }
  const layout = reasons.length ? 'standalone' : 'pool';
  const sizeOf = (f) => fs.statSync(path.join(SRC, f)).size;
  const mb = (b) => (b / 1048576).toFixed(2);

  if (layout === 'pool') {
    say('POOL: ' + verRel + ' -> ULOZISTE ' + poolRel + '/ (' + add.length + ' novych, ' + reuse.length + ' znovu pouzitych = usetreno '
      + mb(reuse.reduce((s, f) => s + sizeOf(f), 0)) + ' MB; verzni slozka = jen manifest.json)');
  } else {
    say('POOL: ' + verRel + ' -> SAMOSTATNA VERZE (tvar pred ulozistem). Duvod:');
    reasons.forEach(r => say('  - ' + r));
  }
  if (verState === 'different') say('POOL: verze ' + verRel + ' mela jiny obsah a volajici overil, ze ji nikdo nedrzi - nahrazuji ji.');
  if (!APPLY) { say('POOL: PLAN (nic nezapsano). Spust s --apply.'); process.exit(0); }

  // ---------------------------------------------------------------- zapis ---
  // Verzni slozku vzdy stavime nacisto (zbytky po nedokoncenem behu, nahrazovana verze).
  fs.rmSync(verAbs, { recursive: true, force: true });
  const copyChecked = (f, destDir, rel, blob) => {
    fs.mkdirSync(destDir, { recursive: true });
    const dest = path.join(destDir, f);
    fs.copyFileSync(path.join(SRC, f), dest);
    if (blobOfFile(rel, dest) !== blob) fail('po kopii nesedi obsah ' + rel);
  };
  if (layout === 'pool') {
    // Nejdriv uloziste, manifest AZ NAKONEC: verze s manifestem bez svych souboru nikdy nevznikne
    // (preruseny beh zanecha nanejvys neodkazovane soubory v ulozisti, ty smete prorez).
    for (const f of add) copyChecked(f, poolAbs, poolRel + '/' + f, want.poolFile.get(f));
    fs.mkdirSync(verAbs, { recursive: true });
    fs.writeFileSync(path.join(verAbs, 'manifest.json'), pooledManifestBuf);
    if (blobOfFile(verRel + '/manifest.json', path.join(verAbs, 'manifest.json')) !== want.verPool.get('manifest.json')) fail('po zapisu nesedi manifest');
  } else {
    for (const f of js) copyChecked(f, verAbs, verRel + '/' + f, want.verStandalone.get(f));
    fs.writeFileSync(path.join(verAbs, 'manifest.json'), srcManifestBuf);
    if (blobOfFile(verRel + '/manifest.json', path.join(verAbs, 'manifest.json')) !== want.verStandalone.get('manifest.json')) fail('po zapisu nesedi manifest');
  }
  say('POOL: zapsano (' + (layout === 'pool' ? add.length + ' soubor(u) do ' + poolRel + '/ + manifest' : (js.length + 1) + ' souboru do ' + verRel + '/') + ')');
  process.exit(0);
}
