# Vacuum Traceability Mobile

This Flutter app is the Android-first MVP shell for the Vacuum Pads Traceability project.

Current scope:

- home menu with the 5 operator entry points
- charge workflow UI for scan/manual input, preview, machine selection, and confirm
- decharge workflow UI for scan/manual input, two-step preview, and confirm
- fault declaration workflow UI with required 1-5 repair photos before completion
- fault restoration workflow UI without photo upload
- backend health screen
- Settings screen for app-scoped device ID, runtime backend URL, and notification preferences
- QR scanner foundation
- Firebase Cloud Messaging topic-subscription foundation for repair notifications
- polished status API access for the `Κατάσταση` screen

Out of scope for this milestone:

- repair photo management after declaration completion
- admin screens

## Requirements

- Flutter stable installed on Windows
- Android emulator or Android device
- local backend running on the Windows host

Flutter does not talk directly to Docker PostgreSQL or MinIO. It talks only to the backend API.
For photo uploads, the backend stores files in MinIO when configured and falls back to local filesystem storage when MinIO is unavailable.

## API Base URL

The app uses a persisted backend URL from Settings. On first launch, Settings defaults to `--dart-define=API_BASE_URL=...`, then falls back to the production server URL.

Default:

```powershell
http://vacuum.s1-logistics.com
```

Saved Settings values always win over this default, so an already configured device keeps using its saved server URL after app updates.

For the Android emulator, override the URL because `10.0.2.2` maps back to the Windows host:

```powershell
flutter run --dart-define=API_BASE_URL=http://10.0.2.2:3000
```

For a physical Android device, use the LAN IP of the Windows machine running the backend:

```powershell
flutter run --dart-define=API_BASE_URL=http://192.168.1.50:3000
```

You can change the server later from the gear icon on the home screen without rebuilding the APK. The Settings screen also shows the generated app-scoped device identifier used as `deviceId` in backend calls.

Examples for Settings:

- Production default: `http://vacuum.s1-logistics.com`
- Android emulator: `http://10.0.2.2:3000`
- Physical device on local Wi-Fi/LAN: `http://192.168.1.50:3000`
- Company server: `http://server-name:3000` or `https://vacuum-server.company.local`

For production, HTTPS is recommended. During local testing, the backend must be reachable from the Android device network, and Windows Firewall may need to allow inbound traffic on port `3000`.

## Firebase Notifications

The Settings screen includes notification preferences for:

- Vacuum entering a repair position: `vacuum-repair-intake`
- Vacuum restoration completed: `vacuum-repair-restored`

When Firebase is configured, enabling a switch subscribes the installed app to the matching FCM topic. Disabling a switch unsubscribes from that topic. Multiple devices can enable the same preference and receive the same topic notification.

Android notification resources:

- app launcher icon is generated from local `_local/media/icon.png`
- foreground/background notification small icon uses generated `ic_stat_vacuum` resources from `_local/media/icon_trans.png`
- repair intake notifications use channel `repair_intake_channel_v7` with raw sound resource `error`
- repair restored notifications use channel `repair_restored_channel_v7` with raw sound resource `fix`
- repair restored uses the new bundled `res/raw/fix.wav`
- release APKs keep both raw sound resources through `res/raw/keep.xml`; Android may rename the internal APK file paths, but the resource table must still expose `@raw/error` and `@raw/fix`

The source files in `_local/media/` are local-only and must not be committed. Commit only the generated Android resources under `mobile/android/app/src/main/res/`.

Android keeps notification channel sound settings after a channel is created.
If a test device used older channel ids and the sound does not change, uninstall
the app or clear app data, then reinstall the APK so Android creates the v7
channels with the bundled sounds:

```powershell
adb uninstall com.s1logistics.vacuumtracker
```

Also check Android notification category settings on the device:
`Settings -> Apps -> Vacuum Tracker -> Notifications -> Notification categories`.
If an OEM still plays the default sound or has muted a category, uninstall the
app or clear app data, reinstall, and verify old channel categories are removed,
and the `repair_intake_channel_v7` and `repair_restored_channel_v7` categories
are not muted. For split release APK
testing, install the generated APK, for example:

```powershell
adb install -r build\app\outputs\flutter-apk\app-arm64-v8a-release.apk
```

The Android package name is:

```text
com.s1logistics.vacuumtracker
```

Firebase is optional for local MVP builds. This repository does not include Firebase secret files or service account JSON. To enable Android FCM for a real project:

1. Create a Firebase project and Android app with package name `com.s1logistics.vacuumtracker`.
2. Download `google-services.json`.
3. Place it at `mobile/android/app/google-services.json`.
4. Rebuild the APK.

The Android Gradle setup applies the Google Services plugin only when `google-services.json` exists, so local builds continue to work without Firebase config. Do not commit Firebase secret files, service account JSON, or `google-services.json`.

Backend FCM topic sending is optional and uses a local service account path:

```powershell
$env:FIREBASE_SERVICE_ACCOUNT_PATH="C:\dev\vacuum-traceability\_local\firebase\firebase-service-account.json"
```

If the service account path is missing or invalid, backend workflows still complete and notifications are skipped.

## Run Locally

Start or reset local backend data first if needed:

```powershell
.\scripts\reset-dev-db.ps1 -ConfirmLocalReset
```

Then start the backend API on Windows host tooling:

```powershell
cd backend
npm run start:dev
```

In a separate shell, run Flutter.

From the repository root:

```powershell
cd mobile
flutter pub get
flutter run
```

With an explicit backend override:

```powershell
cd mobile
flutter run --dart-define=API_BASE_URL=http://10.0.2.2:3000
```

For a physical device:

```powershell
cd mobile
flutter run --dart-define=API_BASE_URL=http://192.168.1.50:3000
```

## Debug APK

Build a debug APK:

```powershell
cd mobile
flutter build apk --debug
```

APK output:

```text
build/app/outputs/flutter-apk/app-debug.apk
```

Install with ADB:

```powershell
adb install -r build/app/outputs/flutter-apk/app-debug.apk
```

After install, open Settings from the home screen gear icon and configure the backend server URL for that device/network.

## Manual Workflow Tests

Recommended local setup:

```powershell
docker compose up -d postgres minio
.\scripts\reset-dev-db.ps1 -ConfirmLocalReset
cd backend
$env:DATABASE_URL="postgresql://vacuum_user:vacuum_pass@localhost:5432/vacuum_traceability?schema=public"
npm run start:dev
```

In another shell:

```powershell
cd mobile
flutter run --dart-define=API_BASE_URL=http://10.0.2.2:3000
```

Seeded manual QR values after the Excel data-alignment seed update:

- VP-001 serial scan: `VAC:19081291644`
- VP-005 serial scan: `VAC:19081291648`
- Empty AVL rack scan for return/decharge tests: `RACK:RACK-A-01-07`
- REP rack scan for repair-required decharge tests: `RACK:RACK-REP-01`

Code-based scans such as `VAC:VP-001` remain supported during transition, but the realistic seeded labels use the Excel serial numbers above.

Charge and decharge path:

1. Open `Χρέωση`
2. Scan or type `VAC:19081291644`
3. Run preview
4. Select an available machine
5. Press `ΧΡΕΩΣΗ`
6. Open `Αποχρέωση`
7. Scan or type `VAC:19081291644`
8. Press `Έλεγχος Vacuum`
9. Scan or type `RACK:RACK-A-01-07`
10. Press `Έλεγχος Αποχρέωσης`
11. Press `ΑΠΟΧΡΕΩΣΗ`

Fault declaration path:

1. Open `Δήλωση Βλάβης`
2. Scan or type `VAC:19081291648`
3. Press `Έλεγχος Vacuum`
4. Select `FC-001` or enable `Άλλο` and enter a custom fault
5. Press `Έλεγχος Δήλωσης`
6. Press `ΔΗΛΩΣΗ ΒΛΑΒΗΣ`

Fault restoration path:

1. Open `Δήλωση Βλάβης`
2. Declare a fault for `VAC:19081291648`
3. Open `Αποκατάσταση Βλάβης`
4. Scan or type `VAC:19081291648`
5. Press `Έλεγχος Vacuum`
6. Scan or type `RACK:RACK-A-01-07`
7. Press `Έλεγχος Θέσης`
8. Choose `RETURNED_TO_SERVICE`
9. Press `ΑΠΟΚΑΤΑΣΤΑΣΗ ΒΛΑΒΗΣ`

Repair photo upload is required during fault declaration. After the fault reason
is selected, the app creates the Repair, then requires 1 to 5 camera photos
before showing the final success message. Start MinIO with
`docker compose up -d postgres minio` for primary object storage; if MinIO is
unavailable, the backend may use its filesystem fallback.

Photo upload manual check:

1. Complete the fault declaration path for `VAC:19081291648`.
2. Select a fault reason.
3. Capture at least one photo in the photo dialog.
4. Confirm the preview and upload the photo.
5. Optionally add up to 5 photos total.
6. Press `ΟΛΟΚΛΗΡΩΣΗ` and confirm the final success message.

## Notes

- The Android manifest enables cleartext HTTP for local MVP development.
- The app is locked to portrait orientation.
- The app uses fullscreen immersive mode so Android navigation controls do not cover bottom workflow buttons.
- The app keeps the screen awake while it is running.
- Android system back now asks for confirmation before closing the app.
- Workflow screens include in-app Home and Back controls; Home uses route replacement so repeated menu navigation does not grow the navigation stack.
- The scanner foundation uses `mobile_scanner` and requests camera access on Android.
- The scanner opens directly at `3x`, turns the torch on when supported, shows a minimal centered frame, and returns immediately to the workflow after a QR is detected.
- The Settings screen persists the backend API URL, app-scoped device ID, and FCM notification preferences with `shared_preferences`.
- The charge screen now uses `/charge/preview`, `/charge`, and `/master-data/machines` with decision dialogs, modal machine selection, a confirmation step, and automatic return to Home after successful charge.
- The decharge screen now uses `/decharge/preview` and `/decharge`.
- The fault declaration screen now uses `/faults/catalog`, `/faults/declaration/preview`, `/faults/declaration`, and `/faults/:repairId/photos`.
- The fault restoration screen now uses `/faults/restoration/preview` and `/faults/restoration`.
- Typed UI models and richer photo management will be added in later milestones.
