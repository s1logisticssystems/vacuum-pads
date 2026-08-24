import {
  Body,
  Controller,
  HttpCode,
  HttpException,
  Post,
} from '@nestjs/common';
import { AdminEventsService } from '../admin-events/admin-events.service';
import { ChargeDto } from './dto/charge.dto';
import { ChargePreviewDto } from './dto/charge-preview.dto';
import { ChargeService } from './charge.service';

@Controller('charge')
export class ChargeController {
  constructor(
    private readonly chargeService: ChargeService,
    private readonly adminEventsService: AdminEventsService,
  ) {}

  @Post('preview')
  @HttpCode(200)
  preview(@Body() dto: ChargePreviewDto) {
    return this.chargeService.preview(dto);
  }

  @Post()
  async charge(@Body() dto: ChargeDto) {
    const result = await this.chargeService.charge(dto);

    if (!result.ok) {
      const { httpStatus, ...body } = result;

      throw new HttpException(body, httpStatus);
    }

    this.adminEventsService.emitWorkflowEvent({
      type: 'charge',
      vacuumSerial: result.vacuum.serialNumber,
      vacuumCode: result.vacuum.code,
      machineCode: result.machine.code,
    });

    return result;
  }
}
