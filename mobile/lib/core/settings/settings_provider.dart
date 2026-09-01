import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:vacuum_traceability_mobile/core/config/app_config.dart';
import 'package:vacuum_traceability_mobile/core/settings/app_settings.dart';
import 'package:vacuum_traceability_mobile/core/settings/settings_service.dart';

final settingsServiceProvider = Provider<SettingsService>((ref) {
  return SettingsService();
});

final appSettingsProvider =
    AsyncNotifierProvider<AppSettingsController, AppSettings>(
      AppSettingsController.new,
    );

final apiBaseUrlProvider = Provider<String>((ref) {
  return ref
          .watch(appSettingsProvider)
          .whenOrNull(data: (AppSettings settings) => settings.apiBaseUrl) ??
      AppConfig.apiBaseUrl;
});

final deviceIdProvider = Provider<String>((ref) {
  return ref
          .watch(appSettingsProvider)
          .whenOrNull(data: (AppSettings settings) => settings.deviceId) ??
      AppConfig.transientDeviceId;
});

class AppSettingsController extends AsyncNotifier<AppSettings> {
  @override
  Future<AppSettings> build() {
    return ref.watch(settingsServiceProvider).load();
  }

  Future<void> saveApiBaseUrl(String value) async {
    try {
      final settings = await ref
          .read(settingsServiceProvider)
          .saveApiBaseUrl(value);
      state = AsyncData<AppSettings>(settings);
    } catch (_) {
      rethrow;
    }
  }

  Future<void> saveNotificationPreferences({
    bool? notifyRepairIntake,
    bool? notifyRepairRestored,
  }) async {
    try {
      final settings = await ref
          .read(settingsServiceProvider)
          .saveNotificationPreferences(
            notifyRepairIntake: notifyRepairIntake,
            notifyRepairRestored: notifyRepairRestored,
          );
      state = AsyncData<AppSettings>(settings);
    } catch (_) {
      rethrow;
    }
  }
}
