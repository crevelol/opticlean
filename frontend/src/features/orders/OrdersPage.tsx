import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppState } from '../../shared/hooks/AppStateProvider';
import { useAuth } from '../../shared/hooks/AuthProvider';
import { api } from '../../shared/api/client';
import { can } from '../../shared/auth/permissions';
import { client, dateShort, money, orderValue, product, statusColor } from '../../shared/lib/inventory';
import { Badge, Btn, Empty, Kpi, PageHead } from '../../shared/components/ui';
import { Modal, ModalActions } from '../../shared/components/Modal';

const tabs = ['Todos', 'Por preparar', 'Preparado', 'En ruta', 'Entregado', 'Incidencia', 'Cancelado'] as const;

type PickLine = { id: string; loc: string; batch: string; qty: number; productId: string };

export function OrdersPage() {
  const { state, applyResponse, toast } = useAppState();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<(typeof tabs)[number]>('Todos');
  const [detailId, setDetailId] = useState<string | null>(null);
  const [pickId, setPickId] = useState<string | null>(null);
  const [pickPlan, setPickPlan] = useState<PickLine[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (!state) return null;

  const canPick = can(user, 'picking');
  const canCancel = can(user, 'picking');
  const list = state.orders.filter((o) => tab === 'Todos' || o.status === tab);
  const detail = detailId ? state.orders.find((o) => o.id === detailId) : null;
  const pickOrder = pickId ? state.orders.find((o) => o.id === pickId) : null;

  const openPicking = async (id: string) => {
    setError('');
    setPicked(new Set());
    setPickPlan([]);
    setPickId(id);
    try {
      setPickPlan(await api.pickPlan(id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo calcular el plan de picking.');
    }
  };

  const confirmPicking = async () => {
    if (!pickId || busy) return;
    setBusy(true);
    setError('');
    try {
      applyResponse(await api.prepare(pickId));
      toast(`Pedido ${pickId} preparado.`);
      setPickId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo preparar el pedido.');
    } finally {
      setBusy(false);
    }
  };

  const submitCancel = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!cancelId || busy) return;
    const reason = String(new FormData(e.currentTarget).get('reason') ?? '');
    setBusy(true);
    setError('');
    try {
      applyResponse(await api.cancelOrder(cancelId, reason));
      toast(`Pedido ${cancelId} cancelado.`);
      setCancelId(null);
      setDetailId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cancelar el pedido.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHead
        eyebrow="Gestión de pedidos"
        title="Del pedido a la entrega"
        desc="Disponibilidad, preparación y seguimiento en un mismo flujo."
        actions={
          can(user, 'dispatch') ? (
            <Btn variant="primary" icon="plus" onClick={() => navigate('/pedidos/nuevo')}>
              Nuevo pedido
            </Btn>
          ) : null
        }
      />
      <div className="kpis">
        <Kpi label="Registrados" value={state.orders.length} unit="pedidos" foot="Todos los estados" icon="orders" />
        <Kpi
          label="Por preparar"
          value={state.orders.filter((o) => o.status === 'Por preparar').length}
          unit=""
          foot="Stock reservado"
          icon="box"
        />
        <Kpi
          label="Entregados"
          value={state.orders.filter((o) => o.status === 'Entregado').length}
          unit=""
          foot="Confirmados"
          icon="check"
          color="positive"
        />
      </div>
      <div className="tabs">
        {tabs.map((t) => (
          <button key={t} type="button" className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>
            {t}
            <small>{state.orders.filter((o) => t === 'Todos' || o.status === t).length}</small>
          </button>
        ))}
      </div>
      <section className="panel">
        {list.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Pedido</th>
                  <th>Cliente</th>
                  <th>Fecha</th>
                  <th>Total</th>
                  <th>Estado</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {list.map((o) => (
                  <tr key={o.id}>
                    <td>
                      <strong>{o.id}</strong>
                      {o.priority === 'Alta' ? <span className="sub"> · Prioridad alta</span> : null}
                    </td>
                    <td>{client(state, o.clientId)?.name}</td>
                    <td>{dateShort(o.date)}</td>
                    <td>
                      <strong>{money(orderValue(state, o))}</strong>
                    </td>
                    <td>
                      <Badge text={o.status} color={statusColor(o.status)} />
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {o.status === 'Por preparar' && canPick ? (
                        <Btn variant="small" icon="route" onClick={() => void openPicking(o.id)}>
                          Preparar
                        </Btn>
                      ) : null}{' '}
                      <Btn variant="small" icon="eye" onClick={() => setDetailId(o.id)}>
                        Ver
                      </Btn>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty title="No hay pedidos" desc="Los pedidos aparecerán aquí." />
        )}
      </section>

      {detail ? (
        <Modal
          title={detail.id}
          subtitle={`${client(state, detail.clientId)?.name ?? ''} · ${dateShort(detail.date)}`}
          onClose={() => setDetailId(null)}
          footer={
            <>
              <Btn icon="history" onClick={() => navigate('/trazabilidad', { state: { q: detail.id } })}>
                Trazabilidad
              </Btn>
              {canCancel && ['Por preparar', 'Preparado'].includes(detail.status) ? (
                <Btn variant="danger" icon="close" onClick={() => { setError(''); setCancelId(detail.id); }}>
                  Cancelar pedido
                </Btn>
              ) : null}
            </>
          }
        >
          <Badge text={detail.status} color={statusColor(detail.status)} />
          {detail.lines.map((l) => (
            <div className="invoice-line" key={l.productId}>
              <span>
                {product(state, l.productId)?.name} × {l.qty}
              </span>
              <strong>{money((product(state, l.productId)?.price ?? 0) * l.qty)}</strong>
            </div>
          ))}
          <div className="invoice-line total">
            <span>Total</span>
            <strong>{money(orderValue(state, detail))}</strong>
          </div>
          <p className="subtle">
            {detail.vehicle ? `Vehículo: ${detail.vehicle}` : 'Sin vehículo asignado.'}
            {detail.deliveredTo ? ` · Recibido por: ${detail.deliveredTo}` : ''}
            {detail.incident ? ` · Novedad: ${detail.incident}` : ''}
            {detail.cancelReason ? ` · Motivo de cancelación: ${detail.cancelReason}` : ''}
          </p>
        </Modal>
      ) : null}

      {pickOrder ? (
        <Modal
          title={`Preparar ${pickOrder.id}`}
          subtitle={`${client(state, pickOrder.clientId)?.name ?? ''} · Lotes por vencimiento más próximo (FEFO)`}
          onClose={() => setPickId(null)}
          wide
          footer={
            <>
              <Btn onClick={() => setPickId(null)}>Cerrar</Btn>
              <Btn
                variant="primary"
                icon="check"
                disabled={busy || !pickPlan.length || picked.size < pickPlan.length}
                onClick={() => void confirmPicking()}
              >
                {busy ? 'Confirmando…' : `Confirmar preparación (${picked.size}/${pickPlan.length})`}
              </Btn>
            </>
          }
        >
          {pickPlan.length ? (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th />
                    <th>Ubicación</th>
                    <th>Producto</th>
                    <th>Lote</th>
                    <th>Cantidad</th>
                  </tr>
                </thead>
                <tbody>
                  {pickPlan.map((line) => {
                    const key = `${line.id}:${line.loc}`;
                    const checked = picked.has(key);
                    return (
                      <tr key={key} onClick={() => setPicked((prev) => {
                        const next = new Set(prev);
                        if (next.has(key)) next.delete(key); else next.add(key);
                        return next;
                      })} style={{ cursor: 'pointer', opacity: checked ? 0.6 : 1 }}>
                        <td>
                          <input type="checkbox" checked={checked} readOnly aria-label={`Recogido ${line.loc}`} />
                        </td>
                        <td><strong>{line.loc}</strong></td>
                        <td>{product(state, line.productId)?.name}</td>
                        <td>{line.batch}</td>
                        <td>{line.qty} u.</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : !error ? (
            <p className="subtle">Calculando ruta de picking…</p>
          ) : null}
          <p className="subtle" style={{ marginTop: 12 }}>
            Marca cada línea al recogerla. Al confirmar, el stock sale de bodega y el pedido pasa a «Preparado».
          </p>
          {error ? <div className="form-error visible">{error}</div> : null}
        </Modal>
      ) : null}

      {cancelId ? (
        <Modal
          title={`Cancelar ${cancelId}`}
          subtitle="Se libera la reserva; si ya estaba preparado, el stock vuelve a bodega."
          onClose={() => setCancelId(null)}
          footer={<ModalActions onCancel={() => setCancelId(null)} submitLabel={busy ? 'Cancelando…' : 'Confirmar cancelación'} formId="cancel-order-form" icon="close" />}
        >
          <form id="cancel-order-form" onSubmit={(e) => void submitCancel(e)}>
            <div className="field full">
              <label htmlFor="cancel-reason">Motivo</label>
              <select id="cancel-reason" name="reason" defaultValue="Cliente desiste">
                <option>Cliente desiste</option>
                <option>Error en el pedido</option>
                <option>Sin stock suficiente</option>
                <option>Duplicado</option>
                <option>Otro</option>
              </select>
            </div>
            {error ? <div className="form-error visible">{error}</div> : null}
          </form>
        </Modal>
      ) : null}
    </>
  );
}
