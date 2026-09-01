import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:vacuum_traceability_mobile/app.dart';
import 'package:vacuum_traceability_mobile/core/api/api_client.dart';
import 'package:vacuum_traceability_mobile/core/api/api_client_provider.dart';
import 'package:vacuum_traceability_mobile/core/navigation/navigation_helpers.dart';
import 'package:vacuum_traceability_mobile/features/health/backend_health_screen.dart';
import 'package:vacuum_traceability_mobile/features/status/status_screen.dart';

void main() {
  setUp(() {
    SharedPreferences.setMockInitialValues(<String, Object>{
      'settings.deviceId': 'flutter-test-device',
      'settings.apiBaseUrl': 'http://10.0.2.2:3000',
    });
  });

  Future<void> pumpHome(WidgetTester tester, {FakeApiClient? apiClient}) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          apiClientProvider.overrideWithValue(apiClient ?? FakeApiClient()),
        ],
        child: const VacuumTraceabilityApp(),
      ),
    );

    await tester.pumpAndSettle();
  }

  testWidgets('home screen renders dashboard and workflow buttons', (
    WidgetTester tester,
  ) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          apiClientProvider.overrideWithValue(
            FakeApiClient(
              statusSummary: <String, dynamic>{
                'active': 1,
                'inactive': 2,
                'repair': 1,
              },
            ),
          ),
        ],
        child: const VacuumTraceabilityApp(),
      ),
    );

    await tester.pumpAndSettle();

    expect(find.byKey(const ValueKey<String>('home-scanner')), findsOneWidget);
    expect(find.byKey(const ValueKey<String>('home-settings')), findsOneWidget);
    expect(
      find.byKey(const ValueKey<String>('home-summary-active')),
      findsOneWidget,
    );
    expect(
      find.byKey(const ValueKey<String>('home-summary-inactive')),
      findsOneWidget,
    );
    expect(
      find.byKey(const ValueKey<String>('home-summary-repair')),
      findsOneWidget,
    );
    expect(find.byKey(const ValueKey<String>('home-charge')), findsOneWidget);
    expect(find.byKey(const ValueKey<String>('home-decharge')), findsOneWidget);
    expect(
      find.byKey(const ValueKey<String>('home-fault-declaration')),
      findsOneWidget,
    );
    await tester.scrollUntilVisible(
      find.byKey(const ValueKey<String>('home-fault-restoration')),
      300,
    );
    expect(
      find.byKey(const ValueKey<String>('home-fault-restoration')),
      findsOneWidget,
    );
    expect(find.byKey(const ValueKey<String>('home-status')), findsNothing);
    await tester.scrollUntilVisible(
      find.byKey(const ValueKey<String>('home-health')),
      300,
    );
    expect(find.byKey(const ValueKey<String>('home-health')), findsOneWidget);
    expect(find.text('Android MVP foundation'), findsNothing);
    expect(
      find.text('\u039A\u03B1\u03C4\u03AC\u03C3\u03C4\u03B1\u03C3\u03B7'),
      findsNothing,
    );
  });

  testWidgets('home dashboard keeps status cards in a compact row', (
    WidgetTester tester,
  ) async {
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    await pumpHome(
      tester,
      apiClient: FakeApiClient(
        statusSummary: <String, dynamic>{
          'active': 1,
          'inactive': 2,
          'repair': 3,
        },
      ),
    );

    final activeTop = tester.getTopLeft(
      find.byKey(const ValueKey<String>('home-summary-active')),
    );
    final inactiveTop = tester.getTopLeft(
      find.byKey(const ValueKey<String>('home-summary-inactive')),
    );
    final repairTop = tester.getTopLeft(
      find.byKey(const ValueKey<String>('home-summary-repair')),
    );

    expect((activeTop.dy - inactiveTop.dy).abs(), lessThan(2));
    expect((inactiveTop.dy - repairTop.dy).abs(), lessThan(2));
    expect(activeTop.dx, lessThan(inactiveTop.dx));
    expect(inactiveTop.dx, lessThan(repairTop.dx));
    expect(tester.takeException(), isNull);
  });

  testWidgets('home dashboard opens active vacuum popup list', (
    WidgetTester tester,
  ) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          apiClientProvider.overrideWithValue(
            FakeApiClient(
              statusSummary: <String, dynamic>{
                'active': 1,
                'inactive': 0,
                'repair': 0,
              },
              activeVacuums: <dynamic>[
                <String, dynamic>{
                  'id': 'pad-active-1',
                  'code': 'VP-ACTIVE-1',
                  'serialNumber': 'SN-ACTIVE-1',
                  'description': 'Active demo vacuum',
                  'locationStatus': 'ON_MACHINE',
                  'operationalStatus': 'FUNCTIONAL',
                  'displayStatus': 'ACTIVE',
                  'machine': <String, dynamic>{
                    'code': 'MACH-001',
                    'name': 'Machine 1',
                  },
                  'chargedAt': '2026-06-04T08:00:00.000Z',
                },
              ],
            ),
          ),
        ],
        child: const VacuumTraceabilityApp(),
      ),
    );

    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey<String>('home-summary-active')));
    await tester.pumpAndSettle();

    expect(find.textContaining('Vacuum: SN-ACTIVE-1'), findsOneWidget);
    expect(find.textContaining('Machine 1'), findsOneWidget);
  });

  testWidgets('active status popup shows only active-relevant filters', (
    WidgetTester tester,
  ) async {
    await pumpHome(tester);

    await tester.tap(find.byKey(const ValueKey<String>('home-summary-active')));
    await tester.pumpAndSettle();

    expect(find.text('Vacuum'), findsOneWidget);
    expect(
      find.text('\u039C\u03B7\u03C7\u03AC\u03BD\u03B7\u03BC\u03B1'),
      findsOneWidget,
    );
    expect(
      find.text(
        '\u0395\u03CD\u03C1\u03BF\u03C2 \u03B7\u03BC/\u03BD\u03AF\u03B1\u03C2',
      ),
      findsOneWidget,
    );
    expect(find.text('\u0398\u03AD\u03C3\u03B7'), findsNothing);
    expect(
      find.text(
        '\u0395\u03AF\u03B4\u03BF\u03C2 \u03B2\u03BB\u03AC\u03B2\u03B7\u03C2',
      ),
      findsNothing,
    );
  });

  testWidgets('inactive status popup shows only rack-relevant filters', (
    WidgetTester tester,
  ) async {
    await pumpHome(tester);

    await tester.tap(
      find.byKey(const ValueKey<String>('home-summary-inactive')),
    );
    await tester.pumpAndSettle();

    expect(find.text('Vacuum'), findsOneWidget);
    expect(find.text('\u0398\u03AD\u03C3\u03B7'), findsOneWidget);
    expect(
      find.text(
        '\u0395\u03CD\u03C1\u03BF\u03C2 \u03B7\u03BC/\u03BD\u03AF\u03B1\u03C2',
      ),
      findsOneWidget,
    );
    expect(
      find.text('\u039C\u03B7\u03C7\u03AC\u03BD\u03B7\u03BC\u03B1'),
      findsNothing,
    );
    expect(
      find.text(
        '\u0395\u03AF\u03B4\u03BF\u03C2 \u03B2\u03BB\u03AC\u03B2\u03B7\u03C2',
      ),
      findsNothing,
    );
  });

  testWidgets('repair status popup shows only rack-relevant filters', (
    WidgetTester tester,
  ) async {
    await pumpHome(tester);

    await tester.tap(find.byKey(const ValueKey<String>('home-summary-repair')));
    await tester.pumpAndSettle();

    expect(find.text('Vacuum'), findsOneWidget);
    expect(find.text('\u0398\u03AD\u03C3\u03B7'), findsOneWidget);
    expect(
      find.text(
        '\u0395\u03CD\u03C1\u03BF\u03C2 \u03B7\u03BC/\u03BD\u03AF\u03B1\u03C2',
      ),
      findsOneWidget,
    );
    expect(
      find.text('\u039C\u03B7\u03C7\u03AC\u03BD\u03B7\u03BC\u03B1'),
      findsNothing,
    );
    expect(
      find.text(
        '\u0395\u03AF\u03B4\u03BF\u03C2 \u03B2\u03BB\u03AC\u03B2\u03B7\u03C2',
      ),
      findsNothing,
    );
  });

  testWidgets('home system back shows exit confirmation dialog', (
    WidgetTester tester,
  ) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [apiClientProvider.overrideWithValue(FakeApiClient())],
        child: const VacuumTraceabilityApp(),
      ),
    );

    await tester.pumpAndSettle();
    await tester.binding.handlePopRoute();
    await tester.pumpAndSettle();

    expect(find.text(exitDialogTitle), findsOneWidget);
    expect(find.text(exitDialogMessage), findsOneWidget);
    expect(find.text(exitDialogCancel), findsOneWidget);
    expect(find.text(exitDialogConfirm), findsOneWidget);

    await tester.tap(find.text(exitDialogCancel));
    await tester.pumpAndSettle();

    expect(find.text(exitDialogTitle), findsNothing);
    expect(find.byKey(const ValueKey<String>('home-charge')), findsOneWidget);
  });

  testWidgets('workflow home control returns to home route', (
    WidgetTester tester,
  ) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [apiClientProvider.overrideWithValue(FakeApiClient())],
        child: const VacuumTraceabilityApp(),
      ),
    );

    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey<String>('home-charge')));
    await tester.pumpAndSettle();

    expect(
      find.byKey(const ValueKey<String>('app-home-button')),
      findsOneWidget,
    );
    expect(
      find.byKey(const ValueKey<String>('app-back-button')),
      findsOneWidget,
    );
    expect(find.text('\u03A7\u03C1\u03AD\u03C9\u03C3\u03B7'), findsWidgets);

    await tester.tap(find.byKey(const ValueKey<String>('app-home-button')));
    await tester.pumpAndSettle();

    expect(find.byKey(const ValueKey<String>('home-charge')), findsOneWidget);
    expect(find.byKey(const ValueKey<String>('app-home-button')), findsNothing);
  });

  testWidgets('backend health screen renders API base URL and health data', (
    WidgetTester tester,
  ) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          apiClientProvider.overrideWithValue(
            FakeApiClient(
              health: <String, dynamic>{
                'status': 'ok',
                'service': 'vacuum-traceability-api',
                'timestamp': '2026-05-22T10:00:00.000Z',
              },
              databaseHealth: <String, dynamic>{
                'status': 'ok',
                'service': 'vacuum-traceability-api',
                'database': <String, dynamic>{'status': 'ok'},
                'timestamp': '2026-05-22T10:00:01.000Z',
              },
            ),
          ),
        ],
        child: const MaterialApp(home: BackendHealthScreen()),
      ),
    );

    await tester.pumpAndSettle();

    expect(find.text('Backend Health'), findsOneWidget);
    expect(find.textContaining('10.0.2.2:3000'), findsOneWidget);
    expect(find.text('GET /health'), findsOneWidget);
    expect(find.text('GET /health/database'), findsOneWidget);
    expect(find.textContaining('"status": "ok"'), findsNWidgets(2));
  });

  testWidgets('status screen renders summary and inactive vacuum rows', (
    WidgetTester tester,
  ) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          apiClientProvider.overrideWithValue(
            FakeApiClient(
              statusSummary: <String, dynamic>{
                'active': 1,
                'inactive': 2,
                'repair': 1,
              },
              inactiveVacuums: <dynamic>[
                <String, dynamic>{
                  'id': 'pad-1',
                  'code': 'VP-TEST-1',
                  'serialNumber': 'SN-TEST-1',
                  'description': 'Demo inactive vacuum',
                  'locationStatus': 'IN_RACK',
                  'operationalStatus': 'FUNCTIONAL',
                  'displayStatus': 'NOTACTIVE',
                  'rack': <String, dynamic>{
                    'code': 'RACK-A-01-07',
                    'label': 'Rack A-01 Slot 07',
                  },
                },
              ],
            ),
          ),
        ],
        child: const MaterialApp(home: StatusScreen()),
      ),
    );

    await tester.pumpAndSettle();

    expect(
      find.text('\u039A\u03B1\u03C4\u03AC\u03C3\u03C4\u03B1\u03C3\u03B7'),
      findsWidgets,
    );
    expect(find.text('1'), findsWidgets);
    expect(find.text('2'), findsWidgets);
    expect(find.text('SN-TEST-1'), findsOneWidget);
    expect(find.textContaining('Rack A-01 Slot 07'), findsOneWidget);
  });
}

class FakeApiClient extends ApiClient {
  FakeApiClient({
    this.health,
    this.databaseHealth,
    this.statusSummary,
    this.activeVacuums = const <dynamic>[],
    this.inactiveVacuums = const <dynamic>[],
    this.repairVacuums = const <dynamic>[],
    this.vacuumPads = const <dynamic>[],
    this.vacuumPadDetails = const <String, Map<String, dynamic>>{},
  }) : super(baseUrl: 'http://test.local', dio: Dio());

  final Map<String, dynamic>? health;
  final Map<String, dynamic>? databaseHealth;
  final Map<String, dynamic>? statusSummary;
  final List<dynamic> activeVacuums;
  final List<dynamic> inactiveVacuums;
  final List<dynamic> repairVacuums;
  final List<dynamic> vacuumPads;
  final Map<String, Map<String, dynamic>> vacuumPadDetails;

  @override
  Future<Map<String, dynamic>> getHealth() async {
    return health ??
        <String, dynamic>{'status': 'ok', 'service': 'vacuum-traceability-api'};
  }

  @override
  Future<Map<String, dynamic>> getDatabaseHealth() async {
    return databaseHealth ??
        <String, dynamic>{
          'status': 'ok',
          'service': 'vacuum-traceability-api',
          'database': <String, dynamic>{'status': 'ok'},
        };
  }

  @override
  Future<Map<String, dynamic>> getStatusSummary() async {
    return statusSummary ??
        <String, dynamic>{'active': 0, 'inactive': 0, 'repair': 0};
  }

  @override
  Future<List<dynamic>> getActiveVacuums() async => activeVacuums;

  @override
  Future<List<dynamic>> getInactiveVacuums() async => inactiveVacuums;

  @override
  Future<List<dynamic>> getRepairVacuums() async => repairVacuums;

  @override
  Future<Map<String, dynamic>> getVacuumPads() async {
    return <String, dynamic>{'items': vacuumPads, 'total': vacuumPads.length};
  }

  @override
  Future<Map<String, dynamic>> getVacuumPadDetail(String id) async {
    final detail = vacuumPadDetails[id];
    if (detail == null) {
      return <String, dynamic>{'ok': false, 'message': 'Not found'};
    }

    return <String, dynamic>{'ok': true, 'item': detail};
  }
}
