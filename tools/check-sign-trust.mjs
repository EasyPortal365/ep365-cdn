#!/usr/bin/env node
/**
 * Dukaz, ze sign-trust.mjs podepisuje to, co Pages opravdu servi, a odmita, co ma odmitat
 * (TECH-DEBT #514). Postavi v TEMPu mini-CDN (git repo s core.autocrlf=true jako nase),
 * zkopiruje sign-trust.mjs, vyrobi testovaci klic a overi:
 *   - podpis sedi s verejnym klicem a otisky = bajty z indexu gitu, ne z disku (CRLF v pracovni kopii),
 *   - seq roste, podlaha a zakazane verze se prenaseji, snizeni podlahy chce --lower-floor,
 *   - podvrzeny predchozi trust.json, klic mimo trust-keys.json a zakazana nejnovejsi verze = odmitnuto,
 *   - verze, jejiz skript neni v indexu gitu, se nepodepise.
 * Nepotrebuje sit ani produkcni klic. Exit 0 = vse sedi.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash, generateKeyPairSync, createPublicKey, verify } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
let fails = 0;
const ok = (cond, msg) => { if (cond) console.log('  ok    ' + msg); else { fails++; console.log('  FAIL  ' + msg); } };
const sri = (b) => 'sha384-' + createHash('sha384').update(b).digest('base64');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ep365-sign-trust-'));
try {
  const git = (...a) => spawnSync('git', ['-C', root, ...a], { encoding: 'utf8' });
  git('init', '-q', '-b', 'main');
  git('config', 'core.autocrlf', 'true');
  fs.mkdirSync(path.join(root, 'tools'));
  fs.copyFileSync(path.join(HERE, 'sign-trust.mjs'), path.join(root, 'tools', 'sign-trust.mjs'));
  const kp = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const der = kp.publicKey.export({ type: 'spki', format: 'der' });
  const kid = 'ep365cdn-' + createHash('sha256').update(der).digest('hex').slice(0, 16);
  fs.writeFileSync(path.join(root, 'tools', 'trust-keys.json'), JSON.stringify({ keys: [{ kid, jwk: kp.publicKey.export({ format: 'jwk' }) }] }));
  const keyFile = path.join(root, 'k.pem');
  fs.writeFileSync(keyFile, kp.privateKey.export({ type: 'pkcs8', format: 'pem' }));
  const other = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const otherFile = path.join(root, 'other.pem');
  fs.writeFileSync(otherFile, other.privateKey.export({ type: 'pkcs8', format: 'pem' }));

  const app = 'demo';
  const w = (rel, text) => { const p = path.join(root, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, text); };
  const manifest = (v, bundle, base) => JSON.stringify({ id: 'x', version: '10.0.0', loaderConfig: { entryModuleId: 'e', internalModuleBaseUrls: [base || ('https://cdn.easyportal365.cz/' + app + '/chunks/')], scriptResources: { e: { type: 'path', path: bundle }, react: { type: 'component', id: 'r', version: '17' } } } }, null, 2) + '\n';
  w(app + '/releases.json', JSON.stringify([{ version: '1.0.0.2', date: '2026-11-10' }, { version: '1.0.0.1', date: '2026-11-01' }]));
  w(app + '/1.0.0.1/manifest.json', manifest('1.0.0.1', 'e_aaaaaaaaaaaaaaaaaaaa.js'));
  w(app + '/1.0.0.2/manifest.json', manifest('1.0.0.2', 'e_bbbbbbbbbbbbbbbbbbbb.js'));
  w(app + '/1.0.0.3/manifest.json', manifest('1.0.0.3', 'e_cccccccccccccccccccc.js'));
  w(app + '/chunks/e_aaaaaaaaaaaaaaaaaaaa.js', 'A\n');
  w(app + '/chunks/e_bbbbbbbbbbbbbbbbbbbb.js', 'line1\nline2\n');
  // 1.0.0.3: skript je na disku, ale NENI v indexu gitu -> verze se nesmi podepsat
  git('add', app + '/releases.json', app + '/1.0.0.1', app + '/1.0.0.2', app + '/1.0.0.3', app + '/chunks/e_aaaaaaaaaaaaaaaaaaaa.js', app + '/chunks/e_bbbbbbbbbbbbbbbbbbbb.js');
  git('commit', '-q', '-m', 'seed');
  w(app + '/chunks/e_cccccccccccccccccccc.js', 'C\n');
  // pracovni kopie s CRLF (tak to po checkoutu s autocrlf vypada), v indexu LF
  fs.writeFileSync(path.join(root, app, 'chunks', 'e_bbbbbbbbbbbbbbbbbbbb.js'), 'line1\r\nline2\r\n');

  const run = (...a) => spawnSync(process.execPath, [path.join(root, 'tools', 'sign-trust.mjs'), '--app', app, '--key', keyFile, ...a], { encoding: 'utf8' });
  const read = () => JSON.parse(fs.readFileSync(path.join(root, app, 'trust.json'), 'utf8'));

  let r = run();
  ok(r.status === 1 && /nepodepisuje se|neni ve stage/.test(r.stdout + r.stderr), 'prvni index bez --bootstrap z commitnutych verzi odmitnut');
  r = run('--bootstrap');
  ok(r.status === 0, 'podpis projde\n' + r.stdout + r.stderr);
  let s = read();
  const pub = createPublicKey({ key: JSON.parse(fs.readFileSync(path.join(root, 'tools', 'trust-keys.json'), 'utf8')).keys[0].jwk, format: 'jwk' });
  ok(verify('sha256', Buffer.from(s.doc, 'utf8'), { key: pub, dsaEncoding: 'ieee-p1363' }, Buffer.from(s.sig, 'base64')), 'podpis sedi s verejnym klicem');
  let d = JSON.parse(s.doc);
  ok(d.seq === 1 && d.latest === '1.0.0.2' && d.app === app, 'seq 1, latest z releases.json');
  ok(d.versions['1.0.0.2'] && d.versions['1.0.0.2'].scripts.e === sri(Buffer.from('line1\nline2\n')), 'otisk skriptu = bajty z indexu gitu (LF), ne pracovni kopie (CRLF)');
  ok(d.versions['1.0.0.2'].manifest === sri(Buffer.from(manifest('1.0.0.2', 'e_bbbbbbbbbbbbbbbbbbbb.js'))), 'otisk manifestu = bajty manifestu');
  ok(!d.versions['1.0.0.3'] && /1\.0\.0\.3: skript .* neni v indexu gitu/.test(r.stdout), 'verze se skriptem mimo index gitu se nepodepise');
  ok(Object.keys(d.versions['1.0.0.1'].scripts).length === 1, 'komponenty (react) se neotiskuji');

  git('add', app + '/trust.json');
  r = run('--min-safe', '1.0.0.2', '--revoke', '1.0.0.1');
  ok(r.status === 0, 'podlaha + zakaz projde');
  d = JSON.parse(read().doc);
  ok(d.seq === 2 && d.minSafe === '1.0.0.2' && d.revoked.join() === '1.0.0.1', 'seq 2, podlaha a zakaz zapsany');
  git('add', app + '/trust.json');
  r = run();
  d = JSON.parse(read().doc);
  ok(r.status === 0 && d.seq === 3 && d.minSafe === '1.0.0.2' && d.revoked.join() === '1.0.0.1', 'dalsi podpis podlahu a zakaz prenese');
  git('add', app + '/trust.json');
  r = run('--min-safe', '1.0.0.1');
  ok(r.status === 1 && /--lower-floor/.test(r.stderr), 'snizeni podlahy bez --lower-floor odmitnuto');
  r = run('--revoke', '1.0.0.2');
  ok(r.status === 1 && /zakazanych/.test(r.stderr), 'zakazat nejnovejsi ostrou verzi nejde');
  r = spawnSync(process.execPath, [path.join(root, 'tools', 'sign-trust.mjs'), '--app', app, '--key', otherFile], { encoding: 'utf8' });
  ok(r.status === 1 && /neni v tools\/trust-keys\.json/.test(r.stderr), 'klic mimo trust-keys.json odmitnut');

  // ── Prirustek (audit jadra 2026-11-16, K2): cizi commit do repa se nepodepise ──
  git('add', app + '/trust.json');
  git('commit', '-q', '-m', 'trust');
  const goodTrust = fs.readFileSync(path.join(root, app, 'trust.json'));
  // a) utocnik commitne novou verzi 1.0.0.4 -> rutinni podpis ji NESMI zahrnout
  w(app + '/1.0.0.4/manifest.json', manifest('1.0.0.4', 'e_dddddddddddddddddddd.js'));
  w(app + '/chunks/e_dddddddddddddddddddd.js', 'EVIL\n');
  git('add', app + '/1.0.0.4', app + '/chunks/e_dddddddddddddddddddd.js');
  git('commit', '-q', '-m', 'cizi verze');
  r = run();
  d = JSON.parse(read().doc);
  ok(r.status === 0 && !d.versions['1.0.0.4'] && /1\.0\.0\.4: nova verze, kterou tento beh nepridal/.test(r.stdout), 'commitnuta cizi verze se nepodepise');
  fs.writeFileSync(path.join(root, app, 'trust.json'), goodTrust);
  // b) tataz verze pridana publikaci (ve stage) se podepise
  w(app + '/1.0.0.5/manifest.json', manifest('1.0.0.5', 'e_eeeeeeeeeeeeeeeeeeee.js'));
  w(app + '/chunks/e_eeeeeeeeeeeeeeeeeeee.js', 'E\n');
  git('add', app + '/1.0.0.5', app + '/chunks/e_eeeeeeeeeeeeeeeeeeee.js');
  r = run();
  d = JSON.parse(read().doc);
  ok(r.status === 0 && !!d.versions['1.0.0.5'] && !d.versions['1.0.0.4'], 'verze ve stage tohoto behu se podepise, cizi commitnuta ne');
  git('reset', '-q', '--', app + '/1.0.0.5', app + '/chunks/e_eeeeeeeeeeeeeeeeeeee.js');
  fs.rmSync(path.join(root, app, '1.0.0.5'), { recursive: true, force: true });
  fs.writeFileSync(path.join(root, app, 'trust.json'), goodTrust);
  // c) utocnik commitne jine bajty uz podepsane verze -> STOP
  w(app + '/chunks/e_bbbbbbbbbbbbbbbbbbbb.js', 'EVIL\n');
  git('add', app + '/chunks/e_bbbbbbbbbbbbbbbbbbbb.js');
  git('commit', '-q', '-m', 'podvrh bundlu');
  r = run();
  ok(r.status === 1 && /otisky uz podepsanych verzi .*1\.0\.0\.2/.test(r.stderr), 'zmeneny bundle podepsane verze = stop');
  r = run('--drop', '1.0.0.2');
  ok(r.status === 1 && /nejnovejsi ostra verze 1\.0\.0\.2 neni mezi podepsatelnymi/.test(r.stderr), '--drop nejnovejsi ostre verze neprojde');
  git('revert', '--no-edit', 'HEAD');
  // d) utocnik commitne releases.json s jinou nejnovejsi verzi -> STOP
  w(app + '/releases.json', JSON.stringify([{ version: '1.0.0.1', date: '2026-11-12' }]));
  git('add', app + '/releases.json');
  git('commit', '-q', '-m', 'cizi releases');
  r = run();
  ok(r.status === 1 && /releases\.json neni ve stage/.test(r.stderr), 'zmena ostre verze commitem mimo publikaci = stop');
  git('revert', '--no-edit', 'HEAD');
  fs.writeFileSync(path.join(root, app, 'trust.json'), goodTrust);
  r = run('--bootstrap');
  ok(r.status === 1 && /--bootstrap jen pro appku bez/.test(r.stderr), '--bootstrap nad existujicim indexem odmitnut');

  // podvrzeny predchozi index (napr. utocnik snizil podlahu primo v souboru) -> nepodepisovat nad nim
  s = read();
  s.doc = s.doc.replace('"minSafe":"1.0.0.2"', '"minSafe":"1.0.0.0"');
  fs.writeFileSync(path.join(root, app, 'trust.json'), JSON.stringify(s));
  git('add', app + '/trust.json');
  r = run();
  ok(r.status === 1 && /predchozi trust\.json neprosel/.test(r.stderr), 'podvrzeny predchozi trust.json = stop');
} finally {
  try { fs.rmSync(root, { recursive: true, force: true }); } catch (e) { /* TEMP */ }
}
console.log(fails ? 'check-sign-trust: ' + fails + ' chyb' : 'check-sign-trust: OK');
process.exit(fails ? 1 : 0);
