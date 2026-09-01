import 'dart:math';

import 'package:shared_preferences/shared_preferences.dart';
import 'package:vacuum_traceability_mobile/core/config/app_config.dart';
import 'package:vacuum_traceability_mobile/core/settings/app_settings.dart';

class SettingsService {
  static const String _deviceIdKey = 'settings.deviceId';
  static const String _apiBaseUrlKey = 'settings.apiBaseUrl';
  static const String _notifyRepairIntakeKey = 'settings.notifyRepairIntake';
  static const String _notifyRepairRestoredKey =
      'settings.notifyRepairRestored';

  Future<AppSettings> load() async {
    final preferences = await SharedPreferences.getInstance();

    var deviceId = preferences.getString(_deviceIdKey)?.trim();
    if (deviceId == null || deviceId.isEmpty) {
      deviceId = _generateDeviceId();
      await preferences.setString(_deviceIdKey, deviceId);
    }

    final savedApiBaseUrl = preferences.getString(_apiBaseUrlKey)?.trim();
    final apiBaseUrl = normalizeApiBaseUrl(
      savedApiBaseUrl != null && savedApiBaseUrl.isNotEmpty
          ? savedApiBaseUrl
          : AppConfig.apiBaseUrl,
    );

    return AppSettings(
      deviceId: deviceId,
      apiBaseUrl: apiBaseUrl,
      notifyRepairIntake: preferences.getBool(_notifyRepairIntakeKey) ?? false,
      notifyRepairRestored:
          preferences.getBool(_notifyRepairRestoredKey) ?? false,
    );
  }

  Future<AppSettings> saveApiBaseUrl(String value) async {
    final preferences = await SharedPreferences.getInstance();
    final normalizedUrl = normalizeApiBaseUrl(value);
    await preferences.setString(_apiBaseUrlKey, normalizedUrl);
    return load();
  }

  Future<AppSettings> saveNotificationPreferences({
    bool? notifyRepairIntake,
    bool? notifyRepairRestored,
  }) async {
    final preferences = await SharedPreferences.getInstance();

    if (notifyRepairIntake != null) {
      await preferences.setBool(_notifyRepairIntakeKey, notifyRepairIntake);
    }

    if (notifyRepairRestored != null) {
      await preferences.setBool(_notifyRepairRestoredKey, notifyRepairRestored);
    }

    return load();
  }

  static String normalizeApiBaseUrl(String value) {
    var normalized = value.trim();
    if (normalized.isEmpty) {
      normalized = AppConfig.apiBaseUrl;
    }

    if (!normalized.startsWith('http://') &&
        !normalized.startsWith('https://')) {
      normalized = 'http://$normalized';
    }

    while (normalized.endsWith('/')) {
      normalized = normalized.substring(0, normalized.length - 1);
    }

    final uri = Uri.tryParse(normalized);
    if (uri == null ||
        (uri.scheme != 'http' && uri.scheme != 'https') ||
        uri.host.trim().isEmpty) {
      throw const FormatException(
        'Enter a valid API URL, for example http://192.168.1.50:3000',
      );
    }

    return normalized;
  }

  String _generateDeviceId() {
    final random = Random.secure();
    final token = List<String>.generate(
      12,
      (_) => random.nextInt(256).toRadixString(16).padLeft(2, '0'),
    ).join();

    return 'flutter-$token';
  }
}
