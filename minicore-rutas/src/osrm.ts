import type { LatLng, PlannedRoute, RouteLeg, RouteProfile } from './types.js';

const OSRM_BASE = process.env.OSRM_BASE_URL || 'https://router.project-osrm.org';

function toLonLat(p: LatLng) {
  return `${p.lng},${p.lat}`;
}

function uid() {
  return `rt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

type OsrmResponse = {
  code?: string;
  message?: string;
  routes?: Array<{
    distance: number;
    duration: number;
    geometry?: { coordinates?: [number, number][] };
    legs?: Array<{ distance: number; duration: number; summary?: string }>;
  }>;
};

export async function planWithOsrm(
  points: LatLng[],
  profile: RouteProfile,
  withGeometry: boolean,
  signal?: AbortSignal,
): Promise<Omit<PlannedRoute, 'cached'>> {
  if (points.length < 2) {
    throw new Error('Se requieren al menos 2 puntos (origen y destino).');
  }
  for (const p of points) {
    if (!Number.isFinite(p.lat) || !Number.isFinite(p.lng)) {
      throw new Error('Coordenadas inválidas.');
    }
    if (p.lat < -90 || p.lat > 90 || p.lng < -180 || p.lng > 180) {
      throw new Error('Coordenadas fuera de rango.');
    }
  }

  const coords = points.map(toLonLat).join(';');
  const overview = withGeometry ? 'full' : 'false';
  const url =
    `${OSRM_BASE}/route/v1/${profile}/${coords}` +
    `?overview=${overview}&geometries=geojson&steps=false`;

  const init: RequestInit = signal ? { signal } : {};
  const res = await fetch(url, init);
  if (!res.ok) {
    throw new Error(`OSRM HTTP ${res.status}`);
  }
  const data = (await res.json()) as OsrmResponse;
  if (data.code !== 'Ok' || !data.routes?.[0]) {
    throw new Error(data.message || 'OSRM no pudo calcular la ruta.');
  }

  const route = data.routes[0];
  const geometry = route.geometry?.coordinates ?? [];
  const coordinates = withGeometry
    ? geometry.map(([lng, lat]) => ({ lat, lng }))
    : points.slice();

  const legs: RouteLeg[] = (route.legs ?? []).map((leg, i) => {
    const item: RouteLeg = {
      fromIndex: i,
      toIndex: i + 1,
      distanceM: leg.distance,
      durationS: leg.duration,
    };
    if (leg.summary) item.summary = leg.summary;
    return item;
  });

  return {
    id: uid(),
    profile,
    points,
    coordinates,
    distanceM: route.distance,
    durationS: route.duration,
    legs,
    provider: 'osrm',
    plannedAt: new Date().toISOString(),
  };
}

/** Fallback haversine + línea recta si OSRM no responde. */
export function planFallback(points: LatLng[], profile: RouteProfile): Omit<PlannedRoute, 'cached'> {
  const R = 6371000;
  let distanceM = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const dLat = ((b.lat - a.lat) * Math.PI) / 180;
    const dLng = ((b.lng - a.lng) * Math.PI) / 180;
    const lat1 = (a.lat * Math.PI) / 180;
    const lat2 = (b.lat * Math.PI) / 180;
    const h =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    distanceM += 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
  }
  const durationS = (distanceM / 1000 / 30) * 3600;
  const legs: RouteLeg[] = [];
  for (let i = 1; i < points.length; i++) {
    legs.push({
      fromIndex: i - 1,
      toIndex: i,
      distanceM: distanceM / (points.length - 1),
      durationS: durationS / (points.length - 1),
      summary: 'línea recta',
    });
  }
  return {
    id: uid(),
    profile,
    points,
    coordinates: points.slice(),
    distanceM,
    durationS,
    legs,
    provider: 'fallback',
    plannedAt: new Date().toISOString(),
  };
}
