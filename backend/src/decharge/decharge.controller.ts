import {
  Body,
  Controller,
  HttpCode,
  HttpException,
  Post,
} from '@nestjs/common';
import { AdminEventsService } from '../admin-events/admin-events.service';
import { DechargeDto } from './dto/decharge.dto';
import { DechargePreviewDto } from './dto/decharge-preview.dto';
import { DechargeService } from './decharge.service';

@Controller('decharge')
export class DechargeController {
  constructor(
    private readonly dechargeService: DechargeService,
    private readonly adminEventsService: AdminEventsService,
  ) {}

  @Post('preview')
  @HttpCode(200)
  preview(@Body() dto: DechargePreviewDto) {
    return this.dechargeService.preview(dto);
  }

  @Post()
  async decharge(@Body() dto: DechargeDto) {
    const result = await this.dechargeService.decharge(dto);

    if (!result.ok) {
      const { httpStatus, ...body } = result;

      throw new HttpException(body, httpStatus);
    }

    this.adminEventsService.emitWorkflowEvent({
      type: 'decharge',
      vacuumSerial: result.vacuum.serialNumber,
      vacuumCode: result.vacuum.code,
      rackCode: result.rack.code,
    });

    return result;
  }
}
