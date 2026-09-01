#!/usr/bin/env bash
# Creates a compressed PostgreSQL dump of the running stack.
# Equivalent to backup-postgres.ps1, for hosts without PowerShell.
#
# Usage:
#   ./scripts/backup-postgres.sh
#   ./scripts/backup-postgres.sh --output-dir /srv/backups/vacuum
#   ./scripts/backup-postgres.sh --compose-file docker-compose.prod.yml --env-file .env.production

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
BACKUP_FILE="$RESOLVED_OUTPUT_DIR/postgres-$TIMESTAMP.dump"

CONTAINER_ID="$(docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" ps -q postgres | tr -d '\r')"
[ -n "$CONTAINER_ID" ] || { echo "Postgres container is not running for the selected compose project." >&2; exit 1; }

echo "Creating PostgreSQL backup inside container $CONTAINER_ID..."
docker exec "$CONTAINER_ID" sh -lc \
  'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc -f /tmp/vacuum-postgres.dump'

echo "Copying backup to $BACKUP_FILE..."
docker cp "$CONTAINER_ID:/tmp/vacuum-postgres.dump" "$BACKUP_FILE"

docker exec "$CONTAINER_ID" rm -f /tmp/vacuum-postgres.dump >/dev/null

echo "PostgreSQL backup written: $BACKUP_FILE"
