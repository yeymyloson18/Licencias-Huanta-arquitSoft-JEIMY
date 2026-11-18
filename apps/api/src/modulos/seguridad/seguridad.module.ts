import { Global, Module } from '@nestjs/common';
import { CONFIGURACION, type Configuracion } from '../../compartido/infraestructura/configuracion';
import { PrismaServicio } from '../../compartido/infraestructura/prisma.servicio';
import type { ProtectorDatos } from './dominio/puertos/protector-datos';
import { EmisorTokensJwt } from './infraestructura/emisor-tokens-jwt';
import { GeneradorSecretosCrypto } from './infraestructura/generador-secretos-crypto';
import { HasherClavesArgon2 } from './infraestructura/hasher-claves-argon2';
import { ProtectorDatosAesGcm } from './infraestructura/protector-datos-aes-gcm';
import { RegistroEventosSeguridadLogger } from './infraestructura/registro-eventos-seguridad-logger';
import { RelojSistema } from './infraestructura/reloj-sistema';
import { RepositorioUsuariosPostgres } from './infraestructura/repositorio-usuarios-postgres';
import { JwtAuthGuard } from './presentacion/jwt-auth.guard';
import {
  EMISOR_TOKENS,
  GENERADOR_SECRETOS,
  HASHER_CLAVES,
  PROTECTOR_DATOS,
  REGISTRO_EVENTOS_SEGURIDAD,
  RELOJ,
  REPOSITORIO_USUARIOS,
} from './tokens';

// Raíz de composición del módulo Seguridad: conecta los puertos del dominio con sus adaptadores.
// Es global para que los guards que exporta la fachada resuelvan sus dependencias en cualquier
// módulo sin que este importe el interior de `seguridad` (contracts/control-permisos.md).
@Global()
@Module({
  providers: [
    {
      provide: PROTECTOR_DATOS,
      inject: [CONFIGURACION],
      useFactory: (configuracion: Configuracion): ProtectorDatos =>
        new ProtectorDatosAesGcm(configuracion.claveCifradoDatos, configuracion.claveHmacDatos),
    },
    { provide: HASHER_CLAVES, useFactory: () => new HasherClavesArgon2() },
    {
      provide: GENERADOR_SECRETOS,
      inject: [CONFIGURACION],
      useFactory: (configuracion: Configuracion) =>
        new GeneradorSecretosCrypto(configuracion.claveHmacDatos),
    },
    {
      provide: EMISOR_TOKENS,
      inject: [CONFIGURACION],
      useFactory: (configuracion: Configuracion) => new EmisorTokensJwt(configuracion.jwtSecreto),
    },
    { provide: RELOJ, useFactory: () => new RelojSistema() },
    { provide: REGISTRO_EVENTOS_SEGURIDAD, useFactory: () => new RegistroEventosSeguridadLogger() },
    {
      provide: REPOSITORIO_USUARIOS,
      inject: [PrismaServicio, PROTECTOR_DATOS],
      useFactory: (prisma: PrismaServicio, protector: ProtectorDatos) =>
        new RepositorioUsuariosPostgres(prisma, protector),
    },
    JwtAuthGuard,
  ],
  exports: [EMISOR_TOKENS, JwtAuthGuard],
})
export class SeguridadModule {}
