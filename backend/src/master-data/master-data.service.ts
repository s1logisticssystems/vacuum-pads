import {
  LocationStatus,
  MachineStatus,
  MovementType,
  OperationalStatus,
  Prisma,
  RackLocationType,
  RepairPriority,
  RepairStatus,
} from '@prisma/client';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { VacuumDisplayStatus } from '../qr/qr.types';
import {
  deriveIncompleteVacuumQrCode,
  deriveMachineQrCode,
  deriveRackQrCode,
  deriveVacuumQrCode,
} from '../../prisma/seed-helpers';
import {
  CreateFaultCatalogDto,
  CreateMachineDto,
  CreateRackLocationDto,
  CreateVacuumPadDto,
  UpdateFaultCatalogDto,
  UpdateMachineDto,
  UpdateRackLocationDto,
  UpdateVacuumPadDto,
} from './dto/master-data-write.dto';

const padSummarySelect = {
  id: true,
  code: true,
  qrCode: true,
  serialNumber: true,
  description: true,
  locationStatus: true,
  operationalStatus: true,
  currentMachineId: true,
} satisfies Prisma.VacuumPadSelect;

const machineCurrentPadSelect = {
  currentPads: {
    where: {
      deletedAt: null,
    },
    take: 1,
    select: padSummarySelect,
  },
  chargeSessions: {
    where: {
      dechargedAt: null,
    },
    orderBy: [{ chargedAt: 'desc' as const }, { createdAt: 'desc' as const }],
    take: 1,
    select: {
      id: true,
    },
  },
};

const rackSummarySelect = {
  id: true,
  code: true,
  qrCode: true,
  label: true,
  type: true,
  zone: true,
  rack: true,
  level: true,
  slot: true,
} satisfies Prisma.RackLocationSelect;

const machineSummarySelect = {
  id: true,
  code: true,
  qrCode: true,
  name: true,
  description: true,
  area: true,
  project: true,
  status: true,
} satisfies Prisma.MachineSelect;

const machineListSelect = {
  id: true,
  code: true,
  qrCode: true,
  name: true,
  description: true,
  area: true,
  project: true,
  status: true,
  updatedAt: true,
  ...machineCurrentPadSelect,
} satisfies Prisma.MachineSelect;

const rackListSelect = {
  id: true,
  code: true,
  qrCode: true,
  label: true,
  type: true,
  zone: true,
  rack: true,
  level: true,
  slot: true,
  capacity: true,
  isActive: true,
  currentPads: {
    where: {
      deletedAt: null,
    },
    take: 1,
    select: padSummarySelect,
  },
} satisfies Prisma.RackLocationSelect;

const faultCatalogSelect = {
  id: true,
  code: true,
  label: true,
  description: true,
  severity: true,
  isActive: true,
  sortOrder: true,
} satisfies Prisma.FaultCatalogSelect;

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
  createdAt: true,
  fromRackLocation: {
    select: rackSummarySelect,
  },
  toRackLocation: {
    select: rackSummarySelect,
  },
  fromMachine: {
    select: machineSummarySelect,
  },
  toMachine: {
    select: machineSummarySelect,
  },
} satisfies Prisma.PadMovementSelect;

const vacuumPadDetailSelect = {
  id: true,
  code: true,
  qrCode: true,
  serialNumber: true,
  description: true,
  dimensions: true,
  type: true,
  netWeightKg: true,
  dimensionLengthMm: true,
  dimensionWidthMm: true,
  dimensionHeightMm: true,
  liftingCapacityKg: true,
  costEuro: true,
  receivedAt: true,
  locationStatus: true,
  operationalStatus: true,
  currentMachineId: true,
  currentMachine: {
    select: machineSummarySelect,
  },
  currentRackLocation: {
    select: rackSummarySelect,
  },
  chargeSessions: {
    where: {
      dechargedAt: null,
    },
    orderBy: [{ chargedAt: 'desc' as const }, { createdAt: 'desc' as const }],
    take: 1,
    select: {
      id: true,
      machineId: true,
      chargedAt: true,
      chargeDeviceId: true,
      chargeOperatorName: true,
      note: true,
      machine: {
        select: machineSummarySelect,
      },
    },
  },
  repairs: {
    where: {
      completedAt: null,
      status: {
        in: [
          RepairStatus.REPORTED,
          RepairStatus.ASSIGNED,
          RepairStatus.UNDER_REPAIR,
        ],
      },
    },
    orderBy: [{ reportedAt: 'desc' as const }, { createdAt: 'desc' as const }],
    take: 1,
    select: {
      id: true,
      code: true,
      status: true,
      priority: true,
      reportedAt: true,
      problemDescription: true,
      faultOtherText: true,
      operatorName: true,
      faultCatalog: {
        select: faultCatalogSelect,
      },
      _count: {
        select: {
          photos: true,
        },
      },
    },
  },
  movements: {
    orderBy: [{ createdAt: 'desc' as const }],
    take: 10,
    select: movementSelect,
  },
} satisfies Prisma.VacuumPadSelect;

const vacuumPadListSelect = {
  id: true,
  code: true,
  qrCode: true,
  serialNumber: true,
  description: true,
  dimensions: true,
  type: true,
  netWeightKg: true,
  dimensionLengthMm: true,
  dimensionWidthMm: true,
  dimensionHeightMm: true,
  liftingCapacityKg: true,
  costEuro: true,
  receivedAt: true,
  locationStatus: true,
  operationalStatus: true,
  currentMachineId: true,
  updatedAt: true,
  currentMachine: {
    select: machineSummarySelect,
  },
  currentRackLocation: {
    select: rackSummarySelect,
  },
} satisfies Prisma.VacuumPadSelect;

type MachineListRecord = Prisma.MachineGetPayload<{
  select: typeof machineListSelect;
}>;

type RackListRecord = Prisma.RackLocationGetPayload<{
  select: typeof rackListSelect;
}>;

type FaultCatalogRecord = Prisma.FaultCatalogGetPayload<{
  select: typeof faultCatalogSelect;
}>;

type VacuumPadDetailRecord = Prisma.VacuumPadGetPayload<{
  select: typeof vacuumPadDetailSelect;
}>;

type VacuumPadListRecord = Prisma.VacuumPadGetPayload<{
  select: typeof vacuumPadListSelect;
}>;

type CurrentPadRecord = NonNullable<MachineListRecord['currentPads'][number]>;
type OpenChargeRecord = NonNullable<
  VacuumPadDetailRecord['chargeSessions'][number]
>;
type OpenRepairRecord = NonNullable<VacuumPadDetailRecord['repairs'][number]>;
type MovementRecord = VacuumPadDetailRecord['movements'][number];

export interface MasterDataListResponse<T> {
  items: T[];
  total: number;
}

export interface MasterDataCurrentPadSummary {
  id: string;
  code: string;
  qrCode: string;
  serialNumber: string | null;
  description: string | null;
  locationStatus: LocationStatus;
  operationalStatus: OperationalStatus;
  displayStatus: VacuumDisplayStatus;
}

export interface MasterDataMachineItem {
  id: string;
  code: string;
  qrCode: string;
  name: string;
  description: string | null;
  area: string | null;
  project: string | null;
  status: MachineStatus;
  updatedAt: string;
  isAvailableForCharge: boolean;
  currentPad: MasterDataCurrentPadSummary | null;
  openChargeSessionId: string | null;
}

export interface MasterDataRackItem {
  id: string;
  code: string;
  qrCode: string;
  label: string | null;
  type: RackLocationType;
  zone: string | null;
  rack: string | null;
  level: string | null;
  slot: string | null;
  capacity: number;
  isActive: boolean;
  isAvailable: boolean;
  currentPad: MasterDataCurrentPadSummary | null;
}

export interface MasterDataFaultCatalogItem {
  id: string;
  code: string;
  label: string;
  description: string | null;
  severity: RepairPriority | null;
  isActive: boolean;
  sortOrder: number;
}

export interface MasterDataMovementSummary {
  id: string;
  movementType: MovementType;
  previousLocationStatus: LocationStatus | null;
  newLocationStatus: LocationStatus | null;
  previousOperationalStatus: OperationalStatus | null;
  newOperationalStatus: OperationalStatus | null;
  deviceId: string | null;
  operatorName: string | null;
  note: string | null;
  createdAt: string;
  fromRackLocation: MasterDataRackLocationSummary | null;
  toRackLocation: MasterDataRackLocationSummary | null;
  fromMachine: MasterDataMachineSummary | null;
  toMachine: MasterDataMachineSummary | null;
}

export interface MasterDataMachineSummary {
  id: string;
  code: string;
  qrCode: string;
  name: string;
  description: string | null;
  area: string | null;
  project: string | null;
  status: MachineStatus;
}

export interface MasterDataRackLocationSummary {
  id: string;
  code: string;
  qrCode: string;
  label: string | null;
  type: RackLocationType;
  zone: string | null;
  rack: string | null;
  level: string | null;
  slot: string | null;
}

export interface MasterDataOpenChargeSummary {
  id: string;
  machineId: string;
  chargedAt: string;
  chargeDeviceId: string | null;
  chargeOperatorName: string | null;
  note: string | null;
  machine: MasterDataMachineSummary;
}

export interface MasterDataOpenRepairSummary {
  id: string;
  code: string | null;
  status: RepairStatus;
  priority: RepairPriority;
  reportedAt: string;
  problemDescription: string;
  faultOtherText: string | null;
  operatorName: string | null;
  faultCatalog: MasterDataFaultCatalogItem | null;
  photoCount: number;
}

export interface MasterDataVacuumPadDetailItem {
  id: string;
  code: string;
  qrCode: string;
  serialNumber: string | null;
  description: string | null;
  dimensions: string | null;
  type: string | null;
  netWeightKg: number | null;
  dimensionLengthMm: number | null;
  dimensionWidthMm: number | null;
  dimensionHeightMm: number | null;
  liftingCapacityKg: number | null;
  costEuro: number | null;
  receivedAt: string | null;
  locationStatus: LocationStatus;
  operationalStatus: OperationalStatus;
  displayStatus: VacuumDisplayStatus;
  isIncomplete: boolean;
  currentMachine: MasterDataMachineSummary | null;
  currentRackLocation: MasterDataRackLocationSummary | null;
  openChargeSession: MasterDataOpenChargeSummary | null;
  openRepair: MasterDataOpenRepairSummary | null;
  recentMovements: MasterDataMovementSummary[];
}

export interface MasterDataVacuumPadListItem {
  id: string;
  code: string;
  qrCode: string;
  serialNumber: string | null;
  description: string | null;
  dimensions: string | null;
  type: string | null;
  netWeightKg: number | null;
  dimensionLengthMm: number | null;
  dimensionWidthMm: number | null;
  dimensionHeightMm: number | null;
  liftingCapacityKg: number | null;
  costEuro: number | null;
  receivedAt: string | null;
  locationStatus: LocationStatus;
  operationalStatus: OperationalStatus;
  displayStatus: VacuumDisplayStatus;
  currentMachine: MasterDataMachineSummary | null;
  currentRackLocation: MasterDataRackLocationSummary | null;
  updatedAt: string;
  isIncomplete: boolean;
}

export interface MasterDataVacuumPadDetailSuccessResponse {
  ok: true;
  item: MasterDataVacuumPadDetailItem;
}

export interface MasterDataNotFoundResponse {
  ok: false;
  errorCode: 'NOT_FOUND';
  message: 'Not found';
}

export interface MasterDataWriteResponse<T> {
  ok: true;
  item: T;
}

export interface MasterDataDeleteResponse {
  ok: true;
  deleted?: true;
  deactivated?: true;
  reason?: string;
}

@Injectable()
export class MasterDataService {
  constructor(private readonly prismaService: PrismaService) {}

  async listMachines(query: {
    activeOnly?: string;
    availableOnly?: string;
  }): Promise<MasterDataListResponse<MasterDataMachineItem>> {
    const activeOnly = this.parseBooleanQuery(query.activeOnly, true);
    const availableOnly = this.parseBooleanQuery(query.availableOnly, false);

    const items = await this.prismaService.machine.findMany({
      where: {
        deletedAt: null,
        ...(activeOnly ? { status: MachineStatus.ACTIVE } : {}),
        ...(availableOnly
          ? {
              status: MachineStatus.ACTIVE,
              currentPads: {
                none: {
                  deletedAt: null,
                },
              },
              chargeSessions: {
                none: {
                  dechargedAt: null,
                },
              },
            }
          : {}),
      },
      orderBy: [{ code: 'asc' }],
      select: machineListSelect,
    });

    const mapped = items.map((item) => this.mapMachineItem(item));

    return {
      items: mapped,
      total: mapped.length,
    };
  }

  async listRackLocations(query: {
    activeOnly?: string;
    type?: string;
    availableOnly?: string;
  }): Promise<MasterDataListResponse<MasterDataRackItem>> {
    const activeOnly = this.parseBooleanQuery(query.activeOnly, true);
    const availableOnly = this.parseBooleanQuery(query.availableOnly, false);
    const type = this.parseRackTypeQuery(query.type);

    const items = await this.prismaService.rackLocation.findMany({
      where: {
        deletedAt: null,
        ...(activeOnly ? { isActive: true } : {}),
        ...(type ? { type } : {}),
        ...(availableOnly
          ? {
              currentPads: {
                none: {
                  deletedAt: null,
                },
              },
            }
          : {}),
      },
      orderBy: [
        { type: 'asc' },
        { zone: 'asc' },
        { rack: 'asc' },
        { level: 'asc' },
        { slot: 'asc' },
        { code: 'asc' },
      ],
      select: rackListSelect,
    });

    const mapped = items.map((item) => this.mapRackItem(item));

    return {
      items: mapped,
      total: mapped.length,
    };
  }

  async listFaultCatalog(
    query: {
      activeOnly?: string;
    } = {},
  ): Promise<MasterDataListResponse<MasterDataFaultCatalogItem>> {
    const activeOnly = this.parseBooleanQuery(query.activeOnly, true);

    const items = await this.prismaService.faultCatalog.findMany({
      where: {
        deletedAt: null,
        ...(activeOnly ? { isActive: true } : {}),
      },
      orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
      select: faultCatalogSelect,
    });

    return {
      items: items.map((item) => this.mapFaultCatalogItem(item)),
      total: items.length,
    };
  }

  async listVacuumPads(): Promise<
    MasterDataListResponse<MasterDataVacuumPadListItem>
  > {
    const items = await this.prismaService.vacuumPad.findMany({
      where: {
        deletedAt: null,
      },
      orderBy: [{ code: 'asc' }],
      select: vacuumPadListSelect,
    });

    return {
      items: items.map((item) => this.mapVacuumPadListItem(item)),
      total: items.length,
    };
  }

  async getVacuumPadDetail(
    id: string,
  ): Promise<
    MasterDataVacuumPadDetailSuccessResponse | MasterDataNotFoundResponse
  > {
    const item = await this.prismaService.vacuumPad.findFirst({
      where: {
        id,
        deletedAt: null,
      },
      select: vacuumPadDetailSelect,
    });

    if (!item) {
      return {
        ok: false,
        errorCode: 'NOT_FOUND',
        message: 'Not found',
      };
    }

    return {
      ok: true,
      item: this.mapVacuumPadDetail(item),
    };
  }

  async createVacuumPad(
    dto: CreateVacuumPadDto,
  ): Promise<MasterDataWriteResponse<MasterDataVacuumPadListItem>> {
    const code = dto.code
      ? this.normalizeRequiredString(dto.code, 'code')
      : await this.generateNextVacuumPadCode();
    const serialNumber = this.normalizeOptionalString(dto.serialNumber);

    await this.ensureVacuumPadUnique({ code, serialNumber });

    const item = await this.prismaService.vacuumPad.create({
      data: {
        code,
        serialNumber,
        qrCode: this.deriveVacuumQrCodeForMasterData(code, serialNumber),
        description: this.normalizeOptionalString(dto.description),
        dimensions: this.normalizeOptionalString(dto.dimensions),
        type: this.normalizeOptionalString(dto.type),
        netWeightKg: dto.netWeightKg ?? null,
        dimensionLengthMm: dto.dimensionLengthMm ?? null,
        dimensionWidthMm: dto.dimensionWidthMm ?? null,
        dimensionHeightMm: dto.dimensionHeightMm ?? null,
        liftingCapacityKg: dto.liftingCapacityKg ?? null,
        costEuro: dto.costEuro ?? null,
        receivedAt: this.normalizeOptionalDate(dto.receivedAt),
        operationalStatus:
          dto.operationalStatus ??
          (serialNumber
            ? OperationalStatus.FUNCTIONAL
            : OperationalStatus.OUT_OF_SERVICE),
        locationStatus: dto.locationStatus ?? LocationStatus.UNKNOWN,
      },
      select: vacuumPadListSelect,
    });

    return { ok: true, item: this.mapVacuumPadListItem(item) };
  }

  async updateVacuumPad(
    id: string,
    dto: UpdateVacuumPadDto,
  ): Promise<MasterDataWriteResponse<MasterDataVacuumPadListItem>> {
    const existing = await this.findExistingVacuumPad(id);
    const code = dto.code
      ? this.normalizeRequiredString(dto.code, 'code')
      : undefined;
    const serialNumber =
      dto.serialNumber === undefined
        ? undefined
        : this.normalizeOptionalString(dto.serialNumber);

    await this.ensureVacuumPadUnique({
      code,
      serialNumber,
      excludeId: existing.id,
    });

    const item = await this.prismaService.vacuumPad.update({
      where: { id: existing.id },
      data: this.removeUndefined({
        code,
        serialNumber,
        qrCode:
          serialNumber === undefined
            ? undefined
            : this.deriveVacuumQrCodeForMasterData(
                code ?? existing.code,
                serialNumber,
              ),
        description:
          dto.description === undefined
            ? undefined
            : this.normalizeOptionalString(dto.description),
        dimensions:
          dto.dimensions === undefined
            ? undefined
            : this.normalizeOptionalString(dto.dimensions),
        type:
          dto.type === undefined
            ? undefined
            : this.normalizeOptionalString(dto.type),
        netWeightKg: dto.netWeightKg,
        dimensionLengthMm: dto.dimensionLengthMm,
        dimensionWidthMm: dto.dimensionWidthMm,
        dimensionHeightMm: dto.dimensionHeightMm,
        liftingCapacityKg: dto.liftingCapacityKg,
        costEuro: dto.costEuro,
        receivedAt:
          dto.receivedAt === undefined
            ? undefined
            : this.normalizeOptionalDate(dto.receivedAt),
        operationalStatus: dto.operationalStatus,
        locationStatus: dto.locationStatus,
      }),
      select: vacuumPadListSelect,
    });

    return { ok: true, item: this.mapVacuumPadListItem(item) };
  }

  async deleteVacuumPad(id: string): Promise<MasterDataDeleteResponse> {
    const existing = await this.findExistingVacuumPad(id);
    const openChargeCount = await this.prismaService.chargeSession.count({
      where: { vacuumPadId: id, dechargedAt: null },
    });

    if (
      existing.currentMachineId ||
      existing.locationStatus === LocationStatus.ON_MACHINE ||
      openChargeCount > 0
    ) {
      throw new ConflictException(
        'Cannot deactivate a vacuum while it is assigned to a machine. Decharge it first.',
      );
    }

    await this.prismaService.vacuumPad.update({
      where: { id },
      data: { operationalStatus: OperationalStatus.RETIRED },
    });

    return {
      ok: true,
      deactivated: true,
      reason:
        'Vacuum was retired instead of deleted so traceability history stays intact.',
    };
  }

  async createMachine(
    dto: CreateMachineDto,
  ): Promise<MasterDataWriteResponse<MasterDataMachineItem>> {
    const code = dto.code
      ? this.normalizeRequiredString(dto.code, 'code')
      : await this.generateNextMachineCode();
    await this.ensureMachineUnique({ code });

    const item = await this.prismaService.machine.create({
      data: {
        code,
        qrCode: deriveMachineQrCode(code),
        name: this.normalizeRequiredString(dto.name, 'name'),
        status: dto.status ?? MachineStatus.ACTIVE,
        description: this.normalizeOptionalString(dto.description),
        area: this.normalizeOptionalString(dto.area),
        project: this.normalizeOptionalString(dto.project),
      },
      select: machineListSelect,
    });

    return { ok: true, item: this.mapMachineItem(item) };
  }

  async updateMachine(
    id: string,
    dto: UpdateMachineDto,
  ): Promise<MasterDataWriteResponse<MasterDataMachineItem>> {
    const existing = await this.findExistingMachine(id);
    const code = dto.code
      ? this.normalizeRequiredString(dto.code, 'code')
      : undefined;

    await this.ensureMachineUnique({ code, excludeId: existing.id });

    const item = await this.prismaService.machine.update({
      where: { id },
      data: this.removeUndefined({
        code,
        qrCode: code ? deriveMachineQrCode(code) : undefined,
        name: dto.name
          ? this.normalizeRequiredString(dto.name, 'name')
          : undefined,
        status: dto.status,
        description:
          dto.description === undefined
            ? undefined
            : this.normalizeOptionalString(dto.description),
        area:
          dto.area === undefined
            ? undefined
            : this.normalizeOptionalString(dto.area),
        project:
          dto.project === undefined
            ? undefined
            : this.normalizeOptionalString(dto.project),
      }),
      select: machineListSelect,
    });

    return { ok: true, item: this.mapMachineItem(item) };
  }

  async deleteMachine(id: string): Promise<MasterDataDeleteResponse> {
    await this.findExistingMachine(id);

    await this.prismaService.machine.update({
      where: { id },
      data: { status: MachineStatus.RETIRED },
    });

    return {
      ok: true,
      deactivated: true,
      reason:
        'Machine was retired instead of deleted so traceability history stays intact.',
    };
  }

  async createRackLocation(
    dto: CreateRackLocationDto,
  ): Promise<MasterDataWriteResponse<MasterDataRackItem>> {
    const code = dto.code
      ? this.normalizeRequiredString(dto.code, 'code')
      : this.generateRackLocationCode(dto);
    await this.ensureRackUnique({ code });

    const item = await this.prismaService.rackLocation.create({
      data: {
        code,
        qrCode: deriveRackQrCode(code),
        type: dto.type ?? RackLocationType.AVL,
        zone: this.normalizeOptionalString(dto.zone),
        rack: this.normalizeOptionalString(dto.rack),
        level: this.normalizeOptionalString(dto.level),
        slot: this.normalizeOptionalString(dto.slot),
        label: this.normalizeOptionalString(dto.label),
        isActive: dto.isActive ?? true,
      },
      select: rackListSelect,
    });

    return { ok: true, item: this.mapRackItem(item) };
  }

  async updateRackLocation(
    id: string,
    dto: UpdateRackLocationDto,
  ): Promise<MasterDataWriteResponse<MasterDataRackItem>> {
    const existing = await this.findExistingRackLocation(id);
    const code = dto.code
      ? this.normalizeRequiredString(dto.code, 'code')
      : undefined;

    await this.ensureRackUnique({ code, excludeId: existing.id });

    const item = await this.prismaService.rackLocation.update({
      where: { id },
      data: this.removeUndefined({
        code,
        qrCode: code ? deriveRackQrCode(code) : undefined,
        type: dto.type,
        zone:
          dto.zone === undefined
            ? undefined
            : this.normalizeOptionalString(dto.zone),
        rack:
          dto.rack === undefined
            ? undefined
            : this.normalizeOptionalString(dto.rack),
        level:
          dto.level === undefined
            ? undefined
            : this.normalizeOptionalString(dto.level),
        slot:
          dto.slot === undefined
            ? undefined
            : this.normalizeOptionalString(dto.slot),
        label:
          dto.label === undefined
            ? undefined
            : this.normalizeOptionalString(dto.label),
        isActive: dto.isActive,
      }),
      select: rackListSelect,
    });

    return { ok: true, item: this.mapRackItem(item) };
  }

  async deleteRackLocation(id: string): Promise<MasterDataDeleteResponse> {
    await this.findExistingRackLocation(id);

    await this.prismaService.rackLocation.update({
      where: { id },
      data: { isActive: false },
    });

    return {
      ok: true,
      deactivated: true,
      reason:
        'Rack location was deactivated instead of deleted so traceability history stays intact.',
    };
  }

  async createFaultCatalogItem(
    dto: CreateFaultCatalogDto,
  ): Promise<MasterDataWriteResponse<MasterDataFaultCatalogItem>> {
    const code = dto.code
      ? this.normalizeRequiredString(dto.code, 'code')
      : await this.generateNextFaultCatalogCode();
    await this.ensureFaultCatalogUnique({ code });

    const item = await this.prismaService.faultCatalog.create({
      data: {
        code,
        label: this.normalizeRequiredString(dto.label, 'label'),
        description: this.normalizeOptionalString(dto.description),
        severity: dto.severity ?? null,
        sortOrder: dto.sortOrder ?? 0,
        isActive: dto.isActive ?? true,
      },
      select: faultCatalogSelect,
    });

    return { ok: true, item: this.mapFaultCatalogItem(item) };
  }

  async updateFaultCatalogItem(
    id: string,
    dto: UpdateFaultCatalogDto,
  ): Promise<MasterDataWriteResponse<MasterDataFaultCatalogItem>> {
    const existing = await this.findExistingFaultCatalog(id);
    const code = dto.code
      ? this.normalizeRequiredString(dto.code, 'code')
      : undefined;

    await this.ensureFaultCatalogUnique({ code, excludeId: existing.id });

    const item = await this.prismaService.faultCatalog.update({
      where: { id },
      data: this.removeUndefined({
        code,
        label: dto.label
          ? this.normalizeRequiredString(dto.label, 'label')
          : undefined,
        description:
          dto.description === undefined
            ? undefined
            : this.normalizeOptionalString(dto.description),
        severity: dto.severity,
        sortOrder: dto.sortOrder,
        isActive: dto.isActive,
      }),
      select: faultCatalogSelect,
    });

    return { ok: true, item: this.mapFaultCatalogItem(item) };
  }

  async deleteFaultCatalogItem(id: string): Promise<MasterDataDeleteResponse> {
    await this.findExistingFaultCatalog(id);

    await this.prismaService.faultCatalog.update({
      where: { id },
      data: { isActive: false },
    });

    return {
      ok: true,
      deactivated: true,
      reason:
        'Fault catalog item was deactivated instead of deleted so repair history stays intact.',
    };
  }

  private async findExistingVacuumPad(id: string) {
    const record = await this.prismaService.vacuumPad.findFirst({
      where: { id, deletedAt: null },
      select: {
        id: true,
        code: true,
        currentMachineId: true,
        currentRackLocationId: true,
        locationStatus: true,
      },
    });

    if (!record) {
      throw new NotFoundException('Vacuum pad not found');
    }

    return record;
  }

  private async findExistingMachine(id: string) {
    const record = await this.prismaService.machine.findFirst({
      where: { id, deletedAt: null },
      select: { id: true },
    });

    if (!record) {
      throw new NotFoundException('Machine not found');
    }

    return record;
  }

  private async findExistingRackLocation(id: string) {
    const record = await this.prismaService.rackLocation.findFirst({
      where: { id, deletedAt: null },
      select: { id: true },
    });

    if (!record) {
      throw new NotFoundException('Rack location not found');
    }

    return record;
  }

  private async findExistingFaultCatalog(id: string) {
    const record = await this.prismaService.faultCatalog.findFirst({
      where: { id, deletedAt: null },
      select: { id: true },
    });

    if (!record) {
      throw new NotFoundException('Fault catalog item not found');
    }

    return record;
  }

  private async ensureVacuumPadUnique({
    code,
    serialNumber,
    excludeId,
  }: {
    code?: string;
    serialNumber?: string | null;
    excludeId?: string;
  }) {
    const conditions = [
      code ? { code } : null,
      serialNumber ? { serialNumber } : null,
      serialNumber ? { qrCode: deriveVacuumQrCode(serialNumber) } : null,
    ].filter(Boolean) as Prisma.VacuumPadWhereInput[];

    if (conditions.length === 0) {
      return;
    }

    const duplicate = await this.prismaService.vacuumPad.findFirst({
      where: {
        OR: conditions,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true },
    });

    if (duplicate) {
      throw new ConflictException('Duplicate vacuum code or serial number');
    }
  }

  private async generateNextVacuumPadCode() {
    const existingCodes = await this.prismaService.vacuumPad.findMany({
      where: {
        code: {
          startsWith: 'VP-',
        },
      },
      select: {
        code: true,
      },
    });
    const maxNumber = existingCodes.reduce((currentMax, item) => {
      const match = /^VP-(\d+)$/.exec(item.code);
      const parsed = match ? Number(match[1]) : 0;
      return Number.isFinite(parsed) && parsed > currentMax
        ? parsed
        : currentMax;
    }, 0);

    return `VP-${String(maxNumber + 1).padStart(3, '0')}`;
  }

  private async generateNextMachineCode() {
    const existingCodes = await this.prismaService.machine.findMany({
      where: {
        code: {
          startsWith: 'MACH-',
        },
      },
      select: {
        code: true,
      },
    });

    return this.nextAvailableNumberedCode(
      existingCodes.map((item) => item.code),
      'MACH',
    );
  }

  private async generateNextFaultCatalogCode() {
    const existingCodes = await this.prismaService.faultCatalog.findMany({
      where: {
        code: {
          startsWith: 'FC-',
        },
      },
      select: {
        code: true,
      },
    });

    return this.nextAvailableNumberedCode(
      existingCodes.map((item) => item.code),
      'FC',
    );
  }

  private nextAvailableNumberedCode(existingCodes: string[], prefix: string) {
    const matcher = new RegExp(`^${prefix}-(\\d+)$`);
    const usedNumbers = new Set(
      existingCodes
        .map((code) => matcher.exec(code)?.[1])
        .filter((value): value is string => Boolean(value))
        .map((value) => Number(value))
        .filter((value) => Number.isInteger(value) && value > 0),
    );
    let nextNumber = 1;

    while (usedNumbers.has(nextNumber)) {
      nextNumber += 1;
    }

    return `${prefix}-${String(nextNumber).padStart(3, '0')}`;
  }

  private generateRackLocationCode(dto: CreateRackLocationDto) {
    const area = this.normalizeRackCodeSegment(dto.zone, 'area');
    const row = this.normalizeRackRowSegment(dto.rack, area);
    const position = this.normalizeRackCodeSegment(dto.slot, 'position', true);

    return `RACK-${area}-${row}-${position}`;
  }

  private normalizeRackRowSegment(value: string | undefined, area: string) {
    const normalized = this.normalizeRackCodeSegment(value, 'row', true);
    const areaPrefix = `${area}-`;
    const rowWithoutAreaPrefix = normalized.startsWith(areaPrefix)
      ? normalized.slice(areaPrefix.length)
      : normalized;

    return /^\d+$/.test(rowWithoutAreaPrefix)
      ? rowWithoutAreaPrefix.padStart(2, '0')
      : rowWithoutAreaPrefix;
  }

  private normalizeRackCodeSegment(
    value: string | undefined,
    fieldName: string,
    padNumeric = false,
  ) {
    const normalized = this.normalizeRequiredString(value ?? '', fieldName)
      .toUpperCase()
      .replace(/\s+/g, '-');

    if (!/^[A-Z0-9-]+$/.test(normalized)) {
      throw new BadRequestException(
        `${fieldName} may contain only letters, numbers, and hyphens`,
      );
    }

    return padNumeric && /^\d+$/.test(normalized)
      ? normalized.padStart(2, '0')
      : normalized;
  }

  private async ensureMachineUnique({
    code,
    excludeId,
  }: {
    code?: string;
    excludeId?: string;
  }) {
    if (!code) {
      return;
    }

    const duplicate = await this.prismaService.machine.findFirst({
      where: {
        OR: [{ code }, { qrCode: deriveMachineQrCode(code) }],
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true },
    });

    if (duplicate) {
      throw new ConflictException('Duplicate machine code');
    }
  }

  private async ensureRackUnique({
    code,
    excludeId,
  }: {
    code?: string;
    excludeId?: string;
  }) {
    if (!code) {
      return;
    }

    const duplicate = await this.prismaService.rackLocation.findFirst({
      where: {
        OR: [{ code }, { qrCode: deriveRackQrCode(code) }],
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true },
    });

    if (duplicate) {
      throw new ConflictException('Duplicate rack location code');
    }
  }

  private async ensureFaultCatalogUnique({
    code,
    excludeId,
  }: {
    code?: string;
    excludeId?: string;
  }) {
    if (!code) {
      return;
    }

    const duplicate = await this.prismaService.faultCatalog.findFirst({
      where: {
        code,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true },
    });

    if (duplicate) {
      throw new ConflictException('Duplicate fault catalog code');
    }
  }

  private normalizeRequiredString(value: string, fieldName: string) {
    const normalized = value.trim();

    if (!normalized) {
      throw new BadRequestException(`${fieldName} is required`);
    }

    return normalized;
  }

  private normalizeOptionalString(value: string | undefined) {
    const normalized = value?.trim();
    return normalized ? normalized : null;
  }

  private normalizeOptionalDate(value: Date | string | undefined) {
    if (value === undefined) {
      return undefined;
    }

    if (typeof value === 'string') {
      const normalized = value.trim();
      if (!normalized) {
        return null;
      }

      const parsed = new Date(normalized);
      if (Number.isNaN(parsed.getTime())) {
        throw new BadRequestException('receivedAt must be a valid date');
      }

      return parsed;
    }

    if (Number.isNaN(value.getTime())) {
      throw new BadRequestException('receivedAt must be a valid date');
    }

    return value;
  }

  private nullableNumber(value: unknown): number | null {
    if (value === undefined || value === null) {
      return null;
    }

    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  }

  private removeUndefined<T extends Record<string, unknown>>(value: T) {
    return Object.fromEntries(
      Object.entries(value).filter(([, entry]) => entry !== undefined),
    ) as Partial<T>;
  }

  private mapMachineItem(record: MachineListRecord): MasterDataMachineItem {
    const currentPad = record.currentPads[0] ?? null;
    const openChargeSession = record.chargeSessions[0] ?? null;
    const isAvailableForCharge =
      record.status === MachineStatus.ACTIVE &&
      currentPad === null &&
      openChargeSession === null;

    return {
      id: record.id,
      code: record.code,
      qrCode: record.qrCode,
      name: record.name,
      description: record.description,
      area: record.area,
      project: record.project,
      status: record.status,
      updatedAt: record.updatedAt.toISOString(),
      isAvailableForCharge,
      currentPad: currentPad ? this.mapCurrentPadSummary(currentPad) : null,
      openChargeSessionId: openChargeSession?.id ?? null,
    };
  }

  private mapRackItem(record: RackListRecord): MasterDataRackItem {
    const currentPad = record.currentPads[0] ?? null;

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
      capacity: record.capacity,
      isActive: record.isActive,
      isAvailable: currentPad === null,
      currentPad: currentPad ? this.mapCurrentPadSummary(currentPad) : null,
    };
  }

  private mapVacuumPadDetail(
    record: VacuumPadDetailRecord,
  ): MasterDataVacuumPadDetailItem {
    return {
      id: record.id,
      code: record.code,
      qrCode: record.qrCode,
      serialNumber: record.serialNumber,
      description: record.description,
      dimensions: record.dimensions,
      type: record.type,
      netWeightKg: this.nullableNumber(record.netWeightKg),
      dimensionLengthMm: this.nullableNumber(record.dimensionLengthMm),
      dimensionWidthMm: this.nullableNumber(record.dimensionWidthMm),
      dimensionHeightMm: this.nullableNumber(record.dimensionHeightMm),
      liftingCapacityKg: this.nullableNumber(record.liftingCapacityKg),
      costEuro: this.nullableNumber(record.costEuro),
      receivedAt: record.receivedAt?.toISOString() ?? null,
      locationStatus: record.locationStatus,
      operationalStatus: record.operationalStatus,
      displayStatus: this.getDisplayStatus(record),
      isIncomplete: !record.serialNumber,
      currentMachine: record.currentMachine
        ? this.mapMachineSummary(record.currentMachine)
        : null,
      currentRackLocation: record.currentRackLocation
        ? this.mapRackSummary(record.currentRackLocation)
        : null,
      openChargeSession: record.chargeSessions[0]
        ? this.mapOpenChargeSummary(record.chargeSessions[0])
        : null,
      openRepair: record.repairs[0]
        ? this.mapOpenRepairSummary(record.repairs[0])
        : null,
      recentMovements: record.movements.map((movement) =>
        this.mapMovementSummary(movement),
      ),
    };
  }

  private mapVacuumPadListItem(
    record: VacuumPadListRecord,
  ): MasterDataVacuumPadListItem {
    return {
      id: record.id,
      code: record.code,
      qrCode: record.qrCode,
      serialNumber: record.serialNumber,
      description: record.description,
      dimensions: record.dimensions,
      type: record.type,
      netWeightKg: this.nullableNumber(record.netWeightKg),
      dimensionLengthMm: this.nullableNumber(record.dimensionLengthMm),
      dimensionWidthMm: this.nullableNumber(record.dimensionWidthMm),
      dimensionHeightMm: this.nullableNumber(record.dimensionHeightMm),
      liftingCapacityKg: this.nullableNumber(record.liftingCapacityKg),
      costEuro: this.nullableNumber(record.costEuro),
      receivedAt: record.receivedAt?.toISOString() ?? null,
      locationStatus: record.locationStatus,
      operationalStatus: record.operationalStatus,
      displayStatus: this.getDisplayStatus(record),
      isIncomplete: !record.serialNumber,
      currentMachine: record.currentMachine
        ? this.mapMachineSummary(record.currentMachine)
        : null,
      currentRackLocation: record.currentRackLocation
        ? this.mapRackSummary(record.currentRackLocation)
        : null,
      updatedAt: record.updatedAt.toISOString(),
    };
  }

  private mapCurrentPadSummary(
    record: CurrentPadRecord,
  ): MasterDataCurrentPadSummary {
    return {
      id: record.id,
      code: record.code,
      qrCode: record.qrCode,
      serialNumber: record.serialNumber,
      description: record.description,
      locationStatus: record.locationStatus,
      operationalStatus: record.operationalStatus,
      displayStatus: this.getDisplayStatus(record),
    };
  }

  private mapMachineSummary(record: {
    id: string;
    code: string;
    qrCode: string;
    name: string;
    description: string | null;
    area: string | null;
    project: string | null;
    status: MachineStatus;
  }): MasterDataMachineSummary {
    return {
      id: record.id,
      code: record.code,
      qrCode: record.qrCode,
      name: record.name,
      description: record.description,
      area: record.area,
      project: record.project,
      status: record.status,
    };
  }

  private mapRackSummary(record: {
    id: string;
    code: string;
    qrCode: string;
    label: string | null;
    type: RackLocationType;
    zone: string | null;
    rack: string | null;
    level: string | null;
    slot: string | null;
  }): MasterDataRackLocationSummary {
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
    };
  }

  private mapFaultCatalogItem(
    record: FaultCatalogRecord,
  ): MasterDataFaultCatalogItem {
    return {
      id: record.id,
      code: record.code,
      label: record.label,
      description: record.description,
      severity: record.severity ?? null,
      isActive: record.isActive,
      sortOrder: record.sortOrder,
    };
  }

  private mapOpenChargeSummary(
    record: OpenChargeRecord,
  ): MasterDataOpenChargeSummary {
    return {
      id: record.id,
      machineId: record.machineId,
      chargedAt: record.chargedAt.toISOString(),
      chargeDeviceId: record.chargeDeviceId,
      chargeOperatorName: record.chargeOperatorName,
      note: record.note,
      machine: this.mapMachineSummary(record.machine),
    };
  }

  private mapOpenRepairSummary(
    record: OpenRepairRecord,
  ): MasterDataOpenRepairSummary {
    return {
      id: record.id,
      code: record.code,
      status: record.status,
      priority: record.priority,
      reportedAt: record.reportedAt.toISOString(),
      problemDescription: record.problemDescription,
      faultOtherText: record.faultOtherText,
      operatorName: record.operatorName,
      faultCatalog: record.faultCatalog
        ? this.mapFaultCatalogItem(record.faultCatalog)
        : null,
      photoCount: record._count.photos,
    };
  }

  private mapMovementSummary(
    record: MovementRecord,
  ): MasterDataMovementSummary {
    return {
      id: record.id,
      movementType: record.movementType,
      previousLocationStatus: record.previousLocationStatus,
      newLocationStatus: record.newLocationStatus,
      previousOperationalStatus: record.previousOperationalStatus,
      newOperationalStatus: record.newOperationalStatus,
      deviceId: record.deviceId,
      operatorName: record.operatorName,
      note: record.note,
      createdAt: record.createdAt.toISOString(),
      fromRackLocation: record.fromRackLocation
        ? this.mapRackSummary(record.fromRackLocation)
        : null,
      toRackLocation: record.toRackLocation
        ? this.mapRackSummary(record.toRackLocation)
        : null,
      fromMachine: record.fromMachine
        ? this.mapMachineSummary(record.fromMachine)
        : null,
      toMachine: record.toMachine
        ? this.mapMachineSummary(record.toMachine)
        : null,
    };
  }

  private parseBooleanQuery(value: string | undefined, defaultValue: boolean) {
    if (value === undefined) {
      return defaultValue;
    }

    const normalized = value.trim().toLowerCase();

    if (normalized === 'true') {
      return true;
    }

    if (normalized === 'false') {
      return false;
    }

    throw new BadRequestException(
      `${value} is not a valid boolean query value`,
    );
  }

  private parseRackTypeQuery(
    value: string | undefined,
  ): RackLocationType | undefined {
    const normalized = value?.trim().toUpperCase();

    if (!normalized) {
      return undefined;
    }

    if (normalized === RackLocationType.AVL) {
      return RackLocationType.AVL;
    }

    if (normalized === RackLocationType.REP) {
      return RackLocationType.REP;
    }

    throw new BadRequestException('Invalid rack location type');
  }

  private getDisplayStatus(vacuum: {
    serialNumber?: string | null;
    currentMachineId: string | null;
    locationStatus: LocationStatus;
    operationalStatus: OperationalStatus;
  }): VacuumDisplayStatus {
    if (vacuum.serialNumber === null) {
      return 'NOTACTIVE';
    }

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

  private deriveVacuumQrCodeForMasterData(
    code: string,
    serialNumber: string | null,
  ) {
    return serialNumber
      ? deriveVacuumQrCode(serialNumber)
      : deriveIncompleteVacuumQrCode(code);
  }
}
