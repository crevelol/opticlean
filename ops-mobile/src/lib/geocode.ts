export type LatLng = { lat: number; lng: number };

const KEY = 'opticlean.geo.v1';
let lastFetch = 0;

function readCache(): Record<string, LatLng> {
  try {
    return JSON.parse(sessionStorage.getItem(KEY) || '{}') as Record<string, LatLng>;
  } catch {
    return {};
  }
}

export async function geocodeAddress(query: string): Promise<LatLng | null> {
  const q = query.trim();
  if (q.length < 4) return null;
  const cache = readCache();
  if (cache[q]) return cache[q];
  const wait = 1100 - (Date.now() - lastFetch);
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  lastFetch = Date.now();
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=ec&q=${encodeURIComponent(q)}`,
      { headers: { Accept: 'application/json' } },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as Array<{ lat: string; lon: string }>;
    const lat = Number(data[0]?.lat);
    const lng = Number(data[0]?.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    cache[q] = { lat, lng };
    sessionStorage.setItem(KEY, JSON.stringify(cache));
    return cache[q];
  } catch {
    return null;
  }
}
