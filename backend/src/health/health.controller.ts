import { Controller, Get, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Public } from '../auth/public.decorator';
import { HealthService } from './health.service';

// Container healthchecks and uptime monitors probe these without credentials.
// They expose only liveness and database reachability, never business data.
@Public()
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
