import { useMemo, useState } from 'react';
import { api } from '../api';
import { clearSession, type AuthUser } from '../auth';
import { Icon } from '../components/Icon';
import { RouteMap } from '../components/RouteMap';
import {
  fleetOf,
  cityOf,
  clientOf,
  fmtHours,
  measureRoute,
  orderWeight,
  packagesOf,
  routeOrders,
  sectorOf,
} from '../lib/fleet';
import type { AppState, Order } from '../types';

type Props = {
  state: AppState;
  user: AuthUser;
  onRefresh: () => Promise<void>;
};

type Tab = 'pendientes' | 'listos' | 'camiones';

export function DispatchPage({ state, user, onRefresh }: Props) {
  const [tab, setTab] = useState<Tab>('listos');
  const fleet = useMemo(() => fleetOf(state), [state]);
  const stagedByTruck = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const truck of fleet) {
      const ids = state.orders
        .filter((o) => o.status === 'Preparado' && o.stagedPlate === truck.plate)
        .map((o) => o.id);
      if (ids.length) map[truck.id] = ids;
    }
    return map;
  }, [state.orders, fleet]);
  const [selectedTruck, setSelectedTruck] = useState(fleet[0]?.id ?? '');
  const [busy, setBusy] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  const stagedIds = useMemo(() => new Set(Object.values(stagedByTruck).flat()), [stagedByTruck]);

  const pendientes = useMemo(
    () => state.orders.filter((o) => o.status === 'Por preparar' && !o.id.startsWith('PED-H')),
    [state.orders],
  );
  const listos = useMemo(
    () =>
      state.orders.filter(
        (o) => o.status === 'Preparado' && !stagedIds.has(o.id) && !o.vehicle && !o.id.startsWith('PED-H'),
      ),
    [state.orders, stagedIds],
  );

  const truck = fleet.find((t) => t.id === selectedTruck) ?? fleet[0];
  if (!truck) {
    return (
      <div className="page">
        <p className="subtle">No hay vehículos activos en la flota. Pide a administración que registre uno.</p>
      </div>
    );
  }
  const stagedOrders = (stagedByTruck[truck.id] ?? [])
    .map((id) => state.orders.find((o) => o.id === id))
    .filter((o): o is Order => Boolean(o));
  const onRoute = routeOrders(state, truck.plate);
  const stagedKg = Math.round(stagedOrders.reduce((n, o) => n + orderWeight(state, o), 0));

  const markReady = async (orderId: string) => {
    setBusy(true);
    setError('');
    try {
      await api.prepareOrder(orderId);
      await onRefresh();
      setMsg(`${orderId.replace('PED-', '#')} listo`);
      setTab('listos');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo preparar');
    } finally {
      setBusy(false);
    }
  };

  const stageOrder = async (truckId: string, orderId: string) => {
    const target = fleet.find((t) => t.id === truckId);
    if (!target) return;
    setBusy(true);
    setError('');
    try {
      await api.stageOrders([orderId], target.plate);
      await onRefresh();
      setSelectedTruck(truckId);
      setMsg('Pedido cargado en camión');
      setTab('camiones');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar');
    } finally {
      setBusy(false);
    }
  };

  const unstage = async (orderId: string) => {
    setBusy(true);
    setError('');
    try {
      await api.unstageOrders([orderId]);
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo retirar');
    } finally {
      setBusy(false);
    }
  };

  const sendTruck = async (truckId: string) => {
    const t = fleet.find((x) => x.id === truckId);
    const ids = stagedByTruck[truckId] ?? [];
    if (!t || !ids.length) return;
    setBusy(true);
    setError('');
    try {
      await api.dispatch(ids, t.plate);
      await onRefresh();
      setMsg(`${t.label} enviado`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo enviar');
    } finally {
      setBusy(false);
    }
  };

  const runAi = async () => {
    if (!listos.length) {
      setMsg('No hay pedidos listos');
      setTab('listos');
      return;
    }
    setAiBusy(true);
    setError('');
    try {
      const res = await api.logisticsAutoAssign({
        orderIds: listos.map((o) => o.id),
        stagedByTruck,
      });
      const plan = res.plan;
      for (const [truckId, ids] of Object.entries(plan.byTruck)) {
        const target = fleet.find((t) => t.id === truckId);
        if (target && ids.length) await api.stageOrders(ids, target.plate);
      }
      await onRefresh();
      const first = Object.keys(plan.byTruck)[0];
      if (first) setSelectedTruck(first);
      setTab('camiones');
      setMsg(plan.summary);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'IA no disponible');
    } finally {
      setAiBusy(false);
    }
  };

  return (
    <div className="page dsp-page">
      <header className="drv-top">
        <div>
          <div className="eyebrow">Despacho · Logística</div>
          <h1>Distribución</h1>
          <p>
            {user.name} · Asigna y envía camiones
          </p>
        </div>
        <div className="drv-top-actions">
          <button type="button" className="btn primary small" disabled={aiBusy || busy} onClick={() => void runAi()}>
            <Icon name="spark" />
            {aiBusy ? 'IA…' : 'IA autoasignar'}
          </button>
          <button
            type="button"
            className="btn ghost small"
            onClick={() => {
              clearSession();
              window.location.assign('/login');
            }}
          >
            Salir
          </button>
        </div>
      </header>

      {(msg || error) && (
        <p className={error ? 'login-error' : 'dsp-msg'}>{error || msg}</p>
      )}

      <div className="dsp-tabs" role="tablist">
        <button type="button" className={tab === 'pendientes' ? 'is-active' : ''} onClick={() => setTab('pendientes')}>
          Pendientes <span>{pendientes.length}</span>
        </button>
        <button type="button" className={tab === 'listos' ? 'is-active' : ''} onClick={() => setTab('listos')}>
          Listos <span>{listos.length}</span>
        </button>
        <button type="button" className={tab === 'camiones' ? 'is-active' : ''} onClick={() => setTab('camiones')}>
          Camiones
        </button>
      </div>

      {tab === 'pendientes' ? (
        <section className="card">
          <div className="drv-section-head">
            <h2>Por preparar</h2>
            <small>Marca listo para despacho</small>
          </div>
          {pendientes.length ? (
            <ul className="dsp-list">
              {pendientes.map((o) => (
                <li key={o.id}>
                  <div>
                    <strong>{o.id.replace('PED-', 'Pedido #')}</strong>
                    <small>
                      {cityOf(state, o)} · {sectorOf(state, o)} · {clientOf(state, o.clientId)?.name} ·{' '}
                      {orderWeight(state, o).toFixed(1)} kg
                    </small>
                  </div>
                  <button
                    type="button"
                    className="btn primary small"
                    disabled={busy}
                    onClick={() => void markReady(o.id)}
                  >
                    <Icon name="check" /> Listo
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="subtle">No hay pendientes.</p>
          )}
        </section>
      ) : null}

      {tab === 'listos' ? (
        <section className="card">
          <div className="drv-section-head">
            <h2>Listos para cargar</h2>
            <small>Asigna a un camión</small>
          </div>
          <label className="field">
            <span>Camión destino</span>
            <select value={selectedTruck} onChange={(e) => setSelectedTruck(e.target.value)}>
              {fleet.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label} · {t.city} · {t.plate}
                </option>
              ))}
            </select>
          </label>
          {listos.length ? (
            <ul className="dsp-list">
              {listos.map((o) => (
                <li key={o.id}>
                  <div>
                    <strong>{o.id.replace('PED-', 'Pedido #')}</strong>
                    <small>
                      {cityOf(state, o)} · {sectorOf(state, o)} · {packagesOf(o)} prod. ·{' '}
                      {orderWeight(state, o).toFixed(1)} kg
                    </small>
                  </div>
                  <button type="button" className="btn primary small" onClick={() => stageOrder(selectedTruck, o.id)}>
                    <Icon name="truck" /> Cargar
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="subtle">No hay listos. Prepara en Pendientes o en Bodega.</p>
          )}
        </section>
      ) : null}

      {tab === 'camiones' ? (
        <>
          <section className="dsp-truck-pick">
            {fleet.map((t) => {
              const n = (stagedByTruck[t.id] ?? []).length + routeOrders(state, t.plate).length;
              return (
                <button
                  key={t.id}
                  type="button"
                  className={`dsp-truck-chip ${selectedTruck === t.id ? 'is-active' : ''}`}
                  onClick={() => setSelectedTruck(t.id)}
                >
                  <strong>{t.label}</strong>
                  <small>
                    {t.city} · {n}
                  </small>
                </button>
              );
            })}
          </section>

          <section className="card">
            <div className="drv-section-head">
              <h2>
                {truck.label} · {truck.plate}
              </h2>
              <small>
                {truck.driver} · {(() => {
                  const route = measureRoute(state, truck.city, [...onRoute, ...stagedOrders]);
                  return route.km > 0 ? `ETA ${fmtHours(route.etaHours)} · ${route.km} km` : 'Sin paradas';
                })()}
              </small>
            </div>
            <div className="drv-status card" style={{ margin: '0 0 12px', boxShadow: 'none' }}>
              <div>
                <strong>{stagedKg} kg</strong>
                <small>en carga</small>
              </div>
              <div>
                <strong>{stagedOrders.length}</strong>
                <small>por enviar</small>
              </div>
              <div>
                <strong>{onRoute.length}</strong>
                <small>en ruta</small>
              </div>
            </div>

            <h3>Carga pendiente de envío</h3>
            {stagedOrders.length ? (
              <ul className="dsp-list">
                {stagedOrders.map((o) => (
                  <li key={o.id}>
                    <div>
                      <strong>{o.id.replace('PED-', '#')}</strong>
                      <small>
                        {sectorOf(state, o)} · {orderWeight(state, o).toFixed(1)} kg
                      </small>
                    </div>
                    <button type="button" className="btn ghost small" onClick={() => void unstage(o.id)}>
                      Quitar
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="subtle">Sin pedidos en staging.</p>
            )}

            <button
              type="button"
              className="btn primary full"
              style={{ marginTop: 12 }}
              disabled={!stagedOrders.length || busy}
              onClick={() => void sendTruck(truck.id)}
            >
              <Icon name="truck" />
              {busy ? 'Enviando…' : 'Enviar camión'}
            </button>
          </section>

          <section className="card drv-map-wrap">
            <div className="drv-section-head">
              <h2>Mapa en ruta</h2>
              <small>{onRoute.length} paradas</small>
            </div>
            <RouteMap state={state} orders={onRoute} city={truck.city} />
          </section>
        </>
      ) : null}
    </div>
  );
}
