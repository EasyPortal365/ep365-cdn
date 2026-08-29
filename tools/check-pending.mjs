// EP365 - kontrola CHANGELOG.json napric flotilou (pousti /wrap-up, bod 1)
//
// PROC: `publish-changelog.mjs` tytez soubory validuje, ale az PRI OSTREM RELEASU —
// tedy ve chvili, kdy uz `publish-cdn.ps1` zkopiroval bundly a zbyva jen changelog.
// Vada napsana behem tichych verzi tak lezi tydny a projevi se v nejhorsi moment.
// Tenhle skript pousti STEJNA pravidla (tools/changelog-rules.mjs) hned, na vsechny
// appky naraz, a nic nezapisuje.
//
// Pouziti (z korene ep365-cdn):
//   node tools/check-pending.mjs           # cela flotila
//   node tools/check-pending.mjs fleet crm # jen vyjmenovane
//   node tools/check-pending.mjs --selftest # zaporny test: dolozi, ze kontrola VUBEC spadne
//
// Exit 1 = nalez. Exit 2 = nepodarilo se zkontrolovat (chybejici/rozbity soubor) —
// to NENI "cisto": tichy preskok by hlasil bezpeci, ktere se neoverilo.
//
// ⚠ Cista flotila NEDOKAZUJE, ze kontrola funguje (§63.7). Proto `--selftest`:
// pousti pravidla na vadne fixtury a ceka nalez. Po zmene pravidel pust oboji.

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectIssues } from './changelog-rules.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const APPS_ROOT = resolve(__dirname, '..', '..');

const argv = process.argv.slice(2);

if (argv.indexOf('--selftest') !== -1) {
  // Kazda fixtura je jinak vadna a MUSI dat aspon jeden nalez. Kdyby pravidlo nekdo
  // omylem vyradil, projde tady nula nalezu a selftest spadne — presne o to jde.
  const okBase = {
    schema: 2, app: 'ep365-test', name: 'Test',
    entries: [{ version: '1.0', date: '2026-01-01', changes: [{ type: 'new', cs: 'Text' }] }]
  };
  const FIXTURES = [
    ['pending jako OBJEKT (ticha ztrata)', { ...okBase, pending: { since: '1.0.0.1', changes: [] } }],
    ['neplatny type added', { ...okBase, pending: [{ type: 'added', cs: 'Text' }] }],
    ['ASCII uvozovka v cs', { ...okBase, pending: [{ type: 'new', cs: 'Sekce "Prehled" je nova' }] }],
    ['em-dash v cs', { ...okBase, pending: [{ type: 'new', cs: 'Text — dalsi' }] }],
    ['pending bez cs', { ...okBase, pending: [{ type: 'new', en: 'Text' }] }],
    ['since neni cislo verze', { ...okBase, pending: [{ type: 'new', cs: 'Text', since: 'nekdy' }] }]
  ];
  let failed = 0;
  console.log('  Zaporny test pravidel (kazda fixtura MUSI dat nalez):');
  for (const [label, data] of FIXTURES) {
    const issues = collectIssues(data, 'ep365-test');
    if (issues.length) {
      console.log('    ok   ' + label + ' -> ' + issues[0]);
    } else {
      console.log('    X    ' + label + ' -> ZADNY NALEZ, pravidlo nefunguje');
      failed++;
    }
  }
  // Kladna kontrola: cisty vstup nesmi hlasit nic (jinak by "vsechno spadne" bylo bezcenne).
  const clean = collectIssues({ ...okBase, pending: [{ type: 'improved', cs: 'Text', since: '1.0.0.2' }] }, 'ep365-test');
  if (clean.length) { console.log('    X    cisty vstup hlasi nalez: ' + clean[0]); failed++; }
  else console.log('    ok   cisty vstup je bez nalezu');
  console.log('');
  console.log(failed ? '  SELFTEST SPADL: ' + failed : '  Selftest OK.');
  process.exit(failed ? 1 : 0);
}

const repos = argv.length
  ? argv.map(a => (a.indexOf('ep365-') === 0 ? a : 'ep365-' + a))
  : readdirSync(APPS_ROOT, { withFileTypes: true })
      .filter(d => d.isDirectory() && d.name.indexOf('ep365-') === 0)
      .map(d => d.name)
      .filter(r => existsSync(join(APPS_ROOT, r, 'CHANGELOG.json')))
      .sort();

if (!repos.length) {
  console.error('CHYBA: nenalezena zadna appka s CHANGELOG.json pod ' + APPS_ROOT);
  process.exit(2);
}

let bad = 0, broken = 0, unreleased = 0;
const rows = [];

for (const repo of repos) {
  const p = join(APPS_ROOT, repo, 'CHANGELOG.json');
  if (!existsSync(p)) { console.error('  ! ' + repo + ': CHANGELOG.json nenalezen'); broken++; continue; }

  let data;
  try {
    data = JSON.parse(readFileSync(p, 'utf8'));
  } catch (e) {
    console.error('  ! ' + repo + ': neni validni JSON - ' + e.message);
    broken++;
    continue;
  }

  const issues = collectIssues(data, repo);
  // Tvar pending hlasime zvlast: pole = OK, objekt = ticha ztrata, chybi = nic nesbira.
  const shape = data.pending === undefined ? '-'
    : Array.isArray(data.pending) ? String(data.pending.length)
    : 'OBJEKT!';
  if (Array.isArray(data.pending)) unreleased += data.pending.length;

  rows.push({ repo, shape, n: issues.length });
  if (issues.length) {
    bad++;
    console.log('');
    console.log('  X ' + repo + ' - ' + issues.length + ' nalezu:');
    for (const m of issues) console.log('      ' + m);
  }
}

console.log('');
console.log('  appka                  pending  nalezy');
console.log('  ' + '-'.repeat(38));
for (const r of rows) {
  console.log('  ' + r.repo + ' '.repeat(Math.max(1, 22 - r.repo.length)) + ' '.repeat(Math.max(0, 7 - r.shape.length)) + r.shape + '  ' + (r.n ? 'X ' + r.n : 'ok'));
}
console.log('');
console.log('  ' + rows.length + ' appek, ' + unreleased + ' nevydanych zmen v pending, '
  + (bad ? bad + ' appek s nalezem' : 'zadny nalez'));

if (broken) { console.error('  ! ' + broken + ' souboru se nepodarilo zkontrolovat'); process.exit(2); }
process.exit(bad ? 1 : 0);
