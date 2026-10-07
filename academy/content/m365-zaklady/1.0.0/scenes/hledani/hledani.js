/* Akademie – scénář „Kde je ten dokument?“: sdílené stavební kusy scén hledání v Teams a OneDrivu.
   Předlohy: _ref/hledani/h1 (našeptávač), h2 (výsledky Vše), h3 (Soubory, token is:Soubory), h4 (filtr Typ souboru),
   h6 (OneDrive v Teams – Domů). Lidé, weby a soubory jsou fiktivní (Javor nábytek), ne z předloh. */
(function () {
  var A = AK, t = A.t, ic = A.ic, P = A.P, G = '#424242';
  var FILE = t('Nabídka – Penzion U Lípy', 'Quote – U Lípy guesthouse');
  var TEAM = t('Javor nábytek – Obchod', 'Javor nábytek – Sales');
  var CHAN = t('Nabídky', 'Quotes');
  var CV = function (s) { return ic(P.chevd, s || 8, '#616161', 1.5); };

  /* ---------- kanál Nabídky › Příspěvky (pozadí h1, stav po scéně 2 scénáře 1) ---------- */
  function avw(k, s, pres) { return '<span class="ps-avw">' + A.av(k, s) + (pres ? '<i class="tpres"></i>' : '') + '</span>'; }
  function post(k, name, time, subj, body, extra, mine) {
    return '<div class="ps-post' + (mine ? ' mine' : '') + '"><div class="ps-in">' +
      '<div class="ps-hd">' + avw(k, 22, mine) + name + '<small>' + time + '</small></div>' +
      '<div class="ps-subj">' + subj + '</div><div class="ps-tx">' + body + '</div>' + (extra || '') +
      '<div class="ps-react">' + ic(P.react, 13, '#616161', 1.1) + '</div></div>' +
      '<div class="ps-rep">' + avw('JN', 14) + t('Odpovědět ve vlákně', 'Reply') + '</div></div>';
  }
  function channelFeed() {
    var card = '<div class="ps-card"><div class="ps-ch">' + A.appIcon('word', 18) + '<span class="nmw"><b>' + FILE + '.docx</b><small>' + TEAM + ' > ' + CHAN + '</small></span>' + ic(P.dots, 13, G, 1.4) + '</div>' +
      '<div class="ps-prev">' + A.appIcon('word', 18) + '</div></div>';
    var feed =
      post('LD', 'Lucie Dvořáková', '9:12', t('Nový ceník 2026', 'New 2026 price list'), t('Ceník 2026 je v záložce Sdíleno – staré ceny už prosím nepoužívejte.', 'The 2026 price list is in the Shared tab – please stop using the old prices.')) +
      post('PS', 'Petr Svoboda', '10:40', t('Hotel Pod Skalou', 'Pod Skalou hotel'), t('Nabídka odešla, klient se ozve do pátku.', 'The quote has been sent, the client will reply by Friday.')) +
      post('JN', 'Jana Nováková', '11:05', t('Nabídka pro Penzion U Lípy', 'Quote for the U Lípy guesthouse'),
        '<span class="ps-men">Petr Svoboda</span>' + t(' připravuji nabídku pro Penzion U Lípy. Doplň prosím ceny a termíny rovnou do dokumentu: ', ' I am preparing a quote for the U Lípy guesthouse. Please add prices and dates straight into the document: ') +
        '<span class="ps-lnk">' + FILE + '</span>', card, true);
    return '<div class="ps-feed" id="feed">' + feed + '</div>' +
      '<div class="ps-newbtn">' + ic(P.compose, 12, '#fff', 1.3) + t('Publikovat v kanálu', 'Post in channel') + '</div>';
  }

  /* ---------- našeptávač pod polem hledání (h1) ---------- */
  function pale(k, bg, fg, s) { return '<span class="tpav" style="width:' + s + 'px;height:' + s + 'px;font-size:' + Math.round(s * 0.4) + 'px;background:' + bg + ';color:' + fg + '">' + k + '</span>'; }
  function suggest() {
    var chips = [t('Zprávy', 'Messages'), t('Soubory', 'Files'), t('Kanály', 'Channels'), t('Skupinové chaty', 'Group chats'), t('Schůzky', 'Meetings'), t('Obrázky', 'Images')]
      .map(function (c) { return '<span>' + c + '</span>'; }).join('');
    var ppl = [['PS', '#E1E8E3', '#4A5C55', 'Petr<br>Svoboda'], ['LD', '#F3E3DA', '#7A4A33', 'Lucie<br>Dvořáková'], ['JN', '#D6E4F0', '#2A3C62', t('Jana<br>Nováková (Vy)', 'Jana<br>Nováková (You)')]]
      .map(function (p) { return '<div class="sg-p">' + pale(p[0], p[1], p[2], 24) + '<span>' + p[3] + '</span></div>'; }).join('');
    return '<div class="sg" id="sg"><div class="sg-chips">' + chips + '</div>' +
      '<div class="sg-find"><span class="ic">' + ic(P.findch, 13, '#616161', 1.1) + '</span>' + t('Najít v tomto kanálu (Ctrl+F)', 'Find in this channel (Ctrl+F)') + '</div>' +
      '<div class="sg-lab">' + t('Lidé', 'People') + '</div><div class="sg-ppl">' + ppl + '</div>' +
      '<div class="sg-fb">' + t('Odeslat zpětnou vazbu', 'Send feedback') + ic(P.thup, 12, G, 1.1) + ic(P.thdn, 12, G, 1.1) + '</div></div>';
  }

  /* ---------- stránka výsledků hledání (h2 Vše, h3/h4 Soubory) ---------- */
  var CHIPS = [t('Vše', 'All'), t('Zprávy', 'Messages'), t('Soubory', 'Files'), t('Lidé', 'People'), t('Kanály', 'Channels'), t('Skupinové chaty', 'Group chats'), t('Schůzky', 'Meetings'), '+2'];
  function chips(on) {
    return '<div class="sr-chips">' + CHIPS.map(function (c, i) { return '<span class="sr-chip' + (i === on ? ' on' : '') + '" id="chip' + i + '">' + c + '</span>'; }).join('') + '</div>';
  }
  function filters(files) {
    var f = (files ? [t('Typ souboru', 'File type')] : []).concat(['V', t('Osoba', 'Person'), t('Datum', 'Date')]);
    return '<div class="sr-filt">' + f.map(function (n, i) { return '<span id="flt' + (files ? i : i + 1) + '">' + n + CV() + '</span>'; }).join('') + '</div>' +
      (files ? '<div class="sr-view"><span>' + ic(P.gridv, 11, '#616161', 1.1) + '</span><span class="on">' + ic(P.listv, 11, '#5B5FC7', 1.3) + '</span></div>' : '');
  }
  var FB = '<span class="sr-fb">' + t('Odeslat zpětnou vazbu', 'Send feedback') + ic(P.thup, 12, G, 1.1) + ic(P.thdn, 12, G, 1.1) + '</span>';
  /* Karta souboru: název (nalezené slovo tučně), cesta Tým › Kanál, kdo sdílel a kdy, úryvek z obsahu se zvýrazněním. */
  function fileCard(title, snip, id) {
    return '<div class="sr-card"' + (id ? ' id="' + id + '"' : '') + '><div class="sr-file">' + A.fileIco('word', 22) + '<div class="tx"><b>' + title + '</b>' +
      '<div class="sr-path">' + TEAM + ic(P.chevr, 7, '#616161', 1.4) + CHAN + '</div>' +
      '<div class="sr-who">' + t('Sdíleno uživatelem Jana Nováková Před 2 hodinami', 'Shared by Jana Nováková 2 hours ago') + '</div>' +
      '<div class="sr-snip">' + snip + '</div></div></div></div>';
  }
  function msgCard(q) {
    var m = '<mark>' + q + '</mark>';
    return '<div class="sr-card" id="msgCard"><div class="sr-msgh">' + A.teamsShell.sq('JN', '#E2F1F8', '#5F7782', 13) + TEAM + ' > ' + CHAN + '</div>' +
      '<div class="sr-msg"><span class="sr-avw"><i class="tpres"></i></span><div class="tx">' +
      '<div class="who">' + t('Jana Nováková (Vy)', 'Jana Nováková (You)') + '<small>11:05</small></div>' +
      '<div class="body">' + t('Nabídka pro ' + m + ' U Lípy - …nabídku pro ' + m + ' U Lípy. Doplň prosím ceny a termíny rovnou do dokumentu: <u>Nabídka – ' + m + ' U Lípy</u> …',
        'Quote for the U Lípy ' + m + ' - …quote for the U Lípy ' + m + '. Please add prices and dates straight into the document: <u>Quote – U Lípy ' + m + '</u> …') + '</div>' +
      '<div class="sr-fc">' + A.fileIco('word', 20) + '<span class="nm"><b>' + FILE + '.docx</b><small>JavornbytekObchod > ' + CHAN + '</small></span>' + ic(P.shareo, 12, G, 1.15) + ic(P.dots, 12, G, 1.4) + '</div>' +
      '</div></div></div>';
  }
  function empty(q) {
    var b = '<b>' + q + '</b>';
    return '<div class="sr-sec"><div class="sr-h">' + t('Lidé', 'People') + '</div><p>' + t('Nenalezlo se žádné jméno ' + b + '.', 'No names found for ' + b + '.') + '</p></div>' +
      '<div class="sr-sec"><div class="sr-h">' + t('Skupinové chaty', 'Group chats') + '</div><p>' + t('Pro dotaz „' + b + '“ se nenašel žádný skupinový chat.', 'No group chats found for “' + b + '”.') + '</p></div>' +
      '<div class="sr-sec"><div class="sr-h">' + t('Kanály', 'Channels') + '</div><p>' + t('Nenašly se žádné týmy ani kanály s názvem ' + b + '.', 'No teams or channels found named ' + b + '.') + '</p></div>' +
      '<div class="sr-sec"><div class="sr-h">' + t('Schůzky', 'Meetings') + '</div></div>';
  }
  var SNIP_P = t('…<mark>Penzion</mark> U Lípy Děkujeme za poptávku. Na základě prohlídky 2. října navrhujeme kompletní …',
    '…U Lípy <mark>guesthouse</mark> Thank you for your enquiry. Following our visit on 2 October, we propose complete …');
  var SNIP_RD = t('… <mark>recepce</mark> – Penzion U Lípy Děkujeme za poptávku. Na základě prohlídky 2. října navrhujeme … <mark>recepce</mark> z masivního <mark>dub</mark>u . Cenová nabídka Položka Množství Cena Recepční pult, <mark>dub</mark> masiv 1 …',
    '… <mark>Reception</mark> furniture – U Lípy guesthouse Thank you for your enquiry. Following our visit … <mark>reception</mark> furniture in solid <mark>oak</mark> . Price quote Item Quantity Price Reception desk, solid <mark>oak</mark> 1 …');
  var Q_RD = t('recepce dub', 'reception oak');
  var Q_P = t('Penzion', 'guesthouse');

  /* Výsledky „Vše“ (h2). kind 'p' = dotaz Penzion (soubor + zpráva), 'rd' = dotaz recepce dub (jen soubor – slova jsou jen uvnitř dokumentu). */
  function resultsAll(kind) {
    var p = kind !== 'rd', q = p ? Q_P : Q_RD;
    var title = p ? t('Nabídka – <strong>Penzion</strong> U Lípy.docx', 'Quote – U Lípy <strong>guesthouse</strong>.docx') : FILE + '.docx';
    return chips(0) + '<div class="sr-line" style="top:42px"></div>' + filters(false) + '<div class="sr-line" style="top:70px"></div>' +
      '<div class="sr-col" id="srcol"><div class="sr-h">' + t('Soubory', 'Files') + FB + '</div>' + fileCard(title, p ? SNIP_P : SNIP_RD, 'fileCard') +
      '<span class="sr-more">' + t('Další soubory', 'More files') + '</span>' +
      (p ? '<div class="sr-sec"><div class="sr-h">' + t('Zprávy', 'Messages') + '</div>' + msgCard(q) + '<span class="sr-more">' + t('Další zprávy', 'More messages') + '</span></div>' : '') +
      empty(q) + '</div>';
  }
  /* Výsledky „Soubory“ (h3) – širší karta, filtry Typ souboru / V / Osoba / Datum, přepínač mřížka/seznam (h4). */
  function resultsFiles() {
    var dd = [
      [A.appIcon('excel', 10), 'Excel'], [ic(P.img, 10, '#616161', 1.2), t('Obrázky', 'Images')], [tl('L', '#7B4FD6'), 'Loop'], [tl('N', '#7719AA'), 'OneNote'],
      [ic(P.file, 10, '#D13438', 1.3), 'PDF'], [A.appIcon('ppt', 10), 'PowerPoint'], [ic(P.txfile, 10, '#8A8A8A', 1.2), t('Textový soubor', 'Text file')], [A.appIcon('word', 10), 'Word']
    ].map(function (x, i) { return '<div class="ti" id="dd' + i + '">' + x[0] + '<span>' + x[1] + '</span></div>'; }).join('');
    return chips(2) + '<div class="sr-line" style="top:42px"></div>' + filters(true) + '<div class="sr-line" style="top:70px"></div>' +
      '<div class="sr-col wide" id="srcol"><div class="sr-h">' + FB + '</div>' + fileCard(FILE + '.docx', SNIP_RD, 'fileCard') + '</div>' +
      '<div class="tpop sr-dd" id="dd">' + dd + '</div>';
  }
  function tl(L, bg) { return '<span class="tlet" style="width:10px;height:10px;background:' + bg + ';font-size:7px">' + L + '</span>'; }
  var TOKEN = ' <span class="tok">is:' + t('Soubory', 'Files') + '</span>';

  /* ---------- OneDrive v Teams – Domů (h6) ---------- */
  function thumb(kind) {
    if (kind === 'word') return '<div style="padding:9px 8px;font-size:3.2px;line-height:4px;color:#0F4761">' + t('Vybavení recepce – Penzion U Lípy', 'Reception furniture – U Lípy guesthouse') +
      '<div style="height:2px;background:#E3E3E3;margin:4px 0 2px"></div><div style="height:2px;width:70%;background:#E3E3E3"></div>' +
      '<div style="margin-top:5px;border:0.5px solid #CFCFCF;height:16px;background:repeating-linear-gradient(#fff 0 3.5px,#CFCFCF 3.5px 4px)"></div>' +
      '<div style="height:2px;width:40%;background:#C9D6E0;margin-top:5px"></div><div style="height:2px;background:#E3E3E3;margin-top:3px"></div></div>';
    if (kind === 'excel') return '<div style="position:absolute;inset:6px;background:repeating-linear-gradient(90deg,transparent 0 13px,#DADADA 13px 14px),repeating-linear-gradient(transparent 0 6px,#DADADA 6px 7px)"></div><div style="position:absolute;left:6px;right:6px;top:6px;height:6px;background:#E3F1E9"></div>';
    return '<div style="position:absolute;left:5px;right:5px;top:17px;height:44px;background:#F7EDE7;border:0.5px solid #E5D3C8"><div style="margin:9px 7px 0;height:4px;width:55%;background:#C43E1C;opacity:.7"></div><div style="margin:5px 7px 0;height:2px;width:40%;background:#BFA394"></div><div style="position:absolute;right:6px;bottom:6px;width:22px;height:18px;background:#D9B79F"></div></div>';
  }
  function odCard(kind, name, act, when, ai) {
    return '<div class="od-card"><div class="od-ch">' + A.appIcon(kind, 14) + name + '</div>' +
      '<div class="od-act"><span class="ai">' + ai + '</span><span>' + act + '<small>' + when + '</small></span></div>' +
      '<div class="od-thumb">' + thumb(kind) + '</div><span class="od-open">' + t('Otevřít', 'Open') + '</span></div>';
  }
  var ROWS = [
    ['word', FILE, TEAM, t('před 14 min', '14 min ago'), 'Jana Nováková', ic(P.pen, 11, G, 1.2) + '<span>' + t('Upravili jste tento dokument. · před 14 min', 'You edited this document. · 14 min ago') + '</span>'],
    ['excel', t('Ceník 2026', 'Price list 2026'), TEAM, t('pá v 10:46', 'Fri 10:46'), 'Lucie Dvořáková', ''],
    ['word', t('Nabídka – Hotel Pod Skalou', 'Quote – Pod Skalou hotel'), TEAM, t('čt v 13:25', 'Thu 13:25'), 'Jana Nováková', ''],
    ['ppt', t('Prezentace kolekce Dub', 'Oak collection deck'), TEAM, t('po v 15:43', 'Mon 15:43'), 'Petr Svoboda', ''],
    ['excel', t('Výrobní plán – říjen', 'Production plan – October'), t('Javor nábytek – Výroba', 'Javor nábytek – Production'), t('po v 15:36', 'Mon 15:36'), 'Petr Svoboda', ''],
    ['pdf', t('Firemní benefity 2026', 'Company benefits 2026'), t('Celá firma', 'Whole company'), '25. 9.', 'Lucie Dvořáková', ''],
    ['word', t('Objednávka materiálu – dub', 'Material order – oak'), t('Javor nábytek – Výroba', 'Javor nábytek – Production'), '17. 9.', 'Petr Svoboda', ic(P.pen, 11, G, 1.2) + '<span>' + t('<b>Petr Svoboda</b> upravil(a) tento dokument. · 17. 9.', '<b>Petr Svoboda</b> edited this document. · 17. 9.') + '</span>'],
    ['word', t('Postup montáže recepčního pultu', 'Reception desk assembly guide'), t('Javor nábytek – Výroba', 'Javor nábytek – Production'), '12. 9.', 'Petr Svoboda', '']
  ];
  function oneDrive() {
    var nav = function (icon, n, on) { return '<div class="od-i' + (on ? ' on' : '') + '">' + icon + n + '</div>'; };
    var site = function (sq, n) { return '<div class="od-i">' + sq + n + '</div>'; };
    var g = function (n) { return '<div class="od-g">' + n + '</div>'; };
    var NI = function (k) { return ic(P[k], 13, G, 1.15); };
    var left = '<div class="od-nav"><div class="od-t">OneDrive</div><span class="od-new">' + ic(P.plus, 11, '#fff', 1.8) + t('Vytvořit nebo nahrát', 'Create or upload') + '</span>' +
      '<div class="od-items">' +
      nav(ic(P.homeF, 13, G, 1.15), t('Domů', 'Home'), 1) + nav(NI('folder'), t('Moje soubory', 'My files')) + nav(NI('ppl2'), t('Sdílené', 'Shared')) +
      nav(NI('star'), t('Oblíbené', 'Favorites')) + nav(NI('libs'), t('Knihovny', 'Libraries')) + nav(NI('trash'), t('Koš', 'Recycle bin')) +
      g(t('Procházet soubory podle', 'Browse files by')) + nav(NI('person'), t('Lidé', 'People')) + nav(NI('calg'), t('Schůzky', 'Meetings')) + nav(NI('img'), t('Multimédia', 'Media')) +
      g(t('Rychlý přístup', 'Quick access')) +
      site(A.teamsShell.sq('JO', '#7719AA', '#fff', 14), TEAM) + site(A.teamsShell.sq('JV', '#038387', '#fff', 14), t('Javor nábytek – Výroba', 'Javor nábytek – Production')) + site(A.teamsShell.sq('CF', '#CA5010', '#fff', 14), t('Celá firma', 'Whole company')) +
      '</div></div>';
    var cards = '<div class="od-cards">' +
      odCard('word', FILE, t('Upravili jste', 'You edited'), t('před 2 h', '2 h ago'), ic(P.pen, 10, '#5B5FC7', 1.2)) +
      odCard('excel', t('Ceník 2026', 'Price list 2026'), t('<b>Lucie Dvořáková</b> s vámi sdílel(a)', '<b>Lucie Dvořáková</b> shared this with you'), t('pá', 'Fri'), ic(P.person, 10, '#616161', 1.2)) +
      odCard('ppt', t('Prezentace kolekce Dub', 'Oak collection deck'), t('Nedávno jste otevřeli', 'You recently opened'), '25. 9.', ic(P.eye, 10, '#5B5FC7', 1.2)) + '</div>';
    var pills = '<div class="od-last"><b>' + t('Poslední', 'Recent') + '</b>' +
      '<span class="od-pill on" id="pAll">' + t('Vše', 'All') + '</span>' +
      '<span class="od-pill" id="pWord">' + A.appIcon('word', 12) + 'Word</span>' +
      '<span class="od-pill">' + A.appIcon('excel', 12) + 'Excel</span>' +
      '<span class="od-pill">' + A.appIcon('ppt', 12) + 'PowerPoint</span>' +
      '<span class="od-pill">' + ic(P.file, 12, '#D13438', 1.3) + 'PDF</span>' +
      '<span class="od-pill">' + ic(P.filt, 12, G, 1.3) + t('Další', 'More') + '</span>' +
      '<span class="od-filt">' + t('Filtrovat podle jména nebo osoby', 'Filter by name or person') + '</span></div>';
    var rows = ROWS.map(function (r, i) {
      return '<div class="od-tr od-row" id="or' + i + '" data-k="' + r[0] + '"><span></span><span class="nm">' + A.fileIco(r[0], 20) + '<div><b>' + r[1] + '</b><small>' + r[2] + '</small></div></span>' +
        '<span>' + r[3] + '</span><span>' + r[4] + '</span><span class="ac">' + r[5] + '</span></div>';
    }).join('');
    var tbl = '<div class="od-tbl"><div class="od-tr od-th"><span></span><span>' + t('Název', 'Name') + '</span><span>' + t('Otevřené', 'Opened') + '</span><span>' + t('Vlastník', 'Owner') + '</span><span>' + t('Aktivita', 'Activity') + '</span></div>' +
      '<div class="od-rows" id="orows">' + rows + '</div></div>';
    return '<div class="od">' + left + '<div class="od-main"><div class="od-h">' + t('Pro vás', 'For you') + '</div>' + cards + pills + tbl + '</div></div>';
  }
  /* Filtr Poslední: 'word' = jen dokumenty Wordu (pilulka Word aktivní), jinak vše. */
  function odFilter(kind) {
    A.$('pAll').classList.toggle('on', !kind); A.$('pWord').classList.toggle('on', kind === 'word');
    document.querySelectorAll('#orows .od-row').forEach(function (r) {
      var show = !kind || r.getAttribute('data-k') === kind;
      r.hidden = !show; r.classList.toggle('add', !!kind && show);
    });
  }

  window.AKH = {
    FILE: FILE, Q_P: Q_P, Q_RD: Q_RD, TOKEN: TOKEN,
    channelFeed: channelFeed, suggest: suggest,
    resultsAll: resultsAll, resultsFiles: resultsFiles, oneDrive: oneDrive, odFilter: odFilter
  };
})();
