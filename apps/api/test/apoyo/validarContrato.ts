import { join } from 'node:path';
import { bundle, loadConfig } from '@redocly/openapi-core';
import Ajv2020, { type ValidateFunction } from 'ajv/dist/2020';
import addFormats from 'ajv-formats';

// Valida respuestas HTTP contra docs/06-contrato-api/openapi.yaml (FR-020, research.md §R-10).
// El contrato es OpenAPI 3.1, cuyos esquemas son JSON Schema 2020-12: se compilan con Ajv2020.

const raizRepo = join(__dirname, '..', '..', '..', '..');
const rutaContrato = join(raizRepo, 'docs', '06-contrato-api', 'openapi.yaml');

export interface RespuestaHttp {
  readonly status: number;
  readonly headers: Readonly<Record<string, unknown>>;
  readonly body: unknown;
}

type Metodo = 'get' | 'post' | 'put' | 'patch' | 'delete';

interface Contenido {
  readonly schema?: object;
}
interface RespuestaContrato {
  readonly content?: Readonly<Record<string, Contenido>>;
}
interface Operacion {
  readonly responses?: Readonly<Record<string, RespuestaContrato>>;
}
interface Contrato {
  readonly paths: Readonly<Record<string, Readonly<Partial<Record<Metodo, Operacion>>>>>;
}

let contratoCargado: Promise<Contrato> | undefined;

const cargarContrato = (): Promise<Contrato> => {
  contratoCargado ??= (async () => {
    const config = await loadConfig({ configPath: join(raizRepo, 'redocly.yaml') });
    const resultado = await bundle({ ref: rutaContrato, config, dereference: true });
    return resultado.bundle.parsed as Contrato;
  })();
  return contratoCargado;
};

const ajv = new Ajv2020({ strict: false, allErrors: true });
addFormats(ajv);
const validadores = new Map<string, ValidateFunction>();

const tipoDeContenido = (respuesta: RespuestaHttp): string => {
  const cabecera = respuesta.headers['content-type'];
  const valor = Array.isArray(cabecera) ? String(cabecera[0]) : String(cabecera ?? '');
  return valor.split(';')[0]?.trim() ?? '';
};

/**
 * Falla si el código de estado no está declarado para la operación, si el tipo de contenido no
 * coincide o si el cuerpo no cumple el esquema del contrato.
 */
export async function esperarCumpleContrato(
  metodo: Metodo,
  ruta: string,
  respuesta: RespuestaHttp,
): Promise<void> {
  const contrato = await cargarContrato();
  const operacion = contrato.paths[ruta]?.[metodo];
  if (!operacion) {
    throw new Error(`El contrato no define ${metodo.toUpperCase()} ${ruta}`);
  }

  const status = String(respuesta.status);
  const declarada = operacion.responses?.[status];
  if (!declarada) {
    throw new Error(
      `El contrato no declara la respuesta ${status} para ${metodo.toUpperCase()} ${ruta}`,
    );
  }

  const tipo = tipoDeContenido(respuesta);
  const contenido = declarada.content?.[tipo];
  if (!contenido?.schema) {
    const esperados = Object.keys(declarada.content ?? {}).join(', ') || '(sin cuerpo)';
    throw new Error(
      `Tipo de contenido "${tipo}" no declarado para ${status} en ${metodo.toUpperCase()} ${ruta}; se esperaba: ${esperados}`,
    );
  }

  const clave = `${metodo} ${ruta} ${status} ${tipo}`;
  let validar = validadores.get(clave);
  if (!validar) {
    validar = ajv.compile(contenido.schema);
    validadores.set(clave, validar);
  }

  if (!validar(respuesta.body)) {
    throw new Error(
      `La respuesta ${status} de ${metodo.toUpperCase()} ${ruta} no cumple el contrato: ${ajv.errorsText(validar.errors)}`,
    );
  }
}
