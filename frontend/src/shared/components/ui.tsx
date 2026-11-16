import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Icon } from './Icon';

export function esc(v: unknown) {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function PageHead({
  eyebrow,
  title,
  desc,
  actions,
}: {
  eyebrow: string;
  title: string;
  desc: string;
  actions?: ReactNode;
}) {
  return (
    <div className="page-head">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        <p>{desc}</p>
      </div>
      {actions ? <div className="head-actions">{actions}</div> : null}
    </div>
  );
}

export function Kpi({
  label,
  value,
  unit,
  foot,
  icon = 'box',
  color = '',
}: {
  label: string;
  value: string | number;
  unit: string;
  foot: string;
  icon?: string;
  color?: string;
}) {
  return (
    <div className="kpi">
      <div className="kpi-label">
        {label}
        <Icon name={icon} />
      </div>
      <div className="kpi-value">
        {value}
        {unit ? <small>{unit}</small> : null}
      </div>
      <div className={`kpi-foot ${color}`}>
        {color === 'positive' ? <Icon name="check" /> : null}
        {foot}
      </div>
    </div>
  );
}

/** Tonos de estado compartidos por Badge y otros indicadores. */
export type Tone = '' | 'blue' | 'green' | 'amber' | 'red' | 'purple';

export function Badge({ text, color = '' }: { text: ReactNode; color?: Tone | string }) {
  return <span className={cx('badge', color)}>{text}</span>;
}

export type ButtonVariant = 'secondary' | 'primary' | 'dark' | 'danger' | 'green' | 'ghost';
export type ButtonSize = 'small' | 'medium' | 'large';

type ButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type'> & {
  children?: ReactNode;
  /** Nombre del icono (ver Icon.tsx), se muestra antes del texto. */
  icon?: string;
  /**
   * Estilo visual. Por compatibilidad también acepta los valores antiguos
   * de <Btn variant>: '' (= secondary), 'small' y 'full'.
   */
  variant?: ButtonVariant | '' | 'small' | 'full';
  size?: ButtonSize;
  /** Ocupa todo el ancho disponible. */
  full?: boolean;
  type?: 'button' | 'submit';
};

/** Botón estándar de la app. Ver `.btn` en styles/global.css. */
export function Button({
  children,
  icon,
  variant = 'secondary',
  size = 'medium',
  full,
  type = 'button',
  className,
  ...rest
}: ButtonProps) {
  const legacySize = variant === 'small' ? 'small' : undefined;
  const legacyFull = variant === 'full';
  const visual = variant === '' || variant === 'small' || variant === 'full' ? 'secondary' : variant;
  return (
    <button
      type={type}
      className={cx(
        'btn',
        visual !== 'secondary' && visual,
        (legacySize ?? size) !== 'medium' && (legacySize ?? size),
        (full || legacyFull) && 'full',
        className,
      )}
      {...rest}
    >
      {icon ? <Icon name={icon} /> : null}
      {children}
    </button>
  );
}

/** @deprecated Usa `Button`. Se mantiene como alias para no romper pantallas existentes. */
export const Btn = Button;

/** Contenedor de tarjeta estándar (`.panel`) con cabecera opcional. */
export function Panel({
  title,
  subtitle,
  icon,
  actions,
  children,
  className,
  bodyClassName,
  padded = true,
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  icon?: string;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
  bodyClassName?: string;
  /** Aplica el padding estándar al cuerpo. Desactívalo para tablas a sangre. */
  padded?: boolean;
}) {
  const hasHead = title || subtitle || actions;
  return (
    <section className={cx('panel', className)}>
      {hasHead ? (
        <div className="panel-head">
          <div>
            {title ? (
              <div className="panel-title">
                {icon ? <Icon name={icon} /> : null}
                {title}
              </div>
            ) : null}
            {subtitle ? <div className="panel-subtitle">{subtitle}</div> : null}
          </div>
          {actions ? <div className="button-row">{actions}</div> : null}
        </div>
      ) : null}
      <div className={cx(padded && 'panel-body', bodyClassName)}>{children}</div>
    </section>
  );
}

/** Campo de formulario estándar (`.field`): etiqueta + control + ayuda/error. */
export function Field({
  label,
  htmlFor,
  hint,
  error,
  full,
  children,
}: {
  label: ReactNode;
  htmlFor?: string;
  hint?: ReactNode;
  error?: ReactNode;
  /** Ocupa las dos columnas dentro de `.form-grid`. */
  full?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={cx('field', full && 'full', error ? 'has-error' : null)}>
      <label htmlFor={htmlFor}>{label}</label>
      {children}
      {error ? <small className="field-error">{error}</small> : hint ? <small>{hint}</small> : null}
    </div>
  );
}

/** Une clases ignorando valores vacíos. */
export function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ');
}

export function Empty({ title, desc, action }: { title: string; desc: string; action?: ReactNode }) {
  return (
    <div className="empty-state">
      <Icon name="box" />
      <h3>{title}</h3>
      <p>{desc}</p>
      {action}
    </div>
  );
}

export function ProductCell({ name, id, category }: { name: string; id: string; category: string }) {
  return (
    <div className="table-product">
      <span className="product-icon">
        <Icon name="box" />
      </span>
      <div>
        <strong>{name}</strong>
        <span className="sub">
          {id} · {category}
        </span>
      </div>
    </div>
  );
}
