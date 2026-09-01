import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:vacuum_traceability_mobile/features/faults/repair_photo_upload_panel.dart';

void main() {
  testWidgets('repair photo upload panel renders picker and upload controls', (
    WidgetTester tester,
  ) async {
    await tester.pumpWidget(
      const ProviderScope(
        child: MaterialApp(
          home: Scaffold(
            body: RepairPhotoUploadPanel(
              repairId: 'repair-1',
              operatorName: 'Operator',
            ),
          ),
        ),
      ),
    );

    await tester.pumpAndSettle();

    expect(
      find.byKey(const ValueKey<String>('repair-photo-upload-panel')),
      findsOneWidget,
    );
    expect(
      find.byKey(const ValueKey<String>('repair-photo-camera-button')),
      findsOneWidget,
    );
    expect(
      find.byKey(const ValueKey<String>('repair-photo-gallery-button')),
      findsOneWidget,
    );
    expect(
      find.byKey(const ValueKey<String>('repair-photo-caption-input')),
      findsOneWidget,
    );
    expect(
      find.byKey(const ValueKey<String>('repair-photo-upload-button')),
      findsOneWidget,
    );
  });

  testWidgets('repair photo upload button is disabled before image selection', (
    WidgetTester tester,
  ) async {
    await tester.pumpWidget(
      const ProviderScope(
        child: MaterialApp(
          home: Scaffold(body: RepairPhotoUploadPanel(repairId: 'repair-1')),
        ),
      ),
    );

    await tester.pumpAndSettle();

    final uploadButton = tester.widget<FilledButton>(
      find.byKey(const ValueKey<String>('repair-photo-upload-button')),
    );
    expect(uploadButton.onPressed, isNull);
  });
}
