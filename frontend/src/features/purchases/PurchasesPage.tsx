import { useEffect, useMemo, useState } from 'react';
import { Select } from '../../shared/components/Select';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAppState } from '../../shared/hooks/AppStateProvider';
import { api } from '../../shared/api/client';
import { product, statusColor } from '../../shared/lib/inventory';
import { useAuth } from '../../shared/hooks/AuthProvider';
import { can } from '../../shared/auth/permissions';
import { isRaw } from '../../shared/lib/bom';
import { packsOf, purchaseLines } from '../../shared/lib/wholesale';
import { ImportDialog } from '../imports/ImportDialog';
import { buildForecast, suggestedPurchaseQty, type ConfidenceLevel } from '../../shared/lib/forecast';
import { Badge, Btn, Empty, Kpi, KpiGrid, PageHead, ProductCell } from '../../shared/components/ui';
import { Modal, ModalActions } from '../../shared/components/Modal';
import { dateShort, money, num } from '../../shared/lib/inventory';
import { Icon } from '../../shared/components/Icon';
import { ReceivePurchaseDialog } from './ReceivePurchaseDialog';
import '../../styles/forecast.css';
import { Input, Textarea } from '../../shared/components/Input';

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
  const [importOpen, setImportOpen] = useState(false);
  const [supplierOpen, setSupplierOpen] = useState(false);
  const [prefillProduct, setPrefillProduct] = useState('');
  const [prefillQty, setPrefillQty] = useState(12);
  const [supplierId, setSupplierId] = useState('');
  const [lines, setLines] = useState<Array<{ productId: string; qty: number; packCode: string; unitPrice: number }>>([]);
  const [error, setError] = useState('');
  const [showInvalid, setShowInvalid] = useState(false);
  const [receivingId, setReceivingId] = useState('');
  const [closing, setClosing] = useState<{ id: string; reason: string } | null>(null);
  const [focusId, setFocusId] = useState('');
  const [detailId, setDetailId] = useState('');
  const [tab, setTab] = useState<'rec' | 'ord'>('rec');
  const [filter, setFilter] = useState<'all' | 'open' | 'partial' | 'done'>('all');

  const forecast = useMemo(() => (state ? buildForecast(state) : null), [state]);

  useEffect(() => {
    const focus = (location.state as { focus?: string } | null)?.focus;
    if (!focus) return;
    setFocusId(focus);
    setTab('ord');
    setFilter('all');
    window.setTimeout(() => document.getElementById(`po-${focus}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 50);
  }, [location.state]);

  useEffect(() => {
    const navState = location.state as { productId?: string; qty?: number } | null;
    if (!navState?.productId || !state) return;
    setPrefillProduct(navState.productId);
    const amount = navState.qty ?? suggestedPurchaseQty(state, navState.productId);
    const item = state.products.find((p) => p.id === navState.productId);
    setPrefillQty(amount);
    setSupplierId(item?.supplierId ?? state.suppliers?.[0]?.id ?? '');
    setLines([{ productId: navState.productId, qty: Math.max(1, Math.round(amount)), packCode: 'unidad', unitPrice: item?.price ?? 0 }]);
    setModalOpen(true);
    setError('');
    navigate(location.pathname, { replace: true, state: null });
  }, [location.state, location.pathname, navigate, state]);

  if (!state || !forecast) return null;

  const canManage = can(user, 'purchases');
  const groupOf = (status?: string) =>
    (status ?? 'Abierta') === 'Abierta' ? 'open' : status === 'Parcial' ? 'partial' : 'done';
  const shownOrders = state.purchases.filter((o) => filter === 'all' || groupOf(o.status) === filter);
  const usedIds = new Set(lines.map((l) => l.productId).filter(Boolean));
  const hasBlank = lines.some((l) => !l.productId);
  const canAdd = !hasBlank && state.products.some((p) => !usedIds.has(p.id));
  const urgent = forecast.recommendations.filter((r) => r.urgency === 'now' || r.productionRisk);
  const soon = forecast.recommendations.filter((r) => r.urgency === 'soon' && !r.productionRisk);

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    const data = Object.fromEntries(new FormData(e.currentTarget));
    if (lines.some((l) => !l.productId)) {
      setShowInvalid(true);
      return;
    }
    if (new Set(lines.map((l) => l.productId)).size !== lines.length) {
      setError('Hay productos repetidos. Une las cantidades en una sola línea.');
      return;
    }
    try {
      applyResponse(
        await api.addPurchase({
          supplierId: supplierId || undefined,
          date: data.date,
          expectedDate: data.expectedDate,
          notes: data.notes,
          lines,
        }),
      );
      toast('Orden de compra registrada.');
      setModalOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    }
  };

  const saveSupplier = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.currentTarget));
    try {
      applyResponse(
        await api.addSupplier({
          name: data.name,
          taxId: data.taxId,
          contact: data.contact,
          email: data.email,
          phone: data.phone,
          leadTimeDays: Number(data.leadTimeDays || 7),
          terms: data.terms,
        }),
      );
      toast('Proveedor guardado.');
      setSupplierOpen(false);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'No se pudo guardar el proveedor.');
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

  const closeShort = async () => {
    if (!closing) return;
    try {
      applyResponse(await api.closePurchase(closing.id, closing.reason));
      toast(`Orden ${closing.id} cerrada con faltante.`);
      setClosing(null);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'No se pudo cerrar la orden.');
    }
  };

  const openNew = (productId?: string, qty?: number) => {
    const id = productId ?? '';
    const amount = qty ?? (id ? suggestedPurchaseQty(state, id) : 1);
    const item = state.products.find((p) => p.id === id);
    setPrefillProduct(id);
    setPrefillQty(amount);
    setSupplierId(item?.supplierId ?? state.suppliers?.[0]?.id ?? '');
    setLines([{ productId: id, qty: Math.max(1, Math.round(amount)), packCode: 'unidad', unitPrice: item?.price ?? 0 }]);
    setShowInvalid(false);
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
            <>
              <Btn icon="receive" onClick={() => setImportOpen(true)}>
                Importar
              </Btn>
              <Btn icon="plus" onClick={() => setSupplierOpen(true)}>
                Proveedor
              </Btn>
              <Btn variant="primary" icon="plus" onClick={() => openNew()}>
                Nueva orden
              </Btn>
            </>
          ) : null
        }
      />

      <KpiGrid>
        <Kpi label="Urgente ahora" tone={urgent.length ? 'danger' : 'default'} value={urgent.length} unit="SKU" foot="Quiebre o riesgo de producción" icon="alert" />
        <Kpi label="Pronóstico pronto" value={soon.length} unit="SKU" foot={`Lead time ${forecast.leadDays} días`} icon="calendar" />
        <Kpi label="Riesgo producción" value={forecast.productionRisks.length} unit="" foot="BOM / materia prima" icon="layers" />
        <Kpi
          label="Aprendizaje del modelo"
          value={`${forecast.learningScore}%`}
          unit=""
          foot="Sube con más historial estable"
          icon="spark"
        />
      </KpiGrid>

      <div className="po-tabs" role="tablist" aria-label="Vista de compras">
        <button type="button" role="tab" aria-selected={tab === 'rec'} className="po-tab" onClick={() => setTab('rec')}>
          Por solicitar
          {forecast.recommendations.length ? (
            <span className="po-count alert">{forecast.recommendations.length}</span>
          ) : null}
        </button>
        <button type="button" role="tab" aria-selected={tab === 'ord'} className="po-tab" onClick={() => setTab('ord')}>
          Órdenes
          <span className="po-count">{state.purchases.length}</span>
        </button>
      </div>

      {tab === 'rec' ? (
        <section aria-label="Por solicitar" className="po-rec">
          <div className="fc-banner">
            <Icon name="spark" />
            <div>
              <strong>Previsión adaptativa</strong>
              <p>{forecast.insight}</p>
            </div>
            <Btn icon="chart" onClick={() => navigate('/reportes')}>Ver reportes</Btn>
          </div>
          {forecast.recommendations.length ? (
            <div className="po-cards">
              {forecast.recommendations.slice(0, 18).map((row) => {
                const tone = row.productionRisk ? 'risk' : row.urgency;
                const pct =
                  row.daysCover === null ? 100 : Math.max(6, Math.min(100, (row.daysCover / (forecast.leadDays * 2)) * 100));
                const bar = tone === 'risk' || tone === 'now' ? 'bad' : tone === 'soon' ? 'warn' : 'ok';
                return (
                  <article key={row.productId} className="po-card">
                    <div className="po-card-top">
                      <span className={`fc-urgency fc-urgency-${tone}`}>
                        {row.productionRisk ? 'Producción' : row.urgency === 'now' ? 'Ahora' : row.urgency === 'soon' ? 'Pronto' : 'Vigilancia'}
                      </span>
                      <span className={`fc-conf fc-conf-${row.confidence}`}>
                        {confidenceLabel[row.confidence]} · {row.confidenceScore}%
                      </span>
                    </div>
                    <div>
                      <ProductCell
                        name={row.name}
                        id={row.productId}
                        category={`${row.kind === 'raw' ? 'Insumo' : 'Producto'} · ${row.category}`}
                      />
                      {row.blocksParents > 0 && (
                        <small className="fc-parents">Bloquea {row.blocksParents}: {row.parentNames.slice(0, 2).join(', ')}{row.parentNames.length > 2 ? '…' : ''}</small>
                      )}
                    </div>
                    <div className="po-cover">
                      <div>
                        <span>Cobertura</span>
                        <b>{row.daysCover === null ? '—' : `${row.daysCover} d`}</b>
                      </div>
                      <div className={`po-bar ${bar}`} role="img" aria-label={`Cobertura ${row.daysCover ?? 'sin dato'} días`}>
                        <span style={{ width: `${pct}%` }} />
                      </div>
                      <small>
                        {num(row.available)} disp. · mín. {num(row.min)} · ~{row.dailyDemand.toFixed(1)} uds/día
                      </small>
                    </div>
                    <p className="po-reason">{row.reason}</p>
                    {canManage ? (
                      <Btn icon="plus" onClick={() => openNew(row.productId, row.suggestedQty || undefined)}>
                        Solicitar {row.suggestedQty ? `${num(row.suggestedQty)} u.` : ''}
                      </Btn>
                    ) : null}
                  </article>
                );
              })}
            </div>
          ) : (
            <Empty title="Sin recomendaciones" desc="El inventario cubre el horizonte. El modelo sigue aprendiendo en segundo plano." />
          )}
        </section>
      ) : (
        <section className="panel" aria-label="Órdenes">
          <div className="po-filters">
            {(
              [
                ['all', 'Todas'],
                ['open', 'Abiertas'],
                ['partial', 'Parciales'],
                ['done', 'Cerradas'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                className="po-filter"
                aria-pressed={filter === key}
                onClick={() => setFilter(key)}
              >
                {label} · {state.purchases.filter((o) => groupOf(o.status) === key || key === 'all').length}
              </button>
            ))}
          </div>
          {shownOrders.length ? (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Orden</th>
                    <th>Proveedor</th>
                    <th>Líneas</th>
                    <th>Recibido</th>
                    <th>Estado</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {shownOrders.map((o) => {
                    const status = o.status ?? 'Abierta';
                    const open = status === 'Abierta' || status === 'Parcial';
                    const linesOf = purchaseLines(o);
                    const supplier = state.suppliers?.find((item) => item.id === o.supplierId);
                    const isAdmin = user?.role === 'admin';
                    const received = o.received ?? 0;
                    const recvPct = o.qty ? Math.min(100, (received / o.qty) * 100) : 0;
                    return (
                      <tr key={o.id} id={`po-${o.id}`} className={focusId === o.id ? 'is-new' : undefined}>
                        <td>
                          <strong>{o.id}</strong>
                          <span className="sub">{dateShort(o.date)}</span>
                        </td>
                        <td>{supplier?.name ?? 'Sin proveedor'}</td>
                        <td>
                          <strong>
                            {linesOf.length} {linesOf.length === 1 ? 'producto' : 'productos'}
                          </strong>
                          <span className="sub">{o.qty} u. en total</span>
                        </td>
                        <td className="po-recv">
                          <div className={`po-bar ${status === 'Parcial' ? 'warn' : recvPct >= 100 ? 'ok' : ''}`} role="img" aria-label={`Recibido ${received} de ${o.qty}`}>
                            <span style={{ width: `${recvPct}%` }} />
                          </div>
                          <small>
                            {received} / {o.qty} u.
                          </small>
                        </td>
                        <td>
                          <Badge text={status} color={statusColor(status)} />
                        </td>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          <Btn variant="small" icon="eye" onClick={() => setDetailId(o.id)}>
                            Ver detalles
                          </Btn>{' '}
                          {open && canManage ? (
                            <>
                              <Btn variant="small" icon="receive" onClick={() => setReceivingId(o.id)}>
                                Recibir
                              </Btn>{' '}
                              {status === 'Parcial' ? (
                                isAdmin ? (
                                  <Btn variant="small" icon="check" onClick={() => setClosing({ id: o.id, reason: '' })}>
                                    Cerrar con faltante
                                  </Btn>
                                ) : null
                              ) : (
                                <Btn variant="small" icon="close" onClick={() => void cancel(o.id)}>
                                  Cancelar
                                </Btn>
                              )}
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
            <Empty
              title={state.purchases.length ? 'Sin órdenes en este filtro' : 'Sin solicitudes'}
              desc={state.purchases.length ? 'Prueba con otro estado.' : 'Crea la primera desde una recomendación del modelo.'}
            />
          )}
        </section>
      )}

      {detailId && state.purchases.some((p) => p.id === detailId)
        ? (() => {
            const o = state.purchases.find((p) => p.id === detailId)!;
            const supplier = state.suppliers?.find((item) => item.id === o.supplierId);
            const status = o.status ?? 'Abierta';
            return (
              <Modal
                title={`Orden ${o.id}`}
                subtitle={`${supplier?.name ?? 'Sin proveedor'} · ${dateShort(o.date)}`}
                onClose={() => setDetailId('')}
                footer={<Btn onClick={() => setDetailId('')}>Cerrar</Btn>}
              >
                <div className="po-detail">
                  <div className="po-summary">
                    <div className="po-summary-row">
                      <Badge text={status} color={statusColor(status)} />
                      {status === 'Abierta' || status === 'Parcial' ? (
                        <span className="po-summary-eta">
                          {o.expectedDate ? `Llegada esperada ${dateShort(o.expectedDate)}` : 'Sin fecha estimada'}
                        </span>
                      ) : null}
                      <span className="po-summary-total">
                        <b>{num(o.received ?? 0)}</b> / {num(o.qty)} u. recibidas
                      </span>
                    </div>
                    <div className={`po-bar ${status === 'Parcial' ? 'warn' : (o.received ?? 0) >= o.qty ? 'ok' : ''}`}>
                      <span style={{ width: `${o.qty ? Math.min(100, ((o.received ?? 0) / o.qty) * 100) : 0}%` }} />
                    </div>
                  </div>

                  <section>
                    <h3 className="po-detail-title">
                      Productos <span>· {purchaseLines(o).length}</span>
                    </h3>
                    <ul className="po-detail-lines">
                      {purchaseLines(o).map((line) => {
                        const units = line.qty * (line.unitsPerPack || 1);
                        return (
                          <li key={`${o.id}-${line.productId}`}>
                            <div>
                              <strong>{product(state, line.productId)?.name ?? line.productId}</strong>
                              <small>
                                {line.packCode}
                                {line.unitsPerPack > 1 ? ` × ${line.unitsPerPack}` : ''}
                              </small>
                            </div>
                            <div className="po-detail-qty">
                              <b>{num(units)} u.</b>
                              <small>Recibido {num(line.receivedUnits ?? 0)}</small>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </section>

                  {o.orderIds?.length ? (
                    <section>
                      <h3 className="po-detail-title">Pedidos relacionados</h3>
                      <div className="po-detail-links">
                        {o.orderIds.map((id) => (
                          <button
                            key={id}
                            type="button"
                            className="po-filter"
                            onClick={() => navigate('/pedidos', { state: { open: id } })}
                          >
                            {id}
                          </button>
                        ))}
                      </div>
                    </section>
                  ) : null}
                  {o.closeReason ? (
                    <section>
                      <h3 className="po-detail-title">Cerrada con faltante</h3>
                      <p className="po-detail-text">{o.closeReason}</p>
                    </section>
                  ) : null}
                  {o.notes ? (
                    <section>
                      <h3 className="po-detail-title">Observaciones</h3>
                      <p className="po-detail-text">{o.notes}</p>
                    </section>
                  ) : null}
                </div>
              </Modal>
            );
          })()
        : null}

      {receivingId && state.purchases.some((p) => p.id === receivingId) ? (
        <ReceivePurchaseDialog
          state={state}
          purchase={state.purchases.find((p) => p.id === receivingId)!}
          onClose={() => setReceivingId('')}
        />
      ) : null}

      {closing ? (
        <Modal
          title={`Cerrar ${closing.id} con faltante`}
          subtitle="Lo recibido se queda en bodega. El faltante ya no se espera del proveedor."
          onClose={() => setClosing(null)}
          footer={
            <>
              <Btn onClick={() => setClosing(null)}>Volver</Btn>
              <Btn variant="primary" icon="check" disabled={!closing.reason.trim()} onClick={() => void closeShort()}>
                Cerrar orden
              </Btn>
            </>
          }
        >
          <div className="field full">
            <label htmlFor="po-close-reason">Motivo</label>
            <Input
              id="po-close-reason"
              value={closing.reason}
              placeholder="Ej.: el proveedor no tiene más stock"
              onChange={(e) => setClosing({ ...closing, reason: e.target.value })}
            />
          </div>
        </Modal>
      ) : null}

      {modalOpen ? (
        <Modal
          title="Nueva solicitud de compra"
          subtitle="Cantidades prellenadas por la previsión adaptativa. Puedes ajustarlas antes de registrar."
          className="po-modal"
          onClose={() => setModalOpen(false)}
          footer={
            <>
              <div className="po-totals" aria-live="polite">
                <div>
                  <span>Unidades</span>
                  <b>{num(lines.reduce((sum, l) => sum + (l.qty || 0), 0))}</b>
                </div>
                <div>
                  <span>Total estimado</span>
                  <b>{money(lines.reduce((sum, l) => sum + (l.qty || 0) * (l.unitPrice || 0), 0))}</b>
                </div>
              </div>
              <ModalActions onCancel={() => setModalOpen(false)} submitLabel="Registrar solicitud" formId="purchase-form" icon="save" />
            </>
          }
        >
          <form id="purchase-form" className="po-form" onSubmit={submit} key={`${prefillProduct}-${prefillQty}`}>
            <div className="field">
              <label htmlFor="pur-supplier">Proveedor</label>
              <Select id="pur-supplier" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
                <option value="">Sin proveedor</option>
                {(state.suppliers ?? []).map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name}
                    {supplier.taxId ? ` · ${supplier.taxId}` : ''}
                  </option>
                ))}
              </Select>
            </div>

            <div className="po-section">
              <div className="po-section-head">
                <h3>
                  Productos <span>· {lines.length}</span>
                </h3>
                <button
                  type="button"
                  className="btn small"
                  disabled={!canAdd}
                  title={canAdd ? undefined : hasBlank ? 'Elige primero el producto de la línea vacía' : 'Ya agregaste todos los productos'}
                  onClick={() =>
                    setLines((current) => [...current, { productId: '', qty: 1, packCode: 'unidad', unitPrice: 0 }])
                  }
                >
                  <Icon name="plus" />
                  Añadir línea
                </button>
              </div>
              <div className="po-cols" aria-hidden="true">
                <span>Producto</span>
                <span>Presentación</span>
                <span>Cantidad</span>
                <span>Costo unit.</span>
                <span className="end">Subtotal</span>
                <span />
              </div>
              {lines.map((line, index) => {
                const item = state.products.find((p) => p.id === line.productId);
                const packs = packsOf(item);
                const patch = (change: Partial<typeof line>) =>
                  setLines((current) => current.map((row, i) => (i === index ? { ...row, ...change } : row)));
                return (
                  <div className="po-line" key={`${line.productId}-${index}`}>
                    <div className={showInvalid && !line.productId ? 'field has-error' : 'field'}>
                      <Select
                        aria-label={`Producto ${index + 1}`}
                        aria-invalid={showInvalid && !line.productId ? true : undefined}
                        value={line.productId}
                        onChange={(e) => {
                          const next = state.products.find((p) => p.id === e.target.value);
                          patch({ productId: e.target.value, packCode: 'unidad', unitPrice: next?.price ?? 0 });
                        }}
                      >
                        <option value="" disabled>
                          Selecciona un producto
                        </option>
                        {state.products.map((p) => (
                          <option
                            key={p.id}
                            value={p.id}
                            disabled={p.id !== line.productId && usedIds.has(p.id)}
                          >
                            {isRaw(p) ? 'MP' : 'PT'} · {p.name}
                          </option>
                        ))}
                      </Select>
                    </div>
                    <div className="field">
                      <Select
                        aria-label={`Empaque ${index + 1}`}
                        value={line.packCode}
                        onChange={(e) => patch({ packCode: e.target.value })}
                      >
                        {packs.map((pack) => (
                          <option key={pack.code} value={pack.code}>
                            {pack.label} × {pack.units}
                          </option>
                        ))}
                      </Select>
                    </div>
                    <div className="po-qty">
                      <button
                        type="button"
                        aria-label={`Disminuir cantidad ${index + 1}`}
                        onClick={() => patch({ qty: Math.max(1, (line.qty || 1) - 1) })}
                      >
                        −
                      </button>
                      <input
                        aria-label={`Cantidad ${index + 1}`}
                        type="number"
                        min={1}
                        value={line.qty}
                        onChange={(e) => patch({ qty: Number(e.target.value) })}
                        required
                      />
                      <button
                        type="button"
                        aria-label={`Aumentar cantidad ${index + 1}`}
                        onClick={() => patch({ qty: (line.qty || 0) + 1 })}
                      >
                        +
                      </button>
                    </div>
                    <div className="field">
                      <Input
                        aria-label={`Precio ${index + 1}`}
                        type="number"
                        min={0}
                        step="0.01"
                        value={line.unitPrice}
                        onChange={(e) => patch({ unitPrice: Number(e.target.value) })}
                      />
                    </div>
                    <output className="po-sub">{money((line.qty || 0) * (line.unitPrice || 0))}</output>
                    <button
                      type="button"
                      className="icon-btn po-remove"
                      aria-label={`Quitar línea ${index + 1}`}
                      disabled={lines.length === 1}
                      onClick={() => setLines((current) => current.filter((_, i) => i !== index))}
                    >
                      <Icon name="trash" />
                    </button>
                  </div>
                );
              })}
            </div>

            <div className="po-dates">
              <div className="field">
                <label htmlFor="pur-date">Fecha</label>
                <Input id="pur-date" name="date" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required />
              </div>
              <div className="field">
                <label htmlFor="pur-expected">Llegada esperada</label>
                <Input id="pur-expected" name="expectedDate" type="date" />
              </div>
            </div>
            <div className="field">
              <label htmlFor="pur-notes">Observaciones</label>
              <Textarea
                id="pur-notes"
                name="notes"
                maxLength={300}
                defaultValue={
                  forecast.recommendations.find((r) => r.productId === prefillProduct)?.reason?.slice(0, 280) ?? ''
                }
              />
            </div>
            {error ? <div className="form-error visible">{error}</div> : null}
          </form>
        </Modal>
      ) : null}
      {importOpen ? (
        <ImportDialog
          kind="purchase"
          onClose={() => setImportOpen(false)}
          onDone={(message) => {
            setImportOpen(false);
            toast(message);
          }}
        />
      ) : null}
      {supplierOpen ? (
        <Modal
          title="Nuevo proveedor"
          subtitle="RUC, contacto y tiempo de entrega para las compras al por mayor."
          onClose={() => setSupplierOpen(false)}
          footer={<ModalActions onCancel={() => setSupplierOpen(false)} submitLabel="Guardar" formId="supplier-form" icon="save" />}
        >
          <form id="supplier-form" onSubmit={(e) => void saveSupplier(e)}>
            <div className="form-grid">
              <div className="field full">
                <label htmlFor="sup-name">Nombre</label>
                <Input id="sup-name" name="name" required />
              </div>
              <div className="field">
                <label htmlFor="sup-tax">RUC</label>
                <Input id="sup-tax" name="taxId" inputMode="numeric" pattern="\d{13}" minLength={13} maxLength={13} required />
              </div>
              <div className="field">
                <label htmlFor="sup-lead">Días de entrega</label>
                <Input id="sup-lead" name="leadTimeDays" type="number" min={0} defaultValue={7} />
              </div>
              <div className="field">
                <label htmlFor="sup-contact">Contacto</label>
                <Input id="sup-contact" name="contact" />
              </div>
              <div className="field">
                <label htmlFor="sup-phone">Teléfono</label>
                <Input id="sup-phone" name="phone" />
              </div>
              <div className="field full">
                <label htmlFor="sup-email">Correo</label>
                <Input id="sup-email" name="email" type="email" />
              </div>
              <div className="field full">
                <label htmlFor="sup-terms">Condiciones</label>
                <Input id="sup-terms" name="terms" placeholder="Crédito 30 días, pedido mínimo…" />
              </div>
            </div>
          </form>
        </Modal>
      ) : null}
    </>
  );
}
