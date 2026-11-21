import { useId, useState, type KeyboardEvent } from 'react';
import { Icon } from '../../shared/components/Icon';
import { dateShort, daysUntil, expiryTone, fefoCompare, isLotSellable, money, num } from '../../shared/lib/inventory';
import { childrenStatus, isRaw, parentsOf } from '../../shared/lib/bom';
import { faceLabel } from '../../shared/lib/warehouseLayout';
import type { AppState } from '../../shared/types';
import { inventoryStatusLabels, type InventoryRow } from './inventoryModel';
import '../../styles/inventory-detail.css';

type InventoryDetailPanelProps = {
  state: AppState;
  row: InventoryRow;
  onClose: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onReceive: () => void;
  onPurchase: () => void;
  onLocate: (loc?: string) => void;
  onTrace: () => void;
  onSelectRelated: (id: string) => void;
  onOpenPurchase?: (purchaseId: string) => void;
};

type DetailTab = 'locations' | 'lots' | 'entries';
const TABS: DetailTab[] = ['locations', 'lots', 'entries'];

function locationDescription(location: string) {
  const match = /^(.+)-(\d+)-(\d+)(?:-([DT]))?$/.exec(location);
  if (!match) return 'Ubicación en bodega';
  const [, rack, level, position, face] = match;
  return [
    `Rack ${rack}`,
    `nivel ${Number(level)}`,
    `posición ${Number(position)}`,
    faceLabel(face === 'D' || face === 'T' ? face : undefined),
  ].filter(Boolean).join(' · ');
}

function expiryLabel(expiry: string) {
  if (!expiry) return 'Sin vencimiento registrado';
  const date = new Date(expiry.length === 10 ? `${expiry}T12:00:00` : expiry);
  if (!Number.isFinite(date.getTime())) return 'Fecha no disponible';
  return date.toLocaleDateString('es-EC', {
    day: '2-digit', month: 'short', year: 'numeric', timeZone: 'America/Guayaquil',
  });
}

export function InventoryDetailPanel({
  state, row, onClose, onEdit, onDelete, onReceive, onPurchase, onLocate, onTrace, onSelectRelated, onOpenPurchase,
}: InventoryDetailPanelProps) {
  const [tab, setTab] = useState<DetailTab>('locations');
  const id = useId();
  const { product, stock, reserved, available, status, shortage } = row;
  const bomChildren = childrenStatus(state, product);
  const usedBy = isRaw(product) ? parentsOf(state, product.id) : [];
  const minimum = Math.max(0, product.min);
  const coverage = minimum > 0 ? Math.max(0, Math.min(100, available / minimum * 100)) : 0;
  const locationTotals = new Map<string, { qty: number; lots: number }>();
  for (const lot of row.lots) {
    const current = locationTotals.get(lot.loc) ?? { qty: 0, lots: 0 };
    locationTotals.set(lot.loc, { qty: current.qty + lot.qty, lots: current.lots + 1 });
  }
  const locations = [...locationTotals.entries()].sort(([a], [b]) => a.localeCompare(b, 'es', { numeric: true }));
  // Orden de salida FEFO: primero los vendibles (vence antes, entró antes); al final lo que no se puede vender.
  const sellableLots = row.lots.filter((lot) => isLotSellable(state, lot)).sort(fefoCompare);
  const blockedLots = row.lots.filter((lot) => !isLotSellable(state, lot)).sort(fefoCompare);
  const lots = [...sellableLots, ...blockedLots];
  const blockReason = (lot: (typeof row.lots)[number]) => {
    if (lot.onHold) return 'En inspección';
    if (lot.loc === 'CUARENTENA') return 'Cuarentena';
    if (lot.loc === 'TRANSITO') return 'En tránsito';
    const days = daysUntil(lot.expiry);
    if (days == null) return 'Sin fecha de caducidad';
    if (days < 0) return 'Vencido';
    return `Bajo vida útil mínima (${product.minShelfLifeDays ?? 0} días)`;
  };
  // Historial de entradas: cada recepción con su OC, proveedor, lote y cuánto queda hoy.
  const entries = state.receipts
    .filter((r) => r.productId === product.id)
    .map((r) => {
      const left = state.lots
        .filter((lot) => lot.productId === product.id && (lot.receiptId === r.id || (!lot.receiptId && lot.batch === r.batch)))
        .reduce((n, lot) => n + lot.qty, 0);
      return { receipt: r, left };
    });
  const today = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'America/Guayaquil',
  }).format(new Date());

  function navigateTabs(event: KeyboardEvent<HTMLButtonElement>) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const index = TABS.indexOf(tab);
    const nextIndex =
      event.key === 'Home' ? 0
        : event.key === 'End' ? TABS.length - 1
          : event.key === 'ArrowRight' ? (index + 1) % TABS.length
            : (index - 1 + TABS.length) % TABS.length;
    setTab(TABS[nextIndex]);
    const buttons = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    buttons?.[nextIndex]?.focus();
  }

  return (
    <aside className={`inv-detail inv-detail--${status}`} aria-labelledby={`${id}-title`}>
      <div className="inv-detail-heading">
        <span><Icon name="box" /> Detalle del producto</span>
        <button type="button" className="inv-detail-close" aria-label="Cerrar detalle del producto" onClick={onClose}>
          <Icon name="close" />
        </button>
      </div>

      <div className="inv-detail-product">
        <div className="inv-detail-product-meta">
          <span className="inv-detail-category">{product.category}</span>
          {isRaw(product) && <span className="inv-detail-category inv-detail-kind">Insumo</span>}
          <span className="inv-detail-status"><span aria-hidden="true" />{inventoryStatusLabels[status]}</span>
        </div>
        <h2 id={`${id}-title`}>{product.name}</h2>
        <div className="inv-detail-sku">SKU <strong>{product.sku || product.id}</strong></div>
        <p className="inv-detail-supplier"><Icon name="building" />{product.supplier || 'Sin proveedor registrado'}</p>
      </div>

      {bomChildren.length > 0 && (
        <section className="inv-detail-bom" aria-label="Estructura de insumos">
          <header>
            <strong>Insumos del producto</strong>
            <span>{bomChildren.length}</span>
          </header>
          <ul>
            {bomChildren.map((child) => (
              <li key={child.product.id}>
                <button type="button" onClick={() => onSelectRelated(child.product.id)}>
                  <span>
                    <strong>{child.product.name}</strong>
                    <small>{child.qtyPerUnit} uds. / unidad · alc. {num(child.buildable)}</small>
                  </span>
                  <em className={`inv-pill inv-pill-${child.status}`}>
                    {child.status === 'ok' ? 'OK' : child.status === 'low' ? 'Bajo' : 'Crítico'}
                  </em>
                </button>
                <div className="inv-detail-bom-meter"><span style={{ width: `${Math.max(4, child.coverage)}%` }} className={child.status} /></div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {usedBy.length > 0 && (
        <section className="inv-detail-bom inv-detail-parents" aria-label="Productos que usan este insumo">
          <header>
            <strong>Usado por</strong>
            <span>{usedBy.length}</span>
          </header>
          <ul>
            {usedBy.map((parent) => (
              <li key={parent.id}>
                <button type="button" onClick={() => onSelectRelated(parent.id)}>
                  <span>
                    <strong>{parent.name}</strong>
                    <small>{parent.id} · {parent.category}</small>
                  </span>
                  <Icon name="chevron" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="inv-detail-stock">
        <dl className="inv-detail-quantities">
          <div><dt>Físico</dt><dd>{num(stock)}</dd></div>
          <div><dt>Reservado</dt><dd>{num(reserved)}</dd></div>
          <div className="inv-detail-available"><dt>Disponible</dt><dd>{num(available)}</dd></div>
        </dl>
        <p className="inv-detail-formula">
          Disponible = físico vendible − reservado en pedidos.
          {row.unsellable > 0 ? <> <strong>{num(row.unsellable)} uds.</strong> no se pueden vender hoy (vencidas, en inspección o con poca vida útil).</> : null}
        </p>

        <div className="inv-detail-minimum">
          <div className="inv-detail-minimum-heading"><span>Mínimo operativo</span><strong>{num(minimum)} uds.</strong></div>
          {minimum > 0 && (
            <div
              className="inv-detail-meter"
              role="meter"
              aria-label="Disponible respecto al mínimo operativo"
              aria-valuemin={0}
              aria-valuemax={minimum}
              aria-valuenow={Math.max(0, Math.min(minimum, available))}
              aria-valuetext={`${num(available)} unidades disponibles; mínimo ${num(minimum)} unidades`}
            ><span style={{ width: `${coverage}%` }} /></div>
          )}
          <p className="inv-detail-coverage">
            <Icon name={status === 'healthy' ? 'check' : 'alert'} />
            <span>{shortage > 0
              ? <>Faltan <strong>{num(shortage)} uds.</strong> para alcanzar el mínimo.</>
              : available <= 0
                ? 'Sin unidades disponibles para nuevos pedidos.'
                : minimum > 0
                  ? available === minimum ? 'Disponible justo en el mínimo.' : <><strong>{num(available - minimum)} uds.</strong> por encima del mínimo.</>
                  : 'Sin mínimo de stock configurado.'}</span>
          </p>
        </div>
      </div>

      <div className="inv-detail-actions">
        <button type="button" className="inv-detail-action inv-detail-action-primary" onClick={onReceive}><Icon name="receive" />Recibir stock</button>
        {status !== 'healthy' && (
          <button type="button" className="inv-detail-action inv-detail-action-buy" onClick={onPurchase}>
            <Icon name="cart" />Solicitar compra
          </button>
        )}
        <button type="button" className="inv-detail-action" onClick={() => onLocate()} disabled={locations.length === 0}><Icon name="map" />Ver en bodega</button>
      </div>

      <div className="inv-detail-tabs" role="tablist" aria-label="Existencias del producto">
        <button type="button" id={`${id}-locations-tab`} role="tab" aria-selected={tab === 'locations'} aria-controls={`${id}-locations`} tabIndex={tab === 'locations' ? 0 : -1} onClick={() => setTab('locations')} onKeyDown={navigateTabs}>
          Ubicaciones <span>{locations.length}</span>
        </button>
        <button type="button" id={`${id}-lots-tab`} role="tab" aria-selected={tab === 'lots'} aria-controls={`${id}-lots`} tabIndex={tab === 'lots' ? 0 : -1} onClick={() => setTab('lots')} onKeyDown={navigateTabs}>
          Lotes <span>{lots.length}</span>
        </button>
        <button type="button" id={`${id}-entries-tab`} role="tab" aria-selected={tab === 'entries'} aria-controls={`${id}-entries`} tabIndex={tab === 'entries' ? 0 : -1} onClick={() => setTab('entries')} onKeyDown={navigateTabs}>
          Entradas <span>{entries.length}</span>
        </button>
      </div>

      <div id={`${id}-locations`} className="inv-detail-tab-content" role="tabpanel" aria-labelledby={`${id}-locations-tab`} hidden={tab !== 'locations'} tabIndex={0}>
        {locations.length > 0 ? (
          <>
            <p className="inv-detail-section-note">Stock físico en la bodega seleccionada.</p>
            <ul className="inv-detail-locations">
              {locations.map(([location, totals]) => (
                <li key={location}>
                  <button type="button" className="inv-detail-location" onClick={() => onLocate(location)} aria-label={`Ver ubicación ${location}, ${num(totals.qty)} unidades, en bodega`}>
                    <span className="inv-detail-location-icon"><Icon name="pin" /></span>
                    <span className="inv-detail-location-copy"><strong>{location}</strong><small>{locationDescription(location)}</small><small>{totals.lots} {totals.lots === 1 ? 'lote' : 'lotes'}</small></span>
                    <span className="inv-detail-location-qty"><strong>{num(totals.qty)}</strong><small>uds.</small></span>
                    <Icon name="chevron" />
                  </button>
                </li>
              ))}
            </ul>
          </>
        ) : <div className="inv-detail-empty"><Icon name="warehouse" /><strong>Aún no hay existencias</strong><p>Recibe stock para asignar una ubicación en esta bodega.</p></div>}
      </div>

      <div id={`${id}-lots`} className="inv-detail-tab-content" role="tabpanel" aria-labelledby={`${id}-lots-tab`} hidden={tab !== 'lots'} tabIndex={0}>
        {lots.length > 0 ? (
          <>
            <p className="inv-detail-section-note">
              En orden de salida: primero lo que vence antes (FEFO); a igual fecha, lo que entró antes.
            </p>
            <ul className="inv-detail-lots">
              {lots.map((lot) => {
                const sellable = isLotSellable(state, lot);
                const order = sellable ? sellableLots.indexOf(lot) + 1 : 0;
                const days = daysUntil(lot.expiry, today);
                const expired = days != null && days < 0;
                return (
                  <li key={lot.id} className="inv-detail-lot">
                    <div className="inv-detail-lot-heading">
                      <strong style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        {sellable ? <span className="fx-order-num" aria-label={`Sale en el puesto ${order}`}>{order}</span> : null}
                        {lot.batch || 'Sin lote registrado'}
                        {order === 1 ? <span className="fx-first">Sale 1º</span> : null}
                      </strong>
                      <span>{num(lot.qty)} uds.</span>
                    </div>
                    <div className={`inv-detail-expiry${expired ? ' inv-detail-expiry--expired' : ''}`}><Icon name={expired ? 'alert' : 'calendar'} /><span>{lot.expiry ? `${expired ? 'Vencido' : 'Vence'}: ` : ''}{expiryLabel(lot.expiry)}</span></div>
                    <div className="fx-exit-meta">
                      {days != null ? <span className={`fx-chip ${expiryTone(days)}`}>{expired ? `hace ${-days} días` : `${days} días`}</span> : null}
                      {!sellable ? <span className="fx-chip red">{blockReason(lot)}</span> : null}
                      {lot.purchaseId ? (
                        onOpenPurchase ? (
                          <button type="button" className="fx-link" onClick={() => onOpenPurchase(lot.purchaseId!)}>{lot.purchaseId}</button>
                        ) : <span>{lot.purchaseId}</span>
                      ) : null}
                      {lot.receivedAt ? <span>Ingresó {dateShort(lot.receivedAt)}</span> : null}
                    </div>
                    <button type="button" className="inv-detail-lot-location" onClick={() => onLocate(lot.loc)} aria-label={`Ver lote ${lot.batch || lot.id} en ubicación ${lot.loc}`}><Icon name="pin" />{lot.loc}<Icon name="arrow" /></button>
                  </li>
                );
              })}
            </ul>
          </>
        ) : <div className="inv-detail-empty"><Icon name="layers" /><strong>No hay lotes con stock</strong><p>Los lotes aparecerán al registrar una recepción en esta bodega.</p></div>}
      </div>

      <div id={`${id}-entries`} className="inv-detail-tab-content" role="tabpanel" aria-labelledby={`${id}-entries-tab`} hidden={tab !== 'entries'} tabIndex={0}>
        {entries.length > 0 ? (
          <>
            <p className="inv-detail-section-note">Cada ingreso con su orden de compra. «Queda» es lo que aún está en bodega de ese ingreso.</p>
            <div className="fx-table-wrap">
              <table className="fx-table">
                <thead>
                  <tr><th>Ingreso</th><th>Orden</th><th>Proveedor</th><th>Lote</th><th>Vence</th><th className="num">Recibido</th><th className="num">Queda</th></tr>
                </thead>
                <tbody>
                  {entries.map(({ receipt, left }) => (
                    <tr key={receipt.id}>
                      <td>{dateShort(receipt.receivedAt ?? receipt.date)}<div className="fx-muted">{receipt.id}</div></td>
                      <td>
                        {receipt.purchaseId ? (
                          onOpenPurchase ? <button type="button" className="fx-link" onClick={() => onOpenPurchase(receipt.purchaseId!)}>{receipt.purchaseId}</button> : receipt.purchaseId
                        ) : <span className="fx-chip">{receipt.reason ?? 'Sin orden'}</span>}
                      </td>
                      <td>{receipt.supplier || '—'}</td>
                      <td>{receipt.batch}</td>
                      <td>{receipt.expiry ? dateShort(receipt.expiry) : '—'}</td>
                      <td className="num">{num(receipt.qty)}</td>
                      <td className="num">{num(left)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : <div className="inv-detail-empty"><Icon name="receive" /><strong>Sin entradas registradas</strong><p>Las recepciones de este producto aparecerán aquí con su orden de compra.</p></div>}
      </div>

      <dl className="inv-detail-values">
        <div><dt>Precio unitario</dt><dd>{money(product.price)}</dd></div>
        <div><dt>Costo promedio</dt><dd>{product.avgCost ? money(product.avgCost) : 'Sin costo'}</dd></div>
        <div><dt>Valor a costo</dt><dd>{money(row.stockValue)}</dd></div>
      </dl>
      <div className="inv-detail-footer">
        {onEdit ? <button type="button" onClick={onEdit}><Icon name="edit" />Editar ficha</button> : null}
        {onDelete ? <button type="button" onClick={onDelete}><Icon name="trash" />Eliminar</button> : null}
        <button type="button" onClick={onTrace}><Icon name="history" />Trazabilidad</button>
      </div>
    </aside>
  );
}
