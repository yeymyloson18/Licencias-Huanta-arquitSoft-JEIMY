import type { ProtectorDatos } from '../../../compartido/dominio/protector-datos';
import type { PrismaServicio } from '../../../compartido/infraestructura/prisma.servicio';
import { esEstadoExpediente, type EstadoExpediente } from '../dominio/estado-publico';
import type { NumeroExpediente } from '../dominio/numero-expediente';
import type {
  DocumentoGuardado,
  ExpedienteConsultado,
  ExpedienteDetalle,
  ExpedienteResumen,
  FiltroBandeja,
  NivelRiesgo,
  PaginaExpedientes,
  RepositorioExpedientes,
} from '../dominio/puertos/repositorio-expedientes';
import { aBytes, esUuid } from './comun-postgres';

const comoEstado = (valor: string): EstadoExpediente => {
  if (!esEstadoExpediente(valor)) {
    throw new Error('Estado de expediente desconocido en la base');
  }
  return valor;
};

const comoRuta = (valor: string): 'A' | 'B' | 'C' => {
  const ruta = valor.trim();
  if (ruta !== 'A' && ruta !== 'B' && ruta !== 'C') {
    throw new Error('Ruta de expediente desconocida en la base');
  }
  return ruta;
};

const nombreDeReceta = (receta: unknown, codigo: string): string => {
  const nombre = (receta as { nombre?: unknown } | null)?.nombre;
  return typeof nombre === 'string' ? nombre : codigo;
};

const comoNivel = (valor: string | null): NivelRiesgo | null =>
  valor === 'BAJO' || valor === 'MEDIO' || valor === 'ALTO' || valor === 'MUY_ALTO' ? valor : null;

const comoCanal = (valor: string): 'EN_LINEA' | 'MESA_PARTES' => {
  if (valor !== 'EN_LINEA' && valor !== 'MESA_PARTES') {
    throw new Error('Canal de expediente desconocido en la base');
  }
  return valor;
};

/** Columnas de la fila de la bandeja (sin datos cifrados). */
const COLUMNAS_RESUMEN = {
  numero: true,
  estado: true,
  ruta: true,
  codigo_receta: true,
  receta_al_presentar: true,
  nombre_titular: true,
  giro: true,
  presentado_en: true,
  vence_plazo_en: true,
} as const;

interface FilaResumen {
  readonly numero: string;
  readonly estado: string;
  readonly ruta: string;
  readonly codigo_receta: string;
  readonly receta_al_presentar: unknown;
  readonly nombre_titular: string;
  readonly giro: string;
  readonly presentado_en: Date;
  readonly vence_plazo_en: Date | null;
}

const aResumen = (fila: FilaResumen): ExpedienteResumen => ({
  numero: fila.numero,
  estado: comoEstado(fila.estado),
  ruta: comoRuta(fila.ruta),
  codigoReceta: fila.codigo_receta,
  nombreLicencia: nombreDeReceta(fila.receta_al_presentar, fila.codigo_receta),
  nombreTitular: fila.nombre_titular,
  giro: fila.giro,
  presentadoEn: fila.presentado_en,
  vencePlazoEn: fila.vence_plazo_en,
});

/**
 * Lecturas de expedientes en PostgreSQL. La consulta pública busca por número y por la huella del
 * documento o del RUC del titular (research §R-12): el documento en claro nunca llega a la base.
 */
export class RepositorioExpedientesPostgres implements RepositorioExpedientes {
  constructor(
    private readonly prisma: PrismaServicio,
    private readonly protector: ProtectorDatos,
  ) {}

  async buscarParaConsulta(
    numero: NumeroExpediente,
    documento: string,
  ): Promise<ExpedienteConsultado | null> {
    const huella = aBytes(this.protector.hmac(documento));
    const fila = await this.prisma.expediente.findFirst({
      where: { numero: numero.valor, OR: [{ documento_hmac: huella }, { ruc_hmac: huella }] },
      select: {
        numero: true,
        estado: true,
        ruta: true,
        codigo_receta: true,
        presentado_en: true,
        vence_plazo_en: true,
        receta_al_presentar: true,
        historial_estado: {
          select: { estado_nuevo: true, ocurrido_en: true },
          orderBy: { ocurrido_en: 'asc' },
        },
        observacion: {
          where: { subsanada_en: null },
          select: { descripcion: true },
          orderBy: { creada_en: 'asc' },
        },
      },
    });
    if (fila === null) {
      return null;
    }
    const receta = fila.receta_al_presentar as {
      nombre?: unknown;
      requisitos?: readonly { id?: unknown; descripcion?: unknown }[];
    } | null;
    return {
      observacionesPendientes: fila.observacion.map((observacion) => observacion.descripcion),
      requisitos: (receta?.requisitos ?? []).flatMap((requisito) =>
        typeof requisito.id === 'number' && typeof requisito.descripcion === 'string'
          ? [{ id: requisito.id, descripcion: requisito.descripcion }]
          : [],
      ),
      numero: fila.numero,
      estado: comoEstado(fila.estado),
      ruta: comoRuta(fila.ruta),
      nombreLicencia: typeof receta?.nombre === 'string' ? receta.nombre : fila.codigo_receta,
      presentadoEn: fila.presentado_en,
      vencePlazoEn: fila.vence_plazo_en,
      historial: fila.historial_estado.map((registro) => ({
        estado: comoEstado(registro.estado_nuevo),
        ocurridoEn: registro.ocurrido_en,
      })),
    };
  }

  async listar(filtro: FiltroBandeja): Promise<PaginaExpedientes> {
    // Índice ix_expediente_estado (estado, vence_plazo_en); orden por fecha de presentación.
    const donde = {
      ...(filtro.estado === null ? {} : { estado: filtro.estado }),
      ...(filtro.ruta === null ? {} : { ruta: filtro.ruta }),
    };
    const [total, filas] = await this.prisma.$transaction([
      this.prisma.expediente.count({ where: donde }),
      this.prisma.expediente.findMany({
        where: donde,
        select: COLUMNAS_RESUMEN,
        orderBy: [{ presentado_en: 'desc' }, { numero: 'desc' }],
        skip: (filtro.pagina - 1) * filtro.porPagina,
        take: filtro.porPagina,
      }),
    ]);
    return { total, datos: filas.map(aResumen) };
  }

  async obtenerDetalle(
    numero: NumeroExpediente,
    lector: { readonly usuarioId: string; readonly en: Date } | null,
  ): Promise<ExpedienteDetalle | null> {
    return this.prisma.$transaction(async (tx) => {
      const fila = await tx.expediente.findUnique({
        where: { numero: numero.valor },
        select: {
          ...COLUMNAS_RESUMEN,
          version: true,
          canal: true,
          documento_cifrado: true,
          razon_social: true,
          nombre_comercial: true,
          direccion_cifrada: true,
          zona: true,
          area_m2: true,
          nivel_riesgo_propuesto: true,
          nivel_riesgo_confirmado: true,
          observacion: {
            select: { descripcion: true, plazo_subsanar_en: true, subsanada_en: true },
            orderBy: { creada_en: 'asc' },
          },
          documento: {
            select: { id: true, requisito_id: true, nombre_original: true, tipo_mime: true },
            orderBy: [{ requisito_orden: 'asc' }, { subido_en: 'asc' }],
          },
          historial_estado: {
            select: {
              estado_anterior: true,
              estado_nuevo: true,
              comentario: true,
              ocurrido_en: true,
            },
            orderBy: { ocurrido_en: 'asc' },
          },
        },
      });
      if (fila === null) {
        return null;
      }
      // Quién vio el detalle y cuándo (FR-036), en la misma transacción que la lectura.
      if (lector !== null) {
        await tx.auditoriaTramites.create({
          data: {
            usuario_id: lector.usuarioId,
            accion: 'VER_DETALLE',
            numero_expediente: fila.numero,
            ocurrido_en: lector.en,
          },
        });
      }
      return {
        ...aResumen(fila),
        version: fila.version,
        canal: comoCanal(fila.canal),
        documentoTitular: this.protector.descifrar(fila.documento_cifrado),
        razonSocial: fila.razon_social,
        nombreComercial: fila.nombre_comercial,
        direccion: this.protector.descifrar(fila.direccion_cifrada),
        zona: fila.zona,
        areaM2: fila.area_m2 === null ? null : Number(fila.area_m2),
        nivelRiesgoPropuesto: comoNivel(fila.nivel_riesgo_propuesto),
        nivelRiesgoConfirmado: comoNivel(fila.nivel_riesgo_confirmado),
        observaciones: fila.observacion.map((observacion) => ({
          descripcion: observacion.descripcion,
          plazoSubsanarEn: observacion.plazo_subsanar_en,
          subsanadaEn: observacion.subsanada_en,
        })),
        documentos: fila.documento.map((documento) => ({
          id: documento.id,
          requisitoId: Number(documento.requisito_id),
          nombreOriginal: documento.nombre_original,
          tipoMime: documento.tipo_mime,
        })),
        historial: fila.historial_estado.map((registro) => ({
          estadoAnterior: registro.estado_anterior,
          estadoNuevo: registro.estado_nuevo,
          comentario: registro.comentario,
          ocurridoEn: registro.ocurrido_en,
        })),
      };
    });
  }

  async buscarDocumento(
    numero: NumeroExpediente,
    documentoId: string,
  ): Promise<DocumentoGuardado | null> {
    if (!esUuid(documentoId)) {
      return null;
    }
    const fila = await this.prisma.documento.findFirst({
      where: { id: documentoId, expediente: { numero: numero.valor } },
      select: { clave_almacen: true, nombre_original: true, tipo_mime: true },
    });
    return fila === null
      ? null
      : {
          claveAlmacen: fila.clave_almacen,
          nombreOriginal: fila.nombre_original,
          tipoMime: fila.tipo_mime,
        };
  }
}
