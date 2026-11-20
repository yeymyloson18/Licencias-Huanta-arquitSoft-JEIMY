import { ErrorValidacionSolicitud, type ErrorCampoSolicitud } from '../dominio/errores';
import { crearExpediente, type Establecimiento } from '../dominio/expediente';
import { TEXTO_ESTADO_PUBLICO } from '../dominio/estado-publico';
import {
  clasificarRequisitos,
  revisarAdjuntos,
  type DocumentoAdjunto,
} from '../dominio/politica-requisitos';
import type { CalculadorHuella } from '../dominio/puertos/calculador-huella';
import type { CatalogoRecetas } from '../dominio/puertos/catalogo-recetas';
import type { RepositorioDocumentosTemporales } from '../dominio/puertos/repositorio-documentos-temporales';
import type { Reloj } from '../dominio/puertos/reloj';
import type {
  ExpedienteRegistrado,
  UnidadDeTrabajoTramites,
} from '../dominio/puertos/unidad-de-trabajo-tramites';
import type {
  IdentidadSolicitud,
  VerificadorIdentidad,
} from '../dominio/puertos/verificador-identidad';
import type { RecetaAlPresentar } from '../dominio/receta-al-presentar';
import {
  ErrorIdentidadNoConfirmada,
  ErrorIdentificacionNoDisponible,
  ErrorPermisoUsado,
} from './errores';
import { type CanalEntrante, revisarDocumentosTemporales } from './revisar-documentos';

export interface DependenciasPresentarSolicitud {
  readonly unidad: UnidadDeTrabajoTramites;
  readonly catalogo: CatalogoRecetas;
  readonly verificador: VerificadorIdentidad;
  readonly documentos: RepositorioDocumentosTemporales;
  readonly huella: CalculadorHuella;
  readonly reloj: Reloj;
}

/** Cuerpo `NuevaSolicitud` del contrato. */
export interface SolicitudEntrante {
  readonly codigoReceta: string;
  readonly expedienteOrigen: string | null;
  readonly identidad: IdentidadSolicitud;
  readonly nombreTitular: string;
  readonly razonSocial: string | null;
  readonly correo: string | null;
  readonly nombreComercial: string | null;
  readonly giro: string;
  readonly direccion: string;
  readonly zona: string;
  readonly areaM2: number | null;
  readonly documentos: readonly DocumentoAdjunto[];
}

/**
 * Por dónde llega la solicitud: en línea, con la verificación de identidad del token; en mesa de
 * partes, con el usuario del personal que la registra (historia 3).
 */
export type { CanalEntrante } from './revisar-documentos';

export interface PresentacionRegistrada extends ExpedienteRegistrado {
  readonly siguientePaso: string;
  readonly vencePlazoEn: null;
}

export type ResultadoPresentacion =
  | { readonly tipo: 'CREADO'; readonly expediente: PresentacionRegistrada }
  /** Reintento con la misma clave y el mismo cuerpo: el mismo expediente (FR-020). */
  | { readonly tipo: 'EXISTENTE'; readonly expediente: PresentacionRegistrada };

/** JSON con las claves ordenadas: el mismo cuerpo da la misma huella aunque cambie el orden. */
const jsonCanonico = (valor: unknown): string => {
  if (Array.isArray(valor)) {
    return `[${valor.map(jsonCanonico).join(',')}]`;
  }
  if (valor !== null && typeof valor === 'object') {
    const entradas = Object.entries(valor as Record<string, unknown>)
      .filter(([, dato]) => dato !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entradas.map(([clave, dato]) => `${JSON.stringify(clave)}:${jsonCanonico(dato)}`).join(',')}}`;
  }
  return JSON.stringify(valor);
};

const conSiguientePaso = (registrado: ExpedienteRegistrado): PresentacionRegistrada => ({
  ...registrado,
  siguientePaso: TEXTO_ESTADO_PUBLICO.REGISTRADO.siguientePaso,
  vencePlazoEn: null,
});

/**
 * Presenta la solicitud (CU04, FR-008 a FR-022 de la 004), en el orden de
 * contracts/identidad-y-solicitud.md: idempotencia, identidad, receta, datos y requisitos; después,
 * una sola transacción. Ningún error lleva datos personales.
 */
export class PresentarSolicitud {
  constructor(private readonly d: DependenciasPresentarSolicitud) {}

  async ejecutar(entrada: {
    solicitud: SolicitudEntrante;
    claveIdempotencia: string;
    canal: CanalEntrante;
  }): Promise<ResultadoPresentacion> {
    const { solicitud, claveIdempotencia, canal } = entrada;
    const huellaCuerpo = this.d.huella.sha256(new TextEncoder().encode(jsonCanonico(solicitud)));

    const existente = await this.buscarExistente(claveIdempotencia, huellaCuerpo);
    if (existente !== null) {
      return { tipo: 'EXISTENTE', expediente: existente };
    }

    await this.confirmarIdentidad(canal, solicitud.identidad);

    const receta = await this.leerReceta(solicitud);
    const conRepresentante = solicitud.identidad.representante !== undefined;
    const establecimiento: Establecimiento = {
      nombreComercial: solicitud.nombreComercial,
      giro: solicitud.giro,
      direccion: solicitud.direccion,
      zona: solicitud.zona,
      areaM2: solicitud.areaM2,
    };
    const clasificacion = clasificarRequisitos(receta.requisitos, conRepresentante);
    const errores: ErrorCampoSolicitud[] = [
      ...revisarAdjuntos(clasificacion, solicitud.documentos),
      ...(await revisarDocumentosTemporales(this.d, solicitud.documentos, canal)),
    ];
    if (errores.length > 0) {
      // Un envío simultáneo con la misma clave pudo llevarse ya los documentos: entonces es el mismo
      // expediente, no un error (FR-020).
      const ganador = await this.buscarExistente(claveIdempotencia, huellaCuerpo);
      if (ganador !== null) {
        return { tipo: 'EXISTENTE', expediente: ganador };
      }
      throw new ErrorValidacionSolicitud(errores);
    }

    const ordenPorRequisito = new Map(receta.requisitos.map((r) => [r.id, r.orden]));
    const presentadoEn = this.d.reloj.ahora();
    const identidad = solicitud.identidad;
    const resultado = await this.d.unidad.registrar({
      anio: presentadoEn.getFullYear(),
      claveIdempotencia,
      huellaCuerpo,
      armar: (numero) =>
        crearExpediente({
          numero,
          receta,
          canal: canal.tipo,
          titular: {
            tipoDocumento: identidad.tipoDocumento,
            numeroDocumento: identidad.numeroDocumento.trim().toUpperCase(),
            ruc: identidad.ruc.trim(),
            celular: identidad.celular.trim(),
            correo: solicitud.correo,
            nombre: solicitud.nombreTitular,
            razonSocial: solicitud.razonSocial,
          },
          representante:
            identidad.representante === undefined
              ? null
              : {
                  tipoDocumento: identidad.representante.tipoDocumento,
                  numeroDocumento: identidad.representante.numeroDocumento.trim().toUpperCase(),
                },
          establecimiento,
          documentos: solicitud.documentos.map((adjunto) => ({
            documentoId: adjunto.documentoId,
            requisitoId: adjunto.requisitoId,
            requisitoOrden: ordenPorRequisito.get(adjunto.requisitoId) ?? 0,
          })),
          presentadoEn,
          registradoPor: canal.tipo === 'MESA_PARTES' ? canal.usuarioId : null,
          verificacionId: canal.tipo === 'EN_LINEA' ? canal.verificacionId : null,
        }),
    });

    switch (resultado.tipo) {
      case 'CREADO':
        return { tipo: 'CREADO', expediente: conSiguientePaso(resultado.registrado) };
      case 'DOCUMENTOS_NO_DISPONIBLES': {
        const ganador = await this.buscarExistente(claveIdempotencia, huellaCuerpo);
        if (ganador !== null) {
          return { tipo: 'EXISTENTE', expediente: ganador };
        }
        throw new ErrorValidacionSolicitud([
          {
            campo: 'documentos',
            mensaje: 'Algún documento ya no está disponible. Vuelve a subirlo',
          },
        ]);
      }
      case 'PERMISO_USADO':
      case 'CLAVE_EXISTENTE': {
        // Otro envío con la misma clave pudo ganar la carrera: si es la misma solicitud, es el mismo
        // expediente (FR-020); si no, el permiso ya se usó en otra solicitud (aclaración 2).
        const ganador = await this.buscarExistente(claveIdempotencia, huellaCuerpo);
        if (ganador !== null) {
          return { tipo: 'EXISTENTE', expediente: ganador };
        }
        throw new ErrorPermisoUsado();
      }
    }
  }

  private async buscarExistente(
    clave: string,
    huellaCuerpo: string,
  ): Promise<PresentacionRegistrada | null> {
    const existente = await this.d.unidad.buscarPorClave(clave);
    if (existente === null) {
      return null;
    }
    if (existente.huellaCuerpo !== huellaCuerpo) {
      throw new ErrorValidacionSolicitud([
        {
          campo: 'Idempotency-Key',
          mensaje: 'Esta clave ya se usó con otra solicitud. Genera una clave nueva',
        },
      ]);
    }
    return conSiguientePaso(existente.registrado);
  }

  private async confirmarIdentidad(
    canal: CanalEntrante,
    identidad: IdentidadSolicitud,
  ): Promise<void> {
    if (canal.tipo === 'MESA_PARTES') {
      await this.verificarPresencial(identidad);
      return;
    }
    const resultado = await this.d.verificador.confirmarEnLinea(canal.verificacionId, identidad);
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
  }

  /** Mesa de partes: el servicio de identificación comprueba al titular, sin código. */
  private async verificarPresencial(identidad: IdentidadSolicitud): Promise<void> {
    const resultado = await this.d.verificador.verificarPresencial(identidad);
    switch (resultado.tipo) {
      case 'VALIDA':
        return;
      case 'DATOS_INVALIDOS':
        throw new ErrorValidacionSolicitud(
          resultado.campos.map((campo) => ({
            campo: `identidad.${campo}`,
            mensaje: 'El dato de identidad no es válido',
          })),
        );
      case 'NO_COINCIDE':
        // El mismo mensaje para cualquier dato (FR-007).
        throw new ErrorValidacionSolicitud([
          {
            campo: 'identidad',
            mensaje: 'Los datos no coinciden con el servicio de identificación',
          },
        ]);
      case 'NO_DISPONIBLE':
        throw new ErrorIdentificacionNoDisponible();
    }
  }

  private async leerReceta(solicitud: SolicitudEntrante): Promise<RecetaAlPresentar> {
    if (solicitud.expedienteOrigen !== null) {
      throw new ErrorValidacionSolicitud([
        {
          campo: 'expedienteOrigen',
          mensaje: 'Los trámites conectados todavía no se presentan por este medio',
        },
      ]);
    }
    const receta = await this.d.catalogo.obtenerRecetaVigente(solicitud.codigoReceta);
    if (receta === null) {
      throw new ErrorValidacionSolicitud([
        { campo: 'codigoReceta', mensaje: 'Esta licencia no está disponible para presentar' },
      ]);
    }
    return receta;
  }
}
