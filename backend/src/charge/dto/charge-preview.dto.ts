import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class ChargePreviewDto {
  @IsString()
  @IsNotEmpty()
  vacuumQr!: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  machineId?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  machineQr?: string;

  @IsString()
  @IsNotEmpty()
  deviceId!: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  operatorName?: string;
}
