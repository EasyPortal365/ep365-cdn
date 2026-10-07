/* Akademie – sdílený engine animovaných scén (replika rozhraní M365).
   Scéna = samostatné HTML s <div id="box" class="stage-box"><div id="stage" class="stage">…</div></div>.
   Ovládání: v rámu čeká na zprávu {akscene:'play'|'stop'} od rodiče; samostatně se spustí,
   když je vidět (IntersectionObserver). Hash #s<N> = statický stav pro náhled / snímek. */
(function () {
  var EN = /[?&]lang=en\b/.test(location.search);
  var EMBED = window.self !== window.top;
  if (EN) document.documentElement.lang = 'en';
  if (EMBED) document.documentElement.classList.add('embed');

  var t = function (cs, en) { return EN ? (en == null ? cs : en) : cs; };
  var $ = function (id) { return document.getElementById(id); };

  function ic(p, s, c, w) {
    return '<svg width="' + (s || 14) + '" height="' + (s || 14) + '" viewBox="0 0 16 16" fill="none" stroke="' + (c || 'currentColor') + '" stroke-width="' + (w || 1.4) + '" stroke-linecap="round" stroke-linejoin="round">' + p + '</svg>';
  }
  var P = {
    bell: '<path d="M4 11V7a4 4 0 018 0v4l1.5 1.5h-11zM6.5 13.5a1.5 1.5 0 003 0"/>',
    chat: '<path d="M2.5 3.5h11v7h-6l-3 2.5v-2.5h-2z"/>',
    teams: '<circle cx="6" cy="5" r="2"/><circle cx="11.5" cy="5.5" r="1.5"/><path d="M2 13c0-2.5 1.8-4 4-4s4 1.5 4 4M10 9.2c1.9-.4 4 .8 4 3.3"/>',
    cal: '<rect x="2.5" y="3.5" width="11" height="10" rx="1.5"/><path d="M2.5 6.5h11M5.5 2v3M10.5 2v3"/>',
    call: '<path d="M3 2.5h3l1 3-1.8 1.2a8 8 0 004 4L10.5 9l3 1v3a1 1 0 01-1 1A10.5 10.5 0 012 3.5a1 1 0 011-1z"/>',
    cloud: '<path d="M4.5 12.5a3 3 0 01-.4-6 4 4 0 017.7 1 2.5 2.5 0 01.2 5z"/>',
    apps: '<rect x="2.5" y="2.5" width="4" height="4" rx="1"/><rect x="9.5" y="2.5" width="4" height="4" rx="1"/><rect x="2.5" y="9.5" width="4" height="4" rx="1"/><rect x="9.5" y="9.5" width="4" height="4" rx="1"/>',
    search: '<circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5L14 14"/>',
    plus: '<path d="M8 3v10M3 8h10"/>',
    up: '<path d="M8 12V3M4.5 6.5L8 3l3.5 3.5M3 13.5h10"/>',
    share: '<path d="M8 10V2M5 5l3-3 3 3M3 9v4.5h10V9"/>',
    link: '<path d="M6.5 9.5l3-3M7 4.5l1-1a2.5 2.5 0 013.5 3.5l-1 1M9 11.5l-1 1a2.5 2.5 0 01-3.5-3.5l1-1"/>',
    dots: '<circle cx="3.5" cy="8" r="1"/><circle cx="8" cy="8" r="1"/><circle cx="12.5" cy="8" r="1"/>',
    chevd: '<path d="M4 6l4 4 4-4"/>', chevr: '<path d="M6 4l4 4-4 4"/>',
    folder: '<path d="M1.5 4.5a1 1 0 011-1H6l1.5 1.8h6a1 1 0 011 1V12a1 1 0 01-1 1h-10a1 1 0 01-1-1z"/>',
    send: '<path d="M14.5 1.5L1.5 7l4.3 1.8L14.5 1.5zM6.5 9.5l1.3 4.5 6.7-12.5z"/>',
    at: '<circle cx="8" cy="8" r="2.5"/><path d="M10.5 8v1a1.8 1.8 0 003.5 0V8A6 6 0 108 14"/>',
    clip: '<path d="M11 5.5l-5 5a1.5 1.5 0 01-2-2l5.5-5.5a2.5 2.5 0 013.5 3.5L7.5 12"/>',
    smile: '<circle cx="8" cy="8" r="6"/><path d="M5.5 9.5a3 3 0 005 0M6 6.5h.01M10 6.5h.01"/>',
    fmt: '<path d="M3 13l4-10 4 10M4.5 9.5h5"/>',
    comment: '<path d="M2.5 3.5h11v7h-6l-3 2.5v-2.5h-2z"/><path d="M5 6.5h6M5 8.5h4"/>',
    hist: '<path d="M2.5 8a5.5 5.5 0 101.6-3.9M2.5 2.5v2.5H5"/><path d="M8 5v3l2 1.5"/>',
    chk: '<path d="M3 8.5l3.5 3.5 6.5-8"/>', x: '<path d="M4 4l8 8M12 4l-8 8"/>',
    undo: '<path d="M5 3L2 6l3 3M2 6h7a4 4 0 010 8H6"/>',
    mail: '<rect x="2" y="3.5" width="12" height="9" rx="1.5"/><path d="M2.5 4.5L8 9l5.5-4.5"/>',
    eye: '<path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z"/><circle cx="8" cy="8" r="2"/>',
    back: '<path d="M10 3L5 8l5 5"/>', home: '<path d="M2.5 7.5L8 3l5.5 4.5V13h-4V9.5h-3V13h-4z"/>',
    file: '<path d="M3.5 1.5h6l3 3v10h-9z"/><path d="M9.5 1.5v3h3"/>',
    edit: '<path d="M10.5 2.5l3 3-8 8h-3v-3z"/>',
    info: '<circle cx="8" cy="8" r="6"/><path d="M8 7v4M8 5h.01"/>'
  };

  /* Ikony aplikací: vlastní zjednodušené (ne loga Microsoftu) – písmeno v barvě aplikace. */
  var APPC = { word: '#185ABD', excel: '#107C41', ppt: '#C43E1C', teams: '#5B5FC7', sp: '#03787C', od: '#0364B8', outlook: '#0F6CBD' };
  function appIcon(kind, size) {
    var s = size || 18, L = { word: 'W', excel: 'X', ppt: 'P', teams: 'T', sp: 'S', od: 'O', outlook: 'O' }[kind] || '?';
    return '<span class="aico" style="width:' + s + 'px;height:' + s + 'px;background:' + (APPC[kind] || '#605E5C') + ';font-size:' + Math.round(s * 0.55) + 'px">' + L + '</span>';
  }

  /* Lidé fiktivní firmy „Javor nábytek" – barvy shodné ve všech scénách (kurzory, avatary). */
  var PEOPLE = {
    JN: { name: 'Jana Nováková', c: '#0E7A7F' },
    PS: { name: 'Petr Svoboda', c: '#B4009E' },
    LD: { name: 'Lucie Dvořáková', c: '#CA5010' },
    TM: { name: 'Tomáš Malý', c: '#0F6CBD' } /* nový kolega – scénář Nový kolega nastupuje */
  };
  function av(k, size, ring) {
    var p = PEOPLE[k], s = size || 24;
    return '<span class="av" title="' + p.name + '" style="width:' + s + 'px;height:' + s + 'px;background:' + p.c + ';font-size:' + Math.round(s * 0.4) + 'px' + (ring ? ';box-shadow:0 0 0 2px #fff,0 0 0 3.5px ' + p.c : '') + '">' + k + '</span>';
  }

  var CURSOR = '<div class="ak-cur" id="cur"><svg width="18" height="22" viewBox="0 0 18 22"><path d="M1.5 1.5v16l4.2-3.8 3 6.6 3-1.4-3-6.4h5.8z" fill="#1b1b1b" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/></svg></div>';

  /* ===== Teams – kostra okna podle referencí _ref/pruchod/k1-*, k2-* (Teams web, CZ, světlý motiv) =====
     Horní lišta (spouštěč, panel, hledání, …, avatar), pruh ikon BEZ popisků (aktivní Chat), panel Chat
     (filtry, Rychlá zobrazení, Oblíbené, Chaty, Týmy a kanály), hlavička kanálu (Příspěvky, Sdíleno, Stránka, Notes, +).
     Volby: tab (0 Příspěvky, 1 Sdíleno), chats (rozbalené Chaty + rozbalené týmy jako k1; jinak sbalené jako k2), body. */
  var TP = {
    launcher: '<g fill="currentColor" stroke="none"><circle cx="3" cy="3" r="1.1"/><circle cx="8" cy="3" r="1.1"/><circle cx="13" cy="3" r="1.1"/><circle cx="3" cy="8" r="1.1"/><circle cx="8" cy="8" r="1.1"/><circle cx="13" cy="8" r="1.1"/><circle cx="3" cy="13" r="1.1"/><circle cx="8" cy="13" r="1.1"/><circle cx="13" cy="13" r="1.1"/></g>',
    sidepane: '<rect x="2" y="3" width="12" height="10" rx="2"/><path d="M6 3v10"/><path d="M3.6 5.5h1M3.6 7.5h1" />',
    chatOn: '<path d="M8 1.8a6.2 6.2 0 00-5.4 9.2l-.8 3.2 3.3-.8A6.2 6.2 0 108 1.8z" fill="#5B5FC7" stroke="none"/><path d="M5.4 6.8h5.2M5.4 9.3h3.4" stroke="#fff" stroke-width="1.3"/>',
    calg: '<rect x="2" y="2.5" width="12" height="11" rx="2"/><path d="M2 5.5h12"/><g fill="currentColor" stroke="none"><circle cx="5.2" cy="8.2" r=".8"/><circle cx="8" cy="8.2" r=".8"/><circle cx="10.8" cy="8.2" r=".8"/><circle cx="5.2" cy="11" r=".8"/><circle cx="8" cy="11" r=".8"/></g>',
    sqplus: '<rect x="2.5" y="2.5" width="11" height="11" rx="2"/><path d="M8 5.5v5M5.5 8h5"/>',
    compose: '<path d="M12.5 8.5v4a1 1 0 01-1 1h-8a1 1 0 01-1-1v-8a1 1 0 011-1h4"/><path d="M11.8 2.2l2 2L8.5 9.5 6 10l.5-2.5z"/>',
    discover: '<circle cx="8" cy="8" r="5.8"/><path d="M5.6 10.4l4.8-4.8"/><path d="M6.4 6.2a2.5 2.5 0 013.4 3.4"/>',
    drafts: '<path d="M10.5 2.5l3 3-7.5 7.5H3v-3z"/><path d="M2 14.5h4M8.5 4.5l3 3"/>',
    video: '<rect x="1.5" y="4" width="9" height="8" rx="1.8"/><path d="M10.5 7l4-2.2v6.4l-4-2.2"/>',
    rpane: '<rect x="2" y="3" width="12" height="10" rx="2"/><path d="M10 3v10M4.5 8h3M6 6.5L4.5 8 6 9.5"/>',
    shareo: '<path d="M9.5 3.5l4 3.5-4 3.5V8.6C6.5 8.6 4.8 9.6 3.5 12c.4-3.6 2.4-5.8 6-6.2z"/><path d="M12.5 11.5v1a1 1 0 01-1 1h-8a1 1 0 01-1-1v-7"/>',
    shortcut: '<rect x="2.5" y="2.5" width="11" height="11" rx="2"/><path d="M6.3 9.7l3.4-3.4M6.8 6.3h2.9v2.9"/>',
    formsi: '<rect x="2.5" y="2.5" width="11" height="11" rx="2"/><path d="M5 5.6h.8M7.5 5.6H11M5 8h.8M7.5 8H11M5 10.4h.8M7.5 10.4H11"/>',
    lines: '<path d="M2.5 4h11M2.5 8h7M2.5 12h11"/>',
    inmsg: '<path d="M8 2a6 6 0 00-5.2 9l-.8 3 3-.8A6 6 0 108 2z"/><path d="M5.5 7h5M5.5 9.5h3"/>',
    filt: '<path d="M2.5 4.5h11M4.5 8h7M6.5 11.5h3"/>',
    sliders: '<path d="M2.5 5h7.5M13 5h.5M2.5 11h.5M6 11h7.5"/><circle cx="11.5" cy="5" r="1.5"/><circle cx="4.5" cy="11" r="1.5"/>',
    upfile: '<path d="M9.5 1.5h-5a1 1 0 00-1 1v11a1 1 0 001 1H7"/><path d="M9.5 1.5l3 3v2.5M9.5 1.5v3h3"/><circle cx="11" cy="12" r="3" fill="currentColor" stroke="none"/><path d="M11 13.6v-3.2M9.7 11.6L11 10.3l1.3 1.3" stroke="#fff" stroke-width="1.1"/>',
    upfold: '<path d="M1.5 4a1 1 0 011-1H6l1.5 1.8h6a1 1 0 011 1V8M7.5 13h-5a1 1 0 01-1-1V4"/><circle cx="11.5" cy="12" r="3" fill="currentColor" stroke="none"/><path d="M11.5 13.6v-3.2M10.2 11.6l1.3-1.3 1.3 1.3" stroke="#fff" stroke-width="1.1"/>',
    mdfile: '<path d="M3.5 1.5h6l3 3v10h-9z"/><path d="M5.5 11V7.5l1.5 2 1.5-2V11M10.5 7.5V11"/>',
    txfile: '<path d="M3.5 1.5h6l3 3v10h-9z"/><path d="M5.5 7h5M5.5 9.2h5M5.5 11.4h3.5"/>',
    trash: '<path d="M2.5 4.5h11M6.3 4.5V3a.5.5 0 01.5-.5h2.4a.5.5 0 01.5.5v1.5M4 4.5l.7 8.6a1 1 0 001 .9h4.6a1 1 0 001-.9l.7-8.6"/><path d="M6.8 7v4.5M9.2 7v4.5"/>',
    bul: '<path d="M6 4h8M6 8h8M6 12h8"/><g fill="currentColor" stroke="none"><circle cx="2.8" cy="4" r=".9"/><circle cx="2.8" cy="8" r=".9"/><circle cx="2.8" cy="12" r=".9"/></g>',
    num: '<path d="M6.5 4h7.5M6.5 8h7.5M6.5 12h7.5"/><path d="M2.2 2.8l1-.6v3.4M2 7.2c.3-.6 1.7-.6 1.7.4 0 .7-1.7 1.4-1.7 2.2h1.8M2.1 11h1.5l-.8 1 .5.1c.6.2.5 1.6-.6 1.6-.4 0-.7-.2-.8-.4" stroke-width="1"/>',
    hilite: '<path d="M4 2.5h8l-1.5 5.5h-5z"/><path d="M5.5 8l.8 3.5h3.4l.8-3.5"/>',
    fcolor: '<path d="M5 9.5L8 2.5l3 7M6 7.5h4"/><rect x="3" y="11.5" width="10" height="2.5" rx=".8"/>',
    fsize: '<path d="M1.5 12.5l2.7-6.5 2.7 6.5M2.5 10.5h3.4M7.5 12.5l3.2-9 3.3 9M8.6 9.5h4.2"/>',
    quote: '<path d="M3 9.5c0-3 1-4.6 3-5.5M3 9.5h3v3.5H3zM9 9.5c0-3 1-4.6 3-5.5M9 9.5h3v3.5H9z"/>',
    code: '<rect x="2" y="2.5" width="12" height="11" rx="2.5"/><path d="M6.8 6L4.8 8l2 2M9.2 6l2 2-2 2"/>',
    announce: '<path d="M2.5 6.5v3h2l6 3.5v-10l-6 3.5zM12.5 6v4"/><path d="M4.5 9.5l1 4h2l-.8-3.4"/>',
    loopi: '<circle cx="8" cy="8" r="5.8"/><path d="M6 10.8V6.2a2 2 0 112 2H6.8"/>',
    react: '<circle cx="7" cy="8.5" r="5"/><path d="M5 10a2.4 2.4 0 004 0M5.4 7.3h.01M8.6 7.3h.01"/><circle cx="12.5" cy="12.5" r="2.8" fill="#fff"/><path d="M12.5 11.2v2.6M11.2 12.5h2.6" stroke-width="1.1"/>',
    contact: '<rect x="1.5" y="3.5" width="13" height="9" rx="1.5"/><circle cx="5.5" cy="7" r="1.3"/><path d="M3.5 10.5c.4-1 1.1-1.5 2-1.5s1.6.5 2 1.5M9.5 6.5h3M9.5 9h3"/>',
    okc: '<circle cx="8" cy="8" r="6.5" fill="#107C10" stroke="none"/><path d="M5.2 8.2l1.9 1.9 3.7-4" stroke="#fff" stroke-width="1.5"/>',
    newmark: '<path d="M3 6.5h4M4 2.5l3 3M8 1.5v3.5" stroke-width="1.3"/>',
    /* hledání a OneDrive (_ref/hledani/h1–h6) */
    cloudOn: '<path d="M4.5 12.5a3 3 0 01-.4-6 4 4 0 017.7 1 2.5 2.5 0 01.2 5z" fill="#E8EBFA"/>',
    thup: '<path d="M5 7l2.6-4.6c.9 0 1.5.7 1.4 1.6L8.7 6.5h3.6a1.2 1.2 0 011.2 1.4l-.9 4.6a1.5 1.5 0 01-1.5 1.2H5zM2.5 7H5v6.7H2.5z"/>',
    thdn: '<path d="M5 9l2.6 4.6c.9 0 1.5-.7 1.4-1.6L8.7 9.5h3.6a1.2 1.2 0 001.2-1.4l-.9-4.6a1.5 1.5 0 00-1.5-1.2H5zM2.5 9H5V2.3H2.5z"/>',
    findch: '<rect x="2" y="3" width="9" height="10" rx="1.5"/><path d="M4.5 6h4M4.5 8.5h2"/><circle cx="11" cy="10.5" r="2.3"/><path d="M12.7 12.2l1.8 1.8"/>',
    img: '<rect x="2.5" y="2.5" width="11" height="11" rx="2"/><circle cx="6" cy="6" r="1.2"/><path d="M2.8 12l3.6-3.6 3 3 1.6-1.6 2.4 2.4"/>',
    gridv: '<rect x="2.5" y="2.5" width="4.5" height="4.5" rx="1"/><rect x="9" y="2.5" width="4.5" height="4.5" rx="1"/><rect x="2.5" y="9" width="4.5" height="4.5" rx="1"/><rect x="9" y="9" width="4.5" height="4.5" rx="1"/>',
    listv: '<path d="M2.5 4h11M2.5 8h8M2.5 12h11"/>',
    homeF: '<path d="M2.5 7.5L8 3l5.5 4.5V13h-4V9.8h-3V13h-4z" fill="currentColor"/>',
    star: '<path d="M8 2l1.8 3.8 4.2.5-3.1 2.9.8 4.1L8 11.3l-3.7 2 .8-4.1L2 6.3l4.2-.5z"/>',
    libs: '<path d="M3 2.5v11M5.5 2.5v11M8 2.5v11"/><path d="M10 3.2l2.2-.6 2.4 10.4-2.2.6z"/>',
    person: '<circle cx="8" cy="5.3" r="2.6"/><path d="M3 14c0-2.8 2.2-4.6 5-4.6s5 1.8 5 4.6"/>',
    ppl2: '<circle cx="6" cy="5.2" r="2.3"/><path d="M1.8 13.5c0-2.4 1.9-4.1 4.2-4.1s4.2 1.7 4.2 4.1"/><circle cx="11.6" cy="5.8" r="1.8"/><path d="M11.4 9.4c1.9 0 3.3 1.4 3.3 3.5"/>',
    pen: '<path d="M10.5 2.5l3 3-8 8h-3v-3z"/>'
  };
  for (var tpk in TP) P[tpk] = TP[tpk];

  /* bledý kulatý avatar s iniciálami (seznam chatů, návrhy zmínek – v referencích bez fotek) */
  function tpale(k, s) {
    s = s || 18;
    return '<span class="tpav" style="width:' + s + 'px;height:' + s + 'px;font-size:' + Math.round(s * 0.42) + 'px">' + k + '</span>';
  }
  /* malý čtverec týmu (iniciály) */
  function tsq(txt, bg, fg, s) {
    s = s || 14;
    return '<span class="tsq" style="width:' + s + 'px;height:' + s + 'px;background:' + bg + ';color:' + (fg || '#fff') + ';font-size:' + Math.max(6, Math.round(s * 0.42)) + 'px">' + txt + '</span>';
  }

  /* Horní pole hledání (h1–h6): zástupný text, nebo dotaz (HTML, např. s modrým „is:Soubory") + křížek vpravo. */
  function tsearchHTML(q) {
    var has = q != null && q !== '';
    return '<div class="tsearch" id="tsearch">' + ic(P.search, 12, '#616161', 1.3) +
      '<span class="tsph" id="tsph"' + (has ? ' hidden' : '') + '>' + t('Hledat (Ctrl+Alt+E)', 'Search (Ctrl+Alt+E)') + '</span>' +
      '<span class="tsv"><span id="tsv">' + (has ? q : '') + '</span><span class="caret" id="tscar" hidden></span></span>' +
      '<span class="tsx" id="tsx"' + (has ? '' : ' hidden') + '>' + ic(P.x, 12, '#424242', 1.2) + '</span></div>';
  }
  /* Stav pole hledání za běhu: q = HTML dotazu ('' = prázdné), caret = blikající kurzor. */
  function tsearchSet(q, caret) {
    var has = q != null && q !== '';
    $('tsv').innerHTML = q || '';
    $('tsph').hidden = has || !!caret;
    $('tsx').hidden = !has;
    $('tscar').hidden = !caret;
  }

  function teamsShell(o) {
    o = o || {};
    var open = !!o.chats;
    var g = '#424242';
    /* o.rail: 'chat' (výchozí, kanál), 'od' (OneDrive – h6), 'none' (stránka výsledků hledání – h2–h5, nic aktivní) */
    var act = o.rail || 'chat';
    var rail =
      '<div class="tr" id="rl0">' + ic(P.bell, 17, g, 1.25) + '<i class="tbadge">6</i></div>' +
      (act === 'chat' ? '<div class="tr on" id="rl1">' + ic(P.chatOn, 18) + '</div>' : '<div class="tr" id="rl1">' + ic(P.inmsg, 17, g, 1.2) + '</div>') +
      '<div class="tr" id="rl2">' + ic(P.calg, 17, g, 1.25) + '</div>' +
      '<div class="tr" id="rl3">' + ic(P.call, 17, g, 1.25) + '</div>' +
      (act === 'od' ? '<div class="tr on" id="rl4">' + ic(P.cloudOn, 17, '#5B5FC7', 1.25) + '</div>' : '<div class="tr" id="rl4">' + ic(P.cloud, 17, g, 1.25) + '</div>') +
      '<div class="tr" id="rl5">' + ic(P.sqplus, 17, g, 1.25) + '</div>' +
      '<div class="tr" id="rl6">' + ic(P.dots, 17, g, 1.4) + '</div>';
    var top = '<div class="ttop"><span class="tti">' + ic(P.launcher, 14, '#424242') + '</span><span class="tti">' + ic(P.sidepane, 14, '#424242', 1.2) + '</span>' +
      tsearchHTML(o.q) + (o.pop || '') +
      '<span class="tti tright">' + ic(P.dots, 14, '#424242', 1.4) + '</span><span class="tme">' + av('JN', 20) + '<i class="tpres"></i></span></div>';
    /* o.full: celá plocha vpravo od lišty (výsledky hledání, OneDrive) – bez panelu Chat a hlavičky kanálu */
    if (o.full != null) {
      return '<div class="teams tfull">' + top + '<div class="trail">' + rail + '</div><div class="tfullm" id="tfullm">' + o.full + '</div></div>';
    }
    var chv = function (d) { return '<span class="tcv">' + ic(d ? P.chevd : P.chevr, 9, '#616161', 1.5) + '</span>'; };
    var sec = function (n, d) { return '<div class="tsec">' + chv(d) + n + '</div>'; };
    var item = function (icon, n, cls) { return '<div class="titem' + (cls ? ' ' + cls : '') + '"><span class="tii">' + icon + '</span>' + n + '</div>'; };
    var team = function (sq, n, d) { return '<div class="tteam">' + chv(d) + sq + '<span>' + n + '</span></div>'; };
    var chan = function (n, on) { return '<div class="tchan' + (on ? ' on' : '') + '">' + n + '</div>'; };
    var mtg = '<span class="tmtg">' + ic(P.cal, 10, '#5B5FC7', 1.3) + '</span>';
    var list =
      sec(t('Rychlá zobrazení', 'Quick views'), 1) +
      item(ic(P.discover, 14, g, 1.15), t('Objevy', 'Discover')) +
      item(ic(P.drafts, 14, g, 1.15), t('Koncepty', 'Drafts')) +
      sec(t('Oblíbené', 'Favorites'), 0) +
      sec(t('Chaty', 'Chats'), open) +
      (open ? item(tpale('PS', 16), 'Petr Svoboda') + item(tpale('LD', 16), 'Lucie Dvořáková') + item(mtg, t('Porada obchodu', 'Sales meeting')) : '') +
      sec(t('Týmy a kanály', 'Teams and channels'), 1) +
      team(tsq('CF', '#CA5010'), t('Celá firma', 'Whole company'), open) + (open ? chan(t('Obecné', 'General')) : '') +
      team(tsq('JN', '#E2F1F8', '#5F7782'), t('Javor nábytek – Obchod', 'Javor nábytek – Sales'), 1) + chan(t('Nabídky', 'Quotes'), 1) +
      team(tsq('JN', '#038387'), t('Javor nábytek – Výroba', 'Javor nábytek – Production'), open) + (open ? chan(t('Obecné', 'General')) : '') +
      (open ? '' : '<div class="tlink">' + t('Zobrazit všechny vaše týmy', 'See all your teams') + '</div>');
    /* o.extraTab: popisek záložky přidané za Notes (index 4, např. plán Planneru – _ref/planner/p06, p10); o.plusOn: „+“ s otevřenou nabídkou (p01) */
    var tabs = [t('Příspěvky', 'Posts'), t('Sdíleno', 'Shared'), t('Stránka', 'Page'), 'Notes'].concat(o.extraTab ? [o.extraTab] : []).map(function (n, i) {
      var on = i === (o.tab || 0);
      return '<span class="ttab' + (on ? ' on' : '') + '" id="tab' + i + '">' + n + (on && (i === 1 || i === 4) ? ic(P.chevd, 9, '#616161', 1.5) : '') + '</span>';
    }).join('');
    return '<div class="teams' + (o.tab ? ' tshared' : ' tposts') + '">' + top +
      '<div class="trail">' + rail + '</div>' +
      '<div class="tlist"><div class="tlh"><b>Chat</b><span class="tlhi">' + ic(P.dots, 13, g, 1.4) + ic(P.search, 13, g, 1.3) + '<span class="tlhc">' + ic(P.compose, 13, g, 1.2) + ic(P.chevd, 9, g, 1.5) + '</span></span></div>' +
      '<div class="tfil"><span>' + t('Nepřečtené', 'Unread') + '</span><span>' + t('Kanály', 'Channels') + '</span><span>' + t('Chaty', 'Chats') + '</span><span>' + t('Chaty schůzek', 'Meeting chats') + '</span>' + ic(P.chevd, 10, '#616161', 1.5) + '</div>' +
      '<div class="tscroll">' + list + '</div></div>' +
      '<div class="tmain"><div class="tmh">' + tsq('JN', '#E2F1F8', '#5F7782', 23) + '<b class="tchn">' + t('Nabídky', 'Quotes') + '</b><div class="ttabs">' + tabs + '<span class="ttab plus' + (o.plusOn ? ' pon' : '') + '" id="tabPlus">' + ic(P.sqplus, 13, o.plusOn ? '#5B5FC7' : '#424242', 1.2) + '</span></div>' +
      '<span class="tmr"><span class="tmeet">' + ic(P.video, 14, '#242424', 1.25) + t('Okamžitá schůzka', 'Meet now') + ic(P.chevd, 9, '#424242', 1.5) + '</span>' +
      (o.tab ? '' : ic(P.search, 13, '#424242', 1.3) + ic(P.rpane, 14, '#424242', 1.2)) + ic(P.dots, 14, '#424242', 1.4) + '</span></div>' +
      '<div class="tbody" id="tbody">' + (o.body || '') + '</div></div></div>';
  }
  teamsShell.pale = tpale;
  teamsShell.sq = tsq;
  teamsShell.searchSet = tsearchSet;

  /* Ikona souboru ve výsledcích hledání a v OneDrivu (h2, h6): list papíru se štítkem aplikace vlevo dole (bez log). */
  function fileIco(kind, s) {
    s = s || 20;
    var b = Math.round(s * 0.55);
    return '<span class="fico" style="width:' + s + 'px;height:' + s + 'px">' +
      '<svg width="' + s + '" height="' + s + '" viewBox="0 0 20 20" fill="#fff" stroke="#9E9E9E" stroke-width="1"><path d="M5.5 1.5h7l4 4v13h-11z"/><path d="M12.5 1.5v4h4" fill="none"/><path d="M8.5 9.5h5.5M8.5 12h5.5M8.5 14.5h4" stroke="' + (kind === 'pdf' ? '#D13438' : APPC[kind] || '#9E9E9E') + '" stroke-opacity=".55"/></svg>' +
      (kind === 'pdf' ? '' : '<span class="fico-b">' + appIcon(kind, b) + '</span>') + '</span>';
  }

  /* ===== Word pro web =====
     Kostra podle snímků skutečného Wordu pro web (světlý režim, české UI) – _ref/pruchod/w-*, k4-*, k5-*.
     Nic tu není vymyšlené: každý popisek a prvek má předlohu ve snímku. Ikony jsou zjednodušené (bez log). */
  var WI = {
    grid: '<g fill="#424242" stroke="none"><circle cx="3" cy="3" r="1.15"/><circle cx="8" cy="3" r="1.15"/><circle cx="13" cy="3" r="1.15"/><circle cx="3" cy="8" r="1.15"/><circle cx="8" cy="8" r="1.15"/><circle cx="13" cy="8" r="1.15"/><circle cx="3" cy="13" r="1.15"/><circle cx="8" cy="13" r="1.15"/><circle cx="13" cy="13" r="1.15"/></g>',
    cloudOk: '<path d="M10.5 6.3A3.8 3.8 0 003.4 7.5 2.6 2.6 0 004 12.6h3"/><circle cx="11.3" cy="11" r="3.6" fill="#13A10E" stroke="#fff" stroke-width="1"/><path d="M9.6 11l1.2 1.2 2.1-2.3" stroke="#fff" stroke-width="1.3"/>',
    sync: '<path d="M13 7.5A5 5 0 004.2 4.4M3 8.5a5 5 0 008.8 3.1"/><path d="M4.2 1.8v2.8H7M11.8 14.2v-2.8H9"/>',
    gear: '<circle cx="8" cy="8" r="2.2"/><path d="M8 1.5l1.1 1.6 1.9-.4.4 1.9 1.6 1.1-.9 1.7.9 1.7-1.6 1.1-.4 1.9-1.9-.4L8 14.5l-1.1-1.6-1.9.4-.4-1.9-1.6-1.1.9-1.7-.9-1.7 1.6-1.1.4-1.9 1.9.4z"/>',
    bubble: '<path d="M2.5 3h11v7.5H8L4.5 13.5v-3h-2z"/>',
    pulse: '<path d="M1 8.5h2.6l1.6-3.5 2.2 6 2-5 1.2 2.5H15"/>',
    pen: '<path d="M10.5 2.5l3 3-8 8h-3v-3z"/>',
    ppl: '<circle cx="6" cy="5.2" r="2.3"/><path d="M1.8 13.5c0-2.4 1.9-4.1 4.2-4.1s4.2 1.7 4.2 4.1"/><circle cx="11.6" cy="5.8" r="1.8"/><path d="M11.4 9.4c1.9 0 3.3 1.4 3.3 3.5"/>',
    cv: '<path d="M4.5 6.5L8 10l3.5-3.5"/>',
    nav: '<rect x="2.5" y="2.5" width="11" height="11" rx="1.5"/><path d="M6.5 2.5v11"/>',
    undo: '<path d="M4.5 3L2 5.5 4.5 8"/><path d="M2.3 5.5H9a4.2 4.2 0 010 8.4H7"/>',
    clip: '<rect x="3.5" y="3" width="9" height="11" rx="1.2"/><path d="M6 3.4V2h4v1.4"/>',
    painter: '<rect x="3.5" y="1.5" width="9" height="5" rx="1"/><path d="M8 6.5v2.2M6.8 8.7h2.4l-.3 5.3H7.1z"/>',
    grow: '<path d="M1.8 13.5L5.5 3.5l3.7 10M3.1 10h4.8"/><path d="M10.5 5L12 3.3 13.5 5"/>',
    shrink: '<path d="M1.8 13.5L5.5 3.5l3.7 10M3.1 10h4.8"/><path d="M10.5 3.5L12 5.2l1.5-1.7"/>',
    hilite: '<path d="M5 2h6v4l-1.5 2h-3L5 6z"/><path d="M6.5 8v2.5h3V8"/><rect x="3" y="12" width="10" height="3" fill="#FFE100" stroke="none"/>',
    fcolor: '<path d="M4.3 10L8 1.8l3.7 8.2M5.6 7.2h4.8"/><rect x="2.5" y="12" width="11" height="3" fill="#E81123" stroke="none"/>',
    clear: '<path d="M1.5 11.5L4.6 3.5l3.1 8M2.6 8.8h4"/><rect x="9" y="8.6" width="6" height="3.6" rx="1" transform="rotate(-38 12 10.4)" fill="#C239B3" stroke="none"/>',
    bul: '<path d="M6 4h8M6 8h8M6 12h8"/><circle cx="2.8" cy="4" r=".9"/><circle cx="2.8" cy="8" r=".9"/><circle cx="2.8" cy="12" r=".9"/>',
    num: '<path d="M6.5 4h7.5M6.5 8h7.5M6.5 12h7.5"/><path d="M2.2 2.8l1-.5v3.4M2 9.6c.3-.7 1.9-.7 1.9.3 0 .8-1.9 1.3-1.9 2.4h2"/>',
    chkl: '<path d="M7 4h7M7 8h7M7 12h7"/><path d="M1.8 4l1 1 1.9-2M1.8 8l1 1 1.9-2M1.8 12l1 1 1.9-2"/>',
    outd: '<path d="M7 4h7M9 8h5M7 12h7"/><path d="M5.5 6L3.5 8l2 2"/>',
    ind: '<path d="M7 4h7M9 8h5M7 12h7"/><path d="M2.5 6l2 2-2 2"/>',
    align: '<path d="M2 4h12M2 8h8M2 12h12"/>',
    borders: '<rect x="2.5" y="2.5" width="11" height="11"/><path d="M8 2.5v11M2.5 8h11" stroke-dasharray="1 1.5"/>',
    shade: '<path d="M2.8 8.2l5-5 4.5 4.5-5 5z"/><path d="M14 11c0 .9-.5 1.5-1.1 1.5s-1.1-.6-1.1-1.5.5-1.4 1.1-2.4c.6 1 1.1 1.5 1.1 2.4z"/>',
    search: '<circle cx="7" cy="7" r="4.5"/><path d="M10.4 10.4L14 14"/>',
    mic: '<rect x="5.8" y="1.5" width="4.4" height="8" rx="2.2" fill="#2266C6" stroke="none"/><path d="M3.5 7.5a4.5 4.5 0 009 0M8 12v2.5"/>',
    editor: '<path d="M4 13.5L13 4.5"/><path d="M13 4.5l-1.8-1.8-8 8L2.5 13.5l2.8-.7"/><path d="M1.5 9.5h3.5M1.5 6.5h5"/>',
    dots: '<circle cx="3.5" cy="8" r="1"/><circle cx="8" cy="8" r="1"/><circle cx="12.5" cy="8" r="1"/>',
    /* Revize */
    abc: '<text x="8" y="6.2" text-anchor="middle" font-size="5.6" font-family="Segoe UI,sans-serif" font-weight="600" fill="#424242" stroke="none">ABC</text><path d="M4.5 10.5l2 2.2 4.5-4.5" stroke="#13A10E"/>',
    wcount: '<path d="M2 3h12M2 6h12M2 9h4"/><text x="11" y="14.6" text-anchor="middle" font-size="5.4" font-family="Segoe UI,sans-serif" font-weight="600" fill="#2266C6" stroke="none">123</text>',
    access: '<circle cx="6" cy="3" r="1.4"/><path d="M2.5 5.5h7M6 5.5v4l-2 4.5M6 9.5l2 4.5"/><circle cx="11.6" cy="11.4" r="3.2" fill="#2266C6" stroke="#fff" stroke-width=".8"/><path d="M10.2 11.4l1 1 1.7-1.9" stroke="#fff" stroke-width="1.1"/>',
    docsm: '<path d="M4 1.8h5.2L12 4.6v9.6H4z"/><path d="M9 1.8v3h3"/>',
    transl: '<path d="M1.5 3.5h6M4.5 2v1.5M3 3.5c.5 2.4 2 4 4 5M6 3.5c-.5 2.4-2 4-4 5"/><path d="M9 14l2.5-6.5L14 14M9.8 12h3.4"/>',
    cmtAdd: '<path d="M2.5 3.5h9v7H7l-3.2 3v-3H2.5z"/><circle cx="12.3" cy="3.6" r="3.2" fill="#13A10E" stroke="#fff" stroke-width=".8"/><path d="M12.3 2v3.2M10.7 3.6h3.2" stroke="#fff" stroke-width="1.1"/>',
    cmtDel: '<path d="M2.5 3.5h9v7H7l-3.2 3v-3H2.5z"/><circle cx="12.3" cy="3.6" r="3.2" fill="#D13438" stroke="#fff" stroke-width=".8"/><path d="M11.2 2.5l2.2 2.2M13.4 2.5l-2.2 2.2" stroke="#fff" stroke-width="1.1"/>',
    cmtPrev: '<path d="M2.5 3.5h9v7H7l-3.2 3v-3H2.5z"/><circle cx="12.3" cy="3.6" r="3.2" fill="#2266C6" stroke="#fff" stroke-width=".8"/><path d="M12.9 2.3l-1.3 1.3 1.3 1.3" stroke="#fff" stroke-width="1.1"/>',
    cmtNext: '<path d="M2.5 3.5h9v7H7l-3.2 3v-3H2.5z"/><circle cx="12.3" cy="3.6" r="3.2" fill="#2266C6" stroke="#fff" stroke-width=".8"/><path d="M11.7 2.3l1.3 1.3-1.3 1.3" stroke="#fff" stroke-width="1.1"/>',
    filt: '<path d="M2.5 3.5h9v7H7l-3.2 3v-3H2.5z"/><path d="M10 1.5h5l-2 2.5v2.5l-1 .6V4z"/>',
    markup: '<path d="M2 3h10v7H6.5L3.5 13v-3H2z"/><path d="M10 10.5h4.5M12.2 8.5v4" stroke="#E8590C" stroke-width="1.5"/>',
    track: '<path d="M3.5 1.8h5.2l2.8 2.8v4M3.5 1.8v12.4h4"/><path d="M14.5 7.5l-5.5 5.5-1.8.5.5-1.8 5.5-5.5z" stroke="#2266C6"/>',
    accept: '<path d="M3.5 1.8h5.2L11.5 4.6v2.4M3.5 1.8v12.4h4"/><circle cx="11.6" cy="11.4" r="3.2" fill="#13A10E" stroke="#fff" stroke-width=".8"/><path d="M10.2 11.4l1 1 1.7-1.9" stroke="#fff" stroke-width="1.1"/>',
    reject: '<path d="M3.5 1.8h5.2L11.5 4.6v2.4M3.5 1.8v12.4h4"/><circle cx="11.6" cy="11.4" r="3.2" fill="#D13438" stroke="#fff" stroke-width=".8"/><path d="M10.5 10.3l2.2 2.2M12.7 10.3l-2.2 2.2" stroke="#fff" stroke-width="1.1"/>',
    chPrev: '<path d="M3.5 1.8h5.2L11.5 4.6v2.4M3.5 1.8v12.4h4"/><circle cx="11.6" cy="11.4" r="3.2" fill="#2266C6" stroke="#fff" stroke-width=".8"/><path d="M12.2 10.1l-1.3 1.3 1.3 1.3" stroke="#fff" stroke-width="1.1"/>',
    chNext: '<path d="M3.5 1.8h5.2L11.5 4.6v2.4M3.5 1.8v12.4h4"/><circle cx="11.6" cy="11.4" r="3.2" fill="#2266C6" stroke="#fff" stroke-width=".8"/><path d="M11 10.1l1.3 1.3-1.3 1.3" stroke="#fff" stroke-width="1.1"/>',
    page: '<path d="M4 1.8h5.2L12 4.6v9.6H4z"/>',
    fit: '<path d="M2 5V2.5h3M14 5V2.5h-3M2 11v2.5h3M14 11v2.5h-3"/>'
  };
  function wi(k, s, c, w) { return ic(WI[k], s || 15, c || '#424242', w || 1.2); }
  var CV = function () { return '<span class="rc">' + wi('cv', 11, '#424242', 1.3) + '</span>'; };
  function rbi(k, o) { o = o || {}; return '<span class="ri' + (o.cls ? ' ' + o.cls : '') + '"' + (o.id ? ' id="' + o.id + '"' : '') + '>' + wi(k, 15, o.c, o.w) + (o.label ? '<span>' + o.label + '</span>' : '') + '</span>' + (o.cv ? CV() : ''); }
  var RS = '<span class="rsep"></span>';
  var REND = '<span class="rend">' + wi('cv', 12, '#424242', 1.4) + '</span>';

  /* Pás karet: 'home' (w-02), 'review' (k4-01). Volby home: font, size, style (k5-06 ukazuje Nadpis 1). */
  function wordRibbon(kind, o) {
    o = o || {};
    if (kind === 'review') {
      return rbi('abc', { cls: 'abc', cv: 1, c: '#13A10E', w: 1.5 }) + rbi('wcount', { label: t('Počet slov', 'Word Count'), cv: 1, cls: 'wc' }) +
        rbi('access', { label: t('Zkontrolovat přístupnost', 'Check Accessibility') }) + rbi('docsm', { cls: 'off' }) + RS +
        rbi('transl', { label: t('Přeložit', 'Translate'), cv: 1 }) + RS +
        rbi('cmtAdd', { id: 'rNew' }) + rbi('cmtDel', { id: 'rDel', cls: 'off', cv: 1 }) + rbi('cmtPrev', { id: 'rPrev', cls: 'off' }) + rbi('cmtNext', { id: 'rNext', cls: 'off' }) +
        rbi('bubble', { id: 'rShow', cls: 'tog', label: t('Zobrazit komentáře', 'Show Comments') }) + RS +
        rbi('filt', { id: 'rFilt', cls: 'off', label: t('Filtr', 'Filter'), cv: 1 }) + rbi('markup', { label: t('Zobrazení revizí', 'Display for Review'), cv: 1 }) + RS +
        rbi('track', { label: t('Sledování změn', 'Track Changes'), cv: 1 }) + rbi('accept', { cv: 1 }) + rbi('reject', { cv: 1 }) + rbi('chPrev') + rbi('chNext') + RS + REND;
    }
    return rbi('undo', { cv: 1 }) + rbi('clip', { cv: 1 }) + rbi('painter', { c: '#D89614' }) + RS +
      '<span class="rbox rfont">' + (o.font || t('Aptos (Základ…', 'Aptos (Body)')) + wi('cv', 10, '#424242', 1.4) + '</span><span class="rbox rsize">' + (o.size || 12) + wi('cv', 10, '#424242', 1.4) + '</span>' +
      rbi('grow') + rbi('shrink') + '<span class="ri rt"><b>B</b></span><span class="ri rt"><i>I</i></span><span class="ri rt"><u>U</u></span>' +
      rbi('hilite', { cv: 1 }) + rbi('fcolor', { cv: 1 }) + rbi('clear') + rbi('dots') + RS +
      rbi('bul', { cv: 1, c: '#3A6DB5' }) + rbi('num', { cv: 1, c: '#3A6DB5' }) + rbi('chkl', { c: '#3A6DB5' }) + rbi('outd', { c: '#3A6DB5' }) + rbi('ind', { c: '#3A6DB5' }) + rbi('align', { cv: 1 }) + rbi('borders', { cv: 1 }) + rbi('shade', { cv: 1 }) + rbi('dots') + RS +
      '<span class="rbox rstyle"><span class="rsv' + (o.style ? ' big' : '') + '">' + (o.style || t('Normální', 'Normal')) + '</span>' + wi('cv', 10, '#424242', 1.4) + '</span>' + RS +
      rbi('search', { cv: 1 }) + RS + rbi('mic', { cv: 1, c: '#2266C6' }) + RS + rbi('editor', { c: '#2266C6', w: 1.3 }) + RS + rbi('dots') + RS + REND;
  }

  /* Stav uložení v titulku: '' = jen ikona (w-02), 'busy' = „Ukládá se…" (k4-06), 'saved' = „Uloženo" (k4-08). */
  function wordSave(st) {
    var i = $('wsico'), s = $('wsaved'); if (!i || !s) return;
    i.innerHTML = st === 'busy' ? wi('sync', 14, '#424242', 1.3) : wi('cloudOk', 15, '#424242', 1.2);
    s.textContent = st === 'busy' ? t('Ukládá se…', 'Saving…') : st === 'saved' ? t('Uloženo', 'Saved') : '';
  }

  /* Word pro web – kostra. Volby: file, tab (index karty, výchozí 1 = Domů), ctx (kontextová karta „Tabulka"), rib ('home'|'review'),
     ribOpt (volby pásu), page (HTML stránky), side (vrstvy navíc), words (počet slov ve stavovém řádku), me (iniciály vpravo nahoře). */
  function wordShell(o) {
    o = o || {};
    var tabs = [t('Soubor', 'File'), t('Domů', 'Home'), t('Vložení', 'Insert'), t('Rozložení', 'Layout'), t('Reference', 'References'), t('Revize', 'Review'), t('Zobrazení', 'View'), t('Nápověda', 'Help')]
      .map(function (n, i) { return '<span class="wt' + (i === (o.tab == null ? 1 : o.tab) ? ' on' : '') + '" id="wt' + i + '">' + n + '</span>'; }).join('') +
      '<span class="wt ctx" id="wtT"' + (o.ctx ? '' : ' hidden') + '>' + t('Tabulka', 'Table') + '</span>';
    return '<div class="word">' +
      '<div class="wtop"><span class="wgrid">' + wi('grid', 15) + '</span><span class="wapp">' + appIcon('word', 17) + '</span>' +
      '<span class="wfn" id="wfn"><span id="wfnt">' + (o.file || '') + '</span><span class="wsv"><span id="wsico">' + wi('cloudOk', 15, '#424242', 1.2) + '</span><small id="wsaved"></small></span></span>' +
      '<div class="wsearch" id="wsearch">' + wi('search', 12, '#616161', 1.3) + '<span>' + t('Hledat nástroje, nápovědu a další (Alt + Q)', 'Search for tools, help, and more (Alt + Q)') + '</span></div>' +
      '<span class="wwho"></span><span class="wgear">' + wi('gear', 15, '#424242', 1.1) + '</span><span class="wme">' + (o.me || 'JN') + '</span></div>' +
      '<div class="wtabs">' + tabs + '<span class="wbtns">' +
      '<span class="wbtn" id="wCmt">' + wi('bubble', 13) + t('Komentáře', 'Comments') + '</span>' +
      '<span class="wbtn">' + wi('pulse', 13) + t('Rekapitulace změn', 'Catch up') + '</span>' +
      '<span class="wbtn">' + wi('pen', 12) + t('Provádění úprav', 'Editing') + wi('cv', 10, '#424242', 1.4) + '</span>' +
      '<span class="wbtn wshare" id="wShare">' + wi('ppl', 13, '#fff', 1.2) + t('Sdílet', 'Share') + wi('cv', 10, '#fff', 1.4) + '</span></span></div>' +
      '<div class="wrib" id="wrib">' + wordRibbon(o.rib || 'home', o.ribOpt) + '</div>' +
      '<span class="wnav">' + wi('nav', 13, '#424242', 1.2) + '</span>' +
      '<div class="wcanvas" id="wcanvas"><div class="wpage" id="wpage">' + (o.page || '') + '</div><span class="wscroll"></span></div>' +
      '<div class="wstat"><span>' + t('Stránka 1 z 1', 'Page 1 of 1') + '</span><span id="wwords">' + t('Slova: ', 'Words: ') + (o.words == null ? 63 : o.words) + '</span><span>' + t('Čeština', 'Czech') + '</span>' +
      '<span class="wzoom"><span class="wpv">' + wi('page', 12, '#424242', 1.2) + '</span><span>–</span><span class="wsl"><i></i></span><span>+</span><span>100%</span>' + wi('fit', 11, '#616161', 1.2) + '<span>' + t('Přizpůsobit', 'Fit') + '</span><span>' + t('Pošlete Microsoftu svůj názor', 'Give Feedback to Microsoft') + '</span></span></div>' +
      (o.side || '') + '</div>';
  }

  /* Dokument nabídky – sdílený obsah stránky ve scénách 3–5 (podle w-02 / k4-08 / k5-06: prostá tabulka, bez záhlaví s výplní).
     Volby: intro (HTML úvodu), prices (vyplněné ceny 1–3), montaz (cena dopravy a montáže), dates (text odstavce Termíny; false = prázdný odstavec). */
  function offerPage(o) {
    o = o || {};
    var row = function (id, a, b, c) { return '<tr id="' + id + '"><td>' + a + '</td><td>' + b + '</td><td class="pr" id="' + id + 'p">' + c + '</td></tr>'; };
    return '<h1>' + t('Vybavení recepce – Penzion U Lípy', 'Reception furniture – U Lípy guesthouse') + '</h1>' +
      '<p id="pIntro">' + (o.intro != null ? o.intro : t('Děkujeme za poptávku. Na základě prohlídky 2. října navrhujeme kompletní vybavení recepce z masivního dubu.', 'Thank you for your enquiry. Following our visit on 2 October, we propose complete reception furniture in solid oak.')) + '</p>' +
      '<h2>' + t('Cenová nabídka', 'Price quote') + '</h2>' +
      '<table class="dt"><tbody>' +
      '<tr><td>' + t('Položka', 'Item') + '</td><td>' + t('Množství', 'Quantity') + '</td><td>' + t('Cena', 'Price') + '</td></tr>' +
      row('r1', t('Recepční pult, dub masiv', 'Reception desk, solid oak'), '1 ks', o.prices ? '64 900 Kč' : '') +
      row('r2', t('Regál za pult', 'Back shelving'), '2 ks', o.prices ? '18 400 Kč' : '') +
      row('r3', t('Lavice pro hosty', 'Guest bench'), '2 ks', o.prices ? '12 600 Kč' : '') +
      '<tr id="r4"><td id="r4c"><span id="r4t">' + t('Doprava a montáž', 'Delivery and assembly') + '</span></td><td>1×</td><td class="pr" id="r4p">' + (o.montaz ? '8 500 Kč' : '') + '</td></tr>' +
      '</tbody></table>' +
      '<h2 id="hDates">' + t('Termíny', 'Schedule') + '</h2>' +
      '<p id="pDates">' + (o.dates === false ? '' : (o.dates || t('Výroba do 4 týdnů od objednávky, montáž na místě během jednoho dne.', 'Production within 4 weeks of order, on-site assembly in one day.'))) + '</p>' +
      '<p class="sig">' + t('Jana Nováková · obchodní oddělení · Javor nábytek', 'Jana Nováková · sales · Javor nábytek') + '</p>';
  }

  function Scene(cfg) {
    var W = cfg.W || 1160, H = cfg.H || 660;
    var box = $('box'), stage = $('stage');
    stage.style.width = W + 'px'; stage.style.height = H + 'px';
    stage.insertAdjacentHTML('beforeend', CURSOR);
    var cur = $('cur'), cx = W - 70, cy = H - 50;
    function k() { return (box.clientWidth || W) / W; }
    function fit() { var s = (box.clientWidth || W) / W; stage.style.transform = 'scale(' + s + ')'; box.style.height = Math.floor(H * s) + 'px'; }
    fit(); window.addEventListener('resize', fit); if (window.ResizeObserver) new ResizeObserver(fit).observe(box);

    var root = $('app');
    function render() { root.innerHTML = cfg.build(); cur.classList.remove('on', 'down'); curTo(W - 70, H - 50, 0); }
    function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
    function rectOf(el) { var r = el.getBoundingClientRect(), b = stage.getBoundingClientRect(), s = k(); return { x: (r.left - b.left) / s, y: (r.top - b.top) / s, w: r.width / s, h: r.height / s }; }
    function curTo(x, y, ms) { cx = x; cy = y; cur.style.transitionDuration = ms + 'ms'; cur.style.transform = 'translate(' + x + 'px,' + y + 'px)'; }
    var token = 0, running = false, tk = 0;
    function Stop() {}
    function alive() { if (tk !== token) throw new Stop(); }
    async function wait(ms) { await sleep(ms); alive(); }
    async function moveTo(el, fx, fy, ms) { if (typeof el === 'string') el = $(el); var r = rectOf(el), d = ms || 850; cur.classList.add('on'); curTo(r.x + r.w * (fx == null ? 0.5 : fx), r.y + r.h * (fy == null ? 0.5 : fy), d); await wait(d + 60); }
    async function click() {
      var r = document.createElement('i'); r.className = 'rip'; r.style.left = cx + 'px'; r.style.top = cy + 'px'; stage.appendChild(r); setTimeout(function () { r.remove(); }, 650);
      cur.classList.add('down'); await sleep(130); cur.classList.remove('down'); await wait(170);
    }
    /* Psaní do prvku: text se připisuje po znacích; html=true připíše na konec jako HTML až na závěr. */
    async function type(el, text, cps) {
      if (typeof el === 'string') el = $(el);
      var d = 1000 / (cps || 22);
      for (var i = 0; i < text.length; i++) { el.appendChild(document.createTextNode(text[i])); await wait(d * (text[i] === ' ' ? 1.6 : 1)); }
    }
    var api = { $: $, t: t, ic: ic, P: P, sleep: wait, moveTo: moveTo, click: click, type: type, rectOf: rectOf, hideCursor: function () { cur.classList.remove('on'); }, stage: stage, cursor: cur };

    async function playOnce() {
      render(); stage.classList.remove('fade');
      await wait(cfg.lead || 1400);
      await cfg.play(api);
      await wait(cfg.tail || 2600);
      cur.classList.remove('on'); stage.classList.add('fade'); await wait(600);
    }
    async function loop() { tk = ++token; try { while (true) await playOnce(); } catch (e) { if (!(e instanceof Stop)) throw e; } }
    function start() { if (!running) { running = true; loop(); } }
    function stop() { if (running) { running = false; token++; stage.classList.remove('fade'); render(); } }

    render();
    var m = /^#s(\w+)$/.exec(location.hash);
    if (m && cfg.states && cfg.states[m[1]]) { cfg.states[m[1]](api); return; }
    var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) { if (cfg.states && cfg.states.end) cfg.states.end(api); return; }
    if (EMBED) {
      window.addEventListener('message', function (e) {
        if (e.source !== window.parent || !e.data || e.data.akscene === undefined) return;
        if (e.data.akscene === 'play') start(); else stop();
      });
      window.parent.postMessage({ akscene: 'ready' }, '*');
      return;
    }
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) start(); else stop(); }); }, { threshold: 0.35 }).observe(box);
    } else start();
  }

  window.AK = { t: t, $: $, ic: ic, P: P, appIcon: appIcon, av: av, PEOPLE: PEOPLE, teamsShell: teamsShell, fileIco: fileIco, wordShell: wordShell, wordRibbon: wordRibbon, wordSave: wordSave, WI: WI, wi: wi, offerPage: offerPage, Scene: Scene, EN: EN };
})();
