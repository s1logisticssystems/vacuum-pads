import 'reflect-metadata';
import { validateEnv } from './env.validation';

describe('validateEnv', () => {
  const productionEnv = {
    NODE_ENV: 'production',
    DATABASE_URL:
      'postgresql://vacuum_user:vacuum_pass@postgres:5432/vacuum_traceability?schema=public',
    S3_ENDPOINT: 'http://minio:9000',
    S3_BUCKET: 'vacuum-photos',
    S3_ACCESS_KEY: 'minio_user',
    S3_SECRET_KEY: 'minio_pass',
    S3_USE_SSL: 'false',
    CORS_ORIGIN: 'https://vacuum-admin.example.com',
    BACKEND_PUBLIC_URL: 'https://vacuum-api.example.com',
    ADMIN_PUBLIC_URL: 'https://vacuum-admin.example.com',
    JWT_SECRET: 'a-test-signing-secret-of-at-least-32-chars',
  };

  it('allows development without production-only deployment values', () => {
    expect(validateEnv({ NODE_ENV: 'development' }).NODE_ENV).toBe(
      'development',
    );
  });

  it('requires signed-photo and public URL settings in production', () => {
    expect(() => validateEnv({ NODE_ENV: 'production' })).toThrow(
      /Missing required production environment variables/,
    );
  });

  it('rejects placeholder secrets in production', () => {
    expect(() =>
      validateEnv({
        ...productionEnv,
        S3_SECRET_KEY: 'CHANGE_ME_S3_SECRET_KEY',
      }),
    ).toThrow(/placeholder values/);
  });

  it('rejects wildcard CORS in production', () => {
    expect(() =>
      validateEnv({
        ...productionEnv,
        CORS_ORIGIN: '*',
      }),
    ).toThrow(/CORS_ORIGIN/);
  });

  it('rejects a short JWT secret in production', () => {
    expect(() =>
      validateEnv({ ...productionEnv, JWT_SECRET: 'too-short' }),
    ).toThrow(/JWT_SECRET/);
  });

  it('accepts a production configuration with a strong JWT secret', () => {
    expect(validateEnv(productionEnv).NODE_ENV).toBe('production');
  });
});
