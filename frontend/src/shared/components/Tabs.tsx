import { useId, type ReactNode } from 'react';
import { Tabs as RT, ToggleGroup } from 'radix-ui';
import { motion } from 'motion/react';
import { Icon } from './Icon';
import { cx } from './ui';
import { spring } from '../motion/presets';

/**
 * Pestañas y selectores segmentados sobre Radix (teclado con flechas, roving
 * focus, ARIA) con indicador deslizante (motion).
 *
 *  - <Tabs> + <TabPanel>: cambian de PANEL (detalle de cliente, reportes…).
 *  - <SegmentedControl>: filtran o cambian la VISTA del mismo contenido
 *    (estado de pedidos, Lista/Tarjetas, periodo…).
 */

export type TabItem<V extends string = string> = {
  value: V;
  label: ReactNode;
  icon?: string;
  /** Contador o etiqueta corta a la derecha. */
  count?: ReactNode;
  disabled?: boolean;
  /** Texto accesible si `label` no es texto plano. */
  ariaLabel?: string;
  /** Color del segmento activo (p. ej. prioridad Alta en rojo). */
  tone?: 'danger' | 'warning' | 'success';
};

function ItemBody({ item }: { item: TabItem }) {
  return (
    <>
      {item.icon ? <Icon name={item.icon} /> : null}
      <span className="ui-tab-label">{item.label}</span>
      {item.count !== undefined && item.count !== null && item.count !== '' ? (
        <span className="ui-tab-count">{item.count}</span>
      ) : null}
    </>
  );
}

/* ── Tabs (paneles) ─────────────────────────────────────────────── */

export function Tabs<V extends string>({
  value,
  onValueChange,
  items,
  label,
  className,
  children,
}: {
  value: V;
  onValueChange: (value: V) => void;
  items: TabItem<V>[];
  /** Nombre accesible de la lista de pestañas. */
  label: string;
  className?: string;
  /** Paneles: <TabPanel value="…">. */
  children?: ReactNode;
}) {
  const uid = useId();
  return (
    <RT.Root
      className={cx('ui-tabs', className)}
      value={value}
      onValueChange={(v) => onValueChange(v as V)}
      activationMode="automatic"
    >
      <RT.List className="ui-tabs-list" aria-label={label}>
        {items.map((item) => (
          <RT.Trigger
            key={item.value}
            value={item.value}
            disabled={item.disabled}
            className="ui-tab"
            aria-label={item.ariaLabel}
          >
            <ItemBody item={item} />
            {item.value === value ? (
              <motion.span
                layoutId={`tab-indicator-${uid}`}
                className="ui-tab-indicator"
                transition={spring.snappy}
                aria-hidden
              />
            ) : null}
          </RT.Trigger>
        ))}
      </RT.List>
      {children}
    </RT.Root>
  );
}

/** Panel de una pestaña. Solo se monta el activo. */
export function TabPanel({
  value,
  className,
  children,
}: {
  value: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <RT.Content value={value} className={cx('ui-tab-panel', className)}>
      {children}
    </RT.Content>
  );
}

/* ── SegmentedControl (filtros / vistas) ─────────────────────────── */

export function SegmentedControl<V extends string>({
  value,
  onValueChange,
  items,
  label,
  size = 'medium',
  full,
  className,
}: {
  value: V;
  onValueChange: (value: V) => void;
  items: TabItem<V>[];
  /** Nombre accesible del grupo. */
  label: string;
  size?: 'small' | 'medium';
  /** Ocupa todo el ancho y reparte los segmentos por igual. */
  full?: boolean;
  className?: string;
}) {
  const uid = useId();
  return (
    <ToggleGroup.Root
      type="single"
      className={cx('ui-segmented', size === 'small' && 'small', full && 'full', className)}
      value={value}
      // Radix permite deseleccionar (valor ''); un selector siempre tiene uno activo.
      onValueChange={(v) => {
        if (v) onValueChange(v as V);
      }}
      aria-label={label}
    >
      {items.map((item) => (
        <ToggleGroup.Item
          key={item.value}
          value={item.value}
          disabled={item.disabled}
          className="ui-segment"
          aria-label={item.ariaLabel}
          data-tone={item.tone}
        >
          {item.value === value ? (
            <motion.span
              layoutId={`segment-thumb-${uid}`}
              className="ui-segment-thumb"
              transition={spring.snappy}
              aria-hidden
            />
          ) : null}
          <ItemBody item={item} />
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  );
}
