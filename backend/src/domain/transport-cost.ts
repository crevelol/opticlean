/** Reglas genéricas de costo real de transporte (por km o por viaje). */

export type CostBasis = 'per_km' | 'per_trip';
export type CostCalc = 'fixed' | 'amortized';

export type TransportCostRuleInput = {
  name: string;
  category?: string;
  basis: CostBasis;
  calc: CostCalc;
  /** $/km, $/viaje o costo total a amortizar. */
  amount: number;
  /** Vida útil en km o viajes cuando calc = amortized. */
  lifeUnits?: number;
  active?: boolean;
  sortOrder?: number;
};

export type TransportCostRule = TransportCostRuleInput & {
  id: string;
  companyId: string;
  /** null = plantilla de empresa */
  vehicleId: string | null;
};

export type CostBreakdownLine = {
  id: string;
  name: string;
  category: string;
  basis: CostBasis;
  calc: CostCalc;
  amount: number;
  lifeUnits: number;
  /** Aporte unitario ya resuelto ($/km o $/viaje). */
  unitCost: number;
  active: boolean;
};

export type VehicleCostSummary = {
  costPerKm: number;
  costPerTrip: number;
  fromRules: boolean;
  lines: CostBreakdownLine[];
};

/** Aporte unitario de una regla. */
export function ruleUnitCost(rule: {
  basis: CostBasis;
  calc: CostCalc;
  amount: number;
  lifeUnits?: number;
}): number {
  const amount = Math.max(0, Number(rule.amount) || 0);
  if (rule.calc === 'amortized') {
    const life = Math.max(1, Number(rule.lifeUnits) || 1);
    return Math.round((amount / life) * 10000) / 10000;
  }
  return Math.round(amount * 10000) / 10000;
}

export function summarizeVehicleCost(
  rules: Array<{
    id: string;
    name: string;
    category?: string;
    basis: CostBasis;
    calc: CostCalc;
    amount: number;
    lifeUnits?: number;
    active?: boolean;
  }>,
  fallbackCostPerKm: number,
): VehicleCostSummary {
  const lines: CostBreakdownLine[] = rules.map((rule) => ({
    id: rule.id,
    name: rule.name,
    category: rule.category || 'otro',
    basis: rule.basis,
    calc: rule.calc,
    amount: Number(rule.amount) || 0,
    lifeUnits: Number(rule.lifeUnits) || 0,
    unitCost: ruleUnitCost(rule),
    active: rule.active !== false,
  }));
  const active = lines.filter((line) => line.active);
  const perKm = active.filter((line) => line.basis === 'per_km');
  const perTrip = active.filter((line) => line.basis === 'per_trip');
  const fromRules = perKm.length > 0;
  const costPerKm = fromRules
    ? Math.round(perKm.reduce((n, line) => n + line.unitCost, 0) * 10000) / 10000
    : Math.max(0, Number(fallbackCostPerKm) || 0);
  const costPerTrip =
    Math.round(perTrip.reduce((n, line) => n + line.unitCost, 0) * 100) / 100;
  return { costPerKm, costPerTrip, fromRules, lines };
}

/** Costo total estimado de una ruta. */
export function estimateTransportCost(km: number, summary: VehicleCostSummary) {
  const distance = Math.max(0, Number(km) || 0);
  return Math.round((distance * summary.costPerKm + summary.costPerTrip) * 100) / 100;
}

/** Plantillas típicas según tipo de vehículo (se pueden editar luego). */
export function defaultRulesForKind(kind: string): TransportCostRuleInput[] {
  if (kind === 'motocicleta') {
    return [
      { name: 'Combustible', category: 'combustible', basis: 'per_km', calc: 'fixed', amount: 0.08, sortOrder: 10 },
      {
        name: 'Llantas',
        category: 'llantas',
        basis: 'per_km',
        calc: 'amortized',
        amount: 180,
        lifeUnits: 12000,
        sortOrder: 20,
      },
      {
        name: 'Mantenimiento',
        category: 'mantenimiento',
        basis: 'per_km',
        calc: 'amortized',
        amount: 120,
        lifeUnits: 8000,
        sortOrder: 30,
      },
    ];
  }
  if (kind === 'carro') {
    return [
      { name: 'Combustible', category: 'combustible', basis: 'per_km', calc: 'fixed', amount: 0.18, sortOrder: 10 },
      {
        name: 'Llantas (juego)',
        category: 'llantas',
        basis: 'per_km',
        calc: 'amortized',
        amount: 480,
        lifeUnits: 40000,
        sortOrder: 20,
      },
      {
        name: 'Aceite / filtros',
        category: 'mantenimiento',
        basis: 'per_km',
        calc: 'amortized',
        amount: 90,
        lifeUnits: 8000,
        sortOrder: 30,
      },
      { name: 'Peaje / parqueadero', category: 'peaje', basis: 'per_trip', calc: 'fixed', amount: 2.5, sortOrder: 40 },
    ];
  }
  return [
    { name: 'Combustible / diésel', category: 'combustible', basis: 'per_km', calc: 'fixed', amount: 0.35, sortOrder: 10 },
    {
      name: 'Llantas (juego)',
      category: 'llantas',
      basis: 'per_km',
      calc: 'amortized',
      amount: 1200,
      lifeUnits: 50000,
      sortOrder: 20,
    },
    {
      name: 'Aceite / filtros',
      category: 'mantenimiento',
      basis: 'per_km',
      calc: 'amortized',
      amount: 220,
      lifeUnits: 10000,
      sortOrder: 30,
    },
    {
      name: 'Frenos / desgaste',
      category: 'mantenimiento',
      basis: 'per_km',
      calc: 'amortized',
      amount: 350,
      lifeUnits: 40000,
      sortOrder: 40,
    },
    { name: 'Peaje / extras de ruta', category: 'peaje', basis: 'per_trip', calc: 'fixed', amount: 4, sortOrder: 50 },
  ];
}
