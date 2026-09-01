import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:image_picker/image_picker.dart';
import 'package:vacuum_traceability_mobile/core/api/api_client.dart';
import 'package:vacuum_traceability_mobile/core/api/api_client_provider.dart';
import 'package:vacuum_traceability_mobile/features/decharge/decharge_screen.dart';

void main() {
  testWidgets('decharge screen renders title and vacuum controls', (
    WidgetTester tester,
  ) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          apiClientProvider.overrideWithValue(FakeDechargeApiClient()),
        ],
        child: const MaterialApp(home: DechargeScreen()),
      ),
    );

    await tester.pumpAndSettle();

    expect(
      find.text('\u0391\u03C0\u03BF\u03C7\u03C1\u03AD\u03C9\u03C3\u03B7'),
      findsWidgets,
    );
    expect(
      find.byKey(const ValueKey<String>('decharge-scan-vacuum-button')),
      findsOneWidget,
    );
    expect(
      find.byKey(const ValueKey<String>('decharge-vacuum-input')),
      findsOneWidget,
    );
    expect(
      find.byKey(const ValueKey<String>('decharge-vacuum-ok-button')),
      findsOneWidget,
    );
    expect(
      find.byKey(const ValueKey<String>('decharge-preview-vacuum-button')),
      findsNothing,
    );
    expect(
      find.byKey(const ValueKey<String>('decharge-operator-input')),
      findsNothing,
    );
    expect(
      find.byKey(const ValueKey<String>('decharge-note-input')),
      findsNothing,
    );
    expect(
      find.byKey(const ValueKey<String>('decharge-scan-rack-button')),
      findsNothing,
    );
    expect(
      find.byKey(const ValueKey<String>('decharge-rack-input')),
      findsNothing,
    );
    expect(find.text('Vacuum preview'), findsNothing);
  });

  testWidgets('decharge screen starts with no confirm action available', (
    WidgetTester tester,
  ) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          apiClientProvider.overrideWithValue(FakeDechargeApiClient()),
        ],
        child: const MaterialApp(home: DechargeScreen()),
      ),
    );

    await tester.pumpAndSettle();

    expect(
      find.byKey(
        const ValueKey<String>('decharge-confirm-button'),
        skipOffstage: false,
      ),
      findsNothing,
    );
  });

  testWidgets('decharge vacuum preview can show the SELECT_RACK decision', (
    WidgetTester tester,
  ) async {
    tester.view.physicalSize = const Size(800, 2200);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          apiClientProvider.overrideWithValue(
            FakeDechargeApiClient(
              firstPreviewResponse: <String, dynamic>{
                'ok': true,
                'decision': 'SELECT_RACK',
                'message':
                    'Vacuum is active. Scan a rack position to continue.',
                'vacuum': <String, dynamic>{
                  'id': 'pad-1',
                  'code': 'VP-001',
                  'serialNumber': 'SN-001',
                  'description': 'Test vacuum',
                  'displayStatus': 'ACTIVE',
                  'operationalStatus': 'FUNCTIONAL',
                },
                'chargeSession': <String, dynamic>{
                  'id': 'charge-1',
                  'chargedAt': '2026-05-23T10:00:00.000Z',
                  'machine': <String, dynamic>{'name': 'Machine 1'},
                },
                'requiredNextAction': 'SCAN_RACK',
              },
            ),
          ),
        ],
        child: const MaterialApp(home: DechargeScreen()),
      ),
    );

    await tester.enterText(
      find.byKey(const ValueKey<String>('decharge-vacuum-input')),
      'VAC:VP-001',
    );
    await tester.tap(
      find.byKey(const ValueKey<String>('decharge-vacuum-ok-button')),
    );
    await tester.pumpAndSettle();

    expect(
      find.text(
        '\u03A3\u03AC\u03C1\u03C9\u03C3\u03B7 \u03B8\u03AD\u03C3\u03B7\u03C2',
      ),
      findsWidgets,
    );

    await tester.tap(
      find.byKey(const ValueKey<String>('decharge-dialog-close-button')).first,
    );
    await tester.pumpAndSettle();

    expect(
      find.byKey(const ValueKey<String>('decharge-rack-input')),
      findsOneWidget,
    );
  });

  testWidgets('decharge initial vacuumQr preloads and shows rack section', (
    WidgetTester tester,
  ) async {
    tester.view.physicalSize = const Size(800, 2200);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          apiClientProvider.overrideWithValue(
            FakeDechargeApiClient(
              firstPreviewResponse: <String, dynamic>{
                'ok': true,
                'decision': 'SELECT_RACK',
                'message':
                    'Vacuum is active. Scan a rack position to continue.',
                'vacuum': <String, dynamic>{
                  'id': 'pad-1',
                  'code': 'VP-001',
                  'serialNumber': '19081291644',
                  'description': 'Test vacuum',
                  'displayStatus': 'ACTIVE',
                  'operationalStatus': 'FUNCTIONAL',
                },
                'chargeSession': <String, dynamic>{
                  'id': 'charge-1',
                  'chargedAt': '2026-05-23T10:00:00.000Z',
                  'machine': <String, dynamic>{'name': 'Machine 1'},
                },
                'requiredNextAction': 'SCAN_RACK',
              },
            ),
          ),
        ],
        child: const MaterialApp(
          home: DechargeScreen(initialVacuumQr: 'VAC:19081291644'),
        ),
      ),
    );

    await tester.pumpAndSettle();

    expect(
      find.textContaining(
        'Vacuum \u03B3\u03B9\u03B1 \u03B1\u03C0\u03BF\u03C7\u03C1\u03AD\u03C9\u03C3\u03B7: 19081291644',
      ),
      findsOneWidget,
    );

    await tester.tap(
      find.byKey(const ValueKey<String>('decharge-dialog-close-button')).first,
    );
    await tester.pumpAndSettle();

    expect(
      find.byKey(const ValueKey<String>('decharge-rack-input')),
      findsOneWidget,
    );
  });

  testWidgets('decharge NOT_ACTIVE preview shows centered dialog', (
    WidgetTester tester,
  ) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          apiClientProvider.overrideWithValue(
            FakeDechargeApiClient(
              firstPreviewResponse: <String, dynamic>{
                'ok': false,
                'decision': 'NOT_ACTIVE',
                'message': 'Vacuum is not active.',
                'vacuum': <String, dynamic>{
                  'code': 'VP-005',
                  'serialNumber': 'SN-005',
                },
                'requiredNextAction': 'NONE',
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
        child: const MaterialApp(home: DechargeScreen()),
      ),
    );

    await tester.enterText(
      find.byKey(const ValueKey<String>('decharge-vacuum-input')),
      'VAC:VP-005',
    );
    await tester.tap(
      find.byKey(const ValueKey<String>('decharge-vacuum-ok-button')),
    );
    await tester.pumpAndSettle();

    expect(
      find.text(
        '\u03A4\u03BF Vacuum \u03B4\u03B5\u03BD \u03B5\u03AF\u03BD\u03B1\u03B9 \u03C7\u03C1\u03B5\u03C9\u03BC\u03AD\u03BD\u03BF',
      ),
      findsOneWidget,
    );
    expect(
      find.text(
        '\u039D\u03AD\u03BF \u03C3\u03BA\u03B1\u03BD\u03AC\u03C1\u03B9\u03C3\u03BC\u03B1',
      ),
      findsOneWidget,
    );
    expect(find.text('\u03A7\u03C1\u03AD\u03C9\u03C3\u03B7'), findsOneWidget);
    expect(
      find.byKey(const ValueKey<String>('decharge-dialog-close-button')),
      findsOneWidget,
    );

    await tester.tap(
      find.byKey(const ValueKey<String>('decharge-assisted-charge-button')),
    );
    await tester.pumpAndSettle();

    expect(
      find.text(
        '\u0395\u03C0\u03B9\u03BB\u03BF\u03B3\u03AE \u03BC\u03B7\u03C7\u03B1\u03BD\u03AE\u03BC\u03B1\u03C4\u03BF\u03C2',
      ),
      findsOneWidget,
    );
    expect(
      find.byKey(const ValueKey<String>('decharge-machine-card-machine-1')),
      findsOneWidget,
    );
  });

  testWidgets('assisted charge picker shows occupied machine dialog', (
    WidgetTester tester,
  ) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          apiClientProvider.overrideWithValue(
            FakeDechargeApiClient(
              firstPreviewResponse: <String, dynamic>{
                'ok': false,
                'decision': 'NOT_ACTIVE',
                'message': 'Vacuum is not active.',
                'vacuum': <String, dynamic>{
                  'code': 'VP-005',
                  'serialNumber': 'SN-005',
                },
                'requiredNextAction': 'NONE',
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
        child: const MaterialApp(home: DechargeScreen()),
      ),
    );

    await tester.enterText(
      find.byKey(const ValueKey<String>('decharge-vacuum-input')),
      'VAC:VP-005',
    );
    await tester.tap(
      find.byKey(const ValueKey<String>('decharge-vacuum-ok-button')),
    );
    await tester.pumpAndSettle();
    await tester.tap(
      find.byKey(const ValueKey<String>('decharge-assisted-charge-button')),
    );
    await tester.pumpAndSettle();

    expect(
      find.text('\u03A3\u03B5 \u03C7\u03C1\u03AE\u03C3\u03B7'),
      findsOneWidget,
    );
    expect(
      find.byKey(
        const ValueKey<String>('decharge-machine-card-machine-occupied'),
      ),
      findsOneWidget,
    );

    await tester.tap(
      find.byKey(
        const ValueKey<String>('decharge-machine-card-machine-occupied'),
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
      findsWidgets,
    );
    expect(
      find.text(
        '\u0386\u03BB\u03BB\u03BF \u03BC\u03B7\u03C7\u03AC\u03BD\u03B7\u03BC\u03B1',
      ),
      findsOneWidget,
    );
  });

  testWidgets('decharge IN_REPAIR preview shows restoration dialog', (
    WidgetTester tester,
  ) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          apiClientProvider.overrideWithValue(
            FakeDechargeApiClient(
              firstPreviewResponse: <String, dynamic>{
                'ok': false,
                'decision': 'IN_REPAIR',
                'message': 'Vacuum is in repair.',
                'requiredNextAction': 'NONE',
              },
            ),
          ),
        ],
        child: const MaterialApp(home: DechargeScreen()),
      ),
    );

    await tester.enterText(
      find.byKey(const ValueKey<String>('decharge-vacuum-input')),
      'VAC:VP-005',
    );
    await tester.tap(
      find.byKey(const ValueKey<String>('decharge-vacuum-ok-button')),
    );
    await tester.pumpAndSettle();

    expect(
      find.text(
        '\u03A4\u03BF Vacuum \u03B2\u03C1\u03AF\u03C3\u03BA\u03B5\u03C4\u03B1\u03B9 \u03C3\u03B5 \u03B5\u03C0\u03B9\u03C3\u03BA\u03B5\u03C5\u03AE',
      ),
      findsOneWidget,
    );
    expect(
      find.text(
        '\u0391\u03C0\u03BF\u03BA\u03B1\u03C4\u03AC\u03C3\u03C4\u03B1\u03C3\u03B7',
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

  testWidgets('decharge repair-required success shows fault declaration handoff', (
    WidgetTester tester,
  ) async {
    tester.view.physicalSize = const Size(800, 2600);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          apiClientProvider.overrideWithValue(
            FakeDechargeApiClient(
              firstPreviewResponse: <String, dynamic>{
                'ok': true,
                'decision': 'SELECT_RACK',
                'message':
                    'Vacuum is active. Scan a rack position to continue.',
                'vacuum': <String, dynamic>{
                  'id': 'pad-1',
                  'code': 'VP-001',
                  'serialNumber': '19081291644',
                  'description': 'Test vacuum',
                  'displayStatus': 'ACTIVE',
                  'operationalStatus': 'FUNCTIONAL',
                },
                'chargeSession': <String, dynamic>{
                  'id': 'charge-1',
                  'chargedAt': '2026-05-23T10:00:00.000Z',
                  'machine': <String, dynamic>{'name': 'Machine 1'},
                },
                'requiredNextAction': 'SCAN_RACK',
              },
              secondPreviewResponse: <String, dynamic>{
                'ok': true,
                'decision': 'REPAIR_INTAKE_REQUIRED',
                'message':
                    'Selected repair rack requires fault declaration after decharge.',
                'vacuum': <String, dynamic>{'code': 'VP-001'},
                'rack': <String, dynamic>{
                  'label': 'Repair Rack 01',
                  'code': 'RACK-REP-01',
                  'type': 'REP',
                },
                'requiredNextAction': 'OPEN_REPAIR_DECLARATION',
              },
              dechargeResponse: <String, dynamic>{
                'ok': true,
                'decision': 'DECHARGED_REPAIR_REQUIRED',
                'message':
                    'Selected repair rack requires fault declaration after decharge.',
                'vacuum': <String, dynamic>{
                  'code': 'VP-001',
                  'serialNumber': '19081291644',
                  'locationStatus': 'IN_REPAIR',
                  'operationalStatus': 'INSPECTION_REQUIRED',
                },
                'rack': <String, dynamic>{
                  'label': 'Repair Rack 01',
                  'code': 'RACK-REP-01',
                  'type': 'REP',
                },
                'requiredNextAction': 'OPEN_REPAIR_DECLARATION',
              },
              faultCatalogResponse: <String, dynamic>{
                'items': <dynamic>[
                  <String, dynamic>{
                    'id': 'fc-1',
                    'code': 'FC-001',
                    'label': 'Surface damage',
                  },
                ],
                'total': 1,
              },
              faultDeclarationResponse: <String, dynamic>{
                'ok': true,
                'decision': 'FAULT_DECLARED',
                'repair': <String, dynamic>{'id': 'repair-1'},
              },
            ),
          ),
        ],
        child: MaterialApp(
          home: DechargeScreen(
            pickFaultPhoto: (_) async => XFile(
              'C:/tmp/decharge-fault-photo-1.jpg',
              name: 'decharge-fault-photo-1.jpg',
              mimeType: 'image/jpeg',
            ),
            uploadFaultPhoto: fakeDechargeFaultPhotoUpload,
          ),
        ),
      ),
    );

    await tester.enterText(
      find.byKey(const ValueKey<String>('decharge-vacuum-input')),
      'VAC:19081291644',
    );
    await tester.tap(
      find.byKey(const ValueKey<String>('decharge-vacuum-ok-button')),
    );
    await tester.pumpAndSettle();

    await tester.tap(
      find.byKey(const ValueKey<String>('decharge-dialog-close-button')).first,
    );
    await tester.pumpAndSettle();

    await tester.enterText(
      find.byKey(const ValueKey<String>('decharge-rack-input')),
      'RACK:RACK-REP-01',
    );
    await tester.tap(
      find.byKey(const ValueKey<String>('decharge-rack-ok-button')),
    );
    await tester.pumpAndSettle();

    expect(
      find.text(
        '\u0391\u03C0\u03BF\u03C7\u03C1\u03AD\u03C9\u03C3\u03B7 \u03C3\u03B5 \u03B8\u03AD\u03C3\u03B7 \u03B5\u03C0\u03B9\u03C3\u03BA\u03B5\u03C5\u03AE\u03C2',
      ),
      findsOneWidget,
    );

    await tester.tap(
      find.byKey(const ValueKey<String>('decharge-dialog-confirm-button')),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    expect(
      find.text(
        '\u0394\u03AE\u03BB\u03C9\u03C3\u03B7 \u0392\u03BB\u03AC\u03B2\u03B7\u03C2',
      ),
      findsOneWidget,
    );
    expect(find.textContaining('FC-001'), findsOneWidget);

    await tester.tap(
      find.byKey(const ValueKey<String>('decharge-fault-catalog-FC-001')),
    );
    await tester.pumpAndSettle();
    await tester.tap(
      find.byKey(const ValueKey<String>('decharge-fault-submit-button')),
    );
    await tester.pumpAndSettle();

    expect(
      find.byKey(const ValueKey<String>('decharge-fault-photo-dialog')),
      findsOneWidget,
    );

    await tester.tap(
      find.byKey(const ValueKey<String>('decharge-fault-photo-camera-button')),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));
    expect(
      find.byKey(const ValueKey<String>('decharge-fault-photo-preview-card')),
      findsOneWidget,
    );

    await tester.tap(
      find.byKey(const ValueKey<String>('decharge-fault-photo-upload-button')),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));
    expect(
      find.byKey(const ValueKey<String>('decharge-fault-photo-uploaded-0')),
      findsOneWidget,
    );

    await tester.tap(
      find.byKey(const ValueKey<String>('decharge-fault-photo-finish-button')),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    expect(
      find.text(
        '\u0397 \u03B2\u03BB\u03AC\u03B2\u03B7 \u03B4\u03B7\u03BB\u03CE\u03B8\u03B7\u03BA\u03B5',
      ),
      findsOneWidget,
    );
    expect(
      find.textContaining('1 \u03C6\u03C9\u03C4\u03BF\u03B3\u03C1\u03B1\u03C6'),
      findsOneWidget,
    );
    await tester.pump(const Duration(seconds: 5));
    await tester.pump();
  });
}

Future<Map<String, dynamic>> fakeDechargeFaultPhotoUpload({
  required String repairId,
  required String filePath,
  required String fileName,
  required String contentType,
  required String deviceId,
  String? operatorName,
  String? caption,
}) async {
  return <String, dynamic>{
    'ok': true,
    'decision': 'PHOTO_UPLOADED',
    'photo': <String, dynamic>{
      'id': 'photo-$fileName',
      'repairId': repairId,
      'originalFilename': fileName,
      'contentType': contentType,
      'caption': caption,
    },
    'storage': <String, dynamic>{'provider': 'filesystem'},
  };
}

class FakeDechargeApiClient extends ApiClient {
  FakeDechargeApiClient({
    this.firstPreviewResponse,
    this.secondPreviewResponse,
    this.dechargeResponse,
    this.chargeResponse,
    this.machinesResponse,
    this.faultCatalogResponse,
    this.faultDeclarationResponse,
  }) : super(baseUrl: 'http://test.local', dio: Dio());

  final Map<String, dynamic>? firstPreviewResponse;
  final Map<String, dynamic>? secondPreviewResponse;
  final Map<String, dynamic>? dechargeResponse;
  final Map<String, dynamic>? chargeResponse;
  final Map<String, dynamic>? machinesResponse;
  final Map<String, dynamic>? faultCatalogResponse;
  final Map<String, dynamic>? faultDeclarationResponse;

  @override
  Future<Map<String, dynamic>> postDechargePreview(
    Map<String, dynamic> body,
  ) async {
    if (body['rackQr'] == null) {
      return firstPreviewResponse ??
          <String, dynamic>{
            'ok': false,
            'decision': 'INVALID_REQUEST',
            'message': 'Vacuum preview was not configured for this test',
            'requiredNextAction': 'NONE',
          };
    }

    return secondPreviewResponse ??
        <String, dynamic>{
          'ok': false,
          'decision': 'INVALID_REQUEST',
          'message': 'Rack preview was not configured for this test',
          'requiredNextAction': 'NONE',
        };
  }

  @override
  Future<Map<String, dynamic>> postDecharge(Map<String, dynamic> body) async {
    return dechargeResponse ??
        <String, dynamic>{
          'ok': true,
          'decision': 'DECHARGED',
          'vacuum': <String, dynamic>{'code': 'VP-001'},
          'rack': <String, dynamic>{'label': 'RACK-A-01-07'},
        };
  }

  @override
  Future<Map<String, dynamic>> postCharge(Map<String, dynamic> body) async {
    return chargeResponse ??
        <String, dynamic>{
          'ok': true,
          'decision': 'CHARGED',
          'vacuum': <String, dynamic>{'code': 'VP-005'},
          'machine': <String, dynamic>{'code': 'MACH-001'},
        };
  }

  @override
  Future<Map<String, dynamic>> getMachines({
    bool activeOnly = true,
    bool availableOnly = false,
  }) async {
    return machinesResponse ?? <String, dynamic>{'items': <dynamic>[]};
  }

  @override
  Future<Map<String, dynamic>> getFaultCatalog() async {
    return faultCatalogResponse ?? <String, dynamic>{'items': <dynamic>[]};
  }

  @override
  Future<Map<String, dynamic>> postFaultDeclaration(
    Map<String, dynamic> body,
  ) async {
    return faultDeclarationResponse ??
        <String, dynamic>{'ok': true, 'decision': 'FAULT_DECLARED'};
  }
}
