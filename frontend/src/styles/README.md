# Estilos · guía rápida

El frontend usa **CSS propio** (sin librería de UI). Para que todas las pantallas se vean
igual, todo valor visual sale de [`tokens.css`](./tokens.css).

## Reglas

1. **No escribas colores hex, tamaños de letra, pesos ni radios sueltos.** Usa tokens:

   | Para…            | Usa                                                                 |
   | ---------------- | ------------------------------------------------------------------- |
   | Texto            | `--color-text`, `--color-text-secondary`, `--color-text-muted`, `--color-text-subtle` |
   | Fondos           | `--color-bg` (página), `--color-surface` (tarjetas), `--color-surface-muted` |
   | Bordes           | `--color-border`, `--color-border-subtle`, `--color-border-strong`  |
   | Acción principal | `--color-primary`, `--color-primary-hover`, `--color-primary-soft`  |
   | Estados          | `--color-success*`, `--color-warning*`, `--color-danger*`, `--color-info*` |
   | Tamaño de letra  | `--text-2xs` (9) · `xs` (10) · `sm` (11) · `md` (12) · `base` (13) · `lg` (14) · `xl` (16) · `2xl` (18) · `3xl` (22) · `4xl` (26) · `5xl` (30) · `6xl` (34) |
   | Peso             | `--weight-regular` · `medium` · `semibold` · `bold`                 |
   | Radios           | `--radius-xs` (4) · `sm` (6) · `md` (8) · `lg` (10) · `xl` (12) · `2xl` (16) · `full` |
   | Sombras          | `--shadow-xs` · `sm` · `md` · `lg` · `focus`                        |
   | Espaciado        | `--space-1` (4) … `--space-10` (40)                                 |

   Prefiere los **semánticos** (`--color-*`). Usa la paleta (`--slate-500`, `--blue-600`, …)
   solo cuando no exista un semántico adecuado.

2. **No crees variables de color por módulo** (`--xyz-ink`, `--xyz-blue`…). Si falta un
   color, añádelo a `tokens.css`. Las variables por componente sí están bien cuando cambian
   según el estado (ej. `--inv-tone`, `--fam-color`).

3. **Usa los componentes compartidos** de [`shared/components/ui.tsx`](../shared/components/ui.tsx)
   en lugar de recrearlos:

   | Componente   | Clase base   | Notas                                                                   |
   | ------------ | ------------ | ----------------------------------------------------------------------- |
   | `Button`     | `.btn`       | Estilo **glass** común (degradado translúcido, blur, brillo superior, sombra de color). `variant`: secondary · primary · dark · danger · green · ghost · **link** (acción de texto en línea: «Ver más», «Revisar…») — `size`: small · medium · large — `full` Para una variante nueva, define solo las variables `--btn-*` |
   | `Badge`      | `.badge`     | `color`: blue · green · amber · red · purple                            |
   | `Panel`      | `.panel`     | `title`, `subtitle`, `icon`, `actions`, `padded`                        |
   | `Field`      | `.field`     | `label`, `hint`, `error`, `full` (dentro de `.form-grid`)               |
   | `PageHead`   | `.page-head` | **Obligatoria en toda pantalla.** `eyebrow`, `title`, `desc`, `actions`; `children` para selectores de contexto bajo el título |
   | `SearchInput`| `.search-field` | Buscador con icono dentro, limpiar animado y atajo `/` (`shortcut`)  |
   | `KpiGrid` + `Kpi` | `.kpis` / `.kpi` | **Único diseño de indicadores.** `label`, `icon`, `value`, `unit`, `caption`; `tone` (primary/success/warning/danger), `progress` (0–100), `onClick`+`active` para usarlo como filtro |
   | `Dialog` / `Modal` | `.modal` | **Radix Dialog.** Foco atrapado y restaurado, Escape, clic fuera y ARIA ya resueltos. `size`: default · wide · fill; `busy` bloquea el cierre. Para cabeceras propias o drawers usa las piezas `DialogRoot` + `DialogContent` (`motionPreset="slide"`) + `DialogTitle` |
   | `Select`     | `.ui-select` | **Radix Popover** + lista propia: búsqueda automática con >8 opciones, `<option>`/`<optgroup>` como hijos, `<select>` oculto para formularios. Funciona dentro de diálogos |
   | `Tabs` + `TabPanel` | `.ui-tabs` | **Radix Tabs.** Cambian de PANEL. Línea inferior deslizante, flechas/Home/End, ARIA pestaña↔panel. Items: `value`, `label`, `icon`, `count` |
   | `SegmentedControl` | `.ui-segmented` | **Radix Toggle Group.** Filtran o cambian la VISTA del mismo contenido (estado, Lista/Tarjetas, periodo). Pastilla glass deslizante; `size="small"`, `full`, `tone` por segmento |
   | `Menu` + `MoreButton` | `.ui-menu` | **Radix Dropdown Menu.** Escape, clic fuera, flechas y foco devuelto al botón. `items`: `label`, `icon`, `hint`, `tone: 'danger'`, `onSelect`, `'separator'`. `MoreButton` es el "⋮" estándar de acciones de fila. Para el chevron de un botón que abre menú usa `<Icon name="chevron" className="ui-menu-chevron" />` |
   | `Checkbox` | `.ui-checkbox` | **Radix Checkbox.** Seleccionar elementos u opciones puntuales. `checked`/`onCheckedChange(boolean)`, `indeterminate`, `label`, `hint`; con `name`/`value` sigue llegando a `FormData` |
   | `Switch` | `.ui-switch` | **Radix Switch.** Activar/desactivar una configuración (Activo, Inspección…). Misma API que `Checkbox` |
   | `Tooltip` | `.ui-tooltip` | **Radix Tooltip.** Sustituye al `title` nativo: aparece con hover **y con teclado**, se enlaza con `aria-describedby`. `content` vacío = sin tooltip; envuelve solo los botones deshabilitados para que también lo muestren. No uses `title=` en elementos para tooltips |
   | `IconButton` | `.icon-btn` | Botón de solo icono. `icon` y `label` obligatorios (aria-label + tooltip automático). `variant`: ghost · secondary; `size`: small · medium |
   | `Pagination` | `.ui-pagination` | «Mostrando a–b de n» + páginas (con «…» si son muchas). `page`, `pageCount`, `total`, `pageSize`, `onPageChange` |
   | `ChipGroup` | `.ui-chip-group` | **Radix Toggle Group.** Píldoras de filtro: `type="single"` (siempre una activa) o `type="multiple"`. Items con `count`, `icon`, `leading` y `tone` (color del contador). Para pocas opciones compactas usa `SegmentedControl` |
   | `RemovableChip` | `.ui-chip.is-static` | Etiqueta con ✕ para quitarla (`onRemove`) |
   | `Empty`      | `.empty-state` | Estado vacío                                                          |

   **No redefinas** altura, padding ni tamaño de letra de `.btn`, `.badge` o `.panel` dentro
   de un módulo: elige la variante/tamaño adecuado. Ajustes de layout (`width`, `flex`,
   márgenes) sí están bien.

4. **Fuente:** Inter (cargada en `index.html`), con `--font-sans` y `--font-mono`.

## Layout

El shell vive en `src/app/` (`AppLayout`, `shell/Sidebar`, `shell/Topbar`) y sus estilos en
`layout.css`. Las migas de pan y el título de la pestaña salen de `src/app/navigation.ts`:
**al crear una pantalla, regístrala allí** (`routeMeta`, con `parent` si es un sub-flujo).

- Cada pantalla se carga bajo demanda (`lazy` en `routes.tsx`) y entra con la animación
  `fadeUp`; no añadas animaciones de entrada propias a la página.
- No redefinas `.page`, `.page-head`, `.eyebrow` ni el shell desde un módulo.
- Alturas disponibles: `--topbar-h`, `--sidebar-w`, `--sidebar-w-collapsed`.

## Organización de archivos

- `tokens.css` — variables (se importa primero en `main.tsx`).
- `global.css` — reset y componentes compartidos.
- `layout.css` — sidebar, topbar, página y cabecera de página.
- `<feature>.css` — estilos propios de cada pantalla, prefijados (`inv-`, `log-`, `no-`, `cli-`…).

## Comprobación

```sh
npm run check:styles            # lista colores/tamaños sin token
npm run check:styles -- --strict  # falla si hay alguno (para CI)
```

Los hallazgos que quedan son tonos puntuales heredados; elimínalos al tocar esas pantallas.

## Iconos

Usamos [lucide-react](https://lucide.dev/icons) a través de `<Icon name="..." />`
([shared/components/Icon.tsx](../shared/components/Icon.tsx)). Así todos los iconos
comparten tamaño y trazo (`.icon` en `global.css`).

- Para un icono nuevo: impórtalo de `lucide-react` y agrégalo al mapa `icons`.
- No pegues `<svg>` a mano para iconos de UI; migra los que encuentres.
- `<Spinner />` para estados de carga (en botones, en lugar de texto "Cargando…").
- `Logo` y las ilustraciones (mapas de bodega, gráficos) siguen siendo SVG propios.

## Animación

Usamos [motion](https://motion.dev) (`import { motion, AnimatePresence } from 'motion/react'`)
con los presets de [shared/motion/presets.ts](../shared/motion/presets.ts):

| Preset              | Uso                                                        |
| ------------------- | ---------------------------------------------------------- |
| `fadeUp`            | Entrada de tarjetas, filas, formularios                    |
| `fade` / `pop`      | Overlays / modales y menús                                 |
| `stagger`           | Contenedor que escalona a sus hijos                        |
| `swap`              | Intercambio de contenido inline (texto ↔ spinner)          |
| `spring.snappy`     | Toggles, tabs, chips                                       |
| `spring.smooth`     | Layout y paneles (`layout`, `layoutId`)                    |
| `spring.scene`      | Cambios de escena/cámara (Bodega visual 2D ↔ 3D)           |

`MotionConfig reducedMotion="user"` (en `main.tsx`) respeta la preferencia de
"reducir movimiento" del sistema. En CSS usa `--duration-*` y `--ease-*`.

   **Capas animadas:** todo diálogo, drawer o desplegable entra **y sale** animado, y la entrada es el espejo exacto de la salida (`layer` en `shared/motion/presets.ts`: misma duración, curva y valores). La salida la hace `<ExitGhost>` (`shared/motion/ExitGhost.tsx`): al desmontarse la capa deja una copia inerte que se desvanece, así funciona aunque la pantalla la cierre de golpe (`{open ? <Modal/> : null}`). Si creas una capa nueva, coloca un `<ExitGhost>` dentro. **No uses `<button>` sueltos** para acciones: usa `Button`, `IconButton` o `Menu`. Solo las tarjetas, filas o celdas clicables (que no se ven como botón) pueden ser `<button>` con estilo propio. No implementes a mano trampas de foco, listeners de Escape ni bloqueo de scroll: usa estos componentes.
