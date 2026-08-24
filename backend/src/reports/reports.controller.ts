import { Controller, Get, Query } from '@nestjs/common';
import { ReportsService } from './reports.service';
import type {
  FaultyVacuumPadsQuery,
  MachineFaultReportQuery,
  MostFrequentFaultsQuery,
  MostUsedVacuumPadsQuery,
  VacuumPadLocationQuery,
} from './reports.types';

@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('most-used-vacuum-pads')
  getMostUsedVacuumPads(@Query() query: MostUsedVacuumPadsQuery) {
    return this.reportsService.getMostUsedVacuumPads(query);
  }

  @Get('vacuum-pads-with-most-faults')
  getFaultyVacuumPads(@Query() query: FaultyVacuumPadsQuery) {
    return this.reportsService.getFaultyVacuumPads(query);
  }

  @Get('machines-causing-most-faults')
  getMachinesCausingMostFaults(@Query() query: MachineFaultReportQuery) {
    return this.reportsService.getMachinesCausingMostFaults(query);
  }

  @Get('most-frequent-faults')
  getMostFrequentFaults(@Query() query: MostFrequentFaultsQuery) {
    return this.reportsService.getMostFrequentFaults(query);
  }

  @Get('vacuum-pad-location')
  getVacuumPadLocation(@Query() query: VacuumPadLocationQuery) {
    return this.reportsService.getVacuumPadLocation(query);
  }
}
