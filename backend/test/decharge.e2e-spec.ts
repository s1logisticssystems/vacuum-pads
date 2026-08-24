import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';

describe('DechargeController (e2e)', () => {
  let app: INestApplication;
  let vacuumPadFindMany: jest.Mock;
  let vacuumPadFindFirst: jest.Mock;
  let vacuumPadUpdate: jest.Mock;
  let rackLocationFindMany: jest.Mock;
  let rackLocationFindUnique: jest.Mock;
  let chargeSessionFindFirst: jest.Mock;
  let chargeSessionUpdate: jest.Mock;
  let padMovementCreate: jest.Mock;
  let auditLogCreate: jest.Mock;

  beforeEach(async () => {
    vacuumPadFindMany = jest.fn();
    vacuumPadFindFirst = jest.fn();
    vacuumPadUpdate = jest.fn();
    rackLocationFindMany = jest.fn();
    rackLocationFindUnique = jest.fn();
    chargeSessionFindFirst = jest.fn();
    chargeSessionUpdate = jest.fn();
    padMovementCreate = jest.fn();
    auditLogCreate = jest.fn();

    const txClient = {
      vacuumPad: {
        findMany: vacuumPadFindMany,
        findFirst: vacuumPadFindFirst,
        update: vacuumPadUpdate,
      },
      rackLocation: {
        findMany: rackLocationFindMany,
        findUnique: rackLocationFindUnique,
      },
      chargeSession: {
        findFirst: chargeSessionFindFirst,
        update: chargeSessionUpdate,
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
        rackLocation: {
          findMany: rackLocationFindMany,
          findUnique: rackLocationFindUnique,
        },
        machine: {
          findMany: jest.fn(),
        },
        chargeSession: {
          findFirst: chargeSessionFindFirst,
          update: chargeSessionUpdate,
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

  it('/decharge/preview (POST) validates the request body', async () => {
    const server = app.getHttpServer() as Parameters<typeof request>[0];

    await request(server)
      .post('/decharge/preview')
      .send({
        deviceId: 'device-01',
      })
      .expect(400);
  });

  it('/decharge/preview (POST) returns a safe vacuum not found response', async () => {
    vacuumPadFindMany.mockResolvedValue([]);

    const server = app.getHttpServer() as Parameters<typeof request>[0];
    const response = await request(server).post('/decharge/preview').send({
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
      rack: null,
      chargeSession: null,
      requiredNextAction: 'NONE',
    });
  });

  it('/decharge (POST) validates the request body', async () => {
    const server = app.getHttpServer() as Parameters<typeof request>[0];

    await request(server)
      .post('/decharge')
      .send({
        vacuumQr: 'VAC:VP-001',
        deviceId: 'device-01',
      })
      .expect(400);
  });

  it('/decharge (POST) returns a structured vacuum not found response', async () => {
    vacuumPadFindMany.mockResolvedValue([]);

    const server = app.getHttpServer() as Parameters<typeof request>[0];
    const response = await request(server).post('/decharge').send({
      vacuumQr: 'VAC:VP-404',
      rackQr: 'RACK-A-01-07',
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
