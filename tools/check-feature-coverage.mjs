#!/usr/bin/env node
// EP365 - brana pokryti: nova funkce = napoveda + pruvodce + testovaci data
//
// PROC: "hotovo" v EP365 znamena kod + overeni + karta v `pending` + stav dluhu + vydani.
// Napoveda v appce (DS 10.77), pruvodce TourGuide (DS 10.51) a testovaci data s lekcemi
// (DS 10.24) jsou soucast funkce, ne dodatek - a presto se opakovane dohanely az tesne
// pred ostrym vydanim, kdy uz karty rikaly zakaznikovi, co je nove. Tenhle skript to meri
// MISTO pameti: vezme `pending` z CHANGELOG.json appky a zjisti, jestli se od tiche verze
// nejstarsi karty v repu vubec sahlo na soubory napovedy, pruvodce a testovacich dat.
//
// CO PRESNE MERI
//   Okno = commity od posledni NIZSI verze pred nejstarsim `since` az po HEAD. Pocita se
//   jen COMMITNUTE (necommitnute zmeny se vypisi, ale nepocitaji - build jde z commitu).
//   Verze se hleda v historii config/app-version.json: jeden `git log -p` nad souborem
//   (pickaxe na retezec verze pro vsechny verze naraz) rekne, ktery commit kterou verzi
//   zavedl (bump). Proc okno nezacina az bumpem: kod tiche verze vznika PRED bumpem (bump
//   byva posledni commit pred buildem) - okno od bumpu by praci na verzi nevidelo. Proc
//   "nizsi", ne "predchozi": verze se obcas precisluje zpet (1.13.0.0 -> 1.14.0.0 -> 1.13.0.1)
//   a prace na ni lezi v commitu s tim vyssim cislem. Verze starsi nez runtime verze
//   (2026-08) se dohleda pickaxe v package-solution.json.
//   Zadna karta nema since -> okno od posledniho ostreho vydani (<rada>.0.0). Rucne: --base.
//
//   Oblast je POZADOVANA, kdyz ji aspon jedna karta nevyjima (viz vyjimka nize).
//   Exit 1 = aspon jedna pozadovana oblast se v okne nezmenila (nebo v appce chybi).
//   Je to SOUHRNNA mira za okno - zmena napovedy u jedne funkce "pokryje" i jinou.
//   U kazde karty se proto navic ukaze, co se zmenilo od JEJIHO since (jen informace,
//   o vysledku nerozhoduje).
//   MEZ: u prvniho vydani nove appky (since = verze z prvniho commitu) je okno cela historie
//   a mereni degeneruje na "oblast v appce existuje" - napoveda zkopirovana ze sablony
//   projde. Obsah prvni verze napovedy a pruvodce proto hlidej pri review, ne timhle.
//
// KDE JE NAPOVEDA, PRUVODCE A TESTOVACI DATA (zmereno nad 20 appkami flotily 2026-09-23)
//   Jedno pravidlo pro vsechny appky; hleda se jen pod src/, bez testu, stylu a .d.ts:
//     napoveda  = slozka help/ NEBO slovo "help" v nazvu souboru (camelCase slova):
//                 HelpView.tsx vsude; obsah v views/help/* (vetsina), components/help/*
//                 (fleet, ai-chat, mydocs), views/helpContent.tsx (atlas), homepage ma
//                 HelpView primo ve views/. "helpers" ani "Helpdesk" slovo "help" NEJSOU.
//     pruvodce  = slozka tour/ NEBO slovo "tour" v nazvu, ale BEZ slova "state"
//                 (TourStateService / useTourState jen pamatuji, kdo pruvodce videl).
//     test.data = slozka seed/ NEBO slova "seed" / "sample" / "demo" v nazvu:
//                 SeedService.ts (vetsina), services/seed/* (fleet), CrmSeedService +
//                 crmSeedData + demoDocxTemplate (crm), IdentitySeedService (identity),
//                 data/seedData (lifecenter), governance/govDemo (atlas), SampleDataService
//                 (ai-chat), SeedSection.tsx (mydocs, products).
//   Co pravidlo nepokryje, je v APP_MAP nize i s duvodem. `--files` vypise, co skript
//   v appce za kterou oblast povazuje - pouzij pri kazde uprave pravidla nebo mapy.
//
// VYJIMKA KARTY (tvar a validace v changelog-rules.mjs -> parseDocs)
//   "docs": "n/a"                            karta nepotrebuje zadnou oblast
//   "docs": {"tour": "n/a", "seed": "n/a"}   nepotrebuje jen vyjmenovane (help|tour|seed|lessons)
//   Pole je interni jako `since` - promote-release ho do zakaznicke karty nekopiruje.
//
// KDY SE POUSTI
//   * OSTRE VYDANI - tvrda brana: promote-release.mjs ji pousti PRED slozenim karty a pri
//     mezere skonci bez zapisu. Vedome obejiti: --skip-coverage "duvod" (duvod se vypise).
//   * TICHE VYDANI - brana se nevola: publish-cdn.ps1 zije v app repech a tiche buildy
//     zamerne nebrzdi. Skript jde ale pustit KDYKOLI rucne jako VAROVANI - po dokonceni
//     funkce nebo pri /wrap-up - at se mezera nezjisti az pri povyseni rady:
//        node tools/check-feature-coverage.mjs <app>
//
// POUZITI (z korene ep365-cdn)
//   node tools/check-feature-coverage.mjs worklog
//   node tools/check-feature-coverage.mjs ai-chat crm atlas    # vic appek + souhrnna tabulka
//   node tools/check-feature-coverage.mjs --all                # vsechny appky s neprazdnym pending
//   node tools/check-feature-coverage.mjs crm --repo "<cesta k worktree>"
//   node tools/check-feature-coverage.mjs crm --json           # 1 appka = objekt, vic = pole
//   node tools/check-feature-coverage.mjs crm --files          # soubory appky po oblastech
//   node tools/check-feature-coverage.mjs crm --base <commit>  # rucni zacatek okna
//
// NAVRATOVY KOD: 0 = pokryto / nic k vydani, 1 = mezera, 2 = nepodarilo se zmerit (chybi
// repo, rozbity CHANGELOG, since neni v historii verze). 2 NENI "ok" - brana, ktera nic
// nezmerila, nesmi hlasit pokryti.
// Test: node tools/check-feature-coverage.test.mjs (mini-repa v TEMPu vcetne sabotaze).
// Vystup je ASCII - konzole PS 5.1 rozsype diakritiku.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseDocs } from './changelog-rules.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const APPS_ROOT = resolve(__dirname, '..', '..');
const NUL = String.fromCharCode(0);
const VERSION_RE = /^\d+(\.\d+){1,3}$/;

// ── Oblasti ──────────────────────────────────────────────────────────────────
// `id` je klic vyjimky "docs" (changelog-rules.mjs, DOCS_AREAS) - novou oblast pridej i tam.
export const AREAS = [
  { id: 'help', label: 'napoveda', ds: 'DS 10.77' },
  { id: 'tour', label: 'pruvodce', ds: 'DS 10.51' },
  { id: 'seed', label: 'testovaci data', ds: 'DS 10.24' },
];

// ── Mapa vyjimek: kde se appka od obecneho pravidla lisi ─────────────────────
//   areas  = oblast navic (jen tahle appka ji ma)
//   extra  = soubor navic do existujici oblasti (regex nad cestou od korene repa)
//   na     = oblast se appky netyka (musi mit duvod v `note`)
//   note   = vypise se u vysledku, at je videt, proc appka meri jinak
export const APP_MAP = {
  'ep365-ai-chat': {
    areas: [{ id: 'lessons', label: 'lekce', ds: 'DS 10.24', match: [/\/data\/lessons\.tsx?$/] }],
    note: 'ctvrta oblast "lekce": nova funkce = nova lekce (DS 10.24); obsah lekci je data/lessons.ts',
  },
  'ep365-injuries': {
    extra: { help: [/\/components\/views\/GuideView\.tsx$/] },
    note: 'rozcestnik "Co se kde dela" (GuideView.tsx) je uvodni vyklad agendy - pocita se do napovedy',
  },
  'ep365-mydocs': {
    note: 'testovaci data vytvari MatrixService.seedDemo(); soubor nese i zbytek sluzby, proto se NEPOCITA'
      + ' (pocita se jen SeedSection.tsx) - upraveny seed v MatrixService je treba dolozit rucne',
  },
  'ep365-quick-actions': {
    na: ['help', 'tour', 'seed'],
    note: 'tenant-wide rozsireni (kontextove akce v knihovne, DS 10.84) bez vlastni obrazovky -'
      + ' napoveda, pruvodce ani testovaci data se ho netykaji',
  },
};

// ── Klasifikace souboru ──────────────────────────────────────────────────────
const camelWords = s => s.match(/[A-Z]+(?![a-z])|[A-Z]?[a-z0-9]+/g) || [];

function isNoise(p) {
  return /\.(test|spec)\.[cm]?[jt]sx?$/i.test(p) || /\/__(tests|mocks|snapshots)__\//i.test(p)
    || /\.(s?css|less)(\.ts)?$/i.test(p) || /\.d\.ts$/i.test(p);
}

/** Obecne pravidlo (plati pro vsechny appky). Cesta od korene repa, lomitka libovolna. */
export function genericAreas(path) {
  const p = String(path).split('\\').join('/');
  if (p.indexOf('src/') !== 0 || isNoise(p)) return [];
  const segs = p.split('/');
  const file = segs.pop();
  const dirs = segs.slice(1).map(s => s.toLowerCase());
  const words = file.replace(/\.[^.]+$/, '').split(/[^A-Za-z0-9]+/)
    .reduce((acc, s) => acc.concat(camelWords(s)), []).map(w => w.toLowerCase());
  const has = (arr, list) => list.some(w => arr.indexOf(w) !== -1);
  const out = [];
  if (has(dirs, ['help']) || has(words, ['help'])) out.push('help');
  if ((has(dirs, ['tour']) || has(words, ['tour'])) && !has(words, ['state'])) out.push('tour');
  if (has(dirs, ['seed', 'seeds', 'sample', 'samples', 'demo']) || has(words, ['seed', 'sample', 'demo'])) out.push('seed');
  return out;
}

/** Oblasti a klasifikator konkretni appky = obecne pravidlo + APP_MAP. */
export function appProfile(app) {
  const cfg = APP_MAP[app] || {};
  const na = cfg.na || [];
  const areas = AREAS.concat(cfg.areas || []).map(a => ({ id: a.id, label: a.label, ds: a.ds, na: na.indexOf(a.id) !== -1 }));
  const classify = path => {
    const p = String(path).split('\\').join('/');
    const hits = genericAreas(p);
    if (p.indexOf('src/') !== 0 || isNoise(p)) return hits;
    for (const a of cfg.areas || []) {
      if (a.match.some(r => r.test(p)) && hits.indexOf(a.id) === -1) hits.push(a.id);
    }
    const extra = cfg.extra || {};
    for (const id of Object.keys(extra)) {
      if (extra[id].some(r => r.test(p)) && hits.indexOf(id) === -1) hits.push(id);
    }
    return hits;
  };
  return { areas, classify, note: cfg.note || null };
}

// ── Pomocne ──────────────────────────────────────────────────────────────────
export function normalizeApp(a) {
  const s = String(a || '').trim();
  return s.indexOf('ep365-') === 0 ? s : 'ep365-' + s;
}

const TYPO = {
  0x2013: '-', 0x2014: '-', 0x2212: '-', 0x201E: '"', 0x201C: '"', 0x201D: '"', 0x00AB: '"', 0x00BB: '"',
  0x201A: "'", 0x2018: "'", 0x2019: "'", 0x2026: '...', 0x00A0: ' ', 0x202F: ' ', 0x00D7: 'x', 0x2192: '->',
};

/** ASCII pro konzoli PS 5.1: diakritika pryc, typograficke znaky na ASCII, zbytek '?'. */
export function ascii(s) {
  const t = String(s == null ? '' : s).normalize('NFD');
  let out = '';
  for (let i = 0; i < t.length; i++) {
    const c = t.charCodeAt(i);
    if (c >= 0x20 && c <= 0x7e) out += t[i];
    else if (c >= 0x300 && c <= 0x36f) continue;          // kombinujici diakritika po NFD
    else out += TYPO[c] !== undefined ? TYPO[c] : '?';
  }
  return out;
}

/** JSON s ne-ASCII znaky jako escape sekvencemi - platny JSON a citelny i v PS 5.1. */
function jsonAscii(obj) {
  const s = JSON.stringify(obj, null, 2);
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    out += c > 0x7e ? '\\u' + c.toString(16).padStart(4, '0') : s[i];
  }
  return out;
}

function parseJson(txt) {
  if (txt == null) return null;
  const t = txt.charCodeAt(0) === 0xFEFF ? txt.slice(1) : txt;
  try { return JSON.parse(t); } catch (e) { return null; }
}

function cmpVer(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d;
  }
  return 0;
}

// safe.directory: skript jen CTE, a appky se buildi i pod druhym Windows uctem, kde by
// git repo jineho vlastnika odmitl ("dubious ownership") a brana by skoncila exit 2.
// core.quotepath=off: cesta s diakritikou by jinak prisla v uvozovkach s oktalovymi escapy
// a klasifikace (prefix src/) by ji tise minula.
function gitRunner(dir) {
  const safe = resolve(dir).split('\\').join('/');
  return (args, opt = {}) => {
    try {
      return execFileSync('git', ['-c', 'safe.directory=' + safe, '-c', 'core.quotepath=off', '-C', dir].concat(args), {
        encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (e) {
      if (opt.soft) return null;
      const why = String((e.stderr && String(e.stderr)) || e.message || e).trim().split(/\r?\n/)[0];
      throw new Error('git ' + args.slice(0, 2).join(' ') + ' selhal: ' + why);
    }
  };
}

// ── Okno ─────────────────────────────────────────────────────────────────────
// Historie verze v JEDNOM pruchodu: `git log -p` nad config/app-version.json a z pridanych
// radku "version" se vycte, ktery commit kterou verzi zavedl. Je to pickaxe na retezec
// verze pro vsechny verze naraz - samostatne `git log -S` pro kazde since stalo u appky
// s 24 tichymi verzemi v pending pres 20 s.
function versionHistory(git) {
  const out = git(['log', '--topo-order', '--format=#C# %H %P', '-p', '--unified=0', '--no-color', '--no-ext-diff',
    '--', 'config/app-version.json'], { soft: true }) || '';
  const hist = [];
  let cur = null;
  for (const line of out.split(/\r?\n/)) {
    if (line.indexOf('#C# ') === 0) {
      const ids = line.slice(4).trim().split(/\s+/);
      cur = { commit: ids[0], parents: ids.slice(1), version: null };
      hist.push(cur);
    } else if (cur && cur.version === null && line.charAt(0) === '+') {
      const m = /"version"\s*:\s*"([^"]*)"/.exec(line);
      if (m) cur.version = m[1];
    }
  }
  return hist.filter(h => h.version !== null);        // nejnovejsi prvni; jen commity, ktere verzi ZMENILY
}

/**
 * Bump na verzi `ver` = commit, ktery ji ZAVEDL (nejstarsi vyskyt), a zacatek okna =
 * posledni zmena na verzi NIZSI nez `ver` (kod tiche verze vznika pred bumpem).
 * null = verze v historii neni.
 */
function findBump(git, hist, ver) {
  for (let i = hist.length - 1; i >= 0; i--) {
    if (hist[i].version !== ver) continue;
    // Prosta predchozi zmena verze nestaci: bump na vyssi cislo, ktere se pak precislovalo
    // zpet (naostro 1.13.0.0 -> 1.14.0.0 -> 1.13.0.1), by z okna vyradil prave commit
    // s praci na te verzi. Proto se preskoci vse, co neni nizsi.
    let j = i + 1;
    while (j < hist.length && VERSION_RE.test(hist[j].version) && cmpVer(hist[j].version, ver) >= 0) j++;
    // Zadna nizsi verze v app-version.json: soubor vznikl s touhle (nebo vyssi) verzi a ta
    // predchozi zila v package-solution.json -> okno od rodice prvni zmeny; koren -> cela historie.
    return { commit: hist[i].commit, base: j < hist.length ? hist[j].commit : (hist[hist.length - 1].parents[0] || null) };
  }
  // Pred runtime verzemi (2026-08) nesl verzi jen package-solution.json - pomala cesta pres pickaxe.
  const vf = 'config/package-solution.json';
  const out = git(['log', '--format=%H %P', '-S"' + ver + '"', '--', vf], { soft: true }) || '';
  for (const line of out.split(/\r?\n/).filter(Boolean).reverse()) {
    const ids = line.trim().split(/\s+/);
    const j = parseJson(git(['show', ids[0] + ':' + vf], { soft: true }));
    if (!j || !j.solution || j.solution.version !== ver) continue;   // pickaxe hlasi i ODSTRANENI verze
    const prev = ids[1] ? (git(['log', '-1', '--format=%H', ids[1], '--', vf], { soft: true }) || '').trim() : '';
    return { commit: ids[0], base: ids[1] ? (prev || ids[1]) : null };
  }
  return null;
}

/** Commity okna s dotcenymi soubory, nejnovejsi prvni (base null = cela historie). */
function windowLog(git, base) {
  const out = git(['log', '--topo-order', '--format=#C# %H', '--name-only', '--no-renames', '--diff-merges=first-parent',
    base ? base + '..HEAD' : 'HEAD']);
  const commits = [];
  for (const line of out.split(/\r?\n/)) {
    if (line.indexOf('#C# ') === 0) commits.push({ commit: line.slice(4).trim(), files: [] });
    else if (line && commits.length) commits[commits.length - 1].files.push(line);
  }
  return commits;
}

function srcFilesOf(commits) {
  const set = new Set();
  for (const c of commits) for (const f of c.files) if (f.indexOf('src/') === 0) set.add(f);
  return Array.from(set).sort();
}

function commitInfos(git, ids, verOf) {
  const want = ids.filter(Boolean);
  const map = {};
  if (!want.length) return map;
  const out = git(['log', '--no-walk=unsorted', '--format=%H%x09%h%x09%ad%x09%s', '--date=short'].concat(want), { soft: true }) || '';
  for (const line of out.split(/\r?\n/).filter(Boolean)) {
    const p = line.split('\t');
    map[p[0]] = { commit: p[0], short: p[1], date: p[2], subject: p.slice(3).join('\t'), version: verOf[p[0]] || null };
  }
  return map;
}

function uncommittedFiles(git) {
  const out = git(['status', '--porcelain', '-z', '--untracked-files=all', '--', 'src'], { soft: true }) || '';
  const parts = out.split(NUL);
  const files = [];
  for (let i = 0; i < parts.length; i++) {
    const e = parts[i];
    if (e.length < 4) continue;
    files.push(e.slice(3));
    if (e[0] === 'R' || e[0] === 'C') i++;                // u prejmenovani nasleduje puvodni cesta
  }
  return files;
}

// ── Mereni ───────────────────────────────────────────────────────────────────
/**
 * @param opts.app       appka ('worklog' i 'ep365-worklog')
 * @param opts.repo      cesta k repu (default <EP365 Apps>/ep365-<app>; worktree jde taky)
 * @param opts.data      uz nacteny CHANGELOG.json (promote-release predava svuj, at meri TYZ pending)
 * @param opts.base      rucni zacatek okna (commit)
 * @param opts.withFiles pridat do vysledku seznam souboru oblasti v HEAD
 * @returns vysledek; `exit` 0 = pokryto / prazdne, 1 = mezera, 2 = nezmereno
 */
export function checkFeatureCoverage(opts) {
  const app = normalizeApp(opts.app);
  const r = {
    app, repo: null, status: null, exit: null, error: null, head: null, window: null, notes: [],
    areas: [], missing: [], cards: { total: 0, byType: {}, exempt: 0, invalid: [], open: [] },
  };
  const stop = msg => Object.assign(r, { status: 'error', exit: 2, error: msg });
  try {
    const dir = opts.repo ? resolve(opts.repo) : join(APPS_ROOT, app);
    if (!existsSync(dir)) return stop('repo nenalezeno: ' + dir);
    const top = (gitRunner(dir)(['rev-parse', '--show-toplevel'], { soft: true }) || '').trim();
    if (!top) return stop('neni git repo (nebo git chybi): ' + dir);
    r.repo = resolve(top);
    const git = gitRunner(r.repo);

    let data = opts.data;
    if (!data) {
      const p = join(r.repo, 'CHANGELOG.json');
      if (!existsSync(p)) return stop('CHANGELOG.json nenalezen v ' + r.repo);
      let txt = readFileSync(p, 'utf8');
      if (txt.charCodeAt(0) === 0xFEFF) txt = txt.slice(1);
      try { data = JSON.parse(txt); } catch (e) { return stop('CHANGELOG.json neni validni JSON: ' + e.message); }
    }
    if (data.pending !== undefined && !Array.isArray(data.pending)) {
      return stop('pending neni pole - objektovy tvar je ticha ztrata (changelog-rules.mjs)');
    }
    const pending = data.pending || [];

    const headId = (git(['rev-parse', '--verify', '--quiet', 'HEAD'], { soft: true }) || '').trim();
    if (!headId) return stop('repo nema zadny commit');
    const hist = versionHistory(git);
    const verOf = {};
    for (const h of hist) verOf[h.commit] = h.version;

    const prof = appProfile(app);
    if (prof.note) r.notes.push(prof.note);

    r.cards.total = pending.length;
    for (const c of pending) r.cards.byType[c.type] = (r.cards.byType[c.type] || 0) + 1;

    const docsOf = pending.map(c => parseDocs(c.docs));
    docsOf.forEach((d, i) => {
      if (d.invalid) r.cards.invalid.push({ since: pending[i].since || null, text: pending[i].cs || '', why: d.invalid });
    });
    r.cards.exempt = docsOf.filter(d => d.all).length;

    // Zacatek okna
    const bumps = {};
    const bumpOf = v => (bumps[v] !== undefined ? bumps[v] : (bumps[v] = findBump(git, hist, v)));
    let base = null; let how = null; let since = null; let intro = null;
    if (!pending.length) {
      how = 'none';
    } else if (opts.base) {
      base = (git(['rev-parse', '--verify', '--quiet', opts.base + '^{commit}'], { soft: true }) || '').trim();
      if (!base) return stop('--base ' + opts.base + ' neni commit v ' + r.repo);
      how = 'manual';
    } else {
      const sinces = pending.map(c => c.since).filter(s => typeof s === 'string' && VERSION_RE.test(s));
      if (sinces.length) {
        since = sinces.slice().sort(cmpVer)[0];
        const b = bumpOf(since);
        if (!b) {
          return stop('tichou verzi ' + since + ' (nejstarsi since v pending) historie config/app-version.json'
            + ' ani package-solution.json nezna - bump neni commitnuty, nebo je since preklep. Rucne: --base <commit>');
        }
        intro = b.commit; base = b.base; how = 'since';
      } else {
        const series = (data.entries || []).map(e => e && e.version).filter(v => /^\d+\.\d+$/.test(v || '')).sort(cmpVer).pop();
        if (!series) return stop('zadna karta v pending nema since a CHANGELOG nema vydanou radu - zacatek okna nelze urcit. Rucne: --base <commit>');
        since = series + '.0.0';
        const b = bumpOf(since);
        if (!b) return stop('zadna karta nema since a verze ' + since + ' (posledni ostre vydani) neni v historii config/app-version.json. Rucne: --base <commit>');
        intro = b.commit; base = b.commit; how = 'release';
      }
    }

    const info = commitInfos(git, [headId, intro, base], verOf);
    r.head = info[headId] || { commit: headId, short: headId.slice(0, 7), date: '', subject: '', version: null };
    r.head.version = hist.length ? hist[0].version : r.head.version;
    if (!pending.length) return Object.assign(r, { status: 'empty', exit: 0 });
    r.window = { how, since, intro: intro ? info[intro] || null : null, base: base ? info[base] || null : null };

    // Co se v okne zmenilo: jeden `git log --name-only`; okno karty je jeho podmnozina.
    const log = windowLog(git, base);
    const touched = new Map([[base || '', srcFilesOf(log)]]);
    const touchedAfter = b => {
      const key = b || '';
      if (!touched.has(key)) {
        const idx = b ? log.findIndex(c => c.commit === b) : -1;
        touched.set(key, idx !== -1 ? srcFilesOf(log.slice(0, idx)) : srcFilesOf(windowLog(git, b)));
      }
      return touched.get(key);
    };
    const pick = (files, id) => files.filter(f => prof.classify(f).indexOf(id) !== -1);
    const atHead = git(['ls-tree', '-r', '-z', '--name-only', 'HEAD', '--', 'src']).split(NUL).filter(Boolean);
    const changed = touchedAfter(base);
    const dirty = uncommittedFiles(git);

    r.areas = prof.areas.map(a => {
      const files = pick(atHead, a.id);
      return {
        id: a.id, label: a.label, ds: a.ds, na: a.na,
        required: !a.na && docsOf.some(d => d.areas.indexOf(a.id) === -1),
        filesAtHead: files.length,
        files: opts.withFiles ? files : undefined,
        changed: pick(changed, a.id),
        uncommitted: pick(dirty, a.id),
      };
    });
    r.missing = r.areas.filter(a => a.required && (!a.changed.length || !a.filesAtHead)).map(a => a.id);

    // Informativne: co se zmenilo od since KAZDE karty (o exit kodu nerozhoduje).
    pending.forEach((c, i) => {
      const d = docsOf[i];
      if (d.all) return;
      const own = typeof c.since === 'string' && VERSION_RE.test(c.since) ? bumpOf(c.since) : null;
      const flags = {};
      for (const a of r.areas) {
        if (a.na || d.areas.indexOf(a.id) !== -1) flags[a.id] = '.';
        else if (!own) flags[a.id] = '?';
        else flags[a.id] = pick(touchedAfter(own.base), a.id).length ? '+' : '-';
      }
      r.cards.open.push({ since: c.since || null, type: c.type, text: c.cs || c.en || '', partial: d.areas, flags });
    });

    return Object.assign(r, r.missing.length ? { status: 'gap', exit: 1 } : { status: 'ok', exit: 0 });
  } catch (e) {
    return stop(e && e.message ? e.message : String(e));
  }
}

// ── Vypis ────────────────────────────────────────────────────────────────────
const pad = (s, n) => { const t = String(s); return t.length >= n ? t + ' ' : t + ' '.repeat(n - t.length); };
const describe = ci => (ci ? ci.short + ' ' + ci.date + (ci.version ? ' [' + ci.version + ']' : '') + ' ' + ascii(ci.subject).slice(0, 64) : '-');
const shortList = (files, n) => (files.length
  ? files.length + ': ' + files.slice(0, n).map(f => f.split('/').pop()).join(', ') + (files.length > n ? ', ...' : '')
  : '-');

export function formatReport(r, opt = {}) {
  const L = [];
  L.push('check-feature-coverage: ' + r.app + (r.head ? '  (HEAD ' + r.head.short + (r.head.version ? ', verze ' + r.head.version : '') + ')' : ''));
  if (r.repo) L.push('  repo:    ' + ascii(r.repo));
  if (r.status === 'error') {
    L.push('  NELZE ZMERIT: ' + ascii(r.error));
    L.push('  (exit 2 - to NENI "ok": brana, ktera nic nezmerila, nesmi hlasit pokryti)');
    return L;
  }
  const t = r.cards.byType;
  const n = r.cards.total;
  L.push('  pending: ' + n + (n === 1 ? ' karta' : n >= 2 && n <= 4 ? ' karty' : ' karet') + (n
    ? ' (' + Object.keys(t).map(k => ascii(k) + ' ' + t[k]).join(', ') + '), z toho s "docs": "n/a" ' + r.cards.exempt
    : ''));
  for (const note of r.notes) L.push('  mapa vyjimek: ' + ascii(note));
  if (r.status === 'empty') { L.push('  VYSLEDEK: nic k vydani - pending je prazdny.'); return L; }

  const w = r.window;
  if (w.how === 'since') {
    L.push('  okno:    od tiche verze ' + w.since + ' (nejstarsi since v pending) = '
      + (w.base ? 'commity po ' + w.base.short + (w.base.version ? ' [' + w.base.version + ']' : '') + ' az HEAD' : 'cela historie repa'));
    if (w.base) L.push('           zacatek: ' + describe(w.base));
    L.push('           bump:    ' + describe(w.intro) + (w.base ? '' : '  (pred nim zadna nizsi verze)'));
    if (w.base) L.push('           (okno zacina posledni NIZSI verzi, ne bumpem - kod tiche verze vznika pred bumpem)');
  } else if (w.how === 'release') {
    L.push('  okno:    zadna karta nema since -> od posledniho ostreho vydani ' + w.since + ' = zmeny po ' + describe(w.base) + ' az HEAD');
  } else {
    L.push('  okno:    rucne (--base) = zmeny po ' + describe(w.base) + ' az HEAD');
  }
  L.push('');
  L.push('  ' + pad('oblast', 16) + pad('pozadovana', 12) + pad('zmena v okne', 14) + pad('v appce', 9) + 'zmenene soubory');
  for (const a of r.areas) {
    const req = a.na ? 'ne (appka)' : a.required ? 'ano' : 'ne (docs)';
    const ch = a.changed.length ? 'ANO' : 'NE' + (a.required ? ' !' : '');
    L.push('  ' + pad(a.label, 16) + pad(req, 12) + pad(ch, 14) + pad(a.filesAtHead, 9) + shortList(a.changed, 3));
  }
  const dirty = r.areas.filter(a => a.uncommitted.length);
  if (dirty.length) {
    L.push('  pozor: NEcommitnute zmeny se nepocitaji (build jde z commitu): '
      + dirty.map(a => a.label + ' ' + shortList(a.uncommitted, 2)).join('; '));
  }
  if (opt.files) {
    for (const a of r.areas) {
      L.push('');
      L.push('  soubory oblasti "' + a.label + '" v HEAD (' + a.filesAtHead + '):');
      for (const f of a.files || []) L.push('    ' + ascii(f));
      if (a.changed.length) {
        L.push('  zmenene v okne (' + a.changed.length + '):');
        for (const f of a.changed) L.push('    ' + ascii(f));
      }
    }
  }
  for (const x of r.cards.invalid) {
    L.push('  ! neplatna vyjimka "docs" u karty ' + (x.since || '?') + ' "' + ascii(x.text).slice(0, 40) + '...": '
      + ascii(x.why) + ' - pocita se jako BEZ vyjimky');
  }

  const letters = r.areas.map(a => a.label.charAt(0).toUpperCase());
  L.push('');
  L.push('  Karty bez vyjimky: ' + r.cards.open.length + ' z ' + r.cards.total
    + (r.cards.open.length ? '   sloupce ' + letters.join(' ') + ' = ' + r.areas.map(a => a.label).join(' / ') + ' od since TE karty' : ''));
  if (r.cards.open.length) {
    L.push('    ' + pad('since', 12) + pad('typ', 10) + letters.join(' ') + '  text');
    for (const c of r.cards.open) {
      L.push('    ' + pad(c.since || '-', 12) + pad(ascii(c.type), 10) + r.areas.map(a => c.flags[a.id]).join(' ') + '  ' + ascii(c.text).slice(0, 78));
    }
    L.push('    (+ zmena od since karty, - beze zmeny, . vyjimka karty / appky, ? since karty neni v historii verze)');
  }
  L.push('');
  if (r.status === 'ok') {
    L.push(r.areas.some(a => a.required)
      ? '  VYSLEDEK: OK - kazda pozadovana oblast ma v okne zmenu.'
      : '  VYSLEDEK: OK - zadna oblast neni pozadovana (vsechny karty maji vyjimku nebo se appky netykaji).');
    return L;
  }
  const lbl = id => (r.areas.filter(a => a.id === id)[0] || { label: id }).label;
  const absent = r.areas.filter(a => a.required && !a.filesAtHead).map(a => a.label);
  L.push('  VYSLEDEK: MEZERA - pozadovana oblast bez zmeny v okne: ' + r.missing.map(lbl).join(', ') + '  (exit 1)');
  if (absent.length) {
    L.push('    v appce chybi uplne: ' + absent.join(', ') + ' - dopln ji, nebo ji zapis do APP_MAP (tools/check-feature-coverage.mjs) jako "na" s duvodem');
  }
  L.push('    Co s tim (podle skutecnosti, ne podle pohodli):');
  L.push('    1. dopln oblast k novym funkcim a commitni (DS 10.77 napoveda, DS 10.51 pruvodce, DS 10.24 testovaci data a lekce);');
  L.push('    2. karta, ktera oblast opravdu nepotrebuje, dostane v CHANGELOG.json "docs": "n/a" (zadna oblast)');
  L.push('       nebo "docs": {"seed": "n/a"} (jen vyjmenovane: help, tour, seed, lessons);');
  L.push('    3. u ostreho vydani jde brana vedome obejit: promote-release.mjs <app> <X.Y> --skip-coverage "duvod".');
  return L;
}

function formatSummary(results) {
  const ids = [];
  const labels = {};
  for (const r of results) for (const a of r.areas) if (ids.indexOf(a.id) === -1) { ids.push(a.id); labels[a.id] = a.label; }
  const L = [];
  L.push('  ' + pad('appka', 21) + pad('pending', 9) + pad('bez vyj.', 10) + ids.map(id => pad(labels[id], 16)).join('') + 'vysledek');
  for (const r of results) {
    const cells = ids.map(id => {
      const a = r.areas.filter(x => x.id === id)[0];
      if (!a) return pad('', 16);
      if (a.na) return pad('n/a', 16);
      return pad((a.changed.length ? 'ANO' : 'NE') + (r.missing.indexOf(id) !== -1 ? ' !' : '') + (a.required ? '' : ' (docs)'), 16);
    }).join('');
    const verdict = { ok: 'OK', gap: 'MEZERA', empty: 'nic k vydani', error: 'NEZMERENO' }[r.status] || r.status;
    L.push('  ' + pad(r.app, 21) + pad(r.cards.total, 9) + pad(r.status === 'error' ? '-' : r.cards.open.length, 10) + cells + verdict);
  }
  return L;
}

// ── CLI ──────────────────────────────────────────────────────────────────────
const USAGE = [
  'pouziti: node tools/check-feature-coverage.mjs <app> [<app> ...] | --all',
  '         [--repo <cesta>] [--base <commit>] [--json] [--files]',
  'exit: 0 pokryto / nic k vydani, 1 mezera, 2 nezmereno',
];

function parseArgs(argv) {
  const o = { apps: [], all: false, json: false, files: false, repo: null, base: null, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const value = name => {
      const v = argv[i + 1];
      if (v === undefined || v.indexOf('--') === 0) throw new Error(name + ' chce hodnotu');
      i++;
      return v;
    };
    if (a === '--json') o.json = true;
    else if (a === '--files') o.files = true;
    else if (a === '--all') o.all = true;
    else if (a === '--repo') o.repo = value('--repo');
    else if (a.indexOf('--repo=') === 0) o.repo = a.slice(7);
    else if (a === '--base') o.base = value('--base');
    else if (a.indexOf('--base=') === 0) o.base = a.slice(7);
    else if (a === '--help' || a === '-h') o.help = true;
    else if (a.indexOf('-') === 0) throw new Error('neznamy prepinac ' + a);
    else o.apps.push(a);
  }
  return o;
}

/** Appky s NEprazdnym pending; rozbity nebo objektovy pending taky (at se ukaze jako nezmereno). */
function appsWithPending() {
  return readdirSync(APPS_ROOT, { withFileTypes: true })
    .filter(d => d.isDirectory() && d.name.indexOf('ep365-') === 0 && existsSync(join(APPS_ROOT, d.name, 'CHANGELOG.json')))
    .map(d => d.name)
    .filter(n => {
      const j = parseJson(readFileSync(join(APPS_ROOT, n, 'CHANGELOG.json'), 'utf8'));
      if (!j) return true;                                // rozbity JSON -> ukazat jako nezmereno
      if (j.pending === undefined) return false;
      return !Array.isArray(j.pending) || j.pending.length > 0;
    })
    .sort();
}

function main() {
  let o;
  try { o = parseArgs(process.argv.slice(2)); } catch (e) {
    console.error('CHYBA: ' + e.message);
    console.error(USAGE.join('\n'));
    process.exit(2);
  }
  if (o.help) { console.log(USAGE.join('\n')); process.exit(0); }
  if (!o.all && !o.apps.length) { console.error(USAGE.join('\n')); process.exit(2); }
  if (o.all && o.apps.length) { console.error('CHYBA: --all nebo vycet appek, ne oboji'); process.exit(2); }
  const apps = o.all ? appsWithPending() : o.apps.map(normalizeApp);
  if (o.repo && apps.length !== 1) { console.error('CHYBA: --repo jde jen s jednou appkou'); process.exit(2); }
  if (!apps.length) { console.log('Zadna appka nema neprazdny pending - neni co kontrolovat.'); process.exit(0); }

  const results = apps.map(app => checkFeatureCoverage({ app, repo: o.repo, base: o.base, withFiles: o.files }));
  if (o.json) {
    console.log(jsonAscii(results.length === 1 && !o.all ? results[0] : results));
  } else {
    results.forEach((r, i) => {
      if (i) console.log('\n' + '='.repeat(100) + '\n');
      console.log(formatReport(r, { files: o.files }).join('\n'));
    });
    if (results.length > 1) {
      console.log('\n' + '='.repeat(100));
      console.log('SOUHRN (NE ! = pozadovana oblast bez zmeny v okne; (docs) = vsechny karty ji vyjimaji)');
      console.log(formatSummary(results).join('\n'));
    }
  }
  process.exit(results.reduce((m, r) => Math.max(m, r.exit), 0));
}

// Brana `import` (§25.49): promote-release a test tenhle modul IMPORTUJI - CLI smi bezet,
// jen kdyz je skript spusteny primo.
function isMain() {
  if (!process.argv[1]) return false;
  try {
    const me = realpathSync(fileURLToPath(import.meta.url));
    const run = realpathSync(resolve(process.argv[1]));
    return process.platform === 'win32' ? me.toLowerCase() === run.toLowerCase() : me === run;
  } catch (e) {
    return false;
  }
}

if (isMain()) main();
