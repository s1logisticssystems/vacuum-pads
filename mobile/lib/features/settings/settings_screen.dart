import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:vacuum_traceability_mobile/core/api/api_client.dart';
import 'package:vacuum_traceability_mobile/core/api/api_exceptions.dart';
import 'package:vacuum_traceability_mobile/core/auth/auth_provider.dart';
import 'package:vacuum_traceability_mobile/core/notifications/notification_provider.dart';
import 'package:vacuum_traceability_mobile/core/notifications/notification_service.dart';
import 'package:vacuum_traceability_mobile/core/settings/app_settings.dart';
import 'package:vacuum_traceability_mobile/core/settings/settings_provider.dart';
import 'package:vacuum_traceability_mobile/core/settings/settings_service.dart';
import 'package:vacuum_traceability_mobile/core/widgets/app_screen_scaffold.dart';

class SettingsScreen extends ConsumerStatefulWidget {
  const SettingsScreen({super.key});

  @override
  ConsumerState<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends ConsumerState<SettingsScreen> {
  final TextEditingController _apiBaseUrlController = TextEditingController();

  bool _hasInitializedController = false;
  bool _isSaving = false;
  bool _isTestingConnection = false;
  bool _isUpdatingNotifications = false;
  String? _message;
  bool _isMessageSuccess = false;
  String? _notificationMessage;
  bool _isNotificationMessageSuccess = false;
  String? _fcmToken;

  @override
  void dispose() {
    _apiBaseUrlController.dispose();
    super.dispose();
  }

  Future<void> _saveApiBaseUrl() async {
    setState(() {
      _isSaving = true;
      _message = null;
    });

    try {
      await ref
          .read(appSettingsProvider.notifier)
          .saveApiBaseUrl(_apiBaseUrlController.text);

      if (!mounted) {
        return;
      }

      setState(() {
        _apiBaseUrlController.text = ref.read(apiBaseUrlProvider);
        _message = 'Server URL saved.';
        _isMessageSuccess = true;
      });
    } on FormatException catch (error) {
      _showFailure(error.message);
    } catch (_) {
      _showFailure('Could not save settings. Please try again.');
    } finally {
      if (mounted) {
        setState(() {
          _isSaving = false;
        });
      }
    }
  }

  Future<void> _testConnection() async {
    setState(() {
      _isTestingConnection = true;
      _message = null;
    });

    try {
      final normalizedUrl = SettingsService.normalizeApiBaseUrl(
        _apiBaseUrlController.text,
      );
      final client = ApiClient(baseUrl: normalizedUrl);
      final health = await client.getHealth();
      final databaseHealth = await client.getDatabaseHealth();

      if (!mounted) {
        return;
      }

      final backendStatus = health['status']?.toString() == 'ok'
          ? 'Backend OK'
          : 'Backend responded';
      final databaseStatus = databaseHealth['status']?.toString() == 'ok'
          ? 'Database OK'
          : 'Database unavailable';

      setState(() {
        _message = '$backendStatus. $databaseStatus.';
        _isMessageSuccess = true;
      });
    } on FormatException catch (error) {
      _showFailure(error.message);
    } on ApiException catch (error) {
      _showFailure('Δεν ήταν δυνατή η σύνδεση. ${mapApiError(error)}');
    } catch (_) {
      _showFailure('Δεν ήταν δυνατή η σύνδεση.');
    } finally {
      if (mounted) {
        setState(() {
          _isTestingConnection = false;
        });
      }
    }
  }

  Future<void> _setRepairIntakeNotifications(bool enabled) async {
    await _setNotificationPreference(
      savePreference: () => ref
          .read(appSettingsProvider.notifier)
          .saveNotificationPreferences(notifyRepairIntake: enabled),
      syncTopic: () =>
          ref.read(notificationServiceProvider).setRepairIntakeEnabled(enabled),
    );
  }

  Future<void> _setRepairRestoredNotifications(bool enabled) async {
    await _setNotificationPreference(
      savePreference: () => ref
          .read(appSettingsProvider.notifier)
          .saveNotificationPreferences(notifyRepairRestored: enabled),
      syncTopic: () => ref
          .read(notificationServiceProvider)
          .setRepairRestoredEnabled(enabled),
    );
  }

  Future<void> _setNotificationPreference({
    required Future<void> Function() savePreference,
    required Future<NotificationSyncResult> Function() syncTopic,
  }) async {
    setState(() {
      _isUpdatingNotifications = true;
      _notificationMessage = null;
    });

    try {
      await savePreference();
      final result = await syncTopic();

      if (!mounted) {
        return;
      }

      setState(() {
        _fcmToken = result.fcmToken ?? _fcmToken;
        _notificationMessage = result.message;
        _isNotificationMessageSuccess = result.isSuccess;
      });
    } catch (error) {
      _showNotificationFailure('Could not update notifications: $error');
    } finally {
      if (mounted) {
        setState(() {
          _isUpdatingNotifications = false;
        });
      }
    }
  }

  void _showFailure(String message) {
    if (!mounted) {
      return;
    }

    setState(() {
      _message = message;
      _isMessageSuccess = false;
    });
  }

  void _showNotificationFailure(String message) {
    if (!mounted) {
      return;
    }

    setState(() {
      _notificationMessage = message;
      _isNotificationMessageSuccess = false;
    });
  }

  Future<void> _copyDeviceId(String deviceId) async {
    await Clipboard.setData(ClipboardData(text: deviceId));

    if (!mounted) {
      return;
    }

    ScaffoldMessenger.of(
      context,
    ).showSnackBar(const SnackBar(content: Text('Device identifier copied.')));
  }

  @override
  Widget build(BuildContext context) {
    final settings = ref.watch(appSettingsProvider);

    return AppScreenScaffold(
      title: '\u03A1\u03C5\u03B8\u03BC\u03AF\u03C3\u03B5\u03B9\u03C2',
      body: settings.when(
        data: (AppSettings appSettings) {
          if (!_hasInitializedController) {
            _apiBaseUrlController.text = appSettings.apiBaseUrl;
            _hasInitializedController = true;
          }

          return _SettingsBody(
            settings: appSettings,
            apiBaseUrlController: _apiBaseUrlController,
            isSaving: _isSaving,
            isTestingConnection: _isTestingConnection,
            isUpdatingNotifications: _isUpdatingNotifications,
            message: _message,
            isMessageSuccess: _isMessageSuccess,
            notificationMessage: _notificationMessage,
            isNotificationMessageSuccess: _isNotificationMessageSuccess,
            fcmToken: _fcmToken,
            onCopyDeviceId: () => _copyDeviceId(appSettings.deviceId),
            onSave: _saveApiBaseUrl,
            onTestConnection: _testConnection,
            onRepairIntakeChanged: _setRepairIntakeNotifications,
            onRepairRestoredChanged: _setRepairRestoredNotifications,
          );
        },
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (Object error, StackTrace stackTrace) => Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Text('Could not load settings: $error'),
          ),
        ),
      ),
    );
  }
}

class _SettingsBody extends StatelessWidget {
  const _SettingsBody({
    required this.settings,
    required this.apiBaseUrlController,
    required this.isSaving,
    required this.isTestingConnection,
    required this.isUpdatingNotifications,
    required this.onCopyDeviceId,
    required this.onSave,
    required this.onTestConnection,
    required this.onRepairIntakeChanged,
    required this.onRepairRestoredChanged,
    this.message,
    this.isMessageSuccess = false,
    this.notificationMessage,
    this.isNotificationMessageSuccess = false,
    this.fcmToken,
  });

  final AppSettings settings;
  final TextEditingController apiBaseUrlController;
  final bool isSaving;
  final bool isTestingConnection;
  final bool isUpdatingNotifications;
  final String? message;
  final bool isMessageSuccess;
  final String? notificationMessage;
  final bool isNotificationMessageSuccess;
  final String? fcmToken;
  final VoidCallback onCopyDeviceId;
  final VoidCallback onSave;
  final VoidCallback onTestConnection;
  final ValueChanged<bool> onRepairIntakeChanged;
  final ValueChanged<bool> onRepairRestoredChanged;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return ListView(
      padding: const EdgeInsets.all(16),
      children: <Widget>[
        Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Text(
                  '\u03A1\u03C5\u03B8\u03BC\u03AF\u03C3\u03B5\u03B9\u03C2',
                  style: theme.textTheme.headlineSmall,
                ),
                const SizedBox(height: 8),
                Text(
                  'Configure this device and the backend server used by the app.',
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
                Text(
                  '\u0391\u03BD\u03B1\u03B3\u03BD\u03C9\u03C1\u03B9\u03C3\u03C4\u03B9\u03BA\u03CC \u03C3\u03C5\u03C3\u03BA\u03B5\u03C5\u03AE\u03C2',
                  style: theme.textTheme.titleMedium,
                ),
                const SizedBox(height: 8),
                SelectableText(settings.deviceId),
                const SizedBox(height: 12),
                OutlinedButton.icon(
                  key: const ValueKey<String>('settings-copy-device-id'),
                  onPressed: onCopyDeviceId,
                  icon: const Icon(Icons.copy),
                  label: const Text(
                    '\u0391\u03BD\u03C4\u03B9\u03B3\u03C1\u03B1\u03C6\u03AE',
                  ),
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
                Text(
                  '\u0394\u03B9\u03B5\u03CD\u03B8\u03C5\u03BD\u03C3\u03B7 server / API',
                  style: theme.textTheme.titleMedium,
                ),
                const SizedBox(height: 12),
                TextField(
                  key: const ValueKey<String>('settings-api-url-input'),
                  controller: apiBaseUrlController,
                  enabled: !isSaving && !isTestingConnection,
                  keyboardType: TextInputType.url,
                  decoration: const InputDecoration(
                    border: OutlineInputBorder(),
                    labelText: 'Backend server URL',
                    hintText: 'http://192.168.1.50:3000',
                  ),
                ),
                const SizedBox(height: 12),
                Wrap(
                  spacing: 12,
                  runSpacing: 12,
                  children: <Widget>[
                    FilledButton.icon(
                      key: const ValueKey<String>('settings-save-button'),
                      onPressed: isSaving ? null : onSave,
                      icon: isSaving
                          ? const SizedBox(
                              width: 16,
                              height: 16,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            )
                          : const Icon(Icons.save_outlined),
                      label: Text(isSaving ? 'Saving...' : 'Save'),
                    ),
                    FilledButton.tonalIcon(
                      key: const ValueKey<String>(
                        'settings-test-connection-button',
                      ),
                      onPressed: isTestingConnection ? null : onTestConnection,
                      icon: isTestingConnection
                          ? const SizedBox(
                              width: 16,
                              height: 16,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            )
                          : const Icon(Icons.network_check_outlined),
                      label: Text(
                        isTestingConnection
                            ? 'Testing...'
                            : '\u0388\u03BB\u03B5\u03B3\u03C7\u03BF\u03C2 \u03C3\u03CD\u03BD\u03B4\u03B5\u03C3\u03B7\u03C2',
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
        if (message != null) ...<Widget>[
          const SizedBox(height: 16),
          Card(
            color: isMessageSuccess
                ? const Color(0xFFDDF6E8)
                : const Color(0xFFFFE3E3),
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Text(message!),
            ),
          ),
        ],
        const SizedBox(height: 16),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Text('Ειδοποιήσεις', style: theme.textTheme.titleMedium),
                const SizedBox(height: 8),
                Text(
                  'Οι επιλογές αυτές εγγράφουν τη συσκευή στα αντίστοιχα FCM topics όταν υπάρχει Firebase config.',
                  style: theme.textTheme.bodyMedium,
                ),
                const SizedBox(height: 12),
                SwitchListTile(
                  key: const ValueKey<String>(
                    'settings-notify-repair-intake-switch',
                  ),
                  contentPadding: EdgeInsets.zero,
                  title: const Text('Όταν Vacuum πάει σε θέση επισκευής'),
                  subtitle: const Text('Topic: vacuum-repair-intake'),
                  value: settings.notifyRepairIntake,
                  onChanged: isUpdatingNotifications
                      ? null
                      : onRepairIntakeChanged,
                ),
                SwitchListTile(
                  key: const ValueKey<String>(
                    'settings-notify-repair-restored-switch',
                  ),
                  contentPadding: EdgeInsets.zero,
                  title: const Text('Όταν ολοκληρώνεται αποκατάσταση βλάβης'),
                  subtitle: const Text('Topic: vacuum-repair-restored'),
                  value: settings.notifyRepairRestored,
                  onChanged: isUpdatingNotifications
                      ? null
                      : onRepairRestoredChanged,
                ),
                if (isUpdatingNotifications) ...<Widget>[
                  const SizedBox(height: 8),
                  const Row(
                    children: <Widget>[
                      SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      ),
                      SizedBox(width: 12),
                      Expanded(child: Text('Updating notification topics...')),
                    ],
                  ),
                ],
                if (notificationMessage != null) ...<Widget>[
                  const SizedBox(height: 12),
                  Card(
                    color: isNotificationMessageSuccess
                        ? const Color(0xFFDDF6E8)
                        : const Color(0xFFFFF7D6),
                    child: Padding(
                      padding: const EdgeInsets.all(12),
                      child: Text(notificationMessage!),
                    ),
                  ),
                ],
                if (fcmToken != null && fcmToken!.isNotEmpty) ...<Widget>[
                  const SizedBox(height: 12),
                  ExpansionTile(
                    tilePadding: EdgeInsets.zero,
                    title: const Text('FCM debug token'),
                    children: <Widget>[
                      Align(
                        alignment: Alignment.centerLeft,
                        child: SelectableText(fcmToken!),
                      ),
                    ],
                  ),
                ],
              ],
            ),
          ),
        ),
        const SizedBox(height: 16),
        const _AccountCard(),
        const SizedBox(height: 16),
        const Card(
          child: Padding(
            padding: EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Text('Helpful notes'),
                SizedBox(height: 8),
                Text('Default server: https://vacuum.s1-logistics.com'),
                Text('Emulator: http://10.0.2.2:3000'),
                Text('Physical device: use the PC/server LAN IP.'),
                Text('Local testing needs the same Wi-Fi/LAN.'),
                Text('Windows Firewall may need to allow port 3000.'),
                Text('Use HTTPS for production deployments.'),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

class _AccountCard extends ConsumerWidget {
  const _AccountCard();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final session = ref.watch(authSessionProvider);

    if (session == null) {
      return const SizedBox.shrink();
    }

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Text(
              'Λογαριασμός',
              style: theme.textTheme.titleMedium,
            ),
            const SizedBox(height: 8),
            Text(session.label, style: theme.textTheme.bodyLarge),
            Text(
              session.username,
              style: theme.textTheme.bodySmall?.copyWith(
                color: theme.colorScheme.onSurfaceVariant,
              ),
            ),
            const SizedBox(height: 12),
            OutlinedButton.icon(
              onPressed: () async {
                final confirmed = await showDialog<bool>(
                  context: context,
                  builder: (BuildContext dialogContext) => AlertDialog(
                    title: const Text(
                      'Αποσύνδεση',
                    ),
                    content: const Text(
                      'Θέλετε να αποσυνδεθείτε;',
                    ),
                    actions: <Widget>[
                      TextButton(
                        onPressed: () =>
                            Navigator.of(dialogContext).pop(false),
                        child: const Text(
                          'Ακύρωση',
                        ),
                      ),
                      FilledButton(
                        onPressed: () => Navigator.of(dialogContext).pop(true),
                        child: const Text(
                          'Αποσύνδεση',
                        ),
                      ),
                    ],
                  ),
                );

                if (confirmed == true) {
                  await ref.read(authControllerProvider.notifier).signOut();
                }
              },
              icon: const Icon(Icons.logout),
              label: const Text(
                'Αποσύνδεση',
              ),
            ),
          ],
        ),
      ),
    );
  }
}
