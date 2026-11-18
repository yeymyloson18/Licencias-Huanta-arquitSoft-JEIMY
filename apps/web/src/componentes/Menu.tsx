import type { components } from '@licencias/contracts';
import { Link, useNavigate } from 'react-router';
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
  { etiqueta: 'Usuarios', ruta: '/admin/usuarios', roles: ['ADMINISTRADOR'] },
];

/** Menú del personal: solo las opciones de sus roles y "Cerrar sesión" (FR-026). */
export function Menu() {
  const { sesion, salir } = useSesion();
  const navegar = useNavigate();

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
      <ul className="menu__opciones">
        <li>
          <Link to="/">Inicio</Link>
        </li>
        {visibles.map((opcion) => (
          <li key={opcion.ruta}>
            <Link to={opcion.ruta}>{opcion.etiqueta}</Link>
          </li>
        ))}
      </ul>
      <button type="button" className="boton boton--secundario" onClick={() => void cerrar()}>
        Cerrar sesión
      </button>
    </nav>
  );
}
