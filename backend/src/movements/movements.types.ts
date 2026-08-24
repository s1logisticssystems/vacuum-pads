export type AdminMovementType =
  | 'CHARGE'
  | 'DECHARGE'
  | 'FAULT_DECLARED'
  | 'FAULT_RESTORED';

export type ListMovementsQuery = {
  page?: string;
  pageSize?: string;
  type?: string;
  vacuum?: string | string[];
  machine?: string | string[];
  rack?: string | string[];
  fault?: string | string[];
  startedFrom?: string;
  startedTo?: string;
  endedFrom?: string;
  endedTo?: string;
};

export type MovementRow = {
  id: string;
  type: AdminMovementType;
  typeLabel: string;
  vacuumSerial: string | null;
  vacuumCode: string | null;
  machineCode: string | null;
  rackCode: string | null;
  faultCode: string | null;
  faultLabel: string | null;
  repairId: string | null;
  photoCount: number;
  faultDeclarationPhotoCount: number;
  repairCompletionPhotoCount: number;
  startedAt: string;
  endedAt: string | null;
  details: string | null;
};

export type MovementsListResponse = {
  items: MovementRow[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};
