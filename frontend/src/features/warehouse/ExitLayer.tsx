import { useMemo, useState } from 'react';
import type { AppState } from '../../shared/types';
import { daysUntil, exitOrder, expiryTone, isLotSellable, product, scopedLots } from '../../shared/lib/inventory';
import { Icon } from '../../shared/components/Icon';

type Cell = {
  loc: string;
  productId: string;
  name: string;
  qty: number;
  expiry: string;
  days: number | null;
  first: boolean;
  blocked: string;
};

const LIMITS = [
  { id: 60, label: '≤ 60 días' },
  { id: 120, label: '≤ 120 días' },
  { id: 0, label: 'Todo' },
] as const;

/**
 * Capa "Próximo a salir": casillas ordenadas por vencimiento, con la marca del lote
 * que sale primero de cada producto. Lo vencido o retenido aparece aparte.
 */
export function ExitLayer({ state, onLocate }: { state: AppState; onLocate: (loc: string) => void }) {
  const [limit, setLimit] = useState<(typeof LIMITS)[number]['id']>(120);
  const cells = useMemo(() => {
    const firstLot = new Map<string, string>();
    for (const id of new Set(scopedLots(state).map((l) => l.productId))) {
      const first = exitOrder(state, id)[0];
      if (first) firstLot.set(id, first.id);
    }
    const list: Cell[] = scopedLots(state)
      .filter((lot) => lot.qty > 0 && lot.loc !== 'TRANSITO')
      .map((lot) => {
        const days = daysUntil(lot.expiry);
        const sellable = isLotSellable(state, lot);
        return {
          loc: lot.loc,
          productId: lot.productId,
          name: product(state, lot.productId)?.name ?? lot.productId,
          qty: lot.qty,
          expiry: lot.expiry,
          days,
          first: firstLot.get(lot.productId) === lot.id,
          blocked: sellable
            ? ''
            : lot.onHold
              ? 'En inspección'
              : lot.loc === 'CUARENTENA'
                ? 'Cuarentena'
                : days != null && days < 0
                  ? 'Vencido'
                  : 'Poca vida útil',
        };
      });
    return list.sort((a, b) => (a.days ?? 99999) - (b.days ?? 99999) || a.loc.localeCompare(b.loc));
  }, [state]);

  const visible = cells.filter((c) => c.blocked || !limit || (c.days != null && c.days <= limit));
  const blocked = visible.filter((c) => c.blocked);
  const ready = visible.filter((c) => !c.blocked);

  return (
    <section className="panel fx-exit-layer" aria-labelledby="exit-layer-title">
      <div className="panel-head" style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <span className="panel-title" id="exit-layer-title">
          <Icon name="calendar" /> Próximo a salir
        </span>
        <div className="segmented" role="group" aria-label="Horizonte de vencimiento">
          {LIMITS.map((item) => (
            <button key={item.id} type="button" aria-pressed={limit === item.id} className={limit === item.id ? 'active' : ''} onClick={() => setLimit(item.id)}>
              {item.label}
            </button>
          ))}
        </div>
      </div>
      <p className="fx-muted" style={{ margin: 0 }}>
        Casillas ordenadas por vencimiento. «Sale 1º» marca el lote que el picking toma primero de cada producto. Toca una casilla para verla en el mapa.
      </p>
      {ready.length ? (
        <div className="fx-exit-grid">
          {ready.map((c) => (
            <button key={`${c.loc}-${c.productId}-${c.expiry}`} type="button" className={`fx-exit-cell ${expiryTone(c.days)}`} onClick={() => onLocate(c.loc)} title={`${c.name} · vence ${c.expiry}`}>
              <b>{c.loc}</b>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
              <span>
                {c.qty} u. · {c.days} d
              </span>
              {c.first ? <span className="fx-first">Sale 1º</span> : null}
            </button>
          ))}
        </div>
      ) : (
        <p className="fx-muted">Nada vence en ese horizonte.</p>
      )}
      {blocked.length ? (
        <>
          <strong>No vendible ({blocked.length})</strong>
          <div className="fx-exit-grid">
            {blocked.map((c) => (
              <button key={`b-${c.loc}-${c.productId}-${c.expiry}`} type="button" className="fx-exit-cell red" onClick={() => onLocate(c.loc)}>
                <b>{c.loc}</b>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
                <span>{c.qty} u. · {c.blocked}</span>
              </button>
            ))}
          </div>
        </>
      ) : null}
      <div className="fx-legend">
        <span><span className="fx-chip red">■</span> menos de 60 días o no vendible</span>
        <span><span className="fx-chip amber">■</span> 60 a 120 días</span>
        <span><span className="fx-chip green">■</span> más de 120 días</span>
      </div>
    </section>
  );
}
