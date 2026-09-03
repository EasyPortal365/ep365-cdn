#!/usr/bin/env node
/**
 * prune-cdn.mjs — JEDINY vstupni bod pro prorez CDN (krok 5.5 v /release).
 *
 * PROC EXISTUJE (TECH-DEBT #169)
 *   Prorez se skladal ze ctyr prikazu, ktere se musely pustit ve SPRAVNEM PORADI
 *   a se SPRAVNYMI parametry:
 *     check-stable-roots -> prune-bundles --keep 10 --protect a,b,c -> prune-versions --keep 15
 *   Kdo pustil jen jeden, uklidil polovinu; kdo zapomnel `--protect`, smazal bundle,
 *   na ktery porad miri `.sppkg` externiho zakaznika; kdo prehodil poradi, pustil
 *   mazani driv, nez se overilo, ze stabilni loader prezije. A `--protect` se navic
 *   opisoval rucne ze skillu — proto byl do 2026-08-29 neuplny.
 *
 *   Tenhle skript to dela za jeden prikaz, v pevnem poradi, a KAZDA BRANA JE TVRDA:
 *   kdyz nektera neprojde, dalsi krok se nespusti.
 *
 * BRANY (v tomhle poradi)
 *   0. velikost TRACKOVANEHO obsahu (`git ls-tree`, ne `du` — §65 bod 2)
 *   1. check-stable-roots.mjs   — prorez nesmi smazat stabilni loader (§23.8)
 *   2. check-pin-guard.mjs      — pin guard v prune-versions.mjs skutecne drzi (#250)
 *   3. prune-bundles.mjs        — bundly v koreni appky (tvar CDN pred runtime verzemi)
 *   4. prune-versions.mjs       — slozky <app>/<verze>/ (runtime kanal; sam si vynuti
 *                                 cerstvy soupis pinu, viz jeho hlavicka)
 *   5. velikost po prorezu + verdikt proti prahum z politiky
 *
 * POLITIKA (fail-closed)
 *   Cisla a seznam chranenych appek se NEOPISUJI z hlavy — ctou se z
 *     ep365-docs/scripts/cdn-prune-policy.json
 *   Ten soubor zije v PRIVATNIM repu, protoze `protectBundles` vaze appky na jedine
 *   externi nasazeni; ep365-cdn je PUBLIC. Chybejici politika = CHYBA, ne default:
 *   prorez, ktery si chranene appky domysli, by smazal presne to, co chranit mel.
 *
 * POUZITI
 *   node tools/prune-cdn.mjs                 # PLAN — nic nemaze
 *   node tools/prune-cdn.mjs --apply         # provede oba prorezy (git rm)
 *   node tools/prune-cdn.mjs --policy <path> # jina politika (testy)
 *
 * PO `--apply` COMMITNI BEZ `git add`
 *   Oba prorezy si `git rm` staguji samy. `git add -A` / `git add .` by ve sdilenem
 *   CDN repu smetlo rozpracovane soubory jine session pod tvuj commit (§31.1).
 *
 * NAVRATOVY KOD
 *   0 = probehlo (nebo v planu nic k mazani); 1 = brana neprosla / pres limit
 *
 * Vystup je schvalne ASCII — konzole PS 5.1 rozsype diakritiku.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';

const TOOLS = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(TOOLS, '..');
const args = process.argv.slice(2);
const APPLY = args.indexOf('--apply') !== -1;
const POLICY = (() => {
  const i = args.indexOf('--policy');
  return i !== -1 && args[i + 1] ? path.resolve(args[i + 1])
    : path.resolve(ROOT, '..', 'ep365-docs', 'scripts', 'cdn-prune-policy.json');
})();

function konec(m) { console.error('\nPROREZ ZASTAVEN\n  ' + m); process.exit(1); }

// ------------------------------------------------------------- 0. politika ---
let pol = null;
try { pol = JSON.parse(fs.readFileSync(POLICY, 'utf8')); }
catch (e) { konec('politika prorezu nenalezena nebo necitelna: ' + POLICY + ' (' + (e && (e.code || e.message)) + ')'); }
const cislo = (k) => { const v = pol[k]; if (typeof v !== 'number' || !isFinite(v) || v <= 0) konec('politika nema platne cislo "' + k + '"'); return v; };
const KEEP_BUNDLES = cislo('keepBundles');
const KEEP_VERSIONS = cislo('keepVersions');
const WARN_MB = cislo('warnTrackedMB');
const LIMIT_MB = cislo('limitTrackedMB');
if (!Array.isArray(pol.protectBundles)) konec('politika nema pole "protectBundles" (prazdne pole je platna, ale VEDOMA volba)');
const PROTECT = pol.protectBundles.filter(s => typeof s === 'string' && s.length);
if (PROTECT.length !== pol.protectBundles.length) konec('politika ma v "protectBundles" neplatnou polozku');
// Bundly ROZSIRENI (widget, command set) jsou hashovany kontrakt .sppkg — bez vzoru by je okno
// --keep vytlacilo (naostro 2026-09-03, ai-chat widget 404 od 31. 8.). Chybejici pole = CHYBA.
if (!Array.isArray(pol.protectRootPatterns)) konec('politika nema pole "protectRootPatterns" (bundly rozsireni = kontrakt .sppkg; prazdne pole je platna, ale VEDOMA volba)');
const PATTERNS = pol.protectRootPatterns.filter(s => typeof s === 'string' && s.trim().length);
if (PATTERNS.length !== pol.protectRootPatterns.length) konec('politika ma v "protectRootPatterns" neplatnou polozku');

// Chranena appka, ktera na CDN neexistuje, znamena preklep — a preklep v seznamu
// chranenych je tise stejne nebezpecny jako chybejici polozka.
const neexistuje = PROTECT.filter(a => !fs.existsSync(path.join(ROOT, a)));
if (neexistuje.length) konec('politika chrani appky, ktere na CDN nejsou: ' + neexistuje.join(', '));

// ------------------------------------------------------------- 0b. velikost ---
function trackedMB() {
  try {
    const out = execFileSync('git', ['-C', ROOT, 'ls-tree', '-r', 'HEAD', '--long'], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
    let s = 0;
    out.split('\n').forEach(function (l) {
      const m = l.match(/^\d+\s+blob\s+[0-9a-f]+\s+(\d+)\t/);
      if (m) s += parseInt(m[1], 10);
    });
    return s / (1024 * 1024);
  } catch (e) { return null; }
}

const pred = trackedMB();
if (pred === null) konec('nepodarilo se zmerit velikost trackovaneho obsahu (git ls-tree) - bez cisla se prorez neplanuje');
console.log('Politika: ' + POLICY);
console.log('  bundly --keep ' + KEEP_BUNDLES + ' --protect ' + (PROTECT.join(',') || '(nic)') + ' | verze --keep ' + KEEP_VERSIONS
  + ' | prahy ' + WARN_MB + '/' + LIMIT_MB + ' MB | vzory rozsireni ' + (PATTERNS.join(' ') || '(zadne)'));
console.log('CDN pred prorezem: ' + pred.toFixed(1) + ' MB trackovaneho obsahu (Pages limit ~1 GB)');
console.log('Rezim: ' + (APPLY ? 'APPLY (maze)' : 'PLAN (nic se nemaze)') + '\n');

// -------------------------------------------------------------- pomocnik ----
function krok(nazev, tool, argy, { povinnyUspech = true } = {}) {
  console.log('--- ' + nazev + ' ---');
  const r = spawnSync(process.execPath, [path.join(TOOLS, tool)].concat(argy), { stdio: 'inherit' });
  if (povinnyUspech && r.status !== 0) konec(nazev + ' skoncil kodem ' + r.status + ' - dalsi kroky se NEPOUSTEJI.');
  console.log('');
  return r.status;
}

// -------------------------------------------------------------- 1.-2. brany --
const patternArg = PATTERNS.length ? ['--protect-patterns', PATTERNS.join(',')] : [];
krok('1/5 kontrola stabilnich koreni (loader + bundly rozsireni) - par. 23.8/23.10', 'check-stable-roots.mjs', ['--keep', String(KEEP_BUNDLES)].concat(patternArg));
krok('2/5 kontrola pin guardu (protipriklad) - #250', 'check-pin-guard.mjs', []);

// --------------------------------------------------------------- 3.-4. rez ---
const protectArg = PROTECT.length ? ['--protect', PROTECT.join(',')] : [];
krok('3/5 prorez bundlu v koreni appek', 'prune-bundles.mjs',
  ['--keep', String(KEEP_BUNDLES)].concat(protectArg, patternArg, APPLY ? ['--apply'] : []));
krok('4/5 prorez verznich slozek runtime kanalu', 'prune-versions.mjs',
  ['--keep', String(KEEP_VERSIONS)].concat(APPLY ? ['--apply'] : []));

// ------------------------------------------------------------ 5. verdikt -----
console.log('--- 5/5 velikost po prorezu ---');
const po = trackedMB();
if (po === null) konec('nepodarilo se zmerit velikost po prorezu');
console.log('CDN: ' + pred.toFixed(1) + ' MB -> ' + po.toFixed(1) + ' MB'
  + (APPLY ? '' : '  (PLAN - cislo se nezmenilo, mazani neprobehlo)'));

if (APPLY) {
  console.log('\nCommitni BEZ `git add` - oba prorezy si `git rm` staguji samy.');
  console.log('Nejdriv `git status` / `git diff --cached --name-only`: cizi staged soubory NECHAT te session (par. 31.1).');
}
if (po > LIMIT_MB) {
  console.error('\n!!! CDN je PRES LIMIT (' + po.toFixed(1) + ' > ' + LIMIT_MB + ' MB). Pages prestane deployovat VSEM appkam.');
  console.error('    Prorez uz nestaci - rekni to Kamimu (snizit retenci, nebo odchranit externi nasazeni).');
  process.exit(1);
}
if (po > WARN_MB) {
  console.log('\n! VAROVANI: ' + po.toFixed(1) + ' MB je nad prahem ' + WARN_MB + ' MB (limit ' + LIMIT_MB + ').');
  console.log('  Vcasny signal, ne porucha - ale dalsi vlna tichych vydani uz ho muze prekrocit.');
}
