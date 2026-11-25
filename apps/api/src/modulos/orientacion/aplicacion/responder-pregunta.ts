import { interpretarRespuesta, type RespuestaModelo } from '../dominio/interpretar-respuesta';
import {
  ACLARACION_ORIENTACION,
  armarMensajes,
  TEXTO_CONSULTA_TRAMITE,
  TEXTO_FUERA_DE_TEMA,
  TEXTO_NO_DISPONIBLE,
  TEXTO_PREGUNTA_TIPO_NEGOCIO,
  TEXTO_SIN_INFORMACION,
} from '../dominio/mensajes-orientacion';
import { PreguntaOrientacion, type TurnoRecibido } from '../dominio/pregunta-orientacion';
import type {
  FuenteCatalogo,
  FuenteGuia,
  LicenciaVigente,
  LimitadorPreguntas,
  MensajeProveedor,
  ProveedorOrientacion,
  Reloj,
  ResultadoProveedor,
} from '../dominio/puertos';
import { quitarDatosPersonales } from '../dominio/quitar-datos-personales';
import { revisarCifras } from '../dominio/revisar-cifras';
import type {
  Desenlace,
  Enlace,
  RespuestaOrientacion,
  ResultadoOrientacion,
  TipoEnlace,
} from '../dominio/respuesta-orientacion';
import { type ContextoOrientacion, seleccionarContexto } from '../dominio/seleccionar-contexto';

// Caso de uso del chat de orientación (012). Nunca guarda la pregunta ni la respuesta, y no tiene
// ningún puerto de trámites: no puede ver expedientes (FR-010). Ningún texto sale hacia el proveedor
// sin pasar por quitarDatosPersonales (FR-014).

export interface DependenciasResponderPregunta {
  readonly catalogo: FuenteCatalogo;
  readonly guia: FuenteGuia;
  readonly proveedor: ProveedorOrientacion;
  readonly limitador: LimitadorPreguntas;
  readonly reloj: Reloj;
}

export interface EntradaPregunta {
  readonly pregunta: string;
  readonly historial: readonly TurnoRecibido[];
  /** Huella de la conexión (HMAC con sal), nunca la IP (US5). */
  readonly huella: string;
}

/** US5: la persona superó las preguntas permitidas en la ventana (la pregunta no llega al proveedor). */
export class ErrorLimitePreguntas extends Error {
  constructor(readonly segundosRestantes: number) {
    super('Se superó el límite de preguntas de orientación');
    this.name = 'ErrorLimitePreguntas';
  }
}

export interface SalidaPregunta {
  readonly respuesta: RespuestaOrientacion;
  /** Solo para los registros. */
  readonly desenlace: Desenlace;
  readonly duracionMs: number;
}

type RespuestaSinDato = Omit<RespuestaOrientacion, 'datoPersonalQuitado'>;

const MAXIMO_ENLACES = 4;

/** Respuestas con texto fijo del sistema (nunca el texto del modelo). */
const FIJAS: Readonly<Record<Exclude<ResultadoOrientacion, 'RESPONDIDA'>, RespuestaSinDato>> = {
  SIN_INFORMACION: {
    resultado: 'SIN_INFORMACION',
    texto: TEXTO_SIN_INFORMACION,
    enlaces: [{ tipo: 'LICENCIAS' }],
    aclaracion: null,
  },
  FUERA_DE_TEMA: {
    resultado: 'FUERA_DE_TEMA',
    texto: TEXTO_FUERA_DE_TEMA,
    enlaces: [{ tipo: 'ASISTENTE' }],
    aclaracion: null,
  },
  CONSULTA_TRAMITE: {
    resultado: 'CONSULTA_TRAMITE',
    texto: TEXTO_CONSULTA_TRAMITE,
    enlaces: [{ tipo: 'CONSULTA' }],
    aclaracion: null,
  },
  NO_DISPONIBLE: {
    resultado: 'NO_DISPONIBLE',
    texto: TEXTO_NO_DISPONIBLE,
    enlaces: [{ tipo: 'ASISTENTE' }, { tipo: 'LICENCIAS' }],
    aclaracion: null,
  },
};

/**
 * Enlaces de una respuesta RESPONDIDA, armados por el sistema: la ficha de cada licencia vigente que
 * nombra el modelo; si no nombra ninguna, los del tema principal; si no hay, el asistente.
 */
const enlacesRespondida = (
  modelo: RespuestaModelo,
  licencias: readonly LicenciaVigente[],
  contexto: ContextoOrientacion,
): Enlace[] => {
  const vigentes = new Set(licencias.map((licencia) => licencia.codigo));
  const fichas = [...new Set(modelo.codigosReceta)]
    .filter((codigo) => vigentes.has(codigo))
    .map((codigo): Enlace => ({ tipo: 'FICHA', codigoReceta: codigo }));
  if (fichas.length > 0) {
    return fichas.slice(0, MAXIMO_ENLACES);
  }
  const delTema = (contexto.temaPrincipal?.enlaces ?? [])
    .filter((tipo): tipo is Exclude<TipoEnlace, 'FICHA'> => tipo !== 'FICHA')
    .map((tipo): Enlace => ({ tipo }));
  return delTema.length > 0 ? delTema.slice(0, MAXIMO_ENLACES) : [{ tipo: 'ASISTENTE' }];
};

export class ResponderPregunta {
  constructor(private readonly d: DependenciasResponderPregunta) {}

  /** Las licencias vigentes, o `null` si el catálogo falla o está vacío. */
  private async licenciasVigentes(): Promise<readonly LicenciaVigente[] | null> {
    try {
      const licencias = await this.d.catalogo.licenciasVigentes();
      return licencias.length > 0 ? licencias : null;
    } catch {
      return null;
    }
  }

  /** Una excepción inesperada del adaptador cuenta como falla del proveedor (FR-021). */
  private async responderSinExcepciones(
    mensajes: readonly MensajeProveedor[],
  ): Promise<ResultadoProveedor> {
    try {
      return await this.d.proveedor.responder(mensajes);
    } catch {
      return { tipo: 'FALLA' };
    }
  }

  async ejecutar(entrada: EntradaPregunta): Promise<SalidaPregunta> {
    const inicio = this.d.reloj.ahora();
    // Valida antes de todo: una pregunta inválida no llega a ningún puerto (lanza el error).
    const pregunta = PreguntaOrientacion.crear(entrada.pregunta, entrada.historial);
    // US5: solo cuentan las preguntas válidas; si se superó el límite, no llega al proveedor. Si el
    // límite no se puede comprobar, el error del limitador sube (503 en la presentación).
    const reserva = await this.d.limitador.reservar(entrada.huella);
    if (!reserva.permitido) {
      throw new ErrorLimitePreguntas(reserva.segundosRestantes);
    }

    const limpia = quitarDatosPersonales(pregunta.texto);
    const historial = pregunta.historial.map((turno) => ({
      rol: turno.rol,
      ...quitarDatosPersonales(turno.texto),
      codigosReceta: turno.codigosReceta,
    }));
    const datoPersonalQuitado = limpia.quitados || historial.some((turno) => turno.quitados);

    const terminar = (respuesta: RespuestaSinDato, desenlace: Desenlace): SalidaPregunta => ({
      respuesta: { ...respuesta, datoPersonalQuitado },
      desenlace,
      duracionMs: this.d.reloj.ahora() - inicio,
    });

    // US4: sin catálogo no hay con qué orientar; no se llama al proveedor (FR-021).
    const licencias = await this.licenciasVigentes();
    if (licencias === null) {
      return terminar(FIJAS.NO_DISPONIBLE, 'CATALOGO_NO_DISPONIBLE');
    }
    const contexto = seleccionarContexto(limpia.texto, historial, licencias, this.d.guia.temas());
    // FR-029: pide requisitos sin una licencia identificada → se pregunta el tipo de negocio, sin
    // gastar una llamada al proveedor.
    if (contexto.pideRequisitos && contexto.detalle.length === 0) {
      return terminar(
        {
          resultado: 'RESPONDIDA',
          texto: TEXTO_PREGUNTA_TIPO_NEGOCIO,
          enlaces: [{ tipo: 'ASISTENTE' }],
          aclaracion: ACLARACION_ORIENTACION,
        },
        'PREGUNTA_TIPO_NEGOCIO',
      );
    }
    const resultado = await this.responderSinExcepciones(
      armarMensajes(contexto, historial, limpia.texto),
    );
    if (resultado.tipo !== 'OK') {
      return terminar(FIJAS.NO_DISPONIBLE, resultado.tipo);
    }
    const modelo = interpretarRespuesta(resultado.contenido);
    if (modelo === null) {
      return terminar(FIJAS.NO_DISPONIBLE, 'RESPUESTA_INVALIDA');
    }
    if (modelo.tipo !== 'RESPONDIDA') {
      return terminar(FIJAS[modelo.tipo], modelo.tipo);
    }
    // FR-005: un monto o un plazo que no está en el CONTEXTO nunca llega al administrado.
    if (!revisarCifras(modelo.texto, contexto.cifrasPermitidas).aprobada) {
      return terminar(FIJAS.SIN_INFORMACION, 'RECHAZADA_POR_REVISION');
    }
    return terminar(
      {
        resultado: 'RESPONDIDA',
        texto: modelo.texto,
        enlaces: enlacesRespondida(modelo, licencias, contexto),
        aclaracion: ACLARACION_ORIENTACION,
      },
      'RESPONDIDA',
    );
  }
}
