/* Akademie – scénář „Sdílíme s klientem bezpečně“: sdílené stavební kusy scén SharePointu.
   Předlohy: _ref/sdileni/s00 (knihovna), s01 (dialog Sdílet), s02–s05 (Nastavení odkazů, oprávnění), s06–s08 (konec platnosti),
   s09–s12 (adresa příjemce, upozornění mimo organizaci, zpráva), s14–s18 (Spravovat přístup, přímý přístup).
   Organizace, lidé, adresa klienta a doména jsou fiktivní (Javor nábytek), ne z předloh. Ikony jsou zjednodušené (bez log). */
(function () {
  var A = AK, t = A.t, ic = A.ic, P = A.P;
  var PU = '#881798', G = '#424242';
  var FILE = t('Nabídka – Penzion U Lípy.docx', 'Quote – U Lípy guesthouse.docx');
  var FILE_S = t('Nabídka – P…U Lípy.docx', 'Quote – U…uesthouse.docx');
  var FILE_M = t('Nabídka – Pen…n U Lípy.docx', 'Quote – U L…uesthouse.docx');
  var ORG = 'Javor nábytek';
  var MAIL = 'recepce@penzion-ulipy.cz';

  var I = {
    prozk: '<circle cx="8" cy="8" r="5.6"/><path d="M5.6 10.4l4.8-4.8"/>',
    publ: '<path d="M11.8 2.2l2 2-7.6 7.6-2.9.9.9-2.9z"/><path d="M3 14c1-.3 1.6-.9 2-1.6"/>',
    komp: '<rect x="2.5" y="2.5" width="11" height="5" rx="1"/><rect x="2.5" y="9.5" width="5" height="4" rx="1"/><rect x="8.5" y="9.5" width="5" height="4" rx="1"/>',
    fb: '<circle cx="6" cy="5" r="2.3"/><path d="M2 13c0-2.3 1.8-4 4-4"/><path d="M8.5 8.5h6v4.5h-2l-2 1.5V13h-2z"/>',
    help: '<path d="M5.8 5.6a2.3 2.3 0 014.4.9c0 1.6-2.2 1.8-2.2 3.4M8 12.6h.01" stroke-width="1.5"/>',
    helpc: '<circle cx="8" cy="8" r="6"/><path d="M6.4 6.5a1.7 1.7 0 013.2.6c0 1.1-1.6 1.3-1.6 2.4M8 11.3h.01"/>',
    dl: '<path d="M8 2.5v8M4.5 7.5L8 11l3.5-3.5M3 13.5h10"/>',
    grid: '<rect x="2" y="3" width="12" height="10" rx="1"/><path d="M2 6.3h12M2 9.6h12M6 3v10"/>',
    xls: '<rect x="2" y="3.5" width="7.5" height="9" rx="1"/><path d="M9.5 5.5h4v5h-4M4 6.3l3.4 4.4M7.4 6.3L4 10.7"/>',
    expand: '<path d="M9.5 2.5h4v4M13.5 2.5L9 7M6.5 13.5h-4v-4M2.5 13.5L7 9"/>',
    panel: '<rect x="2" y="3" width="12" height="10" rx="1.5"/><path d="M10 3v10M4.5 6.5h3M4.5 9h3"/>',
    msg: '<rect x="2.5" y="3" width="11" height="9" rx="1"/><path d="M4.5 3V2M5 6.2h6M5 8.6h3.8"/>',
    back: '<path d="M13 8H3M7 4L3 8l4 4"/>',
    brief: '<rect x="3.5" y="6" width="9" height="6.5" rx="1.2"/><path d="M6.2 6V4.6h3.6V6M3.5 8.5h9"/>',
    pers: '<circle cx="8" cy="6" r="2.4"/><path d="M4 13c0-2.3 1.8-3.8 4-3.8s4 1.5 4 3.8"/>',
    plock: '<circle cx="7" cy="5.6" r="2.3"/><path d="M3 13c0-2.2 1.7-3.6 3.8-3.6"/><rect x="8.6" y="9.6" width="5" height="4" rx=".8" fill="currentColor"/><path d="M9.6 9.6V8.6a1.5 1.5 0 013 0v1"/>',
    rev: '<circle cx="5.3" cy="10.7" r="2.6"/><path d="M7.2 8.8l5.3-5.3M10 3.3h2.7V6"/>',
    nodl: '<path d="M8 2.5v6.5M5.2 6.6L8 9.4l2.8-2.8M3 13.5h10M3 3l10.5 10.5"/>',
    cal: '<rect x="2.5" y="3" width="11" height="10.5" rx="1.5"/><path d="M2.5 6h11M5 8.5h1.2M7.4 8.5h1.2M9.8 8.5h1.2M5 11h1.2M7.4 11h1.2"/>',
    padd: '<circle cx="6.5" cy="5.2" r="2.4"/><path d="M2.3 13.2c0-2.4 1.9-4 4.2-4"/><circle cx="11.4" cy="11.4" r="2.6"/><path d="M11.4 10.1v2.6M10.1 11.4h2.6"/>',
    minus: '<circle cx="8" cy="8" r="5.6"/><path d="M5.5 8h5"/>',
    up: '<path d="M8 13V3M4 7l4-4 4 4"/>', down: '<path d="M8 3v10M4 9l4 4 4-4"/>',
    chu: '<path d="M4 10l4-4 4 4"/>'
  };
  for (var k in I) P['sp_' + k] = I[k];

  /* šedý avatar bez fotky (předloha: šedý kruh s bílou siluetou) */
  function gav(s, cls) {
    return '<svg class="sp-gav' + (cls ? ' ' + cls : '') + '" width="' + s + '" height="' + s + '" viewBox="0 0 20 20"><circle cx="10" cy="10" r="10" fill="' + (cls === 'lt' ? '#E1E1E1' : '#C8C8C8') + '"/><circle cx="10" cy="8" r="3.6" fill="#fff"/><path d="M3.6 17.2c1.2-3 3.6-4.6 6.4-4.6s5.2 1.6 6.4 4.6A9.9 9.9 0 0110 20a9.9 9.9 0 01-6.4-2.8z" fill="#fff"/></svg>';
  }
  function vc(inner, w) { return '<span class="sp-vc' + (w ? ' w' : '') + '">' + inner + '</span>'; }

  /* ---------- knihovna Dokumenty › Nabídky (s00/s01 bez panelu Další kroky) ---------- */
  function library() {
    var rail = [['prozk', t('Prozkoum<br>at', 'Explore'), 47], ['publ', t('Publikovat', 'Publish'), 90], ['komp', t('Kompilov<br>at', 'Compose'), 123], ['cloud', 'OneDrive', 165]]
      .map(function (r) { return '<div class="sp-ri" style="top:' + (r[2] - 32) + 'px">' + ic(P[r[0] === 'cloud' ? 'cloud' : 'sp_' + r[0]], 14, G, 1.1) + '<span>' + r[1] + '</span></div>'; }).join('');
    var nav = [t('Domovská stránka', 'Home'), t('Konverzace', 'Conversations'), t('Dokumenty', 'Documents'), t('Poznámkový blok', 'Notebook'), t('Stránky', 'Pages'), t('Obsah webu', 'Site contents'), t('Koš', 'Recycle bin')]
      .map(function (n) { return '<div class="sp-ni">' + n + '</div>'; }).join('') + '<div class="sp-ni ed">' + t('Upravit', 'Edit') + '</div>';
    var cb = function (icon, n, extra) { return '<span class="sp-cb">' + icon + n + (extra || '') + '</span>'; };
    var cmd = cb(ic(P.shareo, 11, G, 1.1), t('Sdílet', 'Share')) + cb(ic(P.link, 11, G, 1.1), t('Kopírovat odkaz', 'Copy link')) +
      cb(ic(P.shortcut, 11, G, 1.1), t('Přidat zástupce na OneDrive', 'Add shortcut to OneDrive'), ic(P.chevd, 10, G, 1.5)) + cb(ic(P.formsi, 11, G, 1.1), 'Forms') +
      cb(ic(P.sp_dl, 11, G, 1.1), t('Stáhnout', 'Download')) + cb(ic(P.sp_grid, 11, G, 1.1), t('Upravit v zobrazení mřížky', 'Edit in grid view')) +
      cb(ic(P.sp_xls, 11, G, 1.1), t('Exportovat do Excelu', 'Export to Excel')) + '<span class="sp-cb ell">' + ic(P.dots, 11, G, 1.3) + '</span>';
    var hov = '<span class="sp-hov" id="rowHov"><span id="rowMore">' + ic(P.dots, 12, G, 1.4) + '</span><span id="rowShare">' + ic(P.shareo, 12, G, 1.15) + '</span></span>';
    return '<div class="sp-bar"><span class="sp-waf">' + ic(P.launcher, 13, '#fff') + '</span><span class="sp-brand">SharePoint</span>' +
      '<div class="sp-srch">' + ic(P.search, 11, '#616161', 1.3) + t('Prohledat tuto knihovnu', 'Search this library') + '</div>' +
      '<span class="sp-bi" style="left:1300px">' + ic(P.announce, 13, '#fff', 1.15) + '</span><span class="sp-bi" style="left:1332px">' + ic(P.sp_fb, 13, '#fff', 1.15) + '</span>' +
      '<span class="sp-bi" style="left:1364px">' + ic(A.WI.gear, 13, '#fff', 1.1) + '</span><span class="sp-bi" style="left:1395px">' + ic(P.sp_help, 13, '#fff') + '</span>' +
      '<span class="sp-me">JN</span></div>' +
      '<div class="sp-rail">' + rail + '</div>' +
      '<div class="sp-page"></div>' +
      '<span class="sp-logo">JO</span><div class="sp-site">' + t('Javor nábytek – Obchod', 'Javor nábytek – Sales') + ic(P.teams, 13, G, 1.15) + '</div>' +
      '<div class="sp-hr"><span class="g">' + t('Soukromá skupina', 'Private group') + '</span>' + ic(P.star, 10, PU, 1.2) + '<span>' + t('Nesledované', 'Not following') + '</span><span class="s"></span>' + ic(P.person, 10, G, 1.2) + '<span>' + t('2 členů', '2 members') + '</span></div>' +
      '<div class="sp-nav">' + nav + '</div><div class="sp-nl"></div><div class="sp-cl">' + t('Zpět ke klasickému SharePointu', 'Return to classic SharePoint') + '</div>' +
      '<div class="sp-crumb">' + t('Dokumenty', 'Documents') + ic(P.chevr, 11, '#616161', 1.3) + '<b>' + t('Nabídky', 'Quotes') + ic(P.chevd, 11, '#242424', 1.5) + '</b></div>' +
      '<div class="sp-cmd">' + cmd + '</div>' +
      '<span class="sp-new">' + ic(P.plus, 11, '#fff', 1.8) + t('Vytvořit nebo nahrát', 'Create or upload') + '</span>' +
      '<div class="sp-views"><span class="sp-vp on">' + ic(P.lines, 11, G, 1.3) + t('Všechny dokumenty', 'All Documents') + '</span><span class="sp-vp">' + ic(P.plus, 11, G, 1.3) + t('Přidat zobrazení', 'Add view') + '</span><span class="sp-vsep"></span>' +
      vc(ic(P.filt, 11, G, 1.3), 1) + vc(A.appIcon('word', 11)) + vc(A.appIcon('excel', 11)) + vc(A.appIcon('ppt', 11)) + vc(ic(P.file, 11, '#D13438', 1.2)) + '</div>' +
      '<div class="sp-vr"><span>' + ic(P.sliders, 12, G, 1.2) + '</span><span>' + ic(P.sp_expand, 11, G, 1.2) + '</span><span>' + ic(P.sp_panel, 12, G, 1.1) + t('Podrobnosti', 'Details') + '</span></div>' +
      '<div class="sp-list"><div class="sp-lh"><span style="left:43px">' + ic(P.file, 12, G, 1.1) + '</span><span style="left:68px">' + t('Název', 'Name') + ic(P.chevd, 9, G, 1.5) + '</span>' +
      '<span style="left:267px">' + t('Změněno', 'Modified') + ic(P.info, 9, '#8A8A8A', 1.1) + ic(P.chevd, 9, G, 1.5) + '</span><span style="left:354px">' + t('Autor změny', 'Modified By') + ic(P.chevd, 9, G, 1.5) + '</span>' +
      '<span class="add" style="left:444px">' + ic(P.plus, 10, G, 1.3) + t('Přidat sloupec', 'Add column') + '</span></div>' +
      '<div class="sp-lr" id="row"><span class="sp-sel" style="left:20px"><i></i></span><span style="left:42px">' + A.appIcon('word', 12) + '</span><span class="nm" style="left:72px"><span class="sp-nwm">' + ic(P.newmark, 9, '#B4009E', 1.2) + '</span>' + FILE + hov + '</span>' +
      '<span class="md" style="left:270px">' + t('Včera v 2:23 PM', 'Yesterday at 2:23 PM') + '</span><span style="left:354px"><span class="sp-chip">Jana Nováková</span></span></div></div>';
  }

  /* ---------- dialog Sdílet (s01, s08–s12) ----------
     o.perm 'edit'|'view'; o.to: obsah pole příjemce – '' (zástupný text) | {typed:'…'} | {chip:true}; o.foc 'to'|'msg'|'';
     o.dd 'search'|'suggest'; o.msg text zprávy ('' = zástupný text). */
  function shareDlg(o) {
    o = o || {};
    var permI = o.perm === 'view' ? ic(P.eye, 12, G, 1.15) : ic(P.pen, 11, G, 1.15);
    var to;
    if (o.to && o.to.chip) {
      to = '<div class="sp-tl chips">' + ic(P.sp_pers, 11, G, 1.1) + '<span class="sp-chip2' + (o.chipIn ? ' in' : '') + '">' + gav(16) + t('recepce@penzion-u…', 'recepce@penzion-u…') + ic(P.x, 10, PU, 1.3) + '</span><span class="sp-more">' + t('Přidat další', 'Add another') + '</span></div>';
    } else {
      var has = o.to && o.to.typed != null;
      to = '<div class="sp-tl">' + ic(P.sp_pers, 11, G, 1.1) + '<span class="ph" id="toPh"' + (has ? ' hidden' : '') + '>' + t('Přidání jména, skupiny nebo e-mailu', 'Add a name, group, or email') + '</span>' +
        '<span id="toV"' + (has ? '' : ' hidden') + '>' + (has ? o.to.typed : '') + '</span><span class="caret" id="toCar"' + (o.caret ? '' : ' hidden') + '></span></div>';
    }
    var dd = '';
    if (o.dd === 'search') dd = '<div class="sp-dd" style="top:73px"><div class="ld"><i class="sp-spin"></i>' + t('Vyhledávání...', 'Searching...') + '</div><div class="ad">' + ic(P.search, 11, PU, 1.3) + t('Prohledat adresář', 'Search directory') + '</div></div>';
    if (o.dd === 'suggest') dd = '<div class="sp-dd" style="top:73px"><div class="sug" id="sugg">' + gav(26) + MAIL + '</div><div class="ad">' + ic(P.search, 11, PU, 1.3) + t('Prohledat adresář', 'Search directory') + '</div></div>';
    var warn = o.to && o.to.chip ? '<div class="sp-warn"><i></i>' + t(MAIL + ' je mimo vaši organizaci.', MAIL + ' is outside of your organization.') + '</div>' : '';
    var hasMsg = o.msg != null && o.msg !== '';
    return '<div class="sp-dlg' + (o.anim ? ' in' : '') + '" id="dlg"><div class="sp-dh"><h4>' + t('Sdílet ', 'Share ') + FILE_S + '</h4>' +
      '<span class="sp-di" style="left:234px;top:16px">' + ic(P.dots, 11, G, 1.3) + '</span><span class="sp-di" style="left:257px;top:16px">' + ic(P.sp_helpc, 11, G, 1.05) + '</span><span class="sp-di" style="left:281px;top:16px">' + ic(P.x, 10, G, 1.2) + '</span></div>' +
      '<div class="sp-to' + (o.foc === 'to' ? ' foc' : '') + '" id="toBox">' + to + '<span class="sp-tp" id="permBtn">' + permI + ic(P.chevd, 9, G, 1.4) + '</span></div>' + warn +
      '<div class="sp-msg' + (o.foc === 'msg' ? ' foc' : '') + '" id="msgBox">' + ic(P.sp_msg, 10, G, 1.1) + '<span class="ph" id="msgPh"' + (hasMsg || o.msgCaret ? ' hidden' : '') + '>' + t('Přidat zprávu', 'Add a message') + '</span><span id="msgV">' + (hasMsg ? o.msg : '') + '</span><span class="caret" id="msgCar"' + (o.msgCaret ? '' : ' hidden') + '></span></div>' +
      '<div class="sp-ft"><span class="sp-fp">' + gav(14, 'lt') + gav(14, 'lt') + '<span class="sp-gav lt" style="width:14px;height:14px;display:grid;place-items:center;background:#F0F0F0">' + ic(P.dots, 8, G, 1.4) + '</span></span>' +
      '<span class="sp-kop"><span>' + ic(P.link, 11, '#5C1468', 1.2) + t('Kopírovat odkaz', 'Copy link') + '</span><span id="gear">' + ic(A.WI.gear, 11, '#5C1468', 1.05) + '</span></span>' +
      '<span class="sp-send" id="send">' + ic(P.send, 10, '#fff', 1.2) + t('Poslat', 'Send') + '</span></div>' + dd + '</div>';
  }

  /* ---------- Nastavení odkazů (s02–s07) ----------
     o.sel 1 (Lidé v organizaci) | 3 (Lidé, které zvolíte); o.perm 'edit'|'view'; o.permFoc; o.menu (rozbalená nabídka), o.hot (zvýrazněná položka 0–3);
     o.date '' | 'cal' (kalendář otevřený) | 'set' (vyplněný Konec platnosti); o.calHot (den pod kurzorem). */
  function linkDlg(o) {
    o = o || {};
    var iorg = '<span class="ic" style="background:#EEF4FB;box-shadow:0 0 0 1px #5E8FCB">' + ic(P.sp_brief, 10, '#3D6FB0', 1.1) + '</span>';
    var iex = '<span class="ic" style="background:#FDF2EC;box-shadow:0 0 0 1px #D08A62">' + ic(P.sp_pers, 11, '#B35A2C', 1.1) + '</span>';
    var isp = '<span class="ic" style="background:#fff;box-shadow:0 0 0 1px #424242">' + ic(P.sp_plock, 11, '#242424', 1.1) + '</span>';
    var inf = ic(P.info, 9, '#8A8A8A', 1.05);
    var s1 = o.sel !== 3, s3 = o.sel === 3;
    var fp = '<div class="fp">' + gav(14, 'lt') + gav(14, 'lt') + gav(14, 'lt') + '<span style="box-shadow:0 0 0 1.2px #fff;border-radius:50%;display:flex">' + A.av('LD', 14) + '</span>' + gav(14, 'lt') + '</div>';
    var opt = function (id, on, icon, title, desc, extra, rtop) {
      return '<div class="sp-opt' + (on ? ' on' : '') + '" id="' + id + '">' + icon + '<div class="tx"><b>' + title + (on ? '' : inf) + '</b>' + (on && desc ? '<p>' + desc + '</p>' : '') + (extra || '') + '</div><span class="sp-rad' + (on ? ' on' : '') + '" id="' + id + 'r" style="top:' + rtop + 'px"></span></div>';
    };
    var opts = opt('o1', s1, iorg, t('Lidé v ' + ORG, 'People in ' + ORG), t('Sdílet s lidmi ve firmě ' + ORG + '. Je vyžadován účet organizace.', 'Share with people at ' + ORG + '. An organizational account is required.'), '', s1 ? 20 : 8) +
      opt('o2', false, iex, t('Pouze lidi s existujícím přístupem', 'Only people with existing access'), '', fp, 8) +
      opt('o3', s3, isp, t('Lidé, které zvolíte', 'People you choose'), t('Sdílejte s konkrétními lidmi, které zvolíte uvnitř nebo mimo ' + ORG + ', pomocí jejich jména, skupiny nebo e-mailu.', 'Share with specific people you choose inside or outside ' + ORG + ', using their name, group, or email.'), '', s3 ? 20 : 8);
    var view = o.perm === 'view';
    var perm = '<div class="sp-perm' + (o.permFoc || o.menu ? ' foc' : '') + '" id="perm">' + (view ? ic(P.eye, 11, '#616161', 1.1) : ic(P.pen, 10, '#616161', 1.1)) +
      (view ? t('Může zobrazit', 'Can view') : t('Může upravit', 'Can edit')) + '<span class="cv">' + ic(P.chevd, 9, '#616161', 1.4) + '</span></div>';
    var date;
    if (o.date === 'set') {
      date = '<div class="sp-date" id="date"><span class="cal">' + ic(P.sp_cal, 11, G, 1.1) + '</span><span class="lab">' + t('Konec platnosti', 'Expiration') + '</span><span class="box">' + t('sobota 31. říj 2026', 'Saturday, October 31, 2026') + '</span><span class="x" style="margin-left:auto">' + ic(P.x, 10, G, 1.2) + '</span></div>';
    } else {
      date = '<div class="sp-date" id="date"><span class="cal">' + ic(P.sp_cal, 11, G, 1.1) + '</span><span class="f' + (o.date === 'cal' ? ' foc' : '') + '" id="dateF">' + t('Nastavte datum ukončení platnosti (DD. MM. YYYY)', 'Set expiration date (MM/DD/YYYY)') + '</span><span class="x">' + ic(P.x, 10, G, 1.2) + '</span></div>';
    }
    var menu = '';
    if (o.menu) {
      var items = [['pen', t('Může upravit', 'Can edit'), t('Může provádět libovolné změny', 'Make any changes')], ['sp_rev', t('Může revidovat', 'Can review'), t('Může navrhovat jenom změny.', 'Can only suggest changes.')],
        ['eye', t('Může zobrazit', 'Can view'), t('Nejde provést změny', 'Can’t make changes')], ['sp_nodl', t('Nejde stáhnout', 'Can’t download'), t('Lze zobrazit, ale ne stahovat', 'Can view, but not download')]];
      menu = '<div class="sp-menu" id="menu">' + items.map(function (it, i) {
        var cur = (i === 0 && !view) || (i === 2 && view);
        return '<div class="sp-mi' + (o.hot === i ? ' hv' : '') + '" id="mi' + i + '">' + (cur ? '<span class="ck">' + ic(P.chk, 10, G, 1.3) + '</span>' : '') + '<span' + (i === 3 ? ' style="margin-left:2px"' : '') + '>' + ic(P[it[0]], 11, G, 1.1) + '</span><span><b>' + it[1] + '</b><small>' + it[2] + '</small></span></div>';
      }).join('') + '</div>';
    }
    var cal = '';
    if (o.date === 'cal') {
      var days = [t('Ne', 'Su'), t('Po', 'Mo'), t('Út', 'Tu'), t('St', 'We'), t('Čt', 'Th'), t('Pá', 'Fr'), t('So', 'Sa')].map(function (d) { return '<span class="wd">' + d + '</span>'; }).join('');
      var cells = [27, 28, 29, 30].map(function (d) { return '<span class="dis">' + d + '</span>'; }).join('') + [1, 2, 3, 4].map(function (d) { return '<span class="dis">' + d + '</span>'; }).join('');
      for (var d = 5; d <= 31; d++) cells += '<span id="cd' + d + '" class="' + (d === 5 ? 'sel' : d === o.calHot ? 'hv' : '') + '">' + d + '</span>';
      cal = '<div class="sp-calp" id="calp"><span class="hd">' + t('Říjen 2026', 'October 2026') + '</span><span class="ar" style="left:107px">' + ic(P.sp_up, 9, '#BDBDBD', 1.2) + '</span><span class="ar" style="left:126px">' + ic(P.sp_down, 9, G, 1.2) + '</span>' +
        '<div class="sp-cg">' + days + cells + '</div></div>';
    }
    return '<div class="sp-dlg' + (o.anim ? ' in' : '') + '" id="dlg"><div class="sp-lh2"><span class="bk">' + ic(P.sp_back, 11, G, 1.1) + '</span><h4>' + t('Nastavení odkazů', 'Link settings') + '</h4><small>' + FILE + '</small>' +
      '<span class="sp-di" style="left:257px">' + ic(P.sp_helpc, 10, '#8A8A8A', 1) + '</span><span class="sp-di" style="left:281px">' + ic(P.x, 10, G, 1.2) + '</span></div>' +
      '<div class="sp-sub">' + t('Odkaz funguje pro', 'Share the link with') + '</div><div class="sp-opts">' + opts + '</div>' +
      '<div class="sp-sub sp-more2">' + t('Další nastavení', 'More settings') + '</div>' + perm + date +
      '<div class="sp-apply"><span class="sp-btn" id="apply">' + t('Použít', 'Apply') + '</span></div>' + menu + cal + '</div>';
  }

  /* ---------- Spravovat přístup (s14–s16) – tab 0 Lidé, 1 Skupiny, 2 Odkazy ---------- */
  function manageDlg(o) {
    o = o || {};
    var tab = o.tab || 0;
    var tabs = [t('Lidé • 1', 'People • 1'), t('Skupiny • 4', 'Groups • 4'), t('Odkazy • 1', 'Links • 1')]
      .map(function (n, i) { return '<span class="sp-tab' + (i === tab ? ' on' : '') + '" id="mt' + i + '">' + n + '</span>'; }).join('');
    var body;
    if (tab === 0) {
      body = '<div class="sp-pr' + (o.hotP ? ' hv' : '') + '" id="pLD">' + A.av('LD', 21) + '<span class="nm"><b>Lucie Dvořáková</b><small>' + t('Obchodní asistentka', 'Sales assistant') + '</small></span><span class="rl">' + ic(P.pen, 10, G, 1.1) + t('Může upravit', 'Can edit') + '</span></div>';
    } else if (tab === 1) {
      var grp = function (n, type, role) { return '<div class="sp-pr">' + gav(21) + '<span class="nm"><b>' + n + '</b><small>' + type + '</small></span><span class="rl">' + role + '</span></div>'; };
      var T = t('Javor nábytek – Obchod', 'Javor nábytek – Sales');
      var SPG = t('Skupina služby SharePoint', 'SharePoint group');
      body = grp(T + ' Owners', t('Moderní skupina', 'Modern group'), t('Vlastník', 'Owner')) + grp(T + ' Owners', SPG, t('Vlastník', 'Owner')) +
        grp(T + ' Visitors', SPG, ic(P.eye, 11, G, 1.1) + t('Může zobrazit', 'Can view')) + grp(T + ' Members', SPG, ic(P.pen, 10, G, 1.1) + t('Může upravit', 'Can edit'));
    } else {
      body = '<div class="sp-lk"><span class="ic">' + ic(P.sp_brief, 10, '#3D6FB0', 1.1) + '</span><div class="row"><span class="url">https://javornabytek.sharepoint.com/…</span><span class="cp">' + t('Kopírovat', 'Copy') + '</span>' +
        ic(A.WI.gear, 11, G, 1.05) + ic(P.trash, 11, G, 1.1) + '</div><p>' + t('Lidé ve společnosti ' + ORG + ' s odkazem mají oprávnění k úpravám.', 'People in ' + ORG + ' with the link can edit.') + '</p></div>';
    }
    return '<div class="sp-dlg sp-ma' + (o.anim ? ' in' : '') + '" id="dlg"><div class="sp-lh2" style="height:47px"><span class="bk" style="top:20px">' + ic(P.sp_back, 11, G, 1.1) + '</span><h4>' + t('Spravovat přístup', 'Manage access') + '</h4>' +
      '<span class="sp-di" style="left:234px;top:16px">' + ic(P.sp_padd, 11, G, 1.05) + '</span><span class="sp-di" style="left:258px;top:16px">' + ic(P.dots, 11, G, 1.3) + '</span><span class="sp-di" style="left:281px;top:16px">' + ic(P.x, 10, G, 1.2) + '</span></div>' +
      '<div class="sp-file">' + A.appIcon('word', 9) + FILE_M + '</div><div class="sp-stop">' + ic(P.sp_minus, 10, PU, 1.1) + t('Přestat sdílet', 'Stop sharing') + '</div>' +
      '<div class="sp-tabs">' + tabs + '</div><div id="mbody" class="' + (o.anim === false ? '' : 'sp-ph') + '">' + body + '</div></div>';
  }

  /* ---------- Shrnutí přístupu osoby (s17, s18) – o.open rozbalený přímý přístup, o.sel vybraná volba (0–4) ---------- */
  function summaryDlg(o) {
    o = o || {};
    var acc = '<div class="sp-acc' + (o.open ? ' open' : '') + '" id="acc">' + ic(o.open ? P.sp_chu : P.chevd, 8, '#616161', 1.4) + (o.open ? t('Přímý přístup: může upravit', 'Direct access: can edit') : t('Přímý přístup: ', 'Direct access: ') + '<b>' + t('může upravit', 'can edit') + '</b>') + '</div>';
    var rows = '';
    if (o.open) {
      var sel = o.sel == null ? 0 : o.sel;
      rows = '<div class="sp-acc-d">' + t('Přímý přístup uděluje přístupová oprávnění bez použití odkazu', 'Direct access grants permissions without using a link') + '</div>' +
        [[t('Může upravit', 'Can edit'), t('Může provádět libovolné změny', 'Make any changes')], [t('Může revidovat', 'Can review'), t('Navrhnout změny', 'Suggest changes')],
          [t('Může zobrazit', 'Can view'), t('Nejde provést změny', 'Can’t make changes')], [t('Nejde stáhnout', 'Can’t download'), t('Lze zobrazit, ale ne stahovat', 'Can view, but not download')], [t('Žádný přímý přístup', 'No direct access'), '']]
          .map(function (r, i) { return '<div class="sp-rr" id="rr' + i + '"><span class="sp-rad' + (i === sel ? ' on' : '') + '" id="rr' + i + 'r"></span><span><b>' + r[0] + '</b>' + (r[1] ? '<small>' + r[1] + '</small>' : '') + '</span></div>'; }).join('');
    }
    var off = '<span class="sp-btn off">' + t('Použít', 'Apply') + '</span><span class="sp-btn off">' + t('Zrušit', 'Cancel') + '</span>';
    return '<div class="sp-dlg sp-ma sp-sum' + (o.anim ? ' in' : '') + '" id="dlg"><div class="sp-lh2"><span class="bk" style="top:20px">' + ic(P.sp_back, 11, G, 1.1) + '</span><h4>' + t('Spravovat přístup', 'Manage access') + '</h4>' +
      '<span class="sp-di" style="left:' + (o.open ? 272 : 281) + 'px;top:16px">' + ic(P.x, 10, G, 1.2) + '</span></div>' +
      '<div class="sp-sub" style="display:flex;align-items:center;gap:4px">' + t('Shrnutí přístupu', 'Access summary') + ic(P.info, 9, '#8A8A8A', 1.05) + '</div>' +
      '<div class="sp-who">' + A.av('LD', 22) + 'Lucie Dvořáková <b>' + t('může upravit', 'can edit') + '</b></div><div class="sp-hrule"></div>' +
      '<div class="sp-sub">' + t('Možnosti přístupu této osoby', 'Access options for this person') + '</div>' + acc + rows +
      '<div class="sp-sumb" style="' + (o.open ? 'top:390px;right:25px' : 'top:346px') + '">' + off + '</div>' +
      (o.open ? '<span class="sp-scr"><i></i></span>' : '') + '</div>';
  }

  /* celá scéna: knihovna + (volitelně) ztmavení s dialogem */
  function page(dlg) {
    return '<div class="spw" id="spw">' + library() + '<div class="sp-dim' + (dlg ? ' on' : '') + '" id="dim"></div><div id="dlgw">' + (dlg || '') + '</div></div>';
  }
  function setDlg(html) { A.$('dlgw').innerHTML = html; A.$('dim').classList.add('on'); }

  window.AKS = { FILE: FILE, MAIL: MAIL, page: page, setDlg: setDlg, shareDlg: shareDlg, linkDlg: linkDlg, manageDlg: manageDlg, summaryDlg: summaryDlg };
})();
