import { useEffect, useMemo, useRef, useState } from 'react';
import { Select } from '../../shared/components/Select';
import { YAW_MAX, YAW_MIN } from './iso';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAppState } from '../../shared/hooks/AppStateProvider';
import { api } from '../../shared/api/client';
import { useAuth } from '../../shared/hooks/AuthProvider';
import { can } from '../../shared/auth/permissions';
import { activeWarehouseId, available, product, qtyAt, scopedLots, time } from '../../shared/lib/inventory';
import { buildWarehouseGeometry, normalizeLayout } from '../../shared/lib/warehouseLayout';
import { Btn, Kpi, PageHead } from '../../shared/components/ui';
import { Icon } from '../../shared/components/Icon';
import { WarehouseMap, type MapMode } from './WarehouseMap';
import { WarehousePositioning } from './WarehousePositioning';
import { WarehouseTransferDialog } from './WarehouseTransferDialog';
import { LocationDetailModal } from './LocationDetailModal';
import { PickingModal, type PickLine } from './PickingModal';
import { ExitLayer } from './ExitLayer';
import '../../styles/warehouse-positioning.css';
import '../../styles/warehouse-page.css';

const MOVES_PER_PAGE = 6;
const moveTone = (type: string) => {
  const t = type.toLowerCase();
  if (t.includes('recep')) return 'is-in';
  if (t.includes('desp') || t.includes('salida') || t.includes('venta')) return 'is-out';
  if (t.includes('tras') || t.includes('reubic')) return 'is-move';
  return 'is-other';
};

export function WarehousePage() {
  const { state, meta: serverMeta, applyResponse, toast } = useAppState();
  const { user } = useAuth();
  const canStock = can(user, 'warehouse');
  const canPick = can(user, 'picking');
  const canLayout = user?.role === 'admin';
  const meta = useMemo(() => {
    if (!state || !serverMeta) return null;
    const warehouse = state.warehouses.find((item) => item.id === activeWarehouseId(state));
    return { ...serverMeta, ...buildWarehouseGeometry(normalizeLayout(warehouse?.layout ?? { racks: warehouse?.racks })) };
  }, [state, serverMeta]);
  const navigate = useNavigate();
  const routeLocation = useLocation();
  const locState = routeLocation.state as { loc?: string; productId?: string; pick?: string } | null;
  const [mapMode, setMapMode] = useState<MapMode | 'positions'>('positions');
  const [selectedLoc, setSelectedLoc] = useState('A-01-01');
  const [level, setLevel] = useState('all');
  const [warehouseSearch, setWarehouseSearch] = useState('');
  const [zoom, setZoom] = useState(1);
  const [viewYaw, setViewYaw] = useState(0);
  const dragRef = useRef<{ x: number; active: boolean } | null>(null);
  const [pickOrderId, setPickOrderId] = useState<string | null>(null);
  const [pickChecked, setPickChecked] = useState<Set<string>>(new Set());
  const [pickPlan, setPickPlan] = useState<PickLine[]>([]);
  const [pickOpen, setPickOpen] = useState(false);
  const [moveLot, setMoveLot] = useState<string | null>(null);
  const [detailLoc, setDetailLoc] = useState<string | null>(null);
  const [movesPage, setMovesPage] = useState(0);
  const navigationApplied = useRef<string | null>(null);
  const warehouseId = state ? activeWarehouseId(state) : null;
  const previousWarehouse = useRef(warehouseId);
  const warehouseLots = useMemo(() => state ? scopedLots(state) : [], [state]);
  const query = warehouseSearch.trim().toLowerCase();
  const matchingLocations = useMemo(() => {
    if (!query || !state || !meta) return [];
    const productIds = new Set(state.products
      .filter((p) => (p.name + p.id).toLowerCase().includes(query))
      .map((p) => p.id));
    const occupiedMatches = new Set(warehouseLots
      .filter((lot) => lot.qty > 0 && productIds.has(lot.productId))
      .map((lot) => lot.loc));
    return meta.locations.filter((location) =>
      location.id.toLowerCase().includes(query) || occupiedMatches.has(location.id));
  }, [query, state, meta, warehouseLots]);

  useEffect(() => {
    if (previousWarehouse.current === warehouseId) return;
    previousWarehouse.current = warehouseId;
    setSelectedLoc('');
    setLevel('all');
    setWarehouseSearch('');
    setZoom(1);
    setViewYaw(0);
    setPickOrderId(null);
    setPickChecked(new Set());
    setPickOpen(false);
    setMoveLot(null);
    setDetailLoc(null);
  }, [warehouseId]);

  useEffect(() => {
    if (!meta?.locations.length) return;
    if (!meta.locations.some((l) => l.id === selectedLoc)) {
      setSelectedLoc(meta.locations[0].id);
    }
    if (level !== 'all' && Number(level) > meta.layout.levels) setLevel('all');
  }, [meta, selectedLoc, level]);

  useEffect(() => {
    if (!state || !meta || navigationApplied.current === routeLocation.key) return;
    navigationApplied.current = routeLocation.key;
    if (locState?.loc && meta.locations.some((location) => location.id === locState.loc)) {
      setSelectedLoc(locState.loc);
      setLevel('all');
    }
    if (locState?.productId) {
      const l = warehouseLots.find((x) => x.productId === locState.productId && x.qty > 0);
      if (l) {
        setSelectedLoc(l.loc);
        setWarehouseSearch(locState.productId);
      }
    }
    if (locState?.pick) { setPickOrderId(locState.pick); setPickOpen(true); }
  }, [locState, routeLocation.key, state, meta, warehouseLots]);

  useEffect(() => {
    if (!matchingLocations.length) return;
    setSelectedLoc((current) => matchingLocations.some((location) => location.id === current)
      ? current
      : matchingLocations[0].id);
    setLevel('all');
  }, [matchingLocations]);

  useEffect(() => {
    let cancelled = false;
    setPickChecked(new Set());
    setPickPlan([]);
    if (!pickOrderId) {
      return;
    }
    void api.pickPlan(pickOrderId)
      .then((plan) => { if (!cancelled) setPickPlan(plan); })
      .catch((e) => { if (!cancelled) toast(e.message); });
    return () => { cancelled = true; };
  }, [pickOrderId, state, toast]);

  if (!state || !meta) return null;

  const activeRackId =
    meta.locations.find((l) => l.id === selectedLoc)?.rack ?? selectedLoc.split('-')[0] ?? 'A';

  const selectRack = (rackId: string) => {
    const rackLocations = meta.locations.filter((location) => location.rack === rackId &&
      (level === 'all' || String(location.level) === level));
    const loc =
      rackLocations.find((l) => l.face === 'D') ?? rackLocations[0];
    if (loc) setSelectedLoc(loc.id);
  };

  const mapState = { ...state, lots: warehouseLots };
  const currentWarehouse = state.warehouses.find((warehouse) => warehouse.id === warehouseId);

  const totalCells = meta.locations.length;
  const occupied = meta.locations.filter((l) => qtyAt(state, l.id) > 0).length;
  const loc = meta.locations.find((l) => l.id === selectedLoc) ?? meta.locations[0];
  const lots = warehouseLots.filter((l) => l.loc === loc.id && l.qty > 0);
  const q = qtyAt(state, loc.id);
  const p = lots[0] ? product(state, lots[0].productId) : null;
  const pickLocs = new Set(pickPlan.map((l) => l.loc));
  const low = state.products.filter((pr) => available(state, pr.id) < pr.min);

  const confirmPick = async () => {
    if (!pickOrderId || !pickPlan.length) return;
    if (!pickPlan.every((l) => pickChecked.has(l.id))) {
      toast('Verifica todas las posiciones.');
      return;
    }
    try {
      applyResponse(await api.prepare(pickOrderId));
      setPickOrderId(null);
      setPickOpen(false);
      setPickChecked(new Set());
      toast('Pedido preparado.');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Error');
    }
  };

  const lotForMove = moveLot ? warehouseLots.find((l) => l.id === moveLot) : null;
  const detailLocation = detailLoc ? meta.locations.find((l) => l.id === detailLoc) : null;
  const pickDone = pickPlan.filter((l) => pickChecked.has(l.id)).length;
  const locStatus = q === 0 ? 'free' : q >= loc.capacity ? 'full' : 'stock';
  const movePages = Math.max(1, Math.ceil(state.events.length / MOVES_PER_PAGE));
  const safeMovesPage = Math.min(movesPage, movePages - 1);
  const pageEvents = state.events.slice(safeMovesPage * MOVES_PER_PAGE, (safeMovesPage + 1) * MOVES_PER_PAGE);
  const views: Array<{ id: MapMode | 'positions'; icon: string; label: string }> = [
    { id: 'positions', icon: 'pin', label: 'Ubicaciones' },
    { id: '3d', icon: 'cube', label: 'Vista 3D' },
    { id: 'plan', icon: 'map', label: 'Plano' },
    { id: 'front', icon: 'layers', label: 'Frontal' },
  ];

  const startPicking = () => {
    if (pickOrderId) { setPickOpen(true); return; }
    const pending = state.orders.find((o) => o.status === 'Por preparar');
    if (pending) { setPickOrderId(pending.id); setPickOpen(true); }
    else toast('No hay pedidos por preparar.');
  };

  return (
    <div className="warehouse-positioning-page wh-page">
      <PageHead
        eyebrow="Espacio e inventario"
        title="Centro de ubicaciones"
        desc="Explora tu distribución y encuentra el lugar de cada producto."
        actions={
          <>
            {canStock ? (
              <Btn icon="plus" onClick={() => navigate('/recepcion', { state: { loc: selectedLoc } })}>
                Registrar recepción
              </Btn>
            ) : null}
            {canPick ? (
              <Btn variant="primary" icon="route" onClick={startPicking}>
                Preparar pedido
              </Btn>
            ) : null}
          </>
        }
      />

      <div className="kpis">
        <Kpi
          label="Ocupación"
          value={`${Math.round((occupied / Math.max(totalCells, 1)) * 100)}%`}
          unit=""
          foot={`${occupied}/${totalCells} ubicaciones`}
          icon="warehouse"
        />
        <Kpi
          label="Disponibles"
          value={totalCells - occupied}
          unit="pos."
          foot={`${meta.racks.length} racks · layout activo`}
          icon="grid"
          color="positive"
        />
        <Kpi
          label="Por preparar"
          value={state.orders.filter((o) => o.status === 'Por preparar').length}
          unit="pedidos"
          foot="Picking FEFO"
          icon="orders"
        />
      </div>

      {low.length ? (
        <div className="wh-alert" role="status">
          <Icon name="alert" />
          <span>
            <strong>{low.length} {low.length === 1 ? 'producto bajo el mínimo' : 'productos bajo el mínimo'}</strong>
            {' · '}{low[0].name}{low.length > 1 ? ` y ${low.length - 1} más` : ''}
          </span>
          <Btn variant="ghost" icon="arrow" onClick={() => navigate('/compras')}>Revisar abastecimiento</Btn>
        </div>
      ) : null}

      {pickOrderId ? (
        <div className="wh-pick-banner" role="status">
          <span className="wh-pick-banner-icon"><Icon name="route" /></span>
          <div>
            <strong>Picking en curso · {pickOrderId}</strong>
            <span>{pickDone} de {pickPlan.length} posiciones verificadas · las posiciones del recorrido se resaltan en el mapa</span>
          </div>
          <Btn variant="primary" icon="check" onClick={() => setPickOpen(true)}>Ver lista</Btn>
          <button type="button" className="icon-btn" aria-label="Cancelar picking" onClick={() => { setPickOrderId(null); setPickOpen(false); }}>
            <Icon name="close" />
          </button>
        </div>
      ) : null}

      <section className="panel wh-map-panel">
        <header className="wh-map-head">
          <div>
            <div className="panel-title">
              <Icon name="warehouse" />
              {currentWarehouse?.name ?? state.settings.warehouse}
            </div>
            <div className="panel-subtitle">
              {currentWarehouse?.city ? `${currentWarehouse.city} · ` : ''}
              {meta.racks.length} racks · {totalCells} ubicaciones
            </div>
          </div>
          {canLayout ? (
            <Btn variant="ghost" icon="building" onClick={() => navigate(warehouseId ? `/bodegas?edit=${encodeURIComponent(warehouseId)}&step=layout` : '/bodegas')}>
              Editar distribución
            </Btn>
          ) : null}
        </header>

        <div className="wh-toolbar">
          <div className="segmented" role="group" aria-label="Vista de la bodega">
            {views.map((view) => (
              <button key={view.id} type="button" aria-pressed={mapMode === view.id} className={mapMode === view.id ? 'active' : ''} onClick={() => setMapMode(view.id)}>
                <Icon name={view.icon} />{view.label}
              </button>
            ))}
          </div>
          <div className="wh-toolbar-search search-input">
            <Icon name="search" />
            <input
              type="search"
              aria-label="Buscar producto o código de ubicación en esta bodega"
              aria-describedby={query ? 'warehouse-search-status' : undefined}
              value={warehouseSearch}
              onChange={(e) => setWarehouseSearch(e.target.value)}
              placeholder="Producto o código de ubicación…"
            />
          </div>
          <Select value={level} onChange={(e) => {
            const nextLevel = e.target.value;
            setLevel(nextLevel);
            if (nextLevel !== 'all') {
              const nextLocation = meta.locations.find((location) => location.rack === activeRackId && String(location.level) === nextLevel);
              if (nextLocation) setSelectedLoc(nextLocation.id);
            }
          }} aria-label="Filtrar por nivel">
            <option value="all">Todos los niveles</option>
            {Array.from({ length: meta.layout.levels }, (_, i) => i + 1).map((l) => (
              <option key={l} value={l}>Nivel {l}</option>
            ))}
          </Select>
          <button
            type="button"
            className="icon-btn"
            aria-label="Restablecer vista"
            title="Restablecer vista"
            onClick={() => { setZoom(1); setLevel('all'); setViewYaw(0); setWarehouseSearch(''); }}
          >
            <Icon name="refresh" />
          </button>
        </div>

        {query ? (
          <div className={`wh-search-strip ${matchingLocations.length ? '' : 'no-results'}`}>
            <p id="warehouse-search-status" role="status">
              <Icon name={matchingLocations.length ? 'check' : 'info'} />
              {matchingLocations.length
                ? `${matchingLocations.length} ${matchingLocations.length === 1 ? 'ubicación encontrada' : 'ubicaciones encontradas'}`
                : 'Sin coincidencias en esta bodega.'}
            </p>
            {matchingLocations.length > 1 ? (
              <Select aria-label="Ir a una coincidencia" value={matchingLocations.some((location) => location.id === selectedLoc) ? selectedLoc : ''} onChange={(e) => {
                setSelectedLoc(e.target.value);
                setLevel('all');
              }}>
                <option value="" disabled>Ir a una coincidencia…</option>
                {matchingLocations.map((location) => (
                  <option key={location.id} value={location.id}>{location.id} · {qtyAt(state, location.id)} u.</option>
                ))}
              </Select>
            ) : null}
          </div>
        ) : null}

        {mapMode === '3d' ? (
          <div className="wh-subbar">
            <span><Icon name="cube" /> Girar vista</span>
            <div className="wh-subbar-controls">
              <button type="button" className="btn small" aria-label="Girar vista a la izquierda" disabled={viewYaw <= YAW_MIN} onClick={() => setViewYaw((y) => Math.max(YAW_MIN, y - Math.PI / 12))}>◀</button>
              <input type="range" min={YAW_MIN} max={YAW_MAX} step={0.04} value={viewYaw} onChange={(e) => setViewYaw(Number(e.target.value))} aria-label="Ángulo de rotación 3D" />
              <button type="button" className="btn small" aria-label="Girar vista a la derecha" disabled={viewYaw >= YAW_MAX} onClick={() => setViewYaw((y) => Math.min(YAW_MAX, y + Math.PI / 12))}>▶</button>
              <span className="wh-subbar-value">{Math.round((viewYaw * 180) / Math.PI)}°</span>
            </div>
          </div>
        ) : null}
        {mapMode === 'front' || mapMode === 'plan' ? (
          <div className="wh-subbar">
            <span>Rack</span>
            <div className="rack-picker" role="group" aria-label="Seleccionar rack">
              {meta.racks.map((r) => (
                <button key={r.id} type="button" aria-pressed={activeRackId === r.id} aria-label={`Rack ${r.id}`} className={activeRackId === r.id ? 'active' : ''} onClick={() => selectRack(r.id)}>
                  {r.id}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {mapMode === 'positions' ? (
          <WarehousePositioning
            key={warehouseId}
            state={mapState}
            layout={meta.layout}
            locations={meta.locations}
            selectedLoc={selectedLoc}
            level={level}
            query={query}
            matches={matchingLocations}
            pickLocs={pickLocs}
            onSelect={setSelectedLoc}
            onSelectRack={selectRack}
            onOpenDetail={(id) => { setSelectedLoc(id); setDetailLoc(id); }}
          />
        ) : (
          <div
            className="warehouse-canvas"
            id="warehouse-map"
            onPointerDown={(e) => {
              if (mapMode !== '3d' || e.button !== 0 || (e.target as Element).closest('button, input, select')) return;
              dragRef.current = { x: e.clientX, active: true };
              (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
            }}
            onPointerMove={(e) => {
              if (mapMode !== '3d' || !dragRef.current?.active) return;
              const dx = e.clientX - dragRef.current.x;
              dragRef.current.x = e.clientX;
              setViewYaw((y) => Math.min(YAW_MAX, Math.max(YAW_MIN, y + dx * 0.008)));
            }}
            onPointerUp={() => { if (dragRef.current) dragRef.current.active = false; }}
            onPointerCancel={() => { dragRef.current = null; }}
            onLostPointerCapture={() => { dragRef.current = null; }}
            style={mapMode === '3d' ? { cursor: 'grab' } : undefined}
          >
            <WarehouseMap
              state={mapState}
              racks={meta.racks}
              layout={meta.layout}
              locations={meta.locations}
              mode={mapMode}
              selectedLoc={selectedLoc}
              level={level}
              warehouseSearch={warehouseSearch.trim()}
              pickLocs={pickLocs}
              zoom={zoom}
              yaw={viewYaw}
              onSelect={setSelectedLoc}
              onSelectRack={(rack) => { selectRack(rack); setMapMode('front'); }}
            />
            <div className="map-corner">
              <span className="live-dot" />
              {query ? `${matchingLocations.length} coincidencias` : 'Inventario conectado'}
            </div>
            {mapMode === '3d' ? (
              <div className="map-zoom">
                <button type="button" aria-label="Acercar" disabled={zoom >= 1.45} onClick={() => setZoom((z) => Math.min(1.45, z + 0.1))}>+</button>
                <button type="button" aria-label="Alejar" disabled={zoom <= 0.75} onClick={() => setZoom((z) => Math.max(0.75, z - 0.1))}>−</button>
              </div>
            ) : null}
          </div>
        )}

        <footer className={`wh-selection is-${locStatus}`} aria-live="polite">
          <div className="wh-selection-code">
            <small>Seleccionada</small>
            <strong>{loc.id}</strong>
          </div>
          <div className="wh-selection-meta">
            <span className={`loc-status-pill is-${locStatus === 'stock' ? 'partial' : locStatus}`}>
              {locStatus === 'free' ? 'Libre' : locStatus === 'full' ? 'Llena' : 'Con stock'}
            </span>
            <span className="wh-selection-product">{p ? p.name : 'Sin producto asignado'}</span>
            <span className="wh-selection-cap">
              <span className="loc-capacity-track is-partial"><span style={{ width: `${Math.min(100, (q / Math.max(loc.capacity, 1)) * 100)}%` }} /></span>
              {q}/{loc.capacity} u.
            </span>
          </div>
          <Btn variant="primary" icon="eye" onClick={() => setDetailLoc(loc.id)}>Ver detalle</Btn>
        </footer>
      </section>

      <ExitLayer
        state={state}
        onLocate={(target) => {
          setSelectedLoc(target);
          setLevel('all');
          document.getElementById('warehouse-map')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
        }}
      />

      <section className="panel wh-moves">
        <header className="wh-moves-head">
          <span className="panel-title"><Icon name="history" /> Últimos movimientos</span>
          <span className="wh-moves-count">{state.events.length} registros</span>
        </header>
        <div className="table-scroll">
          <table className="wh-moves-table">
            <thead>
              <tr>
                <th>Tipo</th>
                <th>Producto</th>
                <th className="num">Cant.</th>
                <th>Origen → Destino</th>
                <th>Hora</th>
              </tr>
            </thead>
            <tbody>
              {pageEvents.length ? pageEvents.map((e) => (
                <tr key={e.id}>
                  <td><span className={`wh-move-tag ${moveTone(e.type)}`}>{e.type}</span></td>
                  <td>
                    <strong>{product(state, e.productId)?.name ?? e.productId}</strong>
                    {e.batch ? <span className="sub">Lote {e.batch}</span> : null}
                  </td>
                  <td className="num">{e.qty}</td>
                  <td className="wh-move-route">{e.from || '—'} <Icon name="arrow" /> {e.to || '—'}</td>
                  <td className="wh-move-time">{time(e.at)}</td>
                </tr>
              )) : (
                <tr><td colSpan={5} className="wh-moves-empty">Aún no hay movimientos.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        {movePages > 1 ? (
          <nav className="wh-pager" aria-label="Paginación de movimientos">
            <span>
              {safeMovesPage * MOVES_PER_PAGE + 1}–{Math.min(state.events.length, (safeMovesPage + 1) * MOVES_PER_PAGE)} de {state.events.length}
            </span>
            <div>
              <button type="button" className="icon-btn" aria-label="Página anterior" disabled={safeMovesPage === 0} onClick={() => setMovesPage(safeMovesPage - 1)}>
                <Icon name="chevron-left" />
              </button>
              <span className="wh-pager-current">{safeMovesPage + 1} / {movePages}</span>
              <button type="button" className="icon-btn" aria-label="Página siguiente" disabled={safeMovesPage >= movePages - 1} onClick={() => setMovesPage(safeMovesPage + 1)}>
                <Icon name="chevron" />
              </button>
            </div>
          </nav>
        ) : null}
      </section>

      {detailLocation ? (
        <LocationDetailModal
          state={state}
          location={detailLocation}
          lots={warehouseLots.filter((l) => l.loc === detailLocation.id && l.qty > 0)}
          canStock={canStock}
          onMoveLot={(lotId) => { setDetailLoc(null); setMoveLot(lotId); }}
          onClose={() => setDetailLoc(null)}
        />
      ) : null}

      {pickOrderId && pickOpen ? (
        <PickingModal
          state={state}
          orderId={pickOrderId}
          plan={pickPlan}
          checked={pickChecked}
          onToggle={(line, checked) => {
            const next = new Set(pickChecked);
            if (checked) next.add(line.id);
            else next.delete(line.id);
            setPickChecked(next);
            setSelectedLoc(line.loc);
          }}
          onLocate={(target) => { setSelectedLoc(target); setLevel('all'); setPickOpen(false); }}
          onConfirm={() => void confirmPick()}
          onClose={() => setPickOpen(false)}
        />
      ) : null}

      {lotForMove ? <WarehouseTransferDialog key={`${warehouseId}:${lotForMove.id}`} state={state} lot={lotForMove} onClose={() => setMoveLot(null)} onMoved={(destination) => { setSelectedLoc(destination); setLevel('all'); setWarehouseSearch(''); setMoveLot(null); }} /> : null}
    </div>
  );
}
