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
 *   node tools/prune-versions.mjs --app ai-chat   # jen jedna appka
 *   node tools/prune-versions.mjs --apply         # provede `git rm -r`
 *   node tools/prune-versions.mjs --pin-state <cesta>      # jiný soupis pinů
 *   node tools/prune-versions.mjs --max-age-days 7         # jiné stáří sweepu
 *
 * Ověření, že pin guard opravdu drží: `node tools/check-pin-guard.mjs`
 * (syntetické mini-CDN + protipříklad s vystřiženým guardem).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';

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

const apps = fs.readdirSync(ROOT, { withFileTypes: true })
  .filter(e => e.isDirectory() && e.name.charAt(0) !== '.' && e.name !== 'tools' && e.name !== 'node_modules')
  .map(e => e.name)
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

  const keepNewest = new Set(versions.slice(0, KEEP));
  const pinned = PINNED.get(app) || new Set();
  // Pin mimo okno --keep = jediny duvod, proc tenhle radek existuje (#250).
  const pinnedMimoOkno = versions.filter(v => pinned.has(v) && !keepNewest.has(v) && !released.has(v));
  const del = versions.filter(v => !keepNewest.has(v) && !released.has(v) && !pinned.has(v));
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

console.table(rows);
if (PIN_INFO) console.log(PIN_INFO);
if (DEAD_PINS.length) {
  console.log('!!! MRTVE PINY (' + DEAD_PINS.length + ') — pin miri na verzi, ktera na CDN NENI: ' + DEAD_PINS.join(', '));
  console.log('    Web na ni bezi pres nahradni volbu (fallback na latest) a sam se to nespravi.');
  console.log('    Sprav pin sweepem (prepne na nejnovejsi) — prorez to neresi.');
}
// Co z toho git skutecne trackuje. Jedno volani na cely strom - `git ls-files`
// per slozka by znamenalo stovky procesu a stejne cislo.
const trackedSet = (function () {
  try {
    const out = execFileSync('git', ['-C', ROOT, 'ls-files'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    const s = new Set();
    out.split('\n').forEach(function (p) {
      const i = p.indexOf('/'); if (i === -1) return;
      const j = p.indexOf('/', i + 1); if (j === -1) return;
      s.add(p.slice(0, j));                 // "<app>/<verze>"
    });
    return s;
  } catch (e) { return null; }             // bez gitu radeji nic netvrdit
})();

const naCdn = trackedSet ? toDelete.filter(function (d) { return trackedSet.has(d); }) : toDelete;
const jenLokalne = toDelete.length - naCdn.length;
let freedCdn = 0;
naCdn.forEach(function (d) { const i = d.indexOf('/'); freedCdn += dirSizeMB(path.join(ROOT, d.slice(0, i), d.slice(i + 1))); });

if (trackedSet) {
  console.log(`\nZ CDN ubude ${freedCdn.toFixed(1)} MB ve ${naCdn.length} verznich slozkach (--keep ${KEEP}).`);
  if (jenLokalne) console.log(`Dalsich ${jenLokalne} slozek (${(freed - freedCdn).toFixed(1)} MB) lezi jen lokalne — na Pages nejsou, takze se velikost webu o ne nezmensi.`);
} else {
  console.log(`\nUvolni ${freed.toFixed(1)} MB ve ${toDelete.length} verznich slozkach (--keep ${KEEP}). ⚠ Nepodarilo se zjistit, co z toho git trackuje.`);
}
if (skipped.length) console.log(`⚠ Preskoceno (necitelny releases.json): ${skipped.join(', ')}`);

if (!APPLY) {
  console.log('\nPLAN (nic nesmazano). Spust s --apply.');
  if (naCdn.length) console.log('Ukazka:', naCdn.slice(0, 5).join(', '), naCdn.length > 5 ? `… (+${naCdn.length - 5})` : '');
  process.exit(0);
}

if (!toDelete.length) { console.log('Nic k mazani.'); process.exit(0); }

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
if (!tracked.length) { console.log('Nic trackovaneho k mazani.'); process.exit(0); }

// `git rm -r` po davkach — prilis dlouha prikazova radka spadne na Windows limitu.
const BATCH = 40;
for (let i = 0; i < tracked.length; i += BATCH) {
  const batch = tracked.slice(i, i + BATCH);
  execFileSync('git', ['-C', ROOT, 'rm', '-r', '-q', '--ignore-unmatch', '--', ...batch], { stdio: 'inherit' });
  console.log(`  smazano ${Math.min(i + BATCH, tracked.length)}/${tracked.length}`);
}
console.log(`\nHOTOVO — ${tracked.length} slozek odstraneno z CDN (~${freedCdn.toFixed(1)} MB). Zkontroluj 'git status' a commitni.`);
