import test from 'node:test';
import assert from 'node:assert/strict';
import {
  estimateTransportCost,
  ruleUnitCost,
  summarizeVehicleCost,
} from '../src/domain/transport-cost.js';

test('Amortized tire rule becomes $/km', () => {
  const unit = ruleUnitCost({
    basis: 'per_km',
    calc: 'amortized',
    amount: 1200,
    lifeUnits: 50000,
  });
  assert.equal(unit, 0.024);
});

test('Vehicle cost sums per-km and per-trip rules', () => {
  const summary = summarizeVehicleCost(
    [
      {
        id: '1',
        name: 'Diésel',
        basis: 'per_km',
        calc: 'fixed',
        amount: 0.35,
        active: true,
      },
      {
        id: '2',
        name: 'Llantas',
        basis: 'per_km',
        calc: 'amortized',
        amount: 1200,
        lifeUnits: 50000,
        active: true,
      },
      {
        id: '3',
        name: 'Peaje',
        basis: 'per_trip',
        calc: 'fixed',
        amount: 4,
        active: true,
      },
    ],
    0.8,
  );
  assert.equal(summary.fromRules, true);
  assert.equal(summary.costPerKm, 0.374);
  assert.equal(summary.costPerTrip, 4);
  assert.equal(estimateTransportCost(100, summary), 41.4);
});

test('Without per-km rules falls back to vehicle costPerKm', () => {
  const summary = summarizeVehicleCost(
    [
      {
        id: '1',
        name: 'Peaje',
        basis: 'per_trip',
        calc: 'fixed',
        amount: 3,
        active: true,
      },
    ],
    0.8,
  );
  assert.equal(summary.fromRules, false);
  assert.equal(summary.costPerKm, 0.8);
  assert.equal(summary.costPerTrip, 3);
});
