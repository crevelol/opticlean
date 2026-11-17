import type { AppState, HazardClass, Location, Product } from './types.js';
import { resolveBusinessRules } from './business-rules.js';
import { lotsForActiveWarehouse } from './warehouse-admin.service.js';
import { getWarehouseGeometry } from './warehouse-layout.js';

export const HAZARD_CLASSES: HazardClass[] = [
  'none',
  'acid',
  'base',
  'oxidizer',
  'flammable',
  'chlorinated',
  'aerosol',
];

export const HAZARD_LABEL: Record<HazardClass, string> = {
  none: 'Sin riesgo químico',
  acid: 'Ácido',
  base: 'Base / alcalino',
  oxidizer: 'Oxidante',
  flammable: 'Inflamable',
  chlorinated: 'Clorado',
  aerosol: 'Aerosol',
};

const INCOMPATIBLE: Array<[HazardClass, HazardClass]> = [
  ['acid', 'base'],
  ['acid', 'chlorinated'],
  ['acid', 'flammable'],
  ['base', 'chlorinated'],
  ['oxidizer', 'flammable'],
  ['oxidizer', 'chlorinated'],
  ['aerosol', 'flammable'],
  ['aerosol', 'oxidizer'],
  ['aerosol', 'chlorinated'],
];

export function isHazardClass(value: unknown): value is HazardClass {
  return HAZARD_CLASSES.includes(value as HazardClass);
}

export function inferHazard(name: string, id = ''): HazardClass {
  const text = `${id} ${name}`.toLowerCase();
  if (/hipoclorito|cloro|lej[ií]a|blanqueador/.test(text)) return 'chlorinated';
  if (/desinfectante/.test(text)) return 'chlorinated';
  if (/amoni|desengr|alcalin|sosa|hidr[oó]xido|tensioactivo/.test(text)) return 'base';
  if (/[aá]cido|desincrust|muri[aá]tico/.test(text)) return 'acid';
  if (/per[oó]xido|oxidante|agua oxigenada/.test(text)) return 'oxidizer';
  if (/aerosol|spray/.test(text)) return 'aerosol';
  if (/alcohol|inflamable|solvente|fragancia/.test(text)) return 'flammable';
  return 'none';
}

export function hazardsConflict(a: HazardClass | undefined, b: HazardClass | undefined) {
  const left = a && a !== 'none' ? a : null;
  const right = b && b !== 'none' ? b : null;
  if (!left || !right || left === right) return false;
  return INCOMPATIBLE.some(
    ([x, y]) => (x === left && y === right) || (x === right && y === left),
  );
}

function productOf(s: AppState, id: string) {
  return s.products.find((p) => p.id === id);
}

/**
 * Rechaza la casilla si mezcla otro producto, otra caducidad o un químico
 * incompatible en el mismo rack (incluye casillas vecinas del módulo).
 */
export function placementBlockReason(
  s: AppState,
  productId: string,
  loc: Pick<Location, 'id' | 'rack'> | undefined,
  incoming?: { expiry?: string },
): string | null {
  if (!loc) return 'Ubicación no encontrada.';
  const item = productOf(s, productId);
  if (!item) return 'Producto no encontrado.';
  const lots = lotsForActiveWarehouse(s).filter((l) => l.qty > 0);
  const here = lots.filter((l) => l.loc === loc.id);
  if (here.some((l) => l.productId !== productId)) {
    return 'Esta ubicación contiene otro producto. Selecciona una ubicación compatible.';
  }
  const separateExpiry = resolveBusinessRules(s.settings).separateExpiryLots !== false;
  if (separateExpiry && here.length) {
    const expiries = new Set(here.map((l) => l.expiry));
    if (incoming?.expiry) expiries.add(incoming.expiry);
    if (expiries.size > 1) {
      return 'Esta ubicación tiene otro lote o caducidad. Usa una casilla libre.';
    }
  }

  const hazard = item.hazardClass ?? 'none';
  if (hazard === 'none') return null;
  for (const lot of lots) {
    const slot = getWarehouseGeometry(s).locations.find((l) => l.id === lot.loc);
    if (!slot || slot.rack !== loc.rack) continue;
    const other = productOf(s, lot.productId);
    if (!other || other.id === item.id) continue;
    if (!hazardsConflict(hazard, other.hazardClass)) continue;
    return `No se puede juntar ${HAZARD_LABEL[hazard]} con ${other.name} (${HAZARD_LABEL[other.hazardClass ?? 'none']}) en el rack ${slot.rack}.`;
  }
  return null;
}

export function hazardOf(product: Pick<Product, 'hazardClass'> | undefined): HazardClass {
  return product?.hazardClass && isHazardClass(product.hazardClass) ? product.hazardClass : 'none';
}
