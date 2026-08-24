import {
  LocationStatus,
  MachineStatus,
  OperationalStatus,
  RackLocationType,
} from '@prisma/client';

export enum QrEntityType {
  VACUUM = 'VACUUM',
  RACK = 'RACK',
  MACHINE = 'MACHINE',
}

export enum QrScanContext {
  CHARGE = 'CHARGE',
  DECHARGE = 'DECHARGE',
  FAULT_REPORT = 'FAULT_REPORT',
  FAULT_RESTORE = 'FAULT_RESTORE',
  STATUS = 'STATUS',
}

export enum QrInputFormat {
  COMPACT = 'COMPACT',
  JSON = 'JSON',
  LEGACY_RAW = 'LEGACY_RAW',
}

export type VacuumDisplayStatus = 'ACTIVE' | 'NOTACTIVE' | 'REPAIR';

export type QrErrorCode = 'QR_NOT_FOUND' | 'QR_MALFORMED' | 'QR_UNSUPPORTED';

export interface QrScanInputEcho {
  raw: string;
  normalizedRaw: string;
  context: QrScanContext;
  deviceId: string;
  operatorName: string | null;
  format?: QrInputFormat;
}

export interface CurrentPadSummary {
  id: string;
  code: string;
  qrCode: string;
  serialNumber: string | null;
  locationStatus: LocationStatus;
  operationalStatus: OperationalStatus;
  displayStatus: VacuumDisplayStatus;
}

export interface CurrentMachineSummary {
  id: string;
  code: string;
  qrCode: string;
  name: string;
  status: MachineStatus;
}

export interface CurrentRackLocationSummary {
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

export interface VacuumScanEntity {
  id: string;
  code: string;
  qrCode: string;
  serialNumber: string | null;
  description: string | null;
  locationStatus: LocationStatus;
  operationalStatus: OperationalStatus;
  displayStatus: VacuumDisplayStatus;
  currentMachine: CurrentMachineSummary | null;
  currentRackLocation: CurrentRackLocationSummary | null;
}

export interface RackScanEntity {
  id: string;
  code: string;
  qrCode: string;
  label: string | null;
  type: RackLocationType;
  zone: string | null;
  rack: string | null;
  level: string | null;
  slot: string | null;
  currentPad: CurrentPadSummary | null;
}

export interface MachineScanEntity {
  id: string;
  code: string;
  qrCode: string;
  name: string;
  status: MachineStatus;
  area: string | null;
  project: string | null;
  currentPad: CurrentPadSummary | null;
}

export interface WorkflowHints {
  context: QrScanContext;
  canContinue: boolean;
  reason: string;
  nextExpectedEntityTypes: QrEntityType[];
}

export interface QrScanSuccessResponse {
  ok: true;
  entityType: QrEntityType;
  input: QrScanInputEcho;
  entity: VacuumScanEntity | RackScanEntity | MachineScanEntity;
  workflowHints: WorkflowHints;
}

export interface QrScanErrorResponse {
  ok: false;
  errorCode: QrErrorCode;
  message: string;
  input: QrScanInputEcho;
}

export type QrScanResponse = QrScanSuccessResponse | QrScanErrorResponse;

export interface ParsedQrPayload {
  entityType: QrEntityType;
  value: string;
  format: QrInputFormat;
}
