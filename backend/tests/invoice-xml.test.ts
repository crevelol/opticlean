import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseFacturaXmlHeuristic,
  applyParsedInvoice,
} from '../src/domain/invoice-xml.service.js';
import type { AppState } from '../src/domain/types.js';

const SAMPLE = `<?xml version="1.0" encoding="UTF-8"?>
<autorizacion>
  <comprobante><![CDATA[
    <factura>
      <infoTributaria>
        <estab>001</estab>
        <ptoEmi>002</ptoEmi>
        <secuencial>000000123</secuencial>
        <claveAcceso>1234567890123456789012345678901234567890123456789</claveAcceso>
      </infoTributaria>
      <infoFactura>
        <fechaEmision>15/11/2026</fechaEmision>
        <razonSocialComprador>Distribuidora Norte SA</razonSocialComprador>
        <identificacionComprador>1792146739001</identificacionComprador>
        <direccionComprador>Av. Amazonas N34, Quito</direccionComprador>
      </infoFactura>
      <detalles>
        <detalle>
          <codigoPrincipal>DET-500</codigoPrincipal>
          <descripcion>Detergente industrial 5L</descripcion>
          <cantidad>3.00</cantidad>
          <precioUnitario>12.50</precioUnitario>
        </detalle>
        <detalle>
          <codigoPrincipal>JAB-100</codigoPrincipal>
          <descripcion>Jabón líquido 1L</descripcion>
          <cantidad>10</cantidad>
          <precioUnitario>2.15</precioUnitario>
        </detalle>
      </detalles>
    </factura>
  ]]></comprobante>
</autorizacion>`;

function emptyState(): AppState {
  return {
    products: [],
    lots: [],
    orders: [],
    clients: [],
    events: [],
    purchases: [],
    warehouses: [
      {
        id: 'WH-QT-01',
        code: 'QT-01',
        name: 'Bodega Quito',
        city: 'Quito',
        address: 'Centro',
        status: 'Operativa',
        racks: 4,
        layout: {
          rackCount: 4,
          levels: 4,
          positionsPerLevel: 6,
          capacityPerCell: 40,
          depthFaces: 1,
        },
      },
    ],
    receipts: [],
    settings: {
      company: 'Test',
      warehouse: 'Bodega Quito',
      operator: 'Ops',
      activeWarehouseId: 'WH-QT-01',
    },
    families: [],
    version: 2,
  };
}

describe('invoice xml', () => {
  it('parsea factura SRI con CDATA', () => {
    const inv = parseFacturaXmlHeuristic(SAMPLE);
    assert.equal(inv.buyerName, 'Distribuidora Norte SA');
    assert.equal(inv.buyerId, '1792146739001');
    assert.equal(inv.docNumber, '001-002-000000123');
    assert.equal(inv.lines.length, 2);
    assert.equal(inv.lines[0].code, 'DET-500');
    assert.equal(inv.lines[0].qty, 3);
    assert.equal(inv.source, 'heuristic');
  });

  it('crea cliente, productos y pedido', () => {
    const s = emptyState();
    const inv = parseFacturaXmlHeuristic(SAMPLE);
    const result = applyParsedInvoice(s, inv);
    assert.equal(result.orderId, '');
    assert.equal(result.clientCreated, true);
    assert.equal(result.productsCreated.length, 2);
    assert.equal(s.clients.length, 1);
    assert.equal(s.products.length, 2);
    assert.equal(s.orders.length, 0);
    assert.equal(s.lots.length, 0);
    assert.ok(result.blocked?.length);
  });
});
