import { client, product, stock, todayEc } from '../../shared/lib/inventory';
import type { AppState } from '../../shared/types';
import type { ReportPeriod } from './reportsModel';

export type AbcClass = 'A' | 'B' | 'C';

export type ProductManagementRow = {
  productId: string;
  name: string;
  unitsSold: number;
  revenue: number;
  cost: number;
  margin: number;
  marginPct: number | null;
  stock: number;
  /** Días que dura el stock al ritmo de venta del periodo. */
  daysOfInventory: number | null;
  /** Vueltas de inventario por año al ritmo del periodo. */
  turnover: number | null;
  abc: AbcClass;
};

export type ClientMarginRow = {
  clientId: string;
  name: string;
  invoices: number;
  revenue: number;
  cost: number;
  margin: number;
  marginPct: number | null;
};

const round = (n: number) => Math.round(n * 100) / 100;

/**
 * Indicadores de gestión desde las facturas emitidas del periodo:
 * margen (precio − costo al facturar), rotación, días de inventario y ABC por ventas.
 */
export function buildManagement(state: AppState, period: ReportPeriod) {
  const today = todayEc();
  const invoices = (state.invoices ?? []).filter((inv) => inv.status === 'Emitida');
  const from =
    period === 'all'
      ? invoices.map((inv) => inv.date).sort()[0] ?? today
      : new Date(Date.parse(`${today}T12:00:00Z`) - (period - 1) * 864e5).toISOString().slice(0, 10);
  const inPeriod = invoices.filter((inv) => inv.date >= from);
  const days = Math.max(1, Math.round((Date.parse(`${today}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 864e5) + 1);

  const byProduct = new Map<string, { units: number; revenue: number; cost: number; costKnown: boolean }>();
  const byClient = new Map<string, { invoices: number; revenue: number; cost: number }>();
  let missingCostLines = 0;
  for (const inv of inPeriod) {
    const c = byClient.get(inv.clientId) ?? { invoices: 0, revenue: 0, cost: 0 };
    c.invoices += 1;
    for (const line of inv.lines) {
      const unitCost = line.unitCost ?? product(state, line.productId)?.avgCost;
      if (unitCost == null) missingCostLines += 1;
      const revenue = line.qty * line.unitPrice;
      const cost = line.qty * (unitCost ?? 0);
      const p = byProduct.get(line.productId) ?? { units: 0, revenue: 0, cost: 0, costKnown: true };
      p.units += line.qty;
      p.revenue += revenue;
      p.cost += cost;
      if (unitCost == null) p.costKnown = false;
      byProduct.set(line.productId, p);
      c.revenue += revenue;
      c.cost += cost;
    }
    byClient.set(inv.clientId, c);
  }

  const totalRevenue = [...byProduct.values()].reduce((n, p) => n + p.revenue, 0);
  const sorted = [...byProduct.entries()].sort((a, b) => b[1].revenue - a[1].revenue);
  let running = 0;
  const abcOf = new Map<string, AbcClass>();
  for (const [id, p] of sorted) {
    const share = totalRevenue > 0 ? running / totalRevenue : 1;
    abcOf.set(id, share < 0.8 ? 'A' : share < 0.95 ? 'B' : 'C');
    running += p.revenue;
  }

  const products: ProductManagementRow[] = state.products
    .filter((p) => p.kind !== 'raw')
    .map((p) => {
      const sale = byProduct.get(p.id);
      const units = sale?.units ?? 0;
      const onHand = stock(state, p.id);
      const daily = units / days;
      const revenue = round(sale?.revenue ?? 0);
      const cost = round(sale?.cost ?? 0);
      const margin = round(revenue - cost);
      return {
        productId: p.id,
        name: p.name,
        unitsSold: units,
        revenue,
        cost,
        margin,
        marginPct: revenue > 0 && sale?.costKnown ? Math.round((margin / revenue) * 1000) / 10 : null,
        stock: onHand,
        daysOfInventory: daily > 0 ? Math.round(onHand / daily) : null,
        turnover: onHand > 0 && units > 0 ? Math.round(((units / days) * 365 / onHand) * 10) / 10 : null,
        abc: abcOf.get(p.id) ?? 'C',
      };
    })
    .sort((a, b) => b.revenue - a.revenue || a.name.localeCompare(b.name));

  const clients: ClientMarginRow[] = [...byClient.entries()]
    .map(([clientId, c]) => {
      const revenue = round(c.revenue);
      const margin = round(c.revenue - c.cost);
      return {
        clientId,
        name: client(state, clientId)?.name ?? clientId,
        invoices: c.invoices,
        revenue,
        cost: round(c.cost),
        margin,
        marginPct: revenue > 0 ? Math.round((margin / revenue) * 1000) / 10 : null,
      };
    })
    .sort((a, b) => b.margin - a.margin);

  const totalCost = [...byProduct.values()].reduce((n, p) => n + p.cost, 0);
  const abcCount = { A: 0, B: 0, C: 0 } as Record<AbcClass, number>;
  for (const row of products) if (row.unitsSold > 0) abcCount[row.abc] += 1;
  const slow = products.filter((p) => p.stock > 0 && p.unitsSold === 0).length;

  const insight = !inPeriod.length
    ? 'Sin facturas emitidas en el periodo: los indicadores de margen y rotación se calculan sobre ventas facturadas.'
    : `Margen bruto ${totalRevenue > 0 ? Math.round(((totalRevenue - totalCost) / totalRevenue) * 1000) / 10 : 0} % sobre ${round(totalRevenue).toFixed(2)} USD facturados. ${abcCount.A} producto(s) clase A concentran el 80 % de la venta${slow ? `; ${slow} producto(s) con stock no se vendieron en el periodo` : ''}.`;

  return {
    from,
    days,
    invoices: inPeriod.length,
    revenue: round(totalRevenue),
    cost: round(totalCost),
    margin: round(totalRevenue - totalCost),
    marginPct: totalRevenue > 0 ? Math.round(((totalRevenue - totalCost) / totalRevenue) * 1000) / 10 : null,
    missingCostLines,
    abcCount,
    slow,
    products,
    clients,
    insight,
  };
}
