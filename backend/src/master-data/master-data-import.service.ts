import * as fs from 'node:fs';
import * as path from 'node:path';
import AdmZip from 'adm-zip';
import {
  LocationStatus,
  MachineStatus,
  OperationalStatus,
  Prisma,
  PrismaClient,
  RackLocationType,
  RepairPriority,
} from '@prisma/client';
import {
  deriveIncompleteVacuumQrCode,
  deriveMachineQrCode,
  deriveRackQrCode,
  deriveVacuumQrCode,
} from '../../prisma/seed-helpers';

export const DEFAULT_MASTER_DATA_WORKBOOK_PATH = path.resolve(
  process.cwd(),
  '..',
  'docs',
  'source',
  'vacuum-traceability-master-data-template.xlsx',
);

export type EntityName =
  | 'VacuumPads'
  | 'Machines'
  | 'RackLocations'
  | 'FaultCatalog';
type ImportPrisma = Pick<
  PrismaClient,
  '$transaction' | 'vacuumPad' | 'machine' | 'rackLocation' | 'faultCatalog'
>;
type TransactionPrisma = Prisma.TransactionClient;
type CellValue = string | number | boolean | null;

export interface WorkbookRow {
  rowNumber: number;
  values: Record<string, CellValue>;
}

export type MasterDataWorkbookRows = Record<EntityName, WorkbookRow[]>;

export interface MasterDataEntityImportSummary {
  rowsRead: number;
  creates: number;
  updates: number;
  unchanged: number;
  incomplete: number;
}

export interface MasterDataImportResult {
  ok: boolean;
  dryRun: boolean;
  workbookPath: string;
  entities: Record<EntityName, MasterDataEntityImportSummary>;
  warnings: string[];
  errors: string[];
}

interface VacuumImportRow {
  sheet: EntityName;
  rowNumber: number;
  code: string;
  suppliedCode: string | null;
  serialNumber: string | null;
  description: string | null;
  operationalStatus?: OperationalStatus;
  locationStatus?: LocationStatus;
  currentRackCode?: string;
  currentMachineCode?: string;
  dimensions?: string | null;
  type?: string | null;
  netWeightKg?: number | null;
  dimensionLengthMm?: number | null;
  dimensionWidthMm?: number | null;
  dimensionHeightMm?: number | null;
  liftingCapacityKg?: number | null;
  costEuro?: number | null;
  receivedAt?: Date | null;
}

interface MachineImportRow {
  sheet: EntityName;
  rowNumber: number;
  code: string;
  suppliedCode: string | null;
  name: string;
  status?: MachineStatus;
  description?: string | null;
  area?: string | null;
  project?: string | null;
}

interface RackImportRow {
  sheet: EntityName;
  rowNumber: number;
  code: string;
  suppliedCode: string | null;
  type?: RackLocationType;
  zone?: string | null;
  rack?: string | null;
  level?: string | null;
  slot?: string | null;
  label?: string | null;
  capacity?: number;
  isActive?: boolean;
}

interface FaultImportRow {
  sheet: EntityName;
  rowNumber: number;
  code: string;
  suppliedCode: string | null;
  label: string;
  description: string | null;
  severity?: RepairPriority;
  sortOrder?: number;
  isActive?: boolean;
}

interface ParsedImportRows {
  vacuums: VacuumImportRow[];
  machines: MachineImportRow[];
  racks: RackImportRow[];
  faults: FaultImportRow[];
}

interface ExistingMasterData {
  vacuumCodes: Set<string>;
  vacuumSerialByCode: Map<string, string | null>;
  vacuumCodeBySerial: Map<string, string>;
  vacuumByCode: Map<string, ExistingVacuumRecord>;
  machineCodes: Set<string>;
  machineByCode: Map<string, ExistingMachineRecord>;
  rackCodes: Set<string>;
  rackByCode: Map<string, ExistingRackRecord>;
  faultCodes: Set<string>;
  faultByCode: Map<string, ExistingFaultRecord>;
}

interface ExistingVacuumRecord {
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
  costEuro: Prisma.Decimal | number | string | null;
  receivedAt: Date | null;
  operationalStatus: OperationalStatus;
  locationStatus: LocationStatus;
  deletedAt: Date | null;
  currentRackLocation: { code: string } | null;
  currentMachine: { code: string } | null;
}

interface ExistingMachineRecord {
  code: string;
  qrCode: string;
  name: string;
  status: MachineStatus;
  description: string | null;
  area: string | null;
  project: string | null;
  deletedAt: Date | null;
}

interface ExistingRackRecord {
  code: string;
  qrCode: string;
  type: RackLocationType;
  zone: string | null;
  rack: string | null;
  level: string | null;
  slot: string | null;
  label: string | null;
  capacity: number;
  isActive: boolean;
  deletedAt: Date | null;
}

interface ExistingFaultRecord {
  code: string;
  label: string;
  description: string | null;
  severity: RepairPriority | null;
  sortOrder: number;
  isActive: boolean;
  deletedAt: Date | null;
}

const emptyEntitySummary = (): MasterDataEntityImportSummary => ({
  rowsRead: 0,
  creates: 0,
  updates: 0,
  unchanged: 0,
  incomplete: 0,
});

const requiredSheets: EntityName[] = [
  'VacuumPads',
  'Machines',
  'RackLocations',
  'FaultCatalog',
];

export class MasterDataImportService {
  constructor(private readonly prisma: ImportPrisma) {}

  async importFromWorkbook(options: {
    workbookPath?: string;
    dryRun?: boolean;
  }): Promise<MasterDataImportResult> {
    const workbookPath =
      options.workbookPath ?? DEFAULT_MASTER_DATA_WORKBOOK_PATH;
    const workbookRows = readMasterDataWorkbook(workbookPath);

    return this.importWorkbookRows(workbookRows, {
      workbookPath,
      dryRun: options.dryRun ?? false,
    });
  }

  async importEntityFromWorkbookBuffer(options: {
    entity: EntityName;
    fileName: string;
    buffer: Buffer;
    dryRun?: boolean;
  }): Promise<MasterDataImportResult> {
    const workbookRows = readMasterDataEntityWorkbookBuffer(
      options.buffer,
      options.entity,
    );

    return this.importWorkbookRows(workbookRows, {
      workbookPath: options.fileName,
      dryRun: options.dryRun ?? false,
    });
  }

  async importWorkbookRows(
    workbookRows: MasterDataWorkbookRows,
    options: { workbookPath: string; dryRun: boolean },
  ): Promise<MasterDataImportResult> {
    const result = createImportResult(options.workbookPath, options.dryRun);
    const parsedRows = parseImportRows(workbookRows, result);
    result.entities.VacuumPads.rowsRead = parsedRows.vacuums.length;
    result.entities.Machines.rowsRead = parsedRows.machines.length;
    result.entities.RackLocations.rowsRead = parsedRows.racks.length;
    result.entities.FaultCatalog.rowsRead = parsedRows.faults.length;

    if (result.errors.length > 0) {
      result.ok = false;
      return result;
    }

    const existing = await this.loadExistingMasterData();
    this.resolveImportCodes(parsedRows, existing, result);

    if (result.errors.length > 0) {
      result.ok = false;
      return result;
    }

    validateResolvedDuplicateValues(parsedRows, result);
    this.validateAgainstExistingData(parsedRows, existing, result);
    this.populatePlanCounts(parsedRows, existing, result);

    if (result.errors.length > 0) {
      result.ok = false;
      return result;
    }

    if (!options.dryRun) {
      await this.prisma.$transaction(async (tx) => {
        await this.applyImportRows(tx, parsedRows, existing);
      });
    }

    result.ok = result.errors.length === 0;
    return result;
  }

  private async loadExistingMasterData(): Promise<ExistingMasterData> {
    const [vacuums, machines, racks, faults] = await Promise.all([
      this.prisma.vacuumPad.findMany({
        select: {
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
          operationalStatus: true,
          locationStatus: true,
          deletedAt: true,
          currentRackLocation: { select: { code: true } },
          currentMachine: { select: { code: true } },
        },
      }),
      this.prisma.machine.findMany({
        select: {
          code: true,
          qrCode: true,
          name: true,
          status: true,
          description: true,
          area: true,
          project: true,
          deletedAt: true,
        },
      }),
      this.prisma.rackLocation.findMany({
        select: {
          code: true,
          qrCode: true,
          type: true,
          zone: true,
          rack: true,
          level: true,
          slot: true,
          label: true,
          capacity: true,
          isActive: true,
          deletedAt: true,
        },
      }),
      this.prisma.faultCatalog.findMany({
        select: {
          code: true,
          label: true,
          description: true,
          severity: true,
          sortOrder: true,
          isActive: true,
          deletedAt: true,
        },
      }),
    ]);

    return {
      vacuumCodes: new Set(vacuums.map((vacuum) => vacuum.code)),
      vacuumSerialByCode: new Map(
        vacuums.map((vacuum) => [vacuum.code, vacuum.serialNumber]),
      ),
      vacuumCodeBySerial: new Map(
        vacuums
          .filter((vacuum) => vacuum.serialNumber)
          .map((vacuum) => [vacuum.serialNumber as string, vacuum.code]),
      ),
      vacuumByCode: new Map(vacuums.map((vacuum) => [vacuum.code, vacuum])),
      machineCodes: new Set(machines.map((machine) => machine.code)),
      machineByCode: new Map(
        machines.map((machine) => [machine.code, machine]),
      ),
      rackCodes: new Set(racks.map((rack) => rack.code)),
      rackByCode: new Map(racks.map((rack) => [rack.code, rack])),
      faultCodes: new Set(faults.map((fault) => fault.code)),
      faultByCode: new Map(faults.map((fault) => [fault.code, fault])),
    };
  }

  private resolveImportCodes(
    parsedRows: ParsedImportRows,
    existing: ExistingMasterData,
    result: MasterDataImportResult,
  ) {
    const vacuumCodePool = new Set([
      ...existing.vacuumCodes,
      ...parsedRows.vacuums.map((row) => row.code).filter(Boolean),
    ]);
    const machineCodePool = new Set([
      ...existing.machineCodes,
      ...parsedRows.machines.map((row) => row.code).filter(Boolean),
    ]);
    const faultCodePool = new Set([
      ...existing.faultCodes,
      ...parsedRows.faults.map((row) => row.code).filter(Boolean),
    ]);

    for (const vacuum of parsedRows.vacuums) {
      const existingCode = vacuum.serialNumber
        ? existing.vacuumCodeBySerial.get(vacuum.serialNumber)
        : undefined;

      if (existingCode) {
        if (vacuum.suppliedCode && vacuum.suppliedCode !== existingCode) {
          result.warnings.push(
            `${vacuum.sheet} row ${vacuum.rowNumber}: serialNumber ${vacuum.serialNumber} already exists as ${existingCode}; using that code and updating the rest of the fields.`,
          );
        }
        vacuum.code = existingCode;
      } else if (!vacuum.code) {
        vacuum.code = nextAvailableNumberedCode(vacuumCodePool, 'VP');
        vacuumCodePool.add(vacuum.code);
        result.warnings.push(
          `${vacuum.sheet} row ${vacuum.rowNumber}: missing code; generated ${vacuum.code}.`,
        );
      }
    }

    for (const machine of parsedRows.machines) {
      if (!machine.code) {
        machine.code = nextAvailableNumberedCode(machineCodePool, 'MACH');
        machineCodePool.add(machine.code);
        result.warnings.push(
          `${machine.sheet} row ${machine.rowNumber}: missing code; generated ${machine.code}.`,
        );
      }
    }

    for (const rack of parsedRows.racks) {
      if (!rack.code) {
        rack.code = deriveRackCodeFromRow(rack, result);
      }
    }

    for (const fault of parsedRows.faults) {
      if (!fault.code) {
        fault.code = nextAvailableNumberedCode(faultCodePool, 'FC');
        faultCodePool.add(fault.code);
        result.warnings.push(
          `${fault.sheet} row ${fault.rowNumber}: missing code; generated ${fault.code}.`,
        );
      }
    }
  }

  private validateAgainstExistingData(
    parsedRows: ParsedImportRows,
    existing: ExistingMasterData,
    result: MasterDataImportResult,
  ) {
    const workbookMachineCodes = new Set(
      parsedRows.machines.map((machine) => machine.code),
    );
    const workbookRackCodes = new Set(
      parsedRows.racks.map((rack) => rack.code),
    );

    for (const vacuum of parsedRows.vacuums) {
      if (!vacuum.serialNumber) {
        result.warnings.push(
          `${vacuum.sheet} row ${vacuum.rowNumber}: missing serialNumber; importing as incomplete/non-operational master data.`,
        );
      }

      if (
        vacuum.currentMachineCode &&
        !existing.machineCodes.has(vacuum.currentMachineCode) &&
        !workbookMachineCodes.has(vacuum.currentMachineCode)
      ) {
        result.errors.push(
          `${vacuum.sheet} row ${vacuum.rowNumber}: currentMachineCode ${vacuum.currentMachineCode} does not exist in database or workbook.`,
        );
      }

      if (
        vacuum.currentRackCode &&
        !existing.rackCodes.has(vacuum.currentRackCode) &&
        !workbookRackCodes.has(vacuum.currentRackCode)
      ) {
        result.errors.push(
          `${vacuum.sheet} row ${vacuum.rowNumber}: currentRackCode ${vacuum.currentRackCode} does not exist in database or workbook.`,
        );
      }
    }
  }

  private populatePlanCounts(
    parsedRows: ParsedImportRows,
    existing: ExistingMasterData,
    result: MasterDataImportResult,
  ) {
    for (const vacuum of parsedRows.vacuums) {
      incrementPlan(result.entities.VacuumPads, {
        existingRecord: existing.vacuumByCode.get(vacuum.code),
        isUnchanged: (record) => isVacuumUnchanged(vacuum, record),
      });

      if (!vacuum.serialNumber) {
        result.entities.VacuumPads.incomplete += 1;
      }
    }

    for (const machine of parsedRows.machines) {
      incrementPlan(result.entities.Machines, {
        existingRecord: existing.machineByCode.get(machine.code),
        isUnchanged: (record) => isMachineUnchanged(machine, record),
      });
    }

    for (const rack of parsedRows.racks) {
      incrementPlan(result.entities.RackLocations, {
        existingRecord: existing.rackByCode.get(rack.code),
        isUnchanged: (record) => isRackUnchanged(rack, record),
      });
    }

    for (const fault of parsedRows.faults) {
      incrementPlan(result.entities.FaultCatalog, {
        existingRecord: existing.faultByCode.get(fault.code),
        isUnchanged: (record) => isFaultUnchanged(fault, record),
      });
    }
  }

  private async applyImportRows(
    tx: TransactionPrisma,
    parsedRows: ParsedImportRows,
    existing: ExistingMasterData,
  ) {
    for (const machine of parsedRows.machines) {
      const existingMachine = existing.machineByCode.get(machine.code);
      if (existingMachine && isMachineUnchanged(machine, existingMachine)) {
        continue;
      }

      await tx.machine.upsert({
        where: { code: machine.code },
        update: {
          qrCode: deriveMachineQrCode(machine.code),
          name: machine.name,
          status: machine.status ?? MachineStatus.ACTIVE,
          description: machine.description,
          area: machine.area,
          project: machine.project,
          deletedAt: null,
        },
        create: {
          code: machine.code,
          qrCode: deriveMachineQrCode(machine.code),
          name: machine.name,
          status: machine.status ?? MachineStatus.ACTIVE,
          description: machine.description,
          area: machine.area,
          project: machine.project,
        },
      });
    }

    for (const rack of parsedRows.racks) {
      const existingRack = existing.rackByCode.get(rack.code);
      if (existingRack && isRackUnchanged(rack, existingRack)) {
        continue;
      }

      await tx.rackLocation.upsert({
        where: { code: rack.code },
        update: {
          qrCode: deriveRackQrCode(rack.code),
          type: rack.type ?? RackLocationType.AVL,
          zone: rack.zone,
          rack: rack.rack,
          level: rack.level,
          slot: rack.slot,
          label: rack.label,
          capacity: rack.capacity ?? 1,
          isActive: rack.isActive ?? true,
          deletedAt: null,
        },
        create: {
          code: rack.code,
          qrCode: deriveRackQrCode(rack.code),
          type: rack.type ?? RackLocationType.AVL,
          zone: rack.zone,
          rack: rack.rack,
          level: rack.level,
          slot: rack.slot,
          label: rack.label,
          capacity: rack.capacity ?? 1,
          isActive: rack.isActive ?? true,
        },
      });
    }

    for (const fault of parsedRows.faults) {
      const existingFault = existing.faultByCode.get(fault.code);
      if (existingFault && isFaultUnchanged(fault, existingFault)) {
        continue;
      }

      await tx.faultCatalog.upsert({
        where: { code: fault.code },
        update: {
          label: fault.label,
          description: fault.description,
          sortOrder: fault.sortOrder ?? 0,
          isActive: fault.isActive ?? true,
          deletedAt: null,
          severity: fault.severity ?? null,
        },
        create: {
          code: fault.code,
          label: fault.label,
          description: fault.description,
          severity: fault.severity ?? null,
          sortOrder: fault.sortOrder ?? 0,
          isActive: fault.isActive ?? true,
        },
      });
    }

    for (const vacuum of parsedRows.vacuums) {
      const existingVacuum = existing.vacuumByCode.get(vacuum.code);
      if (existingVacuum && isVacuumUnchanged(vacuum, existingVacuum)) {
        continue;
      }

      await tx.vacuumPad.upsert({
        where: { code: vacuum.code },
        update: {
          qrCode: deriveImportVacuumQrCode(vacuum),
          serialNumber: vacuum.serialNumber,
          description: vacuum.description,
          dimensions: vacuum.dimensions,
          type: vacuum.type,
          netWeightKg: vacuum.netWeightKg,
          dimensionLengthMm: vacuum.dimensionLengthMm,
          dimensionWidthMm: vacuum.dimensionWidthMm,
          dimensionHeightMm: vacuum.dimensionHeightMm,
          liftingCapacityKg: vacuum.liftingCapacityKg,
          costEuro: vacuum.costEuro,
          receivedAt: vacuum.receivedAt,
          operationalStatus:
            vacuum.operationalStatus ?? OperationalStatus.FUNCTIONAL,
          locationStatus: vacuum.locationStatus ?? LocationStatus.UNKNOWN,
          deletedAt: null,
          ...vacuumRelationUpdate(vacuum),
        },
        create: {
          code: vacuum.code,
          qrCode: deriveImportVacuumQrCode(vacuum),
          serialNumber: vacuum.serialNumber,
          description: vacuum.description,
          dimensions: vacuum.dimensions,
          type: vacuum.type,
          netWeightKg: vacuum.netWeightKg,
          dimensionLengthMm: vacuum.dimensionLengthMm,
          dimensionWidthMm: vacuum.dimensionWidthMm,
          dimensionHeightMm: vacuum.dimensionHeightMm,
          liftingCapacityKg: vacuum.liftingCapacityKg,
          costEuro: vacuum.costEuro,
          receivedAt: vacuum.receivedAt,
          operationalStatus:
            vacuum.operationalStatus ?? OperationalStatus.FUNCTIONAL,
          locationStatus: vacuum.locationStatus ?? LocationStatus.UNKNOWN,
          ...vacuumRelationCreate(vacuum),
        },
      });
    }
  }
}

export function readMasterDataWorkbook(
  workbookPath: string,
): MasterDataWorkbookRows {
  if (!fs.existsSync(workbookPath)) {
    throw new Error(`Workbook not found: ${workbookPath}`);
  }

  return readMasterDataWorkbookFromZip(
    new AdmZip(workbookPath),
    requiredSheets,
  );
}

export function readMasterDataEntityWorkbookBuffer(
  buffer: Buffer,
  entity: EntityName,
): MasterDataWorkbookRows {
  const rows = emptyWorkbookRows();
  const zip = new AdmZip(buffer);
  const sharedStrings = parseSharedStrings(
    readZipText(zip, 'xl/sharedStrings.xml'),
  );
  const workbookXml = readZipText(zip, 'xl/workbook.xml');
  const workbookRelsXml = readZipText(zip, 'xl/_rels/workbook.xml.rels');
  const sheetFiles = getWorkbookSheetFiles(workbookXml, workbookRelsXml);
  const sheetPath =
    sheetFiles.get(entity) ??
    Array.from(sheetFiles.values()).find((value) => value.endsWith('.xml'));

  if (!sheetPath) {
    throw new Error('Workbook does not contain any readable worksheet.');
  }

  rows[entity] = readWorksheetRows(readZipText(zip, sheetPath), sharedStrings);
  return rows;
}

function readMasterDataWorkbookFromZip(
  zip: AdmZip,
  sheetNames: EntityName[],
): MasterDataWorkbookRows {
  const sharedStrings = parseSharedStrings(
    readZipText(zip, 'xl/sharedStrings.xml'),
  );
  const workbookXml = readZipText(zip, 'xl/workbook.xml');
  const workbookRelsXml = readZipText(zip, 'xl/_rels/workbook.xml.rels');
  const sheetFiles = getWorkbookSheetFiles(workbookXml, workbookRelsXml);
  const rows = emptyWorkbookRows();

  for (const sheetName of sheetNames) {
    const sheetPath = sheetFiles.get(sheetName);
    if (!sheetPath) {
      throw new Error(`Workbook is missing required sheet: ${sheetName}`);
    }

    rows[sheetName] = readWorksheetRows(
      readZipText(zip, sheetPath),
      sharedStrings,
    );
  }

  return rows;
}

function emptyWorkbookRows(): MasterDataWorkbookRows {
  return {
    VacuumPads: [],
    Machines: [],
    RackLocations: [],
    FaultCatalog: [],
  };
}

function parseImportRows(
  workbookRows: MasterDataWorkbookRows,
  result: MasterDataImportResult,
): ParsedImportRows {
  const parsedRows: ParsedImportRows = {
    vacuums: workbookRows.VacuumPads.map((row) => parseVacuumRow(row, result)),
    machines: workbookRows.Machines.map((row) => parseMachineRow(row, result)),
    racks: workbookRows.RackLocations.map((row) => parseRackRow(row, result)),
    faults: workbookRows.FaultCatalog.map((row) => parseFaultRow(row, result)),
  };

  validateDuplicateValues(
    parsedRows.vacuums,
    'VacuumPads',
    'code',
    (row) => row.suppliedCode ?? '',
    result,
  );
  validateDuplicateValues(
    parsedRows.vacuums,
    'VacuumPads',
    'serialNumber',
    (row) => row.serialNumber ?? '',
    result,
  );
  validateDuplicateValues(
    parsedRows.machines,
    'Machines',
    'code',
    (row) => row.suppliedCode ?? '',
    result,
  );
  validateDuplicateValues(
    parsedRows.racks,
    'RackLocations',
    'code',
    (row) => row.suppliedCode ?? '',
    result,
  );
  validateDuplicateValues(
    parsedRows.faults,
    'FaultCatalog',
    'code',
    (row) => row.suppliedCode ?? '',
    result,
  );
  return parsedRows;
}

function parseVacuumRow(
  row: WorkbookRow,
  result: MasterDataImportResult,
): VacuumImportRow {
  const notes = parseNotes(cellValue(row, 'notes', 'Notes', 'Σημειώσεις'));
  const currentRackCode =
    optionalText(
      cellValue(row, 'currentRackCode', 'Current Rack Code', 'Τρέχουσα θέση'),
    ) ?? undefined;
  const currentMachineCode =
    optionalText(
      cellValue(
        row,
        'currentMachineCode',
        'Current Machine Code',
        'Τρέχον μηχάνημα',
      ),
    ) ?? undefined;

  if (currentRackCode && currentMachineCode) {
    result.errors.push(
      `${rowLabel(row)}: currentRackCode and currentMachineCode cannot both be set.`,
    );
  }

  const serialNumber = optionalText(
    cellValue(
      row,
      'serialNumber',
      'Serial Number',
      'serial',
      'Σειριακός',
      'Σειριακός Αριθμός',
    ),
  );
  const isIncomplete = !serialNumber;
  const suppliedCode = optionalText(cellValue(row, 'code', 'Code', 'Κωδικός'));

  return {
    sheet: 'VacuumPads',
    rowNumber: row.rowNumber,
    code: suppliedCode ?? '',
    suppliedCode,
    serialNumber,
    description: optionalText(
      cellValue(row, 'description', 'Description', 'Περιγραφή'),
    ),
    operationalStatus: isIncomplete
      ? OperationalStatus.OUT_OF_SERVICE
      : optionalEnum(row, 'operationalStatus', OperationalStatus, result),
    locationStatus: isIncomplete
      ? LocationStatus.UNKNOWN
      : optionalEnum(row, 'locationStatus', LocationStatus, result),
    currentRackCode: isIncomplete ? undefined : currentRackCode,
    currentMachineCode: isIncomplete ? undefined : currentMachineCode,
    dimensions: notes.dimensions ?? null,
    type: notes.type ?? null,
    netWeightKg: optionalNumber(
      cellValue(
        row,
        'netWeightKg',
        'Net Weight Kg',
        'Net Weight (kg)',
        'Καθαρό βάρος kg',
        'Καθαρό Βάρος',
      ),
      row,
      'netWeightKg',
      result,
    ),
    dimensionLengthMm: optionalInteger(
      cellValue(
        row,
        'dimensionLengthMm',
        'Length Mm',
        'Length (mm)',
        'Μήκος mm',
      ),
      row,
      'dimensionLengthMm',
      result,
    ),
    dimensionWidthMm: optionalInteger(
      cellValue(row, 'dimensionWidthMm', 'Width Mm', 'Width (mm)', 'Πλάτος mm'),
      row,
      'dimensionWidthMm',
      result,
    ),
    dimensionHeightMm: optionalInteger(
      cellValue(
        row,
        'dimensionHeightMm',
        'Height Mm',
        'Height (mm)',
        'Ύψος mm',
      ),
      row,
      'dimensionHeightMm',
      result,
    ),
    liftingCapacityKg: optionalNumber(
      cellValue(
        row,
        'liftingCapacityKg',
        'Lifting Capacity Kg',
        'Lifting Capacity (kg)',
        'Ανυψωτική ικανότητα kg',
      ),
      row,
      'liftingCapacityKg',
      result,
    ),
    costEuro: optionalNumber(
      cellValue(row, 'costEuro', 'Cost Euro', 'Cost (€)', 'Κόστος', 'Κόστος €'),
      row,
      'costEuro',
      result,
    ),
    receivedAt: optionalDate(
      cellValue(
        row,
        'receivedAt',
        'Received At',
        'Received Date',
        'Ημερομηνία Παραλαβής',
        'Παραλαβή',
      ),
      row,
      'receivedAt',
      result,
    ),
  };
}

function parseMachineRow(
  row: WorkbookRow,
  result: MasterDataImportResult,
): MachineImportRow {
  const notes = parseNotes(cellValue(row, 'notes', 'Notes', 'Σημειώσεις'));
  const suppliedCode = optionalText(cellValue(row, 'code', 'Code', 'Κωδικός'));

  return {
    sheet: 'Machines',
    rowNumber: row.rowNumber,
    code: suppliedCode ?? '',
    suppliedCode,
    name: requiredText(row, 'name', result, 'Name', 'Όνομα'),
    status: optionalEnum(row, 'status', MachineStatus, result),
    description: notes.description ?? null,
    area: notes.area ?? null,
    project: notes.project ?? null,
  };
}

function parseRackRow(
  row: WorkbookRow,
  result: MasterDataImportResult,
): RackImportRow {
  const notes = parseNotes(cellValue(row, 'notes', 'Notes', 'Σημειώσεις'));
  const capacity = optionalInteger(
    notes.capacity,
    row,
    'notes.capacity',
    result,
  );
  const suppliedCode = optionalText(cellValue(row, 'code', 'Code', 'Κωδικός'));

  return {
    sheet: 'RackLocations',
    rowNumber: row.rowNumber,
    code: suppliedCode ?? '',
    suppliedCode,
    type: optionalEnum(row, 'type', RackLocationType, result),
    zone: optionalText(cellValue(row, 'area', 'zone', 'Περιοχή')),
    rack: optionalText(cellValue(row, 'row', 'rack', 'Row')),
    slot: optionalText(cellValue(row, 'position', 'slot', 'Position', 'Θέση')),
    label: notes.label ?? null,
    level: notes.level ?? null,
    capacity,
    isActive: optionalBoolean(
      cellValue(row, 'isActive', 'Active', 'Ενεργή'),
      row,
      'isActive',
      result,
    ),
  };
}

function parseFaultRow(
  row: WorkbookRow,
  result: MasterDataImportResult,
): FaultImportRow {
  const severity = optionalEnum(row, 'severity', RepairPriority, result);
  const suppliedCode = optionalText(cellValue(row, 'code', 'Code', 'Κωδικός'));

  return {
    sheet: 'FaultCatalog',
    rowNumber: row.rowNumber,
    code: suppliedCode ?? '',
    suppliedCode,
    label: requiredText(row, 'label', result, 'Label', 'Βλάβη', 'Περιγραφή'),
    description: optionalText(
      cellValue(row, 'description', 'Description', 'Αναλυτική Περιγραφή'),
    ),
    severity,
    sortOrder: optionalInteger(
      cellValue(row, 'sortOrder', 'Sort Order'),
      row,
      'sortOrder',
      result,
    ),
    isActive: optionalBoolean(
      cellValue(row, 'isActive', 'Active', 'Ενεργή'),
      row,
      'isActive',
      result,
    ),
  };
}

function createImportResult(
  workbookPath: string,
  dryRun: boolean,
): MasterDataImportResult {
  return {
    ok: true,
    dryRun,
    workbookPath,
    entities: {
      VacuumPads: emptyEntitySummary(),
      Machines: emptyEntitySummary(),
      RackLocations: emptyEntitySummary(),
      FaultCatalog: emptyEntitySummary(),
    },
    warnings: [],
    errors: [],
  };
}

function vacuumRelationUpdate(vacuum: VacuumImportRow) {
  if (!vacuum.serialNumber) {
    return {
      currentMachine: { disconnect: true },
      currentRackLocation: { disconnect: true },
    };
  }

  return {};
}

function vacuumRelationCreate(vacuum: VacuumImportRow) {
  if (!vacuum.serialNumber) {
    return {};
  }

  return {};
}

function incrementPlan<TExisting>(
  summary: MasterDataEntityImportSummary,
  plan: {
    existingRecord: TExisting | undefined;
    isUnchanged: (record: TExisting) => boolean;
  },
) {
  if (!plan.existingRecord) {
    summary.creates += 1;
  } else if (plan.isUnchanged(plan.existingRecord)) {
    summary.unchanged += 1;
  } else {
    summary.updates += 1;
  }
}

function isVacuumUnchanged(
  row: VacuumImportRow,
  existing: ExistingVacuumRecord,
) {
  return (
    existing.deletedAt === null &&
    existing.qrCode === deriveImportVacuumQrCode(row) &&
    sameNullable(existing.serialNumber, row.serialNumber) &&
    sameNullable(existing.description, row.description) &&
    sameNullable(existing.dimensions, row.dimensions) &&
    sameNullable(existing.type, row.type) &&
    sameNullableNumber(existing.netWeightKg, row.netWeightKg) &&
    sameNullableNumber(existing.dimensionLengthMm, row.dimensionLengthMm) &&
    sameNullableNumber(existing.dimensionWidthMm, row.dimensionWidthMm) &&
    sameNullableNumber(existing.dimensionHeightMm, row.dimensionHeightMm) &&
    sameNullableNumber(existing.liftingCapacityKg, row.liftingCapacityKg) &&
    sameNullableNumber(existing.costEuro, row.costEuro) &&
    sameNullableDate(existing.receivedAt, row.receivedAt) &&
    existing.operationalStatus ===
      (row.operationalStatus ?? OperationalStatus.FUNCTIONAL) &&
    existing.locationStatus === (row.locationStatus ?? LocationStatus.UNKNOWN)
  );
}

function isMachineUnchanged(
  row: MachineImportRow,
  existing: ExistingMachineRecord,
) {
  return (
    existing.deletedAt === null &&
    existing.qrCode === deriveMachineQrCode(row.code) &&
    existing.name === row.name &&
    existing.status === (row.status ?? MachineStatus.ACTIVE) &&
    sameNullable(existing.description, row.description) &&
    sameNullable(existing.area, row.area) &&
    sameNullable(existing.project, row.project)
  );
}

function isRackUnchanged(row: RackImportRow, existing: ExistingRackRecord) {
  return (
    existing.deletedAt === null &&
    existing.qrCode === deriveRackQrCode(row.code) &&
    existing.type === (row.type ?? RackLocationType.AVL) &&
    sameNullable(existing.zone, row.zone) &&
    sameNullable(existing.rack, row.rack) &&
    sameNullable(existing.level, row.level) &&
    sameNullable(existing.slot, row.slot) &&
    sameNullable(existing.label, row.label) &&
    existing.capacity === (row.capacity ?? 1) &&
    existing.isActive === (row.isActive ?? true)
  );
}

function isFaultUnchanged(row: FaultImportRow, existing: ExistingFaultRecord) {
  return (
    existing.deletedAt === null &&
    existing.label === row.label &&
    sameNullable(existing.description, row.description) &&
    existing.severity === (row.severity ?? null) &&
    existing.sortOrder === (row.sortOrder ?? 0) &&
    existing.isActive === (row.isActive ?? true)
  );
}

function deriveImportVacuumQrCode(row: VacuumImportRow) {
  return row.serialNumber
    ? deriveVacuumQrCode(row.serialNumber)
    : deriveIncompleteVacuumQrCode(row.code);
}

function sameNullable(
  existingValue: string | null | undefined,
  importedValue: string | null | undefined,
) {
  return (existingValue ?? null) === (importedValue ?? null);
}

function sameNullableNumber(
  existingValue: number | Prisma.Decimal | string | null | undefined,
  importedValue: number | null | undefined,
) {
  const existingNumber =
    existingValue === undefined || existingValue === null
      ? null
      : Number(existingValue);
  const normalizedExisting =
    existingNumber === null || !Number.isFinite(existingNumber)
      ? null
      : existingNumber;
  return normalizedExisting === (importedValue ?? null);
}

function sameNullableDate(
  existingValue: Date | null | undefined,
  importedValue: Date | null | undefined,
) {
  return (
    (existingValue?.toISOString() ?? null) ===
    (importedValue?.toISOString() ?? null)
  );
}

function validateResolvedDuplicateValues(
  parsedRows: ParsedImportRows,
  result: MasterDataImportResult,
) {
  validateDuplicateValues(
    parsedRows.vacuums,
    'VacuumPads',
    'code',
    (row) => row.code,
    result,
  );
  validateDuplicateValues(
    parsedRows.machines,
    'Machines',
    'code',
    (row) => row.code,
    result,
  );
  validateDuplicateValues(
    parsedRows.racks,
    'RackLocations',
    'code',
    (row) => row.code,
    result,
  );
  validateDuplicateValues(
    parsedRows.faults,
    'FaultCatalog',
    'code',
    (row) => row.code,
    result,
  );
}

function validateDuplicateValues<T>(
  rows: T[],
  sheet: EntityName,
  field: string,
  getValue: (row: T) => string,
  result: MasterDataImportResult,
) {
  const firstSeen = new Map<string, number>();

  for (const row of rows as Array<T & { rowNumber: number }>) {
    const value = getValue(row);
    if (!value) {
      continue;
    }

    const previousRow = firstSeen.get(value);

    if (previousRow) {
      result.errors.push(
        `${sheet} row ${row.rowNumber}: duplicate ${field} ${value}; first seen on row ${previousRow}.`,
      );
    } else {
      firstSeen.set(value, row.rowNumber);
    }
  }
}

function requiredText(
  row: WorkbookRow,
  field: string,
  result: MasterDataImportResult,
  ...aliases: string[]
) {
  const value = optionalText(cellValue(row, field, ...aliases));
  if (!value) {
    result.errors.push(`${rowLabel(row)}: ${field} is required.`);
    return '';
  }

  return value;
}

function cellValue(row: WorkbookRow, field: string, ...aliases: string[]) {
  const keys = [field, ...aliases];
  const normalized = new Map(
    Object.entries(row.values).map(([key, value]) => [
      normalizeHeader(key),
      value,
    ]),
  );

  for (const key of keys) {
    const directValue = row.values[key];
    if (directValue !== undefined) {
      return directValue;
    }

    const aliasValue = normalized.get(normalizeHeader(key));
    if (aliasValue !== undefined) {
      return aliasValue;
    }
  }

  return undefined;
}

function normalizeHeader(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9α-ωάέήίόύώϊϋΐΰ]+/gi, '');
}

function optionalText(value: CellValue | undefined): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  const normalized = String(value).trim();
  return normalized ? normalized : null;
}

function optionalEnum<T extends Record<string, string>>(
  row: WorkbookRow,
  field: string,
  enumObject: T,
  result: MasterDataImportResult,
): T[keyof T] | undefined {
  const value = optionalText(row.values[field]);

  if (!value) {
    return undefined;
  }

  const normalized = value.toUpperCase();
  const allowed = new Set(Object.values(enumObject));

  if (!allowed.has(normalized)) {
    result.errors.push(
      `${rowLabel(row)}: invalid ${field} ${value}; allowed values are ${Array.from(allowed).join(', ')}.`,
    );
    return undefined;
  }

  return normalized as T[keyof T];
}

function optionalInteger(
  value: CellValue | undefined,
  row: WorkbookRow,
  field: string,
  result: MasterDataImportResult,
): number | undefined {
  const text = optionalText(value);

  if (!text) {
    return undefined;
  }

  const parsed = Number(text);

  if (!Number.isInteger(parsed) || parsed < 0) {
    result.errors.push(
      `${rowLabel(row)}: ${field} must be a non-negative integer.`,
    );
    return undefined;
  }

  return parsed;
}

function optionalNumber(
  value: CellValue | undefined,
  row: WorkbookRow,
  field: string,
  result: MasterDataImportResult,
): number | null {
  const text = optionalText(value);

  if (!text) {
    return null;
  }

  const parsed = Number(text.replace(',', '.'));

  if (!Number.isFinite(parsed) || parsed < 0) {
    result.errors.push(
      `${rowLabel(row)}: ${field} must be a non-negative number.`,
    );
    return null;
  }

  return parsed;
}

function optionalDate(
  value: CellValue | undefined,
  row: WorkbookRow,
  field: string,
  result: MasterDataImportResult,
): Date | null {
  const text = optionalText(value);

  if (!text) {
    return null;
  }

  const date =
    typeof value === 'number' ? excelSerialDateToDate(value) : new Date(text);

  if (Number.isNaN(date.getTime())) {
    result.errors.push(`${rowLabel(row)}: ${field} must be a valid date.`);
    return null;
  }

  return date;
}

function excelSerialDateToDate(value: number) {
  const epoch = Date.UTC(1899, 11, 30);
  return new Date(epoch + value * 24 * 60 * 60 * 1000);
}

function optionalBoolean(
  value: CellValue | undefined,
  row: WorkbookRow,
  field: string,
  result: MasterDataImportResult,
): boolean | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  const normalized = String(value).trim().toLowerCase();

  if (['true', 'yes', '1', 'y'].includes(normalized)) {
    return true;
  }

  if (['false', 'no', '0', 'n'].includes(normalized)) {
    return false;
  }

  result.errors.push(`${rowLabel(row)}: ${field} must be true or false.`);
  return undefined;
}

function parseNotes(value: CellValue | undefined): Record<string, string> {
  const text = optionalText(value);

  if (!text) {
    return {};
  }

  const notes: Record<string, string> = {};

  for (const entry of text
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)) {
    const separatorIndex = entry.indexOf('=');
    const key =
      separatorIndex === -1 ? entry : entry.slice(0, separatorIndex).trim();
    const noteValue =
      separatorIndex === -1 ? '' : entry.slice(separatorIndex + 1).trim();

    if (key) {
      notes[key] = noteValue;
    }
  }

  return notes;
}

function deriveRackCodeFromRow(
  row: RackImportRow,
  result: MasterDataImportResult,
) {
  const area = normalizeRackCodeSegment(row.zone, 'area', row, result);
  const rack = normalizeRackCodeSegment(row.rack, 'row', row, result, true);
  const position = normalizeRackCodeSegment(
    row.slot,
    'position',
    row,
    result,
    true,
  );

  if (!area || !rack || !position) {
    return '';
  }

  const rowWithoutAreaPrefix = rack.startsWith(`${area}-`)
    ? rack.slice(area.length + 1)
    : rack;
  const normalizedRow = /^\d+$/.test(rowWithoutAreaPrefix)
    ? rowWithoutAreaPrefix.padStart(2, '0')
    : rowWithoutAreaPrefix;

  const code = `RACK-${area}-${normalizedRow}-${position}`;
  result.warnings.push(
    `${row.sheet} row ${row.rowNumber}: missing code; generated ${code}.`,
  );
  return code;
}

function normalizeRackCodeSegment(
  value: string | null | undefined,
  field: string,
  row: RackImportRow,
  result: MasterDataImportResult,
  padNumeric = false,
) {
  const normalized = value?.trim().toUpperCase().replace(/\s+/g, '-');

  if (!normalized) {
    result.errors.push(
      `${row.sheet} row ${row.rowNumber}: ${field} is required to generate rack code.`,
    );
    return '';
  }

  if (!/^[A-Z0-9-]+$/.test(normalized)) {
    result.errors.push(
      `${row.sheet} row ${row.rowNumber}: ${field} may contain only letters, numbers, and hyphens.`,
    );
    return '';
  }

  return padNumeric && /^\d+$/.test(normalized)
    ? normalized.padStart(2, '0')
    : normalized;
}

function nextAvailableNumberedCode(existingCodes: Set<string>, prefix: string) {
  const matcher = new RegExp(`^${prefix}-(\\d+)$`);
  const usedNumbers = new Set(
    Array.from(existingCodes)
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

function rowLabel(row: WorkbookRow) {
  return `row ${row.rowNumber}`;
}

function readZipText(zip: AdmZip, entryName: string): string {
  const entry = zip.getEntry(entryName);

  if (!entry) {
    return '';
  }

  return entry.getData().toString('utf8');
}

function getWorkbookSheetFiles(
  workbookXml: string,
  workbookRelsXml: string,
): Map<string, string> {
  const relTargets = new Map<string, string>();

  for (const match of workbookRelsXml.matchAll(/<Relationship\b[^>]*\/>/g)) {
    const attributes = parseXmlAttributes(match[0]);
    if (attributes.Id && attributes.Target) {
      relTargets.set(attributes.Id, normalizeWorkbookTarget(attributes.Target));
    }
  }

  const sheetFiles = new Map<string, string>();

  for (const match of workbookXml.matchAll(/<(?:\w+:)?sheet\b[^>]*\/>/g)) {
    const attributes = parseXmlAttributes(match[0]);
    const relId = attributes['r:id'];
    const target = relId ? relTargets.get(relId) : undefined;
    if (attributes.name && target) {
      sheetFiles.set(decodeXml(attributes.name), target);
    }
  }

  return sheetFiles;
}

function parseSharedStrings(sharedStringsXml: string): string[] {
  if (!sharedStringsXml) {
    return [];
  }

  return Array.from(
    sharedStringsXml.matchAll(/<(?:\w+:)?si\b[^>]*>([\s\S]*?)<\/(?:\w+:)?si>/g),
  ).map((match) => {
    const textParts = Array.from(
      match[1].matchAll(/<(?:\w+:)?t\b[^>]*>([\s\S]*?)<\/(?:\w+:)?t>/g),
    ).map((textMatch) => decodeXml(textMatch[1]));

    return textParts.join('');
  });
}

function readWorksheetRows(
  worksheetXml: string,
  sharedStrings: string[],
): WorkbookRow[] {
  const rawRows: Array<{ rowNumber: number; cells: CellValue[] }> = [];

  for (const rowMatch of worksheetXml.matchAll(
    /<(?:\w+:)?row\b([^>]*)>([\s\S]*?)<\/(?:\w+:)?row>/g,
  )) {
    const rowAttributes = parseXmlAttributes(rowMatch[1]);
    const rowNumber = Number(rowAttributes.r) || rawRows.length + 1;
    const cells: CellValue[] = [];

    for (const cellMatch of rowMatch[2].matchAll(
      /<(?:\w+:)?c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?c>)/g,
    )) {
      const cellAttributes = parseXmlAttributes(cellMatch[1]);
      const columnIndex = cellRefToColumnIndex(cellAttributes.r ?? '');
      if (columnIndex === -1) {
        continue;
      }

      cells[columnIndex] = parseCellValue(
        cellAttributes,
        cellMatch[2] ?? '',
        sharedStrings,
      );
    }

    if (
      cells.some((cell) => cell !== undefined && cell !== null && cell !== '')
    ) {
      rawRows.push({ rowNumber, cells });
    }
  }

  if (rawRows.length === 0) {
    return [];
  }

  const [headerRow, ...dataRows] = rawRows;
  const headers = headerRow.cells.map((cell) => optionalText(cell) ?? '');

  return dataRows
    .map((row) => {
      const values: Record<string, CellValue> = {};

      headers.forEach((header, index) => {
        if (header) {
          values[header] = row.cells[index] ?? null;
        }
      });

      return {
        rowNumber: row.rowNumber,
        values,
      };
    })
    .filter((row) =>
      Object.values(row.values).some(
        (value) => value !== undefined && value !== null && value !== '',
      ),
    );
}

function parseCellValue(
  attributes: Record<string, string>,
  cellXml: string,
  sharedStrings: string[],
): CellValue {
  const type = attributes.t;
  const valueMatch = cellXml.match(/<(?:\w+:)?v>([\s\S]*?)<\/(?:\w+:)?v>/);
  const rawValue = valueMatch ? decodeXml(valueMatch[1]) : '';

  if (type === 's') {
    return sharedStrings[Number(rawValue)] ?? null;
  }

  if (type === 'b') {
    return rawValue === '1';
  }

  if (type === 'inlineStr') {
    const inlineMatch = cellXml.match(
      /<(?:\w+:)?t\b[^>]*>([\s\S]*?)<\/(?:\w+:)?t>/,
    );
    return inlineMatch ? decodeXml(inlineMatch[1]) : null;
  }

  if (rawValue === '') {
    return null;
  }

  const numericValue = Number(rawValue);
  return Number.isNaN(numericValue) ? rawValue : numericValue;
}

function parseXmlAttributes(source: string): Record<string, string> {
  const attributes: Record<string, string> = {};

  for (const match of source.matchAll(/([\w:]+)="([^"]*)"/g)) {
    attributes[match[1]] = decodeXml(match[2]);
  }

  return attributes;
}

function normalizeWorkbookTarget(target: string) {
  const normalizedTarget = target.replace(/^\/+/, '');
  return normalizedTarget.startsWith('xl/')
    ? normalizedTarget
    : path.posix.join('xl', normalizedTarget);
}

function cellRefToColumnIndex(cellRef: string) {
  const letters = cellRef.match(/[A-Z]+/)?.[0];

  if (!letters) {
    return -1;
  }

  return (
    letters.split('').reduce((value, letter) => {
      return value * 26 + letter.charCodeAt(0) - 64;
    }, 0) - 1
  );
}

function decodeXml(value: string) {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}
