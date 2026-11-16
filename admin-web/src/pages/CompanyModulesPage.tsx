import { FormEvent, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  api,
  type MenuItem,
  type MobileRole,
  type Module,
  type Vehicle,
  type VehicleKind,
} from '../api';

type Tab = 'modules' | 'mobile' | 'vehicles';

const KIND_DEFAULTS: Record<
  VehicleKind,
  { maxKg: number; maxM3: number; costPerKm: number; etaHours: number; routeKm: number }
> = {
  motocicleta: { maxKg: 80, maxM3: 0.3, costPerKm: 0.35, etaHours: 1.5, routeKm: 25 },
  carro: { maxKg: 800, maxM3: 2.5, costPerKm: 0.55, etaHours: 2.5, routeKm: 40 },
  camion: { maxKg: 3500, maxM3: 14, costPerKm: 0.8, etaHours: 3.5, routeKm: 50 },
};

const emptyVehicle = {
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
  sectorsText: '',
};

function vehicleSectors(v: Vehicle) {
  if (v.allowed_sectors_list?.length) return v.allowed_sectors_list;
  if (!v.allowed_sectors) return [];
  try {
    const p = JSON.parse(v.allowed_sectors) as unknown;
    return Array.isArray(p) ? p.map(String).filter(Boolean) : [];
  } catch {
    return [];
  }
}

export function CompanyModulesPage() {
  const { id = '' } = useParams();
  const [tab, setTab] = useState<Tab>('modules');
  const [modules, setModules] = useState<Module[]>([]);
  const [selectedMods, setSelectedMods] = useState<Set<string>>(new Set());
  const [preview, setPreview] = useState<Array<{ section: string; items: MenuItem[] }>>([]);
  const [roles, setRoles] = useState<MobileRole[]>([]);
  const [selectedRoles, setSelectedRoles] = useState<Set<string>>(new Set());
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [form, setForm] = useState(emptyVehicle);
  const [companyName, setCompanyName] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  const load = async () => {
    const [mods, mobile, fleet, companies, menu] = await Promise.all([
      api.companyModules(id),
      api.companyMobileRoles(id),
      api.companyVehicles(id),
      api.companies(),
      api.previewMenu(id),
    ]);
    setModules(mods.modules);
    setSelectedMods(new Set(mods.moduleIds));
    setRoles(mobile.roles);
    setSelectedRoles(new Set(mobile.roleIds));
    setVehicles(fleet.vehicles);
    setPreview(menu.sections);
    setCompanyName(companies.companies.find((c) => c.id === id)?.name ?? id);
  };

  useEffect(() => {
    if (!id) return;
    void load().catch((e) => setError(e instanceof Error ? e.message : 'Error'));
  }, [id]);

  const toggleMod = (moduleId: string) => {
    setSelectedMods((prev) => {
      const next = new Set(prev);
      if (next.has(moduleId)) next.delete(moduleId);
      else next.add(moduleId);
      next.add('mod-home');
      return next;
    });
  };

  const toggleRole = (roleId: string) => {
    setSelectedRoles((prev) => {
      const next = new Set(prev);
      if (next.has(roleId)) next.delete(roleId);
      else next.add(roleId);
      return next;
    });
  };

  const saveModules = async () => {
    setBusy(true);
    setError('');
    setMsg('');
    try {
      await api.setCompanyModules(id, [...selectedMods]);
      const menu = await api.previewMenu(id);
      setPreview(menu.sections);
      setMsg('Módulos web guardados.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar');
    } finally {
      setBusy(false);
    }
  };

  const saveMobile = async () => {
    setBusy(true);
    setError('');
    setMsg('');
    try {
      await api.setCompanyMobileRoles(id, [...selectedRoles]);
      setMsg('Roles móviles guardados.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar');
    } finally {
      setBusy(false);
    }
  };

  const addVehicle = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.plate.trim() || !form.label.trim() || busy) return;
    setBusy(true);
    setError('');
    setMsg('');
    try {
      await api.createVehicle(id, {
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
        allowedSectors: form.sectorsText
          .split(/[,;|]/)
          .map((s) => s.trim())
          .filter(Boolean),
      });
      setForm(emptyVehicle);
      const fleet = await api.companyVehicles(id);
      setVehicles(fleet.vehicles);
      setMsg('Vehículo agregado a la flota.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear');
    } finally {
      setBusy(false);
    }
  };

  const toggleVehicleActive = async (v: Vehicle) => {
    setBusy(true);
    setError('');
    try {
      await api.updateVehicle(v.id, { active: !v.active });
      const fleet = await api.companyVehicles(id);
      setVehicles(fleet.vehicles);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo actualizar');
    } finally {
      setBusy(false);
    }
  };

  const removeVehicle = async (v: Vehicle) => {
    if (!window.confirm(`¿Eliminar ${v.label} (${v.plate})?`)) return;
    setBusy(true);
    setError('');
    try {
      await api.deleteVehicle(v.id);
      setVehicles((prev) => prev.filter((x) => x.id !== v.id));
      setMsg('Vehículo eliminado.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo eliminar');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <div className="eyebrow">Empresa</div>
          <h1>{companyName || 'Empresa'}</h1>
          <p>Módulos web, roles de ops-mobile y flota de vehículos por tenant.</p>
        </div>
        <Link to="/" className="btn ghost">
          Volver
        </Link>
      </header>

      <div className="tabs">
        <button
          type="button"
          className={tab === 'modules' ? 'active' : ''}
          onClick={() => setTab('modules')}
        >
          Módulos web
        </button>
        <button
          type="button"
          className={tab === 'mobile' ? 'active' : ''}
          onClick={() => setTab('mobile')}
        >
          Roles móvil
        </button>
        <button
          type="button"
          className={tab === 'vehicles' ? 'active' : ''}
          onClick={() => setTab('vehicles')}
        >
          Vehículos ({vehicles.filter((v) => v.active).length})
        </button>
      </div>

      {msg ? <p className="ok">{msg}</p> : null}
      {error ? <p className="error">{error}</p> : null}

      {tab === 'modules' ? (
        <div className="split">
          <section className="card">
            <h2>Módulos disponibles</h2>
            <ul className="mod-list">
              {modules.map((m) => (
                <li key={m.id}>
                  <label>
                    <input
                      type="checkbox"
                      checked={selectedMods.has(m.id)}
                      disabled={m.id === 'mod-home'}
                      onChange={() => toggleMod(m.id)}
                    />
                    <span>
                      <strong>{m.name}</strong>
                      <small>
                        {m.code} · {m.description}
                      </small>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
            <button
              type="button"
              className="btn primary"
              disabled={busy}
              onClick={() => void saveModules()}
            >
              {busy ? 'Guardando…' : 'Guardar módulos'}
            </button>
          </section>

          <section className="card">
            <h2>Vista previa del menú</h2>
            {preview.length ? (
              preview.map((sec) => (
                <div key={sec.section} className="menu-preview">
                  <h3>{sec.section}</h3>
                  <ul>
                    {sec.items.map((item) => (
                      <li key={item.id}>
                        <strong>{item.label}</strong>
                        <small>{item.path}</small>
                      </li>
                    ))}
                  </ul>
                </div>
              ))
            ) : (
              <p className="muted">Sin ítems. Activa módulos y guarda.</p>
            )}
          </section>
        </div>
      ) : null}

      {tab === 'mobile' ? (
        <section className="card">
          <h2>Roles de ops-mobile</h2>
          <p className="muted">
            Define qué perfiles puede usar esta empresa en la app móvil (bodega, despacho,
            conductor).
          </p>
          <ul className="mod-list">
            {roles.map((r) => (
              <li key={r.id}>
                <label>
                  <input
                    type="checkbox"
                    checked={selectedRoles.has(r.id)}
                    onChange={() => toggleRole(r.id)}
                  />
                  <span>
                    <strong>{r.name}</strong>
                    <small>
                      {r.auth_role} · {r.description}
                    </small>
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <button
            type="button"
            className="btn primary"
            disabled={busy}
            onClick={() => void saveMobile()}
          >
            {busy ? 'Guardando…' : 'Guardar roles móviles'}
          </button>
        </section>
      ) : null}

      {tab === 'vehicles' ? (
        <div className="stack">
          <form className="card vehicle-form" onSubmit={(e) => void addVehicle(e)}>
            <h2>Nuevo vehículo</h2>
            <div className="form-grid">
              <label>
                Tipo
                <select
                  value={form.vehicleType}
                  onChange={(e) => {
                    const vehicleType = e.target.value as VehicleKind;
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
                  }}
                >
                  <option value="camion">Camión</option>
                  <option value="carro">Carro</option>
                  <option value="motocicleta">Motocicleta</option>
                </select>
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
                  placeholder="Nombre"
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
              <label>
                ETA (h)
                <input
                  type="number"
                  step="0.1"
                  value={form.etaHours}
                  onChange={(e) => setForm({ ...form, etaHours: Number(e.target.value) })}
                />
              </label>
              <label>
                Ruta km
                <input
                  type="number"
                  value={form.routeKm}
                  onChange={(e) => setForm({ ...form, routeKm: Number(e.target.value) })}
                />
              </label>
              <label className="full">
                Sectores permitidos (vacío = sin restricción)
                <input
                  value={form.sectorsText}
                  onChange={(e) => setForm({ ...form, sectorsText: e.target.value })}
                  placeholder="Centro Histórico, La Mariscal, Cumbayá"
                />
              </label>
            </div>
            <button type="submit" className="btn primary" disabled={busy}>
              {busy ? 'Guardando…' : 'Agregar vehículo'}
            </button>
          </form>

          <section className="card">
            <h2>Flota de la empresa</h2>
            {vehicles.length === 0 ? (
              <p className="muted">Sin vehículos. Agrega el primero arriba.</p>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Placa</th>
                      <th>Nombre</th>
                      <th>Tipo</th>
                      <th>Sectores</th>
                      <th>Ciudad</th>
                      <th>kg / m³</th>
                      <th>Estado</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {vehicles.map((v) => (
                      <tr key={v.id} className={v.active ? '' : 'is-off'}>
                        <td>
                          <strong>{v.plate}</strong>
                        </td>
                        <td>{v.label}</td>
                        <td>
                          <select
                            className="inline-select"
                            value={v.vehicle_type || 'camion'}
                            disabled={busy}
                            onChange={(e) =>
                              void api
                                .updateVehicle(v.id, {
                                  vehicleType: e.target.value as VehicleKind,
                                })
                                .then(() => api.companyVehicles(id))
                                .then((fleet) => setVehicles(fleet.vehicles))
                                .catch((err) =>
                                  setError(err instanceof Error ? err.message : 'Error'),
                                )
                            }
                          >
                            <option value="camion">Camión</option>
                            <option value="carro">Carro</option>
                            <option value="motocicleta">Motocicleta</option>
                          </select>
                        </td>
                        <td>
                          <small>
                            {vehicleSectors(v).length
                              ? vehicleSectors(v).join(', ')
                              : 'Sin restricción'}
                          </small>
                          <button
                            type="button"
                            className="btn ghost sm"
                            disabled={busy}
                            onClick={() => {
                              const current = vehicleSectors(v).join(', ');
                              const next = window.prompt(
                                'Sectores permitidos (vacío = sin restricción), separados por coma:',
                                current,
                              );
                              if (next === null) return;
                              void api
                                .updateVehicle(v.id, {
                                  allowedSectors: next
                                    .split(/[,;|]/)
                                    .map((s) => s.trim())
                                    .filter(Boolean),
                                })
                                .then(() => api.companyVehicles(id))
                                .then((fleet) => setVehicles(fleet.vehicles))
                                .catch((err) =>
                                  setError(err instanceof Error ? err.message : 'Error'),
                                );
                            }}
                          >
                            Editar zonas
                          </button>
                        </td>
                        <td>{v.city || '—'}</td>
                        <td>
                          {v.max_kg} / {v.max_m3}
                        </td>
                        <td>
                          <span className={`pill ${v.active ? 'on' : 'off'}`}>
                            {v.active ? 'Activo' : 'Inactivo'}
                          </span>
                        </td>
                        <td className="row-actions">
                          <button
                            type="button"
                            className="btn ghost sm"
                            disabled={busy}
                            onClick={() => void toggleVehicleActive(v)}
                          >
                            {v.active ? 'Desactivar' : 'Activar'}
                          </button>
                          <button
                            type="button"
                            className="btn ghost sm danger"
                            disabled={busy}
                            onClick={() => void removeVehicle(v)}
                          >
                            Eliminar
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      ) : null}
    </div>
  );
}
