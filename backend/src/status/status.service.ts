import {
  LocationStatus,
  OperationalStatus,
  Prisma,
  RackLocationType,
  RepairPriority,
  RepairStatus,
} from '@prisma/client';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

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
  area: true,
  project: true,
} satisfies Prisma.MachineSelect;

const activeVacuumSelect = {
  id: true,
  code: true,
  serialNumber: true,
  description: true,
  locationStatus: true,
  operationalStatus: true,
  currentMachine: {
    select: machineSummarySelect,
  },
  chargeSessions: {
    where: {
      dechargedAt: null,
    },
    orderBy: [{ chargedAt: 'desc' as const }, { createdAt: 'desc' as const }],
    take: 1,
    select: {
      id: true,
      chargedAt: true,
    },
  },
} satisfies Prisma.VacuumPadSelect;

const inactiveVacuumSelect = {
  id: true,
  code: true,
  serialNumber: true,
  description: true,
  locationStatus: true,
  operationalStatus: true,
  updatedAt: true,
  currentRackLocation: {
    select: rackSummarySelect,
  },
} satisfies Prisma.VacuumPadSelect;

const repairVacuumSelect = {
  id: true,
  code: true,
  serialNumber: true,
  description: true,
  locationStatus: true,
  operationalStatus: true,
  currentRackLocation: {
    select: rackSummarySelect,
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
      faultCatalog: {
        select: {
          code: true,
          label: true,
        },
      },
      _count: {
        select: {
          photos: true,
        },
      },
    },
  },
} satisfies Prisma.VacuumPadSelect;

type ActiveVacuumRecord = Prisma.VacuumPadGetPayload<{
  select: typeof activeVacuumSelect;
}>;

type InactiveVacuumRecord = Prisma.VacuumPadGetPayload<{
  select: typeof inactiveVacuumSelect;
}>;

type RepairVacuumRecord = Prisma.VacuumPadGetPayload<{
  select: typeof repairVacuumSelect;
}>;

type RackSummaryRecord = NonNullable<
  InactiveVacuumRecord['currentRackLocation']
>;

type MachineSummaryRecord = NonNullable<ActiveVacuumRecord['currentMachine']>;

type OpenRepairRecord = RepairVacuumRecord['repairs'][number];

export interface StatusRackSummary {
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

export interface StatusMachineSummary {
  id: string;
  code: string;
  qrCode: string;
  name: string;
  area: string | null;
  project: string | null;
}

export interface StatusOpenRepairSummary {
  id: string;
  code: string | null;
  status: RepairStatus;
  priority: RepairPriority;
  reportedAt: string;
  problemDescription: string;
  faultCatalog: {
    code: string;
    label: string;
  } | null;
  photoCount: number;
}

export interface ActiveVacuumStatusItem {
  id: string;
  code: string;
  serialNumber: string | null;
  description: string | null;
  locationStatus: LocationStatus;
  operationalStatus: OperationalStatus;
  displayStatus: 'ACTIVE';
  machine: StatusMachineSummary | null;
  chargedAt: string | null;
  chargeSessionId: string | null;
}

export interface InactiveVacuumStatusItem {
  id: string;
  code: string;
  serialNumber: string | null;
  description: string | null;
  locationStatus: LocationStatus;
  operationalStatus: OperationalStatus;
  displayStatus: 'NOTACTIVE';
  rack: StatusRackSummary | null;
  updatedAt: string | null;
}

export interface RepairVacuumStatusItem {
  id: string;
  code: string;
  serialNumber: string | null;
  description: string | null;
  locationStatus: LocationStatus;
  operationalStatus: OperationalStatus;
  displayStatus: 'REPAIR';
  rack: StatusRackSummary | null;
  openRepair: StatusOpenRepairSummary | null;
}

export interface StatusListResponse<T> {
  items: T[];
  total: number;
}

export interface StatusSummaryResponse {
  active: number;
  inactive: number;
  repair: number;
}

@Injectable()
export class StatusService {
  constructor(private readonly prismaService: PrismaService) {}

  async listActiveVacuums(): Promise<
    StatusListResponse<ActiveVacuumStatusItem>
  > {
    const items = await this.prismaService.vacuumPad.findMany({
      where: {
        deletedAt: null,
        serialNumber: { not: null },
        OR: [
          { currentMachineId: { not: null } },
          { locationStatus: LocationStatus.ON_MACHINE },
        ],
      },
      orderBy: [{ code: 'asc' }],
      select: activeVacuumSelect,
    });

    return {
      items: items.map((item) => this.mapActiveVacuum(item)),
      total: items.length,
    };
  }

  async listInactiveVacuums(): Promise<
    StatusListResponse<InactiveVacuumStatusItem>
  > {
    const items = await this.prismaService.vacuumPad.findMany({
      where: {
        deletedAt: null,
        serialNumber: { not: null },
        currentMachineId: null,
        locationStatus: LocationStatus.IN_RACK,
        operationalStatus: {
          notIn: [OperationalStatus.UNDER_REPAIR, OperationalStatus.RETIRED],
        },
      },
      orderBy: [{ code: 'asc' }],
      select: inactiveVacuumSelect,
    });

    return {
      items: items.map((item) => this.mapInactiveVacuum(item)),
      total: items.length,
    };
  }

  async listRepairVacuums(): Promise<
    StatusListResponse<RepairVacuumStatusItem>
  > {
    const items = await this.prismaService.vacuumPad.findMany({
      where: {
        deletedAt: null,
        serialNumber: { not: null },
        OR: [
          { locationStatus: LocationStatus.IN_REPAIR },
          { operationalStatus: OperationalStatus.UNDER_REPAIR },
        ],
      },
      orderBy: [{ code: 'asc' }],
      select: repairVacuumSelect,
    });

    return {
      items: items.map((item) => this.mapRepairVacuum(item)),
      total: items.length,
    };
  }

  async getSummary(): Promise<StatusSummaryResponse> {
    const [active, inactive, repair] = await Promise.all([
      this.prismaService.vacuumPad.count({
        where: {
          deletedAt: null,
          serialNumber: { not: null },
          OR: [
            { currentMachineId: { not: null } },
            { locationStatus: LocationStatus.ON_MACHINE },
          ],
        },
      }),
      this.prismaService.vacuumPad.count({
        where: {
          deletedAt: null,
          serialNumber: { not: null },
          currentMachineId: null,
          locationStatus: LocationStatus.IN_RACK,
          operationalStatus: {
            notIn: [OperationalStatus.UNDER_REPAIR, OperationalStatus.RETIRED],
          },
        },
      }),
      this.prismaService.vacuumPad.count({
        where: {
          deletedAt: null,
          serialNumber: { not: null },
          OR: [
            { locationStatus: LocationStatus.IN_REPAIR },
            { operationalStatus: OperationalStatus.UNDER_REPAIR },
          ],
        },
      }),
    ]);

    return {
      active,
      inactive,
      repair,
    };
  }

  private mapActiveVacuum(record: ActiveVacuumRecord): ActiveVacuumStatusItem {
    return {
      id: record.id,
      code: record.code,
      serialNumber: record.serialNumber,
      description: record.description,
      locationStatus: record.locationStatus,
      operationalStatus: record.operationalStatus,
      displayStatus: 'ACTIVE',
      machine: record.currentMachine
        ? this.mapMachineSummary(record.currentMachine)
        : null,
      chargedAt: record.chargeSessions[0]?.chargedAt.toISOString() ?? null,
      chargeSessionId: record.chargeSessions[0]?.id ?? null,
    };
  }

  private mapInactiveVacuum(
    record: InactiveVacuumRecord,
  ): InactiveVacuumStatusItem {
    return {
      id: record.id,
      code: record.code,
      serialNumber: record.serialNumber,
      description: record.description,
      locationStatus: record.locationStatus,
      operationalStatus: record.operationalStatus,
      displayStatus: 'NOTACTIVE',
      rack: record.currentRackLocation
        ? this.mapRackSummary(record.currentRackLocation)
        : null,
      updatedAt: record.updatedAt?.toISOString() ?? null,
    };
  }

  private mapRepairVacuum(record: RepairVacuumRecord): RepairVacuumStatusItem {
    return {
      id: record.id,
      code: record.code,
      serialNumber: record.serialNumber,
      description: record.description,
      locationStatus: record.locationStatus,
      operationalStatus: record.operationalStatus,
      displayStatus: 'REPAIR',
      rack: record.currentRackLocation
        ? this.mapRackSummary(record.currentRackLocation)
        : null,
      openRepair: record.repairs[0]
        ? this.mapOpenRepairSummary(record.repairs[0])
        : null,
    };
  }

  private mapMachineSummary(
    record: MachineSummaryRecord,
  ): StatusMachineSummary {
    return {
      id: record.id,
      code: record.code,
      qrCode: record.qrCode,
      name: record.name,
      area: record.area,
      project: record.project,
    };
  }

  private mapRackSummary(record: RackSummaryRecord): StatusRackSummary {
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

  private mapOpenRepairSummary(
    record: OpenRepairRecord,
  ): StatusOpenRepairSummary {
    return {
      id: record.id,
      code: record.code,
      status: record.status,
      priority: record.priority,
      reportedAt: record.reportedAt.toISOString(),
      problemDescription: record.problemDescription,
      faultCatalog: record.faultCatalog
        ? {
            code: record.faultCatalog.code,
            label: record.faultCatalog.label,
          }
        : null,
      photoCount: record._count.photos,
    };
  }
}
