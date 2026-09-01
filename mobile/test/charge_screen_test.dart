import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:vacuum_traceability_mobile/core/api/api_client.dart';
import 'package:vacuum_traceability_mobile/core/api/api_client_provider.dart';
import 'package:vacuum_traceability_mobile/features/charge/charge_screen.dart';

void main() {
  testWidgets('charge screen renders title and preview controls', (
    WidgetTester tester,
  ) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [apiClientProvider.overrideWithValue(FakeChargeApiClient())],
        child: const MaterialApp(home: ChargeScreen()),
      ),
    );

    await tester.pumpAndSettle();

    expect(find.text('\u03A7\u03C1\u03AD\u03C9\u03C3\u03B7'), findsWidgets);
    expect(
      find.byKey(const ValueKey<String>('charge-scan-button')),
      findsOneWidget,
    );
    expect(
      find.byKey(const ValueKey<String>('charge-vacuum-input')),
      findsOneWidget,
    );
    expect(
      find.byKey(const ValueKey<String>('charge-manual-ok-button')),
      findsOneWidget,
    );
    expect(
      find.byKey(const ValueKey<String>('charge-preview-button')),
      findsNothing,
    );
    expect(
      find.byKey(const ValueKey<String>('charge-operator-input')),
      findsNothing,
    );
    expect(
      find.byKey(const ValueKey<String>('charge-note-input')),
      findsNothing,
    );
    expect(find.text('Preview result'), findsNothing);
    expect(
      find.byKey(const ValueKey<String>('app-back-button')),
      findsOneWidget,
    );
    expect(
      find.byKey(const ValueKey<String>('app-home-button')),
      findsOneWidget,
    );
  });

  testWidgets('charge screen starts with no confirm action available', (
    WidgetTester tester,
  ) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [apiClientProvider.overrideWithValue(FakeChargeApiClient())],
        child: const MaterialApp(home: ChargeScreen()),
      ),
    );

    await tester.pumpAndSettle();

    expect(
      find.byKey(
        const ValueKey<String>('charge-confirm-button'),
        skipOffstage: false,
      ),
      findsNothing,
    );
  });

  testWidgets('charge preview opens machine selection and confirmation modal', (
    WidgetTester tester,
  ) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          apiClientProvider.overrideWithValue(
            FakeChargeApiClient(
              chargePreviewResponse: <String, dynamic>{
                'ok': true,
                'decision': 'CAN_CHARGE',
                'message': 'Vacuum is chargeable',
                'vacuum': <String, dynamic>{
                  'id': 'pad-1',
                  'code': 'VP-001',
                  'serialNumber': 'SN-001',
                  'description': 'Test vacuum',
                  'displayStatus': 'NOTACTIVE',
                  'operationalStatus': 'FUNCTIONAL',
                },
                'requiredNextAction': 'SELECT_MACHINE',
              },
              machinesResponse: <String, dynamic>{
                'items': <dynamic>[
                  <String, dynamic>{
                    'id': 'machine-1',
                    'code': 'MACH-001',
                    'name': 'Machine 1',
                    'project': 'Project A',
                  },
                ],
                'total': 1,
              },
            ),
          ),
        ],
        child: const MaterialApp(home: ChargeScreen()),
      ),
    );

    await tester.enterText(
      find.byKey(const ValueKey<String>('charge-vacuum-input')),
      'VAC:VP-001',
    );
    await tester.tap(
      find.byKey(const ValueKey<String>('charge-manual-ok-button')),
    );
    await tester.pumpAndSettle();

    expect(
      find.text(
        '\u0395\u03C0\u03B9\u03BB\u03BF\u03B3\u03AE \u03BC\u03B7\u03C7\u03B1\u03BD\u03AE\u03BC\u03B1\u03C4\u03BF\u03C2',
      ),
      findsWidgets,
    );
    expect(
      find.byKey(const ValueKey<String>('charge-machine-card-machine-1')),
      findsOneWidget,
    );

    await tester.tap(
      find.byKey(const ValueKey<String>('charge-machine-card-machine-1')),
    );
    await tester.pumpAndSettle();

    expect(
      find.text(
        '\u0395\u03C0\u03B9\u03B2\u03B5\u03B2\u03B1\u03AF\u03C9\u03C3\u03B7 \u03A7\u03C1\u03AD\u03C9\u03C3\u03B7\u03C2',
      ),
      findsOneWidget,
    );
    expect(find.text('SN-001'), findsWidgets);

    await tester.tap(
      find.byKey(const ValueKey<String>('charge-modal-confirm-button')),
    );
    await tester.pump(const Duration(milliseconds: 500));

    expect(find.textContaining('Vacuum SN-001'), findsOneWidget);
    await tester.pump(const Duration(seconds: 5));
    await tester.pumpAndSettle();
  });

  testWidgets('occupied machine decharge action opens empty Decharge', (
    WidgetTester tester,
  ) async {
    final router = GoRouter(
      initialLocation: '/charge',
      routes: <RouteBase>[
        GoRoute(
          path: '/charge',
          builder: (context, state) => const ChargeScreen(),
        ),
        GoRoute(
          path: '/decharge',
          builder: (context, state) => Scaffold(
            body: Text(
              "decharge:${state.uri.queryParameters['vacuumQr'] ?? ''}",
            ),
          ),
        ),
      ],
    );

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          apiClientProvider.overrideWithValue(
            FakeChargeApiClient(
              chargePreviewResponse: <String, dynamic>{
                'ok': true,
                'decision': 'CAN_CHARGE',
                'message': 'Vacuum is chargeable',
                'vacuum': <String, dynamic>{
                  'id': 'pad-new',
                  'code': 'VP-NEW',
                  'serialNumber': 'SN-NEW',
                },
                'requiredNextAction': 'SELECT_MACHINE',
              },
              machinesResponse: <String, dynamic>{
                'items': <dynamic>[
                  <String, dynamic>{
                    'id': 'machine-occupied',
                    'code': 'MACH-009',
                    'name': 'Machine 9',
                    'project': 'Project A',
                    'isAvailableForCharge': false,
                    'currentPad': <String, dynamic>{
                      'id': 'pad-occupied',
                      'code': 'VP-009',
                      'serialNumber': '19081291644',
                      'description': 'Occupied vacuum',
                    },
                    'openChargeSessionId': 'charge-open',
                  },
                ],
                'total': 1,
              },
            ),
          ),
        ],
        child: MaterialApp.router(routerConfig: router),
      ),
    );

    await tester.enterText(
      find.byKey(const ValueKey<String>('charge-vacuum-input')),
      'VAC:VP-NEW',
    );
    await tester.tap(
      find.byKey(const ValueKey<String>('charge-manual-ok-button')),
    );
    await tester.pumpAndSettle();

    expect(
      find.text('\u03A3\u03B5 \u03C7\u03C1\u03AE\u03C3\u03B7'),
      findsOneWidget,
    );
    expect(find.textContaining('19081291644'), findsWidgets);

    await tester.tap(
      find.byKey(
        const ValueKey<String>('charge-machine-card-machine-occupied'),
      ),
    );
    await tester.pumpAndSettle();

    expect(
      find.text(
        '\u03A4\u03BF \u03BC\u03B7\u03C7\u03AC\u03BD\u03B7\u03BC\u03B1 \u03B5\u03AF\u03BD\u03B1\u03B9 \u03C3\u03B5 \u03C7\u03C1\u03AE\u03C3\u03B7',
      ),
      findsOneWidget,
    );
    expect(
      find.text('\u0391\u03C0\u03BF\u03C7\u03C1\u03AD\u03C9\u03C3\u03B7'),
      findsOneWidget,
    );
    expect(
      find.text(
        '\u0386\u03BB\u03BB\u03BF \u03BC\u03B7\u03C7\u03AC\u03BD\u03B7\u03BC\u03B1',
      ),
      findsOneWidget,
    );

    await tester.tap(
      find.text('\u0391\u03C0\u03BF\u03C7\u03C1\u03AD\u03C9\u03C3\u03B7').last,
    );
    await tester.pumpAndSettle();

    expect(find.text('decharge:'), findsOneWidget);
    expect(find.text('decharge:VAC:19081291644'), findsNothing);
  });

  testWidgets('invalid charge preview shows wrong QR dialog', (
    WidgetTester tester,
  ) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          apiClientProvider.overrideWithValue(
            FakeChargeApiClient(
              chargePreviewResponse: <String, dynamic>{
                'ok': false,
                'decision': 'VACUUM_NOT_FOUND',
                'message': 'No vacuum found for this QR.',
                'requiredNextAction': 'NONE',
              },
            ),
          ),
        ],
        child: const MaterialApp(home: ChargeScreen()),
      ),
    );

    await tester.enterText(
      find.byKey(const ValueKey<String>('charge-vacuum-input')),
      'NOT-A-VACUUM',
    );
    await tester.tap(
      find.byKey(const ValueKey<String>('charge-manual-ok-button')),
    );
    await tester.pumpAndSettle();

    expect(find.text('\u039B\u03AC\u03B8\u03BF\u03C2 QR'), findsOneWidget);
    expect(find.text('No vacuum found for this QR.'), findsWidgets);
    expect(find.text('\u039F\u039A'), findsOneWidget);
  });

  testWidgets('already active charge preview shows action dialog', (
    WidgetTester tester,
  ) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          apiClientProvider.overrideWithValue(
            FakeChargeApiClient(
              chargePreviewResponse: <String, dynamic>{
                'ok': false,
                'decision': 'ALREADY_ACTIVE',
                'message': 'Vacuum is already active.',
                'requiredNextAction': 'NONE',
              },
            ),
          ),
        ],
        child: const MaterialApp(home: ChargeScreen()),
      ),
    );

    await tester.enterText(
      find.byKey(const ValueKey<String>('charge-vacuum-input')),
      'VAC:VP-001',
    );
    await tester.tap(
      find.byKey(const ValueKey<String>('charge-manual-ok-button')),
    );
    await tester.pumpAndSettle();

    expect(
      find.text(
        '\u03A4\u03BF Vacuum \u03B5\u03AF\u03BD\u03B1\u03B9 \u03AE\u03B4\u03B7 \u03C7\u03C1\u03B5\u03C9\u03BC\u03AD\u03BD\u03BF',
      ),
      findsOneWidget,
    );
    expect(find.text('\u0386\u03BA\u03C5\u03C1\u03BF'), findsNothing);
    expect(
      find.byKey(const ValueKey<String>('charge-dialog-close-button')),
      findsOneWidget,
    );
    expect(
      find.text('\u0391\u03C0\u03BF\u03C7\u03C1\u03AD\u03C9\u03C3\u03B7'),
      findsOneWidget,
    );
    expect(
      find.text(
        '\u039D\u03AD\u03BF \u03C3\u03BA\u03B1\u03BD\u03AC\u03C1\u03B9\u03C3\u03BC\u03B1',
      ),
      findsOneWidget,
    );
  });

  testWidgets('already active decharge action passes vacuumQr query', (
    WidgetTester tester,
  ) async {
    final router = GoRouter(
      initialLocation: '/charge',
      routes: <RouteBase>[
        GoRoute(
          path: '/charge',
          builder: (context, state) => const ChargeScreen(),
        ),
        GoRoute(
          path: '/decharge',
          builder: (context, state) => Scaffold(
            body: Text(
              "decharge:${state.uri.queryParameters['vacuumQr'] ?? ''}",
            ),
          ),
        ),
      ],
    );

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          apiClientProvider.overrideWithValue(
            FakeChargeApiClient(
              chargePreviewResponse: <String, dynamic>{
                'ok': false,
                'decision': 'ALREADY_ACTIVE',
                'message': 'Vacuum is already active.',
                'requiredNextAction': 'NONE',
              },
            ),
          ),
        ],
        child: MaterialApp.router(routerConfig: router),
      ),
    );

    await tester.enterText(
      find.byKey(const ValueKey<String>('charge-vacuum-input')),
      'VAC:19081291644',
    );
    await tester.tap(
      find.byKey(const ValueKey<String>('charge-manual-ok-button')),
    );
    await tester.pumpAndSettle();

    await tester.tap(
      find.text('\u0391\u03C0\u03BF\u03C7\u03C1\u03AD\u03C9\u03C3\u03B7').last,
    );
    await tester.pumpAndSettle();

    expect(find.text('decharge:VAC:19081291644'), findsOneWidget);
  });

  testWidgets('in repair charge preview shows restoration action dialog', (
    WidgetTester tester,
  ) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          apiClientProvider.overrideWithValue(
            FakeChargeApiClient(
              chargePreviewResponse: <String, dynamic>{
                'ok': false,
                'decision': 'IN_REPAIR',
                'message': 'Vacuum is in repair.',
                'requiredNextAction': 'NONE',
              },
            ),
          ),
        ],
        child: const MaterialApp(home: ChargeScreen()),
      ),
    );

    await tester.enterText(
      find.byKey(const ValueKey<String>('charge-vacuum-input')),
      'VAC:VP-001',
    );
    await tester.tap(
      find.byKey(const ValueKey<String>('charge-manual-ok-button')),
    );
    await tester.pumpAndSettle();

    expect(
      find.text(
        '\u03A4\u03BF Vacuum \u03B2\u03C1\u03AF\u03C3\u03BA\u03B5\u03C4\u03B1\u03B9 \u03C3\u03B5 \u03B8\u03AD\u03C3\u03B7 \u03B5\u03C0\u03B9\u03C3\u03BA\u03B5\u03C5\u03AE\u03C2',
      ),
      findsOneWidget,
    );
    expect(find.text('\u0386\u03BA\u03C5\u03C1\u03BF'), findsNothing);
    expect(
      find.byKey(const ValueKey<String>('charge-dialog-close-button')),
      findsOneWidget,
    );
    expect(
      find.text(
        '\u0391\u03C0\u03BF\u03BA\u03B1\u03C4\u03AC\u03C3\u03C4\u03B1\u03C3\u03B7 \u03B2\u03BB\u03AC\u03B2\u03B7\u03C2',
      ),
      findsOneWidget,
    );
    expect(
      find.text(
        '\u039D\u03AD\u03BF \u03C3\u03BA\u03B1\u03BD\u03AC\u03C1\u03B9\u03C3\u03BC\u03B1',
      ),
      findsOneWidget,
    );
  });
}

class FakeChargeApiClient extends ApiClient {
  FakeChargeApiClient({
    this.chargePreviewResponse,
    this.chargeResponse,
    this.machinesResponse,
  }) : super(baseUrl: 'http://test.local', dio: Dio());

  final Map<String, dynamic>? chargePreviewResponse;
  final Map<String, dynamic>? chargeResponse;
  final Map<String, dynamic>? machinesResponse;

  @override
  Future<Map<String, dynamic>> postChargePreview(
    Map<String, dynamic> body,
  ) async {
    return chargePreviewResponse ??
        <String, dynamic>{
          'ok': false,
          'decision': 'INVALID_REQUEST',
          'message': 'Preview was not configured for this test',
          'requiredNextAction': 'NONE',
        };
  }

  @override
  Future<Map<String, dynamic>> postCharge(Map<String, dynamic> body) async {
    return chargeResponse ??
        <String, dynamic>{
          'ok': true,
          'decision': 'CHARGED',
          'message': 'Charge completed',
          'vacuum': <String, dynamic>{
            'code': 'VP-001',
            'serialNumber': 'SN-001',
          },
          'machine': <String, dynamic>{'code': 'MACH-001', 'name': 'Machine 1'},
          'chargeSession': <String, dynamic>{
            'chargedAt': '2026-05-22T12:00:00.000Z',
          },
        };
  }

  @override
  Future<Map<String, dynamic>> getMachines({
    bool activeOnly = true,
    bool availableOnly = false,
  }) async {
    return machinesResponse ??
        <String, dynamic>{'items': <dynamic>[], 'total': 0};
  }
}
