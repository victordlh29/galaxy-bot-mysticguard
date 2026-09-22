param(
    [string]$Password = "youshallnotpass",
    [int]$Port = 2333,
    [switch]$NoJavaDownload
)
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot

$jarUrl = "https://github.com/lavalink-devs/Lavalink/releases/download/4.2.2/Lavalink.jar"
$jarSha = "8cb801e591072c3689fafd71ccf571a95a4ead3cc35dfc045e157d763d89119a"
$jarPath = Join-Path $PSScriptRoot "Lavalink.jar"

# --- Java: busca un JRE 21 portable local; si no, uno del sistema (17+); si no, descarga ---
$java = $null
$portableJava = Join-Path $PSScriptRoot "jre\bin\java.exe"
if (Test-Path -LiteralPath $portableJava) {
    $java = $portableJava
    Write-Host "Usando JRE portable: $portableJava"
} elseif (Get-Command java -ErrorAction SilentlyContinue) {
    $sysVer = (& java -version 2>&1 | Select-Object -First 1 | Out-String)
    if ($sysVer -match '"(\d+)') {
        $sysMajor = [int]$Matches[1]
        if ($sysMajor -ge 17) {
            $java = "java"
            Write-Host "Usando Java del sistema: $($sysVer.Trim())"
        } else {
            Write-Host "Java del sistema $($sysVer.Trim()) < 17; descargando JRE portable 21..."
        }
    }
} else {
    Write-Host "No hay Java; descargando JRE portable 21..."
}

if (-not $java) {
    if ($NoJavaDownload) { Write-Host "Falta Java 17+. Ve a https://adoptium.net e instala Temurin 21."; exit 1 }
    $jreZip = Join-Path $PSScriptRoot "jre.zip"
    Write-Host "Descargando JRE 21 portable (~45 MB)..."
    Invoke-WebRequest -Uri "https://api.adoptium.net/v3/binary/latest/21/ga/windows/x64/jre/hotspot/normal/eclipse" -OutFile $jreZip
    $dest = Join-Path $PSScriptRoot "jre_extract"
    if (Test-Path -LiteralPath $dest) { Remove-Item -LiteralPath $dest -Recurse -Force }
    Expand-Archive -LiteralPath $jreZip -DestinationPath $dest
    Remove-Item -LiteralPath $jreZip -Force
    $inner = Get-ChildItem -LiteralPath $dest -Directory | Select-Object -First 1
    Move-Item -LiteralPath $inner.FullName -Destination (Join-Path $PSScriptRoot "jre")
    Remove-Item -LiteralPath $dest -Recurse -Force
    $java = $portableJava
    Write-Host "JRE portable listo: $java"
}

& $java -version 2>&1 | Select-Object -First 1 | ForEach-Object { Write-Host "Java OK: $_" }

if (-not (Test-Path -LiteralPath $jarPath)) {
    Write-Host "Descargando Lavalink 4.2.2 (~100 MB), primera vez..."
    Invoke-WebRequest -Uri $jarUrl -OutFile $jarPath
    $hash = Get-FileHash -Algorithm SHA256 -LiteralPath $jarPath
    if ($hash.Hash -ne $jarSha) {
        Write-Host "Checksum no coincide ($($hash.Hash)); borrando para reintentar."
        Remove-Item -LiteralPath $jarPath -Force
        exit 1
    }
    Write-Host "Lavalink.jar descargado y verificado (SHA256 OK)."
} else {
    Write-Host "Lavalink.jar ya presente."
}

$cfg = @"
server:
  port: $Port
  address: 0.0.0.0

lavalink:
  server:
    password: "$Password"
    playerUpdateInterval: 5s
    sources:
      youtube: true
      soundcloud: true
      bandcamp: true
      twitch: true
      vimeo: true
      http: true
    opusEncodingQuality: 10
    trackStuckThresholdMs: 10000

logging:
  level:
    root: INFO
    lavalink: INFO
"@
Set-Content -LiteralPath (Join-Path $PSScriptRoot "application.yml") -Value $cfg -Encoding utf8

Write-Host ""
Write-Host "NODO LAVALINK LOCAL escuchando en 127.0.0.1:$Port (password: $Password)"
Write-Host "Tu IP publica (para el panel del bot si el bot corre en el hosting):"
try {
    $ip = (Invoke-RestMethod -Uri "https://api.ipify.org")
    Write-Host "  -> $ip"
} catch {
    Write-Host "  (no se pudo consultar api.ipify.org; revisa la consola del router)"
}
Write-Host "Prueba local rapida: http://localhost:$Port/v4/info en el navegador debe dar JSON"
Write-Host "Si el bot corre en un hosting: abre el puerto $Port (TCP) en el router hacia este PC"
Write-Host "y pon esa IP en LAVALINK_NODES. Ctrl+C apaga el nodo."
Write-Host ""
& $java -XX:+UseZGC -jar $jarPath