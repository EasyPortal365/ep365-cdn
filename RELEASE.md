# Údržba ep365-cdn

Tohle repo je statický web na GitHub Pages (`cdn.easyportal365.cz`) s limitem ~1 GB na **publikovaný**
obsah. Publikace jen přidává, takže se musí pravidelně prořezávat — a prořez sdíleného veřejného CDN
musí být bezpečný **z konstrukce, ne z opatrnosti**: smazaný soubor rozbije appku u zákazníka, který
na něj pořád míří, a projeví se to až ve chvíli, kdy tu funkci někdo otevře.

Postup releasu aplikace (build → publikace → ověření) žije jinde, v interní dokumentaci. Tady je jen to,
co se pouští **nad tímhle repem**.

## Prořez CDN — pořadí kroků

```
node tools/check-stable-roots.mjs                     # 1. kontrola: musi skoncit "VERDIKT: OK"
node tools/prune-bundles.mjs  --keep 10               # 2. plocho ulozene bundly <app>/*.js  (plan)
node tools/prune-bundles.mjs  --keep 10 --apply       #    provede git rm
node tools/prune-versions.mjs --keep 15               # 3. verzni slozky <app>/<verze>/      (plan)
node tools/prune-versions.mjs --keep 15 --apply       #    provede git rm
```

Pak commit a push a ověření, že Pages build doběhl (`built`).

- **Commit dělej bez `git add`** — prořezové skripty si `git rm` stagují samy. `git add -A` ve sdíleném
  repu smete pod tvůj commit i rozpracovanou práci jiné session. Před každým commitem sem si přečti
  `git status` / `git diff --cached --name-only`.
- `prune-bundles.mjs` umí `--protect a,b` pro složky s nasazením, jehož verzi neznáme. **Který seznam
  to je a proč, patří do interní evidence, ne sem** — tohle repo je veřejné.
- Obojí maže jen z pracovního stromu; soubory zůstávají v git historii
  (`git checkout <commit> -- <cesta>`), protože limit Pages měří publikovaný web, ne historii.

## `check-stable-roots.mjs` — kdy a proč

**Pouštěj: jednou měsíčně · před každým `prune-bundles.mjs --apply` · po každé změně `prune-bundles.mjs`.**
Nic nemaže a nic v tomhle repu nezapisuje; skončí `VERDIKT: OK` (exit 0), nebo `SELHALO` / `NEPRUKAZNE`
(exit 1). Při čemkoli jiném než OK **prořez nepouštěj**.

V kořeni každé appky leží dva druhy souborů: rotující bundly s content hashem a **stabilní kořen bez
hashe** (`ep-365-<app>-loader.js`, `…-shell.js`). Ten druhý je trvalý kontrakt — balíček nainstalovaný
u zákazníka ukazuje právě na něj a jeho jméno se nikdy nemění, takže se při releasu přepisuje na místě.
Prořez ale počítá stáří z commitu, který soubor **přidal**; přepis není přidání, takže stabilnímu kořenu
commit stárne a jednou vypadne z okna `--keep`. Kdyby ho prořez smazal, spadne appka všem zákazníkům
naráz — bez jediné změny na jejich straně.

Prořez proti tomu má pravidlo „kořen bez content hashe se značí vždy, nezávisle na okně". Skript
vypíše, jak daleko od okraje okna je který stabilní kořen (`pozice` a `rezerva`), a hlavně **ověří, že
to pravidlo ve skutečném `prune-bundles.mjs` pořád platí** — dvěma běhy opravdového prořezu, ne čtením
jeho zdrojáku. Řádek `MIMO OKNO` znamená, že daný loader už drží jen tohle pravidlo; není to chyba, ale
je to důvod na `prune-bundles.mjs` nesahat bez téhle kontroly.
