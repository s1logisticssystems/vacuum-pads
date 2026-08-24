import { IsEnum, IsOptional, IsString } from 'class-validator';
import { QrScanContext } from '../qr.types';

export class QrScanDto {
  @IsString()
  raw!: string;

  @IsEnum(QrScanContext)
  context!: QrScanContext;

  @IsString()
  deviceId!: string;

  @IsOptional()
  @IsString()
  operatorName?: string;
}
