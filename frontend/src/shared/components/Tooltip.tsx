import { cloneElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import { Tooltip as RT } from 'radix-ui';
import { ExitGhost } from '../motion/ExitGhost';
import { exitParts } from '../motion/exitAnimation';

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
}: {
  /** Texto del tooltip. Vacío/undefined: no se muestra (útil para tooltips condicionales). */
  content: ReactNode;
  /** Un único elemento que reciba props y ref (botón, span…). */
  children: ReactElement;
  side?: 'top' | 'right' | 'bottom' | 'left';
  align?: 'start' | 'center' | 'end';
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
    <RT.Root>
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
          className="ui-tooltip"
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
