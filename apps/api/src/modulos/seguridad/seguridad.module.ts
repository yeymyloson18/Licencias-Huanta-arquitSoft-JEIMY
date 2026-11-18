import { Global, Module } from '@nestjs/common';
import type Redis from 'ioredis';
import { CONFIGURACION, type Configuracion } from '../../compartido/infraestructura/configuracion';
import { PrismaServicio } from '../../compartido/infraestructura/prisma.servicio';
import { REDIS_CLIENTE } from '../../compartido/infraestructura/redis.proveedor';
import { CambiarClave } from './aplicacion/cambiar-clave';
import { CerrarSesion } from './aplicacion/cerrar-sesion';
import { IniciarSesion } from './aplicacion/iniciar-sesion';
import { RenovarSesion } from './aplicacion/renovar-sesion';
import { VerificarOtp } from './aplicacion/verificar-otp';
import type { AlmacenVersionSeguridad } from './dominio/puertos/almacen-version-seguridad';
import type { EmisorTokens } from './dominio/puertos/emisor-tokens';
import type { EnviadorOTP } from './dominio/puertos/enviador-otp';
import type { GeneradorSecretos } from './dominio/puertos/generador-secretos';
import type { HasherClaves } from './dominio/puertos/hasher-claves';
import type { ProtectorDatos } from './dominio/puertos/protector-datos';
import type { RegistroEventosSeguridad } from './dominio/puertos/registro-eventos-seguridad';
import type { Reloj } from './dominio/puertos/reloj';
import type { RepositorioCodigosOtp } from './dominio/puertos/repositorio-codigos-otp';
import type { RepositorioSesiones } from './dominio/puertos/repositorio-sesiones';
import type { RepositorioUsuarios } from './dominio/puertos/repositorio-usuarios';
import { AlmacenVersionSeguridadEnMemoria } from './infraestructura/almacen-version-seguridad-en-memoria';
import { EmisorTokensJwt } from './infraestructura/emisor-tokens-jwt';
import { EnviadorOtpSimulado } from './infraestructura/enviador-otp-simulado';
import { GeneradorSecretosCrypto } from './infraestructura/generador-secretos-crypto';
import { HasherClavesArgon2 } from './infraestructura/hasher-claves-argon2';
import { ProtectorDatosAesGcm } from './infraestructura/protector-datos-aes-gcm';
import { RegistroEventosSeguridadLogger } from './infraestructura/registro-eventos-seguridad-logger';
import { RelojSistema } from './infraestructura/reloj-sistema';
import { RepositorioCodigosOtpPostgres } from './infraestructura/repositorio-codigos-otp-postgres';
import { RepositorioSesionesPostgres } from './infraestructura/repositorio-sesiones-postgres';
import { RepositorioUsuariosPostgres } from './infraestructura/repositorio-usuarios-postgres';
import { AuthController } from './presentacion/auth.controller';
import { JwtAuthGuard } from './presentacion/jwt-auth.guard';
import {
  ALMACEN_VERSION_SEGURIDAD,
  EMISOR_TOKENS,
  ENVIADOR_OTP,
  GENERADOR_SECRETOS,
  HASHER_CLAVES,
  PROTECTOR_DATOS,
  REGISTRO_EVENTOS_SEGURIDAD,
  RELOJ,
  REPOSITORIO_CODIGOS_OTP,
  REPOSITORIO_SESIONES,
  REPOSITORIO_USUARIOS,
} from './tokens';

// Raíz de composición del módulo Seguridad: conecta los puertos del dominio con sus adaptadores.
// Es global para que los guards que exporta la fachada resuelvan sus dependencias en cualquier
// módulo sin que este importe el interior de `seguridad` (contracts/control-permisos.md).
@Global()
@Module({
  controllers: [AuthController],
  providers: [
    // ---------------------------------------------------------------- adaptadores
    {
      provide: PROTECTOR_DATOS,
      inject: [CONFIGURACION],
      useFactory: (configuracion: Configuracion): ProtectorDatos =>
        new ProtectorDatosAesGcm(configuracion.claveCifradoDatos, configuracion.claveHmacDatos),
    },
    { provide: HASHER_CLAVES, useFactory: (): HasherClaves => new HasherClavesArgon2() },
    {
      provide: GENERADOR_SECRETOS,
      inject: [CONFIGURACION],
      useFactory: (configuracion: Configuracion): GeneradorSecretos =>
        new GeneradorSecretosCrypto(configuracion.claveHmacDatos),
    },
    {
      provide: EMISOR_TOKENS,
      inject: [CONFIGURACION],
      useFactory: (configuracion: Configuracion): EmisorTokens =>
        new EmisorTokensJwt(configuracion.jwtSecreto),
    },
    { provide: RELOJ, useFactory: (): Reloj => new RelojSistema() },
    {
      provide: REGISTRO_EVENTOS_SEGURIDAD,
      useFactory: (): RegistroEventosSeguridad => new RegistroEventosSeguridadLogger(),
    },
    {
      provide: REPOSITORIO_USUARIOS,
      inject: [PrismaServicio, PROTECTOR_DATOS],
      useFactory: (prisma: PrismaServicio, protector: ProtectorDatos): RepositorioUsuarios =>
        new RepositorioUsuariosPostgres(prisma, protector),
    },
    {
      provide: REPOSITORIO_CODIGOS_OTP,
      inject: [PrismaServicio],
      useFactory: (prisma: PrismaServicio): RepositorioCodigosOtp =>
        new RepositorioCodigosOtpPostgres(prisma),
    },
    {
      provide: REPOSITORIO_SESIONES,
      inject: [PrismaServicio],
      useFactory: (prisma: PrismaServicio): RepositorioSesiones =>
        new RepositorioSesionesPostgres(prisma),
    },
    {
      // La configuración solo admite 'simulado' mientras no haya proveedor de SMS (FR-031).
      provide: ENVIADOR_OTP,
      inject: [REDIS_CLIENTE],
      useFactory: (redis: Redis): EnviadorOTP => new EnviadorOtpSimulado(redis),
    },
    {
      // Provisional (US1): en US2 (T048) se reemplaza por el adaptador de Redis.
      provide: ALMACEN_VERSION_SEGURIDAD,
      useFactory: (): AlmacenVersionSeguridad => new AlmacenVersionSeguridadEnMemoria(),
    },

    // ---------------------------------------------------------------- casos de uso
    {
      provide: IniciarSesion,
      inject: [
        REPOSITORIO_USUARIOS,
        REPOSITORIO_CODIGOS_OTP,
        HASHER_CLAVES,
        GENERADOR_SECRETOS,
        PROTECTOR_DATOS,
        ENVIADOR_OTP,
        RELOJ,
        REGISTRO_EVENTOS_SEGURIDAD,
      ],
      useFactory: (
        usuarios: RepositorioUsuarios,
        codigos: RepositorioCodigosOtp,
        hasher: HasherClaves,
        generador: GeneradorSecretos,
        protector: ProtectorDatos,
        enviador: EnviadorOTP,
        reloj: Reloj,
        eventos: RegistroEventosSeguridad,
      ) =>
        new IniciarSesion({
          usuarios,
          codigos,
          hasher,
          generador,
          protector,
          enviador,
          reloj,
          eventos,
        }),
    },
    {
      provide: VerificarOtp,
      inject: [
        REPOSITORIO_CODIGOS_OTP,
        REPOSITORIO_USUARIOS,
        REPOSITORIO_SESIONES,
        GENERADOR_SECRETOS,
        EMISOR_TOKENS,
        RELOJ,
        REGISTRO_EVENTOS_SEGURIDAD,
      ],
      useFactory: (
        codigos: RepositorioCodigosOtp,
        usuarios: RepositorioUsuarios,
        sesiones: RepositorioSesiones,
        generador: GeneradorSecretos,
        emisor: EmisorTokens,
        reloj: Reloj,
        eventos: RegistroEventosSeguridad,
      ) => new VerificarOtp({ codigos, usuarios, sesiones, generador, emisor, reloj, eventos }),
    },
    {
      provide: RenovarSesion,
      inject: [
        REPOSITORIO_SESIONES,
        REPOSITORIO_USUARIOS,
        GENERADOR_SECRETOS,
        EMISOR_TOKENS,
        RELOJ,
        REGISTRO_EVENTOS_SEGURIDAD,
        ALMACEN_VERSION_SEGURIDAD,
      ],
      useFactory: (
        sesiones: RepositorioSesiones,
        usuarios: RepositorioUsuarios,
        generador: GeneradorSecretos,
        emisor: EmisorTokens,
        reloj: Reloj,
        eventos: RegistroEventosSeguridad,
        almacen: AlmacenVersionSeguridad,
      ) => new RenovarSesion({ sesiones, usuarios, generador, emisor, reloj, eventos, almacen }),
    },
    {
      provide: CerrarSesion,
      inject: [REPOSITORIO_SESIONES, GENERADOR_SECRETOS, RELOJ, ALMACEN_VERSION_SEGURIDAD],
      useFactory: (
        sesiones: RepositorioSesiones,
        generador: GeneradorSecretos,
        reloj: Reloj,
        almacen: AlmacenVersionSeguridad,
      ) => new CerrarSesion({ sesiones, generador, reloj, almacen }),
    },
    {
      provide: CambiarClave,
      inject: [
        REPOSITORIO_USUARIOS,
        REPOSITORIO_SESIONES,
        HASHER_CLAVES,
        GENERADOR_SECRETOS,
        EMISOR_TOKENS,
        RELOJ,
        REGISTRO_EVENTOS_SEGURIDAD,
        ALMACEN_VERSION_SEGURIDAD,
      ],
      useFactory: (
        usuarios: RepositorioUsuarios,
        sesiones: RepositorioSesiones,
        hasher: HasherClaves,
        generador: GeneradorSecretos,
        emisor: EmisorTokens,
        reloj: Reloj,
        eventos: RegistroEventosSeguridad,
        almacen: AlmacenVersionSeguridad,
      ) =>
        new CambiarClave({
          usuarios,
          sesiones,
          hasher,
          generador,
          emisor,
          reloj,
          eventos,
          almacen,
        }),
    },

    JwtAuthGuard,
  ],
  exports: [EMISOR_TOKENS, JwtAuthGuard],
})
export class SeguridadModule {}
