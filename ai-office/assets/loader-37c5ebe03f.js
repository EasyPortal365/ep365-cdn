(function () {
  var d = document, w = window;
  function meta(n) { var m = d.querySelector('meta[name="' + n + '"]'); return m ? m.getAttribute('content') || '' : ''; }
  function list(n) { var a = meta(n).split(' '), r = [], i; for (i = 0; i < a.length; i++) if (a[i]) r.push(a[i].toLowerCase()); return r; }
  function has(a, x) { for (var i = 0; i < a.length; i++) if (a[i] === x) return true; return false; }
  var stable = meta('ep365-version');
  var early = meta('ep365-early') || stable;
  var search = location.search || '';
  var auth = /[#&?]state=/.test((location.hash || '') + search);
  var tenant = decodeURIComponent((/[?&]tenant=([^&#]*)/.exec(search) || [])[1] || '').toLowerCase();
  var want = /(^|[?&])ch=early(&|$)/.test(search) || (!!tenant && has(list('ep365-early-tenants'), tenant));
  var ch = want ? 'early' : 'stable';
  try {
    var ls = w.localStorage;
    if (want) ls.setItem('ep365-office-ch', 'early');
    else if (auth) ch = ls.getItem('ep365-office-ch') === 'early' ? 'early' : 'stable';
    else ls.removeItem('ep365-office-ch');
  } catch (e) { /* no storage: the sign-in response is handled by the stable version */ }
  var v = ch === 'early' ? early : stable;
  d.documentElement.setAttribute('data-ep365-channel', ch);

  var base = location.protocol + '//' + location.host + location.pathname.replace(/[^/]*$/, '');
  var mirrors = list('ep365-mirrors'), alt = '', i;
  for (i = 0; i < mirrors.length; i++) if (mirrors[i] !== base.toLowerCase()) { alt = mirrors[i]; break; }
  var over = false;
  // started = the pane really rendered something (an element in #root or the app's error bar with a class),
  // not just injected its style: when office.js crashed (classic Outlook) the style existed and onReady never came
  function started() {
    var r = d.getElementById('root'), k, j;
    if (!r) return true;
    if (r.className) return true;
    k = r.childNodes || [];
    for (j = 0; j < k.length; j++) if (k[j].nodeType === 1 && k[j].getAttribute('data-ep365-loader') !== '1') return true;
    return false;
  }
  function el(tag, text, css) { var e = d.createElement(tag); if (text) e.appendChild(d.createTextNode(text)); if (css) e.setAttribute('style', css); return e; }
  function fail(code) {
    if (over || started()) return;
    over = true;
    var root = d.getElementById('root');
    if (!root) return;
    while (root.firstChild) root.removeChild(root.firstChild);
    var box = el('div', '', 'margin:12px;padding:12px 14px;background:#fff;border:1px solid #E0E6EF;border-left:4px solid #D14343;border-radius:8px;color:#002163;font:13px/1.5 system-ui,sans-serif');
    box.setAttribute('data-ep365-loader', '1');
    box.appendChild(el('p', 'Panel se nepoda\u0159ilo na\u010d\u00edst. Zav\u0159ete aplikaci Office a otev\u0159ete ji znovu; kdy\u017e se to opakuje, po\u0161lete spr\u00e1vci tento k\u00f3d:', 'margin:0 0 6px'));
    box.appendChild(el('p', 'The panel could not be loaded. Close the Office app and open it again; if it keeps happening, send this code to your administrator:', 'margin:0 0 6px;color:#4A5874'));
    box.appendChild(el('p', 'EP365-LOAD ' + code + ' ' + v + ' ' + ch, 'margin:0 0 10px;font-family:monospace;font-size:12px'));
    var b = el('button', 'Na\u010d\u00edst znovu \u00b7 Reload', 'padding:6px 14px;border:0;border-radius:999px;background:#002163;color:#fff;font:600 12px system-ui,sans-serif;cursor:pointer');
    b.type = 'button';
    b.addEventListener('click', function () { location.reload(); });
    box.appendChild(b);
    root.appendChild(box);
    d.documentElement.setAttribute('data-ep365-load', code);
  }
  function load(src, onError) {
    var s = d.createElement('script');
    s.type = 'module';
    s.src = src;
    s.onerror = onError;
    d.body.appendChild(s);
  }
  // office.js crashed (e.g. MicrosoftAjax.js blocked in Outlook) = Office.onReady never comes: show the notice now
  if (w.addEventListener) w.addEventListener('error', function (e) {
    var f = (e && e.filename) || '', m = String((e && e.message) || '');
    // a cross-origin script error (office.js has no crossorigin) arrives censored as "Script error." without a file
    if (f.indexOf('appsforoffice.microsoft.com') >= 0 || m.indexOf('MicrosoftAjax') >= 0 || (!f && m.indexOf('Script error') === 0)) fail('office-js');
  });
  if (!('noModule' in d.createElement('script'))) { fail('no-modules'); return; }
  load('app/' + v + '/app.js', function () {
    d.documentElement.setAttribute('data-ep365-retry', alt || 'same');
    load((alt || '') + 'app/' + v + '/app.js?r=' + new Date().getTime(), function () { fail('module-error'); });
  });
  if (!auth) w.setTimeout(function () { fail('timeout'); }, 10000);
})();
