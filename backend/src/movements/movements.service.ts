import { Injectable } from '@nestjs/common';
import { MovementType, Prisma, RepairPhotoStage } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  AdminMovementType,
  ListMovementsQuery,
  MovementRow,
  MovementsListResponse,
} from './movements.types';

const movementSelect = {
  id: true,
  movementType: true,
  previousLocationStatus: true,
  newLocationStatus: true,
  previousOperationalStatus: true,
  newOperationalStatus: true,
  deviceId: true,
  operatorName: true,
  note: true,
  metadata: true,
  createdAt: true,
  vacuumPad: {
    select: {
      id: true,
      code: true,
      serialNumber: true,
      description: true,
    },
  },
  fromRackLocation: {
    select: {
      id: true,
      code: true,
      label: true,
    },
  },
  toRackLocation: {
    select: {
      id: true,
      code: true,
      label: true,
    },
  },
  fromMachine: {
    select: {
      id: true,
      code: true,
      name: true,
    },
  },
  toMachine: {
    select: {
      id: true,
      code: true,
      name: true,
    },
  },
} satisfies Prisma.PadMovementSelect;

const repairSelect = {
  id: true,
  code: true,
  problemDescription: true,
  faultOtherText: true,
  reportedAt: true,
  completedAt: true,
  outcome: true,
  faultCatalog: {
    select: {
      code: true,
      label: true,
    },
  },
  photos: {
    select: {
      stage: true,
    },
  },
} satisfies Prisma.RepairSelect;

type MovementRecord = Prisma.PadMovementGetPayload<{
  select: typeof movementSelect;
}>;

type RepairRecord = Prisma.RepairGetPayload<{
  select: typeof repairSelect;
}>;

const movementTypeLabels: Record<AdminMovementType, string> = {
  CHARGE: 'Χρέωση',
  DECHARGE: 'Αποχρέωση',
  FAULT_DECLARED: 'Δήλωση Βλάβης',
  FAULT_RESTORED: 'Αποκατάσταση Βλάβης',
};

const visibleMovementTypes = [
  MovementType.CHARGE,
  MovementType.DECHARGE,
  MovementType.REPAIR_INTAKE,
  MovementType.REPAIR_RELEASE,
];

const allowedPageSizes = new Set([25, 50, 100, 200]);

@Injectable()
export class MovementsService {
  constructor(private readonly prismaService: PrismaService) {}

  async listMovements(
    query: ListMovementsQuery = {},
  ): Promise<MovementsListResponse> {
    const requestedPage = parsePositiveInteger(query.page, 1);
    const pageSize = parsePageSize(query.pageSize);
    const movements = await this.prismaService.padMovement.findMany({
      where: {
        movementType: {
          in: visibleMovementTypes,
        },
      },
      orderBy: [{ createdAt: 'desc' }],
      select: movementSelect,
    });
    const repairsById = await this.loadRepairsById(movements);
    const filteredRows = movements
      .map((movement) => this.mapMovement(movement, repairsById))
      .filter((row): row is MovementRow => row !== null)
      .filter((row) => matchesFilters(row, query));
    const total = filteredRows.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const page = Math.min(requestedPage, totalPages);
    const offset = (page - 1) * pageSize;

    return {
      items: filteredRows.slice(offset, offset + pageSize),
      page,
      pageSize,
      total,
      totalPages,
    };
  }

  private async loadRepairsById(
    movements: MovementRecord[],
  ): Promise<Map<string, RepairRecord>> {
    const repairIds = [
      ...new Set(
        movements
          .map((movement) => repairIdFromMetadata(movement.metadata))
          .filter((repairId): repairId is string => repairId !== null),
      ),
    ];

    if (repairIds.length === 0) {
      return new Map();
    }

    const repairs = await this.prismaService.repair.findMany({
      where: {
        id: {
          in: repairIds,
        },
      },
      select: repairSelect,
    });

    return new Map(repairs.map((repair) => [repair.id, repair]));
  }

  private mapMovement(
    movement: MovementRecord,
    repairsById: Map<string, RepairRecord>,
  ): MovementRow | null {
    const type = mapMovementType(movement.movementType);

    if (!type) {
      return null;
    }

    const repairId = repairIdFromMetadata(movement.metadata);
    const repair = repairId ? repairsById.get(repairId) : null;
    const machine =
      type === 'CHARGE' ? movement.toMachine : movement.fromMachine;
    const rack =
      type === 'CHARGE' ? movement.fromRackLocation : movement.toRackLocation;
    const faultLabel =
      repair?.faultCatalog?.label ??
      repair?.faultOtherText ??
      repair?.problemDescription ??
      null;
    const endedAt =
      type === 'FAULT_RESTORED'
        ? (repair?.completedAt ?? movement.createdAt).toISOString()
        : null;
    const faultDeclarationPhotoCount =
      repair?.photos?.filter(
        (photo) => photo.stage === RepairPhotoStage.FAULT_DECLARATION,
      ).length ?? 0;
    const repairCompletionPhotoCount =
      repair?.photos?.filter(
        (photo) => photo.stage === RepairPhotoStage.REPAIR_COMPLETION,
      ).length ?? 0;
    const legacyPhotoCount =
      typeof (repair as { _count?: { photos?: number } } | null | undefined)
        ?._count?.photos === 'number'
        ? (repair as unknown as { _count: { photos: number } })._count.photos
        : 0;
    const photoCount =
      type === 'FAULT_RESTORED'
        ? repairCompletionPhotoCount || legacyPhotoCount
        : type === 'FAULT_DECLARED'
          ? faultDeclarationPhotoCount || legacyPhotoCount
          : 0;

    return {
      id: movement.id,
      type,
      typeLabel: movementTypeLabels[type],
      vacuumSerial: movement.vacuumPad.serialNumber,
      vacuumCode: movement.vacuumPad.code,
      machineCode: machine?.code ?? null,
      rackCode: rack?.code ?? null,
      faultCode: repair?.faultCatalog?.code ?? null,
      faultLabel,
      repairId: repair?.id ?? repairId,
      photoCount,
      faultDeclarationPhotoCount,
      repairCompletionPhotoCount,
      startedAt:
        type === 'FAULT_DECLARED'
          ? (repair?.reportedAt ?? movement.createdAt).toISOString()
          : movement.createdAt.toISOString(),
      endedAt,
      details: buildDetails(movement, repair),
    };
  }
}

function mapMovementType(movementType: MovementType): AdminMovementType | null {
  switch (movementType) {
    case MovementType.CHARGE:
      return 'CHARGE';
    case MovementType.DECHARGE:
      return 'DECHARGE';
    case MovementType.REPAIR_INTAKE:
      return 'FAULT_DECLARED';
    case MovementType.REPAIR_RELEASE:
      return 'FAULT_RESTORED';
    default:
      return null;
  }
}

function repairIdFromMetadata(
  metadata: Prisma.JsonValue | null,
): string | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return null;
  }

  const value = (metadata as Record<string, unknown>).repairId;
  return typeof value === 'string' && value.trim() ? value : null;
}

function buildDetails(
  movement: MovementRecord,
  repair: RepairRecord | null | undefined,
) {
  const statusChange =
    movement.previousLocationStatus || movement.newLocationStatus
      ? `${movement.previousLocationStatus ?? '-'} -> ${movement.newLocationStatus ?? '-'}`
      : '';
  const operationalChange =
    movement.previousOperationalStatus || movement.newOperationalStatus
      ? `${movement.previousOperationalStatus ?? '-'} -> ${movement.newOperationalStatus ?? '-'}`
      : '';
  const parts = [
    repair?.code ? `Repair ${repair.code}` : '',
    movement.note,
    movement.operatorName ? `Operator: ${movement.operatorName}` : '',
    movement.deviceId ? `Device: ${movement.deviceId}` : '',
    statusChange ? `Location: ${statusChange}` : '',
    operationalChange ? `Status: ${operationalChange}` : '',
    repair?.outcome ? `Outcome: ${repair.outcome}` : '',
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(' | ') : null;
}

function matchesFilters(row: MovementRow, query: ListMovementsQuery) {
  const type = normalizeMovementType(query.type);

  if (type && row.type !== type) {
    return false;
  }

  if (!containsAny(query.vacuum, row.vacuumSerial, row.vacuumCode)) {
    return false;
  }

  if (!containsAny(query.machine, row.machineCode)) {
    return false;
  }

  if (!containsAny(query.rack, row.rackCode)) {
    return false;
  }

  if (!containsAny(query.fault, row.faultCode, row.faultLabel)) {
    return false;
  }

  if (!matchesDateRange(row.startedAt, query.startedFrom, query.startedTo)) {
    return false;
  }

  if (!matchesDateRange(row.endedAt, query.endedFrom, query.endedTo)) {
    return false;
  }

  return true;
}

function normalizeMovementType(value: string | undefined) {
  const normalized = value?.trim().toUpperCase();

  return normalized &&
    ['CHARGE', 'DECHARGE', 'FAULT_DECLARED', 'FAULT_RESTORED'].includes(
      normalized,
    )
    ? (normalized as AdminMovementType)
    : null;
}

function containsAny(
  filter: string | string[] | undefined,
  ...values: Array<string | null>
) {
  const normalizedFilters = parseFilterValues(filter).map((value) =>
    value.toLowerCase(),
  );

  if (normalizedFilters.length === 0) {
    return true;
  }

  return normalizedFilters.some((normalizedFilter) =>
    values.some((value) => value?.toLowerCase().includes(normalizedFilter)),
  );
}

function parseFilterValues(filter: string | string[] | undefined) {
  return (Array.isArray(filter) ? filter : [filter])
    .flatMap((value) => value?.split(',') ?? [])
    .map((value) => value.trim())
    .filter(Boolean);
}

function matchesDateRange(value: string | null, from?: string, to?: string) {
  const fromTime = parseDateTime(from);
  const toTime = parseDateTime(to);

  if (fromTime === null && toTime === null) {
    return true;
  }

  if (!value) {
    return false;
  }

  const actualTime = parseDateTime(value);

  if (actualTime === null) {
    return false;
  }

  if (fromTime !== null && actualTime < fromTime) {
    return false;
  }

  if (toTime !== null && actualTime > toTime) {
    return false;
  }

  return true;
}

function parseDateTime(value: string | undefined) {
  if (!value?.trim()) {
    return null;
  }

  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? null : timestamp;
}

function parsePositiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function parsePageSize(value: string | undefined) {
  const parsed = parsePositiveInteger(value, 50);

  return allowedPageSizes.has(parsed) ? parsed : 50;
}
