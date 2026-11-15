import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAppState } from '../../shared/hooks/AppStateProvider';
import { api } from '../../shared/api/client';
import { product, statusColor } from '../../shared/lib/inventory';
import { useAuth } from '../../shared/hooks/AuthProvider';
import { can } from '../../shared/auth/permissions';
import { isRaw } from '../../shared/lib/bom';
import { buildForecast, suggestedPurchaseQty, type ConfidenceLevel } from '../../shared/lib/forecast';
import { Badge, Btn, Empty, Kpi, PageHead, ProductCell } from '../../shared/components/ui';
import { Modal, ModalActions } from '../../shared/components/Modal';
import { dateShort, num } from '../../shared/lib/inventory';
import { Icon } from '../../shared/components/Icon';
import '../../styles/forecast.css';

const confidenceLabel: Record<ConfidenceLevel, string> = {
  low: 'Aprendiendo',
  medium: 'Media',
  high: 'Alta',
};

export function PurchasesPage() {
  const { state, applyResponse, toast } = useAppState();
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [modalOpen, setModalOpen] = useState(false);
  const [prefillProduct, setPrefillProduct] = useState('');
  const [prefillQty, setPrefillQty] = useState(12);
  const [error, setError] = useState('');

  const forecast = useMemo(() => (state ? buildForecast(state) : null), [state]);

  useEffect(() => {
    const navState = location.state as { productId?: string; qty?: number } | null;
    if (!navState?.productId || !state) return;
    setPrefillProduct(navState.productId);
    setPrefillQty(navState.qty ?? suggestedPurchaseQty(state, navState.productId));
    setModalOpen(true);
    setError('');
    navigate(location.pathname, { replace: true, state: null });
  }, [location.state, location.pathname, navigate, state]);

  if (!state || !forecast) return null;

  const canManage = can(user, 'warehouse');
  const urgent = forecast.recommendations.filter((r) => r.urgency === 'now' || r.productionRisk);
  const soon = forecast.recommendations.filter((r) => r.urgency === 'soon' && !r.productionRisk);

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    const data = Object.fromEntries(new FormData(e.currentTarget));
    try {
      applyResponse(
        await api.addPurchase({
          productId: data.productId,
          qty: Number(data.qty),
          date: data.date,
          notes: data.notes,
        }),
      );
      toast('Solicitud registrada. El modelo seguirá aprendiendo con la operación.');
      setModalOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    }
  };

  const cancel = async (id: string) => {
    if (!window.confirm(`¿Cancelar la orden ${id}? Lo ya recibido se mantiene en bodega.`)) return;
    try {
      applyResponse(await api.cancelPurchase(id));
      toast(`Orden ${id} cancelada.`);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'No se pudo cancelar la orden.');
    }
  };

  const openNew = (productId?: string, qty?: number) => {
    const id = productId ?? state.products[0]?.id ?? '';
    setPrefillProduct(id);
    setPrefillQty(qty ?? (id ? suggestedPurchaseQty(state, id) : 12));
    setModalOpen(true);
    setError('');
  };

  return (
    <>
      <PageHead
        eyebrow="Abastecimiento inteligente"
        title="Órdenes de compra"
        desc="La previsión mejora con cada pedido y despacho para anticipar faltantes y proteger la producción."
        actions={
          canManage ? (
            <Btn variant="primary" icon="plus" onClick={() => openNew()}>
              Nueva solicitud
            </Btn>
          ) : null
        }
      />

      <div className="kpis">
        <Kpi label="Urgente ahora" value={urgent.length} unit="SKU" foot="Quiebre o riesgo de producción" icon="alert" />
        <Kpi label="Pronóstico pronto" value={soon.length} unit="SKU" foot={`Lead time ${forecast.leadDays} días`} icon="calendar" />
        <Kpi label="Riesgo producción" value={forecast.productionRisks.length} unit="" foot="BOM / materia prima" icon="layers" />
        <Kpi
          label="Aprendizaje del modelo"
          value={`${forecast.learningScore}%`}
          unit=""
          foot="Sube con más historial estable"
          icon="spark"
        />
      </div>

      <section className="fc-banner" aria-label="Insight de previsión">
        <Icon name="spark" />
        <div>
          <strong>Previsión adaptativa</strong>
          <p>{forecast.insight}</p>
        </div>
        <Btn icon="chart" onClick={() => navigate('/reportes')}>Ver reportes</Btn>
      </section>

      <section className="panel fc-panel">
        <div className="panel-head">
          <span className="panel-title">Recomendaciones de abastecimiento</span>
          <Badge text={`${forecast.recommendations.length} activas`} color="blue" />
        </div>
        {forecast.recommendations.length ? (
          <div className="table-scroll">
            <table className="fc-table">
              <thead>
                <tr>
                  <th>Prioridad</th>
                  <th>Ítem</th>
                  <th>Cobertura</th>
                  <th>Sugerido</th>
                  <th>Confianza</th>
                  <th>Motivo</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {forecast.recommendations.slice(0, 16).map((row) => (
                  <tr key={row.productId} className={row.productionRisk ? 'fc-row-risk' : row.urgency === 'now' ? 'fc-row-now' : ''}>
                    <td>
                      <span className={`fc-urgency fc-urgency-${row.productionRisk ? 'risk' : row.urgency}`}>
                        {row.productionRisk ? 'Producción' : row.urgency === 'now' ? 'Ahora' : row.urgency === 'soon' ? 'Pronto' : 'Vigilancia'}
                      </span>
                    </td>
                    <td>
                      <ProductCell
                        name={row.name}
                        id={row.productId}
                        category={`${row.kind === 'raw' ? 'Insumo' : 'Producto'} · ${row.category}`}
                      />
                      {row.blocksParents > 0 && (
                        <small className="fc-parents">Bloquea {row.blocksParents}: {row.parentNames.slice(0, 2).join(', ')}{row.parentNames.length > 2 ? '…' : ''}</small>
                      )}
                    </td>
                    <td>
                      <strong>{row.daysCover === null ? '—' : `${row.daysCover}d`}</strong>
                      <small className="sub">{num(row.available)} disp. · mín. {num(row.min)}</small>
                      <div className="fc-learn" title={`Aprendizaje ${(row.learningWeight * 100).toFixed(0)}%`}>
                        <span style={{ width: `${Math.max(8, row.learningWeight * 100)}%` }} />
                      </div>
                    </td>
                    <td>
                      <strong>{num(row.suggestedQty)}</strong>
                      <small className="sub">~{row.dailyDemand.toFixed(1)} uds/día</small>
                    </td>
                    <td>
                      <span className={`fc-conf fc-conf-${row.confidence}`}>
                        {confidenceLabel[row.confidence]} · {row.confidenceScore}%
                      </span>
                    </td>
                    <td className="fc-reason">{row.reason}</td>
                    <td>
                      {canManage ? (
                        <Btn variant="small" icon="plus" onClick={() => openNew(row.productId, row.suggestedQty || undefined)}>
                          Solicitar
                        </Btn>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty title="Sin recomendaciones" desc="El inventario cubre el horizonte. El modelo sigue aprendiendo en segundo plano." />
        )}
      </section>

      <section className="panel" style={{ marginTop: 18 }}>
        <div className="panel-head">
          <span className="panel-title">Solicitudes de compra</span>
        </div>
        {state.purchases.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Orden</th>
                  <th>Producto</th>
                  <th>Recibido</th>
                  <th>Estado</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {state.purchases.map((o) => {
                  const status = o.status ?? 'Abierta';
                  const open = status === 'Abierta' || status === 'Parcial';
                  return (
                    <tr key={o.id}>
                      <td>
                        <strong>{o.id}</strong>
                        <span className="sub">{dateShort(o.date)}</span>
                      </td>
                      <td>{product(state, o.productId)?.name}</td>
                      <td>
                        {o.received ?? 0} / {o.qty} u.
                      </td>
                      <td>
                        <Badge text={status} color={statusColor(status)} />
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        {open && canManage ? (
                          <>
                            <Btn
                              variant="small"
                              icon="receive"
                              onClick={() =>
                                navigate('/recepcion', {
                                  state: { productId: o.productId, purchaseId: o.id, qty: o.qty - (o.received ?? 0) },
                                })
                              }
                            >
                              Recibir
                            </Btn>{' '}
                            <Btn variant="small" icon="close" onClick={() => void cancel(o.id)}>
                              Cancelar
                            </Btn>
                          </>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty title="Sin solicitudes" desc="Crea la primera desde una recomendación del modelo." />
        )}
      </section>

      {modalOpen ? (
        <Modal
          title="Nueva solicitud de compra"
          subtitle="Cantidad prellenada por la previsión adaptativa (puedes ajustarla)."
          onClose={() => setModalOpen(false)}
          footer={
            <ModalActions onCancel={() => setModalOpen(false)} submitLabel="Registrar" formId="purchase-form" icon="save" />
          }
        >
          <form id="purchase-form" onSubmit={submit} key={`${prefillProduct}-${prefillQty}`}>
            <div className="form-grid">
              <div className="field full">
                <label htmlFor="pur-product">Producto / Insumo</label>
                <select
                  id="pur-product"
                  name="productId"
                  defaultValue={prefillProduct}
                  onChange={(e) => {
                    const id = e.target.value;
                    setPrefillProduct(id);
                    setPrefillQty(suggestedPurchaseQty(state, id));
                  }}
                >
                  {state.products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {isRaw(p) ? 'MP' : 'PT'} · {p.id} / {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="pur-qty">Cantidad sugerida</label>
                <input id="pur-qty" name="qty" type="number" min={1} defaultValue={prefillQty} required />
              </div>
              <div className="field">
                <label htmlFor="pur-date">Fecha</label>
                <input id="pur-date" name="date" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required />
              </div>
              <div className="field full">
                <label htmlFor="pur-notes">Observaciones</label>
                <textarea
                  id="pur-notes"
                  name="notes"
                  maxLength={300}
                  defaultValue={
                    forecast.recommendations.find((r) => r.productId === prefillProduct)?.reason?.slice(0, 280) ?? ''
                  }
                />
              </div>
            </div>
            {error ? <div className="form-error visible">{error}</div> : null}
          </form>
        </Modal>
      ) : null}
    </>
  );
}
