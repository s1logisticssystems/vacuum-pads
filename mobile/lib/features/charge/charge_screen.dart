import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:vacuum_traceability_mobile/core/api/api_client_provider.dart';
import 'package:vacuum_traceability_mobile/core/api/api_exceptions.dart';
import 'package:vacuum_traceability_mobile/core/settings/settings_provider.dart';
import 'package:vacuum_traceability_mobile/core/widgets/app_screen_scaffold.dart';
import 'package:vacuum_traceability_mobile/core/widgets/responsive_dialog_actions.dart';
import 'package:vacuum_traceability_mobile/features/home/home_screen.dart';
import 'package:vacuum_traceability_mobile/features/scanner/qr_scanner_screen.dart';

class ChargeScreen extends ConsumerStatefulWidget {
  const ChargeScreen({super.key});

  @override
  ConsumerState<ChargeScreen> createState() => _ChargeScreenState();
}

class _ChargeScreenState extends ConsumerState<ChargeScreen> {
  final TextEditingController _vacuumQrController = TextEditingController();

  Map<String, dynamic>? _previewResponse;
  Map<String, dynamic>? _chargeResponse;
  Map<String, dynamic>? _chargedMachine;
  bool _isLoading = false;
  String? _errorMessage;

  @override
  void dispose() {
    _vacuumQrController.dispose();
    super.dispose();
  }

  String get _vacuumQrRaw => _vacuumQrController.text.trim();

  String? get _previewDecision => _previewResponse?['decision']?.toString();

  bool get _isChargeSuccess =>
      _chargeResponse?['ok'] == true &&
      _chargeResponse?['decision'] == 'CHARGED';

  Future<void> _scanVacuum() async {
    final scannedValue = await QrScannerScreen.scanForRaw(
      context,
      title: HomeScreen.chargeLabel,
      description:
          'Scan the Vacuum QR and return the raw value to the charge workflow.',
    );

    if (!mounted || scannedValue == null || scannedValue.trim().isEmpty) {
      return;
    }

    _vacuumQrController.text = scannedValue.trim();
    _resetChargeState();
    await _runPreview();
  }

  Future<void> _runPreview() async {
    if (_vacuumQrRaw.isEmpty) {
      setState(() {
        _errorMessage = 'Enter or scan a Vacuum QR before running preview.';
        _previewResponse = null;
        _chargeResponse = null;
        _chargedMachine = null;
      });
      await _showInvalidQrDialog(
        title: '\u039B\u03AC\u03B8\u03BF\u03C2 QR',
        message:
            '\u0394\u03B5\u03BD \u03B2\u03C1\u03AD\u03B8\u03B7\u03BA\u03B5 Vacuum '
            '\u03B3\u03B9\u03B1 \u03B1\u03C5\u03C4\u03CC \u03C4\u03BF QR/Serial.',
      );
      return;
    }

    var shouldOpenMachineSelection = false;
    Map<String, dynamic>? previewForDialog;

    setState(() {
      _isLoading = true;
      _errorMessage = null;
      _previewResponse = null;
      _chargeResponse = null;
      _chargedMachine = null;
    });

    try {
      final deviceId = ref.read(deviceIdProvider);
      final preview = await ref.read(apiClientProvider).postChargePreview(
        <String, dynamic>{'vacuumQr': _vacuumQrRaw, 'deviceId': deviceId},
      );

      if (!mounted) {
        return;
      }

      setState(() {
        _previewResponse = preview;
      });
      shouldOpenMachineSelection =
          preview['decision']?.toString() == 'CAN_CHARGE';
      if (!shouldOpenMachineSelection) {
        previewForDialog = preview;
      }
    } on ApiException catch (error) {
      if (!mounted) {
        return;
      }

      setState(() {
        if (error.payload != null) {
          _previewResponse = error.payload;
          _errorMessage = null;
        } else {
          _previewResponse = null;
          _errorMessage = mapApiError(error);
        }
      });
      previewForDialog = error.payload;
    } finally {
      if (mounted) {
        setState(() {
          _isLoading = false;
        });
      }
    }

    if (mounted && shouldOpenMachineSelection) {
      await _openMachineSelectionSheet();
      return;
    }

    if (mounted && previewForDialog != null) {
      await _showPreviewDecisionDialog(previewForDialog);
    }
  }

  Future<void> _openMachineSelectionSheet() async {
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

    await _openChargeConfirmationSheet(selectedMachine);
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
        await _openMachineSelectionSheet();
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
            title: 'Το μηχάνημα είναι σε χρήση',
            onClose: () => Navigator.of(dialogContext).pop(),
          ),
          content: RichText(
            text: TextSpan(
              style: theme.textTheme.bodyMedium,
              children: <InlineSpan>[
                const TextSpan(text: 'Το μηχάνημα που επέλεξες '),
                TextSpan(
                  text: machineLabel,
                  style: const TextStyle(fontWeight: FontWeight.w700),
                ),
                const TextSpan(
                  text: ' φαίνεται να είναι σε λειτουργία με το Vacuum ',
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
                      '.\n\nΒρείτε πρώτα το συγκεκριμένο Vacuum στη θέση του και σκανάρετέ το στην οθόνη Αποχρέωσης. Αν δεν βρίσκεται εκεί, επικοινωνήστε με τα κεντρικά.',
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
                  child: const Text('Αποχρέωση', textAlign: TextAlign.center),
                ),
                FilledButton(
                  style: compactDialogButtonStyle(),
                  onPressed: () => Navigator.of(
                    dialogContext,
                  ).pop(_OccupiedMachineAction.chooseAnother),
                  child: const Text(
                    'Άλλο μηχάνημα',
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

  Future<void> _openChargeConfirmationSheet(
    Map<String, dynamic> machine,
  ) async {
    final result = await showModalBottomSheet<_ChargeConfirmationResult>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (BuildContext sheetContext) {
        return _ChargeConfirmationSheet(
          vacuum: _mapOrNull(_previewResponse?['vacuum']),
          machine: machine,
          onConfirm: () => _submitChargeForMachine(machine),
        );
      },
    );

    if (!mounted || result == null) {
      return;
    }

    if (result.selectAnotherMachine) {
      await _openMachineSelectionSheet();
      return;
    }

    final response = result.response;
    if (response == null) {
      return;
    }

    setState(() {
      _chargeResponse = response;
      _chargedMachine = machine;
      _errorMessage = null;
    });
    await _showChargeSuccessAndReturnHome(response, machine);
  }

  Future<Map<String, dynamic>> _submitChargeForMachine(
    Map<String, dynamic> machine,
  ) {
    final machineId = machine['id']?.toString();
    if (machineId == null || machineId.isEmpty) {
      throw ApiException(message: 'Selected machine is missing an id.');
    }

    final deviceId = ref.read(deviceIdProvider);
    return ref.read(apiClientProvider).postCharge(<String, dynamic>{
      'vacuumQr': _vacuumQrRaw,
      'machineId': machineId,
      'deviceId': deviceId,
    });
  }

  Future<void> _showChargeSuccessAndReturnHome(
    Map<String, dynamic> response,
    Map<String, dynamic> machine,
  ) async {
    final message = _chargeSuccessMessage(response, machine);
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
            '\u0395\u03C0\u03B9\u03C4\u03C5\u03C7\u03AE\u03C2 \u03A7\u03C1\u03AD\u03C9\u03C3\u03B7',
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

  String _chargeSuccessMessage(
    Map<String, dynamic> response,
    Map<String, dynamic> machine,
  ) {
    final responseVacuum = _mapOrNull(response['vacuum']);
    final previewVacuum = _mapOrNull(_previewResponse?['vacuum']);
    final responseMachine = _mapOrNull(response['machine']);
    final vacuumLabel = _displayValue(
      responseVacuum?['serialNumber'] ??
          responseVacuum?['code'] ??
          previewVacuum?['serialNumber'] ??
          previewVacuum?['code'] ??
          _vacuumQrRaw,
    );
    final machineLabel = _displayValue(
      responseMachine?['name'] ??
          responseMachine?['code'] ??
          machine['name'] ??
          machine['code'],
    );

    return '\u0397 \u03C7\u03C1\u03AD\u03C9\u03C3\u03B7 \u03C4\u03BF\u03C5 '
        'Vacuum $vacuumLabel \u03C3\u03C4\u03BF '
        '\u03BC\u03B7\u03C7\u03AC\u03BD\u03B7\u03BC\u03B1 $machineLabel '
        '\u03AD\u03B3\u03B9\u03BD\u03B5 \u03BC\u03B5 '
        '\u03B5\u03C0\u03B9\u03C4\u03C5\u03C7\u03AF\u03B1.';
  }

  void _startNewCharge() {
    _vacuumQrController.clear();
    setState(() {
      _previewResponse = null;
      _chargeResponse = null;
      _chargedMachine = null;
      _errorMessage = null;
    });
  }

  Future<void> _showPreviewDecisionDialog(Map<String, dynamic> preview) async {
    final decision = preview['decision']?.toString() ?? 'UNKNOWN';
    final message =
        preview['message']?.toString() ??
        '\u0394\u03B5\u03BD \u03B5\u03C0\u03B9\u03C4\u03C1\u03AD\u03C0\u03B5\u03C4\u03B1\u03B9 '
            '\u03C7\u03C1\u03AD\u03C9\u03C3\u03B7 \u03B3\u03B9\u03B1 \u03B1\u03C5\u03C4\u03CC '
            '\u03C4\u03BF Vacuum.';

    switch (decision) {
      case 'ALREADY_ACTIVE':
        await _showAlreadyActiveDialog();
        return;
      case 'IN_REPAIR':
        await _showInRepairDialog();
        return;
      case 'NOT_FUNCTIONAL':
        await _showNotFunctionalDialog(preview, message);
        return;
      case 'VACUUM_NOT_FOUND':
      case 'MACHINE_NOT_FOUND':
      case 'INVALID_REQUEST':
        await _showInvalidQrDialog(
          title: '\u039B\u03AC\u03B8\u03BF\u03C2 QR',
          message: message,
        );
        return;
      default:
        await _showInvalidQrDialog(
          title:
              '\u0394\u03B5\u03BD \u03B5\u03C0\u03B9\u03C4\u03C1\u03AD\u03C0\u03B5\u03C4\u03B1\u03B9 \u03C7\u03C1\u03AD\u03C9\u03C3\u03B7',
          message: message,
          clearAfterClose: false,
        );
    }
  }

  Future<void> _showInvalidQrDialog({
    required String title,
    required String message,
    bool clearAfterClose = true,
  }) async {
    await showDialog<void>(
      context: context,
      builder: (BuildContext dialogContext) {
        return AlertDialog(
          title: Text(title),
          content: Text(message),
          actions: <Widget>[
            ResponsiveDialogActions(
              children: <Widget>[
                FilledButton(
                  style: compactDialogButtonStyle(),
                  onPressed: () => Navigator.of(dialogContext).pop(),
                  child: const Text(
                    '\u039F\u039A',
                    textAlign: TextAlign.center,
                  ),
                ),
              ],
            ),
          ],
        );
      },
    );

    if (mounted && clearAfterClose) {
      _clearCurrentVacuum();
    }
  }

  Future<void> _showAlreadyActiveDialog() async {
    await showDialog<void>(
      context: context,
      builder: (BuildContext dialogContext) {
        return AlertDialog(
          title: _DialogTitleWithClose(
            title:
                '\u03A4\u03BF Vacuum \u03B5\u03AF\u03BD\u03B1\u03B9 \u03AE\u03B4\u03B7 \u03C7\u03C1\u03B5\u03C9\u03BC\u03AD\u03BD\u03BF',
            onClose: () => Navigator.of(dialogContext).pop(),
          ),
          content: const Text(
            '\u0388\u03C7\u03B5\u03B9 \u03B3\u03AF\u03BD\u03B5\u03B9 \u03AE\u03B4\u03B7 '
            '\u03C7\u03C1\u03AD\u03C9\u03C3\u03B7. \u0398\u03AD\u03BB\u03B5\u03C4\u03B5 '
            '\u03BD\u03B1 \u03B3\u03AF\u03BD\u03B5\u03B9 \u03B1\u03C0\u03BF\u03C7\u03C1\u03AD\u03C9\u03C3\u03B7 '
            '\u03AE \u03BD\u03B1 \u03C3\u03BA\u03B1\u03BD\u03B1\u03C1\u03B9\u03C3\u03C4\u03B5\u03AF '
            '\u03B5\u03BA \u03BD\u03AD\u03BF\u03C5 \u03BA\u03B1\u03B9\u03BD\u03BF\u03CD\u03C1\u03B9\u03BF Vacuum;',
          ),
          actions: <Widget>[
            ResponsiveDialogActions(
              children: <Widget>[
                FilledButton.tonal(
                  style: compactDialogButtonStyle(),
                  onPressed: () {
                    Navigator.of(dialogContext).pop();
                    GoRouter.maybeOf(context)?.go(
                      Uri(
                        path: '/decharge',
                        queryParameters: <String, String>{
                          'vacuumQr': _vacuumQrRaw,
                        },
                      ).toString(),
                    );
                  },
                  child: const Text(
                    '\u0391\u03C0\u03BF\u03C7\u03C1\u03AD\u03C9\u03C3\u03B7',
                    textAlign: TextAlign.center,
                  ),
                ),
                FilledButton(
                  style: compactDialogButtonStyle(),
                  onPressed: () {
                    Navigator.of(dialogContext).pop();
                    _clearAndScanAgain();
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

  Future<void> _showInRepairDialog() async {
    await showDialog<void>(
      context: context,
      builder: (BuildContext dialogContext) {
        return AlertDialog(
          title: _DialogTitleWithClose(
            title:
                '\u03A4\u03BF Vacuum \u03B2\u03C1\u03AF\u03C3\u03BA\u03B5\u03C4\u03B1\u03B9 \u03C3\u03B5 \u03B8\u03AD\u03C3\u03B7 \u03B5\u03C0\u03B9\u03C3\u03BA\u03B5\u03C5\u03AE\u03C2',
            onClose: () => Navigator.of(dialogContext).pop(),
          ),
          content: const Text(
            '\u03A4\u03BF Vacuum \u03B2\u03C1\u03AF\u03C3\u03BA\u03B5\u03C4\u03B1\u03B9 '
            '\u03C3\u03B5 \u03B8\u03AD\u03C3\u03B7 \u03B5\u03C0\u03B9\u03C3\u03BA\u03B5\u03C5\u03AE\u03C2. '
            '\u0398\u03AD\u03BB\u03B5\u03C4\u03B5 \u03BD\u03B1 \u03B3\u03AF\u03BD\u03B5\u03B9 '
            '\u0391\u03C0\u03BF\u03BA\u03B1\u03C4\u03AC\u03C3\u03C4\u03B1\u03C3\u03B7 \u0392\u03BB\u03AC\u03B2\u03B7\u03C2 '
            '\u03BA\u03B1\u03B9 \u03BD\u03B1 \u03B1\u03BB\u03BB\u03B1\u03C7\u03B8\u03B5\u03AF '
            '\u03B7 \u03B8\u03AD\u03C3\u03B7 \u03AE \u03BD\u03B1 \u03C3\u03BA\u03B1\u03BD\u03B1\u03C1\u03B9\u03C3\u03C4\u03B5\u03AF '
            '\u03B5\u03BA \u03BD\u03AD\u03BF\u03C5 \u03BA\u03B1\u03B9\u03BD\u03BF\u03CD\u03C1\u03B9\u03BF Vacuum;',
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
                    '\u0391\u03C0\u03BF\u03BA\u03B1\u03C4\u03AC\u03C3\u03C4\u03B1\u03C3\u03B7 \u03B2\u03BB\u03AC\u03B2\u03B7\u03C2',
                    textAlign: TextAlign.center,
                  ),
                ),
                FilledButton(
                  style: compactDialogButtonStyle(),
                  onPressed: () {
                    Navigator.of(dialogContext).pop();
                    _clearAndScanAgain();
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

  Future<void> _showNotFunctionalDialog(
    Map<String, dynamic> preview,
    String message,
  ) async {
    final vacuum = _mapOrNull(preview['vacuum']);
    final operationalStatus = _displayValue(vacuum?['operationalStatus']);
    await showDialog<void>(
      context: context,
      builder: (BuildContext dialogContext) {
        return AlertDialog(
          title: const Text(
            '\u0394\u03B5\u03BD \u03B5\u03C0\u03B9\u03C4\u03C1\u03AD\u03C0\u03B5\u03C4\u03B1\u03B9 \u03C7\u03C1\u03AD\u03C9\u03C3\u03B7',
          ),
          content: Text(
            operationalStatus == '-'
                ? message
                : '\u03A4\u03BF Vacuum \u03B4\u03B5\u03BD \u03B5\u03AF\u03BD\u03B1\u03B9 '
                      '\u03B4\u03B9\u03B1\u03B8\u03AD\u03C3\u03B9\u03BC\u03BF \u03B3\u03B9\u03B1 '
                      '\u03C7\u03C1\u03AD\u03C9\u03C3\u03B7.\nOperational status: $operationalStatus',
          ),
          actions: <Widget>[
            ResponsiveDialogActions(
              children: <Widget>[
                FilledButton(
                  style: compactDialogButtonStyle(),
                  onPressed: () => Navigator.of(dialogContext).pop(),
                  child: const Text(
                    '\u039F\u039A',
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

  void _clearCurrentVacuum() {
    _vacuumQrController.clear();
    _resetChargeState();
  }

  void _clearAndScanAgain() {
    _clearCurrentVacuum();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) {
        _scanVacuum();
      }
    });
  }

  void _resetChargeState() {
    setState(() {
      _previewResponse = null;
      _chargeResponse = null;
      _chargedMachine = null;
      _errorMessage = null;
    });
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return AppScreenScaffold(
      title: HomeScreen.chargeLabel,
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
                    HomeScreen.chargeLabel,
                    style: theme.textTheme.headlineSmall,
                  ),
                  const SizedBox(height: 8),
                  Text(
                    '\u03A3\u03BA\u03B1\u03BD\u03AC\u03C1\u03B5\u03C4\u03B5 '
                    'Vacuum \u03BA\u03B1\u03B9 \u03B5\u03C0\u03B9\u03BB\u03AD\u03BE\u03C4\u03B5 '
                    '\u03BC\u03B7\u03C7\u03AC\u03BD\u03B7\u03BC\u03B1 \u03C3\u03C4\u03BF '
                    '\u03B5\u03C0\u03CC\u03BC\u03B5\u03BD\u03BF \u03B2\u03AE\u03BC\u03B1.',
                    style: theme.textTheme.bodyMedium,
                  ),
                ],
              ),
            ),
          ),
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
                        key: const ValueKey<String>('charge-scan-button'),
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
                          key: const ValueKey<String>('charge-vacuum-input'),
                          controller: _vacuumQrController,
                          onChanged: (_) => _resetChargeState(),
                          onSubmitted: (_) {
                            if (!_isLoading) {
                              _runPreview();
                            }
                          },
                          decoration: const InputDecoration(
                            labelText:
                                '\u03A3\u03B5\u03B9\u03C1\u03B9\u03B1\u03BA\u03CC / QR',
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
                            'charge-manual-ok-button',
                          ),
                          onPressed: _isLoading ? null : _runPreview,
                          child: Text(_isLoading ? '...' : 'OK'),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  Text(
                    '\u03A4\u03BF OK \u03BA\u03AC\u03BD\u03B5\u03B9 \u03C4\u03BF\u03BD \u03AF\u03B4\u03B9\u03BF \u03AD\u03BB\u03B5\u03B3\u03C7\u03BF \u03BC\u03B5 \u03C4\u03BF \u03C3\u03BA\u03B1\u03BD\u03AC\u03C1\u03B9\u03C3\u03BC\u03B1.',
                    style: theme.textTheme.bodySmall,
                  ),
                ],
              ),
            ),
          ),
          if (_isLoading) ...<Widget>[
            const SizedBox(height: 16),
            const _LoadingCard(message: 'Checking backend preview...'),
          ],
          if (_errorMessage != null) ...<Widget>[
            const SizedBox(height: 16),
            _NoticeCard(
              color: const Color(0xFFFFF1F2),
              title: 'Connection or validation issue',
              message: _errorMessage!,
            ),
          ],
          if (_previewDecision == 'CAN_CHARGE') ...<Widget>[
            const SizedBox(height: 16),
            _NoticeCard(
              title:
                  '\u0395\u03C0\u03CC\u03BC\u03B5\u03BD\u03BF \u03B2\u03AE\u03BC\u03B1',
              message:
                  '\u0395\u03C0\u03B9\u03BB\u03AD\u03BE\u03C4\u03B5 \u03B4\u03B9\u03B1\u03B8\u03AD\u03C3\u03B9\u03BC\u03BF '
                  '\u03BC\u03B7\u03C7\u03AC\u03BD\u03B7\u03BC\u03B1 \u03B1\u03C0\u03CC '
                  '\u03C4\u03BF \u03C0\u03B1\u03C1\u03AC\u03B8\u03C5\u03C1\u03BF '
                  '\u03B5\u03C0\u03B9\u03BB\u03BF\u03B3\u03AE\u03C2.',
              action: FilledButton.icon(
                key: const ValueKey<String>('charge-open-machine-modal-button'),
                onPressed: _isLoading ? null : _openMachineSelectionSheet,
                icon: const Icon(Icons.precision_manufacturing_outlined),
                label: const Text(
                  '\u0395\u03C0\u03B9\u03BB\u03BF\u03B3\u03AE \u03BC\u03B7\u03C7\u03B1\u03BD\u03AE\u03BC\u03B1\u03C4\u03BF\u03C2',
                ),
              ),
            ),
          ],
          if (_chargeResponse != null) ...<Widget>[
            const SizedBox(height: 16),
            _ChargeResultCard(
              response: _chargeResponse!,
              chargedMachine: _chargedMachine,
              successMessage: _isChargeSuccess
                  ? _chargeSuccessMessage(
                      _chargeResponse!,
                      _chargedMachine ?? <String, dynamic>{},
                    )
                  : null,
              onNewCharge: _startNewCharge,
              onGoHome: () => context.go('/'),
            ),
          ],
        ],
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
          key: const ValueKey<String>('charge-dialog-close-button'),
          tooltip: '\u039A\u03BB\u03B5\u03AF\u03C3\u03B9\u03BC\u03BF',
          onPressed: onClose,
          icon: const Icon(Icons.close),
        ),
      ],
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
              '\u0395\u03C0\u03B9\u03BB\u03AD\u03BE\u03C4\u03B5 \u03AD\u03BD\u03B1 '
              '\u03BC\u03B7\u03C7\u03AC\u03BD\u03B7\u03BC\u03B1. '
              '\u03A4\u03B1 \u03BA\u03B1\u03C4\u03B5\u03B9\u03BB\u03B7\u03BC\u03BC\u03AD\u03BD\u03B1 '
              '\u03B5\u03BC\u03C6\u03B1\u03BD\u03AF\u03B6\u03BF\u03BD\u03C4\u03B1\u03B9 '
              '\u03BC\u03B5 \u03B1\u03BD\u03BF\u03B9\u03C7\u03C4\u03CC '
              '\u03BA\u03CC\u03BA\u03BA\u03B9\u03BD\u03BF.',
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
                      title: 'Machine list unavailable',
                      message: snapshot.error.toString(),
                    );
                  }

                  final machines = snapshot.data ?? <Map<String, dynamic>>[];
                  if (machines.isEmpty) {
                    return const _NoticeCard(
                      title:
                          '\u0394\u03B5\u03BD \u03B2\u03C1\u03AD\u03B8\u03B7\u03BA\u03B1\u03BD '
                          '\u03BC\u03B7\u03C7\u03B1\u03BD\u03AE\u03BC\u03B1\u03C4\u03B1.',
                      message:
                          'Ελέγξτε τα master data ή τη σύνδεση με backend.',
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
      key: ValueKey<String>('charge-machine-card-$machineId'),
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
                            label: const Text('Σε χρήση'),
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

class _ChargeConfirmationSheet extends StatefulWidget {
  const _ChargeConfirmationSheet({
    required this.vacuum,
    required this.machine,
    required this.onConfirm,
  });

  final Map<String, dynamic>? vacuum;
  final Map<String, dynamic> machine;
  final Future<Map<String, dynamic>> Function() onConfirm;

  @override
  State<_ChargeConfirmationSheet> createState() =>
      _ChargeConfirmationSheetState();
}

class _ChargeConfirmationSheetState extends State<_ChargeConfirmationSheet> {
  bool _isSubmitting = false;
  String? _errorMessage;
  Map<String, dynamic>? _errorPayload;

  Future<void> _confirm() async {
    if (_isSubmitting) {
      return;
    }

    setState(() {
      _isSubmitting = true;
      _errorMessage = null;
      _errorPayload = null;
    });

    try {
      final response = await widget.onConfirm();
      if (!mounted) {
        return;
      }

      if (response['ok'] == true && response['decision'] == 'CHARGED') {
        Navigator.of(context).pop<_ChargeConfirmationResult>(
          _ChargeConfirmationResult.success(response),
        );
        return;
      }

      setState(() {
        _errorPayload = response;
        _errorMessage =
            response['message']?.toString() ??
            'The charge request could not be completed.';
      });
    } on ApiException catch (error) {
      if (!mounted) {
        return;
      }

      setState(() {
        _errorPayload = error.payload;
        _errorMessage = mapApiError(error);
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
    final theme = Theme.of(context);

    return Padding(
      padding: EdgeInsets.only(
        left: 16,
        top: 16,
        right: 16,
        bottom: MediaQuery.viewInsetsOf(context).bottom + 24,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Text(
            '\u0395\u03C0\u03B9\u03B2\u03B5\u03B2\u03B1\u03AF\u03C9\u03C3\u03B7 \u03A7\u03C1\u03AD\u03C9\u03C3\u03B7\u03C2',
            style: theme.textTheme.headlineSmall,
          ),
          const SizedBox(height: 16),
          _DetailTable(
            title: 'Vacuum',
            rows: <MapEntry<String, String>>[
              MapEntry('Serial', _displayValue(widget.vacuum?['serialNumber'])),
              MapEntry('Code', _displayValue(widget.vacuum?['code'])),
              MapEntry(
                'Description',
                _displayValue(widget.vacuum?['description']),
              ),
            ],
          ),
          const SizedBox(height: 16),
          _DetailTable(
            title: 'Machine',
            rows: <MapEntry<String, String>>[
              MapEntry('Code', _displayValue(widget.machine['code'])),
              MapEntry('Name', _displayValue(widget.machine['name'])),
              MapEntry('Project', _displayValue(widget.machine['project'])),
            ],
          ),
          if (_errorMessage != null) ...<Widget>[
            const SizedBox(height: 16),
            _NoticeCard(
              color: const Color(0xFFFFF1F2),
              title: _displayValue(_errorPayload?['decision']) == '-'
                  ? 'Charge failed'
                  : _displayValue(_errorPayload?['decision']),
              message: _errorMessage!,
              action: TextButton.icon(
                onPressed: _isSubmitting
                    ? null
                    : () =>
                          Navigator.of(context).pop<_ChargeConfirmationResult>(
                            const _ChargeConfirmationResult.selectAnother(),
                          ),
                icon: const Icon(Icons.swap_horiz),
                label: const Text(
                  '\u0395\u03C0\u03B9\u03BB\u03BF\u03B3\u03AE \u03AC\u03BB\u03BB\u03BF\u03C5 '
                  '\u03BC\u03B7\u03C7\u03B1\u03BD\u03AE\u03BC\u03B1\u03C4\u03BF\u03C2',
                ),
              ),
            ),
          ],
          const SizedBox(height: 20),
          Row(
            children: <Widget>[
              Expanded(
                child: OutlinedButton(
                  onPressed: _isSubmitting
                      ? null
                      : () => Navigator.of(context).pop(),
                  child: const Text('\u0386\u03BA\u03C5\u03C1\u03BF'),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: FilledButton.icon(
                  key: const ValueKey<String>('charge-modal-confirm-button'),
                  onPressed: _isSubmitting ? null : _confirm,
                  icon: _isSubmitting
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.check_circle_outline),
                  label: Text(
                    _isSubmitting
                        ? 'Charging...'
                        : '\u03A7\u03A1\u0395\u03A9\u03A3\u0397',
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _ChargeConfirmationResult {
  const _ChargeConfirmationResult.success(this.response)
    : selectAnotherMachine = false;

  const _ChargeConfirmationResult.selectAnother()
    : response = null,
      selectAnotherMachine = true;

  final Map<String, dynamic>? response;
  final bool selectAnotherMachine;
}

class _ChargeResultCard extends StatelessWidget {
  const _ChargeResultCard({
    required this.response,
    required this.onNewCharge,
    required this.onGoHome,
    this.chargedMachine,
    this.successMessage,
  });

  final Map<String, dynamic> response;
  final Map<String, dynamic>? chargedMachine;
  final String? successMessage;
  final VoidCallback onNewCharge;
  final VoidCallback onGoHome;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isSuccess =
        response['ok'] == true && response['decision']?.toString() == 'CHARGED';
    final chipColor = _decisionColor(response['decision']?.toString() ?? '');
    final responseMachine = _mapOrNull(response['machine']);

    return Card(
      color: isSuccess ? const Color(0xFFDDF6E8) : null,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Row(
              children: <Widget>[
                Text(
                  isSuccess ? 'Charge completed' : 'Charge result',
                  style: theme.textTheme.titleMedium,
                ),
                const SizedBox(width: 12),
                Chip(
                  backgroundColor: chipColor,
                  label: Text(response['decision']?.toString() ?? 'UNKNOWN'),
                ),
              ],
            ),
            const SizedBox(height: 12),
            Text(
              successMessage ??
                  response['message']?.toString() ??
                  (isSuccess
                      ? 'Vacuum was charged successfully.'
                      : 'The charge request could not be completed.'),
            ),
            if (isSuccess) ...<Widget>[
              const SizedBox(height: 16),
              _DetailTable(
                title: 'Vacuum',
                rows: <MapEntry<String, String>>[
                  MapEntry(
                    'Code',
                    _displayValue(_mapOrNull(response['vacuum'])?['code']),
                  ),
                  MapEntry(
                    'Serial',
                    _displayValue(
                      _mapOrNull(response['vacuum'])?['serialNumber'],
                    ),
                  ),
                  MapEntry(
                    'Machine',
                    _displayValue(
                      responseMachine?['name'] ??
                          responseMachine?['code'] ??
                          chargedMachine?['name'] ??
                          chargedMachine?['code'],
                    ),
                  ),
                  MapEntry(
                    'Charged at',
                    _displayValue(
                      _mapOrNull(response['chargeSession'])?['chargedAt'],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 16),
              Wrap(
                spacing: 12,
                runSpacing: 12,
                children: <Widget>[
                  FilledButton.tonal(
                    onPressed: onNewCharge,
                    child: const Text(
                      '\u039D\u03AD\u03B1 \u03A7\u03C1\u03AD\u03C9\u03C3\u03B7',
                    ),
                  ),
                  FilledButton(
                    onPressed: onGoHome,
                    child: const Text(
                      '\u0395\u03C0\u03B9\u03C3\u03C4\u03C1\u03BF\u03C6\u03AE '
                      '\u03C3\u03C4\u03B7\u03BD \u03B1\u03C1\u03C7\u03B9\u03BA\u03AE',
                    ),
                  ),
                ],
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
    this.action,
  });

  final String title;
  final String message;
  final Color color;
  final Widget? action;

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
            if (action != null) ...<Widget>[
              const SizedBox(height: 12),
              action!,
            ],
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

Map<String, dynamic>? _mapOrNull(dynamic value) {
  if (value is Map<dynamic, dynamic>) {
    return Map<String, dynamic>.from(value);
  }

  return null;
}

String _displayValue(dynamic value) {
  final text = value?.toString().trim();
  if (text == null || text.isEmpty || text == 'null') {
    return '-';
  }

  return text;
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
    case 'CAN_CHARGE':
    case 'CHARGED':
      return const Color(0xFFDDF6E8);
    case 'ALREADY_ACTIVE':
    case 'IN_REPAIR':
    case 'MACHINE_OCCUPIED':
      return const Color(0xFFFFE7C2);
    case 'NOT_FUNCTIONAL':
    case 'VACUUM_NOT_FOUND':
    case 'MACHINE_NOT_FOUND':
    case 'INVALID_REQUEST':
      return const Color(0xFFFFE3E3);
    default:
      return const Color(0xFFF1F5F9);
  }
}
