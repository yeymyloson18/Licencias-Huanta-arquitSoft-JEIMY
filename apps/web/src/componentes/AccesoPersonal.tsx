import { Link, useLocation } from 'react-router';
import { useSesion } from '../sesion/ProveedorSesion';

/**
 * Enlace discreto "Acceso del personal" en las páginas públicas (011, FR-021). Solo sin sesión del
 * personal: con sesión, el menú ya lleva a su pantalla. No aparece mientras se comprueba la sesión
 * (evita un parpadeo) ni en la propia pantalla de ingreso.
 */
export function AccesoPersonal() {
  const { estado } = useSesion();
  const ubicacion = useLocation();

  if (estado !== 'sin-sesion' || ubicacion.pathname === '/ingresar') {
    return null;
  }
  return (
    <nav className="acceso-personal" aria-label="Acceso del personal">
      <Link to="/ingresar" className="acceso-personal__enlace">
        Acceso del personal
      </Link>
    </nav>
  );
}
