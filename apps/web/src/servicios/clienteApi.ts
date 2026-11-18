import createClient, { type Middleware } from 'openapi-fetch';
import type { components, paths } from '@licencias/contracts';
import { obtenerToken, type SesionPersonal } from '../sesion/almacen-sesion';
import { renovarSesion } from '../sesion/renovacion';

export type RecetaResumen = components['schemas']['RecetaResumen'];
export type DesafioOtp = components['schemas']['DesafioOtp'];
export type { SesionPersonal };

const TIEMPO_LIMITE_MS = 10_000;

// Copias de cada petición (por id del middleware) para poder repetirla tras renovar el token.
const copias = new Map<string, Request>();

const conToken = (peticion: Request, token: string | null): Request => {
  if (token !== null) {
    peticion.headers.set('Authorization', `Bearer ${token}`);
  }
  return peticion;
};

/**
 * Agrega el token de acceso (que vive solo en memoria) y, ante un 401 fuera de /auth, renueva la
 * sesión una vez y repite la petición con el token nuevo (contracts/portal-seguridad.md).
 */
const middlewareSesion: Middleware = {
  onRequest({ request, id }) {
    const peticion = conToken(request, obtenerToken());
    copias.set(id, peticion.clone());
    return peticion;
  },
  async onResponse({ response, schemaPath, id }) {
    const copia = copias.get(id);
    copias.delete(id);
    if (response.status !== 401 || schemaPath.startsWith('/auth/') || copia === undefined) {
      return response;
    }
    if (!(await renovarSesion())) {
      return response;
    }
    return globalThis.fetch(conToken(copia, obtenerToken()));
  },
};

// Cliente tipado con el contrato OpenAPI. La API se sirve desde el mismo origen (/api/v1):
// nginx en Docker y el proxy de Vite en desarrollo. `fetch` se resuelve en cada llamada (no al
// crear el cliente) para poder sustituirlo en pruebas; same-origin envía la cookie de renovación.
const cliente = createClient<paths>({
  baseUrl: new URL('/api/v1', window.location.origin).href,
  credentials: 'same-origin',
  fetch: (peticion) => globalThis.fetch(peticion),
});
cliente.use(middlewareSesion);

/** Error genérico: el portal nunca muestra detalles técnicos al administrado (FR-015). */
export class CatalogoNoDisponible extends Error {
  constructor() {
    super('Catálogo no disponible');
    this.name = 'CatalogoNoDisponible';
  }
}

/** Licencias del catálogo (solo tipo LICENCIA). Aborta a los 10 s. */
export async function listarLicencias(): Promise<RecetaResumen[]> {
  const controlador = new AbortController();
  const temporizador = setTimeout(() => {
    controlador.abort();
  }, TIEMPO_LIMITE_MS);

  try {
    const { data, response } = await cliente.GET('/catalogo/recetas', {
      params: { query: { tipo: 'LICENCIA' } },
      signal: controlador.signal,
    });
    if (response.status !== 200 || !data) {
      throw new CatalogoNoDisponible();
    }
    return data;
  } catch {
    throw new CatalogoNoDisponible();
  } finally {
    clearTimeout(temporizador);
  }
}

// ----------------------------------------------------------------------------- autenticación

export interface ErrorCampo {
  readonly campo: string;
  readonly mensaje: string;
}

/** Resultado de una operación de /auth, sin detalles técnicos para la pantalla. */
export type ResultadoAuth<T> =
  | { readonly tipo: 'ok'; readonly datos: T }
  | { readonly tipo: 'credenciales' }
  | { readonly tipo: 'bloqueado'; readonly reintentarEn: Date }
  | { readonly tipo: 'invalido'; readonly errores: readonly ErrorCampo[] }
  | { readonly tipo: 'no-disponible' };

/** `error` es el cuerpo ya leído por openapi-fetch (la respuesta no se puede volver a leer). */
const resultadoDeError = <T>(respuesta: Response, error: unknown): ResultadoAuth<T> => {
  switch (respuesta.status) {
    case 401:
      return { tipo: 'credenciales' };
    case 429: {
      const segundos = Number(respuesta.headers.get('Retry-After') ?? '0');
      return {
        tipo: 'bloqueado',
        reintentarEn: new Date(Date.now() + Math.max(0, segundos) * 1000),
      };
    }
    case 422: {
      const errores = (error as { errores?: ErrorCampo[] } | undefined)?.errores;
      return { tipo: 'invalido', errores: errores ?? [] };
    }
    default:
      return { tipo: 'no-disponible' };
  }
};

const ejecutarAuth = async <T>(
  llamada: () => Promise<{ data?: T; error?: unknown; response: Response }>,
): Promise<ResultadoAuth<T>> => {
  try {
    const { data, error, response } = await llamada();
    if (response.ok && data !== undefined) {
      return { tipo: 'ok', datos: data };
    }
    return resultadoDeError<T>(response, error);
  } catch {
    return { tipo: 'no-disponible' };
  }
};

export const iniciarSesion = (correo: string, clave: string) =>
  ejecutarAuth(() => cliente.POST('/auth/iniciar-sesion', { body: { correo, clave } }));

export const verificarOtp = (desafioId: string, codigo: string) =>
  ejecutarAuth(() => cliente.POST('/auth/verificar-otp', { body: { desafioId, codigo } }));

export const cambiarClave = (claveActual: string, claveNueva: string) =>
  ejecutarAuth(() => cliente.POST('/auth/cambiar-clave', { body: { claveActual, claveNueva } }));

/** Cierra la sesión del navegador (la cookie). Nunca falla: si no hay red, la sesión vence sola. */
export async function cerrarSesion(): Promise<void> {
  try {
    await cliente.POST('/auth/cerrar-sesion');
  } catch {
    // Sin red: el portal igual descarta la sesión en memoria.
  }
}
