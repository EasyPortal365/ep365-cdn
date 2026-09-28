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
 * LICENCE KNIHOVEN TRETICH STRAN (`<bundle>.js.LICENSE.txt`)
 *   Webpack vyjme licencni komentare knihoven do souboru vedle bundlu a bundle na nej odkazuje
 *   komentarem v hlavicce ("For license information please see <x>.js.LICENSE.txt"). Licence
 *   jde tam, kam jde jeji bundle (uloziste / verzni slozka) - ale JEN kdyz na ni bundle v --src
 *   takhle odkazuje. Licence bez bundlu nebo bez odkazu je sirotek: nepublikuje se a plan to
 *   rekne ("licence bez odkazu v bundlu"). Licence, kterou repo ignoruje (.gitignore; dnes zadna -
 *   allowlist ma !*.js.LICENSE.txt), se NEPISE vubec.
 *   Porovnani build x HEAD je zpetne kompatibilni s verzemi vydanymi pred licencemi:
 *     - licence se do presneho poctu souboru verze nepocitaji,
 *     - licence, ktera v HEAD JE, musi mit blob shodny s buildem (jinak jiny obsah),
 *     - chybejici licence verzi neshazuje: verze je shodna a --apply doplni JEN chybejici
 *       licence (aditivne - .js ani manifest se nemeni).
 *   V ulozisti plati totez co u .js: licence, ktera v HEAD je, se neprepisuje; jina licence
 *   pod stejnym jmenem = konflikt -> verze jde samostatne. Licence ke znovu pouzitemu
 *   chunku, ktera v HEAD chybi, se doplni.
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
 *   node tools/pool-version.mjs ... --verify-head [--require-pushed] [--require-licenses] # po commitu
 *   node tools/pool-version.mjs ... --verify-live [--timeout-s 300]                      # po pushi
 *
 *   --replace-allowed  verze uz v HEAD je s JINYM obsahem a volajici overil, ze ji nikdo
 *                      nedrzi (neni vydana ani pripnuta) -> smi se nahradit
 *   --no-pool          vynutit samostatnou verzi (nouzovy navrat ke staremu tvaru)
 *   --require-licenses (--verify-head) v HEAD musi byt kazda licence buildu, kterou repo
 *                      neignoruje; bez nej se chybejici licence jen ohlasi (verze vydane
 *                      pred licencemi je nemaji). --verify-live overuje licence, ktere v HEAD jsou.
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
import { CDN_URL, POOL_DIR, VER_RE, POOL_NAME_RE, hashOf, poolUrl, versionUrl, manifestRefs, reachable, isLicenseName, bundleOfLicense, refersToLicense } from './pool-lib.mjs';

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
const srcNames = fs.readdirSync(SRC, { withFileTypes: true }).filter(e => e.isFile()).map(e => e.name);
const js = srcNames.filter(n => n.endsWith('.js')).sort();
for (const p of refs.paths) if (js.indexOf(p) === -1) fail('manifest odkazuje ' + p + ', ale v --src neni');
const srcText = (name) => { try { return fs.readFileSync(path.join(SRC, name), 'utf8'); } catch (e) { return null; } };
// Licence: `licKnown` = k bundlu, ktery v --src je (s nimi se porovnava, co uz v HEAD lezi);
// `lic` = ty, na ktere bundle OPRAVDU odkazuje - jen ty se publikuji, doplnuji a vyzaduji.
// Ostatni jsou sirotci (heft je vyrabi napr. u webpart bundlu) a na CDN nepatri.
const licFiles = srcNames.filter(isLicenseName);
const licKnown = licFiles.filter(n => js.indexOf(bundleOfLicense(n)) !== -1).sort();
// Nahradni hodnota MIMO region schvalne (protipriklad v check-chunk-pool.mjs): bez regionu
// se publikuje kazda licence, ktera ma bundle - i ta, na kterou bundle neodkazuje.
let licReferenced = () => true;
// #region POOL-REFERENCED
licReferenced = (l) => refersToLicense(srcText(bundleOfLicense(l)), l);
// #endregion POOL-REFERENCED
// Nahradni hodnota MIMO region schvalne (protipriklad AL0p v check-chunk-pool.mjs): bez regionu
// se chova jako nastroj PRED opravou #399 - licence nezna, nekopiruje ani nevyzaduje.
let lic = [];
// #region POOL-LICENSE-PUBLISH
lic = licKnown.filter(l => licReferenced(l));
// #endregion POOL-LICENSE-PUBLISH
const licOrphan = licFiles.filter(n => lic.indexOf(n) === -1).sort();

/** Manifest pro tvar ULOZISTE: jediny rozdil proti buildu je internalModuleBaseUrls. */
const pooledManifestBuf = (() => {
  const o = JSON.parse(srcManifestBuf.toString('utf8'));
  o.loaderConfig.internalModuleBaseUrls = [poolUrl(APP)];
  return Buffer.from(JSON.stringify(o, null, 2), 'utf8');
})();

// Ocekavane bloby obou tvaru (co by se commitnulo). Licence zvlast: do presneho poctu
// souboru verze nevstupuji.
const want = { poolFile: new Map(), verPool: new Map(), verStandalone: new Map(), licPool: new Map(), licVer: new Map() };
for (const f of js) {
  want.poolFile.set(f, blobOfFile(poolRel + '/' + f, path.join(SRC, f)));
  want.verStandalone.set(f, blobOfFile(verRel + '/' + f, path.join(SRC, f)));
}
for (const l of licKnown) {
  want.licPool.set(l, blobOfFile(poolRel + '/' + l, path.join(SRC, l)));
  want.licVer.set(l, blobOfFile(verRel + '/' + l, path.join(SRC, l)));
}
want.verPool.set('manifest.json', blobOfBuffer(verRel + '/manifest.json', pooledManifestBuf));
want.verStandalone.set('manifest.json', blobOfBuffer(verRel + '/manifest.json', srcManifestBuf));

/** Cesty (relativne k ROOT), ktere repo ignoruje (.gitignore). Jedno volani pro vsechny;
 *  --no-index = rozhoduji pravidla, ne to, co uz je v indexu. Kod 1 = nic neignorovano,
 *  cokoli jineho = nevime -> chyba (tise psat nebo tise vynechat by bylo hadani). */
function ignoredPaths(rels) {
  const out = new Set();
  if (!rels.length) return out;
  let txt = '';
  try {
    txt = execFileSync('git', ['-C', ROOT, 'check-ignore', '--no-index', '--stdin', '-z'],
      { input: rels.join('\0') + '\0', encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  } catch (e) {
    if (e && e.status === 1) return out;
    fail('git check-ignore selhal (' + (e && e.status) + ') - nevim, ktere licence repo ignoruje');
  }
  txt.split('\0').filter(Boolean).forEach(p => out.add(p));
  return out;
}
// Licence, kterou repo ignoruje, se nepise vubec (git add by ji nevzal a zustala by lezet jako
// netrackovany zbytek, jako drive ai-chat/ - uklizeno v 0fea0081). Nahradni hodnota MIMO region
// schvalne: po vystrizeni (protipriklad v check-chunk-pool.mjs) se nic neignoruje.
let IGNORED = new Set();
// #region POOL-IGNORED
IGNORED = ignoredPaths(lic.map(l => poolRel + '/' + l).concat(lic.map(l => verRel + '/' + l)));
// #endregion POOL-IGNORED
const licDir = (layout) => layout === 'pool' ? poolRel : verRel;
const licIgnored = (layout, l) => IGNORED.has(licDir(layout) + '/' + l);
const licWant = (layout) => layout === 'pool' ? want.licPool : want.licVer;
/** Neignorovane licence buildu, ktere v HEAD u sveho bundlu (podle tvaru) chybi. */
const licMissing = (layout, head) => lic.filter(l => !licIgnored(layout, l) && !head.has(licDir(layout) + '/' + l));

// Licence, ktera v HEAD JE, musi mit blob shodny s buildem (jina licence = jiny obsah verze).
// Nahradni hodnota MIMO region schvalne: po vystrizeni (protipriklad v check-chunk-pool.mjs)
// se licence v HEAD neporovnavaji a verze s JINOU licenci by prosla jako shodna.
let headLicenseOk = () => true;
// #region POOL-HEAD-LICENSE
headLicenseOk = (exp, name, blob) => !!exp && exp.get(name) === blob;
// #endregion POOL-HEAD-LICENSE

/** Obsahuje HEAD verzi PRAVE v tomhle tvaru (a u uloziste i vsechny jeji soubory)?
 *  Licence se do presneho poctu nepocitaji (verze vydane pred licencemi je nemaji); licence,
 *  ktera v HEAD je, musi sedet. Verzni slozka uloziste licence nenese (jsou u bundlu). */
function headHas(layout, head) {
  const exp = layout === 'pool' ? want.verPool : want.verStandalone;
  const expLic = layout === 'pool' ? null : want.licVer;
  let n = 0;
  for (const [p, blob] of head) {
    if (p.indexOf(verRel + '/') !== 0) continue;
    const name = p.slice(verRel.length + 1);
    if (isLicenseName(name)) { if (!headLicenseOk(expLic, name, blob)) return false; continue; }
    n++;
  }
  if (n !== exp.size) return false;
  for (const [name, blob] of exp) if (head.get(verRel + '/' + name) !== blob) return false;
  if (layout === 'pool') {
    for (const [f, blob] of want.poolFile) if (head.get(poolRel + '/' + f) !== blob) return false;
    for (const l of lic) { const b = head.get(poolRel + '/' + l); if (b && !headLicenseOk(want.licPool, l, b)) return false; }
  }
  return true;
}

const copyChecked = (f, destDir, rel, blob) => {
  fs.mkdirSync(destDir, { recursive: true });
  const dest = path.join(destDir, f);
  fs.copyFileSync(path.join(SRC, f), dest);
  if (blobOfFile(rel, dest) !== blob) fail('po kopii nesedi obsah ' + rel);
};

// ============================================================ VERIFY-HEAD ===
if (MODE === 'verify-head') {
  const head = headTree(APP + '/');
  const layout = headHas('pool', head) ? 'pool' : (headHas('standalone', head) ? 'standalone' : '');
  if (!layout) fail('HEAD neobsahuje verzi ' + verRel + ' ve tvaru tohoto buildu (ani uloziste, ani samostatnou) - commit neni kompletni');
  // Licence: co v HEAD je, uz porovnal headHas. Chybejici jen u --require-licenses shodi
  // kontrolu - verze vydane pred licencemi je nemaji a porad jsou kompletni.
  const miss = licMissing(layout, head);
  if (miss.length && has('--require-licenses')) {
    fail('v HEAD chybi ' + miss.length + ' licenci knihoven verze ' + verRel + ' v ' + licDir(layout) + '/ (--require-licenses): ' + miss.join(', '));
  }
  if (has('--require-pushed')) {
    let ahead = '';
    try { ahead = git(['rev-list', '--count', '@{u}..HEAD']).trim(); } catch (e) { fail('nejde zjistit stav vuci origin (@{u})'); }
    if (ahead !== '0') fail('HEAD je ' + ahead + ' commit(u) pred origin - vydani neni na CDN (lekce 40.13)');
  }
  const n = layout === 'pool' ? (1 + want.poolFile.size) : want.verStandalone.size;
  const nIgn = lic.filter(l => licIgnored(layout, l)).length;
  const licNote = lic.length ? '; licence knihoven ' + (lic.length - nIgn - miss.length) + '/' + (lic.length - nIgn) + ' v HEAD' + (nIgn ? ' (' + nIgn + ' ignoruje .gitignore)' : '') : '';
  say('POOL: HEAD OK - ' + verRel + ' ' + (layout === 'pool' ? 'ULOZISTE' : 'SAMOSTATNA') + ', ' + n + ' souboru s bloby shodnymi s buildem' + licNote);
  if (miss.length) say('POOL: v HEAD chybi ' + miss.length + ' licenci knihoven (verze vydana pred licencemi?) - doplni je publikace s --apply: ' + miss.join(', '));
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
  // Licence jen ty, ktere v HEAD k verzi JSOU (starsi verze je nemaji - neni co cekat).
  let nLic = 0;
  for (const l of lic) {
    const rel = licDir(layout) + '/' + l;
    if (head.has(rel)) { push(rel, fs.readFileSync(path.join(SRC, l))); nLic++; }
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
    say('POOL: LIVE OK - ' + last.length + ' souboru verze ' + verRel + ' vraci 200 a obsah (SHA-256) = build' + (nLic ? ' (z toho ' + nLic + ' licenci knihoven)' : ''));
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
  if (licOrphan.length) say('POOL: licence bez odkazu v bundlu - nepublikuji: ' + licOrphan.join(', '));

  const head = headTree(APP + '/');
  const headVerCount = Array.from(head.keys()).filter(p => p.indexOf(verRel + '/') === 0).length;
  let verState = 'absent';
  if (headVerCount) verState = headHas('pool', head) ? 'same-pool' : (headHas('standalone', head) ? 'same-standalone' : 'different');

  if (verState === 'same-pool' || verState === 'same-standalone') {
    const sameLayout = verState === 'same-pool' ? 'pool' : 'standalone';
    const tvar = sameLayout === 'pool' ? 'ULOZISTE' : 'SAMOSTATNA';
    const miss = licMissing(sameLayout, head);
    if (!miss.length) {
      say('POOL: verze ' + verRel + ' uz na CDN je a obsah je SHODNY s buildem (' + tvar + ') - nic nezapisuji');
      process.exit(0);
    }
    // Verze vydana pred licencemi: .js i manifest sedi, chybi jen licence -> doplnit JEN je
    // (aditivne; soubory, ktere v HEAD jsou, se nemeni).
    const dirRel = licDir(sameLayout);
    if (!APPLY) {
      say('POOL: verze ' + verRel + ' uz na CDN je a obsah je SHODNY s buildem (' + tvar + '), chybi ' + miss.length + ' licenci knihoven - PLAN: doplnim je do ' + dirRel + '/ (.js ani manifest se nemeni). Spust s --apply.');
      process.exit(0);
    }
    for (const l of miss) copyChecked(l, path.join(ROOT, dirRel), dirRel + '/' + l, licWant(sameLayout).get(l));
    say('POOL: verze ' + verRel + ' uz na CDN je a obsah je SHODNY s buildem (' + tvar + ') - doplnuji ' + miss.length + ' licenci do ' + dirRel + '/ (.js ani manifest se nemeni)');
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
  // Licence v ulozisti: stejne pravidlo jako u .js - co v HEAD je, se neprepisuje, jina licence
  // pod stejnym jmenem = konflikt. Chybejici licence (i ke znovu pouzitemu chunku) se doplni.
  const licAdd = [], licReuse = [];
  for (const l of lic) {
    const inHead = head.get(poolRel + '/' + l);
    if (!inHead) { if (!licIgnored('pool', l)) licAdd.push(l); continue; }
    if (inHead === want.licPool.get(l)) licReuse.push(l);
    else reasons.push(l + ': v ulozisti uz je pod stejnym jmenem JINA licence (konflikt)');
  }
  const layout = reasons.length ? 'standalone' : 'pool';
  const licStandalone = lic.filter(l => !licIgnored('standalone', l));
  const sizeOf = (f) => fs.statSync(path.join(SRC, f)).size;
  const mb = (b) => (b / 1048576).toFixed(2);
  const nIgn = lic.filter(l => licIgnored(layout, l)).length;
  const licTail = nIgn ? ', ' + nIgn + ' vynechano (.gitignore)' : '';

  if (layout === 'pool') {
    say('POOL: ' + verRel + ' -> ULOZISTE ' + poolRel + '/ (' + add.length + ' novych, ' + reuse.length + ' znovu pouzitych = usetreno '
      + mb(reuse.reduce((s, f) => s + sizeOf(f), 0)) + ' MB; verzni slozka = jen manifest.json)');
    if (lic.length) say('POOL: licence knihoven -> ' + poolRel + '/: ' + licAdd.length + ' novych, ' + licReuse.length + ' uz v ulozisti' + licTail);
  } else {
    say('POOL: ' + verRel + ' -> SAMOSTATNA VERZE (tvar pred ulozistem). Duvod:');
    reasons.forEach(r => say('  - ' + r));
    if (lic.length) say('POOL: licence knihoven -> ' + verRel + '/: ' + licStandalone.length + licTail);
  }
  if (verState === 'different') say('POOL: verze ' + verRel + ' mela jiny obsah a volajici overil, ze ji nikdo nedrzi - nahrazuji ji.');
  if (!APPLY) { say('POOL: PLAN (nic nezapsano). Spust s --apply.'); process.exit(0); }

  // ---------------------------------------------------------------- zapis ---
  // Verzni slozku vzdy stavime nacisto (zbytky po nedokoncenem behu, nahrazovana verze).
  fs.rmSync(verAbs, { recursive: true, force: true });
  if (layout === 'pool') {
    // Nejdriv uloziste, manifest AZ NAKONEC: verze s manifestem bez svych souboru nikdy nevznikne
    // (preruseny beh zanecha nanejvys neodkazovane soubory v ulozisti, ty smete prorez).
    for (const f of add) copyChecked(f, poolAbs, poolRel + '/' + f, want.poolFile.get(f));
    for (const l of licAdd) copyChecked(l, poolAbs, poolRel + '/' + l, want.licPool.get(l));
    fs.mkdirSync(verAbs, { recursive: true });
    fs.writeFileSync(path.join(verAbs, 'manifest.json'), pooledManifestBuf);
    if (blobOfFile(verRel + '/manifest.json', path.join(verAbs, 'manifest.json')) !== want.verPool.get('manifest.json')) fail('po zapisu nesedi manifest');
  } else {
    for (const f of js) copyChecked(f, verAbs, verRel + '/' + f, want.verStandalone.get(f));
    for (const l of licStandalone) copyChecked(l, verAbs, verRel + '/' + l, want.licVer.get(l));
    fs.writeFileSync(path.join(verAbs, 'manifest.json'), srcManifestBuf);
    if (blobOfFile(verRel + '/manifest.json', path.join(verAbs, 'manifest.json')) !== want.verStandalone.get('manifest.json')) fail('po zapisu nesedi manifest');
  }
  const nLicW = layout === 'pool' ? licAdd.length : licStandalone.length;
  say('POOL: zapsano (' + (layout === 'pool' ? add.length + ' soubor(u) do ' + poolRel + '/ + manifest' : (js.length + 1) + ' souboru do ' + verRel + '/') + (nLicW ? ' + ' + nLicW + ' licenci knihoven' : '') + ')');
  process.exit(0);
}
