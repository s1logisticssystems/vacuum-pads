import {
  ConflictException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AuditAction,
  LocationStatus,
  MovementType,
  OperationalStatus,
  PhotoStorageProvider,
  Prisma,
  RackLocationType,
  RepairPhotoStage,
  RepairPriority,
  RepairOutcome,
  RepairStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { QrService } from '../qr/qr.service';
import { StorageService } from '../storage/storage.service';
import {
  InvalidRepairPhotoFileError,
  RepairPhotoDeleteFailedError,
  RepairPhotoUploadFailedError,
  StoredRepairPhotoInternal,
} from '../storage/storage.types';
import { FcmNotificationService } from '../notifications/fcm-notification.service';
import {
  QrEntityType,
  QrScanContext,
  QrScanErrorResponse,
  RackScanEntity,
  VacuumDisplayStatus,
  VacuumScanEntity,
} from '../qr/qr.types';
import { FaultDeclarationDto } from './dto/fault-declaration.dto';
import { FaultDeclarationPreviewDto } from './dto/fault-declaration-preview.dto';
import { FaultRestorationDto } from './dto/fault-restoration.dto';
import { FaultRestorationPreviewDto } from './dto/fault-restoration-preview.dto';
import { RepairPhotoUploadDto } from './dto/repair-photo-upload.dto';

const MAX_REPAIR_PHOTOS_PER_STAGE = 5;

export type FaultDeclarationPreviewDecision =
  | 'CAN_DECLARE_FAULT'
  | 'SELECT_FAULT'
  | 'MUST_DECHARGE_FIRST'
  | 'ALREADY_IN_REPAIR'
  | 'NOT_VALID_FOR_FAULT'
  | 'VACUUM_NOT_FOUND'
  | 'RACK_NOT_FOUND'
  | 'RACK_OCCUPIED'
  | 'RACK_NOT_ALLOWED'
  | 'FAULT_CATALOG_NOT_FOUND'
  | 'INVALID_REQUEST';

export type FaultDeclarationWriteDecision =
  | FaultDeclarationPreviewDecision
  | 'FAULT_DECLARED';

export type FaultDeclarationPreviewNextAction =
  | 'SELECT_FAULT'
  | 'CAPTURE_PHOTO_OPTIONAL'
  | 'NONE';

export type FaultRestorationPreviewDecision =
  | 'CAN_RESTORE'
  | 'SELECT_RACK'
  | 'NOT_IN_REPAIR'
  | 'ACTIVE_MUST_DECHARGE_FIRST'
  | 'VACUUM_NOT_FOUND'
  | 'REPAIR_NOT_FOUND'
  | 'RACK_NOT_FOUND'
  | 'RACK_OCCUPIED'
  | 'RACK_NOT_ALLOWED'
  | 'INVALID_REQUEST';

export type FaultRestorationPreviewNextAction =
  | 'SCAN_RACK'
  | 'CONFIRM_RESTORATION'
  | 'NONE';

export type FaultRestorationWriteDecision =
  | FaultRestorationPreviewDecision
  | 'COMPLETION_PHOTO_REQUIRED'
  | 'RESTORED'
  | 'RESTORED_OUT_OF_SERVICE'
  | 'RETIRED'
  | 'UNRESOLVED_STILL_IN_REPAIR';

export interface FaultCatalogSummary {
  id: string;
  code: string;
  label: string;
  description: string | null;
  sortOrder: number;
}

export interface FaultDeclarationPreviewResponse {
  ok: boolean;
  decision: FaultDeclarationPreviewDecision;
  message: string;
  vacuum: VacuumScanEntity | null;
  rack: RackScanEntity | null;
  faultCatalog: FaultCatalogSummary | null;
  requiredNextAction: FaultDeclarationPreviewNextAction;
}

export interface FaultCatalogListResponse {
  items: FaultCatalogSummary[];
}

export interface FaultRestorationRepairSummary {
  id: string;
  status: RepairStatus;
  priority: RepairPriority;
  problemDescription: string;
  faultOtherText: string | null;
  operatorName: string | null;
  reportedAt: string;
  faultCatalog: FaultCatalogSummary | null;
}

export interface FaultRestorationPreviewResponse {
  ok: boolean;
  decision: FaultRestorationPreviewDecision;
  message: string;
  vacuum: VacuumScanEntity | null;
  repair: FaultRestorationRepairSummary | null;
  rack: RackScanEntity | null;
  requiredNextAction: FaultRestorationPreviewNextAction;
}

export type RepairPhotoUploadDecision =
  | 'REPAIR_NOT_FOUND'
  | 'REPAIR_CLOSED'
  | 'MAX_PHOTOS_REACHED'
  | 'INVALID_FILE'
  | 'UPLOAD_FAILED'
  | 'INVALID_REQUEST';

export interface RepairPhotoUploadSuccessResponse {
  ok: true;
  photo: {
    id: string;
    repairId: string;
    objectKey: string;
    bucket: string;
    originalFilename: string | null;
    contentType: string | null;
    sizeBytes: number | null;
    caption: string | null;
    operatorName: string | null;
    stage: RepairPhotoStage;
    storageProvider: PhotoStorageProvider;
    filesystemPath: string | null;
    publicUrl: string | null;
    createdAt: string;
  };
  storage: {
    provider: PhotoStorageProvider;
  };
}

export interface RepairPhotoUploadErrorResponse {
  ok: false;
  decision: RepairPhotoUploadDecision;
  message: string;
}

interface RepairPhotoUploadErrorResponseInternal extends RepairPhotoUploadErrorResponse {
  httpStatus: number;
}

export type RepairPhotoUploadResponse =
  | RepairPhotoUploadSuccessResponse
  | RepairPhotoUploadErrorResponseInternal;

export interface RepairPhotoListItem {
  id: string;
  filename: string | null;
  contentType: string | null;
  sizeBytes: number | null;
  caption: string | null;
  operatorName: string | null;
  stage: RepairPhotoStage;
  storageProvider: PhotoStorageProvider;
  createdAt: string;
  url: string | null;
  urlExpiresAt: string | null;
  urlSource: string;
}

export interface RepairPhotoListResponse {
  repairId: string;
  photos: RepairPhotoListItem[];
  faultDeclarationPhotos: RepairPhotoListItem[];
  repairCompletionPhotos: RepairPhotoListItem[];
}

export interface FaultRestorationSuccessResponse {
  ok: true;
  decision:
    | 'RESTORED'
    | 'RESTORED_OUT_OF_SERVICE'
    | 'RETIRED'
    | 'UNRESOLVED_STILL_IN_REPAIR';
  repair: {
    id: string;
    vacuumPadId: string;
    status: RepairStatus;
    priority: RepairPriority;
    outcome: RepairOutcome | null;
    problemDescription: string;
    faultCatalogId: string | null;
    faultOtherText: string | null;
    operatorName: string | null;
    reportedAt: string;
    completedAt: string | null;
    technicianNotes: string | null;
    repairActions: string | null;
    spareParts: string | null;
    repairCost: string | null;
    faultCatalog: FaultCatalogSummary | null;
  };
  vacuum: VacuumScanEntity;
  rack: RackScanEntity;
  movement: {
    id: string;
    movementType: MovementType;
    vacuumPadId: string;
    fromRackLocationId: string | null;
    toRackLocationId: string | null;
    previousLocationStatus: LocationStatus | null;
    newLocationStatus: LocationStatus | null;
    previousOperationalStatus: OperationalStatus | null;
    newOperationalStatus: OperationalStatus | null;
    deviceId: string | null;
    operatorName: string | null;
    note: string | null;
    createdAt: string;
  };
  auditLog: {
    id: string;
    action: AuditAction;
    entityType: string;
    entityId: string;
    deviceId: string | null;
    operatorName: string | null;
    createdAt: string;
  };
}

export interface FaultDeclarationSuccessResponse {
  ok: true;
  decision: 'FAULT_DECLARED';
  repair: {
    id: string;
    vacuumPadId: string;
    status: RepairStatus;
    priority: RepairPriority;
    problemDescription: string;
    faultCatalogId: string | null;
    faultOtherText: string | null;
    operatorName: string | null;
    reportedAt: string;
    faultCatalog: FaultCatalogSummary | null;
  };
  vacuum: VacuumScanEntity;
  rack: RackScanEntity | null;
  movement: {
    id: string;
    movementType: MovementType;
    vacuumPadId: string;
    fromRackLocationId: string | null;
    toRackLocationId: string | null;
    previousLocationStatus: LocationStatus | null;
    newLocationStatus: LocationStatus | null;
    previousOperationalStatus: OperationalStatus | null;
    newOperationalStatus: OperationalStatus | null;
    deviceId: string | null;
    operatorName: string | null;
    note: string | null;
    createdAt: string;
  };
  auditLog: {
    id: string;
    action: AuditAction;
    entityType: string;
    entityId: string;
    deviceId: string | null;
    operatorName: string | null;
    createdAt: string;
  };
  requiredNextAction: 'NONE' | 'UPLOAD_PHOTO_OPTIONAL';
}

export interface FaultDeclarationErrorResponse {
  ok: false;
  decision: Exclude<FaultDeclarationWriteDecision, 'FAULT_DECLARED'>;
  message: string;
}

export interface FaultDeclarationErrorResponseInternal extends FaultDeclarationErrorResponse {
  httpStatus: number;
}

export type FaultDeclarationResponse =
  | FaultDeclarationSuccessResponse
  | FaultDeclarationErrorResponseInternal;

export interface FaultRestorationErrorResponse {
  ok: false;
  decision: Exclude<
    FaultRestorationWriteDecision,
    | 'RESTORED'
    | 'RESTORED_OUT_OF_SERVICE'
    | 'RETIRED'
    | 'UNRESOLVED_STILL_IN_REPAIR'
  >;
  message: string;
}

interface FaultRestorationErrorResponseInternal extends FaultRestorationErrorResponse {
  httpStatus: number;
}

export type FaultRestorationResponse =
  | FaultRestorationSuccessResponse
  | FaultRestorationErrorResponseInternal;

type FaultCatalogRecord = Prisma.FaultCatalogGetPayload<{
  select: {
    id: true;
    code: true;
    label: true;
    description: true;
    sortOrder: true;
  };
}>;

type VacuumRecord = Prisma.VacuumPadGetPayload<{
  select: typeof QrService.vacuumSelect;
}>;

type RackRecord = Prisma.RackLocationGetPayload<{
  select: typeof QrService.rackSelect;
}>;

type RepairRecord = Prisma.RepairGetPayload<{
  select: {
    id: true;
    vacuumPadId: true;
    status: true;
    priority: true;
    problemDescription: true;
    faultCatalogId: true;
    faultOtherText: true;
    operatorName: true;
    reportedAt: true;
  };
}>;

type RepairRestoreRecord = Prisma.RepairGetPayload<{
  select: {
    id: true;
    vacuumPadId: true;
    status: true;
    priority: true;
    outcome: true;
    problemDescription: true;
    faultCatalogId: true;
    faultOtherText: true;
    operatorName: true;
    reportedAt: true;
    completedAt: true;
    technicianNotes: true;
    repairActions: true;
    spareParts: true;
    repairCost: true;
    faultCatalog: {
      select: {
        id: true;
        code: true;
        label: true;
        description: true;
        sortOrder: true;
      };
    };
  };
}>;

type RepairPhotoRecord = Prisma.RepairPhotoGetPayload<{
  select: {
    id: true;
    repairId: true;
    objectKey: true;
    bucket: true;
    originalFilename: true;
    contentType: true;
    sizeBytes: true;
    caption: true;
    operatorName: true;
    stage: true;
    storageProvider: true;
    filesystemPath: true;
    publicUrl: true;
    createdAt: true;
  };
}>;

type OpenRepairPreviewRecord = Prisma.RepairGetPayload<{
  select: {
    id: true;
    status: true;
    priority: true;
    problemDescription: true;
    faultOtherText: true;
    operatorName: true;
    reportedAt: true;
    faultCatalog: {
      select: {
        id: true;
        code: true;
        label: true;
        description: true;
        sortOrder: true;
      };
    };
  };
}>;

type TransactionClient = Prisma.TransactionClient;

@Injectable()
export class FaultService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly qrService: QrService,
    private readonly storageService: StorageService,
    private readonly notificationService: FcmNotificationService,
  ) {}

  async previewDeclaration(
    dto: FaultDeclarationPreviewDto,
  ): Promise<FaultDeclarationPreviewResponse> {
    const operatorName = this.normalizeOptional(dto.operatorName);
    const rackQr = this.normalizeOptional(dto.rackQr);
    const faultCatalogId = this.normalizeOptional(dto.faultCatalogId);
    const faultCatalogCode = this.normalizeOptional(dto.faultCatalogCode);
    const faultOtherText = this.normalizeOptional(dto.faultOtherText);

    const vacuumLookup = await this.qrService.scan({
      raw: dto.vacuumQr,
      context: QrScanContext.FAULT_REPORT,
      deviceId: dto.deviceId,
      operatorName,
    });

    if (!vacuumLookup.ok) {
      return this.mapVacuumLookupError(vacuumLookup);
    }

    if (vacuumLookup.entityType !== QrEntityType.VACUUM) {
      return this.buildPreviewResponse({
        ok: false,
        decision: 'INVALID_REQUEST',
        message: 'The provided vacuum QR is not a vacuum identifier',
        vacuum: null,
        rack: null,
        faultCatalog: null,
        requiredNextAction: 'NONE',
      });
    }

    const vacuum = vacuumLookup.entity as VacuumScanEntity;

    if (
      vacuum.currentMachine !== null ||
      vacuum.locationStatus === 'ON_MACHINE'
    ) {
      return this.buildPreviewResponse({
        ok: false,
        decision: 'MUST_DECHARGE_FIRST',
        message: 'Vacuum must be decharged before fault declaration',
        vacuum,
        rack: null,
        faultCatalog: null,
        requiredNextAction: 'NONE',
      });
    }

    if (
      this.isPendingFaultDeclarationState(vacuum) &&
      (await this.hasOpenRepair(this.prismaService, vacuum.id))
    ) {
      return this.buildPreviewResponse({
        ok: false,
        decision: 'ALREADY_IN_REPAIR',
        message: 'Vacuum is already in repair',
        vacuum,
        rack: null,
        faultCatalog: null,
        requiredNextAction: 'NONE',
      });
    }

    if (
      !this.isPendingFaultDeclarationState(vacuum) &&
      (vacuum.locationStatus === LocationStatus.IN_REPAIR ||
        vacuum.operationalStatus === OperationalStatus.UNDER_REPAIR)
    ) {
      return this.buildPreviewResponse({
        ok: false,
        decision: 'ALREADY_IN_REPAIR',
        message: 'Vacuum is already in repair',
        vacuum,
        rack: null,
        faultCatalog: null,
        requiredNextAction: 'NONE',
      });
    }

    if (
      vacuum.operationalStatus === OperationalStatus.OUT_OF_SERVICE ||
      vacuum.operationalStatus === OperationalStatus.RETIRED
    ) {
      return this.buildPreviewResponse({
        ok: false,
        decision: 'NOT_VALID_FOR_FAULT',
        message: 'Vacuum is not valid for normal fault declaration',
        vacuum,
        rack: null,
        faultCatalog: null,
        requiredNextAction: 'NONE',
      });
    }

    const rackResult = rackQr
      ? await this.lookupRackByScanValue(this.prismaService, rackQr)
      : null;

    if (rackResult && !rackResult.ok) {
      return this.buildPreviewResponse({
        ok: false,
        decision: rackResult.decision,
        message: rackResult.message,
        vacuum,
        rack: null,
        faultCatalog: null,
        requiredNextAction: 'NONE',
      });
    }

    const rack = rackResult?.ok ? this.mapRackRecord(rackResult.rack) : null;

    if (rack && rack.type !== RackLocationType.REP) {
      return this.buildPreviewResponse({
        ok: false,
        decision: 'RACK_NOT_ALLOWED',
        message: 'Selected rack is not a repair rack',
        vacuum,
        rack,
        faultCatalog: null,
        requiredNextAction: 'NONE',
      });
    }

    if (rack && rack.currentPad !== null && rack.currentPad.id !== vacuum.id) {
      return this.buildPreviewResponse({
        ok: false,
        decision: 'RACK_OCCUPIED',
        message: 'Selected rack is already occupied',
        vacuum,
        rack,
        faultCatalog: null,
        requiredNextAction: 'NONE',
      });
    }

    if (!faultCatalogId && !faultCatalogCode && !faultOtherText) {
      return this.buildPreviewResponse({
        ok: true,
        decision: 'SELECT_FAULT',
        message:
          rack === null
            ? 'Vacuum is eligible. Select a fault category or enter other fault details'
            : 'Vacuum and repair rack are eligible. Select a fault category or enter other fault details',
        vacuum,
        rack,
        faultCatalog: null,
        requiredNextAction: 'SELECT_FAULT',
      });
    }

    const selectedCatalog = await this.resolveFaultCatalog(
      this.prismaService,
      faultCatalogId,
      faultCatalogCode,
    );

    if (!selectedCatalog.ok) {
      return this.buildPreviewResponse({
        ok: false,
        decision: selectedCatalog.decision,
        message: selectedCatalog.message,
        vacuum,
        rack,
        faultCatalog: null,
        requiredNextAction: 'NONE',
      });
    }

    return this.buildPreviewResponse({
      ok: true,
      decision: 'CAN_DECLARE_FAULT',
      message: 'Vacuum is eligible for fault declaration',
      vacuum,
      rack,
      faultCatalog: selectedCatalog.catalog
        ? this.mapFaultCatalog(selectedCatalog.catalog)
        : null,
      requiredNextAction: 'CAPTURE_PHOTO_OPTIONAL',
    });
  }

  async previewRestoration(
    dto: FaultRestorationPreviewDto,
  ): Promise<FaultRestorationPreviewResponse> {
    const operatorName = this.normalizeOptional(dto.operatorName);
    const rackQr = this.normalizeOptional(dto.rackQr);

    const vacuumLookup = await this.qrService.scan({
      raw: dto.vacuumQr,
      context: QrScanContext.FAULT_RESTORE,
      deviceId: dto.deviceId,
      operatorName,
    });

    if (!vacuumLookup.ok) {
      return this.mapRestorationVacuumLookupError(vacuumLookup);
    }

    if (vacuumLookup.entityType !== QrEntityType.VACUUM) {
      return this.buildRestorationPreviewResponse({
        ok: false,
        decision: 'INVALID_REQUEST',
        message: 'The provided vacuum QR is not a vacuum identifier',
        vacuum: null,
        repair: null,
        rack: null,
        requiredNextAction: 'NONE',
      });
    }

    const vacuum = vacuumLookup.entity as VacuumScanEntity;

    if (
      vacuum.currentMachine !== null ||
      vacuum.locationStatus === LocationStatus.ON_MACHINE
    ) {
      return this.buildRestorationPreviewResponse({
        ok: false,
        decision: 'ACTIVE_MUST_DECHARGE_FIRST',
        message: 'Vacuum must be decharged before restoration',
        vacuum,
        repair: null,
        rack: null,
        requiredNextAction: 'NONE',
      });
    }

    if (
      vacuum.locationStatus !== LocationStatus.IN_REPAIR &&
      vacuum.operationalStatus !== OperationalStatus.UNDER_REPAIR
    ) {
      return this.buildRestorationPreviewResponse({
        ok: false,
        decision: 'NOT_IN_REPAIR',
        message: 'Vacuum is not currently in repair',
        vacuum,
        repair: null,
        rack: null,
        requiredNextAction: 'NONE',
      });
    }

    const openRepair = await this.prismaService.repair.findFirst({
      where: {
        vacuumPadId: vacuum.id,
        completedAt: null,
        status: {
          in: [
            RepairStatus.REPORTED,
            RepairStatus.ASSIGNED,
            RepairStatus.UNDER_REPAIR,
          ],
        },
      },
      orderBy: [{ reportedAt: 'desc' }, { createdAt: 'desc' }],
      select: {
        id: true,
        status: true,
        priority: true,
        problemDescription: true,
        faultOtherText: true,
        operatorName: true,
        reportedAt: true,
        faultCatalog: {
          select: {
            id: true,
            code: true,
            label: true,
            description: true,
            sortOrder: true,
          },
        },
      },
    });

    if (!openRepair) {
      return this.buildRestorationPreviewResponse({
        ok: false,
        decision: 'REPAIR_NOT_FOUND',
        message: 'No active repair record found for this vacuum',
        vacuum,
        repair: null,
        rack: null,
        requiredNextAction: 'NONE',
      });
    }

    const repair = this.mapRepairPreview(openRepair);

    if (!rackQr) {
      return this.buildRestorationPreviewResponse({
        ok: true,
        decision: 'SELECT_RACK',
        message:
          'Vacuum is eligible for restoration. Scan an AVL rack to continue',
        vacuum,
        repair,
        rack: null,
        requiredNextAction: 'SCAN_RACK',
      });
    }

    const rackResult = await this.lookupRackByScanValue(
      this.prismaService,
      rackQr,
    );

    if (!rackResult.ok) {
      return this.buildRestorationPreviewResponse({
        ok: false,
        decision: rackResult.decision,
        message: rackResult.message,
        vacuum,
        repair,
        rack: null,
        requiredNextAction: 'NONE',
      });
    }

    const rack = this.mapRackRecord(rackResult.rack);

    if (rack.currentPad !== null && rack.currentPad.id !== vacuum.id) {
      return this.buildRestorationPreviewResponse({
        ok: false,
        decision: 'RACK_OCCUPIED',
        message: 'Selected rack is already occupied',
        vacuum,
        repair,
        rack,
        requiredNextAction: 'NONE',
      });
    }

    if (rack.type === RackLocationType.REP) {
      return this.buildRestorationPreviewResponse({
        ok: false,
        decision: 'RACK_NOT_ALLOWED',
        message: 'Selected rack is not allowed for restoration',
        vacuum,
        repair,
        rack,
        requiredNextAction: 'NONE',
      });
    }

    return this.buildRestorationPreviewResponse({
      ok: true,
      decision: 'CAN_RESTORE',
      message: 'Vacuum can be restored to the selected rack',
      vacuum,
      repair,
      rack,
      requiredNextAction: 'CONFIRM_RESTORATION',
    });
  }

  async declare(dto: FaultDeclarationDto): Promise<FaultDeclarationResponse> {
    const operatorName = this.normalizeOptional(dto.operatorName);
    const note = this.normalizeOptional(dto.note) ?? null;
    const rackQr = this.normalizeOptional(dto.rackQr);
    const faultCatalogId = this.normalizeOptional(dto.faultCatalogId);
    const faultCatalogCode = this.normalizeOptional(dto.faultCatalogCode);
    const faultOtherText = this.normalizeOptional(dto.faultOtherText);
    const priority = dto.priority ?? RepairPriority.NORMAL;

    const selectorCount = [
      faultCatalogId,
      faultCatalogCode,
      faultOtherText,
    ].filter(Boolean).length;

    if (selectorCount !== 1) {
      return this.buildErrorResponse(
        'INVALID_REQUEST',
        'Provide exactly one of faultCatalogId, faultCatalogCode, or faultOtherText',
        HttpStatus.BAD_REQUEST,
      );
    }

    try {
      const result: FaultDeclarationResponse =
        await this.prismaService.$transaction(async (tx) => {
          const vacuumResult = await this.resolveVacuumByScanValue(
            tx,
            dto.vacuumQr,
          );

          if (!vacuumResult.ok) {
            return vacuumResult;
          }

          const vacuum = vacuumResult.vacuum;
          const rackResult = rackQr
            ? await this.lookupRackByScanValue(tx, rackQr)
            : null;

          if (rackResult && !rackResult.ok) {
            return this.buildErrorResponse(
              rackResult.decision,
              rackResult.message,
              rackResult.decision === 'RACK_NOT_FOUND'
                ? HttpStatus.NOT_FOUND
                : HttpStatus.BAD_REQUEST,
            );
          }

          const selectedRack = rackResult?.ok ? rackResult.rack : null;

          if (
            vacuum.currentMachineId !== null ||
            vacuum.locationStatus === LocationStatus.ON_MACHINE
          ) {
            return this.buildErrorResponse(
              'MUST_DECHARGE_FIRST',
              'Vacuum must be decharged before fault declaration',
              HttpStatus.CONFLICT,
            );
          }

          if (
            this.isPendingFaultDeclarationState(vacuum) &&
            (await this.hasOpenRepair(tx, vacuum.id))
          ) {
            return this.buildErrorResponse(
              'ALREADY_IN_REPAIR',
              'Vacuum is already in repair',
              HttpStatus.CONFLICT,
            );
          }

          if (
            !this.isPendingFaultDeclarationState(vacuum) &&
            (vacuum.locationStatus === LocationStatus.IN_REPAIR ||
              vacuum.operationalStatus === OperationalStatus.UNDER_REPAIR)
          ) {
            return this.buildErrorResponse(
              'ALREADY_IN_REPAIR',
              'Vacuum is already in repair',
              HttpStatus.CONFLICT,
            );
          }

          if (
            vacuum.operationalStatus === OperationalStatus.RETIRED ||
            vacuum.operationalStatus === OperationalStatus.OUT_OF_SERVICE
          ) {
            return this.buildErrorResponse(
              'NOT_VALID_FOR_FAULT',
              'Vacuum is not valid for normal fault declaration',
              HttpStatus.CONFLICT,
            );
          }

          if (selectedRack && selectedRack.type !== RackLocationType.REP) {
            return this.buildErrorResponse(
              'RACK_NOT_ALLOWED',
              'Selected rack is not a repair rack',
              HttpStatus.CONFLICT,
            );
          }

          if (selectedRack) {
            const occupiedRackPad = await tx.vacuumPad.findFirst({
              where: {
                deletedAt: null,
                currentRackLocationId: selectedRack.id,
                id: {
                  not: vacuum.id,
                },
              },
              select: {
                id: true,
              },
            });

            if (occupiedRackPad) {
              return this.buildErrorResponse(
                'RACK_OCCUPIED',
                'Selected rack is already occupied',
                HttpStatus.CONFLICT,
              );
            }
          }

          let selectedCatalog: FaultCatalogRecord | null = null;

          if (faultCatalogId || faultCatalogCode) {
            const catalogResult = await this.resolveFaultCatalog(
              tx,
              faultCatalogId,
              faultCatalogCode,
            );

            if (!catalogResult.ok) {
              return this.buildErrorResponse(
                catalogResult.decision,
                catalogResult.message,
                catalogResult.decision === 'FAULT_CATALOG_NOT_FOUND'
                  ? HttpStatus.NOT_FOUND
                  : HttpStatus.BAD_REQUEST,
              );
            }

            selectedCatalog = catalogResult.catalog;
          }

          if (!selectedCatalog && !faultOtherText) {
            return this.buildErrorResponse(
              'INVALID_REQUEST',
              'Select a fault category or provide fault details',
              HttpStatus.BAD_REQUEST,
            );
          }

          const now = new Date();
          const previousCurrentRackLocationId = vacuum.currentRackLocationId;
          const previousCurrentMachineId = vacuum.currentMachineId;
          const previousLocationStatus = vacuum.locationStatus;
          const previousOperationalStatus = vacuum.operationalStatus;
          const targetRackLocationId =
            selectedRack?.id ?? previousCurrentRackLocationId ?? null;
          const problemDescription = this.buildProblemDescription(
            selectedCatalog,
            faultOtherText,
          );

          const repair = await tx.repair.create({
            data: {
              vacuumPadId: vacuum.id,
              reportedById: null,
              technicianId: null,
              faultCatalogId: selectedCatalog?.id ?? null,
              status: RepairStatus.REPORTED,
              priority,
              problemDescription,
              faultOtherText: faultOtherText ?? null,
              operatorName: operatorName ?? null,
              reportedAt: now,
            },
            select: {
              id: true,
              vacuumPadId: true,
              status: true,
              priority: true,
              problemDescription: true,
              faultCatalogId: true,
              faultOtherText: true,
              operatorName: true,
              reportedAt: true,
            },
          });

          const updatedVacuumRecord = await tx.vacuumPad.update({
            where: {
              id: vacuum.id,
            },
            data: {
              locationStatus: LocationStatus.IN_REPAIR,
              operationalStatus: OperationalStatus.UNDER_REPAIR,
              currentRackLocationId: targetRackLocationId,
              currentMachineId: null,
              lastRepairAt: now,
            },
            select: QrService.vacuumSelect,
          });

          const movement = await tx.padMovement.create({
            data: {
              movementType: MovementType.REPAIR_INTAKE,
              vacuumPadId: vacuum.id,
              fromRackLocationId: previousCurrentRackLocationId ?? null,
              toRackLocationId: targetRackLocationId,
              previousLocationStatus,
              newLocationStatus: LocationStatus.IN_REPAIR,
              previousOperationalStatus,
              newOperationalStatus: OperationalStatus.UNDER_REPAIR,
              performedById: null,
              deviceId: dto.deviceId,
              operatorName: operatorName ?? null,
              note,
              metadata: {
                repairId: repair.id,
                faultCatalogId: selectedCatalog?.id ?? null,
                faultCatalogCode: selectedCatalog?.code ?? null,
                faultOtherText: faultOtherText ?? null,
                selectedRackLocationId: selectedRack?.id ?? null,
              },
            },
            select: {
              id: true,
              movementType: true,
              vacuumPadId: true,
              fromRackLocationId: true,
              toRackLocationId: true,
              previousLocationStatus: true,
              newLocationStatus: true,
              previousOperationalStatus: true,
              newOperationalStatus: true,
              deviceId: true,
              operatorName: true,
              note: true,
              createdAt: true,
            },
          });

          const auditLog = await tx.auditLog.create({
            data: {
              action: AuditAction.REPAIR_REPORTED,
              entityType: 'Repair',
              entityId: repair.id,
              userId: null,
              deviceId: dto.deviceId,
              operatorName: operatorName ?? null,
              before: {
                currentRackLocationId: previousCurrentRackLocationId,
                currentMachineId: previousCurrentMachineId,
                locationStatus: previousLocationStatus,
                operationalStatus: previousOperationalStatus,
              },
              after: {
                repairId: repair.id,
                locationStatus: LocationStatus.IN_REPAIR,
                operationalStatus: OperationalStatus.UNDER_REPAIR,
                faultCatalogId: selectedCatalog?.id ?? null,
                faultCatalogCode: selectedCatalog?.code ?? null,
                faultOtherText: faultOtherText ?? null,
              },
              metadata: {
                vacuumPadId: vacuum.id,
                priority,
                note,
              },
            },
            select: {
              id: true,
              action: true,
              entityType: true,
              entityId: true,
              deviceId: true,
              operatorName: true,
              createdAt: true,
            },
          });

          return {
            ok: true,
            decision: 'FAULT_DECLARED',
            repair: this.mapRepairRecord(repair, selectedCatalog),
            vacuum: this.mapVacuumRecord(updatedVacuumRecord),
            rack: selectedRack ? this.mapRackRecord(selectedRack) : null,
            movement: {
              ...movement,
              createdAt: movement.createdAt.toISOString(),
            },
            auditLog: {
              ...auditLog,
              createdAt: auditLog.createdAt.toISOString(),
            },
            requiredNextAction: 'UPLOAD_PHOTO_OPTIONAL',
          };
        });

      if (result.ok) {
        await this.sendRepairIntakeNotification(result);
      }

      return result;
    } catch (error) {
      return this.mapTransactionError(error);
    }
  }

  async restore(dto: FaultRestorationDto): Promise<FaultRestorationResponse> {
    const operatorName = this.normalizeOptional(dto.operatorName);
    const note = this.normalizeOptional(dto.note) ?? null;
    const technicianNotes = this.normalizeOptional(dto.technicianNotes) ?? null;
    const repairActions = this.normalizeOptional(dto.repairActions) ?? null;
    const spareParts = this.normalizeOptional(dto.spareParts) ?? null;
    const repairCostResult = this.parseRepairCost(dto.repairCost);

    if (!repairCostResult.ok) {
      return this.buildRestorationErrorResponse(
        'INVALID_REQUEST',
        repairCostResult.message,
        HttpStatus.BAD_REQUEST,
      );
    }

    try {
      const result: FaultRestorationResponse =
        await this.prismaService.$transaction(async (tx) => {
          const vacuumResult = await this.resolveVacuumByScanValue(
            tx,
            dto.vacuumQr,
          );

          if (!vacuumResult.ok) {
            return this.buildRestorationErrorResponse(
              vacuumResult.decision === 'VACUUM_NOT_FOUND'
                ? 'VACUUM_NOT_FOUND'
                : 'INVALID_REQUEST',
              vacuumResult.message,
              vacuumResult.httpStatus,
            );
          }

          const rackResult = await this.lookupRackByScanValue(tx, dto.rackQr);

          if (!rackResult.ok) {
            return this.buildRestorationErrorResponse(
              rackResult.decision,
              rackResult.message,
              rackResult.decision === 'RACK_NOT_FOUND'
                ? HttpStatus.NOT_FOUND
                : HttpStatus.BAD_REQUEST,
            );
          }

          const vacuum = vacuumResult.vacuum;
          const rack = rackResult.rack;

          if (
            vacuum.currentMachineId !== null ||
            vacuum.locationStatus === LocationStatus.ON_MACHINE
          ) {
            return this.buildRestorationErrorResponse(
              'ACTIVE_MUST_DECHARGE_FIRST',
              'Vacuum must be decharged before restoration',
              HttpStatus.CONFLICT,
            );
          }

          if (
            vacuum.locationStatus !== LocationStatus.IN_REPAIR &&
            vacuum.operationalStatus !== OperationalStatus.UNDER_REPAIR
          ) {
            return this.buildRestorationErrorResponse(
              'NOT_IN_REPAIR',
              'Vacuum is not currently in repair',
              HttpStatus.CONFLICT,
            );
          }

          const openRepair = await tx.repair.findFirst({
            where: {
              vacuumPadId: vacuum.id,
              completedAt: null,
              status: {
                in: [
                  RepairStatus.REPORTED,
                  RepairStatus.ASSIGNED,
                  RepairStatus.UNDER_REPAIR,
                ],
              },
            },
            orderBy: [{ reportedAt: 'desc' }, { createdAt: 'desc' }],
            select: {
              id: true,
              vacuumPadId: true,
              status: true,
              priority: true,
              outcome: true,
              problemDescription: true,
              faultCatalogId: true,
              faultOtherText: true,
              operatorName: true,
              reportedAt: true,
              completedAt: true,
              technicianNotes: true,
              repairActions: true,
              spareParts: true,
              repairCost: true,
              faultCatalog: {
                select: {
                  id: true,
                  code: true,
                  label: true,
                  description: true,
                  sortOrder: true,
                },
              },
            },
          });

          if (!openRepair) {
            return this.buildRestorationErrorResponse(
              'REPAIR_NOT_FOUND',
              'No active repair record found for this vacuum',
              HttpStatus.CONFLICT,
            );
          }

          const completionPhotoCount = await tx.repairPhoto.count({
            where: {
              repairId: openRepair.id,
              stage: RepairPhotoStage.REPAIR_COMPLETION,
            },
          });

          if (completionPhotoCount < 1) {
            return this.buildRestorationErrorResponse(
              'COMPLETION_PHOTO_REQUIRED',
              'At least one repair completion photo is required before restoration',
              HttpStatus.CONFLICT,
            );
          }

          if (rack.type === RackLocationType.REP) {
            return this.buildRestorationErrorResponse(
              'RACK_NOT_ALLOWED',
              'Selected rack is not allowed for restoration',
              HttpStatus.CONFLICT,
            );
          }

          const occupiedRackPad = await tx.vacuumPad.findFirst({
            where: {
              deletedAt: null,
              currentRackLocationId: rack.id,
              id: {
                not: vacuum.id,
              },
            },
            select: {
              id: true,
            },
          });

          if (occupiedRackPad) {
            return this.buildRestorationErrorResponse(
              'RACK_OCCUPIED',
              'Selected rack is already occupied',
              HttpStatus.CONFLICT,
            );
          }

          const previousCurrentRackLocationId = vacuum.currentRackLocationId;
          const previousCurrentMachineId = vacuum.currentMachineId;
          const previousLocationStatus = vacuum.locationStatus;
          const previousOperationalStatus = vacuum.operationalStatus;
          const completedAt = new Date();
          const isUnresolved = dto.outcome === RepairOutcome.UNRESOLVED;
          const repairStatus = isUnresolved
            ? RepairStatus.UNDER_REPAIR
            : RepairStatus.COMPLETED;
          const newLocationStatus = isUnresolved
            ? LocationStatus.IN_REPAIR
            : LocationStatus.IN_RACK;
          const newOperationalStatus = this.getRestorationOperationalStatus(
            dto.outcome,
          );
          const targetRackLocationId = rack.id;

          const updatedRepair = await tx.repair.update({
            where: {
              id: openRepair.id,
            },
            data: {
              status: repairStatus,
              outcome: dto.outcome,
              technicianNotes,
              repairActions,
              spareParts,
              repairCost: repairCostResult.value,
              completedAt: isUnresolved ? null : completedAt,
            },
            select: {
              id: true,
              vacuumPadId: true,
              status: true,
              priority: true,
              outcome: true,
              problemDescription: true,
              faultCatalogId: true,
              faultOtherText: true,
              operatorName: true,
              reportedAt: true,
              completedAt: true,
              technicianNotes: true,
              repairActions: true,
              spareParts: true,
              repairCost: true,
              faultCatalog: {
                select: {
                  id: true,
                  code: true,
                  label: true,
                  description: true,
                  sortOrder: true,
                },
              },
            },
          });

          const updatedVacuumRecord = await tx.vacuumPad.update({
            where: {
              id: vacuum.id,
            },
            data: {
              currentRackLocationId: targetRackLocationId,
              currentMachineId: null,
              locationStatus: newLocationStatus,
              operationalStatus: newOperationalStatus,
            },
            select: QrService.vacuumSelect,
          });

          const movementType = isUnresolved
            ? MovementType.STATUS_CHANGE
            : MovementType.REPAIR_RELEASE;
          const auditAction = isUnresolved
            ? AuditAction.STATUS_CHANGE
            : AuditAction.REPAIR_COMPLETED;

          const movement = await tx.padMovement.create({
            data: {
              movementType,
              vacuumPadId: vacuum.id,
              fromRackLocationId: previousCurrentRackLocationId ?? null,
              toRackLocationId: targetRackLocationId,
              previousLocationStatus,
              newLocationStatus,
              previousOperationalStatus,
              newOperationalStatus,
              performedById: null,
              deviceId: dto.deviceId,
              operatorName: operatorName ?? null,
              note,
              metadata: {
                repairId: openRepair.id,
                outcome: dto.outcome,
              },
            },
            select: {
              id: true,
              movementType: true,
              vacuumPadId: true,
              fromRackLocationId: true,
              toRackLocationId: true,
              previousLocationStatus: true,
              newLocationStatus: true,
              previousOperationalStatus: true,
              newOperationalStatus: true,
              deviceId: true,
              operatorName: true,
              note: true,
              createdAt: true,
            },
          });

          const auditLog = await tx.auditLog.create({
            data: {
              action: auditAction,
              entityType: 'Repair',
              entityId: openRepair.id,
              userId: null,
              deviceId: dto.deviceId,
              operatorName: operatorName ?? null,
              before: {
                repairStatus: openRepair.status,
                repairOutcome: openRepair.outcome,
                repairCompletedAt:
                  openRepair.completedAt?.toISOString() ?? null,
                currentRackLocationId: previousCurrentRackLocationId,
                currentMachineId: previousCurrentMachineId,
                locationStatus: previousLocationStatus,
                operationalStatus: previousOperationalStatus,
              },
              after: {
                repairStatus,
                repairOutcome: dto.outcome,
                repairCompletedAt: isUnresolved
                  ? null
                  : completedAt.toISOString(),
                currentRackLocationId: targetRackLocationId,
                currentMachineId: null,
                locationStatus: newLocationStatus,
                operationalStatus: newOperationalStatus,
              },
              metadata: {
                vacuumPadId: vacuum.id,
                rackId: rack.id,
                outcome: dto.outcome,
              },
            },
            select: {
              id: true,
              action: true,
              entityType: true,
              entityId: true,
              deviceId: true,
              operatorName: true,
              createdAt: true,
            },
          });

          const updatedRackRecord = await tx.rackLocation.findUnique({
            where: {
              id: targetRackLocationId,
            },
            select: QrService.rackSelect,
          });

          if (!updatedRackRecord) {
            return this.buildRestorationErrorResponse(
              'RACK_NOT_FOUND',
              'No matching rack found',
              HttpStatus.NOT_FOUND,
            );
          }

          return {
            ok: true,
            decision: this.getRestorationDecision(dto.outcome),
            repair: this.mapRestoredRepairRecord(updatedRepair),
            vacuum: this.mapVacuumRecord(updatedVacuumRecord),
            rack: this.mapRackRecord(updatedRackRecord),
            movement: {
              ...movement,
              createdAt: movement.createdAt.toISOString(),
            },
            auditLog: {
              ...auditLog,
              createdAt: auditLog.createdAt.toISOString(),
            },
          };
        });

      if (result.ok && result.decision !== 'UNRESOLVED_STILL_IN_REPAIR') {
        await this.sendRepairRestoredNotification(result);
      }

      return result;
    } catch (error) {
      return this.mapRestorationTransactionError(error);
    }
  }

  async uploadPhoto(
    repairId: string,
    file: Express.Multer.File | undefined,
    dto: RepairPhotoUploadDto,
  ): Promise<RepairPhotoUploadResponse> {
    const operatorName = this.normalizeOptional(dto.operatorName);
    const caption = this.normalizeOptional(dto.caption) ?? null;
    const stage = dto.stage ?? RepairPhotoStage.FAULT_DECLARATION;

    if (!repairId.trim()) {
      return this.buildPhotoUploadErrorResponse(
        'INVALID_REQUEST',
        'Repair id is required',
        HttpStatus.BAD_REQUEST,
      );
    }

    if (!file) {
      return this.buildPhotoUploadErrorResponse(
        'INVALID_REQUEST',
        'A photo file is required',
        HttpStatus.BAD_REQUEST,
      );
    }

    const existingRepair = await this.prismaService.repair.findFirst({
      where: {
        id: repairId,
      },
      select: {
        id: true,
        vacuumPadId: true,
        status: true,
      },
    });

    if (!existingRepair) {
      return this.buildPhotoUploadErrorResponse(
        'REPAIR_NOT_FOUND',
        'No matching repair found',
        HttpStatus.NOT_FOUND,
      );
    }

    if (
      existingRepair.status === RepairStatus.COMPLETED ||
      existingRepair.status === RepairStatus.CANCELLED
    ) {
      return this.buildPhotoUploadErrorResponse(
        'REPAIR_CLOSED',
        'Repair is closed and cannot accept more photos',
        HttpStatus.CONFLICT,
      );
    }

    const existingStagePhotoCount = await this.prismaService.repairPhoto.count({
      where: {
        repairId: existingRepair.id,
        stage,
      },
    });

    if (existingStagePhotoCount >= MAX_REPAIR_PHOTOS_PER_STAGE) {
      return this.buildPhotoUploadErrorResponse(
        'MAX_PHOTOS_REACHED',
        `Repair already has ${MAX_REPAIR_PHOTOS_PER_STAGE} photos for ${stage}`,
        HttpStatus.CONFLICT,
      );
    }

    let storedPhoto: StoredRepairPhotoInternal;

    try {
      storedPhoto = await this.storageService.storeRepairPhoto({
        repairId: existingRepair.id,
        file,
      });
    } catch (error) {
      if (error instanceof InvalidRepairPhotoFileError) {
        return this.buildPhotoUploadErrorResponse(
          'INVALID_FILE',
          error.message,
          HttpStatus.BAD_REQUEST,
        );
      }

      if (error instanceof RepairPhotoUploadFailedError) {
        return this.buildPhotoUploadErrorResponse(
          'UPLOAD_FAILED',
          'Repair photo upload could not be completed',
          HttpStatus.CONFLICT,
        );
      }

      return this.buildPhotoUploadErrorResponse(
        'UPLOAD_FAILED',
        'Repair photo upload could not be completed',
        HttpStatus.CONFLICT,
      );
    }

    try {
      const result: RepairPhotoUploadResponse =
        await this.prismaService.$transaction(async (tx) => {
          const openRepair = await tx.repair.findFirst({
            where: {
              id: repairId,
              status: {
                in: [
                  RepairStatus.REPORTED,
                  RepairStatus.ASSIGNED,
                  RepairStatus.UNDER_REPAIR,
                ],
              },
            },
            select: {
              id: true,
              vacuumPadId: true,
              status: true,
            },
          });

          if (!openRepair) {
            const latestRepair = await tx.repair.findFirst({
              where: {
                id: repairId,
              },
              select: {
                id: true,
              },
            });

            return this.buildPhotoUploadErrorResponse(
              latestRepair ? 'REPAIR_CLOSED' : 'REPAIR_NOT_FOUND',
              latestRepair
                ? 'Repair is closed and cannot accept more photos'
                : 'No matching repair found',
              latestRepair ? HttpStatus.CONFLICT : HttpStatus.NOT_FOUND,
            );
          }

          const stagePhotoCount = await tx.repairPhoto.count({
            where: {
              repairId: openRepair.id,
              stage,
            },
          });

          if (stagePhotoCount >= MAX_REPAIR_PHOTOS_PER_STAGE) {
            return this.buildPhotoUploadErrorResponse(
              'MAX_PHOTOS_REACHED',
              `Repair already has ${MAX_REPAIR_PHOTOS_PER_STAGE} photos for ${stage}`,
              HttpStatus.CONFLICT,
            );
          }

          const photo = await tx.repairPhoto.create({
            data: {
              repairId: openRepair.id,
              stage,
              objectKey: storedPhoto.objectKey,
              bucket: storedPhoto.bucket,
              storageProvider: storedPhoto.storageProvider,
              filesystemPath: storedPhoto.filesystemPath,
              publicUrl: storedPhoto.publicUrl,
              originalFilename: storedPhoto.originalFilename,
              contentType: storedPhoto.contentType,
              sizeBytes: storedPhoto.sizeBytes,
              caption,
              uploadedById: null,
              operatorName: operatorName ?? null,
            },
            select: {
              id: true,
              repairId: true,
              objectKey: true,
              bucket: true,
              originalFilename: true,
              contentType: true,
              sizeBytes: true,
              caption: true,
              operatorName: true,
              stage: true,
              storageProvider: true,
              filesystemPath: true,
              publicUrl: true,
              createdAt: true,
            },
          });

          await tx.auditLog.create({
            data: {
              action: AuditAction.PHOTO_UPLOADED,
              entityType: 'RepairPhoto',
              entityId: photo.id,
              userId: null,
              deviceId: dto.deviceId,
              operatorName: operatorName ?? null,
              before: Prisma.JsonNull,
              after: {
                repairId: openRepair.id,
                stage,
                storageProvider: storedPhoto.storageProvider,
                objectKey: storedPhoto.objectKey,
                caption,
              },
              metadata: {
                repairId: openRepair.id,
                vacuumPadId: openRepair.vacuumPadId,
                bucket: storedPhoto.bucket,
                stage,
              },
            },
          });

          return {
            ok: true,
            photo: this.mapRepairPhotoRecord(photo),
            storage: {
              provider: storedPhoto.storageProvider,
            },
          };
        });

      if (!result.ok && result.decision === 'MAX_PHOTOS_REACHED') {
        await this.storageService.cleanupStoredPhoto(storedPhoto).catch(() => {
          return undefined;
        });
      }

      return result;
    } catch {
      await this.storageService.cleanupStoredPhoto(storedPhoto).catch(() => {
        return undefined;
      });

      return this.buildPhotoUploadErrorResponse(
        'UPLOAD_FAILED',
        'Repair photo upload could not be completed',
        HttpStatus.CONFLICT,
      );
    }
  }

  async listRepairPhotos(repairId: string): Promise<RepairPhotoListResponse> {
    const normalizedRepairId = repairId.trim();

    if (!normalizedRepairId) {
      throw new NotFoundException('No matching repair found');
    }

    const repair = await this.prismaService.repair.findFirst({
      where: {
        id: normalizedRepairId,
      },
      select: {
        id: true,
      },
    });

    if (!repair) {
      throw new NotFoundException('No matching repair found');
    }

    const photos = await this.prismaService.repairPhoto.findMany({
      where: {
        repairId: repair.id,
      },
      orderBy: [{ createdAt: 'asc' }],
      select: {
        id: true,
        repairId: true,
        objectKey: true,
        bucket: true,
        originalFilename: true,
        contentType: true,
        sizeBytes: true,
        caption: true,
        operatorName: true,
        stage: true,
        storageProvider: true,
        filesystemPath: true,
        publicUrl: true,
        createdAt: true,
      },
    });

    const mappedPhotos = await Promise.all(
      photos.map((photo) => this.mapRepairPhotoListItem(photo)),
    );

    return {
      repairId: repair.id,
      photos: mappedPhotos,
      faultDeclarationPhotos: mappedPhotos.filter(
        (photo) => photo.stage === RepairPhotoStage.FAULT_DECLARATION,
      ),
      repairCompletionPhotos: mappedPhotos.filter(
        (photo) => photo.stage === RepairPhotoStage.REPAIR_COMPLETION,
      ),
    };
  }

  async deleteRepairPhoto(
    repairId: string,
    photoId: string,
  ): Promise<{ ok: true; repairId: string; photoId: string }> {
    const normalizedRepairId = repairId.trim();
    const normalizedPhotoId = photoId.trim();

    if (!normalizedRepairId || !normalizedPhotoId) {
      throw new NotFoundException('No matching repair photo found');
    }

    const photo = await this.prismaService.repairPhoto.findFirst({
      where: {
        id: normalizedPhotoId,
        repairId: normalizedRepairId,
      },
      select: {
        id: true,
        repairId: true,
        stage: true,
        objectKey: true,
        bucket: true,
        storageProvider: true,
        filesystemPath: true,
        publicUrl: true,
        originalFilename: true,
        contentType: true,
        sizeBytes: true,
        caption: true,
        operatorName: true,
      },
    });

    if (!photo) {
      throw new NotFoundException('No matching repair photo found');
    }

    try {
      await this.storageService.deleteStoredRepairPhoto(photo);
    } catch (error) {
      if (error instanceof RepairPhotoDeleteFailedError) {
        throw new ConflictException(error.message);
      }

      throw new ConflictException(
        'Repair photo could not be deleted from storage',
      );
    }

    await this.prismaService.$transaction(async (tx) => {
      await tx.repairPhoto.delete({
        where: {
          id: photo.id,
        },
      });

      await tx.auditLog.create({
        data: {
          action: AuditAction.DELETE,
          entityType: 'RepairPhoto',
          entityId: photo.id,
          userId: null,
          before: {
            repairId: photo.repairId,
            stage: photo.stage,
            objectKey: photo.objectKey,
            bucket: photo.bucket,
            originalFilename: photo.originalFilename,
            contentType: photo.contentType,
            sizeBytes: photo.sizeBytes,
            caption: photo.caption,
            operatorName: photo.operatorName,
          },
          after: Prisma.JsonNull,
          metadata: {
            repairId: photo.repairId,
            stage: photo.stage,
            bucket: photo.bucket,
            objectKey: photo.objectKey,
          },
        },
      });
    });

    return {
      ok: true,
      repairId: normalizedRepairId,
      photoId: normalizedPhotoId,
    };
  }

  async listCatalog(): Promise<FaultCatalogListResponse> {
    const items = await this.prismaService.faultCatalog.findMany({
      where: {
        deletedAt: null,
        isActive: true,
      },
      orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
      select: {
        id: true,
        code: true,
        label: true,
        description: true,
        sortOrder: true,
      },
    });

    return {
      items: items.map((item) => this.mapFaultCatalog(item)),
    };
  }

  private normalizeOptional(value?: string): string | undefined {
    const normalized = value?.trim();

    return normalized ? normalized : undefined;
  }

  private parseRepairCost(value?: string):
    | {
        ok: true;
        value: Prisma.Decimal | null;
      }
    | {
        ok: false;
        message: string;
      } {
    const normalized = this.normalizeOptional(value);

    if (!normalized) {
      return {
        ok: true,
        value: null,
      };
    }

    try {
      const decimal = new Prisma.Decimal(normalized);

      if (decimal.isNegative()) {
        return {
          ok: false,
          message: 'repairCost must be a non-negative decimal value',
        };
      }

      return {
        ok: true,
        value: decimal,
      };
    } catch {
      return {
        ok: false,
        message: 'repairCost must be a non-negative decimal value',
      };
    }
  }

  private isPendingFaultDeclarationState(vacuum: {
    locationStatus: LocationStatus;
    operationalStatus: OperationalStatus;
  }): boolean {
    return (
      vacuum.locationStatus === LocationStatus.IN_REPAIR &&
      vacuum.operationalStatus === OperationalStatus.INSPECTION_REQUIRED
    );
  }

  private async hasOpenRepair(
    client: TransactionClient | PrismaService,
    vacuumPadId: string,
  ): Promise<boolean> {
    const openRepair = await client.repair.findFirst({
      where: {
        vacuumPadId,
        completedAt: null,
        status: {
          in: [
            RepairStatus.REPORTED,
            RepairStatus.ASSIGNED,
            RepairStatus.UNDER_REPAIR,
          ],
        },
      },
      select: {
        id: true,
      },
    });

    return openRepair != null;
  }

  private buildProblemDescription(
    catalog: FaultCatalogRecord | null,
    faultOtherText?: string,
  ): string {
    if (catalog) {
      return catalog.description
        ? `${catalog.label}: ${catalog.description}`
        : catalog.label;
    }

    return faultOtherText!;
  }

  private getRestorationOperationalStatus(
    outcome: RepairOutcome,
  ): OperationalStatus {
    switch (outcome) {
      case RepairOutcome.RETURNED_TO_SERVICE:
        return OperationalStatus.FUNCTIONAL;
      case RepairOutcome.OUT_OF_SERVICE:
        return OperationalStatus.OUT_OF_SERVICE;
      case RepairOutcome.RETIRED:
        return OperationalStatus.RETIRED;
      case RepairOutcome.UNRESOLVED:
        return OperationalStatus.UNDER_REPAIR;
    }
  }

  private getRestorationDecision(
    outcome: RepairOutcome,
  ): FaultRestorationSuccessResponse['decision'] {
    switch (outcome) {
      case RepairOutcome.RETURNED_TO_SERVICE:
        return 'RESTORED';
      case RepairOutcome.OUT_OF_SERVICE:
        return 'RESTORED_OUT_OF_SERVICE';
      case RepairOutcome.RETIRED:
        return 'RETIRED';
      case RepairOutcome.UNRESOLVED:
        return 'UNRESOLVED_STILL_IN_REPAIR';
    }
  }

  private mapVacuumLookupError(
    result: QrScanErrorResponse,
  ): FaultDeclarationPreviewResponse {
    if (result.errorCode === 'QR_NOT_FOUND') {
      return this.buildPreviewResponse({
        ok: false,
        decision: 'VACUUM_NOT_FOUND',
        message: 'No matching vacuum found',
        vacuum: null,
        rack: null,
        faultCatalog: null,
        requiredNextAction: 'NONE',
      });
    }

    return this.buildPreviewResponse({
      ok: false,
      decision: 'INVALID_REQUEST',
      message: 'Vacuum QR is invalid',
      vacuum: null,
      rack: null,
      faultCatalog: null,
      requiredNextAction: 'NONE',
    });
  }

  private mapRestorationVacuumLookupError(
    result: QrScanErrorResponse,
  ): FaultRestorationPreviewResponse {
    if (result.errorCode === 'QR_NOT_FOUND') {
      return this.buildRestorationPreviewResponse({
        ok: false,
        decision: 'VACUUM_NOT_FOUND',
        message: 'No matching vacuum found',
        vacuum: null,
        repair: null,
        rack: null,
        requiredNextAction: 'NONE',
      });
    }

    return this.buildRestorationPreviewResponse({
      ok: false,
      decision: 'INVALID_REQUEST',
      message: 'Vacuum QR is invalid',
      vacuum: null,
      repair: null,
      rack: null,
      requiredNextAction: 'NONE',
    });
  }

  private async resolveVacuumByScanValue(
    client: TransactionClient | PrismaService,
    raw: string,
  ): Promise<
    | {
        ok: true;
        vacuum: VacuumRecord;
      }
    | FaultDeclarationErrorResponseInternal
  > {
    const parsed = this.qrService.parseRawPayload(raw);

    if (!parsed.ok) {
      return this.buildErrorResponse(
        'INVALID_REQUEST',
        'Vacuum QR is invalid',
        HttpStatus.BAD_REQUEST,
      );
    }

    if (parsed.payload.entityType !== QrEntityType.VACUUM) {
      return this.buildErrorResponse(
        'INVALID_REQUEST',
        'The provided vacuum QR is not a vacuum identifier',
        HttpStatus.BAD_REQUEST,
      );
    }

    const matches = await client.vacuumPad.findMany({
      where: {
        deletedAt: null,
        serialNumber: { not: null },
        OR: [
          { serialNumber: parsed.payload.value },
          { qrCode: parsed.payload.value },
          { code: parsed.payload.value },
        ],
      },
      select: QrService.vacuumSelect,
      take: 3,
    });
    const match = this.pickVacuumByScanPriority(matches, parsed.payload.value);

    if (!match) {
      return this.buildErrorResponse(
        'VACUUM_NOT_FOUND',
        'No matching vacuum found',
        HttpStatus.NOT_FOUND,
      );
    }

    return {
      ok: true,
      vacuum: match,
    };
  }

  private async resolveFaultCatalog(
    client: TransactionClient | PrismaService,
    faultCatalogId?: string,
    faultCatalogCode?: string,
  ): Promise<
    | { ok: true; catalog: FaultCatalogRecord | null }
    | {
        ok: false;
        decision: Extract<
          FaultDeclarationPreviewDecision,
          'FAULT_CATALOG_NOT_FOUND' | 'INVALID_REQUEST'
        >;
        message: string;
      }
  > {
    if (!faultCatalogId && !faultCatalogCode) {
      return {
        ok: true,
        catalog: null,
      };
    }

    if (faultCatalogId && faultCatalogCode) {
      const [catalogById, catalogByCode] = await Promise.all([
        client.faultCatalog.findFirst({
          where: {
            id: faultCatalogId,
            deletedAt: null,
            isActive: true,
          },
          select: {
            id: true,
            code: true,
            label: true,
            description: true,
            sortOrder: true,
          },
        }),
        client.faultCatalog.findFirst({
          where: {
            code: faultCatalogCode,
            deletedAt: null,
            isActive: true,
          },
          select: {
            id: true,
            code: true,
            label: true,
            description: true,
            sortOrder: true,
          },
        }),
      ]);

      if (!catalogById || !catalogByCode) {
        return {
          ok: false,
          decision: 'FAULT_CATALOG_NOT_FOUND',
          message: 'No matching fault catalog entry found',
        };
      }

      if (catalogById.id !== catalogByCode.id) {
        return {
          ok: false,
          decision: 'INVALID_REQUEST',
          message: 'Provided fault catalog selectors do not match',
        };
      }

      return {
        ok: true,
        catalog: catalogById,
      };
    }

    const catalog = await client.faultCatalog.findFirst({
      where: {
        deletedAt: null,
        isActive: true,
        ...(faultCatalogId
          ? { id: faultCatalogId }
          : { code: faultCatalogCode! }),
      },
      select: {
        id: true,
        code: true,
        label: true,
        description: true,
        sortOrder: true,
      },
    });

    if (!catalog) {
      return {
        ok: false,
        decision: 'FAULT_CATALOG_NOT_FOUND',
        message: 'No matching fault catalog entry found',
      };
    }

    return {
      ok: true,
      catalog,
    };
  }

  private async lookupRackByScanValue(
    client: TransactionClient | PrismaService,
    raw: string,
  ): Promise<
    | {
        ok: true;
        rack: RackRecord;
      }
    | {
        ok: false;
        decision: Extract<
          FaultRestorationPreviewDecision,
          'RACK_NOT_FOUND' | 'INVALID_REQUEST'
        >;
        message: string;
      }
  > {
    const normalizedRaw = raw.trim();
    const parsedResult = this.tryParseRackQr(normalizedRaw);

    if (!parsedResult.ok) {
      return parsedResult.error;
    }

    const matches = await client.rackLocation.findMany({
      where: {
        deletedAt: null,
        isActive: true,
        OR: [{ code: parsedResult.value }, { qrCode: parsedResult.value }],
      },
      select: QrService.rackSelect,
      take: 2,
    });
    const match = this.pickRackByScanPriority(matches, parsedResult.value);

    if (!match) {
      return {
        ok: false,
        decision: 'RACK_NOT_FOUND',
        message: 'No matching rack found',
      };
    }

    return {
      ok: true,
      rack: match,
    };
  }

  private pickVacuumByScanPriority(
    matches: VacuumRecord[],
    value: string,
  ): VacuumRecord | null {
    return (
      matches.find((match) => match.serialNumber === value) ??
      // Deprecated scan aliases kept for old printed labels.
      matches.find((match) => match.qrCode === value) ??
      matches.find((match) => match.code === value) ??
      null
    );
  }

  private pickRackByScanPriority(
    matches: RackRecord[],
    value: string,
  ): RackRecord | null {
    return (
      matches.find((match) => match.code === value) ??
      // Deprecated scan alias kept for old printed labels.
      matches.find((match) => match.qrCode === value) ??
      null
    );
  }

  private tryParseRackQr(raw: string):
    | {
        ok: true;
        value: string;
      }
    | {
        ok: false;
        error: {
          ok: false;
          decision: 'INVALID_REQUEST';
          message: string;
        };
      } {
    if (!raw) {
      return {
        ok: false,
        error: {
          ok: false,
          decision: 'INVALID_REQUEST',
          message: 'Rack QR is invalid',
        },
      };
    }

    // MVP compatibility: rack tokens such as RACK-A-01-07 and
    // QR-RACK-A-01-07 are accepted directly without the RACK: prefix.
    if (!raw.startsWith('{') && !raw.includes(':')) {
      return {
        ok: true,
        value: raw,
      };
    }

    const parsed = this.qrService.parseRawPayload(raw);

    if (!parsed.ok) {
      return {
        ok: false,
        error: {
          ok: false,
          decision: 'INVALID_REQUEST',
          message: 'Rack QR is invalid',
        },
      };
    }

    if (parsed.payload.entityType !== QrEntityType.RACK) {
      return {
        ok: false,
        error: {
          ok: false,
          decision: 'INVALID_REQUEST',
          message: 'The provided rack QR is not a rack identifier',
        },
      };
    }

    return {
      ok: true,
      value: parsed.payload.value,
    };
  }

  private mapVacuumRecord(record: VacuumRecord): VacuumScanEntity {
    return {
      id: record.id,
      code: record.code,
      qrCode: record.qrCode,
      serialNumber: record.serialNumber,
      description: record.description,
      locationStatus: record.locationStatus,
      operationalStatus: record.operationalStatus,
      displayStatus: this.getDisplayStatus({
        currentMachineId: record.currentMachineId,
        locationStatus: record.locationStatus,
        operationalStatus: record.operationalStatus,
      }),
      currentMachine: record.currentMachine
        ? {
            id: record.currentMachine.id,
            code: record.currentMachine.code,
            qrCode: record.currentMachine.qrCode,
            name: record.currentMachine.name,
            status: record.currentMachine.status,
          }
        : null,
      currentRackLocation: record.currentRackLocation
        ? {
            id: record.currentRackLocation.id,
            code: record.currentRackLocation.code,
            qrCode: record.currentRackLocation.qrCode,
            label: record.currentRackLocation.label,
            type: record.currentRackLocation.type,
            zone: record.currentRackLocation.zone,
            rack: record.currentRackLocation.rack,
            level: record.currentRackLocation.level,
            slot: record.currentRackLocation.slot,
          }
        : null,
    };
  }

  private mapRackRecord(record: RackRecord): RackScanEntity {
    return {
      id: record.id,
      code: record.code,
      qrCode: record.qrCode,
      label: record.label,
      type: record.type,
      zone: record.zone,
      rack: record.rack,
      level: record.level,
      slot: record.slot,
      currentPad: record.currentPads[0]
        ? {
            id: record.currentPads[0].id,
            code: record.currentPads[0].code,
            qrCode: record.currentPads[0].qrCode,
            serialNumber: record.currentPads[0].serialNumber,
            locationStatus: record.currentPads[0].locationStatus,
            operationalStatus: record.currentPads[0].operationalStatus,
            displayStatus: this.getDisplayStatus(record.currentPads[0]),
          }
        : null,
    };
  }

  private mapRepairRecord(
    repair: RepairRecord,
    catalog: FaultCatalogRecord | null,
  ): FaultDeclarationSuccessResponse['repair'] {
    return {
      id: repair.id,
      vacuumPadId: repair.vacuumPadId,
      status: repair.status,
      priority: repair.priority,
      problemDescription: repair.problemDescription,
      faultCatalogId: repair.faultCatalogId,
      faultOtherText: repair.faultOtherText,
      operatorName: repair.operatorName,
      reportedAt: repair.reportedAt.toISOString(),
      faultCatalog: catalog ? this.mapFaultCatalog(catalog) : null,
    };
  }

  private mapRepairPreview(
    repair: OpenRepairPreviewRecord,
  ): FaultRestorationRepairSummary {
    return {
      id: repair.id,
      status: repair.status,
      priority: repair.priority,
      problemDescription: repair.problemDescription,
      faultOtherText: repair.faultOtherText,
      operatorName: repair.operatorName,
      reportedAt: repair.reportedAt.toISOString(),
      faultCatalog: repair.faultCatalog
        ? this.mapFaultCatalog(repair.faultCatalog)
        : null,
    };
  }

  private mapRestoredRepairRecord(
    repair: RepairRestoreRecord,
  ): FaultRestorationSuccessResponse['repair'] {
    return {
      id: repair.id,
      vacuumPadId: repair.vacuumPadId,
      status: repair.status,
      priority: repair.priority,
      outcome: repair.outcome,
      problemDescription: repair.problemDescription,
      faultCatalogId: repair.faultCatalogId,
      faultOtherText: repair.faultOtherText,
      operatorName: repair.operatorName,
      reportedAt: repair.reportedAt.toISOString(),
      completedAt: repair.completedAt?.toISOString() ?? null,
      technicianNotes: repair.technicianNotes,
      repairActions: repair.repairActions,
      spareParts: repair.spareParts,
      repairCost: repair.repairCost?.toString() ?? null,
      faultCatalog: repair.faultCatalog
        ? this.mapFaultCatalog(repair.faultCatalog)
        : null,
    };
  }

  private async mapRepairPhotoListItem(
    photo: RepairPhotoRecord,
  ): Promise<RepairPhotoListItem> {
    const viewUrl = await this.storageService.createRepairPhotoViewUrl(photo);

    return {
      id: photo.id,
      filename: photo.originalFilename,
      contentType: photo.contentType,
      sizeBytes: photo.sizeBytes,
      caption: photo.caption,
      operatorName: photo.operatorName,
      stage: photo.stage,
      storageProvider: photo.storageProvider,
      createdAt: photo.createdAt.toISOString(),
      url: viewUrl.url,
      urlExpiresAt: viewUrl.expiresAt,
      urlSource: viewUrl.source,
    };
  }

  private mapRepairPhotoRecord(
    photo: RepairPhotoRecord,
  ): RepairPhotoUploadSuccessResponse['photo'] {
    return {
      id: photo.id,
      repairId: photo.repairId,
      objectKey: photo.objectKey,
      bucket: photo.bucket,
      originalFilename: photo.originalFilename,
      contentType: photo.contentType,
      sizeBytes: photo.sizeBytes,
      caption: photo.caption,
      operatorName: photo.operatorName,
      stage: photo.stage,
      storageProvider: photo.storageProvider,
      filesystemPath: photo.filesystemPath,
      publicUrl: photo.publicUrl,
      createdAt: photo.createdAt.toISOString(),
    };
  }

  private mapFaultCatalog(record: FaultCatalogRecord): FaultCatalogSummary {
    return {
      id: record.id,
      code: record.code,
      label: record.label,
      description: record.description,
      sortOrder: record.sortOrder,
    };
  }

  private getDisplayStatus(vacuum: {
    currentMachineId: string | null;
    locationStatus: LocationStatus;
    operationalStatus: OperationalStatus;
  }): VacuumDisplayStatus {
    if (
      vacuum.locationStatus === LocationStatus.IN_REPAIR ||
      vacuum.operationalStatus === OperationalStatus.UNDER_REPAIR
    ) {
      return 'REPAIR';
    }

    if (
      vacuum.currentMachineId !== null ||
      vacuum.locationStatus === LocationStatus.ON_MACHINE
    ) {
      return 'ACTIVE';
    }

    return 'NOTACTIVE';
  }

  private async sendRepairIntakeNotification(
    result: FaultDeclarationSuccessResponse,
  ): Promise<void> {
    try {
      await this.notificationService.sendRepairIntakeNotification({
        repairId: result.repair.id,
        vacuumCode: result.vacuum.code,
        vacuumSerial: result.vacuum.serialNumber,
        rackCode:
          result.rack?.code ?? result.vacuum.currentRackLocation?.code ?? null,
      });
    } catch {
      return undefined;
    }
  }

  private async sendRepairRestoredNotification(
    result: FaultRestorationSuccessResponse,
  ): Promise<void> {
    try {
      await this.notificationService.sendRepairRestoredNotification({
        repairId: result.repair.id,
        vacuumCode: result.vacuum.code,
        vacuumSerial: result.vacuum.serialNumber,
        rackCode: result.rack.code,
      });
    } catch {
      return undefined;
    }
  }

  private buildPreviewResponse(
    response: FaultDeclarationPreviewResponse,
  ): FaultDeclarationPreviewResponse {
    return response;
  }

  private buildRestorationPreviewResponse(
    response: FaultRestorationPreviewResponse,
  ): FaultRestorationPreviewResponse {
    return response;
  }

  private buildErrorResponse(
    decision: Exclude<FaultDeclarationWriteDecision, 'FAULT_DECLARED'>,
    message: string,
    httpStatus: number,
  ): FaultDeclarationErrorResponseInternal {
    return {
      ok: false,
      decision,
      message,
      httpStatus,
    };
  }

  private buildRestorationErrorResponse(
    decision: Exclude<
      FaultRestorationWriteDecision,
      | 'RESTORED'
      | 'RESTORED_OUT_OF_SERVICE'
      | 'RETIRED'
      | 'UNRESOLVED_STILL_IN_REPAIR'
    >,
    message: string,
    httpStatus: number,
  ): FaultRestorationErrorResponseInternal {
    return {
      ok: false,
      decision,
      message,
      httpStatus,
    };
  }

  private buildPhotoUploadErrorResponse(
    decision: RepairPhotoUploadDecision,
    message: string,
    httpStatus: number,
  ): RepairPhotoUploadErrorResponseInternal {
    return {
      ok: false,
      decision,
      message,
      httpStatus,
    };
  }

  private mapTransactionError(
    error: unknown,
  ): FaultDeclarationErrorResponseInternal {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      if (
        error.message.includes('VacuumPad_currentRackLocationId_active_key')
      ) {
        return this.buildErrorResponse(
          'RACK_OCCUPIED',
          'Selected rack is already occupied',
          HttpStatus.CONFLICT,
        );
      }

      return this.buildErrorResponse(
        'INVALID_REQUEST',
        'Fault declaration could not be completed',
        HttpStatus.CONFLICT,
      );
    }

    return this.buildErrorResponse(
      'INVALID_REQUEST',
      'Fault declaration could not be completed',
      HttpStatus.CONFLICT,
    );
  }

  private mapRestorationTransactionError(
    error: unknown,
  ): FaultRestorationErrorResponseInternal {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      if (
        error.message.includes('VacuumPad_currentRackLocationId_active_key')
      ) {
        return this.buildRestorationErrorResponse(
          'RACK_OCCUPIED',
          'Selected rack is already occupied',
          HttpStatus.CONFLICT,
        );
      }
    }

    return this.buildRestorationErrorResponse(
      'INVALID_REQUEST',
      'Fault restoration could not be completed',
      HttpStatus.CONFLICT,
    );
  }
}
