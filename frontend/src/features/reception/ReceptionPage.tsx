import { useEffect, useMemo, useRef, useState } from 'react';
import { Select } from '../../shared/components/Select';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAppState } from '../../shared/hooks/AppStateProvider';
import { api } from '../../shared/api/client';
import { activeWarehouseId, product, qtyAt } from '../../shared/lib/inventory';
import { buildWarehouseGeometry, faceLabel, normalizeLayout } from '../../shared/lib/warehouseLayout';
import { Btn, PageHead, cx, Button } from '../../shared/components/ui';
import { Icon } from '../../shared/components/Icon';
import { Modal } from '../../shared/components/Modal';
import { WarehouseEmbed } from '../warehouse/WarehouseEmbed';
import { RECEIPT_REASONS, type AppState, type Location } from '../../shared/types';
import { useAuth } from '../../shared/hooks/AuthProvider';
import { packsOf, purchaseLines } from '../../shared/lib/wholesale';
import '../../styles/warehouse-positioning.css';
import '../../styles/reception.css';
import '../../styles/reception-rows.css';
import { WizardFooter, WizardSteps, useDiscardGuard, useStepFocus } from '../../shared/components/Wizard';
import { Checkbox } from '../../shared/components/Checkbox';
import { Input } from '../../shared/components/Input';

const steps = [
  { title: 'Origen', subtitle: 'Con o sin orden de compra' },
  { title: 'Productos', subtitle: 'Qué llega y cuánto' },
  { title: 'Lote y ubicación', subtitle: 'Vencimiento y dónde se guarda' },
  { title: 'Confirmar', subtitle: 'Revisar y registrar' },
];

type Mode = 'po' | 'free';

type Row = {
  key: string;
  productId: string;
  packCode: string;
  /** Cantidad de empaques. */
  qty: number;
  /** En órdenes de compra: la línea se puede dejar fuera de esta recepción. */
  include: boolean;
  pendingUnits?: number;
  batch: string;
  expiry: string;
  inspect: boolean;
  loc: string;
  options: Location[];
  optKey: string;
};

const newKey = () => Math.random().toString(36).slice(2, 9);

const expiryLabel = (d: string) =>
  d
    ? new Date(`${d}T12:00:00`).toLocaleDateString('es-EC', { day: '2-digit', month: 'short', year: 'numeric' })
    : 'Sin fecha';

const makeRow = (s: AppState | null | undefined, productId = '', packCode = 'unidad', qty = 1, extra: Partial<Row> = {}): Row => ({
  key: newKey(),
  productId,
  packCode,
  qty,
  include: true,
  batch: '',
  expiry: '',
  inspect: !!s?.products.find((p) => p.id === productId)?.inspectOnReceipt,
  loc: '',
  options: [],
  optKey: '',
  ...extra,
});

/** Líneas pendientes de una orden de compra, listas para recibir. */
const rowsFromPurchase = (s: AppState, purchaseId: string): Row[] => {
  const po = s.purchases.find((p) => p.id === purchaseId);
  if (!po) return [];
  const rows: Row[] = [];
  for (const line of purchaseLines(po)) {
    const per = line.unitsPerPack || 1;
    const pending = line.qty * per - (line.receivedUnits ?? 0);
    if (pending <= 0) continue;
    const packs = packsOf(product(s, line.productId));
    const usePack = packs.some((p) => p.code === line.packCode) && pending % per === 0;
    rows.push(
      makeRow(s, line.productId, usePack ? line.packCode : 'unidad', usePack ? pending / per : pending, {
        pendingUnits: pending,
      }),
    );
  }
  return rows;
};

/** Registro de una recepción en cuatro pasos: orden completa o productos sin orden. */
export function ReceptionNewPage() {
  const { state, meta, applyResponse, toast } = useAppState();
  const navigate = useNavigate();
  const location = useLocation();
  const routeState =
    (location.state as { loc?: string; productId?: string; purchaseId?: string; qty?: number } | null) ?? {};
  const prefillLoc = routeState.loc;
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const openPurchases = (state?.purchases ?? []).filter(
    (p) => !p.status || p.status === 'Abierta' || p.status === 'Parcial',
  );

  const [step, setStep] = useState(0);
  const [mode, setMode] = useState<Mode>(
    routeState.purchaseId ? 'po' : routeState.productId ? 'free' : openPurchases.length ? 'po' : 'free',
  );
  const [purchaseId, setPurchaseId] = useState(routeState.purchaseId ?? '');
  const [supplier, setSupplier] = useState('');
  const [reason, setReason] = useState('');
  const [rows, setRows] = useState<Row[]>(() => {
    if (routeState.purchaseId && state) return rowsFromPurchase(state, routeState.purchaseId);
    if (routeState.productId) {
      const qty = routeState.qty && routeState.qty > 0 ? routeState.qty : 1;
      return [makeRow(state, routeState.productId, 'unidad', qty)];
    }
    return mode === 'free' ? [makeRow(state)] : [];
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [lookupError, setLookupError] = useState('');
  const [saving, setSaving] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [mapKey, setMapKey] = useState('');
  const [mapPick, setMapPick] = useState('');
  const saveLock = useRef(false);
  const headingRef = useStepFocus(step);

  const warehouseId = state ? activeWarehouseId(state) : '';
  const warehouse = state?.warehouses.find((item) => item.id === warehouseId);
  const layout = useMemo(() => normalizeLayout(warehouse?.layout), [warehouse?.layout]);
  const geo = useMemo(() => buildWarehouseGeometry(layout), [layout]);
  const mapLocations = meta?.locations?.length ? meta.locations : geo.locations;
  const capacity = layout.capacityPerCell;
  const purchase = state?.purchases.find((p) => p.id === purchaseId);
  const purchaseSupplier = state?.suppliers?.find((s) => s.id === purchase?.supplierId)?.name ?? '';
  const todayIso = new Date().toISOString().slice(0, 10);

  const calc = (row: Row) => {
    const item = state ? product(state, row.productId) : undefined;
    const packs = packsOf(item);
    const pack = packs.find((p) => p.code === row.packCode) ?? packs[0];
    const stockQty = Math.round(row.qty * (pack?.units ?? 1));
    const valid =
      !!item && Number.isInteger(row.qty) && row.qty > 0 && Number.isInteger(stockQty) && stockQty > 0 && stockQty <= capacity;
    return { item, packs, pack, stockQty, valid };
  };
  const optKeyOf = (row: Row) => `${warehouseId}:${row.productId}:${calc(row).stockQty}:${state?.lots.length ?? 0}`;

  const active = rows.filter((row) => row.include);
  const sig = active.map((row) => `${row.key}:${optKeyOf(row)}`).join('|');

  // Sugerencias de ubicación por línea; cada línea evita casillas ya tomadas por otro producto.
  useEffect(() => {
    if (!state) return;
    const todo = active.filter((row) => calc(row).valid && row.optKey !== optKeyOf(row));
    if (!todo.length) return;
    let cancelled = false;
    setLoading(true);
    setLookupError('');
    void Promise.all(
      todo.map(async (row) => ({
        key: row.key,
        optKey: optKeyOf(row),
        opts: await api.suggest(row.productId, calc(row).stockQty),
      })),
    )
      .then((results) => {
        if (cancelled) return;
        setRows((current) => {
          const hit = new Set(results.map((r) => r.key));
          const next = current.map((row) => {
            const found = results.find((r) => r.key === row.key);
            return found ? { ...row, options: found.opts, optKey: found.optKey } : row;
          });
          const used = new Map<string, string>();
          next.forEach((row) => {
            if (row.include && row.loc && row.options.some((o) => o.id === row.loc)) used.set(row.loc, row.productId);
          });
          return next.map((row) => {
            if (!row.include || !hit.has(row.key) || row.options.some((o) => o.id === row.loc)) return row;
            const free = (o: Location) => {
              const owner = used.get(o.id);
              return !owner || owner === row.productId;
            };
            const pick =
              (prefillLoc ? row.options.find((o) => o.id === prefillLoc && free(o)) : undefined) ??
              row.options.find(free) ??
              row.options[0];
            if (pick) used.set(pick.id, row.productId);
            return { ...row, loc: pick?.id ?? '' };
          });
        });
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setLoading(false);
        setLookupError(err instanceof Error ? err.message : 'No se pudieron consultar las ubicaciones.');
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig, attempt]);

  // Proveedor sugerido a partir del primer producto cuando se recibe sin orden.
  useEffect(() => {
    if (mode !== 'free' || supplier || !state) return;
    const first = rows.find((row) => row.productId);
    const name = first ? product(state, first.productId)?.supplier : '';
    if (name) setSupplier(name);
  }, [mode, rows, supplier, state]);

  // Hay trabajo que perder en cuanto se avanza o se escribe algo propio de este ingreso.
  const discard = useDiscardGuard(
    !saving && (step > 0 || !!reason || rows.some((row) => !!row.batch.trim() || !!row.expiry)),
  );

  if (!state) return null;

  const patch = (key: string, change: Partial<Row>) =>
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...change } : row)));

  const chooseMode = (next: Mode) => {
    if (next === mode) return;
    setMode(next);
    setError('');
    setPurchaseId('');
    setSupplier('');
    setRows(next === 'free' ? [makeRow(state)] : []);
  };

  const choosePurchase = (id: string) => {
    setPurchaseId(id);
    setRows(id ? rowsFromPurchase(state, id) : []);
  };

  const changeProduct = (row: Row, productId: string) =>
    patch(row.key, {
      productId,
      packCode: 'unidad',
      inspect: !!product(state, productId)?.inspectOnReceipt,
      options: [],
      optKey: '',
      loc: '',
      expiry: '',
    });

  const locOf = (row: Row) =>
    row.options.find((o) => o.id === row.loc) ?? mapLocations.find((o) => o.id === row.loc);
  /** Espacio libre de la casilla de la línea, descontando lo que otras líneas dejan en ella. */
  const freeFor = (row: Row) => {
    const loc = locOf(row);
    if (!loc) return 0;
    const others = active
      .filter((r) => r.key !== row.key && r.loc === row.loc)
      .reduce((sum, r) => sum + calc(r).stockQty, 0);
    return loc.capacity - qtyAt(state, loc.id) - others;
  };

  const totalUnits = active.reduce((sum, row) => sum + (calc(row).valid ? calc(row).stockQty : 0), 0);

  const stepValid = [
    mode === 'po' ? !!purchaseId : isAdmin && !!reason && supplier.trim().length > 0,
    active.length > 0 && active.every((row) => !!row.productId && calc(row).valid),
    active.length > 0 &&
      !lookupError &&
      !loading &&
      active.every((row) => {
        const { item } = calc(row);
        const expires = item?.perishable !== false;
        return (
          row.batch.trim().length > 0 &&
          (!expires || (!!row.expiry && row.expiry >= todayIso)) &&
          (!row.expiry || row.expiry >= todayIso) &&
          row.optKey === optKeyOf(row) &&
          !!row.loc &&
          freeFor(row) >= calc(row).stockQty
        );
      }),
    true,
  ];
  const canSubmit = !saving && stepValid.every(Boolean);
  const firstInvalid = stepValid.findIndex((ok) => !ok);
  const maxReachable = firstInvalid === -1 ? steps.length - 1 : firstInvalid;
  const goTo = (index: number) => {
    if (index <= maxReachable) setStep(index);
  };

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (step < steps.length - 1) {
      if (stepValid[step]) setStep(step + 1);
      return;
    }
    if (saveLock.current || !canSubmit) return;
    saveLock.current = true;
    setSaving(true);
    setError('');
    try {
      const res =
        mode === 'po'
          ? await api.receivePurchase(
              purchaseId,
              active.map((row) => ({
                productId: row.productId,
                qty: calc(row).stockQty,
                loc: row.loc,
                batch: row.batch.trim(),
                expiry: row.expiry,
                inspect: row.inspect,
              })),
            )
          : await api.receiveBatch({
              supplier: supplier.trim(),
              reason,
              lines: active.map((row) => ({
                productId: row.productId,
                qty: calc(row).stockQty,
                packCode: calc(row).pack?.code ?? 'unidad',
                packQty: row.qty,
                loc: row.loc,
                batch: row.batch.trim(),
                expiry: row.expiry,
                inspect: row.inspect,
              })),
            });
      applyResponse(res);
      const newId = res.state?.receipts?.[0]?.id;
      toast(
        `Recepción registrada${mode === 'po' ? ` contra ${purchaseId}` : ''}: ${active.length} ${
          active.length === 1 ? 'línea' : 'líneas'
        }, ${totalUnits} u.`,
      );
      navigate('/recepcion', { state: { highlight: newId } });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo registrar la recepción.');
    } finally {
      saveLock.current = false;
      setSaving(false);
    }
  };

  const checks = [
    { label: 'Origen definido', ok: stepValid[0] },
    { label: 'Productos y cantidades', ok: step >= 1 && stepValid[1] },
    { label: 'Lote, vencimiento y ubicación', ok: step >= 2 && stepValid[2] },
  ];

  const mapRow = rows.find((row) => row.key === mapKey);
  const mapFocus = mapPick || mapRow?.loc || '';
  const nameOf = (id: string) => product(state, id)?.name ?? id;

  return (
    <div className="reception-page">
      <PageHead
        eyebrow="Ingreso de mercadería"
        title="Registrar recepción"
        desc="Recibe una orden de compra completa o uno o varios productos que llegan sin orden."
        actions={
          <Btn icon="arrow" onClick={() => discard.guard(() => navigate('/recepcion'))}>
            Ver recepciones
          </Btn>
        }
      />

      <WizardSteps
        label="Pasos de la recepción"
        steps={steps}
        current={step}
        onSelect={goTo}
        canSelect={(index) => index <= maxReachable}
        disabled={saving}
      />

      <form className="reception-layout" id="receive-form" onSubmit={onSubmit} noValidate>
        <div className="panel reception-form">
          <fieldset className="transfer-fields" disabled={saving}>
            <div className="form-section reception-step-panel" key={step}>
              <h3 ref={headingRef} tabIndex={-1}>
                <Icon name={['receive', 'box', 'pin', 'check'][step]} />
                {['¿Cómo llega la mercadería?', 'Productos y cantidades', 'Lote y ubicación', 'Revisa antes de registrar'][step]}
              </h3>

              {step === 0 ? (
                <>
                  <div className="rec-modes" role="radiogroup" aria-label="Tipo de recepción">
                    <button
                      type="button"
                      role="radio"
                      aria-checked={mode === 'po'}
                      className={cx('rec-mode', mode === 'po' && 'is-active')}
                      onClick={() => chooseMode('po')}
                    >
                      <Icon name="receive" />
                      <strong>Con orden de compra</strong>
                      <span>Recibe todas las líneas de una orden, completa o por partes.</span>
                    </button>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={mode === 'free'}
                      disabled={!isAdmin}
                      className={cx('rec-mode', mode === 'free' && 'is-active')}
                      onClick={() => chooseMode('free')}
                    >
                      <Icon name="box" />
                      <strong>Sin orden de compra</strong>
                      <span>
                        Uno o varios productos que llegan sin orden.{' '}
                        {isAdmin ? 'Se registra con su motivo.' : 'Requiere administración.'}
                      </span>
                    </button>
                  </div>

                  {mode === 'po' ? (
                    <div className="form-grid">
                      <div className="field full">
                        <label htmlFor="rec-po">Orden de compra</label>
                        <Select id="rec-po" value={purchaseId} onChange={(e) => choosePurchase(e.target.value)}>
                          <option value="" disabled>
                            Selecciona una orden
                          </option>
                          {openPurchases.map((p) => {
                            const name = state.suppliers?.find((s) => s.id === p.supplierId)?.name ?? 'Sin proveedor';
                            const pending = purchaseLines(p).reduce(
                              (sum, line) => sum + line.qty * (line.unitsPerPack || 1) - (line.receivedUnits ?? 0),
                              0,
                            );
                            return (
                              <option key={p.id} value={p.id}>
                                {p.id} · {name} · pendiente {pending} u.
                              </option>
                            );
                          })}
                        </Select>
                        {!openPurchases.length ? <small>No hay órdenes de compra abiertas.</small> : null}
                      </div>
                      {purchase ? (
                        <ul className="rec-po-preview full" aria-label="Líneas de la orden">
                          {rows.map((row) => (
                            <li key={row.key}>
                              <span>{nameOf(row.productId)}</span>
                              <b>pendiente {row.pendingUnits} u.</b>
                            </li>
                          ))}
                          {!rows.length ? <li>La orden no tiene líneas pendientes.</li> : null}
                        </ul>
                      ) : null}
                    </div>
                  ) : (
                    <div className="form-grid">
                      <div className="field">
                        <label htmlFor="rec-reason">Motivo del ingreso sin orden</label>
                        <Select id="rec-reason" value={reason} disabled={!isAdmin} onChange={(e) => setReason(e.target.value)}>
                          <option value="">Elegir motivo…</option>
                          {RECEIPT_REASONS.map((r) => (
                            <option key={r} value={r}>
                              {r}
                            </option>
                          ))}
                        </Select>
                        <small>Todo ingreso sin orden de compra queda registrado con su motivo.</small>
                      </div>
                      <div className="field">
                        <label htmlFor="rec-supplier">Proveedor</label>
                        <Input id="rec-supplier" value={supplier} onChange={(e) => setSupplier(e.target.value)} required />
                      </div>
                    </div>
                  )}
                </>
              ) : null}

              {step === 1 ? (
                <>
                  <p className="section-note">
                    {mode === 'po'
                      ? `Cuenta los empaques que llegaron de ${purchaseId}. Desmarca lo que no llegó: queda pendiente en la orden.`
                      : 'Agrega cada producto que llega. Puedes repetir un producto si trae lotes distintos.'}
                  </p>
                  <div className="rec-cols" aria-hidden="true">
                    <span>Producto</span>
                    <span>Empaque</span>
                    <span>Cantidad</span>
                    <span className="end">Unidades</span>
                    <span />
                  </div>
                  {rows.map((row, index) => {
                    const c = calc(row);
                    return (
                      <div className={cx('rec-row', !row.include && 'is-off')} key={row.key}>
                        <div className="rec-prod">
                          {mode === 'po' ? (
                            <label className="rec-check">
                              <Checkbox
                                checked={row.include}
                                onCheckedChange={(checked) => patch(row.key, { include: checked })}
                                aria-label={`Incluir ${nameOf(row.productId)}`}
                              />
                              <span>
                                <strong>{nameOf(row.productId)}</strong>
                                <small>Pendiente {row.pendingUnits} u.</small>
                              </span>
                            </label>
                          ) : (
                            <div className={row.productId ? 'field' : 'field has-error'}>
                              <Select
                                aria-label={`Producto ${index + 1}`}
                                value={row.productId}
                                onChange={(e) => changeProduct(row, e.target.value)}
                              >
                                <option value="" disabled>
                                  Selecciona un producto
                                </option>
                                {state.products.map((p) => (
                                  <option key={p.id} value={p.id}>
                                    {p.id} · {p.name}
                                  </option>
                                ))}
                              </Select>
                            </div>
                          )}
                        </div>
                        <div className="field">
                          <Select
                            aria-label={`Empaque ${index + 1}`}
                            value={c.pack?.code ?? 'unidad'}
                            disabled={!row.include || !row.productId}
                            onChange={(e) => patch(row.key, { packCode: e.target.value })}
                          >
                            {c.packs.map((item) => (
                              <option key={item.code} value={item.code}>
                                {item.label} · {item.units} {item.units === 1 ? 'unidad' : 'unidades'}
                              </option>
                            ))}
                          </Select>
                        </div>
                        <div className="field">
                          <Input
                            aria-label={`Cantidad de empaques ${index + 1}`}
                            type="number"
                            min={1}
                            inputMode="numeric"
                            value={row.qty}
                            disabled={!row.include}
                            onChange={(e) => patch(row.key, { qty: Number(e.target.value) })}
                          />
                        </div>
                        <output className={cx('rec-units', row.include && row.productId && !c.valid && 'is-error')}>
                          {row.include && row.productId ? `${c.stockQty} u.` : '—'}
                        </output>
                        {mode === 'free' ? (
                          <button
                            type="button"
                            className="icon-btn rec-remove"
                            aria-label={`Quitar producto ${index + 1}`}
                            disabled={rows.length === 1}
                            onClick={() => setRows((current) => current.filter((r) => r.key !== row.key))}
                          >
                            <Icon name="trash" />
                          </button>
                        ) : (
                          <span />
                        )}
                        {row.include && row.productId && c.stockQty > capacity ? (
                          <p className="rec-row-note">
                            {c.stockQty} u. supera la capacidad de una casilla ({capacity} u.). Divide la recepción en
                            partes.
                          </p>
                        ) : null}
                      </div>
                    );
                  })}
                  {mode === 'free' ? (
                    <div>
                      <Btn
                        icon="plus"
                        disabled={rows.some((row) => !row.productId)}
                        onClick={() => setRows((current) => [...current, makeRow(state)])}
                      >
                        Añadir producto
                      </Btn>
                    </div>
                  ) : null}
                </>
              ) : null}

              {step === 2 ? (
                <>
                  <p className="section-note">
                    {loading
                      ? 'Buscando casillas compatibles…'
                      : 'Indica el lote y el vencimiento de cada línea. La ubicación sugerida se puede cambiar.'}
                  </p>
                  {lookupError ? (
                    <div className="wh-error" role="alert">
                      {lookupError} <Btn onClick={() => setAttempt((value) => value + 1)}>Reintentar</Btn>
                    </div>
                  ) : null}
                  {active.map((row, index) => {
                    const c = calc(row);
                    const expires = c.item?.perishable !== false;
                    const ready = row.optKey === optKeyOf(row);
                    const free = freeFor(row);
                    const noSpace = ready && !!row.loc && free < c.stockQty;
                    return (
                      <article className="rec-card" key={row.key}>
                        <header>
                          <div>
                            <strong>{nameOf(row.productId)}</strong>
                            <small>
                              {row.qty} × {(c.pack?.label ?? 'unidad').toLowerCase()} = {c.stockQty} u.
                            </small>
                          </div>
                          <span className="rec-card-n">Línea {index + 1}</span>
                        </header>
                        <div className="form-grid">
                          <div className="field">
                            <label htmlFor={`rec-batch-${index}`}>Lote</label>
                            <Input
                              id={`rec-batch-${index}`}
                              value={row.batch}
                              onChange={(e) => patch(row.key, { batch: e.target.value })}
                              placeholder="Ej. LT-261027"
                            />
                          </div>
                          <div className="field">
                            <label htmlFor={`rec-expiry-${index}`}>{expires ? 'Vencimiento' : 'Vencimiento (no caduca)'}</label>
                            <Input
                              id={`rec-expiry-${index}`}
                              type="date"
                              value={row.expiry}
                              min={todayIso}
                              onChange={(e) => patch(row.key, { expiry: e.target.value })}
                            />
                          </div>
                          <div className={cx('field', noSpace && 'has-error')}>
                            <label htmlFor={`rec-loc-${index}`}>Ubicación</label>
                            <div className="rec-loc">
                              <Select
                                id={`rec-loc-${index}`}
                                value={row.loc}
                                disabled={!ready}
                                onChange={(e) => patch(row.key, { loc: e.target.value })}
                              >
                                {!row.options.length ? (
                                  <option value="" disabled>
                                    Sin ubicaciones compatibles
                                  </option>
                                ) : null}
                                {row.options.map((o, i) => (
                                  <option key={o.id} value={o.id}>
                                    {o.id}
                                    {i === 0 ? ' · sugerida' : ''} · {o.capacity - qtyAt(state, o.id)} libres
                                  </option>
                                ))}
                              </Select>
                              <Btn
                                icon="warehouse"
                                aria-label={`Elegir en el mapa la línea ${index + 1}`}
                                disabled={!row.loc}
                                onClick={() => {
                                  setMapPick(row.loc);
                                  setMapKey(row.key);
                                }}
                              >
                                Mapa
                              </Btn>
                            </div>
                            {noSpace ? <small className="field-error">No hay espacio suficiente en esta casilla.</small> : null}
                          </div>
                          <div className="field">
                            <label htmlFor={`rec-inspect-${index}`} className="rec-inspect">
                              <Checkbox
                                id={`rec-inspect-${index}`}
                                checked={row.inspect}
                                onCheckedChange={(checked) => patch(row.key, { inspect: checked })}
                              />
                              Recibir a inspección de calidad
                            </label>
                            <small>Queda retenido hasta que administración lo libere.</small>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </>
              ) : null}

              {step === 3 ? (
                <>
                  <p className="section-note">Al confirmar se suma al inventario y queda la trazabilidad de cada lote.</p>
                  <dl className="reception-review">
                    <div>
                      <dt>Origen</dt>
                      <dd>
                        <span>{mode === 'po' ? `Orden ${purchaseId} · ${purchaseSupplier}` : `Sin orden de compra · ${reason}`}</span>
                        <Button variant="link" className="reception-edit" onClick={() => setStep(0)}>
                          Editar
                        </Button>
                      </dd>
                    </div>
                    {mode === 'free' ? (
                      <div>
                        <dt>Proveedor</dt>
                        <dd>
                          <span>{supplier}</span>
                          <Button variant="link" className="reception-edit" onClick={() => setStep(0)}>
                            Editar
                          </Button>
                        </dd>
                      </div>
                    ) : null}
                  </dl>
                  <div className="rec-review-lines">
                    {active.map((row) => {
                      const c = calc(row);
                      const loc = locOf(row);
                      return (
                        <div className="rec-review-line" key={row.key}>
                          <div>
                            <strong>{nameOf(row.productId)}</strong>
                            <small>
                              {row.qty} × {(c.pack?.label ?? 'unidad').toLowerCase()} = {c.stockQty} u. · Lote {row.batch.trim()} ·{' '}
                              {expiryLabel(row.expiry)}
                              {row.inspect ? ' · a inspección' : ''}
                            </small>
                          </div>
                          <span className="rec-review-loc">
                            {row.loc}
                            {loc ? (
                              <small>
                                Rack {loc.rack} · Nivel {loc.level} · Pos {loc.pos}
                                {loc.face ? ` · ${faceLabel(loc.face)}` : ''}
                              </small>
                            ) : null}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  <Button variant="link" className="reception-edit" onClick={() => setStep(1)}>
                    Editar productos
                  </Button>
                </>
              ) : null}

              {error ? (
                <div className="form-error visible" role="alert" style={{ marginTop: 12 }}>
                  {error}
                </div>
              ) : null}
            </div>
          </fieldset>
        </div>

        <aside className="reception-side">
          <section className="panel reception-confirm">
            <div className="reception-confirm-head">
              <div className="eyebrow">Resumen</div>
              <h2>{mode === 'po' ? (purchaseId ? `Orden ${purchaseId}` : 'Orden de compra') : 'Sin orden de compra'}</h2>
              <p>
                {mode === 'po' ? purchaseSupplier || 'Elige una orden' : reason || 'Falta el motivo'}
                {warehouse ? ` · ${warehouse.name}` : ''}
              </p>
            </div>

            <div className="reception-confirm-body">
              <div className="reception-metric-row">
                <div className="reception-metric">
                  <span>Líneas</span>
                  <strong>{active.length}</strong>
                </div>
                <div className="reception-metric">
                  <span>Ingresan</span>
                  <strong>
                    {totalUnits}
                    <small>u.</small>
                  </strong>
                </div>
              </div>

              {active.some((row) => row.productId) ? (
                <ul className="rec-side-lines" aria-label="Líneas de la recepción">
                  {active
                    .filter((row) => row.productId)
                    .map((row) => (
                      <li key={row.key}>
                        <span>{nameOf(row.productId)}</span>
                        <b>
                          {calc(row).valid ? calc(row).stockQty : 0} u.
                          {step >= 2 && row.loc ? <small> · {row.loc}</small> : null}
                        </b>
                      </li>
                    ))}
                </ul>
              ) : (
                <div className="reception-dest empty">Aún no hay productos en la recepción.</div>
              )}

              <ul className="reception-checks">
                {checks.map((c) => (
                  <li key={c.label} className={c.ok ? 'is-ok' : undefined}>
                    {c.label}
                  </li>
                ))}
              </ul>

              <p className="reception-hint">
                {warehouse ? `${warehouse.name} · ${warehouse.city}` : 'Bodega activa'} · se actualiza inventario y
                trazabilidad
              </p>
            </div>
          </section>
        </aside>
      </form>

      <WizardFooter
        step={step}
        total={steps.length}
        onBack={() => setStep(step - 1)}
        onCancel={() => discard.guard(() => navigate('/recepcion'))}
        primary={{
          type: 'submit',
          form: 'receive-form',
          label: step < steps.length - 1 ? 'Siguiente' : 'Confirmar recepción',
          icon: step < steps.length - 1 ? 'arrow' : 'check',
          disabled: step < steps.length - 1 ? !stepValid[step] : !canSubmit,
          busy: saving,
          busyLabel: 'Registrando…',
        }}
      />
      {discard.dialog}

      {mapRow ? (
        <Modal
          wide
          title="Ubicación en bodega"
          subtitle={`${mapFocus} · ${warehouse?.name ?? 'Bodega activa'}`}
          onClose={() => setMapKey('')}
          footer={
            <>
              <Btn onClick={() => setMapKey('')}>Cerrar</Btn>
              <Btn
                variant="primary"
                icon="check"
                onClick={() => {
                  if (mapFocus) patch(mapRow.key, { loc: mapFocus });
                  setMapKey('');
                }}
              >
                Usar esta ubicación
              </Btn>
            </>
          }
        >
          <div className="reception-map-modal">
            <WarehouseEmbed
              key={mapFocus}
              compact
              mapOnly
              height={500}
              title={`Bodega · ${mapFocus}`}
              focusLoc={mapFocus}
              mode="plan"
              onSelectLoc={(loc) => setMapPick(loc)}
            />
            <p className="reception-map-selected">
              Seleccionada: <strong>{mapFocus}</strong>
              {mapRow.options.some((s) => s.id === mapFocus) ? <em> · sugerida para este ingreso</em> : null}
            </p>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
