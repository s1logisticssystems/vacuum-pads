import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';

describe('StatusController (e2e)', () => {
  let app: INestApplication;
  let vacuumPadFindMany: jest.Mock;
  let vacuumPadCount: jest.Mock;

  beforeEach(async () => {
    vacuumPadFindMany = jest.fn();
    vacuumPadCount = jest.fn();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue({
        vacuumPad: {
          findMany: vacuumPadFindMany,
          count: vacuumPadCount,
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

  it('/status/active-vacuums (GET) returns a read-only active list shape', async () => {
    vacuumPadFindMany.mockResolvedValue([]);

    const server = app.getHttpServer() as Parameters<typeof request>[0];
    const response = await request(server).get('/status/active-vacuums');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      items: [],
      total: 0,
    });
  });

  it('/status/inactive-vacuums (GET) returns a read-only inactive list shape', async () => {
    vacuumPadFindMany.mockResolvedValue([]);

    const server = app.getHttpServer() as Parameters<typeof request>[0];
    const response = await request(server).get('/status/inactive-vacuums');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      items: [],
      total: 0,
    });
  });

  it('/status/repair-vacuums (GET) returns a read-only repair list shape', async () => {
    vacuumPadFindMany.mockResolvedValue([]);

    const server = app.getHttpServer() as Parameters<typeof request>[0];
    const response = await request(server).get('/status/repair-vacuums');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      items: [],
      total: 0,
    });
  });

  it('/status/summary (GET) returns read-only summary counts', async () => {
    vacuumPadCount
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0);

    const server = app.getHttpServer() as Parameters<typeof request>[0];
    const response = await request(server).get('/status/summary');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      active: 0,
      inactive: 0,
      repair: 0,
    });
  });

  afterEach(async () => {
    await app.close();
  });
});
