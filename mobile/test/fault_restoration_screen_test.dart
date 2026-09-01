import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:image_picker/image_picker.dart';
import 'package:vacuum_traceability_mobile/core/api/api_client.dart';
import 'package:vacuum_traceability_mobile/core/api/api_client_provider.dart';
import 'package:vacuum_traceability_mobile/features/faults/fault_restoration_screen.dart';

void main() {
  testWidgets('fault restoration initial screen shows only vacuum controls', (
    WidgetTester tester,
  ) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          apiClientProvider.overrideWithValue(FakeFaultRestorationApiClient()),
        ],
        child: const MaterialApp(home: FaultRestorationScreen()),
      ),
    );

    await tester.pumpAndSettle();

    expect(find.text('Αποκατάσταση Βλάβης'), findsWidgets);
    expect(
      find.byKey(
        const ValueKey<String>('fault-restoration-scan-vacuum-button'),
      ),
      findsOneWidget,
    );
    expect(
      find.byKey(const ValueKey<String>('fault-restoration-vacuum-input')),
      findsOneWidget,
    );
    expect(
      find.byKey(const ValueKey<String>('fault-restoration-vacuum-ok-button')),
      findsOneWidget,
    );
    expect(
      find.byKey(
        const ValueKey<String>('fault-restoration-preview-vacuum-button'),
        skipOffstage: false,
      ),
      findsNothing,
    );
    expect(
      find.byKey(
        const ValueKey<String>('fault-restoration-rack-input'),
        skipOffstage: false,
      ),
      findsNothing,
    );
    expect(
      find.byKey(
        const ValueKey<String>('fault-restoration-confirm-button'),
        skipOffstage: false,
      ),
      findsNothing,
    );
  });

  testWidgets('valid repair vacuum opens rack dialog', (
    WidgetTester tester,
  ) async {
    tester.view.physicalSize = const Size(800, 1800);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          apiClientProvider.overrideWithValue(FakeFaultRestorationApiClient()),
        ],
        child: const MaterialApp(home: FaultRestorationScreen()),
      ),
    );

    await tester.enterText(
      find.byKey(const ValueKey<String>('fault-restoration-vacuum-input')),
      'VAC:VP-005',
    );
    await tester.tap(
      find.byKey(const ValueKey<String>('fault-restoration-vacuum-ok-button')),
    );
    await tester.pumpAndSettle();

    expect(find.text('Σάρωση νέας θέσης'), findsOneWidget);
    expect(
      find.byKey(const ValueKey<String>('fault-restoration-rack-input')),
      findsOneWidget,
    );
    expect(
      find.byKey(const ValueKey<String>('fault-restoration-rack-ok-button')),
      findsOneWidget,
    );
    expect(find.byTooltip('Κλείσιμο'), findsOneWidget);
  });

  testWidgets('valid rack opens restoration outcome dialog', (
    WidgetTester tester,
  ) async {
    tester.view.physicalSize = const Size(800, 2200);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          apiClientProvider.overrideWithValue(FakeFaultRestorationApiClient()),
        ],
        child: const MaterialApp(home: FaultRestorationScreen()),
      ),
    );

    await tester.enterText(
      find.byKey(const ValueKey<String>('fault-restoration-vacuum-input')),
      'VAC:VP-005',
    );
    await tester.tap(
      find.byKey(const ValueKey<String>('fault-restoration-vacuum-ok-button')),
    );
    await tester.pumpAndSettle();

    await tester.enterText(
      find.byKey(const ValueKey<String>('fault-restoration-rack-input')),
      'RACK:RACK-A-01-07',
    );
    await tester.tap(
      find.byKey(const ValueKey<String>('fault-restoration-rack-ok-button')),
    );
    await tester.pumpAndSettle();

    expect(find.text('Αποκατάσταση Βλάβης'), findsWidgets);
    expect(
      find.byKey(
        const ValueKey<String>('fault-restoration-outcome-RETURNED_TO_SERVICE'),
      ),
      findsOneWidget,
    );
    expect(
      find.byKey(const ValueKey<String>('fault-restoration-confirm-button')),
      findsOneWidget,
    );
  });

  testWidgets('successful restoration shows success message', (
    WidgetTester tester,
  ) async {
    tester.view.physicalSize = const Size(800, 2200);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    final uploadedStages = <String>[];

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          apiClientProvider.overrideWithValue(FakeFaultRestorationApiClient()),
        ],
        child: MaterialApp(
          home: FaultRestorationScreen(
            pickPhoto: (_) async => XFile(
              'C:/tmp/restoration-photo-1.jpg',
              name: 'restoration-photo-1.jpg',
              mimeType: 'image/jpeg',
            ),
            uploadPhoto: ({
              required String repairId,
              required String filePath,
              required String fileName,
              required String contentType,
              required String deviceId,
              String? operatorName,
              String? caption,
              required String stage,
            }) async {
              uploadedStages.add(stage);
              return <String, dynamic>{
                'ok': true,
                'photo': <String, dynamic>{
                  'id': 'completion-photo-1',
                  'repairId': repairId,
                  'stage': stage,
                },
              };
            },
          ),
        ),
      ),
    );

    await tester.enterText(
      find.byKey(const ValueKey<String>('fault-restoration-vacuum-input')),
      'VAC:VP-005',
    );
    await tester.tap(
      find.byKey(const ValueKey<String>('fault-restoration-vacuum-ok-button')),
    );
    await tester.pumpAndSettle();

    await tester.enterText(
      find.byKey(const ValueKey<String>('fault-restoration-rack-input')),
      'RACK:RACK-A-01-07',
    );
    await tester.tap(
      find.byKey(const ValueKey<String>('fault-restoration-rack-ok-button')),
    );
    await tester.pumpAndSettle();

    await tester.tap(
      find.byKey(const ValueKey<String>('fault-restoration-confirm-button')),
    );
    await tester.pump(const Duration(milliseconds: 300));

    expect(
      find.byKey(const ValueKey<String>('fault-restoration-photo-dialog')),
      findsOneWidget,
    );

    await tester.tap(
      find.byKey(const ValueKey<String>('fault-restoration-photo-camera-button')),
    );
    await tester.pump(const Duration(milliseconds: 300));
    await tester.tap(
      find.byKey(const ValueKey<String>('fault-restoration-photo-upload-button')),
    );
    await tester.pump(const Duration(milliseconds: 300));
    expect(uploadedStages, <String>['REPAIR_COMPLETION']);
    await tester.tap(
      find.byKey(const ValueKey<String>('fault-restoration-photo-finish-button')),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    expect(find.text('Η αποκατάσταση ολοκληρώθηκε'), findsOneWidget);
    expect(
      find.textContaining('Η αποκατάσταση του Vacuum SN-005 ολοκληρώθηκε'),
      findsOneWidget,
    );
    await tester.pump(const Duration(seconds: 5));
    await tester.pumpAndSettle();
  });
}

class FakeFaultRestorationApiClient extends ApiClient {
  FakeFaultRestorationApiClient()
    : super(baseUrl: 'http://test.local', dio: Dio());

  @override
  Future<Map<String, dynamic>> postFaultRestorationPreview(
    Map<String, dynamic> body,
  ) async {
    if (body['rackQr'] == null) {
      return <String, dynamic>{
        'ok': true,
        'decision': 'SELECT_RACK',
        'message': 'Vacuum is eligible. Scan an AVL rack.',
        'vacuum': _vacuum(),
        'repair': <String, dynamic>{
          'id': 'repair-1',
          'status': 'REPORTED',
          'priority': 'NORMAL',
          'reportedAt': '2026-05-23T10:00:00.000Z',
          'problemDescription': 'Surface damage',
        },
        'requiredNextAction': 'SCAN_RACK',
      };
    }

    return <String, dynamic>{
      'ok': true,
      'decision': 'CAN_RESTORE',
      'message': 'Vacuum can be restored to the selected rack',
      'vacuum': _vacuum(),
      'repair': <String, dynamic>{'id': 'repair-1'},
      'rack': _rack(),
      'requiredNextAction': 'CONFIRM_RESTORATION',
    };
  }

  @override
  Future<Map<String, dynamic>> postFaultRestoration(
    Map<String, dynamic> body,
  ) async {
    return <String, dynamic>{
      'ok': true,
      'decision': 'RESTORED',
      'repair': <String, dynamic>{
        'id': 'repair-1',
        'status': 'COMPLETED',
        'outcome': 'RETURNED_TO_SERVICE',
      },
      'vacuum': _vacuum(),
      'rack': _rack(),
    };
  }

  Map<String, dynamic> _vacuum() {
    return <String, dynamic>{
      'id': 'pad-5',
      'code': 'VP-005',
      'serialNumber': 'SN-005',
      'description': 'Repair test vacuum',
      'displayStatus': 'REPAIR',
      'locationStatus': 'IN_REPAIR',
      'operationalStatus': 'UNDER_REPAIR',
    };
  }

  Map<String, dynamic> _rack() {
    return <String, dynamic>{
      'id': 'rack-1',
      'code': 'RACK-A-01-07',
      'label': 'Rack A-01 Slot 07',
      'type': 'AVL',
    };
  }
}
