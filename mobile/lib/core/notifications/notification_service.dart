import 'dart:async';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:vacuum_traceability_mobile/core/settings/app_settings.dart';

const String repairIntakeTopic = 'vacuum-repair-intake';
const String repairRestoredTopic = 'vacuum-repair-restored';
const String repairIntakeChannelId = 'repair_intake_channel_v7';
const String repairRestoredChannelId = 'repair_restored_channel_v7';
const String _repairIntakeSoundName = 'error';
const String _repairRestoredSoundName = 'fix';

@pragma('vm:entry-point')
Future<void> firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  await NotificationService.initializeForBackground();
}

class NotificationSyncResult {
  const NotificationSyncResult({
    required this.isConfigured,
    required this.isSuccess,
    required this.message,
    this.fcmToken,
  });

  final bool isConfigured;
  final bool isSuccess;
  final String message;
  final String? fcmToken;
}

class NotificationService {
  static const AndroidNotificationChannel _repairIntakeChannel =
      AndroidNotificationChannel(
        repairIntakeChannelId,
        'Repair intake',
        description: 'Vacuum fault and repair intake notifications.',
        importance: Importance.max,
        playSound: true,
        sound: RawResourceAndroidNotificationSound('error'),
      );

  static const AndroidNotificationChannel _repairRestoredChannel =
      AndroidNotificationChannel(
        repairRestoredChannelId,
        'Repair restored',
        description: 'Vacuum restoration completed notifications.',
        importance: Importance.max,
        playSound: true,
        sound: RawResourceAndroidNotificationSound('fix'),
      );

  static const List<String> _oldDeveloperChannelIds = [
    'repair_intake_channel',
    'repair_restored_channel',
    'repair_intake_channel_v2',
    'repair_restored_channel_v2',
    'repair_intake_channel_v3',
    'repair_restored_channel_v3',
    'repair_intake_channel_v4',
    'repair_restored_channel_v4',
    'repair_intake_channel_v5',
    'repair_restored_channel_v5',
    'repair_intake_channel_v6',
    'repair_restored_channel_v6',
  ];

  static final FlutterLocalNotificationsPlugin _localNotifications =
      FlutterLocalNotificationsPlugin();

  static Future<NotificationSyncResult>? _initializeFuture;
  static StreamSubscription<RemoteMessage>? _foregroundSubscription;

  Future<NotificationSyncResult> initialize() => _ensureInitialized();

  static Future<void> initializeForBackground() async {
    try {
      if (Firebase.apps.isEmpty) {
        await Firebase.initializeApp();
      }
    } catch (_) {
      // Firebase config is optional until google-services.json is provided.
    }
  }

  Future<NotificationSyncResult> syncSettings(AppSettings settings) async {
    final initialized = await initialize();
    if (!initialized.isConfigured) {
      return initialized;
    }

    final intake = await setRepairIntakeEnabled(settings.notifyRepairIntake);
    if (!intake.isSuccess) {
      return intake;
    }

    return setRepairRestoredEnabled(settings.notifyRepairRestored);
  }

  Future<NotificationSyncResult> setRepairIntakeEnabled(bool enabled) {
    return _setTopicSubscription(topic: repairIntakeTopic, enabled: enabled);
  }

  Future<NotificationSyncResult> setRepairRestoredEnabled(bool enabled) {
    return _setTopicSubscription(topic: repairRestoredTopic, enabled: enabled);
  }

  Future<NotificationSyncResult> getDiagnostics() async {
    final initialized = await initialize();
    if (!initialized.isConfigured) {
      return initialized;
    }

    try {
      final token = await FirebaseMessaging.instance.getToken();
      return NotificationSyncResult(
        isConfigured: true,
        isSuccess: true,
        fcmToken: token,
        message: token == null
            ? 'Firebase notifications are configured, but no FCM token is available yet.'
            : 'Firebase notifications are configured.',
      );
    } catch (error) {
      return NotificationSyncResult(
        isConfigured: true,
        isSuccess: false,
        message: 'Could not read FCM token: $error',
      );
    }
  }

  Future<NotificationSyncResult> _setTopicSubscription({
    required String topic,
    required bool enabled,
  }) async {
    final initialized = await initialize();
    if (!initialized.isConfigured) {
      return initialized;
    }

    try {
      if (enabled) {
        await FirebaseMessaging.instance.subscribeToTopic(topic);
      } else {
        await FirebaseMessaging.instance.unsubscribeFromTopic(topic);
      }

      final token = await FirebaseMessaging.instance.getToken();
      return NotificationSyncResult(
        isConfigured: true,
        isSuccess: true,
        fcmToken: token,
        message: enabled
            ? 'Subscribed to $topic.'
            : 'Unsubscribed from $topic.',
      );
    } catch (error) {
      return NotificationSyncResult(
        isConfigured: true,
        isSuccess: false,
        message: 'Could not update $topic subscription: $error',
      );
    }
  }

  static Future<NotificationSyncResult> _ensureInitialized() {
    _initializeFuture ??= _initialize();
    return _initializeFuture!;
  }

  static Future<NotificationSyncResult> _initialize() async {
    try {
      if (Firebase.apps.isEmpty) {
        await Firebase.initializeApp();
      }
      _log(
        'Firebase initialized. channels intake=$repairIntakeChannelId restored=$repairRestoredChannelId sounds intake=$_repairIntakeSoundName restored=$_repairRestoredSoundName',
      );

      await FirebaseMessaging.instance.requestPermission();
      FirebaseMessaging.onBackgroundMessage(firebaseMessagingBackgroundHandler);
      await _initializeLocalNotifications();
      _log('Firebase/local notifications initialized.');

      _foregroundSubscription ??= FirebaseMessaging.onMessage.listen(
        _showForegroundMessage,
      );

      final token = await FirebaseMessaging.instance.getToken();
      return NotificationSyncResult(
        isConfigured: true,
        isSuccess: true,
        fcmToken: token,
        message: 'Firebase notifications are ready.',
      );
    } catch (error) {
      _log('Initialization failed: $error');
      return NotificationSyncResult(
        isConfigured: false,
        isSuccess: false,
        message:
            'Firebase notifications are not configured yet. Add google-services.json to mobile/android/app/ and rebuild.',
      );
    }
  }

  static Future<void> _initializeLocalNotifications() async {
    const initializationSettings = InitializationSettings(
      android: AndroidInitializationSettings('ic_stat_vacuum'),
    );

    await _localNotifications.initialize(initializationSettings);
    _log('Local notification plugin initialized with icon ic_stat_vacuum.');
    final androidImplementation = _localNotifications
        .resolvePlatformSpecificImplementation<
          AndroidFlutterLocalNotificationsPlugin
        >();
    if (androidImplementation == null) {
      _log(
        'Android notification plugin is unavailable; channel sound inspection is not possible.',
      );
    }
    await _deleteOldDeveloperChannels(androidImplementation);
    await _createAndroidChannel(androidImplementation, _repairIntakeChannel);
    await _createAndroidChannel(androidImplementation, _repairRestoredChannel);
    await _inspectRestoredChannel(androidImplementation);
  }

  static Future<void> _deleteOldDeveloperChannels(
    AndroidFlutterLocalNotificationsPlugin? androidImplementation,
  ) async {
    if (androidImplementation == null) {
      _log(
        'Skipping old channel cleanup because Android notification plugin is unavailable.',
      );
      return;
    }

    for (final channelId in _oldDeveloperChannelIds) {
      try {
        await androidImplementation.deleteNotificationChannel(channelId);
      } catch (_) {
        // Old channel cleanup is best effort; notification setup must continue.
      }
    }
  }

  static Future<void> _createAndroidChannel(
    AndroidFlutterLocalNotificationsPlugin? androidImplementation,
    AndroidNotificationChannel channel,
  ) async {
    if (androidImplementation == null) {
      _log(
        'Cannot create channel ${channel.id}; Android notification plugin is unavailable.',
      );
      return;
    }

    final soundName = _soundNameForSound(channel.sound);
    _log(
      'Creating Android channel id=${channel.id} importance=${channel.importance.name} sound=$soundName playSound=${channel.playSound}.',
    );
    try {
      await androidImplementation.createNotificationChannel(channel);
      _log('Created Android channel id=${channel.id}.');
    } catch (error) {
      _log('Failed to create Android channel id=${channel.id}: $error');
      rethrow;
    }
  }

  static Future<void> _inspectRestoredChannel(
    AndroidFlutterLocalNotificationsPlugin? androidImplementation,
  ) async {
    if (androidImplementation == null) {
      _log(
        'Cannot inspect $repairRestoredChannelId; Android notification plugin is unavailable.',
      );
      return;
    }

    try {
      final channels = await androidImplementation.getNotificationChannels();
      if (channels == null) {
        _log(
          'Android plugin returned no notification channel list; cannot inspect channel sound.',
        );
        return;
      }

      AndroidNotificationChannel? restoredChannel;
      for (final channel in channels) {
        if (channel.id == repairRestoredChannelId) {
          restoredChannel = channel;
          break;
        }
      }
      if (restoredChannel == null) {
        _log('Channel inspection: $repairRestoredChannelId does not exist.');
        return;
      }

      _log(
        'Channel inspection: $repairRestoredChannelId exists importance=${restoredChannel.importance.name} playSound=${restoredChannel.playSound} sound=${_soundNameForSound(restoredChannel.sound)}.',
      );
    } catch (error) {
      _log('Channel inspection failed for $repairRestoredChannelId: $error');
    }
  }

  static Future<void> _showForegroundMessage(RemoteMessage message) async {
    final channel = _channelForMessage(message);
    final sound = _soundForChannel(channel.id);
    final notification = message.notification;
    final title =
        notification?.title ?? message.data['title']?.toString() ?? 'Vacuum';
    final body =
        notification?.body ??
        message.data['body']?.toString() ??
        'New Vacuum Traceability notification.';
    final eventType = message.data['eventType']?.toString();
    _log(
      'Foreground FCM received messageId=${message.messageId ?? 'n/a'} eventType=${eventType ?? 'n/a'} title="$title" body="$body" selectedChannel=${channel.id} selectedSound=${_soundNameForSound(sound)}.',
    );

    await _localNotifications.show(
      message.hashCode,
      title,
      body,
      NotificationDetails(
        android: AndroidNotificationDetails(
          channel.id,
          channel.name,
          channelDescription: channel.description,
          icon: 'ic_stat_vacuum',
          importance: Importance.max,
          priority: Priority.high,
          playSound: true,
          sound: sound,
        ),
      ),
    );
  }

  static AndroidNotificationChannel _channelForMessage(RemoteMessage message) {
    final eventType = message.data['eventType']?.toString();
    final remoteChannelId = message.notification?.android?.channelId;

    if (eventType == 'repair_restored' ||
        remoteChannelId == repairRestoredChannelId) {
      return _repairRestoredChannel;
    }

    return _repairIntakeChannel;
  }

  static RawResourceAndroidNotificationSound _soundForChannel(
    String channelId,
  ) {
    return RawResourceAndroidNotificationSound(
      channelId == repairRestoredChannelId
          ? _repairRestoredSoundName
          : _repairIntakeSoundName,
    );
  }

  static String _soundNameForSound(AndroidNotificationSound? sound) {
    if (sound == null) {
      return 'default';
    }

    try {
      return sound.sound;
    } catch (_) {
      return sound.runtimeType.toString();
    }
  }

  static void _log(String message) {
    debugPrint('[NOTIFICATIONS] $message');
  }
}
