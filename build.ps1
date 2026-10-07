# ==============================================================================
# SketchPixel 2.5D - Script de Build (.rbz)
# ==============================================================================
[CmdletBinding()]
param(
    [switch]$Install
)

$ErrorActionPreference = "Stop"

$RootDir = $PSScriptRoot
if (-not $RootDir) { $RootDir = Get-Location }

# Extrai versao do sketchup_pixel_art.rb
$LoaderFile = Join-Path $RootDir "sketchup_pixel_art.rb"
$Version = "1.0.0"
if (Test-Path $LoaderFile) {
    $VersionMatch = Select-String -Path $LoaderFile -Pattern "ext\.version\s*=\s*'([^']+)'"
    if ($VersionMatch -and $VersionMatch.Matches.Groups.Count -gt 1) {
        $Version = $VersionMatch.Matches.Groups[1].Value
    }
}

$DistDir = Join-Path $RootDir "dist"
if (-not (Test-Path $DistDir)) {
    New-Item -ItemType Directory -Path $DistDir | Out-Null
}

$OutputRbz = Join-Path $DistDir "sketchpixel_v$Version.rbz"
$TempZip = Join-Path $DistDir "temp_build.zip"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  SketchPixel 2.5D - Compilando Plugin  " -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Versão detectada: $Version" -ForegroundColor Yellow

if (Test-Path $TempZip) { Remove-Item $TempZip -Force }
if (Test-Path $OutputRbz) { Remove-Item $OutputRbz -Force }

# Pasta temporária para montagem da raiz limpa
$StagingDir = Join-Path $DistDir "staging"
if (Test-Path $StagingDir) { Remove-Item $StagingDir -Recurse -Force }
New-Item -ItemType Directory -Path $StagingDir | Out-Null

Write-Host "Copiando arquivos para o pacote..." -ForegroundColor Gray
Copy-Item -Path $LoaderFile -Destination (Join-Path $StagingDir "sketchup_pixel_art.rb")
Copy-Item -Path (Join-Path $RootDir "sketchup_pixel_art") -Destination $StagingDir -Recurse

# Cria o arquivo ZIP/RBZ a partir da raiz limpa de staging com barras normatizadas (/)
Write-Host "Compactando pacote .rbz..." -ForegroundColor Gray
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem


$ZipStream = [System.IO.File]::Create($OutputRbz)
$Archive = New-Object System.IO.Compression.ZipArchive($ZipStream, [System.IO.Compression.ZipArchiveMode]::Create)

Get-ChildItem -Path $StagingDir -Recurse -File | ForEach-Object {
    $RelPath = $_.FullName.Substring($StagingDir.Length).TrimStart('\', '/').Replace('\', '/')
    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($Archive, $_.FullName, $RelPath, [System.IO.Compression.CompressionLevel]::Optimal) | Out-Null
}

$Archive.Dispose()
$ZipStream.Dispose()


# Limpa staging
Remove-Item $StagingDir -Recurse -Force

Write-Host "Sucesso! Arquivo gerado:" -ForegroundColor Green
$RbzItem = Get-Item $OutputRbz
Write-Host "  -> $($RbzItem.FullName) ($([Math]::Round($RbzItem.Length / 1KB, 2)) KB)" -ForegroundColor White

# Validar conteudo do pacote
Write-Host "`nConteúdo verificado do pacote .rbz:" -ForegroundColor Cyan
$Zip = [System.IO.Compression.ZipFile]::OpenRead($OutputRbz)
$Zip.Entries | ForEach-Object {
    Write-Host "  [OK] $($_.FullName)" -ForegroundColor DarkGray
}
$Zip.Dispose()

# Instalacao opcional no SketchUp local se solicitado
if ($Install) {
    Write-Host "`nProcurando instalações do SketchUp..." -ForegroundColor Cyan
    $AppData = [Environment]::GetFolderPath('ApplicationData')
    $SketchUpBase = Join-Path $AppData "SketchUp"
    
    if (Test-Path $SketchUpBase) {
        $InstalledCount = 0
        Get-ChildItem -Path $SketchUpBase -Directory -Filter "SketchUp *" | ForEach-Object {
            $PluginsPath = Join-Path $_.FullName "SketchUp\Plugins"
            if (Test-Path $PluginsPath) {
                Write-Host "Instalando em: $PluginsPath" -ForegroundColor Yellow
                Copy-Item -Path $LoaderFile -Destination $PluginsPath -Force
                Copy-Item -Path (Join-Path $RootDir "sketchup_pixel_art") -Destination $PluginsPath -Recurse -Force
                $InstalledCount++
            }
        }
        if ($InstalledCount -gt 0) {
            Write-Host "Extensão instalada diretamente em $InstalledCount versão(ões) do SketchUp!" -ForegroundColor Green
        } else {
            Write-Host "Nenhuma pasta Plugins encontrada em $SketchUpBase." -ForegroundColor DarkYellow
        }
    } else {
        Write-Host "Pasta do SketchUp não encontrada em AppData." -ForegroundColor DarkYellow
    }
}

Write-Host "`nPronto! Para instalar:" -ForegroundColor Green
Write-Host "1. No SketchUp: Janela > Gerenciador de Extensões > Instalar Extensão" -ForegroundColor White
Write-Host "2. Selecione o arquivo: dist/sketchpixel_v$Version.rbz" -ForegroundColor White
