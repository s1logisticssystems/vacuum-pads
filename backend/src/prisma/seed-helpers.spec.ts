import {
  deriveIncompleteVacuumQrCode,
  deriveMachineQrCode,
  deriveRackQrCode,
  deriveVacuumQrCode,
  isIncompleteVacuumQrCode,
} from '../../prisma/seed-helpers';

describe('seed qrCode derivation helpers', () => {
  it('derives vacuum qrCode from serialNumber', () => {
    expect(deriveVacuumQrCode('19081291644')).toBe('19081291644');
  });

  it('derives marked non-operational qrCode aliases for incomplete vacuums', () => {
    expect(deriveIncompleteVacuumQrCode('VP-009')).toBe('INCOMPLETE-VP-009');
    expect(isIncompleteVacuumQrCode('INCOMPLETE-VP-009')).toBe(true);
    expect(isIncompleteVacuumQrCode('19081291644')).toBe(false);
  });

  it('derives machine qrCode from code while preserving legacy QR labels', () => {
    expect(deriveMachineQrCode('MACH-001')).toBe('QR-MACH-001');
  });

  it('derives rack qrCode from code while preserving legacy QR labels', () => {
    expect(deriveRackQrCode('RACK-A-01-01')).toBe('QR-RACK-A-01-01');
  });

  it('does not double-prefix existing legacy QR aliases', () => {
    expect(deriveMachineQrCode('QR-MACH-001')).toBe('QR-MACH-001');
    expect(deriveRackQrCode('QR-RACK-A-01-01')).toBe('QR-RACK-A-01-01');
  });
});
