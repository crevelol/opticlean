import type { AppState } from './types.js';
import { available, createOrder, product, upsertProduct } from './inventory.service.js';
import { createBackorderPurchases, createPurchase } from './commerce.service.js';
import {
  parseFacturaXmlHeuristic,
  type ParsedInvoice,
  type ParsedInvoiceLine,
} from './invoice-xml.service.js';
import { packsOf } from './packs.js';
import { createSupplier, findSupplier } from './suppliers.service.js';

export type ImportKind = 'purchase' | 'sale';

/** El valor del archivo/edición se interpreta como costo de compra o como PVP. */
export type ImportPriceRole = 'cost' | 'pvp';

export type ImportRow = {
  code: string;
  name: string;
  qty: number;
  packCode: string;
  unitPrice: number;
  batch: string;
  expiry: string;
  productId: string | null;
  status: 'matched' | 'new' | 'invalid';
  message: string;
};

function roundMoney(n: number) {
  return Math.round(Math.max(0, n) * 100) / 100;
}

/** Margen sobre costo: PVP = costo × (1 + margen%). */
export function deriveImportPrices(
  unitValue: number,
  role: ImportPriceRole,
  marginPct: number,
): { cost: number; pvp: number; marginPct: number } {
  const value = roundMoney(unitValue);
  const margin = Number.isFinite(marginPct) ? Math.max(0, Math.min(1000, marginPct)) : 0;
  if (role === 'cost') {
    return { cost: value, pvp: roundMoney(value * (1 + margin / 100)), marginPct: margin };
  }
  const cost = margin <= 0 ? value : roundMoney(value / (1 + margin / 100));
  return { cost, pvp: value, marginPct: margin };
}

export type ImportPreview = {
  kind: ImportKind;
  source: string;
  partyName: string;
  partyTaxId: string;
  partyAddress: string;
  docNumber: string;
  issueDate: string;
  rows: ImportRow[];
  warnings: string[];
};

export type ImportCommitRow = {
  code: string;
  name: string;
  qty: number;
  packCode?: string;
  unitPrice?: number;
  batch?: string;
  expiry?: string;
  productId?: string | null;
};

const HEADER_ALIASES: Record<string, string> = {
  codigo: 'code',
  codigoprincipal: 'code',
  sku: 'code',
  code: 'code',
  item: 'code',
  nombre: 'name',
  descripcion: 'name',
  producto: 'name',
  name: 'name',
  cantidad: 'qty',
  qty: 'qty',
  unidades: 'qty',
  empaque: 'pack',
  unidad: 'pack',
  unidadmedida: 'pack',
  pack: 'pack',
  precio: 'price',
  preciounitario: 'price',
  price: 'price',
  pvp: 'price',
  costo: 'price',
  cost: 'price',
  lote: 'batch',
  batch: 'batch',
  caducidad: 'expiry',
  vencimiento: 'expiry',
  expiry: 'expiry',
  fechacaducidad: 'expiry',
  cliente: 'party',
  proveedor: 'party',
  razonsocial: 'party',
  ruc: 'tax',
  identificacion: 'tax',
};

function fold(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

export function normalizeDate(raw: unknown): string {
  const text = String(raw ?? '').trim();
  if (!text) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const match = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (!match) return '';
  return `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`;
}

function parseQty(raw: unknown) {
  const n = Number(String(raw ?? '').replace(',', '.'));
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.max(1, Math.round(n));
}

function parsePrice(raw: unknown) {
  const n = Number(String(raw ?? '').replace(',', '.'));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : 0;
}

function packCodeFrom(raw: string) {
  const text = fold(raw);
  if (!text) return 'unidad';
  if (text.startsWith('bult') || text.startsWith('pallet')) return 'bulto';
  if (text.startsWith('caj')) return 'caja';
  if (text.startsWith('paq') || text.startsWith('pack')) return 'paquete';
  if (text.startsWith('und') || text.startsWith('uni') || text === 'u') return 'unidad';
  return 'unidad';
}

export function parseCsv(text: string): string[][] {
  const source = text.replace(/^\uFEFF/, '');
  const header = source.split(/\r?\n/, 1)[0] ?? '';
  const comma = (header.match(/,/g) ?? []).length;
  const semi = (header.match(/;/g) ?? []).length;
  const delimiter = semi > comma ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (quoted) {
      if (char === '"') {
        if (source[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else quoted = false;
      } else cell += char;
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === delimiter) {
      row.push(cell.trim());
      cell = '';
    } else if (char === '\n') {
      row.push(cell.trim());
      rows.push(row);
      row = [];
      cell = '';
    } else if (char !== '\r') cell += char;
  }
  if (cell.length || row.length) {
    row.push(cell.trim());
    rows.push(row);
  }
  return rows.filter((line) => line.some(Boolean));
}

function rowsFromTable(table: string[][], kind: ImportKind): Omit<ImportPreview, 'rows' | 'warnings' | 'source'> & { lines: Array<Record<string, string>> } {
  if (table.length < 2) throw new Error('El archivo necesita encabezados y al menos una línea.');
  const headers = table[0].map((header) => HEADER_ALIASES[fold(header)] ?? '');
  if (!headers.includes('code') && !headers.includes('name')) {
    throw new Error('No reconozco columnas de código o descripción. Usa codigo, descripcion, cantidad.');
  }
  const lines: Array<Record<string, string>> = [];
  let partyName = '';
  let partyTaxId = '';
  for (const cells of table.slice(1)) {
    const record: Record<string, string> = {};
    headers.forEach((key, index) => {
      if (key) record[key] = cells[index] ?? '';
    });
    if (!partyName && record.party) partyName = record.party;
    if (!partyTaxId && record.tax) partyTaxId = record.tax;
    if (!record.code && !record.name) continue;
    lines.push(record);
  }
  return {
    kind,
    partyName,
    partyTaxId,
    partyAddress: '',
    docNumber: '',
    issueDate: '',
    lines,
  };
}

function matchRow(s: AppState, line: {
  code: string;
  name: string;
  qty: number;
  packCode: string;
  unitPrice: number;
  batch: string;
  expiry: string;
}): ImportRow {
  if (!line.qty) {
    return { ...line, productId: null, status: 'invalid', message: 'Cantidad inválida.' };
  }
  const code = line.code.toUpperCase();
  const found =
    product(s, code) ??
    s.products.find((item) => item.sku.toUpperCase() === code) ??
    s.products.find((item) => item.name.toLowerCase() === line.name.toLowerCase());
  const packKnown = !found || packsOf(found).some((pack) => pack.code === line.packCode);
  return {
    ...line,
    productId: found?.id ?? null,
    status: found ? 'matched' : 'new',
    message: [
      found ? 'Producto encontrado.' : 'Se creará el producto al confirmar. No se inventa stock ni caducidad.',
      line.expiry ? '' : 'Sin caducidad en el archivo: se pedirá al recibir.',
      packKnown ? '' : `El empaque ${line.packCode} no está en la ficha; se usará unidad.`,
    ]
      .filter(Boolean)
      .join(' '),
  };
}

export function previewTabular(s: AppState, table: string[][], kind: ImportKind, source: string): ImportPreview {
  const parsed = rowsFromTable(table, kind);
  const rows = parsed.lines.map((line) =>
    matchRow(s, {
      code: (line.code || line.name || '').slice(0, 32),
      name: (line.name || line.code || 'Producto').slice(0, 120),
      qty: parseQty(line.qty),
      packCode: packCodeFrom(line.pack || ''),
      unitPrice: parsePrice(line.price),
      batch: (line.batch || '').trim(),
      expiry: normalizeDate(line.expiry),
    }),
  );
  const warnings = [
    ...rows
      .filter((row) => !row.expiry)
      .map(
        (row) =>
          `${row.code}: sin caducidad en el archivo (opcional; no es necesario). No se inventó una fecha.`,
      ),
    ...stockWarnings(s, kind, rows),
  ];
  return { ...parsed, source, rows, warnings };
}

export function previewCsv(s: AppState, text: string, kind: ImportKind): ImportPreview {
  return previewTabular(s, parseCsv(text), kind, 'csv');
}

export async function previewXlsx(s: AppState, base64: string, kind: ImportKind): Promise<ImportPreview> {
  const XLSX = await import('xlsx');
  const book = XLSX.read(Buffer.from(base64, 'base64'), { type: 'buffer' });
  const sheet = book.Sheets[book.SheetNames[0]];
  if (!sheet) throw new Error('El Excel no tiene hojas.');
  const table = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' }) as string[][];
  return previewTabular(
    s,
    table.map((row) => row.map((cell) => String(cell ?? ''))),
    kind,
    'xlsx',
  );
}

/** Vista previa a partir de una factura ya parseada (XML/IA). No crea pedido. */
export function previewFromInvoice(
  s: AppState,
  invoice: ParsedInvoice,
  kind: ImportKind,
  source: string,
): ImportPreview {
  const partyName =
    kind === 'purchase' ? invoice.sellerName || invoice.buyerName : invoice.buyerName;
  const partyTaxId = kind === 'purchase' ? invoice.sellerTaxId || '' : invoice.buyerId;
  const rows = invoice.lines.map((line) =>
    matchRow(s, {
      code: line.code,
      name: line.name,
      qty: line.qty,
      packCode: packCodeFrom(line.packCode || ''),
      unitPrice: line.unitPrice,
      batch: line.batch || '',
      expiry: normalizeDate(line.expiry),
    }),
  );
  const warnings = [
    ...rows
      .filter((row) => !row.expiry)
      .map(
        (row) =>
          `${row.code}: sin caducidad en el archivo (opcional; no es necesario). No se inventó una fecha.`,
      ),
    ...stockWarnings(s, kind, rows),
  ];
  return {
    kind,
    source,
    partyName,
    partyTaxId,
    partyAddress: kind === 'sale' ? invoice.buyerAddress : '',
    docNumber: invoice.docNumber,
    issueDate: normalizeDate(invoice.issueDate) || invoice.issueDate,
    rows,
    warnings,
  };
}

function stockWarnings(s: AppState, kind: ImportKind, rows: ImportRow[]) {
  if (kind !== 'sale') return [];
  const out: string[] = [];
  for (const row of rows) {
    if (row.status === 'invalid' || row.qty <= 0) continue;
    const have = row.productId ? available(s, row.productId) : 0;
    if (have < row.qty) {
      const missing = row.qty - Math.max(have, 0);
      out.push(
        row.productId
          ? `${row.code}: faltan ${missing} u. en stock. El pedido se crea igual y queda «Esperando stock».`
          : `${row.code}: producto nuevo sin stock. Se crea en inventario al confirmar; el pedido queda «Esperando stock».`,
      );
    }
  }
  return out;
}

export function previewXml(s: AppState, xml: string, kind: ImportKind): ImportPreview {
  return previewFromInvoice(s, parseFacturaXmlHeuristic(xml), kind, 'xml');
}

function ensureImportedProduct(
  s: AppState,
  row: ImportCommitRow,
  supplierName: string,
  pricing: { role: ImportPriceRole; marginPct: number },
) {
  const code = row.code.trim().toUpperCase();
  const existing =
    (row.productId ? product(s, row.productId) : undefined) ??
    product(s, code) ??
    s.products.find((item) => item.sku.toUpperCase() === code);
  const raw = Number(row.unitPrice ?? 0);
  const { cost, pvp } = deriveImportPrices(
    Number.isFinite(raw) ? raw : 0,
    pricing.role,
    pricing.marginPct,
  );
  if (existing) {
    if (pvp > 0) existing.price = pvp;
    if (cost > 0) existing.avgCost = cost;
    return existing;
  }
  return upsertProduct(s, {
    id: code,
    sku: code,
    name: row.name || code,
    category: 'Importado',
    supplier: supplierName || 'Importado',
    price: pvp > 0 ? pvp : 1,
    avgCost: cost > 0 ? cost : undefined,
    min: 1,
    weight: 1,
    volume: 1,
    kind: 'finished',
    components: [],
    hazardClass: 'none',
  });
}

export function commitImport(
  s: AppState,
  body: {
    kind: ImportKind;
    partyName: string;
    partyTaxId?: string;
    partyAddress?: string;
    docNumber?: string;
    issueDate?: string;
    /** Interpreta `unitPrice` de cada fila como costo o como PVP. */
    priceRole?: ImportPriceRole;
    /** Margen % sobre costo para derivar el otro valor. */
    marginPct?: number;
    rows: ImportCommitRow[];
  },
) {
  const rows = body.rows.filter((row) => row.qty > 0 && (row.code || row.name));
  if (!rows.length) throw new Error('No hay líneas válidas para importar.');
  const missingExpiry = rows.filter((row) => row.expiry && !normalizeDate(row.expiry));
  if (missingExpiry.length) throw new Error('Hay una caducidad con formato inválido. Usa AAAA-MM-DD.');

  const priceRole: ImportPriceRole = body.priceRole === 'cost' || body.priceRole === 'pvp'
    ? body.priceRole
    : body.kind === 'purchase'
      ? 'cost'
      : 'pvp';
  // Sin margen enviado: el valor del archivo queda igual en costo y PVP.
  const marginPct = Number.isFinite(Number(body.marginPct)) ? Number(body.marginPct) : 0;
  const pricing = { role: priceRole, marginPct };

  if (body.kind === 'purchase') {
    const name = body.partyName?.trim();
    if (!name) throw new Error('Indica el proveedor del documento.');
    let supplier = findSupplier(s, name, body.partyTaxId ?? '');
    if (!supplier) {
      supplier = createSupplier(s, { name, taxId: body.partyTaxId ?? '', contact: '', email: '', phone: '', leadTimeDays: 7, terms: '' });
    }
    const purchase = createPurchase(s, {
      supplierId: supplier.id,
      date: normalizeDate(body.issueDate) || new Date().toISOString().slice(0, 10),
      notes: body.docNumber ? `Importado ${body.docNumber}` : 'Importado desde archivo',
      lines: rows.map((row) => {
        const item = ensureImportedProduct(s, row, supplier.name, pricing);
        const wanted = row.packCode || 'unidad';
        const packCode = packsOf(item).some((pack) => pack.code === wanted) ? wanted : 'unidad';
        const { cost } = deriveImportPrices(Number(row.unitPrice ?? 0), pricing.role, pricing.marginPct);
        return {
          productId: item.id,
          qty: row.qty,
          packCode,
          unitPrice: cost,
          batch: row.batch,
          expiry: normalizeDate(row.expiry),
        };
      }),
    });
    return { kind: 'purchase' as const, purchaseId: purchase.id, orderId: '' };
  }

  const clientName = body.partyName?.trim();
  if (!clientName) throw new Error('Indica el cliente del documento.');
  const tax = (body.partyTaxId ?? '').replace(/\D/g, '');
  const taxOk = /^\d{13}$/.test(tax);
  let client = s.clients.find((item) => item.name.toLowerCase() === clientName.toLowerCase());
  if (!client && tax) {
    client = s.clients.find(
      (item) => item.taxId === tax || item.contact.replace(/\D/g, '') === tax || item.id.includes(tax),
    );
  }
  if (!client) {
    client = {
      id: tax ? `CL-${tax}` : `CL-${Date.now().toString(36)}`,
      name: clientName,
      contact: body.partyTaxId || clientName,
      address: body.partyAddress || 'Sin dirección',
      email: 'importado@cliente.local',
      type: 'Mayorista',
      creditLimit: 3000,
      ...(taxOk ? { taxId: tax } : {}),
    };
    s.clients.push(client);
  } else if (taxOk && !client.taxId && !s.clients.some((item) => item.taxId === tax)) {
    client.taxId = tax;
  }
  const lines = rows.map((row) => {
    const item = ensureImportedProduct(s, row, 'Importado', pricing);
    return { productId: item.id, qty: row.qty };
  });
  const order = createOrder(s, {
    clientId: client.id,
    lines,
    notes: body.docNumber ? `Importado ${body.docNumber}` : 'Importado desde archivo',
    backorder: true,
  });
  if (order.status === 'Esperando stock') {
    createBackorderPurchases(s, order);
  }
  return {
    kind: 'sale' as const,
    purchaseId: order.purchaseIds?.[0] ?? '',
    orderId: order.id,
    status: order.status,
    shortages: order.shortages ?? [],
  };
}

export function lineLooksDated(line: ParsedInvoiceLine) {
  return Boolean(line.expiry || line.batch);
}
