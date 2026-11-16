import { useEffect, useMemo, useRef, useState } from 'react';
import '../../styles/warehouse-embed.css';

const EMBED_VERSION = '20261116d';

/** Altura del topbar (--topbar-h) para que el embed se extienda por debajo. */
function topbarHeight() {
  const v = getComputedStyle(document.documentElement).getPropertyValue('--topbar-h');
  return parseInt(v, 10) || 56;
}

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
  height = 'calc(100vh - var(--topbar-h))',
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
  // Pantalla completa: el iframe pasa bajo el topbar glass y sincroniza sus modales con el shell.
  const fullPage = !compact && !mapOnly;
  const [modalOpen, setModalOpen] = useState(false);
  /** El clic que cierra el modal no debe activar lo que hay debajo (p. ej. un item del menú). */
  const swallowClick = useRef(false);

  const src = useMemo(() => {
    const q = new URLSearchParams({ embed: '1', v: EMBED_VERSION, mode });
    if (focusLoc) q.set('loc', focusLoc);
    if (mapOnly || compact) q.set('maponly', '1');
    if (fullPage) q.set('under', String(topbarHeight()));
    return `/control-embed/index.html?${q.toString()}#bodega`;
  }, [focusLoc, mode, mapOnly, compact, fullPage]);

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
      if (data.type === 'modal') setModalOpen(!!data.open);
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

  // Con un modal abierto dentro del iframe, el shell también se oscurece
  // (clase en <html>, ver warehouse-embed.css) y un clic fuera lo cierra.
  useEffect(() => {
    if (!fullPage || !modalOpen) return;
    const root = document.documentElement;
    root.classList.add('embed-modal-open');
    const close = () =>
      frameRef.current?.contentWindow?.postMessage(
        { source: 'opticlean-shell', type: 'close-modal' },
        '*',
      );
    const onPointer = (e: PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      swallowClick.current = true;
      window.setTimeout(() => (swallowClick.current = false), 500);
      close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('pointerdown', onPointer, true);
    document.addEventListener('keydown', onKey);
    return () => {
      root.classList.remove('embed-modal-open');
      document.removeEventListener('pointerdown', onPointer, true);
      document.removeEventListener('keydown', onKey);
    };
  }, [fullPage, modalOpen]);

  useEffect(() => {
    if (!fullPage) return;
    const onClick = (e: MouseEvent) => {
      if (!swallowClick.current) return;
      swallowClick.current = false;
      e.preventDefault();
      e.stopPropagation();
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [fullPage]);

  return (
    <div
      className={`warehouse-embed${compact ? ' is-compact' : ''}${fullPage ? ' is-under-topbar' : ''}`}
    >
      <iframe
        ref={frameRef}
        className="warehouse-embed__frame"
        title={title}
        src={src}
        style={fullPage ? undefined : { height }}
        allow="clipboard-write"
      />
    </div>
  );
}
