import { fijarSesion, type SesionPersonal } from './almacen-sesion';

// Renovación del token con la cookie refresh_personal (research.md §R-06). Hay una sola renovación
// en curso por pestaña y, si el navegador lo permite, también entre pestañas (Web Locks): como la
// cookie es compartida, la segunda pestaña ya envía el refresh nuevo y no dispara la detección de
// reutilización.

let enCurso: Promise<boolean> | null = null;

const pedirRenovacion = async (): Promise<boolean> => {
  try {
    const respuesta = await globalThis.fetch(
      new Request(new URL('/api/v1/auth/renovar', window.location.origin), {
        method: 'POST',
        credentials: 'same-origin',
      }),
    );
    if (respuesta.status === 200) {
      fijarSesion((await respuesta.json()) as SesionPersonal);
      return true;
    }
    fijarSesion(null);
    return false;
  } catch {
    // Sin red: se conserva la sesión en pantalla y se reintenta en la siguiente ocasión.
    return false;
  }
};

const conBloqueoEntrePestanas = (tarea: () => Promise<boolean>): Promise<boolean> => {
  // Los tipos dicen que siempre existe, pero navegadores antiguos y jsdom no lo tienen.
  const bloqueos = (navigator as Partial<Pick<Navigator, 'locks'>>).locks;
  if (bloqueos === undefined) {
    return tarea();
  }
  // `request` devuelve lo mismo que la tarea; los tipos de TypeScript lo envuelven en otra promesa.
  return bloqueos.request('renovar-sesion', tarea) as unknown as Promise<boolean>;
};

/** Renueva la sesión; devuelve `true` si hay un token nuevo. */
export const renovarSesion = (): Promise<boolean> => {
  enCurso ??= conBloqueoEntrePestanas(pedirRenovacion).finally(() => {
    enCurso = null;
  });
  return enCurso;
};
