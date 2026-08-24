import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  Param,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AdminEventsService } from '../admin-events/admin-events.service';
import { FaultDeclarationDto } from './dto/fault-declaration.dto';
import { FaultDeclarationPreviewDto } from './dto/fault-declaration-preview.dto';
import { FaultRestorationDto } from './dto/fault-restoration.dto';
import { FaultRestorationPreviewDto } from './dto/fault-restoration-preview.dto';
import { RepairPhotoUploadDto } from './dto/repair-photo-upload.dto';
import { FaultService } from './fault.service';

@Controller('faults')
export class FaultController {
  constructor(
    private readonly faultService: FaultService,
    private readonly adminEventsService: AdminEventsService,
  ) {}

  @Get('catalog')
  listCatalog() {
    return this.faultService.listCatalog();
  }

  @Post('declaration/preview')
  @HttpCode(200)
  previewDeclaration(@Body() dto: FaultDeclarationPreviewDto) {
    return this.faultService.previewDeclaration(dto);
  }

  @Post('restoration/preview')
  @HttpCode(200)
  previewRestoration(@Body() dto: FaultRestorationPreviewDto) {
    return this.faultService.previewRestoration(dto);
  }

  @Post('declaration')
  async declare(@Body() dto: FaultDeclarationDto) {
    const result = await this.faultService.declare(dto);

    if (!result.ok) {
      const { httpStatus, ...body } = result;

      throw new HttpException(body, httpStatus);
    }

    this.adminEventsService.emitWorkflowEvent({
      type: 'fault_declared',
      vacuumSerial: result.vacuum.serialNumber,
      vacuumCode: result.vacuum.code,
      rackCode: result.rack?.code ?? null,
      repairId: result.repair.id,
    });

    return result;
  }

  @Post('restoration')
  async restore(@Body() dto: FaultRestorationDto) {
    const result = await this.faultService.restore(dto);

    if (!result.ok) {
      const { httpStatus, ...body } = result;

      throw new HttpException(body, httpStatus);
    }

    this.adminEventsService.emitWorkflowEvent({
      type: 'fault_restored',
      vacuumSerial: result.vacuum.serialNumber,
      vacuumCode: result.vacuum.code,
      rackCode: result.rack.code,
      repairId: result.repair.id,
    });

    return result;
  }

  @Post(':repairId/photos')
  @HttpCode(201)
  @UseInterceptors(FileInterceptor('file'))
  async uploadPhoto(
    @Param('repairId') repairId: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() dto: RepairPhotoUploadDto,
  ) {
    const result = await this.faultService.uploadPhoto(repairId, file, dto);

    if (!result.ok) {
      const { httpStatus, ...body } = result;

      throw new HttpException(body, httpStatus);
    }

    return result;
  }
}
