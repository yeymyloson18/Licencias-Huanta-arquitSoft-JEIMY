import type { ConfiguracionOrientacion } from '../../../compartido/infraestructura/configuracion';
import type {
  MensajeProveedor,
  ProveedorOrientacion,
  ResultadoProveedor,
} from '../dominio/puertos';

// Adaptador del proveedor externo de IA (012, ADR-011; research R-05 y contracts/proveedor-ia.md).
// Formato compatible con OpenAI chat completions, con `fetch` nativo y un tiempo máximo con
// AbortSignal.timeout. Sin SDK y sin reintentos (un reintento duplica la espera y gasta la cuota).
// Nunca copia la respuesta del proveedor ni la clave a los resultados, errores o registros.

const TEMPERATURA = 0.2;
const MAXIMO_TOKENS = 600;

/** `choices[0].message.content`, solo si es un texto no vacío. */
const leerContenido = (cuerpo: unknown): string | null => {
  if (typeof cuerpo !== 'object' || cuerpo === null || !('choices' in cuerpo)) {
    return null;
  }
  const { choices } = cuerpo;
  if (!Array.isArray(choices)) {
    return null;
  }
  const primera: unknown = choices[0];
  if (typeof primera !== 'object' || primera === null || !('message' in primera)) {
    return null;
  }
  const { message } = primera;
  if (typeof message !== 'object' || message === null || !('content' in message)) {
    return null;
  }
  const { content } = message;
  return typeof content === 'string' && content.trim().length > 0 ? content : null;
};

export class ProveedorIaCompatibleOpenAI implements ProveedorOrientacion {
  // La configuración (con la clave) queda fuera de JSON.stringify y de la inspección del objeto.
  readonly #configuracion: ConfiguracionOrientacion;

  constructor(configuracion: ConfiguracionOrientacion) {
    this.#configuracion = configuracion;
  }

  async responder(mensajes: readonly MensajeProveedor[]): Promise<ResultadoProveedor> {
    const { apiKey, apiUrl, modelo, tiempoMaximoMs, formatoJson } = this.#configuracion;
    if (apiKey === null) {
      return { tipo: 'NO_CONFIGURADO' };
    }

    const senal = AbortSignal.timeout(tiempoMaximoMs);
    let respuesta: Response;
    try {
      respuesta = await fetch(`${apiUrl}/chat/completions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: modelo,
          temperature: TEMPERATURA,
          max_tokens: MAXIMO_TOKENS,
          ...(formatoJson ? { response_format: { type: 'json_object' } } : {}),
          messages: mensajes.map((mensaje) => ({ role: mensaje.rol, content: mensaje.contenido })),
        }),
        signal: senal,
      });
    } catch {
      // La señal dice si se cortó por el tiempo máximo (el error puede venir de otro contexto).
      return { tipo: senal.aborted ? 'TIEMPO_AGOTADO' : 'FALLA' };
    }

    if (!respuesta.ok) {
      // Se descarta el cuerpo sin leerlo: puede repetir datos de la petición.
      await respuesta.body?.cancel().catch(() => undefined);
      if (respuesta.status === 429) {
        return { tipo: 'CUOTA_AGOTADA' };
      }
      if (respuesta.status === 401 || respuesta.status === 403) {
        return { tipo: 'CLAVE_INVALIDA' };
      }
      return { tipo: 'FALLA' };
    }

    let cuerpo: unknown;
    try {
      cuerpo = await respuesta.json();
    } catch {
      return { tipo: senal.aborted ? 'TIEMPO_AGOTADO' : 'RESPUESTA_INVALIDA' };
    }
    const contenido = leerContenido(cuerpo);
    return contenido === null ? { tipo: 'RESPUESTA_INVALIDA' } : { tipo: 'OK', contenido };
  }
}
