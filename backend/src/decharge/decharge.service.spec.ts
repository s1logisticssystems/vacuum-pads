import {
  AuditAction,
  LocationStatus,
  MachineStatus,
  MovementType,
  OperationalStatus,
  RackLocationType,
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
import { DechargeDto } from './dto/decharge.dto';
import { DechargePreviewDto } from './dto/decharge-preview.dto';
import { DechargeService } from './decharge.service';

describe('DechargeService', () => {
  let service: DechargeService;
  let qrScan: jest.Mock;
  let qrParseRawPayload: jest.Mock;
  let prismaTransaction: jest.Mock;
  let chargeSessionFindFirst: jest.Mock;
  let chargeSessionUpdate: jest.Mock;
  let rackLocationFindMany: jest.Mock;
  let rackLocationFindUnique: jest.Mock;
  let vacuumPadFindMany: jest.Mock;
  let vacuumPadFindFirst: jest.Mock;
  let vacuumPadUpdate: jest.Mock;
  let padMovementCreate: jest.Mock;
  let auditLogCreate: jest.Mock;
  let repairCreate: jest.Mock;

  const currentRackLocation = (
    overrides: Partial<CurrentRackLocationSummary> = {},
  ): CurrentRackLocationSummary => ({
    id: 'rack-1',
    code: 'RACK-A-01-01',
    qrCode: 'QR-RACK-A-01-01',
    label: 'Rack A-01 Slot 01',
    type: RackLocationType.AVL,
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
    locationStatus: LocationStatus.ON_MACHINE,
    operationalStatus: OperationalStatus.FUNCTIONAL,
    displayStatus: 'ACTIVE',
    currentMachine: currentMachine(),
    currentRackLocation: null,
    ...overrides,
  });

  const vacuumRecord = (overrides: Record<string, unknown> = {}) => ({
    id: 'pad-1',
    code: 'VP-001',
    qrCode: 'QR-VP-001',
    serialNumber: 'SN-VP-001',
    description: 'Sample vacuum',
    locationStatus: LocationStatus.ON_MACHINE,
    operationalStatus: OperationalStatus.FUNCTIONAL,
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
    ...overrides,
  });

  const rackRecord = (overrides: Record<string, unknown> = {}) => ({
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

  const openChargeSession = (overrides: Record<string, unknown> = {}) => ({
    id: 'session-1',
    vacuumPadId: 'pad-1',
    machineId: 'machine-1',
    chargedAt: new Date('2026-05-22T10:00:00.000Z'),
    dechargedAt: null,
    dechargeRackLocationId: null,
    chargeDeviceId: 'device-01',
    chargeOperatorName: 'Operator One',
    dechargeDeviceId: null,
    dechargeOperatorName: null,
    note: 'Charged for production',
    machine: {
      id: 'machine-1',
      code: 'MACH-001',
      qrCode: 'QR-MACH-001',
      name: 'Vacuum Machine 1',
      status: MachineStatus.ACTIVE,
    },
    ...overrides,
  });

  const dechargedChargeSession = (overrides: Record<string, unknown> = {}) => ({
    id: 'session-1',
    vacuumPadId: 'pad-1',
    machineId: 'machine-1',
    chargedAt: new Date('2026-05-22T10:00:00.000Z'),
    dechargedAt: new Date('2026-05-22T10:30:00.000Z'),
    dechargeRackLocationId: 'rack-7',
    chargeDeviceId: 'device-01',
    chargeOperatorName: 'Operator One',
    dechargeDeviceId: 'device-02',
    dechargeOperatorName: 'Operator Two',
    note: 'Charged for production',
    ...overrides,
  });

  const previewDto = (
    overrides: Partial<DechargePreviewDto> = {},
  ): DechargePreviewDto => ({
    vacuumQr: 'VAC:VP-001',
    deviceId: 'device-01',
    operatorName: 'Operator One',
    ...overrides,
  });

  const dechargeDto = (overrides: Partial<DechargeDto> = {}): DechargeDto => ({
    vacuumQr: 'VAC:VP-001',
    rackQr: 'RACK-A-01-07',
    deviceId: 'device-02',
    operatorName: 'Operator Two',
    note: 'Returned to rack',
    ...overrides,
  });

  beforeEach(() => {
    qrScan = jest.fn();
    qrParseRawPayload = jest.fn();
    prismaTransaction = jest.fn();
    chargeSessionFindFirst = jest.fn();
    chargeSessionUpdate = jest.fn();
    rackLocationFindMany = jest.fn();
    rackLocationFindUnique = jest.fn();
    vacuumPadFindMany = jest.fn();
    vacuumPadFindFirst = jest.fn();
    vacuumPadUpdate = jest.fn();
    padMovementCreate = jest.fn();
    auditLogCreate = jest.fn();
    repairCreate = jest.fn();

    const txClient = {
      chargeSession: {
        findFirst: chargeSessionFindFirst,
        update: chargeSessionUpdate,
      },
      rackLocation: {
        findMany: rackLocationFindMany,
        findUnique: rackLocationFindUnique,
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
      repair: {
        create: repairCreate,
      },
    };

    prismaTransaction.mockImplementation(
      (callback: (tx: typeof txClient) => unknown) => callback(txClient),
    );

    const prismaService = {
      chargeSession: {
        findFirst: chargeSessionFindFirst,
        update: chargeSessionUpdate,
      },
      rackLocation: {
        findMany: rackLocationFindMany,
        findUnique: rackLocationFindUnique,
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
      repair: {
        create: repairCreate,
      },
      $transaction: prismaTransaction,
    } as unknown as PrismaService;

    const qrService = {
      scan: qrScan,
      parseRawPayload: qrParseRawPayload,
    } as unknown as QrService;

    service = new DechargeService(prismaService, qrService);

    qrParseRawPayload.mockImplementation((raw: string) => {
      const normalized = raw.trim();

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
        context: QrScanContext.DECHARGE,
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
      rack: null,
      chargeSession: null,
      requiredNextAction: 'NONE',
    });
  });

  it('returns SELECT_RACK when an active vacuum has an open charge and no rack is provided', async () => {
    qrScan.mockResolvedValue({
      ok: true,
      entityType: QrEntityType.VACUUM,
      input: {
        raw: 'VAC:VP-001',
        normalizedRaw: 'VAC:VP-001',
        context: QrScanContext.DECHARGE,
        deviceId: 'device-01',
        operatorName: 'Operator One',
        format: QrInputFormat.COMPACT,
      },
      entity: vacuumSummary(),
      workflowHints: {
        context: QrScanContext.DECHARGE,
        canContinue: true,
        reason: 'vacuum is eligible for decharge scanning',
        nextExpectedEntityTypes: [QrEntityType.RACK],
      },
    });
    chargeSessionFindFirst.mockResolvedValue(openChargeSession());

    const result = await service.preview(previewDto());

    expect(result).toMatchObject({
      ok: true,
      decision: 'SELECT_RACK',
      requiredNextAction: 'SCAN_RACK',
      chargeSession: {
        id: 'session-1',
        machineId: 'machine-1',
      },
    });
  });

  it('returns CAN_DECHARGE for an active vacuum and an empty AVL rack', async () => {
    qrScan.mockResolvedValue({
      ok: true,
      entityType: QrEntityType.VACUUM,
      input: {
        raw: 'VAC:VP-001',
        normalizedRaw: 'VAC:VP-001',
        context: QrScanContext.DECHARGE,
        deviceId: 'device-01',
        operatorName: 'Operator One',
        format: QrInputFormat.COMPACT,
      },
      entity: vacuumSummary(),
      workflowHints: {
        context: QrScanContext.DECHARGE,
        canContinue: true,
        reason: 'vacuum is eligible for decharge scanning',
        nextExpectedEntityTypes: [QrEntityType.RACK],
      },
    });
    chargeSessionFindFirst.mockResolvedValue(openChargeSession());
    rackLocationFindMany.mockResolvedValue([rackRecord()]);

    const result = await service.preview(
      previewDto({ rackQr: 'RACK-A-01-07' }),
    );

    expect(result).toMatchObject({
      ok: true,
      decision: 'CAN_DECHARGE',
      requiredNextAction: 'CONFIRM_DECHARGE',
      rack: {
        code: 'RACK-A-01-07',
        type: RackLocationType.AVL,
      },
    });
  });

  it('does not accept rack label as a scan alias', async () => {
    qrScan.mockResolvedValue({
      ok: true,
      entityType: QrEntityType.VACUUM,
      input: {
        raw: 'VAC:VP-001',
        normalizedRaw: 'VAC:VP-001',
        context: QrScanContext.DECHARGE,
        deviceId: 'device-01',
        operatorName: 'Operator One',
        format: QrInputFormat.COMPACT,
      },
      entity: vacuumSummary(),
      workflowHints: {
        context: QrScanContext.DECHARGE,
        canContinue: true,
        reason: 'vacuum is eligible for decharge scanning',
        nextExpectedEntityTypes: [QrEntityType.RACK],
      },
    });
    chargeSessionFindFirst.mockResolvedValue(openChargeSession());
    rackLocationFindMany.mockResolvedValue([]);

    const result = await service.preview(
      previewDto({ rackQr: 'Rack A-01 Slot 07' }),
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
          OR: [{ code: 'Rack A-01 Slot 07' }, { qrCode: 'Rack A-01 Slot 07' }],
        },
      }),
    );
  });

  it('returns REPAIR_INTAKE_REQUIRED for an active vacuum and a REP rack', async () => {
    qrScan.mockResolvedValue({
      ok: true,
      entityType: QrEntityType.VACUUM,
      input: {
        raw: 'VAC:VP-001',
        normalizedRaw: 'VAC:VP-001',
        context: QrScanContext.DECHARGE,
        deviceId: 'device-01',
        operatorName: 'Operator One',
        format: QrInputFormat.COMPACT,
      },
      entity: vacuumSummary(),
      workflowHints: {
        context: QrScanContext.DECHARGE,
        canContinue: true,
        reason: 'vacuum is eligible for decharge scanning',
        nextExpectedEntityTypes: [QrEntityType.RACK],
      },
    });
    chargeSessionFindFirst.mockResolvedValue(openChargeSession());
    rackLocationFindMany.mockResolvedValue([
      rackRecord({
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

    const result = await service.preview(previewDto({ rackQr: 'RACK-REP-01' }));

    expect(result).toMatchObject({
      ok: true,
      decision: 'REPAIR_INTAKE_REQUIRED',
      message:
        'Selected repair rack requires fault declaration after decharge.',
      requiredNextAction: 'OPEN_REPAIR_DECLARATION',
      rack: {
        code: 'RACK-REP-01',
        type: RackLocationType.REP,
      },
    });
  });

  it('returns NOT_ACTIVE when the vacuum is not currently active', async () => {
    qrScan.mockResolvedValue({
      ok: true,
      entityType: QrEntityType.VACUUM,
      input: {
        raw: 'VAC:VP-002',
        normalizedRaw: 'VAC:VP-002',
        context: QrScanContext.DECHARGE,
        deviceId: 'device-01',
        operatorName: 'Operator One',
        format: QrInputFormat.COMPACT,
      },
      entity: vacuumSummary({
        locationStatus: LocationStatus.IN_RACK,
        displayStatus: 'NOTACTIVE',
        currentMachine: null,
        currentRackLocation: currentRackLocation({
          code: 'RACK-A-01-02',
          qrCode: 'QR-RACK-A-01-02',
          label: 'Rack A-01 Slot 02',
          slot: '02',
        }),
      }),
      workflowHints: {
        context: QrScanContext.DECHARGE,
        canContinue: false,
        reason: 'vacuum is not eligible for decharge scanning',
        nextExpectedEntityTypes: [],
      },
    });

    const result = await service.preview(
      previewDto({ vacuumQr: 'VAC:VP-002' }),
    );

    expect(result).toMatchObject({
      ok: false,
      decision: 'NOT_ACTIVE',
      chargeSession: null,
    });
    expect(chargeSessionFindFirst).not.toHaveBeenCalled();
  });

  it('returns IN_REPAIR when the vacuum is already in repair', async () => {
    qrScan.mockResolvedValue({
      ok: true,
      entityType: QrEntityType.VACUUM,
      input: {
        raw: 'VAC:VP-001',
        normalizedRaw: 'VAC:VP-001',
        context: QrScanContext.DECHARGE,
        deviceId: 'device-01',
        operatorName: 'Operator One',
        format: QrInputFormat.COMPACT,
      },
      entity: vacuumSummary({
        locationStatus: LocationStatus.IN_REPAIR,
        operationalStatus: OperationalStatus.UNDER_REPAIR,
        displayStatus: 'REPAIR',
        currentMachine: null,
      }),
      workflowHints: {
        context: QrScanContext.DECHARGE,
        canContinue: false,
        reason: 'vacuum is not eligible for decharge scanning',
        nextExpectedEntityTypes: [],
      },
    });

    const result = await service.preview(previewDto());

    expect(result).toMatchObject({
      ok: false,
      decision: 'IN_REPAIR',
      requiredNextAction: 'NONE',
    });
    expect(chargeSessionFindFirst).not.toHaveBeenCalled();
  });

  it('returns NOT_ACTIVE when no open charge session exists', async () => {
    qrScan.mockResolvedValue({
      ok: true,
      entityType: QrEntityType.VACUUM,
      input: {
        raw: 'VAC:VP-001',
        normalizedRaw: 'VAC:VP-001',
        context: QrScanContext.DECHARGE,
        deviceId: 'device-01',
        operatorName: 'Operator One',
        format: QrInputFormat.COMPACT,
      },
      entity: vacuumSummary(),
      workflowHints: {
        context: QrScanContext.DECHARGE,
        canContinue: true,
        reason: 'vacuum is eligible for decharge scanning',
        nextExpectedEntityTypes: [QrEntityType.RACK],
      },
    });
    chargeSessionFindFirst.mockResolvedValue(null);

    const result = await service.preview(previewDto());

    expect(result).toMatchObject({
      ok: false,
      decision: 'NOT_ACTIVE',
      message: 'Vacuum does not have an active charge session',
    });
  });

  it('returns RACK_NOT_FOUND when the rack does not exist', async () => {
    qrScan.mockResolvedValue({
      ok: true,
      entityType: QrEntityType.VACUUM,
      input: {
        raw: 'VAC:VP-001',
        normalizedRaw: 'VAC:VP-001',
        context: QrScanContext.DECHARGE,
        deviceId: 'device-01',
        operatorName: 'Operator One',
        format: QrInputFormat.COMPACT,
      },
      entity: vacuumSummary(),
      workflowHints: {
        context: QrScanContext.DECHARGE,
        canContinue: true,
        reason: 'vacuum is eligible for decharge scanning',
        nextExpectedEntityTypes: [QrEntityType.RACK],
      },
    });
    chargeSessionFindFirst.mockResolvedValue(openChargeSession());
    rackLocationFindMany.mockResolvedValue([]);

    const result = await service.preview(
      previewDto({ rackQr: 'RACK-A-01-99' }),
    );

    expect(result).toMatchObject({
      ok: false,
      decision: 'RACK_NOT_FOUND',
      rack: null,
    });
  });

  it('returns RACK_OCCUPIED when the selected rack already has another pad', async () => {
    qrScan.mockResolvedValue({
      ok: true,
      entityType: QrEntityType.VACUUM,
      input: {
        raw: 'VAC:VP-001',
        normalizedRaw: 'VAC:VP-001',
        context: QrScanContext.DECHARGE,
        deviceId: 'device-01',
        operatorName: 'Operator One',
        format: QrInputFormat.COMPACT,
      },
      entity: vacuumSummary(),
      workflowHints: {
        context: QrScanContext.DECHARGE,
        canContinue: true,
        reason: 'vacuum is eligible for decharge scanning',
        nextExpectedEntityTypes: [QrEntityType.RACK],
      },
    });
    chargeSessionFindFirst.mockResolvedValue(openChargeSession());
    rackLocationFindMany.mockResolvedValue([
      rackRecord({
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

    const result = await service.preview(
      previewDto({ rackQr: 'RACK-A-01-07' }),
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

  it('never writes state while building a decharge preview', async () => {
    qrScan.mockResolvedValue({
      ok: true,
      entityType: QrEntityType.VACUUM,
      input: {
        raw: 'VAC:VP-001',
        normalizedRaw: 'VAC:VP-001',
        context: QrScanContext.DECHARGE,
        deviceId: 'device-01',
        operatorName: 'Operator One',
        format: QrInputFormat.COMPACT,
      },
      entity: vacuumSummary(),
      workflowHints: {
        context: QrScanContext.DECHARGE,
        canContinue: true,
        reason: 'vacuum is eligible for decharge scanning',
        nextExpectedEntityTypes: [QrEntityType.RACK],
      },
    });
    chargeSessionFindFirst.mockResolvedValue(openChargeSession());
    rackLocationFindMany.mockResolvedValue([rackRecord()]);

    await service.preview(previewDto({ rackQr: 'RACK-A-01-07' }));

    expect(chargeSessionUpdate).not.toHaveBeenCalled();
    expect(vacuumPadUpdate).not.toHaveBeenCalled();
    expect(padMovementCreate).not.toHaveBeenCalled();
    expect(auditLogCreate).not.toHaveBeenCalled();
    expect(repairCreate).not.toHaveBeenCalled();
  });

  it('successfully decharges to an AVL rack', async () => {
    vacuumPadFindMany.mockResolvedValue([vacuumRecord()]);
    rackLocationFindMany.mockResolvedValue([rackRecord()]);
    chargeSessionFindFirst.mockResolvedValueOnce(openChargeSession());
    vacuumPadFindFirst.mockResolvedValue(null);
    chargeSessionUpdate.mockResolvedValue(
      dechargedChargeSession({
        dechargeRackLocationId: 'rack-7',
      }),
    );
    vacuumPadUpdate.mockResolvedValue(
      vacuumRecord({
        currentMachineId: null,
        currentMachine: null,
        currentRackLocationId: 'rack-7',
        currentRackLocation: {
          id: 'rack-7',
          code: 'RACK-A-01-07',
          qrCode: 'QR-RACK-A-01-07',
          label: 'Rack A-01 Slot 07',
          type: RackLocationType.AVL,
          zone: 'A',
          rack: 'A-01',
          level: '1',
          slot: '07',
        },
        locationStatus: LocationStatus.IN_RACK,
        operationalStatus: OperationalStatus.FUNCTIONAL,
      }),
    );
    padMovementCreate.mockResolvedValue({
      id: 'movement-1',
      movementType: MovementType.DECHARGE,
      vacuumPadId: 'pad-1',
      fromMachineId: 'machine-1',
      toRackLocationId: 'rack-7',
      previousLocationStatus: LocationStatus.ON_MACHINE,
      newLocationStatus: LocationStatus.IN_RACK,
      previousOperationalStatus: OperationalStatus.FUNCTIONAL,
      newOperationalStatus: OperationalStatus.FUNCTIONAL,
      deviceId: 'device-02',
      operatorName: 'Operator Two',
      note: 'Returned to rack',
      createdAt: new Date('2026-05-22T10:31:00.000Z'),
    });
    auditLogCreate.mockResolvedValue({
      id: 'audit-1',
      action: AuditAction.DECHARGE,
      entityType: 'VacuumPad',
      entityId: 'pad-1',
      deviceId: 'device-02',
      operatorName: 'Operator Two',
      createdAt: new Date('2026-05-22T10:31:00.000Z'),
    });
    rackLocationFindUnique.mockResolvedValue(
      rackRecord({
        currentPads: [
          {
            id: 'pad-1',
            code: 'VP-001',
            qrCode: 'QR-VP-001',
            serialNumber: 'SN-VP-001',
            locationStatus: LocationStatus.IN_RACK,
            operationalStatus: OperationalStatus.FUNCTIONAL,
            currentMachineId: null,
          },
        ],
      }),
    );

    const result = await service.decharge(dechargeDto());

    expect(result).toMatchObject({
      ok: true,
      decision: 'DECHARGED',
      requiredNextAction: 'NONE',
      chargeSession: {
        id: 'session-1',
        dechargeRackLocationId: 'rack-7',
      },
      vacuum: {
        currentMachine: null,
        currentRackLocation: {
          code: 'RACK-A-01-07',
        },
        locationStatus: LocationStatus.IN_RACK,
        operationalStatus: OperationalStatus.FUNCTIONAL,
        displayStatus: 'NOTACTIVE',
      },
      rack: {
        code: 'RACK-A-01-07',
        currentPad: {
          code: 'VP-001',
        },
      },
      movement: {
        movementType: MovementType.DECHARGE,
      },
      auditLog: {
        action: AuditAction.DECHARGE,
      },
    });

    expect(chargeSessionUpdate).toHaveBeenCalledTimes(1);
    expect(vacuumPadUpdate).toHaveBeenCalledTimes(1);
    expect(padMovementCreate).toHaveBeenCalledTimes(1);
    expect(auditLogCreate).toHaveBeenCalledTimes(1);
    expect(repairCreate).not.toHaveBeenCalled();
  });

  it('successfully decharges to a REP rack and requires repair declaration next', async () => {
    vacuumPadFindMany.mockResolvedValue([vacuumRecord()]);
    rackLocationFindMany.mockResolvedValue([
      rackRecord({
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
    chargeSessionFindFirst.mockResolvedValueOnce(openChargeSession());
    vacuumPadFindFirst.mockResolvedValue(null);
    chargeSessionUpdate.mockResolvedValue(
      dechargedChargeSession({
        dechargeRackLocationId: 'rack-rep-1',
      }),
    );
    vacuumPadUpdate.mockResolvedValue(
      vacuumRecord({
        currentMachineId: null,
        currentMachine: null,
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
    );
    padMovementCreate.mockResolvedValue({
      id: 'movement-2',
      movementType: MovementType.DECHARGE,
      vacuumPadId: 'pad-1',
      fromMachineId: 'machine-1',
      toRackLocationId: 'rack-rep-1',
      previousLocationStatus: LocationStatus.ON_MACHINE,
      newLocationStatus: LocationStatus.IN_REPAIR,
      previousOperationalStatus: OperationalStatus.FUNCTIONAL,
      newOperationalStatus: OperationalStatus.INSPECTION_REQUIRED,
      deviceId: 'device-02',
      operatorName: 'Operator Two',
      note: 'Returned to rack',
      createdAt: new Date('2026-05-22T10:32:00.000Z'),
    });
    auditLogCreate.mockResolvedValue({
      id: 'audit-2',
      action: AuditAction.DECHARGE,
      entityType: 'VacuumPad',
      entityId: 'pad-1',
      deviceId: 'device-02',
      operatorName: 'Operator Two',
      createdAt: new Date('2026-05-22T10:32:00.000Z'),
    });
    rackLocationFindUnique.mockResolvedValue(
      rackRecord({
        id: 'rack-rep-1',
        code: 'RACK-REP-01',
        qrCode: 'QR-RACK-REP-01',
        label: 'Repair Rack 01',
        type: RackLocationType.REP,
        zone: 'REP',
        rack: 'REP-01',
        slot: '01',
        currentPads: [
          {
            id: 'pad-1',
            code: 'VP-001',
            qrCode: 'QR-VP-001',
            serialNumber: 'SN-VP-001',
            locationStatus: LocationStatus.IN_REPAIR,
            operationalStatus: OperationalStatus.INSPECTION_REQUIRED,
            currentMachineId: null,
          },
        ],
      }),
    );

    const result = await service.decharge(
      dechargeDto({ rackQr: 'RACK-REP-01' }),
    );

    expect(result).toMatchObject({
      ok: true,
      decision: 'DECHARGED_REPAIR_REQUIRED',
      message:
        'Selected repair rack requires fault declaration after decharge.',
      requiredNextAction: 'OPEN_REPAIR_DECLARATION',
      vacuum: {
        locationStatus: LocationStatus.IN_REPAIR,
        operationalStatus: OperationalStatus.INSPECTION_REQUIRED,
        displayStatus: 'REPAIR',
      },
      rack: {
        code: 'RACK-REP-01',
        type: RackLocationType.REP,
      },
    });
    expect(vacuumPadUpdate).toHaveBeenCalledWith({
      where: {
        id: 'pad-1',
      },
      data: {
        currentMachineId: null,
        currentRackLocationId: 'rack-rep-1',
        locationStatus: LocationStatus.IN_REPAIR,
        operationalStatus: OperationalStatus.INSPECTION_REQUIRED,
      },
      select: QrService.vacuumSelect,
    });

    expect(padMovementCreate).toHaveBeenCalledWith({
      data: {
        movementType: MovementType.DECHARGE,
        vacuumPadId: 'pad-1',
        fromMachineId: 'machine-1',
        toRackLocationId: 'rack-rep-1',
        previousLocationStatus: LocationStatus.ON_MACHINE,
        newLocationStatus: LocationStatus.IN_REPAIR,
        previousOperationalStatus: OperationalStatus.FUNCTIONAL,
        newOperationalStatus: OperationalStatus.INSPECTION_REQUIRED,
        performedById: null,
        deviceId: 'device-02',
        operatorName: 'Operator Two',
        note: 'Returned to rack',
      },
      select: {
        id: true,
        movementType: true,
        vacuumPadId: true,
        fromMachineId: true,
        toRackLocationId: true,
        previousLocationStatus: true,
        newLocationStatus: true,
        previousOperationalStatus: true,
        newOperationalStatus: true,
        deviceId: true,
        operatorName: true,
        note: true,
        createdAt: true,
      },
    });
    expect(repairCreate).not.toHaveBeenCalled();
  });

  it('returns VACUUM_NOT_FOUND when a write request vacuum cannot be resolved', async () => {
    vacuumPadFindMany.mockResolvedValue([]);

    const result = await service.decharge(dechargeDto());

    expect(result).toEqual({
      ok: false,
      decision: 'VACUUM_NOT_FOUND',
      message: 'No matching vacuum found',
      httpStatus: 404,
    });
    expect(chargeSessionUpdate).not.toHaveBeenCalled();
    expect(vacuumPadUpdate).not.toHaveBeenCalled();
  });

  it('returns RACK_NOT_FOUND when a write request rack cannot be resolved', async () => {
    vacuumPadFindMany.mockResolvedValue([vacuumRecord()]);
    rackLocationFindMany.mockResolvedValue([]);

    const result = await service.decharge(dechargeDto());

    expect(result).toEqual({
      ok: false,
      decision: 'RACK_NOT_FOUND',
      message: 'No matching rack found',
      httpStatus: 404,
    });
    expect(chargeSessionUpdate).not.toHaveBeenCalled();
    expect(vacuumPadUpdate).not.toHaveBeenCalled();
  });

  it('returns NOT_ACTIVE when the vacuum is not currently active during write', async () => {
    vacuumPadFindMany.mockResolvedValue([
      vacuumRecord({
        currentMachineId: null,
        currentMachine: null,
        currentRackLocationId: 'rack-1',
        locationStatus: LocationStatus.IN_RACK,
      }),
    ]);
    rackLocationFindMany.mockResolvedValue([rackRecord()]);

    const result = await service.decharge(dechargeDto());

    expect(result).toEqual({
      ok: false,
      decision: 'NOT_ACTIVE',
      message: 'Vacuum is not currently active on a machine',
      httpStatus: 409,
    });
    expect(chargeSessionFindFirst).not.toHaveBeenCalled();
  });

  it('returns IN_REPAIR when the vacuum is already in repair during write', async () => {
    vacuumPadFindMany.mockResolvedValue([
      vacuumRecord({
        locationStatus: LocationStatus.IN_REPAIR,
        operationalStatus: OperationalStatus.UNDER_REPAIR,
        currentMachineId: null,
        currentMachine: null,
      }),
    ]);
    rackLocationFindMany.mockResolvedValue([rackRecord()]);

    const result = await service.decharge(dechargeDto());

    expect(result).toEqual({
      ok: false,
      decision: 'IN_REPAIR',
      message: 'Vacuum is currently in repair',
      httpStatus: 409,
    });
    expect(chargeSessionFindFirst).not.toHaveBeenCalled();
  });

  it('returns NOT_ACTIVE when no open charge session exists during write', async () => {
    vacuumPadFindMany.mockResolvedValue([vacuumRecord()]);
    rackLocationFindMany.mockResolvedValue([rackRecord()]);
    chargeSessionFindFirst.mockResolvedValueOnce(null);
    vacuumPadFindFirst.mockResolvedValue(null);

    const result = await service.decharge(dechargeDto());

    expect(result).toEqual({
      ok: false,
      decision: 'NOT_ACTIVE',
      message: 'Vacuum does not have an active charge session',
      httpStatus: 409,
    });
    expect(chargeSessionUpdate).not.toHaveBeenCalled();
    expect(vacuumPadUpdate).not.toHaveBeenCalled();
  });

  it('returns RACK_OCCUPIED when another pad is already in the rack during write', async () => {
    vacuumPadFindMany.mockResolvedValue([vacuumRecord()]);
    rackLocationFindMany.mockResolvedValue([rackRecord()]);
    chargeSessionFindFirst.mockResolvedValueOnce(openChargeSession());
    vacuumPadFindFirst.mockResolvedValue({ id: 'pad-2' });

    const result = await service.decharge(dechargeDto());

    expect(result).toEqual({
      ok: false,
      decision: 'RACK_OCCUPIED',
      message: 'Selected rack is already occupied',
      httpStatus: 409,
    });
    expect(chargeSessionUpdate).not.toHaveBeenCalled();
    expect(vacuumPadUpdate).not.toHaveBeenCalled();
    expect(padMovementCreate).not.toHaveBeenCalled();
    expect(auditLogCreate).not.toHaveBeenCalled();
  });

  it('does not write anything when validation fails before the state transition', async () => {
    vacuumPadFindMany.mockResolvedValue([]);

    await service.decharge(dechargeDto());

    expect(chargeSessionUpdate).not.toHaveBeenCalled();
    expect(vacuumPadUpdate).not.toHaveBeenCalled();
    expect(padMovementCreate).not.toHaveBeenCalled();
    expect(auditLogCreate).not.toHaveBeenCalled();
    expect(repairCreate).not.toHaveBeenCalled();
  });
});
