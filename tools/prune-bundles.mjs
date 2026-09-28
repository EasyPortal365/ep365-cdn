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
//   --protect-patterns x,y  hashovane koreny, jejichz JMENO obsahuje x nebo y, se drzi
//                  VZDY jako stabilni kontrakt (viz "ROZSIRENI" nize)
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
// ROZSIRENI (--protect-patterns)
//   Hashovany koren muze byt KONTRAKT .sppkg stejne jako stabilni loader: bundle SPFx
//   ROZSIRENI (application customizer = widget, command set) se nestabilizuje, takze
//   manifest v App Catalogu ukazuje na `ep-365-<app>-widget_<hash>.js` PRIMO. Ktery
//   hash je zrovna nasazeny, z CDN nepoznas (zije v katalogu zakaznika) a okno --keep
//   ho po par releasech vytlaci. Naostro 2026-09-03: widget AI chatu vracel 404 od
//   prorezu 31. 8. — bundle z nasazeneho .sppkg (16. 8.) byl 11. nejnovejsi a vypadl
//   z okna 10. Proto se koreny, jejichz jmeno obsahuje nektery ze vzoru, drzi VZDY
//   (jsou male, radove desitky KB); uklidit je jde az s novym .sppkg, ktery miri jinam.
//   Vzory prichazeji z politiky (ep365-docs, `protectRootPatterns`), ne odsud.
//
// LICENCE (<x>.js.LICENSE.txt)
//   Licence knihoven tretich stran lezi vedle sveho bundlu a plati, jen kdyz na ni bundle
//   odkazuje ("For license information please see <x>.js.LICENSE.txt"). Zustava licence
//   ponechaneho bundlu, ktery na ni odkazuje; smazany <x>.js bere licenci s sebou a sirotek
//   (bundle neni na disku ani v gitu, nebo na licenci neodkazuje) jde taky. Maze se jen
//   TRACKOVANA licence: netrackovana na Pages neni a v davce `git rm` by shodila celou davku
//   (pathspec did not match). Licence bundlu, ktery je v gitu, ale lokalne chybi
//   (necommitnute smazani), zustava - bundle je porad na Pages.
//   Tabulka (sloupce app/ponechano cte check-stable-roots.mjs) pocita dal jen .js.
//   Soubor je schvalne bez importu: check-stable-roots.mjs ho kopiruje do TEMPu SAMOTNY.
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
const PATTERNS = flag('--protect-patterns', '').split(',').map(s => s.trim()).filter(Boolean);

// Slozky, ktere nejsou bundly appek.
const NOT_APPS = new Set(['.git', '.github', 'tools', 'licenses', 'deploy', 'brand',
  'browser-addons', 'chat-function', 'diag', 'node_modules', 'prototypes']);

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

// ── licence v koreni appek: co git trackuje (jedno volani; -z = jmena bez uvozovek) ──
const LIC_SUFFIX = '.LICENSE.txt';
const LIC_REF = 'For license information please see ';     // totez co LICENSE_REF v pool-lib.mjs
const isLicense = f => /\.js\.LICENSE\.txt$/.test(f);
// Odkazuje bundle na licenci? Necitelny bundle = nevime -> licenci nechat.
const refersTo = (app, bundle, lic) => {
  try { return fs.readFileSync(path.join(CDN, app, bundle), 'utf8').indexOf(LIC_REF + lic) !== -1; } catch { return true; }
};
const trackedFlat = new Set(git(['ls-files', '-z']).split('\0').filter(p => p && p.split('/').length === 2));
// Kandidati na smazani = licence v koreni appky. Nahradni hodnota MIMO region schvalne
// (protipriklad v check-chunk-pool.mjs): bez regionu se berou licence z DISKU i netrackovane
// a `git rm` na nich spadne.
let licCandidates = app => fs.readdirSync(path.join(CDN, app)).filter(isLicense);
// #region LICENSE-TRACKED
licCandidates = app => [...trackedFlat].filter(p => p.indexOf(app + '/') === 0).map(p => p.slice(app.length + 1)).filter(isLicense);
// #endregion LICENSE-TRACKED
// Zustava licence ponechaneho bundlu, ktery na ni odkazuje. Nahradni hodnota MIMO region
// schvalne: bez regionu jde pryc kazda kandidatka - licenci ponechaneho bundlu pak musi chytit
// nezavisle overeni nize.
let licKept = () => false;
// #region LICENSE-KEEP
licKept = (app, bundle, files, marked, lic) => files.indexOf(bundle) !== -1
  ? marked.has(bundle) && refersTo(app, bundle, lic)     // bundle na disku: zustava s nim, jen kdyz odkazuje
  : trackedFlat.has(app + '/' + bundle);                 // bundle v gitu, lokalne smazany: nesahat
// #endregion LICENSE-KEEP

const sweep = [];
const licSweep = [];
const rows = [];
let freed = 0, licFreed = 0, licOrphans = 0;
const sweepLicenses = (app, dir, files, marked) => {
  for (const l of licCandidates(app)) {
    const b = l.slice(0, -LIC_SUFFIX.length);
    if (licKept(app, b, files, marked, l)) continue;
    licSweep.push(`${app}/${l}`);
    if (files.indexOf(b) === -1 || marked.has(b)) licOrphans++;   // bundle neni, nebo na licenci neodkazuje
    try { licFreed += fs.statSync(path.join(dir, l)).size; } catch { /* trackovana, lokalne smazana */ }
  }
};

for (const app of apps) {
  const dir = path.join(CDN, app);
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.js'));
  if (!files.length) {
    // Bez bundlu je kazda trackovana licence v koreni sirotek (neni-li jeji bundle v gitu).
    // Do tabulky se appka nepise - check-stable-roots cte jen appky s bundly.
    if (!PROTECT.has(app)) sweepLicenses(app, dir, files, new Set());
    continue;
  }

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
  // Bundle ROZSIRENI = hashovany kontrakt .sppkg (viz hlavicka "ROZSIRENI"): drzi se VZDY.
  const isExtensionBundle = f => PATTERNS.some(p => f.indexOf(p) !== -1);
  const queue = roots.filter(f => isStableRoot(f) || isExtensionBundle(f) || keepCommits.has(info(f).commit));
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
  sweepLicenses(app, dir, files, marked);
}

console.table(rows);
console.log(`\nUvolni ${mb(freed)} MB v ${sweep.length} souborech (--keep ${KEEP}` +
  (PROTECT.size ? `, chraneno: ${[...PROTECT].join(', ')}` : '') +
  (PATTERNS.length ? `, vzory drzene vzdy: ${PATTERNS.join(' ')}` : '') + `)`);
if (licSweep.length) console.log(`+ ${licSweep.length} licenci knihoven (*.js.LICENSE.txt, ${(licFreed / 1024).toFixed(1)} KB): `
  + `${licSweep.length - licOrphans} s mazanym bundlem, ${licOrphans} sirotku (bundle neni, nebo na licenci neodkazuje)`);

if (!sweep.length && !licSweep.length) { console.log('Neni co mazat.'); process.exit(0); }

// ── NEZAVISLE OVERENI — jinou metodou nez znackovani (holy indexOf, bez regexu) ──
// Regex uz se jednou spletl (\b vs '_'), takze plan proveri druhy, nezavisly pruchod.
// Licence se hleda celym jmenem: ponechany bundle ji jmenuje v hlavicce ("For license
// information please see <x>.js.LICENSE.txt"), takze licence ponechaneho bundlu = nalez.
process.stdout.write('Overuji plan nezavisle (indexOf)… ');
const all = sweep.concat(licSweep);
const keptOf = new Map();
for (const app of new Set(all.map(s => s.split('/')[0]))) {
  const del = new Set(all.filter(s => s.startsWith(app + '/')).map(s => s.split('/')[1]));
  keptOf.set(app, fs.readdirSync(path.join(CDN, app)).filter(f => f.endsWith('.js') && !del.has(f)));
}
const bad = [];
for (const rel of all) {
  const [app, file] = rel.split('/');
  const m = file.match(/_([0-9a-f]{20})\.js$/);
  const needle = m ? m[1] : (isLicense(file) ? file : null);
  if (!needle) continue;
  for (const k of keptOf.get(app)) {
    if (fs.readFileSync(path.join(CDN, app, k), 'utf8').includes(needle)) { bad.push(`${rel} <- ${app}/${k}`); break; }
  }
}
if (bad.length) {
  console.log(`\nOVERENI SELHALO — ${bad.length} mazanych souboru je stale odkazovano:`);
  bad.slice(0, 10).forEach(v => console.log('   ' + v));
  process.exit(1);
}
console.log('OK — nic z mazaneho neni odkazovano z ponechanych.');

if (!APPLY) { console.log('\nPLAN (nic nesmazano). Spust s --apply.'); process.exit(0); }

for (let i = 0; i < all.length; i += 100) git(['rm', '--quiet', '--', ...all.slice(i, i + 100)]);
console.log(`\nHotovo: git rm ${sweep.length} souboru` + (licSweep.length ? ` + ${licSweep.length} licenci` : '') + `. Commit NEPROVEDEN — zkontroluj git status.`);
