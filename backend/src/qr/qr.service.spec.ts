import { PrismaService } from '../prisma/prisma.service';
import { QrScanDto } from './dto/qr-scan.dto';
import { QrService } from './qr.service';
import { QrEntityType, QrScanContext } from './qr.types';

describe('QrService', () => {
  let service: QrService;
  let vacuumPadFindMany: jest.Mock;
  let rackLocationFindMany: jest.Mock;
  let machineFindMany: jest.Mock;

  beforeEach(() => {
    vacuumPadFindMany = jest.fn();
    rackLocationFindMany = jest.fn();
    machineFindMany = jest.fn();

    const prismaService = {
      vacuumPad: {
        findMany: vacuumPadFindMany,
      },
      rackLocation: {
        findMany: rackLocationFindMany,
      },
      machine: {
        findMany: machineFindMany,
      },
    } as unknown as PrismaService;

    service = new QrService(prismaService);
  });

  const createDto = (overrides: Partial<QrScanDto> = {}): QrScanDto => ({
    raw: 'VAC:VP-001',
    context: QrScanContext.STATUS,
    deviceId: 'device-01',
    operatorName: 'Operator One',
    ...overrides,
  });

  const vacuumRecord = (overrides: Record<string, unknown> = {}) => ({
    id: 'pad-1',
    code: 'VP-001',
    qrCode: 'QR-VP-001',
    serialNumber: 'SN-VP-001',
    description: 'Sample vacuum',
    locationStatus: 'IN_RACK',
    operationalStatus: 'FUNCTIONAL',
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

  const rackRecord = (overrides: Record<string, unknown> = {}) => ({
    id: 'rack-1',
    code: 'RACK-A-01-01',
    qrCode: 'QR-RACK-A-01-01',
    label: 'Rack A-01 Slot 01',
    type: 'AVL',
    zone: 'A',
    rack: 'A-01',
    level: '1',
    slot: '01',
    currentPads: [],
    ...overrides,
  });

  const machineRecord = (overrides: Record<string, unknown> = {}) => ({
    id: 'machine-1',
    code: 'MACH-001',
    qrCode: 'QR-MACH-001',
    name: 'Vacuum Machine 1',
    status: 'ACTIVE',
    area: 'Production',
    project: 'Line A',
    currentPads: [],
    ...overrides,
  });

  it('parses compact VAC payloads and returns a vacuum result', async () => {
    vacuumPadFindMany.mockResolvedValue([vacuumRecord()]);

    const result = await service.scan(createDto({ raw: '  VAC:VP-001  ' }));

    expect(result).toMatchObject({
      ok: true,
      entityType: QrEntityType.VACUUM,
      input: {
        normalizedRaw: 'VAC:VP-001',
      },
      entity: {
        code: 'VP-001',
        displayStatus: 'NOTACTIVE',
      },
      workflowHints: {
        context: QrScanContext.STATUS,
        canContinue: true,
      },
    });
  });

  it('parses compact RACK payloads and returns a rack result', async () => {
    rackLocationFindMany.mockResolvedValue([rackRecord()]);

    const result = await service.scan(
      createDto({
        raw: 'RACK:RACK-A-01-01',
        context: QrScanContext.STATUS,
      }),
    );

    expect(result).toMatchObject({
      ok: true,
      entityType: QrEntityType.RACK,
      entity: {
        code: 'RACK-A-01-01',
        type: 'AVL',
      },
    });
  });

  it('parses compact MACHINE payloads and returns a machine result', async () => {
    machineFindMany.mockResolvedValue([machineRecord()]);

    const result = await service.scan(
      createDto({
        raw: 'MACHINE:MACH-001',
        context: QrScanContext.CHARGE,
      }),
    );

    expect(result).toMatchObject({
      ok: true,
      entityType: QrEntityType.MACHINE,
      entity: {
        code: 'MACH-001',
      },
      workflowHints: {
        canContinue: true,
        nextExpectedEntityTypes: [QrEntityType.VACUUM],
      },
    });
  });

  it('parses JSON payloads', async () => {
    vacuumPadFindMany.mockResolvedValue([vacuumRecord()]);

    const result = await service.scan(
      createDto({
        raw: JSON.stringify({
          v: 1,
          type: 'VACUUM',
          id: 'SN-VP-001',
        }),
      }),
    );

    expect(result).toMatchObject({
      ok: true,
      entityType: QrEntityType.VACUUM,
      input: {
        format: 'JSON',
      },
    });
  });

  it('returns a malformed error for invalid JSON', async () => {
    const result = await service.scan(
      createDto({
        raw: '{"v":1,"type":"VACUUM",',
      }),
    );

    expect(result).toEqual({
      ok: false,
      errorCode: 'QR_MALFORMED',
      message: 'Malformed QR payload',
      input: {
        raw: '{"v":1,"type":"VACUUM",',
        normalizedRaw: '{"v":1,"type":"VACUUM",',
        context: QrScanContext.STATUS,
        deviceId: 'device-01',
        operatorName: 'Operator One',
        format: 'JSON',
      },
    });
    expect(vacuumPadFindMany).not.toHaveBeenCalled();
  });

  it('returns unsupported for unknown JSON version', async () => {
    const result = await service.scan(
      createDto({
        raw: JSON.stringify({
          v: 2,
          type: 'VACUUM',
          id: 'VP-001',
        }),
      }),
    );

    expect(result).toMatchObject({
      ok: false,
      errorCode: 'QR_UNSUPPORTED',
      message: 'Unsupported QR type or format',
      input: {
        format: 'JSON',
      },
    });
  });

  it('returns unsupported for unknown compact prefixes', async () => {
    const result = await service.scan(
      createDto({
        raw: 'USER:123',
      }),
    );

    expect(result).toMatchObject({
      ok: false,
      errorCode: 'QR_UNSUPPORTED',
      message: 'Unsupported QR type or format',
      input: {
        format: 'COMPACT',
      },
    });
  });

  it('supports legacy raw vacuum scans by qrCode, serialNumber, or code', async () => {
    vacuumPadFindMany.mockResolvedValue([vacuumRecord()]);

    const result = await service.scan(
      createDto({
        raw: 'QR-VP-001',
      }),
    );

    expect(result).toMatchObject({
      ok: true,
      entityType: QrEntityType.VACUUM,
      input: {
        format: 'LEGACY_RAW',
      },
    });
    expect(vacuumPadFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          deletedAt: null,
          serialNumber: { not: null },
          OR: [
            { serialNumber: 'QR-VP-001' },
            { qrCode: 'QR-VP-001' },
            { code: 'QR-VP-001' },
          ],
        },
      }),
    );
  });

  it('prefers vacuum serialNumber over deprecated scan aliases', async () => {
    vacuumPadFindMany.mockResolvedValue([
      vacuumRecord({
        id: 'pad-qr-alias',
        code: 'VP-ALIAS',
        qrCode: '19081291644',
        serialNumber: '19081291699',
      }),
      vacuumRecord({
        id: 'pad-serial',
        code: 'VP-SERIAL',
        qrCode: 'QR-VP-SERIAL',
        serialNumber: '19081291644',
      }),
    ]);

    const result = await service.scan(createDto({ raw: 'VAC:19081291644' }));

    expect(result).toMatchObject({
      ok: true,
      entity: {
        id: 'pad-serial',
        serialNumber: '19081291644',
      },
    });
  });

  it('prefers machine code over deprecated qrCode aliases', async () => {
    machineFindMany.mockResolvedValue([
      machineRecord({
        id: 'machine-qr-alias',
        code: 'MACH-ALIAS',
        qrCode: 'MACH-001',
      }),
      machineRecord({
        id: 'machine-code',
        code: 'MACH-001',
        qrCode: 'QR-MACH-001',
      }),
    ]);

    const result = await service.scan(
      createDto({
        raw: 'MACHINE:MACH-001',
        context: QrScanContext.CHARGE,
      }),
    );

    expect(result).toMatchObject({
      ok: true,
      entity: {
        id: 'machine-code',
        code: 'MACH-001',
      },
    });
  });

  it('prefers rack code over deprecated qrCode aliases', async () => {
    rackLocationFindMany.mockResolvedValue([
      rackRecord({
        id: 'rack-qr-alias',
        code: 'RACK-ALIAS',
        qrCode: 'RACK-A-01-01',
      }),
      rackRecord({
        id: 'rack-code',
        code: 'RACK-A-01-01',
        qrCode: 'QR-RACK-A-01-01',
      }),
    ]);

    const result = await service.scan(
      createDto({
        raw: 'RACK:RACK-A-01-01',
        context: QrScanContext.STATUS,
      }),
    );

    expect(result).toMatchObject({
      ok: true,
      entity: {
        id: 'rack-code',
        code: 'RACK-A-01-01',
      },
    });
  });

  it('keeps deprecated rack qrCode aliases but does not scan by label', async () => {
    rackLocationFindMany.mockResolvedValueOnce([rackRecord()]);

    const aliasResult = await service.scan(
      createDto({
        raw: 'RACK:QR-RACK-A-01-01',
      }),
    );

    expect(aliasResult).toMatchObject({
      ok: true,
      entityType: QrEntityType.RACK,
    });
    expect(rackLocationFindMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: {
          deletedAt: null,
          isActive: true,
          OR: [{ code: 'QR-RACK-A-01-01' }, { qrCode: 'QR-RACK-A-01-01' }],
        },
      }),
    );

    rackLocationFindMany.mockResolvedValueOnce([]);

    const labelResult = await service.scan(
      createDto({
        raw: 'RACK:Rack A-01 Slot 01',
      }),
    );

    expect(labelResult).toMatchObject({
      ok: false,
      errorCode: 'QR_NOT_FOUND',
    });
    expect(rackLocationFindMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: {
          deletedAt: null,
          isActive: true,
          OR: [{ code: 'Rack A-01 Slot 01' }, { qrCode: 'Rack A-01 Slot 01' }],
        },
      }),
    );
  });

  it('returns not found when no entity matches the QR', async () => {
    vacuumPadFindMany.mockResolvedValue([]);

    const result = await service.scan(
      createDto({
        raw: 'VAC:VP-404',
      }),
    );

    expect(result).toMatchObject({
      ok: false,
      errorCode: 'QR_NOT_FOUND',
      message: 'No matching entity found',
    });
  });

  it('filters racks to active, non-deleted rows only', async () => {
    rackLocationFindMany.mockResolvedValue([]);

    await service.scan(
      createDto({
        raw: 'RACK:RACK-A-01-01',
      }),
    );

    expect(rackLocationFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          deletedAt: null,
          isActive: true,
          OR: [{ code: 'RACK-A-01-01' }, { qrCode: 'RACK-A-01-01' }],
        },
      }),
    );
  });

  it('returns charge workflow hints for an eligible vacuum', async () => {
    vacuumPadFindMany.mockResolvedValue([vacuumRecord()]);

    const result = await service.scan(
      createDto({
        raw: 'VAC:VP-001',
        context: QrScanContext.CHARGE,
      }),
    );

    expect(result).toMatchObject({
      ok: true,
      workflowHints: {
        canContinue: true,
        nextExpectedEntityTypes: [QrEntityType.MACHINE],
      },
    });
  });

  it('returns decharge workflow hints for an active vacuum', async () => {
    vacuumPadFindMany.mockResolvedValue([
      vacuumRecord({
        locationStatus: 'ON_MACHINE',
        currentMachineId: 'machine-1',
        currentMachine: {
          id: 'machine-1',
          code: 'MACH-001',
          qrCode: 'QR-MACH-001',
          name: 'Vacuum Machine 1',
          status: 'ACTIVE',
        },
      }),
    ]);

    const result = await service.scan(
      createDto({
        raw: 'VAC:VP-001',
        context: QrScanContext.DECHARGE,
      }),
    );

    expect(result).toMatchObject({
      ok: true,
      entity: {
        displayStatus: 'ACTIVE',
      },
      workflowHints: {
        canContinue: true,
        nextExpectedEntityTypes: [QrEntityType.RACK],
      },
    });
  });

  it('returns repair workflow hints for a vacuum under repair', async () => {
    vacuumPadFindMany.mockResolvedValue([
      vacuumRecord({
        locationStatus: 'IN_REPAIR',
        operationalStatus: 'UNDER_REPAIR',
        currentRackLocationId: null,
        currentRackLocation: null,
      }),
    ]);

    const result = await service.scan(
      createDto({
        raw: 'VAC:VP-001',
        context: QrScanContext.FAULT_RESTORE,
      }),
    );

    expect(result).toMatchObject({
      ok: true,
      entity: {
        displayStatus: 'REPAIR',
      },
      workflowHints: {
        canContinue: true,
      },
    });
  });
});
