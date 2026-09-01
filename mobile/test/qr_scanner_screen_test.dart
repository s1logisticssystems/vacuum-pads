import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:vacuum_traceability_mobile/features/scanner/qr_scanner_screen.dart';

void main() {
  testWidgets('scanner screen renders a minimal scan frame', (
    WidgetTester tester,
  ) async {
    await tester.pumpWidget(
      const ProviderScope(
        child: MaterialApp(home: QrScannerScreen(showCameraPreview: false)),
      ),
    );

    await tester.pumpAndSettle();

    expect(find.byKey(const ValueKey<String>('scanner-frame')), findsOneWidget);
    expect(
      find.text('\u03A3\u03B5\u03B9\u03C1\u03B9\u03B1\u03BA\u03CC / QR code'),
      findsOneWidget,
    );
    expect(
      find.byKey(const ValueKey<String>('scanner-manual-ok-button')),
      findsOneWidget,
    );
    expect(find.text('1x'), findsNothing);
    expect(find.text('2x'), findsNothing);
    expect(find.text('3x'), findsNothing);
    expect(find.text('\u03A6\u03B1\u03BA\u03CC\u03C2'), findsNothing);
  });

  testWidgets('scanner return mode keeps only the capture surface', (
    WidgetTester tester,
  ) async {
    await tester.pumpWidget(
      const ProviderScope(
        child: MaterialApp(
          home: QrScannerScreen(returnRawOnly: true, showCameraPreview: false),
        ),
      ),
    );

    await tester.pumpAndSettle();

    expect(find.byKey(const ValueKey<String>('scanner-frame')), findsOneWidget);
    expect(
      find.text('\u03A3\u03B5\u03B9\u03C1\u03B9\u03B1\u03BA\u03CC / QR code'),
      findsOneWidget,
    );
    expect(
      find.byKey(const ValueKey<String>('scanner-manual-ok-button')),
      findsOneWidget,
    );
    expect(find.text('Scanner'), findsNothing);
    expect(find.text('Raw scan value'), findsNothing);
    expect(
      find.byKey(const ValueKey<String>('scanner-restart-button')),
      findsNothing,
    );
  });

  testWidgets('scanner manual empty OK shows validation', (
    WidgetTester tester,
  ) async {
    tester.view.physicalSize = const Size(800, 1200);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    await tester.pumpWidget(
      const ProviderScope(
        child: MaterialApp(home: QrScannerScreen(showCameraPreview: false)),
      ),
    );

    await tester.pumpAndSettle();
    await tester.tap(
      find.byKey(const ValueKey<String>('scanner-manual-ok-button')),
    );
    await tester.pumpAndSettle();

    expect(
      find.text(
        '\u03A3\u03C5\u03BC\u03C0\u03BB\u03B7\u03C1\u03CE\u03C3\u03C4\u03B5 \u03A3\u03B5\u03B9\u03C1\u03B9\u03B1\u03BA\u03CC / QR code.',
      ),
      findsOneWidget,
    );
  });

  testWidgets('scanner return mode manual OK pops typed value', (
    WidgetTester tester,
  ) async {
    tester.view.physicalSize = const Size(800, 1200);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    String? returnedValue;

    await tester.pumpWidget(
      ProviderScope(
        child: MaterialApp(
          home: Builder(
            builder: (context) {
              return Scaffold(
                body: FilledButton(
                  onPressed: () async {
                    returnedValue = await QrScannerScreen.scanForRaw(
                      context,
                      title: 'Scan test',
                    );
                  },
                  child: const Text('Open scanner'),
                ),
              );
            },
          ),
        ),
      ),
    );

    await tester.tap(find.text('Open scanner'));
    await tester.pumpAndSettle();
    await tester.enterText(
      find.byKey(const ValueKey<String>('scanner-manual-input')),
      'VAC:19081291644',
    );
    await tester.tap(
      find.byKey(const ValueKey<String>('scanner-manual-ok-button')),
    );
    await tester.pumpAndSettle();

    expect(returnedValue, 'VAC:19081291644');
  });
}
