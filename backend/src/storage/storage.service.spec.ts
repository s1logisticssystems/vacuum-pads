import { ConfigService } from '@nestjs/config';
import { PhotoStorageProvider } from '@prisma/client';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import {
  InvalidRepairPhotoFileError,
  MAX_REPAIR_PHOTO_SIZE_BYTES,
  RepairPhotoStorageConfigurationError,
  RepairPhotoUploadFailedError,
} from './storage.types';
import { StorageService } from './storage.service';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn(),
}));

const getSignedUrlMock = getSignedUrl as jest.MockedFunction<
  typeof getSignedUrl
>;

describe('StorageService', () => {
  let tempRoot: string;

  const imageFile = (
    overrides: Partial<Express.Multer.File> = {},
  ): Express.Multer.File => ({
    fieldname: 'file',
    originalname: 'repair-photo.png',
    encoding: '7bit',
    mimetype: 'image/png',
    size: 4,
    buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
    stream: undefined as never,
    destination: '',
    filename: '',
    path: '',
    ...overrides,
  });

  beforeEach(() => {
    tempRoot = mkdtempSync(path.join(tmpdir(), 'vacuum-storage-'));
    getSignedUrlMock.mockReset();
  });

  afterEach(() => {
    rmSync(tempRoot, { recursive: true, force: true });
  });

  it('falls back to filesystem when MinIO config is missing', async () => {
    const service = new StorageService(
      new ConfigService({
        FILE_STORAGE_ROOT: tempRoot,
        S3_ENDPOINT: '',
        S3_BUCKET: '',
        S3_ACCESS_KEY: '',
        S3_SECRET_KEY: '',
      }),
    );

    const result = await service.storeRepairPhoto({
      repairId: 'repair-1',
      file: imageFile(),
    });

    expect(result.storageProvider).toBe(PhotoStorageProvider.FILESYSTEM);
    expect(result.bucket).toBe('filesystem');
    expect(result.filesystemPath).toContain('repair-photos/repair-1/');
    expect(readFileSync(path.join(tempRoot, result.filesystemPath!))).toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47]),
    );
  });

  it('falls back to filesystem when MinIO upload fails', async () => {
    const service = new StorageService(
      new ConfigService({
        FILE_STORAGE_ROOT: tempRoot,
        S3_ENDPOINT: 'http://localhost:9000',
        S3_BUCKET: 'vacuum-photos',
        S3_ACCESS_KEY: 'minio_user',
        S3_SECRET_KEY: 'minio_pass',
      }),
    );

    service['minioClient'] = {
      send: jest.fn().mockRejectedValue(new Error('boom')),
    } as never;

    const result = await service.storeRepairPhoto({
      repairId: 'repair-2',
      file: imageFile({
        originalname: 'repair-photo.jpg',
        mimetype: 'image/jpeg',
      }),
    });

    expect(result.storageProvider).toBe(PhotoStorageProvider.FILESYSTEM);
    expect(result.filesystemPath).toContain('repair-photos/repair-2/');
  });

  it('rejects missing object storage config in production', () => {
    expect(
      () =>
        new StorageService(
          new ConfigService({
            NODE_ENV: 'production',
            FILE_STORAGE_ROOT: tempRoot,
          }),
        ),
    ).toThrow(RepairPhotoStorageConfigurationError);
  });

  it('does not fall back to filesystem when MinIO upload fails in production', async () => {
    const service = new StorageService(
      new ConfigService({
        NODE_ENV: 'production',
        FILE_STORAGE_ROOT: tempRoot,
        S3_ENDPOINT: 'http://localhost:9000',
        S3_BUCKET: 'vacuum-photos',
        S3_ACCESS_KEY: 'minio_user',
        S3_SECRET_KEY: 'minio_pass',
        S3_USE_SSL: 'false',
      }),
    );

    service['minioClient'] = {
      send: jest.fn().mockRejectedValue(new Error('boom')),
    } as never;

    await expect(
      service.storeRepairPhoto({
        repairId: 'repair-production-1',
        file: imageFile(),
      }),
    ).rejects.toBeInstanceOf(RepairPhotoUploadFailedError);
  });

  it('does not persist public URLs for production MinIO uploads', async () => {
    const service = new StorageService(
      new ConfigService({
        NODE_ENV: 'production',
        FILE_STORAGE_ROOT: tempRoot,
        S3_ENDPOINT: 'http://localhost:9000',
        S3_BUCKET: 'vacuum-photos',
        S3_ACCESS_KEY: 'minio_user',
        S3_SECRET_KEY: 'minio_pass',
        S3_USE_SSL: 'false',
      }),
    );

    service['minioClient'] = {
      send: jest.fn().mockResolvedValue(undefined),
    } as never;

    const result = await service.storeRepairPhoto({
      repairId: 'repair-production-2',
      file: imageFile(),
    });

    expect(result.storageProvider).toBe(PhotoStorageProvider.MINIO);
    expect(result.publicUrl).toBeNull();
  });

  it('creates a short-lived signed view URL for MinIO photos', async () => {
    const service = new StorageService(
      new ConfigService({
        FILE_STORAGE_ROOT: tempRoot,
        S3_ENDPOINT: 'http://localhost:9000',
        S3_BUCKET: 'vacuum-photos',
        S3_ACCESS_KEY: 'minio_user',
        S3_SECRET_KEY: 'minio_pass',
      }),
    );

    service['minioClient'] = { send: jest.fn() } as never;
    getSignedUrlMock.mockResolvedValue(
      'http://localhost:9000/signed-photo-url',
    );

    const result = await service.createRepairPhotoViewUrl({
      storageProvider: PhotoStorageProvider.MINIO,
      objectKey: 'repair-photos/repair-1/example.png',
      bucket: 'vacuum-photos',
      publicUrl: 'http://localhost:9000/public-photo-url',
    });

    expect(result.url).toBe('http://localhost:9000/signed-photo-url');
    expect(typeof result.expiresAt).toBe('string');
    expect(result.source).toBe('SIGNED');
  });

  it('falls back to stored public URL when signing is unavailable', async () => {
    const service = new StorageService(
      new ConfigService({
        FILE_STORAGE_ROOT: tempRoot,
      }),
    );

    const result = await service.createRepairPhotoViewUrl({
      storageProvider: PhotoStorageProvider.MINIO,
      objectKey: 'repair-photos/repair-1/example.png',
      bucket: 'vacuum-photos',
      publicUrl: 'http://localhost:9000/public-photo-url',
    });

    expect(result).toEqual({
      url: 'http://localhost:9000/public-photo-url',
      expiresAt: null,
      source: 'PUBLIC',
    });
  });

  it('does not fall back to public URLs when signing is unavailable in production', async () => {
    const service = new StorageService(
      new ConfigService({
        NODE_ENV: 'production',
        FILE_STORAGE_ROOT: tempRoot,
        S3_ENDPOINT: 'http://localhost:9000',
        S3_BUCKET: 'vacuum-photos',
        S3_ACCESS_KEY: 'minio_user',
        S3_SECRET_KEY: 'minio_pass',
        S3_USE_SSL: 'false',
      }),
    );

    service['minioClient'] = { send: jest.fn() } as never;
    getSignedUrlMock.mockRejectedValue(new Error('boom'));

    await expect(
      service.createRepairPhotoViewUrl({
        storageProvider: PhotoStorageProvider.MINIO,
        objectKey: 'repair-photos/repair-1/example.png',
        bucket: 'vacuum-photos',
        publicUrl: 'http://localhost:9000/public-photo-url',
      }),
    ).rejects.toBeInstanceOf(RepairPhotoStorageConfigurationError);
  });

  it('rejects unsupported content types', async () => {
    const service = new StorageService(
      new ConfigService({
        FILE_STORAGE_ROOT: tempRoot,
      }),
    );

    await expect(
      service.storeRepairPhoto({
        repairId: 'repair-3',
        file: imageFile({ mimetype: 'application/pdf' }),
      }),
    ).rejects.toBeInstanceOf(InvalidRepairPhotoFileError);
  });

  it('rejects oversized files', async () => {
    const service = new StorageService(
      new ConfigService({
        FILE_STORAGE_ROOT: tempRoot,
      }),
    );

    await expect(
      service.storeRepairPhoto({
        repairId: 'repair-4',
        file: imageFile({
          size: MAX_REPAIR_PHOTO_SIZE_BYTES + 1,
          buffer: Buffer.alloc(MAX_REPAIR_PHOTO_SIZE_BYTES + 1),
        }),
      }),
    ).rejects.toBeInstanceOf(InvalidRepairPhotoFileError);
  });
});
