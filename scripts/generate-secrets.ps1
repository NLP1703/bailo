# Génère des secrets forts pour .env (Windows / PowerShell).
# Usage : .\scripts\generate-secrets.ps1 > .env.secrets

function New-Secret {
    param([int]$Bytes = 48)
    $buf = New-Object byte[] $Bytes
    [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($buf)
    [Convert]::ToBase64String($buf).TrimEnd('=')
}

$date = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
Write-Output "# Secrets generes le $date"
Write-Output ('JWT_ACCESS_SECRET="{0}"'  -f (New-Secret))
Write-Output ('JWT_REFRESH_SECRET="{0}"' -f (New-Secret))
Write-Output ('COOKIE_SECRET="{0}"'      -f (New-Secret 32))
Write-Output ('S3_ACCESS_KEY="{0}"'      -f ((New-Secret 16) -replace '[^A-Za-z0-9]', ''))
Write-Output ('S3_SECRET_KEY="{0}"'      -f (New-Secret 32))
