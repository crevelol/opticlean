import { clearSession, getToken, type AuthUser } from './auth';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init?.headers as Record<string, string> | undefined),
  };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(path, { ...init, headers });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) {
    clearSession();
    if (!window.location.pathname.startsWith('/login')) window.location.assign('/login');
  }
  if (!res.ok) throw new Error((data as { error?: string }).error ?? res.statusText);
  return data as T;
}

export type Company = {
  id: string;
  name: string;
  slug: string;
  active: number;
  created_at: string;
  modules_count?: number;
  vehicles_count?: number;
  mobile_roles_count?: number;
};

export type Module = {
  id: string;
  code: string;
  name: string;
  description: string;
  icon: string;
  active: number;
  sort_order: number;
};

export type MobileRole = {
  id: string;
  code: string;
  name: string;
  description: string;
  auth_role: string;
  icon: string;
  sort_order: number;
  active: number;
};

export type VehicleKind = 'carro' | 'camion' | 'motocicleta';

export type Vehicle = {
  id: string;
  company_id: string;
  plate: string;
  label: string;
  vehicle_type: VehicleKind;
  city: string;
  driver: string;
  max_kg: number;
  max_m3: number;
  cost_per_km: number;
  eta_hours: number;
  route_km: number;
  allowed_sectors?: string;
  allowed_sectors_list?: string[];
  active: number;
  sort_order: number;
};

export type MenuItem = {
  id: string;
  module_id: string;
  label: string;
  path: string;
  icon: string;
  section: string;
  sort_order: number;
  badge: string | null;
  active: number;
  module_code?: string;
  module_name?: string;
};

export const api = {
  login: (email: string, password: string) =>
    request<{ token: string; user: AuthUser }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  me: () => request<{ user: AuthUser }>('/api/auth/me'),
  companies: () => request<{ companies: Company[] }>('/api/admin/companies'),
  createCompany: (body: { name: string; slug?: string }) =>
    request<{ company: Company }>('/api/admin/companies', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  updateCompany: (id: string, body: { name?: string; active?: boolean }) =>
    request<{ company: Company }>(`/api/admin/companies/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  companyModules: (id: string) =>
    request<{ moduleIds: string[]; modules: Module[] }>(
      `/api/admin/companies/${encodeURIComponent(id)}/modules`,
    ),
  setCompanyModules: (id: string, moduleIds: string[]) =>
    request<{ moduleIds: string[] }>(`/api/admin/companies/${encodeURIComponent(id)}/modules`, {
      method: 'PUT',
      body: JSON.stringify({ moduleIds }),
    }),
  companyMobileRoles: (id: string) =>
    request<{ roleIds: string[]; roles: MobileRole[] }>(
      `/api/admin/companies/${encodeURIComponent(id)}/mobile-roles`,
    ),
  setCompanyMobileRoles: (id: string, roleIds: string[]) =>
    request<{ roleIds: string[] }>(
      `/api/admin/companies/${encodeURIComponent(id)}/mobile-roles`,
      {
        method: 'PUT',
        body: JSON.stringify({ roleIds }),
      },
    ),
  companyVehicles: (id: string) =>
    request<{ vehicles: Vehicle[] }>(
      `/api/admin/companies/${encodeURIComponent(id)}/vehicles`,
    ),
  createVehicle: (
    companyId: string,
    body: {
      plate: string;
      label: string;
      vehicleType?: VehicleKind;
      city?: string;
      driver?: string;
      maxKg?: number;
      maxM3?: number;
      costPerKm?: number;
      etaHours?: number;
      routeKm?: number;
      allowedSectors?: string[];
    },
  ) =>
    request<{ vehicle: Vehicle }>(
      `/api/admin/companies/${encodeURIComponent(companyId)}/vehicles`,
      { method: 'POST', body: JSON.stringify(body) },
    ),
  updateVehicle: (
    id: string,
    body: Partial<{
      plate: string;
      label: string;
      vehicleType: VehicleKind;
      city: string;
      driver: string;
      maxKg: number;
      maxM3: number;
      costPerKm: number;
      etaHours: number;
      routeKm: number;
      allowedSectors: string[];
      active: boolean;
    }>,
  ) =>
    request<{ vehicle: Vehicle }>(`/api/admin/vehicles/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  deleteVehicle: (id: string) =>
    request<{ ok: boolean }>(`/api/admin/vehicles/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }),
  modules: () => request<{ modules: Module[] }>('/api/admin/modules'),
  menu: () => request<{ items: MenuItem[] }>('/api/admin/menu'),
  updateMenu: (id: string, body: Partial<MenuItem>) =>
    request<{ item: MenuItem }>(`/api/admin/menu/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  previewMenu: (companyId: string) =>
    request<{
      company: Company | null;
      sections: Array<{ section: string; items: MenuItem[] }>;
    }>(`/api/menu?companyId=${encodeURIComponent(companyId)}`),
};
