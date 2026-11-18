import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { FichaLicencia } from '../componentes/FichaLicencia';
import { obtenerFicha, type Receta } from '../servicios/clienteApi';

type Estado =
  | { readonly tipo: 'cargando' }
  | { readonly tipo: 'error' }
  | { readonly tipo: 'no-disponible' }
  | { readonly tipo: 'lista'; readonly receta: Receta };

/**
 * Ficha pública de una licencia o trámite (historia 2 de la 003, contracts/portal-catalogo.md). Sin
 * sesión (FR-014). Una receta desactivada o inexistente se muestra como "no disponible" (FR-013).
 */
export function Licencia() {
  const { codigo = '' } = useParams();
  const [estado, setEstado] = useState<Estado>({ tipo: 'cargando' });

  const cargar = useCallback(async () => {
    setEstado({ tipo: 'cargando' });
    try {
      const receta = await obtenerFicha(codigo);
      setEstado(receta ? { tipo: 'lista', receta } : { tipo: 'no-disponible' });
    } catch {
      setEstado({ tipo: 'error' });
    }
  }, [codigo]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  return (
    <>
      <header className="cabecera">
        <p className="cabecera__entidad">Municipalidad Provincial de Huanta</p>
        <h1 className="cabecera__titulo">Detalle de la licencia</h1>
        <p className="cabecera__descripcion">
          Requisitos, tasa y plazo según el TUPA vigente de la municipalidad.
        </p>
      </header>

      <main className="contenido licencia">
        {estado.tipo === 'cargando' && (
          <p className="aviso" role="status">
            Cargando la licencia…
          </p>
        )}

        {estado.tipo === 'error' && (
          <div className="aviso aviso--error" role="alert">
            <p>
              La licencia no se pudo cargar en este momento. Vuelve a intentarlo en unos minutos.
            </p>
            <button type="button" className="boton" onClick={() => void cargar()}>
              Reintentar
            </button>
          </div>
        )}

        {estado.tipo === 'no-disponible' && (
          <div className="aviso">
            <h2 className="licencia__titulo">Esta licencia no está disponible</h2>
            <p>Revisa las licencias publicadas en el catálogo.</p>
          </div>
        )}

        {estado.tipo === 'lista' && <FichaLicencia receta={estado.receta} />}

        {estado.tipo !== 'cargando' && (
          <p className="licencia__volver">
            <Link to="/">Volver al catálogo de licencias</Link>
          </p>
        )}
      </main>
    </>
  );
}
