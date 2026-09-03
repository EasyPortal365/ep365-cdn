# Písma hostovaná na cdn.easyportal365.cz/fonts/

Všechna čtyři písma jsou pod **SIL Open Font License 1.1**, která hostování,
redistribuci i vestavění do dokumentů výslovně dovoluje. Plné znění licence:
<https://openfontlicense.org/open-font-license-official-text/>

| Písmo | Autoři | Zdroj |
|---|---|---|
| Manrope | Mikhail Sharanda, Mirko Velimirović | <https://fonts.google.com/specimen/Manrope> |
| Plus Jakarta Sans | Tokotype | <https://fonts.google.com/specimen/Plus+Jakarta+Sans> |
| JetBrains Mono | JetBrains s.r.o. | <https://fonts.google.com/specimen/JetBrains+Mono> |
| Fraunces | Undercase Type (Phaedra Charles, Flavia Zimbardi) | <https://fonts.google.com/specimen/Fraunces> |

## Proč jsou tady

Do září 2026 si je prohlížeč každého uživatele načítal přímo z `fonts.googleapis.com`,
takže Googlu odcházela jeho IP adresa a identifikace prohlížeče. U zákazníků v EU je to
opakovaná otázka při posuzování ochrany osobních údajů. Načítáním z naší domény, kterou
zákazník stejně musí mít povolenou (jde z ní kód aplikace), odchozí spojení mimo
Microsoft a EasyPortal 365 mizí.

## Co je ve složce

Variabilní řezy, subsety `latin` a `latin-ext` (latin-ext nese českou diakritiku).
Prohlížeč si podle `unicode-range` stáhne jen ten subset, který stránka potřebuje.

- **Manrope** a **Plus Jakarta Sans** — přímý řez, Plus Jakarta Sans i kurzíva
- **JetBrains Mono** — jen přímý řez
- **Fraunces** — jen kurzíva

Chybějící řez není chyba, ale úspora: flotila je takhle používá. Když bude potřeba další,
doplní se do `tools/fetch-fonts.mjs` a soubory se přegenerují; do té doby prohlížeč
použije systémové písmo z náhradního řetězce.

## Aktualizace

```
node tools/fetch-fonts.mjs fonts
```

Skript stáhne aktuální verze z Google Fonts a přepíše `ep365-fonts.css`. Ten se needituje
ručně — jinak se rozejde se soubory, které vedle něj leží.
