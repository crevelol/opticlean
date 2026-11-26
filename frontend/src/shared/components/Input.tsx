import type { ComponentPropsWithRef, ReactNode } from 'react';
import { IconButton } from './IconButton';
import { cx } from './ui';

/**
 * Controles de formulario estándar. Úsalos dentro de <Field> o de un `.field`.
 *
 *  - <Input>: texto, número, fecha, correo, contraseña. `prefix`/`suffix`
 *    para unidades o monedas (USD, kg, u.). `aria-invalid` pinta el error.
 *  - <Textarea>: texto largo.
 *  - <NumberStepper>: cantidad con − / + (pedidos, recepciones).
 *  - Buscadores: usa <SearchInput>.
 */

type InputProps = Omit<ComponentPropsWithRef<'input'>, 'size' | 'prefix'> & {
  size?: 'small' | 'medium';
  /** Texto/elemento fijo antes del valor (p. ej. "USD"). */
  prefix?: ReactNode;
  /** Texto/elemento fijo después del valor (p. ej. "kg", "u."). */
  suffix?: ReactNode;
  /** Clase del contenedor cuando hay prefix/suffix. */
  wrapperClassName?: string;
};

export function Input({ size = 'medium', prefix, suffix, className, wrapperClassName, ...rest }: InputProps) {
  const input = <input {...rest} className={cx('ui-input', size === 'small' && 'small', className)} />;
  if (prefix == null && suffix == null) return input;
  return (
    <div className={cx('ui-input-affix', size === 'small' && 'small', wrapperClassName)}>
      {prefix != null ? (
        <span className="ui-input-addon" aria-hidden>
          {prefix}
        </span>
      ) : null}
      {input}
      {suffix != null ? (
        <span className="ui-input-addon" aria-hidden>
          {suffix}
        </span>
      ) : null}
    </div>
  );
}

export function Textarea({ className, ...rest }: ComponentPropsWithRef<'textarea'>) {
  return <textarea {...rest} className={cx('ui-input ui-textarea', className)} />;
}

/** Cantidad con botones − / +. El valor se limita a [min, max]. */
export function NumberStepper({
  value,
  onChange,
  min = 0,
  max,
  step = 1,
  label,
  disabled,
  className,
}: {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  /** Nombre accesible (p. ej. "Cantidad de Cloro 5 L"). */
  label: string;
  disabled?: boolean;
  className?: string;
}) {
  const clamp = (n: number) => Math.max(min, max != null ? Math.min(max, n) : n);
  return (
    <div className={cx('ui-stepper', className)} role="group" aria-label={label}>
      <IconButton
        icon="minus"
        label="Restar"
        size="small"
        tooltip={false}
        disabled={disabled || value <= min}
        onClick={() => onChange(clamp(value - step))}
      />
      <input
        className="ui-stepper-input"
        type="number"
        inputMode="numeric"
        value={value}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        aria-label={label}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isFinite(n)) onChange(clamp(n));
        }}
      />
      <IconButton
        icon="plus"
        label="Sumar"
        size="small"
        tooltip={false}
        disabled={disabled || (max != null && value >= max)}
        onClick={() => onChange(clamp(value + step))}
      />
    </div>
  );
}
