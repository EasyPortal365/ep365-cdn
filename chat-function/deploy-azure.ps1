<#
.SYNOPSIS
    Nasadi kompletni Azure backend pro EP365 AI Chat (ep365-chat-function) u zakaznika.

.DESCRIPTION
    Skript provede:
      1. Overeni prihlaseni do Azure CLI (az login) a volitelne nastaveni subscription.
      2. Vytvoreni resource group (idempotentni).
      3. Azure OpenAI:
         - kdyz predate -AzureOpenAiEndpoint + -AzureOpenAiKey, pouzije se existujici ucet;
         - jinak skript vytvori novy Azure OpenAI ucet + model deployment (default gpt-5-mini).
      4. Nasazeni infrastruktury (Function App, Storage Account, Application Insights,
         App Settings) - lokalni infra/main.bicep, nebo (kdyz skript nebezi v repu)
         ARM sablona z CDN EasyPortal365.
      5. Nasazeni kodu funkce (vzdy s WEBSITE_RUN_FROM_PACKAGE=1, viz nize):
         - v repu se zdrojaky: build (npm) + func publish / zip deploy jako dosud;
         - mimo repo (napr. Azure Cloud Shell): stazeni hotoveho release zipu z CDN
           EasyPortal365 a zip deploy - Node.js NENI potreba.
      6. Smoke test - zkusebni dotaz na /api/chat (overi endpoint, klic i model;
         spotrebuje par tokenu; preskocit lze prepinacem -SkipSmokeTest).
      7. Vypis API URL pro property pane webpartu EP365 AI Chat.

    Doporucene prostredi: Azure Cloud Shell (PowerShell) - az CLI je predinstalovane,
    nic se neinstaluje. Staci:
      iwr https://cdn.easyportal365.cz/chat-function/deploy-azure.ps1 -OutFile deploy-azure.ps1
      ./deploy-azure.ps1 -ResourceGroupName rg-contoso-ai -FunctionAppName func-contoso-ai `
          -AllowedOrigin https://contoso.sharepoint.com

    Opakovane spusteni je bezpecne - existujici prostredky se preskoci nebo aktualizuji.

    App Settings pri redeployi: skript si je pred nasazenim sablony sam zazalohuje a po
    nasazeni obnovi (AAD_*, Znalostni priprava, readUrl allowlist, billing, hub...), takze
    redeploy uz je nesmaze. Zadany parametr (-AadTenantId/-SettingsSiteUrl atd.) ma prednost.

    WEBSITE_RUN_FROM_PACKAGE=1: tato cesta nasazuje kod zip deployem, takze instance bezi
    z balicku ULOZENEHO V AZURE (ne z URL na CDN - to je rezim tlacitka Deploy to Azure).
    Kudu balicek jen ulozi a atomicky namountuje misto rozbalovani do beziciho wwwroot, kde
    by na Windows zamky poskodily .js a instance by skoncila na 503 (lessons 26.1). Kdyz
    tedy instance drive bezela z CDN URL, tenhle skript ji tu runtime zavislost odebere.
    Behem redeploye je mezi nasazenim sablony a nahranim kodu kratke okno (desitky sekund),
    kdy instance balicek jeste nema - to je ocekavane.

    Prerekvizity:
      - Azure CLI (az) - https://learn.microsoft.com/cli/azure/install-azure-cli
        (v Azure Cloud Shellu uz je)
      - ucet s pravy vytvaret resource groups a prostredky v subscription
      - kvota pro Azure OpenAI v cilovem regionu (jen kdyz se ucet vytvari novy)
      - JEN pri behu v repu se zdrojaky: Node.js 22 + npm (build kodu); volitelne
        Azure Functions Core Tools v4 (func) - rychlejsi publikace

.PARAMETER ResourceGroupName
    Povinny. Nazev resource group (vytvori se, pokud neexistuje).

.PARAMETER FunctionAppName
    Povinny. Globalne unikatni nazev Function App (napr. func-contoso-ai).

.PARAMETER AllowedOrigin
    Povinny. Origin SharePoint tenantu pro CORS, napr. https://contoso.sharepoint.com
    (vic originu oddelte carkou). Funkce je fail-closed - bez teto hodnoty by prohlizec
    volani chatu odmitl.

.PARAMETER PackageUrl
    Volitelny. URL release zip balicku s kodem funkce. Kdyz je zadany, kod se NEbuildi
    ze zdrojaku, ale stahne se tento zip a nasadi pres zip deploy. Kdyz neni zadany
    a skript nebezi v repu se zdrojaky, pouzije se aktualni release zip z CDN
    EasyPortal365 automaticky.

.PARAMETER Location
    Azure region pro Function App a podpurne zdroje. Default: westeurope.
    Kdyz resource group uz existuje v jinem regionu, skript ji NEPRESOUVA (to Azure neumi)
    ani neselze - jen upozorni; region RG je jen metadata, zdroje vzniknou v -Location.

.PARAMETER PlanSku
    SKU App Service planu Function App. Default Y1 = Consumption (serverless, plati se jen
    za beh) - doporucene. CERSTVA subscription ma ale pro Y1 casto nulovou kvotu a deployment
    spadne na "SubscriptionIsOverQuotaForSku / Current Limit (Y1 VMs): 0".
    Kvota se vede per subscription A ZAROVEN per region, takze prvni vec, kterou zkusit, je
    JINY REGION (-Location) - overeno: tataz subscription mela northeurope 0 a westeurope
    kvotu k dispozici. Kdyz skript na kvotu spadne, sam zkusi ostatni z petice westeurope /
    northeurope / germanywestcentral / swedencentral / francecentral a doporuci ten, kde kvota
    je; o dalsich regionech Azure nerika nic. Az kdyz kvotu nema ani jeden z NICH, prichazi na
    radu tenhle parametr (jina kvotova rodina) nebo zadost o navyseni kvoty - ta ale nemusi
    projit self-service, viz README, cast "Nova Azure subscription".
    B1 = nejlevnejsi vzdy bezici plan (pevna mesicni cena), dal B2 / S1 / P0v3 / EP1.
    POZOR: hodnotu jinou nez Y1 zvladne jen sablona z teto verze - pri behu proti starsi
    ARM sablone na CDN skript skonci chybou o neznamem parametru.

.PARAMETER SkipProviderCheck
    Volitelny. Preskoci uvodni registraci resource providers. Pouzijte, kdyz ucet nema pravo
    registrovat providery na subscription (registraci udela admin predem) - viz README.

.PARAMETER PurgeSoftDeletedOpenAi
    Volitelny a DESTRUKTIVNI. Kdyz Azure OpenAI ucet stejneho jmena existuje ve stavu
    "soft-deleted" (chyba FlagMustBeSetForRestore), skript ho standardne jen ohlasi a skonci.
    S timto prepinacem ho TRVALE SMAZE (purge) a zalozi cisty novy. Data smazaneho uctu
    (vcetne fine-tunovanych modelu) uz nepujdou obnovit. Bez prepinace se nic nemaze.

.PARAMETER SubscriptionId
    Volitelny. Id subscription, pokud nechcete nasazovat do aktualne vybrane.

.PARAMETER AzureOpenAiEndpoint
    Volitelny. URL existujiciho Azure OpenAI uctu (https://contoso-openai.openai.azure.com).
    Zadava se SPOLU s -AzureOpenAiKey. Kdyz chybi, skript ucet vytvori sam.

.PARAMETER AzureOpenAiKey
    Volitelny. API klic existujiciho Azure OpenAI uctu.

.PARAMETER AzureOpenAiDeployment
    Nazev model deploymentu v Azure OpenAI. Kdyz nezadano, odvodi se od -OpenAiModelName
    (default gpt-5-mini). DULEZITE: u reasoning modelu (gpt-5* / o-rada) MUSI jmeno
    deploymentu zacinat "gpt-5"/"o" - runtime funkce podle nej voli API kontrakt; pod
    klasickym jmenem (napr. gpt-4o) by gpt-5 model dotaz odmitl.

.PARAMETER OpenAiAccountName
    Nazev noveho Azure OpenAI uctu (jen kdyz se vytvari). Default: <FunctionAppName>-openai.

.PARAMETER OpenAiLocation
    Region noveho Azure OpenAI uctu. Default: swedencentral.

.PARAMETER OpenAiModelName
    Model pro novy deployment. Default: gpt-5-mini. Dostupne GA modely v regionu vypisete:
    az cognitiveservices model list -l <region> --query "[?kind=='OpenAI' && model.lifecycleStatus=='GenerallyAvailable'].{Model:model.name, Verze:model.version}" -o table

.PARAMETER OpenAiModelVersion
    Verze modelu pro novy deployment. Kdyz NENI zadana, skript si sam zjisti nejnovejsi GA
    verzi modelu v cilovem regionu (napevno zadana verze casem zastarava). Kdyz je zadana
    explicitne, pouzije se presne ta. Fallback pri neuspechu dotazu: 2025-08-07.

.PARAMETER OpenAiSkuName
    SKU model deploymentu. Default: GlobalStandard.

.PARAMETER OpenAiSkuCapacity
    Kapacita deploymentu (v tisicich tokenu za minutu, TPM). Default: 50.

    TPM je RYCHLOSTNI strop, ne rezervace - u SKU GlobalStandard se plati za skutecne
    spotrebovane tokeny, takze vyssi kapacita sama o sobe nic nestoji. Drzet ji nizko
    tedy nesetri nic a jen lame provoz: jeden dotaz nad firemnimi znalostmi ma prompt
    v desetitisicich tokenu (rozpocet zpravy je 32 000 znaku), takze na 10 TPM narazi
    na limit SAM O SOBE, i kdyz se nikdo dalsi nepta - Azure OpenAI vrati 429 a appka
    hlasi "AI sluzba dotaz odmitla kvuli limitu kapacity". Presne to se stalo prvnimu
    zakaznikovi s AI backendem (2026-09-17), protoze default byl 10; lekce 26.7 bod 3
    to popsala dva mesice predem. Skript nove pred zalozenim deploymentu ZMERI zbyvajici
    kvotu v regionu a kdyz na pozadovanou kapacitu nestaci, sestoupi na dostupnou misto
    padu na InsufficientQuota.

.PARAMETER AadTenantId
    Volitelny - Znalostni priprava. Entra ID tenant id (viz scripts/setup-enrichment.ps1).

.PARAMETER AadClientId
    Volitelny - Znalostni priprava. Application (client) ID app registrace.

.PARAMETER AadClientSecret
    Volitelny - Znalostni priprava. Client secret app registrace.

.PARAMETER SettingsSiteUrl
    Volitelny - Znalostni priprava. URL webu se settings listem EP365AIChatAppSettings.

.PARAMETER SkipSmokeTest
    Volitelny. Preskoci zaverecny zkusebni dotaz na /api/chat.

.EXAMPLE
    .\deploy-azure.ps1 -ResourceGroupName rg-contoso-ai -FunctionAppName func-contoso-ai `
        -AllowedOrigin https://contoso.sharepoint.com

.EXAMPLE
    .\deploy-azure.ps1 -ResourceGroupName rg-contoso-ai -FunctionAppName func-contoso-ai `
        -AllowedOrigin https://contoso.sharepoint.com `
        -AzureOpenAiEndpoint https://contoso-openai.openai.azure.com `
        -AzureOpenAiKey "<api-klic>" -AzureOpenAiDeployment gpt-5-mini

.EXAMPLE
    .\deploy-azure.ps1 -ResourceGroupName rg-contoso-ai -FunctionAppName func-contoso-ai `
        -AllowedOrigin https://contoso.sharepoint.com `
        -AadTenantId 00000000-0000-0000-0000-000000000000 `
        -AadClientId 11111111-1111-1111-1111-111111111111 `
        -AadClientSecret "<secret>" `
        -SettingsSiteUrl https://contoso.sharepoint.com/sites/ai
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$ResourceGroupName,

    [Parameter(Mandatory = $true)]
    [string]$FunctionAppName,

    [Parameter(Mandatory = $true)]
    [string]$AllowedOrigin,

    [string]$PackageUrl = '',

    [string]$Location = 'westeurope',
    [string]$SubscriptionId = '',

    # Hosting Function App. Default Y1 = Consumption; jine SKU jen jako nahrada pri nulove
    # kvote Y1 (viz comment-based help a README, cast "Nova Azure subscription").
    [ValidateSet('Y1', 'B1', 'B2', 'S1', 'P0v3', 'EP1')]
    [string]$PlanSku = 'Y1',

    [switch]$SkipProviderCheck,
    [switch]$PurgeSoftDeletedOpenAi,

    # Existujici Azure OpenAI (kdyz jsou zadane endpoint + klic, novy ucet se nevytvari)
    [string]$AzureOpenAiEndpoint = '',
    [string]$AzureOpenAiKey = '',
    [string]$AzureOpenAiDeployment = '',

    # Novy Azure OpenAI ucet (pouzije se jen kdyz endpoint + klic nejsou zadane)
    [string]$OpenAiAccountName = '',
    [string]$OpenAiLocation = 'swedencentral',
    [string]$OpenAiModelName = 'gpt-5-mini',
    [string]$OpenAiModelVersion = '2025-08-07',
    [string]$OpenAiSkuName = 'GlobalStandard',
    # 50 = 50 000 TPM. Nizsi hodnota nesetri nic (plati se za spotrebovane tokeny, ne za
    # kvotu) a rozbiji dotazy nad firemnimi znalostmi - viz .PARAMETER vyse a lekce 26.7.
    [int]$OpenAiSkuCapacity = 50,

    # Volitelne - Znalostni priprava (enrich); predavaji se do sablony jen kdyz jsou zadane
    [string]$AadTenantId = '',
    [string]$AadClientId = '',
    [string]$AadClientSecret = '',
    [string]$SettingsSiteUrl = '',

    [switch]$SkipSmokeTest
)

$ErrorActionPreference = 'Stop'

function Write-Step([string]$Text) {
    Write-Host ''
    Write-Host ('==> ' + $Text) -ForegroundColor Cyan
}

function Assert-LastExit([string]$Message) {
    if ($LASTEXITCODE -ne 0) { throw $Message }
}

function Hide-Secrets {
    <#
      Zamaskuje tajne hodnoty v textu, ktery se chysta do konzole.

      Proc: syrovy vystup `az` se pri chybe vypisuje cely, a parametry sablony predavame na
      prikazove radce - je mezi nimi azureOpenAiKey a pripadne aadClientSecret. Vetsina chyb
      je ARM chyba bez argumentu (a `@secure()` parametry ARM sam maskuje), ale chyba
      PARSOVANI argumentu v az CLI cely prikaz zopakuje - a tenhle vypis deployer typicky
      kopiruje do protokolu nebo e-mailu. Jednou takhle unikly klic staci.
    #>
    param([string]$Text, [string[]]$Secrets)

    if ([string]::IsNullOrEmpty($Text)) { return $Text }
    $out = $Text
    foreach ($s in $Secrets) {
        # Prazdny/kratky retezec by nahradil cokoli - takove preskakujeme.
        if ([string]::IsNullOrEmpty($s) -or $s.Length -lt 8) { continue }
        $out = $out -replace [regex]::Escape($s), '***'
    }
    return $out
}

function Test-PlanQuotaInRegions {
    <#
      Zjisti, ktere z PREDANYCH regionu maji kvotu pro zvoleny App Service plan.
      (O regionech mimo seznam $Regions nerika nic - volajici jich predava par, ne vsechny.)

      Proc takhle: kvota Function App se vede per subscription A ZAROVEN per region -
      tataz subscription mela pri testovacim behu c. 11 v northeurope Y1 nulu a ve
      westeurope kvotu k dispozici. Drive tu stalo "zmena regionu nepomuze"; to je
      prokazatelne nepravda a posilalo to deployera zadat o kvotu misto toho, aby zkusil
      sousedni region.

      Meri se TOU cestou, ktera pada: ARM validace TEZE sablony, jen s jinym parametrem
      location. Zadne zdroje nevznikaji. Zamerne se nepouziva `az quota` (extension, ktera
      se doinstalovava za behu, a podpora Microsoft.Web v ni neni dolozena) ani
      `az appservice list-locations --sku` (ten region vypise, i kdyz je limit nula - meri
      dostupnost SKU, ne kvotu).

      Fail-safe: co nejde jednoznacne prokazat, se oznaci 'neznamo' a volajici o tom mlci.
      Nikdy netvrdit, ze region funguje, kdyz to nebylo zmereno.
    #>
    param(
        [string[]]$Regions,
        [string]$ResourceGroup,
        [string[]]$BaseParams,
        [string]$TemplatePath,
        [string]$TemplateUri,
        [bool]$UseLocalTemplate
    )

    $results = @()
    $previousEap = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        foreach ($region in $Regions) {
            # Kopie parametru s prepsanym location - vse ostatni (vc. planSku) zustava.
            $probeParams = @()
            foreach ($p in $BaseParams) {
                if ($p -like 'location=*') { $probeParams += ('location=' + $region) }
                else { $probeParams += $p }
            }

            $probeName = 'ep365-quota-probe-' + (Get-Date -Format 'yyyyMMddHHmmss') + '-' + $region
            if ($UseLocalTemplate) {
                $out = az deployment group validate --resource-group $ResourceGroup --name $probeName `
                    --template-file $TemplatePath --parameters $probeParams -o none 2>&1
            }
            else {
                $out = az deployment group validate --resource-group $ResourceGroup --name $probeName `
                    --template-uri $TemplateUri --parameters $probeParams -o none 2>&1
            }
            $text = (@($out) | ForEach-Object { [string]$_ }) -join "`n"

            $state = 'neznamo'
            if ($LASTEXITCODE -eq 0) { $state = 'ok' }
            elseif ($text -match 'SubscriptionIsOverQuotaForSku' -or $text -match 'VMs\)\s*:\s*0' -or $text -match 'quota of 0') { $state = 'kvota0' }
            elseif ($text -match 'RequestDisallowedByAzure' -or $text -match 'not accepting new customers' -or $text -match 'locationineligible') { $state = 'blokovan' }

            $results += (New-Object PSObject -Property @{ Region = $region; State = $state })
        }
    }
    finally {
        $ErrorActionPreference = $previousEap
    }
    return $results
}

$scriptDir = $PSScriptRoot
if (-not $scriptDir) { $scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path }
$repoRoot = Split-Path -Parent $scriptDir

# Jmeno deploymentu, kdyz nezadano, odvod od modelu. DULEZITE: runtime funkce ridi
# reasoning kontrakt (gpt-5* / o-rada -> max_completion_tokens, bez temperature) PRAVE
# jmenem deploymentu, ne jmenem modelu. Kdyby se gpt-5 model nasadil pod jmenem "gpt-4o",
# funkce by poslala temperature a model by dotaz odmitl. Odvozeni jmena od modelu tomu brani.
if ($AzureOpenAiDeployment -eq '') { $AzureOpenAiDeployment = $OpenAiModelName }

# CDN EasyPortal365 - hostuje ARM sablonu a release zip kodu pro beh mimo repo
# (typicky Azure Cloud Shell). URL zipu aktualizuje EasyPortal365 pri kazdem release
# (viz scripts/build-release-zip.ps1).
$CdnTemplateUrl = 'https://cdn.easyportal365.cz/chat-function/main.json'
$CdnPackageUrl  = 'https://cdn.easyportal365.cz/chat-function/ep365-chat-function-1.7.2.zip'

# Docasna slozka - $env:TEMP na Windows, GetTempPath() v Azure Cloud Shellu (Linux)
$TempBase = $env:TEMP
if (-not $TempBase) { $TempBase = [System.IO.Path]::GetTempPath() }

try {

    # ----------------------------------------------------------------------
    # 1. Azure CLI + prihlaseni
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

    $accountRaw = az account show -o json
    Assert-LastExit 'Nepodarilo se precist aktualni subscription.'
    $account = ConvertFrom-Json -InputObject (($accountRaw -join "`n"))
    Write-Host ('Prihlaseni OK - subscription: ' + $account.name + ' (' + $account.id + ')')

    if ($AzureOpenAiEndpoint -ne '' -and $AzureOpenAiKey -eq '') {
        throw 'Parametr -AzureOpenAiEndpoint byl zadan bez -AzureOpenAiKey. Zadejte oba, nebo zadny (pak skript vytvori novy Azure OpenAI ucet).'
    }
    if ($AzureOpenAiKey -ne '' -and $AzureOpenAiEndpoint -eq '') {
        throw 'Parametr -AzureOpenAiKey byl zadan bez -AzureOpenAiEndpoint. Zadejte oba, nebo zadny (pak skript vytvori novy Azure OpenAI ucet).'
    }

    # Sablona infrastruktury: lokalni infra/main.bicep (beh v repu), jinak lokalni
    # infra/main.json, jinak ARM z CDN. Prostredni krok je pro beh MIMO repo (typicky
    # Cloud Shell): staci polozit main.json do ../infra/ vedle skriptu a nasazuje se
    # ta sablona, ne ta z CDN - jinak by sablonu jeste nevydanou na CDN neslo vyzkouset.
    # ARM JSON zamerne az druhy v poradi: bicep je zdroj, main.json z nej generovany.
    $templatePath = Join-Path (Join-Path $repoRoot 'infra') 'main.bicep'
    $useLocalTemplate = Test-Path $templatePath
    if (-not $useLocalTemplate) {
        $localArmPath = Join-Path (Join-Path $repoRoot 'infra') 'main.json'
        if (Test-Path $localArmPath) {
            $templatePath = $localArmPath
            $useLocalTemplate = $true
        }
    }
    if ($useLocalTemplate) {
        Write-Host ('Sablona infrastruktury: lokalni (' + $templatePath + ')')
    }
    else {
        Write-Host ('Sablona infrastruktury: CDN (' + $CdnTemplateUrl + ') - skript nebezi v repu se zdrojaky.')
    }

    # ----------------------------------------------------------------------
    # 1b. Resource providers
    # ----------------------------------------------------------------------
    # CERSTVA subscription ma vetsinu namespace ve stavu NotRegistered a prvni pokus o zdroj
    # spadne na "MissingSubscriptionRegistration". U Azure OpenAI se to pozna hned, u Function
    # App az uvnitr nasazeni sablony - a tam to vypada jako chyba SABLONY, ne subscription
    # (naostro 2026-09-11: 'Failed to register resource provider microsoft.operationalinsights'
    # schovane mezi detaily deploymentu). Registrace je idempotentni, zdarma a jednorazova,
    # delame ji proto vzdy predem, at se na to nepreslo az pri deploymentu.
    if ($SkipProviderCheck) {
        Write-Step 'Resource providers - kontrola preskocena (-SkipProviderCheck)'
    }
    else {
        Write-Step 'Resource providers (u nove subscription nutna jednorazova registrace)'

        $requiredProviders = @(
            'Microsoft.Web',                  # Function App + App Service plan
            'Microsoft.Storage',              # Storage account
            'Microsoft.Insights',             # Application Insights
            'Microsoft.OperationalInsights',  # Log Analytics - saha po nem App Insights
            'Microsoft.CognitiveServices'     # Azure OpenAI
        )

        $pendingProviders = @()
        foreach ($ns in $requiredProviders) {
            $provState = az provider show --namespace $ns --query 'registrationState' -o tsv 2>$null
            if ($LASTEXITCODE -ne 0 -or -not $provState) { $provState = 'neznamy stav' }
            $provState = $provState.Trim()

            if ($provState -eq 'Registered') {
                Write-Host ('  ' + $ns.PadRight(30) + 'Registered')
                continue
            }

            Write-Host ('  ' + $ns.PadRight(30) + $provState + ' - registruji...')
            az provider register --namespace $ns -o none 2>$null
            if ($LASTEXITCODE -ne 0) {
                Write-Host ('  ' + $ns.PadRight(30) + 'registraci NELZE spustit - ucet zrejme nema pravo registrovat providery na subscription.') -ForegroundColor Yellow
            }
            else {
                $pendingProviders += $ns
            }
        }

        # Registrace bezi asynchronne. Pockame na ni tady, at deployment
        # nevstoupi do sablony driv, nez je provider pripraveny.
        if ($pendingProviders.Count -gt 0) {
            Write-Host 'Cekam na dokonceni registrace (u nas jednotky minut, cekam nejvys 5)...'
            $providerDeadline = (Get-Date).AddMinutes(5)
            while ($pendingProviders.Count -gt 0 -and (Get-Date) -lt $providerDeadline) {
                Start-Sleep -Seconds 10
                $stillPending = @()
                foreach ($ns in $pendingProviders) {
                    $provState = az provider show --namespace $ns --query 'registrationState' -o tsv 2>$null
                    if ($LASTEXITCODE -eq 0 -and $provState -and $provState.Trim() -eq 'Registered') {
                        Write-Host ('  ' + $ns.PadRight(30) + 'Registered')
                    }
                    else {
                        $stillPending += $ns
                    }
                }
                $pendingProviders = $stillPending
            }
            if ($pendingProviders.Count -gt 0) {
                Write-Host ('Upozorneni: po 5 minutach jeste nejsou registrovane: ' + ($pendingProviders -join ', ')) -ForegroundColor Yellow
                Write-Host 'Pokracuji dal - registrace muze dobehnout na pozadi. Kdyby nasazeni spadlo na MissingSubscriptionRegistration, spustte skript znovu za par minut (je idempotentni).' -ForegroundColor Yellow
            }
        }
    }

    # ----------------------------------------------------------------------
    # 2. Resource group (idempotentni)
    # ----------------------------------------------------------------------
    Write-Step ('Resource group "' + $ResourceGroupName + '" (' + $Location + ')')

    # Existujici RG NEPREVYTVARIME. `az group create` s jinym -Location nez ma existujici RG
    # skonci chybou InvalidResourceGroupLocation a driv shodil cely skript - pritom region RG
    # je jen evidencni udaj, zdroje stejne vznikaji v -Location. Presun RG Azure neumi.
    $existingRgLocation = az group show --name $ResourceGroupName --query 'location' -o tsv 2>$null
    if ($LASTEXITCODE -eq 0 -and $existingRgLocation) {
        $existingRgLocation = $existingRgLocation.Trim()
        $wantedRgLocation = ($Location -replace '\s', '').ToLower()
        if ($existingRgLocation.ToLower() -ne $wantedRgLocation) {
            Write-Host ('Resource group uz existuje, a to v regionu ' + $existingRgLocation + '.') -ForegroundColor Yellow
            Write-Host ('Region resource group je jen evidencni udaj - Function App a dalsi zdroje vzniknou podle -Location, tedy v ' + $Location + '. Pokracuji.') -ForegroundColor Yellow
        }
        else {
            Write-Host 'Resource group uz existuje - preskakuji vytvoreni.'
        }
    }
    else {
        az group create --name $ResourceGroupName --location $Location -o none
        Assert-LastExit 'Vytvoreni resource group selhalo.'
        Write-Host 'Resource group pripravena.'
    }

    # ----------------------------------------------------------------------
    # 3. Azure OpenAI - existujici, nebo vytvorit novy ucet + deployment
    # ----------------------------------------------------------------------
    $aoaiEndpoint = ''
    $aoaiKey = ''
    $aoaiAccountInfo = ''
    $aoaiStateInfo = ''

    if ($AzureOpenAiEndpoint -ne '') {
        Write-Step 'Azure OpenAI - pouzivam existujici ucet (zadano parametry)'
        $aoaiEndpoint = $AzureOpenAiEndpoint.TrimEnd('/')
        $aoaiKey = $AzureOpenAiKey
        $aoaiAccountInfo = 'existujici ucet (mimo spravu skriptu)'
        $aoaiStateInfo = 'predano parametrem - skript stav neoveroval'
        Write-Host ('Endpoint: ' + $aoaiEndpoint)
        Write-Host ('Deployment: ' + $AzureOpenAiDeployment)
    }
    else {
        if ($OpenAiAccountName -eq '') { $OpenAiAccountName = $FunctionAppName + '-openai' }
        Write-Step ('Azure OpenAI ucet "' + $OpenAiAccountName + '" (' + $OpenAiLocation + ')')

        $accCount = az cognitiveservices account list -g $ResourceGroupName --query ("length([?name=='" + $OpenAiAccountName + "'])") -o tsv
        Assert-LastExit 'Kontrola existence Azure OpenAI uctu selhala.'

        if ([int]$accCount -eq 0) {
            # Smazany Azure OpenAI ucet drzi svoje jmeno dal (soft-delete) - v seznamu aktivnich
            # uctu uz neni, ale `create` pod stejnym jmenem skonci na FlagMustBeSetForRestore.
            # Puvodni hlaska pak mluvila o kvote a obsazenem jmenu a poslala deployera hledat
            # uplne jinam (naostro 2026-09-11). Rozpoznavame to proto PREDEM. Purge je
            # nevratny, takze se bez vyslovneho pokynu nic nemaze - jen se vypise, co lze delat.
            $softDeletedLocation = ''
            $deletedJson = az cognitiveservices account list-deleted -o json 2>$null
            if ($LASTEXITCODE -eq 0 -and $deletedJson) {
                try {
                    foreach ($deletedAcc in @(ConvertFrom-Json (($deletedJson -join "`n")))) {
                        if ([string]$deletedAcc.name -ne $OpenAiAccountName) { continue }
                        if (([string]$deletedAcc.id) -notmatch ('/resourceGroups/' + [regex]::Escape($ResourceGroupName) + '/')) { continue }
                        $softDeletedLocation = [string]$deletedAcc.location
                    }
                }
                catch { $softDeletedLocation = '' }
            }

            if ($softDeletedLocation -ne '') {
                $purgeCmd = 'az cognitiveservices account purge --name ' + $OpenAiAccountName + ' --resource-group ' + $ResourceGroupName + ' --location ' + $softDeletedLocation
                if ($PurgeSoftDeletedOpenAi) {
                    Write-Host ('Ucet "' + $OpenAiAccountName + '" je ve stavu soft-deleted (region ' + $softDeletedLocation + '). Na pokyn -PurgeSoftDeletedOpenAi ho TRVALE odstranuji...') -ForegroundColor Yellow
                    az cognitiveservices account purge --name $OpenAiAccountName --resource-group $ResourceGroupName --location $softDeletedLocation -o none
                    Assert-LastExit ('Trvale odstraneni soft-deleted uctu selhalo. Zkuste rucne:  ' + $purgeCmd)
                    Write-Host 'Soft-deleted ucet odstranen, zakladam novy.'
                }
                else {
                    throw ('Azure OpenAI ucet "' + $OpenAiAccountName + '" uz v teto resource group jednou existoval a Azure ho po smazani stale drzi (soft-delete, region ' + $softDeletedLocation + '). Jmeno je tim blokovane - zalozeni by skoncilo chybou FlagMustBeSetForRestore. NIC JSME NESMAZALI; mate tri moznosti: (1) pouzijte jine jmeno uctu parametrem -OpenAiAccountName <jine-jmeno>; (2) puvodni ucet TRVALE odstrante a zalozte cisty - pridejte prepinac -PurgeSoftDeletedOpenAi, nebo spustte rucne:  ' + $purgeCmd + ' ; (3) puvodni ucet i s jeho model deploymenty OBNOVTE - Azure Portal -> Azure OpenAI / Cognitive Services -> Manage deleted resources -> Recover, a pak skript spustte znovu.')
                }
            }

            Write-Host 'Ucet neexistuje - vytvarim (muze trvat 1-2 minuty)...'
            az cognitiveservices account create `
                --name $OpenAiAccountName `
                --resource-group $ResourceGroupName `
                --location $OpenAiLocation `
                --kind OpenAI `
                --sku S0 `
                --custom-domain $OpenAiAccountName `
                --yes -o none
            Assert-LastExit ('Vytvoreni Azure OpenAI uctu selhalo. Podle chyby VYSE: (a) "MissingSubscriptionRegistration" = subscription nema registrovany provider Microsoft.CognitiveServices - spustte "az provider register --namespace Microsoft.CognitiveServices" a skript znovu (ucet na to pravo mit musi); (b) "FlagMustBeSetForRestore" = ucet tohoto jmena byl smazan a Azure ho jeste drzi (soft-delete) - viz prepinac -PurgeSoftDeletedOpenAi nebo zvolte jine -OpenAiAccountName; (c) chybejici kvota pro Azure OpenAI v regionu ' + $OpenAiLocation + ' nebo obsazeny nazev - zkuste jiny region (-OpenAiLocation) nebo jine jmeno (-OpenAiAccountName).')
            Write-Host 'Ucet vytvoren.'
        }
        else {
            Write-Host 'Ucet uz existuje - preskakuji vytvoreni.'
        }

        $depCount = az cognitiveservices account deployment list -g $ResourceGroupName -n $OpenAiAccountName --query ("length([?name=='" + $AzureOpenAiDeployment + "'])") -o tsv
        Assert-LastExit 'Kontrola existence model deploymentu selhala.'

        if ([int]$depCount -eq 0) {
            # Verze modelu: kdyz nezadana explicitne, zjisti nejnovejsi GA verzi v regionu.
            # Napevno zadana verze casem zastara - Azure model presune na "Deprecating"
            # a create ho odmitne (presne to potkalo puvodni gpt-4o 2024-08-06). Auto-vyber
            # se tomu vyhne. Fallback na -OpenAiModelVersion, kdyz dotaz selze / nic nevrati.
            $resolvedModelVersion = $OpenAiModelVersion
            if (-not $PSBoundParameters.ContainsKey('OpenAiModelVersion')) {
                try {
                    $modelsJson = az cognitiveservices model list --location $OpenAiLocation -o json 2>$null
                    if ($LASTEXITCODE -eq 0 -and $modelsJson) {
                        $allModels = ConvertFrom-Json (($modelsJson -join "`n"))
                        # Jen GA verze zadaneho modelu, ktere nabizi pozadovanou SKU.
                        # (Verze jsou datove retezce "YYYY-MM-DD" - sestupny textovy sort = nejnovejsi.)
                        $gaVersions = @($allModels | Where-Object {
                            $_.kind -eq 'OpenAI' -and
                            $_.model.name -eq $OpenAiModelName -and
                            $_.model.lifecycleStatus -eq 'GenerallyAvailable' -and
                            (@($_.model.skus | Where-Object { $_.name -eq $OpenAiSkuName }).Count -gt 0)
                        })
                        if ($gaVersions.Count -gt 0) {
                            $newest = ($gaVersions | Sort-Object { $_.model.version } -Descending | Select-Object -First 1)
                            if ($newest.model.version) {
                                $resolvedModelVersion = $newest.model.version
                                if ($resolvedModelVersion -ne $OpenAiModelVersion) {
                                    Write-Host ('Nejnovejsi GA verze modelu ' + $OpenAiModelName + ' v regionu ' + $OpenAiLocation + ': ' + $resolvedModelVersion + ' (vychozi pin: ' + $OpenAiModelVersion + ').')
                                }
                            }
                        }
                    }
                }
                catch {
                    # Dotaz na katalog modelu selhal - pouziji vychozi verzi (-OpenAiModelVersion).
                }
            }

            # Preflight kvoty (lekce 26.7 bod 3, ktera to predepsala uz 2026-07-19):
            # kdyz na pozadovanou kapacitu v regionu nezbyva kvota, SESTUP na dostupnou
            # misto padu na InsufficientQuota. Selhani MERENI nesmi nasazeni zastavit -
            # pak se posle pozadovana hodnota a rozhodne Azure (chovani do 2026-09-17).
            $effectiveCapacity = $OpenAiSkuCapacity
            try {
                $usageJson = az cognitiveservices usage list --location $OpenAiLocation -o json 2>$null
                if ($LASTEXITCODE -eq 0 -and $usageJson) {
                    $usages = ConvertFrom-Json (($usageJson -join "`n"))
                    $skuKey   = $OpenAiSkuName.ToLower()
                    $modelKey = $OpenAiModelName.ToLower()
                    # Kvota se jmenuje napr. "OpenAI.GlobalStandard.gpt-5-mini" - hledame
                    # podle SKU i modelu, ne podle presneho tvaru (ten se u modelu lisi).
                    $quota = @($usages | Where-Object {
                        $n = ''
                        if ($_.name -and $_.name.value) { $n = ([string]$_.name.value).ToLower() }
                        ($n.Length -gt 0) -and $n.Contains($skuKey) -and $n.Contains($modelKey)
                    } | Select-Object -First 1)
                    if ($quota.Count -gt 0 -and [double]$quota[0].limit -gt 0) {
                        $remaining = [int]([double]$quota[0].limit - [double]$quota[0].currentValue)
                        Write-Host ('Kvota ' + $OpenAiSkuName + '/' + $OpenAiModelName + ' v regionu ' + $OpenAiLocation + ': zbyva ' + $remaining + ' z ' + [int][double]$quota[0].limit + ' (v tisicich TPM).')
                        if ($remaining -lt $OpenAiSkuCapacity -and $remaining -ge 1) {
                            $effectiveCapacity = $remaining
                            Write-Host ('POZOR: na doporucenou kapacitu ' + $OpenAiSkuCapacity + ' kvota v tomto regionu nestaci - zakladam deployment s ' + $effectiveCapacity + '. Chat pojede, ale dotazy nad firemnimi znalostmi mohou vracet 429 (limit kapacity). Kvotu navyste v Azure Portalu (Quotas -> Azure OpenAI, region ' + $OpenAiLocation + ') a pak zvyste kapacitu deploymentu - nic to nestoji, plati se za spotrebovane tokeny.') -ForegroundColor Yellow
                        }
                        elseif ($remaining -lt 1) {
                            Write-Host ('POZOR: v regionu ' + $OpenAiLocation + ' nezbyva pro ' + $OpenAiSkuName + '/' + $OpenAiModelName + ' zadna kvota - zalozeni nize nejspis skonci chybou InsufficientQuota. Reseni: jiny region (-OpenAiLocation), nebo navyseni kvoty v Azure Portalu (Quotas).') -ForegroundColor Yellow
                        }
                    }
                }
            }
            catch {
                # Mereni kvoty selhalo - posleme pozadovanou kapacitu a rozhodne Azure.
            }

            Write-Host ('Vytvarim model deployment "' + $AzureOpenAiDeployment + '" (' + $OpenAiModelName + ' ' + $resolvedModelVersion + ', ' + $OpenAiSkuName + ' ' + $effectiveCapacity + ')...')
            az cognitiveservices account deployment create `
                --resource-group $ResourceGroupName `
                --name $OpenAiAccountName `
                --deployment-name $AzureOpenAiDeployment `
                --model-name $OpenAiModelName `
                --model-version $resolvedModelVersion `
                --model-format OpenAI `
                --sku-name $OpenAiSkuName `
                --sku-capacity $effectiveCapacity -o none
            Assert-LastExit ('Vytvoreni model deploymentu selhalo. Pravdepodobne priciny: (1) model ' + $OpenAiModelName + ' (verze ' + $resolvedModelVersion + ') neni v regionu ' + $OpenAiLocation + ' dostupny; (2) chybi kvota pro SKU ' + $OpenAiSkuName + ' (kapacita ' + $effectiveCapacity + '); (3) model muze byt ve stavu Deprecating - Azure ho JIZ NEPRIJIMA pro nove deploymenty (i kdyz jeste nebyl retirovan) - v tom pripade zvolte GA (GenerallyAvailable) model nebo verzi parametry -OpenAiModelName / -OpenAiModelVersion. Dostupne GA modely v regionu vypisete prikazem:  az cognitiveservices model list -l ' + $OpenAiLocation + ' --query "[?kind==''OpenAI'' && model.lifecycleStatus==''GenerallyAvailable''].{Model:model.name, Verze:model.version}" -o table   Model/verzi/kapacitu zvolte parametry -OpenAiModelName / -OpenAiModelVersion / -OpenAiSkuCapacity (jmeno deploymentu -AzureOpenAiDeployment se jinak odvodi od modelu).')
            Write-Host 'Model deployment vytvoren.'
        }
        else {
            Write-Host ('Model deployment "' + $AzureOpenAiDeployment + '" uz existuje - preskakuji vytvoreni.')
            # Existujici deployment se drive jen PRESKOCIL, takze zakaznik nasazeny s
            # nizkou kapacitou u ni zustal i po opakovanem spusteni skriptu a nikdo se o
            # tom nedozvedel (Technicoat 2026-09-17: 10 TPM, tedy mene, nez unese jeden
            # dotaz nad firemnimi znalostmi). Kapacitu proto ZMER a nesedici nahlas.
            # Sama se NEMENI - je to zdroj zakaznika a nasazeni na nej pravo mit nemusi.
            try {
                $existingCapacityRaw = az cognitiveservices account deployment show --resource-group $ResourceGroupName --name $OpenAiAccountName --deployment-name $AzureOpenAiDeployment --query 'sku.capacity' -o tsv 2>$null
                if ($LASTEXITCODE -eq 0 -and $existingCapacityRaw) {
                    $existingCapacity = [int]$existingCapacityRaw
                    Write-Host ('  Kapacita existujiciho deploymentu: ' + $existingCapacity + ' (v tisicich TPM).')
                    if ($existingCapacity -lt $OpenAiSkuCapacity) {
                        Write-Host ('  POZOR: kapacita ' + $existingCapacity + ' je pod doporucenou ' + $OpenAiSkuCapacity + '. Jeden dotaz nad firemnimi znalostmi ma prompt v desetitisicich tokenu, takze se do minutoveho okna nevejde a Azure OpenAI vrati 429 - uzivatel uvidi "AI sluzba dotaz odmitla kvuli limitu kapacity". Navyseni nic nestoji (plati se za spotrebovane tokeny, ne za kvotu): Azure Portal -> Azure OpenAI -> ' + $OpenAiAccountName + ' -> Deployments -> ' + $AzureOpenAiDeployment + ' -> Edit -> Tokens per Minute Rate Limit.') -ForegroundColor Yellow
                    }
                }
            }
            catch {
                # Kapacitu nesla precist - nasazeni to nezastavuje.
            }
        }

        $aoaiEndpoint = (az cognitiveservices account show -g $ResourceGroupName -n $OpenAiAccountName --query 'properties.endpoint' -o tsv)
        Assert-LastExit 'Nepodarilo se precist endpoint Azure OpenAI uctu.'
        $aoaiEndpoint = $aoaiEndpoint.TrimEnd('/')

        $aoaiKey = (az cognitiveservices account keys list -g $ResourceGroupName -n $OpenAiAccountName --query 'key1' -o tsv)
        Assert-LastExit 'Nepodarilo se precist API klic Azure OpenAI uctu.'

        $aoaiStateInfo = (az cognitiveservices account deployment show -g $ResourceGroupName -n $OpenAiAccountName --deployment-name $AzureOpenAiDeployment --query 'properties.provisioningState' -o tsv)
        Assert-LastExit 'Nepodarilo se precist stav model deploymentu.'
        $aoaiAccountInfo = $OpenAiAccountName + ' (' + $OpenAiLocation + ')'

        Write-Host ('Endpoint: ' + $aoaiEndpoint)
    }

    # ----------------------------------------------------------------------
    # 4. Infrastruktura - infra/main.bicep
    # ----------------------------------------------------------------------
    Write-Step 'Nasazuji infrastrukturu (infra/main.bicep)'

    # N23: ARM sablona prepisuje CELOU kolekci appSettings, takze redeploy jinak smaze vse, co
    # v sablone neni (AAD_*, enrich readUrl allowlist, billing, hub, rate limity, modely...) a
    # tise vypne Znalostni pripravu i dalsi funkce. Pred nasazenim si nase nastaveni zazalohujeme
    # a po nasazeni obnovime (parametr ma prednost). Na PRVNIM nasazeni Function App jeste
    # neexistuje -> list vrati chybu, zaloha je prazdna, nic se neobnovuje.
    $preservedSettings = @{}
    $existingSettingsJson = az functionapp config appsettings list --name $FunctionAppName --resource-group $ResourceGroupName -o json 2>$null
    if ($LASTEXITCODE -eq 0 -and $existingSettingsJson) {
        try {
            foreach ($item in @($existingSettingsJson | ConvertFrom-Json)) {
                $nm = [string]$item.name
                # Jen NAS namespace (EP365_*, AAD_*). Infra klice (storage, functions runtime,
                # appinsights) i AZURE_OPENAI_*/ALLOWED_ORIGIN nechavame na sablone/parametrech.
                if ($nm -notmatch '^(EP365_|AAD_)') { continue }
                $preservedSettings[$nm] = [string]$item.value
            }
            if ($preservedSettings.Count -gt 0) {
                Write-Host ('Zaloha App Settings pred nasazenim: ' + $preservedSettings.Count + ' hodnot (EP365_*/AAD_*) - po nasazeni se obnovi.')
            }
        } catch { $preservedSettings = @{} }
    }

    $deployName = 'ep365-chat-' + (Get-Date -Format 'yyyyMMdd-HHmmss')
    $bicepParams = @(
        ('functionAppName=' + $FunctionAppName),
        ('location=' + $Location),
        ('azureOpenAiEndpoint=' + $aoaiEndpoint),
        ('azureOpenAiKey=' + $aoaiKey),
        ('azureOpenAiDeployment=' + $AzureOpenAiDeployment),
        ('allowedOrigin=' + $AllowedOrigin),
        # Kod nasazuje tento skript sam (zip deploy) - packageUrl v sablone musi zustat
        # prazdne, i kdyz CDN kopie sablony ma default vyplneny (rezim Deploy to Azure).
        # Prazdne packageUrl NEznamena "bez WEBSITE_RUN_FROM_PACKAGE": sablona v tom pripade
        # nastavi WEBSITE_RUN_FROM_PACKAGE=1, tedy beh z balicku ULOZENEHO V AZURE. Zip deploy
        # o par kroku niz balicek jen ulozi a atomicky namountuje misto rozbalovani do beziciho
        # wwwroot (bez toho zamky na Windows poskodi .js a instance skonci na 503 - lessons
        # 26.1). Instance tim ztrati runtime zavislost na CDN, i kdyz drive bezela z URL.
        'packageUrl='
    )
    # Volitelne parametry Znalostni pripravy - predavaji se JEN kdyz jsou zadane
    # (sablona ma pro ne prazdne defaulty).
    # planSku posilame JEN kdyz se lisi od defaultu: starsi ARM sablona na CDN ten parametr
    # nezna a odmitla by cely deployment. Default Y1 tim zustava zpetne kompatibilni.
    if ($PlanSku -ne 'Y1') { $bicepParams += ('planSku=' + $PlanSku) }

    if ($AadTenantId -ne '')     { $bicepParams += ('aadTenantId=' + $AadTenantId) }
    if ($AadClientId -ne '')     { $bicepParams += ('aadClientId=' + $AadClientId) }
    if ($AadClientSecret -ne '') { $bicepParams += ('aadClientSecret=' + $AadClientSecret) }
    if ($SettingsSiteUrl -ne '') { $bicepParams += ('settingsSiteUrl=' + $SettingsSiteUrl) }

    # Vystup deploymentu si zachytime, abychom z nej umeli PRECIST pricinu a rict, co s ni
    # (driv se jen vypsal ARM JSON a hlaska "nasazeni selhalo" - deployer pak hledal chybu
    # v sablone, i kdyz slo o kvotu nebo neregistrovany provider; naostro 2026-09-11).
    # $ErrorActionPreference docasne na Continue: PS 5.1 jinak na presmerovani stderr
    # nativniho prikazu (2>&1) vyhodi NativeCommandError driv, nez se dostaneme k analyze.
    $previousEap = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        if ($useLocalTemplate) {
            $deployOutput = az deployment group create `
                --resource-group $ResourceGroupName `
                --name $deployName `
                --template-file $templatePath `
                --parameters $bicepParams -o none 2>&1
        }
        else {
            $deployOutput = az deployment group create `
                --resource-group $ResourceGroupName `
                --name $deployName `
                --template-uri $CdnTemplateUrl `
                --parameters $bicepParams -o none 2>&1
        }
    }
    finally {
        $ErrorActionPreference = $previousEap
    }

    if ($LASTEXITCODE -ne 0) {
        $deployText = (@($deployOutput) | ForEach-Object { [string]$_ }) -join "`n"
        # Do konzole (a odtud do protokolu) jen zamaskovane - viz Hide-Secrets.
        # Klasifikace nize bezi nad PUVODNIM textem, maskovani ji neovlivnuje.
        if ($deployText.Trim() -ne '') { Write-Host (Hide-Secrets -Text $deployText -Secrets @($aoaiKey, $AadClientSecret)) }

        Write-Host ''
        Write-Host 'Nasazeni sablony selhalo. Rozbor chyby:' -ForegroundColor Red

        $diagnosed = $false

        if ($deployText -match 'SubscriptionIsOverQuotaForSku' -or $deployText -match 'VMs\)\s*:\s*0' -or $deployText -match 'quota of 0') {
            $diagnosed = $true
            Write-Host (' PRICINA: subscription nema v regionu ' + $Location + ' kvotu pro plan Function App (' + $PlanSku + '). Cerstve subscription ji maji casto nulovou.') -ForegroundColor Yellow
            Write-Host ' Kvota se vede per subscription A ZAROVEN per region - v jinem regionu muze byt k dispozici, i kdyz tady je nula. Mereno nize.' -ForegroundColor Yellow

            # Kde kvota JE: zmereno ARM validaci teze sablony s jinym location (zadne zdroje
            # nevznikaji). Driv tu stalo "zmena regionu nepomuze" - beh c. 11 to vyvratil:
            # tataz subscription mela northeurope 0 a westeurope kvotu k dispozici.
            $candidateRegions = @('westeurope', 'northeurope', 'germanywestcentral', 'swedencentral', 'francecentral') | Where-Object { $_ -ne $Location }
            Write-Host ''
            Write-Host (' Zjistuji, kde kvota pro ' + $PlanSku + ' je - zkousim ' + $candidateRegions.Count + ' evropskych regionu, chvili to potrva...')

            # Mereni je DOPLNEK rozboru, ne jeho podminka: kdyz selze (az nedostupne, sablona
            # nectena, cokoli neceka), musi projit zbytek rady. Bez tohohle catch by vyjimka
            # sebrala uzivateli i RESENI B a C - tedy vic, nez kolik mu mereni prida.
            $quotaProbe = @()
            $probeFailed = ''
            try {
                $quotaProbe = @(Test-PlanQuotaInRegions -Regions $candidateRegions -ResourceGroup $ResourceGroupName `
                    -BaseParams $bicepParams -TemplatePath $templatePath -TemplateUri $CdnTemplateUrl -UseLocalTemplate $useLocalTemplate)
            }
            catch {
                $probeFailed = Hide-Secrets -Text $_.Exception.Message -Secrets @($aoaiKey, $AadClientSecret)
            }

            if ($probeFailed -ne '') {
                Write-Host ('   Mereni se nepodarilo provest (' + $probeFailed + ') - regiony proto neumim doporucit. Zbytek rady nize plati.') -ForegroundColor Yellow
            }
            foreach ($r in $quotaProbe) {
                $label = switch ($r.State) {
                    'ok'       { 'kvota k dispozici' }
                    'kvota0'   { 'kvota 0' }
                    'blokovan' { 'region neprijima nove zakazniky' }
                    default    { 'nezjisteno (jina chyba validace)' }
                }
                Write-Host ('   ' + $r.Region.PadRight(20) + $label)
            }
            $regionsWithQuota = @($quotaProbe | Where-Object { $_.State -eq 'ok' })
            Write-Host ''

            # Tri RUZNE stavy, ktere se nesmi slit do jedne vety: nasel jsem region / zmeril
            # jsem a nenasel / nezmeril jsem nic. Puvodne tu byly jen dva, takze pri selhani
            # mereni skript tvrdil "zadny z merenych regionu kvotu nema" - o regionech,
            # ktere nikdo nezmeril. Presne ta trida tvrzeni, kvuli ktere se tenhle rozbor
            # prepisoval (nalez P-14).
            $regionsZero = @($quotaProbe | Where-Object { $_.State -eq 'kvota0' })
            $regionsUnknown = @($quotaProbe | Where-Object { $_.State -ne 'ok' -and $_.State -ne 'kvota0' })

            if ($regionsWithQuota.Count -gt 0) {
                $best = $regionsWithQuota[0].Region
                Write-Host (' RESENI A (nejrychlejsi): spustte skript znovu s -Location ' + $best) -ForegroundColor Green
                Write-Host ('   Validace tam prosla bez chyby o kvote - je to tedy nejnadejnejsi region, ne zaruka (nasazeni je az dalsi krok).')
                Write-Host ('   Existujici resource group se tim nemeni, jen v ni zdroje vzniknou v regionu ' + $best + '.')
            }
            elseif ($regionsZero.Count -gt 0) {
                # Neznama se NESMI pocitat mezi nuly - funkce o nich vyslovne mlci.
                $vzkaz = ' RESENI A: kvotu pro ' + $PlanSku + ' nema ani jeden z ' + $regionsZero.Count + ' regionu, ktere se podarilo zmerit'
                if ($regionsUnknown.Count -gt 0) { $vzkaz += ' (u ' + $regionsUnknown.Count + ' dalsich mereni neproslo, o tech nevime nic)' }
                $vzkaz += '. Dalsi regiony Azure nabizi, zmerene je nemame - pokracujte bodem B nebo C.'
                Write-Host $vzkaz -ForegroundColor Yellow
            }
            else {
                Write-Host (' RESENI A: zkuste jiny region parametrem -Location (napr. westeurope, northeurope, germanywestcentral, swedencentral, francecentral). Ktery z nich kvotu ma, se tentokrat zmerit nepodarilo.') -ForegroundColor Yellow
            }

            if ($PlanSku -eq 'Y1') {
                Write-Host ' RESENI B (jina kvotova rodina): -PlanSku B1. Dedikovany plan ma vlastni kvotu nez serverless Y1, takze muze projit i tam, kde Y1 ne. Pevna mesicni cena misto platby za beh, bez studenych startu.'
            }
            else {
                Write-Host ('   RESENI B (jina kvotova rodina): serverless -PlanSku Y1 ma vlastni kvotu nez dedikovane plany (' + $PlanSku + '). Pokud jste ho jeste nezkousel, zkuste ho; pokud selhal ve stejnem regionu, byly tam nulove obe rodiny - v jinych regionech to zmerene nemame.')
            }

            Write-Host ' RESENI C (kdyz A ani B neprojdou): pozadat o navyseni kvoty. Azure Portal -> Quotas -> App Service -> polozka pro zvoleny plan v cilovem regionu -> Request adjustment.'
            Write-Host '   POZOR na ocekavani: self-service zadost muze Azure rovnou ZAMITNOUT ("Unsuccessful, Received 0 of 1"), a to i pro serverless i pro dedikovany plan. Pak zbyva Help + support -> Create support request -> "Service and subscription limits (quotas)" -> App Service, kterou schvaluje clovek - nepocitejte s tim v radu minut.' -ForegroundColor Yellow
            Write-Host '   Proto kvotu resit S PREDSTIHEM, ne az ve chvili nasazeni.'
        }

        if ($deployText -match 'RequestDisallowedByAzure' -or $deployText -match 'not accepting new customers' -or $deployText -match 'locationineligible') {
            $diagnosed = $true
            Write-Host (' PRICINA: region ' + $Location + ' aktualne neprijima nove zakazniky (kapacitni blok Azure).') -ForegroundColor Yellow
            Write-Host ' RESENI: zvolte jiny region parametrem -Location (napr. northeurope, germanywestcentral, swedencentral). Existujici resource group se tim NEMENI - region zdroju urcuje -Location.'
        }

        if ($deployText -match 'MissingSubscriptionRegistration' -or $deployText -match 'Failed to register resource provider') {
            $diagnosed = $true
            Write-Host ' PRICINA: subscription nema registrovany nektery resource provider (jmeno je v chybe vyse).' -ForegroundColor Yellow
            Write-Host ' RESENI: az provider register --namespace <jmeno-z-chyby>    a pote skript spustit znovu. Registrace je jednorazova; u nas dobehla v jednotkach minut.'
        }

        # Uzka podminka zamerne: samotne slovo planSku se v chybe objevi i tehdy, kdyz je
        # parametr v poradku a selhala treba kvota pro zvolene SKU. Radu "sablona je stara"
        # smime dat jen u chyby, ktera vyslovne rika, ze parametr v sablone NENI.
        if ($deployText -match 'planSku' -and ($deployText -match 'not present in the original template' -or $deployText -match 'parameters.{0,40}are not valid')) {
            $diagnosed = $true
            Write-Host ' PRICINA: pouzita ARM sablona parametr planSku nezna - je starsi nez tento skript.' -ForegroundColor Yellow
            Write-Host ' RESENI: stahnete si aktualni deploy-azure.ps1 I sablonu z CDN, nebo skript spustte bez -PlanSku.'
        }

        if (-not $diagnosed) {
            Write-Host ' Konkretni chybu hleda Azure Portal -> resource group -> Deployments -> posledni deployment -> Operation details.'
        }

        throw 'Nasazeni sablony selhalo (rozbor viz vyse).'
    }
    Write-Host 'Infrastruktura nasazena (Function App, Storage Account, Application Insights, App Settings).'

    # N23: obnova zalohovanych App Settings. Parametr ma prednost - AAD_*/SETTINGS_SITE_URL
    # predane parametrem uz sablona nastavila spravne, ty NEobnovujeme; ostatni (enrich readUrl,
    # hub, billing, rate limity, modely + AAD_* bez parametru) vratime z zalohy.
    if ($preservedSettings.Count -gt 0) {
        $restoreArgs = @()
        foreach ($key in $preservedSettings.Keys) {
            if ($key -eq 'AAD_TENANT_ID'           -and $AadTenantId -ne '')     { continue }
            if ($key -eq 'AAD_CLIENT_ID'           -and $AadClientId -ne '')     { continue }
            if ($key -eq 'AAD_CLIENT_SECRET'       -and $AadClientSecret -ne '') { continue }
            if ($key -eq 'EP365_SETTINGS_SITE_URL' -and $SettingsSiteUrl -ne '') { continue }
            $v = $preservedSettings[$key]
            if ([string]::IsNullOrEmpty($v)) { continue }
            $restoreArgs += ($key + '=' + $v)
        }
        if ($restoreArgs.Count -gt 0) {
            # Vypiseme jen NAZVY klicu - hodnoty (vc. AAD_CLIENT_SECRET) se do konzole netisknou.
            $restoredKeys = ($restoreArgs | ForEach-Object { ($_ -split '=', 2)[0] } | Sort-Object) -join ', '
            Write-Host ('Obnovuji zachovane App Settings (hodnoty se netisknou): ' + $restoredKeys)
            az functionapp config appsettings set --name $FunctionAppName --resource-group $ResourceGroupName --settings $restoreArgs -o none 2>$null | Out-Null
            if ($LASTEXITCODE -ne 0) {
                Write-Host ' Upozorneni: obnova nekterych App Settings selhala - overte je rucne v Azure Portalu.' -ForegroundColor Yellow
            }
        }
    }

    # ----------------------------------------------------------------------
    # 5. Kod funkce - release zip (CDN / -PackageUrl), nebo build ze zdrojaku
    # ----------------------------------------------------------------------
    Write-Step 'Nasazuji kod funkce'

    # Pojistka WEBSITE_RUN_FROM_PACKAGE=1. Sablona ho uz nastavila (deploujeme ji s prazdnym
    # packageUrl), ale kdyz skript bezi proti STARSI ARM sablone z CDN, ta ho pri prazdnem
    # packageUrl vubec nevysazela - a zip deploy by pak rozbaloval soubory do beziciho wwwroot
    # (zamky na Windows -> poskozeny .js -> 503 "Function host is not running", lessons 26.1).
    # Nastaveni je idempotentni a delame ho tesne pred deployem kodu zamerne: RFP=1 na instanci
    # bez nahraneho balicku znamena appku bez kodu, takze okno drzime na desitkach sekund.
    az functionapp config appsettings set --name $FunctionAppName --resource-group $ResourceGroupName `
        --settings WEBSITE_RUN_FROM_PACKAGE=1 -o none 2>$null | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Write-Host ' Upozorneni: nepodarilo se nastavit WEBSITE_RUN_FROM_PACKAGE=1 - overte ho v Azure Portalu (bez nej muze deploy poskodit bezici instanci).' -ForegroundColor Yellow
    }

    $repoHasSources = (Test-Path (Join-Path $repoRoot 'package.json')) -and (Test-Path (Join-Path $repoRoot 'src'))

    $resolvedPackageUrl = $PackageUrl
    if ($resolvedPackageUrl -eq '' -and -not $repoHasSources) {
        $resolvedPackageUrl = $CdnPackageUrl
        Write-Host 'Skript nebezi v repu se zdrojaky - pouziji aktualni release zip z CDN.'
    }

    $codeSourceInfo = ''
    if ($resolvedPackageUrl -ne '') {
        # -- Rezim A: hotovy release zip (Azure Cloud Shell / bez Node.js) --
        $codeSourceInfo = 'release zip (' + $resolvedPackageUrl + ')'
        $tmpZip = Join-Path $TempBase ('ep365-chat-package-' + [Guid]::NewGuid().ToString('N') + '.zip')
        try {
            Write-Host ('Stahuji balicek: ' + $resolvedPackageUrl)
            Invoke-WebRequest -Uri $resolvedPackageUrl -OutFile $tmpZip -UseBasicParsing
            $zipSizeMb = [math]::Round((Get-Item $tmpZip).Length / 1MB, 1)
            Write-Host ('Stazeno ' + $zipSizeMb + ' MB. Nahravam do Function App (config-zip)...')
            az functionapp deployment source config-zip `
                --resource-group $ResourceGroupName `
                --name $FunctionAppName `
                --src $tmpZip -o none
            Assert-LastExit 'Zip deploy selhal.'
        }
        finally {
            if (Test-Path $tmpZip) { Remove-Item $tmpZip -Force }
        }
    }
    else {
        # -- Rezim B: build ze zdrojaku (beh v repu; vyzaduje Node.js 22 + npm) --
        $codeSourceInfo = 'build ze zdrojaku (' + $repoRoot + ')'
        $npmCmd = Get-Command npm -ErrorAction SilentlyContinue
        if ($null -eq $npmCmd) {
            throw 'npm neni v PATH - nainstalujte Node.js 22 (https://nodejs.org), nebo spustte skript s -PackageUrl <url-release-zipu> (kod se pak nasadi bez buildu).'
        }

        Push-Location $repoRoot
        try {
            Write-Host 'npm ci (instalace zavislosti)...'
            npm ci
            Assert-LastExit 'npm ci selhalo - zkontrolujte verzi Node.js (vyzadovana 22) a pripojeni k internetu.'

            Write-Host 'npm run build (TypeScript kompilace)...'
            npm run build
            Assert-LastExit 'npm run build selhalo.'

            $funcCmd = Get-Command func -ErrorAction SilentlyContinue
            if ($null -ne $funcCmd) {
                Write-Host 'Azure Functions Core Tools nalezeny - publikuji pres "func azure functionapp publish"...'
                func azure functionapp publish $FunctionAppName
                Assert-LastExit 'Publikace pres func selhala.'
            }
            else {
                Write-Host 'Azure Functions Core Tools (func) nenalezeny - pouzivam fallback zip deploy.'
                $tmpId = [Guid]::NewGuid().ToString('N')
                $tmpDir = Join-Path $TempBase ('ep365-chat-deploy-' + $tmpId)
                $zipPath = Join-Path $TempBase ('ep365-chat-deploy-' + $tmpId + '.zip')

                New-Item -ItemType Directory -Path $tmpDir | Out-Null
                try {
                    Write-Host 'Pripravuji docasnou kopii (host.json, package.json, dist, produkcni node_modules)...'
                    Copy-Item (Join-Path $repoRoot 'host.json') $tmpDir
                    Copy-Item (Join-Path $repoRoot 'package.json') $tmpDir
                    Copy-Item (Join-Path $repoRoot 'package-lock.json') $tmpDir
                    Copy-Item (Join-Path $repoRoot 'dist') (Join-Path $tmpDir 'dist') -Recurse

                    Push-Location $tmpDir
                    try {
                        Write-Host 'npm ci --omit=dev (produkcni zavislosti do docasne kopie)...'
                        npm ci --omit=dev
                        Assert-LastExit 'npm ci --omit=dev selhalo.'
                    }
                    finally {
                        Pop-Location
                    }

                    Write-Host 'Vytvarim zip balicek...'
                    if (Test-Path $zipPath) { Remove-Item $zipPath -Force }
                    Compress-Archive -Path (Join-Path $tmpDir '*') -DestinationPath $zipPath

                    Write-Host 'Nahravam zip do Function App (config-zip)...'
                    az functionapp deployment source config-zip `
                        --resource-group $ResourceGroupName `
                        --name $FunctionAppName `
                        --src $zipPath -o none
                    Assert-LastExit 'Zip deploy selhal.'
                }
                finally {
                    if (Test-Path $tmpDir) { Remove-Item $tmpDir -Recurse -Force }
                    if (Test-Path $zipPath) { Remove-Item $zipPath -Force }
                }
            }
        }
        finally {
            Pop-Location
        }
    }
    Write-Host 'Kod funkce nasazen.'

    $hostName = az functionapp show -g $ResourceGroupName -n $FunctionAppName --query 'defaultHostName' -o tsv
    Assert-LastExit 'Nepodarilo se precist hostname Function App.'
    $apiUrl = 'https://' + $hostName + '/api'

    # ----------------------------------------------------------------------
    # 6. Smoke test - zkusebni dotaz na /api/chat
    # ----------------------------------------------------------------------
    $smokeInfo = 'preskocen (-SkipSmokeTest)'
    if (-not $SkipSmokeTest) {
        Write-Step 'Smoke test - zkusebni dotaz na /api/chat (par sekund, spotrebuje par tokenu)'
        $smokeBody = '{"messages":[{"role":"user","content":"Odpovez presne jednim slovem: OK"}],"conversationId":"deploy-smoke-test"}'
        # Brana na origin (od 1.7.0) je FAIL-CLOSED a plati i mimo prohlizec: volani bez
        # povolene hlavicky Origin funkce odmitne 403 'Pozadavek z nepovoleneho puvodu'.
        # Smoke test proto posila prvni povoleny origin - skript ho zna, je to jeho parametr.
        # (Bez toho hlasil SELHAL u zdraveho nasazeni; nalez P-2 z revize prirucky 09/2026.)
        $smokeOrigin = ($AllowedOrigin -split ',')[0].Trim()
        $smokeHeaders = @{ Origin = $smokeOrigin }
        $smokeInfo = 'SELHAL - overte konfiguraci'
        for ($attempt = 1; $attempt -le 3; $attempt++) {
            try {
                $resp = Invoke-RestMethod -Method Post -Uri ($apiUrl + '/chat') -Headers $smokeHeaders -ContentType 'application/json; charset=utf-8' -Body $smokeBody -TimeoutSec 120
                $modelInfo = ''
                if ($resp.PSObject.Properties['model'] -and $resp.model) { $modelInfo = ' (model: ' + $resp.model + ')' }
                Write-Host ('Odpoved AI' + $modelInfo + ': ' + $resp.content) -ForegroundColor Green
                $smokeInfo = 'OK' + $modelInfo
                break
            }
            catch {
                if ($attempt -lt 3) {
                    Write-Host ('Pokus ' + $attempt + '/3 nevysel (prvni start funkce byva pomaly) - zkousim znovu za 20 s...')
                    Start-Sleep -Seconds 20
                }
                else {
                    Write-Host ('Smoke test selhal: ' + $_.Exception.Message) -ForegroundColor Yellow
                    Write-Host ('Infrastruktura je nasazena. Nejcastejsi priciny v tomto poradi: (1) prvni start funkce jeste nedobehl - zkuste za minutu znovu; (2) ALLOWED_ORIGIN neodpovida hodnote '' + $smokeOrigin + '', kterou test posila; (3) Azure OpenAI klic/endpoint nebo stav model deploymentu.') -ForegroundColor Yellow
                }
            }
        }
    }

    # ----------------------------------------------------------------------
    # 7. Souhrn
    # ----------------------------------------------------------------------
    Write-Step 'Hotovo - souhrn'

    Write-Host ''
    Write-Host '====================================================================='
    Write-Host ' EP365 AI Chat - Azure backend nasazen'
    Write-Host '====================================================================='
    Write-Host (' Resource group        : ' + $ResourceGroupName + ' (' + $Location + ')')
    Write-Host (' Function App          : ' + $FunctionAppName)
    Write-Host (' Plan                  : ' + $PlanSku + $(if ($PlanSku -eq 'Y1') { ' (Consumption - plati se za beh)' } else { ' (dedikovany plan - pevna mesicni cena)' }))
    Write-Host (' API URL pro webpart   : ' + $apiUrl) -ForegroundColor Green
    Write-Host (' CORS (ALLOWED_ORIGIN) : ' + $AllowedOrigin)
    Write-Host (' Smoke test /api/chat  : ' + $smokeInfo + $(if ($SkipSmokeTest) { '' } else { ' (Origin: ' + $smokeOrigin + ')' }))
    Write-Host (' Zdroj kodu            : ' + $codeSourceInfo)
    Write-Host (' Azure OpenAI ucet     : ' + $aoaiAccountInfo)
    Write-Host (' Azure OpenAI endpoint : ' + $aoaiEndpoint)
    Write-Host (' Model deployment      : ' + $AzureOpenAiDeployment + ' (stav: ' + $aoaiStateInfo + ')')
    if ($AadTenantId -ne '') {
        Write-Host ' Znalostni priprava    : app settings AAD_* nastaveny ze zadanych parametru'
    }
    else {
        Write-Host ' Znalostni priprava    : nenakonfigurovana (volitelna - viz scripts/setup-enrichment.ps1)'
    }
    Write-Host '====================================================================='
    Write-Host ''
    Write-Host ' Dalsi kroky:'
    Write-Host (' 1. API URL "' + $apiUrl + '" vlozte do property pane webpartu')
    Write-Host '    EP365 AI Chat - pole "URL Azure Function".'
    if ($AadTenantId -eq '') {
        Write-Host ' 2. Pro aktivaci Znalostni pripravy (AI souhrny dokumentu) spustte'
        Write-Host '    scripts/setup-enrichment.ps1 (vytvori app registraci, granty i app settings).'
    }
    Write-Host ''
    Write-Host ' Pozn.: redeploy sablony nove ZACHOVA App Settings (AAD_*, enrich readUrl allowlist,' -ForegroundColor DarkGray
    Write-Host ' billing, hub, rate limity...) - skript si je pred nasazenim zazalohuje a po nem obnovi.' -ForegroundColor DarkGray
    Write-Host ' Parametr ma prednost: kdyz predate -AadTenantId/-AadClientId/-AadClientSecret/-SettingsSiteUrl,' -ForegroundColor DarkGray
    Write-Host ' pouzije se zadana hodnota.' -ForegroundColor DarkGray
    Write-Host ''
}
catch {
    Write-Host ''
    Write-Host ('CHYBA: ' + $_.Exception.Message) -ForegroundColor Red
    Write-Host 'Nasazeni nebylo dokonceno. Po odstraneni priciny spustte skript znovu - je idempotentni.' -ForegroundColor Red
    exit 1
}
