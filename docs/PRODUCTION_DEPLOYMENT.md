# Production Deployment Foundation

This document describes the Docker production foundation for Vacuum Pads Traceability. It is a starting point for a controlled company-server installation, not a substitute for the final security review.

## Services

`docker-compose.prod.yml` defines these services:

- `postgres`: PostgreSQL 16 with persistent `postgres_data`.
- `minio`: private MinIO object storage with persistent `minio_data`.
- `migrate`: one-shot Prisma migration job using the backend `migration` Docker target.
- `backend`: lean NestJS runtime image.
- `admin`: Vite static build served by nginx with SPA fallback and optional `/api/` proxy.

PostgreSQL and MinIO are not published to public host ports by default. Backend and Admin are bound to `127.0.0.1` so a host-level or external reverse proxy can terminate TLS and expose only approved routes.

The Flutter/mobile app is not part of the production Docker Compose stack. It is built and distributed separately as an APK/AAB, through MDM, or through a private store. Flutter analyze/test/build commands are CI/regression activities, not production deployment services.

## Environment File

Copy the template and replace all `CHANGE_ME` values:

```powershell
Copy-Item .env.production.example .env.production
```

Never commit `.env.production`. The backend validates production configuration at startup and refuses to run if required values are missing, still contain `CHANGE_ME`, or if `CORS_ORIGIN=*`.

Required values include:

- `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`
- `DATABASE_URL`
- `MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD`
- `S3_ENDPOINT=http://minio:9000`
- `S3_BUCKET=vacuum-photos`
- `S3_ACCESS_KEY`, `S3_SECRET_KEY`
- `S3_USE_SSL=false`
- `NODE_ENV=production`
- `PORT=3000`
- `ADMIN_PUBLIC_URL`
- `BACKEND_PUBLIC_URL`
- `CORS_ORIGIN`
- `FIREBASE_SERVICE_ACCOUNT_PATH` when Firebase notifications are enabled

The Admin website must not receive MinIO credentials. Admin receives only backend-generated signed URLs for repair photos.

## Photo Storage

Production fault photos are stored in MinIO/S3, not on host filesystem paths. The backend uses only `S3_*` environment variables to reach MinIO and creates signed view URLs for Admin. The MinIO bucket must remain private.

Production behavior is fail-closed:

- uploads use configured MinIO/S3 storage only
- filesystem fallback is disabled
- Admin photo viewing uses signed URLs only
- public URL fallback is disabled
- missing or invalid signing configuration fails clearly instead of exposing private objects

Signed repair-photo view URLs currently expire after 10 minutes. Admin never receives MinIO credentials, and no public bucket is required.

If MinIO service-account credentials do not have bucket-create permissions, create the bucket manually before first upload:

```text
vacuum-photos
```

## First Deployment

Validate the compose file:

```powershell
docker compose --env-file .env.production -f docker-compose.prod.yml config
```

Build images:

```powershell
docker compose --env-file .env.production -f docker-compose.prod.yml build
```

Start stateful services:

```powershell
docker compose --env-file .env.production -f docker-compose.prod.yml up -d postgres minio
```

Run migrations:

```powershell
docker compose --env-file .env.production -f docker-compose.prod.yml up --build migrate
```

Start application services:

```powershell
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build backend admin
```

## Health Checks

From the deployment host:

```powershell
Invoke-RestMethod http://127.0.0.1:3000/health
Invoke-RestMethod http://127.0.0.1:3000/health/database
```

Also verify:

- Admin page through the reverse proxy or `http://127.0.0.1:8080`.
- SSE endpoint `/events/admin` through the same route used by Admin.
- MinIO bucket exists and remains private.
- A mobile photo upload succeeds.
- `GET /repairs/:repairId/photos` returns signed URLs only.
- A photo row in Admin Movements opens through a signed URL.
- The migration job exits with code 0 before backend traffic is allowed.

## Admin API Routing

The admin nginx container serves the SPA and proxies `/api/` to `backend:3000`.

Two supported production options:

- Set the Admin backend URL to the public backend URL, for example `https://vacuum-api.example.com`.
- Use same-origin proxy and set it to `https://vacuum-admin.example.com/api`.

The second option keeps browser traffic on one public origin while the nginx container strips `/api/` before forwarding to the backend.

The bundled admin nginx config also proxies `/api/events/` to backend `/events/` with buffering disabled. If a company reverse proxy such as Cloudflare, nginx, Caddy, or a load balancer sits in front of Admin/Backend, it must not buffer the SSE route and must allow long-lived responses for `/events/admin`.

Use strict CORS in production:

- `CORS_ORIGIN` should list only approved Admin/mobile/API origins.
- Do not use `*` in production.
- If using same-origin Admin proxy, ensure `/api/` and `/api/events/` are reachable from the browser.

## Update Workflow

Always back up before updating:

```powershell
.\scripts\backup-postgres.ps1 -EnvFile .env.production
.\scripts\backup-minio.ps1 -EnvFile .env.production
```

Then deploy the new version:

```powershell
docker compose --env-file .env.production -f docker-compose.prod.yml build
docker compose --env-file .env.production -f docker-compose.prod.yml up --build migrate
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build backend admin
docker compose --env-file .env.production -f docker-compose.prod.yml ps
```

Do not run `docker compose down -v` in production. That deletes named volumes and can destroy database and photo data. Code updates must never remove `postgres_data` or `minio_data`.

## Backup Workflow

PostgreSQL:

```powershell
.\scripts\backup-postgres.ps1 -EnvFile .env.production
```

MinIO bucket:

```powershell
.\scripts\backup-minio.ps1 -EnvFile .env.production
```

Store backups outside the application server when possible. A valid recovery point needs both the PostgreSQL dump and the matching MinIO bucket backup. Deleted photos cannot be restored unless a matching MinIO backup exists.

## Restore Notes

Stop application writes before restoring:

```powershell
docker compose --env-file .env.production -f docker-compose.prod.yml stop backend admin
```

Restore PostgreSQL into a clean database using `pg_restore` from the `postgres` container. Restore MinIO using `minio/mc mirror` back into the private bucket. Restart backend and admin only after both data stores match the same backup point.

Restore drill checklist:

1. Pick a non-production test host or isolated Docker project name.
2. Start empty PostgreSQL and MinIO volumes.
3. Restore the PostgreSQL dump.
4. Restore the matching MinIO bucket backup.
5. Start migrate/backend/admin with the matching application version.
6. Verify `/health`, `/health/database`, Admin page load, SSE `/events/admin`, a movement photo gallery, and a mobile workflow smoke test.
7. Record restore duration and any manual steps needed.

## Rollback

For app-only rollback:

1. Set `IMAGE_TAG` to the previous known-good image tag.
2. Run `docker compose --env-file .env.production -f docker-compose.prod.yml up -d backend admin`.

For rollback after a database migration:

1. Stop backend/admin.
2. Restore the PostgreSQL backup taken before the migration.
3. Restore the matching MinIO backup if photo writes happened after that point.
4. Start the previous image tag.

Prisma migrations are not assumed to be reversible. Treat pre-migration backups as mandatory.

## Remaining Production Hardening

- Put TLS in front of Admin and Backend with a company-approved reverse proxy.
- Replace all placeholder secrets.
- Use a private MinIO bucket and preferably a limited service account for backend object access.
- Restrict `CORS_ORIGIN` to approved Admin and mobile/API origins.
- Decide whether Firebase service account files are mounted as secrets or disabled.
- Add a formal backup retention policy and periodic restore drills.
- Add monitoring for `/health`, `/health/database`, container restarts, disk usage, and backup freshness.
