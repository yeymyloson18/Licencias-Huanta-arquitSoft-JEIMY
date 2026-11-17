import { Controller, Get, Res } from '@nestjs/common';
import type { components } from '@licencias/contracts';
import { ConsultarSalud } from '../aplicacion/consultar-salud';
import { codigoHttpPara } from './codigo-http';

type Salud = components['schemas']['Salud'];

interface RespuestaHttp {
  status(codigo: number): unknown;
  setHeader(nombre: string, valor: string): unknown;
}

/** GET /api/v1/salud: público, sin caché (contracts/salud.md). */
@Controller()
export class SaludController {
  constructor(private readonly consultarSalud: ConsultarSalud) {}

  @Get('salud')
  async salud(@Res({ passthrough: true }) respuesta: RespuestaHttp): Promise<Salud> {
    const salud = await this.consultarSalud.ejecutar();

    respuesta.setHeader('Cache-Control', 'no-store');
    respuesta.status(codigoHttpPara(salud.estado));

    return {
      estado: salud.estado,
      baseDeDatos: salud.baseDeDatos,
      cache: salud.cache,
      version: salud.version,
    };
  }
}
