import { Link, useLocation, useNavigate } from 'react-router';
import { useSesion } from '../sesion/ProveedorSesion';
import { opcionesDe } from './diseno/opcionesMenu';

// 013: las opciones por rol viven en componentes/diseno/opcionesMenu.ts, la misma fuente que usa el
// menú lateral. Se movieron sin cambios.

/**
 * Menú del personal: el nombre con "Mi perfil" (011, cualquier rol), las opciones de sus roles y
 * "Cerrar sesión" (FR-026).
 */
export function Menu() {
  const { sesion, salir } = useSesion();
  const navegar = useNavigate();
  const ubicacion = useLocation();

  if (sesion === null) {
    return null;
  }

  const visibles = opcionesDe(sesion.usuario.roles);

  const cerrar = async () => {
    await salir();
    void navegar('/ingresar', { replace: true });
  };

  return (
    <nav className="menu" aria-label="Menú del personal">
      <span className="menu__usuario">{sesion.usuario.nombreCompleto}</span>
      <Link
        to="/perfil"
        className="menu__perfil"
        aria-current={ubicacion.pathname === '/perfil' ? 'page' : undefined}
      >
        Mi perfil
      </Link>
      {/* Sin "Inicio": la pantalla principal de cada rol ya es una opción propia, y el menú no
          enlaza al portal público del ciudadano (011, FR-020). Sin roles, la lista no se muestra. */}
      {visibles.length > 0 && (
        <ul className="menu__opciones">
          {visibles.map((opcion) => (
            <li key={opcion.ruta}>
              <Link to={opcion.ruta}>{opcion.etiqueta}</Link>
            </li>
          ))}
        </ul>
      )}
      <button type="button" className="boton boton--secundario" onClick={() => void cerrar()}>
        Cerrar sesión
      </button>
    </nav>
  );
}
