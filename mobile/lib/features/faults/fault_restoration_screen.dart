import 'dart:async';
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

typedef RestorationPhotoPicker = Future<XFile?> Function(ImageSource source);

typedef RestorationPhotoUploader =
    Future<Map<String, dynamic>> Function({
      required String repairId,
      required String filePath,
      required String fileName,
      required String contentType,
      required String deviceId,
      String? operatorName,
      String? caption,
      required String stage,
    });

class FaultRestorationScreen extends ConsumerStatefulWidget {
  const FaultRestorationScreen({
    super.key,
    this.pickPhoto,
    this.uploadPhoto,
  });

  final RestorationPhotoPicker? pickPhoto;
  final RestorationPhotoUploader? uploadPhoto;

  @override
  ConsumerState<FaultRestorationScreen> createState() =>
      _FaultRestorationScreenState();
}

class _FaultRestorationScreenState
    extends ConsumerState<FaultRestorationScreen> {
  final TextEditingController _vacuumQrController = TextEditingController();
  final ImagePicker _imagePicker = ImagePicker();
  String? _rackQrRaw;
  Map<String, dynamic>? _rackPreviewResponse;
  bool _isLoading = false;
  String? _errorMessage;

  @override
  void dispose() {
    _vacuumQrController.dispose();
    super.dispose();
  }

  String get _vacuumQrRaw => _vacuumQrController.text.trim();

  Future<void> _scanVacuum() async {
    final scannedValue = await QrScannerScreen.scanForRaw(
      context,
      title: HomeScreen.faultRestorationLabel,
      description:
          'Scan the repaired Vacuum QR and return the raw value to the restoration workflow.',
    );

    if (!mounted || scannedValue == null || scannedValue.trim().isEmpty) {
      return;
    }

    _vacuumQrController.text = scannedValue.trim();
    _resetFlow();
    await _previewVacuum();
  }

  Future<void> _scanRack() async {
    final scannedValue = await QrScannerScreen.scanForRaw(
      context,
      title: 'Σκανάρισμα Θέσης Rack',
      description:
          'Scan the AVL Rack position QR that will receive the restored vacuum.',
    );

    if (!mounted || scannedValue == null || scannedValue.trim().isEmpty) {
      return;
    }

    await _previewRack(scannedValue.trim());
  }

  Future<void> _previewVacuum() async {
    if (_vacuumQrRaw.isEmpty) {
      await _showSingleActionDialog(
        title: 'Λάθος QR',
        message: 'Δεν βρέθηκε Vacuum για αυτό το QR/Serial.',
        actionLabel: 'ΟΚ',
        onAction: _clearVacuum,
      );
      return;
    }

    Map<String, dynamic>? responseForDialog;

    setState(() {
      _isLoading = true;
      _errorMessage = null;
      _rackPreviewResponse = null;
      _rackQrRaw = null;
    });

    try {
      final deviceId = ref.read(deviceIdProvider);
      final response = await ref
          .read(apiClientProvider)
          .postFaultRestorationPreview(<String, dynamic>{
            'vacuumQr': _vacuumQrRaw,
            'deviceId': deviceId,
          });

      if (!mounted) {
        return;
      }

      responseForDialog = response;
    } on ApiException catch (error) {
      if (!mounted) {
        return;
      }

      setState(() {
        if (error.payload != null) {
          _errorMessage = null;
        } else {
          _errorMessage = mapApiError(error);
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
      await _handleVacuumPreviewResult(responseForDialog);
    }
  }

  Future<void> _handleVacuumPreviewResult(Map<String, dynamic> preview) async {
    final decision = preview['decision']?.toString() ?? 'UNKNOWN';
    final message = preview['message']?.toString();

    switch (decision) {
      case 'SELECT_RACK':
        await _showRackInputDialog();
        return;
      case 'NOT_IN_REPAIR':
        await _showSingleActionDialog(
          title: 'Δεν είναι σε επισκευή',
          message: message ?? 'Το Vacuum δεν βρίσκεται σε κατάσταση επισκευής.',
          actionLabel: 'ΟΚ',
          onAction: () {},
        );
        return;
      case 'ACTIVE_MUST_DECHARGE_FIRST':
        await _showSingleActionDialog(
          title: 'Απαιτείται αποχρέωση',
          message:
              message ??
              'Το Vacuum πρέπει πρώτα να αποχρεωθεί από το μηχάνημα.',
          actionLabel: 'Αποχρέωση',
          onAction: () => GoRouter.maybeOf(
            context,
          )?.go('/decharge?vacuumQr=${Uri.encodeComponent(_vacuumQrRaw)}'),
        );
        return;
      case 'REPAIR_NOT_FOUND':
        await _showSingleActionDialog(
          title: 'Δεν βρέθηκε επισκευή',
          message: message ?? 'Δεν υπάρχει ενεργή επισκευή για αυτό το Vacuum.',
          actionLabel: 'ΟΚ',
          onAction: () {},
        );
        return;
      case 'VACUUM_NOT_FOUND':
      case 'INVALID_REQUEST':
        await _showSingleActionDialog(
          title: 'Λάθος QR',
          message: message ?? 'Δεν βρέθηκε Vacuum για αυτό το QR/Serial.',
          actionLabel: 'ΟΚ',
          onAction: _clearVacuum,
        );
        return;
      default:
        await _showSingleActionDialog(
          title: 'Δεν επιτρέπεται αποκατάσταση',
          message:
              message ?? 'Δεν είναι δυνατή η αποκατάσταση για αυτό το Vacuum.',
          actionLabel: 'ΟΚ',
          onAction: () {},
        );
    }
  }

  Future<void> _showRackInputDialog() async {
    String manualRackQr = '';
    String? validationMessage;

    final rackQr = await showDialog<String>(
      context: context,
      builder: (BuildContext dialogContext) {
        return StatefulBuilder(
          builder: (BuildContext context, StateSetter dialogSetState) {
            void submitManualRack() {
              final value = manualRackQr.trim();
              if (value.isEmpty) {
                dialogSetState(() {
                  validationMessage = 'Συμπληρώστε QR Θέσης Rack.';
                });
                return;
              }

              Navigator.of(dialogContext).pop(value);
            }

            return AlertDialog(
              title: _DialogTitleWithClose(
                title: 'Σάρωση νέας θέσης',
                onClose: () => Navigator.of(dialogContext).pop(),
              ),
              content: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
                  const Text(
                    'Σκανάρετε ή εισάγετε τη νέα θέση όπου θα τοποθετηθεί το Vacuum.',
                  ),
                  const SizedBox(height: 16),
                  FilledButton.icon(
                    key: const ValueKey<String>(
                      'fault-restoration-scan-rack-button',
                    ),
                    onPressed: () {
                      Navigator.of(dialogContext).pop('__SCAN__');
                    },
                    icon: const Icon(Icons.qr_code_2_outlined),
                    label: const Text('Σάρωση θέσης'),
                  ),
                  const SizedBox(height: 16),
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: <Widget>[
                      Expanded(
                        child: TextField(
                          key: const ValueKey<String>(
                            'fault-restoration-rack-input',
                          ),
                          onChanged: (String value) {
                            manualRackQr = value;
                          },
                          onSubmitted: (String value) {
                            manualRackQr = value;
                            submitManualRack();
                          },
                          decoration: InputDecoration(
                            labelText: 'QR Θέσης Rack',
                            hintText: 'RACK:RACK-A-01-07',
                            border: const OutlineInputBorder(),
                            errorText: validationMessage,
                          ),
                        ),
                      ),
                      const SizedBox(width: 12),
                      SizedBox(
                        height: 56,
                        child: FilledButton(
                          key: const ValueKey<String>(
                            'fault-restoration-rack-ok-button',
                          ),
                          onPressed: submitManualRack,
                          child: const Text('OK'),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            );
          },
        );
      },
    );

    if (!mounted || rackQr == null || rackQr.isEmpty) {
      return;
    }

    if (rackQr == '__SCAN__') {
      await _scanRack();
      return;
    }

    await _previewRack(rackQr);
  }

  Future<void> _previewRack(String rackQr) async {
    Map<String, dynamic>? responseForDialog;

    setState(() {
      _isLoading = true;
      _errorMessage = null;
      _rackPreviewResponse = null;
      _rackQrRaw = rackQr.trim();
    });

    try {
      final deviceId = ref.read(deviceIdProvider);
      final response = await ref
          .read(apiClientProvider)
          .postFaultRestorationPreview(<String, dynamic>{
            'vacuumQr': _vacuumQrRaw,
            'rackQr': _rackQrRaw,
            'deviceId': deviceId,
          });

      if (!mounted) {
        return;
      }

      setState(() {
        _rackPreviewResponse = response;
      });
      responseForDialog = response;
    } on ApiException catch (error) {
      if (!mounted) {
        return;
      }

      setState(() {
        if (error.payload != null) {
          _rackPreviewResponse = error.payload;
          _errorMessage = null;
        } else {
          _errorMessage = mapApiError(error);
          _rackPreviewResponse = null;
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
      await _handleRackPreviewResult(responseForDialog);
    }
  }

  Future<void> _handleRackPreviewResult(Map<String, dynamic> preview) async {
    final decision = preview['decision']?.toString() ?? 'UNKNOWN';
    final message = preview['message']?.toString();

    switch (decision) {
      case 'CAN_RESTORE':
        await _showOutcomeDialog(preview);
        return;
      case 'RACK_NOT_ALLOWED':
        await _showSingleActionDialog(
          title: 'Λάθος θέση',
          message:
              message ?? 'Η αποκατάσταση πρέπει να γίνει σε θέση AVL, όχι REP.',
          actionLabel: 'Άλλη θέση',
          onAction: () => _showRackInputDialog(),
        );
        return;
      case 'RACK_OCCUPIED':
        await _showSingleActionDialog(
          title: 'Η θέση είναι κατειλημμένη',
          message: message ?? 'Σκανάρετε άλλη διαθέσιμη θέση.',
          actionLabel: 'Άλλη θέση',
          onAction: () => _showRackInputDialog(),
        );
        return;
      case 'RACK_NOT_FOUND':
      case 'INVALID_REQUEST':
        await _showSingleActionDialog(
          title: 'Λάθος QR θέσης',
          message: message ?? 'Δεν βρέθηκε θέση Rack για αυτό το QR.',
          actionLabel: 'Άλλη θέση',
          onAction: () => _showRackInputDialog(),
        );
        return;
      default:
        await _showSingleActionDialog(
          title: 'Δεν επιτρέπεται αποκατάσταση',
          message:
              message ?? 'Δεν είναι δυνατή η αποκατάσταση σε αυτή τη θέση.',
          actionLabel: 'ΟΚ',
          onAction: () {},
        );
    }
  }

  Future<void> _showOutcomeDialog(Map<String, dynamic> preview) async {
    var selectedOutcome = 'RETURNED_TO_SERVICE';
    var isSubmitting = false;
    String? validationMessage;

    await showDialog<void>(
      context: context,
      barrierDismissible: false,
      builder: (BuildContext dialogContext) {
        return StatefulBuilder(
          builder: (BuildContext context, StateSetter dialogSetState) {
            Future<void> submitRestoration() async {
              if (isSubmitting) {
                return;
              }

              dialogSetState(() {
                isSubmitting = true;
                validationMessage = null;
              });

              try {
                final repairId = _repairIdFromPreview(preview);
                if (repairId == null || repairId.isEmpty) {
                  dialogSetState(() {
                    validationMessage =
                        'Δεν βρέθηκε Repair ID για την αποθήκευση φωτογραφιών αποκατάστασης.';
                  });
                  return;
                }

                final photoCount =
                    await _showRequiredCompletionPhotoUploadDialog(
                  repairId: repairId,
                );

                if (!mounted || !dialogContext.mounted) {
                  return;
                }

                if (photoCount == null) {
                  dialogSetState(() {
                    validationMessage =
                        'Απαιτείται τουλάχιστον 1 φωτογραφία αποκατάστασης.';
                  });
                  return;
                }

                final deviceId = ref.read(deviceIdProvider);
                final response = await ref
                    .read(apiClientProvider)
                    .postFaultRestoration(<String, dynamic>{
                      'vacuumQr': _vacuumQrRaw,
                      'rackQr': _rackQrRaw,
                      'outcome': selectedOutcome,
                      'deviceId': deviceId,
                    });

                if (!mounted || !dialogContext.mounted) {
                  return;
                }

                if (response['ok'] == true) {
                  Navigator.of(dialogContext).pop();
                  await _showSuccessAndReturnHome(response);
                  return;
                }

                dialogSetState(() {
                  validationMessage =
                      response['message']?.toString() ??
                      'Η αποκατάσταση δεν ολοκληρώθηκε.';
                });
              } on ApiException catch (error) {
                if (!dialogContext.mounted) {
                  return;
                }

                dialogSetState(() {
                  validationMessage = mapApiError(error);
                });
              } finally {
                if (dialogContext.mounted) {
                  dialogSetState(() {
                    isSubmitting = false;
                  });
                }
              }
            }

            final vacuum = _mapOrNull(preview['vacuum']);
            final rack = _mapOrNull(preview['rack']);

            return AlertDialog(
              title: _DialogTitleWithClose(
                title: 'Αποκατάσταση Βλάβης',
                onClose: () => Navigator.of(dialogContext).pop(),
              ),
              content: SizedBox(
                width: double.maxFinite,
                child: SingleChildScrollView(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: <Widget>[
                      _SummaryBlock(
                        title: 'Vacuum',
                        values: <String>[
                          _displayValue(
                            vacuum?['serialNumber'] ?? vacuum?['code'],
                          ),
                          _displayValue(vacuum?['description']),
                        ],
                      ),
                      const SizedBox(height: 12),
                      _SummaryBlock(
                        title: 'Rack',
                        values: <String>[
                          _displayValue(rack?['label']),
                          _displayValue(rack?['code']),
                        ],
                      ),
                      const SizedBox(height: 16),
                      ..._outcomes.map((MapEntry<String, String> outcome) {
                        return Card(
                          key: ValueKey<String>(
                            'fault-restoration-outcome-${outcome.key}',
                          ),
                          child: ListTile(
                            onTap: isSubmitting
                                ? null
                                : () {
                                    dialogSetState(() {
                                      selectedOutcome = outcome.key;
                                      validationMessage = null;
                                    });
                                  },
                            title: Text(outcome.value),
                            subtitle: Text(outcome.key),
                            trailing: selectedOutcome == outcome.key
                                ? const Icon(Icons.check_circle)
                                : const Icon(Icons.circle_outlined),
                          ),
                        );
                      }),
                      if (validationMessage != null) ...<Widget>[
                        const SizedBox(height: 12),
                        Text(
                          validationMessage!,
                          style: TextStyle(
                            color: Theme.of(context).colorScheme.error,
                          ),
                        ),
                      ],
                      if (isSubmitting) ...<Widget>[
                        const SizedBox(height: 12),
                        const LinearProgressIndicator(),
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
                        'fault-restoration-confirm-button',
                      ),
                      style: compactDialogButtonStyle(),
                      onPressed: isSubmitting ? null : submitRestoration,
                      child: Text(
                        isSubmitting ? '...' : 'ΑΠΟΚΑΤΑΣΤΑΣΗ',
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

  Future<int?> _showRequiredCompletionPhotoUploadDialog({
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
                  final photo = await _pickCompletionPhoto(ImageSource.camera);
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
                        'Δεν ήταν δυνατή η λήψη φωτογραφίας. Ελέγξτε τα δικαιώματα κάμερας και δοκιμάστε ξανά.';
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
                        'Τραβήξτε φωτογραφία και ελέγξτε την προεπισκόπηση πριν την καταχώρηση.';
                  });
                  return;
                }

                final contentType = _contentTypeForPhoto(photo);
                if (contentType == null) {
                  dialogSetState(() {
                    validationMessage =
                        'Υποστηρίζονται μόνο φωτογραφίες JPEG, PNG ή WebP.';
                  });
                  return;
                }

                dialogSetState(() {
                  isUploading = true;
                  validationMessage = null;
                });

                try {
                  final response = await _uploadCompletionPhoto(
                    repairId: repairId,
                    photo: photo,
                    contentType: contentType,
                    caption:
                        'Repair completion photo ${uploadedPhotos.length + 1}',
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
                        'Η καταχώρηση φωτογραφίας απέτυχε. Ελέγξτε τη σύνδεση και δοκιμάστε ξανά.';
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
                        'Απαιτείται τουλάχιστον 1 φωτογραφία αποκατάστασης.';
                  });
                  return;
                }

                if (selectedPhoto != null) {
                  dialogSetState(() {
                    validationMessage =
                        'Καταχωρήστε ή αφαιρέστε την τρέχουσα φωτογραφία πριν την ολοκλήρωση.';
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
                key: const ValueKey<String>(
                  'fault-restoration-photo-dialog',
                ),
                title: const Text('Φωτογραφίες αποκατάστασης'),
                content: SizedBox(
                  width: double.maxFinite,
                  child: SingleChildScrollView(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: <Widget>[
                        Text(
                          'Τραβήξτε 1 έως 5 φωτογραφίες πριν την αποκατάσταση. Κάθε φωτογραφία εμφανίζεται για προεπισκόπηση πριν καταχωρηθεί.',
                          style: Theme.of(context).textTheme.bodyMedium,
                        ),
                        const SizedBox(height: 12),
                        Text(
                          '${uploadedPhotos.length}/5 φωτογραφίες καταχωρημένες',
                          key: const ValueKey<String>(
                            'fault-restoration-photo-count-label',
                          ),
                          style: Theme.of(context).textTheme.titleSmall,
                        ),
                        const SizedBox(height: 16),
                        if (selectedPhoto == null && uploadedPhotos.length < 5)
                          FilledButton.icon(
                            key: const ValueKey<String>(
                              'fault-restoration-photo-camera-button',
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
                                  ? 'Άνοιγμα κάμερας...'
                                  : 'Λήψη φωτογραφίας',
                            ),
                          ),
                        if (selectedPhoto != null) ...<Widget>[
                          _CompletionPhotoPreview(photo: selectedPhoto!),
                          const SizedBox(height: 12),
                          Wrap(
                            spacing: 12,
                            runSpacing: 12,
                            children: <Widget>[
                              FilledButton.icon(
                                key: const ValueKey<String>(
                                  'fault-restoration-photo-upload-button',
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
                                      ? 'Καταχώρηση...'
                                      : 'Καταχώρηση φωτογραφίας',
                                ),
                              ),
                              OutlinedButton.icon(
                                key: const ValueKey<String>(
                                  'fault-restoration-photo-remove-button',
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
                                label: const Text('Αφαίρεση'),
                              ),
                            ],
                          ),
                        ],
                        if (uploadedPhotos.isNotEmpty) ...<Widget>[
                          const SizedBox(height: 16),
                          ...uploadedPhotos.asMap().entries.map(
                            (entry) => ListTile(
                              key: ValueKey<String>(
                                'fault-restoration-photo-uploaded-${entry.key}',
                              ),
                              contentPadding: EdgeInsets.zero,
                              leading: const Icon(Icons.check_circle_outline),
                              title: Text('Φωτογραφία ${entry.key + 1}'),
                              subtitle: const Text(
                                'Καταχωρήθηκε ως φωτογραφία αποκατάστασης',
                              ),
                            ),
                          ),
                        ],
                        if (uploadedPhotos.length >= 5) ...<Widget>[
                          const SizedBox(height: 12),
                          const Text(
                            'Έχετε φτάσει το όριο των 5 φωτογραφιών.',
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
                          'fault-restoration-photo-finish-button',
                        ),
                        style: compactDialogButtonStyle(),
                        onPressed: canFinish ? finish : null,
                        child: const Text(
                          'ΟΛΟΚΛΗΡΩΣΗ',
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

  Future<XFile?> _pickCompletionPhoto(ImageSource source) {
    final picker = widget.pickPhoto;
    if (picker != null) {
      return picker(source);
    }

    return _imagePicker.pickImage(
      source: source,
      imageQuality: 85,
      maxWidth: 1600,
    );
  }

  Future<Map<String, dynamic>> _uploadCompletionPhoto({
    required String repairId,
    required XFile photo,
    required String contentType,
    required String caption,
  }) {
    final uploader = widget.uploadPhoto;
    final deviceId = ref.read(deviceIdProvider);

    if (uploader != null) {
      return uploader(
        repairId: repairId,
        filePath: photo.path,
        fileName: _fileNameForPhoto(photo),
        contentType: contentType,
        deviceId: deviceId,
        caption: caption,
        stage: 'REPAIR_COMPLETION',
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
          stage: 'REPAIR_COMPLETION',
        );
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

  Future<void> _showSuccessAndReturnHome(Map<String, dynamic> response) async {
    final vacuum = _mapOrNull(response['vacuum']);
    final rack =
        _mapOrNull(response['rack']) ??
        _mapOrNull(_rackPreviewResponse?['rack']);
    final vacuumLabel = _displayValue(
      vacuum?['serialNumber'] ?? vacuum?['code'] ?? _vacuumQrRaw,
    );
    final rackLabel = _displayValue(
      rack?['label'] ?? rack?['code'] ?? _rackQrRaw,
    );

    if (!mounted) {
      return;
    }

    unawaited(
      showDialog<void>(
        context: context,
        barrierDismissible: false,
        builder: (_) => AlertDialog(
          icon: const Icon(Icons.check_circle_outline),
          title: const Text('Η αποκατάσταση ολοκληρώθηκε'),
          content: Text(
            'Η αποκατάσταση του Vacuum $vacuumLabel ολοκληρώθηκε και τοποθετήθηκε στη θέση $rackLabel.',
          ),
        ),
      ),
    );

    await Future<void>.delayed(const Duration(seconds: 5));

    if (!mounted) {
      return;
    }

    final navigator = Navigator.of(context, rootNavigator: true);
    if (navigator.canPop()) {
      navigator.pop();
    }

    GoRouter.maybeOf(context)?.go('/');
  }

  void _resetFlow() {
    setState(() {
      _rackQrRaw = null;
      _rackPreviewResponse = null;
      _errorMessage = null;
    });
  }

  void _clearVacuum() {
    _vacuumQrController.clear();
    _resetFlow();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return AppScreenScaffold(
      title: HomeScreen.faultRestorationLabel,
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
                    HomeScreen.faultRestorationLabel,
                    style: theme.textTheme.headlineSmall,
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'Σκανάρετε Vacuum προς επισκευή για να ξεκινήσει η αποκατάσταση.',
                    style: theme.textTheme.bodyMedium,
                  ),
                ],
              ),
            ),
          ),
          if (_isLoading) ...<Widget>[
            const SizedBox(height: 16),
            const _LoadingCard(message: 'Έλεγχος στοιχείων...'),
          ],
          const SizedBox(height: 16),
          _VacuumInputCard(
            controller: _vacuumQrController,
            isLoading: _isLoading,
            onScan: _scanVacuum,
            onSubmit: _previewVacuum,
            onChanged: _resetFlow,
          ),
          if (_errorMessage != null) ...<Widget>[
            const SizedBox(height: 16),
            _NoticeCard(
              color: const Color(0xFFFFF1F2),
              title: 'Πρόβλημα ελέγχου',
              message: _errorMessage!,
            ),
          ],
        ],
      ),
    );
  }
}

class _VacuumInputCard extends StatelessWidget {
  const _VacuumInputCard({
    required this.controller,
    required this.isLoading,
    required this.onScan,
    required this.onSubmit,
    required this.onChanged,
  });

  final TextEditingController controller;
  final bool isLoading;
  final VoidCallback onScan;
  final VoidCallback onSubmit;
  final VoidCallback onChanged;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Text('Vacuum', style: theme.textTheme.titleMedium),
            const SizedBox(height: 8),
            Text(
              'Σκανάρετε ή πληκτρολογήστε σειριακό / QR.',
              style: theme.textTheme.bodyMedium,
            ),
            const SizedBox(height: 12),
            FilledButton.icon(
              key: const ValueKey<String>(
                'fault-restoration-scan-vacuum-button',
              ),
              onPressed: isLoading ? null : onScan,
              icon: const Icon(Icons.qr_code_scanner),
              label: const Text('Σκανάρισμα Vacuum'),
            ),
            const SizedBox(height: 16),
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Expanded(
                  child: TextField(
                    key: const ValueKey<String>(
                      'fault-restoration-vacuum-input',
                    ),
                    controller: controller,
                    onChanged: (_) => onChanged(),
                    onSubmitted: (_) {
                      if (!isLoading) {
                        onSubmit();
                      }
                    },
                    decoration: const InputDecoration(
                      labelText: 'Σειριακό / QR Vacuum',
                      hintText: 'VAC:19081291644',
                      border: OutlineInputBorder(),
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                SizedBox(
                  height: 56,
                  child: FilledButton(
                    key: const ValueKey<String>(
                      'fault-restoration-vacuum-ok-button',
                    ),
                    onPressed: isLoading ? null : onSubmit,
                    child: Text(isLoading ? '...' : 'OK'),
                  ),
                ),
              ],
            ),
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
        DecoratedBox(
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: Theme.of(context).colorScheme.surfaceContainerHighest,
          ),
          child: IconButton(
            tooltip: 'Κλείσιμο',
            onPressed: onClose,
            icon: const Icon(Icons.close),
          ),
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

class _CompletionPhotoPreview extends StatelessWidget {
  const _CompletionPhotoPreview({required this.photo});

  final XFile photo;

  @override
  Widget build(BuildContext context) {
    final photoFile = File(photo.path);
    final canPreview = photoFile.existsSync();

    return Card(
      key: const ValueKey<String>('fault-restoration-photo-preview-card'),
      color: const Color(0xFFF8FAFC),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Text(
              'Προεπισκόπηση: ${_fileNameForPhoto(photo)}',
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
                'Η προεπισκόπηση θα εμφανιστεί στη συσκευή.',
              ),
            ],
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

String? _repairIdFromPreview(Map<String, dynamic> preview) {
  final repair = _mapOrNull(preview['repair']);
  final repairId = repair?['id']?.toString().trim();
  if (repairId != null && repairId.isNotEmpty) {
    return repairId;
  }

  final topLevelRepairId = preview['repairId']?.toString().trim();
  return topLevelRepairId == null || topLevelRepairId.isEmpty
      ? null
      : topLevelRepairId;
}

String _displayValue(dynamic value) {
  final text = value?.toString().trim();
  if (text == null || text.isEmpty || text == 'null') {
    return '-';
  }

  return text;
}

String _fileNameForPhoto(XFile photo) {
  final name = photo.name.trim();
  if (name.isNotEmpty) {
    return name;
  }

  final normalizedPath = photo.path.replaceAll('\\', '/');
  final parts = normalizedPath.split('/');
  return parts.isEmpty ? 'repair-completion-photo.jpg' : parts.last;
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

const List<MapEntry<String, String>> _outcomes = <MapEntry<String, String>>[
  MapEntry('RETURNED_TO_SERVICE', 'Επιστροφή σε χρήση'),
  MapEntry('OUT_OF_SERVICE', 'Εκτός λειτουργίας'),
  MapEntry('RETIRED', 'Απόσυρση'),
  MapEntry('UNRESOLVED', 'Παραμένει προς επισκευή'),
];
