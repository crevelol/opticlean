import type { Product, ProductPack } from './types.js';

export const DEFAULT_PACKS: ProductPack[] = [
  { code: 'unidad', label: 'Unidad', units: 1 },
  { code: 'paquete', label: 'Paquete', units: 6 },
  { code: 'caja', label: 'Caja', units: 12 },
  { code: 'bulto', label: 'Bulto', units: 48 },
];

export function defaultPacksFor(name: string): ProductPack[] {
  const n = name.toLowerCase();
  if (n.includes('caja')) {
    return [
      { code: 'unidad', label: 'Caja', units: 1 },
      { code: 'bulto', label: 'Bulto', units: 10 },
    ];
  }
  if (n.includes('paquete')) {
    return [
      { code: 'unidad', label: 'Paquete', units: 1 },
      { code: 'caja', label: 'Caja', units: 8 },
    ];
  }
  return DEFAULT_PACKS.map((p) => ({ ...p }));
}

export function packsOf(product: Pick<Product, 'packs' | 'name'> | undefined): ProductPack[] {
  const packs = product?.packs?.filter((p) => p.code && p.units > 0);
  if (packs?.length) return packs;
  return defaultPacksFor(product?.name ?? '');
}

export function unitsPerPack(product: Pick<Product, 'packs' | 'name'> | undefined, packCode?: string) {
  const code = (packCode || 'unidad').toLowerCase();
  const pack = packsOf(product).find((p) => p.code === code);
  if (!pack) throw new Error(`Empaque "${packCode}" no está configurado en el producto.`);
  return pack.units;
}

export function stockQtyFromPack(
  product: Pick<Product, 'packs' | 'name'> | undefined,
  packQty: number,
  packCode?: string,
) {
  if (!Number.isInteger(packQty) || packQty <= 0) {
    throw new Error('La cantidad de empaques debe ser un entero mayor que cero.');
  }
  return packQty * unitsPerPack(product, packCode);
}
