# Backup and Restore — Operations Guide

Guide for the team running this installation. Covers what to back up, how to run
and schedule the scripts, how to change where backups are written, and how to
restore. No knowledge of the application code is required.

Every command below has been run against a live stack, including the restores.

---

## 1. What has to be backed up

The application keeps state in two places. **Both are needed** — one without the
other gives you an unusable system.

| What | Where it lives | Backed up by |
|---|---|---|
| Business data (pads, machines, movements, repairs, users, audit log) | PostgreSQL container, Docker volume `*_postgres_data` | `backup-postgres` |
| Repair photos (the image files) | MinIO container, Docker volume `*_minio_data` | `backup-minio` |

The database stores only a *reference* to each photo (filename, size, bucket) —
never the image itself. Restoring the database without the photo store leaves
records pointing at files that no longer exist.

Nothing else needs backing up: application code comes from the Git repository,
and configuration lives in `.env.production`, which you should store in your own
secret management alongside other production credentials.

---

## 2. Choosing the scripts for your platform

Both variants do exactly the same thing. Pick by operating system:

| Platform | Scripts |
|---|---|
| Linux, macOS | `scripts/backup-postgres.sh`, `scripts/backup-minio.sh` |
| Windows | `scripts/backup-postgres.ps1`, `scripts/backup-minio.ps1` |

The `.sh` scripts also run on Windows under Git Bash / WSL.

Requirements: Docker and Docker Compose, and the stack must be running. The
scripts talk to the running containers — they do not need database or object
storage tools installed on the host.

Make the shell scripts executable once after cloning:

```bash
chmod +x scripts/*.sh
```

---

## 3. Where the scripts live

In the folder you cloned the repository into — on the host filesystem, **not**
inside Docker. For example, after cloning into `/opt`:

```text
/opt/vacuum-pads/scripts/backup-minio.sh
```

They are ordinary text files. Open them in any editor.

---

## 4. Running a backup

Run from the repository root, so the script finds `docker-compose.prod.yml` and
`.env.production`.

**Linux / macOS**

```bash
./scripts/backup-postgres.sh
./scripts/backup-minio.sh
```

**Windows**

```powershell
.\scripts\backup-postgres.ps1
.\scripts\backup-minio.ps1
```

By default both write into a `backups/` folder next to the scripts:

```text
backups/
├── postgres-20260901-095313.dump          the database
└── minio-20260901-095521/                 the photos
    └── repair-photos/
        └── <repair-id>/
            └── 2026-09-01T06-31-09-626Z-119968c6.png
```

Each run creates a new timestamped entry; nothing is overwritten.

The photo backup contains **ordinary image files** in their original folder
structure, not MinIO's internal storage format. They open with any image viewer,
without MinIO involved.

---

## 5. Changing where backups are written

You do not need to edit the scripts. Every script accepts an output folder,
which is created if it does not exist. Any path works — another disk, a mounted
network share, a NAS.

**Linux / macOS**

```bash
./scripts/backup-postgres.sh --output-dir /srv/backups/vacuum
./scripts/backup-minio.sh --output-dir /srv/backups/vacuum
```

**Windows**

```powershell
.\scripts\backup-postgres.ps1 -OutputDir "D:\backups\vacuum"
.\scripts\backup-minio.ps1 -OutputDir "D:\backups\vacuum"
```

Prefer the parameter over editing the file: a local edit will conflict on the
next `git pull`. If you do want to change the built-in default permanently, it
is **line 4** of each script:

```text
OUTPUT_DIR="backups"                 # .sh
[string]$OutputDir = 'backups'       # .ps1
```

Two further options exist for non-standard installations, defaulting to
`docker-compose.prod.yml` and `.env.production`:

```bash
./scripts/backup-minio.sh --compose-file docker-compose.prod.yml --env-file .env.production
```

```powershell
.\scripts\backup-minio.ps1 -ComposeFile docker-compose.prod.yml -EnvFile .env.production
```

Run any `.sh` script with `--help` for its usage.

---

## 6. Scheduling

Back up **both** on the same schedule, so the database and the photos stay in
step. Daily outside working hours is a reasonable starting point.

### Linux — cron

```bash
crontab -e
```

```cron
30 2 * * * cd /opt/vacuum-pads && ./scripts/backup-postgres.sh --output-dir /srv/backups/vacuum >> /var/log/vacuum-backup.log 2>&1
40 2 * * * cd /opt/vacuum-pads && ./scripts/backup-minio.sh    --output-dir /srv/backups/vacuum >> /var/log/vacuum-backup.log 2>&1
```

The `cd` matters: the scripts resolve the compose and env files relative to the
working directory. The user running cron must be able to use Docker.

### Windows — Task Scheduler

Create a task running daily, with:

- Program: `powershell.exe`
- Arguments:
  `-NoProfile -ExecutionPolicy Bypass -File "C:\apps\vacuum-pads\scripts\backup-postgres.ps1" -OutputDir "D:\backups\vacuum"`
- Start in: `C:\apps\vacuum-pads`

Add a second task for `backup-minio.ps1`. Set both to "Run whether user is
logged on or not", under an account that can use Docker.

### Retention

Neither script deletes old backups — that is deliberate, so nothing is removed
without your policy deciding it. To keep the last 30 days:

```bash
find /srv/backups/vacuum -maxdepth 1 -name 'postgres-*.dump' -mtime +30 -delete
find /srv/backups/vacuum -maxdepth 1 -name 'minio-*' -type d -mtime +30 -exec rm -rf {} +
```

Backups contain real operational data and repair photographs. Store them with
the same protection as the production database, and keep a copy off the machine
that runs the application.

---

## 7. Restoring

> Restoring the database **overwrites current data**. Take a fresh backup first,
> and confirm you are pointing at the intended environment.

Restore both parts from the *same* backup run where possible, so photo records
and photo files match.

### 7.1 Database

Copy the dump into the running PostgreSQL container and restore it:

```bash
CONTAINER=$(docker compose --env-file .env.production -f docker-compose.prod.yml ps -q postgres)

docker cp backups/postgres-20260901-095313.dump "$CONTAINER:/tmp/restore.dump"
docker exec "$CONTAINER" pg_restore -U vacuum_user -d vacuum_traceability --clean --if-exists /tmp/restore.dump
docker exec "$CONTAINER" rm -f /tmp/restore.dump
```

`--clean --if-exists` drops existing objects before recreating them. Without it,
the restore fails on tables that already exist.

Replace `vacuum_user` and `vacuum_traceability` if you changed `POSTGRES_USER`
or `POSTGRES_DB` in `.env.production`.

**Testing a restore without touching production** — recommended before you rely
on a backup. Restore into a scratch database and inspect it:

```bash
docker exec "$CONTAINER" psql -U vacuum_user -d postgres -c "CREATE DATABASE restore_test;"
docker exec "$CONTAINER" pg_restore -U vacuum_user -d restore_test /tmp/restore.dump
docker exec "$CONTAINER" psql -U vacuum_user -d restore_test -c 'SELECT count(*) FROM "VacuumPad";'
docker exec "$CONTAINER" psql -U vacuum_user -d postgres -c "DROP DATABASE restore_test;"
```

### 7.2 Photos

Mirror the backup folder back into the bucket:

```bash
docker run --rm \
  --network "$(docker inspect -f '{{range $n, $_ := .NetworkSettings.Networks}}{{println $n}}{{end}}' \
    "$(docker compose --env-file .env.production -f docker-compose.prod.yml ps -q minio)" | head -n1)" \
  --env-file .env.production \
  -v "$(pwd)/backups/minio-20260901-095521:/restore" \
  --entrypoint sh minio/mc \
  -c 'mc alias set prod "$S3_ENDPOINT" "$S3_ACCESS_KEY" "$S3_SECRET_KEY" && mc mirror --overwrite /restore "prod/$S3_BUCKET"'
```

On Windows Git Bash, replace `$(pwd)/backups/...` with a native path such as
`C:/apps/vacuum-pads/backups/minio-20260901-095521`, and prefix the command with
`MSYS_NO_PATHCONV=1`. Git Bash rewrites Unix-style paths, which makes Docker
mount an empty folder.

### 7.3 After restoring

```bash
curl http://localhost:3000/health/database
```

Then open the admin site and confirm the vacuum counts and a repair photo both
display.

---

## 8. Verifying a backup is good

A backup that has never been restored is an assumption, not a safeguard. Once a
quarter, restore the latest backup into a scratch database (7.1) and confirm the
row counts look right.

Quick sanity checks:

| Check | Command | Expected |
|---|---|---|
| Dump is a valid archive | `pg_restore -l backups/postgres-*.dump` | a list of tables, no error |
| Dump is not truncated | `head -c 5 backups/postgres-*.dump` | starts with `PGDMP` |
| Photos are real images | open any `.png` under `backups/minio-*/` | the image displays |
| Backup is not empty | `du -sh backups/minio-*/` | grows as photos accumulate |

---

## 9. Troubleshooting

**"Postgres container is not running for the selected compose project."**
The stack is down, or you ran the script from the wrong folder. Run from the
repository root and check `docker compose -f docker-compose.prod.yml --env-file .env.production ps`.

**"Compose file not found" / "Environment file not found"**
Same cause — run from the repository root, or pass `--compose-file` /
`--env-file` explicitly.

**"Backup folder was not created … the volume mount did not reach the host filesystem."**
Raised by `backup-minio.sh` when Docker mounted something other than your
folder, which would otherwise report success while writing nothing. Usually a
path Docker cannot resolve. On Windows use the PowerShell script, or run from
WSL. On Linux, check that the output folder is on a filesystem Docker can mount
and that the user may write to it.

**MinIO backup folder is empty**
Normal when no repair photos have been uploaded yet. Confirm with:
`docker compose --env-file .env.production -f docker-compose.prod.yml exec postgres psql -U vacuum_user -d vacuum_traceability -c 'SELECT count(*) FROM "RepairPhoto";'`

**`permission denied` running a `.sh` script**
`chmod +x scripts/*.sh`

**PowerShell blocks the script**
Run it as shown in the Task Scheduler section, with
`-ExecutionPolicy Bypass -File`, rather than changing the machine-wide policy.

**Restore fails with "relation already exists"**
The `--clean --if-exists` flags were omitted. See 7.1.
