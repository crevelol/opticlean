import cors from 'cors';
import express from 'express';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { JsonStateRepository } from '../persistence/JsonStateRepository.js';
import { OperationsUseCases } from '../../application/use-cases/OperationsUseCases.js';
import { suggest, suggestPlacement } from '../../domain/placement.service.js';
import { autoAssignLogistics, openaiConfigured } from '../../domain/logistics-ai.service.js';
import type { AppState } from '../../domain/types.js';
import {
  authRequired,
  login,
  publicUserFromRequest,
  requireRole,
  warnInsecureSecret,
} from '../auth/auth.js';

/** Carga backend/.env sin dependencia extra (no pisa vars ya definidas, p.ej. systemd). */
function loadEnvFile() {
  const path = resolve(process.cwd(), '.env');
  if (!existsSync(path)) return;
  for (const raw of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const i = line.indexOf('=');
    if (i <= 0) continue;
    const key = line.slice(0, i).trim();
    let val = line.slice(i + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}
loadEnvFile();
warnInsecureSecret();

const app = express();
const repo = new JsonStateRepository();
const ops = new OperationsUseCases(repo);

app.use(cors());
app.use(express.json({ limit: '1mb' }));

type Req = express.Request;
type Res = express.Response;

/** Ejecuta un caso de uso que devuelve el estado y responde con estado + métricas. */
const withState =
  (fn: (uc: OperationsUseCases, req: Req) => Promise<AppState>) =>
  async (req: Req, res: Res, next: express.NextFunction) => {
    try {
      const state = await fn(ops.as(req.user?.name), req);
      res.json({ state, metrics: ops.metricsSnapshot(state) });
    } catch (e) {
      next(e);
    }
  };

/** El conductor solo puede operar pedidos cargados en su camión. */
async function assertDriverOrder(req: Req, orderId: string) {
  if (req.user?.role !== 'driver') return;
  const order = (await ops.getState()).orders.find((o) => o.id === orderId);
  if (!order || !req.user.truckPlate || order.vehicle !== req.user.truckPlate) {
    throw Object.assign(new Error('Este pedido no está asignado a tu camión.'), { status: 403 });
  }
}

const adminOnly = requireRole();
const warehouseRoles = requireRole('ops');
const dispatchRoles = requireRole('dispatch');
const pickingRoles = requireRole('ops', 'dispatch');
const fieldRoles = requireRole('dispatch', 'driver');

app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.post('/api/auth/login', (req, res) => {
  try {
    const email = String(req.body?.email ?? '');
    const password = String(req.body?.password ?? '');
    if (!email || !password) {
      res.status(400).json({ error: 'Ingresa correo y contraseña' });
      return;
    }
    res.json(login(email, password));
  } catch (e) {
    res.status(401).json({ error: e instanceof Error ? e.message : 'No autorizado' });
  }
});

app.use('/api', (req, res, next) => {
  if (req.path === '/health' || req.path === '/auth/login') return next();
  return authRequired(req, res, next);
});

app.get('/api/auth/me', (req, res) => {
  res.json({ user: publicUserFromRequest(req) });
});

/* ─── Lectura (cualquier usuario autenticado) ─────────────── */

app.get('/api/meta', async (_req, res, next) => {
  try {
    res.json(await ops.getMeta());
  } catch (e) {
    next(e);
  }
});

app.get('/api/state', async (_req, res, next) => {
  try {
    const state = await ops.getState();
    res.json({ state, metrics: ops.metricsSnapshot(state) });
  } catch (e) {
    next(e);
  }
});

app.get('/api/suggest', async (req, res, next) => {
  try {
    const state = await ops.getState();
    const productId = String(req.query.productId ?? '');
    const qty = Number(req.query.qty ?? 1);
    const exclude = String(req.query.exclude ?? '');
    res.json(suggest(state, productId, qty, exclude));
  } catch (e) {
    next(e);
  }
});

app.get('/api/placement', async (req, res, next) => {
  try {
    const state = await ops.getState();
    const productId = String(req.query.productId ?? '');
    const qty = Number(req.query.qty ?? 1);
    const exclude = String(req.query.exclude ?? '');
    const options = suggestPlacement(state, productId, qty, exclude);
    const p = state.products.find((x) => x.id === productId);
    res.json({
      productId,
      qty,
      best: options[0] ?? null,
      options: options.slice(0, 8),
      guidance: options[0]
        ? `Ubica en ${options[0].id}: ${options[0].reasons.join(' · ')}`
        : 'No hay ubicación compatible para esta cantidad.',
      product: p
        ? { id: p.id, name: p.name, category: p.category, fragile: !!p.fragile, familyId: p.familyId }
        : null,
    });
  } catch (e) {
    next(e);
  }
});

app.get('/api/orders/:id/pick-plan', async (req, res, next) => {
  try {
    res.json(await ops.getPickPlan(req.params.id));
  } catch (e) {
    next(e);
  }
});

app.get('/api/assistant/:query', async (req, res, next) => {
  try {
    const q = req.params.query as 'stock' | 'warehouse' | 'orders';
    res.json({ lines: await ops.assistantQuery(q) });
  } catch (e) {
    next(e);
  }
});

app.get('/api/logistics/ai-status', (_req, res) => {
  res.json({
    openai: openaiConfigured(),
    model: process.env.OPENAI_MODEL || process.env.OPENAI_CHAT_MODEL || 'gpt-4o-mini',
  });
});

/* ─── Administración ──────────────────────────────────────── */

app.post('/api/state/reset', adminOnly, withState((uc) => uc.reset()));
app.patch('/api/settings', adminOnly, withState((uc, req) => uc.updateSettings(req.body)));

app.post('/api/warehouses', adminOnly, withState((uc, req) => uc.addWarehouse(req.body)));
app.patch(
  '/api/warehouses/:id',
  adminOnly,
  withState((uc, req) => uc.saveWarehouse({ ...req.body, id: req.params.id })),
);
app.delete('/api/warehouses/:id', adminOnly, withState((uc, req) => uc.removeWarehouse(req.params.id)));
app.post(
  '/api/warehouses/:id/activate',
  adminOnly,
  withState((uc, req) => uc.setActiveWarehouse(req.params.id)),
);

app.post('/api/families', adminOnly, withState((uc, req) => uc.saveFamily(req.body)));
app.delete('/api/families/:id', adminOnly, withState((uc, req) => uc.removeFamily(req.params.id)));

app.post('/api/vehicles', adminOnly, withState((uc, req) => uc.saveVehicle({ ...req.body, id: undefined })));
app.patch(
  '/api/vehicles/:id',
  adminOnly,
  withState((uc, req) => uc.saveVehicle({ ...req.body, id: req.params.id })),
);
app.delete('/api/vehicles/:id', adminOnly, withState((uc, req) => uc.removeVehicle(req.params.id)));

/* ─── Bodega ──────────────────────────────────────────────── */

app.post('/api/receptions', warehouseRoles, withState((uc, req) => uc.receiveGoods(req.body)));
app.post('/api/moves', warehouseRoles, withState((uc, req) => uc.transferLot(req.body)));
app.post('/api/products', warehouseRoles, withState((uc, req) => uc.saveProduct(req.body)));
app.delete(
  '/api/products/:id',
  warehouseRoles,
  withState((uc, req) => uc.removeProduct(req.params.id)),
);
app.post('/api/purchases', warehouseRoles, withState((uc, req) => uc.addPurchase(req.body)));
app.post(
  '/api/purchases/:id/cancel',
  warehouseRoles,
  withState((uc, req) => uc.voidPurchase(req.params.id)),
);
app.post(
  '/api/orders/:id/prepare',
  pickingRoles,
  withState((uc, req) => uc.confirmPrepare(req.params.id)),
);

/* ─── Comercial y despacho ────────────────────────────────── */

app.post(
  '/api/orders',
  dispatchRoles,
  withState(async (uc, req) => {
    await uc.placeOrder(req.body);
    return uc.getState();
  }),
);
app.post(
  '/api/orders/:id/cancel',
  pickingRoles,
  withState((uc, req) => uc.cancelOrder(req.params.id, String(req.body?.reason ?? ''))),
);

app.post('/api/clients', dispatchRoles, withState((uc, req) => uc.addClient(req.body)));
app.patch('/api/clients/:id', dispatchRoles, withState((uc, req) => uc.editClient(req.params.id, req.body)));
app.delete('/api/clients/:id', dispatchRoles, withState((uc, req) => uc.removeClient(req.params.id)));

app.post(
  '/api/logistics/stage',
  dispatchRoles,
  withState((uc, req) => {
    const { orderIds, plate } = req.body as { orderIds?: string[]; plate?: string };
    return uc.stageLoad(orderIds ?? [], String(plate ?? ''));
  }),
);
app.post(
  '/api/logistics/unstage',
  dispatchRoles,
  withState((uc, req) => {
    const { orderIds } = req.body as { orderIds?: string[] };
    return uc.clearStage(orderIds ?? []);
  }),
);

app.post('/api/bundles', dispatchRoles, withState((uc, req) => uc.upsertBundle(req.body)));
app.patch(
  '/api/bundles/:id',
  dispatchRoles,
  withState((uc, req) => uc.upsertBundle({ ...req.body, id: req.params.id })),
);
app.delete('/api/bundles/:id', dispatchRoles, withState((uc, req) => uc.removeBundle(req.params.id)));

app.post(
  '/api/dispatch',
  dispatchRoles,
  withState((uc, req) => {
    const { orderIds, vehicle } = req.body as { orderIds: string[]; vehicle?: string };
    return uc.confirmDispatch(orderIds, vehicle);
  }),
);

app.post('/api/logistics/auto-assign', dispatchRoles, async (req, res, next) => {
  try {
    const state = await ops.getState();
    const body = (req.body ?? {}) as {
      orderIds?: string[];
      stagedByTruck?: Record<string, string[]>;
    };
    const plan = await autoAssignLogistics({
      state,
      orderIds: body.orderIds,
      stagedByTruck: body.stagedByTruck,
    });
    res.json({ plan, openai: openaiConfigured() });
  } catch (e) {
    next(e);
  }
});

/* ─── Ruta (despacho y conductor) ─────────────────────────── */

app.post(
  '/api/delivery',
  fieldRoles,
  withState(async (uc, req) => {
    const { orderId, person, notes } = req.body;
    await assertDriverOrder(req, orderId);
    return uc.delivery(orderId, person, notes);
  }),
);

app.post(
  '/api/incidents',
  fieldRoles,
  withState(async (uc, req) => {
    const { orderId, reason, notes } = req.body;
    await assertDriverOrder(req, orderId);
    return uc.incident(orderId, reason, notes);
  }),
);

app.use((err: unknown, _req: Req, res: Res, _next: express.NextFunction) => {
  const message = err instanceof Error ? err.message : 'Error interno';
  const status = (err as { status?: number })?.status ?? 400;
  res.status(status).json({ error: message });
});

const PORT = Number(process.env.PORT ?? 3001);
app.listen(PORT, () => {
  console.log(`OPTICLEAN API en http://localhost:${PORT}`);
});
