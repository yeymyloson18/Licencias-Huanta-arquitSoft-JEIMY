import { Controller, Get, Param, Res } from '@nestjs/common';
import { ErrorProblema } from '../../../compartido/presentacion/error-problema';
import { RequiereRoles } from '../../seguridad/fachada';
import { ConsultarAuditoriaExpediente } from '../aplicacion/consultar-auditoria-expediente';
import { traducirErrorTramites } from './traducir-errores';

interface RespuestaHttp {
  setHeader(nombre: string, valor: string): unknown;
}

const PATRON_NUMERO = /^EXP-[0-9]{4}-[0-9]{6}$/;

/** Auditoría de las decisiones sobre un expediente (historia 6 de la 005, rol JEFATURA). */
@Controller('expedientes')
export class AuditoriaController {
  constructor(private readonly consultarAuditoria: ConsultarAuditoriaExpediente) {}

  @Get(':numeroExpediente/auditoria')
  @RequiereRoles('JEFATURA')
  async auditoria(
    @Param('numeroExpediente') numeroExpediente: string,
    @Res({ passthrough: true }) respuesta: RespuestaHttp,
  ) {
    respuesta.setHeader('Cache-Control', 'no-store');
    const numero = numeroExpediente.trim().toUpperCase();
    if (!PATRON_NUMERO.test(numero)) {
      throw ErrorProblema.noEncontrado();
    }
    try {
      const registros = await this.consultarAuditoria.ejecutar(numero);
      return registros.map((registro) => ({
        usuarioId: registro.usuarioId,
        nombreUsuario: registro.nombreUsuario,
        accion: registro.accion,
        referencia: registro.referencia,
        detalle: registro.detalle,
        ocurridoEn: registro.ocurridoEn.toISOString(),
      }));
    } catch (error) {
      throw traducirErrorTramites(error);
    }
  }
}
