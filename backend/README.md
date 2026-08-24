# Backend Foundation

This folder contains the Milestone 1A backend foundation for the Vacuum Pads Traceability project.

## Current Scope

- NestJS application scaffold
- Global validation pipe
- Environment configuration bootstrap
- Health endpoints at `GET /health` and `GET /health/database`
- Prisma domain schema and initial migration
- Idempotent local seed script
- Docker-ready `Dockerfile`
- Local Docker Compose infrastructure for PostgreSQL and MinIO exists at the repository root

## Not Included Yet

- Active PostgreSQL-backed application features
- Active MinIO-backed application features
- Backend service in `docker-compose.yml`
- Domain modules for pads, racks, machines, movements, repairs, auth, charge, or decharge

The backend still runs locally on host Node.js during development. Docker Compose currently provides only local PostgreSQL and MinIO dependencies.

## Environment Variables

Copy `.env.example` to `.env` when you need local overrides.

Current variables:

- `PORT`
- `NODE_ENV`
- `APP_NAME`
- `DATABASE_URL`
- `S3_ENDPOINT`
- `S3_BUCKET`
- `S3_ACCESS_KEY`
- `S3_SECRET_KEY`
- `FIREBASE_SERVICE_ACCOUNT_PATH`

For local Prisma validation without creating a real `.env` file, use a temporary PowerShell process variable:

```powershell
$env:DATABASE_URL = "postgresql://vacuum_user:vacuum_pass@localhost:5432/vacuum_traceability?schema=public"
```

No passwords or authentication flows are implemented yet, so seeded users are actor records only.

## Firebase Notifications

The backend can send Firebase Cloud Messaging topic notifications after repair
intake and repair restoration workflows. Configure this only with a local
service account JSON file:

```powershell
$env:FIREBASE_SERVICE_ACCOUNT_PATH = "C:\dev\vacuum-traceability\_local\firebase\firebase-service-account.json"
```

Do not commit Firebase service account JSON files, `google-services.json`, or
`.env` files. If `FIREBASE_SERVICE_ACCOUNT_PATH` is missing, invalid, or the
send attempt fails, the backend logs the issue and continues the workflow.

Topics:

- `vacuum-repair-intake`
- `vacuum-repair-restored`

Android notification delivery uses these channel/sound hints:

- repair intake: channel `repair_intake_channel_v7`, sound `error`
- repair restored: channel `repair_restored_channel_v7`, sound `fix`

The Android app provides matching raw resources at `res/raw/error.mp3` and
`res/raw/fix.wav`. Android notification channel sound settings are sticky on
device, so test devices may need an uninstall or app data clear after channel
id/sound changes. If Firebase credentials are missing or a send fails, workflow
transactions still succeed.

## Local Development

```bash
cd backend
npm install
npm run start:dev
```

Start local infrastructure from the repository root when database or object storage access is needed:

```powershell
docker compose up -d postgres
docker compose ps
docker compose logs postgres
docker compose down
```

Apply the committed migration and seed local development data with a temporary PowerShell process variable:

```powershell
cd backend
$env:DATABASE_URL = "postgresql://vacuum_user:vacuum_pass@localhost:5432/vacuum_traceability?schema=public"
npm run prisma:migrate:deploy
npm run prisma:seed
Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
```

The seed script is idempotent. It creates baseline users, sample machines, rack locations, and vacuum pads. It does not create passwords/auth records, charge/decharge movements, repair records, or audit logs.

For a clean local development reset of PostgreSQL data, use the repository-level script [C:/dev/vacuum-traceability/scripts/reset-dev-db.ps1](C:/dev/vacuum-traceability/scripts/reset-dev-db.ps1). It is local-only, requires `-ConfirmLocalReset`, refuses non-local `DATABASE_URL` hosts, does not delete Docker volumes, and does not reset MinIO.

Example:

```powershell
.\scripts\reset-dev-db.ps1 -ConfirmLocalReset
```

Expected clean counts after reset:

- users: `4`
- machines: `3`
- rack locations: `10`
- vacuum pads: `6`
- fault catalog: `4`
- charge sessions: `0`
- pad movements: `0`
- repairs: `0`
- repair photos: `0`
- audit logs: `0`

## Build and Test

```bash
cd backend
npm run prisma:validate
npm run prisma:generate
npm run prisma:seed
npm run build
npm test
```

## Health Endpoints

`GET /health`

This endpoint is a basic process health check. It does not query PostgreSQL and should still return `200 OK` even when `DATABASE_URL` is missing or the database is down.

Expected response shape:

```json
{
  "status": "ok",
  "service": "vacuum-traceability-api",
  "timestamp": "2026-05-15T00:00:00.000Z"
}
```

`GET /health/database`

This endpoint checks PostgreSQL readiness with a lightweight Prisma query. When the database is reachable, it returns `200 OK`. When `DATABASE_URL` is missing or PostgreSQL is unavailable, it returns `503 Service Unavailable` with a safe generic reason.

To test database readiness locally:

```powershell
docker compose up -d postgres
cd backend
$env:DATABASE_URL = "postgresql://vacuum_user:vacuum_pass@localhost:5432/vacuum_traceability?schema=public"
npx prisma migrate deploy
npm run start:dev
```

Then call:

```powershell
Invoke-RestMethod http://localhost:3000/health
Invoke-RestMethod http://localhost:3000/health/database
```

When finished:

```powershell
Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
docker compose down
```

## Docker Readiness

The backend supports local development on host Node.js, but production must remain containerized. The included `Dockerfile` already accounts for Prisma client generation during image builds without requiring a live database. The Compose file at the repository root is for local PostgreSQL and MinIO only; the backend container service will be added later.
