# PowerShell script to generate extension icons
Add-Type -AssemblyName System.Drawing

function Create-Icon {
    param(
        [int]$Size,
        [string]$OutputPath
    )
    
    # Create bitmap
    $bitmap = New-Object System.Drawing.Bitmap($Size, $Size)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    
    # Create gradient brush
    $rect = New-Object System.Drawing.Rectangle(0, 0, $Size, $Size)
    $brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
        $rect,
        [System.Drawing.Color]::FromArgb(102, 126, 234),  # #667eea
        [System.Drawing.Color]::FromArgb(118, 75, 162),   # #764ba2
        [System.Drawing.Drawing2D.LinearGradientMode]::ForwardDiagonal
    )
    
    # Draw rounded rectangle background
    $radius = [int]($Size * 0.15)
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $path.AddArc(0, 0, $radius * 2, $radius * 2, 180, 90)
    $path.AddArc($Size - $radius * 2, 0, $radius * 2, $radius * 2, 270, 90)
    $path.AddArc($Size - $radius * 2, $Size - $radius * 2, $radius * 2, $radius * 2, 0, 90)
    $path.AddArc(0, $Size - $radius * 2, $radius * 2, $radius * 2, 90, 90)
    $path.CloseFigure()
    $graphics.FillPath($brush, $path)
    
    # Draw checkmark
    $pen = New-Object System.Drawing.Pen([System.Drawing.Color]::White, [int]($Size * 0.15))
    $pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    $pen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
    
    $x1 = [int]($Size * 0.25)
    $y1 = [int]($Size * 0.5)
    $x2 = [int]($Size * 0.45)
    $y2 = [int]($Size * 0.7)
    $x3 = [int]($Size * 0.75)
    $y3 = [int]($Size * 0.3)
    
    $graphics.DrawLine($pen, $x1, $y1, $x2, $y2)
    $graphics.DrawLine($pen, $x2, $y2, $x3, $y3)
    
    # Save
    $bitmap.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Png)
    
    # Cleanup
    $pen.Dispose()
    $brush.Dispose()
    $path.Dispose()
    $graphics.Dispose()
    $bitmap.Dispose()
    
    Write-Host "Created: $OutputPath"
}

# Create icons directory if it doesn't exist
if (-not (Test-Path "icons")) {
    New-Item -ItemType Directory -Path "icons" | Out-Null
}

# Generate icons
Create-Icon -Size 16 -OutputPath "icons\icon16.png"
Create-Icon -Size 48 -OutputPath "icons\icon48.png"
Create-Icon -Size 128 -OutputPath "icons\icon128.png"

Write-Host "`nAll icons generated successfully!"

