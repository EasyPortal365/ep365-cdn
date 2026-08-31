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
 *   • VŽDY zůstane N nejnovějších verzí (default 15) — tam padají tiché verze,
 *     na které jsme připnutí my.
 *   • Cokoli jiného je stará tichá verze, ke které se nikdo nedostane.
 *
 * Bez `--apply` jen vypíše plán. Řadí se podle ČÍSEL verze (1.9.0.10 > 1.9.0.9),
 * ne abecedně — abecední řazení by smazalo novější verzi místo starší.
 *
 * Použití:
 *   node tools/prune-versions.mjs                 # plán, všechny appky
 *   node tools/prune-versions.mjs --keep 15       # jiný počet ponechaných
 *   node tools/prune-versions.mjs --app ai-chat   # jen jedna appka
 *   node tools/prune-versions.mjs --apply         # provede `git rm -r`
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
  const del = versions.filter(v => !keepNewest.has(v) && !released.has(v));
  let mb = 0;
  del.forEach(v => { const s = dirSizeMB(path.join(appDir, v)); mb += s; toDelete.push(`${app}/${v}`); });
  freed += mb;

  rows.push({
    app, verzi: versions.length,
    ponechano: versions.length - del.length,
    smazat: del.length,
    'uvolni MB': mb.toFixed(1),
    pozn: released.size ? `${released.size} ostrych chraneno` : 'zadne ostre vydani'
  });
}

console.table(rows);
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
