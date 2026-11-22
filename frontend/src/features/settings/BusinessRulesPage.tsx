import { useEffect, useMemo, useState } from 'react';
import { useAppState } from '../../shared/hooks/AppStateProvider';
import { api } from '../../shared/api/client';
import {
  DEFAULT_BUSINESS_RULES,
  estimateRouteCost,
  estimateRouteEtaHours,
  estimateRouteKm,
  resolveBusinessRules,
} from '../../shared/lib/businessRules';
import { money } from '../../shared/lib/inventory';
import { Btn, PageHead } from '../../shared/components/ui';
import { Icon } from '../../shared/components/Icon';
import type { BusinessRules } from '../../shared/types';
import '../../styles/business-rules.css';
import { Switch } from '../../shared/components/Checkbox';

type Draft = BusinessRules;

function num(v: FormDataEntryValue | null, fallback: number) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function BusinessRulesPage() {
  const { state, applyResponse, toast } = useAppState();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [previewStops, setPreviewStops] = useState(5);
  const [previewRouteKm, setPreviewRouteKm] = useState(62);
  const [previewCostPerKm, setPreviewCostPerKm] = useState(0.85);
  const [previewEta, setPreviewEta] = useState(3.33);

  const rules = resolveBusinessRules(state?.settings);
  const [draft, setDraft] = useState<Draft>(rules);

  useEffect(() => {
    setDraft(resolveBusinessRules(state?.settings));
  }, [state?.settings.businessRules]);

  const preview = useMemo(() => {
    const km = estimateRouteKm(previewRouteKm, previewStops, draft);
    const cost = estimateRouteCost(km, previewCostPerKm);
    const eta = estimateRouteEtaHours(previewEta, previewStops, draft);
    return { km, cost, eta };
  }, [draft, previewStops, previewRouteKm, previewCostPerKm, previewEta]);

  if (!state) return null;

  const setField = (key: keyof Draft, value: number) => {
    setDraft((d) => ({ ...d, [key]: value }));
  };

  const setFlag = (key: keyof Draft, value: boolean) => {
    setDraft((d) => ({ ...d, [key]: value }));
  };

  const save = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    const data = new FormData(e.currentTarget);
    const next: BusinessRules = {
      shippingMinKm: Math.max(0, num(data.get('shippingMinKm'), draft.shippingMinKm)),
      shippingStopsDivisor: Math.max(1, num(data.get('shippingStopsDivisor'), draft.shippingStopsDivisor)),
      shippingEtaBaseFactor: Math.max(0, num(data.get('shippingEtaBaseFactor'), draft.shippingEtaBaseFactor)),
      shippingEtaPerStop: Math.max(0, num(data.get('shippingEtaPerStop'), draft.shippingEtaPerStop)),
      assignCostReference: num(data.get('assignCostReference'), draft.assignCostReference),
      assignCostWeight: Math.max(0, num(data.get('assignCostWeight'), draft.assignCostWeight)),
      assignIdealFillMax: Math.min(1, Math.max(0.1, num(data.get('assignIdealFillMax'), draft.assignIdealFillMax))),
      assignNearFullFill: Math.min(1, Math.max(0.1, num(data.get('assignNearFullFill'), draft.assignNearFullFill))),
      creditOkMaxPct: Math.min(100, Math.max(1, num(data.get('creditOkMaxPct'), draft.creditOkMaxPct))),
      creditTightMaxPct: Math.min(100, Math.max(1, num(data.get('creditTightMaxPct'), draft.creditTightMaxPct))),
      defaultCreditLimit: Math.max(0, num(data.get('defaultCreditLimit'), draft.defaultCreditLimit)),
      separateExpiryLots: draft.separateExpiryLots,
    };
    if (next.creditOkMaxPct >= next.creditTightMaxPct) {
      setError('El umbral “cupo holgado” debe ser menor que “cupo ajustado”.');
      setBusy(false);
      return;
    }
    if (next.assignIdealFillMax >= next.assignNearFullFill) {
      setError('La ocupación ideal debe ser menor que la ocupación casi llena.');
      setBusy(false);
      return;
    }
    try {
      const res = await api.updateSettings({ businessRules: next });
      applyResponse(res);
      setDraft(resolveBusinessRules(res.state.settings));
      toast('Reglas de negocio guardadas.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar');
    } finally {
      setBusy(false);
    }
  };

  const restoreDefaults = () => {
    setDraft({ ...DEFAULT_BUSINESS_RULES });
    toast('Valores por defecto cargados. Guarda para aplicarlos.');
  };

  return (
    <div className="br-page">
      <PageHead
        eyebrow="Gestión"
        title="Reglas de negocio"
        desc="Parametriza el cálculo de costo de envío, la asignación de flota y los umbrales de crédito."
        actions={
          <Btn icon="refresh" onClick={restoreDefaults}>
            Restaurar defaults
          </Btn>
        }
      />

      <form className="br-layout" onSubmit={(e) => void save(e)}>
        <div className="br-main">
          <section className="br-card">
            <header className="br-card-head">
              <Icon name="truck" />
              <div>
                <h2>Costo de envío</h2>
                <p>
                  Fórmula: <code>km = max(mínimo, round(rutaBase × paradas / max(divisor, paradas)))</code>
                  {' · '}
                  <code>costo = km × $/km del vehículo</code>
                </p>
              </div>
            </header>
            <div className="br-grid">
              <label className="field">
                <span>Km mínimos por ruta</span>
                <input
                  name="shippingMinKm"
                  type="number"
                  min={0}
                  step={1}
                  value={draft.shippingMinKm}
                  onChange={(e) => setField('shippingMinKm', Number(e.target.value))}
                />
              </label>
              <label className="field">
                <span>Divisor de paradas</span>
                <input
                  name="shippingStopsDivisor"
                  type="number"
                  min={1}
                  step={1}
                  value={draft.shippingStopsDivisor}
                  onChange={(e) => setField('shippingStopsDivisor', Number(e.target.value))}
                />
              </label>
              <label className="field">
                <span>Factor base ETA</span>
                <input
                  name="shippingEtaBaseFactor"
                  type="number"
                  min={0}
                  step={0.01}
                  value={draft.shippingEtaBaseFactor}
                  onChange={(e) => setField('shippingEtaBaseFactor', Number(e.target.value))}
                />
              </label>
              <label className="field">
                <span>ETA extra por parada</span>
                <input
                  name="shippingEtaPerStop"
                  type="number"
                  min={0}
                  step={0.01}
                  value={draft.shippingEtaPerStop}
                  onChange={(e) => setField('shippingEtaPerStop', Number(e.target.value))}
                />
              </label>
            </div>
            <p className="br-note">
              El <strong>$/km</strong> se configura por vehículo en Logística → flota. Aquí defines cómo se
              estiman km, costo y tiempo de la ruta.
            </p>
          </section>

          <section className="br-card">
            <header className="br-card-head">
              <Icon name="spark" />
              <div>
                <h2>Asignación automática de flota</h2>
                <p>
                  Score de costo: <code>(referencia − $/km) × peso</code>. También umbrales de ocupación
                  al preferir camiones.
                </p>
              </div>
            </header>
            <div className="br-grid">
              <label className="field">
                <span>Referencia de costo ($/km)</span>
                <input
                  name="assignCostReference"
                  type="number"
                  min={0}
                  step={0.05}
                  value={draft.assignCostReference}
                  onChange={(e) => setField('assignCostReference', Number(e.target.value))}
                />
              </label>
              <label className="field">
                <span>Peso del costo en el score</span>
                <input
                  name="assignCostWeight"
                  type="number"
                  min={0}
                  step={1}
                  value={draft.assignCostWeight}
                  onChange={(e) => setField('assignCostWeight', Number(e.target.value))}
                />
              </label>
              <label className="field">
                <span>Ocupación ideal máx. (0–1)</span>
                <input
                  name="assignIdealFillMax"
                  type="number"
                  min={0.1}
                  max={1}
                  step={0.05}
                  value={draft.assignIdealFillMax}
                  onChange={(e) => setField('assignIdealFillMax', Number(e.target.value))}
                />
              </label>
              <label className="field">
                <span>Ocupación casi llena (0–1)</span>
                <input
                  name="assignNearFullFill"
                  type="number"
                  min={0.1}
                  max={1}
                  step={0.05}
                  value={draft.assignNearFullFill}
                  onChange={(e) => setField('assignNearFullFill', Number(e.target.value))}
                />
              </label>
            </div>
          </section>

          <section className="br-card">
            <header className="br-card-head">
              <Icon name="users" />
              <div>
                <h2>Crédito de clientes</h2>
                <p>Umbrales del directorio y límite sugerido al crear un cliente nuevo.</p>
              </div>
            </header>
            <div className="br-grid">
              <label className="field">
                <span>Cupo holgado hasta (%)</span>
                <input
                  name="creditOkMaxPct"
                  type="number"
                  min={1}
                  max={100}
                  step={1}
                  value={draft.creditOkMaxPct}
                  onChange={(e) => setField('creditOkMaxPct', Number(e.target.value))}
                />
              </label>
              <label className="field">
                <span>Cupo ajustado desde (%)</span>
                <input
                  name="creditTightMaxPct"
                  type="number"
                  min={1}
                  max={100}
                  step={1}
                  value={draft.creditTightMaxPct}
                  onChange={(e) => setField('creditTightMaxPct', Number(e.target.value))}
                />
              </label>
              <label className="field">
                <span>Límite de crédito por defecto (USD)</span>
                <input
                  name="defaultCreditLimit"
                  type="number"
                  min={0}
                  step={50}
                  value={draft.defaultCreditLimit}
                  onChange={(e) => setField('defaultCreditLimit', Number(e.target.value))}
                />
              </label>
              <label className="field">
                <span>Un lote por casilla</span>
                <Switch name="separateExpiryLots" checked={draft.separateExpiryLots} onCheckedChange={(checked) => setFlag('separateExpiryLots', checked)} />
              </label>
            </div>
          </section>

          {error ? <div className="form-error visible">{error}</div> : null}

          <div className="br-actions">
            <Btn variant="primary" icon="save" disabled={busy}>
              {busy ? 'Guardando…' : 'Guardar reglas'}
            </Btn>
          </div>
        </div>

        <aside className="br-side">
          <section className="br-card">
            <h3>Simulador de costo</h3>
            <p className="br-side-desc">Prueba la fórmula con los valores actuales del formulario.</p>
            <label className="field">
              <span>Paradas</span>
              <input
                type="number"
                min={1}
                value={previewStops}
                onChange={(e) => setPreviewStops(Math.max(1, Number(e.target.value) || 1))}
              />
            </label>
            <label className="field">
              <span>Ruta base del vehículo (km)</span>
              <input
                type="number"
                min={1}
                value={previewRouteKm}
                onChange={(e) => setPreviewRouteKm(Math.max(1, Number(e.target.value) || 1))}
              />
            </label>
            <label className="field">
              <span>$/km del vehículo</span>
              <input
                type="number"
                min={0}
                step={0.01}
                value={previewCostPerKm}
                onChange={(e) => setPreviewCostPerKm(Math.max(0, Number(e.target.value) || 0))}
              />
            </label>
            <label className="field">
              <span>ETA base (h)</span>
              <input
                type="number"
                min={0.1}
                step={0.1}
                value={previewEta}
                onChange={(e) => setPreviewEta(Math.max(0.1, Number(e.target.value) || 0.1))}
              />
            </label>
            <dl className="br-preview">
              <div>
                <dt>Km estimados</dt>
                <dd>{preview.km} km</dd>
              </div>
              <div>
                <dt>Costo estimado</dt>
                <dd>{money(preview.cost)}</dd>
              </div>
              <div>
                <dt>Tiempo estimado</dt>
                <dd>{preview.eta.toFixed(2)} h</dd>
              </div>
            </dl>
          </section>

          <section className="br-card br-help">
            <h3>Otras reglas ya en la app</h3>
            <ul>
              <li>
                <strong>Flota:</strong> capacidad kg/m³, sectores permitidos y $/km por vehículo (Logística).
              </li>
              <li>
                <strong>Stock mínimo:</strong> alerta por producto en Inventario.
              </li>
              <li>
                <strong>Familias de bodega:</strong> reglas de ubicación en Familias.
              </li>
              <li>
                <strong>Prioridad de pedido:</strong> Normal / Alta al crear el pedido.
              </li>
            </ul>
          </section>
        </aside>
      </form>
    </div>
  );
}
