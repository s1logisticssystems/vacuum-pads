import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class FaultRestorationPreviewDto {
  @IsString()
  @IsNotEmpty()
  vacuumQr!: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  rackQr?: string;

  @IsString()
  @IsNotEmpty()
  deviceId!: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  operatorName?: string;
}
