# Demo Kitchen setup for Windows. Makes sure Node 22+, ffmpeg, gifski and a Chromium browser are available,
# downloading private copies into %USERPROFILE%\.demo-kitchen\tools when they're missing. No installer, no admin rights.
# Safe to run again: anything already there is skipped. Last line printed is the node to launch Demo Kitchen with.
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File setup.ps1          install what's missing
#   powershell -NoProfile -ExecutionPolicy Bypass -File setup.ps1 -Check   only report, download nothing
#
# Plain ASCII on purpose: Windows PowerShell 5.1 misreads UTF-8 scripts without a BOM.
param([switch]$Check)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'   # Invoke-WebRequest is many times faster without the progress bar
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$Tools = Join-Path $HOME '.demo-kitchen\tools'
$Bin = Join-Path $Tools 'bin'
$Fresh = [bool]$env:DK_FRESH   # ignore tools already on the PC (for testing the downloads)
$Arch = if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64') { 'arm64' } else { 'x64' }

$NodeVersion = '22.23.4'
$NodeSha = @{ x64 = 'cbc74b5e0982c9dbb41525fd8fb5dcd32fbee237863f7829072f4639a1ce5f20'; arm64 = 'a8b8cd79cbbb3062435f449591d98dd63730bbbf30ce2d7cc3a6376c236cb111' }
$FfmpegUrl = 'https://github.com/eugeneware/ffmpeg-static/releases/download/b6.1.1/ffmpeg-win32-x64.gz'   # x64 also runs on ARM PCs
$FfmpegSha = '8883a3dffbd0a16cf4ef95206ea05283f78908dbfb118f73c83f4951dcc06d77'
$GifskiUrl = 'https://github.com/ImageOptim/gifski/releases/download/1.34.0/gifski-1.34.0.tar.xz'
$GifskiSha = 'b9b6591aa163123d737353d9c8581efdf3234d28eeaa45329b31da905cd5a996'
$ChromeJson = 'https://googlechromelabs.github.io/chrome-for-testing/last-known-good-versions-with-downloads.json'

function Ok($m)   { Write-Output "OK    $m" }
function Todo($m) { Write-Output "...   $m" }
function Fail($m) { Write-Output "ERROR $m"; exit 1 }

function Fetch($url, $file, $sha) {
  try { Invoke-WebRequest -UseBasicParsing -Uri $url -OutFile $file } catch { Fail "Couldn't download $url. Check your internet connection and try again." }
  if ($sha) {
    $got = (Get-FileHash -Algorithm SHA256 $file).Hash.ToLower()
    if ($got -ne $sha) { Remove-Item $file -Force; Fail "The download of $(Split-Path $url -Leaf) didn't match its checksum, so it wasn't used." }
  }
}

function Find-Exe($name) {
  $p = Join-Path $Bin "$name.exe"
  if (Test-Path $p) { return $p }
  if ($Fresh) { return $null }
  $c = Get-Command "$name.exe" -ErrorAction SilentlyContinue
  if ($c) { return $c.Source }
  return $null
}

New-Item -ItemType Directory -Force -Path $Bin | Out-Null
$Work = Join-Path ([IO.Path]::GetTempPath()) ("demo-kitchen-setup-" + [guid]::NewGuid())
New-Item -ItemType Directory -Force -Path $Work | Out-Null

try {
  # ---- Node 22+ ----
  $Node = $null
  $candidates = @((Join-Path $Tools 'node\node.exe'))
  if (-not $Fresh) { $sys = Get-Command node.exe -ErrorAction SilentlyContinue; if ($sys) { $candidates += $sys.Source } }
  foreach ($n in $candidates) {
    if (-not (Test-Path $n)) { continue }
    try { $major = [int](& $n -p "process.versions.node.split('.')[0]") } catch { $major = 0 }
    if ($major -ge 22) { $Node = $n; break }
  }
  if ($Node) { Ok 'Node is ready' }
  elseif ($Check) { Todo 'Node 22 needs to be downloaded (about 30 MB)' }
  else {
    Todo 'Downloading Node (about 30 MB)...'
    $name = "node-v$NodeVersion-win-$Arch"
    Fetch "https://nodejs.org/dist/v$NodeVersion/$name.zip" (Join-Path $Work 'node.zip') $NodeSha[$Arch]
    Expand-Archive -Path (Join-Path $Work 'node.zip') -DestinationPath $Work -Force
    $dest = Join-Path $Tools 'node'
    if (Test-Path $dest) { Remove-Item $dest -Recurse -Force }
    Move-Item (Join-Path $Work $name) $dest
    $Node = Join-Path $dest 'node.exe'
    Ok 'Node is ready'
  }

  # ---- ffmpeg (video encoder) ----
  if (Find-Exe 'ffmpeg') { Ok 'Video encoder (ffmpeg) is ready' }
  elseif ($Check) { Todo 'Video encoder (ffmpeg) needs to be downloaded (about 30 MB)' }
  else {
    Todo 'Downloading the video encoder (about 30 MB)...'
    $gz = Join-Path $Work 'ffmpeg.gz'
    Fetch $FfmpegUrl $gz $FfmpegSha
    $in = [IO.File]::OpenRead($gz)
    $out = [IO.File]::Create((Join-Path $Bin 'ffmpeg.exe'))
    $unzip = New-Object IO.Compression.GZipStream($in, [IO.Compression.CompressionMode]::Decompress)
    $unzip.CopyTo($out); $unzip.Dispose(); $out.Dispose(); $in.Dispose()
    & (Join-Path $Bin 'ffmpeg.exe') -version | Out-Null
    if ($LASTEXITCODE -ne 0) { Fail "The video encoder downloaded but won't run on this PC." }
    Ok 'Video encoder (ffmpeg) is ready'
  }

  # ---- gifski (GIF encoder; optional, ffmpeg makes GIFs too) ----
  if (Find-Exe 'gifski') { Ok 'GIF encoder (gifski) is ready' }
  elseif ($Check) { Todo 'GIF encoder (gifski) needs to be downloaded (about 15 MB)' }
  else {
    Todo 'Downloading the GIF encoder (about 15 MB)...'
    $done = $false
    try {
      $xz = Join-Path $Work 'gifski.tar.xz'
      Invoke-WebRequest -UseBasicParsing -Uri $GifskiUrl -OutFile $xz
      if ((Get-FileHash -Algorithm SHA256 $xz).Hash.ToLower() -eq $GifskiSha) {
        & (Join-Path $env:SystemRoot 'System32\tar.exe') -xf $xz -C $Work 'win/gifski.exe' 2>$null
        $exe = Join-Path $Work 'win\gifski.exe'
        if (Test-Path $exe) { Move-Item $exe (Join-Path $Bin 'gifski.exe') -Force; $done = $true }
      }
    } catch { }
    if ($done) { Ok 'GIF encoder (gifski) is ready' } else { Ok 'GIF encoder skipped. GIFs will be made with ffmpeg instead (slightly bigger files)' }
  }

  # ---- A Chromium browser (renders the frames, runs hidden). Edge ships with Windows. ----
  $roots = @($env:ProgramFiles, ${env:ProgramFiles(x86)}, $env:LOCALAPPDATA) | Where-Object { $_ }
  $browsers = @()
  if (-not $Fresh) {
    if ($env:CHROME_PATH) { $browsers += $env:CHROME_PATH }
    foreach ($r in $roots) { $browsers += (Join-Path $r 'Google\Chrome\Application\chrome.exe') }
    foreach ($r in $roots) { $browsers += (Join-Path $r 'Microsoft\Edge\Application\msedge.exe') }
  }
  $browsers += (Join-Path $Tools 'chrome\chrome-win64\chrome.exe')
  $Browser = $browsers | Where-Object { Test-Path $_ } | Select-Object -First 1
  if ($Browser) { Ok 'Browser for rendering is ready' }
  elseif ($Check) { Todo 'A private Chrome needs to be downloaded (about 170 MB)' }
  else {
    Todo 'No Chrome or Edge found. Downloading a private copy just for Demo Kitchen (about 170 MB)...'
    $info = Invoke-RestMethod -UseBasicParsing -Uri $ChromeJson
    $url = ($info.channels.Stable.downloads.chrome | Where-Object { $_.platform -eq 'win64' }).url
    if (-not $url) { Fail "Couldn't find a Chrome download. Installing Google Chrome from google.com/chrome also works." }
    $zip = Join-Path $Work 'chrome.zip'
    Fetch $url $zip $null
    $dest = Join-Path $Tools 'chrome'
    if (Test-Path $dest) { Remove-Item $dest -Recurse -Force }
    Expand-Archive -Path $zip -DestinationPath $dest -Force
    Ok 'Browser for rendering is ready'
  }

  # Forward slashes work quoted in PowerShell, cmd and Git Bash alike.
  Write-Output ("NODE=" + ($(if ($Node) { $Node } else { '' }) -replace '\\', '/'))
}
finally {
  Remove-Item $Work -Recurse -Force -ErrorAction SilentlyContinue
}
