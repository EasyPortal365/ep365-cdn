#!/usr/bin/env node
/**
 * check-stable-roots.mjs — hlídá minu popsanou v lekci §23.8.
 *
 * CO HLÍDÁ
 *   V kořeni každé appky (`<app>/*.js`) leží dva DRUHY souborů:
 *     • rotující bundly s content hashem  `…_1a08c4f9e0b7d2635a4f.js`
 *     • STABILNÍ kořeny bez hashe         `ep-365-<app>-loader.js`, `…-shell.js`
 *   Ten druhý druh je trvalý kontrakt: `.sppkg` v App Catalogu ukazuje u KAŽDÉHO
 *   zákazníka právě na něj a jeho jméno se nikdy nemění, takže se při každém
 *   ostrém releasu PŘEPISUJE na místě. `prune-bundles.mjs` ale počítá stáří z
 *   `git log --diff-filter=A` — z commitu, který soubor PŘIDAL. Přepis není
 *   přidání, takže stabilnímu kořenu commit stárne, zatímco kolem něj přibývají
 *   nové hashované kořeny. Jakmile jich přibude víc než `--keep`, VYPADNE Z OKNA.
 *   Kdyby ho prořez smazal, appka spadne VŠEM zákazníkům naráz, aniž by se u nich
 *   cokoli změnilo — a příčina bude v úklidovém commitu, na který nikdo nekoukne.
 *
 *   Prořez proti tomu má od 2026-08-14 pravidlo „kořen bez content hashe se značí
 *   VŽDY, nezávisle na okně". Tenhle skript odpovídá na dvě otázky:
 *     (1) MĚŘENÍ  — jak daleko je který stabilní kořen od okraje okna `--keep`?
 *     (2) CHOVÁNÍ — drží to pravidlo ve SKUTEČNÉM `prune-bundles.mjs` i dneska?
 *
 *   Otázka (2) se neptá zdrojáku (grep na `isStableRoot` by prošel i tehdy, kdyby
 *   se pravidlo obešlo jinde — §66.5). Odpovídá na ni dvěma běhy SKUTEČNÉHO prořezu:
 *     a) SYNTETICKÁ ZKOUŠKA — v dočasném adresáři postaví mini-CDN, kde loader leží
 *        prokazatelně MIMO okno, a pustí nad ním opravdový `prune-bundles.mjs`
 *        (tam, a jenom tam, i s `--apply`). Pak se podívá, jestli loader na disku
 *        pořád je. Tohle je jediná část, která platí VŽDY — nezávisle na tom, jak
 *        zrovna vypadá skutečné CDN (§63.7: prostředí, ve kterém se mechanismus
 *        nemůže spustit, nedokazuje nic).
 *     b) ZKOUŠKA NA ŽIVÝCH DATECH — pustí prořez nad tímhle repem v režimu PLÁNU
 *        se `--keep 1`, tedy s parametrem, při kterém se varianta S pravidlem a BEZ
 *        něj MUSÍ rozejít všude, kde stabilní kořen není zároveň nejnovější
 *        (§23.8 pravidlo 2: ověření opravy nesmí být no-op), a porovná jeho čísla
 *        s OBĚMA předpověďmi. Appky, kde se rozejít nemůžou, hlásí jako neprůkazné
 *        — ne jako v pořádku.
 *
 * KDY POUŠTĚT
 *   • jednou měsíčně a kdykoli se sáhne na `prune-bundles.mjs`
 *   • před každým `prune-bundles.mjs --apply` (krok 5.5 v `/release`)
 *   V TOMHLE repu nic nemaže a nic nezapisuje — čte soubory a git historii a pouští
 *   prořez jen v režimu plánu. Jediné `--apply` padne na jednorázové mini-CDN
 *   v TEMPu, které si skript sám vyrobí a po sobě zase smaže.
 *
 * POUŽITÍ
 *   node tools/check-stable-roots.mjs              # měření + obě zkoušky chování
 *   node tools/check-stable-roots.mjs --keep 10    # jiné okno (default 10 = /release)
 *   node tools/check-stable-roots.mjs --no-probe   # jen měření, bez spouštění prořezu
 *   node tools/check-stable-roots.mjs --protect-patterns -widget_,-command_
 *                                                  # vzory bundlů ROZŠÍŘENÍ z politiky (23.9): syntetická
 *                                                  # zkouška ověří, že prořez takový bundle mimo okno drží
 *                                                  # a BEZ vzoru ho smaže (protipříklad)
 *
 * NÁVRATOVÝ KÓD
 *   0 = prořez stabilní kořeny nemaže (a je to čím doložit)
 *   1 = ohrožený loader, NEBO se nepodařilo nic ověřit (viz „NEPRUKAZNE")
 *
 * Výstup je schválně ASCII — konzole PS 5.1 rozsype diakritiku.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';

// ⚠ `import.meta.url` je URL — mezera v cestě je v ní `%20`; dekódovat musí `fileURLToPath`.
const CDN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf(n); return i !== -1 && argv[i + 1] ? argv[i + 1] : d; };
const KEEP = Math.max(1, parseInt(flag('--keep', '10'), 10) || 10);
const PROBE = argv.indexOf('--no-probe') === -1;
// Vzory bundlu ROZSIRENI (z politiky). Synteticka zkouska pouziva VZDY '-widget_' — meri mechanismus,
// ne konkretni politiku; skutecne vzory se jen vypisou, aby bylo videt, s cim prorez pobezi.
const PATTERNS = flag('--protect-patterns', '').split(',').map(s => s.trim()).filter(Boolean);
const SYNTH_PATTERN = '-widget_';
const PROBE_KEEP = 1;   // okno, pri kterem se obe varianty MUSI rozejit vsude, kde je pozice > 1

// ⚠ Musi byt TOTOZNE s prune-bundles.mjs. Kdyby se rozeslo, ohlasi to zkouska
//    chovani jako "prorez vidi jine appky nez tahle kontrola" (nize).
const NOT_APPS = new Set(['.git', '.github', 'tools', 'licenses', 'deploy', 'brand',
  'browser-addons', 'chat-function', 'diag', 'node_modules']);

const HASH_RE = /(?<![0-9a-f])[0-9a-f]{20}(?![0-9a-f])/g;
const isStableRoot = f => !/_[0-9a-f]{20}\.js$/.test(f);
const git = a => execFileSync('git', ['-C', CDN, ...a], { maxBuffer: 1024 ** 3 }).toString();

// ── file -> commit, ktery ho PRIDAL (stejny zdroj dat jako prorez) ───────────
const addedBy = new Map();
{
  let cur = null;
  for (let line of git(['log', '--diff-filter=A', '--name-only', '--format=@@@%H|%ct|%cs']).split('\n')) {
    line = line.replace(/\r$/, '');
    if (line.indexOf('@@@') === 0) {
      const parts = line.slice(3).split('|');
      cur = { commit: parts[0], ts: parseInt(parts[1], 10), day: parts[2] };
    } else if (line.trim() && cur && !addedBy.has(line)) addedBy.set(line, cur);
  }
}

/** Tranzitivni znackovani pres holy 20-hex hash — presne jako prorez. */
function markFrom(dir, files, start) {
  const byHash = new Map();
  for (const f of files) { const m = f.match(/_([0-9a-f]{20})\.js$/); if (m) byHash.set(m[1], f); }
  const marked = new Set();
  const queue = start.slice();
  while (queue.length) {
    const f = queue.pop();
    if (marked.has(f)) continue;
    marked.add(f);
    let txt; try { txt = fs.readFileSync(path.join(dir, f), 'utf8'); } catch (e) { continue; }
    const hits = txt.match(HASH_RE) || [];
    for (const h of hits) {
      const t = byHash.get(h);
      if (t && !marked.has(t)) queue.push(t);
    }
  }
  return marked;
}

const apps = fs.readdirSync(CDN, { withFileTypes: true })
  .filter(d => d.isDirectory() && !NOT_APPS.has(d.name)).map(d => d.name).sort();

const report = [];

for (const app of apps) {
  const dir = path.join(CDN, app);
  const files = fs.readdirSync(dir).filter(f => f.slice(-3) === '.js');
  if (!files.length) continue;                       // prorez takovou slozku take preskoci

  const info = f => addedBy.get(app + '/' + f)
    || { commit: 'untracked:' + f, ts: Math.floor(fs.statSync(path.join(dir, f)).mtimeMs / 1000), day: 'netrackovany' };

  const roots = files.filter(f => f.indexOf('chunk.') !== 0);
  // Poradi releasu = commity, ktere pridaly nejaky koren, od nejnovejsiho.
  const relTs = new Map();
  for (const f of roots) {
    const i = info(f);
    if (!relTs.has(i.commit) || i.ts > relTs.get(i.commit)) relTs.set(i.commit, i.ts);
  }
  const order = [...relTs.entries()].sort((a, b) => b[1] - a[1]).map(e => e[0]);

  const stable = roots.filter(isStableRoot).map(f => {
    const i = info(f);
    const pos = order.indexOf(i.commit) + 1;
    return { file: f, pos, total: order.length, margin: KEEP - pos, day: i.day };
  }).sort((a, b) => b.pos - a.pos);

  // Predpovedi pro zkousku chovani pri PROBE_KEEP.
  const keepProbe = new Set(order.slice(0, PROBE_KEEP));
  const withRule = markFrom(dir, files, roots.filter(f => isStableRoot(f) || keepProbe.has(info(f).commit))).size;
  const withoutRule = markFrom(dir, files, roots.filter(f => keepProbe.has(info(f).commit))).size;

  report.push({ app, files: files.length, roots: roots.length, stable, withRule, withoutRule });
}

// ── 1. MERENI ────────────────────────────────────────────────────────────────
const pad = (s, n) => String(s).length >= n ? String(s) : String(s) + ' '.repeat(n - String(s).length);
const padL = (s, n) => String(s).length >= n ? String(s) : ' '.repeat(n - String(s).length) + String(s);

console.log('Kontrola stabilnich korenu na CDN (soubor, na ktery miri trvaly .sppkg u zakazniku).');
console.log(`Okno prorezu: --keep ${KEEP}    Repo: ${CDN}\n`);
console.log('  ' + pad('app', 15) + pad('stabilni koren', 42) + padL('pozice', 7) + padL('rezerva', 9) + '   stav');
console.log('  ' + '-'.repeat(15 + 42 + 7 + 9 + 36));

const outside = [];
const edge = [];
for (const r of report) {
  if (!r.stable.length) {
    console.log('  ' + pad(r.app, 15) + pad('(zadny - vsechny koreny maji hash)', 42)
      + padL('-', 7) + padL('-', 9) + '   neni co chranit');
    continue;
  }
  for (const s of r.stable) {
    let stav;
    if (s.pos > KEEP) { stav = 'MIMO OKNO - drzi ho uz jen pravidlo'; outside.push({ app: r.app, ...s }); }
    else if (s.margin <= 1) { stav = 'NA HRANE - snese jeste ' + s.margin + ' release'; edge.push({ app: r.app, ...s }); }
    else stav = 'v okne';
    console.log('  ' + pad(r.app, 15) + pad(s.file, 42)
      + padL(s.pos + '/' + s.total, 7) + padL(s.pos > KEEP ? '-' : s.margin, 9) + '   ' + stav);
  }
}

const withStable = report.filter(r => r.stable.length).length;
console.log(`\nMERENI: ${withStable} appek ma stabilni koren; ${outside.length} MIMO okno --keep ${KEEP}, ${edge.length} na hrane (rezerva <= 1).`);
console.log('  "Pozice" = kolikaty odzadu je release, ktery koren pridal. "Rezerva" = kolik dalsich');
console.log('  korenovych releasu appka snese, nez z okna vypadne.');
if (outside.length) {
  console.log('  MIMO OKNO = bez pravidla "koren bez content hashe se znacki VZDY" by ho prorez smazal UZ TED:');
  outside.forEach(o => console.log(`    ${o.app}/${o.file} - pozice ${o.pos} z ${o.total} korenovych releasu (pridan ${o.day})`));
}
if (edge.length) {
  console.log('  NA HRANE = po dalsim korenovem releasu vypadne z okna a bude zaviset uz jen na pravidle:');
  edge.forEach(o => console.log(`    ${o.app}/${o.file} - pozice ${o.pos} z ${o.total}, rezerva ${o.margin}`));
}

// ── 2. SYNTETICKA ZKOUSKA ────────────────────────────────────────────────────
/**
 * Postavi v TEMP adresari mini-CDN s jednou appkou `demo`:
 *   commit 1 .. loader bez hashe            <- stabilni koren, nejSTARSI
 *   commit 2..6 .. 5 hashovanych korenu     <- loader tim konci na pozici 6 z 6
 * a pusti nad nim SKUTECNY prune-bundles.mjs s oknem --keep 3, tedy stav, kde
 * loader z okna prokazatelne vypadl. Pak se podiva, jestli soubor na disku je.
 *
 * ⚠ `--apply` je tu SCHVALNE a je bezpecne: prorez si sve CDN odvozuje z UMISTENI
 *    SVEHO SOUBORU (`..` od `tools/`), takze kopie v TEMPu nema na skutecne repo
 *    zadnou cestu. Nez se pusti, kontroluje se, ze cilova cesta lezi v os.tmpdir().
 *    Bez `--apply` by zkouska merila jen cislo v tabulce; takhle meri VYSLEDEK.
 */
function selfTest() {
  const FIX_KEEP = 3, HASHED = 5;                 // loader skonci na pozici HASHED+1 = 6
  let root = null;
  try {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'ep365-stable-roots-'));
    if (root.indexOf(os.tmpdir()) !== 0) return { ok: false, reason: 'docasna cesta nelezi v TEMP' };
    fs.mkdirSync(path.join(root, 'tools'));
    fs.mkdirSync(path.join(root, 'demo'));
    fs.copyFileSync(path.join(CDN, 'tools', 'prune-bundles.mjs'), path.join(root, 'tools', 'prune-bundles.mjs'));

    const G = ['-C', root, '-c', 'user.name=fixture', '-c', 'user.email=fixture@local', '-c', 'commit.gpgsign=false'];
    let ts = 1750000000;
    const commit = m => {
      execFileSync('git', [...G, 'add', '-A'], { stdio: 'pipe' });
      execFileSync('git', [...G, 'commit', '-q', '-m', m],
        { stdio: 'pipe', env: { ...process.env, GIT_AUTHOR_DATE: ts + ' +0000', GIT_COMMITTER_DATE: ts + ' +0000' } });
      ts += 3600;
    };
    execFileSync('git', [...G, 'init', '-q'], { stdio: 'pipe' });

    const loader = path.join(root, 'demo', 'ep-365-demo-loader.js');
    fs.writeFileSync(loader, '// stabilni koren bez hashe - na tenhle soubor miri trvaly .sppkg\n');
    // Bundle ROZSIRENI: hashovany, v NEJSTARSIM commitu (mimo okno) — na nej miri .sppkg primo (23.9).
    const widget = path.join(root, 'demo', 'ep-365-demo-widget_' + 'b'.repeat(20) + '.js');
    fs.writeFileSync(widget, '// bundle rozsireni (application customizer) - hash z nasazeneho .sppkg\n');
    commit('demo: loader');
    for (let i = 0; i < HASHED; i++) {
      const h = (i + 10).toString(16);
      fs.writeFileSync(path.join(root, 'demo', 'ep-365-demo-web-part_' + 'a'.repeat(20 - h.length) + h + '.js'), '// release ' + i + '\n');
      commit('demo: release ' + i);
    }

    // Beh 1: SE vzorem — loader i widget musi prezit, hashovane web-party mimo okno odejdou.
    const r = spawnSync(process.execPath, [path.join(root, 'tools', 'prune-bundles.mjs'), '--keep', String(FIX_KEEP), '--apply', '--protect-patterns', SYNTH_PATTERN],
      { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
    const survived = fs.existsSync(loader);
    const widgetKept = fs.existsSync(widget);
    const others = fs.readdirSync(path.join(root, 'demo')).length;
    // Beh 2: PROTIPRIKLAD bez vzoru — widget mimo okno MUSI odejit; jinak by zkouska nic nemerila (77.3).
    const r2 = spawnSync(process.execPath, [path.join(root, 'tools', 'prune-bundles.mjs'), '--keep', String(FIX_KEEP), '--apply'],
      { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
    const widgetGoneWithout = !fs.existsSync(widget);
    const survived2 = fs.existsSync(loader);
    return { ok: true, survived: survived && survived2, widgetKept, widgetGoneWithout, others, out: (r.stdout || '') + (r.stderr || '') + (r2.stdout || '') + (r2.stderr || '') };
  } catch (e) {
    return { ok: false, reason: String(e && e.message ? e.message : e) };
  } finally {
    if (root) { try { fs.rmSync(root, { recursive: true, force: true }); } catch (e) { /* TEMP uklidi OS */ } }
  }
}

// ── 3. ZKOUSKA CHOVANI ───────────────────────────────────────────────────────
if (!PROBE) {
  console.log('\nZKOUSKY CHOVANI PRESKOCENY (--no-probe). Merenim vyse se NEDOKAZUJE, ze prorez to pravidlo skutecne ma.');
  process.exit(0);
}

const selfFail = [];
let proofs = 0;                 // kolik NEZAVISLYCH dukazu, ze pravidlo v prorezu zije
console.log('\nSYNTETICKA ZKOUSKA: mini-CDN v TEMPu, kde loader lezi MIMO okno (pozice 6 z 6, --keep 3).');
const st = selfTest();
if (!st.ok) {
  console.log('  ! ZKOUSKA NEPROBEHLA: ' + st.reason);
  console.log('    (chyba prostredi, ne dukaz vady - ale plati jen zkouska na zivych datech nize)');
} else if (st.survived) {
  console.log(`  Skutecny prune-bundles --apply nechal loader na disku (zbylo ${st.others} z 7 souboru) -> pravidlo ZIJE.`);
  proofs++;
} else {
  console.log('  Skutecny prune-bundles --apply loader SMAZAL -> pravidlo v prorezu NENI.');
  selfFail.push('synteticka zkouska: prorez smazal stabilni koren, ktery vypadl z okna');
}
// Bundle ROZSIRENI (23.9): se vzorem prezije, bez vzoru odejde — obe pulky jsou dukaz.
if (st.ok) {
  if (st.widgetKept && st.widgetGoneWithout) {
    console.log(`  Bundle rozsireni mimo okno: s --protect-patterns ${SYNTH_PATTERN} PREZIL, bez vzoru SMAZAN -> vzor drzi a neni no-op.`);
    proofs++;
  } else if (!st.widgetKept) {
    console.log('  Bundle rozsireni mimo okno byl SMAZAN i se vzorem -> --protect-patterns v prorezu nefunguje.');
    selfFail.push('synteticka zkouska: prorez smazal bundle rozsireni navzdory --protect-patterns');
  } else {
    console.log('  Bundle rozsireni prezil i BEZ vzoru -> zkouska nic nemeri (soubor nebyl mimo okno?).');
    selfFail.push('synteticka zkouska: protipriklad neprosel, vzor se nedokazal');
  }
  if (PATTERNS.length) console.log('  Politika prorezu drzi vzory: ' + PATTERNS.join(' '));
  else console.log('  ! Prorez pobezi BEZ vzoru bundlu rozsireni (politika je neprodava) - hashovany kontrakt .sppkg neni chraneny.');
}

console.log(`\nZKOUSKA NA ZIVYCH DATECH: poustim skutecny prune-bundles.mjs --keep ${PROBE_KEEP} (jen PLAN, nic nemaze).`);
console.log('  Uzke okno je zvolene schvalne: pri nem se varianta S pravidlem a BEZ nej MUSI rozejit vsude,');
console.log('  kde stabilni koren neni uplne nejnovejsi. Sirsi okno by dalo stejna cisla a nedokazalo nic.');

const run = spawnSync(process.execPath, [path.join(CDN, 'tools', 'prune-bundles.mjs'), '--keep', String(PROBE_KEEP)],
  { cwd: CDN, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const stdout = (run.stdout || '') + (run.stderr || '');

// console.table ma ramecky U+2502; z radku beru sloupce "app" a "ponechano".
const kept = new Map();
for (const line of stdout.split('\n')) {
  if (line.indexOf('│') === -1) continue;
  const cells = line.split('│').map(c => c.trim());
  if (cells.length < 7) continue;
  const app = cells[2].replace(/^'|'$/g, '');
  const n = parseInt(cells[4], 10);
  if (app && app !== 'app' && !isNaN(n)) kept.set(app, n);
}

const fail = selfFail.slice();
const warn = [];
if (!kept.size) {
  console.log('\n  NEPODARILO SE precist plan prorezu (zmenil se format vystupu?). Prvnich 12 radku:');
  console.log(stdout.split('\n').slice(0, 12).map(l => '    ' + l).join('\n'));
  fail.push('plan prorezu je necitelny - zkouska NEPROBEHLA');
} else {
  const mine = new Set(report.map(r => r.app));
  [...kept.keys()].filter(a => !mine.has(a)).forEach(a => warn.push(`prorez vidi appku "${a}", tahle kontrola ne`));
  [...mine].filter(a => !kept.has(a)).forEach(a => warn.push(`tahle kontrola vidi appku "${a}", prorez ne`));

  const liveFail = [];
  let decisive = 0, inconclusive = 0;
  for (const r of report) {
    const n = kept.get(r.app);
    if (n === undefined) continue;
    if (r.withRule === r.withoutRule) { inconclusive++; continue; }
    decisive++;
    if (n === r.withRule) { proofs++; continue; }
    if (n === r.withoutRule) liveFail.push(`${r.app}: prorez nechal ${n} souboru = varianta BEZ pravidla (s pravidlem by nechal ${r.withRule}) -> stabilni koren by SMAZAL`);
    else liveFail.push(`${r.app}: prorez nechal ${n} souboru, cekano ${r.withRule} (s pravidlem) nebo ${r.withoutRule} (bez nej) -> kontrola se s prorezem rozesla, prectete ho`);
  }
  console.log('\n  ' + decisive + ' appek, kde se obe varianty MUSI rozejit'
    + (liveFail.length ? `, z toho ${liveFail.length} NEODPOVIDA variante s pravidlem.`
      : decisive ? ' - vsechny odpovidaji variante S PRAVIDLEM.' : '.'));
  if (inconclusive) console.log(`  ${inconclusive} appek neprukaznych (stabilni koren je zaroven nejnovejsi koren, obe varianty davaji stejne cislo`
    + ` -> chrani je uz samo okno, ne pravidlo).`);
  if (decisive === 0) console.log('  Na zivych datech se dnes pravidlo odlisit neda; plati proto jen synteticka zkouska vyse.');
  liveFail.forEach(f => fail.push(f));
}

warn.forEach(w => console.log('  ! ' + w));

if (fail.length) {
  console.log('\nVERDIKT: SELHALO - prorez neni bezpecny.');
  fail.forEach(f => console.log('  ' + f));
  console.log('\n  NEPOUSTEJ prune-bundles.mjs --apply, dokud to neplati. Kontext: lekce 23.8.');
  process.exit(1);
}

// Zadny nalez a zaroven zadny dukaz = "nic jsem nezmerila", ne "je to v poradku".
if (proofs === 0) {
  console.log('\nVERDIKT: NEPRUKAZNE - zadna zkouska neprobehla, takze o prorezu nevime nic.');
  console.log('  Nepoustej prune-bundles.mjs --apply, dokud kontrola nedobehne (viz hlasky vyse).');
  process.exit(1);
}

console.log(`\nVERDIKT: OK - prorez stabilni koreny nemaze, zadny loader neni ohrozen (${proofs} nezavislych dukazu).`
  + (outside.length ? ` ${outside.length} z nich uz drzi JEN to pravidlo - viz MERENI vyse.` : ''));
process.exit(0);
