import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PhotoStorageProvider } from '@prisma/client';
import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { randomUUID } from 'node:crypto';
import * as path from 'node:path';
import {
  InvalidRepairPhotoFileError,
  MAX_REPAIR_PHOTO_SIZE_BYTES,
  RepairPhotoDeleteFailedError,
  RepairPhotoStorageConfigurationError,
  RepairPhotoUploadFailedError,
  StoreRepairPhotoInput,
  RepairPhotoContent,
  RepairPhotoViewUrl,
  StoredRepairPhotoInternal,
  StoredRepairPhoto,
  SUPPORTED_REPAIR_PHOTO_CONTENT_TYPES,
  SupportedRepairPhotoContentType,
} from './storage.types';

const REPAIR_PHOTO_VIEW_URL_EXPIRY_SECONDS = 10 * 60;

interface MinioConnectionConfig {
  endPoint: string;
  port: number;
  useSSL: boolean;
  accessKey: string;
  secretKey: string;
  bucket: string;
  region: string;
  publicBaseUrl: string | null;
}

@Injectable()
export class StorageService {
  private readonly fileStorageRoot: string;
  private readonly minioConfig: MinioConnectionConfig | null;
  private readonly minioClient: S3Client | null;
  private readonly isProduction: boolean;

  constructor(private readonly configService: ConfigService) {
    this.isProduction =
      this.configService.get<string>('NODE_ENV')?.trim() === 'production';

    const configuredFileRoot = this.configService
      .get<string>('FILE_STORAGE_ROOT')
      ?.trim();

    this.fileStorageRoot = configuredFileRoot
      ? path.resolve(process.cwd(), configuredFileRoot)
      : path.resolve(process.cwd(), 'storage', 'uploads');

    this.assertProductionStorageConfig();
    this.minioConfig = this.resolveMinioConfig();

    if (this.isProduction && this.minioConfig === null) {
      throw new RepairPhotoStorageConfigurationError(
        'Production photo storage requires a valid S3/MinIO configuration; filesystem and public URL fallback are disabled.',
      );
    }

    this.minioClient = this.minioConfig
      ? new S3Client({
          endpoint: `${this.minioConfig.useSSL ? 'https' : 'http'}://${
            this.minioConfig.endPoint
          }:${this.minioConfig.port}`,
          // MinIO addresses buckets as a path segment rather than a subdomain,
          // so virtual-hosted style (the SDK default) would not resolve.
          forcePathStyle: true,
          // MinIO ignores the region but the SDK requires one to sign requests.
          region: this.minioConfig.region,
          credentials: {
            accessKeyId: this.minioConfig.accessKey,
            secretAccessKey: this.minioConfig.secretKey,
          },
        })
      : null;
  }

  async storeRepairPhoto(
    input: StoreRepairPhotoInput,
  ): Promise<StoredRepairPhotoInternal> {
    this.validateFile(input.file);

    const contentType = input.file.mimetype as SupportedRepairPhotoContentType;
    const extension = this.resolveFileExtension(
      input.file.originalname,
      contentType,
    );
    const objectKey = this.buildObjectKey(input.repairId, extension);

    if (this.minioClient !== null && this.minioConfig !== null) {
      try {
        await this.ensureBucketExists();
        await this.minioClient.send(
          new PutObjectCommand({
            Bucket: this.minioConfig.bucket,
            Key: objectKey,
            Body: input.file.buffer,
            ContentLength: input.file.size,
            ContentType: contentType,
          }),
        );

        return {
          storageProvider: PhotoStorageProvider.MINIO,
          objectKey,
          bucket: this.minioConfig.bucket,
          filesystemPath: null,
          publicUrl: this.isProduction
            ? null
            : this.buildMinioPublicUrl(objectKey),
          originalFilename: input.file.originalname || null,
          contentType,
          sizeBytes: input.file.size,
          cleanup: async () => {
            await this.minioClient?.send(
              new DeleteObjectCommand({
                Bucket: this.minioConfig!.bucket,
                Key: objectKey,
              }),
            );
          },
        };
      } catch {
        if (this.isProduction) {
          throw new RepairPhotoUploadFailedError(
            'Repair photo upload could not be completed with configured S3/MinIO storage',
          );
        }

        // Primary storage is best-effort. Filesystem fallback handles
        // local development and temporary MinIO unavailability.
      }
    }

    return this.storeOnFilesystem({
      repairId: input.repairId,
      file: input.file,
      objectKey,
      contentType,
    });
  }

  async cleanupStoredPhoto(photo: StoredRepairPhotoInternal): Promise<void> {
    await photo.cleanup();
  }

  async deleteStoredRepairPhoto(
    photo: Pick<
      StoredRepairPhoto,
      'storageProvider' | 'objectKey' | 'bucket' | 'filesystemPath'
    >,
  ): Promise<void> {
    try {
      if (
        photo.storageProvider === PhotoStorageProvider.MINIO &&
        this.minioClient !== null
      ) {
        await this.minioClient.send(
          new DeleteObjectCommand({
            Bucket: photo.bucket,
            Key: photo.objectKey,
          }),
        );
        return;
      }

      if (
        photo.storageProvider === PhotoStorageProvider.FILESYSTEM &&
        photo.filesystemPath
      ) {
        const absolutePath = path.resolve(
          this.fileStorageRoot,
          photo.filesystemPath,
        );

        if (!absolutePath.startsWith(this.fileStorageRoot)) {
          throw new Error('Photo path escapes storage root');
        }

        await rm(absolutePath, { force: true });
        return;
      }
    } catch {
      throw new RepairPhotoDeleteFailedError(
        'Repair photo could not be deleted from storage',
      );
    }
  }

  /**
   * Reads a stored photo back so the API can stream it to the browser.
   *
   * Signed object-store URLs point at the storage endpoint, which stays on the
   * private Docker network and is unreachable from a browser outside the host.
   * Serving the bytes through the API keeps the bucket private while making
   * photos viewable wherever the API itself is reachable.
   */
  async readStoredRepairPhoto(
    photo: Pick<
      StoredRepairPhoto,
      'storageProvider' | 'objectKey' | 'bucket' | 'filesystemPath'
    > & {
      // Nullable on the stored record, unlike StoredRepairPhoto.
      contentType: string | null;
      sizeBytes: number | null;
      originalFilename: string | null;
    },
  ): Promise<RepairPhotoContent | null> {
    const contentType = photo.contentType || 'application/octet-stream';

    if (
      photo.storageProvider === PhotoStorageProvider.MINIO &&
      this.minioClient !== null
    ) {
      try {
        const result = await this.minioClient.send(
          new GetObjectCommand({
            Bucket: photo.bucket,
            Key: photo.objectKey,
          }),
        );

        if (!result.Body) {
          return null;
        }

        return {
          stream: result.Body as NodeJS.ReadableStream,
          contentType: result.ContentType || contentType,
          sizeBytes: result.ContentLength ?? photo.sizeBytes ?? null,
          filename: photo.originalFilename ?? null,
        };
      } catch {
        return null;
      }
    }

    if (
      photo.storageProvider === PhotoStorageProvider.FILESYSTEM &&
      photo.filesystemPath
    ) {
      const absolutePath = path.resolve(
        this.fileStorageRoot,
        photo.filesystemPath,
      );

      if (!absolutePath.startsWith(this.fileStorageRoot)) {
        return null;
      }

      try {
        return {
          stream: createReadStream(absolutePath),
          contentType,
          sizeBytes: photo.sizeBytes ?? null,
          filename: photo.originalFilename ?? null,
        };
      } catch {
        return null;
      }
    }

    return null;
  }

  async createRepairPhotoViewUrl(
    photo: Pick<
      StoredRepairPhoto,
      'storageProvider' | 'objectKey' | 'bucket' | 'publicUrl'
    >,
  ): Promise<RepairPhotoViewUrl> {
    if (
      photo.storageProvider === PhotoStorageProvider.MINIO &&
      this.minioClient !== null
    ) {
      try {
        const url = await getSignedUrl(
          this.minioClient,
          new GetObjectCommand({
            Bucket: photo.bucket,
            Key: photo.objectKey,
          }),
          { expiresIn: REPAIR_PHOTO_VIEW_URL_EXPIRY_SECONDS },
        );

        return {
          url,
          expiresAt: new Date(
            Date.now() + REPAIR_PHOTO_VIEW_URL_EXPIRY_SECONDS * 1000,
          ).toISOString(),
          source: 'SIGNED',
        };
      } catch {
        if (this.isProduction) {
          throw new RepairPhotoStorageConfigurationError(
            'Production repair photo signed URL could not be created from configured S3/MinIO storage',
          );
        }

        // Fall back to an existing public URL if the object store cannot sign.
      }
    }

    if (this.isProduction) {
      throw new RepairPhotoStorageConfigurationError(
        'Production repair photo access requires a backend-generated signed URL; public URL fallback is disabled.',
      );
    }

    if (photo.publicUrl) {
      return {
        url: photo.publicUrl,
        expiresAt: null,
        source: 'PUBLIC',
      };
    }

    return {
      url: null,
      expiresAt: null,
      source: 'UNAVAILABLE',
    };
  }

  private assertProductionStorageConfig(): void {
    if (!this.isProduction) {
      return;
    }

    const requiredKeys = [
      'S3_ENDPOINT',
      'S3_BUCKET',
      'S3_ACCESS_KEY',
      'S3_SECRET_KEY',
      'S3_USE_SSL',
    ];
    const missingKeys = requiredKeys.filter(
      (key) => !this.configService.get<string>(key)?.trim(),
    );
    const sslFlag = this.configService.get<string>('S3_USE_SSL')?.trim();

    if (
      missingKeys.length > 0 ||
      (sslFlag !== undefined && !['true', 'false'].includes(sslFlag))
    ) {
      throw new RepairPhotoStorageConfigurationError(
        'Production photo storage requires S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY, S3_SECRET_KEY, and S3_USE_SSL=true|false.',
      );
    }
  }

  private validateFile(
    file: Express.Multer.File | undefined,
  ): asserts file is Express.Multer.File {
    if (!file) {
      throw new InvalidRepairPhotoFileError('A photo file is required');
    }

    if (!file.mimetype) {
      throw new InvalidRepairPhotoFileError(
        'Uploaded file is not a valid image',
      );
    }

    if (
      !SUPPORTED_REPAIR_PHOTO_CONTENT_TYPES.includes(
        file.mimetype as SupportedRepairPhotoContentType,
      )
    ) {
      throw new InvalidRepairPhotoFileError(
        'Only JPEG, PNG, and WebP images are supported',
      );
    }

    if (file.size <= 0 || !file.buffer || file.buffer.length === 0) {
      throw new InvalidRepairPhotoFileError('Uploaded file is empty');
    }

    if (file.size > MAX_REPAIR_PHOTO_SIZE_BYTES) {
      throw new InvalidRepairPhotoFileError('Photo file exceeds the 5MB limit');
    }
  }

  private async ensureBucketExists(): Promise<void> {
    if (this.minioClient === null || this.minioConfig === null) {
      return;
    }

    try {
      await this.minioClient.send(
        new HeadBucketCommand({ Bucket: this.minioConfig.bucket }),
      );
    } catch {
      // HeadBucket throws when the bucket is missing; the SDK has no boolean
      // "exists" call, so creation is attempted on any lookup failure.
      await this.minioClient.send(
        new CreateBucketCommand({ Bucket: this.minioConfig.bucket }),
      );
    }
  }

  private async storeOnFilesystem(input: {
    repairId: string;
    file: Express.Multer.File;
    objectKey: string;
    contentType: SupportedRepairPhotoContentType;
  }): Promise<StoredRepairPhotoInternal> {
    try {
      const relativePath = path.join(
        'repair-photos',
        input.repairId,
        path.basename(input.objectKey),
      );
      const absolutePath = path.join(this.fileStorageRoot, relativePath);

      await mkdir(path.dirname(absolutePath), { recursive: true });
      await writeFile(absolutePath, input.file.buffer);

      return {
        storageProvider: PhotoStorageProvider.FILESYSTEM,
        objectKey: input.objectKey,
        bucket: 'filesystem',
        filesystemPath: relativePath.replace(/\\/g, '/'),
        publicUrl: null,
        originalFilename: input.file.originalname || null,
        contentType: input.contentType,
        sizeBytes: input.file.size,
        cleanup: async () => {
          await rm(absolutePath, { force: true });
        },
      };
    } catch {
      throw new RepairPhotoUploadFailedError(
        'Repair photo upload could not be completed',
      );
    }
  }

  private buildObjectKey(repairId: string, extension: string): string {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const random = randomUUID().slice(0, 8);

    return `repair-photos/${repairId}/${timestamp}-${random}${extension}`;
  }

  private resolveFileExtension(
    originalFilename: string | undefined,
    contentType: SupportedRepairPhotoContentType,
  ): string {
    const originalExtension = path
      .extname(originalFilename ?? '')
      .toLowerCase();

    if (originalExtension === '.jpg' || originalExtension === '.jpeg') {
      return '.jpg';
    }

    if (originalExtension === '.png') {
      return '.png';
    }

    if (originalExtension === '.webp') {
      return '.webp';
    }

    switch (contentType) {
      case 'image/jpeg':
        return '.jpg';
      case 'image/png':
        return '.png';
      case 'image/webp':
        return '.webp';
    }
  }

  private resolveMinioConfig(): MinioConnectionConfig | null {
    const endpointRaw = this.configService.get<string>('S3_ENDPOINT')?.trim();
    const bucket = this.configService.get<string>('S3_BUCKET')?.trim();
    const accessKey = this.configService.get<string>('S3_ACCESS_KEY')?.trim();
    const secretKey = this.configService.get<string>('S3_SECRET_KEY')?.trim();
    const sslFlag = this.configService.get<string>('S3_USE_SSL')?.trim();

    if (!endpointRaw || !bucket || !accessKey || !secretKey) {
      return null;
    }

    const parsedUrl = this.parseEndpoint(endpointRaw, sslFlag);

    if (!parsedUrl) {
      return null;
    }

    const useSSL =
      sslFlag !== undefined
        ? sslFlag.toLowerCase() === 'true'
        : parsedUrl.protocol === 'https:';

    const port =
      parsedUrl.port !== '' ? Number(parsedUrl.port) : useSSL ? 443 : 80;

    if (!Number.isFinite(port) || port <= 0) {
      return null;
    }

    return {
      endPoint: parsedUrl.hostname,
      port,
      useSSL,
      accessKey,
      secretKey,
      bucket,
      // MinIO does not use regions; real S3 deployments set S3_REGION.
      region: this.configService.get<string>('S3_REGION')?.trim() || 'us-east-1',
      publicBaseUrl: `${parsedUrl.protocol}//${parsedUrl.host}`,
    };
  }

  private parseEndpoint(endpointRaw: string, sslFlag?: string): URL | null {
    const hasProtocol = endpointRaw.includes('://');
    const protocol =
      sslFlag?.toLowerCase() === 'true'
        ? 'https://'
        : sslFlag?.toLowerCase() === 'false'
          ? 'http://'
          : 'http://';

    try {
      return new URL(hasProtocol ? endpointRaw : `${protocol}${endpointRaw}`);
    } catch {
      return null;
    }
  }

  private buildMinioPublicUrl(objectKey: string): string | null {
    if (this.minioConfig?.publicBaseUrl === null) {
      return null;
    }

    return `${this.minioConfig?.publicBaseUrl}/${this.minioConfig?.bucket}/${objectKey}`;
  }
}
