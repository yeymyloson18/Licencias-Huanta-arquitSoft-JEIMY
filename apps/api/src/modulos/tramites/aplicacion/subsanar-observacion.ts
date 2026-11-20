import { ErrorValidacionSolicitud, type ErrorCampoSolicitud } from '../dominio/errores';
import { TEXTO_ESTADO_PUBLICO } from '../dominio/estado-publico';
import { ErrorTransicionInvalida, siguienteEstado } from '../dominio/maquina-estados';
import { campoRequisito, type DocumentoAdjunto } from '../dominio/politica-requisitos';
import type { RepositorioDocumentosTemporales } from '../dominio/puertos/repositorio-documentos-temporales';
import type {
  ExpedienteParaSubsanar,
  RepositorioSubsanacion,
} from '../dominio/puertos/repositorio-subsanacion';
import type { PlazosHabiles } from '../dominio/puertos/plazos-habiles';
import type { Reloj } from '../dominio/puertos/reloj';
import { fechaLima } from '../../../compartido/dominio/fecha-lima';
import { reanudarPlazo } from './plazo-expediente';
import type {
  IdentidadSolicitud,
  VerificadorIdentidad,
} from '../dominio/puertos/verificador-identidad';
import { ErrorExpedienteNoEncontrado, ErrorIdentidadNoConfirmada } from './errores';
import { type CanalEntrante, revisarDocumentosTemporales } from './revisar-documentos';

/** La identidad confirmada no es la del titular (403, sin decir de quién es el expediente). */
export class ErrorNoEsTitular extends Error {
  constructor() {
    super('La identidad no es la del titular del expediente');
    this.name = 'ErrorNoEsTitular';
  }
}

/** Esquema `ExpedienteRegistrado` del contrato, ya en EN_EVALUACION. */
export interface ExpedienteSubsanado {
  readonly numero: string;
  readonly estado: 'EN_EVALUACION';
  readonly ruta: ExpedienteParaSubsanar['ruta'];
  readonly codigoReceta: string;
  readonly nombreLicencia: string;
  readonly canal: ExpedienteParaSubsanar['canal'];
  readonly presentadoEn: Date;
  readonly vencePlazoEn: Date | null;
  readonly siguientePaso: string;
}

/**
 * Subsanar la observación (historia 4 de la 005, CU05): en línea, el titular con su identidad
 * confirmada; en mesa de partes, el personal. Se adjuntan documentos de requisitos de la receta guardada
 * al presentar y el expediente vuelve a EN_EVALUACION. Ningún error lleva datos personales.
 */
export class SubsanarObservacion {
  constructor(
    private readonly d: {
      readonly repositorio: RepositorioSubsanacion;
      readonly verificador: VerificadorIdentidad;
      readonly documentos: RepositorioDocumentosTemporales;
      readonly reloj: Reloj;
      /** Días hábiles (006): al subsanar se reanuda el plazo suspendido. */
      readonly plazos?: PlazosHabiles;
    },
  ) {}

  async ejecutar(entrada: {
    readonly numero: string;
    readonly canal: CanalEntrante;
    readonly identidad: IdentidadSolicitud | null;
    readonly documentos: readonly DocumentoAdjunto[];
  }): Promise<ExpedienteSubsanado> {
    const { numero, canal, documentos } = entrada;
    if (documentos.length === 0) {
      throw new ErrorValidacionSolicitud([
        { campo: 'documentos', mensaje: 'Adjunta al menos un documento' },
      ]);
    }
    const expediente = await this.d.repositorio.obtener(numero);
    if (expediente === null) {
      throw new ErrorExpedienteNoEncontrado();
    }
    // Primero quién es: a una persona ajena no se le revela el estado del expediente.
    if (canal.tipo === 'EN_LINEA') {
      await this.comprobarTitular(numero, canal.verificacionId, entrada.identidad);
    }
    const estadoNuevo = siguienteEstado(expediente.estado, expediente.ruta, 'SUBSANAR');

    const ordenPorRequisito = new Map(expediente.requisitos.map((r) => [r.id, r.orden]));
    const ajenos: ErrorCampoSolicitud[] = documentos
      .filter((adjunto) => !ordenPorRequisito.has(adjunto.requisitoId))
      .map((adjunto) => ({
        campo: campoRequisito(adjunto.requisitoId),
        mensaje: 'Este requisito no es de la licencia del expediente',
      }));
    const errores = [...ajenos, ...(await revisarDocumentosTemporales(this.d, documentos, canal))];
    if (errores.length > 0) {
      throw new ErrorValidacionSolicitud(errores);
    }

    const en = this.d.reloj.ahora();
    const plazo = await reanudarPlazo(this.d.plazos, expediente.plazoRestanteDias, fechaLima(en));
    const resultado = await this.d.repositorio.subsanar({
      expedienteId: expediente.id,
      numero,
      versionEsperada: expediente.version,
      documentos: documentos.map((adjunto) => ({
        documentoId: adjunto.documentoId,
        requisitoId: adjunto.requisitoId,
        requisitoOrden: ordenPorRequisito.get(adjunto.requisitoId) ?? 0,
      })),
      usuarioId: canal.tipo === 'MESA_PARTES' ? canal.usuarioId : null,
      ...(plazo.vencePlazoEn === undefined ? {} : { vencePlazoEn: plazo.vencePlazoEn }),
      en,
    });
    switch (resultado) {
      case 'CAMBIO':
        // Otra subsanación (o decisión) ganó la carrera: ya no está OBSERVADO.
        throw new ErrorTransicionInvalida(expediente.estado, 'SUBSANAR');
      case 'DOCUMENTOS_NO_DISPONIBLES':
        throw new ErrorValidacionSolicitud([
          {
            campo: 'documentos',
            mensaje: 'Algún documento ya no está disponible. Vuelve a subirlo',
          },
        ]);
      case 'SUBSANADO':
        return {
          numero: expediente.numero,
          estado: estadoNuevo as 'EN_EVALUACION',
          ruta: expediente.ruta,
          codigoReceta: expediente.codigoReceta,
          nombreLicencia: expediente.nombreLicencia,
          canal: expediente.canal,
          presentadoEn: expediente.presentadoEn,
          vencePlazoEn: expediente.vencePlazoEn,
          siguientePaso: TEXTO_ESTADO_PUBLICO.EN_EVALUACION.siguientePaso,
        };
    }
  }

  private async comprobarTitular(
    numero: string,
    verificacionId: string,
    identidad: IdentidadSolicitud | null,
  ): Promise<void> {
    if (identidad === null) {
      throw new ErrorValidacionSolicitud([
        { campo: 'identidad', mensaje: 'Envía la identidad que confirmaste con el código' },
      ]);
    }
    const resultado = await this.d.verificador.confirmarEnLinea(verificacionId, identidad);
    if (resultado.tipo === 'DATOS_INVALIDOS') {
      throw new ErrorValidacionSolicitud(
        resultado.campos.map((campo) => ({
          campo: `identidad.${campo}`,
          mensaje: 'El dato de identidad no es válido',
        })),
      );
    }
    if (resultado.tipo === 'NO_CONFIRMADA') {
      throw new ErrorIdentidadNoConfirmada();
    }
    const documento = identidad.numeroDocumento.trim().toUpperCase();
    const ruc = identidad.ruc.trim();
    const esTitular =
      (await this.d.repositorio.esDelTitular(numero, documento)) ||
      (await this.d.repositorio.esDelTitular(numero, ruc));
    if (!esTitular) {
      throw new ErrorNoEsTitular();
    }
  }
}
