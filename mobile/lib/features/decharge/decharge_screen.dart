import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';
import 'package:vacuum_traceability_mobile/core/api/api_client_provider.dart';
import 'package:vacuum_traceability_mobile/core/api/api_exceptions.dart';
import 'package:vacuum_traceability_mobile/core/settings/settings_provider.dart';
import 'package:vacuum_traceability_mobile/core/widgets/app_screen_scaffold.dart';
import 'package:vacuum_traceability_mobile/core/widgets/responsive_dialog_actions.dart';
import 'package:vacuum_traceability_mobile/features/home/home_screen.dart';
import 'package:vacuum_traceability_mobile/features/scanner/qr_scanner_screen.dart';

typedef DechargeFaultPhotoPicker = Future<XFile?> Function(ImageSource source);

typedef DechargeFaultPhotoUploader =
    Future<Map<String, dynamic>> Function({
      required String repairId,
      required String filePath,
      required String fileName,
      required String contentType,
      required String deviceId,
      String? operatorName,
      String? caption,
    });

class DechargeScreen extends ConsumerStatefulWidget {
  const DechargeScreen({
    super.key,
    this.initialVacuumQr,
    this.pickFaultPhoto,
    this.uploadFaultPhoto,
  });

  final String? initialVacuumQr;
  final DechargeFaultPhotoPicker? pickFaultPhoto;
  final DechargeFaultPhotoUploader? uploadFaultPhoto;

  @override
  ConsumerState<DechargeScreen> createState() => _DechargeScreenState();
}

class _DechargeScreenState extends ConsumerState<DechargeScreen> {
  final TextEditingController _vacuumQrController = TextEditingController();
  final TextEditingController _rackQrController = TextEditingController();
  final ImagePicker _imagePicker = ImagePicker();

  Map<String, dynamic>? _firstPreviewResponse;
  Map<String, dynamic>? _secondPreviewResponse;
  Map<String, dynamic>? _assistedChargeResponse;
  bool _isLoading = false;
  String? _errorMessage;

  @override
  void dispose() {
    _vacuumQrController.dispose();
    _rackQrController.dispose();
    super.dispose();
  }

  @override
  void initState() {
    super.initState();
    final initialVacuumQr = widget.initialVacuumQr?.trim();
    if (initialVacuumQr == null || initialVacuumQr.isEmpty) {
      return;
    }

    _vacuumQrController.text = initialVacuumQr;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) {
        _previewVacuum();
      }
    });
  }

  String get _vacuumQrRaw => _vacuumQrController.text.trim();

  String get _rackQrRaw => _rackQrController.text.trim();

  String? get _firstDecision => _firstPreviewResponse?['decision']?.toString();

  bool get _canScanRack =>
      _firstDecision == 'SELECT_RACK' ||
      _assistedChargeResponse?['decision'] == 'CHARGED';

  Future<void> _scanVacuum() async {
    final scannedValue = await QrScannerScreen.scanForRaw(
      context,
      title: HomeScreen.dechargeLabel,
      description:
          'Scan the active Vacuum QR and return the raw value to the decharge workflow.',
    );

    if (!mounted || scannedValue == null || scannedValue.trim().isEmpty) {
      return;
    }

    _vacuumQrController.text = scannedValue.trim();
    _resetWorkflowState(clearRack: true);
    await _previewVacuum();
  }

  Future<void> _scanRack() async {
    if (!_canScanRack || _isLoading) {
      return;
    }

    final scannedValue = await QrScannerScreen.scanForRaw(
      context,
      title:
          '\u03A3\u03BA\u03B1\u03BD\u03AC\u03C1\u03B9\u03C3\u03BC\u03B1 '
          '\u0398\u03AD\u03C3\u03B7\u03C2 Rack',
      description:
          'Scan the Rack position QR that will receive the decharged vacuum.',
    );

    if (!mounted || scannedValue == null || scannedValue.trim().isEmpty) {
      return;
    }

    await _handleRackQr(scannedValue);
  }

  Future<void> _previewVacuum() async {
    if (_vacuumQrRaw.isEmpty) {
      setState(() {
        _errorMessage = 'Enter or scan a Vacuum QR before checking decharge.';
        _firstPreviewResponse = null;
        _secondPreviewResponse = null;
      });
      await _showWrongVacuumQrDialog(
        message:
            '\u0394\u03B5\u03BD \u03B2\u03C1\u03AD\u03B8\u03B7\u03BA\u03B5 Vacuum \u03B3\u03B9\u03B1 \u03B1\u03C5\u03C4\u03CC \u03C4\u03BF QR/Serial.',
      );
      return;
    }

    Map<String, dynamic>? responseForDialog;

    setState(() {
      _isLoading = true;
      _errorMessage = null;
      _firstPreviewResponse = null;
      _secondPreviewResponse = null;
      _assistedChargeResponse = null;
      _rackQrController.clear();
    });

    try {
      final deviceId = ref.read(deviceIdProvider);
      final response = await ref.read(apiClientProvider).postDechargePreview(
        <String, dynamic>{'vacuumQr': _vacuumQrRaw, 'deviceId': deviceId},
      );

      if (!mounted) {
        return;
      }

      setState(() {
        _firstPreviewResponse = response;
      });
      responseForDialog = response;
    } on ApiException catch (error) {
      if (!mounted) {
        return;
      }

      setState(() {
        if (error.payload != null) {
          _firstPreviewResponse = error.payload;
          _errorMessage = null;
        } else {
          _errorMessage = mapApiError(error);
          _firstPreviewResponse = null;
        }
      });
      responseForDialog = error.payload;
    } finally {
      if (mounted) {
        setState(() {
          _isLoading = false;
        });
      }
    }

    if (mounted && responseForDialog != null) {
      await _showVacuumPreviewDialog(responseForDialog);
    }
  }

  Future<void> _previewDecharge() async {
    if (!_canScanRack) {
      setState(() {
        _errorMessage =
            'Check the Vacuum first before previewing the rack destination.';
      });
      return;
    }

    if (_rackQrRaw.isEmpty) {
      setState(() {
        _errorMessage = 'Enter or scan a Rack QR before checking decharge.';
        _secondPreviewResponse = null;
      });
      await _showRackNotFoundDialog(
        message:
            '\u0394\u03B5\u03BD \u03B2\u03C1\u03AD\u03B8\u03B7\u03BA\u03B5 \u03B8\u03AD\u03C3\u03B7 Rack \u03B3\u03B9\u03B1 \u03B1\u03C5\u03C4\u03CC \u03C4\u03BF QR.',
      );
      return;
    }

    Map<String, dynamic>? responseForDialog;

    setState(() {
      _isLoading = true;
      _errorMessage = null;
      _secondPreviewResponse = null;
    });

    try {
      final deviceId = ref.read(deviceIdProvider);
      final response = await ref.read(apiClientProvider).postDechargePreview(
        <String, dynamic>{
          'vacuumQr': _vacuumQrRaw,
          'rackQr': _rackQrRaw,
          'deviceId': deviceId,
        },
      );

      if (!mounted) {
        return;
      }

      setState(() {
        _secondPreviewResponse = response;
      });
      responseForDialog = response;
    } on ApiException catch (error) {
      if (!mounted) {
        return;
      }

      setState(() {
        if (error.payload != null) {
          _secondPreviewResponse = error.payload;
          _errorMessage = null;
        } else {
          _errorMessage = mapApiError(error);
          _secondPreviewResponse = null;
        }
      });
      responseForDialog = error.payload;
    } finally {
      if (mounted) {
        setState(() {
          _isLoading = false;
        });
      }
    }

    if (mounted && responseForDialog != null) {
      await _showRackPreviewDialog(responseForDialog);
    }
  }

  Future<void> _handleRackQr(String rawValue) async {
    final trimmed = rawValue.trim();
    if (trimmed.isEmpty) {
      return;
    }

    _rackQrController.text = trimmed;
    setState(() {
      _secondPreviewResponse = null;
      _errorMessage = null;
    });
    await _previewDecharge();
  }

  Future<void> _showVacuumPreviewDialog(Map<String, dynamic> preview) async {
    final decision = preview['decision']?.toString() ?? 'UNKNOWN';
    final message = preview['message']?.toString();

    switch (decision) {
      case 'SELECT_RACK':
        await _showSelectRackDialog();
        return;
      case 'NOT_ACTIVE':
        await _showNotActiveDialog();
        return;
      case 'IN_REPAIR':
        await _showInRepairDialog();
        return;
      case 'VACUUM_NOT_FOUND':
      case 'INVALID_REQUEST':
        await _showWrongVacuumQrDialog(
          message:
              message ??
              '\u0394\u03B5\u03BD \u03B2\u03C1\u03AD\u03B8\u03B7\u03BA\u03B5 Vacuum \u03B3\u03B9\u03B1 \u03B1\u03C5\u03C4\u03CC \u03C4\u03BF QR/Serial.',
        );
        return;
      default:
        await _showWrongVacuumQrDialog(
          message:
              message ??
              '\u0394\u03B5\u03BD \u03B5\u03AF\u03BD\u03B1\u03B9 \u03B4\u03C5\u03BD\u03B1\u03C4\u03AE \u03B7 \u03B1\u03C0\u03BF\u03C7\u03C1\u03AD\u03C9\u03C3\u03B7 \u03B3\u03B9\u03B1 \u03B1\u03C5\u03C4\u03CC \u03C4\u03BF Vacuum.',
        );
    }
  }

  Future<void> _showRackPreviewDialog(Map<String, dynamic> preview) async {
    final decision = preview['decision']?.toString() ?? 'UNKNOWN';
    final message = preview['message']?.toString();

    switch (decision) {
      case 'CAN_DECHARGE':
      case 'REPAIR_INTAKE_REQUIRED':
        await _showDechargeConfirmationDialog(preview);
        return;
      case 'RACK_OCCUPIED':
        await _showRackOccupiedDialog(
          message:
              message ??
              '\u03A3\u03BA\u03B1\u03BD\u03AC\u03C1\u03B5\u03C4\u03B5 \u03AC\u03BB\u03BB\u03B7 \u03B8\u03AD\u03C3\u03B7.',
        );
        return;
      case 'RACK_NOT_FOUND':
      case 'INVALID_REQUEST':
        await _showRackNotFoundDialog(
          message:
              message ??
              '\u0394\u03B5\u03BD \u03B2\u03C1\u03AD\u03B8\u03B7\u03BA\u03B5 \u03B8\u03AD\u03C3\u03B7 Rack \u03B3\u03B9\u03B1 \u03B1\u03C5\u03C4\u03CC \u03C4\u03BF QR.',
        );
        return;
      default:
        await _showRackNotFoundDialog(
          message:
              message ??
              '\u0394\u03B5\u03BD \u03B5\u03AF\u03BD\u03B1\u03B9 \u03B4\u03C5\u03BD\u03B1\u03C4\u03AE \u03B7 \u03B1\u03C0\u03BF\u03C7\u03C1\u03AD\u03C9\u03C3\u03B7 \u03C3\u03B5 \u03B1\u03C5\u03C4\u03AE \u03C4\u03B7 \u03B8\u03AD\u03C3\u03B7.',
        );
    }
  }

  Future<void> _showSelectRackDialog() async {
    await showDialog<void>(
      context: context,
      builder: (BuildContext dialogContext) {
        return AlertDialog(
          title: _DialogTitleWithClose(
            title:
                '\u03A3\u03AC\u03C1\u03C9\u03C3\u03B7 \u03B8\u03AD\u03C3\u03B7\u03C2',
            onClose: () => Navigator.of(dialogContext).pop(),
          ),
          content: const Text(
            '\u03A4\u03BF Vacuum \u03B5\u03AF\u03BD\u03B1\u03B9 \u03C7\u03C1\u03B5\u03C9\u03BC\u03AD\u03BD\u03BF. '
            '\u03A3\u03BA\u03B1\u03BD\u03AC\u03C1\u03B5\u03C4\u03B5 \u03C4\u03B7 \u03B8\u03AD\u03C3\u03B7 Rack '
            '\u03CC\u03C0\u03BF\u03C5 \u03B8\u03B1 \u03C4\u03BF\u03C0\u03BF\u03B8\u03B5\u03C4\u03B7\u03B8\u03B5\u03AF.',
          ),
          actions: <Widget>[
            ResponsiveDialogActions(
              children: <Widget>[
                FilledButton.tonal(
                  style: compactDialogButtonStyle(),
                  onPressed: () {
                    Navigator.of(dialogContext).pop();
                    WidgetsBinding.instance.addPostFrameCallback((_) {
                      if (mounted) {
                        _scanRack();
                      }
                    });
                  },
                  child: const Text(
                    '\u03A3\u03AC\u03C1\u03C9\u03C3\u03B7 \u03B8\u03AD\u03C3\u03B7\u03C2',
                    textAlign: TextAlign.center,
                  ),
                ),
                FilledButton(
                  style: compactDialogButtonStyle(),
                  onPressed: () {
                    Navigator.of(dialogContext).pop();
                    _clearAndScanVacuumAgain();
                  },
                  child: const Text(
                    '\u039D\u03AD\u03BF \u03C3\u03BA\u03B1\u03BD\u03AC\u03C1\u03B9\u03C3\u03BC\u03B1',
                    textAlign: TextAlign.center,
                  ),
                ),
              ],
            ),
          ],
        );
      },
    );
  }

  Future<void> _showNotActiveDialog() async {
    final vacuum = _mapOrNull(_firstPreviewResponse?['vacuum']);
    final vacuumLabel = _displayValue(
      vacuum?['serialNumber'] ?? vacuum?['code'] ?? _vacuumQrRaw,
    );

    await showDialog<void>(
      context: context,
      builder: (BuildContext dialogContext) {
        return AlertDialog(
          title: _DialogTitleWithClose(
            title:
                '\u03A4\u03BF Vacuum \u03B4\u03B5\u03BD \u03B5\u03AF\u03BD\u03B1\u03B9 \u03C7\u03C1\u03B5\u03C9\u03BC\u03AD\u03BD\u03BF',
            onClose: () => Navigator.of(dialogContext).pop(),
          ),
          content: Text(
            '\u03A4\u03BF Vacuum $vacuumLabel \u03B4\u03B5\u03BD \u03B5\u03AF\u03BD\u03B1\u03B9 '
            '\u03C7\u03C1\u03B5\u03C9\u03BC\u03AD\u03BD\u03BF \u03C3\u03B5 \u03BA\u03AC\u03C0\u03BF\u03B9\u03BF '
            '\u03BC\u03B7\u03C7\u03AC\u03BD\u03B7\u03BC\u03B1, \u03B8\u03AD\u03BB\u03B5\u03C4\u03B5 \u03BD\u03B1 '
            '\u03C3\u03BA\u03B1\u03BD\u03B1\u03C1\u03B9\u03C3\u03C4\u03B5\u03AF \u03BD\u03AD\u03BF Vacuum \u03AE '
            '\u03BD\u03B1 \u03B3\u03AF\u03BD\u03B5\u03B9 \u03C0\u03C1\u03CE\u03C4\u03B1 \u03C7\u03C1\u03AD\u03C9\u03C3\u03B7 '
            '\u03C3\u03B5 \u03B1\u03C5\u03C4\u03CC \u03BA\u03B1\u03B9 \u03BC\u03B5\u03C4\u03AC \u03B1\u03C0\u03BF\u03C7\u03C1\u03AD\u03C9\u03C3\u03B7;',
          ),
          actions: <Widget>[
            ResponsiveDialogActions(
              children: <Widget>[
                FilledButton.tonal(
                  style: compactDialogButtonStyle(),
                  onPressed: () {
                    Navigator.of(dialogContext).pop();
                    _clearAndScanVacuumAgain();
                  },
                  child: const Text(
                    '\u039D\u03AD\u03BF \u03C3\u03BA\u03B1\u03BD\u03AC\u03C1\u03B9\u03C3\u03BC\u03B1',
                    textAlign: TextAlign.center,
                  ),
                ),
                FilledButton(
                  key: const ValueKey<String>(
                    'decharge-assisted-charge-button',
                  ),
                  style: compactDialogButtonStyle(),
                  onPressed: () {
                    Navigator.of(dialogContext).pop();
                    WidgetsBinding.instance.addPostFrameCallback((_) {
                      if (mounted) {
                        _startAssistedChargeFlow();
                      }
                    });
                  },
                  child: const Text(
                    '\u03A7\u03C1\u03AD\u03C9\u03C3\u03B7',
                    textAlign: TextAlign.center,
                  ),
                ),
              ],
            ),
          ],
        );
      },
    );
  }

  Future<void> _showWrongVacuumQrDialog({required String message}) async {
    await _showSingleActionDialog(
      title: '\u039B\u03AC\u03B8\u03BF\u03C2 QR',
      message: message,
      actionLabel: '\u039F\u039A',
      onAction: _clearCurrentVacuum,
    );
  }

  Future<void> _showInRepairDialog() async {
    await showDialog<void>(
      context: context,
      builder: (BuildContext dialogContext) {
        return AlertDialog(
          title: _DialogTitleWithClose(
            title:
                '\u03A4\u03BF Vacuum \u03B2\u03C1\u03AF\u03C3\u03BA\u03B5\u03C4\u03B1\u03B9 \u03C3\u03B5 \u03B5\u03C0\u03B9\u03C3\u03BA\u03B5\u03C5\u03AE',
            onClose: () => Navigator.of(dialogContext).pop(),
          ),
          content: const Text(
            '\u03A4\u03BF Vacuum \u03B2\u03C1\u03AF\u03C3\u03BA\u03B5\u03C4\u03B1\u03B9 \u03AE\u03B4\u03B7 \u03C3\u03B5 \u03B8\u03AD\u03C3\u03B7 \u03B5\u03C0\u03B9\u03C3\u03BA\u03B5\u03C5\u03AE\u03C2.',
          ),
          actions: <Widget>[
            ResponsiveDialogActions(
              children: <Widget>[
                FilledButton.tonal(
                  style: compactDialogButtonStyle(),
                  onPressed: () {
                    Navigator.of(dialogContext).pop();
                    GoRouter.maybeOf(context)?.go('/fault-restoration');
                  },
                  child: const Text(
                    '\u0391\u03C0\u03BF\u03BA\u03B1\u03C4\u03AC\u03C3\u03C4\u03B1\u03C3\u03B7',
                    textAlign: TextAlign.center,
                  ),
                ),
                FilledButton(
                  style: compactDialogButtonStyle(),
                  onPressed: () {
                    Navigator.of(dialogContext).pop();
                    _clearAndScanVacuumAgain();
                  },
                  child: const Text(
                    '\u039D\u03AD\u03BF \u03C3\u03BA\u03B1\u03BD\u03AC\u03C1\u03B9\u03C3\u03BC\u03B1',
                    textAlign: TextAlign.center,
                  ),
                ),
              ],
            ),
          ],
        );
      },
    );
  }

  Future<void> _showRackOccupiedDialog({required String message}) async {
    await showDialog<void>(
      context: context,
      builder: (BuildContext dialogContext) {
        return AlertDialog(
          title: _DialogTitleWithClose(
            title:
                '\u0397 \u03B8\u03AD\u03C3\u03B7 \u03B5\u03AF\u03BD\u03B1\u03B9 \u03BA\u03B1\u03C4\u03B5\u03B9\u03BB\u03B7\u03BC\u03BC\u03AD\u03BD\u03B7',
            onClose: () => Navigator.of(dialogContext).pop(),
          ),
          content: Text(message),
          actions: <Widget>[
            ResponsiveDialogActions(
              children: <Widget>[
                FilledButton.tonal(
                  style: compactDialogButtonStyle(),
                  onPressed: () {
                    Navigator.of(dialogContext).pop();
                    _clearRackAndScanAgain();
                  },
                  child: const Text(
                    '\u0391\u03AC\u03BB\u03BB\u03B7 \u03B8\u03AD\u03C3\u03B7',
                    textAlign: TextAlign.center,
                  ),
                ),
                FilledButton(
                  style: compactDialogButtonStyle(),
                  onPressed: () {
                    Navigator.of(dialogContext).pop();
                    _clearAndScanVacuumAgain();
                  },
                  child: const Text(
                    '\u039D\u03AD\u03BF Vacuum',
                    textAlign: TextAlign.center,
                  ),
                ),
              ],
            ),
          ],
        );
      },
    );
  }

  Future<void> _showRackNotFoundDialog({required String message}) async {
    await _showSingleActionDialog(
      title: '\u039B\u03AC\u03B8\u03BF\u03C2 QR \u03B8\u03AD\u03C3\u03B7\u03C2',
      message: message,
      actionLabel: '\u0391\u03AC\u03BB\u03BB\u03B7 \u03B8\u03AD\u03C3\u03B7',
      onAction: _clearRackAndScanAgain,
    );
  }

  Future<void> _startAssistedChargeFlow() async {
    final selectedMachine = await showModalBottomSheet<Map<String, dynamic>>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (BuildContext sheetContext) {
        return _MachineSelectionSheet(machinesFuture: _loadMachines());
      },
    );

    if (!mounted || selectedMachine == null) {
      return;
    }

    if (!_isMachineAvailableForCharge(selectedMachine)) {
      await _handleOccupiedMachineSelection(selectedMachine);
      return;
    }

    await _chargeAssistedMachine(selectedMachine);
  }

  Future<List<Map<String, dynamic>>> _loadMachines() async {
    final machinesPayload = await ref
        .read(apiClientProvider)
        .getMachines(availableOnly: false);
    return _mapList(machinesPayload['items']);
  }

  Future<void> _handleOccupiedMachineSelection(
    Map<String, dynamic> machine,
  ) async {
    final action = await _showOccupiedMachineDialog(machine);
    if (!mounted || action == null) {
      return;
    }

    switch (action) {
      case _OccupiedMachineAction.decharge:
        _goToEmptyDecharge();
        return;
      case _OccupiedMachineAction.chooseAnother:
        await _startAssistedChargeFlow();
    }
  }

  Future<_OccupiedMachineAction?> _showOccupiedMachineDialog(
    Map<String, dynamic> machine,
  ) {
    final theme = Theme.of(context);
    final machineLabel = _machineLabel(machine);
    final vacuumLabel = _occupiedVacuumLabel(machine);

    return showDialog<_OccupiedMachineAction>(
      context: context,
      builder: (BuildContext dialogContext) {
        return AlertDialog(
          title: _DialogTitleWithClose(
            title:
                '\u03A4\u03BF \u03BC\u03B7\u03C7\u03AC\u03BD\u03B7\u03BC\u03B1 \u03B5\u03AF\u03BD\u03B1\u03B9 \u03C3\u03B5 \u03C7\u03C1\u03AE\u03C3\u03B7',
            onClose: () => Navigator.of(dialogContext).pop(),
          ),
          content: RichText(
            text: TextSpan(
              style: theme.textTheme.bodyMedium,
              children: <InlineSpan>[
                const TextSpan(
                  text:
                      '\u03A4\u03BF \u03BC\u03B7\u03C7\u03AC\u03BD\u03B7\u03BC\u03B1 \u03C0\u03BF\u03C5 \u03B5\u03C0\u03AD\u03BB\u03B5\u03BE\u03B5\u03C2 ',
                ),
                TextSpan(
                  text: machineLabel,
                  style: const TextStyle(fontWeight: FontWeight.w700),
                ),
                const TextSpan(
                  text:
                      ' \u03C6\u03B1\u03AF\u03BD\u03B5\u03C4\u03B1\u03B9 \u03BD\u03B1 \u03B5\u03AF\u03BD\u03B1\u03B9 \u03C3\u03B5 \u03BB\u03B5\u03B9\u03C4\u03BF\u03C5\u03C1\u03B3\u03AF\u03B1 \u03BC\u03B5 \u03C4\u03BF Vacuum ',
                ),
                TextSpan(
                  text: vacuumLabel,
                  style: TextStyle(
                    color: theme.colorScheme.primary,
                    fontSize: 17,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const TextSpan(
                  text:
                      '.\n\n\u0392\u03C1\u03B5\u03AF\u03C4\u03B5 \u03C0\u03C1\u03CE\u03C4\u03B1 \u03C4\u03BF \u03C3\u03C5\u03B3\u03BA\u03B5\u03BA\u03C1\u03B9\u03BC\u03AD\u03BD\u03BF Vacuum \u03C3\u03C4\u03B7 \u03B8\u03AD\u03C3\u03B7 \u03C4\u03BF\u03C5 \u03BA\u03B1\u03B9 \u03C3\u03BA\u03B1\u03BD\u03AC\u03C1\u03B5\u03C4\u03AD \u03C4\u03BF \u03C3\u03C4\u03B7\u03BD \u03BF\u03B8\u03CC\u03BD\u03B7 \u0391\u03C0\u03BF\u03C7\u03C1\u03AD\u03C9\u03C3\u03B7\u03C2. \u0391\u03BD \u03B4\u03B5\u03BD \u03B2\u03C1\u03AF\u03C3\u03BA\u03B5\u03C4\u03B1\u03B9 \u03B5\u03BA\u03B5\u03AF, \u03B5\u03C0\u03B9\u03BA\u03BF\u03B9\u03BD\u03C9\u03BD\u03AE\u03C3\u03C4\u03B5 \u03BC\u03B5 \u03C4\u03B1 \u03BA\u03B5\u03BD\u03C4\u03C1\u03B9\u03BA\u03AC.',
                ),
              ],
            ),
          ),
          actions: <Widget>[
            ResponsiveDialogActions(
              children: <Widget>[
                FilledButton.tonal(
                  style: compactDialogButtonStyle(),
                  onPressed: () => Navigator.of(
                    dialogContext,
                  ).pop(_OccupiedMachineAction.decharge),
                  child: const Text(
                    '\u0391\u03C0\u03BF\u03C7\u03C1\u03AD\u03C9\u03C3\u03B7',
                    textAlign: TextAlign.center,
                  ),
                ),
                FilledButton(
                  style: compactDialogButtonStyle(),
                  onPressed: () => Navigator.of(
                    dialogContext,
                  ).pop(_OccupiedMachineAction.chooseAnother),
                  child: const Text(
                    '\u0386\u03BB\u03BB\u03BF \u03BC\u03B7\u03C7\u03AC\u03BD\u03B7\u03BC\u03B1',
                    textAlign: TextAlign.center,
                  ),
                ),
              ],
            ),
          ],
        );
      },
    );
  }

  void _goToEmptyDecharge() {
    GoRouter.maybeOf(context)?.go('/decharge');
  }

  Future<void> _chargeAssistedMachine(Map<String, dynamic> machine) async {
    final machineId = machine['id']?.toString();
    if (machineId == null || machineId.isEmpty) {
      await _showSingleActionDialog(
        title:
            '\u0394\u03B5\u03BD \u03AD\u03B3\u03B9\u03BD\u03B5 \u03C7\u03C1\u03AD\u03C9\u03C3\u03B7',
        message:
            '\u03A4\u03BF \u03BC\u03B7\u03C7\u03AC\u03BD\u03B7\u03BC\u03B1 \u03B4\u03B5\u03BD \u03AD\u03C7\u03B5\u03B9 \u03AD\u03B3\u03BA\u03C5\u03C1\u03BF id.',
        actionLabel: '\u039F\u039A',
        onAction: () {},
      );
      return;
    }

    setState(() {
      _isLoading = true;
      _errorMessage = null;
      _secondPreviewResponse = null;
      _rackQrController.clear();
    });

    try {
      final deviceId = ref.read(deviceIdProvider);
      final response = await ref.read(apiClientProvider).postCharge(
        <String, dynamic>{
          'vacuumQr': _vacuumQrRaw,
          'machineId': machineId,
          'deviceId': deviceId,
        },
      );

      if (!mounted) {
        return;
      }

      if (response['ok'] == true && response['decision'] == 'CHARGED') {
        setState(() {
          _isLoading = false;
          _assistedChargeResponse = response;
          _firstPreviewResponse = <String, dynamic>{
            'ok': true,
            'decision': 'SELECT_RACK',
            'message':
                '\u0397 \u03C7\u03C1\u03AD\u03C9\u03C3\u03B7 \u03AD\u03B3\u03B9\u03BD\u03B5. \u03A3\u03BA\u03B1\u03BD\u03AC\u03C1\u03B5\u03C4\u03B5 \u03B8\u03AD\u03C3\u03B7 Rack \u03B3\u03B9\u03B1 \u03B1\u03C0\u03BF\u03C7\u03C1\u03AD\u03C9\u03C3\u03B7.',
            'vacuum': response['vacuum'] ?? _firstPreviewResponse?['vacuum'],
            'machine': response['machine'] ?? machine,
            'requiredNextAction': 'SCAN_RACK',
          };
        });
        await _showSelectRackDialog();
        return;
      }

      await _showSingleActionDialog(
        title:
            '\u0394\u03B5\u03BD \u03AD\u03B3\u03B9\u03BD\u03B5 \u03C7\u03C1\u03AD\u03C9\u03C3\u03B7',
        message:
            response['message']?.toString() ??
            '\u0397 \u03C7\u03C1\u03AD\u03C9\u03C3\u03B7 \u03B4\u03B5\u03BD \u03BF\u03BB\u03BF\u03BA\u03BB\u03B7\u03C1\u03CE\u03B8\u03B7\u03BA\u03B5.',
        actionLabel: '\u039F\u039A',
        onAction: () {},
      );
    } on ApiException catch (error) {
      if (!mounted) {
        return;
      }

      await _showSingleActionDialog(
        title:
            '\u0394\u03B5\u03BD \u03AD\u03B3\u03B9\u03BD\u03B5 \u03C7\u03C1\u03AD\u03C9\u03C3\u03B7',
        message: mapApiError(error),
        actionLabel: '\u039F\u039A',
        onAction: () {},
      );
    } finally {
      if (mounted) {
        setState(() {
          _isLoading = false;
        });
      }
    }
  }

  Future<void> _showSingleActionDialog({
    required String title,
    required String message,
    required String actionLabel,
    required VoidCallback onAction,
  }) async {
    await showDialog<void>(
      context: context,
      builder: (BuildContext dialogContext) {
        return AlertDialog(
          title: _DialogTitleWithClose(
            title: title,
            onClose: () => Navigator.of(dialogContext).pop(),
          ),
          content: Text(message),
          actions: <Widget>[
            ResponsiveDialogActions(
              children: <Widget>[
                FilledButton(
                  style: compactDialogButtonStyle(),
                  onPressed: () {
                    Navigator.of(dialogContext).pop();
                    onAction();
                  },
                  child: Text(actionLabel, textAlign: TextAlign.center),
                ),
              ],
            ),
          ],
        );
      },
    );
  }

  Future<void> _showDechargeConfirmationDialog(
    Map<String, dynamic> preview,
  ) async {
    var isSubmitting = false;
    String? errorMessage;
    Map<String, dynamic>? errorPayload;
    final decision = preview['decision']?.toString();
    final isRepairRack = decision == 'REPAIR_INTAKE_REQUIRED';

    await showDialog<void>(
      context: context,
      barrierDismissible: !isSubmitting,
      builder: (BuildContext dialogContext) {
        return StatefulBuilder(
          builder: (BuildContext context, StateSetter dialogSetState) {
            Future<void> confirm() async {
              if (isSubmitting) {
                return;
              }

              dialogSetState(() {
                isSubmitting = true;
                errorMessage = null;
                errorPayload = null;
              });

              try {
                final response = await _submitDechargeRequest();
                if (!mounted || !dialogContext.mounted) {
                  return;
                }

                if (response['ok'] == true &&
                    (response['decision'] == 'DECHARGED' ||
                        response['decision'] == 'DECHARGED_REPAIR_REQUIRED')) {
                  setState(() {
                    _errorMessage = null;
                  });
                  Navigator.of(dialogContext).pop();
                  if (response['decision'] == 'DECHARGED_REPAIR_REQUIRED') {
                    await _showFaultDeclarationDialog(response);
                  } else {
                    await _showDechargeSuccessAndNavigate(response);
                  }
                  return;
                }

                dialogSetState(() {
                  errorPayload = response;
                  errorMessage =
                      response['message']?.toString() ??
                      '\u0397 \u03B1\u03C0\u03BF\u03C7\u03C1\u03AD\u03C9\u03C3\u03B7 \u03B4\u03B5\u03BD \u03BF\u03BB\u03BF\u03BA\u03BB\u03B7\u03C1\u03CE\u03B8\u03B7\u03BA\u03B5.';
                });
              } on ApiException catch (error) {
                if (!dialogContext.mounted) {
                  return;
                }

                dialogSetState(() {
                  errorPayload = error.payload;
                  errorMessage = mapApiError(error);
                });
              } finally {
                if (dialogContext.mounted) {
                  dialogSetState(() {
                    isSubmitting = false;
                  });
                }
              }
            }

            return AlertDialog(
              title: _DialogTitleWithClose(
                title: isRepairRack
                    ? '\u0391\u03C0\u03BF\u03C7\u03C1\u03AD\u03C9\u03C3\u03B7 \u03C3\u03B5 \u03B8\u03AD\u03C3\u03B7 \u03B5\u03C0\u03B9\u03C3\u03BA\u03B5\u03C5\u03AE\u03C2'
                    : '\u0395\u03C0\u03B9\u03B2\u03B5\u03B2\u03B1\u03AF\u03C9\u03C3\u03B7 \u0391\u03C0\u03BF\u03C7\u03C1\u03AD\u03C9\u03C3\u03B7\u03C2',
                onClose: isSubmitting
                    ? () {}
                    : () => Navigator.of(dialogContext).pop(),
              ),
              content: SingleChildScrollView(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    if (isRepairRack) ...<Widget>[
                      const Text(
                        '\u0397 \u03B8\u03AD\u03C3\u03B7 \u03B5\u03AF\u03BD\u03B1\u03B9 \u03B8\u03AD\u03C3\u03B7 \u03B5\u03C0\u03B9\u03C3\u03BA\u03B5\u03C5\u03AE\u03C2. '
                        '\u039C\u03B5\u03C4\u03AC \u03C4\u03B7\u03BD \u03B1\u03C0\u03BF\u03C7\u03C1\u03AD\u03C9\u03C3\u03B7 \u03B8\u03B1 \u03B1\u03C0\u03B1\u03B9\u03C4\u03B5\u03AF\u03C4\u03B1\u03B9 \u0394\u03AE\u03BB\u03C9\u03C3\u03B7 \u0392\u03BB\u03AC\u03B2\u03B7\u03C2.',
                      ),
                      const SizedBox(height: 16),
                    ],
                    _SummaryBlock(
                      title: 'Vacuum',
                      values: <String>[
                        _displayValue(
                          _mapOrNull(preview['vacuum'])?['serialNumber'],
                        ),
                        _displayValue(
                          _mapOrNull(preview['vacuum'])?['description'],
                        ),
                        _displayValue(_mapOrNull(preview['vacuum'])?['code']),
                      ],
                    ),
                    const SizedBox(height: 12),
                    _SummaryBlock(
                      title: 'Rack',
                      values: <String>[
                        _displayValue(_mapOrNull(preview['rack'])?['label']),
                        _displayValue(_mapOrNull(preview['rack'])?['code']),
                        _displayValue(_mapOrNull(preview['rack'])?['type']),
                      ],
                    ),
                    if (errorMessage != null) ...<Widget>[
                      const SizedBox(height: 16),
                      _NoticeCard(
                        color: const Color(0xFFFFF1F2),
                        title: _displayValue(errorPayload?['decision']) == '-'
                            ? '\u0391\u03C0\u03BF\u03C4\u03C5\u03C7\u03AF\u03B1 \u03B1\u03C0\u03BF\u03C7\u03C1\u03AD\u03C9\u03C3\u03B7\u03C2'
                            : _displayValue(errorPayload?['decision']),
                        message: errorMessage!,
                      ),
                    ],
                  ],
                ),
              ),
              actions: <Widget>[
                ResponsiveDialogActions(
                  children: <Widget>[
                    OutlinedButton(
                      style: compactDialogButtonStyle(),
                      onPressed: isSubmitting
                          ? null
                          : () => Navigator.of(dialogContext).pop(),
                      child: const Text(
                        '\u0391\u03BA\u03CD\u03C1\u03C9\u03C3\u03B7',
                        textAlign: TextAlign.center,
                      ),
                    ),
                    FilledButton(
                      key: const ValueKey<String>(
                        'decharge-dialog-confirm-button',
                      ),
                      style: compactDialogButtonStyle(),
                      onPressed: isSubmitting ? null : confirm,
                      child: Text(
                        isSubmitting
                            ? '...'
                            : '\u0391\u03A0\u039F\u03A7\u03A1\u0395\u03A9\u03A3\u0397',
                        textAlign: TextAlign.center,
                      ),
                    ),
                  ],
                ),
              ],
            );
          },
        );
      },
    );
  }

  Future<void> _showFaultDeclarationDialog(
    Map<String, dynamic> dechargeResponse,
  ) async {
    final catalogFuture = _loadFaultCatalog();
    final otherController = TextEditingController();
    var selectedFaultCatalogId = '';
    var useOtherFault = false;
    var isSubmitting = false;
    String? errorMessage;

    await showDialog<void>(
      context: context,
      barrierDismissible: false,
      builder: (BuildContext dialogContext) {
        return StatefulBuilder(
          builder: (BuildContext context, StateSetter dialogSetState) {
            Future<void> submitFaultDeclaration() async {
              if (isSubmitting) {
                return;
              }

              final otherText = otherController.text.trim();
              if (useOtherFault && otherText.isEmpty) {
                dialogSetState(() {
                  errorMessage =
                      '\u03A3\u03C5\u03BC\u03C0\u03BB\u03B7\u03C1\u03CE\u03C3\u03C4\u03B5 \u03C0\u03B5\u03C1\u03B9\u03B3\u03C1\u03B1\u03C6\u03AE \u03B2\u03BB\u03AC\u03B2\u03B7\u03C2.';
                });
                return;
              }

              if (!useOtherFault && selectedFaultCatalogId.isEmpty) {
                dialogSetState(() {
                  errorMessage =
                      '\u0395\u03C0\u03B9\u03BB\u03AD\u03BE\u03C4\u03B5 \u03B5\u03AF\u03B4\u03BF\u03C2 \u03B2\u03BB\u03AC\u03B2\u03B7\u03C2.';
                });
                return;
              }

              dialogSetState(() {
                isSubmitting = true;
                errorMessage = null;
              });

              try {
                final deviceId = ref.read(deviceIdProvider);
                final response = await ref
                    .read(apiClientProvider)
                    .postFaultDeclaration(<String, dynamic>{
                      'vacuumQr': _vacuumQrRaw,
                      if (useOtherFault)
                        'faultOtherText': otherText
                      else
                        'faultCatalogId': selectedFaultCatalogId,
                      'priority': 'NORMAL',
                      'deviceId': deviceId,
                    });

                if (!mounted || !dialogContext.mounted) {
                  return;
                }

                if (response['ok'] == true &&
                    response['decision'] == 'FAULT_DECLARED') {
                  final repairId = _repairIdFrom(response);
                  if (repairId == null || repairId.isEmpty) {
                    dialogSetState(() {
                      errorMessage =
                          '\u0394\u03B5\u03BD \u03B2\u03C1\u03AD\u03B8\u03B7\u03BA\u03B5 Repair ID \u03B3\u03B9\u03B1 \u03C4\u03B7\u03BD \u03BA\u03B1\u03C4\u03B1\u03C7\u03CE\u03C1\u03B7\u03C3\u03B7 \u03C6\u03C9\u03C4\u03BF\u03B3\u03C1\u03B1\u03C6\u03B9\u03CE\u03BD.';
                    });
                    return;
                  }

                  Navigator.of(dialogContext).pop();
                  final photoCount = await _showRequiredPhotoUploadDialog(
                    repairId: repairId,
                  );
                  if (!mounted || photoCount == null) {
                    return;
                  }

                  await _showFaultDeclarationSuccessAndReturnHome(photoCount);
                  return;
                }

                dialogSetState(() {
                  errorMessage =
                      response['message']?.toString() ??
                      '\u0397 \u03B4\u03AE\u03BB\u03C9\u03C3\u03B7 \u03B2\u03BB\u03AC\u03B2\u03B7\u03C2 \u03B4\u03B5\u03BD \u03BF\u03BB\u03BF\u03BA\u03BB\u03B7\u03C1\u03CE\u03B8\u03B7\u03BA\u03B5.';
                });
              } on ApiException catch (error) {
                if (!dialogContext.mounted) {
                  return;
                }

                dialogSetState(() {
                  errorMessage = mapApiError(error);
                });
              } finally {
                if (dialogContext.mounted) {
                  dialogSetState(() {
                    isSubmitting = false;
                  });
                }
              }
            }

            return AlertDialog(
              title: const Text(
                '\u0394\u03AE\u03BB\u03C9\u03C3\u03B7 \u0392\u03BB\u03AC\u03B2\u03B7\u03C2',
              ),
              content: SizedBox(
                width: double.maxFinite,
                child: FutureBuilder<List<Map<String, dynamic>>>(
                  future: catalogFuture,
                  builder: (context, snapshot) {
                    if (snapshot.connectionState != ConnectionState.done) {
                      return const SizedBox(
                        height: 160,
                        child: Center(child: CircularProgressIndicator()),
                      );
                    }

                    if (snapshot.hasError) {
                      return _NoticeCard(
                        color: const Color(0xFFFFF1F2),
                        title:
                            '\u0394\u03B5\u03BD \u03C6\u03BF\u03C1\u03C4\u03CE\u03B8\u03B7\u03BA\u03B5 \u03BF \u03BA\u03B1\u03C4\u03AC\u03BB\u03BF\u03B3\u03BF\u03C2',
                        message: snapshot.error.toString(),
                      );
                    }

                    final catalogItems =
                        snapshot.data ?? <Map<String, dynamic>>[];
                    final vacuum = _mapOrNull(dechargeResponse['vacuum']);

                    return SingleChildScrollView(
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: <Widget>[
                          const Text(
                            '\u0397 \u03B1\u03C0\u03BF\u03C7\u03C1\u03AD\u03C9\u03C3\u03B7 \u03AD\u03B3\u03B9\u03BD\u03B5 \u03C3\u03B5 \u03B8\u03AD\u03C3\u03B7 \u03B5\u03C0\u03B9\u03C3\u03BA\u03B5\u03C5\u03AE\u03C2. \u0395\u03C0\u03B9\u03BB\u03AD\u03BE\u03C4\u03B5 \u03B5\u03AF\u03B4\u03BF\u03C2 \u03B2\u03BB\u03AC\u03B2\u03B7\u03C2.',
                          ),
                          const SizedBox(height: 12),
                          _SummaryBlock(
                            title: 'Vacuum',
                            values: <String>[
                              _displayValue(
                                vacuum?['serialNumber'] ??
                                    vacuum?['code'] ??
                                    _vacuumQrRaw,
                              ),
                            ],
                          ),
                          const SizedBox(height: 12),
                          ...catalogItems.map((Map<String, dynamic> item) {
                            final id = item['id']?.toString() ?? '';
                            final code = _displayValue(item['code']);
                            final label = _displayValue(item['label']);
                            final isSelected =
                                !useOtherFault && selectedFaultCatalogId == id;
                            return ListTile(
                              key: ValueKey<String>(
                                'decharge-fault-catalog-$code',
                              ),
                              enabled: !isSubmitting,
                              selected: isSelected,
                              leading: Icon(
                                isSelected
                                    ? Icons.check_circle
                                    : Icons.radio_button_unchecked,
                              ),
                              title: Text('$code - $label'),
                              onTap: isSubmitting
                                  ? null
                                  : () {
                                      dialogSetState(() {
                                        useOtherFault = false;
                                        selectedFaultCatalogId = id;
                                        errorMessage = null;
                                      });
                                    },
                            );
                          }),
                          ListTile(
                            key: const ValueKey<String>(
                              'decharge-fault-other-option',
                            ),
                            enabled: !isSubmitting,
                            selected: useOtherFault,
                            leading: Icon(
                              useOtherFault
                                  ? Icons.check_circle
                                  : Icons.radio_button_unchecked,
                            ),
                            title: const Text('\u0386\u03BB\u03BB\u03BF'),
                            onTap: isSubmitting
                                ? null
                                : () {
                                    dialogSetState(() {
                                      useOtherFault = true;
                                      selectedFaultCatalogId = '';
                                      errorMessage = null;
                                    });
                                  },
                          ),
                          if (useOtherFault) ...<Widget>[
                            const SizedBox(height: 8),
                            TextField(
                              key: const ValueKey<String>(
                                'decharge-fault-other-input',
                              ),
                              controller: otherController,
                              enabled: !isSubmitting,
                              minLines: 2,
                              maxLines: 3,
                              decoration: const InputDecoration(
                                labelText:
                                    '\u03A0\u03B5\u03C1\u03B9\u03B3\u03C1\u03B1\u03C6\u03AE \u03B2\u03BB\u03AC\u03B2\u03B7\u03C2',
                                border: OutlineInputBorder(),
                              ),
                            ),
                          ],
                          if (errorMessage != null) ...<Widget>[
                            const SizedBox(height: 12),
                            _NoticeCard(
                              color: const Color(0xFFFFF1F2),
                              title:
                                  '\u0394\u03B5\u03BD \u03BF\u03BB\u03BF\u03BA\u03BB\u03B7\u03C1\u03CE\u03B8\u03B7\u03BA\u03B5',
                              message: errorMessage!,
                            ),
                          ],
                        ],
                      ),
                    );
                  },
                ),
              ),
              actions: <Widget>[
                ResponsiveDialogActions(
                  children: <Widget>[
                    FilledButton(
                      key: const ValueKey<String>(
                        'decharge-fault-submit-button',
                      ),
                      style: compactDialogButtonStyle(),
                      onPressed: isSubmitting ? null : submitFaultDeclaration,
                      child: Text(
                        isSubmitting ? '...' : '\u039F\u039A',
                        textAlign: TextAlign.center,
                      ),
                    ),
                  ],
                ),
              ],
            );
          },
        );
      },
    );

    otherController.dispose();
  }

  Future<List<Map<String, dynamic>>> _loadFaultCatalog() async {
    final response = await ref.read(apiClientProvider).getFaultCatalog();
    return _mapList(response['items']);
  }

  Future<int?> _showRequiredPhotoUploadDialog({
    required String repairId,
  }) async {
    final uploadedPhotos = <Map<String, dynamic>>[];
    XFile? selectedPhoto;
    var isPicking = false;
    var isUploading = false;
    String? validationMessage;

    return showDialog<int>(
      context: context,
      barrierDismissible: false,
      builder: (BuildContext dialogContext) {
        return PopScope<int>(
          canPop: false,
          child: StatefulBuilder(
            builder: (BuildContext context, StateSetter dialogSetState) {
              Future<void> capturePhoto() async {
                if (isPicking || isUploading || uploadedPhotos.length >= 5) {
                  return;
                }

                dialogSetState(() {
                  isPicking = true;
                  validationMessage = null;
                });

                try {
                  final photo = await _pickFaultPhoto(ImageSource.camera);
                  if (!dialogContext.mounted || photo == null) {
                    return;
                  }

                  dialogSetState(() {
                    selectedPhoto = photo;
                  });
                } catch (_) {
                  if (!dialogContext.mounted) {
                    return;
                  }

                  dialogSetState(() {
                    validationMessage =
                        '\u0394\u03B5\u03BD \u03AE\u03C4\u03B1\u03BD \u03B4\u03C5\u03BD\u03B1\u03C4\u03AE \u03B7 \u03BB\u03AE\u03C8\u03B7 \u03C6\u03C9\u03C4\u03BF\u03B3\u03C1\u03B1\u03C6\u03AF\u03B1\u03C2. \u0395\u03BB\u03AD\u03B3\u03BE\u03C4\u03B5 \u03C4\u03B1 \u03B4\u03B9\u03BA\u03B1\u03B9\u03CE\u03BC\u03B1\u03C4\u03B1 \u03BA\u03AC\u03BC\u03B5\u03C1\u03B1\u03C2 \u03BA\u03B1\u03B9 \u03B4\u03BF\u03BA\u03B9\u03BC\u03AC\u03C3\u03C4\u03B5 \u03BE\u03B1\u03BD\u03AC.';
                  });
                } finally {
                  if (dialogContext.mounted) {
                    dialogSetState(() {
                      isPicking = false;
                    });
                  }
                }
              }

              Future<void> uploadSelectedPhoto() async {
                final photo = selectedPhoto;
                if (photo == null || isUploading) {
                  dialogSetState(() {
                    validationMessage =
                        '\u03A4\u03C1\u03B1\u03B2\u03AE\u03BE\u03C4\u03B5 \u03C6\u03C9\u03C4\u03BF\u03B3\u03C1\u03B1\u03C6\u03AF\u03B1 \u03BA\u03B1\u03B9 \u03B5\u03BB\u03AD\u03B3\u03BE\u03C4\u03B5 \u03C4\u03B7\u03BD \u03C0\u03C1\u03BF\u03B5\u03C0\u03B9\u03C3\u03BA\u03CC\u03C0\u03B7\u03C3\u03B7 \u03C0\u03C1\u03B9\u03BD \u03C4\u03B7\u03BD \u03BA\u03B1\u03C4\u03B1\u03C7\u03CE\u03C1\u03B7\u03C3\u03B7.';
                  });
                  return;
                }

                final contentType = _contentTypeForPhoto(photo);
                if (contentType == null) {
                  dialogSetState(() {
                    validationMessage =
                        '\u03A5\u03C0\u03BF\u03C3\u03C4\u03B7\u03C1\u03AF\u03B6\u03BF\u03BD\u03C4\u03B1\u03B9 \u03BC\u03CC\u03BD\u03BF \u03C6\u03C9\u03C4\u03BF\u03B3\u03C1\u03B1\u03C6\u03AF\u03B5\u03C2 JPEG, PNG \u03AE WebP.';
                  });
                  return;
                }

                dialogSetState(() {
                  isUploading = true;
                  validationMessage = null;
                });

                try {
                  final response = await _uploadFaultPhoto(
                    repairId: repairId,
                    photo: photo,
                    contentType: contentType,
                    caption:
                        'Fault declaration photo ${uploadedPhotos.length + 1}',
                  );

                  if (!dialogContext.mounted) {
                    return;
                  }

                  dialogSetState(() {
                    uploadedPhotos.add(response);
                    selectedPhoto = null;
                  });
                } on ApiException catch (error) {
                  if (!dialogContext.mounted) {
                    return;
                  }

                  dialogSetState(() {
                    validationMessage = mapApiError(error);
                  });
                } catch (_) {
                  if (!dialogContext.mounted) {
                    return;
                  }

                  dialogSetState(() {
                    validationMessage =
                        '\u0397 \u03BA\u03B1\u03C4\u03B1\u03C7\u03CE\u03C1\u03B7\u03C3\u03B7 \u03C6\u03C9\u03C4\u03BF\u03B3\u03C1\u03B1\u03C6\u03AF\u03B1\u03C2 \u03B1\u03C0\u03AD\u03C4\u03C5\u03C7\u03B5. \u0395\u03BB\u03AD\u03B3\u03BE\u03C4\u03B5 \u03C4\u03B7 \u03C3\u03CD\u03BD\u03B4\u03B5\u03C3\u03B7 \u03BA\u03B1\u03B9 \u03B4\u03BF\u03BA\u03B9\u03BC\u03AC\u03C3\u03C4\u03B5 \u03BE\u03B1\u03BD\u03AC.';
                  });
                } finally {
                  if (dialogContext.mounted) {
                    dialogSetState(() {
                      isUploading = false;
                    });
                  }
                }
              }

              void finish() {
                if (uploadedPhotos.isEmpty) {
                  dialogSetState(() {
                    validationMessage =
                        '\u0391\u03C0\u03B1\u03B9\u03C4\u03B5\u03AF\u03C4\u03B1\u03B9 \u03C4\u03BF\u03C5\u03BB\u03AC\u03C7\u03B9\u03C3\u03C4\u03BF\u03BD 1 \u03C6\u03C9\u03C4\u03BF\u03B3\u03C1\u03B1\u03C6\u03AF\u03B1 \u03B3\u03B9\u03B1 \u03C4\u03B7 \u03B4\u03AE\u03BB\u03C9\u03C3\u03B7 \u03B2\u03BB\u03AC\u03B2\u03B7\u03C2.';
                  });
                  return;
                }

                if (selectedPhoto != null) {
                  dialogSetState(() {
                    validationMessage =
                        '\u039A\u03B1\u03C4\u03B1\u03C7\u03C9\u03C1\u03AE\u03C3\u03C4\u03B5 \u03AE \u03B1\u03C6\u03B1\u03B9\u03C1\u03AD\u03C3\u03C4\u03B5 \u03C4\u03B7\u03BD \u03C4\u03C1\u03AD\u03C7\u03BF\u03C5\u03C3\u03B1 \u03C6\u03C9\u03C4\u03BF\u03B3\u03C1\u03B1\u03C6\u03AF\u03B1 \u03C0\u03C1\u03B9\u03BD \u03C4\u03B7\u03BD \u03BF\u03BB\u03BF\u03BA\u03BB\u03AE\u03C1\u03C9\u03C3\u03B7.';
                  });
                  return;
                }

                Navigator.of(dialogContext).pop(uploadedPhotos.length);
              }

              final canCapture =
                  !isPicking && !isUploading && uploadedPhotos.length < 5;
              final canUpload = selectedPhoto != null && !isUploading;
              final canFinish =
                  uploadedPhotos.isNotEmpty &&
                  selectedPhoto == null &&
                  !isUploading &&
                  !isPicking;

              return AlertDialog(
                key: const ValueKey<String>('decharge-fault-photo-dialog'),
                title: const Text(
                  '\u03A6\u03C9\u03C4\u03BF\u03B3\u03C1\u03B1\u03C6\u03AF\u03B5\u03C2 \u03B2\u03BB\u03AC\u03B2\u03B7\u03C2',
                ),
                content: SizedBox(
                  width: double.maxFinite,
                  child: SingleChildScrollView(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: <Widget>[
                        Text(
                          '\u03A4\u03C1\u03B1\u03B2\u03AE\u03BE\u03C4\u03B5 1 \u03AD\u03C9\u03C2 5 \u03C6\u03C9\u03C4\u03BF\u03B3\u03C1\u03B1\u03C6\u03AF\u03B5\u03C2. \u039A\u03AC\u03B8\u03B5 \u03C6\u03C9\u03C4\u03BF\u03B3\u03C1\u03B1\u03C6\u03AF\u03B1 \u03B5\u03BC\u03C6\u03B1\u03BD\u03AF\u03B6\u03B5\u03C4\u03B1\u03B9 \u03B3\u03B9\u03B1 \u03C0\u03C1\u03BF\u03B5\u03C0\u03B9\u03C3\u03BA\u03CC\u03C0\u03B7\u03C3\u03B7 \u03C0\u03C1\u03B9\u03BD \u03BA\u03B1\u03C4\u03B1\u03C7\u03C9\u03C1\u03B7\u03B8\u03B5\u03AF.',
                          style: Theme.of(context).textTheme.bodyMedium,
                        ),
                        const SizedBox(height: 12),
                        Text(
                          '${uploadedPhotos.length}/5 \u03C6\u03C9\u03C4\u03BF\u03B3\u03C1\u03B1\u03C6\u03AF\u03B5\u03C2 \u03BA\u03B1\u03C4\u03B1\u03C7\u03C9\u03C1\u03B7\u03BC\u03AD\u03BD\u03B5\u03C2',
                          key: const ValueKey<String>(
                            'decharge-fault-photo-count-label',
                          ),
                          style: Theme.of(context).textTheme.titleSmall,
                        ),
                        const SizedBox(height: 16),
                        if (selectedPhoto == null && uploadedPhotos.length < 5)
                          FilledButton.icon(
                            key: const ValueKey<String>(
                              'decharge-fault-photo-camera-button',
                            ),
                            onPressed: canCapture ? capturePhoto : null,
                            icon: isPicking
                                ? const SizedBox(
                                    width: 16,
                                    height: 16,
                                    child: CircularProgressIndicator(
                                      strokeWidth: 2,
                                    ),
                                  )
                                : const Icon(Icons.photo_camera_outlined),
                            label: Text(
                              isPicking
                                  ? '\u0386\u03BD\u03BF\u03B9\u03B3\u03BC\u03B1 \u03BA\u03AC\u03BC\u03B5\u03C1\u03B1\u03C2...'
                                  : '\u039B\u03AE\u03C8\u03B7 \u03C6\u03C9\u03C4\u03BF\u03B3\u03C1\u03B1\u03C6\u03AF\u03B1\u03C2',
                            ),
                          ),
                        if (selectedPhoto != null) ...<Widget>[
                          _FaultPhotoPreview(photo: selectedPhoto!),
                          const SizedBox(height: 12),
                          Wrap(
                            spacing: 12,
                            runSpacing: 12,
                            children: <Widget>[
                              FilledButton.icon(
                                key: const ValueKey<String>(
                                  'decharge-fault-photo-upload-button',
                                ),
                                onPressed: canUpload
                                    ? uploadSelectedPhoto
                                    : null,
                                icon: isUploading
                                    ? const SizedBox(
                                        width: 16,
                                        height: 16,
                                        child: CircularProgressIndicator(
                                          strokeWidth: 2,
                                        ),
                                      )
                                    : const Icon(Icons.cloud_upload_outlined),
                                label: Text(
                                  isUploading
                                      ? '\u039A\u03B1\u03C4\u03B1\u03C7\u03CE\u03C1\u03B7\u03C3\u03B7...'
                                      : '\u039A\u03B1\u03C4\u03B1\u03C7\u03CE\u03C1\u03B7\u03C3\u03B7 \u03C6\u03C9\u03C4\u03BF\u03B3\u03C1\u03B1\u03C6\u03AF\u03B1\u03C2',
                                ),
                              ),
                              OutlinedButton.icon(
                                key: const ValueKey<String>(
                                  'decharge-fault-photo-remove-button',
                                ),
                                onPressed: isUploading
                                    ? null
                                    : () {
                                        dialogSetState(() {
                                          selectedPhoto = null;
                                          validationMessage = null;
                                        });
                                      },
                                icon: const Icon(Icons.delete_outline),
                                label: const Text(
                                  '\u0391\u03C6\u03B1\u03AF\u03C1\u03B5\u03C3\u03B7',
                                ),
                              ),
                            ],
                          ),
                        ],
                        if (uploadedPhotos.isNotEmpty) ...<Widget>[
                          const SizedBox(height: 16),
                          ...uploadedPhotos.asMap().entries.map(
                            (entry) => ListTile(
                              key: ValueKey<String>(
                                'decharge-fault-photo-uploaded-${entry.key}',
                              ),
                              contentPadding: EdgeInsets.zero,
                              leading: const Icon(Icons.check_circle_outline),
                              title: Text(
                                '\u03A6\u03C9\u03C4\u03BF\u03B3\u03C1\u03B1\u03C6\u03AF\u03B1 ${entry.key + 1}',
                              ),
                              subtitle: const Text(
                                '\u039A\u03B1\u03C4\u03B1\u03C7\u03C9\u03C1\u03AE\u03B8\u03B7\u03BA\u03B5 \u03C3\u03C4\u03BF Repair',
                              ),
                            ),
                          ),
                        ],
                        if (uploadedPhotos.length >= 5) ...<Widget>[
                          const SizedBox(height: 12),
                          const Text(
                            '\u0388\u03C7\u03B5\u03C4\u03B5 \u03C6\u03C4\u03AC\u03C3\u03B5\u03B9 \u03C4\u03BF \u03CC\u03C1\u03B9\u03BF \u03C4\u03C9\u03BD 5 \u03C6\u03C9\u03C4\u03BF\u03B3\u03C1\u03B1\u03C6\u03B9\u03CE\u03BD.',
                          ),
                        ],
                        if (validationMessage != null) ...<Widget>[
                          const SizedBox(height: 12),
                          Text(
                            validationMessage!,
                            style: TextStyle(
                              color: Theme.of(context).colorScheme.error,
                            ),
                          ),
                        ],
                      ],
                    ),
                  ),
                ),
                actions: <Widget>[
                  ResponsiveDialogActions(
                    children: <Widget>[
                      FilledButton(
                        key: const ValueKey<String>(
                          'decharge-fault-photo-finish-button',
                        ),
                        style: compactDialogButtonStyle(),
                        onPressed: canFinish ? finish : null,
                        child: const Text(
                          '\u039F\u039B\u039F\u039A\u039B\u0397\u03A1\u03A9\u03A3\u0397',
                          textAlign: TextAlign.center,
                        ),
                      ),
                    ],
                  ),
                ],
              );
            },
          ),
        );
      },
    );
  }

  Future<XFile?> _pickFaultPhoto(ImageSource source) {
    final picker = widget.pickFaultPhoto;
    if (picker != null) {
      return picker(source);
    }

    return _imagePicker.pickImage(
      source: source,
      imageQuality: 85,
      maxWidth: 1600,
    );
  }

  Future<Map<String, dynamic>> _uploadFaultPhoto({
    required String repairId,
    required XFile photo,
    required String contentType,
    required String caption,
  }) {
    final uploader = widget.uploadFaultPhoto;
    final deviceId = ref.read(deviceIdProvider);

    if (uploader != null) {
      return uploader(
        repairId: repairId,
        filePath: photo.path,
        fileName: _fileNameForPhoto(photo),
        contentType: contentType,
        deviceId: deviceId,
        caption: caption,
      );
    }

    return ref
        .read(apiClientProvider)
        .uploadRepairPhoto(
          repairId: repairId,
          filePath: photo.path,
          fileName: _fileNameForPhoto(photo),
          contentType: contentType,
          deviceId: deviceId,
          caption: caption,
        );
  }

  Future<void> _showFaultDeclarationSuccessAndReturnHome(int photoCount) async {
    await showDialog<void>(
      context: context,
      barrierDismissible: false,
      builder: (BuildContext dialogContext) {
        Future<void>.delayed(const Duration(seconds: 5), () {
          if (!mounted || !dialogContext.mounted) {
            return;
          }

          Navigator.of(dialogContext).pop();
          GoRouter.maybeOf(context)?.go('/');
        });

        return AlertDialog(
          title: const Text(
            '\u0397 \u03B2\u03BB\u03AC\u03B2\u03B7 \u03B4\u03B7\u03BB\u03CE\u03B8\u03B7\u03BA\u03B5',
          ),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              Text(
                '\u0397 \u03B1\u03C0\u03BF\u03C7\u03C1\u03AD\u03C9\u03C3\u03B7, \u03B7 \u0394\u03AE\u03BB\u03C9\u03C3\u03B7 \u0392\u03BB\u03AC\u03B2\u03B7\u03C2 \u03BA\u03B1\u03B9 $photoCount \u03C6\u03C9\u03C4\u03BF\u03B3\u03C1\u03B1\u03C6\u03AF\u03B5\u03C2 \u03BA\u03B1\u03C4\u03B1\u03C7\u03C9\u03C1\u03AE\u03B8\u03B7\u03BA\u03B1\u03BD \u03BC\u03B5 \u03B5\u03C0\u03B9\u03C4\u03C5\u03C7\u03AF\u03B1.',
              ),
              const SizedBox(height: 16),
              const LinearProgressIndicator(),
            ],
          ),
        );
      },
    );
  }

  Future<void> _showDechargeSuccessAndNavigate(
    Map<String, dynamic> response,
  ) async {
    final decision = response['decision']?.toString();
    final message = _dechargeSuccessMessage(response);
    await showDialog<void>(
      context: context,
      barrierDismissible: false,
      builder: (BuildContext dialogContext) {
        Future<void>.delayed(const Duration(seconds: 5), () {
          if (!mounted || !dialogContext.mounted) {
            return;
          }

          Navigator.of(dialogContext).pop();
          if (decision == 'DECHARGED_REPAIR_REQUIRED') {
            final vacuumQr = Uri.encodeComponent(_vacuumQrRaw);
            GoRouter.maybeOf(
              context,
            )?.go('/fault-declaration?vacuumQr=$vacuumQr');
          } else {
            GoRouter.maybeOf(context)?.go('/');
          }
        });

        return AlertDialog(
          title: Text(
            decision == 'DECHARGED_REPAIR_REQUIRED'
                ? '\u0391\u03C0\u03B1\u03B9\u03C4\u03B5\u03AF\u03C4\u03B1\u03B9 \u0394\u03AE\u03BB\u03C9\u03C3\u03B7 \u0392\u03BB\u03AC\u03B2\u03B7\u03C2'
                : '\u0395\u03C0\u03B9\u03C4\u03C5\u03C7\u03AE\u03C2 \u0391\u03C0\u03BF\u03C7\u03C1\u03AD\u03C9\u03C3\u03B7',
          ),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              Text(message),
              const SizedBox(height: 16),
              const LinearProgressIndicator(),
            ],
          ),
        );
      },
    );
  }

  String _dechargeSuccessMessage(Map<String, dynamic> response) {
    final decision = response['decision']?.toString();
    final vacuum = _mapOrNull(response['vacuum']);
    final rack = _mapOrNull(response['rack']);
    final vacuumLabel = _displayValue(
      vacuum?['serialNumber'] ?? vacuum?['code'] ?? _vacuumQrRaw,
    );
    final rackLabel = _displayValue(
      rack?['label'] ?? rack?['code'] ?? _rackQrRaw,
    );

    if (decision == 'DECHARGED_REPAIR_REQUIRED') {
      return '\u0397 \u03B1\u03C0\u03BF\u03C7\u03C1\u03AD\u03C9\u03C3\u03B7 \u03AD\u03B3\u03B9\u03BD\u03B5 \u03BC\u03B5 \u03B5\u03C0\u03B9\u03C4\u03C5\u03C7\u03AF\u03B1. '
          '\u0391\u03C0\u03B1\u03B9\u03C4\u03B5\u03AF\u03C4\u03B1\u03B9 \u0394\u03AE\u03BB\u03C9\u03C3\u03B7 \u0392\u03BB\u03AC\u03B2\u03B7\u03C2.';
    }

    return '\u0397 \u03B1\u03C0\u03BF\u03C7\u03C1\u03AD\u03C9\u03C3\u03B7 \u03C4\u03BF\u03C5 Vacuum $vacuumLabel '
        '\u03C3\u03C4\u03B7 \u03B8\u03AD\u03C3\u03B7 $rackLabel '
        '\u03AD\u03B3\u03B9\u03BD\u03B5 \u03BC\u03B5 \u03B5\u03C0\u03B9\u03C4\u03C5\u03C7\u03AF\u03B1.';
  }

  String _activeVacuumLabel() {
    final firstPreviewVacuum = _mapOrNull(_firstPreviewResponse?['vacuum']);
    final assistedVacuum = _mapOrNull(_assistedChargeResponse?['vacuum']);
    return _displayValue(
      firstPreviewVacuum?['serialNumber'] ??
          firstPreviewVacuum?['code'] ??
          assistedVacuum?['serialNumber'] ??
          assistedVacuum?['code'] ??
          _vacuumQrRaw,
    );
  }

  Future<Map<String, dynamic>> _submitDechargeRequest() {
    final deviceId = ref.read(deviceIdProvider);
    return ref.read(apiClientProvider).postDecharge(<String, dynamic>{
      'vacuumQr': _vacuumQrRaw,
      'rackQr': _rackQrRaw,
      'deviceId': deviceId,
    });
  }

  void _clearCurrentVacuum() {
    _vacuumQrController.clear();
    _resetWorkflowState(clearRack: true);
  }

  void _clearAndScanVacuumAgain() {
    _clearCurrentVacuum();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) {
        _scanVacuum();
      }
    });
  }

  void _clearRackAndScanAgain() {
    _rackQrController.clear();
    setState(() {
      _secondPreviewResponse = null;
      _errorMessage = null;
    });
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) {
        _scanRack();
      }
    });
  }

  void _resetWorkflowState({required bool clearRack}) {
    if (clearRack) {
      _rackQrController.clear();
    }

    setState(() {
      _firstPreviewResponse = null;
      _secondPreviewResponse = null;
      _assistedChargeResponse = null;
      _errorMessage = null;
    });
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return AppScreenScaffold(
      title: HomeScreen.dechargeLabel,
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: <Widget>[
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
                  Text(
                    HomeScreen.dechargeLabel,
                    style: theme.textTheme.headlineSmall,
                  ),
                  const SizedBox(height: 8),
                  Text(
                    '\u03A3\u03BA\u03B1\u03BD\u03AC\u03C1\u03B5\u03C4\u03B5 '
                    'Vacuum \u03BA\u03B1\u03B9 \u03BC\u03B5\u03C4\u03AC '
                    '\u03C4\u03B7 \u03B8\u03AD\u03C3\u03B7 Rack \u03C0\u03BF'
                    '\u03C5 \u03B8\u03B1 \u03C4\u03BF \u03C0\u03BF\u03B8\u03B5'
                    '\u03C4\u03B7\u03B8\u03B5\u03AF.',
                    style: theme.textTheme.bodyMedium,
                  ),
                ],
              ),
            ),
          ),
          if (_isLoading) ...<Widget>[
            const SizedBox(height: 16),
            const _LoadingCard(message: 'Checking backend preview...'),
          ],
          const SizedBox(height: 16),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
                  Text('Vacuum scan', style: theme.textTheme.titleMedium),
                  const SizedBox(height: 12),
                  Wrap(
                    spacing: 12,
                    runSpacing: 12,
                    children: <Widget>[
                      FilledButton.icon(
                        key: const ValueKey<String>(
                          'decharge-scan-vacuum-button',
                        ),
                        onPressed: _isLoading ? null : _scanVacuum,
                        icon: const Icon(Icons.qr_code_scanner),
                        label: const Text(
                          '\u03A3\u03BA\u03B1\u03BD\u03AC\u03C1\u03B9\u03C3\u03BC\u03B1 Vacuum',
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 16),
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: <Widget>[
                      Expanded(
                        child: TextField(
                          key: const ValueKey<String>('decharge-vacuum-input'),
                          controller: _vacuumQrController,
                          onChanged: (_) =>
                              _resetWorkflowState(clearRack: true),
                          onSubmitted: (_) {
                            if (!_isLoading) {
                              _previewVacuum();
                            }
                          },
                          decoration: const InputDecoration(
                            labelText:
                                '\u03A3\u03B5\u03B9\u03C1\u03B9\u03B1\u03BA\u03CC / QR Vacuum',
                            hintText: 'VAC:VP-001 \u03AE serial',
                            border: OutlineInputBorder(),
                          ),
                        ),
                      ),
                      const SizedBox(width: 12),
                      SizedBox(
                        height: 56,
                        child: FilledButton(
                          key: const ValueKey<String>(
                            'decharge-vacuum-ok-button',
                          ),
                          onPressed: _isLoading ? null : _previewVacuum,
                          child: Text(_isLoading ? '...' : 'OK'),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
          if (_errorMessage != null) ...<Widget>[
            const SizedBox(height: 16),
            _NoticeCard(
              color: const Color(0xFFFFF1F2),
              title: 'Connection or validation issue',
              message: _errorMessage!,
            ),
          ],
          if (_canScanRack) ...<Widget>[
            const SizedBox(height: 16),
            _NoticeCard(
              title:
                  '\u03A3\u03C5\u03BD\u03AD\u03C7\u03B5\u03B9\u03B1 \u03B1\u03C0\u03BF\u03C7\u03C1\u03AD\u03C9\u03C3\u03B7\u03C2',
              message:
                  'Vacuum \u03B3\u03B9\u03B1 \u03B1\u03C0\u03BF\u03C7\u03C1\u03AD\u03C9\u03C3\u03B7: ${_activeVacuumLabel()}',
            ),
          ],
          if (_canScanRack) ...<Widget>[
            const SizedBox(height: 16),
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    Text('Rack scan', style: theme.textTheme.titleMedium),
                    const SizedBox(height: 8),
                    Text(
                      '\u03A3\u03BA\u03B1\u03BD\u03AC\u03C1\u03B5\u03C4\u03B5 \u03C4\u03B7 \u03B8\u03AD\u03C3\u03B7 Rack \u03B3\u03B9\u03B1 \u03C4\u03B7\u03BD \u03B1\u03C0\u03BF\u03C7\u03C1\u03AD\u03C9\u03C3\u03B7.',
                      style: theme.textTheme.bodyMedium,
                    ),
                    const SizedBox(height: 12),
                    Wrap(
                      spacing: 12,
                      runSpacing: 12,
                      children: <Widget>[
                        FilledButton.icon(
                          key: const ValueKey<String>(
                            'decharge-scan-rack-button',
                          ),
                          onPressed: _isLoading ? null : _scanRack,
                          icon: const Icon(Icons.qr_code_2_outlined),
                          label: const Text(
                            '\u03A3\u03BA\u03B1\u03BD\u03AC\u03C1\u03B9\u03C3\u03BC\u03B1 \u0398\u03AD\u03C3\u03B7\u03C2 Rack',
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 16),
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: <Widget>[
                        Expanded(
                          child: TextField(
                            key: const ValueKey<String>('decharge-rack-input'),
                            controller: _rackQrController,
                            onChanged: (_) {
                              setState(() {
                                _secondPreviewResponse = null;
                                _errorMessage = null;
                              });
                            },
                            onSubmitted: (_) {
                              if (!_isLoading) {
                                _previewDecharge();
                              }
                            },
                            decoration: const InputDecoration(
                              labelText:
                                  'QR \u0398\u03AD\u03C3\u03B7\u03C2 Rack',
                              hintText: 'RACK:RACK-A-01-07',
                              border: OutlineInputBorder(),
                            ),
                          ),
                        ),
                        const SizedBox(width: 12),
                        SizedBox(
                          height: 56,
                          child: FilledButton(
                            key: const ValueKey<String>(
                              'decharge-rack-ok-button',
                            ),
                            onPressed: _isLoading ? null : _previewDecharge,
                            child: Text(_isLoading ? '...' : 'OK'),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 16),
            _DechargePreviewCard(
              title: 'Decharge preview',
              emptyMessage:
                  'After a valid Vacuum preview, scan or type the Rack destination and run the decharge preview.',
              previewResponse: _secondPreviewResponse,
            ),
          ],
        ],
      ),
    );
  }
}

enum _OccupiedMachineAction { decharge, chooseAnother }

class _MachineSelectionSheet extends StatelessWidget {
  const _MachineSelectionSheet({required this.machinesFuture});

  final Future<List<Map<String, dynamic>>> machinesFuture;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return FractionallySizedBox(
      heightFactor: 0.84,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Center(
              child: Container(
                width: 44,
                height: 4,
                decoration: BoxDecoration(
                  color: theme.colorScheme.outlineVariant,
                  borderRadius: BorderRadius.circular(999),
                ),
              ),
            ),
            const SizedBox(height: 18),
            Text(
              '\u0395\u03C0\u03B9\u03BB\u03BF\u03B3\u03AE \u03BC\u03B7\u03C7\u03B1\u03BD\u03AE\u03BC\u03B1\u03C4\u03BF\u03C2',
              style: theme.textTheme.headlineSmall,
            ),
            const SizedBox(height: 8),
            Text(
              '\u0395\u03C0\u03B9\u03BB\u03AD\u03BE\u03C4\u03B5 \u03BC\u03B7\u03C7\u03AC\u03BD\u03B7\u03BC\u03B1 \u03B3\u03B9\u03B1 \u03BD\u03B1 \u03B3\u03AF\u03BD\u03B5\u03B9 \u03C7\u03C1\u03AD\u03C9\u03C3\u03B7 \u03C0\u03C1\u03B9\u03BD \u03C4\u03B7\u03BD \u03B1\u03C0\u03BF\u03C7\u03C1\u03AD\u03C9\u03C3\u03B7. \u03A4\u03B1 \u03BA\u03B1\u03C4\u03B5\u03B9\u03BB\u03B7\u03BC\u03BC\u03AD\u03BD\u03B1 \u03B5\u03BC\u03C6\u03B1\u03BD\u03AF\u03B6\u03BF\u03BD\u03C4\u03B1\u03B9 \u03BC\u03B5 \u03B1\u03BD\u03BF\u03B9\u03C7\u03C4\u03CC \u03BA\u03CC\u03BA\u03BA\u03B9\u03BD\u03BF.',
              style: theme.textTheme.bodyMedium,
            ),
            const SizedBox(height: 16),
            Expanded(
              child: FutureBuilder<List<Map<String, dynamic>>>(
                future: machinesFuture,
                builder: (context, snapshot) {
                  if (snapshot.connectionState != ConnectionState.done) {
                    return const Center(child: CircularProgressIndicator());
                  }

                  if (snapshot.hasError) {
                    return _NoticeCard(
                      color: const Color(0xFFFFF1F2),
                      title:
                          '\u0394\u03B5\u03BD \u03C6\u03BF\u03C1\u03C4\u03CE\u03B8\u03B7\u03BA\u03B1\u03BD \u03BC\u03B7\u03C7\u03B1\u03BD\u03AE\u03BC\u03B1\u03C4\u03B1',
                      message: snapshot.error.toString(),
                    );
                  }

                  final machines = snapshot.data ?? <Map<String, dynamic>>[];
                  if (machines.isEmpty) {
                    return const _NoticeCard(
                      title:
                          '\u0394\u03B5\u03BD \u03B2\u03C1\u03AD\u03B8\u03B7\u03BA\u03B1\u03BD \u03BC\u03B7\u03C7\u03B1\u03BD\u03AE\u03BC\u03B1\u03C4\u03B1',
                      message:
                          '\u0395\u03BB\u03AD\u03B3\u03BE\u03C4\u03B5 \u03C4\u03B1 master data \u03AE \u03C4\u03B7 \u03C3\u03CD\u03BD\u03B4\u03B5\u03C3\u03B7 \u03BC\u03B5 backend.',
                    );
                  }

                  return ListView.separated(
                    itemCount: machines.length,
                    separatorBuilder: (_, _) => const SizedBox(height: 12),
                    itemBuilder: (context, index) {
                      final machine = machines[index];
                      return _MachineCard(
                        machine: machine,
                        onTap: () => Navigator.of(
                          context,
                        ).pop<Map<String, dynamic>>(machine),
                      );
                    },
                  );
                },
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _MachineCard extends StatelessWidget {
  const _MachineCard({required this.machine, required this.onTap});

  final Map<String, dynamic> machine;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final code = _displayValue(machine['code']);
    final name = _displayValue(machine['name']);
    final project = _displayValue(machine['project']);
    final area = _displayValue(machine['area']);
    final machineId = _displayValue(machine['id']);
    final isAvailable = _isMachineAvailableForCharge(machine);
    final currentPad = _mapOrNull(machine['currentPad']);
    final occupiedVacuum = _occupiedVacuumLabel(machine);

    return Card(
      key: ValueKey<String>('decharge-machine-card-$machineId'),
      color: isAvailable ? null : const Color(0xFFFFE4E6),
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Row(
            children: <Widget>[
              const Icon(Icons.precision_manufacturing_outlined, size: 32),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    Text('$code - $name', style: theme.textTheme.titleMedium),
                    const SizedBox(height: 4),
                    Text(
                      'Project: $project  |  Area: $area',
                      style: theme.textTheme.bodySmall,
                    ),
                    if (!isAvailable) ...<Widget>[
                      const SizedBox(height: 8),
                      Wrap(
                        spacing: 8,
                        runSpacing: 6,
                        crossAxisAlignment: WrapCrossAlignment.center,
                        children: <Widget>[
                          Chip(
                            visualDensity: VisualDensity.compact,
                            backgroundColor: const Color(0xFFFFC7CD),
                            label: const Text(
                              '\u03A3\u03B5 \u03C7\u03C1\u03AE\u03C3\u03B7',
                            ),
                          ),
                          Text(
                            'Vacuum: $occupiedVacuum',
                            style: theme.textTheme.bodyMedium?.copyWith(
                              color: theme.colorScheme.error,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ],
                      ),
                      if (_displayValue(currentPad?['description']) != '-')
                        Padding(
                          padding: const EdgeInsets.only(top: 4),
                          child: Text(
                            _displayValue(currentPad?['description']),
                            style: theme.textTheme.bodySmall,
                          ),
                        ),
                    ],
                  ],
                ),
              ),
              const Icon(Icons.chevron_right),
            ],
          ),
        ),
      ),
    );
  }
}

class _FaultPhotoPreview extends StatelessWidget {
  const _FaultPhotoPreview({required this.photo});

  final XFile photo;

  @override
  Widget build(BuildContext context) {
    final photoFile = File(photo.path);
    final canPreview = photoFile.existsSync();

    return Card(
      key: const ValueKey<String>('decharge-fault-photo-preview-card'),
      color: const Color(0xFFF8FAFC),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Text(
              '\u03A0\u03C1\u03BF\u03B5\u03C0\u03B9\u03C3\u03BA\u03CC\u03C0\u03B7\u03C3\u03B7: ${_fileNameForPhoto(photo)}',
              style: Theme.of(context).textTheme.titleSmall,
            ),
            if (canPreview) ...<Widget>[
              const SizedBox(height: 12),
              ClipRRect(
                borderRadius: BorderRadius.circular(12),
                child: Image.file(
                  photoFile,
                  height: 180,
                  width: double.infinity,
                  fit: BoxFit.cover,
                ),
              ),
            ] else ...<Widget>[
              const SizedBox(height: 8),
              const Text(
                '\u0397 \u03C0\u03C1\u03BF\u03B5\u03C0\u03B9\u03C3\u03BA\u03CC\u03C0\u03B7\u03C3\u03B7 \u03B8\u03B1 \u03B5\u03BC\u03C6\u03B1\u03BD\u03B9\u03C3\u03C4\u03B5\u03AF \u03C3\u03C4\u03B7 \u03C3\u03C5\u03C3\u03BA\u03B5\u03C5\u03AE.',
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _DialogTitleWithClose extends StatelessWidget {
  const _DialogTitleWithClose({required this.title, required this.onClose});

  final String title;
  final VoidCallback onClose;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        Expanded(child: Text(title)),
        IconButton(
          key: const ValueKey<String>('decharge-dialog-close-button'),
          tooltip: '\u039A\u03BB\u03B5\u03AF\u03C3\u03B9\u03BC\u03BF',
          onPressed: onClose,
          icon: const Icon(Icons.close),
        ),
      ],
    );
  }
}

class _SummaryBlock extends StatelessWidget {
  const _SummaryBlock({required this.title, required this.values});

  final String title;
  final List<String> values;

  @override
  Widget build(BuildContext context) {
    final visibleValues = values.where((value) => value != '-').toList();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        Text(title, style: Theme.of(context).textTheme.titleSmall),
        const SizedBox(height: 6),
        if (visibleValues.isEmpty)
          const Text('-')
        else
          ...visibleValues.map(
            (value) => Padding(
              padding: const EdgeInsets.only(bottom: 4),
              child: Text(value),
            ),
          ),
      ],
    );
  }
}

class _DechargePreviewCard extends StatelessWidget {
  const _DechargePreviewCard({
    required this.title,
    required this.emptyMessage,
    required this.previewResponse,
  });

  final String title;
  final String emptyMessage;
  final Map<String, dynamic>? previewResponse;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final preview = previewResponse;

    if (preview == null) {
      return Card(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              Text(title, style: theme.textTheme.titleMedium),
              const SizedBox(height: 8),
              Text(emptyMessage, style: theme.textTheme.bodyMedium),
            ],
          ),
        ),
      );
    }

    final decision = preview['decision']?.toString() ?? 'UNKNOWN';
    final message = preview['message']?.toString() ?? 'No message returned.';
    final vacuum = _mapOrNull(preview['vacuum']);
    final rack = _mapOrNull(preview['rack']);
    final chargeSession = _mapOrNull(preview['chargeSession']);

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Row(
              children: <Widget>[
                Text(title, style: theme.textTheme.titleMedium),
                const SizedBox(width: 12),
                Chip(
                  backgroundColor: _decisionColor(decision),
                  label: Text(decision),
                ),
              ],
            ),
            const SizedBox(height: 12),
            Text(message),
            if (_isWrongQrDecision(decision)) ...<Widget>[
              const SizedBox(height: 12),
              _NoticeCard(
                color: const Color(0xFFFFF1F2),
                title:
                    '\u03A3\u03BA\u03B1\u03BD\u03AC\u03C1\u03B1\u03C4\u03B5 \u03BB\u03AC\u03B8\u03BF\u03C2 \u03C4\u03CD\u03C0\u03BF QR.',
                message: '$message\nDecision: $decision',
              ),
            ],
            if (vacuum != null) ...<Widget>[
              const SizedBox(height: 16),
              _DetailTable(
                title: 'Vacuum',
                rows: <MapEntry<String, String>>[
                  MapEntry('Code', _displayValue(vacuum['code'])),
                  MapEntry('Serial', _displayValue(vacuum['serialNumber'])),
                  MapEntry('Description', _displayValue(vacuum['description'])),
                  MapEntry(
                    'Display status',
                    _displayValue(vacuum['displayStatus']),
                  ),
                  MapEntry(
                    'Operational status',
                    _displayValue(vacuum['operationalStatus']),
                  ),
                ],
              ),
            ],
            if (chargeSession != null) ...<Widget>[
              const SizedBox(height: 16),
              _DetailTable(
                title: 'Active charge',
                rows: <MapEntry<String, String>>[
                  MapEntry('Session', _displayValue(chargeSession['id'])),
                  MapEntry(
                    'Machine',
                    _displayValue(
                      _mapOrNull(chargeSession['machine'])?['name'],
                    ),
                  ),
                  MapEntry(
                    'Charged at',
                    _displayValue(chargeSession['chargedAt']),
                  ),
                ],
              ),
            ],
            if (rack != null) ...<Widget>[
              const SizedBox(height: 16),
              _DetailTable(
                title: 'Rack',
                rows: <MapEntry<String, String>>[
                  MapEntry('Label', _displayValue(rack['label'])),
                  MapEntry('Code', _displayValue(rack['code'])),
                  MapEntry('Type', _displayValue(rack['type'])),
                  MapEntry(
                    'Current pad',
                    _displayValue(_mapOrNull(rack['currentPad'])?['code']),
                  ),
                ],
              ),
            ],
            if (decision == 'NOT_ACTIVE') ...<Widget>[
              const SizedBox(height: 12),
              const _NoticeCard(
                title: 'Vacuum is not active',
                message:
                    'This vacuum is not currently charged on a machine, so it cannot be decharged.',
              ),
            ],
            if (decision == 'IN_REPAIR') ...<Widget>[
              const SizedBox(height: 12),
              const _NoticeCard(
                title: 'Vacuum is already in repair',
                message:
                    'This vacuum is already in repair state and cannot follow the normal decharge flow.',
              ),
            ],
            if (decision == 'RACK_OCCUPIED') ...<Widget>[
              const SizedBox(height: 12),
              const _NoticeCard(
                title: 'Rack is occupied',
                message:
                    'Scan or enter another rack position because this one already contains a vacuum.',
              ),
            ],
            if (decision == 'CAN_DECHARGE') ...<Widget>[
              const SizedBox(height: 12),
              const _NoticeCard(
                title: 'Ready to return to rack',
                message:
                    'The selected rack is valid and the vacuum will return to NOTACTIVE rack storage after decharge.',
              ),
            ],
            if (decision == 'REPAIR_INTAKE_REQUIRED') ...<Widget>[
              const SizedBox(height: 12),
              const _NoticeCard(
                color: Color(0xFFFFF7D6),
                title: 'Repair rack selected',
                message:
                    '\u0391\u03C0\u03B1\u03B9\u03C4\u03B5\u03AF\u03C4\u03B1\u03B9 \u0394\u03AE\u03BB\u03C9\u03C3\u03B7 \u0392\u03BB\u03AC\u03B2\u03B7\u03C2 after decharge because the selected rack is of type REP.',
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _DetailTable extends StatelessWidget {
  const _DetailTable({required this.title, required this.rows});

  final String title;
  final List<MapEntry<String, String>> rows;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        Text(title, style: Theme.of(context).textTheme.titleSmall),
        const SizedBox(height: 8),
        ...rows.map(
          (MapEntry<String, String> row) => Padding(
            padding: const EdgeInsets.only(bottom: 6),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                SizedBox(
                  width: 132,
                  child: Text(
                    row.key,
                    style: Theme.of(context).textTheme.labelLarge,
                  ),
                ),
                Expanded(child: Text(row.value)),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

class _NoticeCard extends StatelessWidget {
  const _NoticeCard({
    required this.title,
    required this.message,
    this.color = const Color(0xFFF8FAFC),
  });

  final String title;
  final String message;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Card(
      color: color,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Text(title, style: Theme.of(context).textTheme.titleSmall),
            const SizedBox(height: 8),
            Text(message),
          ],
        ),
      ),
    );
  }
}

class _LoadingCard extends StatelessWidget {
  const _LoadingCard({required this.message});

  final String message;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Row(
          children: <Widget>[
            const SizedBox(
              width: 22,
              height: 22,
              child: CircularProgressIndicator(strokeWidth: 2.6),
            ),
            const SizedBox(width: 12),
            Expanded(child: Text(message)),
          ],
        ),
      ),
    );
  }
}

Map<String, dynamic>? _mapOrNull(dynamic value) {
  if (value is Map<dynamic, dynamic>) {
    return Map<String, dynamic>.from(value);
  }

  return null;
}

List<Map<String, dynamic>> _mapList(dynamic value) {
  if (value is! List<dynamic>) {
    return <Map<String, dynamic>>[];
  }

  final items = <Map<String, dynamic>>[];
  for (final entry in value) {
    if (entry is Map) {
      items.add(Map<String, dynamic>.from(entry));
    }
  }

  return items;
}

String _displayValue(dynamic value) {
  final text = value?.toString().trim();
  if (text == null || text.isEmpty || text == 'null') {
    return '-';
  }

  return text;
}

String? _repairIdFrom(Map<String, dynamic> response) {
  final repair = _mapOrNull(response['repair']);
  final repairId = repair?['id']?.toString().trim();
  if (repairId != null && repairId.isNotEmpty) {
    return repairId;
  }

  final topLevelRepairId = response['repairId']?.toString().trim();
  return topLevelRepairId == null || topLevelRepairId.isEmpty
      ? null
      : topLevelRepairId;
}

String _fileNameForPhoto(XFile photo) {
  final name = photo.name.trim();
  if (name.isNotEmpty) {
    return name;
  }

  final normalizedPath = photo.path.replaceAll('\\', '/');
  final parts = normalizedPath.split('/');
  return parts.isEmpty ? 'fault-photo.jpg' : parts.last;
}

String? _contentTypeForPhoto(XFile photo) {
  final mimeType = photo.mimeType?.toLowerCase().split(';').first.trim();
  if (mimeType == 'image/jpg') {
    return 'image/jpeg';
  }

  if (mimeType == 'image/jpeg' ||
      mimeType == 'image/png' ||
      mimeType == 'image/webp') {
    return mimeType;
  }

  final name = _fileNameForPhoto(photo).toLowerCase();
  final path = photo.path.toLowerCase();

  if (name.endsWith('.jpg') ||
      name.endsWith('.jpeg') ||
      path.endsWith('.jpg') ||
      path.endsWith('.jpeg')) {
    return 'image/jpeg';
  }

  if (name.endsWith('.png') || path.endsWith('.png')) {
    return 'image/png';
  }

  if (name.endsWith('.webp') || path.endsWith('.webp')) {
    return 'image/webp';
  }

  return null;
}

bool _isMachineAvailableForCharge(Map<String, dynamic> machine) {
  final explicitValue = machine['isAvailableForCharge'];
  if (explicitValue is bool) {
    return explicitValue;
  }

  return _mapOrNull(machine['currentPad']) == null &&
      _displayValue(machine['openChargeSessionId']) == '-';
}

String _machineLabel(Map<String, dynamic> machine) {
  final code = _displayValue(machine['code']);
  final name = _displayValue(machine['name']);

  if (code == '-' && name == '-') {
    return _displayValue(machine['id']);
  }

  if (code == '-') {
    return name;
  }

  if (name == '-') {
    return code;
  }

  return '$code - $name';
}

String _occupiedVacuumLabel(Map<String, dynamic> machine) {
  final currentPad = _mapOrNull(machine['currentPad']);
  return _displayValue(currentPad?['serialNumber'] ?? currentPad?['code']);
}

Color _decisionColor(String decision) {
  switch (decision) {
    case 'SELECT_RACK':
    case 'CAN_DECHARGE':
    case 'DECHARGED':
      return const Color(0xFFDDF6E8);
    case 'REPAIR_INTAKE_REQUIRED':
    case 'DECHARGED_REPAIR_REQUIRED':
      return const Color(0xFFFFE7C2);
    case 'NOT_ACTIVE':
    case 'IN_REPAIR':
    case 'VACUUM_NOT_FOUND':
    case 'RACK_NOT_FOUND':
    case 'RACK_OCCUPIED':
    case 'INVALID_REQUEST':
      return const Color(0xFFFFE3E3);
    default:
      return const Color(0xFFF1F5F9);
  }
}

bool _isWrongQrDecision(String decision) {
  return const <String>{
    'VACUUM_NOT_FOUND',
    'RACK_NOT_FOUND',
    'INVALID_REQUEST',
  }.contains(decision);
}
