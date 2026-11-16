import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppState } from '../../shared/hooks/AppStateProvider';
import { client, money, orderValue, orderWeight, product, statusColor } from '../../shared/lib/inventory';
import { Badge, Btn, Empty, Kpi, PageHead } from '../../shared/components/ui';
import { Modal } from '../../shared/components/Modal';
import { Icon } from '../../shared/components/Icon';
import '../../styles/orders.css';

const tabs = ['Todos', 'Por preparar', 'Preparado', 'En ruta', 'Entregado', 'Incidencia'] as const;

function isLiveOrder(id: string) {
  return !id.startsWith('PED-H');
}

export function OrdersPage() {
  const { state } = useAppState();
  const navigate = useNavigate();
  const [tab, setTab] = useState<(typeof tabs)[number]>('Por preparar');
  const [detailId, setDetailId] = useState<string | null>(null);

  const liveOrders = useMemo(
    () => (state ? state.orders.filter((o) => isLiveOrder(o.id)) : []),
    [state],
  );

  const counts = useMemo(() => {
    const by = (status: string) => liveOrders.filter((o) => o.status === status).length;
    return {
      todos: liveOrders.length,
      porPreparar: by('Por preparar'),
      preparado: by('Preparado'),
      enRuta: by('En ruta'),
      entregado: by('Entregado'),
      incidencia: by('Incidencia'),
    };
  }, [liveOrders]);

  if (!state) return null;

  const list = liveOrders.filter((o) => tab === 'Todos' || o.status === tab);
  const detail = detailId ? liveOrders.find((o) => o.id === detailId) : null;
  const detailClient = detail ? client(state, detail.clientId) : null;
  const detailTotal = detail ? orderValue(state, detail) : 0;
  const detailKg = detail ? orderWeight(state, detail) : 0;

  const tabCount = (t: (typeof tabs)[number]) => {
    if (t === 'Todos') return counts.todos;
    if (t === 'Por preparar') return counts.porPreparar;
    if (t === 'Preparado') return counts.preparado;
    if (t === 'En ruta') return counts.enRuta;
    if (t === 'Entregado') return counts.entregado;
    return counts.incidencia;
  };

  return (
    <div className="ord-page">
      <PageHead
        eyebrow="Gestión de pedidos"
        title="Del pedido a la entrega"
        desc="Disponibilidad, preparación y seguimiento en un mismo flujo."
        actions={
          <Btn variant="primary" icon="plus" onClick={() => navigate('/pedidos/nuevo')}>
            Nuevo pedido
          </Btn>
        }
      />

      <div className="kpis">
        <Kpi label="En operación" value={counts.todos} unit="pedidos" foot="Sin historial demo" icon="orders" />
        <Kpi
          label="Por preparar"
          value={counts.porPreparar}
          unit=""
          foot="Pendientes de picking"
          icon="box"
        />
        <Kpi
          label="Listos / ruta"
          value={counts.preparado + counts.enRuta}
          unit=""
          foot={`${counts.preparado} listos · ${counts.enRuta} en ruta`}
          icon="truck"
        />
        <Kpi
          label="Entregados"
          value={counts.entregado}
          unit=""
          foot="Confirmados"
          icon="check"
          color="positive"
        />
      </div>

      <div className="tabs" role="tablist" aria-label="Estado de pedidos">
        {tabs.map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            className={tab === t ? 'active' : ''}
            aria-selected={tab === t}
            onClick={() => setTab(t)}
          >
            {t}
            <small>{tabCount(t)}</small>
          </button>
        ))}
      </div>

      <section className="panel">
        {list.length ? (
          <div className="table-scroll">
            <table className="ord-table">
              <thead>
                <tr>
                  <th>Pedido</th>
                  <th>Cliente</th>
                  <th>Destino</th>
                  <th>Total</th>
                  <th>Estado</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {list.map((o) => {
                  const c = client(state, o.clientId);
                  return (
                    <tr key={o.id}>
                      <td>
                        <strong>{o.id}</strong>
                        <small>
                          {o.date} · {o.priority}
                          {o.vehicle ? ` · ${o.vehicle}` : ''}
                        </small>
                      </td>
                      <td>
                        <strong>{c?.name ?? o.clientId}</strong>
                        <small>{c?.type ?? 'Cliente'}</small>
                      </td>
                      <td>
                        {c?.city ?? '—'}
                        <small>{c?.sector ?? c?.address ?? ''}</small>
                      </td>
                      <td>
                        <strong>{money(orderValue(state, o))}</strong>
                        <small>
                          {o.lines.length} ítems · {orderWeight(state, o).toFixed(0)} kg
                        </small>
                      </td>
                      <td>
                        <Badge text={o.status} color={statusColor(o.status)} />
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                          <Btn variant="small" icon="eye" onClick={() => setDetailId(o.id)}>
                            Ver
                          </Btn>
                          {o.status === 'Por preparar' ? (
                            <Btn
                              variant="small"
                              icon="route"
                              onClick={() => navigate('/bodega', { state: { pick: o.id } })}
                            >
                              Preparar
                            </Btn>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty title="No hay pedidos en este estado" desc="Cambia de pestaña o crea un nuevo pedido." />
        )}
      </section>

      {detail && detailClient ? (
        <Modal
          title={detail.id}
          subtitle={`${detailClient.name} · ${detail.date}`}
          onClose={() => setDetailId(null)}
          footer={
            <div className="ord-actions">
              <Btn onClick={() => setDetailId(null)}>Cerrar</Btn>
              {detail.status === 'Por preparar' ? (
                <Btn
                  variant="primary"
                  icon="route"
                  onClick={() => {
                    setDetailId(null);
                    navigate('/bodega', { state: { pick: detail.id } });
                  }}
                >
                  Ir a preparar
                </Btn>
              ) : null}
              {detail.status === 'Preparado' ? (
                <Btn
                  variant="primary"
                  icon="truck"
                  onClick={() => {
                    setDetailId(null);
                    navigate('/logistica');
                  }}
                >
                  Ir a distribución
                </Btn>
              ) : null}
            </div>
          }
        >
          <div className="ord-detail">
            <div className="ord-detail-top">
              <Badge text={detail.status} color={statusColor(detail.status)} />
              <Badge text={detail.priority} color={detail.priority === 'Alta' ? 'amber' : 'muted'} />
              {detail.vehicle ? <Badge text={detail.vehicle} color="blue" /> : null}
            </div>

            <div className="ord-meta">
              <article>
                <span>Cliente</span>
                <strong>{detailClient.name}</strong>
              </article>
              <article>
                <span>Contacto</span>
                <strong>{detailClient.contact || '—'}</strong>
              </article>
              <article>
                <span>Entrega</span>
                <strong>
                  {detailClient.city ?? '—'}
                  {detailClient.sector ? ` · ${detailClient.sector}` : ''}
                </strong>
              </article>
              <article>
                <span>Dirección</span>
                <strong>{detailClient.address}</strong>
              </article>
              <article>
                <span>Peso estimado</span>
                <strong>{detailKg.toFixed(1)} kg</strong>
              </article>
              <article>
                <span>Ítems</span>
                <strong>
                  {detail.lines.length} líneas · {detail.lines.reduce((n, l) => n + l.qty, 0)} u.
                </strong>
              </article>
            </div>

            {detail.notes ? (
              <div className="ord-notes">
                <Icon name="file" /> Notas: {detail.notes}
              </div>
            ) : null}

            {detail.deliveredTo ? (
              <div className="ord-notes" style={{ background: '#eefaf4', borderColor: '#b7e0cb', color: '#1f7a4d' }}>
                Entregado a {detail.deliveredTo}
                {detail.deliveredAt ? ` · ${new Date(detail.deliveredAt).toLocaleString('es-EC')}` : ''}
              </div>
            ) : null}

            <ul className="ord-lines">
              {detail.lines.map((l) => {
                const p = product(state, l.productId);
                const lineTotal = (p?.price ?? 0) * l.qty;
                return (
                  <li key={l.productId}>
                    <div>
                      <strong>{p?.name ?? l.productId}</strong>
                      <small>
                        {l.productId} · {p?.category ?? 'Producto'} · {money(p?.price ?? 0)} c/u × {l.qty}
                      </small>
                    </div>
                    <em>{money(lineTotal)}</em>
                  </li>
                );
              })}
            </ul>

            <div className="ord-total">
              <span>Total del pedido</span>
              <strong>{money(detailTotal)}</strong>
            </div>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
