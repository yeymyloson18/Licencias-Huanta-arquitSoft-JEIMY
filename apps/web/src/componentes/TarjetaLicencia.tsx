import type { RecetaResumen } from '../servicios/clienteApi';
import { formatearPlazo, formatearTasa } from './formato';

interface Propiedades {
  readonly licencia: RecetaResumen;
}

/** Una licencia del catálogo: nombre, tasa y plazo (todo viene del backend, FR-016). */
export function TarjetaLicencia({ licencia }: Propiedades) {
  return (
    <li className="tarjeta">
      <h2 className="tarjeta__nombre">{licencia.nombre}</h2>
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
