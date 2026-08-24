export type MostUsedVacuumPadsQuery = {
  dateFrom?: string;
  dateTo?: string;
  vacuum?: string | string[];
};

export type FaultyVacuumPadsQuery = MostUsedVacuumPadsQuery & {
  fault?: string | string[];
};

export type MachineFaultReportQuery = {
  dateFrom?: string;
  dateTo?: string;
  machine?: string | string[];
  fault?: string | string[];
};

export type MostFrequentFaultsQuery = {
  dateFrom?: string;
  dateTo?: string;
  fault?: string | string[];
  vacuum?: string | string[];
  machine?: string | string[];
};

export type VacuumPadLocationQuery = {
  vacuum?: string | string[];
  status?: string | string[];
  rack?: string | string[];
  machine?: string | string[];
  missingSerial?: string | string[];
  unknownLocation?: string | string[];
};

export type MostUsedVacuumPadReportRow = {
  rank: number;
  id: string;
  code: string;
  serialNumber: string | null;
  vacuumPad: string;
  chargeCount: number;
  usageHours: number;
  downtimeHours: number;
  averageMachineStayHours: number;
  lastUsageAt: string | null;
  status: string;
  openSessionCount: number;
};

export type MostUsedVacuumPadsReportResponse = {
  items: MostUsedVacuumPadReportRow[];
  total: number;
  generatedAt: string;
  policy: {
    usageHours: string;
    downtimeHours: string;
    chargeCount: string;
  };
};

export type FaultyVacuumPadReportRow = {
  rank: number;
  id: string;
  code: string;
  serialNumber: string | null;
  vacuumPad: string;
  totalFaults: number;
  distinctFaultTypes: number;
  repairCount: number;
  repairHours: number;
  faultDowntimeHours: number;
  averageRepairHours: number;
  lastFaultAt: string | null;
  status: string;
  openRepairCount: number;
};

export type FaultyVacuumPadsReportResponse = {
  items: FaultyVacuumPadReportRow[];
  total: number;
  generatedAt: string;
  chart: {
    monthlyTrend: Array<{ month: string; count: number }>;
    totals: {
      totalFaults: number;
      totalRepairHours: number;
      totalDowntimeHours: number;
      openRepairCount: number;
    };
  };
  policy: {
    faultCount: string;
    distinctFaultTypes: string;
    repairCount: string;
    repairHours: string;
    faultDowntimeHours: string;
    averageRepairHours: string;
  };
};

export type MachineFaultReportRow = {
  rank: number;
  id: string;
  machineCode: string;
  machineName: string;
  totalFaults: number;
  affectedVacuumPads: number;
  distinctFaultTypes: number;
  repairDispatches: number;
  downtimeHours: number;
  averageFaultsPerVacuum: number;
  mostCommonFault: string | null;
  lastFaultAt: string | null;
  status: string;
};

export type MachineFaultReportResponse = {
  items: MachineFaultReportRow[];
  total: number;
  generatedAt: string;
  note: string;
  chart: {
    monthlyTrend: Array<{ month: string; count: number }>;
    totals: {
      totalFaults: number;
      totalDowntimeHours: number;
      unattributedFaults: number;
    };
  };
  policy: {
    attribution: string;
    faultCount: string;
    distinctFaultTypes: string;
    repairDispatches: string;
    downtimeHours: string;
    averageFaultsPerVacuum: string;
    customFaults: string;
  };
};

export type MostFrequentFaultReportRow = {
  rank: number;
  faultCode: string;
  faultLabel: string;
  totalOccurrences: number;
  distinctVacuumPads: number;
  distinctMachines: number;
  unattributedCount: number;
  repairs: number;
  replacements: number;
  downtimeHours: number;
  averageRestorationHours: number;
  topVacuumPad: string | null;
  topMachine: string | null;
  lastOccurredAt: string | null;
};

export type MostFrequentFaultParetoRow = {
  rank: number;
  faultCode: string;
  faultLabel: string;
  occurrences: number;
  percentage: number;
  cumulativePercentage: number;
  inside80: boolean;
};

export type MostFrequentFaultsReportResponse = {
  items: MostFrequentFaultReportRow[];
  total: number;
  generatedAt: string;
  note: string;
  chart: {
    monthlyTrend: Array<{ month: string; count: number }>;
    pareto: MostFrequentFaultParetoRow[];
    totals: {
      totalOccurrences: number;
      totalDowntimeHours: number;
      totalRepairs: number;
      totalReplacements: number;
      unattributedFaults: number;
    };
  };
  policy: {
    attribution: string;
    faultGrouping: string;
    totalOccurrences: string;
    distinctMachines: string;
    repairs: string;
    replacements: string;
    downtimeHours: string;
    averageRestorationHours: string;
    pareto: string;
  };
};

export type VacuumPadLocationCategory =
  | 'MISSING_SERIAL'
  | 'UNKNOWN'
  | 'IN_REPAIR'
  | 'ON_MACHINE'
  | 'IN_RACK';

export type VacuumPadLocationReportRow = {
  id: string;
  code: string;
  serialNumber: string | null;
  locationCategory: VacuumPadLocationCategory;
  locationCategoryLabel: string;
  currentPlace: string | null;
  machineCode: string | null;
  machineName: string | null;
  rackCode: string | null;
  rackLabel: string | null;
  operationalStatus: string;
  locationStatus: string;
  latestMovementAt: string | null;
  updatedAt: string;
  openRepairId: string | null;
};

export type VacuumPadLocationSummary = {
  total: number;
  onMachine: number;
  inRack: number;
  inRepair: number;
  missingSerial: number;
  unknownLocation: number;
  outOfService: number;
};

export type VacuumPadLocationReportResponse = {
  items: VacuumPadLocationReportRow[];
  total: number;
  generatedAt: string;
  summary: VacuumPadLocationSummary;
  chart: {
    locationCategories: Array<{
      category: VacuumPadLocationCategory;
      label: string;
      count: number;
    }>;
  };
  policy: {
    missingSerial: string;
    onMachine: string;
    inRack: string;
    inRepair: string;
    unknownLocation: string;
    outOfService: string;
  };
};
