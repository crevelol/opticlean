export type LatLng = { lat: number; lng: number };

export type StreetRoute = {
  coordinates: LatLng[];
  distanceM: number;
  durationS: number;
  provider?: 'osrm' | 'fallback';
  cached?: boolean;
};

/** Base del minicore-rutas (nginx → 127.0.0.1:3021). */
const ROUTING_BASE = '/routing';

/**
 * Móvil conductor: consume el mismo minicore que la web de ops.
 * No llama a OSRM directamente.
 */
export async function fetchStreetRoute(
  points: LatLng[],
  signal?: AbortSignal,
): Promise<StreetRoute | null> {
  if (points.length < 2) return null;
  try {
    const res = await fetch(`${ROUTING_BASE}/v1/routes/plan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ points, profile: 'driving', geometry: true }),
      signal,
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      route?: {
        coordinates?: LatLng[];
        distanceM?: number;
        durationS?: number;
        provider?: 'osrm' | 'fallback';
        cached?: boolean;
      };
    };
    const route = data.route;
    if (!route?.coordinates?.length) return null;
    return {
      coordinates: route.coordinates,
      distanceM: Number(route.distanceM) || 0,
      durationS: Number(route.durationS) || 0,
      provider: route.provider,
      cached: route.cached,
    };
  } catch {
    return null;
  }
}
