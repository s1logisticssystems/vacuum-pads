import {
  DEFAULT_MASTER_DATA_WORKBOOK_PATH,
  MasterDataImportService,
  MasterDataWorkbookRows,
  readMasterDataWorkbook,
} from './master-data-import.service';

type ServicePrisma = ConstructorParameters<typeof MasterDataImportService>[0];
type PrismaMock = ServicePrisma & {
  vacuumPad: { findMany: jest.Mock; upsert: jest.Mock };
  machine: { findMany: jest.Mock; upsert: jest.Mock };
  rackLocation: { findMany: jest.Mock; upsert: jest.Mock };
  faultCatalog: { findMany: jest.Mock; upsert: jest.Mock };
  $transaction: jest.Mock;
};

describe('MasterDataImportService', () => {
  it('reads the master data workbook sheets', () => {
    const workbookRows = readMasterDataWorkbook(
      DEFAULT_MASTER_DATA_WORKBOOK_PATH,
    );

    expect(workbookRows.VacuumPads.length).toBeGreaterThan(0);
    expect(workbookRows.Machines.length).toBeGreaterThan(0);
    expect(workbookRows.RackLocations.length).toBeGreaterThan(0);
    expect(workbookRows.FaultCatalog.length).toBeGreaterThan(0);
    expect(String(workbookRows.VacuumPads[0].values.code ?? '')).not.toBe('');
    expect(
      String(workbookRows.VacuumPads[0].values.serialNumber ?? ''),
    ).not.toBe('');
    expect(String(workbookRows.Machines[0].values.code ?? '')).not.toBe('');
    expect(String(workbookRows.RackLocations[0].values.code ?? '')).not.toBe(
      '',
    );
    expect(String(workbookRows.FaultCatalog[0].values.code ?? '')).not.toBe('');
  });

  it('plans dry-run creates and updates without writing', async () => {
    const prisma = createPrismaMock({
      vacuums: [{ code: 'VP-001', serialNumber: '19081291644' }],
      machines: [{ code: 'MACH-001' }],
      racks: [{ code: 'RACK-A-01-01' }],
      faults: [],
    });
    const service = new MasterDataImportService(prisma);

    const result = await service.importWorkbookRows(createValidWorkbookRows(), {
      workbookPath: 'test.xlsx',
      dryRun: true,
    });

    expect(result.ok).toBe(true);
    expect(result.entities.VacuumPads).toEqual({
      rowsRead: 2,
      creates: 1,
      updates: 1,
      unchanged: 0,
      incomplete: 0,
    });
    expect(result.entities.Machines).toEqual({
      rowsRead: 2,
      creates: 1,
      updates: 1,
      unchanged: 0,
      incomplete: 0,
    });
    expect(result.entities.RackLocations).toEqual({
      rowsRead: 2,
      creates: 1,
      updates: 1,
      unchanged: 0,
      incomplete: 0,
    });
    expect(result.entities.FaultCatalog).toEqual({
      rowsRead: 2,
      creates: 2,
      updates: 0,
      unchanged: 0,
      incomplete: 0,
    });
    expect(result.warnings).toEqual([]);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('reports duplicate and invalid workbook values before querying the database', async () => {
    const prisma = createPrismaMock();
    const service = new MasterDataImportService(prisma);

    const result = await service.importWorkbookRows(
      {
        VacuumPads: [
          workbookRow(2, {
            code: 'VP-001',
            serialNumber: 'SN-1',
            operationalStatus: 'BAD_STATUS',
          }),
          workbookRow(3, { code: 'VP-001', serialNumber: 'SN-1' }),
        ],
        Machines: [
          workbookRow(2, {
            code: 'MACH-001',
            name: 'Machine',
            status: 'BROKEN',
          }),
        ],
        RackLocations: [workbookRow(2, { code: 'RACK-001', type: 'BAD_TYPE' })],
        FaultCatalog: [
          workbookRow(2, {
            code: 'FC-001',
            label: 'Fault',
            severity: 'BAD_SEVERITY',
          }),
        ],
      },
      { workbookPath: 'bad.xlsx', dryRun: true },
    );

    expect(result.ok).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining('invalid operationalStatus BAD_STATUS'),
        expect.stringContaining('duplicate code VP-001'),
        expect.stringContaining('duplicate serialNumber SN-1'),
        expect.stringContaining('invalid status BROKEN'),
        expect.stringContaining('invalid type BAD_TYPE'),
        expect.stringContaining('invalid severity BAD_SEVERITY'),
      ]),
    );
    expect(prisma.vacuumPad.findMany).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('upserts all supported entities in normal mode', async () => {
    const prisma = createPrismaMock();
    const service = new MasterDataImportService(prisma);

    const result = await service.importWorkbookRows(createValidWorkbookRows(), {
      workbookPath: 'test.xlsx',
      dryRun: false,
    });

    expect(result.ok).toBe(true);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);

    const machineCall = findUpsertCall(prisma.machine.upsert, 'MACH-001');
    expect(machineCall.create).toMatchObject({
      code: 'MACH-001',
      qrCode: 'QR-MACH-001',
      area: 'Production',
      project: 'Line A',
    });

    const rackCall = findUpsertCall(prisma.rackLocation.upsert, 'RACK-A-01-01');
    expect(rackCall.create).toMatchObject({
      code: 'RACK-A-01-01',
      qrCode: 'QR-RACK-A-01-01',
      zone: 'A',
      rack: 'A-01',
      slot: '01',
      label: 'Rack A-01 Slot 01',
    });

    const vacuumCall = findUpsertCall(prisma.vacuumPad.upsert, 'VP-002');
    expect(vacuumCall.create).toMatchObject({
      code: 'VP-002',
      qrCode: 'SN-1',
      serialNumber: 'SN-1',
      netWeightKg: 13.5,
      dimensionLengthMm: 150,
      dimensionWidthMm: 75,
      dimensionHeightMm: 20,
      liftingCapacityKg: 220,
      costEuro: 99.95,
      receivedAt: new Date('2026-06-02T00:00:00.000Z'),
    });

    const faultCall = findUpsertCall(prisma.faultCatalog.upsert, 'FC-001');
    expect(faultCall.create).toMatchObject({
      code: 'FC-001',
      label: 'Surface damage',
      severity: 'NORMAL',
      sortOrder: 1,
    });
  });

  it('imports missing-serial vacuum pads as incomplete non-operational records', async () => {
    const prisma = createPrismaMock();
    const service = new MasterDataImportService(prisma);
    const workbookRows = createValidWorkbookRows();
    workbookRows.VacuumPads = [
      workbookRow(2, {
        code: 'VP-009',
        serialNumber: '',
        description: 'Incomplete production vacuum',
      }),
    ];

    const result = await service.importWorkbookRows(workbookRows, {
      workbookPath: 'incomplete.xlsx',
      dryRun: false,
    });

    expect(result.ok).toBe(true);
    expect(result.entities.VacuumPads).toEqual({
      rowsRead: 1,
      creates: 1,
      updates: 0,
      unchanged: 0,
      incomplete: 1,
    });
    expect(result.warnings).toContain(
      'VacuumPads row 2: missing serialNumber; importing as incomplete/non-operational master data.',
    );

    const vacuumCall = findUpsertCall(prisma.vacuumPad.upsert, 'VP-009');
    expect(vacuumCall.create).toMatchObject({
      code: 'VP-009',
      qrCode: 'INCOMPLETE-VP-009',
      serialNumber: null,
      operationalStatus: 'OUT_OF_SERVICE',
      locationStatus: 'UNKNOWN',
    });
  });

  it('updates an existing vacuum by serialNumber even when workbook code differs', async () => {
    const prisma = createPrismaMock({
      vacuums: [
        {
          code: 'VP-001',
          qrCode: 'SN-1',
          serialNumber: 'SN-1',
          description: 'Old description',
        },
      ],
    });
    const service = new MasterDataImportService(prisma);
    const workbookRows = createValidWorkbookRows();
    workbookRows.VacuumPads = [
      workbookRow(2, {
        code: 'VP-999',
        serialNumber: 'SN-1',
        description: 'Updated by serial',
      }),
    ];
    workbookRows.Machines = [];
    workbookRows.RackLocations = [];
    workbookRows.FaultCatalog = [];

    const result = await service.importWorkbookRows(workbookRows, {
      workbookPath: 'serial-update.xlsx',
      dryRun: false,
    });

    expect(result.ok).toBe(true);
    expect(result.warnings).toContain(
      'VacuumPads row 2: serialNumber SN-1 already exists as VP-001; using that code and updating the rest of the fields.',
    );
    const vacuumCall = findUpsertCall(prisma.vacuumPad.upsert, 'VP-001');
    expect(vacuumCall.update).toMatchObject({
      description: 'Updated by serial',
      serialNumber: 'SN-1',
      qrCode: 'SN-1',
    });
  });

  it('generates missing Machine, RackLocation, and FaultCatalog codes during import', async () => {
    const prisma = createPrismaMock({
      machines: [{ code: 'MACH-001' }],
      faults: [{ code: 'FC-001' }],
    });
    const service = new MasterDataImportService(prisma);

    const result = await service.importWorkbookRows(
      {
        VacuumPads: [],
        Machines: [workbookRow(2, { name: 'Generated machine' })],
        RackLocations: [
          workbookRow(2, {
            type: 'AVL',
            area: 'A',
            row: '1',
            position: '8',
          }),
        ],
        FaultCatalog: [workbookRow(2, { label: 'Generated fault' })],
      },
      { workbookPath: 'generated.xlsx', dryRun: false },
    );

    expect(result.ok).toBe(true);
    expect(
      findUpsertCall(prisma.machine.upsert, 'MACH-002').create,
    ).toMatchObject({
      code: 'MACH-002',
      name: 'Generated machine',
      qrCode: 'QR-MACH-002',
    });
    expect(
      findUpsertCall(prisma.rackLocation.upsert, 'RACK-A-01-08').create,
    ).toMatchObject({
      code: 'RACK-A-01-08',
      qrCode: 'QR-RACK-A-01-08',
    });
    expect(
      findUpsertCall(prisma.faultCatalog.upsert, 'FC-002').create,
    ).toMatchObject({
      code: 'FC-002',
      label: 'Generated fault',
    });
  });

  it('counts unchanged rows and skips writing them', async () => {
    const prisma = createPrismaMock({
      vacuums: [
        {
          code: 'VP-001',
          qrCode: '19081291644',
          serialNumber: '19081291644',
          description: 'Existing pad',
          dimensions: '100x50',
          type: 'Standard',
          netWeightKg: 12.5,
          dimensionLengthMm: 100,
          dimensionWidthMm: 50,
          dimensionHeightMm: 10,
          liftingCapacityKg: 200,
          costEuro: 88.5,
          receivedAt: new Date('2026-06-01T00:00:00.000Z'),
          operationalStatus: 'FUNCTIONAL',
          locationStatus: 'IN_RACK',
          deletedAt: null,
          currentRackLocation: { code: 'RACK-A-01-01' },
          currentMachine: null,
        },
      ],
      machines: [
        {
          code: 'MACH-001',
          qrCode: 'QR-MACH-001',
          name: 'Vacuum Machine 1',
          status: 'ACTIVE',
          description: null,
          area: 'Production',
          project: 'Line A',
          deletedAt: null,
        },
      ],
      racks: [
        {
          code: 'RACK-A-01-01',
          qrCode: 'QR-RACK-A-01-01',
          type: 'AVL',
          zone: 'A',
          rack: 'A-01',
          level: '1',
          slot: '01',
          label: 'Rack A-01 Slot 01',
          capacity: 1,
          isActive: true,
          deletedAt: null,
        },
      ],
      faults: [
        {
          code: 'FC-001',
          label: 'Surface damage',
          description: 'Visible damage',
          severity: 'NORMAL',
          sortOrder: 1,
          isActive: true,
          deletedAt: null,
        },
      ],
    });
    const service = new MasterDataImportService(prisma);

    const result = await service.importWorkbookRows(
      {
        VacuumPads: [createValidWorkbookRows().VacuumPads[0]],
        Machines: [createValidWorkbookRows().Machines[0]],
        RackLocations: [createValidWorkbookRows().RackLocations[0]],
        FaultCatalog: [createValidWorkbookRows().FaultCatalog[0]],
      },
      { workbookPath: 'unchanged.xlsx', dryRun: false },
    );

    expect(result.ok).toBe(true);
    expect(result.entities.VacuumPads).toEqual({
      rowsRead: 1,
      creates: 0,
      updates: 0,
      unchanged: 1,
      incomplete: 0,
    });
    expect(result.entities.Machines).toEqual({
      rowsRead: 1,
      creates: 0,
      updates: 0,
      unchanged: 1,
      incomplete: 0,
    });
    expect(result.entities.RackLocations).toEqual({
      rowsRead: 1,
      creates: 0,
      updates: 0,
      unchanged: 1,
      incomplete: 0,
    });
    expect(result.entities.FaultCatalog).toEqual({
      rowsRead: 1,
      creates: 0,
      updates: 0,
      unchanged: 1,
      incomplete: 0,
    });
    expect(prisma.vacuumPad.upsert).not.toHaveBeenCalled();
    expect(prisma.machine.upsert).not.toHaveBeenCalled();
    expect(prisma.rackLocation.upsert).not.toHaveBeenCalled();
    expect(prisma.faultCatalog.upsert).not.toHaveBeenCalled();
  });
});

function createValidWorkbookRows(): MasterDataWorkbookRows {
  return {
    VacuumPads: [
      workbookRow(2, {
        code: 'VP-001',
        serialNumber: '19081291644',
        description: 'Existing pad',
        operationalStatus: 'FUNCTIONAL',
        locationStatus: 'IN_RACK',
        currentRackCode: 'RACK-A-01-01',
        notes: 'type=Standard; dimensions=100x50',
        netWeightKg: 12.5,
        dimensionLengthMm: 100,
        dimensionWidthMm: 50,
        dimensionHeightMm: 10,
        liftingCapacityKg: 200,
        costEuro: 88.5,
        receivedAt: '2026-06-01',
      }),
      workbookRow(3, {
        code: 'VP-002',
        serialNumber: 'SN-1',
        description: 'New pad',
        operationalStatus: 'FUNCTIONAL',
        locationStatus: 'IN_RACK',
        currentRackCode: 'RACK-A-01-02',
        notes: 'type=Large; dimensions=150x75',
        netWeightKg: 13.5,
        dimensionLengthMm: 150,
        dimensionWidthMm: 75,
        dimensionHeightMm: 20,
        liftingCapacityKg: 220,
        costEuro: 99.95,
        receivedAt: '2026-06-02',
      }),
    ],
    Machines: [
      workbookRow(2, {
        code: 'MACH-001',
        name: 'Vacuum Machine 1',
        status: 'ACTIVE',
        notes: 'area=Production; project=Line A',
      }),
      workbookRow(3, {
        code: 'MACH-002',
        name: 'Vacuum Machine 2',
        status: 'ACTIVE',
        notes: 'area=Production; project=Line B',
      }),
    ],
    RackLocations: [
      workbookRow(2, {
        code: 'RACK-A-01-01',
        type: 'AVL',
        area: 'A',
        row: 'A-01',
        position: '01',
        isActive: true,
        notes: 'label=Rack A-01 Slot 01; level=1; capacity=1',
      }),
      workbookRow(3, {
        code: 'RACK-A-01-02',
        type: 'AVL',
        area: 'A',
        row: 'A-01',
        position: '02',
        isActive: true,
        notes: 'label=Rack A-01 Slot 02; level=1; capacity=1',
      }),
    ],
    FaultCatalog: [
      workbookRow(2, {
        code: 'FC-001',
        label: 'Surface damage',
        description: 'Visible damage',
        severity: 'NORMAL',
        sortOrder: 1,
        isActive: true,
      }),
      workbookRow(3, {
        code: 'FC-002',
        label: 'Vacuum leak',
        description: 'Loss of vacuum pressure',
        severity: 'HIGH',
        sortOrder: 2,
        isActive: true,
      }),
    ],
  };
}

function workbookRow(
  rowNumber: number,
  values: MasterDataWorkbookRows['VacuumPads'][number]['values'],
) {
  return { rowNumber, values };
}

function createPrismaMock(
  existing: {
    vacuums?: Array<Record<string, unknown> & { code: string }>;
    machines?: Array<Record<string, unknown> & { code: string }>;
    racks?: Array<Record<string, unknown> & { code: string }>;
    faults?: Array<Record<string, unknown> & { code: string }>;
  } = {},
): PrismaMock {
  const prisma = {
    vacuumPad: {
      findMany: jest.fn().mockResolvedValue(existing.vacuums ?? []),
      upsert: jest.fn().mockResolvedValue({}),
    },
    machine: {
      findMany: jest.fn().mockResolvedValue(existing.machines ?? []),
      upsert: jest.fn().mockResolvedValue({}),
    },
    rackLocation: {
      findMany: jest.fn().mockResolvedValue(existing.racks ?? []),
      upsert: jest.fn().mockResolvedValue({}),
    },
    faultCatalog: {
      findMany: jest.fn().mockResolvedValue(existing.faults ?? []),
      upsert: jest.fn().mockResolvedValue({}),
    },
    $transaction: jest.fn(async (callback: (tx: unknown) => Promise<unknown>) =>
      callback(prisma),
    ),
  } as unknown as PrismaMock;

  return prisma;
}

interface UpsertCall {
  where: { code?: string };
  update: Record<string, unknown>;
  create: Record<string, unknown>;
}

function findUpsertCall(mock: jest.Mock, code: string): UpsertCall {
  const calls = mock.mock.calls as unknown[][];

  for (const call of calls) {
    const candidate = call[0] as UpsertCall | undefined;

    if (candidate?.where.code === code) {
      return candidate;
    }
  }

  throw new Error(`Expected upsert call for ${code}`);
}
