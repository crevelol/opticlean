import type { WarehouseLayout } from '../../shared/types';
import { pct, type RackFill } from './warehouseRows';
import { Tooltip } from '../../shared/components/Tooltip';

const heat = (qty: number, cap: number) => (qty <= 0 ? 0 : Math.min(5, 1 + Math.floor((qty / cap) * 4.999)));

export function HeatLegend() {
  return <span className="whx-legend" aria-hidden="true">Vacío<i data-h="0" /><i data-h="1" /><i data-h="3" /><i data-h="5" />Lleno</span>;
}

/** Vista compacta de racks: cada casilla coloreada según las unidades que guarda. */
export function RackHeatmap({ racks, layout, selected, onSelect }: { racks: RackFill[]; layout: WarehouseLayout; selected?: string; onSelect?: (id: string) => void }) {
  const cols = layout.positionsPerLevel * layout.depthFaces;
  return <div className="whx-floor">{racks.map((rack) => {
    const cells = [...rack.cells].sort((a, b) => b.level - a.level || (a.face === 'T' ? 1 : 0) - (b.face === 'T' ? 1 : 0) || a.pos - b.pos);
    const body = <>
      <span className="whx-rack-name">{rack.id}<span>{pct(rack.pct)}%</span></span>
      <span className="whx-cells" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>{cells.map((cell) => <span key={cell.id} className="whx-cell" data-h={heat(cell.qty, layout.capacityPerCell)} />)}</span>
    </>;
    return onSelect
      ? <button key={rack.id} type="button" className={`whx-rack ${selected === rack.id ? 'is-selected' : ''}`} aria-pressed={selected === rack.id} aria-label={`Rack ${rack.id}, ${pct(rack.pct)}% de capacidad`} onClick={() => onSelect(rack.id)}>{body}</button>
      : <div key={rack.id} className="whx-rack" role="img" aria-label={`Rack ${rack.id}, ${pct(rack.pct)}% de capacidad`}>{body}</div>;
  })}</div>;
}

/** Detalle de un rack: filas por nivel (el más alto arriba) y una casilla por posición. */
export function RackDetail({ rack, layout }: { rack: RackFill; layout: WarehouseLayout }) {
  const levels = Array.from({ length: layout.levels }, (_, i) => layout.levels - i);
  const cols = layout.positionsPerLevel * layout.depthFaces;
  return <div className="whx-rack-detail">
    <div className="whx-plan-head"><span>Rack {rack.id}{layout.depthFaces === 2 ? ' · caras D | T' : ''}</span><HeatLegend /></div>
    <div className="whx-rd-grid">{levels.map((level) => <div key={level} className="whx-rd-row">
      <span>N{String(level).padStart(2, '0')}</span>
      <div className="whx-rd-cells" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
        {rack.cells.filter((c) => c.level === level).sort((a, b) => (a.face === 'T' ? 1 : 0) - (b.face === 'T' ? 1 : 0) || a.pos - b.pos).map((cell) => <Tooltip key={cell.id} content={`${cell.id}: ${cell.qty} / ${layout.capacityPerCell} u.`}><span className="whx-cell" data-h={heat(cell.qty, layout.capacityPerCell)} /></Tooltip>)}
      </div>
    </div>)}</div>
  </div>;
}

/** Una barra vertical por rack, para comparar de un vistazo. */
export function RackBars({ racks, warn }: { racks: RackFill[]; warn: number }) {
  return <div className="whx-bars" role="img" aria-label={racks.map((r) => `Rack ${r.id} ${pct(r.pct)}%`).join(', ')}>
    {racks.map((rack) => <Tooltip key={rack.id} content={`Rack ${rack.id}: ${pct(rack.pct)}%`}><span><i className={rack.pct >= warn ? 'is-hot' : ''} style={{ height: `${rack.pct > 0 ? Math.max(6, pct(rack.pct)) : 0}%` }} /></span></Tooltip>)}
  </div>;
}
