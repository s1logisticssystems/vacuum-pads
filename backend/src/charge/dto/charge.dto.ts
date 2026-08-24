import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class ChargeDto {
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

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  note?: string;
}
