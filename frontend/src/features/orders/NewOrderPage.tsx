import { useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAppState } from '../../shared/hooks/AppStateProvider';
import { api } from '../../shared/api/client';
import {
  available,
  client,
  creditAvailable,
  creditLimitOf,
  money,
  orderValue,
  product,
} from '../../shared/lib/inventory';
import { Btn, Empty, PageHead } from '../../shared/components/ui';
import { Icon } from '../../shared/components/Icon';
import '../../styles/new-order.css';

type Line = { productId: string; qty: number };

const STEPS = [
  { id: 1, title: 'Cliente', desc: 'Destino y prioridad' },
  { id: 2, title: 'Productos', desc: 'Catálogo y cantidades' },
  { id: 3, title: 'Confirmar', desc: 'Revisión final' },
] as const;

export function NewOrderPage() {
  const { state, meta, applyResponse, toast } = useAppState();
  const navigate = useNavigate();
  const routeClient = (useLocation().state as { clientId?: string } | null)?.clientId;
  const [step, setStep] = useState(1);
  const [clientId, setClientId] = useState(routeClient ?? 'CL001');
  const [priority, setPriority] = useState('Normal');
  const [lines, setLines] = useState<Line[]>([]);
  const [search, setSearch] = useState('');
  const [catalogMode, setCatalogMode] = useState<'products' | 'bundles'>('products');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [xmlBusy, setXmlBusy] = useState(false);
  const [error, setError] = useState('');
  const [xmlName, setXmlName] = useState('');
  const xmlInputRef = useRef<HTMLInputElement>(null);

  if (!state || !meta) return null;

  const selected = client(state, clientId);
  const draft = { clientId, lines, priority };
  const total = orderValue(state, draft);
  const units = lines.reduce((n, l) => n + l.qty, 0);

  const productResults = useMemo(() => {
    const q = search.trim().toLowerCase();
    return state.products
      .filter((p) => p.kind !== 'raw')
      .filter((p) => !q || (p.name + p.id + p.category).toLowerCase().includes(q))
      .sort((a, b) => available(state, b.id) - available(state, a.id) || a.name.localeCompare(b.name));
  }, [search, state]);

  const bundleResults = useMemo(() => {
    const q = search.trim().toLowerCase();
    return meta.bundles.filter((b) => !q || (b.name + b.id + b.description).toLowerCase().includes(q));
  }, [search, meta.bundles]);

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
      applyResponse(await api.createOrder({ clientId, lines, priority, notes: notes.trim() || undefined }));
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
    if (!file.name.toLowerCase().endsWith('.xml') && file.type !== 'text/xml' && file.type !== 'application/xml') {
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

  return (
    <div className="no-page">
      <PageHead
        eyebrow="Gestión de pedidos"
        title="Nuevo pedido"
        desc="Elige cliente, arma el pedido con stock real, o importa una factura XML."
        actions={
          <Btn icon="back" onClick={() => navigate('/pedidos')}>
            Volver a pedidos
          </Btn>
        }
      />

      <section className="no-xml-card" aria-label="Importar factura XML">
        <div>
          <strong>Importar factura XML</strong>
          <p>
            Acepta cualquier XML de factura (SRI u otros formatos). La IA interpreta el documento, crea cliente y
            productos si faltan, y genera el pedido.
          </p>
          {xmlName ? <small>Archivo: {xmlName}</small> : null}
          {error && step === 1 ? <div className="form-error visible">{error}</div> : null}
        </div>
        <div className="no-xml-actions">
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
          <Btn
            variant="primary"
            icon="file"
            disabled={xmlBusy}
            onClick={() => xmlInputRef.current?.click()}
          >
            {xmlBusy ? 'Leyendo con IA…' : 'Subir XML'}
          </Btn>
        </div>
      </section>

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
        <div>
          {step === 1 ? (
            <section className="no-panel">
              <h2>¿Para quién es el pedido?</h2>
              <p className="subtle">Selecciona el cliente. La ciudad y el sector se usan después en logística.</p>

              <div className="no-client-grid">
                {state.clients.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className={`no-client-card ${clientId === c.id ? 'is-active' : ''}`}
                    onClick={() => setClientId(c.id)}
                  >
                    <strong>{c.name}</strong>
                    <small>
                      {c.city ?? '—'} · {c.sector ?? c.type}
                    </small>
                    <small>{c.address}</small>
                    <small>
                      Crédito {money(creditLimitOf(state, c.id))} · disp.{' '}
                      {money(creditAvailable(state, c.id))}
                    </small>
                  </button>
                ))}
              </div>

              <label className="field">
                <span>Prioridad</span>
                <div className="no-priority">
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
              </label>

              {selected ? (
                <div className="no-delivery">
                  <span>Punto de entrega</span>
                  <strong>{selected.address}</strong>
                  <p>
                    {selected.contact} · {selected.city}
                    {selected.sector ? ` · ${selected.sector}` : ''}
                  </p>
                </div>
              ) : null}

              <div className="no-actions">
                <Btn variant="primary" icon="arrow" onClick={goProducts}>
                  Continuar a productos
                </Btn>
              </div>
            </section>
          ) : null}

          {step === 2 ? (
            <section className="no-panel">
              <h2>Agregar productos</h2>
              <p className="subtle">Solo se listan terminados con stock. Ajusta cantidades en el carrito.</p>

              <div className="no-toolbar">
                <label className="no-search">
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
                      <button key={b.id} type="button" className="no-product" onClick={() => addBundle(b.id)}>
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

              <div className="no-actions">
                <Btn icon="back" onClick={() => setStep(1)}>
                  Atrás
                </Btn>
                <Btn variant="primary" icon="arrow" onClick={goConfirm}>
                  Revisar pedido
                </Btn>
              </div>
            </section>
          ) : null}

          {step === 3 ? (
            <section className="no-panel">
              <h2>Confirmar pedido</h2>
              <p className="subtle">Revisa líneas y total antes de crear el pedido en operación.</p>

              <ul className="no-confirm-lines">
                {lines.map((l) => {
                  const p = product(state, l.productId);
                  return (
                    <li key={l.productId}>
                      <div>
                        <strong>
                          {p?.name ?? l.productId} × {l.qty}
                        </strong>
                        <small style={{ display: 'block', color: '#6b8298', marginTop: 2 }}>{l.productId}</small>
                      </div>
                      <span>{money((p?.price ?? 0) * l.qty)}</span>
                    </li>
                  );
                })}
              </ul>

              <label className="field">
                <span>Notas (opcional)</span>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Horario de recepción, contacto, etc."
                />
              </label>

              {error ? <div className="form-error visible">{error}</div> : null}

              <div className="no-actions">
                <Btn icon="back" onClick={() => setStep(2)}>
                  Atrás
                </Btn>
                <Btn variant="primary" icon="check" disabled={busy || !lines.length} onClick={() => void confirm()}>
                  {busy ? 'Creando…' : 'Confirmar pedido'}
                </Btn>
              </div>
            </section>
          ) : null}
        </div>

        <aside className="no-panel no-side" aria-label="Resumen del pedido">
          <h3>Resumen</h3>
          <div className="no-side-meta">
            <div>
              <span>Cliente</span>
              <strong>{selected?.name ?? '—'}</strong>
            </div>
            <div>
              <span>Ciudad</span>
              <strong>
                {selected?.city ?? '—'}
                {selected?.sector ? ` · ${selected.sector}` : ''}
              </strong>
            </div>
            <div>
              <span>Prioridad</span>
              <strong>{priority}</strong>
            </div>
            <div>
              <span>Ítems</span>
              <strong>
                {lines.length} · {units} u.
              </strong>
            </div>
          </div>

          {lines.length ? (
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
                        <button type="button" aria-label="Menos" onClick={() => setQty(l.productId, l.qty - 1)}>
                          −
                        </button>
                        <input
                          type="number"
                          min={1}
                          max={max}
                          value={l.qty}
                          onChange={(e) => setQty(l.productId, Number(e.target.value))}
                        />
                        <button type="button" aria-label="Más" onClick={() => setQty(l.productId, l.qty + 1)}>
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
          ) : (
            <p className="subtle">Aún no hay productos en el pedido.</p>
          )}

          <div className="no-total">
            <span>Total estimado</span>
            <strong>{money(total)}</strong>
          </div>
        </aside>
      </div>
    </div>
  );
}
