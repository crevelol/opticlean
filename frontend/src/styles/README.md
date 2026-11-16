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
   | `Button`     | `.btn`       | `variant`: secondary · primary · dark · danger · green · ghost — `size`: small · medium · large — `full` |
   | `Badge`      | `.badge`     | `color`: blue · green · amber · red · purple                            |
   | `Panel`      | `.panel`     | `title`, `subtitle`, `icon`, `actions`, `padded`                        |
   | `Field`      | `.field`     | `label`, `hint`, `error`, `full` (dentro de `.form-grid`)               |
   | `PageHead`   | `.page-head` | Cabecera de página con eyebrow, título, descripción y acciones          |
   | `Kpi`        | `.kpi`       | Tarjeta de métrica                                                      |
   | `Modal`      | `.modal`     | Diálogo con cabecera, cuerpo y pie                                      |
   | `Empty`      | `.empty-state` | Estado vacío                                                          |

   **No redefinas** altura, padding ni tamaño de letra de `.btn`, `.badge` o `.panel` dentro
   de un módulo: elige la variante/tamaño adecuado. Ajustes de layout (`width`, `flex`,
   márgenes) sí están bien.

4. **Fuente:** Inter (cargada en `index.html`), con `--font-sans` y `--font-mono`.

## Organización de archivos

- `tokens.css` — variables (se importa primero en `main.tsx`).
- `global.css` — reset, layout de la app y componentes compartidos.
- `<feature>.css` — estilos propios de cada pantalla, prefijados (`inv-`, `log-`, `no-`, `cli-`…).

## Comprobación

```sh
npm run check:styles            # lista colores/tamaños sin token
npm run check:styles -- --strict  # falla si hay alguno (para CI)
```

Los hallazgos que quedan son tonos puntuales heredados; elimínalos al tocar esas pantallas.
