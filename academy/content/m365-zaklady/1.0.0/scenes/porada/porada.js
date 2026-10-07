/* Akademie – scénář „Porada v Teams“ (příprava): sdílené stavební kusy scén kalendáře a nové schůzky v Teams.
   Předlohy: _ref/porada/m00 (týdenní kalendář), m01 (Nová schůzka), m02 (účastník, Navrženo), m03–m04 (Přidat kanál),
   m05 (Automatické nahrávání a přepis), m06 (vybraný kanál, Poslat osobní pozvánky), m07 (agenda se načítá, jazyk schůzky),
   m08–m10 (agenda jako komponenta Loop), m11 (Pomocník pro plánování).
   Lidé, týmy a události v kalendáři jsou fiktivní (Javor nábytek). Ikony jsou zjednodušené (bez log). Souřadnice = px reference. */
(function () {
  var A = AK, t = A.t, ic = A.ic, P = A.P, G = '#424242', PU = '#5B5FC7';
  var TITLE = t('Zahájení zakázky Penzion U Lípy', 'U Lípy guesthouse job kick-off');
  var TEAM = t('Javor nábytek – Obchod', 'Javor nábytek – Sales');
  var CHAN = t('Nabídky', 'Quotes');
  var I = {
    clock: '<circle cx="8" cy="8" r="5.6"/><path d="M8 5v3.2l2 1.3"/>',
    rep: '<path d="M3 7a5 5 0 019-2.5M13 9a5 5 0 01-9 2.5"/><path d="M12 2v2.8H9.2M4 14v-2.8h2.8"/>',
    chan: '<rect x="3" y="2.5" width="10" height="11" rx="1.5"/><path d="M5.5 6h5M5.5 8.5h5M5.5 11h3"/>',
    loc: '<path d="M8 14s4.5-4.1 4.5-7.5a4.5 4.5 0 00-9 0C3.5 9.9 8 14 8 14z"/><circle cx="8" cy="6.5" r="1.6"/>',
    lines: '<path d="M2.5 4h11M5.5 8h8M5.5 12h8"/><path d="M2.5 8h.01M2.5 12h.01"/>',
    agenda: '<rect x="3" y="2.5" width="10" height="11" rx="1.5"/><path d="M5.5 6h5M5.5 8.5h3"/><path d="M9 13.5v-2.5h4"/>',
    cal: '<rect x="2.5" y="3" width="11" height="10.5" rx="1.5"/><path d="M2.5 6h11M5 8.5h1.2M7.4 8.5h1.2M9.8 8.5h1.2M5 11h1.2M7.4 11h1.2"/>',
    addp: '<circle cx="6.5" cy="5.2" r="2.4"/><path d="M2.3 13.2c0-2.4 1.9-4 4.2-4"/><circle cx="11.4" cy="11.4" r="2.6" fill="currentColor"/><path d="M11.4 10.1v2.6M10.1 11.4h2.6" stroke="#fff" stroke-width="1.1"/>',
    addp2: '<circle cx="6" cy="5.2" r="2.3"/><path d="M1.8 13.5c0-2.4 1.9-4.1 4.2-4.1"/><circle cx="11.6" cy="5.8" r="1.8"/><circle cx="11.6" cy="11.6" r="2.6"/><path d="M11.6 10.4v2.4M10.4 11.6h2.4"/>',
    col: '<rect x="2" y="3" width="12" height="10" rx="1.5"/><path d="M10 3v10M6.5 6.5L8 8 6.5 9.5"/>',
    sidebar: '<rect x="2" y="3" width="12" height="10" rx="1.5"/><path d="M6 3v10"/>',
    today: '<rect x="2.5" y="3" width="11" height="10.5" rx="1.5"/><path d="M2.5 6h11"/><rect x="5" y="8.5" width="2.5" height="2.5" fill="currentColor"/>',
    shield: '<path d="M8 2l5 2v4c0 3-2.2 5-5 6-2.8-1-5-3-5-6V4z"/><path d="M8 5.5v3M8 10.5h.01"/>',
    apps: '<circle cx="5" cy="5" r="2"/><circle cx="11" cy="5" r="2"/><circle cx="5" cy="11" r="2"/><circle cx="11" cy="11" r="2"/>',
    copy: '<rect x="5" y="5" width="8.5" height="8.5" rx="1.5"/><path d="M3 10.5V3.5A1 1 0 014 2.5h7"/>',
    share: '<circle cx="6.5" cy="5.2" r="2.4"/><path d="M2.3 13.2c0-2.4 1.9-4 4.2-4"/><path d="M10 9.5l2 2 2-2M12 11.5V7"/>',
    sort: '<path d="M5 13V3M2.5 5.5L5 3l2.5 2.5M11 3v10M8.5 10.5L11 13l2.5-2.5"/>',
    grid: '<rect x="2.5" y="2.5" width="11" height="11" rx="1"/><path d="M2.5 6.2h11M2.5 9.8h11M6.2 2.5v11"/>',
    bold: '<path d="M5 3h4a2.5 2.5 0 010 5H5zM5 8h4.5a2.5 2.5 0 010 5H5z" stroke-width="1.6"/>'
  };
  for (var k in I) P['mt_' + k] = I[k];
  function mi(n, s, c, w) { return ic(P['mt_' + n] || P[n], s || 10, c || G, w || 1.1); }

  /* ---------- kostra okna (horní lišta + pruh ikon, aktivní Kalendář) ---------- */
  function chrome(main) {
    var r = function (y, html, on) { return '<span class="r' + (on ? ' on' : '') + '" style="top:' + y + 'px">' + html + '</span>'; };
    var rail = r(-1, ic(P.bell, 12, G, 1.15) + '<i class="mt-badge">6</i>') + r(26, ic(P.inmsg, 12, G, 1.1)) + r(53, mi('cal', 12, PU, 1.3), true) +
      r(80, ic(P.call, 12, G, 1.15)) + r(106, ic(P.cloud, 12, G, 1.15)) + r(133, ic(P.sqplus, 12, G, 1.15)) + r(159, ic(P.dots, 12, G, 1.4));
    return '<div class="mt" id="mt"><div class="mt-top"><span class="i" style="left:14px">' + ic(P.launcher, 11, G) + '</span><span class="i" style="left:46px">' + mi('sidebar', 11) + '</span>' +
      '<div class="mt-srch">' + ic(P.search, 9, '#616161', 1.3) + t('Hledat (Ctrl+Alt+E)', 'Search (Ctrl+Alt+E)') + '</div>' +
      '<span class="i" style="right:36px">' + ic(P.dots, 11, G, 1.4) + '</span><span class="mt-me">' + A.av('JN', 17) + '</span></div>' +
      '<div class="mt-rail">' + rail + '</div><div class="mt-main" id="mtMain">' + main + '</div></div>';
  }

  /* ---------- týdenní kalendář (m00) – vlastní události nahrazené jednou fiktivní ---------- */
  function calendar() {
    var mg = [t('N', 'S'), t('P', 'M'), t('Ú', 'T'), t('S', 'W'), t('Č', 'T'), t('P', 'F'), t('S', 'S')].map(function (d) { return '<span>' + d + '</span>'; }).join('');
    [27, 28, 29, 30, 1, 2, 3].forEach(function (d) { mg += '<span>' + d + '</span>'; });
    for (var d = 4; d <= 31; d++) mg += '<span class="' + (d >= 4 && d <= 10 ? 'wk ' + (d === 4 ? 'l' : d === 10 ? 'r' : 'm') : '') + (d === 5 ? ' td' : '') + '">' + d + '</span>';
    var nav = '<div class="mt-cnav"><h3>' + t('Kalendář', 'Calendar') + '</h3><div class="mt-mm"><div class="hd">' + ic(P.chevd, 7, G, 1.4) + t('říjen 2026', 'October 2026') + '<span class="ar">' + ic('<path d="M8 13V3M4 7l4-4 4 4"/>', 7, G, 1.2) + ic('<path d="M8 3v10M4 9l4 4 4-4"/>', 7, G, 1.2) + '</span></div><div class="mt-mg">' + mg + '</div></div>' +
      '<div class="mt-cl" style="top:182px">' + mi('cal', 10, G) + t('Přidat kalendář', 'Add calendar') + '</div>' +
      '<div class="mt-cl" style="top:211px">' + ic(P.chevd, 7, G, 1.4) + t('Moje kalendáře', 'My calendars') + '</div>' +
      '<div class="mt-cl" style="top:234px"><span style="width:9px;height:9px;border-radius:50%;background:' + PU + ';display:grid;place-items:center">' + ic(P.chk, 7, '#fff', 1.8) + '</span>Calendar</div>' +
      '<div class="mt-cl" style="top:262px;left:24px">' + t('Zobrazit vše', 'Show all') + '</div></div>';
    var tb = '<div class="mt-ctb">' + mi('sidebar', 10) + '<span style="display:flex;align-items:center;gap:4px">' + mi('today', 10) + t('Dnes', 'Today') + '</span>' + ic('<path d="M10 4L6 8l4 4"/>', 9, G, 1.3) + ic('<path d="M6 4l4 4-4 4"/>', 9, G, 1.3) +
      '<span style="display:flex;align-items:center;gap:4px">' + t('05.–09. říjen 2026', 'October 05–09, 2026') + ic(P.chevd, 7, G, 1.4) + '</span>' +
      '<span class="r"><span style="display:flex;align-items:center;gap:4px">' + mi('cal', 9) + t('Pracovní týden', 'Work week') + ic(P.chevd, 7, G, 1.4) + '</span>' +
      '<span style="display:flex;align-items:center;gap:4px">' + ic(P.filt, 9, G, 1.3) + t('Použít filtr', 'Filter') + ic(P.chevd, 7, G, 1.4) + '</span>' + ic(P.dots, 9, G, 1.4) + '<span class="sep"></span>' +
      '<span style="display:flex;align-items:center;gap:4px">' + ic(P.video, 10, G, 1.2) + t('Okamžitá schůzka', 'Meet now') + ic(P.chevd, 7, G, 1.4) + '</span>' +
      '<span class="mt-new" id="bNew"><span>' + ic(P.plus, 8, '#fff', 1.8) + t('Nová', 'New') + '</span><span>' + ic(P.chevd, 7, '#fff', 1.5) + '</span></span></span></div>';
    /* sloupce dnů v poměru předlohy (Po a Út širší) */
    var W = 935 - 142 - 30 - 12, ratio = [232, 201, 113, 114, 113], sum = 773, x = 30, cols = [];
    ratio.forEach(function (r) { var w = W * r / sum; cols.push([x, w]); x += w; });
    var names = [t('Pondělí', 'Monday'), t('Úterý', 'Tuesday'), t('Středa', 'Wednesday'), t('Čtvrtek', 'Thursday'), t('Pátek', 'Friday')];
    var days = '';
    for (var h = 9; h <= 19; h++) days += '<div class="mt-hr" style="top:' + (36 + (h - 9) * 48.3) + 'px"><span>' + h + '</span></div>';
    cols.forEach(function (c, i) {
      days += '<div class="mt-dh' + (i === 0 ? ' on' : '') + '" style="left:' + c[0] + 'px;width:' + c[1] + 'px"><b>' + (5 + i) + '</b><small>' + names[i] + '</small></div>';
      days += '<i class="mt-vl" style="left:' + c[0] + 'px"></i>';
    });
    var y = function (hh) { return 36 + (hh - 9) * 48.3; };
    days += '<div class="mt-ev" style="left:' + (cols[1][0] + 2) + 'px;width:' + (cols[1][1] - 6) + 'px;top:' + (y(10) + 1) + 'px;height:' + (48.3 - 3) + 'px">' + t('Porada obchodu', 'Sales meeting') + '</div>';
    days += '<div class="mt-now" style="left:' + cols[0][0] + 'px;width:' + cols[0][1] + 'px;top:' + y(13.92) + 'px"></div>';
    days += '<div class="mt-blk" style="left:' + cols[0][0] + 'px;width:' + cols[0][1] + 'px;top:' + y(14.5) + 'px;height:24px"></div>';
    return nav + tb + '<div class="mt-days">' + days + '</div>';
  }

  /* ---------- nová schůzka (m01–m10) ----------
     o: {title: text | '', titleCaret, att: null | {typed} | 'chip', chan: null | 'list' | {q} | 'set', chanHot, rec: 'off' | 'menu' | 'on', recHot,
         agenda: null | 'load' | 'loop', items: [..], itemCaret, scroll, tab: 0 | 1} */
  function form(o) {
    o = o || {};
    var chip = o.att === 'chip';
    var head = '<div class="mt-fh"><span class="ic">' + mi('cal', 11, '#fff', 1.3) + '</span><b>' + t('Nová schůzka', 'New meeting') + '</b>' +
      '<span class="mt-tab' + (o.tab ? '' : ' on') + '" style="left:117px" id="tabDet">' + t('Podrobnosti', 'Details') + '</span>' +
      '<span class="mt-tab' + (o.tab ? ' on' : '') + '" style="left:174px" id="tabSa">' + t('Pomocník pro plánování', 'Scheduling Assistant') + '</span>' +
      '<span class="mt-btn pri" style="right:68px" id="send">' + (chip ? t('Poslat', 'Send') : t('Uložit', 'Save')) + '</span><span class="mt-btn" style="right:6px">' + t('Zavřít', 'Close') + '</span></div>' +
      '<div class="mt-filt"><span>' + t('Zobrazit jako: Nemám čas', 'Show as: Busy') + ic(P.chevd, 7, G, 1.4) + '</span><span' + (o.chan === 'set' ? ' class="dis"' : '') + '>' + t('Kategorie: žádná', 'Category: none') + ic(P.chevd, 7, o.chan === 'set' ? '#BDBDBD' : G, 1.4) + '</span>' +
      '<span>' + t('Časové pásmo:', 'Time zone:') + (chip ? ' ' + t('(UTC+01:00) Praha, Bratislava, Budapešť, Bělehrad, Lublaň', '(UTC+01:00) Prague, Bratislava, Budapest, Belgrade, Ljubljana') : '') + ic(P.chevd, 7, G, 1.4) + '</span>' +
      '<span>' + t('Možnosti odpovědi', 'Response options') + ic(P.chevd, 7, G, 1.4) + '</span></div><i class="mt-fl"></i>';
    var timeRow = '<div class="mt-tr"><span class="mt-box" style="width:81px">5. 10. 2026' + mi('cal', 9) + '</span><span class="mt-box" style="width:59px">14:30' + ic(P.chevd, 7, G, 1.4) + '</span>' +
      ic('<path d="M2.5 8h11M10 4.5L13.5 8 10 11.5"/>', 10, G, 1.1) + '<span class="mt-box" style="width:81px">5. 10. 2026' + mi('cal', 9) + '</span><span class="mt-box" style="width:59px">15:00' + ic(P.chevd, 7, G, 1.4) + '</span>' +
      '<span style="color:#424242">30 min</span><span class="mt-tog"></span><span>' + t('Celodenní', 'All day') + '</span></div>';
    var sa = o.tab === 1;
    if (sa) return head + scheduling(timeRow);
    var row = function (icon, inner, extra, top) { return '<div class="mt-row' + (top ? ' top' : '') + '"' + (extra || '') + '><span class="ri">' + mi(icon, 10) + '</span>' + inner + '</div>'; };
    var hasT = o.title != null && o.title !== '';
    var title = row('pen', '<div class="mt-f' + (o.titleCaret ? ' foc' : '') + '"><span id="tV">' + (hasT ? o.title : '') + '</span><span class="caret" id="tCar"' + (o.titleCaret ? '' : ' hidden') + '></span></div>');
    var att;
    if (chip) att = '<div class="mt-f' + (o.attFoc ? ' foc' : '') + '" style="height:29px;padding-left:3px"><span class="mt-chip' + (o.chipIn ? ' sr-in' : '') + '">' + A.av('PS', 16) + '<span><b>Petr Svoboda</b><small>' + t('Volno', 'Free') + '</small></span>' + ic(P.x, 7, G, 1.3) + '</span>' + (o.attFoc ? '<span class="caret"></span>' : '') + '<span class="rt opt">+ ' + t('Nepovinní', 'Optional') + '</span></div>';
    else {
      var ty = o.att && o.att.typed != null;
      att = '<div class="mt-f' + (ty ? ' foc' : '') + '" style="height:29px" id="attF"><span class="ph" id="attPh"' + (ty ? ' hidden' : '') + '>' + t('Přidat povinné účastníky', 'Add required attendees') + '</span><span id="attV">' + (ty ? o.att.typed : '') + '</span><span class="caret" id="attCar"' + (ty ? '' : ' hidden') + '></span><span class="rt opt">+ ' + t('Nepovinní', 'Optional') + '</span></div>';
    }
    var sug = chip ? '<div class="mt-sug" id="sug">' + t('Navrženo:', 'Suggested:') + '<a id="sg0">14:30 – 15:00</a><a id="sg1">15:00 – 15:30</a><a id="sg2">15:30 – 16:00</a></div>' : '';
    var chan;
    if (o.chan === 'set') chan = '<div class="mt-f" id="chanF"><span class="mt-tsq" style="background:#107C10;margin-right:6px">J</span><span style="color:#424242">' + TEAM + '</span>' + ic(P.chevr, 7, '#8A8A8A', 1.3) + '<span style="margin-left:5px;color:#424242">' + CHAN + '</span>' +
      '<span class="rt"><span class="mt-tog"></span>' + t('Poslat osobní pozvánky', 'Send personal invites') + ic(P.info, 8, '#616161', 1.1) + '</span></div>';
    else {
      var q = o.chan && o.chan.q != null ? o.chan.q : null;
      chan = '<div class="mt-f' + (o.chan ? ' foc' : '') + '" id="chanF"><span' + (q != null ? ' hidden' : '') + ' id="chPh">' + t('Přidat kanál', 'Add channel') + '</span><span id="chV">' + (q || '') + '</span><span class="caret" id="chCar"' + (q != null ? '' : ' hidden') + '></span></div>';
    }
    var loc = '<div class="mt-f" style="height:28px">' + t('Přidat místo', 'Add location') + (o.chan === 'set' ? '' : '<span class="rt">' + t('Online schůzka', 'Online meeting') + '<span class="mt-tog on"></span></span>') + '</div>';
    var tbI = ['bold', '<text x="8" y="12" font-size="11" font-style="italic" font-family="Georgia,serif" fill="#424242" stroke="none" text-anchor="middle">I</text>', '<path d="M5 3v5a3 3 0 006 0V3M4 13.5h8"/>', '<path d="M4 8h8M10.5 4.5C9.8 3.5 8.9 3 7.8 3 6.3 3 5.2 3.8 5.2 5c0 2.6 5.6 1.4 5.6 4.6 0 1.3-1.2 2.4-3 2.4-1.2 0-2.3-.6-2.9-1.5"/>'];
    var ed = '<div class="mt-ed"><div class="tb">' + tbI.map(function (p, i) { return i === 0 ? mi('bold', 9) : ic(p, 9, G, 1.1); }).join('') + '<span class="s"></span>' +
      ic(P.hilite, 9, G, 1.1) + ic(P.fcolor, 9, G, 1.1) + ic(P.fsize, 9, G, 1.1) + '<span style="font-size:6.6px;color:#424242;display:flex;align-items:center;gap:2px">' + t('Odstavec', 'Paragraph') + ic(P.chevd, 6, G, 1.4) + '</span><span class="s"></span>' +
      ic(P.lines, 9, G, 1.1) + ic(P.lines, 9, G, 1.1) + ic(P.bul, 9, G, 1.1) + ic(P.num, 9, G, 1.1) + '<span class="s"></span>' + ic(P.quote, 9, G, 1.1) + ic(P.link, 9, G, 1.1) + ic(P.lines, 9, G, 1.1) + mi('grid', 9) + '<span class="s"></span>' +
      ic(P.undo, 9, G, 1.1) + ic('<path d="M11 3l3 3-3 3M14 6H7a4 4 0 000 8h3"/>', 9, G, 1.1) + '</div><div class="ph">' + t('Zadejte podrobnosti o této nové schůzce', 'Type details for this new meeting') + '</div></div>';
    var agenda;
    if (o.agenda === 'load') {
      agenda = '<div class="mt-load"><div style="display:flex;align-items:center;gap:6px;font-size:6.8px;font-weight:600"><i class="sk" style="width:9px;height:9px;display:block"></i>' + t('Probíhá příprava...', 'Getting ready...') + '</div>' +
        '<i class="sk" style="display:block;width:85px;height:8px;margin-top:20px"></i><i class="sk" style="display:block;width:147px;height:7px;margin-top:14px"></i><i class="sk" style="display:block;width:179px;height:7px;margin-top:7px"></i><i class="sk" style="display:block;width:113px;height:7px;margin-top:7px"></i></div>';
    } else if (o.agenda === 'loop') {
      var items = o.items || [];
      var li = items.map(function (x, i) { return '<div class="mt-li"><i class="o"></i><span' + (i === items.length - 1 && o.itemCaret ? ' id="itV"' : '') + '>' + x + '</span>' + (i === items.length - 1 && o.itemCaret ? '<span class="caret"></span>' : '') + '</div>'; }).join('');
      if (!items.length) li = '<div class="mt-li" id="ag0"><i class="o"></i>' + (o.itemCaret ? '<span id="itV"></span><span class="caret"></span>' : '<span class="ph">' + t('Téma, @jméno, přidělený čas', 'Topic, @name, time allotted') + '</span>') + '</div>';
      agenda = '<div class="mt-loop' + (o.loopIn ? ' sr-in' : '') + '" id="loop"><div class="lh"><span style="width:9px;height:9px;border-radius:2px;background:linear-gradient(135deg,#7B3FE4,#E0457B);display:block"></span>' + TITLE + mi('shield', 9) +
        '<span class="ri2">' + mi('apps', 9) + mi('copy', 9) + mi('share', 9) + '</span></div>' +
        '<h5>' + t('Agenda', 'Agenda') + '</h5>' + li + '<div style="height:' + (items.length > 1 ? 34 : 49) + 'px"></div>' +
        '<h5>' + t('Poznámky ze schůzky', 'Meeting notes') + '</h5><div class="mt-li" style="margin-left:20px"><span style="font-size:8px">•</span><span class="ph">' + t('Přidejte poznámky ze schůzky.', 'Add meeting notes.') + '</span></div><div style="height:41px"></div>' +
        '<h5>' + t('Následné úkoly', 'Follow-up tasks') + '</h5><div class="tbar">' + mi('grid', 9) + ic(P.chevd, 6, G, 1.4) + mi('sort', 9) + ic(P.filt, 9, G, 1.2) + ic(P.dots, 9, G, 1.4) + '<span class="ap">' + mi('grid', 6, '#BDBDBD') + t('Aplikace úloh', 'Task app') + ic(P.chevd, 5, '#BDBDBD', 1.4) + '</span></div>' +
        '<div class="add">' + ic(P.plus, 9, G, 1.3) + t('Přidat úkol', 'Add task') + '</div><div style="height:34px"></div></div>';
    } else agenda = '<div class="mt-f" style="height:26px" id="agF">' + t('Přidat agendu', 'Add agenda') + '</div>';
    var rows = title + row('addp', att) + row('clock', timeRow) + sug + row('rep', '<span class="mt-box" style="width:79px;height:18px">' + t('Neopakuje se', 'Does not repeat') + ic(P.chevd, 7, G, 1.4) + '</span>') +
      row('chan', chan) + row('loc', loc) + row('lines', ed, '', true) + row('agenda', agenda, ' style="margin-top:' + (o.chan === 'set' ? 0 : 1) + 'px"', !!o.agenda);
    var pop = '';
    if (o.chan === 'list' || (o.chan && o.chan.q != null)) pop = teamList(o.chan === 'list' ? null : o.chan.q, o.chanHot, chip);
    return head + '<div class="mt-form"><div class="mt-rows" id="rows" style="transform:translateY(' + (-(o.scroll || 0)) + 'px)">' + rows + '</div>' + pop + '</div>' + options(o);
  }
  /* seznam týmů pro Přidat kanál (m03), filtrovaný (m04) – jen fiktivní týmy */
  function teamList(q, hot, chip) {
    var top = (chip ? 232 : 218) - 62;
    var sq = function (txt, bg) { return '<span class="mt-tsq" style="background:' + bg + '">' + txt + '</span>'; };
    var html;
    if (q == null) {
      html = [['CF', '#CA5010', t('Celá firma', 'Whole company')], ['J', '#107C10', TEAM], ['JV', '#038387', t('Javor nábytek – Výroba', 'Javor nábytek – Production')]]
        .map(function (x) { return '<div class="t">' + ic('<path d="M6 4l4 4-4 4" fill="#424242"/>', 6, G, 1) + sq(x[0], x[1]) + x[2] + '</div>'; }).join('');
    } else {
      html = '<div class="t">' + ic('<path d="M4 6l4 4 4-4" fill="#424242"/>', 6, G, 1) + sq('J', '#107C10') + TEAM + '</div><div class="t c' + (hot ? ' hv' : '') + '" id="chNab">' + CHAN + '</div>';
    }
    return '<div class="mt-pop mt-tl" style="left:46px;top:' + top + 'px" id="tl">' + html + '</div>';
  }
  /* panel Možnosti */
  function options(o) {
    var on = o.rec === 'on', wide = on;
    var sel = function (y, txt, id, foc) { return '<div class="mt-os' + (foc ? ' foc' : '') + '" id="' + id + '" style="top:' + y + 'px;width:' + (wide ? 157 : 148) + 'px">' + txt + '<span class="cv">' + ic(P.chevd, 7, G, 1.4) + '</span></div>'; };
    var h = '<div class="mt-opt"><h4>' + t('Možnosti', 'Options') + '</h4><span class="col">' + mi('col', 10) + '</span>' +
      '<div class="mt-ol" style="top:37px">' + t('Kdo může obejít předsálí?', 'Who can bypass the lobby?') + ic(P.info, 8, '#616161', 1.1) + '</div>' + sel(51, t('Osoby v mé organizaci a hosté', 'People in my org and guests'), 'osLob') +
      '<div class="mt-ol" style="top:80px">' + t('Automatické nahrávání a přepis', 'Record and transcribe automatically') + '</div>' + sel(92, on ? t('Nahrát a přepsat', 'Record and transcribe') : t('Vypnuto', 'Off'), 'osRec', o.rec === 'menu');
    if (on) h += '<div class="mt-ol' + (o.langIn ? ' sr-in' : '') + '" style="top:121px">' + t('Jazyk, kterým se mluví na této schůzce', 'Language spoken in this meeting') + ic(P.info, 8, '#616161', 1.1) + '</div>' + '<div class="' + (o.langIn ? 'sr-in' : '') + '">' + sel(135, t('Čeština (Česko)', 'Czech (Czechia)'), 'osLang') + '</div>';
    h += '<div class="mt-more" style="top:' + (on ? 173 : 129) + 'px">' + t('Další možnosti', 'More options') + '</div>';
    if (o.rec === 'menu') {
      var it = [t('Nahrát a přepsat', 'Record and transcribe'), t('Pouze přepis', 'Transcribe only'), t('Vypnuto', 'Off')];
      h += '<div class="mt-pop mt-om" style="top:113px" id="recMenu">' + it.map(function (x, i) { return '<div class="o' + (o.recHot === i ? ' hv' : '') + '" id="ro' + i + '">' + (i === 2 ? '<span class="k">' + ic(P.chk, 8, G, 1.3) + '</span>' : '') + x + '</div>'; }).join('') + '</div>';
    }
    return h + '</div>';
  }
  /* Pomocník pro plánování (m11) */
  function scheduling(timeRow) {
    var H = 48.3;
    var tl = '<div class="mt-tlh"><span class="d" style="left:6px">' + t('neděle 4. října 2026', 'Sunday, October 4, 2026') + '</span><span class="d on" style="left:343px">' + t('pondělí 5. října 2026', 'Monday, October 5, 2026') + '</span>';
    var vl = '';
    for (var i = 0; i < 7; i++) { tl += '<span class="h" style="left:' + (6 + i * H) + 'px">' + (10 + i) + '</span>'; vl += '<i class="vl" style="left:' + (i * H) + 'px"></i>'; }
    for (var j = 0; j < 9; j++) { tl += '<span class="h" style="left:' + (338 + 6 + j * H) + 'px">' + (8 + j) + '</span>'; vl += '<i class="vl" style="left:' + (338 + j * H) + 'px;' + (j === 0 ? 'background:#D6D6D6' : '') + '"></i>'; }
    tl += '</div>';
    var hl = '';
    for (var r = 0; r <= 9; r++) hl += '<i class="hl" style="top:' + (r * 26.4) + 'px"></i>';
    var gr = function (y, cls, html, id) { return '<div class="mt-gr ' + cls + '"' + (id ? ' id="' + id + '"' : '') + ' style="top:' + y + 'px">' + html + '</div>'; };
    var left = '<div class="mt-gl">' + gr(0, 'b', t('Všichni účastníci', 'All attendees')) + gr(26.4, 's', ic('<path d="M4 6l4 4 4-4" fill="#424242"/>', 6, G, 1) + t('Povinní účastníci', 'Required attendees')) +
      gr(52.8, '', A.av('JN', 16) + '<span class="pp"><b>Jana Nováková</b><small>' + t('K dispozici', 'Available') + '</small></span>', 'saJN') +
      gr(79.2, '', A.av('PS', 16) + '<span class="pp"><b>Petr Svoboda</b><small>' + t('K dispozici', 'Available') + '</small></span>', 'saPS') +
      gr(105.6, 'a', mi('addp2', 10, PU) + t('Přidat povinné účastníky', 'Add required attendees')) + gr(132, 's', ic('<path d="M4 6l4 4 4-4" fill="#424242"/>', 6, G, 1) + t('Nepovinní účastníci', 'Optional attendees')) +
      gr(158.4, 'a', mi('addp2', 10, PU) + t('Přidat nepovinné účastníky', 'Add optional attendees')) + gr(184.8, 's', ic('<path d="M4 6l4 4 4-4" fill="#424242"/>', 6, G, 1) + t('Místa', 'Locations')) +
      gr(211.2, 'a', mi('loc', 10, PU) + t('Přidat místo', 'Add location')) + '</div>';
    var slotX = 338 + 6.5 * H;
    return '<div class="mt-sa"><div class="mt-row" style="position:absolute;left:0;right:0;top:12px"><span class="ri">' + mi('clock', 10) + '</span>' + timeRow + '</div>' +
      '<div class="mt-sug" style="position:absolute;top:36px;margin:0">' + t('Navrženo:', 'Suggested:') + '<a>14:30 – 15:00</a><a>15:00 – 15:30</a><a>15:30 – 16:00</a></div>' +
      '<div class="wh"><i>' + ic(P.chk, 6, '#fff', 1.8) + '</i>' + t('Zobrazit moji pracovní dobu', 'Show my working hours') + '</div>' +
      tl.replace('class="mt-tlh"', 'class="mt-tlh" style="top:57px;height:38px"') + left.replace('class="mt-gl"', 'class="mt-gl" style="top:95px"') +
      '<div class="mt-grid" style="top:95px">' + hl + vl + '<div class="mt-slot" id="slot" style="left:' + slotX + 'px"><i style="left:-4px"></i><i style="right:-4px"></i></div></div></div>';
  }

  function page(o) { return chrome(o && o.view === 'cal' ? calendar() : form(o)); }
  window.AKM = { TITLE: TITLE, page: page };
})();
