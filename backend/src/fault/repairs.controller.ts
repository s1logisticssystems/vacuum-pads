import { Controller, Delete, Get, Param } from '@nestjs/common';
import { FaultService } from './fault.service';

@Controller('repairs')
export class RepairsController {
  constructor(private readonly faultService: FaultService) {}

  @Get(':repairId/photos')
  listPhotos(@Param('repairId') repairId: string) {
    return this.faultService.listRepairPhotos(repairId);
  }

  @Delete(':repairId/photos/:photoId')
  deletePhoto(
    @Param('repairId') repairId: string,
    @Param('photoId') photoId: string,
  ) {
    return this.faultService.deleteRepairPhoto(repairId, photoId);
  }
}
