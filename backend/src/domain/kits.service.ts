import type { AppState, Bundle } from './types.js';
import { ensureBundles } from './bundles.service.js';
import {
  addEvent,
  available,
  fefoCompare,
  isLotSellable,
  daysUntilExpiry,
  product,
  receive,
  todayGuayaquil,
  uid,
  upsertProduct,
} from './inventory.service.js';
import { suggest } from './placement.service.js';
import { lotsForActiveWarehouse } from './warehouse-admin.service.js';

export function bundleSellPrice(s: AppState, bundle: Bundle) {
  if (bundle.price != null && Number.isFinite(bundle.price) && bundle.price >= 0) return bundle.price;
  return bundle.lines.reduce((n, line) => n + line.qty * (product(s, line.productId)?.price ?? 0), 0);
}

/** El paquete armado se guarda como producto para poder ubicarlo y venderlo. */
export function ensureKitProduct(s: AppState, bundle: Bundle) {
  const price = bundleSellPrice(s, bundle);
  const existing = product(s, bundle.id);
  if (existing) {
    existing.name = bundle.name;
    existing.price = price;
    existing.kind = 'finished';
    existing.category = existing.category || 'Paquetes';
    existing.components = bundle.lines.map((line) => ({ ...line }));
    return existing;
  }
  return upsertProduct(s, {
    id: bundle.id,
    sku: bundle.id,
    name: bundle.name,
    category: 'Paquetes',
    supplier: 'Armado interno',
    price,
    min: 0,
    weight: bundle.lines.reduce((n, line) => n + line.qty * (product(s, line.productId)?.weight ?? 0), 0),
    volume: bundle.lines.reduce((n, line) => n + line.qty * (product(s, line.productId)?.volume ?? 0), 0),
    kind: 'finished',
    components: bundle.lines.map((line) => ({ ...line })),
    hazardClass: 'none',
    stockUnit: 'paquete',
    packs: [
      { code: 'unidad', label: 'Paquete', units: 1 },
    ],
  });
}

function consume(s: AppState, productId: string, qty: number, ref: string) {
  let left = qty;
  const today = todayGuayaquil();
  const lots = lotsForActiveWarehouse(s)
    .filter((lot) => lot.productId === productId && isLotSellable(s, lot, today))
    .sort(fefoCompare);
  for (const lot of lots) {
    if (!left) break;
    const take = Math.min(lot.qty, left);
    lot.qty -= take;
    left -= take;
    addEvent(s, 'Armado', productId, take, lot.loc, ref, ref, lot.batch);
  }
  if (left) {
    throw new Error(`Faltan ${left} unidades de ${product(s, productId)?.name ?? productId} con vida útil suficiente.`);
  }
}

export function assembleBundle(
  s: AppState,
  body: { bundleId: string; qty: number | string; loc?: string; batch: string; expiry: string },
) {
  ensureBundles(s);
  const bundle = s.bundles?.find((item) => item.id === body.bundleId);
  if (!bundle) throw new Error('Paquete no encontrado.');
  const qty = Number(body.qty);
  if (!Number.isInteger(qty) || qty <= 0) throw new Error('La cantidad a armar debe ser un entero mayor que cero.');
  if (!body.batch?.trim() || !body.expiry) throw new Error('Indica el lote y la caducidad del paquete armado.');
  for (const line of bundle.lines) {
    if (available(s, line.productId) < line.qty * qty) {
      throw new Error(`Stock insuficiente de ${product(s, line.productId)?.name ?? line.productId} para armar el paquete.`);
    }
  }
  const kit = ensureKitProduct(s, bundle);
  const ref = uid('ARM');
  for (const line of bundle.lines) consume(s, line.productId, line.qty * qty, ref);
  s.lots = s.lots.filter((lot) => lot.qty > 0);
  const loc = body.loc || suggest(s, kit.id, qty)[0]?.id;
  if (!loc) throw new Error('No hay una ubicación compatible para el paquete armado.');
  receive(s, {
    productId: kit.id,
    qty,
    loc,
    batch: body.batch.trim(),
    expiry: body.expiry,
    supplier: 'Armado interno',
    reason: 'Armado de paquete',
  });
  return { bundleId: bundle.id, productId: kit.id, qty, loc };
}
