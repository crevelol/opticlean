import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppState } from '../../shared/hooks/AppStateProvider';
import { client, money, orderWeight } from '../../shared/lib/inventory';
import { Badge, Btn, Kpi, KpiGrid, PageHead } from '../../shared/components/ui';
import { api } from '../../shared/api/client';
import { RouteMap } from './RouteMap';
import {
  FLEET as DEFAULT_FLEET,
  buildRouteHistory,
  fmtHours,
  opsDate,
  sectorOf,
  type Truck,
} from './fleet';
import type { Order } from '../../shared/types';
import '../../styles/logistics.css';

function shiftDays(base: string, delta: number) {
  const d = new Date(`${base}T12:00:00`);
  d.setDate(d.getDate() + delta);
  return opsDate(d.toISOString());
}

export function RouteHistoryPage() {
  const { state } = useAppState();
  const navigate = useNavigate();
  const [fleet, setFleet] = useState<Truck[]>(DEFAULT_FLEET);
  useEffect(() => {
    void api
      .fleet()
      .then((r) => {
        if (r.trucks?.length) setFleet(r.trucks);
      })
      .catch(() => {});
  }, []);

  const today = opsDate();
  const [dateFrom, setDateFrom] = useState(() => shiftDays(today, -30));
  const [dateTo, setDateTo] = useState(today);
  const [truckId, setTruckId] = useState('all');
  const [warehouseId, setWarehouseId] = useState('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const history = useMemo(() => (state ? buildRouteHistory(state, fleet) : []), [state, fleet]);
  const filtered = useMemo(
    () =>
      history.filter((h) => {
        if (h.date < dateFrom || h.date > dateTo) return false;
        if (truckId !== 'all' && h.truckId !== truckId) return false;
        if (warehouseId !== 'all' && h.warehouseId !== warehouseId) return false;
        return true;
      }),
    [history, dateFrom, dateTo, truckId, warehouseId],
  );

  if (!state) return null;

  const selected = filtered.find((h) => h.id === selectedId) ?? filtered[0] ?? null;
  const selectedOrders: Order[] = selected
    ? selected.orderIds
        .map((id) => state.orders.find((o) => o.id === id))
        .filter((o): o is Order => Boolean(o))
    : [];

  const totalKm = filtered.reduce((n, h) => n + h.km, 0);
  const totalCost = filtered.reduce((n, h) => n + h.cost, 0);
  const totalDelivered = filtered.reduce((n, h) => n + h.delivered, 0);

  const statusColor = (status: string) => {
    if (status === 'Completada') return 'green';
    if (status === 'En ruta') return 'blue';
    if (status === 'Parcial') return 'amber';
    return 'red';
  };

  return (
    <div className="log-page log-history-page">
      <PageHead
        eyebrow="Logística"
        title="Historial de rutas"
        desc="Rutas reales agrupadas por vehículo y fecha a partir de despachos y entregas."
        actions={
          <>
            <Btn icon="route" onClick={() => navigate('/logistica/rutas')}>
              Ver rutas activas
            </Btn>
            <Btn icon="truck" onClick={() => navigate('/logistica')}>
              Distribución
            </Btn>
          </>
        }
      />

      <KpiGrid label="Resumen del historial">
        <Kpi label="Rutas filtradas" icon="route" value={filtered.length} caption="en el periodo" />
        <Kpi label="Entregas" icon="check" value={totalDelivered} caption="confirmadas" />
        <Kpi label="Distancia" icon="map" value={totalKm} unit="km" caption="estimados" />
        <Kpi label="Costo" icon="spark" value={money(totalCost)} caption="estimado del periodo" />
      </KpiGrid>

      <section className="log-panel log-history-filters">
        <div className="log-filter-grid">
          <label>
            Desde
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </label>
          <label>
            Hasta
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </label>
          <label>
            Vehículo
            <select value={truckId} onChange={(e) => setTruckId(e.target.value)}>
              <option value="all">Todos los vehículos</option>
              {fleet.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label} · {t.plate}
                </option>
              ))}
            </select>
          </label>
          <label>
            Bodega
            <select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
              <option value="all">Todas las bodegas</option>
              {state.warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name} · {w.city}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <div className="log-history-layout">
        <section className="log-panel">
          <header>
            <h2>Rutas del periodo</h2>
            <p>
              {filtered.length
                ? `${filtered.length} ruta(s) con despachos reales`
                : 'Sin rutas en este filtro'}
            </p>
          </header>
          {filtered.length ? (
            <ul className="log-history-list">
              {filtered.map((h) => (
                <li key={h.id}>
                  <button
                    type="button"
                    className={`log-history-item ${selected?.id === h.id ? 'is-active' : ''}`}
                    onClick={() => setSelectedId(h.id)}
                  >
                    <span
                      className={`log-history-dot ${
                        h.status === 'Completada'
                          ? 'ok'
                          : h.status === 'Parcial' || h.status === 'En ruta'
                            ? 'partial'
                            : 'issue'
                      }`}
                    />
                    <span>
                      <strong>
                        {h.label} · {h.city}
                      </strong>
                      <small>
                        {h.date} · {h.warehouseName} · {h.delivered}/{h.stops} entregas
                        {h.pending ? ` · ${h.pending} en ruta` : ''}
                      </small>
                    </span>
                    <span className="log-history-meta">
                      <Badge text={h.status} color={statusColor(h.status)} />
                      <em>{money(h.cost)}</em>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="log-empty">
              No hay rutas con esos filtros. Despacha y confirma entregas para generar historial.
            </p>
          )}
        </section>

        <section className="log-panel">
          <header>
            <h2>Detalle de ruta</h2>
            <p>{selected ? `${selected.id} · ${selected.plate}` : 'Selecciona una ruta'}</p>
          </header>
          {selected ? (
            <div className="log-history-detail">
              <dl className="log-detail-grid">
                <div>
                  <dt>Fecha</dt>
                  <dd>{selected.date}</dd>
                </div>
                <div>
                  <dt>Vehículo</dt>
                  <dd>
                    {selected.label} · {selected.plate}
                  </dd>
                </div>
                <div>
                  <dt>Ciudad</dt>
                  <dd>{selected.city}</dd>
                </div>
                <div>
                  <dt>Bodega origen</dt>
                  <dd>{selected.warehouseName}</dd>
                </div>
                <div>
                  <dt>Paradas</dt>
                  <dd>
                    {selected.delivered}/{selected.stops} entregadas
                    {selected.pending ? ` · ${selected.pending} en ruta` : ''}
                    {selected.incidents ? ` · ${selected.incidents} incidencias` : ''}
                  </dd>
                </div>
                <div>
                  <dt>Carga</dt>
                  <dd>{selected.kg.toLocaleString('es-EC')} kg</dd>
                </div>
                <div>
                  <dt>Distancia</dt>
                  <dd>{selected.km} km est.</dd>
                </div>
                <div>
                  <dt>Tiempo / costo</dt>
                  <dd>
                    {fmtHours(selected.etaHours)} · {money(selected.cost)}
                  </dd>
                </div>
              </dl>

              {selectedOrders.length ? (
                <>
                  <div className="log-history-map">
                    <RouteMap
                      state={state}
                      orders={selectedOrders}
                      city={selected.city}
                      activeId={selectedOrders.find((o) => o.status !== 'Entregado')?.id}
                    />
                  </div>
                  <div className="log-history-orders">
                    <h3>Pedidos de la ruta</h3>
                    <ul>
                      {selectedOrders.map((o) => {
                        const c = client(state, o.clientId);
                        return (
                          <li key={o.id}>
                            <div>
                              <strong>{o.id}</strong>
                              <small>
                                {c?.name ?? o.clientId} · {sectorOf(state, o)} ·{' '}
                                {Math.round(orderWeight(state, o))} kg
                              </small>
                            </div>
                            <Badge
                              text={o.status}
                              color={
                                o.status === 'Entregado'
                                  ? 'green'
                                  : o.status === 'Incidencia'
                                    ? 'red'
                                    : 'blue'
                              }
                            />
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                </>
              ) : null}

              <div className="log-history-detail-actions">
                <Btn
                  variant="primary"
                  icon="route"
                  onClick={() =>
                    navigate('/logistica/rutas', { state: { truckId: selected.truckId } })
                  }
                >
                  Abrir Mi ruta
                </Btn>
                <Btn icon="truck" onClick={() => navigate('/logistica')}>
                  Ir a distribución
                </Btn>
                <Btn
                  icon="history"
                  onClick={() =>
                    navigate('/trazabilidad', {
                      state: { q: selected.plate },
                    })
                  }
                >
                  Ver trazabilidad
                </Btn>
              </div>
            </div>
          ) : (
            <p className="log-empty">Elige una ruta del listado para ver el detalle.</p>
          )}
        </section>
      </div>
    </div>
  );
}
