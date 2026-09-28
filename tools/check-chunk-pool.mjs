#!/usr/bin/env node
/**
 * check-chunk-pool.mjs — dokazuje, ze sdilene uloziste runtime verzi (`<app>/chunks/`)
 * neumi rozbit verzi, na ktere nekdo visi.
 *
 * CO HLIDA
 *   A) PUBLIKACE (`pool-version.mjs`)
 *      - nova verze jde do uloziste: ve verzni slozce jen manifest.json, starsi verze beze zmeny,
 *      - soubor, ktery uz v ulozisti je, se znovu pouzije a NEPREPISE,
 *      - stejne jmeno s JINYM obsahem = konflikt -> verze jde postaru (samostatne), uloziste nedotcene,
 *      - soubor, na ktery z bundlu nevede hash, do uloziste nepusti (prorez by ho nenasel),
 *      - opakovana publikace tehoz buildu nic nezmeni (povyseni tiche verze na ostrou),
 *      - jiny obsah pod vydanym cislem bez povoleni = exit 3 a nic se nezapise,
 *      - cizi rozpracovany stav v repu = stop; --verify-head pozna neuplny / podvrzeny commit.
 *   B) PROREZ (`prune-versions.mjs` + `pool-lib.mjs`)
 *      - soubor sdileny PONECHANOU verzi se nesmaze (i kdyz na nej mirila i mazana verze),
 *      - soubor dosazitelny jen pres jiny chunk (tranzitivne) se nesmaze,
 *      - soubor pinute a ostre verze se nesmaze; osirely se smaze,
 *      - PROTIPRIKLAD 1: bez znackovani (#region POOL-MARK) chyti chybu nezavisla kontrola
 *        a nesmaze se NIC,
 *      - PROTIPRIKLAD 2: bez znackovani i kontroly se sdileny chunk SMAZE -> test neni no-op,
 *      - fail-closed: necitelny manifest, rozbita verze, bezici publikace = z uloziste nic.
 *   AL) LICENCE KNIHOVEN (`<bundle>.js.LICENSE.txt`) PRI PUBLIKACI (`pool-version.mjs`)
 *      - licence jde k bundlu (uloziste i samostatna verze); licence bez bundlu v buildu nikam,
 *      - licence ke znovu pouzitemu chunku, ktera v HEAD chybi, se doplni (chunk se neprepise),
 *      - verze vydana pred licencemi je SHODNA: plan chybejici licence ohlasi, --apply doplni
 *        JEN je; --verify-head ji pusti, s --require-licenses ne,
 *      - jina licence pod stejnym jmenem v ulozisti = konflikt -> samostatne, uloziste nedotcene,
 *      - licence v HEAD se POROVNAVA (shodna = SHODNY, jina = exit 3), nepocita,
 *      - licenci, kterou repo ignoruje (.gitignore), nastroj nezapise,
 *      - --verify-live overi licence, ktere v HEAD jsou, a proces dobehne bez padu
 *        (Windows: process.exit() po fetch = "Assertion failed", proto 10 behu po sobe),
 *      - PROTIPRIKLADY: bez POOL-LICENSE-PUBLISH (= nastroj pred opravou #399) licence v ulozisti
 *        chybi a bundle odkazuje do 404; bez POOL-IGNORED se ignorovana licence zapise, bez
 *        POOL-HEAD-LICENSE projde jina licence jako shodna, bez POOL-REFERENCED se publikuje
 *        i licence, na kterou bundle neodkazuje.
 *   BL) LICENCE V ULOZISTI PRI PROREZU (`prune-versions.mjs` + `pool-lib.mjs`)
 *      - licence jde pryc se svym bundlem, sirotek taky, licence ponechaneho bundlu zustava,
 *      - PROTIPRIKLAD 1: bez pravidla (POOL-LICENSE) chyti chybu nezavisla kontrola, nesmaze se nic,
 *      - PROTIPRIKLAD 2: bez pravidla i kontroly zmizi licence ponechaneho bundlu,
 *      - fail-closed (nevim, co odkazuje / rozbita verze) plati i pro licence.
 *   C) PROREZ PLOCHYCH BUNDLU (`prune-bundles.mjs`) S LICENCEMI
 *      - smazany bundle bere trackovanou licenci s sebou, trackovany sirotek jde taky,
 *      - netrackovana licence zustava (git rm nespadne), licence ponechaneho bundlu i bundlu
 *        smazaneho jen lokalne zustava; tabulku (app/ponechano) dal precte check-stable-roots,
 *      - PROTIPRIKLADY: bez LICENSE-TRACKED spadne git rm, bez LICENSE-KEEP chyti chybu
 *        nezavisla kontrola, resp. zmizi licence lokalne smazaneho bundlu.
 *
 * KDE SE MAZE
 *   Vyhradne v jednorazovych mini-CDN v TEMPu (git repo), ktere si skript postavi a smaze.
 *   Na tohle repo NESAHA a necte soupis pinu naseho tenantu.
 *
 * KDY POUSTET
 *   Pred kazdym `prune-cdn.mjs --apply` (brana 2c) a kdykoli se sahne na pool-lib.mjs,
 *   pool-version.mjs, prune-versions.mjs nebo prune-bundles.mjs.
 *   AL7/AL8 pousti lokalni HTTP server na 127.0.0.1 (misto CDN), ven nechodi.
 *
 * POUZITI:  node tools/check-chunk-pool.mjs        (exit 0 = vse drzi, 1 = cokoli jineho)
 * Vystup je ASCII.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync, spawn } from 'node:child_process';
// Jen exporty, ktere ma i puvodni pool-lib.mjs: sebekontrola pousti tenhle test i proti
// nastrojum PRED licencemi a nesmi spadnout uz na importu.
import { POOL_DIR, poolUrl, versionUrl } from './pool-lib.mjs';

const TOOLS = path.dirname(fileURLToPath(import.meta.url));
const APP = 'demo';
let chyby = 0;
const ok = (t, m) => { console.log((t ? '  OK   ' : '  CHYBA') + ' ' + m); if (!t) chyby++; return t; };
const h20 = (s) => crypto.createHash('md5').update(String(s)).digest('hex').slice(0, 20);
const temps = [];
const tmp = (n) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'ep365-pool-' + n + '-')); temps.push(d); return d; };

// ----------------------------------------------------------------- mini-CDN ---
/** opt.versionText = jina varianta pool-version.mjs (protipriklad), opt.gitignore = .gitignore mini-CDN. */
function postavCdn(nazev, libText, opt) {
  const o = opt || {};
  const root = tmp(nazev);
  fs.mkdirSync(path.join(root, 'tools'), { recursive: true });
  fs.writeFileSync(path.join(root, 'tools', 'pool-lib.mjs'), libText || fs.readFileSync(path.join(TOOLS, 'pool-lib.mjs'), 'utf8'), 'utf8');
  if (o.versionText) fs.writeFileSync(path.join(root, 'tools', 'pool-version.mjs'), o.versionText, 'utf8');
  else fs.copyFileSync(path.join(TOOLS, 'pool-version.mjs'), path.join(root, 'tools', 'pool-version.mjs'));
  fs.copyFileSync(path.join(TOOLS, 'prune-versions.mjs'), path.join(root, 'tools', 'prune-versions.mjs'));
  fs.mkdirSync(path.join(root, APP), { recursive: true });
  fs.writeFileSync(path.join(root, APP, 'releases.json'), '[]', 'utf8');
  if (o.gitignore) fs.writeFileSync(path.join(root, '.gitignore'), o.gitignore, 'utf8');
  git(root, ['init', '-q']);
  commit(root, 'seed');
  return root;
}
function git(root, a) { return execFileSync('git', ['-C', root].concat(a), { encoding: 'utf8' }); }
function commit(root, msg) {
  // core.autocrlf zustava jako v realnem klonu (CRLF v pracovnim stromu je soucast testu);
  // safecrlf=false jen umlci varovani "LF will be replaced by CRLF" pri kazdem add.
  execFileSync('git', ['-C', root, '-c', 'core.safecrlf=false', 'add', '-A'], { stdio: 'ignore' });
  execFileSync('git', ['-C', root, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '--allow-empty', '-m', msg], { stdio: 'ignore' });
}
function spust(root, tool, argy) {
  const r = spawnSync(process.execPath, [path.join(root, 'tools', tool)].concat(argy), { encoding: 'utf8' });
  return { kod: r.status, out: (r.stdout || '') + (r.stderr || '') };
}
/** Jako spust, ale NEBLOKUJE smycku udalosti - lokalni HTTP server v tomhle procesu musi odpovidat. */
function spustAsync(root, tool, argy) {
  return new Promise((resolve) => {
    const ch = spawn(process.execPath, [path.join(root, 'tools', tool)].concat(argy));
    let out = '';
    ch.stdout.on('data', d => { out += d; });
    ch.stderr.on('data', d => { out += d; });
    ch.on('close', (kod) => resolve({ kod, out }));
  });
}
const cisty = (root) => git(root, ['status', '--porcelain']).trim() === '';
const exists = (root, rel) => fs.existsSync(path.join(root, rel));
const read = (root, rel) => fs.readFileSync(path.join(root, rel));
const ls = (root, rel) => { try { return fs.readdirSync(path.join(root, rel)).sort(); } catch (e) { return []; } };
const baseOf = (root, ver) => JSON.parse(read(root, APP + '/' + ver + '/manifest.json').toString('utf8')).loaderConfig.internalModuleBaseUrls[0];

/** Chunk: jmeno nese hash obsahu (jako webpack). `jmeno` jde vnutit kvuli konfliktu. */
const chunk = (nazev, obsah, jmeno) => ({ file: jmeno || ('chunk.' + nazev + '_' + h20(obsah) + '.js'), obsah });
/** Bundle knihovny: odkazy na chunky jen holym hashem v mape (jako webpack `u.u`). */
function bundle(ver, chunks, navic) {
  const mapa = chunks.map((c, i) => i + ':"' + /_([0-9a-f]{20})\.js$/.exec(c.file)[1] + '"').join(',');
  const obsah = '/* demo app ' + ver + (navic || '') + ' */ var u={' + mapa + '};';
  return { file: 'demo-app_' + h20(obsah) + '.js', obsah };
}
function manifest(base, bundleFile) {
  return JSON.stringify({ id: '00000000-0000-4000-8000-000000000001', alias: 'DemoApp', componentType: 'Library', version: '1.0.0', manifestVersion: 2,
    loaderConfig: { internalModuleBaseUrls: [base], entryModuleId: 'demo-app',
      scriptResources: { 'demo-app': { type: 'path', path: bundleFile }, react: { type: 'component', id: '0d910c1c-13b9-4e1c-9aa4-b008c5e42d7d', version: '17.0.1' } } } }, null, 2);
}
const licOf = (f) => f + '.LICENSE.txt';
/** Bundle/chunk s licenci jako z webpacku: hlavicka odkazuje na <jmeno>.LICENSE.txt, jmeno (hash) zustava. */
const sLicenci = (c, text) => ({ file: c.file, obsah: '/*! For license information please see ' + licOf(c.file) + ' */\n' + c.obsah, lic: text });
/** Vystup buildu (release/cdn-version) - manifest miri do verzni slozky jako u stabilize-loader.js.
 *  opt.licBundle = licence bundlu, opt.bezLicenci = build jako pred licencemi (.js s hlavickou,
 *  ale bez LICENSE souboru), opt.bezBundlu = jmena licenci, k nimz v buildu bundle neni. */
function build(ver, chunks, opt) {
  const o = opt || {};
  const dir = tmp('build-' + ver);
  let b = o.bundle || bundle(ver, o.odkazy || chunks, o.navic);
  if (o.licBundle) b = sLicenci(b, o.licBundle);
  [b].concat(chunks).forEach(c => {
    fs.writeFileSync(path.join(dir, c.file), c.obsah, 'utf8');
    if (c.lic && !o.bezLicenci) fs.writeFileSync(path.join(dir, licOf(c.file)), c.lic, 'utf8');
  });
  (o.bezBundlu || []).forEach(n => fs.writeFileSync(path.join(dir, n), '/*! licence bez bundlu */\n', 'utf8'));
  fs.writeFileSync(path.join(dir, 'manifest.json'), manifest(o.base || versionUrl(APP, ver), b.file), 'utf8');
  return { dir, b };
}
const publikuj = (root, ver, src, navic) => spust(root, 'pool-version.mjs', ['--app', APP, '--version', ver, '--src', src].concat(navic || []));

// ========================================================== A. PUBLIKACE ===
console.log('A) Publikace do sdileneho uloziste (pool-version.mjs)');
{
  const root = postavCdn('publikace');
  // Stara SAMOSTATNA verze (tvar pred ulozistem) - nesmi se zmenit ani o bajt.
  const cx = chunk('xlsx', 'XLSX-obsah-1');
  const v1 = build('1.0.0.1', [cx]);
  fs.mkdirSync(path.join(root, APP, '1.0.0.1'), { recursive: true });
  fs.readdirSync(v1.dir).forEach(f => fs.copyFileSync(path.join(v1.dir, f), path.join(root, APP, '1.0.0.1', f)));
  commit(root, 'v1 samostatne');
  const snap1 = ls(root, APP + '/1.0.0.1').map(f => f + ':' + read(root, APP + '/1.0.0.1/' + f).toString('base64')).join('|');

  // A1 nova verze -> uloziste
  const cm = chunk('mammoth', 'MAMMOTH-obsah-1');
  const b2 = build('1.0.0.2', [cx, cm]);
  let r = publikuj(root, '1.0.0.2', b2.dir, ['--apply']);
  ok(r.kod === 0, 'A1 publikace 1.0.0.2 dobehla (exit ' + r.kod + ')');
  ok(JSON.stringify(ls(root, APP + '/1.0.0.2')) === '["manifest.json"]', 'A1 verzni slozka obsahuje JEN manifest.json');
  ok(exists(root, APP + '/1.0.0.2/manifest.json') && baseOf(root, '1.0.0.2') === poolUrl(APP), 'A1 manifest miri do uloziste ' + poolUrl(APP));
  ok([b2.b.file, cx.file, cm.file].every(f => exists(root, APP + '/' + POOL_DIR + '/' + f)), 'A1 bundle i oba chunky jsou v ulozisti');
  const snap1po = ls(root, APP + '/1.0.0.1').map(f => f + ':' + read(root, APP + '/1.0.0.1/' + f).toString('base64')).join('|');
  ok(snap1 === snap1po, 'A1 starsi samostatna verze 1.0.0.1 beze zmeny (bajtove)');
  commit(root, 'v2');
  r = spust(root, 'pool-version.mjs', ['--app', APP, '--version', '1.0.0.2', '--src', b2.dir, '--verify-head']);
  ok(r.kod === 0 && r.out.indexOf('ULOZISTE') !== -1, 'A1 --verify-head potvrdi commit v tvaru uloziste');

  // A2 znovupouziti: xlsx beze zmeny, mammoth novy
  const xlsxPath = path.join(root, APP, POOL_DIR, cx.file);
  const mtime = fs.statSync(xlsxPath).mtimeMs;
  const cm2 = chunk('mammoth', 'MAMMOTH-obsah-2');
  const b3 = build('1.0.0.3', [cx, cm2]);
  r = publikuj(root, '1.0.0.3', b3.dir, ['--apply']);
  ok(r.kod === 0 && r.out.indexOf('2 novych, 1 znovu pouzitych') !== -1, 'A2 1.0.0.3: 2 nove soubory, 1 znovu pouzity (vypis: ' + (r.out.split('\n')[0] || '').slice(0, 90) + ')');
  ok(fs.statSync(xlsxPath).mtimeMs === mtime, 'A2 sdileny chunk v ulozisti se NEPREPSAL (mtime beze zmeny)');
  commit(root, 'v3');

  // A3 konflikt: stejne jmeno, jiny obsah -> samostatna verze, uloziste nedotcene
  const podvrh = chunk('xlsx', 'XLSX-JINY-obsah', cx.file);
  const b4 = build('1.0.0.4', [podvrh]);
  const xlsxPred = read(root, APP + '/' + POOL_DIR + '/' + cx.file).toString('base64');
  r = publikuj(root, '1.0.0.4', b4.dir, ['--apply']);
  ok(r.kod === 0 && r.out.indexOf('SAMOSTATNA') !== -1 && r.out.indexOf('konflikt') !== -1, 'A3 konflikt jmena -> SAMOSTATNA verze (exit ' + r.kod + ')');
  ok(baseOf(root, '1.0.0.4') === versionUrl(APP, '1.0.0.4') && exists(root, APP + '/1.0.0.4/' + cx.file), 'A3 1.0.0.4 ma vlastni kopie a manifest miri do sve slozky');
  ok(read(root, APP + '/' + POOL_DIR + '/' + cx.file).toString('base64') === xlsxPred, 'A3 soubor v ulozisti zustal puvodni (starsi verze na nem visi)');
  commit(root, 'v4');

  // A4/A5 opakovana publikace tehoz buildu (povyseni na ostrou) = nic se nezapise
  r = publikuj(root, '1.0.0.3', b3.dir, ['--apply']);
  ok(r.kod === 0 && r.out.indexOf('SHODNY') !== -1 && cisty(root), 'A4 znovu 1.0.0.3 (uloziste): SHODNY, repo ciste');
  r = publikuj(root, '1.0.0.4', b4.dir, ['--apply']);
  ok(r.kod === 0 && r.out.indexOf('SHODNY') !== -1 && cisty(root), 'A5 znovu 1.0.0.4 (samostatna): SHODNY, repo ciste');

  // A6 jiny build pod vydanym cislem bez povoleni -> exit 3, nic se nezmeni
  const b3x = build('1.0.0.3', [cx, cm2], { navic: ' JINY BUILD' });
  r = publikuj(root, '1.0.0.3', b3x.dir, ['--apply']);
  ok(r.kod === 3 && cisty(root), 'A6 jiny obsah pod existujici verzi bez --replace-allowed -> exit 3 (dostal ' + r.kod + '), repo ciste');

  // A7 --no-pool
  const b5 = build('1.0.0.5', [cx]);
  r = publikuj(root, '1.0.0.5', b5.dir, ['--apply', '--no-pool']);
  ok(r.kod === 0 && baseOf(root, '1.0.0.5') === versionUrl(APP, '1.0.0.5') && exists(root, APP + '/1.0.0.5/' + cx.file), 'A7 --no-pool -> samostatna verze');

  // A8 chunk, na ktery z bundlu nevede hash -> do uloziste nesmi
  const cz = chunk('ztraceny', 'ZTRACENY-obsah');
  const b6 = build('1.0.0.6', [cx, cz], { odkazy: [cx] });
  r = publikuj(root, '1.0.0.6', b6.dir, ['--apply']);
  ok(r.kod === 0 && r.out.indexOf('nevede hash') !== -1 && baseOf(root, '1.0.0.6') === versionUrl(APP, '1.0.0.6'), 'A8 neodkazovany chunk -> samostatna verze (prorez by ho nenasel)');

  // A9 build pro jinou verzi -> odmitnuto
  const b7 = build('1.0.0.7', [cx]);
  r = publikuj(root, '1.0.0.8', b7.dir, ['--apply']);
  ok(r.kod === 1 && !exists(root, APP + '/1.0.0.8'), 'A9 manifest buildu miri na jinou verzi -> exit 1, nic nezapsano');
  commit(root, 'v5 v6');

  // A10 cizi rozpracovany stav -> stop
  fs.appendFileSync(path.join(root, APP, POOL_DIR, cm2.file), '\n// cizi zmena');
  git(root, ['add', '--', APP + '/' + POOL_DIR + '/' + cm2.file]);
  const b9 = build('1.0.0.9', [cx]);
  r = publikuj(root, '1.0.0.9', b9.dir, ['--apply']);
  ok(r.kod === 1 && r.out.indexOf('rozpracovana zmena') !== -1 && !exists(root, APP + '/1.0.0.9'), 'A10 cizi staged zmena v ulozisti -> exit 1, nic nezapsano');
  git(root, ['reset', '-q', '--hard']);

  // A11 --verify-head pozna podvrzeny obsah v ulozisti
  fs.writeFileSync(path.join(root, APP, POOL_DIR, cm2.file), 'podvrh', 'utf8');
  commit(root, 'podvrh');
  r = spust(root, 'pool-version.mjs', ['--app', APP, '--version', '1.0.0.3', '--src', b3.dir, '--verify-head']);
  ok(r.kod === 1, 'A11 --verify-head odhali soubor v ulozisti s jinym obsahem (exit ' + r.kod + ')');
}

console.log('A12) Soubor obnoveny z gitu lezi na disku s CRLF (core.autocrlf) - porad je to TENTYZ soubor');
{
  const root = postavCdn('crlf');
  const cl = chunk('radky', 'radek1\nradek2\nradek3\n');
  const b2 = build('1.0.0.2', [cl]);
  let r = publikuj(root, '1.0.0.2', b2.dir, ['--apply']);
  commit(root, 'v2');
  const rel = APP + '/' + POOL_DIR + '/' + cl.file;
  fs.rmSync(path.join(root, rel));
  git(root, ['checkout', '--', rel]);           // jako obnova po prorezu / incidentu (lekce 23.10)
  const maCr = read(root, rel).indexOf(13) !== -1;
  console.log('       (soubor po checkoutu ' + (maCr ? 'MA CRLF - scenar se opravdu meri' : 'nema CRLF - autocrlf tu neni zapnute, scenar meri jen shodu') + ')');
  const b3 = build('1.0.0.3', [cl]);
  r = publikuj(root, '1.0.0.3', b3.dir, ['--apply']);
  ok(r.kod === 0 && r.out.indexOf('ULOZISTE') !== -1 && r.out.indexOf('1 znovu pouzitych') !== -1, 'A12 soubor s CRLF na disku a LF v HEAD se znovu pouzije, ne konflikt (exit ' + r.kod + ')');
}

// ============================================================== B. PROREZ ===
// v1 samostatna (ostra) | v2 [B2: S,O2] | v3 [B3: P] (pin) | v4 [B4] | v5 [B5: S] | v6 [B6] | v7 [B7: N7 -> T]
// --keep 3 -> zustanou v5,v6,v7 + v1 (ostra) + v3 (pin); pryc v2,v4.
// Uloziste: pryc B2, O2, B4, E (sirotek); zustava B3, P, B5, S, B6, B7, N7, T.
const PIN = '1.0.0.3';
function postavProrez(nazev, libText, uprava) {
  const root = postavCdn(nazev, libText);
  const pool = path.join(root, APP, POOL_DIR);
  fs.mkdirSync(pool, { recursive: true });
  const w = (c) => fs.writeFileSync(path.join(pool, c.file), c.obsah, 'utf8');
  const S = chunk('sdileny', 'S-obsah'), O2 = chunk('jen2', 'O2-obsah'), P = chunk('pin', 'P-obsah'), T = chunk('hloubka', 'T-obsah'), E = chunk('sirotek', 'E-obsah');
  const N7 = { file: 'chunk.n7_' + h20('N7') + '.js', obsah: '/* n7 */ var x="' + /_([0-9a-f]{20})\.js$/.exec(T.file)[1] + '";' };
  const verze = { '1.0.0.2': [S, O2], '1.0.0.3': [P], '1.0.0.4': [], '1.0.0.5': [S], '1.0.0.6': [], '1.0.0.7': [N7] };
  const B = {};
  Object.keys(verze).forEach(v => {
    const b = bundle(v, verze[v]);
    B[v] = b.file; w(b);
    fs.mkdirSync(path.join(root, APP, v), { recursive: true });
    fs.writeFileSync(path.join(root, APP, v, 'manifest.json'), manifest(poolUrl(APP), b.file), 'utf8');
  });
  [S, O2, P, T, E, N7].forEach(w);
  // v1: samostatna ostra verze (tvar pred ulozistem)
  const v1 = bundle('1.0.0.1', []);
  fs.mkdirSync(path.join(root, APP, '1.0.0.1'), { recursive: true });
  fs.writeFileSync(path.join(root, APP, '1.0.0.1', v1.file), v1.obsah, 'utf8');
  fs.writeFileSync(path.join(root, APP, '1.0.0.1', 'manifest.json'), manifest(versionUrl(APP, '1.0.0.1'), v1.file), 'utf8');
  fs.writeFileSync(path.join(root, APP, 'releases.json'), JSON.stringify([{ version: '1.0.0.1' }]), 'utf8');
  if (uprava) uprava(root, B, { S, O2, P, T, E, N7 });
  commit(root, 'mini-CDN s ulozistem');
  const ps = path.join(root, 'pin-state.json');
  fs.writeFileSync(ps, JSON.stringify({ sweptAt: new Date().toISOString(), complete: true, websSeen: 30,
    cdnSnapshot: { [APP]: '1.0.0.7' }, pins: [{ web: '/sites/demo', app: APP, version: PIN }] }), 'utf8');
  return { root, ps, B, S, O2, P, T, E, N7 };
}
const vPoolu = (root, c) => exists(root, APP + '/' + POOL_DIR + '/' + (c.file || c));
const prorez = (x, extra) => spust(x.root, 'prune-versions.mjs', ['--keep', '3', '--pin-state', x.ps].concat(extra || ['--apply']));

console.log('B) Prorez s pocitanim odkazu (prune-versions.mjs + pool-lib.mjs)');
{
  const x = postavProrez('prorez');
  const r = prorez(x);
  ok(r.kod === 0, 'B1 prorez dobehl (exit ' + r.kod + ')');
  ok(!exists(x.root, APP + '/1.0.0.2') && !exists(x.root, APP + '/1.0.0.4'), 'B1 verze mimo okno bez ochrany (1.0.0.2, 1.0.0.4) smazany');
  ok(exists(x.root, APP + '/1.0.0.1') && exists(x.root, APP + '/' + PIN), 'B1 ostra 1.0.0.1 i pinuta ' + PIN + ' zustaly');
  ok(vPoolu(x.root, x.S), 'B1 chunk SDILENY ponechanou verzi (i mazanou 1.0.0.2) ZUSTAL');
  ok(vPoolu(x.root, x.T), 'B1 chunk dosazitelny jen pres jiny chunk (tranzitivne) ZUSTAL');
  ok(vPoolu(x.root, x.P) && vPoolu(x.root, x.B[PIN]), 'B1 bundle a chunk PINUTE verze zustaly');
  ok(vPoolu(x.root, x.B['1.0.0.5']) && vPoolu(x.root, x.B['1.0.0.6']) && vPoolu(x.root, x.B['1.0.0.7']) && vPoolu(x.root, x.N7), 'B1 soubory verzi v okne zustaly');
  ok(!vPoolu(x.root, x.E), 'B1 OSIRELY chunk smazan');
  ok(!vPoolu(x.root, x.O2) && !vPoolu(x.root, x.B['1.0.0.2']) && !vPoolu(x.root, x.B['1.0.0.4']), 'B1 soubory jen smazanych verzi smazany (O2, B2, B4)');
}

function vystrihni(zdroj, region, musiObsahovat, soubor) {
  const od = zdroj.indexOf('// #region ' + region);
  const doo = zdroj.indexOf('// #endregion ' + region);
  if (od === -1 || doo === -1 || doo < od) { ok(false, 'markery ' + region + ' nenalezeny v ' + (soubor || 'pool-lib.mjs')); return null; }
  const vyriznuto = zdroj.slice(od, doo);
  if (vyriznuto.indexOf(musiObsahovat) === -1) { ok(false, 'region ' + region + ' neobsahuje ' + musiObsahovat + ' - markery sedi jinde'); return null; }
  return zdroj.slice(0, od) + zdroj.slice(doo + ('// #endregion ' + region).length);
}
const LIB = fs.readFileSync(path.join(TOOLS, 'pool-lib.mjs'), 'utf8');

console.log('B2) Protipriklad 1: bez znackovani (POOL-MARK) chyti chybu nezavisla kontrola - nesmaze se NIC');
{
  const bezMark = vystrihni(LIB, 'POOL-MARK', 'reachable(');
  if (bezMark) {
    const x = postavProrez('bezmark', bezMark);
    const r = prorez(x);
    ok(r.kod === 1 && r.out.indexOf('OVERENI ULOZISTE SELHALO') !== -1, 'B2 exit 1 + OVERENI ULOZISTE SELHALO (dostal ' + r.kod + ')');
    ok(exists(x.root, APP + '/1.0.0.2') && exists(x.root, APP + '/1.0.0.4'), 'B2 ani verzni slozky se nesmazaly (radsi nic nez cast)');
    ok([x.S, x.T, x.P, x.E, x.O2].every(c => vPoolu(x.root, c)), 'B2 uloziste nedotcene');
  }
}

console.log('B3) Protipriklad 2: bez znackovani I kontroly se sdileny chunk SMAZE (test neni no-op)');
{
  const bezMark = vystrihni(LIB, 'POOL-MARK', 'reachable(');
  const bezObou = bezMark ? vystrihni(bezMark, 'POOL-VERIFY', 'indexOf') : null;
  if (bezObou) {
    const x = postavProrez('bezobou', bezObou);
    const r = prorez(x);
    ok(r.kod === 0, 'B3 varianta bez ochran dobehla (exit ' + r.kod + ')');
    ok(!vPoolu(x.root, x.S), 'B3 sdileny chunk je PRYC - scenar B1 tedy opravdu meri pocitani odkazu');
    ok(!vPoolu(x.root, x.T), 'B3 tranzitivni chunk je PRYC - B1 meri i tranzitivitu');
  }
}

console.log('B4) Fail-closed: z uloziste se nemaze nic, kdyz nevime, co odkazuje');
{
  const x = postavProrez('necitelny', null, (root) => fs.writeFileSync(path.join(root, APP, '1.0.0.6', 'manifest.json'), '{ rozbity', 'utf8'));
  const r = prorez(x);
  ok(r.kod === 0 && r.out.indexOf('nevim, co odkazuje') !== -1, 'B4a necitelny manifest ponechane verze -> hlaseno, exit 0');
  ok([x.E, x.O2].every(c => vPoolu(x.root, c)), 'B4a uloziste nedotcene (ani sirotek se nesmazal)');
  ok(!exists(x.root, APP + '/1.0.0.2'), 'B4a prorez verznich slozek probehl normalne');

  const y = postavProrez('rozbita', null, (root, B) => fs.rmSync(path.join(root, APP, POOL_DIR, B['1.0.0.6'])));
  const r2 = prorez(y);
  ok(r2.kod === 0 && r2.out.indexOf('ROZBITA VERZE') !== -1, 'B4b verze miri na chybejici soubor -> ROZBITA VERZE nahlas');
  ok([y.E, y.O2].every(c => vPoolu(y.root, c)), 'B4b uloziste nedotcene');

  const z = postavProrez('zamek', null, (root) => fs.writeFileSync(path.join(root, '.publish.lock'), '', 'utf8'));
  const r3 = prorez(z);
  ok(r3.kod === 0 && r3.out.indexOf('bezi publikace') !== -1 && [z.E, z.O2].every(c => vPoolu(z.root, c)), 'B4c bezici publikace (.publish.lock) -> uloziste nedotcene');

  const p = postavProrez('plan');
  const r4 = prorez(p, []);
  ok(r4.kod === 0 && vPoolu(p.root, p.E) && exists(p.root, APP + '/1.0.0.2') && r4.out.indexOf('souborech sdileneho uloziste') !== -1, 'B4d bez --apply jen plan (nic nesmazano, uloziste v souctu)');
}

console.log('B5) Zbytky a lokalni zmeny: prazdna slozka nic neodkazuje, manifest z HEAD odkazuje porad');
{
  // Po drivejsim prorezu zustavaji na disku slozky jen s netrackovanymi .LICENSE.txt (na
  // skutecnem CDN 45 z 58 slozek marketingu). Kdyby "slozka bez manifestu" znamenala
  // "nevim", uloziste by se neprorezalo nikdy. Tady je takova slozka navic PINUTA,
  // takze je v mnozine ponechanych - a prorez uloziste presto musi probehnout.
  const x = postavProrez('zbytek');
  fs.mkdirSync(path.join(x.root, APP, '1.0.0.0'), { recursive: true });
  fs.writeFileSync(path.join(x.root, APP, '1.0.0.0', 'x.js.LICENSE.txt'), 'licence', 'utf8');   // netrackovane
  const st = JSON.parse(fs.readFileSync(x.ps, 'utf8'));
  st.pins.push({ web: '/sites/demo2', app: APP, version: '1.0.0.0' });
  fs.writeFileSync(x.ps, JSON.stringify(st), 'utf8');
  // Manifest ponechane 1.0.0.6 smazany JEN lokalne (bez git rm): HEAD ho porad servíruje.
  fs.rmSync(path.join(x.root, APP, '1.0.0.6', 'manifest.json'));
  const r = prorez(x);
  ok(r.kod === 0 && r.out.indexOf('nevim, co odkazuje') === -1, 'B5 prazdna pinuta slozka bez manifestu uloziste NEZABLOKOVALA (exit ' + r.kod + ')');
  ok(!vPoolu(x.root, x.E) && !vPoolu(x.root, x.O2), 'B5 prorez uloziste probehl (sirotek i O2 pryc)');
  ok(vPoolu(x.root, x.B['1.0.0.6']), 'B5 bundle verze, jejiz manifest chybi jen lokalne (v HEAD je), ZUSTAL');
}

// ============================================== AL. LICENCE PRI PUBLIKACI ===
const P = APP + '/' + POOL_DIR + '/';
const overHead = (root, ver, src, navic) => spust(root, 'pool-version.mjs', ['--app', APP, '--version', ver, '--src', src, '--verify-head'].concat(navic || []));
const stejne = (root, rel, abs) => { try { return read(root, rel).equals(fs.readFileSync(abs)); } catch (e) { return false; } };
/** Obsah souboru v mini-CDN (base64), nebo null - chybejici soubor je nalez, ne pad testu. */
const cti = (root, rel) => { try { return read(root, rel).toString('base64'); } catch (e) { return null; } };
const stav = (root) => git(root, ['status', '--porcelain', '-uall']).split('\n').filter(Boolean);
const VER_SRC = fs.readFileSync(path.join(TOOLS, 'pool-version.mjs'), 'utf8');

console.log('AL) Licence knihoven (<bundle>.js.LICENSE.txt) pri publikaci (pool-version.mjs)');
{
  const root = postavCdn('lic-pub');
  // AL1 nova verze -> uloziste: licence bundlu i chunku, chunk bez licence, licence bez bundlu
  const lx = sLicenci(chunk('xlsx', 'XLSX-L'), '/*! xlsx licence A */\n');
  const lm = chunk('mammoth', 'MAMMOTH-L');
  const duch = 'chunk.duch_' + h20('duch') + '.js.LICENSE.txt';
  const b2 = build('1.0.0.2', [lx, lm], { licBundle: '/*! react licence */\n', bezBundlu: [duch] });
  let r = publikuj(root, '1.0.0.2', b2.dir, ['--apply']);
  ok(r.kod === 0 && r.out.indexOf('ULOZISTE') !== -1, 'AL1 publikace s licencemi -> ULOZISTE (exit ' + r.kod + ')');
  ok(stejne(root, P + licOf(b2.b.file), path.join(b2.dir, licOf(b2.b.file))) && stejne(root, P + licOf(lx.file), path.join(b2.dir, licOf(lx.file))),
    'AL1 licence bundlu i chunku lezi v ulozisti vedle svych bundlu, obsah = build');
  ok(JSON.stringify(ls(root, APP + '/1.0.0.2')) === '["manifest.json"]', 'AL1 verzni slozka uloziste dal JEN manifest.json');
  ok(!exists(root, P + duch) && !exists(root, APP + '/1.0.0.2/' + duch) && r.out.indexOf('licence bez odkazu v bundlu - nepublikuji: ' + duch) !== -1,
    'AL1 licence bez bundlu v buildu se nezapsala nikam a vypis ji jmenuje');
  commit(root, 'v2');
  r = overHead(root, '1.0.0.2', b2.dir, ['--require-licenses']);
  ok(r.kod === 0 && r.out.indexOf('licence knihoven 2/2 v HEAD') !== -1, 'AL1 --verify-head --require-licenses: obe licence v HEAD (exit ' + r.kod + ')');

  // AL2 chunk publikovany jeste BEZ licence (build bez LICENSE souboru = publikace pred
  // licencemi); dalsi verze ho znovu pouzije -> licence se doplni, chunk se neprepise
  const lj = sLicenci(chunk('jszip', 'JSZIP-L'), '/*! jszip licence */\n');
  const b3 = build('1.0.0.3', [lj], { bezLicenci: true });
  r = publikuj(root, '1.0.0.3', b3.dir, ['--apply']);
  commit(root, 'v3 pred licencemi');
  ok(r.kod === 0 && exists(root, P + lj.file) && !exists(root, P + licOf(lj.file)), 'AL2 priprava: chunk v ulozisti bez licence');
  const ljPath = path.join(root, APP, POOL_DIR, lj.file);
  const ljMtime = fs.statSync(ljPath).mtimeMs;
  const b4 = build('1.0.0.4', [lj, lx]);
  r = publikuj(root, '1.0.0.4', b4.dir, ['--apply']);
  ok(r.kod === 0 && r.out.indexOf('1 novych, 2 znovu pouzitych') !== -1, 'AL2 1.0.0.4 do uloziste: jszip i xlsx znovu pouzity (exit ' + r.kod + ')');
  ok(exists(root, P + licOf(lj.file)) && fs.statSync(ljPath).mtimeMs === ljMtime, 'AL2 licence ke znovu pouzitemu chunku DOPLNENA, chunk se neprepsal');
  commit(root, 'v4');

  // AL3 verze vydana PRED licencemi (uloziste): shodna; plan jen ohlasi, --apply doplni JEN licence
  const ld = sLicenci(chunk('docx', 'DOCX-L'), '/*! docx licence */\n');
  const b5 = build('1.0.0.5', [ld], { licBundle: '/*! b5 licence */\n' });
  const b5bez = build('1.0.0.5', [ld], { licBundle: '/*! b5 licence */\n', bezLicenci: true });
  publikuj(root, '1.0.0.5', b5bez.dir, ['--apply']);
  commit(root, 'v5 pred licencemi');
  r = overHead(root, '1.0.0.5', b5.dir);
  ok(r.kod === 0 && r.out.indexOf('chybi 2 licenci') !== -1, 'AL3 --verify-head bez --require-licenses: legacy verze projde a 2 chybejici licence ohlasi (exit ' + r.kod + ')');
  r = overHead(root, '1.0.0.5', b5.dir, ['--require-licenses']);
  ok(r.kod === 1, 'AL3 --verify-head --require-licenses: legacy verze bez licenci NEPROJDE (exit ' + r.kod + ')');
  r = publikuj(root, '1.0.0.5', b5.dir);
  ok(r.kod === 0 && r.out.indexOf('SHODNY') !== -1 && r.out.indexOf('chybi 2 licenci') !== -1 && cisty(root), 'AL3 plan: verze SHODNA, 2 chybejici licence jen ohlaseny, repo ciste');
  r = publikuj(root, '1.0.0.5', b5.dir, ['--apply']);
  const st5 = stav(root);
  ok(r.kod === 0 && r.out.indexOf('doplnuji 2 licenci') !== -1, 'AL3 --apply hlasi "doplnuji 2 licenci" (exit ' + r.kod + ')');
  ok(st5.length === 2 && st5.every(l => l.indexOf('?? ' + P) === 0 && /\.js\.LICENSE\.txt$/.test(l)), 'AL3 --apply pridalo JEN 2 licence do uloziste, .js ani manifest beze zmeny (git status: ' + st5.length + ' radku)');
  commit(root, 'v5 licence');
  r = overHead(root, '1.0.0.5', b5.dir, ['--require-licenses']);
  ok(r.kod === 0, 'AL3 po doplneni projde i --verify-head --require-licenses (exit ' + r.kod + ')');

  // AL3b totez u SAMOSTATNE verze: licence patri do verzni slozky
  const b6 = build('1.0.0.6', [ld], { licBundle: '/*! b6 licence */\n' });
  const b6bez = build('1.0.0.6', [ld], { licBundle: '/*! b6 licence */\n', bezLicenci: true });
  publikuj(root, '1.0.0.6', b6bez.dir, ['--apply', '--no-pool']);
  commit(root, 'v6 samostatna pred licencemi');
  r = publikuj(root, '1.0.0.6', b6.dir, ['--apply']);
  ok(r.kod === 0 && r.out.indexOf('SAMOSTATNA') !== -1 && r.out.indexOf('doplnuji 2 licenci') !== -1
    && exists(root, APP + '/1.0.0.6/' + licOf(b6.b.file)) && exists(root, APP + '/1.0.0.6/' + licOf(ld.file)),
    'AL3b samostatna verze pred licencemi: SHODNA, --apply doplni 2 licence do verzni slozky (exit ' + r.kod + ')');
  commit(root, 'v6 licence');

  // AL4 v ulozisti je licence xlsx (A); novy build ma TENTYZ chunk, ale JINOU licenci -> samostatne
  const b7 = build('1.0.0.7', [{ file: lx.file, obsah: lx.obsah, lic: '/*! xlsx licence B */\n' }]);
  const licA = cti(root, P + licOf(lx.file));
  r = publikuj(root, '1.0.0.7', b7.dir, ['--apply']);
  ok(r.kod === 0 && r.out.indexOf('SAMOSTATNA') !== -1 && r.out.indexOf('JINA licence (konflikt)') !== -1, 'AL4 jina licence pod stejnym jmenem v ulozisti -> SAMOSTATNA verze (exit ' + r.kod + ')');
  ok(licA !== null && cti(root, P + licOf(lx.file)) === licA, 'AL4 licence v ulozisti zustala puvodni (starsi verze na ni visi)');
  ok(exists(root, APP + '/1.0.0.7/' + lx.file) && stejne(root, APP + '/1.0.0.7/' + licOf(lx.file), path.join(b7.dir, licOf(lx.file))), 'AL4 verze ma vlastni kopii chunku i SVOU licenci');
  commit(root, 'v7');

  // AL5 licence v HEAD se POROVNAVA, nepocita: shodna = SHODNY, jina = jiny obsah verze
  r = publikuj(root, '1.0.0.7', b7.dir, ['--apply']);
  ok(r.kod === 0 && r.out.indexOf('nic nezapisuji') !== -1 && cisty(root), 'AL5a znovu 1.0.0.7 (samostatna s licenci v HEAD): SHODNY, repo ciste (exit ' + r.kod + ')');
  const b7c = build('1.0.0.7', [{ file: lx.file, obsah: lx.obsah, lic: '/*! xlsx licence C */\n' }]);
  r = publikuj(root, '1.0.0.7', b7c.dir, ['--apply']);
  ok(r.kod === 3 && cisty(root), 'AL5b tataz .js, ale JINA licence pod vydanym cislem -> exit 3 (dostal ' + r.kod + '), repo ciste');
}

// AL0p = stav pred opravou #399 (pool-version kopiroval jen *.js a manifest): bundle v ulozisti
// odkazuje na licenci, ktera tam neni (404). Region POOL-LICENSE-PUBLISH je cela oprava na
// strane publikace - bez nej se nastroj chova jako puvodni.
console.log('AL0p) Protipriklad: bez POOL-LICENSE-PUBLISH (= nastroj pred opravou) licence v ulozisti CHYBI (AL1 tedy meri)');
{
  const bez = vystrihni(VER_SRC, 'POOL-LICENSE-PUBLISH', 'licReferenced(', 'pool-version.mjs');
  if (bez) {
    const root = postavCdn('lic-bezopravy', null, { versionText: bez });
    const lx = sLicenci(chunk('xlsx', 'XLSX-0P'), '/*! xlsx licence 0p */\n');
    const b2 = build('1.0.0.2', [lx], { licBundle: '/*! bundle licence 0p */\n' });
    const r = publikuj(root, '1.0.0.2', b2.dir, ['--apply']);
    ok(r.kod === 0 && exists(root, P + b2.b.file) && exists(root, P + lx.file), 'AL0p varianta bez opravy publikuje bundle i chunk do uloziste (exit ' + r.kod + ')');
    ok(!exists(root, P + licOf(b2.b.file)) && !exists(root, P + licOf(lx.file)),
      'AL0p varianta bez opravy licence do uloziste NEZAPSALA - bundle odkazuje do 404 (stav pred #399), AL1 by tedy spadlo');
    commit(root, 'v2 bez licenci');
    // Tataz mini-CDN po instalaci opravy: verze je SHODNA, jen bez licenci -> verify-head
    // s --require-licenses ji nepusti a publikace s --apply doplni JEN licence.
    fs.writeFileSync(path.join(root, 'tools', 'pool-version.mjs'), VER_SRC, 'utf8');
    commit(root, 'instalace opravy');
    const h = overHead(root, '1.0.0.2', b2.dir, ['--require-licenses']);
    ok(h.kod === 1, 'AL0p opraveny --verify-head --require-licenses verzi bez licenci NEPUSTI (exit ' + h.kod + ')');
    const r2 = publikuj(root, '1.0.0.2', b2.dir, ['--apply']);
    const st = stav(root);
    ok(r2.kod === 0 && r2.out.indexOf('doplnuji 2 licenci') !== -1 && exists(root, P + licOf(b2.b.file)) && exists(root, P + licOf(lx.file))
      && st.length === 2 && st.every(l => /^\?\? .*\.js\.LICENSE\.txt$/.test(l)),
      'AL0p opraveny nastroj k uz vydane verzi doplni obe licence a nic jineho (exit ' + r2.kod + ', git status ' + st.length + ' radku)');
  }
}

console.log('AL5p) Protipriklad: bez POOL-HEAD-LICENSE projde jina licence jako SHODNA (AL5b tedy meri)');
{
  const bez = vystrihni(VER_SRC, 'POOL-HEAD-LICENSE', 'exp.get(name)', 'pool-version.mjs');
  if (bez) {
    const root = postavCdn('lic-headlic', null, { versionText: bez });
    const cA = sLicenci(chunk('xlsx', 'XLSX-P'), 'licence A');
    const bA = build('1.0.0.2', [cA]);
    publikuj(root, '1.0.0.2', bA.dir, ['--apply', '--no-pool']);
    commit(root, 'v2');
    const bC = build('1.0.0.2', [Object.assign({}, cA, { lic: 'licence C' })]);
    const r = publikuj(root, '1.0.0.2', bC.dir, ['--apply']);
    ok(r.kod === 0 && r.out.indexOf('SHODNY') !== -1, 'AL5p varianta bez POOL-HEAD-LICENSE vzala verzi s JINOU licenci za SHODNOU (exit ' + r.kod + ')');
  }
}

// Mini-CDN, jehoz .gitignore ignoruje licence chunku "ign" (jako drive ai-chat/**/*.js.LICENSE.txt, pojistka pro budouci vyjimky).
function scenarIgnor(versionText) {
  const root = postavCdn('lic-ignor', null, { gitignore: APP + '/**/chunk.ign_*.js.LICENSE.txt\n', versionText });
  const ci = sLicenci(chunk('ign', 'IGN-L'), '/*! ign licence */\n');
  const co = sLicenci(chunk('ok', 'OK-L'), '/*! ok licence */\n');
  const b2 = build('1.0.0.2', [ci, co]);
  const r2 = publikuj(root, '1.0.0.2', b2.dir, ['--apply']);
  commit(root, 'v2');
  const h2 = overHead(root, '1.0.0.2', b2.dir, ['--require-licenses']);
  const b3 = build('1.0.0.3', [ci, co]);
  const r3 = publikuj(root, '1.0.0.3', b3.dir, ['--apply', '--no-pool']);
  return { root, ci, co, r2, h2, r3 };
}
console.log('AL6) Licenci, kterou repo ignoruje (.gitignore), nastroj nezapise');
{
  const s = scenarIgnor();
  ok(s.r2.kod === 0 && exists(s.root, P + licOf(s.co.file)) && !exists(s.root, P + licOf(s.ci.file)), 'AL6 uloziste: neignorovana licence zapsana, ignorovana NE');
  ok(s.r2.out.indexOf('1 vynechano (.gitignore)') !== -1, 'AL6 vypis hlasi 1 licenci vynechanou kvuli .gitignore');
  ok(s.h2.kod === 0, 'AL6 --verify-head --require-licenses ignorovanou licenci nevyzaduje (exit ' + s.h2.kod + ')');
  ok(s.r3.kod === 0 && exists(s.root, APP + '/1.0.0.3/' + licOf(s.co.file)) && !exists(s.root, APP + '/1.0.0.3/' + licOf(s.ci.file)), 'AL6 samostatna verze: neignorovana licence zapsana, ignorovana NE');
}
console.log('AL6p) Protipriklad: bez POOL-IGNORED se ignorovana licence ZAPISE (AL6 tedy meri)');
{
  const bez = vystrihni(VER_SRC, 'POOL-IGNORED', 'ignoredPaths(', 'pool-version.mjs');
  if (bez) {
    const s = scenarIgnor(bez);
    ok(s.r2.kod === 0 && exists(s.root, P + licOf(s.ci.file)), 'AL6p varianta bez POOL-IGNORED zapsala ignorovanou licenci do uloziste');
    ok(s.h2.kod === 1, 'AL6p varianta bez POOL-IGNORED ignorovanou licenci pri --require-licenses VYZADUJE (exit ' + s.h2.kod + ') - AL6 tedy meri i tohle');
  }
}

// Build, kde licence je, ale bundle na ni NEODKAZUJE (heft tak vyrabi webpart bundly v release/assets).
function scenarBezOdkazu(versionText) {
  const root = postavCdn('lic-bezodkazu', null, { versionText });
  const cr = sLicenci(chunk('ref', 'REF-L'), '/*! ref licence */\n');
  const cb = Object.assign(chunk('bezodk', 'BEZODK-L'), { lic: '/*! licence bez odkazu */\n' });   // soubor ano, hlavicka ne
  const b2 = build('1.0.0.2', [cr, cb]);
  const r2 = publikuj(root, '1.0.0.2', b2.dir, ['--apply']);
  commit(root, 'v2');
  const h2 = overHead(root, '1.0.0.2', b2.dir, ['--require-licenses']);
  const b3 = build('1.0.0.3', [cr, cb]);
  const r3 = publikuj(root, '1.0.0.3', b3.dir, ['--apply', '--no-pool']);
  commit(root, 'v3');
  // samostatna verze vydana pred licencemi -> doplni se jen odkazovana licence
  publikuj(root, '1.0.0.4', build('1.0.0.4', [cr, cb], { bezLicenci: true }).dir, ['--apply', '--no-pool']);
  commit(root, 'v4 pred licencemi');
  const r4 = publikuj(root, '1.0.0.4', build('1.0.0.4', [cr, cb]).dir, ['--apply']);
  return { root, cr, cb, r2, h2, r3, r4 };
}
console.log('AL9) Licence, na kterou bundle NEODKAZUJE, se nepublikuje (sirotek z buildu)');
{
  const s = scenarBezOdkazu();
  ok(s.r2.kod === 0 && exists(s.root, P + licOf(s.cr.file)) && !exists(s.root, P + licOf(s.cb.file)), 'AL9 uloziste: odkazovana licence zapsana, licence bez odkazu NE');
  ok(s.r2.out.indexOf('licence bez odkazu v bundlu - nepublikuji: ' + licOf(s.cb.file)) !== -1, 'AL9 plan jmenuje licenci bez odkazu ("licence bez odkazu v bundlu - nepublikuji")');
  ok(s.h2.kod === 0, 'AL9 --verify-head --require-licenses licenci bez odkazu nevyzaduje (exit ' + s.h2.kod + ')');
  ok(s.r3.kod === 0 && exists(s.root, APP + '/1.0.0.3/' + licOf(s.cr.file)) && !exists(s.root, APP + '/1.0.0.3/' + licOf(s.cb.file)), 'AL9 samostatna verze: odkazovana licence zapsana, bez odkazu NE');
  ok(s.r4.kod === 0 && s.r4.out.indexOf('doplnuji 1 licenci') !== -1 && exists(s.root, APP + '/1.0.0.4/' + licOf(s.cr.file)) && !exists(s.root, APP + '/1.0.0.4/' + licOf(s.cb.file)),
    'AL9 doplneni k verzi vydane pred licencemi: jen odkazovana licence (exit ' + s.r4.kod + ')');
}
console.log('AL9p) Protipriklad: bez POOL-REFERENCED se publikuje i licence bez odkazu (AL9 tedy meri)');
{
  const bez = vystrihni(VER_SRC, 'POOL-REFERENCED', 'refersToLicense(', 'pool-version.mjs');
  if (bez) {
    const s = scenarBezOdkazu(bez);
    ok(s.r2.kod === 0 && exists(s.root, P + licOf(s.cb.file)), 'AL9p varianta bez POOL-REFERENCED zapsala licenci bez odkazu do uloziste');
    // HEAD od spravneho nastroje (licence bez odkazu v nem neni), kontrola variantou bez regionu
    const t = scenarBezOdkazu();
    fs.writeFileSync(path.join(t.root, 'tools', 'pool-version.mjs'), bez, 'utf8');
    const h = overHead(t.root, '1.0.0.2', build('1.0.0.2', [t.cr, t.cb]).dir, ['--require-licenses']);
    ok(h.kod === 1, 'AL9p varianta bez POOL-REFERENCED licenci bez odkazu pri --require-licenses VYZADUJE (exit ' + h.kod + ') - AL9 tedy meri i tohle');
  }
}

console.log('AL7) --verify-live: licence v HEAD se overi (200 + SHA); lokalni server misto CDN');
{
  let rootLive = null, lic404 = false, obsahHead = new Map();
  // Posila obsah HEAD mini-CDN (jako Pages), ne pracovni strom. Nacita se DOPREDU do pameti:
  // handler nesmi blokovat smycku (execFileSync v handleru pad procesu po fetch zamaskoval -
  // proti puvodnimu nastroji pak AL8 nic nemeril).
  const nactiHead = (root) => {
    const m = new Map();
    git(root, ['ls-tree', '-r', 'HEAD']).split('\n').forEach(l => {
      const x = /^\d+\s+blob\s+([0-9a-f]+)\t(.+)$/.exec(l);
      if (x) m.set(x[2], execFileSync('git', ['-C', root, 'cat-file', 'blob', x[1]], { maxBuffer: 64 * 1024 * 1024 }));
    });
    return m;
  };
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split('?')[0].replace(/^\//, ''));
    const buf = (lic404 && /\.LICENSE\.txt$/.test(rel)) ? null : obsahHead.get(rel);
    if (!buf) { res.writeHead(404); res.end('404'); return; }
    res.writeHead(200, { 'content-type': 'application/octet-stream', 'access-control-allow-origin': '*' });
    res.end(buf);
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port + '/';
  const CDN_LINE = "export const CDN_URL = 'https://cdn.easyportal365.cz/';";
  const LIB_LIVE = LIB.indexOf(CDN_LINE) !== -1 ? LIB.replace(CDN_LINE, "export const CDN_URL = '" + base + "';") : null;
  if (!LIB_LIVE) ok(false, 'AL7 radek CDN_URL v pool-lib.mjs nenalezen - test nejde postavit');
  else {
    rootLive = postavCdn('lic-live', LIB_LIVE);
    const verUrl = (v) => base + APP + '/' + v + '/';
    const live = (ver, src) => spustAsync(rootLive, 'pool-version.mjs', ['--app', APP, '--version', ver, '--src', src, '--verify-live', '--timeout-s', '0']);
    const lx = sLicenci(chunk('xlsx', 'XLSX-LIVE'), '/*! xlsx live */\n');
    const b2 = build('1.0.0.2', [lx], { licBundle: '/*! live bundle */\n', base: verUrl('1.0.0.2') });
    publikuj(rootLive, '1.0.0.2', b2.dir, ['--apply']);
    commit(rootLive, 'v2');
    obsahHead = nactiHead(rootLive);
    let r = await live('1.0.0.2', b2.dir);
    const okLic = r.out.split('\n').filter(l => /^\s+OK\s+200 .*\.LICENSE\.txt\s*$/.test(l)).length;
    ok(r.kod === 0 && okLic === 2, 'AL7a verify-live: 200 + SHA i u 2 licenci, ktere v HEAD jsou (exit ' + r.kod + ', licenci OK ' + okLic + ')');
    lic404 = true;
    r = await live('1.0.0.2', b2.dir);
    ok(r.kod === 1 && /CHYBA 404 .*\.LICENSE\.txt/.test(r.out), 'AL7b licence je v HEAD, ale na CDN 404 -> exit 1 (dostal ' + r.kod + ')');
    // legacy verze: licence v HEAD nejsou -> overovat je nema, 404 na ne nevadi
    const lz = sLicenci(chunk('zip', 'ZIP-LIVE'), '/*! zip live */\n');
    const b3bez = build('1.0.0.3', [lz], { licBundle: '/*! live3 */\n', base: verUrl('1.0.0.3'), bezLicenci: true });
    publikuj(rootLive, '1.0.0.3', b3bez.dir, ['--apply']);
    commit(rootLive, 'v3 pred licencemi');
    obsahHead = nactiHead(rootLive);
    const b3 = build('1.0.0.3', [lz], { licBundle: '/*! live3 */\n', base: verUrl('1.0.0.3') });
    r = await live('1.0.0.3', b3.dir);
    ok(r.kod === 0 && r.out.indexOf('.LICENSE.txt') === -1, 'AL7c legacy verze bez licenci v HEAD: licence se neoveruji, 404 na ne nevadi (exit ' + r.kod + ')');
    lic404 = false;

    // AL8 proces dobehne sam (process.exitCode), ne process.exit() hned po fetch: na Windows
    // (Node 24) by spadl na "Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)" a vratil
    // nenulovy kod i po "LIVE OK". Prerusovane -> 10 behu po sobe.
    console.log('AL8) --verify-live 10x po sobe: exit 0 a zadne "Assertion failed"');
    let spadlo = 0, assert = 0;
    const kody = new Set();
    for (let i = 0; i < 10; i++) {
      const x = await live('1.0.0.2', b2.dir);
      kody.add(x.kod);
      if (x.kod !== 0) spadlo++;
      if (x.out.indexOf('Assertion failed') !== -1) assert++;
    }
    ok(spadlo === 0 && assert === 0, 'AL8 10 behu: nenulovy exit ' + spadlo + '/10, "Assertion failed" ' + assert + '/10 (kody ' + Array.from(kody).join(',') + ')');
  }
  await new Promise(r => server.close(r));
}

// ================================================ BL. LICENCE PRI PROREZU ===
// Mini-CDN z B + licence (a hlavicka "For license information" v bundlu, jako z webpacku):
//   S (sdileny, zustava), P (pin, zustava), bundle 1.0.0.7 (okno, zustava),
//   O2 a bundle 1.0.0.2 (jen mazana verze, pryc), E (osirely chunk, pryc), Z (licence bez bundlu, pryc),
//   bundle 1.0.0.5 a T (ponechane, ale na svou licenci NEODKAZUJI -> licence je sirotek, pryc).
const Z_LIC = 'chunk.zombie_' + h20('zombie') + '.js.LICENSE.txt';
function postavProrezLic(nazev, libText, uprava) {
  return postavProrez(nazev, libText, (root, B, c) => {
    const pool = path.join(root, APP, POOL_DIR);
    const sLic = (file) => {
      const p = path.join(pool, file);
      fs.writeFileSync(p, '/*! For license information please see ' + licOf(file) + ' */\n' + fs.readFileSync(p, 'utf8'), 'utf8');
      fs.writeFileSync(path.join(pool, licOf(file)), 'licence k ' + file, 'utf8');
    };
    [c.S.file, c.O2.file, c.P.file, c.E.file, B['1.0.0.2'], B['1.0.0.7']].forEach(sLic);
    [B['1.0.0.5'], c.T.file].forEach(f => fs.writeFileSync(path.join(pool, licOf(f)), 'licence bez odkazu k ' + f, 'utf8'));
    fs.writeFileSync(path.join(pool, Z_LIC), 'licence bez bundlu', 'utf8');
    if (uprava) uprava(root, B, c);
  });
}
const licVPoolu = (root, f) => exists(root, APP + '/' + POOL_DIR + '/' + licOf(f));
const zombie = (root) => exists(root, APP + '/' + POOL_DIR + '/' + Z_LIC);

console.log('BL) Prorez uloziste s licencemi (prune-versions.mjs + pool-lib.mjs)');
{
  const x = postavProrezLic('lic-prorez');
  const r = prorez(x);
  ok(r.kod === 0, 'BL1 prorez s licencemi dobehl (exit ' + r.kod + ')');
  ok(licVPoolu(x.root, x.S.file) && licVPoolu(x.root, x.P.file) && licVPoolu(x.root, x.B['1.0.0.7']), 'BL1 licence PONECHANYCH bundlu zustaly (sdileny S, pinuty P, bundle 1.0.0.7)');
  ok(!licVPoolu(x.root, x.O2.file) && !licVPoolu(x.root, x.B['1.0.0.2']), 'BL1 licence smazanych bundlu (O2, bundle 1.0.0.2) jsou PRYC');
  ok(!licVPoolu(x.root, x.E.file) && !zombie(x.root), 'BL1 licence sirotku (osirely chunk E, licence bez bundlu) jsou PRYC');
  ok(!licVPoolu(x.root, x.B['1.0.0.5']) && !licVPoolu(x.root, x.T.file) && vPoolu(x.root, x.B['1.0.0.5']) && vPoolu(x.root, x.T),
    'BL1 licence, na kterou PONECHANY bundle neodkazuje (bundle 1.0.0.5, T), je PRYC; bundly zustaly');
  ok(vPoolu(x.root, x.S) && !vPoolu(x.root, x.O2) && !vPoolu(x.root, x.E), 'BL1 .js se prorezavaji beze zmeny (S zustal, O2 a E pryc)');
}
console.log('BL2) Protipriklad 1: bez pravidla licenci (POOL-LICENSE) chyti chybu nezavisla kontrola - nesmaze se NIC');
{
  const bezLic = vystrihni(LIB, 'POOL-LICENSE', 'bundleOfLicense(');
  if (bezLic) {
    const x = postavProrezLic('lic-bezpravidla', bezLic);
    const r = prorez(x);
    ok(r.kod === 1 && r.out.indexOf('OVERENI ULOZISTE SELHALO') !== -1, 'BL2 exit 1 + OVERENI ULOZISTE SELHALO (dostal ' + r.kod + ')');
    ok(licVPoolu(x.root, x.S.file) && licVPoolu(x.root, x.O2.file) && zombie(x.root) && exists(x.root, APP + '/1.0.0.2'), 'BL2 nic nesmazano (licence ani verzni slozky)');
  }
}
console.log('BL3) Protipriklad 2: bez pravidla licenci I kontroly zmizi licence PONECHANEHO bundlu (BL1 tedy meri)');
{
  const bezLic = vystrihni(LIB, 'POOL-LICENSE', 'bundleOfLicense(');
  const bezObou = bezLic ? vystrihni(bezLic, 'POOL-VERIFY', 'indexOf') : null;
  if (bezObou) {
    const x = postavProrezLic('lic-bezobou', bezObou);
    const r = prorez(x);
    ok(r.kod === 0 && !licVPoolu(x.root, x.S.file), 'BL3 varianta bez ochran smazala licenci sdileneho (ponechaneho) chunku S');
  }
}
console.log('BL4) Fail-closed plati i pro licence (tataz mini-CDN jako BL1, kde se licence mazou)');
{
  const x = postavProrezLic('lic-necitelny', null, (root) => fs.writeFileSync(path.join(root, APP, '1.0.0.6', 'manifest.json'), '{ rozbity', 'utf8'));
  const r = prorez(x);
  ok(r.kod === 0 && r.out.indexOf('nevim, co odkazuje') !== -1 && licVPoolu(x.root, x.E.file) && licVPoolu(x.root, x.O2.file) && zombie(x.root), 'BL4a necitelny manifest: z uloziste nezmizela ani jedna licence');
  const y = postavProrezLic('lic-rozbita', null, (root, B) => fs.rmSync(path.join(root, APP, POOL_DIR, B['1.0.0.6'])));
  const r2 = prorez(y);
  ok(r2.kod === 0 && r2.out.indexOf('ROZBITA VERZE') !== -1 && licVPoolu(y.root, y.E.file) && zombie(y.root), 'BL4b rozbita verze: z uloziste nezmizela ani jedna licence');
}

// ======================================= C. PLOCHE BUNDLY (prune-bundles) ===
const PB = fs.readFileSync(path.join(TOOLS, 'prune-bundles.mjs'), 'utf8');
function postavPlochou(nazev, pbText) {
  const root = tmp(nazev);
  fs.mkdirSync(path.join(root, 'tools'), { recursive: true });
  fs.writeFileSync(path.join(root, 'tools', 'prune-bundles.mjs'), pbText || PB, 'utf8');
  fs.mkdirSync(path.join(root, APP), { recursive: true });
  git(root, ['init', '-q']);
  return root;
}
// Okno --keep pocita releasy podle casu commitu: cas se nastavuje, aby poradi nebylo nahoda.
let casCommitu = 1750000000;
function commitCas(root, msg) {
  const d = String(casCommitu) + ' +0000';
  casCommitu += 3600;
  execFileSync('git', ['-C', root, '-c', 'core.safecrlf=false', 'add', '-A'], { stdio: 'ignore' });
  execFileSync('git', ['-C', root, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '--allow-empty', '-m', msg],
    { stdio: 'ignore', env: Object.assign({}, process.env, { GIT_AUTHOR_DATE: d, GIT_COMMITTER_DATE: d }) });
}
const doKorene = (root, c, bezLicence) => {
  fs.writeFileSync(path.join(root, APP, c.file), c.obsah, 'utf8');
  if (c.lic && !bezLicence) fs.writeFileSync(path.join(root, APP, licOf(c.file)), c.lic, 'utf8');
};
const vKoreni = (root, f) => exists(root, APP + '/' + f);
const trackovany = (root, f) => git(root, ['ls-files', '--', APP + '/' + f]).trim() !== '';
/** Sloupce app a ponechano z console.table - presne tak, jak je cte check-stable-roots.mjs. */
function ponechano(out) {
  const SEP = String.fromCharCode(0x2502);
  const m = new Map();
  out.split('\n').forEach(line => {
    if (line.indexOf(SEP) === -1) return;
    const cells = line.split(SEP).map(c => c.trim());
    if (cells.length < 7) return;
    const app = cells[2].replace(/^'|'$/g, '');
    const n = parseInt(cells[4], 10);
    if (app && app !== 'app' && !isNaN(n)) m.set(app, n);
  });
  return m;
}
// C1: release 1 = R1 -> X, Y; release 2 = R2 -> K, M. --keep 1 -> R1, X, Y pryc; R2, K, M zustava.
//     Licence: R1, X (trackovane, pryc s bundlem), Y (NETRACKOVANA), K, R2 (zustava), O (sirotek),
//     M (ponechany chunk na svou licenci NEODKAZUJE -> sirotek, pryc).
function scenarC1(pbText) {
  const root = postavPlochou('plocha', pbText);
  const X = sLicenci(chunk('x', 'X-obsah'), 'X licence');
  const Y = sLicenci(chunk('y', 'Y-obsah'), 'Y licence');
  const K = sLicenci(chunk('k', 'K-obsah'), 'K licence');
  const M = Object.assign(chunk('m', 'M-obsah'), { lic: 'M licence bez odkazu' });
  const R1 = sLicenci(bundle('r1', [X, Y]), 'R1 licence');
  const R2 = sLicenci(bundle('r2', [K, M]), 'R2 licence');
  const O = 'chunk.o_' + h20('O') + '.js.LICENSE.txt';
  [R1, X].forEach(c => doKorene(root, c));
  doKorene(root, Y, true);
  fs.writeFileSync(path.join(root, APP, O), 'O licence (bundle nikde)', 'utf8');
  commitCas(root, 'release 1');
  [R2, K, M].forEach(c => doKorene(root, c));
  commitCas(root, 'release 2');
  fs.writeFileSync(path.join(root, APP, licOf(Y.file)), 'Y licence', 'utf8');
  const r = spust(root, 'prune-bundles.mjs', ['--keep', '1', '--apply']);
  return { root, r, X, Y, K, M, R1, R2, O };
}
// C2: bundle D je v gitu, ale smazany JEN lokalne (necommitnuto) - jeho licence zustava.
function scenarC2(pbText) {
  const root = postavPlochou('plocha-lokalne', pbText);
  const D = sLicenci(chunk('d', 'D-obsah'), 'D licence');
  const R1 = bundle('q1', [D]);
  const R2 = bundle('q2', []);
  [R1, D].forEach(c => doKorene(root, c));
  commitCas(root, 'release 1');
  doKorene(root, R2);
  commitCas(root, 'release 2');
  fs.rmSync(path.join(root, APP, D.file));
  const r = spust(root, 'prune-bundles.mjs', ['--keep', '1', '--apply']);
  return { root, r, D, R1, R2 };
}

console.log('C) Prorez plochych bundlu s licencemi (prune-bundles.mjs)');
{
  const s = scenarC1();
  ok(s.r.kod === 0, 'C1 prorez dobehl (exit ' + s.r.kod + ')');
  ok(!vKoreni(s.root, s.R1.file) && !vKoreni(s.root, s.X.file) && !vKoreni(s.root, s.Y.file) && vKoreni(s.root, s.R2.file) && vKoreni(s.root, s.K.file), 'C1 .js beze zmeny: R1, X, Y pryc, R2 a K zustaly');
  ok(!vKoreni(s.root, licOf(s.R1.file)) && !vKoreni(s.root, licOf(s.X.file)), 'C1 trackovane licence smazanych bundlu (R1, X) jsou PRYC');
  ok(!vKoreni(s.root, s.O), 'C1 trackovana licence bez bundlu (sirotek O) je PRYC');
  ok(vKoreni(s.root, licOf(s.Y.file)) && !trackovany(s.root, licOf(s.Y.file)), 'C1 NETRACKOVANA licence smazaneho Y zustala (do git rm nesla)');
  ok(vKoreni(s.root, licOf(s.K.file)) && vKoreni(s.root, licOf(s.R2.file)), 'C1 licence ponechanych bundlu (K, R2) zustaly');
  ok(vKoreni(s.root, s.M.file) && !vKoreni(s.root, licOf(s.M.file)), 'C1 licence, na kterou ponechany chunk M neodkazuje, je PRYC (M zustal)');
  ok(ponechano(s.r.out).get(APP) === 3, 'C1 regrese: tabulka dal nese app/ponechano (.js) tak, jak ji cte check-stable-roots (ponechano ' + ponechano(s.r.out).get(APP) + ')');
  const t = scenarC2();
  ok(t.r.kod === 0 && !vKoreni(t.root, t.R1.file) && vKoreni(t.root, licOf(t.D.file)) && trackovany(t.root, licOf(t.D.file)), 'C2 licence bundlu smazaneho JEN lokalne (v gitu je) zustala');
}
console.log('C3) Protipriklad: bez LICENSE-TRACKED jde do git rm i netrackovana licence a cela davka spadne');
{
  const bez = vystrihni(PB, 'LICENSE-TRACKED', 'trackedFlat', 'prune-bundles.mjs');
  if (bez) {
    const s = scenarC1(bez);
    ok(s.r.kod !== 0 && vKoreni(s.root, s.X.file), 'C3 exit ' + s.r.kod + ' a nic nesmazano (X je porad na disku) - C1 tedy meri trackovanost');
  }
}
console.log('C4) Protipriklad: bez LICENSE-KEEP jde pryc i licence ponechaneho bundlu - chyti ji nezavisle overeni');
{
  const bez = vystrihni(PB, 'LICENSE-KEEP', 'marked.has(bundle)', 'prune-bundles.mjs');
  if (bez) {
    const s = scenarC1(bez);
    ok(s.r.kod === 1 && s.r.out.indexOf('OVERENI SELHALO') !== -1 && vKoreni(s.root, licOf(s.K.file)) && vKoreni(s.root, s.X.file), 'C4 exit 1 + OVERENI SELHALO, nic nesmazano (dostal ' + s.r.kod + ')');
    const t = scenarC2(bez);
    ok(t.r.kod === 0 && !vKoreni(t.root, licOf(t.D.file)), 'C4 bez LICENSE-KEEP zmizi licence bundlu smazaneho jen lokalne - C2 tedy meri');
  }
}

for (const d of temps) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (e) { /* TEMP */ } }
console.log(chyby ? '\nVERDIKT: ' + chyby + ' CHYBA/CHYBY - uloziste NEPOUZIVAT a prorez NEPOUSTET'
                  : '\nVERDIKT: OK - publikace do uloziste i prorez s pocitanim odkazu drzi (vc. licenci knihoven), protipriklady to dokazuji');
process.exit(chyby ? 1 : 0);
