import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Select } from '../../shared/components/Select';
import { api } from '../../shared/api/client';
import { Modal } from '../../shared/components/Modal';
import { Btn } from '../../shared/components/ui';
import { useAppState } from '../../shared/hooks/AppStateProvider';
import type { Truck, VehicleKind } from './fleet';

type VehicleRow = {
  id: string;
  plate: string;
  label: string;
  vehicle_type: VehicleKind;
  city: string;
  driver: string;
  max_kg: number;
  max_m3: number;
  cost_per_km: number;
  eta_hours: number;
  route_km: number;
  allowed_sectors?: string;
  allowed_sectors_list?: string[];
  active: number;
};

const KIND_DEFAULTS: Record<
  VehicleKind,
  { maxKg: number; maxM3: number; costPerKm: number; etaHours: number; routeKm: number }
> = {
  motocicleta: { maxKg: 80, maxM3: 0.3, costPerKm: 0.35, etaHours: 1.5, routeKm: 25 },
  carro: { maxKg: 800, maxM3: 2.5, costPerKm: 0.55, etaHours: 2.5, routeKm: 40 },
  camion: { maxKg: 3500, maxM3: 14, costPerKm: 0.8, etaHours: 3.5, routeKm: 50 },
};

const emptyForm = {
  plate: '',
  label: '',
  vehicleType: 'camion' as VehicleKind,
  city: '',
  driver: '',
  maxKg: 3500,
  maxM3: 14,
  costPerKm: 0.8,
  etaHours: 3.5,
  routeKm: 50,
  allowedSectors: [] as string[],
};

function sectorsOf(v: VehicleRow) {
  if (v.allowed_sectors_list?.length) return v.allowed_sectors_list;
  if (!v.allowed_sectors) return [];
  try {
    const parsed = JSON.parse(v.allowed_sectors) as unknown;
    return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [];
  } catch {
    return [];
  }
}

export function FleetConfigModal({
  onClose,
  onFleetChange,
}: {
  onClose: () => void;
  onFleetChange: (trucks: Truck[]) => void;
}) {
  const { state } = useAppState();
  const [vehicles, setVehicles] = useState<VehicleRow[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [sectorDraft, setSectorDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  const knownSectors = useMemo(() => {
    const set = new Set<string>();
    for (const c of state?.clients ?? []) {
      if (c.sector?.trim()) set.add(c.sector.trim());
    }
    return [...set].sort((a, b) => a.localeCompare(b, 'es'));
  }, [state?.clients]);

  const load = async () => {
    const res = await api.fleetManage();
    setVehicles(res.vehicles as VehicleRow[]);
  };

  useEffect(() => {
    void load().catch((e) => setError(e instanceof Error ? e.message : 'Error'));
  }, []);

  const applyTrucks = (trucks: Truck[]) => {
    if (trucks.length) onFleetChange(trucks);
  };

  const addSector = (raw: string, current: string[]) => {
    const s = raw.trim();
    if (!s) return current;
    if (current.some((x) => x.toLowerCase() === s.toLowerCase())) return current;
    return [...current, s];
  };

  const create = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.plate.trim() || !form.label.trim() || busy) return;
    setBusy(true);
    setError('');
    setMsg('');
    try {
      const res = await api.createFleetVehicle({
        plate: form.plate.trim(),
        label: form.label.trim(),
        vehicleType: form.vehicleType,
        city: form.city.trim() || undefined,
        driver: form.driver.trim() || undefined,
        maxKg: Number(form.maxKg),
        maxM3: Number(form.maxM3),
        costPerKm: Number(form.costPerKm),
        etaHours: Number(form.etaHours),
        routeKm: Number(form.routeKm),
        allowedSectors: form.allowedSectors,
      });
      setForm(emptyForm);
      setSectorDraft('');
      await load();
      applyTrucks(res.trucks as Truck[]);
      setMsg('Vehículo agregado a la flota.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear');
    } finally {
      setBusy(false);
    }
  };

  const setType = (vehicleType: VehicleKind) => {
    const d = KIND_DEFAULTS[vehicleType];
    setForm({
      ...form,
      vehicleType,
      maxKg: d.maxKg,
      maxM3: d.maxM3,
      costPerKm: d.costPerKm,
      etaHours: d.etaHours,
      routeKm: d.routeKm,
    });
  };

  const patch = async (
    id: string,
    body: Parameters<typeof api.updateFleetVehicle>[1],
  ) => {
    setBusy(true);
    setError('');
    try {
      const res = await api.updateFleetVehicle(id, body);
      await load();
      applyTrucks(res.trucks as Truck[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo actualizar');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (v: VehicleRow) => {
    if (!window.confirm(`¿Eliminar ${v.label} (${v.plate})?`)) return;
    setBusy(true);
    setError('');
    try {
      const res = await api.deleteFleetVehicle(v.id);
      await load();
      applyTrucks(res.trucks as Truck[]);
      setMsg('Vehículo eliminado.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo eliminar');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      wide
      title="Configurar flota"
      subtitle="Tipo, capacidad y sectores permitidos. Sin sectores = sin restricción de zona."
      onClose={onClose}
      footer={<Btn onClick={onClose}>Cerrar</Btn>}
    >
      <div className="fleet-config">
        {msg ? <p className="fleet-config-ok">{msg}</p> : null}
        {error ? <p className="fleet-config-err">{error}</p> : null}

        <form className="fleet-config-form" onSubmit={(e) => void create(e)}>
          <h4>Nuevo vehículo</h4>
          <div className="fleet-config-grid">
            <label>
              Tipo
              <Select
                value={form.vehicleType}
                onChange={(e) => setType(e.target.value as VehicleKind)}
              >
                <option value="camion">Camión</option>
                <option value="carro">Carro</option>
                <option value="motocicleta">Motocicleta</option>
              </Select>
            </label>
            <label>
              Placa
              <input
                value={form.plate}
                onChange={(e) => setForm({ ...form, plate: e.target.value })}
                placeholder="GBA-2041"
                required
              />
            </label>
            <label>
              Nombre
              <input
                value={form.label}
                onChange={(e) => setForm({ ...form, label: e.target.value })}
                placeholder="Camión 01"
                required
              />
            </label>
            <label>
              Ciudad
              <input
                value={form.city}
                onChange={(e) => setForm({ ...form, city: e.target.value })}
                placeholder="Quito"
              />
            </label>
            <label>
              Conductor
              <input
                value={form.driver}
                onChange={(e) => setForm({ ...form, driver: e.target.value })}
              />
            </label>
            <label>
              Capacidad kg
              <input
                type="number"
                value={form.maxKg}
                onChange={(e) => setForm({ ...form, maxKg: Number(e.target.value) })}
              />
            </label>
            <label>
              Capacidad m³
              <input
                type="number"
                step="0.1"
                value={form.maxM3}
                onChange={(e) => setForm({ ...form, maxM3: Number(e.target.value) })}
              />
            </label>
            <label>
              Costo / km
              <input
                type="number"
                step="0.01"
                value={form.costPerKm}
                onChange={(e) => setForm({ ...form, costPerKm: Number(e.target.value) })}
              />
            </label>
          </div>

          <div className="fleet-sectors">
            <strong>Sectores permitidos</strong>
            <p className="muted">Vacío = puede ir a cualquier sector. Con lista = solo esos.</p>
            <div className="fleet-sector-chips">
              {form.allowedSectors.map((s) => (
                <button
                  key={s}
                  type="button"
                  className="fleet-chip is-on"
                  onClick={() =>
                    setForm({
                      ...form,
                      allowedSectors: form.allowedSectors.filter((x) => x !== s),
                    })
                  }
                >
                  {s} ×
                </button>
              ))}
            </div>
            <div className="fleet-sector-add">
              <input
                value={sectorDraft}
                onChange={(e) => setSectorDraft(e.target.value)}
                placeholder="Escribe un sector y Enter"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    setForm({
                      ...form,
                      allowedSectors: addSector(sectorDraft, form.allowedSectors),
                    });
                    setSectorDraft('');
                  }
                }}
              />
              <button
                type="button"
                onClick={() => {
                  setForm({
                    ...form,
                    allowedSectors: addSector(sectorDraft, form.allowedSectors),
                  });
                  setSectorDraft('');
                }}
              >
                Agregar
              </button>
            </div>
            {knownSectors.length ? (
              <div className="fleet-sector-chips">
                {knownSectors.map((s) => {
                  const on = form.allowedSectors.some((x) => x.toLowerCase() === s.toLowerCase());
                  return (
                    <button
                      key={s}
                      type="button"
                      className={`fleet-chip ${on ? 'is-on' : ''}`}
                      onClick={() =>
                        setForm({
                          ...form,
                          allowedSectors: on
                            ? form.allowedSectors.filter((x) => x.toLowerCase() !== s.toLowerCase())
                            : addSector(s, form.allowedSectors),
                        })
                      }
                    >
                      {s}
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>

          <Btn type="submit" variant="primary" disabled={busy}>
            {busy ? 'Guardando…' : 'Agregar vehículo'}
          </Btn>
        </form>

        <div className="fleet-config-list">
          <h4>Flota actual ({vehicles.filter((v) => v.active).length} activos)</h4>
          {vehicles.length === 0 ? (
            <p className="muted">Sin vehículos. Agrega el primero arriba.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Placa</th>
                  <th>Nombre</th>
                  <th>Tipo</th>
                  <th>Sectores</th>
                  <th>Estado</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {vehicles.map((v) => {
                  const sectors = sectorsOf(v);
                  return (
                    <tr key={v.id} className={v.active ? '' : 'is-off'}>
                      <td>
                        <strong>{v.plate}</strong>
                      </td>
                      <td>{v.label}</td>
                      <td>
                        <Select
                          value={v.vehicle_type || 'camion'}
                          disabled={busy}
                          onChange={(e) =>
                            void patch(v.id, {
                              vehicleType: e.target.value as VehicleKind,
                            })
                          }
                        >
                          <option value="camion">Camión</option>
                          <option value="carro">Carro</option>
                          <option value="motocicleta">Motocicleta</option>
                        </Select>
                      </td>
                      <td>
                        <div className="fleet-sector-chips">
                          {sectors.length ? (
                            sectors.map((s) => (
                              <button
                                key={s}
                                type="button"
                                className="fleet-chip is-on"
                                disabled={busy}
                                onClick={() =>
                                  void patch(v.id, {
                                    allowedSectors: sectors.filter((x) => x !== s),
                                  })
                                }
                              >
                                {s} ×
                              </button>
                            ))
                          ) : (
                            <em className="muted">Sin restricción</em>
                          )}
                        </div>
                        {knownSectors.length ? (
                          <Select
                            disabled={busy}
                            defaultValue=""
                            onChange={(e) => {
                              const s = e.target.value;
                              e.target.value = '';
                              if (!s) return;
                              void patch(v.id, {
                                allowedSectors: addSector(s, sectors),
                              });
                            }}
                          >
                            <option value="">+ sector…</option>
                            {knownSectors.map((s) => (
                              <option key={s} value={s}>
                                {s}
                              </option>
                            ))}
                          </Select>
                        ) : null}
                      </td>
                      <td>{v.active ? 'Activo' : 'Inactivo'}</td>
                      <td className="fleet-config-actions">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void patch(v.id, { active: !v.active })}
                        >
                          {v.active ? 'Desactivar' : 'Activar'}
                        </button>
                        <button type="button" disabled={busy} onClick={() => void remove(v)}>
                          Eliminar
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </Modal>
  );
}
