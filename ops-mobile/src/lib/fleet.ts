import type { AppState, Order } from '../types';

export type Truck = {
  id: string;
  plate: string;
  label: string;
  city: string;
  driver: string;
  maxKg: number;
  maxM3: number;
  costPerKm: number;
  etaHours: number;
  routeKm: number;
};

const ROUTE_ESTIMATES: Record<string, Pick<Truck, 'etaHours' | 'routeKm'>> = {
  'GBA-2041': { etaHours: 3.33, routeKm: 62 },
  'GYE-1188': { etaHours: 4.17, routeKm: 65 },
  'CUE-3301': { etaHours: 3.83, routeKm: 65 },
  'AMB-5520': { etaHours: 4.08, routeKm: 66 },
};

const DEFAULT_ESTIMATE = { etaHours: 4, routeKm: 60 };

/** Flota activa registrada en el backend, con estimaciones de ruta. */
export function fleetOf(s: AppState): Truck[] {
  return (s.vehicles ?? [])
    .filter((v) => v.active)
    .map((v) => ({ ...DEFAULT_ESTIMATE, ...ROUTE_ESTIMATES[v.plate], ...v }));
}

export const ROUTE_STATUSES = new Set(['En ruta', 'Incidencia']);

export function truckByPlate(s: AppState, plate?: string) {
  return (s.vehicles ?? [])
    .map((v) => ({ ...DEFAULT_ESTIMATE, ...ROUTE_ESTIMATES[v.plate], ...v }))
    .find((t) => t.plate === plate);
}
export function clientOf(s: AppState, id: string) {
  return s.clients.find((c) => c.id === id);
}

export function productOf(s: AppState, id: string) {
  return s.products.find((p) => p.id === id);
}

export function orderWeight(s: AppState, o: Order) {
  return o.lines.reduce((n, l) => n + l.qty * (productOf(s, l.productId)?.weight ?? 0), 0);
}

export function cityOf(s: AppState, o: Order) {
  const c = clientOf(s, o.clientId);
  if (c?.city) return c.city;
  return 'Quito';
}

export function sectorOf(s: AppState, o: Order) {
  const c = clientOf(s, o.clientId);
  return c?.sector || c?.address || 'Sin sector';
}

export function routeOrders(s: AppState, plate: string) {
  return s.orders.filter(
    (o) => o.vehicle === plate && ROUTE_STATUSES.has(o.status) && !o.id.startsWith('PED-H'),
  );
}

export function packagesOf(o: Order) {
  return o.lines.length;
}

export function fmtHours(h: number) {
  const hours = Math.floor(h);
  const mins = Math.round((h - hours) * 60);
  return `${hours}h ${String(mins).padStart(2, '0')}min`;
}

export function stopGeo(s: AppState, o: Order, index = 0) {
  const city = cityOf(s, o);
  const sector = sectorOf(s, o);
  const bases: Record<string, { lat: number; lng: number }> = {
    Quito: { lat: -0.1807, lng: -78.4678 },
    Guayaquil: { lat: -2.1709, lng: -79.9224 },
    Cuenca: { lat: -2.9001, lng: -79.0059 },
    Ambato: { lat: -1.2417, lng: -78.6198 },
    'Santo Domingo': { lat: -0.2532, lng: -79.1754 },
  };
  const sectorOffset: Record<string, { lat: number; lng: number }> = {
    'Centro Histórico': { lat: -0.01, lng: 0.005 },
    'La Mariscal': { lat: 0.012, lng: -0.004 },
    Cumbayá: { lat: 0.005, lng: 0.045 },
    Tumbaco: { lat: 0.002, lng: 0.06 },
    Carcelén: { lat: 0.055, lng: -0.01 },
    'La Floresta': { lat: -0.008, lng: 0.012 },
    Centro: { lat: 0.004, lng: -0.008 },
    Urdesa: { lat: 0.018, lng: -0.02 },
    Norte: { lat: 0.03, lng: -0.005 },
    'El Centro': { lat: 0.004, lng: -0.006 },
    Yanuncay: { lat: -0.02, lng: 0.012 },
  };
  const base = bases[city] ?? bases.Quito;
  const offset = sectorOffset[sector] ?? {
    lat: ((index % 3) - 1) * 0.008,
    lng: Math.floor(index / 3) * 0.008,
  };
  return {
    lat: base.lat + offset.lat,
    lng: base.lng + offset.lng,
    city,
    sector,
  };
}

export function depotGeo(city: string) {
  const depots: Record<string, { lat: number; lng: number }> = {
    Quito: { lat: -0.205, lng: -78.49 },
    Guayaquil: { lat: -2.19, lng: -79.9 },
    Cuenca: { lat: -2.88, lng: -79.02 },
    Ambato: { lat: -1.25, lng: -78.63 },
    'Santo Domingo': { lat: -0.26, lng: -79.19 },
  };
  return depots[city] ?? depots.Quito;
}

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function measureRoute(s: AppState, city: string, orders: Order[]) {
  if (!orders.length) return { km: 0, etaHours: 0 };
  const depot = depotGeo(city);
  let km = 0;
  let prev = depot;
  orders.forEach((o, i) => {
    const point = stopGeo(s, o, i);
    km += haversineKm(prev, point);
    prev = point;
  });
  km += haversineKm(prev, depot);
  km = Math.round(km * 10) / 10;
  const etaHours = Math.round((km / 22 + orders.length * 0.2) * 100) / 100;
  return { km, etaHours };
}
