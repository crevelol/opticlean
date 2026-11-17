import type { AppState, Client, OrderPick, PurchaseLine } from './types.js';
import { addEvent, assertFitsVehicle, product, qtyAt, uid } from './inventory.service.js';
import { stockQtyFromPack, unitsPerPack } from './packs.js';
import { refreshPurchase } from './purchase-lines.js';
import { vehicleByPlate } from './fleet.service.js';
import { suggest } from './placement.service.js';
import { activeWarehouseId, lotsForActiveWarehouse } from './warehouse-admin.service.js';
import { getWarehouseGeometry } from './warehouse-layout.js';

const OPEN_ORDER = ['Por preparar', 'Preparado', 'En ruta', 'Incidencia'];

/* ─── Pedidos ─────────────────────────────────────────────── */

function restockLocation(s: AppState, productId: string, qty: number, preferred?: string) {
  const geo = getWarehouseGeometry(s);
  const fits = (locId: string) => {
    const loc = geo.locations.find((l) => l.id === locId);
    if (!loc || qtyAt(s, locId) + qty > loc.capacity) return false;
    return !lotsForActiveWarehouse(s).some((l) => l.loc === locId && l.productId !== productId);
  };
  if (preferred && fits(preferred)) return preferred;
  return suggest(s, productId, qty)[0]?.id;
}

/**
 * Por preparar: libera la reserva. Preparado: devuelve lo pickeado a bodega
 * (misma ubicación si cabe; si no, la mejor sugerida).
 */
export function cancelOrder(s: AppState, orderId: string, reason: string) {
  const o = s.orders.find((x) => x.id === orderId);
  if (!o) throw new Error('Pedido no encontrado.');
  if (!['Por preparar', 'Preparado'].includes(o.status)) {
    throw new Error('Solo se pueden cancelar pedidos por preparar o preparados.');
  }
  if (s.invoices?.some((invoice) => invoice.orderId === orderId && invoice.status === 'Emitida')) {
    throw new Error('El pedido tiene factura emitida. Emite una nota de crédito.');
  }
  const why = reason?.trim();
  if (!why) throw new Error('Indica el motivo de la cancelación.');

  if (o.status === 'Preparado') {
    const picks: OrderPick[] = o.picks?.length ? o.picks : o.lines;
    const restocked: Array<{ productId: string; qty: number; loc: string; batch: string }> = [];
    for (const pick of picks) {
      const loc = restockLocation(s, pick.productId, pick.qty, pick.loc);
      if (!loc) {
        throw new Error(
          `No hay ubicación disponible para devolver ${pick.qty} u. de ${product(s, pick.productId)?.name ?? pick.productId}.`,
        );
      }
      const batch = pick.batch || `DEV-${o.id}`;
      const sameBatch = s.lots.find((l) => l.productId === pick.productId && l.batch === batch);
      const expiry =
        pick.expiry ||
        sameBatch?.expiry ||
        s.lots
          .filter((l) => l.productId === pick.productId)
          .map((l) => l.expiry)
          .sort()
          .at(-1) ||
        new Date(Date.now() + 365 * 864e5).toISOString().slice(0, 10);
      s.lots.push({
        id: uid('lot'),
        productId: pick.productId,
        qty: pick.qty,
        loc,
        batch,
        expiry,
        warehouseId: activeWarehouseId(s),
      });
      restocked.push({ productId: pick.productId, qty: pick.qty, loc, batch });
    }
    for (const r of restocked) {
      addEvent(s, 'Devolución', r.productId, r.qty, 'Zona de despacho', r.loc, o.id, r.batch);
    }
  }

  o.status = 'Cancelado';
  o.cancelReason = why;
  o.cancelledAt = new Date().toISOString();
  o.stagedPlate = undefined;
  return o;
}

/** Carga pedidos preparados en un camión. Queda guardado hasta el despacho. */
export function stageOrders(s: AppState, ids: string[], plate: string) {
  const unique = [...new Set(ids)];
  if (!unique.length) throw new Error('Selecciona pedidos preparados.');
  const vehicle = vehicleByPlate(s, plate);
  if (!vehicle) throw new Error('El vehículo no está registrado en la flota.');
  if (!vehicle.active) throw new Error(`El vehículo ${vehicle.plate} está inactivo.`);
  const picked = unique.map((id) => {
    const o = s.orders.find((x) => x.id === id);
    if (!o || o.status !== 'Preparado') throw new Error('Solo se cargan pedidos preparados.');
    return o;
  });
  const already = s.orders.filter(
    (o) => o.status === 'Preparado' && o.stagedPlate === vehicle.plate && !unique.includes(o.id),
  );
  const enRoute = s.orders.filter(
    (o) => o.vehicle === vehicle.plate && ['En ruta', 'Incidencia'].includes(o.status),
  );
  assertFitsVehicle(s, vehicle.plate, [...enRoute, ...already, ...picked]);
  for (const o of picked) o.stagedPlate = vehicle.plate;
}

export function unstageOrders(s: AppState, ids: string[]) {
  const unique = [...new Set(ids)];
  if (!unique.length) throw new Error('Selecciona pedidos para retirar del camión.');
  let cleared = 0;
  for (const id of unique) {
    const o = s.orders.find((x) => x.id === id);
    if (!o || o.status !== 'Preparado' || !o.stagedPlate) continue;
    o.stagedPlate = undefined;
    cleared += 1;
  }
  if (!cleared) throw new Error('Esos pedidos no están cargados en un camión.');
}

/* ─── Clientes ────────────────────────────────────────────── */

const CLIENT_FIELDS = ['name', 'contact', 'address', 'email', 'type'] as const;

function cleanClient(input: Partial<Client>) {
  const out: Omit<Client, 'id'> = {
    name: '',
    contact: '',
    address: '',
    email: '',
    type: '',
  };
  for (const f of CLIENT_FIELDS) {
    const v = typeof input[f] === 'string' ? input[f]!.trim() : '';
    if (!v) throw new Error('Completa nombre, contacto, dirección, correo y tipo del cliente.');
    out[f] = v;
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(out.email)) throw new Error('El correo no es válido.');
  if (input.city?.trim()) out.city = input.city.trim();
  if (input.sector?.trim()) out.sector = input.sector.trim();
  return out;
}

export function createClient(s: AppState, input: Partial<Client>) {
  const data = cleanClient(input);
  if (s.clients.some((c) => c.name.toLowerCase() === data.name.toLowerCase())) {
    throw new Error('Ya existe un cliente con ese nombre.');
  }
  const n = Math.max(0, ...s.clients.map((c) => Number(c.id.replace(/\D/g, '')) || 0)) + 1;
  const c: Client = { id: `CL${String(n).padStart(3, '0')}`, ...data };
  s.clients.push(c);
  return c;
}

export function updateClient(s: AppState, id: string, input: Partial<Client>) {
  const c = s.clients.find((x) => x.id === id);
  if (!c) throw new Error('Cliente no encontrado.');
  const data = cleanClient({ ...c, ...input });
  if (s.clients.some((x) => x.id !== id && x.name.toLowerCase() === data.name.toLowerCase())) {
    throw new Error('Ya existe un cliente con ese nombre.');
  }
  delete c.city;
  delete c.sector;
  Object.assign(c, data);
  return c;
}

export function deleteClient(s: AppState, id: string) {
  const c = s.clients.find((x) => x.id === id);
  if (!c) throw new Error('Cliente no encontrado.');
  if (s.orders.some((o) => o.clientId === id && OPEN_ORDER.includes(o.status))) {
    throw new Error('El cliente tiene pedidos activos. Complétalos o cancélalos antes de eliminarlo.');
  }
  if (s.orders.some((o) => o.clientId === id)) {
    throw new Error('El cliente tiene historial de pedidos; se conserva para la trazabilidad.');
  }
  s.clients = s.clients.filter((x) => x.id !== id);
}

/* ─── Órdenes de compra ───────────────────────────────────── */

export function createPurchase(
  s: AppState,
  body: {
    productId?: string;
    qty?: number | string;
    date?: string;
    expectedDate?: string;
    notes?: string;
    supplierId?: string;
    lines?: Array<{
      productId: string;
      qty: number | string;
      packCode?: string;
      unitPrice?: number | string;
      batch?: string;
      expiry?: string;
    }>;
  },
) {
  const rawLines = body.lines?.length
    ? body.lines
    : body.productId
      ? [{ productId: body.productId, qty: body.qty ?? 0, packCode: 'unidad', unitPrice: 0 }]
      : [];
  if (!rawLines.length) throw new Error('La orden necesita al menos un producto.');
  if (body.supplierId && !s.suppliers?.some((supplier) => supplier.id === body.supplierId)) {
    throw new Error('Proveedor no encontrado.');
  }
  const lines: PurchaseLine[] = rawLines.map((line) => {
    const item = product(s, line.productId);
    if (!item) throw new Error('Selecciona un producto válido.');
    const packCode = line.packCode || 'unidad';
    const packQty = Number(line.qty);
    if (!Number.isInteger(packQty) || packQty <= 0) {
      throw new Error('La cantidad debe ser un entero mayor que cero.');
    }
    const perPack = unitsPerPack(item, packCode);
    stockQtyFromPack(item, packQty, packCode);
    const unitPrice = Number(line.unitPrice ?? item.price);
    return {
      productId: line.productId,
      qty: packQty,
      packCode,
      unitsPerPack: perPack,
      unitPrice: Number.isFinite(unitPrice) && unitPrice >= 0 ? unitPrice : 0,
      receivedUnits: 0,
      batch: line.batch?.trim() || undefined,
      expiry: line.expiry?.trim() || undefined,
    };
  });
  const n = Math.max(0, ...s.purchases.map((p) => Number(p.id.replace(/\D/g, '')) || 0)) + 1;
  const purchase = refreshPurchase({
    id: `OC-${String(n).padStart(4, '0')}`,
    supplierId: body.supplierId || undefined,
    productId: lines[0].productId,
    qty: 0,
    date: body.date || new Date().toISOString().slice(0, 10),
    expectedDate: body.expectedDate || undefined,
    notes: body.notes?.trim() || undefined,
    received: 0,
    status: 'Abierta',
    lines,
  });
  s.purchases.unshift(purchase);
  return purchase;
}

export function cancelPurchase(s: AppState, id: string) {
  const p = s.purchases.find((x) => x.id === id);
  if (!p) throw new Error('Orden de compra no encontrada.');
  if (p.status === 'Recibida') throw new Error('La orden ya fue recibida por completo.');
  if (p.status === 'Cancelada') throw new Error('La orden ya está cancelada.');
  p.status = 'Cancelada';
  return p;
}

export const isOpenPurchase = (p: { status?: string }) =>
  !p.status || p.status === 'Abierta' || p.status === 'Parcial';
