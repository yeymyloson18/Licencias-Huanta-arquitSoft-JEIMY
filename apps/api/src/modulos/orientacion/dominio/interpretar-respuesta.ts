import { LARGO_MAXIMO_RESPUESTA } from './mensajes-orientacion';

// Interpretación de lo que devuelve el modelo (012, research R-06). El sistema no confía en el
// modelo: toma el primer objeto JSON del texto y lo valida con comprobaciones propias (el dominio no
// importa zod ni otros paquetes, principio I). Si no cumple, es una falla del proveedor.

export type TipoRespuestaModelo =
  'RESPONDIDA' | 'SIN_INFORMACION' | 'FUERA_DE_TEMA' | 'CONSULTA_TRAMITE';

export interface RespuestaModelo {
  readonly tipo: TipoRespuestaModelo;
  /** Recortado a 1,200 caracteres. */
  readonly texto: string;
  readonly codigosReceta: readonly string[];
}

const TIPOS: readonly string[] = [
  'RESPONDIDA',
  'SIN_INFORMACION',
  'FUERA_DE_TEMA',
  'CONSULTA_TRAMITE',
];
const LARGO_MAXIMO_MODELO = 4000;

const esTipo = (valor: unknown): valor is TipoRespuestaModelo =>
  typeof valor === 'string' && TIPOS.includes(valor);

/** El primer `{…}` balanceado del texto (respeta las llaves dentro de cadenas), o `null`. */
const primerObjeto = (contenido: string): string | null => {
  const inicio = contenido.indexOf('{');
  if (inicio < 0) {
    return null;
  }
  let profundidad = 0;
  let enCadena = false;
  let escapado = false;
  for (let indice = inicio; indice < contenido.length; indice += 1) {
    const caracter = contenido[indice];
    if (enCadena) {
      if (escapado) {
        escapado = false;
      } else if (caracter === '\\') {
        escapado = true;
      } else if (caracter === '"') {
        enCadena = false;
      }
    } else if (caracter === '"') {
      enCadena = true;
    } else if (caracter === '{') {
      profundidad += 1;
    } else if (caracter === '}') {
      profundidad -= 1;
      if (profundidad === 0) {
        return contenido.slice(inicio, indice + 1);
      }
    }
  }
  return null;
};

const leerJson = (texto: string): unknown => {
  try {
    return JSON.parse(texto);
  } catch {
    return null;
  }
};

export const interpretarRespuesta = (contenido: string): RespuestaModelo | null => {
  const objeto = primerObjeto(contenido);
  const datos = objeto === null ? null : leerJson(objeto);
  if (typeof datos !== 'object' || datos === null || Array.isArray(datos)) {
    return null;
  }
  const { tipo, texto, codigosReceta } = datos as Record<string, unknown>;
  if (!esTipo(tipo) || typeof texto !== 'string') {
    return null;
  }
  const limpio = texto.trim();
  if (limpio.length === 0 || limpio.length > LARGO_MAXIMO_MODELO) {
    return null;
  }
  if (codigosReceta !== undefined && !Array.isArray(codigosReceta)) {
    return null;
  }
  return {
    tipo,
    texto: limpio.slice(0, LARGO_MAXIMO_RESPUESTA),
    codigosReceta: (codigosReceta ?? []).filter(
      (codigo): codigo is string => typeof codigo === 'string',
    ),
  };
};
