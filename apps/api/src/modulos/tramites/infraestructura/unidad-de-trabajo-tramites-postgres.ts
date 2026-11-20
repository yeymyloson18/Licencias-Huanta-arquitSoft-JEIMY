import { comoFechaBase, deFechaBase } from '../../../compartido/dominio/fecha-lima';
import { Prisma } from '@prisma/client';
import type { ProtectorDatos } from '../../../compartido/dominio/protector-datos';
import type { PrismaServicio } from '../../../compartido/infraestructura/prisma.servicio';
import type { Canal, Expediente } from '../dominio/expediente';
import { NumeroExpediente } from '../dominio/numero-expediente';
import type {
  ExpedienteRegistrado,
  PresentacionExistente,
  ResultadoRegistro,
  UnidadDeTrabajoTramites,
} from '../dominio/puertos/unidad-de-trabajo-tramites';
import { aBytes, esUuid } from './comun-postgres';

type Transaccion = Prisma.TransactionClient;

/** Tiempo máximo de la transacción: unas pocas sentencias por solicitud. */
const TIEMPO_MAXIMO_MS = 15_000;

/** Un documento temporal desapareció entre la revisión y el registro: se revierte todo. */
class DocumentosNoDisponibles extends Error {}

const esCanal = (valor: string): valor is Canal => valor === 'EN_LINEA' || valor === 'MESA_PARTES';
const esRuta = (valor: string): valor is 'A' | 'B' | 'C' => ['A', 'B', 'C'].includes(valor);

interface FilaExpedienteRegistrado {
  readonly numero: string;
  readonly estado: string;
  readonly ruta: string;
  readonly codigo_receta: string;
  readonly canal: string;
  readonly presentado_en: Date;
  readonly vence_plazo_en: Date | null;
  readonly receta_al_presentar: Prisma.JsonValue;
}

const aRegistrado = (fila: FilaExpedienteRegistrado): ExpedienteRegistrado => {
  const ruta = fila.ruta.trim();
  if (!esRuta(ruta) || !esCanal(fila.canal)) {
    throw new Error(`Expediente ${fila.numero} con ruta o canal desconocido`);
  }
  const receta = fila.receta_al_presentar as { nombre?: unknown } | null;
  return {
    numero: fila.numero,
    estado: fila.estado,
    ruta,
    codigoReceta: fila.codigo_receta,
    nombreLicencia: typeof receta?.nombre === 'string' ? receta.nombre : fila.codigo_receta,
    canal: fila.canal,
    presentadoEn: fila.presentado_en,
    vencePlazoEn: fila.vence_plazo_en === null ? null : deFechaBase(fila.vence_plazo_en),
  };
};

/** ¿La violación de unicidad fue en este índice o columna? (P2002 de Prisma). */
const esUnicidad = (error: unknown, pista: string): boolean =>
  error instanceof Prisma.PrismaClientKnownRequestError &&
  error.code === 'P2002' &&
  JSON.stringify(error.meta ?? {}).includes(pista);

/**
 * Adaptador de la presentación atómica con una transacción de PostgreSQL (research §R-10 de la 004).
 * Cifra los datos personales con el protector compartido (FR-034); la consulta pública busca por la
 * huella del número de documento o del RUC, sin descifrar.
 */
export class UnidadDeTrabajoTramitesPostgres implements UnidadDeTrabajoTramites {
  constructor(
    private readonly prisma: PrismaServicio,
    private readonly protector: ProtectorDatos,
  ) {}

  async buscarPorClave(clave: string): Promise<PresentacionExistente | null> {
    if (!esUuid(clave)) {
      return null;
    }
    const fila = await this.prisma.clave_idempotencia.findUnique({
      where: { clave },
      include: { expediente: true },
    });
    return fila === null
      ? null
      : { huellaCuerpo: fila.huella_cuerpo, registrado: aRegistrado(fila.expediente) };
  }

  async registrar(solicitud: {
    armar: (numero: NumeroExpediente) => Expediente;
    anio: number;
    claveIdempotencia: string;
    huellaCuerpo: string;
  }): Promise<ResultadoRegistro> {
    try {
      const registrado = await this.prisma.$transaction(
        (tx) => this.registrarEnTransaccion(tx, solicitud),
        { timeout: TIEMPO_MAXIMO_MS },
      );
      return { tipo: 'CREADO', registrado };
    } catch (error) {
      if (error instanceof DocumentosNoDisponibles) {
        return { tipo: 'DOCUMENTOS_NO_DISPONIBLES' };
      }
      if (esUnicidad(error, 'verificacion')) {
        return { tipo: 'PERMISO_USADO' };
      }
      if (esUnicidad(error, 'clave')) {
        return { tipo: 'CLAVE_EXISTENTE' };
      }
      throw error;
    }
  }

  private async registrarEnTransaccion(
    tx: Transaccion,
    solicitud: {
      armar: (numero: NumeroExpediente) => Expediente;
      anio: number;
      claveIdempotencia: string;
      huellaCuerpo: string;
    },
  ): Promise<ExpedienteRegistrado> {
    const [{ correlativo }] = await tx.$queryRaw<[{ correlativo: bigint }]>`
      SELECT nextval('tramites.numero_expediente_seq') AS correlativo`;
    const expediente = solicitud.armar(NumeroExpediente.crear(solicitud.anio, Number(correlativo)));

    // Los documentos se bloquean antes de usarlos: dos solicitudes no pueden llevarse el mismo.
    const ids = expediente.documentos.map((documento) => documento.documentoId);
    const temporales =
      ids.length === 0
        ? []
        : await tx.$queryRaw<
            {
              id: string;
              clave_almacen: string;
              nombre_original: string;
              tipo_mime: string;
              tamano_bytes: number;
              sha256: string;
              subido_en: Date;
            }[]
          >`SELECT id, clave_almacen, nombre_original, tipo_mime, tamano_bytes, sha256, subido_en
              FROM tramites.documento_temporal
             WHERE id = ANY(${ids}::uuid[])
               FOR UPDATE`;
    if (temporales.length !== new Set(ids).size) {
      throw new DocumentosNoDisponibles();
    }

    const cifrar = (texto: string) => aBytes(this.protector.cifrar(texto));
    const huella = (texto: string) => aBytes(this.protector.hmac(texto));
    const { titular, establecimiento } = expediente;

    const fila = await tx.expediente.create({
      data: {
        numero: expediente.numero.valor,
        codigo_receta: expediente.receta.codigo,
        ruta: expediente.ruta,
        estado: expediente.estado,
        canal: expediente.canal,
        tipo_documento: titular.tipoDocumento,
        documento_cifrado: cifrar(titular.numeroDocumento),
        documento_hmac: huella(titular.numeroDocumento),
        ruc_cifrado: cifrar(titular.ruc),
        ruc_hmac: huella(titular.ruc),
        nombre_titular: titular.nombre,
        razon_social: titular.razonSocial,
        celular_cifrado: cifrar(titular.celular),
        correo_cifrado: titular.correo === null ? null : cifrar(titular.correo),
        representante_cifrado:
          expediente.representante === null
            ? null
            : cifrar(JSON.stringify(expediente.representante)),
        nombre_comercial: establecimiento.nombreComercial,
        giro: establecimiento.giro,
        direccion_cifrada: cifrar(establecimiento.direccion),
        zona: establecimiento.zona,
        area_m2:
          establecimiento.areaM2 === null
            ? null
            : new Prisma.Decimal(establecimiento.areaM2.toFixed(2)),
        presentado_en: expediente.presentadoEn,
        vence_plazo_en:
          expediente.vencePlazoEn === null ? null : comoFechaBase(expediente.vencePlazoEn),
        registrado_por: expediente.registradoPor,
        verificacion_id: expediente.verificacionId,
        receta_al_presentar: expediente.receta as unknown as Prisma.InputJsonObject,
        con_representante: expediente.representante !== null,
      },
    });

    const porId = new Map(temporales.map((temporal) => [temporal.id, temporal]));
    for (const documento of expediente.documentos) {
      const temporal = porId.get(documento.documentoId);
      if (temporal === undefined) {
        throw new DocumentosNoDisponibles();
      }
      await tx.documento.create({
        data: {
          expediente_id: fila.id,
          requisito_id: BigInt(documento.requisitoId),
          requisito_orden: documento.requisitoOrden,
          nombre_original: temporal.nombre_original,
          clave_almacen: temporal.clave_almacen,
          tipo_mime: temporal.tipo_mime,
          tamano_bytes: temporal.tamano_bytes,
          sha256: temporal.sha256,
          subido_en: temporal.subido_en,
        },
      });
    }
    if (ids.length > 0) {
      await tx.documento_temporal.deleteMany({ where: { id: { in: ids } } });
    }

    for (const registro of expediente.historial) {
      await tx.historial_estado.create({
        data: {
          expediente_id: fila.id,
          estado_anterior: registro.estadoAnterior,
          estado_nuevo: registro.estadoNuevo,
          usuario_id: registro.usuarioId,
          comentario: registro.comentario,
          ocurrido_en: registro.ocurridoEn,
        },
      });
    }
    await tx.auditoriaTramites.create({
      data: {
        usuario_id: expediente.registradoPor,
        accion: expediente.canal === 'EN_LINEA' ? 'PRESENTAR_EN_LINEA' : 'REGISTRAR_PRESENCIAL',
        numero_expediente: expediente.numero.valor,
        detalle: { canal: expediente.canal },
        ocurrido_en: expediente.presentadoEn,
      },
    });
    // Outbox (ADR-005): lo usará la funcionalidad de notificaciones (008). Sin datos personales.
    await tx.evento_pendiente.create({
      data: {
        tipo: 'SolicitudPresentada',
        datos: {
          numeroExpediente: expediente.numero.valor,
          codigoReceta: expediente.receta.codigo,
          ruta: expediente.ruta,
          canal: expediente.canal,
        },
      },
    });
    await tx.clave_idempotencia.create({
      data: {
        clave: solicitud.claveIdempotencia,
        huella_cuerpo: solicitud.huellaCuerpo,
        expediente_id: fila.id,
      },
    });

    return aRegistrado(fila);
  }
}
