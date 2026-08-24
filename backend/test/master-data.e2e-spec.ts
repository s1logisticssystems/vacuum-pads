import { INestApplication, ValidationPipe } from '@nestjs/common';
import {
  LocationStatus,
  MachineStatus,
  OperationalStatus,
  RackLocationType,
} from '@prisma/client';
import { Test, TestingModule } from '@nestjs/testing';
import * as path from 'node:path';
import request from 'supertest';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';

describe('MasterDataController (e2e)', () => {
  let app: INestApplication;
  let machineFindMany: jest.Mock;
  let rackLocationFindMany: jest.Mock;
  let faultCatalogFindMany: jest.Mock;
  let vacuumPadFindFirst: jest.Mock;
  let vacuumPadFindMany: jest.Mock;
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
  let vacuumPadCreate: jest.Mock;
  let vacuumPadUpdate: jest.Mock;
  let vacuumPadDelete: jest.Mock;
  let vacuumPadCount: jest.Mock;
  let padMovementCount: jest.Mock;
  let repairCount: jest.Mock;
  let chargeSessionCount: jest.Mock;

  beforeEach(async () => {
    machineFindMany = jest.fn();
    rackLocationFindMany = jest.fn();
    faultCatalogFindMany = jest.fn();
    vacuumPadFindFirst = jest.fn();
    vacuumPadFindMany = jest.fn();
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
    vacuumPadCreate = jest.fn();
    vacuumPadUpdate = jest.fn();
    vacuumPadDelete = jest.fn();
    vacuumPadCount = jest.fn();
    padMovementCount = jest.fn();
    repairCount = jest.fn();
    chargeSessionCount = jest.fn();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue({
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
        $transaction: jest.fn(),
        $queryRawUnsafe: jest.fn(),
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

  it('/master-data/machines (GET) returns a read-only machine list shape', async () => {
    machineFindMany.mockResolvedValue([]);

    const server = app.getHttpServer() as Parameters<typeof request>[0];
    const response = await request(server).get('/master-data/machines');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      items: [],
      total: 0,
    });
  });

  it('/master-data/machines (GET) includes occupied currentPad description', async () => {
    machineFindMany.mockResolvedValue([
      {
        id: 'machine-1',
        code: 'MACH-001',
        qrCode: 'QR-MACH-001',
        name: 'Machine 1',
        description: null,
        area: 'Production',
        project: 'Line A',
        status: MachineStatus.ACTIVE,
        updatedAt: new Date('2026-05-22T12:00:00.000Z'),
        currentPads: [
          {
            id: 'pad-1',
            code: 'VP-001',
            qrCode: 'VAC:19081291644',
            serialNumber: '19081291644',
            description: 'Occupied vacuum pad',
            locationStatus: LocationStatus.ON_MACHINE,
            operationalStatus: OperationalStatus.FUNCTIONAL,
            currentMachineId: 'machine-1',
          },
        ],
        chargeSessions: [{ id: 'charge-1' }],
      },
    ]);

    const server = app.getHttpServer() as Parameters<typeof request>[0];
    const response = await request(server).get('/master-data/machines');

    expect(response.status).toBe(200);
    const body = response.body as { items: Record<string, unknown>[] };
    expect(body.items[0]).toMatchObject({
      code: 'MACH-001',
      isAvailableForCharge: false,
      currentPad: {
        code: 'VP-001',
        qrCode: 'VAC:19081291644',
        serialNumber: '19081291644',
        description: 'Occupied vacuum pad',
      },
      openChargeSessionId: 'charge-1',
    });
  });

  it('/master-data/rack-locations (GET) returns a read-only rack list shape', async () => {
    rackLocationFindMany.mockResolvedValue([]);

    const server = app.getHttpServer() as Parameters<typeof request>[0];
    const response = await request(server).get('/master-data/rack-locations');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      items: [],
      total: 0,
    });
  });

  it('/master-data/fault-catalog (GET) returns a read-only fault catalog list', async () => {
    faultCatalogFindMany.mockResolvedValue([]);

    const server = app.getHttpServer() as Parameters<typeof request>[0];
    const response = await request(server).get('/master-data/fault-catalog');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      items: [],
      total: 0,
    });
  });

  it('/master-data/vacuum-pads (GET) returns a read-only vacuum pad list shape', async () => {
    vacuumPadFindMany.mockResolvedValue([]);

    const server = app.getHttpServer() as Parameters<typeof request>[0];
    const response = await request(server).get('/master-data/vacuum-pads');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      items: [],
      total: 0,
    });
  });

  it('/master-data/vacuum-pads/:id (GET) returns safe not-found detail behavior', async () => {
    vacuumPadFindFirst.mockResolvedValue(null);

    const server = app.getHttpServer() as Parameters<typeof request>[0];
    const response = await request(server).get(
      '/master-data/vacuum-pads/pad-404',
    );

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      ok: false,
      errorCode: 'NOT_FOUND',
      message: 'Not found',
    });
  });

  it('/master-data/vacuum-pads (POST) creates with derived qrCode', async () => {
    vacuumPadFindFirst.mockResolvedValue(null);
    vacuumPadCreate.mockResolvedValue(
      vacuumPadListRecord({
        code: 'VP-100',
        qrCode: '19081291644',
        serialNumber: '19081291644',
      }),
    );

    const server = app.getHttpServer() as Parameters<typeof request>[0];
    const response = await request(server)
      .post('/master-data/vacuum-pads')
      .type('form')
      .send({
        code: 'VP-100',
        serialNumber: '19081291644',
      });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      ok: true,
      item: {
        code: 'VP-100',
        qrCode: '19081291644',
        serialNumber: '19081291644',
      },
    });
    const createArgs = firstMockArg<{
      data: Record<string, unknown>;
    }>(vacuumPadCreate);

    expect(createArgs.data).toMatchObject({
      qrCode: '19081291644',
    });
  });

  it('/master-data/vacuum-pads (POST) accepts optional technical fields', async () => {
    vacuumPadFindFirst.mockResolvedValue(null);
    vacuumPadCreate.mockResolvedValue(
      vacuumPadListRecord({
        code: 'VP-101',
        qrCode: '19081291645',
        serialNumber: '19081291645',
        netWeightKg: 12.5,
        dimensionLengthMm: 120,
        dimensionWidthMm: 80,
        dimensionHeightMm: 40,
        liftingCapacityKg: 250,
        costEuro: 123.45,
        receivedAt: new Date('2026-06-01T00:00:00.000Z'),
      }),
    );

    const server = app.getHttpServer() as Parameters<typeof request>[0];
    const response = await request(server)
      .post('/master-data/vacuum-pads')
      .type('form')
      .send({
        code: 'VP-101',
        serialNumber: '19081291645',
        netWeightKg: '12.5',
        dimensionLengthMm: '120',
        dimensionWidthMm: '80',
        dimensionHeightMm: '40',
        liftingCapacityKg: '250',
        costEuro: '123.45',
        receivedAt: '2026-06-01',
      });

    expect(response.status).toBe(201);
    const body = response.body as { item: Record<string, unknown> };
    expect(body.item).toMatchObject({
      netWeightKg: 12.5,
      dimensionLengthMm: 120,
      dimensionWidthMm: 80,
      dimensionHeightMm: 40,
      liftingCapacityKg: 250,
      costEuro: 123.45,
      receivedAt: '2026-06-01T00:00:00.000Z',
    });
    expect(
      firstMockArg<{ data: Record<string, unknown> }>(vacuumPadCreate).data,
    ).toMatchObject({
      netWeightKg: 12.5,
      dimensionLengthMm: 120,
      costEuro: 123.45,
      receivedAt: new Date('2026-06-01T00:00:00.000Z'),
    });
  });

  it('/master-data/vacuum-pads (POST) rejects invalid technical fields', async () => {
    const server = app.getHttpServer() as Parameters<typeof request>[0];
    const response = await request(server)
      .post('/master-data/vacuum-pads')
      .type('form')
      .send({
        serialNumber: '19081291646',
        netWeightKg: '-1',
      });

    expect(response.status).toBe(400);
    expect(vacuumPadCreate).not.toHaveBeenCalled();
  });

  it('/master-data/machines (POST) creates with derived qrCode', async () => {
    machineFindFirst.mockResolvedValue(null);
    machineCreate.mockResolvedValue(
      machineRecord({
        code: 'MACH-010',
        qrCode: 'QR-MACH-010',
        name: 'Machine 10',
      }),
    );

    const server = app.getHttpServer() as Parameters<typeof request>[0];
    const response = await request(server)
      .post('/master-data/machines')
      .type('form')
      .send({
        code: 'MACH-010',
        name: 'Machine 10',
      });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      ok: true,
      item: {
        code: 'MACH-010',
        qrCode: 'QR-MACH-010',
      },
    });
  });

  it('/master-data/machines (POST) auto-generates code when omitted', async () => {
    machineFindMany.mockResolvedValue([{ code: 'MACH-001' }]);
    machineFindFirst.mockResolvedValue(null);
    machineCreate.mockResolvedValue(
      machineRecord({
        code: 'MACH-002',
        qrCode: 'QR-MACH-002',
        name: 'Machine 2',
      }),
    );

    const server = app.getHttpServer() as Parameters<typeof request>[0];
    const response = await request(server)
      .post('/master-data/machines')
      .type('form')
      .send({
        name: 'Machine 2',
      });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      ok: true,
      item: {
        code: 'MACH-002',
        qrCode: 'QR-MACH-002',
      },
    });
  });

  it('/master-data/rack-locations (POST) derives code from area row and position', async () => {
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

    const server = app.getHttpServer() as Parameters<typeof request>[0];
    const response = await request(server)
      .post('/master-data/rack-locations')
      .type('form')
      .send({
        type: 'AVL',
        zone: 'A',
        rack: '1',
        slot: '8',
      });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      ok: true,
      item: {
        code: 'RACK-A-01-08',
        qrCode: 'QR-RACK-A-01-08',
      },
    });
  });

  it('/master-data/rack-locations/:id (PATCH) accepts false booleans from form payload', async () => {
    rackLocationFindFirst
      .mockResolvedValueOnce({ id: 'rack-1' })
      .mockResolvedValueOnce(null);
    rackLocationUpdate.mockResolvedValue(
      rackRecord({
        id: 'rack-1',
        code: 'RACK-010',
        qrCode: 'QR-RACK-010',
        isActive: false,
      }),
    );

    const server = app.getHttpServer() as Parameters<typeof request>[0];
    const response = await request(server)
      .patch('/master-data/rack-locations/rack-1')
      .type('form')
      .send({
        code: 'RACK-010',
        isActive: 'false',
      });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      ok: true,
      item: {
        code: 'RACK-010',
        isActive: false,
      },
    });
    const updateArgs = firstMockArg<{
      data: Record<string, unknown>;
    }>(rackLocationUpdate);

    expect(updateArgs.data).toMatchObject({
      isActive: false,
    });
  });

  it('/master-data/fault-catalog (POST) creates inactive entries from form payload', async () => {
    faultCatalogFindFirst.mockResolvedValue(null);
    faultCatalogCreate.mockResolvedValue(
      faultCatalogRecord({
        code: 'FC-100',
        label: 'New fault',
        isActive: false,
        sortOrder: 7,
      }),
    );

    const server = app.getHttpServer() as Parameters<typeof request>[0];
    const response = await request(server)
      .post('/master-data/fault-catalog')
      .type('form')
      .send({
        code: 'FC-100',
        label: 'New fault',
        sortOrder: '7',
        isActive: 'false',
      });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      ok: true,
      item: {
        code: 'FC-100',
        isActive: false,
        sortOrder: 7,
      },
    });
    const createArgs = firstMockArg<{
      data: Record<string, unknown>;
    }>(faultCatalogCreate);

    expect(createArgs.data).toMatchObject({
      sortOrder: 7,
      isActive: false,
    });
  });

  it('/master-data/fault-catalog (POST) auto-generates code when omitted', async () => {
    faultCatalogFindMany.mockResolvedValue([{ code: 'FC-001' }]);
    faultCatalogFindFirst.mockResolvedValue(null);
    faultCatalogCreate.mockResolvedValue(
      faultCatalogRecord({
        code: 'FC-002',
        label: 'Generated fault',
      }),
    );

    const server = app.getHttpServer() as Parameters<typeof request>[0];
    const response = await request(server)
      .post('/master-data/fault-catalog')
      .type('form')
      .send({
        label: 'Generated fault',
      });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      ok: true,
      item: {
        code: 'FC-002',
      },
    });
  });

  it('/master-data/fault-catalog/:id (DELETE) deactivates referenced faults', async () => {
    faultCatalogFindFirst.mockResolvedValue({ id: 'fault-1' });
    repairCount.mockResolvedValue(2);

    const server = app.getHttpServer() as Parameters<typeof request>[0];
    const response = await request(server).delete(
      '/master-data/fault-catalog/fault-1',
    );

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      ok: true,
      deactivated: true,
    });
    expect(faultCatalogUpdate).toHaveBeenCalledWith({
      where: { id: 'fault-1' },
      data: { isActive: false },
    });
  });

  it('/master-data/import/machines/preview validates uploaded workbook without writes', async () => {
    machineFindMany.mockResolvedValue([]);
    rackLocationFindMany.mockResolvedValue([]);
    faultCatalogFindMany.mockResolvedValue([]);
    vacuumPadFindMany.mockResolvedValue([]);

    const server = app.getHttpServer() as Parameters<typeof request>[0];
    const response = await request(server)
      .post('/master-data/import/machines/preview')
      .attach('file', masterDataWorkbookPath());

    expect(response.status).toBe(201);
    const body = response.body as {
      entities: { Machines: { rowsRead: number } };
    };
    expect(body).toMatchObject({
      ok: true,
      dryRun: true,
    });
    expect(body.entities.Machines.rowsRead).toBeGreaterThan(0);
    expect(machineCreate).not.toHaveBeenCalled();
    expect(machineUpdate).not.toHaveBeenCalled();
  });

  it('/master-data/import/machines/commit writes uploaded workbook rows', async () => {
    machineFindMany.mockResolvedValue([]);
    rackLocationFindMany.mockResolvedValue([]);
    faultCatalogFindMany.mockResolvedValue([]);
    vacuumPadFindMany.mockResolvedValue([]);

    const server = app.getHttpServer() as Parameters<typeof request>[0];
    const response = await request(server)
      .post('/master-data/import/machines/commit')
      .attach('file', masterDataWorkbookPath());

    expect(response.status).toBe(201);
    const body = response.body as {
      entities: { Machines: { rowsRead: number } };
    };
    expect(body).toMatchObject({
      ok: true,
      dryRun: false,
    });
    expect(body.entities.Machines.rowsRead).toBeGreaterThan(0);
    expect(machineFindMany).toHaveBeenCalled();
  });

  afterEach(async () => {
    await app.close();
  });
});

function machineRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: 'machine-1',
    code: 'MACH-001',
    qrCode: 'QR-MACH-001',
    name: 'Machine 1',
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

function masterDataWorkbookPath() {
  return path.resolve(
    process.cwd(),
    '..',
    'docs',
    'source',
    'vacuum-traceability-master-data-template.xlsx',
  );
}

function firstMockArg<T>(mock: jest.Mock, callIndex = 0): T {
  const calls = mock.mock.calls as unknown[][];
  const call = calls[callIndex] ?? [];
  return call[0] as T;
}
