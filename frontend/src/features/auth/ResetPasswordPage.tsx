import { FormEvent, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'motion/react';
import { Icon, Logo, Spinner } from '../../shared/components/Icon';
import { Button } from '../../shared/components/ui';
import { fadeUp } from '../../shared/motion/presets';
import { api } from '../../shared/api/client';
import '../../styles/login.css';

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = useMemo(() => params.get('token') || '', [params]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const form = new FormData(e.currentTarget);
    const password = String(form.get('password') ?? '');
    const confirm = String(form.get('confirm') ?? '');
    if (password !== confirm) {
      setError('Las contraseñas no coinciden.');
      setBusy(false);
      return;
    }
    try {
      await api.resetPassword(token, password);
      navigate('/login', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo restablecer');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-shell">
      <aside className="login-aside">
        <div className="login-brand">
          <Logo />
          <span>
            OPTI<span>CLEAN</span> <em>AI</em>
          </span>
        </div>
        <p className="login-lead">Elige una contraseña nueva para tu cuenta.</p>
        <p className="login-foot">innovamf.com · Auth</p>
      </aside>
      <div className="login-panel">
        <motion.form
          className="login-form"
          onSubmit={(e) => void onSubmit(e)}
          variants={fadeUp}
          initial="hidden"
          animate="show"
        >
          <div className="login-mark" aria-hidden>
            <Logo />
          </div>
          <h2>Restablecer contraseña</h2>
          <p className="login-muted">Mínimo 8 caracteres.</p>
          {!token ? (
            <p className="login-error" role="alert">
              <Icon name="alert" />
              <span>Falta el token del enlace. Solicita uno nuevo.</span>
            </p>
          ) : null}
          <label className="field">
            <span>Nueva contraseña</span>
            <input name="password" type="password" required minLength={8} autoComplete="new-password" />
          </label>
          <label className="field">
            <span>Confirmar contraseña</span>
            <input name="confirm" type="password" required minLength={8} autoComplete="new-password" />
          </label>
          {error ? (
            <p className="login-error" role="alert">
              <Icon name="alert" />
              <span>{error}</span>
            </p>
          ) : null}
          <Button
            type="submit"
            variant="primary"
            size="large"
            full
            className="login-submit"
            disabled={busy || !token}
          >
            {busy ? <Spinner /> : 'Guardar contraseña'}
          </Button>
          <p className="login-hint">
            <Link to="/login">Ir al login</Link>
          </p>
        </motion.form>
      </div>
    </div>
  );
}
