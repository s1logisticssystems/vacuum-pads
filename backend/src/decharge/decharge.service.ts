import { HttpStatus, Injectable } from '@nestjs/common';
import {
  AuditAction,
  LocationStatus,
  MovementType,
  OperationalStatus,
  Prisma,
  RackLocationType,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { QrService } from '../qr/qr.service';
import {
  QrEntityType,
  QrScanContext,
  QrScanErrorResponse,
  RackScanEntity,
  VacuumDisplayStatus,
  VacuumScanEntity,
} from '../qr/qr.types';
import { DechargeDto } from './dto/decharge.dto';
import { DechargePreviewDto } from './dto/decharge-preview.dto';

export type DechargePreviewDecision =
  | 'CAN_DECHARGE'
  | 'SELECT_RACK'
  | 'NOT_ACTIVE'
  | 'IN_REPAIR'
  | 'VACUUM_NOT_FOUND'
  | 'RACK_NOT_FOUND'
  | 'RACK_OCCUPIED'
  | 'REPAIR_INTAKE_REQUIRED'
  | 'INVALID_REQUEST';

export type DechargeWriteDecision =
  | DechargePreviewDecision
  | 'DECHARGED'
  | 'DECHARGED_REPAIR_REQUIRED';

export type DechargePreviewNextAction =
  | 'SCAN_RACK'
  | 'CONFIRM_DECHARGE'
  | 'OPEN_REPAIR_DECLARATION'
  | 'NONE';

export interface DechargePreviewChargeSessionSummary {
  id: string;
  vacuumPadId: string;
  machineId: string;
  chargedAt: string;
  chargeDeviceId: string | null;
  chargeOperatorName: string | null;
  note: string | null;
  machine: {
    id: string;
    code: string;
    qrCode: string;
    name: string;
    status: string;
  };
}

export interface DechargePreviewResponse {
  ok: boolean;
  decision: DechargePreviewDecision;
  message: string;
  vacuum: VacuumScanEntity | null;
  rack: RackScanEntity | null;
  chargeSession: DechargePreviewChargeSessionSummary | null;
  requiredNextAction: DechargePreviewNextAction;
}

export interface DechargeSuccessResponse {
  ok: true;
  decision: 'DECHARGED' | 'DECHARGED_REPAIR_REQUIRED';
  message: string;
  chargeSession: {
    id: string;
    vacuumPadId: string;
    machineId: string;
    chargedAt: string;
    dechargedAt: string | null;
    dechargeRackLocationId: string | null;
    chargeDeviceId: string | null;
    chargeOperatorName: string | null;
    dechargeDeviceId: string | null;
    dechargeOperatorName: string | null;
    note: string | null;
  };
  vacuum: VacuumScanEntity;
  rack: RackScanEntity;
  movement: {
    id: string;
    movementType: MovementType;
    vacuumPadId: string;
    fromMachineId: string | null;
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
  requiredNextAction: Extract<
    DechargePreviewNextAction,
    'NONE' | 'OPEN_REPAIR_DECLARATION'
  >;
}

export interface DechargeErrorResponse {
  ok: false;
  decision: Exclude<
    DechargeWriteDecision,
    'DECHARGED' | 'DECHARGED_REPAIR_REQUIRED'
  >;
  message: string;
}

interface DechargeErrorResponseInternal extends DechargeErrorResponse {
  httpStatus: number;
}

export type DechargeResponse =
  | DechargeSuccessResponse
  | DechargeErrorResponseInternal;

type VacuumRecord = Prisma.VacuumPadGetPayload<{
  select: typeof QrService.vacuumSelect;
}>;

type RackRecord = Prisma.RackLocationGetPayload<{
  select: typeof QrService.rackSelect;
}>;

type PreviewChargeSessionRecord = Prisma.ChargeSessionGetPayload<{
  select: {
    id: true;
    vacuumPadId: true;
    machineId: true;
    chargedAt: true;
    chargeDeviceId: true;
    chargeOperatorName: true;
    note: true;
    machine: {
      select: {
        id: true;
        code: true;
        qrCode: true;
        name: true;
        status: true;
      };
    };
  };
}>;

type ClosedChargeSessionRecord = Prisma.ChargeSessionGetPayload<{
  select: {
    id: true;
    vacuumPadId: true;
    machineId: true;
    chargedAt: true;
    dechargedAt: true;
    dechargeRackLocationId: true;
    chargeDeviceId: true;
    chargeOperatorName: true;
    dechargeDeviceId: true;
    dechargeOperatorName: true;
    note: true;
  };
}>;

type TransactionClient = Prisma.TransactionClient;

@Injectable()
export class DechargeService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly qrService: QrService,
  ) {}

  async preview(dto: DechargePreviewDto): Promise<DechargePreviewResponse> {
    const operatorName = this.normalizeOptional(dto.operatorName);
    const rackQr = this.normalizeOptional(dto.rackQr);

    const vacuumLookup = await this.qrService.scan({
      raw: dto.vacuumQr,
      context: QrScanContext.DECHARGE,
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
        chargeSession: null,
        requiredNextAction: 'NONE',
      });
    }

    const vacuum = vacuumLookup.entity as VacuumScanEntity;

    if (
      vacuum.locationStatus === LocationStatus.IN_REPAIR ||
      vacuum.operationalStatus === OperationalStatus.UNDER_REPAIR
    ) {
      return this.buildPreviewResponse({
        ok: false,
        decision: 'IN_REPAIR',
        message: 'Vacuum is currently in repair',
        vacuum,
        rack: null,
        chargeSession: null,
        requiredNextAction: 'NONE',
      });
    }

    if (
      vacuum.currentMachine === null &&
      vacuum.locationStatus !== LocationStatus.ON_MACHINE
    ) {
      return this.buildPreviewResponse({
        ok: false,
        decision: 'NOT_ACTIVE',
        message: 'Vacuum is not currently active on a machine',
        vacuum,
        rack: null,
        chargeSession: null,
        requiredNextAction: 'NONE',
      });
    }

    const openChargeSession = await this.prismaService.chargeSession.findFirst({
      where: {
        vacuumPadId: vacuum.id,
        dechargedAt: null,
      },
      select: {
        id: true,
        vacuumPadId: true,
        machineId: true,
        chargedAt: true,
        chargeDeviceId: true,
        chargeOperatorName: true,
        note: true,
        machine: {
          select: {
            id: true,
            code: true,
            qrCode: true,
            name: true,
            status: true,
          },
        },
      },
    });

    if (!openChargeSession) {
      return this.buildPreviewResponse({
        ok: false,
        decision: 'NOT_ACTIVE',
        message: 'Vacuum does not have an active charge session',
        vacuum,
        rack: null,
        chargeSession: null,
        requiredNextAction: 'NONE',
      });
    }

    const chargeSession = this.mapPreviewChargeSession(openChargeSession);

    if (!rackQr) {
      return this.buildPreviewResponse({
        ok: true,
        decision: 'SELECT_RACK',
        message: 'Vacuum is active. Scan a rack position to continue',
        vacuum,
        rack: null,
        chargeSession,
        requiredNextAction: 'SCAN_RACK',
      });
    }

    const rackResult = await this.lookupRackByScanValue(
      this.prismaService,
      rackQr,
    );

    if (!rackResult.ok) {
      return this.buildPreviewResponse({
        ok: false,
        decision: rackResult.decision,
        message: rackResult.message,
        vacuum,
        rack: null,
        chargeSession,
        requiredNextAction: 'NONE',
      });
    }

    const rack = this.mapRackRecord(rackResult.rack);

    if (rack.currentPad !== null && rack.currentPad.id !== vacuum.id) {
      return this.buildPreviewResponse({
        ok: false,
        decision: 'RACK_OCCUPIED',
        message: 'Selected rack is already occupied',
        vacuum,
        rack,
        chargeSession,
        requiredNextAction: 'NONE',
      });
    }

    if (rack.type === RackLocationType.REP) {
      return this.buildPreviewResponse({
        ok: true,
        decision: 'REPAIR_INTAKE_REQUIRED',
        message:
          'Selected repair rack requires fault declaration after decharge.',
        vacuum,
        rack,
        chargeSession,
        requiredNextAction: 'OPEN_REPAIR_DECLARATION',
      });
    }

    return this.buildPreviewResponse({
      ok: true,
      decision: 'CAN_DECHARGE',
      message: 'Vacuum can be decharged to the selected rack',
      vacuum,
      rack,
      chargeSession,
      requiredNextAction: 'CONFIRM_DECHARGE',
    });
  }

  async decharge(dto: DechargeDto): Promise<DechargeResponse> {
    const operatorName = this.normalizeOptional(dto.operatorName);
    const note = this.normalizeOptional(dto.note) ?? null;

    try {
      return await this.prismaService.$transaction(async (tx) => {
        const vacuumResult = await this.resolveVacuumByScanValue(
          tx,
          dto.vacuumQr,
        );

        if (!vacuumResult.ok) {
          return vacuumResult;
        }

        const rackResult = await this.lookupRackByScanValue(tx, dto.rackQr);

        if (!rackResult.ok) {
          return this.buildErrorResponse(
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
          vacuum.locationStatus === LocationStatus.IN_REPAIR ||
          vacuum.operationalStatus === OperationalStatus.UNDER_REPAIR
        ) {
          return this.buildErrorResponse(
            'IN_REPAIR',
            'Vacuum is currently in repair',
            HttpStatus.CONFLICT,
          );
        }

        if (
          vacuum.currentMachineId === null &&
          vacuum.locationStatus !== LocationStatus.ON_MACHINE
        ) {
          return this.buildErrorResponse(
            'NOT_ACTIVE',
            'Vacuum is not currently active on a machine',
            HttpStatus.CONFLICT,
          );
        }

        const [openChargeSession, occupiedRackPad] = await Promise.all([
          tx.chargeSession.findFirst({
            where: {
              vacuumPadId: vacuum.id,
              dechargedAt: null,
            },
            select: {
              id: true,
              vacuumPadId: true,
              machineId: true,
              chargedAt: true,
              dechargedAt: true,
              dechargeRackLocationId: true,
              chargeDeviceId: true,
              chargeOperatorName: true,
              dechargeDeviceId: true,
              dechargeOperatorName: true,
              note: true,
            },
          }),
          tx.vacuumPad.findFirst({
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
          }),
        ]);

        if (!openChargeSession) {
          return this.buildErrorResponse(
            'NOT_ACTIVE',
            'Vacuum does not have an active charge session',
            HttpStatus.CONFLICT,
          );
        }

        if (occupiedRackPad) {
          return this.buildErrorResponse(
            'RACK_OCCUPIED',
            'Selected rack is already occupied',
            HttpStatus.CONFLICT,
          );
        }

        const dechargedAt = new Date();
        const previousCurrentRackLocationId = vacuum.currentRackLocationId;
        const previousCurrentMachineId = vacuum.currentMachineId;
        const previousLocationStatus = vacuum.locationStatus;
        const previousOperationalStatus = vacuum.operationalStatus;
        const newLocationStatus =
          rack.type === RackLocationType.REP
            ? LocationStatus.IN_REPAIR
            : LocationStatus.IN_RACK;
        const newOperationalStatus =
          rack.type === RackLocationType.REP
            ? OperationalStatus.INSPECTION_REQUIRED
            : previousOperationalStatus === OperationalStatus.FUNCTIONAL
              ? OperationalStatus.FUNCTIONAL
              : previousOperationalStatus;

        const closedChargeSession = await tx.chargeSession.update({
          where: {
            id: openChargeSession.id,
          },
          data: {
            dechargedAt,
            dechargeRackLocationId: rack.id,
            dechargeDeviceId: dto.deviceId,
            dechargeOperatorName: operatorName ?? null,
          },
          select: {
            id: true,
            vacuumPadId: true,
            machineId: true,
            chargedAt: true,
            dechargedAt: true,
            dechargeRackLocationId: true,
            chargeDeviceId: true,
            chargeOperatorName: true,
            dechargeDeviceId: true,
            dechargeOperatorName: true,
            note: true,
          },
        });

        const updatedVacuumRecord = await tx.vacuumPad.update({
          where: {
            id: vacuum.id,
          },
          data: {
            currentMachineId: null,
            currentRackLocationId: rack.id,
            locationStatus: newLocationStatus,
            operationalStatus: newOperationalStatus,
          },
          select: QrService.vacuumSelect,
        });

        const movement = await tx.padMovement.create({
          data: {
            movementType: MovementType.DECHARGE,
            vacuumPadId: vacuum.id,
            fromMachineId:
              previousCurrentMachineId ?? openChargeSession.machineId,
            toRackLocationId: rack.id,
            previousLocationStatus,
            newLocationStatus,
            previousOperationalStatus,
            newOperationalStatus,
            performedById: null,
            deviceId: dto.deviceId,
            operatorName: operatorName ?? null,
            note,
          },
          select: {
            id: true,
            movementType: true,
            vacuumPadId: true,
            fromMachineId: true,
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
            action: AuditAction.DECHARGE,
            entityType: 'VacuumPad',
            entityId: vacuum.id,
            userId: null,
            deviceId: dto.deviceId,
            operatorName: operatorName ?? null,
            before: {
              currentRackLocationId: previousCurrentRackLocationId,
              currentMachineId: previousCurrentMachineId,
              locationStatus: previousLocationStatus,
              operationalStatus: previousOperationalStatus,
              openChargeSessionId: openChargeSession.id,
            },
            after: {
              currentRackLocationId: rack.id,
              currentMachineId: null,
              locationStatus: newLocationStatus,
              operationalStatus: newOperationalStatus,
              dechargedAt: dechargedAt.toISOString(),
            },
            metadata: {
              rackId: rack.id,
              rackType: rack.type,
              chargeSessionId: openChargeSession.id,
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
            id: rack.id,
          },
          select: QrService.rackSelect,
        });

        if (!updatedRackRecord) {
          return this.buildErrorResponse(
            'RACK_NOT_FOUND',
            'No matching rack found',
            HttpStatus.NOT_FOUND,
          );
        }

        const repairRack = updatedRackRecord.type === RackLocationType.REP;

        return {
          ok: true,
          decision: repairRack ? 'DECHARGED_REPAIR_REQUIRED' : 'DECHARGED',
          message: repairRack
            ? 'Selected repair rack requires fault declaration after decharge.'
            : 'Vacuum was decharged successfully.',
          chargeSession: this.mapClosedChargeSession(closedChargeSession),
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
          requiredNextAction: repairRack ? 'OPEN_REPAIR_DECLARATION' : 'NONE',
        };
      });
    } catch (error) {
      return this.mapTransactionError(error);
    }
  }

  private normalizeOptional(value?: string): string | undefined {
    const normalized = value?.trim();

    return normalized ? normalized : undefined;
  }

  private mapVacuumLookupError(
    result: QrScanErrorResponse,
  ): DechargePreviewResponse {
    if (result.errorCode === 'QR_NOT_FOUND') {
      return this.buildPreviewResponse({
        ok: false,
        decision: 'VACUUM_NOT_FOUND',
        message: 'No matching vacuum found',
        vacuum: null,
        rack: null,
        chargeSession: null,
        requiredNextAction: 'NONE',
      });
    }

    return this.buildPreviewResponse({
      ok: false,
      decision: 'INVALID_REQUEST',
      message: 'Vacuum QR is invalid',
      vacuum: null,
      rack: null,
      chargeSession: null,
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
    | DechargeErrorResponseInternal
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
          DechargePreviewDecision,
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

  private mapPreviewChargeSession(
    record: PreviewChargeSessionRecord,
  ): DechargePreviewChargeSessionSummary {
    return {
      id: record.id,
      vacuumPadId: record.vacuumPadId,
      machineId: record.machineId,
      chargedAt: record.chargedAt.toISOString(),
      chargeDeviceId: record.chargeDeviceId,
      chargeOperatorName: record.chargeOperatorName,
      note: record.note,
      machine: {
        id: record.machine.id,
        code: record.machine.code,
        qrCode: record.machine.qrCode,
        name: record.machine.name,
        status: record.machine.status,
      },
    };
  }

  private mapClosedChargeSession(record: ClosedChargeSessionRecord) {
    return {
      id: record.id,
      vacuumPadId: record.vacuumPadId,
      machineId: record.machineId,
      chargedAt: record.chargedAt.toISOString(),
      dechargedAt: record.dechargedAt?.toISOString() ?? null,
      dechargeRackLocationId: record.dechargeRackLocationId,
      chargeDeviceId: record.chargeDeviceId,
      chargeOperatorName: record.chargeOperatorName,
      dechargeDeviceId: record.dechargeDeviceId,
      dechargeOperatorName: record.dechargeOperatorName,
      note: record.note,
    };
  }

  private buildPreviewResponse(
    response: DechargePreviewResponse,
  ): DechargePreviewResponse {
    return response;
  }

  private buildErrorResponse(
    decision: Exclude<
      DechargeWriteDecision,
      'DECHARGED' | 'DECHARGED_REPAIR_REQUIRED'
    >,
    message: string,
    httpStatus: number,
  ): DechargeErrorResponseInternal {
    return {
      ok: false,
      decision,
      message,
      httpStatus,
    };
  }

  private mapTransactionError(error: unknown): DechargeErrorResponseInternal {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      const errorMessage = error.message;

      if (errorMessage.includes('VacuumPad_currentRackLocationId_active_key')) {
        return this.buildErrorResponse(
          'RACK_OCCUPIED',
          'Selected rack is already occupied',
          HttpStatus.CONFLICT,
        );
      }
    }

    return this.buildErrorResponse(
      'INVALID_REQUEST',
      'Decharge request could not be completed',
      HttpStatus.CONFLICT,
    );
  }
}
