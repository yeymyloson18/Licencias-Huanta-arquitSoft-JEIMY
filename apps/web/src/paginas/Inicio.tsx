import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router';
import { TarjetaLicencia } from '../componentes/TarjetaLicencia';
import { listarLicencias, type RecetaResumen } from '../servicios/clienteApi';

type Estado =
  | { readonly tipo: 'cargando' }
  | { readonly tipo: 'lista'; readonly licencias: readonly RecetaResumen[] }
  | { readonly tipo: 'error' };

/** Página de inicio: catálogo de licencias del TUPA 2024 (contracts/portal-inicio.md). */
export function Inicio() {
  const [estado, setEstado] = useState<Estado>({ tipo: 'cargando' });

  const cargar = useCallback(async () => {
    setEstado({ tipo: 'cargando' });
    try {
      setEstado({ tipo: 'lista', licencias: await listarLicencias() });
    } catch {
      setEstado({ tipo: 'error' });
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  return (
    <>
      <header className="cabecera">
        <p className="cabecera__entidad">Municipalidad Provincial de Huanta</p>
        <h1 className="cabecera__titulo">Licencias de funcionamiento</h1>
        <p className="cabecera__descripcion">
          Conozca la tasa y el plazo de cada licencia según el TUPA 2024.
        </p>
        <p className="cabecera__acciones">
          <Link to="/asistente" className="boton boton--claro">
            ¿Qué licencia necesito?
          </Link>
          <Link to="/consulta" className="boton boton--claro">
            Consultar mi trámite
          </Link>
        </p>
      </header>

      <main className="contenido">
        {estado.tipo === 'cargando' && (
          <p className="aviso" role="status">
            Cargando licencias…
          </p>
        )}

        {estado.tipo === 'error' && (
          <div className="aviso aviso--error" role="alert">
            <p>
              El catálogo no está disponible en este momento. Vuelva a intentarlo en unos minutos.
            </p>
            <button type="button" className="boton" onClick={() => void cargar()}>
              Reintentar
            </button>
          </div>
        )}

        {estado.tipo === 'lista' && estado.licencias.length === 0 && (
          <p className="aviso">
            Por ahora no hay licencias publicadas en el catálogo. Vuelva a intentarlo más tarde.
          </p>
        )}

        {estado.tipo === 'lista' && estado.licencias.length > 0 && (
          <ul className="lista-licencias" aria-label="Licencias de funcionamiento">
            {estado.licencias.map((licencia) => (
              <TarjetaLicencia key={licencia.codigo} licencia={licencia} />
            ))}
          </ul>
        )}
      </main>
    </>
  );
}
