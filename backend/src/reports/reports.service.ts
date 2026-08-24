import { BadRequestException, Injectable } from '@nestjs/common';
import {
  LocationStatus,
  OperationalStatus,
  Prisma,
  RepairStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  FaultyVacuumPadReportRow,
  FaultyVacuumPadsQuery,
  FaultyVacuumPadsReportResponse,
  MachineFaultReportQuery,
  MachineFaultReportResponse,
  MachineFaultReportRow,
  MostFrequentFaultReportRow,
  MostFrequentFaultsQuery,
  MostFrequentFaultsReportResponse,
  MostUsedVacuumPadReportRow,
  MostUsedVacuumPadsQuery,
  MostUsedVacuumPadsReportResponse,
  VacuumPadLocationCategory,
  VacuumPadLocationQuery,
  VacuumPadLocationReportResponse,
  VacuumPadLocationReportRow,
} from './reports.types';

const reportVacuumPadSelect = {
  id: true,
  code: true,
  serialNumber: true,
  locationStatus: true,
  operationalStatus: true,
} satisfies Prisma.VacuumPadSelect;

const reportChargeSessionSelect = {
  id: true,
  vacuumPadId: true,
  machineId: true,
  chargedAt: true,
  dechargedAt: true,
} satisfies Prisma.ChargeSessionSelect;

const reportMachineSelect = {
  id: true,
  code: true,
  name: true,
  status: true,
} satisfies Prisma.MachineSelect;

const reportRackLocationSelect = {
  id: true,
  code: true,
  label: true,
  type: true,
  zone: true,
  rack: true,
  level: true,
  slot: true,
} satisfies Prisma.RackLocationSelect;

const reportRepairSelect = {
  id: true,
  vacuumPadId: true,
  faultCatalogId: true,
  faultOtherText: true,
  status: true,
  outcome: true,
  reportedAt: true,
  completedAt: true,
  faultCatalog: {
    select: {
      id: true,
      code: true,
      label: true,
    },
  },
} satisfies Prisma.RepairSelect;

const reportVacuumLocationSelect = {
  id: true,
  code: true,
  serialNumber: true,
  locationStatus: true,
  operationalStatus: true,
  updatedAt: true,
  currentMachine: {
    select: reportMachineSelect,
  },
  currentRackLocation: {
    select: reportRackLocationSelect,
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
      reportedAt: true,
    },
  },
  movements: {
    orderBy: [{ createdAt: 'desc' as const }],
    take: 1,
    select: {
      id: true,
      createdAt: true,
    },
  },
} satisfies Prisma.VacuumPadSelect;

type ReportVacuumPadRecord = Prisma.VacuumPadGetPayload<{
  select: typeof reportVacuumPadSelect;
}>;

type ReportChargeSessionRecord = Prisma.ChargeSessionGetPayload<{
  select: typeof reportChargeSessionSelect;
}>;

type ReportMachineRecord = Prisma.MachineGetPayload<{
  select: typeof reportMachineSelect;
}>;

type ReportRepairRecord = Prisma.RepairGetPayload<{
  select: typeof reportRepairSelect;
}>;

type ReportVacuumLocationRecord = Prisma.VacuumPadGetPayload<{
  select: typeof reportVacuumLocationSelect;
}>;

type ReportDateWindow = {
  dateFrom: Date | null;
  dateTo: Date | null;
};

type AttributedRepair = {
  repair: ReportRepairRecord;
  machineId: string;
};

type FaultFrequencyAttribution = {
  repair: ReportRepairRecord;
  machineId: string | null;
};

type FaultFrequencyAccumulator = {
  faultCode: string;
  faultLabel: string;
  repairs: FaultFrequencyAttribution[];
};

@Injectable()
export class ReportsService {
  constructor(private readonly prismaService: PrismaService) {}

  async getMostUsedVacuumPads(
    query: MostUsedVacuumPadsQuery = {},
  ): Promise<MostUsedVacuumPadsReportResponse> {
    const generatedAt = new Date();
    const window = parseReportDateWindow(query);
    const pads = await this.prismaService.vacuumPad.findMany({
      where: buildVacuumWhere(query.vacuum),
      orderBy: [{ code: 'asc' }],
      select: reportVacuumPadSelect,
    });

    if (pads.length === 0) {
      return {
        items: [],
        total: 0,
        generatedAt: generatedAt.toISOString(),
        policy: mostUsedPolicy,
      };
    }

    const sessions = await this.prismaService.chargeSession.findMany({
      where: {
        vacuumPadId: {
          in: pads.map((pad) => pad.id),
        },
      },
      orderBy: [{ chargedAt: 'asc' }, { createdAt: 'asc' }],
      select: reportChargeSessionSelect,
    });
    const sessionsByVacuum = groupSessionsByVacuum(sessions);
    const rows = pads
      .map((pad) =>
        buildMostUsedRow(
          pad,
          sessionsByVacuum.get(pad.id) ?? [],
          window,
          generatedAt,
        ),
      )
      .sort(compareMostUsedRows)
      .map((row, index) => ({ ...row, rank: index + 1 }));

    return {
      items: rows,
      total: rows.length,
      generatedAt: generatedAt.toISOString(),
      policy: mostUsedPolicy,
    };
  }

  async getFaultyVacuumPads(
    query: FaultyVacuumPadsQuery = {},
  ): Promise<FaultyVacuumPadsReportResponse> {
    const generatedAt = new Date();
    const window = parseReportDateWindow(query);
    const pads = await this.prismaService.vacuumPad.findMany({
      where: buildVacuumWhere(query.vacuum),
      orderBy: [{ code: 'asc' }],
      select: reportVacuumPadSelect,
    });

    if (pads.length === 0) {
      return {
        items: [],
        total: 0,
        generatedAt: generatedAt.toISOString(),
        chart: {
          monthlyTrend: [],
          totals: {
            totalFaults: 0,
            totalRepairHours: 0,
            totalDowntimeHours: 0,
            openRepairCount: 0,
          },
        },
        policy: faultyVacuumPadsPolicy,
      };
    }

    const repairs = await this.prismaService.repair.findMany({
      where: {
        vacuumPadId: {
          in: pads.map((pad) => pad.id),
        },
        ...buildReportedAtWhere(window),
      },
      orderBy: [{ reportedAt: 'asc' }, { createdAt: 'asc' }],
      select: reportRepairSelect,
    });
    const filteredRepairs = filterRepairsByFault(repairs, query.fault);
    const repairsByVacuum = groupRepairsByVacuum(filteredRepairs);
    const rows = pads
      .map((pad) =>
        buildFaultyVacuumPadRow(
          pad,
          repairsByVacuum.get(pad.id) ?? [],
          window,
          generatedAt,
        ),
      )
      .sort(compareFaultyVacuumRows)
      .map((row, index) => ({ ...row, rank: index + 1 }));

    return {
      items: rows,
      total: rows.length,
      generatedAt: generatedAt.toISOString(),
      chart: {
        monthlyTrend: buildMonthlyFaultTrend(filteredRepairs),
        totals: {
          totalFaults: rows.reduce((sum, row) => sum + row.totalFaults, 0),
          totalRepairHours: roundHours(
            rows.reduce((sum, row) => sum + row.repairHours, 0),
          ),
          totalDowntimeHours: roundHours(
            rows.reduce((sum, row) => sum + row.faultDowntimeHours, 0),
          ),
          openRepairCount: rows.reduce(
            (sum, row) => sum + row.openRepairCount,
            0,
          ),
        },
      },
      policy: faultyVacuumPadsPolicy,
    };
  }

  async getMachinesCausingMostFaults(
    query: MachineFaultReportQuery = {},
  ): Promise<MachineFaultReportResponse> {
    const generatedAt = new Date();
    const window = parseReportDateWindow(query);
    const machines = await this.prismaService.machine.findMany({
      where: buildMachineWhere(query.machine),
      orderBy: [{ code: 'asc' }],
      select: reportMachineSelect,
    });

    if (machines.length === 0) {
      return {
        items: [],
        total: 0,
        generatedAt: generatedAt.toISOString(),
        note: machineFaultAttributionNote,
        chart: {
          monthlyTrend: [],
          totals: {
            totalFaults: 0,
            totalDowntimeHours: 0,
            unattributedFaults: 0,
          },
        },
        policy: machineFaultPolicy,
      };
    }

    const repairs = await this.prismaService.repair.findMany({
      where: buildReportedAtWhere(window),
      orderBy: [{ reportedAt: 'asc' }, { createdAt: 'asc' }],
      select: reportRepairSelect,
    });
    const filteredRepairs = filterRepairsByFault(repairs, query.fault);
    const relevantVacuumIds = [
      ...new Set(filteredRepairs.map((repair) => repair.vacuumPadId)),
    ];
    const latestReportedAt = filteredRepairs.reduce<Date | null>(
      (latest, repair) =>
        !latest || repair.reportedAt.getTime() > latest.getTime()
          ? repair.reportedAt
          : latest,
      null,
    );
    const sessions =
      relevantVacuumIds.length > 0
        ? await this.prismaService.chargeSession.findMany({
            where: {
              vacuumPadId: {
                in: relevantVacuumIds,
              },
              ...(latestReportedAt
                ? { chargedAt: { lte: latestReportedAt } }
                : {}),
            },
            orderBy: [
              { vacuumPadId: 'asc' },
              { chargedAt: 'asc' },
              { createdAt: 'asc' },
            ],
            select: reportChargeSessionSelect,
          })
        : [];
    const sessionsByVacuum = groupSessionsByVacuum(sessions);
    const selectedMachineIds = new Set(machines.map((machine) => machine.id));
    const attributions: AttributedRepair[] = [];
    let unattributedFaults = 0;

    for (const repair of filteredRepairs) {
      const inferredSession = inferMachineChargeSession(
        repair,
        sessionsByVacuum.get(repair.vacuumPadId) ?? [],
      );

      if (!inferredSession) {
        unattributedFaults += 1;
        continue;
      }

      if (!selectedMachineIds.has(inferredSession.machineId)) {
        continue;
      }

      attributions.push({
        repair,
        machineId: inferredSession.machineId,
      });
    }

    const attributionsByMachine = groupAttributedRepairsByMachine(attributions);
    const rows = machines
      .map((machine) =>
        buildMachineFaultRow(
          machine,
          attributionsByMachine.get(machine.id) ?? [],
          window,
          generatedAt,
        ),
      )
      .sort(compareMachineFaultRows)
      .map((row, index) => ({ ...row, rank: index + 1 }));

    return {
      items: rows,
      total: rows.length,
      generatedAt: generatedAt.toISOString(),
      note: machineFaultAttributionNote,
      chart: {
        monthlyTrend: buildMachineMonthlyFaultTrend(attributions),
        totals: {
          totalFaults: rows.reduce((sum, row) => sum + row.totalFaults, 0),
          totalDowntimeHours: roundHours(
            rows.reduce((sum, row) => sum + row.downtimeHours, 0),
          ),
          unattributedFaults,
        },
      },
      policy: machineFaultPolicy,
    };
  }

  async getMostFrequentFaults(
    query: MostFrequentFaultsQuery = {},
  ): Promise<MostFrequentFaultsReportResponse> {
    const generatedAt = new Date();
    const window = parseReportDateWindow(query);
    const vacuumFilterValues = parseFilterValues(query.vacuum);
    const machineFilterValues = parseFilterValues(query.machine);
    const selectedPads =
      vacuumFilterValues.length > 0
        ? await this.prismaService.vacuumPad.findMany({
            where: buildVacuumWhere(query.vacuum),
            orderBy: [{ code: 'asc' }],
            select: reportVacuumPadSelect,
          })
        : null;

    if (selectedPads && selectedPads.length === 0) {
      return buildEmptyMostFrequentFaultsResponse(generatedAt);
    }

    const repairs = await this.prismaService.repair.findMany({
      where: {
        ...buildReportedAtWhere(window),
        ...(selectedPads
          ? {
              vacuumPadId: {
                in: selectedPads.map((pad) => pad.id),
              },
            }
          : {}),
      },
      orderBy: [{ reportedAt: 'asc' }, { createdAt: 'asc' }],
      select: reportRepairSelect,
    });
    const filteredByFault = filterRepairsByFault(repairs, query.fault);
    const relevantVacuumIds = [
      ...new Set(filteredByFault.map((repair) => repair.vacuumPadId)),
    ];

    if (relevantVacuumIds.length === 0) {
      return buildEmptyMostFrequentFaultsResponse(generatedAt);
    }

    const pads = selectedPads
      ? selectedPads.filter((pad) => relevantVacuumIds.includes(pad.id))
      : await this.prismaService.vacuumPad.findMany({
          where: {
            id: { in: relevantVacuumIds },
            deletedAt: null,
          },
          orderBy: [{ code: 'asc' }],
          select: reportVacuumPadSelect,
        });
    const padById = new Map(pads.map((pad) => [pad.id, pad]));
    const selectedMachines =
      machineFilterValues.length > 0
        ? await this.prismaService.machine.findMany({
            where: buildMachineWhere(query.machine),
            orderBy: [{ code: 'asc' }],
            select: reportMachineSelect,
          })
        : null;

    if (selectedMachines && selectedMachines.length === 0) {
      return buildEmptyMostFrequentFaultsResponse(generatedAt);
    }

    const latestReportedAt = filteredByFault.reduce<Date | null>(
      (latest, repair) =>
        !latest || repair.reportedAt.getTime() > latest.getTime()
          ? repair.reportedAt
          : latest,
      null,
    );
    const sessions = await this.prismaService.chargeSession.findMany({
      where: {
        vacuumPadId: {
          in: relevantVacuumIds,
        },
        ...(latestReportedAt ? { chargedAt: { lte: latestReportedAt } } : {}),
      },
      orderBy: [
        { vacuumPadId: 'asc' },
        { chargedAt: 'asc' },
        { createdAt: 'asc' },
      ],
      select: reportChargeSessionSelect,
    });
    const sessionsByVacuum = groupSessionsByVacuum(sessions);
    const selectedMachineIds = selectedMachines
      ? new Set(selectedMachines.map((machine) => machine.id))
      : null;
    const attributions: FaultFrequencyAttribution[] = [];

    for (const repair of filteredByFault) {
      const inferredSession = inferMachineChargeSession(
        repair,
        sessionsByVacuum.get(repair.vacuumPadId) ?? [],
      );
      const machineId = inferredSession?.machineId ?? null;

      if (
        selectedMachineIds &&
        (!machineId || !selectedMachineIds.has(machineId))
      ) {
        continue;
      }

      attributions.push({ repair, machineId });
    }

    const inferredMachineIds = [
      ...new Set(
        attributions
          .map((attribution) => attribution.machineId)
          .filter((value): value is string => Boolean(value)),
      ),
    ];
    const machines = selectedMachines
      ? selectedMachines
      : inferredMachineIds.length > 0
        ? await this.prismaService.machine.findMany({
            where: {
              id: { in: inferredMachineIds },
              deletedAt: null,
            },
            orderBy: [{ code: 'asc' }],
            select: reportMachineSelect,
          })
        : [];
    const machineById = new Map(
      machines.map((machine) => [machine.id, machine]),
    );
    const groups = groupFaultFrequencyAttributions(attributions);
    const rows = [...groups.values()]
      .map((group) =>
        buildMostFrequentFaultRow(
          group,
          padById,
          machineById,
          window,
          generatedAt,
        ),
      )
      .sort(compareMostFrequentFaultRows)
      .map((row, index) => ({ ...row, rank: index + 1 }));

    return {
      items: rows,
      total: rows.length,
      generatedAt: generatedAt.toISOString(),
      note: machineFaultAttributionNote,
      chart: {
        monthlyTrend: buildFaultFrequencyMonthlyTrend(attributions),
        pareto: buildFaultFrequencyPareto(rows),
        totals: {
          totalOccurrences: rows.reduce(
            (sum, row) => sum + row.totalOccurrences,
            0,
          ),
          totalDowntimeHours: roundHours(
            rows.reduce((sum, row) => sum + row.downtimeHours, 0),
          ),
          totalRepairs: rows.reduce((sum, row) => sum + row.repairs, 0),
          totalReplacements: rows.reduce(
            (sum, row) => sum + row.replacements,
            0,
          ),
          unattributedFaults: rows.reduce(
            (sum, row) => sum + row.unattributedCount,
            0,
          ),
        },
      },
      policy: mostFrequentFaultsPolicy,
    };
  }

  async getVacuumPadLocation(
    query: VacuumPadLocationQuery = {},
  ): Promise<VacuumPadLocationReportResponse> {
    const generatedAt = new Date();
    const pads = await this.prismaService.vacuumPad.findMany({
      where: buildVacuumWhere(query.vacuum),
      orderBy: [{ code: 'asc' }],
      select: reportVacuumLocationSelect,
    });
    const rows = pads
      .map(buildVacuumPadLocationRow)
      .filter((row) => matchesVacuumPadLocationFilters(row, query))
      .sort(compareVacuumLocationRows);

    return {
      items: rows,
      total: rows.length,
      generatedAt: generatedAt.toISOString(),
      summary: buildVacuumLocationSummary(rows),
      chart: {
        locationCategories: buildVacuumLocationCategoryCounts(rows),
      },
      policy: vacuumLocationPolicy,
    };
  }
}

const mostUsedPolicy = {
  usageHours:
    'Closed charge sessions use dechargedAt - chargedAt. Open sessions use now - chargedAt, capped by dateTo when provided.',
  downtimeHours:
    'Downtime counts only closed decharge-to-next-charge gaps that intersect the selected date window. Open downtime without a next charge is excluded.',
  chargeCount:
    'Charge count is the number of charge starts whose chargedAt falls inside the selected date window.',
};

const faultyVacuumPadsPolicy = {
  faultCount:
    'Total faults count Repair records whose reportedAt falls inside the selected date window and match the selected fault filter.',
  distinctFaultTypes:
    'Distinct fault types count catalog fault codes plus one shared OTHER bucket for custom fault text.',
  repairCount: 'Repair count includes completed repairs only.',
  repairHours:
    'Completed repairs use completedAt - reportedAt. Open repairs use now - reportedAt, capped by dateTo when provided.',
  faultDowntimeHours:
    'Fault downtime uses the repair-state duration for this milestone and follows the same policy as repair hours.',
  averageRepairHours:
    'Average repair hours is repairHours divided by total faults, including live duration for open repairs.',
};

const machineFaultAttributionNote =
  'Εκτίμηση βάσει τελευταίας χρέωσης Vacuum Pad πριν τη δήλωση βλάβης.';

const machineFaultPolicy = {
  attribution:
    'Each repair is attributed to the latest charge session for the same Vacuum Pad with chargedAt <= reportedAt. Sessions covering reportedAt are preferred; otherwise the most recent prior charge is used.',
  faultCount:
    'Total faults count attributed Repair records whose reportedAt falls inside the selected date window and match the selected fault filter.',
  distinctFaultTypes:
    'Distinct fault types count catalog fault codes plus one shared OTHER bucket for custom fault text.',
  repairDispatches:
    'Repair dispatches count attributed Repair records that entered the repair process.',
  downtimeHours:
    'Completed repairs use completedAt - reportedAt. Open repairs use now - reportedAt, capped by dateTo when provided.',
  averageFaultsPerVacuum:
    'Average faults per Vacuum Pad is total attributed faults divided by affected Vacuum Pads.',
  customFaults: 'Custom fault text is grouped as OTHER / Άλλο.',
};

const mostFrequentFaultsPolicy = {
  attribution:
    'Machine metrics use the same inferred attribution as the machine fault report: latest charge session for the same Vacuum Pad with chargedAt <= reportedAt, preferring sessions covering reportedAt.',
  faultGrouping:
    'Catalog faults are grouped by FaultCatalog code/label. Custom fault text is grouped into one OTHER / Other bucket.',
  totalOccurrences:
    'Total occurrences count matching Repair records whose reportedAt falls inside the selected date window.',
  distinctMachines:
    'Distinct machines count inferred machines only. Repairs with no inferred machine are tracked as unattributed and do not increase the distinct machine count.',
  repairs: 'Repairs count completed Repair records.',
  replacements:
    'Replacement is not represented by the current RepairOutcome model, so replacements are reported as 0 until an explicit replacement outcome exists.',
  downtimeHours:
    'Completed repairs use completedAt - reportedAt. Open repairs use now - reportedAt, capped by dateTo when provided.',
  averageRestorationHours:
    'Average restoration hours is downtimeHours divided by total occurrences, including live duration for open repairs.',
  pareto:
    'Pareto rows are sorted by total occurrences descending and mark rows up to the 80% cumulative threshold.',
};

const vacuumLocationPolicy = {
  missingSerial:
    'Vacuum Pads without serialNumber are marked as missing serial and are not operational scan candidates.',
  onMachine:
    'ON_MACHINE is selected when the pad has locationStatus ON_MACHINE or a current machine assignment.',
  inRack:
    'IN_RACK is selected when the pad has locationStatus IN_RACK or a current rack assignment and is not currently in repair.',
  inRepair:
    'IN_REPAIR is selected when the pad has locationStatus IN_REPAIR, operationalStatus UNDER_REPAIR, or an open Repair record.',
  unknownLocation:
    'UNKNOWN is used when no current machine, rack, repair, or known location status can identify the current place.',
  outOfService:
    'Out-of-service count is based on operationalStatus OUT_OF_SERVICE.',
};

function buildEmptyMostFrequentFaultsResponse(
  generatedAt: Date,
): MostFrequentFaultsReportResponse {
  return {
    items: [],
    total: 0,
    generatedAt: generatedAt.toISOString(),
    note: machineFaultAttributionNote,
    chart: {
      monthlyTrend: [],
      pareto: [],
      totals: {
        totalOccurrences: 0,
        totalDowntimeHours: 0,
        totalRepairs: 0,
        totalReplacements: 0,
        unattributedFaults: 0,
      },
    },
    policy: mostFrequentFaultsPolicy,
  };
}

function buildVacuumPadLocationRow(
  pad: ReportVacuumLocationRecord,
): VacuumPadLocationReportRow {
  const openRepair = pad.repairs[0] ?? null;
  const category = vacuumLocationCategory(pad, Boolean(openRepair));
  const currentPlace = vacuumCurrentPlace(pad, category);

  return {
    id: pad.id,
    code: pad.code,
    serialNumber: pad.serialNumber,
    locationCategory: category,
    locationCategoryLabel: vacuumLocationCategoryLabel(category),
    currentPlace,
    machineCode: pad.currentMachine?.code ?? null,
    machineName: pad.currentMachine?.name ?? null,
    rackCode: pad.currentRackLocation?.code ?? null,
    rackLabel: pad.currentRackLocation?.label ?? null,
    operationalStatus: pad.operationalStatus,
    locationStatus: pad.locationStatus,
    latestMovementAt: pad.movements[0]?.createdAt.toISOString() ?? null,
    updatedAt: pad.updatedAt.toISOString(),
    openRepairId: openRepair?.id ?? null,
  };
}

function vacuumLocationCategory(
  pad: ReportVacuumLocationRecord,
  hasOpenRepair: boolean,
): VacuumPadLocationCategory {
  if (!pad.serialNumber?.trim()) {
    return 'MISSING_SERIAL';
  }

  if (
    pad.locationStatus === LocationStatus.IN_REPAIR ||
    pad.operationalStatus === OperationalStatus.UNDER_REPAIR ||
    hasOpenRepair
  ) {
    return 'IN_REPAIR';
  }

  if (pad.locationStatus === LocationStatus.ON_MACHINE || pad.currentMachine) {
    return 'ON_MACHINE';
  }

  if (
    pad.locationStatus === LocationStatus.IN_RACK ||
    pad.currentRackLocation
  ) {
    return 'IN_RACK';
  }

  return 'UNKNOWN';
}

function vacuumCurrentPlace(
  pad: ReportVacuumLocationRecord,
  category: VacuumPadLocationCategory,
) {
  if (category === 'ON_MACHINE') {
    return machinePlaceText(pad.currentMachine);
  }

  if (category === 'IN_RACK' || category === 'IN_REPAIR') {
    return rackPlaceText(pad.currentRackLocation);
  }

  return null;
}

function machinePlaceText(machine: ReportMachineRecord | null) {
  if (!machine) {
    return null;
  }

  return [machine.code, machine.name].filter(Boolean).join(' - ');
}

function rackPlaceText(
  rack: Prisma.RackLocationGetPayload<{
    select: typeof reportRackLocationSelect;
  }> | null,
) {
  if (!rack) {
    return null;
  }

  return rack.code;
}

function vacuumLocationCategoryLabel(category: VacuumPadLocationCategory) {
  switch (category) {
    case 'MISSING_SERIAL':
      return 'Λείπει serial';
    case 'UNKNOWN':
      return 'Άγνωστη θέση';
    case 'IN_REPAIR':
      return 'Σε επισκευή';
    case 'ON_MACHINE':
      return 'Σε μηχάνημα / Ενεργό';
    case 'IN_RACK':
      return 'Σε θέση / Αποθηκευμένο';
  }
}

function matchesVacuumPadLocationFilters(
  row: VacuumPadLocationReportRow,
  query: VacuumPadLocationQuery,
) {
  if (
    parseBooleanFilter(query.missingSerial) &&
    row.locationCategory !== 'MISSING_SERIAL'
  ) {
    return false;
  }

  if (
    parseBooleanFilter(query.unknownLocation) &&
    row.locationCategory !== 'UNKNOWN'
  ) {
    return false;
  }

  return (
    matchesTextFilter(query.status, [
      row.locationCategory,
      row.locationCategoryLabel,
      row.operationalStatus,
      row.locationStatus,
    ]) &&
    matchesTextFilter(query.rack, [
      row.rackCode,
      row.rackLabel,
      row.currentPlace,
    ]) &&
    matchesTextFilter(query.machine, [
      row.machineCode,
      row.machineName,
      row.currentPlace,
    ])
  );
}

function matchesTextFilter(
  filter: string | string[] | undefined,
  candidates: Array<string | null>,
) {
  const filters = parseFilterValues(filter).map((value) => value.toLowerCase());

  if (filters.length === 0) {
    return true;
  }

  return filters.some((filterValue) =>
    candidates
      .filter(Boolean)
      .some((candidate) => candidate!.toLowerCase().includes(filterValue)),
  );
}

function parseBooleanFilter(value: string | string[] | undefined) {
  const [rawValue] = parseFilterValues(value);
  const normalized = rawValue?.toLowerCase();

  return ['1', 'true', 'yes', 'on'].includes(normalized ?? '');
}

function buildVacuumLocationSummary(rows: VacuumPadLocationReportRow[]) {
  return {
    total: rows.length,
    onMachine: rows.filter((row) => row.locationCategory === 'ON_MACHINE')
      .length,
    inRack: rows.filter((row) => row.locationCategory === 'IN_RACK').length,
    inRepair: rows.filter((row) => row.locationCategory === 'IN_REPAIR').length,
    missingSerial: rows.filter(
      (row) => row.locationCategory === 'MISSING_SERIAL',
    ).length,
    unknownLocation: rows.filter((row) => row.locationCategory === 'UNKNOWN')
      .length,
    outOfService: rows.filter(
      (row) => row.operationalStatus === OperationalStatus.OUT_OF_SERVICE,
    ).length,
  };
}

function buildVacuumLocationCategoryCounts(rows: VacuumPadLocationReportRow[]) {
  return vacuumLocationCategoryOrder.map((category) => ({
    category,
    label: vacuumLocationCategoryLabel(category),
    count: rows.filter((row) => row.locationCategory === category).length,
  }));
}

const vacuumLocationCategoryOrder: VacuumPadLocationCategory[] = [
  'MISSING_SERIAL',
  'UNKNOWN',
  'IN_REPAIR',
  'ON_MACHINE',
  'IN_RACK',
];

function compareVacuumLocationRows(
  first: VacuumPadLocationReportRow,
  second: VacuumPadLocationReportRow,
) {
  return (
    vacuumLocationCategoryOrder.indexOf(first.locationCategory) -
      vacuumLocationCategoryOrder.indexOf(second.locationCategory) ||
    first.code.localeCompare(second.code)
  );
}

function buildVacuumWhere(
  vacuum?: string | string[],
): Prisma.VacuumPadWhereInput {
  const values = parseFilterValues(vacuum);

  return {
    deletedAt: null,
    ...(values.length > 0
      ? {
          OR: values.flatMap((value) => [
            { code: { contains: value } },
            { serialNumber: { contains: value } },
          ]),
        }
      : {}),
  };
}

function buildMachineWhere(
  machine?: string | string[],
): Prisma.MachineWhereInput {
  const values = parseFilterValues(machine);

  return {
    deletedAt: null,
    ...(values.length > 0
      ? {
          OR: values.flatMap((value) => [
            { code: { contains: value } },
            { name: { contains: value } },
          ]),
        }
      : {}),
  };
}

function buildReportedAtWhere(
  window: ReportDateWindow,
): Pick<Prisma.RepairWhereInput, 'reportedAt'> {
  const reportedAt: Prisma.DateTimeFilter = {};

  if (window.dateFrom) {
    reportedAt.gte = window.dateFrom;
  }

  if (window.dateTo) {
    reportedAt.lte = window.dateTo;
  }

  return Object.keys(reportedAt).length > 0 ? { reportedAt } : {};
}

function parseReportDateWindow(
  query: MostUsedVacuumPadsQuery,
): ReportDateWindow {
  const dateFrom = parseReportDate(query.dateFrom, 'dateFrom');
  const dateTo = parseReportDate(query.dateTo, 'dateTo');

  if (dateFrom && dateTo && dateFrom.getTime() > dateTo.getTime()) {
    throw new BadRequestException('dateFrom must be before dateTo');
  }

  return { dateFrom, dateTo };
}

function parseReportDate(value: string | undefined, fieldName: string) {
  if (!value?.trim()) {
    return null;
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    throw new BadRequestException(`${fieldName} must be a valid date`);
  }

  return parsed;
}

function groupSessionsByVacuum(sessions: ReportChargeSessionRecord[]) {
  const grouped = new Map<string, ReportChargeSessionRecord[]>();

  for (const session of sessions) {
    const current = grouped.get(session.vacuumPadId) ?? [];
    current.push(session);
    grouped.set(session.vacuumPadId, current);
  }

  return grouped;
}

function groupRepairsByVacuum(repairs: ReportRepairRecord[]) {
  const grouped = new Map<string, ReportRepairRecord[]>();

  for (const repair of repairs) {
    const current = grouped.get(repair.vacuumPadId) ?? [];
    current.push(repair);
    grouped.set(repair.vacuumPadId, current);
  }

  return grouped;
}

function filterRepairsByFault(
  repairs: ReportRepairRecord[],
  fault?: string | string[],
): ReportRepairRecord[] {
  const normalizedFilters = parseFilterValues(fault).map((value) =>
    value.toLowerCase(),
  );

  if (normalizedFilters.length === 0) {
    return repairs;
  }

  return repairs.filter((repair) =>
    normalizedFilters.some((normalized) =>
      [
        repair.faultCatalog?.code,
        repair.faultCatalog?.label,
        repair.faultCatalogId,
        repair.faultOtherText,
        repair.faultOtherText ? 'OTHER' : null,
        repair.faultOtherText ? 'Άλλο' : null,
      ]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(normalized)),
    ),
  );
}

function parseFilterValues(filter: string | string[] | undefined) {
  return (Array.isArray(filter) ? filter : [filter])
    .flatMap((value) => value?.split(',') ?? [])
    .map((value) => value.trim())
    .filter(Boolean);
}

function buildMostUsedRow(
  pad: ReportVacuumPadRecord,
  sessions: ReportChargeSessionRecord[],
  window: ReportDateWindow,
  generatedAt: Date,
): Omit<MostUsedVacuumPadReportRow, 'rank'> {
  let chargeCount = 0;
  let openSessionCount = 0;
  let usageMs = 0;
  let usageSessionCount = 0;
  let lastUsageAt: Date | null = null;

  for (const session of sessions) {
    const sessionEnd = session.dechargedAt ?? generatedAt;
    const overlapMs = calculateOverlapMs(
      session.chargedAt,
      sessionEnd,
      window.dateFrom,
      window.dateTo ?? sessionEnd,
    );

    if (overlapMs > 0) {
      usageMs += overlapMs;
      usageSessionCount += 1;
      lastUsageAt =
        !lastUsageAt || session.chargedAt.getTime() > lastUsageAt.getTime()
          ? session.chargedAt
          : lastUsageAt;
    }

    if (isInsideWindow(session.chargedAt, window)) {
      chargeCount += 1;
    }

    if (!session.dechargedAt && overlapMs > 0) {
      openSessionCount += 1;
    }
  }

  const downtimeMs = calculateDowntimeMs(sessions, window);
  const usageHours = msToHours(usageMs);

  return {
    id: pad.id,
    code: pad.code,
    serialNumber: pad.serialNumber,
    vacuumPad: pad.serialNumber ?? pad.code,
    chargeCount,
    usageHours,
    downtimeHours: msToHours(downtimeMs),
    averageMachineStayHours:
      usageSessionCount > 0 ? roundHours(usageHours / usageSessionCount) : 0,
    lastUsageAt: lastUsageAt?.toISOString() ?? null,
    status: mapVacuumStatus(pad),
    openSessionCount,
  };
}

function buildFaultyVacuumPadRow(
  pad: ReportVacuumPadRecord,
  repairs: ReportRepairRecord[],
  window: ReportDateWindow,
  generatedAt: Date,
): Omit<FaultyVacuumPadReportRow, 'rank'> {
  let repairMs = 0;
  let openRepairCount = 0;
  let repairCount = 0;
  let lastFaultAt: Date | null = null;
  const faultTypes = new Set<string>();

  for (const repair of repairs) {
    const repairEnd = repair.completedAt ?? generatedAt;
    const overlapMs = calculateOverlapMs(
      repair.reportedAt,
      repairEnd,
      window.dateFrom,
      window.dateTo ?? repairEnd,
    );

    repairMs += overlapMs;

    if (repair.completedAt && repair.status === RepairStatus.COMPLETED) {
      repairCount += 1;
    }

    if (!repair.completedAt && overlapMs > 0) {
      openRepairCount += 1;
    }

    if (!lastFaultAt || repair.reportedAt.getTime() > lastFaultAt.getTime()) {
      lastFaultAt = repair.reportedAt;
    }

    faultTypes.add(
      repair.faultCatalog?.code ??
        (repair.faultOtherText ? 'OTHER' : 'UNKNOWN'),
    );
  }

  const repairHours = msToHours(repairMs);
  const totalFaults = repairs.length;

  return {
    id: pad.id,
    code: pad.code,
    serialNumber: pad.serialNumber,
    vacuumPad: pad.serialNumber ?? pad.code,
    totalFaults,
    distinctFaultTypes: faultTypes.size,
    repairCount,
    repairHours,
    faultDowntimeHours: repairHours,
    averageRepairHours:
      totalFaults > 0 ? roundHours(repairHours / totalFaults) : 0,
    lastFaultAt: lastFaultAt?.toISOString() ?? null,
    status: mapVacuumStatus(pad),
    openRepairCount,
  };
}

function buildMachineFaultRow(
  machine: ReportMachineRecord,
  attributions: AttributedRepair[],
  window: ReportDateWindow,
  generatedAt: Date,
): Omit<MachineFaultReportRow, 'rank'> {
  let downtimeMs = 0;
  let lastFaultAt: Date | null = null;
  const vacuumPadIds = new Set<string>();
  const faultTypes = new Set<string>();
  const faultTypeCounts = new Map<string, number>();

  for (const attribution of attributions) {
    const repair = attribution.repair;
    const repairEnd = repair.completedAt ?? generatedAt;

    downtimeMs += calculateOverlapMs(
      repair.reportedAt,
      repairEnd,
      window.dateFrom,
      window.dateTo ?? repairEnd,
    );

    if (!lastFaultAt || repair.reportedAt.getTime() > lastFaultAt.getTime()) {
      lastFaultAt = repair.reportedAt;
    }

    vacuumPadIds.add(repair.vacuumPadId);
    faultTypes.add(faultTypeKey(repair));
    const label = faultTypeLabel(repair);
    faultTypeCounts.set(label, (faultTypeCounts.get(label) ?? 0) + 1);
  }

  const totalFaults = attributions.length;
  const affectedVacuumPads = vacuumPadIds.size;

  return {
    id: machine.id,
    machineCode: machine.code,
    machineName: machine.name,
    totalFaults,
    affectedVacuumPads,
    distinctFaultTypes: faultTypes.size,
    repairDispatches: totalFaults,
    downtimeHours: msToHours(downtimeMs),
    averageFaultsPerVacuum:
      affectedVacuumPads > 0 ? roundHours(totalFaults / affectedVacuumPads) : 0,
    mostCommonFault: mostCommonFaultLabel(faultTypeCounts),
    lastFaultAt: lastFaultAt?.toISOString() ?? null,
    status: machine.status,
  };
}

function buildMonthlyFaultTrend(repairs: ReportRepairRecord[]) {
  const counts = new Map<string, number>();

  for (const repair of repairs) {
    const month = repair.reportedAt.toISOString().slice(0, 7);
    counts.set(month, (counts.get(month) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort(([first], [second]) => first.localeCompare(second))
    .map(([month, count]) => ({ month, count }));
}

function buildMachineMonthlyFaultTrend(attributions: AttributedRepair[]) {
  const counts = new Map<string, number>();

  for (const attribution of attributions) {
    const month = attribution.repair.reportedAt.toISOString().slice(0, 7);
    counts.set(month, (counts.get(month) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort(([first], [second]) => first.localeCompare(second))
    .map(([month, count]) => ({ month, count }));
}

function calculateDowntimeMs(
  sessions: ReportChargeSessionRecord[],
  window: ReportDateWindow,
) {
  let downtimeMs = 0;

  for (let index = 0; index < sessions.length - 1; index += 1) {
    const current = sessions[index];
    const next = sessions[index + 1];

    if (!current.dechargedAt || next.chargedAt <= current.dechargedAt) {
      continue;
    }

    downtimeMs += calculateOverlapMs(
      current.dechargedAt,
      next.chargedAt,
      window.dateFrom,
      window.dateTo ?? next.chargedAt,
    );
  }

  return downtimeMs;
}

function inferMachineChargeSession(
  repair: ReportRepairRecord,
  sessions: ReportChargeSessionRecord[],
): ReportChargeSessionRecord | null {
  let bestCoveringSession: ReportChargeSessionRecord | null = null;
  let bestPriorSession: ReportChargeSessionRecord | null = null;

  for (const session of sessions) {
    if (session.chargedAt.getTime() > repair.reportedAt.getTime()) {
      continue;
    }

    if (
      !bestPriorSession ||
      session.chargedAt.getTime() > bestPriorSession.chargedAt.getTime()
    ) {
      bestPriorSession = session;
    }

    if (
      (!session.dechargedAt ||
        session.dechargedAt.getTime() >= repair.reportedAt.getTime()) &&
      (!bestCoveringSession ||
        session.chargedAt.getTime() > bestCoveringSession.chargedAt.getTime())
    ) {
      bestCoveringSession = session;
    }
  }

  return bestCoveringSession ?? bestPriorSession;
}

function groupAttributedRepairsByMachine(attributions: AttributedRepair[]) {
  const grouped = new Map<string, AttributedRepair[]>();

  for (const attribution of attributions) {
    const current = grouped.get(attribution.machineId) ?? [];
    current.push(attribution);
    grouped.set(attribution.machineId, current);
  }

  return grouped;
}

function groupFaultFrequencyAttributions(
  attributions: FaultFrequencyAttribution[],
) {
  const grouped = new Map<string, FaultFrequencyAccumulator>();

  for (const attribution of attributions) {
    const faultCode = faultTypeKey(attribution.repair);
    const faultLabel = faultTypeDisplayLabel(attribution.repair);
    const key = `${faultCode}::${faultLabel}`;
    const current =
      grouped.get(key) ??
      ({
        faultCode,
        faultLabel,
        repairs: [],
      } satisfies FaultFrequencyAccumulator);

    current.repairs.push(attribution);
    grouped.set(key, current);
  }

  return grouped;
}

function buildMostFrequentFaultRow(
  group: FaultFrequencyAccumulator,
  padById: Map<string, ReportVacuumPadRecord>,
  machineById: Map<string, ReportMachineRecord>,
  window: ReportDateWindow,
  generatedAt: Date,
): Omit<MostFrequentFaultReportRow, 'rank'> {
  let downtimeMs = 0;
  let repairs = 0;
  let lastOccurredAt: Date | null = null;
  let unattributedCount = 0;
  const vacuumPadIds = new Set<string>();
  const machineIds = new Set<string>();
  const vacuumCounts = new Map<string, number>();
  const machineCounts = new Map<string, number>();

  for (const attribution of group.repairs) {
    const { repair, machineId } = attribution;
    const repairEnd = repair.completedAt ?? generatedAt;

    downtimeMs += calculateOverlapMs(
      repair.reportedAt,
      repairEnd,
      window.dateFrom,
      window.dateTo ?? repairEnd,
    );

    if (repair.completedAt && repair.status === RepairStatus.COMPLETED) {
      repairs += 1;
    }

    if (
      !lastOccurredAt ||
      repair.reportedAt.getTime() > lastOccurredAt.getTime()
    ) {
      lastOccurredAt = repair.reportedAt;
    }

    vacuumPadIds.add(repair.vacuumPadId);
    vacuumCounts.set(
      repair.vacuumPadId,
      (vacuumCounts.get(repair.vacuumPadId) ?? 0) + 1,
    );

    if (machineId) {
      machineIds.add(machineId);
      machineCounts.set(machineId, (machineCounts.get(machineId) ?? 0) + 1);
    } else {
      unattributedCount += 1;
    }
  }

  const totalOccurrences = group.repairs.length;
  const downtimeHours = msToHours(downtimeMs);

  return {
    faultCode: group.faultCode,
    faultLabel: group.faultLabel,
    totalOccurrences,
    distinctVacuumPads: vacuumPadIds.size,
    distinctMachines: machineIds.size,
    unattributedCount,
    repairs,
    replacements: 0,
    downtimeHours,
    averageRestorationHours:
      totalOccurrences > 0 ? roundHours(downtimeHours / totalOccurrences) : 0,
    topVacuumPad: topCountLabel(vacuumCounts, (id) =>
      vacuumPadReportLabel(padById.get(id)),
    ),
    topMachine: topCountLabel(machineCounts, (id) =>
      machineReportLabel(machineById.get(id), id),
    ),
    lastOccurredAt: lastOccurredAt?.toISOString() ?? null,
  };
}

function buildFaultFrequencyMonthlyTrend(
  attributions: FaultFrequencyAttribution[],
) {
  const counts = new Map<string, number>();

  for (const attribution of attributions) {
    const month = attribution.repair.reportedAt.toISOString().slice(0, 7);
    counts.set(month, (counts.get(month) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort(([first], [second]) => first.localeCompare(second))
    .map(([month, count]) => ({ month, count }));
}

function buildFaultFrequencyPareto(rows: MostFrequentFaultReportRow[]) {
  const totalOccurrences = rows.reduce(
    (sum, row) => sum + row.totalOccurrences,
    0,
  );
  let cumulative = 0;

  return rows.map((row, index) => {
    const percentage =
      totalOccurrences > 0
        ? roundPercentage((row.totalOccurrences / totalOccurrences) * 100)
        : 0;
    const cumulativeBefore = cumulative;
    cumulative = roundPercentage(cumulative + percentage);

    return {
      rank: index + 1,
      faultCode: row.faultCode,
      faultLabel: row.faultLabel,
      occurrences: row.totalOccurrences,
      percentage,
      cumulativePercentage: cumulative,
      inside80: cumulativeBefore < 80,
    };
  });
}

function topCountLabel(
  counts: Map<string, number>,
  getLabel: (id: string) => string | null,
) {
  const [topId] =
    [...counts.entries()].sort(
      ([firstId, firstCount], [secondId, secondCount]) =>
        secondCount - firstCount || firstId.localeCompare(secondId),
    )[0] ?? [];

  return topId ? getLabel(topId) : null;
}

function faultTypeKey(repair: ReportRepairRecord) {
  return (
    repair.faultCatalog?.code ?? (repair.faultOtherText ? 'OTHER' : 'UNKNOWN')
  );
}

function faultTypeDisplayLabel(repair: ReportRepairRecord) {
  return (
    repair.faultCatalog?.label ??
    repair.faultCatalog?.code ??
    (repair.faultOtherText ? 'Άλλο' : 'UNKNOWN')
  );
}

function faultTypeLabel(repair: ReportRepairRecord) {
  if (repair.faultCatalog?.code && repair.faultCatalog.label) {
    return `${repair.faultCatalog.code} - ${repair.faultCatalog.label}`;
  }

  if (repair.faultCatalog?.code) {
    return repair.faultCatalog.code;
  }

  return repair.faultOtherText ? 'OTHER - Άλλο' : 'UNKNOWN';
}

function mostCommonFaultLabel(faultTypeCounts: Map<string, number>) {
  return (
    [...faultTypeCounts.entries()].sort(
      ([firstLabel, firstCount], [secondLabel, secondCount]) =>
        secondCount - firstCount || firstLabel.localeCompare(secondLabel),
    )[0]?.[0] ?? null
  );
}

function vacuumPadReportLabel(pad: ReportVacuumPadRecord | undefined) {
  if (!pad) {
    return null;
  }

  return pad.serialNumber ?? pad.code;
}

function machineReportLabel(
  machine: ReportMachineRecord | undefined,
  fallbackId: string,
) {
  if (!machine) {
    return fallbackId;
  }

  return machine.name ? `${machine.code} - ${machine.name}` : machine.code;
}

function calculateOverlapMs(
  startedAt: Date,
  endedAt: Date,
  windowStart: Date | null,
  windowEnd: Date | null,
) {
  const start = Math.max(
    startedAt.getTime(),
    windowStart?.getTime() ?? startedAt.getTime(),
  );
  const end = Math.min(
    endedAt.getTime(),
    windowEnd?.getTime() ?? endedAt.getTime(),
  );

  return Math.max(0, end - start);
}

function isInsideWindow(value: Date, window: ReportDateWindow) {
  const timestamp = value.getTime();

  if (window.dateFrom && timestamp < window.dateFrom.getTime()) {
    return false;
  }

  if (window.dateTo && timestamp > window.dateTo.getTime()) {
    return false;
  }

  return true;
}

function msToHours(value: number) {
  return roundHours(value / 1000 / 60 / 60);
}

function roundHours(value: number) {
  return Math.round(value * 100) / 100;
}

function roundPercentage(value: number) {
  return Math.round(value * 100) / 100;
}

function mapVacuumStatus(pad: ReportVacuumPadRecord) {
  if (
    pad.locationStatus === LocationStatus.ON_MACHINE &&
    pad.operationalStatus === OperationalStatus.FUNCTIONAL
  ) {
    return 'ACTIVE';
  }

  if (
    pad.locationStatus === LocationStatus.IN_REPAIR ||
    pad.operationalStatus === OperationalStatus.UNDER_REPAIR
  ) {
    return 'REPAIR';
  }

  if (!pad.serialNumber) {
    return 'INCOMPLETE';
  }

  if (pad.operationalStatus === OperationalStatus.RETIRED) {
    return 'RETIRED';
  }

  return 'INACTIVE';
}

function compareMostUsedRows(
  first: Omit<MostUsedVacuumPadReportRow, 'rank'>,
  second: Omit<MostUsedVacuumPadReportRow, 'rank'>,
) {
  return (
    second.chargeCount - first.chargeCount ||
    second.usageHours - first.usageHours ||
    first.code.localeCompare(second.code)
  );
}

function compareFaultyVacuumRows(
  first: Omit<FaultyVacuumPadReportRow, 'rank'>,
  second: Omit<FaultyVacuumPadReportRow, 'rank'>,
) {
  return (
    second.totalFaults - first.totalFaults ||
    second.repairHours - first.repairHours ||
    first.code.localeCompare(second.code)
  );
}

function compareMachineFaultRows(
  first: Omit<MachineFaultReportRow, 'rank'>,
  second: Omit<MachineFaultReportRow, 'rank'>,
) {
  return (
    second.totalFaults - first.totalFaults ||
    second.downtimeHours - first.downtimeHours ||
    first.machineCode.localeCompare(second.machineCode)
  );
}

function compareMostFrequentFaultRows(
  first: Omit<MostFrequentFaultReportRow, 'rank'>,
  second: Omit<MostFrequentFaultReportRow, 'rank'>,
) {
  return (
    second.totalOccurrences - first.totalOccurrences ||
    second.downtimeHours - first.downtimeHours ||
    first.faultCode.localeCompare(second.faultCode)
  );
}
