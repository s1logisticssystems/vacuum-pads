import { Injectable } from '@nestjs/common';
import {
  LocationStatus,
  MachineStatus,
  OperationalStatus,
  Prisma,
  RackLocationType,
} from '@prisma/client';
import { QrScanDto } from './dto/qr-scan.dto';
import { PrismaService } from '../prisma/prisma.service';
import {
  CurrentPadSummary,
  CurrentRackLocationSummary,
  MachineScanEntity,
  ParsedQrPayload,
  QrEntityType,
  QrInputFormat,
  QrScanContext,
  QrScanErrorResponse,
  QrScanInputEcho,
  QrScanResponse,
  RackScanEntity,
  VacuumDisplayStatus,
  VacuumScanEntity,
  WorkflowHints,
} from './qr.types';

type VacuumRecord = Prisma.VacuumPadGetPayload<{
  select: typeof QrService.vacuumSelect;
}>;

type RackRecord = Prisma.RackLocationGetPayload<{
  select: typeof QrService.rackSelect;
}>;

type MachineRecord = Prisma.MachineGetPayload<{
  select: typeof QrService.machineSelect;
}>;

@Injectable()
export class QrService {
  static readonly vacuumSelect = {
    id: true,
    code: true,
    qrCode: true,
    serialNumber: true,
    description: true,
    locationStatus: true,
    operationalStatus: true,
    currentMachineId: true,
    currentRackLocationId: true,
    currentMachine: {
      select: {
        id: true,
        code: true,
        qrCode: true,
        name: true,
        status: true,
      },
    },
    currentRackLocation: {
      select: {
        id: true,
        code: true,
        qrCode: true,
        label: true,
        type: true,
        zone: true,
        rack: true,
        level: true,
        slot: true,
      },
    },
  } as const;

  static readonly rackSelect = {
    id: true,
    code: true,
    qrCode: true,
    label: true,
    type: true,
    zone: true,
    rack: true,
    level: true,
    slot: true,
    currentPads: {
      where: {
        deletedAt: null,
      },
      take: 1,
      select: {
        id: true,
        code: true,
        qrCode: true,
        serialNumber: true,
        locationStatus: true,
        operationalStatus: true,
        currentMachineId: true,
      },
    },
  } as const;

  static readonly machineSelect = {
    id: true,
    code: true,
    qrCode: true,
    name: true,
    status: true,
    area: true,
    project: true,
    currentPads: {
      where: {
        deletedAt: null,
      },
      take: 1,
      select: {
        id: true,
        code: true,
        qrCode: true,
        serialNumber: true,
        locationStatus: true,
        operationalStatus: true,
        currentMachineId: true,
      },
    },
  } as const;

  constructor(private readonly prismaService: PrismaService) {}

  async scan(dto: QrScanDto): Promise<QrScanResponse> {
    const input = this.createInputEcho(dto);
    const parsed = this.parseRawPayload(dto.raw);

    if (!parsed.ok) {
      return this.buildError(
        input,
        parsed.errorCode,
        parsed.message,
        parsed.format,
      );
    }

    const parsedInput = {
      ...input,
      format: parsed.payload.format,
    };

    switch (parsed.payload.entityType) {
      case QrEntityType.VACUUM:
        return this.lookupVacuum(parsedInput, parsed.payload);
      case QrEntityType.RACK:
        return this.lookupRack(parsedInput, parsed.payload);
      case QrEntityType.MACHINE:
        return this.lookupMachine(parsedInput, parsed.payload);
    }
  }

  private createInputEcho(dto: QrScanDto): QrScanInputEcho {
    return {
      raw: dto.raw,
      normalizedRaw: dto.raw.trim(),
      context: dto.context,
      deviceId: dto.deviceId,
      operatorName: dto.operatorName?.trim() || null,
    };
  }

  parseRawPayload(raw: string):
    | { ok: true; payload: ParsedQrPayload }
    | {
        ok: false;
        errorCode: QrScanErrorResponse['errorCode'];
        message: string;
        format?: QrInputFormat;
      } {
    const normalizedRaw = raw.trim();

    if (!normalizedRaw) {
      return {
        ok: false,
        errorCode: 'QR_MALFORMED',
        message: 'Malformed QR payload',
      };
    }

    if (normalizedRaw.startsWith('{')) {
      return this.parseJsonPayload(normalizedRaw);
    }

    const separatorIndex = normalizedRaw.indexOf(':');

    if (separatorIndex >= 0) {
      return this.parseCompactPayload(normalizedRaw, separatorIndex);
    }

    // MVP compatibility mode: a raw value without a prefix is treated as a
    // vacuum identifier lookup only, using qrCode/serialNumber/code.
    return {
      ok: true,
      payload: {
        entityType: QrEntityType.VACUUM,
        value: normalizedRaw,
        format: QrInputFormat.LEGACY_RAW,
      },
    };
  }

  private parseJsonPayload(normalizedRaw: string):
    | { ok: true; payload: ParsedQrPayload }
    | {
        ok: false;
        errorCode: QrScanErrorResponse['errorCode'];
        message: string;
        format: QrInputFormat.JSON;
      } {
    let payload: unknown;

    try {
      payload = JSON.parse(normalizedRaw);
    } catch {
      return {
        ok: false,
        errorCode: 'QR_MALFORMED',
        message: 'Malformed QR payload',
        format: QrInputFormat.JSON,
      };
    }

    if (!payload || typeof payload !== 'object') {
      return {
        ok: false,
        errorCode: 'QR_MALFORMED',
        message: 'Malformed QR payload',
        format: QrInputFormat.JSON,
      };
    }

    const jsonPayload = payload as {
      v?: unknown;
      type?: unknown;
      id?: unknown;
    };

    if (jsonPayload.v !== 1) {
      return {
        ok: false,
        errorCode: 'QR_UNSUPPORTED',
        message: 'Unsupported QR type or format',
        format: QrInputFormat.JSON,
      };
    }

    if (
      typeof jsonPayload.type !== 'string' ||
      typeof jsonPayload.id !== 'string' ||
      !jsonPayload.id.trim()
    ) {
      return {
        ok: false,
        errorCode: 'QR_MALFORMED',
        message: 'Malformed QR payload',
        format: QrInputFormat.JSON,
      };
    }

    const entityType = this.normalizeEntityType(jsonPayload.type);

    if (!entityType) {
      return {
        ok: false,
        errorCode: 'QR_UNSUPPORTED',
        message: 'Unsupported QR type or format',
        format: QrInputFormat.JSON,
      };
    }

    return {
      ok: true,
      payload: {
        entityType,
        value: jsonPayload.id.trim(),
        format: QrInputFormat.JSON,
      },
    };
  }

  private parseCompactPayload(
    normalizedRaw: string,
    separatorIndex: number,
  ):
    | { ok: true; payload: ParsedQrPayload }
    | {
        ok: false;
        errorCode: QrScanErrorResponse['errorCode'];
        message: string;
        format: QrInputFormat.COMPACT;
      } {
    const prefix = normalizedRaw.slice(0, separatorIndex).trim().toUpperCase();
    const value = normalizedRaw.slice(separatorIndex + 1).trim();

    if (!value) {
      return {
        ok: false,
        errorCode: 'QR_MALFORMED',
        message: 'Malformed QR payload',
        format: QrInputFormat.COMPACT,
      };
    }

    let entityType: QrEntityType | null = null;

    switch (prefix) {
      case 'VAC':
        entityType = QrEntityType.VACUUM;
        break;
      case 'RACK':
        entityType = QrEntityType.RACK;
        break;
      case 'MACHINE':
        entityType = QrEntityType.MACHINE;
        break;
      default:
        entityType = null;
    }

    if (!entityType) {
      return {
        ok: false,
        errorCode: 'QR_UNSUPPORTED',
        message: 'Unsupported QR type or format',
        format: QrInputFormat.COMPACT,
      };
    }

    return {
      ok: true,
      payload: {
        entityType,
        value,
        format: QrInputFormat.COMPACT,
      },
    };
  }

  private normalizeEntityType(rawType: string): QrEntityType | null {
    switch (rawType.trim().toUpperCase()) {
      case 'VACUUM':
        return QrEntityType.VACUUM;
      case 'RACK':
        return QrEntityType.RACK;
      case 'MACHINE':
        return QrEntityType.MACHINE;
      default:
        return null;
    }
  }

  private async lookupVacuum(
    input: QrScanInputEcho,
    parsed: ParsedQrPayload,
  ): Promise<QrScanResponse> {
    const matches = await this.prismaService.vacuumPad.findMany({
      where: {
        deletedAt: null,
        serialNumber: { not: null },
        OR: [
          { serialNumber: parsed.value },
          { qrCode: parsed.value },
          { code: parsed.value },
        ],
      },
      select: QrService.vacuumSelect,
      take: 3,
    });
    const match = this.pickVacuumByScanPriority(matches, parsed.value);

    if (!match) {
      return this.buildError(
        input,
        'QR_NOT_FOUND',
        'No matching entity found',
        parsed.format,
      );
    }

    const entity = this.mapVacuum(match);

    return {
      ok: true,
      entityType: QrEntityType.VACUUM,
      input: {
        ...input,
        format: parsed.format,
      },
      entity,
      workflowHints: this.buildVacuumWorkflowHints(input.context, entity),
    };
  }

  private async lookupRack(
    input: QrScanInputEcho,
    parsed: ParsedQrPayload,
  ): Promise<QrScanResponse> {
    const matches = await this.prismaService.rackLocation.findMany({
      where: {
        deletedAt: null,
        isActive: true,
        OR: [{ code: parsed.value }, { qrCode: parsed.value }],
      },
      select: QrService.rackSelect,
      take: 2,
    });
    const match = this.pickRackByScanPriority(matches, parsed.value);

    if (!match) {
      return this.buildError(
        input,
        'QR_NOT_FOUND',
        'No matching entity found',
        parsed.format,
      );
    }

    const entity = this.mapRack(match);

    return {
      ok: true,
      entityType: QrEntityType.RACK,
      input: {
        ...input,
        format: parsed.format,
      },
      entity,
      workflowHints: this.buildRackWorkflowHints(input.context, entity),
    };
  }

  private async lookupMachine(
    input: QrScanInputEcho,
    parsed: ParsedQrPayload,
  ): Promise<QrScanResponse> {
    const matches = await this.prismaService.machine.findMany({
      where: {
        deletedAt: null,
        OR: [{ code: parsed.value }, { qrCode: parsed.value }],
      },
      select: QrService.machineSelect,
      take: 2,
    });
    const match = this.pickMachineByScanPriority(matches, parsed.value);

    if (!match) {
      return this.buildError(
        input,
        'QR_NOT_FOUND',
        'No matching entity found',
        parsed.format,
      );
    }

    const entity = this.mapMachine(match);

    return {
      ok: true,
      entityType: QrEntityType.MACHINE,
      input: {
        ...input,
        format: parsed.format,
      },
      entity,
      workflowHints: this.buildMachineWorkflowHints(input.context, entity),
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

  private pickMachineByScanPriority(
    matches: MachineRecord[],
    value: string,
  ): MachineRecord | null {
    return (
      matches.find((match) => match.code === value) ??
      // Deprecated scan alias kept for old printed labels.
      matches.find((match) => match.qrCode === value) ??
      null
    );
  }

  private mapVacuum(record: VacuumRecord): VacuumScanEntity {
    return {
      id: record.id,
      code: record.code,
      qrCode: record.qrCode,
      serialNumber: record.serialNumber,
      description: record.description,
      locationStatus: record.locationStatus,
      operationalStatus: record.operationalStatus,
      displayStatus: this.getVacuumDisplayStatus({
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
        ? this.mapRackLocationSummary(record.currentRackLocation)
        : null,
    };
  }

  private mapRack(record: RackRecord): RackScanEntity {
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
        ? this.mapCurrentPadSummary(record.currentPads[0])
        : null,
    };
  }

  private mapMachine(record: MachineRecord): MachineScanEntity {
    return {
      id: record.id,
      code: record.code,
      qrCode: record.qrCode,
      name: record.name,
      status: record.status,
      area: record.area,
      project: record.project,
      currentPad: record.currentPads[0]
        ? this.mapCurrentPadSummary(record.currentPads[0])
        : null,
    };
  }

  private mapCurrentPadSummary(record: {
    id: string;
    code: string;
    qrCode: string;
    serialNumber: string | null;
    locationStatus: LocationStatus;
    operationalStatus: OperationalStatus;
    currentMachineId?: string | null;
  }): CurrentPadSummary {
    return {
      id: record.id,
      code: record.code,
      qrCode: record.qrCode,
      serialNumber: record.serialNumber,
      locationStatus: record.locationStatus,
      operationalStatus: record.operationalStatus,
      displayStatus: this.getVacuumDisplayStatus({
        currentMachineId: record.currentMachineId ?? null,
        locationStatus: record.locationStatus,
        operationalStatus: record.operationalStatus,
      }),
    };
  }

  private mapRackLocationSummary(record: {
    id: string;
    code: string;
    qrCode: string;
    label: string | null;
    type: RackLocationType;
    zone: string | null;
    rack: string | null;
    level: string | null;
    slot: string | null;
  }): CurrentRackLocationSummary {
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

  private getVacuumDisplayStatus(vacuum: {
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

  private buildVacuumWorkflowHints(
    context: QrScanContext,
    entity: VacuumScanEntity,
  ): WorkflowHints {
    switch (context) {
      case QrScanContext.CHARGE:
        if (
          entity.displayStatus === 'NOTACTIVE' &&
          entity.operationalStatus === OperationalStatus.FUNCTIONAL
        ) {
          return {
            context,
            canContinue: true,
            reason: 'vacuum is eligible for charge scanning',
            nextExpectedEntityTypes: [QrEntityType.MACHINE],
          };
        }

        return {
          context,
          canContinue: false,
          reason: 'vacuum is not eligible for charge scanning',
          nextExpectedEntityTypes: [],
        };
      case QrScanContext.DECHARGE:
        return entity.displayStatus === 'ACTIVE'
          ? {
              context,
              canContinue: true,
              reason: 'vacuum is eligible for decharge scanning',
              nextExpectedEntityTypes: [QrEntityType.RACK],
            }
          : {
              context,
              canContinue: false,
              reason: 'vacuum is not eligible for decharge scanning',
              nextExpectedEntityTypes: [],
            };
      case QrScanContext.FAULT_REPORT:
        return entity.displayStatus === 'NOTACTIVE'
          ? {
              context,
              canContinue: true,
              reason: 'vacuum is eligible for fault reporting',
              nextExpectedEntityTypes: [],
            }
          : {
              context,
              canContinue: false,
              reason: 'vacuum is not eligible for fault reporting',
              nextExpectedEntityTypes: [],
            };
      case QrScanContext.FAULT_RESTORE:
        return entity.displayStatus === 'REPAIR'
          ? {
              context,
              canContinue: true,
              reason: 'vacuum is eligible for fault restoration',
              nextExpectedEntityTypes: [QrEntityType.RACK],
            }
          : {
              context,
              canContinue: false,
              reason: 'vacuum is not eligible for fault restoration',
              nextExpectedEntityTypes: [],
            };
      case QrScanContext.STATUS:
        return {
          context,
          canContinue: true,
          reason: 'status lookup is available for this vacuum',
          nextExpectedEntityTypes: [],
        };
    }
  }

  private buildRackWorkflowHints(
    context: QrScanContext,
    entity: RackScanEntity,
  ): WorkflowHints {
    switch (context) {
      case QrScanContext.DECHARGE:
      case QrScanContext.FAULT_RESTORE:
        return entity.currentPad === null
          ? {
              context,
              canContinue: true,
              reason: 'rack is available for placement',
              nextExpectedEntityTypes: [QrEntityType.VACUUM],
            }
          : {
              context,
              canContinue: false,
              reason: 'rack is currently occupied',
              nextExpectedEntityTypes: [],
            };
      case QrScanContext.STATUS:
        return {
          context,
          canContinue: true,
          reason: 'status lookup is available for this rack',
          nextExpectedEntityTypes: [],
        };
      default:
        return {
          context,
          canContinue: false,
          reason: 'this workflow does not use rack scans at this step',
          nextExpectedEntityTypes: [],
        };
    }
  }

  private buildMachineWorkflowHints(
    context: QrScanContext,
    entity: MachineScanEntity,
  ): WorkflowHints {
    switch (context) {
      case QrScanContext.CHARGE:
        return entity.status === MachineStatus.ACTIVE &&
          entity.currentPad === null
          ? {
              context,
              canContinue: true,
              reason: 'machine is available for charge scanning',
              nextExpectedEntityTypes: [QrEntityType.VACUUM],
            }
          : {
              context,
              canContinue: false,
              reason: 'machine is not available for charge scanning',
              nextExpectedEntityTypes: [],
            };
      case QrScanContext.STATUS:
        return {
          context,
          canContinue: true,
          reason: 'status lookup is available for this machine',
          nextExpectedEntityTypes: [],
        };
      default:
        return {
          context,
          canContinue: false,
          reason: 'this workflow does not use machine scans at this step',
          nextExpectedEntityTypes: [],
        };
    }
  }

  private buildError(
    input: QrScanInputEcho,
    errorCode: QrScanErrorResponse['errorCode'],
    message: string,
    format?: QrInputFormat,
  ): QrScanErrorResponse {
    return {
      ok: false,
      errorCode,
      message,
      input: {
        ...input,
        format,
      },
    };
  }
}
