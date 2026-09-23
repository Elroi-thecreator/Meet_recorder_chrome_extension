# Packaging script for Chrome Web Store submission
$manifest = Get-Content "manifest.json" | ConvertFrom-Json
$version = $manifest.version
$zipName = "meet-recorder-pro-v$version.zip"
$stageDir = "$env:TEMP\meet-recorder-stage"

if (Test-Path $stageDir) { Remove-Item -Path $stageDir -Recurse -Force }
if (Test-Path $zipName) { Remove-Item -Path $zipName -Force }

New-Item -ItemType Directory -Path "$stageDir\icons" -Force | Out-Null

# Copy only extension runtime files
Copy-Item "manifest.json" -Destination $stageDir
Copy-Item "popup.html" -Destination $stageDir
Copy-Item "popup.js" -Destination $stageDir
Copy-Item "recorder.html" -Destination $stageDir
Copy-Item "recorder.js" -Destination $stageDir
Copy-Item "permission.html" -Destination $stageDir
Copy-Item "permission.js" -Destination $stageDir
Copy-Item "db.js" -Destination $stageDir
Copy-Item "fix-webm-duration.js" -Destination $stageDir
Copy-Item "icons\*" -Destination "$stageDir\icons" -Recurse

# Create ZIP directly from staging directory contents
Compress-Archive -Path "$stageDir\*" -DestinationPath "$PSScriptRoot\$zipName" -Force
Remove-Item -Path $stageDir -Recurse -Force

$zipItem = Get-Item "$PSScriptRoot\$zipName"
Write-Host "Created Chrome Web Store package: $zipName ($([math]::Round($zipItem.Length / 1KB, 1)) KB)"
