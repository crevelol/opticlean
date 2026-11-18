import { useEffect, useId, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { AppState, Order } from '../types';
import { clientOf, depotGeo, stopGeo } from '../lib/fleet';
import { geocodeAddress } from '../lib/geocode';
import { fetchStreetRoute, type LatLng } from '../lib/osrmRoute';

const stopIcon = (n: number, active: boolean) =>
  L.divIcon({
    className: 'drv-leaflet-pin-wrap',
    html: `<span class="drv-leaflet-pin ${active ? 'is-active' : ''}">${n}</span>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });

const truckIcon = L.divIcon({
  className: 'drv-leaflet-truck-wrap',
  html: `<span class="drv-leaflet-truck" aria-hidden="true">
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8">
      <path d="M2 5h12v12H2ZM14 9h4l4 5v3h-8"/><circle cx="6" cy="18" r="2"/><circle cx="18" cy="18" r="2"/>
    </svg>
  </span>`,
  iconSize: [32, 32],
  iconAnchor: [16, 16],
});

function fmtKm(m: number) {
  return `${(m / 1000).toFixed(m >= 10000 ? 0 : 1)} km`;
}

function fmtMin(s: number) {
  const mins = Math.round(s / 60);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h ${String(m).padStart(2, '0')}min`;
}

export function RouteMap({
  state,
  orders,
  activeId,
  onSelect,
  city = 'Quito',
}: {
  state: AppState;
  orders: Order[];
  activeId?: string | null;
  onSelect?: (id: string) => void;
  city?: string;
}) {
  const mapId = useId().replace(/:/g, '');
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const [pins, setPins] = useState<Record<string, LatLng>>({});
  const [routeMeta, setRouteMeta] = useState<{ km: string; eta: string } | null>(null);
  const [routing, setRouting] = useState(false);

  const queries = orders
    .map((order) => {
      const person = clientOf(state, order.clientId);
      return `${order.id}\t${person?.address ?? ''}\t${person?.city || city}`;
    })
    .join('\n');

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const next: Record<string, LatLng> = {};
      for (const row of queries.split('\n').filter(Boolean)) {
        if (cancelled) return;
        const [id, address, place] = row.split('\t');
        const point = await geocodeAddress([address, place, 'Ecuador'].filter(Boolean).join(', '));
        if (point && id) next[id] = point;
      }
      if (!cancelled) setPins(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [queries]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const depot = depotGeo(city);
    const map = L.map(containerRef.current, {
      zoomControl: true,
      attributionControl: true,
    }).setView([depot.lat, depot.lng], 12);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap · Rutas OSRM',
    }).addTo(map);

    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    const el = containerRef.current;
    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(el);

    return () => {
      ro.disconnect();
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, [city, mapId]);

  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;

    let cancelled = false;
    const ac = new AbortController();

    layer.clearLayers();
    setRouteMeta(null);

    const depot = depotGeo(city);
    const points = orders.map((o, i) => {
      const fallback = stopGeo(state, o, i);
      const pin = pins[o.id];
      return {
        order: o,
        lat: pin?.lat ?? fallback.lat,
        lng: pin?.lng ?? fallback.lng,
        sector: fallback.sector,
        index: i,
        approximate: !pin,
      };
    });
    const waypoints: LatLng[] = [
      { lat: depot.lat, lng: depot.lng },
      ...points.map((p) => ({ lat: p.lat, lng: p.lng })),
    ];
    const straight: L.LatLngExpression[] = waypoints.map((p) => [p.lat, p.lng]);

    const placeMarkers = () => {
      L.marker([depot.lat, depot.lng], { icon: truckIcon, title: `Salida · ${city}` }).addTo(layer);
      for (const p of points) {
        const person = clientOf(state, p.order.clientId);
        const name = person?.name ?? p.order.id;
        const marker = L.marker([p.lat, p.lng], {
          icon: stopIcon(p.index + 1, activeId === p.order.id),
          title: name,
        }).addTo(layer);
        const where = person?.address
          ? `${person.address}${p.approximate ? ' · aprox.' : ''}`
          : p.sector;
        marker.bindPopup(`<strong>${p.index + 1}. ${name}</strong><br/>${where}<br/>${p.order.id}`);
        marker.on('click', () => onSelectRef.current?.(p.order.id));
        if (activeId === p.order.id) marker.openPopup();
      }
    };

    const drawLine = (coords: L.LatLngExpression[], dashed = false) => {
      L.polyline(coords, {
        color: '#1f7ad9',
        weight: 5,
        opacity: 0.92,
        lineJoin: 'round',
        lineCap: 'round',
        dashArray: dashed ? '8 10' : undefined,
      }).addTo(layer);
    };

    placeMarkers();

    if (waypoints.length < 2) {
      map.setView([depot.lat, depot.lng], 12);
      requestAnimationFrame(() => map.invalidateSize());
      return () => {
        cancelled = true;
        ac.abort();
      };
    }

    drawLine(straight, true);
    map.fitBounds(L.latLngBounds(straight), { padding: [28, 28], maxZoom: 14 });
    setRouting(true);

    void fetchStreetRoute(waypoints, ac.signal).then((route) => {
      if (cancelled || !layerRef.current) return;
      setRouting(false);
      layer.clearLayers();
      placeMarkers();

      if (route?.coordinates.length) {
        const path: L.LatLngExpression[] = route.coordinates.map((c) => [c.lat, c.lng]);
        drawLine(path);
        setRouteMeta({ km: fmtKm(route.distanceM), eta: fmtMin(route.durationS) });
        map.fitBounds(L.latLngBounds(path), { padding: [28, 28], maxZoom: 15 });
      } else {
        drawLine(straight, true);
        setRouteMeta(null);
        map.fitBounds(L.latLngBounds(straight), { padding: [28, 28], maxZoom: 14 });
      }
      requestAnimationFrame(() => map.invalidateSize());
    });

    return () => {
      cancelled = true;
      ac.abort();
    };
  }, [state, orders, activeId, city, pins]);

  return (
    <div className="drv-map">
      {routing ? <div className="drv-map-routing">Calculando calles…</div> : null}
      {routeMeta ? (
        <div className="drv-map-route-meta">
          <span>{routeMeta.km}</span>
          <span>{routeMeta.eta}</span>
          <span>por calles</span>
        </div>
      ) : null}
      <div ref={containerRef} id={`drv-map-${mapId}`} className="drv-map-canvas" />
      {!orders.length ? <p className="drv-map-empty">Sin paradas en ruta</p> : null}
      <div className="drv-map-attrib">Leaflet · minicore-rutas</div>
    </div>
  );
}
