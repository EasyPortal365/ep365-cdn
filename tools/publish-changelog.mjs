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
import { collectIssues } from './changelog-rules.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CDN_ROOT = resolve(__dirname, '..');
const APPS_ROOT = resolve(CDN_ROOT, '..');

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
  const issues = collectIssues(data, appId);
  if (issues.length) fail(issues[0]);
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
