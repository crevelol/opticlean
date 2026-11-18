import type { AuthUser } from '../auth';
import type { Order } from '../types';

/** Pedidos que el bodeguero puede ver/preparar en móvil. */
export function isAssignedToMe(order: Order, user: AuthUser | null | undefined) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  return order.assignedToUserId === user.id;
}

export function myPendingOrders(orders: Order[], user: AuthUser | null | undefined) {
  return orders.filter(
    (o) =>
      !o.id.startsWith('PED-H') &&
      o.status === 'Por preparar' &&
      isAssignedToMe(o, user),
  );
}
