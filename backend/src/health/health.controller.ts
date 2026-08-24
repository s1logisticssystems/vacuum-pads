import { Controller, Get, Res } from '@nestjs/common';
import type { Response } from 'express';
import { HealthService } from './health.service';

@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  getHealth() {
    return this.healthService.getHealth();
  }

  @Get('database')
  async getDatabaseHealth(@Res({ passthrough: true }) response: Response) {
    const result = await this.healthService.getDatabaseHealth();

    if (result.status === 'unavailable') {
      response.status(503);
    }

    return result;
  }
}
