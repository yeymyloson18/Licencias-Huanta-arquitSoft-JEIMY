import type { components } from '@licencias/contracts';

export type SesionPersonal = components['schemas']['SesionPersonal'];

// Sesión del personal en memoria (research.md §R-14): el token de acceso nunca se guarda en
// localStorage, sessionStorage ni cookies legibles por JavaScript. Vive fuera de React para que el
// cliente de la API lo lea sin depender de componentes.

let sesionActual: SesionPersonal | null = null;
let emitidaEn = 0;
const oyentes = new Set<() => void>();

export const obtenerSesion = (): SesionPersonal | null => sesionActual;

export const obtenerToken = (): string | null => sesionActual?.accessToken ?? null;

/** Momento (ms) en que se recibió el token vigente. */
export const momentoEmision = (): number => emitidaEn;

export const fijarSesion = (sesion: SesionPersonal | null): void => {
  sesionActual = sesion;
  emitidaEn = sesion === null ? 0 : Date.now();
  for (const oyente of oyentes) {
    oyente();
  }
};

export const suscribirSesion = (oyente: () => void): (() => void) => {
  oyentes.add(oyente);
  return () => {
    oyentes.delete(oyente);
  };
};

/** Solo para pruebas: vuelve al estado inicial sin avisar a nadie. */
export const reiniciarSesion = (): void => {
  sesionActual = null;
  emitidaEn = 0;
};
