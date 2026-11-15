import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppState } from '../../shared/hooks/AppStateProvider';
import { useAuth } from '../../shared/hooks/AuthProvider';
import { api } from '../../shared/api/client';
import { can } from '../../shared/auth/permissions';
import { money, orderValue } from '../../shared/lib/inventory';
import { Badge, Btn, PageHead } from '../../shared/components/ui';
import { Icon } from '../../shared/components/Icon';
import { Modal, ModalActions } from '../../shared/components/Modal';
import type { Client } from '../../shared/types';

const TYPES = ['Corporativo', 'Hotelería', 'Salud', 'Restauración', 'Industrial', 'Institucional', 'Educación'];
const CITIES = ['Quito', 'Guayaquil', 'Cuenca', 'Ambato', 'Santo Domingo'];

export function ClientsPage() {
  const { state, applyResponse, toast } = useAppState();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [editing, setEditing] = useState<Client | 'new' | null>(null);
  const [removing, setRemoving] = useState<Client | null>(null);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');

  if (!state) return null;

  const canEdit = can(user, 'dispatch');
  const q = query.trim().toLowerCase();
  const clients = state.clients.filter((c) =>
    !q || [c.name, c.contact, c.city, c.sector, c.type].join(' ').toLowerCase().includes(q),
  );
  const current = editing && editing !== 'new' ? editing : null;

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    const data = Object.fromEntries(new FormData(e.currentTarget));
    try {
      applyResponse(current ? await api.updateClient(current.id, data) : await api.addClient(data));
      toast(current ? 'Cliente actualizado.' : 'Cliente registrado.');
      setEditing(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    }
  };

  const remove = async () => {
    if (!removing) return;
    setError('');
    try {
      applyResponse(await api.deleteClient(removing.id));
      toast('Cliente eliminado.');
      setRemoving(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    }
  };

  return (
    <>
      <PageHead
        eyebrow="Relaciones comerciales"
        title="Clientes"
        desc="Pedidos y datos de entrega."
        actions={
          canEdit ? (
            <Btn variant="primary" icon="plus" onClick={() => { setError(''); setEditing('new'); }}>
              Nuevo cliente
            </Btn>
          ) : null
        }
      />
      <section className="panel" style={{ marginBottom: 16 }}>
        <div className="toolbar">
          <div className="search-input" style={{ maxWidth: 420 }}>
            <Icon name="search" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar por nombre, ciudad, sector…" />
          </div>
          <span className="subtle">{clients.length} de {state.clients.length} clientes</span>
        </div>
      </section>
      <div className="client-grid">
        {clients.map((c) => {
          const os = state.orders.filter((o) => o.clientId === c.id);
          return (
            <section className="panel client-card" key={c.id}>
              <div className="client-card-head">
                <span className="avatar">
                  {c.name
                    .split(' ')
                    .slice(0, 2)
                    .map((t) => t[0])
                    .join('')}
                </span>
                <div>
                  <h3>{c.name}</h3>
                  <Badge text={c.type} color="blue" />
                </div>
              </div>
              <p>
                <Icon name="users" />
                {c.contact}
              </p>
              <p>
                <Icon name="pin" />
                {c.address}
                {c.city ? ` · ${c.city}` : ''}
                {c.sector ? ` (${c.sector})` : ''}
              </p>
              <p>
                <Icon name="mail" />
                {c.email}
              </p>
              <div className="client-card-footer">
                <span>
                  {os.length} pedidos · {money(os.reduce((n, o) => n + orderValue(state, o), 0))}
                </span>
                {canEdit ? (
                  <span style={{ display: 'flex', gap: 4 }}>
                    <Btn variant="ghost" icon="settings" onClick={() => { setError(''); setEditing(c); }}>
                      Editar
                    </Btn>
                    {!os.length ? (
                      <Btn variant="ghost" icon="trash" onClick={() => { setError(''); setRemoving(c); }}>
                        Eliminar
                      </Btn>
                    ) : null}
                    <Btn variant="ghost" icon="plus" onClick={() => navigate('/pedidos/nuevo', { state: { clientId: c.id } })}>
                      Pedido
                    </Btn>
                  </span>
                ) : null}
              </div>
            </section>
          );
        })}
      </div>

      {editing ? (
        <Modal
          title={current ? `Editar ${current.name}` : 'Nuevo cliente'}
          subtitle="Datos de contacto y entrega. Ciudad y sector se usan para asignar rutas."
          onClose={() => setEditing(null)}
          footer={<ModalActions onCancel={() => setEditing(null)} submitLabel="Guardar" formId="client-form" icon="save" />}
        >
          <form id="client-form" key={current?.id ?? 'new'} onSubmit={(e) => void submit(e)}>
            <div className="form-grid">
              <div className="field full">
                <label htmlFor="cl-name">Nombre</label>
                <input id="cl-name" name="name" defaultValue={current?.name} required />
              </div>
              <div className="field">
                <label htmlFor="cl-person">Contacto</label>
                <input id="cl-person" name="contact" defaultValue={current?.contact} required />
              </div>
              <div className="field">
                <label htmlFor="cl-type">Tipo</label>
                <select id="cl-type" name="type" defaultValue={current?.type ?? TYPES[0]}>
                  {[...new Set([...TYPES, ...(current?.type ? [current.type] : [])])].map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div className="field full">
                <label htmlFor="cl-address">Dirección</label>
                <input id="cl-address" name="address" defaultValue={current?.address} required />
              </div>
              <div className="field">
                <label htmlFor="cl-city">Ciudad</label>
                <select id="cl-city" name="city" defaultValue={current?.city ?? CITIES[0]}>
                  {[...new Set([...CITIES, ...(current?.city ? [current.city] : [])])].map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="cl-sector">Sector / barrio</label>
                <input id="cl-sector" name="sector" defaultValue={current?.sector} placeholder="Ej. La Mariscal" />
              </div>
              <div className="field full">
                <label htmlFor="cl-email">Correo</label>
                <input id="cl-email" name="email" type="email" defaultValue={current?.email} required />
              </div>
            </div>
            {error ? <div className="form-error visible">{error}</div> : null}
          </form>
        </Modal>
      ) : null}

      {removing ? (
        <Modal
          title="Eliminar cliente"
          subtitle={removing.name}
          onClose={() => setRemoving(null)}
          footer={
            <>
              <Btn onClick={() => setRemoving(null)}>Cancelar</Btn>
              <Btn variant="danger" icon="trash" onClick={() => void remove()}>
                Eliminar
              </Btn>
            </>
          }
        >
          <p>El cliente no tiene pedidos registrados. Esta acción no se puede deshacer.</p>
          {error ? <div className="form-error visible">{error}</div> : null}
        </Modal>
      ) : null}
    </>
  );
}
