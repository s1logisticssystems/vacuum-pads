# Πλάνο Ισχυρής Ταυτοποίησης & Πιστοποίησης (Authentication & Authorization)

Αυτό το έγγραφο περιγράφει πώς θα μετεξελιχθεί η εφαρμογή ώστε να αποκτήσει πλήρη, παραγωγικού επιπέδου ταυτοποίηση χρηστών (authentication) και έλεγχο δικαιωμάτων (authorization). Δεν είναι ακόμα υλοποιημένο· είναι το σχέδιο υλοποίησης.

## 1. Τρέχουσα κατάσταση (baseline)

- Δεν υπάρχει login, session ή token-based αναγνώριση χρήστη σε κανένα API endpoint.
- Το μοντέλο `User` στη βάση (`role`, `username`, κ.λπ.) χρησιμοποιείται μόνο για attribution (ποιος έκανε μια κίνηση), όχι για έλεγχο πρόσβασης.
- Δεν υπάρχουν guards, δεν υπάρχει rate limiting, δεν υπάρχει MFA.
- Η μόνη σημερινή "προστασία" είναι δικτυακή απομόνωση (backend/admin δεμένα σε `127.0.0.1`, PostgreSQL/MinIO ποτέ δημόσια).

Αυτό είναι αποδεκτό μόνο για εγκατάσταση σε πλήρως απομονωμένο/εσωτερικό δίκτυο υπό έλεγχο. Πριν από οποιαδήποτε έκθεση εκτός τέτοιου δικτύου, απαιτείται η υλοποίηση παρακάτω.

## 2. Στόχος

- **Ταυτοποίηση (Authentication)**: κάθε χρήστης/συσκευή αποδεικνύει ποιος είναι πριν αποκτήσει πρόσβαση.
- **Πιστοποίηση/Εξουσιοδότηση (Authorization)**: κάθε ενέργεια ελέγχεται βάσει ρόλου/δικαιωμάτων, όχι μόνο βάσει του αν κάποιος έφτασε στο endpoint.
- Συμβατότητα και με τα δύο clients: Web Admin (React) και Mobile (Flutter).

## 3. Προτεινόμενη αρχιτεκτονική

### 3.1 Backend — JWT-based authentication

- Νέο `auth` module στο NestJS backend, με:
  - `POST /auth/login` (username/password → access token + refresh token)
  - `POST /auth/refresh` (refresh token → νέο access token, με rotation)
  - `POST /auth/logout` (invalidation/revocation του refresh token)
- Password hashing με **argon2** (ή bcrypt ως εναλλακτική).
- Access tokens: JWT, μικρής διάρκειας (π.χ. 15 λεπτά), signed με μυστικό κλειδί από environment variable (`JWT_SECRET`, ποτέ hardcoded).
- Refresh tokens: μεγαλύτερης διάρκειας, αποθηκευμένα (hashed) στη βάση ώστε να μπορούν να ανακληθούν ανά συσκευή/session.
- `Passport.js` (`passport-jwt`) strategy για επαλήθευση tokens σε κάθε request.

### 3.2 Authorization — RBAC στα υπάρχοντα endpoints

- Χρήση του ήδη υπάρχοντος πεδίου `User.role` (`OPERATOR`, κ.λπ. — θα επεκταθεί με `ADMIN`, `TECHNICIAN`, `VIEWER` όπως χρειαστεί).
- `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles(...)` decorator σε **κάθε** controller/endpoint (χρέωση, αποχρέωση, δηλώσεις βλάβης, master data CRUD, reports, movements).
- Προεπιλογή "deny by default": νέο endpoint χωρίς ρητό guard δεν θα περνάει code review.

### 3.3 Προστασία από brute-force / κατάχρηση

- `@nestjs/throttler` για rate limiting σε `/auth/login` και γενικά στο API.
- Lockout ή progressive delay μετά από επαναλαμβανόμενες αποτυχημένες προσπάθειες login.
- Καταγραφή αποτυχημένων logins στο audit log.

### 3.4 MFA (προαιρετικό, για admin-level λογαριασμούς)

- TOTP-based δεύτερος παράγοντας (Google Authenticator/Authy συμβατό) για ρόλους με αυξημένα δικαιώματα (π.χ. `ADMIN`).

### 3.5 Web Admin (React)

- Οθόνη login πριν από οποιαδήποτε άλλη σελίδα.
- Αποθήκευση access token σε μνήμη (όχι localStorage) και refresh token σε **httpOnly, Secure cookie** (μειώνει την έκθεση σε XSS σε σχέση με τη σημερινή προσέγγιση αποθήκευσης backend URL σε localStorage).
- Αυτόματο refresh/logout σε λήξη session, και απόκρυψη ενεργειών βάσει ρόλου χρήστη στο UI (πέραν του server-side ελέγχου, που παραμένει η πηγή αλήθειας).

### 3.6 Mobile (Flutter)

- Ήδη υπάρχει εξάρτηση `firebase-admin` στο backend (χρησιμοποιείται σήμερα για push notifications). Μπορεί να επεκταθεί σε **Firebase Authentication** για τις mobile συσκευές αντί για ξεχωριστό JWT flow, ή να χρησιμοποιηθεί το ίδιο `auth` module με device-scoped refresh tokens.

### 3.7 Προαιρετική ενσωμάτωση με εταιρικό Identity Provider (SSO)

Αν η εταιρία θέλει κεντρική διαχείριση χρηστών (π.χ. Azure AD / Entra ID, Google Workspace, Okta):

- Το backend μπορεί να δεχτεί OIDC/SAML ως εναλλακτικό ή αποκλειστικό provider, με mapping ρόλων από claims/groups του IdP στο εσωτερικό `UserRole`.
- Αυτό αντικαθιστά το τοπικό password login αλλά διατηρεί το ίδιο μοντέλο RBAC στο βήμα 3.2.

## 4. Φάσεις υλοποίησης (προτεινόμενη σειρά)

1. **Φάση 1 — Θεμέλιο**: `auth` module, login/refresh/logout, password hashing, `JwtAuthGuard` σε όλα τα endpoints (χωρίς ακόμα λεπτομερή RBAC ανά ρόλο).
2. **Φάση 2 — RBAC**: `RolesGuard` + `@Roles()` σε κάθε endpoint, seed αρχικών λογαριασμών/ρόλων, ενημέρωση Web Admin με login screen.
3. **Φάση 3 — Σκλήρυνση**: rate limiting, audit logging αποτυχημένων προσπαθειών, MFA για admin ρόλους, refresh token revocation ανά συσκευή.
4. **Φάση 4 — Προαιρετικό SSO**: ενσωμάτωση με εταιρικό IdP αν ζητηθεί.

## 5. Τι ΔΕΝ αλλάζει

- Η δικτυακή απομόνωση (PostgreSQL/MinIO ποτέ δημόσια, TLS termination από reverse proxy) παραμένει ως έχει — η ταυτοποίηση προστίθεται σαν επιπλέον επίπεδο, δεν αντικαθιστά τη δικτυακή ασφάλεια.
- Το υπάρχον audit log model επεκτείνεται (πλέον θα δένεται σε πραγματικά αυθεντικοποιημένο χρήστη) αντί να ξαναχτιστεί από την αρχή.
