# Genera el zip de despliegue para justrunmy/wispbyte con la API .NET ZipArchive.
# Reglas documentadas en PENDIENTES.md: rutas con '/', sin entradas de directorio vacias,
# sin node_modules/.git/.env/cookies.txt/galaxy-dashboard.html/*.zip/*.log.
param(
    [string]$Out = "deploy-justrunmy-v6.zip",
    [string]$Root = $PSScriptRoot
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$excludeDirs = @('.git', 'node_modules')
$excludeFiles = @('.env', 'cookies.txt', 'galaxy-dashboard.html', '.DS_Store')

if (Test-Path (Join-Path $Root $Out)) { Remove-Item (Join-Path $Root $Out) -Force }
$zipPath = Join-Path $Root $Out
$fs = [System.IO.File]::Open($zipPath, 'Create')
$zip = New-Object System.IO.Compression.ZipArchive($fs, [System.IO.Compression.ZipArchiveMode]::Create)

$count = 0
Get-ChildItem -LiteralPath $Root -Recurse -File | ForEach-Object {
    $rel = $_.FullName.Substring($Root.Length).TrimStart('\', '/')
    $parts = $rel -split '[\\/]'
    if ($parts | Where-Object { $excludeDirs -contains $_ }) { return }
    $name = $parts[-1]
    if ($excludeFiles -contains $name) { return }
    if ($name -like '*.log' -or $name -like '*.zip') { return }

    $entryName = ($parts -join '/')
    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $_.FullName, $entryName) | Out-Null
    $count++
}

$zip.Dispose()
$fs.Dispose()
Write-Host "OK: $Out generado con $count entradas"
