/**
 * Catálogo de permisos OptiClean a nivel de aplicación.
 * Debe coincidir con auth-service y frontend/src/shared/auth/permissions.ts
 *
 * Roles:
 * - admin: todo (+ platform si es admin de plataforma)
 * - ops (bodega): inventario, recepción, preparación, abastecimiento
 * - dispatch (despacho): pedidos, logística, clientes, empaque
 * - driver (conductor): ruta en campo + historial de su operación
 */

export const APP_PERMISSIONS = [
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
] as const;

export type AppPermission = (typeof APP_PERMISSIONS)[number];

/** Catálogo por rol (fuente de verdad del JWT). */
export const ROLE_PERMISSIONS: Record<string, AppPermission[]> = {
  admin: [...APP_PERMISSIONS],
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

export function permissionsForRole(role: string, platformAdmin = false, extra: string[] = []): string[] {
  let base: string[] = ROLE_PERMISSIONS[role] ? [...ROLE_PERMISSIONS[role]] : [];
  // Admin de empresa no lleva `platform`; admin de plataforma sí.
  if (role === 'admin' && !platformAdmin) {
    base = base.filter((p) => p !== 'platform');
  }
  if (platformAdmin && !base.includes('platform')) base.push('platform');
  return [...new Set([...base, ...extra.map(String)])].sort();
}

/** `*` = superusuario explícito. El rol admin se valida aparte en el API. */
export function hasPermission(permissions: string[] | undefined, needed: string) {
  if (!permissions?.length) return false;
  if (permissions.includes('*')) return true;
  return permissions.includes(needed);
}

/** Rutas de menú → permiso requerido (para alinear UI y JWT). */
export const PATH_PERMISSIONS: Record<string, AppPermission | null> = {
  '/': null,
  '/inventario': 'inventory',
  '/recepcion': 'reception',
  '/bodega': 'warehouse',
  '/bodegas': 'warehouse',
  '/familias': 'warehouse',
  '/pedidos': 'orders',
  '/cotizaciones': 'quotes',
  '/empaque': 'packing',
  '/compras': 'purchases',
  '/plan': 'plan',
  '/proveedores': 'suppliers',
  '/logistica': 'logistics',
  '/logistica/rutas': 'field',
  '/logistica/historial': 'logistics',
  '/clientes': 'clients',
  '/comercial': 'commercial',
  '/trazabilidad': 'traceability',
  '/reportes': 'reports',
  '/reglas': 'business-rules',
  '/usuarios': 'users',
  '/configuracion': 'settings',
};
