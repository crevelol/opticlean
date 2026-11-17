import { Btn } from '../../shared/components/ui';
import { Icon } from '../../shared/components/Icon';
import { num } from '../../shared/lib/inventory';
import { HeatLegend, RackHeatmap } from './RackHeatmap';
import { CAPACITY_WARN, pct, type WarehouseRow } from './warehouseRows';

type Props = { row: WarehouseRow; canSwitch: boolean; onOpenMap: () => void; onDetails: () => void; onSwitch: () => void };

export function ActiveWarehouseHero({ row, canSwitch, onOpenMap, onDetails, onSwitch }: Props) {
  const { warehouse: w, summary, units, occupied, capacityPct, racks } = row;
  const layout = summary.layout;
  return <section className="whx-hero" aria-labelledby="whx-hero-title">
    <div className="whx-hero-main">
      <span className="whx-hero-tag"><span className="whx-dot" />Bodega en uso · recepciones y despachos</span>
      <div><span className="whx-code">{w.code}</span><h2 id="whx-hero-title">{w.name}</h2></div>
      <p className="whx-addr"><Icon name="pin" /><span>{[w.city, w.address].filter(Boolean).join(' · ') || 'Ubicación pendiente de completar'}</span></p>
      <div className="whx-stats">
        <div><strong className={capacityPct >= CAPACITY_WARN ? 'is-hot' : ''}>{pct(capacityPct)}<small>%</small></strong><span>capacidad usada</span></div>
        <div><strong>{num(units)}<small> u.</small></strong><span>de {num(summary.capacityUnits)} posibles</span></div>
        <div><strong>{num(occupied)}<small>/{num(summary.totalCells)}</small></strong><span>casillas ocupadas</span></div>
      </div>
      <div className="whx-actions">
        <Btn variant="primary" icon="map" onClick={onOpenMap}>Abrir mapa de bodega</Btn>
        <Btn icon="info" onClick={onDetails}>Detalles</Btn>
        {canSwitch ? <Btn variant="ghost" icon="swap" onClick={onSwitch}>Cambiar bodega</Btn> : null}
      </div>
    </div>
    <div className="whx-hero-plan">
      <div className="whx-plan-head"><span>Racks · {layout.rackCount} × {layout.levels} niveles{layout.depthFaces === 2 ? ' · doble prof.' : ''}</span><HeatLegend /></div>
      <RackHeatmap racks={racks} layout={layout} />
    </div>
  </section>;
}
