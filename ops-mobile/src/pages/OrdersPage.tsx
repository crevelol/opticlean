import { useState } from 'react';
import { api } from '../api';
import { Icon } from '../components/Icon';
import { clientName, statusTone } from '../lib/inventory';
import type { AppState, Order, PickStep } from '../types';

export function OrdersPage({
  state,
  onRefresh,
}: {
  state: AppState;
  onRefresh: () => Promise<void>;
}) {
  const [selected, setSelected] = useState<Order | null>(null);
  const [steps, setSteps] = useState<PickStep[]>([]);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [reason, setReason] = useState('Cliente desiste');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const orders = [...state.orders].sort((a, b) => {
    const rank = (s: string) => (s === 'Por preparar' ? 0 : s === 'Preparado' ? 1 : 2);
    return rank(a.status) - rank(b.status) || b.date.localeCompare(a.date);
  });

  const openOrder = async (order: Order) => {
    setSelected(order);
    setError('');
    setSteps([]);
    setChecked({});
    try {
      const plan = await api.pickPlan(order.id);
      setSteps(Array.isArray(plan) ? plan : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar el plan');
    }
  };

  const prepare = async () => {
    if (!selected || busy) return;
    setBusy(true);
    setError('');
    try {
      await api.prepareOrder(selected.id);
      await onRefresh();
      setSelected(null);
      setSteps([]);
      setChecked({});
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo preparar');
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    if (!selected || busy) return;
    setBusy(true);
    setError('');
    try {
      await api.cancelOrder(selected.id, reason);
      await onRefresh();
      setSelected(null);
      setSteps([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cancelar');
    } finally {
      setBusy(false);
    }
  };

  const stepKey = (step: PickStep, index: number) => step.id ?? `${step.productId}-${step.loc ?? ''}-${index}`;
  const allChecked = steps.length > 0 && steps.every((step, index) => checked[stepKey(step, index)]);

  if (selected) {
    return (
      <div className="page">
        <header className="topbar-inline">
          <button type="button" className="icon-btn" onClick={() => setSelected(null)} aria-label="Volver">
            <Icon name="back" />
          </button>
          <div>
            <div className="eyebrow">Picking</div>
            <strong>{selected.id}</strong>
          </div>
          <em className={`badge ${statusTone(selected.status)}`}>{selected.status}</em>
        </header>

        <section className="panel">
          <div className="panel-body">
            <p className="meta-line">{clientName(state, selected.clientId)}</p>
            <p className="meta-line">Prioridad: {selected.priority} · {selected.date}</p>
          </div>
        </section>

        <section className="panel">
          <div className="panel-head">
            <span className="panel-title">
              <Icon name="route" /> Ruta de picking
            </span>
          </div>
          <ul className="pick-list">
            {(steps.length ? steps : selected.lines).map((step, i) => {
              const p = state.products.find((x) => x.id === step.productId);
              const key = stepKey(step, i);
              return (
                <li key={key}>
                  <label className="drv-check">
                    <input
                      type="checkbox"
                      checked={!!checked[key]}
                      disabled={!steps.length}
                      onChange={() => setChecked((prev) => ({ ...prev, [key]: !prev[key] }))}
                    />
                    <span>
                      <strong>{i + 1}. {p?.name ?? step.productId}</strong>
                      <small>
                        {step.qty} u.
                        {'loc' in step && step.loc ? ` · ${step.loc}` : ''}
                        {'batch' in step && step.batch ? ` · ${step.batch}` : ''}
                      </small>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </section>

        {error ? <p className="form-error visible">{error}</p> : null}

        {selected.status === 'Por preparar' ? (
          <button type="button" className="btn primary full sticky-cta" disabled={busy || !allChecked} onClick={() => void prepare()}>
            <Icon name="check" />
            {busy ? 'Preparando…' : allChecked ? 'Marcar preparado' : 'Marca todas las posiciones'}
          </button>
        ) : null}
        {selected.status === 'Por preparar' || selected.status === 'Preparado' ? (
          <section className="panel">
            <div className="panel-body form-stack">
              <label className="field">
                <span>Cancelar pedido</span>
                <select value={reason} onChange={(e) => setReason(e.target.value)}>
                  <option>Cliente desiste</option>
                  <option>Error en el pedido</option>
                  <option>Sin stock suficiente</option>
                  <option>Duplicado</option>
                  <option>Otro</option>
                </select>
              </label>
              <button type="button" className="btn full" disabled={busy} onClick={() => void cancel()}>
                Cancelar pedido
              </button>
            </div>
          </section>
        ) : null}
      </div>
    );
  }

  return (
    <div className="page">
      <header className="page-head">
        <div className="eyebrow">Operación</div>
        <h1>Pedidos</h1>
        <p>Prepara picking con la ruta sugerida por ubicación.</p>
      </header>

      <section className="panel">
        <ul className="data-list">
          {orders.map((o) => (
            <li key={o.id}>
              <button type="button" className="list-btn" onClick={() => void openOrder(o)}>
                <div>
                  <strong>{o.id}</strong>
                  <span>
                    {clientName(state, o.clientId)} · {o.lines.length} ítems
                  </span>
                </div>
                <em className={`badge ${statusTone(o.status)}`}>{o.status}</em>
              </button>
            </li>
          ))}
        </ul>
        {!orders.length ? <p className="empty-copy">No hay pedidos.</p> : null}
      </section>
    </div>
  );
}
