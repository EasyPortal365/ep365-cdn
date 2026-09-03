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

.PARAMETER SubscriptionId
    Volitelne prepnuti subscription pred praci.

.EXAMPLE
    .\setup-auth.ps1 -ResourceGroup rg-firma-ai -FunctionAppName func-firma-ai

.EXAMPLE
    .\setup-auth.ps1 -ResourceGroup rg-firma-ai -FunctionAppName func-firma-ai -Mode required
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)] [string] $ResourceGroup,
    [Parameter(Mandatory = $true)] [string] $FunctionAppName,
    [ValidateSet('optional', 'required', 'off')] [string] $Mode = 'optional',
    [string] $SubscriptionId
)

$ErrorActionPreference = 'Stop'

# Nazev a suffix MUSI sedet s klientem (services/functionAuth.ts) - kdyz je zmenite,
# aplikace si slozi jiny identifikator a token nedostane.
$APP_NAME        = 'EP365 AI Function'
$RESOURCE_SUFFIX = 'ep365-ai-function'
# Globalni ID principalu, pod kterym SharePoint Framework zada o tokeny. Stejne
# ve vsech tenantech (SharePoint Online Client Extensibility Web Application Principal).
$SPFX_PRINCIPAL  = '08e18876-6177-487e-b8b5-cf950c1e598c'

function Write-Step($n, $text) { Write-Host "`n[$n] $text" -ForegroundColor Cyan }
function Write-Ok($text)       { Write-Host "    OK  $text" -ForegroundColor Green }
function Write-Info($text)     { Write-Host "    ... $text" -ForegroundColor DarkGray }

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
if (-not $fn) { throw "Function App '$FunctionAppName' v resource group '$ResourceGroup' nenalezena (nebo na ni nemate prava)." }
Write-Ok "Function App: $($fn.defaultHostName)"

# ------------------------------------------------------------ 2. App registrace
Write-Step 2 "App registrace '$APP_NAME'"

$appIdUri = "api://$tenantId/$RESOURCE_SUFFIX"
$existing = az ad app list --display-name $APP_NAME --query "[?displayName=='$APP_NAME']" 2>$null | ConvertFrom-Json

if ($existing -and $existing.Count -gt 0) {
    $app = $existing[0]
    Write-Ok "Uz existuje (appId $($app.appId)) - jen doplnim, co chybi."
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

$graphUri = "https://graph.microsoft.com/v1.0/applications/$appObjectId"

# KROK 1 - identifikator, scope a verze tokenu.
Invoke-GraphPatch $graphUri @{
    identifierUris = @($appIdUri)
    api            = @{
        oauth2PermissionScopes      = @($scope)
        requestedAccessTokenVersion = 2
    }
}
Write-Ok "App ID URI:  $appIdUri"
Write-Ok 'Scope:       user_impersonation'

# KROK 2 - teprve ted odkaz na scope z preautorizace.
Start-Sleep -Seconds 3
Invoke-GraphPatch $graphUri @{
    api = @{ preAuthorizedApplications = @(@{ appId = $SPFX_PRINCIPAL; delegatedPermissionIds = @($scopeId) }) }
}
Write-Ok 'Preautorizace SharePoint Framework principalu nastavena'

# ------------------------------------------------------- 4. Service principal
Write-Step 4 'Service principal (aby byla registrace videt v SharePoint admin centru)'

$sp = az ad sp list --filter "appId eq '$appClientId'" 2>$null | ConvertFrom-Json
if ($sp -and $sp.Count -gt 0) {
    Write-Ok 'Uz existuje.'
} else {
    az ad sp create --id $appClientId | Out-Null
    Write-Ok 'Vytvoren.'
}

# ------------------------------------------------------------ 5. App settings
Write-Step 5 'App settings Function App'

az functionapp config appsettings set --name $FunctionAppName --resource-group $ResourceGroup --settings `
    "EP365_AUTH_AUDIENCE=$appClientId" `
    "EP365_AUTH_TENANT_ID=$tenantId" `
    "EP365_AUTH_MODE=$Mode" | Out-Null

Write-Ok "EP365_AUTH_AUDIENCE  = $appClientId"
Write-Ok "EP365_AUTH_TENANT_ID = $tenantId"
Write-Ok "EP365_AUTH_MODE      = $Mode"

# ----------------------------------------------------------------- 6. Souhrn
Write-Host "`n=================== HOTOVO ===================" -ForegroundColor Green
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
