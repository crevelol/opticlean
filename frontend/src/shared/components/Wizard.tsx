import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { motion } from 'motion/react';
import { Icon, Spinner } from './Icon';
import { ActionBar } from './ActionBar';
import { Modal } from './Modal';
import { Button, cx } from './ui';
import { spring } from '../motion/presets';

/**
 * Flujo de creación por pasos. Mismo comportamiento en toda la app:
 *
 *  - <WizardSteps>: indicador compacto; se puede volver a los pasos hechos.
 *  - <WizardFooter>: «Paso x de n» · Cancelar o Atrás · acción principal.
 *  - useStepFocus: al cambiar de paso, el foco va a su título.
 *  - useDiscardGuard: confirma antes de salir con cambios sin guardar.
 *
 * Cada paso valida sus datos antes de avanzar (la pantalla decide con
 * `canSelect` y `primary.disabled`).
 */

export type WizardStepDef = {
  title: string;
  subtitle?: string;
};

export function WizardSteps({
  steps,
  current,
  onSelect,
  canSelect = (index) => index < current,
  isDone = (index) => index < current,
  hasError,
  disabled,
  label,
  variant = 'page',
}: {
  steps: readonly WizardStepDef[];
  /** Índice del paso actual (empieza en 0). */
  current: number;
  onSelect: (index: number) => void;
  canSelect?: (index: number) => boolean;
  isDone?: (index: number) => boolean;
  hasError?: (index: number) => boolean;
  disabled?: boolean;
  /** Nombre accesible del indicador. */
  label: string;
  /** page: tarjeta sobre el contenido · dialog: franja dentro de un modal. */
  variant?: 'page' | 'dialog';
}) {
  const uid = useId();
  return (
    <nav className={cx('ui-wizard-steps', variant === 'dialog' && 'in-dialog')} aria-label={label}>
      <ol style={{ '--wizard-cols': steps.length } as CSSProperties}>
        {steps.map((step, index) => {
          const isCurrent = index === current;
          const error = hasError?.(index) ?? false;
          const done = !isCurrent && isDone(index);
          return (
            <li
              key={step.title}
              className={cx(
                'ui-wizard-step',
                isCurrent && 'is-current',
                done && 'is-done',
                error && 'has-error',
              )}
            >
              <button
                type="button"
                onClick={() => {
                  if (!isCurrent) onSelect(index);
                }}
                disabled={disabled || (!isCurrent && !canSelect(index))}
                aria-current={isCurrent ? 'step' : undefined}
              >
                <span className="ui-wizard-dot" aria-hidden="true">
                  {error ? '!' : done ? <Icon name="check" /> : index + 1}
                </span>
                <span className="ui-wizard-text">
                  <strong>{step.title}</strong>
                  {step.subtitle ? <small>{step.subtitle}</small> : null}
                </span>
                {isCurrent ? (
                  <motion.span
                    layoutId={`wizard-line-${uid}`}
                    className="ui-wizard-line"
                    transition={spring.snappy}
                    aria-hidden
                  />
                ) : null}
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export type WizardAction = {
  label: string;
  /** Texto mientras `busy`. */
  busyLabel?: string;
  icon?: string;
  onClick?: () => void;
  /** Para enviar un formulario externo usa type="submit" y `form`. */
  type?: 'button' | 'submit';
  form?: string;
  disabled?: boolean;
  busy?: boolean;
};

export function WizardFooter({
  step,
  total,
  onBack,
  onCancel,
  primary,
  info,
  children,
  disabled,
  variant = 'page',
}: {
  /** Índice del paso actual (empieza en 0). */
  step: number;
  total: number;
  onBack: () => void;
  onCancel: () => void;
  primary: WizardAction;
  /** Sustituye al texto «Paso x de n». */
  info?: ReactNode;
  /** Botones secundarios, entre Atrás/Cancelar y la acción principal. */
  children?: ReactNode;
  disabled?: boolean;
  variant?: 'page' | 'dialog';
}) {
  const busy = primary.busy;
  const text = info ?? `Paso ${step + 1} de ${total}`;
  const actions = (
    <>
      {step > 0 ? (
        <Button icon="back" onClick={onBack} disabled={disabled || busy}>
          Atrás
        </Button>
      ) : (
        <Button onClick={onCancel} disabled={disabled || busy}>
          Cancelar
        </Button>
      )}
      {children}
      <Button
        variant="primary"
        type={primary.type ?? 'button'}
        form={primary.form}
        onClick={primary.onClick}
        disabled={disabled || busy || primary.disabled}
        aria-busy={busy || undefined}
      >
        {busy ? <Spinner /> : primary.icon ? <Icon name={primary.icon} /> : null}
        {busy ? (primary.busyLabel ?? primary.label) : primary.label}
      </Button>
    </>
  );
  return variant === 'dialog' ? (
    <div className="modal-footer ui-wizard-footer">
      <span className="ui-actionbar-info" role="status">
        {text}
      </span>
      <div className="ui-actionbar-actions">{actions}</div>
    </div>
  ) : (
    <ActionBar info={text}>{actions}</ActionBar>
  );
}

/** Devuelve la ref del título del paso: recibe el foco cada vez que cambia el paso. */
export function useStepFocus<T extends HTMLElement = HTMLHeadingElement>(step: number) {
  const ref = useRef<T>(null);
  const previous = useRef(step);
  useEffect(() => {
    if (previous.current === step) return;
    previous.current = step;
    ref.current?.focus({ preventScroll: true });
  }, [step]);
  return ref;
}

/**
 * Protege los cambios sin guardar: avisa al recargar o cerrar la pestaña y pide
 * confirmación en las salidas que pasen por `guard`. Renderiza `dialog`.
 *
 * La navegación por el menú lateral no se intercepta (requiere un data router).
 */
export function useDiscardGuard(dirty: boolean) {
  const [pending, setPending] = useState<(() => void) | null>(null);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const guard = (leave: () => void) => {
    if (!dirty) leave();
    else setPending(() => leave);
  };

  const dialog = pending ? (
    <Modal
      title="¿Descartar los cambios?"
      subtitle="Lo que has completado en este formulario no se guardará."
      onClose={() => setPending(null)}
      footer={
        <>
          <Button onClick={() => setPending(null)}>Seguir editando</Button>
          <Button
            variant="danger"
            onClick={() => {
              const leave = pending;
              setPending(null);
              leave();
            }}
          >
            Descartar
          </Button>
        </>
      }
    >
      <p className="subtle" style={{ margin: 0 }}>
        Puedes seguir editando o salir sin guardar.
      </p>
    </Modal>
  ) : null;

  return { guard, dialog };
}
