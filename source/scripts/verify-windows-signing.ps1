$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
$packageInfo = Get-Content -LiteralPath (Join-Path $taskRoot 'package.json') -Raw | ConvertFrom-Json
$signingConfigPath = Join-Path $taskRoot 'build/windows-signing.json'
if (!(Test-Path -LiteralPath $signingConfigPath)) { throw 'Configure your verified public publisher before checking signatures. See WINDOWS-SIGNING-SETUP.md.' }
$signingConfig = Get-Content -LiteralPath $signingConfigPath -Raw | ConvertFrom-Json
if ($signingConfig.profileType -ne 'PublicTrust' -or !$signingConfig.publisherName -or $signingConfig.publisherName -match 'REPLACE') { throw 'A real PublicTrust publisher configuration is required.' }
$expectedPublisher = $signingConfig.publisherName
$releaseRoot = Join-Path $taskRoot 'release'
$installerPath = Join-Path $releaseRoot ('Sloth-Client-Setup-' + $packageInfo.version + '.exe')
$applicationRoot = Join-Path $releaseRoot 'win-unpacked'
if (!(Test-Path -LiteralPath $installerPath) -or !(Test-Path -LiteralPath $applicationRoot)) { throw 'Build this version before checking Windows signatures.' }
$applicationPath = Join-Path $applicationRoot 'Sloth Client.exe'
if (!(Test-Path -LiteralPath $applicationPath)) { throw 'Expected Sloth Client executable is missing.' }
$filesToVerify = @(Get-Item -LiteralPath $installerPath) + @(Get-ChildItem -LiteralPath $applicationRoot -Recurse -File | Where-Object { $_.Extension -in '.exe', '.dll', '.node' })
$failures = @()
foreach ($artifact in $filesToVerify) {
    $signature = Get-AuthenticodeSignature -LiteralPath $artifact.FullName
    if ($signature.Status -ne 'Valid' -or !$signature.TimeStamperCertificate) {
        $failures += ($artifact.Name + ': ' + $signature.Status + '; trusted timestamp=' + [bool]$signature.TimeStamperCertificate)
    }
    if ($artifact.FullName -eq $installerPath -or $artifact.Name -eq 'Sloth Client.exe') {
        if (!$signature.SignerCertificate -or $signature.SignerCertificate.GetNameInfo([System.Security.Cryptography.X509Certificates.X509NameType]::SimpleName, $false) -cne $expectedPublisher) {
            $failures += ($artifact.Name + ': publisher does not match the verified identity')
        }
    }
}
if ($failures.Count) { throw ('Release blocked: Windows signature checks failed. ' + ($failures -join ', ')) }
Write-Output ('Valid timestamped Windows signatures verified for ' + $filesToVerify.Count + ' binaries.')
