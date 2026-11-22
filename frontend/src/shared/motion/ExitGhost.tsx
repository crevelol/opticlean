import { useLayoutEffect, useRef } from 'react';
import { playExitGhost, type GhostPart } from './exitAnimation';

/**
 * Colócalo DENTRO de una capa (diálogo, drawer, menú). Al desmontarse la capa,
 * clona su contenedor (`closest`) y reproduce `parts` como animación de salida.
 *
 *   <DialogContent> … <ExitGhost closest=".modal-backdrop" parts={exitParts.dialog(':scope > *')} />
 */
export function ExitGhost({
  closest,
  parts,
  ms,
}: {
  /** Selector del contenedor a clonar, buscado hacia arriba desde este punto. */
  closest: string;
  parts: GhostPart[];
  ms?: number;
}) {
  const anchor = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    // Se resuelve al montar: al desmontar, React ya pudo soltar las refs.
    const source = anchor.current?.closest<HTMLElement>(closest) ?? null;
    return () => playExitGhost(source, parts, ms);
    // Partes constantes por capa.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <span ref={anchor} hidden aria-hidden />;
}
