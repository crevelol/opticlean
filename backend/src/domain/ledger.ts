import type { AppState, SalesInvoice } from './types.js';

export const IVA_RATE = 0.15;
export const QUARANTINE_LOC = 'CUARENTENA';
export const TRANSIT_LOC = 'TRANSITO';

export const isSellableLoc = (loc: string) => loc !== QUARANTINE_LOC && loc !== TRANSIT_LOC;

export const roundMoney = (n: number) => Math.round(n * 100) / 100;

export function invoicedOrderIds(s: AppState) {
  return new Set(
    (s.invoices ?? []).filter((invoice) => invoice.status === 'Emitida').map((invoice) => invoice.orderId),
  );
}

export function invoiceBalance(s: AppState, invoiceId: string) {
  const invoice = (s.invoices ?? []).find((item) => item.id === invoiceId);
  if (!invoice || invoice.status !== 'Emitida') return 0;
  const credited = (s.creditNotes ?? [])
    .filter((note) => note.invoiceId === invoiceId && note.status === 'Emitida')
    .reduce((n, note) => n + note.total, 0);
  const paid = (s.customerPayments ?? [])
    .filter((payment) => payment.invoiceId === invoiceId)
    .reduce((n, payment) => n + payment.amount, 0);
  return roundMoney(Math.max(0, invoice.total - credited - paid));
}

export function outstandingReceivable(s: AppState, clientId: string) {
  return roundMoney(
    (s.invoices ?? [])
      .filter((invoice) => invoice.clientId === clientId && invoice.status === 'Emitida')
      .reduce((n, invoice) => n + invoiceBalance(s, invoice.id), 0),
  );
}

function addDays(iso: string, days: number) {
  const date = new Date(`${iso}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function overdueReceivable(s: AppState, clientId: string, today: string) {
  const terms = s.clients.find((client) => client.id === clientId)?.paymentTermsDays ?? 30;
  return roundMoney(
    (s.invoices ?? [])
      .filter((invoice) => invoice.clientId === clientId && invoice.status === 'Emitida')
      .filter((invoice) => addDays(invoice.date, terms) < today && invoiceBalance(s, invoice.id) > 0.009)
      .reduce((n, invoice) => n + invoiceBalance(s, invoice.id), 0),
  );
}

export function billBalance(s: AppState, billId: string) {
  const bill = (s.supplierBills ?? []).find((item) => item.id === billId);
  if (!bill) return 0;
  const paid = (s.supplierPayments ?? [])
    .filter((payment) => payment.billId === billId)
    .reduce((n, payment) => n + payment.amount, 0);
  return roundMoney(Math.max(0, bill.total - paid));
}

export function resolveUnitPrice(s: AppState, clientId: string, productId: string, qty: number) {
  const special = (s.clientPrices ?? []).find(
    (price) => price.clientId === clientId && price.productId === productId,
  );
  if (special && special.price >= 0) return special.price;
  const clientType = s.clients.find((client) => client.id === clientId)?.type ?? '';
  const breaks = (s.priceLists ?? [])
    .filter((list) => list.clientType === clientType)
    .flatMap((list) => list.items)
    .filter((item) => item.productId === productId && qty >= Math.max(1, item.minQty || 1))
    .sort((a, b) => b.minQty - a.minQty);
  if (breaks[0]) return breaks[0].price;
  return s.products.find((product) => product.id === productId)?.price ?? 0;
}

export function lineTotals(qty: number, unitPrice: number, ivaRate = IVA_RATE) {
  const subtotal = roundMoney(qty * unitPrice);
  const iva = roundMoney(subtotal * ivaRate);
  return { subtotal, iva, total: roundMoney(subtotal + iva) };
}

export function invoiceTotals(invoice: Pick<SalesInvoice, 'lines' | 'kits'>) {
  const parts = [
    ...invoice.lines.map((line) => lineTotals(line.qty, line.unitPrice, line.ivaRate)),
    ...(invoice.kits ?? []).map((kit) => lineTotals(kit.qty, kit.unitPrice, kit.ivaRate)),
  ];
  return {
    subtotal: roundMoney(parts.reduce((n, part) => n + part.subtotal, 0)),
    iva: roundMoney(parts.reduce((n, part) => n + part.iva, 0)),
    total: roundMoney(parts.reduce((n, part) => n + part.total, 0)),
  };
}

/** Clave de acceso de 49 dígitos para el comprobante interno. No está firmada ante el SRI. */
export function demoAccessKey(date: string, kind: '01' | '04' | '06', sequential: number) {
  const [year, month, day] = date.split('-');
  const fecha = `${day}${month}${year}`;
  const seq = String(sequential).padStart(9, '0');
  const numeric = String(10000000 + (sequential % 90000000)).padStart(8, '0');
  const body = `${fecha}${kind}17900100100011001001${seq}${numeric}1`;
  const sum = body.split('').reduce((n, char, index) => n + Number(char) * ((index % 6) + 2), 0);
  const check = (11 - (sum % 11)) % 10;
  return `${body}${check}`;
}
