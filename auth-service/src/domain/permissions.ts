/**
 * Catálogo de permisos por aplicación.
 * El JWT lleva `permissions` resuelto desde el rol (+ extras),
 * para que cualquier microservicio autorice sin volver a consultar auth.
 */

export type PermissionCatalog = Record<string, string[]>;

/** OptiClean — alineado con backend y frontend. */
export const OPTICLEAN_ROLE_PERMISSIONS: PermissionCatalog = {
  admin: [
    'inventory',
    'reception',
    'warehouse',
    'picking',
    'packing',
    'orders',
    'quotes',
    'logistics',
    'dispatch',
    'field',
    'purchases',
    'suppliers',
    'plan',
    'clients',
    'commercial',
    'traceability',
    'reports',
    'users',
    'settings',
    'business-rules',
    'platform',
  ],
  ops: [
    'inventory',
    'reception',
    'warehouse',
    'picking',
    'packing',
    'orders',
    'quotes',
    'purchases',
    'suppliers',
    'plan',
    'traceability',
  ],
  dispatch: [
    'orders',
    'picking',
    'packing',
    'logistics',
    'dispatch',
    'field',
    'clients',
    'traceability',
  ],
  driver: ['field', 'logistics'],
};

const APP_CATALOGS: Record<string, PermissionCatalog> = {
  opticlean: OPTICLEAN_ROLE_PERMISSIONS,
};

export function registerAppCatalog(appId: string, catalog: PermissionCatalog) {
  APP_CATALOGS[appId] = catalog;
}

export function resolvePermissions(
  appId: string,
  role: string,
  extra: string[] = [],
  platformAdmin = false,
): string[] {
  const catalog = APP_CATALOGS[appId] || APP_CATALOGS.opticlean;
  let fromRole = catalog[role] ? [...catalog[role]] : [];
  if (role === 'admin' && !platformAdmin) {
    fromRole = fromRole.filter((p) => p !== 'platform');
  }
  if (platformAdmin && !fromRole.includes('platform')) fromRole.push('platform');
  return [...new Set([...fromRole, ...extra.map(String)])].sort();
}

export function hasPermission(permissions: string[] | undefined, needed: string) {
  if (!permissions?.length) return false;
  if (permissions.includes('*')) return true;
  return permissions.includes(needed);
}
