import { useId } from 'react';
import { Link } from 'react-router';
import type { Receta } from '../servicios/clienteApi';
import {
  etiquetaCondicion,
  formatearCalificacion,
  formatearItse,
  formatearPlazoConTipo,
  formatearTasaFicha,
  formatearVigencia,
} from './formato';

interface Propiedades {
  readonly receta: Receta;
}

interface Dato {
  readonly etiqueta: string;
  readonly valor: string | null;
}

/**
 * Ficha de una licencia o trámite (FR-010, FR-011): la usan la propuesta del asistente y la página
 * `/licencias/:codigo` (contracts/portal-catalogo.md de la 003). Los datos que no aplican se omiten.
 */
export function FichaLicencia({ receta }: Propiedades) {
  const idTitulo = useId();

  const datos: Dato[] = [
    { etiqueta: 'Tasa', valor: formatearTasaFicha(receta.tasa) },
    { etiqueta: 'Plazo', valor: formatearPlazoConTipo(receta.plazoDias, receta.tipoPlazo) },
    { etiqueta: 'Aprobación', valor: formatearCalificacion(receta.calificacion) },
    { etiqueta: 'Inspección ITSE', valor: formatearItse(receta.ordenItse, receta.plazoItseDias) },
    {
      etiqueta: 'Vigencia',
      valor: formatearVigencia(receta.vigenciaMeses, receta.tipo, receta.ruta),
    },
  ];

  return (
    <article className="ficha" aria-labelledby={idTitulo}>
      <h2 id={idTitulo} className="ficha__nombre">
        {receta.nombre}
      </h2>
      <dl className="ficha__datos">
        {datos
          .filter((dato): dato is { etiqueta: string; valor: string } => dato.valor !== null)
          .map((dato) => (
            <div key={dato.etiqueta} className="ficha__dato">
              <dt>{dato.etiqueta}</dt>
              <dd>{dato.valor}</dd>
            </div>
          ))}
      </dl>

      <h3 className="ficha__subtitulo">Requisitos</h3>
      {receta.requisitos.length === 0 ? (
        <p>Consulta los requisitos en la municipalidad.</p>
      ) : (
        <ol className="ficha__requisitos">
          {receta.requisitos.map((requisito) => {
            const condicion = etiquetaCondicion(requisito.condicion);
            return (
              <li key={requisito.id}>
                {requisito.descripcion}
                {condicion && <span className="ficha__condicion">{condicion}</span>}
              </li>
            );
          })}
        </ol>
      )}

      {receta.tipo === 'LICENCIA' && (
        <p className="ficha__accion">
          <Link
            className="boton"
            to={`/tramite/identidad?licencia=${encodeURIComponent(receta.codigo)}`}
          >
            Presentar solicitud
          </Link>
        </p>
      )}
    </article>
  );
}
