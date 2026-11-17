import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { Btn } from '../../shared/components/ui';
import { Icon } from '../../shared/components/Icon';
import { num } from '../../shared/lib/inventory';
import { RackDetail, RackHeatmap } from './RackHeatmap';
import { StatusPills } from './WarehouseList';
import { CAPACITY_WARN, pct, type WarehouseRow } from './warehouseRows';
import '../../styles/warehouses-list.css';

export type DrawerConfirm = 'use' | 'delete' | null;

type Props = {
  row: WarehouseRow;
  activeRow?: WarehouseRow;
  confirm: DrawerConfirm;
  pending: boolean;
  error: string;
  onConfirm: (mode: DrawerConfirm) => void;
  onUse: () => void;
  onDelete: () => void;
  onEdit: (step?: 'layout') => void;
  onOpenMap: () => void;
  onClose: () => void;
};

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function WarehouseDrawer({ row, activeRow, confirm, pending, error, onConfirm, onUse, onDelete, onEdit, onOpenMap, onClose }: Props) {
  const { warehouse: w, summary, units, occupied, capacityPct, racks } = row;
  const layout = summary.layout;
  const isActive = activeRow?.warehouse.id === w.id;
  const [rackId, setRackId] = useState(racks[0]?.id ?? 'A');
  const rack = racks.find((r) => r.id === rackId) ?? racks[0];
  const panel = useRef<HTMLElement>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLDivElement>(null);
  const hasStock = units > 0;
  const canDelete = !isActive && !hasStock;

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    closeBtn.current?.focus();
    const body = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = body;
      const rowEl = document.querySelector<HTMLElement>(`[data-wh-row="${CSS.escape(w.id)}"]`);
      (rowEl ?? previous)?.focus?.();
    };
  }, [w.id]);
  useEffect(() => { if (confirm) confirmRef.current?.focus(); }, [confirm]);

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      if (confirm) onConfirm(null); else onClose();
      return;
    }
    if (event.key !== 'Tab' || !panel.current) return;
    const items = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  };

  return createPortal(<div className="whx-drawer-root" onKeyDown={onKeyDown}>
    <div className="whx-scrim" onClick={() => !pending && onClose()} />
    <aside ref={panel} className="whx-drawer" role="dialog" aria-modal="true" aria-labelledby="whx-drawer-title" aria-busy={pending}>
      <header className="whx-d-head">
        <div className="whx-d-head-top">
          <div><span className="whx-code">{w.code}</span><h2 id="whx-drawer-title">{w.name}</h2></div>
          <button ref={closeBtn} type="button" className="icon-btn" aria-label="Cerrar detalles" onClick={onClose} disabled={pending}><Icon name="close" /></button>
        </div>
        <div className="whx-who-top"><StatusPills row={row} isActive={isActive} /></div>
      </header>

      <div className="whx-d-body">
        {error ? <div className="wh-error" role="alert">{error}</div> : null}

        {confirm === 'use' ? <div ref={confirmRef} tabIndex={-1} className="whx-confirm" role="alertdialog" aria-labelledby="whx-cf-use">
          <strong id="whx-cf-use">¿Operar desde {w.code}?</strong>
          <ul>
            <li>Las recepciones nuevas entrarán a {w.name}.</li>
            <li>El mapa y el inventario mostrarán sus {num(units)} u.</li>
            {activeRow ? <li>{activeRow.warehouse.code} no cambia; puedes volver a usarla cuando quieras.</li> : null}
          </ul>
          <div className="whx-actions">
            <Btn variant="primary" disabled={pending} onClick={onUse}>{pending ? 'Cambiando…' : 'Sí, usar esta bodega'}</Btn>
            <Btn disabled={pending} onClick={() => onConfirm(null)}>Cancelar</Btn>
          </div>
        </div> : null}

        {confirm === 'delete' ? <div ref={confirmRef} tabIndex={-1} className="whx-confirm is-danger" role="alertdialog" aria-labelledby="whx-cf-del">
          <strong id="whx-cf-del">Eliminar {w.code} de forma permanente</strong>
          <span>Se borran su diseño de racks y sus notas. Esta acción no se puede deshacer.</span>
          <div className="whx-actions">
            <Btn variant="danger" icon="trash" disabled={pending} onClick={onDelete}>{pending ? 'Eliminando…' : 'Eliminar bodega'}</Btn>
            <Btn disabled={pending} onClick={() => onConfirm(null)}>Cancelar</Btn>
          </div>
        </div> : null}

        <section className="whx-d-sec">
          <h3>Ubicación</h3>
          <dl className="whx-kv">
            <dt>Ciudad</dt><dd>{w.city || 'Sin especificar'}</dd>
            <dt>Dirección</dt><dd>{w.address || <span className="whx-missing">Sin especificar · complétala en Editar</span>}</dd>
            {w.notes ? <><dt>Notas</dt><dd>{w.notes}</dd></> : null}
          </dl>
        </section>

        <section className="whx-d-sec">
          <h3>Capacidad · {pct(capacityPct)}% usada</h3>
          <div className="whx-meter"><i className={capacityPct >= CAPACITY_WARN ? 'is-hot' : ''} style={{ width: `${Math.min(100, pct(capacityPct))}%` }} /></div>
          <p className="whx-muted">{num(units)} de {num(summary.capacityUnits)} u. · {num(occupied)} de {num(summary.totalCells)} casillas con existencias · {layout.capacityPerCell} u. por casilla</p>
        </section>

        <section className="whx-d-sec">
          <h3>Racks · elige uno para ver sus casillas</h3>
          <RackHeatmap racks={racks} layout={layout} selected={rack?.id} onSelect={setRackId} />
          {rack ? <RackDetail rack={rack} layout={layout} /> : null}
        </section>

        {!isActive ? <section className="whx-d-sec">
          <h3>Para eliminarla</h3>
          <ul className="whx-checks">
            <li className="is-ok"><Icon name="check" />No es la bodega en uso</li>
            <li className={hasStock ? 'is-no' : 'is-ok'}><Icon name={hasStock ? 'close' : 'check'} />{hasStock ? `Tiene ${num(units)} u.; trasládalas antes` : 'No tiene existencias'}</li>
          </ul>
        </section> : null}
      </div>

      <footer className="whx-d-foot">
        {isActive
          ? <Btn variant="primary" icon="map" onClick={onOpenMap}>Abrir mapa</Btn>
          : <Btn variant="primary" icon="swap" disabled={pending || w.status === 'Inactiva' || confirm === 'use'} title={w.status === 'Inactiva' ? 'Cambia su estado a Operativa en Editar para usarla' : undefined} onClick={() => onConfirm('use')}>Usar esta bodega</Btn>}
        <Btn icon="edit" disabled={pending} onClick={() => onEdit()}>Editar</Btn>
        <Btn icon="grid" variant="ghost" disabled={pending} onClick={() => onEdit('layout')}>Distribución</Btn>
        {!isActive ? <Btn variant="danger" icon="trash" disabled={pending || !canDelete || confirm === 'delete'} title={canDelete ? undefined : 'Revisa los requisitos de «Para eliminarla»'} onClick={() => onConfirm('delete')}>Eliminar</Btn> : null}
      </footer>
    </aside>
  </div>, document.body);
}
