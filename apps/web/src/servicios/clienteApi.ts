import createClient from 'openapi-fetch';
import type { components, paths } from '@licencias/contracts';

export type RecetaResumen = components['schemas']['RecetaResumen'];

const TIEMPO_LIMITE_MS = 10_000;

// Cliente tipado con el contrato OpenAPI. La API se sirve desde el mismo origen (/api/v1):
// nginx en Docker y el proxy de Vite en desarrollo.
// `fetch` se resuelve en cada llamada (no al crear el cliente) para poder sustituirlo en pruebas.
const cliente = createClient<paths>({
  baseUrl: new URL('/api/v1', window.location.origin).href,
  fetch: (peticion) => globalThis.fetch(peticion),
});

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
