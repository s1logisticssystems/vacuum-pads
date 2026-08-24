import {
  LocationStatus,
  MachineStatus,
  OperationalStatus,
  PrismaClient,
  RackLocationType,
  UserRole,
} from '@prisma/client';
import {
  deriveMachineQrCode,
  deriveRackQrCode,
  deriveVacuumQrCode,
} from './seed-helpers';

const prisma = new PrismaClient();

const users = [
  {
    username: 'admin',
    email: 'admin@example.local',
    displayName: 'System Admin',
    role: UserRole.ADMIN,
  },
  {
    username: 'operator1',
    email: 'operator1@example.local',
    displayName: 'Operator One',
    role: UserRole.OPERATOR,
  },
  {
    username: 'technician1',
    email: 'technician1@example.local',
    displayName: 'Technician One',
    role: UserRole.TECHNICIAN,
  },
  {
    username: 'supervisor1',
    email: 'supervisor1@example.local',
    displayName: 'Supervisor One',
    role: UserRole.SUPERVISOR,
  },
] as const;

const machines = [
  {
    code: 'MACH-001',
    name: 'Vacuum Machine 1',
    area: 'Production',
    project: 'Line A',
    status: MachineStatus.ACTIVE,
    responsibleOperatorUsername: 'operator1',
  },
  {
    code: 'MACH-002',
    name: 'Vacuum Machine 2',
    area: 'Production',
    project: 'Line B',
    status: MachineStatus.ACTIVE,
    responsibleOperatorUsername: 'operator1',
  },
  {
    code: 'MACH-003',
    name: 'Maintenance Test Rig',
    area: 'Maintenance',
    project: 'Workshop',
    status: MachineStatus.MAINTENANCE,
    responsibleOperatorUsername: null,
  },
] as const;

const avlRackLocations = Array.from({ length: 8 }, (_, index) => {
  const slot = String(index + 1).padStart(2, '0');

  return {
    code: `RACK-A-01-${slot}`,
    type: RackLocationType.AVL,
    zone: 'A',
    rack: 'A-01',
    level: '1',
    slot,
    label: `Rack A-01 Slot ${slot}`,
    capacity: 1,
    isActive: true,
  };
});

const repRackLocations = [
  {
    code: 'RACK-REP-01',
    type: RackLocationType.REP,
    zone: 'REP',
    rack: 'REP-01',
    level: '1',
    slot: '01',
    label: 'Repair Rack 01',
    capacity: 1,
    isActive: true,
  },
  {
    code: 'RACK-REP-02',
    type: RackLocationType.REP,
    zone: 'REP',
    rack: 'REP-01',
    level: '1',
    slot: '02',
    label: 'Repair Rack 02',
    capacity: 1,
    isActive: true,
  },
] as const;

const rackLocations = [...avlRackLocations, ...repRackLocations] as const;

const vacuumPads = [
  {
    code: 'VP-001',
    serialNumber: '19081291644',
    description: 'Suction pad type G56-535-1500',
    type: 'Standard',
    dimensions: '100x50',
    operationalStatus: OperationalStatus.FUNCTIONAL,
    locationStatus: LocationStatus.IN_RACK,
    rackCode: 'RACK-A-01-01',
  },
  {
    code: 'VP-002',
    serialNumber: '19081291645',
    description: 'Suction pad type G56-535-1500',
    type: 'Standard',
    dimensions: '100x50',
    operationalStatus: OperationalStatus.FUNCTIONAL,
    locationStatus: LocationStatus.IN_RACK,
    rackCode: 'RACK-A-01-02',
  },
  {
    code: 'VP-003',
    serialNumber: '19081291646',
    description: 'Suction pad type G56-535-1500',
    type: 'Large',
    dimensions: '150x75',
    operationalStatus: OperationalStatus.FUNCTIONAL,
    locationStatus: LocationStatus.IN_RACK,
    rackCode: 'RACK-A-01-03',
  },
  {
    code: 'VP-004',
    serialNumber: '19081291647',
    description: 'Suction pad type G56-535-1500',
    type: 'Large',
    dimensions: '150x75',
    operationalStatus: OperationalStatus.INSPECTION_REQUIRED,
    locationStatus: LocationStatus.IN_RACK,
    rackCode: 'RACK-A-01-04',
  },
  {
    code: 'VP-005',
    serialNumber: '19081291648',
    description: 'Suction pad type G56-535-1500',
    type: 'Small',
    dimensions: '80x40',
    operationalStatus: OperationalStatus.FUNCTIONAL,
    locationStatus: LocationStatus.IN_RACK,
    rackCode: 'RACK-A-01-05',
  },
  {
    code: 'VP-006',
    serialNumber: '19081291649',
    description: 'Suction pad type K48/46-565-1280',
    type: 'Standard',
    dimensions: '100x50',
    operationalStatus: OperationalStatus.OUT_OF_SERVICE,
    locationStatus: LocationStatus.IN_RACK,
    rackCode: 'RACK-A-01-06',
  },
] as const;

const faultCatalogEntries = [
  {
    code: 'FC-001',
    label: 'Surface damage',
    description: 'Visible wear or damage on the vacuum pad surface.',
    sortOrder: 1,
  },
  {
    code: 'FC-002',
    label: 'Vacuum leak',
    description: 'Loss of vacuum pressure or sealing failure.',
    sortOrder: 2,
  },
  {
    code: 'FC-003',
    label: 'Connector issue',
    description: 'Mechanical or connection problem on the vacuum interface.',
    sortOrder: 3,
  },
  {
    code: 'FC-004',
    label: 'Other',
    description: 'Unclassified issue requiring manual details.',
    sortOrder: 4,
  },
] as const;

async function seedUsers() {
  for (const user of users) {
    await prisma.user.upsert({
      where: { username: user.username },
      update: {
        email: user.email,
        displayName: user.displayName,
        role: user.role,
        isActive: true,
        deletedAt: null,
      },
      create: {
        username: user.username,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
        isActive: true,
      },
    });
  }
}

async function seedMachines() {
  for (const machine of machines) {
    const qrCode = deriveMachineQrCode(machine.code);
    const relationUpdate = machine.responsibleOperatorUsername
      ? {
          responsibleOperator: {
            connect: { username: machine.responsibleOperatorUsername },
          },
        }
      : {
          responsibleOperator: {
            disconnect: true,
          },
        };

    const relationCreate = machine.responsibleOperatorUsername
      ? {
          responsibleOperator: {
            connect: { username: machine.responsibleOperatorUsername },
          },
        }
      : {};

    await prisma.machine.upsert({
      where: { code: machine.code },
      update: {
        qrCode,
        name: machine.name,
        area: machine.area,
        project: machine.project,
        status: machine.status,
        description: null,
        deletedAt: null,
        ...relationUpdate,
      },
      create: {
        code: machine.code,
        qrCode,
        name: machine.name,
        area: machine.area,
        project: machine.project,
        status: machine.status,
        ...relationCreate,
      },
    });
  }
}

async function seedRackLocations() {
  for (const location of rackLocations) {
    const qrCode = deriveRackQrCode(location.code);
    await prisma.rackLocation.upsert({
      where: { code: location.code },
      update: {
        qrCode,
        type: location.type,
        zone: location.zone,
        rack: location.rack,
        level: location.level,
        slot: location.slot,
        label: location.label,
        capacity: location.capacity,
        isActive: location.isActive,
        deletedAt: null,
      },
      create: {
        code: location.code,
        qrCode,
        type: location.type,
        zone: location.zone,
        rack: location.rack,
        level: location.level,
        slot: location.slot,
        label: location.label,
        capacity: location.capacity,
        isActive: location.isActive,
      },
    });
  }
}

async function seedVacuumPads() {
  for (const pad of vacuumPads) {
    const qrCode = deriveVacuumQrCode(pad.serialNumber);
    await prisma.vacuumPad.upsert({
      where: { code: pad.code },
      update: {
        qrCode,
        serialNumber: pad.serialNumber,
        type: pad.type,
        dimensions: pad.dimensions,
        locationStatus: pad.locationStatus,
        operationalStatus: pad.operationalStatus,
        description: pad.description,
        deletedAt: null,
        lastRepairAt: null,
        currentRackLocation: {
          connect: { code: pad.rackCode },
        },
        currentMachine: {
          disconnect: true,
        },
      },
      create: {
        code: pad.code,
        qrCode,
        serialNumber: pad.serialNumber,
        description: pad.description,
        type: pad.type,
        dimensions: pad.dimensions,
        locationStatus: pad.locationStatus,
        operationalStatus: pad.operationalStatus,
        currentRackLocation: {
          connect: { code: pad.rackCode },
        },
      },
    });
  }
}

async function seedFaultCatalog() {
  for (const entry of faultCatalogEntries) {
    await prisma.faultCatalog.upsert({
      where: { code: entry.code },
      update: {
        label: entry.label,
        description: entry.description,
        isActive: true,
        sortOrder: entry.sortOrder,
        deletedAt: null,
      },
      create: {
        code: entry.code,
        label: entry.label,
        description: entry.description,
        isActive: true,
        sortOrder: entry.sortOrder,
      },
    });
  }
}

async function main() {
  await seedUsers();
  await seedMachines();
  await seedRackLocations();
  await seedVacuumPads();
  await seedFaultCatalog();

  const [
    userCount,
    machineCount,
    rackLocationCount,
    vacuumPadCount,
    faultCatalogCount,
    chargeSessionCount,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.machine.count(),
    prisma.rackLocation.count(),
    prisma.vacuumPad.count(),
    prisma.faultCatalog.count(),
    prisma.chargeSession.count(),
  ]);

  console.info(
    `Seed complete: users=${userCount}, machines=${machineCount}, rackLocations=${rackLocationCount}, vacuumPads=${vacuumPadCount}, faultCatalog=${faultCatalogCount}, chargeSessions=${chargeSessionCount}`,
  );
}

main()
  .catch((error) => {
    console.error('Seed failed.');
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
