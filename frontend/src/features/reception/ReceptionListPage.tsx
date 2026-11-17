import { useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAppState } from '../../shared/hooks/AppStateProvider';
import { dateShort, product } from '../../shared/lib/inventory';
import { Btn, Empty, Kpi, KpiGrid, PageHead, ProductCell, cx } from '../../shared/components/ui';
import { Icon } from '../../shared/components/Icon';
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
  const { state } = useAppState();
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
      return [r.id, r.productId, p?.name, r.supplier, r.batch, r.loc].join(' ').toLowerCase().includes(q);
    });
  }, [state, receipts, query, period, today, since7, since30]);

  if (!state) return null;

  const todayCount = receipts.filter((r) => r.date.slice(0, 10) === today).length;
  const week = receipts.filter((r) => r.date.slice(0, 10) >= since7);
  const weekUnits = week.reduce((sum, r) => sum + r.qty, 0);
  const suppliers30 = new Set(receipts.filter((r) => r.date.slice(0, 10) >= since30).map((r) => r.supplier)).size;
  const openPurchases = state.purchases.filter((p) => !p.status || p.status === 'Abierta' || p.status === 'Parcial').length;

  const goNew = () => navigate('/recepcion/nueva');

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
                  <th>Lote</th>
                  <th className="num">Cantidad</th>
                  <th>Ubicación</th>
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
                      <td>{r.supplier || '—'}</td>
                      <td>
                        <span className="reception-code">{r.batch || '—'}</span>
                      </td>
                      <td className="num">
                        <strong>{r.qty}</strong> u.
                      </td>
                      <td>
                        <span className="reception-code">{r.loc || '—'}</span>
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

        {list.length ? (
          <div className="reception-list-foot">
            {list.length} de {receipts.length} recepciones
          </div>
        ) : null}
      </section>
    </div>
  );
}
