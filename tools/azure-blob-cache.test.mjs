#!/usr/bin/env node
/**
 * azure-blob-cache.test.mjs - indexy s pevnou adresou maji kratke s-maxage, verzovany obsah ne.
 * Duvod: Front Door drzel trust.json podle max-age=600 az ~12 min po publikaci (lekce 46.1).
 *   node tools/azure-blob-cache.test.mjs      # 0 = OK
 */
import { cacheControlFor, CACHE_CONTROL, CACHE_CONTROL_INDEX, CACHE_CONTROL_NO_STORE, isPublished } from './azure-blob-lib.mjs';

const cases = [
  ['documents/trust.json', CACHE_CONTROL_INDEX],
  ['versions.json', CACHE_CONTROL_INDEX],
  ['catalog.json', CACHE_CONTROL_INDEX],
  ['ai-chat/releases.json', CACHE_CONTROL_INDEX],
  ['crm/changelog.json', CACHE_CONTROL_INDEX],
  ['documents/1.18.0.66/manifest.json', CACHE_CONTROL],
  ['documents/chunks/ep-365-documents-app_007ee2661915d478085c.js', CACHE_CONTROL],
  ['documents/ep-365-documents-loader.js', CACHE_CONTROL],
  ['licenses/abc.json', CACHE_CONTROL],
  ['pages/trust.json.html', CACHE_CONTROL],
  ['ai-office/assets/loader-a042a27a31.js', CACHE_CONTROL_NO_STORE],
  ['ai-office/assets/icon-32.png', CACHE_CONTROL],
  ['ai-office/app/1.0.0.6/app.js', CACHE_CONTROL],
  ['documents/assets/loader-a042a27a31.js', CACHE_CONTROL],
];
let fails = 0;
for (const [p, want] of cases) {
  const got = cacheControlFor(p);
  if (got !== want) { fails++; console.error('FAIL: ' + p + ' -> ' + got + ' (cekano ' + want + ')'); }
}
if (!/s-maxage=\d+/.test(CACHE_CONTROL_INDEX) || !CACHE_CONTROL_INDEX.includes(CACHE_CONTROL)) { fails++; console.error('FAIL: CACHE_CONTROL_INDEX musi nest max-age prohlizece i s-maxage okraje'); }
// E5 (audit jadra 2026-11): co se na CDN NEnahrava – a protipriklady, ktere nahrat MUSI.
const notPublished = ['tools/deploy-blob.mjs', 'tools/trust-keys.json', 'README.md', 'RELEASE.md', 'tour-voice/_zvuky/README.md', '.github/workflows/deploy-azure.yml', '.publish.lock'];
const published = ['documents/trust.json', 'fonts/LICENSE.md', 'doklady-prijate/vendor/tesseract-5.1.1/LICENSE-tesseract.js.md', 'versions.json', 'crm/tools/x.js', 'docs/RELEASE.md'];
for (const p of notPublished) if (isPublished(p)) { fails++; console.error('FAIL: ' + p + ' by se nahral na CDN'); }
for (const p of published) if (!isPublished(p)) { fails++; console.error('FAIL: ' + p + ' by na CDN chybel'); }
if (fails) { console.error('azure-blob-cache: ' + fails + ' selhani'); process.exit(1); }
console.log('azure-blob-cache: OK (' + cases.length + ' cest)');
