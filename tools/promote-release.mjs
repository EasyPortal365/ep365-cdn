// EP365 - povyseni tichych verzi na verejne vydani (standard 2026-08-06)
//
// KONTEXT: kazdy build se publikuje TISE (`publish-cdn.ps1 -Unlisted`) - jde jen do
// <app>/<verze>/ na CDN a zapina se pinem v nasem tenantu. Zakaznik takovou verzi
// nikdy nedostane. Zmeny se mezitim sbiraji do `pending` v CHANGELOG.json.
//
// Tenhle skript udela z nasbiranych `pending` JEDNU zakaznickou kartu pod cislem,
// ktere urci Kami, a `pending` vyprazdni. NIC nepublikuje - publikace je az
// `publish-cdn.ps1` BEZ prepinace -Unlisted (loader + releases.json + versions.json
// + changelog naraz).
//
// BRANA POKRYTI (od 2026-09-23): pred slozenim karty se pusti tools/check-feature-coverage.mjs.
// Nova funkce ma mit od sve tiche verze zmenu v napovede, pruvodci a testovacich datech,
// nebo na karte vyslovnou vyjimku "docs": "n/a" (podrobne v hlavicce toho skriptu). Mezera
// nebo nezmerene okno = konec BEZ zapisu - i s --dry-run, at zkouska ukaze skutecny vysledek.
// Vedome obejiti jen s duvodem: --skip-coverage "duvod". Duvod se vypise u brany i v zaveru
// a patri do commit message povyseni (app repo je privatni, CDN ne - proto ne do karty).
//
// Pouziti (z korene ep365-cdn):
//   node tools/promote-release.mjs atlas 1.10           # nova rada
//   node tools/promote-release.mjs atlas 1.9            # prilepit do bezici rady
//   node tools/promote-release.mjs atlas 1.10 --dry-run # jen ukazat, co by se stalo
//   node tools/promote-release.mjs atlas 1.10 --skip-coverage "napoveda k exportu je v PDF prirucce"
//
// Datum karty = dnesek (nebo --date=YYYY-MM-DD). Nezname prepinace skript odmita:
// preklep v --dry-run by jinak zapsal naostro.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkFeatureCoverage, formatReport, ascii } from './check-feature-coverage.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const APPS_ROOT = resolve(__dirname, '..', '..');

function fail(msg) { console.error('CHYBA: ' + msg); process.exit(1); }

const argv = process.argv.slice(2);
// --skip-coverage nese hodnotu (duvod), ktera nezacina "--" - vytahnout ji PRED delenim na
// prepinace a pozicni argumenty, jinak by se duvod pocital jako <app> nebo <verze>.
let skipReason = null;
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--skip-coverage') {
    const v = argv[i + 1];
    if (v === undefined || v.indexOf('--') === 0) fail('--skip-coverage chce duvod: --skip-coverage "proc se brana pokryti vedome obchazi"');
    skipReason = v;
    argv.splice(i, 2);
    i--;
  } else if (argv[i].indexOf('--skip-coverage=') === 0) {
    skipReason = argv[i].slice('--skip-coverage='.length);
    argv.splice(i, 1);
    i--;
  }
}
if (skipReason !== null && !skipReason.trim()) fail('--skip-coverage chce neprazdny duvod');

const flags = argv.filter(a => a.indexOf('--') === 0);
const pos = argv.filter(a => a.indexOf('--') !== 0);
const unknown = flags.filter(f => f !== '--dry-run' && f.indexOf('--date=') !== 0);
if (unknown.length) fail('neznamy prepinac ' + unknown.join(' ') + ' (znam --dry-run, --date=YYYY-MM-DD, --skip-coverage "duvod")');
const dryRun = flags.indexOf('--dry-run') !== -1;
const dateFlag = (flags.filter(f => f.indexOf('--date=') === 0)[0] || '').replace('--date=', '');

if (pos.length !== 2) fail('pouziti: node tools/promote-release.mjs <app> <verze MAJOR.MINOR> [--dry-run] [--date=YYYY-MM-DD] [--skip-coverage "duvod"]');
const folder = pos[0].indexOf('ep365-') === 0 ? pos[0].substring(6) : pos[0];
const repo = 'ep365-' + folder;
const target = pos[1];
if (!/^\d+\.\d+$/.test(target)) fail('verze musi byt zakaznicka RADA MAJOR.MINOR (napr. 1.10), ne interni build');

const today = dateFlag || new Date().toISOString().slice(0, 10);
if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) fail('neplatne --date (ocekavam YYYY-MM-DD)');

const src = join(APPS_ROOT, repo, 'CHANGELOG.json');
if (!existsSync(src)) fail('nenalezen ' + src);

let data;
try { data = JSON.parse(readFileSync(src, 'utf8')); } catch (e) { fail('CHANGELOG.json neni validni JSON: ' + e.message); }

const pending = Array.isArray(data.pending) ? data.pending : [];
if (pending.length === 0) fail('pending je prazdny - neni co povysit (zmeny tichych verzi se pisou do "pending")');

// ── Brana pokryti ── meri TYZ nacteny `data`, ne druhe cteni souboru.
const cov = checkFeatureCoverage({ app: repo, repo: join(APPS_ROOT, repo), data });
console.log(formatReport(cov).join('\n'));
console.log('');
let skipNote = null;
if (cov.exit !== 0) {
  if (skipReason === null) {
    fail(cov.exit === 2
      ? 'brana pokryti NEZMERILA (' + ascii(cov.error) + ') - nic nezapsano. Oprav pricinu, nebo vedome --skip-coverage "duvod".'
      : 'brana pokryti: bez zmeny v okne zustalo ' + cov.missing.join(', ') + ' - nic nezapsano. Dopln, pridej karte'
        + ' "docs": "n/a" (kde oblast opravdu nepotrebuje), nebo vedome --skip-coverage "duvod".');
  }
  skipNote = 'BRANA POKRYTI VEDOME OBESLA (--skip-coverage): ' + ascii(skipReason)
    + ' - uved to i v commit message povyseni.';
  console.log('!! ' + skipNote);
  console.log('');
} else if (skipReason !== null) {
  console.log('(--skip-coverage zadano, ale brana prosla - duvod se nepouzil: ' + ascii(skipReason) + ')');
  console.log('');
}

// karta rady: bud uz existuje (prilepujeme), nebo vznikne nova
let entry = (data.entries || []).filter(e => e.version === target)[0];
const isNew = !entry;
if (isNew) { entry = { version: target, date: today, changes: [] }; data.entries.unshift(entry); }
else entry.date = today;

// `since` (cislo tiche verze) a `docs` (vyjimka z brany pokryti) jsou nase interni stopa -
// do zakaznicke karty nepatri, proto se kopiruje jen type/cs/en
let added = 0; let skipped = 0;
for (const c of pending) {
  const dup = entry.changes.filter(x => x.cs === c.cs).length > 0;
  if (dup) { skipped++; continue; }
  const card = { type: c.type, cs: c.cs };
  if (c.en) card.en = c.en;
  entry.changes.push(card);
  added++;
}

const silent = [];
pending.forEach(c => { if (c.since && silent.indexOf(c.since) === -1) silent.push(c.since); });

console.log((dryRun ? '[DRY RUN] ' : '') + repo + ': ' + (isNew ? 'nova karta' : 'doplneni karty') + ' "Verze ' + target + '" z ' + today);
console.log('  prevedeno zmen: ' + added + (skipped ? ' (preskoceno jako duplicita: ' + skipped + ')' : ''));
if (silent.length) console.log('  z tichych verzi: ' + silent.join(', '));
for (const c of pending) console.log('   - [' + c.type + '] ' + c.cs.slice(0, 90));

if (dryRun) {
  if (skipNote) console.log('\n!! ' + skipNote);
  console.log('\n(nic zapsano - spust bez --dry-run)');
  process.exit(0);
}

data.pending = [];
writeFileSync(src, JSON.stringify(data, null, 2) + '\n', 'utf8');
try { JSON.parse(readFileSync(src, 'utf8')); } catch (e) { fail('zapsany JSON je rozbity: ' + e.message); }

console.log('\nZapsano do ' + src);
if (skipNote) console.log('!! ' + skipNote);
console.log('Dalsi krok: build + `publish-cdn.ps1` BEZ -Unlisted (= ostry release vc. changelogu).');
