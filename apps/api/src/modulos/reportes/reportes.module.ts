import { Logger, Module } from '@nestjs/common';
import type Redis from 'ioredis';
import { REDIS_CLIENTE } from '../../compartido/infraestructura/redis.proveedor';
import { FachadaCatalogo } from '../catalogo/fachada';
import { FachadaLicencias } from '../licencias/fachada';
import { FachadaPagos } from '../pagos/fachada';
import { FachadaPlazos } from '../plazos/fachada';
import { FachadaTramites } from '../tramites/fachada';
import { ObtenerTablero } from './aplicacion/obtener-tablero';
import { ReporteLicencias } from './aplicacion/reporte-licencias';
import type { CacheReportes } from './dominio/puertos';
import {
  CacheReportesRedis,
  FuenteCatalogoFachada,
  FuenteFeriadosFachada,
  FuenteLicenciasFachada,
  FuentePagosFachada,
  FuenteTramitesFachada,
} from './infraestructura/fuentes-fachadas';
import { ReportesController } from './presentacion/reportes.controller';

// Raíz de composición del módulo Reportes (007): tablero de la jefatura y reporte de licencias. Lee
// los datos solo por las fachadas de los otros módulos (principio I).

const reloj = { ahora: () => new Date() };
const CACHE_REPORTES = Symbol('CACHE_REPORTES');
const logger = new Logger('Reportes');
const avisar = (mensaje: string): void => {
  logger.warn(mensaje);
};

@Module({
  controllers: [ReportesController],
  providers: [
    {
      provide: CACHE_REPORTES,
      inject: [REDIS_CLIENTE],
      useFactory: (redis: Redis): CacheReportes => new CacheReportesRedis(redis),
    },
    {
      provide: ObtenerTablero,
      inject: [CACHE_REPORTES, FachadaTramites, FachadaPagos, FachadaCatalogo, FachadaPlazos],
      useFactory: (
        cache: CacheReportes,
        tramites: FachadaTramites,
        pagos: FachadaPagos,
        catalogo: FachadaCatalogo,
        plazos: FachadaPlazos,
      ) =>
        new ObtenerTablero({
          tramites: new FuenteTramitesFachada(tramites),
          pagos: new FuentePagosFachada(pagos),
          catalogo: new FuenteCatalogoFachada(catalogo),
          feriados: new FuenteFeriadosFachada(plazos),
          cache,
          reloj,
          avisar,
        }),
    },
    {
      provide: ReporteLicencias,
      inject: [CACHE_REPORTES, FachadaTramites, FachadaLicencias],
      useFactory: (cache: CacheReportes, tramites: FachadaTramites, licencias: FachadaLicencias) =>
        new ReporteLicencias({
          tramites: new FuenteTramitesFachada(tramites),
          licencias: new FuenteLicenciasFachada(licencias),
          cache,
          avisar,
        }),
    },
  ],
})
export class ReportesModule {}
