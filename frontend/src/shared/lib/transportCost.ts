export type CostBasis = 'per_km' | 'per_trip';
export type CostCalc = 'fixed' | 'amortized';

export type TransportCostRule = {
  id: string;
  companyId: string;
  vehicleId: string | null;
  name: string;
  category: string;
  basis: CostBasis;
  calc: CostCalc;
  amount: number;
  lifeUnits: number;
  active: boolean;
  sortOrder: number;
  unitCost: number;
};

export type VehicleCostSummary = {
  costPerKm: number;
  costPerTrip: number;
  fromRules: boolean;
  lines: Array<{
    id: string;
    name: string;
    category: string;
    basis: CostBasis;
    calc: CostCalc;
    amount: number;
    lifeUnits: number;
    unitCost: number;
    active: boolean;
  }>;
};

export const COST_CATEGORIES = [
  { id: 'combustible', label: 'Combustible' },
  { id: 'llantas', label: 'Llantas' },
  { id: 'mantenimiento', label: 'Mantenimiento' },
  { id: 'peaje', label: 'Peaje / extras' },
  { id: 'seguro', label: 'Seguro' },
  { id: 'otro', label: 'Otro' },
] as const;

export function categoryLabel(id: string) {
  return COST_CATEGORIES.find((c) => c.id === id)?.label ?? id;
}

export function basisLabel(basis: CostBasis) {
  return basis === 'per_trip' ? 'Por viaje' : 'Por km';
}

export function calcLabel(calc: CostCalc) {
  return calc === 'amortized' ? 'Amortizado' : 'Fijo';
}

export function formatUnitCost(rule: Pick<TransportCostRule, 'basis' | 'unitCost'>) {
  const n = rule.unitCost.toFixed(4).replace(/\.?0+$/, '');
  return rule.basis === 'per_trip' ? `$${n}/viaje` : `$${n}/km`;
}
