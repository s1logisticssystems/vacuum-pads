import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';
import 'package:vacuum_traceability_mobile/core/api/api_client_provider.dart';
import 'package:vacuum_traceability_mobile/core/api/api_exceptions.dart';
import 'package:vacuum_traceability_mobile/core/settings/settings_provider.dart';

typedef RepairPhotoPicker = Future<XFile?> Function(ImageSource source);

typedef RepairPhotoUploader =
    Future<Map<String, dynamic>> Function({
      required String repairId,
      required String filePath,
      required String fileName,
      required String contentType,
      required String deviceId,
      String? operatorName,
      String? caption,
    });

class RepairPhotoUploadPanel extends ConsumerStatefulWidget {
  const RepairPhotoUploadPanel({
    required this.repairId,
    super.key,
    this.operatorName,
    this.pickImage,
    this.uploadPhoto,
  });

  final String repairId;
  final String? operatorName;
  final RepairPhotoPicker? pickImage;
  final RepairPhotoUploader? uploadPhoto;

  @override
  ConsumerState<RepairPhotoUploadPanel> createState() =>
      _RepairPhotoUploadPanelState();
}

class _RepairPhotoUploadPanelState
    extends ConsumerState<RepairPhotoUploadPanel> {
  final TextEditingController _captionController = TextEditingController();
  final ImagePicker _imagePicker = ImagePicker();

  XFile? _selectedImage;
  Map<String, dynamic>? _uploadResponse;
  bool _isUploading = false;
  String? _errorMessage;

  @override
  void dispose() {
    _captionController.dispose();
    super.dispose();
  }

  bool get _canUpload => _selectedImage != null && !_isUploading;

  String? get _caption {
    final text = _captionController.text.trim();
    return text.isEmpty ? null : text;
  }

  Future<void> _pickImage(ImageSource source) async {
    setState(() {
      _errorMessage = null;
      _uploadResponse = null;
    });

    try {
      final pickedImage = await (widget.pickImage ?? _defaultPickImage)(source);

      if (!mounted || pickedImage == null) {
        return;
      }

      setState(() {
        _selectedImage = pickedImage;
      });
    } catch (_) {
      if (!mounted) {
        return;
      }

      setState(() {
        _errorMessage =
            'Could not open the image picker. Check app permissions and try again.';
      });
    }
  }

  Future<XFile?> _defaultPickImage(ImageSource source) {
    return _imagePicker.pickImage(
      source: source,
      imageQuality: 85,
      maxWidth: 1600,
    );
  }

  Future<void> _uploadSelectedImage() async {
    final selectedImage = _selectedImage;
    if (selectedImage == null) {
      setState(() {
        _errorMessage = 'Select or capture an image before uploading.';
      });
      return;
    }

    final contentType = _contentTypeFor(selectedImage);
    if (contentType == null) {
      setState(() {
        _errorMessage = 'Only JPEG, PNG, and WebP images can be uploaded.';
      });
      return;
    }

    setState(() {
      _isUploading = true;
      _errorMessage = null;
      _uploadResponse = null;
    });

    try {
      final uploadPhoto =
          widget.uploadPhoto ?? ref.read(apiClientProvider).uploadRepairPhoto;
      final deviceId = ref.read(deviceIdProvider);
      final response = await uploadPhoto(
        repairId: widget.repairId,
        filePath: selectedImage.path,
        fileName: _fileNameFor(selectedImage),
        contentType: contentType,
        deviceId: deviceId,
        operatorName: widget.operatorName,
        caption: _caption,
      );

      if (!mounted) {
        return;
      }

      setState(() {
        _uploadResponse = response;
      });
    } on ApiException catch (error) {
      if (!mounted) {
        return;
      }

      setState(() {
        _errorMessage = mapApiError(error);
      });
    } catch (_) {
      if (!mounted) {
        return;
      }

      setState(() {
        _errorMessage =
            'Photo upload failed. Check backend connectivity and try again.';
      });
    } finally {
      if (mounted) {
        setState(() {
          _isUploading = false;
        });
      }
    }
  }

  void _clearSelection() {
    setState(() {
      _selectedImage = null;
      _uploadResponse = null;
      _errorMessage = null;
      _captionController.clear();
    });
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final selectedImage = _selectedImage;
    final uploadResponse = _uploadResponse;
    final storage = uploadResponse?['storage'];
    final storageProvider = storage is Map
        ? storage['provider']?.toString()
        : null;

    return Card(
      key: const ValueKey<String>('repair-photo-upload-panel'),
      color: const Color(0xFFF8FAFC),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Row(
              children: <Widget>[
                const Icon(Icons.photo_camera_outlined),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    'Προσθήκη φωτογραφίας βλάβης',
                    style: theme.textTheme.titleMedium,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Text(
              'Η φωτογραφία είναι προαιρετική και αποθηκεύεται από το backend.',
              style: theme.textTheme.bodyMedium,
            ),
            const SizedBox(height: 16),
            Wrap(
              spacing: 12,
              runSpacing: 12,
              children: <Widget>[
                FilledButton.tonalIcon(
                  key: const ValueKey<String>('repair-photo-camera-button'),
                  onPressed: _isUploading
                      ? null
                      : () => _pickImage(ImageSource.camera),
                  icon: const Icon(Icons.photo_camera_outlined),
                  label: const Text('Λήψη φωτογραφίας'),
                ),
                FilledButton.tonalIcon(
                  key: const ValueKey<String>('repair-photo-gallery-button'),
                  onPressed: _isUploading
                      ? null
                      : () => _pickImage(ImageSource.gallery),
                  icon: const Icon(Icons.photo_library_outlined),
                  label: const Text('Επιλογή από gallery'),
                ),
              ],
            ),
            const SizedBox(height: 16),
            TextField(
              key: const ValueKey<String>('repair-photo-caption-input'),
              controller: _captionController,
              enabled: !_isUploading,
              decoration: const InputDecoration(
                labelText: 'Caption (optional)',
                border: OutlineInputBorder(),
              ),
            ),
            if (selectedImage != null) ...<Widget>[
              const SizedBox(height: 16),
              _SelectedImageSummary(image: selectedImage),
            ],
            if (_errorMessage != null) ...<Widget>[
              const SizedBox(height: 16),
              _UploadNotice(
                color: const Color(0xFFFFE3E3),
                title: 'Upload issue',
                message: _errorMessage!,
              ),
            ],
            if (uploadResponse != null) ...<Widget>[
              const SizedBox(height: 16),
              _UploadNotice(
                color: const Color(0xFFDDF6E8),
                title: 'Photo uploaded',
                message: storageProvider == null
                    ? 'The repair photo was uploaded successfully.'
                    : 'The repair photo was uploaded successfully using $storageProvider storage.',
              ),
            ],
            const SizedBox(height: 16),
            Wrap(
              spacing: 12,
              runSpacing: 12,
              children: <Widget>[
                FilledButton.icon(
                  key: const ValueKey<String>('repair-photo-upload-button'),
                  onPressed: _canUpload ? _uploadSelectedImage : null,
                  icon: _isUploading
                      ? const SizedBox(
                          width: 16,
                          height: 16,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.cloud_upload_outlined),
                  label: Text(_isUploading ? 'Uploading...' : 'Upload photo'),
                ),
                OutlinedButton.icon(
                  key: const ValueKey<String>('repair-photo-clear-button'),
                  onPressed: selectedImage == null || _isUploading
                      ? null
                      : _clearSelection,
                  icon: const Icon(Icons.close),
                  label: const Text('Clear'),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _SelectedImageSummary extends StatelessWidget {
  const _SelectedImageSummary({required this.image});

  final XFile image;

  @override
  Widget build(BuildContext context) {
    final imageFile = File(image.path);
    final canPreview = imageFile.existsSync();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        Text(
          'Selected image: ${_fileNameFor(image)}',
          style: Theme.of(context).textTheme.labelLarge,
        ),
        if (canPreview) ...<Widget>[
          const SizedBox(height: 12),
          ClipRRect(
            borderRadius: BorderRadius.circular(12),
            child: Image.file(
              imageFile,
              height: 180,
              width: double.infinity,
              fit: BoxFit.cover,
            ),
          ),
        ],
      ],
    );
  }
}

class _UploadNotice extends StatelessWidget {
  const _UploadNotice({
    required this.color,
    required this.title,
    required this.message,
  });

  final Color color;
  final String title;
  final String message;

  @override
  Widget build(BuildContext context) {
    return Card(
      color: color,
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Text(title, style: Theme.of(context).textTheme.titleSmall),
            const SizedBox(height: 6),
            Text(message),
          ],
        ),
      ),
    );
  }
}

String _fileNameFor(XFile image) {
  final name = image.name.trim();
  if (name.isNotEmpty) {
    return name;
  }

  final normalizedPath = image.path.replaceAll('\\', '/');
  final parts = normalizedPath.split('/');
  return parts.isEmpty ? 'repair-photo' : parts.last;
}

String? _contentTypeFor(XFile image) {
  final mimeType = image.mimeType?.toLowerCase().split(';').first.trim();
  if (mimeType == 'image/jpg') {
    return 'image/jpeg';
  }

  if (mimeType == 'image/jpeg' ||
      mimeType == 'image/png' ||
      mimeType == 'image/webp') {
    return mimeType;
  }

  final name = _fileNameFor(image).toLowerCase();
  final path = image.path.toLowerCase();

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
