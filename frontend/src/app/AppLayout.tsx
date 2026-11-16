import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useEffect, useMemo, useState } from 'react';
import { Icon, Logo } from '../shared/components/Icon';
import { useAppState } from '../shared/hooks/AppStateProvider';
import { useAuth } from '../shared/hooks/AuthProvider';
import { api } from '../shared/api/client';
import { available } from '../shared/lib/inventory';
import { Modal } from '../shared/components/Modal';

type MenuSection = {
  section: string;
  items: Array<{ id: string; label: string; path: string; icon: string; badge: string | null }>;
};

const titles: Record<string, string> = {
  '/': 'Resumen de operaciones',
  '/inventario': 'Inventario',
  '/recepcion': 'Recepción',
  '/bodega': 'Bodega visual',
  '/bodegas': 'Administración de bodegas',
  '/familias': 'Familias de bodega',
  '/pedidos': 'Pedidos',
  '/pedidos/nuevo': 'Nuevo pedido',
  '/compras': 'Órdenes de compra',
  '/logistica': 'Distribución',
  '/logistica/rutas': 'Mi ruta',
  '/logistica/historial': 'Historial de rutas',
  '/clientes': 'Clientes',
  '/reportes': 'Reportes',
  '/configuracion': 'Configuración',
  '/trazabilidad': 'Trazabilidad',
};

const fallbackMenu: MenuSection[] = [
  {
    section: 'Operación',
    items: [
      { id: 'f-home', label: 'Inicio', path: '/', icon: 'home', badge: null },
      { id: 'f-inv', label: 'Inventario', path: '/inventario', icon: 'box', badge: null },
      { id: 'f-rec', label: 'Recepción', path: '/recepcion', icon: 'receive', badge: null },
      { id: 'f-bod', label: 'Bodega visual', path: '/bodega', icon: 'warehouse', badge: 'NUEVO' },
      { id: 'f-ped', label: 'Pedidos', path: '/pedidos', icon: 'orders', badge: null },
      { id: 'f-log', label: 'Logística', path: '/logistica', icon: 'truck', badge: null },
    ],
  },
  {
    section: 'Gestión',
    items: [
      { id: 'f-cli', label: 'Clientes', path: '/clientes', icon: 'users', badge: null },
      { id: 'f-cfg', label: 'Configuración', path: '/configuracion', icon: 'settings', badge: null },
    ],
  },
];

export function AppLayout() {
  const { state } = useAppState();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [assistantAnswer, setAssistantAnswer] = useState<string[]>([]);
  const [notifyOpen, setNotifyOpen] = useState(false);
  const [menuSections, setMenuSections] = useState<MenuSection[]>(fallbackMenu);

  useEffect(() => {
    let cancelled = false;
    void api
      .menu(user?.companyId)
      .then((res) => {
        if (cancelled) return;
        if (res.sections?.length) {
          setMenuSections(
            res.sections.map((s) => ({
              section: s.section,
              items: s.items.map((i) => ({
                id: i.id,
                label: i.label,
                path: i.path,
                icon: i.icon,
                badge: i.badge,
              })),
            })),
          );
        }
      })
      .catch(() => {
        /* mantiene menú fallback */
      });
    return () => {
      cancelled = true;
    };
  }, [user?.companyId]);

  const path = typeof window !== 'undefined' ? window.location.pathname : '/';
  const title = useMemo(() => {
    if (titles[path]) return titles[path];
    for (const sec of menuSections) {
      const hit = sec.items.find((i) => i.path === path);
      if (hit) return hit.label;
    }
    return 'Operación';
  }, [path, menuSections]);

  if (!state) return null;

  const initials = (user?.name || state.settings.operator || 'OC')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('') || 'OC';

  const pending = state.orders.filter((o) => o.status === 'Por preparar').length;
  const low = state.products.filter((p) => available(state, p.id) < p.min);

  const nav = (to: string, label: string, icon: string, pill?: string | number) => (
    <NavLink
      to={to}
      end={to === '/'}
      className={({ isActive }) => (isActive ? 'active' : '')}
      onClick={() => setMenuOpen(false)}
    >
      <Icon name={icon} />
      <span>{label}</span>
      {pill ? <span className="nav-pill">{pill}</span> : null}
    </NavLink>
  );

  return (
    <div className="app-shell">
      <div
        className={`mobile-overlay ${menuOpen ? 'open' : ''}`}
        onClick={() => setMenuOpen(false)}
      />
      <aside className={`sidebar ${menuOpen ? 'open' : ''}`}>
        <NavLink className="brand" to="/" onClick={() => setMenuOpen(false)}>
          <Logo />
          <span>
            OPTI<span style={{ fontWeight: 500 }}>CLEAN</span> <em>AI</em>
          </span>
        </NavLink>
        {menuSections.map((sec, idx) => (
          <div key={sec.section}>
            <div className={`nav-heading${idx > 0 ? ' spaced' : ''}`}>{sec.section}</div>
            <nav className="nav">
              {sec.items.map((item) =>
                nav(
                  item.path,
                  item.label,
                  item.icon,
                  item.path === '/pedidos' ? pending || item.badge || '' : item.badge || '',
                ),
              )}
            </nav>
          </div>
        ))}
        <div className="sidebar-bottom">
          <div className="upgrade">
            <div className="upgrade-label">
              <Icon name="spark" />
              Tu operación, en perspectiva
            </div>
            <p>Consulta disponibilidad y encuentra el siguiente paso.</p>
            <button type="button" onClick={() => setAssistantOpen(true)}>
              Asistente operativo <Icon name="arrow" />
            </button>
          </div>
          <div className="user">
            <div className="avatar">{initials}</div>
            <div>
              <strong>{user?.name || state.settings.operator}</strong>
              <span>{user?.email || 'Coordinación de operaciones'}</span>
              <button
                type="button"
                className="btn ghost small"
                style={{ marginTop: 6, padding: 0, minHeight: 0 }}
                onClick={() => {
                  logout();
                  navigate('/login', { replace: true });
                }}
              >
                Cerrar sesión
              </button>
            </div>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumbs">
            <button
              type="button"
              className="icon-btn mobile-menu"
              aria-label="Abrir menú"
              onClick={() => setMenuOpen(true)}
            >
              <Icon name="menu" />
            </button>
            <strong>{title}</strong>
          </div>
          <div className="top-tools">
            <form
              className="top-search"
              onSubmit={(e) => {
                e.preventDefault();
                const q = new FormData(e.currentTarget).get('query')?.toString() ?? '';
                navigate(`/inventario?q=${encodeURIComponent(q)}`);
              }}
            >
              <Icon name="search" />
              <input name="query" placeholder="Buscar producto, pedido o cliente…" autoComplete="off" />
            </form>
            <span className="date-label">
              <Icon name="calendar" />
              27 oct. 2026
            </span>
            <button
              type="button"
              className="icon-btn"
              aria-label="Ver notificaciones"
              onClick={() => setNotifyOpen(true)}
            >
              <Icon name="bell" />
              <span className="notification-dot" />
            </button>
            <div className="avatar" style={{ background: '#e9f3fc', color: '#4687b9' }}>
              ER
            </div>
          </div>
        </header>
        <main className="page">
          <Outlet />
          <footer className="page-footer">
            <span>OPTICLEAN AI · Operación conectada</span>
            <span>Datos de demostración · Persistencia en servidor local</span>
          </footer>
        </main>
      </div>

      {assistantOpen ? (
        <Modal
          title="Asistente operativo"
          subtitle="Consultas rápidas sobre los datos de esta demostración."
          onClose={() => {
            setAssistantOpen(false);
            setAssistantAnswer([]);
          }}
        >
          <div className="suggestion-title" style={{ marginBottom: 15 }}>
            <Icon name="spark" />
            ¿Qué necesitas resolver?
          </div>
          {(['stock', 'warehouse', 'orders'] as const).map((q) => (
            <button
              key={q}
              type="button"
              className="assistant-prompt"
              onClick={async () => {
                const r = await api.assistant(q);
                setAssistantAnswer(r.lines);
              }}
            >
              {q === 'stock' && '¿Qué productos necesitan reposición?'}
              {q === 'warehouse' && '¿Cuánto espacio tengo en bodega?'}
              {q === 'orders' && '¿Qué debería preparar primero?'}
            </button>
          ))}
          {assistantAnswer.length ? (
            <div className="assistant-answer">
              {assistantAnswer.map((line) => (
                <p key={line}>{line}</p>
              ))}
            </div>
          ) : null}
          <p className="subtle" style={{ fontSize: 9, marginTop: 17 }}>
            Respuestas calculadas con reglas locales. Sin conexión a un modelo de IA.
          </p>
        </Modal>
      ) : null}

      {notifyOpen ? (
        <Modal title="Notificaciones" subtitle="Pendientes de la operación actual." onClose={() => setNotifyOpen(false)}>
          <div className="notification-list">
            <div className="notice">
              <strong>{pending} pedidos por preparar</strong>
              Reserva confirmada. Consulta bodega para iniciar picking.
            </div>
            {low.map((p) => (
              <div className="notice" key={p.id}>
                <strong>Stock bajo · {p.name}</strong>
                {available(state, p.id)} unidades disponibles. Mínimo: {p.min}.
              </div>
            ))}
            <div className="notice">
              <strong>{state.orders.filter((o) => o.status === 'Preparado').length} pedidos preparados</strong>
              Listos para asignar al próximo despacho.
            </div>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
