import { duration, ease, layer } from './presets';

/**
 * Animación de salida para capas que se desmontan de golpe.
 *
 * La mayoría de diálogos se montan condicionalmente ({open ? <Modal/> : null}),
 * así que al cerrarse React los quita del DOM en el mismo frame y no hay nada
 * que animar. Justo antes de desmontar, clonamos el nodo visible como un
 * "fantasma" inerte (sin foco ni clics), lo animamos hacia fuera y lo
 * eliminamos. Funciona igual cierre quien cierre: Escape, clic fuera, ✕,
 * Cancelar o la propia pantalla tras guardar.
 */

export type GhostPart = {
  /** Selector dentro del clon ('' = el propio nodo raíz). */
  selector: string;
  keyframes: Keyframe[];
};

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function playExitGhost(source: HTMLElement | null, parts: GhostPart[], ms = duration.base * 1000) {
  if (!source?.isConnected || prefersReducedMotion()) return;

  const ghost = source.cloneNode(true) as HTMLElement;
  ghost.setAttribute('aria-hidden', 'true');
  ghost.setAttribute('inert', '');
  ghost.removeAttribute('id');
  ghost.querySelectorAll('[id]').forEach((el) => el.removeAttribute('id'));
  ghost.style.pointerEvents = 'none';

  // Un <iframe> clonado volvería a cargarse: se sustituye por un bloque vacío del mismo tamaño.
  ghost.querySelectorAll('iframe').forEach((frame) => {
    const box = document.createElement('div');
    box.className = frame.className;
    box.style.cssText = frame.style.cssText;
    frame.replaceWith(box);
  });

  // Reproduce la posición de scroll de los contenedores con desplazamiento.
  const scrolled: Array<[number, number, number]> = [];
  const all = [source, ...source.querySelectorAll<HTMLElement>('*')];
  all.forEach((el, i) => {
    if (el.scrollTop || el.scrollLeft) scrolled.push([i, el.scrollTop, el.scrollLeft]);
  });

  (source.parentElement ?? document.body).appendChild(ghost);

  if (scrolled.length) {
    const ghostAll = [ghost, ...ghost.querySelectorAll<HTMLElement>('*')];
    scrolled.forEach(([i, top, left]) => {
      const el = ghostAll[i];
      if (el) {
        el.scrollTop = top;
        el.scrollLeft = left;
      }
    });
  }

  const timing: KeyframeAnimationOptions = {
    duration: ms,
    // Las salidas usan curva simétrica: con ease-out la capa se "apaga" en los
    // primeros milisegundos y se percibe como un corte.
    easing: `cubic-bezier(${ease.inOut.join(',')})`,
    fill: 'forwards',
  };
  const animations = parts.flatMap(({ selector, keyframes }) => {
    const target = selector ? ghost.querySelector<HTMLElement>(selector) : ghost;
    return target ? [target.animate(keyframes, timing)] : [];
  });

  const remove = () => ghost.remove();
  if (!animations.length) return remove();
  Promise.all(animations.map((a) => a.finished)).then(remove, remove);
  // Seguridad: nunca dejar el fantasma en pantalla.
  window.setTimeout(remove, ms + 200);
}

/** Salidas estándar, espejo de las entradas de presets.ts. */
export const exitParts = {
  /** Diálogo centrado: velo se desvanece, panel se encoge levemente. */
  dialog: (panelSelector: string): GhostPart[] => [
    { selector: '', keyframes: [{ opacity: 1 }, { opacity: 0 }] },
    {
      selector: panelSelector,
      keyframes: [
        { opacity: 1, transform: 'scale(1)' },
        { opacity: 0, transform: `scale(${layer.dialogScale})` },
      ],
    },
  ],
  /** Panel lateral derecho. */
  drawer: (panelSelector: string): GhostPart[] => [
    { selector: '', keyframes: [{ opacity: 1 }, { opacity: 0 }] },
    {
      selector: panelSelector,
      keyframes: [
        { transform: 'translateX(0)', opacity: 1 },
        { transform: `translateX(${layer.drawerOffset}px)`, opacity: 0 },
      ],
    },
  ],
  /**
   * Desplegables (select, menús, popovers). Se anima el menú interior: el
   * wrapper de Radix lleva el transform de posición y no debe tocarse.
   */
  popover: (menuSelector: string): GhostPart[] => [
    {
      selector: menuSelector,
      keyframes: [
        { opacity: 1, transform: 'translateY(0) scale(1)' },
        { opacity: 0, transform: `translateY(-${layer.popoverOffset}px) scale(${layer.popoverScale})` },
      ],
    },
  ],
};
