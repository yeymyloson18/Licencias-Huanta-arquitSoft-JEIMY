import { Controller, Get, Query, Res } from '@nestjs/common';
import { z } from 'zod';
import { ErrorValidacion } from '../../../compartido/presentacion/filtro-problema';
import {
  aVista,
  ConsultarAuditoria,
  type EventoAuditoriaVista,
} from '../aplicacion/consultar-auditoria';
import { ObtenerPanel } from '../aplicacion/obtener-panel';
import { ACCIONES_AUDITORIA } from '../dominio/accion-auditoria';
import { ErrorFiltroAuditoria } from '../dominio/filtro-auditoria';
import { RequiereRoles } from './control-permisos';
import { validarCuerpo } from './validacion';

interface RespuestaHttp {
  setHeader(nombre: string, valor: string): unknown;
}

const esquemaAuditoria = z
  .object({
    desde: z.string().optional(),
    hasta: z.string().optional(),
    accion: z.enum(ACCIONES_AUDITORIA).optional(),
    actorId: z.uuid().optional(),
    afectadoId: z.uuid().optional(),
    pagina: z.coerce.number().int().min(1).default(1),
    porPagina: z.coerce.number().int().min(1).max(100).default(20),
    formato: z.enum(['json', 'csv']).default('json'),
  })
  .strict();

const MENSAJES: Readonly<Record<string, string>> = {
  desde:
    'Debe ser una fecha AAAA-MM-DD, no posterior a "hasta", y el rango no puede superar 366 días',
  hasta: 'Debe ser una fecha AAAA-MM-DD y el rango no puede superar 366 días',
  accion: 'Elija una acción de la lista',
  actorId: 'Elija un usuario de la lista',
  afectadoId: 'Elija un usuario de la lista',
  pagina: 'Debe ser un número mayor que 0',
  porPagina: 'Debe ser un número entre 1 y 100',
  formato: 'Elija json o csv',
};

/** Forma del contrato (`EventoAuditoriaSeguridad`): fechas en ISO y sin `detalle` ni origen. */
export const aEventoRespuesta = (evento: EventoAuditoriaVista) => ({
  id: evento.id,
  ocurridoEn: evento.ocurridoEn.toISOString(),
  accion: evento.accion,
  textoAccion: evento.textoAccion,
  actor: evento.actor,
  afectado: evento.afectado,
  objeto: evento.objeto,
  resultado: evento.resultado,
  // 010: medio, destino enmascarado, entrega y desenlace; nunca el código ni el intento.
  codigoEnviado: evento.codigoEnviado,
});

/**
 * Panel del administrador y auditoría de seguridad (009). Solo ADMINISTRADOR: el resto recibe 403 y
 * sin sesión 401 (FR-021). Los filtros usan identificadores internos, nunca datos personales.
 */
@Controller('admin')
@RequiereRoles('ADMINISTRADOR')
export class AdministradorController {
  constructor(
    private readonly consultarAuditoria: ConsultarAuditoria,
    private readonly obtenerPanel: ObtenerPanel,
  ) {}

  @Get('panel')
  async panel(@Res({ passthrough: true }) respuesta: RespuestaHttp) {
    respuesta.setHeader('Cache-Control', 'no-store');
    const panel = await this.obtenerPanel.ejecutar();
    return {
      ...panel,
      ultimosEventos: panel.ultimosEventos.map((fila) => aEventoRespuesta(aVista(fila))),
    };
  }

  @Get('auditoria')
  async auditoria(
    @Query() consulta: unknown,
    @Res({ passthrough: true }) respuesta: RespuestaHttp,
  ) {
    respuesta.setHeader('Cache-Control', 'no-store');
    const { pagina, porPagina, formato, ...filtro } = validarCuerpo(
      esquemaAuditoria,
      consulta,
      MENSAJES,
    );
    try {
      if (formato === 'json') {
        const resultado = await this.consultarAuditoria.pagina(filtro, pagina, porPagina);
        return { ...resultado, datos: resultado.datos.map(aEventoRespuesta) };
      }
      const descarga = await this.consultarAuditoria.csv(filtro);
      respuesta.setHeader('X-Auditoria-Truncada', String(descarga.truncado));
      respuesta.setHeader('Content-Type', 'text/csv; charset=utf-8');
      respuesta.setHeader(
        'Content-Disposition',
        `attachment; filename="${descarga.nombreArchivo}"`,
      );
      return descarga.contenido;
    } catch (error) {
      if (error instanceof ErrorFiltroAuditoria) {
        throw new ErrorValidacion(
          error.campos.map((campo) => ({ campo, mensaje: MENSAJES[campo] ?? 'Valor no válido' })),
        );
      }
      throw error;
    }
  }
}
