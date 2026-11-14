# Builds dist\Steel Meridian.exe: one file with the whole game packed inside.
# Uses only what ships with Windows (the .NET Framework C# compiler). Run again after changing the game:
#     powershell -ExecutionPolicy Bypass -File tools\build-exe.ps1
$ErrorActionPreference = 'Stop'
$tools = Split-Path -Parent $MyInvocation.MyCommand.Path
$game  = Split-Path -Parent $tools
$dist  = Join-Path $game 'dist'
$work  = Join-Path $env:TEMP ('steel-meridian-build-' + [guid]::NewGuid().ToString('N'))
$stage = Join-Path $work 'game'
New-Item -ItemType Directory -Force $stage, $dist | Out-Null

# 1. Stage the files the game needs (no backups, no tools, no previous builds).
Copy-Item (Join-Path $game 'index.html'), (Join-Path $game 'game.js'), (Join-Path $game 'lang.js'), (Join-Path $game 'icon.png') $stage
foreach ($dir in 'assets', 'sounds', 'music') {
    $src = Join-Path $game $dir
    if (Test-Path $src) { Copy-Item $src (Join-Path $stage $dir) -Recurse }
}

# 2. Zip them.
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = Join-Path $work 'game.zip'
[System.IO.Compression.ZipFile]::CreateFromDirectory($stage, $zip, [System.IO.Compression.CompressionLevel]::Optimal, $false)

# 3. Compile the launcher with the zip and icon inside it.
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$src = Join-Path $work 'launcher.cs'
(Get-Content (Join-Path $tools 'launcher.cs') -Raw).Replace('@BUILD@', $stamp) | Set-Content $src -Encoding UTF8
$csc = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if (-not (Test-Path $csc)) { $csc = Join-Path $env:WINDIR 'Microsoft.NET\Framework\v4.0.30319\csc.exe' }
if (-not (Test-Path $csc)) { throw 'The .NET Framework C# compiler (csc.exe) was not found.' }
$exe = Join-Path $dist 'Steel Meridian.exe'
& $csc /nologo /target:winexe /optimize+ /platform:anycpu "/out:$exe" "/win32icon:$(Join-Path $game 'icon.ico')" `
    "/resource:$zip,game.zip" /r:System.dll /r:System.Core.dll /r:System.Windows.Forms.dll /r:System.IO.Compression.dll /r:System.IO.Compression.FileSystem.dll $src
if ($LASTEXITCODE -ne 0) { throw "Compile failed (exit $LASTEXITCODE)." }

Remove-Item $work -Recurse -Force
$f = Get-Item $exe
"Built: $($f.FullName)"
"Size:  {0:N1} MB   Build: $stamp" -f ($f.Length / 1MB)
