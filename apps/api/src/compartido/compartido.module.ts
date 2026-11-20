import { Global, Module } from '@nestjs/common';
import type { ProtectorDatos } from './dominio/protector-datos';
import {
  CONFIGURACION,
  cargarConfiguracion,
  type Configuracion,
} from './infraestructura/configuracion';
import { PrismaServicio } from './infraestructura/prisma.servicio';
import { PROTECTOR_DATOS, ProtectorDatosAesGcm } from './infraestructura/protector-datos-aes-gcm';
import { CierreRedis, proveedorRedis, REDIS_CLIENTE } from './infraestructura/redis.proveedor';

@Global()
@Module({
  providers: [
    { provide: CONFIGURACION, useFactory: () => cargarConfiguracion(process.env) },
    PrismaServicio,
    proveedorRedis,
    CierreRedis,
    // Cifrado de datos personales compartido por seguridad y trámites (research §R-06 de la 004).
    {
      provide: PROTECTOR_DATOS,
      inject: [CONFIGURACION],
      useFactory: (configuracion: Configuracion): ProtectorDatos =>
        new ProtectorDatosAesGcm(configuracion.claveCifradoDatos, configuracion.claveHmacDatos),
    },
  ],
  exports: [CONFIGURACION, PrismaServicio, REDIS_CLIENTE, PROTECTOR_DATOS],
})
export class CompartidoModule {}
