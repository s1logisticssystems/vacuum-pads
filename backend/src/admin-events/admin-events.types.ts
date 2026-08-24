export type AdminWorkflowEventType =
  | 'charge'
  | 'decharge'
  | 'fault_declared'
  | 'fault_restored';

export interface AdminWorkflowEvent {
  type: AdminWorkflowEventType;
  timestamp: string;
  vacuumSerial?: string | null;
  vacuumCode?: string | null;
  machineCode?: string | null;
  rackCode?: string | null;
  repairId?: string | null;
}

export interface AdminPingEvent {
  type: 'ping';
  timestamp: string;
}

export type AdminSseEvent = AdminWorkflowEvent | AdminPingEvent;
