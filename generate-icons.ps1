# PowerShell script to generate extension icons
# Requires System.Drawing assembly

Add-Type -AssemblyName System.Drawing

function Create-Icon {
    param(
        [int]$Size,
        [string]$OutputPath
    )
    
    # Create bitmap
    $bitmap = New-Object System.Drawing.Bitmap($Size, $Size)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    
    # Set high quality
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAlias
    
    # Background color (#667eea)
    $bgBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(102, 126, 234))
    $graphics.FillRectangle($bgBrush, 0, 0, $Size, $Size)
    
    # Draw "S" text
    $fontSize = [math]::Round($Size * 0.6)
    $font = New-Object System.Drawing.Font("Arial", $fontSize, [System.Drawing.FontStyle]::Bold)
    $textBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
    
    # Center text
    $format = New-Object System.Drawing.StringFormat
    $format.Alignment = [System.Drawing.StringAlignment]::Center
    $format.LineAlignment = [System.Drawing.StringAlignment]::Center
    
    $rect = New-Object System.Drawing.RectangleF(0, 0, $Size, $Size)
    $graphics.DrawString("S", $font, $textBrush, $rect, $format)
    
    # Save
    $bitmap.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Png)
    
    # Cleanup
    $graphics.Dispose()
    $bitmap.Dispose()
    $bgBrush.Dispose()
    $textBrush.Dispose()
    $font.Dispose()
}

# Create icons directory if it doesn't exist
if (-not (Test-Path "icons")) {
    New-Item -ItemType Directory -Path "icons" | Out-Null
}

# Generate icons
Write-Host "Generating icons..."
Create-Icon -Size 16 -OutputPath "icons\icon16.png"
Create-Icon -Size 48 -OutputPath "icons\icon48.png"
Create-Icon -Size 128 -OutputPath "icons\icon128.png"

Write-Host "Icons generated successfully!"
Write-Host "Files created:"
Write-Host "  - icons\icon16.png"
Write-Host "  - icons\icon48.png"
Write-Host "  - icons\icon128.png"

