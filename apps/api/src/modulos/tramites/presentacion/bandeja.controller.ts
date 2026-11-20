import { Controller, Get, Param, Query, Res, StreamableFile } from '@nestjs/common';
import { z } from 'zod';
import { ErrorValidacion } from '../../../compartido/presentacion/filtro-problema';
import { RequiereRoles, UsuarioActual, type UsuarioAutenticado } from '../../seguridad/fachada';
import {
  DescargarDocumento,
  type DetalleParaPersonal,
  ListarExpedientes,
  ObtenerDetalleExpediente,
  POR_PAGINA_MAXIMO,
} from '../aplicacion/bandeja-expedientes';
import { LicenciasDelGrupo } from '../aplicacion/licencias-del-grupo';
import { limpiarNombreArchivo } from '../aplicacion/subir-documento';
import { ESTADOS_EXPEDIENTE } from '../dominio/estado-publico';
import type { LicenciaParaEvaluacion } from '../dominio/puertos/catalogo-evaluacion';
import type { ExpedienteResumen } from '../dominio/puertos/repositorio-expedientes';
import { validarConEsquema } from './esquemas-tramites';
import { traducirErrorTramites } from './traducir-errores';

interface RespuestaHttp {
  setHeader(nombre: string, valor: string): unknown;
}

const entero = (nombre: string, minimo: number, maximo: number, porDefecto: number) =>
  z
    .string()
    .regex(/^[0-9]+$/, `${nombre} debe ser un número entero`)
    .transform(Number)
    .pipe(
      z
        .number()
        .int()
        .min(minimo, `Mínimo ${String(minimo)}`)
        .max(maximo, `Máximo ${String(maximo)}`),
    )
    .optional()
    .transform((valor) => valor ?? porDefecto);

const esquemaFiltros = z.object({
  estado: z.enum(ESTADOS_EXPEDIENTE, 'No es un estado de expediente').optional(),
  ruta: z.enum(['A', 'B', 'C'], 'Debe ser A, B o C').optional(),
  pagina: entero('pagina', 1, 1_000_000, 1),
  porPagina: entero('porPagina', 1, POR_PAGINA_MAXIMO, 20),
});

/** `vence_plazo_en` es una fecha sin hora en el contrato. */
const aFecha = (fecha: Date | null) => (fecha === null ? null : fecha.toISOString().slice(0, 10));

/** Esquema `ExpedienteResumen` (+ `nombreLicencia`, que el contrato admite). */
const aResumen = (fila: ExpedienteResumen) => ({
  numero: fila.numero,
  estado: fila.estado,
  ruta: fila.ruta,
  codigoReceta: fila.codigoReceta,
  nombreLicencia: fila.nombreLicencia,
  nombreTitular: fila.nombreTitular,
  giro: fila.giro,
  presentadoEn: fila.presentadoEn.toISOString(),
  vencePlazoEn: aFecha(fila.vencePlazoEn),
  diasHabilesRestantes: null,
});

/**
 * Esquema `Expediente`. Lo que llega en funcionalidades posteriores va en `null` o vacío.
 * `licenciasDelGrupo` (005): las licencias vigentes a las que el evaluador puede corregir el riesgo.
 */
export const aDetalle = (
  detalle: DetalleParaPersonal,
  licenciasDelGrupo: readonly LicenciaParaEvaluacion[] = [],
) => ({
  ...aResumen(detalle),
  version: detalle.version,
  canal: detalle.canal,
  nivelRiesgoPropuesto: detalle.nivelRiesgoPropuesto,
  nivelRiesgoConfirmado: detalle.nivelRiesgoConfirmado,
  documentoTitularEnmascarado: detalle.documentoTitularEnmascarado,
  razonSocial: detalle.razonSocial,
  nombreComercial: detalle.nombreComercial,
  direccion: detalle.direccion,
  zona: detalle.zona,
  areaM2: detalle.areaM2,
  codigoEsquela: null,
  numeroLicencia: null,
  documentos: detalle.documentos,
  observaciones: detalle.observaciones.map((observacion) => ({
    descripcion: observacion.descripcion,
    plazoSubsanarEn: aFecha(observacion.plazoSubsanarEn),
    subsanadaEn: observacion.subsanadaEn?.toISOString() ?? null,
  })),
  licenciasDelGrupo: licenciasDelGrupo.map((licencia) => ({
    codigoReceta: licencia.codigo,
    nombre: licencia.nombre,
    tasa: licencia.tasa,
    ruta: licencia.ruta,
  })),
  historial: detalle.historial.map((registro) => ({
    ...registro,
    ocurridoEn: registro.ocurridoEn.toISOString(),
  })),
});

/** `Content-Disposition` seguro: nombre ASCII de respaldo y el nombre real en UTF-8 (RFC 6266). */
const disposicion = (nombre: string): string => {
  const limpio = limpiarNombreArchivo(nombre);
  const ascii = limpio.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(limpio)}`;
};

const ROLES_BANDEJA = ['MESA_PARTES', 'EVALUADOR', 'JEFATURA'] as const;

/**
 * Bandeja del personal (historia 4 de la 004, contracts/consulta-y-bandeja.md): lista, detalle y
 * descarga de documentos para MESA_PARTES, EVALUADOR y JEFATURA. Sin caché en ninguna respuesta.
 */
@Controller('expedientes')
export class BandejaController {
  constructor(
    private readonly listarExpedientes: ListarExpedientes,
    private readonly obtenerDetalle: ObtenerDetalleExpediente,
    private readonly licenciasDelGrupo: LicenciasDelGrupo,
    private readonly descargarDocumento: DescargarDocumento,
  ) {}

  @Get()
  @RequiereRoles(...ROLES_BANDEJA)
  async listar(
    @Query() consulta: Record<string, unknown>,
    @Res({ passthrough: true }) respuesta: RespuestaHttp,
  ) {
    respuesta.setHeader('Cache-Control', 'no-store');
    const pendientes = ['asignadosAMi', 'vencenAntesDe'].filter((nombre) => nombre in consulta);
    if (pendientes.length > 0) {
      // Para que nadie crea que filtran: llegan en la 006 y la 008.
      throw new ErrorValidacion(
        pendientes.map((campo) => ({ campo, mensaje: 'Este filtro todavía no está disponible' })),
      );
    }
    const filtros = validarConEsquema(esquemaFiltros, consulta);
    try {
      const pagina = await this.listarExpedientes.ejecutar({
        estado: filtros.estado ?? null,
        ruta: filtros.ruta ?? null,
        pagina: filtros.pagina,
        porPagina: filtros.porPagina,
      });
      return {
        pagina: pagina.pagina,
        porPagina: pagina.porPagina,
        total: pagina.total,
        datos: pagina.datos.map(aResumen),
      };
    } catch (error) {
      throw traducirErrorTramites(error);
    }
  }

  @Get(':numeroExpediente')
  @RequiereRoles(...ROLES_BANDEJA)
  async detalle(
    @Param('numeroExpediente') numero: string,
    @UsuarioActual() usuario: UsuarioAutenticado,
    @Res({ passthrough: true }) respuesta: RespuestaHttp,
  ) {
    respuesta.setHeader('Cache-Control', 'no-store');
    try {
      const detalle = await this.obtenerDetalle.ejecutar({ numero, usuarioId: usuario.usuarioId });
      return aDetalle(detalle, await this.licenciasDelGrupo.ejecutar(detalle));
    } catch (error) {
      throw traducirErrorTramites(error);
    }
  }

  @Get(':numeroExpediente/documentos/:documentoId')
  @RequiereRoles(...ROLES_BANDEJA)
  async descargar(
    @Param('numeroExpediente') numero: string,
    @Param('documentoId') documentoId: string,
    @Res({ passthrough: true }) respuesta: RespuestaHttp,
  ): Promise<StreamableFile> {
    let archivo;
    try {
      archivo = await this.descargarDocumento.ejecutar({ numero, documentoId });
    } catch (error) {
      throw traducirErrorTramites(error);
    }
    respuesta.setHeader('Cache-Control', 'no-store');
    respuesta.setHeader('X-Content-Type-Options', 'nosniff');
    return new StreamableFile(Buffer.from(archivo.contenido), {
      type: archivo.tipoMime,
      disposition: disposicion(archivo.nombreOriginal),
      length: archivo.contenido.byteLength,
    });
  }
}
