import type { Client, Product } from '../../shared/types';

function round2(n: number) {
  return Math.round(Math.max(0, n) * 100) / 100;
}

/** True si el cliente tiene margen de cotización configurado. */
export function clientHasMargin(client: Pick<Client, 'marginPct'> | null | undefined) {
  return client?.marginPct != null && Number.isFinite(client.marginPct) && client.marginPct >= 0;
}

/**
 * Precio automático de cotización (sin ingreso manual):
 * 1. Margen del cliente + costo del producto → costo × (1 + margen%)
 * 2. Si no hay margen (o no hay costo) → PVP del producto
 *
 * El PVP editable en la cotización tiene prioridad cuando el usuario lo cambia a mano.
 */
export function quoteUnitPrice(
  item: Pick<Product, 'price' | 'avgCost'> | null | undefined,
  marginPct: number | null | undefined,
) {
  const pvp = item?.price ?? 0;
  if (marginPct == null || !Number.isFinite(marginPct) || marginPct < 0) return round2(pvp);
  const cost = item?.avgCost ?? 0;
  if (!(cost > 0)) return round2(pvp);
  return round2(cost * (1 + marginPct / 100));
}

export function effectiveQuoteMargin(
  client: Pick<Client, 'marginPct'> | null | undefined,
  override: number | null | undefined,
) {
  if (override != null && Number.isFinite(override) && override >= 0) return override;
  if (clientHasMargin(client)) return client!.marginPct!;
  return null;
}
