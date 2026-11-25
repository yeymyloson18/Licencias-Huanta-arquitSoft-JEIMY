import { interpretarRespuesta, type RespuestaModelo } from '../dominio/interpretar-respuesta';
import {
  ACLARACION_ORIENTACION,
  armarMensajes,
  TEXTO_CONSULTA_TRAMITE,
  TEXTO_FUERA_DE_TEMA,
  TEXTO_NO_DISPONIBLE,
  TEXTO_SIN_INFORMACION,
} from '../dominio/mensajes-orientacion';
import { PreguntaOrientacion, type TurnoRecibido } from '../dominio/pregunta-orientacion';
import type {
  FuenteCatalogo,
  FuenteGuia,
  LicenciaVigente,
  ProveedorOrientacion,
  Reloj,
} from '../dominio/puertos';
import { quitarDatosPersonales } from '../dominio/quitar-datos-personales';
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
  readonly reloj: Reloj;
}

export interface EntradaPregunta {
  readonly pregunta: string;
  readonly historial: readonly TurnoRecibido[];
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

  async ejecutar(entrada: EntradaPregunta): Promise<SalidaPregunta> {
    const inicio = this.d.reloj.ahora();
    // Valida antes de todo: una pregunta inválida no llega a ningún puerto (lanza el error).
    const pregunta = PreguntaOrientacion.crear(entrada.pregunta, entrada.historial);

    const limpia = quitarDatosPersonales(pregunta.texto);
    const historial = pregunta.historial.map((turno) => ({
      rol: turno.rol,
      ...quitarDatosPersonales(turno.texto),
    }));
    const datoPersonalQuitado = limpia.quitados || historial.some((turno) => turno.quitados);

    const terminar = (respuesta: RespuestaSinDato, desenlace: Desenlace): SalidaPregunta => ({
      respuesta: { ...respuesta, datoPersonalQuitado },
      desenlace,
      duracionMs: this.d.reloj.ahora() - inicio,
    });

    const licencias = await this.d.catalogo.licenciasVigentes();
    const contexto = seleccionarContexto(limpia.texto, historial, licencias, this.d.guia.temas());
    const resultado = await this.d.proveedor.responder(
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
