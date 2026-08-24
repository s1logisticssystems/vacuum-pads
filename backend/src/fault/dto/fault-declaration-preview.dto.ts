import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class FaultDeclarationPreviewDto {
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
  @IsNotEmpty()
  faultOtherText?: string;

  @IsString()
  @IsNotEmpty()
  deviceId!: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  operatorName?: string;
}
