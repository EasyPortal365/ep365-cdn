<#
.SYNOPSIS
    Aktivuje Znalostni pripravu (enrich) pro EP365 AI Chat - app registrace v Entra ID,
    Graph permission Sites.Selected, per-site granty a app settings Function App.

.DESCRIPTION
    Automatizuje kroky, ktere se jinak delaji rucne v Entra ID a Graph Exploreru
    (viz README.md, sekce "Znalostni priprava"):
      1. Overeni prihlaseni do Azure CLI a existence Function App.
      2. App registrace - najde podle nazvu, jinak vytvori novou.
      3. Service principal pro aplikaci.
      4. Graph application permission Sites.Selected.
      5. Admin consent (vyzaduje privilegovanou roli - pri selhani vypise rucni postup
         a pokracuje).
      6. Novy client secret (hodnota se zobrazi JEN JEDNOU - v souhrnu na konci).
      7. Per-site granty pres Graph (sites/{id}/permissions) - settings web + vsechny
         weby z -LibrarySiteUrls; role se zveda na "manage" (nutne pro tvorbu sloupcu
         na knihovnach; pro samotny settings web by stacilo "write", "manage" ho pokryva).
      8. Zapis app settings do Function App: AAD_TENANT_ID, AAD_CLIENT_ID,
         AAD_CLIENT_SECRET, EP365_SETTINGS_SITE_URL.

    Skript je idempotentni - existujici app registrace, permission i granty se preskoci
    nebo jen aktualizuji. Kazde spusteni ale vytvori NOVY client secret (--append)
    a zapise ho do Function App; stare secrety lze smazat v Entra portalu.

    Weby s knihovnami pridane pozdeji potrebuji novy grant - spustte skript znovu
    s parametrem -LibrarySiteUrls.

    Prerekvizity:
      - Azure CLI (az) + prihlaseni uctem, ktery umi:
        * spravovat app registrace (Application Administrator nebo vyssi),
        * udelit admin consent (Global Administrator / Privileged Role Administrator),
        * udelovat per-site granty pres Graph (prakticky SharePoint Administrator
          nebo Global Administrator).
      - Function App uz nasazena (scripts/deploy-azure.ps1 nebo README.md).

    Skript bezi i v Azure Cloud Shellu (PowerShell) - nic se neinstaluje:
      iwr https://cdn.easyportal365.cz/chat-function/setup-enrichment.ps1 -OutFile setup-enrichment.ps1

.PARAMETER FunctionAppName
    Povinny. Nazev Function App (napr. func-contoso-ai).

.PARAMETER ResourceGroupName
    Povinny. Resource group, kde Function App bezi.

.PARAMETER SettingsSiteUrl
    Povinny. Absolutni URL webu se settings listem EP365AIChatAppSettings,
    napr. https://contoso.sharepoint.com/sites/ai. Grant dostane vzdy.

.PARAMETER LibrarySiteUrls
    Volitelny. Dalsi weby s cilovymi knihovnami (pole URL). Kazdy dostane grant
    s roli manage. Settings web neni nutne opakovat.

.PARAMETER AppDisplayName
    Nazev app registrace v Entra ID. Default: EP365 AI Enrich.

.PARAMETER SecretYears
    Platnost client secretu v letech. Default: 2.

.PARAMETER SubscriptionId
    Volitelny. Id subscription, pokud Function App nelezi v aktualne vybrane.

.EXAMPLE
    .\setup-enrichment.ps1 -FunctionAppName func-contoso-ai -ResourceGroupName rg-contoso-ai `
        -SettingsSiteUrl https://contoso.sharepoint.com/sites/ai

.EXAMPLE
    .\setup-enrichment.ps1 -FunctionAppName func-contoso-ai -ResourceGroupName rg-contoso-ai `
        -SettingsSiteUrl https://contoso.sharepoint.com/sites/ai `
        -LibrarySiteUrls https://contoso.sharepoint.com/sites/hr, https://contoso.sharepoint.com/sites/kvalita
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$FunctionAppName,

    [Parameter(Mandatory = $true)]
    [string]$ResourceGroupName,

    [Parameter(Mandatory = $true)]
    [string]$SettingsSiteUrl,

    [string[]]$LibrarySiteUrls = @(),
    [string]$AppDisplayName = 'EP365 AI Enrich',
    [int]$SecretYears = 2,
    [string]$SubscriptionId = ''
)

$ErrorActionPreference = 'Stop'

$GraphResourceAppId = '00000003-0000-0000-c000-000000000000'   # Microsoft Graph
$SitesSelectedFallbackRoleId = '883ea226-0bf2-4a8f-9f9d-92c9162a727d'  # zname id app role Sites.Selected

function Write-Step([string]$Text) {
    Write-Host ''
    Write-Host ('==> ' + $Text) -ForegroundColor Cyan
}

function Assert-LastExit([string]$Message) {
    if ($LASTEXITCODE -ne 0) { throw $Message }
}

function ConvertFrom-AzJson($Lines) {
    if ($null -eq $Lines) { return $null }
    $text = (@($Lines) -join "`n").Trim()
    if ($text -eq '') { return $null }
    return (ConvertFrom-Json -InputObject $text)
}

# Zapise JSON telo do docasneho souboru (UTF-8 bez BOM) a vrati cestu.
# Duvod: PS 5.1 pri predavani retezce s vnorenymi uvozovkami nativnimu exe
# uvozovky polyka - soubor + "@cesta" je spolehlive.
function Write-BodyFile([string]$Json) {
    # $env:TEMP na Windows; v Azure Cloud Shellu (Linux) neexistuje -> GetTempPath()
    $tempBase = $env:TEMP
    if (-not $tempBase) { $tempBase = [System.IO.Path]::GetTempPath() }
    $path = Join-Path $tempBase ('ep365-enrich-body-' + [Guid]::NewGuid().ToString('N') + '.json')
    $enc = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($path, $Json, $enc)
    return $path
}

# Slozene (composite) site id webu pres Graph path-based adresovani.
# Pozn.: '?$select=id' je schvalne skladane z jednoduse-uvozovkovanych casti,
# aby PowerShell nerozbalil $select jako promennou.
function Get-GraphSiteId([string]$SiteUrl) {
    $uri = [Uri]$SiteUrl
    $siteHost = $uri.Host
    $sitePath = $uri.AbsolutePath.TrimEnd('/')
    if ($sitePath -eq '' -or $sitePath -eq '/') {
        $url = 'https://graph.microsoft.com/v1.0/sites/' + $siteHost + '?$select=id'
    }
    else {
        $url = 'https://graph.microsoft.com/v1.0/sites/' + $siteHost + ':' + $sitePath + '?$select=id'
    }
    $raw = az rest --method get --url $url -o json
    Assert-LastExit ('Nepodarilo se zjistit site id webu ' + $SiteUrl + ' - zkontrolujte URL a sva opravneni k SharePointu.')
    $site = ConvertFrom-AzJson $raw
    if ($null -eq $site -or [string]::IsNullOrEmpty($site.id)) {
        throw ('Graph nevratil site id pro ' + $SiteUrl + '.')
    }
    return $site.id
}

# PATCH role permission zaznamu - adresovano pres composite site id
# (path-based adresovani permission zaznamu vraci 404, overeno).
function Set-SitePermissionRole([string]$SiteId, [string]$PermissionId, [string]$Role) {
    $patchUrl = 'https://graph.microsoft.com/v1.0/sites/' + $SiteId + '/permissions/' + $PermissionId
    $bodyFile = Write-BodyFile ('{"roles":["' + $Role + '"]}')
    try {
        az rest --method patch --url $patchUrl --headers 'Content-Type=application/json' --body ('@' + $bodyFile) -o none
        Assert-LastExit ('Zmena role grantu na "' + $Role + '" selhala (site ' + $SiteId + ').')
    }
    finally {
        Remove-Item $bodyFile -Force -ErrorAction SilentlyContinue
    }
}

try {

    # ----------------------------------------------------------------------
    # 0. Validace vstupu
    # ----------------------------------------------------------------------
    if ($SettingsSiteUrl -notmatch '^https://') {
        throw '-SettingsSiteUrl musi byt absolutni https URL, napr. https://contoso.sharepoint.com/sites/ai'
    }
    foreach ($u in $LibrarySiteUrls) {
        if ($u -notmatch '^https://') {
            throw ('-LibrarySiteUrls obsahuje neplatnou URL: "' + $u + '" (ocekavana absolutni https URL webu).')
        }
    }

    # ----------------------------------------------------------------------
    # 1. Azure CLI + prihlaseni + Function App existuje
    # ----------------------------------------------------------------------
    Write-Step 'Kontrola Azure CLI a prihlaseni'

    $azCmd = Get-Command az -ErrorAction SilentlyContinue
    if ($null -eq $azCmd) {
        Write-Host 'Azure CLI (az) neni nainstalovane nebo neni v PATH.' -ForegroundColor Red
        Write-Host 'Instalace: https://learn.microsoft.com/cli/azure/install-azure-cli'
        Write-Host 'Po instalaci spustte: az login   a pote tento skript znovu.'
        exit 1
    }

    az account show -o none
    if ($LASTEXITCODE -ne 0) {
        Write-Host 'Nejste prihlaseni do Azure CLI.' -ForegroundColor Red
        Write-Host 'Spustte: az login              (prihlaseni do Azure)'
        Write-Host 'Pripadne: az login --tenant <tenant-id>'
        Write-Host 'A pote spustte tento skript znovu.'
        exit 1
    }

    if ($SubscriptionId -ne '') {
        az account set --subscription $SubscriptionId
        Assert-LastExit ('Nepodarilo se prepnout na subscription ' + $SubscriptionId + '.')
    }

    $tenantId = az account show --query 'tenantId' -o tsv
    Assert-LastExit 'Nepodarilo se zjistit tenant id.'
    Write-Host ('Prihlaseni OK - tenant: ' + $tenantId)

    Write-Host ('Overuji Function App "' + $FunctionAppName + '" v resource group "' + $ResourceGroupName + '"...')
    az functionapp show -g $ResourceGroupName -n $FunctionAppName -o none
    Assert-LastExit ('Function App "' + $FunctionAppName + '" v resource group "' + $ResourceGroupName + '" nenalezena. Nejdriv nasadte backend (scripts/deploy-azure.ps1).')
    Write-Host 'Function App nalezena.'

    # ----------------------------------------------------------------------
    # 2. App registrace
    # ----------------------------------------------------------------------
    Write-Step ('App registrace "' + $AppDisplayName + '"')

    # --display-name filtruje "zacina na" - presnou shodu vynucujeme v --query
    $appIdsRaw = az ad app list --display-name $AppDisplayName --query ("[?displayName=='" + $AppDisplayName + "'].appId") -o tsv
    Assert-LastExit 'Vyhledani app registrace selhalo.'
    $appIds = @(@($appIdsRaw) | Where-Object { $_ })

    $createdApp = $false
    $appId = ''
    if ($appIds.Count -gt 0) {
        $appId = $appIds[0]
        Write-Host ('App registrace uz existuje - appId ' + $appId)
        if ($appIds.Count -gt 1) {
            Write-Host ('[WARN] Nalezeno vice app registraci se jmenem "' + $AppDisplayName + '" - pouzivam prvni.') -ForegroundColor Yellow
        }
    }
    else {
        Write-Host 'App registrace neexistuje - vytvarim novou...'
        $appRaw = az ad app create --display-name $AppDisplayName --sign-in-audience AzureADMyOrg -o json
        Assert-LastExit 'Vytvoreni app registrace selhalo (vyzaduje roli Application Administrator nebo vyssi).'
        $app = ConvertFrom-AzJson $appRaw
        $appId = $app.appId
        $createdApp = $true
        Write-Host ('Vytvoreno - appId ' + $appId)
    }

    # ----------------------------------------------------------------------
    # 3. Service principal
    # ----------------------------------------------------------------------
    Write-Step 'Service principal'

    $spIdsRaw = az ad sp list --filter ("appId eq '" + $appId + "'") --query '[].id' -o tsv
    Assert-LastExit 'Vyhledani service principal selhalo.'
    $spIds = @(@($spIdsRaw) | Where-Object { $_ })

    if ($spIds.Count -eq 0) {
        az ad sp create --id $appId -o none
        Assert-LastExit 'Vytvoreni service principal selhalo.'
        Write-Host 'Service principal vytvoren.'
    }
    else {
        Write-Host 'Service principal uz existuje.'
    }

    # ----------------------------------------------------------------------
    # 4. Graph application permission Sites.Selected
    # ----------------------------------------------------------------------
    Write-Step 'Graph application permission Sites.Selected'

    $roleId = az ad sp show --id $GraphResourceAppId --query "appRoles[?value=='Sites.Selected'].id | [0]" -o tsv
    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrEmpty($roleId)) {
        $roleId = $SitesSelectedFallbackRoleId
        Write-Host ('[WARN] Role id se nepodarilo zjistit dynamicky - pouzivam zname id ' + $roleId + '.') -ForegroundColor Yellow
    }
    else {
        Write-Host ('Role id Sites.Selected: ' + $roleId)
    }

    $grantedIdsRaw = az ad app permission list --id $appId --query ("[?resourceAppId=='" + $GraphResourceAppId + "'].resourceAccess[].id") -o tsv
    Assert-LastExit 'Cteni stavajicich opravneni aplikace selhalo.'
    $grantedIds = @(@($grantedIdsRaw) | Where-Object { $_ })

    if ($grantedIds -contains $roleId) {
        Write-Host 'Sites.Selected uz je na aplikaci pridane - preskakuji.'
    }
    else {
        az ad app permission add --id $appId --api $GraphResourceAppId --api-permissions ($roleId + '=Role') -o none
        if ($LASTEXITCODE -ne 0) {
            Write-Host '[WARN] Pridani opravneni vratilo chybu (pravdepodobne uz existuje) - pokracuji.' -ForegroundColor Yellow
        }
        else {
            Write-Host 'Sites.Selected pridano.'
        }
    }

    # ----------------------------------------------------------------------
    # 5. Admin consent
    # ----------------------------------------------------------------------
    Write-Step 'Admin consent'

    if ($createdApp) {
        Write-Host 'Nova aplikace - cekam 15 sekund na replikaci v Entra ID...'
        Start-Sleep -Seconds 15
    }

    $consentOk = $false
    az ad app permission admin-consent --id $appId -o none
    if ($LASTEXITCODE -ne 0) {
        Write-Host '[WARN] Admin consent se nepodarilo udelit.' -ForegroundColor Yellow
        Write-Host '       Vyzaduje roli Global Administrator nebo Privileged Role Administrator.' -ForegroundColor Yellow
        Write-Host '       Rucni postup: Entra ID -> App registrations ->' -ForegroundColor Yellow
        Write-Host ('       "' + $AppDisplayName + '" -> API permissions -> Grant admin consent.') -ForegroundColor Yellow
        Write-Host '       Skript pokracuje - consent lze udelit i pozdeji (do te doby enrich nepobezi).' -ForegroundColor Yellow
    }
    else {
        $consentOk = $true
        Write-Host 'Admin consent udelen.'
    }

    # ----------------------------------------------------------------------
    # 6. Client secret
    # ----------------------------------------------------------------------
    Write-Step ('Client secret (platnost ' + $SecretYears + ' r.)')

    $credRaw = az ad app credential reset --id $appId --append --display-name enrich --years $SecretYears -o json
    Assert-LastExit 'Vytvoreni client secretu selhalo.'
    $cred = ConvertFrom-AzJson $credRaw
    $clientSecret = $cred.password
    if ([string]::IsNullOrEmpty($clientSecret)) {
        throw 'az ad app credential reset nevratil hodnotu secretu.'
    }
    $secretExpiry = (Get-Date).AddYears($SecretYears).ToString('yyyy-MM-dd')

    Write-Host '[VAROVANI] Hodnota secretu se zobrazi JEN JEDNOU - v souhrnu na konci skriptu.' -ForegroundColor Yellow
    Write-Host ('[VAROVANI] Poznamenejte si i datum expirace (cca ' + $secretExpiry + ') - pred vyprsenim') -ForegroundColor Yellow
    Write-Host '[VAROVANI] spustte tento skript znovu (vytvori novy secret a zapise ho do Function App).' -ForegroundColor Yellow

    # ----------------------------------------------------------------------
    # 7. Per-site granty (settings web + weby s knihovnami)
    # ----------------------------------------------------------------------
    Write-Step 'Per-site granty Sites.Selected (role manage)'

    $allSites = New-Object System.Collections.ArrayList
    [void]$allSites.Add($SettingsSiteUrl)
    foreach ($u in $LibrarySiteUrls) {
        $present = $false
        foreach ($existing in $allSites) {
            if ($existing.ToLower().TrimEnd('/') -eq $u.ToLower().TrimEnd('/')) { $present = $true }
        }
        if (-not $present) { [void]$allSites.Add($u) }
    }

    $grantResults = @()
    foreach ($siteUrl in $allSites) {
        Write-Host ''
        Write-Host ('Web: ' + $siteUrl)

        $siteId = Get-GraphSiteId $siteUrl
        Write-Host ('  Site id: ' + $siteId)

        $permsUrl = 'https://graph.microsoft.com/v1.0/sites/' + $siteId + '/permissions'
        $permsRaw = az rest --method get --url $permsUrl -o json
        Assert-LastExit ('Cteni stavajicich grantu selhalo pro ' + $siteUrl + ' (vyzaduje SharePoint nebo Global admina).')
        $perms = ConvertFrom-AzJson $permsRaw

        # Existuje uz grant pro nasi aplikaci?
        $existingPermId = ''
        if ($null -ne $perms -and $null -ne $perms.value) {
            foreach ($p in $perms.value) {
                if ($null -ne $p.grantedToIdentities) {
                    foreach ($gi in $p.grantedToIdentities) {
                        if ($null -ne $gi.application -and $gi.application.id -eq $appId) { $existingPermId = $p.id }
                    }
                }
                if ($null -ne $p.grantedToIdentitiesV2) {
                    foreach ($gi in $p.grantedToIdentitiesV2) {
                        if ($null -ne $gi.application -and $gi.application.id -eq $appId) { $existingPermId = $p.id }
                    }
                }
            }
        }

        $resultNote = ''
        if ($existingPermId -ne '') {
            # Vypis grantu nemusi obsahovat roles - detail cteme zvlast.
            $detailRaw = az rest --method get --url ($permsUrl + '/' + $existingPermId) -o json
            Assert-LastExit ('Cteni detailu grantu selhalo pro ' + $siteUrl + '.')
            $detail = ConvertFrom-AzJson $detailRaw
            $roles = @()
            if ($null -ne $detail -and $null -ne $detail.roles) { $roles = @($detail.roles) }

            if ($roles -contains 'manage' -or $roles -contains 'fullcontrol') {
                Write-Host ('  Grant uz existuje s roli "' + ($roles -join ', ') + '" - beze zmeny.')
                $resultNote = 'existoval (' + ($roles -join ', ') + ') - beze zmeny'
            }
            else {
                Write-Host ('  Grant existuje s roli "' + ($roles -join ', ') + '" - zvedam na manage...')
                Set-SitePermissionRole $siteId $existingPermId 'manage'
                Write-Host '  Role zvednuta na manage.'
                $resultNote = 'existoval - role zvednuta na manage'
            }
        }
        else {
            # POST umi jen read/write - vyssi role "manage" se nastavuje naslednym PATCHem.
            Write-Host '  Grant neexistuje - vytvarim (write) a zvedam na manage...'
            $bodyObj = @{
                roles = @('write')
                grantedToIdentities = @(
                    @{ application = @{ id = $appId; displayName = $AppDisplayName } }
                )
            }
            $bodyFile = Write-BodyFile (ConvertTo-Json $bodyObj -Depth 5 -Compress)
            try {
                $newPermRaw = az rest --method post --url $permsUrl --headers 'Content-Type=application/json' --body ('@' + $bodyFile) -o json
                Assert-LastExit ('Udeleni grantu selhalo pro ' + $siteUrl + ' (vyzaduje SharePoint nebo Global admina).')
            }
            finally {
                Remove-Item $bodyFile -Force -ErrorAction SilentlyContinue
            }
            $newPerm = ConvertFrom-AzJson $newPermRaw
            if ($null -eq $newPerm -or [string]::IsNullOrEmpty($newPerm.id)) {
                throw ('Graph nevratil id noveho grantu pro ' + $siteUrl + '.')
            }
            Set-SitePermissionRole $siteId $newPerm.id 'manage'
            Write-Host '  Grant vytvoren s roli manage.'
            $resultNote = 'novy grant (manage)'
        }

        $grantResults += New-Object PSObject -Property @{ Url = $siteUrl; Note = $resultNote }
    }

    # ----------------------------------------------------------------------
    # 8. App settings Function App
    # ----------------------------------------------------------------------
    Write-Step ('Zapis app settings do Function App "' + $FunctionAppName + '"')

    $settings = @(
        ('AAD_TENANT_ID=' + $tenantId),
        ('AAD_CLIENT_ID=' + $appId),
        ('AAD_CLIENT_SECRET=' + $clientSecret),
        ('EP365_SETTINGS_SITE_URL=' + $SettingsSiteUrl)
    )
    az functionapp config appsettings set -g $ResourceGroupName -n $FunctionAppName --settings $settings -o none
    Assert-LastExit 'Zapis app settings do Function App selhal.'
    Write-Host 'App settings nastaveny: AAD_TENANT_ID, AAD_CLIENT_ID, AAD_CLIENT_SECRET, EP365_SETTINGS_SITE_URL.'

    # ----------------------------------------------------------------------
    # 9. Souhrn
    # ----------------------------------------------------------------------
    Write-Step 'Hotovo - souhrn'

    Write-Host ''
    Write-Host '====================================================================='
    Write-Host ' EP365 AI Chat - Znalostni priprava nakonfigurovana'
    Write-Host '====================================================================='
    Write-Host (' App registrace          : ' + $AppDisplayName)
    Write-Host (' Application (client) ID : ' + $appId)
    Write-Host (' Tenant ID               : ' + $tenantId)
    Write-Host (' Client secret           : ' + $clientSecret) -ForegroundColor Yellow
    Write-Host (' Expirace secretu        : cca ' + $secretExpiry + ' (poznamenejte si!)')
    if ($consentOk) {
        Write-Host ' Admin consent           : udelen'
    }
    else {
        Write-Host ' Admin consent           : NEUDELEN - dokoncete rucne v Entra portalu!' -ForegroundColor Yellow
    }
    Write-Host ' Per-site granty (manage):'
    foreach ($g in $grantResults) {
        Write-Host ('   - ' + $g.Url + '  [' + $g.Note + ']')
    }
    Write-Host (' Function App            : ' + $FunctionAppName + ' (app settings zapsany)')
    Write-Host '====================================================================='
    Write-Host ''
    Write-Host ' [VAROVANI] Client secret vyse se zobrazuje JEN TED - pokud ho chcete' -ForegroundColor Yellow
    Write-Host ' archivovat, ulozte si ho do trezoru hesel. Ve Function App uz je zapsany.' -ForegroundColor Yellow
    Write-Host ''
    Write-Host ' Dalsi kroky:'
    Write-Host ' 1. V appce EP365 AI Chat otevrete Nastaveni -> Parametry AI -> Znalostni'
    Write-Host '    priprava: zapnete ji a vyplnte seznam knihoven (absolutni URL, jedna'
    Write-Host '    na radek). Timer funkce enrich bezi jednou za hodinu.'
    Write-Host ' 2. Weby s knihovnami pridane pozdeji potrebuji novy grant - spustte tento'
    Write-Host '    skript znovu s parametrem -LibrarySiteUrls (existujici kroky se preskoci).'
    Write-Host ' 3. Pred expiraci secretu spustte skript znovu - vytvori novy secret'
    Write-Host '    a rovnou ho zapise do Function App.'
    Write-Host ''
}
catch {
    Write-Host ''
    Write-Host ('CHYBA: ' + $_.Exception.Message) -ForegroundColor Red
    Write-Host 'Konfigurace nebyla dokoncena. Po odstraneni priciny spustte skript znovu - je idempotentni.' -ForegroundColor Red
    exit 1
}
