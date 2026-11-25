import { useEffect, useState } from 'react';

/** Si la consulta de medios se cumple, y se actualiza cuando cambia (por ejemplo, al girar). */
export function usarMedio(consulta: string): boolean {
  const [cumple, setCumple] = useState(() => window.matchMedia(consulta).matches);

  useEffect(() => {
    const medio = window.matchMedia(consulta);
    const alCambiar = () => {
      setCumple(medio.matches);
    };
    alCambiar();
    medio.addEventListener('change', alCambiar);
    return () => {
      medio.removeEventListener('change', alCambiar);
    };
  }, [consulta]);

  return cumple;
}

/** Por debajo de 768 px el menú lateral se abre y se cierra con el botón (FR-006). */
export const CONSULTA_CELULAR = '(max-width: 767.98px)';
