#!/usr/bin/env bash
# Mirrors the MinIO photo bucket to a local folder as ordinary files.
# Equivalent to backup-minio.ps1, for hosts without PowerShell.
#
# Usage:
#   ./scripts/backup-minio.sh
#   ./scripts/backup-minio.sh --output-dir /srv/backups/vacuum
#   ./scripts/backup-minio.sh --compose-file docker-compose.prod.yml --env-file .env.production

set -euo pipefail

COMPOSE_FILE="docker-compose.prod.yml"
ENV_FILE=".env.production"
OUTPUT_DIR="backups"

while [ $# -gt 0 ]; do
  case "$1" in
    --compose-file) COMPOSE_FILE="$2"; shift 2 ;;
    --env-file)     ENV_FILE="$2";     shift 2 ;;
    --output-dir)   OUTPUT_DIR="$2";   shift 2 ;;
    -h|--help)
      sed -n '2,9p' "$0" | sed 's/^# \{0,1\}//'
      exit 0 ;;
    *)
      echo "Unknown option: $1" >&2
      echo "Run with --help for usage." >&2
      exit 1 ;;
  esac
done

[ -f "$COMPOSE_FILE" ] || { echo "Compose file not found: $COMPOSE_FILE" >&2; exit 1; }
[ -f "$ENV_FILE" ]     || { echo "Environment file not found: $ENV_FILE" >&2; exit 1; }

mkdir -p "$OUTPUT_DIR"
RESOLVED_OUTPUT_DIR="$(cd "$OUTPUT_DIR" && pwd)"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_NAME="minio-$TIMESTAMP"

CONTAINER_ID="$(docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" ps -q minio | tr -d '\r')"
[ -n "$CONTAINER_ID" ] || { echo "MinIO container is not running for the selected compose project." >&2; exit 1; }

NETWORK_NAME="$(docker inspect -f '{{range $name, $_ := .NetworkSettings.Networks}}{{println $name}}{{end}}' "$CONTAINER_ID" | head -n 1 | tr -d '\r')"
[ -n "$NETWORK_NAME" ] || { echo "Could not resolve the MinIO Docker network." >&2; exit 1; }

# Docker needs a native host path for the volume mount. Under Git Bash / MSYS
# on Windows the shell path looks like /c/dev/... , which Docker Desktop does
# not resolve: the mount silently ends up empty and no data is written. cygpath
# converts it to C:\dev\... ; on Linux and macOS the path is used as-is.
if command -v cygpath >/dev/null 2>&1; then
  MOUNT_SOURCE="$(cygpath -w "$RESOLVED_OUTPUT_DIR")"
else
  MOUNT_SOURCE="$RESOLVED_OUTPUT_DIR"
fi

echo "Mirroring MinIO bucket to $RESOLVED_OUTPUT_DIR/$BACKUP_NAME..."
# --entrypoint sh is required: the minio/mc image entrypoint is "mc" itself,
# so without this the shell command is parsed as an mc subcommand and fails.
# MSYS_NO_PATHCONV stops Git Bash rewriting the container-side /backup path.
MSYS_NO_PATHCONV=1 docker run --rm \
  --network "$NETWORK_NAME" \
  --env-file "$ENV_FILE" \
  -e BACKUP_NAME="$BACKUP_NAME" \
  -v "$MOUNT_SOURCE:/backup" \
  --entrypoint sh \
  minio/mc \
  -c 'mc alias set prod "$S3_ENDPOINT" "$S3_ACCESS_KEY" "$S3_SECRET_KEY" && mc mirror --overwrite "prod/$S3_BUCKET" "/backup/$BACKUP_NAME"'

# Guard against a silently empty mount: the backup folder must exist afterwards.
if [ ! -d "$RESOLVED_OUTPUT_DIR/$BACKUP_NAME" ]; then
  echo "Backup folder was not created: $RESOLVED_OUTPUT_DIR/$BACKUP_NAME" >&2
  echo "The volume mount did not reach the host filesystem." >&2
  exit 1
fi

echo "MinIO backup written: $RESOLVED_OUTPUT_DIR/$BACKUP_NAME"
