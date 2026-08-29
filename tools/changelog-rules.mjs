// Pravidla pro CHANGELOG.json (schema 2) — JEDINY zdroj pravdy.
//
// Zije samostatne, protoze `publish-changelog.mjs` ma top-level efekty (zapisuje
// changelog.json a CHANGELOG.md) — import kvuli pravidlum by rovnou publikoval.
// Konzumenti:
//   · tools/publish-changelog.mjs — spadne na PRVNIM nalezu (publikace musi stat)
//   · tools/check-pending.mjs     — vypise VSECHNY napric flotilou (pousti /wrap-up)
// Nove pravidlo pis SEM, ne do volajiciho (§43 „dva parsery").

export const VALID_TYPES = ['new', 'improved', 'fixed'];

export function collectIssues(data, appId) {
  const out = [];
  const bad = m => out.push(m);

  if (!data || typeof data !== 'object') { bad('CHANGELOG.json neni objekt'); return out; }
  if (data.schema !== 2) bad('schema musi byt 2 (je: ' + data.schema + ') - verze zaznamu = rada MAJOR.MINOR');
  if (data.app !== appId) bad('app v JSON (' + data.app + ') nesouhlasi s repem (' + appId + ')');
  if (!data.name || typeof data.name !== 'string') bad('chybi name (zobrazovany nazev appky)');
  const entriesOk = Array.isArray(data.entries) && data.entries.length > 0;
  if (!entriesOk) bad('entries musi byt neprazdne pole');

  // pending = zmeny z TICHYCH verzi, ktere zakaznik jeste nema videt (standard 2026-08-06).
  // Na CDN se NIKDY nezapisuji - do entries je prevede az tools/promote-release.mjs.
  if (data.pending !== undefined) {
    // Objektovy tvar { since, changes: [...] } je TICHA ZTRATA: promote-release.mjs cte
    // `Array.isArray(data.pending) ? ... : []`, takze nasbirane zmeny mlcky zahodi
    // (TECH-DEBT #197, naostro v ep365-absence: 10 zmen z uvedeni appky).
    if (!Array.isArray(data.pending)) bad('pending musi byt pole (nebo chybet)');
    else for (const c of data.pending) {
      if (VALID_TYPES.indexOf(c.type) === -1) bad('pending: neplatny type "' + c.type + '" (povolene: ' + VALID_TYPES.join(', ') + ')');
      if (!c.cs || typeof c.cs !== 'string') bad('pending: change bez cs textu');
      if (c.en !== undefined && typeof c.en !== 'string') bad('pending: en musi byt string');
      if (typeof c.cs === 'string' && c.cs.indexOf('—') !== -1) bad('pending: cs text obsahuje em-dash (—) - v cestine patri en-dash (–)');
      // ASCII " v ceskem textu: patri U+201E + U+201C. Kontroluje se JEN v pending, protoze
      // uz VYDANE karty jich nesou 34 a prepis by menil text, ktery zakaznici uz videli
      // (vedome rozhodnuti, TECH-DEBT #189).
      if (typeof c.cs === 'string' && c.cs.indexOf('"') !== -1) bad('pending: cs text obsahuje ASCII uvozovku (") - v cestine patri „ “');
      if (c.since !== undefined && !/^\d+(\.\d+){1,3}$/.test(c.since)) bad('pending: since musi byt cislo tiche verze (napr. 1.9.4.5)');
    }
  }

  if (entriesOk) for (const e of data.entries) {
    if (!/^\d+\.\d+$/.test(e.version || '')) bad('neplatna verze: "' + e.version + '" (ocekavam zakaznickou RADU MAJOR.MINOR, napr. 1.8 - ne interni build X.Y.Z.W)');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(e.date || '')) bad('neplatne datum u ' + e.version + ': "' + e.date + '" (ocekavam YYYY-MM-DD)');
    if (!Array.isArray(e.changes) || e.changes.length === 0) { bad('verze ' + e.version + ' nema zadne changes'); continue; }
    for (const c of e.changes) {
      if (VALID_TYPES.indexOf(c.type) === -1) bad('verze ' + e.version + ': neplatny type "' + c.type + '" (povolene: ' + VALID_TYPES.join(', ') + ')');
      if (!c.cs || typeof c.cs !== 'string') bad('verze ' + e.version + ': change bez cs textu');
      if (c.en !== undefined && typeof c.en !== 'string') bad('verze ' + e.version + ': en musi byt string');
      // em-dash v CZ textu je proti typografickemu pravidlu EP365 (patri en-dash)
      if (typeof c.cs === 'string' && c.cs.indexOf('—') !== -1) bad('verze ' + e.version + ': cs text obsahuje em-dash (—) - v cestine patri en-dash (–)');
    }
  }
  return out;
}
