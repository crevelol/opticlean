import { useMemo } from 'react';
import { layoutSummary, normalizeLayout } from '../../shared/lib/warehouseLayout';
import type { AppState, Lot, WarehouseSite } from '../../shared/types';

/** A partir de este porcentaje de capacidad usada la bodega se marca para revisión. */
export const CAPACITY_WARN = 0.85;

export type RackCell = { id: string; level: number; pos: number; face?: 'D' | 'T'; qty: number };
export type RackFill = { id: string; units: number; capacity: number; pct: number; cells: RackCell[] };

export type WarehouseRow = {
  warehouse: WarehouseSite;
  summary: ReturnType<typeof layoutSummary>;
  lots: Lot[];
  units: number;
  occupied: number;
  capacityPct: number;
  racks: RackFill[];
  alerts: string[];
};

const lotWarehouse = (lot: Lot) => lot.warehouseId ?? 'WH-QT-01';

export function warehouseRow(warehouse: WarehouseSite, allLots: Lot[]): WarehouseRow {
  const summary = layoutSummary(normalizeLayout(warehouse.layout ?? { racks: warehouse.racks }));
  const lots = allLots.filter((lot) => lotWarehouse(lot) === warehouse.id);
  const qtyByLoc = new Map<string, number>();
  lots.forEach((lot) => qtyByLoc.set(lot.loc, (qtyByLoc.get(lot.loc) ?? 0) + lot.qty));
  const units = lots.reduce((n, lot) => n + lot.qty, 0);
  const occupied = [...qtyByLoc.values()].filter((qty) => qty > 0).length;
  const cap = summary.layout.capacityPerCell;
  const racks = summary.racks.map((rack) => {
    const cells = summary.locations
      .filter((loc) => loc.rack === rack.id)
      .map((loc) => ({ id: loc.id, level: loc.level, pos: loc.pos, face: loc.face, qty: qtyByLoc.get(loc.id) ?? 0 }));
    const rackUnits = cells.reduce((n, cell) => n + cell.qty, 0);
    const capacity = cells.length * cap;
    return { id: rack.id, units: rackUnits, capacity, pct: capacity ? rackUnits / capacity : 0, cells };
  });
  const capacityPct = summary.capacityUnits ? units / summary.capacityUnits : 0;
  const alerts: string[] = [];
  if (capacityPct >= CAPACITY_WARN) alerts.push('Capacidad casi llena');
  if (!warehouse.address.trim()) alerts.push('Falta dirección');
  return { warehouse, summary, lots, units, occupied, capacityPct, racks, alerts };
}

export function useWarehouseRows(state: AppState) {
  return useMemo(() => state.warehouses.map((w) => warehouseRow(w, state.lots)), [state.warehouses, state.lots]);
}

export const pct = (value: number) => Math.round(value * 100);
