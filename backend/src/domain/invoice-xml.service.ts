import type { AppState, Client, Product } from './types.js';
import {
  available,
  createOrder,
  product,
  uid,
  upsertProduct,
} from './inventory.service.js';
import { openaiConfigured } from './logistics-ai.service.js';

export type ParsedInvoiceLine = {
  code: string;
  name: string;
  qty: number;
  unitPrice: number;
  batch?: string;
  expiry?: string;
  packCode?: string;
};

export type ParsedInvoice = {
  buyerName: string;
  buyerId: string;
  buyerAddress: string;
  buyerEmail: string;
  sellerName?: string;
  sellerTaxId?: string;
  issueDate: string;
  accessKey: string;
  docNumber: string;
  lines: ParsedInvoiceLine[];
  source?: 'openai' | 'heuristic';
};

function tagText(xml: string, tag: string): string {
  const re = new RegExp(
    `<${tag}(?:\\s[^>]*)?>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${tag}>`,
    'i',
  );
  const m = xml.match(re);
  return m ? decodeXml(m[1].trim()) : '';
}

function decodeXml(s: string) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function stripNamespaces(xml: string) {
  return xml.replace(/(<\/?)([\w.-]+:)/g, '$1');
}

function unwrapComprobante(xml: string): string {
  const cleaned = stripNamespaces(xml.trim());
  const cdata = cleaned.match(/<comprobante[^>]*>\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*<\/comprobante>/i);
  if (cdata) return stripNamespaces(cdata[1].trim());
  const plain = cleaned.match(/<comprobante[^>]*>([\s\S]*?)<\/comprobante>/i);
  if (plain && /<(factura|Invoice|invoice|Comprobante|documento)[\s>]/i.test(plain[1])) {
    return stripNamespaces(plain[1].trim());
  }
  return cleaned;
}

function sanitizeCode(raw: string) {
  const code = raw
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return code || `SKU-${Date.now().toString(36).toUpperCase()}`;
}

function guessCity(address: string) {
  const cities = [
    'Quito',
    'Guayaquil',
    'Cuenca',
    'Ambato',
    'Manta',
    'Santo Domingo',
    'Loja',
    'Riobamba',
    'Ibarra',
    'Machala',
  ];
  const hit = cities.find((c) => address.toLowerCase().includes(c.toLowerCase()));
  return hit ?? 'Quito';
}

function parseQty(raw: string | number) {
  const n = typeof raw === 'number' ? raw : Number(String(raw).replace(',', '.'));
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.max(1, Math.round(n));
}

function parsePrice(raw: string | number) {
  const n = typeof raw === 'number' ? raw : Number(String(raw).replace(',', '.'));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : 0;
}

export function normalizeInvoice(
  raw: Partial<ParsedInvoice> & { lines?: Array<Partial<ParsedInvoiceLine>> },
  source: 'openai' | 'heuristic',
): ParsedInvoice {
  const lines: ParsedInvoiceLine[] = [];
  for (const line of raw.lines ?? []) {
    const name = String(line.name || line.code || 'Producto').slice(0, 120);
    const code = sanitizeCode(String(line.code || name.slice(0, 16)));
    const qty = parseQty(line.qty as string | number);
    const unitPrice = parsePrice(line.unitPrice as string | number);
    if (!qty) continue;
    const expiry = String(line.expiry || '').trim();
    const batch = String(line.batch || '').trim();
    lines.push({
      code,
      name,
      qty,
      unitPrice,
      ...(batch ? { batch } : {}),
      ...(expiry ? { expiry } : {}),
      ...(line.packCode ? { packCode: line.packCode } : {}),
    });
  }
  if (!lines.length) {
    throw new Error('La IA no encontró líneas de producto/costos en el documento.');
  }

  const buyerName = String(raw.buyerName || 'Cliente importado').slice(0, 120);
  const buyerId = String(raw.buyerId || '').replace(/\D/g, '');
  return {
    buyerName,
    buyerId,
    buyerAddress: String(raw.buyerAddress || 'Sin dirección').slice(0, 200),
    buyerEmail: String(raw.buyerEmail || '').slice(0, 120),
    sellerName: String(raw.sellerName || '').slice(0, 120),
    sellerTaxId: String(raw.sellerTaxId || '').replace(/\D/g, ''),
    issueDate: String(raw.issueDate || new Date().toISOString().slice(0, 10)).slice(0, 32),
    accessKey: String(raw.accessKey || '').slice(0, 80),
    docNumber: String(raw.docNumber || 'DOC').slice(0, 40),
    lines,
    source,
  };
}

/** Heurística rápida para factura electrónica Ecuador (SRI). */
export function parseFacturaXmlHeuristic(xmlRaw: string): ParsedInvoice {
  if (!xmlRaw?.trim()) throw new Error('El XML está vacío.');
  const xml = unwrapComprobante(xmlRaw);
  if (!/<factura[\s>]/i.test(xml) && !/<infoFactura[\s>]/i.test(xml)) {
    throw new Error('Formato no reconocido por el parser local.');
  }

  const buyerName =
    tagText(xml, 'razonSocialComprador') ||
    tagText(xml, 'nombreComprador') ||
    'Cliente XML';
  const buyerId =
    tagText(xml, 'identificacionComprador') ||
    tagText(xml, 'rucComprador') ||
    '';
  const buyerAddress = tagText(xml, 'direccionComprador') || 'Sin dirección';
  const buyerEmail = tagText(xml, 'email') || tagText(xml, 'correoComprador') || '';
  const sellerName = tagText(xml, 'razonSocial') || tagText(xml, 'nombreComercial') || '';
  const sellerTaxId = tagText(xml, 'ruc') || '';
  const issueDate = tagText(xml, 'fechaEmision') || new Date().toISOString().slice(0, 10);
  const accessKey = tagText(xml, 'claveAcceso');
  const estab = tagText(xml, 'estab');
  const ptoEmi = tagText(xml, 'ptoEmi');
  const secuencial = tagText(xml, 'secuencial');
  const docNumber =
    [estab, ptoEmi, secuencial].filter(Boolean).join('-') || accessKey.slice(0, 17) || 'XML';

  const detailBlocks = [...xml.matchAll(/<detalle>([\s\S]*?)<\/detalle>/gi)].map((m) => m[1]);
  if (!detailBlocks.length) throw new Error('La factura no tiene líneas de detalle.');

  const lines: ParsedInvoiceLine[] = [];
  for (const block of detailBlocks) {
    const code =
      tagText(block, 'codigoPrincipal') ||
      tagText(block, 'codigoInterno') ||
      tagText(block, 'codigoAuxiliar') ||
      '';
    const name = tagText(block, 'descripcion') || code || 'Producto';
    const qty = parseQty(tagText(block, 'cantidad'));
    const unitPrice = parsePrice(tagText(block, 'precioUnitario'));
    if (!qty) continue;
    const expiry = tagText(block, 'fechaCaducidad') || tagText(block, 'fechaVencimiento') || '';
    const batch = tagText(block, 'lote') || tagText(block, 'numeroLote') || '';
    const packCode = tagText(block, 'unidadMedida') || '';
    lines.push({
      code: sanitizeCode(code || name.slice(0, 16)),
      name: name.slice(0, 120),
      qty,
      unitPrice,
      ...(batch ? { batch } : {}),
      ...(expiry ? { expiry } : {}),
      ...(packCode ? { packCode } : {}),
    });
  }
  return normalizeInvoice(
    {
      buyerName,
      buyerId,
      buyerAddress,
      buyerEmail,
      sellerName,
      sellerTaxId,
      issueDate,
      accessKey,
      docNumber,
      lines,
    },
    'heuristic',
  );
}

async function parseFacturaXmlWithAi(xmlRaw: string): Promise<ParsedInvoice> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error('OPENAI_API_KEY no configurada');

  const baseUrl = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
  const model = process.env.OPENAI_MODEL || process.env.OPENAI_CHAT_MODEL || 'gpt-4o-mini';

  // Limitar tamaño para no saturar el contexto
  const xml = xmlRaw.trim().slice(0, 120_000);

  const system = `Eres un extractor de facturas para OPTICLEAN (Ecuador).
Lee el XML y saca COMPRADOR (cliente), PRODUCTOS y COSTOS (precio unitario).
Responde SOLO JSON:
{
  "buyerName":"razón social del comprador",
  "buyerId":"RUC/cédula solo dígitos",
  "buyerAddress":"dirección",
  "buyerEmail":"email si existe",
  "issueDate":"fecha emisión",
  "accessKey":"clave de acceso",
  "docNumber":"número de factura",
  "lines":[{"code":"sku","name":"descripción","qty":1,"unitPrice":0}]
}
Reglas: comprador ≠ emisor; qty>0; unitPrice numérico (si solo hay total, unitPrice=total/qty); no inventes líneas.`;

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        {
          role: 'user',
          content: `Extrae cliente, productos y costos de este XML:\n\n${xml}`,
        },
      ],
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`OpenAI ${res.status}: ${text.slice(0, 200) || res.statusText}`);
  }

  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error('La IA no devolvió contenido.');

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('La IA no devolvió JSON válido.');
    parsed = JSON.parse(match[0]);
  }

  return normalizeInvoice(parsed as Partial<ParsedInvoice>, 'openai');
}

/**
 * Parsea XML de factura:
 * 1) IA (extrae cliente, productos y costos)
 * 2) Fallback heurística SRI si la IA no está o falla
 */
export async function parseFacturaXml(xmlRaw: string): Promise<ParsedInvoice> {
  if (!xmlRaw?.trim()) throw new Error('El XML está vacío.');

  if (openaiConfigured()) {
    try {
      return await parseFacturaXmlWithAi(xmlRaw);
    } catch (e) {
      const aiErr = e instanceof Error ? e.message : 'Error de IA';
      try {
        return parseFacturaXmlHeuristic(xmlRaw);
      } catch (he) {
        const local = he instanceof Error ? he.message : 'Parser local falló';
        throw new Error(`No se pudo leer el XML. IA: ${aiErr}. Local: ${local}`);
      }
    }
  }

  return parseFacturaXmlHeuristic(xmlRaw);
}

function ensureClient(s: AppState, inv: ParsedInvoice): Client {
  const ruc = inv.buyerId;
  const nameKey = inv.buyerName.trim().toLowerCase();
  const byId = ruc
    ? s.clients.find((c) => c.id === `CL-${ruc}` || c.id === ruc || c.id.endsWith(ruc))
    : undefined;
  const byRucInContact = ruc
    ? s.clients.find((c) => c.contact.replace(/\D/g, '').includes(ruc))
    : undefined;
  const byName = nameKey
    ? s.clients.find((c) => c.name.trim().toLowerCase() === nameKey)
    : undefined;
  const existing = byId || byRucInContact || byName;
  if (existing) {
    // Relacionar / enriquecer cliente existente
    if (inv.buyerAddress && inv.buyerAddress !== 'Sin dirección') existing.address = inv.buyerAddress;
    if (inv.buyerEmail) existing.email = inv.buyerEmail;
    if (ruc && !existing.contact.replace(/\D/g, '').includes(ruc)) {
      existing.contact = existing.contact ? `${existing.contact} · ${ruc}` : ruc;
    }
    if (!existing.city) existing.city = guessCity(inv.buyerAddress);
    return existing;
  }
  // Crear cliente nuevo
  const client: Client = {
    id: ruc ? `CL-${ruc}` : uid('CL'),
    name: inv.buyerName,
    contact: ruc || inv.buyerName,
    address: inv.buyerAddress,
    email: inv.buyerEmail || `${(ruc || 'cliente').toLowerCase()}@import.local`,
    type: 'Mayorista',
    city: guessCity(inv.buyerAddress),
    sector: '',
    creditLimit: 3000,
  };
  s.clients.push(client);
  return client;
}

function ensureProduct(s: AppState, line: ParsedInvoiceLine): Product {
  const code = line.code.toUpperCase();
  const nameKey = line.name.trim().toLowerCase();
  const byId = product(s, line.code) || product(s, code);
  const bySku = s.products.find((p) => p.sku.toUpperCase() === code);
  const byName = nameKey
    ? s.products.find((p) => p.name.trim().toLowerCase() === nameKey && p.kind !== 'raw')
    : undefined;
  const existing = byId || bySku || byName;
  if (existing) {
    // Relacionar / actualizar costo y nombre
    if (line.unitPrice > 0) existing.price = line.unitPrice;
    if (line.name && existing.name !== line.name) existing.name = line.name;
    existing.kind = existing.kind === 'raw' ? 'finished' : existing.kind ?? 'finished';
    return existing;
  }
  // Crear producto nuevo con el costo que trajo la IA
  return upsertProduct(s, {
    id: line.code,
    sku: line.code,
    name: line.name,
    category: 'Importado',
    supplier: 'Documento importado',
    price: line.unitPrice || 1,
    min: 5,
    weight: 1,
    volume: 1,
    kind: 'finished',
    components: [],
  });
}

export type InvoiceImportResult = {
  orderId: string;
  clientId: string;
  clientCreated: boolean;
  productsCreated: string[];
  productsUpdated: string[];
  invoice: ParsedInvoice;
  source: 'openai' | 'heuristic';
  openai: boolean;
  /** Líneas que no se convirtieron en pedido porque no había stock real. */
  blocked?: string[];
};

export function applyParsedInvoice(s: AppState, invoice: ParsedInvoice): InvoiceImportResult {
  const beforeClients = new Set(s.clients.map((c) => c.id));
  const beforeProducts = new Set(s.products.map((p) => p.id));

  const cl = ensureClient(s, invoice);
  const clientCreated = !beforeClients.has(cl.id);

  const productsCreated: string[] = [];
  const productsUpdated: string[] = [];
  const lines: Array<{ productId: string; qty: number }> = [];

  for (const line of invoice.lines) {
    const p = ensureProduct(s, line);
    if (!beforeProducts.has(p.id) && !productsCreated.includes(p.id)) productsCreated.push(p.id);
    else if (!productsUpdated.includes(p.id) && !productsCreated.includes(p.id)) {
      productsUpdated.push(p.id);
    }
    lines.push({ productId: p.id, qty: line.qty });
  }

  const grouped = new Map<string, number>();
  for (const l of lines) grouped.set(l.productId, (grouped.get(l.productId) ?? 0) + l.qty);
  const orderLines = [...grouped.entries()].map(([productId, qty]) => ({ productId, qty }));

  if (!orderLines.length) {
    throw new Error('No hay productos para crear el pedido (la IA no devolvió líneas válidas).');
  }

  const source = invoice.source ?? 'heuristic';
  const blocked = orderLines
    .filter((line) => available(s, line.productId) < line.qty)
    .map(
      (line) =>
        `${product(s, line.productId)?.name ?? line.productId}: sin stock suficiente. No se inventó caducidad ni existencias.`,
    );
  if (blocked.length) {
    return {
      orderId: '',
      clientId: cl.id,
      clientCreated,
      productsCreated,
      productsUpdated,
      invoice,
      source,
      openai: openaiConfigured(),
      blocked,
    };
  }

  const notes = [
    `Importado por ${source === 'openai' ? 'IA' : 'parser local'} · ${invoice.docNumber}`,
    invoice.accessKey ? `Clave: ${invoice.accessKey}` : '',
    `Emisión: ${invoice.issueDate}`,
    clientCreated ? 'Cliente nuevo' : 'Cliente existente',
    productsCreated.length ? `${productsCreated.length} producto(s) nuevo(s)` : '',
    productsUpdated.length ? `${productsUpdated.length} producto(s) relacionado(s)` : '',
  ]
    .filter(Boolean)
    .join(' · ');

  const order = createOrder(s, {
    clientId: cl.id,
    lines: orderLines,
    priority: 'Normal',
    notes,
  });

  return {
    orderId: order.id,
    clientId: cl.id,
    clientCreated,
    productsCreated,
    productsUpdated,
    invoice,
    source,
    openai: openaiConfigured(),
  };
}

/** Parsea (heurística o IA) y crea cliente/productos/pedido. */
export async function importOrderFromInvoiceXml(
  s: AppState,
  xmlRaw: string,
): Promise<InvoiceImportResult> {
  const invoice = await parseFacturaXml(xmlRaw);
  return applyParsedInvoice(s, invoice);
}
