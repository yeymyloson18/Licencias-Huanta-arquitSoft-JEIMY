import type { ReactNode } from 'react';

interface Propiedades {
  /** Si se indica, el contenedor es una región con ese nombre que se alcanza con el teclado. */
  readonly etiqueta?: string;
  readonly children: ReactNode;
}

/**
 * Contenedor de una tabla ancha (013, US4): se desplaza dentro de él (`table-responsive`), así la
 * página no se desplaza a 360 px. Con etiqueta, se puede recorrer con el teclado (WCAG 2.1.1).
 */
export function TablaAdaptable({ etiqueta, children }: Propiedades) {
  if (etiqueta === undefined) {
    return <div className="table-responsive">{children}</div>;
  }
  return (
    <div className="table-responsive" role="region" aria-label={etiqueta} tabIndex={0}>
      {children}
    </div>
  );
}
