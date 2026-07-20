<#
.SYNOPSIS
    Aktivuje Znalostni pripravu (enrich) pro EP365 AI Chat - app registrace v Entra ID,
    Graph permission Sites.Selected, per-site granty a app settings Function App.
    Entra a Graph operace bezi na Microsoft Graph PowerShell SDK (prihlaseni device code),
    zapis app settings na Azure CLI.

.DESCRIPTION
    Automatizuje kroky, ktere se jinak delaji rucne v Entra ID a Graph Exploreru
    (viz README.md, sekce "Znalostni priprava"). Poradi je navrzene tak, aby client
    secret vznikl AZ PO uspesnem udeleni per-site grantu - pri drivejsim selhani tedy
    nezustavaji osirele secrety (pripadny prave vytvoreny secret se pri chybe uklidi):
      1. Overeni Azure CLI (az login), volitelne prepnuti subscription a existence Function App.
      2. Kontrola a SROVNANI VERZI potrebnych submodulu Microsoft Graph PowerShell SDK
         (vsechny 4 se nactou v JEDNE verzi - jinak kolize .NET assembly).
      3. Prihlaseni do Microsoft Graphu (Connect-MgGraph, device code).
      4. App registrace - najde podle nazvu, jinak vytvori novou.
      5. Service principal aplikace (+ nacteni Graph SP a role id Sites.Selected).
      6. Sites.Selected do manifestu aplikace (requiredResourceAccess) + admin consent
         jako appRoleAssignment (vyzaduje privilegovanou roli - pri selhani vypise rucni
         postup a pokracuje).
      7. Per-site granty pres Graph (Get/New/Update-MgSitePermission) - settings web
         i vsechny weby z -LibrarySiteUrls; role se zveda na "manage" (nutne pro tvorbu
         sloupcu na knihovnach; pro samotny settings web by stacilo "write", "manage" ho pokryva).
      8. Novy client secret (Add-MgApplicationPassword) - vytvori se AZ kdyz granty proslo;
         hodnota se zapise rovnou do Function App a do konzole se NETISKNE (kvuli
         Start-Transcript); pro archivaci ji lze precist z app settings Function App.
      9. Zapis app settings do Function App: AAD_TENANT_ID, AAD_CLIENT_ID,
         AAD_CLIENT_SECRET, EP365_SETTINGS_SITE_URL (Azure CLI).
     10. Souhrn.

    Proc Microsoft Graph SDK a ne Azure CLI: per-site granty Sites.Selected potrebuji
    delegovany scope Sites.FullControl.All. Azure CLI (first-party klient) ho ziskat NESMI
    (AADSTS65002 - preauthorization lockdown), takze "az rest" na sites/{id}/permissions
    selze v kazdem prostredi vcetne Cloud Shellu. Graph SDK ma vlastni klientskou aplikaci,
    ktera tyto scope ziskat SMI. Connect-MgGraph s device code navic funguje i v Azure
    Cloud Shellu - na rozdil od implicitniho MSI tokenu, ktery ma spatnou audience pro
    Graph (proto tam driv padal az admin consent i az rest volani Graphu).

    Skript je idempotentni - existujici app registrace, permission i granty se preskoci
    nebo jen aktualizuji. Kazde spusteni ale vytvori NOVY client secret (chovani jako
    --append) a zapise ho do Function App; stare secrety lze smazat v Entra portalu.

    Weby s knihovnami pridane pozdeji potrebuji novy grant - spustte skript znovu
    s parametrem -LibrarySiteUrls.

    Prerekvizity:
      - PowerShell 5.1+ (Windows) nebo PowerShell 7 (Azure Cloud Shell).
      - Azure CLI (az) + prihlaseni (az login) uctem s pravem zapisovat App Settings
        do Function App (Azure RBAC Contributor na Function App / resource group).
      - Ucet s temito Entra rolemi (Connect-MgGraph si vyzada souhlas se scope):
        * Application Administrator (nebo vyssi) - app registrace, service principal, secret;
        * Privileged Role Administrator / Global Administrator - admin consent (appRoleAssignment);
        * SharePoint Administrator / Global Administrator - per-site granty (Sites.FullControl.All).
      - Function App uz nasazena (scripts/deploy-azure.ps1 nebo README.md).
      - Pristup na PowerShell Gallery, kdyz submoduly Microsoft.Graph.* jeste nejsou nainstalovane
        (nainstaluji se jen 4 potrebne submoduly do -Scope CurrentUser, ne cely Microsoft.Graph).

    Bezi i v Azure Cloud Shellu (PowerShell) - az je predinstalovane a prihlasene,
    Connect-MgGraph -UseDeviceCode vypise kod pro https://microsoft.com/devicelogin
    (nepotrebuje prohlizec primo na hostiteli Cloud Shellu):
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

# Submoduly Microsoft Graph PowerShell SDK - jen potrebne kusy, ne cely Microsoft.Graph.
$RequiredGraphModules = @(
    'Microsoft.Graph.Authentication',
    'Microsoft.Graph.Applications',
    'Microsoft.Graph.Sites',
    'Microsoft.Graph.Identity.DirectoryManagement'
)

# Delegovane scope, ktere Connect-MgGraph vyzada. Sites.FullControl.All je klicovy pro
# per-site granty - prave ten az CLI ziskat nesmi (viz .DESCRIPTION).
$GraphScopes = @(
    'Application.ReadWrite.All',
    'AppRoleAssignment.ReadWrite.All',
    'Sites.FullControl.All',
    'Directory.ReadWrite.All'
)

function Write-Step([string]$Text) {
    Write-Host ''
    Write-Host ('==> ' + $Text) -ForegroundColor Cyan
}

# PS 5.1 muze pri prvni instalaci modulu vyzadovat NuGet provider - best-effort bootstrap,
# aby Install-Module nespadl na interaktivni dotaz. Volatelne vickrat (je idempotentni).
function Initialize-NuGetProvider {
    try {
        if (-not (Get-PackageProvider -Name NuGet -ErrorAction SilentlyContinue)) {
            Install-PackageProvider -Name NuGet -MinimumVersion 2.8.5.201 -Scope CurrentUser -Force -ErrorAction Stop | Out-Null
        }
    }
    catch {
        Write-Host '[WARN] NuGet provider se nepodarilo pripravit automaticky - pokud instalace modulu selze, spustte ji rucne.' -ForegroundColor Yellow
    }
}

# Spusti Azure CLI odolne vuci varovanim na stderr a vrati exit code (nevyhazuje).
# Duvod: Windows PowerShell 5.1 bere pri $ErrorActionPreference='Stop' JAKYKOLI zapis
# nativniho prikazu na stderr (i benny WARNING) jako terminating error. Behem az volani
# proto docasne prepneme na 'Continue' a spolehame vyhradne na $LASTEXITCODE.
function Invoke-AzSoft {
    param([Parameter(Mandatory = $true)][string[]]$AzArgs)
    $prev = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        & az @AzArgs
        return $LASTEXITCODE
    }
    finally {
        $ErrorActionPreference = $prev
    }
}

# Slozene (composite) site id webu pres Graph path-based adresovani.
# Get-MgSite -SiteId prijima tvar "hostname:/server-relativni-cesta" (root web = jen hostname).
function Get-CompositeSiteId([string]$SiteUrl) {
    $uri = [Uri]$SiteUrl
    $siteHost = $uri.Host
    $sitePath = $uri.AbsolutePath.TrimEnd('/')
    if ($sitePath -eq '' -or $sitePath -eq '/') {
        $siteIdArg = $siteHost
    }
    else {
        $siteIdArg = $siteHost + ':' + $sitePath
    }
    $site = Get-MgSite -SiteId $siteIdArg -ErrorAction Stop
    if ($null -eq $site -or [string]::IsNullOrEmpty($site.Id)) {
        throw ('Graph nevratil site id pro ' + $SiteUrl + ' - zkontrolujte URL a sva opravneni k SharePointu.')
    }
    return $site.Id
}

# Stav pro pripadny uklid pri chybe (musi byt v scope catch bloku).
$appObjectId = $null          # object id app registrace (pro Update/Add/Remove-MgApplication*)
$createdSecretKeyId = $null   # keyId prave vytvoreneho secretu
$appSettingsWritten = $false  # true az kdyz je secret bezpecne zapsany do Function App
$graphConnected = $false
$scriptFailed = $false
$needsSessionRestart = $false # true u chyb tridy "assembly already loaded" - rerun nepomuze

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
    # 1. Azure CLI + prihlaseni + subscription + Function App existuje
    #    (App Settings zapisuje az; per-site granty resi az Graph SDK nize.)
    # ----------------------------------------------------------------------
    Write-Step 'Kontrola Azure CLI a prihlaseni'

    $azCmd = Get-Command az -ErrorAction SilentlyContinue
    if ($null -eq $azCmd) {
        Write-Host 'Azure CLI (az) neni nainstalovane nebo neni v PATH.' -ForegroundColor Red
        Write-Host 'Instalace: https://learn.microsoft.com/cli/azure/install-azure-cli'
        Write-Host 'Po instalaci spustte: az login   a pote tento skript znovu.'
        exit 1
    }

    if ((Invoke-AzSoft @('account', 'show', '-o', 'none')) -ne 0) {
        Write-Host 'Nejste prihlaseni do Azure CLI.' -ForegroundColor Red
        Write-Host 'Spustte: az login              (prihlaseni do Azure)'
        Write-Host 'Pripadne: az login --tenant <tenant-id>'
        Write-Host 'A pote spustte tento skript znovu.'
        exit 1
    }

    if ($SubscriptionId -ne '') {
        if ((Invoke-AzSoft @('account', 'set', '--subscription', $SubscriptionId)) -ne 0) {
            throw ('Nepodarilo se prepnout na subscription ' + $SubscriptionId + '.')
        }
    }

    Write-Host ('Overuji Function App "' + $FunctionAppName + '" v resource group "' + $ResourceGroupName + '"...')
    if ((Invoke-AzSoft @('functionapp', 'show', '-g', $ResourceGroupName, '-n', $FunctionAppName, '-o', 'none')) -ne 0) {
        throw ('Function App "' + $FunctionAppName + '" v resource group "' + $ResourceGroupName + '" nenalezena. Nejdriv nasadte backend (scripts/deploy-azure.ps1).')
    }
    Write-Host 'Function App nalezena.'

    # ----------------------------------------------------------------------
    # 2. Microsoft Graph PowerShell SDK - kontrola a SROVNANI VERZI submodulu
    #
    #    Vsechny 4 submoduly se MUSI nacist ve STEJNE verzi. Kazdy submodul zavisi na
    #    konkretni verzi Microsoft.Graph.Authentication; nacteni dvou ruznych verzi tehoz
    #    .NET assembly konci chybou "Assembly with same name is already loaded". Takove
    #    assembly uz nejde vylozit - v teze session pomuze JEN restart session (novy
    #    PowerShell / novy Cloud Shell), NE opakovane spusteni skriptu.
    #    V Cloud Shellu byva cast submodulu predinstalovana (napr. 2.38.0); doinstalovat
    #    chybejici v novejsi verzi (2.38.1) by kolidovalo (i patch rozdil) - proto vsechny
    #    srovname na JEDNU verzi: verzi uz pritomneho Microsoft.Graph.Authentication (jadro,
    #    na nem visi vsechny submoduly), jinak nejnovejsi nainstalovanou.
    # ----------------------------------------------------------------------
    Write-Step 'Kontrola a srovnani verzi modulu Microsoft Graph PowerShell SDK'

    $authModuleName = 'Microsoft.Graph.Authentication'

    # Dostupne (nainstalovane) verze kazdeho submodulu, nejnovejsi prvni.
    $installedVersions = @{}
    foreach ($m in $RequiredGraphModules) {
        $installedVersions[$m] = @(
            Get-Module -ListAvailable -Name $m |
                Sort-Object Version -Descending |
                Select-Object -ExpandProperty Version
        )
    }

    # Cilova verze = verze uz pritomneho Microsoft.Graph.Authentication (nejvyssi, kdyz je
    # jich vic). Kdyz Authentication chybi, nainstaluj nejnovejsi a jeho verzi pouzij jako cil.
    $targetVersion = $null
    if ($installedVersions[$authModuleName].Count -gt 0) {
        $targetVersion = $installedVersions[$authModuleName][0]
        Write-Host ('Pritomny ' + $authModuleName + ' ' + $targetVersion + ' - na tuto verzi srovnam vsechny 4 submoduly.')
    }
    else {
        Write-Host ($authModuleName + ' neni nainstalovan - instaluji nejnovejsi (-Scope CurrentUser)...')
        Initialize-NuGetProvider
        try {
            Install-Module -Name $authModuleName -Scope CurrentUser -Force -AllowClobber -ErrorAction Stop
        }
        catch {
            throw ('Instalace modulu ' + $authModuleName + ' selhala: ' + $_.Exception.Message +
                ' Nainstalujte ho rucne: Install-Module ' + $authModuleName + ' -Scope CurrentUser')
        }
        $targetVersion = @(
            Get-Module -ListAvailable -Name $authModuleName |
                Sort-Object Version -Descending |
                Select-Object -ExpandProperty Version
        )[0]
        if ($null -eq $targetVersion) {
            throw ('Modul ' + $authModuleName + ' se po instalaci nepodarilo najit.')
        }
        $installedVersions[$authModuleName] = @($targetVersion)
        Write-Host ('Nainstalovan ' + $authModuleName + ' ' + $targetVersion + '.')
    }

    # Uz nactena Graph verze v TETO session? Kdyz se lisi od cilove, import zkolabuje na
    # "assembly already loaded" a nactenou verzi nelze vylozit - jedine reseni je restart
    # session, rerun nepomuze.
    $conflictingLoaded = @(
        Get-Module -Name 'Microsoft.Graph.*' | Where-Object { $_.Version -ne $targetVersion }
    )
    if ($conflictingLoaded.Count -gt 0) {
        $loadedList = (($conflictingLoaded | ForEach-Object { $_.Name + ' ' + $_.Version }) -join ', ')
        $needsSessionRestart = $true
        throw ('V teto session je uz nactena jina verze Graph modulu (' + $loadedList + ') nez cilova ' +
            $targetVersion + '. Dve verze teze .NET assembly nelze nacist naraz a nactenou nelze vylozit. ' +
            'Zavrete tuto session a spustte skript v NOVE (novy PowerShell / novy Cloud Shell).')
    }

    # Srovnej vsechny 4 submoduly na cilovou verzi: chybejici NA CILOVE VERZI doinstaluj
    # s -RequiredVersion (predinstalovane jine verze necham byt, nactu jen cilovou).
    foreach ($m in $RequiredGraphModules) {
        if ($installedVersions[$m] -contains $targetVersion) {
            Write-Host ('  ' + $m + ' ' + $targetVersion + ' - pritomen.')
            continue
        }
        Write-Host ('  ' + $m + ' - instaluji verzi ' + $targetVersion + ' (-RequiredVersion, -Scope CurrentUser)...')
        Initialize-NuGetProvider
        try {
            Install-Module -Name $m -RequiredVersion $targetVersion -Scope CurrentUser -Force -AllowClobber -ErrorAction Stop
        }
        catch {
            # Verzi se nepodarilo srovnat (napr. neni na Gallery / ruzny major) - bez shody
            # verzi nema smysl importovat, hrozila by kolize assembly.
            $needsSessionRestart = $true
            throw ('Nepodarilo se srovnat modul ' + $m + ' na verzi ' + $targetVersion + ': ' + $_.Exception.Message +
                ' Vsechny submoduly Microsoft.Graph musi byt ve STEJNE verzi. Zkuste rucne: Install-Module ' + $m +
                ' -RequiredVersion ' + $targetVersion + ' -Scope CurrentUser (nebo cely balik na jednu verzi), pak restartujte session.')
        }
    }

    # Import VSECH na cilove verzi - jednotna verze = zadna kolize assembly.
    foreach ($m in $RequiredGraphModules) {
        try {
            Import-Module -Name $m -RequiredVersion $targetVersion -ErrorAction Stop
        }
        catch {
            $needsSessionRestart = $true
            throw ('Nacteni modulu ' + $m + ' (' + $targetVersion + ') selhalo: ' + $_.Exception.Message +
                ' Pokud jde o "Assembly with same name is already loaded", RESTARTUJTE session (novy PowerShell / Cloud Shell) - rerun v teze session nepomuze.')
        }
    }
    Write-Host ('Moduly pripraveny (vsechny ve verzi ' + $targetVersion + ').')

    # ----------------------------------------------------------------------
    # 3. Prihlaseni do Microsoft Graphu (device code - funguje lokalne i v Cloud Shellu)
    # ----------------------------------------------------------------------
    Write-Step 'Prihlaseni do Microsoft Graphu (Connect-MgGraph, device code)'
    Write-Host 'Otevrete https://microsoft.com/devicelogin a zadejte kod, ktery se vypise nize.'

    Connect-MgGraph -Scopes $GraphScopes -UseDeviceCode -ErrorAction Stop
    $graphConnected = $true

    $mgContext = Get-MgContext
    if ($null -eq $mgContext -or [string]::IsNullOrEmpty($mgContext.TenantId)) {
        throw 'Prihlaseni do Microsoft Graphu se nezdarilo (prazdny kontext).'
    }
    $tenantId = $mgContext.TenantId
    Write-Host ('Prihlaseni do Graphu OK - tenant: ' + $tenantId)

    # ----------------------------------------------------------------------
    # 4. App registrace
    # ----------------------------------------------------------------------
    Write-Step ('App registrace "' + $AppDisplayName + '"')

    # Escapovani jednoduchych uvozovek v nazvu kvuli OData filtru.
    $displayNameFilter = $AppDisplayName.Replace("'", "''")
    $existingApps = @(Get-MgApplication -Filter ("displayName eq '" + $displayNameFilter + "'") -All -ErrorAction Stop)

    $createdApp = $false
    $appClientId = ''
    if ($existingApps.Count -gt 0) {
        $appObjectId = $existingApps[0].Id
        $appClientId = $existingApps[0].AppId
        Write-Host ('App registrace uz existuje - appId ' + $appClientId)
        if ($existingApps.Count -gt 1) {
            Write-Host ('[WARN] Nalezeno vice app registraci se jmenem "' + $AppDisplayName + '" - pouzivam prvni.') -ForegroundColor Yellow
        }
    }
    else {
        Write-Host 'App registrace neexistuje - vytvarim novou...'
        $newApp = New-MgApplication -DisplayName $AppDisplayName -SignInAudience 'AzureADMyOrg' -ErrorAction Stop
        $appObjectId = $newApp.Id
        $appClientId = $newApp.AppId
        $createdApp = $true
        Write-Host ('Vytvoreno - appId ' + $appClientId)
    }

    # ----------------------------------------------------------------------
    # 5. Service principal aplikace + Graph SP + role id Sites.Selected
    # ----------------------------------------------------------------------
    Write-Step 'Service principal'

    $createdSp = $false
    $appSps = @(Get-MgServicePrincipal -Filter ("appId eq '" + $appClientId + "'") -ErrorAction Stop)
    if ($appSps.Count -eq 0) {
        $appSp = New-MgServicePrincipal -AppId $appClientId -ErrorAction Stop
        $appSpId = $appSp.Id
        $createdSp = $true
        Write-Host 'Service principal vytvoren.'
    }
    else {
        $appSpId = $appSps[0].Id
        Write-Host 'Service principal uz existuje.'
    }

    # Graph service principal - z nej bereme resource id (pro appRoleAssignment)
    # a id app role Sites.Selected.
    $graphSp = Get-MgServicePrincipal -Filter ("appId eq '" + $GraphResourceAppId + "'") -ErrorAction Stop
    if ($null -eq $graphSp -or [string]::IsNullOrEmpty($graphSp.Id)) {
        throw 'Nepodarilo se nacist service principal Microsoft Graphu v tomto tenantu.'
    }
    $graphSpId = $graphSp.Id

    $sitesSelectedRole = $graphSp.AppRoles | Where-Object { $_.Value -eq 'Sites.Selected' -and ($_.AllowedMemberTypes -contains 'Application') }
    if ($sitesSelectedRole -and $sitesSelectedRole.Id) {
        $sitesSelectedRoleId = $sitesSelectedRole.Id
        Write-Host ('Role id Sites.Selected: ' + $sitesSelectedRoleId)
    }
    else {
        $sitesSelectedRoleId = $SitesSelectedFallbackRoleId
        Write-Host ('[WARN] Role id se nepodarilo zjistit dynamicky - pouzivam zname id ' + $sitesSelectedRoleId + '.') -ForegroundColor Yellow
    }

    # ----------------------------------------------------------------------
    # 6. Sites.Selected do manifestu aplikace (requiredResourceAccess) + admin consent
    # ----------------------------------------------------------------------
    Write-Step 'Graph application permission Sites.Selected (manifest aplikace)'

    # Precti aktualni requiredResourceAccess a idempotentne zajisti Graph/Sites.Selected (Role).
    $app = Get-MgApplication -ApplicationId $appObjectId -ErrorAction Stop
    $hasSitesSelected = $false
    $rraList = @()
    if ($app.RequiredResourceAccess) {
        foreach ($rra in $app.RequiredResourceAccess) {
            $raList = @()
            if ($rra.ResourceAccess) {
                foreach ($ra in $rra.ResourceAccess) {
                    $raList += @{ id = $ra.Id; type = $ra.Type }
                    if ($rra.ResourceAppId -eq $GraphResourceAppId -and $ra.Id -eq $sitesSelectedRoleId -and $ra.Type -eq 'Role') {
                        $hasSitesSelected = $true
                    }
                }
            }
            $rraList += @{ resourceAppId = $rra.ResourceAppId; resourceAccess = $raList }
        }
    }

    if ($hasSitesSelected) {
        Write-Host 'Sites.Selected uz je v manifestu aplikace - preskakuji.'
    }
    else {
        # Pridej Graph Sites.Selected. Kdyz uz blok pro Graph existuje, pridej do nej roli;
        # jinak vytvor novy blok. Ostatni pripadna opravneni zustanou zachovana.
        $graphBlock = $null
        foreach ($b in $rraList) { if ($b.resourceAppId -eq $GraphResourceAppId) { $graphBlock = $b } }
        if ($null -eq $graphBlock) {
            $rraList += @{ resourceAppId = $GraphResourceAppId; resourceAccess = @(@{ id = $sitesSelectedRoleId; type = 'Role' }) }
        }
        else {
            $graphBlock.resourceAccess += @{ id = $sitesSelectedRoleId; type = 'Role' }
        }
        Update-MgApplication -ApplicationId $appObjectId -RequiredResourceAccess $rraList -ErrorAction Stop
        Write-Host 'Sites.Selected pridano do manifestu aplikace.'
    }

    # Admin consent = appRoleAssignment (aplikace = principal i "assignedTo", Graph = resource).
    Write-Step 'Admin consent (appRoleAssignment Sites.Selected)'

    if ($createdApp -or $createdSp) {
        Write-Host 'Nova aplikace / SP - cekam 15 sekund na replikaci v Entra ID...'
        Start-Sleep -Seconds 15
    }

    $consentOk = $false
    try {
        $assignments = @(Get-MgServicePrincipalAppRoleAssignment -ServicePrincipalId $appSpId -ErrorAction Stop)
        $already = $false
        foreach ($a in $assignments) {
            if ($a.AppRoleId -eq $sitesSelectedRoleId -and $a.ResourceId -eq $graphSpId) { $already = $true }
        }
        if ($already) {
            Write-Host 'Admin consent uz je udelen (appRoleAssignment existuje) - preskakuji.'
            $consentOk = $true
        }
        else {
            New-MgServicePrincipalAppRoleAssignment -ServicePrincipalId $appSpId `
                -PrincipalId $appSpId -ResourceId $graphSpId -AppRoleId $sitesSelectedRoleId -ErrorAction Stop | Out-Null
            Write-Host 'Admin consent udelen (appRoleAssignment vytvoren).'
            $consentOk = $true
        }
    }
    catch {
        Write-Host '[WARN] Admin consent se nepodarilo udelit.' -ForegroundColor Yellow
        Write-Host ('       Duvod: ' + $_.Exception.Message) -ForegroundColor Yellow
        Write-Host '       Vyzaduje roli Global Administrator nebo Privileged Role Administrator.' -ForegroundColor Yellow
        Write-Host '       Rucni postup: Entra ID -> App registrations ->' -ForegroundColor Yellow
        Write-Host ('       "' + $AppDisplayName + '" -> API permissions -> Grant admin consent.') -ForegroundColor Yellow
        Write-Host '       Skript pokracuje - consent lze udelit i pozdeji (do te doby enrich nepobezi).' -ForegroundColor Yellow
    }

    # ----------------------------------------------------------------------
    # 7. Per-site granty (settings web + weby s knihovnami)
    #    Delame je PRED vytvorenim secretu - kdyz selzou, secret vubec nevznikne.
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

        $siteId = Get-CompositeSiteId $siteUrl
        Write-Host ('  Site id: ' + $siteId)

        # Existujici granty webu - hledame ten pro nasi aplikaci (podle appId / client id).
        $perms = @(Get-MgSitePermission -SiteId $siteId -ErrorAction Stop)
        $existingPerm = $null
        foreach ($p in $perms) {
            $isOurs = $false
            if ($p.GrantedToIdentities) {
                foreach ($gi in $p.GrantedToIdentities) {
                    if ($gi.Application -and $gi.Application.Id -eq $appClientId) { $isOurs = $true }
                }
            }
            if ($p.GrantedToIdentitiesV2) {
                foreach ($gi in $p.GrantedToIdentitiesV2) {
                    if ($gi.Application -and $gi.Application.Id -eq $appClientId) { $isOurs = $true }
                }
            }
            if ($isOurs) { $existingPerm = $p }
        }

        $resultNote = ''
        if ($null -ne $existingPerm) {
            $roles = @()
            if ($existingPerm.Roles) { $roles = @($existingPerm.Roles) }

            if (($roles -contains 'manage') -or ($roles -contains 'fullcontrol')) {
                Write-Host ('  Grant uz existuje s roli "' + ($roles -join ', ') + '" - beze zmeny.')
                $resultNote = 'existoval (' + ($roles -join ', ') + ') - beze zmeny'
            }
            else {
                Write-Host ('  Grant existuje s roli "' + ($roles -join ', ') + '" - zvedam na manage...')
                Update-MgSitePermission -SiteId $siteId -PermissionId $existingPerm.Id -BodyParameter @{ roles = @('manage') } -ErrorAction Stop
                Write-Host '  Role zvednuta na manage.'
                $resultNote = 'existoval - role zvednuta na manage'
            }
        }
        else {
            # Novy grant: POST umi jen read/write, vyssi role "manage" se nastavuje naslednym PATCHem.
            Write-Host '  Grant neexistuje - vytvarim (write) a zvedam na manage...'
            $permBody = @{
                roles               = @('write')
                grantedToIdentities = @(
                    @{ application = @{ id = $appClientId; displayName = $AppDisplayName } }
                )
            }
            $newPerm = New-MgSitePermission -SiteId $siteId -BodyParameter $permBody -ErrorAction Stop
            if ($null -eq $newPerm -or [string]::IsNullOrEmpty($newPerm.Id)) {
                throw ('Graph nevratil id noveho grantu pro ' + $siteUrl + '.')
            }
            Update-MgSitePermission -SiteId $siteId -PermissionId $newPerm.Id -BodyParameter @{ roles = @('manage') } -ErrorAction Stop
            Write-Host '  Grant vytvoren s roli manage.'
            $resultNote = 'novy grant (manage)'
        }

        $grantResults += New-Object PSObject -Property @{ Url = $siteUrl; Note = $resultNote }
    }

    # ----------------------------------------------------------------------
    # 8. Client secret (az PO uspesnych grantech)
    # ----------------------------------------------------------------------
    Write-Step ('Client secret (platnost ' + $SecretYears + ' r.)')

    $pwdCred = @{
        displayName = 'enrich'
        endDateTime = (Get-Date).AddYears($SecretYears)
    }
    $cred = Add-MgApplicationPassword -ApplicationId $appObjectId -PasswordCredential $pwdCred -ErrorAction Stop
    $clientSecret = $cred.SecretText
    if ([string]::IsNullOrEmpty($clientSecret)) {
        throw 'Add-MgApplicationPassword nevratil hodnotu secretu.'
    }
    $createdSecretKeyId = $cred.KeyId   # od ted uklidime secret, kdyz cokoli dalsiho selze
    $secretExpiry = (Get-Date).AddYears($SecretYears).ToString('yyyy-MM-dd')

    Write-Host '[INFO] Novy client secret vznikl a bude zapsan do Function App (AAD_CLIENT_SECRET).' -ForegroundColor Yellow
    Write-Host '[INFO] Hodnota se ZAMERNE netiskne do konzole (kvuli Start-Transcript).' -ForegroundColor Yellow
    Write-Host ('[VAROVANI] Poznamenejte si datum expirace (cca ' + $secretExpiry + ') - pred vyprsenim') -ForegroundColor Yellow
    Write-Host '[VAROVANI] spustte tento skript znovu (vytvori novy secret a zapise ho do Function App).' -ForegroundColor Yellow

    # ----------------------------------------------------------------------
    # 9. App settings Function App (Azure CLI - Azure resource operace)
    # ----------------------------------------------------------------------
    Write-Step ('Zapis app settings do Function App "' + $FunctionAppName + '"')

    $settings = @(
        ('AAD_TENANT_ID=' + $tenantId),
        ('AAD_CLIENT_ID=' + $appClientId),
        ('AAD_CLIENT_SECRET=' + $clientSecret),
        ('EP365_SETTINGS_SITE_URL=' + $SettingsSiteUrl)
    )
    $setArgs = @('functionapp', 'config', 'appsettings', 'set', '-g', $ResourceGroupName, '-n', $FunctionAppName, '--settings') + $settings + @('-o', 'none')
    if ((Invoke-AzSoft $setArgs) -ne 0) {
        throw 'Zapis app settings do Function App selhal.'
    }
    $appSettingsWritten = $true   # secret je bezpecne ulozeny - uz ho pri chybe neuklizime
    Write-Host 'App settings nastaveny: AAD_TENANT_ID, AAD_CLIENT_ID, AAD_CLIENT_SECRET, EP365_SETTINGS_SITE_URL.'

    # ----------------------------------------------------------------------
    # 10. Souhrn
    # ----------------------------------------------------------------------
    Write-Step 'Hotovo - souhrn'

    Write-Host ''
    Write-Host '====================================================================='
    Write-Host ' EP365 AI Chat - Znalostni priprava nakonfigurovana'
    Write-Host '====================================================================='
    Write-Host (' App registrace          : ' + $AppDisplayName)
    Write-Host (' Application (client) ID : ' + $appClientId)
    Write-Host (' Tenant ID               : ' + $tenantId)
    Write-Host ' Client secret           : zapsan do Function App (AAD_CLIENT_SECRET)'
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
    Write-Host ' [INFO] Client secret se do konzole zamerne netiskne (kvuli Start-Transcript,' -ForegroundColor Yellow
    Write-Host '        aby neskoncil v logu). Je ulozeny ve Function App jako app setting' -ForegroundColor Yellow
    Write-Host '        AAD_CLIENT_SECRET - pro archivaci do trezoru hesel ho vezmete odtud' -ForegroundColor Yellow
    Write-Host '        (az functionapp config appsettings list). Rotace = spustte tento skript znovu.' -ForegroundColor Yellow
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

    # Uklid osirele secretu: vznikl-li secret, ale nedostal se do Function App, smaz ho,
    # at v Entra nezustavaji nepouzitelne credentials.
    if (($null -ne $createdSecretKeyId) -and (-not $appSettingsWritten) -and ($null -ne $appObjectId)) {
        Write-Host 'Uklizim prave vytvoreny client secret (nebyl zapsan do Function App)...' -ForegroundColor Yellow
        try {
            Remove-MgApplicationPassword -ApplicationId $appObjectId -KeyId $createdSecretKeyId -ErrorAction Stop
            Write-Host 'Docasny secret smazan.' -ForegroundColor Yellow
        }
        catch {
            Write-Host ('[WARN] Docasny secret se nepodarilo smazat (KeyId ' + $createdSecretKeyId + ') - smazte ho rucne v Entra portalu.') -ForegroundColor Yellow
        }
    }

    if ($needsSessionRestart) {
        Write-Host 'Konfigurace nebyla dokoncena - jde o konflikt VERZI / nacteni Graph modulu.' -ForegroundColor Red
        Write-Host 'ZAVRETE tuto session a spustte skript v NOVE (novy PowerShell / novy Cloud Shell).' -ForegroundColor Red
        Write-Host 'Opakovane spusteni v teze session NEPOMUZE - nactenou .NET assembly nelze vylozit.' -ForegroundColor Red
    }
    else {
        Write-Host 'Konfigurace nebyla dokoncena. Po odstraneni priciny spustte skript znovu - je idempotentni.' -ForegroundColor Red
    }
    $scriptFailed = $true
}
finally {
    if ($graphConnected) {
        try { Disconnect-MgGraph -ErrorAction SilentlyContinue | Out-Null }
        catch { Write-Verbose ('Disconnect-MgGraph: ' + $_.Exception.Message) }
    }
}

if ($scriptFailed) { exit 1 }
