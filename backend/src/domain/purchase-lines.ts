import type { Purchase, PurchaseLine } from './types.js';

export function ensurePurchaseLines(po: Purchase): PurchaseLine[] {
  if (po.lines?.length) return po.lines;
  const line: PurchaseLine = {
    productId: po.productId,
    qty: po.qty,
    packCode: 'unidad',
    unitsPerPack: 1,
    unitPrice: 0,
    receivedUnits: po.received ?? 0,
  };
  po.lines = [line];
  return po.lines;
}

export function orderedStockUnits(po: Purchase) {
  return ensurePurchaseLines(po).reduce((n, line) => n + line.qty * line.unitsPerPack, 0);
}

export function receivedStockUnits(po: Purchase) {
  return ensurePurchaseLines(po).reduce((n, line) => n + (line.receivedUnits ?? 0), 0);
}

export function refreshPurchase(po: Purchase) {
  const lines = ensurePurchaseLines(po);
  po.productId = lines[0]?.productId ?? po.productId;
  po.qty = orderedStockUnits(po);
  po.received = receivedStockUnits(po);
  if (po.status === 'Cancelada') return po;
  po.status = po.received >= po.qty && po.qty > 0 ? 'Recibida' : (po.received ?? 0) > 0 ? 'Parcial' : 'Abierta';
  return po;
}

export function pendingStockUnits(po: Purchase, productId?: string) {
  return ensurePurchaseLines(po)
    .filter((line) => !productId || line.productId === productId)
    .reduce((n, line) => n + line.qty * line.unitsPerPack - (line.receivedUnits ?? 0), 0);
}

export function applyPurchaseReceipt(po: Purchase, productId: string, stockQty: number) {
  if (po.status === 'Cancelada') throw new Error('La orden de compra está cancelada.');
  if (po.status === 'Recibida') throw new Error('La orden ya fue recibida por completo.');
  const lines = ensurePurchaseLines(po);
  const line = lines.find(
    (item) => item.productId === productId && item.qty * item.unitsPerPack - (item.receivedUnits ?? 0) > 0,
  );
  if (!line) {
    const known = lines.some((item) => item.productId === productId);
    throw new Error(
      known
        ? 'La orden ya fue recibida por completo para este producto.'
        : 'La orden de compra es de otro producto.',
    );
  }
  const pending = line.qty * line.unitsPerPack - (line.receivedUnits ?? 0);
  if (stockQty > pending) {
    throw new Error(`La cantidad supera lo pendiente de la orden (${pending} unidades).`);
  }
  line.receivedUnits = (line.receivedUnits ?? 0) + stockQty;
  refreshPurchase(po);
}
