import { seed } from './seed.js';
import type { AppState } from './types.js';

/** Estado inicial de una empresa real: sin productos, clientes ni movimientos de demostración. */
export function emptyState(companyName = 'Mi empresa'): AppState {
  const base = seed();
  const warehouse = { ...base.warehouses[0], notes: 'Bodega inicial. Ajusta el diseño antes de recibir.' };
  return {
    version: 2,
    demo: false,
    products: [],
    lots: [],
    warehouses: [warehouse],
    clients: [],
    orders: [],
    events: [],
    purchases: [],
    receipts: [],
    settings: {
      ...base.settings,
      company: companyName,
      warehouse: warehouse.name,
      operator: 'Sistema',
      activeWarehouseId: warehouse.id,
    },
    families: [],
    vehicles: [],
    bundles: [],
    suppliers: [],
  };
}
