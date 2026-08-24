import {
  LocationStatus,
  OperationalStatus,
  RackLocationType,
  RepairPriority,
  RepairStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StatusService } from './status.service';

describe('StatusService', () => {
  let service: StatusService;
  let vacuumPadFindMany: jest.Mock;
  let vacuumPadCount: jest.Mock;

  beforeEach(() => {
    vacuumPadFindMany = jest.fn();
    vacuumPadCount = jest.fn();

    const prismaService = {
      vacuumPad: {
        findMany: vacuumPadFindMany,
        count: vacuumPadCount,
      },
    } as unknown as PrismaService;

    service = new StatusService(prismaService);
  });

  it('filters and maps active vacuums with machine and charge-session summaries', async () => {
    vacuumPadFindMany.mockResolvedValue([
      {
        id: 'pad-1',
        code: 'VP-001',
        serialNumber: 'SN-VP-001',
        description: 'Sample vacuum',
        locationStatus: LocationStatus.ON_MACHINE,
        operationalStatus: OperationalStatus.FUNCTIONAL,
        currentMachine: {
          id: 'machine-1',
          code: 'MACH-001',
          qrCode: 'QR-MACH-001',
          name: 'Vacuum Machine 1',
          area: 'Production',
          project: 'Line A',
        },
        chargeSessions: [
          {
            id: 'session-1',
            chargedAt: new Date('2026-05-22T10:00:00.000Z'),
          },
        ],
      },
    ]);

    const result = await service.listActiveVacuums();

    expect(vacuumPadFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          deletedAt: null,
          serialNumber: { not: null },
          OR: [
            { currentMachineId: { not: null } },
            { locationStatus: LocationStatus.ON_MACHINE },
          ],
        },
      }),
    );
    expect(result).toEqual({
      items: [
        {
          id: 'pad-1',
          code: 'VP-001',
          serialNumber: 'SN-VP-001',
          description: 'Sample vacuum',
          locationStatus: LocationStatus.ON_MACHINE,
          operationalStatus: OperationalStatus.FUNCTIONAL,
          displayStatus: 'ACTIVE',
          machine: {
            id: 'machine-1',
            code: 'MACH-001',
            qrCode: 'QR-MACH-001',
            name: 'Vacuum Machine 1',
            area: 'Production',
            project: 'Line A',
          },
          chargedAt: '2026-05-22T10:00:00.000Z',
          chargeSessionId: 'session-1',
        },
      ],
      total: 1,
    });
  });

  it('filters and maps inactive vacuums with rack summaries', async () => {
    vacuumPadFindMany.mockResolvedValue([
      {
        id: 'pad-4',
        code: 'VP-004',
        serialNumber: 'SN-VP-004',
        description: null,
        locationStatus: LocationStatus.IN_RACK,
        operationalStatus: OperationalStatus.INSPECTION_REQUIRED,
        updatedAt: new Date('2026-05-22T12:00:00.000Z'),
        currentRackLocation: {
          id: 'rack-4',
          code: 'RACK-A-01-04',
          qrCode: 'QR-RACK-A-01-04',
          label: 'Rack A-01 Slot 04',
          type: RackLocationType.AVL,
          zone: 'A',
          rack: 'A-01',
          level: '1',
          slot: '04',
        },
      },
    ]);

    const result = await service.listInactiveVacuums();

    expect(vacuumPadFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          deletedAt: null,
          serialNumber: { not: null },
          currentMachineId: null,
          locationStatus: LocationStatus.IN_RACK,
          operationalStatus: {
            notIn: [OperationalStatus.UNDER_REPAIR, OperationalStatus.RETIRED],
          },
        },
      }),
    );
    expect(result).toEqual({
      items: [
        {
          id: 'pad-4',
          code: 'VP-004',
          serialNumber: 'SN-VP-004',
          description: null,
          locationStatus: LocationStatus.IN_RACK,
          operationalStatus: OperationalStatus.INSPECTION_REQUIRED,
          displayStatus: 'NOTACTIVE',
          updatedAt: '2026-05-22T12:00:00.000Z',
          rack: {
            id: 'rack-4',
            code: 'RACK-A-01-04',
            qrCode: 'QR-RACK-A-01-04',
            label: 'Rack A-01 Slot 04',
            type: RackLocationType.AVL,
            zone: 'A',
            rack: 'A-01',
            level: '1',
            slot: '04',
          },
        },
      ],
      total: 1,
    });
  });

  it('filters and maps repair vacuums with open-repair summaries', async () => {
    vacuumPadFindMany.mockResolvedValue([
      {
        id: 'pad-5',
        code: 'VP-005',
        serialNumber: 'SN-VP-005',
        description: 'Sample vacuum',
        locationStatus: LocationStatus.IN_REPAIR,
        operationalStatus: OperationalStatus.UNDER_REPAIR,
        currentRackLocation: {
          id: 'rack-rep-1',
          code: 'RACK-REP-01',
          qrCode: 'QR-RACK-REP-01',
          label: 'Repair Rack 01',
          type: RackLocationType.REP,
          zone: 'REP',
          rack: 'REP-01',
          level: '1',
          slot: '01',
        },
        repairs: [
          {
            id: 'repair-1',
            code: 'REP-001',
            status: RepairStatus.REPORTED,
            priority: RepairPriority.HIGH,
            reportedAt: new Date('2026-05-22T11:00:00.000Z'),
            problemDescription: 'Surface damage',
            faultCatalog: {
              code: 'FC-001',
              label: 'Surface damage',
            },
            _count: {
              photos: 2,
            },
          },
        ],
      },
    ]);

    const result = await service.listRepairVacuums();

    expect(vacuumPadFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          deletedAt: null,
          serialNumber: { not: null },
          OR: [
            { locationStatus: LocationStatus.IN_REPAIR },
            { operationalStatus: OperationalStatus.UNDER_REPAIR },
          ],
        },
      }),
    );
    expect(result).toEqual({
      items: [
        {
          id: 'pad-5',
          code: 'VP-005',
          serialNumber: 'SN-VP-005',
          description: 'Sample vacuum',
          locationStatus: LocationStatus.IN_REPAIR,
          operationalStatus: OperationalStatus.UNDER_REPAIR,
          displayStatus: 'REPAIR',
          rack: {
            id: 'rack-rep-1',
            code: 'RACK-REP-01',
            qrCode: 'QR-RACK-REP-01',
            label: 'Repair Rack 01',
            type: RackLocationType.REP,
            zone: 'REP',
            rack: 'REP-01',
            level: '1',
            slot: '01',
          },
          openRepair: {
            id: 'repair-1',
            code: 'REP-001',
            status: RepairStatus.REPORTED,
            priority: RepairPriority.HIGH,
            reportedAt: '2026-05-22T11:00:00.000Z',
            problemDescription: 'Surface damage',
            faultCatalog: {
              code: 'FC-001',
              label: 'Surface damage',
            },
            photoCount: 2,
          },
        },
      ],
      total: 1,
    });
  });

  it('returns summary counts using soft-delete-aware filters', async () => {
    vacuumPadCount
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(4)
      .mockResolvedValueOnce(2);

    const result = await service.getSummary();

    expect(vacuumPadCount).toHaveBeenNthCalledWith(1, {
      where: {
        deletedAt: null,
        serialNumber: { not: null },
        OR: [
          { currentMachineId: { not: null } },
          { locationStatus: LocationStatus.ON_MACHINE },
        ],
      },
    });
    expect(vacuumPadCount).toHaveBeenNthCalledWith(2, {
      where: {
        deletedAt: null,
        serialNumber: { not: null },
        currentMachineId: null,
        locationStatus: LocationStatus.IN_RACK,
        operationalStatus: {
          notIn: [OperationalStatus.UNDER_REPAIR, OperationalStatus.RETIRED],
        },
      },
    });
    expect(vacuumPadCount).toHaveBeenNthCalledWith(3, {
      where: {
        deletedAt: null,
        serialNumber: { not: null },
        OR: [
          { locationStatus: LocationStatus.IN_REPAIR },
          { operationalStatus: OperationalStatus.UNDER_REPAIR },
        ],
      },
    });
    expect(result).toEqual({
      active: 1,
      inactive: 4,
      repair: 2,
    });
  });
});
