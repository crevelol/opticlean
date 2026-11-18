import { NavLink } from 'react-router-dom';
import { motion } from 'motion/react';
import { Icon, Logo } from '../../shared/components/Icon';
import { cx } from '../../shared/components/ui';
import { spring } from '../../shared/motion/presets';
import type { MenuSection } from '../navigation';

type Props = {
  sections: MenuSection[];
  collapsed: boolean;
  mobileOpen: boolean;
  /** Contador dinámico por ruta (p. ej. pedidos por preparar). */
  counters: Record<string, number>;
  user: { name: string; email: string; role: string; initials: string };
  onNavigate: () => void;
  onAssistant: () => void;
  onLogout: () => void;
};

export function Sidebar({
  sections,
  collapsed,
  mobileOpen,
  counters,
  user,
  onNavigate,
  onAssistant,
  onLogout,
}: Props) {
  return (
    <aside
      className={cx('sidebar', collapsed && 'is-collapsed', mobileOpen && 'open')}
      aria-label="Navegación principal"
    >
      <div className="sidebar-head">
        <NavLink className="brand" to="/" onClick={onNavigate} aria-label="OPTICLEAN AI · Inicio">
          <Logo />
          <span className="brand-text">
            OPTI<span>CLEAN</span> <em>AI</em>
          </span>
        </NavLink>
      </div>

      <div className="sidebar-scroll">
        {sections.map((sec) => (
          <div className="nav-section" key={sec.section}>
            <div className="nav-heading">
              <span>{sec.section}</span>
            </div>
            <nav className="nav">
              {sec.items.map((item) => {
                const count = counters[item.path];
                const pill = count ? String(count) : item.badge;
                return (
                  <NavLink
                    key={item.id}
                    to={item.path}
                    end={item.path === '/'}
                    onClick={onNavigate}
                    title={collapsed ? item.label : undefined}
                    className={({ isActive }) => cx('nav-item', isActive && 'active')}
                  >
                    {({ isActive }) => (
                      <>
                        {isActive ? (
                          <motion.span
                            layoutId="nav-active"
                            className="nav-active-bg"
                            transition={spring.snappy}
                            aria-hidden
                          />
                        ) : null}
                        <Icon name={item.icon} />
                        <span className="nav-label">{item.label}</span>
                        {pill ? (
                          <span className={cx('nav-pill', count ? 'is-count' : null)}>{pill}</span>
                        ) : null}
                      </>
                    )}
                  </NavLink>
                );
              })}
            </nav>
          </div>
        ))}
      </div>

      <div className="sidebar-foot">
        <button
          type="button"
          className="assistant-trigger"
          onClick={onAssistant}
          title={collapsed ? 'Asistente operativo' : undefined}
        >
          <span className="assistant-trigger-icon">
            <Icon name="spark" />
          </span>
          <span className="assistant-trigger-text">
            <strong>Asistente operativo</strong>
            <small>Consulta stock, espacio y prioridades</small>
          </span>
        </button>

        <div className="sidebar-user">
          <div className="avatar" title={user.name}>
            {user.initials}
          </div>
          <div className="sidebar-user-text" title={user.email || undefined}>
            <strong>{user.name}</strong>
            <span>{user.role}</span>
          </div>
          <button
            type="button"
            className="icon-btn sidebar-logout"
            onClick={onLogout}
            aria-label="Cerrar sesión"
            title="Cerrar sesión"
          >
            <Icon name="logout" />
          </button>
        </div>
      </div>
    </aside>
  );
}
