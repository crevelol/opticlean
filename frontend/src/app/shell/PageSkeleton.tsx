/** Esqueleto mientras se descarga el código de una pantalla (carga diferida). */
export function PageSkeleton() {
  return (
    <div className="page-skeleton" aria-busy="true" aria-label="Cargando pantalla">
      <div className="page-skeleton-head">
        <span className="skeleton" style={{ width: 120, height: 9 }} />
        <span className="skeleton" style={{ width: 280, height: 26 }} />
        <span className="skeleton" style={{ width: 360, height: 11 }} />
      </div>
      <div className="page-skeleton-kpis">
        {Array.from({ length: 4 }, (_, i) => (
          <span key={i} className="skeleton" style={{ height: 96 }} />
        ))}
      </div>
      <span className="skeleton" style={{ height: 320 }} />
    </div>
  );
}
