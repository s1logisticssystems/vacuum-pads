import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { HealthService } from './health.service';

describe('HealthService', () => {
  let prismaService: PrismaService;
  let configService: ConfigService;
  let healthService: HealthService;
  let prismaQueryRawUnsafe: jest.Mock;
  let configGet: jest.Mock;

  beforeEach(() => {
    prismaQueryRawUnsafe = jest.fn();
    prismaService = {
      $queryRawUnsafe: prismaQueryRawUnsafe,
    } as unknown as PrismaService;

    configGet = jest.fn((key: string) => {
      if (key === 'app.name') {
        return 'vacuum-traceability-api';
      }

      return undefined;
    });
    configService = {
      get: configGet,
    } as unknown as ConfigService;

    healthService = new HealthService(configService, prismaService);
  });

  it('returns basic process health without database access', () => {
    const result = healthService.getHealth();

    expect(result).toMatchObject({
      status: 'ok',
      service: 'vacuum-traceability-api',
    });
    expect(new Date(result.timestamp).toISOString()).toBe(result.timestamp);
    expect(prismaQueryRawUnsafe).not.toHaveBeenCalled();
  });

  it('returns database readiness when Prisma can reach PostgreSQL', async () => {
    configGet.mockImplementation((key: string) =>
      key === 'DATABASE_URL'
        ? 'postgresql://vacuum_user:vacuum_pass@localhost:5432/vacuum_traceability?schema=public'
        : key === 'app.name'
          ? 'vacuum-traceability-api'
          : undefined,
    );
    prismaQueryRawUnsafe.mockResolvedValue([{ '?column?': 1 }]);

    const result = await healthService.getDatabaseHealth();

    expect(result).toEqual({
      status: 'ok',
      service: 'vacuum-traceability-api',
      database: {
        status: 'ok',
      },
      timestamp: result.timestamp,
    });
    expect(new Date(result.timestamp).toISOString()).toBe(result.timestamp);
    expect(prismaQueryRawUnsafe).toHaveBeenCalledWith('SELECT 1');
  });

  it('returns unavailable when DATABASE_URL is missing', async () => {
    const result = await healthService.getDatabaseHealth();

    expect(result).toEqual({
      status: 'unavailable',
      service: 'vacuum-traceability-api',
      database: {
        status: 'unavailable',
        reason: 'database URL is not configured',
      },
      timestamp: result.timestamp,
    });
    expect(new Date(result.timestamp).toISOString()).toBe(result.timestamp);
    expect(prismaQueryRawUnsafe).not.toHaveBeenCalled();
  });

  it('returns unavailable when the database check fails', async () => {
    configGet.mockImplementation((key: string) =>
      key === 'DATABASE_URL'
        ? 'postgresql://vacuum_user:vacuum_pass@localhost:5432/vacuum_traceability?schema=public'
        : key === 'app.name'
          ? 'vacuum-traceability-api'
          : undefined,
    );
    prismaQueryRawUnsafe.mockRejectedValue(new Error('boom'));

    const result = await healthService.getDatabaseHealth();

    expect(result).toEqual({
      status: 'unavailable',
      service: 'vacuum-traceability-api',
      database: {
        status: 'unavailable',
        reason: 'database connection check failed',
      },
      timestamp: result.timestamp,
    });
    expect(new Date(result.timestamp).toISOString()).toBe(result.timestamp);
    expect(prismaQueryRawUnsafe).toHaveBeenCalledWith('SELECT 1');
  });
});
