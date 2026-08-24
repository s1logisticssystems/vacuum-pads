import { INestApplication, ValidationPipe } from '@nestjs/common';
import {
  LocationStatus,
  MachineStatus,
  OperationalStatus,
} from '@prisma/client';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';
import {
  FaultyVacuumPadsReportResponse,
  MachineFaultReportResponse,
  MostFrequentFaultsReportResponse,
  MostUsedVacuumPadsReportResponse,
  VacuumPadLocationReportResponse,
} from './../src/reports/reports.types';

describe('ReportsController (e2e)', () => {
  let app: INestApplication;
  let vacuumPadFindMany: jest.Mock;
  let machineFindMany: jest.Mock;
  let chargeSessionFindMany: jest.Mock;
  let repairFindMany: jest.Mock;

  beforeEach(async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-06-02T12:00:00.000Z'));
    vacuumPadFindMany = jest.fn();
    machineFindMany = jest.fn();
    chargeSessionFindMany = jest.fn();
    repairFindMany = jest.fn();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue({
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
      })
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: {
          enableImplicitConversion: true,
        },
      }),
    );
    await app.init();
  });

  afterEach(async () => {
    jest.useRealTimers();
    await app.close();
  });

  it('/reports/most-used-vacuum-pads (GET) returns ranked usage KPIs', async () => {
    vacuumPadFindMany.mockResolvedValue([
      vacuumPad({ id: 'pad-1', code: 'VP-001', serialNumber: 'SN-001' }),
    ]);
    chargeSessionFindMany.mockResolvedValue([
      chargeSession({
        id: 'charge-1',
        vacuumPadId: 'pad-1',
        chargedAt: '2026-06-02T10:00:00.000Z',
        dechargedAt: null,
      }),
    ]);

    const server = app.getHttpServer() as Parameters<typeof request>[0];
    const response = await request(server)
      .get('/reports/most-used-vacuum-pads')
      .query({ vacuum: 'SN-001' });

    expect(response.status).toBe(200);
    const body = response.body as MostUsedVacuumPadsReportResponse;

    expect(body.total).toBe(1);
    expect(body.items).toHaveLength(1);
    expect(body.items[0]).toMatchObject({
      rank: 1,
      code: 'VP-001',
      serialNumber: 'SN-001',
      chargeCount: 1,
      usageHours: 2,
      openSessionCount: 1,
    });
    expect(typeof body.policy.usageHours).toBe('string');
    expect(typeof body.policy.downtimeHours).toBe('string');
  });

  it('/reports/vacuum-pads-with-most-faults (GET) returns ranked fault KPIs', async () => {
    vacuumPadFindMany.mockResolvedValue([
      vacuumPad({ id: 'pad-1', code: 'VP-001', serialNumber: 'SN-001' }),
    ]);
    repairFindMany.mockResolvedValue([
      repair({
        id: 'repair-1',
        vacuumPadId: 'pad-1',
        reportedAt: '2026-06-02T10:00:00.000Z',
        completedAt: null,
      }),
    ]);

    const server = app.getHttpServer() as Parameters<typeof request>[0];
    const response = await request(server)
      .get('/reports/vacuum-pads-with-most-faults')
      .query({ vacuum: 'SN-001', fault: 'FC-001' });

    expect(response.status).toBe(200);
    const body = response.body as FaultyVacuumPadsReportResponse;

    expect(body.total).toBe(1);
    expect(body.items).toHaveLength(1);
    expect(body.items[0]).toMatchObject({
      rank: 1,
      code: 'VP-001',
      serialNumber: 'SN-001',
      totalFaults: 1,
      repairHours: 2,
      faultDowntimeHours: 2,
      openRepairCount: 1,
    });
    expect(body.chart.monthlyTrend).toEqual([{ month: '2026-06', count: 1 }]);
    expect(typeof body.policy.repairHours).toBe('string');
  });

  it('/reports/machines-causing-most-faults (GET) returns inferred machine fault KPIs', async () => {
    machineFindMany.mockResolvedValue([
      machine({ id: 'machine-1', code: 'MACH-001', name: 'Machine 1' }),
    ]);
    repairFindMany.mockResolvedValue([
      repair({
        id: 'repair-1',
        vacuumPadId: 'pad-1',
        reportedAt: '2026-06-02T10:00:00.000Z',
        completedAt: null,
      }),
    ]);
    chargeSessionFindMany.mockResolvedValue([
      chargeSession({
        id: 'charge-1',
        vacuumPadId: 'pad-1',
        machineId: 'machine-1',
        chargedAt: '2026-06-02T09:00:00.000Z',
        dechargedAt: null,
      }),
    ]);

    const server = app.getHttpServer() as Parameters<typeof request>[0];
    const response = await request(server)
      .get('/reports/machines-causing-most-faults')
      .query({ machine: 'MACH-001', fault: 'FC-001' });

    expect(response.status).toBe(200);
    const body = response.body as MachineFaultReportResponse;

    expect(body.total).toBe(1);
    expect(body.items).toHaveLength(1);
    expect(body.items[0]).toMatchObject({
      rank: 1,
      machineCode: 'MACH-001',
      machineName: 'Machine 1',
      totalFaults: 1,
      affectedVacuumPads: 1,
      distinctFaultTypes: 1,
      repairDispatches: 1,
      downtimeHours: 2,
      averageFaultsPerVacuum: 1,
      status: MachineStatus.ACTIVE,
    });
    expect(body.chart.monthlyTrend).toEqual([{ month: '2026-06', count: 1 }]);
    expect(body.note).toContain('τελευταίας χρέωσης');
    expect(typeof body.policy.attribution).toBe('string');
  });

  it('/reports/most-frequent-faults (GET) returns fault frequency KPIs', async () => {
    repairFindMany.mockResolvedValue([
      repair({
        id: 'repair-1',
        vacuumPadId: 'pad-1',
        reportedAt: '2026-06-02T10:00:00.000Z',
        completedAt: null,
      }),
    ]);
    vacuumPadFindMany.mockResolvedValue([
      vacuumPad({ id: 'pad-1', code: 'VP-001', serialNumber: 'SN-001' }),
    ]);
    machineFindMany.mockResolvedValue([
      machine({ id: 'machine-1', code: 'MACH-001', name: 'Machine 1' }),
    ]);
    chargeSessionFindMany.mockResolvedValue([
      chargeSession({
        id: 'charge-1',
        vacuumPadId: 'pad-1',
        machineId: 'machine-1',
        chargedAt: '2026-06-02T09:00:00.000Z',
        dechargedAt: null,
      }),
    ]);

    const server = app.getHttpServer() as Parameters<typeof request>[0];
    const response = await request(server)
      .get('/reports/most-frequent-faults')
      .query({ fault: 'FC-001', vacuum: 'SN-001', machine: 'MACH-001' });

    expect(response.status).toBe(200);
    const body = response.body as MostFrequentFaultsReportResponse;

    expect(body.total).toBe(1);
    expect(body.items).toHaveLength(1);
    expect(body.items[0]).toMatchObject({
      rank: 1,
      faultCode: 'FC-001',
      faultLabel: 'Surface damage',
      totalOccurrences: 1,
      distinctVacuumPads: 1,
      distinctMachines: 1,
      downtimeHours: 2,
      averageRestorationHours: 2,
      topVacuumPad: 'SN-001',
      topMachine: 'MACH-001 - Machine 1',
    });
    expect(body.chart.monthlyTrend).toEqual([{ month: '2026-06', count: 1 }]);
    expect(body.chart.pareto).toHaveLength(1);
    expect(typeof body.policy.replacements).toBe('string');
  });

  it('/reports/vacuum-pad-location (GET) returns current location rows', async () => {
    vacuumPadFindMany.mockResolvedValue([
      vacuumPad({
        id: 'pad-1',
        code: 'VP-001',
        serialNumber: 'SN-001',
        locationStatus: LocationStatus.ON_MACHINE,
        currentMachine: machine({ code: 'MACH-001', name: 'Machine 1' }),
      }),
    ]);

    const server = app.getHttpServer() as Parameters<typeof request>[0];
    const response = await request(server)
      .get('/reports/vacuum-pad-location')
      .query({ vacuum: 'SN-001', machine: 'MACH-001', status: 'ON_MACHINE' });

    expect(response.status).toBe(200);
    const body = response.body as VacuumPadLocationReportResponse;

    expect(body.total).toBe(1);
    expect(body.items[0]).toMatchObject({
      code: 'VP-001',
      serialNumber: 'SN-001',
      locationCategory: 'ON_MACHINE',
      currentPlace: 'MACH-001 - Machine 1',
      machineCode: 'MACH-001',
    });
    expect(body.summary).toMatchObject({
      total: 1,
      onMachine: 1,
    });
    expect(body.chart.locationCategories).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ category: 'ON_MACHINE', count: 1 }),
      ]),
    );
    expect(typeof body.policy.unknownLocation).toBe('string');
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
  reportedAt: string;
  completedAt: string | null;
}) {
  return {
    id: overrides.id,
    vacuumPadId: overrides.vacuumPadId,
    faultCatalogId: 'fault-1',
    faultOtherText: null,
    status: 'UNDER_REPAIR',
    reportedAt: new Date(overrides.reportedAt),
    completedAt: overrides.completedAt ? new Date(overrides.completedAt) : null,
    faultCatalog: {
      id: 'fault-1',
      code: 'FC-001',
      label: 'Surface damage',
    },
  };
}
