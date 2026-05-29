# Reads secrets from local .env files and pushes to Railway via HTTPS.
# Values are never printed — only OK/ERR status per variable.

$RAILWAY_TOKEN = "3ba4a93d-e154-4232-8150-c380acbfde97"
$PROJECT_ID    = "f325a474-d593-4abd-9e33-1e943c6c4dca"
$ENV_ID        = "a4956ed2-080b-4214-9de9-9d699974796e"
$BACKEND_ID    = "50f1b968-b058-495d-b27d-bb1ba0003055"
$FRONTEND_ID   = "387c03b9-5ac8-41c1-98a1-6ec6f5e1d9d8"
$API_URL       = "https://backboard.railway.com/graphql/v2"

$headers = @{
    "Authorization" = "Bearer $RAILWAY_TOKEN"
    "Content-Type"  = "application/json"
}

# ── Parse .env file into a hashtable ─────────────────────────────────────────
function Read-EnvFile($path) {
    $map = @{}
    foreach ($line in Get-Content $path) {
        if ($line -match '^\s*#' -or $line -notmatch '=') { continue }
        $idx = $line.IndexOf('=')
        $key = $line.Substring(0, $idx).Trim()
        $val = $line.Substring($idx + 1).Trim().Trim('"')
        if ($key) { $map[$key] = $val }
    }
    return $map
}

# ── Upsert a single variable (value never printed) ───────────────────────────
function Set-Var($serviceId, $name, $value) {
    $escaped = $value -replace '\\', '\\\\' -replace '"', '\"'
    $body = "{`"query`":`"mutation { variableUpsert(input: { projectId: \`"$PROJECT_ID\`", environmentId: \`"$ENV_ID\`", serviceId: \`"$serviceId\`", name: \`"$name\`", value: \`"$escaped\`" }) }`"}"
    try {
        $resp = Invoke-RestMethod -Uri $API_URL -Method POST -Headers $headers -Body $body -ErrorAction Stop
        if ($resp.data.variableUpsert) { Write-Host "  OK  $name" -ForegroundColor Green }
        else { Write-Host "  ERR $name (no data)" -ForegroundColor Red }
    } catch {
        Write-Host "  ERR $name : $_" -ForegroundColor Red
    }
}

# ── Generate a secure random hex secret (never printed) ──────────────────────
function New-Secret {
    $bytes = New-Object byte[] 32
    [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
    return ([BitConverter]::ToString($bytes) -replace '-','').ToLower()
}

# ── Load local env files ──────────────────────────────────────────────────────
$backendEnv  = Read-EnvFile "$PSScriptRoot\backend\.env"
$frontendEnv = Read-EnvFile "$PSScriptRoot\frontend\.env.local"

# Generate fresh JWT_SECRET and NEXTAUTH_SECRET
$jwtSecret     = New-Secret
$nextauthSecret = New-Secret

# ── Backend secrets ───────────────────────────────────────────────────────────
Write-Host "`n=== Backend secrets ===" -ForegroundColor Cyan
$backendSecrets = @(
    "ANTHROPIC_API_KEY",
    "OPENAI_API_KEY",
    "GOOGLE_API_KEY",
    "MONGODB_URI",
    "LANGSMITH_API_KEY",
    "LANGSMITH_TRACING",
    "LANGSMITH_ENDPOINT",
    "LANGSMITH_PROJECT",
    "RAPIDAPI_KEY",
    "SMTP_HOST",
    "SMTP_PORT",
    "SMTP_USER",
    "SMTP_PASSWORD",
    "ALERT_SEND_HOUR",
    "ALERT_MAX_JOBS_PER_EMAIL"
)
foreach ($key in $backendSecrets) {
    if ($backendEnv.ContainsKey($key) -and $backendEnv[$key]) {
        Set-Var $BACKEND_ID $key $backendEnv[$key]
    } else {
        Write-Host "  SKIP $key (not in .env)" -ForegroundColor Yellow
    }
}
Set-Var $BACKEND_ID "JWT_SECRET" $jwtSecret
Write-Host "  OK  JWT_SECRET (generated)" -ForegroundColor Green

# ── Frontend secrets ──────────────────────────────────────────────────────────
Write-Host "`n=== Frontend secrets ===" -ForegroundColor Cyan
$feSecrets = @("GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET")
foreach ($key in $feSecrets) {
    if ($frontendEnv.ContainsKey($key) -and $frontendEnv[$key]) {
        Set-Var $FRONTEND_ID $key $frontendEnv[$key]
    } else {
        Write-Host "  SKIP $key (not in .env.local)" -ForegroundColor Yellow
    }
}
Set-Var $FRONTEND_ID "NEXTAUTH_SECRET" $nextauthSecret
Write-Host "  OK  NEXTAUTH_SECRET (generated)" -ForegroundColor Green

Write-Host "`nDone. No secret values were printed." -ForegroundColor Cyan
