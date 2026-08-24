import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';

describe('ChargeController (e2e)', () => {
  let app: INestApplication;
  let vacuumPadFindMany: jest.Mock;
  let vacuumPadFindFirst: jest.Mock;
  let vacuumPadUpdate: jest.Mock;
  let machineFindMany: jest.Mock;
  let machineFindFirst: jest.Mock;
  let machineFindUnique: jest.Mock;
  let chargeSessionFindFirst: jest.Mock;
  let chargeSessionCreate: jest.Mock;
  let padMovementCreate: jest.Mock;
  let auditLogCreate: jest.Mock;

  beforeEach(async () => {
    vacuumPadFindMany = jest.fn();
    vacuumPadFindFirst = jest.fn();
    vacuumPadUpdate = jest.fn();
    machineFindMany = jest.fn();
    machineFindFirst = jest.fn();
    machineFindUnique = jest.fn();
    chargeSessionFindFirst = jest.fn();
    chargeSessionCreate = jest.fn();
    padMovementCreate = jest.fn();
    auditLogCreate = jest.fn();

    const txClient = {
      vacuumPad: {
        findMany: vacuumPadFindMany,
        findFirst: vacuumPadFindFirst,
        update: vacuumPadUpdate,
      },
      machine: {
        findMany: machineFindMany,
        findFirst: machineFindFirst,
        findUnique: machineFindUnique,
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

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue({
        vacuumPad: {
          findMany: vacuumPadFindMany,
          findFirst: vacuumPadFindFirst,
          update: vacuumPadUpdate,
        },
        machine: {
          findMany: machineFindMany,
          findFirst: machineFindFirst,
          findUnique: machineFindUnique,
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
        $transaction: jest.fn((callback: (tx: typeof txClient) => unknown) =>
          callback(txClient),
        ),
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

  it('/charge/preview (POST) validates the request body', async () => {
    const server = app.getHttpServer() as Parameters<typeof request>[0];

    await request(server)
      .post('/charge/preview')
      .send({
        deviceId: 'device-01',
      })
      .expect(400);
  });

  it('/charge/preview (POST) returns a safe not-found response', async () => {
    vacuumPadFindMany.mockResolvedValue([]);

    const server = app.getHttpServer() as Parameters<typeof request>[0];
    const response = await request(server).post('/charge/preview').send({
      vacuumQr: 'VAC:VP-404',
      deviceId: 'device-01',
      operatorName: 'Operator One',
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      ok: false,
      decision: 'VACUUM_NOT_FOUND',
      message: 'No matching vacuum found',
      vacuum: null,
      machine: null,
      requiredNextAction: 'NONE',
    });
  });

  it('/charge (POST) validates the request body', async () => {
    const server = app.getHttpServer() as Parameters<typeof request>[0];

    await request(server)
      .post('/charge')
      .send({
        machineQr: 'QR-MACH-001',
        deviceId: 'device-01',
      })
      .expect(400);
  });

  it('/charge (POST) rejects requests without exactly one machine selector', async () => {
    const server = app.getHttpServer() as Parameters<typeof request>[0];
    const response = await request(server).post('/charge').send({
      vacuumQr: 'VAC:VP-001',
      deviceId: 'device-01',
    });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      ok: false,
      decision: 'INVALID_REQUEST',
      message: 'Provide exactly one of machineId or machineQr',
    });
  });

  it('/charge (POST) returns a structured vacuum not found response', async () => {
    vacuumPadFindMany.mockResolvedValue([]);

    const server = app.getHttpServer() as Parameters<typeof request>[0];
    const response = await request(server).post('/charge').send({
      vacuumQr: 'VAC:VP-404',
      machineQr: 'QR-MACH-001',
      deviceId: 'device-01',
      operatorName: 'Operator One',
    });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      ok: false,
      decision: 'VACUUM_NOT_FOUND',
      message: 'No matching vacuum found',
    });
  });

  afterEach(async () => {
    await app.close();
  });
});
