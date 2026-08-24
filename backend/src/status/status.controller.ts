import { Controller, Get } from '@nestjs/common';
import { StatusService } from './status.service';

@Controller('status')
export class StatusController {
  constructor(private readonly statusService: StatusService) {}

  @Get('active-vacuums')
  listActiveVacuums() {
    return this.statusService.listActiveVacuums();
  }

  @Get('inactive-vacuums')
  listInactiveVacuums() {
    return this.statusService.listInactiveVacuums();
  }

  @Get('repair-vacuums')
  listRepairVacuums() {
    return this.statusService.listRepairVacuums();
  }

  @Get('summary')
  getSummary() {
    return this.statusService.getSummary();
  }
}
