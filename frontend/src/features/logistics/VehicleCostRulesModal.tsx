import { FormEvent, useEffect, useMemo, useState } from 'react';
import { api } from '../../shared/api/client';
import { Modal } from '../../shared/components/Modal';
import { Select } from '../../shared/components/Select';
import { Btn } from '../../shared/components/ui';
import {
  basisLabel,
  calcLabel,
  categoryLabel,
  COST_CATEGORIES,
  formatUnitCost,
  type CostBasis,
  type CostCalc,
  type TransportCostRule,
  type VehicleCostSummary,
} from '../../shared/lib/transportCost';
import { estimateRouteCost } from '../../shared/lib/businessRules';
import { money } from '../../shared/lib/inventory';
import type { Truck } from './fleet';

type Sibling = { id: string; plate: string; label: string };

const emptyForm = {
  name: '',
  category: 'combustible',
  basis: 'per_km' as CostBasis,
  calc: 'fixed' as CostCalc,
  amount: 0.35,
  lifeUnits: 50000,
};

export function VehicleCostRulesModal({
  vehicleId,
  onClose,
  onFleetChange,
}: {
  vehicleId: string;
  onClose: () => void;
  onFleetChange?: (trucks: Truck[]) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [vehicle, setVehicle] = useState<{
    id: string;
    plate: string;
    label: string;
    vehicleType: string;
    costPerKmFallback: number;
  } | null>(null);
  const [rules, setRules] = useState<TransportCostRule[]>([]);
  const [summary, setSummary] = useState<VehicleCostSummary | null>(null);
  const [siblings, setSiblings] = useState<Sibling[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [dupTargets, setDupTargets] = useState<string[]>([]);
  const [previewKm, setPreviewKm] = useState(60);

  const load = async () => {
    const res = await api.vehicleCostRules(vehicleId);
    setVehicle(res.vehicle);
    setRules(res.rules);
    setSummary(res.summary);
    setSiblings(res.siblings);
  };

  useEffect(() => {
    void load().catch((e) => setError(e instanceof Error ? e.message : 'Error'));
  }, [vehicleId]);

  const previewCost = useMemo(() => {
    if (!summary) return 0;
    return estimateRouteCost(previewKm, summary.costPerKm, summary.costPerTrip);
  }, [summary, previewKm]);

  const applyTrucks = (trucks: unknown) => {
    if (Array.isArray(trucks) && onFleetChange) onFleetChange(trucks as Truck[]);
  };

  const create = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    setMsg('');
    try {
      const res = await api.createVehicleCostRule(vehicleId, {
        name: form.name,
        category: form.category,
        basis: form.basis,
        calc: form.calc,
        amount: Number(form.amount),
        lifeUnits: form.calc === 'amortized' ? Number(form.lifeUnits) : undefined,
      });
      setRules(res.rules);
      setSummary(res.summary);
      applyTrucks(res.trucks);
      setForm({ ...emptyForm, name: '' });
      setMsg('Regla agregada.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear');
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (rule: TransportCostRule) => {
    setBusy(true);
    setError('');
    try {
      const res = await api.updateVehicleCostRule(rule.id, { active: !rule.active });
      if (res.rules) setRules(res.rules);
      if (res.summary) setSummary(res.summary);
      else await load();
      applyTrucks(res.trucks);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo actualizar');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (rule: TransportCostRule) => {
    if (!window.confirm(`¿Eliminar la regla «${rule.name}»?`)) return;
    setBusy(true);
    setError('');
    try {
      const res = await api.deleteVehicleCostRule(rule.id);
      await load();
      applyTrucks(res.trucks);
      setMsg('Regla eliminada.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo eliminar');
    } finally {
      setBusy(false);
    }
  };

  const applyDefaults = async (replace: boolean) => {
    if (
      replace &&
      !window.confirm('Esto reemplaza todas las reglas actuales por la plantilla típica. ¿Continuar?')
    ) {
      return;
    }
    setBusy(true);
    setError('');
    try {
      const res = await api.applyDefaultVehicleCostRules(vehicleId, replace);
      setRules(res.rules);
      setSummary(res.summary);
      applyTrucks(res.trucks);
      setMsg(replace ? 'Plantilla aplicada (reemplazo).' : 'Plantilla típica cargada.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar plantilla');
    } finally {
      setBusy(false);
    }
  };

  const duplicate = async () => {
    if (!dupTargets.length) {
      setError('Marca al menos un vehículo destino.');
      return;
    }
    if (
      !window.confirm(
        `¿Copiar ${rules.length} regla(s) a ${dupTargets.length} vehículo(s)? Se reemplazan las reglas del destino.`,
      )
    ) {
      return;
    }
    setBusy(true);
    setError('');
    try {
      const res = await api.duplicateVehicleCostRules(vehicleId, dupTargets);
      applyTrucks(res.trucks);
      setDupTargets([]);
      setMsg(`Reglas copiadas a ${res.targets} vehículo(s).`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo duplicar');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      wide
      fill
      title="Costo real de transporte"
      subtitle={
        vehicle
          ? `${vehicle.label} · ${vehicle.plate} — reglas por km y por viaje`
          : 'Cargando…'
      }
      onClose={onClose}
      footer={<Btn onClick={onClose}>Cerrar</Btn>}
    >
      <div className="cost-rules">
        {msg ? <p className="fleet-config-ok">{msg}</p> : null}
        {error ? <p className="fleet-config-err">{error}</p> : null}

        {summary ? (
          <div className="cost-rules-summary">
            <div>
              <span>Costo / km</span>
              <strong>${summary.costPerKm.toFixed(4)}</strong>
              <small>{summary.fromRules ? 'Desde reglas' : 'Valor fijo del vehículo'}</small>
            </div>
            <div>
              <span>Costo / viaje</span>
              <strong>{money(summary.costPerTrip)}</strong>
              <small>Peajes y fijos</small>
            </div>
            <div>
              <span>Simular ruta</span>
              <label className="cost-rules-preview">
                <input
                  type="number"
                  min={1}
                  value={previewKm}
                  onChange={(e) => setPreviewKm(Math.max(1, Number(e.target.value) || 1))}
                />
                km
              </label>
              <strong>{money(previewCost)}</strong>
            </div>
          </div>
        ) : null}

        <div className="cost-rules-toolbar">
          <Btn disabled={busy} onClick={() => void applyDefaults(false)}>
            Cargar plantilla típica
          </Btn>
          <Btn disabled={busy || !rules.length} onClick={() => void applyDefaults(true)}>
            Reemplazar con plantilla
          </Btn>
        </div>

        <form className="cost-rules-form" onSubmit={(e) => void create(e)}>
          <h4>Nueva regla</h4>
          <div className="cost-rules-grid">
            <label>
              Nombre
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Llantas (juego)"
                required
              />
            </label>
            <label>
              Categoría
              <Select
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
              >
                {COST_CATEGORIES.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </Select>
            </label>
            <label>
              Base
              <Select
                value={form.basis}
                onChange={(e) => setForm({ ...form, basis: e.target.value as CostBasis })}
              >
                <option value="per_km">Por kilómetro</option>
                <option value="per_trip">Por viaje / despacho</option>
              </Select>
            </label>
            <label>
              Cálculo
              <Select
                value={form.calc}
                onChange={(e) => setForm({ ...form, calc: e.target.value as CostCalc })}
              >
                <option value="fixed">Fijo ($/km o $/viaje)</option>
                <option value="amortized">Amortizado (costo ÷ vida útil)</option>
              </Select>
            </label>
            <label>
              {form.calc === 'amortized' ? 'Costo total (USD)' : form.basis === 'per_trip' ? '$ / viaje' : '$ / km'}
              <input
                type="number"
                min={0}
                step="0.01"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })}
                required
              />
            </label>
            {form.calc === 'amortized' ? (
              <label>
                Vida útil ({form.basis === 'per_trip' ? 'viajes' : 'km'})
                <input
                  type="number"
                  min={1}
                  step="1"
                  value={form.lifeUnits}
                  onChange={(e) => setForm({ ...form, lifeUnits: Number(e.target.value) })}
                  required
                />
              </label>
            ) : null}
          </div>
          <p className="muted">
            Ejemplo llantas: costo del juego $1.200 ÷ 50.000 km = $0,024/km. Se suma al combustible y al resto.
          </p>
          <Btn type="submit" variant="primary" disabled={busy}>
            {busy ? 'Guardando…' : 'Agregar regla'}
          </Btn>
        </form>

        <div className="cost-rules-list">
          <h4>Reglas del vehículo ({rules.length})</h4>
          {!rules.length ? (
            <p className="muted">Aún no hay reglas. Carga la plantilla típica o crea una.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Regla</th>
                  <th>Base</th>
                  <th>Cálculo</th>
                  <th>Aporte</th>
                  <th>Estado</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rules.map((rule) => (
                  <tr key={rule.id} className={rule.active ? '' : 'is-off'}>
                    <td>
                      <strong>{rule.name}</strong>
                      <span className="sub">{categoryLabel(rule.category)}</span>
                      {rule.calc === 'amortized' ? (
                        <span className="sub">
                          ${rule.amount} ÷ {rule.lifeUnits} {rule.basis === 'per_trip' ? 'viajes' : 'km'}
                        </span>
                      ) : null}
                    </td>
                    <td>{basisLabel(rule.basis)}</td>
                    <td>{calcLabel(rule.calc)}</td>
                    <td>{formatUnitCost(rule)}</td>
                    <td>{rule.active ? 'Activa' : 'Off'}</td>
                    <td className="fleet-config-actions">
                      <button type="button" disabled={busy} onClick={() => void toggle(rule)}>
                        {rule.active ? 'Desactivar' : 'Activar'}
                      </button>
                      <button type="button" disabled={busy} onClick={() => void remove(rule)}>
                        Eliminar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="cost-rules-dup">
          <h4>Duplicar reglas a otros vehículos</h4>
          <p className="muted">
            Copia todas las reglas de este vehículo y reemplaza las del destino. Ideal para flotas
            similares.
          </p>
          {!siblings.length ? (
            <p className="muted">No hay otros vehículos activos.</p>
          ) : (
            <>
              <div className="fleet-sector-chips">
                {siblings.map((s) => {
                  const on = dupTargets.includes(s.id);
                  return (
                    <button
                      key={s.id}
                      type="button"
                      className={`fleet-chip ${on ? 'is-on' : ''}`}
                      disabled={busy || !rules.length}
                      onClick={() =>
                        setDupTargets((prev) =>
                          on ? prev.filter((id) => id !== s.id) : [...prev, s.id],
                        )
                      }
                    >
                      {s.label} · {s.plate}
                    </button>
                  );
                })}
              </div>
              <div className="cost-rules-toolbar">
                <Btn
                  disabled={busy || !rules.length}
                  onClick={() => setDupTargets(siblings.map((s) => s.id))}
                >
                  Seleccionar todos
                </Btn>
                <Btn variant="primary" disabled={busy || !dupTargets.length || !rules.length} onClick={() => void duplicate()}>
                  Duplicar a seleccionados
                </Btn>
              </div>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}
