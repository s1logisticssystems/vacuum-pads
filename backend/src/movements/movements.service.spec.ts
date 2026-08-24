import { MovementType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MovementsService } from './movements.service';

describe('MovementsService', () => {
  let service: MovementsService;
  let padMovementFindMany: jest.Mock;
  let repairFindMany: jest.Mock;

  beforeEach(() => {
    padMovementFindMany = jest.fn();
    repairFindMany = jest.fn();

    const prismaService = {
      padMovement: {
        findMany: padMovementFindMany,
      },
      repair: {
        findMany: repairFindMany,
      },
    } as unknown as PrismaService;

    service = new MovementsService(prismaService);
  });

  it('maps charge, decharge and repair movements with default pagination', async () => {
    padMovementFindMany.mockResolvedValue([
      movement({
        id: 'move-charge',
        movementType: MovementType.CHARGE,
        toMachine: machine('MACH-001'),
      }),
      movement({
        id: 'move-decharge',
        movementType: MovementType.DECHARGE,
        fromMachine: machine('MACH-001'),
        toRackLocation: rack('RACK-A-01-01'),
      }),
      movement({
        id: 'move-repair-in',
        movementType: MovementType.REPAIR_INTAKE,
        toRackLocation: rack('RACK-REP-01'),
        metadata: { repairId: 'repair-1' },
      }),
      movement({
        id: 'move-repair-out',
        movementType: MovementType.REPAIR_RELEASE,
        toRackLocation: rack('RACK-A-01-02'),
        metadata: { repairId: 'repair-1' },
      }),
    ]);
    repairFindMany.mockResolvedValue([repair()]);

    const result = await service.listMovements();

    expect(padMovementFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          movementType: {
            in: [
              MovementType.CHARGE,
              MovementType.DECHARGE,
              MovementType.REPAIR_INTAKE,
              MovementType.REPAIR_RELEASE,
            ],
          },
        },
      }),
    );
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(50);
    expect(result.total).toBe(4);
    expect(result.items.map((item) => item.type)).toEqual([
      'CHARGE',
      'DECHARGE',
      'FAULT_DECLARED',
      'FAULT_RESTORED',
    ]);
    expect(result.items[2]).toEqual(
      expect.objectContaining({
        faultCode: 'FC-001',
        faultLabel: 'Motor problem',
        repairId: 'repair-1',
        photoCount: 2,
        rackCode: 'RACK-REP-01',
      }),
    );
    expect(result.items[0]).toEqual(
      expect.objectContaining({
        repairId: null,
        photoCount: 0,
      }),
    );
    expect(result.items[3].endedAt).toBe('2026-05-22T13:30:00.000Z');
  });

  it('filters by type, vacuum text and paginates results', async () => {
    padMovementFindMany.mockResolvedValue([
      ...Array.from({ length: 26 }, (_, index) =>
        movement({
          id: `move-charge-${index + 1}`,
          movementType: MovementType.CHARGE,
          vacuumPad: vacuum(`SN-${index + 1}`, `VP-${index + 1}`),
        }),
      ),
      movement({
        id: 'move-decharge',
        movementType: MovementType.DECHARGE,
        vacuumPad: vacuum('SN-001', 'VP-001'),
      }),
    ]);
    repairFindMany.mockResolvedValue([]);

    const result = await service.listMovements({
      type: 'CHARGE',
      vacuum: 'SN-',
      page: '2',
      pageSize: '25',
    });

    expect(result.total).toBe(26);
    expect(result.totalPages).toBe(2);
    expect(result.page).toBe(2);
    expect(result.items).toEqual([
      expect.objectContaining({
        id: 'move-charge-26',
        type: 'CHARGE',
        vacuumSerial: 'SN-26',
      }),
    ]);
  });

  it('filters movement rows by comma-separated vacuum, machine, rack and fault values', async () => {
    padMovementFindMany.mockResolvedValue([
      movement({
        id: 'move-charge-1',
        movementType: MovementType.CHARGE,
        vacuumPad: vacuum('SN-001', 'VP-001'),
        toMachine: machine('MACH-001'),
      }),
      movement({
        id: 'move-charge-2',
        movementType: MovementType.CHARGE,
        vacuumPad: vacuum('SN-002', 'VP-002'),
        toMachine: machine('MACH-002'),
      }),
      movement({
        id: 'move-decharge',
        movementType: MovementType.DECHARGE,
        vacuumPad: vacuum('SN-003', 'VP-003'),
        toRackLocation: rack('RACK-A-01-01'),
      }),
      movement({
        id: 'move-repair',
        movementType: MovementType.REPAIR_INTAKE,
        vacuumPad: vacuum('SN-004', 'VP-004'),
        toRackLocation: rack('RACK-REP-01'),
        metadata: { repairId: 'repair-1' },
      }),
    ]);
    repairFindMany.mockResolvedValue([repair()]);

    const vacuumResult = await service.listMovements({
      vacuum: 'SN-001,SN-002',
    });
    const machineResult = await service.listMovements({
      machine: 'MACH-001,MACH-002',
    });
    const rackResult = await service.listMovements({
      rack: ['RACK-A-01-01', 'RACK-REP-01'],
    });
    const faultResult = await service.listMovements({
      fault: 'FC-001,OTHER',
    });

    expect(vacuumResult.items.map((item) => item.id)).toEqual([
      'move-charge-1',
      'move-charge-2',
    ]);
    expect(machineResult.items.map((item) => item.id)).toEqual([
      'move-charge-1',
      'move-charge-2',
    ]);
    expect(rackResult.items.map((item) => item.id)).toEqual([
      'move-decharge',
      'move-repair',
    ]);
    expect(faultResult.items.map((item) => item.id)).toEqual(['move-repair']);
  });

  it('filters repair movement rows by fault text', async () => {
    padMovementFindMany.mockResolvedValue([
      movement({
        id: 'move-repair-in',
        movementType: MovementType.REPAIR_INTAKE,
        metadata: { repairId: 'repair-1' },
      }),
      movement({
        id: 'move-charge',
        movementType: MovementType.CHARGE,
      }),
    ]);
    repairFindMany.mockResolvedValue([repair()]);

    const result = await service.listMovements({ fault: 'motor' });

    expect(result.total).toBe(1);
    expect(result.items[0]).toEqual(
      expect.objectContaining({
        id: 'move-repair-in',
        faultCode: 'FC-001',
        faultLabel: 'Motor problem',
      }),
    );
  });
});

function movement(overrides: Record<string, unknown> = {}) {
  return {
    id: 'move-1',
    movementType: MovementType.CHARGE,
    previousLocationStatus: 'IN_RACK',
    newLocationStatus: 'ON_MACHINE',
    previousOperationalStatus: 'FUNCTIONAL',
    newOperationalStatus: 'FUNCTIONAL',
    deviceId: 'admin-web',
    operatorName: null,
    note: null,
    metadata: null,
    createdAt: new Date('2026-05-22T12:00:00.000Z'),
    vacuumPad: vacuum('SN-001', 'VP-001'),
    fromRackLocation: null,
    toRackLocation: null,
    fromMachine: null,
    toMachine: null,
    ...overrides,
  };
}

function vacuum(serialNumber: string, code: string) {
  return {
    id: `pad-${code}`,
    code,
    serialNumber,
    description: 'Vacuum pad',
  };
}

function machine(code: string) {
  return {
    id: `machine-${code}`,
    code,
    name: 'Machine',
  };
}

function rack(code: string) {
  return {
    id: `rack-${code}`,
    code,
    label: 'Rack',
  };
}

function repair(overrides: Record<string, unknown> = {}) {
  return {
    id: 'repair-1',
    code: 'REP-001',
    problemDescription: 'Motor problem',
    faultOtherText: null,
    reportedAt: new Date('2026-05-22T12:30:00.000Z'),
    completedAt: new Date('2026-05-22T13:30:00.000Z'),
    outcome: 'RETURNED_TO_SERVICE',
    faultCatalog: {
      code: 'FC-001',
      label: 'Motor problem',
    },
    _count: {
      photos: 2,
    },
    ...overrides,
  };
}
