# Genera el zip de despliegue para justrunmy/HeavenCloud con la API .NET ZipArchive.
# Reglas documentadas en PENDIENTES.md: rutas con '/', sin entradas de directorio vacias,
# sin node_modules/.git/.env/cookies.txt/galaxy-dashboard.html/*.zip/*.log.
# .ytdlp-tmp = dir TMPDIR de yt-dlp (extracciones PyInstaller) en el host, no se sube.
# vendor/ = POT provider (bgutil) + plugin de yt-dlp: sin uso desde que la musica va
# por Lavalink/Riffy (21/09/2026); se excluye para que el zip no arrastre ~30 MB muertos.
# lavalink-local/ = nodo Lavalink del PC de casa: nunca va al hosting.
param(
    [string]$Out = "deploy-justrunmy-v18.zip",
    [string]$Root = $PSScriptRoot
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$excludeDirs = @('.git', 'node_modules', '.ytdlp-tmp', 'lavalink-local', 'vendor')
$excludeFiles = @('.env', 'cookies.txt', 'galaxy-dashboard.html', '.DS_Store', 'bot.pid', 'diag.js')

if (Test-Path (Join-Path $Root $Out)) { Remove-Item (Join-Path $Root $Out) -Force }
$zipPath = Join-Path $Root $Out
$fs = [System.IO.File]::Open($zipPath, 'Create')
$zip = New-Object System.IO.Compression.ZipArchive($fs, [System.IO.Compression.ZipArchiveMode]::Create)

$count = 0
Get-ChildItem -LiteralPath $Root -Recurse -File | ForEach-Object {
    $rel = $_.FullName.Substring($Root.Length).TrimStart('\', '/')
    $parts = $rel -split '[\\/]'
    if ($parts | Where-Object { $excludeDirs -contains $_ -or $_ -like '_MEI*' }) { return }
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
