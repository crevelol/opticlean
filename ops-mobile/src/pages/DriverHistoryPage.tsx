import { useMemo } from 'react';
import type { AuthUser } from '../auth';
import { clientOf, orderWeight, truckByPlate } from '../lib/fleet';
import type { AppState } from '../types';

export function DriverHistoryPage({ state, user }: { state: AppState; user: AuthUser }) {
  const truck = truckByPlate(state, user.truckPlate);
  const plate = truck?.plate;
  const delivered = useMemo(
    () =>
      state.orders
        .filter((o) => !o.id.startsWith('PED-H') && o.status === 'Entregado' && !!plate && o.vehicle === plate)
        .sort((a, b) => (b.deliveredAt ?? b.date).localeCompare(a.deliveredAt ?? a.date))
        .slice(0, 20),
    [state.orders, plate],
  );

  return (
    <div className="page drv-page">
      <header className="drv-top">
        <div>
          <div className="eyebrow">Conductor · Historial</div>
          <h1>Entregas recientes</h1>
          <p>{truck ? `${truck.label} · ${truck.plate}` : 'Sin camión asignado'}</p>
        </div>
      </header>

      <section className="card">
        {delivered.length ? (
          <ul className="drv-history">
            {delivered.map((o) => (
              <li key={o.id}>
                <strong>
                  {o.id} · {clientOf(state, o.clientId)?.name}
                </strong>
                <small>
                  {(o.deliveredAt ?? o.date).slice(0, 10)} · {orderWeight(state, o).toFixed(1)} kg
                  {o.deliveredTo ? ` · Recibió ${o.deliveredTo}` : ''}
                </small>
              </li>
            ))}
          </ul>
        ) : (
          <p className="subtle">Aún no hay entregas registradas para este camión.</p>
        )}
      </section>
    </div>
  );
}
