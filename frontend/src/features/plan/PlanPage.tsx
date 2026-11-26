import { useEffect, useState } from 'react';
import { useAppState } from '../../shared/hooks/AppStateProvider';
import { api } from '../../shared/api/client';
import type { PlanAction } from '../../shared/types';
import { Badge, Btn, Empty, Kpi, KpiGrid, PageHead } from '../../shared/components/ui';
import { Icon } from '../../shared/components/Icon';
import { num } from '../../shared/lib/inventory';
import '../../styles/forecast.css';
import '../../styles/plan.css';

type Plan = Awaited<ReturnType<typeof api.plan>>;
type Filter = 'all' | PlanAction['kind'];

const kindLabel: Record<PlanAction['kind'], string> = { compra: 'Comprar', transferencia: 'Trasladar' };
const kindIcon: Record<PlanAction['kind'], string> = { compra: 'cart', transferencia: 'truck' };
const statusLabel: Record<PlanAction['status'], string> = {
  sugerida: 'Sugerida',
  ejecutada: 'Ejecutada',
  descartada: 'Descartada',
  deshecha: 'Deshecha',
};
const statusColor: Record<PlanAction['status'], string> = {
  sugerida: 'blue',
  ejecutada: 'green',
  descartada: 'gray',
  deshecha: 'gray',
};
/** Horas de entrega que llenan la barra por completo. */
const DELIVERY_SCALE_H = 48;

export function PlanPage() {
  const { applyResponse, toast, state } = useAppState();
  const [plan, setPlan] = useState<Plan | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');

  const load = () => {
    api.plan().then(setPlan).catch((err) => setError(err instanceof Error ? err.message : 'No se pudo leer el plan.'));
  };

  useEffect(load, []);
  if (!state) return null;

  const name = (id: string) => state.products.find((item) => item.id === id)?.name ?? id;

  const run = async (action: PlanAction, kind: 'approve' | 'discard' | 'undo') => {
    let note = '';
    if (kind === 'discard') {
      const answer = window.prompt('¿Por qué se descarta?', '');
      if (answer === null) return;
      note = answer;
    }
    setBusy(true);
    setError('');
    try {
      const response =
        kind === 'approve'
          ? await api.approvePlan(action.id)
          : kind === 'undo'
            ? await api.undoPlan(action.id)
            : await api.discardPlan(action.id, note);
      applyResponse(response);
      toast(kind === 'approve' ? 'Acción ejecutada.' : kind === 'undo' ? 'Acción deshecha.' : 'Sugerencia descartada.');
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo actualizar el plan.');
    } finally {
      setBusy(false);
    }
  };

  const open = plan?.actions.filter((action) => action.status === 'sugerida') ?? [];
  const done = plan?.actions.filter((action) => action.status !== 'sugerida') ?? [];
  const shown = open.filter((action) => filter === 'all' || action.kind === filter);
  const count = (kind: Filter) => open.filter((action) => kind === 'all' || action.kind === kind).length;
  const units = (kind: PlanAction['kind']) => open.filter((a) => a.kind === kind).reduce((sum, a) => sum + a.qty, 0);
  const forecast = (plan?.forecast ?? []).filter((row) => row.orders > 0).slice(0, 8);
  const deliveries = (plan?.diagnostics ?? []).slice(0, 8);
  const late = (plan?.diagnostics ?? []).filter((row) => row.late).length;

  return (
    <div>
      <PageHead
        eyebrow="Abastecimiento"
        title="Plan de mañana"
        desc="Compras y traslados que el stock ya justifica. Aprobar crea la orden o el traslado; deshacer vale mientras la compra no se recibió y el traslado sigue en tránsito."
      />
      {error ? <div className="form-error visible">{error}</div> : null}

      <KpiGrid>
        <Kpi label="Por decidir" value={open.length} unit="" foot="Sugerencias abiertas" icon="spark" />
        <Kpi label="Compras sugeridas" value={count('compra')} unit="" foot={`${num(units('compra'))} u. en total`} icon="cart" />
        <Kpi
          label="Traslados sugeridos"
          value={count('transferencia')}
          unit=""
          foot={`${num(units('transferencia'))} u. en total`}
          icon="truck"
        />
        <Kpi
          label="Entregas tarde"
          tone={late ? 'danger' : 'default'}
          value={late}
          unit={deliveries.length ? `de ${plan?.diagnostics.length ?? 0}` : ''}
          foot="Entregas con hora de cierre"
          icon="alert"
        />
      </KpiGrid>

      <div className="pl-main">
        <section className="panel pl-decide" aria-label="Por decidir">
          <div className="pl-head">
            <div>
              <h2>Por decidir</h2>
              <p>Aprueba para crear la orden o el traslado; descarta si no aplica.</p>
            </div>
            <div className="pl-filters">
              {(
                [
                  ['all', 'Todas'],
                  ['compra', 'Comprar'],
                  ['transferencia', 'Trasladar'],
                ] as const
              ).map(([key, label]) => (
                <button key={key} type="button" className="po-filter" aria-pressed={filter === key} onClick={() => setFilter(key)}>
                  {label} · {count(key)}
                </button>
              ))}
            </div>
          </div>
          {shown.length ? (
            shown.map((action) => (
              <div className="pl-action" key={action.id}>
                <div className={`pl-ico ${action.kind}`}>
                  <Icon name={kindIcon[action.kind]} />
                </div>
                <div className="pl-action-main">
                  <div>
                    <span className={`pl-kind ${action.kind}`}>{kindLabel[action.kind]}</span>
                    <strong>{name(action.productId)}</strong>
                  </div>
                  <p>{action.reason}</p>
                </div>
                <div className="pl-qty">
                  <b>{num(action.qty)}</b>
                  <span>{action.packCode ?? 'unidad'}</span>
                </div>
                <div className="pl-buttons">
                  <Btn disabled={busy} onClick={() => void run(action, 'discard')}>
                    Descartar
                  </Btn>
                  <Btn variant="primary" icon="check" disabled={busy} onClick={() => void run(action, 'approve')}>
                    Aprobar
                  </Btn>
                </div>
              </div>
            ))
          ) : (
            <Empty
              title={open.length ? 'Sin sugerencias en este filtro' : 'Sin sugerencias abiertas'}
              desc={
                open.length
                  ? 'Prueba con otro tipo de acción.'
                  : 'Cuando un producto baje del mínimo y tenga proveedor, aparece aquí.'
              }
            />
          )}
        </section>

        <section className="panel pl-done" aria-label="Ya decididas">
          <div className="pl-head">
            <div>
              <h2>Ya decididas</h2>
              <p>{done.length} {done.length === 1 ? 'movimiento' : 'movimientos'}</p>
            </div>
          </div>
          {done.length ? (
            done.map((action) => (
              <div className="pl-done-row" key={action.id}>
                <div className="pl-done-top">
                  <strong>{name(action.productId)}</strong>
                  <Badge text={statusLabel[action.status]} color={statusColor[action.status]} />
                </div>
                <span className="pl-meta">
                  {[kindLabel[action.kind], `${num(action.qty)} u.`, action.purchaseId, action.transferId, action.note]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
                {action.status === 'ejecutada' ? (
                  <div>
                    <Btn size="small" disabled={busy} onClick={() => void run(action, 'undo')}>
                      Deshacer
                    </Btn>
                  </div>
                ) : null}
              </div>
            ))
          ) : (
            <p className="pl-empty">Todavía no hay decisiones.</p>
          )}
        </section>
      </div>

      <div className="pl-main">
        <section className="panel pl-forecast" aria-label="Pronóstico por cliente">
          <div className="pl-head">
            <div>
              <h2>Pronóstico por cliente</h2>
              <p>Unidades semanales de los últimos 28 días. La confianza sube con la cantidad de pedidos.</p>
            </div>
          </div>
          {forecast.length ? (
            forecast.map((row) => (
              <div className="pl-fc-row" key={row.clientId}>
                <div>
                  <strong>{row.name}</strong>
                  <span className="pl-meta">
                    {[
                      row.reorderEveryDays ? `Repone cada ${row.reorderEveryDays} días` : '',
                      row.deviationPct ? `Desvío ${row.deviationPct}%` : '',
                    ]
                      .filter(Boolean)
                      .join(' · ') || 'Sin patrón de reposición aún'}
                  </span>
                </div>
                <div className="pl-fc-weekly">
                  <b>{num(row.weeklyUnits)} u.</b>
                  <span>por semana · {row.orders} pedidos</span>
                </div>
                <div className="pl-fc-conf">
                  <div>
                    <span>Confianza</span>
                    <b>{row.confidence}%</b>
                  </div>
                  <div
                    className={`po-bar ${row.confidence >= 70 ? 'ok' : row.confidence >= 45 ? 'warn' : 'bad'}`}
                    role="img"
                    aria-label={`Confianza ${row.confidence}%`}
                  >
                    <span style={{ width: `${Math.min(100, row.confidence)}%` }} />
                  </div>
                </div>
              </div>
            ))
          ) : (
            <p className="pl-empty">Todavía no hay pedidos suficientes para pronosticar.</p>
          )}
        </section>

        <section className="panel pl-delivery" aria-label="Tiempos de entrega">
          <div className="pl-head">
            <div>
              <h2>Tiempos de entrega</h2>
              <p>Horas desde la creación hasta el cierre.</p>
            </div>
          </div>
          {deliveries.length ? (
            deliveries.map((row) => (
              <div className="pl-dl-row" key={row.orderId}>
                <div className="pl-dl-top">
                  <strong>{row.orderId}</strong>
                  <span>
                    <b>{row.hours} h</b>
                    <span className={`fc-urgency fc-urgency-${row.late ? 'now' : 'watch'}`}>{row.late ? 'Tarde' : 'A tiempo'}</span>
                  </span>
                </div>
                <div
                  className={`po-bar ${row.late ? 'bad' : 'ok'}`}
                  role="img"
                  aria-label={`${row.hours} horas`}
                >
                  <span style={{ width: `${Math.min(100, (row.hours / DELIVERY_SCALE_H) * 100)}%` }} />
                </div>
                {row.incident ? <span className="pl-meta">{row.incident}</span> : null}
              </div>
            ))
          ) : (
            <p className="pl-empty">Todavía no hay entregas con hora de cierre.</p>
          )}
        </section>
      </div>
    </div>
  );
}
