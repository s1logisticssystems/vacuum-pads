class AppConfig {
  const AppConfig._();

  // HTTPS: Android blocks cleartext traffic by default, and the API now
  // carries credentials that must not travel unencrypted.
  static const String fallbackApiBaseUrl = 'https://vacuum.s1-logistics.com';

  static const String apiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: fallbackApiBaseUrl,
  );

  static const String transientDeviceId = 'flutter-dev-device';
}
