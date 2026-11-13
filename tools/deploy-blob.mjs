#!/usr/bin/env node
// Nasazeni obsahu ep365-cdn do Azure Blob Storage ($web) – cdn.easyportal365.cz za Azure Front Door.
// Spousti ho workflow .github/workflows/deploy-azure.yml v cerstvem blobless klonu (Linux).
// LOKALNE V PRACOVNIM REPU NESPOUSTET: checkout by prepsal pracovni strom.
//
//   node tools/deploy-blob.mjs [--mode deploy|full|verify] [--sha <commit>]
//
// deploy  (vychozi) rozdil od posledniho nasazeneho commitu (deploy/state.json) do HEAD:
//         nahraje pridane/zmenene soubory, smaze odstranene. Bez stavu nebo pri prepsane historii -> full.
// full    porovna cely strom HEAD s obsahem $web (MD5, Content-Type, Cache-Control), dorovna a smaze prebytky.
// verify  nic nemeni; porovna strom nasazeneho commitu s $web a skonci chybou pri jakemkoli rozdilu.
//
// Proc bajty z gitu a ne z pracovniho stromu: otisky trust.json, SRI zavadece (#514) a pool-version se
// pocitaji z git blobu (LF). Kazdy soubor se pred nahranim overi proti SHA-1 blobu ve stromu.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {
  WEB, STATE_CONTAINER, STATE_BLOB, CACHE_CONTROL, contentType, isPublished, phaseOf, gitBlobSha1, md5b64,
  getToken, putBlob, deleteBlob, getBlobText, ensureContainer, listBlobs, pool,
} from './azure-blob-lib.mjs';

const args = process.argv.slice(2);
const arg = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
let mode = arg('--mode', 'deploy');
const CONCURRENCY = Number(process.env.DEPLOY_CONCURRENCY || 16);

const git = (...a) => execFileSync('git', ['-c', 'core.autocrlf=false', '-c', 'core.eol=lf', ...a], { encoding: 'utf8', maxBuffer: 512 * 1024 * 1024 });

function tree(sha) {
  const map = new Map();
  for (const rec of git('ls-tree', '-r', '-z', '--full-tree', sha).split('\0')) {
    if (!rec) continue;
    const [meta, p] = rec.split('\t');
    const [m, type, oid] = meta.split(' ');
    if (type !== 'blob') continue;
    if (m !== '100644' && m !== '100755') throw new Error(`Necekany typ souboru ${m} ${p} – symlinky se na CDN nenahravaji`);
    if (isPublished(p)) map.set(p, oid);
  }
  return map;
}

function checkout(sha, paths) {
  if (!paths.length) return;
  const list = paths.map((p) => `:(literal)${p}`).join('\0') + '\0';
  execFileSync('git', ['-c', 'core.autocrlf=false', '-c', 'core.eol=lf', 'checkout', sha, '--pathspec-from-file=-', '--pathspec-file-nul'],
    { input: list, stdio: ['pipe', 'inherit', 'inherit'], maxBuffer: 64 * 1024 * 1024 });
}

function readExact(p, oid) {
  const buf = fs.readFileSync(path.join(process.cwd(), p));
  const got = gitBlobSha1(buf);
  if (got !== oid) throw new Error(`Bajty ${p} nesedi s git blobem (${got} != ${oid}) – konce radku? Nasazeni ZASTAVENO.`);
  return buf;
}

async function main() {
  const tip = arg('--sha', git('rev-parse', 'HEAD').trim());
  const token = await getToken();
  await ensureContainer(token, STATE_CONTAINER);
  const stateText = await getBlobText(token, STATE_CONTAINER, STATE_BLOB);
  const state = stateText ? JSON.parse(stateText) : null;
  console.log(`Rezim ${mode}, HEAD ${tip.slice(0, 12)}, nasazeno ${state ? state.sha.slice(0, 12) + ' (' + state.deployedAt + ')' : '–'}`);

  if (mode === 'verify') return verify(token, state ? state.sha : tip);

  if (mode === 'deploy') {
    if (!state) { console.log('Zadny stav – prvni nasazeni, prepinam na full.'); mode = 'full'; }
    else if (state.sha === tip) { console.log('Nic noveho k nasazeni.'); return; }
    else {
      try { git('merge-base', '--is-ancestor', state.sha, tip); }
      catch { console.log(`Nasazeny commit ${state.sha} neni predkem HEAD (prepsana historie?) – prepinam na full.`); mode = 'full'; }
      if (mode === 'deploy') {
        try { git('merge-base', '--is-ancestor', tip, state.sha); console.log('HEAD je starsi nez nasazeny stav – nic nedelam (zadny navrat zpet).'); return; } catch { /* ok, HEAD je novejsi */ }
      }
    }
  }

  const head = tree(tip);
  let upload = [], remove = [];
  if (mode === 'deploy') {
    const out = git('diff', '--name-status', '--no-renames', '-z', state.sha, tip).split('\0').filter(Boolean);
    for (let i = 0; i < out.length; i += 2) {
      const st = out[i], p = out[i + 1];
      if (!isPublished(p)) continue;
      if (st === 'D') remove.push(p);
      else if (head.has(p)) upload.push(p);
    }
  } else {
    console.log('Nacitam obsah $web…');
    const blobs = await listBlobs(token, WEB);
    checkout(tip, [...head.keys()]);
    for (const [p, oid] of head) {
      const b = blobs.get(p);
      if (!b) { upload.push(p); continue; }
      const buf = readExact(p, oid);
      if (b.md5 !== md5b64(buf) || b.type !== contentType(p) || b.cache !== CACHE_CONTROL) upload.push(p);
    }
    for (const name of blobs.keys()) if (!head.has(name)) remove.push(name);
  }

  console.log(`Nahrat ${upload.length}, smazat ${remove.length}`);
  if (mode === 'deploy') checkout(tip, upload);
  let bytes = 0;
  for (const phase of [1, 2, 3]) {
    const items = upload.filter((p) => phaseOf(p) === phase);
    if (!items.length) continue;
    console.log(`Faze ${phase}: ${items.length} souboru`);
    await pool(items, CONCURRENCY, async (p) => {
      const buf = readExact(p, head.get(p));
      bytes += buf.length;
      await putBlob(token, WEB, p, buf);
    });
  }
  if (remove.length) {
    console.log(`Mazani: ${remove.length} souboru`);
    await pool(remove, CONCURRENCY, (p) => deleteBlob(token, WEB, p));
  }
  const newState = { sha: tip, deployedAt: new Date().toISOString(), mode, uploaded: upload.length, deleted: remove.length, bytes, run: process.env.GITHUB_RUN_ID || 'local' };
  await putBlob(token, STATE_CONTAINER, STATE_BLOB, Buffer.from(JSON.stringify(newState, null, 2)), { type: 'application/json; charset=utf-8', cacheControl: 'no-cache' });
  console.log(`Hotovo: ${JSON.stringify(newState)}`);
}

async function verify(token, sha) {
  console.log(`Overuji $web proti commitu ${sha.slice(0, 12)}…`);
  const head = tree(sha);
  const blobs = await listBlobs(token, WEB);
  checkout(sha, [...head.keys()]);
  const missing = [], diff = [], meta = [], extra = [];
  for (const [p, oid] of head) {
    const b = blobs.get(p);
    if (!b) { missing.push(p); continue; }
    const buf = readExact(p, oid);
    if (b.md5 !== md5b64(buf) || b.size !== buf.length) diff.push(p);
    else if (b.type !== contentType(p) || b.cache !== CACHE_CONTROL) meta.push(`${p} (${b.type}; ${b.cache})`);
  }
  for (const name of blobs.keys()) if (!head.has(name)) extra.push(name);
  console.log(`Souboru ve stromu ${head.size}, v $web ${blobs.size}; chybi ${missing.length}, jiny obsah ${diff.length}, jine hlavicky ${meta.length}, navic ${extra.length}`);
  for (const [label, arr] of [['CHYBI', missing], ['JINY OBSAH', diff], ['HLAVICKY', meta], ['NAVIC', extra]]) for (const p of arr.slice(0, 20)) console.log(`  ${label}: ${p}`);
  if (missing.length || diff.length || meta.length || extra.length) process.exit(1);
  console.log('OK – obsah $web odpovida gitu bajt po bajtu.');
}

main().catch((e) => { console.error(e.stack || e.message); process.exit(1); });
