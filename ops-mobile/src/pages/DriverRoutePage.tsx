import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { clearSession, type AuthUser } from '../auth';
import { RouteMap } from '../components/RouteMap';
import { Icon } from '../components/Icon';
import {
  FLEET as DEFAULT_FLEET,
  clientOf,
  fmtHours,
  orderWeight,
  packagesOf,
  productOf,
  routeOrders,
  sectorOf,
  truckByPlate,
  vehicleIconName,
  type Truck,
} from '../lib/fleet';
import type { AppState } from '../types';

type Props = {
  state: AppState;
  user: AuthUser;
  onRefresh: () => Promise<void>;
};

type ViewTab = 'mapa' | 'paradas' | 'entrega';

export function DriverRoutePage({ state, user, onRefresh }: Props) {
  const [fleet, setFleet] = useState<Truck[]>(DEFAULT_FLEET);
  useEffect(() => {
    void api
      .fleet()
      .then((r) => {
        if (r.trucks?.length) setFleet(r.trucks);
      })
      .catch(() => {});
  }, []);
  const truck = truckByPlate(user.truckPlate, fleet);
  const stops = useMemo(() => routeOrders(state, truck.plate), [state, truck.plate]);
  const [stopId, setStopId] = useState<string | null>(null);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [person, setPerson] = useState('');
  const [notes, setNotes] = useState('');
  const [tab, setTab] = useState<ViewTab>('mapa');

  const current = stops.find((o) => o.id === stopId) ?? stops[0] ?? null;
  const currentClient = current ? clientOf(state, current.clientId) : null;
  const currentIndex = current ? stops.findIndex((o) => o.id === current.id) : -1;
  const lineKeys = current ? current.lines.map((l) => `${current.id}:${l.productId}`) : [];
  const allChecked = lineKeys.length > 0 && lineKeys.every((k) => checked[k]);
  const loadKg = Math.round(stops.reduce((n, o) => n + orderWeight(state, o), 0));
  const progress = stops.length ? Math.round(((currentIndex + 1) / stops.length) * 100) : 0;

  const selectStop = (id: string, goEntrega = false) => {
    setStopId(id);
    setChecked({});
    setPerson('');
    setNotes('');
    setError('');
    if (goEntrega) setTab('entrega');
  };

  const confirmDelivery = async () => {
    if (!current || !allChecked || !person.trim()) return;
    setBusy(true);
    setError('');
    try {
      await api.delivery({ orderId: current.id, person: person.trim(), notes });
      await onRefresh();
      setChecked({});
      setPerson('');
      setNotes('');
      setStopId(null);
      setTab('paradas');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo confirmar');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page drv-page">
      <header className="drv-hero">
        <div className="drv-hero-top">
          <div className="drv-hero-brand">
            <span className="drv-hero-icon" aria-hidden>
              <Icon name={vehicleIconName(truck)} />
            </span>
            <div>
              <div className="eyebrow">Conductor · Mi ruta</div>
              <h1>{truck.label}</h1>
            </div>
          </div>
          <div className="drv-top-actions">
            <span className={`drv-pill ${stops.length ? 'route' : 'idle'}`}>
              <i aria-hidden />
              {stops.length ? 'En ruta' : 'Sin despacho'}
            </span>
            <button
              type="button"
              className="drv-logout"
              onClick={() => {
                clearSession();
                window.location.assign('/login');
              }}
            >
              Salir
            </button>
          </div>
        </div>
        <p className="drv-hero-meta">
          {truck.plate} · {user.name} · {truck.city}
        </p>
        {stops.length ? (
          <div className="drv-progress" aria-label="Avance de ruta">
            <div className="drv-progress-bar">
              <span style={{ width: `${Math.max(8, progress)}%` }} />
            </div>
            <small>
              Parada {currentIndex + 1} de {stops.length}
            </small>
          </div>
        ) : null}
      </header>

      <section className="drv-kpis" aria-label="Resumen de ruta">
        <article>
          <Icon name="box" />
          <strong>{loadKg}</strong>
          <small>kg carga</small>
        </article>
        <article>
          <Icon name="pin" />
          <strong>{stops.length}</strong>
          <small>paradas</small>
        </article>
        <article>
          <Icon name="route" />
          <strong>{fmtHours(truck.etaHours)}</strong>
          <small>ETA</small>
        </article>
      </section>

      <div className="drv-tabs" role="tablist" aria-label="Vista de ruta">
        <button type="button" className={tab === 'mapa' ? 'is-active' : ''} onClick={() => setTab('mapa')}>
          <Icon name="map" /> Mapa
        </button>
        <button type="button" className={tab === 'paradas' ? 'is-active' : ''} onClick={() => setTab('paradas')}>
          <Icon name="orders" /> Paradas
          {stops.length ? <em>{stops.length}</em> : null}
        </button>
        <button
          type="button"
          className={tab === 'entrega' ? 'is-active' : ''}
          onClick={() => setTab('entrega')}
          disabled={!current}
        >
          <Icon name="check" /> Entrega
        </button>
      </div>

      {tab === 'mapa' ? (
        <section className="drv-map-card">
          <div className="drv-section-head">
            <h2>Mapa de ruta</h2>
            <small>{truck.city}</small>
          </div>
          <RouteMap
            state={state}
            orders={stops}
            city={truck.city}
            activeId={current?.id}
            onSelect={(id) => selectStop(id, true)}
          />
          {current && currentClient ? (
            <button type="button" className="drv-map-next" onClick={() => setTab('entrega')}>
              <span>
                <small>
                  Siguiente · {current.id.replace('PED-', '#')}
                </small>
                <strong>{currentClient.name}</strong>
              </span>
              <Icon name="arrow" />
            </button>
          ) : (
            <p className="drv-empty-inline">Sin paradas en mapa. Espera el despacho.</p>
          )}
        </section>
      ) : null}

      {tab === 'paradas' ? (
        <section className="drv-stops-card">
          <div className="drv-section-head">
            <h2>Paradas de hoy</h2>
            <small>{stops.length} entregas</small>
          </div>
          {stops.length ? (
            <ol className="drv-timeline">
              {stops.map((o, i) => {
                const c = clientOf(state, o.clientId);
                const active = current?.id === o.id;
                const kg = orderWeight(state, o);
                return (
                  <li key={o.id} className={active ? 'is-active' : ''}>
                    <button type="button" className="drv-timeline-btn" onClick={() => selectStop(o.id, true)}>
                      <span className="drv-timeline-rail" aria-hidden>
                        <em>{i + 1}</em>
                      </span>
                      <span className="drv-timeline-body">
                        <strong>{c?.name ?? o.clientId}</strong>
                        <small>
                          {o.id.replace('PED-', '#')} · {sectorOf(state, o)} · {packagesOf(o)} prod. ·{' '}
                          {kg.toFixed(0)} kg
                        </small>
                      </span>
                      <Icon name="chevron" />
                    </button>
                  </li>
                );
              })}
            </ol>
          ) : (
            <div className="drv-empty">
              <Icon name={vehicleIconName(truck)} />
              <strong>Sin despacho aún</strong>
              <p>Cuando despacho envíe tu camión, aquí verás las paradas del día.</p>
            </div>
          )}
        </section>
      ) : null}

      {tab === 'entrega' && current && currentClient ? (
        <section className="drv-delivery-card">
          <div className="drv-delivery-hero">
            <span>
              Parada {currentIndex + 1} · {current.id.replace('PED-', '#')}
            </span>
            <strong>{currentClient.name}</strong>
            <p>
              {sectorOf(state, current)} · {currentClient.address}
            </p>
            <div className="drv-delivery-actions">
              <a
                className="btn primary full"
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                  `${currentClient.address} ${truck.city}`,
                )}`}
                target="_blank"
                rel="noreferrer"
              >
                <Icon name="pin" /> Cómo llegar
              </a>
            </div>
            {currentClient.contact ? (
              <p className="drv-contact-hint">Contacto: {currentClient.contact}</p>
            ) : null}
          </div>

          <div className="drv-delivery-body">
            <h3>Checklist de entrega</h3>
            <div className="drv-checks">
              {current.lines.map((l) => {
                const key = `${current.id}:${l.productId}`;
                const p = productOf(state, l.productId);
                return (
                  <label key={key} className={`drv-check-card ${checked[key] ? 'is-on' : ''}`}>
                    <input
                      type="checkbox"
                      checked={!!checked[key]}
                      onChange={() => setChecked((prev) => ({ ...prev, [key]: !prev[key] }))}
                    />
                    <span>
                      <strong>
                        {p?.name ?? l.productId} × {l.qty}
                      </strong>
                      <small>{orderWeight(state, { ...current, lines: [l] }).toFixed(1)} kg</small>
                    </span>
                  </label>
                );
              })}
            </div>

            <label className="field">
              <span>Quién recibe</span>
              <input
                value={person}
                onChange={(e) => setPerson(e.target.value)}
                placeholder={currentClient.contact || 'Nombre de quien recibe'}
              />
            </label>
            <label className="field">
              <span>Observaciones</span>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder="Opcional"
              />
            </label>

            {error ? <p className="login-error">{error}</p> : null}
            <button
              type="button"
              className="btn primary full drv-confirm"
              disabled={!allChecked || !person.trim() || busy}
              onClick={() => void confirmDelivery()}
            >
              <Icon name="check" />
              {busy ? 'Confirmando…' : 'Confirmar entrega'}
            </button>
            <p className="subtle drv-hint">Marca todos los productos y escribe quién recibe.</p>
          </div>
        </section>
      ) : null}

      {tab === 'entrega' && !current ? (
        <div className="drv-empty">
          <Icon name="check" />
          <strong>Nada por entregar</strong>
          <p>No hay paradas activas en tu ruta.</p>
        </div>
      ) : null}
    </div>
  );
}
