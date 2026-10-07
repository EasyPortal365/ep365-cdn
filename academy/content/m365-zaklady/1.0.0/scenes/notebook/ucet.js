/* Akademie – scénář „Ztratil jsem notebook“: sdílené stavební kusy scén stránky Můj účet (myaccount.microsoft.com).
   Předlohy: _ref/notebook/d01 (Domů), d02 (Zařízení), d03 (dialog Zakázat …?). Osoba, zařízení a ID jsou fiktivní (Javor nábytek);
   ilustrace jsou zjednodušené (bez obrázků Microsoftu). Souřadnice = px snímku. */
(function () {
  var A = AK, t = A.t, ic = A.ic, P = A.P, G = '#424242';
  var DEV = 'NB-JAVOR-014';
  var I = {
    home: '<path d="M2.5 7.5L8 3l5.5 4.5V13h-4V9.8h-3V13h-4z" fill="currentColor"/>',
    user: '<circle cx="8" cy="5.5" r="2.4"/><path d="M3.5 13.5c0-2.5 2-4 4.5-4s4.5 1.5 4.5 4"/>',
    apps: '<rect x="2.5" y="2.5" width="4.5" height="4.5" rx="1"/><rect x="9" y="2.5" width="4.5" height="4.5" rx="1"/><rect x="2.5" y="9" width="4.5" height="4.5" rx="1"/><path d="M9 9h4.5v4.5H9z"/>',
    grp: '<circle cx="6" cy="5.2" r="2.3"/><path d="M1.8 13.5c0-2.4 1.9-4.1 4.2-4.1s4.2 1.7 4.2 4.1"/><circle cx="11.6" cy="5.8" r="1.8"/><path d="M11.4 9.4c1.9 0 3.3 1.4 3.3 3.5"/>',
    agent: '<circle cx="8" cy="8" r="5.5"/><path d="M9.5 3c-1 2-1 4 0 5s1 3 0 5"/>',
    guest: '<rect x="3.5" y="2" width="9" height="12" rx="1.5"/><circle cx="8" cy="7" r="1.6"/><path d="M5.8 11c.4-1 1.2-1.5 2.2-1.5s1.8.5 2.2 1.5"/>',
    fb: '<circle cx="6" cy="5.5" r="2.3"/><path d="M2 13c0-2.3 1.8-4 4-4"/><path d="M8.5 8.5h6v4.5h-2l-2 1.5V13h-2z"/>',
    mon: '<rect x="2" y="3" width="12" height="8" rx="1"/><path d="M6 13.5h4M8 11v2.5"/>',
    copy: '<rect x="5" y="5" width="8.5" height="8.5" rx="1.5"/><path d="M3 10.5V3.5A1 1 0 014 2.5h7"/>',
    chu: '<path d="M4 10l4-4 4 4"/>'
  };
  for (var k in I) P['ma_' + k] = I[k];
  function mi(n, s, c, w) { return ic(P['ma_' + n] || P[n], s || 10, c || G, w || 1.1); }
  function av(s) { return '<span class="ol-av" style="width:' + s + 'px;height:' + s + 'px;font-size:' + Math.round(s * 0.38) + 'px;background:#E6E0F6;color:#4E3A8C;display:inline-grid;place-items:center;border-radius:50%;font-weight:600">JN</span>'; }

  function nav(active) {
    var ni = function (y, icon, n, cls, cv, id) { return '<div class="ma-ni' + (cls ? ' ' + cls : '') + '" style="top:' + y + 'px"' + (id ? ' id="' + id + '"' : '') + '>' + (icon ? mi(icon, 10, cls && cls.indexOf('on') >= 0 ? '#345EA8' : G) : '') + n + (cv ? '<span class="cv">' + ic(cv === 'u' ? P.ma_chu : P.chevd, 8, G, 1.3) + '</span>' : '') + '</div>'; };
    var sub = function (y, n, id) { return ni(y, '', n, 'sub' + (active === id ? ' on' : ''), 0, id); };
    return '<div class="ma-nav"><span class="ham">' + ic(P.lines, 10, G, 1.3) + '</span>' +
      '<div class="ma-me">' + av(20) + '<span>Jana Nováková<small>jana.novakova@javornab…</small></span></div>' +
      ni(100, 'home', t('Domů', 'Home'), active === 'home' ? 'on' : '') + ni(124, 'user', t('Můj účet', 'My account'), '', 'u') +
      sub(148, t('Osobní údaje', 'Personal info')) + sub(172, t('Bezpečnostní údaje', 'Security info')) + sub(196, t('Zařízení', 'Devices'), 'dev') + sub(221, t('Změnit heslo', 'Change password'), 'pwd') +
      sub(245, t('Organizace', 'Organizations')) + '<div class="ma-ni sub" style="top:269px;height:26px;white-space:normal;line-height:12px;padding-right:20px">' + t('Data a ochrana osobních údajů', 'Settings & Privacy') + '</div>' + sub(305, t('Nedávná aktivita', 'Recent activity')) +
      ni(329, 'apps', t('Moje aplikace', 'My apps')) + ni(353, 'grp', t('Moje skupiny', 'My groups'), '', 'd') + ni(378, 'agent', t('Správa agentů', 'Agent management')) + ni(402, 'guest', t('Sponzorovaní hosté (Preview)', 'Sponsored guests (Preview)')) +
      '<div class="ma-sep" style="top:424px"></div>' + ni(431, 'fb', t('Poslat zpětnou vazbu', 'Give feedback')) + '</div>';
  }
  function top() {
    return '<div class="ma-top"><span class="i" style="left:9px">' + ic(P.launcher, 10, G) + '</span><span class="i" style="right:83px">' + mi('fb', 10) + '</span><span class="i" style="right:55px">' + mi('grp', 10) + '</span>' +
      '<span class="i" style="right:31px;font-size:9px;color:' + G + '">?</span><span class="i" style="right:6px;top:4px">' + av(19) + '</span></div>';
  }
  /* zjednodušené ilustrace karet (místo obrázků Microsoftu) */
  function illo(kind) {
    if (kind === 'dev') return '<div style="position:relative;width:70px;height:46px;margin:0 auto"><i style="position:absolute;left:4px;top:6px;width:44px;height:30px;border-radius:3px;background:linear-gradient(135deg,#C9B8F2,#7B6BE0)"></i><i style="position:absolute;left:0;top:36px;width:52px;height:4px;border-radius:2px;background:#C8C8C8"></i><i style="position:absolute;left:44px;top:12px;width:22px;height:30px;border-radius:3px;background:linear-gradient(135deg,#F2D5B8,#E08A5B)"></i></div>';
    if (kind === 'key') return '<div style="position:relative;width:60px;height:50px;margin:0 auto">' + [0, 1, 2, 3].map(function (r) { return [0, 1, 2].map(function (c) { return '<i style="position:absolute;left:' + (12 + c * 14) + 'px;top:' + (2 + r * 12) + 'px;width:8px;height:8px;border-radius:50%;background:' + ['#E8A33D', '#7FB2E5', '#9B8CF0'][(r + c) % 3] + '"></i>'; }).join(''); }).join('') + '</div>';
    if (kind === 'grp') return '<div style="position:relative;width:60px;height:50px;margin:0 auto"><i style="position:absolute;left:16px;top:8px;width:28px;height:38px;border-radius:12px 12px 6px 6px;background:linear-gradient(135deg,#C9B8F2,#7B6BE0)"></i><i style="position:absolute;left:2px;top:14px;width:18px;height:26px;border-radius:9px 9px 4px 4px;background:#F2B8C6"></i><i style="position:absolute;left:40px;top:14px;width:18px;height:26px;border-radius:9px 9px 4px 4px;background:#F2D98B"></i></div>';
    return '<div style="position:relative;width:60px;height:50px;margin:0 auto"><i style="position:absolute;left:10px;top:12px;width:36px;height:30px;border-radius:3px;background:#E6E6E6"></i><i style="position:absolute;left:26px;top:4px;width:28px;height:22px;border-radius:12px;background:#D6E6F5"></i><i style="position:absolute;left:18px;top:28px;width:22px;height:6px;border-radius:3px;background:linear-gradient(90deg,#7FB2E5,#9B8CF0,#E8A33D)"></i></div>';
  }
  function home(o) {
    o = o || {};
    var card = function (x, y, w, h, html, id) { return '<div class="ma-card' + (o.hv === id ? ' hv' : '') + '" style="left:' + x + 'px;top:' + y + 'px;width:' + w + 'px;height:' + h + 'px"' + (id ? ' id="' + id + '"' : '') + '>' + html + '</div>'; };
    var big = function (x, kind, title, text, id) { return card(x, 309, 179, 159, '<div style="padding-top:22px">' + illo(kind) + '</div><div style="position:absolute;left:7px;right:8px;top:93px"><b>' + title + '</b><p>' + text + '</p></div>', id); };
    var mon = function (x, title) { return card(x, 202, 180, 58, '<div style="position:absolute;left:8px;top:8px;display:flex;gap:6px"><span style="width:10px;height:10px;border-radius:50%;background:linear-gradient(135deg,#C9B8F2,#7B6BE0);margin-top:2px;flex-shrink:0"></span><span><b style="line-height:12px">' + title + '</b><span class="ma-pill">' + t('Nevyžaduje se žádná akce.', 'No action needed.') + '</span></span></div>'); };
    return '<div class="ma-h1" style="left:6px">' + t('Vítejte zpět, Jana Nováková', 'Welcome back, Jana Nováková') + '</div>' +
      '<div style="position:absolute;left:12px;top:79px">' + av(58) + '</div>' +
      '<div style="position:absolute;left:95px;top:76px;font-size:7.4px;line-height:15px"><b style="font-weight:600;font-size:8.3px">Jana Nováková</b><br>' + t('Vedoucí obchodu', 'Head of sales') + '<br>jana.novakova@javornabytek.cz<br><span style="color:#345EA8">' + t('Proč to nemůžu upravit?', 'Why can’t I edit?') + ' ▾</span></div>' +
      '<div class="ma-h2" style="top:180px">' + t('Sledovat', 'Monitor') + '</div>' + mon(6, t('Kontrola skupin, jejichž platnost brzy vyprší', 'Review groups that expire soon')) + mon(194, t('Zkontrolovat skupinové žádosti', 'Review group requests')) +
      '<div class="ma-h2" style="top:286px">' + t('Spravovat přístup a zabezpečení', 'Manage access and security') + '</div>' +
      big(6, 'dev', t('Zobrazit zařízení', 'View devices'), t('Mějte kontrolu nad svými zařízeními a získejte pomoc, pokud ztratíte přístup.', 'Stay in control of your devices and get help if you lose access.'), 'cDev') +
      big(194, 'key', t('Změna způsobu přihlášení', 'Change how you sign in'), t('Aktualizujte si heslo, nastavte bezheslové možnosti nebo spravujte dvoustupňové ověřování.', 'Update your password, set up passwordless options, or manage two-step verification.')) +
      '<div class="ma-h2" style="top:492px">' + t('Objevte více', 'Discover more') + '</div>' + card(6, 517, 179, 159, '<div style="padding-top:20px">' + illo('grp') + '</div>') + card(194, 517, 179, 159, '<div style="padding-top:20px">' + illo('app') + '</div>');
  }
  function devices(o) {
    o = o || {};
    var row = function (y, k2, v, id, info) { return '<div class="ma-dr' + (o.hv === id ? ' hv' : '') + '" style="top:' + y + 'px"' + (id ? ' id="' + id + '"' : '') + '><span class="k">' + k2 + (info ? ic(P.info, 8, G, 1.1) : '') + '</span><span class="v">' + v + '</span></div>'; };
    var laptop = '<div style="position:absolute;left:254px;top:71px;width:102px;height:74px"><i style="position:absolute;left:12px;top:0;width:78px;height:60px;border-radius:3px;background:#3A3A3A"></i><i style="position:absolute;left:15px;top:3px;width:72px;height:54px;background:linear-gradient(135deg,#5FD5E6,#2F7FC4)"></i><i style="position:absolute;left:0;top:60px;width:102px;height:9px;border-radius:0 0 6px 6px;background:linear-gradient(#E6E6E6,#BDBDBD)"></i></div>';
    return '<div class="ma-h1">' + t('Zařízení', 'Devices') + '</div>' +
      '<div style="position:absolute;left:0;top:48px;font-size:7.4px;white-space:nowrap">' + t('Pokud ztratíte nějaké zařízení nebo ho už nepoužíváte, zakažte ho, aby k němu nemohl získat přístup nikdo jiný. Pokud chcete zařízení po jeho zakázání znovu povolit, obraťte se na IT podporu.',
        'If you lose a device or no longer use it, disable it so no one else can access it. To enable the device again after disabling it, contact your IT support.') + '</div>' +
      '<div class="ma-dev"><div class="ma-dh" id="devHead">' + mi('mon', 10) + DEV + '<span class="cv">' + ic(P.ma_chu, 8, G, 1.3) + '</span></div>' + laptop +
      '<div style="position:absolute;left:409px;top:82px;font-size:17px;font-weight:600" id="devName">' + DEV + '</div><div style="position:absolute;left:458px;top:111px;font-size:7.2px">Windows</div>' +
      row(162, t('Klíče nástroje BitLocker', 'BitLocker keys'), t('Toto zařízení nemá klíče nástroje BitLocker zálohované v Entra ID.', 'This device has no BitLocker keys backed up in Entra ID.'), 'rBit', 1) +
      row(193, t('Stav organizace', 'Organization state'), t('Aktivní', 'Active'), 'rState') +
      row(224, t('ID objektu zařízení', 'Device object ID'), 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx' + mi('copy', 9), 'rId', 1) +
      '<div class="ma-dr" style="top:255px;font-size:7.3px">' + t('Ztratili jste toto zařízení nebo jste ho přestali používat?', 'Lost this device or stopped using it?') + '<span class="ma-lnk" id="lnkDisable">' + t('Zakázání zařízení', 'Disable device') + '</span></div></div>';
  }
  function dialog(anim) {
    return '<div class="ma-dim on"></div><div class="ma-dlg' + (anim ? ' in' : '') + '"><h3>' + t('Zakázat ' + DEV + '?', 'Disable ' + DEV + '?') + '</h3>' +
      '<p>' + t('Zakázáním vypnete přístup zařízení ke všem účtům vaší organizace. Jakmile zařízení zakážete, nedá se to vrátit zpět. Pokud chcete znovu získat přístup k prostředkům vaší organizace na tomto zařízení, bude nutné kontaktovat IT podporu.',
        'Disabling turns off the device’s access to all accounts in your organization. Once you disable the device, it can’t be undone. To regain access to your organization’s resources on this device, you’ll need to contact IT support.') + '</p>' +
      '<span class="ma-btn pri" style="left:226px" id="bDisable">' + t('Zakázat', 'Disable') + '</span><span class="ma-btn" style="left:289px">' + t('Zrušit', 'Cancel') + '</span></div>';
  }
  /* o: {view: 'home'|'dev', hv, dlg, anim} */
  function page(o) {
    o = o || {};
    var dev = o.view === 'dev';
    return '<div class="ma" id="ma">' + top() + nav('home') /* d02, d03: aktivní zůstává Domů */ + '<div class="ma-col' + (o.anim && !o.dlg ? ' sr-in' : '') + '">' + (dev ? devices(o) : home(o)) + '</div>' + (o.dlg ? dialog(o.anim) : '') + '</div>';
  }
  function show(o) { A.$('app').innerHTML = page(o); }
  window.AKU = { page: page, show: show };
})();
