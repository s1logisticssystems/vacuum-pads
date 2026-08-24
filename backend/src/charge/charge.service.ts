import { HttpStatus, Injectable } from '@nestjs/common';
import {
  AuditAction,
  LocationStatus,
  MachineStatus,
  MovementType,
  OperationalStatus,
  Prisma,
} from '@prisma/client';
import { ChargeDto } from './dto/charge.dto';
import { ChargePreviewDto } from './dto/charge-preview.dto';
import { PrismaService } from '../prisma/prisma.service';
import { QrService } from '../qr/qr.service';
import {
  MachineScanEntity,
  QrEntityType,
  QrScanContext,
  QrScanErrorResponse,
  VacuumDisplayStatus,
  VacuumScanEntity,
} from '../qr/qr.types';

export type ChargePreviewDecision =
  | 'CAN_CHARGE'
  | 'ALREADY_ACTIVE'
  | 'IN_REPAIR'
  | 'NOT_FUNCTIONAL'
  | 'MACHINE_OCCUPIED'
  | 'VACUUM_NOT_FOUND'
  | 'MACHINE_NOT_FOUND'
  | 'INVALID_REQUEST';

export type ChargeWriteDecision = ChargePreviewDecision | 'CHARGED';

export type ChargePreviewNextAction =
  | 'SELECT_MACHINE'
  | 'CONFIRM_RECHARGE'
  | 'RESTORE_REPAIR_FIRST'
  | 'NONE';

export interface ChargePreviewMachineSummary {
  id: string;
  code: string;
  qrCode: string;
  name: string;
  status: MachineStatus;
  area: string | null;
  project: string | null;
  currentPad: {
    id: string;
    code: string;
    qrCode: string;
    serialNumber: string | null;
    locationStatus: LocationStatus;
    operationalStatus: OperationalStatus;
    displayStatus: VacuumDisplayStatus;
  } | null;
  hasOpenChargeSession: boolean;
}

export interface ChargePreviewResponse {
  ok: boolean;
  decision: ChargePreviewDecision;
  message: string;
  vacuum: VacuumScanEntity | null;
  machine: ChargePreviewMachineSummary | null;
  requiredNextAction: ChargePreviewNextAction;
}

export interface ChargeSuccessResponse {
  ok: true;
  decision: 'CHARGED';
  chargeSession: {
    id: string;
    vacuumPadId: string;
    machineId: string;
    chargedAt: string;
    chargeDeviceId: string | null;
    chargeOperatorName: string | null;
    note: string | null;
  };
  vacuum: VacuumScanEntity;
  machine: ChargePreviewMachineSummary;
  movement: {
    id: string;
    movementType: MovementType;
    vacuumPadId: string;
    fromRackLocationId: string | null;
    toMachineId: string | null;
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

export interface ChargeErrorResponse {
  ok: false;
  decision: Exclude<ChargeWriteDecision, 'CHARGED'>;
  message: string;
}

export interface ChargeErrorResponseInternal extends ChargeErrorResponse {
  httpStatus: number;
}

export type ChargeResponse =
  | ChargeSuccessResponse
  | ChargeErrorResponseInternal;

type VacuumRecord = Prisma.VacuumPadGetPayload<{
  select: typeof QrService.vacuumSelect;
}>;

type MachineRecord = Prisma.MachineGetPayload<{
  select: typeof QrService.machineSelect;
}>;

type TransactionClient = Prisma.TransactionClient;

@Injectable()
export class ChargeService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly qrService: QrService,
  ) {}

  async preview(dto: ChargePreviewDto): Promise<ChargePreviewResponse> {
    const machineId = this.normalizeOptional(dto.machineId);
    const machineQr = this.normalizeOptional(dto.machineQr);
    const operatorName = this.normalizeOptional(dto.operatorName);

    if (machineId && machineQr) {
      return this.buildPreviewResponse({
        ok: false,
        decision: 'INVALID_REQUEST',
        message: 'Provide either machineId or machineQr, not both',
        vacuum: null,
        machine: null,
        requiredNextAction: 'SELECT_MACHINE',
      });
    }

    const vacuumLookup = await this.qrService.scan({
      raw: dto.vacuumQr,
      context: QrScanContext.CHARGE,
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
        machine: null,
        requiredNextAction: 'NONE',
      });
    }

    const vacuum = vacuumLookup.entity as VacuumScanEntity;
    const openVacuumCharge = await this.prismaService.chargeSession.findFirst({
      where: {
        vacuumPadId: vacuum.id,
        dechargedAt: null,
      },
      select: {
        id: true,
      },
    });

    if (
      vacuum.operationalStatus === OperationalStatus.UNDER_REPAIR ||
      vacuum.locationStatus === LocationStatus.IN_REPAIR
    ) {
      return this.buildPreviewResponse({
        ok: false,
        decision: 'IN_REPAIR',
        message: 'Vacuum is currently in repair',
        vacuum,
        machine: null,
        requiredNextAction: 'RESTORE_REPAIR_FIRST',
      });
    }

    if (
      vacuum.operationalStatus === OperationalStatus.OUT_OF_SERVICE ||
      vacuum.operationalStatus === OperationalStatus.INSPECTION_REQUIRED
    ) {
      return this.buildPreviewResponse({
        ok: false,
        decision: 'NOT_FUNCTIONAL',
        message: 'Vacuum is not eligible for charge in its current condition',
        vacuum,
        machine: null,
        requiredNextAction: 'NONE',
      });
    }

    if (
      vacuum.currentMachine !== null ||
      vacuum.locationStatus === LocationStatus.ON_MACHINE ||
      openVacuumCharge !== null
    ) {
      return this.buildPreviewResponse({
        ok: false,
        decision: 'ALREADY_ACTIVE',
        message: 'Vacuum is already active on a machine',
        vacuum,
        machine: null,
        requiredNextAction: 'NONE',
      });
    }

    if (!machineId && !machineQr) {
      return this.buildPreviewResponse({
        ok: true,
        decision: 'CAN_CHARGE',
        message: 'Vacuum is chargeable. Select a machine to continue',
        vacuum,
        machine: null,
        requiredNextAction: 'SELECT_MACHINE',
      });
    }

    const machineResult = machineId
      ? await this.lookupMachineById(this.prismaService, machineId)
      : await this.lookupMachineByScanValue(
          this.prismaService,
          machineQr!,
          dto.deviceId,
          operatorName,
        );

    if (!machineResult.ok) {
      return this.buildPreviewResponse({
        ok: false,
        decision: machineResult.decision,
        message: machineResult.message,
        vacuum,
        machine: null,
        requiredNextAction:
          machineResult.decision === 'MACHINE_NOT_FOUND'
            ? 'SELECT_MACHINE'
            : 'NONE',
      });
    }

    const openMachineCharge = await this.prismaService.chargeSession.findFirst({
      where: {
        machineId: machineResult.machine.id,
        dechargedAt: null,
      },
      select: {
        id: true,
      },
    });

    const machine = this.withOpenChargeFlag(
      machineResult.machine,
      openMachineCharge !== null,
    );

    if (machine.status !== MachineStatus.ACTIVE) {
      return this.buildPreviewResponse({
        ok: false,
        decision: 'INVALID_REQUEST',
        message: 'Selected machine is not available for charge',
        vacuum,
        machine,
        requiredNextAction: 'SELECT_MACHINE',
      });
    }

    if (machine.currentPad !== null || machine.hasOpenChargeSession) {
      return this.buildPreviewResponse({
        ok: false,
        decision: 'MACHINE_OCCUPIED',
        message: 'Selected machine is already occupied',
        vacuum,
        machine,
        requiredNextAction: 'SELECT_MACHINE',
      });
    }

    return this.buildPreviewResponse({
      ok: true,
      decision: 'CAN_CHARGE',
      message: 'Vacuum can be charged to the selected machine',
      vacuum,
      machine,
      requiredNextAction: 'NONE',
    });
  }

  async charge(dto: ChargeDto): Promise<ChargeResponse> {
    const machineId = this.normalizeOptional(dto.machineId);
    const machineQr = this.normalizeOptional(dto.machineQr);
    const operatorName = this.normalizeOptional(dto.operatorName);
    const note = this.normalizeOptional(dto.note) ?? null;

    if ((machineId ? 1 : 0) + (machineQr ? 1 : 0) !== 1) {
      return this.buildErrorResponse(
        'INVALID_REQUEST',
        'Provide exactly one of machineId or machineQr',
        HttpStatus.BAD_REQUEST,
      );
    }

    try {
      return await this.prismaService.$transaction(async (tx) => {
        const vacuumResult = await this.resolveVacuumByScanValue(
          tx,
          dto.vacuumQr,
        );

        if (!vacuumResult.ok) {
          return vacuumResult;
        }

        const machineResult = machineId
          ? await this.lookupMachineById(tx, machineId)
          : await this.lookupMachineByScanValue(
              tx,
              machineQr!,
              dto.deviceId,
              operatorName,
            );

        if (!machineResult.ok) {
          return machineResult;
        }

        const vacuum = vacuumResult.vacuum;
        const machine = machineResult.machine;
        const [openVacuumCharge, occupiedMachinePad, openMachineCharge] =
          await Promise.all([
            tx.chargeSession.findFirst({
              where: {
                vacuumPadId: vacuum.id,
                dechargedAt: null,
              },
              select: {
                id: true,
              },
            }),
            tx.vacuumPad.findFirst({
              where: {
                currentMachineId: machine.id,
                deletedAt: null,
              },
              select: {
                id: true,
              },
            }),
            tx.chargeSession.findFirst({
              where: {
                machineId: machine.id,
                dechargedAt: null,
              },
              select: {
                id: true,
              },
            }),
          ]);

        if (machine.status !== MachineStatus.ACTIVE) {
          return this.buildErrorResponse(
            'INVALID_REQUEST',
            'Selected machine is not available for charge',
            HttpStatus.CONFLICT,
          );
        }

        if (
          vacuum.currentMachineId !== null ||
          vacuum.locationStatus === LocationStatus.ON_MACHINE ||
          openVacuumCharge !== null
        ) {
          return this.buildErrorResponse(
            'ALREADY_ACTIVE',
            'Vacuum is already active on a machine',
            HttpStatus.CONFLICT,
          );
        }

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

        if (vacuum.operationalStatus !== OperationalStatus.FUNCTIONAL) {
          return this.buildErrorResponse(
            'NOT_FUNCTIONAL',
            'Vacuum is not eligible for charge in its current condition',
            HttpStatus.CONFLICT,
          );
        }

        if (occupiedMachinePad !== null || openMachineCharge !== null) {
          return this.buildErrorResponse(
            'MACHINE_OCCUPIED',
            'Selected machine is already occupied',
            HttpStatus.CONFLICT,
          );
        }

        const chargedAt = new Date();
        const previousCurrentRackLocationId = vacuum.currentRackLocationId;
        const previousCurrentMachineId = vacuum.currentMachineId;
        const previousLocationStatus = vacuum.locationStatus;
        const previousOperationalStatus = vacuum.operationalStatus;

        const chargeSession = await tx.chargeSession.create({
          data: {
            vacuumPadId: vacuum.id,
            machineId: machine.id,
            chargedAt,
            chargeDeviceId: dto.deviceId,
            chargeOperatorName: operatorName ?? null,
            note,
          },
          select: {
            id: true,
            vacuumPadId: true,
            machineId: true,
            chargedAt: true,
            chargeDeviceId: true,
            chargeOperatorName: true,
            note: true,
          },
        });

        const updatedVacuumRecord = await tx.vacuumPad.update({
          where: {
            id: vacuum.id,
          },
          data: {
            currentMachineId: machine.id,
            currentRackLocationId: null,
            locationStatus: LocationStatus.ON_MACHINE,
          },
          select: QrService.vacuumSelect,
        });

        const movement = await tx.padMovement.create({
          data: {
            movementType: MovementType.CHARGE,
            vacuumPadId: vacuum.id,
            fromRackLocationId: previousCurrentRackLocationId ?? null,
            toMachineId: machine.id,
            previousLocationStatus,
            newLocationStatus: LocationStatus.ON_MACHINE,
            previousOperationalStatus,
            newOperationalStatus: previousOperationalStatus,
            performedById: null,
            deviceId: dto.deviceId,
            operatorName: operatorName ?? null,
            note,
          },
          select: {
            id: true,
            movementType: true,
            vacuumPadId: true,
            fromRackLocationId: true,
            toMachineId: true,
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
            action: AuditAction.CHARGE,
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
            },
            after: {
              currentMachineId: machine.id,
              locationStatus: LocationStatus.ON_MACHINE,
              operationalStatus: previousOperationalStatus,
              chargeSessionId: chargeSession.id,
            },
            metadata: {
              machineId: machine.id,
              chargeSessionId: chargeSession.id,
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

        const updatedMachineRecord = await tx.machine.findUnique({
          where: {
            id: machine.id,
          },
          select: QrService.machineSelect,
        });

        if (!updatedMachineRecord) {
          return this.buildErrorResponse(
            'MACHINE_NOT_FOUND',
            'No matching machine found',
            HttpStatus.NOT_FOUND,
          );
        }

        return {
          ok: true,
          decision: 'CHARGED',
          chargeSession: {
            ...chargeSession,
            chargedAt: chargeSession.chargedAt.toISOString(),
          },
          vacuum: this.mapVacuumRecord(updatedVacuumRecord),
          machine: this.withOpenChargeFlag(
            this.mapMachineRecord(updatedMachineRecord),
            true,
          ),
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
  ): ChargePreviewResponse {
    if (result.errorCode === 'QR_NOT_FOUND') {
      return this.buildPreviewResponse({
        ok: false,
        decision: 'VACUUM_NOT_FOUND',
        message: 'No matching vacuum found',
        vacuum: null,
        machine: null,
        requiredNextAction: 'NONE',
      });
    }

    return this.buildPreviewResponse({
      ok: false,
      decision: 'INVALID_REQUEST',
      message: 'Vacuum QR is invalid',
      vacuum: null,
      machine: null,
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
    | ChargeErrorResponseInternal
  > {
    const parsed: ReturnType<QrService['parseRawPayload']> =
      this.qrService.parseRawPayload(raw);

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

  private async lookupMachineById(
    client: TransactionClient | PrismaService,
    machineId: string,
  ): Promise<
    | {
        ok: true;
        machine: ChargePreviewMachineSummary;
      }
    | ChargeErrorResponseInternal
  > {
    const record = await client.machine.findFirst({
      where: {
        id: machineId,
        deletedAt: null,
      },
      select: QrService.machineSelect,
    });

    if (!record) {
      return this.buildErrorResponse(
        'MACHINE_NOT_FOUND',
        'No matching machine found',
        HttpStatus.NOT_FOUND,
      );
    }

    return {
      ok: true,
      machine: this.mapMachineRecord(record),
    };
  }

  private async lookupMachineByScanValue(
    client: TransactionClient | PrismaService,
    raw: string,
    deviceId: string,
    operatorName?: string,
  ): Promise<
    | {
        ok: true;
        machine: ChargePreviewMachineSummary;
      }
    | ChargeErrorResponseInternal
  > {
    const normalizedRaw = raw.trim();
    const parsedResult = this.tryParseMachineQr(normalizedRaw);

    if (!parsedResult.ok) {
      return parsedResult.error;
    }

    const matches = await client.machine.findMany({
      where: {
        deletedAt: null,
        OR: [{ code: parsedResult.value }, { qrCode: parsedResult.value }],
      },
      select: QrService.machineSelect,
      take: 2,
    });
    const match = this.pickMachineByScanPriority(matches, parsedResult.value);

    if (!match) {
      return this.buildErrorResponse(
        'MACHINE_NOT_FOUND',
        'No matching machine found',
        HttpStatus.NOT_FOUND,
      );
    }

    const machine = this.mapMachineRecord(match);

    // Preserve device and operator arguments in the signature so the scan-path
    // semantics remain aligned with the QR workflow contract even though this
    // transactional resolver reads directly from the database.
    void deviceId;
    void operatorName;

    return {
      ok: true,
      machine,
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

  private tryParseMachineQr(raw: string):
    | {
        ok: true;
        value: string;
      }
    | {
        ok: false;
        error: ChargeErrorResponseInternal;
      } {
    if (!raw) {
      return {
        ok: false,
        error: this.buildErrorResponse(
          'INVALID_REQUEST',
          'Machine QR is invalid',
          HttpStatus.BAD_REQUEST,
        ),
      };
    }

    // MVP compatibility: raw legacy machine tokens such as QR-MACH-001 are
    // accepted directly in machineQr, even without the MACHINE: prefix.
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
        error: this.buildErrorResponse(
          'INVALID_REQUEST',
          'Machine QR is invalid',
          HttpStatus.BAD_REQUEST,
        ),
      };
    }

    if (parsed.payload.entityType !== QrEntityType.MACHINE) {
      return {
        ok: false,
        error: this.buildErrorResponse(
          'INVALID_REQUEST',
          'The provided machine QR is not a machine identifier',
          HttpStatus.BAD_REQUEST,
        ),
      };
    }

    return {
      ok: true,
      value: parsed.payload.value,
    };
  }

  private mapMachineRecord(record: MachineRecord): ChargePreviewMachineSummary {
    return {
      id: record.id,
      code: record.code,
      qrCode: record.qrCode,
      name: record.name,
      status: record.status,
      area: record.area,
      project: record.project,
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
      hasOpenChargeSession: false,
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

  private withOpenChargeFlag(
    machine: ChargePreviewMachineSummary | MachineScanEntity,
    hasOpenChargeSession: boolean,
  ): ChargePreviewMachineSummary {
    return {
      id: machine.id,
      code: machine.code,
      qrCode: machine.qrCode,
      name: machine.name,
      status: machine.status,
      area: machine.area,
      project: machine.project,
      currentPad: machine.currentPad,
      hasOpenChargeSession,
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

  private buildPreviewResponse(
    response: ChargePreviewResponse,
  ): ChargePreviewResponse {
    return response;
  }

  private buildErrorResponse(
    decision: Exclude<ChargeWriteDecision, 'CHARGED'>,
    message: string,
    httpStatus: number,
  ): ChargeErrorResponseInternal {
    return {
      ok: false,
      decision,
      message,
      httpStatus,
    };
  }

  private mapTransactionError(error: unknown): ChargeErrorResponseInternal {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      const errorMessage = error.message;

      if (
        errorMessage.includes('ChargeSession_open_machineId_key') ||
        errorMessage.includes('VacuumPad_currentMachineId_active_key')
      ) {
        return this.buildErrorResponse(
          'MACHINE_OCCUPIED',
          'Selected machine is already occupied',
          HttpStatus.CONFLICT,
        );
      }

      if (errorMessage.includes('ChargeSession_open_vacuumPadId_key')) {
        return this.buildErrorResponse(
          'ALREADY_ACTIVE',
          'Vacuum is already active on a machine',
          HttpStatus.CONFLICT,
        );
      }
    }

    return this.buildErrorResponse(
      'INVALID_REQUEST',
      'Charge request could not be completed',
      HttpStatus.CONFLICT,
    );
  }
}
