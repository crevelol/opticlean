import { Router } from 'express';
import { TtlCache } from './cache.js';
import { planFallback, planWithOsrm } from './osrm.js';
import type { LatLng, PlannedRoute, PlanRequest, RouteProfile } from './types.js';

const cache = new TtlCache<PlannedRoute>(Number(process.env.ROUTE_CACHE_TTL_MS || 10 * 60 * 1000));

function cacheKey(points: LatLng[], profile: RouteProfile, geometry: boolean) {
  const body = points.map((p) => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`).join(';');
  return `${profile}|${geometry ? 1 : 0}|${body}`;
}

function parsePoints(raw: unknown): LatLng[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((p) => {
      if (!p || typeof p !== 'object') return null;
      const lat = Number((p as { lat?: unknown }).lat);
      const lng = Number((p as { lng?: unknown }).lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
      return { lat, lng };
    })
    .filter((p): p is LatLng => Boolean(p));
}

export function createRouter() {
  const router = Router();

  router.get('/health', (_req, res) => {
    res.json({
      ok: true,
      service: 'minicore-rutas',
      version: '1.0.0',
      osrm: process.env.OSRM_BASE_URL || 'https://router.project-osrm.org',
    });
  });

  router.post('/v1/routes/plan', async (req, res) => {
    try {
      const body = (req.body ?? {}) as PlanRequest;
      const points = parsePoints(body.points);
      const profile = (body.profile || 'driving') as RouteProfile;
      const geometry = body.geometry !== false;

      if (points.length < 2) {
        res.status(400).json({ error: 'Envía points: [{lat,lng}, ...] con al menos 2 puntos.' });
        return;
      }
      if (!['driving', 'walking', 'cycling'].includes(profile)) {
        res.status(400).json({ error: 'profile inválido (driving|walking|cycling).' });
        return;
      }

      const key = cacheKey(points, profile, geometry);
      const hit = cache.get(key);
      if (hit) {
        res.json({ route: { ...hit, cached: true } });
        return;
      }

      let planned: Omit<PlannedRoute, 'cached'>;
      try {
        planned = await planWithOsrm(points, profile, geometry);
      } catch (err) {
        const allowFallback = process.env.ALLOW_FALLBACK !== '0';
        if (!allowFallback) throw err;
        planned = planFallback(points, profile);
      }

      const route: PlannedRoute = { ...planned, cached: false };
      cache.set(key, route);
      res.json({ route });
    } catch (err) {
      res.status(502).json({
        error: err instanceof Error ? err.message : 'No se pudo planificar la ruta',
      });
    }
  });

  /** Atajo GET: /v1/routes/plan?points=-0.25,-79.17;-0.26,-79.18 */
  router.get('/v1/routes/plan', async (req, res) => {
    try {
      const raw = String(req.query.points || '');
      const points = raw
        .split(';')
        .map((pair) => {
          const [a, b] = pair.split(',').map(Number);
          // acepta lat,lng
          if (Number.isFinite(a) && Number.isFinite(b)) return { lat: a, lng: b };
          return null;
        })
        .filter((p): p is LatLng => Boolean(p));
      const profile = (String(req.query.profile || 'driving') as RouteProfile) || 'driving';
      const geometry = String(req.query.geometry || '1') !== '0';

      if (points.length < 2) {
        res.status(400).json({ error: 'Usa ?points=lat,lng;lat,lng' });
        return;
      }

      const key = cacheKey(points, profile, geometry);
      const hit = cache.get(key);
      if (hit) {
        res.json({ route: { ...hit, cached: true } });
        return;
      }

      let planned: Omit<PlannedRoute, 'cached'>;
      try {
        planned = await planWithOsrm(points, profile, geometry);
      } catch {
        planned = planFallback(points, profile);
      }
      const route: PlannedRoute = { ...planned, cached: false };
      cache.set(key, route);
      res.json({ route });
    } catch (err) {
      res.status(502).json({
        error: err instanceof Error ? err.message : 'No se pudo planificar la ruta',
      });
    }
  });

  return router;
}
