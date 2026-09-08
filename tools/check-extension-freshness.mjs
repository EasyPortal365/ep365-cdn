/**
 * Co zakaznik ve widgetu / command setu OPRAVDU spousti.
 *
 * Proc to je (lekce 40.14, 2026-09-08): bundle rozsireni ma na CDN STABILNI jmeno bez hashe,
 * protoze na nej miri manifest v .sppkg. Ticha publikace ho ZAMERNE neprepisuje (je sdileny
 * vsemi tenanty), takze se do nej dostane jen VEREJNE vydani. Datum souboru, cislo verze ani
 * zelena publikace tedy neriznaji nic o tom, jestli je v nem konkretni oprava - a widget se
 * pinem otestovat NEDA. Tenhle skript to zmeri: ktery build stabilni jmeno obsahuje a o kolik
 * builduu je pozadu za nejnovejsim publikovanym.
 *
 * Pouziti (v ep365-cdn):
 *   node tools/check-extension-freshness.mjs
 *   node tools/check-extension-freshness.mjs --capability getTokenProvider
 *
 * `--capability <retezec>` = OTISK SCHOPNOSTI: retezec, ktery hledana zmena do bundlu nutne
 * prinese (jmeno runtime API, literal, text hlasky). Meridlo se cejchuje na znamem pozitivu -
 * kdyz retezec neni ANI v nejnovejsim hashovanem bundlu, skript to rekne a NETVRDI nic o
 * stabilnim souboru (jinak by meril svuj vzorek, ne schopnost; tvar par. 36 a 82.1).
 */
import { readdirSync, readFileSync, statSync } from 'fs';
import { createHash } from 'crypto';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const capIdx = args.indexOf('--capability');
const CAP = capIdx !== -1 ? args[capIdx + 1] : null;
const HASH = /^(.*)_[0-9a-f]{20}\.js$/;

const md5 = p => createHash('md5').update(readFileSync(p)).digest('hex');

const appky = readdirSync(ROOT, { withFileTypes: true })
  .filter(d => d.isDirectory() && d.name.charAt(0) !== '.' && d.name !== 'tools' && d.name !== 'pages')
  .map(d => d.name).sort();

let radku = 0, zastaralych = 0, bezOtisku = 0;
console.log('');
console.log('  soubor'.padEnd(46) + 'obsahuje build'.padEnd(16) + 'novejsich'.padEnd(11) + (CAP ? 'otisk' : ''));
console.log('  ' + '-'.repeat(CAP ? 84 : 72));

for (const app of appky) {
  const dir = join(ROOT, app);
  let soubory;
  try { soubory = readdirSync(dir).filter(f => f.slice(-3) === '.js'); } catch { continue; }

  // Stabilni jmeno = *.js bez hashe, ke kteremu existuji hashovani sourozenci se stejnym zakladem.
  const hashovane = soubory.filter(f => HASH.test(f));
  const stabilni = soubory.filter(f => !HASH.test(f) && hashovane.some(h => HASH.exec(h)[1] === f.slice(0, -3)));

  for (const s of stabilni) {
    const zaklad = s.slice(0, -3);
    const rodina = hashovane.filter(h => HASH.exec(h)[1] === zaklad)
      .map(h => ({ jmeno: h, cas: statSync(join(dir, h)).mtimeMs, md5: md5(join(dir, h)) }))
      .sort((a, b) => a.cas - b.cas);
    if (!rodina.length) continue;

    const mujMd5 = md5(join(dir, s));
    const shoda = rodina.filter(r => r.md5 === mujMd5)[0];
    const idx = shoda ? rodina.indexOf(shoda) : -1;
    const novejsich = idx === -1 ? '?' : String(rodina.length - 1 - idx);
    if (idx !== -1 && rodina.length - 1 - idx > 0) zastaralych++;

    let otisk = '';
    if (CAP) {
      const vSouboru = readFileSync(join(dir, s), 'utf8').indexOf(CAP) !== -1;
      const vNejnovejsim = readFileSync(join(dir, rodina[rodina.length - 1].jmeno), 'utf8').indexOf(CAP) !== -1;
      // Cejchovani: kdyz otisk neni ani v nejnovejsim buildu, meridlo o schopnosti nic netvrdi.
      otisk = !vNejnovejsim ? 'NEMERITELNY (ani v nejnovejsim)' : (vSouboru ? 'JE' : 'CHYBI');
      if (!vNejnovejsim) bezOtisku++;
    }

    radku++;
    console.log('  ' + (app + '/' + s).padEnd(44)
      + (shoda ? shoda.jmeno.slice(zaklad.length + 1, zaklad.length + 9) : '(zadny)').padEnd(16)
      + novejsich.padEnd(11) + otisk);
  }
}

console.log('');
console.log('  ' + radku + ' stabilnich bundlu rozsireni, ' + zastaralych + ' pozadu za nejnovejsim publikovanym buildem.');
if (zastaralych) {
  console.log('  Pozadu NENI vada: ticha publikace stabilni jmeno zamerne neprepisuje. Znamena to,');
  console.log('  ze tam opravy dojedou az VEREJNYM vydanim appky - a pinem se otestovat nedaji.');
}
if (CAP && bezOtisku) {
  console.log('  POZOR: u ' + bezOtisku + ' bundlu neni otisk ani v nejnovejsim buildu - meridlo o nich nic netvrdi.');
}
console.log('');
