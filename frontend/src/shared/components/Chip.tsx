import type { ReactNode } from 'react';
import { ToggleGroup } from 'radix-ui';
import { Icon } from './Icon';
import { cx } from './ui';

/**
 * Chips sobre Radix ToggleGroup (flechas, roving focus, aria-pressed).
 *
 *  - <ChipGroup type="single">: filtro de una opción (estado, periodo…).
 *    Siempre queda una activa.
 *  - <ChipGroup type="multiple">: selección de varias (categorías, destinos…).
 *  - <RemovableChip>: etiqueta con ✕ para quitarla (sectores asignados…).
 *
 * Diferencia con SegmentedControl: los chips son píldoras separadas y pueden
 * ser muchos / ocupar varias líneas; el segmentado es un carril compacto.
 */

export type ChipItem<V extends string = string> = {
  value: V;
  label: ReactNode;
  count?: ReactNode;
  icon?: string;
  /** Adorno antes del texto (p. ej. un punto de aviso). */
  leading?: ReactNode;
  /** Color del contador cuando el chip no está activo. */
  tone?: 'success' | 'info' | 'warning' | 'danger';
  disabled?: boolean;
};

function ChipBody({ item }: { item: ChipItem }) {
  return (
    <>
      {item.leading}
      {item.icon ? <Icon name={item.icon} /> : null}
      <span>{item.label}</span>
      {item.count !== undefined && item.count !== null && item.count !== '' ? (
        <span className="ui-chip-count">{item.count}</span>
      ) : null}
    </>
  );
}

type Common<V extends string> = {
  items: ChipItem<V>[];
  /** Nombre accesible del grupo. */
  label: string;
  disabled?: boolean;
  className?: string;
};

export function ChipGroup<V extends string>(
  props: Common<V> &
    (
      | { type: 'single'; value: V; onValueChange: (value: V) => void }
      | { type: 'multiple'; value: V[]; onValueChange: (value: V[]) => void }
    ),
) {
  const { items, label, disabled, className } = props;
  const children = items.map((item) => (
    <ToggleGroup.Item
      key={item.value}
      value={item.value}
      disabled={item.disabled}
      className="ui-chip"
      data-tone={item.tone}
    >
      <ChipBody item={item} />
    </ToggleGroup.Item>
  ));
  const cls = cx('ui-chip-group', className);
  return props.type === 'single' ? (
    <ToggleGroup.Root
      type="single"
      className={cls}
      aria-label={label}
      disabled={disabled}
      value={props.value}
      // Un filtro siempre tiene una opción activa: se ignora la deselección.
      onValueChange={(v) => {
        if (v) props.onValueChange(v as V);
      }}
    >
      {children}
    </ToggleGroup.Root>
  ) : (
    <ToggleGroup.Root
      type="multiple"
      className={cls}
      aria-label={label}
      disabled={disabled}
      value={props.value}
      onValueChange={(v) => props.onValueChange(v as V[])}
    >
      {children}
    </ToggleGroup.Root>
  );
}

/** Etiqueta con botón ✕ para quitarla. */
export function RemovableChip({
  children,
  onRemove,
  disabled,
  removeLabel,
}: {
  children: ReactNode;
  onRemove: () => void;
  disabled?: boolean;
  /** Texto accesible del botón quitar (por defecto «Quitar …»). */
  removeLabel?: string;
}) {
  return (
    <span className="ui-chip is-static" data-state="on">
      <span>{children}</span>
      <button
        type="button"
        className="ui-chip-remove"
        onClick={onRemove}
        disabled={disabled}
        aria-label={removeLabel ?? (typeof children === 'string' ? `Quitar ${children}` : 'Quitar')}
      >
        <Icon name="close" />
      </button>
    </span>
  );
}
