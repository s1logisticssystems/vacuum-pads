import { plainToInstance } from 'class-transformer';
import {
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  validateSync,
} from 'class-validator';

class EnvVariables {
  @IsOptional()
  @IsIn(['development', 'test', 'production'])
  NODE_ENV: string = 'development';

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(65535)
  PORT: number = 3000;

  @IsOptional()
  @IsString()
  APP_NAME: string = 'vacuum-traceability-api';

  @IsOptional()
  @IsString()
  DATABASE_URL?: string;

  @IsOptional()
  @IsString()
  CORS_ORIGIN?: string;

  @IsOptional()
  @IsString()
  S3_ENDPOINT?: string;

  @IsOptional()
  @IsString()
  S3_BUCKET?: string;

  @IsOptional()
  @IsString()
  S3_ACCESS_KEY?: string;

  @IsOptional()
  @IsString()
  S3_SECRET_KEY?: string;

  @IsOptional()
  @IsString()
  S3_USE_SSL?: string;

  @IsOptional()
  @IsString()
  BACKEND_PUBLIC_URL?: string;

  @IsOptional()
  @IsString()
  ADMIN_PUBLIC_URL?: string;

  @IsOptional()
  @IsString()
  FIREBASE_SERVICE_ACCOUNT_PATH?: string;
}

const REQUIRED_PRODUCTION_ENV_KEYS = [
  'DATABASE_URL',
  'S3_ENDPOINT',
  'S3_BUCKET',
  'S3_ACCESS_KEY',
  'S3_SECRET_KEY',
  'S3_USE_SSL',
  'CORS_ORIGIN',
  'BACKEND_PUBLIC_URL',
  'ADMIN_PUBLIC_URL',
] as const;

export function validateEnv(config: Record<string, unknown>) {
  const validatedConfig = plainToInstance(EnvVariables, config, {
    enableImplicitConversion: true,
    exposeDefaultValues: true,
  });

  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    throw new Error(errors.toString());
  }

  validateProductionEnv(validatedConfig);

  return validatedConfig;
}

function validateProductionEnv(config: EnvVariables): void {
  if (config.NODE_ENV !== 'production') {
    return;
  }

  const missingKeys = REQUIRED_PRODUCTION_ENV_KEYS.filter((key) => {
    const value = config[key];
    return typeof value !== 'string' || value.trim() === '';
  });

  if (missingKeys.length > 0) {
    throw new Error(
      `Missing required production environment variables: ${missingKeys.join(', ')}`,
    );
  }

  const placeholderKeys = REQUIRED_PRODUCTION_ENV_KEYS.filter((key) => {
    const value = config[key];
    return typeof value === 'string' && value.includes('CHANGE_ME');
  });

  if (placeholderKeys.length > 0) {
    throw new Error(
      `Production environment variables still contain placeholder values: ${placeholderKeys.join(', ')}`,
    );
  }

  if (!['true', 'false'].includes(config.S3_USE_SSL!.trim())) {
    throw new Error('S3_USE_SSL must be either "true" or "false".');
  }

  if (config.CORS_ORIGIN!.trim() === '*') {
    throw new Error('CORS_ORIGIN must not be "*" in production.');
  }
}
