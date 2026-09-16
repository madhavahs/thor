$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir = Split-Path -Parent $ScriptDir
$BinDir = Join-Path $RootDir "bin"

if (!(Test-Path $BinDir)) { New-Item -ItemType Directory -Path $BinDir | Out-Null }

$CliExe = Join-Path $BinDir "arduino-cli.exe"

if (!(Test-Path $CliExe) -and !(Get-Command arduino-cli -ErrorAction SilentlyContinue)) {
    Write-Host "Downloading arduino-cli for Windows (64-bit)..." -ForegroundColor Cyan
    $Url = "https://downloads.arduino.cc/arduino-cli/arduino-cli_latest_Windows_64bit.zip"
    $ZipFile = Join-Path $BinDir "arduino-cli.zip"
    Invoke-WebRequest -Uri $Url -OutFile $ZipFile
    Expand-Archive -Path $ZipFile -DestinationPath $BinDir -Force
    Remove-Item $ZipFile -Force
    Write-Host "arduino-cli installed to $BinDir" -ForegroundColor Green
} else {
    Write-Host "arduino-cli already present." -ForegroundColor Green
}

$Env:PATH = "$BinDir;" + $Env:PATH
$cli = if (Get-Command arduino-cli -ErrorAction SilentlyContinue) { "arduino-cli" } else { $CliExe }

Write-Host "Initializing Arduino CLI config..." -ForegroundColor Cyan
& $cli config init --overwrite
& $cli config set board_manager.additional_urls "https://espressif.github.io/arduino-esp32/package_esp32_index.json"
& $cli core update-index

Write-Host "Installing ESP32 core package (this may take a few minutes)..." -ForegroundColor Cyan
& $cli core install esp32:esp32@3.1.1

Write-Host "Toolchain installation complete!" -ForegroundColor Green
& $cli version
& $cli core list
