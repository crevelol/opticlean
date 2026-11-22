import type { ComponentPropsWithRef, ReactElement, ReactNode } from 'react';
import { DropdownMenu as RM } from 'radix-ui';
import { Icon } from './Icon';
import { cx } from './ui';
import { ExitGhost } from '../motion/ExitGhost';
import { exitParts } from '../motion/exitAnimation';

/**
 * Menú desplegable sobre Radix DropdownMenu: Escape, clic fuera, flechas,
 * Home/End, búsqueda por tecla, foco devuelto al botón y ARIA ya resueltos.
 * Misma superficie y animaciones (entrada/salida) que el desplegable de Select.
 *
 *   <Menu label="Crear" trigger={<Button variant="primary" icon="plus">Crear</Button>}
 *         items={[{ label: 'Nuevo producto', icon: 'box', onSelect: … }]} />
 */

export type MenuItem =
  | {
      label: ReactNode;
      onSelect: () => void;
      icon?: string;
      /** Texto secundario bajo la etiqueta. */
      hint?: ReactNode;
      tone?: 'danger';
      disabled?: boolean;
    }
  | 'separator';

export function Menu({
  trigger,
  items,
  label,
  align = 'end',
  className,
}: {
  /** Botón que abre el menú (un único elemento). */
  trigger: ReactElement;
  items: Array<MenuItem | false | null | undefined>;
  /** Nombre accesible del menú. */
  label: string;
  align?: 'start' | 'center' | 'end';
  className?: string;
}) {
  const list = items.filter(Boolean) as MenuItem[];
  return (
    <RM.Root modal={false}>
      <RM.Trigger asChild>{trigger}</RM.Trigger>
      <RM.Portal>
        <RM.Content
          className={cx('ui-menu', className)}
          align={align}
          sideOffset={6}
          collisionPadding={8}
          aria-label={label}
        >
          {list.map((item, i) =>
            item === 'separator' ? (
              <RM.Separator key={`sep-${i}`} className="ui-menu-separator" />
            ) : (
              <RM.Item
                key={i}
                className="ui-menu-item"
                data-tone={item.tone}
                disabled={item.disabled}
                onSelect={item.onSelect}
              >
                {item.icon ? <Icon name={item.icon} /> : null}
                <span className="ui-menu-text">
                  <span>{item.label}</span>
                  {item.hint ? <small>{item.hint}</small> : null}
                </span>
              </RM.Item>
            ),
          )}
          <ExitGhost
            closest="[data-radix-popper-content-wrapper]"
            parts={exitParts.popover('.ui-menu')}
          />
        </RM.Content>
      </RM.Portal>
    </RM.Root>
  );
}

/**
 * Botón "⋮" estándar para menús de acciones de fila. Reenvía props y ref
 * (React 19) para poder usarse como trigger de Radix.
 */
export function MoreButton({
  label,
  className,
  ...rest
}: { label: string } & Omit<ComponentPropsWithRef<'button'>, 'aria-label'>) {
  return (
    <button
      type="button"
      {...rest}
      className={cx('icon-btn ui-more-btn', className)}
      aria-label={label}
      title={label}
    >
      <Icon name="more" />
    </button>
  );
}
