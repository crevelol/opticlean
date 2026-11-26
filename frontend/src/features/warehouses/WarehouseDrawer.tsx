import { useEffect, useRef, useState } from 'react';
import { Btn } from '../../shared/components/ui';
import { Icon } from '../../shared/components/Icon';
import { DialogContent, DialogRoot, DialogTitle } from '../../shared/components/Dialog';
import { num } from '../../shared/lib/inventory';
import { RackDetail, RackHeatmap } from './RackHeatmap';
import { StatusPills } from './WarehouseList';
import { CAPACITY_WARN, pct, type WarehouseRow } from './warehouseRows';
import '../../styles/warehouses-list.css';
import { Tooltip } from '../../shared/components/Tooltip';
import { IconButton } from '../../shared/components/IconButton';

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

export function WarehouseDrawer({ row, activeRow, confirm, pending, error, onConfirm, onUse, onDelete, onEdit, onOpenMap, onClose }: Props) {
  const { warehouse: w, summary, units, occupied, capacityPct, racks } = row;
  const layout = summary.layout;
  const isActive = activeRow?.warehouse.id === w.id;
  const [rackId, setRackId] = useState(racks[0]?.id ?? 'A');
  const rack = racks.find((r) => r.id === rackId) ?? racks[0];
  const closeBtn = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLDivElement>(null);
  const hasStock = units > 0;
  const canDelete = !isActive && !hasStock;

  // Al cerrar, devuelve el foco a la fila de la bodega (si sigue en pantalla).
  const restoreFocus = (event: Event) => {
    const rowEl = document.querySelector<HTMLElement>(`[data-wh-row="${CSS.escape(w.id)}"]`);
    if (rowEl) {
      event.preventDefault();
      rowEl.focus();
    }
  };
  useEffect(() => { if (confirm) confirmRef.current?.focus(); }, [confirm]);

  // Escape: primero cierra la confirmación abierta; si no hay, cierra el drawer.
  const onEscape = (event: Event) => {
    if (pending) return event.preventDefault();
    if (confirm) {
      event.preventDefault();
      onConfirm(null);
    }
  };

  return <DialogRoot onClose={onClose}>
    <DialogContent
      overlayClassName="whx-drawer-root"
      className="whx-drawer"
      motionPreset="sheet"
      side="right"
      noDescription
      aria-busy={pending}
      onOpenAutoFocus={(event) => { event.preventDefault(); closeBtn.current?.focus(); }}
      onCloseAutoFocus={restoreFocus}
      onEscapeKeyDown={onEscape}
      onPointerDownOutside={(event) => { if (pending) event.preventDefault(); }}
    >
      <header className="whx-d-head">
        <div className="whx-d-head-top">
          <div><span className="whx-code">{w.code}</span><DialogTitle asChild><h2>{w.name}</h2></DialogTitle></div>
          <IconButton icon="close" label="Cerrar detalles" ref={closeBtn} onClick={onClose} disabled={pending} />
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
          : <Tooltip content={w.status === 'Inactiva' ? 'Cambia su estado a Operativa en Editar para usarla' : undefined}><Btn variant="primary" icon="swap" disabled={pending || w.status === 'Inactiva' || confirm === 'use'} onClick={() => onConfirm('use')}>Usar esta bodega</Btn></Tooltip>}
        <Btn icon="edit" disabled={pending} onClick={() => onEdit()}>Editar</Btn>
        <Btn icon="grid" variant="ghost" disabled={pending} onClick={() => onEdit('layout')}>Distribución</Btn>
        {!isActive ? <Tooltip content={canDelete ? undefined : 'Revisa los requisitos de «Para eliminarla»'}><Btn variant="danger" icon="trash" disabled={pending || !canDelete || confirm === 'delete'} onClick={() => onConfirm('delete')}>Eliminar</Btn></Tooltip> : null}
      </footer>
    </DialogContent>
  </DialogRoot>;
}
