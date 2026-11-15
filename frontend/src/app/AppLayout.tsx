import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { can, roleLabel, type Permission } from '../shared/auth/permissions';
import { useState } from 'react';
import { Icon, Logo } from '../shared/components/Icon';
import { useAppState } from '../shared/hooks/AppStateProvider';
import { useAuth } from '../shared/hooks/AuthProvider';
import { api } from '../shared/api/client';
import { available } from '../shared/lib/inventory';
import { Modal } from '../shared/components/Modal';

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

export function AppLayout() {
  const { state } = useAppState();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [assistantAnswer, setAssistantAnswer] = useState<string[]>([]);
  const [notifyOpen, setNotifyOpen] = useState(false);

  if (!state) return null;

  const initials = (user?.name || state.settings.operator || 'OC')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('') || 'OC';

  const title = titles[location.pathname] ?? 'Bodega visual';
  const pending = state.orders.filter((o) => o.status === 'Por preparar').length;
  const low = state.products.filter((p) => available(state, p.id) < p.min);
  const today = new Date().toLocaleDateString('es-EC', { day: 'numeric', month: 'short', year: 'numeric' });

  const nav = (to: string, label: string, icon: string, pill?: string | number, permission?: Permission) =>
    permission && !can(user, permission) ? null : (
    <NavLink
      to={to}
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
        <div className="brand-tag">Operación conectada</div>
        <div className="nav-heading">Operación</div>
        <nav className="nav">
          {nav('/', 'Inicio', 'home')}
          {nav('/inventario', 'Inventario', 'box')}
          {nav('/recepcion', 'Recepción', 'receive', undefined, 'warehouse')}
          {nav('/bodega', 'Bodega visual', 'warehouse', 'NUEVO')}
          {nav('/bodegas', 'Bodegas', 'building', undefined, 'admin')}
          {nav('/familias', 'Familias', 'layers', undefined, 'admin')}
          {nav('/pedidos', 'Pedidos', 'orders', pending || '')}
          {nav('/compras', 'Abastecimiento', 'cart')}
          {nav('/logistica', 'Logística', 'truck', undefined, 'dispatch')}
          {nav('/logistica/rutas', 'Mi ruta', 'route', undefined, 'field')}
          {nav('/logistica/historial', 'Historial rutas', 'history')}
        </nav>
        <div className="nav-heading spaced">Gestión</div>
        <nav className="nav">
          {nav('/clientes', 'Clientes', 'users')}
          {nav('/trazabilidad', 'Trazabilidad', 'route')}
          {nav('/reportes', 'Reportes', 'chart')}
          {nav('/configuracion', 'Configuración', 'settings', undefined, 'admin')}
        </nav>
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
              <span>{user ? `${roleLabel[user.role]} · ${user.email}` : 'Coordinación de operaciones'}</span>
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
            <span>{state.settings.company}</span>
            <Icon name="chevron" />
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
              <input name="query" placeholder="Buscar producto o código…" autoComplete="off" />
            </form>
            <span className="date-label">
              <Icon name="calendar" />
              {today}
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
            <div className="avatar" style={{ background: '#e9f3fc', color: '#4687b9' }} title={user?.name}>
              {initials}
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
