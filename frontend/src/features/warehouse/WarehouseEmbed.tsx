import { useEffect, useMemo, useRef } from 'react';
import '../../styles/warehouse-embed.css';

const EMBED_VERSION = '20261115c';

type Props = {
  /** Altura del iframe. Por defecto ocupa el viewport disponible. */
  height?: string | number;
  title?: string;
  /** Ubicación a resaltar al abrir (ej. A-01-03-D). */
  focusLoc?: string;
  /** Vista inicial del plano embebido. */
  mode?: 'plan' | '3d' | 'front';
  /** Compacto para usar dentro de un modal. */
  compact?: boolean;
  /** Solo el plano (sin KPIs ni paneles laterales). */
  mapOnly?: boolean;
  /** Cuando el usuario elige una casilla dentro del embed. */
  onSelectLoc?: (loc: string) => void;
};

/**
 * Embebe la bodega visual EXACTA de opticlean-control (misma UI, CSS y SVG).
 */
export function WarehouseEmbed({
  height = 'calc(100vh - 72px)',
  title = 'Bodega visual OPTICLEAN',
  focusLoc,
  mode = 'plan',
  compact = false,
  mapOnly = false,
  onSelectLoc,
}: Props) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const onSelectRef = useRef(onSelectLoc);
  onSelectRef.current = onSelectLoc;

  const src = useMemo(() => {
    const q = new URLSearchParams({ embed: '1', v: EMBED_VERSION, mode });
    if (focusLoc) q.set('loc', focusLoc);
    if (mapOnly || compact) q.set('maponly', '1');
    return `/control-embed/index.html?${q.toString()}#bodega`;
  }, [focusLoc, mode, mapOnly, compact]);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;

    const onMessage = (event: MessageEvent) => {
      if (event.source !== frame.contentWindow) return;
      const data = event.data;
      if (!data || data.source !== 'opticlean-control-embed') return;
      if (data.type === 'select-location' && typeof data.loc === 'string') {
        onSelectRef.current?.(data.loc);
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame?.contentWindow || !focusLoc) return;
    frame.contentWindow.postMessage(
      { source: 'opticlean-host', type: 'focus-location', loc: focusLoc, mode },
      '*',
    );
  }, [focusLoc, mode]);

  return (
    <div className={`warehouse-embed${compact ? ' is-compact' : ''}`}>
      <iframe
        ref={frameRef}
        className="warehouse-embed__frame"
        title={title}
        src={src}
        style={{ height }}
        allow="clipboard-write"
      />
    </div>
  );
}
