#!/usr/bin/env node
/**
 * check-pin-guard.mjs — dokazuje, ze pin guard v `prune-versions.mjs` opravdu drzi.
 *
 * CO HLIDA (TECH-DEBT #250)
 *   Piny naseho tenantu miri na TICHE verze, ktere v `<app>/releases.json` z definice
 *   nejsou. Az do 2026-09-01 je chranilo jedine okno `--keep 15` — a to je prokazatelne
 *   uzke: ai-chat vydal 12. 8. za jediny den 27 tichych verzi. Prorez po takovem dni
 *   smaze verzi, na ktere visime, a projevi se to TISE (loader spadne na latest, pin
 *   zustane zapsany a mrtvy).
 *
 *   `prune-versions.mjs` proto cte soupis pinu (`ep365-docs/scripts/pin-state.json`)
 *   a bez nej odmita cokoli smazat. Tenhle skript odpovida na dve otazky:
 *     (1) CHRANI    — nechá prorez verzi, na kterou miri pin, i kdyz je MIMO okno?
 *     (2) NENI TO NO-OP — kdyz se guard vystrihne, smaze ji ten samy prorez?
 *
 *   Otazka (2) je podstatnejsi. Test, ktery projde i bez opravy, nedokazuje nic
 *   (§23.8 bod 2, §66.5). Proto se guard fyzicky vyrizne z KOPIE skutecneho toolu
 *   (markery `#region PIN-GUARD` / `#endregion PIN-GUARD`) a obe varianty bezi nad
 *   IDENTICKYM syntetickym CDN. Rozdil se MERI na DISKU po `--apply`, ne v textu
 *   vypisu — formatovani se muze zmenit, existence adresare ne.
 *
 * KDE SE MAZE
 *   Vyhradne v jednorazovem mini-CDN v TEMPu, ktere si skript sam postavi a po sobe
 *   smaze. Na tohle repo NESAHA (necte ani soupis pinu naseho tenantu).
 *
 * KDY POUSTET
 *   Pred kazdym `prune-versions.mjs --apply` (krok 5.5 v /release; automaticky ho
 *   pousti `prune-cdn.mjs`) a kdykoli se sahne na `prune-versions.mjs`.
 *
 * POUZITI
 *   node tools/check-pin-guard.mjs
 *
 * NAVRATOVY KOD
 *   0 = guard chrani pinutou verzi A je to cim dolozit (protipriklad ji smazal)
 *   1 = cokoli jineho
 *
 * Vystup je schvalne ASCII — konzole PS 5.1 rozsype diakritiku.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';

const TOOLS = path.dirname(fileURLToPath(import.meta.url));
const REAL = path.join(TOOLS, 'prune-versions.mjs');

const KEEP = 15;
const POCET_VERZI = 20;          // 20 verzi, okno 15 -> mimo okno padne 1.0.0.5 az 1.0.0.1
const PIN = '1.0.0.3';           // pozice 18 shora = MIMO okno, a NENI v releases.json
const OSTRA = '1.0.0.1';         // jedine ostre vydani (chranene i bez pinu)
const NECHRANENA = '1.0.0.2';    // mimo okno, neni ostra, neni pinuta -> MUSI zmizet

let chyby = 0;
const ok = (t, m) => { console.log((t ? '  OK   ' : '  CHYBA') + ' ' + m); if (!t) chyby++; return t; };

// ---------------------------------------------------------------- mini-CDN ---
function postavCdn(nazev) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ep365-pinguard-' + nazev + '-'));
  const app = path.join(root, 'demo');
  fs.mkdirSync(path.join(root, 'tools'), { recursive: true });
  for (let i = 1; i <= POCET_VERZI; i++) {
    const v = path.join(app, '1.0.0.' + i);
    fs.mkdirSync(v, { recursive: true });
    fs.writeFileSync(path.join(v, 'manifest.json'), JSON.stringify({ version: '1.0.0.' + i }), 'utf8');
    fs.writeFileSync(path.join(v, 'bundle.js'), '// v1.0.0.' + i + '\n', 'utf8');
  }
  fs.writeFileSync(path.join(app, 'releases.json'), JSON.stringify([{ version: OSTRA }], null, 2), 'utf8');
  // Git je potreba: prorez maze pres `git rm` a netrackovane cesty preskakuje.
  execFileSync('git', ['-C', root, 'init', '-q'], { stdio: 'ignore' });
  execFileSync('git', ['-C', root, 'add', '-A'], { stdio: 'ignore' });
  execFileSync('git', ['-C', root, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', 'seed'], { stdio: 'ignore' });
  return root;
}

// Guard se z KOPIE toolu fyzicky vyrizne. Kdyby markery zmizely nebo rez nic
// neubral, byl by protipriklad tichy no-op — proto se oboji tvrdi nahlas.
function napisVarianty(root) {
  const zdroj = fs.readFileSync(REAL, 'utf8');
  fs.writeFileSync(path.join(root, 'tools', 'prune-versions.mjs'), zdroj, 'utf8');

  const od = zdroj.indexOf('// #region PIN-GUARD');
  const doo = zdroj.indexOf('// #endregion PIN-GUARD');
  if (od === -1 || doo === -1 || doo < od) {
    console.log('  CHYBA markery #region/#endregion PIN-GUARD nenalezeny v ' + REAL + ' - protipriklad nelze postavit');
    chyby++;
    return false;
  }
  const bez = zdroj.slice(0, od) + zdroj.slice(doo + '// #endregion PIN-GUARD'.length);
  if (bez.length >= zdroj.length) { console.log('  CHYBA rez nic neubral'); chyby++; return false; }
  // Kontrola SMEREM DOVNITR: vyriznuty kus musel obsahovat vlastni logiku guardu,
  // a v kopii po nem nesmi zbyt jeho hlaska. (Hlavicka skriptu pin-state.json
  // zminuje dal, a je to spravne — dokumentace se nerezala.)
  const vyriznuto = zdroj.slice(od, doo);
  if (vyriznuto.indexOf('cdnSnapshot') === -1 || vyriznuto.indexOf('PIN GUARD ZASTAVIL PROREZ') === -1) {
    console.log('  CHYBA vyriznuty blok neobsahuje logiku guardu - markery sedi jinde, nez maji'); chyby++; return false;
  }
  if (bez.indexOf('PIN GUARD ZASTAVIL PROREZ') !== -1) { console.log('  CHYBA po rezu v kopii porad zbyva guard'); chyby++; return false; }
  fs.writeFileSync(path.join(root, 'tools', 'prune-versions-noguard.mjs'), bez, 'utf8');
  return true;
}

function pinState(root, over) {
  const zaklad = {
    sweptAt: new Date().toISOString(),
    complete: true,
    websSeen: 30,
    cdnSnapshot: { demo: '1.0.0.' + POCET_VERZI },
    pins: [{ web: '/sites/demo', app: 'demo', version: PIN }]
  };
  const st = Object.assign(zaklad, over || {});
  const f = path.join(root, 'pin-state-' + Math.random().toString(36).slice(2, 8) + '.json');
  fs.writeFileSync(f, JSON.stringify(st, null, 2), 'utf8');
  return f;
}

function spust(root, tool, argy) {
  const r = spawnSync(process.execPath, [path.join(root, 'tools', tool)].concat(argy), { encoding: 'utf8' });
  return { kod: r.status, out: (r.stdout || '') + (r.stderr || '') };
}

const zije = (root, v) => fs.existsSync(path.join(root, 'demo', v));
const uklid = (root) => { try { fs.rmSync(root, { recursive: true, force: true }); } catch (e) { /* TEMP */ } };

// ============================================================== 1. CHRANI ===
console.log('1) Guard chrani pin mimo okno --keep ' + KEEP + ' (skutecny tool, --apply na syntetickem CDN)');
{
  const root = postavCdn('ochrana');
  if (napisVarianty(root)) {
    const ps = pinState(root);
    const r = spust(root, 'prune-versions.mjs', ['--keep', String(KEEP), '--pin-state', ps, '--apply']);
    ok(r.kod === 0, 'prorez dobehl (exit ' + r.kod + ')');
    ok(zije(root, PIN), 'pinuta verze ' + PIN + ' na disku ZUSTALA');
    ok(zije(root, OSTRA), 'ostra verze ' + OSTRA + ' na disku zustala');
    ok(!zije(root, NECHRANENA), 'nechranena verze ' + NECHRANENA + ' smazana (prorez neni no-op)');
    ok(r.out.indexOf('ZACHRANENO PINEM: ' + PIN) !== -1, 'vypis rekl, ze verzi zachranil pin');
  }
  uklid(root);
}

// ======================================================== 2. PROTIPRIKLAD ===
console.log('2) Protipriklad: TYZ vstup s vystrizenym guardem pinutou verzi SMAZE');
{
  const root = postavCdn('protipriklad');
  if (napisVarianty(root)) {
    const ps = pinState(root);
    const r = spust(root, 'prune-versions-noguard.mjs', ['--keep', String(KEEP), '--pin-state', ps, '--apply']);
    ok(r.kod === 0, 'varianta bez guardu dobehla (exit ' + r.kod + ')');
    const smazana = !zije(root, PIN);
    ok(smazana, 'bez guardu je ' + PIN + ' PRYC - test tedy neni no-op');
    if (!smazana) console.log('       (kdyz pinuta verze prezije i BEZ guardu, scenar 1 nic nedokazuje)');
    ok(zije(root, OSTRA), 'releases.json chrani ' + OSTRA + ' i bez guardu (kontrola, ze rez vzal jen pin guard)');
  }
  uklid(root);
}

// ================================================ 3.-7. FAIL-CLOSED VSTUPY ===
console.log('3) Vadny soupis pinu = tvrda chyba, ne tiche preskoceni');
{
  const root = postavCdn('failclosed');
  if (napisVarianty(root)) {
    const pripady = [
      ['chybejici soubor', path.join(root, 'neexistuje.json')],
      ['neplatny JSON', (() => { const f = path.join(root, 'rozbity.json'); fs.writeFileSync(f, '{ tohle neni json', 'utf8'); return f; })()],
      ['neuplny sweep (complete:false)', pinState(root, { complete: false })],
      ['zastaraly vuci CDN (sweep videl 1.0.0.10, na disku je 1.0.0.20)', pinState(root, { cdnSnapshot: { demo: '1.0.0.10' } })],
      ['appka, kterou sweep neznal', pinState(root, { cdnSnapshot: { jina: '1.0.0.1' } })],
      ['stary sweep (30 dnu)', pinState(root, { sweptAt: new Date(Date.now() - 30 * 86400000).toISOString() })],
      ['zadny pin nenalezen', pinState(root, { pins: [] })],
      ['vadny zaznam pinu', pinState(root, { pins: [{ web: '/x', app: 'demo', version: 'latest' }] })]
    ];
    for (const [popis, f] of pripady) {
      const r = spust(root, 'prune-versions.mjs', ['--keep', String(KEEP), '--pin-state', f, '--apply']);
      const zastavil = r.kod === 1 && r.out.indexOf('PIN GUARD ZASTAVIL PROREZ') !== -1;
      ok(zastavil, popis + ' -> exit 1 (dostal ' + r.kod + ')');
    }
    // A hlavne: ani jedno z toho nesmelo nic smazat.
    let vsechny = true;
    for (let i = 1; i <= POCET_VERZI; i++) if (!zije(root, '1.0.0.' + i)) vsechny = false;
    ok(vsechny, 'po vsech odmitnutych behach je na disku porad vsech ' + POCET_VERZI + ' verzi');
  }
  uklid(root);
}

console.log(chyby ? '\nVERDIKT: ' + chyby + ' CHYBA/CHYBY - NEPOUSTET prune-versions --apply'
                  : '\nVERDIKT: OK — pin guard chrani pinute verze a protipriklad to dokazuje');
process.exit(chyby ? 1 : 0);
