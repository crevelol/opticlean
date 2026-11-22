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
  onClose,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
  /** Usa casi todo el viewport (importaciones con tabla). */
  fill?: boolean;
  /** Bloquea el cierre mientras se guarda. */
  busy?: boolean;
  onClose: () => void;
}) {
  return (
    <Dialog
      title={title}
      subtitle={subtitle}
      footer={footer}
      size={fill ? 'fill' : wide ? 'wide' : 'default'}
      busy={busy}
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
