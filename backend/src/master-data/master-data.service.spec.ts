import {
  LocationStatus,
  MachineStatus,
  OperationalStatus,
  RackLocationType,
  RepairPriority,
  RepairStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MasterDataService } from './master-data.service';

describe('MasterDataService', () => {
  let service: MasterDataService;
  let machineFindMany: jest.Mock;
  let rackLocationFindMany: jest.Mock;
  let faultCatalogFindMany: jest.Mock;
  let vacuumPadFindFirst: jest.Mock;
  let vacuumPadFindMany: jest.Mock;
  let vacuumPadCreate: jest.Mock;
  let vacuumPadUpdate: jest.Mock;
  let vacuumPadDelete: jest.Mock;
  let vacuumPadCount: jest.Mock;
  let machineFindFirst: jest.Mock;
  let machineCreate: jest.Mock;
  let machineUpdate: jest.Mock;
  let machineDelete: jest.Mock;
  let rackLocationFindFirst: jest.Mock;
  let rackLocationCreate: jest.Mock;
  let rackLocationUpdate: jest.Mock;
  let rackLocationDelete: jest.Mock;
  let faultCatalogFindFirst: jest.Mock;
  let faultCatalogCreate: jest.Mock;
  let faultCatalogUpdate: jest.Mock;
  let faultCatalogDelete: jest.Mock;
  let padMovementCount: jest.Mock;
  let repairCount: jest.Mock;
  let chargeSessionCount: jest.Mock;

  beforeEach(() => {
    machineFindMany = jest.fn();
    rackLocationFindMany = jest.fn();
    faultCatalogFindMany = jest.fn();
    vacuumPadFindFirst = jest.fn();
    vacuumPadFindMany = jest.fn();
    vacuumPadCreate = jest.fn();
    vacuumPadUpdate = jest.fn();
    vacuumPadDelete = jest.fn();
    vacuumPadCount = jest.fn();
    machineFindFirst = jest.fn();
    machineCreate = jest.fn();
    machineUpdate = jest.fn();
    machineDelete = jest.fn();
    rackLocationFindFirst = jest.fn();
    rackLocationCreate = jest.fn();
    rackLocationUpdate = jest.fn();
    rackLocationDelete = jest.fn();
    faultCatalogFindFirst = jest.fn();
    faultCatalogCreate = jest.fn();
    faultCatalogUpdate = jest.fn();
    faultCatalogDelete = jest.fn();
    padMovementCount = jest.fn();
    repairCount = jest.fn();
    chargeSessionCount = jest.fn();

    const prismaService = {
      machine: {
        findMany: machineFindMany,
        findFirst: machineFindFirst,
        create: machineCreate,
        update: machineUpdate,
        delete: machineDelete,
      },
      rackLocation: {
        findMany: rackLocationFindMany,
        findFirst: rackLocationFindFirst,
        create: rackLocationCreate,
        update: rackLocationUpdate,
        delete: rackLocationDelete,
      },
      faultCatalog: {
        findMany: faultCatalogFindMany,
        findFirst: faultCatalogFindFirst,
        create: faultCatalogCreate,
        update: faultCatalogUpdate,
        delete: faultCatalogDelete,
      },
      vacuumPad: {
        findFirst: vacuumPadFindFirst,
        findMany: vacuumPadFindMany,
        create: vacuumPadCreate,
        update: vacuumPadUpdate,
        delete: vacuumPadDelete,
        count: vacuumPadCount,
      },
      padMovement: {
        count: padMovementCount,
      },
      repair: {
        count: repairCount,
      },
      chargeSession: {
        count: chargeSessionCount,
      },
    } as unknown as PrismaService;

    service = new MasterDataService(prismaService);
  });

  it('applies machines activeOnly filter by default', async () => {
    machineFindMany.mockResolvedValue([]);

    await service.listMachines({});

    expect(machineFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          deletedAt: null,
          status: MachineStatus.ACTIVE,
        },
      }),
    );
  });

  it('filters machines by availability and maps occupied state from current pads', async () => {
    machineFindMany.mockResolvedValue([
      {
        id: 'machine-1',
        code: 'MACH-001',
        qrCode: 'QR-MACH-001',
        name: 'Vacuum Machine 1',
        description: null,
        area: 'Production',
        project: 'Line A',
        status: MachineStatus.ACTIVE,
        updatedAt: new Date('2026-05-22T12:00:00.000Z'),
        currentPads: [
          {
            id: 'pad-1',
            code: 'VP-001',
            qrCode: 'QR-VP-001',
            serialNumber: 'SN-VP-001',
            description: 'Occupied vacuum',
            locationStatus: LocationStatus.ON_MACHINE,
            operationalStatus: OperationalStatus.FUNCTIONAL,
            currentMachineId: 'machine-1',
          },
        ],
        chargeSessions: [],
      },
    ]);

    const result = await service.listMachines({
      activeOnly: 'false',
      availableOnly: 'false',
    });

    expect(result).toEqual({
      items: [
        {
          id: 'machine-1',
          code: 'MACH-001',
          qrCode: 'QR-MACH-001',
          name: 'Vacuum Machine 1',
          description: null,
          area: 'Production',
          project: 'Line A',
          status: MachineStatus.ACTIVE,
          updatedAt: '2026-05-22T12:00:00.000Z',
          isAvailableForCharge: false,
          currentPad: {
            id: 'pad-1',
            code: 'VP-001',
            qrCode: 'QR-VP-001',
            serialNumber: 'SN-VP-001',
            description: 'Occupied vacuum',
            locationStatus: LocationStatus.ON_MACHINE,
            operationalStatus: OperationalStatus.FUNCTIONAL,
            displayStatus: 'ACTIVE',
          },
          openChargeSessionId: null,
        },
      ],
      total: 1,
    });
  });

  it('marks machine availability false when an open charge session exists', async () => {
    machineFindMany.mockResolvedValue([
      {
        id: 'machine-1',
        code: 'MACH-001',
        qrCode: 'QR-MACH-001',
        name: 'Vacuum Machine 1',
        description: null,
        area: 'Production',
        project: 'Line A',
        status: MachineStatus.ACTIVE,
        updatedAt: new Date('2026-05-22T12:00:00.000Z'),
        currentPads: [],
        chargeSessions: [{ id: 'session-1' }],
      },
    ]);

    const result = await service.listMachines({
      activeOnly: 'false',
      availableOnly: 'false',
    });

    expect(result.items[0]).toMatchObject({
      isAvailableForCharge: false,
      openChargeSessionId: 'session-1',
    });
  });

  it('applies rack type and availableOnly filters', async () => {
    rackLocationFindMany.mockResolvedValue([]);

    await service.listRackLocations({
      type: 'AVL',
      availableOnly: 'true',
    });

    expect(rackLocationFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          deletedAt: null,
          isActive: true,
          type: RackLocationType.AVL,
          currentPads: {
            none: {
              deletedAt: null,
            },
          },
        },
      }),
    );
  });

  it('maps rack availability false when a current pad exists', async () => {
    rackLocationFindMany.mockResolvedValue([
      {
        id: 'rack-1',
        code: 'RACK-A-01-01',
        qrCode: 'QR-RACK-A-01-01',
        label: 'Rack A-01 Slot 01',
        type: RackLocationType.AVL,
        zone: 'A',
        rack: 'A-01',
        level: '1',
        slot: '01',
        capacity: 1,
        isActive: true,
        currentPads: [
          {
            id: 'pad-1',
            code: 'VP-001',
            qrCode: 'QR-VP-001',
            serialNumber: 'SN-VP-001',
            description: 'Sample rack vacuum',
            locationStatus: LocationStatus.IN_RACK,
            operationalStatus: OperationalStatus.FUNCTIONAL,
            currentMachineId: null,
          },
        ],
      },
    ]);

    const result = await service.listRackLocations({
      activeOnly: 'false',
    });

    expect(result.items[0]).toMatchObject({
      isAvailable: false,
      currentPad: {
        code: 'VP-001',
        displayStatus: 'NOTACTIVE',
      },
    });
  });

  it('returns fault catalog ordered and filtered from active entries', async () => {
    faultCatalogFindMany.mockResolvedValue([
      {
        id: 'fault-1',
        code: 'FC-001',
        label: 'Surface damage',
        description: 'Visible wear',
        severity: RepairPriority.HIGH,
        isActive: true,
        sortOrder: 1,
      },
    ]);

    const result = await service.listFaultCatalog();
    const faultCatalogCalls = faultCatalogFindMany.mock.calls as Array<
      [
        {
          where: unknown;
          orderBy: unknown;
          select: Record<string, boolean>;
        },
      ]
    >;
    const faultCatalogArgs = faultCatalogCalls[0]?.[0];

    expect(faultCatalogArgs).toBeDefined();
    const definedFaultCatalogArgs = faultCatalogArgs;

    expect(definedFaultCatalogArgs.where).toEqual({
      deletedAt: null,
      isActive: true,
    });
    expect(definedFaultCatalogArgs.orderBy).toEqual([
      { sortOrder: 'asc' },
      { label: 'asc' },
    ]);
    expect(definedFaultCatalogArgs.select).toMatchObject({
      id: true,
      code: true,
      label: true,
      description: true,
      severity: true,
      isActive: true,
      sortOrder: true,
    });
    expect(result).toEqual({
      items: [
        {
          id: 'fault-1',
          code: 'FC-001',
          label: 'Surface damage',
          description: 'Visible wear',
          severity: RepairPriority.HIGH,
          isActive: true,
          sortOrder: 1,
        },
      ],
      total: 1,
    });
  });

  it('returns vacuum pad list with current location summaries', async () => {
    vacuumPadFindMany.mockResolvedValue([
      {
        id: 'pad-1',
        code: 'VP-001',
        qrCode: 'SN-VP-001',
        serialNumber: 'SN-VP-001',
        description: 'Sample vacuum',
        dimensions: '100x50',
        type: 'Standard',
        locationStatus: LocationStatus.IN_RACK,
        operationalStatus: OperationalStatus.FUNCTIONAL,
        currentMachineId: null,
        currentMachine: null,
        currentRackLocation: {
          id: 'rack-1',
          code: 'RACK-A-01-01',
          qrCode: 'QR-RACK-A-01-01',
          label: 'Rack A-01 Slot 01',
          type: RackLocationType.AVL,
          zone: 'A',
          rack: 'A-01',
          level: '1',
          slot: '01',
        },
        updatedAt: new Date('2026-05-22T12:00:00.000Z'),
      },
    ]);

    const result = await service.listVacuumPads();

    expect(vacuumPadFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          deletedAt: null,
        },
        orderBy: [{ code: 'asc' }],
      }),
    );
    expect(result).toEqual({
      items: [
        {
          id: 'pad-1',
          code: 'VP-001',
          qrCode: 'SN-VP-001',
          serialNumber: 'SN-VP-001',
          description: 'Sample vacuum',
          dimensions: '100x50',
          type: 'Standard',
          netWeightKg: null,
          dimensionLengthMm: null,
          dimensionWidthMm: null,
          dimensionHeightMm: null,
          liftingCapacityKg: null,
          costEuro: null,
          receivedAt: null,
          locationStatus: LocationStatus.IN_RACK,
          operationalStatus: OperationalStatus.FUNCTIONAL,
          displayStatus: 'NOTACTIVE',
          isIncomplete: false,
          currentMachine: null,
          currentRackLocation: {
            id: 'rack-1',
            code: 'RACK-A-01-01',
            qrCode: 'QR-RACK-A-01-01',
            label: 'Rack A-01 Slot 01',
            type: RackLocationType.AVL,
            zone: 'A',
            rack: 'A-01',
            level: '1',
            slot: '01',
          },
          updatedAt: '2026-05-22T12:00:00.000Z',
        },
      ],
      total: 1,
    });
  });

  it('returns incomplete vacuum pads in master data with a clear flag', async () => {
    vacuumPadFindMany.mockResolvedValue([
      vacuumPadListRecord({
        id: 'pad-incomplete',
        code: 'VP-009',
        qrCode: 'INCOMPLETE-VP-009',
        serialNumber: null,
        operationalStatus: OperationalStatus.OUT_OF_SERVICE,
        locationStatus: LocationStatus.UNKNOWN,
      }),
    ]);

    const result = await service.listVacuumPads();

    expect(result.items[0]).toMatchObject({
      id: 'pad-incomplete',
      code: 'VP-009',
      qrCode: 'INCOMPLETE-VP-009',
      serialNumber: null,
      operationalStatus: OperationalStatus.OUT_OF_SERVICE,
      locationStatus: LocationStatus.UNKNOWN,
      displayStatus: 'NOTACTIVE',
      isIncomplete: true,
    });
  });

  it('returns vacuum pad detail with machine, rack, open repair, open charge, and movements', async () => {
    vacuumPadFindFirst.mockResolvedValue({
      id: 'pad-1',
      code: 'VP-001',
      qrCode: 'QR-VP-001',
      serialNumber: 'SN-VP-001',
      description: 'Sample vacuum',
      dimensions: '100x50',
      type: 'Standard',
      locationStatus: LocationStatus.ON_MACHINE,
      operationalStatus: OperationalStatus.FUNCTIONAL,
      currentMachineId: 'machine-1',
      currentMachine: {
        id: 'machine-1',
        code: 'MACH-001',
        qrCode: 'QR-MACH-001',
        name: 'Vacuum Machine 1',
        description: null,
        area: 'Production',
        project: 'Line A',
        status: MachineStatus.ACTIVE,
      },
      currentRackLocation: null,
      chargeSessions: [
        {
          id: 'session-1',
          machineId: 'machine-1',
          chargedAt: new Date('2026-05-22T10:00:00.000Z'),
          chargeDeviceId: 'device-01',
          chargeOperatorName: 'Operator One',
          note: 'Charge note',
          machine: {
            id: 'machine-1',
            code: 'MACH-001',
            qrCode: 'QR-MACH-001',
            name: 'Vacuum Machine 1',
            description: null,
            area: 'Production',
            project: 'Line A',
            status: MachineStatus.ACTIVE,
          },
        },
      ],
      repairs: [
        {
          id: 'repair-1',
          code: 'REP-001',
          status: RepairStatus.UNDER_REPAIR,
          priority: RepairPriority.HIGH,
          reportedAt: new Date('2026-05-22T11:00:00.000Z'),
          problemDescription: 'Surface damage',
          faultOtherText: null,
          operatorName: 'Operator One',
          faultCatalog: {
            id: 'fault-1',
            code: 'FC-001',
            label: 'Surface damage',
            description: 'Visible wear',
            isActive: true,
            sortOrder: 1,
          },
          _count: {
            photos: 3,
          },
        },
      ],
      movements: [
        {
          id: 'movement-1',
          movementType: 'CHARGE',
          previousLocationStatus: LocationStatus.IN_RACK,
          newLocationStatus: LocationStatus.ON_MACHINE,
          previousOperationalStatus: OperationalStatus.FUNCTIONAL,
          newOperationalStatus: OperationalStatus.FUNCTIONAL,
          deviceId: 'device-01',
          operatorName: 'Operator One',
          note: 'Moved to machine',
          createdAt: new Date('2026-05-22T10:00:01.000Z'),
          fromRackLocation: null,
          toRackLocation: null,
          fromMachine: null,
          toMachine: {
            id: 'machine-1',
            code: 'MACH-001',
            qrCode: 'QR-MACH-001',
            name: 'Vacuum Machine 1',
            description: null,
            area: 'Production',
            project: 'Line A',
            status: MachineStatus.ACTIVE,
          },
        },
      ],
    });

    const result = await service.getVacuumPadDetail('pad-1');

    expect(result).toEqual({
      ok: true,
      item: {
        id: 'pad-1',
        code: 'VP-001',
        qrCode: 'QR-VP-001',
        serialNumber: 'SN-VP-001',
        description: 'Sample vacuum',
        dimensions: '100x50',
        type: 'Standard',
        netWeightKg: null,
        dimensionLengthMm: null,
        dimensionWidthMm: null,
        dimensionHeightMm: null,
        liftingCapacityKg: null,
        costEuro: null,
        receivedAt: null,
        locationStatus: LocationStatus.ON_MACHINE,
        operationalStatus: OperationalStatus.FUNCTIONAL,
        displayStatus: 'ACTIVE',
        isIncomplete: false,
        currentMachine: {
          id: 'machine-1',
          code: 'MACH-001',
          qrCode: 'QR-MACH-001',
          name: 'Vacuum Machine 1',
          description: null,
          area: 'Production',
          project: 'Line A',
          status: MachineStatus.ACTIVE,
        },
        currentRackLocation: null,
        openChargeSession: {
          id: 'session-1',
          machineId: 'machine-1',
          chargedAt: '2026-05-22T10:00:00.000Z',
          chargeDeviceId: 'device-01',
          chargeOperatorName: 'Operator One',
          note: 'Charge note',
          machine: {
            id: 'machine-1',
            code: 'MACH-001',
            qrCode: 'QR-MACH-001',
            name: 'Vacuum Machine 1',
            description: null,
            area: 'Production',
            project: 'Line A',
            status: MachineStatus.ACTIVE,
          },
        },
        openRepair: {
          id: 'repair-1',
          code: 'REP-001',
          status: RepairStatus.UNDER_REPAIR,
          priority: RepairPriority.HIGH,
          reportedAt: '2026-05-22T11:00:00.000Z',
          problemDescription: 'Surface damage',
          faultOtherText: null,
          operatorName: 'Operator One',
          faultCatalog: {
            id: 'fault-1',
            code: 'FC-001',
            label: 'Surface damage',
            description: 'Visible wear',
            severity: null,
            isActive: true,
            sortOrder: 1,
          },
          photoCount: 3,
        },
        recentMovements: [
          {
            id: 'movement-1',
            movementType: 'CHARGE',
            previousLocationStatus: LocationStatus.IN_RACK,
            newLocationStatus: LocationStatus.ON_MACHINE,
            previousOperationalStatus: OperationalStatus.FUNCTIONAL,
            newOperationalStatus: OperationalStatus.FUNCTIONAL,
            deviceId: 'device-01',
            operatorName: 'Operator One',
            note: 'Moved to machine',
            createdAt: '2026-05-22T10:00:01.000Z',
            fromRackLocation: null,
            toRackLocation: null,
            fromMachine: null,
            toMachine: {
              id: 'machine-1',
              code: 'MACH-001',
              qrCode: 'QR-MACH-001',
              name: 'Vacuum Machine 1',
              description: null,
              area: 'Production',
              project: 'Line A',
              status: MachineStatus.ACTIVE,
            },
          },
        ],
      },
    });
  });

  it('creates vacuum pads with qrCode derived from serialNumber', async () => {
    vacuumPadFindFirst.mockResolvedValue(null);
    vacuumPadCreate.mockResolvedValue(
      vacuumPadListRecord({
        code: 'VP-100',
        qrCode: '19081291644',
        serialNumber: '19081291644',
        description: 'New vacuum',
        netWeightKg: 12.5,
        dimensionLengthMm: 120,
        dimensionWidthMm: 80,
        dimensionHeightMm: 40,
        liftingCapacityKg: 250,
        costEuro: 123.45,
        receivedAt: new Date('2026-06-01T00:00:00.000Z'),
      }),
    );

    const result = await service.createVacuumPad({
      code: ' VP-100 ',
      serialNumber: ' 19081291644 ',
      description: 'New vacuum',
      netWeightKg: 12.5,
      dimensionLengthMm: 120,
      dimensionWidthMm: 80,
      dimensionHeightMm: 40,
      liftingCapacityKg: 250,
      costEuro: 123.45,
      receivedAt: new Date('2026-06-01T00:00:00.000Z'),
    });

    const duplicateLookupArgs = firstMockArg<{
      where: { OR: Array<Record<string, string>> };
    }>(vacuumPadFindFirst);
    const createArgs = firstMockArg<{
      data: Record<string, unknown>;
    }>(vacuumPadCreate);

    expect(duplicateLookupArgs.where.OR).toEqual([
      { code: 'VP-100' },
      { serialNumber: '19081291644' },
      { qrCode: '19081291644' },
    ]);
    expect(createArgs.data).toMatchObject({
      code: 'VP-100',
      serialNumber: '19081291644',
      qrCode: '19081291644',
      operationalStatus: OperationalStatus.FUNCTIONAL,
      locationStatus: LocationStatus.UNKNOWN,
      netWeightKg: 12.5,
      dimensionLengthMm: 120,
      dimensionWidthMm: 80,
      dimensionHeightMm: 40,
      liftingCapacityKg: 250,
      costEuro: 123.45,
      receivedAt: new Date('2026-06-01T00:00:00.000Z'),
    });
    expect(result.item.qrCode).toBe('19081291644');
    expect(result.item).toMatchObject({
      netWeightKg: 12.5,
      dimensionLengthMm: 120,
      dimensionWidthMm: 80,
      dimensionHeightMm: 40,
      liftingCapacityKg: 250,
      costEuro: 123.45,
      receivedAt: '2026-06-01T00:00:00.000Z',
    });
  });

  it('creates incomplete vacuum pads without serial numbers as non-operational master data', async () => {
    vacuumPadFindFirst.mockResolvedValue(null);
    vacuumPadCreate.mockResolvedValue(
      vacuumPadListRecord({
        code: 'VP-009',
        qrCode: 'INCOMPLETE-VP-009',
        serialNumber: null,
        operationalStatus: OperationalStatus.OUT_OF_SERVICE,
        locationStatus: LocationStatus.UNKNOWN,
      }),
    );

    const result = await service.createVacuumPad({
      code: ' VP-009 ',
      description: 'Missing serial',
    });

    const duplicateLookupArgs = firstMockArg<{
      where: { OR: Array<Record<string, string>> };
    }>(vacuumPadFindFirst);
    const createArgs = firstMockArg<{
      data: Record<string, unknown>;
    }>(vacuumPadCreate);

    expect(duplicateLookupArgs.where.OR).toEqual([{ code: 'VP-009' }]);
    expect(createArgs.data).toMatchObject({
      code: 'VP-009',
      serialNumber: null,
      qrCode: 'INCOMPLETE-VP-009',
      operationalStatus: OperationalStatus.OUT_OF_SERVICE,
      locationStatus: LocationStatus.UNKNOWN,
    });
    expect(result.item).toMatchObject({
      serialNumber: null,
      qrCode: 'INCOMPLETE-VP-009',
      isIncomplete: true,
    });
  });

  it('auto-generates the next vacuum code when creating without code', async () => {
    vacuumPadFindMany.mockResolvedValue([
      { code: 'VP-001' },
      { code: 'VP-009' },
      { code: 'VP-010' },
      { code: 'VP-LEGACY' },
    ]);
    vacuumPadFindFirst.mockResolvedValue(null);
    vacuumPadCreate.mockResolvedValue(
      vacuumPadListRecord({
        code: 'VP-011',
        qrCode: '19081291655',
        serialNumber: '19081291655',
      }),
    );

    const result = await service.createVacuumPad({
      serialNumber: '19081291655',
    });

    const generatorLookupArgs = firstMockArg<{
      where: Record<string, unknown>;
      select: Record<string, boolean>;
    }>(vacuumPadFindMany);
    const duplicateLookupArgs = firstMockArg<{
      where: { OR: Array<Record<string, string>> };
    }>(vacuumPadFindFirst);
    const createArgs = firstMockArg<{
      data: Record<string, unknown>;
    }>(vacuumPadCreate);

    expect(generatorLookupArgs).toEqual({
      where: { code: { startsWith: 'VP-' } },
      select: { code: true },
    });
    expect(duplicateLookupArgs.where.OR).toEqual([
      { code: 'VP-011' },
      { serialNumber: '19081291655' },
      { qrCode: '19081291655' },
    ]);
    expect(createArgs.data).toMatchObject({
      code: 'VP-011',
      serialNumber: '19081291655',
      qrCode: '19081291655',
    });
    expect(result.item.code).toBe('VP-011');
  });

  it('rejects duplicate vacuum code or serial number', async () => {
    vacuumPadFindFirst.mockResolvedValue({ id: 'existing-pad' });

    await expect(
      service.createVacuumPad({
        code: 'VP-100',
        serialNumber: '19081291644',
      }),
    ).rejects.toThrow('Duplicate vacuum code or serial number');
  });

  it('updates vacuum pads and re-derives qrCode when serialNumber changes', async () => {
    vacuumPadFindFirst
      .mockResolvedValueOnce({
        id: 'pad-1',
        currentMachineId: null,
        currentRackLocationId: null,
        locationStatus: LocationStatus.UNKNOWN,
      })
      .mockResolvedValueOnce(null);
    vacuumPadUpdate.mockResolvedValue(
      vacuumPadListRecord({
        id: 'pad-1',
        code: 'VP-101',
        qrCode: '19081291645',
        serialNumber: '19081291645',
      }),
    );

    const result = await service.updateVacuumPad('pad-1', {
      code: 'VP-101',
      serialNumber: '19081291645',
    });

    const updateArgs = firstMockArg<{
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    }>(vacuumPadUpdate);

    expect(updateArgs.where).toEqual({ id: 'pad-1' });
    expect(updateArgs.data).toMatchObject({
      code: 'VP-101',
      serialNumber: '19081291645',
      qrCode: '19081291645',
    });
    expect(result.item.serialNumber).toBe('19081291645');
  });

  it('creates machines with qrCode derived from code', async () => {
    machineFindFirst.mockResolvedValue(null);
    machineCreate.mockResolvedValue(
      machineRecord({
        code: 'MACH-010',
        qrCode: 'QR-MACH-010',
        name: 'Machine 10',
      }),
    );

    const result = await service.createMachine({
      code: 'MACH-010',
      name: 'Machine 10',
    });

    const createArgs = firstMockArg<{
      data: Record<string, unknown>;
    }>(machineCreate);

    expect(createArgs.data).toMatchObject({
      code: 'MACH-010',
      qrCode: 'QR-MACH-010',
      name: 'Machine 10',
      status: MachineStatus.ACTIVE,
    });
    expect(result.item.qrCode).toBe('QR-MACH-010');
  });

  it('auto-generates the next available machine code when omitted', async () => {
    machineFindMany.mockResolvedValue([
      { code: 'MACH-001' },
      { code: 'MACH-003' },
    ]);
    machineFindFirst.mockResolvedValue(null);
    machineCreate.mockResolvedValue(
      machineRecord({
        code: 'MACH-002',
        qrCode: 'QR-MACH-002',
        name: 'Machine 2',
      }),
    );

    const result = await service.createMachine({
      name: 'Machine 2',
    });

    const createArgs = firstMockArg<{
      data: Record<string, unknown>;
    }>(machineCreate);

    expect(createArgs.data).toMatchObject({
      code: 'MACH-002',
      qrCode: 'QR-MACH-002',
      name: 'Machine 2',
    });
    expect(result.item.code).toBe('MACH-002');
  });

  it('updates machines and re-derives qrCode when code changes', async () => {
    machineFindFirst
      .mockResolvedValueOnce({ id: 'machine-1' })
      .mockResolvedValueOnce(null);
    machineUpdate.mockResolvedValue(
      machineRecord({
        id: 'machine-1',
        code: 'MACH-011',
        qrCode: 'QR-MACH-011',
        name: 'Updated machine',
      }),
    );

    const result = await service.updateMachine('machine-1', {
      code: 'MACH-011',
      name: 'Updated machine',
    });

    const updateArgs = firstMockArg<{
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    }>(machineUpdate);

    expect(updateArgs.where).toEqual({ id: 'machine-1' });
    expect(updateArgs.data).toMatchObject({
      code: 'MACH-011',
      qrCode: 'QR-MACH-011',
      name: 'Updated machine',
    });
    expect(result.item.code).toBe('MACH-011');
  });

  it('creates rack locations with qrCode derived from code', async () => {
    rackLocationFindFirst.mockResolvedValue(null);
    rackLocationCreate.mockResolvedValue(
      rackRecord({
        code: 'RACK-NEW-01',
        qrCode: 'QR-RACK-NEW-01',
        type: RackLocationType.REP,
      }),
    );

    const result = await service.createRackLocation({
      code: 'RACK-NEW-01',
      type: RackLocationType.REP,
    });

    const createArgs = firstMockArg<{
      data: Record<string, unknown>;
    }>(rackLocationCreate);

    expect(createArgs.data).toMatchObject({
      code: 'RACK-NEW-01',
      qrCode: 'QR-RACK-NEW-01',
      type: RackLocationType.REP,
      isActive: true,
    });
    expect(result.item.qrCode).toBe('QR-RACK-NEW-01');
  });

  it('auto-generates rack location code from area row and position', async () => {
    rackLocationFindFirst.mockResolvedValue(null);
    rackLocationCreate.mockResolvedValue(
      rackRecord({
        code: 'RACK-A-01-08',
        qrCode: 'QR-RACK-A-01-08',
        zone: 'A',
        rack: '1',
        slot: '8',
      }),
    );

    const result = await service.createRackLocation({
      zone: 'A',
      rack: '1',
      slot: '8',
      type: RackLocationType.AVL,
    });

    const createArgs = firstMockArg<{
      data: Record<string, unknown>;
    }>(rackLocationCreate);

    expect(createArgs.data).toMatchObject({
      code: 'RACK-A-01-08',
      qrCode: 'QR-RACK-A-01-08',
      type: RackLocationType.AVL,
    });
    expect(result.item.code).toBe('RACK-A-01-08');
  });

  it('rejects duplicate auto-generated rack location codes', async () => {
    rackLocationFindFirst.mockResolvedValue({ id: 'rack-1' });

    await expect(
      service.createRackLocation({
        zone: 'A',
        rack: '01',
        slot: '08',
      }),
    ).rejects.toThrow('Duplicate rack location code');
    expect(rackLocationCreate).not.toHaveBeenCalled();
  });

  it('updates rack locations and accepts inactive state', async () => {
    rackLocationFindFirst
      .mockResolvedValueOnce({ id: 'rack-1' })
      .mockResolvedValueOnce(null);
    rackLocationUpdate.mockResolvedValue(
      rackRecord({
        id: 'rack-1',
        code: 'RACK-NEW-02',
        qrCode: 'QR-RACK-NEW-02',
        isActive: false,
      }),
    );

    const result = await service.updateRackLocation('rack-1', {
      code: 'RACK-NEW-02',
      isActive: false,
    });

    const updateArgs = firstMockArg<{
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    }>(rackLocationUpdate);

    expect(updateArgs.where).toEqual({ id: 'rack-1' });
    expect(updateArgs.data).toMatchObject({
      code: 'RACK-NEW-02',
      qrCode: 'QR-RACK-NEW-02',
      isActive: false,
    });
    expect(result.item.isActive).toBe(false);
  });

  it('creates and updates fault catalog items with severity', async () => {
    faultCatalogFindFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'fault-1' })
      .mockResolvedValueOnce(null);
    faultCatalogCreate.mockResolvedValue(
      faultCatalogRecord({
        code: 'FC-100',
        label: 'New fault',
        severity: RepairPriority.HIGH,
        isActive: false,
        sortOrder: 10,
      }),
    );
    faultCatalogUpdate.mockResolvedValue(
      faultCatalogRecord({
        id: 'fault-1',
        code: 'FC-101',
        label: 'Updated fault',
        severity: RepairPriority.URGENT,
        isActive: true,
        sortOrder: 11,
      }),
    );

    const created = await service.createFaultCatalogItem({
      code: 'FC-100',
      label: 'New fault',
      severity: RepairPriority.HIGH,
      isActive: false,
      sortOrder: 10,
    });
    const updated = await service.updateFaultCatalogItem('fault-1', {
      code: 'FC-101',
      label: 'Updated fault',
      severity: RepairPriority.URGENT,
      isActive: true,
      sortOrder: 11,
    });

    const createArgs = firstMockArg<{
      data: Record<string, unknown>;
    }>(faultCatalogCreate);
    const updateArgs = firstMockArg<{
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    }>(faultCatalogUpdate);

    expect(createArgs.data).toMatchObject({
      code: 'FC-100',
      label: 'New fault',
      severity: RepairPriority.HIGH,
      isActive: false,
      sortOrder: 10,
    });
    expect(updateArgs.where).toEqual({ id: 'fault-1' });
    expect(updateArgs.data).toMatchObject({
      code: 'FC-101',
      label: 'Updated fault',
      severity: RepairPriority.URGENT,
      isActive: true,
      sortOrder: 11,
    });
    expect(created.item.isActive).toBe(false);
    expect(created.item.severity).toBe(RepairPriority.HIGH);
    expect(updated.item.code).toBe('FC-101');
    expect(updated.item.severity).toBe(RepairPriority.URGENT);
  });

  it('auto-generates the next available fault catalog code when omitted', async () => {
    faultCatalogFindMany.mockResolvedValue([
      { code: 'FC-001' },
      { code: 'FC-003' },
    ]);
    faultCatalogFindFirst.mockResolvedValue(null);
    faultCatalogCreate.mockResolvedValue(
      faultCatalogRecord({
        code: 'FC-002',
        label: 'Generated fault',
      }),
    );

    const result = await service.createFaultCatalogItem({
      label: 'Generated fault',
    });

    const createArgs = firstMockArg<{
      data: Record<string, unknown>;
    }>(faultCatalogCreate);

    expect(createArgs.data).toMatchObject({
      code: 'FC-002',
      label: 'Generated fault',
    });
    expect(result.item.code).toBe('FC-002');
  });

  it('retires vacuum pads instead of hard-deleting them', async () => {
    vacuumPadFindFirst.mockResolvedValue({
      id: 'pad-1',
      currentMachineId: null,
      currentRackLocationId: null,
      locationStatus: LocationStatus.UNKNOWN,
    });
    chargeSessionCount.mockResolvedValue(0);

    const result = await service.deleteVacuumPad('pad-1');

    expect(vacuumPadDelete).not.toHaveBeenCalled();
    expect(vacuumPadUpdate).toHaveBeenCalledWith({
      where: { id: 'pad-1' },
      data: { operationalStatus: OperationalStatus.RETIRED },
    });
    expect(result).toMatchObject({ ok: true, deactivated: true });
  });

  it('retires vacuum pads with history or current rack assignment', async () => {
    vacuumPadFindFirst.mockResolvedValue({
      id: 'pad-1',
      currentMachineId: null,
      currentRackLocationId: 'rack-1',
      locationStatus: LocationStatus.IN_RACK,
    });
    chargeSessionCount.mockResolvedValue(0);

    const result = await service.deleteVacuumPad('pad-1');

    expect(vacuumPadUpdate).toHaveBeenCalledWith({
      where: { id: 'pad-1' },
      data: { operationalStatus: OperationalStatus.RETIRED },
    });
    expect(result).toMatchObject({ ok: true, deactivated: true });
  });

  it('blocks vacuum deletion while assigned to a machine', async () => {
    vacuumPadFindFirst.mockResolvedValue({
      id: 'pad-1',
      currentMachineId: 'machine-1',
      currentRackLocationId: null,
      locationStatus: LocationStatus.ON_MACHINE,
    });
    chargeSessionCount.mockResolvedValue(1);

    await expect(service.deleteVacuumPad('pad-1')).rejects.toThrow(
      'Cannot deactivate a vacuum while it is assigned to a machine',
    );
    expect(vacuumPadDelete).not.toHaveBeenCalled();
    expect(vacuumPadUpdate).not.toHaveBeenCalled();
  });

  it('retires machines instead of hard-deleting them', async () => {
    machineFindFirst.mockResolvedValue({ id: 'machine-1' });

    const retired = await service.deleteMachine('machine-1');

    expect(machineDelete).not.toHaveBeenCalled();
    expect(machineUpdate).toHaveBeenCalledWith({
      where: { id: 'machine-1' },
      data: { status: MachineStatus.RETIRED },
    });
    expect(retired).toMatchObject({ ok: true, deactivated: true });
  });

  it('deactivates rack locations instead of hard-deleting them', async () => {
    rackLocationFindFirst.mockResolvedValue({ id: 'rack-1' });

    const result = await service.deleteRackLocation('rack-1');

    expect(rackLocationDelete).not.toHaveBeenCalled();
    expect(rackLocationUpdate).toHaveBeenCalledWith({
      where: { id: 'rack-1' },
      data: { isActive: false },
    });
    expect(result).toMatchObject({ ok: true, deactivated: true });
  });

  it('deactivates fault catalog items instead of hard-deleting them', async () => {
    faultCatalogFindFirst.mockResolvedValue({ id: 'fault-1' });

    const deactivated = await service.deleteFaultCatalogItem('fault-1');

    expect(faultCatalogDelete).not.toHaveBeenCalled();
    expect(faultCatalogUpdate).toHaveBeenCalledWith({
      where: { id: 'fault-1' },
      data: { isActive: false },
    });
    expect(deactivated).toMatchObject({ ok: true, deactivated: true });
  });

  it('returns safe not found for missing or soft-deleted vacuum pads', async () => {
    vacuumPadFindFirst.mockResolvedValue(null);

    const result = await service.getVacuumPadDetail('missing-pad');

    expect(result).toEqual({
      ok: false,
      errorCode: 'NOT_FOUND',
      message: 'Not found',
    });
  });
});

function machineRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: 'machine-1',
    code: 'MACH-001',
    qrCode: 'QR-MACH-001',
    name: 'Vacuum Machine 1',
    description: null,
    area: 'Production',
    project: 'Line A',
    status: MachineStatus.ACTIVE,
    updatedAt: new Date('2026-05-22T12:00:00.000Z'),
    currentPads: [],
    chargeSessions: [],
    ...overrides,
  };
}

function rackRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: 'rack-1',
    code: 'RACK-A-01-01',
    qrCode: 'QR-RACK-A-01-01',
    label: null,
    type: RackLocationType.AVL,
    zone: 'A',
    rack: 'A-01',
    level: '1',
    slot: '01',
    capacity: 1,
    isActive: true,
    currentPads: [],
    ...overrides,
  };
}

function faultCatalogRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: 'fault-1',
    code: 'FC-001',
    label: 'Surface damage',
    description: 'Visible wear',
    severity: null,
    isActive: true,
    sortOrder: 1,
    ...overrides,
  };
}

function vacuumPadListRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: 'pad-1',
    code: 'VP-001',
    qrCode: 'SN-VP-001',
    serialNumber: 'SN-VP-001',
    description: null,
    dimensions: null,
    type: null,
    netWeightKg: null,
    dimensionLengthMm: null,
    dimensionWidthMm: null,
    dimensionHeightMm: null,
    liftingCapacityKg: null,
    costEuro: null,
    receivedAt: null,
    locationStatus: LocationStatus.UNKNOWN,
    operationalStatus: OperationalStatus.FUNCTIONAL,
    currentMachineId: null,
    currentMachine: null,
    currentRackLocation: null,
    updatedAt: new Date('2026-05-22T12:00:00.000Z'),
    ...overrides,
  };
}

function firstMockArg<T>(mock: jest.Mock, callIndex = 0): T {
  const calls = mock.mock.calls as unknown[][];
  const call = calls[callIndex] ?? [];
  return call[0] as T;
}
