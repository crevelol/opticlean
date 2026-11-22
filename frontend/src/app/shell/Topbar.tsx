import { Fragment } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { Icon } from '../../shared/components/Icon';
import { SearchInput } from '../../shared/components/SearchInput';
import type { Crumb } from '../navigation';
import { Tooltip } from '../../shared/components/Tooltip';
import { IconButton } from '../../shared/components/IconButton';

const today = new Intl.DateTimeFormat('es-EC', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'America/Guayaquil',
});

type Props = {
  crumbs: Crumb[];
  /** Clave de la ruta actual: anima la miga final al cambiar de pantalla. */
  routeKey: string;
  collapsed: boolean;
  hasNotifications: boolean;
  onToggleSidebar: () => void;
  onOpenMobileMenu: () => void;
  onNotifications: () => void;
};

export function Topbar({
  crumbs,
  routeKey,
  collapsed,
  hasNotifications,
  onToggleSidebar,
  onOpenMobileMenu,
  onNotifications,
}: Props) {
  const navigate = useNavigate();

  return (
    <header className="topbar">
      <Tooltip content={collapsed ? 'Expandir menú' : 'Colapsar menú'} side="right"><button
        type="button"
        className="sidebar-toggle"
        onClick={onToggleSidebar}
        aria-label={collapsed ? 'Expandir menú lateral' : 'Colapsar menú lateral'}
        aria-expanded={!collapsed}
      >
        <motion.span animate={{ rotate: collapsed ? 180 : 0 }} style={{ display: 'inline-flex' }}>
          <Icon name="chevron-left" />
        </motion.span>
      </button></Tooltip>

      <div className="topbar-left">
        <IconButton icon="menu" label="Abrir menú" className="mobile-menu" onClick={onOpenMobileMenu} />
        <nav className="breadcrumbs" aria-label="Ruta de navegación">
          <ol>
            {crumbs.map((c, i) => {
              const last = i === crumbs.length - 1;
              return (
                <Fragment key={`${c.label}-${i}`}>
                  {i > 0 ? (
                    <li className="breadcrumbs-sep" aria-hidden>
                      <Icon name="chevron" />
                    </li>
                  ) : null}
                  <li className={last ? 'is-current' : undefined}>
                    {last ? (
                      <AnimatePresence mode="wait" initial={false}>
                        <motion.strong
                          key={routeKey}
                          aria-current="page"
                          initial={{ opacity: 0, y: 4 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -4 }}
                        >
                          {c.label}
                        </motion.strong>
                      </AnimatePresence>
                    ) : c.to ? (
                      <Link to={c.to}>{c.label}</Link>
                    ) : (
                      <span>{c.label}</span>
                    )}
                  </li>
                </Fragment>
              );
            })}
          </ol>
        </nav>
      </div>

      <div className="top-tools">
        <form
          className="top-search"
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            const q = new FormData(e.currentTarget).get('query')?.toString().trim() ?? '';
            navigate(`/inventario?q=${encodeURIComponent(q)}`);
          }}
        >
          <SearchInput
            name="query"
            shortcut
            size="small"
            placeholder="Buscar producto, pedido o cliente…"
            aria-label="Buscar en la operación"
            autoComplete="off"
          />
        </form>
        <span className="date-label">
          <Icon name="calendar" />
          {today.format(new Date())}
        </span>
        <IconButton icon="bell" label="Ver notificaciones" onClick={onNotifications}>{hasNotifications ? <span className="notification-dot" /> : null}</IconButton>
      </div>
    </header>
  );
}
