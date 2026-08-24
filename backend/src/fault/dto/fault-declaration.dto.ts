import { RepairPriority } from '@prisma/client';
import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class FaultDeclarationDto {
  @IsString()
  @IsNotEmpty()
  vacuumQr!: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  rackQr?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  faultCatalogId?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  faultCatalogCode?: string;

  @IsOptional()
  @IsString()
  faultOtherText?: string;

  @IsOptional()
  @IsEnum(RepairPriority)
  priority?: RepairPriority;

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
