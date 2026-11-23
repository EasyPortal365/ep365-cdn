(function () {
  var d = document;
  function meta(n) { var m = d.querySelector('meta[name="' + n + '"]'); return m ? m.getAttribute('content') || '' : ''; }
  var stable = meta('ep365-version');
  var early = meta('ep365-early') || stable;
  var search = location.search || '';
  var auth = /[#&?]state=/.test((location.hash || '') + search);
  var want = /(^|[?&])ch=early(&|$)/.test(search);
  var ch = want ? 'early' : 'stable';
  try {
    var ls = window.localStorage;
    if (want) ls.setItem('ep365-office-ch', 'early');
    else if (auth) ch = ls.getItem('ep365-office-ch') === 'early' ? 'early' : 'stable';
    else ls.removeItem('ep365-office-ch');
  } catch (e) { /* no storage: the sign-in response is handled by the stable version */ }
  var v = ch === 'early' ? early : stable;
  d.documentElement.setAttribute('data-ep365-channel', ch);
  var s = d.createElement('script');
  s.type = 'module';
  s.src = 'app/' + v + '/app.js';
  d.body.appendChild(s);
})();
