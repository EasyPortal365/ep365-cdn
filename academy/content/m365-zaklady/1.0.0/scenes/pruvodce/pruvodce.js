/* Akademie – společné kusy ilustrací úvodních průvodců (vlastní grafika, ne replika UI). */
(function () {
  var A = AK, ic = A.ic;
  /* stejné glyphy jako v rozcestníku (data/katalog.js): písmeno nebo piktogram v barvě aplikace */
  var GL = {
    teams: ['#5B5FC7', 'T'], sp: ['#03787C', 'S'], outlook: ['#0F6CBD', 'O'], planner: ['#31752F', 'P'], word: ['#185ABD', 'W'],
    od: ['#0364B8', '', '<path d="M4.5 12.5a3 3 0 01-.4-6 4 4 0 017.7 1 2.5 2.5 0 01.2 5z"/>'],
    todo: ['#2564CF', '', '<path d="M3.5 8.5l3 3 6-7"/>'], loop: ['#7B4FD6', 'L'], onenote: ['#7719AA', 'N']
  };
  function glyph(id, s) {
    var g = GL[id], sz = s || 34;
    return '<span class="gu-g" style="width:' + sz + 'px;height:' + sz + 'px;font-size:' + Math.round(sz * 0.52) + 'px;background:' + g[0] + '">' + (g[2] ? ic(g[2], Math.round(sz * 0.6), '#fff', 1.8) : g[1]) + '</span>';
  }
  function file(app) { return '<span class="gu-fi"><i style="top:8px"></i><i style="top:14px"></i><i style="top:20px;right:11px"></i><span>' + glyph(app, 18) + '</span></span>'; }
  function av(k) { var p = A.PEOPLE[k]; return '<span class="gu-av" style="background:' + p.c + '">' + k + '</span>'; }
  /* postupné „spadnutí“ prvku na místo + krátké rozsvícení cílové oblasti */
  async function drop(api, id, target) {
    A.$(id).classList.add('in');
    await api.sleep(650);
    if (target) { var t = A.$(target); t.classList.remove('hit'); void t.offsetWidth; t.classList.add('hit'); }
  }
  window.AKG = { glyph: glyph, file: file, av: av, drop: drop };
})();
