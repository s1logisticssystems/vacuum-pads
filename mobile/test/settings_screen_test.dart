import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:vacuum_traceability_mobile/core/notifications/notification_provider.dart';
import 'package:vacuum_traceability_mobile/core/notifications/notification_service.dart';
import 'package:vacuum_traceability_mobile/features/settings/settings_screen.dart';

void main() {
  setUp(() {
    SharedPreferences.setMockInitialValues(<String, Object>{
      'settings.deviceId': 'flutter-test-device',
      'settings.apiBaseUrl': 'http://server.local:3000',
    });
  });

  testWidgets(
    'settings screen renders device id server field and test button',
    (WidgetTester tester) async {
      await tester.pumpWidget(
        const ProviderScope(child: MaterialApp(home: SettingsScreen())),
      );

      await tester.pumpAndSettle();

      expect(
        find.text('\u03A1\u03C5\u03B8\u03BC\u03AF\u03C3\u03B5\u03B9\u03C2'),
        findsWidgets,
      );
      expect(find.text('flutter-test-device'), findsOneWidget);
      expect(
        find.byKey(const ValueKey<String>('settings-api-url-input')),
        findsOneWidget,
      );
      expect(
        find.byKey(const ValueKey<String>('settings-test-connection-button')),
        findsOneWidget,
      );
      expect(
        find.byKey(
          const ValueKey<String>('settings-notify-repair-intake-switch'),
        ),
        findsOneWidget,
      );
      expect(
        find.byKey(
          const ValueKey<String>('settings-notify-repair-restored-switch'),
        ),
        findsOneWidget,
      );
      expect(find.text('Topic: vacuum-repair-intake'), findsOneWidget);
      expect(find.text('Topic: vacuum-repair-restored'), findsOneWidget);
      expect(
        find.byKey(const ValueKey<String>('app-back-button')),
        findsOneWidget,
      );
      expect(
        find.byKey(const ValueKey<String>('app-home-button')),
        findsOneWidget,
      );
    },
  );

  testWidgets('settings notification toggles persist preferences', (
    WidgetTester tester,
  ) async {
    tester.view.physicalSize = const Size(800, 1600);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    final notificationService = FakeNotificationService();

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          notificationServiceProvider.overrideWithValue(notificationService),
        ],
        child: const MaterialApp(home: SettingsScreen()),
      ),
    );

    await tester.pumpAndSettle();

    final repairIntakeSwitch = find.byKey(
      const ValueKey<String>('settings-notify-repair-intake-switch'),
    );
    final repairRestoredSwitch = find.byKey(
      const ValueKey<String>('settings-notify-repair-restored-switch'),
    );

    await tester.ensureVisible(repairIntakeSwitch);
    await tester.tap(repairIntakeSwitch);
    await tester.pumpAndSettle();

    await tester.ensureVisible(repairRestoredSwitch);
    await tester.tap(repairRestoredSwitch);
    await tester.pumpAndSettle();

    final preferences = await SharedPreferences.getInstance();
    expect(preferences.getBool('settings.notifyRepairIntake'), isTrue);
    expect(preferences.getBool('settings.notifyRepairRestored'), isTrue);
    expect(notificationService.repairIntakeEnabled, isTrue);
    expect(notificationService.repairRestoredEnabled, isTrue);
    expect(find.text('Subscribed in test.'), findsWidgets);
  });

  testWidgets('settings does not render notification sound diagnostics', (
    WidgetTester tester,
  ) async {
    tester.view.physicalSize = const Size(800, 2200);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    await tester.pumpWidget(
      const ProviderScope(child: MaterialApp(home: SettingsScreen())),
    );

    await tester.pumpAndSettle();

    expect(find.text('Διαγνωστικά ειδοποιήσεων'), findsNothing);
    expect(
      find.byKey(const ValueKey<String>('settings-test-restored-sound-button')),
      findsNothing,
    );
    expect(
      find.byKey(const ValueKey<String>('settings-test-intake-sound-button')),
      findsNothing,
    );
    expect(find.textContaining('Repair intake channel:'), findsNothing);
    expect(find.textContaining('Repair restored channel:'), findsNothing);
  });
}

class FakeNotificationService extends NotificationService {
  bool? repairIntakeEnabled;
  bool? repairRestoredEnabled;

  @override
  Future<NotificationSyncResult> setRepairIntakeEnabled(bool enabled) async {
    repairIntakeEnabled = enabled;
    return const NotificationSyncResult(
      isConfigured: true,
      isSuccess: true,
      message: 'Subscribed in test.',
      fcmToken: 'test-token',
    );
  }

  @override
  Future<NotificationSyncResult> setRepairRestoredEnabled(bool enabled) async {
    repairRestoredEnabled = enabled;
    return const NotificationSyncResult(
      isConfigured: true,
      isSuccess: true,
      message: 'Subscribed in test.',
      fcmToken: 'test-token',
    );
  }
}
