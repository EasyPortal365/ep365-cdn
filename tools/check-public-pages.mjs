#!/usr/bin/env node
/**
 * check-public-pages — obsah `pages/` je VEŘEJNÝ a neprochází guardem publikace.
 *
 * PROČ EXISTUJE (2026-09-08). `publish-cdn.ps1` prohledává proti seznamu zakázaných
 * řetězců jen `<app>/<verze>/` (a u ostrého releasu loader). Složka `pages/` vznikla
 * pro statické stránky do „Vlastních stránek" v CRM a leží MIMO tu cestu — takže
 * cokoli tam někdo commitne, se nikdy proti seznamu neporovná. Guard, který na obsah
 * nedosáhne, mlčí; a mlčení vypadá stejně jako „čisté" (§26 — falešná zelená).
 *
 * `ep365-cdn` je navíc VEŘEJNÉ GitHub Pages nad VEŘEJNÝM repem: co sem jednou přijde,
 * je čitelné bez přihlášení a zůstává v historii i po smazání. Náprava = přepis
 * historie repa, který používají všechny appky. Proto se to má chytit PŘED commitem.
 *
 * POUŽITÍ:  node tools/check-public-pages.mjs
 * Exit 1 = v `pages/` je řetězec ze sdíleného seznamu.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const CDN = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PAGES = path.join(CDN, 'pages');
const SEZNAM = path.resolve(CDN, '..', 'ep365-docs', 'scripts', 'forbidden-in-public-bundles.json');

let vzorky;
try {
  vzorky = JSON.parse(fs.readFileSync(SEZNAM, 'utf8')).strings;
} catch (e) {
  console.error('CHYBA: seznam zakazanych retezcu nejde precist (' + SEZNAM + '): ' + e.message);
  process.exit(2);
}
// Prazdny seznam = guard nema podle ceho merit. To NENI duvod hlasit OK.
if (!Array.isArray(vzorky) || vzorky.length === 0) {
  console.error('CHYBA: seznam zakazanych retezcu je prazdny — nebylo by podle ceho merit.');
  process.exit(2);
}

// Korpus se NEVAZE na jmeno slozky (#325). Drive se meril jen `pages/`; ta v repu dnes
// neni, takze strazce hlasil OK a netvrdil nic - a po presunu HTML jinam by oslepl stejne.
// Bereme proto vsechny textove soubory MIMO verzovane adresare `<app>/<verze>/`, tedy
// presne to, co na CDN lezi verejne a NEprochazi guardem v publish-cdn.ps1.
const TEXTOVE = ['.html', '.htm', '.md', '.txt', '.json', '.css', '.svg'];
const VERZE = /^d+(.d+){1,3}$/;

function souboryPod(dir) {
  const out = [];
  fs.readdirSync(dir, { withFileTypes: true }).forEach((d) => {
    const p = path.join(dir, d.name);
    if (d.isDirectory()) { out.push.apply(out, souboryPod(p)); return; }
    out.push(p);
  });
  return out;
}

function korpusMimoVerze(dir, hloubka) {
  const out = [];
  let polozky;
  try { polozky = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return out; }
  polozky.forEach((d) => {
    if (d.name.charAt(0) === '.' || d.name === 'node_modules' || d.name === 'tools') return;
    const p = path.join(dir, d.name);
    if (d.isDirectory()) {
      // `<app>/<verze>/` uz proveril publish-cdn.ps1 pri nahravani - sem nepatri.
      if (hloubka === 1 && VERZE.test(d.name)) return;
      out.push.apply(out, korpusMimoVerze(p, hloubka + 1));
      return;
    }
    if (TEXTOVE.indexOf(path.extname(d.name).toLowerCase()) !== -1) out.push(p);
  });
  return out;
}

const soubory = korpusMimoVerze(CDN, 0);
let nalezu = 0;
soubory.forEach((f) => {
  let t;
  try { t = fs.readFileSync(f, 'utf8').toLowerCase(); } catch (e) { return; }
  const hit = vzorky.filter((s) => s && t.indexOf(String(s).toLowerCase()) !== -1);
  if (hit.length) {
    nalezu++;
    console.error('  NALEZ  ' + path.relative(CDN, f) + ' obsahuje: ' + hit.join(', '));
  }
});

// Sebekontrola: kdyby se neprecetl ani jeden soubor, „0 nalezu" by byla falesna zelena.
// Nad celym repem je prazdny korpus opravdu podezrely (jsou tu changelogy i versions.json).
if (soubory.length === 0) {
  console.error('CHYBA: nenasel jsem ANI JEDEN verejny textovy soubor — meridlo je rozbite, ne repo ciste.');
  process.exit(2);
}
// Protipriklad meridla: podvrzeny obsah MUSI byt videt.
const zkusebni = ('x ' + String(vzorky[0]) + ' x').toLowerCase();
if (vzorky.filter((s) => s && zkusebni.indexOf(String(s).toLowerCase()) !== -1).length === 0) {
  console.error('CHYBA: meridlo nenaslo vzorek ani v podvrzenem textu — nemeri nic.');
  process.exit(2);
}

if (nalezu) {
  console.error('\n' + nalezu + ' verejnych textovych souboru nese jmeno ze seznamu. `pages/` je VEREJNE a je');
  console.error('v historii i po smazani — oprav to PRED commitem, potom uz jen prepisem historie.');
  process.exit(1);
}
console.log('check-public-pages: OK (' + soubory.length + ' verejnych textovych souboru, ' + vzorky.length + ' vzorku, 0 nalezu)');
console.log('  Pozor: guard meri OBSAH, ne CESTU. Nazvy slozek a souboru jsou taky verejne.');
