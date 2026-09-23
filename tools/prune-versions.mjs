#!/usr/bin/env node
/**
 * Prořez VERZNÍCH SLOŽEK runtime kanálu (`<app>/<verze>/`).
 *
 * ⚠ Proč nestačí `prune-bundles.mjs`: ten řeže bundly v KOŘENI appky (`<app>/*.js`),
 *    tedy stav před zavedením runtime verzí (2026-08). Od té doby každý tichý build
 *    zakládá vlastní složku `<app>/<verze>/` a ty rostou neomezeně — ai-chat jich měl
 *    117 × 6,6 MB = 751 MB, tj. 58 % celého CDN. Pages má na publikovaný web limit
 *    ~1 GB; nad ním buildy přestanou dojíždět a NEVYDÁ UŽ ŽÁDNÁ appka, ne jen ta,
 *    která zrovna publikovala.
 *
 * Pravidlo (bezpečné by construction):
 *   • VŽDY zůstane každá verze uvedená v `<app>/releases.json` = ostré vydání,
 *     které si tahá zákazník bez pinu. Smazat ji = rozbít zákazníka.
 *   • VŽDY zůstane každá verze, na kterou míří PIN v našem tenantu (viz níž).
 *   • VŽDY zůstane N nejnovějších verzí (default 15).
 *   • Cokoli jiného je stará tichá verze, ke které se nikdo nedostane.
 *
 * ⚠ PROČ NESTAČÍ „N nejnovějších" (TECH-DEBT #250, nález 2026-09-01):
 *    Piny míří na TICHÉ verze, které v `releases.json` z definice NEJSOU —
 *    chránilo je jedině to okno patnácti. A okno je prokazatelně úzké: byly dny,
 *    kdy jedna appka vydala 27 tichých verzí (ai-chat 12. 8.), 24 a 20 (mydocs
 *    21. a 23. 8.). Prořez spuštěný po takovém dni bez čerstvého pin sweepu
 *    smaže verzi, na které visíme — a projeví se to TIŠE: loader spadne na
 *    latest, pin zůstane zapsaný a mrtvý navždy (cache 1 h → znovu 404).
 *
 * PIN GUARD (fail-closed, nedá se přeskočit):
 *    Piny žijí v nastavení appek na tenantu (řádek `runtime` v `EP365<App>Settings`)
 *    a tenhle tool na tenant nedosáhne (běží bez přihlášení, z Node). Čte proto
 *    SOUPIS PINŮ, který při každém sweepu vyrábí sám sweep:
 *        ep365-docs/scripts/pin-state.json   (PRIVÁTNÍ repo — stejný vzor jako
 *        forbidden-in-public-bundles.json; mapa našeho tenantu do PUBLIC repa nepatří)
 *    Soupis vypíše `node ep365-docs/scripts/make-pin-sweep-snippet.js` v bloku
 *    „PIN-STATE" na konci běhu snippetu.
 *
 *    Chybějící / nečitelný / neúplný / zastaralý soupis = TVRDÁ CHYBA (exit 1),
 *    NIKDY tiché přeskočení: guard, který nemá podle čeho měřit, by jinak hlásil
 *    bezpečí, které neověřil. Platí i pro režim PLÁNU — plán, kterému se nedá
 *    věřit, je horší než žádný.
 *
 *    „Zastaralý" se neměří jen datem: pokud na disku leží verze NOVĚJŠÍ, než jakou
 *    sweep viděl (`cdnSnapshot`), znamená to, že se od sweepu publikovalo a piny
 *    mohly být přepnuty jinam. Tím je pořadí „pin sweep → teprve pak prořez"
 *    vynucené mechanicky, ne jen napsané v `/release`.
 *
 * Bez `--apply` jen vypíše plán. Řadí se podle ČÍSEL verze (1.9.0.10 > 1.9.0.9),
 * ne abecedně — abecední řazení by smazalo novější verzi místo starší.
 *
 * Použití:
 *   node tools/prune-versions.mjs                 # plán, všechny appky
 *   node tools/prune-versions.mjs --keep 15       # jiný počet ponechaných
 *   node tools/prune-versions.mjs --not-apps governance   # složky, které nejsou appky
 *   node tools/prune-versions.mjs --app ai-chat   # jen jedna appka
 *   node tools/prune-versions.mjs --apply         # provede `git rm -r`
 *   node tools/prune-versions.mjs --pin-state <cesta>      # jiný soupis pinů
 *   node tools/prune-versions.mjs --max-age-days 7         # jiné stáří sweepu
 *
 * Ověření, že pin guard opravdu drží: `node tools/check-pin-guard.mjs`
 * (syntetické mini-CDN + protipříklad s vystřiženým guardem).
 *
 * SDÍLENÉ ÚLOŽIŠTĚ `<app>/chunks/` (od 2026-09-24, pilot marketing):
 *    Nové verze můžou mít ve verzní složce jen `manifest.json` a bundle + chunky
 *    v `<app>/chunks/` (viz `pool-version.mjs`). Soubor z úložiště smí pryč jen tehdy,
 *    když na něj po prořezu nemíří ŽÁDNÁ zůstávající verze — ostrá, pinutá, z okna --keep
 *    i netrackovaná. Počítání odkazů (manifest → bundle → chunky přes holý hash) a
 *    nezávislou kontrolu dělá `pool-lib.mjs`; ověření: `node tools/check-chunk-pool.mjs`.
 *    Nejistota (nečitelný manifest, rozbitá verze, běžící publikace) = z úložiště NIC.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';
import { planPoolSweep, POOL_DIR } from './pool-lib.mjs';

// ⚠ `import.meta.url` je URL — mezera v cestě je v ní `%20`. Ruční ořezávání pathname
//    dá „EP365%20Apps" a `readdirSync` spadne na ENOENT; dekódovat musí `fileURLToPath`.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const APPLY = args.indexOf('--apply') !== -1;
const KEEP = (() => {
  const i = args.indexOf('--keep');
  const n = i !== -1 ? parseInt(args[i + 1], 10) : NaN;
  return isNaN(n) ? 15 : Math.max(1, n);
})();
const ONLY = (() => {
  const i = args.indexOf('--app');
  return i !== -1 ? args[i + 1] : '';
})();
// --keep-app ai-chat=6,crm=10 : vyjimky z --keep pro jednotlive appky (politika
// keepVersionsPerApp v cdn-prune-policy.json; audit 2026-09-23 – CDN 794/1000 MB).
const KEEP_APP = (() => {
  const i = args.indexOf('--keep-app');
  const m = new Map();
  if (i === -1 || !args[i + 1]) return m;
  args[i + 1].split(',').forEach(pair => {
    const [app, n] = pair.split('=');
    const k = parseInt(n, 10);
    if (app && !isNaN(k)) m.set(app.trim(), Math.max(1, k));
  });
  return m;
})();
const keepFor = app => (KEEP_APP.has(app) ? KEEP_APP.get(app) : KEEP);

const VER_RE = /^\d+(\.\d+)*$/;

/** Porovnání verzí po číslech — „1.9.0.10" je NOVĚJŠÍ než „1.9.0.9". */
function cmpVer(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d;
  }
  return 0;
}

function dirSizeMB(dir) {
  let total = 0;
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else total += fs.statSync(p).size;
    }
  };
  try { walk(dir); } catch { /* nedostupné = 0 */ }
  return total / (1024 * 1024);
}

/** Verze, které NESMÍ zmizet: vše z releases.json (ostrá vydání). */
function releasedVersions(appDir) {
  const f = path.join(appDir, 'releases.json');
  if (!fs.existsSync(f)) return new Set();
  try {
    const raw = JSON.parse(fs.readFileSync(f, 'utf8'));
    const list = Array.isArray(raw) ? raw : (raw.releases || []);
    return new Set(list.map(r => String(r && r.version ? r.version : r)).filter(Boolean));
  } catch (e) {
    // Nečitelný releases.json = NEVÍME, co je ostré → u téhle appky raději nic nemazat.
    return null;
  }
}

// Složky, které NEJSOU runtime kanál appky, ale mají podsložku ve tvaru verze
// (governance/2026.09 = edice obsahového balíčku). Přeskakují se JMENOVITĚ, ze
// seznamu v politice — tiché ignorování neznámé složky by skrylo i appku, která
// v soupisu pinů chybí omylem, a právě tu je potřeba zastavit.
const NOT_APPS = (() => {
  const i = args.indexOf('--not-apps');
  const raw = i !== -1 && args[i + 1] ? args[i + 1] : '';
  return new Set(raw.split(',').map(s => s.trim()).filter(Boolean));
})();

const apps = fs.readdirSync(ROOT, { withFileTypes: true })
  .filter(e => e.isDirectory() && e.name.charAt(0) !== '.' && e.name !== 'tools' && e.name !== 'node_modules')
  .map(e => e.name)
  .filter(a => !NOT_APPS.has(a))
  .filter(a => !ONLY || a === ONLY)
  .sort();

// ============================ PIN GUARD (TECH-DEBT #250) =====================
// Fallback hodnoty leží MIMO region SCHVÁLNĚ: když se region vystřihne
// (protipříklad v `check-pin-guard.mjs`), zbude prázdná mapa = žádná ochrana
// a prořez pinutou verzi smaže. Právě ten rozdíl test měří — kdyby se po
// vystřižení skript rozbil na ReferenceError, protipříklad by nic nedokázal.
let PINNED = new Map();          // app -> Set(verze, na které míří pin)
let DEAD_PINS = [];              // pin míří na verzi, která na CDN UŽ NENÍ
let PIN_INFO = '';
// #region PIN-GUARD
{
  const psi = args.indexOf('--pin-state');
  const PIN_STATE = psi !== -1 && args[psi + 1]
    ? path.resolve(args[psi + 1])
    : path.resolve(ROOT, '..', 'ep365-docs', 'scripts', 'pin-state.json');
  const mai = args.indexOf('--max-age-days');
  const man = mai !== -1 ? parseInt(args[mai + 1], 10) : NaN;
  const MAX_AGE_DAYS = isNaN(man) ? 7 : Math.max(1, man);

  const HOWTO = [
    'Jak soupis vyrobit (trva minutu):',
    '  1) node "ep365-docs/scripts/make-pin-sweep-snippet.js"        (nebo --check = jen cteni)',
    '  2) snippet vloz do konzole prohlizece prihlaseneho do tenantu',
    '  3) blok PIN-STATE z vypisu uloz cely do:',
    '     ' + PIN_STATE,
    '',
    'Dokud soupis neplati, tool NEMAZE NIC — nema podle ceho poznat, na kterou',
    'verzi visi pin, a smazat ji znamena tise rozbit web, ktery na ni bezi.'
  ].join('\n');
  const fatal = (m) => {
    console.error('\nPIN GUARD ZASTAVIL PROREZ (nic nesmazano)\n  ' + m + '\n\n' + HOWTO);
    process.exit(1);
  };

  let raw = null;
  try { raw = fs.readFileSync(PIN_STATE, 'utf8'); }
  catch (e) { fatal('soupis pinu nenalezen nebo necitelny: ' + PIN_STATE + ' (' + (e && e.code) + ')'); }
  let st = null;
  try { st = JSON.parse(raw); } catch (e) { fatal('soupis pinu neni platny JSON: ' + PIN_STATE); }
  if (!st || typeof st !== 'object' || Array.isArray(st)) fatal('soupis pinu ma necekany tvar: ' + PIN_STATE);

  if (st.complete !== true) {
    fatal('posledni pin sweep NEBYL uplny (complete=' + JSON.stringify(st.complete) + ') — nevime, kam miri vsechny piny. '
      + 'Typicky mu Search nevratil vsechny weby (viz POZORNOST ve vypisu sweepu).');
  }
  const swept = Date.parse(st.sweptAt || '');
  if (isNaN(swept)) fatal('soupis pinu nema platne datum sweepu (sweptAt).');
  const ageD = (Date.now() - swept) / 86400000;
  if (ageD < -1) fatal('datum sweepu je v budoucnosti (' + st.sweptAt + ') — spatne hodiny nebo rucne psany soubor.');
  if (ageD > MAX_AGE_DAYS) fatal('pin sweep je stary ' + ageD.toFixed(1) + ' dnu (limit ' + MAX_AGE_DAYS + ') — pin se mezitim mohl prepnout.');

  const snap = st.cdnSnapshot;
  if (!snap || typeof snap !== 'object') fatal('soupis pinu nema cdnSnapshot — nejde overit, ze sweep videl aktualni CDN.');

  // Klicova kontrola: sweep MUSI byt novejsi nez posledni publikace. Kdyz na disku
  // lezi verze, kterou sweep nevidel, publikovalo se po nem — a prave po takovem
  // dni (27 tichych verzi za den) okno --keep nestaci. Tim je poradi
  // "pin sweep -> teprve pak prorez" vynucene, ne jen napsane v /release.
  const zastarale = [], neznama = [];
  for (const app of apps) {
    let vs = [];
    try {
      vs = fs.readdirSync(path.join(ROOT, app), { withFileTypes: true })
        .filter(e => e.isDirectory() && VER_RE.test(e.name)).map(e => e.name).sort(cmpVer);
    } catch (e) { /* neni adresar = neni co chranit */ }
    if (!vs.length) continue;
    const nejnovejsi = vs[vs.length - 1];
    const videna = snap[app];
    if (!videna) { neznama.push(app); continue; }
    if (cmpVer(nejnovejsi, String(videna)) > 0) zastarale.push('    ' + app + ': na disku ' + nejnovejsi + ', sweep videl ' + videna);
  }
  if (neznama.length) fatal('sweep tyhle appky vubec neznal: ' + neznama.join(', ') + ' — soupis je z jineho tvaru CDN nebo appce chybi kontrakt pinu.');
  if (zastarale.length) fatal('od sweepu pribyly na CDN nove verze, takze soupis pinu uz neplati:\n' + zastarale.join('\n'));

  if (!Array.isArray(st.pins)) fatal('soupis pinu nema pole pins.');
  const vadne = [];
  st.pins.forEach((p, i) => {
    if (!p || typeof p.app !== 'string' || typeof p.version !== 'string' || !VER_RE.test(p.version)) { vadne.push(i); return; }
    if (!PINNED.has(p.app)) PINNED.set(p.app, new Set());
    PINNED.get(p.app).add(p.version);
  });
  if (vadne.length) fatal('soupis pinu ma ' + vadne.length + ' vadnych zaznamu (indexy ' + vadne.slice(0, 5).join(',') + ') — necteme ho po castech.');
  let pocet = 0; PINNED.forEach(s => { pocet += s.size; });
  if (!pocet) fatal('sweep nenasel ANI JEDEN pin. U nas je kazda bezici appka pinuta, takze to je '
    + 'skoro jiste vada sweepu (spatny kontrakt listu, jina identita) — ne stav "neni co chranit".');

  // Mrtvy pin = pin miri na verzi, ktera na CDN uz neni. Presne symptom #250:
  // loader spadne na latest a pin zustane zapsany navzdy. Prorez ho nezpusobil,
  // ale je jediny, kdo se na to diva — tak to musi rict nahlas.
  PINNED.forEach((set, app) => set.forEach(v => {
    if (!fs.existsSync(path.join(ROOT, app, v))) DEAD_PINS.push(app + '/' + v);
  }));

  PIN_INFO = 'Pin guard OK: soupis z ' + st.sweptAt + ' (stari ' + ageD.toFixed(1) + ' dnu), '
    + (st.websSeen != null ? st.websSeen : '?') + ' webu, ' + pocet + ' pinu ve ' + PINNED.size + ' appkach.';
}
// #endregion PIN-GUARD

const rows = [];
const toDelete = [];
let freed = 0;
let skipped = [];
const keptByApp = new Map();     // app -> verze, ktere po prorezu zustanou (vstup pro uloziste)

for (const app of apps) {
  const appDir = path.join(ROOT, app);
  const versions = fs.readdirSync(appDir, { withFileTypes: true })
    .filter(e => e.isDirectory() && VER_RE.test(e.name))
    .map(e => e.name)
    .sort(cmpVer)
    .reverse();                       // nejnovější první
  if (versions.length === 0) continue;

  const released = releasedVersions(appDir);
  if (released === null) {
    skipped.push(app);
    rows.push({ app, verzi: versions.length, ponechano: versions.length, smazat: 0, 'uvolni MB': '0.0', pozn: 'necitelny releases.json' });
    continue;
  }

  const keepNewest = new Set(versions.slice(0, keepFor(app)));
  const pinned = PINNED.get(app) || new Set();
  // Pin mimo okno --keep = jediny duvod, proc tenhle radek existuje (#250).
  const pinnedMimoOkno = versions.filter(v => pinned.has(v) && !keepNewest.has(v) && !released.has(v));
  const del = versions.filter(v => !keepNewest.has(v) && !released.has(v) && !pinned.has(v));
  keptByApp.set(app, versions.filter(v => del.indexOf(v) === -1));
  let mb = 0;
  del.forEach(v => { const s = dirSizeMB(path.join(appDir, v)); mb += s; toDelete.push(`${app}/${v}`); });
  freed += mb;

  const pozn = [];
  if (released.size) pozn.push(`${released.size} ostrych`); else pozn.push('zadne ostre vydani');
  if (pinned.size) pozn.push(`${pinned.size} pinu`);
  if (pinnedMimoOkno.length) pozn.push(`ZACHRANENO PINEM: ${pinnedMimoOkno.join(' ')}`);

  rows.push({
    app, verzi: versions.length,
    ponechano: versions.length - del.length,
    smazat: del.length,
    'uvolni MB': mb.toFixed(1),
    pozn: pozn.join(', ')
  });
}

// ======================================== ULOZISTE <app>/chunks/ (pool) ======
// Soubor z uloziste patri VERZIM, ktere na nej miri manifestem. `keptByApp` vznika az
// za pin guardem a ochranou releases.json, takze se ochrana ostrych a pinutych verzi
// prenasi i na jejich soubory v ulozisti. Plan, pocitani odkazu i nezavislou kontrolu
// dela pool-lib.mjs - tataz pravidla, podle kterych publikace do uloziste pousti.
const poolRows = [];
const poolDelete = [];
const poolProblems = [];
const poolVerifyFailed = [];
let poolFreed = 0;
const PUBLISH_LOCK = path.join(ROOT, '.publish.lock');
for (const app of apps) {
  if (!fs.existsSync(path.join(ROOT, app, POOL_DIR))) continue;
  // Bezici publikace pise do uloziste DRIV nez manifest - soubor, na ktery jeste nic
  // nemiri, by tu vypadal jako sirotek. Zamek = v ulozisti se nemaze nic.
  if (fs.existsSync(PUBLISH_LOCK)) { poolProblems.push(app + ': prave bezi publikace (.publish.lock) - uloziste neprorezavam'); continue; }
  if (!keptByApp.has(app)) { poolProblems.push(app + ': verze appky se neprorezavaly (necitelny releases.json nebo zadna verze) - uloziste neprorezavam'); continue; }
  const plan = planPoolSweep(path.join(ROOT, app), app, keptByApp.get(app));
  if (plan.state === 'verify-failed') { poolVerifyFailed.push(app + ': ' + plan.reasons.join('; ')); continue; }
  if (plan.state === 'unknown' || plan.state === 'dead') {
    poolProblems.push(app + ': ' + (plan.state === 'dead' ? '!!! ROZBITA VERZE - miri na soubor, ktery v ulozisti neni: ' : 'nevim, co odkazuje: ')
      + plan.reasons.join('; ') + ' - uloziste neprorezavam');
    continue;
  }
  let b = 0;
  plan.sweep.forEach(f => { b += fs.statSync(path.join(ROOT, app, POOL_DIR, f)).size; poolDelete.push(app + '/' + POOL_DIR + '/' + f); });
  poolFreed += b;
  poolRows.push({ app, 'souboru v ulozisti': plan.files.length, odkazovano: plan.marked.size, smazat: plan.sweep.length, 'uvolni MB': (b / 1048576).toFixed(1) });
}
// Nezavisla kontrola nasla odkaz na soubor, ktery mel jit pryc = plan NENI duveryhodny.
// Stop PRED jakymkoli mazanim (i verznich slozek) - radsi nic nez cast.
if (poolVerifyFailed.length) {
  console.log('\nOVERENI ULOZISTE SELHALO - nic nesmazano (ani verzni slozky):');
  poolVerifyFailed.forEach(p => console.log('   ' + p));
  process.exit(1);
}

console.table(rows);
if (poolRows.length) { console.log('Sdilene uloziste <app>/' + POOL_DIR + '/ (soubory, na ktere po prorezu nemiri zadna verze):'); console.table(poolRows); }
poolProblems.forEach(p => console.log('! ULOZISTE ' + p));
if (PIN_INFO) console.log(PIN_INFO);
if (DEAD_PINS.length) {
  console.log('!!! MRTVE PINY (' + DEAD_PINS.length + ') — pin miri na verzi, ktera na CDN NENI: ' + DEAD_PINS.join(', '));
  console.log('    Web na ni bezi pres nahradni volbu (fallback na latest) a sam se to nespravi.');
  console.log('    Sprav pin sweepem (prepne na nejnovejsi) — prorez to neresi.');
}
// Co z toho git skutecne trackuje. Jedno volani na cely strom - `git ls-files`
// per slozka by znamenalo stovky procesu a stejne cislo.
const trackedFiles = (function () {
  try {
    const out = execFileSync('git', ['-C', ROOT, 'ls-files'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    return new Set(out.split('\n').map(p => p.trim()).filter(Boolean));
  } catch (e) { return null; }             // bez gitu radeji nic netvrdit
})();
const trackedSet = (function () {
  if (!trackedFiles) return null;
  const s = new Set();
  trackedFiles.forEach(function (p) {
    const i = p.indexOf('/'); if (i === -1) return;
    const j = p.indexOf('/', i + 1); if (j === -1) return;
    s.add(p.slice(0, j));                   // "<app>/<verze>"
  });
  return s;
})();

const naCdn = trackedSet ? toDelete.filter(function (d) { return trackedSet.has(d); }) : toDelete;
const jenLokalne = toDelete.length - naCdn.length;
let freedCdn = 0;
naCdn.forEach(function (d) { const i = d.indexOf('/'); freedCdn += dirSizeMB(path.join(ROOT, d.slice(0, i), d.slice(i + 1))); });
// Uloziste: maze se jen trackovane (netrackovany soubor na Pages neni; a je-li to zbytek
// po prerusene publikaci, uklidi ho az ta publikace, ne prorez).
const poolNaCdn = trackedFiles ? poolDelete.filter(p => trackedFiles.has(p)) : [];
let poolFreedCdn = 0;
poolNaCdn.forEach(p => { poolFreedCdn += fs.statSync(path.join(ROOT, p)).size; });
poolFreedCdn = poolFreedCdn / (1024 * 1024);

if (trackedSet) {
  console.log(`\nZ CDN ubude ${(freedCdn + poolFreedCdn).toFixed(1)} MB: ${freedCdn.toFixed(1)} MB ve ${naCdn.length} verznich slozkach (--keep ${KEEP})`
    + ` + ${poolFreedCdn.toFixed(1)} MB v ${poolNaCdn.length} souborech sdileneho uloziste.`);
  if (jenLokalne) console.log(`Dalsich ${jenLokalne} slozek (${(freed - freedCdn).toFixed(1)} MB) lezi jen lokalne — na Pages nejsou, takze se velikost webu o ne nezmensi.`);
  if (poolDelete.length > poolNaCdn.length) console.log(`V ulozisti je dalsich ${poolDelete.length - poolNaCdn.length} neodkazovanych souboru jen lokalne (netrackovane) - nechavam je.`);
} else {
  console.log(`\nUvolni ${freed.toFixed(1)} MB ve ${toDelete.length} verznich slozkach (--keep ${KEEP}). ⚠ Nepodarilo se zjistit, co z toho git trackuje - uloziste se proto neprorezava.`);
}
if (skipped.length) console.log(`⚠ Preskoceno (necitelny releases.json): ${skipped.join(', ')}`);

if (!APPLY) {
  console.log('\nPLAN (nic nesmazano). Spust s --apply.');
  if (naCdn.length) console.log('Ukazka:', naCdn.slice(0, 5).join(', '), naCdn.length > 5 ? `… (+${naCdn.length - 5})` : '');
  if (poolNaCdn.length) console.log('Ukazka z uloziste:', poolNaCdn.slice(0, 5).join(', '), poolNaCdn.length > 5 ? `… (+${poolNaCdn.length - 5})` : '');
  process.exit(0);
}

if (!toDelete.length && !poolNaCdn.length) { console.log('Nic k mazani.'); process.exit(0); }

// ⚠ Na disku jsou i verzní složky, které git VŮBEC NETRACKUJE (allowlist v .gitignore
//    pustí jen část souborů, zbytek po publikaci zůstane lokálně). `git rm` na takové
//    cestě skončí `fatal: pathspec did not match` a shodí celou dávku — a tím i mazání
//    složek, které tracknuté jsou. Netrackované se proto vyfiltrují DOPŘEDU; na
//    publikovaný web stejně nemají vliv, protože Pages servíruje jen commitnutý obsah.
const tracked = toDelete.filter(d => {
  try {
    return execFileSync('git', ['-C', ROOT, 'ls-files', '--', d], { encoding: 'utf8' }).trim().length > 0;
  } catch (e) { return false; }
});
const untracked = toDelete.length - tracked.length;
if (untracked) console.log(`Preskakuji ${untracked} netrackovanych slozek (nejsou v gitu, tedy ani na Pages).`);

// POŘADÍ: nejdřív verzní složky, AŽ POTOM úložiště. Kdyby `git rm` spadl v půlce,
// zbydou nanejvýš neodkazované soubory v úložišti (smete je příští prořez) — nikdy
// verze, jejíž manifest míří na soubor, který už je pryč.
// `git rm -r` po davkach — prilis dlouha prikazova radka spadne na Windows limitu.
const BATCH = 40;
for (let i = 0; i < tracked.length; i += BATCH) {
  const batch = tracked.slice(i, i + BATCH);
  execFileSync('git', ['-C', ROOT, 'rm', '-r', '-q', '--ignore-unmatch', '--', ...batch], { stdio: 'inherit' });
  console.log(`  smazano ${Math.min(i + BATCH, tracked.length)}/${tracked.length}`);
}
const POOL_BATCH = 100;
for (let i = 0; i < poolNaCdn.length; i += POOL_BATCH) {
  execFileSync('git', ['-C', ROOT, 'rm', '-q', '--ignore-unmatch', '--', ...poolNaCdn.slice(i, i + POOL_BATCH)], { stdio: 'inherit' });
}
if (poolNaCdn.length) console.log(`  z uloziste smazano ${poolNaCdn.length} souboru (~${poolFreedCdn.toFixed(1)} MB)`);
console.log(`\nHOTOVO — ${tracked.length} slozek (~${freedCdn.toFixed(1)} MB) + ${poolNaCdn.length} souboru uloziste (~${poolFreedCdn.toFixed(1)} MB) odstraneno z CDN. Zkontroluj 'git status' a commitni.`);
