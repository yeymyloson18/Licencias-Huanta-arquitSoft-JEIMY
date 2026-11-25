import { CHeader, CHeaderToggler, CSidebar, CSidebarBrand, CSidebarHeader } from '@coreui/react';
import { CIcon } from '@coreui/icons-react';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router';
import '../../estilos/tema-personal.scss';
import { useSesion } from '../../sesion/ProveedorSesion';
import { DesplegableUsuario } from './DesplegableUsuario';
import { iconoCerrar, iconoMenu } from './iconos';
import { migasDe } from './migas';
import { opcionesDe } from './opcionesMenu';
import { PIE } from './pie';
import { SelectorModo } from './SelectorModo';
import { CONSULTA_CELULAR, usarMedio } from './usarMedio';

interface Propiedades {
  /** El contenido de la pantalla (el `<Outlet />` de las rutas). */
  readonly children: ReactNode;
}

/**
 * Área de administración del personal (013, US1; contracts/portal-diseno.md): menú lateral con las
 * opciones del rol, barra con las migas y el desplegable del usuario, y pie. Sin Redux: el estado
 * del menú vive aquí. Las pantallas ya traen su propio `<main>` y su cabecera, así que el contenido
 * va en un contenedor sin rol, para no repetir los puntos de referencia.
 */
export function DisenoPersonal({ children }: Propiedades) {
  const { sesion } = useSesion();
  const { pathname } = useLocation();
  const celular = usarMedio(CONSULTA_CELULAR);
  const [abierto, setAbierto] = useState(false);
  const [angosto, setAngosto] = useState(false);
  const idMenu = useId();
  const boton = useRef<HTMLButtonElement>(null);
  const cerrarMenu = useRef<HTMLButtonElement>(null);

  // Al cambiar de pantalla o al pasar a escritorio, el menú del celular se cierra.
  useEffect(() => {
    setAbierto(false);
  }, [pathname, celular]);

  useEffect(() => {
    if (!abierto) {
      return undefined;
    }
    const alTeclear = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') {
        setAbierto(false);
        boton.current?.focus();
      }
    };
    document.addEventListener('keydown', alTeclear);
    return () => {
      document.removeEventListener('keydown', alTeclear);
    };
  }, [abierto]);

  // En el celular, el menú abierto tapa el botón de la barra: el foco pasa a "Cerrar menú", dentro
  // del menú (T043 b).
  useEffect(() => {
    if (celular && abierto) {
      cerrarMenu.current?.focus();
    }
  }, [celular, abierto]);

  const opciones = sesion === null ? [] : opcionesDe(sesion.usuario.roles);
  const migas = migasDe(pathname);
  const mostrado = celular && abierto;
  // En el celular, el menú cerrado queda fuera de la pantalla y fuera del orden del teclado.
  const fuera = celular && !abierto;

  return (
    <div className="diseno-personal">
      <CSidebar
        id={idMenu}
        className={`border-end${mostrado ? ' show' : ''}`}
        narrow={!celular && angosto}
        inert={fuera}
      >
        <CSidebarHeader className="border-bottom">
          <CSidebarBrand
            as={Link}
            to={opciones[0]?.ruta ?? '/perfil'}
            className="diseno-personal__marca"
          >
            Municipalidad Provincial de Huanta
          </CSidebarBrand>
          <button
            ref={cerrarMenu}
            type="button"
            className="btn btn-ghost-secondary d-md-none diseno-personal__cerrar"
            aria-label="Cerrar menú"
            onClick={() => {
              setAbierto(false);
              boton.current?.focus();
            }}
          >
            <CIcon icon={iconoCerrar} />
          </button>
        </CSidebarHeader>
        <nav aria-label="Menú del personal" className="diseno-personal__menu">
          {/* Sin "Inicio" ni enlace al portal público (011, FR-020). Sin roles, la lista no se muestra. */}
          {opciones.length > 0 && (
            <ul className="sidebar-nav">
              {opciones.map((opcion) => (
                <li key={opcion.ruta} className="nav-item">
                  <NavLink
                    to={opcion.ruta}
                    end={opcion.ruta === '/admin'}
                    className="nav-link"
                    data-inicial={opcion.etiqueta.charAt(0)}
                    onClick={() => {
                      setAbierto(false);
                    }}
                  >
                    {opcion.etiqueta}
                  </NavLink>
                </li>
              ))}
            </ul>
          )}
        </nav>
        <div className="sidebar-footer border-top d-none d-md-flex">
          <button
            type="button"
            className="btn btn-ghost-secondary diseno-personal__plegar"
            aria-pressed={angosto}
            onClick={() => {
              setAngosto((actual) => !actual);
            }}
          >
            {angosto ? 'Desplegar menú' : 'Plegar menú'}
          </button>
        </div>
      </CSidebar>
      {mostrado && (
        <div
          className="sidebar-backdrop fade show"
          aria-hidden="true"
          onClick={() => {
            setAbierto(false);
          }}
        />
      )}
      <div className="diseno-personal__cuerpo">
        <CHeader className="diseno-personal__barra">
          <CHeaderToggler
            ref={boton}
            className="d-md-none"
            aria-label={abierto ? 'Ocultar menú' : 'Mostrar menú'}
            aria-expanded={abierto}
            aria-controls={idMenu}
            onClick={() => {
              setAbierto((actual) => !actual);
            }}
          >
            <CIcon icon={iconoMenu} />
          </CHeaderToggler>
          <nav aria-label="Migas de pan" className="diseno-personal__migas">
            <ol className="breadcrumb mb-0">
              {migas.map((miga) => (
                <li
                  key={miga.etiqueta}
                  className={`breadcrumb-item${miga.ruta === null ? ' active' : ''}`}
                  aria-current={miga.ruta === null ? 'page' : undefined}
                >
                  {miga.ruta === null ? miga.etiqueta : <Link to={miga.ruta}>{miga.etiqueta}</Link>}
                </li>
              ))}
            </ol>
          </nav>
          <div className="diseno-personal__acciones">
            <SelectorModo />
            <DesplegableUsuario />
          </div>
        </CHeader>
        <div className="diseno-personal__contenido">{children}</div>
        {/* <footer> (y no CFooter, que es un <div>) para que sea el punto de referencia del pie. */}
        <footer className="footer diseno-personal__pie">
          <p className="mb-0">{PIE}</p>
        </footer>
      </div>
    </div>
  );
}
