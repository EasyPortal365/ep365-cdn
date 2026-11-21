<#
.SYNOPSIS
    Pripravi tenant zakaznika pro doplnek EP365 AI Asistent pro Office.

.DESCRIPTION
    Doplnek se prihlasuje pres registraci "EP365 AI Function", kterou uz zalozil
    setup-auth.ps1 funkce AI. Skript ji jen doplni - nic nemaze a nic nezaklada:

      1. Overeni Azure CLI, Function App a registrace "EP365 AI Function".
      2. Presmerovani SPA pro doplnek (Office na webu a desktopu):
           brk-multihub://cdn.easyportal365.cz
           https://cdn.easyportal365.cz/ai-office/taskpane.html
         Existujici adresy zustavaji.
     2b. Predautorizace registrace pro vlastni scope user_impersonation (bez ni
         Office na pocitaci token pro funkci AI nevyda). Ostatni klienti zustavaji.
      3. Delegovane opravneni SharePoint AllSites.Read (cteni nastaveni AI Asistenta
         a klasifikace "mimo AI" otevreneho dokumentu). Id opravneni se cte
         ze sluzby SharePoint v tenantu, neni natvrdo.
      4. ALLOWED_ORIGIN funkce AI doplni o https://cdn.easyportal365.cz
         (puvod panelu doplnku). Existujici puvody zustavaji. Zmena app settings
         funkci restartuje (par sekund).
      5. Vypise odkaz na souhlas spravce a hodnoty pro manifest doplnku.

    -WhatIf jen vypise, co by se zmenilo.

    Spousti spravce zakaznika (Azure Cloud Shell nebo PowerShell s Azure CLI).
    Ucet musi smet upravovat app registrace a nastaveni Function App.

.EXAMPLE
    ./setup-office-addin.ps1 -ResourceGroup rg-ep365-ai -FunctionAppName func-ep365-ai -WhatIf
    ./setup-office-addin.ps1 -ResourceGroup rg-ep365-ai -FunctionAppName func-ep365-ai
#>
param(
    [Parameter(Mandatory = $true)] [string] $ResourceGroup,
    [Parameter(Mandatory = $true)] [string] $FunctionAppName,
    [string] $SubscriptionId,
    [switch] $WhatIf
)

$ErrorActionPreference = 'Stop'

# Musi sedet se setup-auth.ps1 funkce AI a s klientem (@ep365/ai-compose functionAuth).
$APP_NAME      = 'EP365 AI Function'
$PANE_ORIGIN   = 'https://cdn.easyportal365.cz'
$REDIRECTS     = @('brk-multihub://cdn.easyportal365.cz', 'https://cdn.easyportal365.cz/ai-office/taskpane.html')
$SHAREPOINT_ID = '00000003-0000-0ff1-ce00-000000000000'   # Office 365 SharePoint Online (stejne ve vsech tenantech)
$SP_SCOPE      = 'AllSites.Read'

function Write-Step($n, $text) { Write-Host "`n[$n] $text" -ForegroundColor Cyan }
function Write-Ok($text)       { Write-Host "    OK  $text" -ForegroundColor Green }
function Write-Info($text)     { Write-Host "    ... $text" -ForegroundColor DarkGray }
function Write-Plan($text)     { Write-Host "    ZMENA  $text" -ForegroundColor Yellow }

function Invoke-GraphPatch([string]$uri, [hashtable]$payload) {
    $json = $payload | ConvertTo-Json -Depth 10 -Compress
    # Absolutni cesta: cd v PowerShellu nemeni pracovni adresar .NET.
    $tmp = [System.IO.Path]::Combine([System.IO.Path]::GetTempPath(), "ep365-office-$([guid]::NewGuid()).json")
    [System.IO.File]::WriteAllText($tmp, $json, (New-Object System.Text.UTF8Encoding($false)))
    try {
        az rest --method PATCH --uri $uri --headers 'Content-Type=application/json' --body "@$tmp" | Out-Null
        if ($LASTEXITCODE -ne 0) { throw "Graph PATCH selhal (az rest exit $LASTEXITCODE): $uri" }
    } finally {
        Remove-Item $tmp -ErrorAction SilentlyContinue
    }
}

# ---------------------------------------------------------------- 1. Overeni
Write-Step 1 'Overuji Azure CLI, Function App a registraci'
try { $null = az version 2>$null } catch { throw 'Azure CLI (az) neni dostupne. Spustte skript v Azure Cloud Shellu.' }
$account = az account show 2>$null | ConvertFrom-Json
if (-not $account) { throw 'Nejste prihlaseni. Spustte "az login".' }
if ($SubscriptionId) {
    az account set --subscription $SubscriptionId | Out-Null
    $account = az account show | ConvertFrom-Json
}
$tenantId = $account.tenantId
Write-Ok "Tenant $tenantId, subscription $($account.name)"

$fn = az functionapp show --name $FunctionAppName --resource-group $ResourceGroup 2>$null | ConvertFrom-Json
if (-not $fn) { throw "Function App '$FunctionAppName' ve skupine '$ResourceGroup' neexistuje." }
Write-Ok "Function App $($fn.defaultHostName)"

$apps = az ad app list --display-name $APP_NAME --query "[?displayName=='$APP_NAME']" 2>$null | ConvertFrom-Json
if (-not $apps -or $apps.Count -eq 0) { throw "Registrace '$APP_NAME' neexistuje. Nejdriv spustte setup-auth.ps1 funkce AI." }
if ($apps.Count -gt 1) { throw "Registraci '$APP_NAME' je v tenantu vic ($($apps.Count)). Ujasnete, ktera patri funkci AI." }
$appObjectId = $apps[0].id
$appClientId = $apps[0].appId
$graphUri = "https://graph.microsoft.com/v1.0/applications/$appObjectId"
$current = az rest --method GET --uri $graphUri | ConvertFrom-Json
Write-Ok "Registrace $APP_NAME (appId $appClientId)"

# ---------------------------------------------------------------- 2. Presmerovani SPA
Write-Step 2 'Presmerovani SPA pro doplnek'
$spa = @()
if ($current.spa -and $current.spa.redirectUris) { $spa = @($current.spa.redirectUris) }
$missing = @($REDIRECTS | Where-Object { $spa -notcontains $_ })
if ($missing.Count -eq 0) {
    Write-Ok 'Uz nastavena.'
} else {
    foreach ($m in $missing) { Write-Plan "pridat $m" }
    if (-not $WhatIf) {
        Invoke-GraphPatch $graphUri @{ spa = @{ redirectUris = @($spa + $missing) } }
        Write-Ok 'Doplneno.'
    }
}

# ---------------------------------------------- 2b. Predautorizace sama sebe (Office na pocitaci)
# Doplnek zada o token pro API funkce AI (user_impersonation) pod TOUTEZ registraci. Office na webu
# token vyda i bez toho, Office na pocitaci (NAA pres WAM) ale bez predautorizace token nevyda
# a panel vola bez nej -> 401 "Neplatny nebo chybejici pristupovy token" (20. 11. 2026: Word na
# pocitaci, v logu funkce pozadavek bez tokenu, registrace mela predautorizovany jen SharePoint).
Write-Step '2b' 'Predautorizace doplnku pro vlastni API (Office na pocitaci)'
$api = $current.api
$userScope = $null
if ($api -and $api.oauth2PermissionScopes) { $userScope = $api.oauth2PermissionScopes | Where-Object { $_.value -eq 'user_impersonation' } | Select-Object -First 1 }
if (-not $userScope) { throw "Registrace '$APP_NAME' nema scope user_impersonation. Nejdriv spustte setup-auth.ps1 funkce AI." }
$pre = @()
if ($api.preAuthorizedApplications) { $pre = @($api.preAuthorizedApplications) }
$self = $pre | Where-Object { $_.appId -eq $appClientId } | Select-Object -First 1
if ($self -and (@($self.delegatedPermissionIds) -contains $userScope.id)) {
    Write-Ok 'Uz nastaveno.'
} else {
    Write-Plan "predautorizovat $appClientId pro user_impersonation ($($userScope.id))"
    if (-not $WhatIf) {
        $newPre = @()
        foreach ($p in $pre) {
            if ($p.appId -ne $appClientId) { $newPre += @{ appId = $p.appId; delegatedPermissionIds = @($p.delegatedPermissionIds) } }
        }
        $ids = @($userScope.id)
        if ($self) { $ids = @(@($self.delegatedPermissionIds) + $userScope.id | Select-Object -Unique) }
        $newPre += @{ appId = $appClientId; delegatedPermissionIds = $ids }
        # Cely objekt api (scopes beze zmeny) - PATCH nesmi o scopes prijit.
        $api.preAuthorizedApplications = $newPre
        Invoke-GraphPatch $graphUri @{ api = $api }
        Write-Ok 'Doplneno.'
    }
}

# ---------------------------------------------------------------- 3. AllSites.Read
Write-Step 3 "Delegovane opravneni SharePoint $SP_SCOPE"
$spSp = az ad sp show --id $SHAREPOINT_ID 2>$null | ConvertFrom-Json
if (-not $spSp) { throw 'Sluzba SharePoint Online v tenantu nebyla nalezena.' }
$scope = $spSp.oauth2PermissionScopes | Where-Object { $_.value -eq $SP_SCOPE } | Select-Object -First 1
if (-not $scope) { throw "Opravneni $SP_SCOPE u SharePointu nebylo nalezeno." }

$rra = @()
if ($current.requiredResourceAccess) { $rra = @($current.requiredResourceAccess) }
$spEntry = $rra | Where-Object { $_.resourceAppId -eq $SHAREPOINT_ID } | Select-Object -First 1
$has = $spEntry -and ($spEntry.resourceAccess | Where-Object { $_.id -eq $scope.id -and $_.type -eq 'Scope' })
if ($has) {
    Write-Ok 'Uz nastaveno.'
} else {
    Write-Plan "pridat SharePoint $SP_SCOPE (delegovane, $($scope.id))"
    if (-not $WhatIf) {
        $newRra = @()
        foreach ($r in $rra) {
            $access = @($r.resourceAccess | ForEach-Object { @{ id = $_.id; type = $_.type } })
            if ($r.resourceAppId -eq $SHAREPOINT_ID) { $access += @{ id = $scope.id; type = 'Scope' } }
            $newRra += @{ resourceAppId = $r.resourceAppId; resourceAccess = $access }
        }
        if (-not $spEntry) { $newRra += @{ resourceAppId = $SHAREPOINT_ID; resourceAccess = @(@{ id = $scope.id; type = 'Scope' }) } }
        Invoke-GraphPatch $graphUri @{ requiredResourceAccess = $newRra }
        Write-Ok 'Doplneno. Opravneni plati az po souhlasu spravce (krok 5).'
    }
}

# ---------------------------------------------------------------- 4. ALLOWED_ORIGIN
Write-Step 4 'ALLOWED_ORIGIN funkce AI'
$origin = az functionapp config appsettings list --name $FunctionAppName --resource-group $ResourceGroup --query "[?name=='ALLOWED_ORIGIN'].value | [0]" -o tsv 2>$null
$origins = @()
if ($origin) { $origins = @($origin.Split(',') | ForEach-Object { $_.Trim() } | Where-Object { $_ }) }
if ($origins.Count -eq 0) { throw 'ALLOWED_ORIGIN neni nastavene - funkce AI neni nasazena podle postupu. Nejdriv deploy-azure.ps1.' }
if ($origins | Where-Object { $_.TrimEnd('/').ToLower() -eq $PANE_ORIGIN }) {
    Write-Ok "Uz obsahuje $PANE_ORIGIN"
} else {
    $value = (@($origins) + $PANE_ORIGIN) -join ','
    Write-Plan "ALLOWED_ORIGIN = $value"
    if (-not $WhatIf) {
        az functionapp config appsettings set --name $FunctionAppName --resource-group $ResourceGroup --settings "ALLOWED_ORIGIN=$value" | Out-Null
        if ($LASTEXITCODE -ne 0) { throw 'Nastaveni ALLOWED_ORIGIN selhalo.' }
        Write-Ok 'Nastaveno (funkce se restartuje).'
    }
}

# ---------------------------------------------------------------- 5. Souhlas a manifest
Write-Step 5 'Souhlas spravce a manifest'
if ($WhatIf) { Write-Host "`n    -WhatIf: nic se nezmenilo." -ForegroundColor Yellow }
Write-Host "`n    1) Souhlas spravce (globalni spravce, jednou):"
Write-Host "       https://login.microsoftonline.com/$tenantId/adminconsent?client_id=$appClientId"
Write-Host "`n    2) Hodnoty pro manifest doplnku (posle je EasyPortal 365, nebo tools/make-manifest.mjs):"
Write-Host "       tenant = $tenantId"
Write-Host "       client = $appClientId"
Write-Host "       site   = adresa webu AI Asistenta (napr. https://<tenant>.sharepoint.com/sites/ai-asistent)"
Write-Host "`n    3) Nasazeni manifestu: Centrum spravce Microsoft 365 > Nastaveni > Integrovane aplikace > Nahrat vlastni aplikace."
