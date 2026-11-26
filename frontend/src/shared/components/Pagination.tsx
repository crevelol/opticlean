import { IconButton } from './IconButton';
import { cx } from './ui';

/**
 * Paginación estándar: "Mostrando a–b de n" + anterior · páginas · siguiente.
 * Con muchas páginas muestra la primera, la última y las vecinas (…).
 */
export function Pagination({
  page,
  pageCount,
  total,
  pageSize,
  onPageChange,
  label = 'Paginación',
  className,
}: {
  page: number;
  pageCount: number;
  total: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  label?: string;
  className?: string;
}) {
  if (!total) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  const pages = visiblePages(page, pageCount);
  return (
    <nav className={cx('ui-pagination', className)} aria-label={label}>
      <span className="ui-pagination-summary">
        Mostrando {from}–{to} de {total}
      </span>
      {pageCount > 1 ? (
        <div className="ui-pagination-pages">
          <IconButton
            icon="back"
            label="Página anterior"
            size="small"
            disabled={page <= 1}
            onClick={() => onPageChange(Math.max(1, page - 1))}
          />
          {pages.map((n, i) =>
            n === 0 ? (
              <span key={`gap-${i}`} className="ui-pagination-gap" aria-hidden>
                …
              </span>
            ) : (
              <button
                key={n}
                type="button"
                className={cx('ui-pagination-page', n === page && 'is-active')}
                aria-current={n === page ? 'page' : undefined}
                aria-label={`Página ${n}`}
                onClick={() => onPageChange(n)}
              >
                {n}
              </button>
            ),
          )}
          <IconButton
            icon="arrow"
            label="Página siguiente"
            size="small"
            disabled={page >= pageCount}
            onClick={() => onPageChange(Math.min(pageCount, page + 1))}
          />
        </div>
      ) : null}
    </nav>
  );
}

/** Páginas a mostrar; 0 = separador "…". */
function visiblePages(page: number, count: number): number[] {
  if (count <= 7) return Array.from({ length: count }, (_, i) => i + 1);
  const set = new Set([1, count, page - 1, page, page + 1].filter((n) => n >= 1 && n <= count));
  const sorted = [...set].sort((a, b) => a - b);
  const out: number[] = [];
  sorted.forEach((n, i) => {
    if (i && n - sorted[i - 1] > 1) out.push(0);
    out.push(n);
  });
  return out;
}
