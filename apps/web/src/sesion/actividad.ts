// Última actividad de la persona en el portal (teclado, toque o clic). Decide si se renueva la
// sesión y cuándo se cierra por inactividad (FR-003a).

const EVENTOS = ['keydown', 'pointerdown', 'click'] as const;

let ultimaActividad = Date.now();

const registrar = (): void => {
  ultimaActividad = Date.now();
};

export const obtenerUltimaActividad = (): number => ultimaActividad;

/** Empieza a escuchar la actividad; devuelve la función para dejar de escuchar. */
export const seguirActividad = (): (() => void) => {
  registrar();
  for (const evento of EVENTOS) {
    window.addEventListener(evento, registrar, { passive: true });
  }
  return () => {
    for (const evento of EVENTOS) {
      window.removeEventListener(evento, registrar);
    }
  };
};
