import { useNavigate } from 'react-router-dom';
import type { AppState, Location, Lot } from '../../shared/types';
import { product } from '../../shared/lib/inventory';
import { faceLabel } from '../../shared/lib/warehouseLayout';
import { Modal } from '../../shared/components/Modal';
import { Btn } from '../../shared/components/ui';
import { Icon } from '../../shared/components/Icon';

type Props = {
  state: AppState;
  location: Location;
  lots: Lot[];
  canStock: boolean;
  onMoveLot: (lotId: string) => void;
  onClose: () => void;
};

/** Detalle de una ubicación: dirección, capacidad, lotes y acciones. */
export function LocationDetailModal({ state, location, lots, canStock, onMoveLot, onClose }: Props) {
  const navigate = useNavigate();
  const used = lots.reduce((sum, lot) => sum + lot.qty, 0);
  const free = Math.max(0, location.capacity - used);
  const ratio = Math.min(100, (used / Math.max(location.capacity, 1)) * 100);
  const status = used === 0 ? 'free' : used >= location.capacity ? 'full' : 'partial';
  const statusLabel = { free: 'Libre', partial: 'Con stock', full: 'Llena' }[status];
  const mainProduct = lots[0] ? product(state, lots[0].productId) : null;

  return (
    <Modal
      title={`Ubicación ${location.id}`}
      subtitle={mainProduct ? mainProduct.name : 'Sin producto asignado'}
      onClose={onClose}
      footer={
        <div className="loc-detail-footer">
          <Btn onClick={onClose}>Cerrar</Btn>
          <div>
            {mainProduct ? (
              <Btn icon="history" onClick={() => navigate('/trazabilidad', { state: { q: mainProduct.id } })}>
                Trazabilidad
              </Btn>
            ) : null}
            {canStock ? (
              <Btn
                variant="primary"
                icon="plus"
                disabled={used >= location.capacity}
                onClick={() => navigate('/recepcion/nueva', { state: { loc: location.id, productId: mainProduct?.id } })}
              >
                {mainProduct ? 'Añadir stock' : 'Asignar producto'}
              </Btn>
            ) : null}
          </div>
        </div>
      }
    >
      <div className="loc-detail">
        <div className={`loc-detail-hero is-${status}`}>
          <div className="loc-detail-address">
            <span>Rack<strong>{location.rack}</strong></span>
            <span>Nivel<strong>{String(location.level).padStart(2, '0')}</strong></span>
            <span>Casilla<strong>{String(location.pos).padStart(2, '0')}</strong></span>
            {location.face ? <span>Cara<strong>{faceLabel(location.face)}</strong></span> : null}
          </div>
          <span className={`loc-status-pill is-${status}`}>{statusLabel}</span>
        </div>

        <div className="loc-detail-capacity">
          <div className="loc-detail-capacity-head">
            <span>Capacidad utilizada</span>
            <strong>{used} / {location.capacity} u.</strong>
          </div>
          <div className={`loc-capacity-track is-${status}`}><span style={{ width: `${ratio}%` }} /></div>
          <small>{free} unidades de espacio disponible</small>
        </div>

        <div className="loc-detail-lots">
          <h3><Icon name="layers" /> Lotes en la ubicación <span>{lots.length}</span></h3>
          {lots.length ? (
            <ul>
              {lots.map((lot) => {
                const item = product(state, lot.productId);
                return (
                  <li key={lot.id}>
                    <div>
                      <strong>{lot.batch}</strong>
                      <small>{item?.name ?? lot.productId}</small>
                    </div>
                    <div className="loc-lot-meta">
                      <span>{lot.qty} u.</span>
                      <small>Vence {lot.expiry}</small>
                    </div>
                    {canStock ? (
                      <Btn variant="small" icon="swap" onClick={() => onMoveLot(lot.id)}>Reubicar</Btn>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="loc-detail-empty">Esta ubicación está libre. Registra una recepción para asignarle un producto.</p>
          )}
        </div>
      </div>
    </Modal>
  );
}
