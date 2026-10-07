/* Akademie – scénář „Nový kolega nastupuje“: sdílené stavební kusy scén správy členů týmu v Teams.
   Předlohy: _ref/novy-kolega/n01 (nabídka týmu), n02–n04 (Přidat členy do týmu), n05–n06 (Spravovat tým – Kanály, další záložky),
   n07–n09 (Členové, Členové a hosté, nabídka role). Lidé, tým a adresy jsou fiktivní (Javor nábytek). Ikony jsou zjednodušené. */
(function () {
  var A = AK, t = A.t, ic = A.ic, P = A.P, G = '#424242';
  var TEAM = t('Javor nábytek – Obchod', 'Javor nábytek – Sales');
  var PLAN_TAB = t('Zakázky – vybavení pe…', 'Jobs – guesthouse fur…');
  var NEW = 'Tomáš Malý';
  var I = {
    hide: '<path d="M2 8s2.3-4 6-4c1 0 1.9.3 2.7.7M14 8s-2.3 4-6 4c-1 0-1.9-.3-2.7-.7"/><circle cx="8" cy="8" r="1.8"/><path d="M2.5 2.5l11 11"/>',
    addm: '<circle cx="6.5" cy="5.2" r="2.4"/><path d="M2.3 13.2c0-2.4 1.9-4 4.2-4"/><circle cx="11.4" cy="11.4" r="2.6" fill="currentColor"/><path d="M11.4 10.1v2.6M10.1 11.4h2.6" stroke="#fff" stroke-width="1.1"/>',
    addc: '<rect x="2.5" y="3" width="9" height="9" rx="1.5"/><path d="M5 6h4M5 8.5h2.5"/><circle cx="11.6" cy="11.6" r="2.6" fill="currentColor"/><path d="M11.6 10.3v2.6M10.3 11.6h2.6" stroke="#fff" stroke-width="1.1"/>',
    gear: A.WI.gear,
    tag: '<path d="M2.5 8.2V3.5a1 1 0 011-1h4.7l5.3 5.3-5.7 5.7z"/><circle cx="5.6" cy="5.6" r=".9"/>',
    arch: '<rect x="2.5" y="3" width="11" height="3" rx="1"/><path d="M3.5 6v6.5a1 1 0 001 1h7a1 1 0 001-1V6M6.5 8.5h3"/>',
    leave: '<path d="M4 2.5h6l2.5 2.5v4M4 2.5v11h3.5"/><circle cx="11.6" cy="11.6" r="2.6" fill="currentColor"/><path d="M10.4 11.6h2.4" stroke="#fff" stroke-width="1.1"/>',
    trash: '<path d="M2.5 4.5h11M6.3 4.5V3a.5.5 0 01.5-.5h2.4a.5.5 0 01.5.5v1.5M4 4.5l.7 8.6a1 1 0 001 .9h4.6a1 1 0 001-.9l.7-8.6"/><path d="M6.8 7v4.5M9.2 7v4.5"/>',
    house: '<path d="M2.5 7.5L8 3l5.5 4.5V13h-4V9.8h-3V13h-4z"/>'
  };
  for (var k in I) P['nk_' + k] = I[k];
  function ni(n, s, c, w) { return ic(P['nk_' + n] || P[n], s || 10, c || G, w || 1.1); }
  function pav(k2, s) { return '<span class="nk-pav" style="width:' + s + 'px;height:' + s + 'px;font-size:' + Math.round(s * 0.4) + 'px">' + k2 + '</span>'; }

  /* poloha prvku na scéně (px scény) */
  function at(el) {
    if (typeof el === 'string') el = A.$(el);
    var st = A.$('stage'), r = el.getBoundingClientRect(), b = st.getBoundingClientRect(), s = b.width / 1160;
    return { x: (r.left - b.left) / s, y: (r.top - b.top) / s, w: r.width / s, h: r.height / s };
  }

  /* kanál Nabídky › Příspěvky (pozadí n01–n04) + vrstva překryvů */
  function channel(body) {
    return A.teamsShell({ tab: 0, extraTab: PLAN_TAB, body: body || AKH.channelFeed() }) + '<div class="plo" id="nko"></div>';
  }
  function over(html) { A.$('nko').innerHTML = html; }
  /* řádek týmu Javor nábytek – Obchod v panelu Chat; „⋯“ při najetí (n01) */
  function teamRow() { return document.querySelectorAll('.tteam')[1]; }
  function showDots() {
    var r = teamRow(); if (!r || r.querySelector('.nk-tdots')) return;
    r.style.position = 'relative'; r.style.background = '#fff'; r.style.borderRadius = '4px';
    r.insertAdjacentHTML('beforeend', '<span class="nk-tdots" id="tDots">' + ic(P.dots, 12, G, 1.4) + '</span>');
  }
  /* nabídka týmu (n01) */
  function teamMenu(hot) {
    showDots();
    var d = at('tDots');
    var it = function (i, icon, n) { return '<div class="it' + (hot === i ? ' hv' : '') + '" id="tm' + i + '">' + ni(icon, 10) + n + '</div>'; };
    return '<div class="nkz" style="left:' + (d.x + d.w / 2 - 131) + 'px;top:' + (d.y + d.h / 2 + 2) + 'px;transform:scale(1.2)"><div class="nk-menu">' +
      it(0, 'hide', t('Skrýt všechny kanály', 'Hide all channels')) + '<div class="sep"></div>' +
      it(1, 'addm', t('Přidat člena', 'Add member')) + it(2, 'addc', t('Přidat kanál', 'Add channel')) + it(3, 'gear', t('Spravovat tým', 'Manage team')) +
      it(4, 'tag', t('Spravovat značky', 'Manage tags')) + it(5, 'link', t('Kopírovat odkaz', 'Copy link')) + it(6, 'arch', t('Archiv', 'Archive')) + '<div class="sep"></div>' +
      it(7, 'leave', t('Opustit tým', 'Leave the team')) + it(8, 'trash', t('Odstranit tým', 'Delete the team')) + '</div></div>';
  }
  /* dialog Přidat členy do týmu (n02 prázdný, n03 našeptávač, n04 vybraná osoba) – o: {q, caret, sug, sel} */
  function addDlg(o) {
    o = o || {};
    var hasQ = o.q != null && o.q !== '';
    var input = '<div class="nk-in"><span class="ph" id="dPh"' + (hasQ || o.caret ? ' hidden' : '') + '>' + t('Zadejte jméno nebo e-mail', 'Enter a name or email') + '</span><span id="dV">' + (hasQ ? o.q : '') + '</span><span class="caret" id="dCar"' + (o.caret ? '' : ' hidden') + '></span>' +
      (o.sug ? '<span class="cv">' + ic(P.chevd, 7, '#8A8A8A', 1.4) + '</span>' : '') + '</div>';
    var sug = o.sug ? '<div class="nk-sg"><div class="nk-sr foc" id="sgTM">' + pav('TM', 17) + '<span><b>' + NEW + '</b><small>(TOMAS.MALY) ' + t('Obchodní zástupce', 'Sales representative') + '</small></span></div></div>' : '';
    var sel = o.sel ? '<div class="nk-sel' + (o.selIn ? ' sr-in' : '') + '">' + pav('TM', 17) + '<span><b>' + NEW + '</b><small>tomas.maly@javornabytek.cz</small></span><span class="r"><span style="display:flex;align-items:center;gap:5px">' + t('Člen', 'Member') + ic(P.chevd, 7, G, 1.4) + '</span>' + ic(P.x, 9, G, 1.3) + '</span></div>' : '';
    return '<div class="nk-dim on"></div><div class="nkz' + (o.anim ? ' pn-in' : '') + '" style="left:50%;top:50%;transform:translate(-50%,-50%) scale(1.2);transform-origin:center;z-index:46"><div class="nk-dlg">' +
      '<h3>' + t('Přidat členy do týmu ', 'Add members to ') + TEAM + '</h3>' +
      '<p>' + t('Začněte psát název, distribuční seznam nebo skupinu zabezpečení, které chcete přidat do týmu. Můžete také přidat lidi mimo vaši organizaci jako hosty, a to zadáním jejich e-mailových adres. Lidé mimo vaši organizaci dostanou e-mail s oznámením, že byli přidáni.',
        'Start typing a name, distribution list, or security group to add to your team. You can also add people outside your organization as guests by typing their email addresses. People outside your organization will get an email letting them know they’ve been added.') + ' <u>' + t('Informace o přidávání hostů', 'Learn about guests') + '</u></p>' +
      input + sug + sel + '<span class="nk-b" style="left:219px" id="dCancel">' + t('Zrušit', 'Cancel') + '</span><span class="nk-b ' + (o.sel ? 'pri' : 'off') + '" style="left:280px" id="dAdd">' + t('Přidat', 'Add') + '</span></div></div>';
  }

  /* Spravovat tým (n05–n09) – nahradí obsah plochy vpravo od panelu Chat.
     o: {tab: 'chan' | 'mem', open: rozbalené Členové a hosté, hv: řádek pod kurzorem (2 = nový kolega), menu: nabídka role u nového kolegy, hot} */
  function manage(o) {
    o = o || {};
    var mem = o.tab === 'mem';
    var tabs = [[241, t('Kanály', 'Channels'), 'mtC'], [292, t('Členové', 'Members'), 'mtM'], [351, t('Žádosti čekající na vyří…', 'Pending requests'), ''], [499, t('Nastavení', 'Settings'), ''], [568, t('Analýza', 'Analytics'), ''], [626, t('Aplikace', 'Apps'), ''], [688, t('Značky', 'Tags'), '']]
      .map(function (x, i) { return '<span class="nk-tab' + ((mem ? i === 1 : i === 0) ? ' on' : '') + '" style="left:' + x[0] + 'px"' + (x[2] ? ' id="' + x[2] + '"' : '') + '>' + x[1] + '</span>'; }).join('');
    var head = '<div class="nk-mh"><span class="tl">' + A.teamsShell.sq('JN', '#E2F1F8', '#5F7782', 28) + '</span><b>' + TEAM + '</b>' + tabs + '<span style="position:absolute;left:935px;top:22px">' + ic(P.dots, 11, G, 1.4) + '</span></div>';
    var body;
    if (!mem) {
      body = '<span class="nk-pill on" style="left:64px;width:85px">' + t('Vše', 'All') + '</span><span class="nk-pill" style="left:160px;width:124px">' + t('Zobrazeno pro vás', 'Shown for you') + '</span>' +
        '<span class="nk-pill" style="left:296px;width:92px">' + t('4 další(ch)', '4 more') + ic(P.chevd, 7, G, 1.4) + '</span><span class="nk-pill pl" style="left:410px;width:81px;font-weight:400">' + t('Seřadit: A–Z', 'Sort: A–Z') + ic(P.chevd, 7, G, 1.4) + '</span>' +
        '<span class="nk-pill pl" style="left:540px;width:89px">' + ic(P.plus, 10, G, 1.3) + t('Přidat kanál', 'Add channel') + '</span><span class="nk-srch" style="left:651px;width:247px">' + t('Hledat v kanálech', 'Search channels') + '</span>' +
        '<div class="nk-ch"><b>' + t('Nabídky', 'Quotes') + ni('house', 9) + '</b><small>' + t('Poslední aktivita: 1 day ago', 'Last activity: 1 day ago') + '<i></i>' + t('Nabídky a poptávky zákazníků.', 'Customer quotes and enquiries.') + '</small><span class="r">' + t('Skrýt', 'Hide') + ic(P.dots, 11, G, 1.4) + '</span></div>';
    } else {
      var X = { n: 13, p: 177, w: 341, z: 506, r: 674, x: 848 };
      var th = function (y) {
        return '<div class="nk-th" style="top:' + y + 'px"><span style="left:' + X.n + 'px">' + t('Jméno', 'Name') + '</span><span style="left:' + X.p + 'px">' + t('Pozice', 'Title') + '</span><span style="left:' + X.w + 'px">' + t('Pracoviště', 'Location') + '</span>' +
          '<span style="left:' + X.z + 'px">' + t('Značky', 'Tags') + ic(P.info, 10, G, 1.1) + '</span><span style="left:' + X.r + 'px">' + t('Role týmu', 'Role') + '</span></div>';
      };
      var avw = function (k2, s, own) { return '<span class="nk-avw">' + (k2 === 'TM' ? pav('TM', s) : A.av(k2, s)) + '<i' + (own ? ' class="on"' : '') + '></i></span>'; };
      var row = function (y, k2, pos, place, role, i) {
        var foc = o.menu && i === 2;
        return '<div class="nk-tr' + (o.hv === i ? ' hv' : '') + (i === 2 && o.rowIn ? ' sr-in' : '') + '" style="top:' + (y - 19.5) + 'px"' + (i === 2 ? ' id="rowTM"' : '') + '><span style="left:' + X.n + 'px;gap:9px">' + avw(k2, 27, role === 'own') + NAMEOF(k2) + '</span>' +
          (pos ? '<span style="left:' + X.p + 'px">' + pos + '</span>' : '') + (place ? '<span style="left:' + X.w + 'px">' + place + '</span>' : '') +
          (o.hv === i ? '<span style="left:' + (X.z + 10) + 'px">' + ni('tag', 11, G, 1.1) + '</span>' : '') +
          '<span class="role' + (foc ? ' foc' : '') + '" style="left:' + X.r + 'px"' + (i === 2 ? ' id="roleTM"' : '') + '>' + (role === 'own' ? t('Vlastník', 'Owner') : t('Člen', 'Member')) + ic(P.chevd, 8, G, 1.4) + '</span>' +
          (role === 'own' ? '' : '<span style="left:' + X.x + 'px">' + ic(P.x, 10, G, 1.3) + '</span>') + '</div>';
      };
      body = '<div class="nk-add">' + ic(P.plus, 11, G, 1.3) + t('Přidat člena', 'Add member') + '</div><span class="nk-srch b" style="left:697px;width:247px;top:72px;height:28px">' + t('Hledat členy', 'Search for members') + '</span>' +
        '<div class="nk-grp" style="top:132px">' + ic(P.chevd, 9, G, 1.4) + t('Vlastníci (1)', 'Owners (1)') + '</div>' + th(169) +
        row(224, 'JN', t('Vedoucí obchodu', 'Head of sales'), 'Brno', 'own', -1) +
        '<div class="nk-grp" style="top:269px" id="grpMem">' + ic(o.open ? P.chevd : P.chevr, 9, G, 1.4) + t('Členové a hosté (3)', 'Members and guests (3)') + '</div>';
      if (o.open) {
        body += th(306) + row(362, 'PS', t('Obchodní zástupce', 'Sales representative'), '', 'mem', 0) + row(401, 'LD', '', '', 'mem', 1) + row(440, 'TM', '', '', 'mem', 2);
        if (o.menu) body += '<div class="nk-rm" style="left:' + (34 + 670) + 'px;top:' + (440 + 15) + 'px" id="roleMenu"><div class="o' + (o.hot === 0 ? ' hv' : '') + '" id="rmOwn">' + t('Vlastník', 'Owner') + '</div><div class="o' + (o.hot === 1 ? ' hv' : '') + '"><span class="k">' + ic(P.chk, 9, G, 1.4) + '</span>' + t('Člen', 'Member') + '</div></div>';
      }
    }
    return '<div class="nkz nk-mg' + (o.anim ? ' sr-in' : '') + '">' + head + body + '</div>';
  }
  function NAMEOF(k2) { return k2 === 'TM' ? NEW : A.PEOPLE[k2].name; }
  /* vykreslí kanál a nahradí obsah hlavní plochy správou týmu */
  function manageView(o) {
    A.$('app').innerHTML = channel('');
    var m = A.$('stage').querySelector('.tmain'); m.style.position = 'relative'; m.innerHTML = manage(o);
  }

  window.AKN = { NEW: NEW, PLAN_TAB: PLAN_TAB, channel: channel, over: over, showDots: showDots, teamMenu: teamMenu, addDlg: addDlg, manageView: manageView, at: at };
})();
