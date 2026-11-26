import type { Transition, Variants } from 'motion/react';

/**
 * Presets de animación compartidos (librería `motion`).
 * Usa SIEMPRE estos valores para que toda la app se mueva igual.
 * Los tiempos reflejan --duration-* / --ease-* de styles/tokens.css.
 *
 *   import { motion } from 'motion/react';
 *   import { fadeUp, stagger } from '../../shared/motion/presets';
 *
 *   <motion.ul variants={stagger} initial="hidden" animate="show">
 *     <motion.li variants={fadeUp} />
 *   </motion.ul>
 */

export const duration = { fast: 0.12, base: 0.2, slow: 0.32 } as const;

export const ease = {
  out: [0.22, 1, 0.36, 1],
  inOut: [0.65, 0, 0.35, 1],
} as const;

/** Muelles para movimiento físico (layout, cambios de vista 2D↔3D, drag). */
export const spring = {
  /** Respuesta rápida para UI: toggles, tabs, chips. */
  snappy: { type: 'spring', stiffness: 520, damping: 38, mass: 0.8 },
  /** Transiciones de panel / layout. */
  smooth: { type: 'spring', stiffness: 260, damping: 32 },
  /** Cambios de cámara / escena (p. ej. Bodega visual 2D ↔ 3D). */
  scene: { type: 'spring', stiffness: 120, damping: 22, mass: 1.1 },
} satisfies Record<string, Transition>;

export const transition = {
  fast: { duration: duration.fast, ease: ease.out },
  base: { duration: duration.base, ease: ease.out },
  slow: { duration: duration.slow, ease: ease.out },
} satisfies Record<string, Transition>;

/** Aparece subiendo levemente. Para tarjetas, filas, formularios. */
export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: transition.slow },
  exit: { opacity: 0, y: -6, transition: transition.fast },
};

/** Solo opacidad. Para overlays y contenido que no debe desplazarse. */
export const fade: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: transition.base },
  exit: { opacity: 0, transition: transition.fast },
};

/** Escala sutil. Para modales, popovers, menús. */
export const pop: Variants = {
  hidden: { opacity: 0, scale: 0.96 },
  show: { opacity: 1, scale: 1, transition: spring.snappy },
  exit: { opacity: 0, scale: 0.98, transition: transition.fast },
};

/** Contenedor que escalona la entrada de sus hijos. */
export const stagger: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.05, delayChildren: 0.04 } },
};

/** Intercambio de contenido inline (p. ej. texto ↔ spinner en un botón). */
export const swap: Variants = {
  hidden: { opacity: 0, y: 6 },
  show: { opacity: 1, y: 0, transition: transition.base },
  exit: { opacity: 0, y: -6, transition: transition.fast },
};

/**
 * Capas (diálogos, drawers, desplegables): la ENTRADA es el espejo exacto de
 * la SALIDA (shared/motion/exitAnimation.ts → exitParts). Misma duración,
 * misma curva simétrica y mismos valores, en sentido inverso.
 */
export const layer = {
  transition: { duration: duration.base, ease: ease.inOut } satisfies Transition,
  /** Sheets (paneles laterales): recorren más distancia, así que un poco más lentos. */
  sheetTransition: { duration: duration.slow, ease: ease.inOut } satisfies Transition,
  /** Desplazamientos/escala compartidos con exitParts. */
  dialogScale: 0.97,
  popoverOffset: 4,
  popoverScale: 0.98,
};
