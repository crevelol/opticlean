import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Select } from '../../shared/components/Select';
import { api } from '../../shared/api/client';
import { Modal } from '../../shared/components/Modal';
import { Btn, Button } from '../../shared/components/ui';
import { useAppState } from '../../shared/hooks/AppStateProvider';
import { ensureShippingTemplates } from '../../shared/lib/businessRules';
import type { Truck, VehicleKind } from './fleet';
import { VehicleCostRulesModal } from './VehicleCostRulesModal';
import {
  citiesOf,
  formatZonePath,
  provinces,
  sectorsOf as catalogSectors,
  zonePathOf,
} from '../../shared/lib/zones';
import { ChipGroup, RemovableChip } from '../../shared/components/Chip';
import { Input } from '../../shared/components/Input';

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
  shipping_template_id?: string;
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
  shippingTemplateId: '',
  allowedSectors: [] as string[],
};

function vehicleSectors(v: VehicleRow) {
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
  const shippingTpl = useMemo(() => ensureShippingTemplates(state?.settings), [state?.settings]);
  const [vehicles, setVehicles] = useState<VehicleRow[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [sectorDraft, setSectorDraft] = useState('');
  const [zoneProvince, setZoneProvince] = useState('');
  const [zoneCity, setZoneCity] = useState('');
  const [zoneSector, setZoneSector] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [costVehicleId, setCostVehicleId] = useState<string | null>(null);

  const knownSectors = useMemo(() => {
    const set = new Set<string>();
    for (const c of state?.clients ?? []) {
      const path = zonePathOf(c);
      if (path && path !== 'Sin zona') set.add(path);
      if (c.sector?.trim()) set.add(c.sector.trim());
      if (c.city?.trim()) set.add(c.city.trim());
    }
    return [...set].sort((a, b) => a.localeCompare(b, 'es'));
  }, [state?.clients]);

  const zonePreview = formatZonePath([zoneProvince, zoneCity, zoneSector]);
  const provinceOptions = provinces();
  const cityOptions = zoneProvince ? citiesOf(zoneProvince) : [];
  const sectorOptions =
    zoneProvince && zoneCity ? catalogSectors(zoneProvince, zoneCity) : [];

  const addZonePath = (raw: string) => {
    const path = raw.trim();
    if (!path) return;
    setForm((prev) => ({
      ...prev,
      allowedSectors: addSector(path, prev.allowedSectors),
    }));
  };

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
        shippingTemplateId: form.shippingTemplateId || null,
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

  if (costVehicleId) {
    return (
      <VehicleCostRulesModal
        vehicleId={costVehicleId}
        onClose={() => setCostVehicleId(null)}
        onFleetChange={(trucks) => {
          onFleetChange(trucks);
          void load();
        }}
      />
    );
  }

  return (
    <Modal
      wide
      title="Configurar flota"
      subtitle="Tipo, capacidad, sectores y costo real (combustible, llantas, peaje…)."
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
              <Input
                value={form.plate}
                onChange={(e) => setForm({ ...form, plate: e.target.value })}
                placeholder="GBA-2041"
                required
              />
            </label>
            <label>
              Nombre
              <Input
                value={form.label}
                onChange={(e) => setForm({ ...form, label: e.target.value })}
                placeholder="Camión 01"
                required
              />
            </label>
            <label>
              Ciudad
              <Input
                value={form.city}
                onChange={(e) => setForm({ ...form, city: e.target.value })}
                placeholder="Quito"
              />
            </label>
            <label>
              Conductor
              <Input
                value={form.driver}
                onChange={(e) => setForm({ ...form, driver: e.target.value })}
              />
            </label>
            <label>
              Capacidad kg
              <Input
                type="number"
                value={form.maxKg}
                onChange={(e) => setForm({ ...form, maxKg: Number(e.target.value) })}
              />
            </label>
            <label>
              Capacidad m³
              <Input
                type="number"
                step="0.1"
                value={form.maxM3}
                onChange={(e) => setForm({ ...form, maxM3: Number(e.target.value) })}
              />
            </label>
            <label>
              Costo / km
              <Input
                type="number"
                step="0.01"
                value={form.costPerKm}
                onChange={(e) => setForm({ ...form, costPerKm: Number(e.target.value) })}
              />
            </label>
            <label>
              Plantilla costo de envío
              <Select
                value={form.shippingTemplateId || shippingTpl.defaultId}
                onChange={(e) => setForm({ ...form, shippingTemplateId: e.target.value })}
              >
                {shippingTpl.templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                    {t.id === shippingTpl.defaultId ? ' (default)' : ''}
                  </option>
                ))}
              </Select>
            </label>
          </div>

          <div className="fleet-sectors">
            <strong>Zonas permitidas</strong>
            <p className="muted">
              Jerarquía flexible: solo provincia, o provincia/ciudad, o hasta sector/barrio. Vacío =
              puede ir a cualquier zona. «Pichincha / Quito» cubre todos los sectores de Quito.
            </p>
            <div className="fleet-sector-chips">
              {form.allowedSectors.map((s) => (
                <RemovableChip
                  key={s}
                  onRemove={() =>
                    setForm({ ...form, allowedSectors: form.allowedSectors.filter((x) => x !== s) })
                  }
                >
                  {s}
                </RemovableChip>
              ))}
            </div>
            <div className="fleet-zone-builder">
              <Select
                value={zoneProvince}
                onChange={(e) => {
                  setZoneProvince(e.target.value);
                  setZoneCity('');
                  setZoneSector('');
                }}
              >
                <option value="">Provincia (opcional)</option>
                {provinceOptions.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </Select>
              <Select
                value={zoneCity}
                disabled={!zoneProvince}
                onChange={(e) => {
                  setZoneCity(e.target.value);
                  setZoneSector('');
                }}
              >
                <option value="">Ciudad (opcional)</option>
                {cityOptions.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
              <Select
                value={zoneSector}
                disabled={!zoneCity}
                onChange={(e) => setZoneSector(e.target.value)}
              >
                <option value="">Sector / barrio (opcional)</option>
                {sectorOptions.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
              <Button size="small" disabled={!zonePreview} onClick={() => {
                  addZonePath(zonePreview);
                  setZoneSector('');
                }}>
                Agregar zona
              </Button>
            </div>
            {zonePreview ? (
              <p className="muted">Se agregará: <strong>{zonePreview}</strong></p>
            ) : null}
            <div className="fleet-sector-add">
              <Input
                value={sectorDraft}
                onChange={(e) => setSectorDraft(e.target.value)}
                placeholder="O escribe libre: Pichincha / Quito / Carcelén"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addZonePath(sectorDraft);
                    setSectorDraft('');
                  }
                }}
              />
              <Button size="small" onClick={() => {
                  addZonePath(sectorDraft);
                  setSectorDraft('');
                }}>
                Agregar
              </Button>
            </div>
            {knownSectors.length ? (
              <ChipGroup
                type="multiple"
                label="Sectores conocidos"
                className="fleet-sector-chips"
                value={knownSectors.filter((s) => form.allowedSectors.some((x) => x.toLowerCase() === s.toLowerCase()))}
                onValueChange={(next) => {
                  const current = knownSectors.filter((s) =>
                    form.allowedSectors.some((x) => x.toLowerCase() === s.toLowerCase()),
                  );
                  const removed = current.filter((s) => !next.includes(s));
                  let list = form.allowedSectors.filter(
                    (x) => !removed.some((r) => r.toLowerCase() === x.toLowerCase()),
                  );
                  for (const s of next.filter((s) => !current.includes(s))) list = addSector(s, list);
                  setForm({ ...form, allowedSectors: list });
                }}
                items={knownSectors.map((s) => ({ value: s, label: s }))}
              />
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
                  <th>Zonas</th>
                  <th>Estado</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {vehicles.map((v) => {
                  const sectors = vehicleSectors(v);
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
                              <RemovableChip
                                key={s}
                                disabled={busy}
                                onRemove={() => void patch(v.id, { allowedSectors: sectors.filter((x) => x !== s) })}
                              >
                                {s}
                              </RemovableChip>
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
                        <Button size="small" disabled={busy || !v.active} onClick={() => setCostVehicleId(v.id)}>
                          Costo real
                        </Button>
                        <Button size="small" disabled={busy} onClick={() => void patch(v.id, { active: !v.active })}>
                          {v.active ? 'Desactivar' : 'Activar'}
                        </Button>
                        <Button variant="danger" size="small" disabled={busy} onClick={() => void remove(v)}>
                          Eliminar
                        </Button>
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
