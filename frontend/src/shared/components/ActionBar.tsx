import type { ReactNode } from 'react';
import { cx } from './ui';

/**
 * Barra de acciones de un formulario o flujo de creación. Se queda pegada al
 * borde inferior del área de contenido (nunca por encima del sidebar).
 *
 *   <ActionBar info="Paso 1 de 3">
 *     <Button>Cancelar</Button>
 *     <Button variant="primary">Continuar</Button>
 *   </ActionBar>
 */
export function ActionBar({
  info,
  children,
  className,
}: {
  /** Texto o resumen a la izquierda. */
  info?: ReactNode;
  /** Botones, alineados a la derecha: primero salir/atrás, al final la acción principal. */
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx('ui-actionbar', className)}>
      {info ? (
        <div className="ui-actionbar-info" role="status">
          {info}
        </div>
      ) : null}
      <div className="ui-actionbar-actions">{children}</div>
    </div>
  );
}
