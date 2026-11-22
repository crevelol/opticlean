import { useEffect, useMemo, useState } from 'react';
import { Select } from '../../shared/components/Select';
import type { AppState, Location, WarehouseLayout } from '../../shared/types';
import { scopedLots } from '../../shared/lib/inventory';
import { WarehouseFloorPlan, type RackStats } from './WarehouseFloorPlan';
import { Tooltip } from '../../shared/components/Tooltip';
import { ChipGroup } from '../../shared/components/Chip';
import { IconButton } from '../../shared/components/IconButton';

type Props = {
  state: AppState;
  layout: WarehouseLayout;
  locations: Location[];
  selectedLoc: string;
  level: string;
  query: string;
  matches: Location[];
  pickLocs: Set<string>;
  onSelect: (id: string) => void;
  onSelectRack: (id: string) => void;
  onOpenDetail: (id: string) => void;
};
type Availability = 'all' | 'free' | 'occupied' | 'full';

export function WarehousePositioning({ state, layout, locations, selectedLoc, level, query, matches, pickLocs, onSelect, onSelectRack, onOpenDetail }: Props) {
  const [availability, setAvailability] = useState<Availability>('all');
  const selected = locations.find((location) => location.id === selectedLoc) ?? locations[0];
  const [levelPage, setLevelPage] = useState(selected?.level ?? 1);
  const lots = useMemo(() => scopedLots(state).filter((lot) => lot.qty > 0), [state]);
  const quantities = useMemo(() => {
    const result = new Map<string, number>();
    lots.forEach((lot) => result.set(lot.loc, (result.get(lot.loc) ?? 0) + lot.qty));
    return result;
  }, [lots]);

  // El paginador sigue a la ubicación seleccionada (búsqueda, picking, mapa…).
  const selectedLevel = selected?.level;
  useEffect(() => {
    if (selectedLevel) setLevelPage(selectedLevel);
  }, [selectedLevel, selected?.id]);

  if (!selected) return null;

  const products = new Map(state.products.map((item) => [item.id, item]));
  const firstProducts = new Map(lots.map((lot) => [lot.loc, products.get(lot.productId)]));
  const stats: RackStats = {};
  locations.forEach((location) => {
    const rack = stats[location.rack] ?? { occupied: 0, total: 0, units: 0 };
    const quantity = quantities.get(location.id) ?? 0;
    rack.total++; rack.units += quantity;
    if (quantity > 0) rack.occupied++;
    stats[location.rack] = rack;
  });
  const rackIds = Object.keys(stats);
  const rackLocations = locations.filter((location) => location.rack === selected.rack);
  const matching = new Set(matches.map((location) => location.id));
  const withinSearch = (location: Location) => !query || matching.has(location.id);
  const matchesAvailability = (location: Location, filter: Availability) => {
    const quantity = quantities.get(location.id) ?? 0;
    return filter === 'all' || (filter === 'free' ? quantity === 0 : filter === 'occupied' ? quantity > 0 : quantity >= location.capacity);
  };
  const isVisible = (location: Location, filter: Availability = availability) => withinSearch(location) && matchesAvailability(location, filter);

  const levelNumbers = Array.from({ length: layout.levels }, (_, index) => index + 1);
  const shownLevel = level !== 'all' ? Number(level) : Math.min(Math.max(levelPage, 1), layout.levels);
  const levelLocations = rackLocations.filter((location) => location.level === shownLevel);
  const visibleOnLevel = levelLocations.filter((location) => isVisible(location));
  const faces = layout.depthFaces === 2 ? ['D', 'T'] as const : [undefined];
  const filters: { id: Availability; label: string }[] = [
    { id: 'all', label: 'Todas' },
    { id: 'free', label: 'Libres' },
    { id: 'occupied', label: 'Con stock' },
    { id: 'full', label: 'Llenas' },
  ];

  const goToLevel = (value: number) => {
    if (value < 1 || value > layout.levels) return;
    setLevelPage(value);
    const onLevel = rackLocations.filter((location) => location.level === value);
    const next = onLevel.find((location) => isVisible(location)) ?? onLevel[0];
    if (next) onSelect(next.id);
  };

  const levelStats = (value: number) => {
    const onLevel = rackLocations.filter((location) => location.level === value);
    return { total: onLevel.length, occupied: onLevel.filter((location) => (quantities.get(location.id) ?? 0) > 0).length, hits: onLevel.filter((location) => isVisible(location)).length };
  };
  const current = levelStats(shownLevel);

  return <div className="positioning-workspace">
    <div className="positioning-floor">
      <WarehouseFloorPlan layout={layout} selectedRack={selected.rack} stats={stats} matchingRacks={query ? new Set(matches.map((location) => location.rack)) : undefined} onSelectRack={(id) => { setAvailability('all'); onSelectRack(id); }} />
    </div>
    <div className="positioning-rack">
      <div className="positioning-rack-heading">
        <div>
          <div className="eyebrow">Explorador de ubicaciones</div>
          <h3>Rack {selected.rack}</h3>
          <p>{stats[selected.rack].occupied} de {rackLocations.length} ocupadas · {stats[selected.rack].units.toLocaleString('es-EC')} unidades</p>
        </div>
        <Select className="positioning-rack-select" aria-label="Explorar rack" value={selected.rack} onChange={(event) => { setAvailability('all'); onSelectRack(event.target.value); }}>
          {rackIds.map((id) => <option key={id} value={id}>Rack {id}</option>)}
        </Select>
      </div>

      <ChipGroup
        type="single"
        label="Filtrar ubicaciones por disponibilidad"
        className="positioning-filters"
        value={availability}
        onValueChange={(id) => {
          setAvailability(id);
          const next =
            levelLocations.find((location) => isVisible(location, id)) ??
            rackLocations.find((location) => isVisible(location, id));
          if (next && !(next.id === selectedLoc)) {
            const stillOk = rackLocations.some((location) => location.id === selectedLoc && isVisible(location, id));
            if (!stillOk) onSelect(next.id);
          }
        }}
        items={filters.map((filter) => ({
          value: filter.id,
          label: filter.label,
          count: rackLocations.filter((location) => isVisible(location, filter.id)).length,
          tone: filter.id === 'free' ? 'success' : filter.id === 'occupied' ? 'info' : filter.id === 'full' ? 'warning' : undefined,
        }))}
      />

      <div className="level-pager" role="navigation" aria-label="Niveles del rack">
        <IconButton icon="chevron-left" label="Nivel anterior" className="level-pager-arrow" disabled={level !== 'all' || shownLevel <= 1} onClick={() => goToLevel(shownLevel - 1)} />
        <div className="level-pager-pages">
          {levelNumbers.map((value) => {
            const info = levelStats(value);
            const active = value === shownLevel;
            return <Tooltip key={value} content={`Nivel ${value}: ${info.occupied}/${info.total} ocupadas`}><button
              type="button"
              aria-current={active ? 'page' : undefined}
              disabled={level !== 'all' && !active}
              className={`${active ? 'active' : ''}${query && info.hits ? ' has-hits' : ''}`}
              onClick={() => goToLevel(value)}
            >
              N{value}
            </button></Tooltip>;
          })}
        </div>
        <IconButton icon="chevron" label="Nivel siguiente" className="level-pager-arrow" disabled={level !== 'all' || shownLevel >= layout.levels} onClick={() => goToLevel(shownLevel + 1)} />
      </div>

      <section className="positioning-level" aria-label={`Nivel ${shownLevel}`}>
        <div className="positioning-level-title">
          <strong>Nivel {shownLevel}</strong>
          <span>{current.occupied}/{current.total} ocupadas{layout.depthFaces === 2 ? ' · 2 caras' : ''}</span>
        </div>
        {!visibleOnLevel.length ? <p className="positioning-empty" role="status">No hay ubicaciones con estos filtros en el nivel {shownLevel}. Prueba otro nivel o cambia el filtro.</p> : null}
        <div className="positioning-grid-scroll">
          <div style={{ minWidth: Math.max(250, layout.positionsPerLevel * 77) }}>
            {faces.map((face) => <div key={face ?? 'single'}>
              {face ? <span className="positioning-face-label">{face === 'D' ? 'Cara delantera' : 'Cara trasera'}</span> : null}
              <div className="positioning-cells" style={{ gridTemplateColumns: `repeat(${layout.positionsPerLevel}, minmax(70px, 1fr))` }}>
                {levelLocations.filter((location) => location.face === face).map((location) => {
                  const quantity = quantities.get(location.id) ?? 0;
                  const item = firstProducts.get(location.id);
                  const dimmed = !isVisible(location);
                  const stateClass = quantity === 0 ? 'is-free' : quantity >= location.capacity ? 'is-full' : 'is-stock';
                  return <Tooltip key={location.id} content={`${location.id} · ${item?.name ?? 'Disponible'} · ${quantity}/${location.capacity} u.`}><button
                    type="button"
                    className={`position-cell ${stateClass} ${location.id === selectedLoc ? 'is-selected' : ''} ${dimmed ? 'is-dimmed' : ''} ${pickLocs.has(location.id) ? 'is-picking' : ''}`}
                    aria-pressed={location.id === selectedLoc}
                    aria-label={`${location.id}, ${quantity === 0 ? 'libre' : `${quantity} de ${location.capacity} unidades`}${item ? `, ${item.name}` : ''}. Doble clic para ver detalle.`}
                    onClick={() => onSelect(location.id)}
                    onDoubleClick={() => onOpenDetail(location.id)}
                  >
                    <span className="cell-number">{String(location.pos).padStart(2, '0')}{face ? ` · ${face}` : ''}</span>
                    <span className="cell-quantity">{quantity ? `${quantity} u.` : 'Libre'}</span>
                    <span className="cell-product">{item?.name ?? `${location.capacity} u. disp.`}</span>
                  </button></Tooltip>;
                })}
              </div>
            </div>)}
          </div>
        </div>
      </section>

      <div className="positioning-rack-footer">
        <div className="positioning-legend">
          <span><i className="free" />Libre</span>
          <span><i className="stock" />Con stock</span>
          <span><i className="full" />Llena</span>
          <span><i className="selected" />Seleccionada</span>
        </div>
        <span>Doble clic en una casilla para ver el detalle</span>
      </div>
    </div>
  </div>;
}
