import type { AppState, Bundle } from './types.js';
import { product } from './inventory.service.js';

export const DEFAULT_BUNDLES: Bundle[] = [
  {
    id: 'KIT01',
    name: 'Kit Limpieza Básico',
    description: 'Multiusos, limpiador de pisos y fundas',
    lines: [
      { productId: 'P001', qty: 4 },
      { productId: 'P032', qty: 2 },
      { productId: 'P078', qty: 2 },
    ],
  },
  {
    id: 'KIT02',
    name: 'Kit Oficina',
    description: 'Papel higiénico, toallas y jabón',
    lines: [
      { productId: 'P012', qty: 2 },
      { productId: 'P025', qty: 2 },
      { productId: 'P045', qty: 4 },
    ],
  },
  {
    id: 'KIT03',
    name: 'Kit Hospitalario',
    description: 'Desinfectante, guantes y jabón',
    lines: [
      { productId: 'P008', qty: 6 },
      { productId: 'P052', qty: 2 },
      { productId: 'P045', qty: 4 },
    ],
  },
];

export function ensureBundles(s: AppState) {
  if (!s.bundles) s.bundles = DEFAULT_BUNDLES.map((b) => ({ ...b, lines: b.lines.map((l) => ({ ...l })) }));
}

function cleanLines(s: AppState, lines: Bundle['lines']) {
  const grouped = new Map<string, number>();
  for (const line of lines) {
    const qty = Number(line.qty);
    if (!product(s, line.productId)) throw new Error('Hay un producto del paquete que no existe.');
    if (!Number.isInteger(qty) || qty <= 0) {
      throw new Error('Las cantidades del paquete deben ser enteros mayores que cero.');
    }
    grouped.set(line.productId, (grouped.get(line.productId) ?? 0) + qty);
  }
  const out = [...grouped.entries()].map(([productId, qty]) => ({ productId, qty }));
  if (!out.length) throw new Error('El paquete necesita al menos un producto.');
  return out;
}

export function saveBundle(s: AppState, body: Partial<Bundle>) {
  ensureBundles(s);
  const name = body.name?.trim() ?? '';
  if (!name) throw new Error('Escribe el nombre del paquete.');
  const description = body.description?.trim() ?? '';
  const lines = cleanLines(s, body.lines ?? []);
  if (body.id) {
    const existing = s.bundles!.find((b) => b.id === body.id);
    if (!existing) throw new Error('Paquete no encontrado.');
    existing.name = name;
    existing.description = description;
    existing.lines = lines;
    return existing;
  }
  const n = s.bundles!.reduce((max, b) => Math.max(max, Number(b.id.replace(/\D/g, '')) || 0), 0) + 1;
  const created: Bundle = { id: `KIT${String(n).padStart(2, '0')}`, name, description, lines };
  s.bundles!.push(created);
  return created;
}

export function deleteBundle(s: AppState, id: string) {
  ensureBundles(s);
  const before = s.bundles!.length;
  s.bundles = s.bundles!.filter((b) => b.id !== id);
  if (s.bundles.length === before) throw new Error('Paquete no encontrado.');
}
