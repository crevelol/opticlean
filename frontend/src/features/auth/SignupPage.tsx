import { FormEvent, useEffect, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { Icon, Logo, Spinner } from '../../shared/components/Icon';
import { Button } from '../../shared/components/ui';
import { fadeUp, stagger, swap } from '../../shared/motion/presets';
import { useAuth } from '../../shared/hooks/AuthProvider';
import { api } from '../../shared/api/client';
import { homeForRole } from '../../app/navigation';
import '../../styles/login.css';

/** Registro de una empresa nueva: crea la empresa y su primer administrador. */
export function SignupPage() {
  const { user, loading, signup } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [enabled, setEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    void api
      .publicConfig()
      .then((c) => !cancelled && setEnabled(c.signupEnabled))
      .catch(() => !cancelled && setEnabled(false));
    return () => {
      cancelled = true;
    };
  }, []);

  if (!loading && user) return <Navigate to={homeForRole(user.role)} replace />;
  if (enabled === false) return <Navigate to="/login" replace />;

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const password = String(form.get('password') ?? '');
    if (password !== String(form.get('confirm') ?? '')) {
      setError('Las contraseñas no coinciden.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const session = await signup({
        companyName: String(form.get('companyName') ?? ''),
        name: String(form.get('name') ?? ''),
        email: String(form.get('email') ?? ''),
        password,
      });
      navigate(homeForRole(session.role), { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo completar el registro');
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
        <motion.div variants={stagger} initial="hidden" animate="show">
          <motion.p className="eyebrow" variants={fadeUp}>
            Empieza hoy
          </motion.p>
          <motion.h1 variants={fadeUp}>
            Crea tu empresa.
            <br />
            <em>Configúrala a tu medida.</em>
          </motion.h1>
          <motion.p className="login-lead" variants={fadeUp}>
            Registra tu empresa y entra como administrador: diseña tu bodega, invita a tu equipo y carga tu
            catálogo.
          </motion.p>
        </motion.div>
        <p className="login-foot">innovamf.com · OPTICLEAN</p>
      </aside>

      <div className="login-panel">
        <motion.form
          className="login-form"
          onSubmit={onSubmit}
          autoComplete="on"
          variants={fadeUp}
          initial="hidden"
          animate="show"
          aria-busy={busy}
        >
          <div className="login-mark" aria-hidden>
            <Logo />
          </div>
          <h2>Crear cuenta</h2>
          <p className="login-muted">Serás el administrador de tu empresa.</p>

          <label className="field">
            <span>Nombre de la empresa</span>
            <input name="companyName" autoComplete="organization" required minLength={2} maxLength={80} />
          </label>

          <label className="field">
            <span>Tu nombre</span>
            <input name="name" autoComplete="name" required />
          </label>

          <label className="field">
            <span>Correo electrónico</span>
            <input name="email" type="email" autoComplete="email" required />
          </label>

          <label className="field">
            <span>Contraseña</span>
            <input
              name="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={10}
              placeholder="Mínimo 10 caracteres"
            />
          </label>

          <label className="field">
            <span>Confirmar contraseña</span>
            <input name="confirm" type="password" autoComplete="new-password" required minLength={10} />
          </label>

          <AnimatePresence initial={false}>
            {error ? (
              <motion.p
                key="error"
                className="login-error"
                role="alert"
                initial={{ opacity: 0, height: 0, marginBottom: 0 }}
                animate={{ opacity: 1, height: 'auto', marginBottom: 12 }}
                exit={{ opacity: 0, height: 0, marginBottom: 0 }}
              >
                <Icon name="alert" />
                <span>{error}</span>
              </motion.p>
            ) : null}
          </AnimatePresence>

          <Button
            type="submit"
            variant="primary"
            size="large"
            full
            className="login-submit"
            disabled={busy || enabled === null}
            aria-label={busy ? 'Creando cuenta' : undefined}
          >
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={busy ? 'busy' : 'idle'}
                className="login-submit-content"
                variants={swap}
                initial="hidden"
                animate="show"
                exit="exit"
              >
                {busy ? <Spinner /> : 'Crear empresa'}
              </motion.span>
            </AnimatePresence>
          </Button>

          <p className="login-hint">
            ¿Ya tienes cuenta? <Link to="/login">Inicia sesión</Link>
          </p>
        </motion.form>
      </div>
    </div>
  );
}
