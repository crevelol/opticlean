import { useEffect, type ComponentPropsWithoutRef, type ReactNode } from 'react';
import { Dialog as RD } from 'radix-ui';
import { motion } from 'motion/react';
import { Icon } from './Icon';
import { cx } from './ui';
import { layer } from '../motion/presets';
import { ExitGhost } from '../motion/ExitGhost';
import { exitParts } from '../motion/exitAnimation';

/**
 * Diálogos de la app sobre Radix Dialog (accesibilidad) + nuestros estilos
 * (.modal-*) + motion.
 *
 * Radix se encarga de: foco atrapado y restaurado al cerrar, Escape, clic
 * fuera, bloqueo del scroll de fondo y aria-labelledby/-describedby.
 *
 * Dos niveles:
 *  - <Dialog>: diálogo estándar (título, subtítulo, cuerpo, pie). Lo usa <Modal>.
 *  - Piezas (DialogRoot, DialogContent, DialogTitle, DialogDescription,
 *    DialogClose) para diálogos con cabecera propia o con otra forma (drawer).
 */

export type DialogSize = 'default' | 'wide' | 'fill';

type RootProps = {
  /** Abierto por defecto: la mayoría se monta condicionalmente ({open ? <Dialog/> : null}). */
  open?: boolean;
  /** Se llama cuando el usuario pide cerrar (Escape, clic fuera, botón cerrar). */
  onClose?: () => void;
  onOpenChange?: (open: boolean) => void;
  children: ReactNode;
};

export function DialogRoot({ open = true, onClose, onOpenChange, children }: RootProps) {
  // Casi todos los diálogos se desmontan al cerrarse ({open ? <Modal/> : null}),
  // y en ese caso Radix no llega a devolver el foco: lo restauramos aquí al
  // elemento que lo tenía al abrir (si el foco quedó en <body>).
  useEffect(() => {
    let previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    // Abierto desde un item de menú: el item desaparece al cerrarse el menú,
    // así que recordamos el botón que abrió ese menú (Radix lo enlaza con aria-controls).
    const menu = previous?.closest<HTMLElement>('[role="menu"]');
    if (menu?.id) {
      previous =
        document.querySelector<HTMLElement>(`[aria-controls="${CSS.escape(menu.id)}"]`) ?? previous;
    }
    return () => {
      requestAnimationFrame(() => {
        const lost = !document.activeElement || document.activeElement === document.body;
        if (lost && previous?.isConnected) previous.focus();
      });
    };
  }, []);

  return (
    <RD.Root
      open={open}
      onOpenChange={(next) => {
        onOpenChange?.(next);
        if (!next) onClose?.();
      }}
    >
      {children}
    </RD.Root>
  );
}

type ContentProps = Omit<ComponentPropsWithoutRef<typeof RD.Content>, 'asChild'> & {
  /** Clase del velo de fondo (por defecto .modal-backdrop). */
  overlayClassName?: string;
  /** Animación del panel: 'pop' (centrado) o 'sheet' (panel lateral que se desliza desde su borde). */
  motionPreset?: 'pop' | 'sheet';
  /** Lado del sheet: entra desde ese borde y sale hacia él. */
  side?: 'right' | 'left';
  /** Sin descripción accesible (evita el aviso de Radix cuando no hay subtítulo). */
  noDescription?: boolean;
};

/** Velo + panel. El panel va dentro del velo para conservar el centrado por flex. */
export function DialogContent({
  overlayClassName = 'modal-backdrop',
  className,
  motionPreset = 'pop',
  side = 'right',
  noDescription,
  children,
  ...rest
}: ContentProps) {
  // Entrada = espejo de la salida (exitParts.dialog / exitParts.sheet).
  const panelMotion =
    motionPreset === 'sheet'
      ? {
          initial: { x: side === 'right' ? '100%' : '-100%' },
          animate: { x: 0 },
          transition: layer.sheetTransition,
        }
      : {
          initial: { scale: layer.dialogScale, opacity: 0 },
          animate: { scale: 1, opacity: 1 },
          transition: layer.transition,
        };
  const overlayTransition = motionPreset === 'sheet' ? layer.sheetTransition : layer.transition;
  return (
    <RD.Portal>
      <RD.Overlay asChild>
        <motion.div
          className={overlayClassName}
          data-dialog-overlay=""
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={overlayTransition}
        >
          <RD.Content
            asChild
            {...(noDescription ? { 'aria-describedby': undefined } : null)}
            {...rest}
          >
            <motion.section className={className} {...panelMotion}>
              {children}
              {/* Salida animada aunque el diálogo se desmonte de golpe. */}
              <ExitGhost
                closest="[data-dialog-overlay]"
                parts={
                  motionPreset === 'sheet'
                    ? exitParts.sheet(':scope > section', side)
                    : exitParts.dialog(':scope > section')
                }
                ms={(motionPreset === 'sheet' ? layer.sheetTransition.duration : layer.transition.duration) * 1000}
              />
            </motion.section>
          </RD.Content>
        </motion.div>
      </RD.Overlay>
    </RD.Portal>
  );
}

export const DialogTitle = RD.Title;
export const DialogDescription = RD.Description;
export const DialogClose = RD.Close;

/** Botón ✕ estándar de cabecera. */
export function DialogCloseButton({
  label = 'Cerrar',
  disabled,
}: {
  label?: string;
  disabled?: boolean;
}) {
  return (
    <RD.Close asChild>
      <button type="button" className="icon-btn modal-close" aria-label={label} disabled={disabled}>
        <Icon name="close" />
      </button>
    </RD.Close>
  );
}

export type DialogProps = {
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: DialogSize;
  open?: boolean;
  onClose: () => void;
  /** Bloquea el cierre (Escape / clic fuera / ✕) mientras se guarda. */
  busy?: boolean;
  className?: string;
};

/** Diálogo estándar. */
export function Dialog({
  title,
  subtitle,
  children,
  footer,
  size = 'default',
  open = true,
  onClose,
  busy,
  className,
}: DialogProps) {
  const block = (e: Event) => {
    if (busy) e.preventDefault();
  };
  return (
    <DialogRoot open={open} onClose={onClose}>
      <DialogContent
        overlayClassName={cx('modal-backdrop', size === 'fill' && 'fill')}
        className={cx(
          'modal',
          (size === 'wide' || size === 'fill') && 'wide',
          size === 'fill' && 'fill',
          className,
        )}
        noDescription={!subtitle}
        onEscapeKeyDown={block}
        onPointerDownOutside={block}
      >
        <div className="modal-header">
          <div>
            <DialogTitle asChild>
              <h2>{title}</h2>
            </DialogTitle>
            {subtitle ? (
              <DialogDescription asChild>
                <p>{subtitle}</p>
              </DialogDescription>
            ) : null}
          </div>
          <DialogCloseButton disabled={busy} />
        </div>
        <div className="modal-body">{children}</div>
        {footer ? <div className="modal-footer">{footer}</div> : null}
      </DialogContent>
    </DialogRoot>
  );
}
