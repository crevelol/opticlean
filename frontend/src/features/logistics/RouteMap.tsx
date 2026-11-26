import { useEffect, useId, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { AppState, Order } from '../../shared/types';
import { client } from '../../shared/lib/inventory';
import { depotGeo, stopGeo } from './fleet';
import { fetchStreetRoute, type LatLng } from './osrmRoute';
import { Button } from '../../shared/components/ui';

const stopIcon = (n: number, active: boolean) =>
  L.divIcon({
    className: 'log-leaflet-pin-wrap',
    html: `<span class="log-leaflet-pin ${active ? 'is-active' : ''}">${n}</span>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });

const truckIcon = L.divIcon({
  className: 'log-leaflet-truck-wrap',
  html: `<span class="log-leaflet-truck" aria-hidden="true">
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
  showFullButton,
  onFullRoute,
  city = 'Quito',
}: {
  state: AppState;
  orders: Order[];
  activeId?: string | null;
  onSelect?: (id: string) => void;
  showFullButton?: boolean;
  onFullRoute?: () => void;
  city?: string;
}) {
  const mapId = useId().replace(/:/g, '');
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const [routeMeta, setRouteMeta] = useState<{ km: string; eta: string } | null>(null);
  const [routing, setRouting] = useState(false);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const depot = depotGeo(city);
    const map = L.map(containerRef.current, {
      zoomControl: true,
      attributionControl: true,
    }).setView([depot.lat, depot.lng], 12);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · Rutas <a href="https://project-osrm.org/">OSRM</a>',
    }).addTo(map);

    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    const el = containerRef.current;
    const ro = new ResizeObserver(() => {
      map.invalidateSize();
    });
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
    const points = orders.map((o, i) => ({
      order: o,
      ...stopGeo(state, o, i),
      index: i,
    }));

    const waypoints: LatLng[] = [
      { lat: depot.lat, lng: depot.lng },
      ...points.map((p) => ({ lat: p.lat, lng: p.lng })),
    ];
    const straight: L.LatLngExpression[] = waypoints.map((p) => [p.lat, p.lng]);

    L.marker([depot.lat, depot.lng], { icon: truckIcon, title: `Salida · ${city}` }).addTo(layer);

    for (const p of points) {
      const name = client(state, p.order.clientId)?.name ?? p.order.id;
      const marker = L.marker([p.lat, p.lng], {
        icon: stopIcon(p.index + 1, activeId === p.order.id),
        title: name,
      }).addTo(layer);
      marker.bindPopup(
        `<strong>${p.index + 1}. ${name}</strong><br/>${p.sector} · ${p.order.id}`,
      );
      marker.on('click', () => onSelectRef.current?.(p.order.id));
      if (activeId === p.order.id) marker.openPopup();
    }

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

    if (waypoints.length === 1) {
      map.setView([depot.lat, depot.lng], 12);
      requestAnimationFrame(() => map.invalidateSize());
      return () => {
        cancelled = true;
        ac.abort();
      };
    }

    // Línea provisional mientras llega OSRM
    drawLine(straight, true);
    map.fitBounds(L.latLngBounds(straight), { padding: [36, 36], maxZoom: 14 });
    setRouting(true);

    void fetchStreetRoute(waypoints, ac.signal).then((route) => {
      if (cancelled || !layerRef.current) return;
      setRouting(false);
      layer.clearLayers();

      L.marker([depot.lat, depot.lng], { icon: truckIcon, title: `Salida · ${city}` }).addTo(layer);

      for (const p of points) {
        const name = client(state, p.order.clientId)?.name ?? p.order.id;
        const marker = L.marker([p.lat, p.lng], {
          icon: stopIcon(p.index + 1, activeId === p.order.id),
          title: name,
        }).addTo(layer);
        marker.bindPopup(
          `<strong>${p.index + 1}. ${name}</strong><br/>${p.sector} · ${p.order.id}`,
        );
        marker.on('click', () => onSelectRef.current?.(p.order.id));
        if (activeId === p.order.id) marker.openPopup();
      }

      if (route?.coordinates.length) {
        const path: L.LatLngExpression[] = route.coordinates.map((c) => [c.lat, c.lng]);
        drawLine(path);
        setRouteMeta({ km: fmtKm(route.distanceM), eta: fmtMin(route.durationS) });
        map.fitBounds(L.latLngBounds(path), { padding: [36, 36], maxZoom: 15 });
      } else {
        drawLine(straight, true);
        setRouteMeta(null);
        map.fitBounds(L.latLngBounds(straight), { padding: [36, 36], maxZoom: 14 });
      }
      requestAnimationFrame(() => map.invalidateSize());
    });

    return () => {
      cancelled = true;
      ac.abort();
    };
  }, [state, orders, activeId, city]);

  return (
    <div className="log-map log-map-live">
      {showFullButton ? (
        <Button variant="link" className="log-map-full" onClick={onFullRoute}>
          Ver ruta completa
        </Button>
      ) : null}
      {routing ? <div className="log-map-routing">Calculando calles…</div> : null}
      {routeMeta ? (
        <div className="log-map-route-meta">
          <span>{routeMeta.km}</span>
          <span>{routeMeta.eta}</span>
          <span>por calles</span>
        </div>
      ) : null}
      <div ref={containerRef} id={`log-map-${mapId}`} className="log-map-canvas" />
      {!orders.length ? <p className="log-map-empty">Sin paradas en ruta</p> : null}
      <div className="log-map-attrib">Leaflet · minicore-rutas</div>
    </div>
  );
}
