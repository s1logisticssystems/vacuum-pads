import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:vacuum_traceability_mobile/app.dart';
import 'package:vacuum_traceability_mobile/core/notifications/notification_service.dart';
import 'package:vacuum_traceability_mobile/core/settings/settings_service.dart';
import 'package:wakelock_plus/wakelock_plus.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await _configureDeviceChrome();
  runApp(const ProviderScope(child: VacuumTraceabilityApp()));
}

Future<void> _configureDeviceChrome() async {
  try {
    await SystemChrome.setPreferredOrientations(<DeviceOrientation>[
      DeviceOrientation.portraitUp,
    ]);
  } catch (_) {
    // Keep startup resilient on platforms that do not support orientation lock.
  }

  try {
    await SystemChrome.setEnabledSystemUIMode(SystemUiMode.immersiveSticky);
  } catch (_) {
    // Keep startup resilient on platforms that do not support fullscreen mode.
  }

  try {
    await WakelockPlus.enable();
  } catch (_) {
    // Keep the app usable even if the platform rejects the wakelock request.
  }

  try {
    final settings = await SettingsService().load();
    await NotificationService().syncSettings(settings);
  } catch (_) {
    // Firebase is optional until google-services.json is configured.
  }
}
