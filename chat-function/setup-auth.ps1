<#
.SYNOPSIS
    Zapne overovani identity volajiciho pro EP365 AI Asistenta - app registraci
    "EP365 AI Function" v Entra ID a dve app settings na Function App.

.DESCRIPTION
    Do teto zmeny byly HTTP endpointy funkce anonymni a chranila je jen serverova
    kontrola originu. Hlavicku Origin si ale mimo prohlizec kdokoli nastavi libovolne,
    takze kdo znal adresu funkce (je v nastaveni aplikace, ktere ctou vsichni na webu),
    obesel denni limit dotazu i mesicni rozpocet - ty se pocitaji na klientovi.

    Skript zalozi API registraci, pro kterou si SharePoint vyzada pristupovy token,
    a rekne funkci, ktere tokeny ma prijimat. NEMENI zadnou konfiguraci Function App
    krome dvou app settings a nezaklada zadny novy Azure resource.

    Kroky:
      1. Overeni Azure CLI (az login) a existence Function App.
      2. App registrace "EP365 AI Function" - najde podle nazvu, jinak vytvori.
      3. App ID URI api://<tenantId>/ep365-ai-function.
         POZOR: tenhle tvar neni kosmetika. Aplikace si ho v prohlizeci SKLADA z tenant
         ID, ktere zna z kontextu stranky - proto neni potreba zadne dalsi pole
         v Nastaveni ani sloupec v seznamu a .sppkg muze byt pro vsechny zakazniky
         stejny. Kdyz ho zmenite, klient prestane token ziskavat.
      4. Delegovany scope user_impersonation (aby bylo co schvalit v API access).
      5. Preautorizace principalu SharePoint Online Client Extensibility - bez ni
         SharePoint token nevyda ani po schvaleni.
      6. Service principal registrace (jinak neni v SharePoint admin centru videt).
      7. App settings Function App: EP365_AUTH_AUDIENCE, EP365_AUTH_TENANT_ID
         (a volitelne EP365_AUTH_MODE).
      8. Souhrn s dalsim krokem pro SharePoint administratora.

    Doplnek Office (EP365 AI Asistent pro Office) - pripravi se rovnou, vypne -SkipOfficeAddin:
      - presmerovani SPA panelu doplnku (Office na webu i na pocitaci),
      - predautorizace registrace same pro user_impersonation (bez ni Office na
        pocitaci token pro funkci AI nevyda),
      - delegovane opravneni SharePoint AllSites.Read (nastaveni AI Asistenta
        a klasifikace "mimo AI" otevreneho dokumentu).
    Opravneni plati az po souhlasu spravce (odkaz ve vypisu). Manifest doplnku stahne
    spravce v AI Asistentovi: Nastaveni > Doplnek Office.

    Skript je idempotentni - existujici registraci, scope i preautorizaci jen doplni.

    Prerekvizity:
      - PowerShell 5.1+ (Windows) nebo PowerShell 7 (Azure Cloud Shell).
      - Azure CLI (az) + az login uctem, ktery smi zakladat app registrace
        (Application Administrator nebo vyssi) a zapisovat App Settings Function App.

.PARAMETER ResourceGroup
    Resource group Function App.

.PARAMETER FunctionAppName
    Nazev Function App AI Asistenta.

.PARAMETER Mode
    Rezim brany: optional (vychozi) overi token, kdyz prijde; required bez tokenu
    odmita; off vypina. Zacnete VZDY na optional - viz poznamka na konci skriptu.

.PARAMETER EnforceClients
    Vynutit seznam povolenych klientu (claim azp): token pro funkci prijme jen od
    SharePoint Framework principalu a od registrace funkce same (doplnek EP365 AI
    Asistent pro Office). Bez prepinace se klient jen zapisuje do souhrnu v logu.

.PARAMETER SubscriptionId
    Volitelne prepnuti subscription pred praci.

.PARAMETER SkipOfficeAddin
    Registraci nepripravovat pro doplnek Office (presmerovani panelu, predautorizace
    sama sebe, SharePoint AllSites.Read). Uz nastavene se neodebira.

.PARAMETER WhatIf
    Jen vypise, co by se zmenilo (radky ZMENA), nic nemeni.

.EXAMPLE
    .\setup-auth.ps1 -ResourceGroup rg-firma-ai -FunctionAppName func-firma-ai

.EXAMPLE
    .\setup-auth.ps1 -ResourceGroup rg-firma-ai -FunctionAppName func-firma-ai -Mode required

.EXAMPLE
    .\setup-auth.ps1 -ResourceGroup rg-firma-ai -FunctionAppName func-firma-ai -WhatIf
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)] [string] $ResourceGroup,
    [Parameter(Mandatory = $true)] [string] $FunctionAppName,
    [ValidateSet('optional', 'required', 'off')] [string] $Mode = 'optional',
    [switch] $EnforceClients,
    [string] $SubscriptionId,
    [switch] $SkipOfficeAddin,
    [switch] $WhatIf
)

$ErrorActionPreference = 'Stop'

# Nazev a suffix MUSI sedet s klientem (services/functionAuth.ts) - kdyz je zmenite,
# aplikace si slozi jiny identifikator a token nedostane.
$APP_NAME        = 'EP365 AI Function'
$RESOURCE_SUFFIX = 'ep365-ai-function'
# Globalni ID principalu, pod kterym SharePoint Framework zada o tokeny. Stejne
# ve vsech tenantech (SharePoint Online Client Extensibility Web Application Principal).
$SPFX_PRINCIPAL  = '08e18876-6177-487e-b8b5-cf950c1e598c'
# Doplnek Office: panel na vyhrazene adrese ai-office.easyportal365.cz (jen doplnek, ne sdilene CDN).
# MUSI sedet s ep365-ai-office (manifest, scripts/setup-office-addin.ps1) a s vychozim puvodem panelu
# ve funkci (corsHeaders.ts).
$PANE_REDIRECTS  = @('brk-multihub://ai-office.easyportal365.cz', 'https://ai-office.easyportal365.cz/taskpane.html')
$SHAREPOINT_ID   = '00000003-0000-0ff1-ce00-000000000000'   # Office 365 SharePoint Online (stejne ve vsech tenantech)
$SP_SCOPE        = 'AllSites.Read'

function Write-Step($n, $text) { Write-Host "`n[$n] $text" -ForegroundColor Cyan }
function Write-Ok($text)       { Write-Host "    OK  $text" -ForegroundColor Green }
function Write-Info($text)     { Write-Host "    ... $text" -ForegroundColor DarkGray }
function Write-Plan($text)     { Write-Host "    ZMENA  $text" -ForegroundColor Yellow }
if ($WhatIf) { Write-Host "`n-WhatIf: jen vypisu, co by se zmenilo (ZMENA). Nic se nemeni." -ForegroundColor Yellow }

# ---------------------------------------------------------------- 1. Azure CLI
Write-Step 1 'Overuji Azure CLI a Function App'

try { $null = az version 2>$null } catch { throw 'Azure CLI (az) neni dostupne. Spustte skript v Azure Cloud Shellu, nebo nainstalujte Azure CLI.' }

$account = az account show 2>$null | ConvertFrom-Json
if (-not $account) { throw 'Nejste prihlaseni. Spustte "az login".' }

if ($SubscriptionId) {
    az account set --subscription $SubscriptionId | Out-Null
    $account = az account show | ConvertFrom-Json
}

$tenantId = $account.tenantId
Write-Ok "Subscription: $($account.name)"
Write-Ok "Tenant ID:    $tenantId"

$fn = az functionapp show --name $FunctionAppName --resource-group $ResourceGroup 2>$null | ConvertFrom-Json
if (-not $fn) {
    # Samotne "nenalezena" nepomuze tomu, kdo jmeno nezna - a to je bezny pripad, protoze
    # backend u zakaznika casto nasazoval nekdo jiny. Vypiseme, co v subscription je.
    Write-Host ''
    Write-Host ("Function App '" + $FunctionAppName + "' v resource group '" + $ResourceGroup + "' nenalezena (nebo na ni nemate prava).") -ForegroundColor Red

    # Projekce jako POLE, ne objekt: u -o tsv se klice objektu radi abecedne, takze
    # {Funkce:name, ResourceGroup:resourceGroup} by sloupce prohodilo.
    $list = az functionapp list --query "[].[name, resourceGroup, location]" -o tsv 2>$null
    if ($LASTEXITCODE -eq 0 -and $list) {
        Write-Host ''
        Write-Host 'Function Apps viditelne v teto subscription:' -ForegroundColor Yellow
        foreach ($radek in @($list)) {
            $c = $radek -split "`t"
            if ($c.Count -ge 2) {
                Write-Host ('   -FunctionAppName ' + $c[0] + '  -ResourceGroup ' + $c[1] + $(if ($c.Count -ge 3) { '   (' + $c[2] + ')' } else { '' }))
            }
        }
        Write-Host ''
        Write-Host 'Ktera z nich obsluhuje EP365 AI Asistenta poznate podle nastaveni ALLOWED_ORIGIN (je v nem vas SharePoint):'
        Write-Host '   az functionapp config appsettings list --name <funkce> --resource-group <rg> --query "[?name==''ALLOWED_ORIGIN''].value" -o tsv'
    }
    else {
        Write-Host 'Seznam Function Apps se nepodarilo nacist. Overte, ze jste ve spravne subscription:' -ForegroundColor Yellow
        Write-Host '   az account list --query "[].[name, id, isDefault]" -o tsv        (vypis dostupnych subscription)'
        Write-Host '   az account set --subscription "<jmeno nebo id>"                 (prepnuti)'
    }
    throw 'Function App nenalezena (moznosti viz vyse).'
}
Write-Ok "Function App: $($fn.defaultHostName)"

# ------------------------------------------------------------ 2. App registrace
Write-Step 2 "App registrace '$APP_NAME'"

$appIdUri = "api://$tenantId/$RESOURCE_SUFFIX"
$existing = az ad app list --display-name $APP_NAME --query "[?displayName=='$APP_NAME']" 2>$null | ConvertFrom-Json

if ($existing -and $existing.Count -gt 0) {
    $app = $existing[0]
    Write-Ok "Uz existuje (appId $($app.appId)) - jen doplnim, co chybi."
} elseif ($WhatIf) {
    Write-Plan "zalozit registraci '$APP_NAME' (jen tento tenant), App ID URI $appIdUri, scope user_impersonation,"
    Write-Plan 'predautorizace SharePoint Framework principalu, service principal, app settings funkce'
    if (-not $SkipOfficeAddin) { Write-Plan "doplnek Office: presmerovani $($PANE_REDIRECTS -join ', '), predautorizace sama sebe, SharePoint $SP_SCOPE" }
    Write-Host "`n-WhatIf: nic se nezmenilo. Registrace neexistuje, dalsi kroky zavisi na jejim zalozeni." -ForegroundColor Yellow
    return
} else {
    Write-Info 'Zakladam novou registraci...'
    $app = az ad app create --display-name $APP_NAME --sign-in-audience AzureADMyOrg | ConvertFrom-Json
    Write-Ok "Vytvorena (appId $($app.appId))"
    # Nova registrace nekdy neni hned viditelna pro navazujici volani.
    Start-Sleep -Seconds 5
}

$appObjectId = $app.id
$appClientId = $app.appId

# ------------------------------------------------------------- 3. API a scope
Write-Step 3 'App ID URI a delegovany scope'

# Scope musi mit stabilni id - pri opakovanem spusteni se prebira to existujici,
# jinak by se pri kazdem behu menilo a schvalene opravneni by prestalo sedet.
$current = az rest --method GET --uri "https://graph.microsoft.com/v1.0/applications/$appObjectId" | ConvertFrom-Json
$existingScope = $null
if ($current.api -and $current.api.oauth2PermissionScopes) {
    $existingScope = $current.api.oauth2PermissionScopes | Where-Object { $_.value -eq 'user_impersonation' } | Select-Object -First 1
}
$scopeId = if ($existingScope) { $existingScope.id } else { [guid]::NewGuid().ToString() }

$scope = @{
    id                      = $scopeId
    value                   = 'user_impersonation'
    type                    = 'User'
    isEnabled               = $true
    adminConsentDisplayName = 'Pristup k AI Asistentovi jmenem uzivatele'
    adminConsentDescription = 'Umozni aplikaci EP365 AI Asistent volat AI sluzbu jmenem prihlaseneho uzivatele.'
    userConsentDisplayName  = 'Pristup k AI Asistentovi'
    userConsentDescription  = 'Umozni AI Asistentovi pracovat vasim jmenem.'
}

# Preautorizace SPFx principalu: bez ni SharePoint token nevyda ani po schvaleni
# v API access (a chyba, kterou uzivatel uvidi, o duvodu nerika nic).
#
# POZOR: MUSI TO BYT DVA PATCHE, ne jeden (overeno zive 2026-09-03, jednim PATCHem
# vraci Graph HTTP 400 "Property api.preAuthorizedApplications.delegatedPermissionIds
# has a Permission Id that cannot be found in the AppPermissions sets"). Graph
# validuje preautorizaci proti scope, ktere UZ NA OBJEKTU JSOU - scope zalozeny
# v temze telu jeste neexistuje. Poradi je proto: nejdriv scope, pak odkaz na nej.

# Pomocna funkce: telo do docasneho souboru a PATCH pres az rest.
# Absolutni cesta zamerne: "cd" v PowerShellu nemeni pracovni adresar .NET, takze
# [System.IO.File] s relativni cestou zapisuje uplne jinam (lekce 25.19).
function Invoke-GraphPatch([string]$uri, [hashtable]$payload) {
    $json = $payload | ConvertTo-Json -Depth 10 -Compress
    $tmp = [System.IO.Path]::Combine([System.IO.Path]::GetTempPath(), "ep365-auth-$([guid]::NewGuid()).json")
    [System.IO.File]::WriteAllText($tmp, $json, (New-Object System.Text.UTF8Encoding($false)))
    try {
        az rest --method PATCH --uri $uri --headers 'Content-Type=application/json' --body "@$tmp" | Out-Null
        if ($LASTEXITCODE -ne 0) { throw "Graph PATCH selhal (az rest exit $LASTEXITCODE): $uri" }
    } finally {
        Remove-Item $tmp -ErrorAction SilentlyContinue
    }
}

# Predautorizace se SLUCUJI se stavajicimi, nikdy neprepisuji: registraci muze krome SPFx
# predautorizovat i doplnek Office (setup-office-addin.ps1, krok 2b) a dalsi klienti. Drive
# tenhle skript seznam nastavil jen na SPFx -> opakovany beh (prepnuti na -Mode required,
# -EnforceClients) smazal predautorizaci doplnku a Office na pocitaci prestal dostavat token
# (401, lekce 119.6). Ponecha se jen id scopu, ktere na registraci existuji (jinak Graph 400).
function Merge-PreAuthorized {
    param($existing, [string]$appId, [string]$scopeId, [string[]]$knownScopeIds)
    $known = @(@($knownScopeIds) + $scopeId | Where-Object { $_ } | Select-Object -Unique)
    $result = @()
    $found = $false
    foreach ($p in @($existing)) {
        if (-not $p -or -not $p.appId) { continue }
        $ids = @(@($p.delegatedPermissionIds) | Where-Object { $known -contains $_ })
        if ($p.appId -eq $appId) {
            $found = $true
            $ids = @(@($ids) + $scopeId | Select-Object -Unique)
        }
        if ($ids.Count -gt 0) { $result += @{ appId = [string]$p.appId; delegatedPermissionIds = $ids } }
    }
    if (-not $found) { $result += @{ appId = $appId; delegatedPermissionIds = @($scopeId) } }
    return ,$result
}

# Sjednoceni seznamu adres (presmerovani SPA): stavajici zustanou, chybejici se pridaji.
function Merge-UriList {
    param($existing, [string[]]$add)
    $result = @(@($existing) | Where-Object { $_ })
    foreach ($u in @($add)) { if ($result -notcontains $u) { $result += $u } }
    return ,$result
}

# Delegovane opravneni do requiredResourceAccess: stavajici zaznamy zustanou, chybejici se prida.
function Merge-RequiredScope {
    param($existing, [string]$resourceAppId, [string]$scopeId)
    $result = @()
    $found = $false
    foreach ($r in @($existing)) {
        if (-not $r -or -not $r.resourceAppId) { continue }
        $access = @(@($r.resourceAccess) | Where-Object { $_ } | ForEach-Object { @{ id = [string]$_.id; type = [string]$_.type } })
        if ($r.resourceAppId -eq $resourceAppId) {
            $found = $true
            if (-not ($access | Where-Object { $_.id -eq $scopeId -and $_.type -eq 'Scope' })) { $access += @{ id = $scopeId; type = 'Scope' } }
        }
        $result += @{ resourceAppId = [string]$r.resourceAppId; resourceAccess = $access }
    }
    if (-not $found) { $result += @{ resourceAppId = $resourceAppId; resourceAccess = @(@{ id = $scopeId; type = 'Scope' }) } }
    return ,$result
}

# Stejny obsah? (poradi nerozhoduje) - aby -WhatIf a opakovany beh hlasily jen skutecne zmeny.
# Kanonicky zapis: klice serazene (hashtable i objekt z ConvertFrom-Json), hodnoty v polich serazene.
function ConvertTo-CanonicalJson($x) {
    if ($null -eq $x) { return 'null' }
    if ($x -is [string]) { return ($x | ConvertTo-Json -Compress) }
    if ($x -is [bool] -or $x -is [int] -or $x -is [long] -or $x -is [double]) { return ($x | ConvertTo-Json -Compress) }
    if ($x -is [System.Collections.IDictionary]) {
        $keys = @($x.Keys | ForEach-Object { [string]$_ } | Sort-Object)
        return '{' + (($keys | ForEach-Object { ($_ | ConvertTo-Json -Compress) + ':' + (ConvertTo-CanonicalJson $x[$_]) }) -join ',') + '}'
    }
    if ($x -is [System.Collections.IEnumerable]) {
        return '[' + ((@($x) | ForEach-Object { ConvertTo-CanonicalJson $_ } | Sort-Object) -join ',') + ']'
    }
    $props = @($x.PSObject.Properties | ForEach-Object { $_.Name } | Sort-Object)
    return '{' + (($props | ForEach-Object { ($_ | ConvertTo-Json -Compress) + ':' + (ConvertTo-CanonicalJson $x.$_) }) -join ',') + '}'
}

function Test-SameJson($a, $b) {
    $norm = { param($v) ConvertTo-CanonicalJson @(@($v) | Where-Object { $_ }) }
    return (& $norm $a) -eq (& $norm $b)
}

$graphUri = "https://graph.microsoft.com/v1.0/applications/$appObjectId"

# KROK 1 - identifikator, scope a verze tokenu.
$apiReady = $existingScope -and (@($current.identifierUris) -contains $appIdUri) -and $current.api.requestedAccessTokenVersion -eq 2
if ($WhatIf) {
    if ($apiReady) { Write-Ok "App ID URI $appIdUri, scope user_impersonation a token v2 uz nastaveny." }
    else { Write-Plan "App ID URI $appIdUri, scope user_impersonation, token v2" }
} else {
    Invoke-GraphPatch $graphUri @{
        identifierUris = @($appIdUri)
        api            = @{
            oauth2PermissionScopes      = @($scope)
            requestedAccessTokenVersion = 2
        }
    }
    Write-Ok "App ID URI:  $appIdUri"
    Write-Ok 'Scope:       user_impersonation'
}

# KROK 2 - teprve ted odkaz na scope z preautorizace (slouceno se stavajicimi, viz Merge-PreAuthorized).
# Po kroku 1 ma registrace jediny scope ($scopeId) - jine id v predautorizaci by Graph odmitl (400).
$existingPre = @()
if ($current.api -and $current.api.preAuthorizedApplications) { $existingPre = @($current.api.preAuthorizedApplications) }
$knownScopeIds = @($scopeId)
$preAuthorized = Merge-PreAuthorized $existingPre $SPFX_PRINCIPAL $scopeId $knownScopeIds
if (-not $SkipOfficeAddin) {
    # Doplnek Office zada o token pro vlastni API pod toutez registraci (Office na pocitaci bez
    # predautorizace token nevyda - 401, lekce 119.6).
    $preAuthorized = Merge-PreAuthorized $preAuthorized $appClientId $scopeId $knownScopeIds
}
if (Test-SameJson $existingPre $preAuthorized) {
    Write-Ok "Predautorizace uz nastavene (klientu: $($preAuthorized.Count))."
} elseif ($WhatIf) {
    Write-Plan "predautorizace pro user_impersonation: $(@($preAuthorized | ForEach-Object { $_.appId }) -join ', ')"
} else {
    Start-Sleep -Seconds 3
    Invoke-GraphPatch $graphUri @{
        api = @{ preAuthorizedApplications = $preAuthorized }
    }
    Write-Ok "Predautorizace nastavena (SharePoint Framework$(if (-not $SkipOfficeAddin) { ' + doplnek Office' }); klientu: $($preAuthorized.Count))"
}

# KROK 3 - doplnek Office: presmerovani panelu a SharePoint AllSites.Read (stavajici zustanou).
if ($SkipOfficeAddin) {
    Write-Info 'Doplnek Office vynechan (-SkipOfficeAddin).'
} else {
    $spa = @()
    if ($current.spa -and $current.spa.redirectUris) { $spa = @($current.spa.redirectUris) }
    $newSpa = Merge-UriList $spa $PANE_REDIRECTS
    if ($newSpa.Count -eq $spa.Count) { Write-Ok 'Presmerovani panelu doplnku uz nastavena.' }
    elseif ($WhatIf) { Write-Plan "presmerovani SPA: pridat $(@($newSpa | Where-Object { $spa -notcontains $_ }) -join ', ')" }
    else {
        Invoke-GraphPatch $graphUri @{ spa = @{ redirectUris = $newSpa } }
        Write-Ok 'Presmerovani panelu doplnku doplnena.'
    }

    $spSp = az ad sp show --id $SHAREPOINT_ID 2>$null | ConvertFrom-Json
    $spScope = $null
    if ($spSp) { $spScope = $spSp.oauth2PermissionScopes | Where-Object { $_.value -eq $SP_SCOPE } | Select-Object -First 1 }
    if (-not $spScope) {
        Write-Host "    POZOR  Opravneni SharePoint $SP_SCOPE se nepodarilo najit - doplnek bez nej nepresete nastaveni. Doplnte ho rucne nebo skriptem setup-office-addin.ps1." -ForegroundColor Red
    } else {
        $rra = @()
        if ($current.requiredResourceAccess) { $rra = @($current.requiredResourceAccess) }
        $newRra = Merge-RequiredScope $rra $SHAREPOINT_ID $spScope.id
        $before = @($rra | ForEach-Object { @{ resourceAppId = [string]$_.resourceAppId; resourceAccess = @(@($_.resourceAccess) | Where-Object { $_ } | ForEach-Object { @{ id = [string]$_.id; type = [string]$_.type } }) } })
        if (Test-SameJson $before $newRra) { Write-Ok "SharePoint $SP_SCOPE uz nastaveno." }
        elseif ($WhatIf) { Write-Plan "pridat delegovane opravneni SharePoint $SP_SCOPE" }
        else {
            Invoke-GraphPatch $graphUri @{ requiredResourceAccess = $newRra }
            Write-Ok "SharePoint $SP_SCOPE doplneno (plati po souhlasu spravce)."
        }
    }
}

# ------------------------------------------------------- 4. Service principal
Write-Step 4 'Service principal (aby byla registrace videt v SharePoint admin centru)'

$sp = az ad sp list --filter "appId eq '$appClientId'" 2>$null | ConvertFrom-Json
if ($sp -and $sp.Count -gt 0) {
    Write-Ok 'Uz existuje.'
} elseif ($WhatIf) {
    Write-Plan 'zalozit service principal registrace'
} else {
    az ad sp create --id $appClientId | Out-Null
    Write-Ok 'Vytvoren.'
}

# ------------------------------------------------------------ 5. App settings
Write-Step 5 'App settings Function App'

if ($WhatIf) {
    Write-Plan "EP365_AUTH_AUDIENCE=$appClientId, EP365_AUTH_TENANT_ID=$tenantId, EP365_AUTH_MODE=$Mode$(if ($EnforceClients) { ", EP365_AUTH_ALLOWED_CLIENTS=$SPFX_PRINCIPAL" })"
    Write-Host "`n-WhatIf: nic se nezmenilo." -ForegroundColor Yellow
    return
}

az functionapp config appsettings set --name $FunctionAppName --resource-group $ResourceGroup --settings `
    "EP365_AUTH_AUDIENCE=$appClientId" `
    "EP365_AUTH_TENANT_ID=$tenantId" `
    "EP365_AUTH_MODE=$Mode" | Out-Null

if ($EnforceClients) {
    # Registrace funkce (audience) se do seznamu pridava ve funkci automaticky.
    az functionapp config appsettings set --name $FunctionAppName --resource-group $ResourceGroup --settings `
        "EP365_AUTH_ALLOWED_CLIENTS=$SPFX_PRINCIPAL" | Out-Null
    Write-Ok "EP365_AUTH_ALLOWED_CLIENTS = $SPFX_PRINCIPAL (+ registrace funkce)"
}

Write-Ok "EP365_AUTH_AUDIENCE  = $appClientId"
Write-Ok "EP365_AUTH_TENANT_ID = $tenantId"
Write-Ok "EP365_AUTH_MODE      = $Mode"

# ----------------------------------------------------------------- 6. Souhrn
Write-Host "`n=================== HOTOVO ===================" -ForegroundColor Green
if (-not $SkipOfficeAddin) {
    Write-Host @"

Doplnek Office (EP365 AI Asistent pro Office):

  1. Souhlas spravce (globalni spravce nebo Cloud Application Administrator, jednou):
     https://login.microsoftonline.com/$tenantId/adminconsent?client_id=$appClientId
  2. Manifest: AI Asistent > Nastaveni > Doplnek Office > Stahnout doplnek Office.
  3. Centrum pro spravu Microsoft 365 > Nastaveni > Integrovane aplikace >
     Nahrat vlastni aplikace > Office Add-in > nahrat soubor > priradit uzivatele.
"@ -ForegroundColor White
}
Write-Host @"

Co jeste musi udelat SharePoint administrator:

  SharePoint admin centrum -> Advanced -> API access
  -> schvalit cekajici pozadavek "$APP_NAME" (scope user_impersonation).

  Bez schvaleni aplikace token neziska a vola sluzbu jako dosud, tedy bez nej.
  V rezimu 'optional' to nic nerozbije - v rezimu 'required' by to uzivatele odstrihlo.

Doporucene poradi prechodu (proc: jednotlive weby mohou byt pripnute na starsi verzi
aplikace, ktera token jeste neposila):

  1. Nechte rezim 'optional' (nastaven ted).
  2. Aktualizujte aplikaci na verzi, ktera token posila, a schvalte opravneni.
  3. V Application Insights Function App si najdete radky "[auth]" - jednou za
     5 minut hlasi, kolik pozadavku prislo s tokenem a kolik bez nej.
  4. Az bude "bez tokenu 0", spustte tenhle skript znovu s -Mode required.

"@ -ForegroundColor White
