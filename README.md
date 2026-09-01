# Vacuum Pads Traceability

Σύστημα ιχνηλασιμότητας βεντουζών (vacuum pads) — παρακολουθεί κάθε pad μέσω serial/QR καθώς μετακινείται ανάμεσα σε ράφια, μηχανήματα και επισκευές, με πλήρες ιστορικό κινήσεων, φωτογραφίες βλαβών και αναφορές.

Το repository περιέχει και τα τρία μέρη του συστήματος:

| Φάκελος | Τι είναι |
|---|---|
| `backend/` | Το API (NestJS) |
| `admin/` | Το web περιβάλλον διαχείρισης (React) |
| `mobile/` | Η εφαρμογή Android (Flutter) |

Backend και Admin τρέχουν με Docker Compose. Η εφαρμογή Android χτίζεται ξεχωριστά και διανέμεται ως APK — δεν είναι μέρος του Docker stack.

## Στοίβα τεχνολογίας

| Επίπεδο | Τεχνολογία |
|---|---|
| Backend API | NestJS 11 (Node.js 22) + Prisma ORM |
| Βάση δεδομένων | PostgreSQL 16 |
| Αποθήκευση αρχείων | MinIO (S3-compatible object storage) |
| Web Admin UI | React 19 + Vite, στατικό build σερβιρισμένο από nginx |
| Real-time ενημερώσεις | Server-Sent Events (`/events/admin`) |
| Deployment | Docker / Docker Compose |

## Αρχιτεκτονική

```
Browser (Admin UI)
      │  HTTPS (μέσω reverse proxy / tunnel — δεν περιλαμβάνεται εδώ)
      ▼
 ┌─────────┐   /api/*   ┌─────────┐        ┌────────────┐
 │  admin  │ ─────────► │ backend │ ─────► │ PostgreSQL │
 │ (nginx) │            │ (NestJS)│        └────────────┘
 └─────────┘            │         │        ┌────────────┐
                         │         │ ─────► │   MinIO    │
                         └─────────┘        └────────────┘
```

Το PostgreSQL και το MinIO **δεν** εκτίθενται δημόσια — μένουν μόνο στο εσωτερικό Docker network. Backend και Admin δένονται σε `127.0.0.1` ώστε ένας reverse proxy (ή tunnel) να αναλαμβάνει το TLS termination.

## Απαιτήσεις

- Docker + Docker Compose (Docker Desktop ή Docker Engine)
- Ελεύθερα local ports: `3000` (backend) και `8080` (admin) — προσαρμόσιμα

## Γρήγορη εκκίνηση (Docker)

Πέντε βήματα. Το μόνο που χρειάζεται να αποφασίσετε είναι οι δύο δημόσιες διευθύνσεις.

### Βήμα 1 — Λήψη του κώδικα

```bash
git clone git@github.com:s1logisticssystems/vacuum-pads.git
cd vacuum-pads
```

### Βήμα 2 — Δημιουργία των ρυθμίσεων

Ένα script παράγει το αρχείο `.env.production` με έτοιμα, ισχυρά μυστικά:

```bash
./scripts/init-env.sh
```

Σε Windows:

```powershell
.\scripts\init-env.ps1
```

Θα σας ρωτήσει **μόνο** τις δύο δημόσιες διευθύνσεις — του περιβάλλοντος διαχείρισης και του API. Όλα τα υπόλοιπα (κωδικοί βάσης, στοιχεία αποθήκευσης, κλειδί υπογραφής) παράγονται αυτόματα και σωστά.

> **Κρατήστε αντίγραφο του `.env.production` σε ασφαλές σημείο.** Περιέχει τον κωδικό της βάσης· αν χαθεί, η εφαρμογή δεν μπορεί να προσπελάσει τα δεδομένα της.

Αν προτιμάτε να ορίσετε εσείς τις τιμές, δείτε τον χειροκίνητο τρόπο στο [`docs/PRODUCTION_DEPLOYMENT.md`](docs/PRODUCTION_DEPLOYMENT.md). Εκεί εξηγείται επίσης **τι ισχύει αν χρειαστεί να αλλάξετε κωδικούς αργότερα** — η PostgreSQL έχει συμπεριφορά που ξαφνιάζει.

### Βήμα 3 — Εκκίνηση

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
```

Ξεκινούν τέσσερις υπηρεσίες (`postgres`, `minio`, `backend`, `admin`) αφού πρώτα εφαρμοστούν οι μεταβάσεις της βάσης.

Έλεγχος:

```bash
curl http://localhost:3000/health
curl http://localhost:3000/health/database
```

### Βήμα 4 — Δημιουργία του πρώτου διαχειριστή

**Απαραίτητο.** Χωρίς αυτό κανείς δεν μπορεί να συνδεθεί — κανένας λογαριασμός δεν έχει κωδικό σε νέα εγκατάσταση.

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production run --rm \
  -e PASSWORD='βάλτε-έναν-ισχυρό-κωδικό' \
  migrate npx tsx scripts/set-user-password.ts \
  --username admin --role ADMIN --display-name "Διαχειριστής"
```

Αναλυτικά, μαζί με τη δημιουργία των υπόλοιπων χρηστών: [`docs/USER_MANAGEMENT.md`](docs/USER_MANAGEMENT.md).

### Βήμα 5 — Πρόσβαση

Ανοίξτε `http://localhost:8080` (ή τη θύρα που ορίσατε στο `ADMIN_HTTP_PORT`) και συνδεθείτε με τον λογαριασμό του βήματος 4.

Για πρόσβαση από το δίκτυο ή το internet, στρέψτε τον reverse proxy σας στο `127.0.0.1:8080` (διαχείριση) και `127.0.0.1:3000` (API), με HTTPS.

Αν το περιβάλλον διαχείρισης δεν βρίσκει τον διακομιστή, η διεύθυνση ρυθμίζεται από την ίδια την οθόνη σύνδεσης, στο **Ρυθμίσεις σύνδεσης**. Η τιμή αποθηκεύεται στον φυλλομετρητή, οπότε ορίζεται μία φορά ανά υπολογιστή.

### Αρχικά δεδομένα (προαιρετικό, μόνο για demo/δοκιμή)

Η βάση ξεκινά άδεια. Για baseline demo δεδομένα (χρήστες, μηχανήματα, θέσεις, vacuum pads, τύπους βλαβών):

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production run --rm migrate npx tsx prisma/seed.ts
```

**Μην** τρέξετε το seed σε πραγματικό production με ήδη υπαρκτά δεδομένα — είναι idempotent αλλά προορίζεται για αρχική/demo εγκατάσταση.

### Master data μέσω Excel

Το backend μπορεί να εισάγει master data (Vacuum, Machines, Rack Locations, Fault Catalog) από Excel workbook:

```bash
# μέσα στο backend container
docker compose -f docker-compose.prod.yml --env-file .env.production exec backend npm run import-master-data -- --dry-run
```

## Σταμάτημα / επανεκκίνηση

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production down
docker compose -f docker-compose.prod.yml --env-file .env.production up -d
```

## Backups

Πλήρης οδηγός λειτουργίας για την ομάδα IT — τι κρατάμε αντίγραφο, πώς τρέχουν και προγραμματίζονται τα scripts, πώς αλλάζει ο φάκελος προορισμού, και **πώς γίνεται επαναφορά**:

```text
docs/BACKUP_AND_RESTORE.md
```

Δύο ισοδύναμες εκδοχές ανά λειτουργικό:

| Πλατφόρμα | Scripts |
|---|---|
| Linux / macOS | `scripts/backup-postgres.sh`, `scripts/backup-minio.sh` |
| Windows | `scripts/backup-postgres.ps1`, `scripts/backup-minio.ps1` |

Χρειάζονται αντίγραφα **και τα δύο** (βάση + φωτογραφίες): η βάση κρατά μόνο αναφορές στα αρχεία εικόνων, όχι τις ίδιες τις εικόνες.

```bash
./scripts/backup-postgres.sh --output-dir /srv/backups/vacuum
./scripts/backup-minio.sh --output-dir /srv/backups/vacuum
```

## Πρόσβαση εκτός τοπικού δικτύου

Backend και Admin δένονται μόνο σε `127.0.0.1` σκόπιμα. Για πρόσβαση από το internet χρειάζεται reverse proxy ή tunnel (π.χ. Cloudflare Tunnel, nginx με TLS) που να προωθεί προς `127.0.0.1:3000` (backend) και `127.0.0.1:8080` (admin), και αντίστοιχη ενημέρωση των `CORS_ORIGIN` / `BACKEND_PUBLIC_URL` / `ADMIN_PUBLIC_URL` στο `.env.production`.

## Επισκόπηση για το τμήμα πληροφορικής

Συνοπτική παρουσίαση για την ομάδα που θα αξιολογήσει και θα φιλοξενήσει το σύστημα — τι εγκαθίσταται, τι χρειάζεται από την υποδομή, ποιες λειτουργικές υποχρεώσεις δημιουργεί:

```text
docs/HANDOVER.md
```

## ⚠️ Σημαντικό για security review

### Ταυτοποίηση χρηστών ✅

**Κάθε endpoint απαιτεί σύνδεση.** Δεν υπάρχει ανώνυμη πρόσβαση ούτε κοινός λογαριασμός· εξαιρούνται μόνο τα endpoints ελέγχου υγείας, που δεν εκθέτουν επιχειρησιακά δεδομένα.

- Σύνδεση με όνομα χρήστη/κωδικό και βραχύβιο token (12 ώρες).
- Ρόλοι: μόνο ο `ADMIN` διαχειρίζεται λογαριασμούς.
- Κωδικοί αποθηκευμένοι ως bcrypt hashes· δεν επιστρέφονται ποτέ από το API.
- Rate limiting 5 προσπαθειών/λεπτό στη σύνδεση.
- Ο έλεγχος λογαριασμού γίνεται σε **κάθε** αίτημα, ώστε η απενεργοποίηση χρήστη να ισχύει άμεσα.

Ο πρώτος διαχειριστής δημιουργείται με το script `set-user-password.ts`. Πλήρης οδηγός λειτουργίας — δημιουργία χρηστών, επαναφορά κωδικών, ανάκτηση πρόσβασης:

```text
docs/USER_MANAGEMENT.md
```

Το αρχικό σχέδιο υλοποίησης (με τα επόμενα προαιρετικά βήματα: MFA, SSO) παραμένει στο [`docs/AUTHENTICATION_AND_AUTHORIZATION_PLAN.md`](docs/AUTHENTICATION_AND_AUTHORIZATION_PLAN.md).

### Σκλήρυνση container

- Backend και Admin **δεν τρέχουν ως root**: το backend ως `node` (uid 1000), το Admin στην επίσημη unprivileged έκδοση του nginx ως `nginx` (uid 101) με ακρόαση στη θύρα 8080 αντί για την προνομιούχο 80.
- Το production image του backend εγκαθιστά **μόνο** production dependencies και δεν περιλαμβάνει εργαλεία ανάπτυξης (π.χ. το Prisma CLI, που το npm θα εγκαθιστούσε ως peer dependency).
- Γνωστές ευπάθειες production dependencies: **μηδέν**, σε κάθε επίπεδο σοβαρότητας.

Περισσότερα τεχνικά στοιχεία στο [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) και [`docs/PRODUCTION_DEPLOYMENT.md`](docs/PRODUCTION_DEPLOYMENT.md).
