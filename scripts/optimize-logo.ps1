# Optimizes the faculty logo for on-screen use.
# Input : a source image (PNG/JPG), any resolution.
# Output: public/logo-fms.png at 256x256 (transparent), crisp at the
#         30px sidebar and 64px public sizes incl. 2x-3x retina.
#
# Usage: powershell -File scripts/optimize-logo.ps1 -Src public\logo-fms-src.png
param(
  [Parameter(Mandatory = $true)][string]$Src,
  [int]$Size = 256,
  [string]$Out = "public\logo-fms.png"
)

Add-Type -AssemblyName System.Drawing

if (-not (Test-Path $Src)) { throw "Source not found: $Src" }

$img = [System.Drawing.Image]::FromFile((Resolve-Path $Src))
try {
  # Square canvas, transparent background, aspect-preserved contain fit.
  $canvas = New-Object System.Drawing.Bitmap($Size, $Size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($canvas)
  try {
    $g.Clear([System.Drawing.Color]::Transparent)
    $g.InterpolationMode  = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode      = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode    = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

    $scale = [Math]::Min($Size / $img.Width, $Size / $img.Height)
    $w = [int]([Math]::Round($img.Width  * $scale))
    $h = [int]([Math]::Round($img.Height * $scale))
    $x = [int](($Size - $w) / 2)
    $y = [int](($Size - $h) / 2)
    $g.DrawImage($img, $x, $y, $w, $h)
  } finally { $g.Dispose() }

  $canvas.Save((Join-Path (Get-Location) $Out), [System.Drawing.Imaging.ImageFormat]::Png)
  $canvas.Dispose()
} finally { $img.Dispose() }

$bytes = (Get-Item $Out).Length
"Wrote $Out ($Size x $Size, $([Math]::Round($bytes/1KB,1)) KB)"
