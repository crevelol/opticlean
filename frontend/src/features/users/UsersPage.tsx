import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { api, type ManagedUser } from '../../shared/api/client';
import { useAuth } from '../../shared/hooks/AuthProvider';
import { useAppState } from '../../shared/hooks/AppStateProvider';
import { Badge, Btn, Empty, Kpi, KpiGrid, PageHead } from '../../shared/components/ui';
import { Modal, ModalActions } from '../../shared/components/Modal';
import { Icon } from '../../shared/components/Icon';
import { roleLabel } from '../../shared/auth/permissions';

const ROLES = ['ops', 'dispatch', 'driver', 'admin'] as const;

export function UsersPage() {
  const { user } = useAuth();
  const { toast } = useAppState();
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<ManagedUser | null>(null);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | (typeof ROLES)[number]>('all');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.listUsers();
      setUsers(res.users);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron cargar los usuarios');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const bodegueros = useMemo(
    () => users.filter((u) => u.role === 'ops' && u.active),
    [users],
  );

  const filtered = useMemo(() => {
    if (roleFilter === 'all') return users;
    return users.filter((u) => u.role === roleFilter);
  }, [users, roleFilter]);

  if (user?.role !== 'admin') return <Navigate to="/" replace />;

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setFormError('');
    const data = new FormData(e.currentTarget);
    const payload = {
      name: String(data.get('name') ?? ''),
      email: String(data.get('email') ?? ''),
      role: String(data.get('role') ?? 'ops'),
      password: String(data.get('password') ?? ''),
      truckPlate: String(data.get('truckPlate') ?? '') || undefined,
      active: data.get('active') === 'on' || data.get('active') === '1',
    };
    try {
      if (edit) {
        await api.updateUser(edit.id, {
          name: payload.name,
          email: payload.email,
          role: payload.role,
          password: payload.password || undefined,
          truckPlate: payload.role === 'driver' ? payload.truckPlate ?? null : null,
          active: payload.active,
        });
        toast('Usuario actualizado.');
      } else {
        if (!payload.password) throw new Error('La contraseña es obligatoria.');
        await api.createUser({
          name: payload.name,
          email: payload.email,
          role: payload.role,
          password: payload.password,
          truckPlate: payload.truckPlate,
        });
        toast('Usuario creado.');
      }
      setOpen(false);
      setEdit(null);
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'No se pudo guardar');
    } finally {
      setBusy(false);
    }
  }

  async function deactivate(u: ManagedUser) {
    if (u.id === user?.id) {
      toast('No puedes desactivar tu propio usuario.');
      return;
    }
    try {
      await api.deactivateUser(u.id);
      toast(`${u.name} desactivado.`);
      await load();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'No se pudo desactivar');
    }
  }

  return (
    <div className="users-page">
      <PageHead
        eyebrow="Administración"
        title="Usuarios y roles"
        desc="Crea bodegueros, despacho y conductores. Luego reparte los pedidos a cada bodeguero."
        actions={
          <Btn
            variant="primary"
            icon="plus"
            onClick={() => {
              setEdit(null);
              setFormError('');
              setOpen(true);
            }}
          >
            Nuevo usuario
          </Btn>
        }
      />

      <KpiGrid>
        <Kpi
          label="Bodegueros activos"
          value={bodegueros.length}
          unit=""
          foot="Rol bodega (ops)"
          icon="warehouse"
        />
        <Kpi
          label="Usuarios"
          value={users.filter((u) => u.active).length}
          unit="activos"
          foot={`${users.length} en total`}
          icon="users"
        />
        <Kpi
          label="Despacho"
          value={users.filter((u) => u.role === 'dispatch' && u.active).length}
          unit=""
          foot="Asignan camiones"
          icon="truck"
        />
        <Kpi
          label="Conductores"
          value={users.filter((u) => u.role === 'driver' && u.active).length}
          unit=""
          foot="Ruta móvil"
          icon="route"
        />
      </KpiGrid>

      <section className="panel">
        <div className="panel-head" style={{ gap: 12, flexWrap: 'wrap' }}>
          <span className="panel-title">
            <Icon name="users" />
            Equipo
          </span>
          <div className="dash-tabs" role="tablist">
            <button
              type="button"
              className={roleFilter === 'all' ? 'active' : ''}
              onClick={() => setRoleFilter('all')}
            >
              Todos
            </button>
            {ROLES.map((r) => (
              <button
                key={r}
                type="button"
                className={roleFilter === r ? 'active' : ''}
                onClick={() => setRoleFilter(r)}
              >
                {roleLabel[r]}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <p className="subtle" style={{ padding: 16 }}>
            Cargando…
          </p>
        ) : error ? (
          <p className="login-error" style={{ margin: 16 }}>
            {error}
          </p>
        ) : filtered.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Correo</th>
                  <th>Rol</th>
                  <th>Estado</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filtered.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <strong>{u.name}</strong>
                      {u.isDemo ? <small> Demo</small> : null}
                      {u.truckPlate ? <small> · {u.truckPlate}</small> : null}
                    </td>
                    <td>{u.email}</td>
                    <td>
                      <Badge text={roleLabel[u.role]} color={u.role === 'ops' ? 'blue' : 'muted'} />
                    </td>
                    <td>
                      <Badge
                        text={u.active ? 'Activo' : 'Inactivo'}
                        color={u.active ? 'green' : 'amber'}
                      />
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                        <Btn
                          variant="small"
                          icon="edit"
                          onClick={() => {
                            setEdit(u);
                            setFormError('');
                            setOpen(true);
                          }}
                        >
                          Editar
                        </Btn>
                        {u.active ? (
                          <Btn variant="small" onClick={() => void deactivate(u)}>
                            Desactivar
                          </Btn>
                        ) : (
                          <Btn
                            variant="small"
                            onClick={() =>
                              void api.updateUser(u.id, { active: true }).then(load)
                            }
                          >
                            Activar
                          </Btn>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty title="Sin usuarios" desc="Crea el primer bodeguero para asignar pedidos." />
        )}
      </section>

      {open ? (
        <Modal
          title={edit ? 'Editar usuario' : 'Nuevo usuario'}
          subtitle="Los bodegueros (ops) reciben pedidos asignados en el móvil."
          onClose={() => {
            setOpen(false);
            setEdit(null);
          }}
          footer={
            <ModalActions
              onCancel={() => {
                setOpen(false);
                setEdit(null);
              }}
              submitLabel={busy ? 'Guardando…' : 'Guardar'}
              formId="user-form"
            />
          }
        >
          <form id="user-form" onSubmit={(e) => void onSubmit(e)} className="form-grid">
            <label className="field full">
              <span>Nombre</span>
              <input name="name" required defaultValue={edit?.name ?? ''} />
            </label>
            <label className="field full">
              <span>Correo</span>
              <input
                name="email"
                type="email"
                required
                defaultValue={edit?.email ?? ''}
                autoComplete="off"
              />
            </label>
            <label className="field">
              <span>Rol</span>
              <select name="role" defaultValue={edit?.role ?? 'ops'} id="user-role">
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {roleLabel[r]}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Placa (conductor)</span>
              <input
                name="truckPlate"
                defaultValue={edit?.truckPlate ?? ''}
                placeholder="GBA-2041"
              />
            </label>
            <label className="field full">
              <span>{edit ? 'Nueva contraseña (opcional)' : 'Contraseña'}</span>
              <input
                name="password"
                type="password"
                minLength={8}
                required={!edit}
                autoComplete="new-password"
                placeholder={edit ? 'Dejar vacío para no cambiar' : 'Mínimo 8 caracteres'}
              />
            </label>
            {edit ? (
              <label className="field full" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <input
                  type="checkbox"
                  name="active"
                  defaultChecked={edit.active}
                  value="1"
                />
                <span>Usuario activo</span>
              </label>
            ) : null}
            {formError ? <p className="login-error full">{formError}</p> : null}
          </form>
        </Modal>
      ) : null}
    </div>
  );
}
