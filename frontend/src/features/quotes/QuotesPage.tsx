import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppState } from '../../shared/hooks/AppStateProvider';
import { api } from '../../shared/api/client';
import { money } from '../../shared/lib/inventory';
import { Btn, Empty, PageHead } from '../../shared/components/ui';
import type { CustomerQuote, SalesChannel } from '../../shared/types';
import '../../styles/clients.css';

const channels: Array<{ id: SalesChannel; label: string }> = [
  { id: 'ejecutivo', label: 'Ejecutivo' },
  { id: 'portal', label: 'Portal' },
  { id: 'reposicion', label: 'Reposición' },
];

function viewOf(quote: CustomerQuote) {
  return quote.status === 'Abierta' && quote.validUntil < new Date().toISOString().slice(0, 10)
    ? 'Vencida'
    : quote.status;
}

function totalOf(quote: CustomerQuote, ivaOf: (productId: string) => number) {
  const subtotal = quote.lines.reduce((sum, line) => sum + line.qty * line.unitPrice, 0);
  const tax = quote.lines.reduce(
    (sum, line) => sum + line.qty * line.unitPrice * ivaOf(line.productId),
    0,
  );
  const discount = Math.min(quote.discount ?? 0, subtotal);
  const share = subtotal > 0 ? (subtotal - discount) / subtotal : 1;
  return Math.round((subtotal - discount + tax * share) * 100) / 100;
}

export function QuotesPage() {
  const { state, applyResponse, toast } = useAppState();
  const navigate = useNavigate();
  const [error, setError] = useState('');

  const quotes = useMemo(() => state?.quotes ?? [], [state?.quotes]);
  if (!state) return null;

  const ivaOf = (productId: string) => {
    const item = state.products.find((p) => p.id === productId);
    return item?.ivaRate != null ? item.ivaRate : 0.15;
  };

  const act = async (id: string, win: boolean) => {
    setError('');
    try {
      applyResponse(win ? await api.winQuote(id) : await api.loseQuote(id));
      toast(win ? 'Cotización ganada. El pedido ya está por preparar.' : 'Cotización marcada como perdida.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo actualizar.');
    }
  };

  return (
    <div className="page">
      <PageHead
        eyebrow="Ventas"
        title="Cotizaciones"
        desc="Precio y vigencia antes de convertir la oferta en pedido."
        actions={
          <Btn icon="plus" onClick={() => navigate('/cotizaciones/nueva')}>
            Nueva cotización
          </Btn>
        }
      />
      {error ? <div className="form-error visible">{error}</div> : null}
      {quotes.length ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Número</th>
                <th>Cliente</th>
                <th>Canal</th>
                <th>Vigencia</th>
                <th>Total</th>
                <th>Estado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {quotes.map((quote) => {
                const status = viewOf(quote);
                const client = state.clients.find((item) => item.id === quote.clientId);
                return (
                  <tr key={quote.id}>
                    <td>{quote.number}</td>
                    <td>{client?.name ?? quote.clientId}</td>
                    <td>{channels.find((item) => item.id === quote.channel)?.label}</td>
                    <td>{quote.validUntil}</td>
                    <td>{money(totalOf(quote, ivaOf))}</td>
                    <td>{status}</td>
                    <td>
                      {status === 'Abierta' ? (
                        <>
                          <Btn size="small" onClick={() => void act(quote.id, true)}>
                            Ganar
                          </Btn>{' '}
                          <Btn size="small" onClick={() => void act(quote.id, false)}>
                            Perder
                          </Btn>
                        </>
                      ) : (
                        quote.orderId ?? ''
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty
          title="Sin cotizaciones"
          desc="Crea la primera con cliente, productos, margen de vigencia y condiciones."
        />
      )}
    </div>
  );
}
