import { Controller, Delete, Get, Param, Res } from '@nestjs/common';
import type { Response } from 'express';
import { FaultService } from './fault.service';

@Controller('repairs')
export class RepairsController {
  constructor(private readonly faultService: FaultService) {}

  @Get(':repairId/photos')
  listPhotos(@Param('repairId') repairId: string) {
    return this.faultService.listRepairPhotos(repairId);
  }

  /**
   * Streams a repair photo's bytes.
   *
   * Photos live in a private bucket on the internal Docker network, so a signed
   * object-store URL only resolves from inside the host. Serving the bytes here
   * lets any browser that can reach the API display them, without publishing
   * the object store or handing out storage credentials.
   */
  @Get(':repairId/photos/:photoId/content')
  async streamPhoto(
    @Param('repairId') repairId: string,
    @Param('photoId') photoId: string,
    @Res() response: Response,
  ): Promise<void> {
    const content = await this.faultService.getRepairPhotoContent(
      repairId,
      photoId,
    );

    response.setHeader('Content-Type', content.contentType);
    response.setHeader('Cache-Control', 'private, max-age=300');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    // Render in the browser rather than prompting a download; the filename is
    // quoted and stripped of quotes/newlines so it cannot break the header.
    response.setHeader(
      'Content-Disposition',
      `inline; filename="${(content.filename ?? 'repair-photo').replace(
        /["\r\n]/g,
        '',
      )}"`,
    );

    if (content.sizeBytes !== null) {
      response.setHeader('Content-Length', String(content.sizeBytes));
    }

    content.stream.pipe(response);
  }

  @Delete(':repairId/photos/:photoId')
  deletePhoto(
    @Param('repairId') repairId: string,
    @Param('photoId') photoId: string,
  ) {
    return this.faultService.deleteRepairPhoto(repairId, photoId);
  }
}
