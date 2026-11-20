import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAppState } from '../../shared/hooks/AppStateProvider';
import { product, dateShort, time } from '../../shared/lib/inventory';
import { exportEvents } from '../../shared/lib/csv';
import { Badge, Btn, Empty, PageHead } from '../../shared/components/ui';
import { Icon } from '../../shared/components/Icon';
import { useAuth } from '../../shared/hooks/AuthProvider';
import '../../styles/traceability.css';

const TYPE_FILTERS = [
  { id: 'all', label: 'Todos' },
  { id: 'Recepción', label: 'Recepción' },
  { id: 'Traslado', label: 'Traslado' },
  { id: 'Despacho', label: 'Despacho' },
  { id: 'Entrega', label: 'Entrega' },
] as const;

function eventIcon(type: string) {
  if (type === 'Traslado') return 'swap';
  if (type === 'Recepción') return 'receive';
  if (type === 'Despacho') return 'truck';
  if (type === 'Entrega') return 'check';
  return 'box';
}

export function TraceabilityPage() {
  const { state, toast } = useAppState();
  const loc = useLocation();
  const navigate = useNavigate();
  const initialQ = (loc.state as { q?: string } | null)?.q ?? '';
  const [query, setQuery] = useState(initialQ);
  const [type, setType] = useState<(typeof TYPE_FILTERS)[number]['id']>('all');
  const { user } = useAuth();
  const [view, setView] = useState<'moves' | 'changes'>('moves');

  useEffect(() => {
    if (initialQ) setQuery(initialQ);
  }, [initialQ]);

  const events = useMemo(() => {
    if (!state) return [];
    const q = query.trim().toLowerCase();
    return state.events
      .filter((e) => (type === 'all' ? true : e.type === type))
      .filter((e) => {
        if (!q) return true;
        return [e.productId, product(state, e.productId)?.name, e.batch, e.type, e.ref, e.from, e.to, e.by]
          .join(' ')
          .toLowerCase()
          .includes(q);
      })
      .slice()
      .sort((a, b) => b.at.localeCompare(a.at));
  }, [state, query, type]);

  if (!state) return null;

  return (
    <div className="trz-page">
      <PageHead
        eyebrow="Trazabilidad"
        title="La historia de cada movimiento"
        desc="Recepción, ubicación, despacho y entrega — enlazado a pedidos y rutas."
        actions={
          <>
            <Btn icon="route" onClick={() => navigate('/logistica/historial')}>
              Historial de rutas
            </Btn>
            <Btn
              icon="download"
              onClick={() => {
                exportEvents(state);
                toast('Historial descargado.');
              }}
            >
              Exportar
            </Btn>
          </>
        }
      />

      {user?.role === 'admin' ? (
        <div className="segmented" role="group" aria-label="Historial" style={{ marginBottom: 12 }}>
          <button type="button" className={view === 'moves' ? 'active' : ''} aria-pressed={view === 'moves'} onClick={() => setView('moves')}>
            Movimientos
          </button>
          <button type="button" className={view === 'changes' ? 'active' : ''} aria-pressed={view === 'changes'} onClick={() => setView('changes')}>
            Cambios de precio y crédito
          </button>
        </div>
      ) : null}

      {view === 'changes' ? (
        <section className="panel trz-panel">
          <div className="trz-toolbar">
            <div className="search-input trz-search">
              <Icon name="search" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar producto, cliente, campo o usuario…" />
            </div>
          </div>
          {(() => {
            const q = query.trim().toLowerCase();
            const rows = (state.auditLog ?? []).filter(
              (a) => !q || [a.entity, a.entityId, a.entityName, a.field, a.by, a.from, a.to].join(' ').toLowerCase().includes(q),
            );
            return rows.length ? (
              <div className="fx-table-wrap">
                <table className="fx-table">
                  <thead>
                    <tr><th>Fecha</th><th>Usuario</th><th>Registro</th><th>Campo</th><th className="num">Antes</th><th className="num">Después</th></tr>
                  </thead>
                  <tbody>
                    {rows.map((a) => (
                      <tr key={a.id}>
                        <td>{dateShort(a.at)} · {time(a.at)}</td>
                        <td>{a.by}</td>
                        <td>{a.entity}: {a.entityName}<div className="fx-muted">{a.entityId}</div></td>
                        <td>{a.field}</td>
                        <td className="num">{a.from || '—'}</td>
                        <td className="num">{a.to || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <Empty title="Sin cambios registrados" desc="Aquí aparecen los cambios de precio, costo, IVA, cupo y plazo de crédito, con quién los hizo." />
            );
          })()}
        </section>
      ) : null}

      <section className="panel trz-panel" style={view !== 'moves' ? { display: 'none' } : undefined}>
        <div className="trz-toolbar">
          <div className="search-input trz-search">
            <Icon name="search" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar producto, pedido, lote, placa…"
            />
          </div>
          <Badge text={`${events.length} movimientos`} color="blue" />
        </div>

        <div className="trz-filters" role="group" aria-label="Tipo de movimiento">
          {TYPE_FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              className={type === f.id ? 'active' : ''}
              onClick={() => setType(f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>

        {events.length ? (
          <div className="timeline trz-timeline">
            {events.map((e) => {
              const isRoute = e.type === 'Despacho' || e.type === 'Entrega';
              return (
                <div className={`timeline-item trz-item trz-${e.type.toLowerCase()}`} key={e.id}>
                  <span className="timeline-icon">
                    <Icon name={eventIcon(e.type)} />
                  </span>
                  <div className="trz-body">
                    <strong>
                      {e.type} · {e.ref}
                    </strong>
                    <p>
                      {product(state, e.productId)?.name} · {e.qty} u.
                      <br />
                      {e.from} → {e.to}
                    </p>
                    <small>
                      {dateShort(e.at)} · {time(e.at)} · {e.by}
                      {e.batch ? ` · Lote ${e.batch}` : ''}
                    </small>
                    {isRoute && e.ref ? (
                      <div className="trz-actions">
                        <button
                          type="button"
                          className="trz-link"
                          onClick={() => navigate('/logistica/historial')}
                        >
                          Ver en rutas
                        </button>
                        <button
                          type="button"
                          className="trz-link"
                          onClick={() => navigate('/pedidos')}
                        >
                          Ir a pedidos
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <Empty title="Sin coincidencias" desc="Prueba otro término o cambia el filtro de tipo." />
        )}
      </section>
    </div>
  );
}
