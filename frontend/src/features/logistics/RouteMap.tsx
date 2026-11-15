import { useEffect, useId, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { AppState, Order } from '../../shared/types';
import { client } from '../../shared/lib/inventory';
import { depotGeo, stopGeo } from './fleet';
import { geocodeAddress, type LatLng } from './geocode';

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
  const [pins, setPins] = useState<Record<string, LatLng>>({});
  const queries = orders
    .map((order) => {
      const person = client(state, order.clientId);
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
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
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

    layer.clearLayers();
    const depot = depotGeo(city);
    const points = orders.map((o, i) => {
      const fallback = stopGeo(state, o, i);
      const pin = pins[o.id];
      return {
        order: o,
        lat: pin?.lat ?? fallback.lat,
        lng: pin?.lng ?? fallback.lng,
        sector: fallback.sector,
        approximate: !pin,
        index: i,
      };
    });

    const latLngs: L.LatLngExpression[] = [[depot.lat, depot.lng]];
    for (const p of points) latLngs.push([p.lat, p.lng]);

    if (latLngs.length > 1) {
      L.polyline(latLngs, {
        color: '#1f7ad9',
        weight: 4,
        opacity: 0.9,
        lineJoin: 'round',
      }).addTo(layer);
    }

    L.marker([depot.lat, depot.lng], { icon: truckIcon, title: `Salida · ${city}` }).addTo(layer);

    for (const p of points) {
      const person = client(state, p.order.clientId);
      const name = person?.name ?? p.order.id;
      const marker = L.marker([p.lat, p.lng], {
        icon: stopIcon(p.index + 1, activeId === p.order.id),
        title: name,
      }).addTo(layer);
      const where = person?.address ? `${person.address}${p.approximate ? ' · ubicación aproximada' : ''}` : p.sector;
      marker.bindPopup(
        `<strong>${p.index + 1}. ${name}</strong><br/>${where}<br/>${p.order.id}`,
      );
      marker.on('click', () => onSelectRef.current?.(p.order.id));
      if (activeId === p.order.id) marker.openPopup();
    }

    if (latLngs.length === 1) {
      map.setView(latLngs[0], 12);
    } else {
      map.fitBounds(L.latLngBounds(latLngs), { padding: [36, 36], maxZoom: 14 });
    }
    requestAnimationFrame(() => map.invalidateSize());
  }, [state, orders, activeId, city, pins]);

  return (
    <div className="log-map log-map-live">
      {showFullButton ? (
        <button type="button" className="log-map-full" onClick={onFullRoute}>
          Ver ruta completa
        </button>
      ) : null}
      <div ref={containerRef} id={`log-map-${mapId}`} className="log-map-canvas" />
      {!orders.length ? <p className="log-map-empty">Sin paradas en ruta</p> : null}
      <div className="log-map-attrib">Leaflet + OpenStreetMap</div>
    </div>
  );
}
