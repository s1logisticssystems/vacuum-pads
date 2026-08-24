import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module';
import {
  DatabaseHealthResponse,
  HealthResponse,
} from './../src/health/health.service';

describe('HealthController (e2e)', () => {
  let app: INestApplication;
  let originalDatabaseUrl: string | undefined;

  beforeEach(async () => {
    originalDatabaseUrl = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('/health (GET)', async () => {
    const server = app.getHttpServer() as Parameters<typeof request>[0];
    const response = await request(server).get('/health').expect(200);
    const body = response.body as HealthResponse;

    expect(body).toMatchObject({
      status: 'ok',
      service: 'vacuum-traceability-api',
    });
    expect(new Date(body.timestamp).toISOString()).toBe(body.timestamp);
  });

  it('/health/database (GET) returns a safe unavailable response without a live check', async () => {
    const server = app.getHttpServer() as Parameters<typeof request>[0];
    const response = await request(server).get('/health/database').expect(503);
    const body = response.body as DatabaseHealthResponse;

    expect(body).toMatchObject({
      status: 'unavailable',
      service: 'vacuum-traceability-api',
    });
    expect(body.database.status).toBe('unavailable');
    expect([
      'database URL is not configured',
      'database connection check failed',
    ]).toContain(body.database.reason);
    expect(new Date(body.timestamp).toISOString()).toBe(body.timestamp);
  });

  afterEach(async () => {
    await app.close();

    if (originalDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL;
      return;
    }

    process.env.DATABASE_URL = originalDatabaseUrl;
  });
});
