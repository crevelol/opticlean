import { FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { Icon, Logo, Spinner } from '../../shared/components/Icon';
import { Button } from '../../shared/components/ui';
import { fadeUp } from '../../shared/motion/presets';
import { api } from '../../shared/api/client';
import '../../styles/login.css';

export function ForgotPasswordPage() {
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [resetUrl, setResetUrl] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');
    setResetUrl('');
    const form = new FormData(e.currentTarget);
    try {
      const res = await api.forgotPassword(String(form.get('email') ?? ''));
      setMessage(res.message);
      if (res.resetUrl) setResetUrl(res.resetUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo procesar la solicitud');
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
        <p className="login-lead">Recupera el acceso a tu cuenta de operación.</p>
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
          <h2>Olvidé mi contraseña</h2>
          <p className="login-muted">Te enviaremos un enlace para crear una nueva.</p>
          <label className="field">
            <span>Correo electrónico</span>
            <input name="email" type="email" required autoComplete="username" placeholder="tu@empresa.com" />
          </label>
          <AnimatePresence initial={false}>
            {error ? (
              <motion.p className="login-error" role="alert" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <Icon name="alert" />
                <span>{error}</span>
              </motion.p>
            ) : null}
          </AnimatePresence>
          {message ? <p className="login-hint">{message}</p> : null}
          {resetUrl ? (
            <p className="login-hint">
              Enlace de restablecimiento:{' '}
              <a href={resetUrl}>Abrir</a>
            </p>
          ) : null}
          <Button type="submit" variant="primary" size="large" full className="login-submit" disabled={busy}>
            {busy ? <Spinner /> : 'Enviar enlace'}
          </Button>
          <p className="login-hint">
            <Link to="/login">Volver al inicio de sesión</Link>
          </p>
        </motion.form>
      </div>
    </div>
  );
}
