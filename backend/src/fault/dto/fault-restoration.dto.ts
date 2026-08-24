import { Transform, type TransformFnParams } from 'class-transformer';
import { RepairOutcome } from '@prisma/client';
import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';

function normalizeRepairCostInput({
  value,
}: TransformFnParams): string | null | undefined {
  const raw: unknown = value;

  if (raw === undefined || raw === null) {
    return raw;
  }

  if (
    typeof raw === 'string' ||
    typeof raw === 'number' ||
    typeof raw === 'bigint'
  ) {
    return String(raw);
  }

  if (typeof raw === 'boolean') {
    return raw ? 'true' : 'false';
  }

  return '';
}

export class FaultRestorationDto {
  @IsString()
  @IsNotEmpty()
  vacuumQr!: string;

  @IsString()
  @IsNotEmpty()
  rackQr!: string;

  @IsEnum(RepairOutcome)
  outcome!: RepairOutcome;

  @IsOptional()
  @IsString()
  technicianNotes?: string;

  @IsOptional()
  @IsString()
  repairActions?: string;

  @IsOptional()
  @IsString()
  spareParts?: string;

  @IsOptional()
  @Transform(normalizeRepairCostInput)
  @IsString()
  @IsNotEmpty()
  repairCost?: string;

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
