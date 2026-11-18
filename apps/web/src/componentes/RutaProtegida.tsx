import type { components } from '@licencias/contracts';
import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { useSesion } from '../sesion/ProveedorSesion';

type Rol = components['schemas']['Rol'];

interface Propiedades {
  readonly children: ReactNode;
  /** Si se indica, hace falta al menos uno de estos roles (FR-026). */
  readonly roles?: readonly Rol[];
  /** Solo `/cambiar-clave`: la única pantalla permitida con clave temporal (FR-022). */
  readonly permitirClaveTemporal?: boolean;
}

/**
 * Sin sesión lleva a `/ingresar`; con clave temporal lleva a `/cambiar-clave`; sin el rol necesario
 * muestra que no tiene permiso (la API igual responde 403: esto solo evita una pantalla vacía).
 */
export function RutaProtegida({ children, roles, permitirClaveTemporal = false }: Propiedades) {
  const { estado, sesion } = useSesion();
  const ubicacion = useLocation();

  if (estado === 'cargando') {
    return (
      <p className="aviso" role="status">
        Cargando…
      </p>
    );
  }
  if (sesion === null) {
    // Recuerda la pantalla para volver a ella después de ingresar (por ejemplo, tras un 401).
    return <Navigate to="/ingresar" replace state={{ volverA: ubicacion.pathname }} />;
  }
  if (sesion.debeCambiarClave && !permitirClaveTemporal) {
    return <Navigate to="/cambiar-clave" replace />;
  }
  if (roles !== undefined && !roles.some((rol) => sesion.usuario.roles.includes(rol))) {
    return (
      <main className="contenido">
        <p className="aviso aviso--error" role="alert">
          No tiene permiso para ver esta página
        </p>
      </main>
    );
  }
  return children;
}
