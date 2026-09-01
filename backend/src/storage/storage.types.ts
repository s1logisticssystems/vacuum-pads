import { PhotoStorageProvider } from '@prisma/client';

export const MAX_REPAIR_PHOTO_SIZE_BYTES = 5 * 1024 * 1024;

export const SUPPORTED_REPAIR_PHOTO_CONTENT_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

export type SupportedRepairPhotoContentType =
  (typeof SUPPORTED_REPAIR_PHOTO_CONTENT_TYPES)[number];

export interface StoreRepairPhotoInput {
  repairId: string;
  file: Express.Multer.File;
}

export interface StoredRepairPhoto {
  storageProvider: PhotoStorageProvider;
  objectKey: string;
  bucket: string;
  filesystemPath: string | null;
  publicUrl: string | null;
  originalFilename: string | null;
  contentType: string;
  sizeBytes: number;
}

export interface StoredRepairPhotoInternal extends StoredRepairPhoto {
  cleanup: () => Promise<void>;
}

export type RepairPhotoViewUrlSource =
  | 'PROXY'
  | 'SIGNED'
  | 'PUBLIC'
  | 'UNAVAILABLE';

export interface RepairPhotoViewUrl {
  url: string | null;
  expiresAt: string | null;
  source: RepairPhotoViewUrlSource;
}

/** A repair photo's bytes, streamed back through the API. */
export interface RepairPhotoContent {
  stream: NodeJS.ReadableStream;
  contentType: string;
  sizeBytes: number | null;
  filename: string | null;
}

export class InvalidRepairPhotoFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidRepairPhotoFileError';
  }
}

export class RepairPhotoUploadFailedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RepairPhotoUploadFailedError';
  }
}

export class RepairPhotoStorageConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RepairPhotoStorageConfigurationError';
  }
}

export class RepairPhotoDeleteFailedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RepairPhotoDeleteFailedError';
  }
}
