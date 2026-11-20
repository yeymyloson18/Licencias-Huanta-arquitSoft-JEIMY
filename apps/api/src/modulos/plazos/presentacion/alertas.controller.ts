import { Controller, Get, HttpCode, Param, Post, Query, Res } from '@nestjs/common';
import { ErrorProblema } from '../../../compartido/presentacion/error-problema';
import { RequiereRoles, UsuarioActual, type UsuarioAutenticado } from '../../seguridad/fachada';
import {
  type AlertaParaJefatura,
  ConsultarAlertas,
  ErrorAlertaNoEncontrada,
  ErrorAlertaYaAtendida,
} from '../aplicacion/alertas';

interface RespuestaHttp {
  setHeader(nombre: string, valor: string): unknown;
}

/** Esquema `AlertaPlazo` del contrato. */
const aRespuesta = (alerta: AlertaParaJefatura) => ({
  id: alerta.id,
  numeroExpediente: alerta.numeroExpediente,
  venceEn: alerta.venceEn,
  diasHabilesRestantes: alerta.diasHabilesRestantes,
  ...(alerta.estadoExpediente === null ? {} : { estadoExpediente: alerta.estadoExpediente }),
  generadaEn: alerta.generadaEn.toISOString(),
  atendidaEn: alerta.atendidaEn?.toISOString() ?? null,
  atendidaPor: alerta.atendidaPor,
});

/** Alertas de plazos para la jefatura (historia 4 de la 006). */
@Controller('plazos/alertas')
export class AlertasController {
  constructor(private readonly alertas: ConsultarAlertas) {}

  @Get()
  @RequiereRoles('JEFATURA')
  async listar(
    @Query('pendientes') pendientes: string | undefined,
    @Res({ passthrough: true }) respuesta: RespuestaHttp,
  ) {
    respuesta.setHeader('Cache-Control', 'no-store');
    return (await this.alertas.listar(pendientes !== 'false')).map(aRespuesta);
  }

  @Post(':alertaId/atender')
  @HttpCode(200)
  @RequiereRoles('JEFATURA')
  async atender(
    @Param('alertaId') alertaId: string,
    @UsuarioActual() usuario: UsuarioAutenticado,
    @Res({ passthrough: true }) respuesta: RespuestaHttp,
  ) {
    respuesta.setHeader('Cache-Control', 'no-store');
    const id = /^[1-9][0-9]{0,15}$/.test(alertaId) ? Number(alertaId) : null;
    if (id === null) {
      throw ErrorProblema.noEncontrado();
    }
    try {
      return aRespuesta(await this.alertas.atender(id, usuario.usuarioId));
    } catch (error) {
      if (error instanceof ErrorAlertaNoEncontrada) {
        throw ErrorProblema.noEncontrado();
      }
      if (error instanceof ErrorAlertaYaAtendida) {
        throw ErrorProblema.alertaAtendida();
      }
      throw error;
    }
  }
}
