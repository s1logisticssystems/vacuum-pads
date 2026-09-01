import 'dart:async';
import 'dart:convert';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import 'package:vacuum_traceability_mobile/core/api/api_client_provider.dart';
import 'package:vacuum_traceability_mobile/core/api/api_exceptions.dart';
import 'package:vacuum_traceability_mobile/core/settings/settings_provider.dart';

class QrScannerScreen extends ConsumerStatefulWidget {
  const QrScannerScreen({
    super.key,
    this.returnRawOnly = false,
    this.title = 'QR Scanner',
    this.description,
    this.showCameraPreview = true,
  });

  final bool returnRawOnly;
  final String title;
  final String? description;
  final bool showCameraPreview;

  static Future<String?> scanForRaw(
    BuildContext context, {
    String title = 'Scan QR',
    String? description,
  }) {
    return Navigator.of(context).push<String>(
      MaterialPageRoute<String>(
        builder: (BuildContext context) => QrScannerScreen(
          returnRawOnly: true,
          title: title,
          description: description,
        ),
      ),
    );
  }

  @override
  ConsumerState<QrScannerScreen> createState() => _QrScannerScreenState();
}

class _QrScannerScreenState extends ConsumerState<QrScannerScreen> {
  static const double _fixedZoomLabel = 3.0;
  static const double _fixedZoomScale = 0.58;

  late final MobileScannerController _controller;
  final TextEditingController _manualInputController = TextEditingController();
  final JsonEncoder _encoder = const JsonEncoder.withIndent('  ');

  bool _hasHandledScan = false;
  bool _isSubmitting = false;
  bool _didPrimeCamera = false;
  String? _rawValue;
  String? _errorMessage;
  Map<String, dynamic>? _backendResponse;

  @override
  void initState() {
    super.initState();
    _controller = MobileScannerController(
      autoStart: widget.showCameraPreview,
      autoZoom: false,
      initialZoom: _fixedZoomLabel,
      lensType: CameraLensType.normal,
    );
    _controller.addListener(_handleControllerChanged);
  }

  @override
  void dispose() {
    _manualInputController.dispose();
    _controller.removeListener(_handleControllerChanged);
    unawaited(_disposeController());
    super.dispose();
  }

  String get _description {
    final description = widget.description?.trim();
    if (description != null && description.isNotEmpty) {
      return description;
    }

    return 'Point the camera at a QR code. Workflow screens validate scans after the scanner closes.';
  }

  void _handleControllerChanged() {
    if (_didPrimeCamera || !_controller.value.isRunning) {
      return;
    }

    _didPrimeCamera = true;
    unawaited(_primeCamera());
  }

  Future<void> _primeCamera() async {
    if (!widget.showCameraPreview) {
      return;
    }

    try {
      await _controller.setZoomScale(_fixedZoomScale);
    } catch (_) {
      // Some devices expose only initialZoom or no zoom API. Keep scanning.
    }

    try {
      if (_controller.value.torchState != TorchState.on) {
        await _controller.toggleTorch();
      }
    } catch (_) {
      // Torch availability varies by device/camera; scanning should continue.
    }
  }

  Future<void> _disposeController() async {
    try {
      if (_controller.value.torchState == TorchState.on) {
        await _controller.toggleTorch();
      }
    } catch (_) {
      // Best-effort torch cleanup only.
    }

    try {
      await _controller.dispose();
    } catch (_) {
      // The camera may already be torn down by the platform.
    }
  }

  void _handleBarcode(BarcodeCapture capture) {
    if (_hasHandledScan) {
      return;
    }

    final values = capture.barcodes
        .map((Barcode barcode) => barcode.rawValue?.trim())
        .whereType<String>()
        .where((String value) => value.isNotEmpty);

    if (values.isEmpty) {
      return;
    }

    final rawValue = values.first;
    setState(() {
      _hasHandledScan = true;
      _rawValue = rawValue;
      _errorMessage = null;
      _backendResponse = null;
    });

    if (widget.returnRawOnly) {
      unawaited(_closeWithScan(rawValue));
      return;
    }

    unawaited(_controller.stop());
  }

  Future<void> _handleManualSubmit() async {
    final rawValue = _manualInputController.text.trim();
    if (rawValue.isEmpty) {
      setState(() {
        _errorMessage =
            '\u03A3\u03C5\u03BC\u03C0\u03BB\u03B7\u03C1\u03CE\u03C3\u03C4\u03B5 \u03A3\u03B5\u03B9\u03C1\u03B9\u03B1\u03BA\u03CC / QR code.';
      });
      return;
    }

    if (_hasHandledScan) {
      return;
    }

    setState(() {
      _hasHandledScan = true;
      _rawValue = rawValue;
      _errorMessage = null;
      _backendResponse = null;
    });

    if (widget.returnRawOnly) {
      await _closeWithScan(rawValue);
      return;
    }

    try {
      await _controller.stop();
    } catch (_) {
      // Manual entry should stay usable even if the camera cannot stop cleanly.
    }
  }

  Future<void> _closeWithScan(String rawValue) async {
    try {
      await _controller.stop();
    } catch (_) {
      // If stop is unsupported or already in progress, still return the scan.
    }

    if (!mounted) {
      return;
    }

    Navigator.of(context).pop<String>(rawValue);
  }

  Future<void> _scanAgain() async {
    setState(() {
      _hasHandledScan = false;
      _rawValue = null;
      _errorMessage = null;
      _backendResponse = null;
      _didPrimeCamera = false;
    });
    _manualInputController.clear();

    if (!widget.showCameraPreview) {
      return;
    }

    try {
      await _controller.start();
      await _primeCamera();
    } catch (_) {
      // Keep the standalone scanner screen usable even if restart fails.
    }
  }

  Future<void> _sendToBackend() async {
    final rawValue = _rawValue;
    if (rawValue == null || rawValue.isEmpty) {
      return;
    }

    setState(() {
      _isSubmitting = true;
      _errorMessage = null;
    });

    try {
      final deviceId = ref.read(deviceIdProvider);
      final response = await ref.read(apiClientProvider).postQrScan(
        <String, dynamic>{
          'raw': rawValue,
          'context': 'STATUS',
          'deviceId': deviceId,
        },
      );

      if (!mounted) {
        return;
      }

      setState(() {
        _backendResponse = response;
      });
    } on ApiException catch (error) {
      if (!mounted) {
        return;
      }

      setState(() {
        _errorMessage = _encoder.convert(error.toDisplayMap());
      });
    } finally {
      if (mounted) {
        setState(() {
          _isSubmitting = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(widget.title)),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: <Widget>[
          Card(
            clipBehavior: Clip.antiAlias,
            child: SizedBox(
              height: 480,
              child: LayoutBuilder(
                builder: (context, constraints) {
                  final scanBoxSize =
                      math.min(constraints.maxWidth, constraints.maxHeight) *
                      0.68;
                  final scanWindow = Rect.fromCenter(
                    center: Offset(
                      constraints.maxWidth / 2,
                      constraints.maxHeight / 2,
                    ),
                    width: scanBoxSize,
                    height: scanBoxSize,
                  );

                  return Stack(
                    fit: StackFit.expand,
                    children: <Widget>[
                      if (widget.showCameraPreview)
                        MobileScanner(
                          controller: _controller,
                          fit: BoxFit.cover,
                          scanWindow: scanWindow,
                          onDetect: _handleBarcode,
                        )
                      else
                        const ColoredBox(color: Color(0xFF0F172A)),
                      _ScannerGuideOverlay(scanBoxSize: scanBoxSize),
                    ],
                  );
                },
              ),
            ),
          ),
          const SizedBox(height: 12),
          _ManualQrInputRow(
            controller: _manualInputController,
            enabled: !_hasHandledScan,
            onSubmit: _handleManualSubmit,
          ),
          if (!widget.returnRawOnly) ...<Widget>[
            const SizedBox(height: 16),
            _StandaloneScannerResultCard(
              description: _description,
              rawValue: _rawValue,
              isSubmitting: _isSubmitting,
              backendResponse: _backendResponse,
              errorMessage: _errorMessage,
              encoder: _encoder,
              onScanAgain: _scanAgain,
              onSendToBackend: _sendToBackend,
            ),
          ],
        ],
      ),
    );
  }
}

class _ScannerGuideOverlay extends StatelessWidget {
  const _ScannerGuideOverlay({required this.scanBoxSize});

  final double scanBoxSize;

  @override
  Widget build(BuildContext context) {
    return IgnorePointer(
      child: DecoratedBox(
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: <Color>[
              Colors.black.withValues(alpha: 0.62),
              Colors.transparent,
              Colors.black.withValues(alpha: 0.62),
            ],
            stops: const <double>[0, 0.45, 1],
          ),
        ),
        child: Center(
          child: CustomPaint(
            key: const ValueKey<String>('scanner-frame'),
            size: Size.square(scanBoxSize),
            painter: _ScannerFramePainter(),
          ),
        ),
      ),
    );
  }
}

class _ScannerFramePainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final borderPaint = Paint()
      ..color = Colors.white.withValues(alpha: 0.9)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2;
    final cornerPaint = Paint()
      ..color = const Color(0xFF7DD3FC)
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round
      ..strokeWidth = 7;

    final frameRect = Offset.zero & size;
    canvas.drawRRect(
      RRect.fromRectAndRadius(frameRect, const Radius.circular(28)),
      borderPaint,
    );

    const cornerLength = 42.0;
    final path = Path()
      ..moveTo(0, cornerLength)
      ..lineTo(0, 0)
      ..lineTo(cornerLength, 0)
      ..moveTo(size.width - cornerLength, 0)
      ..lineTo(size.width, 0)
      ..lineTo(size.width, cornerLength)
      ..moveTo(size.width, size.height - cornerLength)
      ..lineTo(size.width, size.height)
      ..lineTo(size.width - cornerLength, size.height)
      ..moveTo(cornerLength, size.height)
      ..lineTo(0, size.height)
      ..lineTo(0, size.height - cornerLength);

    canvas.drawPath(path, cornerPaint);
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}

class _ManualQrInputRow extends StatelessWidget {
  const _ManualQrInputRow({
    required this.controller,
    required this.enabled,
    required this.onSubmit,
  });

  final TextEditingController controller;
  final bool enabled;
  final VoidCallback onSubmit;

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      top: false,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Expanded(
            child: TextField(
              key: const ValueKey<String>('scanner-manual-input'),
              controller: controller,
              enabled: enabled,
              onSubmitted: (_) {
                if (enabled) {
                  onSubmit();
                }
              },
              decoration: const InputDecoration(
                labelText:
                    '\u03A3\u03B5\u03B9\u03C1\u03B9\u03B1\u03BA\u03CC / QR code',
                border: OutlineInputBorder(),
              ),
            ),
          ),
          const SizedBox(width: 12),
          SizedBox(
            height: 56,
            child: FilledButton(
              key: const ValueKey<String>('scanner-manual-ok-button'),
              onPressed: enabled ? onSubmit : null,
              child: const Text('\u039F\u039A'),
            ),
          ),
        ],
      ),
    );
  }
}

class _StandaloneScannerResultCard extends StatelessWidget {
  const _StandaloneScannerResultCard({
    required this.description,
    required this.rawValue,
    required this.isSubmitting,
    required this.backendResponse,
    required this.errorMessage,
    required this.encoder,
    required this.onScanAgain,
    required this.onSendToBackend,
  });

  final String description;
  final String? rawValue;
  final bool isSubmitting;
  final Map<String, dynamic>? backendResponse;
  final String? errorMessage;
  final JsonEncoder encoder;
  final VoidCallback onScanAgain;
  final VoidCallback onSendToBackend;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Text('Scanner', style: theme.textTheme.titleMedium),
            const SizedBox(height: 8),
            Text(description, style: theme.textTheme.bodyMedium),
            const SizedBox(height: 16),
            Text('Raw scan value', style: theme.textTheme.labelLarge),
            const SizedBox(height: 6),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: const Color(0xFFF8FAFC),
                borderRadius: BorderRadius.circular(16),
              ),
              child: SelectableText(
                rawValue ?? 'No QR detected yet',
                style: theme.textTheme.bodyMedium,
              ),
            ),
            const SizedBox(height: 16),
            Wrap(
              spacing: 12,
              runSpacing: 12,
              children: <Widget>[
                FilledButton.tonalIcon(
                  key: const ValueKey<String>('scanner-restart-button'),
                  onPressed: onScanAgain,
                  icon: const Icon(Icons.qr_code_scanner),
                  label: const Text(
                    '\u0395\u03C0\u03B1\u03BD\u03B5\u03BA\u03BA\u03AF\u03BD\u03B7\u03C3\u03B7 '
                    '\u03C3\u03AC\u03C1\u03C9\u03C3\u03B7\u03C2',
                  ),
                ),
                FilledButton.icon(
                  onPressed: rawValue == null || isSubmitting
                      ? null
                      : onSendToBackend,
                  icon: const Icon(Icons.cloud_upload_outlined),
                  label: Text(isSubmitting ? 'Checking...' : 'Call /qr/scan'),
                ),
              ],
            ),
            if (backendResponse != null) ...<Widget>[
              const SizedBox(height: 16),
              Text('Backend response', style: theme.textTheme.titleMedium),
              const SizedBox(height: 12),
              SelectableText(encoder.convert(backendResponse)),
            ],
            if (errorMessage != null) ...<Widget>[
              const SizedBox(height: 16),
              DecoratedBox(
                decoration: BoxDecoration(
                  color: const Color(0xFFFFF1F2),
                  borderRadius: BorderRadius.circular(16),
                ),
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: SelectableText(errorMessage!),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
