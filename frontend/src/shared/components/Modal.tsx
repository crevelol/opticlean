import type { ReactNode } from 'react';
import { Btn } from './ui';
import { Icon } from './Icon';
import { Dialog } from './Dialog';

/**
 * Modal estándar. Desde la migración a Radix es un alias de <Dialog> con la
 * API histórica (wide / fill). Para diálogos nuevos usa <Dialog> directamente.
 */
export function Modal({
  title,
  subtitle,
  children,
  footer,
  wide,
  fill,
  busy,
  header,
  className,
  bodyClassName,
  onClose,
}: {
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
  /** Usa casi todo el viewport (importaciones con tabla). */
  fill?: boolean;
  /** Bloquea el cierre mientras se guarda. */
  busy?: boolean;
  /** Reemplaza el título y subtítulo por un encabezado propio; `title` queda como nombre accesible. */
  header?: ReactNode;
  className?: string;
  bodyClassName?: string;
  onClose: () => void;
}) {
  return (
    <Dialog
      title={title}
      subtitle={subtitle}
      footer={footer}
      size={fill ? 'fill' : wide ? 'wide' : 'default'}
      busy={busy}
      header={header}
      className={className}
      bodyClassName={bodyClassName}
      onClose={onClose}
    >
      {children}
    </Dialog>
  );
}

export function ModalActions({
  onCancel,
  submitLabel,
  formId,
  icon,
}: {
  onCancel: () => void;
  submitLabel: string;
  formId: string;
  icon?: string;
}) {
  return (
    <>
      <Btn onClick={onCancel}>Cancelar</Btn>
      <button type="submit" form={formId} className="btn primary">
        {icon ? <Icon name={icon} /> : null}
        {submitLabel}
      </button>
    </>
  );
}
