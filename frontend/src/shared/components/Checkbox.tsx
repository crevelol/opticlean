import { useId, type MouseEvent, type ReactNode } from 'react';
import { Checkbox as RC, Switch as RS } from 'radix-ui';
import { Icon } from './Icon';
import { cx } from './ui';

/**
 * Checkbox y Switch sobre Radix (teclado, ARIA, estado indeterminado).
 * Dentro de un <form> Radix añade un input oculto, así que `name`/`value`
 * siguen llegando a FormData igual que con el input nativo.
 *
 *  - <Checkbox>: seleccionar elementos u opciones puntuales de un formulario.
 *  - <Switch>: activar/desactivar una configuración (Activo, Inspección…).
 */

type BaseProps = {
  checked?: boolean;
  defaultChecked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  disabled?: boolean;
  required?: boolean;
  name?: string;
  value?: string;
  id?: string;
  /** Texto visible a la derecha. Si no hay, usa `aria-label`. */
  label?: ReactNode;
  /** Texto de ayuda bajo la etiqueta. */
  hint?: ReactNode;
  'aria-label'?: string;
  className?: string;
  onClick?: (event: MouseEvent<HTMLButtonElement>) => void;
};

function Labelled({
  id,
  label,
  hint,
  className,
  control,
}: {
  id: string;
  label?: ReactNode;
  hint?: ReactNode;
  className: string;
  control: ReactNode;
}) {
  if (!label) return <>{control}</>;
  return (
    <div className={className}>
      {control}
      <label htmlFor={id} className="ui-check-text">
        <span>{label}</span>
        {hint ? <small>{hint}</small> : null}
      </label>
    </div>
  );
}

export function Checkbox({
  checked,
  defaultChecked,
  onCheckedChange,
  indeterminate,
  label,
  hint,
  id,
  className,
  ...rest
}: BaseProps & {
  /** Parcialmente seleccionado (p. ej. "seleccionar todos" con algunos marcados). */
  indeterminate?: boolean;
}) {
  const auto = useId();
  const controlId = id ?? auto;
  return (
    <Labelled
      id={controlId}
      label={label}
      hint={hint}
      className={cx('ui-check-field', className)}
      control={
        <RC.Root
          {...rest}
          id={controlId}
          className={cx('ui-checkbox', !label && className)}
          checked={indeterminate ? 'indeterminate' : checked}
          defaultChecked={defaultChecked}
          onCheckedChange={(v) => onCheckedChange?.(v === true)}
        >
          <RC.Indicator className="ui-checkbox-indicator" forceMount>
            <Icon name={indeterminate ? 'minus' : 'check'} />
          </RC.Indicator>
        </RC.Root>
      }
    />
  );
}

export function Switch({
  checked,
  defaultChecked,
  onCheckedChange,
  label,
  hint,
  id,
  className,
  ...rest
}: BaseProps) {
  const auto = useId();
  const controlId = id ?? auto;
  return (
    <Labelled
      id={controlId}
      label={label}
      hint={hint}
      className={cx('ui-check-field ui-switch-field', className)}
      control={
        <RS.Root
          {...rest}
          id={controlId}
          className={cx('ui-switch', !label && className)}
          checked={checked}
          defaultChecked={defaultChecked}
          onCheckedChange={onCheckedChange}
        >
          <RS.Thumb className="ui-switch-thumb" />
        </RS.Root>
      }
    />
  );
}
