import type { AppState, Location } from './types.js';
import { lotsForActiveWarehouse } from './warehouse-admin.service.js';

const productVolume = (s: AppState, productId: string) =>
  Math.max(0, s.products.find((p) => p.id === productId)?.volume ?? 0);

export const unitsAt = (s: AppState, loc: string) =>
  lotsForActiveWarehouse(s)
    .filter((l) => l.loc === loc)
    .reduce((n, l) => n + l.qty, 0);

/** Litros ocupados en una casilla (volumen del producto × unidades). */
export const litersAt = (s: AppState, loc: string) =>
  lotsForActiveWarehouse(s)
    .filter((l) => l.loc === loc)
    .reduce((n, l) => n + l.qty * productVolume(s, l.productId), 0);

/** null si la cantidad cabe en la casilla por unidades y, si aplica, por volumen. */
export function cellFitReason(s: AppState, loc: Location, productId: string, qty: number): string | null {
  if (unitsAt(s, loc.id) + qty > loc.capacity) {
    return `La cantidad supera la capacidad de esta ubicación (${loc.capacity} unidades).`;
  }
  if (loc.volumeL && loc.volumeL > 0) {
    const need = qty * productVolume(s, productId);
    const used = litersAt(s, loc.id);
    if (used + need > loc.volumeL + 1e-9) {
      const free = Math.max(0, loc.volumeL - used);
      return `No cabe por volumen: la casilla tiene ${free.toFixed(1)} L libres y se necesitan ${need.toFixed(1)} L.`;
    }
  }
  return null;
}

export const cellFits = (s: AppState, loc: Location, productId: string, qty: number) =>
  cellFitReason(s, loc, productId, qty) === null;
