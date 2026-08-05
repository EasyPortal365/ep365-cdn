// EP365 - publikace changelogu appky na CDN
//
// Zdroj pravdy: <app-repo>/CHANGELOG.json (strukturovany, cs + volitelne en).
// Tento skript ho zvaliduje, zapise na CDN (<folder>/changelog.json) a
// vygeneruje citelny CHANGELOG.md v app repu (jen CZ; EN texty zijou v JSON).
//
// SCHEMA 2 (2026-07-07): entry.version = ZAKAZNICKA VERZE = rada MAJOR.MINOR
// (napr. "1.8"), NE interni ctyrmistny build. Karta rady vznika bumpem 2. radu;
// buildy 1.8.x do ni prubezne PRIDAVAJI zmeny (date = datum posledni zmeny).
// Zakaznik vnima jako novou verzi az novou radu.
//
// Pouziti (z korene ep365-cdn):
//   node tools/publish-changelog.mjs fleet            # CDN folder
//   node tools/publish-changelog.mjs ep365-fleet      # nebo appId
//   node tools/publish-changelog.mjs fleet lifecenter # vic appek najednou
//
// Po uspesnem behu: git add <folder>/changelog.json + commit + push (rucne /
// v ramci release postupu). Skript sam necommituje.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CDN_ROOT = resolve(__dirname, '..');
const APPS_ROOT = resolve(CDN_ROOT, '..');

const VALID_TYPES = ['new', 'improved', 'fixed'];
const TYPE_LABEL_CS = { new: 'Nové', improved: 'Vylepšeno', fixed: 'Opraveno' };

function fail(msg) {
  console.error('CHYBA: ' + msg);
  process.exit(1);
}

function normalizeApp(arg) {
  // 'fleet' -> { folder: 'fleet', repo: 'ep365-fleet' }; 'ep365-fleet' -> totez
  const folder = arg.indexOf('ep365-') === 0 ? arg.substring(6) : arg;
  return { folder, repo: 'ep365-' + folder };
}

function validate(data, appId) {
  if (!data || typeof data !== 'object') fail('CHANGELOG.json neni objekt');
  if (data.schema !== 2) fail('schema musi byt 2 (je: ' + data.schema + ') - verze zaznamu = rada MAJOR.MINOR');
  if (data.app !== appId) fail('app v JSON (' + data.app + ') nesouhlasi s repem (' + appId + ')');
  if (!data.name || typeof data.name !== 'string') fail('chybi name (zobrazovany nazev appky)');
  if (!Array.isArray(data.entries) || data.entries.length === 0) fail('entries musi byt neprazdne pole');

  // pending = zmeny z TICHYCH verzi, ktere zakaznik jeste nema videt (standard 2026-08-06).
  // Na CDN se NIKDY nezapisuji - do entries je prevede az tools/promote-release.mjs.
  if (data.pending !== undefined) {
    if (!Array.isArray(data.pending)) fail('pending musi byt pole (nebo chybet)');
    for (const c of data.pending) {
      if (VALID_TYPES.indexOf(c.type) === -1) fail('pending: neplatny type "' + c.type + '" (povolene: ' + VALID_TYPES.join(', ') + ')');
      if (!c.cs || typeof c.cs !== 'string') fail('pending: change bez cs textu');
      if (c.en !== undefined && typeof c.en !== 'string') fail('pending: en musi byt string');
      if (c.cs.indexOf('—') !== -1) fail('pending: cs text obsahuje em-dash (—) - v cestine patri en-dash (–)');
      if (c.since !== undefined && !/^\d+(\.\d+){1,3}$/.test(c.since)) fail('pending: since musi byt cislo tiche verze (napr. 1.9.4.5)');
    }
  }

  for (const e of data.entries) {
    if (!/^\d+\.\d+$/.test(e.version || '')) fail('neplatna verze: "' + e.version + '" (ocekavam zakaznickou RADU MAJOR.MINOR, napr. 1.8 - ne interni build X.Y.Z.W)');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(e.date || '')) fail('neplatne datum u ' + e.version + ': "' + e.date + '" (ocekavam YYYY-MM-DD)');
    if (!Array.isArray(e.changes) || e.changes.length === 0) fail('verze ' + e.version + ' nema zadne changes');
    for (const c of e.changes) {
      if (VALID_TYPES.indexOf(c.type) === -1) fail('verze ' + e.version + ': neplatny type "' + c.type + '" (povolene: ' + VALID_TYPES.join(', ') + ')');
      if (!c.cs || typeof c.cs !== 'string') fail('verze ' + e.version + ': change bez cs textu');
      if (c.en !== undefined && typeof c.en !== 'string') fail('verze ' + e.version + ': en musi byt string');
      // em-dash v CZ textu je proti typografickemu pravidlu EP365 (patri en-dash)
      if (c.cs.indexOf('—') !== -1) fail('verze ' + e.version + ': cs text obsahuje em-dash (—) - v cestine patri en-dash (–)');
    }
  }
}

function cmpVersionDesc(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 2; i++) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pb[i] || 0) - (pa[i] || 0);
  }
  return 0;
}

function toMarkdown(data) {
  const lines = [];
  lines.push('<!-- GENEROVANO z CHANGELOG.json (node tools/publish-changelog.mjs v ep365-cdn) - NEEDITOVAT RUCNE. EN texty jsou v CHANGELOG.json. -->');
  lines.push('# Changelog – ' + data.name);
  lines.push('');
  for (const e of data.entries) {
    lines.push('## Verze ' + e.version + ' – ' + e.date);
    lines.push('');
    for (const c of e.changes) {
      lines.push('- **' + TYPE_LABEL_CS[c.type] + ':** ' + c.cs);
    }
    lines.push('');
  }
  if (Array.isArray(data.pending) && data.pending.length) {
    lines.push('## Nevydano - ceka na povyseni tiche verze');
    lines.push('');
    for (const c of data.pending) {
      lines.push('- **' + TYPE_LABEL_CS[c.type] + ':** ' + c.cs + (c.since ? ' _(tiche ' + c.since + ')_' : ''));
    }
    lines.push('');
  }
  return lines.join('\n');
}

const args = process.argv.slice(2);
if (args.length === 0) fail('zadej aspon jednu appku, napr.: node tools/publish-changelog.mjs fleet');

for (const arg of args) {
  const { folder, repo } = normalizeApp(arg);
  const srcPath = join(APPS_ROOT, repo, 'CHANGELOG.json');
  if (!existsSync(srcPath)) fail('nenalezen ' + srcPath);

  let data;
  try {
    data = JSON.parse(readFileSync(srcPath, 'utf8'));
  } catch (e) {
    fail('CHANGELOG.json neni validni JSON: ' + e.message);
  }
  validate(data, repo);

  // Serazeni entries sestupne dle verze (pojistka proti rucnimu prehazeni)
  data.entries.sort((a, b) => cmpVersionDesc(a.version, b.version));

  // 1) CDN kopie - BEZ pending. CDN je verejne citelne, takze texty nevydanych
  //    tichych verzi by si zakaznik mohl precist drive, nez o nich rozhodneme.
  const outDir = join(CDN_ROOT, folder);
  if (!existsSync(outDir)) mkdirSync(outDir);
  const outPath = join(outDir, 'changelog.json');
  const publicData = { ...data };
  delete publicData.pending;
  writeFileSync(outPath, JSON.stringify(publicData, null, 2) + '\n', 'utf8');

  // 2) Citelny CHANGELOG.md v app repu
  const mdPath = join(APPS_ROOT, repo, 'CHANGELOG.md');
  writeFileSync(mdPath, toMarkdown(data), 'utf8');

  const latest = data.entries[0];
  console.log('OK ' + repo + ': ' + data.entries.length + ' verzi (nejnovejsi ' + latest.version + ' z ' + latest.date + ')');
  console.log('   -> ' + outPath);
  console.log('   -> ' + mdPath);
}

console.log('');
console.log('Dalsi krok: v ep365-cdn git add <folder>/changelog.json + commit + push.');
