import {
  cloneElement,
  isValidElement,
  useState,
  type ComponentProps,
  type ReactElement,
  type ReactNode,
} from 'react';
import { Tooltip as RT } from 'radix-ui';
import { ExitGhost } from '../motion/ExitGhost';
import { exitParts } from '../motion/exitAnimation';
import { cx } from './ui';

/**
 * Tooltip sobre Radix: aparece con hover y con foco de teclado (el `title`
 * nativo no), se enlaza con aria-describedby y comparte la animación de
 * entrada/salida de las demás capas.
 *
 *   <Tooltip content="Cerrar sesión"><button …/></Tooltip>
 *
 * Requiere <TooltipProvider> en la raíz (main.tsx).
 */

// Última forma de interacción: un tooltip solo se abre por foco si fue el teclado.
// (Durante el evento focus, :focus-visible aún no está calculado de forma fiable.)
let lastInputWasKeyboard = false;
if (typeof window !== 'undefined') {
  window.addEventListener('keydown', (e) => {
    if (!e.metaKey && !e.altKey && !e.ctrlKey) lastInputWasKeyboard = true;
  }, true);
  window.addEventListener('pointerdown', () => (lastInputWasKeyboard = false), true);
}

export const TooltipProvider = ({ children }: { children: ReactNode }) => (
  <RT.Provider delayDuration={350} skipDelayDuration={250}>
    {children}
  </RT.Provider>
);

export function Tooltip({
  content,
  children,
  side = 'top',
  align = 'center',
  open,
  onOpenChange,
  className,
  contentProps,
}: {
  /** Texto del tooltip. Vacío/undefined: no se muestra (útil para tooltips condicionales). */
  content: ReactNode;
  /** Un único elemento que reciba props y ref (botón, span…). */
  children: ReactElement;
  side?: 'top' | 'right' | 'bottom' | 'left';
  align?: 'start' | 'center' | 'end';
  /** Apertura controlada (p. ej. para fijarlo con un toque). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
  contentProps?: Omit<ComponentProps<typeof RT.Content>, 'children' | 'className'>;
}) {
  if (content === undefined || content === null || content === false || content === '') {
    return children;
  }

  // Un botón deshabilitado no emite eventos de puntero: se envuelve en un
  // <span> enfocable para que el tooltip pueda explicar por qué lo está.
  const props = isValidElement(children) ? (children.props as { disabled?: boolean }) : {};
  const trigger = props.disabled ? (
    <span className="ui-tooltip-wrap" tabIndex={0}>
      {cloneElement(children)}
    </span>
  ) : (
    children
  );

  return (
    <RT.Root open={open} onOpenChange={onOpenChange}>
      <RT.Trigger
        asChild
        // Solo con foco de teclado: el foco automático (p. ej. el ✕ al abrir un
        // diálogo) o tras un clic no debe abrir el tooltip, porque además se
        // quedaría con el primer Escape en lugar del diálogo.
        onFocus={(event) => {
          if (!lastInputWasKeyboard) event.preventDefault();
        }}
      >
        {trigger}
      </RT.Trigger>
      <RT.Portal>
        <RT.Content
          {...contentProps}
          className={cx('ui-tooltip', className)}
          side={side}
          align={align}
          sideOffset={6}
          collisionPadding={8}
          // Con texto, Radix usa aria-label para su copia accesible en vez de
          // duplicar los hijos (que incluyen <ExitGhost>).
          aria-label={typeof content === 'string' ? content : undefined}
        >
          {content}
          <ExitGhost
            closest="[data-radix-popper-content-wrapper]"
            parts={exitParts.popover('.ui-tooltip')}
          />
        </RT.Content>
      </RT.Portal>
    </RT.Root>
  );
}

/**
 * Botón con tooltip de contenido enriquecido. Además de hover y foco, un toque
 * o clic lo deja fijo (pantallas táctiles) hasta tocar fuera, Escape o repetir.
 */
export function TooltipButton({
  content,
  className,
  children,
  label,
}: {
  content: ReactNode;
  className?: string;
  children: ReactNode;
  /** Texto accesible extra para el botón. */
  label?: string;
}) {
  const [hover, setHover] = useState(false);
  const [pinned, setPinned] = useState(false);
  const close = () => {
    setPinned(false);
    setHover(false);
  };
  return (
    <Tooltip
      content={content}
      className="is-rich"
      open={pinned || hover}
      onOpenChange={setHover}
      contentProps={{
        onEscapeKeyDown: close,
        onPointerDownOutside: close,
      }}
    >
      <button
        type="button"
        className={className}
        aria-label={label}
        aria-expanded={pinned || hover}
        // Radix cerraría al pulsar; aquí el toque alterna el modo fijo.
        onPointerDown={(event) => event.preventDefault()}
        onClick={(event) => {
          event.preventDefault();
          setPinned((value) => !value);
          setHover(false);
        }}
        onBlur={() => setPinned(false)}
      >
        {children}
      </button>
    </Tooltip>
  );
}
