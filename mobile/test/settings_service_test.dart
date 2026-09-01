import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:vacuum_traceability_mobile/core/config/app_config.dart';
import 'package:vacuum_traceability_mobile/core/settings/settings_service.dart';

void main() {
  setUp(() {
    SharedPreferences.setMockInitialValues(<String, Object>{});
  });

  test('settings service generates a device id when missing', () async {
    final settings = await SettingsService().load();

    expect(settings.deviceId, startsWith('flutter-'));
    expect(settings.deviceId.length, greaterThan('flutter-'.length));
  });

  test('settings service uses the production default api base url', () async {
    final settings = await SettingsService().load();

    expect(settings.apiBaseUrl, AppConfig.fallbackApiBaseUrl);
    expect(settings.apiBaseUrl, 'http://vacuum.s1-logistics.com');
  });

  test('settings service saves and loads normalized api base url', () async {
    final service = SettingsService();

    final saved = await service.saveApiBaseUrl('192.168.1.50:3000/');
    final loaded = await service.load();

    expect(saved.apiBaseUrl, 'http://192.168.1.50:3000');
    expect(loaded.apiBaseUrl, 'http://192.168.1.50:3000');
    expect(loaded.deviceId, saved.deviceId);
  });
}
