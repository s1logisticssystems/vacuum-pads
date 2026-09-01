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
$backupName = "minio-$timestamp"
$resolvedOutputDir = Resolve-Path -LiteralPath (New-Item -ItemType Directory -Force -Path $OutputDir)
$minioContainerId = (& docker compose --env-file $EnvFile -f $ComposeFile ps -q minio).Trim()

if (-not $minioContainerId) {
  throw 'MinIO container is not running for the selected compose project.'
}

$networkName = (& docker inspect -f '{{range $name, $_ := .NetworkSettings.Networks}}{{println $name}}{{end}}' $minioContainerId | Select-Object -First 1).Trim()
if (-not $networkName) {
  throw 'Could not resolve the MinIO Docker network.'
}

Write-Host "Mirroring MinIO bucket to $resolvedOutputDir\$backupName..."
# --entrypoint sh is required: the minio/mc image entrypoint is "mc" itself,
# so without this the shell command is parsed as an mc subcommand and fails.
& docker run --rm `
  --network $networkName `
  --env-file $EnvFile `
  -e BACKUP_NAME=$backupName `
  -v "${resolvedOutputDir}:/backup" `
  --entrypoint sh `
  minio/mc `
  -c 'mc alias set prod "$S3_ENDPOINT" "$S3_ACCESS_KEY" "$S3_SECRET_KEY" && mc mirror --overwrite "prod/$S3_BUCKET" "/backup/$BACKUP_NAME"'

if ($LASTEXITCODE -ne 0) {
  throw 'MinIO backup failed.'
}

Write-Host "MinIO backup written: $(Join-Path $resolvedOutputDir $backupName)"
