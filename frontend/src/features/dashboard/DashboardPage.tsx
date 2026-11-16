import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppState } from '../../shared/hooks/AppStateProvider';
import { api } from '../../shared/api/client';
import {
  activeWarehouseId,
  available,
  client,
  money,
  num,
  orderValue,
  statusColor,
  stock,
} from '../../shared/lib/inventory';
import { buildForecast } from '../../shared/lib/forecast';
import { Badge, Btn, Kpi, KpiGrid, PageHead } from '../../shared/components/ui';
import { Icon } from '../../shared/components/Icon';
import '../../styles/dashboard.css';

export function DashboardPage() {
  const { state, meta, applyResponse, toast } = useAppState();
  const navigate = useNavigate();
  const [tab, setTab] = useState<'pending' | 'all'>('pending');
  const [whFilter, setWhFilter] = useState('all');
  const [whBusy, setWhBusy] = useState(false);
  const forecast = useMemo(() => (state ? buildForecast(state) : null), [state]);
  if (!state || !meta || !forecast) return null;

  const totalCells = meta.locations.length;
  const occupied = meta.locations.filter((l) => {
    const q = state.lots.filter((lot) => lot.loc === l.id).reduce((n, lot) => n + lot.qty, 0);
    return q > 0;
  }).length;
  const occupancyPct = Math.round((occupied / Math.max(totalCells, 1)) * 100);
  const pending = state.orders.filter((o) => o.status === 'Por preparar');
  const activeOrders = state.orders.filter((o) => o.status !== 'Entregado');
  const low = state.products.filter((p) => available(state, p.id) < p.min);
  const units = state.products.reduce((n, p) => n + available(state, p.id), 0);
  const stockValue = state.products.reduce((n, p) => n + stock(state, p.id) * p.price, 0);
  const listed = tab === 'pending' ? pending : activeOrders;
  const productionAlerts =
    forecast.productionRisks.length ||
    forecast.recommendations.filter((r) => r.urgency === 'now').length;
  const activeWh = activeWarehouseId(state);

  const onWarehouseChange = async (value: string) => {
    if (whBusy) return;
    if (value === 'all') {
      setWhFilter('all');
      return;
    }
    if (value === activeWh) {
      setWhFilter(value);
      return;
    }
    setWhBusy(true);
    try {
      applyResponse(await api.activateWarehouse(value));
      setWhFilter(value);
      const name = state.warehouses.find((w) => w.id === value)?.name ?? 'Bodega';
      toast(`${name} activa.`);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'No se pudo cambiar de bodega.');
    } finally {
      setWhBusy(false);
    }
  };

  return (
    <>
      <PageHead
        eyebrow="Panel de control"
        title="Resumen de operaciones"
        desc="Pedidos, stock y movimientos de tu operación de un vistazo."
        actions={
          <>
            <Btn icon="receive" onClick={() => navigate('/recepcion')}>
              Registrar entrada
            </Btn>
            <Btn variant="primary" icon="plus" onClick={() => navigate('/pedidos/nuevo')}>
              Nuevo pedido
            </Btn>
          </>
        }
      >
        <label className="dash-wh">
          <Icon name="warehouse" />
          <select
            value={whFilter}
            disabled={whBusy}
            onChange={(e) => void onWarehouseChange(e.target.value)}
            aria-label="Bodega"
          >
            <option value="all">Todas las bodegas</option>
            {state.warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </label>
      </PageHead>
      <KpiGrid label="Resumen de la operación">
        <Kpi
          label="Pedidos activos"
          icon="orders"
          value={activeOrders.length}
          caption={<Badge text={`${pending.length} por preparar`} color="amber" />}
        />
        <Kpi
          label="Productos bajo mínimo"
          icon="alert"
          value={low.length}
          tone={low.length ? 'warning' : 'default'}
          caption={
            <button type="button" onClick={() => navigate('/inventario')}>
              Revisar reposición
            </button>
          }
        />
        <Kpi
          label="Unidades disponibles"
          icon="box"
          value={num(units)}
          caption="Descontando reservas"
        />
        <Kpi
          label="Ocupación de bodega"
          icon="warehouse"
          value={`${occupancyPct}%`}
          caption={`${occupied} de ${totalCells} posiciones`}
          progress={occupancyPct}
        />
      </KpiGrid>
      <div className="dash">
        <div className="dash-mid">
          <section className="panel dash-orders">
            <div className="panel-head dash-orders-head">
              <span className="panel-title">Pedidos por preparar</span>
              <div className="dash-tabs" role="tablist">
                <button
                  type="button"
                  role="tab"
                  aria-selected={tab === 'pending'}
                  className={tab === 'pending' ? 'active' : ''}
                  onClick={() => setTab('pending')}
                >
                  Por preparar ({pending.length})
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={tab === 'all'}
                  className={tab === 'all' ? 'active' : ''}
                  onClick={() => setTab('all')}
                >
                  Todos ({activeOrders.length})
                </button>
              </div>
            </div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Pedido</th>
                    <th>Cliente</th>
                    <th>Total</th>
                    <th>Estado</th>
                    <th>Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {listed.length ? (
                    listed.slice(0, 6).map((o) => (
                      <tr key={o.id}>
                        <td>
                          <strong>{o.id}</strong>
                        </td>
                        <td>{client(state, o.clientId)?.name}</td>
                        <td>
                          <strong>{money(orderValue(state, o))}</strong>
                        </td>
                        <td>
                          <Badge text={o.status} color={statusColor(o.status)} />
                        </td>
                        <td>
                          {o.status === 'Por preparar' ? (
                            <Btn
                              variant="small"
                              onClick={() => navigate('/bodega', { state: { pick: o.id } })}
                            >
                              Preparar
                            </Btn>
                          ) : (
                            <Btn variant="small" onClick={() => navigate('/pedidos')}>
                              Ver
                            </Btn>
                          )}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} className="dash-empty-row">
                        No hay pedidos en esta vista.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="panel dash-prio">
            <div className="panel-head">
              <span className="panel-title">Prioridades de hoy</span>
            </div>
            <div className="dash-prio-list">
              <article className="dash-prio-item">
                <div className="dash-prio-icon">
                  <Icon name="alert" />
                </div>
                <div className="dash-prio-body">
                  <strong>{low.length} productos bajo mínimo</strong>
                  <small>Consulta existencias y mínimos.</small>
                  <button type="button" onClick={() => navigate('/inventario')}>
                    Revisar productos
                  </button>
                </div>
              </article>
              <article className="dash-prio-item">
                <div className="dash-prio-icon">
                  <Icon name="orders" />
                </div>
                <div className="dash-prio-body">
                  <strong>{pending.length} pedidos por preparar</strong>
                  <small>Consulta posiciones y lotes.</small>
                  <button type="button" onClick={() => navigate('/bodega')}>
                    Ir a preparación
                  </button>
                </div>
              </article>
              <article className="dash-prio-item">
                <div className="dash-prio-icon">
                  <Icon name="spark" />
                </div>
                <div className="dash-prio-body">
                  <strong>
                    {productionAlerts} alerta{productionAlerts === 1 ? '' : 's'} de producción
                  </strong>
                  <span className="dash-prio-tag">Por validar</span>
                  <small>Revisa el stock antes de actuar.</small>
                  <button type="button" onClick={() => navigate('/compras')}>
                    Revisar alertas
                  </button>
                </div>
              </article>
            </div>
          </section>
        </div>

        <div className="dash-bottom">
          <section className="panel">
            <div className="panel-head">
              <span className="panel-title">Inventario por línea</span>
            </div>
            <div className="dash-lines">
              {meta.categories.map((c) => {
                const q = state.products
                  .filter((p) => p.category === c)
                  .reduce((n, p) => n + stock(state, p.id), 0);
                return (
                  <button
                    type="button"
                    className="dash-line"
                    key={c}
                    onClick={() => navigate(`/inventario?cat=${encodeURIComponent(c)}`)}
                  >
                    <span>{c}</span>
                    <strong>{num(q)}</strong>
                  </button>
                );
              })}
            </div>
            <p className="dash-lines-note">Las unidades físicas incluyen reservas.</p>
          </section>

          <section className="panel dash-value">
            <div className="panel-head">
              <span className="panel-title">Valor del inventario</span>
            </div>
            <div className="dash-value-body">
              <div className="dash-value-amount">{money(stockValue)}</div>
              <p>Valorado a precio de venta</p>
              <button
                type="button"
                className="dash-kpi-link"
                onClick={() => navigate('/inventario')}
              >
                Ver detalle
              </button>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
