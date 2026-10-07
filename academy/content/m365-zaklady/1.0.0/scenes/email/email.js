/* Akademie – scénář „Podezřelý e-mail“: sdílené stavební kusy scén Outlooku na webu.
   Předlohy: _ref/email/e08 (externí odesílatel v Doručené poště: modré „Jméno<adresa>“, kroužek stavu u Komu, pruh o blokovaném obsahu), e01 (Doručená pošta), e02 (složka Nevyžádaná pošta), e03 (zpráva v Nevyžádané poště s pruhy a blokovaným obsahem),
   e04 (Nahlásit v Nevyžádané poště), e05 (zpráva v Doručené poště), e06 (Nahlásit v Doručené poště).
   Zprávy, odesílatelé a adresy jsou fiktivní (Javor nábytek). Ikony jsou zjednodušené (bez log). Souřadnice = px snímku. */
(function () {
  var A = AK, t = A.t, ic = A.ic, P = A.P, G = '#424242', BL = '#0F6CBD';
  var I = {
    inbox: '<path d="M2.5 9.5l1.5-6h8l1.5 6v3.5h-11z"/><path d="M2.5 9.5h3.2l.8 1.5h3l.8-1.5h3.2"/>',
    sent: '<path d="M2.5 2.5l11 5.5-11 5.5 2-5.5z"/><path d="M4.5 8h5"/>',
    draft: '<path d="M10.5 2.5l3 3-8 8h-3v-3z"/>',
    del: '<path d="M2.5 4.5h11M6.3 4.5V3a.5.5 0 01.5-.5h2.4a.5.5 0 01.5.5v1.5M4 4.5l.7 8.6a1 1 0 001 .9h4.6a1 1 0 001-.9l.7-8.6"/>',
    junk: '<path d="M2.5 9.5l1.5-6h8l1.5 6v3.5h-11z"/><circle cx="11.5" cy="11" r="2.6" fill="#fff"/><path d="M9.7 12.8l3.6-3.6"/>',
    note: '<rect x="3" y="2.5" width="10" height="11" rx="1.5"/><path d="M5.5 6h5M5.5 8.5h3"/>',
    arch: '<rect x="2.5" y="3" width="11" height="3" rx="1"/><path d="M3.5 6v6.5a1 1 0 001 1h7a1 1 0 001-1V6M6.5 8.5h3"/>',
    folder: '<path d="M1.5 4.5a1 1 0 011-1H6l1.5 1.8h6a1 1 0 011 1V12a1 1 0 01-1 1h-10a1 1 0 01-1-1z"/>',
    sfold: '<path d="M1.5 4.5a1 1 0 011-1H6l1.5 1.8h6a1 1 0 011 1V8"/><circle cx="10.5" cy="11" r="2.2"/><path d="M12.2 12.7l1.5 1.5"/>',
    grp: '<circle cx="6" cy="5.2" r="2.3"/><path d="M1.8 13.5c0-2.4 1.9-4.1 4.2-4.1s4.2 1.7 4.2 4.1"/><circle cx="11.6" cy="5.8" r="1.8"/><path d="M11.4 9.4c1.9 0 3.3 1.4 3.3 3.5"/>',
    shield: '<path d="M8 2l5 2v4c0 3-2.2 5-5 6-2.8-1-5-3-5-6V4z"/><path d="M8 5.5v3.2M8 10.6h.01"/>',
    nospam: '<circle cx="8" cy="8" r="5.5"/><path d="M4.1 11.9l7.8-7.8"/>',
    notjunk: '<rect x="2" y="3.5" width="12" height="9" rx="1.5"/><path d="M2.5 4.5L8 9l5.5-4.5"/><circle cx="11.6" cy="11.6" r="2.6" fill="currentColor"/><path d="M10.5 11.6l.8.8 1.5-1.6" stroke="#fff" stroke-width="1.1"/>',
    broom: '<path d="M13 3L8.5 7.5M8.5 7.5l-2-2-3.5 4.5 3 3 4.5-3.5z"/><path d="M4.5 10.5l-2 2.5"/>',
    move: '<path d="M1.5 4.5a1 1 0 011-1H6l1.5 1.8h6a1 1 0 011 1V12a1 1 0 01-1 1h-10a1 1 0 01-1-1z"/><path d="M6.5 9.5h4M9 7.8l1.7 1.7L9 11.2"/>',
    reply: '<path d="M6 4L2.5 7.5 6 11"/><path d="M2.5 7.5h6a5 5 0 015 5"/>',
    replyall: '<path d="M6.5 4L3 7.5 6.5 11M9.5 4L6 7.5 9.5 11"/><path d="M6 7.5h3.5a5 5 0 015 5"/>',
    fwd: '<path d="M10 4l3.5 3.5L10 11"/><path d="M13.5 7.5h-6a5 5 0 00-5 5"/>',
    bolt: '<path d="M9 1.5L3.5 9h4L7 14.5 12.5 7h-4z"/>',
    env: '<path d="M2.5 6.5L8 3l5.5 3.5V13h-11z"/><path d="M2.5 6.5L8 10l5.5-3.5"/>',
    tag: '<path d="M2.5 8.2V3.5a1 1 0 011-1h4.7l5.3 5.3-5.7 5.7z"/><circle cx="5.6" cy="5.6" r=".9"/>',
    flag: '<path d="M3.5 14V2.5M3.5 3h8l-2 3 2 3h-8"/>',
    print: '<rect x="4" y="2.5" width="8" height="4" rx=".5"/><rect x="2" y="6.5" width="12" height="5" rx="1"/><rect x="4.5" y="9.5" width="7" height="4" fill="#fff"/>',
    undo: '<path d="M5 3L2 6l3 3M2 6h7a4 4 0 010 8H6"/>',
    star: '<path d="M8 2l1.8 3.8 4.2.5-3.1 2.9.8 4.1L8 11.3l-3.7 2 .8-4.1L2 6.3l4.2-.5z"/>',
    sort: '<path d="M5 13V3M2.5 5.5L5 3l2.5 2.5M11 3v10M8.5 10.5L11 13l2.5-2.5"/>',
    jump: '<path d="M8 3v10M5 10l3 3 3-3"/>',
    copy: '<rect x="5" y="5" width="8.5" height="8.5" rx="1.5"/><path d="M3 10.5V3.5A1 1 0 014 2.5h7"/>',
    smile: '<circle cx="8" cy="8" r="6"/><path d="M5.5 9.5a3 3 0 005 0M6 6.5h.01M10 6.5h.01"/>',
    teams: '<rect x="2" y="4" width="8" height="8" rx="1.5" fill="#5B5FC7" stroke="none"/><path d="M4.5 6.5h3M6 6.5v4" stroke="#fff"/><circle cx="12" cy="5.5" r="1.5" fill="#7B83EB" stroke="none"/>',
    cal: '<rect x="2.5" y="3" width="11" height="10.5" rx="1.5"/><path d="M2.5 6h11"/>',
    ppl: '<circle cx="8" cy="5.5" r="2.4"/><path d="M3.5 13c0-2.5 2-4 4.5-4s4.5 1.5 4.5 4"/>',
    todo: '<path d="M3 8.5l3.5 3.5 6.5-8"/>',
    gear: A.WI.gear, bell: P.bell
  };
  for (var k in I) P['ol_' + k] = I[k];
  function oi(n, s, c, w) { return ic(P['ol_' + n] || P[n], s || 10, c || G, w || 1.1); }
  var PC = { PU: ['#E8D9C8', '#6B4A2A'], PS: ['#D6E6F5', '#24507A'], LD: ['#F6DCE8', '#8A2D58'], PJ: ['#DDEFD9', '#2F6B2A'], JN: ['#E6E0F6', '#4E3A8C'] };
  function av(k2, s) { var c = PC[k2]; return '<span class="ol-av" style="width:' + s + 'px;height:' + s + 'px;font-size:' + Math.round(s * 0.38) + 'px;background:' + c[0] + ';color:' + c[1] + '">' + k2 + '</span>'; }

  /* zprávy (fiktivní) */
  var M = {
    scam: { k: 'PU', name: 'Penzion U Lípy', addr: 'recepce.penzionulipy@gmail.com', subj: t('Faktura k úhradě – ověřte účet', 'Invoice due – verify your account'), prev: t('Dobrý den, v příloze Vám zasíláme fakturu za ubytování…', 'Hello, please find attached the invoice for accommodation…'), time: '9:12', date: t('Út 06.10.2026 9:12', 'Tue 10/6/2026 9:12 AM'),
      body: t('<p>Dobrý den,</p><p>zasíláme Vám fakturu za ubytování a služby. Platbu je nutné potvrdit do 24 hodin, jinak bude objednávka zrušena.</p><p>Fakturu zobrazíte po přihlášení svým firemním účtem:<br><u>Zobrazit fakturu</u></p><p>S pozdravem<br>Recepce Penzion U Lípy</p>',
        '<p>Hello,</p><p>we are sending you the invoice for accommodation and services. Payment must be confirmed within 24 hours, otherwise the order will be cancelled.</p><p>Sign in with your work account to view the invoice:<br><u>View invoice</u></p><p>Kind regards<br>U Lípy guesthouse reception</p>') },
    pila: { k: 'PJ', name: t('Pila Jedlová', 'Jedlová sawmill'), addr: 'obchod@pila-jedlova.cz', subj: t('Potvrzení objednávky – dubové fošny', 'Order confirmation – oak planks'), prev: t('Dobrý den, potvrzujeme objednávku dubových fošen…', 'Hello, we confirm your order of oak planks…'), time: t('Po 15:20', 'Mon 3:20 PM'), date: t('Po 05.10.2026 15:20', 'Mon 10/5/2026 3:20 PM'),
      body: t('<p>Dobrý den,</p><p>potvrzujeme objednávku dubových fošen pro zakázku Penzion U Lípy. Dodání plánujeme na příští týden.</p>', '<p>Hello,</p><p>we confirm your order of oak planks for the U Lípy guesthouse job. Delivery is planned for next week.</p>'),
      sig: t('Pila Jedlová · obchodní oddělení', 'Jedlová sawmill · sales') }
  };
  var INBOX = [
    [t('Dnes', 'Today'), [['scam', 1]]],
    [t('Včera', 'Yesterday'), [['PS', 0, 'Petr Svoboda', t('Ceny pro Penzion U Lípy', 'Prices for U Lípy guesthouse'), t('Ahoj Jano, ceny jsem doplnil rovnou do dokumentu…', 'Hi Jana, I added the prices straight into the document…'), t('Po 16:40', 'Mon 4:40 PM')],
      ['LD', 0, 'Lucie Dvořáková', t('Termín montáže', 'Assembly date'), t('Montáž můžeme naplánovat na čtvrtek…', 'We can schedule the assembly for Thursday…'), t('Po 11:05', 'Mon 11:05 AM')]]],
    [t('Minulý týden', 'Last week'), [['PS', 0, 'Petr Svoboda', t('Hotel Pod Skalou', 'Pod Skalou hotel'), t('Nabídka odešla, klient se ozve do pátku.', 'The quote has been sent, the client will reply by Friday.'), t('Čt 01.10', 'Thu 10/1')],
      ['LD', 0, 'Lucie Dvořáková', t('Nový ceník 2026', 'New 2026 price list'), t('Ceník 2026 je v záložce Sdíleno…', 'The 2026 price list is in the Shared tab…'), t('St 30.09', 'Wed 9/30')]]]
  ];

  /* pás karet: 'inbox0' (nic nevybráno), 'msg' (zpráva v Doručené), 'junkF' (Nevyžádaná, nic nevybráno), 'junk' (zpráva v Nevyžádané) */
  function ribbon(kind, o) {
    o = o || {};
    var off = function (n) { return (kind === 'inbox0' || kind === 'junkF') ? true : (kind === 'junk' && /arch|clean|reply|replyall|teams/.test(n)); };
    var ri = function (n, icon, label, cv, c, id) { var d = off(n); return '<span class="ol-ri' + (d ? ' off' : '') + (o.on === n ? ' on' : '') + '"' + (id ? ' id="' + id + '"' : '') + '>' + oi(icon, 10, d ? '#BDBDBD' : (c || G)) + (label || '') + (cv ? '<span' + (id ? ' id="' + id + 'Cv"' : '') + '>' + ic(P.chevd, 7, d ? '#BDBDBD' : G, 1.4) + '</span>' : '') + '</span>'; };
    var S = '<span class="ol-rs"></span>';
    var first = kind === 'junkF' ? '<span class="ol-ri">' + oi('del', 10) + t('Vyprázdnit složku', 'Empty folder') + ic(P.chevd, 7, G, 1.4) + '</span>' : ri('del', 'del', t('Odstranit', 'Delete'), 1);
    return '<span class="ol-new"><span>' + oi('draft', 9, '#fff', 1.3) + t('Nová zpráva', 'New mail') + '</span><span>' + ic(P.chevd, 7, '#fff', 1.5) + '</span></span>' +
      first + ri('arch', 'arch', t('Archivovat', 'Archive'), 0, '#2E8B3E') + ri('rep', 'shield', t('Nahlásit', 'Report'), 1, '#C4314B', 'rep') + ri('clean', 'broom', t('Uklidit', 'Sweep'), 0, '#424242') +
      ri('move', 'move', t('Přesunout do', 'Move to'), 1, BL) + S + ri('reply', 'reply', t('Odpovědět', 'Reply'), 0, '#7B5FBF') + ri('replyall', 'replyall', t('Odpovědět všem', 'Reply all'), 0, '#7B5FBF') +
      ri('fwd', 'fwd', t('Přeposlat', 'Forward'), 1, BL) + S + ri('teams', 'teams', t('Nasdílet do Teams', 'Share to Teams'), 0, '#5B5FC7', '') +
      '<span class="ol-ri">' + oi('bolt', 10, '#D89614') + t('Rychlé kroky', 'Quick steps') + ic(P.chevd, 7, G, 1.4) + '</span>' +
      '<span class="ol-ri">' + oi('env', 10) + ((kind === 'msg' || kind === 'junk') ? t('Přečtené/nepřečtené', 'Read/Unread') : t('Označit vše jako přečtené', 'Mark all as read')) + '</span>' +
      '<span class="ol-ri">' + oi('tag', 10) + '</span><span class="ol-ri">' + oi('flag', 10, '#C4314B') + '</span>' + S + '<span class="ol-ri">' + oi('print', 10) + '</span><span class="ol-ri">' + ic(P.dots, 10, G, 1.4) + '</span>';
  }
  /* nabídka Nahlásit (e06 v Doručené, e04 v Nevyžádané) */
  function reportMenu(junk, hot) {
    var it = junk ? [['shield', '#C4314B', t('Nahlásit útok phishing', 'Report phishing')], ['notjunk', '#424242', t('Není nevyžádaná pošta', 'Not junk')]]
      : [['shield', '#C4314B', t('Nahlásit útok phishing', 'Report phishing')], ['nospam', '#B07A2A', t('Nahlásit spam', 'Report junk')]];
    return it.map(function (x, i) { return '<div class="o' + (hot === i ? ' hv' : '') + '" id="rm' + i + '">' + oi(x[0], 10, x[1], 1.2) + x[2] + '</div>'; }).join('');
  }

  function folders(junkOn) {
    var fi = function (icon, n, cnt, on, id, g) { return '<div class="ol-fi' + (on ? ' on' : '') + '"' + (id ? ' id="' + id + '"' : '') + '>' + oi(icon, 9) + n + (cnt ? '<span class="n' + (g ? ' g' : '') + '">' + cnt + '</span>' : '') + '</div>'; };
    var inb = !junkOn;
    return '<div class="ol-fp"><div class="ol-fh">' + ic(P.chevd, 7, G, 1.4) + t('Oblíbené', 'Favorites') + '</div>' +
      fi('inbox', t('Doručená pošta', 'Inbox'), '3', inb) + fi('sent', t('Odeslaná pošta', 'Sent Items')) + fi('draft', t('Koncepty', 'Drafts'), '[1]', 0, '', 1) +
      '<div class="ol-fh" style="margin-top:6px;font-size:7.9px">' + ic(P.chevd, 7, G, 1.4) + 'jana.novakova@javo…</div>' +
      fi('inbox', t('Doručená pošta', 'Inbox'), '3') + fi('draft', t('Koncepty', 'Drafts'), '[1]', 0, '', 1) + fi('sent', t('Odeslaná pošta', 'Sent Items')) + fi('del', t('Odstraněná pošta', 'Deleted Items')) +
      fi('junk', t('Nevyžádaná pošta', 'Junk Email'), '[1]', junkOn, 'fJunk', 1) + fi('note', t('Poznámky', 'Notes')) + fi('arch', t('Archiv', 'Archive')) + fi('folder', t('Historie konverzací', 'Conversation History')) +
      fi('sfold', 'Search Folders') + '<div style="height:8px"></div>' + fi('grp', t('Přejít na Skupiny', 'Go to Groups')) + '</div>';
  }
  function row(m, sel, unr, id, two) {
    return '<div class="ol-row' + (sel ? ' sel' : '') + (unr && !sel ? ' unr' : '') + '"' + (id ? ' id="' + id + '"' : '') + '>' + (sel ? '<span class="cb"></span>' : '<span class="av">' + av(m.k, 18) + '</span>') +
      '<b>' + m.name + '</b>' + (two ? '<div class="ad">&lt;' + m.addr + '&gt;</div>' : '') + '<div class="s"><span>' + m.subj + '</span><small>' + m.time + '</small></div><div class="p">' + m.prev + '</div></div>';
  }
  function inboxList(sel) {
    var h = '<div class="ol-lh"><span class="tt">' + t('Doručená pošta', 'Inbox') + '</span><span class="ic">' + oi('star', 9, '#242424') + oi('copy', 9) + oi('jump', 9) + ic(P.filt, 9, G, 1.2) + oi('sort', 9) + '</span></div>';
    INBOX.forEach(function (g) {
      h += '<div class="ol-gh">' + ic(P.chevd, 7, G, 1.4) + g[0] + '</div>';
      g[1].forEach(function (r) {
        if (r[0] === 'scam') h += row(M.scam, sel, true, 'rScam').replace('ol-row sel', 'ol-row sel ext');
        else h += row({ k: r[0], name: r[2], subj: r[3], prev: r[4], time: r[5] }, false, false);
      });
    });
    return '<div class="ol-lp">' + h + '</div>';
  }
  function junkList(sel) {
    return '<div class="ol-lp"><div class="ol-lh"><span class="tt">' + t('Nevyžádaná pošta', 'Junk Email') + '</span><span class="ic">' + oi('star', 9) + oi('copy', 9) + oi('jump', 9) + ic(P.filt, 9, G, 1.2) + oi('sort', 9) + '</span></div>' +
      '<div class="ol-info"><i></i>' + t('Položky v Email nevyžádané pošty se po 30 dnech trvale odstraní.', 'Items in Junk Email are permanently deleted after 30 days.') + '</div>' +
      '<div class="ol-gh">' + ic(P.chevd, 7, G, 1.4) + t('Včera', 'Yesterday') + '</div>' + row(M.pila, sel, true, 'rPila', true) + '</div>';
  }
  function message(m, junk, o) {
    o = o || {};
    var act = '<span>' + oi('smile', 10, BL) + '</span><span' + (junk ? ' class="off"' : '') + '>' + oi('reply', 9, junk ? '#BDBDBD' : '#7B5FBF') + t('Odpovědět', 'Reply') + '</span><span' + (junk ? ' class="off"' : '') + '>' + oi('replyall', 9, junk ? '#BDBDBD' : '#7B5FBF') + t('Odpovědět všem', 'Reply all') + '</span>' +
      '<span>' + oi('fwd', 9, BL) + t('Přeposlat', 'Forward') + '</span>' + ic(P.dots, 10, G, 1.4);
    var bars = junk ? '<div class="ol-bar"><i></i>' + t('Tuto zprávu jsme identifikovali jako nevyžádanou poštu. Po 30 dnech ji odstraníme.', 'We identified this message as junk. We’ll delete it after 30 days.') +
      '<span class="bt"><span id="bNotJunk">' + t('Není to nevyžádaná pošta', 'It’s not junk') + '</span><span id="bShow" class="' + (o.hvShow ? 'hv' : '') + '">' + t('Zobrazit blokovaný obsah a povolit odkazy', 'Show blocked content and enable links') + '</span></span></div>' +
      '<div class="ol-bar"><i></i>' + t('Uchovávání dat: Junk Email (30 d.) Vyprší: St 04.11.2026 15:20', 'Retention: Junk Email (30 days) Expires: Wed 11/4/2026 3:20 PM') + '</div>' : '';
    /* e08: externí odesílatel v Doručené poště – šedý pruh pod hlavičkou */
    var extBar = '<div class="ol-bar"><i></i>' + t('Některé části v této zprávě jsou zablokované, protože odesílatele nemáte v seznamu bezpečných odesílatelů.', 'Some content in this message has been blocked because the sender isn’t in your Safe senders list.') + '</div>';
    var body = m.body + (m.sig ? '<div class="ol-img"></div><p>' + m.sig + '</p>' : '');
    return '<div class="ol-subj">' + m.subj + '</div><div class="ol-msg"><div class="ol-mh"><span class="av">' + av(m.k, 26) + '</span>' +
      '<span class="fr' + (junk ? '' : ' ext') + '"><span id="fromName">' + m.name + '</span><span id="fromAddr" class="' + (o.hvAddr ? 'hv' : '') + '">&lt;' + m.addr + '&gt;</span></span>' +
      '<span class="to' + (junk ? '' : ' ext') + '">' + t('Komu:', 'To:') + (junk ? ' ' : ' <i class="st"></i>') + '<b>Jana Nováková</b></span><span class="act">' + act + '</span><span class="ol-dt">' + m.date + '</span></div>' + (junk ? bars : extBar) +
      '<div class="ol-body">' + body + '</div><div class="ol-rbtns"><span' + (junk ? ' class="off"' : '') + '>' + oi('reply', 9, junk ? '#BDBDBD' : '#7B5FBF') + t('Odpovědět', 'Reply') + '</span><span' + (junk ? ' class="off"' : '') + '>' + oi('replyall', 9, junk ? '#BDBDBD' : '#7B5FBF') + t('Odpovědět všem', 'Reply all') + '</span><span>' + oi('fwd', 9, BL) + t('Přeposlat', 'Forward') + '</span></div></div>';
  }
  function emptyPane() {
    return '<div class="ol-empty"><div style="width:60px;height:52px;margin:0 auto 14px;position:relative"><i style="position:absolute;left:4px;top:18px;width:52px;height:34px;border-radius:4px;background:linear-gradient(135deg,#EDEDED,#D8D8D8)"></i>' +
      '<i style="position:absolute;left:14px;top:4px;width:32px;height:28px;border-radius:3px;background:linear-gradient(135deg,#C9B8F2,#7FB2E5)"></i></div><b>' + t('Vyberte položku, kterou si chcete přečíst.', 'Select an item to read') + '</b><small>' + t('Není vybrána žádná položka.', 'Nothing is selected') + '</small></div>';
  }

  /* celé okno. o: {folder: 'inbox'|'junk', sel: vybraná zpráva, menu: nabídka Nahlásit, hot, hvAddr, hvShow} */
  function page(o) {
    o = o || {};
    var junk = o.folder === 'junk';
    var kind = junk ? (o.sel ? 'junk' : 'junkF') : (o.sel ? 'msg' : 'inbox0');
    var rail = ['inbox', 'cal', 'ppl', 'todo', 'note', 'grp', 'teams'].map(function (n, i) { return '<span' + (i === 0 ? ' class="on"' : '') + ' style="top:' + (8 + i * 28) + 'px">' + oi(n, 12, i === 0 ? BL : BL, 1.2) + '</span>'; }).join('');
    var top = '<div class="ol-top"><span class="g">' + ic(P.launcher, 11, '#fff') + '</span><b>Outlook</b><div class="ol-srch">' + ic(P.search, 9, '#424242', 1.3) + t('Hledat', 'Search') + '</div>' +
      '<span class="ri" style="right:73px">' + oi('teams', 11, '#fff') + '</span><span class="ri" style="right:50px">' + oi('bell', 11, '#fff', 1.2) + '</span><span class="ri" style="right:28px">' + oi('gear', 11, '#fff', 1.1) + '</span>' +
      '<span class="me">' + av('JN', 20) + '</span></div>';
    var tabs = '<div class="ol-tabs">' + ic(P.lines, 10, G, 1.2) + '<span>' + t('Soubor', 'File') + '</span><span class="on">' + t('Domů', 'Home') + '</span><span>' + t('Zobrazit', 'View') + '</span><span>' + t('Nápověda', 'Help') + '</span></div>';
    var list = junk ? junkList(!!o.sel) : inboxList(!!o.sel);
    var rp = '<div class="ol-rp" id="rp">' + (o.sel ? message(junk ? M.pila : M.scam, junk, o) : emptyPane()) + '</div>';
    var menu = o.menu ? '<div class="ol-menu" id="repMenu" style="left:' + (o.menuX || 230) + 'px;top:77px">' + reportMenu(junk, o.hot) + '</div>' : '';
    return '<div class="ol" id="ol">' + top + '<div class="ol-rail">' + rail + '</div>' + tabs + '<div class="ol-rib" id="rib">' + ribbon(kind, { on: o.menu ? 'rep' : '' }) + '</div>' + folders(junk) + list + rp + menu + '</div>';
  }
  /* vykreslí okno do #app a nabídku Nahlásit zarovná pod tlačítko (e04, e06) */
  function show(o) {
    A.$('app').innerHTML = page(o);
    var m = A.$('repMenu'); if (m) m.style.left = (A.$('rep').offsetLeft + 37 - 6) + 'px';
  }
  window.AKE = { page: page, show: show };
})();
