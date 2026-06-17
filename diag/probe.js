/*! EasyPortal 365 connectivity probe :: marker=EP365_PROBE_OK
 * Tento soubor servíruje cdn.easyportal365.cz. Když se načte a spustí,
 * znamená to, že prohlížeč na tomto počítači důvěřuje certifikátu CDN
 * a dokáže z ní stáhnout a spustit JavaScript – přesně to, co potřebují
 * aplikace EasyPortal 365.
 */
(function () {
  window.__ep365Probe = {
    ok: true,
    marker: "EP365_PROBE_OK",
    ts: (new Date()).getTime()
  };
  if (typeof window.__ep365OnProbe === "function") {
    try { window.__ep365OnProbe(window.__ep365Probe); } catch (e) {}
  }
})();
