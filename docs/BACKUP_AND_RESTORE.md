# Αντίγραφα ασφαλείας και επαναφορά — Οδηγός λειτουργίας

Οδηγός για την ομάδα που λειτουργεί την εγκατάσταση. Καλύπτει τι πρέπει να κρατάτε, πώς εκτελούνται και προγραμματίζονται τα scripts, πώς αλλάζει ο φάκελος προορισμού και πώς γίνεται η επαναφορά. Δεν προϋποθέτει γνώση του κώδικα.

Κάθε εντολή που ακολουθεί έχει εκτελεστεί σε ζωντανό σύστημα, συμπεριλαμβανομένων των επαναφορών.

---

## 1. Τι πρέπει να κρατάμε

Η εφαρμογή αποθηκεύει δεδομένα σε δύο σημεία. **Χρειάζονται και τα δύο** — το ένα χωρίς το άλλο δίνει σύστημα που δεν λειτουργεί.

| Τι | Πού βρίσκεται | Ποιο script το καλύπτει |
|---|---|---|
| Επιχειρησιακά δεδομένα (vacuum, μηχανήματα, κινήσεις, επισκευές, χρήστες, μητρώο ελέγχου) | Container PostgreSQL, τόμος `*_postgres_data` | `backup-postgres` |
| Φωτογραφίες επισκευών (τα ίδια τα αρχεία) | Container MinIO, τόμος `*_minio_data` | `backup-minio` |

Η βάση αποθηκεύει μόνο μια *αναφορά* σε κάθε φωτογραφία (όνομα αρχείου, μέγεθος, θέση) — ποτέ την ίδια την εικόνα. Επαναφορά της βάσης χωρίς τις φωτογραφίες αφήνει εγγραφές που δείχνουν σε αρχεία που δεν υπάρχουν πια.

Τίποτε άλλο δεν χρειάζεται αντίγραφο: ο κώδικας προέρχεται από το αποθετήριο Git, και οι ρυθμίσεις βρίσκονται στο `.env.production`, το οποίο πρέπει να φυλάσσετε στο δικό σας σύστημα διαχείρισης μυστικών μαζί με τα υπόλοιπα διαπιστευτήρια παραγωγής.

---

## 2. Ποια scripts αφορούν το λειτουργικό σας

Και οι δύο εκδοχές κάνουν ακριβώς το ίδιο. Επιλέξτε ανάλογα με το λειτουργικό σύστημα:

| Πλατφόρμα | Scripts |
|---|---|
| Linux, macOS | `scripts/backup-postgres.sh`, `scripts/backup-minio.sh` |
| Windows | `scripts/backup-postgres.ps1`, `scripts/backup-minio.ps1` |

Τα scripts `.sh` τρέχουν και σε Windows μέσω Git Bash ή WSL.

Προϋποθέσεις: Docker και Docker Compose, και το σύστημα να είναι σε λειτουργία. Τα scripts επικοινωνούν με τα ενεργά containers — δεν απαιτούν εγκατεστημένα εργαλεία βάσης ή αποθήκευσης στον διακομιστή.

Μετά την κλωνοποίηση, δώστε δικαίωμα εκτέλεσης στα scripts κελύφους μία φορά:

```bash
chmod +x scripts/*.sh
```

---

## 3. Πού βρίσκονται τα scripts

Στον φάκελο όπου κλωνοποιήσατε το αποθετήριο — στο σύστημα αρχείων του διακομιστή, **όχι** μέσα στο Docker. Για παράδειγμα, μετά από κλωνοποίηση στο `/opt`:

```text
/opt/vacuum-pads/scripts/backup-minio.sh
```

Είναι απλά αρχεία κειμένου. Ανοίγουν με οποιονδήποτε επεξεργαστή.

---

## 4. Εκτέλεση αντιγράφου

Εκτελέστε τα από τον ριζικό φάκελο του αποθετηρίου, ώστε να βρουν τα `docker-compose.prod.yml` και `.env.production`.

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

Εξ ορισμού γράφουν σε έναν φάκελο `backups/` δίπλα στα scripts:

```text
backups/
├── postgres-20260901-095313.dump          η βάση δεδομένων
└── minio-20260901-095521/                 οι φωτογραφίες
    └── repair-photos/
        └── <κωδικός-επισκευής>/
            └── 2026-09-01T06-31-09-626Z-119968c6.png
```

Κάθε εκτέλεση δημιουργεί νέα εγγραφή με χρονοσήμανση· τίποτα δεν αντικαθίσταται.

Το αντίγραφο των φωτογραφιών περιέχει **κανονικά αρχεία εικόνας** στην αρχική δομή φακέλων, όχι την εσωτερική μορφή αποθήκευσης του MinIO. Ανοίγουν με οποιοδήποτε πρόγραμμα προβολής, χωρίς να χρειάζεται το MinIO.

---

## 5. Αλλαγή του φακέλου προορισμού

Δεν χρειάζεται να επεξεργαστείτε τα scripts. Καθένα δέχεται φάκελο προορισμού, τον οποίο δημιουργεί αν δεν υπάρχει. Δέχεται οποιαδήποτε διαδρομή — άλλο δίσκο, δικτυακό κοινόχρηστο φάκελο, NAS.

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

Προτιμήστε την παράμετρο αντί για επεξεργασία του αρχείου: μια τοπική αλλαγή θα δημιουργήσει σύγκρουση στην επόμενη ενημέρωση του κώδικα. Αν παρ' όλα αυτά θέλετε να αλλάξετε μόνιμα την προεπιλογή, βρίσκεται στη **γραμμή 4** κάθε script:

```text
OUTPUT_DIR="backups"                 # .sh
[string]$OutputDir = 'backups'       # .ps1
```

Υπάρχουν δύο ακόμη παράμετροι για μη τυπικές εγκαταστάσεις, με προεπιλογές `docker-compose.prod.yml` και `.env.production`:

```bash
./scripts/backup-minio.sh --compose-file docker-compose.prod.yml --env-file .env.production
```

```powershell
.\scripts\backup-minio.ps1 -ComposeFile docker-compose.prod.yml -EnvFile .env.production
```

Εκτελέστε οποιοδήποτε script `.sh` με `--help` για τις οδηγίες χρήσης του.

---

## 6. Χρονοπρογραμματισμός

Προγραμματίστε **και τα δύο** στο ίδιο χρονικό σημείο, ώστε η βάση και οι φωτογραφίες να αντιστοιχούν μεταξύ τους. Μία φορά την ημέρα, εκτός ωραρίου λειτουργίας, είναι λογική αφετηρία.

### Linux — cron

```bash
crontab -e
```

```cron
30 2 * * * cd /opt/vacuum-pads && ./scripts/backup-postgres.sh --output-dir /srv/backups/vacuum >> /var/log/vacuum-backup.log 2>&1
40 2 * * * cd /opt/vacuum-pads && ./scripts/backup-minio.sh    --output-dir /srv/backups/vacuum >> /var/log/vacuum-backup.log 2>&1
```

Το `cd` έχει σημασία: τα scripts εντοπίζουν τα αρχεία ρυθμίσεων σε σχέση με τον τρέχοντα φάκελο. Ο χρήστης που εκτελεί το cron πρέπει να έχει δικαίωμα χρήσης του Docker.

### Windows — Χρονοπρογραμματιστής εργασιών

Δημιουργήστε εργασία που εκτελείται καθημερινά, με:

- Πρόγραμμα: `powershell.exe`
- Ορίσματα:
  `-NoProfile -ExecutionPolicy Bypass -File "C:\apps\vacuum-pads\scripts\backup-postgres.ps1" -OutputDir "D:\backups\vacuum"`
- Έναρξη στον φάκελο: `C:\apps\vacuum-pads`

Προσθέστε δεύτερη εργασία για το `backup-minio.ps1`. Ορίστε και τις δύο ως «Εκτέλεση είτε ο χρήστης είναι συνδεδεμένος είτε όχι», με λογαριασμό που έχει δικαίωμα χρήσης του Docker.

### Πολιτική διατήρησης

Κανένα script δεν διαγράφει παλιά αντίγραφα — σκόπιμα, ώστε να μην αφαιρείται τίποτα χωρίς να το αποφασίσει η δική σας πολιτική. Για διατήρηση των τελευταίων 30 ημερών:

```bash
find /srv/backups/vacuum -maxdepth 1 -name 'postgres-*.dump' -mtime +30 -delete
find /srv/backups/vacuum -maxdepth 1 -name 'minio-*' -type d -mtime +30 -exec rm -rf {} +
```

Τα αντίγραφα περιέχουν πραγματικά επιχειρησιακά δεδομένα και φωτογραφίες επισκευών. Φυλάξτε τα με την ίδια προστασία που δίνετε στη βάση παραγωγής, και κρατήστε αντίγραφο **εκτός** του μηχανήματος που τρέχει την εφαρμογή.

---

## 7. Επαναφορά

> Η επαναφορά της βάσης **αντικαθιστά τα τρέχοντα δεδομένα**. Πάρτε πρώτα φρέσκο αντίγραφο και βεβαιωθείτε ότι στοχεύετε στο σωστό περιβάλλον.

Επαναφέρετε και τα δύο μέρη από την **ίδια** εκτέλεση αντιγράφου όπου είναι δυνατό, ώστε οι εγγραφές των φωτογραφιών να αντιστοιχούν στα αρχεία.

### 7.1 Βάση δεδομένων

Αντιγράψτε το αρχείο μέσα στο container της PostgreSQL και επαναφέρετέ το:

```bash
CONTAINER=$(docker compose --env-file .env.production -f docker-compose.prod.yml ps -q postgres)

docker cp backups/postgres-20260901-095313.dump "$CONTAINER:/tmp/restore.dump"
docker exec "$CONTAINER" pg_restore -U vacuum_user -d vacuum_traceability --clean --if-exists /tmp/restore.dump
docker exec "$CONTAINER" rm -f /tmp/restore.dump
```

Οι παράμετροι `--clean --if-exists` διαγράφουν τα υπάρχοντα αντικείμενα πριν τα ξαναδημιουργήσουν. Χωρίς αυτές, η επαναφορά αποτυγχάνει σε πίνακες που ήδη υπάρχουν.

Αντικαταστήστε τα `vacuum_user` και `vacuum_traceability` αν αλλάξατε τα `POSTGRES_USER` ή `POSTGRES_DB` στο `.env.production`.

**Δοκιμή επαναφοράς χωρίς να αγγίξετε την παραγωγή** — συνιστάται πριν βασιστείτε σε ένα αντίγραφο. Επαναφέρετε σε προσωρινή βάση και ελέγξτε την:

```bash
docker exec "$CONTAINER" psql -U vacuum_user -d postgres -c "CREATE DATABASE restore_test;"
docker exec "$CONTAINER" pg_restore -U vacuum_user -d restore_test /tmp/restore.dump
docker exec "$CONTAINER" psql -U vacuum_user -d restore_test -c 'SELECT count(*) FROM "VacuumPad";'
docker exec "$CONTAINER" psql -U vacuum_user -d postgres -c "DROP DATABASE restore_test;"
```

### 7.2 Φωτογραφίες

Αντιγράψτε τον φάκελο του αντιγράφου πίσω στην αποθήκευση:

```bash
docker run --rm \
  --network "$(docker inspect -f '{{range $n, $_ := .NetworkSettings.Networks}}{{println $n}}{{end}}' \
    "$(docker compose --env-file .env.production -f docker-compose.prod.yml ps -q minio)" | head -n1)" \
  --env-file .env.production \
  -v "$(pwd)/backups/minio-20260901-095521:/restore" \
  --entrypoint sh minio/mc \
  -c 'mc alias set prod "$S3_ENDPOINT" "$S3_ACCESS_KEY" "$S3_SECRET_KEY" && mc mirror --overwrite /restore "prod/$S3_BUCKET"'
```

Σε Windows με Git Bash, αντικαταστήστε το `$(pwd)/backups/...` με πλήρη διαδρομή Windows, π.χ. `C:/apps/vacuum-pads/backups/minio-20260901-095521`, και προσθέστε το πρόθεμα `MSYS_NO_PATHCONV=1` στην εντολή. Το Git Bash μετατρέπει τις διαδρομές τύπου Unix, με αποτέλεσμα το Docker να προσαρτήσει άδειο φάκελο.

### 7.3 Μετά την επαναφορά

```bash
curl http://localhost:3000/health/database
```

Έπειτα ανοίξτε τη σελίδα διαχείρισης και επιβεβαιώστε ότι εμφανίζονται σωστά τα πλήθη των vacuum και ότι ανοίγει μια φωτογραφία επισκευής.

---

## 8. Πώς επιβεβαιώνετε ότι ένα αντίγραφο είναι καλό

Ένα αντίγραφο που δεν έχει επαναφερθεί ποτέ είναι υπόθεση, όχι εγγύηση. Μία φορά ανά τρίμηνο, επαναφέρετε το πιο πρόσφατο αντίγραφο σε προσωρινή βάση (ενότητα 7.1) και επιβεβαιώστε ότι τα πλήθη εγγραφών είναι λογικά.

Γρήγοροι έλεγχοι:

| Έλεγχος | Εντολή | Αναμενόμενο |
|---|---|---|
| Το αρχείο είναι έγκυρο | `pg_restore -l backups/postgres-*.dump` | Λίστα πινάκων, χωρίς σφάλμα |
| Δεν είναι κομμένο | `head -c 5 backups/postgres-*.dump` | Ξεκινά με `PGDMP` |
| Οι φωτογραφίες είναι πραγματικές | Ανοίξτε ένα `.png` από το `backups/minio-*/` | Η εικόνα εμφανίζεται |
| Το αντίγραφο δεν είναι άδειο | `du -sh backups/minio-*/` | Μεγαλώνει καθώς προστίθενται φωτογραφίες |

---

## 9. Αντιμετώπιση προβλημάτων

**«Postgres container is not running for the selected compose project.»**
Το σύστημα είναι σταματημένο, ή εκτελέσατε το script από λάθος φάκελο. Εκτελέστε το από τον ριζικό φάκελο και ελέγξτε με `docker compose -f docker-compose.prod.yml --env-file .env.production ps`.

**«Compose file not found» / «Environment file not found»**
Ίδια αιτία — εκτελέστε από τον ριζικό φάκελο, ή δώστε ρητά τα `--compose-file` / `--env-file`.

**«Backup folder was not created … the volume mount did not reach the host filesystem.»**
Εμφανίζεται από το `backup-minio.sh` όταν το Docker προσάρτησε κάτι διαφορετικό από τον φάκελό σας — κατάσταση που διαφορετικά θα ανέφερε επιτυχία χωρίς να γράψει τίποτα. Συνήθως πρόκειται για διαδρομή που το Docker δεν αναγνωρίζει. Σε Windows χρησιμοποιήστε το script PowerShell, ή εκτελέστε από WSL. Σε Linux, ελέγξτε ότι ο φάκελος βρίσκεται σε σύστημα αρχείων που το Docker μπορεί να προσαρτήσει και ότι ο χρήστης έχει δικαίωμα εγγραφής.

**Ο φάκελος των φωτογραφιών είναι άδειος**
Φυσιολογικό αν δεν έχει ανέβει καμία φωτογραφία επισκευής ακόμη. Επιβεβαιώστε με:
`docker compose --env-file .env.production -f docker-compose.prod.yml exec postgres psql -U vacuum_user -d vacuum_traceability -c 'SELECT count(*) FROM "RepairPhoto";'`

**`permission denied` κατά την εκτέλεση script `.sh`**
`chmod +x scripts/*.sh`

**Το PowerShell μπλοκάρει το script**
Εκτελέστε το όπως στην ενότητα του Χρονοπρογραμματιστή, με `-ExecutionPolicy Bypass -File`, αντί να αλλάξετε την πολιτική όλου του μηχανήματος.

**Η επαναφορά αποτυγχάνει με «relation already exists»**
Παραλείφθηκαν οι παράμετροι `--clean --if-exists`. Δείτε την ενότητα 7.1.
