import type { AuthUser } from './session';

type Role = AuthUser['role'];

/** Debe coincidir con los requireRole(...) de backend/src/infrastructure/http/server.ts (admin siempre puede). */
const RULES = {
  admin: [] as Role[],
  warehouse: ['ops'] as Role[],
  picking: ['ops', 'dispatch'] as Role[],
  dispatch: ['dispatch'] as Role[],
  field: ['dispatch', 'driver'] as Role[],
};

export type Permission = keyof typeof RULES;

export function can(user: AuthUser | null | undefined, permission: Permission) {
  if (!user) return false;
  return user.role === 'admin' || RULES[permission].includes(user.role);
}

export const roleLabel: Record<Role, string> = {
  admin: 'Administración',
  ops: 'Bodega',
  dispatch: 'Despacho',
  driver: 'Conductor',
};
