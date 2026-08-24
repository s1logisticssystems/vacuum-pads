import {
  AuditAction,
  LocationStatus,
  MachineStatus,
  MovementType,
  OperationalStatus,
  PhotoStorageProvider,
  RackLocationType,
  RepairPhotoStage,
  RepairPriority,
  RepairOutcome,
  RepairStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { QrService } from '../qr/qr.service';
import { StorageService } from '../storage/storage.service';
import {
  CurrentRackLocationSummary,
  QrEntityType,
  QrInputFormat,
  QrScanContext,
  VacuumScanEntity,
} from '../qr/qr.types';
import {
  InvalidRepairPhotoFileError,
  RepairPhotoUploadFailedError,
} from '../storage/storage.types';
import { FcmNotificationService } from '../notifications/fcm-notification.service';
import { FaultDeclarationDto } from './dto/fault-declaration.dto';
import { FaultDeclarationPreviewDto } from './dto/fault-declaration-preview.dto';
import { FaultRestorationDto } from './dto/fault-restoration.dto';
import { FaultRestorationPreviewDto } from './dto/fault-restoration-preview.dto';
import { RepairPhotoUploadDto } from './dto/repair-photo-upload.dto';
import { FaultService } from './fault.service';

describe('FaultService', () => {
  let service: FaultService;
  let qrScan: jest.Mock;
  let qrParseRawPayload: jest.Mock;
  let faultCatalogFindFirst: jest.Mock;
  let faultCatalogFindMany: jest.Mock;
  let repairFindFirst: jest.Mock;
  let repairCreate: jest.Mock;
  let repairUpdate: jest.Mock;
  let repairPhotoCreate: jest.Mock;
  let repairPhotoCount: jest.Mock;
  let repairPhotoDelete: jest.Mock;
  let repairPhotoFindFirst: jest.Mock;
  let repairPhotoFindMany: jest.Mock;
  let rackLocationFindMany: jest.Mock;
  let rackLocationFindUnique: jest.Mock;
  let vacuumPadFindFirst: jest.Mock;
  let vacuumPadFindMany: jest.Mock;
  let vacuumPadUpdate: jest.Mock;
  let padMovementCreate: jest.Mock;
  let auditLogCreate: jest.Mock;
  let transactionMock: jest.Mock;
  let storageStoreRepairPhoto: jest.Mock;
  let storageCleanupStoredPhoto: jest.Mock;
  let storageCreateRepairPhotoViewUrl: jest.Mock;
  let storageDeleteStoredRepairPhoto: jest.Mock;
  let sendRepairIntakeNotification: jest.Mock;
  let sendRepairRestoredNotification: jest.Mock;

  const currentRackLocation = (
    overrides: Partial<CurrentRackLocationSummary> = {},
  ): CurrentRackLocationSummary => ({
    id: 'rack-1',
    code: 'RACK-A-01-05',
    qrCode: 'QR-RACK-A-01-05',
    label: 'Rack A-01 Slot 05',
    type: RackLocationType.AVL,
    zone: 'A',
    rack: 'A-01',
    level: '1',
    slot: '05',
    ...overrides,
  });

  const vacuumSummary = (
    overrides: Partial<VacuumScanEntity> = {},
  ): VacuumScanEntity => ({
    id: 'pad-5',
    code: 'VP-005',
    qrCode: 'QR-VP-005',
    serialNumber: 'SN-VP-005',
    description: 'Sample vacuum',
    locationStatus: LocationStatus.IN_RACK,
    operationalStatus: OperationalStatus.FUNCTIONAL,
    displayStatus: 'NOTACTIVE',
    currentMachine: null,
    currentRackLocation: currentRackLocation(),
    ...overrides,
  });

  const vacuumRecord = (overrides: Record<string, unknown> = {}) => ({
    id: 'pad-5',
    code: 'VP-005',
    qrCode: 'QR-VP-005',
    serialNumber: 'SN-VP-005',
    description: 'Sample vacuum',
    locationStatus: LocationStatus.IN_RACK,
    operationalStatus: OperationalStatus.FUNCTIONAL,
    currentMachineId: null,
    currentRackLocationId: 'rack-1',
    currentMachine: null,
    currentRackLocation: {
      id: 'rack-1',
      code: 'RACK-A-01-05',
      qrCode: 'QR-RACK-A-01-05',
      label: 'Rack A-01 Slot 05',
      type: RackLocationType.AVL,
      zone: 'A',
      rack: 'A-01',
      level: '1',
      slot: '05',
    },
    ...overrides,
  });

  const faultCatalogRecord = (overrides: Record<string, unknown> = {}) => ({
    id: 'fault-1',
    code: 'FC-001',
    label: 'Surface damage',
    description: 'Visible wear or damage on the vacuum pad surface.',
    sortOrder: 1,
    ...overrides,
  });

  const repairRecord = (overrides: Record<string, unknown> = {}) => ({
    id: 'repair-1',
    vacuumPadId: 'pad-5',
    status: RepairStatus.REPORTED,
    priority: RepairPriority.NORMAL,
    problemDescription:
      'Surface damage: Visible wear or damage on the vacuum pad surface.',
    faultCatalogId: 'fault-1',
    faultOtherText: null,
    operatorName: 'Operator One',
    reportedAt: new Date('2026-05-22T12:00:00.000Z'),
    ...overrides,
  });

  const restoredRepairRecord = (overrides: Record<string, unknown> = {}) => ({
    id: 'repair-1',
    vacuumPadId: 'pad-5',
    status: RepairStatus.COMPLETED,
    priority: RepairPriority.NORMAL,
    outcome: RepairOutcome.RETURNED_TO_SERVICE,
    problemDescription:
      'Surface damage: Visible wear or damage on the vacuum pad surface.',
    faultCatalogId: 'fault-1',
    faultOtherText: null,
    operatorName: 'Operator One',
    reportedAt: new Date('2026-05-22T12:00:00.000Z'),
    completedAt: new Date('2026-05-22T13:00:00.000Z'),
    technicianNotes: 'Repair complete',
    repairActions: 'Repaired damaged surface',
    spareParts: 'Seal kit',
    repairCost: {
      toString: () => '12.50',
    },
    faultCatalog: faultCatalogRecord(),
    ...overrides,
  });

  const openRepairPreviewRecord = (
    overrides: Record<string, unknown> = {},
  ) => ({
    id: 'repair-1',
    status: RepairStatus.REPORTED,
    priority: RepairPriority.NORMAL,
    problemDescription:
      'Surface damage: Visible wear or damage on the vacuum pad surface.',
    faultOtherText: null,
    operatorName: 'Operator One',
    reportedAt: new Date('2026-05-22T12:00:00.000Z'),
    faultCatalog: faultCatalogRecord(),
    ...overrides,
  });

  const openRepairWriteRecord = (overrides: Record<string, unknown> = {}) => ({
    id: 'repair-1',
    vacuumPadId: 'pad-5',
    status: RepairStatus.UNDER_REPAIR,
    priority: RepairPriority.NORMAL,
    outcome: null,
    problemDescription:
      'Surface damage: Visible wear or damage on the vacuum pad surface.',
    faultCatalogId: 'fault-1',
    faultOtherText: null,
    operatorName: 'Operator One',
    reportedAt: new Date('2026-05-22T12:00:00.000Z'),
    completedAt: null,
    technicianNotes: null,
    repairActions: null,
    spareParts: null,
    repairCost: null,
    faultCatalog: faultCatalogRecord(),
    ...overrides,
  });

  const rackDbRecord = (overrides: Record<string, unknown> = {}) => ({
    id: 'rack-7',
    code: 'RACK-A-01-07',
    qrCode: 'QR-RACK-A-01-07',
    label: 'Rack A-01 Slot 07',
    type: RackLocationType.AVL,
    zone: 'A',
    rack: 'A-01',
    level: '1',
    slot: '07',
    currentPads: [],
    ...overrides,
  });

  const previewDto = (
    overrides: Partial<FaultDeclarationPreviewDto> = {},
  ): FaultDeclarationPreviewDto => ({
    vacuumQr: 'VAC:VP-005',
    deviceId: 'device-01',
    operatorName: 'Operator One',
    ...overrides,
  });

  const declarationDto = (
    overrides: Partial<FaultDeclarationDto> = {},
  ): FaultDeclarationDto => ({
    vacuumQr: 'VAC:VP-005',
    faultCatalogCode: 'FC-001',
    deviceId: 'device-01',
    operatorName: 'Operator One',
    note: 'Damage observed during inspection',
    ...overrides,
  });

  const restorationPreviewDto = (
    overrides: Partial<FaultRestorationPreviewDto> = {},
  ): FaultRestorationPreviewDto => ({
    vacuumQr: 'VAC:VP-005',
    deviceId: 'device-01',
    operatorName: 'Operator One',
    ...overrides,
  });

  const restorationDto = (
    overrides: Partial<FaultRestorationDto> = {},
  ): FaultRestorationDto => ({
    vacuumQr: 'VAC:VP-005',
    rackQr: 'RACK-A-01-07',
    outcome: RepairOutcome.RETURNED_TO_SERVICE,
    deviceId: 'device-01',
    operatorName: 'Operator One',
    note: 'Repair complete',
    ...overrides,
  });

  const photoUploadDto = (
    overrides: Partial<RepairPhotoUploadDto> = {},
  ): RepairPhotoUploadDto => ({
    deviceId: 'device-01',
    operatorName: 'Operator One',
    caption: 'Damage close-up',
    ...overrides,
  });

  const uploadFile = (
    overrides: Partial<Express.Multer.File> = {},
  ): Express.Multer.File => ({
    fieldname: 'file',
    originalname: 'repair-photo.png',
    encoding: '7bit',
    mimetype: 'image/png',
    size: 4,
    buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
    stream: undefined as never,
    destination: '',
    filename: '',
    path: '',
    ...overrides,
  });

  beforeEach(() => {
    qrScan = jest.fn();
    qrParseRawPayload = jest.fn();
    faultCatalogFindFirst = jest.fn();
    faultCatalogFindMany = jest.fn();
    repairFindFirst = jest.fn();
    repairCreate = jest.fn();
    repairUpdate = jest.fn();
    repairPhotoCreate = jest.fn();
    repairPhotoCount = jest.fn().mockResolvedValue(1);
    repairPhotoDelete = jest.fn();
    repairPhotoFindFirst = jest.fn();
    repairPhotoFindMany = jest.fn();
    rackLocationFindMany = jest.fn();
    rackLocationFindUnique = jest.fn();
    vacuumPadFindFirst = jest.fn();
    vacuumPadFindMany = jest.fn();
    vacuumPadUpdate = jest.fn();
    padMovementCreate = jest.fn();
    auditLogCreate = jest.fn();
    storageStoreRepairPhoto = jest.fn();
    storageCleanupStoredPhoto = jest.fn().mockResolvedValue(undefined);
    storageCreateRepairPhotoViewUrl = jest.fn().mockResolvedValue({
      url: 'http://localhost:9000/signed-photo-url',
      expiresAt: '2026-05-22T12:10:00.000Z',
      source: 'SIGNED',
    });
    storageDeleteStoredRepairPhoto = jest.fn().mockResolvedValue(undefined);
    sendRepairIntakeNotification = jest.fn().mockResolvedValue(undefined);
    sendRepairRestoredNotification = jest.fn().mockResolvedValue(undefined);

    const txClient = {
      faultCatalog: {
        findFirst: faultCatalogFindFirst,
        findMany: faultCatalogFindMany,
      },
      repair: {
        findFirst: repairFindFirst,
        create: repairCreate,
        update: repairUpdate,
      },
      repairPhoto: {
        count: repairPhotoCount,
        create: repairPhotoCreate,
        delete: repairPhotoDelete,
        findFirst: repairPhotoFindFirst,
        findMany: repairPhotoFindMany,
      },
      rackLocation: {
        findMany: rackLocationFindMany,
        findUnique: rackLocationFindUnique,
      },
      vacuumPad: {
        findFirst: vacuumPadFindFirst,
        findMany: vacuumPadFindMany,
        update: vacuumPadUpdate,
      },
      padMovement: {
        create: padMovementCreate,
      },
      auditLog: {
        create: auditLogCreate,
      },
    };

    transactionMock = jest.fn((callback: (tx: typeof txClient) => unknown) =>
      callback(txClient),
    );

    const prismaService = {
      $transaction: transactionMock,
      faultCatalog: {
        findFirst: faultCatalogFindFirst,
        findMany: faultCatalogFindMany,
      },
      repair: {
        findFirst: repairFindFirst,
        create: repairCreate,
        update: repairUpdate,
      },
      repairPhoto: {
        count: repairPhotoCount,
        create: repairPhotoCreate,
        delete: repairPhotoDelete,
        findFirst: repairPhotoFindFirst,
        findMany: repairPhotoFindMany,
      },
      rackLocation: {
        findMany: rackLocationFindMany,
        findUnique: rackLocationFindUnique,
      },
      vacuumPad: {
        findFirst: vacuumPadFindFirst,
        findMany: vacuumPadFindMany,
        update: vacuumPadUpdate,
      },
      padMovement: {
        create: padMovementCreate,
      },
      auditLog: {
        create: auditLogCreate,
      },
    } as unknown as PrismaService;

    const qrService = {
      scan: qrScan,
      parseRawPayload: qrParseRawPayload,
    } as unknown as QrService;

    const storageService = {
      storeRepairPhoto: storageStoreRepairPhoto,
      cleanupStoredPhoto: storageCleanupStoredPhoto,
      createRepairPhotoViewUrl: storageCreateRepairPhotoViewUrl,
      deleteStoredRepairPhoto: storageDeleteStoredRepairPhoto,
    } as unknown as StorageService;

    const notificationService = {
      sendRepairIntakeNotification,
      sendRepairRestoredNotification,
    } as unknown as FcmNotificationService;

    service = new FaultService(
      prismaService,
      qrService,
      storageService,
      notificationService,
    );

    qrParseRawPayload.mockImplementation((raw: string) => {
      const normalized = raw.trim();

      if (normalized.startsWith('VAC:')) {
        return {
          ok: true,
          payload: {
            entityType: QrEntityType.VACUUM,
            value: normalized.slice(4),
            format: QrInputFormat.COMPACT,
          },
        };
      }

      if (normalized.startsWith('RACK:')) {
        return {
          ok: true,
          payload: {
            entityType: QrEntityType.RACK,
            value: normalized.slice(5),
            format: QrInputFormat.COMPACT,
          },
        };
      }

      return {
        ok: false,
        errorCode: 'QR_UNSUPPORTED',
        message: 'Unsupported QR type or format',
        format: QrInputFormat.COMPACT,
      };
    });
  });

  it('returns SELECT_FAULT for an eligible vacuum without a selected fault', async () => {
    qrScan.mockResolvedValue({
      ok: true,
      entityType: QrEntityType.VACUUM,
      input: {
        raw: 'VAC:VP-005',
        normalizedRaw: 'VAC:VP-005',
        context: QrScanContext.FAULT_REPORT,
        deviceId: 'device-01',
        operatorName: 'Operator One',
        format: QrInputFormat.COMPACT,
      },
      entity: vacuumSummary(),
      workflowHints: {
        context: QrScanContext.FAULT_REPORT,
        canContinue: true,
        reason: 'vacuum is eligible for fault reporting',
        nextExpectedEntityTypes: [],
      },
    });

    const result = await service.previewDeclaration(previewDto());

    expect(result).toEqual({
      ok: true,
      decision: 'SELECT_FAULT',
      message:
        'Vacuum is eligible. Select a fault category or enter other fault details',
      vacuum: vacuumSummary(),
      rack: null,
      faultCatalog: null,
      requiredNextAction: 'SELECT_FAULT',
    });
    expect(faultCatalogFindFirst).not.toHaveBeenCalled();
  });

  it('returns SELECT_FAULT for a REP-rack pending fault declaration vacuum', async () => {
    const pendingVacuum = vacuumSummary({
      locationStatus: LocationStatus.IN_REPAIR,
      operationalStatus: OperationalStatus.INSPECTION_REQUIRED,
      displayStatus: 'REPAIR',
      currentRackLocation: currentRackLocation({
        id: 'rack-rep-1',
        code: 'RACK-REP-01',
        qrCode: 'QR-RACK-REP-01',
        label: 'Repair Rack 01',
        type: RackLocationType.REP,
        zone: 'REP',
        rack: 'REP-01',
        slot: '01',
      }),
    });

    qrScan.mockResolvedValue({
      ok: true,
      entityType: QrEntityType.VACUUM,
      input: {
        raw: 'VAC:VP-005',
        normalizedRaw: 'VAC:VP-005',
        context: QrScanContext.FAULT_REPORT,
        deviceId: 'device-01',
        operatorName: 'Operator One',
        format: QrInputFormat.COMPACT,
      },
      entity: pendingVacuum,
      workflowHints: {
        context: QrScanContext.FAULT_REPORT,
        canContinue: true,
        reason: 'vacuum needs fault declaration after REP decharge',
        nextExpectedEntityTypes: [],
      },
    });
    repairFindFirst.mockResolvedValue(null);

    const result = await service.previewDeclaration(previewDto());

    expect(result).toMatchObject({
      ok: true,
      decision: 'SELECT_FAULT',
      vacuum: {
        locationStatus: LocationStatus.IN_REPAIR,
        operationalStatus: OperationalStatus.INSPECTION_REQUIRED,
      },
      requiredNextAction: 'SELECT_FAULT',
    });
    expect(repairFindFirst).toHaveBeenCalledWith({
      where: {
        vacuumPadId: 'pad-5',
        completedAt: null,
        status: {
          in: [
            RepairStatus.REPORTED,
            RepairStatus.ASSIGNED,
            RepairStatus.UNDER_REPAIR,
          ],
        },
      },
      select: {
        id: true,
      },
    });
  });

  it('returns CAN_DECLARE_FAULT for an eligible vacuum with a fault catalog code', async () => {
    qrScan.mockResolvedValue({
      ok: true,
      entityType: QrEntityType.VACUUM,
      input: {
        raw: 'VAC:VP-005',
        normalizedRaw: 'VAC:VP-005',
        context: QrScanContext.FAULT_REPORT,
        deviceId: 'device-01',
        operatorName: 'Operator One',
        format: QrInputFormat.COMPACT,
      },
      entity: vacuumSummary(),
      workflowHints: {
        context: QrScanContext.FAULT_REPORT,
        canContinue: true,
        reason: 'vacuum is eligible for fault reporting',
        nextExpectedEntityTypes: [],
      },
    });
    faultCatalogFindFirst.mockResolvedValue(faultCatalogRecord());

    const result = await service.previewDeclaration(
      previewDto({ faultCatalogCode: 'FC-001' }),
    );

    expect(result).toEqual({
      ok: true,
      decision: 'CAN_DECLARE_FAULT',
      message: 'Vacuum is eligible for fault declaration',
      vacuum: vacuumSummary(),
      rack: null,
      faultCatalog: faultCatalogRecord(),
      requiredNextAction: 'CAPTURE_PHOTO_OPTIONAL',
    });
  });

  it('returns CAN_DECLARE_FAULT for a REP-rack pending vacuum with a valid fault catalog', async () => {
    const pendingVacuum = vacuumSummary({
      locationStatus: LocationStatus.IN_REPAIR,
      operationalStatus: OperationalStatus.INSPECTION_REQUIRED,
      displayStatus: 'REPAIR',
      currentRackLocation: currentRackLocation({
        id: 'rack-rep-1',
        code: 'RACK-REP-01',
        qrCode: 'QR-RACK-REP-01',
        label: 'Repair Rack 01',
        type: RackLocationType.REP,
        zone: 'REP',
        rack: 'REP-01',
        slot: '01',
      }),
    });

    qrScan.mockResolvedValue({
      ok: true,
      entityType: QrEntityType.VACUUM,
      input: {
        raw: 'VAC:VP-005',
        normalizedRaw: 'VAC:VP-005',
        context: QrScanContext.FAULT_REPORT,
        deviceId: 'device-01',
        operatorName: 'Operator One',
        format: QrInputFormat.COMPACT,
      },
      entity: pendingVacuum,
      workflowHints: {
        context: QrScanContext.FAULT_REPORT,
        canContinue: true,
        reason: 'vacuum needs fault declaration after REP decharge',
        nextExpectedEntityTypes: [],
      },
    });
    repairFindFirst.mockResolvedValue(null);
    faultCatalogFindFirst.mockResolvedValue(faultCatalogRecord());

    const result = await service.previewDeclaration(
      previewDto({ faultCatalogCode: 'FC-001' }),
    );

    expect(result).toMatchObject({
      ok: true,
      decision: 'CAN_DECLARE_FAULT',
      vacuum: {
        locationStatus: LocationStatus.IN_REPAIR,
        operationalStatus: OperationalStatus.INSPECTION_REQUIRED,
      },
      faultCatalog: {
        code: 'FC-001',
      },
      requiredNextAction: 'CAPTURE_PHOTO_OPTIONAL',
    });
  });

  it('returns CAN_DECLARE_FAULT for an eligible vacuum with other text only', async () => {
    qrScan.mockResolvedValue({
      ok: true,
      entityType: QrEntityType.VACUUM,
      input: {
        raw: 'VAC:VP-005',
        normalizedRaw: 'VAC:VP-005',
        context: QrScanContext.FAULT_REPORT,
        deviceId: 'device-01',
        operatorName: 'Operator One',
        format: QrInputFormat.COMPACT,
      },
      entity: vacuumSummary(),
      workflowHints: {
        context: QrScanContext.FAULT_REPORT,
        canContinue: true,
        reason: 'vacuum is eligible for fault reporting',
        nextExpectedEntityTypes: [],
      },
    });

    const result = await service.previewDeclaration(
      previewDto({ faultOtherText: 'Observed unusual seal wear' }),
    );

    expect(result).toEqual({
      ok: true,
      decision: 'CAN_DECLARE_FAULT',
      message: 'Vacuum is eligible for fault declaration',
      vacuum: vacuumSummary(),
      rack: null,
      faultCatalog: null,
      requiredNextAction: 'CAPTURE_PHOTO_OPTIONAL',
    });
  });

  it('returns SELECT_FAULT when an eligible vacuum and REP rack are selected', async () => {
    qrScan.mockResolvedValue({
      ok: true,
      entityType: QrEntityType.VACUUM,
      input: {
        raw: 'VAC:VP-005',
        normalizedRaw: 'VAC:VP-005',
        context: QrScanContext.FAULT_REPORT,
        deviceId: 'device-01',
        operatorName: 'Operator One',
        format: QrInputFormat.COMPACT,
      },
      entity: vacuumSummary(),
      workflowHints: {
        context: QrScanContext.FAULT_REPORT,
        canContinue: true,
        reason: 'vacuum is eligible for fault reporting',
        nextExpectedEntityTypes: [],
      },
    });
    rackLocationFindMany.mockResolvedValue([
      rackDbRecord({
        id: 'rack-rep-1',
        code: 'RACK-REP-01',
        qrCode: 'QR-RACK-REP-01',
        label: 'Repair Rack 01',
        type: RackLocationType.REP,
      }),
    ]);

    const result = await service.previewDeclaration(
      previewDto({ rackQr: 'RACK:RACK-REP-01' }),
    );

    expect(result).toMatchObject({
      ok: true,
      decision: 'SELECT_FAULT',
      rack: {
        code: 'RACK-REP-01',
        type: RackLocationType.REP,
      },
      requiredNextAction: 'SELECT_FAULT',
    });
  });

  it('does not accept rack label as a declaration scan alias', async () => {
    qrScan.mockResolvedValue({
      ok: true,
      entityType: QrEntityType.VACUUM,
      input: {
        raw: 'VAC:VP-005',
        normalizedRaw: 'VAC:VP-005',
        context: QrScanContext.FAULT_REPORT,
        deviceId: 'device-01',
        operatorName: 'Operator One',
        format: QrInputFormat.COMPACT,
      },
      entity: vacuumSummary(),
      workflowHints: {
        context: QrScanContext.FAULT_REPORT,
        canContinue: true,
        reason: 'vacuum is eligible for fault reporting',
        nextExpectedEntityTypes: [],
      },
    });
    rackLocationFindMany.mockResolvedValue([]);

    const result = await service.previewDeclaration(
      previewDto({ rackQr: 'Repair Rack 01' }),
    );

    expect(result).toMatchObject({
      ok: false,
      decision: 'RACK_NOT_FOUND',
    });
    expect(rackLocationFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          deletedAt: null,
          isActive: true,
          OR: [{ code: 'Repair Rack 01' }, { qrCode: 'Repair Rack 01' }],
        },
      }),
    );
  });

  it('returns RACK_NOT_ALLOWED when a non-REP rack is selected for declaration', async () => {
    qrScan.mockResolvedValue({
      ok: true,
      entityType: QrEntityType.VACUUM,
      input: {
        raw: 'VAC:VP-005',
        normalizedRaw: 'VAC:VP-005',
        context: QrScanContext.FAULT_REPORT,
        deviceId: 'device-01',
        operatorName: 'Operator One',
        format: QrInputFormat.COMPACT,
      },
      entity: vacuumSummary(),
      workflowHints: {
        context: QrScanContext.FAULT_REPORT,
        canContinue: true,
        reason: 'vacuum is eligible for fault reporting',
        nextExpectedEntityTypes: [],
      },
    });
    rackLocationFindMany.mockResolvedValue([rackDbRecord()]);

    const result = await service.previewDeclaration(
      previewDto({ rackQr: 'RACK-A-01-07' }),
    );

    expect(result).toMatchObject({
      ok: false,
      decision: 'RACK_NOT_ALLOWED',
      message: 'Selected rack is not a repair rack',
      rack: {
        code: 'RACK-A-01-07',
        type: RackLocationType.AVL,
      },
    });
  });

  it('returns RACK_OCCUPIED when the selected declaration rack has another pad', async () => {
    qrScan.mockResolvedValue({
      ok: true,
      entityType: QrEntityType.VACUUM,
      input: {
        raw: 'VAC:VP-005',
        normalizedRaw: 'VAC:VP-005',
        context: QrScanContext.FAULT_REPORT,
        deviceId: 'device-01',
        operatorName: 'Operator One',
        format: QrInputFormat.COMPACT,
      },
      entity: vacuumSummary(),
      workflowHints: {
        context: QrScanContext.FAULT_REPORT,
        canContinue: true,
        reason: 'vacuum is eligible for fault reporting',
        nextExpectedEntityTypes: [],
      },
    });
    rackLocationFindMany.mockResolvedValue([
      rackDbRecord({
        id: 'rack-rep-1',
        code: 'RACK-REP-01',
        qrCode: 'QR-RACK-REP-01',
        label: 'Repair Rack 01',
        type: RackLocationType.REP,
        currentPads: [
          {
            id: 'pad-other',
            code: 'VP-999',
            qrCode: 'QR-VP-999',
            serialNumber: 'SN-VP-999',
            locationStatus: LocationStatus.IN_REPAIR,
            operationalStatus: OperationalStatus.UNDER_REPAIR,
            currentMachineId: null,
          },
        ],
      }),
    ]);

    const result = await service.previewDeclaration(
      previewDto({ rackQr: 'RACK-REP-01' }),
    );

    expect(result).toMatchObject({
      ok: false,
      decision: 'RACK_OCCUPIED',
      message: 'Selected rack is already occupied',
      rack: {
        currentPad: {
          id: 'pad-other',
        },
      },
    });
  });

  it('returns MUST_DECHARGE_FIRST for an active vacuum', async () => {
    qrScan.mockResolvedValue({
      ok: true,
      entityType: QrEntityType.VACUUM,
      input: {
        raw: 'VAC:VP-001',
        normalizedRaw: 'VAC:VP-001',
        context: QrScanContext.FAULT_REPORT,
        deviceId: 'device-01',
        operatorName: 'Operator One',
        format: QrInputFormat.COMPACT,
      },
      entity: vacuumSummary({
        id: 'pad-1',
        code: 'VP-001',
        qrCode: 'QR-VP-001',
        serialNumber: 'SN-VP-001',
        locationStatus: LocationStatus.ON_MACHINE,
        displayStatus: 'ACTIVE',
        currentMachine: {
          id: 'machine-1',
          code: 'MACH-001',
          qrCode: 'QR-MACH-001',
          name: 'Vacuum Machine 1',
          status: MachineStatus.ACTIVE,
        },
        currentRackLocation: null,
      }),
      workflowHints: {
        context: QrScanContext.FAULT_REPORT,
        canContinue: false,
        reason: 'vacuum is not eligible for fault reporting',
        nextExpectedEntityTypes: [],
      },
    });

    const result = await service.previewDeclaration(
      previewDto({ vacuumQr: 'VAC:VP-001' }),
    );

    expect(result).toMatchObject({
      ok: false,
      decision: 'MUST_DECHARGE_FIRST',
      requiredNextAction: 'NONE',
    });
  });

  it('returns ALREADY_IN_REPAIR for a repair-state vacuum', async () => {
    qrScan.mockResolvedValue({
      ok: true,
      entityType: QrEntityType.VACUUM,
      input: {
        raw: 'VAC:VP-002',
        normalizedRaw: 'VAC:VP-002',
        context: QrScanContext.FAULT_REPORT,
        deviceId: 'device-01',
        operatorName: 'Operator One',
        format: QrInputFormat.COMPACT,
      },
      entity: vacuumSummary({
        id: 'pad-2',
        code: 'VP-002',
        qrCode: 'QR-VP-002',
        serialNumber: 'SN-VP-002',
        locationStatus: LocationStatus.IN_REPAIR,
        operationalStatus: OperationalStatus.UNDER_REPAIR,
        displayStatus: 'REPAIR',
        currentRackLocation: currentRackLocation({
          code: 'RACK-REP-01',
          qrCode: 'QR-RACK-REP-01',
          label: 'Repair Rack 01',
          type: RackLocationType.REP,
          zone: 'REP',
          rack: 'REP-01',
          slot: '01',
        }),
      }),
      workflowHints: {
        context: QrScanContext.FAULT_REPORT,
        canContinue: false,
        reason: 'vacuum is not eligible for fault reporting',
        nextExpectedEntityTypes: [],
      },
    });

    const result = await service.previewDeclaration(
      previewDto({ vacuumQr: 'VAC:VP-002' }),
    );

    expect(result).toMatchObject({
      ok: false,
      decision: 'ALREADY_IN_REPAIR',
    });
  });

  it('returns ALREADY_IN_REPAIR for a pending REP-rack vacuum when an open repair already exists', async () => {
    qrScan.mockResolvedValue({
      ok: true,
      entityType: QrEntityType.VACUUM,
      input: {
        raw: 'VAC:VP-005',
        normalizedRaw: 'VAC:VP-005',
        context: QrScanContext.FAULT_REPORT,
        deviceId: 'device-01',
        operatorName: 'Operator One',
        format: QrInputFormat.COMPACT,
      },
      entity: vacuumSummary({
        locationStatus: LocationStatus.IN_REPAIR,
        operationalStatus: OperationalStatus.INSPECTION_REQUIRED,
        displayStatus: 'REPAIR',
        currentRackLocation: currentRackLocation({
          code: 'RACK-REP-01',
          qrCode: 'QR-RACK-REP-01',
          label: 'Repair Rack 01',
          type: RackLocationType.REP,
          zone: 'REP',
          rack: 'REP-01',
          slot: '01',
        }),
      }),
      workflowHints: {
        context: QrScanContext.FAULT_REPORT,
        canContinue: false,
        reason: 'vacuum already has an open repair',
        nextExpectedEntityTypes: [],
      },
    });
    repairFindFirst.mockResolvedValue(openRepairPreviewRecord());

    const result = await service.previewDeclaration(previewDto());

    expect(result).toMatchObject({
      ok: false,
      decision: 'ALREADY_IN_REPAIR',
      message: 'Vacuum is already in repair',
    });
  });

  it('returns NOT_VALID_FOR_FAULT for an out-of-service vacuum', async () => {
    qrScan.mockResolvedValue({
      ok: true,
      entityType: QrEntityType.VACUUM,
      input: {
        raw: 'VAC:VP-006',
        normalizedRaw: 'VAC:VP-006',
        context: QrScanContext.FAULT_REPORT,
        deviceId: 'device-01',
        operatorName: 'Operator One',
        format: QrInputFormat.COMPACT,
      },
      entity: vacuumSummary({
        id: 'pad-6',
        code: 'VP-006',
        qrCode: 'QR-VP-006',
        serialNumber: 'SN-VP-006',
        operationalStatus: OperationalStatus.OUT_OF_SERVICE,
      }),
      workflowHints: {
        context: QrScanContext.FAULT_REPORT,
        canContinue: false,
        reason: 'vacuum is not eligible for fault reporting',
        nextExpectedEntityTypes: [],
      },
    });

    const result = await service.previewDeclaration(
      previewDto({ vacuumQr: 'VAC:VP-006' }),
    );

    expect(result).toMatchObject({
      ok: false,
      decision: 'NOT_VALID_FOR_FAULT',
    });
  });

  it('returns NOT_VALID_FOR_FAULT for a retired vacuum', async () => {
    qrScan.mockResolvedValue({
      ok: true,
      entityType: QrEntityType.VACUUM,
      input: {
        raw: 'VAC:VP-999',
        normalizedRaw: 'VAC:VP-999',
        context: QrScanContext.FAULT_REPORT,
        deviceId: 'device-01',
        operatorName: 'Operator One',
        format: QrInputFormat.COMPACT,
      },
      entity: vacuumSummary({
        id: 'pad-9',
        code: 'VP-999',
        qrCode: 'QR-VP-999',
        serialNumber: 'SN-VP-999',
        operationalStatus: OperationalStatus.RETIRED,
      }),
      workflowHints: {
        context: QrScanContext.FAULT_REPORT,
        canContinue: false,
        reason: 'vacuum is not eligible for fault reporting',
        nextExpectedEntityTypes: [],
      },
    });

    const result = await service.previewDeclaration(
      previewDto({ vacuumQr: 'VAC:VP-999' }),
    );

    expect(result).toMatchObject({
      ok: false,
      decision: 'NOT_VALID_FOR_FAULT',
    });
  });

  it('returns VACUUM_NOT_FOUND when the vacuum QR does not resolve', async () => {
    qrScan.mockResolvedValue({
      ok: false,
      errorCode: 'QR_NOT_FOUND',
      message: 'No matching entity found',
      input: {
        raw: 'VAC:VP-404',
        normalizedRaw: 'VAC:VP-404',
        context: QrScanContext.FAULT_REPORT,
        deviceId: 'device-01',
        operatorName: 'Operator One',
        format: QrInputFormat.COMPACT,
      },
    });

    const result = await service.previewDeclaration(
      previewDto({ vacuumQr: 'VAC:VP-404' }),
    );

    expect(result).toEqual({
      ok: false,
      decision: 'VACUUM_NOT_FOUND',
      message: 'No matching vacuum found',
      vacuum: null,
      rack: null,
      faultCatalog: null,
      requiredNextAction: 'NONE',
    });
  });

  it('returns FAULT_CATALOG_NOT_FOUND when the selected catalog entry is missing', async () => {
    qrScan.mockResolvedValue({
      ok: true,
      entityType: QrEntityType.VACUUM,
      input: {
        raw: 'VAC:VP-005',
        normalizedRaw: 'VAC:VP-005',
        context: QrScanContext.FAULT_REPORT,
        deviceId: 'device-01',
        operatorName: 'Operator One',
        format: QrInputFormat.COMPACT,
      },
      entity: vacuumSummary(),
      workflowHints: {
        context: QrScanContext.FAULT_REPORT,
        canContinue: true,
        reason: 'vacuum is eligible for fault reporting',
        nextExpectedEntityTypes: [],
      },
    });
    faultCatalogFindFirst.mockResolvedValue(null);

    const result = await service.previewDeclaration(
      previewDto({ faultCatalogCode: 'FC-999' }),
    );

    expect(result).toEqual({
      ok: false,
      decision: 'FAULT_CATALOG_NOT_FOUND',
      message: 'No matching fault catalog entry found',
      vacuum: vacuumSummary(),
      rack: null,
      faultCatalog: null,
      requiredNextAction: 'NONE',
    });
  });

  it('returns INVALID_REQUEST when fault catalog id and code refer to different entries', async () => {
    qrScan.mockResolvedValue({
      ok: true,
      entityType: QrEntityType.VACUUM,
      input: {
        raw: 'VAC:VP-005',
        normalizedRaw: 'VAC:VP-005',
        context: QrScanContext.FAULT_REPORT,
        deviceId: 'device-01',
        operatorName: 'Operator One',
        format: QrInputFormat.COMPACT,
      },
      entity: vacuumSummary(),
      workflowHints: {
        context: QrScanContext.FAULT_REPORT,
        canContinue: true,
        reason: 'vacuum is eligible for fault reporting',
        nextExpectedEntityTypes: [],
      },
    });
    faultCatalogFindFirst
      .mockResolvedValueOnce(
        faultCatalogRecord({ id: 'fault-1', code: 'FC-001' }),
      )
      .mockResolvedValueOnce(
        faultCatalogRecord({ id: 'fault-2', code: 'FC-002' }),
      );

    const result = await service.previewDeclaration(
      previewDto({
        faultCatalogId: 'fault-1',
        faultCatalogCode: 'FC-002',
      }),
    );

    expect(result).toEqual({
      ok: false,
      decision: 'INVALID_REQUEST',
      message: 'Provided fault catalog selectors do not match',
      vacuum: vacuumSummary(),
      rack: null,
      faultCatalog: null,
      requiredNextAction: 'NONE',
    });
  });

  it('returns active fault catalog entries for the dropdown list', async () => {
    faultCatalogFindMany.mockResolvedValue([
      faultCatalogRecord({
        id: 'fault-2',
        code: 'FC-002',
        label: 'Vacuum leak',
        sortOrder: 2,
      }),
      faultCatalogRecord(),
    ]);

    const result = await service.listCatalog();

    expect(result).toEqual({
      items: [
        faultCatalogRecord({
          id: 'fault-2',
          code: 'FC-002',
          label: 'Vacuum leak',
          sortOrder: 2,
        }),
        faultCatalogRecord(),
      ],
    });
  });

  it('never writes state while building a fault declaration preview', async () => {
    qrScan.mockResolvedValue({
      ok: true,
      entityType: QrEntityType.VACUUM,
      input: {
        raw: 'VAC:VP-005',
        normalizedRaw: 'VAC:VP-005',
        context: QrScanContext.FAULT_REPORT,
        deviceId: 'device-01',
        operatorName: 'Operator One',
        format: QrInputFormat.COMPACT,
      },
      entity: vacuumSummary(),
      workflowHints: {
        context: QrScanContext.FAULT_REPORT,
        canContinue: true,
        reason: 'vacuum is eligible for fault reporting',
        nextExpectedEntityTypes: [],
      },
    });
    faultCatalogFindFirst.mockResolvedValue(faultCatalogRecord());

    await service.previewDeclaration(
      previewDto({ faultCatalogCode: 'FC-001' }),
    );

    expect(repairCreate).not.toHaveBeenCalled();
    expect(repairPhotoCreate).not.toHaveBeenCalled();
    expect(vacuumPadUpdate).not.toHaveBeenCalled();
    expect(padMovementCreate).not.toHaveBeenCalled();
    expect(auditLogCreate).not.toHaveBeenCalled();
  });

  it('returns SELECT_RACK for an eligible repair vacuum without a rack', async () => {
    qrScan.mockResolvedValue({
      ok: true,
      entityType: QrEntityType.VACUUM,
      input: {
        raw: 'VAC:VP-005',
        normalizedRaw: 'VAC:VP-005',
        context: QrScanContext.FAULT_RESTORE,
        deviceId: 'device-01',
        operatorName: 'Operator One',
        format: QrInputFormat.COMPACT,
      },
      entity: vacuumSummary({
        locationStatus: LocationStatus.IN_REPAIR,
        operationalStatus: OperationalStatus.UNDER_REPAIR,
        displayStatus: 'REPAIR',
        currentRackLocation: currentRackLocation({
          code: 'RACK-REP-01',
          qrCode: 'QR-RACK-REP-01',
          label: 'Repair Rack 01',
          type: RackLocationType.REP,
          zone: 'REP',
          rack: 'REP-01',
          slot: '01',
        }),
      }),
      workflowHints: {
        context: QrScanContext.FAULT_RESTORE,
        canContinue: true,
        reason: 'vacuum is eligible for repair restoration scanning',
        nextExpectedEntityTypes: [QrEntityType.RACK],
      },
    });
    repairFindFirst.mockResolvedValue(openRepairPreviewRecord());

    const result = await service.previewRestoration(restorationPreviewDto());

    expect(result).toMatchObject({
      ok: true,
      decision: 'SELECT_RACK',
      requiredNextAction: 'SCAN_RACK',
      repair: {
        id: 'repair-1',
        status: RepairStatus.REPORTED,
      },
    });
    expect(rackLocationFindMany).not.toHaveBeenCalled();
  });

  it('returns CAN_RESTORE for an eligible repair vacuum with an empty AVL rack', async () => {
    qrScan.mockResolvedValue({
      ok: true,
      entityType: QrEntityType.VACUUM,
      input: {
        raw: 'VAC:VP-005',
        normalizedRaw: 'VAC:VP-005',
        context: QrScanContext.FAULT_RESTORE,
        deviceId: 'device-01',
        operatorName: 'Operator One',
        format: QrInputFormat.COMPACT,
      },
      entity: vacuumSummary({
        locationStatus: LocationStatus.IN_REPAIR,
        operationalStatus: OperationalStatus.UNDER_REPAIR,
        displayStatus: 'REPAIR',
      }),
      workflowHints: {
        context: QrScanContext.FAULT_RESTORE,
        canContinue: true,
        reason: 'vacuum is eligible for repair restoration scanning',
        nextExpectedEntityTypes: [QrEntityType.RACK],
      },
    });
    repairFindFirst.mockResolvedValue(openRepairPreviewRecord());
    rackLocationFindMany.mockResolvedValue([rackDbRecord()]);

    const result = await service.previewRestoration(
      restorationPreviewDto({ rackQr: 'RACK-A-01-07' }),
    );

    expect(result).toMatchObject({
      ok: true,
      decision: 'CAN_RESTORE',
      requiredNextAction: 'CONFIRM_RESTORATION',
      rack: {
        code: 'RACK-A-01-07',
        type: RackLocationType.AVL,
      },
    });
  });

  it('returns RACK_NOT_ALLOWED when a REP rack is selected for restoration', async () => {
    qrScan.mockResolvedValue({
      ok: true,
      entityType: QrEntityType.VACUUM,
      input: {
        raw: 'VAC:VP-005',
        normalizedRaw: 'VAC:VP-005',
        context: QrScanContext.FAULT_RESTORE,
        deviceId: 'device-01',
        operatorName: 'Operator One',
        format: QrInputFormat.COMPACT,
      },
      entity: vacuumSummary({
        locationStatus: LocationStatus.IN_REPAIR,
        operationalStatus: OperationalStatus.UNDER_REPAIR,
        displayStatus: 'REPAIR',
      }),
      workflowHints: {
        context: QrScanContext.FAULT_RESTORE,
        canContinue: true,
        reason: 'vacuum is eligible for repair restoration scanning',
        nextExpectedEntityTypes: [QrEntityType.RACK],
      },
    });
    repairFindFirst.mockResolvedValue(openRepairPreviewRecord());
    rackLocationFindMany.mockResolvedValue([
      rackDbRecord({
        id: 'rack-rep-1',
        code: 'RACK-REP-01',
        qrCode: 'QR-RACK-REP-01',
        label: 'Repair Rack 01',
        type: RackLocationType.REP,
        zone: 'REP',
        rack: 'REP-01',
        slot: '01',
      }),
    ]);

    const result = await service.previewRestoration(
      restorationPreviewDto({ rackQr: 'RACK-REP-01' }),
    );

    expect(result).toMatchObject({
      ok: false,
      decision: 'RACK_NOT_ALLOWED',
      rack: {
        code: 'RACK-REP-01',
        type: RackLocationType.REP,
      },
    });
  });

  it('returns NOT_IN_REPAIR when the vacuum is not in repair', async () => {
    qrScan.mockResolvedValue({
      ok: true,
      entityType: QrEntityType.VACUUM,
      input: {
        raw: 'VAC:VP-005',
        normalizedRaw: 'VAC:VP-005',
        context: QrScanContext.FAULT_RESTORE,
        deviceId: 'device-01',
        operatorName: 'Operator One',
        format: QrInputFormat.COMPACT,
      },
      entity: vacuumSummary(),
      workflowHints: {
        context: QrScanContext.FAULT_RESTORE,
        canContinue: false,
        reason: 'vacuum is not currently in repair',
        nextExpectedEntityTypes: [],
      },
    });

    const result = await service.previewRestoration(restorationPreviewDto());

    expect(result).toMatchObject({
      ok: false,
      decision: 'NOT_IN_REPAIR',
    });
    expect(repairFindFirst).not.toHaveBeenCalled();
  });

  it('returns ACTIVE_MUST_DECHARGE_FIRST when the vacuum is active', async () => {
    qrScan.mockResolvedValue({
      ok: true,
      entityType: QrEntityType.VACUUM,
      input: {
        raw: 'VAC:VP-001',
        normalizedRaw: 'VAC:VP-001',
        context: QrScanContext.FAULT_RESTORE,
        deviceId: 'device-01',
        operatorName: 'Operator One',
        format: QrInputFormat.COMPACT,
      },
      entity: vacuumSummary({
        id: 'pad-1',
        code: 'VP-001',
        qrCode: 'QR-VP-001',
        serialNumber: 'SN-VP-001',
        locationStatus: LocationStatus.ON_MACHINE,
        displayStatus: 'ACTIVE',
        currentMachine: {
          id: 'machine-1',
          code: 'MACH-001',
          qrCode: 'QR-MACH-001',
          name: 'Vacuum Machine 1',
          status: MachineStatus.ACTIVE,
        },
        currentRackLocation: null,
      }),
      workflowHints: {
        context: QrScanContext.FAULT_RESTORE,
        canContinue: false,
        reason: 'vacuum must be decharged before restoration',
        nextExpectedEntityTypes: [],
      },
    });

    const result = await service.previewRestoration(
      restorationPreviewDto({ vacuumQr: 'VAC:VP-001' }),
    );

    expect(result).toMatchObject({
      ok: false,
      decision: 'ACTIVE_MUST_DECHARGE_FIRST',
    });
    expect(repairFindFirst).not.toHaveBeenCalled();
  });

  it('returns REPAIR_NOT_FOUND when no open repair exists', async () => {
    qrScan.mockResolvedValue({
      ok: true,
      entityType: QrEntityType.VACUUM,
      input: {
        raw: 'VAC:VP-005',
        normalizedRaw: 'VAC:VP-005',
        context: QrScanContext.FAULT_RESTORE,
        deviceId: 'device-01',
        operatorName: 'Operator One',
        format: QrInputFormat.COMPACT,
      },
      entity: vacuumSummary({
        locationStatus: LocationStatus.IN_REPAIR,
        operationalStatus: OperationalStatus.UNDER_REPAIR,
        displayStatus: 'REPAIR',
      }),
      workflowHints: {
        context: QrScanContext.FAULT_RESTORE,
        canContinue: true,
        reason: 'vacuum is in repair state',
        nextExpectedEntityTypes: [QrEntityType.RACK],
      },
    });
    repairFindFirst.mockResolvedValue(null);

    const result = await service.previewRestoration(restorationPreviewDto());

    expect(result).toMatchObject({
      ok: false,
      decision: 'REPAIR_NOT_FOUND',
    });
  });

  it('returns VACUUM_NOT_FOUND when the restoration vacuum QR does not resolve', async () => {
    qrScan.mockResolvedValue({
      ok: false,
      errorCode: 'QR_NOT_FOUND',
      message: 'No matching entity found',
      input: {
        raw: 'VAC:VP-404',
        normalizedRaw: 'VAC:VP-404',
        context: QrScanContext.FAULT_RESTORE,
        deviceId: 'device-01',
        operatorName: 'Operator One',
        format: QrInputFormat.COMPACT,
      },
    });

    const result = await service.previewRestoration(
      restorationPreviewDto({ vacuumQr: 'VAC:VP-404' }),
    );

    expect(result).toEqual({
      ok: false,
      decision: 'VACUUM_NOT_FOUND',
      message: 'No matching vacuum found',
      vacuum: null,
      repair: null,
      rack: null,
      requiredNextAction: 'NONE',
    });
  });

  it('returns RACK_NOT_FOUND when the restoration rack does not exist', async () => {
    qrScan.mockResolvedValue({
      ok: true,
      entityType: QrEntityType.VACUUM,
      input: {
        raw: 'VAC:VP-005',
        normalizedRaw: 'VAC:VP-005',
        context: QrScanContext.FAULT_RESTORE,
        deviceId: 'device-01',
        operatorName: 'Operator One',
        format: QrInputFormat.COMPACT,
      },
      entity: vacuumSummary({
        locationStatus: LocationStatus.IN_REPAIR,
        operationalStatus: OperationalStatus.UNDER_REPAIR,
        displayStatus: 'REPAIR',
      }),
      workflowHints: {
        context: QrScanContext.FAULT_RESTORE,
        canContinue: true,
        reason: 'vacuum is in repair state',
        nextExpectedEntityTypes: [QrEntityType.RACK],
      },
    });
    repairFindFirst.mockResolvedValue(openRepairPreviewRecord());
    rackLocationFindMany.mockResolvedValue([]);

    const result = await service.previewRestoration(
      restorationPreviewDto({ rackQr: 'RACK-A-01-99' }),
    );

    expect(result).toMatchObject({
      ok: false,
      decision: 'RACK_NOT_FOUND',
      rack: null,
    });
  });

  it('returns RACK_OCCUPIED when the selected restoration rack has another pad', async () => {
    qrScan.mockResolvedValue({
      ok: true,
      entityType: QrEntityType.VACUUM,
      input: {
        raw: 'VAC:VP-005',
        normalizedRaw: 'VAC:VP-005',
        context: QrScanContext.FAULT_RESTORE,
        deviceId: 'device-01',
        operatorName: 'Operator One',
        format: QrInputFormat.COMPACT,
      },
      entity: vacuumSummary({
        locationStatus: LocationStatus.IN_REPAIR,
        operationalStatus: OperationalStatus.UNDER_REPAIR,
        displayStatus: 'REPAIR',
      }),
      workflowHints: {
        context: QrScanContext.FAULT_RESTORE,
        canContinue: true,
        reason: 'vacuum is in repair state',
        nextExpectedEntityTypes: [QrEntityType.RACK],
      },
    });
    repairFindFirst.mockResolvedValue(openRepairPreviewRecord());
    rackLocationFindMany.mockResolvedValue([
      rackDbRecord({
        currentPads: [
          {
            id: 'pad-2',
            code: 'VP-002',
            qrCode: 'QR-VP-002',
            serialNumber: 'SN-VP-002',
            locationStatus: LocationStatus.IN_RACK,
            operationalStatus: OperationalStatus.FUNCTIONAL,
            currentMachineId: null,
          },
        ],
      }),
    ]);

    const result = await service.previewRestoration(
      restorationPreviewDto({ rackQr: 'RACK-A-01-07' }),
    );

    expect(result).toMatchObject({
      ok: false,
      decision: 'RACK_OCCUPIED',
      rack: {
        code: 'RACK-A-01-07',
        currentPad: {
          code: 'VP-002',
        },
      },
    });
  });

  it('never writes state while building a restoration preview', async () => {
    qrScan.mockResolvedValue({
      ok: true,
      entityType: QrEntityType.VACUUM,
      input: {
        raw: 'VAC:VP-005',
        normalizedRaw: 'VAC:VP-005',
        context: QrScanContext.FAULT_RESTORE,
        deviceId: 'device-01',
        operatorName: 'Operator One',
        format: QrInputFormat.COMPACT,
      },
      entity: vacuumSummary({
        locationStatus: LocationStatus.IN_REPAIR,
        operationalStatus: OperationalStatus.UNDER_REPAIR,
        displayStatus: 'REPAIR',
      }),
      workflowHints: {
        context: QrScanContext.FAULT_RESTORE,
        canContinue: true,
        reason: 'vacuum is in repair state',
        nextExpectedEntityTypes: [QrEntityType.RACK],
      },
    });
    repairFindFirst.mockResolvedValue(openRepairPreviewRecord());
    rackLocationFindMany.mockResolvedValue([rackDbRecord()]);

    await service.previewRestoration(
      restorationPreviewDto({ rackQr: 'RACK-A-01-07' }),
    );

    expect(repairCreate).not.toHaveBeenCalled();
    expect(repairPhotoCreate).not.toHaveBeenCalled();
    expect(vacuumPadUpdate).not.toHaveBeenCalled();
    expect(padMovementCreate).not.toHaveBeenCalled();
    expect(auditLogCreate).not.toHaveBeenCalled();
  });

  it('declares a fault successfully with a catalog selection', async () => {
    vacuumPadFindMany.mockResolvedValue([vacuumRecord()]);
    faultCatalogFindFirst.mockResolvedValue(faultCatalogRecord());
    repairCreate.mockResolvedValue(repairRecord());
    vacuumPadUpdate.mockResolvedValue(
      vacuumRecord({
        locationStatus: LocationStatus.IN_REPAIR,
        operationalStatus: OperationalStatus.UNDER_REPAIR,
        lastRepairAt: new Date('2026-05-22T12:00:00.000Z'),
      }),
    );
    padMovementCreate.mockResolvedValue({
      id: 'movement-1',
      movementType: MovementType.REPAIR_INTAKE,
      vacuumPadId: 'pad-5',
      fromRackLocationId: 'rack-1',
      toRackLocationId: 'rack-1',
      previousLocationStatus: LocationStatus.IN_RACK,
      newLocationStatus: LocationStatus.IN_REPAIR,
      previousOperationalStatus: OperationalStatus.FUNCTIONAL,
      newOperationalStatus: OperationalStatus.UNDER_REPAIR,
      deviceId: 'device-01',
      operatorName: 'Operator One',
      note: 'Damage observed during inspection',
      createdAt: new Date('2026-05-22T12:00:01.000Z'),
    });
    auditLogCreate.mockResolvedValue({
      id: 'audit-1',
      action: AuditAction.REPAIR_REPORTED,
      entityType: 'Repair',
      entityId: 'repair-1',
      deviceId: 'device-01',
      operatorName: 'Operator One',
      createdAt: new Date('2026-05-22T12:00:02.000Z'),
    });

    const result = await service.declare(declarationDto());

    expect(result).toMatchObject({
      ok: true,
      decision: 'FAULT_DECLARED',
      requiredNextAction: 'UPLOAD_PHOTO_OPTIONAL',
      repair: {
        id: 'repair-1',
        status: RepairStatus.REPORTED,
        priority: RepairPriority.NORMAL,
        faultCatalogId: 'fault-1',
        faultCatalog: {
          code: 'FC-001',
        },
      },
      vacuum: {
        locationStatus: LocationStatus.IN_REPAIR,
        operationalStatus: OperationalStatus.UNDER_REPAIR,
        displayStatus: 'REPAIR',
      },
      movement: {
        movementType: MovementType.REPAIR_INTAKE,
      },
      auditLog: {
        action: AuditAction.REPAIR_REPORTED,
      },
    });
    expect(repairCreate).toHaveBeenCalledTimes(1);
    expect(vacuumPadUpdate).toHaveBeenCalledTimes(1);
    expect(padMovementCreate).toHaveBeenCalledTimes(1);
    expect(auditLogCreate).toHaveBeenCalledTimes(1);
    expect(repairPhotoCreate).not.toHaveBeenCalled();
    expect(sendRepairIntakeNotification).toHaveBeenCalledWith({
      repairId: 'repair-1',
      vacuumCode: 'VP-005',
      vacuumSerial: 'SN-VP-005',
      rackCode: 'RACK-A-01-05',
    });
    expect(sendRepairRestoredNotification).not.toHaveBeenCalled();
  });

  it('declares a fault successfully and moves the vacuum to a selected REP rack', async () => {
    vacuumPadFindMany.mockResolvedValue([vacuumRecord()]);
    rackLocationFindMany.mockResolvedValue([
      rackDbRecord({
        id: 'rack-rep-1',
        code: 'RACK-REP-01',
        qrCode: 'QR-RACK-REP-01',
        label: 'Repair Rack 01',
        type: RackLocationType.REP,
      }),
    ]);
    vacuumPadFindFirst.mockResolvedValue(null);
    faultCatalogFindFirst.mockResolvedValue(faultCatalogRecord());
    repairCreate.mockResolvedValue(repairRecord());
    vacuumPadUpdate.mockResolvedValue(
      vacuumRecord({
        currentRackLocationId: 'rack-rep-1',
        currentRackLocation: {
          id: 'rack-rep-1',
          code: 'RACK-REP-01',
          qrCode: 'QR-RACK-REP-01',
          label: 'Repair Rack 01',
          type: RackLocationType.REP,
          zone: 'REP',
          rack: 'REP-01',
          level: null,
          slot: '01',
        },
        locationStatus: LocationStatus.IN_REPAIR,
        operationalStatus: OperationalStatus.UNDER_REPAIR,
      }),
    );
    padMovementCreate.mockResolvedValue({
      id: 'movement-selected-rack-1',
      movementType: MovementType.REPAIR_INTAKE,
      vacuumPadId: 'pad-5',
      fromRackLocationId: 'rack-1',
      toRackLocationId: 'rack-rep-1',
      previousLocationStatus: LocationStatus.IN_RACK,
      newLocationStatus: LocationStatus.IN_REPAIR,
      previousOperationalStatus: OperationalStatus.FUNCTIONAL,
      newOperationalStatus: OperationalStatus.UNDER_REPAIR,
      deviceId: 'device-01',
      operatorName: 'Operator One',
      note: 'Damage observed during inspection',
      createdAt: new Date('2026-05-22T12:02:01.000Z'),
    });
    auditLogCreate.mockResolvedValue({
      id: 'audit-selected-rack-1',
      action: AuditAction.REPAIR_REPORTED,
      entityType: 'Repair',
      entityId: 'repair-1',
      deviceId: 'device-01',
      operatorName: 'Operator One',
      createdAt: new Date('2026-05-22T12:02:02.000Z'),
    });

    const result = await service.declare(
      declarationDto({ rackQr: 'RACK:RACK-REP-01' }),
    );

    expect(result).toMatchObject({
      ok: true,
      decision: 'FAULT_DECLARED',
      rack: {
        code: 'RACK-REP-01',
        type: RackLocationType.REP,
      },
      vacuum: {
        currentRackLocation: {
          code: 'RACK-REP-01',
          type: RackLocationType.REP,
        },
        locationStatus: LocationStatus.IN_REPAIR,
        operationalStatus: OperationalStatus.UNDER_REPAIR,
      },
      movement: {
        fromRackLocationId: 'rack-1',
        toRackLocationId: 'rack-rep-1',
      },
    });
    expect(vacuumPadUpdate).toHaveBeenCalledWith({
      where: {
        id: 'pad-5',
      },
      data: {
        locationStatus: LocationStatus.IN_REPAIR,
        operationalStatus: OperationalStatus.UNDER_REPAIR,
        currentRackLocationId: 'rack-rep-1',
        currentMachineId: null,
        lastRepairAt: expect.any(Date) as Date,
      },
      select: QrService.vacuumSelect,
    });
    expect(padMovementCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          fromRackLocationId: 'rack-1',
          toRackLocationId: 'rack-rep-1',
        }) as object,
      }),
    );
    expect(sendRepairIntakeNotification).toHaveBeenCalledWith({
      repairId: 'repair-1',
      vacuumCode: 'VP-005',
      vacuumSerial: 'SN-VP-005',
      rackCode: 'RACK-REP-01',
    });
  });

  it('declares a fault successfully after REP decharge pending declaration', async () => {
    vacuumPadFindMany.mockResolvedValue([
      vacuumRecord({
        currentRackLocationId: 'rack-rep-1',
        currentRackLocation: {
          id: 'rack-rep-1',
          code: 'RACK-REP-01',
          qrCode: 'QR-RACK-REP-01',
          label: 'Repair Rack 01',
          type: RackLocationType.REP,
          zone: 'REP',
          rack: 'REP-01',
          level: null,
          slot: '01',
        },
        locationStatus: LocationStatus.IN_REPAIR,
        operationalStatus: OperationalStatus.INSPECTION_REQUIRED,
      }),
    ]);
    repairFindFirst.mockResolvedValue(null);
    faultCatalogFindFirst.mockResolvedValue(faultCatalogRecord());
    repairCreate.mockResolvedValue(repairRecord());
    vacuumPadUpdate.mockResolvedValue(
      vacuumRecord({
        currentRackLocationId: 'rack-rep-1',
        currentRackLocation: {
          id: 'rack-rep-1',
          code: 'RACK-REP-01',
          qrCode: 'QR-RACK-REP-01',
          label: 'Repair Rack 01',
          type: RackLocationType.REP,
          zone: 'REP',
          rack: 'REP-01',
          level: null,
          slot: '01',
        },
        locationStatus: LocationStatus.IN_REPAIR,
        operationalStatus: OperationalStatus.UNDER_REPAIR,
        lastRepairAt: new Date('2026-05-22T12:00:00.000Z'),
      }),
    );
    padMovementCreate.mockResolvedValue({
      id: 'movement-rep-1',
      movementType: MovementType.REPAIR_INTAKE,
      vacuumPadId: 'pad-5',
      fromRackLocationId: 'rack-rep-1',
      toRackLocationId: 'rack-rep-1',
      previousLocationStatus: LocationStatus.IN_REPAIR,
      newLocationStatus: LocationStatus.IN_REPAIR,
      previousOperationalStatus: OperationalStatus.INSPECTION_REQUIRED,
      newOperationalStatus: OperationalStatus.UNDER_REPAIR,
      deviceId: 'device-01',
      operatorName: 'Operator One',
      note: 'Damage observed during inspection',
      createdAt: new Date('2026-05-22T12:00:01.000Z'),
    });
    auditLogCreate.mockResolvedValue({
      id: 'audit-rep-1',
      action: AuditAction.REPAIR_REPORTED,
      entityType: 'Repair',
      entityId: 'repair-1',
      deviceId: 'device-01',
      operatorName: 'Operator One',
      createdAt: new Date('2026-05-22T12:00:02.000Z'),
    });

    const result = await service.declare(declarationDto());

    expect(result).toMatchObject({
      ok: true,
      decision: 'FAULT_DECLARED',
      vacuum: {
        currentRackLocation: {
          code: 'RACK-REP-01',
          type: RackLocationType.REP,
        },
        locationStatus: LocationStatus.IN_REPAIR,
        operationalStatus: OperationalStatus.UNDER_REPAIR,
      },
      movement: {
        movementType: MovementType.REPAIR_INTAKE,
        previousLocationStatus: LocationStatus.IN_REPAIR,
        newLocationStatus: LocationStatus.IN_REPAIR,
        previousOperationalStatus: OperationalStatus.INSPECTION_REQUIRED,
        newOperationalStatus: OperationalStatus.UNDER_REPAIR,
      },
    });
    expect(sendRepairIntakeNotification).toHaveBeenCalledWith({
      repairId: 'repair-1',
      vacuumCode: 'VP-005',
      vacuumSerial: 'SN-VP-005',
      rackCode: 'RACK-REP-01',
    });
    expect(repairFindFirst).toHaveBeenCalledWith({
      where: {
        vacuumPadId: 'pad-5',
        completedAt: null,
        status: {
          in: [
            RepairStatus.REPORTED,
            RepairStatus.ASSIGNED,
            RepairStatus.UNDER_REPAIR,
          ],
        },
      },
      select: {
        id: true,
      },
    });
    expect(repairCreate).toHaveBeenCalledTimes(1);
    expect(vacuumPadUpdate).toHaveBeenCalledWith({
      where: {
        id: 'pad-5',
      },
      data: {
        locationStatus: LocationStatus.IN_REPAIR,
        operationalStatus: OperationalStatus.UNDER_REPAIR,
        currentRackLocationId: 'rack-rep-1',
        currentMachineId: null,
        lastRepairAt: expect.any(Date) as Date,
      },
      select: QrService.vacuumSelect,
    });
    expect(repairPhotoCreate).not.toHaveBeenCalled();
  });

  it('declares a fault successfully with other text only', async () => {
    vacuumPadFindMany.mockResolvedValue([vacuumRecord()]);
    repairCreate.mockResolvedValue(
      repairRecord({
        id: 'repair-2',
        faultCatalogId: null,
        faultOtherText: 'Loose edge on pad lip',
        problemDescription: 'Loose edge on pad lip',
      }),
    );
    vacuumPadUpdate.mockResolvedValue(
      vacuumRecord({
        locationStatus: LocationStatus.IN_REPAIR,
        operationalStatus: OperationalStatus.UNDER_REPAIR,
      }),
    );
    padMovementCreate.mockResolvedValue({
      id: 'movement-2',
      movementType: MovementType.REPAIR_INTAKE,
      vacuumPadId: 'pad-5',
      fromRackLocationId: 'rack-1',
      toRackLocationId: 'rack-1',
      previousLocationStatus: LocationStatus.IN_RACK,
      newLocationStatus: LocationStatus.IN_REPAIR,
      previousOperationalStatus: OperationalStatus.FUNCTIONAL,
      newOperationalStatus: OperationalStatus.UNDER_REPAIR,
      deviceId: 'device-01',
      operatorName: 'Operator One',
      note: 'Damage observed during inspection',
      createdAt: new Date('2026-05-22T12:05:01.000Z'),
    });
    auditLogCreate.mockResolvedValue({
      id: 'audit-2',
      action: AuditAction.REPAIR_REPORTED,
      entityType: 'Repair',
      entityId: 'repair-2',
      deviceId: 'device-01',
      operatorName: 'Operator One',
      createdAt: new Date('2026-05-22T12:05:02.000Z'),
    });

    const result = await service.declare(
      declarationDto({
        faultCatalogCode: undefined,
        faultOtherText: 'Loose edge on pad lip',
      }),
    );

    expect(result).toMatchObject({
      ok: true,
      decision: 'FAULT_DECLARED',
      repair: {
        id: 'repair-2',
        faultCatalogId: null,
        faultOtherText: 'Loose edge on pad lip',
        faultCatalog: null,
      },
    });
    expect(faultCatalogFindFirst).not.toHaveBeenCalled();
  });

  it('returns VACUUM_NOT_FOUND for write when the vacuum does not exist', async () => {
    vacuumPadFindMany.mockResolvedValue([]);

    const result = await service.declare(declarationDto());

    expect(result).toEqual({
      ok: false,
      decision: 'VACUUM_NOT_FOUND',
      message: 'No matching vacuum found',
      httpStatus: 404,
    });
    expect(repairCreate).not.toHaveBeenCalled();
  });

  it('returns MUST_DECHARGE_FIRST when the vacuum is active', async () => {
    vacuumPadFindMany.mockResolvedValue([
      vacuumRecord({
        code: 'VP-005',
        currentMachineId: 'machine-1',
        locationStatus: LocationStatus.ON_MACHINE,
        currentMachine: {
          id: 'machine-1',
          code: 'MACH-001',
          qrCode: 'QR-MACH-001',
          name: 'Vacuum Machine 1',
          status: MachineStatus.ACTIVE,
        },
      }),
    ]);

    const result = await service.declare(declarationDto());

    expect(result).toEqual({
      ok: false,
      decision: 'MUST_DECHARGE_FIRST',
      message: 'Vacuum must be decharged before fault declaration',
      httpStatus: 409,
    });
    expect(repairCreate).not.toHaveBeenCalled();
  });

  it('returns ALREADY_IN_REPAIR when the vacuum is already under repair', async () => {
    vacuumPadFindMany.mockResolvedValue([
      vacuumRecord({
        locationStatus: LocationStatus.IN_REPAIR,
        operationalStatus: OperationalStatus.UNDER_REPAIR,
      }),
    ]);

    const result = await service.declare(declarationDto());

    expect(result).toEqual({
      ok: false,
      decision: 'ALREADY_IN_REPAIR',
      message: 'Vacuum is already in repair',
      httpStatus: 409,
    });
    expect(repairCreate).not.toHaveBeenCalled();
  });

  it('returns ALREADY_IN_REPAIR when pending REP declaration already has an open repair', async () => {
    vacuumPadFindMany.mockResolvedValue([
      vacuumRecord({
        locationStatus: LocationStatus.IN_REPAIR,
        operationalStatus: OperationalStatus.INSPECTION_REQUIRED,
      }),
    ]);
    repairFindFirst.mockResolvedValue(openRepairPreviewRecord());

    const result = await service.declare(declarationDto());

    expect(result).toEqual({
      ok: false,
      decision: 'ALREADY_IN_REPAIR',
      message: 'Vacuum is already in repair',
      httpStatus: 409,
    });
    expect(faultCatalogFindFirst).not.toHaveBeenCalled();
    expect(repairCreate).not.toHaveBeenCalled();
  });

  it('returns NOT_VALID_FOR_FAULT when the vacuum is out of service', async () => {
    vacuumPadFindMany.mockResolvedValue([
      vacuumRecord({
        operationalStatus: OperationalStatus.OUT_OF_SERVICE,
      }),
    ]);

    const result = await service.declare(declarationDto());

    expect(result).toEqual({
      ok: false,
      decision: 'NOT_VALID_FOR_FAULT',
      message: 'Vacuum is not valid for normal fault declaration',
      httpStatus: 409,
    });
    expect(repairCreate).not.toHaveBeenCalled();
  });

  it('returns NOT_VALID_FOR_FAULT when the vacuum is retired', async () => {
    vacuumPadFindMany.mockResolvedValue([
      vacuumRecord({
        operationalStatus: OperationalStatus.RETIRED,
      }),
    ]);

    const result = await service.declare(declarationDto());

    expect(result).toEqual({
      ok: false,
      decision: 'NOT_VALID_FOR_FAULT',
      message: 'Vacuum is not valid for normal fault declaration',
      httpStatus: 409,
    });
    expect(repairCreate).not.toHaveBeenCalled();
  });

  it('returns FAULT_CATALOG_NOT_FOUND when the selected catalog entry is missing during write', async () => {
    vacuumPadFindMany.mockResolvedValue([vacuumRecord()]);
    faultCatalogFindFirst.mockResolvedValue(null);

    const result = await service.declare(
      declarationDto({ faultCatalogCode: 'FC-999' }),
    );

    expect(result).toEqual({
      ok: false,
      decision: 'FAULT_CATALOG_NOT_FOUND',
      message: 'No matching fault catalog entry found',
      httpStatus: 404,
    });
    expect(repairCreate).not.toHaveBeenCalled();
  });

  it('returns INVALID_REQUEST when no fault selector is provided for write', async () => {
    const result = await service.declare(
      declarationDto({
        faultCatalogCode: undefined,
      }),
    );

    expect(result).toEqual({
      ok: false,
      decision: 'INVALID_REQUEST',
      message:
        'Provide exactly one of faultCatalogId, faultCatalogCode, or faultOtherText',
      httpStatus: 400,
    });
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it('returns INVALID_REQUEST when multiple fault selectors are provided for write', async () => {
    const result = await service.declare(
      declarationDto({
        faultCatalogId: 'fault-1',
      }),
    );

    expect(result).toEqual({
      ok: false,
      decision: 'INVALID_REQUEST',
      message:
        'Provide exactly one of faultCatalogId, faultCatalogCode, or faultOtherText',
      httpStatus: 400,
    });
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it('performs no writes when write validation fails inside the transaction', async () => {
    vacuumPadFindMany.mockResolvedValue([
      vacuumRecord({
        operationalStatus: OperationalStatus.OUT_OF_SERVICE,
      }),
    ]);

    await service.declare(declarationDto());

    expect(repairCreate).not.toHaveBeenCalled();
    expect(repairPhotoCreate).not.toHaveBeenCalled();
    expect(vacuumPadUpdate).not.toHaveBeenCalled();
    expect(padMovementCreate).not.toHaveBeenCalled();
    expect(auditLogCreate).not.toHaveBeenCalled();
  });

  it('restores a vacuum to service successfully on an AVL rack', async () => {
    vacuumPadFindMany.mockResolvedValue([
      vacuumRecord({
        locationStatus: LocationStatus.IN_REPAIR,
        operationalStatus: OperationalStatus.UNDER_REPAIR,
        currentRackLocationId: 'rack-rep-1',
        currentRackLocation: {
          ...currentRackLocation(),
          id: 'rack-rep-1',
          code: 'RACK-REP-01',
          qrCode: 'QR-RACK-REP-01',
          label: 'Repair Rack 01',
          type: RackLocationType.REP,
          zone: 'REP',
          rack: 'REP-01',
          slot: '01',
        },
      }),
    ]);
    rackLocationFindMany.mockResolvedValue([rackDbRecord()]);
    repairFindFirst.mockResolvedValue(openRepairWriteRecord());
    vacuumPadFindFirst.mockResolvedValue(null);
    repairUpdate.mockResolvedValue(restoredRepairRecord());
    vacuumPadUpdate.mockResolvedValue(
      vacuumRecord({
        currentRackLocationId: 'rack-7',
        currentRackLocation: rackDbRecord(),
        currentMachineId: null,
        locationStatus: LocationStatus.IN_RACK,
        operationalStatus: OperationalStatus.FUNCTIONAL,
      }),
    );
    padMovementCreate.mockResolvedValue({
      id: 'movement-restore-1',
      movementType: MovementType.REPAIR_RELEASE,
      vacuumPadId: 'pad-5',
      fromRackLocationId: 'rack-rep-1',
      toRackLocationId: 'rack-7',
      previousLocationStatus: LocationStatus.IN_REPAIR,
      newLocationStatus: LocationStatus.IN_RACK,
      previousOperationalStatus: OperationalStatus.UNDER_REPAIR,
      newOperationalStatus: OperationalStatus.FUNCTIONAL,
      deviceId: 'device-01',
      operatorName: 'Operator One',
      note: 'Repair complete',
      createdAt: new Date('2026-05-22T13:00:01.000Z'),
    });
    auditLogCreate.mockResolvedValue({
      id: 'audit-restore-1',
      action: AuditAction.REPAIR_COMPLETED,
      entityType: 'Repair',
      entityId: 'repair-1',
      deviceId: 'device-01',
      operatorName: 'Operator One',
      createdAt: new Date('2026-05-22T13:00:02.000Z'),
    });
    rackLocationFindUnique.mockResolvedValue(
      rackDbRecord({
        currentPads: [
          {
            id: 'pad-5',
            code: 'VP-005',
            qrCode: 'QR-VP-005',
            serialNumber: 'SN-VP-005',
            locationStatus: LocationStatus.IN_RACK,
            operationalStatus: OperationalStatus.FUNCTIONAL,
            currentMachineId: null,
          },
        ],
      }),
    );

    const result = await service.restore(
      restorationDto({
        outcome: RepairOutcome.RETURNED_TO_SERVICE,
        technicianNotes: 'Repair complete',
        repairActions: 'Repaired damaged surface',
        spareParts: 'Seal kit',
        repairCost: '12.50',
      }),
    );

    expect(result).toMatchObject({
      ok: true,
      decision: 'RESTORED',
      repair: {
        id: 'repair-1',
        status: RepairStatus.COMPLETED,
        outcome: RepairOutcome.RETURNED_TO_SERVICE,
        completedAt: '2026-05-22T13:00:00.000Z',
        repairCost: '12.50',
      },
      vacuum: {
        locationStatus: LocationStatus.IN_RACK,
        operationalStatus: OperationalStatus.FUNCTIONAL,
        currentRackLocation: {
          code: 'RACK-A-01-07',
        },
      },
      movement: {
        movementType: MovementType.REPAIR_RELEASE,
      },
      auditLog: {
        action: AuditAction.REPAIR_COMPLETED,
      },
    });
    expect(repairUpdate).toHaveBeenCalledTimes(1);
    expect(vacuumPadUpdate).toHaveBeenCalledTimes(1);
    expect(padMovementCreate).toHaveBeenCalledTimes(1);
    expect(auditLogCreate).toHaveBeenCalledTimes(1);
    expect(repairPhotoCreate).not.toHaveBeenCalled();
    expect(sendRepairRestoredNotification).toHaveBeenCalledWith({
      repairId: 'repair-1',
      vacuumCode: 'VP-005',
      vacuumSerial: 'SN-VP-005',
      rackCode: 'RACK-A-01-07',
    });
    expect(sendRepairIntakeNotification).not.toHaveBeenCalled();
  });

  it('requires at least one completion photo before restoration', async () => {
    vacuumPadFindMany.mockResolvedValue([
      vacuumRecord({
        locationStatus: LocationStatus.IN_REPAIR,
        operationalStatus: OperationalStatus.UNDER_REPAIR,
      }),
    ]);
    rackLocationFindMany.mockResolvedValue([rackDbRecord()]);
    repairFindFirst.mockResolvedValue(openRepairWriteRecord());
    repairPhotoCount.mockResolvedValue(0);

    const result = await service.restore(restorationDto());

    expect(result).toEqual({
      ok: false,
      decision: 'COMPLETION_PHOTO_REQUIRED',
      message:
        'At least one repair completion photo is required before restoration',
      httpStatus: 409,
    });
    expect(repairUpdate).not.toHaveBeenCalled();
    expect(vacuumPadUpdate).not.toHaveBeenCalled();
    expect(padMovementCreate).not.toHaveBeenCalled();
  });

  it('restores a vacuum as out of service on an AVL rack', async () => {
    vacuumPadFindMany.mockResolvedValue([
      vacuumRecord({
        locationStatus: LocationStatus.IN_REPAIR,
        operationalStatus: OperationalStatus.UNDER_REPAIR,
      }),
    ]);
    rackLocationFindMany.mockResolvedValue([rackDbRecord()]);
    repairFindFirst.mockResolvedValue(openRepairWriteRecord());
    vacuumPadFindFirst.mockResolvedValue(null);
    repairUpdate.mockResolvedValue(
      restoredRepairRecord({
        status: RepairStatus.COMPLETED,
        outcome: RepairOutcome.OUT_OF_SERVICE,
        repairCost: null,
      }),
    );
    vacuumPadUpdate.mockResolvedValue(
      vacuumRecord({
        currentRackLocationId: 'rack-7',
        currentRackLocation: rackDbRecord(),
        currentMachineId: null,
        locationStatus: LocationStatus.IN_RACK,
        operationalStatus: OperationalStatus.OUT_OF_SERVICE,
      }),
    );
    padMovementCreate.mockResolvedValue({
      id: 'movement-restore-2',
      movementType: MovementType.REPAIR_RELEASE,
      vacuumPadId: 'pad-5',
      fromRackLocationId: 'rack-1',
      toRackLocationId: 'rack-7',
      previousLocationStatus: LocationStatus.IN_REPAIR,
      newLocationStatus: LocationStatus.IN_RACK,
      previousOperationalStatus: OperationalStatus.UNDER_REPAIR,
      newOperationalStatus: OperationalStatus.OUT_OF_SERVICE,
      deviceId: 'device-01',
      operatorName: 'Operator One',
      note: 'Repair complete',
      createdAt: new Date('2026-05-22T13:05:01.000Z'),
    });
    auditLogCreate.mockResolvedValue({
      id: 'audit-restore-2',
      action: AuditAction.REPAIR_COMPLETED,
      entityType: 'Repair',
      entityId: 'repair-1',
      deviceId: 'device-01',
      operatorName: 'Operator One',
      createdAt: new Date('2026-05-22T13:05:02.000Z'),
    });
    rackLocationFindUnique.mockResolvedValue(rackDbRecord());

    const result = await service.restore(
      restorationDto({ outcome: RepairOutcome.OUT_OF_SERVICE }),
    );

    expect(result).toMatchObject({
      ok: true,
      decision: 'RESTORED_OUT_OF_SERVICE',
      vacuum: {
        operationalStatus: OperationalStatus.OUT_OF_SERVICE,
      },
      repair: {
        outcome: RepairOutcome.OUT_OF_SERVICE,
      },
    });
    expect(sendRepairRestoredNotification).toHaveBeenCalledWith({
      repairId: 'repair-1',
      vacuumCode: 'VP-005',
      vacuumSerial: 'SN-VP-005',
      rackCode: 'RACK-A-01-07',
    });
  });

  it('retires a vacuum successfully on an AVL rack', async () => {
    vacuumPadFindMany.mockResolvedValue([
      vacuumRecord({
        locationStatus: LocationStatus.IN_REPAIR,
        operationalStatus: OperationalStatus.UNDER_REPAIR,
      }),
    ]);
    rackLocationFindMany.mockResolvedValue([rackDbRecord()]);
    repairFindFirst.mockResolvedValue(openRepairWriteRecord());
    vacuumPadFindFirst.mockResolvedValue(null);
    repairUpdate.mockResolvedValue(
      restoredRepairRecord({
        status: RepairStatus.COMPLETED,
        outcome: RepairOutcome.RETIRED,
        repairCost: null,
      }),
    );
    vacuumPadUpdate.mockResolvedValue(
      vacuumRecord({
        currentRackLocationId: 'rack-7',
        currentRackLocation: rackDbRecord(),
        currentMachineId: null,
        locationStatus: LocationStatus.IN_RACK,
        operationalStatus: OperationalStatus.RETIRED,
      }),
    );
    padMovementCreate.mockResolvedValue({
      id: 'movement-restore-3',
      movementType: MovementType.REPAIR_RELEASE,
      vacuumPadId: 'pad-5',
      fromRackLocationId: 'rack-1',
      toRackLocationId: 'rack-7',
      previousLocationStatus: LocationStatus.IN_REPAIR,
      newLocationStatus: LocationStatus.IN_RACK,
      previousOperationalStatus: OperationalStatus.UNDER_REPAIR,
      newOperationalStatus: OperationalStatus.RETIRED,
      deviceId: 'device-01',
      operatorName: 'Operator One',
      note: 'Repair complete',
      createdAt: new Date('2026-05-22T13:10:01.000Z'),
    });
    auditLogCreate.mockResolvedValue({
      id: 'audit-restore-3',
      action: AuditAction.REPAIR_COMPLETED,
      entityType: 'Repair',
      entityId: 'repair-1',
      deviceId: 'device-01',
      operatorName: 'Operator One',
      createdAt: new Date('2026-05-22T13:10:02.000Z'),
    });
    rackLocationFindUnique.mockResolvedValue(rackDbRecord());

    const result = await service.restore(
      restorationDto({ outcome: RepairOutcome.RETIRED }),
    );

    expect(result).toMatchObject({
      ok: true,
      decision: 'RETIRED',
      vacuum: {
        operationalStatus: OperationalStatus.RETIRED,
      },
      repair: {
        outcome: RepairOutcome.RETIRED,
      },
    });
    expect(sendRepairRestoredNotification).toHaveBeenCalledWith({
      repairId: 'repair-1',
      vacuumCode: 'VP-005',
      vacuumSerial: 'SN-VP-005',
      rackCode: 'RACK-A-01-07',
    });
  });

  it('keeps the vacuum in repair when restoration is unresolved', async () => {
    vacuumPadFindMany.mockResolvedValue([
      vacuumRecord({
        locationStatus: LocationStatus.IN_REPAIR,
        operationalStatus: OperationalStatus.UNDER_REPAIR,
      }),
    ]);
    rackLocationFindMany.mockResolvedValue([rackDbRecord()]);
    repairFindFirst.mockResolvedValue(openRepairWriteRecord());
    vacuumPadFindFirst.mockResolvedValue(null);
    repairUpdate.mockResolvedValue(
      restoredRepairRecord({
        status: RepairStatus.UNDER_REPAIR,
        outcome: RepairOutcome.UNRESOLVED,
        completedAt: null,
        repairCost: null,
      }),
    );
    vacuumPadUpdate.mockResolvedValue(
      vacuumRecord({
        currentRackLocationId: 'rack-7',
        currentRackLocation: rackDbRecord(),
        currentMachineId: null,
        locationStatus: LocationStatus.IN_REPAIR,
        operationalStatus: OperationalStatus.UNDER_REPAIR,
      }),
    );
    padMovementCreate.mockResolvedValue({
      id: 'movement-restore-4',
      movementType: MovementType.STATUS_CHANGE,
      vacuumPadId: 'pad-5',
      fromRackLocationId: 'rack-1',
      toRackLocationId: 'rack-7',
      previousLocationStatus: LocationStatus.IN_REPAIR,
      newLocationStatus: LocationStatus.IN_REPAIR,
      previousOperationalStatus: OperationalStatus.UNDER_REPAIR,
      newOperationalStatus: OperationalStatus.UNDER_REPAIR,
      deviceId: 'device-01',
      operatorName: 'Operator One',
      note: 'Repair complete',
      createdAt: new Date('2026-05-22T13:15:01.000Z'),
    });
    auditLogCreate.mockResolvedValue({
      id: 'audit-restore-4',
      action: AuditAction.STATUS_CHANGE,
      entityType: 'Repair',
      entityId: 'repair-1',
      deviceId: 'device-01',
      operatorName: 'Operator One',
      createdAt: new Date('2026-05-22T13:15:02.000Z'),
    });
    rackLocationFindUnique.mockResolvedValue(
      rackDbRecord({
        currentPads: [
          {
            id: 'pad-5',
            code: 'VP-005',
            qrCode: 'QR-VP-005',
            serialNumber: 'SN-VP-005',
            locationStatus: LocationStatus.IN_REPAIR,
            operationalStatus: OperationalStatus.UNDER_REPAIR,
            currentMachineId: null,
          },
        ],
      }),
    );

    const result = await service.restore(
      restorationDto({ outcome: RepairOutcome.UNRESOLVED }),
    );

    expect(result).toMatchObject({
      ok: true,
      decision: 'UNRESOLVED_STILL_IN_REPAIR',
      repair: {
        status: RepairStatus.UNDER_REPAIR,
        outcome: RepairOutcome.UNRESOLVED,
        completedAt: null,
      },
      vacuum: {
        locationStatus: LocationStatus.IN_REPAIR,
        operationalStatus: OperationalStatus.UNDER_REPAIR,
      },
      movement: {
        movementType: MovementType.STATUS_CHANGE,
      },
      auditLog: {
        action: AuditAction.STATUS_CHANGE,
      },
    });
    expect(sendRepairRestoredNotification).not.toHaveBeenCalled();
  });

  it('returns ACTIVE_MUST_DECHARGE_FIRST when the vacuum is still active', async () => {
    vacuumPadFindMany.mockResolvedValue([
      vacuumRecord({
        code: 'VP-001',
        currentMachineId: 'machine-1',
        locationStatus: LocationStatus.ON_MACHINE,
        currentMachine: {
          id: 'machine-1',
          code: 'MACH-001',
          qrCode: 'QR-MACH-001',
          name: 'Vacuum Machine 1',
          status: MachineStatus.ACTIVE,
        },
        currentRackLocation: null,
      }),
    ]);
    rackLocationFindMany.mockResolvedValue([rackDbRecord()]);

    const result = await service.restore(
      restorationDto({ vacuumQr: 'VAC:VP-001' }),
    );

    expect(result).toEqual({
      ok: false,
      decision: 'ACTIVE_MUST_DECHARGE_FIRST',
      message: 'Vacuum must be decharged before restoration',
      httpStatus: 409,
    });
    expect(repairUpdate).not.toHaveBeenCalled();
  });

  it('returns NOT_IN_REPAIR when the vacuum is not currently in repair', async () => {
    vacuumPadFindMany.mockResolvedValue([vacuumRecord()]);
    rackLocationFindMany.mockResolvedValue([rackDbRecord()]);

    const result = await service.restore(restorationDto());

    expect(result).toEqual({
      ok: false,
      decision: 'NOT_IN_REPAIR',
      message: 'Vacuum is not currently in repair',
      httpStatus: 409,
    });
    expect(repairUpdate).not.toHaveBeenCalled();
  });

  it('returns REPAIR_NOT_FOUND when no open repair exists', async () => {
    vacuumPadFindMany.mockResolvedValue([
      vacuumRecord({
        locationStatus: LocationStatus.IN_REPAIR,
        operationalStatus: OperationalStatus.UNDER_REPAIR,
      }),
    ]);
    rackLocationFindMany.mockResolvedValue([rackDbRecord()]);
    repairFindFirst.mockResolvedValue(null);

    const result = await service.restore(restorationDto());

    expect(result).toEqual({
      ok: false,
      decision: 'REPAIR_NOT_FOUND',
      message: 'No active repair record found for this vacuum',
      httpStatus: 409,
    });
    expect(repairUpdate).not.toHaveBeenCalled();
  });

  it('returns RACK_NOT_ALLOWED when the selected rack is a REP rack', async () => {
    vacuumPadFindMany.mockResolvedValue([
      vacuumRecord({
        locationStatus: LocationStatus.IN_REPAIR,
        operationalStatus: OperationalStatus.UNDER_REPAIR,
      }),
    ]);
    rackLocationFindMany.mockResolvedValue([
      rackDbRecord({
        id: 'rack-rep-1',
        code: 'RACK-REP-01',
        qrCode: 'QR-RACK-REP-01',
        label: 'Repair Rack 01',
        type: RackLocationType.REP,
      }),
    ]);
    repairFindFirst.mockResolvedValue(openRepairWriteRecord());

    const result = await service.restore(
      restorationDto({ rackQr: 'RACK-REP-01' }),
    );

    expect(result).toEqual({
      ok: false,
      decision: 'RACK_NOT_ALLOWED',
      message: 'Selected rack is not allowed for restoration',
      httpStatus: 409,
    });
    expect(vacuumPadUpdate).not.toHaveBeenCalled();
  });

  it('returns RACK_OCCUPIED when the selected rack already has another pad', async () => {
    vacuumPadFindMany.mockResolvedValue([
      vacuumRecord({
        locationStatus: LocationStatus.IN_REPAIR,
        operationalStatus: OperationalStatus.UNDER_REPAIR,
      }),
    ]);
    rackLocationFindMany.mockResolvedValue([rackDbRecord()]);
    repairFindFirst.mockResolvedValue(openRepairWriteRecord());
    vacuumPadFindFirst.mockResolvedValue({ id: 'pad-2' });

    const result = await service.restore(restorationDto());

    expect(result).toEqual({
      ok: false,
      decision: 'RACK_OCCUPIED',
      message: 'Selected rack is already occupied',
      httpStatus: 409,
    });
    expect(vacuumPadUpdate).not.toHaveBeenCalled();
  });

  it('returns INVALID_REQUEST when repairCost is negative', async () => {
    const result = await service.restore(restorationDto({ repairCost: '-1' }));

    expect(result).toEqual({
      ok: false,
      decision: 'INVALID_REQUEST',
      message: 'repairCost must be a non-negative decimal value',
      httpStatus: 400,
    });
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it('performs no writes when restoration validation fails inside the transaction', async () => {
    vacuumPadFindMany.mockResolvedValue([vacuumRecord()]);
    rackLocationFindMany.mockResolvedValue([rackDbRecord()]);

    await service.restore(restorationDto());

    expect(repairUpdate).not.toHaveBeenCalled();
    expect(repairPhotoCreate).not.toHaveBeenCalled();
    expect(vacuumPadUpdate).not.toHaveBeenCalled();
    expect(padMovementCreate).not.toHaveBeenCalled();
    expect(auditLogCreate).not.toHaveBeenCalled();
  });

  it('uploads a repair photo successfully for an open repair', async () => {
    repairFindFirst
      .mockResolvedValueOnce({
        id: 'repair-1',
        vacuumPadId: 'pad-5',
        status: RepairStatus.REPORTED,
      })
      .mockResolvedValueOnce({
        id: 'repair-1',
        vacuumPadId: 'pad-5',
        status: RepairStatus.REPORTED,
      });
    storageStoreRepairPhoto.mockResolvedValue({
      storageProvider: PhotoStorageProvider.MINIO,
      objectKey: 'repair-photos/repair-1/example.png',
      bucket: 'vacuum-photos',
      filesystemPath: null,
      publicUrl:
        'http://localhost:9000/vacuum-photos/repair-photos/repair-1/example.png',
      originalFilename: 'repair-photo.png',
      contentType: 'image/png',
      sizeBytes: 4,
      cleanup: jest.fn(),
    });
    repairPhotoCreate.mockResolvedValue({
      id: 'photo-1',
      repairId: 'repair-1',
      objectKey: 'repair-photos/repair-1/example.png',
      bucket: 'vacuum-photos',
      originalFilename: 'repair-photo.png',
      contentType: 'image/png',
      sizeBytes: 4,
      caption: 'Damage close-up',
      operatorName: 'Operator One',
      stage: RepairPhotoStage.FAULT_DECLARATION,
      storageProvider: PhotoStorageProvider.MINIO,
      filesystemPath: null,
      publicUrl:
        'http://localhost:9000/vacuum-photos/repair-photos/repair-1/example.png',
      createdAt: new Date('2026-05-22T14:00:00.000Z'),
    });
    auditLogCreate.mockResolvedValue({
      id: 'audit-photo-1',
      action: AuditAction.PHOTO_UPLOADED,
      entityType: 'RepairPhoto',
      entityId: 'photo-1',
      deviceId: 'device-01',
      operatorName: 'Operator One',
      createdAt: new Date('2026-05-22T14:00:01.000Z'),
    });

    const result = await service.uploadPhoto(
      'repair-1',
      uploadFile(),
      photoUploadDto(),
    );

    expect(result).toEqual({
      ok: true,
      photo: {
        id: 'photo-1',
        repairId: 'repair-1',
        objectKey: 'repair-photos/repair-1/example.png',
        bucket: 'vacuum-photos',
        originalFilename: 'repair-photo.png',
        contentType: 'image/png',
        sizeBytes: 4,
        caption: 'Damage close-up',
        operatorName: 'Operator One',
        stage: RepairPhotoStage.FAULT_DECLARATION,
        storageProvider: PhotoStorageProvider.MINIO,
        filesystemPath: null,
        publicUrl:
          'http://localhost:9000/vacuum-photos/repair-photos/repair-1/example.png',
        createdAt: '2026-05-22T14:00:00.000Z',
      },
      storage: {
        provider: PhotoStorageProvider.MINIO,
      },
    });
    expect(repairCreate).not.toHaveBeenCalled();
    expect(repairUpdate).not.toHaveBeenCalled();
    expect(vacuumPadUpdate).not.toHaveBeenCalled();
    expect(padMovementCreate).not.toHaveBeenCalled();
  });

  it('rejects photo upload when the selected stage already has five photos', async () => {
    repairFindFirst.mockResolvedValue({
      id: 'repair-1',
      vacuumPadId: 'pad-5',
      status: RepairStatus.UNDER_REPAIR,
    });
    repairPhotoCount.mockResolvedValue(5);

    const result = await service.uploadPhoto(
      'repair-1',
      uploadFile(),
      photoUploadDto({ stage: RepairPhotoStage.REPAIR_COMPLETION }),
    );

    expect(result).toEqual({
      ok: false,
      decision: 'MAX_PHOTOS_REACHED',
      message: 'Repair already has 5 photos for REPAIR_COMPLETION',
      httpStatus: 409,
    });
    expect(storageStoreRepairPhoto).not.toHaveBeenCalled();
    expect(repairPhotoCreate).not.toHaveBeenCalled();
  });

  it('lists repair photos with signed view URLs', async () => {
    repairFindFirst.mockResolvedValue({ id: 'repair-1' });
    repairPhotoFindMany.mockResolvedValue([
      {
        id: 'photo-1',
        repairId: 'repair-1',
        objectKey: 'repair-photos/repair-1/example.png',
        bucket: 'vacuum-photos',
        originalFilename: 'repair-photo.png',
        contentType: 'image/png',
        sizeBytes: 128,
        caption: 'Damage close-up',
        operatorName: 'Operator One',
        stage: RepairPhotoStage.FAULT_DECLARATION,
        storageProvider: PhotoStorageProvider.MINIO,
        filesystemPath: null,
        publicUrl: null,
        createdAt: new Date('2026-05-22T12:00:00.000Z'),
      },
    ]);

    const result = await service.listRepairPhotos('repair-1');

    expect(repairFindFirst).toHaveBeenCalledWith({
      where: { id: 'repair-1' },
      select: { id: true },
    });
    const [repairPhotoQuery] = repairPhotoFindMany.mock.calls[0] as [
      {
        where: { repairId: string };
        orderBy: Array<{ createdAt: string }>;
        select: Record<string, boolean>;
      },
    ];
    expect(repairPhotoQuery.where).toEqual({ repairId: 'repair-1' });
    expect(repairPhotoQuery.orderBy).toEqual([{ createdAt: 'asc' }]);
    expect(repairPhotoQuery.select).toEqual(
      expect.objectContaining({
        id: true,
        repairId: true,
        objectKey: true,
      }) as Record<string, boolean>,
    );
    expect(storageCreateRepairPhotoViewUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'photo-1',
        objectKey: 'repair-photos/repair-1/example.png',
      }),
    );
    expect(result).toEqual({
      repairId: 'repair-1',
      photos: [
        {
          id: 'photo-1',
          filename: 'repair-photo.png',
          contentType: 'image/png',
          sizeBytes: 128,
          caption: 'Damage close-up',
          operatorName: 'Operator One',
          stage: RepairPhotoStage.FAULT_DECLARATION,
          storageProvider: PhotoStorageProvider.MINIO,
          createdAt: '2026-05-22T12:00:00.000Z',
          url: 'http://localhost:9000/signed-photo-url',
          urlExpiresAt: '2026-05-22T12:10:00.000Z',
          urlSource: 'SIGNED',
        },
      ],
      faultDeclarationPhotos: [
        expect.objectContaining({
          id: 'photo-1',
          stage: RepairPhotoStage.FAULT_DECLARATION,
        }),
      ],
      repairCompletionPhotos: [],
    });
  });

  it('returns an empty repair photo list for repairs without photos', async () => {
    repairFindFirst.mockResolvedValue({ id: 'repair-1' });
    repairPhotoFindMany.mockResolvedValue([]);

    await expect(service.listRepairPhotos('repair-1')).resolves.toEqual({
      repairId: 'repair-1',
      photos: [],
      faultDeclarationPhotos: [],
      repairCompletionPhotos: [],
    });
  });

  it('deletes repair photo metadata after deleting the stored object', async () => {
    repairPhotoFindFirst.mockResolvedValue({
      id: 'photo-1',
      repairId: 'repair-1',
      stage: RepairPhotoStage.FAULT_DECLARATION,
      objectKey: 'repair-photos/repair-1/example.png',
      bucket: 'vacuum-photos',
      storageProvider: PhotoStorageProvider.MINIO,
      filesystemPath: null,
      publicUrl: null,
      originalFilename: 'repair-photo.png',
      contentType: 'image/png',
      sizeBytes: 128,
      caption: 'Damage close-up',
      operatorName: 'Operator One',
    });
    repairPhotoDelete.mockResolvedValue({});
    auditLogCreate.mockResolvedValue({
      id: 'audit-delete-photo-1',
      action: AuditAction.DELETE,
      entityType: 'RepairPhoto',
      entityId: 'photo-1',
      createdAt: new Date('2026-05-22T12:30:00.000Z'),
    });

    const result = await service.deleteRepairPhoto('repair-1', 'photo-1');

    expect(result).toEqual({
      ok: true,
      repairId: 'repair-1',
      photoId: 'photo-1',
    });
    expect(storageDeleteStoredRepairPhoto).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'photo-1',
        objectKey: 'repair-photos/repair-1/example.png',
      }),
    );
    expect(repairPhotoDelete).toHaveBeenCalledWith({
      where: { id: 'photo-1' },
    });
    const [auditLogCreateCall] = auditLogCreate.mock.calls[0] as [
      {
        data: {
          action: AuditAction;
          entityType: string;
          entityId: string;
        };
      },
    ];
    expect(auditLogCreateCall.data).toMatchObject({
      action: AuditAction.DELETE,
      entityType: 'RepairPhoto',
      entityId: 'photo-1',
    });
  });

  it('rejects repair photo listing for missing repairs', async () => {
    repairFindFirst.mockResolvedValue(null);

    await expect(service.listRepairPhotos('repair-404')).rejects.toMatchObject({
      status: 404,
    });
    expect(repairPhotoFindMany).not.toHaveBeenCalled();
  });

  it('rejects photo upload when the repair is closed', async () => {
    repairFindFirst.mockResolvedValue({
      id: 'repair-1',
      vacuumPadId: 'pad-5',
      status: RepairStatus.COMPLETED,
    });

    const result = await service.uploadPhoto(
      'repair-1',
      uploadFile(),
      photoUploadDto(),
    );

    expect(result).toEqual({
      ok: false,
      decision: 'REPAIR_CLOSED',
      message: 'Repair is closed and cannot accept more photos',
      httpStatus: 409,
    });
    expect(storageStoreRepairPhoto).not.toHaveBeenCalled();
    expect(repairPhotoCreate).not.toHaveBeenCalled();
  });

  it('returns INVALID_FILE when the uploaded file is invalid', async () => {
    repairFindFirst.mockResolvedValue({
      id: 'repair-1',
      vacuumPadId: 'pad-5',
      status: RepairStatus.REPORTED,
    });
    storageStoreRepairPhoto.mockRejectedValue(
      new InvalidRepairPhotoFileError(
        'Only JPEG, PNG, and WebP images are supported',
      ),
    );

    const result = await service.uploadPhoto(
      'repair-1',
      uploadFile({ mimetype: 'application/pdf' }),
      photoUploadDto(),
    );

    expect(result).toEqual({
      ok: false,
      decision: 'INVALID_FILE',
      message: 'Only JPEG, PNG, and WebP images are supported',
      httpStatus: 400,
    });
  });

  it('returns UPLOAD_FAILED when storage upload fails', async () => {
    repairFindFirst.mockResolvedValue({
      id: 'repair-1',
      vacuumPadId: 'pad-5',
      status: RepairStatus.REPORTED,
    });
    storageStoreRepairPhoto.mockRejectedValue(
      new RepairPhotoUploadFailedError(
        'Repair photo upload could not be completed',
      ),
    );

    const result = await service.uploadPhoto(
      'repair-1',
      uploadFile(),
      photoUploadDto(),
    );

    expect(result).toEqual({
      ok: false,
      decision: 'UPLOAD_FAILED',
      message: 'Repair photo upload could not be completed',
      httpStatus: 409,
    });
  });

  it('cleans up the uploaded file when database work fails after storage succeeds', async () => {
    repairFindFirst
      .mockResolvedValueOnce({
        id: 'repair-1',
        vacuumPadId: 'pad-5',
        status: RepairStatus.REPORTED,
      })
      .mockResolvedValueOnce({
        id: 'repair-1',
        vacuumPadId: 'pad-5',
        status: RepairStatus.REPORTED,
      });
    storageStoreRepairPhoto.mockResolvedValue({
      storageProvider: PhotoStorageProvider.FILESYSTEM,
      objectKey: 'repair-photos/repair-1/example.png',
      bucket: 'filesystem',
      filesystemPath: 'repair-photos/repair-1/example.png',
      publicUrl: null,
      originalFilename: 'repair-photo.png',
      contentType: 'image/png',
      sizeBytes: 4,
      cleanup: jest.fn().mockResolvedValue(undefined),
    });
    repairPhotoCreate.mockRejectedValue(new Error('db failure'));

    const result = await service.uploadPhoto(
      'repair-1',
      uploadFile(),
      photoUploadDto(),
    );

    expect(result).toEqual({
      ok: false,
      decision: 'UPLOAD_FAILED',
      message: 'Repair photo upload could not be completed',
      httpStatus: 409,
    });
    expect(storageCleanupStoredPhoto).toHaveBeenCalledTimes(1);
    expect(vacuumPadUpdate).not.toHaveBeenCalled();
    expect(repairUpdate).not.toHaveBeenCalled();
  });
});
