#!/usr/bin/env node
/**
 * check-versions-free — VERZE, DO KTERÉ SE CHYSTÁM PUBLIKOVAT, NESMÍ NA CDN UŽ BÝT.
 *
 * PROČ EXISTUJE (2026-09-07, lekce §40.12). Při dávkovém vydávání osmnácti appek
 * dostalo bump jen šestnáct — skript bumpoval podle SEZNAMU appek a dvě v něm chyběly.
 * Publikace u nich proběhla „úspěšně", jenže do složky verze, která už byla vydaná:
 *
 *   quick-actions/1.0.0.35/…app_57ccf6ba….js   (vydáno v 01:25)
 *   quick-actions/1.0.0.35/…app_11677d94….js   (přepsáno v 19:43)
 *
 * Číslo verze tím přestalo znamenat konkrétní build — kdo je na ni PŘIPNUTÝ, dostane
 * pod týmž číslem jiný kód, což je přesně to, co runtime verze (DS 10.69, §40.1)
 * slibují, že se nestane. U ai-chatu by šlo o VEŘEJNOU verzi 1.53.0.0.
 *
 * Publikační skript to nezachytí a ani nemůže: dělá, co má, a poll na existující soubor
 * vrátí 200 — u přepsané verze dokonce ZA 10 SEKUND. Rychlá odpověď pollu je tady
 * varovný signál, ne dobrá zpráva.
 *
 * POUŽITÍ:
 *   node tools/check-versions-free.mjs                 … celá flotila
 *   node tools/check-versions-free.mjs ep365-crm …     … jen vyjmenované
 *
 * Exit 1 = aspoň jedna appka by publikovala do existující verze.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const CDN = path.dirname(fileURLToPath(import.meta.url)).replace(/[\\/]tools$/, '');
const APPS_ROOT = path.resolve(CDN, '..');
const VERSION_FILE = ['config', 'app-version.json'];

/** Složka na CDN se u některých appek jmenuje jinak než repo. */
const SLOZKA = { 'ep365-site-manager': 'site-manager', 'ep365-quick-actions': 'quick-actions' };
function cdnDir(repo) { return SLOZKA[repo] || repo.replace(/^ep365-/, ''); }

const zadane = process.argv.slice(2).filter((a) => a.indexOf('--') !== 0);
const repos = (zadane.length ? zadane : fs.readdirSync(APPS_ROOT))
  .filter((d) => d.indexOf('ep365-') === 0)
  .filter((d) => fs.existsSync(path.join(APPS_ROOT, d, ...VERSION_FILE)));

if (!repos.length) {
  console.error('CHYBA: nenalezena zadna appka s app-version.json — spatna cesta?');
  process.exit(2);
}

let nalezu = 0;
let overeno = 0;
const radky = [];

for (const repo of repos) {
  let verze;
  try {
    verze = JSON.parse(fs.readFileSync(path.join(APPS_ROOT, repo, ...VERSION_FILE), 'utf8')).version;
  } catch (e) {
    radky.push('  ?  ' + repo.padEnd(24) + 'verzi nejde precist — ' + e.message);
    nalezu++;
    continue;
  }
  const dir = path.join(CDN, cdnDir(repo));
  overeno++;
  if (!fs.existsSync(dir)) {
    radky.push('  -  ' + repo.padEnd(24) + verze.padEnd(12) + 'na CDN jeste neni zadna verze (prvni vydani)');
    continue;
  }
  if (fs.existsSync(path.join(dir, verze))) {
    nalezu++;
    radky.push('  X  ' + repo.padEnd(24) + verze.padEnd(12) + 'UZ NA CDN JE — publikace by prepsala vydany build');
  } else {
    radky.push('  ok ' + repo.padEnd(24) + verze.padEnd(12) + 'volna');
  }
}

console.log('check-versions-free: verze, do ktere se publikuje, nesmi na CDN uz byt (§40.12)');
radky.forEach((r) => console.log(r));

// Sebekontrola: kdyby se nic neporovnalo, „0 nalezu" by byla falesna zelena (§26).
if (overeno === 0) {
  console.error('\nCHYBA: neporovnala se ANI JEDNA appka — merilo by se nic. Zkontroluj cesty.');
  process.exit(2);
}

if (nalezu) {
  console.error('\n' + nalezu + ' appek by publikovalo do EXISTUJICI verze. Bumpni 4. rad, prebuilduj');
  console.error('a teprve pak publikuj. Pokud uz se to stalo: obsah slozky jde vratit z gitu');
  console.error('(git checkout <commit> -- <app>/<verze>/ + smazat nove pridany bundle) — ep365-cdn je verzovane.');
  process.exit(1);
}
console.log('\nOK: vsech ' + overeno + ' overenych appek ma volnou verzi.');
