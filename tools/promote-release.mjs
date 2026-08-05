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
// Pouziti (z korene ep365-cdn):
//   node tools/promote-release.mjs atlas 1.10           # nova rada
//   node tools/promote-release.mjs atlas 1.9            # prilepit do bezici rady
//   node tools/promote-release.mjs atlas 1.10 --dry-run # jen ukazat, co by se stalo
//
// Datum karty = dnesek (nebo --date YYYY-MM-DD).

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const APPS_ROOT = resolve(__dirname, '..', '..');

function fail(msg) { console.error('CHYBA: ' + msg); process.exit(1); }

const argv = process.argv.slice(2);
const flags = argv.filter(a => a.indexOf('--') === 0);
const pos = argv.filter(a => a.indexOf('--') !== 0);
const dryRun = flags.indexOf('--dry-run') !== -1;
const dateFlag = (flags.filter(f => f.indexOf('--date=') === 0)[0] || '').replace('--date=', '');

if (pos.length < 2) fail('pouziti: node tools/promote-release.mjs <app> <verze MAJOR.MINOR> [--dry-run] [--date=YYYY-MM-DD]');
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

// karta rady: bud uz existuje (prilepujeme), nebo vznikne nova
let entry = (data.entries || []).filter(e => e.version === target)[0];
const isNew = !entry;
if (isNew) { entry = { version: target, date: today, changes: [] }; data.entries.unshift(entry); }
else entry.date = today;

// `since` (cislo tiche verze) je nase interni stopa - do zakaznicke karty nepatri
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

if (dryRun) { console.log('\n(nic zapsano - spust bez --dry-run)'); process.exit(0); }

data.pending = [];
writeFileSync(src, JSON.stringify(data, null, 2) + '\n', 'utf8');
try { JSON.parse(readFileSync(src, 'utf8')); } catch (e) { fail('zapsany JSON je rozbity: ' + e.message); }

console.log('\nZapsano do ' + src);
console.log('Dalsi krok: build + `publish-cdn.ps1` BEZ -Unlisted (= ostry release vc. changelogu).');
