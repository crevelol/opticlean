import { useState } from 'react';
import { useAppState } from '../../shared/hooks/AppStateProvider';
import { api } from '../../shared/api/client';
import { Badge, Btn } from '../../shared/components/ui';
import { Icon } from '../../shared/components/Icon';
import { Modal, ModalActions } from '../../shared/components/Modal';
import type { Vehicle } from '../../shared/types';
import { Switch } from '../../shared/components/Checkbox';

export function FleetPanel() {
  const { state, applyResponse, toast } = useAppState();
  const [editing, setEditing] = useState<Vehicle | 'new' | null>(null);
  const [error, setError] = useState('');

  if (!state) return null;
  const vehicles = state.vehicles ?? [];
  const current = editing && editing !== 'new' ? editing : null;
  const onRoute = (plate: string) =>
    state.orders.filter((o) => o.vehicle === plate && ['En ruta', 'Incidencia'].includes(o.status)).length;

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    const data = Object.fromEntries(new FormData(e.currentTarget));
    try {
      applyResponse(
        await api.saveVehicle({
          id: current?.id,
          plate: String(data.plate),
          label: String(data.label),
          city: String(data.city),
          driver: String(data.driver),
          maxKg: Number(data.maxKg),
          maxM3: Number(data.maxM3),
          costPerKm: Number(data.costPerKm),
          active: data.active === 'on',
        }),
      );
      toast(current ? 'Vehículo actualizado.' : 'Vehículo registrado.');
      setEditing(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    }
  };

  const remove = async (v: Vehicle) => {
    if (!window.confirm(`¿Eliminar ${v.label} (${v.plate}) de la flota?`)) return;
    try {
      applyResponse(await api.deleteVehicle(v.id));
      toast('Vehículo eliminado.');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'No se pudo eliminar.');
    }
  };

  return (
    <section className="panel" style={{ marginTop: 18 }}>
      <div className="panel-head">
        <span className="panel-title">
          <Icon name="truck" />
          Flota de distribución
        </span>
        <Btn variant="small" icon="plus" onClick={() => { setError(''); setEditing('new'); }}>
          Agregar vehículo
        </Btn>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Vehículo</th>
              <th>Ciudad</th>
              <th>Conductor</th>
              <th>Capacidad</th>
              <th>Costo/km</th>
              <th>Estado</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {vehicles.map((v) => (
              <tr key={v.id}>
                <td>
                  <strong>{v.label}</strong>
                  <span className="sub">{v.plate}</span>
                </td>
                <td>{v.city}</td>
                <td>{v.driver}</td>
                <td>
                  {v.maxKg.toLocaleString('es-EC')} kg · {v.maxM3} m³
                </td>
                <td>${v.costPerKm.toFixed(2)}</td>
                <td>
                  <Badge text={v.active ? `Activo${onRoute(v.plate) ? ` · ${onRoute(v.plate)} en ruta` : ''}` : 'Inactivo'} color={v.active ? 'green' : ''} />
                </td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <Btn variant="small" icon="settings" onClick={() => { setError(''); setEditing(v); }}>
                    Editar
                  </Btn>{' '}
                  <Btn variant="small" icon="trash" disabled={onRoute(v.plate) > 0} onClick={() => void remove(v)}>
                    Eliminar
                  </Btn>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing ? (
        <Modal
          title={current ? `Editar ${current.label}` : 'Nuevo vehículo'}
          subtitle="La capacidad se valida al confirmar cada despacho."
          onClose={() => setEditing(null)}
          footer={<ModalActions onCancel={() => setEditing(null)} submitLabel="Guardar" formId="vehicle-form" icon="save" />}
        >
          <form id="vehicle-form" key={current?.id ?? 'new'} onSubmit={(e) => void submit(e)}>
            <div className="form-grid">
              <div className="field">
                <label htmlFor="veh-label">Nombre</label>
                <input id="veh-label" name="label" defaultValue={current?.label ?? `Camión ${String(vehicles.length + 1).padStart(2, '0')}`} required />
              </div>
              <div className="field">
                <label htmlFor="veh-plate">Placa</label>
                <input id="veh-plate" name="plate" defaultValue={current?.plate} placeholder="ABC-1234" required />
              </div>
              <div className="field">
                <label htmlFor="veh-city">Ciudad base</label>
                <input id="veh-city" name="city" defaultValue={current?.city ?? 'Quito'} required />
              </div>
              <div className="field">
                <label htmlFor="veh-driver">Conductor</label>
                <input id="veh-driver" name="driver" defaultValue={current?.driver} required />
              </div>
              <div className="field">
                <label htmlFor="veh-kg">Capacidad (kg)</label>
                <input id="veh-kg" name="maxKg" type="number" min={1} step="1" defaultValue={current?.maxKg ?? 3000} required />
              </div>
              <div className="field">
                <label htmlFor="veh-m3">Capacidad (m³)</label>
                <input id="veh-m3" name="maxM3" type="number" min={0.1} step="0.1" defaultValue={current?.maxM3 ?? 12} required />
              </div>
              <div className="field">
                <label htmlFor="veh-cost">Costo por km (USD)</label>
                <input id="veh-cost" name="costPerKm" type="number" min={0.01} step="0.01" defaultValue={current?.costPerKm ?? 0.8} required />
              </div>
              <div className="field">
                <label htmlFor="veh-active">
                  <Switch id="veh-active" name="active" defaultChecked={current?.active ?? true} /> Disponible para despacho
                </label>
              </div>
            </div>
            {error ? <div className="form-error visible">{error}</div> : null}
          </form>
        </Modal>
      ) : null}
    </section>
  );
}
