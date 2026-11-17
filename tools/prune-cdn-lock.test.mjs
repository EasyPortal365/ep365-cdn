#!/usr/bin/env node
/**
 * prune-cdn-lock.test.mjs - `prune-cdn.mjs --apply` bere `.publish.lock` jako publish-cdn.
 *
 * Bezi nad KOPII prune-cdn.mjs v docasne slozce (ROOT = ta slozka), takze nesaha na
 * skutecny zamek ep365-cdn a nemuze zdrzet zivou publikaci. Politika schvalne chybi:
 * beh po ziskani zamku hned skonci na brane politiky - testuje se jen zamek.
 *
 *   node tools/prune-cdn-lock.test.mjs      # 0 = OK
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const TOOLS = path.dirname(fileURLToPath(import.meta.url));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'prune-lock-'));
fs.mkdirSync(path.join(tmp, 'tools'));
fs.copyFileSync(path.join(TOOLS, 'prune-cdn.mjs'), path.join(tmp, 'tools', 'prune-cdn.mjs'));
const LOCK = path.join(tmp, '.publish.lock');
const policy = path.join(tmp, 'neni-politika.json');

let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.error('FAIL: ' + m); } else console.log('ok: ' + m); };
function run(args, env) {
  const r = spawnSync(process.execPath, [path.join(tmp, 'tools', 'prune-cdn.mjs')].concat(args, ['--policy', policy]),
    { encoding: 'utf8', env: Object.assign({}, process.env, { EP365_PUBLISH_LOCK_HELD: '', PRUNE_LOCK_WAIT_MIN: '0' }, env || {}) });
  return { status: r.status, out: (r.stdout || '') + (r.stderr || '') };
}

try {
  // 1. cizi zamek (bezici publikace) -> --apply skonci, zamek necha byt
  fs.writeFileSync(LOCK, 'publish-cdn documents 1.18.0.99 pid=1 2026-11-17T08:00:00Z\n');
  let r = run(['--apply']);
  ok(r.status === 1 && /zamek \.publish\.lock drzi publish-cdn documents/.test(r.out), 'cizi zamek zastavi --apply');
  ok(!/politika/.test(r.out), '--apply s cizim zamkem nezacne nic delat (ani cist politiku)');
  ok(fs.existsSync(LOCK) && /^publish-cdn documents/.test(fs.readFileSync(LOCK, 'utf8')), 'cizi zamek zustal netknuty');

  // 2. PLAN zamek nebere - projde az na branu politiky
  r = run([]);
  ok(r.status === 1 && /politika prorezu nenalezena/.test(r.out), 'PLAN cizi zamek ignoruje');

  // 3. obal drzi zamek (EP365_PUBLISH_LOCK_HELD) -> --apply pokracuje a zamek nesmaze
  r = run(['--apply'], { EP365_PUBLISH_LOCK_HELD: '1' });
  ok(r.status === 1 && /drzi volajici/.test(r.out) && /politika prorezu nenalezena/.test(r.out), 'EP365_PUBLISH_LOCK_HELD pusti --apply dal');
  ok(fs.existsSync(LOCK), 'zamek volajiciho zustal');

  // 4. bez zamku -> --apply ho zalozi a pri skonceni (i chybou) uklidi
  fs.unlinkSync(LOCK);
  r = run(['--apply']);
  ok(/Zamek \.publish\.lock ziskan \(prune-cdn pid=/.test(r.out), '--apply zamek zalozi');
  ok(!fs.existsSync(LOCK), '--apply svuj zamek po skonceni smaze');
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

if (fails) { console.error('\nprune-cdn-lock: ' + fails + ' selhani'); process.exit(1); }
console.log('\nprune-cdn-lock: OK');
