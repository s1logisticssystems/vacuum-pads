import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class DechargeDto {
  @IsString()
  @IsNotEmpty()
  vacuumQr!: string;

  @IsString()
  @IsNotEmpty()
  rackQr!: string;

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
