import test from 'node:test';
import assert from 'node:assert/strict';
import { seed } from '../src/domain/seed.js';
import { getWarehouseGeometry } from '../src/domain/warehouse-layout.js';
import {
  stock,
  available,
  qtyAt,
  receive,
  move,
  createOrder,
  pickPlan,
  prepare,
  dispatch,
} from '../src/domain/inventory.service.js';
import { suggest } from '../src/domain/placement.service.js';

test('Every seeded location respects capacity and one-product storage', () => {
  const s = seed();
  const { locations } = getWarehouseGeometry(s);
  for (const loc of locations) {
    assert.ok(qtyAt(s, loc.id) <= loc.capacity);
    assert.ok(new Set(s.lots.filter((l) => l.loc === loc.id).map((l) => l.productId)).size <= 1);
  }
  for (const p of s.products) assert.ok(available(s, p.id) >= 0);
});

test('Receiving and transferring preserve product totals', () => {
  const s = seed();
  const before = stock(s, 'P015');
  const loc = suggest(s, 'P015', 12).find((item) => qtyAt(s, item.id) === 0);
  assert.ok(loc);
  receive(s, {
    productId: 'P015',
    qty: 12,
    loc: loc.id,
    batch: 'TEST-001',
    expiry: '2099-12-31',
    supplier: 'Test',
    reason: 'Inventario inicial',
  });
  assert.equal(stock(s, 'P015'), before + 12);
  const lot = s.lots.find((l) => l.batch === 'TEST-001')!;
  const dest = suggest(s, 'P015', 7, lot.loc).find((item) => qtyAt(s, item.id) === 0)?.id;
  assert.ok(dest);
  move(s, { lotId: lot.id, qty: 7, to: dest });
  assert.equal(stock(s, 'P015'), before + 12);
});

test('Orders aggregate duplicate lines and reserve stock', () => {
  const s = seed();
  const before = available(s, 'P015');
  const o = createOrder(s, {
    clientId: 'CL001',
    lines: [
      { productId: 'P015', qty: 2 },
      { productId: 'P015', qty: 3 },
    ],
  });
  assert.equal(o.lines.length, 1);
  assert.equal(o.lines[0].qty, 5);
  assert.equal(available(s, 'P015'), before - 5);
});

test('Picking uses earliest expiry', () => {
  const s = seed();
  const o = createOrder(s, { clientId: 'CL001', lines: [{ productId: 'P001', qty: 2 }] });
  const plan = pickPlan(s, o);
  const first = plan.find((l) => l.productId === 'P001')!;
  const earliest = s.lots
    .filter((l) => l.productId === 'P001')
    .sort((a, b) => a.expiry.localeCompare(b.expiry))[0];
  assert.equal(first.id, earliest.id);
  prepare(s, o.id);
  assert.equal(o.status, 'Preparado');
});
