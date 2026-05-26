# ep365-cdn

Veřejná CDN pro statické front-end assety **EP365 SPFx aplikací**, servírovaná přes
**GitHub Pages** na doméně **`cdn.easyportal365.cz`**.

## K čemu to je

SPFx webparty se standardně hostují v App Catalogu zákazníka — kam ale **guest
(externí) účty nemají přístup**, takže se jim bundle nenačte. Proto EP365 appky
hostují JS bundle **zde**: veřejně, anonymně dostupné, takže se appka načte
komukoli v jakémkoli zákaznickém tenantu, bez nutnosti zapínat Public CDN.

`.sppkg` nasazený k zákazníkovi obsahuje jen manifesty ukazující sem
(`cdnBasePath`). **Žádná zákaznická data zde nejsou** — jen zkompilovaný
front-end kód (bez secrets).

## Struktura

```
fleet/        → EP365 Vozový park  (https://cdn.easyportal365.cz/fleet/…)
documents/    → EP365 Řízené dokumenty
hub/          → EP365 Hub
ai-chat/      → EP365 AI Asistent
```

V každé složce leží **content-hashované** bundly (`*_<hash>.js`). Různé verze =
různé hashe = různé soubory.

## Pravidla

- **Staré soubory NEMAZAT.** Tenanti na starší verzi appky odkazují bundle podle
  hashe — smazáním bys jim appku rozbil.
- **Jen naprosté minimum a NIC citlivého.** Sem patří **pouze zkompilované `*.js`
  bundly** (+ `CNAME`/`README`). **Žádné source-mapy** (`*.js.map` odhalují zdroják),
  žádné zdrojáky (`.ts`), configy, `.env` ani secrets. Hlídá to allowlist
  `.gitignore` (ignoruje vše kromě povolených typů).
- Bundle je veřejně/anonymně stažitelný — je to neutajitelný front-end kód; secrets
  do něj nikdy nepatří (anonymní endpointy ano, klíče/hesla ne).
- Release postup viz `RELEASE.md` v repu příslušné appky.

## Setup (jednorázově)

- Repo **public**, GitHub Pages: Source = `main` (root).
- DNS easyportal365.cz: `CNAME  cdn → easyportal365.github.io`.
- Pages → Custom domain `cdn.easyportal365.cz`, Enforce HTTPS.
