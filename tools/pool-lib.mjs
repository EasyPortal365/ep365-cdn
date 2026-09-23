/**
 * pool-lib.mjs — pravidla SDILENEHO ULOZISTE runtime verzi (`<app>/chunks/`).
 *
 * PROC EXISTUJE
 *   Kazda runtime verze (`<app>/<verze>/`) dosud nesla CELOU sadu souboru: manifest, bundle
 *   knihovny a vsechny lazy chunky (mermaid, xlsx, mammoth, ...). Chunky se mezi verzemi
 *   vetsinou nemeni, takze se na CDN ukladaly znovu a znovu - na Pages (limit ~1 GB) to byla
 *   petina obsahu. Nove verze proto davaji bundle knihovny a chunky do sdileneho uloziste
 *   `<app>/chunks/`; ve verzni slozce zustava jen `manifest.json`, jehoz
 *   `internalModuleBaseUrls` miri do uloziste. Webpack runtime knihovny sklada adresu chunku
 *   z adresy, odkud se nacetl bundle (`document.currentScript`), takze chunky jdou z uloziste
 *   samy - bez zmeny loaderu, .sppkg i kodu appky.
 *
 * PROC JEDEN SOUBOR PRO PUBLIKACI I PROREZ
 *   Publikace (`pool-version.mjs`) rozhoduje, co do uloziste smi. Prorez (`prune-versions.mjs`)
 *   rozhoduje, co z nej smi pryc. Kdyby kazdy mel vlastni kopii pravidla "jak se pozna odkaz",
 *   rozesly by se - a rozejiti = smazany chunk verze, na ktere nekdo visi (tvar lekce 56).
 *   Publikace proto do uloziste pusti jen verzi, jejiz odkazy umi najit PRESNE TAHLE funkce
 *   `reachable()`; prorez pak znackuje touz funkci. Co publikace nepusti, jde postaru.
 *
 * PRAVIDLA ULOZISTE
 *   - Jmeno souboru nese 20-hex content hash webpacku (`..._<hash>.js`). Stejne jmeno smi mit
 *     jen stejny obsah: soubor, ktery uz v HEAD je, se NIKDY neprepisuje. Jiny obsah pod
 *     stejnym jmenem = konflikt -> verze jde postaru (vsechno ve verzni slozce).
 *     Pozor: SPFx ma `realContentHash: false`, hash se pocita PRED minifikaci. Stejne jmeno
 *     tedy obsah nezarucuje z konstrukce (jiny minifikator = jine bajty pod stejnym jmenem) -
 *     proto se porovnava obsah, ne jmeno.
 *   - Uloziste je PER APPKA pod `<app>/`: SharePoint posila CSP `script-src` s adresari
 *     appek (`https://cdn.easyportal365.cz/<app>/`), skript mimo ne by se nespustil
 *     (lekce 86). Spolecne uloziste pro vic appek by proto neprojde.
 *   - Slozka se jmenuje `chunks`, ne `_chunks`: Jekyll slozky s podtrzitkem nepublikuje.
 *     Dnes ho vypina `.nojekyll`, ale uloziste nema stat na teto jedine pojistce.
 *
 * Vystupy jsou ASCII (konzole PS 5.1 rozsype diakritiku).
 */
import fs from 'node:fs';
import path from 'node:path';

export const CDN_URL = 'https://cdn.easyportal365.cz/';
export const POOL_DIR = 'chunks';
/** Holy 20-hex hash; lookaround misto \b: pred hashem byva '_' (slovni znak), lekce 23.7. */
export const HASH_RE = /(?<![0-9a-f])[0-9a-f]{20}(?![0-9a-f])/g;
/** Do uloziste smi jen jmeno s content hashem a bez cesty. */
export const POOL_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*_([0-9a-f]{20})\.js$/;
export const VER_RE = /^\d+(\.\d+){1,3}$/;

export function poolUrl(app) { return CDN_URL + app + '/' + POOL_DIR + '/'; }
export function versionUrl(app, ver) { return CDN_URL + app + '/' + ver + '/'; }
export function hashOf(name) { const m = POOL_NAME_RE.exec(name); return m ? m[1] : null; }

/**
 * Odkazy manifestu SPFx knihovny. Hodi vyjimku, kdyz manifest nema ocekavany tvar -
 * volajici to MUSI brat jako "nevim", ne jako "nic neodkazuje".
 */
export function manifestRefs(text) {
  const m = JSON.parse(text);
  const lc = m && m.loaderConfig;
  if (!lc || !Array.isArray(lc.internalModuleBaseUrls) || lc.internalModuleBaseUrls.length < 1) {
    throw new Error('manifest nema loaderConfig.internalModuleBaseUrls');
  }
  const sr = lc.scriptResources;
  const entry = lc.entryModuleId;
  if (!sr || typeof sr !== 'object' || !entry || !sr[entry] || sr[entry].type !== 'path' || !sr[entry].path) {
    throw new Error('manifest nema vstupni scriptResources typu path');
  }
  const paths = Object.keys(sr).filter(k => sr[k] && sr[k].type === 'path').map(k => String(sr[k].path));
  return { baseUrls: lc.internalModuleBaseUrls.map(String), entryPath: String(sr[entry].path), paths };
}

/**
 * Tranzitivni dosazitelnost pres HOLY 20-hex hash (webpack sklada jmeno chunku ze dvou map,
 * cele jmeno v bundlu neni - lekce 23.7). Falesna shoda hashe = soubor navic = bezpecny smer.
 *   roots    ... jmena souboru, ze kterych se zacina
 *   byHash   ... Map hash -> jmeno souboru v ulozisti
 *   readText ... jmeno -> text souboru, nebo null
 */
export function reachable(roots, byHash, readText) {
  const marked = new Set();
  const queue = Array.from(roots);
  while (queue.length) {
    const f = queue.pop();
    if (marked.has(f)) continue;
    marked.add(f);
    const txt = readText(f);
    if (txt == null) continue;
    for (const h of txt.match(HASH_RE) || []) {
      const t = byHash.get(h);
      if (t && !marked.has(t)) queue.push(t);
    }
  }
  return marked;
}

/**
 * Plan prorezu uloziste JEDNE appky. Koreny = soubory, na ktere miri manifesty verzi,
 * ktere po prorezu ZUSTANOU (`keptVersions`: ostre, pinute, okno --keep, netrackovane
 * i verze, ktere jsou jen v HEAD). Fail-closed:
 *   - manifest nejde precist / ma neznamy tvar / cizi internalModuleBaseUrls
 *     = nevime, co odkazuje -> 'unknown', z uloziste se NEMAZE NIC,
 *   - verze miri na soubor, ktery v ulozisti neni -> 'dead' (rozbita verze), NEMAZE se nic,
 *   - nezavisla kontrola (indexOf, bez regexu) najde odkaz na mazany soubor -> 'verify-failed'.
 *
 * `opts.manifestTexts(v)` = VSECHNY texty manifestu verze, ktere plati (disk i HEAD - Pages
 * servíruje HEAD, takze lokalne smazany nebo zmeneny manifest v HEAD porad odkazuje);
 * [] = verze manifest NEMA nikde (prazdna slozka po prorezu - nic nenacte, nic neodkazuje);
 * null = nevime (chyba cteni) -> 'unknown'. Bez `opts` se cte jen disk.
 * Vraci { state, files, marked, sweep, reasons }.
 */
export function planPoolSweep(appDir, app, keptVersions, opts) {
  const poolDir = path.join(appDir, POOL_DIR);
  const res = { state: 'none', files: [], marked: new Set(), sweep: [], reasons: [] };
  if (!fs.existsSync(poolDir)) return res;
  const files = fs.readdirSync(poolDir, { withFileTypes: true })
    .filter(e => e.isFile() && e.name.endsWith('.js')).map(e => e.name).sort();
  res.files = files;
  if (!keptVersions.length) {
    res.state = 'unknown';
    res.reasons.push('uloziste existuje, ale zadna verze nezustava - podezrely stav, nemazu nic');
    return res;
  }
  const byHash = new Map();
  for (const f of files) { const h = hashOf(f); if (h) byHash.set(h, f); }
  // Necitelny soubor NENI "bez odkazu": jeho odkazy nezname, takze by se mohl smazat chunk,
  // na ktery miri. Kazde selhani cteni se zapise a plan pak skonci jako 'unknown' (lekce 18.1).
  const readFailed = [];
  const readText = (name) => {
    try { return fs.readFileSync(path.join(poolDir, name), 'utf8'); }
    catch (e) { readFailed.push(name); return null; }
  };

  const manifestTexts = (opts && opts.manifestTexts) || ((v) => {
    const mf = path.join(appDir, v, 'manifest.json');
    if (!fs.existsSync(mf)) return [];
    try { return [fs.readFileSync(mf, 'utf8')]; } catch (e) { return null; }
  });
  const roots = new Set();
  const pooledManifests = [];
  const dead = [];
  for (const v of keptVersions) {
    const texts = manifestTexts(v);
    if (texts === null) { res.reasons.push(v + ': manifest.json nejde precist'); continue; }
    for (const text of texts) {
      let refs = null;
      try { refs = manifestRefs(text); } catch (e) { res.reasons.push(v + ': ' + e.message); continue; }
      const base = refs.baseUrls[0];
      if (base === versionUrl(app, v)) continue;            // samostatna verze - uloziste nepouziva
      if (base !== poolUrl(app)) { res.reasons.push(v + ': neznamy internalModuleBaseUrls ' + base); continue; }
      pooledManifests.push(text);
      for (const p of refs.paths) {
        if (files.indexOf(p) === -1) dead.push(v + ' -> ' + p); else roots.add(p);
      }
    }
  }
  if (res.reasons.length) { res.state = 'unknown'; return res; }
  if (dead.length) { res.state = 'dead'; res.reasons = dead; return res; }

  // Nahradni hodnota lezi MIMO region schvalne: kdyz se region vystrihne (protipriklad
  // v check-chunk-pool.mjs), zustanou oznacene jen koreny - a prave ten rozdil test meri.
  let marked = new Set(roots);
  // #region POOL-MARK
  marked = reachable(roots, byHash, readText);
  // #endregion POOL-MARK
  res.marked = marked;
  res.sweep = files.filter(f => !marked.has(f));

  let bad = [];
  // #region POOL-VERIFY
  // Druhy, NEZAVISLY pruchod jinou metodou (holy indexOf, zadny regex): mazany soubor
  // nesmi byt odkazovan z niceho, co zustava. Regex se uz jednou spletl (lekce 23.7).
  const keptTexts = pooledManifests.slice();
  marked.forEach(f => { const t = readText(f); if (t != null) keptTexts.push(t); });
  bad = [];
  for (const f of res.sweep) {
    const h = hashOf(f);
    const hit = keptTexts.some(t => t.indexOf(f) !== -1 || (h && t.indexOf(h) !== -1));
    if (hit) bad.push(f);
  }
  // #endregion POOL-VERIFY
  if (readFailed.length) { res.state = 'unknown'; res.reasons = readFailed.map(f => f + ': soubor v ulozisti nejde precist'); res.sweep = []; return res; }
  if (bad.length) { res.state = 'verify-failed'; res.reasons = bad.map(f => f + ' je porad odkazovan z ponechaneho souboru'); return res; }
  res.state = 'ok';
  return res;
}
