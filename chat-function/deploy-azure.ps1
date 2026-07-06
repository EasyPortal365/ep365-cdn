<#
.SYNOPSIS
    Nasadi kompletni Azure backend pro EP365 AI Chat (ep365-chat-function) u zakaznika.

.DESCRIPTION
    Skript provede:
      1. Overeni prihlaseni do Azure CLI (az login) a volitelne nastaveni subscription.
      2. Vytvoreni resource group (idempotentni).
      3. Azure OpenAI:
         - kdyz predate -AzureOpenAiEndpoint + -AzureOpenAiKey, pouzije se existujici ucet;
         - jinak skript vytvori novy Azure OpenAI ucet + model deployment (default gpt-4o).
      4. Nasazeni infrastruktury (Function App, Storage Account, Application Insights,
         App Settings) - lokalni infra/main.bicep, nebo (kdyz skript nebezi v repu)
         ARM sablona z CDN EasyPortal365.
      5. Nasazeni kodu funkce:
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

    POZOR: opakovane nasazeni sablony PREPISUJE App Settings. Pokud uz byla aktivovana
    Znalostni priprava (AAD_*), predejte pri redeployi i parametry -AadTenantId,
    -AadClientId, -AadClientSecret a -SettingsSiteUrl - jinak se hodnoty smazou
    a Znalostni priprava se tise vypne.

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

.PARAMETER SubscriptionId
    Volitelny. Id subscription, pokud nechcete nasazovat do aktualne vybrane.

.PARAMETER AzureOpenAiEndpoint
    Volitelny. URL existujiciho Azure OpenAI uctu (https://contoso-openai.openai.azure.com).
    Zadava se SPOLU s -AzureOpenAiKey. Kdyz chybi, skript ucet vytvori sam.

.PARAMETER AzureOpenAiKey
    Volitelny. API klic existujiciho Azure OpenAI uctu.

.PARAMETER AzureOpenAiDeployment
    Nazev model deploymentu v Azure OpenAI. Default: gpt-4o.

.PARAMETER OpenAiAccountName
    Nazev noveho Azure OpenAI uctu (jen kdyz se vytvari). Default: <FunctionAppName>-openai.

.PARAMETER OpenAiLocation
    Region noveho Azure OpenAI uctu. Default: swedencentral.

.PARAMETER OpenAiModelName
    Model pro novy deployment. Default: gpt-4o.

.PARAMETER OpenAiModelVersion
    Verze modelu. Default: 2024-08-06.

.PARAMETER OpenAiSkuName
    SKU model deploymentu. Default: GlobalStandard.

.PARAMETER OpenAiSkuCapacity
    Kapacita deploymentu (v tisicich TPM). Default: 10.

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
        -AzureOpenAiKey "<api-klic>" -AzureOpenAiDeployment gpt-4o

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

    # Existujici Azure OpenAI (kdyz jsou zadane endpoint + klic, novy ucet se nevytvari)
    [string]$AzureOpenAiEndpoint = '',
    [string]$AzureOpenAiKey = '',
    [string]$AzureOpenAiDeployment = 'gpt-4o',

    # Novy Azure OpenAI ucet (pouzije se jen kdyz endpoint + klic nejsou zadane)
    [string]$OpenAiAccountName = '',
    [string]$OpenAiLocation = 'swedencentral',
    [string]$OpenAiModelName = 'gpt-4o',
    [string]$OpenAiModelVersion = '2024-08-06',
    [string]$OpenAiSkuName = 'GlobalStandard',
    [int]$OpenAiSkuCapacity = 10,

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

$scriptDir = $PSScriptRoot
if (-not $scriptDir) { $scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path }
$repoRoot = Split-Path -Parent $scriptDir

# CDN EasyPortal365 - hostuje ARM sablonu a release zip kodu pro beh mimo repo
# (typicky Azure Cloud Shell). URL zipu aktualizuje EasyPortal365 pri kazdem release
# (viz scripts/build-release-zip.ps1).
$CdnTemplateUrl = 'https://cdn.easyportal365.cz/chat-function/main.json'
$CdnPackageUrl  = 'https://cdn.easyportal365.cz/chat-function/ep365-chat-function-1.1.1.zip'

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

    # Sablona infrastruktury: lokalni infra/main.bicep (beh v repu), jinak ARM z CDN.
    $templatePath = Join-Path (Join-Path $repoRoot 'infra') 'main.bicep'
    $useLocalTemplate = Test-Path $templatePath
    if ($useLocalTemplate) {
        Write-Host ('Sablona infrastruktury: lokalni (' + $templatePath + ')')
    }
    else {
        Write-Host ('Sablona infrastruktury: CDN (' + $CdnTemplateUrl + ') - skript nebezi v repu se zdrojaky.')
    }

    # ----------------------------------------------------------------------
    # 2. Resource group (idempotentni)
    # ----------------------------------------------------------------------
    Write-Step ('Resource group "' + $ResourceGroupName + '" (' + $Location + ')')

    az group create --name $ResourceGroupName --location $Location -o none
    Assert-LastExit 'Vytvoreni resource group selhalo.'
    Write-Host 'Resource group pripravena.'

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
            Write-Host 'Ucet neexistuje - vytvarim (muze trvat 1-2 minuty)...'
            az cognitiveservices account create `
                --name $OpenAiAccountName `
                --resource-group $ResourceGroupName `
                --location $OpenAiLocation `
                --kind OpenAI `
                --sku S0 `
                --custom-domain $OpenAiAccountName `
                --yes -o none
            Assert-LastExit ('Vytvoreni Azure OpenAI uctu selhalo. Casta pricina: chybejici kvota pro Azure OpenAI v regionu ' + $OpenAiLocation + ' nebo jiz obsazeny nazev. Zkuste jiny region (-OpenAiLocation) nebo jiny nazev (-OpenAiAccountName).')
            Write-Host 'Ucet vytvoren.'
        }
        else {
            Write-Host 'Ucet uz existuje - preskakuji vytvoreni.'
        }

        $depCount = az cognitiveservices account deployment list -g $ResourceGroupName -n $OpenAiAccountName --query ("length([?name=='" + $AzureOpenAiDeployment + "'])") -o tsv
        Assert-LastExit 'Kontrola existence model deploymentu selhala.'

        if ([int]$depCount -eq 0) {
            Write-Host ('Vytvarim model deployment "' + $AzureOpenAiDeployment + '" (' + $OpenAiModelName + ' ' + $OpenAiModelVersion + ', ' + $OpenAiSkuName + ' ' + $OpenAiSkuCapacity + ')...')
            az cognitiveservices account deployment create `
                --resource-group $ResourceGroupName `
                --name $OpenAiAccountName `
                --deployment-name $AzureOpenAiDeployment `
                --model-name $OpenAiModelName `
                --model-version $OpenAiModelVersion `
                --model-format OpenAI `
                --sku-name $OpenAiSkuName `
                --sku-capacity $OpenAiSkuCapacity -o none
            Assert-LastExit ('Vytvoreni model deploymentu selhalo. Casta pricina: model ' + $OpenAiModelName + ' (' + $OpenAiModelVersion + ') neni v regionu ' + $OpenAiLocation + ' dostupny, nebo chybi kvota pro SKU ' + $OpenAiSkuName + '.')
            Write-Host 'Model deployment vytvoren.'
        }
        else {
            Write-Host ('Model deployment "' + $AzureOpenAiDeployment + '" uz existuje - preskakuji vytvoreni.')
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
        'packageUrl='
    )
    # Volitelne parametry Znalostni pripravy - predavaji se JEN kdyz jsou zadane
    # (sablona ma pro ne prazdne defaulty).
    if ($AadTenantId -ne '')     { $bicepParams += ('aadTenantId=' + $AadTenantId) }
    if ($AadClientId -ne '')     { $bicepParams += ('aadClientId=' + $AadClientId) }
    if ($AadClientSecret -ne '') { $bicepParams += ('aadClientSecret=' + $AadClientSecret) }
    if ($SettingsSiteUrl -ne '') { $bicepParams += ('settingsSiteUrl=' + $SettingsSiteUrl) }

    if ($useLocalTemplate) {
        az deployment group create `
            --resource-group $ResourceGroupName `
            --name $deployName `
            --template-file $templatePath `
            --parameters $bicepParams -o none
    }
    else {
        az deployment group create `
            --resource-group $ResourceGroupName `
            --name $deployName `
            --template-uri $CdnTemplateUrl `
            --parameters $bicepParams -o none
    }
    Assert-LastExit 'Nasazeni sablony selhalo. Detail chyby viz vystup vyse (pripadne Azure Portal -> resource group -> Deployments).'
    Write-Host 'Infrastruktura nasazena (Function App, Storage Account, Application Insights, App Settings).'

    # ----------------------------------------------------------------------
    # 5. Kod funkce - release zip (CDN / -PackageUrl), nebo build ze zdrojaku
    # ----------------------------------------------------------------------
    Write-Step 'Nasazuji kod funkce'

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
        $smokeInfo = 'SELHAL - overte konfiguraci'
        for ($attempt = 1; $attempt -le 3; $attempt++) {
            try {
                $resp = Invoke-RestMethod -Method Post -Uri ($apiUrl + '/chat') -ContentType 'application/json; charset=utf-8' -Body $smokeBody -TimeoutSec 120
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
                    Write-Host 'Infrastruktura je nasazena; zkontrolujte Azure OpenAI klic/endpoint a stav model deploymentu (Environment variables Function App), pripadne zopakujte test dle casti A.6 instalacni prirucky.' -ForegroundColor Yellow
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
    Write-Host (' API URL pro webpart   : ' + $apiUrl) -ForegroundColor Green
    Write-Host (' CORS (ALLOWED_ORIGIN) : ' + $AllowedOrigin)
    Write-Host (' Smoke test /api/chat  : ' + $smokeInfo)
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
    Write-Host ' POZOR: opakovane nasazeni sablony prepisuje App Settings Function App.' -ForegroundColor Yellow
    Write-Host ' Pokud pozdeji aktivujete Znalostni pripravu a budete sablonu nasazovat' -ForegroundColor Yellow
    Write-Host ' znovu, predejte i -AadTenantId/-AadClientId/-AadClientSecret/-SettingsSiteUrl,' -ForegroundColor Yellow
    Write-Host ' jinak se tyto hodnoty smazou a Znalostni priprava se tise vypne.' -ForegroundColor Yellow
    Write-Host ''
}
catch {
    Write-Host ''
    Write-Host ('CHYBA: ' + $_.Exception.Message) -ForegroundColor Red
    Write-Host 'Nasazeni nebylo dokonceno. Po odstraneni priciny spustte skript znovu - je idempotentni.' -ForegroundColor Red
    exit 1
}
