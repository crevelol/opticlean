import type { KeyboardEvent } from 'react';
import { Btn } from '../../shared/components/ui';
import { Icon } from '../../shared/components/Icon';
import { num } from '../../shared/lib/inventory';
import { RackBars } from './RackHeatmap';
import { CAPACITY_WARN, pct, type WarehouseRow } from './warehouseRows';

export function StatusPills({ row, isActive }: { row: WarehouseRow; isActive: boolean }) {
  const { warehouse: w, alerts } = row;
  return <>
    {isActive ? <span className="whx-pill is-use">En uso</span> : w.status === 'Operativa' ? <span className="whx-pill is-ok">Operativa</span> : <span className="whx-pill is-off">Inactiva</span>}
    {alerts.map((alert) => <span key={alert} className="whx-pill is-warn"><Icon name="alert" />{alert}</span>)}
  </>;
}

type Props = {
  rows: WarehouseRow[];
  active: string;
  openId: string | null;
  savedId: string;
  pending: string | null;
  onOpen: (id: string) => void;
  onUse: (id: string) => void;
  onOpenMap: () => void;
};

export function WarehouseList({ rows, active, openId, savedId, pending, onOpen, onUse, onOpenMap }: Props) {
  const onKey = (event: KeyboardEvent<HTMLDivElement>, id: string) => {
    if (event.target !== event.currentTarget) return;
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onOpen(id); }
  };
  return <div className="whx-list" role="table" aria-label="Bodegas">
    <div className="whx-list-head" role="row"><span role="columnheader">Bodega</span><span role="columnheader">Por rack</span><span role="columnheader">Capacidad usada</span><span role="columnheader">Tamaño</span><span role="columnheader" className="is-end">Acciones</span></div>
    {rows.map((row) => {
      const { warehouse: w, summary, units, capacityPct, racks } = row;
      const isActive = w.id === active;
      const inactive = w.status === 'Inactiva';
      return <div key={w.id} role="row" tabIndex={0} data-wh-row={w.id} aria-label={`Ver detalles de ${w.name}`}
        className={`whx-row ${inactive ? 'is-inactive' : ''} ${openId === w.id ? 'is-open' : ''} ${savedId === w.id ? 'just-saved' : ''}`}
        onClick={() => onOpen(w.id)} onKeyDown={(e) => onKey(e, w.id)}>
        <div className="whx-who" role="cell">
          <div className="whx-who-top"><span className="whx-code">{w.code}</span><StatusPills row={row} isActive={isActive} /></div>
          <strong>{w.name}</strong>
          <small>{w.city || 'Ciudad sin especificar'}</small>
          {savedId === w.id ? <span className="whx-saved" role="status"><Icon name="check" /> Bodega guardada</span> : null}
        </div>
        <div role="cell"><RackBars racks={racks} warn={CAPACITY_WARN} /></div>
        <div className="whx-cap" role="cell">
          <div className="whx-cap-top"><strong>{pct(capacityPct)}%</strong><span>{num(units)} / {num(summary.capacityUnits)} u.</span></div>
          <div className="whx-meter"><i className={capacityPct >= CAPACITY_WARN ? 'is-hot' : ''} style={{ width: `${Math.min(100, pct(capacityPct))}%` }} /></div>
        </div>
        <div className="whx-size" role="cell"><strong>{num(summary.totalCells)}</strong> casillas{summary.layout.depthFaces === 2 ? <small>doble prof.</small> : null}</div>
        <div className="whx-row-actions" role="cell" onClick={(e) => e.stopPropagation()}>
          {isActive
            ? <Btn variant="primary" size="small" icon="map" onClick={onOpenMap}>Mapa</Btn>
            : <Btn size="small" disabled={inactive || !!pending} title={inactive ? 'Actívala desde Editar para poder usarla' : undefined} onClick={() => onUse(w.id)}>Usar</Btn>}
          <Btn variant="ghost" size="small" onClick={() => onOpen(w.id)}>Detalles</Btn>
        </div>
      </div>;
    })}
  </div>;
}
