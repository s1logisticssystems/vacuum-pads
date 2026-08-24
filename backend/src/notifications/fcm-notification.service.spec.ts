import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { FcmNotificationService } from './fcm-notification.service';
import {
  REPAIR_INTAKE_CHANNEL_ID,
  REPAIR_INTAKE_SOUND,
  REPAIR_INTAKE_TOPIC,
  REPAIR_RESTORED_CHANNEL_ID,
  REPAIR_RESTORED_SOUND,
  REPAIR_RESTORED_TOPIC,
} from './notification.types';

const mockSend = jest.fn();

jest.mock('firebase-admin/app', () => ({
  cert: jest.fn((serviceAccount: unknown) => ({ serviceAccount })),
  getApps: jest.fn(() => []),
  initializeApp: jest.fn(() => ({ name: 'vacuum-traceability-fcm' })),
}));

jest.mock('firebase-admin/messaging', () => ({
  getMessaging: jest.fn(() => ({
    send: mockSend,
  })),
}));

describe('FcmNotificationService', () => {
  const originalFirebaseServiceAccountPath =
    process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  let tempRoot: string;

  const getAppsMock = getApps as jest.MockedFunction<typeof getApps>;
  const initializeAppMock = initializeApp as jest.MockedFunction<
    typeof initializeApp
  >;
  const getMessagingMock = getMessaging as jest.MockedFunction<
    typeof getMessaging
  >;
  const certMock = cert as jest.MockedFunction<typeof cert>;

  beforeEach(() => {
    tempRoot = mkdtempSync(path.join(tmpdir(), 'vacuum-fcm-'));
    delete process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
    jest.clearAllMocks();
    getAppsMock.mockReturnValue([]);
    initializeAppMock.mockReturnValue({
      name: 'vacuum-traceability-fcm',
    } as never);
    mockSend.mockResolvedValue('message-id-1');
  });

  afterEach(() => {
    rmSync(tempRoot, { recursive: true, force: true });

    if (originalFirebaseServiceAccountPath) {
      process.env.FIREBASE_SERVICE_ACCOUNT_PATH =
        originalFirebaseServiceAccountPath;
    } else {
      delete process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
    }
  });

  it('is disabled when FIREBASE_SERVICE_ACCOUNT_PATH is missing', async () => {
    const service = new FcmNotificationService();

    expect(service.isEnabled).toBe(false);
    await expect(
      service.sendRepairIntakeNotification({
        repairId: 'repair-1',
        vacuumCode: 'VP-005',
      }),
    ).resolves.toBeUndefined();
    expect(getMessagingMock).not.toHaveBeenCalled();
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('handles an invalid service account path without throwing', async () => {
    process.env.FIREBASE_SERVICE_ACCOUNT_PATH = path.join(
      tempRoot,
      'missing-service-account.json',
    );

    const service = new FcmNotificationService();

    expect(service.isEnabled).toBe(false);
    await expect(
      service.sendRepairRestoredNotification({
        repairId: 'repair-1',
        vacuumCode: 'VP-005',
      }),
    ).resolves.toBeUndefined();
    expect(getMessagingMock).not.toHaveBeenCalled();
  });

  it('sends repair intake notifications to the configured topic', async () => {
    const serviceAccountPath = writeServiceAccount();
    process.env.FIREBASE_SERVICE_ACCOUNT_PATH = serviceAccountPath;

    const service = new FcmNotificationService();

    expect(service.isEnabled).toBe(true);
    await service.sendRepairIntakeNotification({
      repairId: 'repair-1',
      vacuumCode: 'VP-005',
      vacuumSerial: 'SN-VP-005',
      rackCode: 'RACK-REP-01',
    });

    expect(certMock).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 'vacuum-test',
      }),
    );
    expect(mockSend).toHaveBeenCalledWith({
      topic: REPAIR_INTAKE_TOPIC,
      notification: {
        title: 'Vacuum σε επισκευή',
        body: 'Το Vacuum SN-VP-005 δηλώθηκε με βλάβη στη θέση RACK-REP-01.',
      },
      android: {
        priority: 'high',
        notification: {
          channelId: REPAIR_INTAKE_CHANNEL_ID,
          sound: REPAIR_INTAKE_SOUND,
          defaultSound: false,
          priority: 'high',
        },
      },
      data: {
        eventType: 'repair_intake',
        vacuumCode: 'VP-005',
        vacuumSerial: 'SN-VP-005',
        rackCode: 'RACK-REP-01',
        repairId: 'repair-1',
      },
    });
  });

  it('sends repair restored notifications to the configured topic', async () => {
    const serviceAccountPath = writeServiceAccount();
    process.env.FIREBASE_SERVICE_ACCOUNT_PATH = serviceAccountPath;

    const service = new FcmNotificationService();
    await service.sendRepairRestoredNotification({
      repairId: 'repair-1',
      vacuumCode: 'VP-005',
      vacuumSerial: 'SN-VP-005',
      rackCode: 'RACK-A-01-07',
    });

    expect(mockSend).toHaveBeenCalledWith({
      topic: REPAIR_RESTORED_TOPIC,
      notification: {
        title: 'Αποκατάσταση Vacuum',
        body: 'Το Vacuum SN-VP-005 αποκαταστάθηκε και τοποθετήθηκε στη θέση RACK-A-01-07.',
      },
      android: {
        priority: 'high',
        notification: {
          channelId: REPAIR_RESTORED_CHANNEL_ID,
          sound: REPAIR_RESTORED_SOUND,
          defaultSound: false,
          priority: 'high',
        },
      },
      data: {
        eventType: 'repair_restored',
        vacuumCode: 'VP-005',
        vacuumSerial: 'SN-VP-005',
        rackCode: 'RACK-A-01-07',
        repairId: 'repair-1',
      },
    });
  });

  it('swallows Firebase send failures', async () => {
    const serviceAccountPath = writeServiceAccount();
    process.env.FIREBASE_SERVICE_ACCOUNT_PATH = serviceAccountPath;
    mockSend.mockRejectedValue(new Error('network down'));

    const service = new FcmNotificationService();

    await expect(
      service.sendRepairIntakeNotification({
        repairId: 'repair-1',
        vacuumCode: 'VP-005',
      }),
    ).resolves.toBeUndefined();
  });

  function writeServiceAccount(): string {
    const serviceAccountPath = path.join(tempRoot, 'service-account.json');
    writeFileSync(
      serviceAccountPath,
      JSON.stringify({
        projectId: 'vacuum-test',
        clientEmail: 'firebase-adminsdk@example.invalid',
        privateKey:
          '-----BEGIN PRIVATE KEY-----\\nlocal-test\\n-----END PRIVATE KEY-----\\n',
      }),
    );

    return serviceAccountPath;
  }
});
