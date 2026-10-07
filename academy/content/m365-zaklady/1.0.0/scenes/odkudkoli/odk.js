/* Akademie – scénář „Práce odkudkoli“: sdílené stavební kusy scén OneDrivu na webu.
   Předlohy: _ref/odkudkoli/o02 (Moje soubory, široké okno), o03 (totéž v úzkém okně), o01 (Domů – Pro vás a Poslední).
   Složky, soubory a lidé jsou fiktivní (Javor nábytek). Ikony jsou zjednodušené (bez log). Souřadnice = px snímku. */
(function () {
  var A = AK, t = A.t, ic = A.ic, P = A.P, G = '#424242';
  var I = {
    mon: '<rect x="2" y="3" width="12" height="8" rx="1"/><path d="M6 13.5h4M8 11v2.5"/>',
    ppl: '<circle cx="6" cy="5.2" r="2.3"/><path d="M1.8 13.5c0-2.4 1.9-4.1 4.2-4.1s4.2 1.7 4.2 4.1"/><circle cx="11.6" cy="5.8" r="1.8"/><path d="M11.4 9.4c1.9 0 3.3 1.4 3.3 3.5"/>',
    gear: A.WI.gear,
    help: '<path d="M5.8 5.6a2.3 2.3 0 014.4.9c0 1.6-2.2 1.8-2.2 3.4M8 12.6h.01" stroke-width="1.5"/>',
    coll: '<rect x="2" y="3" width="12" height="10" rx="1.5"/><path d="M6 3v10M9 6.5L10.5 8 9 9.5"/>',
    home: '<path d="M2.5 7.5L8 3l5.5 4.5V13h-4V9.8h-3V13h-4z"/>',
    homeF: '<path d="M2.5 7.5L8 3l5.5 4.5V13h-4V9.8h-3V13h-4z" fill="currentColor"/>',
    fold: '<path d="M1.5 4.5a1 1 0 011-1H6l1.5 1.8h6a1 1 0 011 1V12a1 1 0 01-1 1h-10a1 1 0 01-1-1z"/>',
    foldF: '<path d="M1.5 4.5a1 1 0 011-1H6l1.5 1.8h6a1 1 0 011 1V12a1 1 0 01-1 1h-10a1 1 0 01-1-1z" fill="currentColor"/>',
    star: '<path d="M8 2l1.8 3.8 4.2.5-3.1 2.9.8 4.1L8 11.3l-3.7 2 .8-4.1L2 6.3l4.2-.5z"/>',
    libs: '<path d="M3 2.5v11M5.5 2.5v11M8 2.5v11"/><path d="M10 3.2l2.2-.6 2.4 10.4-2.2.6z"/>',
    trash: '<path d="M2.5 4.5h11M6.3 4.5V3a.5.5 0 01.5-.5h2.4a.5.5 0 01.5.5v1.5M4 4.5l.7 8.6a1 1 0 001 .9h4.6a1 1 0 001-.9l.7-8.6"/>',
    person: '<circle cx="8" cy="5.3" r="2.6"/><path d="M3 14c0-2.8 2.2-4.6 5-4.6s5 1.8 5 4.6"/>',
    cal: '<rect x="2.5" y="3" width="11" height="10.5" rx="1.5"/><path d="M2.5 6h11M5 8.5h1.2M7.4 8.5h1.2M9.8 8.5h1.2M5 11h1.2M7.4 11h1.2"/>',
    img: '<rect x="2.5" y="2.5" width="11" height="11" rx="2"/><circle cx="6" cy="6" r="1.2"/><path d="M2.8 12l3.6-3.6 3 3 1.6-1.6 2.4 2.4"/>',
    sliders: '<path d="M2.5 5h7.5M13 5h.5M2.5 11h.5M6 11h7.5"/><circle cx="11.5" cy="5" r="1.5"/><circle cx="4.5" cy="11" r="1.5"/>',
    panel: '<rect x="2" y="3" width="12" height="10" rx="1.5"/><path d="M6 3v10M9.5 6.5L8 8l1.5 1.5"/>',
    pen: '<path d="M10.5 2.5l3 3-8 8h-3v-3z"/>'
  };
  for (var k in I) P['od_' + k] = I[k];
  function oi(n, s, c, w) { return ic(P['od_' + n] || P[n], s || 16, c || G, w || 1.1); }
  function fold(shared) { return '<span class="odw-fold"><i></i><b></b>' + (shared ? ic(P.od_ppl, 11, '#7A5A10', 1.2) : '') + '</span>'; }
  function pdf(s) { return '<span style="display:inline-grid;place-items:center;width:' + s + 'px;height:' + s + 'px">' + ic(P.file, s, '#D13438', 1.2) + '</span>'; }

  var FOLD = [
    [t('Ceníky 2026', 'Price lists 2026'), t('02. října', 'October 2'), t('3 položky', '3 items'), 0],
    [t('Fotky z montáže', 'Assembly photos'), t('05. října', 'October 5'), t('12 položek', '12 items'), 1],
    [t('Nabídky', 'Quotes'), t('29. září', 'September 29'), t('4 položky', '4 items'), 0],
    [t('Smlouvy', 'Contracts'), t('18. září', 'September 18'), t('2 položky', '2 items'), 0],
    [t('Soubory z chatu aplikace Microsoft Teams', 'Microsoft Teams Chat Files'), t('05. října', 'October 5'), t('5 položek', '5 items'), 0]
  ];
  /* Moje soubory (o02 / o03). o: {narrow, hv: index řádku} */
  function mine(o) {
    o = o || {};
    var X = { n: 48, d: 375, a: 576, v: 823, s: 933, ac: 1043 };
    var rows = FOLD.map(function (f, i) {
      var nm = o.narrow && f[0].length > 30 ? f[0].slice(0, 29) + '…' : f[0];
      return '<div class="odw-row' + (o.hv === i ? ' hv' : '') + '" id="fr' + i + '"><span style="left:' + 5 + 'px">' + fold(f[3]) + '</span>' +
        '<span style="left:' + X.n + 'px;flex-direction:column;align-items:flex-start;gap:3px">' + nm + '<span class="sub" style="gap:5px">' + t('Upravil(a) Jana Nováková', 'Modified by Jana Nováková') + ' · ' + f[2] + (f[3] ? ' ' + oi('ppl', 13, '#616161', 1.2) : '') + '</span></span>' +
        '<span style="left:' + (o.narrow ? 284 : X.d) + 'px" class="dtc">' + f[1] + '</span><span class="wide" style="left:' + X.a + 'px">Jana Nováková</span><span class="wide" style="left:' + X.v + 'px">' + f[2] + '</span>' +
        '<span class="wide" style="left:' + X.s + 'px"' + (i === 1 ? ' id="shared1"' : '') + '>' + (f[3] ? oi('ppl', 14, G, 1.2) + t('Sdíleno', 'Shared') : t('Soukromé', 'Private')) + '</span></div>';
    }).join('');
    var th = '<div class="odw-th"><span style="left:18px">' + oi('file', 16, G, 1.1) + '</span><span style="left:' + X.n + 'px">' + t('Název', 'Name') + ic(P.chevd, 9, G, 1.5) + '</span>' +
      '<span style="left:' + (o.narrow ? 284 : X.d) + 'px">' + t('Změněno', 'Modified') + ic(P.chevd, 9, G, 1.5) + '</span><span class="wide" style="left:' + X.a + 'px">' + t('Autor změny', 'Modified By') + ic(P.chevd, 9, G, 1.5) + '</span>' +
      '<span class="wide" style="left:' + X.v + 'px">' + t('Velikost…', 'File size…') + ic(P.chevd, 9, G, 1.5) + '</span><span class="wide" style="left:' + X.s + 'px">' + t('Sdílení', 'Sharing') + ic(P.chevd, 9, G, 1.5) + '</span><span class="wide" style="left:' + X.ac + 'px">' + t('Aktivita', 'Activity') + '</span></div>';
    var railI = [['coll', 148], ['home', 184], ['foldF', 220, 1], ['ppl', 256], ['star', 292], ['libs', 328], ['trash', 364], ['chevd', 409], ['person', 444], ['cal', 480], ['img', 516]]
      .map(function (r) { return '<span class="odw-ri' + (r[2] ? ' on' : '') + '" style="top:' + (r[1] - 48 - 9) + 'px">' + oi(r[0], 18, r[2] ? '#1F4FA6' : G, 1.2) + '</span>'; }).join('');
    var sq = [['JO', '#7719AA'], ['JV', '#038387'], ['CF', '#CA5010']].map(function (s, i) { return '<span class="odw-sq" style="top:' + (587 - 48 + i * 36) + 'px;background:' + s[1] + '">' + s[0] + '</span>'; }).join('');
    var top = '<div class="odw-top"><span class="g">' + ic(P.launcher, 16, G) + '</span><b>OneDrive</b>' +
      (o.narrow ? '<span class="ri" style="left:316px">' + ic(P.search, 20, G, 1.2) + '</span>' : '<div class="odw-srch">' + ic(P.search, 18, G, 1.2) + t('Hledat', 'Search') + '</div>') +
      '<span class="ri" style="right:' + (o.narrow ? 155 : 204) + 'px" id="icMon">' + oi('mon', 20, G, 1.2) + '</span><span class="ri" style="right:' + (o.narrow ? 108 : 156) + 'px">' + oi('ppl', 20, G, 1.2) + '</span>' +
      (o.narrow ? '<span class="ri" style="right:60px">' + ic(P.dots, 20, G, 1.4) + '</span>' : '<span class="ri" style="right:108px">' + oi('gear', 20, G, 1.1) + '</span><span class="ri" style="right:60px">' + oi('help', 20, G) + '</span>') +
      '<span class="odw-me">JN</span></div>';
    var pills = '<div class="odw-pills"><span class="odw-pill">' + ic(P.filt, 18, G, 1.3) + '</span><span class="odw-pill">' + A.appIcon('word', 18) + '</span><span class="odw-pill">' + A.appIcon('excel', 18) + '</span><span class="odw-pill">' + A.appIcon('ppt', 18) + '</span><span class="odw-pill">' + pdf(18) + '</span></div>' +
      '<div class="odw-tr"><span>' + oi('sliders', 18, G, 1.2) + '</span><span>' + oi('panel', 18, G, 1.2) + t('Podrobnosti', 'Details') + '</span></div>';
    return '<div class="odw' + (o.narrow ? ' narrow' : '') + '" id="odw" style="' + (o.narrow ? 'width:598px' : '') + '">' + top + '<div class="odw-rail"><span class="odw-plus">' + ic(P.plus, 18, '#fff', 2) + '</span>' + railI +
      '<span class="odw-sep" style="top:' + (554 - 48) + 'px"></span>' + sq + '</div>' +
      '<div class="odw-h1">' + t('Moje soubory', 'My files') + ic(P.chevd, 12, G, 1.6) + '</div>' + pills + '<div class="odw-card">' + th + rows + '</div></div>';
  }
  function narrowFix(on) {
    var w = A.$('odw'); if (!w) return;
    w.classList.toggle('narrow', on);
  }

  /* Domů (o01) – karty Pro vás bez anglických popisků aktivity, seznam Poslední */
  var REC = [
    ['word', t('Nabídka – Penzion U Lípy', 'Quote – U Lípy guesthouse'), t('Javor nábytek – Obchod', 'Javor nábytek – Sales'), t('Dnes v 9:40', 'Today at 9:40'), 'Jana Nováková', 'rDoc'],
    ['excel', t('Ceník 2026', 'Price list 2026'), t('Javor nábytek – Obchod', 'Javor nábytek – Sales'), t('Včera v 16:12', 'Yesterday at 16:12'), 'Lucie Dvořáková', ''],
    ['word', t('Smlouva_Penzion_U_Lipy', 'Contract_U_Lipy_guesthouse'), t('Moje soubory', 'My files'), t('Včera v 11:05', 'Yesterday at 11:05'), 'Jana Nováková', ''],
    ['ppt', t('Prezentace kolekce Dub', 'Oak collection deck'), t('Javor nábytek – Obchod', 'Javor nábytek – Sales'), t('Po v 15:43', 'Mon at 15:43'), 'Petr Svoboda', ''],
    ['pdf', t('Firemní benefity 2026', 'Company benefits 2026'), t('Celá firma', 'Whole company'), '25. 9.', 'Lucie Dvořáková', '']
  ];
  var ACT = [t('dnes', 'today'), t('včera', 'yesterday'), t('včera', 'yesterday'), t('po', 'Mon'), '25. 9.'];
  function home(o) {
    o = o || {};
    var ni = function (y, icon, n, on) { return '<div class="odh-ni' + (on ? ' on' : '') + '" style="top:' + (y - 6) + 'px">' + oi(icon, 10, on ? '#1F4FA6' : G, 1.1) + n + '</div>'; };
    var site = function (y, sq, bg, n) { return '<div class="odh-ni" style="top:' + (y - 6) + 'px"><span class="odw-sq" style="position:static;width:11px;height:11px;font-size:5px;background:' + bg + '">' + sq + '</span>' + n + '</div>'; };
    var nav = '<span class="odh-new">' + ic(P.plus, 9, '#fff', 1.8) + t('Vytvořit nebo nahrát', 'Create or upload') + '</span><div class="odh-nl" style="top:85px">Jana Nováková</div>' +
      ni(111, 'homeF', t('Domů', 'Home'), 1) + ni(133, 'fold', t('Moje soubory', 'My files')) + ni(155, 'ppl', t('Sdílené', 'Shared')) + ni(176, 'star', t('Oblíbené', 'Favorites')) + ni(198, 'libs', t('Knihovny', 'Libraries')) + ni(220, 'trash', t('Koš', 'Recycle bin')) +
      '<div class="odh-nl" style="top:242px">' + t('Procházet soubory podle', 'Browse files by') + '</div>' + ni(268, 'person', t('Lidé', 'People')) + ni(290, 'cal', t('Schůzky', 'Meetings')) + ni(312, 'img', t('Multimédia', 'Media')) +
      '<div class="odh-nl" style="top:334px">' + t('Rychlý přístup', 'Quick access') + '</div>' + site(360, 'JO', '#7719AA', t('Javor nábytek – Obchod', 'Javor nábytek – Sales')) + site(382, 'JV', '#038387', t('Javor nábytek – Výroba', 'Javor nábytek – Production')) + site(403, 'CF', '#CA5010', t('Celá firma', 'Whole company'));
    var icon = function (k2, s) { return k2 === 'pdf' ? pdf(s) : A.appIcon(k2, s); };
    var cards = REC.slice(0, 4).map(function (r, i) {
      return '<div class="odh-card" style="left:' + (179 + i * 264) + 'px"><div class="hd">' + icon(r[0], 11) + r[1] + '</div><div class="th">' + icon(r[0], 14) + '</div><span class="op">' + t('Otevřít', 'Open') + '</span></div>';
    }).join('');
    var rows = REC.map(function (r, i) {
      return '<div class="odh-tr' + (o.hv === i ? ' hv' : '') + '" style="top:' + (27 + i * 34) + 'px"' + (r[5] ? ' id="' + r[5] + '"' : '') + '><span style="left:32px">' + A.fileIco(r[0], 17) + '</span><span class="nm" style="left:60px;display:block"><b>' + r[1] + '</b><small>' + r[2] + '</small></span>' +
        '<span style="left:700px">' + r[3] + '</span><span style="left:820px">' + r[4] + '</span>' +
        '<span style="left:977px">' + oi('pen', 9, G, 1.1) + '<b style="font-weight:600">' + r[4] + '</b>&nbsp;' + t('upravil(a) tento dokument. · ', 'edited this document. · ') + ACT[i] + '</span>' + '</div>';
    }).join('');
    var top = '<div class="odh-top"><span class="g">' + ic(P.launcher, 10, G) + '</span><b>OneDrive</b><div class="odh-srch">' + ic(P.search, 10, G, 1.2) + t('Hledat', 'Search') + '</div>' +
      '<span class="ri" style="right:91px">' + oi('ppl', 11, G, 1.2) + '</span><span class="ri" style="right:63px">' + oi('gear', 11, G, 1.1) + '</span><span class="ri" style="right:35px">' + oi('help', 11, G) + '</span><span class="odh-me">JN</span></div>';
    return '<div class="odh" id="odh">' + top + nav + '<div class="odh-h" style="top:47px">' + t('Pro vás', 'For you') + '</div>' + cards +
      '<div class="odh-h" style="top:222px;font-size:9.2px">' + t('Poslední', 'Recent') + '</div><div class="odh-pills"><span>' + ic(P.filt, 10, G, 1.3) + '</span><span>' + A.appIcon('word', 10) + '</span><span>' + A.appIcon('excel', 10) + '</span><span>' + A.appIcon('ppt', 10) + '</span><span>' + pdf(10) + '</span></div>' +
      '<div class="odh-filt">' + t('Filtrovat podle jména nebo os…', 'Filter by name or person') + '</div>' +
      '<div class="odh-tbl"><div class="odh-th"><span style="left:32px">' + t('Název', 'Name') + '</span><span style="left:700px">' + t('Otevřené', 'Opened') + '</span><span style="left:820px">' + t('Vlastník', 'Owner') + '</span><span style="left:977px">' + t('Aktivita', 'Activity') + '</span></div>' + rows + '</div></div>';
  }
  window.AKO = { mine: mine, narrowFix: narrowFix, home: home };
})();
