import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:image_picker/image_picker.dart';
import 'package:vacuum_traceability_mobile/core/api/api_client.dart';
import 'package:vacuum_traceability_mobile/core/api/api_client_provider.dart';
import 'package:vacuum_traceability_mobile/features/faults/fault_declaration_screen.dart';

void main() {
  testWidgets('fault declaration initial screen shows only vacuum controls', (
    WidgetTester tester,
  ) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          apiClientProvider.overrideWithValue(FakeFaultDeclarationApiClient()),
        ],
        child: MaterialApp(
          home: FaultDeclarationScreen(
            pickPhoto: (_) async => XFile(
              'C:/tmp/fault-photo-1.jpg',
              name: 'fault-photo-1.jpg',
              mimeType: 'image/jpeg',
            ),
            uploadPhoto: fakePhotoUpload,
          ),
        ),
      ),
    );

    await tester.pumpAndSettle();

    expect(find.text('Δήλωση Βλάβης'), findsWidgets);
    expect(
      find.byKey(const ValueKey<String>('fault-declaration-scan-button')),
      findsOneWidget,
    );
    expect(
      find.byKey(const ValueKey<String>('fault-declaration-vacuum-input')),
      findsOneWidget,
    );
    expect(
      find.byKey(const ValueKey<String>('fault-declaration-vacuum-ok-button')),
      findsOneWidget,
    );
    expect(
      find.byKey(
        const ValueKey<String>('fault-declaration-fault-selection-card'),
        skipOffstage: false,
      ),
      findsNothing,
    );
    expect(
      find.byKey(
        const ValueKey<String>('fault-declaration-rack-input'),
        skipOffstage: false,
      ),
      findsNothing,
    );
    expect(find.text('Operator name (optional)'), findsNothing);
    expect(find.text('Fault declaration preview'), findsNothing);
  });

  testWidgets('valid vacuum opens rack selection dialog with close button', (
    WidgetTester tester,
  ) async {
    tester.view.physicalSize = const Size(800, 1600);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          apiClientProvider.overrideWithValue(FakeFaultDeclarationApiClient()),
        ],
        child: MaterialApp(
          home: FaultDeclarationScreen(
            pickPhoto: (_) async => XFile(
              'C:/tmp/fault-photo-1.jpg',
              name: 'fault-photo-1.jpg',
              mimeType: 'image/jpeg',
            ),
            uploadPhoto: fakePhotoUpload,
          ),
        ),
      ),
    );

    await tester.enterText(
      find.byKey(const ValueKey<String>('fault-declaration-vacuum-input')),
      'VAC:VP-005',
    );
    await tester.tap(
      find.byKey(const ValueKey<String>('fault-declaration-vacuum-ok-button')),
    );
    await tester.pumpAndSettle();

    expect(find.text('Σάρωση θέσης'), findsWidgets);
    expect(
      find.byKey(const ValueKey<String>('fault-declaration-rack-input')),
      findsOneWidget,
    );
    expect(
      find.byKey(const ValueKey<String>('fault-declaration-rack-ok-button')),
      findsOneWidget,
    );
    expect(find.byTooltip('Κλείσιμο'), findsOneWidget);
  });

  testWidgets('valid REP rack opens fault catalog dialog', (
    WidgetTester tester,
  ) async {
    tester.view.physicalSize = const Size(800, 2200);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          apiClientProvider.overrideWithValue(FakeFaultDeclarationApiClient()),
        ],
        child: const MaterialApp(home: FaultDeclarationScreen()),
      ),
    );

    await tester.enterText(
      find.byKey(const ValueKey<String>('fault-declaration-vacuum-input')),
      'VAC:VP-005',
    );
    await tester.tap(
      find.byKey(const ValueKey<String>('fault-declaration-vacuum-ok-button')),
    );
    await tester.pumpAndSettle();

    await tester.enterText(
      find.byKey(const ValueKey<String>('fault-declaration-rack-input')),
      'RACK:RACK-REP-01',
    );
    await tester.tap(
      find.byKey(const ValueKey<String>('fault-declaration-rack-ok-button')),
    );
    await tester.pumpAndSettle();

    expect(find.text('Επιλογή βλάβης'), findsOneWidget);
    expect(
      find.byKey(const ValueKey<String>('fault-catalog-card-FC-001')),
      findsOneWidget,
    );
    expect(
      find.byKey(const ValueKey<String>('fault-catalog-card-other')),
      findsOneWidget,
    );
    expect(
      find.byKey(const ValueKey<String>('fault-declaration-confirm-button')),
      findsOneWidget,
    );
    expect(find.byTooltip('Κλείσιμο'), findsOneWidget);
  });

  testWidgets('fault declaration photo dialog limits uploads to 5 photos', (
    WidgetTester tester,
  ) async {
    tester.view.physicalSize = const Size(800, 2600);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    var photoIndex = 0;

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          apiClientProvider.overrideWithValue(FakeFaultDeclarationApiClient()),
        ],
        child: MaterialApp(
          home: FaultDeclarationScreen(
            pickPhoto: (_) async {
              photoIndex += 1;
              return XFile(
                'C:/tmp/fault-photo-$photoIndex.jpg',
                name: 'fault-photo-$photoIndex.jpg',
                mimeType: 'image/jpeg',
              );
            },
            uploadPhoto: fakePhotoUpload,
          ),
        ),
      ),
    );

    await tester.enterText(
      find.byKey(const ValueKey<String>('fault-declaration-vacuum-input')),
      'VAC:VP-005',
    );
    await tester.tap(
      find.byKey(const ValueKey<String>('fault-declaration-vacuum-ok-button')),
    );
    await tester.pumpAndSettle();

    await tester.enterText(
      find.byKey(const ValueKey<String>('fault-declaration-rack-input')),
      'RACK:RACK-REP-01',
    );
    await tester.tap(
      find.byKey(const ValueKey<String>('fault-declaration-rack-ok-button')),
    );
    await tester.pumpAndSettle();

    await tester.tap(
      find.byKey(const ValueKey<String>('fault-catalog-card-FC-001')),
    );
    await tester.pumpAndSettle();
    await tester.tap(
      find.byKey(const ValueKey<String>('fault-declaration-confirm-button')),
    );
    await tester.pumpAndSettle();

    for (var index = 0; index < 5; index += 1) {
      await tester.tap(
        find.byKey(const ValueKey<String>('fault-photo-camera-button')),
      );
      await tester.pumpAndSettle();
      await tester.tap(
        find.byKey(const ValueKey<String>('fault-photo-upload-button')),
      );
      await tester.pumpAndSettle();
    }

    expect(
      find.byKey(const ValueKey<String>('fault-photo-uploaded-4')),
      findsOneWidget,
    );
    expect(
      find.byKey(const ValueKey<String>('fault-photo-camera-button')),
      findsNothing,
    );
  });

  testWidgets('successful declaration shows placement success message', (
    WidgetTester tester,
  ) async {
    tester.view.physicalSize = const Size(800, 2400);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          apiClientProvider.overrideWithValue(FakeFaultDeclarationApiClient()),
        ],
        child: MaterialApp(
          home: FaultDeclarationScreen(
            pickPhoto: (_) async => XFile(
              'C:/tmp/fault-photo-1.jpg',
              name: 'fault-photo-1.jpg',
              mimeType: 'image/jpeg',
            ),
            uploadPhoto: fakePhotoUpload,
          ),
        ),
      ),
    );

    await tester.enterText(
      find.byKey(const ValueKey<String>('fault-declaration-vacuum-input')),
      'VAC:VP-005',
    );
    await tester.tap(
      find.byKey(const ValueKey<String>('fault-declaration-vacuum-ok-button')),
    );
    await tester.pumpAndSettle();

    await tester.enterText(
      find.byKey(const ValueKey<String>('fault-declaration-rack-input')),
      'RACK:RACK-REP-01',
    );
    await tester.tap(
      find.byKey(const ValueKey<String>('fault-declaration-rack-ok-button')),
    );
    await tester.pumpAndSettle();

    await tester.tap(
      find.byKey(const ValueKey<String>('fault-catalog-card-FC-001')),
    );
    await tester.pumpAndSettle();
    await tester.tap(
      find.byKey(const ValueKey<String>('fault-declaration-confirm-button')),
    );
    await tester.pumpAndSettle();

    expect(
      find.byKey(const ValueKey<String>('fault-photo-dialog')),
      findsOneWidget,
    );
    expect(
      tester
          .widget<FilledButton>(
            find.byKey(const ValueKey<String>('fault-photo-finish-button')),
          )
          .onPressed,
      isNull,
    );

    await tester.tap(
      find.byKey(const ValueKey<String>('fault-photo-camera-button')),
    );
    await tester.pumpAndSettle();

    expect(
      find.byKey(const ValueKey<String>('fault-photo-preview-card')),
      findsOneWidget,
    );
    expect(
      find.byKey(const ValueKey<String>('fault-photo-remove-button')),
      findsOneWidget,
    );

    await tester.tap(
      find.byKey(const ValueKey<String>('fault-photo-upload-button')),
    );
    await tester.pumpAndSettle();

    expect(
      find.byKey(const ValueKey<String>('fault-photo-uploaded-0')),
      findsOneWidget,
    );
    expect(
      tester
          .widget<FilledButton>(
            find.byKey(const ValueKey<String>('fault-photo-finish-button')),
          )
          .onPressed,
      isNotNull,
    );

    await tester.tap(
      find.byKey(const ValueKey<String>('fault-photo-finish-button')),
    );
    await tester.pumpAndSettle();

    expect(find.text('Η δήλωση ολοκληρώθηκε'), findsOneWidget);
    expect(
      find.textContaining('Το Vacuum SN-005 βρίσκεται στη θέση Repair Rack 01'),
      findsOneWidget,
    );
    await tester.pump(const Duration(seconds: 5));
    await tester.pumpAndSettle();
  });
}

Future<Map<String, dynamic>> fakePhotoUpload({
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

class FakeFaultDeclarationApiClient extends ApiClient {
  FakeFaultDeclarationApiClient()
    : super(baseUrl: 'http://test.local', dio: Dio());

  @override
  Future<Map<String, dynamic>> getFaultCatalog() async {
    return <String, dynamic>{
      'items': <dynamic>[
        <String, dynamic>{
          'id': 'fault-1',
          'code': 'FC-001',
          'label': 'Surface damage',
          'description': 'Visible surface damage',
          'sortOrder': 1,
        },
        <String, dynamic>{
          'id': 'fault-2',
          'code': 'FC-002',
          'label': 'Vacuum leak',
          'description': 'Vacuum leak',
          'sortOrder': 2,
        },
      ],
    };
  }

  @override
  Future<Map<String, dynamic>> postFaultDeclarationPreview(
    Map<String, dynamic> body,
  ) async {
    if (!body.containsKey('rackQr')) {
      return <String, dynamic>{
        'ok': true,
        'decision': 'SELECT_FAULT',
        'message': 'Vacuum is eligible. Select repair rack.',
        'vacuum': _vacuum(),
        'rack': null,
        'requiredNextAction': 'SELECT_FAULT',
      };
    }

    return <String, dynamic>{
      'ok': true,
      'decision': 'SELECT_FAULT',
      'message': 'Vacuum and repair rack are eligible.',
      'vacuum': _vacuum(),
      'rack': _rack(),
      'requiredNextAction': 'SELECT_FAULT',
    };
  }

  @override
  Future<Map<String, dynamic>> postFaultDeclaration(
    Map<String, dynamic> body,
  ) async {
    return <String, dynamic>{
      'ok': true,
      'decision': 'FAULT_DECLARED',
      'repair': <String, dynamic>{
        'id': 'repair-1',
        'status': 'REPORTED',
        'priority': 'NORMAL',
        'reportedAt': '2026-05-23T10:00:00.000Z',
        'problemDescription': 'Surface damage',
      },
      'vacuum': <String, dynamic>{
        ..._vacuum(),
        'locationStatus': 'IN_REPAIR',
        'operationalStatus': 'UNDER_REPAIR',
      },
      'rack': _rack(),
      'requiredNextAction': 'UPLOAD_PHOTO_OPTIONAL',
    };
  }

  Map<String, dynamic> _vacuum() {
    return <String, dynamic>{
      'id': 'pad-5',
      'code': 'VP-005',
      'serialNumber': 'SN-005',
      'description': 'Fault test vacuum',
      'displayStatus': 'NOTACTIVE',
      'locationStatus': 'IN_RACK',
      'operationalStatus': 'FUNCTIONAL',
    };
  }

  Map<String, dynamic> _rack() {
    return <String, dynamic>{
      'id': 'rack-rep-1',
      'code': 'RACK-REP-01',
      'label': 'Repair Rack 01',
      'type': 'REP',
    };
  }
}
