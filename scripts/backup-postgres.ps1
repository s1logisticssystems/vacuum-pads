param(
  [string]$ComposeFile = 'docker-compose.prod.yml',
  [string]$EnvFile = '.env.production',
  [string]$OutputDir = 'backups'
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path -LiteralPath $ComposeFile)) {
  throw "Compose file not found: $ComposeFile"
}

if (-not (Test-Path -LiteralPath $EnvFile)) {
  throw "Environment file not found: $EnvFile"
}

$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$resolvedOutputDir = Resolve-Path -LiteralPath (New-Item -ItemType Directory -Force -Path $OutputDir)
$backupFile = Join-Path $resolvedOutputDir "postgres-$timestamp.dump"
$containerId = (& docker compose --env-file $EnvFile -f $ComposeFile ps -q postgres).Trim()

if (-not $containerId) {
  throw 'Postgres container is not running for the selected compose project.'
}

Write-Host "Creating PostgreSQL backup inside container $containerId..."
& docker exec $containerId sh -lc 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc -f /tmp/vacuum-postgres.dump'
if ($LASTEXITCODE -ne 0) {
  throw 'pg_dump failed.'
}

Write-Host "Copying backup to $backupFile..."
& docker cp "${containerId}:/tmp/vacuum-postgres.dump" $backupFile
if ($LASTEXITCODE -ne 0) {
  throw 'docker cp failed.'
}

& docker exec $containerId rm -f /tmp/vacuum-postgres.dump | Out-Null

Write-Host "PostgreSQL backup written: $backupFile"
