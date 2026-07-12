/* AssetFlow API client — connects the UI to the FastAPI backend. */

export const API_URL =
  (import.meta as any).env?.VITE_API_URL?.replace(/\/$/, "") || "http://localhost:8000";

// ---------------- token store ----------------
const ACCESS_KEY = "af_access";
const REFRESH_KEY = "af_refresh";

export const tokens = {
  get access() { return typeof localStorage !== "undefined" ? localStorage.getItem(ACCESS_KEY) : null; },
  get refresh() { return typeof localStorage !== "undefined" ? localStorage.getItem(REFRESH_KEY) : null; },
  set(a: string, r: string) { localStorage.setItem(ACCESS_KEY, a); localStorage.setItem(REFRESH_KEY, r); },
  clear() { localStorage.removeItem(ACCESS_KEY); localStorage.removeItem(REFRESH_KEY); },
};

export function isLoggedIn(): boolean { return !!tokens.access; }

// ---------------- core fetch with auto-refresh ----------------
async function rawFetch(path: string, init: RequestInit = {}, retry = true): Promise<Response> {
  const headers: Record<string, string> = { ...(init.headers as any) };
  if (!(init.body instanceof FormData)) headers["Content-Type"] = "application/json";
  if (tokens.access) headers["Authorization"] = `Bearer ${tokens.access}`;
  const res = await fetch(`${API_URL}${path}`, { ...init, headers });
  if (res.status === 401 && retry && tokens.refresh) {
    const rr = await fetch(`${API_URL}/api/auth/refresh`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: tokens.refresh }),
    });
    if (rr.ok) {
      const t = await rr.json();
      tokens.set(t.access_token, t.refresh_token);
      return rawFetch(path, init, false);
    }
    tokens.clear();
  }
  return res;
}

export class ApiError extends Error {
  status: number; detail: any;
  constructor(status: number, detail: any) {
    super(typeof detail === "string" ? detail : detail?.error || JSON.stringify(detail));
    this.status = status; this.detail = detail;
  }
}

export async function api<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await rawFetch(path, init);
  if (!res.ok) {
    let detail: any = res.statusText;
    try { detail = (await res.json()).detail; } catch { /* ignore */ }
    throw new ApiError(res.status, detail);
  }
  if (res.status === 204) return undefined as T;
  const ct = res.headers.get("content-type") || "";
  return (ct.includes("application/json") ? res.json() : res.blob()) as Promise<T>;
}

const j = (b: any) => JSON.stringify(b);

// ---------------- types (backend shapes) ----------------
export type BackendRole = "admin" | "asset_manager" | "department_head" | "employee";
export type AppRole = "admin" | "asset_manager" | "dept_head" | "employee";
export const toAppRole = (r: BackendRole): AppRole => (r === "department_head" ? "dept_head" : r);
export const toBackendRole = (r: AppRole): BackendRole => (r === "dept_head" ? "department_head" : r);

export interface ApiUser {
  id: number; name: string; email: string; employee_code: string | null;
  department_id: number | null; role: BackendRole; status: "active" | "inactive" | "pending";
}
export interface ApiAsset {
  id: number; asset_tag: string; name: string; category_id: number;
  serial_number: string | null; acquisition_date: string | null; acquisition_cost: number | null;
  condition: string; location: string | null; status: string;
  owner_department_id: number | null; is_bookable: boolean; custom_values: any;
}
export interface ApiAllocation {
  id: number; asset_id: number; holder_id: number; department_id: number | null;
  allocated_by: number; allocated_at: string; expected_return_date: string | null;
  returned_at: string | null; return_condition: string | null; return_notes: string | null;
  status: "active" | "returned"; is_overdue: boolean;
}
export interface ApiTransfer {
  id: number; asset_id: number; from_user_id: number | null; to_user_id: number;
  requested_by: number; approved_by: number | null; reason: string | null;
  status: "requested" | "approved" | "rejected" | "completed"; created_at: string;
}
export interface ApiBooking {
  id: number; asset_id: number; booked_by: number; department_id: number | null;
  start_time: string; end_time: string; purpose: string | null;
  status: "upcoming" | "ongoing" | "completed" | "cancelled";
}
export interface ApiMaintenance {
  id: number; asset_id: number; raised_by: number; approved_by: number | null;
  technician_id: number | null; issue_description: string; priority: string;
  attachment_url: string | null; resolution_notes: string | null; status: string; created_at: string;
}
export interface ApiAuditCycle {
  id: number; name: string; scope_department_id: number | null; scope_location: string | null;
  start_date: string; end_date: string; created_by: number; auditor_ids: number[] | null;
  status: "open" | "closed"; closed_at: string | null;
}
export interface ApiAuditItem {
  id: number; cycle_id: number; asset_id: number; verified_by: number | null;
  verified_at: string | null; notes: string | null;
  status: "pending" | "verified" | "missing" | "damaged";
}
export interface ApiNotification {
  id: number; type: string; title: string; message: string | null;
  payload: any; is_read: boolean; created_at: string;
}

// ---------------- auth ----------------
export const auth = {
  login: (email: string, password: string) =>
    api<{ access_token: string; refresh_token: string }>("/api/auth/login",
      { method: "POST", body: j({ email, password }) }).then((t) => tokens.set(t.access_token, t.refresh_token)),
  signup: (name: string, email: string, password: string) =>
    api<ApiUser>("/api/auth/signup", { method: "POST", body: j({ name, email, password }) }),
  me: () => api<ApiUser>("/api/auth/me"),
  forgot: (email: string) => api("/api/auth/forgot-password", { method: "POST", body: j({ email }) }),
  reset: (token: string, password: string) =>
    api("/api/auth/reset-password", { method: "POST", body: j({ token, password }) }),
  logout: () => { tokens.clear(); },
};

// ---------------- org setup ----------------
export const org = {
  departments: () => api<{ id: number; name: string; parent_id: number | null; head_id: number | null; status: string }[]>("/api/org/departments"),
  createDepartment: (name: string, parent_id?: number | null) =>
    api("/api/org/departments", { method: "POST", body: j({ name, parent_id: parent_id ?? null }) }),
  categories: () => api<{ id: number; name: string; description: string | null; custom_fields: any }[]>("/api/org/categories"),
  createCategory: (name: string, description?: string) =>
    api("/api/org/categories", { method: "POST", body: j({ name, description: description ?? null, custom_fields: [] }) }),
  employees: () => api<ApiUser[]>("/api/org/employees"),
  setRole: (userId: number, role: BackendRole) =>
    api(`/api/org/employees/${userId}/role`, { method: "PATCH", body: j({ role }) }),
  updateEmployee: (userId: number, patch: any) =>
    api(`/api/org/employees/${userId}`, { method: "PATCH", body: j(patch) }),
};

// ---------------- assets ----------------
export const assetsApi = {
  list: (params: Record<string, any> = {}) => {
    const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== "") as any).toString();
    return api<ApiAsset[]>(`/api/assets${qs ? `?${qs}` : ""}`);
  },
  get: (id: number | string) => api<ApiAsset>(`/api/assets/${id}`),
  create: (payload: any) => api<ApiAsset>("/api/assets", { method: "POST", body: j(payload) }),
  update: (id: number | string, patch: any) => api<ApiAsset>(`/api/assets/${id}`, { method: "PATCH", body: j(patch) }),
  changeStatus: (id: number | string, status: string, notes?: string) =>
    api<ApiAsset>(`/api/assets/${id}/status`, { method: "PATCH", body: j({ status, notes }) }),
  history: (id: number | string) =>
    api<{ allocations: ApiAllocation[]; maintenance: ApiMaintenance[] }>(`/api/assets/${id}/history`),
  qrUrl: (id: number | string) => `${API_URL}/api/assets/${id}/qr`,
};

// ---------------- allocations & transfers ----------------
export const allocationsApi = {
  list: (params: Record<string, any> = {}) => {
    const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== "") as any).toString();
    return api<ApiAllocation[]>(`/api/allocations${qs ? `?${qs}` : ""}`);
  },
  allocate: (asset_id: number, holder_id: number, expected_return_date?: string | null) =>
    api<ApiAllocation>("/api/allocations", { method: "POST", body: j({ asset_id, holder_id, expected_return_date: expected_return_date || null }) }),
  return: (allocation_id: number, condition = "good", notes?: string) =>
    api<ApiAllocation>(`/api/allocations/${allocation_id}/return`, { method: "POST", body: j({ condition, notes }) }),
};

export const transfersApi = {
  list: (status?: string) => api<ApiTransfer[]>(`/api/transfers${status ? `?status=${status}` : ""}`),
  request: (asset_id: number, to_user_id: number, reason?: string) =>
    api<ApiTransfer>("/api/transfers", { method: "POST", body: j({ asset_id, to_user_id, reason }) }),
  approve: (id: number) => api<ApiTransfer>(`/api/transfers/${id}/approve`, { method: "POST" }),
  reject: (id: number) => api<ApiTransfer>(`/api/transfers/${id}/reject`, { method: "POST" }),
};

// ---------------- bookings ----------------
export const bookingsApi = {
  list: (params: Record<string, any> = {}) => {
    const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== "") as any).toString();
    return api<ApiBooking[]>(`/api/bookings${qs ? `?${qs}` : ""}`);
  },
  create: (asset_id: number, start_time: string, end_time: string, purpose?: string) =>
    api<ApiBooking>("/api/bookings", { method: "POST", body: j({ asset_id, start_time, end_time, purpose }) }),
  cancel: (id: number) => api<ApiBooking>(`/api/bookings/${id}/cancel`, { method: "POST" }),
  reschedule: (id: number, start_time: string, end_time: string) =>
    api<ApiBooking>(`/api/bookings/${id}/reschedule`, { method: "PATCH", body: j({ start_time, end_time }) }),
};

// ---------------- maintenance ----------------
export const maintenanceApi = {
  list: (status?: string) => api<ApiMaintenance[]>(`/api/maintenance${status ? `?status=${status}` : ""}`),
  raise: (asset_id: number, issue_description: string, priority = "medium") =>
    api<ApiMaintenance>("/api/maintenance", { method: "POST", body: j({ asset_id, issue_description, priority }) }),
  approve: (id: number) => api(`/api/maintenance/${id}/approve`, { method: "POST" }),
  reject: (id: number) => api(`/api/maintenance/${id}/reject`, { method: "POST" }),
  assign: (id: number, technician_id: number) =>
    api(`/api/maintenance/${id}/assign-technician`, { method: "POST", body: j({ technician_id }) }),
  start: (id: number) => api(`/api/maintenance/${id}/start`, { method: "POST" }),
  resolve: (id: number, resolution_notes?: string) =>
    api(`/api/maintenance/${id}/resolve`, { method: "POST", body: j({ resolution_notes }) }),
};

// ---------------- audits ----------------
export const auditsApi = {
  cycles: (status?: string) => api<ApiAuditCycle[]>(`/api/audits${status ? `?status=${status}` : ""}`),
  create: (payload: { name: string; start_date: string; end_date: string; scope_department_id?: number | null; scope_location?: string | null; auditor_ids?: number[] }) =>
    api<ApiAuditCycle>("/api/audits", { method: "POST", body: j(payload) }),
  items: (cycleId: number | string) => api<ApiAuditItem[]>(`/api/audits/${cycleId}/items`),
  mark: (itemId: number, status: "verified" | "missing" | "damaged", notes?: string) =>
    api<ApiAuditItem>(`/api/audits/items/${itemId}`, { method: "PATCH", body: j({ status, notes }) }),
  discrepancies: (cycleId: number | string) => api(`/api/audits/${cycleId}/discrepancies`),
  close: (cycleId: number | string) => api<ApiAuditCycle>(`/api/audits/${cycleId}/close`, { method: "POST" }),
};

// ---------------- dashboard / reports / notifications / logs ----------------
export const dashboardApi = { get: () => api<{ kpis: Record<string, number>; overdue_returns: any[] }>("/api/dashboard") };

export const reportsApi = {
  analytics: () => api("/api/reports/analytics"),
  exportUrl: (format: "csv" | "excel" | "pdf") => `${API_URL}/api/reports/export?format=${format}`,
  download: async (format: "csv" | "excel" | "pdf") => {
    const blob = await api<Blob>(`/api/reports/export?format=${format}`);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `assets.${format === "excel" ? "xlsx" : format}`;
    a.click(); URL.revokeObjectURL(url);
  },
};

export const notificationsApi = {
  list: (unreadOnly = false) => api<ApiNotification[]>(`/api/notifications${unreadOnly ? "?unread_only=true" : ""}`),
  markRead: (id: number) => api(`/api/notifications/${id}/read`, { method: "POST" }),
  markAllRead: () => api("/api/notifications/read-all", { method: "POST" }),
};

export const logsApi = {
  list: (limit = 50) => api<{ id: number; actor_id: number | null; action: string; entity_type: string | null; entity_id: number | null; detail: string | null; created_at: string }[]>(`/api/activity-logs?limit=${limit}`),
};

// ---------------- shared lookup helpers ----------------
export async function userMap(): Promise<Map<number, ApiUser>> {
  try {
    const users = await org.employees();          // admin only
    return new Map(users.map((u) => [u.id, u]));
  } catch { return new Map(); }
}
