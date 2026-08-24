import { Injectable, Logger } from '@nestjs/common';
import {
  cert,
  getApps,
  initializeApp,
  type App,
  type ServiceAccount,
} from 'firebase-admin/app';
import {
  getMessaging,
  type Message,
  type Messaging,
} from 'firebase-admin/messaging';
import { existsSync, readFileSync } from 'node:fs';
import * as path from 'node:path';
import {
  REPAIR_INTAKE_CHANNEL_ID,
  REPAIR_INTAKE_SOUND,
  REPAIR_INTAKE_TOPIC,
  REPAIR_RESTORED_CHANNEL_ID,
  REPAIR_RESTORED_SOUND,
  REPAIR_RESTORED_TOPIC,
  type RepairNotificationPayload,
} from './notification.types';

const FIREBASE_APP_NAME = 'vacuum-traceability-fcm';

@Injectable()
export class FcmNotificationService {
  private readonly logger = new Logger(FcmNotificationService.name);
  private readonly messaging: Messaging | null;

  constructor() {
    this.messaging = this.initializeMessaging();
  }

  get isEnabled(): boolean {
    return this.messaging !== null;
  }

  async sendRepairIntakeNotification(
    payload: RepairNotificationPayload,
  ): Promise<void> {
    const vacuumLabel = this.getVacuumLabel(payload);
    const rackLabel = payload.rackCode ?? 'επισκευής';

    await this.sendTopicNotification({
      topic: REPAIR_INTAKE_TOPIC,
      title: 'Vacuum σε επισκευή',
      body: `Το Vacuum ${vacuumLabel} δηλώθηκε με βλάβη στη θέση ${rackLabel}.`,
      eventType: 'repair_intake',
      androidChannelId: REPAIR_INTAKE_CHANNEL_ID,
      androidSound: REPAIR_INTAKE_SOUND,
      payload,
    });
  }

  async sendRepairRestoredNotification(
    payload: RepairNotificationPayload,
  ): Promise<void> {
    const vacuumLabel = this.getVacuumLabel(payload);
    const rackLabel = payload.rackCode ?? 'επιστροφής';

    await this.sendTopicNotification({
      topic: REPAIR_RESTORED_TOPIC,
      title: 'Αποκατάσταση Vacuum',
      body: `Το Vacuum ${vacuumLabel} αποκαταστάθηκε και τοποθετήθηκε στη θέση ${rackLabel}.`,
      eventType: 'repair_restored',
      androidChannelId: REPAIR_RESTORED_CHANNEL_ID,
      androidSound: REPAIR_RESTORED_SOUND,
      payload,
    });
  }

  private initializeMessaging(): Messaging | null {
    const configuredPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH?.trim();

    if (!configuredPath) {
      this.logger.log(
        'Firebase notifications disabled: FIREBASE_SERVICE_ACCOUNT_PATH is not configured.',
      );
      return null;
    }

    const serviceAccountPath = path.isAbsolute(configuredPath)
      ? configuredPath
      : path.resolve(process.cwd(), configuredPath);

    if (!existsSync(serviceAccountPath)) {
      this.logger.warn(
        `Firebase notifications disabled: service account file was not found at ${serviceAccountPath}.`,
      );
      return null;
    }

    try {
      const serviceAccount = JSON.parse(
        readFileSync(serviceAccountPath, 'utf8'),
      ) as ServiceAccount;
      const existingApp = getApps().find(
        (app) => app.name === FIREBASE_APP_NAME,
      );
      const app: App =
        existingApp ??
        initializeApp(
          {
            credential: cert(serviceAccount),
          },
          FIREBASE_APP_NAME,
        );

      return getMessaging(app);
    } catch (error) {
      this.logger.warn(
        `Firebase notifications disabled: service account could not be loaded (${this.getErrorMessage(error)}).`,
      );
      return null;
    }
  }

  private async sendTopicNotification(params: {
    topic: string;
    title: string;
    body: string;
    eventType: 'repair_intake' | 'repair_restored';
    androidChannelId: string;
    androidSound: string;
    payload: RepairNotificationPayload;
  }): Promise<void> {
    if (!this.messaging) {
      this.logger.log(
        `[FCM] Skipping ${params.eventType} notification because Firebase messaging is disabled.`,
      );
      return;
    }

    const message: Message = {
      topic: params.topic,
      notification: {
        title: params.title,
        body: params.body,
      },
      android: {
        priority: 'high',
        notification: {
          channelId: params.androidChannelId,
          sound: params.androidSound,
          defaultSound: false,
          priority: 'high',
        },
      },
      data: this.buildDataPayload(params.eventType, params.payload),
    };

    try {
      this.logger.log(
        `[FCM] Sending eventType=${params.eventType} topic=${params.topic} title="${params.title}" body="${params.body}" androidChannelId=${params.androidChannelId} sound=${params.androidSound} defaultSound=false priority=high.`,
      );
      const messageId = await this.messaging.send(message);
      this.logger.log(
        `[FCM] Firebase topic notification sent eventType=${params.eventType} topic=${params.topic} messageId=${messageId}.`,
      );
    } catch (error) {
      this.logger.warn(
        `[FCM] Firebase topic notification failed eventType=${params.eventType} topic=${params.topic}: ${this.getErrorDiagnostics(error)}`,
      );
    }
  }

  private buildDataPayload(
    eventType: 'repair_intake' | 'repair_restored',
    payload: RepairNotificationPayload,
  ): Record<string, string> {
    return Object.fromEntries(
      Object.entries({
        eventType,
        vacuumCode: payload.vacuumCode,
        vacuumSerial: payload.vacuumSerial,
        rackCode: payload.rackCode,
        repairId: payload.repairId,
      }).filter(([, value]) => value !== undefined && value !== null),
    ) as Record<string, string>;
  }

  private getVacuumLabel(payload: RepairNotificationPayload): string {
    return payload.vacuumSerial ?? payload.vacuumCode ?? 'χωρίς κωδικό';
  }

  private getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'unknown error';
  }

  private getErrorDiagnostics(error: unknown): string {
    const message = this.getErrorMessage(error);

    if (typeof error !== 'object' || error === null) {
      return message;
    }

    const maybeFirebaseError = error as { code?: unknown; errorInfo?: unknown };
    const code =
      typeof maybeFirebaseError.code === 'string'
        ? maybeFirebaseError.code
        : undefined;
    const errorInfo =
      typeof maybeFirebaseError.errorInfo === 'object' &&
      maybeFirebaseError.errorInfo !== null
        ? JSON.stringify(maybeFirebaseError.errorInfo)
        : undefined;

    return [message, code ? `code=${code}` : null, errorInfo]
      .filter(Boolean)
      .join(' ');
  }
}
