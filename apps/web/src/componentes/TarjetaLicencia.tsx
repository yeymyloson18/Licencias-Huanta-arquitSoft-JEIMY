import { Link } from 'react-router';
import type { RecetaResumen } from '../servicios/clienteApi';
import { formatearPlazo, formatearTasa } from './formato';

interface Propiedades {
  readonly licencia: RecetaResumen;
}

/**
 * Una licencia del catálogo: nombre, tasa y plazo (todo viene del backend, FR-016). El nombre
 * enlaza a su ficha (historia 2 de la 003); la tarjeta sigue siendo un elemento de la lista.
 */
export function TarjetaLicencia({ licencia }: Propiedades) {
  return (
    <li className="tarjeta">
      <h2 className="tarjeta__nombre">
        <Link to={`/licencias/${encodeURIComponent(licencia.codigo)}`} className="tarjeta__enlace">
          {licencia.nombre}
        </Link>
      </h2>
      <dl className="tarjeta__datos">
        <div className="tarjeta__dato">
          <dt>Tasa</dt>
          <dd>{formatearTasa(licencia.tasa)}</dd>
        </div>
        <div className="tarjeta__dato">
          <dt>Plazo</dt>
          <dd>{formatearPlazo(licencia.plazoDias)}</dd>
        </div>
      </dl>
    </li>
  );
}
