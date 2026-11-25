import { CHeader } from '@coreui/react';
import { lazy, Suspense, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router';
import { useSesion } from '../../sesion/ProveedorSesion';
import { inicioDe } from '../../sesion/inicio';
import { PIE } from './pie';

// 013 (US6): el selector usa CDropdown (con Popper). En el portal público se carga aparte, para no
// sumar ese código al primer paquete; mientras llega, un hueco del mismo tamaño evita que la barra
// salte.
const SelectorModo = lazy(() =>
  import('./SelectorModo').then((modulo) => ({ default: modulo.SelectorModo })),
);

interface Propiedades {
  /** El contenido de la pantalla. */
  readonly children: ReactNode;
}

/**
 * Portal ligero del ciudadano (013, US2; contracts/portal-diseno.md): barra con la Municipalidad y,
 * a la derecha, "Acceso del personal" (011, FR-021) o, con sesión, "Ir a mi trabajo"; contenido a todo
 * el ancho y pie. Sin menú lateral. Mientras se comprueba la sesión no se muestra ninguno de los dos
 * enlaces (evita un parpadeo). Las pantallas traen su propio `<main>` y su cabecera, así que la barra
 * es un `<div>` y el contenido va en un contenedor sin rol.
 */
export function DisenoPublico({ children }: Propiedades) {
  const { estado, sesion } = useSesion();
  const { pathname } = useLocation();

  return (
    <div className="diseno-publico">
      <CHeader className="diseno-publico__barra">
        <Link to="/" className="diseno-publico__marca">
          Municipalidad Provincial de Huanta
        </Link>
        <div className="diseno-publico__acciones">
          <Suspense fallback={<span className="selector-modo__hueco" aria-hidden="true" />}>
            <SelectorModo />
          </Suspense>
          {estado === 'sin-sesion' && pathname !== '/ingresar' && (
            <nav aria-label="Acceso del personal">
              <Link to="/ingresar" className="diseno-publico__enlace">
                Acceso del personal
              </Link>
            </nav>
          )}
          {sesion !== null && (
            <Link to={inicioDe(sesion.usuario.roles)} className="diseno-publico__enlace">
              Ir a mi trabajo
            </Link>
          )}
        </div>
      </CHeader>
      <div className="diseno-publico__contenido">{children}</div>
      <footer className="footer diseno-publico__pie">
        <p className="mb-0">{PIE}</p>
      </footer>
    </div>
  );
}
