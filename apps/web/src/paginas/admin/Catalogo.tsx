import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router';
import { formatearPlazo, formatearTasaFicha } from '../../componentes/formato';
import { listarRecetasAdmin, type RecetaAdminResumen } from '../../servicios/clienteApi';

type Estado =
  | { readonly tipo: 'cargando' }
  | { readonly tipo: 'lista'; readonly recetas: readonly RecetaAdminResumen[] }
  | { readonly tipo: 'sin-permiso' }
  | { readonly tipo: 'error' };

/**
 * Catálogo para el administrador (historia 3 de la 003, contracts/portal-catalogo.md): las 12
 * recetas, activas y desactivadas, con su tasa, plazo y estado escrito (no solo con color).
 */
export function Catalogo() {
  const [estado, setEstado] = useState<Estado>({ tipo: 'cargando' });

  const cargar = useCallback(async () => {
    setEstado({ tipo: 'cargando' });
    const resultado = await listarRecetasAdmin();
    if (resultado.tipo === 'ok') {
      setEstado({ tipo: 'lista', recetas: resultado.datos });
    } else {
      setEstado({ tipo: resultado.tipo === 'sin-permiso' ? 'sin-permiso' : 'error' });
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  return (
    <main className="contenido catalogo-admin">
      <h1>Catálogo de licencias</h1>
      <p>
        Cambia la tasa, el plazo o los requisitos de una receta cuando se modifica el TUPA. El
        catálogo público se actualiza en 5 minutos como máximo.
      </p>

      {estado.tipo === 'cargando' && (
        <p className="aviso" role="status">
          Cargando recetas…
        </p>
      )}

      {estado.tipo === 'sin-permiso' && (
        <p className="aviso aviso--error" role="alert">
          No tienes permiso para gestionar el catálogo.
        </p>
      )}

      {estado.tipo === 'error' && (
        <div className="aviso aviso--error" role="alert">
          <p>
            El catálogo no está disponible en este momento. Vuelve a intentarlo en unos minutos.
          </p>
          <button type="button" className="boton" onClick={() => void cargar()}>
            Reintentar
          </button>
        </div>
      )}

      {estado.tipo === 'lista' && (
        <ul className="catalogo-admin__lista" aria-label="Recetas del catálogo">
          {estado.recetas.map((receta) => (
            <li key={receta.codigo} className="catalogo-admin__receta">
              <h2 className="catalogo-admin__nombre">
                <span className="catalogo-admin__codigo">{receta.codigo}</span> {receta.nombre}
              </h2>
              <dl className="catalogo-admin__datos">
                <div>
                  <dt>Tasa</dt>
                  <dd>{formatearTasaFicha(receta.tasa)}</dd>
                </div>
                <div>
                  <dt>Plazo</dt>
                  <dd>{formatearPlazo(receta.plazoDias)}</dd>
                </div>
                <div>
                  <dt>Estado</dt>
                  <dd
                    className={`catalogo-admin__estado${receta.activa ? '' : ' catalogo-admin__estado--inactiva'}`}
                  >
                    {receta.activa ? 'Activa' : 'Desactivada'}
                  </dd>
                </div>
              </dl>
              <Link
                to={`/admin/catalogo/${encodeURIComponent(receta.codigo)}`}
                className="boton boton--secundario"
                aria-label={`Editar ${receta.codigo}: ${receta.nombre}`}
              >
                Editar
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
