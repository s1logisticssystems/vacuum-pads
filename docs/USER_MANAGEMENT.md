# User Accounts and Access — Operations Guide

Guide for whoever administers this installation. Covers signing in, creating
accounts, resetting passwords, and recovering access if the administrator
password is lost.

Every endpoint of the API requires a signed-in user. There is no anonymous
access and no shared account.

---

## 1. Roles

| Role | Greek label | Can do |
|---|---|---|
| `ADMIN` | Διαχειριστής | Everything, including managing user accounts |
| `SUPERVISOR` | Επόπτης | All operational work and reports |
| `TECHNICIAN` | Τεχνικός | All operational work and reports |
| `OPERATOR` | Χειριστής | All operational work and reports |

Only `ADMIN` sees the **Χρήστες** tab and can create, modify or delete
accounts. The other three roles differ only in labelling today; they are
recorded against every movement for traceability.

Give day-to-day staff `OPERATOR` and reserve `ADMIN` for the one or two people
who administer the system.

---

## 2. Signing in

Both the admin website and the Android app open on a sign-in screen. The
session is stored on the device and lasts 12 hours by default, after which the
user signs in again.

Signing out is under the gear icon (⚙) on the website, and in **Ρυθμίσεις** in
the app.

---

## 3. Creating the first administrator

A new installation has no password on any account, so nobody can sign in until
you create the first administrator. Run this once, from the repository root:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production run --rm \
  -e PASSWORD='choose-a-strong-password' \
  migrate npx tsx scripts/set-user-password.ts \
  --username admin --role ADMIN --display-name "Administrator"
```

Passing the password through `PASSWORD` rather than `--password` keeps it out
of shell history. The command creates the account if it does not exist and sets
its password if it does.

Sign in on the website afterwards and create everyone else from the interface.

---

## 4. Managing accounts from the website

Sign in as an administrator and open the **Χρήστες** tab.

| Action | How |
|---|---|
| Create a user | **Νέος χρήστης** — set username, role and password |
| Reset someone's password | **Ορισμός κωδικού** on their row |
| Change your own password | **Αλλαγή του κωδικού μου** |
| Retire a user | **Διαγραφή** on their row |

The table shows whether each account can sign in. Accounts marked
`Χωρίς κωδικό` exist only to attribute historical movements and cannot sign in
until you set a password for them.

### Password rules

At least 10 characters, containing both letters and numbers. The same rules
apply wherever a password is set.

### What deleting actually does

The account is deactivated and its password cleared, so it can no longer sign
in, but the row is kept. Movements, repairs and audit entries reference it, and
removing it outright would break that history.

Two deletions are refused:

- **Your own account** — you would lock yourself out mid-session.
- **The last remaining administrator** — nobody could manage users afterwards.
  Create another administrator first.

---

## 5. Recovering a lost administrator password

Use the same command as section 3 with the existing username. It overwrites the
password of an existing account:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production run --rm \
  -e PASSWORD='new-password' \
  migrate npx tsx scripts/set-user-password.ts --username admin --role ADMIN
```

This requires shell access to the server, which is intentional: it is the
recovery path of last resort, available only to whoever administers the host.

---

## 6. Configuration

| Variable | Purpose |
|---|---|
| `JWT_SECRET` | Signs access tokens. Required in production, minimum 32 characters. |
| `JWT_EXPIRES_IN_SECONDS` | Session length. Defaults to 43200 (12 hours). |

Generate a secret with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Treat `JWT_SECRET` like a database password. Anyone holding it can mint valid
tokens for any user. Changing it signs everyone out, which is the correct
response if you suspect it has leaked.

---

## 7. Protections in place

- Passwords are stored as bcrypt hashes and never returned by the API.
- Sign-in answers a wrong username and a wrong password identically, and takes
  the same time either way, so neither can be probed.
- Sign-in is limited to five attempts a minute per address.
- Accounts are re-checked on every request, so deactivating a user takes effect
  immediately rather than when their token expires.
- Every endpoint is protected by default; a route must explicitly opt out, and
  only the health probes do.

---

## 8. Troubleshooting

**"Λάθος όνομα χρήστη ή κωδικός"**
Check the username is spelled correctly — usernames are lowercase. If the
account shows `Χωρίς κωδικό` in the Χρήστες tab, set a password for it.

**"Πολλές προσπάθειες. Δοκιμάστε ξανά σε ένα λεπτό."**
The rate limit was reached. Wait a minute; it clears on its own.

**Signed out unexpectedly**
The session expired, or an administrator deactivated the account. Sign in
again; if that fails, ask an administrator to check the account.

**Nobody can sign in at all**
Confirm the backend started. If `JWT_SECRET` is missing or shorter than 32
characters, it refuses to start in production and the logs say so:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production logs backend | tail -30
```

**The app says it cannot reach the server**
The address is wrong or unreachable, not a credentials problem. Check it under
**Ρυθμίσεις διακομιστή** on the sign-in screen.
