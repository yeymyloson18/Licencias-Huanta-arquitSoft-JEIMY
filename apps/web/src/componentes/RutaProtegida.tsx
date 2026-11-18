import type { ReactNode } from 'react';
import { Navigate } from 'react-router';
import { useSesion } from '../sesion/ProveedorSesion';

interface Propiedades {
  readonly children: ReactNode;
  /** Solo `/cambiar-clave`: la única pantalla permitida con clave temporal (FR-022). */
  readonly permitirClaveTemporal?: boolean;
}

/** Sin sesión lleva a `/ingresar`; con clave temporal lleva a `/cambiar-clave`. */
export function RutaProtegida({ children, permitirClaveTemporal = false }: Propiedades) {
  const { estado, sesion } = useSesion();

  if (estado === 'cargando') {
    return (
      <p className="aviso" role="status">
        Cargando…
      </p>
    );
  }
  if (sesion === null) {
    return <Navigate to="/ingresar" replace />;
  }
  if (sesion.debeCambiarClave && !permitirClaveTemporal) {
    return <Navigate to="/cambiar-clave" replace />;
  }
  return children;
}
