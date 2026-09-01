export const DEFAULT_API_BASE_URL = 'https://vacuum-admin.s1-logistics.com/api';
export const ADMIN_DEVICE_ID = 'admin-web';

export type ApiPayload = Record<string, unknown>;

export type DataItem = Record<string, unknown>;
export type MasterDataImportEntity =
  | 'vacuums'
  | 'machines'
  | 'racks'
  | 'faults';

type RequestDebug = {
  method: string;
  url: string;
  payload?: ApiPayload;
  bodyEncoding?: string;
};

export type FaultCatalogItem = {
  id?: string;
  code?: string;
  label?: string;
  description?: string;
  severity?: string;
  sortOrder?: number;
};

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    readonly payload: unknown,
    readonly request: RequestDebug,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export class AdminApiClient {
  constructor(
    private readonly baseUrl: string,
    private readonly accessToken: string | null = null,
  ) {}

  login(username: string, password: string) {
    return this.postJson('/auth/login', { username, password });
  }

  getCurrentUser() {
    return this.get('/auth/me');
  }

  changeOwnPassword(currentPassword: string, newPassword: string) {
    return this.postJson('/auth/change-password', {
      currentPassword,
      newPassword,
    });
  }

  listUsers() {
    return this.get('/users');
  }

  createUser(body: ApiPayload) {
    return this.postJson('/users', body);
  }

  setUserPassword(id: string, password: string) {
    return this.postJson(`/users/${encodeURIComponent(id)}/password`, {
      password,
    });
  }

  deleteUser(id: string) {
    return this.delete(`/users/${encodeURIComponent(id)}`);
  }

  getHealth() {
    return this.get('/health');
  }

  getDatabaseHealth() {
    return this.get('/health/database', [503]);
  }

  getFaultCatalog(options: { activeOnly?: boolean } = {}) {
    return this.get(
      `/master-data/fault-catalog${toQuery({
        activeOnly: options.activeOnly ?? true,
      })}`,
    );
  }

  getVacuumPads() {
    return this.get('/master-data/vacuum-pads');
  }

  getMachines(options: { activeOnly?: boolean; availableOnly?: boolean } = {}) {
    return this.get(
      `/master-data/machines${toQuery({
        activeOnly: options.activeOnly ?? true,
        availableOnly: options.availableOnly ?? false,
      })}`,
    );
  }

  getRackLocations(
    options: {
      activeOnly?: boolean;
      availableOnly?: boolean;
      type?: string;
    } = {},
  ) {
    return this.get(
      `/master-data/rack-locations${toQuery({
        activeOnly: options.activeOnly ?? true,
        availableOnly: options.availableOnly ?? false,
        type: options.type,
      })}`,
    );
  }

  getStatusSummary() {
    return this.get('/status/summary');
  }

  getActiveVacuums() {
    return this.get('/status/active-vacuums');
  }

  getInactiveVacuums() {
    return this.get('/status/inactive-vacuums');
  }

  getRepairVacuums() {
    return this.get('/status/repair-vacuums');
  }

  getAdminEventsUrl() {
    return this.resolveUrl('/events/admin');
  }

  /**
   * Turns an API-relative path into a URL the browser can load.
   *
   * Repair photos are served by the backend as "/repairs/.../content" rather
   * than as object-store links, so they resolve against whichever backend URL
   * this admin is configured with. Absolute URLs are returned unchanged.
   */
  resolveUrl(pathOrUrl: string): string {
    if (!pathOrUrl) {
      return '';
    }

    if (/^[a-z][a-z0-9+.-]*:/i.test(pathOrUrl)) {
      return pathOrUrl;
    }

    const suffix = pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`;
    const url = `${normalizeBaseUrl(this.baseUrl)}${suffix}`;

    // <img> and EventSource cannot carry an Authorization header, so the token
    // travels as a query parameter for those requests only.
    if (!this.accessToken) {
      return url;
    }

    return `${url}${url.includes('?') ? '&' : '?'}access_token=${encodeURIComponent(
      this.accessToken,
    )}`;
  }

  listMovements(
    filters: Record<string, string | string[] | number | undefined>,
  ) {
    return this.get(`/movements${toQuery(filters)}`);
  }

  getRepairPhotos(repairId: string) {
    return this.get(`/repairs/${encodeURIComponent(repairId)}/photos`);
  }

  deleteRepairPhoto(repairId: string, photoId: string) {
    return this.delete(
      `/repairs/${encodeURIComponent(repairId)}/photos/${encodeURIComponent(
        photoId,
      )}`,
    );
  }

  getMostUsedVacuumPadsReport(
    filters: Record<string, string | string[] | number | undefined>,
  ) {
    return this.get(`/reports/most-used-vacuum-pads${toQuery(filters)}`);
  }

  getFaultyVacuumPadsReport(
    filters: Record<string, string | string[] | number | undefined>,
  ) {
    return this.get(`/reports/vacuum-pads-with-most-faults${toQuery(filters)}`);
  }

  getMachinesCausingFaultsReport(
    filters: Record<string, string | string[] | number | undefined>,
  ) {
    return this.get(`/reports/machines-causing-most-faults${toQuery(filters)}`);
  }

  getMostFrequentFaultsReport(
    filters: Record<string, string | string[] | number | undefined>,
  ) {
    return this.get(`/reports/most-frequent-faults${toQuery(filters)}`);
  }

  getVacuumPadLocationReport(
    filters: Record<
      string,
      string | string[] | number | boolean | undefined
    >,
  ) {
    return this.get(`/reports/vacuum-pad-location${toQuery(filters)}`);
  }

  createVacuumPad(body: ApiPayload) {
    return this.post('/master-data/vacuum-pads', body);
  }

  updateVacuumPad(id: string, body: ApiPayload) {
    return this.patch(`/master-data/vacuum-pads/${encodeURIComponent(id)}`, body);
  }

  deleteVacuumPad(id: string) {
    return this.delete(`/master-data/vacuum-pads/${encodeURIComponent(id)}`);
  }

  createMachine(body: ApiPayload) {
    return this.post('/master-data/machines', body);
  }

  updateMachine(id: string, body: ApiPayload) {
    return this.patch(`/master-data/machines/${encodeURIComponent(id)}`, body);
  }

  deleteMachine(id: string) {
    return this.delete(`/master-data/machines/${encodeURIComponent(id)}`);
  }

  createRackLocation(body: ApiPayload) {
    return this.post('/master-data/rack-locations', body);
  }

  updateRackLocation(id: string, body: ApiPayload) {
    return this.patch(
      `/master-data/rack-locations/${encodeURIComponent(id)}`,
      body,
    );
  }

  deleteRackLocation(id: string) {
    return this.delete(`/master-data/rack-locations/${encodeURIComponent(id)}`);
  }

  createFaultCatalogItem(body: ApiPayload) {
    return this.post('/master-data/fault-catalog', body);
  }

  updateFaultCatalogItem(id: string, body: ApiPayload) {
    return this.patch(
      `/master-data/fault-catalog/${encodeURIComponent(id)}`,
      body,
    );
  }

  deleteFaultCatalogItem(id: string) {
    return this.delete(`/master-data/fault-catalog/${encodeURIComponent(id)}`);
  }

  previewMasterDataImport(entity: MasterDataImportEntity, file: File) {
    return this.uploadMasterDataWorkbook(
      `/master-data/import/${masterDataImportPath(entity)}/preview`,
      file,
    );
  }

  commitMasterDataImport(entity: MasterDataImportEntity, file: File) {
    return this.uploadMasterDataWorkbook(
      `/master-data/import/${masterDataImportPath(entity)}/commit`,
      file,
    );
  }

  chargePreview(body: ApiPayload) {
    return this.post('/charge/preview', body);
  }

  charge(body: ApiPayload) {
    return this.post('/charge', body);
  }

  dechargePreview(body: ApiPayload) {
    return this.post('/decharge/preview', body);
  }

  decharge(body: ApiPayload) {
    return this.post('/decharge', body);
  }

  faultDeclarationPreview(body: ApiPayload) {
    return this.post('/faults/declaration/preview', body);
  }

  faultDeclaration(body: ApiPayload) {
    return this.post('/faults/declaration', body);
  }

  faultRestorationPreview(body: ApiPayload) {
    return this.post('/faults/restoration/preview', body);
  }

  faultRestoration(body: ApiPayload) {
    return this.post('/faults/restoration', body);
  }

  private get(path: string, allowedErrorStatuses: number[] = []) {
    return this.request(path, { method: 'GET' }, allowedErrorStatuses);
  }

  /** JSON body, for auth and user endpoints whose DTOs are not form-encoded. */
  private postJson(path: string, body: ApiPayload) {
    return this.request(
      path,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
      [],
      { ...body, password: undefined, newPassword: undefined, currentPassword: undefined },
    );
  }

  private post(path: string, body: ApiPayload) {
    const payload = removeEmptyValues(body);

    // URL-encoded bodies map to the same DTO fields, while avoiding fragile
    // CORS preflight failures on deployments where GET works but OPTIONS does not.
    return this.request(
      path,
      {
        method: 'POST',
        body: toFormBody(payload),
      },
      [],
      payload,
    );
  }

  private patch(path: string, body: ApiPayload) {
    const payload = removeEmptyValues(body);

    return this.request(
      path,
      {
        method: 'PATCH',
        body: toFormBody(payload),
      },
      [],
      payload,
    );
  }

  private delete(path: string) {
    return this.request(path, { method: 'DELETE' });
  }

  private uploadMasterDataWorkbook(path: string, file: File) {
    const body = new FormData();
    body.set('file', file);

    return this.request(
      path,
      {
        method: 'POST',
        body,
      },
      [],
      {
        fileName: file.name,
        fileSize: file.size,
      },
    );
  }

  private async request(
    path: string,
    init: RequestInit,
    allowedErrorStatuses: number[] = [],
    payload?: ApiPayload,
  ): Promise<ApiPayload> {
    const url = `${normalizeBaseUrl(this.baseUrl)}${path}`;
    const method = init.method ?? 'GET';
    const bodyEncoding =
      init.body instanceof FormData
        ? 'multipart/form-data'
        : payload
          ? 'application/x-www-form-urlencoded'
          : undefined;
    const request: RequestDebug = {
      method,
      url,
      ...(payload ? { payload, bodyEncoding } : {}),
    };
    const headers = new Headers(init.headers);
    headers.set('Accept', 'application/json');

    if (this.accessToken) {
      headers.set('Authorization', `Bearer ${this.accessToken}`);
    }

    let response: Response;

    try {
      response = await fetch(url, {
        ...init,
        headers,
        mode: 'cors',
      });
    } catch (caught) {
      throw new ApiError(
        'Network request failed. Check backend URL, CORS, proxy OPTIONS handling, and server availability.',
        null,
        {
          networkError: true,
          message: caught instanceof Error ? caught.message : String(caught),
          request,
        },
        request,
      );
    }

    const parsedPayload = await parseResponse(response);
    const normalizedPayload = normalizePayload(parsedPayload, response.status);

    if (!response.ok && !allowedErrorStatuses.includes(response.status)) {
      throw new ApiError(
        extractMessage(normalizedPayload) ?? `HTTP ${response.status}`,
        response.status,
        { ...normalizedPayload, request },
        request,
      );
    }

    return normalizedPayload;
  }
}

export function normalizeBaseUrl(value: string) {
  return (value.trim() || DEFAULT_API_BASE_URL).replace(/\/+$/, '');
}

export function removeEmptyValues(payload: ApiPayload): ApiPayload {
  return Object.fromEntries(
    Object.entries(payload).filter(([, value]) => {
      if (value === undefined || value === null) {
        return false;
      }

      if (typeof value === 'string') {
        return value.trim().length > 0;
      }

      return true;
    }),
  );
}

export function extractMessage(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const record = payload as Record<string, unknown>;
  const message = record.message;

  if (Array.isArray(message)) {
    return message.join(', ');
  }

  return typeof message === 'string' ? message : null;
}

async function parseResponse(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { value: text };
  }
}

function normalizePayload(payload: unknown, status: number): ApiPayload {
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    return { httpStatus: status, ...(payload as ApiPayload) };
  }

  if (Array.isArray(payload)) {
    return { httpStatus: status, items: payload, total: payload.length };
  }

  return { httpStatus: status, value: payload };
}

function toFormBody(payload: ApiPayload) {
  const body = new URLSearchParams();

  for (const [key, value] of Object.entries(payload)) {
    if (typeof value === 'object') {
      body.set(key, JSON.stringify(value));
    } else {
      body.set(key, String(value));
    }
  }

  return body;
}

function masterDataImportPath(entity: MasterDataImportEntity) {
  switch (entity) {
    case 'machines':
      return 'machines';
    case 'racks':
      return 'rack-locations';
    case 'faults':
      return 'fault-catalog';
    case 'vacuums':
    default:
      return 'vacuum-pads';
  }
}

function toQuery(
  params: Record<
    string,
    string | string[] | number | boolean | undefined
  >,
) {
  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) {
      const serialized = value
        .map((item) => item.trim())
        .filter(Boolean)
        .join(',');

      if (serialized) {
        query.set(key, serialized);
      }
    } else if (value !== undefined && value !== '') {
      query.set(key, String(value));
    }
  }

  const serialized = query.toString();
  return serialized ? `?${serialized}` : '';
}
