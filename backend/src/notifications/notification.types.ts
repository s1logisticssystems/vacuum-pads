export const REPAIR_INTAKE_TOPIC = 'vacuum-repair-intake';
export const REPAIR_RESTORED_TOPIC = 'vacuum-repair-restored';
export const REPAIR_INTAKE_CHANNEL_ID = 'repair_intake_channel_v7';
export const REPAIR_RESTORED_CHANNEL_ID = 'repair_restored_channel_v7';
export const REPAIR_INTAKE_SOUND = 'error';
export const REPAIR_RESTORED_SOUND = 'fix';

export interface RepairNotificationPayload {
  repairId?: string | null;
  vacuumCode?: string | null;
  vacuumSerial?: string | null;
  rackCode?: string | null;
}
