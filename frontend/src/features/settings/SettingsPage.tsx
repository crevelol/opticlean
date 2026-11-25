import { useEffect, useState } from 'react';
import { useAppState } from '../../shared/hooks/AppStateProvider';
import { api } from '../../shared/api/client';
import { Btn, PageHead } from '../../shared/components/ui';
import { Icon } from '../../shared/components/Icon';
import { Modal } from '../../shared/components/Modal';
import { FleetPanel } from './FleetPanel';

export function SettingsPage() {
  const { state, applyResponse, toast } = useAppState();
  const [resetOpen, setResetOpen] = useState(false);
  /** En producción el servidor desactiva el reinicio; el botón no se muestra. */
  const [resetAllowed, setResetAllowed] = useState(false);
  const [pwdBusy, setPwdBusy] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void api
      .config()
      .then((cfg) => {
        if (!cancelled) setResetAllowed(cfg.resetAllowed);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  if (!state) return null;

  const save = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.currentTarget));
    applyResponse(
      await api.updateSettings({
        company: String(data.company),
        warehouse: String(data.warehouse),
        operator: String(data.operator),
      }),
    );
    toast('Configuración guardada.');
  };

  const changePassword = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (pwdBusy) return;
    const data = Object.fromEntries(new FormData(e.currentTarget));
    const currentPassword = String(data.currentPassword || '');
    const newPassword = String(data.newPassword || '');
    const confirm = String(data.confirmPassword || '');
    if (newPassword !== confirm) {
      toast('Las contraseñas nuevas no coinciden.');
      return;
    }
    setPwdBusy(true);
    try {
      const res = await api.changePassword(currentPassword, newPassword);
      toast(res.message || 'Contraseña actualizada.');
      e.currentTarget.reset();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'No se pudo cambiar la contraseña.');
    } finally {
      setPwdBusy(false);
    }
  };

  const reset = async () => {
    try {
      applyResponse(await api.reset());
      setResetOpen(false);
      toast('Datos restablecidos.');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'No se pudo restablecer.');
    }
  };

  return (
    <>
      <PageHead
        eyebrow="Administración"
        title="Configuración"
        desc="Datos de la empresa, bodega activa y seguridad de la cuenta."
      />
      <div className="two-col">
        <form className="panel" id="settings-form" onSubmit={(e) => void save(e)}>
          <div className="panel-head">
            <span className="panel-title">
              <Icon name="building" />
              Datos de la operación
            </span>
          </div>
          <div className="form-section">
            <div className="form-grid">
              <div className="field full">
                <label htmlFor="set-company">Nombre comercial</label>
                <input id="set-company" name="company" defaultValue={state.settings.company} required />
              </div>
              <div className="field full">
                <label htmlFor="set-warehouse">Nombre de bodega</label>
                <input id="set-warehouse" name="warehouse" defaultValue={state.settings.warehouse} required />
              </div>
              <div className="field full">
                <label htmlFor="set-operator">Responsable</label>
                <input id="set-operator" name="operator" defaultValue={state.settings.operator} required />
              </div>
            </div>
          </div>
          <div className="form-footer">
            <button type="submit" className="btn primary">
              <Icon name="save" />
              Guardar cambios
            </button>
          </div>
        </form>
        <form className="panel" onSubmit={(e) => void changePassword(e)}>
          <div className="panel-head">
            <span className="panel-title">
              <Icon name="shield" />
              Cambiar contraseña
            </span>
          </div>
          <div className="form-section">
            <div className="form-grid">
              <div className="field full">
                <label htmlFor="pwd-current">Contraseña actual</label>
                <input id="pwd-current" name="currentPassword" type="password" required minLength={8} autoComplete="current-password" />
              </div>
              <div className="field full">
                <label htmlFor="pwd-new">Nueva contraseña</label>
                <input id="pwd-new" name="newPassword" type="password" required minLength={8} autoComplete="new-password" />
              </div>
              <div className="field full">
                <label htmlFor="pwd-confirm">Confirmar nueva</label>
                <input id="pwd-confirm" name="confirmPassword" type="password" required minLength={8} autoComplete="new-password" />
              </div>
            </div>
          </div>
          <div className="form-footer">
            <button type="submit" className="btn primary" disabled={pwdBusy}>
              <Icon name="save" />
              {pwdBusy ? 'Guardando…' : 'Actualizar contraseña'}
            </button>
          </div>
        </form>
        {resetAllowed ? (
        <section className="panel">
          <div className="panel-body">
            <h3 style={{ fontSize: 12 }}>Restablecer demostración</h3>
            <p className="subtle">Vuelve al seed inicial en el servidor.</p>
            <Btn variant="danger" icon="refresh" onClick={() => setResetOpen(true)}>
              Restablecer datos
            </Btn>
          </div>
        </section>
        ) : null}
      </div>
      <FleetPanel />

      {resetOpen ? (
        <Modal title="Restablecer demo" subtitle="Borra cambios en el servidor." onClose={() => setResetOpen(false)}>
          <p className="subtle">Se eliminarán productos, pedidos y movimientos creados en esta sesión persistida.</p>
          <div className="modal-footer" style={{ padding: 0, border: 0, marginTop: 16 }}>
            <Btn onClick={() => setResetOpen(false)}>Conservar</Btn>
            <Btn variant="danger" icon="refresh" onClick={() => void reset()}>
              Restablecer
            </Btn>
          </div>
        </Modal>
      ) : null}
    </>
  );
}
