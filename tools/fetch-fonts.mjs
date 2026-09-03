/**
 * Stáhne firemní písma z Google Fonts a připraví je k hostování na naší CDN.
 *
 * PROČ: dosud si je prohlížeč každého uživatele tahal přímo z fonts.googleapis.com,
 * takže Googlu odcházela jeho IP adresa a identifikace prohlížeče. U evropských
 * zákazníků je to opakovaný dotaz při bezpečnostním posouzení.
 *
 * Bereme jen subsety `latin` a `latin-ext` (čeština potřebuje latin-ext) a variabilní
 * řezy, takže na rodinu vyjde jeden soubor místo pěti až osmi statických.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const OUT = process.argv[2];
if (!OUT) { console.error('použití: node fetch-fonts.mjs <cílový adresář>'); process.exit(1); }
mkdirSync(OUT, { recursive: true });

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const WANTED = ['latin', 'latin-ext'];

/** Rodiny + rozsah vah, které flotila reálně používá (sjednocení všech výskytů). */
const FAMILIES = [
  { name: 'Manrope',           query: 'Manrope:wght@200..800',                    file: 'manrope' },
  { name: 'Plus Jakarta Sans', query: 'Plus+Jakarta+Sans:ital,wght@0,200..800;1,200..800', file: 'plus-jakarta-sans' },
  // JetBrains Mono jen primy rez a Fraunces jen kurziva — tak je flotila pouziva
  // (kickery uppercase, resp. zvyraznovaci veta v hlavicce). Pridani dalsiho rezu
  // = doplnit sem a pregenerovat; do te doby padne na systemove pismo z fallbacku.
  { name: 'JetBrains Mono',    query: 'JetBrains+Mono:wght@100..800',            file: 'jetbrains-mono' },
  { name: 'Fraunces',          query: 'Fraunces:ital,opsz,wght@1,9..144,300..700', file: 'fraunces' }
];

async function fetchText(url) {
  const r = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + url);
  return r.text();
}

/** Rozseká Google CSS na bloky a nechá jen ty subsety, které chceme. */
function parseFaces(css) {
  const out = [];
  const re = /\/\*\s*([a-z-]+)\s*\*\/\s*@font-face\s*\{([\s\S]*?)\}/g;
  let m;
  while ((m = re.exec(css)) !== null) {
    const subset = m[1];
    if (WANTED.indexOf(subset) === -1) continue;
    const body = m[2];
    const url = (body.match(/src:\s*url\(([^)]+)\)/) || [])[1];
    const style = (body.match(/font-style:\s*([^;]+);/) || [])[1];
    const weight = (body.match(/font-weight:\s*([^;]+);/) || [])[1];
    const range = (body.match(/unicode-range:\s*([^;]+);/) || [])[1];
    if (url) out.push({ subset, url: url.trim(), style: (style || 'normal').trim(), weight: (weight || '400').trim(), range: (range || '').trim() });
  }
  return out;
}

const cssParts = [
  '/* EP365 firemní písma — hostováno na cdn.easyportal365.cz.',
  ' *',
  ' * Do 2026-09 si je prohlížeč tahal přímo z Google Fonts, takže Googlu odcházela IP',
  ' * adresa a identifikace prohlížeče každého uživatele. Teď nejdou mimo naši doménu,',
  ' * kterou zákazník stejně musí mít povolenou (načítá se z ní kód aplikace).',
  ' *',
  ' * Písma: Manrope, Plus Jakarta Sans, JetBrains Mono, Fraunces — všechna pod',
  ' * SIL Open Font License 1.1, která hostování i redistribuci výslovně dovoluje.',
  ' * Subsety latin + latin-ext (latin-ext nese českou diakritiku), variabilní řezy.',
  ' *',
  ' * Generuje tools/fetch-fonts.mjs — needituj ručně.',
  ' */',
  ''
];

let total = 0;
for (const fam of FAMILIES) {
  const css = await fetchText('https://fonts.googleapis.com/css2?family=' + fam.query + '&display=swap');
  const faces = parseFaces(css);
  if (!faces.length) throw new Error('žádný použitelný subset pro ' + fam.name);
  for (const f of faces) {
    const italic = f.style.indexOf('italic') !== -1;
    const fname = fam.file + '-' + f.subset + (italic ? '-italic' : '') + '.woff2';
    const bin = Buffer.from(await (await fetch(f.url, { headers: { 'User-Agent': UA } })).arrayBuffer());
    writeFileSync(join(OUT, fname), bin);
    total += bin.length;
    console.log('  ' + String(Math.round(bin.length / 1024)).padStart(4) + ' kB  ' + fname);
    cssParts.push(
      '@font-face{font-family:"' + fam.name + '";font-style:' + f.style + ';font-weight:' + f.weight +
      ';font-display:swap;src:url(./' + fname + ') format("woff2");unicode-range:' + f.range + ';}'
    );
  }
}

writeFileSync(join(OUT, 'ep365-fonts.css'), cssParts.join('\n') + '\n');
console.log('celkem: ' + Math.round(total / 1024) + ' kB v ' + FAMILIES.length + ' rodinách');
