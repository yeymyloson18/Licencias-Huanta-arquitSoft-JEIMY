import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';

// Documentación interactiva de la API (008, research §R-01): el contrato se lee UNA vez al arrancar
// desde docs/06-contrato-api/openapi.yaml, la única fuente de verdad; no se duplica en decoradores.

/** El contrato no se encontró o no es un documento OpenAPI válido como objeto. */
export class ErrorContratoApi extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = 'ErrorContratoApi';
  }
}

/**
 * Dónde buscar el contrato si no se indica `DOCS_API_CONTRATO`: dentro de la imagen
 * (`apps/api/contrato/openapi.yaml`) o en el repositorio (`docs/06-contrato-api/openapi.yaml`).
 */
export const rutasCandidatasDelContrato = (directorioApi: string): string[] => [
  join(directorioApi, 'contrato', 'openapi.yaml'),
  join(directorioApi, '..', '..', 'docs', '06-contrato-api', 'openapi.yaml'),
];

/** La primera ruta candidata que existe, o `null`. */
export const ubicarContrato = (
  candidatas: readonly string[],
  existe: (ruta: string) => boolean = existsSync,
): string | null => candidatas.find((ruta) => existe(ruta)) ?? null;

/** Lee el YAML y lo devuelve como objeto (lo que se sirve en /api/docs/openapi.json). */
export const leerContratoApi = (
  ruta: string,
  leer: (ruta: string) => string = (archivo) => readFileSync(archivo, 'utf8'),
): Record<string, unknown> => {
  let texto: string;
  try {
    texto = leer(ruta);
  } catch {
    throw new ErrorContratoApi(`No se pudo leer el contrato de la API en ${ruta}`);
  }
  const documento: unknown = parse(texto);
  if (
    typeof documento !== 'object' ||
    documento === null ||
    Array.isArray(documento) ||
    !('openapi' in documento) ||
    !('paths' in documento)
  ) {
    throw new ErrorContratoApi('El contrato de la API no es un documento OpenAPI');
  }
  return documento;
};
