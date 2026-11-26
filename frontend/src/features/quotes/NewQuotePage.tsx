import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppState } from '../../shared/hooks/AppStateProvider';
import { api } from '../../shared/api/client';
import { money, product } from '../../shared/lib/inventory';
import { Btn, PageHead } from '../../shared/components/ui';
import { Icon } from '../../shared/components/Icon';
import { Modal, ModalActions } from '../../shared/components/Modal';
import { Select } from '../../shared/components/Select';
import type { SalesChannel } from '../../shared/types';
import { clientHasMargin, effectiveQuoteMargin, quoteUnitPrice } from './quotePricing';
import { ActionBar } from '../../shared/components/ActionBar';
import '../../styles/quotes.css';

const IVA_DEFAULT = 0.15;

const channels: Array<{ id: SalesChannel; label: string }> = [
  { id: 'ejecutivo', label: 'Ejecutivo' },
  { id: 'portal', label: 'Portal' },
  { id: 'reposicion', label: 'Reposición' },
];

type Line = {
  productId: string;
  qty: number;
  unitPrice: number;
  /** true = el usuario escribió el PVP a mano; no se recalcula con margen/PVP. */
  priceManual?: boolean;
};

function todayPlus(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function formatLongDate(iso: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const [y, m, day] = iso.split('-').map(Number);
  return new Date(y, m - 1, day).toLocaleDateString('es-EC', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function round2(n: number) {
  return Math.round(Math.max(0, n) * 100) / 100;
}

export function NewQuotePage() {
  const { state, applyResponse, toast } = useAppState();
  const navigate = useNavigate();

  const [clientId, setClientId] = useState('');
  const [validUntil, setValidUntil] = useState(todayPlus(7));
  const [channel, setChannel] = useState<SalesChannel>('ejecutivo');
  const [note, setNote] = useState('');
  const [discount, setDiscount] = useState(0);
  /** Margen de esta cotización; al elegir cliente se carga el del cliente. */
  const [marginPct, setMarginPct] = useState<number | null>(null);
  const [marginDirty, setMarginDirty] = useState(false);
  const [lines, setLines] = useState<Line[]>([]);
  const [search, setSearch] = useState('');
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [previewOpen, setPreviewOpen] = useState(false);
  const [clientOpen, setClientOpen] = useState(false);
  const [clientError, setClientError] = useState('');
  const [clientBusy, setClientBusy] = useState(false);

  const catalog = useMemo(() => {
    if (!state) return [];
    const q = search.trim().toLowerCase();
    return state.products
      .filter((item) => item.kind !== 'raw')
      .filter((item) => !q || `${item.name} ${item.id} ${item.sku}`.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, 40);
  }, [state, search]);

  const totals = useMemo(() => {
    if (!state) return { subtotal: 0, discount: 0, tax: 0, total: 0, units: 0, count: 0 };
    let subtotal = 0;
    let tax = 0;
    let units = 0;
    for (const line of lines) {
      const item = product(state, line.productId);
      const lineSub = line.qty * line.unitPrice;
      const rate = item?.ivaRate != null ? item.ivaRate : IVA_DEFAULT;
      subtotal += lineSub;
      tax += lineSub * rate;
      units += line.qty;
    }
    const disc = Math.min(round2(discount), round2(subtotal));
    const taxableShare = subtotal > 0 ? (subtotal - disc) / subtotal : 1;
    const taxAfter = round2(tax * taxableShare);
    return {
      subtotal: round2(subtotal),
      discount: disc,
      tax: taxAfter,
      total: round2(subtotal - disc + taxAfter),
      units,
      count: lines.length,
    };
  }, [state, lines, discount]);

  if (!state) return null;

  const selectedClient = state.clients.find((c) => c.id === clientId);
  const activeMargin = effectiveQuoteMargin(selectedClient, marginPct);
  const pricingByMargin = activeMargin != null;
  const channelLabel = channels.find((c) => c.id === channel)?.label ?? channel;

  const repriceLines = (nextMargin: number | null) => {
    setLines((prev) =>
      prev.map((line) =>
        line.priceManual
          ? line
          : {
              ...line,
              unitPrice: quoteUnitPrice(product(state, line.productId), nextMargin),
            },
      ),
    );
  };

  const selectClient = (nextId: string) => {
    setClientId(nextId);
    const buyer = state.clients.find((c) => c.id === nextId);
    const nextMargin = clientHasMargin(buyer) ? buyer!.marginPct! : null;
    setMarginPct(nextMargin);
    setMarginDirty(false);
    repriceLines(nextMargin);
  };

  const changeMargin = (raw: string) => {
    if (raw.trim() === '') {
      setMarginPct(null);
      setMarginDirty(true);
      repriceLines(null);
      return;
    }
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) return;
    const next = Math.round(n * 100) / 100;
    setMarginPct(next);
    setMarginDirty(true);
    repriceLines(next);
  };

  const persistClientMargin = async () => {
    if (!clientId || busy) return;
    setBusy(true);
    setError('');
    try {
      applyResponse(await api.updateClient(clientId, { marginPct }));
      toast(
        marginPct == null
          ? 'Margen del cliente quitado; se usará el PVP.'
          : `Margen del cliente guardado: ${marginPct}%.`,
      );
      setMarginDirty(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar el margen del cliente.');
    } finally {
      setBusy(false);
    }
  };

  const addProduct = (productId: string) => {
    const item = product(state, productId);
    if (!item) return;
    const unitPrice = quoteUnitPrice(item, activeMargin);
    setLines((prev) => {
      const existing = prev.find((line) => line.productId === productId);
      if (existing) {
        return prev.map((line) =>
          line.productId === productId ? { ...line, qty: line.qty + 1 } : line,
        );
      }
      return [...prev, { productId, qty: 1, unitPrice, priceManual: false }];
    });
    setSearch('');
    setCatalogOpen(false);
  };

  const patchLine = (productId: string, patch: Partial<Line>) => {
    setLines((prev) =>
      prev
        .map((line) => (line.productId === productId ? { ...line, ...patch } : line))
        .filter((line) => line.qty > 0),
    );
  };

  const setManualPrice = (productId: string, raw: string) => {
    const unitPrice = Math.max(0, Number(raw) || 0);
    patchLine(productId, { unitPrice, priceManual: true });
  };

  const resetAutoPrice = (productId: string) => {
    const item = product(state, productId);
    patchLine(productId, {
      unitPrice: quoteUnitPrice(item, activeMargin),
      priceManual: false,
    });
  };

  const save = async () => {
    if (busy) return;
    if (!clientId) {
      setError('Selecciona un cliente.');
      return;
    }
    if (!lines.length) {
      setError('Agrega al menos un producto.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      applyResponse(
        await api.addQuote({
          clientId,
          validUntil,
          channel,
          note,
          discount: totals.discount,
          lines: lines.map(({ productId, qty, unitPrice }) => ({ productId, qty, unitPrice })),
        }),
      );
      toast('Cotización guardada.');
      navigate('/cotizaciones');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar.');
    } finally {
      setBusy(false);
    }
  };

  const createClient = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (clientBusy) return;
    setClientBusy(true);
    setClientError('');
    const data = Object.fromEntries(new FormData(event.currentTarget));
    try {
      const res = await api.addClient(data);
      applyResponse(res);
      const created =
        res.state.clients.find((c) => c.name === String(data.name ?? '').trim()) ??
        res.state.clients.at(-1);
      if (created) selectClient(created.id);
      toast('Cliente registrado.');
      setClientOpen(false);
    } catch (err) {
      setClientError(err instanceof Error ? err.message : 'No se pudo crear el cliente.');
    } finally {
      setClientBusy(false);
    }
  };

  return (
    <div className="nq-page">
      <PageHead
        eyebrow="Cotizaciones"
        title="Nueva cotización"
        desc="Selecciona el cliente y agrega los productos."
        actions={<span className="nq-badge">Borrador</span>}
      />

      {error ? <div className="form-error visible">{error}</div> : null}

      <div className="nq-layout">
        <div className="nq-main">
          <section className="nq-panel">
            <h2>Datos de la cotización</h2>
            <div className="nq-grid">
              <div className="field full">
                <label htmlFor="nq-client">Cliente</label>
                <div className="nq-client-row">
                  <Select
                    id="nq-client"
                    value={clientId}
                    required
                    onChange={(event) => selectClient(event.target.value)}
                  >
                    <option value="" disabled>
                      Selecciona un cliente…
                    </option>
                    {state.clients.map((client) => (
                      <option key={client.id} value={client.id}>
                        {client.name}
                        {clientHasMargin(client) ? ` · ${client.marginPct}%` : ''}
                      </option>
                    ))}
                  </Select>
                  <Btn type="button" icon="plus" onClick={() => setClientOpen(true)}>
                    Cliente
                  </Btn>
                </div>
              </div>
              <div className="field">
                <label htmlFor="nq-until">Válida hasta</label>
                <input
                  id="nq-until"
                  type="date"
                  required
                  min={new Date().toISOString().slice(0, 10)}
                  value={validUntil}
                  onChange={(event) => setValidUntil(event.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="nq-channel">Canal</label>
                <Select
                  id="nq-channel"
                  value={channel}
                  onChange={(event) => setChannel(event.target.value as SalesChannel)}
                >
                  {channels.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="field">
                <label htmlFor="nq-margin">Margen del cliente (%)</label>
                <div className="nq-client-row">
                  <input
                    id="nq-margin"
                    type="number"
                    min={0}
                    max={1000}
                    step={0.1}
                    placeholder="Vacío = usar PVP"
                    value={marginPct ?? ''}
                    disabled={!clientId}
                    onChange={(event) => changeMargin(event.target.value)}
                  />
                  <Btn
                    type="button"
                    disabled={!clientId || !marginDirty || busy}
                    onClick={() => void persistClientMargin()}
                  >
                    Guardar en cliente
                  </Btn>
                </div>
                <small className="nq-hint">
                  Prioridad: PVP manual del usuario → margen del cliente → PVP del producto.
                  {pricingByMargin
                    ? ` Sin edición manual se aplica costo × (1 + ${activeMargin}%).`
                    : ' Sin margen ni edición manual se usa el PVP del catálogo.'}
                </small>
              </div>
            </div>
          </section>

          <section className="nq-panel">
            <h2>Productos</h2>
            <div className="nq-products-toolbar">
              <div className="field" style={{ margin: 0 }}>
                <label htmlFor="nq-search" className="sr-only">
                  Buscar producto
                </label>
                <input
                  id="nq-search"
                  placeholder="Buscar producto por nombre o código"
                  value={search}
                  onChange={(event) => {
                    setSearch(event.target.value);
                    setCatalogOpen(true);
                  }}
                  onFocus={() => setCatalogOpen(true)}
                />
              </div>
              <Btn
                type="button"
                icon="plus"
                onClick={() => {
                  setCatalogOpen(true);
                  document.getElementById('nq-search')?.focus();
                }}
              >
                Agregar producto
              </Btn>
            </div>

            {catalogOpen && search.trim() ? (
              <div className="nq-catalog" role="listbox" aria-label="Resultados de productos">
                {catalog.length ? (
                  catalog.map((item) => (
                    <button key={item.id} type="button" onClick={() => addProduct(item.id)}>
                      <span>
                        <strong>{item.name}</strong>
                        <span>{item.sku || item.id}</span>
                      </span>
                      <b className="nq-money">{money(quoteUnitPrice(item, activeMargin))}</b>
                    </button>
                  ))
                ) : (
                  <p className="subtle" style={{ padding: 12, margin: 0 }}>
                    Sin coincidencias.
                  </p>
                )}
              </div>
            ) : null}

            {lines.length ? (
              <>
                <div className="nq-table-wrap">
                  <table className="nq-table">
                    <thead>
                      <tr>
                        <th>Producto</th>
                        <th>Cantidad</th>
                        <th>
                          PVP / precio <small>editable</small>
                        </th>
                        <th>Subtotal</th>
                        <th aria-label="Quitar" />
                      </tr>
                    </thead>
                    <tbody>
                      {lines.map((line) => {
                        const item = product(state, line.productId);
                        const autoPrice = quoteUnitPrice(item, activeMargin);
                        return (
                          <tr key={line.productId}>
                            <td className="nq-product">
                              <strong>{item?.name ?? line.productId}</strong>
                              <span>{item?.sku || item?.id || line.productId}</span>
                            </td>
                            <td>
                              <div className="nq-qty">
                                <button
                                  type="button"
                                  aria-label="Menos"
                                  onClick={() => patchLine(line.productId, { qty: line.qty - 1 })}
                                >
                                  −
                                </button>
                                <input
                                  type="number"
                                  min={1}
                                  value={line.qty}
                                  aria-label={`Cantidad de ${item?.name ?? line.productId}`}
                                  onChange={(event) =>
                                    patchLine(line.productId, {
                                      qty: Math.max(1, Math.round(Number(event.target.value) || 1)),
                                    })
                                  }
                                />
                                <button
                                  type="button"
                                  aria-label="Más"
                                  onClick={() => patchLine(line.productId, { qty: line.qty + 1 })}
                                >
                                  +
                                </button>
                              </div>
                            </td>
                            <td className="nq-price">
                              <div className={`nq-price-cell${line.priceManual ? ' is-manual' : ''}`}>
                                <input
                                  type="number"
                                  min={0}
                                  step="0.01"
                                  value={line.unitPrice}
                                  aria-label={`Precio de ${item?.name ?? line.productId}`}
                                  onChange={(event) => setManualPrice(line.productId, event.target.value)}
                                />
                                {line.priceManual ? (
                                  <button
                                    type="button"
                                    className="nq-price-reset"
                                    title={`Volver al automático (${money(autoPrice)})`}
                                    onClick={() => resetAutoPrice(line.productId)}
                                  >
                                    Auto
                                  </button>
                                ) : (
                                  <span className="nq-price-source" title={pricingByMargin ? 'Desde margen del cliente' : 'Desde PVP del producto'}>
                                    {pricingByMargin ? 'Margen' : 'PVP'}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="nq-money">{money(line.qty * line.unitPrice)}</td>
                            <td>
                              <button
                                type="button"
                                className="nq-remove"
                                aria-label={`Quitar ${item?.name ?? line.productId}`}
                                onClick={() =>
                                  setLines((prev) => prev.filter((l) => l.productId !== line.productId))
                                }
                              >
                                <Icon name="trash" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <p className="nq-lines-foot">
                  {totals.count} {totals.count === 1 ? 'producto' : 'productos'} · {totals.units}{' '}
                  {totals.units === 1 ? 'unidad' : 'unidades'}
                </p>
              </>
            ) : (
              <p className="subtle" style={{ margin: '8px 0 0' }}>
                Busca y agrega productos para armar la oferta.
              </p>
            )}
          </section>

          <section className="nq-panel nq-notes">
            <h2>Notas y condiciones</h2>
            <div className="field" style={{ margin: 0 }}>
              <label htmlFor="nq-note" className="sr-only">
                Notas
              </label>
              <textarea
                id="nq-note"
                placeholder="Agrega condiciones de pago, entrega u observaciones…"
                value={note}
                onChange={(event) => setNote(event.target.value)}
              />
            </div>
          </section>
        </div>

        <aside className="nq-side">
          <div className="nq-summary">
            <h2>Resumen</h2>
            <div className="nq-sum-row">
              <span>Subtotal</span>
              <b>{money(totals.subtotal)}</b>
            </div>
            <div className="nq-sum-row">
              <span>Descuento</span>
              <span className="nq-discount-edit">
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  aria-label="Descuento"
                  value={discount}
                  onChange={(event) => setDiscount(Math.max(0, Number(event.target.value) || 0))}
                />
              </span>
            </div>
            <div className="nq-sum-row">
              <span>
                Impuestos
                <span className="subtle">Según cada producto</span>
              </span>
              <b>{money(totals.tax)}</b>
            </div>
            <div className="nq-total">
              <strong>{money(totals.total)}</strong>
              <small>USD · Impuestos incluidos</small>
            </div>
            <div className="nq-meta">
              <span>
                Válida hasta <b>{formatLongDate(validUntil)}</b>
              </span>
              <span>
                Canal <b>{channelLabel}</b>
              </span>
              {selectedClient ? (
                <span>
                  Cliente <b>{selectedClient.name}</b>
                </span>
              ) : null}
              <span>
                Precio auto{' '}
                <b>{pricingByMargin ? `Margen ${activeMargin}%` : 'PVP producto'}</b>
              </span>
              {lines.some((line) => line.priceManual) ? (
                <span>
                  Manuales <b>{lines.filter((line) => line.priceManual).length}</b>
                </span>
              ) : null}
            </div>
            <div className="nq-info">
              <Icon name="info" />
              <span>
                Puedes cambiar el PVP por línea. Si no lo editas, se usa el margen del cliente; si no hay
                margen, el PVP del producto.
              </span>
            </div>
          </div>
        </aside>
      </div>

      <ActionBar
        info={
          lines.length
            ? `${totals.count} ${totals.count === 1 ? 'producto' : 'productos'} · ${money(totals.total)}`
            : 'Agrega productos para guardar la cotización'
        }
      >
        <Btn type="button" onClick={() => navigate('/cotizaciones')}>
          Cancelar
        </Btn>
        <Btn type="button" icon="file" disabled={!lines.length} onClick={() => setPreviewOpen(true)}>
          Vista previa
        </Btn>
        <Btn type="button" variant="primary" icon="check" disabled={busy} onClick={() => void save()}>
          {busy ? 'Guardando…' : 'Guardar cotización'}
        </Btn>
      </ActionBar>

      {previewOpen ? (
        <Modal
          title="Vista previa"
          subtitle={selectedClient?.name ?? 'Sin cliente'}
          onClose={() => setPreviewOpen(false)}
          footer={
            <>
              <Btn onClick={() => setPreviewOpen(false)}>Cerrar</Btn>
              <Btn variant="primary" icon="save" disabled={busy} onClick={() => void save()}>
                Guardar cotización
              </Btn>
            </>
          }
        >
          <div className="nq-preview">
            <p className="subtle" style={{ margin: 0 }}>
              Vigente hasta {formatLongDate(validUntil)} · Canal {channelLabel}
            </p>
            <table className="nq-preview-table">
              <thead>
                <tr>
                  <th>Producto</th>
                  <th>Cant.</th>
                  <th>P. unit.</th>
                  <th>Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line) => {
                  const item = product(state, line.productId);
                  return (
                    <tr key={line.productId}>
                      <td>{item?.name ?? line.productId}</td>
                      <td>{line.qty}</td>
                      <td>{money(line.unitPrice)}</td>
                      <td>{money(line.qty * line.unitPrice)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="nq-sum-row">
              <span>Subtotal</span>
              <b>{money(totals.subtotal)}</b>
            </div>
            {totals.discount > 0 ? (
              <div className="nq-sum-row">
                <span>Descuento</span>
                <b>−{money(totals.discount)}</b>
              </div>
            ) : null}
            <div className="nq-sum-row">
              <span>Impuestos</span>
              <b>{money(totals.tax)}</b>
            </div>
            <div className="nq-sum-row">
              <span>Total</span>
              <b>{money(totals.total)}</b>
            </div>
            {note ? <p style={{ margin: 0 }}>{note}</p> : null}
          </div>
        </Modal>
      ) : null}

      {clientOpen ? (
        <Modal
          title="Nuevo cliente"
          subtitle="Datos básicos para la cotización."
          onClose={() => setClientOpen(false)}
          footer={
            <ModalActions
              onCancel={() => setClientOpen(false)}
              submitLabel={clientBusy ? 'Guardando…' : 'Guardar'}
              formId="nq-client-form"
              icon="save"
            />
          }
        >
          <form id="nq-client-form" onSubmit={(event) => void createClient(event)}>
            <div className="field">
              <label htmlFor="nq-cl-name">Nombre</label>
              <input id="nq-cl-name" name="name" required placeholder="Razón social o nombre" />
            </div>
            <div className="field">
              <label htmlFor="nq-cl-contact">Contacto / RUC</label>
              <input id="nq-cl-contact" name="contact" required placeholder="Teléfono o identificación" />
            </div>
            <div className="field">
              <label htmlFor="nq-cl-address">Dirección</label>
              <input id="nq-cl-address" name="address" required placeholder="Dirección de entrega" />
            </div>
            <div className="field">
              <label htmlFor="nq-cl-email">Correo</label>
              <input id="nq-cl-email" name="email" type="email" placeholder="opcional@correo.com" />
            </div>
            <div className="field">
              <label htmlFor="nq-cl-margin">Margen de cotización (%)</label>
              <input
                id="nq-cl-margin"
                name="marginPct"
                type="number"
                min={0}
                max={1000}
                step={0.1}
                placeholder="Opcional · vacío = PVP"
              />
            </div>
            <input type="hidden" name="type" value="Mayorista" />
            {clientError ? <div className="form-error visible">{clientError}</div> : null}
          </form>
        </Modal>
      ) : null}
    </div>
  );
}
