import { useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAppState } from '../../shared/hooks/AppStateProvider';
import { api } from '../../shared/api/client';
import {
  available,
  client,
  creditAvailable,
  creditLimitOf,
  creditUsed,
  money,
  orderValue,
  product,
} from '../../shared/lib/inventory';
import { Btn, Empty, PageHead } from '../../shared/components/ui';
import { Icon } from '../../shared/components/Icon';
import '../../styles/new-order.css';

type Line = { productId: string; qty: number };

const STEPS = [
  { id: 1, title: 'Cliente', desc: 'Datos y entrega' },
  { id: 2, title: 'Productos', desc: 'Artículos y cantidades' },
  { id: 3, title: 'Confirmar', desc: 'Revisión final' },
] as const;

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((t) => t[0]?.toUpperCase() ?? '')
    .join('');
}

export function NewOrderPage() {
  const { state, meta, applyResponse, toast } = useAppState();
  const navigate = useNavigate();
  const routeClient = (useLocation().state as { clientId?: string } | null)?.clientId;
  const [step, setStep] = useState(1);
  const [clientId, setClientId] = useState(routeClient ?? '');
  const [clientQuery, setClientQuery] = useState('');
  const [priority, setPriority] = useState('Normal');
  const [requestedDate, setRequestedDate] = useState('');
  const [lines, setLines] = useState<Line[]>([]);
  const [search, setSearch] = useState('');
  const [catalogMode, setCatalogMode] = useState<'products' | 'bundles'>('products');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [xmlBusy, setXmlBusy] = useState(false);
  const [error, setError] = useState('');
  const [xmlName, setXmlName] = useState('');
  const xmlInputRef = useRef<HTMLInputElement>(null);

  const selected = state && clientId ? client(state, clientId) : undefined;

  const clientMatches = useMemo(() => {
    if (!state) return [];
    const q = clientQuery.trim().toLowerCase();
    return state.clients.filter(
      (c) =>
        !q ||
        [c.name, c.contact, c.city, c.sector, c.type, c.id].join(' ').toLowerCase().includes(q),
    );
  }, [state, clientQuery]);

  const productResults = useMemo(() => {
    if (!state) return [];
    const q = search.trim().toLowerCase();
    return state.products
      .filter((p) => p.kind !== 'raw')
      .filter((p) => !q || (p.name + p.id + p.category).toLowerCase().includes(q))
      .sort(
        (a, b) => available(state, b.id) - available(state, a.id) || a.name.localeCompare(b.name),
      );
  }, [search, state]);

  const bundleResults = useMemo(() => {
    if (!meta) return [];
    const q = search.trim().toLowerCase();
    return meta.bundles.filter(
      (b) => !q || (b.name + b.id + b.description).toLowerCase().includes(q),
    );
  }, [search, meta]);

  if (!state || !meta) return null;

  const draft = { clientId, lines, priority };
  const total = orderValue(state, draft);
  const units = lines.reduce((n, l) => n + l.qty, 0);
  const limit = clientId ? creditLimitOf(state, clientId) : 0;
  const used = clientId ? creditUsed(state, clientId) : 0;
  const availableCredit = clientId ? creditAvailable(state, clientId) : 0;
  const remainingAfter = Math.max(0, availableCredit - total);

  const setQty = (productId: string, qty: number) => {
    const max = available(state, productId);
    const next = Math.max(0, Math.min(max, Math.round(qty)));
    if (next <= 0) {
      setLines((prev) => prev.filter((l) => l.productId !== productId));
      return;
    }
    setLines((prev) => {
      const ex = prev.find((l) => l.productId === productId);
      if (ex) return prev.map((l) => (l.productId === productId ? { ...l, qty: next } : l));
      return [...prev, { productId, qty: next }];
    });
  };

  const addProduct = (id: string) => {
    const avail = available(state, id);
    const current = lines.find((l) => l.productId === id)?.qty ?? 0;
    if (current >= avail) {
      toast('No hay más unidades disponibles.');
      return;
    }
    setQty(id, current + 1);
  };

  const addBundle = (bundleId: string) => {
    const b = meta.bundles.find((x) => x.id === bundleId);
    if (!b) return;
    for (const line of b.lines) {
      const current = lines.find((l) => l.productId === line.productId)?.qty ?? 0;
      if (current + line.qty > available(state, line.productId)) {
        toast('Stock insuficiente para el paquete.');
        return;
      }
    }
    setLines((prev) => {
      const next = prev.map((l) => ({ ...l }));
      for (const line of b.lines) {
        const ex = next.find((l) => l.productId === line.productId);
        if (ex) ex.qty += line.qty;
        else next.push({ ...line });
      }
      return next;
    });
    toast(`${b.name} añadido.`);
  };

  const goProducts = () => {
    if (!clientId) {
      toast('Selecciona un cliente.');
      return;
    }
    setStep(2);
  };

  const goConfirm = () => {
    if (!lines.length) {
      toast('Agrega al menos un producto.');
      return;
    }
    setStep(3);
  };

  const confirm = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const noteParts = [
        notes.trim(),
        requestedDate ? `Fecha solicitada: ${requestedDate}` : '',
      ].filter(Boolean);
      applyResponse(
        await api.createOrder({
          clientId,
          lines,
          priority,
          notes: noteParts.join(' · ') || undefined,
        }),
      );
      toast('Pedido creado y listo para preparar.');
      navigate('/pedidos');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setBusy(false);
    }
  };

  const importXml = async (file: File) => {
    if (xmlBusy) return;
    if (
      !file.name.toLowerCase().endsWith('.xml') &&
      file.type !== 'text/xml' &&
      file.type !== 'application/xml'
    ) {
      toast('Selecciona un archivo .xml de factura.');
      return;
    }
    setXmlBusy(true);
    setError('');
    setXmlName(file.name);
    try {
      const xml = await file.text();
      const res = await api.importOrderXml(xml);
      applyResponse(res);
      const created = res.import.productsCreated.length;
      const clientMsg = res.import.clientCreated ? 'cliente nuevo' : 'cliente existente';
      const via = res.import.source === 'openai' ? 'IA' : 'parser local';
      toast(
        `${res.import.orderId} · ${via} · ${clientMsg} · ${created} producto(s) nuevo(s) · ${res.import.invoice.docNumber}`,
      );
      navigate('/pedidos');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo importar el XML');
    } finally {
      setXmlBusy(false);
      if (xmlInputRef.current) xmlInputRef.current.value = '';
    }
  };

  const stepTitle =
    step === 1
      ? 'Selecciona el cliente y el punto de entrega.'
      : step === 2
        ? 'Añade artículos con stock disponible.'
        : 'Revisa el pedido antes de confirmar.';

  return (
    <div className="no-page no-page-v2">
      <PageHead
        eyebrow="Pedidos"
        title="Nuevo pedido"
        desc={stepTitle}
        actions={
          <>
            <Btn icon="back" onClick={() => navigate('/pedidos')}>
              Volver a pedidos
            </Btn>
            <input
              ref={xmlInputRef}
              type="file"
              accept=".xml,text/xml,application/xml"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void importXml(f);
              }}
            />
            <Btn icon="file" disabled={xmlBusy} onClick={() => xmlInputRef.current?.click()}>
              {xmlBusy ? 'Importando…' : 'Importar XML'}
            </Btn>
          </>
        }
      />

      {xmlName ? <p className="no-xml-file">Archivo: {xmlName}</p> : null}
      {error && step === 1 ? <div className="form-error visible">{error}</div> : null}

      <nav className="no-steps" aria-label="Pasos del pedido">
        {STEPS.map((s) => {
          const done = step > s.id;
          const current = step === s.id;
          return (
            <button
              key={s.id}
              type="button"
              className={current ? 'is-current' : done ? 'is-done' : ''}
              disabled={!done && !current}
              onClick={() => done && setStep(s.id)}
            >
              <b>{done ? '✓' : s.id}</b>
              <span>
                <strong>{s.title}</strong>
                <small>{s.desc}</small>
              </span>
            </button>
          );
        })}
      </nav>

      <div className="no-layout">
        <div className="no-main">
          {step === 1 ? (
            <>
              <section className="no-card">
                <header className="no-card-head">
                  <h2>Cliente</h2>
                  <button type="button" className="no-link" onClick={() => navigate('/clientes')}>
                    <Icon name="plus" /> Nuevo cliente
                  </button>
                </header>

                <label className="no-search-field">
                  <Icon name="search" />
                  <input
                    value={clientQuery || selected?.name || ''}
                    onChange={(e) => {
                      setClientQuery(e.target.value);
                      if (clientId) setClientId('');
                    }}
                    onFocus={() => {
                      if (selected) setClientQuery(selected.name);
                    }}
                    placeholder="Buscar cliente por nombre o contacto…"
                    aria-label="Buscar cliente"
                  />
                </label>

                {!clientId && clientQuery ? (
                  <ul className="no-client-results">
                    {clientMatches.length ? (
                      clientMatches.slice(0, 8).map((c) => (
                        <li key={c.id}>
                          <button
                            type="button"
                            onClick={() => {
                              setClientId(c.id);
                              setClientQuery('');
                            }}
                          >
                            <span className="no-avatar">{initials(c.name)}</span>
                            <span>
                              <strong>{c.name}</strong>
                              <small>
                                {c.type}
                                {c.city ? ` · ${c.city}` : ''}
                              </small>
                            </span>
                          </button>
                        </li>
                      ))
                    ) : (
                      <li className="no-empty-inline">Sin coincidencias</li>
                    )}
                  </ul>
                ) : null}

                {selected ? (
                  <div className="no-selected-client">
                    <span className="no-avatar">{initials(selected.name)}</span>
                    <div>
                      <strong>{selected.name}</strong>
                      <small>
                        {selected.type}
                        {selected.city ? ` · ${selected.city}` : ''}
                      </small>
                    </div>
                    <em>
                      <Icon name="check" /> Seleccionado
                    </em>
                  </div>
                ) : (
                  <p className="no-hint">Escribe para buscar y seleccionar un cliente.</p>
                )}
              </section>

              <section className="no-card">
                <header className="no-card-head">
                  <h2>Entrega</h2>
                  {selected ? (
                    <button type="button" className="no-link" onClick={() => navigate('/clientes')}>
                      <Icon name="edit" /> Editar dirección
                    </button>
                  ) : null}
                </header>

                <label className="field">
                  <span>Dirección de entrega</span>
                  <select
                    value={selected?.address ?? ''}
                    disabled={!selected}
                    onChange={() => undefined}
                  >
                    {selected ? (
                      <option value={selected.address}>{selected.address}</option>
                    ) : (
                      <option value="">Selecciona un cliente</option>
                    )}
                  </select>
                </label>

                <div className="no-info-grid">
                  <div>
                    <span>Ciudad</span>
                    <strong>{selected?.city || '—'}</strong>
                  </div>
                  <div>
                    <span>Sector</span>
                    <strong>{selected?.sector || selected?.type || '—'}</strong>
                  </div>
                  <div>
                    <span>Contacto</span>
                    <strong>{selected?.contact || '—'}</strong>
                  </div>
                </div>

                <div className="field">
                  <span>Prioridad</span>
                  <div className="no-priority" role="group" aria-label="Prioridad">
                    <button
                      type="button"
                      className={priority === 'Normal' ? 'is-active' : ''}
                      onClick={() => setPriority('Normal')}
                    >
                      Normal
                    </button>
                    <button
                      type="button"
                      className={`is-high ${priority === 'Alta' ? 'is-active' : ''}`}
                      onClick={() => setPriority('Alta')}
                    >
                      Alta
                    </button>
                  </div>
                </div>

                <label className="field">
                  <span>Fecha solicitada (opcional)</span>
                  <input
                    type="date"
                    value={requestedDate}
                    onChange={(e) => setRequestedDate(e.target.value)}
                  />
                </label>

                <label className="field">
                  <span>Notas de entrega (opcional)</span>
                  <textarea
                    rows={3}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Añade indicaciones para la entrega…"
                  />
                </label>
              </section>
            </>
          ) : null}

          {step === 2 ? (
            <section className="no-card">
              <header className="no-card-head">
                <h2>Productos</h2>
              </header>
              <div className="no-toolbar">
                <label className="no-search-field grow">
                  <Icon name="search" />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Buscar producto, código o categoría…"
                    aria-label="Buscar productos"
                  />
                </label>
                <div className="segmented">
                  <button
                    type="button"
                    className={catalogMode === 'products' ? 'active' : ''}
                    onClick={() => setCatalogMode('products')}
                  >
                    Productos
                  </button>
                  <button
                    type="button"
                    className={catalogMode === 'bundles' ? 'active' : ''}
                    onClick={() => setCatalogMode('bundles')}
                  >
                    Paquetes
                  </button>
                </div>
              </div>

              <div className="no-catalog">
                {catalogMode === 'products'
                  ? productResults.map((p) => {
                      const stock = available(state, p.id);
                      return (
                        <button
                          key={p.id}
                          type="button"
                          className="no-product"
                          disabled={stock <= 0}
                          onClick={() => addProduct(p.id)}
                        >
                          <span>
                            <strong>{p.name}</strong>
                            <small>
                              {p.id} · {p.category} · stock {stock}
                            </small>
                          </span>
                          <em>{money(p.price)}</em>
                        </button>
                      );
                    })
                  : bundleResults.map((b) => (
                      <button
                        key={b.id}
                        type="button"
                        className="no-product"
                        onClick={() => addBundle(b.id)}
                      >
                        <span>
                          <strong>{b.name}</strong>
                          <small>{b.description}</small>
                        </span>
                        <em>
                          <Icon name="plus" />
                        </em>
                      </button>
                    ))}
              </div>

              {!productResults.length && catalogMode === 'products' ? (
                <Empty title="Sin resultados" desc="Prueba otro término de búsqueda." />
              ) : null}
            </section>
          ) : null}

          {step === 3 ? (
            <section className="no-card">
              <header className="no-card-head">
                <h2>Confirmar pedido</h2>
              </header>
              <p className="no-hint">Revisa líneas y total antes de crear el pedido.</p>
              <ul className="no-confirm-lines">
                {lines.map((l) => {
                  const p = product(state, l.productId);
                  return (
                    <li key={l.productId}>
                      <div>
                        <strong>
                          {p?.name ?? l.productId} × {l.qty}
                        </strong>
                        <small>{l.productId}</small>
                      </div>
                      <span>{money((p?.price ?? 0) * l.qty)}</span>
                    </li>
                  );
                })}
              </ul>
              {selected ? (
                <div className="no-confirm-meta">
                  <div>
                    <span>Cliente</span>
                    <strong>{selected.name}</strong>
                  </div>
                  <div>
                    <span>Entrega</span>
                    <strong>{selected.address}</strong>
                  </div>
                  <div>
                    <span>Prioridad</span>
                    <strong>{priority}</strong>
                  </div>
                  {requestedDate ? (
                    <div>
                      <span>Fecha solicitada</span>
                      <strong>{requestedDate}</strong>
                    </div>
                  ) : null}
                  {notes ? (
                    <div>
                      <span>Notas</span>
                      <strong>{notes}</strong>
                    </div>
                  ) : null}
                </div>
              ) : null}
              {error ? <div className="form-error visible">{error}</div> : null}
            </section>
          ) : null}
        </div>

        <aside className="no-side-col" aria-label="Resumen del pedido">
          <section className="no-card no-credit-card">
            <h3>Crédito del cliente</h3>
            {selected ? (
              <>
                <p className="no-credit-name">{selected.name}</p>
                <div className="no-credit-available">
                  <strong>{money(availableCredit)}</strong>
                  <span>Cupo disponible</span>
                </div>
                <dl className="no-credit-dl">
                  <div>
                    <dt>Límite asignado</dt>
                    <dd>{money(limit)}</dd>
                  </div>
                  <div>
                    <dt>Comprometido</dt>
                    <dd>{money(used)}</dd>
                  </div>
                </dl>
                <small className="no-credit-note">Comprometido en pedidos abiertos</small>
                {total > 0 ? (
                  <p className="no-credit-after">
                    Tras este pedido quedarían <strong>{money(remainingAfter)}</strong>
                  </p>
                ) : null}
              </>
            ) : (
              <p className="no-hint">Selecciona un cliente para ver su cupo.</p>
            )}
          </section>

          <section className="no-card no-summary-card">
            <h3>Resumen del pedido</h3>
            {lines.length ? (
              <>
                <ul className="no-lines">
                  {lines.map((l) => {
                    const p = product(state, l.productId);
                    const max = available(state, l.productId);
                    return (
                      <li key={l.productId} className="no-line">
                        <div>
                          <strong>{p?.name ?? l.productId}</strong>
                          <small>
                            {money(p?.price ?? 0)} · máx {max}
                          </small>
                        </div>
                        {step === 2 ? (
                          <div className="no-qty">
                            <button
                              type="button"
                              aria-label="Menos"
                              onClick={() => setQty(l.productId, l.qty - 1)}
                            >
                              −
                            </button>
                            <input
                              type="number"
                              min={1}
                              max={max}
                              value={l.qty}
                              onChange={(e) => setQty(l.productId, Number(e.target.value))}
                            />
                            <button
                              type="button"
                              aria-label="Más"
                              onClick={() => setQty(l.productId, l.qty + 1)}
                            >
                              +
                            </button>
                          </div>
                        ) : (
                          <strong>× {l.qty}</strong>
                        )}
                      </li>
                    );
                  })}
                </ul>
                <div className="no-total">
                  <span>
                    {lines.length} ítems · {units} u.
                  </span>
                  <strong>{money(total)}</strong>
                </div>
              </>
            ) : (
              <div className="no-summary-empty">
                <Icon name="box" />
                <p>Aún no hay productos. El total se calculará al añadir artículos.</p>
              </div>
            )}
          </section>
        </aside>
      </div>

      <footer className="no-footer">
        <span className="no-step-label">
          Paso {step} de {STEPS.length}
        </span>
        <div className="no-footer-actions">
          {step === 1 ? (
            <>
              <Btn
                onClick={() =>
                  toast('Borrador local: continúa cuando quieras. Aún no se guarda en servidor.')
                }
              >
                Guardar borrador
              </Btn>
              <Btn variant="primary" icon="arrow" onClick={goProducts}>
                Continuar a productos
              </Btn>
            </>
          ) : null}
          {step === 2 ? (
            <>
              <Btn icon="back" onClick={() => setStep(1)}>
                Atrás
              </Btn>
              <Btn variant="primary" icon="arrow" onClick={goConfirm}>
                Continuar a confirmar
              </Btn>
            </>
          ) : null}
          {step === 3 ? (
            <>
              <Btn icon="back" onClick={() => setStep(2)}>
                Atrás
              </Btn>
              <Btn
                variant="primary"
                icon="check"
                disabled={busy || !lines.length}
                onClick={() => void confirm()}
              >
                {busy ? 'Creando…' : 'Confirmar pedido'}
              </Btn>
            </>
          ) : null}
        </div>
      </footer>
    </div>
  );
}
