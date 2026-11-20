import type { AppState } from '../../shared/types';
import { dateShort, daysUntil, expiryTone, product } from '../../shared/lib/inventory';
import { Modal } from '../../shared/components/Modal';
import { Btn } from '../../shared/components/ui';

export type PickLine = { id: string; loc: string; batch: string; qty: number; productId: string; expiry?: string; purchaseId?: string };

type Props = {
  state: AppState;
  orderId: string;
  plan: PickLine[];
  checked: Set<string>;
  onToggle: (line: PickLine, checked: boolean) => void;
  onLocate: (loc: string) => void;
  onConfirm: () => void;
  onClose: () => void;
};

/** Lista de verificación de picking (FEFO) para un pedido. */
export function PickingModal({ state, orderId, plan, checked, onToggle, onLocate, onConfirm, onClose }: Props) {
  const done = plan.filter((line) => checked.has(line.id)).length;
  const ratio = plan.length ? (done / plan.length) * 100 : 0;
  const complete = plan.length > 0 && done === plan.length;

  return (
    <Modal
      title={`Preparar pedido ${orderId}`}
      subtitle="Verifica cada posición en orden de recorrido. Toma exactamente el lote indicado: es el que vence primero."
      onClose={onClose}
      footer={
        <div className="loc-detail-footer">
          <Btn onClick={onClose}>Seguir después</Btn>
          <Btn variant="primary" icon="check" disabled={!complete} onClick={onConfirm}>
            Confirmar preparación
          </Btn>
        </div>
      }
    >
      <div className="pick-modal">
        <div className="pick-modal-progress">
          <div>
            <strong>{done} de {plan.length}</strong>
            <span>posiciones verificadas</span>
          </div>
          <div className="loc-capacity-track is-partial"><span style={{ width: `${ratio}%` }} /></div>
        </div>
        {plan.length ? (
          <ol className="pick-modal-list">
            {plan.map((line, index) => {
              const isChecked = checked.has(line.id);
              return (
                <li key={line.id} className={isChecked ? 'is-checked' : ''}>
                  <label>
                    <input type="checkbox" checked={isChecked} onChange={(event) => onToggle(line, event.target.checked)} />
                    <span className="pick-modal-number">{index + 1}</span>
                    <span className="pick-modal-text">
                      <strong>{product(state, line.productId)?.name ?? line.productId}</strong>
                      <small>
                        Lote {line.batch} · {line.qty} u.
                        {line.expiry ? (
                          <>
                            {' · '}
                            <span className={`fx-chip ${expiryTone(daysUntil(line.expiry))}`}>
                              Vence {dateShort(line.expiry)} · {daysUntil(line.expiry)} días
                            </span>
                          </>
                        ) : null}
                      </small>
                    </span>
                  </label>
                  <button type="button" className="pick-modal-loc" onClick={() => onLocate(line.loc)} title="Ver en el mapa">
                    {line.loc}
                  </button>
                </li>
              );
            })}
          </ol>
        ) : (
          <p className="loc-detail-empty">Calculando el plan de picking…</p>
        )}
      </div>
    </Modal>
  );
}
