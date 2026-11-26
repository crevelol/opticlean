import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Select } from '../../shared/components/Select';
import { api } from '../../shared/api/client';
import { Btn, Button } from '../../shared/components/ui';
import { Icon } from '../../shared/components/Icon';
import { useAppState } from '../../shared/hooks/AppStateProvider';
import { ensureShippingTemplates } from '../../shared/lib/businessRules';
import type { Truck, VehicleKind } from './fleet';
import { vehicleIconName, vehicleKindLabel } from './fleet';
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
import { SearchInput } from '../../shared/components/SearchInput';

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
  odometer_km?: number;
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
  city: 'Quito',
  driver: '',
  maxKg: 3500,
  maxM3: 14,
  costPerKm: 0.8,
  etaHours: 3.5,
  routeKm: 50,
  shippingTemplateId: '',
  allowedSectors: [] as string[],
  allSectors: true,
  active: true,
};

function rowSectors(v: VehicleRow) {
  if (v.allowed_sectors_list?.length) return v.allowed_sectors_list;
  if (!v.allowed_sectors) return [];
  try {
    const parsed = JSON.parse(v.allowed_sectors) as unknown;
    return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function addSector(raw: string, current: string[]) {
  const s = raw.trim();
  if (!s) return current;
  if (current.some((x) => x.toLowerCase() === s.toLowerCase())) return current;
  return [...current, s];
}

export function FleetManagePanel({ onFleetChange }: { onFleetChange: (trucks: Truck[]) => void }) {
  const { state } = useAppState();
  const shippingTpl = useMemo(() => ensureShippingTemplates(state?.settings), [state?.settings]);
  const [vehicles, setVehicles] = useState<VehicleRow[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [sectorDraft, setSectorDraft] = useState('');
  const [zoneProvince, setZoneProvince] = useState('Pichincha');
  const [zoneCity, setZoneCity] = useState('Quito');
  const [zoneSector, setZoneSector] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [costVehicleId, setCostVehicleId] = useState<string | null>(null);
  const [kmVehicle, setKmVehicle] = useState<VehicleRow | null>(null);
  const [kmMode, setKmMode] = useState<'add' | 'set'>('add');
  const [kmValue, setKmValue] = useState('');
  const [kmNote, setKmNote] = useState('');
  const [kmLogs, setKmLogs] = useState<
    Array<{ id: string; km: number; source: string; note: string; odometerAfter: number; createdAt: string }>
  >([]);
  const [query, setQuery] = useState('');

  const knownSectors = useMemo(() => {
    const set = new Set<string>();
    for (const c of state?.clients ?? []) {
      const path = zonePathOf(c);
      if (path && path !== 'Sin zona') set.add(path);
      if (c.sector?.trim()) set.add(c.sector.trim());
    }
    for (const s of catalogSectors(zoneProvince || 'Pichincha', zoneCity || 'Quito')) set.add(s);
    return [...set].sort((a, b) => a.localeCompare(b, 'es'));
  }, [state?.clients, zoneProvince, zoneCity]);

  const load = async () => {
    const res = await api.fleetManage();
    setVehicles(res.vehicles as VehicleRow[]);
  };

  useEffect(() => {
    void load().catch((e) => setError(e instanceof Error ? e.message : 'Error'));
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return vehicles;
    return vehicles.filter(
      (v) =>
        v.plate.toLowerCase().includes(q) ||
        v.label.toLowerCase().includes(q) ||
        v.city.toLowerCase().includes(q) ||
        v.driver.toLowerCase().includes(q),
    );
  }, [vehicles, query]);

  const setType = (vehicleType: VehicleKind) => {
    const d = KIND_DEFAULTS[vehicleType];
    setForm((prev) => ({
      ...prev,
      vehicleType,
      maxKg: d.maxKg,
      maxM3: d.maxM3,
      costPerKm: d.costPerKm,
      etaHours: d.etaHours,
      routeKm: d.routeKm,
    }));
  };

  const openCreate = () => {
    setForm(emptyForm);
    setSectorDraft('');
    setError('');
    setMsg('');
    setDrawerOpen(true);
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
        allowedSectors: form.allSectors ? [] : form.allowedSectors,
      });
      if (!form.active) {
        await api.updateFleetVehicle(String(res.vehicle.id), { active: false });
      }
      await load();
      onFleetChange(res.trucks as Truck[]);
      setDrawerOpen(false);
      setForm(emptyForm);
      setMsg('Vehículo guardado.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear');
    } finally {
      setBusy(false);
    }
  };

  const patch = async (id: string, body: Parameters<typeof api.updateFleetVehicle>[1]) => {
    setBusy(true);
    setError('');
    try {
      const res = await api.updateFleetVehicle(id, body);
      await load();
      onFleetChange(res.trucks as Truck[]);
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
      onFleetChange(res.trucks as Truck[]);
      setMsg('Vehículo eliminado.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo eliminar');
    } finally {
      setBusy(false);
    }
  };

  const openKm = async (v: VehicleRow) => {
    setKmVehicle(v);
    setKmMode('add');
    setKmValue('');
    setKmNote('');
    setError('');
    try {
      const res = await api.vehicleKmLogs(v.id);
      setKmLogs(res.logs);
      setKmVehicle({ ...v, odometer_km: res.odometerKm });
    } catch {
      setKmLogs([]);
    }
  };

  const saveKm = async (e: FormEvent) => {
    e.preventDefault();
    if (!kmVehicle || busy) return;
    const value = Number(kmValue);
    if (!Number.isFinite(value) || value < 0) {
      setError('Indica un valor de km válido.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      if (kmMode === 'set') {
        const res = await api.setVehicleOdometer(kmVehicle.id, {
          odometerKm: value,
          note: kmNote || undefined,
        });
        onFleetChange(res.trucks as Truck[]);
      } else {
        if (value <= 0) {
          setError('Los km a sumar deben ser mayores a cero.');
          setBusy(false);
          return;
        }
        const res = await api.recordVehicleKm(kmVehicle.id, {
          km: value,
          note: kmNote || undefined,
        });
        onFleetChange(res.trucks as Truck[]);
      }
      await load();
      const refreshed = await api.vehicleKmLogs(kmVehicle.id);
      setKmLogs(refreshed.logs);
      setKmVehicle((prev) => (prev ? { ...prev, odometer_km: refreshed.odometerKm } : prev));
      setKmValue('');
      setKmNote('');
      setMsg('Kilometraje actualizado.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo registrar km');
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

  const citySectors = catalogSectors(zoneProvince || 'Pichincha', form.city || zoneCity || 'Quito');

  return (
    <div className="fleet-manage">
      {msg ? <p className="fleet-config-ok">{msg}</p> : null}
      {error ? <p className="fleet-config-err">{error}</p> : null}

      <div className="fleet-manage-toolbar">
        <Btn variant="primary" icon="plus" onClick={openCreate}>
          Agregar vehículo
        </Btn>
        <SearchInput
          className="fleet-manage-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filtrar por placa, nombre o ciudad"
          aria-label="Filtrar flota"
        />
      </div>

      <div className="table-scroll fleet-manage-table">
        <table>
          <thead>
            <tr>
              <th>Placa</th>
              <th>Nombre</th>
              <th>Tipo</th>
              <th>Km</th>
              <th>Plantilla envío</th>
              <th>Sectores</th>
              <th>Estado</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {filtered.map((v) => {
              const sectors = rowSectors(v);
              const kind = (v.vehicle_type || 'camion') as VehicleKind;
              const tplId = String(v.shipping_template_id || '').trim();
              const tpl =
                (tplId ? shippingTpl.templates.find((t) => t.id === tplId) : undefined) ??
                shippingTpl.templates.find((t) => t.id === shippingTpl.defaultId);
              return (
                <tr key={v.id} className={v.active ? '' : 'is-off'}>
                  <td>
                    <strong>{v.plate}</strong>
                  </td>
                  <td>{v.label}</td>
                  <td>
                    <span className="fleet-type-pill">
                      <Icon name={vehicleIconName(kind)} />
                      {vehicleKindLabel({ vehicleType: kind } as Truck)}
                    </span>
                  </td>
                  <td>
                    <strong>{(Number(v.odometer_km) || 0).toLocaleString('es-EC')}</strong>
                    <span className="sub"> km</span>
                  </td>
                  <td>
                    <Select
                      value={tplId || shippingTpl.defaultId}
                      disabled={busy}
                      onChange={(e) =>
                        void patch(v.id, {
                          shippingTemplateId: e.target.value || null,
                        })
                      }
                    >
                      {shippingTpl.templates.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                          {t.id === shippingTpl.defaultId ? ' (default)' : ''}
                        </option>
                      ))}
                    </Select>
                    {!tpl ? <em className="muted">Default</em> : null}
                  </td>
                  <td>
                    <div className="fleet-sector-chips">
                      {sectors.length ? (
                        sectors.map((s) => (
                          <span key={s} className="fleet-chip is-on">
                            {s}
                          </span>
                        ))
                      ) : (
                        <em className="muted">Todos</em>
                      )}
                    </div>
                  </td>
                  <td>
                    <span className={`fleet-status ${v.active ? 'is-on' : 'is-off'}`}>
                      {v.active ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td className="fleet-config-actions">
                    <Button size="small" disabled={busy} onClick={() => void openKm(v)}>
                      Km
                    </Button>
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
            {!filtered.length ? (
              <tr>
                <td colSpan={8}>
                  <p className="muted">Sin vehículos. Agrega el primero.</p>
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {kmVehicle ? (
        <div className="fleet-drawer-backdrop" onClick={() => setKmVehicle(null)}>
          <aside className="fleet-drawer" onClick={(e) => e.stopPropagation()} aria-label="Kilometraje">
            <header>
              <div>
                <h3>Kilometraje · {kmVehicle.plate}</h3>
                <p>
                  Odómetro actual:{' '}
                  <strong>{(Number(kmVehicle.odometer_km) || 0).toLocaleString('es-EC')} km</strong>
                </p>
              </div>
              <button type="button" className="icon-btn" aria-label="Cerrar" onClick={() => setKmVehicle(null)}>
                <Icon name="close" />
              </button>
            </header>
            <form onSubmit={(e) => void saveKm(e)}>
              <section>
                <div className="fleet-cover-mode" role="radiogroup" aria-label="Modo de km">
                  <label>
                    <input
                      type="radio"
                      checked={kmMode === 'add'}
                      onChange={() => setKmMode('add')}
                    />
                    Sumar km de un viaje
                  </label>
                  <label>
                    <input
                      type="radio"
                      checked={kmMode === 'set'}
                      onChange={() => setKmMode('set')}
                    />
                    Ajustar odómetro
                  </label>
                </div>
                <div className="fleet-drawer-grid">
                  <label>
                    {kmMode === 'add' ? 'Km del viaje' : 'Odómetro (km)'}
                    <Input
                      type="number"
                      min={0}
                      step="0.1"
                      value={kmValue}
                      onChange={(e) => setKmValue(e.target.value)}
                      required
                    />
                  </label>
                  <label>
                    Nota
                    <Input
                      value={kmNote}
                      onChange={(e) => setKmNote(e.target.value)}
                      placeholder="Opcional"
                    />
                  </label>
                </div>
                <p className="muted">
                  Al enviar un camión desde Distribución también se suman los km estimados de la
                  ruta automáticamente.
                </p>
              </section>
              <footer>
                <Btn type="button" onClick={() => setKmVehicle(null)}>
                  Cerrar
                </Btn>
                <Btn type="submit" variant="primary" disabled={busy}>
                  {busy ? 'Guardando…' : 'Guardar km'}
                </Btn>
              </footer>
            </form>
            <section style={{ padding: '0 20px 24px' }}>
              <h4>Historial reciente</h4>
              {kmLogs.length ? (
                <ul className="fleet-km-logs">
                  {kmLogs.map((log) => (
                    <li key={log.id}>
                      <strong>
                        {log.source === 'adjust' ? 'Ajuste' : log.source === 'dispatch' ? 'Despacho' : 'Manual'}:{' '}
                        {log.km > 0 ? '+' : ''}
                        {log.km} km
                      </strong>
                      <small>
                        Odómetro {log.odometerAfter.toLocaleString('es-EC')} ·{' '}
                        {new Date(log.createdAt).toLocaleString('es-EC')}
                        {log.note ? ` · ${log.note}` : ''}
                      </small>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="muted">Aún no hay registros de km.</p>
              )}
            </section>
          </aside>
        </div>
      ) : null}

      {drawerOpen ? (
        <div className="fleet-drawer-backdrop" onClick={() => setDrawerOpen(false)}>
          <aside className="fleet-drawer" onClick={(e) => e.stopPropagation()} aria-label="Nuevo vehículo">
            <header>
              <div>
                <h3>Nuevo vehículo</h3>
                <p>Identificación, capacidad y cobertura de zonas.</p>
              </div>
              <button type="button" className="icon-btn" aria-label="Cerrar" onClick={() => setDrawerOpen(false)}>
                <Icon name="close" />
              </button>
            </header>

            <form onSubmit={(e) => void create(e)}>
              <section>
                <h4>Identificación</h4>
                <div className="fleet-drawer-grid">
                  <label>
                    Tipo
                    <Select value={form.vehicleType} onChange={(e) => setType(e.target.value as VehicleKind)}>
                      <option value="camion">Camión</option>
                      <option value="carro">Carro</option>
                      <option value="motocicleta">Motocicleta</option>
                    </Select>
                  </label>
                  <label>
                    Nombre
                    <Input
                      value={form.label}
                      onChange={(e) => setForm({ ...form, label: e.target.value })}
                      placeholder="Camión 05"
                      required
                    />
                  </label>
                  <label>
                    Placa
                    <Input
                      value={form.plate}
                      onChange={(e) => setForm({ ...form, plate: e.target.value })}
                      placeholder="PBA-2048"
                      required
                    />
                  </label>
                  <label>
                    Conductor
                    <Input
                      value={form.driver}
                      onChange={(e) => setForm({ ...form, driver: e.target.value })}
                      placeholder="Carlos Pérez"
                    />
                  </label>
                </div>
              </section>

              <section>
                <h4>Capacidad y costos</h4>
                <div className="fleet-drawer-grid">
                  <label>
                    Peso máximo
                    <div className="fleet-input-unit">
                      <Input
                        type="number"
                        value={form.maxKg}
                        onChange={(e) => setForm({ ...form, maxKg: Number(e.target.value) })}
                      />
                      <span>kg</span>
                    </div>
                  </label>
                  <label>
                    Volumen máximo
                    <div className="fleet-input-unit">
                      <Input
                        type="number"
                        step="0.1"
                        value={form.maxM3}
                        onChange={(e) => setForm({ ...form, maxM3: Number(e.target.value) })}
                      />
                      <span>m³</span>
                    </div>
                  </label>
                  <label>
                    Costo por kilómetro
                    <div className="fleet-input-unit">
                      <Input
                        type="number"
                        step="0.01"
                        value={form.costPerKm}
                        onChange={(e) => setForm({ ...form, costPerKm: Number(e.target.value) })}
                      />
                      <span>USD/km</span>
                    </div>
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
                <p className="muted">
                  La plantilla define km mínimos, divisor y ETA (Reglas de negocio). El{' '}
                  <strong>$/km</strong> se ajusta aquí o en <strong>Costo real</strong>.
                </p>
              </section>

              <section>
                <h4>Cobertura</h4>
                <div className="fleet-drawer-grid">
                  <label>
                    Provincia
                    <Select
                      value={zoneProvince}
                      onChange={(e) => {
                        setZoneProvince(e.target.value);
                        const cities = citiesOf(e.target.value);
                        setZoneCity(cities[0] ?? '');
                        setForm((prev) => ({ ...prev, city: cities[0] ?? '' }));
                      }}
                    >
                      {provinces().map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </Select>
                  </label>
                  <label>
                    Ciudad
                    <Select
                      value={form.city}
                      onChange={(e) => {
                        setForm({ ...form, city: e.target.value });
                        setZoneCity(e.target.value);
                      }}
                    >
                      {citiesOf(zoneProvince).map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </Select>
                  </label>
                </div>

                <div className="fleet-cover-mode" role="radiogroup" aria-label="Cobertura de sectores">
                  <label>
                    <input
                      type="radio"
                      checked={form.allSectors}
                      onChange={() => setForm({ ...form, allSectors: true, allowedSectors: [] })}
                    />
                    Todos los sectores
                  </label>
                  <label>
                    <input
                      type="radio"
                      checked={!form.allSectors}
                      onChange={() => setForm({ ...form, allSectors: false })}
                    />
                    Seleccionar sectores
                  </label>
                </div>

                {!form.allSectors ? (
                  <>
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
                    <div className="fleet-sector-add">
                      <Select
                        value={zoneSector}
                        onChange={(e) => {
                          const s = e.target.value;
                          if (!s) return;
                          const path = formatZonePath([zoneProvince, form.city, s]);
                          setForm({
                            ...form,
                            allowedSectors: addSector(path, form.allowedSectors),
                          });
                          setZoneSector('');
                        }}
                      >
                        <option value="">+ sector del catálogo…</option>
                        {citySectors.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </Select>
                    </div>
                    <ChipGroup
                      type="multiple"
                      label="Sectores conocidos"
                      className="fleet-sector-chips"
                      value={knownSectors.filter((s) => form.allowedSectors.some((x) => x.toLowerCase() === s.toLowerCase()))}
                      onValueChange={(next) => {
                        const current = knownSectors
                          .slice(0, 12)
                          .filter((s) => form.allowedSectors.some((x) => x.toLowerCase() === s.toLowerCase()));
                        const removed = current.filter((s) => !next.includes(s));
                        let list = form.allowedSectors.filter(
                          (x) => !removed.some((r) => r.toLowerCase() === x.toLowerCase()),
                        );
                        for (const s of next.filter((s) => !current.includes(s))) list = addSector(s, list);
                        setForm({ ...form, allowedSectors: list });
                      }}
                      items={knownSectors.slice(0, 12).map((s) => ({ value: s, label: s }))}
                    />
                    <div className="fleet-sector-add">
                      <Input
                        value={sectorDraft}
                        onChange={(e) => setSectorDraft(e.target.value)}
                        placeholder="O escribe: Pichincha / Quito / Norte"
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
                      <Button size="small" onClick={() => {
                          setForm({
                            ...form,
                            allowedSectors: addSector(sectorDraft, form.allowedSectors),
                          });
                          setSectorDraft('');
                        }}>
                        Agregar
                      </Button>
                    </div>
                  </>
                ) : null}
              </section>

              <label className="fleet-active-toggle">
                <input
                  type="checkbox"
                  checked={form.active}
                  onChange={(e) => setForm({ ...form, active: e.target.checked })}
                />
                Vehículo activo
              </label>

              <footer>
                <Btn type="button" onClick={() => setDrawerOpen(false)}>
                  Cancelar
                </Btn>
                <Btn type="submit" variant="primary" disabled={busy}>
                  {busy ? 'Guardando…' : 'Guardar vehículo'}
                </Btn>
              </footer>
            </form>
          </aside>
        </div>
      ) : null}
    </div>
  );
}
