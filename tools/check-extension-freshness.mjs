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

/**
 * PROTIPŘÍKLAD (`--selftest`): rozpoznání hashovaného jména je celé měřidlo —
 * kdyby vzor přestal sedět, vyšlo by „0 stabilnich bundlu" a to je (od #325) chyba.
 * Test proto ověří obě polarity vzoru i to, že stabilní jméno hashem NENÍ.
 */
if (process.argv.indexOf('--selftest') !== -1) {
  let chyb = 0;
  const hash = 'ep-365-ai-chat-widget_0a8fd1ad5fe589aa663b.js';
  const stabil = 'ep-365-ai-chat-widget.js';
  if (!HASH.test(hash)) { console.error('  x  selftest: hashovane jmeno neprošlo vzorem'); chyb++; }
  if (HASH.test(stabil)) { console.error('  x  selftest: stabilni jmeno oznaceno za hashovane'); chyb++; }
  const m = HASH.exec(hash);
  if (!m || m[1] !== 'ep-365-ai-chat-widget') { console.error('  x  selftest: zaklad jmena se nevytahl spravne'); chyb++; }
  if (HASH.test('ep-365-ai-chat-widget_kratky.js')) { console.error('  x  selftest: vzor pousti i nehexa hash'); chyb++; }
  console.log(chyb ? 'check-extension-freshness --selftest: SELHAL' : 'check-extension-freshness --selftest: OK (4 tvrzeni vcetne obou polarit)');
  process.exit(chyb ? 1 : 0);
}

const appky = readdirSync(ROOT, { withFileTypes: true })
  .filter(d => d.isDirectory() && d.name.charAt(0) !== '.' && d.name !== 'tools' && d.name !== 'pages')
  .map(d => d.name).sort();

let radku = 0, zastaralych = 0, bezOtisku = 0, chybiOtisk = 0;
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
      else if (!vSouboru) chybiOtisk++;
    }

    radku++;
    console.log('  ' + (app + '/' + s).padEnd(44)
      + (shoda ? shoda.jmeno.slice(zaklad.length + 1, zaklad.length + 9) : '(zadny)').padEnd(16)
      + novejsich.padEnd(11) + otisk);
  }
}

// Meridlo, ktere nenaslo ANI JEDEN kandidat, netvrdi „je cisto" — tvrdi „nemerilo jsem".
// Regex ceka presne 20 hex znaku v hashi; zmena vzoru nebo prejmenovani slozky appky by
// jinak vyrobily trvale zelenou zpravu a lekce 40.14 by prestala byt hlidana.
if (radku === 0) {
  console.error('');
  console.error('  CHYBA: nenasel jsem ANI JEDEN stabilni bundle rozsireni — meridlo je rozbite, ne CDN cista.');
  process.exit(1);
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
// S `--capability` je vysledek TVRZENI, ne prehled: chybejici otisk v tom, co se servíruje,
// i nemeritelny otisk (neni ani v nejnovejsim buildu) musi zastavit automat.
// Otisk plati PER BUNDLE, ne globalne: widget nese jinou pulku kontraktu nez command set,
// takze „neni v nejnovejsim buildu" je u ciziho bundlu legitimni odpoved, ne nalez.
// Tvrdou chybou jsou proto jen dve situace:
//   a) otisk JE v nejnovejsim buildu, ale v servirovanem souboru CHYBI — oprava nedojela,
//   b) otisk neni MERITELNY NIKDE — volajici zadal retezec, ktery v zadnem buildu neni.
if (CAP) {
  if (chybiOtisk) { console.error('  CHYBA: ' + chybiOtisk + ' servirovanych bundlu otisk nema, prestoze v nejnovejsim buildu je — oprava se k uzivatelum nedostala.'); process.exit(1); }
  if (bezOtisku === radku) { console.error('  CHYBA: otisk "' + CAP + '" neni ani v jednom nejnovejsim buildu — meridlo netvrdi nic.'); process.exit(1); }
}
