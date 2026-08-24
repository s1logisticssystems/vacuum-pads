import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';

describe('QrController (e2e)', () => {
  let app: INestApplication;
  let vacuumPadFindMany: jest.Mock;
  let rackLocationFindMany: jest.Mock;
  let machineFindMany: jest.Mock;

  beforeEach(async () => {
    vacuumPadFindMany = jest.fn();
    rackLocationFindMany = jest.fn();
    machineFindMany = jest.fn();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue({
        vacuumPad: {
          findMany: vacuumPadFindMany,
        },
        rackLocation: {
          findMany: rackLocationFindMany,
        },
        machine: {
          findMany: machineFindMany,
        },
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

  it('/qr/scan (POST) validates the request body', async () => {
    const server = app.getHttpServer() as Parameters<typeof request>[0];

    await request(server)
      .post('/qr/scan')
      .send({
        context: 'STATUS',
        deviceId: 'device-01',
      })
      .expect(400);
  });

  it('/qr/scan (POST) returns a structured malformed response', async () => {
    const server = app.getHttpServer() as Parameters<typeof request>[0];

    const response = await request(server).post('/qr/scan').send({
      raw: '{"v":1,',
      context: 'STATUS',
      deviceId: 'device-01',
      operatorName: 'Operator One',
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      ok: false,
      errorCode: 'QR_MALFORMED',
      message: 'Malformed QR payload',
      input: {
        raw: '{"v":1,',
        normalizedRaw: '{"v":1,',
        context: 'STATUS',
        deviceId: 'device-01',
        operatorName: 'Operator One',
        format: 'JSON',
      },
    });
  });

  it('/qr/scan (POST) returns a vacuum lookup result', async () => {
    vacuumPadFindMany.mockResolvedValue([
      {
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
      },
    ]);

    const server = app.getHttpServer() as Parameters<typeof request>[0];
    const response = await request(server).post('/qr/scan').send({
      raw: 'VAC:VP-001',
      context: 'STATUS',
      deviceId: 'device-01',
      operatorName: 'Operator One',
    });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      ok: true,
      entityType: 'VACUUM',
      entity: {
        code: 'VP-001',
        displayStatus: 'NOTACTIVE',
      },
      workflowHints: {
        canContinue: true,
      },
    });
  });

  afterEach(async () => {
    await app.close();
  });
});
