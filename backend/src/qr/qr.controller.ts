import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { QrScanDto } from './dto/qr-scan.dto';
import { QrService } from './qr.service';

@Controller('qr')
export class QrController {
  constructor(private readonly qrService: QrService) {}

  @Post('scan')
  @HttpCode(200)
  scan(@Body() dto: QrScanDto) {
    return this.qrService.scan(dto);
  }
}
