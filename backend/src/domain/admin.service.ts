import { randomBytes } from 'node:crypto';
import {
  getAdminDb,
  type Company,
  type MenuItem,
  type MobileRole,
  type ModuleRow,
  type Vehicle,
  type VehicleCostRuleRow,
  type VehicleKmLog,
  type VehicleKind,
} from '../infrastructure/db/adminDb.js';
import {
  defaultRulesForKind,
  ruleUnitCost,
  summarizeVehicleCost,
  type CostBasis,
  type CostCalc,
  type TransportCostRuleInput,
} from './transport-cost.js';
import { estimateRouteKm, resolveShippingParams } from './business-rules.js';
import type { Settings } from './types.js';

const VEHICLE_KINDS = new Set<VehicleKind>(['carro', 'camion', 'motocicleta']);

function normalizeVehicleKind(raw?: string | null): VehicleKind {
  const v = String(raw || 'camion').trim().toLowerCase() as VehicleKind;
  return VEHICLE_KINDS.has(v) ? v : 'camion';
}

const KIND_DEFAULTS: Record<
  VehicleKind,
  { maxKg: number; maxM3: number; costPerKm: number; etaHours: number; routeKm: number }
> = {
  motocicleta: { maxKg: 80, maxM3: 0.3, costPerKm: 0.35, etaHours: 1.5, routeKm: 25 },
  carro: { maxKg: 800, maxM3: 2.5, costPerKm: 0.55, etaHours: 2.5, routeKm: 40 },
  camion: { maxKg: 3500, maxM3: 14, costPerKm: 0.8, etaHours: 3.5, routeKm: 50 },
};

export function vehicleTypeLabel(kind: VehicleKind) {
  if (kind === 'motocicleta') return 'Motocicleta';
  if (kind === 'carro') return 'Carro';
  return 'Camión';
}

function slugify(name: string) {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);
}

export function listCompanies() {
  const db = getAdminDb();
  return db
    .prepare(
      `SELECT c.*,
        (SELECT COUNT(*) FROM company_modules cm WHERE cm.company_id = c.id AND cm.enabled = 1) AS modules_count,
        (SELECT COUNT(*) FROM vehicles v WHERE v.company_id = c.id AND v.active = 1) AS vehicles_count,
        (SELECT COUNT(*) FROM company_mobile_roles mr WHERE mr.company_id = c.id AND mr.enabled = 1) AS mobile_roles_count
       FROM companies c
       ORDER BY c.name`,
    )
    .all() as Array<
    Company & { modules_count: number; vehicles_count: number; mobile_roles_count: number }
  >;
}

export function getCompany(id: string) {
  const db = getAdminDb();
  return db.prepare('SELECT * FROM companies WHERE id = ?').get(id) as Company | undefined;
}

/**
 * `uniqueSlug`: si el slug ya existe (o queda vacío) se agrega un sufijo aleatorio en vez de fallar.
 * Lo usa el registro público para no revelar qué empresas existen.
 */
export function createCompany(input: { name: string; slug?: string; uniqueSlug?: boolean }) {
  const name = input.name.trim();
  if (!name) throw new Error('Nombre de empresa requerido');
  const db = getAdminDb();
  const taken = (id: string, slug: string) =>
    Boolean(db.prepare('SELECT id FROM companies WHERE id = ? OR slug = ?').get(id, slug));
  let slug = (input.slug?.trim() || slugify(name)).toLowerCase().slice(0, 30);
  if (input.uniqueSlug) {
    const base = slug || 'empresa';
    slug = base;
    while (taken(`co-${slug}`, slug)) slug = `${base}-${randomBytes(3).toString('hex')}`;
  }
  if (!slug) throw new Error('Slug inválido');
  const id = `co-${slug}`.slice(0, 40);
  if (taken(id, slug)) throw new Error('Ya existe una empresa con ese nombre o slug');
  db.prepare(
    `INSERT INTO companies (id, name, slug, active, created_at) VALUES (?, ?, ?, 1, ?)`,
  ).run(id, name, slug, new Date().toISOString());
  // Módulos base mínimos
  for (const mid of ['mod-home', 'mod-inventory', 'mod-orders', 'mod-settings']) {
    db.prepare(
      `INSERT OR IGNORE INTO company_modules (company_id, module_id, enabled) VALUES (?, ?, 1)`,
    ).run(id, mid);
  }
  db.prepare(
    `INSERT OR IGNORE INTO company_mobile_roles (company_id, mobile_role_id, enabled)
     VALUES (?, 'mrole-ops', 1)`,
  ).run(id);
  return getCompany(id)!;
}

export function updateCompany(id: string, input: { name?: string; active?: boolean }) {
  const current = getCompany(id);
  if (!current) throw new Error('Empresa no encontrada');
  const db = getAdminDb();
  db.prepare(`UPDATE companies SET name = ?, active = ? WHERE id = ?`).run(
    input.name?.trim() || current.name,
    input.active === undefined ? current.active : input.active ? 1 : 0,
    id,
  );
  return getCompany(id)!;
}

/** Borra una empresa sin uso (p. ej. un registro que falló a medias). */
export function deleteCompany(id: string) {
  const db = getAdminDb();
  db.prepare('DELETE FROM company_modules WHERE company_id = ?').run(id);
  db.prepare('DELETE FROM company_mobile_roles WHERE company_id = ?').run(id);
  db.prepare('DELETE FROM vehicles WHERE company_id = ?').run(id);
  db.prepare('DELETE FROM companies WHERE id = ?').run(id);
}

export function listModules() {
  const db = getAdminDb();
  return db
    .prepare('SELECT * FROM modules WHERE active = 1 ORDER BY sort_order, name')
    .all() as ModuleRow[];
}

export function listAllModules() {
  const db = getAdminDb();
  return db.prepare('SELECT * FROM modules ORDER BY sort_order, name').all() as ModuleRow[];
}

export function companyModuleIds(companyId: string) {
  const db = getAdminDb();
  const rows = db
    .prepare(
      `SELECT module_id FROM company_modules WHERE company_id = ? AND enabled = 1`,
    )
    .all(companyId) as Array<{ module_id: string }>;
  return rows.map((r) => r.module_id);
}

export function setCompanyModules(companyId: string, moduleIds: string[]) {
  const company = getCompany(companyId);
  if (!company) throw new Error('Empresa no encontrada');
  const db = getAdminDb();
  const valid = new Set(listAllModules().map((m) => m.id));
  const unique = [...new Set(moduleIds)].filter((id) => valid.has(id));
  if (!unique.includes('mod-home')) unique.unshift('mod-home');

  db.exec('BEGIN');
  try {
    db.prepare('DELETE FROM company_modules WHERE company_id = ?').run(companyId);
    const ins = db.prepare(
      `INSERT INTO company_modules (company_id, module_id, enabled) VALUES (?, ?, 1)`,
    );
    for (const mid of unique) ins.run(companyId, mid);
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  return companyModuleIds(companyId);
}

export function listMenuItems() {
  const db = getAdminDb();
  return db
    .prepare(
      `SELECT mi.*, m.code AS module_code, m.name AS module_name
       FROM menu_items mi
       JOIN modules m ON m.id = mi.module_id
       ORDER BY mi.section, mi.sort_order, mi.label`,
    )
    .all() as Array<MenuItem & { module_code: string; module_name: string }>;
}

export function menuForCompany(companyId: string) {
  const db = getAdminDb();
  const company = getCompany(companyId);
  if (!company || !company.active) {
    return { company: null, sections: [] as Array<{ section: string; items: MenuItem[] }> };
  }
  const items = db
    .prepare(
      `SELECT mi.*
       FROM menu_items mi
       JOIN company_modules cm ON cm.module_id = mi.module_id AND cm.company_id = ? AND cm.enabled = 1
       JOIN modules m ON m.id = mi.module_id AND m.active = 1
       WHERE mi.active = 1
       ORDER BY CASE mi.section
                  WHEN 'Operación' THEN 0
                  WHEN 'Abastecimiento' THEN 1
                  WHEN 'Bodega' THEN 2
                  WHEN 'Gestión' THEN 3
                  ELSE 4
                END,
                mi.sort_order, mi.label`,
    )
    .all(companyId) as MenuItem[];

  const sectionsMap = new Map<string, MenuItem[]>();
  for (const item of items) {
    const list = sectionsMap.get(item.section) ?? [];
    list.push(item);
    sectionsMap.set(item.section, list);
  }
  const sections = [...sectionsMap.entries()].map(([section, sectionItems]) => ({
    section,
    items: sectionItems,
  }));
  return { company, sections };
}

export function updateMenuItem(
  id: string,
  input: { label?: string; path?: string; icon?: string; section?: string; sort_order?: number; badge?: string | null; active?: boolean },
) {
  const db = getAdminDb();
  const current = db.prepare('SELECT * FROM menu_items WHERE id = ?').get(id) as MenuItem | undefined;
  if (!current) throw new Error('Ítem de menú no encontrado');
  db.prepare(
    `UPDATE menu_items
     SET label = ?, path = ?, icon = ?, section = ?, sort_order = ?, badge = ?, active = ?
     WHERE id = ?`,
  ).run(
    input.label?.trim() || current.label,
    input.path?.trim() || current.path,
    input.icon?.trim() || current.icon,
    input.section?.trim() || current.section,
    input.sort_order ?? current.sort_order,
    input.badge === undefined ? current.badge : input.badge,
    input.active === undefined ? current.active : input.active ? 1 : 0,
    id,
  );
  return db.prepare('SELECT * FROM menu_items WHERE id = ?').get(id) as MenuItem;
}

export function listMobileRoles() {
  const db = getAdminDb();
  return db
    .prepare('SELECT * FROM mobile_roles WHERE active = 1 ORDER BY sort_order, name')
    .all() as MobileRole[];
}

export function companyMobileRoleIds(companyId: string) {
  const db = getAdminDb();
  return (
    db
      .prepare(
        `SELECT mobile_role_id FROM company_mobile_roles
         WHERE company_id = ? AND enabled = 1`,
      )
      .all(companyId) as Array<{ mobile_role_id: string }>
  ).map((r) => r.mobile_role_id);
}

export function setCompanyMobileRoles(companyId: string, roleIds: string[]) {
  const company = getCompany(companyId);
  if (!company) throw new Error('Empresa no encontrada');
  const db = getAdminDb();
  const valid = new Set(listMobileRoles().map((r) => r.id));
  const unique = [...new Set(roleIds)].filter((id) => valid.has(id));
  db.exec('BEGIN');
  try {
    db.prepare('DELETE FROM company_mobile_roles WHERE company_id = ?').run(companyId);
    const ins = db.prepare(
      `INSERT INTO company_mobile_roles (company_id, mobile_role_id, enabled) VALUES (?, ?, 1)`,
    );
    for (const id of unique) ins.run(companyId, id);
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  return companyMobileRoleIds(companyId);
}

export function mobileConfigForCompany(companyId: string) {
  const company = getCompany(companyId);
  const db = getAdminDb();
  const roles = db
    .prepare(
      `SELECT r.*
       FROM mobile_roles r
       JOIN company_mobile_roles cm ON cm.mobile_role_id = r.id AND cm.company_id = ? AND cm.enabled = 1
       WHERE r.active = 1
       ORDER BY r.sort_order`,
    )
    .all(companyId) as MobileRole[];
  return {
    company,
    roles,
    authRoles: roles.map((r) => r.auth_role),
  };
}

export function listVehicles(companyId: string) {
  const db = getAdminDb();
  return db
    .prepare(
      `SELECT * FROM vehicles
       WHERE company_id = ?
       ORDER BY sort_order, label`,
    )
    .all(companyId) as Vehicle[];
}

export function getVehicle(id: string) {
  const db = getAdminDb();
  return db.prepare('SELECT * FROM vehicles WHERE id = ?').get(id) as Vehicle | undefined;
}

export function parseAllowedSectors(raw: string | null | undefined): string[] {
  if (!raw?.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return [
      ...new Set(
        parsed
          .map((x) => String(x ?? '').trim())
          .filter(Boolean),
      ),
    ];
  } catch {
    return raw
      .split(/[,;|]/)
      .map((x) => x.trim())
      .filter(Boolean);
  }
}

export function serializeAllowedSectors(sectors: string[] | undefined | null): string {
  if (!sectors?.length) return '[]';
  const unique = [
    ...new Set(sectors.map((s) => String(s).trim()).filter(Boolean)),
  ];
  return JSON.stringify(unique);
}

export { vehicleAllowsSector, vehicleAllowsZone } from './zones.js';

export function fleetForCompany(companyId: string) {
  return listVehicles(companyId)
    .filter((v) => v.active)
    .map((v) => {
      const kind = normalizeVehicleKind(v.vehicle_type);
      const cost = vehicleCostSummary(v.id, v.cost_per_km);
      return {
        id: v.id,
        plate: v.plate,
        label: v.label,
        vehicleType: kind,
        vehicleTypeLabel: vehicleTypeLabel(kind),
        city: v.city,
        driver: v.driver,
        maxKg: v.max_kg,
        maxM3: v.max_m3,
        costPerKm: cost.costPerKm,
        costPerTrip: cost.costPerTrip,
        costFromRules: cost.fromRules,
        etaHours: v.eta_hours,
        routeKm: v.route_km,
        odometerKm: Number(v.odometer_km) || 0,
        allowedSectors: parseAllowedSectors(v.allowed_sectors),
        shippingTemplateId: String(v.shipping_template_id || '').trim() || undefined,
        baseOccupancy: 0,
      };
    });
}

export function createVehicle(
  companyId: string,
  input: {
    plate: string;
    label: string;
    vehicleType?: string;
    city?: string;
    driver?: string;
    maxKg?: number;
    maxM3?: number;
    costPerKm?: number;
    etaHours?: number;
    routeKm?: number;
    allowedSectors?: string[];
    shippingTemplateId?: string | null;
  },
) {
  const company = getCompany(companyId);
  if (!company) throw new Error('Empresa no encontrada');
  const plate = input.plate.trim().toUpperCase();
  const label = input.label.trim();
  if (!plate || !label) throw new Error('Placa y nombre son requeridos');
  const kind = normalizeVehicleKind(input.vehicleType);
  const defaults = KIND_DEFAULTS[kind];
  const db = getAdminDb();
  const exists = db
    .prepare('SELECT id FROM vehicles WHERE company_id = ? AND plate = ?')
    .get(companyId, plate);
  if (exists) throw new Error('Ya existe un vehículo con esa placa en la empresa');
  const id = `veh-${plate.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now().toString(36)}`;
  const count = (
    db.prepare('SELECT COUNT(*) AS c FROM vehicles WHERE company_id = ?').get(companyId) as {
      c: number;
    }
  ).c;
  db.prepare(
    `INSERT INTO vehicles
     (id, company_id, plate, label, vehicle_type, city, driver, max_kg, max_m3, cost_per_km, eta_hours, route_km, odometer_km, allowed_sectors, shipping_template_id, active, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, 1, ?)`,
  ).run(
    id,
    companyId,
    plate,
    label,
    kind,
    input.city?.trim() || '',
    input.driver?.trim() || '',
    Number(input.maxKg ?? defaults.maxKg),
    Number(input.maxM3 ?? defaults.maxM3),
    Number(input.costPerKm ?? defaults.costPerKm),
    Number(input.etaHours ?? defaults.etaHours),
    Number(input.routeKm ?? defaults.routeKm),
    serializeAllowedSectors(input.allowedSectors),
    String(input.shippingTemplateId ?? '').trim(),
    (count + 1) * 10,
  );
  return db.prepare('SELECT * FROM vehicles WHERE id = ?').get(id) as Vehicle;
}

export function updateVehicle(
  id: string,
  input: Partial<{
    plate: string;
    label: string;
    vehicleType: string;
    city: string;
    driver: string;
    maxKg: number;
    maxM3: number;
    costPerKm: number;
    etaHours: number;
    routeKm: number;
    allowedSectors: string[];
    shippingTemplateId: string | null;
    active: boolean;
  }>,
) {
  const db = getAdminDb();
  const current = db.prepare('SELECT * FROM vehicles WHERE id = ?').get(id) as Vehicle | undefined;
  if (!current) throw new Error('Vehículo no encontrado');
  const kind =
    input.vehicleType !== undefined
      ? normalizeVehicleKind(input.vehicleType)
      : normalizeVehicleKind(current.vehicle_type);
  const sectorsJson =
    input.allowedSectors !== undefined
      ? serializeAllowedSectors(input.allowedSectors)
      : current.allowed_sectors ?? '[]';
  const shippingTemplateId =
    input.shippingTemplateId !== undefined
      ? String(input.shippingTemplateId ?? '').trim()
      : String(current.shipping_template_id ?? '').trim();
  db.prepare(
    `UPDATE vehicles
     SET plate = ?, label = ?, vehicle_type = ?, city = ?, driver = ?, max_kg = ?, max_m3 = ?,
         cost_per_km = ?, eta_hours = ?, route_km = ?, allowed_sectors = ?, shipping_template_id = ?, active = ?
     WHERE id = ?`,
  ).run(
    input.plate?.trim().toUpperCase() || current.plate,
    input.label?.trim() || current.label,
    kind,
    input.city?.trim() ?? current.city,
    input.driver?.trim() ?? current.driver,
    input.maxKg ?? current.max_kg,
    input.maxM3 ?? current.max_m3,
    input.costPerKm ?? current.cost_per_km,
    input.etaHours ?? current.eta_hours,
    input.routeKm ?? current.route_km,
    sectorsJson,
    shippingTemplateId,
    input.active === undefined ? current.active : input.active ? 1 : 0,
    id,
  );
  return db.prepare('SELECT * FROM vehicles WHERE id = ?').get(id) as Vehicle;
}

/** Asigna una plantilla de costo de envío a varios vehículos. */
export function applyShippingTemplateToFleet(
  companyId: string,
  templateId: string,
  vehicleIds?: string[] | null,
) {
  const db = getAdminDb();
  const tpl = String(templateId ?? '').trim();
  if (!tpl) throw new Error('Plantilla requerida');
  const all = listVehicles(companyId);
  const targets =
    Array.isArray(vehicleIds) && vehicleIds.length
      ? all.filter((v) => vehicleIds.includes(v.id))
      : all;
  const stmt = db.prepare('UPDATE vehicles SET shipping_template_id = ? WHERE id = ? AND company_id = ?');
  for (const v of targets) {
    stmt.run(tpl, v.id, companyId);
  }
  return { updated: targets.length, trucks: fleetForCompany(companyId) };
}

export function deleteVehicle(id: string) {
  const db = getAdminDb();
  const current = db.prepare('SELECT * FROM vehicles WHERE id = ?').get(id) as Vehicle | undefined;
  if (!current) throw new Error('Vehículo no encontrado');
  db.prepare('DELETE FROM vehicle_cost_rules WHERE vehicle_id = ?').run(id);
  db.prepare('DELETE FROM vehicle_km_logs WHERE vehicle_id = ?').run(id);
  db.prepare('DELETE FROM vehicles WHERE id = ?').run(id);
  return { ok: true };
}

function kmLogDto(row: VehicleKmLog) {
  return {
    id: row.id,
    companyId: row.company_id,
    vehicleId: row.vehicle_id,
    plate: row.plate,
    km: row.km,
    stops: row.stops,
    source: row.source,
    note: row.note,
    orderIds: (() => {
      try {
        const parsed = JSON.parse(row.order_ids || '[]') as unknown;
        return Array.isArray(parsed) ? parsed.map(String) : [];
      } catch {
        return [] as string[];
      }
    })(),
    odometerAfter: row.odometer_after,
    createdAt: row.created_at,
  };
}

/** Suma km al odómetro y deja historial. */
export function recordVehicleKm(
  companyId: string,
  input: {
    vehicleId?: string;
    plate?: string;
    km: number;
    stops?: number;
    source?: 'dispatch' | 'manual' | 'adjust';
    note?: string;
    orderIds?: string[];
  },
) {
  const km = Math.round(Number(input.km) * 10) / 10;
  if (!Number.isFinite(km) || km <= 0) throw new Error('Indica kilómetros mayores a cero.');
  const db = getAdminDb();
  let vehicle: Vehicle | undefined;
  if (input.vehicleId) {
    vehicle = db.prepare('SELECT * FROM vehicles WHERE id = ?').get(input.vehicleId) as Vehicle | undefined;
  } else if (input.plate) {
    vehicle = db
      .prepare('SELECT * FROM vehicles WHERE company_id = ? AND upper(plate) = upper(?)')
      .get(companyId, input.plate.trim()) as Vehicle | undefined;
  }
  if (!vehicle || vehicle.company_id !== companyId) throw new Error('Vehículo no encontrado.');
  const after = Math.round(((Number(vehicle.odometer_km) || 0) + km) * 10) / 10;
  const id = `vkm-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const createdAt = new Date().toISOString();
  db.prepare('UPDATE vehicles SET odometer_km = ? WHERE id = ?').run(after, vehicle.id);
  db.prepare(
    `INSERT INTO vehicle_km_logs
     (id, company_id, vehicle_id, plate, km, stops, source, note, order_ids, odometer_after, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    companyId,
    vehicle.id,
    vehicle.plate,
    km,
    Math.max(0, Math.round(Number(input.stops) || 0)),
    input.source || 'manual',
    String(input.note || '').trim(),
    JSON.stringify(input.orderIds ?? []),
    after,
    createdAt,
  );
  return {
    vehicle: db.prepare('SELECT * FROM vehicles WHERE id = ?').get(vehicle.id) as Vehicle,
    log: kmLogDto(
      db.prepare('SELECT * FROM vehicle_km_logs WHERE id = ?').get(id) as VehicleKmLog,
    ),
    trucks: fleetForCompany(companyId),
  };
}

/** Corrige el odómetro (ajuste absoluto) y deja traza. */
export function setVehicleOdometer(companyId: string, vehicleId: string, odometerKm: number, note = '') {
  const value = Math.round(Number(odometerKm) * 10) / 10;
  if (!Number.isFinite(value) || value < 0) throw new Error('Odómetro inválido.');
  const vehicle = assertVehicleCompany(vehicleId, companyId);
  const prev = Number(vehicle.odometer_km) || 0;
  const delta = Math.round((value - prev) * 10) / 10;
  const db = getAdminDb();
  db.prepare('UPDATE vehicles SET odometer_km = ? WHERE id = ?').run(value, vehicleId);
  const id = `vkm-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  db.prepare(
    `INSERT INTO vehicle_km_logs
     (id, company_id, vehicle_id, plate, km, stops, source, note, order_ids, odometer_after, created_at)
     VALUES (?, ?, ?, ?, ?, 0, 'adjust', ?, '[]', ?, ?)`,
  ).run(
    id,
    companyId,
    vehicleId,
    vehicle.plate,
    delta,
    note.trim() || `Ajuste de odómetro (${prev} → ${value} km)`,
    value,
    new Date().toISOString(),
  );
  return {
    vehicle: db.prepare('SELECT * FROM vehicles WHERE id = ?').get(vehicleId) as Vehicle,
    trucks: fleetForCompany(companyId),
  };
}

export function listVehicleKmLogs(companyId: string, vehicleId: string, limit = 50) {
  assertVehicleCompany(vehicleId, companyId);
  const rows = getAdminDb()
    .prepare(
      `SELECT * FROM vehicle_km_logs
       WHERE company_id = ? AND vehicle_id = ?
       ORDER BY created_at DESC
       LIMIT ?`,
    )
    .all(companyId, vehicleId, Math.min(200, Math.max(1, limit))) as VehicleKmLog[];
  return rows.map(kmLogDto);
}

/** Al despachar: estima km de la ruta y los suma al odómetro del camión. */
export function recordDispatchKm(
  companyId: string,
  plate: string,
  stops: number,
  orderIds: string[],
  settings?: Settings | null,
) {
  const truck = listVehicles(companyId).find((v) => v.plate.toUpperCase() === plate.toUpperCase());
  if (!truck) return null;
  const shipping = resolveShippingParams(settings, truck.shipping_template_id);
  const km = estimateRouteKm(truck.route_km || 50, Math.max(1, stops), shipping);
  return recordVehicleKm(companyId, {
    vehicleId: truck.id,
    km,
    stops,
    source: 'dispatch',
    note: `Despacho ${plate} · ${stops} parada(s)`,
    orderIds,
  });
}

function normalizeBasis(raw: unknown): CostBasis {
  return String(raw) === 'per_trip' ? 'per_trip' : 'per_km';
}

function normalizeCalc(raw: unknown): CostCalc {
  return String(raw) === 'amortized' ? 'amortized' : 'fixed';
}

function costRuleDto(row: VehicleCostRuleRow) {
  const unitCost = ruleUnitCost({
    basis: row.basis,
    calc: row.calc,
    amount: row.amount,
    lifeUnits: row.life_units,
  });
  return {
    id: row.id,
    companyId: row.company_id,
    vehicleId: row.vehicle_id,
    name: row.name,
    category: row.category,
    basis: row.basis,
    calc: row.calc,
    amount: row.amount,
    lifeUnits: row.life_units,
    active: row.active === 1,
    sortOrder: row.sort_order,
    unitCost,
  };
}

export function listVehicleCostRules(vehicleId: string) {
  const db = getAdminDb();
  const rows = db
    .prepare(
      `SELECT * FROM vehicle_cost_rules
       WHERE vehicle_id = ?
       ORDER BY sort_order ASC, name ASC`,
    )
    .all(vehicleId) as VehicleCostRuleRow[];
  return rows.map(costRuleDto);
}

export function vehicleCostSummary(vehicleId: string, fallbackCostPerKm: number) {
  return summarizeVehicleCost(
    listVehicleCostRules(vehicleId).map((rule) => ({
      id: rule.id,
      name: rule.name,
      category: rule.category,
      basis: rule.basis,
      calc: rule.calc,
      amount: rule.amount,
      lifeUnits: rule.lifeUnits,
      active: rule.active,
    })),
    fallbackCostPerKm,
  );
}

export function createVehicleCostRule(
  companyId: string,
  vehicleId: string,
  input: TransportCostRuleInput,
) {
  assertVehicleCompany(vehicleId, companyId);
  const name = String(input.name || '').trim();
  if (!name) throw new Error('Indica el nombre de la regla.');
  const basis = normalizeBasis(input.basis);
  const calc = normalizeCalc(input.calc);
  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount < 0) throw new Error('Monto inválido.');
  const lifeUnits = calc === 'amortized' ? Math.max(1, Number(input.lifeUnits) || 1) : 0;
  const db = getAdminDb();
  const id = `vcr-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const count = (
    db.prepare('SELECT COUNT(*) AS c FROM vehicle_cost_rules WHERE vehicle_id = ?').get(vehicleId) as {
      c: number;
    }
  ).c;
  db.prepare(
    `INSERT INTO vehicle_cost_rules
     (id, company_id, vehicle_id, name, category, basis, calc, amount, life_units, active, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    companyId,
    vehicleId,
    name,
    String(input.category || 'otro').trim() || 'otro',
    basis,
    calc,
    amount,
    lifeUnits,
    input.active === false ? 0 : 1,
    Number(input.sortOrder ?? (count + 1) * 10),
  );
  syncVehicleCostPerKm(vehicleId);
  return costRuleDto(
    db.prepare('SELECT * FROM vehicle_cost_rules WHERE id = ?').get(id) as VehicleCostRuleRow,
  );
}

export function updateVehicleCostRule(
  companyId: string,
  ruleId: string,
  input: Partial<TransportCostRuleInput>,
) {
  const db = getAdminDb();
  const current = db
    .prepare('SELECT * FROM vehicle_cost_rules WHERE id = ?')
    .get(ruleId) as VehicleCostRuleRow | undefined;
  if (!current || current.company_id !== companyId) throw new Error('Regla no encontrada.');
  const basis = input.basis !== undefined ? normalizeBasis(input.basis) : current.basis;
  const calc = input.calc !== undefined ? normalizeCalc(input.calc) : current.calc;
  const amount = input.amount !== undefined ? Number(input.amount) : current.amount;
  if (!Number.isFinite(amount) || amount < 0) throw new Error('Monto inválido.');
  const lifeUnits =
    calc === 'amortized'
      ? Math.max(1, Number(input.lifeUnits ?? current.life_units) || 1)
      : 0;
  db.prepare(
    `UPDATE vehicle_cost_rules
     SET name = ?, category = ?, basis = ?, calc = ?, amount = ?, life_units = ?, active = ?, sort_order = ?
     WHERE id = ?`,
  ).run(
    input.name !== undefined ? String(input.name).trim() || current.name : current.name,
    input.category !== undefined
      ? String(input.category).trim() || 'otro'
      : current.category,
    basis,
    calc,
    amount,
    lifeUnits,
    input.active === undefined ? current.active : input.active ? 1 : 0,
    input.sortOrder !== undefined ? Number(input.sortOrder) : current.sort_order,
    ruleId,
  );
  if (current.vehicle_id) syncVehicleCostPerKm(current.vehicle_id);
  return costRuleDto(
    db.prepare('SELECT * FROM vehicle_cost_rules WHERE id = ?').get(ruleId) as VehicleCostRuleRow,
  );
}

export function deleteVehicleCostRule(companyId: string, ruleId: string) {
  const db = getAdminDb();
  const current = db
    .prepare('SELECT * FROM vehicle_cost_rules WHERE id = ?')
    .get(ruleId) as VehicleCostRuleRow | undefined;
  if (!current || current.company_id !== companyId) throw new Error('Regla no encontrada.');
  db.prepare('DELETE FROM vehicle_cost_rules WHERE id = ?').run(ruleId);
  if (current.vehicle_id) syncVehicleCostPerKm(current.vehicle_id);
  return { ok: true };
}

/** Copia las reglas del vehículo origen a uno o más destinos (reemplaza las actuales). */
export function duplicateVehicleCostRules(
  companyId: string,
  sourceVehicleId: string,
  targetVehicleIds: string[],
) {
  assertVehicleCompany(sourceVehicleId, companyId);
  const targets = [...new Set(targetVehicleIds.map(String).filter(Boolean))].filter(
    (id) => id !== sourceVehicleId,
  );
  if (!targets.length) throw new Error('Elige al menos un vehículo destino.');
  for (const id of targets) assertVehicleCompany(id, companyId);
  const source = listVehicleCostRules(sourceVehicleId);
  if (!source.length) throw new Error('El vehículo origen no tiene reglas para copiar.');
  const db = getAdminDb();
  const insert = db.prepare(
    `INSERT INTO vehicle_cost_rules
     (id, company_id, vehicle_id, name, category, basis, calc, amount, life_units, active, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const wipe = db.prepare('DELETE FROM vehicle_cost_rules WHERE vehicle_id = ?');
  for (const targetId of targets) {
    wipe.run(targetId);
    source.forEach((rule, index) => {
      insert.run(
        `vcr-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}-${index}`,
        companyId,
        targetId,
        rule.name,
        rule.category,
        rule.basis,
        rule.calc,
        rule.amount,
        rule.lifeUnits,
        rule.active ? 1 : 0,
        rule.sortOrder || (index + 1) * 10,
      );
    });
    syncVehicleCostPerKm(targetId);
  }
  return {
    copied: source.length,
    targets: targets.length,
    trucks: fleetForCompany(companyId),
  };
}

/** Si el vehículo no tiene reglas, carga una plantilla típica según su tipo. */
export function applyDefaultCostRules(companyId: string, vehicleId: string, replace = false) {
  const vehicle = assertVehicleCompany(vehicleId, companyId);
  const existing = listVehicleCostRules(vehicleId);
  if (existing.length && !replace) {
    throw new Error('El vehículo ya tiene reglas. Usa reemplazar o edítalas una a una.');
  }
  const db = getAdminDb();
  if (replace) db.prepare('DELETE FROM vehicle_cost_rules WHERE vehicle_id = ?').run(vehicleId);
  const presets = defaultRulesForKind(vehicle.vehicle_type);
  for (const preset of presets) {
    createVehicleCostRule(companyId, vehicleId, preset);
  }
  return {
    rules: listVehicleCostRules(vehicleId),
    summary: vehicleCostSummary(vehicleId, vehicle.cost_per_km),
  };
}

function assertVehicleCompany(vehicleId: string, companyId: string) {
  const vehicle = getVehicle(vehicleId);
  if (!vehicle) throw new Error('Vehículo no encontrado');
  if (vehicle.company_id !== companyId) throw new Error('Vehículo de otra empresa');
  return vehicle;
}

/** Persiste el $/km derivado en el vehículo para reportes y asignación. */
function syncVehicleCostPerKm(vehicleId: string) {
  const vehicle = getVehicle(vehicleId);
  if (!vehicle) return;
  const summary = vehicleCostSummary(vehicleId, vehicle.cost_per_km);
  if (!summary.fromRules) return;
  getAdminDb()
    .prepare('UPDATE vehicles SET cost_per_km = ? WHERE id = ?')
    .run(summary.costPerKm, vehicleId);
}

export function getVehicleCostPanel(companyId: string, vehicleId: string) {
  const vehicle = assertVehicleCompany(vehicleId, companyId);
  const rules = listVehicleCostRules(vehicleId);
  const summary = vehicleCostSummary(vehicleId, vehicle.cost_per_km);
  return {
    vehicle: {
      id: vehicle.id,
      plate: vehicle.plate,
      label: vehicle.label,
      vehicleType: normalizeVehicleKind(vehicle.vehicle_type),
      costPerKmFallback: vehicle.cost_per_km,
    },
    rules,
    summary,
    siblings: listVehicles(companyId)
      .filter((v) => v.id !== vehicleId && v.active)
      .map((v) => ({ id: v.id, plate: v.plate, label: v.label })),
  };
}
