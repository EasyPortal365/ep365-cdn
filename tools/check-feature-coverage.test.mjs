#!/usr/bin/env node
/**
 * check-feature-coverage.test.mjs - dokazuje, ze brana pokryti MERI, ne jen mluvi.
 *
 * CO HLIDA
 *   tools/check-feature-coverage.mjs (a jeho zapojeni v promote-release.mjs) ma pustit
 *   ostre vydani jen tehdy, kdyz se od tiche verze nejstarsi karty v `pending` sahlo na
 *   napovedu, pruvodce a testovaci data - nebo kdyz karta nese vyjimku "docs": "n/a".
 *   Test, ktery projde i bez brany, nedokazuje nic (§23.8, §66.5): proto kazdy kladny
 *   pripad ma protejsek, ktery MUSI spadnout (sabotaz = funkce bez napovedy).
 *
 * KDE
 *   Vyhradne v jednorazovych mini-repech v TEMPu (git init + dva az tri commity), ktera
 *   si test postavi a po sobe smaze. Promote-release se pousti z KOPIE nastroju v TEMPu
 *   nad TEMP repem - na zadne skutecne CHANGELOG.json nesaha.
 *
 * PRIPADY
 *   A  pokryto: commit sahne na obrazovku, napovedu, pruvodce i seed      -> exit 0
 *   B  SABOTAZ: commit sahne jen na obrazovku                             -> exit 1
 *   C  vyjimka: jako B, karta nese "docs": "n/a"                          -> exit 0
 *   D  castecna vyjimka a vic karet (jedna bez vyjimky staci k pozadavku)
 *   E  prace PRED bumpem se pocita (okno od nizsi verze, ne od bumpu); okno od bumpu (--base) ji nevidi
 *   F  precislovani 1.0.0.0 -> 1.1.0.0 (prace) -> 1.0.0.1 se pocita
 *   G  since mimo historii -> exit 2 (nezmereno neni ok)
 *   H  necommitnuta napoveda se nepocita, ale vypise se
 *   I  changelog-rules: neplatna vyjimka "docs" je nalez, platna ne
 *   J  klasifikace souboru (helpers/Helpdesk/TourState/bladeModel NEJSOU oblast) + mapa vyjimek
 *   K  promote-release: mezera = konec bez zapisu (i --dry-run), --skip-coverage bez duvodu = chyba,
 *      s duvodem projde a duvod vypise, neznamy prepinac = chyba, pokryte repo se zapise
 *
 * POUZITI
 *   node tools/check-feature-coverage.test.mjs
 *   Pust po kazde zmene check-feature-coverage.mjs, changelog-rules.mjs (parseDocs) nebo
 *   promote-release.mjs.
 *
 * NAVRATOVY KOD: 0 = vsechny pripady sedi, 1 = cokoli jineho. Vystup je ASCII.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';
import { collectIssues, parseDocs, DOCS_AREAS } from './changelog-rules.mjs';
import { genericAreas, appProfile, AREAS, APP_MAP } from './check-feature-coverage.mjs';

const TOOLS = path.dirname(fileURLToPath(import.meta.url));
const CFC = path.join(TOOLS, 'check-feature-coverage.mjs');

let chyby = 0;
const ok = (t, m) => { console.log((t ? '  OK   ' : '  CHYBA') + ' ' + m); if (!t) chyby++; return t; };

// Import CLI modulu nesmi spustit CLI (§25.49) - kdyby brana `isMain` nedrzela, proces by
// uz skoncil exit kodem usage a sem by se nedostal.
ok(true, 'import check-feature-coverage.mjs nespustil CLI (brana isMain drzi)');

// ---------------------------------------------------------------- mini-repo ---
const ROOTS = [];
const WP = 'src/webparts/cfcTest';
const FILES = {
  view: WP + '/components/views/MainView.tsx',
  help: WP + '/components/views/HelpView.tsx',
  tour: WP + '/components/tour/cfcTour.tsx',
  seed: WP + '/services/SeedService.ts',
};
const ALL = ['view', 'help', 'tour', 'seed'];

const git = (dir, args) => execFileSync('git', ['-C', dir, '-c', 'user.name=t', '-c', 'user.email=t@t'].concat(args),
  { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

function write(dir, rel, content) {
  const p = path.join(dir, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content);
}

const versionJson = v => JSON.stringify({ $comment: 'test', version: v }, null, 2) + '\n';
const changelogJson = pending => JSON.stringify({
  schema: 2, app: 'ep365-cfctest', name: 'Test', pending,
  entries: [{ version: '1.0', date: '2026-01-01', changes: [{ type: 'new', cs: 'Prvni vydani' }] }],
}, null, 2) + '\n';
// Karta s diakritikou: overuje i ASCII vystup.
const card = extra => Object.assign({ type: 'new', since: '1.0.0.1', cs: 'Nová funkce – přehled měsíců' }, extra || {});

/**
 * Repo v <root>/ep365-cfctest: prvni commit = ostre vydani 1.0.0.0 se vsemi oblastmi,
 * pak kazdy krok = jeden commit (touch = ktere soubory zmenit, version, pending).
 */
function buildRepo(name, steps) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ep365-cfc-' + name + '-'));
  ROOTS.push(root);
  const dir = path.join(root, 'ep365-cfctest');
  fs.mkdirSync(dir);
  git(dir, ['init', '-q']);
  write(dir, 'config/app-version.json', versionJson('1.0.0.0'));
  write(dir, 'CHANGELOG.json', changelogJson([]));
  for (const k of ALL) write(dir, FILES[k], '// ' + k + ' v1\n');
  git(dir, ['add', '-A']);
  git(dir, ['commit', '-q', '-m', 'ostre vydani 1.0']);
  steps.forEach((s, i) => {
    for (const k of s.touch || []) write(dir, FILES[k], '// ' + k + ' krok ' + (i + 1) + '\n');
    if (s.version) write(dir, 'config/app-version.json', versionJson(s.version));
    if (s.pending) write(dir, 'CHANGELOG.json', changelogJson(s.pending));
    git(dir, ['add', '-A']);
    git(dir, ['commit', '-q', '-m', 'krok ' + (i + 1)]);
  });
  return { root, dir };
}

function cfc(dir, extra) {
  const r = spawnSync(process.execPath, [CFC, 'cfctest', '--repo', dir].concat(extra || []), { encoding: 'utf8' });
  let json = null;
  if ((extra || []).indexOf('--json') !== -1) { try { json = JSON.parse(r.stdout); } catch (e) { json = null; } }
  return { code: r.status, out: (r.stdout || '') + (r.stderr || ''), json };
}

const isAscii = s => { for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); if (c > 0x7e || (c < 0x20 && c !== 10 && c !== 13 && c !== 9)) return false; } return true; };
const missingOf = j => (j && j.missing ? j.missing.slice().sort().join(',') : '?');

// -------------------------------------------------------------------- pripady ---
function main() {
  console.log('A  pokryto (obrazovka + napoveda + pruvodce + seed v jednom commitu s bumpem)');
  const A = buildRepo('a', [{ touch: ALL, version: '1.0.0.1', pending: [card()] }]);
  let r = cfc(A.dir, ['--json']);
  ok(r.code === 0 && r.json && r.json.status === 'ok', 'exit 0, status ok (je: ' + r.code + ', ' + (r.json && r.json.status) + ')');
  r = cfc(A.dir);
  ok(r.code === 0 && /VYSLEDEK: OK/.test(r.out), 'textovy vystup hlasi OK');
  ok(isAscii(r.out), 'textovy vystup je ciste ASCII i s kartou s diakritikou');

  console.log('B  SABOTAZ: funkce bez napovedy, pruvodce a seedu');
  const B = buildRepo('b', [{ touch: ['view'], version: '1.0.0.1', pending: [card()] }]);
  r = cfc(B.dir, ['--json']);
  ok(r.code === 1 && r.json && r.json.status === 'gap', 'exit 1, status gap (je: ' + r.code + ')');
  ok(missingOf(r.json) === 'help,seed,tour', 'chybi presne help, seed, tour (je: ' + missingOf(r.json) + ')');
  ok(r.json && r.json.cards.open.length === 1 && r.json.cards.open[0].flags.help === '-', 'karta je v seznamu bez vyjimky s priznakem "-"');
  r = cfc(B.dir);
  ok(r.code === 1 && /VYSLEDEK: MEZERA/.test(r.out) && /Nova funkce - prehled mesicu/.test(r.out), 'textovy vystup hlasi MEZERA a kartu v ASCII');

  console.log('C  vyjimka "docs": "n/a" (jinak totez co B)');
  const C = buildRepo('c', [{ touch: ['view'], version: '1.0.0.1', pending: [card({ docs: 'n/a' })] }]);
  r = cfc(C.dir, ['--json']);
  ok(r.code === 0 && r.json && r.json.status === 'ok', 'exit 0 diky vyjimce (je: ' + r.code + ')');
  ok(r.json && r.json.cards.exempt === 1 && r.json.cards.open.length === 0, 'karta se pocita jako vyjmuta, seznam bez vyjimky je prazdny');

  console.log('D  castecna vyjimka a vic karet');
  const D1 = buildRepo('d1', [{ touch: ['view', 'help'], version: '1.0.0.1', pending: [card({ docs: { tour: 'n/a', seed: 'n/a' } })] }]);
  r = cfc(D1.dir, ['--json']);
  ok(r.code === 0, 'napoveda zmenena + {"tour","seed": "n/a"} -> exit 0 (je: ' + r.code + ')');
  const D2 = buildRepo('d2', [{ touch: ['view', 'help'], version: '1.0.0.1', pending: [card({ docs: { tour: 'n/a' } })] }]);
  r = cfc(D2.dir, ['--json']);
  ok(r.code === 1 && missingOf(r.json) === 'seed', 'napoveda zmenena + jen {"tour": "n/a"} -> exit 1, chybi seed (je: ' + r.code + ', ' + missingOf(r.json) + ')');
  const D3 = buildRepo('d3', [{ touch: ['view'], version: '1.0.0.1', pending: [card({ docs: 'n/a' }), card({ cs: 'Druhá karta bez výjimky' })] }]);
  r = cfc(D3.dir, ['--json']);
  ok(r.code === 1 && missingOf(r.json) === 'help,seed,tour', 'jedna karta s vyjimkou + jedna bez -> oblasti pozadovane, exit 1 (je: ' + r.code + ')');
  const D4 = buildRepo('d4', [{ touch: ['view'], version: '1.0.0.1', pending: [card({ docs: 'N/A' })] }]);
  r = cfc(D4.dir, ['--json']);
  ok(r.code === 1 && r.json && r.json.cards.invalid.length === 1, 'neplatna vyjimka "N/A" se NEpocita (brana prisnejsi) a je hlasena (je: ' + r.code + ')');

  console.log('E  prace PRED bumpem (bump je az posledni commit pred buildem)');
  const E = buildRepo('e', [{ touch: ALL }, { version: '1.0.0.1', pending: [card()] }]);
  r = cfc(E.dir, ['--json']);
  ok(r.code === 0, 'okno od nizsi verze vidi napovedu z commitu pred bumpem -> exit 0 (je: ' + r.code + ')');
  const bump = git(E.dir, ['rev-parse', 'HEAD']).trim();
  r = cfc(E.dir, ['--json', '--base', bump]);
  ok(r.code === 1, 'protipriklad: okno od bumpu (--base bump) tutez praci NEvidi -> exit 1 (je: ' + r.code + ')');

  console.log('F  precislovani: 1.0.0.0 -> 1.1.0.0 (prace) -> 1.0.0.1');
  const F = buildRepo('f', [{ touch: ALL, version: '1.1.0.0' }, { version: '1.0.0.1', pending: [card()] }]);
  r = cfc(F.dir, ['--json']);
  ok(r.code === 0 && r.json && r.json.window && r.json.window.base && r.json.window.base.version === '1.0.0.0',
    'okno zacina posledni NIZSI verzi 1.0.0.0, prace pod 1.1.0.0 se pocita (je: ' + r.code + ', baze ' + (r.json && r.json.window && r.json.window.base && r.json.window.base.version) + ')');

  console.log('G  since, ktere historie verze nezna');
  const G = buildRepo('g', [{ touch: ALL, version: '1.0.0.1', pending: [card({ since: '1.0.0.9' })] }]);
  r = cfc(G.dir, ['--json']);
  ok(r.code === 2 && r.json && r.json.status === 'error', 'exit 2, status error - nezmereno neni ok (je: ' + r.code + ')');

  console.log('H  necommitnuta napoveda');
  write(B.dir, FILES.help, '// napoveda rozepsana, necommitnuta\n');
  r = cfc(B.dir, ['--json']);
  const helpArea = r.json && r.json.areas.filter(a => a.id === 'help')[0];
  ok(r.code === 1 && helpArea && helpArea.uncommitted.length === 1, 'nepocita se (exit 1), ale je ve vysledku jako necommitnuta (je: ' + r.code + ')');
  r = cfc(B.dir);
  ok(/NEcommitnute/.test(r.out), 'textovy vystup na ni upozorni');
  git(B.dir, ['checkout', '--', FILES.help]);

  console.log('I  changelog-rules: vyjimka "docs"');
  const base = { schema: 2, app: 'ep365-t', name: 'T', entries: [{ version: '1.0', date: '2026-01-01', changes: [{ type: 'new', cs: 'Text' }] }] };
  const bad = [['"na"', 'na'], ['"N/A"', 'N/A'], ['{tuor}', { tuor: 'n/a' }], ['{tour: "ano"}', { tour: 'ano' }], ['{}', {}], ['pole', ['help']], ['true', true]];
  for (const [label, docs] of bad) {
    const issues = collectIssues(Object.assign({}, base, { pending: [{ type: 'new', cs: 'Text', docs }] }), 'ep365-t');
    ok(issues.some(m => m.indexOf('docs') !== -1), 'neplatna vyjimka ' + label + ' je nalez');
  }
  for (const [label, docs] of [['"n/a"', 'n/a'], ['{seed, lessons}', { seed: 'n/a', lessons: 'n/a' }]]) {
    const issues = collectIssues(Object.assign({}, base, { pending: [{ type: 'new', cs: 'Text', docs }] }), 'ep365-t');
    ok(!issues.length, 'platna vyjimka ' + label + ' nalez nema' + (issues.length ? ' (je: ' + issues[0] + ')' : ''));
  }
  ok(parseDocs('n/a').all === true && parseDocs({ tour: 'n/a' }).areas.join() === 'tour' && parseDocs(undefined).areas.length === 0,
    'parseDocs: "n/a" = vse, objekt = vyjmenovane, bez pole = nic');
  const areaIds = AREAS.map(a => a.id).concat(...Object.keys(APP_MAP).map(k => (APP_MAP[k].areas || []).map(a => a.id)));
  ok(areaIds.every(id => DOCS_AREAS.indexOf(id) !== -1), 'kazda oblast skriptu (' + areaIds.join(', ') + ') je klic vyjimky v DOCS_AREAS');
  ok(Object.keys(APP_MAP).every(k => APP_MAP[k].note), 'kazda polozka mapy vyjimek ma duvod (note)');

  console.log('J  klasifikace souboru');
  const cases = [
    ['src/webparts/x/components/views/HelpView.tsx', 'help'],
    ['src/webparts/x/components/help/helpDriverEn.tsx', 'help'],
    ['src/webparts/x/components/views/help/SupportCard.tsx', 'help'],
    ['src/webparts/x/components/views/helpContent.tsx', 'help'],
    ['src/webparts/x/components/tour/crmTourAdmin.tsx', 'tour'],
    ['src/webparts/x/components/tour/chapters/basics.tsx', 'tour'],
    ['src/webparts/x/services/SeedService.ts', 'seed'],
    ['src/webparts/x/services/seed/seedIncidents.ts', 'seed'],
    ['src/webparts/x/services/CrmSeedService.ts', 'seed'],
    ['src/webparts/x/services/demoDocxTemplate.ts', 'seed'],
    ['src/webparts/x/services/governance/govDemo.ts', 'seed'],
    ['src/webparts/x/services/SampleDataService.ts', 'seed'],
    ['src/webparts/x/services/spHelpers.ts', ''],
    ['src/webparts/x/services/rules/helpers.ts', ''],
    ['src/webparts/x/components/Ep365Helpdesk.tsx', ''],
    ['src/libraries/helpdeskApp/index.ts', ''],
    ['src/webparts/x/services/TourStateService.ts', ''],
    ['src/webparts/x/hooks/useTourState.ts', ''],
    ['src/webparts/x/components/views/postBladeModel.ts', ''],
    ['src/webparts/x/components/help/helpContent.test.ts', ''],
    ['src/webparts/x/components/views/HelpView.module.scss', ''],
    ['config/help.json', ''],
  ];
  for (const [p, want] of cases) {
    const got = genericAreas(p).join(',');
    ok(got === want, (want || 'zadna oblast') + ' <- ' + p.replace('src/webparts/x/', '') + (got === want ? '' : ' (je: ' + (got || 'nic') + ')'));
  }
  ok(appProfile('ep365-ai-chat').classify('src/webparts/ep365AiChat/data/lessons.ts').join() === 'lessons', 'ai-chat: data/lessons.ts = oblast lekce');
  ok(appProfile('ep365-ai-chat').classify('src/webparts/ep365AiChat/data/lessons.test.ts').length === 0, 'ai-chat: test lekci neni oblast');
  ok(appProfile('ep365-injuries').classify('src/webparts/ep365Injuries/components/views/GuideView.tsx').join() === 'help', 'injuries: GuideView = napoveda');
  ok(appProfile('ep365-quick-actions').areas.every(a => a.na), 'quick-actions: vsechny oblasti n/a');

  console.log('K  promote-release z kopie nastroju v TEMPu');
  const promote = (repoName, extra) => {
    const { root } = repoName;
    const t = path.join(root, 'ep365-cdn', 'tools');
    fs.mkdirSync(t, { recursive: true });
    for (const f of ['promote-release.mjs', 'check-feature-coverage.mjs', 'changelog-rules.mjs']) fs.copyFileSync(path.join(TOOLS, f), path.join(t, f));
    const p = spawnSync(process.execPath, [path.join(t, 'promote-release.mjs'), 'cfctest', '1.1'].concat(extra || []), { encoding: 'utf8' });
    return { code: p.status, out: (p.stdout || '') + (p.stderr || '') };
  };
  const pendingLen = dir => JSON.parse(fs.readFileSync(path.join(dir, 'CHANGELOG.json'), 'utf8')).pending.length;
  const K = buildRepo('k', [{ touch: ['view'], version: '1.0.0.1', pending: [card()] }]);
  r = promote(K);
  ok(r.code !== 0 && /brana pokryti/.test(r.out) && pendingLen(K.dir) === 1, 'mezera -> konec, CHANGELOG beze zmeny (exit ' + r.code + ')');
  r = promote(K, ['--dry-run']);
  ok(r.code !== 0 && pendingLen(K.dir) === 1, 'mezera -> konec i s --dry-run (exit ' + r.code + ')');
  r = promote(K, ['--skip-coverage']);
  ok(r.code !== 0 && /chce duvod/.test(r.out) && pendingLen(K.dir) === 1, '--skip-coverage bez duvodu -> chyba, nic nezapsano (exit ' + r.code + ')');
  r = promote(K, ['--dryrun']);
  ok(r.code !== 0 && /neznamy prepinac/.test(r.out) && pendingLen(K.dir) === 1, 'preklep --dryrun -> chyba, nic nezapsano (exit ' + r.code + ')');
  r = promote(K, ['--skip-coverage', 'test: napoveda v tistene prirucce']);
  const kj = JSON.parse(fs.readFileSync(path.join(K.dir, 'CHANGELOG.json'), 'utf8'));
  const kcard = kj.entries[0].changes[0];
  ok(r.code === 0 && (r.out.match(/test: napoveda v tistene prirucce/g) || []).length >= 2, 'se --skip-coverage "duvod" projde a duvod vypise u brany i v zaveru (exit ' + r.code + ')');
  ok(kj.pending.length === 0 && kj.entries[0].version === '1.1' && kcard.since === undefined && kcard.docs === undefined,
    'zapsana karta 1.1 bez internich poli since/docs, pending prazdny');
  const K2 = buildRepo('k2', [{ touch: ALL, version: '1.0.0.1', pending: [card({ docs: { lessons: 'n/a' } })] }]);
  r = promote(K2);
  const k2 = JSON.parse(fs.readFileSync(path.join(K2.dir, 'CHANGELOG.json'), 'utf8'));
  ok(r.code === 0 && k2.pending.length === 0 && k2.entries[0].changes[0].docs === undefined, 'pokryte repo projde branou a zapise se bez --skip-coverage (exit ' + r.code + ')');
}

try {
  main();
} catch (e) {
  ok(false, 'test spadl vyjimkou: ' + (e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : e));
} finally {
  for (const root of ROOTS) { try { fs.rmSync(root, { recursive: true, force: true }); } catch (e) { /* TEMP */ } }
}

console.log('');
console.log(chyby ? '  TEST SPADL: ' + chyby + ' pripadu nesedi' : '  Vsechny pripady sedi.');
process.exit(chyby ? 1 : 0);
