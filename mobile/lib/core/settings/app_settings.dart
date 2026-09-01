class AppSettings {
  const AppSettings({
    required this.deviceId,
    required this.apiBaseUrl,
    this.notifyRepairIntake = false,
    this.notifyRepairRestored = false,
  });

  final String deviceId;
  final String apiBaseUrl;
  final bool notifyRepairIntake;
  final bool notifyRepairRestored;

  AppSettings copyWith({
    String? deviceId,
    String? apiBaseUrl,
    bool? notifyRepairIntake,
    bool? notifyRepairRestored,
  }) {
    return AppSettings(
      deviceId: deviceId ?? this.deviceId,
      apiBaseUrl: apiBaseUrl ?? this.apiBaseUrl,
      notifyRepairIntake: notifyRepairIntake ?? this.notifyRepairIntake,
      notifyRepairRestored: notifyRepairRestored ?? this.notifyRepairRestored,
    );
  }
}
