/* Akademie – scénář „Úkoly týmu pod kontrolou“: sdílené stavební kusy scén Planneru v Teams.
   Předlohy: _ref/planner/p01–p03 (záložka „+“, Aplikace, hledání), p05 (úvod Planneru), p06 (prázdná záložka), p07–p09 (Vytvořit plán),
   p10–p16 (tabule, nový úkol, termín, přiřazení, kontejner), p17–p23 (detail úkolu), p24–p27 (tabule, dokončení), p28 (Mřížka), p29 (Grafy).
   Lidé, tým, plán a úkoly jsou fiktivní (Javor nábytek). Ikony a ilustrace jsou zjednodušené (bez log a bez obrázků Microsoftu).
   Obsah záložky je v pixelech reference a zvětšený 1,19× (třída .pl); souřadnice v komentářích jsou v tomto systému. */
(function () {
  var A = AK, t = A.t, ic = A.ic, P = A.P, G = '#424242', PU = '#6353E7';
  var K = 1.19;
  var PLAN = t('Zakázky – vybavení penzionu', 'Jobs – guesthouse furniture');
  var PLAN_TAB = t('Zakázky – vybavení p…', 'Jobs – guesthouse fu…');
  var TEAM = t('Javor nábytek – Obchod', 'Javor nábytek – Sales');

  var I = {
    loop: '<path d="M8 2.5a5.5 5.5 0 105.4 6.5"/><path d="M13.5 4v3h-3"/>',
    page: '<path d="M8 2a6 6 0 00-5.2 9l-.8 3 3-.8A6 6 0 108 2z"/><path d="M5.6 8.4l1.6 1.6 3.2-3.4"/>',
    pglink: '<path d="M6.5 9.5l3-3M5 7l-1 1a2.1 2.1 0 003 3l1-1M11 9l1-1a2.1 2.1 0 00-3-3L8 6"/>',
    lst: '<rect x="2.5" y="3" width="11" height="10" rx="1.5"/><path d="M2.5 6.3h11M2.5 9.6h11"/>',
    lstx: '<rect x="2.5" y="3" width="11" height="10" rx="1.5"/><path d="M2.5 6.3h11M2.5 9.6h6"/><path d="M10 10.5l3 3M13 10.5l-3 3"/>',
    appsq: '<rect x="2.5" y="2.5" width="5" height="5" rx="1"/><rect x="8.5" y="2.5" width="5" height="5" rx="1" transform="rotate(10 11 5)"/><rect x="2.5" y="8.5" width="5" height="5" rx="1"/><rect x="8.5" y="8.5" width="5" height="5" rx="1"/>',
    manage: '<rect x="2.5" y="2.5" width="11" height="11" rx="1.5"/><path d="M5 6h6M5 8.5h6M5 11h3"/>',
    grid: '<rect x="2.5" y="2.5" width="11" height="11" rx="1"/><path d="M2.5 6.2h11M2.5 9.8h11M6.2 2.5v11M9.8 2.5v11"/>',
    board: '<rect x="2.5" y="2.5" width="4.6" height="11" rx="1" fill="currentColor"/><rect x="8.9" y="2.5" width="4.6" height="6" rx="1" fill="currentColor"/>',
    boardo: '<rect x="2.5" y="2.5" width="4.6" height="11" rx="1"/><rect x="8.9" y="2.5" width="4.6" height="6" rx="1"/>',
    cal: '<rect x="2.5" y="3" width="11" height="10.5" rx="1.5"/><path d="M2.5 6h11M5 8.5h1.2M7.4 8.5h1.2M9.8 8.5h1.2M5 11h1.2M7.4 11h1.2"/>',
    chart: '<path d="M8 2.5v5.5h5.5A5.5 5.5 0 008 2.5z"/><path d="M6.5 4.2a5 5 0 105.3 7.3"/><path d="M9 10v3.5M11 9v4.5"/>',
    help: '<circle cx="8" cy="8" r="6"/><path d="M6.4 6.5a1.7 1.7 0 013.2.6c0 1.1-1.6 1.3-1.6 2.4M8 11.3h.01"/>',
    assign: '<circle cx="7" cy="5.2" r="2.4"/><path d="M2.5 13.2c0-2.5 2-4.1 4.5-4.1"/><circle cx="11.6" cy="11.6" r="2.7" fill="currentColor"/><path d="M11.6 10.3v2.6M10.3 11.6h2.6" stroke="#fff" stroke-width="1.1"/>',
    tag: '<path d="M2.5 8.2V3.5a1 1 0 011-1h4.7l5.3 5.3-5.7 5.7z"/><circle cx="5.6" cy="5.6" r=".9"/>',
    doc: '<path d="M4 2h5.5L12 4.5V14H4z" fill="currentColor"/><path d="M6 7.5h4M6 10h4" stroke="#fff"/>',
    clip: '<path d="M11 5.5l-5 5a1.5 1.5 0 01-2-2l5.5-5.5a2.5 2.5 0 013.5 3.5L7.5 12"/>',
    chk: '<rect x="2.5" y="2.5" width="11" height="11" rx="1.5"/><path d="M5 8.2l2 2 4-4.4"/>',
    up: '<path d="M8 13V3M4 7l4-4 4 4"/>', down: '<path d="M8 3v10M4 9l4 4 4-4"/>', chu: '<path d="M4 10l4-4 4 4"/>',
    chatf: '<path d="M8 2a6 6 0 00-5.2 9l-.8 3 3-.8A6 6 0 108 2z" fill="currentColor"/><path d="M5.6 7h4.8M5.6 9.4h3" stroke="#fff"/>',
    panel: '<rect x="2" y="3" width="12" height="10" rx="1.5"/><path d="M10 3v10M4.5 6.5h3M4.5 9h3"/>',
    pin: '<path d="M9.5 2.5l4 4-2 1-2.5 2.5.5 2.5-1 1-3-3-3.5 3.5M5.5 7.5l3 3M9.5 2.5l-1 2L6 7l-2.5-.5-1 1"/>',
    ai: '<path d="M8 2.5l1.3 3.2L12.5 7l-3.2 1.3L8 11.5 6.7 8.3 3.5 7l3.2-1.3z"/><path d="M12 11l.6 1.4 1.4.6-1.4.6L12 15l-.6-1.4L10 13l1.4-.6z"/>',
    sendo: '<path d="M14 2L2 7.3l4.6 1.6L14 2zM6.6 8.9L8 14l6-12z"/>',
    bell: '<path d="M4 11V7a4 4 0 018 0v4l1.5 1.5h-11zM6.5 13.5a1.5 1.5 0 003 0"/>',
    excl: '<path d="M8 2.5v7.5" stroke-width="2.4"/><circle cx="8" cy="13" r="1.3" fill="currentColor" stroke="none"/>',
    arrdn: '<path d="M8 2.5v11M4 9.5l4 4 4-4"/>',
    trash: '<path d="M2.5 4.5h11M6.3 4.5V3a.5.5 0 01.5-.5h2.4a.5.5 0 01.5.5v1.5M4 4.5l.7 8.6a1 1 0 001 .9h4.6a1 1 0 001-.9l.7-8.6"/>'
  };
  for (var k in I) P['pn_' + k] = I[k];
  function pi(name, s, c, w) { return ic(P['pn_' + name] || P[name], s, c || G, w || 1.15); }

  /* osoby: bledý kruh s iniciálami (v předlohách fotky skutečných lidí – nahrazeno) */
  var AVC = { PS: ['#CDEFF1', '#0E6E73'], LD: ['#F6E3D8', '#8A4321'], JN: ['#E6E0F6', '#4E3A8C'], PSg: ['#E3CF86', '#4F4110'] };
  var NAME = { PS: 'Petr Svoboda', LD: 'Lucie Dvořáková', JN: 'Jana Nováková' };
  function av(k, s, alt) { var c = AVC[alt || k]; return '<span class="pn-av" style="width:' + s + 'px;height:' + s + 'px;font-size:' + Math.round(s * 0.42) + 'px;background:' + c[0] + ';color:' + c[1] + '">' + k + '</span>'; }
  function pico(s) { return '<span class="pn-ico" style="width:' + s + 'px;height:' + s + 'px">' + ic('<path d="M4.5 8.3l2.4 2.4 4.6-5" stroke-width="1.8"/>', Math.round(s * 0.62), '#fff') + '</span>'; }
  function circ(done) { return '<span class="pn-ck' + (done ? ' done' : '') + '">' + ic('<path d="M4.6 8.3l2.2 2.2 4.4-4.8" stroke-width="1.6"/>', 9, done ? '#fff' : '#616161') + '</span>'; }

  /* ---------- Sdíleno v kanálu (pozadí p01–p05; zúžený panel příkazů podle _ref/pruchod/k1-*) ---------- */
  function sharedBody() {
    var row = function (icon, name, mod, who) {
      return '<div class="sh-row"><span></span><span>' + icon + '</span><span class="nm">' + name + '</span><span class="mod">' + mod + '</span><span><span class="sh-who">' + who + '</span></span><span></span></div>';
    };
    return '<div class="sh-cmd"><span class="sh-crumb">' + t('Dokumenty', 'Documents') + ic(P.chevr, 10, '#616161', 1.4) + '<b>' + t('Nabídky', 'Quotes') + '</b>' + ic(P.chevd, 10, G, 1.5) + '</span>' +
      '<span class="sh-c">' + ic(P.shareo, 13, G, 1.15) + t('Sdílet', 'Share') + '</span><span class="sh-c">' + ic(P.link, 13, G, 1.2) + t('Kopírovat odkaz', 'Copy link') + '</span>' +
      '<span class="sh-c">' + ic(P.shortcut, 12, G, 1.15) + t('Přidat zástupce na OneDrive', 'Add shortcut to OneDrive') + ic(P.chevd, 9, G, 1.5) + '</span><span class="sh-c">' + ic(P.formsi, 12, G, 1.15) + 'Forms</span>' +
      '<span class="sh-c">' + ic(P.dots, 13, G, 1.4) + '</span><span class="sh-vsep"></span><span class="sh-new">' + ic(P.plus, 11, '#fff', 1.8) + t('Vytvořit nebo nahrát', 'Create or upload') + '</span></div>' +
      '<div class="sh-views"><span class="sh-pill on">' + ic(P.lines, 12, G, 1.3) + t('Všechny dokumenty', 'All Documents') + '</span><span class="sh-pill">' + ic(P.inmsg, 12, G, 1.2) + t('Ve zprávách', 'In messages') + '</span>' +
      '<span class="sh-pill">' + ic(P.plus, 11, G, 1.4) + t('Přidat zobrazení', 'Add view') + '</span><span class="sh-vsep"></span><span class="sh-pill ic">' + ic(P.filt, 12, G, 1.3) + '</span>' +
      '<span class="sh-pill ic">' + A.appIcon('word', 12) + '</span><span class="sh-pill ic">' + A.appIcon('excel', 12) + '</span><span class="sh-pill ic">' + A.appIcon('ppt', 12) + '</span><span class="sh-pill ic">' + ic(P.file, 12, '#D13438', 1.3) + '</span>' +
      '<span class="sh-r"><span>' + ic(P.sliders, 13, G, 1.2) + '</span><span>' + ic(P.rpane, 13, G, 1.2) + t('Podrobnosti', 'Details') + '</span></span></div>' +
      '<div class="sh-list"><div class="sh-h"><span></span><span>' + ic(P.file, 12, G, 1.1) + '</span><span>' + t('Název', 'Name') + ic(P.chevd, 8, '#616161', 1.5) + '</span>' +
      '<span>' + t('Změněno', 'Modified') + ic(P.info, 9, '#616161', 1.2) + ic(P.chevd, 8, '#616161', 1.5) + '</span><span>' + t('Autor změny', 'Modified By') + ic(P.chevd, 8, '#616161', 1.5) + '</span>' +
      '<span>' + ic(P.plus, 10, G, 1.3) + t('Přidat sloupec', 'Add column') + '</span></div>' +
      row(A.appIcon('excel', 14), t('Ceník 2026.xlsx', 'Price list 2026.xlsx'), t('1. října', 'October 1'), 'Lucie Dvořáková') +
      row(A.appIcon('word', 14), t('Nabídka – Penzion U Lípy.docx', 'Quote – U Lípy guesthouse.docx'), t('Včera', 'Yesterday'), 'Jana Nováková') +
      row(A.appIcon('word', 14), t('Nabídka – Hotel Pod Skalou.docx', 'Quote – Pod Skalou hotel.docx'), t('24. září', 'September 24'), 'Jana Nováková') +
      row(A.appIcon('ppt', 14), t('Prezentace kolekce Dub.pptx', 'Oak collection deck.pptx'), t('19. září', 'September 19'), 'Petr Svoboda') + '</div>';
  }

  /* celá scéna: kostra Teams (kanál Nabídky) + vrstva překryvů nad celou plochou (#plo) */
  function shell(o) {
    o = o || {};
    var body = o.shared ? sharedBody() : '<div class="pl" id="pl">' + (o.body || '') + '</div>';
    return A.teamsShell({ tab: o.shared ? 1 : 4, extraTab: o.tabLabel, plusOn: o.plusOn, body: body }) + '<div class="plo" id="plo">' + (o.over || '') + '</div>';
  }
  /* poloha prvku na scéně (px scény) */
  function at(el) {
    if (typeof el === 'string') el = A.$(el);
    var st = A.$('stage'), r = el.getBoundingClientRect(), b = st.getBoundingClientRect(), s = b.width / 1160;
    return { x: (r.left - b.left) / s, y: (r.top - b.top) / s, w: r.width / s, h: r.height / s };
  }

  /* ---------- nabídka „+“ u záložek (p01) ---------- */
  function plusMenu(hot) {
    var p = at('tabPlus');
    var it = function (i, icon, n) { return '<div class="it' + (hot === i ? ' hv' : '') + '" id="pm' + i + '">' + pi(icon, 10, G, 1.1) + n + '</div>'; };
    return '<div class="pzat" style="left:' + (p.x + p.w / 2 - 11) + 'px;top:' + (p.y + p.h / 2 + 23) + 'px"><div class="pn-menu">' +
      it(0, 'page', t('Nová stránka', 'New page')) + it(1, 'pglink', t('Existující stránka', 'Existing page')) + it(2, 'lst', t('Nový seznam', 'New list')) +
      it(3, 'lstx', t('Stávající seznam', 'Existing list')) + it(4, 'appsq', t('Aplikace', 'Apps')) + '</div></div>';
  }

  /* ---------- dialog Aplikace (p02 načítání, p03 výsledek hledání) ---------- */
  function appsDlg(o) {
    o = o || {};
    var q = o.q || '';
    var body;
    if (!o.found) {
      body = '';
      for (var i = 0; i < 8; i++) body += '<i class="pn-sk" style="left:' + (46 + i * 63) + 'px;top:52px;width:28px;height:28px;border-radius:4px"></i><i class="pn-sk" style="left:' + (48 + i * 63) + 'px;top:94px;width:24px;height:4px"></i>';
      body += '<div class="pn-sep" style="top:104px">' + t('Přidat novou aplikaci', 'Add a new app') + '</div><i class="pn-sk" style="left:20px;top:129px;width:60px;height:5px"></i><i class="pn-sk" style="left:464px;top:129px;width:22px;height:5px"></i>';
      [155, 200, 245].forEach(function (y) {
        [32, 290].forEach(function (x) { body += '<i class="pn-sk" style="left:' + x + 'px;top:' + y + 'px;width:18px;height:17px;border-radius:3px"></i><i class="pn-sk" style="left:' + (x + 25) + 'px;top:' + (y + 1) + 'px;width:72px;height:5px"></i><i class="pn-sk" style="left:' + (x + 25) + 'px;top:' + (y + 13) + 'px;width:181px;height:5px"></i>'; });
      });
    } else {
      body = '<div style="position:absolute;left:258px;top:65px;text-align:center;width:30px" id="apPl">' + pico(30) + '</div><div style="position:absolute;left:0;right:0;top:103px;text-align:center;font-size:7px">Planner</div>' +
        '<div class="pn-sep" style="top:129px">' + t('Počet výsledků hledání termínu „Planner“: (39)', 'Search results for “Planner”: (39)') + '</div>';
      [[22, 155], [279, 155], [22, 236], [279, 236], [22, 317], [279, 317]].forEach(function (c) {
        body += '<div class="pn-card" style="left:' + c[0] + 'px;top:' + c[1] + 'px"><i class="pn-sk" style="left:11px;top:11px;width:19px;height:19px;border-radius:4px"></i><i class="pn-sk" style="left:37px;top:12px;width:92px;height:5px"></i>' +
          '<i class="pn-sk" style="left:37px;top:23px;width:56px;height:4px"></i><i class="pn-sk" style="left:11px;top:39px;width:205px;height:4px"></i><i class="pn-sk" style="left:11px;top:54px;width:62px;height:4px"></i></div>';
      });
    }
    var input = '<div class="pn-as">' + (q ? '<span id="apQ">' + q + '</span>' : '<span id="apQ"></span><span class="ph" id="apPh"' + (o.typing ? ' hidden' : '') + '>' + t('Hledat aplikace', 'Search apps') + '</span>') + '<span class="caret" id="apCar"' + (o.caret ? '' : ' hidden') + '></span>' +
      (o.found ? ic(P.x, 10, G, 1.2) : ic(P.search, 10, '#616161', 1.3)) + '</div>';
    return '<div class="pzc' + (o.anim ? ' pn-in' : '') + '"><div class="pn-dlg pn-apps">' + input + '<div style="position:absolute;left:0;right:0;top:0;bottom:44px;overflow:hidden">' + body + '</div>' +
      '<div class="pn-aft">' + pi('manage', 10, G, 1.1) + t('Spravovat aplikace', 'Manage apps') + '<span style="margin-left:auto" class="pn-b">' + t('Zavřít', 'Close') + '</span><span class="pn-b pri">' + t('Získat další aplikace', 'Get more apps') + '</span></div></div></div>';
  }

  /* zjednodušená ilustrace tabule (místo obrázků Microsoftu v p05, p07, p08) */
  function miniBoard(w, h, kind) {
    var cols = '', n = kind === 'grid' ? 0 : 4, cw = (w - 30) / 4;
    var colc = ['#8B7CF0', '#7FB2E5', '#B8B8B8', '#E8C36B'];
    for (var i = 0; i < n; i++) {
      cols += '<div style="position:absolute;left:' + (10 + i * (cw + 3)) + 'px;top:' + (h * 0.18) + 'px;width:' + cw + 'px;height:' + (h * 0.6) + 'px;border-radius:3px;background:' + (i === 1 ? '#E3EEFA' : '#F3F1FA') + '">' +
        '<i style="position:absolute;left:5px;right:5px;top:6px;height:3px;border-radius:2px;background:' + colc[i] + '"></i>' +
        '<i style="position:absolute;left:5px;right:5px;top:18px;height:' + (h * 0.22) + 'px;border-radius:3px;background:#fff;box-shadow:0 0 0 1px #E6E3F0"></i></div>';
    }
    if (kind === 'grid') {
      for (var r = 0; r < 6; r++) cols += '<i style="position:absolute;left:12px;right:12px;top:' + (h * 0.22 + r * h * 0.11) + 'px;height:1px;background:#ECEAF3"></i>';
      for (var c = 0; c < 5; c++) cols += '<i style="position:absolute;left:' + (w * 0.25 + c * w * 0.13) + 'px;top:' + (h * 0.3 + (c % 3) * h * 0.11) + 'px;width:' + (w * 0.09) + 'px;height:' + (h * 0.07) + 'px;border-radius:3px;background:' + (c === 2 ? '#DCD5FB' : '#EEEBFA') + '"></i>';
    }
    return '<div class="pn-ill" style="width:' + w + 'px;height:' + h + 'px;position:relative">' + cols + '</div>';
  }

  /* ---------- úvod Planneru (p05) ---------- */
  function introDlg(anim) {
    return '<div class="pzc' + (anim ? ' pn-in' : '') + '"><div class="pn-dlg pn-intro">' +
      '<div style="position:absolute;left:17px;top:25px;display:flex;align-items:center;gap:8px;font-size:8.3px">' + pico(16) + 'Planner</div>' +
      '<span style="position:absolute;left:280px;top:29px;font-size:7.9px;color:#5B5FC7">' + t('Informace', 'About') + '</span><span style="position:absolute;left:332px;top:29px">' + ic(P.x, 10, G, 1.2) + '</span>' +
      '<div style="position:absolute;left:15px;top:59px">' + miniBoard(332, 175) + '</div>' +
      '<b style="position:absolute;left:15px;top:244px;font-size:11.6px;font-weight:600">' + t('Udělejte si pořádek s Plannerem v Teams', 'Get organized with Planner in Teams') + '</b>' +
      '<p style="position:absolute;left:15px;top:270px;font-size:7.9px">' + t('Vytvořte sdílený prostor pro spolupráci na vašich plánech se spolupracovníky.', 'Create a shared space to collaborate on your plans with coworkers.') + '</p>' +
      '<span class="pn-b" style="position:absolute;left:225px;top:320px;width:58px">' + t('Zpět', 'Back') + '</span><span class="pn-b pri" style="position:absolute;left:289px;top:320px;width:58px" id="save">' + t('Uložit', 'Save') + '</span></div></div>';
  }

  /* ---------- prázdná záložka Planner (p06) ---------- */
  function emptyTab() {
    var ill = '<div style="position:relative;width:86px;height:86px;margin:0 auto">' +
      '<i style="position:absolute;left:24px;top:20px;width:44px;height:44px;border-radius:7px;background:linear-gradient(135deg,#F3F3F3,#D9D9D9);box-shadow:0 2px 4px rgba(0,0,0,.15)"></i>' +
      '<i style="position:absolute;left:40px;top:44px;width:40px;height:40px;border-radius:7px;background:linear-gradient(135deg,#EFEFEF,#D4D4D4);box-shadow:0 2px 4px rgba(0,0,0,.15)"></i>' +
      '<span style="position:absolute;left:6px;top:4px;width:28px;height:28px;border-radius:50%;background:linear-gradient(135deg,#E0457B,#7B3FE4);display:grid;place-items:center">' + ic(P.plus, 14, '#fff', 2) + '</span>' +
      '<span style="position:absolute;left:52px;top:14px">' + ic(P.pen, 22, '#2B88D8', 2) + '</span><span style="position:absolute;left:58px;top:52px">' + ic('<path d="M3 13L13 3M7 3h6v6"/>', 22, '#5CB85C', 2.2) + '</span></div>';
    return '<div class="pn-empty" style="top:140px">' + ill + '<b style="margin-top:31px">' + t('Udělejte si pořádek s Plannerem v Teams', 'Get organized with Planner in Teams') + '</b>' +
      '<p>' + t('Vytvořte nový plán nebo připněte existující plán na tento kanál, abyste mohli efektivněji spolupracovat se svými spolupracovníky.', 'Create a new plan or pin an existing plan to this channel so you can collaborate more effectively with your coworkers.') + '</p>' +
      '<div style="margin-top:16px"><span class="pn-b pp" id="newPlan" style="width:117px">' + t('Vytvořit nový plán', 'Create a new plan') + '</span></div>' +
      '<div style="margin-top:10px"><span class="pn-b" style="width:117px">' + t('Přidat existující plán', 'Add existing plan') + '</span></div></div>';
  }

  /* ---------- Vytvořit plán (p07 krok 1, p08/p09 krok 2) – v ztmavené ploše záložky ---------- */
  function createDlg(o) {
    o = o || {};
    var inner;
    if (!o.step2) {
      inner = '<div class="pn-cpl" style="top:43px">' + t('Začít od začátku', 'Start from scratch') + '</div>' +
        '<div class="pn-opt on" style="top:61px">' + ic('<path d="M8 2.5c2.6 2 3.6 4.4 3 7-.4 1.8-1.6 3.4-3 4-1.4-.6-2.6-2.2-3-4-.6-2.6.4-5 3-7z"/>', 11, '#5B5FC7', 1.1) + '<span><b>' + t('Základní plán', 'Basic plan') + '</b><small>' + t('Základní funkce, které vám pomůžou začít.', 'Core features to get you started.') + '</small></span></div>' +
        '<div class="pn-opt" style="top:100px">' + ic('<circle cx="8" cy="8" r="5.5"/><path d="M5.5 8.5a2.5 2.5 0 015 0M8 5.5v.5"/>', 11, '#5B5FC7', 1.1) + '<span><b>' + t('Prémiový plán', 'Premium plan') + '</b><small>' + t('Další funkce pro složité projekty.', 'More features for complex projects.') + '</small></span></div>' +
        '<div class="pn-cpl" style="top:148px">' + t('Zvolit šablonu', 'Choose a template') + '</div>' +
        '<div class="pn-tp">' + ic(P.search, 10, G, 1.3) + '<span class="on">' + t('Od Microsoftu', 'From Microsoft') + '</span><span>' + t('Sdíleno se mnou', 'Shared with me') + '</span><span>' + t('Vytvořeno mnou', 'Created by me') + '</span></div>' +
        '<div style="position:absolute;left:286px;top:85px">' + miniBoard(341, 190) + '</div>' +
        '<div class="pn-cap" style="left:286px;width:341px;text-align:center;top:289px">' + t('Začněte jednoduše. Vizualizujte úkoly v mřížce, na tabuli, v kalendáři nebo pomocí grafů', 'Start simple. Visualize tasks in a grid, on a board, in a calendar or with charts') + '</div>' +
        '<div class="pn-cpf"><span class="pn-b">' + t('Zrušit', 'Cancel') + '</span><span class="pn-b pp" id="cpGo">' + t('Vytvořit základní plán', 'Create basic plan') + '</span></div>';
    } else {
      var has = o.name != null;
      inner = '<div style="position:absolute;left:26px;top:97px">' + miniBoard(342, 191, 'grid') + '</div>' +
        '<div class="pn-cap" style="left:26px;width:342px;text-align:center;top:302px">' + t('Začněte jednoduše. Vizualizujte úkoly v mřížce, na tabuli, v kalendáři nebo pomocí grafů', 'Start simple. Visualize tasks in a grid, on a board, in a calendar or with charts') + '</div>' +
        '<div class="pn-fl" style="top:84px">' + t('Název plánu', 'Plan name') + ' <span style="color:#C4314B">*</span></div>' +
        '<div class="pn-fi foc" style="top:98px" id="nameBox"><span class="ph" id="namePh"' + (has ? ' hidden' : '') + '>' + t('Zadejte název', 'Enter a name') + '</span><span id="nameV">' + (o.name || '') + '</span><span class="caret" id="nameCar"' + (o.caret ? '' : ' hidden') + '></span>' + pi('pin', 10, '#616161', 1.1) + '</div>' +
        '<div class="pn-fl" style="top:128px">' + t('Sdílet se skupinou', 'Share with group') + ic(P.info, 8, '#616161', 1.1) + '</div>' +
        '<div class="pn-fi dis" style="top:142px">' + TEAM + ic(P.chevd, 8, '#A6A6A6', 1.4) + '</div>' +
        '<div class="pn-cpf"><span class="pn-b">' + ic('<path d="M10 4L6 8l4 4"/>', 9, G, 1.4) + t('Zpět', 'Back') + '</span><span class="pn-b ' + (o.ready ? 'pp' : 'off') + '" id="cpGo">' + t('Vytvořit základní plán', 'Create basic plan') + '</span></div>';
    }
    return '<div class="pl-dim on"></div><div class="pn-dlg pn-cp' + (o.anim ? ' pn-fade' : '') + '" style="position:absolute;left:40px;top:50px"><h3>' + t('Vytvořit plán', 'Create a plan') + '</h3><span class="pn-cpx">' + ic(P.x, 10, G, 1.2) + '</span>' + inner + '</div>';
  }

  /* ---------- plán: záhlaví (p10, p28, p29) ---------- */
  function head(view) {
    var v = function (id, icon, n, on) { return '<span class="pn-v' + (on ? ' on' + (view !== 'board' ? ' fill' : '') : '') + '" id="v' + id + '">' + icon + n + '</span>'; };
    return '<div class="pn-ttl">' + PLAN + '</div><span class="pn-dots">' + ic(P.dots, 10, G, 1.4) + '</span>' +
      '<div class="pn-views">' + v('grid', pi('grid', 10, view === 'grid' ? '#5B4FD6' : G, 1.1), t('Mřížka', 'Grid'), view === 'grid') +
      v('board', view === 'board' ? pi('board', 10, '#5B4FD6') : pi('boardo', 10, G, 1.1), t('Panel', 'Board'), view === 'board') +
      v('cal', pi('cal', 10, G, 1.1), t('Kalendář', 'Schedule'), false) + v('charts', pi('chart', 10, view === 'charts' ? '#5B4FD6' : G, 1.1), t('Grafy', 'Charts'), view === 'charts') + '<span class="pn-vsep"></span></div>' +
      '<div class="pn-tool">' + ic(P.search, 10, G, 1.3) + ic(P.filt, 10, G, 1.3) + '</div>' +
      (view === 'board' ? '<div class="pn-grp">' + ic(P.lines, 10, G, 1.3) + t('Seskupit podle: Kontejner', 'Group by: Bucket') + ic(P.chevd, 7, G, 1.5) + '</div>' : '') +
      '<span class="pn-help">' + pi('help', 10, G, 1.05) + '</span>';
  }

  /* ---------- karta úkolu ----------
     x: {id, t: název, date: '08. 10.', who: 'PS', pri: 'imp', st: 'ip', cl: '1/3', hvr: najetí (⋯), hvc: kroužek s fajfkou (p25), done: dokončený (p27)} */
  function task(x) {
    var meta = '';
    if (x.pri || x.st || x.cl) {
      meta = '<div class="pn-tmeta">' + (x.pri === 'imp' ? '<span>' + pi('excl', 9, '#C4314B', 1) + '</span>' : '') + (x.st === 'ip' ? '<span><i class="pn-st ip"></i></span>' : '') +
        (x.cl ? '<span>' + pi('chk', 10, G, 1.05) + x.cl + '</span>' : '') + '</div>';
    }
    var foot = '';
    if (x.done) foot = '<div class="pn-tf dn">' + av('JN', 13) + t('Dokončil(a) Jana Nováková 05. 10.', 'Completed by Jana Nováková 05. 10.') + '</div>';
    else if (x.date || x.who) foot = '<div class="pn-tf">' + (x.date ? pi('cal', 10, G, 1.1) + x.date : '') + '<span class="r">' + (x.who ? pi('assign', 11, '#6353E7', 1.1) + av(x.who, 15) : '') + '</span></div>';
    return '<div class="pn-task' + (x.hvr ? ' hvr' : '') + (x.hvc ? ' hvc' : '') + (x.done ? ' dn' : '') + (x.add ? ' add' : '') + '" id="' + x.id + '"><div class="pn-tt">' + circ(x.done) + '<span class="tx">' + x.t + '</span>' +
      (x.done ? '' : '<span class="more">' + ic(P.dots, 10, G, 1.4) + '</span>') + '</div>' + meta + foot + '</div>';
  }

  /* ---------- nový úkol (p11–p14) ----------
     f: {title, caret, date: '08. 10.' | null, who: 'PS' | null, pop: 'cal' | 'ppl', hot: den pod kurzorem, pplHot} */
  function form(f) {
    var hasT = f.title != null && f.title !== '';
    return '<div class="pn-form" id="tform" style="margin-top:14px">' +
      '<div class="pn-fr" style="top:10px">' + circ(false) + '<span class="pn-fin' + (f.pop ? '' : ' foc') + '" id="tfIn"><span class="ph" id="tfPh"' + (hasT || f.caret ? ' hidden' : '') + '>' + t('Zadejte název úkolu * (povinné).', 'Enter a task name * (required).') + '</span><span id="tfV">' + (hasT ? f.title : '') + '</span><span class="caret" id="tfCar"' + (f.caret ? '' : ' hidden') + '></span></span></div>' +
      '<div class="pn-fr" style="top:35px" id="tfDate">' + pi('cal', 10, G, 1.1) + (f.date ? '<span>' + t('Termín splnění: ', 'Due: ') + f.date + '</span>' : '<span class="' + (f.pop === 'cal' ? 'lk' : '') + '">' + t('Nastavit termín splnění', 'Set due date') + '</span>') + '</div>' +
      '<div class="pn-fr" style="top:58px" id="tfWho">' + pi('assign', 11, G, 1.1) + (f.who ? av(f.who, 13) + '<span>' + NAME[f.who] + '</span>' : '<span class="gr">' + t('Přiřadit', 'Assign') + '</span>') + '</div>' +
      '<span class="pn-b pp pn-fadd" id="tfAdd">' + t('Přidat úkol', 'Add task') + '</span></div>';
  }
  function calGrid(hot, nxt) {
    var days = [t('P', 'M'), t('Ú', 'T'), t('S', 'W'), t('Č', 'T'), t('P', 'F'), t('S', 'S'), t('N', 'S')].map(function (d) { return '<span class="wd">' + d + '</span>'; }).join('');
    var c = [28, 29, 30].map(function (d) { return '<span class="dis">' + d + '</span>'; }).join('');
    for (var d = 1; d <= 31; d++) c += '<span id="' + (nxt || 'cd') + d + '" class="' + (d === 5 ? 'td' : d === hot ? 'hv' : '') + '">' + d + '</span>';
    return '<div class="pn-cg">' + days + c + '<span class="dis">1</span></div>';
  }
  function calPop(hot) {
    return '<div class="pn-pop pn-cal" style="left:48px;top:150px" id="calPop"><span class="hd">' + t('říjen 2026', 'October 2026') + '</span><span class="ar" style="left:104px">' + pi('up', 8, '#BDBDBD', 1.2) + '</span><span class="ar" style="left:121px">' + pi('down', 8, G, 1.2) + '</span>' +
      calGrid(hot) + '<span class="go">' + t('Přejít na dnešek', 'Go to today') + '</span></div>';
  }
  /* výběr osoby (p13, p14, p19) – assigned = přiřazená osoba nahoře */
  function pplPop(left, top, assigned, hot) {
    var rows = function (ks) { return ks.map(function (k2) { return '<div class="pn-pr' + (hot === k2 ? ' hv' : '') + '" id="pp' + k2 + '">' + av(k2, 18) + NAME[k2] + '</div>'; }).join(''); };
    var all = ['PS', 'LD', 'JN'];
    var sug = all.filter(function (k2) { return k2 !== assigned; });
    return '<div class="pn-pop pn-ppl" style="left:' + left + 'px;top:' + top + 'px" id="pplPop"><div class="pn-pin">' + t('Zadejte jméno nebo e-mailovou adresu.', 'Enter a name or email address.') + '</div>' +
      (assigned ? '<div class="lb">' + t('Přiřazeno', 'Assigned') + '</div><div class="pn-pr hv">' + av(assigned, 18) + NAME[assigned] + '<span class="x">' + ic(P.x, 9, G, 1.2) + '</span></div>' : '') +
      '<div class="lb">' + t('Návrhy', 'Suggestions') + '</div>' + rows(sug) + '<div class="end"></div></div>';
  }

  /* ---------- tabule ----------
     o: {cols: [{n: název, tasks: [...]}], form: {...} (v 1. sloupci), cin: {col, text, caret} (zadávání nového kontejneru),
         done: {n, open, task} (Dokončené úkoly v posledním sloupci), over: HTML navíc (dim, detail)} */
  function board(o) {
    var html = head('board');
    (o.cols || []).forEach(function (c, i) {
      var left = 16 + i * 192;
      var list = (i === 0 && o.form) ? form(o.form) : '<div class="pn-add" id="add' + i + '">' + ic(P.plus, 10, G, 1.3) + t('Přidat úkol', 'Add task') + '</div><div style="height:6px"></div>';
      html += '<div class="pn-col" style="left:' + left + 'px" id="col' + i + '"><div class="pn-ch">' + c.n + '</div>' + list + c.tasks.map(task).join('') +
        (o.done && i === o.cols.length - 1 ? '<div class="pn-done-h" id="doneH">' + ic(o.done.open ? P.pn_chu : P.chevd, 8, G, 1.4) + t('Dokončené úkoly', 'Completed tasks') + '<span class="n">' + o.done.n + '</span></div>' + (o.done.open ? '<div style="height:6px"></div>' + task(o.done.task) : '') : '') + '</div>';
    });
    var n = (o.cols || []).length;
    if (o.cin) html += '<div class="pn-cin" style="left:' + (210 + (n - 1) * 192) + 'px" id="cin"><span class="ph" id="cinPh"' + (o.cin.text || o.cin.caret ? ' hidden' : '') + '>' + t('Název kontejneru', 'Bucket name') + '</span><span id="cinV">' + (o.cin.text || '') + '</span><span class="caret" id="cinCar"' + (o.cin.caret ? '' : ' hidden') + '></span></div>';
    else html += '<div class="pn-newc" style="left:' + (206 + (n - 1) * 192) + 'px" id="newc">' + t('Přidat nový kontejner', 'Add new bucket') + '</div>';
    if (o.form && o.form.pop === 'cal') html += calPop(o.form.hot);
    if (o.form && o.form.pop === 'ppl') html += pplPop(27, 183, o.form.who, o.form.pplHot);
    return html + (o.over || '');
  }

  /* ---------- detail úkolu (p17–p23) ----------
     d: {cl: počet položek kontrolního seznamu 0–3, clDone: 0|1, clEdit: psaní nové položky, clText, hvrRow, who, pri: 'mid'|'imp', st: 'ns'|'ip',
         due: '15. 10. 2026', menu: 'ppl'|'pri'|'st'|'cal', hot, anim} */
  function detail(d) {
    var CLI = [t('Rozměry pokojů', 'Room measurements'), t('Ceník dubového masivu', 'Solid oak price list'), t('Termín dodání', 'Delivery date')];
    var st = d.st === 'ip' ? '<i class="pn-st ip"></i>' + t('Probíhá', 'In progress') : '<i class="pn-st ns"></i>' + t('Nezahájeno', 'Not started');
    var pri = d.pri === 'imp' ? pi('excl', 9, '#C4314B', 1) + t('Důležitá', 'Important') : '<i style="width:4px;height:4px;border-radius:50%;background:#2E8B3E;margin:0 2px"></i>' + t('Střední', 'Medium');
    var sel = function (id, x, y, inner, foc, icon) { return '<div class="pn-sel' + (foc ? ' foc' : '') + '" id="' + id + '" style="left:' + x + 'px;top:' + y + 'px">' + inner + (icon || '<span class="cv">' + ic(P.chevd, 8, G, 1.4) + '</span>') + '</div>'; };
    var lab = function (x, y, n, info) { return '<div class="pn-lab" style="left:' + x + 'px;top:' + y + 'px">' + n + (info ? ic(P.info, 8, '#616161', 1.1) : '') + '</div>'; };
    var calI = '<span class="cv">' + pi('cal', 10, G, 1.1) + '</span>';
    var cl = d.cl || 0, clTop = 312;
    var clh = cl ? '<div class="pn-cls" style="top:' + clTop + 'px">' + t('Kontrolní seznam (dokončené položky: ' + (d.clDone || 0) + ' z(e) ' + cl + ')', 'Checklist (completed: ' + (d.clDone || 0) + ' of ' + cl + ')') + '<span class="sh"><i class="sq"></i>' + t('Zobrazit v zobrazení panelu', 'Show on card') + '</span></div>'
      : '<div class="pn-cls" style="top:' + clTop + 'px">' + t('Kontrolní seznam', 'Checklist') + '</div>';
    var items = '';
    for (var i = 0; i < cl; i++) {
      items += '<div class="pn-ci' + (d.hvrRow === i ? ' hvr' : '') + '" style="top:' + (327 + i * 23) + 'px" id="ci' + i + '">' + circ(i === 0 && d.clDone) + '<span class="bx">' + CLI[i] + '</span>' +
        (d.hvrRow === i ? '<span class="ops">' + pi('chu', 8, '#BDBDBD', 1.3) + ic(P.chevd, 8, G, 1.3) + ic(P.plus, 9, G, 1.3) + pi('trash', 9, G, 1.1) + '</span>' : '') + '</div>';
    }
    var addRow = '<div class="pn-ci' + (d.clEdit ? ' ed' : '') + '" style="top:' + (327 + cl * 23) + 'px" id="ciAdd">' + circ(false) + '<span class="bx"><span class="ph" id="ciPh"' + (d.clText || d.clEdit && d.caret ? ' hidden' : '') + '>' +
      (cl || d.clEdit ? t('Přidat položku', 'Add an item') : t('Přidejte kroky k dokončení tohoto úkolu. Označte je jako hotové.', 'Add steps to complete this task. Mark them as done.')) + '</span><span id="ciV">' + (d.clText || '') + '</span><span class="caret" id="ciCar"' + (d.caret ? '' : ' hidden') + '></span></span></div>';
    var notesTop = 327 + (cl + 1) * 23 + 21;
    var left = '<div class="pn-dt">' + circ(false) + t('Připravit nabídku nábytku', 'Prepare furniture quote') + '</div>' +
      '<div class="pn-meta">' + t('Vytvořili jste Před ' + (d.ago || 1) + ' min · Naposledy změněno Před 1 min vámi', 'Created by you ' + (d.ago || 1) + ' min ago · Last changed 1 min ago by you') + ic(P.info, 7, '#616161', 1.1) + '</div>' +
      '<div class="pn-dlr" style="top:59px">' + pi('tag', 10, G, 1.1) + t('Přidat popisek', 'Add label') + '</div>' +
      '<div class="pn-dlr" style="top:86px" id="dWho">' + pi('assign', 11, G, 1.1) + (d.who ? av(d.who, 13) + '<span class="nm">' + NAME[d.who] + '</span>' : t('Přiřadit uživateli', 'Assign')) + '</div>' +
      '<div class="pn-dpills"><span class="pn-dp on">' + pi('doc', 9, '#fff', 1) + t('Podrobnosti o úkolu', 'Task details') + '</span><span class="pn-dp">' + pi('clip', 9, G, 1.1) + t('Přílohy', 'Attachments') + '</span></div>' +
      lab(20, 162, t('Stav', 'Progress')) + lab(215, 162, t('Priorita', 'Priority')) +
      sel('dSt', 20, 175, st, d.menu === 'st') + sel('dPri', 215, 175, pri, d.menu === 'pri') +
      lab(20, 211, t('Počáteční datum', 'Start date')) + lab(215, 211, t('Termín splnění', 'Due date')) +
      sel('dStart', 20, 225, '<span class="ph">' + t('Nastavit datum zahájení', 'Set start date') + '</span>', false, calI) +
      sel('dDue', 215, 225, d.due ? d.due : '<span class="ph">' + t('Nastavit termín splnění', 'Set due date') + '</span>', d.menu === 'cal', calI) +
      lab(20, 261, t('Opakovat', 'Repeat'), 1) + lab(215, 261, t('Kontejner', 'Bucket'), 1) +
      sel('dRep', 20, 275, pi('loop', 10, G, 1.1) + t('Neopakuje se', 'Does not repeat')) + sel('dBkt', 215, 275, t('Úkoly', 'Tasks')) +
      clh + items + addRow +
      '<div class="pn-cls" style="top:' + notesTop + 'px">' + t('Poznámky', 'Notes') + '</div><div class="pn-dlr" style="top:' + (notesTop + 20) + 'px;left:24px">' + t('Sem zadejte popis nebo přidejte poznámky.', 'Type a description or add notes here.') + '</div>' +
      (cl ? '<span class="pn-dscr"></span>' : '');
    var pop = '';
    if (d.menu === 'ppl') pop = pplPop(20, 156, null, d.hot);
    if (d.menu === 'pri') {
      var po = [[pi('bell', 10, '#C4314B', 1.2), t('Naléhavé', 'Urgent')], [pi('excl', 10, '#C4314B', 1), t('Důležitá', 'Important')], ['<i style="width:4px;height:4px;border-radius:50%;background:#2E8B3E;margin:0 3px"></i>', t('Střední', 'Medium')], [pi('arrdn', 10, '#2B67C6', 1.2), t('Nízká', 'Low')]];
      pop = '<div class="pn-pop pn-dd" style="left:215px;top:239px" id="priMenu">' + po.map(function (x, j) { return '<div class="o' + (d.hot === j ? ' hv' : '') + '" id="po' + j + '">' + (j === 2 ? '<span class="k">' + ic(P.chk, 9, G, 1.3) + '</span>' : '') + x[0] + x[1] + '</div>'; }).join('') + '</div>';
    }
    if (d.menu === 'st') {
      var so = [['ns', t('Nezahájeno', 'Not started')], ['ip', t('Probíhá', 'In progress')], ['dn', t('Dokončeno', 'Completed')]];
      pop = '<div class="pn-pop pn-dd" style="left:20px;top:239px" id="stMenu">' + so.map(function (x, j) { return '<div class="o' + (d.hot === j ? ' hv' : '') + '" id="so' + j + '">' + (j === 0 ? '<span class="k">' + ic(P.chk, 9, G, 1.3) + '</span>' : '') + '<i class="pn-st ' + x[0] + '">' + (x[0] === 'dn' ? ic('<path d="M4.6 8.3l2.2 2.2 4.4-4.8" stroke-width="1.8"/>', 7, '#fff') : '') + '</i>' + x[1] + '</div>'; }).join('') + '</div>';
    }
    if (d.menu === 'cal') {
      var months = [t('led', 'Jan'), t('úno', 'Feb'), t('bře', 'Mar'), t('dub', 'Apr'), t('kvě', 'May'), t('čvn', 'Jun'), t('čvc', 'Jul'), t('srp', 'Aug'), t('zář', 'Sep'), t('říj', 'Oct'), t('lis', 'Nov'), t('pro', 'Dec')];
      pop = '<div class="pn-pop pn-dcal" style="left:215px;top:285px" id="dCal"><div class="l"><span class="hd" style="left:14px">' + t('říjen 2026', 'October 2026') + '</span><span class="ar" style="left:98px">' + pi('up', 8, '#BDBDBD', 1.2) + '</span><span class="ar" style="left:115px">' + pi('down', 8, G, 1.2) + '</span>' + calGrid(d.hot, 'dd') + '</div>' +
        '<span class="hd" style="left:147px">2026</span><span class="ar" style="left:231px">' + pi('up', 8, G, 1.2) + '</span><span class="ar" style="left:248px">' + pi('down', 8, G, 1.2) + '</span>' +
        '<div class="pn-mg">' + months.map(function (m) { return '<span>' + m + '</span>'; }).join('') + '</div><span class="go">' + t('Přejít na dnešek', 'Go to today') + '</span></div>';
    }
    var right = '<span class="t">' + t('Chat s úkoly', 'Task chat') + '</span>' +
      '<div style="position:absolute;left:60px;top:126px;width:74px;height:74px">' +
      '<i style="position:absolute;left:8px;top:10px;width:58px;height:50px;border-radius:12px;background:linear-gradient(135deg,#F5F3F9,#E3DEEE);box-shadow:0 3px 8px rgba(0,0,0,.12)"></i>' +
      '<i style="position:absolute;left:22px;top:26px;width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,#7FD3C6,#4B6FD6)"></i>' +
      '<span style="position:absolute;left:52px;top:2px;width:18px;height:18px;border-radius:50%;background:#F06A4F;display:grid;place-items:center">' + ic(P.at, 10, '#fff', 1.4) + '</span></div>' +
      '<b>' + t('Zahájit konverzaci', 'Start a conversation') + '</b><p>' + t('Použijte @zmínky k zapojení spolupracovníků a emoji reakce k rychlému sdílení vašich názorů.', 'Use @mentions to involve coworkers and emoji reactions to quickly share your views.') + '</p>' +
      '<div class="in">' + t('Napište zprávu', 'Type a message') + '<span class="ic">' + pi('ai', 10, G, 1.1) + pi('sendo', 10, G, 1.1) + '</span></div>';
    return '<div class="pl-dim on"></div><div class="pn-det' + (d.anim ? ' in' : '') + '" id="det"><div class="pn-dh"><small>' + PLAN + '</small>' +
      '<span class="i" style="left:513px">' + ic(P.dots, 10, G, 1.4) + '</span><span class="i" style="left:537px">' + pi('panel', 10, G, 1.1) + '</span>' +
      '<span class="i" style="left:561px;background:#ECECEC">' + pi('chatf', 10, '#5B5FC7', 1) + '</span><span class="i" style="left:585px" id="detX">' + ic(P.x, 10, G, 1.2) + '</span></div>' +
      '<div class="pn-dl">' + left + '</div><div class="pn-dr">' + right + '</div>' + pop + '</div>';
  }

  /* ---------- mřížka (p28) ---------- */
  function grid() {
    var X = { n: 9, c: 29, t: 46, who: 274, s: 383, e: 474, d: 564, b: 655, st: 750, pr: 841, lb: 926, gl: 1047, qv: 1156 };
    var hd = [['t', t('Název úkolu', 'Task name')], ['who', t('Přiřazeno uživateli', 'Assigned to')], ['s', t('Spustit', 'Start')], ['e', t('Dokončit', 'Finish')], ['d', t('Termín', 'Due')],
      ['b', t('Kontejner', 'Bucket')], ['st', t('Stav', 'Progress')], ['pr', t('Priorita', 'Priority')], ['lb', t('Popisky', 'Labels')], ['gl', 'Goals'], ['qv', t('Rychlý náhled', 'Quick look')]];
    var mid = '<i style="width:4px;height:4px;border-radius:50%;background:#2E8B3E;margin:0 2px"></i>' + t('Střední', 'Medium');
    var ns = '<i class="pn-st ns"></i>' + t('Nezahájeno', 'Not started');
    var rows = [
      { dn: 1, t: t('Zaměřit pokoje v penzionu', 'Measure guesthouse rooms'), who: av('PS', 13, 'PSg') + 'Petr Svoboda', d: '08.10.26', b: t('Hotovo', 'Done'), st: '<i class="pn-st dn">' + ic('<path d="M4.6 8.3l2.2 2.2 4.4-4.8" stroke-width="1.8"/>', 7, '#fff') + '</i>' + t('Dokončeno', 'Completed'), pr: mid },
      { t: t('Objednat vzorky dubu', 'Order oak samples'), b: t('Probíhá', 'In progress'), st: ns, pr: mid },
      { t: t('Připravit nabídku nábytku', 'Prepare furniture quote'), who: av('JN', 13) + 'Jana Nováková', d: '15.10.26', b: t('Probíhá', 'In progress'), st: '<i class="pn-st ip"></i>' + t('Probíhá', 'In progress'), pr: pi('excl', 9, '#C4314B', 1) + t('Důležitá', 'Important'), qv: pi('chk', 9, G, 1.05) + '1/3' },
      { t: t('Domluvit termín montáže', 'Arrange assembly date'), b: t('Úkoly', 'Tasks'), st: ns, pr: mid },
      { t: t('Poslat podklady pro fakturu', 'Send invoice details'), b: t('Úkoly', 'Tasks'), st: ns, pr: mid }
    ];
    var h = '<div class="pn-gh">' + hd.map(function (x) { return '<span style="left:' + X[x[0]] + 'px">' + x[1] + '</span>'; }).join('') + '</div>';
    rows.forEach(function (r, i) {
      h += '<div class="pn-gr' + (r.dn ? ' dn' : '') + '" style="top:' + (72 + i * 26.5) + 'px"><span class="n" style="left:' + X.n + 'px">' + (i + 1) + '</span><span style="left:' + (X.c - 2) + 'px">' + circ(r.dn) + '</span>' +
        '<span class="t" style="left:' + X.t + 'px">' + r.t + '</span>' + (r.who ? '<span style="left:' + X.who + 'px">' + r.who + '</span>' : '') + (r.d ? '<span style="left:' + (X.d + 3) + 'px">' + r.d + '</span>' : '') +
        '<span style="left:' + X.b + 'px">' + r.b + '</span><span style="left:' + X.st + 'px">' + r.st + '</span><span style="left:' + X.pr + 'px">' + r.pr + '</span>' + (r.qv ? '<span style="left:' + (X.qv + 2) + 'px">' + r.qv + '</span>' : '') + '</div>';
    });
    h += '<div class="pn-gadd" style="top:213px">' + ic(P.plus, 10, '#5B5FC7', 1.3) + t('Přidat nový úkol', 'Add new task') + '</div><div class="pn-gscr" style="top:237px"></div>';
    return head('grid') + '<div id="gview" class="pn-fade">' + h + '</div>';
  }

  /* ---------- grafy (p29) ---------- */
  var CC = { ns: '#C4BAFF', ip: '#4C41E5', late: '#D13438', dn: '#3EBA9F' };
  function legend(top, four) {
    var it = [['ns', t('Nezahájeno', 'Not started')], ['ip', t('Probíhá', 'In progress')]].concat(four ? [['late', t('Zpožděné', 'Late')]] : []).concat([['dn', t('Dokončeno', 'Completed')]]);
    return '<div class="pn-leg" style="top:' + top + 'px">' + it.map(function (x) { return '<span><i style="background:' + CC[x[0]] + '"></i>' + x[1] + '</span>'; }).join('') + '</div>';
  }
  function bars(w, max, cats, data) {
    /* osa: základna y=150, výška max = 125 (v kartě pod hlavičkou 28 px) */
    var x0 = 22, x1 = w - 12, base = 150, hgt = 125, s = '';
    for (var v = 0; v <= max; v++) {
      var y = base - hgt * v / max;
      s += '<line x1="' + x0 + '" x2="' + x1 + '" y1="' + y + '" y2="' + y + '" stroke="#E6E6E6" stroke-width="0.8"/><text x="' + (x0 - 8) + '" y="' + (y + 2) + '" font-size="5.5" fill="#424242">' + v + '</text>';
    }
    var step = (x1 - x0 - 30) / (cats.length - 1);
    cats.forEach(function (c, i) {
      var cx = x0 + 15 + i * step, y = base;
      (data[i] || []).forEach(function (seg) { var hh = hgt * seg[1] / max; y -= hh; s += '<rect x="' + (cx - 7) + '" y="' + y + '" width="14" height="' + hh + '" fill="' + CC[seg[0]] + '"/>'; });
      s += '<text x="' + cx + '" y="' + (base + 10) + '" font-size="5.6" fill="#242424" text-anchor="middle">' + c + '</text>';
    });
    return '<svg width="' + w + '" height="170" style="position:absolute;left:0;top:30px">' + s + '</svg>';
  }
  function charts() {
    var W = 723, cw = Math.floor((W - 40 - 26) / 3);
    var donut = function () {
      var r = 57, cx = cw / 2, cy = 86, C = 2 * Math.PI * r, segs = [['ns', 3], ['ip', 1], ['dn', 1]], off = 0, s = '';
      segs.forEach(function (g) { var len = C * g[1] / 5; s += '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="' + CC[g[0]] + '" stroke-width="13" stroke-dasharray="' + (len - 1.5) + ' ' + (C - len + 1.5) + '" stroke-dashoffset="' + (-off) + '" transform="rotate(-90 ' + cx + ' ' + cy + ')"/>'; off += len; });
      return '<svg width="' + cw + '" height="170" style="position:absolute;left:0;top:30px">' + s + '<text x="' + cx + '" y="' + (cy - 1) + '" font-size="16" font-weight="600" text-anchor="middle" fill="#242424">4</text><text x="' + cx + '" y="' + (cy + 13) + '" font-size="7.6" text-anchor="middle" fill="#242424">' + t('Zbývající úkoly', 'Remaining tasks') + '</text></svg>';
    };
    var card = function (x, y, w, title, inner, leg) { return '<div class="pn-chc" style="left:' + x + 'px;top:' + y + 'px;width:' + w + 'px;height:242px"><div class="h">' + title + '</div>' + inner + leg + '</div>'; };
    var h = card(20, 61, cw, t('Stav', 'Progress'), donut(), legend(222, false)) +
      card(20 + cw + 13, 61, cw, t('Priorita', 'Priority'), bars(cw, 4, [t('Naléhavé', 'Urgent'), t('Důležitá', 'Important'), t('Střední', 'Medium'), t('Nízká', 'Low')], [[], [['ip', 1]], [['ns', 3], ['dn', 1]], []]), legend(222, true)) +
      card(20 + 2 * (cw + 13), 61, cw, t('Kontejner', 'Bucket'), bars(cw, 2, [t('Úkoly', 'Tasks'), t('Probíhá', 'In progress'), t('Hotovo', 'Done')], [[['ns', 2]], [['ns', 1], ['ip', 1]], [['dn', 1]]]), legend(222, true)) +
      card(20, 316, W - 40, t('Členové', 'Members'), bars(W - 40, 3, [t('Nepřiřazeno', 'Unassigned'), 'Petr Svoboda', 'Jana Nováková'], [[['ns', 3]], [['dn', 1]], [['ip', 1]]]), legend(222, true));
    return head('charts') + '<div id="cview" class="pn-fade">' + h + '</div>';
  }

  /* výchozí úkoly scénáře (p16, p17, p24) */
  var T = {
    zam: function (x) { return Object.assign({ id: 'tZam', t: t('Zaměřit pokoje v penzionu', 'Measure guesthouse rooms'), date: '08. 10.', who: 'PS' }, x || {}); },
    obj: function (x) { return Object.assign({ id: 'tObj', t: t('Objednat vzorky dubu', 'Order oak samples') }, x || {}); },
    pri: function (x) { return Object.assign({ id: 'tPri', t: t('Připravit nabídku nábytku', 'Prepare furniture quote') }, x || {}); },
    dom: function (x) { return Object.assign({ id: 'tDom', t: t('Domluvit termín montáže', 'Arrange assembly date') }, x || {}); },
    pos: function (x) { return Object.assign({ id: 'tPos', t: t('Poslat podklady pro fakturu', 'Send invoice details') }, x || {}); }
  };
  var COLN = [t('Úkoly', 'Tasks'), t('Probíhá', 'In progress'), t('Hotovo', 'Done')];

  window.AKP = {
    K: K, PLAN: PLAN, PLAN_TAB: PLAN_TAB, T: T, COLN: COLN, shell: shell, at: at, plusMenu: plusMenu, appsDlg: appsDlg, introDlg: introDlg,
    emptyTab: emptyTab, createDlg: createDlg, board: board, detail: detail, grid: grid, charts: charts, head: head
  };
})();
