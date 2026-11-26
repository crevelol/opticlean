import type { ComponentPropsWithRef, ReactNode } from 'react';
import { Icon } from './Icon';
import { Tooltip } from './Tooltip';
import { cx } from './ui';

/**
 * Botón de solo icono. `label` es obligatorio: se usa como aria-label y como
 * tooltip (desactivable con `tooltip={false}` si el contexto ya lo explica).
 *
 *   <IconButton icon="close" label="Cerrar detalle" onClick={…} />
 */
export function IconButton({
  icon,
  label,
  variant = 'ghost',
  size = 'medium',
  tooltip = true,
  tooltipSide,
  className,
  children,
  ...rest
}: {
  icon: string;
  label: string;
  /** ghost: sin fondo (por defecto) · secondary: cristal con borde, como Button. */
  variant?: 'ghost' | 'secondary';
  size?: 'small' | 'medium';
  tooltip?: boolean;
  tooltipSide?: 'top' | 'right' | 'bottom' | 'left';
  /** Contenido extra superpuesto (p. ej. un punto de notificación). */
  children?: ReactNode;
} & Omit<ComponentPropsWithRef<'button'>, 'aria-label' | 'children'>) {
  const button = (
    <button
      type="button"
      {...rest}
      className={cx(
        'icon-btn',
        size === 'small' && 'small',
        variant === 'secondary' && 'is-boxed',
        className,
      )}
      aria-label={label}
    >
      <Icon name={icon} />
      {children}
    </button>
  );
  return tooltip ? (
    <Tooltip content={label} side={tooltipSide}>
      {button}
    </Tooltip>
  ) : (
    button
  );
}
