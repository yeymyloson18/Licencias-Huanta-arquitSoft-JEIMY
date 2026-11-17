import { Module } from '@nestjs/common';
import type Redis from 'ioredis';
import { CONFIGURACION, type Configuracion } from '../../compartido/infraestructura/configuracion';
import { PrismaServicio } from '../../compartido/infraestructura/prisma.servicio';
import { REDIS_CLIENTE } from '../../compartido/infraestructura/redis.proveedor';
import { ConsultarSalud } from './aplicacion/consultar-salud';
import type { SondaDependencia } from './dominio/sonda-dependencia';
import { SondaPostgres } from './infraestructura/sonda-postgres';
import { SondaRedis } from './infraestructura/sonda-redis';
import { SaludController } from './presentacion/salud.controller';

// Raíz de composición del chequeo de salud: conecta los puertos con sus adaptadores, para que
// `dominio` y `aplicacion` no dependan de NestJS (research.md §R-02).
export const SONDA_BASE_DE_DATOS = Symbol('SONDA_BASE_DE_DATOS');
export const SONDA_CACHE = Symbol('SONDA_CACHE');

@Module({
  controllers: [SaludController],
  providers: [
    {
      provide: SONDA_BASE_DE_DATOS,
      inject: [PrismaServicio],
      useFactory: (prisma: PrismaServicio): SondaDependencia => new SondaPostgres(prisma),
    },
    {
      provide: SONDA_CACHE,
      inject: [REDIS_CLIENTE],
      useFactory: (redis: Redis): SondaDependencia => new SondaRedis(redis),
    },
    {
      provide: ConsultarSalud,
      inject: [SONDA_BASE_DE_DATOS, SONDA_CACHE, CONFIGURACION],
      useFactory: (
        sondaBaseDeDatos: SondaDependencia,
        sondaCache: SondaDependencia,
        configuracion: Configuracion,
      ) =>
        new ConsultarSalud(
          sondaBaseDeDatos,
          sondaCache,
          configuracion.saludTimeoutMs,
          configuracion.versionServicio,
        ),
    },
  ],
})
export class SaludModule {}
