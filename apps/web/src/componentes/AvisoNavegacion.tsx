import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';

interface Propiedades {
  /** Aviso de la sesión (por ejemplo, cierre por inactividad); se muestra si no hay otro. */
  readonly respaldo?: string | null;
}

interface AvisoMostrado {
  readonly ruta: string;
  readonly texto: string;
}

const avisoDe = (estado: unknown): string | null => {
  const aviso = (estado as { aviso?: unknown } | null)?.aviso;
  return typeof aviso === 'string' && aviso.length > 0 ? aviso : null;
};

/**
 * Aviso que llega con la navegación (`state.aviso`, por ejemplo "Su clave se cambió") en cualquier
 * pantalla (011). Después de mostrarlo lo quita del historial, conservando el resto del estado,
 * para que recargar no lo repita; desaparece al ir a otra pantalla.
 */
export function AvisoNavegacion({ respaldo = null }: Propiedades) {
  const ubicacion = useLocation();
  const navegar = useNavigate();
  const [mostrado, setMostrado] = useState<AvisoMostrado | null>(null);
  const pendiente = avisoDe(ubicacion.state);

  useEffect(() => {
    if (pendiente === null) {
      return;
    }
    setMostrado({ ruta: ubicacion.pathname, texto: pendiente });
    const resto: Record<string, unknown> = { ...(ubicacion.state as Record<string, unknown>) };
    delete resto.aviso;
    void navegar(
      { pathname: ubicacion.pathname, search: ubicacion.search, hash: ubicacion.hash },
      { replace: true, state: Object.keys(resto).length > 0 ? resto : null },
    );
  }, [pendiente, ubicacion, navegar]);

  const deEstaPantalla = mostrado?.ruta === ubicacion.pathname ? mostrado.texto : null;
  const mensaje = pendiente ?? deEstaPantalla ?? respaldo;
  if (mensaje === null || mensaje === '') {
    return null;
  }
  return (
    <p className="aviso aviso--info" role="status">
      {mensaje}
    </p>
  );
}
