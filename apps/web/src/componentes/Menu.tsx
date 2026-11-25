import type { components } from '@licencias/contracts';
import { Link, useLocation, useNavigate } from 'react-router';
import { useSesion } from '../sesion/ProveedorSesion';

type Rol = components['schemas']['Rol'];

interface Opcion {
  readonly etiqueta: string;
  readonly ruta: string;
  /** Roles que ven la opción (basta con uno). */
  readonly roles: readonly Rol[];
}

// Las opciones de los demás módulos se agregan aquí a medida que existan (FR-026).
const OPCIONES: readonly Opcion[] = [
  { etiqueta: 'Panel', ruta: '/admin', roles: ['ADMINISTRADOR'] },
  { etiqueta: 'Usuarios', ruta: '/admin/usuarios', roles: ['ADMINISTRADOR'] },
  { etiqueta: 'Catálogo', ruta: '/admin/catalogo', roles: ['ADMINISTRADOR'] },
  { etiqueta: 'Feriados', ruta: '/admin/feriados', roles: ['ADMINISTRADOR'] },
  // 009: auditoría de seguridad (accesos y configuración); la de JEFATURA sigue aparte.
  { etiqueta: 'Auditoría', ruta: '/admin/auditoria', roles: ['ADMINISTRADOR'] },
  {
    etiqueta: 'Expedientes',
    ruta: '/personal/expedientes',
    roles: ['MESA_PARTES', 'EVALUADOR', 'JEFATURA'],
  },
  { etiqueta: 'Registrar solicitud', ruta: '/personal/mesa-partes/nueva', roles: ['MESA_PARTES'] },
  { etiqueta: 'Caja', ruta: '/personal/caja', roles: ['CAJA'] },
  { etiqueta: 'Auditoría', ruta: '/personal/auditoria', roles: ['JEFATURA'] },
  { etiqueta: 'Inspecciones', ruta: '/personal/inspecciones', roles: ['JEFATURA', 'INSPECTOR'] },
  { etiqueta: 'Alertas', ruta: '/personal/alertas', roles: ['JEFATURA'] },
  { etiqueta: 'Tablero', ruta: '/personal/tablero', roles: ['JEFATURA'] },
];

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

  const visibles = OPCIONES.filter((opcion) =>
    opcion.roles.some((rol) => sesion.usuario.roles.includes(rol)),
  );

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
