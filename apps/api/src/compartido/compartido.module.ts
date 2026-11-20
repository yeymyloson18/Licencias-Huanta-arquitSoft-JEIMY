import { Global, Module } from '@nestjs/common';
import type { AlmacenArchivos } from './dominio/almacen-archivos';
import type { ProtectorDatos } from './dominio/protector-datos';
import { ALMACEN_ARCHIVOS, AlmacenArchivosDisco } from './infraestructura/almacen-archivos-disco';
import {
  CONFIGURACION,
  cargarConfiguracion,
  type Configuracion,
} from './infraestructura/configuracion';
import { DespachadorEventos } from './infraestructura/despachador-eventos';
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
    // Almacén de archivos: documentos (004) y fotos de las inspecciones (006).
    {
      provide: ALMACEN_ARCHIVOS,
      inject: [CONFIGURACION],
      useFactory: (configuracion: Configuracion): Promise<AlmacenArchivos> =>
        AlmacenArchivosDisco.crear(configuracion.almacenArchivosRuta),
    },
    // Cola de eventos entre módulos (research §R-02 de la 005).
    {
      provide: DespachadorEventos,
      inject: [PrismaServicio, CONFIGURACION],
      useFactory: (prisma: PrismaServicio, configuracion: Configuracion) =>
        new DespachadorEventos(prisma, configuracion.despachadorIntervaloMs),
    },
  ],
  exports: [
    CONFIGURACION,
    PrismaServicio,
    REDIS_CLIENTE,
    PROTECTOR_DATOS,
    DespachadorEventos,
    ALMACEN_ARCHIVOS,
  ],
})
export class CompartidoModule {}
