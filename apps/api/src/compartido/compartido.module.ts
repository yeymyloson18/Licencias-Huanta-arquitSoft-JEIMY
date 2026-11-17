import { Global, Module } from '@nestjs/common';
import { CONFIGURACION, cargarConfiguracion } from './infraestructura/configuracion';
import { PrismaServicio } from './infraestructura/prisma.servicio';
import { CierreRedis, proveedorRedis, REDIS_CLIENTE } from './infraestructura/redis.proveedor';

@Global()
@Module({
  providers: [
    { provide: CONFIGURACION, useFactory: () => cargarConfiguracion(process.env) },
    PrismaServicio,
    proveedorRedis,
    CierreRedis,
  ],
  exports: [CONFIGURACION, PrismaServicio, REDIS_CLIENTE],
})
export class CompartidoModule {}
