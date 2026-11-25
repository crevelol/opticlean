import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Btn } from '../../shared/components/ui';

type Props = { children: ReactNode };
type State = { error: Error | null };

const RELOAD_KEY = 'opticlean.chunk-reload';

function isStaleChunkError(error: Error) {
  const msg = error.message || '';
  return (
    /Failed to fetch dynamically imported module/i.test(msg) ||
    /Importing a module script failed/i.test(msg) ||
    /Loading chunk [\w-]+ failed/i.test(msg) ||
    /error loading dynamically imported module/i.test(msg)
  );
}

/** Evita la pantalla blanca total si una ruta revienta al renderizar. */
export class RouteErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[RouteErrorBoundary]', error, info.componentStack);
    // Tras un deploy, el index pide chunks con hash viejo. Una recarga suele bastar.
    if (!isStaleChunkError(error)) return;
    try {
      if (sessionStorage.getItem(RELOAD_KEY) === '1') return;
      sessionStorage.setItem(RELOAD_KEY, '1');
      window.location.reload();
    } catch {
      /* ignore */
    }
  }

  componentDidUpdate(_: Props, prev: State) {
    if (prev.error && !this.state.error) {
      try {
        sessionStorage.removeItem(RELOAD_KEY);
      } catch {
        /* ignore */
      }
    }
  }

  render() {
    if (!this.state.error) {
      try {
        if (sessionStorage.getItem(RELOAD_KEY) === '1') sessionStorage.removeItem(RELOAD_KEY);
      } catch {
        /* ignore */
      }
      return this.props.children;
    }
    const stale = isStaleChunkError(this.state.error);
    return (
      <div className="page" style={{ padding: 40, maxWidth: 520 }}>
        <h1 style={{ fontSize: 22, marginBottom: 8 }}>No se pudo mostrar esta pantalla</h1>
        <p className="subtle" style={{ marginBottom: 16 }}>
          {stale
            ? 'La aplicación se actualizó. Recarga para cargar la versión nueva.'
            : this.state.error.message || 'Error inesperado en la interfaz.'}
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Btn
            variant="primary"
            onClick={() => {
              this.setState({ error: null });
              window.location.assign('/');
            }}
          >
            Ir al inicio
          </Btn>
          <Btn
            onClick={() => {
              this.setState({ error: null });
              window.location.reload();
            }}
          >
            Recargar
          </Btn>
        </div>
      </div>
    );
  }
}
