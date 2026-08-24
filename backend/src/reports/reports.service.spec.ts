import {
  LocationStatus,
  MachineStatus,
  OperationalStatus,
  RepairStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ReportsService } from './reports.service';

describe('ReportsService', () => {
  let service: ReportsService;
  let vacuumPadFindMany: jest.Mock;
  let machineFindMany: jest.Mock;
  let chargeSessionFindMany: jest.Mock;
  let repairFindMany: jest.Mock;

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-06-02T12:00:00.000Z'));
    vacuumPadFindMany = jest.fn();
    machineFindMany = jest.fn();
    chargeSessionFindMany = jest.fn();
    repairFindMany = jest.fn();

    const prismaService = {
      vacuumPad: {
        findMany: vacuumPadFindMany,
      },
      machine: {
        findMany: machineFindMany,
      },
      chargeSession: {
        findMany: chargeSessionFindMany,
      },
      repair: {
        findMany: repairFindMany,
      },
    } as unknown as PrismaService;

    service = new ReportsService(prismaService);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns all vacuum pads sorted by charge count when no filters are provided', async () => {
    vacuumPadFindMany.mockResolvedValue([
      vacuumPad({ id: 'pad-1', code: 'VP-001', serialNumber: 'SN-001' }),
      vacuumPad({ id: 'pad-2', code: 'VP-002', serialNumber: 'SN-002' }),
      vacuumPad({ id: 'pad-3', code: 'VP-003', serialNumber: 'SN-003' }),
    ]);
    chargeSessionFindMany.mockResolvedValue([
      chargeSession({
        id: 'charge-1',
        vacuumPadId: 'pad-1',
        chargedAt: '2026-06-01T08:00:00.000Z',
        dechargedAt: '2026-06-01T10:00:00.000Z',
      }),
      chargeSession({
        id: 'charge-2',
        vacuumPadId: 'pad-1',
        chargedAt: '2026-06-01T12:00:00.000Z',
        dechargedAt: '2026-06-01T15:00:00.000Z',
      }),
      chargeSession({
        id: 'charge-open',
        vacuumPadId: 'pad-1',
        chargedAt: '2026-06-02T10:00:00.000Z',
        dechargedAt: null,
      }),
      chargeSession({
        id: 'charge-3',
        vacuumPadId: 'pad-2',
        chargedAt: '2026-06-01T06:00:00.000Z',
        dechargedAt: '2026-06-01T10:00:00.000Z',
      }),
    ]);

    const result = await service.getMostUsedVacuumPads();

    expect(vacuumPadFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { deletedAt: null },
      }),
    );
    expect(chargeSessionFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          vacuumPadId: {
            in: ['pad-1', 'pad-2', 'pad-3'],
          },
        },
      }),
    );
    expect(result.total).toBe(3);
    expect(result.items.map((item) => item.code)).toEqual([
      'VP-001',
      'VP-002',
      'VP-003',
    ]);
    expect(result.items[0]).toMatchObject({
      rank: 1,
      code: 'VP-001',
      vacuumPad: 'SN-001',
      chargeCount: 3,
      usageHours: 7,
      downtimeHours: 21,
      averageMachineStayHours: 2.33,
      openSessionCount: 1,
    });
    expect(result.items[2]).toMatchObject({
      rank: 3,
      code: 'VP-003',
      chargeCount: 0,
      usageHours: 0,
    });
  });

  it('applies date filters to charge count, usage overlap, and closed downtime gaps', async () => {
    vacuumPadFindMany.mockResolvedValue([
      vacuumPad({ id: 'pad-1', code: 'VP-001', serialNumber: 'SN-001' }),
    ]);
    chargeSessionFindMany.mockResolvedValue([
      chargeSession({
        id: 'charge-1',
        vacuumPadId: 'pad-1',
        chargedAt: '2026-06-01T08:00:00.000Z',
        dechargedAt: '2026-06-01T10:00:00.000Z',
      }),
      chargeSession({
        id: 'charge-2',
        vacuumPadId: 'pad-1',
        chargedAt: '2026-06-01T12:00:00.000Z',
        dechargedAt: '2026-06-01T15:00:00.000Z',
      }),
    ]);

    const result = await service.getMostUsedVacuumPads({
      dateFrom: '2026-06-01T11:00:00.000Z',
      dateTo: '2026-06-01T13:00:00.000Z',
    });

    expect(result.items[0]).toMatchObject({
      chargeCount: 1,
      usageHours: 1,
      downtimeHours: 1,
      averageMachineStayHours: 1,
      lastUsageAt: '2026-06-01T12:00:00.000Z',
    });
  });

  it('filters vacuum pads by serial number or code', async () => {
    vacuumPadFindMany.mockResolvedValue([
      vacuumPad({ id: 'pad-2', code: 'VP-002', serialNumber: 'SN-002' }),
    ]);
    chargeSessionFindMany.mockResolvedValue([]);

    const result = await service.getMostUsedVacuumPads({ vacuum: 'SN-002' });

    expect(vacuumPadFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          deletedAt: null,
          OR: [
            { code: { contains: 'SN-002' } },
            { serialNumber: { contains: 'SN-002' } },
          ],
        },
      }),
    );
    expect(result.items).toEqual([
      expect.objectContaining({
        code: 'VP-002',
      }),
    ]);
  });

  it('filters most-used report by multiple vacuum values', async () => {
    vacuumPadFindMany.mockResolvedValue([
      vacuumPad({ id: 'pad-1', code: 'VP-001', serialNumber: 'SN-001' }),
      vacuumPad({ id: 'pad-2', code: 'VP-002', serialNumber: 'SN-002' }),
    ]);
    chargeSessionFindMany.mockResolvedValue([]);

    const result = await service.getMostUsedVacuumPads({
      vacuum: 'SN-001,VP-002',
    });

    expect(vacuumPadFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          deletedAt: null,
          OR: [
            { code: { contains: 'SN-001' } },
            { serialNumber: { contains: 'SN-001' } },
            { code: { contains: 'VP-002' } },
            { serialNumber: { contains: 'VP-002' } },
          ],
        },
      }),
    );
    expect(result.items.map((item) => item.code)).toEqual(['VP-001', 'VP-002']);
  });

  it('returns all vacuum pads sorted by total faults with custom faults and open repairs included', async () => {
    vacuumPadFindMany.mockResolvedValue([
      vacuumPad({ id: 'pad-1', code: 'VP-001', serialNumber: 'SN-001' }),
      vacuumPad({ id: 'pad-2', code: 'VP-002', serialNumber: 'SN-002' }),
      vacuumPad({ id: 'pad-3', code: 'VP-003', serialNumber: 'SN-003' }),
    ]);
    repairFindMany.mockResolvedValue([
      repair({
        id: 'repair-1',
        vacuumPadId: 'pad-1',
        faultCatalogId: 'fault-1',
        reportedAt: '2026-06-01T08:00:00.000Z',
        completedAt: '2026-06-01T10:00:00.000Z',
        faultCatalog: faultCatalog({ id: 'fault-1', code: 'FC-001' }),
      }),
      repair({
        id: 'repair-open',
        vacuumPadId: 'pad-1',
        faultCatalogId: null,
        faultOtherText: 'Loose edge',
        reportedAt: '2026-06-01T12:00:00.000Z',
        completedAt: null,
        status: RepairStatus.UNDER_REPAIR,
        faultCatalog: null,
      }),
      repair({
        id: 'repair-2',
        vacuumPadId: 'pad-1',
        faultCatalogId: 'fault-1',
        reportedAt: '2026-06-02T08:00:00.000Z',
        completedAt: '2026-06-02T09:00:00.000Z',
        faultCatalog: faultCatalog({ id: 'fault-1', code: 'FC-001' }),
      }),
      repair({
        id: 'repair-3',
        vacuumPadId: 'pad-2',
        faultCatalogId: 'fault-2',
        reportedAt: '2026-06-01T06:00:00.000Z',
        completedAt: '2026-06-01T10:00:00.000Z',
        faultCatalog: faultCatalog({ id: 'fault-2', code: 'FC-002' }),
      }),
    ]);

    const result = await service.getFaultyVacuumPads();

    expect(repairFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          vacuumPadId: {
            in: ['pad-1', 'pad-2', 'pad-3'],
          },
        },
      }),
    );
    expect(result.total).toBe(3);
    expect(result.items.map((item) => item.code)).toEqual([
      'VP-001',
      'VP-002',
      'VP-003',
    ]);
    expect(result.items[0]).toMatchObject({
      rank: 1,
      code: 'VP-001',
      totalFaults: 3,
      distinctFaultTypes: 2,
      repairCount: 2,
      repairHours: 27,
      faultDowntimeHours: 27,
      averageRepairHours: 9,
      openRepairCount: 1,
      lastFaultAt: '2026-06-02T08:00:00.000Z',
    });
    expect(result.chart.monthlyTrend).toEqual([{ month: '2026-06', count: 4 }]);
    expect(result.chart.totals).toMatchObject({
      totalFaults: 4,
      totalRepairHours: 31,
      totalDowntimeHours: 31,
      openRepairCount: 1,
    });
  });

  it('applies date filters and caps open repair duration by dateTo', async () => {
    vacuumPadFindMany.mockResolvedValue([
      vacuumPad({ id: 'pad-1', code: 'VP-001', serialNumber: 'SN-001' }),
    ]);
    repairFindMany.mockResolvedValue([
      repair({
        id: 'repair-open',
        vacuumPadId: 'pad-1',
        reportedAt: '2026-06-02T08:00:00.000Z',
        completedAt: null,
        status: RepairStatus.UNDER_REPAIR,
      }),
    ]);

    const result = await service.getFaultyVacuumPads({
      dateFrom: '2026-06-02T00:00:00.000Z',
      dateTo: '2026-06-02T10:00:00.000Z',
    });

    expect(repairFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          vacuumPadId: {
            in: ['pad-1'],
          },
          reportedAt: {
            gte: new Date('2026-06-02T00:00:00.000Z'),
            lte: new Date('2026-06-02T10:00:00.000Z'),
          },
        },
      }),
    );
    expect(result.items[0]).toMatchObject({
      totalFaults: 1,
      repairHours: 2,
      faultDowntimeHours: 2,
      averageRepairHours: 2,
      openRepairCount: 1,
    });
  });

  it('filters faulty vacuum report by vacuum and fault catalog or custom text', async () => {
    vacuumPadFindMany.mockResolvedValue([
      vacuumPad({ id: 'pad-1', code: 'VP-001', serialNumber: 'SN-001' }),
    ]);
    repairFindMany.mockResolvedValue([
      repair({
        id: 'repair-1',
        vacuumPadId: 'pad-1',
        faultCatalogId: 'fault-1',
        reportedAt: '2026-06-01T08:00:00.000Z',
        completedAt: '2026-06-01T10:00:00.000Z',
        faultCatalog: faultCatalog({ id: 'fault-1', code: 'FC-001' }),
      }),
      repair({
        id: 'repair-other',
        vacuumPadId: 'pad-1',
        faultCatalogId: null,
        faultOtherText: 'Loose edge',
        reportedAt: '2026-06-01T12:00:00.000Z',
        completedAt: '2026-06-01T13:00:00.000Z',
        faultCatalog: null,
      }),
    ]);

    const catalogResult = await service.getFaultyVacuumPads({
      vacuum: 'SN-001',
      fault: 'FC-001',
    });
    const customResult = await service.getFaultyVacuumPads({
      vacuum: 'VP-001',
      fault: 'OTHER',
    });

    expect(vacuumPadFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          deletedAt: null,
          OR: [
            { code: { contains: 'SN-001' } },
            { serialNumber: { contains: 'SN-001' } },
          ],
        },
      }),
    );
    expect(catalogResult.items[0]).toMatchObject({
      totalFaults: 1,
      distinctFaultTypes: 1,
      repairHours: 2,
    });
    expect(customResult.items[0]).toMatchObject({
      totalFaults: 1,
      distinctFaultTypes: 1,
      repairHours: 1,
    });
  });

  it('filters faulty vacuum report by multiple vacuum and fault values', async () => {
    vacuumPadFindMany.mockResolvedValue([
      vacuumPad({ id: 'pad-1', code: 'VP-001', serialNumber: 'SN-001' }),
      vacuumPad({ id: 'pad-2', code: 'VP-002', serialNumber: 'SN-002' }),
    ]);
    repairFindMany.mockResolvedValue([
      repair({
        id: 'repair-catalog',
        vacuumPadId: 'pad-1',
        faultCatalogId: 'fault-1',
        reportedAt: '2026-06-01T08:00:00.000Z',
        completedAt: '2026-06-01T09:00:00.000Z',
        faultCatalog: faultCatalog({ id: 'fault-1', code: 'FC-001' }),
      }),
      repair({
        id: 'repair-other',
        vacuumPadId: 'pad-2',
        faultCatalogId: null,
        faultOtherText: 'Loose edge',
        reportedAt: '2026-06-01T10:00:00.000Z',
        completedAt: '2026-06-01T11:00:00.000Z',
        faultCatalog: null,
      }),
    ]);

    const result = await service.getFaultyVacuumPads({
      vacuum: ['SN-001', 'VP-002'],
      fault: 'FC-001,OTHER',
    });

    expect(vacuumPadFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          deletedAt: null,
          OR: [
            { code: { contains: 'SN-001' } },
            { serialNumber: { contains: 'SN-001' } },
            { code: { contains: 'VP-002' } },
            { serialNumber: { contains: 'VP-002' } },
          ],
        },
      }),
    );
    expect(result.items.map((item) => item.totalFaults)).toEqual([1, 1]);
  });

  it('attributes machine faults to covering sessions or latest prior charges', async () => {
    machineFindMany.mockResolvedValue([
      machine({ id: 'machine-1', code: 'MACH-001', name: 'Machine 1' }),
      machine({ id: 'machine-2', code: 'MACH-002', name: 'Machine 2' }),
      machine({ id: 'machine-3', code: 'MACH-003', name: 'Machine 3' }),
    ]);
    repairFindMany.mockResolvedValue([
      repair({
        id: 'repair-1',
        vacuumPadId: 'pad-1',
        faultCatalogId: 'fault-1',
        reportedAt: '2026-06-01T09:00:00.000Z',
        completedAt: '2026-06-01T11:00:00.000Z',
        faultCatalog: faultCatalog({ id: 'fault-1', code: 'FC-001' }),
      }),
      repair({
        id: 'repair-2',
        vacuumPadId: 'pad-1',
        faultCatalogId: null,
        faultOtherText: 'Loose edge',
        reportedAt: '2026-06-01T14:00:00.000Z',
        completedAt: null,
        status: RepairStatus.UNDER_REPAIR,
        faultCatalog: null,
      }),
      repair({
        id: 'repair-3',
        vacuumPadId: 'pad-2',
        faultCatalogId: 'fault-2',
        reportedAt: '2026-06-01T11:00:00.000Z',
        completedAt: '2026-06-01T13:00:00.000Z',
        faultCatalog: faultCatalog({
          id: 'fault-2',
          code: 'FC-002',
          label: 'Seal leak',
        }),
      }),
    ]);
    chargeSessionFindMany.mockResolvedValue([
      chargeSession({
        id: 'charge-covering',
        vacuumPadId: 'pad-1',
        machineId: 'machine-1',
        chargedAt: '2026-06-01T08:00:00.000Z',
        dechargedAt: '2026-06-01T12:00:00.000Z',
      }),
      chargeSession({
        id: 'charge-open',
        vacuumPadId: 'pad-1',
        machineId: 'machine-2',
        chargedAt: '2026-06-01T13:00:00.000Z',
        dechargedAt: null,
      }),
      chargeSession({
        id: 'charge-prior',
        vacuumPadId: 'pad-2',
        machineId: 'machine-1',
        chargedAt: '2026-06-01T06:00:00.000Z',
        dechargedAt: '2026-06-01T09:00:00.000Z',
      }),
    ]);

    const result = await service.getMachinesCausingMostFaults();

    expect(machineFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { deletedAt: null },
      }),
    );
    expect(chargeSessionFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          vacuumPadId: {
            in: ['pad-1', 'pad-2'],
          },
          chargedAt: {
            lte: new Date('2026-06-01T14:00:00.000Z'),
          },
        },
      }),
    );
    expect(result.items.map((item) => item.machineCode)).toEqual([
      'MACH-001',
      'MACH-002',
      'MACH-003',
    ]);
    expect(result.items[0]).toMatchObject({
      rank: 1,
      machineCode: 'MACH-001',
      totalFaults: 2,
      affectedVacuumPads: 2,
      distinctFaultTypes: 2,
      repairDispatches: 2,
      downtimeHours: 4,
      averageFaultsPerVacuum: 1,
      mostCommonFault: 'FC-001 - Surface damage',
      lastFaultAt: '2026-06-01T11:00:00.000Z',
      status: MachineStatus.ACTIVE,
    });
    expect(result.items[1]).toMatchObject({
      machineCode: 'MACH-002',
      totalFaults: 1,
      downtimeHours: 22,
      mostCommonFault: 'OTHER - Άλλο',
    });
    expect(result.chart.monthlyTrend).toEqual([{ month: '2026-06', count: 3 }]);
    expect(result.chart.totals).toMatchObject({
      totalFaults: 3,
      totalDowntimeHours: 26,
      unattributedFaults: 0,
    });
    expect(result.note).toContain('τελευταίας χρέωσης');
  });

  it('applies date filters and caps open machine repair downtime by dateTo', async () => {
    machineFindMany.mockResolvedValue([
      machine({ id: 'machine-1', code: 'MACH-001' }),
    ]);
    repairFindMany.mockResolvedValue([
      repair({
        id: 'repair-open',
        vacuumPadId: 'pad-1',
        reportedAt: '2026-06-02T08:00:00.000Z',
        completedAt: null,
        status: RepairStatus.UNDER_REPAIR,
      }),
    ]);
    chargeSessionFindMany.mockResolvedValue([
      chargeSession({
        id: 'charge-open',
        vacuumPadId: 'pad-1',
        machineId: 'machine-1',
        chargedAt: '2026-06-02T07:00:00.000Z',
        dechargedAt: null,
      }),
    ]);

    const result = await service.getMachinesCausingMostFaults({
      dateFrom: '2026-06-02T00:00:00.000Z',
      dateTo: '2026-06-02T10:00:00.000Z',
    });

    expect(repairFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          reportedAt: {
            gte: new Date('2026-06-02T00:00:00.000Z'),
            lte: new Date('2026-06-02T10:00:00.000Z'),
          },
        },
      }),
    );
    expect(result.items[0]).toMatchObject({
      totalFaults: 1,
      downtimeHours: 2,
    });
  });

  it('filters machine fault report by machine selector', async () => {
    machineFindMany.mockResolvedValue([
      machine({ id: 'machine-2', code: 'MACH-002', name: 'Machine 2' }),
    ]);
    repairFindMany.mockResolvedValue([
      repair({
        id: 'repair-1',
        vacuumPadId: 'pad-1',
        reportedAt: '2026-06-01T09:00:00.000Z',
        completedAt: '2026-06-01T10:00:00.000Z',
      }),
      repair({
        id: 'repair-2',
        vacuumPadId: 'pad-2',
        reportedAt: '2026-06-01T12:00:00.000Z',
        completedAt: '2026-06-01T14:00:00.000Z',
      }),
    ]);
    chargeSessionFindMany.mockResolvedValue([
      chargeSession({
        id: 'charge-1',
        vacuumPadId: 'pad-1',
        machineId: 'machine-1',
        chargedAt: '2026-06-01T08:00:00.000Z',
        dechargedAt: null,
      }),
      chargeSession({
        id: 'charge-2',
        vacuumPadId: 'pad-2',
        machineId: 'machine-2',
        chargedAt: '2026-06-01T11:00:00.000Z',
        dechargedAt: null,
      }),
    ]);

    const result = await service.getMachinesCausingMostFaults({
      machine: 'MACH-002',
    });

    expect(machineFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          deletedAt: null,
          OR: [
            { code: { contains: 'MACH-002' } },
            { name: { contains: 'MACH-002' } },
          ],
        },
      }),
    );
    expect(result.items).toEqual([
      expect.objectContaining({
        machineCode: 'MACH-002',
        totalFaults: 1,
      }),
    ]);
  });

  it('filters machine fault report by multiple machines and faults', async () => {
    machineFindMany.mockResolvedValue([
      machine({ id: 'machine-1', code: 'MACH-001', name: 'Machine 1' }),
      machine({ id: 'machine-2', code: 'MACH-002', name: 'Machine 2' }),
    ]);
    repairFindMany.mockResolvedValue([
      repair({
        id: 'repair-catalog',
        vacuumPadId: 'pad-1',
        faultCatalogId: 'fault-1',
        reportedAt: '2026-06-01T09:00:00.000Z',
        faultCatalog: faultCatalog({ id: 'fault-1', code: 'FC-001' }),
      }),
      repair({
        id: 'repair-other',
        vacuumPadId: 'pad-2',
        faultCatalogId: null,
        faultOtherText: 'Loose edge',
        reportedAt: '2026-06-01T12:00:00.000Z',
        faultCatalog: null,
      }),
    ]);
    chargeSessionFindMany.mockResolvedValue([
      chargeSession({
        id: 'charge-1',
        vacuumPadId: 'pad-1',
        machineId: 'machine-1',
        chargedAt: '2026-06-01T08:00:00.000Z',
        dechargedAt: null,
      }),
      chargeSession({
        id: 'charge-2',
        vacuumPadId: 'pad-2',
        machineId: 'machine-2',
        chargedAt: '2026-06-01T11:00:00.000Z',
        dechargedAt: null,
      }),
    ]);

    const result = await service.getMachinesCausingMostFaults({
      machine: 'MACH-001,MACH-002',
      fault: ['FC-001', 'OTHER'],
    });

    expect(machineFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          deletedAt: null,
          OR: [
            { code: { contains: 'MACH-001' } },
            { name: { contains: 'MACH-001' } },
            { code: { contains: 'MACH-002' } },
            { name: { contains: 'MACH-002' } },
          ],
        },
      }),
    );
    expect(result.items.map((item) => item.machineCode)).toEqual([
      'MACH-001',
      'MACH-002',
    ]);
  });

  it('filters machine fault report by catalog and OTHER faults', async () => {
    machineFindMany.mockResolvedValue([
      machine({ id: 'machine-1', code: 'MACH-001' }),
    ]);
    repairFindMany.mockResolvedValue([
      repair({
        id: 'repair-catalog',
        vacuumPadId: 'pad-1',
        faultCatalogId: 'fault-1',
        reportedAt: '2026-06-01T08:00:00.000Z',
        completedAt: '2026-06-01T09:00:00.000Z',
        faultCatalog: faultCatalog({ id: 'fault-1', code: 'FC-001' }),
      }),
      repair({
        id: 'repair-other',
        vacuumPadId: 'pad-2',
        faultCatalogId: null,
        faultOtherText: 'Loose edge',
        reportedAt: '2026-06-01T10:00:00.000Z',
        completedAt: '2026-06-01T11:00:00.000Z',
        faultCatalog: null,
      }),
    ]);
    chargeSessionFindMany.mockResolvedValue([
      chargeSession({
        id: 'charge-1',
        vacuumPadId: 'pad-1',
        machineId: 'machine-1',
        chargedAt: '2026-06-01T07:00:00.000Z',
        dechargedAt: null,
      }),
      chargeSession({
        id: 'charge-2',
        vacuumPadId: 'pad-2',
        machineId: 'machine-1',
        chargedAt: '2026-06-01T09:00:00.000Z',
        dechargedAt: null,
      }),
    ]);

    const catalogResult = await service.getMachinesCausingMostFaults({
      fault: 'FC-001',
    });
    const otherResult = await service.getMachinesCausingMostFaults({
      fault: 'OTHER',
    });

    expect(catalogResult.items[0]).toMatchObject({
      totalFaults: 1,
      distinctFaultTypes: 1,
      mostCommonFault: 'FC-001 - Surface damage',
    });
    expect(otherResult.items[0]).toMatchObject({
      totalFaults: 1,
      distinctFaultTypes: 1,
      mostCommonFault: 'OTHER - Άλλο',
    });
  });

  it('reports unattributed repairs when no prior machine charge exists', async () => {
    machineFindMany.mockResolvedValue([
      machine({ id: 'machine-1', code: 'MACH-001' }),
    ]);
    repairFindMany.mockResolvedValue([
      repair({
        id: 'repair-unattributed',
        vacuumPadId: 'pad-1',
        reportedAt: '2026-06-01T08:00:00.000Z',
        completedAt: '2026-06-01T09:00:00.000Z',
      }),
    ]);
    chargeSessionFindMany.mockResolvedValue([]);

    const result = await service.getMachinesCausingMostFaults();

    expect(result.items[0]).toMatchObject({
      machineCode: 'MACH-001',
      totalFaults: 0,
    });
    expect(result.chart.totals).toMatchObject({
      totalFaults: 0,
      unattributedFaults: 1,
    });
  });

  it('groups most frequent faults with custom OTHER, downtime, top entities and pareto rows', async () => {
    repairFindMany.mockResolvedValue([
      repair({
        id: 'repair-1',
        vacuumPadId: 'pad-1',
        faultCatalogId: 'fault-1',
        reportedAt: '2026-06-01T08:00:00.000Z',
        completedAt: '2026-06-01T10:00:00.000Z',
        faultCatalog: faultCatalog({ id: 'fault-1', code: 'FC-001' }),
      }),
      repair({
        id: 'repair-2',
        vacuumPadId: 'pad-1',
        faultCatalogId: 'fault-1',
        reportedAt: '2026-06-01T12:00:00.000Z',
        completedAt: '2026-06-01T15:00:00.000Z',
        faultCatalog: faultCatalog({ id: 'fault-1', code: 'FC-001' }),
      }),
      repair({
        id: 'repair-other',
        vacuumPadId: 'pad-2',
        faultCatalogId: null,
        faultOtherText: 'Loose edge',
        reportedAt: '2026-06-01T16:00:00.000Z',
        completedAt: '2026-06-01T17:00:00.000Z',
        faultCatalog: null,
      }),
      repair({
        id: 'repair-open',
        vacuumPadId: 'pad-3',
        faultCatalogId: 'fault-2',
        reportedAt: '2026-06-02T08:00:00.000Z',
        completedAt: null,
        status: RepairStatus.UNDER_REPAIR,
        faultCatalog: faultCatalog({
          id: 'fault-2',
          code: 'FC-002',
          label: 'Seal leak',
        }),
      }),
    ]);
    vacuumPadFindMany.mockResolvedValue([
      vacuumPad({ id: 'pad-1', code: 'VP-001', serialNumber: 'SN-001' }),
      vacuumPad({ id: 'pad-2', code: 'VP-002', serialNumber: 'SN-002' }),
      vacuumPad({ id: 'pad-3', code: 'VP-003', serialNumber: 'SN-003' }),
    ]);
    chargeSessionFindMany.mockResolvedValue([
      chargeSession({
        id: 'charge-1',
        vacuumPadId: 'pad-1',
        machineId: 'machine-1',
        chargedAt: '2026-06-01T07:00:00.000Z',
        dechargedAt: null,
      }),
      chargeSession({
        id: 'charge-3',
        vacuumPadId: 'pad-3',
        machineId: 'machine-2',
        chargedAt: '2026-06-02T07:00:00.000Z',
        dechargedAt: null,
      }),
    ]);
    machineFindMany.mockResolvedValue([
      machine({ id: 'machine-1', code: 'MACH-001', name: 'Machine 1' }),
      machine({ id: 'machine-2', code: 'MACH-002', name: 'Machine 2' }),
    ]);

    const result = await service.getMostFrequentFaults();

    expect(repairFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {},
      }),
    );
    expect(result.items.map((item) => item.faultCode)).toEqual([
      'FC-001',
      'FC-002',
      'OTHER',
    ]);
    expect(result.items[0]).toMatchObject({
      rank: 1,
      faultCode: 'FC-001',
      faultLabel: 'Surface damage',
      totalOccurrences: 2,
      distinctVacuumPads: 1,
      distinctMachines: 1,
      repairs: 2,
      replacements: 0,
      downtimeHours: 5,
      averageRestorationHours: 2.5,
      topVacuumPad: 'SN-001',
      topMachine: 'MACH-001 - Machine 1',
      lastOccurredAt: '2026-06-01T12:00:00.000Z',
    });
    expect(result.items[2]).toMatchObject({
      faultCode: 'OTHER',
      faultLabel: 'Άλλο',
      totalOccurrences: 1,
      distinctMachines: 0,
      unattributedCount: 1,
    });
    expect(result.chart.monthlyTrend).toEqual([{ month: '2026-06', count: 4 }]);
    expect(result.chart.totals).toMatchObject({
      totalOccurrences: 4,
      totalDowntimeHours: 10,
      totalRepairs: 3,
      totalReplacements: 0,
      unattributedFaults: 1,
    });
    expect(result.chart.pareto).toEqual([
      expect.objectContaining({
        rank: 1,
        faultCode: 'FC-001',
        occurrences: 2,
        percentage: 50,
        cumulativePercentage: 50,
        inside80: true,
      }),
      expect.objectContaining({
        rank: 2,
        faultCode: 'FC-002',
        occurrences: 1,
        percentage: 25,
        cumulativePercentage: 75,
        inside80: true,
      }),
      expect.objectContaining({
        rank: 3,
        faultCode: 'OTHER',
        occurrences: 1,
        percentage: 25,
        cumulativePercentage: 100,
        inside80: true,
      }),
    ]);
  });

  it('filters most frequent faults by multiple vacuums and faults', async () => {
    vacuumPadFindMany.mockResolvedValue([
      vacuumPad({ id: 'pad-1', code: 'VP-001', serialNumber: 'SN-001' }),
      vacuumPad({ id: 'pad-2', code: 'VP-002', serialNumber: 'SN-002' }),
    ]);
    repairFindMany.mockResolvedValue([
      repair({
        id: 'repair-catalog',
        vacuumPadId: 'pad-1',
        faultCatalogId: 'fault-1',
        reportedAt: '2026-06-01T08:00:00.000Z',
        completedAt: '2026-06-01T09:00:00.000Z',
        faultCatalog: faultCatalog({ id: 'fault-1', code: 'FC-001' }),
      }),
      repair({
        id: 'repair-other',
        vacuumPadId: 'pad-2',
        faultCatalogId: null,
        faultOtherText: 'Loose edge',
        reportedAt: '2026-06-01T10:00:00.000Z',
        completedAt: '2026-06-01T11:00:00.000Z',
        faultCatalog: null,
      }),
    ]);
    chargeSessionFindMany.mockResolvedValue([]);

    const result = await service.getMostFrequentFaults({
      dateFrom: '2026-06-01T00:00:00.000Z',
      dateTo: '2026-06-02T00:00:00.000Z',
      vacuum: 'SN-001,VP-002',
      fault: ['FC-001', 'OTHER'],
    });

    expect(vacuumPadFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          deletedAt: null,
          OR: [
            { code: { contains: 'SN-001' } },
            { serialNumber: { contains: 'SN-001' } },
            { code: { contains: 'VP-002' } },
            { serialNumber: { contains: 'VP-002' } },
          ],
        },
      }),
    );
    expect(repairFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          reportedAt: {
            gte: new Date('2026-06-01T00:00:00.000Z'),
            lte: new Date('2026-06-02T00:00:00.000Z'),
          },
          vacuumPadId: {
            in: ['pad-1', 'pad-2'],
          },
        },
      }),
    );
    expect(result.items.map((item) => item.faultCode)).toEqual([
      'FC-001',
      'OTHER',
    ]);
  });

  it('filters most frequent faults by inferred machine attribution', async () => {
    repairFindMany.mockResolvedValue([
      repair({
        id: 'repair-1',
        vacuumPadId: 'pad-1',
        faultCatalogId: 'fault-1',
        reportedAt: '2026-06-01T09:00:00.000Z',
        completedAt: '2026-06-01T10:00:00.000Z',
        faultCatalog: faultCatalog({ id: 'fault-1', code: 'FC-001' }),
      }),
      repair({
        id: 'repair-2',
        vacuumPadId: 'pad-2',
        faultCatalogId: 'fault-2',
        reportedAt: '2026-06-01T12:00:00.000Z',
        completedAt: '2026-06-01T13:00:00.000Z',
        faultCatalog: faultCatalog({ id: 'fault-2', code: 'FC-002' }),
      }),
    ]);
    vacuumPadFindMany.mockResolvedValue([
      vacuumPad({ id: 'pad-1', code: 'VP-001', serialNumber: 'SN-001' }),
      vacuumPad({ id: 'pad-2', code: 'VP-002', serialNumber: 'SN-002' }),
    ]);
    machineFindMany.mockResolvedValue([
      machine({ id: 'machine-2', code: 'MACH-002', name: 'Machine 2' }),
    ]);
    chargeSessionFindMany.mockResolvedValue([
      chargeSession({
        id: 'charge-1',
        vacuumPadId: 'pad-1',
        machineId: 'machine-1',
        chargedAt: '2026-06-01T08:00:00.000Z',
        dechargedAt: null,
      }),
      chargeSession({
        id: 'charge-2',
        vacuumPadId: 'pad-2',
        machineId: 'machine-2',
        chargedAt: '2026-06-01T11:00:00.000Z',
        dechargedAt: null,
      }),
    ]);

    const result = await service.getMostFrequentFaults({
      machine: 'MACH-002',
    });

    expect(machineFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          deletedAt: null,
          OR: [
            { code: { contains: 'MACH-002' } },
            { name: { contains: 'MACH-002' } },
          ],
        },
      }),
    );
    expect(result.items).toEqual([
      expect.objectContaining({
        faultCode: 'FC-002',
        totalOccurrences: 1,
        topMachine: 'MACH-002 - Machine 2',
      }),
    ]);
  });

  it('returns current vacuum locations with summary counts and priority sorting', async () => {
    vacuumPadFindMany.mockResolvedValue([
      vacuumPad({
        id: 'pad-rack',
        code: 'VP-005',
        serialNumber: 'SN-005',
        locationStatus: LocationStatus.IN_RACK,
        currentRackLocation: rackLocation({ code: 'RACK-A-01-01' }),
      }),
      vacuumPad({
        id: 'pad-machine',
        code: 'VP-004',
        serialNumber: 'SN-004',
        locationStatus: LocationStatus.ON_MACHINE,
        currentMachine: machine({ code: 'MACH-001', name: 'Machine 1' }),
      }),
      vacuumPad({
        id: 'pad-missing',
        code: 'VP-001',
        serialNumber: null,
        locationStatus: LocationStatus.UNKNOWN,
      }),
      vacuumPad({
        id: 'pad-unknown',
        code: 'VP-002',
        serialNumber: 'SN-002',
        locationStatus: LocationStatus.UNKNOWN,
      }),
      vacuumPad({
        id: 'pad-repair',
        code: 'VP-003',
        serialNumber: 'SN-003',
        locationStatus: LocationStatus.IN_REPAIR,
        operationalStatus: OperationalStatus.UNDER_REPAIR,
        currentRackLocation: rackLocation({ code: 'RACK-REP-01' }),
        repairs: [
          {
            id: 'repair-open',
            code: 'REP-001',
            status: RepairStatus.UNDER_REPAIR,
            reportedAt: new Date('2026-06-02T09:00:00.000Z'),
          },
        ],
      }),
    ]);

    const result = await service.getVacuumPadLocation();

    expect(vacuumPadFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { deletedAt: null },
      }),
    );
    expect(result.items.map((item) => item.locationCategory)).toEqual([
      'MISSING_SERIAL',
      'UNKNOWN',
      'IN_REPAIR',
      'ON_MACHINE',
      'IN_RACK',
    ]);
    expect(result.summary).toMatchObject({
      total: 5,
      missingSerial: 1,
      unknownLocation: 1,
      inRepair: 1,
      onMachine: 1,
      inRack: 1,
    });
    expect(result.items[2]).toMatchObject({
      code: 'VP-003',
      currentPlace: 'RACK-REP-01',
      openRepairId: 'repair-open',
    });
    expect(result.items[3]).toMatchObject({
      code: 'VP-004',
      currentPlace: 'MACH-001 - Machine 1',
      machineCode: 'MACH-001',
    });
  });

  it('filters current vacuum locations by vacuum values', async () => {
    vacuumPadFindMany.mockResolvedValue([
      vacuumPad({ id: 'pad-1', code: 'VP-001', serialNumber: 'SN-001' }),
      vacuumPad({ id: 'pad-2', code: 'VP-002', serialNumber: 'SN-002' }),
    ]);

    await service.getVacuumPadLocation({ vacuum: 'SN-001,VP-002' });

    expect(vacuumPadFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          deletedAt: null,
          OR: [
            { code: { contains: 'SN-001' } },
            { serialNumber: { contains: 'SN-001' } },
            { code: { contains: 'VP-002' } },
            { serialNumber: { contains: 'VP-002' } },
          ],
        },
      }),
    );
  });

  it('filters current vacuum locations by status, rack, and machine', async () => {
    vacuumPadFindMany.mockResolvedValue([
      vacuumPad({
        id: 'pad-machine',
        code: 'VP-001',
        serialNumber: 'SN-001',
        locationStatus: LocationStatus.ON_MACHINE,
        currentMachine: machine({ code: 'MACH-001', name: 'Machine 1' }),
      }),
      vacuumPad({
        id: 'pad-rack',
        code: 'VP-002',
        serialNumber: 'SN-002',
        locationStatus: LocationStatus.IN_RACK,
        currentRackLocation: rackLocation({ code: 'RACK-A-01-01' }),
      }),
    ]);

    const machineResult = await service.getVacuumPadLocation({
      status: 'ON_MACHINE',
      machine: 'MACH-001',
    });
    const rackResult = await service.getVacuumPadLocation({
      status: ['IN_RACK'],
      rack: 'RACK-A-01-01',
    });

    expect(machineResult.items.map((item) => item.code)).toEqual(['VP-001']);
    expect(rackResult.items.map((item) => item.code)).toEqual(['VP-002']);
  });

  it('filters current vacuum locations by missing serial and unknown location flags', async () => {
    vacuumPadFindMany.mockResolvedValue([
      vacuumPad({
        id: 'pad-missing',
        code: 'VP-001',
        serialNumber: null,
        locationStatus: LocationStatus.UNKNOWN,
      }),
      vacuumPad({
        id: 'pad-unknown',
        code: 'VP-002',
        serialNumber: 'SN-002',
        locationStatus: LocationStatus.UNKNOWN,
      }),
    ]);

    const missingResult = await service.getVacuumPadLocation({
      missingSerial: 'true',
    });
    const unknownResult = await service.getVacuumPadLocation({
      unknownLocation: 'true',
    });

    expect(missingResult.items.map((item) => item.code)).toEqual(['VP-001']);
    expect(unknownResult.items.map((item) => item.code)).toEqual(['VP-002']);
  });

  it('rejects invalid date ranges', async () => {
    await expect(
      service.getMostUsedVacuumPads({
        dateFrom: '2026-06-02T00:00:00.000Z',
        dateTo: '2026-06-01T00:00:00.000Z',
      }),
    ).rejects.toThrow('dateFrom must be before dateTo');
  });
});

function vacuumPad(overrides: Record<string, unknown> = {}) {
  return {
    id: 'pad-1',
    code: 'VP-001',
    serialNumber: 'SN-001',
    locationStatus: LocationStatus.IN_RACK,
    operationalStatus: OperationalStatus.FUNCTIONAL,
    updatedAt: new Date('2026-06-02T11:00:00.000Z'),
    currentMachine: null,
    currentRackLocation: null,
    repairs: [],
    movements: [
      {
        id: 'movement-1',
        createdAt: new Date('2026-06-02T10:30:00.000Z'),
      },
    ],
    ...overrides,
  };
}

function machine(overrides: Record<string, unknown> = {}) {
  return {
    id: 'machine-1',
    code: 'MACH-001',
    name: 'Machine 1',
    status: MachineStatus.ACTIVE,
    ...overrides,
  };
}

function rackLocation(overrides: Record<string, unknown> = {}) {
  return {
    id: 'rack-1',
    code: 'RACK-A-01-01',
    label: 'Rack A-01 Slot 01',
    type: 'AVL',
    zone: 'A',
    rack: '01',
    level: '01',
    slot: '01',
    ...overrides,
  };
}

function chargeSession(overrides: {
  id: string;
  vacuumPadId: string;
  machineId?: string;
  chargedAt: string;
  dechargedAt: string | null;
}) {
  return {
    id: overrides.id,
    vacuumPadId: overrides.vacuumPadId,
    machineId: overrides.machineId ?? 'machine-1',
    chargedAt: new Date(overrides.chargedAt),
    dechargedAt: overrides.dechargedAt ? new Date(overrides.dechargedAt) : null,
  };
}

function repair(overrides: {
  id: string;
  vacuumPadId: string;
  faultCatalogId?: string | null;
  faultOtherText?: string | null;
  status?: RepairStatus;
  reportedAt: string;
  completedAt: string | null;
  faultCatalog?: ReturnType<typeof faultCatalog> | null;
}) {
  return {
    id: overrides.id,
    vacuumPadId: overrides.vacuumPadId,
    faultCatalogId:
      'faultCatalogId' in overrides ? overrides.faultCatalogId : 'fault-1',
    faultOtherText:
      'faultOtherText' in overrides ? overrides.faultOtherText : null,
    status: overrides.status ?? RepairStatus.COMPLETED,
    reportedAt: new Date(overrides.reportedAt),
    completedAt: overrides.completedAt ? new Date(overrides.completedAt) : null,
    faultCatalog:
      'faultCatalog' in overrides ? overrides.faultCatalog : faultCatalog(),
  };
}

function faultCatalog(overrides: Record<string, unknown> = {}) {
  return {
    id: 'fault-1',
    code: 'FC-001',
    label: 'Surface damage',
    ...overrides,
  };
}
