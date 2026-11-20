import { useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAppState } from '../../shared/hooks/AppStateProvider';
import { dateShort, daysUntil, expiryTone, product } from '../../shared/lib/inventory';
import { Btn, Empty, Kpi, KpiGrid, PageHead, ProductCell, cx } from '../../shared/components/ui';
import { Icon } from '../../shared/components/Icon';
import { Modal } from '../../shared/components/Modal';
import { api } from '../../shared/api/client';
import { useAuth } from '../../shared/hooks/AuthProvider';
import '../../styles/reception.css';

type Period = 'all' | 'today' | '7d' | '30d';

const periods: Array<{ id: Period; label: string }> = [
  { id: 'all', label: 'Todas' },
  { id: 'today', label: 'Hoy' },
  { id: '7d', label: 'Últimos 7 días' },
  { id: '30d', label: 'Últimos 30 días' },
];

/** Fecha local (Ecuador) en formato YYYY-MM-DD, igual que las recepciones. */
function isoDay(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() - offsetDays);
  return d.toLocaleDateString('en-CA', { timeZone: 'America/Guayaquil' });
}

export function ReceptionListPage() {
  const { state, applyResponse, toast } = useAppState();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [rejecting, setRejecting] = useState<{ lotId: string; receiptId: string; reason: string } | null>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const highlight = (location.state as { highlight?: string } | null)?.highlight;
  const [query, setQuery] = useState('');
  const [period, setPeriod] = useState<Period>('all');

  const receipts = state?.receipts ?? [];
  const today = isoDay();
  const since7 = isoDay(6);
  const since30 = isoDay(29);

  const list = useMemo(() => {
    if (!state) return [];
    const q = query.trim().toLowerCase();
    const from = period === 'today' ? today : period === '7d' ? since7 : period === '30d' ? since30 : '';
    return receipts.filter((r) => {
      if (from && r.date.slice(0, 10) < from) return false;
      if (!q) return true;
      const p = product(state, r.productId);
      return [r.id, r.productId, p?.name, r.supplier, r.batch, r.loc, r.purchaseId, r.reason].join(' ').toLowerCase().includes(q);
    });
  }, [state, receipts, query, period, today, since7, since30]);

  if (!state) return null;

  const todayCount = receipts.filter((r) => r.date.slice(0, 10) === today).length;
  const week = receipts.filter((r) => r.date.slice(0, 10) >= since7);
  const weekUnits = week.reduce((sum, r) => sum + r.qty, 0);
  const suppliers30 = new Set(receipts.filter((r) => r.date.slice(0, 10) >= since30).map((r) => r.supplier)).size;
  const openPurchases = state.purchases.filter((p) => !p.status || p.status === 'Abierta' || p.status === 'Parcial').length;

  const goNew = () => navigate('/recepcion/nueva');
  const pendingInspection = receipts.filter((r) => r.inspection === 'Pendiente').length;

  const release = async (lotId: string, receiptId: string) => {
    try {
      applyResponse(await api.releaseLot(lotId));
      toast(`Lote de ${receiptId} liberado: ya se puede vender.`);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'No se pudo liberar el lote.');
    }
  };

  const reject = async () => {
    if (!rejecting) return;
    try {
      applyResponse(await api.rejectLot(rejecting.lotId, rejecting.reason));
      toast(`Lote de ${rejecting.receiptId} rechazado y enviado a cuarentena.`);
      setRejecting(null);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'No se pudo rechazar el lote.');
    }
  };

  return (
    <div className="reception-page">
      <PageHead
        eyebrow="Ingreso de mercadería"
        title="Recepciones"
        desc="Historial de ingresos a bodega. Registra uno nuevo cuando llegue mercadería."
        actions={
          <Btn variant="primary" icon="plus" onClick={goNew}>
            Registrar recepción
          </Btn>
        }
      />

      <KpiGrid label="Resumen de recepciones">
        <Kpi
          label="Hoy"
          value={todayCount}
          unit="recepciones"
          icon="receive"
          caption="Ver solo hoy"
          onClick={() => setPeriod(period === 'today' ? 'all' : 'today')}
          active={period === 'today'}
        />
        <Kpi label="Unidades (7 días)" value={weekUnits} unit="u." icon="box" caption={`${week.length} recepciones`} />
        <Kpi
          label="OC por recibir"
          value={openPurchases}
          unit="órdenes"
          icon="orders"
          tone={openPurchases ? 'primary' : 'default'}
          caption="Abiertas o parciales"
          onClick={() => navigate('/compras')}
        />
        <Kpi label="Proveedores (30 días)" value={suppliers30} icon="users" caption="Con entregas recibidas" />
      </KpiGrid>

      <section className="panel reception-list">
        <div className="toolbar">
          <div className="search-input">
            <Icon name="search" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por producto, lote, proveedor o ubicación…"
              aria-label="Buscar recepciones"
            />
          </div>
          <div className="reception-chips" role="group" aria-label="Periodo">
            {periods.map((p) => (
              <button
                key={p.id}
                type="button"
                className={cx('reception-chip', period === p.id && 'is-active')}
                aria-pressed={period === p.id}
                onClick={() => setPeriod(p.id)}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {list.length ? (
          <div className="table-scroll">
            <table className="reception-table">
              <thead>
                <tr>
                  <th>Recepción</th>
                  <th>Producto</th>
                  <th>Proveedor</th>
                  <th>Orden</th>
                  <th>Lote</th>
                  <th>Vence</th>
                  <th className="num">Cantidad</th>
                  <th>Ubicación</th>
                  <th>Calidad</th>
                </tr>
              </thead>
              <tbody>
                {list.map((r) => {
                  const p = product(state, r.productId);
                  return (
                    <tr key={r.id} className={r.id === highlight ? 'is-new' : undefined}>
                      <td>
                        <strong>{r.id}</strong>
                        <small>{dateShort(r.date)}</small>
                      </td>
                      <td>
                        <ProductCell name={p?.name ?? r.productId} id={r.productId} category={p?.category ?? '—'} />
                      </td>
                      <td>
                        {r.supplier || '—'}
                        {r.by ? <small>Recibió {r.by}</small> : null}
                      </td>
                      <td>
                        {r.purchaseId ? (
                          <button type="button" className="fx-link" onClick={() => navigate('/compras', { state: { focus: r.purchaseId } })}>
                            {r.purchaseId}
                          </button>
                        ) : (
                          <span className="fx-chip">{r.reason ?? 'Sin orden'}</span>
                        )}
                      </td>
                      <td>
                        <span className="reception-code">{r.batch || '—'}</span>
                      </td>
                      <td>
                        {r.expiry ? (
                          <span className={`fx-chip ${expiryTone(daysUntil(r.expiry))}`}>{dateShort(r.expiry)}</span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="num">
                        <strong>{r.qty}</strong> u.
                      </td>
                      <td>
                        <span className="reception-code">{r.loc || '—'}</span>
                      </td>
                      <td>
                        {r.inspection === 'Pendiente' ? (
                          <div style={{ display: 'grid', gap: 4 }}>
                            <span className="fx-chip amber">En inspección</span>
                            {isAdmin && r.lotId ? (
                              <div className="fx-hold-actions">
                                <Btn variant="small" icon="check" onClick={() => void release(r.lotId!, r.id)}>
                                  Liberar
                                </Btn>
                                <Btn variant="small" icon="close" onClick={() => setRejecting({ lotId: r.lotId!, receiptId: r.id, reason: '' })}>
                                  Rechazar
                                </Btn>
                              </div>
                            ) : null}
                          </div>
                        ) : r.inspection === 'Rechazado' ? (
                          <span className="fx-chip red">Rechazado</span>
                        ) : r.inspection === 'Liberado' ? (
                          <span className="fx-chip green">Liberado</span>
                        ) : (
                          <span className="fx-muted">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : receipts.length ? (
          <Empty title="Sin resultados" desc="No hay recepciones con esa búsqueda o periodo." />
        ) : (
          <Empty
            title="Aún no hay recepciones"
            desc="Cuando llegue mercadería, regístrala para sumarla al inventario."
            action={
              <Btn variant="primary" icon="plus" onClick={goNew}>
                Registrar recepción
              </Btn>
            }
          />
        )}

        {rejecting ? (
          <Modal
            title={`Rechazar lote de ${rejecting.receiptId}`}
            subtitle="El lote pasa a cuarentena para devolverlo al proveedor."
            onClose={() => setRejecting(null)}
            footer={
              <>
                <Btn onClick={() => setRejecting(null)}>Volver</Btn>
                <Btn variant="primary" icon="close" disabled={!rejecting.reason.trim()} onClick={() => void reject()}>
                  Rechazar lote
                </Btn>
              </>
            }
          >
            <div className="field full">
              <label htmlFor="rec-reject-reason">Motivo del rechazo</label>
              <input
                id="rec-reject-reason"
                value={rejecting.reason}
                placeholder="Ej.: envase roto, sin hoja de seguridad"
                onChange={(e) => setRejecting({ ...rejecting, reason: e.target.value })}
              />
            </div>
          </Modal>
        ) : null}

        {pendingInspection ? (
          <div className="no-shortage" role="status">
            <Icon name="alert" />
            <div>
              <strong>{pendingInspection} recepción(es) en inspección</strong>
              <p>Esos lotes no se venden hasta que administración los libere.</p>
            </div>
          </div>
        ) : null}

        {list.length ? (
          <div className="reception-list-foot">
            {list.length} de {receipts.length} recepciones
          </div>
        ) : null}
      </section>
    </div>
  );
}
