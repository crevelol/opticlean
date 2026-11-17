import type { AppState, Order, OrderKit, OrderLine } from '../types';

export const activeWarehouseId = (s: AppState) =>
  s.settings.activeWarehouseId ?? s.warehouses?.[0]?.id ?? 'WH-QT-01';

export const scopedLots = (s: AppState) =>
  s.lots.filter((l) => (l.warehouseId ?? 'WH-QT-01') === activeWarehouseId(s));

const HELD_LOCS = new Set(['CUARENTENA', 'TRANSITO']);

export const stock = (s: AppState, id: string) =>
  scopedLots(s)
    .filter((l) => l.productId === id && !HELD_LOCS.has(l.loc))
    .reduce((n, l) => n + l.qty, 0);

export function expandedDemand(s: AppState, order: { lines: OrderLine[]; kits?: OrderKit[] }): OrderLine[] {
  const map = new Map<string, number>();
  for (const line of order.lines) map.set(line.productId, (map.get(line.productId) ?? 0) + line.qty);
  for (const kit of order.kits ?? []) {
    const bundle = (s.bundles ?? []).find((item) => item.id === kit.bundleId);
    for (const line of bundle?.lines ?? []) {
      map.set(line.productId, (map.get(line.productId) ?? 0) + line.qty * kit.qty);
    }
  }
  return [...map.entries()].map(([productId, qty]) => ({ productId, qty }));
}

export function bundlePrice(s: AppState, bundleId: string) {
  const bundle = (s.bundles ?? []).find((item) => item.id === bundleId);
  if (!bundle) return 0;
  if (bundle.price != null && Number.isFinite(bundle.price)) return bundle.price;
  return bundle.lines.reduce((n, line) => n + line.qty * (product(s, line.productId)?.price ?? 0), 0);
}

export const reserved = (s: AppState, id: string) =>
  s.orders
    .filter((o) => o.status === 'Por preparar')
    .reduce((n, o) => n + expandedDemand(s, o).filter((l) => l.productId === id).reduce((a, l) => a + l.qty, 0), 0);

export const available = (s: AppState, id: string) => stock(s, id) - reserved(s, id);

export const qtyAt = (s: AppState, loc: string) =>
  scopedLots(s)
    .filter((l) => l.loc === loc)
    .reduce((n, l) => n + l.qty, 0);

export const product = (s: AppState, id: string) => s.products.find((p) => p.id === id);

export const client = (s: AppState, id: string) => s.clients.find((c) => c.id === id);

export const orderValue = (s: AppState, o: { lines: OrderLine[]; kits?: OrderKit[] }) =>
  o.lines.reduce((n, l) => n + l.qty * (l.unitPrice ?? product(s, l.productId)?.price ?? 0), 0) +
  (o.kits ?? []).reduce((n, kit) => n + kit.qty * bundlePrice(s, kit.bundleId), 0);

export const orderWeight = (s: AppState, o: Order) =>
  expandedDemand(s, o).reduce((n, l) => n + l.qty * (product(s, l.productId)?.weight ?? 0), 0);

export const money = (n: number) =>
  new Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD' }).format(n);

const CREDIT_STATUSES = new Set(['Por preparar', 'Preparado', 'En ruta', 'Incidencia']);

/** Crédito usado = pedidos abiertos que aún no tienen factura. */
export const creditUsed = (s: AppState, clientId: string) => {
  const invoiced = new Set((s.invoices ?? []).filter((invoice) => invoice.status === 'Emitida').map((invoice) => invoice.orderId));
  return s.orders
    .filter((o) => o.clientId === clientId && CREDIT_STATUSES.has(o.status) && !o.id.startsWith('PED-H') && !invoiced.has(o.id))
    .reduce((n, o) => n + orderValue(s, o), 0);
};

export function invoiceBalance(s: AppState, invoiceId: string) {
  const invoice = (s.invoices ?? []).find((item) => item.id === invoiceId);
  if (!invoice || invoice.status !== 'Emitida') return 0;
  const credited = (s.creditNotes ?? [])
    .filter((note) => note.invoiceId === invoiceId && note.status === 'Emitida')
    .reduce((n, note) => n + note.total, 0);
  const paid = (s.customerPayments ?? []).filter((payment) => payment.invoiceId === invoiceId).reduce((n, payment) => n + payment.amount, 0);
  return Math.max(0, Math.round((invoice.total - credited - paid) * 100) / 100);
}

export function outstandingReceivable(s: AppState, clientId: string) {
  return (s.invoices ?? [])
    .filter((invoice) => invoice.clientId === clientId && invoice.status === 'Emitida')
    .reduce((n, invoice) => n + invoiceBalance(s, invoice.id), 0);
}

export const creditLimitOf = (s: AppState, clientId: string) =>
  client(s, clientId)?.creditLimit ?? 0;

export const creditAvailable = (s: AppState, clientId: string) =>
  Math.max(0, creditLimitOf(s, clientId) - creditUsed(s, clientId) - outstandingReceivable(s, clientId));

export const num = (n: number) => new Intl.NumberFormat('es-EC').format(n);

export const dateShort = (d: string) =>
  new Date(d.length === 10 ? d + 'T12:00:00' : d).toLocaleDateString('es-EC', {
    day: '2-digit',
    month: 'short',
    timeZone: 'America/Guayaquil',
  });

export const time = (d: string) =>
  new Date(d).toLocaleTimeString('es-EC', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Guayaquil',
  });

export const statusColor = (s: string) =>
  ({
    'Por preparar': 'amber',
    Preparado: 'blue',
    'En ruta': 'purple',
    Entregado: 'green',
    Incidencia: 'red',
    Solicitada: 'blue',
    Abierta: 'blue',
    Parcial: 'amber',
    Recibida: 'green',
  })[s] ?? '';
