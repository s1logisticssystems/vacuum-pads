# Vacuum Pads Traceability

Σύστημα ιχνηλασιμότητας βεντουζών (vacuum pads) — παρακολουθεί κάθε pad μέσω serial/QR καθώς μετακινείται ανάμεσα σε ράφια, μηχανήματα και επισκευές, με πλήρες ιστορικό κινήσεων, φωτογραφίες βλαβών και αναφορές.

Αυτό το repository περιέχει το **backend API** και το **web admin UI**. Η mobile (Flutter) εφαρμογή διανέμεται ξεχωριστά (APK/AAB) και δεν είναι μέρος αυτού του Docker stack.

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

```bash
git clone git@github.com:s1logisticssystems/vacuum-pads.git
cd vacuum-pads
cp .env.production.example .env.production
```

Ανοίξτε το `.env.production` και αντικαταστήστε **όλες** τις τιμές `CHANGE_ME_...` με πραγματικά, μοναδικά passwords/keys. Ρυθμίστε επίσης:

- `CORS_ORIGIN` — το/τα public domain(s) που θα εξυπηρετούν το Admin (π.χ. `https://vacuum-admin.example.com`)
- `BACKEND_PUBLIC_URL` / `ADMIN_PUBLIC_URL` — τα public URLs του deployment

Το backend αρνείται να ξεκινήσει σε production αν λείπει κάποια τιμή, αν παραμένει `CHANGE_ME`, ή αν `CORS_ORIGIN=*`.

Build & εκκίνηση όλου του stack:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
```

Αυτό ξεκινά 4 υπηρεσίες: `postgres`, `minio`, `migrate` (one-shot Prisma migration), `backend`, `admin`.

Έλεγχος υγείας:

```bash
curl http://localhost:3000/health
curl http://localhost:3000/health/database
```

Admin UI: `http://localhost:8080` (ή το port που ορίσατε σε `ADMIN_HTTP_PORT`). Στο πρώτο άνοιγμα, από το γρανάζι (⚙) ρυθμίστε backend URL: `http://localhost:8080/api` (χρησιμοποιεί το ενσωματωμένο nginx proxy, same-origin, χωρίς ανάγκη CORS).

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

Scripts για PostgreSQL/MinIO backup βρίσκονται στο `docs/PRODUCTION_DEPLOYMENT.md`.

## Πρόσβαση εκτός τοπικού δικτύου

Backend και Admin δένονται μόνο σε `127.0.0.1` σκόπιμα. Για πρόσβαση από το internet χρειάζεται reverse proxy ή tunnel (π.χ. Cloudflare Tunnel, nginx με TLS) που να προωθεί προς `127.0.0.1:3000` (backend) και `127.0.0.1:8080` (admin), και αντίστοιχη ενημέρωση των `CORS_ORIGIN` / `BACKEND_PUBLIC_URL` / `ADMIN_PUBLIC_URL` στο `.env.production`.

## ⚠️ Σημαντικό για security review

Δείτε το ξεχωριστό πινακάκι/σημείωμα ασφαλείας που συνοδεύει αυτό το repository. Εν συντομία: το backend **δεν έχει ακόμα ενσωματωμένη authentication/authorization** στα API endpoints — οποιοσδήποτε έχει network πρόσβαση στο backend port μπορεί να καλέσει τα endpoints. Πριν από production χρήση εκτός ελεγχόμενου/απομονωμένου δικτύου, απαιτείται πρόσθετο επίπεδο πρόσβασης (VPN, reverse-proxy auth, ή built-in auth layer).

Το πλάνο για το πώς θα προστεθεί ισχυρή ταυτοποίηση (authentication) και πιστοποίηση/εξουσιοδότηση (authorization) — JWT login, RBAC, MFA, προαιρετικό SSO — περιγράφεται αναλυτικά στο [`docs/AUTHENTICATION_AND_AUTHORIZATION_PLAN.md`](docs/AUTHENTICATION_AND_AUTHORIZATION_PLAN.md).

### Σκλήρυνση container

- Backend και Admin **δεν τρέχουν ως root**: το backend ως `node` (uid 1000), το Admin στην επίσημη unprivileged έκδοση του nginx ως `nginx` (uid 101) με ακρόαση στη θύρα 8080 αντί για την προνομιούχο 80.
- Το production image του backend εγκαθιστά **μόνο** production dependencies και δεν περιλαμβάνει εργαλεία ανάπτυξης (π.χ. το Prisma CLI, που το npm θα εγκαθιστούσε ως peer dependency).
- Γνωστές ευπάθειες production dependencies: **0 critical, 0 high**. Παραμένουν 3 moderate από το `minio` → `query-string` → `decode-uri-component`, όπου η διορθωμένη έκδοση είναι ESM-only και ασύμβατη με την τρέχουσα αλυσίδα· παρακολουθείται για μελλοντική αναβάθμιση.

Περισσότερα τεχνικά στοιχεία στο [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) και [`docs/PRODUCTION_DEPLOYMENT.md`](docs/PRODUCTION_DEPLOYMENT.md).
