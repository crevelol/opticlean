import type { AppState, AuditEntry } from './types.js';
import { actorName, uid } from './inventory.service.js';
import { currentActor } from './request-context.js';

/** true si quien hace la petición es administración (o no hay petición: procesos internos). */
export function actorIsAdmin() {
  const actor = currentActor();
  return !actor || actor.role === 'admin';
}

const same = (a: unknown, b: unknown) =>
  (a ?? null) === (b ?? null) || (Number.isFinite(Number(a)) && Number.isFinite(Number(b)) && a != null && b != null && Number(a) === Number(b));

/** Registra un cambio de dato sensible (precio, costo, IVA, cupo o plazo de crédito). */
export function recordChange(
  s: AppState,
  entry: { entity: AuditEntry['entity']; entityId: string; entityName: string; field: string; from: unknown; to: unknown },
) {
  if (same(entry.from, entry.to)) return;
  s.auditLog ??= [];
  s.auditLog.unshift({
    id: uid('aud'),
    at: new Date().toISOString(),
    by: actorName(s),
    entity: entry.entity,
    entityId: entry.entityId,
    entityName: entry.entityName,
    field: entry.field,
    from: entry.from == null ? '' : String(entry.from),
    to: entry.to == null ? '' : String(entry.to),
  });
}
