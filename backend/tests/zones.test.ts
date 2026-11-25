import test from 'node:test';
import assert from 'node:assert/strict';
import { formatZonePath, vehicleAllowsZone, zonePathOf } from '../src/domain/zones.js';

test('Zone path builds province/city/sector hierarchy', () => {
  assert.equal(
    zonePathOf({ province: 'Pichincha', city: 'Quito', sector: 'Carcelén' }),
    'Pichincha / Quito / Carcelén',
  );
  assert.equal(formatZonePath(['Pichincha']), 'Pichincha');
});

test('Truck province covers all descendants', () => {
  assert.equal(vehicleAllowsZone(['Pichincha'], 'Pichincha / Quito / Carcelén'), true);
  assert.equal(vehicleAllowsZone(['Pichincha / Quito'], 'Pichincha / Quito / Norte'), true);
  assert.equal(vehicleAllowsZone(['Pichincha / Quito / Norte'], 'Pichincha / Quito / Carcelén'), false);
  assert.equal(vehicleAllowsZone(['Guayas'], 'Pichincha / Quito'), false);
});

test('Legacy flat sector still matches a level', () => {
  assert.equal(vehicleAllowsZone(['Carcelén'], 'Pichincha / Quito / Carcelén'), true);
  assert.equal(vehicleAllowsZone(['Carcelén'], 'Pichincha / Quito / Norte'), false);
});

test('Empty allowed zones means unrestricted', () => {
  assert.equal(vehicleAllowsZone([], 'Pichincha / Quito'), true);
  assert.equal(vehicleAllowsZone(undefined, 'Guayas / Guayaquil'), true);
});
