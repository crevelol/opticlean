import { matchPath } from 'react-router-dom';

export type MenuItem = {
  id: string;
  label: string;
  path: string;
  icon: string;
  badge: string | null;
};

export type MenuSection = { section: string; items: MenuItem[] };

type RouteMeta = {
  /** Título de la pantalla (miga final y título de la pestaña). */
  title: string;
  /** Ruta padre para pantallas de detalle / sub-flujo (p. ej. Nuevo pedido → Pedidos). */
  parent?: string;
};

/** Metadatos de cada ruta. Fuente única para breadcrumbs y document.title. */
export const routeMeta: Record<string, RouteMeta> = {
  '/': { title: 'Inicio' },
  '/inventario': { title: 'Inventario' },
  '/recepcion': { title: 'Recepción' },
  '/bodega': { title: 'Bodega visual' },
  '/bodegas': { title: 'Bodegas' },
  '/familias': { title: 'Familias' },
  '/pedidos': { title: 'Pedidos' },
  '/pedidos/nuevo': { title: 'Nuevo pedido', parent: '/pedidos' },
  '/compras': { title: 'Abastecimiento' },
  '/logistica': { title: 'Logística' },
  '/logistica/rutas': { title: 'Mi ruta', parent: '/logistica' },
  '/logistica/historial': { title: 'Historial de rutas', parent: '/logistica' },
  '/clientes': { title: 'Clientes' },
  '/trazabilidad': { title: 'Trazabilidad' },
  '/reportes': { title: 'Reportes' },
  '/reglas': { title: 'Reglas de negocio' },
  '/configuracion': { title: 'Configuración' },
};

/** Menú usado si la API de menú no responde. */
export const fallbackMenu: MenuSection[] = [
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
      { id: 'f-rules', label: 'Reglas de negocio', path: '/reglas', icon: 'shield', badge: null },
      {
        id: 'f-cfg',
        label: 'Configuración',
        path: '/configuracion',
        icon: 'settings',
        badge: null,
      },
    ],
  },
];

export type Crumb = { label: string; to?: string };

function metaFor(path: string): { key: string; meta: RouteMeta } | null {
  for (const key of Object.keys(routeMeta)) {
    if (matchPath({ path: key, end: true }, path)) return { key, meta: routeMeta[key] };
  }
  return null;
}

/** Título de la pantalla para una ruta (usa el menú si la ruta no tiene metadatos). */
export function titleFor(path: string, menu: MenuSection[]): string {
  const hit = metaFor(path);
  if (hit) return hit.meta.title;
  for (const sec of menu) {
    const item = sec.items.find((i) => i.path === path);
    if (item) return item.label;
  }
  return 'Operación';
}

/**
 * Migas de pan: Sección del menú › [Padre] › Pantalla.
 * La sección sale del menú (API), así respeta la configuración de cada empresa.
 */
export function breadcrumbsFor(path: string, menu: MenuSection[]): Crumb[] {
  const hit = metaFor(path);
  const chain: Crumb[] = [];
  const parentPath = hit?.meta.parent;
  const sectionPath = parentPath ?? path;
  const section = menu.find((s) => s.items.some((i) => i.path === sectionPath));
  if (section) chain.push({ label: section.section });
  if (parentPath) chain.push({ label: titleFor(parentPath, menu), to: parentPath });
  chain.push({ label: titleFor(path, menu) });
  return chain;
}
