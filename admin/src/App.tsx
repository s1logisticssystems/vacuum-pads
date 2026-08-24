import {
  FormEvent,
  ReactNode,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import {
  ADMIN_DEVICE_ID,
  AdminApiClient,
  ApiError,
  ApiPayload,
  DEFAULT_API_BASE_URL,
  DataItem,
  MasterDataImportEntity,
  extractMessage,
  normalizeBaseUrl,
} from './api';

type TabId = 'operations' | 'movements' | 'data' | 'reports';
type Tone = 'success' | 'warning' | 'error' | 'info';
type SelectorBadgeTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';
type SelectorBadge = { label: string; tone?: SelectorBadgeTone };
type StatusDetailKind = 'active' | 'inactive' | 'repair';
type DataEntityId = 'vacuums' | 'machines' | 'racks' | 'faults';
type ReportId =
  | 'mostUsedVacuumPads'
  | 'mostFaultyVacuumPads'
  | 'machinesCausingFaults'
  | 'mostFrequentFaults'
  | 'realVacuumLocation';
type DataColumn = {
  key: string;
  header: string;
  value: (item: DataItem) => string;
  className?: string;
};
type DataFormField = {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'select' | 'number' | 'checkbox' | 'date';
  section?: string;
  required?: boolean;
  readOnly?: boolean;
  hideOnCreate?: boolean;
  hideOnEdit?: boolean;
  options?: Array<{ value: string; label: string }>;
  visibleWhen?: (
    values: Record<string, string | boolean>,
    mode: 'create' | 'edit',
  ) => boolean;
};
type DataFormConfig = {
  entity: DataEntityId;
  title: string;
  fields: DataFormField[];
};
type DataFormModalState = {
  mode: 'create' | 'edit';
  entity: DataEntityId;
  row?: DataItem;
};
type DataImportModalState = {
  entity: DataEntityId;
  file: File;
  preview: ApiPayload;
};
type XlsxCellValue = string | number | boolean | null | undefined;
type XlsxSheet = {
  name: string;
  rows: XlsxCellValue[][];
  columnWidths?: number[];
};
type LiveConnectionStatus =
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'unsupported';
type WorkflowModalState = {
  title: string;
  message: string;
  tone: Tone;
  payload?: ApiPayload | null;
};

type AdminData = {
  vacuumPads: DataItem[];
  machines: DataItem[];
  racks: DataItem[];
  faultCatalog: DataItem[];
  activeVacuums: DataItem[];
  inactiveVacuums: DataItem[];
  repairVacuums: DataItem[];
  summary: ApiPayload | null;
};
type AdminDataHook = {
  data: AdminData;
  loading: boolean;
  error: ApiPayload | null;
  refresh: (options?: { silent?: boolean }) => Promise<void>;
  lastUpdatedAt: Date | null;
  liveStatus: LiveConnectionStatus;
  lastEventAt: Date | null;
};

type MovementFilters = {
  type: string;
  vacuum: string[];
  machine: string[];
  rack: string[];
  fault: string[];
  startedFrom: string;
  startedTo: string;
  endedFrom: string;
  endedTo: string;
};
type MovementExportScope = 'all' | 'page';
type VacuumQuickFilter = 'all' | 'active' | 'inactive' | 'repair' | 'missingSerial';
type MostUsedReportFilters = {
  dateFrom: string;
  dateTo: string;
  vacuum: string[];
};
type MostUsedChartMetric =
  | 'chargeCount'
  | 'usageHours'
  | 'downtimeHours'
  | 'averageMachineStayHours';
type FaultyReportFilters = MostUsedReportFilters & {
  fault: string[];
};
type FaultyChartMetric =
  | 'totalFaults'
  | 'repairHours'
  | 'faultDowntimeHours'
  | 'averageRepairHours'
  | 'repairCount';
type MachineFaultReportFilters = {
  dateFrom: string;
  dateTo: string;
  machine: string[];
  fault: string[];
};
type MachineFaultChartMetric =
  | 'totalFaults'
  | 'downtimeHours'
  | 'affectedVacuumPads'
  | 'distinctFaultTypes'
  | 'repairDispatches';
type MostFrequentFaultFilters = {
  dateFrom: string;
  dateTo: string;
  fault: string[];
  vacuum: string[];
  machine: string[];
};
type MostFrequentFaultChartMetric =
  | 'totalOccurrences'
  | 'downtimeHours'
  | 'repairs'
  | 'replacements'
  | 'averageRestorationHours';
type VacuumLocationReportFilters = {
  vacuum: string[];
  status: string[];
  rack: string[];
  machine: string[];
  missingSerial: boolean;
  unknownLocation: boolean;
};

const STORAGE_KEY = 'vacuum-admin-api-base-url';
const pageSizeStorageKeys = {
  movements: 'movementsPageSize',
  data: {
    vacuums: 'dataVacuumPageSize',
    machines: 'dataMachinesPageSize',
    racks: 'dataRacksPageSize',
    faults: 'dataFaultsPageSize',
  },
} as const;

const tabs: Array<{ id: TabId; label: string }> = [
  { id: 'operations', label: 'Λειτουργίες' },
  { id: 'movements', label: 'Κινήσεις' },
  { id: 'data', label: 'Καταχώρηση' },
  { id: 'reports', label: 'Αναφορές' },
];

const emptyData: AdminData = {
  vacuumPads: [],
  machines: [],
  racks: [],
  faultCatalog: [],
  activeVacuums: [],
  inactiveVacuums: [],
  repairVacuums: [],
  summary: null,
};

const emptyMovementFilters: MovementFilters = {
  type: '',
  vacuum: [],
  machine: [],
  rack: [],
  fault: [],
  startedFrom: '',
  startedTo: '',
  endedFrom: '',
  endedTo: '',
};

const emptyMostUsedReportFilters: MostUsedReportFilters = {
  dateFrom: '',
  dateTo: '',
  vacuum: [],
};
const emptyFaultyReportFilters: FaultyReportFilters = {
  dateFrom: '',
  dateTo: '',
  vacuum: [],
  fault: [],
};
const emptyMachineFaultReportFilters: MachineFaultReportFilters = {
  dateFrom: '',
  dateTo: '',
  machine: [],
  fault: [],
};
const emptyMostFrequentFaultFilters: MostFrequentFaultFilters = {
  dateFrom: '',
  dateTo: '',
  fault: [],
  vacuum: [],
  machine: [],
};
const emptyVacuumLocationReportFilters: VacuumLocationReportFilters = {
  vacuum: [],
  status: [],
  rack: [],
  machine: [],
  missingSerial: false,
  unknownLocation: false,
};

const movementPageSizes = [25, 50, 100, 200];
const movementExportPageSize = 200;
const defaultPageSize = 50;
const vacuumOperationalStatusesWithLocation = ['FUNCTIONAL', 'UNDER_REPAIR'];
const vacuumEditableLocationStatuses = ['IN_RACK', 'ON_MACHINE', 'IN_REPAIR'];

const reportChoices: Array<{ id: ReportId; label: string }> = [
  {
    id: 'mostUsedVacuumPads',
    label: 'Χρήση Vacuum',
  },
  {
    id: 'mostFaultyVacuumPads',
    label: 'Βλάβες/Vacuum',
  },
  {
    id: 'machinesCausingFaults',
    label: 'Βλάβες/Vacuum-Μηχανήματα',
  },
  { id: 'mostFrequentFaults', label: 'Συχνότητα Βλαβών' },
  {
    id: 'realVacuumLocation',
    label: 'Θέση Vacuum',
  },
];

const mostUsedMetricOptions: Array<{
  value: MostUsedChartMetric;
  label: string;
}> = [
  { value: 'chargeCount', label: 'Χρεώσεις' },
  { value: 'usageHours', label: 'Ώρες Χρήσης' },
  { value: 'downtimeHours', label: 'Downtime' },
  { value: 'averageMachineStayHours', label: 'Μέσος Χρόνος Παραμονής' },
];

const faultyMetricOptions: Array<{
  value: FaultyChartMetric;
  label: string;
}> = [
  { value: 'totalFaults', label: 'Συνολικές Βλάβες' },
  { value: 'repairHours', label: 'Ώρες Επισκευής' },
  { value: 'faultDowntimeHours', label: 'Downtime λόγω Βλάβης' },
  { value: 'averageRepairHours', label: 'Μέσος Χρόνος Επισκευής' },
  { value: 'repairCount', label: 'Επισκευές' },
];

const machineFaultMetricOptions: Array<{
  value: MachineFaultChartMetric;
  label: string;
}> = [
  { value: 'totalFaults', label: 'Συνολικές Βλάβες' },
  { value: 'downtimeHours', label: 'Συνολικό Downtime' },
  { value: 'affectedVacuumPads', label: 'Vacuum Pads με Βλάβες' },
  { value: 'distinctFaultTypes', label: 'Διαφορετικοί Τύποι Βλαβών' },
  { value: 'repairDispatches', label: 'Αποστολές για Επισκευή' },
];

const mostFrequentFaultMetricOptions: Array<{
  value: MostFrequentFaultChartMetric;
  label: string;
}> = [
  { value: 'totalOccurrences', label: 'Συνολικές Καταγραφές' },
  { value: 'downtimeHours', label: 'Συνολικό Downtime' },
  { value: 'repairs', label: 'Επισκευές' },
  { value: 'replacements', label: 'Αντικαταστάσεις' },
  { value: 'averageRestorationHours', label: 'Μέσος Χρόνος Αποκατάστασης' },
];

const vacuumLocationStatusOptions: DataItem[] = [
  {
    code: 'MISSING_SERIAL',
    label: 'Λείπει serial',
    description: 'Vacuum χωρίς serialNumber',
  },
  {
    code: 'UNKNOWN',
    label: 'Άγνωστη θέση',
    description: 'Δεν υπάρχει τρέχον μηχάνημα, rack ή repair state',
  },
  {
    code: 'IN_REPAIR',
    label: 'Σε επισκευή',
    description: 'Location Status IN_REPAIR ή ανοιχτή επισκευή',
  },
  {
    code: 'ON_MACHINE',
    label: 'Σε μηχάνημα / Ενεργό',
    description: 'Location Status ON_MACHINE ή τρέχον μηχάνημα',
  },
  {
    code: 'IN_RACK',
    label: 'Σε θέση / Αποθηκευμένο',
    description: 'Location Status IN_RACK ή τρέχον rack',
  },
  {
    code: 'OUT_OF_SERVICE',
    label: 'Εκτός χρήσης',
    description: 'Operational Status OUT_OF_SERVICE',
  },
  {
    code: 'UNDER_REPAIR',
    label: 'Operational UNDER_REPAIR',
    description: 'Raw operational status',
  },
  {
    code: 'FUNCTIONAL',
    label: 'Operational FUNCTIONAL',
    description: 'Raw operational status',
  },
];

const vacuumQuickFilters: Array<{
  id: VacuumQuickFilter;
  label: string;
  tone?: 'warning' | 'repair';
}> = [
  { id: 'all', label: 'Όλα' },
  { id: 'active', label: 'Ενεργά' },
  { id: 'inactive', label: 'Ανενεργά' },
  { id: 'repair', label: 'Προς επισκευή', tone: 'repair' },
  { id: 'missingSerial', label: 'Λείπει serial', tone: 'warning' },
];

const dataEntities: Array<{ id: DataEntityId; label: string }> = [
  { id: 'vacuums', label: 'Vacuum' },
  { id: 'machines', label: 'Machines' },
  { id: 'racks', label: 'Θέσεις' },
  { id: 'faults', label: 'Βλάβες' },
];

const dataFormOptions = {
  operationalStatus: [
    'FUNCTIONAL',
    'INSPECTION_REQUIRED',
    'UNDER_REPAIR',
    'OUT_OF_SERVICE',
    'RETIRED',
  ],
  locationStatus: vacuumEditableLocationStatuses,
  machineStatus: ['ACTIVE', 'INACTIVE', 'MAINTENANCE', 'RETIRED'],
  rackType: ['AVL', 'REP'],
  repairPriority: ['LOW', 'NORMAL', 'HIGH', 'URGENT'],
};

const movementTypeOptions = [
  { value: '', label: 'Όλα' },
  { value: 'CHARGE', label: 'Χρέωση' },
  { value: 'DECHARGE', label: 'Αποχρέωση' },
  { value: 'FAULT_DECLARED', label: 'Δήλωση Βλάβης' },
  { value: 'FAULT_RESTORED', label: 'Αποκατάσταση Βλάβης' },
];

function usePersistentPageSize(storageKey: string) {
  const [pageSize, setPageSizeState] = useState(() =>
    readStoredPageSize(storageKey),
  );

  useEffect(() => {
    setPageSizeState(readStoredPageSize(storageKey));
  }, [storageKey]);

  const setPageSize = useCallback(
    (value: number) => {
      const normalized = normalizePageSize(value);
      setPageSizeState(normalized);

      try {
        localStorage.setItem(storageKey, String(normalized));
      } catch {
        // localStorage can be unavailable in stricter browser privacy modes.
      }
    },
    [storageKey],
  );

  return [pageSize, setPageSize] as const;
}

function readStoredPageSize(storageKey: string) {
  try {
    return normalizePageSize(Number(localStorage.getItem(storageKey)));
  } catch {
    return defaultPageSize;
  }
}

function normalizePageSize(value: number) {
  return movementPageSizes.includes(value) ? value : defaultPageSize;
}

const outcomes = [
  { value: 'RETURNED_TO_SERVICE', label: 'Επιστροφή σε λειτουργία' },
  { value: 'OUT_OF_SERVICE', label: 'Εκτός λειτουργίας' },
  { value: 'RETIRED', label: 'Απόσυρση' },
  { value: 'UNRESOLVED', label: 'Παραμένει σε επισκευή' },
];

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>('operations');
  const [activeDataEntity, setActiveDataEntity] =
    useState<DataEntityId>('vacuums');
  const [activeReport, setActiveReport] =
    useState<ReportId>('mostUsedVacuumPads');
  const [savedBaseUrl, setSavedBaseUrl] = useState(() =>
    normalizeBaseUrl(localStorage.getItem(STORAGE_KEY) ?? DEFAULT_API_BASE_URL),
  );
  const [draftBaseUrl, setDraftBaseUrl] = useState(savedBaseUrl);
  const [isEditingBackendUrl, setIsEditingBackendUrl] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const api = useMemo(() => new AdminApiClient(savedBaseUrl), [savedBaseUrl]);

  function saveBaseUrl() {
    const normalized = normalizeBaseUrl(draftBaseUrl);
    localStorage.setItem(STORAGE_KEY, normalized);
    setSavedBaseUrl(normalized);
    setDraftBaseUrl(normalized);
    setIsEditingBackendUrl(false);
  }

  function cancelBaseUrlEdit() {
    setDraftBaseUrl(savedBaseUrl);
    setIsEditingBackendUrl(false);
  }

  function selectTab(tabId: TabId) {
    if (tabId !== activeTab) {
      if (tabId === 'data') {
        setActiveDataEntity('vacuums');
      }

      if (tabId === 'reports') {
        setActiveReport('mostUsedVacuumPads');
      }
    }

    setActiveTab(tabId);
  }

  const hasSubTabs = activeTab === 'data' || activeTab === 'reports';

  return (
    <div className={hasSubTabs ? 'appShell hasSubTabs' : 'appShell'}>
      <div className={hasSubTabs ? 'adminTopBar withSubTabs' : 'adminTopBar'}>
        <header className="hero">
          <div className="heroTitleBlock">
            <p className="eyebrow">Vacuum Traceability Admin</p>
            <h1>Κέντρο ελέγχου λειτουργιών</h1>
          </div>
          <button
            type="button"
            className="settingsButton"
            aria-label="Ρυθμίσεις admin"
            onClick={() => setIsSettingsOpen(true)}
          >
            ⚙
          </button>
        </header>

        <div className="adminNavBlock">
          <nav className="tabs" aria-label="Admin tabs">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                className={activeTab === tab.id ? 'tabButton active' : 'tabButton'}
                type="button"
                onClick={() => selectTab(tab.id)}
              >
                <span>{tab.label}</span>
                {tab.id === 'data' || tab.id === 'reports' ? (
                  <span className="tabSubmenuChevron" aria-hidden="true" />
                ) : null}
              </button>
            ))}
          </nav>

          {activeTab === 'data' ? (
            <div className="subTabBar dataSubmenu" aria-label="Master data entities">
              {dataEntities.map((entity) => (
                <button
                  key={entity.id}
                  type="button"
                  className={
                    activeDataEntity === entity.id
                      ? 'subTabButton active'
                      : 'subTabButton'
                  }
                  onClick={() => setActiveDataEntity(entity.id)}
                >
                  {entity.label}
                </button>
              ))}
            </div>
          ) : null}

          {activeTab === 'reports' ? (
            <div className="subTabBar reportSubmenu" aria-label="Επιλογή αναφοράς">
              {reportChoices.map((report) => (
                <button
                  key={report.id}
                  type="button"
                  className={
                    activeReport === report.id
                      ? 'subTabButton active'
                      : 'subTabButton'
                  }
                  onClick={() => setActiveReport(report.id)}
                >
                  {report.label}
                  {[
                    'mostUsedVacuumPads',
                    'mostFaultyVacuumPads',
                    'machinesCausingFaults',
                    'mostFrequentFaults',
                    'realVacuumLocation',
                  ].includes(report.id) ? (
                    <span className="reportReadyBadge">Έτοιμη</span>
                  ) : (
                    <span className="reportSoonBadge">Σε επόμενο στάδιο</span>
                  )}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      {isSettingsOpen ? (
        <SettingsDialog
          api={api}
          draftBaseUrl={draftBaseUrl}
          savedBaseUrl={savedBaseUrl}
          isEditing={isEditingBackendUrl}
          onChange={setDraftBaseUrl}
          onEdit={() => setIsEditingBackendUrl(true)}
          onSave={saveBaseUrl}
          onCancel={cancelBaseUrlEdit}
          onClose={() => setIsSettingsOpen(false)}
        />
      ) : null}

      <main>
        {activeTab === 'operations' ? (
          <OperationsTab api={api} />
        ) : activeTab === 'movements' ? (
          <MovementsTab api={api} />
        ) : activeTab === 'data' ? (
          <DataTab api={api} activeEntity={activeDataEntity} />
        ) : activeTab === 'reports' ? (
          <ReportsTab api={api} activeReport={activeReport} />
        ) : (
          <ComingSoon label={tabs.find((tab) => tab.id === activeTab)!.label} />
        )}
      </main>
    </div>
  );
}

function BackendUrlPanel({
  draftBaseUrl,
  savedBaseUrl,
  isEditing,
  onChange,
  onEdit,
  onSave,
  onCancel,
}: {
  draftBaseUrl: string;
  savedBaseUrl: string;
  isEditing: boolean;
  onChange: (value: string) => void;
  onEdit: () => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <section className="backendPanel" aria-label="Backend URL setting">
      <label htmlFor="backend-url">Backend URL</label>
      <div className="inlineField">
        <input
          id="backend-url"
          value={draftBaseUrl}
          readOnly={!isEditing}
          className={!isEditing ? 'readOnlyInput' : undefined}
          onChange={(event) => onChange(event.target.value)}
          placeholder={DEFAULT_API_BASE_URL}
        />
        <button type="button" onClick={isEditing ? onSave : onEdit}>
          {isEditing ? 'Αποθήκευση' : 'Επεξεργασία'}
        </button>
      </div>
      {isEditing ? (
        <button type="button" className="ghost compactButton" onClick={onCancel}>
          Ακύρωση
        </button>
      ) : null}
      <span className="smallText">Ενεργό: {savedBaseUrl}</span>
    </section>
  );
}

function OperationsTab({ api }: { api: AdminApiClient }) {
  const adminData = useAdminData(api);
  const chargeVacuumOptions = useMemo(
    () => adminData.data.inactiveVacuums.filter(isInactiveVacuum),
    [adminData.data.inactiveVacuums],
  );
  const chargeMachineOptions = useMemo(
    () => adminData.data.machines.filter(isMachineAvailableForCharge),
    [adminData.data.machines],
  );
  const dechargeVacuumOptions = useMemo(
    () => adminData.data.activeVacuums.filter(isActiveVacuum),
    [adminData.data.activeVacuums],
  );
  const dechargeRackOptions = useMemo(
    () => adminData.data.racks.filter(isRackAvailable),
    [adminData.data.racks],
  );
  const faultVacuumOptions = useMemo(
    () => adminData.data.inactiveVacuums.filter(isInactiveVacuum),
    [adminData.data.inactiveVacuums],
  );
  const faultRepairRackOptions = useMemo(
    () =>
      adminData.data.racks.filter(
        (rack) => textValue(rack.type) === 'REP' && isRackAvailable(rack),
      ),
    [adminData.data.racks],
  );
  const restorationVacuumOptions = useMemo(
    () => adminData.data.repairVacuums.filter(isRepairVacuum),
    [adminData.data.repairVacuums],
  );
  const restorationRackOptions = useMemo(
    () => adminData.data.racks.filter(isRackAvailable),
    [adminData.data.racks],
  );
  const activeFaultCatalogOptions = useMemo(
    () => adminData.data.faultCatalog.filter(isActiveFaultCatalogItem),
    [adminData.data.faultCatalog],
  );

  return (
    <div className="operationsGrid">
      <StatusSummaryCard
        data={adminData.data}
        loading={adminData.loading}
        error={adminData.error}
        lastUpdatedAt={adminData.lastUpdatedAt}
        liveStatus={adminData.liveStatus}
        lastEventAt={adminData.lastEventAt}
        onRefresh={adminData.refresh}
      />
      <ChargeCard
        api={api}
        vacuums={chargeVacuumOptions}
        machines={chargeMachineOptions}
        dataLoading={adminData.loading}
        dataError={adminData.error}
        onWorkflowSuccess={adminData.refresh}
      />
      <DechargeCard
        api={api}
        vacuums={dechargeVacuumOptions}
        racks={dechargeRackOptions}
        dataLoading={adminData.loading}
        dataError={adminData.error}
        onWorkflowSuccess={adminData.refresh}
      />
      <FaultDeclarationCard
        api={api}
        vacuums={faultVacuumOptions}
        repairRacks={faultRepairRackOptions}
        faultCatalog={activeFaultCatalogOptions}
        dataLoading={adminData.loading}
        dataError={adminData.error}
        onWorkflowSuccess={adminData.refresh}
      />
      <FaultRestorationCard
        api={api}
        vacuums={restorationVacuumOptions}
        racks={restorationRackOptions}
        dataLoading={adminData.loading}
        dataError={adminData.error}
        onWorkflowSuccess={adminData.refresh}
      />
    </div>
  );
}

function ReportsTab({
  api,
  activeReport,
}: {
  api: AdminApiClient;
  activeReport: ReportId;
}) {
  const adminData = useAdminData(api);
  const [filters, setFilters] = useState<MostUsedReportFilters>(
    emptyMostUsedReportFilters,
  );
  const [chartMetric, setChartMetric] =
    useState<MostUsedChartMetric>('chargeCount');
  const [payload, setPayload] = useState<ApiPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ApiPayload | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const reportVacuumOptions = adminData.data.vacuumPads;
  const rows = payload ? arrayItems(payload) : [];
  const chartRows = rows.slice(0, 20);
  const total = numberValue(payload?.total) ?? rows.length;
  const activeReportChoice = reportChoices.find(
    (report) => report.id === activeReport,
  );

  const refreshMostUsedReport = useCallback(
    async (options: { silent?: boolean } = {}) => {
      if (!options.silent) {
        setLoading(true);
      }
      setError(null);

      try {
        const result = await api.getMostUsedVacuumPadsReport(
          cleanMostUsedReportFilters(filters),
        );
        setPayload(result);
        setHasSearched(true);
        setLastUpdatedAt(new Date());
      } catch (caught) {
        setError(errorPayload(caught));
      } finally {
        if (!options.silent) {
          setLoading(false);
        }
      }
    },
    [api, filters],
  );
  const refreshRef = useRef(refreshMostUsedReport);

  useEffect(() => {
    refreshRef.current = refreshMostUsedReport;
  }, [refreshMostUsedReport]);

  useEffect(() => {
    if (adminData.lastEventAt && hasSearched && activeReport === 'mostUsedVacuumPads') {
      void refreshRef.current({ silent: true });
    }
  }, [activeReport, adminData.lastEventAt, hasSearched]);

  const previousReportRef = useRef(activeReport);

  useEffect(() => {
    if (previousReportRef.current === activeReport) {
      return;
    }

    previousReportRef.current = activeReport;
    setPayload(null);
    setError(null);
    setHasSearched(false);
    setLastUpdatedAt(null);
  }, [activeReport]);

  function updateFilter<K extends keyof MostUsedReportFilters>(
    key: K,
    value: MostUsedReportFilters[K],
  ) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  function clearReportFilters() {
    setFilters(emptyMostUsedReportFilters);
    setPayload(null);
    setError(null);
    setHasSearched(false);
    setLastUpdatedAt(null);
  }

  function exportMostUsedReportCsv() {
    if (rows.length === 0) {
      return;
    }

    downloadTextFile(
      buildMostUsedReportCsv(rows),
      mostUsedReportFilename(),
      'text/csv;charset=utf-8',
    );
  }

  return (
    <div className="reportsGrid">
      <OperationCard
        title={activeReportChoice?.label ?? 'Αναφορές'}
        accent="amber"
        wide
      >
        <div className="reportLayout">
          <div className="reportPanel">
            <div className="reportPanelHeader">
              <div>
                <p className="eyebrow">
                  {activeReport === 'realVacuumLocation'
                    ? 'Report 12A.5'
                    : activeReport === 'mostFrequentFaults'
                      ? 'Report 12A.4'
                      : activeReport === 'machinesCausingFaults'
                        ? 'Report 12A.3'
                        : activeReport === 'mostFaultyVacuumPads'
                          ? 'Report 12A.2'
                          : 'Report 12A.1'}
                </p>
                <h3>{activeReportChoice?.label}</h3>
              </div>
              <div className="liveRefreshPanel compactLivePanel">
                <span className={`liveBadge ${adminData.liveStatus}`}>
                  {movementLiveStatusLabel(adminData.liveStatus)}
                </span>
                <span className="smallText">
                  Τελευταία ενημέρωση:{' '}
                  {lastUpdatedAt ? formatTime(lastUpdatedAt) : 'αναμονή'}
                </span>
              </div>
            </div>

            {activeReport === 'mostUsedVacuumPads' ? (
              <>
                <div className="reportFilters">
                  <label className="field">
                    <span>Από ημερομηνία</span>
                    <input
                      type="date"
                      value={filters.dateFrom}
                      onChange={(event) =>
                        updateFilter('dateFrom', event.target.value)
                      }
                    />
                  </label>
                  <label className="field">
                    <span>Έως ημερομηνία</span>
                    <input
                      type="date"
                      value={filters.dateTo}
                      onChange={(event) =>
                        updateFilter('dateTo', event.target.value)
                      }
                    />
                  </label>
                  <ExcelMultiSelectFilter
                    label="Vacuum Pad"
                    values={filters.vacuum}
                    onChange={(value) => updateFilter('vacuum', value)}
                    options={reportVacuumOptions}
                    loading={adminData.loading}
                    error={adminData.error}
                    placeholder="Serial ή code"
                    getValue={(item) =>
                      textValue(item.serialNumber) || textValue(item.code)
                    }
                    getPrimaryText={vacuumPrimaryText}
                    getSecondaryText={vacuumSecondaryText}
                    getBadge={vacuumBadge}
                  />
                </div>

                <div className="movementActionRow">
                  <ButtonRow>
                    <button
                      type="button"
                      className="primary"
                      disabled={loading}
                      onClick={() => void refreshMostUsedReport()}
                    >
                      {loading ? 'Αναζήτηση...' : 'Αναζήτηση'}
                    </button>
                    <button
                      type="button"
                      className="ghost"
                      disabled={loading}
                      onClick={clearReportFilters}
                    >
                      Καθαρισμός
                    </button>
                  </ButtonRow>
                  <div className="exportControls">
                    <label className="pageSizeField">
                      <span>Μετρική chart</span>
                      <select
                        value={chartMetric}
                        onChange={(event) =>
                          setChartMetric(event.target.value as MostUsedChartMetric)
                        }
                      >
                        {mostUsedMetricOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      type="button"
                      className="ghost compactButton"
                      disabled={rows.length === 0}
                      onClick={exportMostUsedReportCsv}
                    >
                      Εξαγωγή CSV
                    </button>
                  </div>
                </div>

                {loading ? (
                  <Notice tone="info">Φόρτωση αναφοράς...</Notice>
                ) : null}
                <ResponsePanel payload={null} error={error} />

                {!hasSearched ? (
                  <Notice tone="info">
                    Επιλέξτε φίλτρα ή πατήστε Αναζήτηση για συνολικά αποτελέσματα.
                  </Notice>
                ) : rows.length === 0 ? (
                  <Notice tone="warning">
                    Δεν βρέθηκαν Vacuum Pads για τα τρέχοντα φίλτρα.
                  </Notice>
                ) : (
                  <>
                    <div className="reportPolicyNote">
                      <strong>Πολιτική υπολογισμού:</strong> Οι ανοιχτές χρεώσεις
                      μετρούν χρήση μέχρι τώρα ή μέχρι το Έως ημερομηνία.
                      Το downtime μετρά μόνο κλειστά διαστήματα αποχρέωσης έως
                      την επόμενη χρέωση.
                    </div>
                    <MostUsedBarChart rows={chartRows} metric={chartMetric} />
                    <div className="paginationBar">
                      <span>Σύνολο αποτελεσμάτων: {total}</span>
                    </div>
                    <div className="excelTableWrap">
                      <table className="excelTable">
                        <thead>
                          <tr>
                            <th>Rank</th>
                            <th>Κωδικός</th>
                            <th>Vacuum Pad</th>
                            <th>Χρεώσεις</th>
                            <th>Ώρες Χρήσης</th>
                            <th>Downtime</th>
                            <th>Μέσος Χρόνος Παραμονής στο Μηχάνημα</th>
                            <th>Τελευταία Χρήση</th>
                            <th>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((row) => (
                            <tr key={textValue(row.id)}>
                              <td>{numberValue(row.rank) ?? '-'}</td>
                              <td className="nowrapCell codeCell">
                                {textValue(row.code)}
                              </td>
                              <td>{mostUsedVacuumText(row)}</td>
                              <td>{numberValue(row.chargeCount) ?? 0}</td>
                              <td>{formatHours(row.usageHours)}</td>
                              <td>{formatHours(row.downtimeHours)}</td>
                              <td>{formatHours(row.averageMachineStayHours)}</td>
                              <td>
                                {formatDateTime(textValue(row.lastUsageAt)) || '-'}
                              </td>
                              <td>{reportStatusLabel(textValue(row.status))}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </>
            ) : activeReport === 'mostFaultyVacuumPads' ? (
              <FaultyVacuumPadsReport api={api} adminData={adminData} />
            ) : activeReport === 'machinesCausingFaults' ? (
              <MachineFaultReport api={api} adminData={adminData} />
            ) : activeReport === 'mostFrequentFaults' ? (
              <MostFrequentFaultsReport api={api} adminData={adminData} />
            ) : activeReport === 'realVacuumLocation' ? (
              <VacuumLocationReport api={api} adminData={adminData} />
            ) : (
              <Notice tone="info">
                Η αναφορά θα υλοποιηθεί σε επόμενο στάδιο.
              </Notice>
            )}
          </div>
        </div>
      </OperationCard>
    </div>
  );
}

function MostUsedBarChart({
  rows,
  metric,
}: {
  rows: DataItem[];
  metric: MostUsedChartMetric;
}) {
  const metricLabel =
    mostUsedMetricOptions.find((option) => option.value === metric)?.label ??
    'Μετρική';
  const maxValue = Math.max(
    0,
    ...rows.map((row) => numberValue(row[metric]) ?? 0),
  );

  return (
    <div className="reportChartCard">
      <div className="reportChartHeader">
        <div>
          <h4>Top 20 Vacuum Pads</h4>
          <p>{metricLabel}</p>
        </div>
      </div>
      <div className="barChart" aria-label={`Chart ${metricLabel}`}>
        {rows.map((row) => {
          const value = numberValue(row[metric]) ?? 0;
          const width = maxValue > 0 ? Math.max(4, (value / maxValue) * 100) : 0;

          return (
            <div key={textValue(row.id)} className="barChartRow">
              <span className="barChartLabel">{textValue(row.code)}</span>
              <span className="barTrack">
                <span className="barFill" style={{ width: `${width}%` }} />
              </span>
              <strong>{formatReportMetric(value, metric)}</strong>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FaultyVacuumPadsReport({
  api,
  adminData,
}: {
  api: AdminApiClient;
  adminData: AdminDataHook;
}) {
  const [filters, setFilters] = useState<FaultyReportFilters>(
    emptyFaultyReportFilters,
  );
  const [chartMetric, setChartMetric] =
    useState<FaultyChartMetric>('totalFaults');
  const [payload, setPayload] = useState<ApiPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ApiPayload | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const reportFaultOptions = useMemo<DataItem[]>(
    () => [
      ...adminData.data.faultCatalog,
      {
        id: 'OTHER',
        code: 'OTHER',
        label: 'Άλλο',
        description: 'Custom / other fault text',
      },
    ],
    [adminData.data.faultCatalog],
  );
  const rows = payload ? arrayItems(payload) : [];
  const chartRows = [...rows]
    .sort(
      (first, second) =>
        (numberValue(second[chartMetric]) ?? 0) -
          (numberValue(first[chartMetric]) ?? 0) ||
        textValue(first.code).localeCompare(textValue(second.code)),
    )
    .slice(0, 20);
  const total = numberValue(payload?.total) ?? rows.length;
  const monthlyTrend = faultyReportMonthlyTrend(payload);

  const refreshFaultyReport = useCallback(
    async (options: { silent?: boolean } = {}) => {
      if (!options.silent) {
        setLoading(true);
      }
      setError(null);

      try {
        const result = await api.getFaultyVacuumPadsReport(
          cleanFaultyReportFilters(filters),
        );
        setPayload(result);
        setHasSearched(true);
        setLastUpdatedAt(new Date());
      } catch (caught) {
        setError(errorPayload(caught));
      } finally {
        if (!options.silent) {
          setLoading(false);
        }
      }
    },
    [api, filters],
  );
  const refreshRef = useRef(refreshFaultyReport);

  useEffect(() => {
    refreshRef.current = refreshFaultyReport;
  }, [refreshFaultyReport]);

  useEffect(() => {
    if (adminData.lastEventAt && hasSearched) {
      void refreshRef.current({ silent: true });
    }
  }, [adminData.lastEventAt, hasSearched]);

  function updateFilter<K extends keyof FaultyReportFilters>(
    key: K,
    value: FaultyReportFilters[K],
  ) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  function clearReportFilters() {
    setFilters(emptyFaultyReportFilters);
    setPayload(null);
    setError(null);
    setHasSearched(false);
    setLastUpdatedAt(null);
  }

  function exportFaultyReportCsv() {
    if (rows.length === 0) {
      return;
    }

    downloadTextFile(
      buildFaultyReportCsv(rows),
      faultyReportFilename(),
      'text/csv;charset=utf-8',
    );
  }

  return (
    <>
      <div className="reportFilters">
        <label className="field">
          <span>Από ημερομηνία</span>
          <input
            type="date"
            value={filters.dateFrom}
            onChange={(event) => updateFilter('dateFrom', event.target.value)}
          />
        </label>
        <label className="field">
          <span>Έως ημερομηνία</span>
          <input
            type="date"
            value={filters.dateTo}
            onChange={(event) => updateFilter('dateTo', event.target.value)}
          />
        </label>
        <ExcelMultiSelectFilter
          label="Vacuum Pad"
          values={filters.vacuum}
          onChange={(value) => updateFilter('vacuum', value)}
          options={adminData.data.vacuumPads}
          loading={adminData.loading}
          error={adminData.error}
          placeholder="Serial ή code"
          getValue={(item) => textValue(item.serialNumber) || textValue(item.code)}
          getPrimaryText={vacuumPrimaryText}
          getSecondaryText={vacuumSecondaryText}
          getBadge={vacuumBadge}
        />
        <ExcelMultiSelectFilter
          label="Τύπος Βλάβης"
          values={filters.fault}
          onChange={(value) => updateFilter('fault', value)}
          options={reportFaultOptions}
          loading={adminData.loading}
          error={adminData.error}
          placeholder="FC-001 ή Άλλο"
          getValue={(item) => textValue(item.code)}
          getPrimaryText={faultPrimaryText}
          getSecondaryText={faultSecondaryText}
          getBadge={faultBadge}
        />
      </div>

      <div className="movementActionRow">
        <ButtonRow>
          <button
            type="button"
            className="primary"
            disabled={loading}
            onClick={() => void refreshFaultyReport()}
          >
            {loading ? 'Αναζήτηση...' : 'Αναζήτηση'}
          </button>
          <button
            type="button"
            className="ghost"
            disabled={loading}
            onClick={clearReportFilters}
          >
            Καθαρισμός
          </button>
        </ButtonRow>
        <div className="exportControls">
          <label className="pageSizeField">
            <span>Μετρική chart</span>
            <select
              value={chartMetric}
              onChange={(event) =>
                setChartMetric(event.target.value as FaultyChartMetric)
              }
            >
              {faultyMetricOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="ghost compactButton"
            disabled={rows.length === 0}
            onClick={exportFaultyReportCsv}
          >
            Εξαγωγή CSV
          </button>
        </div>
      </div>

      <div className="liveRefreshPanel compactLivePanel reportInlineStatus">
        <span className="smallText">
          Τελευταία ενημέρωση:{' '}
          {lastUpdatedAt ? formatTime(lastUpdatedAt) : 'αναμονή'}
        </span>
      </div>

      {loading ? <Notice tone="info">Φόρτωση αναφοράς...</Notice> : null}
      <ResponsePanel payload={null} error={error} />

      {!hasSearched ? (
        <Notice tone="info">
          Επιλέξτε φίλτρα ή πατήστε Αναζήτηση για συνολικά αποτελέσματα.
        </Notice>
      ) : rows.length === 0 ? (
        <Notice tone="warning">
          Δεν βρέθηκαν Vacuum Pads για τα τρέχοντα φίλτρα.
        </Notice>
      ) : (
        <>
          <div className="reportPolicyNote">
            <strong>Πολιτική υπολογισμού:</strong> Οι βλάβες μετρούν Repair
            εγγραφές, μαζί με catalog και custom “Άλλο” βλάβες. Οι ανοιχτές
            επισκευές μετρούν διάρκεια μέχρι τώρα ή μέχρι το Έως ημερομηνία.
            Το downtime λόγω βλάβης ισούται με τη repair-state διάρκεια σε αυτό
            το milestone.
          </div>
          <div className="reportChartGrid">
            <FaultyBarChart rows={chartRows} metric={chartMetric} />
            <FaultyDonutChart rows={rows} />
            <FaultTrendLineChart rows={monthlyTrend} />
          </div>
          <div className="paginationBar">
            <span>Σύνολο αποτελεσμάτων: {total}</span>
          </div>
          <div className="excelTableWrap">
            <table className="excelTable">
              <thead>
                <tr>
                  <th>Rank</th>
                  <th>Κωδικός</th>
                  <th>Vacuum Pad</th>
                  <th>Συνολικές Βλάβες</th>
                  <th>Διαφορετικές Βλάβες</th>
                  <th>Επισκευές</th>
                  <th>Ώρες Επισκευής</th>
                  <th>Downtime λόγω Βλάβης</th>
                  <th>Μέσος Χρόνος Επισκευής</th>
                  <th>Τελευταία Βλάβη</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={textValue(row.id)}>
                    <td>{numberValue(row.rank) ?? '-'}</td>
                    <td className="nowrapCell codeCell">{textValue(row.code)}</td>
                    <td>{mostUsedVacuumText(row)}</td>
                    <td>{numberValue(row.totalFaults) ?? 0}</td>
                    <td>{numberValue(row.distinctFaultTypes) ?? 0}</td>
                    <td>{numberValue(row.repairCount) ?? 0}</td>
                    <td>{formatHours(row.repairHours)}</td>
                    <td>{formatHours(row.faultDowntimeHours)}</td>
                    <td>{formatHours(row.averageRepairHours)}</td>
                    <td>{formatDateTime(textValue(row.lastFaultAt)) || '-'}</td>
                    <td>{reportStatusLabel(textValue(row.status))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}

function MachineFaultReport({
  api,
  adminData,
}: {
  api: AdminApiClient;
  adminData: AdminDataHook;
}) {
  const [filters, setFilters] = useState<MachineFaultReportFilters>(
    emptyMachineFaultReportFilters,
  );
  const [chartMetric, setChartMetric] =
    useState<MachineFaultChartMetric>('totalFaults');
  const [payload, setPayload] = useState<ApiPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ApiPayload | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const reportFaultOptions = useMemo<DataItem[]>(
    () => [
      ...adminData.data.faultCatalog,
      {
        id: 'OTHER',
        code: 'OTHER',
        label: 'Άλλο',
        description: 'Custom / other fault text',
      },
    ],
    [adminData.data.faultCatalog],
  );
  const rows = payload ? arrayItems(payload) : [];
  const chartRows = [...rows]
    .sort(
      (first, second) =>
        (numberValue(second[chartMetric]) ?? 0) -
          (numberValue(first[chartMetric]) ?? 0) ||
        textValue(first.machineCode).localeCompare(textValue(second.machineCode)),
    )
    .slice(0, 20);
  const total = numberValue(payload?.total) ?? rows.length;
  const monthlyTrend = faultyReportMonthlyTrend(payload);
  const machineFaultTotals = objectValue(objectValue(payload?.chart)?.totals);

  const refreshMachineFaultReport = useCallback(
    async (options: { silent?: boolean } = {}) => {
      if (!options.silent) {
        setLoading(true);
      }
      setError(null);

      try {
        const result = await api.getMachinesCausingFaultsReport(
          cleanMachineFaultReportFilters(filters),
        );
        setPayload(result);
        setHasSearched(true);
        setLastUpdatedAt(new Date());
      } catch (caught) {
        setError(errorPayload(caught));
      } finally {
        if (!options.silent) {
          setLoading(false);
        }
      }
    },
    [api, filters],
  );
  const refreshRef = useRef(refreshMachineFaultReport);

  useEffect(() => {
    refreshRef.current = refreshMachineFaultReport;
  }, [refreshMachineFaultReport]);

  useEffect(() => {
    if (adminData.lastEventAt && hasSearched) {
      void refreshRef.current({ silent: true });
    }
  }, [adminData.lastEventAt, hasSearched]);

  function updateFilter<K extends keyof MachineFaultReportFilters>(
    key: K,
    value: MachineFaultReportFilters[K],
  ) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  function clearReportFilters() {
    setFilters(emptyMachineFaultReportFilters);
    setPayload(null);
    setError(null);
    setHasSearched(false);
    setLastUpdatedAt(null);
  }

  function exportMachineFaultReportCsv() {
    if (rows.length === 0) {
      return;
    }

    downloadTextFile(
      buildMachineFaultReportCsv(rows),
      machineFaultReportFilename(),
      'text/csv;charset=utf-8',
    );
  }

  return (
    <>
      <div className="reportFilters">
        <label className="field">
          <span>Από ημερομηνία</span>
          <input
            type="date"
            value={filters.dateFrom}
            onChange={(event) => updateFilter('dateFrom', event.target.value)}
          />
        </label>
        <label className="field">
          <span>Έως ημερομηνία</span>
          <input
            type="date"
            value={filters.dateTo}
            onChange={(event) => updateFilter('dateTo', event.target.value)}
          />
        </label>
        <ExcelMultiSelectFilter
          label="Μηχάνημα"
          values={filters.machine}
          onChange={(value) => updateFilter('machine', value)}
          options={adminData.data.machines}
          loading={adminData.loading}
          error={adminData.error}
          placeholder="MACH-001 ή όνομα"
          getValue={(item) => textValue(item.code)}
          getPrimaryText={machinePrimaryText}
          getSecondaryText={machineSecondaryText}
          getBadge={machineBadge}
        />
        <ExcelMultiSelectFilter
          label="Τύπος Βλάβης"
          values={filters.fault}
          onChange={(value) => updateFilter('fault', value)}
          options={reportFaultOptions}
          loading={adminData.loading}
          error={adminData.error}
          placeholder="FC-001 ή Άλλο"
          getValue={(item) => textValue(item.code)}
          getPrimaryText={faultPrimaryText}
          getSecondaryText={faultSecondaryText}
          getBadge={faultBadge}
        />
      </div>

      <div className="movementActionRow">
        <ButtonRow>
          <button
            type="button"
            className="primary"
            disabled={loading}
            onClick={() => void refreshMachineFaultReport()}
          >
            {loading ? 'Αναζήτηση...' : 'Αναζήτηση'}
          </button>
          <button
            type="button"
            className="ghost"
            disabled={loading}
            onClick={clearReportFilters}
          >
            Καθαρισμός
          </button>
        </ButtonRow>
        <div className="exportControls">
          <label className="pageSizeField">
            <span>Μετρική chart</span>
            <select
              value={chartMetric}
              onChange={(event) =>
                setChartMetric(event.target.value as MachineFaultChartMetric)
              }
            >
              {machineFaultMetricOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="ghost compactButton"
            disabled={rows.length === 0}
            onClick={exportMachineFaultReportCsv}
          >
            Εξαγωγή CSV
          </button>
        </div>
      </div>

      <div className="liveRefreshPanel compactLivePanel reportInlineStatus">
        <span className="smallText">
          Τελευταία ενημέρωση:{' '}
          {lastUpdatedAt ? formatTime(lastUpdatedAt) : 'αναμονή'}
        </span>
      </div>

      {loading ? <Notice tone="info">Φόρτωση αναφοράς...</Notice> : null}
      <ResponsePanel payload={null} error={error} />

      {!hasSearched ? (
        <Notice tone="info">
          Επιλέξτε φίλτρα ή πατήστε Αναζήτηση για συνολικά αποτελέσματα.
        </Notice>
      ) : rows.length === 0 ? (
        <Notice tone="warning">
          Δεν βρέθηκαν μηχανήματα για τα τρέχοντα φίλτρα.
        </Notice>
      ) : (
        <>
          <div className="reportPolicyNote">
            <strong>Πολιτική απόδοσης βλάβης:</strong>{' '}
            {textValue(payload?.note) ||
              'Εκτίμηση βάσει τελευταίας χρέωσης Vacuum Pad πριν τη δήλωση βλάβης.'}
          </div>
          <div className="reportChartGrid">
            <MachineFaultBarChart rows={chartRows} metric={chartMetric} />
            <MachineFaultDonutChart rows={rows} />
            <FaultTrendLineChart rows={monthlyTrend} />
          </div>
          <MachineFaultTopTenTable rows={rows} />
          <div className="paginationBar">
            <span>Σύνολο αποτελεσμάτων: {total}</span>
            <span className="smallText">
              Χωρίς απόδοση σε μηχάνημα:{' '}
              {numberValue(machineFaultTotals?.unattributedFaults) ?? 0}
            </span>
          </div>
          <div className="excelTableWrap">
            <table className="excelTable">
              <thead>
                <tr>
                  <th>Θέση</th>
                  <th>Κωδικός Μηχανήματος</th>
                  <th>Μηχάνημα</th>
                  <th>Συνολικές Βλάβες</th>
                  <th>Vacuum Pads με Βλάβες</th>
                  <th>Διαφορετικοί Τύποι Βλαβών</th>
                  <th>Αποστολές για Επισκευή</th>
                  <th>Downtime</th>
                  <th>Μέσος Όρος Βλαβών ανά Vacuum Pad</th>
                  <th>Συχνότερη Βλάβη</th>
                  <th>Τελευταία Βλάβη</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={textValue(row.id)}>
                    <td>{numberValue(row.rank) ?? '-'}</td>
                    <td className="nowrapCell codeCell">
                      {textValue(row.machineCode)}
                    </td>
                    <td>{textValue(row.machineName) || '-'}</td>
                    <td>{numberValue(row.totalFaults) ?? 0}</td>
                    <td>{numberValue(row.affectedVacuumPads) ?? 0}</td>
                    <td>{numberValue(row.distinctFaultTypes) ?? 0}</td>
                    <td>{numberValue(row.repairDispatches) ?? 0}</td>
                    <td>{formatHours(row.downtimeHours)}</td>
                    <td>{formatHours(row.averageFaultsPerVacuum)}</td>
                    <td>{textValue(row.mostCommonFault) || '-'}</td>
                    <td>{formatDateTime(textValue(row.lastFaultAt)) || '-'}</td>
                    <td>{textValue(row.status) || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}

function MostFrequentFaultsReport({
  api,
  adminData,
}: {
  api: AdminApiClient;
  adminData: AdminDataHook;
}) {
  const [filters, setFilters] = useState<MostFrequentFaultFilters>(
    emptyMostFrequentFaultFilters,
  );
  const [chartMetric, setChartMetric] =
    useState<MostFrequentFaultChartMetric>('totalOccurrences');
  const [payload, setPayload] = useState<ApiPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ApiPayload | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const reportFaultOptions = useMemo<DataItem[]>(
    () => [
      ...adminData.data.faultCatalog,
      {
        id: 'OTHER',
        code: 'OTHER',
        label: 'Άλλο',
        description: 'Custom / other fault text',
      },
    ],
    [adminData.data.faultCatalog],
  );
  const rows = payload ? arrayItems(payload) : [];
  const chartRows = [...rows]
    .sort(
      (first, second) =>
        (numberValue(second[chartMetric]) ?? 0) -
          (numberValue(first[chartMetric]) ?? 0) ||
        textValue(first.faultCode).localeCompare(textValue(second.faultCode)),
    )
    .slice(0, 20);
  const total = numberValue(payload?.total) ?? rows.length;
  const monthlyTrend = faultyReportMonthlyTrend(payload);
  const paretoRows = mostFrequentFaultParetoRows(payload);
  const reportTotals = objectValue(objectValue(payload?.chart)?.totals);

  const refreshMostFrequentFaultsReport = useCallback(
    async (options: { silent?: boolean } = {}) => {
      if (!options.silent) {
        setLoading(true);
      }
      setError(null);

      try {
        const result = await api.getMostFrequentFaultsReport(
          cleanMostFrequentFaultFilters(filters),
        );
        setPayload(result);
        setHasSearched(true);
        setLastUpdatedAt(new Date());
      } catch (caught) {
        setError(errorPayload(caught));
      } finally {
        if (!options.silent) {
          setLoading(false);
        }
      }
    },
    [api, filters],
  );
  const refreshRef = useRef(refreshMostFrequentFaultsReport);

  useEffect(() => {
    refreshRef.current = refreshMostFrequentFaultsReport;
  }, [refreshMostFrequentFaultsReport]);

  useEffect(() => {
    if (adminData.lastEventAt && hasSearched) {
      void refreshRef.current({ silent: true });
    }
  }, [adminData.lastEventAt, hasSearched]);

  function updateFilter<K extends keyof MostFrequentFaultFilters>(
    key: K,
    value: MostFrequentFaultFilters[K],
  ) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  function clearReportFilters() {
    setFilters(emptyMostFrequentFaultFilters);
    setPayload(null);
    setError(null);
    setHasSearched(false);
    setLastUpdatedAt(null);
  }

  function exportMostFrequentFaultsCsv() {
    if (rows.length === 0) {
      return;
    }

    downloadTextFile(
      buildMostFrequentFaultsReportCsv(rows),
      mostFrequentFaultsReportFilename(),
      'text/csv;charset=utf-8',
    );
  }

  return (
    <>
      <div className="reportFilters">
        <label className="field">
          <span>Από ημερομηνία</span>
          <input
            type="date"
            value={filters.dateFrom}
            onChange={(event) => updateFilter('dateFrom', event.target.value)}
          />
        </label>
        <label className="field">
          <span>Έως ημερομηνία</span>
          <input
            type="date"
            value={filters.dateTo}
            onChange={(event) => updateFilter('dateTo', event.target.value)}
          />
        </label>
        <ExcelMultiSelectFilter
          label="Τύπος Βλάβης"
          values={filters.fault}
          onChange={(value) => updateFilter('fault', value)}
          options={reportFaultOptions}
          loading={adminData.loading}
          error={adminData.error}
          placeholder="FC-001 ή Άλλο"
          getValue={(item) => textValue(item.code)}
          getPrimaryText={faultPrimaryText}
          getSecondaryText={faultSecondaryText}
          getBadge={faultBadge}
        />
        <ExcelMultiSelectFilter
          label="Vacuum Pad"
          values={filters.vacuum}
          onChange={(value) => updateFilter('vacuum', value)}
          options={adminData.data.vacuumPads}
          loading={adminData.loading}
          error={adminData.error}
          placeholder="Serial ή code"
          getValue={(item) => textValue(item.serialNumber) || textValue(item.code)}
          getPrimaryText={vacuumPrimaryText}
          getSecondaryText={vacuumSecondaryText}
          getBadge={vacuumBadge}
        />
        <ExcelMultiSelectFilter
          label="Μηχάνημα"
          values={filters.machine}
          onChange={(value) => updateFilter('machine', value)}
          options={adminData.data.machines}
          loading={adminData.loading}
          error={adminData.error}
          placeholder="MACH-001 ή όνομα"
          getValue={(item) => textValue(item.code)}
          getPrimaryText={machinePrimaryText}
          getSecondaryText={machineSecondaryText}
          getBadge={machineBadge}
        />
      </div>

      <div className="movementActionRow">
        <ButtonRow>
          <button
            type="button"
            className="primary"
            disabled={loading}
            onClick={() => void refreshMostFrequentFaultsReport()}
          >
            {loading ? 'Αναζήτηση...' : 'Αναζήτηση'}
          </button>
          <button
            type="button"
            className="ghost"
            disabled={loading}
            onClick={clearReportFilters}
          >
            Καθαρισμός
          </button>
        </ButtonRow>
        <div className="exportControls">
          <label className="pageSizeField">
            <span>Μετρική chart</span>
            <select
              value={chartMetric}
              onChange={(event) =>
                setChartMetric(
                  event.target.value as MostFrequentFaultChartMetric,
                )
              }
            >
              {mostFrequentFaultMetricOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="ghost compactButton"
            disabled={rows.length === 0}
            onClick={exportMostFrequentFaultsCsv}
          >
            Εξαγωγή CSV
          </button>
        </div>
      </div>

      <div className="liveRefreshPanel compactLivePanel reportInlineStatus">
        <span className="smallText">
          Τελευταία ενημέρωση:{' '}
          {lastUpdatedAt ? formatTime(lastUpdatedAt) : 'αναμονή'}
        </span>
      </div>

      {loading ? <Notice tone="info">Φόρτωση αναφοράς...</Notice> : null}
      <ResponsePanel payload={null} error={error} />

      {!hasSearched ? (
        <Notice tone="info">
          Επιλέξτε φίλτρα ή πατήστε Αναζήτηση για συνολικά αποτελέσματα.
        </Notice>
      ) : rows.length === 0 ? (
        <Notice tone="warning">
          Δεν βρέθηκαν βλάβες για τα τρέχοντα φίλτρα.
        </Notice>
      ) : (
        <>
          <div className="reportPolicyNote">
            <strong>Πολιτική απόδοσης μηχανήματος:</strong>{' '}
            {textValue(payload?.note) ||
              'Εκτίμηση βάσει τελευταίας χρέωσης Vacuum Pad πριν τη δήλωση βλάβης.'}{' '}
            Οι custom βλάβες ομαδοποιούνται ως OTHER / Άλλο. Οι αντικαταστάσεις
            εμφανίζονται 0 επειδή δεν υπάρχει explicit replacement outcome στο
            τρέχον μοντέλο.
          </div>
          <div className="reportChartGrid">
            <MostFrequentFaultBarChart rows={chartRows} metric={chartMetric} />
            <MostFrequentFaultDonutChart rows={rows} />
            <FaultTrendLineChart rows={monthlyTrend} />
          </div>
          <MostFrequentFaultTopThree rows={rows} />
          <MostFrequentFaultParetoTable rows={paretoRows} />
          <div className="paginationBar">
            <span>Σύνολο αποτελεσμάτων: {total}</span>
            <span className="smallText">
              Σύνολο καταγραφών:{' '}
              {numberValue(reportTotals?.totalOccurrences) ?? 0} · Downtime:{' '}
              {formatHours(reportTotals?.totalDowntimeHours)} · Χωρίς
              μηχάνημα: {numberValue(reportTotals?.unattributedFaults) ?? 0}
            </span>
          </div>
          <div className="excelTableWrap">
            <table className="excelTable">
              <thead>
                <tr>
                  <th>Θέση</th>
                  <th>Τύπος Βλάβης</th>
                  <th>Συνολικές Καταγραφές</th>
                  <th>Διαφορετικά Vacuum Pads</th>
                  <th>Διαφορετικά Μηχανήματα</th>
                  <th>Επισκευές</th>
                  <th>Αντικαταστάσεις</th>
                  <th>Downtime</th>
                  <th>Μέσος Χρόνος Αποκατάστασης</th>
                  <th>Vacuum Pad με τις Περισσότερες Εμφανίσεις</th>
                  <th>Μηχάνημα με τις Περισσότερες Εμφανίσεις</th>
                  <th>Τελευταία Καταγραφή</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={textValue(row.faultCode)}>
                    <td>{numberValue(row.rank) ?? '-'}</td>
                    <td>{faultFrequencyFaultText(row)}</td>
                    <td>{numberValue(row.totalOccurrences) ?? 0}</td>
                    <td>{numberValue(row.distinctVacuumPads) ?? 0}</td>
                    <td>{numberValue(row.distinctMachines) ?? 0}</td>
                    <td>{numberValue(row.repairs) ?? 0}</td>
                    <td>{numberValue(row.replacements) ?? 0}</td>
                    <td>{formatHours(row.downtimeHours)}</td>
                    <td>{formatHours(row.averageRestorationHours)}</td>
                    <td>{textValue(row.topVacuumPad) || '-'}</td>
                    <td>{textValue(row.topMachine) || '-'}</td>
                    <td>
                      {formatDateTime(textValue(row.lastOccurredAt)) || '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}

function VacuumLocationReport({
  api,
  adminData,
}: {
  api: AdminApiClient;
  adminData: AdminDataHook;
}) {
  const [filters, setFilters] = useState<VacuumLocationReportFilters>(
    emptyVacuumLocationReportFilters,
  );
  const [payload, setPayload] = useState<ApiPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ApiPayload | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const rows = payload ? arrayItems(payload) : [];
  const total = numberValue(payload?.total) ?? rows.length;
  const summary = objectValue(payload?.summary);
  const categoryCounts = vacuumLocationCategoryCounts(payload);

  const refreshVacuumLocationReport = useCallback(
    async (options: { silent?: boolean } = {}) => {
      if (!options.silent) {
        setLoading(true);
      }
      setError(null);

      try {
        const result = await api.getVacuumPadLocationReport(
          cleanVacuumLocationReportFilters(filters),
        );
        setPayload(result);
        setHasSearched(true);
        setLastUpdatedAt(new Date());
      } catch (caught) {
        setError(errorPayload(caught));
      } finally {
        if (!options.silent) {
          setLoading(false);
        }
      }
    },
    [api, filters],
  );
  const refreshRef = useRef(refreshVacuumLocationReport);

  useEffect(() => {
    refreshRef.current = refreshVacuumLocationReport;
  }, [refreshVacuumLocationReport]);

  useEffect(() => {
    if (adminData.lastEventAt && hasSearched) {
      void refreshRef.current({ silent: true });
    }
  }, [adminData.lastEventAt, hasSearched]);

  function updateFilter<K extends keyof VacuumLocationReportFilters>(
    key: K,
    value: VacuumLocationReportFilters[K],
  ) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  function clearReportFilters() {
    setFilters(emptyVacuumLocationReportFilters);
    setPayload(null);
    setError(null);
    setHasSearched(false);
    setLastUpdatedAt(null);
  }

  function exportVacuumLocationCsv() {
    if (rows.length === 0) {
      return;
    }

    downloadTextFile(
      buildVacuumLocationReportCsv(rows),
      vacuumLocationReportFilename(),
      'text/csv;charset=utf-8',
    );
  }

  return (
    <>
      <div className="reportFilters">
        <ExcelMultiSelectFilter
          label="Vacuum Pad"
          values={filters.vacuum}
          onChange={(value) => updateFilter('vacuum', value)}
          options={adminData.data.vacuumPads}
          loading={adminData.loading}
          error={adminData.error}
          placeholder="Serial ή code"
          getValue={(item) => textValue(item.serialNumber) || textValue(item.code)}
          getPrimaryText={vacuumPrimaryText}
          getSecondaryText={vacuumSecondaryText}
          getBadge={vacuumBadge}
        />
        <ExcelMultiSelectFilter
          label="Status"
          values={filters.status}
          onChange={(value) => updateFilter('status', value)}
          options={vacuumLocationStatusOptions}
          placeholder="Κατηγορία ή status"
          getValue={(item) => textValue(item.code)}
          getPrimaryText={(item) => textValue(item.label) || textValue(item.code)}
          getSecondaryText={(item) => textValue(item.description)}
          getBadge={(item) => ({
            label: textValue(item.code),
            tone: textValue(item.code) === 'MISSING_SERIAL' ? 'danger' : 'info',
          })}
        />
        <ExcelMultiSelectFilter
          label="Θέση / Rack"
          values={filters.rack}
          onChange={(value) => updateFilter('rack', value)}
          options={adminData.data.racks}
          loading={adminData.loading}
          error={adminData.error}
          placeholder="RACK-A-01-01"
          getValue={(item) => textValue(item.code)}
          getPrimaryText={rackPrimaryText}
          getSecondaryText={rackSecondaryText}
          getBadge={rackBadge}
        />
        <ExcelMultiSelectFilter
          label="Μηχάνημα"
          values={filters.machine}
          onChange={(value) => updateFilter('machine', value)}
          options={adminData.data.machines}
          loading={adminData.loading}
          error={adminData.error}
          placeholder="MACH-001 ή όνομα"
          getValue={(item) => textValue(item.code)}
          getPrimaryText={machinePrimaryText}
          getSecondaryText={machineSecondaryText}
          getBadge={machineBadge}
        />
        <label className="field checkboxField">
          <span>Μόνο λείπει serial</span>
          <input
            type="checkbox"
            checked={filters.missingSerial}
            onChange={(event) =>
              updateFilter('missingSerial', event.target.checked)
            }
          />
        </label>
        <label className="field checkboxField">
          <span>Μόνο άγνωστη θέση</span>
          <input
            type="checkbox"
            checked={filters.unknownLocation}
            onChange={(event) =>
              updateFilter('unknownLocation', event.target.checked)
            }
          />
        </label>
      </div>

      <div className="movementActionRow">
        <ButtonRow>
          <button
            type="button"
            className="primary"
            disabled={loading}
            onClick={() => void refreshVacuumLocationReport()}
          >
            {loading ? 'Αναζήτηση...' : 'Αναζήτηση'}
          </button>
          <button
            type="button"
            className="ghost"
            disabled={loading}
            onClick={clearReportFilters}
          >
            Καθαρισμός
          </button>
        </ButtonRow>
        <div className="exportControls">
          <button
            type="button"
            className="ghost compactButton"
            disabled={rows.length === 0}
            onClick={exportVacuumLocationCsv}
          >
            Εξαγωγή CSV
          </button>
        </div>
      </div>

      <div className="liveRefreshPanel compactLivePanel reportInlineStatus">
        <span className="smallText">
          Τελευταία ενημέρωση:{' '}
          {lastUpdatedAt ? formatTime(lastUpdatedAt) : 'αναμονή'}
        </span>
      </div>

      {loading ? <Notice tone="info">Φόρτωση αναφοράς...</Notice> : null}
      <ResponsePanel payload={null} error={error} />

      {!hasSearched ? (
        <Notice tone="info">
          Επιλέξτε φίλτρα ή πατήστε Αναζήτηση για συνολική εικόνα θέσης.
        </Notice>
      ) : rows.length === 0 ? (
        <Notice tone="warning">
          Δεν βρέθηκαν Vacuum Pads για τα τρέχοντα φίλτρα.
        </Notice>
      ) : (
        <>
          <div className="reportPolicyNote">
            <strong>Πολιτική θέσης:</strong> Τα Vacuum χωρίς serialNumber
            εμφανίζονται ως Λείπει serial. Τα Vacuum σε επισκευή εντοπίζονται
            από IN_REPAIR, UNDER_REPAIR ή ανοιχτή επισκευή. Άγνωστη θέση
            σημαίνει ότι δεν υπάρχει μηχάνημα, rack ή repair state.
          </div>
          <VacuumLocationSummaryCards summary={summary} />
          <div className="reportChartGrid">
            <VacuumLocationDonutChart rows={categoryCounts} />
            <VacuumLocationBarChart rows={categoryCounts} />
          </div>
          <div className="paginationBar">
            <span>Σύνολο αποτελεσμάτων: {total}</span>
          </div>
          <div className="excelTableWrap">
            <table className="excelTable">
              <thead>
                <tr>
                  <th>Κωδικός</th>
                  <th>Vacuum Pad / Serial</th>
                  <th>Κατηγορία Θέσης</th>
                  <th>Τρέχουσα Θέση</th>
                  <th>Μηχάνημα</th>
                  <th>Rack</th>
                  <th>Operational Status</th>
                  <th>Location Status</th>
                  <th>Τελευταία Μετακίνηση</th>
                  <th>Updated At</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={textValue(row.id)}>
                    <td className="nowrapCell codeCell">{textValue(row.code)}</td>
                    <td>{mostUsedVacuumText(row)}</td>
                    <td>{textValue(row.locationCategoryLabel)}</td>
                    <td>{textValue(row.currentPlace) || '-'}</td>
                    <td>{vacuumLocationMachineText(row)}</td>
                    <td>{vacuumLocationRackText(row)}</td>
                    <td>{textValue(row.operationalStatus) || '-'}</td>
                    <td>{textValue(row.locationStatus) || '-'}</td>
                    <td>
                      {formatDateTime(textValue(row.latestMovementAt)) || '-'}
                    </td>
                    <td>{formatDateTime(textValue(row.updatedAt)) || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}

function VacuumLocationSummaryCards({ summary }: { summary: DataItem | null }) {
  const cards = [
    { key: 'total', label: 'Total Vacuum Pads', value: numberValue(summary?.total) ?? 0 },
    {
      key: 'onMachine',
      label: 'Σε μηχάνημα',
      value: numberValue(summary?.onMachine) ?? 0,
    },
    {
      key: 'inRack',
      label: 'Σε θέση/Rack',
      value: numberValue(summary?.inRack) ?? 0,
    },
    {
      key: 'inRepair',
      label: 'Σε επισκευή',
      value: numberValue(summary?.inRepair) ?? 0,
    },
    {
      key: 'missingSerial',
      label: 'Λείπει serial',
      value: numberValue(summary?.missingSerial) ?? 0,
    },
    {
      key: 'unknownLocation',
      label: 'Άγνωστη θέση',
      value: numberValue(summary?.unknownLocation) ?? 0,
    },
    {
      key: 'outOfService',
      label: 'Εκτός χρήσης',
      value: numberValue(summary?.outOfService) ?? 0,
    },
  ];

  return (
    <div className="reportSummaryGrid">
      {cards.map((card) => (
        <div key={card.key} className="reportSummaryCard">
          <span>{card.label}</span>
          <strong>{card.value}</strong>
        </div>
      ))}
    </div>
  );
}

function VacuumLocationDonutChart({ rows }: { rows: DataItem[] }) {
  const colors = ['#c45d36', '#527484', '#d59831', '#4d9e72', '#27695b'];
  const visibleRows = rows.filter((row) => (numberValue(row.count) ?? 0) > 0);
  const total = visibleRows.reduce(
    (sum, row) => sum + (numberValue(row.count) ?? 0),
    0,
  );
  const radius = 44;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div className="reportChartCard">
      <div className="reportChartHeader">
        <div>
          <h4>Κατανομή θέσης</h4>
          <p>Ποσοστό ανά κατηγορία</p>
        </div>
      </div>
      {total === 0 ? (
        <p className="smallText">Δεν υπάρχουν δεδομένα για donut chart.</p>
      ) : (
        <div className="donutChartLayout">
          <svg viewBox="0 0 120 120" role="img" aria-label="Vacuum location donut">
            <circle
              cx="60"
              cy="60"
              r={radius}
              fill="none"
              stroke="#e9eee7"
              strokeWidth="18"
            />
            {visibleRows.map((row, index) => {
              const value = numberValue(row.count) ?? 0;
              const length = (value / total) * circumference;
              const currentOffset = offset;
              offset += length;

              return (
                <circle
                  key={textValue(row.category)}
                  cx="60"
                  cy="60"
                  r={radius}
                  fill="none"
                  stroke={colors[index % colors.length]}
                  strokeWidth="18"
                  strokeDasharray={`${length} ${circumference - length}`}
                  strokeDashoffset={-currentOffset}
                  transform="rotate(-90 60 60)"
                />
              );
            })}
            <text x="60" y="57" textAnchor="middle" className="donutValue">
              {total}
            </text>
            <text x="60" y="73" textAnchor="middle" className="donutLabel">
              pads
            </text>
          </svg>
          <div className="donutLegend">
            {visibleRows.map((row, index) => (
              <span key={textValue(row.category)}>
                <i style={{ background: colors[index % colors.length] }} />
                {textValue(row.label)} · {numberValue(row.count) ?? 0}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function VacuumLocationBarChart({ rows }: { rows: DataItem[] }) {
  const maxValue = Math.max(0, ...rows.map((row) => numberValue(row.count) ?? 0));

  return (
    <div className="reportChartCard">
      <div className="reportChartHeader">
        <div>
          <h4>Counts ανά κατηγορία</h4>
          <p>Live κατάσταση Vacuum</p>
        </div>
      </div>
      <div className="barChart" aria-label="Vacuum location category counts">
        {rows.map((row) => {
          const value = numberValue(row.count) ?? 0;
          const width = maxValue > 0 ? Math.max(4, (value / maxValue) * 100) : 0;

          return (
            <div key={textValue(row.category)} className="barChartRow">
              <span className="barChartLabel">{textValue(row.label)}</span>
              <span className="barTrack">
                <span className="barFill" style={{ width: `${width}%` }} />
              </span>
              <strong>{value}</strong>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MostFrequentFaultBarChart({
  rows,
  metric,
}: {
  rows: DataItem[];
  metric: MostFrequentFaultChartMetric;
}) {
  const metricLabel =
    mostFrequentFaultMetricOptions.find((option) => option.value === metric)
      ?.label ?? 'Μετρική';
  const maxValue = Math.max(
    0,
    ...rows.map((row) => numberValue(row[metric]) ?? 0),
  );

  return (
    <div className="reportChartCard">
      <div className="reportChartHeader">
        <div>
          <h4>Top 20 τύποι βλάβης</h4>
          <p>{metricLabel}</p>
        </div>
      </div>
      <div className="barChart" aria-label={`Chart ${metricLabel}`}>
        {rows.map((row) => {
          const value = numberValue(row[metric]) ?? 0;
          const width = maxValue > 0 ? Math.max(4, (value / maxValue) * 100) : 0;

          return (
            <div key={textValue(row.faultCode)} className="barChartRow">
              <span className="barChartLabel">
                {textValue(row.faultCode)}
              </span>
              <span className="barTrack">
                <span className="barFill" style={{ width: `${width}%` }} />
              </span>
              <strong>{formatMostFrequentFaultMetric(value, metric)}</strong>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MostFrequentFaultDonutChart({ rows }: { rows: DataItem[] }) {
  const colors = ['#d66d2d', '#27695b', '#b78b27', '#6e8f6c', '#9b5f44', '#527484'];
  const topRows = [...rows]
    .filter((row) => (numberValue(row.totalOccurrences) ?? 0) > 0)
    .sort(
      (first, second) =>
        (numberValue(second.totalOccurrences) ?? 0) -
        (numberValue(first.totalOccurrences) ?? 0),
    );
  const visibleRows = topRows.slice(0, 10);
  const otherOccurrences = topRows
    .slice(10)
    .reduce((sum, row) => sum + (numberValue(row.totalOccurrences) ?? 0), 0);
  const segments = [
    ...visibleRows.map((row) => ({
      label: textValue(row.faultCode),
      value: numberValue(row.totalOccurrences) ?? 0,
    })),
    ...(otherOccurrences > 0
      ? [{ label: 'Λοιπά', value: otherOccurrences }]
      : []),
  ];
  const totalOccurrences = segments.reduce(
    (sum, segment) => sum + segment.value,
    0,
  );
  const radius = 44;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div className="reportChartCard">
      <div className="reportChartHeader">
        <div>
          <h4>Συμμετοχή τύπων βλάβης</h4>
          <p>Top 10 + Λοιπά</p>
        </div>
      </div>
      {totalOccurrences === 0 ? (
        <p className="smallText">Δεν υπάρχουν βλάβες για donut chart.</p>
      ) : (
        <div className="donutChartLayout">
          <svg viewBox="0 0 120 120" role="img" aria-label="Fault frequency donut">
            <circle
              cx="60"
              cy="60"
              r={radius}
              fill="none"
              stroke="#e9eee7"
              strokeWidth="18"
            />
            {segments.map((segment, index) => {
              const length = (segment.value / totalOccurrences) * circumference;
              const currentOffset = offset;
              offset += length;

              return (
                <circle
                  key={segment.label}
                  cx="60"
                  cy="60"
                  r={radius}
                  fill="none"
                  stroke={colors[index % colors.length]}
                  strokeWidth="18"
                  strokeDasharray={`${length} ${circumference - length}`}
                  strokeDashoffset={-currentOffset}
                  transform="rotate(-90 60 60)"
                />
              );
            })}
            <text x="60" y="57" textAnchor="middle" className="donutValue">
              {totalOccurrences}
            </text>
            <text x="60" y="73" textAnchor="middle" className="donutLabel">
              faults
            </text>
          </svg>
          <div className="donutLegend">
            {segments.map((segment, index) => (
              <span key={segment.label}>
                <i style={{ background: colors[index % colors.length] }} />
                {segment.label} · {segment.value}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function MostFrequentFaultTopThree({ rows }: { rows: DataItem[] }) {
  const topRows = [...rows]
    .filter((row) => (numberValue(row.totalOccurrences) ?? 0) > 0)
    .sort(
      (first, second) =>
        (numberValue(second.totalOccurrences) ?? 0) -
          (numberValue(first.totalOccurrences) ?? 0) ||
        (numberValue(second.downtimeHours) ?? 0) -
          (numberValue(first.downtimeHours) ?? 0),
    )
    .slice(0, 3);

  return (
    <div className="reportMiniTable">
      <div className="reportChartHeader">
        <div>
          <h4>Top 3 συχνότερες βλάβες</h4>
          <p>Γρήγορη εικόνα συχνότητας</p>
        </div>
      </div>
      {topRows.length === 0 ? (
        <p className="smallText">Δεν υπάρχουν καταγραφές βλαβών.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Θέση</th>
              <th>Τύπος</th>
              <th>Καταγραφές</th>
              <th>Downtime</th>
              <th>Top Vacuum</th>
            </tr>
          </thead>
          <tbody>
            {topRows.map((row) => (
              <tr key={textValue(row.faultCode)}>
                <td>{numberValue(row.rank) ?? '-'}</td>
                <td>{faultFrequencyFaultText(row)}</td>
                <td>{numberValue(row.totalOccurrences) ?? 0}</td>
                <td>{formatHours(row.downtimeHours)}</td>
                <td>{textValue(row.topVacuumPad) || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function MostFrequentFaultParetoTable({ rows }: { rows: DataItem[] }) {
  return (
    <div className="reportMiniTable">
      <div className="reportChartHeader">
        <div>
          <h4>Pareto 80/20</h4>
          <p>Σωρευτική συμμετοχή ανά τύπο βλάβης</p>
        </div>
      </div>
      {rows.length === 0 ? (
        <p className="smallText">Δεν υπάρχουν δεδομένα Pareto.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Θέση</th>
              <th>Τύπος</th>
              <th>Καταγραφές</th>
              <th>%</th>
              <th>Σωρευτικό %</th>
              <th>80%</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={textValue(row.faultCode)}
                className={booleanValue(row.inside80) ? 'paretoHighlight' : ''}
              >
                <td>{numberValue(row.rank) ?? '-'}</td>
                <td>{faultFrequencyFaultText(row)}</td>
                <td>{numberValue(row.occurrences) ?? 0}</td>
                <td>{formatPercent(row.percentage)}</td>
                <td>{formatPercent(row.cumulativePercentage)}</td>
                <td>{booleanValue(row.inside80) ? '✓' : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function MachineFaultBarChart({
  rows,
  metric,
}: {
  rows: DataItem[];
  metric: MachineFaultChartMetric;
}) {
  const metricLabel =
    machineFaultMetricOptions.find((option) => option.value === metric)?.label ??
    'Μετρική';
  const maxValue = Math.max(
    0,
    ...rows.map((row) => numberValue(row[metric]) ?? 0),
  );

  return (
    <div className="reportChartCard">
      <div className="reportChartHeader">
        <div>
          <h4>Top 20 Μηχανήματα</h4>
          <p>{metricLabel}</p>
        </div>
      </div>
      <div className="barChart" aria-label={`Chart ${metricLabel}`}>
        {rows.map((row) => {
          const value = numberValue(row[metric]) ?? 0;
          const width = maxValue > 0 ? Math.max(4, (value / maxValue) * 100) : 0;

          return (
            <div key={textValue(row.id)} className="barChartRow">
              <span className="barChartLabel">
                {textValue(row.machineCode)}
              </span>
              <span className="barTrack">
                <span className="barFill" style={{ width: `${width}%` }} />
              </span>
              <strong>{formatMachineFaultMetric(value, metric)}</strong>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MachineFaultDonutChart({ rows }: { rows: DataItem[] }) {
  const colors = ['#d66d2d', '#27695b', '#b78b27', '#6e8f6c', '#9b5f44', '#527484'];
  const topRows = [...rows]
    .filter((row) => (numberValue(row.totalFaults) ?? 0) > 0)
    .sort(
      (first, second) =>
        (numberValue(second.totalFaults) ?? 0) -
        (numberValue(first.totalFaults) ?? 0),
    );
  const visibleRows = topRows.slice(0, 10);
  const otherFaults = topRows
    .slice(10)
    .reduce((sum, row) => sum + (numberValue(row.totalFaults) ?? 0), 0);
  const segments = [
    ...visibleRows.map((row) => ({
      label: textValue(row.machineCode),
      value: numberValue(row.totalFaults) ?? 0,
    })),
    ...(otherFaults > 0 ? [{ label: 'Λοιπά', value: otherFaults }] : []),
  ];
  const totalFaults = segments.reduce((sum, segment) => sum + segment.value, 0);
  const radius = 44;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div className="reportChartCard">
      <div className="reportChartHeader">
        <div>
          <h4>Συμμετοχή μηχανημάτων</h4>
          <p>Top 10 + Λοιπά</p>
        </div>
      </div>
      {totalFaults === 0 ? (
        <p className="smallText">Δεν υπάρχουν αποδομένες βλάβες για donut chart.</p>
      ) : (
        <div className="donutChartLayout">
          <svg viewBox="0 0 120 120" role="img" aria-label="Machine fault share donut">
            <circle
              cx="60"
              cy="60"
              r={radius}
              fill="none"
              stroke="#e9eee7"
              strokeWidth="18"
            />
            {segments.map((segment, index) => {
              const length = (segment.value / totalFaults) * circumference;
              const currentOffset = offset;
              offset += length;

              return (
                <circle
                  key={segment.label}
                  cx="60"
                  cy="60"
                  r={radius}
                  fill="none"
                  stroke={colors[index % colors.length]}
                  strokeWidth="18"
                  strokeDasharray={`${length} ${circumference - length}`}
                  strokeDashoffset={-currentOffset}
                  transform="rotate(-90 60 60)"
                />
              );
            })}
            <text x="60" y="57" textAnchor="middle" className="donutValue">
              {totalFaults}
            </text>
            <text x="60" y="73" textAnchor="middle" className="donutLabel">
              faults
            </text>
          </svg>
          <div className="donutLegend">
            {segments.map((segment, index) => (
              <span key={segment.label}>
                <i style={{ background: colors[index % colors.length] }} />
                {segment.label} · {segment.value}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function MachineFaultTopTenTable({ rows }: { rows: DataItem[] }) {
  const topRows = [...rows]
    .filter((row) => (numberValue(row.totalFaults) ?? 0) > 0)
    .sort(
      (first, second) =>
        (numberValue(second.totalFaults) ?? 0) -
          (numberValue(first.totalFaults) ?? 0) ||
        (numberValue(second.downtimeHours) ?? 0) -
          (numberValue(first.downtimeHours) ?? 0),
    )
    .slice(0, 10);

  return (
    <div className="reportMiniTable">
      <div className="reportChartHeader">
        <div>
          <h4>Top 10 μηχανήματα</h4>
          <p>Γρήγορη κατάταξη διαχείρισης</p>
        </div>
      </div>
      {topRows.length === 0 ? (
        <p className="smallText">Δεν υπάρχουν μηχανήματα με αποδομένες βλάβες.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Θέση</th>
              <th>Μηχάνημα</th>
              <th>Βλάβες</th>
              <th>Downtime</th>
              <th>Συχνότερη Βλάβη</th>
            </tr>
          </thead>
          <tbody>
            {topRows.map((row) => (
              <tr key={textValue(row.id)}>
                <td>{numberValue(row.rank) ?? '-'}</td>
                <td className="nowrapCell">{machineFaultMachineText(row)}</td>
                <td>{numberValue(row.totalFaults) ?? 0}</td>
                <td>{formatHours(row.downtimeHours)}</td>
                <td>{textValue(row.mostCommonFault) || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function FaultyBarChart({
  rows,
  metric,
}: {
  rows: DataItem[];
  metric: FaultyChartMetric;
}) {
  const metricLabel =
    faultyMetricOptions.find((option) => option.value === metric)?.label ??
    'Μετρική';
  const maxValue = Math.max(
    0,
    ...rows.map((row) => numberValue(row[metric]) ?? 0),
  );

  return (
    <div className="reportChartCard">
      <div className="reportChartHeader">
        <div>
          <h4>Top 20 Vacuum Pads</h4>
          <p>{metricLabel}</p>
        </div>
      </div>
      <div className="barChart" aria-label={`Chart ${metricLabel}`}>
        {rows.map((row) => {
          const value = numberValue(row[metric]) ?? 0;
          const width = maxValue > 0 ? Math.max(4, (value / maxValue) * 100) : 0;

          return (
            <div key={textValue(row.id)} className="barChartRow">
              <span className="barChartLabel">{textValue(row.code)}</span>
              <span className="barTrack">
                <span className="barFill" style={{ width: `${width}%` }} />
              </span>
              <strong>{formatFaultyReportMetric(value, metric)}</strong>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FaultyDonutChart({ rows }: { rows: DataItem[] }) {
  const colors = ['#d66d2d', '#27695b', '#b78b27', '#6e8f6c', '#9b5f44', '#527484'];
  const topRows = [...rows]
    .filter((row) => (numberValue(row.totalFaults) ?? 0) > 0)
    .sort(
      (first, second) =>
        (numberValue(second.totalFaults) ?? 0) -
        (numberValue(first.totalFaults) ?? 0),
    );
  const visibleRows = topRows.slice(0, 10);
  const otherFaults = topRows
    .slice(10)
    .reduce((sum, row) => sum + (numberValue(row.totalFaults) ?? 0), 0);
  const segments = [
    ...visibleRows.map((row) => ({
      label: textValue(row.code),
      value: numberValue(row.totalFaults) ?? 0,
    })),
    ...(otherFaults > 0 ? [{ label: 'Λοιπά', value: otherFaults }] : []),
  ];
  const totalFaults = segments.reduce((sum, segment) => sum + segment.value, 0);
  const radius = 44;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div className="reportChartCard">
      <div className="reportChartHeader">
        <div>
          <h4>Συμμετοχή στα faults</h4>
          <p>Top 10 + Λοιπά</p>
        </div>
      </div>
      {totalFaults === 0 ? (
        <p className="smallText">Δεν υπάρχουν βλάβες για donut chart.</p>
      ) : (
        <div className="donutChartLayout">
          <svg viewBox="0 0 120 120" role="img" aria-label="Fault share donut">
            <circle
              cx="60"
              cy="60"
              r={radius}
              fill="none"
              stroke="#e9eee7"
              strokeWidth="18"
            />
            {segments.map((segment, index) => {
              const length = (segment.value / totalFaults) * circumference;
              const currentOffset = offset;
              offset += length;

              return (
                <circle
                  key={segment.label}
                  cx="60"
                  cy="60"
                  r={radius}
                  fill="none"
                  stroke={colors[index % colors.length]}
                  strokeWidth="18"
                  strokeDasharray={`${length} ${circumference - length}`}
                  strokeDashoffset={-currentOffset}
                  transform="rotate(-90 60 60)"
                />
              );
            })}
            <text x="60" y="57" textAnchor="middle" className="donutValue">
              {totalFaults}
            </text>
            <text x="60" y="73" textAnchor="middle" className="donutLabel">
              faults
            </text>
          </svg>
          <div className="donutLegend">
            {segments.map((segment, index) => (
              <span key={segment.label}>
                <i style={{ background: colors[index % colors.length] }} />
                {segment.label} · {segment.value}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function FaultTrendLineChart({ rows }: { rows: DataItem[] }) {
  const width = 520;
  const height = 180;
  const padding = 30;
  const maxValue = Math.max(0, ...rows.map((row) => numberValue(row.count) ?? 0));
  const points =
    rows.length > 0
      ? rows
          .map((row, index) => {
            const count = numberValue(row.count) ?? 0;
            const x =
              rows.length === 1
                ? width / 2
                : padding +
                  (index / (rows.length - 1)) * (width - padding * 2);
            const y =
              height -
              padding -
              (maxValue > 0 ? (count / maxValue) * (height - padding * 2) : 0);
            return `${x},${y}`;
          })
          .join(' ')
      : '';

  return (
    <div className="reportChartCard">
      <div className="reportChartHeader">
        <div>
          <h4>Μηνιαία τάση βλαβών</h4>
          <p>Σύνολο faults ανά μήνα</p>
        </div>
      </div>
      {rows.length === 0 ? (
        <p className="smallText">Δεν υπάρχουν δεδομένα τάσης.</p>
      ) : (
        <div className="lineChartWrap">
          <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Fault trend">
            <line
              x1={padding}
              y1={height - padding}
              x2={width - padding}
              y2={height - padding}
              className="chartAxis"
            />
            <line
              x1={padding}
              y1={padding}
              x2={padding}
              y2={height - padding}
              className="chartAxis"
            />
            <polyline points={points} className="trendLine" />
            {rows.map((row, index) => {
              const [x, y] = points.split(' ')[index].split(',').map(Number);
              return (
                <g key={textValue(row.month)}>
                  <circle cx={x} cy={y} r="4" className="trendPoint" />
                  <text x={x} y={height - 8} textAnchor="middle" className="axisLabel">
                    {textValue(row.month)}
                  </text>
                  <text x={x} y={y - 8} textAnchor="middle" className="axisValue">
                    {numberValue(row.count) ?? 0}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      )}
    </div>
  );
}

function MovementsTab({ api }: { api: AdminApiClient }) {
  const adminData = useAdminData(api);
  const [filters, setFilters] = useState<MovementFilters>(emptyMovementFilters);
  const [appliedFilters, setAppliedFilters] =
    useState<MovementFilters>(emptyMovementFilters);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = usePersistentPageSize(
    pageSizeStorageKeys.movements,
  );
  const [payload, setPayload] = useState<ApiPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ApiPayload | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const [exportScope, setExportScope] = useState<MovementExportScope>('all');
  const [exportLoading, setExportLoading] = useState<'csv' | 'excel' | null>(
    null,
  );
  const [exportModal, setExportModal] = useState<WorkflowModalState | null>(null);
  const [selectedMovement, setSelectedMovement] = useState<DataItem | null>(null);
  const [photoMovement, setPhotoMovement] = useState<DataItem | null>(null);
  const movementVacuumOptions = useMemo(
    () =>
      uniqueByValue(
        [
          ...adminData.data.activeVacuums,
          ...adminData.data.inactiveVacuums,
          ...adminData.data.repairVacuums,
        ],
        (item) => textValue(item.serialNumber) || textValue(item.code),
      ),
    [
      adminData.data.activeVacuums,
      adminData.data.inactiveVacuums,
      adminData.data.repairVacuums,
    ],
  );
  const movementMachineOptions = adminData.data.machines;
  const movementRackOptions = adminData.data.racks;
  const movementFaultOptions = adminData.data.faultCatalog;

  const refreshMovements = useCallback(
    async (options: { silent?: boolean } = {}) => {
      if (!options.silent) {
        setLoading(true);
      }
      setError(null);

      try {
        const result = await api.listMovements({
          ...appliedFilters,
          page,
          pageSize,
        });
        setPayload(result);
        setLastUpdatedAt(new Date());
      } catch (caught) {
        setError(errorPayload(caught));
      } finally {
        if (!options.silent) {
          setLoading(false);
        }
      }
    },
    [api, appliedFilters, page, pageSize],
  );
  const refreshRef = useRef(refreshMovements);

  useEffect(() => {
    refreshRef.current = refreshMovements;
  }, [refreshMovements]);

  useEffect(() => {
    void refreshMovements();
  }, [refreshMovements]);

  useEffect(() => {
    const debounceHandle = window.setTimeout(() => {
      const nextFilters = cleanMovementFilters(filters);

      setAppliedFilters((currentFilters) => {
        if (sameMovementFilters(currentFilters, nextFilters)) {
          return currentFilters;
        }

        setPage(1);
        return nextFilters;
      });
    }, 320);

    return () => window.clearTimeout(debounceHandle);
  }, [filters]);

  useEffect(() => {
    if (adminData.lastEventAt) {
      void refreshRef.current({ silent: true });
    }
  }, [adminData.lastEventAt]);

  const rows = payload ? arrayItems(payload) : [];
  const total = numberValue(payload?.total) ?? rows.length;
  const currentPage = numberValue(payload?.page) ?? page;
  const responsePageSize = numberValue(payload?.pageSize) ?? pageSize;
  const totalPages = numberValue(payload?.totalPages) ?? 1;
  const rangeStart = total === 0 ? 0 : (currentPage - 1) * responsePageSize + 1;
  const rangeEnd = Math.min(currentPage * responsePageSize, total);
  const pageNumbers = visiblePageNumbers(currentPage, totalPages);

  function updateFilter<K extends keyof MovementFilters>(
    key: K,
    value: MovementFilters[K],
  ) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  function clearFilters() {
    setFilters(emptyMovementFilters);
    setAppliedFilters(emptyMovementFilters);
    setPage(1);
  }

  function changePage(nextPage: number) {
    setPage(Math.min(Math.max(nextPage, 1), totalPages));
  }

  async function loadMovementRowsForExport() {
    if (exportScope === 'page') {
      return rows;
    }

    const exportFilters = cleanMovementFilters(filters);
    const firstPayload = await api.listMovements({
      ...exportFilters,
      page: 1,
      pageSize: movementExportPageSize,
    });
    const allRows = [...arrayItems(firstPayload)];
    const exportTotalPages = numberValue(firstPayload.totalPages) ?? 1;

    for (let exportPage = 2; exportPage <= exportTotalPages; exportPage += 1) {
      const pagePayload = await api.listMovements({
        ...exportFilters,
        page: exportPage,
        pageSize: movementExportPageSize,
      });
      allRows.push(...arrayItems(pagePayload));
    }

    return allRows;
  }

  async function exportMovements(format: 'csv' | 'excel') {
    setExportLoading(format);

    try {
      const exportRows = await loadMovementRowsForExport();

      if (exportRows.length === 0) {
        setExportModal({
          title: 'Δεν υπάρχουν κινήσεις',
          message: 'Δεν βρέθηκαν κινήσεις για εξαγωγή με τα τρέχοντα φίλτρα.',
          tone: 'warning',
        });
        return;
      }

      if (format === 'csv') {
        downloadTextFile(
          buildMovementsCsv(exportRows),
          movementExportFilename('csv'),
          'text/csv;charset=utf-8',
        );
      } else {
        downloadTextFile(
          buildMovementsExcelXml(exportRows),
          movementExportFilename('xls'),
          'application/vnd.ms-excel;charset=utf-8',
        );
      }

      setExportModal({
        title: 'Η εξαγωγή δημιουργήθηκε',
        message: `Εξήχθησαν ${exportRows.length} κινήσεις (${exportScope === 'all' ? 'όλα τα φιλτραρισμένα' : 'τρέχουσα σελίδα'}).`,
        tone: 'success',
      });
    } catch (caught) {
      const payloadError = errorPayload(caught);
      setExportModal({
        title: 'Σφάλμα εξαγωγής',
        message:
          extractMessage(payloadError) ||
          textValue(payloadError.message) ||
          'Δεν ήταν δυνατή η εξαγωγή των κινήσεων.',
        tone: 'error',
        payload: payloadError,
      });
    } finally {
      setExportLoading(null);
    }
  }

  return (
    <div className="movementsGrid">
      <OperationCard
        title="Κινήσεις"
        subtitle="Πίνακας κινήσεων με φίλτρα και σελιδοποίηση."
        accent="purple"
        wide
      >
        <div className="movementsToolbar">
          <div className="liveRefreshPanel compactLivePanel">
            <span className={`liveBadge ${adminData.liveStatus}`}>
              {movementLiveStatusLabel(adminData.liveStatus)}
            </span>
            <span className="smallText">
              Τελευταίο συμβάν: {adminData.lastEventAt ? formatTime(adminData.lastEventAt) : 'αναμονή'}
            </span>
            <span className="smallText">
              Τελευταία ενημέρωση: {lastUpdatedAt ? formatTime(lastUpdatedAt) : 'αναμονή'}
            </span>
          </div>
        </div>

        <div className="movementFilters" aria-label="Φίλτρα κινήσεων">
          <label className="field">
            <span>Τύπος κίνησης</span>
            <select
              value={filters.type}
              onChange={(event) => updateFilter('type', event.target.value)}
            >
              {movementTypeOptions.map((option) => (
                <option key={option.value || 'all'} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <ExcelMultiSelectFilter
            label="Vacuum"
            values={filters.vacuum}
            onChange={(value) => updateFilter('vacuum', value)}
            options={movementVacuumOptions}
            loading={adminData.loading}
            error={adminData.error}
            placeholder="Serial ή code"
            getValue={(item) => textValue(item.serialNumber) || textValue(item.code)}
            getPrimaryText={vacuumPrimaryText}
            getSecondaryText={vacuumSecondaryText}
            getBadge={vacuumBadge}
          />
          <ExcelMultiSelectFilter
            label="Μηχάνημα"
            values={filters.machine}
            onChange={(value) => updateFilter('machine', value)}
            options={movementMachineOptions}
            loading={adminData.loading}
            error={adminData.error}
            placeholder="MACH-001"
            getValue={(item) => textValue(item.code)}
            getPrimaryText={machinePrimaryText}
            getSecondaryText={machineSecondaryText}
            getBadge={machineBadge}
          />
          <ExcelMultiSelectFilter
            label="Θέση / Rack"
            values={filters.rack}
            onChange={(value) => updateFilter('rack', value)}
            options={movementRackOptions}
            loading={adminData.loading}
            error={adminData.error}
            placeholder="RACK-A-01-01"
            getValue={(item) => textValue(item.code)}
            getPrimaryText={rackPrimaryText}
            getSecondaryText={rackSecondaryText}
            getBadge={rackBadge}
          />
          <ExcelMultiSelectFilter
            label="Βλάβη"
            values={filters.fault}
            onChange={(value) => updateFilter('fault', value)}
            options={movementFaultOptions}
            loading={adminData.loading}
            error={adminData.error}
            placeholder="FC-001 ή περιγραφή"
            getValue={(item) => textValue(item.code) || textValue(item.label)}
            getPrimaryText={(item) => `${textValue(item.code)} - ${textValue(item.label)}`}
            getSecondaryText={(item) => textValue(item.description)}
            getBadge={faultBadge}
          />
          <DateTimeInput
            label="Έναρξη από"
            value={filters.startedFrom}
            onChange={(value) => updateFilter('startedFrom', value)}
          />
          <DateTimeInput
            label="Έναρξη έως"
            value={filters.startedTo}
            onChange={(value) => updateFilter('startedTo', value)}
          />
          <DateTimeInput
            label="Λήξη από"
            value={filters.endedFrom}
            onChange={(value) => updateFilter('endedFrom', value)}
          />
          <DateTimeInput
            label="Λήξη έως"
            value={filters.endedTo}
            onChange={(value) => updateFilter('endedTo', value)}
          />
        </div>

        <div className="movementActionRow">
          <ButtonRow>
            <button type="button" className="ghost" onClick={clearFilters}>
              Καθαρισμός φίλτρων
            </button>
          </ButtonRow>
          <div className="exportControls">
            <label className="pageSizeField">
              <span>Πεδίο εξαγωγής</span>
              <select
                value={exportScope}
                onChange={(event) =>
                  setExportScope(event.target.value as MovementExportScope)
                }
              >
                <option value="all">Όλα τα φιλτραρισμένα</option>
                <option value="page">Τρέχουσα σελίδα</option>
              </select>
            </label>
            <button
              type="button"
              className="ghost compactButton"
              disabled={exportLoading !== null}
              onClick={() => void exportMovements('csv')}
            >
              {exportLoading === 'csv' ? 'Εξαγωγή CSV...' : 'Εξαγωγή CSV'}
            </button>
            <button
              type="button"
              className="ghost compactButton"
              disabled={exportLoading !== null}
              onClick={() => void exportMovements('excel')}
            >
              {exportLoading === 'excel' ? 'Εξαγωγή Excel...' : 'Εξαγωγή Excel'}
            </button>
          </div>
          <label className="pageSizeField">
            <span>Γραμμές ανά σελίδα</span>
            <select
              value={pageSize}
              onChange={(event) => {
                setPageSize(Number(event.target.value));
                setPage(1);
              }}
            >
              {movementPageSizes.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </label>
        </div>

        {loading ? <Notice tone="info">Φόρτωση κινήσεων...</Notice> : null}
        <ResponsePanel payload={null} error={error} />

        <div className="excelTableWrap">
          <table className="excelTable">
            <thead>
              <tr>
                <th>Έναρξη</th>
                <th>Τύπος</th>
                <th>Vacuum</th>
                <th>Μηχάνημα</th>
                <th>Θέση</th>
                <th>Βλάβη</th>
                <th>Φωτογραφίες</th>
                <th>Λήξη</th>
                <th>Λεπτομέρειες</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="emptyTableCell">
                    Δεν βρέθηκαν κινήσεις για τα επιλεγμένα φίλτρα.
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr
                    key={textValue(row.id)}
                    className="clickableMovementRow"
                    tabIndex={0}
                    onClick={() => setSelectedMovement(row)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        setSelectedMovement(row);
                      }
                    }}
                  >
                    <td>{formatDateTime(textValue(row.startedAt)) || '-'}</td>
                    <td>{textValue(row.typeLabel) || textValue(row.type) || '-'}</td>
                    <td>{movementVacuumText(row)}</td>
                    <td>{textValue(row.machineCode) || '-'}</td>
                    <td>{textValue(row.rackCode) || '-'}</td>
                    <td>{movementFaultText(row)}</td>
                    <td>
                      <MovementPhotoButton
                        movement={row}
                        onOpen={() => setPhotoMovement(row)}
                      />
                    </td>
                    <td>{formatDateTime(textValue(row.endedAt)) || '-'}</td>
                    <td>
                      <div className="movementDetailsCell">
                        <span>{movementDetailsText(row) || '-'}</span>
                        <button
                          type="button"
                          className="tableActionButton"
                          onClick={(event) => {
                            event.stopPropagation();
                            setSelectedMovement(row);
                          }}
                        >
                          Λεπτομέρειες
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="paginationBar">
          <span>
            Εμφάνιση {rangeStart}–{rangeEnd} από {total}
          </span>
          <div className="paginationButtons">
            <button
              type="button"
              className="ghost compactButton"
              disabled={currentPage <= 1}
              onClick={() => changePage(1)}
            >
              Πρώτη
            </button>
            <button
              type="button"
              className="ghost compactButton"
              disabled={currentPage <= 1}
              onClick={() => changePage(currentPage - 1)}
            >
              Προηγούμενη
            </button>
            {pageNumbers.map((pageNumber) => (
              <button
                key={pageNumber}
                type="button"
                className={
                  pageNumber === currentPage
                    ? 'pageNumberButton active'
                    : 'pageNumberButton'
                }
                onClick={() => changePage(pageNumber)}
              >
                {pageNumber}
              </button>
            ))}
            <button
              type="button"
              className="ghost compactButton"
              disabled={currentPage >= totalPages}
              onClick={() => changePage(currentPage + 1)}
            >
              Επόμενη
            </button>
            <button
              type="button"
              className="ghost compactButton"
              disabled={currentPage >= totalPages}
              onClick={() => changePage(totalPages)}
            >
              Τελευταία
            </button>
          </div>
        </div>
        <WorkflowResultDialog
          modal={exportModal}
          onClose={() => setExportModal(null)}
        />
        {selectedMovement ? (
          <MovementDetailDialog
            movement={selectedMovement}
            onShowPhotos={() => setPhotoMovement(selectedMovement)}
            onClose={() => setSelectedMovement(null)}
          />
        ) : null}
        {photoMovement ? (
          <RepairPhotoGalleryDialog
            api={api}
            movement={photoMovement}
            onPhotosChanged={() => void refreshMovements({ silent: true })}
            onClose={() => setPhotoMovement(null)}
          />
        ) : null}
      </OperationCard>
    </div>
  );
}

function DataTab({
  api,
  activeEntity,
}: {
  api: AdminApiClient;
  activeEntity: DataEntityId;
}) {
  const adminData = useAdminData(api);
  const [search, setSearch] = useState('');
  const [vacuumQuickFilter, setVacuumQuickFilter] =
    useState<VacuumQuickFilter>('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = usePersistentPageSize(
    pageSizeStorageKeys.data[activeEntity],
  );
  const [selectedRow, setSelectedRow] = useState<DataItem | null>(null);
  const [formModal, setFormModal] = useState<DataFormModalState | null>(null);
  const [importModal, setImportModal] = useState<DataImportModalState | null>(null);
  const [deleteRow, setDeleteRow] = useState<DataItem | null>(null);
  const [resultModal, setResultModal] = useState<WorkflowModalState | null>(null);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const config = dataTableConfig(activeEntity, adminData.data);
  const activeEntityLabel =
    dataEntities.find((entity) => entity.id === activeEntity)?.label ?? 'Vacuum';
  const vacuumQuickFilterCounts = useMemo(
    () => countVacuumQuickFilters(adminData.data.vacuumPads),
    [adminData.data.vacuumPads],
  );
  const quickFilteredRows = useMemo(
    () =>
      activeEntity === 'vacuums'
        ? filterVacuumRows(config.rows, vacuumQuickFilter)
        : config.rows,
    [activeEntity, config.rows, vacuumQuickFilter],
  );
  const filteredRows = useMemo(
    () => filterDataRows(quickFilteredRows, config.columns, search),
    [config.columns, quickFilteredRows, search],
  );
  const total = filteredRows.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(page, totalPages);
  const rangeStart = total === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const rangeEnd = Math.min(currentPage * pageSize, total);
  const pageRows = filteredRows.slice(rangeStart - 1, rangeEnd);
  const pageNumbers = visiblePageNumbers(currentPage, totalPages);

  useEffect(() => {
    setPage(1);
  }, [activeEntity, search, pageSize, vacuumQuickFilter]);

  useEffect(() => {
    setSearch('');
    setSelectedRow(null);
  }, [activeEntity]);

  function changeVacuumQuickFilter(filter: VacuumQuickFilter) {
    setVacuumQuickFilter(filter);
    setPage(1);
  }

  function changePage(nextPage: number) {
    setPage(Math.min(Math.max(nextPage, 1), totalPages));
  }

  async function submitDataForm(
    values: ApiPayload,
    options: { keepOpen?: boolean } = {},
  ): Promise<boolean> {
    const entity = formModal?.entity ?? activeEntity;
    setSaving(true);

    try {
      const result =
        formModal?.mode === 'edit' && formModal.row
          ? await updateDataEntity(api, entity, textValue(formModal.row.id), values)
          : await createDataEntity(api, entity, values);
      const createdCode =
        formModal?.mode === 'create'
          ? textValue(objectValue(result.item)?.code)
          : '';

      if (options.keepOpen && formModal?.mode === 'create') {
        setResultModal({
          title: 'Ολοκληρώθηκε',
          message: createdCode
            ? `Η εγγραφή δημιουργήθηκε με code ${createdCode}. Μπορείτε να καταχωρήσετε την επόμενη.`
            : 'Η εγγραφή δημιουργήθηκε. Μπορείτε να καταχωρήσετε την επόμενη.',
          tone: 'success',
          payload: result,
        });
      } else {
        setFormModal(null);
        setResultModal({
          title: 'Ολοκληρώθηκε',
          message:
            formModal?.mode === 'edit'
              ? 'Η εγγραφή ενημερώθηκε.'
              : createdCode
                ? `Η νέα εγγραφή δημιουργήθηκε με code ${createdCode}.`
                : 'Η νέα εγγραφή δημιουργήθηκε.',
          tone: 'success',
          payload: result,
        });
      }
      await adminData.refresh({ silent: true });
      return true;
    } catch (caught) {
      const payload = errorPayload(caught);
      setResultModal({
        title: 'Σφάλμα',
        message:
          extractMessage(payload) ||
          textValue(payload.message) ||
          'Δεν ήταν δυνατή η αποθήκευση της εγγραφής.',
        tone: 'error',
        payload,
      });
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function previewExcelImport(file: File | null) {
    if (!file) {
      return;
    }

    if (!file.name.toLowerCase().endsWith('.xlsx')) {
      setResultModal({
        title: 'Σφάλμα',
        message: 'Επιλέξτε αρχείο .xlsx.',
        tone: 'error',
      });
      return;
    }

    setImporting(true);

    try {
      const preview = await api.previewMasterDataImport(
        dataImportEntity(activeEntity),
        file,
      );
      setImportModal({ entity: activeEntity, file, preview });
    } catch (caught) {
      const payload = errorPayload(caught);
      setResultModal({
        title: 'Σφάλμα εισαγωγής',
        message:
          extractMessage(payload) ||
          textValue(payload.message) ||
          'Δεν ήταν δυνατή η προεπισκόπηση του Excel.',
        tone: 'error',
        payload,
      });
    } finally {
      setImporting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }

  async function commitExcelImport() {
    if (!importModal) {
      return;
    }

    setImporting(true);

    try {
      const result = await api.commitMasterDataImport(
        dataImportEntity(importModal.entity),
        importModal.file,
      );
      setImportModal(null);
      setResultModal({
        title: 'Η εισαγωγή ολοκληρώθηκε',
        message: importSummaryText(result),
        tone: 'success',
        payload: result,
      });
      await adminData.refresh({ silent: true });
    } catch (caught) {
      const payload = errorPayload(caught);
      setResultModal({
        title: 'Σφάλμα εισαγωγής',
        message:
          extractMessage(payload) ||
          textValue(payload.message) ||
          'Δεν ήταν δυνατή η εισαγωγή του Excel.',
        tone: 'error',
        payload,
      });
    } finally {
      setImporting(false);
    }
  }

  async function exportExcelTemplate() {
    setExporting(true);

    try {
      const exportRows = dataExportRows(activeEntity, config.rows);
      downloadBinaryFile(
        buildXlsxWorkbook({
          name: dataExportSheetName(activeEntity),
          rows: exportRows,
          columnWidths: dataExportColumnWidths(activeEntity),
        }),
        dataExportFilename(activeEntity),
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      setResultModal({
        title: 'Η εξαγωγή ολοκληρώθηκε',
        message: `Εξήχθησαν ${Math.max(exportRows.length - 1, 0)} εγγραφές για ${dataEntityLabel(activeEntity)}. Το αρχείο μπορεί να χρησιμοποιηθεί ως template ή για bulk update μέσω εισαγωγής Excel.`,
        tone: 'success',
      });
    } catch (caught) {
      setResultModal({
        title: 'Σφάλμα εξαγωγής',
        message:
          errorPayload(caught).message?.toString() ||
          'Δεν ήταν δυνατή η εξαγωγή σε Excel.',
        tone: 'error',
        payload: errorPayload(caught),
      });
    } finally {
      setExporting(false);
    }
  }

  async function confirmDeleteDataRow() {
    if (!deleteRow) {
      return;
    }

    setSaving(true);

    try {
      const result = await deleteDataEntity(
        api,
        activeEntity,
        textValue(deleteRow.id),
      );
      setDeleteRow(null);
      setResultModal({
        title: result.deactivated ? 'Απενεργοποιήθηκε' : 'Διαγράφηκε',
        message:
          textValue(result.reason) ||
          (result.deactivated
            ? 'Η εγγραφή απενεργοποιήθηκε για να προστατευτεί το ιστορικό.'
            : 'Η εγγραφή διαγράφηκε.'),
        tone: result.deactivated ? 'warning' : 'success',
        payload: result,
      });
      await adminData.refresh({ silent: true });
    } catch (caught) {
      const payload = errorPayload(caught);
      setResultModal({
        title: 'Σφάλμα',
        message:
          extractMessage(payload) ||
          textValue(payload.message) ||
          'Δεν ήταν δυνατή η διαγραφή/απενεργοποίηση της εγγραφής.',
        tone: 'error',
        payload,
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="dataGrid">
      <OperationCard
        title={activeEntityLabel}
        accent="green"
        wide
      >
        <div className="dataToolbar">
          <label className="field dataSearchField">
            <span>Αναζήτηση</span>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={config.searchPlaceholder}
            />
          </label>
          <div className="liveRefreshPanel compactLivePanel">
            <span className={`liveBadge ${adminData.liveStatus}`}>
              {movementLiveStatusLabel(adminData.liveStatus)}
            </span>
            <span className="smallText">
              Τελευταίο συμβάν: {adminData.lastEventAt ? formatTime(adminData.lastEventAt) : 'αναμονή'}
            </span>
            <span className="smallText">
              Τελευταία ενημέρωση: {adminData.lastUpdatedAt ? formatTime(adminData.lastUpdatedAt) : 'αναμονή'}
            </span>
          </div>
          <div className="buttonRow dataButtonRow">
            <button
              type="button"
              className="primary compactButton"
              onClick={() => setFormModal({ mode: 'create', entity: activeEntity })}
            >
              Νέα εγγραφή
            </button>
            <button
              type="button"
              className="ghost compactButton"
              disabled={importing}
              onClick={() => fileInputRef.current?.click()}
            >
              {importing ? 'Προεπισκόπηση...' : 'Εισαγωγή από Excel'}
            </button>
            <button
              type="button"
              className="ghost compactButton"
              disabled={exporting}
              onClick={() => void exportExcelTemplate()}
            >
              {exporting ? 'Εξαγωγή...' : 'Εξαγωγή σε Excel'}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="visuallyHidden"
              onChange={(event) =>
                void previewExcelImport(event.target.files?.[0] ?? null)
              }
            />
          </div>
          <label className="pageSizeField">
            <span>Γραμμές ανά σελίδα</span>
            <select
              value={pageSize}
              onChange={(event) => setPageSize(Number(event.target.value))}
            >
              {movementPageSizes.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </label>
        </div>

        {activeEntity === 'vacuums' ? (
          <div className="quickFilterBar" aria-label="Γρήγορα φίλτρα Vacuum">
            {vacuumQuickFilters.map((filter) => (
              <button
                key={filter.id}
                type="button"
                className={[
                  'quickFilterChip',
                  vacuumQuickFilter === filter.id ? 'active' : '',
                  filter.tone ?? '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => changeVacuumQuickFilter(filter.id)}
              >
                <span>{filter.label}</span>
                <span className="quickFilterCount">
                  {vacuumQuickFilterCounts[filter.id]}
                </span>
              </button>
            ))}
          </div>
        ) : null}

        {adminData.loading ? (
          <Notice tone="info">Ανανέωση δεδομένων...</Notice>
        ) : null}
        <ResponsePanel payload={null} error={adminData.error} />

        <div className="excelTableWrap">
          <table className="excelTable">
            <thead>
              <tr>
                {config.columns.map((column) => (
                  <th key={column.key} className={column.className}>
                    {column.header}
                  </th>
                ))}
                <th className="actionsColumn">Ενέργειες</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.length === 0 ? (
                <tr>
                  <td colSpan={config.columns.length + 1} className="emptyTableCell">
                    Δεν βρέθηκαν εγγραφές για τα τρέχοντα φίλτρα.
                  </td>
                </tr>
              ) : (
                pageRows.map((row) => (
                  <tr
                    key={textValue(row.id) || dataRowTitle(activeEntity, row)}
                    className="clickableMovementRow"
                    tabIndex={0}
                    onClick={() => setSelectedRow(row)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        setSelectedRow(row);
                      }
                    }}
                  >
                    {config.columns.map((column) => (
                      <td key={column.key} className={column.className}>
                        {column.value(row) || '-'}
                        {activeEntity === 'vacuums' &&
                        column.key === 'serialNumber' &&
                        isIncompleteVacuum(row) ? (
                          <span className="inlineStatusBadge warning">
                            Λείπει serial
                          </span>
                        ) : null}
                      </td>
                    ))}
                    <td className="actionsColumn">
                      <div className="tableActionGroup">
                        <button
                          type="button"
                          className="tableActionButton iconButton"
                          aria-label={`Επεξεργασία ${dataRowTitle(activeEntity, row)}`}
                          title="Επεξεργασία"
                          onClick={(event) => {
                            event.stopPropagation();
                            setFormModal({
                              mode: 'edit',
                              entity: activeEntity,
                              row,
                            });
                          }}
                        >
                          <span aria-hidden="true">✎</span>
                        </button>
                        <button
                          type="button"
                          className="tableActionButton iconButton danger"
                          aria-label={`Απενεργοποίηση ${dataRowTitle(activeEntity, row)}`}
                          title="Απενεργοποίηση"
                          onClick={(event) => {
                            event.stopPropagation();
                            setDeleteRow(row);
                          }}
                        >
                          <span aria-hidden="true">🗑</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="paginationBar">
          <span>
            Εμφάνιση {rangeStart}–{rangeEnd} από {total}
          </span>
          <div className="paginationButtons">
            <button
              type="button"
              className="ghost compactButton"
              disabled={currentPage <= 1}
              onClick={() => changePage(1)}
            >
              Πρώτη
            </button>
            <button
              type="button"
              className="ghost compactButton"
              disabled={currentPage <= 1}
              onClick={() => changePage(currentPage - 1)}
            >
              Προηγούμενη
            </button>
            {pageNumbers.map((pageNumber) => (
              <button
                key={pageNumber}
                type="button"
                className={
                  pageNumber === currentPage
                    ? 'pageNumberButton active'
                    : 'pageNumberButton'
                }
                onClick={() => changePage(pageNumber)}
              >
                {pageNumber}
              </button>
            ))}
            <button
              type="button"
              className="ghost compactButton"
              disabled={currentPage >= totalPages}
              onClick={() => changePage(currentPage + 1)}
            >
              Επόμενη
            </button>
            <button
              type="button"
              className="ghost compactButton"
              disabled={currentPage >= totalPages}
              onClick={() => changePage(totalPages)}
            >
              Τελευταία
            </button>
          </div>
        </div>

        {selectedRow ? (
          <DataDetailDialog
            entity={activeEntity}
            row={selectedRow}
            columns={config.columns}
            onClose={() => setSelectedRow(null)}
          />
        ) : null}
        {formModal ? (
          <DataFormDialog
            config={dataFormConfig(formModal.entity, formModal.mode)}
            mode={formModal.mode}
            row={formModal.row}
            saving={saving}
            onSubmit={(values, options) => submitDataForm(values, options)}
            onClose={() => setFormModal(null)}
          />
        ) : null}
        {importModal ? (
          <DataImportPreviewDialog
            entity={importModal.entity}
            fileName={importModal.file.name}
            preview={importModal.preview}
            loading={importing}
            onConfirm={() => void commitExcelImport()}
            onClose={() => setImportModal(null)}
          />
        ) : null}
        {deleteRow ? (
          <ConfirmDialog
            title="Είστε σίγουρος;"
            message={`Η εγγραφή ${dataRowTitle(activeEntity, deleteRow)} δεν θα σβηστεί οριστικά. Θα γίνει ανενεργή/retired ώστε να διατηρηθεί το ιστορικό κινήσεων.`}
            confirmLabel="Απενεργοποίηση"
            loading={saving}
            onConfirm={() => void confirmDeleteDataRow()}
            onClose={() => setDeleteRow(null)}
          />
        ) : null}
        <WorkflowResultDialog
          modal={resultModal}
          onClose={() => setResultModal(null)}
        />
      </OperationCard>
    </div>
  );
}

function movementRelevantPhotoCount(movement: DataItem) {
  const type = textValue(movement.type);

  if (type === 'FAULT_RESTORED') {
    return (
      numberValue(movement.repairCompletionPhotoCount) ??
      numberValue(movement.photoCount) ??
      0
    );
  }

  if (type === 'FAULT_DECLARED') {
    return (
      numberValue(movement.faultDeclarationPhotoCount) ??
      numberValue(movement.photoCount) ??
      0
    );
  }

  return numberValue(movement.photoCount) ?? 0;
}

function movementTotalPhotoCount(movement: DataItem) {
  const faultCount = numberValue(movement.faultDeclarationPhotoCount);
  const completionCount = numberValue(movement.repairCompletionPhotoCount);

  if (faultCount !== null || completionCount !== null) {
    return (faultCount ?? 0) + (completionCount ?? 0);
  }

  return numberValue(movement.photoCount) ?? 0;
}

function MovementPhotoButton({
  movement,
  onOpen,
}: {
  movement: DataItem;
  onOpen: () => void;
}) {
  const photoCount = movementRelevantPhotoCount(movement);
  const repairId = textValue(movement.repairId);

  if (photoCount <= 0 || !repairId) {
    return <span className="mutedCell">—</span>;
  }

  return (
    <button
      type="button"
      className="photoCountButton"
      onClick={(event) => {
        event.stopPropagation();
        onOpen();
      }}
      onKeyDown={(event) => event.stopPropagation()}
    >
      {photoCount} φωτο
    </button>
  );
}

function MovementDetailDialog({
  movement,
  onShowPhotos,
  onClose,
}: {
  movement: DataItem;
  onShowPhotos: () => void;
  onClose: () => void;
}) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose();
      }
    }

    document.addEventListener('keydown', handleKeyDown);

    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const type = textValue(movement.typeLabel) || textValue(movement.type) || '-';
  const photoCount = movementRelevantPhotoCount(movement);
  const totalPhotoCount = movementTotalPhotoCount(movement);
  const repairId = textValue(movement.repairId);
  const rows = [
    ['Τύπος κίνησης', type],
    ['Έναρξη', formatDateTime(textValue(movement.startedAt)) || '-'],
    ['Λήξη', formatDateTime(textValue(movement.endedAt)) || '-'],
    ['Vacuum', movementVacuumText(movement)],
    ['Μηχάνημα', textValue(movement.machineCode) || '-'],
    ['Θέση / Rack', textValue(movement.rackCode) || '-'],
    ['Βλάβη', movementFaultText(movement)],
    ['Φωτογραφίες', photoCount > 0 ? `${photoCount} φωτογραφίες` : '-'],
    ['Λεπτομέρειες', movementDetailsText(movement) || '-'],
  ];

  return (
    <ModalPortal>
      <div className="modalBackdrop" role="presentation">
      <section
        className="detailDialog movementDetailDialog"
        role="dialog"
        aria-modal="true"
      >
        <div className="modalTitleRow">
          <div>
            <p className="eyebrow">Λεπτομέρειες κίνησης</p>
            <h2>{type}</h2>
          </div>
          <button type="button" className="closeButton" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="movementDetailGrid">
          {rows.map(([label, value]) => (
            <div key={label} className="movementDetailField">
              <span>{label}</span>
              <strong>{value}</strong>
            </div>
          ))}
        </div>
        <details>
          <summary>Τεχνικές λεπτομέρειες / raw movement row</summary>
          <pre>{JSON.stringify(movement, null, 2)}</pre>
        </details>
        <div className="modalActions">
          {totalPhotoCount > 0 && repairId ? (
            <button type="button" className="ghost" onClick={onShowPhotos}>
              Προβολή φωτογραφιών
            </button>
          ) : null}
          <button type="button" className="primary" onClick={onClose}>
            Κλείσιμο
          </button>
        </div>
      </section>
      </div>
    </ModalPortal>
  );
}

function RepairPhotoGalleryDialog({
  api,
  movement,
  onPhotosChanged,
  onClose,
}: {
  api: AdminApiClient;
  movement: DataItem;
  onPhotosChanged: () => void;
  onClose: () => void;
}) {
  const repairId = textValue(movement.repairId);
  const [payload, setPayload] = useState<ApiPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiPayload | null>(null);
  const [deleteError, setDeleteError] = useState<ApiPayload | null>(null);
  const [deletingPhotoId, setDeletingPhotoId] = useState<string | null>(null);

  const loadPhotos = useCallback(async () => {
    if (!repairId) {
      setLoading(false);
      setError({
        ok: false,
        message: 'Δεν υπάρχει Repair ID για αυτή την κίνηση.',
      });
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await api.getRepairPhotos(repairId);
      setPayload(result);
    } catch (caught) {
      setError(errorPayload(caught));
    } finally {
      setLoading(false);
    }
  }, [api, repairId]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose();
      }
    }

    document.addEventListener('keydown', handleKeyDown);

    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;

    async function loadPhotos() {
      if (!repairId) {
        setLoading(false);
        setError({
          ok: false,
          message: 'Δεν υπάρχει Repair ID για αυτή την κίνηση.',
        });
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const result = await api.getRepairPhotos(repairId);

        if (!cancelled) {
          setPayload(result);
        }
      } catch (caught) {
        if (!cancelled) {
          setError(errorPayload(caught));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadPhotos();

    return () => {
      cancelled = true;
    };
  }, [api, repairId]);

  const photos: DataItem[] = [];
  const faultDeclarationPhotos = photoStageItems(
    payload,
    'faultDeclarationPhotos',
    'FAULT_DECLARATION',
  );
  const repairCompletionPhotos = photoStageItems(
    payload,
    'repairCompletionPhotos',
    'REPAIR_COMPLETION',
  );
  const photoTotal =
    faultDeclarationPhotos.length + repairCompletionPhotos.length;

  async function deletePhoto(photo: DataItem) {
    const photoId = textValue(photo.id);

    if (!repairId || !photoId) {
      return;
    }

    const confirmed = window.confirm(
      'Η φωτογραφία θα διαγραφεί οριστικά από το αποθηκευτικό μέσο.',
    );

    if (!confirmed) {
      return;
    }

    setDeletingPhotoId(photoId);
    setDeleteError(null);

    try {
      await api.deleteRepairPhoto(repairId, photoId);
      await loadPhotos();
      onPhotosChanged();
    } catch (caught) {
      setDeleteError(errorPayload(caught));
    } finally {
      setDeletingPhotoId(null);
    }
  }

  return (
    <ModalPortal>
      <div className="modalBackdrop" role="presentation">
        <section
          className="detailDialog photoGalleryDialog"
          role="dialog"
          aria-modal="true"
        >
          <div className="modalTitleRow">
            <div>
              <p className="eyebrow">Repair {repairId || '-'}</p>
              <h2>Φωτογραφίες Βλάβης</h2>
            </div>
            <button type="button" className="closeButton" onClick={onClose}>
              ×
            </button>
          </div>
          <p className="smallText">
            {movementVacuumText(movement)} · {movementFaultText(movement)}
          </p>
          {loading ? <Notice tone="info">Φόρτωση φωτογραφιών...</Notice> : null}
          <ResponsePanel payload={null} error={error ?? deleteError} />
          {!loading && !error && photoTotal === 0 ? (
            <Notice tone="warning">Δεν υπάρχουν φωτογραφίες για αυτό το Repair.</Notice>
          ) : null}
          <RepairPhotoStageSection
            title="Φωτογραφίες δήλωσης βλάβης"
            photos={faultDeclarationPhotos}
            deletingPhotoId={deletingPhotoId}
            onDelete={(photo) => void deletePhoto(photo)}
          />
          <RepairPhotoStageSection
            title="Φωτογραφίες αποκατάστασης"
            photos={repairCompletionPhotos}
            deletingPhotoId={deletingPhotoId}
            onDelete={(photo) => void deletePhoto(photo)}
          />
          {photos.length > 0 ? (
            <div className="photoGalleryGrid">
              {photos.map((photo) => {
                const url = textValue(photo.url);
                const filename = textValue(photo.filename) || 'repair-photo';
                const createdAt =
                  formatDateTime(textValue(photo.createdAt)) ||
                  textValue(photo.createdAt);

                return (
                  <article key={textValue(photo.id)} className="photoCard">
                    {url ? (
                      <a href={url} target="_blank" rel="noreferrer">
                        <img src={url} alt={filename} loading="lazy" />
                      </a>
                    ) : (
                      <div className="photoUnavailable">
                        Δεν υπάρχει διαθέσιμο URL προβολής.
                      </div>
                    )}
                    <div className="photoMeta">
                      <strong>{filename}</strong>
                      <span>{createdAt || '-'}</span>
                      <span>{formatBytes(numberValue(photo.sizeBytes))}</span>
                      {textValue(photo.caption) ? (
                        <span>{textValue(photo.caption)}</span>
                      ) : null}
                    </div>
                  </article>
                );
              })}
            </div>
          ) : null}
          <details>
            <summary>Τεχνικές λεπτομέρειες / raw photo metadata</summary>
            <pre>{JSON.stringify(payload ?? error ?? deleteError ?? {}, null, 2)}</pre>
          </details>
          <div className="modalActions">
            <button type="button" className="primary" onClick={onClose}>
              Κλείσιμο
            </button>
          </div>
        </section>
      </div>
    </ModalPortal>
  );
}

function RepairPhotoStageSection({
  title,
  photos,
  deletingPhotoId,
  onDelete,
}: {
  title: string;
  photos: DataItem[];
  deletingPhotoId: string | null;
  onDelete: (photo: DataItem) => void;
}) {
  return (
    <section className="photoStageSection">
      <div className="photoStageHeader">
        <h3>{title}</h3>
        <span>{photos.length} φωτο</span>
      </div>
      {photos.length === 0 ? (
        <p className="smallText">Δεν υπάρχουν φωτογραφίες σε αυτή την ενότητα.</p>
      ) : (
        <div className="photoGalleryGrid">
          {photos.map((photo) => {
            const photoId = textValue(photo.id);
            const url = textValue(photo.url);
            const filename = textValue(photo.filename) || 'repair-photo';
            const createdAt =
              formatDateTime(textValue(photo.createdAt)) ||
              textValue(photo.createdAt);

            return (
              <article key={photoId} className="photoCard">
                {url ? (
                  <a href={url} target="_blank" rel="noreferrer">
                    <img src={url} alt={filename} loading="lazy" />
                  </a>
                ) : (
                  <div className="photoUnavailable">
                    Δεν υπάρχει διαθέσιμο URL προβολής.
                  </div>
                )}
                <div className="photoMeta">
                  <strong>{filename}</strong>
                  <span>{createdAt || '-'}</span>
                  <span>{formatBytes(numberValue(photo.sizeBytes))}</span>
                  {textValue(photo.caption) ? (
                    <span>{textValue(photo.caption)}</span>
                  ) : null}
                </div>
                <button
                  type="button"
                  className="dangerTextButton"
                  disabled={deletingPhotoId === photoId}
                  onClick={() => onDelete(photo)}
                >
                  {deletingPhotoId === photoId ? 'Διαγραφή...' : 'Διαγραφή'}
                </button>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

function photoStageItems(
  payload: ApiPayload | null,
  groupedKey: string,
  stage: string,
) {
  if (Array.isArray(payload?.[groupedKey])) {
    return payload[groupedKey] as DataItem[];
  }

  if (!Array.isArray(payload?.photos)) {
    return [];
  }

  return (payload.photos as DataItem[]).filter(
    (photo) => textValue(photo.stage) === stage,
  );
}

function DataDetailDialog({
  entity,
  row,
  columns,
  onClose,
}: {
  entity: DataEntityId;
  row: DataItem;
  columns: DataColumn[];
  onClose: () => void;
}) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose();
      }
    }

    document.addEventListener('keydown', handleKeyDown);

    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <ModalPortal>
      <div className="modalBackdrop" role="presentation">
      <section
        className="detailDialog movementDetailDialog"
        role="dialog"
        aria-modal="true"
      >
        <div className="modalTitleRow">
          <div>
            <p className="eyebrow">Λεπτομέρειες δεδομένων</p>
            <h2>{dataRowTitle(entity, row)}</h2>
          </div>
          <button type="button" className="closeButton" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="movementDetailGrid">
          {columns.map((column) => (
            <div key={column.key} className="movementDetailField">
              <span>{column.header}</span>
              <strong>{column.value(row) || '-'}</strong>
            </div>
          ))}
        </div>
        <details>
          <summary>Τεχνικές λεπτομέρειες / raw master data row</summary>
          <pre>{JSON.stringify(row, null, 2)}</pre>
        </details>
        <div className="modalActions">
          <button type="button" className="primary" onClick={onClose}>
            Κλείσιμο
          </button>
        </div>
      </section>
      </div>
    </ModalPortal>
  );
}

function DataFormDialog({
  config,
  mode,
  row,
  saving,
  onSubmit,
  onClose,
}: {
  config: ReturnType<typeof dataFormConfig>;
  mode: 'create' | 'edit';
  row?: DataItem;
  saving: boolean;
  onSubmit: (
    values: ApiPayload,
    options?: { keepOpen?: boolean },
  ) => Promise<boolean>;
  onClose: () => void;
}) {
  const [values, setValues] = useState<Record<string, string | boolean>>(() =>
    dataInitialFormValues(config.fields, row),
  );
  const [error, setError] = useState('');
  const visibleFields = config.fields.filter((field) =>
    isDataFormFieldVisible(field, values, mode),
  );
  const selectedLocationStatus = textValue(values.locationStatus);
  const showVacuumLocationNote =
    config.entity === 'vacuums' &&
    visibleFields.some((field) => field.key === 'locationStatus') &&
    Boolean(selectedLocationStatus);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose();
      }
    }

    document.addEventListener('keydown', handleKeyDown);

    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  async function submit(
    event: { preventDefault: () => void },
    options: { keepOpen?: boolean } = {},
  ) {
    event.preventDefault();

    const missingField = visibleFields.find(
      (field) =>
        field.required &&
        typeof values[field.key] === 'string' &&
        !textValue(values[field.key]),
    );

    if (missingField) {
      setError(`Συμπληρώστε το πεδίο: ${missingField.label}.`);
      return;
    }

    setError('');
    const ok = await onSubmit(dataFormPayload(visibleFields, values), options);

    if (ok && options.keepOpen) {
      setValues(dataInitialFormValues(config.fields));
    }
  }

  function setFieldValue(field: DataFormField, value: string | boolean) {
    setValues((current) => ({ ...current, [field.key]: value }));
  }

  return (
    <ModalPortal>
      <div className="modalBackdrop" role="presentation">
      <section
        className="detailDialog dataFormDialog"
        role="dialog"
        aria-modal="true"
      >
        <div className="modalTitleRow">
          <div>
            <p className="eyebrow">{mode === 'create' ? 'Νέα εγγραφή' : 'Επεξεργασία'}</p>
            <h2>{config.title}</h2>
          </div>
          <button type="button" className="closeButton" onClick={onClose}>
            ×
          </button>
        </div>
        <form className="dataFormGrid" onSubmit={(event) => void submit(event)}>
          {visibleFields.map((field, index) => {
            const previousSection = visibleFields[index - 1]?.section;
            const showSection = field.section && field.section !== previousSection;

            return (
              <div
                key={field.key}
                className={
                  field.type === 'textarea' ? 'field fullWidthField' : 'field'
                }
              >
                {showSection ? (
                  <h3 className="formSectionTitle">{field.section}</h3>
                ) : null}
                <label>
                  <span>
                    {field.label}
                    {field.required ? ' *' : ''}
                  </span>
                  {field.type === 'select' ? (
                    <select
                      value={String(values[field.key] ?? '')}
                      onChange={(event) =>
                        setFieldValue(field, event.target.value)
                      }
                      disabled={field.readOnly}
                    >
                      {field.options?.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  ) : field.type === 'textarea' ? (
                    <textarea
                      value={String(values[field.key] ?? '')}
                      onChange={(event) =>
                        setFieldValue(field, event.target.value)
                      }
                      readOnly={field.readOnly}
                      rows={3}
                    />
                  ) : field.type === 'checkbox' ? (
                    <input
                      type="checkbox"
                      checked={Boolean(values[field.key])}
                      disabled={field.readOnly}
                      onChange={(event) =>
                        setFieldValue(field, event.target.checked)
                      }
                    />
                  ) : (
                    <input
                      type={field.type}
                      value={String(values[field.key] ?? '')}
                      onChange={(event) =>
                        setFieldValue(field, event.target.value)
                      }
                      readOnly={field.readOnly}
                    />
                  )}
                </label>
              </div>
            );
          })}
          {config.entity === 'vacuums' && mode === 'create' ? (
            <p className="smallText fullWidthField">
              Το Code δημιουργείται αυτόματα από το backend με το επόμενο
              διαθέσιμο VP-###.
            </p>
          ) : null}
          {config.entity === 'vacuums' && mode === 'edit' ? (
            <p className="smallText fullWidthField">
              Το Code είναι read-only για να μείνει σταθερή η ταυτότητα του
              Vacuum.
            </p>
          ) : null}
          {showVacuumLocationNote ? (
            <Notice tone="info">
              Η φόρμα master data ενημερώνει μόνο το status. Η τρέχουσα
              θέση/μηχάνημα αλλάζει από τις ροές Χρέωσης, Αποχρέωσης και
              Βλαβών.
            </Notice>
          ) : null}
          <p className="smallText fullWidthField">
            Το `qrCode` δημιουργείται αυτόματα ως deprecated alias και δεν
            εισάγεται χειροκίνητα.
          </p>
          {error ? <Notice tone="error">{error}</Notice> : null}
          <div className="modalActions fullWidthField">
            <button type="button" className="ghost" onClick={onClose}>
              Ακύρωση
            </button>
            {mode === 'create' ? (
              <button
                type="button"
                className="ghost"
                disabled={saving}
                onClick={(event) => void submit(event, { keepOpen: true })}
              >
                {saving ? 'Αποθήκευση...' : 'Αποθήκευση και νέα εγγραφή'}
              </button>
            ) : null}
            <button type="submit" className="primary" disabled={saving}>
              {saving ? 'Αποθήκευση...' : 'Αποθήκευση'}
            </button>
          </div>
        </form>
      </section>
      </div>
    </ModalPortal>
  );
}

function DataImportPreviewDialog({
  entity,
  fileName,
  preview,
  loading,
  onConfirm,
  onClose,
}: {
  entity: DataEntityId;
  fileName: string;
  preview: ApiPayload;
  loading: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const summary = importEntitySummary(preview, entity);
  const warnings = arrayValue(preview.warnings);
  const errors = arrayValue(preview.errors);
  const canCommit = preview.ok === true && errors.length === 0;

  return (
    <ModalPortal>
      <div className="modalBackdrop" role="presentation">
        <section
          className="detailDialog importPreviewDialog"
          role="dialog"
          aria-modal="true"
        >
          <div className="modalTitleRow">
            <div>
              <p className="eyebrow">Προεπισκόπηση εισαγωγής</p>
              <h2>{dataEntityLabel(entity)}</h2>
              <p className="smallText">{fileName}</p>
            </div>
            <button type="button" className="closeButton" onClick={onClose}>
              ×
            </button>
          </div>

          <div className="importSummaryGrid">
            <MetricPill label="Rows" value={summary.rowsRead} />
            <MetricPill label="Creates" value={summary.creates} />
            <MetricPill label="Updates" value={summary.updates} />
            <MetricPill label="Unchanged" value={summary.unchanged} />
            <MetricPill label="Incomplete" value={summary.incomplete} />
          </div>

          {warnings.length > 0 ? (
            <Notice tone="warning">
              <strong>Warnings</strong>
              <ul className="messageList">
                {warnings.map((warning, index) => (
                  <li key={`${warning}-${index}`}>{textValue(warning)}</li>
                ))}
              </ul>
            </Notice>
          ) : null}

          {errors.length > 0 ? (
            <Notice tone="error">
              <strong>Errors</strong>
              <ul className="messageList">
                {errors.map((error, index) => (
                  <li key={`${error}-${index}`}>{textValue(error)}</li>
                ))}
              </ul>
            </Notice>
          ) : null}

          <details>
            <summary>Τεχνικές λεπτομέρειες / raw preview</summary>
            <pre>{JSON.stringify(preview, null, 2)}</pre>
          </details>

          <div className="modalActions">
            <button type="button" className="ghost" onClick={onClose}>
              Κλείσιμο
            </button>
            <button
              type="button"
              className="primary"
              disabled={!canCommit || loading}
              onClick={onConfirm}
            >
              {loading ? 'Εισαγωγή...' : 'Επιβεβαίωση εισαγωγής'}
            </button>
          </div>
        </section>
      </div>
    </ModalPortal>
  );
}

function MetricPill({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="metricPill">
      <span>{label}</span>
      <strong>{textValue(value) || '0'}</strong>
    </div>
  );
}

function ConfirmDialog({
  title,
  message,
  confirmLabel,
  loading,
  onConfirm,
  onClose,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  loading: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose();
      }
    }

    document.addEventListener('keydown', handleKeyDown);

    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <ModalPortal>
      <div className="modalBackdrop" role="presentation">
      <section className="messageDialog warning" role="dialog" aria-modal="true">
        <div className="modalTitleRow">
          <div>
            <p className="eyebrow">Master data</p>
            <h2>{title}</h2>
          </div>
          <button type="button" className="closeButton" onClick={onClose}>
            ×
          </button>
        </div>
        <p className="messageBody">{message}</p>
        <div className="modalActions">
          <button type="button" className="ghost" onClick={onClose}>
            Ακύρωση
          </button>
          <button type="button" className="primary" disabled={loading} onClick={onConfirm}>
            {loading ? 'Εκτέλεση...' : confirmLabel}
          </button>
        </div>
      </section>
      </div>
    </ModalPortal>
  );
}

function SettingsDialog({
  api,
  draftBaseUrl,
  savedBaseUrl,
  isEditing,
  onChange,
  onEdit,
  onSave,
  onCancel,
  onClose,
}: {
  api: AdminApiClient;
  draftBaseUrl: string;
  savedBaseUrl: string;
  isEditing: boolean;
  onChange: (value: string) => void;
  onEdit: () => void;
  onSave: () => void;
  onCancel: () => void;
  onClose: () => void;
}) {
  return (
    <ModalPortal>
      <div className="modalBackdrop" role="presentation">
      <section className="settingsDialog" role="dialog" aria-modal="true">
        <div className="modalTitleRow">
          <div>
            <p className="eyebrow">Admin settings</p>
            <h2>Ρυθμίσεις σύνδεσης</h2>
          </div>
          <button type="button" className="closeButton" onClick={onClose}>
            ×
          </button>
        </div>
        <BackendUrlPanel
          draftBaseUrl={draftBaseUrl}
          savedBaseUrl={savedBaseUrl}
          isEditing={isEditing}
          onChange={onChange}
          onEdit={onEdit}
          onSave={onSave}
          onCancel={onCancel}
        />
        <ConnectionCheckPanel api={api} apiBaseUrl={savedBaseUrl} />
      </section>
      </div>
    </ModalPortal>
  );
}

function ConnectionCheckPanel({
  api,
  apiBaseUrl,
}: {
  api: AdminApiClient;
  apiBaseUrl: string;
}) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ApiPayload | null>(null);
  const [error, setError] = useState<ApiPayload | null>(null);

  async function checkHealth() {
    setLoading(true);
    setResult(null);
    setError(null);

    try {
      const [apiHealth, databaseHealth] = await Promise.all([
        api.getHealth(),
        api.getDatabaseHealth(),
      ]);
      setResult({ apiHealth, databaseHealth });
    } catch (caught) {
      setError(errorPayload(caught));
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="settingsSection">
      <div className="cardHeader">
        <div>
          <h3>Έλεγχος Backend</h3>
          <p>Σύνδεση προς {apiBaseUrl}</p>
        </div>
      </div>
      <button type="button" disabled={loading} onClick={checkHealth}>
        {loading ? 'Έλεγχος...' : 'Έλεγχος σύνδεσης'}
      </button>
      {result ? (
        <div className="healthPills">
          <HealthPill label="API" payload={result.apiHealth} />
          <HealthPill label="Database" payload={result.databaseHealth} />
        </div>
      ) : null}
      <ResponsePanel payload={result} error={error} />
    </section>
  );
}

function StatusSummaryCard({
  data,
  loading,
  error,
  lastUpdatedAt,
  liveStatus,
  lastEventAt,
  onRefresh,
}: {
  data: AdminData;
  loading: boolean;
  error: ApiPayload | null;
  lastUpdatedAt: Date | null;
  liveStatus: LiveConnectionStatus;
  lastEventAt: Date | null;
  onRefresh: () => Promise<void>;
}) {
  const [detailKind, setDetailKind] = useState<StatusDetailKind | null>(null);
  const active = numberValue(data.summary?.active) ?? data.activeVacuums.length;
  const inactive =
    numberValue(data.summary?.inactive) ?? data.inactiveVacuums.length;
  const repair = numberValue(data.summary?.repair) ?? data.repairVacuums.length;

  return (
    <OperationCard
      title="Σύνοψη Vacuum"
      subtitle="Ζωντανή εικόνα από τα Vacuum"
      accent="blue"
      wide
    >
      <div className="summaryHeader">
        <div className="metricGrid">
          <Metric
            label="Ενεργά Vacuum"
            value={active}
            tone="success"
            onClick={() => setDetailKind('active')}
          />
          <Metric
            label="Ανενεργά Vacuum"
            value={inactive}
            tone="neutral"
            onClick={() => setDetailKind('inactive')}
          />
          <Metric
            label="Προς επισκευή Vacuum"
            value={repair}
            tone="warning"
            onClick={() => setDetailKind('repair')}
          />
        </div>
        <div className="liveRefreshPanel">
          <span className={`liveBadge ${liveStatus}`}>
            {liveStatusLabel(liveStatus)}
          </span>
          <span className="smallText">
            Τελευταίο συμβάν: {lastEventAt ? formatTime(lastEventAt) : 'αναμονή'}
          </span>
          <span className="smallText">
            Τελευταία ενημέρωση: {lastUpdatedAt ? formatTime(lastUpdatedAt) : 'αναμονή'}
          </span>
          <button type="button" disabled={loading} onClick={() => void onRefresh()}>
            {loading ? 'Ανανέωση...' : 'Ανανέωση'}
          </button>
        </div>
      </div>
      {loading ? <Notice tone="info">Ανανέωση δεδομένων...</Notice> : null}
      <ResponsePanel payload={null} error={error} />
      {detailKind ? (
        <SummaryDetailModal
          kind={detailKind}
          data={data}
          loading={loading}
          error={error}
          onClose={() => setDetailKind(null)}
        />
      ) : null}
    </OperationCard>
  );
}

function SummaryDetailModal({
  kind,
  data,
  loading,
  error,
  onClose,
}: {
  kind: StatusDetailKind;
  data: AdminData;
  loading: boolean;
  error: ApiPayload | null;
  onClose: () => void;
}) {
  const title =
    kind === 'active'
      ? 'Ενεργά Vacuum'
      : kind === 'inactive'
        ? 'Ανενεργά Vacuum'
        : 'Προς επισκευή Vacuum';
  const items =
    kind === 'active'
      ? data.activeVacuums
      : kind === 'inactive'
        ? data.inactiveVacuums
        : data.repairVacuums;

  return (
    <ModalPortal>
      <div className="modalBackdrop" role="presentation">
      <section className="detailDialog" role="dialog" aria-modal="true">
        <div className="modalTitleRow">
          <div>
            <p className="eyebrow">Λεπτομέρειες status</p>
            <h2>{title}</h2>
          </div>
          <button type="button" className="closeButton" onClick={onClose}>
            ×
          </button>
        </div>
        {loading ? <Notice tone="info">Ανανέωση δεδομένων...</Notice> : null}
        <ResponsePanel payload={null} error={error} />
        <div className="detailTableWrap">
          <table className="detailTable">
            <thead>
              <tr>
                <th>Vacuum</th>
                <th>{kind === 'active' ? 'Μηχάνημα' : 'Θέση'}</th>
                <th>{kind === 'active' ? 'Ημερομηνία/ώρα χρέωσης' : 'Από ημερομηνία/ώρα'}</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={3}>Δεν υπάρχουν εγγραφές.</td>
                </tr>
              ) : (
                items.map((item) => (
                  <tr key={textValue(item.id) || vacuumPrimaryText(item)}>
                    <td>
                      <strong>{vacuumPrimaryText(item)}</strong>
                      {textValue(item.description) ? (
                        <span>{textValue(item.description)}</span>
                      ) : null}
                    </td>
                    <td>{statusLocationText(kind, item)}</td>
                    <td>{statusDateText(kind, item)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
      </div>
    </ModalPortal>
  );
}

function ChargeCard({
  api,
  vacuums,
  machines,
  dataLoading,
  dataError,
  onWorkflowSuccess,
}: {
  api: AdminApiClient;
  vacuums: DataItem[];
  machines: DataItem[];
  dataLoading: boolean;
  dataError: ApiPayload | null;
  onWorkflowSuccess: () => Promise<void>;
}) {
  const [vacuumQr, setVacuumQr] = useState('');
  const [machineQr, setMachineQr] = useState('');
  const action = useWorkflowAction();

  const body = () => ({
    vacuumQr,
    machineQr,
    deviceId: ADMIN_DEVICE_ID,
  });

  function submitCharge() {
    void action.runWorkflow({
      preview: () => api.chargePreview(body()),
      write: () => api.charge(body()),
      allowedDecisions: ['CAN_CHARGE'],
      onSuccess: onWorkflowSuccess,
    });
  }

  return (
    <OperationCard
      title="Χρέωση"
      subtitle="Έλεγχος Vacuum και ανάθεση σε μηχάνημα"
      accent="blue"
    >
      <WorkflowForm
        onSubmit={(event) => {
          event.preventDefault();
          submitCharge();
        }}
      >
        <SearchableSelector
          label="Vacuum serial / QR"
          value={vacuumQr}
          onChange={setVacuumQr}
          options={vacuums}
          loading={dataLoading}
          error={dataError}
          placeholder="19081291644 ή VAC:19081291644"
          getValue={(item) => textValue(item.serialNumber)}
          getPrimaryText={vacuumPrimaryText}
          getSecondaryText={vacuumSecondaryText}
          getBadge={vacuumBadge}
        />
        <SearchableSelector
          label="Machine code"
          value={machineQr}
          onChange={setMachineQr}
          options={machines}
          loading={dataLoading}
          error={dataError}
          placeholder="MACH-001 ή MACHINE:MACH-001"
          getValue={(item) => textValue(item.code)}
          getPrimaryText={machinePrimaryText}
          getSecondaryText={machineSecondaryText}
          getBadge={machineBadge}
        />
        <ButtonRow>
          <button
            type="submit"
            className="primary"
            disabled={action.loading || !vacuumQr.trim() || !machineQr.trim()}
          >
            Χρέωση
          </button>
        </ButtonRow>
      </WorkflowForm>
      <WorkflowResultDialog modal={action.modal} onClose={action.closeModal} />
    </OperationCard>
  );
}

function DechargeCard({
  api,
  vacuums,
  racks,
  dataLoading,
  dataError,
  onWorkflowSuccess,
}: {
  api: AdminApiClient;
  vacuums: DataItem[];
  racks: DataItem[];
  dataLoading: boolean;
  dataError: ApiPayload | null;
  onWorkflowSuccess: () => Promise<void>;
}) {
  const [vacuumQr, setVacuumQr] = useState('');
  const [rackQr, setRackQr] = useState('');
  const action = useWorkflowAction();

  const body = () => ({
    vacuumQr,
    rackQr,
    deviceId: ADMIN_DEVICE_ID,
  });

  function submitDecharge() {
    void action.runWorkflow({
      preview: () =>
        api.dechargePreview({
          vacuumQr,
          rackQr,
          deviceId: ADMIN_DEVICE_ID,
        }),
      write: () => api.decharge(body()),
      allowedDecisions: ['CAN_DECHARGE', 'REPAIR_INTAKE_REQUIRED'],
      onSuccess: onWorkflowSuccess,
    });
  }

  return (
    <OperationCard
      title="Αποχρέωση"
      subtitle="Μεταφορά Vacuum από μηχάνημα σε θέση Rack"
      accent="amber"
    >
      <WorkflowForm
        onSubmit={(event) => {
          event.preventDefault();
          submitDecharge();
        }}
      >
        <SearchableSelector
          label="Vacuum serial / QR"
          value={vacuumQr}
          onChange={setVacuumQr}
          options={vacuums}
          loading={dataLoading}
          error={dataError}
          placeholder="19081291644 ή VAC:19081291644"
          getValue={(item) => textValue(item.serialNumber)}
          getPrimaryText={vacuumPrimaryText}
          getSecondaryText={vacuumSecondaryText}
          getBadge={vacuumBadge}
        />
        <SearchableSelector
          label="Rack code"
          value={rackQr}
          onChange={setRackQr}
          options={racks}
          loading={dataLoading}
          error={dataError}
          placeholder="RACK-A-01-01 ή RACK:RACK-A-01-01"
          getValue={(item) => textValue(item.code)}
          getPrimaryText={rackPrimaryText}
          getSecondaryText={rackSecondaryText}
          getBadge={rackBadge}
        />
        <ButtonRow>
          <button
            type="submit"
            className="primary"
            disabled={action.loading || !vacuumQr.trim() || !rackQr.trim()}
          >
            Αποχρέωση
          </button>
        </ButtonRow>
      </WorkflowForm>
      <WorkflowResultDialog modal={action.modal} onClose={action.closeModal} />
    </OperationCard>
  );
}

function FaultDeclarationCard({
  api,
  vacuums,
  repairRacks,
  faultCatalog,
  dataLoading,
  dataError,
  onWorkflowSuccess,
}: {
  api: AdminApiClient;
  vacuums: DataItem[];
  repairRacks: DataItem[];
  faultCatalog: DataItem[];
  dataLoading: boolean;
  dataError: ApiPayload | null;
  onWorkflowSuccess: () => Promise<void>;
}) {
  const [vacuumQr, setVacuumQr] = useState('');
  const [rackQr, setRackQr] = useState('');
  const [selectedFaultCode, setSelectedFaultCode] = useState('');
  const [otherText, setOtherText] = useState('');
  const action = useWorkflowAction();

  const faultBody =
    selectedFaultCode === 'OTHER'
      ? { faultOtherText: otherText.trim() }
      : { faultCatalogCode: selectedFaultCode || undefined };

  const body = () => ({
    vacuumQr,
    rackQr,
    ...faultBody,
    deviceId: ADMIN_DEVICE_ID,
  });

  const canSubmit =
    vacuumQr.trim() &&
    rackQr.trim() &&
    selectedFaultCode.trim();

  const selectedItem = faultCatalog.find(
    (item) => textValue(item.code) === selectedFaultCode,
  );

  function submitFaultDeclaration() {
    if (selectedFaultCode === 'OTHER' && !otherText.trim()) {
      action.showModal({
        title: 'Σφάλμα',
        message: 'Συμπληρώστε την περιγραφή της βλάβης.',
        tone: 'error',
      });
      return;
    }

    void action.runWorkflow({
      preview: () => api.faultDeclarationPreview(body()),
      write: () => api.faultDeclaration(body()),
      allowedDecisions: ['CAN_DECLARE_FAULT'],
      onSuccess: onWorkflowSuccess,
    });
  }

  return (
    <OperationCard
      title="Δήλωση Βλάβης"
      subtitle="Δημιουργία Repair σε θέση επισκευής"
      accent="red"
    >
      <WorkflowForm
        onSubmit={(event) => {
          event.preventDefault();
          submitFaultDeclaration();
        }}
      >
        <SearchableSelector
          label="Vacuum serial / QR"
          value={vacuumQr}
          onChange={setVacuumQr}
          options={vacuums}
          loading={dataLoading}
          error={dataError}
          placeholder="19081291648 ή VAC:19081291648"
          getValue={(item) => textValue(item.serialNumber)}
          getPrimaryText={vacuumPrimaryText}
          getSecondaryText={vacuumSecondaryText}
          getBadge={vacuumBadge}
        />
        <SearchableSelector
          label="Repair rack code"
          value={rackQr}
          onChange={setRackQr}
          options={repairRacks}
          loading={dataLoading}
          error={dataError}
          placeholder="RACK-REP-01"
          getValue={(item) => textValue(item.code)}
          getPrimaryText={rackPrimaryText}
          getSecondaryText={rackSecondaryText}
          getBadge={rackBadge}
        />
        <SearchableSelector
          label="Είδος βλάβης"
          value={selectedFaultCode}
          onChange={(value) => {
            setSelectedFaultCode(value);
            if (value !== 'OTHER') {
              setOtherText('');
            }
          }}
          options={[
            ...faultCatalog,
            { code: 'OTHER', label: 'Άλλο', description: 'Χειροκίνητη περιγραφή' },
          ]}
          loading={dataLoading}
          error={dataError}
          placeholder="FC-001 ή Άλλο"
          getValue={(item) => textValue(item.code)}
          getPrimaryText={(item) => `${textValue(item.code)} - ${textValue(item.label)}`}
          getSecondaryText={(item) => textValue(item.description)}
          getBadge={faultBadge}
        />
        {selectedFaultCode === 'OTHER' ? (
          <TextAreaInput
            label="Περιγραφή άλλης βλάβης"
            value={otherText}
            onChange={setOtherText}
            placeholder="Περιγράψτε τη βλάβη..."
          />
        ) : null}
        <ButtonRow>
          <button
            type="submit"
            className="primary"
            disabled={action.loading || !canSubmit}
          >
            Δήλωση Βλάβης
          </button>
        </ButtonRow>
      </WorkflowForm>
      {selectedItem ? (
        <Notice tone="success">
          Επιλέχθηκε: {textValue(selectedItem.code)} - {textValue(selectedItem.label)}
        </Notice>
      ) : null}
      {dataError ? <ResponsePanel payload={null} error={dataError} /> : null}
      <WorkflowResultDialog modal={action.modal} onClose={action.closeModal} />
    </OperationCard>
  );
}

function FaultRestorationCard({
  api,
  vacuums,
  racks,
  dataLoading,
  dataError,
  onWorkflowSuccess,
}: {
  api: AdminApiClient;
  vacuums: DataItem[];
  racks: DataItem[];
  dataLoading: boolean;
  dataError: ApiPayload | null;
  onWorkflowSuccess: () => Promise<void>;
}) {
  const [vacuumQr, setVacuumQr] = useState('');
  const [rackQr, setRackQr] = useState('');
  const [outcome, setOutcome] = useState('RETURNED_TO_SERVICE');
  const [repairActions, setRepairActions] = useState('');
  const action = useWorkflowAction();

  const body = () => ({
    vacuumQr,
    rackQr,
    outcome,
    repairActions,
    deviceId: ADMIN_DEVICE_ID,
  });

  function submitFaultRestoration() {
    void action.runWorkflow({
      preview: () =>
        api.faultRestorationPreview({
          vacuumQr,
          rackQr,
          deviceId: ADMIN_DEVICE_ID,
        }),
      write: () => api.faultRestoration(body()),
      allowedDecisions: ['CAN_RESTORE'],
      onSuccess: onWorkflowSuccess,
    });
  }

  return (
    <OperationCard
      title="Αποκατάσταση Βλάβης"
      subtitle="Κλείσιμο Repair και νέα θέση Rack"
      accent="purple"
    >
      <WorkflowForm
        onSubmit={(event) => {
          event.preventDefault();
          submitFaultRestoration();
        }}
      >
        <SearchableSelector
          label="Vacuum serial / QR"
          value={vacuumQr}
          onChange={setVacuumQr}
          options={vacuums}
          loading={dataLoading}
          error={dataError}
          placeholder="Vacuum σε επισκευή"
          getValue={(item) => textValue(item.serialNumber)}
          getPrimaryText={vacuumPrimaryText}
          getSecondaryText={vacuumSecondaryText}
          getBadge={vacuumBadge}
        />
        <SearchableSelector
          label="Rack code"
          value={rackQr}
          onChange={setRackQr}
          options={racks}
          loading={dataLoading}
          error={dataError}
          placeholder="RACK-A-01-07"
          getValue={(item) => textValue(item.code)}
          getPrimaryText={rackPrimaryText}
          getSecondaryText={rackSecondaryText}
          getBadge={rackBadge}
        />
        <label className="field">
          <span>Αποτέλεσμα επισκευής</span>
          <select
            value={outcome}
            onChange={(event) => setOutcome(event.target.value)}
          >
            {outcomes.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <TextInput
          label="Ενέργειες επισκευής (προαιρετικό)"
          value={repairActions}
          onChange={setRepairActions}
          placeholder="Π.χ. καθαρισμός, αλλαγή connector"
        />
        <ButtonRow>
          <button
            type="submit"
            className="primary"
            disabled={action.loading || !vacuumQr.trim() || !rackQr.trim()}
          >
            Αποκατάσταση
          </button>
        </ButtonRow>
      </WorkflowForm>
      <WorkflowResultDialog modal={action.modal} onClose={action.closeModal} />
    </OperationCard>
  );
}

function SearchableSelector({
  label,
  value,
  onChange,
  options,
  getValue,
  getPrimaryText,
  getSecondaryText,
  placeholder,
  loading,
  error,
  getBadge,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: DataItem[];
  getValue: (item: DataItem) => string;
  getPrimaryText: (item: DataItem) => string;
  getSecondaryText?: (item: DataItem) => string;
  getBadge?: (item: DataItem) => SelectorBadge | null;
  placeholder?: string;
  loading?: boolean;
  error?: ApiPayload | null;
}) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLLabelElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const query = value.trim().toLowerCase();
  const filtered = options
    .filter((item) => {
      const haystack = [
        getValue(item),
        getPrimaryText(item),
        getSecondaryText?.(item) ?? '',
        getBadge?.(item)?.label ?? '',
      ]
        .join(' ')
        .toLowerCase();
      return !query || haystack.includes(query);
    })
    .slice(0, 8);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOpen(false);
        inputRef.current?.blur();
      }
    }

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  return (
    <label
      ref={containerRef}
      className={isOpen ? 'field selectorField open' : 'field selectorField'}
    >
      <span>{label}</span>
      <input
        ref={inputRef}
        id={inputId}
        value={value}
        role="combobox"
        aria-expanded={isOpen}
        aria-controls={`${inputId}-options`}
        aria-autocomplete="list"
        onChange={(event) => {
          onChange(event.target.value);
          setIsOpen(true);
        }}
        onFocus={() => setIsOpen(true)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            setIsOpen(true);
          }
        }}
        placeholder={placeholder}
        autoComplete="off"
      />
      {isOpen ? (
        <div className="optionList" id={`${inputId}-options`} role="listbox">
          {loading ? (
            <div className="optionState">Φόρτωση επιλογών...</div>
          ) : error ? (
            <div className="optionState errorText">
              Δεν φορτώθηκαν οι επιλογές. Μπορείτε να συνεχίσετε χειροκίνητα.
            </div>
          ) : filtered.length === 0 ? (
            <div className="optionState">
              Δεν βρέθηκαν αποτελέσματα. Μπορείτε να συνεχίσετε με χειροκίνητη τιμή.
            </div>
          ) : (
            filtered.map((item) => {
              const itemValue = getValue(item);
              const secondary = getSecondaryText?.(item);
              const badge = getBadge?.(item);
              const isSelected = itemValue === value;

              return (
                <button
                  key={`${itemValue}-${textValue(item.id)}`}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  className={isSelected ? 'optionButton selected' : 'optionButton'}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    onChange(itemValue);
                    setIsOpen(false);
                    inputRef.current?.blur();
                  }}
                >
                  <span className="optionText">
                    <strong>{getPrimaryText(item)}</strong>
                    {secondary ? <span>{secondary}</span> : null}
                  </span>
                  {badge ? (
                    <span className={`selectorBadge ${badge.tone ?? 'neutral'}`}>
                      {badge.label}
                    </span>
                  ) : null}
                </button>
              );
            })
          )}
        </div>
      ) : null}
    </label>
  );
}

function ExcelMultiSelectFilter({
  label,
  values,
  onChange,
  options,
  getValue,
  getPrimaryText,
  getSecondaryText,
  placeholder,
  loading,
  error,
  getBadge,
}: {
  label: string;
  values: string[];
  onChange: (values: string[]) => void;
  options: DataItem[];
  getValue: (item: DataItem) => string;
  getPrimaryText: (item: DataItem) => string;
  getSecondaryText?: (item: DataItem) => string;
  getBadge?: (item: DataItem) => SelectorBadge | null;
  placeholder?: string;
  loading?: boolean;
  error?: ApiPayload | null;
}) {
  const inputId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const selectedValues = cleanFilterValues(values);
  const selectedSet = new Set(selectedValues);
  const optionLabelByValue = useMemo(() => {
    const labels = new Map<string, string>();

    for (const item of options) {
      const value = getValue(item);

      if (value && !labels.has(value)) {
        labels.set(value, getPrimaryText(item));
      }
    }

    return labels;
  }, [getPrimaryText, getValue, options]);
  const normalizedQuery = query.trim().toLowerCase();
  const filtered = options.filter((item) => {
    const haystack = [
      getValue(item),
      getPrimaryText(item),
      getSecondaryText?.(item) ?? '',
      getBadge?.(item)?.label ?? '',
    ]
      .join(' ')
      .toLowerCase();

    return !normalizedQuery || haystack.includes(normalizedQuery);
  });
  const displayText =
    selectedValues.length === 0
      ? (placeholder ?? 'Επιλογή')
      : selectedValues.length === 1
        ? (optionLabelByValue.get(selectedValues[0]) ?? selectedValues[0])
        : `${selectedValues.length} επιλεγμένα`;
  const canAddManual =
    query.trim().length > 0 && !selectedSet.has(query.trim());

  function toggleValue(value: string) {
    if (!value) {
      return;
    }

    onChange(
      selectedSet.has(value)
        ? selectedValues.filter((selected) => selected !== value)
        : [...selectedValues, value],
    );
  }

  function selectVisible() {
    onChange(
      cleanFilterValues([
        ...selectedValues,
        ...filtered.map((item) => getValue(item)),
      ]),
    );
  }

  function clearSelected() {
    onChange([]);
    setQuery('');
  }

  function addManualValue() {
    const value = query.trim();

    if (!value || selectedSet.has(value)) {
      return;
    }

    onChange([...selectedValues, value]);
    setQuery('');
  }

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      window.setTimeout(() => searchRef.current?.focus(), 0);
    }
  }, [isOpen]);

  return (
    <div
      ref={containerRef}
      className={isOpen ? 'field multiSelectField open' : 'field multiSelectField'}
    >
      <span>{label}</span>
      <button
        type="button"
        className={
          selectedValues.length > 0
            ? 'multiSelectTrigger hasSelection'
            : 'multiSelectTrigger'
        }
        aria-expanded={isOpen}
        aria-controls={`${inputId}-options`}
        onClick={() => setIsOpen((current) => !current)}
      >
        <span>{displayText}</span>
        <span className="multiSelectChevron" aria-hidden="true" />
      </button>

      {isOpen ? (
        <div className="multiSelectPanel" id={`${inputId}-options`}>
          <input
            ref={searchRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                addManualValue();
              }
            }}
            placeholder="Αναζήτηση ή χειροκίνητη τιμή"
            autoComplete="off"
          />

          <div className="multiSelectActions">
            <button
              type="button"
              className="ghost compactButton"
              disabled={loading || filtered.length === 0}
              onClick={selectVisible}
            >
              Επιλογή εμφανιζόμενων
            </button>
            <button
              type="button"
              className="ghost compactButton"
              disabled={selectedValues.length === 0}
              onClick={clearSelected}
            >
              Καθαρισμός
            </button>
          </div>

          {canAddManual ? (
            <button
              type="button"
              className="manualFilterButton"
              onClick={addManualValue}
            >
              Προσθήκη "{query.trim()}"
            </button>
          ) : null}

          <div className="multiSelectList">
            {loading ? (
              <div className="optionState">Φόρτωση επιλογών...</div>
            ) : error ? (
              <div className="optionState errorText">
                Δεν φορτώθηκαν οι επιλογές.
              </div>
            ) : filtered.length === 0 ? (
              <div className="optionState">Δεν βρέθηκαν αποτελέσματα.</div>
            ) : (
              filtered.map((item) => {
                const itemValue = getValue(item);
                const secondary = getSecondaryText?.(item);
                const badge = getBadge?.(item);
                const isSelected = selectedSet.has(itemValue);

                return (
                  <button
                    key={`${itemValue}-${textValue(item.id)}`}
                    type="button"
                    className={
                      isSelected
                        ? 'multiSelectOption selected'
                        : 'multiSelectOption'
                    }
                    onClick={() => toggleValue(itemValue)}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      readOnly
                      tabIndex={-1}
                    />
                    <span className="optionText">
                      <strong>{getPrimaryText(item)}</strong>
                      {secondary ? <span>{secondary}</span> : null}
                    </span>
                    {badge ? (
                      <span className={`selectorBadge ${badge.tone ?? 'neutral'}`}>
                        {badge.label}
                      </span>
                    ) : null}
                  </button>
                );
              })
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function OperationCard({
  title,
  subtitle,
  accent,
  wide = false,
  children,
}: {
  title: string;
  subtitle?: string;
  accent: 'green' | 'blue' | 'amber' | 'red' | 'purple';
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <section className={`operationCard accent-${accent}${wide ? ' wide' : ''}`}>
      <div className="cardHeader">
        <div>
          <h2>{title}</h2>
          {subtitle ? <p>{subtitle}</p> : null}
        </div>
      </div>
      {children}
    </section>
  );
}

function WorkflowForm({
  onSubmit,
  children,
}: {
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  children: ReactNode;
}) {
  return (
    <form className="workflowForm" onSubmit={onSubmit}>
      {children}
    </form>
  );
}

function TextInput({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
      />
    </label>
  );
}

function DateTimeInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        type="datetime-local"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function TextAreaInput({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        rows={3}
      />
    </label>
  );
}

function ButtonRow({ children }: { children: ReactNode }) {
  return <div className="buttonRow">{children}</div>;
}

function Metric({
  label,
  value,
  tone,
  onClick,
}: {
  label: string;
  value: number;
  tone: SelectorBadgeTone;
  onClick: () => void;
}) {
  return (
    <button type="button" className={`metric metric-${tone}`} onClick={onClick}>
      <span>{label}</span>
      <strong>{value}</strong>
      <em>Προβολή λίστας</em>
    </button>
  );
}

function ResponsePanel({
  payload,
  error,
  successHint,
}: {
  payload: ApiPayload | null;
  error: ApiPayload | null;
  successHint?: string;
}) {
  if (!payload && !error) {
    return null;
  }

  const activePayload = error ?? payload;
  const tone: Tone = error
    ? 'error'
    : payload?.ok === false
      ? 'warning'
      : 'success';
  const title = error
    ? 'Σφάλμα'
    : String(payload?.decision ?? payload?.status ?? 'Απάντηση backend');
  const message =
    extractMessage(activePayload) ??
    (successHint && !error ? successHint : 'Η ενέργεια ολοκληρώθηκε.');

  return (
    <div className={`responsePanel ${tone}`}>
      <strong>{title}</strong>
      <p>{message}</p>
      <details>
        <summary>Τεχνικές λεπτομέρειες / raw backend decision</summary>
        <pre>{JSON.stringify(activePayload, null, 2)}</pre>
      </details>
    </div>
  );
}

function WorkflowResultDialog({
  modal,
  onClose,
}: {
  modal: WorkflowModalState | null;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!modal) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose();
      }
    }

    document.addEventListener('keydown', handleKeyDown);

    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [modal, onClose]);

  if (!modal) {
    return null;
  }

  return (
    <ModalPortal>
      <div className="modalBackdrop" role="presentation">
        <section
          className={`messageDialog ${modal.tone}`}
          role="dialog"
          aria-modal="true"
        >
          <div className="modalTitleRow">
            <div>
              <p className="eyebrow">Απάντηση workflow</p>
              <h2>{modal.title}</h2>
            </div>
            <button type="button" className="closeButton" onClick={onClose}>
              ×
            </button>
          </div>
          <p className="messageBody">{modal.message}</p>
          {modal.payload ? (
            <details>
              <summary>Τεχνικές λεπτομέρειες / raw backend decision</summary>
              <pre>{JSON.stringify(modal.payload, null, 2)}</pre>
            </details>
          ) : null}
          <div className="modalActions">
            <button type="button" className="primary" onClick={onClose}>
              OK
            </button>
          </div>
        </section>
      </div>
    </ModalPortal>
  );
}

function ModalPortal({ children }: { children: ReactNode }) {
  return createPortal(children, document.body);
}

function Notice({ tone, children }: { tone: Tone; children: ReactNode }) {
  return <div className={`notice ${tone}`}>{children}</div>;
}

function HealthPill({
  label,
  payload,
}: {
  label: string;
  payload: unknown;
}) {
  const record =
    payload && typeof payload === 'object'
      ? (payload as Record<string, unknown>)
      : {};
  const isOk =
    record.status === 'ok' ||
    record.status === 'healthy' ||
    record.ok === true ||
    record.httpStatus === 200;

  return (
    <span className={isOk ? 'healthPill ok' : 'healthPill warn'}>
      {label}: {isOk ? 'OK' : 'Προσοχή'}
    </span>
  );
}

function ComingSoon({ label }: { label: string }) {
  return (
    <section className="comingSoon">
      <p className="eyebrow">{label}</p>
      <h2>Σε επόμενο στάδιο</h2>
      <p>
        Αυτό το tab υπάρχει ως θέση στο admin shell και θα υλοποιηθεί σε
        επόμενο milestone.
      </p>
    </section>
  );
}

function useWorkflowAction() {
  const [loading, setLoading] = useState(false);
  const [modal, setModal] = useState<WorkflowModalState | null>(null);

  async function runWorkflow({
    preview,
    write,
    allowedDecisions,
    onSuccess,
  }: {
    preview: () => Promise<ApiPayload>;
    write: () => Promise<ApiPayload>;
    allowedDecisions: string[];
    onSuccess?: () => Promise<void>,
  }) {
    setLoading(true);
    setModal(null);

    try {
      const previewResult = await preview();

      if (!isAllowedWorkflowDecision(previewResult, allowedDecisions)) {
        setModal({
          title: 'Δεν επιτρέπεται η ενέργεια',
          message: workflowMessage(
            previewResult,
            'Η ενέργεια δεν επιτρέπεται από το backend.',
          ),
          tone: 'warning',
          payload: previewResult,
        });
        return;
      }

      const writeResult = await write();

      if (writeResult.ok === false) {
        setModal({
          title: 'Δεν επιτρέπεται η ενέργεια',
          message: workflowMessage(writeResult, 'Η ενέργεια δεν ολοκληρώθηκε.'),
          tone: 'warning',
          payload: writeResult,
        });
        return;
      }

      setModal({
        title: 'Ολοκληρώθηκε',
        message: workflowMessage(writeResult, 'Η ενέργεια ολοκληρώθηκε επιτυχώς.'),
        tone: 'success',
        payload: writeResult,
      });

      if (onSuccess) {
        void onSuccess();
      }
    } catch (caught) {
      const error = errorPayload(caught);
      setModal({
        title: 'Σφάλμα',
        message: workflowMessage(
          error,
          'Παρουσιάστηκε σφάλμα κατά την εκτέλεση της ενέργειας.',
        ),
        tone: 'error',
        payload: error,
      });
    } finally {
      setLoading(false);
    }
  }

  return {
    loading,
    modal,
    runWorkflow,
    showModal: setModal,
    closeModal: () => setModal(null),
  };
}

function isAllowedWorkflowDecision(
  payload: ApiPayload,
  allowedDecisions: string[],
) {
  return allowedDecisions.includes(textValue(payload.decision));
}

function workflowMessage(payload: ApiPayload | null, fallback: string) {
  const message = extractMessage(payload) || textValue(payload?.message) || fallback;
  const decision = textValue(payload?.decision);
  const status = textValue(payload?.status);
  const httpStatus = numberValue(payload?.httpStatus);
  const parts = [
    message,
    decision ? `Απόφαση: ${decision}` : '',
    status && status !== decision ? `Status: ${status}` : '',
    httpStatus && httpStatus >= 400 ? `HTTP ${httpStatus}` : '',
  ].filter(Boolean);

  return parts.join('\n');
}

function liveStatusLabel(status: LiveConnectionStatus) {
  switch (status) {
    case 'connected':
      return 'Live σύνδεση ενεργή';
    case 'connecting':
      return 'Live σύνδεση: σύνδεση...';
    case 'unsupported':
      return 'Live σύνδεση μη διαθέσιμη — χρησιμοποιήστε Ανανέωση';
    case 'disconnected':
    default:
      return 'Live σύνδεση ανενεργή — χρησιμοποιήστε Ανανέωση';
  }
}

function movementLiveStatusLabel(status: LiveConnectionStatus) {
  switch (status) {
    case 'connected':
      return 'Live σύνδεση ενεργή';
    case 'connecting':
      return 'Live σύνδεση: σύνδεση...';
    case 'unsupported':
      return 'Live σύνδεση μη διαθέσιμη';
    case 'disconnected':
    default:
      return 'Live σύνδεση ανενεργή';
  }
}

function useAdminData(api: AdminApiClient) {
  const [data, setData] = useState<AdminData>(emptyData);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ApiPayload | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const [liveStatus, setLiveStatus] =
    useState<LiveConnectionStatus>('connecting');
  const [lastEventAt, setLastEventAt] = useState<Date | null>(null);

  const refreshAdminData = useCallback(async (options: { silent?: boolean } = {}) => {
    if (!options.silent) {
      setLoading(true);
    }
    setError(null);

    try {
      const results = await Promise.allSettled([
        api.getVacuumPads(),
        api.getMachines({ activeOnly: false, availableOnly: false }),
        api.getRackLocations({ activeOnly: false, availableOnly: false }),
        api.getFaultCatalog({ activeOnly: false }),
        api.getStatusSummary(),
        api.getActiveVacuums(),
        api.getInactiveVacuums(),
        api.getRepairVacuums(),
      ]);

      const [
        vacuumPads,
        machines,
        racks,
        faultCatalog,
        summary,
        activeVacuums,
        inactiveVacuums,
        repairVacuums,
      ] = results.map(fulfilledPayload);

      setData((current) => ({
        vacuumPads: vacuumPads ? arrayItems(vacuumPads) : current.vacuumPads,
        machines: machines ? arrayItems(machines) : current.machines,
        racks: racks ? arrayItems(racks) : current.racks,
        faultCatalog: faultCatalog ? arrayItems(faultCatalog) : current.faultCatalog,
        summary: summary ?? current.summary,
        activeVacuums: activeVacuums
          ? arrayItems(activeVacuums)
          : current.activeVacuums,
        inactiveVacuums: inactiveVacuums
          ? arrayItems(inactiveVacuums)
          : current.inactiveVacuums,
        repairVacuums: repairVacuums
          ? arrayItems(repairVacuums)
          : current.repairVacuums,
      }));

      const failures = results.filter(
        (result): result is PromiseRejectedResult => result.status === 'rejected',
      );

      if (failures.length > 0) {
        setError({
          message: 'Δεν ήταν δυνατή η πλήρης ανανέωση δεδομένων.',
          failedDatasets: failures.length,
          details: failures.map((failure) => errorPayload(failure.reason)),
        });
        return;
      }

      setLastUpdatedAt(new Date());
    } catch (caught) {
      setError({
        message: 'Δεν ήταν δυνατή η πλήρης ανανέωση δεδομένων.',
        details: errorPayload(caught),
      });
    } finally {
      if (!options.silent) {
        setLoading(false);
      }
    }
  }, [api]);

  useEffect(() => {
    void refreshAdminData();
  }, [refreshAdminData]);

  useEffect(() => {
    if (!('EventSource' in window)) {
      setLiveStatus('unsupported');
      return;
    }

    setLiveStatus('connecting');
    setLastEventAt(null);

    const source = new EventSource(api.getAdminEventsUrl());

    source.onopen = () => {
      setLiveStatus('connected');
    };

    source.onmessage = (event) => {
      const payload = parseAdminEvent(event.data);

      if (!payload) {
        return;
      }

      setLiveStatus('connected');

      if (payload.type === 'ping') {
        return;
      }

      console.debug('[ADMIN EVENTS] received', payload);
      setLastEventAt(new Date());
      void refreshAdminData({ silent: true });
    };

    source.onerror = () => {
      setLiveStatus('disconnected');
    };

    return () => {
      source.close();
    };
  }, [api, refreshAdminData]);

  return {
    data,
    loading,
    error,
    refresh: refreshAdminData,
    lastUpdatedAt,
    liveStatus,
    lastEventAt,
  };
}

function fulfilledPayload(result: PromiseSettledResult<ApiPayload>) {
  return result.status === 'fulfilled' ? result.value : null;
}

function parseAdminEvent(raw: string): ApiPayload | null {
  try {
    const parsed = JSON.parse(raw) as unknown;

    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as ApiPayload)
      : null;
  } catch {
    return null;
  }
}

function arrayItems(payload: ApiPayload): DataItem[] {
  return Array.isArray(payload.items) ? (payload.items as DataItem[]) : [];
}

function uniqueByValue(
  items: DataItem[],
  getValue: (item: DataItem) => string,
) {
  const seen = new Set<string>();

  return items.filter((item) => {
    const value = getValue(item);

    if (!value || seen.has(value)) {
      return false;
    }

    seen.add(value);
    return true;
  });
}

function cleanMovementFilters(filters: MovementFilters): MovementFilters {
  return {
    type: filters.type.trim(),
    vacuum: cleanFilterValues(filters.vacuum),
    machine: cleanFilterValues(filters.machine),
    rack: cleanFilterValues(filters.rack),
    fault: cleanFilterValues(filters.fault),
    startedFrom: filters.startedFrom,
    startedTo: filters.startedTo,
    endedFrom: filters.endedFrom,
    endedTo: filters.endedTo,
  };
}

function cleanMostUsedReportFilters(filters: MostUsedReportFilters) {
  return {
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
    vacuum: cleanFilterValues(filters.vacuum),
  };
}

function cleanFaultyReportFilters(filters: FaultyReportFilters) {
  return {
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
    vacuum: cleanFilterValues(filters.vacuum),
    fault: cleanFilterValues(filters.fault),
  };
}

function cleanMachineFaultReportFilters(filters: MachineFaultReportFilters) {
  return {
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
    machine: cleanFilterValues(filters.machine),
    fault: cleanFilterValues(filters.fault),
  };
}

function cleanMostFrequentFaultFilters(filters: MostFrequentFaultFilters) {
  return {
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
    fault: cleanFilterValues(filters.fault),
    vacuum: cleanFilterValues(filters.vacuum),
    machine: cleanFilterValues(filters.machine),
  };
}

function cleanVacuumLocationReportFilters(
  filters: VacuumLocationReportFilters,
) {
  return {
    vacuum: cleanFilterValues(filters.vacuum),
    status: cleanFilterValues(filters.status),
    rack: cleanFilterValues(filters.rack),
    machine: cleanFilterValues(filters.machine),
    missingSerial: filters.missingSerial || undefined,
    unknownLocation: filters.unknownLocation || undefined,
  };
}

function faultyReportMonthlyTrend(payload: ApiPayload | null): DataItem[] {
  const chart = objectValue(payload?.chart);
  const monthlyTrend = chart?.monthlyTrend;

  return Array.isArray(monthlyTrend) ? (monthlyTrend as DataItem[]) : [];
}

function mostFrequentFaultParetoRows(payload: ApiPayload | null): DataItem[] {
  const chart = objectValue(payload?.chart);
  const pareto = chart?.pareto;

  return Array.isArray(pareto) ? (pareto as DataItem[]) : [];
}

function vacuumLocationCategoryCounts(payload: ApiPayload | null): DataItem[] {
  const chart = objectValue(payload?.chart);
  const categories = chart?.locationCategories;

  return Array.isArray(categories) ? (categories as DataItem[]) : [];
}

function sameMovementFilters(
  first: MovementFilters,
  second: MovementFilters,
) {
  return (Object.keys(emptyMovementFilters) as Array<keyof MovementFilters>).every(
    (key) => sameFilterValue(first[key], second[key]),
  );
}

function cleanFilterValues(values: string[]) {
  return Array.from(
    new Set(values.map((value) => value.trim()).filter(Boolean)),
  );
}

function sameFilterValue(first: string | string[], second: string | string[]) {
  if (Array.isArray(first) || Array.isArray(second)) {
    const firstValues = Array.isArray(first) ? first : [first];
    const secondValues = Array.isArray(second) ? second : [second];

    return (
      firstValues.length === secondValues.length &&
      firstValues.every((value, index) => value === secondValues[index])
    );
  }

  return first === second;
}

function visiblePageNumbers(currentPage: number, totalPages: number) {
  const start = Math.max(1, currentPage - 2);
  const end = Math.min(totalPages, currentPage + 2);
  const pages: number[] = [];

  for (let pageNumber = start; pageNumber <= end; pageNumber += 1) {
    pages.push(pageNumber);
  }

  return pages;
}

function errorPayload(caught: unknown): ApiPayload {
  if (caught instanceof ApiError) {
    const payload =
      caught.payload && typeof caught.payload === 'object' && !Array.isArray(caught.payload)
        ? (caught.payload as ApiPayload)
        : { payload: caught.payload };

    return {
      ok: false,
      httpStatus: caught.status,
      request: caught.request,
      ...payload,
      message: caught.message,
    };
  }

  if (caught instanceof Error) {
    return { message: caught.message };
  }

  return { message: 'Άγνωστο σφάλμα', payload: caught };
}

function isInactiveVacuum(item: DataItem) {
  return textValue(item.displayStatus).toUpperCase() === 'NOTACTIVE';
}

function isActiveVacuum(item: DataItem) {
  return textValue(item.displayStatus).toUpperCase() === 'ACTIVE';
}

function isRepairVacuum(item: DataItem) {
  return textValue(item.displayStatus).toUpperCase() === 'REPAIR';
}

function isIncompleteVacuum(item: DataItem) {
  return item.isIncomplete === true || !textValue(item.serialNumber);
}

function countVacuumQuickFilters(rows: DataItem[]): Record<VacuumQuickFilter, number> {
  return {
    all: rows.length,
    active: rows.filter(matchesActiveVacuumQuickFilter).length,
    inactive: rows.filter(matchesInactiveVacuumQuickFilter).length,
    repair: rows.filter(matchesRepairVacuumQuickFilter).length,
    missingSerial: rows.filter(isIncompleteVacuum).length,
  };
}

function filterVacuumRows(rows: DataItem[], filter: VacuumQuickFilter) {
  if (filter === 'all') {
    return rows;
  }

  return rows.filter((item) => matchesVacuumQuickFilter(item, filter));
}

function matchesVacuumQuickFilter(item: DataItem, filter: VacuumQuickFilter) {
  if (filter === 'active') {
    return matchesActiveVacuumQuickFilter(item);
  }

  if (filter === 'inactive') {
    return matchesInactiveVacuumQuickFilter(item);
  }

  if (filter === 'repair') {
    return matchesRepairVacuumQuickFilter(item);
  }

  if (filter === 'missingSerial') {
    return isIncompleteVacuum(item);
  }

  return true;
}

function matchesActiveVacuumQuickFilter(item: DataItem) {
  return (
    isActiveVacuum(item) ||
    textValue(item.locationStatus).toUpperCase() === 'ON_MACHINE'
  );
}

function matchesRepairVacuumQuickFilter(item: DataItem) {
  const operationalStatus = textValue(item.operationalStatus).toUpperCase();
  const locationStatus = textValue(item.locationStatus).toUpperCase();

  return (
    isRepairVacuum(item) ||
    operationalStatus === 'UNDER_REPAIR' ||
    locationStatus === 'IN_REPAIR'
  );
}

function matchesInactiveVacuumQuickFilter(item: DataItem) {
  return (
    !isIncompleteVacuum(item) &&
    !matchesActiveVacuumQuickFilter(item) &&
    !matchesRepairVacuumQuickFilter(item)
  );
}

function isMachineAvailableForCharge(item: DataItem) {
  if (typeof item.isAvailableForCharge === 'boolean') {
    return item.isAvailableForCharge;
  }

  return textValue(item.status).toUpperCase() === 'ACTIVE' && !item.currentPad;
}

function isRackAvailable(item: DataItem) {
  if (typeof item.isAvailable === 'boolean') {
    return item.isAvailable;
  }

  return item.isActive !== false && !item.currentPad;
}

function isActiveFaultCatalogItem(item: DataItem) {
  return item.isActive !== false;
}

function textValue(value: unknown) {
  const text = value?.toString().trim();
  return text && text !== 'null' && text !== 'undefined' ? text : '';
}

function numberValue(value: unknown) {
  return typeof value === 'number' ? value : null;
}

function formatBytes(value: number | null) {
  if (value === null || !Number.isFinite(value)) {
    return '-';
  }

  if (value < 1024) {
    return `${value} B`;
  }

  const units = ['KB', 'MB', 'GB'];
  let size = value / 1024;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  return `${size.toLocaleString('el-GR', {
    maximumFractionDigits: 1,
  })} ${units[unitIndex]}`;
}

function numericText(value: unknown) {
  const numeric =
    typeof value === 'number' ? value : Number(textValue(value).replace(',', '.'));

  if (!Number.isFinite(numeric)) {
    return '';
  }

  return numeric.toLocaleString('el-GR', {
    maximumFractionDigits: 2,
  });
}

function booleanValue(value: unknown) {
  return typeof value === 'boolean' ? value : false;
}

function objectValue(value: unknown): DataItem | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as DataItem)
    : null;
}

function dataTableConfig(entity: DataEntityId, data: AdminData) {
  switch (entity) {
    case 'machines':
      return {
        rows: data.machines,
        searchPlaceholder: 'Αναζήτηση με code, όνομα, status ή Vacuum',
        columns: [
          { key: 'code', header: 'Code', value: (item) => textValue(item.code) },
          { key: 'name', header: 'Όνομα', value: (item) => textValue(item.name) },
          {
            key: 'status',
            header: 'Κατάσταση',
            value: (item) => textValue(item.status),
          },
          {
            key: 'currentPad',
            header: 'Τρέχον Vacuum',
            value: (item) => currentPadText(item),
          },
          {
            key: 'updatedAt',
            header: 'Updated At',
            value: (item) => formatDateTime(textValue(item.updatedAt)),
          },
        ] satisfies DataColumn[],
      };
    case 'racks':
      return {
        rows: data.racks,
        searchPlaceholder: 'Αναζήτηση με code, τύπο, περιοχή ή Vacuum',
        columns: [
          { key: 'code', header: 'Code', value: (item) => textValue(item.code) },
          { key: 'type', header: 'Τύπος', value: (item) => textValue(item.type) },
          { key: 'zone', header: 'Περιοχή', value: (item) => textValue(item.zone) },
          { key: 'row', header: 'Row', value: (item) => textValue(item.rack) },
          {
            key: 'position',
            header: 'Position',
            value: (item) =>
              [textValue(item.level), textValue(item.slot)].filter(Boolean).join('-'),
          },
          {
            key: 'isActive',
            header: 'Ενεργή',
            value: (item) => booleanText(item.isActive),
          },
          {
            key: 'currentPad',
            header: 'Τρέχον Vacuum',
            value: (item) => currentPadText(item),
          },
          {
            key: 'label',
            header: 'Label/Notes',
            value: (item) =>
              textValue(item.label) || textValue(item.notes) || textValue(item.description),
          },
        ] satisfies DataColumn[],
      };
    case 'faults':
      return {
        rows: data.faultCatalog,
        searchPlaceholder: 'Αναζήτηση με code, label ή description',
        columns: [
          { key: 'code', header: 'Code', value: (item) => textValue(item.code) },
          { key: 'label', header: 'Label', value: (item) => textValue(item.label) },
          {
            key: 'description',
            header: 'Description',
            value: (item) => textValue(item.description),
          },
          {
            key: 'severity',
            header: 'Severity',
            value: (item) => textValue(item.severity),
          },
          {
            key: 'sortOrder',
            header: 'Sort Order',
            value: (item) => textValue(item.sortOrder),
          },
          {
            key: 'active',
            header: 'Active',
            value: (item) =>
              item.isActive === undefined ? 'Ναι' : booleanText(item.isActive),
          },
        ] satisfies DataColumn[],
      };
    case 'vacuums':
    default:
      return {
        rows: data.vacuumPads,
        searchPlaceholder: 'Αναζήτηση με serial, code, θέση ή μηχάνημα',
        columns: [
          {
            key: 'serialNumber',
            header: 'Serial Number',
            value: (item) => textValue(item.serialNumber) || '—',
          },
          {
            key: 'code',
            header: 'Code',
            value: (item) => textValue(item.code),
            className: 'nowrapCell codeCell',
          },
          {
            key: 'description',
            header: 'Περιγραφή',
            value: (item) => textValue(item.description),
          },
          {
            key: 'netWeightKg',
            header: 'Net kg',
            value: (item) => numericText(item.netWeightKg),
          },
          {
            key: 'dimensionsMm',
            header: 'Διαστάσεις mm',
            value: (item) =>
              [
                textValue(item.dimensionLengthMm),
                textValue(item.dimensionWidthMm),
                textValue(item.dimensionHeightMm),
              ]
                .filter(Boolean)
                .join(' × '),
          },
          {
            key: 'liftingCapacityKg',
            header: 'Ανύψωση kg',
            value: (item) => numericText(item.liftingCapacityKg),
          },
          {
            key: 'costEuro',
            header: 'Κόστος €',
            value: (item) => numericText(item.costEuro),
          },
          {
            key: 'receivedAt',
            header: 'Παραλαβή',
            value: (item) => formatDate(textValue(item.receivedAt)),
          },
          {
            key: 'operationalStatus',
            header: 'Operational Status',
            value: (item) => textValue(item.operationalStatus),
          },
          {
            key: 'locationStatus',
            header: 'Location Status',
            value: (item) => textValue(item.locationStatus),
          },
          {
            key: 'rack',
            header: 'Τρέχουσα θέση',
            value: (item) => textValue(objectValue(item.currentRackLocation)?.code),
          },
          {
            key: 'machine',
            header: 'Τρέχον μηχάνημα',
            value: (item) => machineText(objectValue(item.currentMachine)),
          },
          {
            key: 'updatedAt',
            header: 'Updated At / Last Seen',
            value: (item) => formatDateTime(textValue(item.updatedAt)),
          },
        ] satisfies DataColumn[],
      };
  }
}

function dataFormConfig(
  entity: DataEntityId,
  mode: 'create' | 'edit' = 'create',
): DataFormConfig {
  switch (entity) {
    case 'machines':
      return {
        entity,
        title: 'Machine',
        fields: [
          {
            key: 'code',
            label: 'Code',
            type: 'text',
            readOnly: true,
            hideOnCreate: true,
          },
          { key: 'name', label: 'Όνομα', type: 'text', required: true },
          {
            key: 'status',
            label: 'Κατάσταση',
            type: 'select',
            options: optionList(dataFormOptions.machineStatus),
          },
          { key: 'description', label: 'Περιγραφή', type: 'textarea' },
          { key: 'area', label: 'Περιοχή', type: 'text' },
          { key: 'project', label: 'Project', type: 'text' },
        ] satisfies DataFormField[],
      };
    case 'racks':
      return {
        entity,
        title: 'Θέση / Rack Location',
        fields: [
          {
            key: 'code',
            label: 'Code',
            type: 'text',
            readOnly: true,
            hideOnCreate: true,
          },
          {
            key: 'type',
            label: 'Τύπος',
            type: 'select',
            options: optionList(dataFormOptions.rackType),
          },
          {
            key: 'zone',
            label: 'Περιοχή',
            type: 'text',
            required: mode === 'create',
          },
          { key: 'rack', label: 'Row', type: 'text', required: mode === 'create' },
          { key: 'level', label: 'Level', type: 'text' },
          {
            key: 'slot',
            label: 'Position',
            type: 'text',
            required: mode === 'create',
          },
          { key: 'label', label: 'Label/Notes', type: 'textarea' },
          { key: 'isActive', label: 'Ενεργή', type: 'checkbox' },
        ] satisfies DataFormField[],
      };
    case 'faults':
      return {
        entity,
        title: 'Βλάβη',
        fields: [
          {
            key: 'code',
            label: 'Code',
            type: 'text',
            readOnly: true,
            hideOnCreate: true,
          },
          { key: 'label', label: 'Label', type: 'text', required: true },
          { key: 'description', label: 'Description', type: 'textarea' },
          {
            key: 'severity',
            label: 'Severity',
            type: 'select',
            options: [
              { value: '', label: '—' },
              ...optionList(dataFormOptions.repairPriority),
            ],
          },
          { key: 'sortOrder', label: 'Sort Order', type: 'number' },
          { key: 'isActive', label: 'Active', type: 'checkbox' },
        ] satisfies DataFormField[],
      };
    case 'vacuums':
    default: {
      const vacuumFields: DataFormField[] = [
        {
          key: 'code',
          label: 'Code',
          type: 'text',
          readOnly: true,
          hideOnCreate: true,
        },
        {
          key: 'serialNumber',
          label: 'Serial Number',
          type: 'text',
        },
        { key: 'description', label: 'Περιγραφή', type: 'textarea' },
        {
          key: 'netWeightKg',
          label: 'Καθαρό βάρος (kg)',
          type: 'number',
          section: 'Τεχνικά / Εμπορικά στοιχεία',
        },
        {
          key: 'dimensionLengthMm',
          label: 'Μήκος (mm)',
          type: 'number',
          section: 'Τεχνικά / Εμπορικά στοιχεία',
        },
        {
          key: 'dimensionWidthMm',
          label: 'Πλάτος (mm)',
          type: 'number',
          section: 'Τεχνικά / Εμπορικά στοιχεία',
        },
        {
          key: 'dimensionHeightMm',
          label: 'Ύψος (mm)',
          type: 'number',
          section: 'Τεχνικά / Εμπορικά στοιχεία',
        },
        {
          key: 'liftingCapacityKg',
          label: 'Ανυψωτική ικανότητα (kg)',
          type: 'number',
          section: 'Τεχνικά / Εμπορικά στοιχεία',
        },
        {
          key: 'costEuro',
          label: 'Κόστος (€)',
          type: 'number',
          section: 'Τεχνικά / Εμπορικά στοιχεία',
        },
        {
          key: 'receivedAt',
          label: 'Ημερομηνία παραλαβής',
          type: 'date',
          section: 'Τεχνικά / Εμπορικά στοιχεία',
        },
        {
          key: 'operationalStatus',
          label: 'Operational Status',
          type: 'select',
          options: [
            { value: '', label: '—' },
            ...optionList(dataFormOptions.operationalStatus),
          ],
        },
        {
          key: 'locationStatus',
          label: 'Location Status',
          type: 'select',
          options: [
            { value: '', label: '—' },
            ...optionList(dataFormOptions.locationStatus),
          ],
          visibleWhen: (values) =>
            vacuumOperationalStatusesWithLocation.includes(
              String(values.operationalStatus ?? ''),
            ),
        },
      ];

      return {
        entity,
        title: 'Vacuum',
        fields: filterDataFormFields(vacuumFields, mode),
      };
    }
  }
}

function optionList(values: string[]) {
  return values.map((value) => ({ value, label: value }));
}

function filterDataFormFields(
  fields: DataFormField[],
  mode: 'create' | 'edit',
) {
  return fields.filter((field) =>
    mode === 'create' ? !field.hideOnCreate : !field.hideOnEdit,
  );
}

function dataInitialFormValues(fields: DataFormField[], row?: DataItem) {
  return Object.fromEntries(
    fields.map((field) => {
      if (field.type === 'checkbox') {
        const value = row?.[field.key];
        return [field.key, value === undefined ? true : Boolean(value)];
      }

      const rawValue = textValue(row?.[field.key]);
      if (field.type === 'date') {
        return [field.key, rawValue ? toDateInputValue(rawValue) : ''];
      }

      const value =
        field.key === 'locationStatus' &&
        rawValue &&
        !vacuumEditableLocationStatuses.includes(rawValue)
          ? ''
          : rawValue || dataDefaultFieldValue(field);
      return [field.key, value];
    }),
  ) as Record<string, string | boolean>;
}

function dataDefaultFieldValue(field: DataFormField) {
  if (field.key === 'operationalStatus') {
    return '';
  }

  if (field.key === 'locationStatus') {
    return '';
  }

  if (field.key === 'status') {
    return 'ACTIVE';
  }

  if (field.key === 'type' && field.options) {
    return 'AVL';
  }

  if (field.key === 'sortOrder') {
    return '0';
  }

  return '';
}

function toDateInputValue(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value.slice(0, 10);
  }

  return date.toISOString().slice(0, 10);
}

function isDataFormFieldVisible(
  field: DataFormField,
  values: Record<string, string | boolean>,
  mode: 'create' | 'edit',
) {
  if (mode === 'create' && field.hideOnCreate) {
    return false;
  }

  if (mode === 'edit' && field.hideOnEdit) {
    return false;
  }

  return field.visibleWhen ? field.visibleWhen(values, mode) : true;
}

function dataFormPayload(
  fields: DataFormField[],
  values: Record<string, string | boolean>,
) {
  return Object.fromEntries(
    fields.map((field) => {
      const value = values[field.key];

      if (field.type === 'checkbox') {
        return [field.key, Boolean(value)];
      }

      if (field.type === 'number') {
        const numericTextValue = textValue(value);
        return [
          field.key,
          numericTextValue ? Number(numericTextValue) : '',
        ];
      }

      return [field.key, value];
    }),
  );
}

function createDataEntity(
  api: AdminApiClient,
  entity: DataEntityId,
  values: ApiPayload,
) {
  switch (entity) {
    case 'machines':
      return api.createMachine(values);
    case 'racks':
      return api.createRackLocation(values);
    case 'faults':
      return api.createFaultCatalogItem(values);
    case 'vacuums':
    default:
      return api.createVacuumPad(values);
  }
}

function updateDataEntity(
  api: AdminApiClient,
  entity: DataEntityId,
  id: string,
  values: ApiPayload,
) {
  switch (entity) {
    case 'machines':
      return api.updateMachine(id, values);
    case 'racks':
      return api.updateRackLocation(id, values);
    case 'faults':
      return api.updateFaultCatalogItem(id, values);
    case 'vacuums':
    default:
      return api.updateVacuumPad(id, values);
  }
}

function deleteDataEntity(api: AdminApiClient, entity: DataEntityId, id: string) {
  switch (entity) {
    case 'machines':
      return api.deleteMachine(id);
    case 'racks':
      return api.deleteRackLocation(id);
    case 'faults':
      return api.deleteFaultCatalogItem(id);
    case 'vacuums':
    default:
      return api.deleteVacuumPad(id);
  }
}

function dataExportSheetName(entity: DataEntityId) {
  return importResultEntityKey(entity);
}

function dataExportRows(
  entity: DataEntityId,
  rows: DataItem[],
): XlsxCellValue[][] {
  switch (entity) {
    case 'machines':
      return [
        ['code', 'name', 'status', 'notes'],
        ...rows.map((row) => [
          textValue(row.code),
          textValue(row.name),
          textValue(row.status),
          packNotes({
            description: textValue(row.description),
            area: textValue(row.area),
            project: textValue(row.project),
          }),
        ]),
      ];
    case 'racks':
      return [
        ['code', 'type', 'area', 'row', 'position', 'isActive', 'notes'],
        ...rows.map((row) => [
          textValue(row.code),
          textValue(row.type),
          textValue(row.zone),
          textValue(row.rack),
          textValue(row.slot),
          row.isActive === undefined ? '' : Boolean(row.isActive),
          packNotes({
            label: textValue(row.label),
            level: textValue(row.level),
            capacity: textValue(row.capacity),
          }),
        ]),
      ];
    case 'faults':
      return [
        ['code', 'label', 'description', 'severity', 'sortOrder', 'isActive'],
        ...rows.map((row) => [
          textValue(row.code),
          textValue(row.label),
          textValue(row.description),
          textValue(row.severity),
          textValue(row.sortOrder),
          row.isActive === undefined ? '' : Boolean(row.isActive),
        ]),
      ];
    case 'vacuums':
    default:
      return [
        [
          'code',
          'serialNumber',
          'description',
          'operationalStatus',
          'locationStatus',
          'netWeightKg',
          'dimensionLengthMm',
          'dimensionWidthMm',
          'dimensionHeightMm',
          'liftingCapacityKg',
          'costEuro',
          'receivedAt',
          'notes',
        ],
        ...rows.map((row) => [
          textValue(row.code),
          textValue(row.serialNumber),
          textValue(row.description),
          textValue(row.operationalStatus),
          textValue(row.locationStatus),
          textValue(row.netWeightKg),
          textValue(row.dimensionLengthMm),
          textValue(row.dimensionWidthMm),
          textValue(row.dimensionHeightMm),
          textValue(row.liftingCapacityKg),
          textValue(row.costEuro),
          dateOnlyText(textValue(row.receivedAt)),
          packNotes({
            dimensions: textValue(row.dimensions),
            type: textValue(row.type),
          }),
        ]),
      ];
  }
}

function dataExportColumnWidths(entity: DataEntityId) {
  switch (entity) {
    case 'machines':
      return [110, 220, 110, 320];
    case 'racks':
      return [140, 90, 90, 90, 90, 90, 320];
    case 'faults':
      return [90, 220, 340, 110, 90, 90];
    case 'vacuums':
    default:
      return [120, 160, 320, 150, 140, 110, 130, 130, 130, 140, 110, 120, 260];
  }
}

function dataExportFilename(entity: DataEntityId) {
  const timestamp = exportTimestamp();

  switch (entity) {
    case 'machines':
      return `machines-export-${timestamp}.xlsx`;
    case 'racks':
      return `rack-locations-export-${timestamp}.xlsx`;
    case 'faults':
      return `fault-catalog-export-${timestamp}.xlsx`;
    case 'vacuums':
    default:
      return `vacuum-pads-export-${timestamp}.xlsx`;
  }
}

function packNotes(values: Record<string, string>) {
  return Object.entries(values)
    .filter(([, value]) => value)
    .map(([key, value]) => `${key}=${value.replace(/;/g, ',')}`)
    .join('; ');
}

function dataImportEntity(entity: DataEntityId): MasterDataImportEntity {
  switch (entity) {
    case 'machines':
      return 'machines';
    case 'racks':
      return 'racks';
    case 'faults':
      return 'faults';
    case 'vacuums':
    default:
      return 'vacuums';
  }
}

function dataEntityLabel(entity: DataEntityId) {
  return dataEntities.find((item) => item.id === entity)?.label ?? 'Vacuum';
}

function importEntitySummary(payload: ApiPayload, entity: DataEntityId) {
  const entities = objectValue(payload.entities);
  const summary = objectValue(entities?.[importResultEntityKey(entity)]);

  return {
    rowsRead: numberValue(summary?.rowsRead) ?? 0,
    creates: numberValue(summary?.creates) ?? 0,
    updates: numberValue(summary?.updates) ?? 0,
    unchanged: numberValue(summary?.unchanged) ?? 0,
    incomplete: numberValue(summary?.incomplete) ?? 0,
  };
}

function importResultEntityKey(entity: DataEntityId) {
  switch (entity) {
    case 'machines':
      return 'Machines';
    case 'racks':
      return 'RackLocations';
    case 'faults':
      return 'FaultCatalog';
    case 'vacuums':
    default:
      return 'VacuumPads';
  }
}

function importSummaryText(payload: ApiPayload) {
  const entities = objectValue(payload.entities);
  if (!entities) {
    return 'Η εισαγωγή ολοκληρώθηκε.';
  }

  const parts = Object.entries(entities)
    .map(([entity, summaryValue]) => {
      const summary = objectValue(summaryValue);
      if (!summary) {
        return '';
      }

      return `${entity}: creates=${textValue(summary.creates) || '0'}, updates=${textValue(summary.updates) || '0'}, unchanged=${textValue(summary.unchanged) || '0'}, incomplete=${textValue(summary.incomplete) || '0'}`;
    })
    .filter(Boolean);

  return parts.length > 0 ? parts.join('\n') : 'Η εισαγωγή ολοκληρώθηκε.';
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function filterDataRows(
  rows: DataItem[],
  columns: DataColumn[],
  search: string,
) {
  const query = search.trim().toLowerCase();

  if (!query) {
    return rows;
  }

  return rows.filter((row) =>
    columns.some((column) => column.value(row).toLowerCase().includes(query)),
  );
}

function dataRowTitle(entity: DataEntityId, row: DataItem) {
  switch (entity) {
    case 'machines':
      return machineText(row);
    case 'racks':
      return rackLocationText(row);
    case 'faults':
      return [textValue(row.code), textValue(row.label)].filter(Boolean).join(' - ');
    case 'vacuums':
    default:
      return vacuumPrimaryText(row);
  }
}

function currentPadText(item: DataItem) {
  const currentPad = objectValue(item.currentPad);
  return currentPad ? movementVacuumText(currentPad) : '';
}

function machineText(item: DataItem | null) {
  if (!item) {
    return '';
  }

  return [textValue(item.code), textValue(item.name)].filter(Boolean).join(' - ');
}

function rackLocationText(item: DataItem | null) {
  if (!item) {
    return '';
  }

  return [textValue(item.code), textValue(item.label)].filter(Boolean).join(' - ');
}

function booleanText(value: unknown) {
  if (value === true) {
    return 'Ναι';
  }

  if (value === false) {
    return 'Όχι';
  }

  return '';
}

function statusLocationText(kind: StatusDetailKind, item: DataItem) {
  if (kind === 'active') {
    const machine = objectValue(item.machine);
    return machine
      ? [textValue(machine.code), textValue(machine.name)].filter(Boolean).join(' - ')
      : 'Δεν έχει δηλωθεί μηχάνημα';
  }

  const rack = objectValue(item.rack);
  return rack
    ? [textValue(rack.code), textValue(rack.label)].filter(Boolean).join(' - ')
    : 'Δεν έχει δηλωθεί θέση';
}

function statusDateText(kind: StatusDetailKind, item: DataItem) {
  if (kind === 'active') {
    return formatDateTime(textValue(item.chargedAt));
  }

  if (kind === 'repair') {
    const openRepair = objectValue(item.openRepair);
    return formatDateTime(textValue(openRepair?.reportedAt));
  }

  return formatDateTime(textValue(item.updatedAt)) || 'Δεν διατίθεται από το τρέχον status endpoint';
}

function movementVacuumText(item: DataItem) {
  const serial = textValue(item.vacuumSerial);
  const code = textValue(item.vacuumCode);

  if (serial && code) {
    return `${serial} (${code})`;
  }

  return serial || code || '-';
}

function movementFaultText(item: DataItem) {
  const code = textValue(item.faultCode);
  const label = textValue(item.faultLabel);

  if (code && label) {
    return `${code} - ${label}`;
  }

  return label || code || '-';
}

function movementDetailsText(item: DataItem) {
  const details = item.details;

  if (details && typeof details === 'object') {
    return JSON.stringify(details);
  }

  return textValue(details);
}

function mostUsedVacuumText(item: DataItem) {
  const serial = textValue(item.serialNumber) || textValue(item.vacuumPad);
  const code = textValue(item.code);

  if (serial && code && serial !== code) {
    return `${serial} (${code})`;
  }

  return serial || code || '-';
}

function machineFaultMachineText(item: DataItem) {
  const code = textValue(item.machineCode);
  const name = textValue(item.machineName);

  if (code && name) {
    return `${code} - ${name}`;
  }

  return code || name || '-';
}

function reportStatusLabel(status: string) {
  switch (status) {
    case 'ACTIVE':
      return 'Ενεργό';
    case 'REPAIR':
      return 'Προς επισκευή';
    case 'INCOMPLETE':
      return 'Λείπει serial';
    case 'RETIRED':
      return 'Αποσυρμένο';
    case 'INACTIVE':
      return 'Ανενεργό';
    default:
      return status || '-';
  }
}

function formatHours(value: unknown) {
  const hours = numberValue(value);

  if (hours === null) {
    return '0.00';
  }

  return hours.toLocaleString('el-GR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatReportMetric(value: number, metric: MostUsedChartMetric) {
  return metric === 'chargeCount' ? String(value) : formatHours(value);
}

function formatFaultyReportMetric(value: number, metric: FaultyChartMetric) {
  return metric === 'totalFaults' || metric === 'repairCount'
    ? String(value)
    : formatHours(value);
}

function formatMachineFaultMetric(
  value: number,
  metric: MachineFaultChartMetric,
) {
  return metric === 'downtimeHours' ? formatHours(value) : String(value);
}

function formatMostFrequentFaultMetric(
  value: number,
  metric: MostFrequentFaultChartMetric,
) {
  return metric === 'downtimeHours' || metric === 'averageRestorationHours'
    ? formatHours(value)
    : String(value);
}

function formatPercent(value: unknown) {
  const numeric = numberValue(value) ?? 0;
  return `${numeric.toLocaleString('el-GR', {
    maximumFractionDigits: 2,
  })}%`;
}

function faultFrequencyFaultText(item: DataItem) {
  const code = textValue(item.faultCode);
  const label = textValue(item.faultLabel);

  return [code, label].filter(Boolean).join(' - ') || '-';
}

function vacuumLocationMachineText(item: DataItem) {
  const code = textValue(item.machineCode);
  const name = textValue(item.machineName);

  return [code, name].filter(Boolean).join(' - ') || '-';
}

function vacuumLocationRackText(item: DataItem) {
  const code = textValue(item.rackCode);
  const label = textValue(item.rackLabel);

  return [code, label].filter(Boolean).join(' - ') || '-';
}

function movementExportRows(items: DataItem[]) {
  const header = [
    'Έναρξη',
    'Τύπος',
    'Vacuum serial',
    'Vacuum code',
    'Μηχάνημα',
    'Θέση',
    'Βλάβη',
    'Φωτογραφίες',
    'Λήξη',
    'Λεπτομέρειες',
    'Repair ID',
    'ID',
  ];
  const rows = items.map((item) => [
    formatDateTime(textValue(item.startedAt)) || textValue(item.startedAt),
    textValue(item.typeLabel) || textValue(item.type),
    textValue(item.vacuumSerial),
    textValue(item.vacuumCode),
    textValue(item.machineCode),
    textValue(item.rackCode),
    movementFaultText(item) === '-' ? '' : movementFaultText(item),
    String(numberValue(item.photoCount) ?? 0),
    formatDateTime(textValue(item.endedAt)) || textValue(item.endedAt),
    movementDetailsText(item),
    textValue(item.repairId),
    textValue(item.id),
  ]);

  return [header, ...rows];
}

function buildMovementsCsv(items: DataItem[]) {
  return `\uFEFF${movementExportRows(items)
    .map((row) => row.map(csvCell).join(';'))
    .join('\r\n')}`;
}

function buildMostUsedReportCsv(items: DataItem[]) {
  const header = [
    'Rank',
    'Κωδικός',
    'Vacuum Pad',
    'Χρεώσεις',
    'Ώρες Χρήσης',
    'Downtime',
    'Μέσος Χρόνος Παραμονής στο Μηχάνημα',
    'Τελευταία Χρήση',
    'Status',
    'Ανοιχτές Χρεώσεις',
  ];
  const rows = items.map((item) => [
    String(numberValue(item.rank) ?? ''),
    textValue(item.code),
    mostUsedVacuumText(item),
    String(numberValue(item.chargeCount) ?? 0),
    formatHours(item.usageHours),
    formatHours(item.downtimeHours),
    formatHours(item.averageMachineStayHours),
    formatDateTime(textValue(item.lastUsageAt)) || textValue(item.lastUsageAt),
    reportStatusLabel(textValue(item.status)),
    String(numberValue(item.openSessionCount) ?? 0),
  ]);

  return `\uFEFF${[header, ...rows]
    .map((row) => row.map(csvCell).join(';'))
    .join('\r\n')}`;
}

function buildFaultyReportCsv(items: DataItem[]) {
  const header = [
    'Rank',
    'Κωδικός',
    'Vacuum Pad',
    'Συνολικές Βλάβες',
    'Διαφορετικές Βλάβες',
    'Επισκευές',
    'Ώρες Επισκευής',
    'Downtime λόγω Βλάβης',
    'Μέσος Χρόνος Επισκευής',
    'Τελευταία Βλάβη',
    'Status',
    'Ανοιχτές Επισκευές',
  ];
  const rows = items.map((item) => [
    String(numberValue(item.rank) ?? ''),
    textValue(item.code),
    mostUsedVacuumText(item),
    String(numberValue(item.totalFaults) ?? 0),
    String(numberValue(item.distinctFaultTypes) ?? 0),
    String(numberValue(item.repairCount) ?? 0),
    formatHours(item.repairHours),
    formatHours(item.faultDowntimeHours),
    formatHours(item.averageRepairHours),
    formatDateTime(textValue(item.lastFaultAt)) || textValue(item.lastFaultAt),
    reportStatusLabel(textValue(item.status)),
    String(numberValue(item.openRepairCount) ?? 0),
  ]);

  return `\uFEFF${[header, ...rows]
    .map((row) => row.map(csvCell).join(';'))
    .join('\r\n')}`;
}

function buildMachineFaultReportCsv(items: DataItem[]) {
  const header = [
    'Θέση',
    'Κωδικός Μηχανήματος',
    'Μηχάνημα',
    'Συνολικές Βλάβες',
    'Vacuum Pads με Βλάβες',
    'Διαφορετικοί Τύποι Βλαβών',
    'Αποστολές για Επισκευή',
    'Downtime',
    'Μέσος Όρος Βλαβών ανά Vacuum Pad',
    'Συχνότερη Βλάβη',
    'Τελευταία Βλάβη',
    'Status',
  ];
  const rows = items.map((item) => [
    String(numberValue(item.rank) ?? ''),
    textValue(item.machineCode),
    textValue(item.machineName),
    String(numberValue(item.totalFaults) ?? 0),
    String(numberValue(item.affectedVacuumPads) ?? 0),
    String(numberValue(item.distinctFaultTypes) ?? 0),
    String(numberValue(item.repairDispatches) ?? 0),
    formatHours(item.downtimeHours),
    formatHours(item.averageFaultsPerVacuum),
    textValue(item.mostCommonFault),
    formatDateTime(textValue(item.lastFaultAt)) || textValue(item.lastFaultAt),
    textValue(item.status),
  ]);

  return `\uFEFF${[header, ...rows]
    .map((row) => row.map(csvCell).join(';'))
    .join('\r\n')}`;
}

function buildMostFrequentFaultsReportCsv(items: DataItem[]) {
  const header = [
    'Θέση',
    'Τύπος Βλάβης',
    'Συνολικές Καταγραφές',
    'Διαφορετικά Vacuum Pads',
    'Διαφορετικά Μηχανήματα',
    'Χωρίς Απόδοση σε Μηχάνημα',
    'Επισκευές',
    'Αντικαταστάσεις',
    'Downtime',
    'Μέσος Χρόνος Αποκατάστασης',
    'Top Vacuum Pad',
    'Top Μηχάνημα',
    'Τελευταία Καταγραφή',
  ];
  const rows = items.map((item) => [
    String(numberValue(item.rank) ?? ''),
    faultFrequencyFaultText(item),
    String(numberValue(item.totalOccurrences) ?? 0),
    String(numberValue(item.distinctVacuumPads) ?? 0),
    String(numberValue(item.distinctMachines) ?? 0),
    String(numberValue(item.unattributedCount) ?? 0),
    String(numberValue(item.repairs) ?? 0),
    String(numberValue(item.replacements) ?? 0),
    formatHours(item.downtimeHours),
    formatHours(item.averageRestorationHours),
    textValue(item.topVacuumPad),
    textValue(item.topMachine),
    formatDateTime(textValue(item.lastOccurredAt)) ||
      textValue(item.lastOccurredAt),
  ]);

  return `\uFEFF${[header, ...rows]
    .map((row) => row.map(csvCell).join(';'))
    .join('\r\n')}`;
}

function buildVacuumLocationReportCsv(items: DataItem[]) {
  const header = [
    'Κωδικός',
    'Vacuum Pad / Serial',
    'Κατηγορία Θέσης',
    'Τρέχουσα Θέση',
    'Μηχάνημα',
    'Rack',
    'Operational Status',
    'Location Status',
    'Τελευταία Μετακίνηση',
    'Updated At',
    'Open Repair ID',
  ];
  const rows = items.map((item) => [
    textValue(item.code),
    mostUsedVacuumText(item),
    textValue(item.locationCategoryLabel),
    textValue(item.currentPlace),
    vacuumLocationMachineText(item),
    vacuumLocationRackText(item),
    textValue(item.operationalStatus),
    textValue(item.locationStatus),
    formatDateTime(textValue(item.latestMovementAt)) ||
      textValue(item.latestMovementAt),
    formatDateTime(textValue(item.updatedAt)) || textValue(item.updatedAt),
    textValue(item.openRepairId),
  ]);

  return `\uFEFF${[header, ...rows]
    .map((row) => row.map(csvCell).join(';'))
    .join('\r\n')}`;
}

function buildMovementsExcelXml(items: DataItem[]) {
  const rows = movementExportRows(items);
  const columnWidths = [120, 130, 120, 100, 110, 120, 180, 120, 260, 160];

  return `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
  xmlns:o="urn:schemas-microsoft-com:office:office"
  xmlns:x="urn:schemas-microsoft-com:office:excel"
  xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
  <Styles>
    <Style ss:ID="Header">
      <Font ss:Bold="1" />
      <Interior ss:Color="#EDF3EA" ss:Pattern="Solid" />
    </Style>
  </Styles>
  <Worksheet ss:Name="Κινήσεις">
    <Table>
      ${columnWidths.map((width) => `<Column ss:Width="${width}" />`).join('\n      ')}
      ${rows
        .map(
          (row, index) => `
      <Row${index === 0 ? ' ss:StyleID="Header"' : ''}>
        ${row
          .map(
            (cell) =>
              `<Cell><Data ss:Type="String">${escapeXml(cell)}</Data></Cell>`,
          )
          .join('\n        ')}
      </Row>`,
        )
        .join('')}
    </Table>
  </Worksheet>
</Workbook>`;
}

function buildXlsxWorkbook(sheet: XlsxSheet) {
  const worksheetXml = buildXlsxWorksheetXml(sheet);
  const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="${escapeXml(sheet.name)}" sheetId="1" r:id="rId1"/>
  </sheets>
</workbook>`;
  const workbookRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>`;
  const rootRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;
  const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>`;

  return buildZipArchive([
    { name: '[Content_Types].xml', content: contentTypesXml },
    { name: '_rels/.rels', content: rootRelsXml },
    { name: 'xl/workbook.xml', content: workbookXml },
    { name: 'xl/_rels/workbook.xml.rels', content: workbookRelsXml },
    { name: 'xl/worksheets/sheet1.xml', content: worksheetXml },
  ]);
}

function buildXlsxWorksheetXml(sheet: XlsxSheet) {
  const columnXml = sheet.columnWidths?.length
    ? `<cols>${sheet.columnWidths
        .map(
          (width, index) =>
            `<col min="${index + 1}" max="${index + 1}" width="${Math.max(8, Math.round(width / 7))}" customWidth="1"/>`,
        )
        .join('')}</cols>`
    : '';
  const rowsXml = sheet.rows
    .map(
      (row, rowIndex) =>
        `<row r="${rowIndex + 1}">${row
          .map((cell, columnIndex) =>
            buildXlsxCellXml(cell, rowIndex + 1, columnIndex + 1),
          )
          .join('')}</row>`,
    )
    .join('');

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  ${columnXml}
  <sheetData>${rowsXml}</sheetData>
</worksheet>`;
}

function buildXlsxCellXml(
  value: XlsxCellValue,
  rowIndex: number,
  columnIndex: number,
) {
  const reference = `${columnLetters(columnIndex)}${rowIndex}`;

  if (value === undefined || value === null || value === '') {
    return `<c r="${reference}"/>`;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return `<c r="${reference}"><v>${value}</v></c>`;
  }

  if (typeof value === 'boolean') {
    return `<c r="${reference}" t="b"><v>${value ? 1 : 0}</v></c>`;
  }

  return `<c r="${reference}" t="inlineStr"><is><t>${escapeXml(String(value))}</t></is></c>`;
}

function columnLetters(index: number) {
  let value = index;
  let letters = '';

  while (value > 0) {
    const remainder = (value - 1) % 26;
    letters = String.fromCharCode(65 + remainder) + letters;
    value = Math.floor((value - 1) / 26);
  }

  return letters;
}

function buildZipArchive(files: Array<{ name: string; content: string }>) {
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const centralDirectory: Uint8Array[] = [];
  let offset = 0;

  files.forEach((file) => {
    const nameBytes = encoder.encode(file.name);
    const data = encoder.encode(file.content);
    const crc = crc32(data);
    const localHeader = new Uint8Array(30 + nameBytes.length);
    const localView = new DataView(localHeader.buffer);

    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, 0, true);
    localView.setUint16(8, 0, true);
    localView.setUint16(10, 0, true);
    localView.setUint16(12, 0, true);
    localView.setUint32(14, crc, true);
    localView.setUint32(18, data.length, true);
    localView.setUint32(22, data.length, true);
    localView.setUint16(26, nameBytes.length, true);
    localView.setUint16(28, 0, true);
    localHeader.set(nameBytes, 30);

    chunks.push(localHeader, data);

    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const centralView = new DataView(centralHeader.buffer);

    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, 0, true);
    centralView.setUint16(10, 0, true);
    centralView.setUint16(12, 0, true);
    centralView.setUint16(14, 0, true);
    centralView.setUint32(16, crc, true);
    centralView.setUint32(20, data.length, true);
    centralView.setUint32(24, data.length, true);
    centralView.setUint16(28, nameBytes.length, true);
    centralView.setUint16(30, 0, true);
    centralView.setUint16(32, 0, true);
    centralView.setUint16(34, 0, true);
    centralView.setUint16(36, 0, true);
    centralView.setUint32(38, 0, true);
    centralView.setUint32(42, offset, true);
    centralHeader.set(nameBytes, 46);
    centralDirectory.push(centralHeader);

    offset += localHeader.length + data.length;
  });

  const centralDirectoryOffset = offset;
  const centralDirectorySize = centralDirectory.reduce(
    (total, chunk) => total + chunk.length,
    0,
  );
  const endRecord = new Uint8Array(22);
  const endView = new DataView(endRecord.buffer);

  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(4, 0, true);
  endView.setUint16(6, 0, true);
  endView.setUint16(8, files.length, true);
  endView.setUint16(10, files.length, true);
  endView.setUint32(12, centralDirectorySize, true);
  endView.setUint32(16, centralDirectoryOffset, true);
  endView.setUint16(20, 0, true);

  return concatBytes([...chunks, ...centralDirectory, endRecord]);
}

const crc32Table = Array.from({ length: 256 }, (_, index) => {
  let value = index;

  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }

  return value >>> 0;
});

function crc32(data: Uint8Array) {
  let crc = 0xffffffff;

  data.forEach((byte) => {
    crc = crc32Table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  });

  return (crc ^ 0xffffffff) >>> 0;
}

function concatBytes(chunks: Uint8Array[]) {
  const totalLength = chunks.reduce((total, chunk) => total + chunk.length, 0);
  const output = new Uint8Array(totalLength);
  let offset = 0;

  chunks.forEach((chunk) => {
    output.set(chunk, offset);
    offset += chunk.length;
  });

  return output;
}

function csvCell(value: string) {
  const normalized = value.replace(/\r?\n/g, ' ');

  if (/[;"\r\n]/.test(normalized)) {
    return `"${normalized.replace(/"/g, '""')}"`;
  }

  return normalized;
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function movementExportFilename(extension: 'csv' | 'xls') {
  const now = new Date();
  const date = [
    now.getFullYear(),
    padDatePart(now.getMonth() + 1),
    padDatePart(now.getDate()),
  ].join('-');
  const time = `${padDatePart(now.getHours())}${padDatePart(now.getMinutes())}`;

  return `movements-${date}-${time}.${extension}`;
}

function exportTimestamp() {
  const now = new Date();
  const date = [
    now.getFullYear(),
    padDatePart(now.getMonth() + 1),
    padDatePart(now.getDate()),
  ].join('-');
  const time = `${padDatePart(now.getHours())}${padDatePart(now.getMinutes())}`;

  return `${date}-${time}`;
}

function mostUsedReportFilename() {
  const now = new Date();
  const date = [
    now.getFullYear(),
    padDatePart(now.getMonth() + 1),
    padDatePart(now.getDate()),
  ].join('-');
  const time = `${padDatePart(now.getHours())}${padDatePart(now.getMinutes())}`;

  return `most-used-vacuum-pads-${date}-${time}.csv`;
}

function faultyReportFilename() {
  const now = new Date();
  const date = [
    now.getFullYear(),
    padDatePart(now.getMonth() + 1),
    padDatePart(now.getDate()),
  ].join('-');
  const time = `${padDatePart(now.getHours())}${padDatePart(now.getMinutes())}`;

  return `vacuum-pads-with-most-faults-${date}-${time}.csv`;
}

function machineFaultReportFilename() {
  const now = new Date();
  const date = [
    now.getFullYear(),
    padDatePart(now.getMonth() + 1),
    padDatePart(now.getDate()),
  ].join('-');
  const time = `${padDatePart(now.getHours())}${padDatePart(now.getMinutes())}`;

  return `machines-causing-vacuum-pad-faults-${date}-${time}.csv`;
}

function mostFrequentFaultsReportFilename() {
  const now = new Date();
  const date = [
    now.getFullYear(),
    padDatePart(now.getMonth() + 1),
    padDatePart(now.getDate()),
  ].join('-');
  const time = `${padDatePart(now.getHours())}${padDatePart(now.getMinutes())}`;

  return `most-frequent-faults-${date}-${time}.csv`;
}

function vacuumLocationReportFilename() {
  const now = new Date();
  const date = [
    now.getFullYear(),
    padDatePart(now.getMonth() + 1),
    padDatePart(now.getDate()),
  ].join('-');
  const time = `${padDatePart(now.getHours())}${padDatePart(now.getMinutes())}`;

  return `vacuum-pad-location-${date}-${time}.csv`;
}

function padDatePart(value: number) {
  return value.toString().padStart(2, '0');
}

function downloadTextFile(content: string, filename: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function downloadBinaryFile(content: Uint8Array, filename: string, type: string) {
  const arrayBuffer = new ArrayBuffer(content.byteLength);
  new Uint8Array(arrayBuffer).set(content);
  const blob = new Blob([arrayBuffer], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function formatTime(value: Date) {
  return new Intl.DateTimeFormat('el-GR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(value);
}

function formatDateTime(value: string) {
  if (!value) {
    return '';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('el-GR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date);
}

function formatDate(value: string) {
  if (!value) {
    return '';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('el-GR', {
    dateStyle: 'short',
  }).format(date);
}

function dateOnlyText(value: string) {
  if (!value) {
    return '';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value.slice(0, 10);
  }

  return date.toISOString().slice(0, 10);
}

function vacuumPrimaryText(item: DataItem) {
  return textValue(item.serialNumber) || textValue(item.code) || 'Vacuum';
}

function vacuumSecondaryText(item: DataItem) {
  const parts = [
    textValue(item.code),
    textValue(item.description),
    textValue(item.displayStatus),
  ].filter(Boolean);
  return parts.join(' · ');
}

function vacuumBadge(item: DataItem): SelectorBadge | null {
  if (isIncompleteVacuum(item)) {
    return { label: 'Λείπει serial', tone: 'danger' };
  }

  const label =
    textValue(item.displayStatus) ||
    textValue(item.locationStatus) ||
    textValue(item.operationalStatus);

  if (!label) {
    return null;
  }

  const normalized = label.toUpperCase();
  const tone =
    normalized.includes('REPAIR') || normalized.includes('ΕΠΙΣΚΕΥ')
      ? 'warning'
      : normalized.includes('ACTIVE') || normalized.includes('ΕΝΕΡΓ')
        ? 'success'
        : 'neutral';

  return { label, tone };
}

function machinePrimaryText(item: DataItem) {
  const code = textValue(item.code);
  const name = textValue(item.name);
  return [code, name].filter(Boolean).join(' - ') || 'Machine';
}

function machineSecondaryText(item: DataItem) {
  const availability =
    item.isAvailableForCharge === false ? 'Σε χρήση/μη διαθέσιμο' : 'Διαθέσιμο';
  const currentPad =
    item.currentPad && typeof item.currentPad === 'object'
      ? (item.currentPad as DataItem)
      : null;
  const occupiedBy = currentPad
    ? `Vacuum ${textValue(currentPad.serialNumber) || textValue(currentPad.code)}`
    : '';
  return [availability, textValue(item.project), textValue(item.area), occupiedBy]
    .filter(Boolean)
    .join(' · ');
}

function machineBadge(item: DataItem): SelectorBadge {
  return item.isAvailableForCharge === false
    ? { label: 'Σε χρήση', tone: 'warning' }
    : { label: 'Διαθέσιμο', tone: 'success' };
}

function rackPrimaryText(item: DataItem) {
  const code = textValue(item.code);
  const label = textValue(item.label);
  return [code, label].filter(Boolean).join(' - ') || 'Rack';
}

function rackSecondaryText(item: DataItem) {
  const availability = item.isAvailable === false ? 'Κατειλημμένη' : 'Ελεύθερη';
  return [
    textValue(item.type),
    availability,
    textValue(item.zone),
    textValue(item.rack),
    textValue(item.slot),
  ]
    .filter(Boolean)
    .join(' · ');
}

function rackBadge(item: DataItem): SelectorBadge | null {
  const type = textValue(item.type);

  if (!type) {
    return item.isAvailable === false
      ? { label: 'Κατειλημμένη', tone: 'warning' }
      : null;
  }

  return {
    label: type,
    tone: type === 'REP' ? 'warning' : 'info',
  };
}

function faultPrimaryText(item: DataItem) {
  const code = textValue(item.code);
  const label = textValue(item.label);
  return [code, label].filter(Boolean).join(' - ') || 'Βλάβη';
}

function faultSecondaryText(item: DataItem) {
  return [textValue(item.description), textValue(item.severity)]
    .filter(Boolean)
    .join(' · ');
}

function faultBadge(item: DataItem): SelectorBadge | null {
  const code = textValue(item.code);

  return code ? { label: code, tone: code === 'OTHER' ? 'neutral' : 'info' } : null;
}
