import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Server } from 'node:http';

// Todo el estado (empresas, usuarios, datos) vive en una carpeta temporal.
const dataDir = await mkdtemp(path.join(tmpdir(), 'opticlean-http-'));
process.env.OPTICLEAN_DATA_DIR = dataDir;
process.env.OPTICLEAN_DEMO_PASSWORD = 'OptiClean2026!';
delete process.env.AUTH_SERVICE_URL;
delete process.env.OPTICLEAN_AUTH_SERVICE_URL;
process.env.NODE_ENV = 'test';

const { createApp } = await import('../src/infrastructure/http/app.js');
const { PostgresStateRepository } = await import('../src/infrastructure/persistence/PostgresStateRepository.js');
const { JsonStateRepository } = await import('../src/infrastructure/persistence/JsonStateRepository.js');
const { prepareAuth } = await import('../src/infrastructure/auth/auth.js');
const { getAdminDb } = await import('../src/infrastructure/db/adminDb.js');

let server: Server;
let pgPool: import('pg').Pool | undefined;
let base = '';
const tokens: Record<string, string> = {};

type Json = Record<string, any>;
async function call(method: string, url: string, who?: string, body?: unknown) {
  const res = await fetch(base + url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(who && tokens[who] ? { Authorization: `Bearer ${tokens[who]}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as Json;
  return { status: res.status, json };
}

async function login(who: string, email: string, password = 'OptiClean2026!') {
  const res = await call('POST', '/api/auth/login', undefined, { email, password });
  assert.equal(res.status, 200, `login ${email}: ${JSON.stringify(res.json)}`);
  tokens[who] = res.json.token;
}

before(async () => {
  prepareAuth();
  getAdminDb();
  // Con TEST_DATABASE_URL la misma batería corre contra PostgreSQL (base vacía y desechable).
  const pgUrl = process.env.TEST_DATABASE_URL?.trim();
  if (pgUrl) {
    pgPool = new (await import('pg')).default.Pool({ connectionString: pgUrl });
    await pgPool.query('DROP TABLE IF EXISTS app_state, app_state_backup');
  }
  const app = createApp(pgPool ? new PostgresStateRepository(pgPool) : new JsonStateRepository(dataDir));
  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', () => resolve());
  });
  const address = server.address();
  base = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;
  await login('admin', 'admin@innovamf.com');
  await login('ops', 'bodega@innovamf.com');
  await login('dispatch', 'despacho@innovamf.com');
  await login('driver', 'conductor@innovamf.com');
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  try {
    getAdminDb().close();
  } catch {
    /* ya cerrada */
  }
  await pgPool?.end();
  await rm(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }).catch(() => undefined);
});

test('API: health es público y el resto exige sesión', async () => {
  assert.equal((await call('GET', '/api/health')).status, 200);
  assert.equal((await call('GET', '/api/state')).status, 401);
  assert.equal(
    (await call('POST', '/api/auth/login', undefined, { email: 'admin@innovamf.com', password: 'mala' })).status,
    401,
  );
});

test('API: bodega no cambia la flota ni ve sus costos; despacho sí', async () => {
  const plate = { plate: 'ZZZ-0001', label: 'Camión de prueba' };
  assert.equal((await call('POST', '/api/fleet', 'ops', plate)).status, 403);
  assert.equal((await call('POST', '/api/fleet', 'driver', plate)).status, 403);
  assert.equal((await call('GET', '/api/fleet/manage', 'ops')).status, 403);
  assert.equal((await call('GET', '/api/fleet/manage', 'driver')).status, 403);
  assert.equal((await call('GET', '/api/fleet/manage', 'dispatch')).status, 200);
  // Todos los roles ven los camiones para operar.
  for (const who of ['ops', 'dispatch', 'driver']) {
    assert.equal((await call('GET', '/api/fleet', who)).status, 200, who);
  }
});

test('API: el conductor no abre compras, facturas ni clientes', async () => {
  assert.equal((await call('POST', '/api/purchases', 'driver', {})).status, 403);
  assert.equal((await call('POST', '/api/invoices', 'driver', { orderId: 'x' })).status, 403);
  assert.equal((await call('POST', '/api/clients', 'driver', {})).status, 403);
});

test('API: solo administración factura, aprueba y reinicia', async () => {
  for (const who of ['ops', 'dispatch', 'driver']) {
    assert.equal((await call('POST', '/api/invoices', who, { orderId: 'x' })).status, 403, `invoices ${who}`);
    assert.equal((await call('POST', '/api/state/reset', who)).status, 403, `reset ${who}`);
    assert.equal((await call('POST', '/api/adjustments/ADJ-1/approve', who)).status, 403, `approve ${who}`);
  }
});

test('API: la consulta de flota no cruza empresas', async () => {
  const own = await call('GET', '/api/fleet', 'dispatch');
  const spoof = await call('GET', '/api/fleet?companyId=otra-empresa', 'dispatch');
  assert.equal(spoof.status, 200);
  assert.deepEqual(spoof.json, own.json);
});

test('API: cada empresa nueva arranca vacía y aislada', async () => {
  const signup = await call('POST', '/api/auth/signup', undefined, {
    companyName: 'Empresa Aislada',
    name: 'Dueña',
    email: 'duena@aislada.test',
    password: 'una-clave-larga-123',
  });
  assert.equal(signup.status, 201, JSON.stringify(signup.json));
  tokens.other = signup.json.token;
  const state = await call('GET', '/api/state', 'other');
  assert.equal(state.status, 200);
  assert.equal((state.json.state ?? state.json).products.length, 0);
  const mine = await call('GET', '/api/state', 'admin');
  assert.ok((mine.json.state ?? mine.json).products.length > 0);
});

test('API: clientes — eliminar solo admin y solo sin historial', async () => {
  const body = {
    name: 'Cliente HTTP',
    contact: 'Marta',
    address: 'Av. Test 123',
    email: 'marta@cliente.test',
    type: 'Oficina',
    taxId: '1790088888001',
  };
  const created = await call('POST', '/api/clients', 'admin', body);
  assert.equal(created.status, 200, JSON.stringify(created.json));
  const clients: Array<{ id: string; name: string }> = created.json.state.clients;
  const id = clients.find((c) => c.name === body.name)!.id;
  assert.equal((await call('DELETE', `/api/clients/${id}`, 'ops')).status, 403);
  assert.equal((await call('DELETE', `/api/clients/${id}`, 'admin')).status, 200);
  const withOrders = (await call('GET', '/api/state', 'admin')).json.state.orders[0].clientId;
  const blocked = await call('DELETE', `/api/clients/${withOrders}`, 'admin');
  assert.equal(blocked.status, 400);
  assert.match(blocked.json.error, /pedidos/);
});

test('API: editar una orden de compra abierta', async () => {
  const state = (await call('GET', '/api/state', 'admin')).json.state;
  const product = state.products[0];
  const created = await call('POST', '/api/purchases', 'ops', {
    lines: [{ productId: product.id, qty: 4, packCode: 'unidad', unitPrice: 1.5 }],
  });
  assert.equal(created.status, 200, JSON.stringify(created.json));
  const id: string = created.json.state.purchases[0].id;
  const edited = await call('PATCH', `/api/purchases/${id}`, 'ops', {
    lines: [{ productId: product.id, qty: 6, packCode: 'unidad', unitPrice: 2 }],
  });
  assert.equal(edited.status, 200, JSON.stringify(edited.json));
  const po = edited.json.state.purchases.find((p: Json) => p.id === id);
  assert.equal(po.lines[0].qty, 6);
  assert.equal((await call('PATCH', '/api/purchases/OC-9999', 'ops', { lines: [] })).status, 400);
});
