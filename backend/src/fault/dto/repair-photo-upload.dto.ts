import { RepairPhotoStage } from '@prisma/client';
import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class RepairPhotoUploadDto {
  @IsString()
  @IsNotEmpty()
  deviceId!: string;

  @IsOptional()
  @IsString()
  caption?: string;

  @IsOptional()
  @IsEnum(RepairPhotoStage)
  stage?: RepairPhotoStage;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  operatorName?: string;
}
