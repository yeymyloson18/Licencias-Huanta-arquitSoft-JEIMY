import { Controller, Get, Inject, Param, Res } from '@nestjs/common';
import { ErrorProblema } from '../../../compartido/presentacion/error-problema';
import { RequiereRoles } from '../../seguridad/fachada';
import { NumeroExpediente } from '../dominio/numero-expediente';
import type { LectorParaCaja } from '../dominio/puertos/lector-para-caja';

interface RespuestaHttp {
  setHeader(nombre: string, valor: string): unknown;
}

export const LECTOR_PARA_CAJA = Symbol('LECTOR_PARA_CAJA');

/**
 * `GET /expedientes/{numero}/titular` (`obtenerTitularParaCaja`): solo el nombre del titular, para que
 * el cajero confirme antes de registrar el pago (FR-020 de la 005). Sin documento ni dirección.
 */
@Controller('expedientes')
export class CajaController {
  constructor(@Inject(LECTOR_PARA_CAJA) private readonly lector: LectorParaCaja) {}

  @Get(':numeroExpediente/titular')
  @RequiereRoles('CAJA', 'JEFATURA')
  async titular(
    @Param('numeroExpediente') numeroEnRuta: string,
    @Res({ passthrough: true }) respuesta: RespuestaHttp,
  ) {
    respuesta.setHeader('Cache-Control', 'no-store');
    let numero: string;
    try {
      numero = NumeroExpediente.normalizar(numeroEnRuta).valor;
    } catch {
      throw ErrorProblema.noEncontrado();
    }
    const expediente = await this.lector.obtener(numero);
    if (expediente === null) {
      throw ErrorProblema.noEncontrado();
    }
    return {
      numeroExpediente: expediente.numero,
      nombreTitular: expediente.nombreTitular,
      razonSocial: expediente.razonSocial,
    };
  }
}
