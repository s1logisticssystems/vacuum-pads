import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';

describe('FaultController (e2e)', () => {
  let app: INestApplication;
  let vacuumPadFindFirst: jest.Mock;
  let vacuumPadFindMany: jest.Mock;
  let vacuumPadUpdate: jest.Mock;
  let rackLocationFindMany: jest.Mock;
  let faultCatalogFindFirst: jest.Mock;
  let faultCatalogFindMany: jest.Mock;
  let repairFindFirst: jest.Mock;
  let repairCreate: jest.Mock;
  let repairUpdate: jest.Mock;
  let repairPhotoCreate: jest.Mock;
  let repairPhotoCount: jest.Mock;
  let repairPhotoDelete: jest.Mock;
  let repairPhotoFindFirst: jest.Mock;
  let repairPhotoFindMany: jest.Mock;
  let padMovementCreate: jest.Mock;
  let auditLogCreate: jest.Mock;
  let rackLocationFindUnique: jest.Mock;
  let transactionMock: jest.Mock;

  beforeEach(async () => {
    vacuumPadFindMany = jest.fn();
    vacuumPadFindFirst = jest.fn();
    vacuumPadUpdate = jest.fn();
    rackLocationFindMany = jest.fn();
    faultCatalogFindFirst = jest.fn();
    faultCatalogFindMany = jest.fn();
    repairFindFirst = jest.fn();
    repairCreate = jest.fn();
    repairUpdate = jest.fn();
    repairPhotoCreate = jest.fn();
    repairPhotoCount = jest.fn().mockResolvedValue(1);
    repairPhotoDelete = jest.fn();
    repairPhotoFindFirst = jest.fn();
    repairPhotoFindMany = jest.fn();
    padMovementCreate = jest.fn();
    auditLogCreate = jest.fn();
    rackLocationFindUnique = jest.fn();

    const txClient = {
      vacuumPad: {
        findFirst: vacuumPadFindFirst,
        findMany: vacuumPadFindMany,
        update: vacuumPadUpdate,
      },
      faultCatalog: {
        findFirst: faultCatalogFindFirst,
        findMany: faultCatalogFindMany,
      },
      repair: {
        findFirst: repairFindFirst,
        create: repairCreate,
        update: repairUpdate,
      },
      repairPhoto: {
        count: repairPhotoCount,
        create: repairPhotoCreate,
        delete: repairPhotoDelete,
        findFirst: repairPhotoFindFirst,
        findMany: repairPhotoFindMany,
      },
      rackLocation: {
        findMany: rackLocationFindMany,
        findUnique: rackLocationFindUnique,
      },
      padMovement: {
        create: padMovementCreate,
      },
      auditLog: {
        create: auditLogCreate,
      },
    };

    transactionMock = jest.fn((callback: (tx: typeof txClient) => unknown) =>
      callback(txClient),
    );

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue({
        vacuumPad: {
          findFirst: vacuumPadFindFirst,
          findMany: vacuumPadFindMany,
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
          findFirst: jest.fn(),
        },
        faultCatalog: {
          findFirst: faultCatalogFindFirst,
          findMany: faultCatalogFindMany,
        },
        repair: {
          findFirst: repairFindFirst,
          create: repairCreate,
          update: repairUpdate,
        },
        repairPhoto: {
          count: repairPhotoCount,
          create: repairPhotoCreate,
          delete: repairPhotoDelete,
          findFirst: repairPhotoFindFirst,
          findMany: repairPhotoFindMany,
        },
        padMovement: {
          create: padMovementCreate,
        },
        auditLog: {
          create: auditLogCreate,
        },
        $transaction: transactionMock,
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

  it('/faults/declaration/preview (POST) validates the request body', async () => {
    const server = app.getHttpServer() as Parameters<typeof request>[0];

    await request(server)
      .post('/faults/declaration/preview')
      .send({
        deviceId: 'device-01',
      })
      .expect(400);
  });

  it('/faults/declaration/preview (POST) returns a safe vacuum not found response', async () => {
    vacuumPadFindMany.mockResolvedValue([]);

    const server = app.getHttpServer() as Parameters<typeof request>[0];
    const response = await request(server)
      .post('/faults/declaration/preview')
      .send({
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
      faultCatalog: null,
      requiredNextAction: 'NONE',
    });
  });

  it('/faults/declaration (POST) validates the request body', async () => {
    const server = app.getHttpServer() as Parameters<typeof request>[0];

    await request(server)
      .post('/faults/declaration')
      .send({
        deviceId: 'device-01',
      })
      .expect(400);
  });

  it('/faults/declaration (POST) returns a safe vacuum not found response', async () => {
    vacuumPadFindMany.mockResolvedValue([]);

    const server = app.getHttpServer() as Parameters<typeof request>[0];
    const response = await request(server).post('/faults/declaration').send({
      vacuumQr: 'VAC:VP-404',
      faultCatalogCode: 'FC-001',
      deviceId: 'device-01',
      operatorName: 'Operator One',
    });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      ok: false,
      decision: 'VACUUM_NOT_FOUND',
      message: 'No matching vacuum found',
    });
    expect(repairCreate).not.toHaveBeenCalled();
    expect(vacuumPadUpdate).not.toHaveBeenCalled();
    expect(padMovementCreate).not.toHaveBeenCalled();
    expect(auditLogCreate).not.toHaveBeenCalled();
  });

  it('/faults/restoration/preview (POST) validates the request body', async () => {
    const server = app.getHttpServer() as Parameters<typeof request>[0];

    await request(server)
      .post('/faults/restoration/preview')
      .send({
        deviceId: 'device-01',
      })
      .expect(400);
  });

  it('/faults/restoration/preview (POST) returns a safe vacuum not found response', async () => {
    vacuumPadFindMany.mockResolvedValue([]);

    const server = app.getHttpServer() as Parameters<typeof request>[0];
    const response = await request(server)
      .post('/faults/restoration/preview')
      .send({
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
      repair: null,
      rack: null,
      requiredNextAction: 'NONE',
    });
  });

  it('/faults/restoration (POST) validates the request body', async () => {
    const server = app.getHttpServer() as Parameters<typeof request>[0];

    await request(server)
      .post('/faults/restoration')
      .send({
        deviceId: 'device-01',
      })
      .expect(400);
  });

  it('/faults/restoration (POST) returns a safe vacuum not found response', async () => {
    vacuumPadFindMany.mockResolvedValue([]);

    const server = app.getHttpServer() as Parameters<typeof request>[0];
    const response = await request(server).post('/faults/restoration').send({
      vacuumQr: 'VAC:VP-404',
      rackQr: 'RACK-A-01-07',
      outcome: 'RETURNED_TO_SERVICE',
      deviceId: 'device-01',
      operatorName: 'Operator One',
    });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      ok: false,
      decision: 'VACUUM_NOT_FOUND',
      message: 'No matching vacuum found',
    });
    expect(repairUpdate).not.toHaveBeenCalled();
    expect(vacuumPadUpdate).not.toHaveBeenCalled();
    expect(padMovementCreate).not.toHaveBeenCalled();
    expect(auditLogCreate).not.toHaveBeenCalled();
  });

  it('/faults/:repairId/photos (POST) validates the request body', async () => {
    const server = app.getHttpServer() as Parameters<typeof request>[0];

    await request(server)
      .post('/faults/repair-1/photos')
      .field('deviceId', 'device-01')
      .expect(400);
  });

  it('/faults/:repairId/photos (POST) returns a safe repair not found response', async () => {
    repairFindFirst.mockResolvedValue(null);

    const server = app.getHttpServer() as Parameters<typeof request>[0];
    const response = await request(server)
      .post('/faults/repair-404/photos')
      .field('deviceId', 'device-01')
      .field('operatorName', 'Operator One')
      .attach('file', Buffer.from([0x89, 0x50, 0x4e, 0x47]), {
        filename: 'repair-photo.png',
        contentType: 'image/png',
      });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      ok: false,
      decision: 'REPAIR_NOT_FOUND',
      message: 'No matching repair found',
    });
    expect(repairPhotoCreate).not.toHaveBeenCalled();
    expect(vacuumPadUpdate).not.toHaveBeenCalled();
    expect(repairUpdate).not.toHaveBeenCalled();
  });

  it('/repairs/:repairId/photos (GET) returns photo metadata and view URLs', async () => {
    repairFindFirst.mockResolvedValue({ id: 'repair-1' });
    repairPhotoFindMany.mockResolvedValue([
      {
        id: 'photo-1',
        repairId: 'repair-1',
        objectKey: 'repair-photos/repair-1/example.png',
        bucket: 'vacuum-photos',
        originalFilename: 'repair-photo.png',
        contentType: 'image/png',
        sizeBytes: 128,
        caption: 'Damage close-up',
        operatorName: 'Operator One',
        stage: 'FAULT_DECLARATION',
        storageProvider: 'MINIO',
        filesystemPath: null,
        publicUrl: 'http://localhost:9000/vacuum-photos/example.png',
        createdAt: new Date('2026-05-22T12:00:00.000Z'),
      },
    ]);

    const server = app.getHttpServer() as Parameters<typeof request>[0];
    const response = await request(server).get('/repairs/repair-1/photos');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      repairId: 'repair-1',
      photos: [
        {
          id: 'photo-1',
          filename: 'repair-photo.png',
          contentType: 'image/png',
          sizeBytes: 128,
          caption: 'Damage close-up',
          operatorName: 'Operator One',
          stage: 'FAULT_DECLARATION',
          storageProvider: 'MINIO',
          createdAt: '2026-05-22T12:00:00.000Z',
          url: 'http://localhost:9000/vacuum-photos/example.png',
          urlExpiresAt: null,
          urlSource: 'PUBLIC',
        },
      ],
      faultDeclarationPhotos: [
        expect.objectContaining({
          id: 'photo-1',
          stage: 'FAULT_DECLARATION',
        }),
      ],
      repairCompletionPhotos: [],
    });
  });

  it('/repairs/:repairId/photos (GET) returns an empty photo list', async () => {
    repairFindFirst.mockResolvedValue({ id: 'repair-1' });
    repairPhotoFindMany.mockResolvedValue([]);

    const server = app.getHttpServer() as Parameters<typeof request>[0];
    const response = await request(server).get('/repairs/repair-1/photos');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      repairId: 'repair-1',
      photos: [],
      faultDeclarationPhotos: [],
      repairCompletionPhotos: [],
    });
  });

  it('/repairs/:repairId/photos (GET) returns 404 for missing repair', async () => {
    repairFindFirst.mockResolvedValue(null);

    const server = app.getHttpServer() as Parameters<typeof request>[0];
    const response = await request(server).get('/repairs/repair-404/photos');

    expect(response.status).toBe(404);
    const body = response.body as { message?: string };
    expect(body.message).toBe('No matching repair found');
    expect(repairPhotoFindMany).not.toHaveBeenCalled();
  });

  it('/faults/catalog (GET) returns a read-only catalog list', async () => {
    faultCatalogFindMany.mockResolvedValue([]);

    const server = app.getHttpServer() as Parameters<typeof request>[0];
    const response = await request(server).get('/faults/catalog');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      items: [],
    });
  });

  afterEach(async () => {
    await app.close();
  });
});
