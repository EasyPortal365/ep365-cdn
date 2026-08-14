#!/usr/bin/env node
// =============================================================================
// prune-bundles.mjs — udrzuje velikost CDN pod kontrolou (GitHub Pages limit 1 GB).
//
// POUZITI
//   node tools/prune-bundles.mjs                        # plan (nic nemaze)
//   node tools/prune-bundles.mjs --keep 10 --apply      # provede git rm
//   node tools/prune-bundles.mjs --protect homepage,multimedia --apply
//
//   --keep N       kolik poslednich releasu (= commitu) per appka ponechat (default 10)
//   --protect a,b  slozky, kterych se NEDOTKNE (viz "POLITIKA" nize)
//   --apply        skutecne smaze (jinak jen vypis plan)
//
// PROC MARK & SWEEP A NE "SMAZ STARSI NEZ X"
//   Bundly jsou obsahove hashovane a plocho ulozene v <app>/. Naivni prorez
//   podle stari nebo verze appky TISE ROZBIJE, protoze:
//
//   1) Webpart odkazuje LAZY CHUNKY a chunk se re-publikuje jen kdyz se zmeni
//      jeho obsah. Novy webpart proto bezne ukazuje na STARY chunk (napr.
//      crm web-part -> chunk.docx-gen). Smazani toho chunku appku neshodi pri
//      nacteni — spadne az ve chvili, kdy uzivatel otevre tu konkretni funkci.
//      Smoke test po nasazeni to nechyti.
//
//   2) Cele jmeno chunku v bundlu casto NENI. Webpack sklada URL ze dvou map:
//        f.u = e => "chunk." + {757:"aichat-widget-panel"}[e] + "_" + {757:"46da…"}[e] + ".js"
//      => hledat jmeno souboru nestaci, znackuje se podle HOLEHO 20-hex hashe.
//      (Pozor na \b v regexu: v "chunk.docx-gen_1a08….js" je pred hashem '_',
//       coz je slovni znak, takze \b tam nesedne a doslovny odkaz se mine.)
//
//   3) Verzi z commit subjectu NELZE spolehlive precist — bulk commity nesou
//      i vic appek a vic verzi naraz, k tomu ruzne formatovanych.
//
//   Proto: koreny = webparty z poslednich N releasu; z nich se projdou odkazy
//   tranzitivne; smaze se jen to, co neni dosazitelne. Falesna shoda hashe =
//   soubor navic = bezpecny smer.
//
// POLITIKA (--protect)
//   Nektere slozky maji nasazeni, jehoz verzi neznáme (zakaznik aktualizuje
//   .sppkg rucne a zridka). Smazany hash = tise rozbita appka u nej. Takove
//   slozky se predavaji v --protect. KTERE to jsou a PROC je v interni
//   evidenci (ep365-docs), NE tady — tohle repo je verejne.
//
// VRATNOST
//   Maze jen z pracovniho stromu (git rm). Soubory zustavaji v git historii:
//     git checkout <commit> -- <cesta>
//   Limit 1 GB u Pages meri PUBLIKOVANY web, ne historii repa.
// =============================================================================
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CDN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf(n); return i !== -1 && argv[i + 1] ? argv[i + 1] : d; };

const KEEP = parseInt(flag('--keep', '10'), 10);
const APPLY = argv.includes('--apply');
const PROTECT = new Set(flag('--protect', '').split(',').map(s => s.trim()).filter(Boolean));

// Slozky, ktere nejsou bundly appek.
const NOT_APPS = new Set(['.git', '.github', 'tools', 'licenses', 'deploy', 'brand',
  'browser-addons', 'chat-function', 'diag', 'node_modules']);

const git = a => execFileSync('git', ['-C', CDN, ...a], { maxBuffer: 1024 ** 3 }).toString();
const HASH_RE = /(?<![0-9a-f])[0-9a-f]{20}(?![0-9a-f])/g;
const mb = b => (b / 1048576).toFixed(1);

// ── file -> commit, ktery ho pridal (bereme jen identitu commitu = release) ──
const addedBy = new Map();
{
  let cur = null;
  for (let line of git(['log', '--diff-filter=A', '--name-only', '--format=@@@%H|%ct']).split('\n')) {
    line = line.replace(/\r$/, '');
    if (line.startsWith('@@@')) {
      const [commit, ts] = line.slice(3).split('|');
      cur = { commit, ts: parseInt(ts, 10) };
    } else if (line.trim() && cur && !addedBy.has(line)) addedBy.set(line, cur);
  }
}

const apps = fs.readdirSync(CDN, { withFileTypes: true })
  .filter(d => d.isDirectory() && !NOT_APPS.has(d.name)).map(d => d.name).sort();

const sweep = [];
const rows = [];
let freed = 0;

for (const app of apps) {
  const dir = path.join(CDN, app);
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.js'));
  if (!files.length) continue;

  if (PROTECT.has(app)) {
    rows.push({ app, souboru: files.length, ponechano: files.length, smazat: 0, 'uvolni MB': '— chraneno' });
    continue;
  }

  const info = f => addedBy.get(`${app}/${f}`)
    ?? { commit: 'untracked:' + f, ts: Math.floor(fs.statSync(path.join(dir, f)).mtimeMs / 1000) };

  const roots = files.filter(f => !f.startsWith('chunk.'));
  const byHash = new Map();
  for (const f of files) { const m = f.match(/_([0-9a-f]{20})\.js$/); if (m) byHash.set(m[1], f); }

  // posledni KEEP releasu = KEEP commitu, ktere pridaly nejaky koren
  const relTs = new Map();
  for (const f of roots) {
    const i = info(f);
    if (!relTs.has(i.commit) || i.ts > relTs.get(i.commit)) relTs.set(i.commit, i.ts);
  }
  const keepCommits = new Set([...relTs.entries()].sort((a, b) => b[1] - a[1]).slice(0, KEEP).map(e => e[0]));

  // Koren BEZ content hashe = STABILNI KONTRAKT, na ktery ukazuje trvaly .sppkg
  // v App Catalogu u kazdeho zakaznika (runtime-verze architektura, DS 10.69):
  // `ep-365-<app>-loader.js`. Jeho jmeno se nikdy nemeni, takze se pri release
  // PREPISUJE na miste a git ho vidi jako pridany jen JEDNOU — tim mu commit
  // postupne zestarne a vypadne z okna poslednich KEEP releasu. Pak by ho tenhle
  // prorez smazal a shodil appku VSEM zakaznikum naraz, aniz by se cokoli zmenilo
  // v jejich tenantu. Ochrana pres --protect na to nestaci: ta je per appka a musel
  // by si na ni nekdo vzpomenout. Drzime ho proto jako koren VZDY.
  // Overeno 2026-08-14: ai-chat mel loader na pozici 10/10, tedy jeden release
  // od smazani; ostatnich 15 appek bylo v bezpeci jen shodou okolnosti.
  const isStableRoot = f => !/_[0-9a-f]{20}\.js$/.test(f);

  // MARK — tranzitivne z ponechanych korenu (+ vzdy ze stabilnich kontraktu)
  const marked = new Set();
  const queue = roots.filter(f => isStableRoot(f) || keepCommits.has(info(f).commit));
  while (queue.length) {
    const f = queue.pop();
    if (marked.has(f)) continue;
    marked.add(f);
    let txt; try { txt = fs.readFileSync(path.join(dir, f), 'utf8'); } catch { continue; }
    for (const h of txt.match(HASH_RE) ?? []) {
      const t = byHash.get(h);
      if (t && !marked.has(t)) queue.push(t);
    }
  }

  // SWEEP
  let fb = 0, fc = 0;
  for (const f of files) {
    if (marked.has(f)) continue;
    fb += fs.statSync(path.join(dir, f)).size; fc++;
    sweep.push(`${app}/${f}`);
  }
  freed += fb;
  rows.push({ app, souboru: files.length, ponechano: marked.size, smazat: fc, 'uvolni MB': mb(fb) });
}

console.table(rows);
console.log(`\nUvolni ${mb(freed)} MB v ${sweep.length} souborech (--keep ${KEEP}` +
  (PROTECT.size ? `, chraneno: ${[...PROTECT].join(', ')}` : '') + `)`);

if (!sweep.length) { console.log('Neni co mazat.'); process.exit(0); }

// ── NEZAVISLE OVERENI — jinou metodou nez znackovani (holy indexOf, bez regexu) ──
// Regex uz se jednou spletl (\b vs '_'), takze plan proveri druhy, nezavisly pruchod.
process.stdout.write('Overuji plan nezavisle (indexOf)… ');
const keptOf = new Map();
for (const app of new Set(sweep.map(s => s.split('/')[0]))) {
  const del = new Set(sweep.filter(s => s.startsWith(app + '/')).map(s => s.split('/')[1]));
  keptOf.set(app, fs.readdirSync(path.join(CDN, app)).filter(f => f.endsWith('.js') && !del.has(f)));
}
const bad = [];
for (const rel of sweep) {
  const [app, file] = rel.split('/');
  const m = file.match(/_([0-9a-f]{20})\.js$/);
  if (!m) continue;
  for (const k of keptOf.get(app)) {
    if (fs.readFileSync(path.join(CDN, app, k), 'utf8').includes(m[1])) { bad.push(`${rel} <- ${app}/${k}`); break; }
  }
}
if (bad.length) {
  console.log(`\nOVERENI SELHALO — ${bad.length} mazanych souboru je stale odkazovano:`);
  bad.slice(0, 10).forEach(v => console.log('   ' + v));
  process.exit(1);
}
console.log('OK — nic z mazaneho neni odkazovano z ponechanych.');

if (!APPLY) { console.log('\nPLAN (nic nesmazano). Spust s --apply.'); process.exit(0); }

for (let i = 0; i < sweep.length; i += 100) git(['rm', '--quiet', '--', ...sweep.slice(i, i + 100)]);
console.log(`\nHotovo: git rm ${sweep.length} souboru. Commit NEPROVEDEN — zkontroluj git status.`);
