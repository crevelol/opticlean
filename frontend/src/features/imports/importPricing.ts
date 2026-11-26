export type ImportPriceRole = 'cost' | 'pvp';

const STORAGE_KEY = 'opticlean.import.pricing';

function roundMoney(n: number) {
  return Math.round(Math.max(0, n) * 100) / 100;
}

/** Margen sobre costo: PVP = costo × (1 + margen%). */
export function deriveImportPrices(
  unitValue: number,
  role: ImportPriceRole,
  marginPct: number,
): { cost: number; pvp: number } {
  const value = roundMoney(unitValue);
  const margin = Number.isFinite(marginPct) ? Math.max(0, Math.min(1000, marginPct)) : 0;
  if (role === 'cost') {
    return { cost: value, pvp: roundMoney(value * (1 + margin / 100)) };
  }
  const cost = margin <= 0 ? value : roundMoney(value / (1 + margin / 100));
  return { cost, pvp: value };
}

export function defaultPriceRole(kind: 'purchase' | 'sale'): ImportPriceRole {
  return kind === 'purchase' ? 'cost' : 'pvp';
}

export function readStoredPricing(kind: 'purchase' | 'sale'): {
  priceRole: ImportPriceRole;
  marginPct: number;
} {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { priceRole?: string; marginPct?: number };
      const priceRole =
        parsed.priceRole === 'cost' || parsed.priceRole === 'pvp'
          ? parsed.priceRole
          : defaultPriceRole(kind);
      const marginPct =
        typeof parsed.marginPct === 'number' && Number.isFinite(parsed.marginPct)
          ? Math.max(0, Math.min(1000, parsed.marginPct))
          : 0;
      return { priceRole, marginPct };
    }
  } catch {
    /* ignore */
  }
  // Sin margen: el único valor del archivo queda igual en costo y PVP.
  return { priceRole: defaultPriceRole(kind), marginPct: 0 };
}

export function storePricing(priceRole: ImportPriceRole, marginPct: number) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ priceRole, marginPct }));
  } catch {
    /* ignore */
  }
}
