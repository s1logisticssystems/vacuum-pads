import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';

export interface HealthResponse {
  status: 'ok';
  service: string;
  timestamp: string;
}

export interface DatabaseHealthOkResponse {
  status: 'ok';
  service: string;
  database: {
    status: 'ok';
  };
  timestamp: string;
}

export interface DatabaseHealthUnavailableResponse {
  status: 'unavailable';
  service: string;
  database: {
    status: 'unavailable';
    reason: string;
  };
  timestamp: string;
}

export type DatabaseHealthResponse =
  | DatabaseHealthOkResponse
  | DatabaseHealthUnavailableResponse;

@Injectable()
export class HealthService {
  constructor(
    private readonly configService: ConfigService,
    private readonly prismaService: PrismaService,
  ) {}

  getHealth(): HealthResponse {
    return {
      status: 'ok',
      service: this.getServiceName(),
      timestamp: new Date().toISOString(),
    };
  }

  async getDatabaseHealth(): Promise<DatabaseHealthResponse> {
    if (!this.configService.get<string>('DATABASE_URL')) {
      return this.getDatabaseUnavailableResponse(
        'database URL is not configured',
      );
    }

    try {
      await this.prismaService.$queryRawUnsafe('SELECT 1');

      return {
        status: 'ok',
        service: this.getServiceName(),
        database: {
          status: 'ok',
        },
        timestamp: new Date().toISOString(),
      };
    } catch {
      return this.getDatabaseUnavailableResponse(
        'database connection check failed',
      );
    }
  }

  private getDatabaseUnavailableResponse(
    reason: string,
  ): DatabaseHealthUnavailableResponse {
    return {
      status: 'unavailable',
      service: this.getServiceName(),
      database: {
        status: 'unavailable',
        reason,
      },
      timestamp: new Date().toISOString(),
    };
  }

  private getServiceName(): string {
    return (
      this.configService.get<string>('app.name') ?? 'vacuum-traceability-api'
    );
  }
}
