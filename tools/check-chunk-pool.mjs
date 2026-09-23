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
 *
 * KDE SE MAZE
 *   Vyhradne v jednorazovych mini-CDN v TEMPu (git repo), ktere si skript postavi a smaze.
 *   Na tohle repo NESAHA a necte soupis pinu naseho tenantu.
 *
 * KDY POUSTET
 *   Pred kazdym `prune-cdn.mjs --apply` (brana 2c) a kdykoli se sahne na pool-lib.mjs,
 *   pool-version.mjs nebo prune-versions.mjs.
 *
 * POUZITI:  node tools/check-chunk-pool.mjs        (exit 0 = vse drzi, 1 = cokoli jineho)
 * Vystup je ASCII.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';
import { POOL_DIR, poolUrl, versionUrl } from './pool-lib.mjs';

const TOOLS = path.dirname(fileURLToPath(import.meta.url));
const APP = 'demo';
let chyby = 0;
const ok = (t, m) => { console.log((t ? '  OK   ' : '  CHYBA') + ' ' + m); if (!t) chyby++; return t; };
const h20 = (s) => crypto.createHash('md5').update(String(s)).digest('hex').slice(0, 20);
const temps = [];
const tmp = (n) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'ep365-pool-' + n + '-')); temps.push(d); return d; };

// ----------------------------------------------------------------- mini-CDN ---
function postavCdn(nazev, libText) {
  const root = tmp(nazev);
  fs.mkdirSync(path.join(root, 'tools'), { recursive: true });
  fs.writeFileSync(path.join(root, 'tools', 'pool-lib.mjs'), libText || fs.readFileSync(path.join(TOOLS, 'pool-lib.mjs'), 'utf8'), 'utf8');
  fs.copyFileSync(path.join(TOOLS, 'pool-version.mjs'), path.join(root, 'tools', 'pool-version.mjs'));
  fs.copyFileSync(path.join(TOOLS, 'prune-versions.mjs'), path.join(root, 'tools', 'prune-versions.mjs'));
  fs.mkdirSync(path.join(root, APP), { recursive: true });
  fs.writeFileSync(path.join(root, APP, 'releases.json'), '[]', 'utf8');
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
/** Vystup buildu (release/cdn-version) - manifest miri do verzni slozky jako u stabilize-loader.js. */
function build(ver, chunks, opt) {
  const o = opt || {};
  const dir = tmp('build-' + ver);
  const b = o.bundle || bundle(ver, o.odkazy || chunks, o.navic);
  fs.writeFileSync(path.join(dir, b.file), b.obsah, 'utf8');
  chunks.forEach(c => fs.writeFileSync(path.join(dir, c.file), c.obsah, 'utf8'));
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
  if (uprava) uprava(root, B);
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

function vystrihni(zdroj, region, musiObsahovat) {
  const od = zdroj.indexOf('// #region ' + region);
  const doo = zdroj.indexOf('// #endregion ' + region);
  if (od === -1 || doo === -1 || doo < od) { ok(false, 'markery ' + region + ' nenalezeny v pool-lib.mjs'); return null; }
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

for (const d of temps) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (e) { /* TEMP */ } }
console.log(chyby ? '\nVERDIKT: ' + chyby + ' CHYBA/CHYBY - uloziste NEPOUZIVAT a prorez NEPOUSTET'
                  : '\nVERDIKT: OK - publikace do uloziste i prorez s pocitanim odkazu drzi, protipriklady to dokazuji');
process.exit(chyby ? 1 : 0);
