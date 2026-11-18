import { PDFParse } from 'pdf-parse';
import mammoth from 'mammoth';
import { openaiConfigured } from './logistics-ai.service.js';
import {
  normalizeInvoice,
  parseFacturaXmlHeuristic,
  type ParsedInvoice,
} from './invoice-xml.service.js';

export type InvoiceFileKind = 'xml' | 'pdf' | 'docx' | 'doc';

type AiContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

export function detectInvoiceFileKind(fileName: string, mimeType = ''): InvoiceFileKind {
  const name = fileName.trim().toLowerCase();
  const mime = mimeType.trim().toLowerCase();
  if (name.endsWith('.xml') || mime.includes('xml')) return 'xml';
  if (name.endsWith('.pdf') || mime === 'application/pdf') return 'pdf';
  if (
    name.endsWith('.docx') ||
    mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  )
    return 'docx';
  if (name.endsWith('.doc') || mime === 'application/msword') return 'doc';
  throw new Error('Formato no soportado. Usa XML, PDF o Word (.docx).');
}

async function extractPdfText(buf: Buffer): Promise<string> {
  const parser = new PDFParse({ data: buf });
  try {
    const result = await parser.getText();
    return String(result?.text ?? '').trim();
  } finally {
    await parser.destroy().catch(() => undefined);
  }
}

async function extractPdfPageImages(buf: Buffer, maxPages = 3): Promise<string[]> {
  const parser = new PDFParse({ data: buf });
  try {
    const shot = await parser.getScreenshot({
      first: maxPages,
      imageDataUrl: true,
      scale: 1.5,
    });
    return (shot.pages ?? [])
      .map((p) => String(p.dataUrl || '').trim())
      .filter((u) => u.startsWith('data:image'));
  } finally {
    await parser.destroy().catch(() => undefined);
  }
}

async function extractDocxText(buf: Buffer): Promise<string> {
  const result = await mammoth.extractRawText({ buffer: buf });
  return String(result?.value ?? '').trim();
}

const EXTRACTION_SYSTEM = `Eres un extractor de facturas/órdenes de compra/comprobantes para OPTICLEAN (Ecuador).
Tu ÚNICA tarea es leer el documento y devolver JSON con el COMPRADOR (cliente), los PRODUCTOS y sus COSTOS.
No inventes datos que no estén en el documento.

Responde SOLO JSON válido:
{
  "buyerName":"razón social o nombre del comprador/cliente",
  "buyerId":"RUC/cédula/NIT (solo dígitos si es posible)",
  "buyerAddress":"dirección del comprador",
  "buyerEmail":"email si existe",
  "issueDate":"fecha de emisión (YYYY-MM-DD si puedes)",
  "accessKey":"clave de acceso u otro id del documento",
  "docNumber":"número de factura o serie-secuencial",
  "lines":[
    {"code":"sku o código","name":"descripción del producto","qty":1,"unitPrice":0}
  ]
}

Reglas estrictas:
- El comprador es quien RECIBE/COMPRA (no el emisor/vendedor).
- Cada línea debe traer qty > 0 y unitPrice (precio unitario). Si solo hay total de línea, calcula unitPrice = total/qty.
- code: usa el código/SKU del ítem; si no hay, genera uno corto estable a partir del nombre (mayúsculas, sin espacios raros).
- Incluye TODAS las líneas de productos/servicios del documento.
- No inventes productos. Si no hay líneas claras, lines=[].
- buyerName vacío no es válido: usa el nombre que aparezca como cliente/comprador.`;

async function extractInvoiceWithAi(parts: AiContentPart[]): Promise<ParsedInvoice> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error('OPENAI_API_KEY no configurada');

  const baseUrl = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
  const model = process.env.OPENAI_MODEL || process.env.OPENAI_CHAT_MODEL || 'gpt-4o-mini';

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
        { role: 'system', content: EXTRACTION_SYSTEM },
        { role: 'user', content: parts },
      ],
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`OpenAI ${res.status}: ${errText.slice(0, 200) || res.statusText}`);
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
 * Flujo:
 * 1) La IA lee el documento → cliente, productos y costos.
 * 2) (Fuera de aquí) se crean/relacionan cliente y productos y se genera el pedido.
 */
export async function parseInvoiceDocument(
  buf: Buffer,
  fileName: string,
  mimeType = '',
): Promise<ParsedInvoice> {
  const kind = detectInvoiceFileKind(fileName, mimeType);

  if (kind === 'doc') {
    throw new Error(
      'El formato .doc antiguo no está soportado. Guarda como .docx o PDF, o usa XML.',
    );
  }

  if (!openaiConfigured()) {
    // Solo XML puede caer a parser local sin IA
    if (kind === 'xml') return parseFacturaXmlHeuristic(buf.toString('utf8'));
    throw new Error(
      'Para leer PDF/Word se necesita OPENAI_API_KEY: la IA extrae cliente, productos y costos.',
    );
  }

  const parts: AiContentPart[] = [];

  if (kind === 'xml') {
    const xml = buf.toString('utf8').trim().slice(0, 120_000);
    if (!xml) throw new Error('El XML está vacío.');
    parts.push({
      type: 'text',
      text: `Documento XML de factura. Extrae cliente (comprador), productos y precios unitarios:\n\n${xml}`,
    });
  } else if (kind === 'docx') {
    const text = await extractDocxText(buf);
    if (!text) throw new Error('El Word no tiene texto legible.');
    parts.push({
      type: 'text',
      text: `Documento Word (.docx). Extrae cliente (comprador), productos y precios unitarios:\n\n${text.slice(0, 120_000)}`,
    });
  } else {
    // PDF: texto +, si hace falta, páginas como imagen para la IA
    const text = await extractPdfText(buf);
    if (text.length >= 80) {
      parts.push({
        type: 'text',
        text: `Documento PDF. Extrae cliente (comprador), productos y precios unitarios:\n\n${text.slice(0, 120_000)}`,
      });
    } else {
      const images = await extractPdfPageImages(buf, 3);
      if (!images.length && !text) {
        throw new Error('No se pudo leer el PDF (sin texto ni páginas renderizables).');
      }
      parts.push({
        type: 'text',
        text: text
          ? `PDF con poco texto. Usa también las imágenes de página. Texto parcial:\n${text.slice(0, 4000)}`
          : 'PDF escaneado o sin texto. Lee las imágenes de las páginas y extrae cliente, productos y precios unitarios.',
      });
      for (const url of images) {
        parts.push({ type: 'image_url', image_url: { url } });
      }
    }
  }

  try {
    return await extractInvoiceWithAi(parts);
  } catch (aiErr) {
    // Fallback local solo para XML SRI si la IA falla
    if (kind === 'xml') {
      try {
        return parseFacturaXmlHeuristic(buf.toString('utf8'));
      } catch {
        /* ignore */
      }
    }
    throw aiErr instanceof Error
      ? aiErr
      : new Error('La IA no pudo interpretar el documento.');
  }
}
