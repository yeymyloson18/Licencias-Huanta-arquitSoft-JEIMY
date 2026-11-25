import { useId, type ReactNode } from 'react';
import { Link } from 'react-router';

export type VarianteIndicador = 'primary' | 'success' | 'warning' | 'danger' | 'info';

interface Propiedades {
  /** Nombre del indicador: es el título de la tarjeta y el nombre de su región. */
  readonly nombre: string;
  /** El número (o el número con su unidad, por ejemplo "5 activos"). Sin él, solo va el detalle. */
  readonly valor?: ReactNode;
  /** Con ruta, el nombre es un enlace que cubre toda la tarjeta. */
  readonly ruta?: string;
  /** Acento de color del tema (borde superior). */
  readonly variante?: VarianteIndicador;
  /** Detalle debajo del número. */
  readonly children?: ReactNode;
}

/**
 * Tarjeta de un indicador (013, US3): una tarjeta de CoreUI (`card`) con el nombre y el número
 * grande. Es una región con el nombre del indicador, así el número y su nombre se leen juntos. Los
 * datos no cambian: solo el aspecto.
 */
export function TarjetaIndicador({
  nombre,
  valor,
  ruta,
  variante = 'primary',
  children,
}: Propiedades) {
  const id = useId();

  return (
    // <section> con las clases de CCard (que siempre es un <div>): así la tarjeta es una región.
    <section
      className={`card tarjeta-indicador tarjeta-indicador--${variante}`}
      aria-labelledby={id}
    >
      <div className="card-body">
        <h2 id={id} className="tarjeta-indicador__nombre">
          {ruta === undefined ? (
            nombre
          ) : (
            <Link to={ruta} className="tarjeta-indicador__enlace">
              {nombre}
            </Link>
          )}
        </h2>
        {valor !== undefined && <p className="tarjeta-indicador__valor">{valor}</p>}
        {children !== undefined && <div className="tarjeta-indicador__detalle">{children}</div>}
      </div>
    </section>
  );
}
