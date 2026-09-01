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

typedef FaultPhotoPicker = Future<XFile?> Function(ImageSource source);

typedef FaultPhotoUploader =
    Future<Map<String, dynamic>> Function({
      required String repairId,
      required String filePath,
      required String fileName,
      required String contentType,
      required String deviceId,
      String? operatorName,
      String? caption,
    });

class FaultDeclarationScreen extends ConsumerStatefulWidget {
  const FaultDeclarationScreen({
    super.key,
    this.initialVacuumQr,
    this.pickPhoto,
    this.uploadPhoto,
  });

  final String? initialVacuumQr;
  final FaultPhotoPicker? pickPhoto;
  final FaultPhotoUploader? uploadPhoto;

  @override
  ConsumerState<FaultDeclarationScreen> createState() =>
      _FaultDeclarationScreenState();
}

class _FaultDeclarationScreenState
    extends ConsumerState<FaultDeclarationScreen> {
  final TextEditingController _vacuumQrController = TextEditingController();
  final ImagePicker _imagePicker = ImagePicker();
  String? _rackQrRaw;
  Map<String, dynamic>? _vacuumPreviewResponse;
  Map<String, dynamic>? _rackPreviewResponse;
  List<Map<String, dynamic>> _faultCatalogItems = <Map<String, dynamic>>[];
  bool _isLoading = false;
  String? _errorMessage;

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

  @override
  void dispose() {
    _vacuumQrController.dispose();
    super.dispose();
  }

  String get _vacuumQrRaw => _vacuumQrController.text.trim();

  Future<void> _scanVacuum() async {
    final scannedValue = await QrScannerScreen.scanForRaw(
      context,
      title: HomeScreen.faultDeclarationLabel,
      description:
          'Scan the Vacuum QR and return the raw value to the fault declaration workflow.',
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
          'Scan the repair Rack position QR for the fault declaration.',
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
      _vacuumPreviewResponse = null;
      _rackPreviewResponse = null;
      _rackQrRaw = null;
    });

    try {
      final deviceId = ref.read(deviceIdProvider);
      final response = await ref
          .read(apiClientProvider)
          .postFaultDeclarationPreview(<String, dynamic>{
            'vacuumQr': _vacuumQrRaw,
            'deviceId': deviceId,
          });

      if (!mounted) {
        return;
      }

      setState(() {
        _vacuumPreviewResponse = response;
      });
      responseForDialog = response;
    } on ApiException catch (error) {
      if (!mounted) {
        return;
      }

      setState(() {
        if (error.payload != null) {
          _vacuumPreviewResponse = error.payload;
          _errorMessage = null;
        } else {
          _errorMessage = mapApiError(error);
          _vacuumPreviewResponse = null;
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
      case 'SELECT_FAULT':
      case 'CAN_DECLARE_FAULT':
        if (_isPendingRepairDeclaration(preview)) {
          _rackPreviewResponse = _rackPreviewFromPendingVacuum(preview);
          _rackQrRaw =
              _mapOrNull(
                _rackPreviewResponse?['rack'],
              )?['code']?.toString();
          await _showFaultSelectionDialog();
          return;
        }

        await _showRackInputDialog();
        return;
      case 'MUST_DECHARGE_FIRST':
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
      case 'ALREADY_IN_REPAIR':
        await _showSingleActionDialog(
          title: 'Το Vacuum βρίσκεται σε επισκευή',
          message:
              message ??
              'Το Vacuum έχει ήδη ενεργή επισκευή. Συνεχίστε με αποκατάσταση.',
          actionLabel: 'Αποκατάσταση',
          onAction: () => GoRouter.maybeOf(context)?.go('/fault-restoration'),
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
          title: 'Δεν επιτρέπεται δήλωση',
          message:
              message ?? 'Δεν είναι δυνατή η δήλωση βλάβης για αυτό το Vacuum.',
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
                title: 'Σάρωση θέσης',
                onClose: () => Navigator.of(dialogContext).pop(),
              ),
              content: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
                  const Text(
                    'Σκανάρετε ή εισάγετε τη θέση επισκευής όπου θα τοποθετηθεί το Vacuum.',
                  ),
                  const SizedBox(height: 16),
                  FilledButton.icon(
                    key: const ValueKey<String>(
                      'fault-declaration-scan-rack-button',
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
                            'fault-declaration-rack-input',
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
                            hintText: 'RACK:RACK-REP-01',
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
                            'fault-declaration-rack-ok-button',
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
          .postFaultDeclarationPreview(<String, dynamic>{
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
      case 'SELECT_FAULT':
      case 'CAN_DECLARE_FAULT':
        await _showFaultSelectionDialog();
        return;
      case 'RACK_NOT_FOUND':
      case 'INVALID_REQUEST':
        await _showSingleActionDialog(
          title: 'Λάθος QR θέσης',
          message: message ?? 'Δεν βρέθηκε θέση Rack για αυτό το QR.',
          actionLabel: 'Άλλη θέση',
          onAction: () {},
        );
        return;
      case 'RACK_NOT_ALLOWED':
        await _showSingleActionDialog(
          title: 'Λάθος θέση',
          message: 'Η θέση που επιλέχθηκε δεν είναι θέση επισκευής.',
          actionLabel: 'Άλλη θέση',
          onAction: () {},
        );
        return;
      case 'RACK_OCCUPIED':
        await _showSingleActionDialog(
          title: 'Η θέση είναι κατειλημμένη',
          message: message ?? 'Η θέση είναι κατειλημμένη.',
          actionLabel: 'Άλλη θέση',
          onAction: () {},
        );
        return;
      default:
        await _showSingleActionDialog(
          title: 'Δεν επιτρέπεται δήλωση',
          message:
              message ?? 'Δεν είναι δυνατή η δήλωση βλάβης σε αυτή τη θέση.',
          actionLabel: 'ΟΚ',
          onAction: () {},
        );
    }
  }

  Future<void> _showFaultSelectionDialog() async {
    await _loadFaultCatalog();
    if (!mounted) {
      return;
    }

    final otherController = TextEditingController();
    String? selectedFaultCatalogId;
    var useOtherFault = false;
    var isSubmitting = false;
    String? validationMessage;

    await showDialog<void>(
      context: context,
      barrierDismissible: false,
      builder: (BuildContext dialogContext) {
        return StatefulBuilder(
          builder: (BuildContext context, StateSetter dialogSetState) {
            String selectedFaultLabel() {
              if (useOtherFault) {
                final otherText = otherController.text.trim();
                return otherText.isEmpty ? 'Άλλο' : otherText;
              }

              final catalog = _faultCatalogItems.firstWhere(
                (item) => item['id']?.toString() == selectedFaultCatalogId,
                orElse: () => <String, dynamic>{},
              );
              final code = _displayValue(catalog['code']);
              final label = _displayValue(catalog['label']);
              return label == '-' ? code : '$code - $label';
            }

            Future<void> submitDeclaration() async {
              if (isSubmitting) {
                return;
              }

              final otherText = otherController.text.trim();
              if (useOtherFault && otherText.isEmpty) {
                dialogSetState(() {
                  validationMessage = 'Συμπληρώστε περιγραφή βλάβης.';
                });
                return;
              }

              if (!useOtherFault &&
                  (selectedFaultCatalogId == null ||
                      selectedFaultCatalogId!.isEmpty)) {
                dialogSetState(() {
                  validationMessage = 'Επιλέξτε είδος βλάβης.';
                });
                return;
              }

              dialogSetState(() {
                isSubmitting = true;
                validationMessage = null;
              });

              try {
                final deviceId = ref.read(deviceIdProvider);
                final response = await ref
                    .read(apiClientProvider)
                    .postFaultDeclaration(<String, dynamic>{
                      'vacuumQr': _vacuumQrRaw,
                      if (_rackQrRaw != null) 'rackQr': _rackQrRaw,
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
                  final faultLabel = selectedFaultLabel();
                  final repairId = _repairIdFrom(response);
                  if (repairId == null || repairId.isEmpty) {
                    dialogSetState(() {
                      validationMessage =
                          'Î”ÎµÎ½ Î²ÏÎ­Î¸Î·ÎºÎµ Repair ID Î³Î¹Î± Ï„Î·Î½ Î±Ï€Î¿Î¸Î®ÎºÎµÏ…ÏƒÎ· Ï†Ï‰Ï„Î¿Î³ÏÎ±Ï†Î¹ÏŽÎ½.';
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

                  await _showSuccessAndReturnHome(
                    response,
                    faultLabel,
                    photoCount,
                  );
                  return;
                }

                dialogSetState(() {
                  validationMessage =
                      response['message']?.toString() ??
                      'Η δήλωση βλάβης δεν ολοκληρώθηκε.';
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

            return AlertDialog(
              title: _DialogTitleWithClose(
                title: 'Επιλογή βλάβης',
                onClose: () => Navigator.of(dialogContext).pop(),
              ),
              content: SizedBox(
                width: double.maxFinite,
                child: SingleChildScrollView(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: <Widget>[
                      if (_faultCatalogItems.isEmpty)
                        const _NoticeCard(
                          title: 'Δεν φορτώθηκε κατάλογος',
                          message: 'Δεν υπάρχουν διαθέσιμες επιλογές βλάβης.',
                        )
                      else
                        ..._faultCatalogItems.map((Map<String, dynamic> item) {
                          final id = item['id']?.toString() ?? '';
                          final code = _displayValue(item['code']);
                          final label = _displayValue(item['label']);

                          return Card(
                            key: ValueKey<String>('fault-catalog-card-$code'),
                            child: ListTile(
                              onTap: isSubmitting || id.isEmpty
                                  ? null
                                  : () {
                                      dialogSetState(() {
                                        selectedFaultCatalogId = id;
                                        useOtherFault = false;
                                        validationMessage = null;
                                      });
                                    },
                              title: Text('$code - $label'),
                              trailing:
                                  !useOtherFault && selectedFaultCatalogId == id
                                  ? const Icon(Icons.check_circle)
                                  : const Icon(Icons.circle_outlined),
                            ),
                          );
                        }),
                      Card(
                        key: const ValueKey<String>('fault-catalog-card-other'),
                        child: ListTile(
                          onTap: isSubmitting
                              ? null
                              : () {
                                  dialogSetState(() {
                                    selectedFaultCatalogId = null;
                                    useOtherFault = true;
                                    validationMessage = null;
                                  });
                                },
                          title: const Text('Άλλο'),
                          trailing: useOtherFault
                              ? const Icon(Icons.check_circle)
                              : const Icon(Icons.circle_outlined),
                        ),
                      ),
                      if (useOtherFault) ...<Widget>[
                        const SizedBox(height: 12),
                        TextField(
                          key: const ValueKey<String>('fault-other-input'),
                          controller: otherController,
                          minLines: 2,
                          maxLines: 3,
                          decoration: const InputDecoration(
                            labelText: 'Περιγραφή βλάβης',
                            border: OutlineInputBorder(),
                          ),
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
                        'fault-declaration-confirm-button',
                      ),
                      style: compactDialogButtonStyle(),
                      onPressed: isSubmitting ? null : submitDeclaration,
                      child: Text(
                        isSubmitting ? '...' : 'ΔΗΛΩΣΗ ΒΛΑΒΗΣ',
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
        return StatefulBuilder(
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
                      'Απαιτείται τουλάχιστον 1 φωτογραφία για τη δήλωση βλάβης.';
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

            return PopScope<int>(
              canPop: false,
              child: AlertDialog(
                key: const ValueKey<String>('fault-photo-dialog'),
                title: const Text('Φωτογραφίες βλάβης'),
                content: SizedBox(
                  width: double.maxFinite,
                  child: SingleChildScrollView(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: <Widget>[
                        Text(
                          'Τραβήξτε 1 έως 5 φωτογραφίες. Κάθε φωτογραφία εμφανίζεται για προεπισκόπηση πριν καταχωρηθεί.',
                          style: Theme.of(context).textTheme.bodyMedium,
                        ),
                        const SizedBox(height: 12),
                        Text(
                          '${uploadedPhotos.length}/5 φωτογραφίες καταχωρημένες',
                          key: const ValueKey<String>(
                            'fault-photo-count-label',
                          ),
                          style: Theme.of(context).textTheme.titleSmall,
                        ),
                        const SizedBox(height: 16),
                        if (selectedPhoto == null && uploadedPhotos.length < 5)
                          FilledButton.icon(
                            key: const ValueKey<String>(
                              'fault-photo-camera-button',
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
                          _FaultPhotoPreview(photo: selectedPhoto!),
                          const SizedBox(height: 12),
                          Wrap(
                            spacing: 12,
                            runSpacing: 12,
                            children: <Widget>[
                              FilledButton.icon(
                                key: const ValueKey<String>(
                                  'fault-photo-upload-button',
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
                                  'fault-photo-remove-button',
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
                                'fault-photo-uploaded-${entry.key}',
                              ),
                              contentPadding: EdgeInsets.zero,
                              leading: const Icon(Icons.check_circle_outline),
                              title: Text('Φωτογραφία ${entry.key + 1}'),
                              subtitle: const Text('Καταχωρήθηκε στο Repair'),
                            ),
                          ),
                        ],
                        if (uploadedPhotos.length >= 5) ...<Widget>[
                          const SizedBox(height: 12),
                          const Text('Έχετε φτάσει το όριο των 5 φωτογραφιών.'),
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
                          'fault-photo-finish-button',
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
              ),
            );
          },
        );
      },
    );
  }

  Future<XFile?> _pickFaultPhoto(ImageSource source) {
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

  Future<Map<String, dynamic>> _uploadFaultPhoto({
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

  Future<void> _loadFaultCatalog() async {
    if (_faultCatalogItems.isNotEmpty) {
      return;
    }

    try {
      final response = await ref.read(apiClientProvider).getFaultCatalog();

      if (!mounted) {
        return;
      }

      setState(() {
        _faultCatalogItems = _mapList(response['items']);
      });
    } on ApiException catch (error) {
      if (!mounted) {
        return;
      }

      await _showSingleActionDialog(
        title: 'Σφάλμα καταλόγου',
        message: mapApiError(error),
        actionLabel: 'ΟΚ',
        onAction: () {},
      );
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

  Future<void> _showSuccessAndReturnHome(
    Map<String, dynamic> response,
    String faultLabel,
    int photoCount,
  ) async {
    final vacuum = _mapOrNull(response['vacuum']);
    final rack = _mapOrNull(response['rack']) ?? _currentRackSummary();
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
          title: const Text('Η δήλωση ολοκληρώθηκε'),
          content: Text(
            'Το Vacuum $vacuumLabel βρίσκεται στη θέση $rackLabel με πρόβλημα $faultLabel και καταχωρήθηκαν $photoCount φωτογραφίες.',
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

  Map<String, dynamic> _rackPreviewFromPendingVacuum(
    Map<String, dynamic> preview,
  ) {
    final vacuum = _mapOrNull(preview['vacuum']);
    final rack = _mapOrNull(vacuum?['currentRackLocation']);
    return <String, dynamic>{
      'ok': true,
      'decision': 'SELECT_FAULT',
      'message': 'Το Vacuum βρίσκεται ήδη σε θέση επισκευής.',
      'vacuum': vacuum,
      'rack': rack,
      'requiredNextAction': 'SELECT_FAULT',
    };
  }

  Map<String, dynamic>? _currentRackSummary() {
    final rack = _mapOrNull(_rackPreviewResponse?['rack']);
    if (rack != null) {
      return rack;
    }

    final vacuum = _mapOrNull(_vacuumPreviewResponse?['vacuum']);
    return _mapOrNull(vacuum?['currentRackLocation']);
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

  void _resetFlow() {
    setState(() {
      _rackQrRaw = null;
      _vacuumPreviewResponse = null;
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
      title: HomeScreen.faultDeclarationLabel,
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
                    HomeScreen.faultDeclarationLabel,
                    style: theme.textTheme.headlineSmall,
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'Σκανάρετε Vacuum, θέση επισκευής και επιλέξτε πρόβλημα.',
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
              key: const ValueKey<String>('fault-declaration-scan-button'),
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
                      'fault-declaration-vacuum-input',
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
                      'fault-declaration-vacuum-ok-button',
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

class _FaultPhotoPreview extends StatelessWidget {
  const _FaultPhotoPreview({required this.photo});

  final XFile photo;

  @override
  Widget build(BuildContext context) {
    final photoFile = File(photo.path);
    final canPreview = photoFile.existsSync();

    return Card(
      key: const ValueKey<String>('fault-photo-preview-card'),
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
              const Text('Η προεπισκόπηση θα εμφανιστεί στη συσκευή.'),
            ],
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
    if (entry is Map<dynamic, dynamic>) {
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

bool _isPendingRepairDeclaration(Map<String, dynamic> preview) {
  final vacuum = _mapOrNull(preview['vacuum']);
  return vacuum?['locationStatus'] == 'IN_REPAIR' &&
      vacuum?['operationalStatus'] == 'INSPECTION_REQUIRED';
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
