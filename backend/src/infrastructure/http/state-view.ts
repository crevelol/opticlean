import type { AppState } from '../../domain/types.js';
import type { PublicUser } from '../auth/auth.js';

const DRIVER_STATUSES = new Set(['Preparado', 'En ruta', 'Incidencia', 'Entregado']);

/**
 * Lo que cada rol puede ver del estado.
 * - admin: todo.
 * - bodega y despacho: todo menos cuentas por pagar a proveedores.
 * - chofer: solo los pedidos de su camión y lo necesario para entregarlos.
 */
export function stateForUser(state: AppState, user: PublicUser | undefined): AppState {
  if (!user || user.role === 'admin') return state;
  if (user.role === 'driver') return driverView(state, user.truckPlate);
  return { ...state, supplierBills: [], supplierPayments: [], auditLog: [] };
}

function driverView(state: AppState, plate?: string): AppState {
  const mine = (p?: string) => !!plate && !!p && p.toUpperCase() === plate.toUpperCase();
  const orders = state.orders.filter(
    (o) => DRIVER_STATUSES.has(o.status) && (mine(o.vehicle) || mine(o.stagedPlate)),
  );
  const orderIds = new Set(orders.map((o) => o.id));
  const clientIds = new Set(orders.map((o) => o.clientId));
  const productIds = new Set(
    orders.flatMap((o) => [...o.lines, ...(o.picks ?? [])].map((l) => l.productId)),
  );
  return {
    ...state,
    products: state.products.map((p) => ({ ...p, avgCost: undefined })).filter((p) => productIds.has(p.id)),
    lots: [],
    clients: state.clients
      .filter((c) => clientIds.has(c.id))
      .map(({ creditLimit: _limit, paymentTermsDays: _terms, ...c }) => c),
    orders,
    events: state.events.filter((e) => orderIds.has(e.ref)),
    purchases: [],
    receipts: [],
    invoices: [],
    creditNotes: [],
    guides: (state.guides ?? []).filter((g) => g.orderId && orderIds.has(g.orderId)),
    customerPayments: [],
    supplierBills: [],
    supplierPayments: [],
    priceLists: [],
    clientPrices: [],
    supplierReturns: [],
    adjustments: [],
    cycleCounts: [],
    transfers: [],
    suppliers: [],
    auditLog: [],
  };
}

/** true si el cuerpo de respuesta lleva un estado completo de la app. */
export function carriesState(body: unknown): body is { state: AppState } {
  if (!body || typeof body !== 'object') return false;
  const state = (body as { state?: unknown }).state;
  return !!state && typeof state === 'object' && Array.isArray((state as AppState).orders);
}
