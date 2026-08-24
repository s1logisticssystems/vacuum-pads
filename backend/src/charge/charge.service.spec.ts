import {
  AuditAction,
  LocationStatus,
  MachineStatus,
  MovementType,
  OperationalStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { QrService } from '../qr/qr.service';
import {
  CurrentMachineSummary,
  CurrentRackLocationSummary,
  QrEntityType,
  QrInputFormat,
  QrScanContext,
  VacuumScanEntity,
} from '../qr/qr.types';
import { ChargeDto } from './dto/charge.dto';
import { ChargePreviewDto } from './dto/charge-preview.dto';
import { ChargeService } from './charge.service';

describe('ChargeService', () => {
  let service: ChargeService;
  let qrScan: jest.Mock;
  let qrParseRawPayload: jest.Mock;
  let machineFindFirst: jest.Mock;
  let machineFindMany: jest.Mock;
  let machineFindUnique: jest.Mock;
  let vacuumPadFindMany: jest.Mock;
  let vacuumPadFindFirst: jest.Mock;
  let vacuumPadUpdate: jest.Mock;
  let chargeSessionFindFirst: jest.Mock;
  let chargeSessionCreate: jest.Mock;
  let padMovementCreate: jest.Mock;
  let auditLogCreate: jest.Mock;
  let transactionMock: jest.Mock;

  const currentRackLocation = (
    overrides: Partial<CurrentRackLocationSummary> = {},
  ): CurrentRackLocationSummary => ({
    id: 'rack-1',
    code: 'RACK-A-01-01',
    qrCode: 'QR-RACK-A-01-01',
    label: 'Rack A-01 Slot 01',
    type: 'AVL',
    zone: 'A',
    rack: 'A-01',
    level: '1',
    slot: '01',
    ...overrides,
  });

  const currentMachine = (
    overrides: Partial<CurrentMachineSummary> = {},
  ): CurrentMachineSummary => ({
    id: 'machine-1',
    code: 'MACH-001',
    qrCode: 'QR-MACH-001',
    name: 'Vacuum Machine 1',
    status: MachineStatus.ACTIVE,
    ...overrides,
  });

  const vacuumSummary = (
    overrides: Partial<VacuumScanEntity> = {},
  ): VacuumScanEntity => ({
    id: 'pad-1',
    code: 'VP-001',
    qrCode: 'QR-VP-001',
    serialNumber: 'SN-VP-001',
    description: 'Sample vacuum',
    locationStatus: LocationStatus.IN_RACK,
    operationalStatus: OperationalStatus.FUNCTIONAL,
    displayStatus: 'NOTACTIVE',
    currentMachine: null,
    currentRackLocation: currentRackLocation(),
    ...overrides,
  });

  const vacuumRecord = (overrides: Record<string, unknown> = {}) => ({
    id: 'pad-1',
    code: 'VP-001',
    qrCode: 'QR-VP-001',
    serialNumber: 'SN-VP-001',
    description: 'Sample vacuum',
    locationStatus: LocationStatus.IN_RACK,
    operationalStatus: OperationalStatus.FUNCTIONAL,
    currentMachineId: null,
    currentRackLocationId: 'rack-1',
    currentMachine: null,
    currentRackLocation: {
      id: 'rack-1',
      code: 'RACK-A-01-01',
      qrCode: 'QR-RACK-A-01-01',
      label: 'Rack A-01 Slot 01',
      type: 'AVL',
      zone: 'A',
      rack: 'A-01',
      level: '1',
      slot: '01',
    },
    ...overrides,
  });

  const machineRecord = (overrides: Record<string, unknown> = {}) => ({
    id: 'machine-1',
    code: 'MACH-001',
    qrCode: 'QR-MACH-001',
    name: 'Vacuum Machine 1',
    status: MachineStatus.ACTIVE,
    area: 'Production',
    project: 'Line A',
    currentPads: [],
    ...overrides,
  });

  const previewDto = (
    overrides: Partial<ChargePreviewDto> = {},
  ): ChargePreviewDto => ({
    vacuumQr: 'VAC:VP-001',
    deviceId: 'device-01',
    operatorName: 'Operator One',
    ...overrides,
  });

  const chargeDto = (overrides: Partial<ChargeDto> = {}): ChargeDto => ({
    vacuumQr: 'VAC:VP-001',
    machineQr: 'QR-MACH-001',
    deviceId: 'device-01',
    operatorName: 'Operator One',
    note: 'Charge from rack',
    ...overrides,
  });

  beforeEach(() => {
    qrScan = jest.fn();
    qrParseRawPayload = jest.fn();
    machineFindFirst = jest.fn();
    machineFindMany = jest.fn();
    machineFindUnique = jest.fn();
    vacuumPadFindMany = jest.fn();
    vacuumPadFindFirst = jest.fn();
    vacuumPadUpdate = jest.fn();
    chargeSessionFindFirst = jest.fn();
    chargeSessionCreate = jest.fn();
    padMovementCreate = jest.fn();
    auditLogCreate = jest.fn();

    const txClient = {
      machine: {
        findFirst: machineFindFirst,
        findMany: machineFindMany,
        findUnique: machineFindUnique,
      },
      vacuumPad: {
        findMany: vacuumPadFindMany,
        findFirst: vacuumPadFindFirst,
        update: vacuumPadUpdate,
      },
      chargeSession: {
        findFirst: chargeSessionFindFirst,
        create: chargeSessionCreate,
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
      machine: {
        findFirst: machineFindFirst,
        findMany: machineFindMany,
      },
      chargeSession: {
        findFirst: chargeSessionFindFirst,
        create: chargeSessionCreate,
      },
      vacuumPad: {
        findMany: vacuumPadFindMany,
        findFirst: vacuumPadFindFirst,
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

    service = new ChargeService(prismaService, qrService);

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

      if (normalized.startsWith('MACHINE:')) {
        return {
          ok: true,
          payload: {
            entityType: QrEntityType.MACHINE,
            value: normalized.slice(8),
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

  it('returns VACUUM_NOT_FOUND when the vacuum QR does not resolve', async () => {
    qrScan.mockResolvedValue({
      ok: false,
      errorCode: 'QR_NOT_FOUND',
      message: 'No matching entity found',
      input: {
        raw: 'VAC:VP-404',
        normalizedRaw: 'VAC:VP-404',
        context: QrScanContext.CHARGE,
        deviceId: 'device-01',
        operatorName: 'Operator One',
        format: QrInputFormat.COMPACT,
      },
    });

    const result = await service.preview(
      previewDto({ vacuumQr: 'VAC:VP-404' }),
    );

    expect(result).toEqual({
      ok: false,
      decision: 'VACUUM_NOT_FOUND',
      message: 'No matching vacuum found',
      vacuum: null,
      machine: null,
      requiredNextAction: 'NONE',
    });
  });

  it('returns SELECT_MACHINE when a vacuum is chargeable and no machine is provided', async () => {
    qrScan.mockResolvedValue({
      ok: true,
      entityType: QrEntityType.VACUUM,
      input: {
        raw: 'VAC:VP-001',
        normalizedRaw: 'VAC:VP-001',
        context: QrScanContext.CHARGE,
        deviceId: 'device-01',
        operatorName: 'Operator One',
        format: QrInputFormat.COMPACT,
      },
      entity: vacuumSummary(),
      workflowHints: {
        context: QrScanContext.CHARGE,
        canContinue: true,
        reason: 'vacuum is eligible for charge scanning',
        nextExpectedEntityTypes: [QrEntityType.MACHINE],
      },
    });
    chargeSessionFindFirst.mockResolvedValue(null);

    const result = await service.preview(previewDto());

    expect(result).toMatchObject({
      ok: true,
      decision: 'CAN_CHARGE',
      requiredNextAction: 'SELECT_MACHINE',
      machine: null,
    });
  });

  it('returns CAN_CHARGE when the vacuum and selected machine are available', async () => {
    qrScan.mockResolvedValueOnce({
      ok: true,
      entityType: QrEntityType.VACUUM,
      input: {
        raw: 'VAC:VP-001',
        normalizedRaw: 'VAC:VP-001',
        context: QrScanContext.CHARGE,
        deviceId: 'device-01',
        operatorName: 'Operator One',
        format: QrInputFormat.COMPACT,
      },
      entity: vacuumSummary(),
      workflowHints: {
        context: QrScanContext.CHARGE,
        canContinue: true,
        reason: 'vacuum is eligible for charge scanning',
        nextExpectedEntityTypes: [QrEntityType.MACHINE],
      },
    });
    chargeSessionFindFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    machineFindMany.mockResolvedValue([machineRecord()]);

    const result = await service.preview(
      previewDto({ machineQr: 'MACHINE:QR-MACH-001' }),
    );

    expect(result).toMatchObject({
      ok: true,
      decision: 'CAN_CHARGE',
      requiredNextAction: 'NONE',
      machine: {
        code: 'MACH-001',
        hasOpenChargeSession: false,
      },
    });
  });

  it('supports legacy raw machine QR values in preview', async () => {
    qrScan.mockResolvedValue({
      ok: true,
      entityType: QrEntityType.VACUUM,
      input: {
        raw: 'VAC:VP-001',
        normalizedRaw: 'VAC:VP-001',
        context: QrScanContext.CHARGE,
        deviceId: 'device-01',
        operatorName: 'Operator One',
        format: QrInputFormat.COMPACT,
      },
      entity: vacuumSummary(),
      workflowHints: {
        context: QrScanContext.CHARGE,
        canContinue: true,
        reason: 'vacuum is eligible for charge scanning',
        nextExpectedEntityTypes: [QrEntityType.MACHINE],
      },
    });
    chargeSessionFindFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    machineFindMany.mockResolvedValue([machineRecord()]);

    const result = await service.preview(
      previewDto({ machineQr: 'QR-MACH-001' }),
    );

    expect(result).toMatchObject({
      ok: true,
      decision: 'CAN_CHARGE',
      machine: {
        qrCode: 'QR-MACH-001',
      },
    });
    expect(machineFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          deletedAt: null,
          OR: [{ code: 'QR-MACH-001' }, { qrCode: 'QR-MACH-001' }],
        },
      }),
    );
  });

  it('returns ALREADY_ACTIVE when the vacuum is already on a machine', async () => {
    qrScan.mockResolvedValue({
      ok: true,
      entityType: QrEntityType.VACUUM,
      input: {
        raw: 'VAC:VP-001',
        normalizedRaw: 'VAC:VP-001',
        context: QrScanContext.CHARGE,
        deviceId: 'device-01',
        operatorName: 'Operator One',
        format: QrInputFormat.COMPACT,
      },
      entity: vacuumSummary({
        locationStatus: LocationStatus.ON_MACHINE,
        displayStatus: 'ACTIVE',
        currentMachine: currentMachine(),
      }),
      workflowHints: {
        context: QrScanContext.CHARGE,
        canContinue: false,
        reason: 'vacuum is not eligible for charge scanning',
        nextExpectedEntityTypes: [],
      },
    });
    chargeSessionFindFirst.mockResolvedValue(null);

    const result = await service.preview(previewDto());

    expect(result).toMatchObject({
      ok: false,
      decision: 'ALREADY_ACTIVE',
      requiredNextAction: 'NONE',
    });
  });

  it('returns IN_REPAIR when the vacuum is in repair state', async () => {
    qrScan.mockResolvedValue({
      ok: true,
      entityType: QrEntityType.VACUUM,
      input: {
        raw: 'VAC:VP-001',
        normalizedRaw: 'VAC:VP-001',
        context: QrScanContext.CHARGE,
        deviceId: 'device-01',
        operatorName: 'Operator One',
        format: QrInputFormat.COMPACT,
      },
      entity: vacuumSummary({
        locationStatus: LocationStatus.IN_REPAIR,
        operationalStatus: OperationalStatus.UNDER_REPAIR,
        displayStatus: 'REPAIR',
        currentRackLocation: null,
      }),
      workflowHints: {
        context: QrScanContext.CHARGE,
        canContinue: false,
        reason: 'vacuum is not eligible for charge scanning',
        nextExpectedEntityTypes: [],
      },
    });
    chargeSessionFindFirst.mockResolvedValue(null);

    const result = await service.preview(previewDto());

    expect(result).toMatchObject({
      ok: false,
      decision: 'IN_REPAIR',
      requiredNextAction: 'RESTORE_REPAIR_FIRST',
    });
  });

  it('returns NOT_FUNCTIONAL when inspection is required', async () => {
    qrScan.mockResolvedValue({
      ok: true,
      entityType: QrEntityType.VACUUM,
      input: {
        raw: 'VAC:VP-004',
        normalizedRaw: 'VAC:VP-004',
        context: QrScanContext.CHARGE,
        deviceId: 'device-01',
        operatorName: 'Operator One',
        format: QrInputFormat.COMPACT,
      },
      entity: vacuumSummary({
        operationalStatus: OperationalStatus.INSPECTION_REQUIRED,
      }),
      workflowHints: {
        context: QrScanContext.CHARGE,
        canContinue: false,
        reason: 'vacuum is not eligible for charge scanning',
        nextExpectedEntityTypes: [],
      },
    });
    chargeSessionFindFirst.mockResolvedValue(null);

    const result = await service.preview(
      previewDto({ vacuumQr: 'VAC:VP-004' }),
    );

    expect(result).toMatchObject({
      ok: false,
      decision: 'NOT_FUNCTIONAL',
    });
  });

  it('returns NOT_FUNCTIONAL when the vacuum is out of service', async () => {
    qrScan.mockResolvedValue({
      ok: true,
      entityType: QrEntityType.VACUUM,
      input: {
        raw: 'VAC:VP-006',
        normalizedRaw: 'VAC:VP-006',
        context: QrScanContext.CHARGE,
        deviceId: 'device-01',
        operatorName: 'Operator One',
        format: QrInputFormat.COMPACT,
      },
      entity: vacuumSummary({
        operationalStatus: OperationalStatus.OUT_OF_SERVICE,
      }),
      workflowHints: {
        context: QrScanContext.CHARGE,
        canContinue: false,
        reason: 'vacuum is not eligible for charge scanning',
        nextExpectedEntityTypes: [],
      },
    });
    chargeSessionFindFirst.mockResolvedValue(null);

    const result = await service.preview(
      previewDto({ vacuumQr: 'VAC:VP-006' }),
    );

    expect(result).toMatchObject({
      ok: false,
      decision: 'NOT_FUNCTIONAL',
    });
  });

  it('returns MACHINE_NOT_FOUND when the selected machine does not exist', async () => {
    qrScan.mockResolvedValue({
      ok: true,
      entityType: QrEntityType.VACUUM,
      input: {
        raw: 'VAC:VP-001',
        normalizedRaw: 'VAC:VP-001',
        context: QrScanContext.CHARGE,
        deviceId: 'device-01',
        operatorName: 'Operator One',
        format: QrInputFormat.COMPACT,
      },
      entity: vacuumSummary(),
      workflowHints: {
        context: QrScanContext.CHARGE,
        canContinue: true,
        reason: 'vacuum is eligible for charge scanning',
        nextExpectedEntityTypes: [QrEntityType.MACHINE],
      },
    });
    chargeSessionFindFirst.mockResolvedValue(null);
    machineFindFirst.mockResolvedValue(null);

    const result = await service.preview(
      previewDto({ machineId: 'machine-404' }),
    );

    expect(result).toMatchObject({
      ok: false,
      decision: 'MACHINE_NOT_FOUND',
      requiredNextAction: 'SELECT_MACHINE',
    });
  });

  it('returns MACHINE_OCCUPIED when the selected machine already has a pad', async () => {
    qrScan.mockResolvedValue({
      ok: true,
      entityType: QrEntityType.VACUUM,
      input: {
        raw: 'VAC:VP-001',
        normalizedRaw: 'VAC:VP-001',
        context: QrScanContext.CHARGE,
        deviceId: 'device-01',
        operatorName: 'Operator One',
        format: QrInputFormat.COMPACT,
      },
      entity: vacuumSummary(),
      workflowHints: {
        context: QrScanContext.CHARGE,
        canContinue: true,
        reason: 'vacuum is eligible for charge scanning',
        nextExpectedEntityTypes: [QrEntityType.MACHINE],
      },
    });
    chargeSessionFindFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    machineFindFirst.mockResolvedValue(
      machineRecord({
        currentPads: [
          {
            id: 'pad-2',
            code: 'VP-002',
            qrCode: 'QR-VP-002',
            serialNumber: 'SN-VP-002',
            locationStatus: LocationStatus.ON_MACHINE,
            operationalStatus: OperationalStatus.FUNCTIONAL,
            currentMachineId: 'machine-1',
          },
        ],
      }),
    );

    const result = await service.preview(
      previewDto({ machineId: 'machine-1' }),
    );

    expect(result).toMatchObject({
      ok: false,
      decision: 'MACHINE_OCCUPIED',
      machine: {
        code: 'MACH-001',
        currentPad: {
          code: 'VP-002',
        },
      },
    });
  });

  it('never writes state while building a preview', async () => {
    qrScan.mockResolvedValue({
      ok: true,
      entityType: QrEntityType.VACUUM,
      input: {
        raw: 'VAC:VP-001',
        normalizedRaw: 'VAC:VP-001',
        context: QrScanContext.CHARGE,
        deviceId: 'device-01',
        operatorName: 'Operator One',
        format: QrInputFormat.COMPACT,
      },
      entity: vacuumSummary(),
      workflowHints: {
        context: QrScanContext.CHARGE,
        canContinue: true,
        reason: 'vacuum is eligible for charge scanning',
        nextExpectedEntityTypes: [QrEntityType.MACHINE],
      },
    });
    chargeSessionFindFirst.mockResolvedValue(null);

    await service.preview(previewDto());

    expect(chargeSessionCreate).not.toHaveBeenCalled();
    expect(vacuumPadUpdate).not.toHaveBeenCalled();
    expect(padMovementCreate).not.toHaveBeenCalled();
    expect(auditLogCreate).not.toHaveBeenCalled();
  });

  it('rejects charge when exactly one of machineId or machineQr is not provided', async () => {
    const result = await service.charge(
      chargeDto({ machineId: 'machine-1', machineQr: 'QR-MACH-001' }),
    );

    expect(result).toEqual({
      ok: false,
      decision: 'INVALID_REQUEST',
      message: 'Provide exactly one of machineId or machineQr',
      httpStatus: 400,
    });
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it('charges a vacuum successfully in one transaction', async () => {
    qrParseRawPayload.mockReturnValue({
      ok: true,
      payload: {
        entityType: QrEntityType.VACUUM,
        value: 'VP-001',
        format: QrInputFormat.COMPACT,
      },
    });
    vacuumPadFindMany.mockResolvedValue([vacuumRecord()]);
    machineFindMany.mockResolvedValue([machineRecord()]);
    chargeSessionFindFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    vacuumPadFindFirst.mockResolvedValue(null);
    chargeSessionCreate.mockResolvedValue({
      id: 'session-1',
      vacuumPadId: 'pad-1',
      machineId: 'machine-1',
      chargedAt: new Date('2026-05-22T10:00:00.000Z'),
      chargeDeviceId: 'device-01',
      chargeOperatorName: 'Operator One',
      note: 'Charge from rack',
    });
    vacuumPadUpdate.mockResolvedValue(
      vacuumRecord({
        locationStatus: LocationStatus.ON_MACHINE,
        currentMachineId: 'machine-1',
        currentRackLocationId: null,
        currentMachine: {
          id: 'machine-1',
          code: 'MACH-001',
          qrCode: 'QR-MACH-001',
          name: 'Vacuum Machine 1',
          status: MachineStatus.ACTIVE,
        },
        currentRackLocation: null,
      }),
    );
    padMovementCreate.mockResolvedValue({
      id: 'movement-1',
      movementType: MovementType.CHARGE,
      vacuumPadId: 'pad-1',
      fromRackLocationId: 'rack-1',
      toMachineId: 'machine-1',
      previousLocationStatus: LocationStatus.IN_RACK,
      newLocationStatus: LocationStatus.ON_MACHINE,
      previousOperationalStatus: OperationalStatus.FUNCTIONAL,
      newOperationalStatus: OperationalStatus.FUNCTIONAL,
      deviceId: 'device-01',
      operatorName: 'Operator One',
      note: 'Charge from rack',
      createdAt: new Date('2026-05-22T10:00:01.000Z'),
    });
    auditLogCreate.mockResolvedValue({
      id: 'audit-1',
      action: AuditAction.CHARGE,
      entityType: 'VacuumPad',
      entityId: 'pad-1',
      deviceId: 'device-01',
      operatorName: 'Operator One',
      createdAt: new Date('2026-05-22T10:00:02.000Z'),
    });
    machineFindUnique.mockResolvedValue(
      machineRecord({
        currentPads: [
          {
            id: 'pad-1',
            code: 'VP-001',
            qrCode: 'QR-VP-001',
            serialNumber: 'SN-VP-001',
            locationStatus: LocationStatus.ON_MACHINE,
            operationalStatus: OperationalStatus.FUNCTIONAL,
            currentMachineId: 'machine-1',
          },
        ],
      }),
    );

    const result = await service.charge(chargeDto());

    expect(result).toMatchObject({
      ok: true,
      decision: 'CHARGED',
      chargeSession: {
        id: 'session-1',
        vacuumPadId: 'pad-1',
        machineId: 'machine-1',
      },
      vacuum: {
        code: 'VP-001',
        locationStatus: LocationStatus.ON_MACHINE,
        displayStatus: 'ACTIVE',
      },
      machine: {
        code: 'MACH-001',
        hasOpenChargeSession: true,
      },
      movement: {
        id: 'movement-1',
        movementType: MovementType.CHARGE,
      },
      auditLog: {
        id: 'audit-1',
        action: AuditAction.CHARGE,
      },
    });
    expect(chargeSessionCreate).toHaveBeenCalledTimes(1);
    expect(vacuumPadUpdate).toHaveBeenCalledTimes(1);
    expect(padMovementCreate).toHaveBeenCalledTimes(1);
    expect(auditLogCreate).toHaveBeenCalledTimes(1);
    const movementCreateCalls = padMovementCreate.mock.calls as Array<
      [
        {
          data: {
            movementType: MovementType;
            performedById: string | null;
            deviceId: string | null;
            operatorName: string | null;
          };
        },
      ]
    >;
    const movementCreateArg = movementCreateCalls[0]?.[0];

    expect(movementCreateArg).toBeDefined();
    expect(movementCreateArg?.data).toMatchObject({
      movementType: MovementType.CHARGE,
      performedById: null,
      deviceId: 'device-01',
      operatorName: 'Operator One',
    });
  });

  it('returns VACUUM_NOT_FOUND for charge when the vacuum does not exist', async () => {
    qrParseRawPayload.mockReturnValue({
      ok: true,
      payload: {
        entityType: QrEntityType.VACUUM,
        value: 'VP-404',
        format: QrInputFormat.COMPACT,
      },
    });
    vacuumPadFindMany.mockResolvedValue([]);

    const result = await service.charge(chargeDto({ vacuumQr: 'VAC:VP-404' }));

    expect(result).toEqual({
      ok: false,
      decision: 'VACUUM_NOT_FOUND',
      message: 'No matching vacuum found',
      httpStatus: 404,
    });
    expect(chargeSessionCreate).not.toHaveBeenCalled();
  });

  it('returns MACHINE_NOT_FOUND for charge when the machine does not exist', async () => {
    qrParseRawPayload.mockReturnValue({
      ok: true,
      payload: {
        entityType: QrEntityType.VACUUM,
        value: 'VP-001',
        format: QrInputFormat.COMPACT,
      },
    });
    vacuumPadFindMany.mockResolvedValue([vacuumRecord()]);
    machineFindMany.mockResolvedValue([]);

    const result = await service.charge(chargeDto());

    expect(result).toEqual({
      ok: false,
      decision: 'MACHINE_NOT_FOUND',
      message: 'No matching machine found',
      httpStatus: 404,
    });
    expect(chargeSessionCreate).not.toHaveBeenCalled();
  });

  it('returns ALREADY_ACTIVE when the vacuum is already active', async () => {
    qrParseRawPayload.mockReturnValue({
      ok: true,
      payload: {
        entityType: QrEntityType.VACUUM,
        value: 'VP-001',
        format: QrInputFormat.COMPACT,
      },
    });
    vacuumPadFindMany.mockResolvedValue([
      vacuumRecord({
        locationStatus: LocationStatus.ON_MACHINE,
        currentMachineId: 'machine-9',
      }),
    ]);
    machineFindMany.mockResolvedValue([machineRecord()]);
    chargeSessionFindFirst.mockResolvedValue(null);
    vacuumPadFindFirst.mockResolvedValue(null);

    const result = await service.charge(chargeDto());

    expect(result).toEqual({
      ok: false,
      decision: 'ALREADY_ACTIVE',
      message: 'Vacuum is already active on a machine',
      httpStatus: 409,
    });
    expect(vacuumPadUpdate).not.toHaveBeenCalled();
  });

  it('returns IN_REPAIR when the vacuum is under repair', async () => {
    qrParseRawPayload.mockReturnValue({
      ok: true,
      payload: {
        entityType: QrEntityType.VACUUM,
        value: 'VP-001',
        format: QrInputFormat.COMPACT,
      },
    });
    vacuumPadFindMany.mockResolvedValue([
      vacuumRecord({
        locationStatus: LocationStatus.IN_REPAIR,
        operationalStatus: OperationalStatus.UNDER_REPAIR,
      }),
    ]);
    machineFindMany.mockResolvedValue([machineRecord()]);
    chargeSessionFindFirst.mockResolvedValue(null);
    vacuumPadFindFirst.mockResolvedValue(null);

    const result = await service.charge(chargeDto());

    expect(result).toEqual({
      ok: false,
      decision: 'IN_REPAIR',
      message: 'Vacuum is currently in repair',
      httpStatus: 409,
    });
    expect(vacuumPadUpdate).not.toHaveBeenCalled();
  });

  it('returns NOT_FUNCTIONAL when inspection is required', async () => {
    qrParseRawPayload.mockReturnValue({
      ok: true,
      payload: {
        entityType: QrEntityType.VACUUM,
        value: 'VP-004',
        format: QrInputFormat.COMPACT,
      },
    });
    vacuumPadFindMany.mockResolvedValue([
      vacuumRecord({
        code: 'VP-004',
        operationalStatus: OperationalStatus.INSPECTION_REQUIRED,
      }),
    ]);
    machineFindMany.mockResolvedValue([machineRecord()]);
    chargeSessionFindFirst.mockResolvedValue(null);
    vacuumPadFindFirst.mockResolvedValue(null);

    const result = await service.charge(chargeDto({ vacuumQr: 'VAC:VP-004' }));

    expect(result).toEqual({
      ok: false,
      decision: 'NOT_FUNCTIONAL',
      message: 'Vacuum is not eligible for charge in its current condition',
      httpStatus: 409,
    });
  });

  it('returns NOT_FUNCTIONAL when the vacuum is out of service', async () => {
    qrParseRawPayload.mockReturnValue({
      ok: true,
      payload: {
        entityType: QrEntityType.VACUUM,
        value: 'VP-006',
        format: QrInputFormat.COMPACT,
      },
    });
    vacuumPadFindMany.mockResolvedValue([
      vacuumRecord({
        code: 'VP-006',
        operationalStatus: OperationalStatus.OUT_OF_SERVICE,
      }),
    ]);
    machineFindMany.mockResolvedValue([machineRecord()]);
    chargeSessionFindFirst.mockResolvedValue(null);
    vacuumPadFindFirst.mockResolvedValue(null);

    const result = await service.charge(chargeDto({ vacuumQr: 'VAC:VP-006' }));

    expect(result).toEqual({
      ok: false,
      decision: 'NOT_FUNCTIONAL',
      message: 'Vacuum is not eligible for charge in its current condition',
      httpStatus: 409,
    });
  });

  it('returns MACHINE_OCCUPIED when the machine already has a current pad', async () => {
    qrParseRawPayload.mockReturnValue({
      ok: true,
      payload: {
        entityType: QrEntityType.VACUUM,
        value: 'VP-001',
        format: QrInputFormat.COMPACT,
      },
    });
    vacuumPadFindMany.mockResolvedValue([vacuumRecord()]);
    machineFindMany.mockResolvedValue([machineRecord()]);
    chargeSessionFindFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    vacuumPadFindFirst.mockResolvedValue({ id: 'pad-2' });

    const result = await service.charge(chargeDto());

    expect(result).toEqual({
      ok: false,
      decision: 'MACHINE_OCCUPIED',
      message: 'Selected machine is already occupied',
      httpStatus: 409,
    });
    expect(chargeSessionCreate).not.toHaveBeenCalled();
  });

  it('returns MACHINE_OCCUPIED when the machine already has an open charge session', async () => {
    qrParseRawPayload.mockReturnValue({
      ok: true,
      payload: {
        entityType: QrEntityType.VACUUM,
        value: 'VP-001',
        format: QrInputFormat.COMPACT,
      },
    });
    vacuumPadFindMany.mockResolvedValue([vacuumRecord()]);
    machineFindMany.mockResolvedValue([machineRecord()]);
    chargeSessionFindFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'open-machine-charge' });
    vacuumPadFindFirst.mockResolvedValue(null);

    const result = await service.charge(chargeDto());

    expect(result).toEqual({
      ok: false,
      decision: 'MACHINE_OCCUPIED',
      message: 'Selected machine is already occupied',
      httpStatus: 409,
    });
    expect(chargeSessionCreate).not.toHaveBeenCalled();
  });

  it('rolls back effectively by performing no writes when validation fails', async () => {
    qrParseRawPayload.mockReturnValue({
      ok: true,
      payload: {
        entityType: QrEntityType.VACUUM,
        value: 'VP-001',
        format: QrInputFormat.COMPACT,
      },
    });
    vacuumPadFindMany.mockResolvedValue([
      vacuumRecord({
        operationalStatus: OperationalStatus.OUT_OF_SERVICE,
      }),
    ]);
    machineFindMany.mockResolvedValue([machineRecord()]);
    chargeSessionFindFirst.mockResolvedValue(null);
    vacuumPadFindFirst.mockResolvedValue(null);

    await service.charge(chargeDto());

    expect(chargeSessionCreate).not.toHaveBeenCalled();
    expect(vacuumPadUpdate).not.toHaveBeenCalled();
    expect(padMovementCreate).not.toHaveBeenCalled();
    expect(auditLogCreate).not.toHaveBeenCalled();
  });
});
