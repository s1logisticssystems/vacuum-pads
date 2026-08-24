function requireSourceValue(value: string, fieldName: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new Error(`Cannot derive qrCode from empty ${fieldName}`);
  }

  return normalized;
}

function deriveLegacyQrAlias(code: string, fieldName: string): string {
  const normalized = requireSourceValue(code, fieldName);
  return normalized.startsWith('QR-') ? normalized : `QR-${normalized}`;
}

export function deriveVacuumQrCode(serialNumber: string): string {
  return requireSourceValue(serialNumber, 'serialNumber');
}

export function deriveIncompleteVacuumQrCode(code: string): string {
  return `INCOMPLETE-${requireSourceValue(code, 'vacuum code')}`;
}

export function isIncompleteVacuumQrCode(value: string | null | undefined) {
  return value?.trim().toUpperCase().startsWith('INCOMPLETE-') ?? false;
}

export function deriveMachineQrCode(code: string): string {
  return deriveLegacyQrAlias(code, 'machine code');
}

export function deriveRackQrCode(code: string): string {
  return deriveLegacyQrAlias(code, 'rack code');
}
