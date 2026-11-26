import type { AuthUser } from './session';

type Role = AuthUser['role'];

/**
 * Permisos de aplicación OptiClean.
 * Deben coincidir con auth-service y backend/permissions.ts
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

export type Permission = (typeof APP_PERMISSIONS)[number];

/** Fallback por rol si el JWT aún no trae `permissions`. */
const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
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

/** Ruta de menú → permiso requerido (`null` = cualquier usuario autenticado). */
export const PATH_PERMISSIONS: Record<string, Permission | null> = {
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

export function permissionsOf(user: AuthUser | null | undefined): Permission[] {
  if (!user) return [];
  if (user.permissions?.length) {
    return user.permissions.filter((p): p is Permission =>
      (APP_PERMISSIONS as readonly string[]).includes(p),
    );
  }
  const base = ROLE_PERMISSIONS[user.role] ? [...ROLE_PERMISSIONS[user.role]] : [];
  if (user.role === 'admin' && !user.platformAdmin) {
    return base.filter((p) => p !== 'platform');
  }
  if (user.platformAdmin && !base.includes('platform')) base.push('platform');
  return base;
}

export function can(user: AuthUser | null | undefined, permission: Permission) {
  if (!user) return false;
  if (user.role === 'admin') return permission !== 'platform' || Boolean(user.platformAdmin);
  const perms = permissionsOf(user);
  if (perms.includes('*' as Permission)) return true;
  return perms.includes(permission);
}

export function canAccessPath(user: AuthUser | null | undefined, path: string) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  // Match longest known path prefix.
  const known = Object.keys(PATH_PERMISSIONS).sort((a, b) => b.length - a.length);
  const hit = known.find((item) => path === item || (item !== '/' && path.startsWith(`${item}/`)));
  if (!hit) return false;
  const needed = PATH_PERMISSIONS[hit];
  if (needed == null) return true;
  return can(user, needed);
}

export const roleLabel: Record<Role, string> = {
  admin: 'Administración',
  ops: 'Bodega',
  dispatch: 'Despacho',
  driver: 'Conductor',
};
