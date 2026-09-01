# Handover — What to Give the Customer

Checklist for handing this system to the organisation that will run it. Read
top to bottom before the first delivery; afterwards it is a reference.

---

## 1. What they receive

| Item | Where it comes from |
|---|---|
| Full source code | This Git repository — backend, admin and mobile |
| Android app | A signed `.apk` you build and hand over directly |
| Documentation | The `docs/` folder, listed in section 3 |
| Security dossier | Separate document for their security review |

Nothing else is required. The system is self-hosted and has no external service
dependencies.

---

## 2. Order of installation

1. They clone the repository onto the server that will run it.
2. They copy `.env.production.example` to `.env.production` and replace every
   `CHANGE_ME` value, including `JWT_SECRET`.
3. They start the stack (`docker compose -f docker-compose.prod.yml ...`).
4. They create the first administrator with the `set-password` script.
5. They put a reverse proxy in front of it for HTTPS.
6. They install the APK on the operators' devices and point it at their server.

Steps 2-4 are covered in the README, step 4 in detail in `USER_MANAGEMENT.md`.

---

## 3. Documents to hand over

Give all of these. Each answers a question the customer will otherwise ask.

| Document | Audience | Answers |
|---|---|---|
| `README.md` | Whoever installs it | What the system is, how to start it, what the parts are |
| `docs/USER_MANAGEMENT.md` | System administrator | Creating accounts, resetting passwords, recovering lost access |
| `docs/BACKUP_AND_RESTORE.md` | IT / operations | What to back up, scheduling, and how to restore |
| `docs/PRODUCTION_DEPLOYMENT.md` | IT / infrastructure | Deployment, updates, rollback |
| `docs/ARCHITECTURE.md` | Technical reviewer | How the parts fit together |
| Security dossier | Security / compliance | Technologies, network exposure, findings and their status |
| `docs/AUTHENTICATION_AND_AUTHORIZATION_PLAN.md` | Security / roadmap | What is implemented and what remains optional (MFA, SSO) |

The two most likely to be asked for on day one are `USER_MANAGEMENT.md` (they
cannot sign in without it) and `BACKUP_AND_RESTORE.md` (their IT policy will
require it).

---

## 4. What they must provide

State these explicitly at handover so there is no surprise later.

- **A host with Docker.** Linux server or Docker Desktop.
- **HTTPS.** The application does not terminate TLS; a reverse proxy must.
- **Secret storage.** `.env.production` holds the database password and
  `JWT_SECRET`. It belongs in their secret management, not in the repository.
- **A backup schedule.** The scripts exist; running them is their policy.
- **Account policy.** Who gets the administrator role.

---

## 5. Android app distribution

The app does **not** have to go through Google Play. Direct installation of a
signed APK is a normal enterprise arrangement, and updates work the same way:
hand over a new APK, the device installs it over the old one, and data and
settings are kept.

The condition is that every build is signed with the **same keystore**. Android
refuses to install an update signed with a different key, and the only way out
is to uninstall first, which loses the user's settings.

Practical consequences:

- Keep the keystore and its password somewhere they cannot be lost. Losing them
  means never being able to update this app again — a new key requires a fresh
  install on every device.
- Do not commit them. `.gitignore` already excludes `*.jks`, `*.keystore` and
  `key.properties`.
- Build releases on one machine, or copy the keystore between machines
  deliberately.

Google Play only becomes relevant if they want public listing, automatic
updates or Play's integrity checks. For an internal tool on company devices,
direct APK distribution or their MDM is the usual choice.

### Which APK to hand over

Builds are produced per processor architecture, so each file is far smaller
than a combined one:

| File | For |
|---|---|
| `app-arm64-v8a-release.apk` | Every current Android phone — **hand over this one** |
| `app-armeabi-v7a-release.apk` | Older 32-bit devices |
| `app-x86_64-release.apk` | Emulators, x86 tablets |

If unsure about a device, `app-release.apk` contains all three and installs
anywhere, at roughly triple the size.

---

## 6. Before the first handover

- [ ] A release keystore exists and is backed up somewhere durable.
- [ ] The APK is signed with it, not with the debug key.
- [ ] `.env.production` on their server has no `CHANGE_ME` values left.
- [ ] The first administrator account works.
- [ ] A backup has been taken **and restored** once, to prove it works.
- [ ] HTTPS is in front of both the admin site and the API.
- [ ] They know where the documents are.
