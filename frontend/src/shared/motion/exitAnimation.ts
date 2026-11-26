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
 *
 * Dos fases: la copia se prepara al instante (el nodo aún está en el DOM) y
 * solo se muestra si, al terminar el ciclo de React, el original salió del
 * documento. Así el desmontaje simulado de <StrictMode> (desarrollo), que deja
 * el DOM en su sitio, no reproduce una salida mientras la capa se abre.
 */

export type GhostPart = {
  /** Selector dentro del clon ('' = el propio nodo raíz). */
  selector: string;
  keyframes: Keyframe[];
};

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Capas con una salida ya programada (el contenido de un tooltip enriquecido se repite). */
const pending = new WeakSet<HTMLElement>();

export function playExitGhost(source: HTMLElement | null, parts: GhostPart[], ms = duration.base * 1000) {
  if (!source?.isConnected || pending.has(source) || prefersReducedMotion()) return;
  pending.add(source);

  // ── Fase 1: preparar la copia mientras el original sigue en el DOM ──
  const parent = source.parentElement;
  const ghost = source.cloneNode(true) as HTMLElement;
  ghost.setAttribute('aria-hidden', 'true');
  ghost.setAttribute('inert', '');
  ghost.removeAttribute('id');
  ghost.querySelectorAll('[id]').forEach((el) => el.removeAttribute('id'));
  // La copia no debe aparecer en búsquedas por rol (menuitem, dialog, option…)
  // ni ser recogida por las colecciones de Radix.
  [ghost, ...ghost.querySelectorAll<HTMLElement>('[role], [data-radix-collection-item], [aria-controls], [aria-labelledby], [aria-describedby]')].forEach((el) => {
    el.removeAttribute('role');
    el.removeAttribute('data-radix-collection-item');
    el.removeAttribute('aria-controls');
    el.removeAttribute('aria-labelledby');
    el.removeAttribute('aria-describedby');
  });
  ghost.style.pointerEvents = 'none';
  // Las animaciones CSS de entrada no deben volver a correr en la copia.
  ghost.style.animation = 'none';
  ghost.querySelectorAll<HTMLElement>('*').forEach((el) => (el.style.animation = 'none'));

  // Un <iframe> clonado volvería a cargarse: se sustituye por un bloque vacío del mismo tamaño.
  ghost.querySelectorAll('iframe').forEach((frame) => {
    const box = document.createElement('div');
    box.className = frame.className;
    box.style.cssText = frame.style.cssText;
    frame.replaceWith(box);
  });

  // Posición de scroll de los contenedores con desplazamiento.
  const scrolled: Array<[number, number, number]> = [];
  [source, ...source.querySelectorAll<HTMLElement>('*')].forEach((el, i) => {
    if (el.scrollTop || el.scrollLeft) scrolled.push([i, el.scrollTop, el.scrollLeft]);
  });

  // ── Fase 2: al terminar el ciclo de React, solo si fue un desmontaje real ──
  queueMicrotask(() => {
    pending.delete(source);
    if (source.isConnected) return; // desmontaje simulado (StrictMode) o la capa sigue viva
    (parent?.isConnected ? parent : document.body).appendChild(ghost);

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
      // Curva simétrica: con ease-out la capa se "apaga" en los primeros
      // milisegundos y se percibe como un corte.
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
  });
}

/** Salidas estándar: espejo exacto de las entradas (layer en presets.ts). */
export const exitParts = {
  /** Diálogo centrado: velo y panel se desvanecen; el panel se encoge levemente. */
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
  /** Panel lateral (sheet): sale completo hacia su lado; el velo se desvanece. */
  sheet: (panelSelector: string, side: 'right' | 'left' = 'right'): GhostPart[] => [
    { selector: '', keyframes: [{ opacity: 1 }, { opacity: 0 }] },
    {
      selector: panelSelector,
      keyframes: [
        { transform: 'translateX(0)' },
        { transform: `translateX(${side === 'right' ? '100%' : '-100%'})` },
      ],
    },
  ],
  /**
   * Desplegables (select, menús, popovers, tooltips). Se anima el menú
   * interior: el wrapper de Radix lleva el transform de posición.
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
