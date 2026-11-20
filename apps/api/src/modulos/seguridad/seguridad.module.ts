import { Global, Module } from '@nestjs/common';
import type Redis from 'ioredis';
import { CONFIGURACION, type Configuracion } from '../../compartido/infraestructura/configuracion';
import { PrismaServicio } from '../../compartido/infraestructura/prisma.servicio';
import { REDIS_CLIENTE } from '../../compartido/infraestructura/redis.proveedor';
import { ActualizarUsuario } from './aplicacion/actualizar-usuario';
import { AsignarClaveTemporal } from './aplicacion/asignar-clave-temporal';
import { BuscarUsuarios } from './aplicacion/buscar-usuarios';
import { CambiarClave } from './aplicacion/cambiar-clave';
import { CerrarSesion } from './aplicacion/cerrar-sesion';
import { CrearPrimerAdministrador } from './aplicacion/crear-primer-administrador';
import { CrearUsuario } from './aplicacion/crear-usuario';
import { IniciarSesion } from './aplicacion/iniciar-sesion';
import { ListarUsuarios } from './aplicacion/listar-usuarios';
import { ReemplazarRoles } from './aplicacion/reemplazar-roles';
import { RenovarSesion } from './aplicacion/renovar-sesion';
import { VerificarOtp } from './aplicacion/verificar-otp';
import type { AlmacenVersionSeguridad } from './dominio/puertos/almacen-version-seguridad';
import type { EmisorTokens } from './dominio/puertos/emisor-tokens';
import type { EnviadorOTP } from './dominio/puertos/enviador-otp';
import type { GeneradorSecretos } from './dominio/puertos/generador-secretos';
import type { HasherClaves } from './dominio/puertos/hasher-claves';
import type { LimitadorIntentos } from './dominio/puertos/limitador-intentos';
import type { RegistroEventosSeguridad } from './dominio/puertos/registro-eventos-seguridad';
import type { Reloj } from './dominio/puertos/reloj';
import type { RepositorioCodigosOtp } from './dominio/puertos/repositorio-codigos-otp';
import type { RepositorioSesiones } from './dominio/puertos/repositorio-sesiones';
import type { RepositorioUsuarios } from './dominio/puertos/repositorio-usuarios';
import type { ProtectorDatos } from '../../compartido/dominio/protector-datos';
import { PROTECTOR_DATOS } from '../../compartido/infraestructura/protector-datos-aes-gcm';
import { ConfirmarIdentidadEnLinea } from './aplicacion/confirmar-identidad-en-linea';
import { ResolverUsuarioAutenticado } from './aplicacion/resolver-usuario-autenticado';
import { VerificarIdentidadAdministrado } from './aplicacion/verificar-identidad-administrado';
import { VerificarOtpAdministrado } from './aplicacion/verificar-otp-administrado';
import type { EmisorTokensIdentidad } from './dominio/puertos/emisor-tokens';
import type { LimitadorIntentosIdentidad } from './dominio/puertos/limitador-intentos';
import type { RepositorioVerificaciones } from './dominio/puertos/repositorio-verificaciones';
import type { ServicioIdentificacion } from './dominio/puertos/servicio-identificacion';
import { FachadaSeguridad } from './fachada';
import { VerificarIdentidadPresencial } from './aplicacion/verificar-identidad-presencial';
import { SolicitanteGuard } from './presentacion/solicitante.guard';
import { ConsultaOPersonalGuard } from './presentacion/consulta-o-personal.guard';
import { RepositorioVerificacionesPostgres } from './infraestructura/repositorio-verificaciones-postgres';
import { ServicioIdentificacionSimulado } from './infraestructura/servicio-identificacion-simulado';
import { IdentidadController } from './presentacion/identidad.controller';
import { TokenIdentidadGuard } from './presentacion/token-identidad.guard';
import { AlmacenVersionSeguridadRedis } from './infraestructura/almacen-version-seguridad-redis';
import { EmisorTokensJwt } from './infraestructura/emisor-tokens-jwt';
import { EnviadorOtpSimulado } from './infraestructura/enviador-otp-simulado';
import { GeneradorSecretosCrypto } from './infraestructura/generador-secretos-crypto';
import { HasherClavesArgon2 } from './infraestructura/hasher-claves-argon2';
import { LimitadorIntentosRedis } from './infraestructura/limitador-intentos-redis';
import { RegistroEventosSeguridadLogger } from './infraestructura/registro-eventos-seguridad-logger';
import { RelojSistema } from './infraestructura/reloj-sistema';
import { RepositorioCodigosOtpPostgres } from './infraestructura/repositorio-codigos-otp-postgres';
import { RepositorioSesionesPostgres } from './infraestructura/repositorio-sesiones-postgres';
import { RepositorioUsuariosPostgres } from './infraestructura/repositorio-usuarios-postgres';
import { AuthController } from './presentacion/auth.controller';
import { JwtAuthGuard } from './presentacion/jwt-auth.guard';
import { RolesGuard } from './presentacion/roles.guard';
import { UsuariosController } from './presentacion/usuarios.controller';
import {
  ALMACEN_VERSION_SEGURIDAD,
  EMISOR_TOKENS,
  ENVIADOR_OTP,
  GENERADOR_SECRETOS,
  HASHER_CLAVES,
  LIMITADOR_INTENTOS,
  REGISTRO_EVENTOS_SEGURIDAD,
  RELOJ,
  REPOSITORIO_CODIGOS_OTP,
  REPOSITORIO_SESIONES,
  REPOSITORIO_USUARIOS,
  REPOSITORIO_VERIFICACIONES,
  SERVICIO_IDENTIFICACION,
} from './tokens';

// Raíz de composición del módulo Seguridad: conecta los puertos del dominio con sus adaptadores.
// Es global para que los guards que exporta la fachada resuelvan sus dependencias en cualquier
// módulo sin que este importe el interior de `seguridad` (contracts/control-permisos.md).
@Global()
@Module({
  controllers: [AuthController, UsuariosController, IdentidadController],
  providers: [
    // ---------------------------------------------------------------- adaptadores
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
      // Implementa también `EmisorTokensIdentidad` (token del administrado, 004).
      useFactory: (configuracion: Configuracion): EmisorTokensJwt =>
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
      // Versión de seguridad y sesiones revocadas compartidas por todas las instancias (§R-07).
      provide: ALMACEN_VERSION_SEGURIDAD,
      inject: [REDIS_CLIENTE, REGISTRO_EVENTOS_SEGURIDAD],
      useFactory: (redis: Redis, eventos: RegistroEventosSeguridad): AlmacenVersionSeguridad =>
        new AlmacenVersionSeguridadRedis(redis, eventos),
    },
    {
      // Contadores de intentos compartidos por todas las instancias (FR-006 a FR-009, §R-08).
      provide: LIMITADOR_INTENTOS,
      inject: [REDIS_CLIENTE, PROTECTOR_DATOS],
      // Implementa también `LimitadorIntentosIdentidad` (identidad del administrado, 004).
      useFactory: (redis: Redis, protector: ProtectorDatos): LimitadorIntentosRedis =>
        new LimitadorIntentosRedis(redis, protector),
    },
    {
      provide: SERVICIO_IDENTIFICACION,
      useFactory: (): ServicioIdentificacion => new ServicioIdentificacionSimulado(),
    },
    {
      provide: REPOSITORIO_VERIFICACIONES,
      inject: [PrismaServicio],
      useFactory: (prisma: PrismaServicio): RepositorioVerificaciones =>
        new RepositorioVerificacionesPostgres(prisma),
    },
    {
      provide: ResolverUsuarioAutenticado,
      inject: [ALMACEN_VERSION_SEGURIDAD, REPOSITORIO_USUARIOS],
      useFactory: (almacen: AlmacenVersionSeguridad, usuarios: RepositorioUsuarios) =>
        new ResolverUsuarioAutenticado({ almacen, usuarios }),
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
        LIMITADOR_INTENTOS,
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
        limitador: LimitadorIntentos,
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
          limitador,
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
        LIMITADOR_INTENTOS,
      ],
      useFactory: (
        codigos: RepositorioCodigosOtp,
        usuarios: RepositorioUsuarios,
        sesiones: RepositorioSesiones,
        generador: GeneradorSecretos,
        emisor: EmisorTokens,
        reloj: Reloj,
        eventos: RegistroEventosSeguridad,
        limitador: LimitadorIntentos,
      ) =>
        new VerificarOtp({
          codigos,
          usuarios,
          sesiones,
          generador,
          emisor,
          reloj,
          eventos,
          limitador,
        }),
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
        LIMITADOR_INTENTOS,
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
        limitador: LimitadorIntentos,
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
          limitador,
        }),
    },

    {
      provide: CrearPrimerAdministrador,
      inject: [REPOSITORIO_USUARIOS, HASHER_CLAVES, GENERADOR_SECRETOS, RELOJ],
      useFactory: (
        usuarios: RepositorioUsuarios,
        hasher: HasherClaves,
        generador: GeneradorSecretos,
        reloj: Reloj,
      ) => new CrearPrimerAdministrador({ usuarios, hasher, generador, reloj }),
    },

    // ---------------------------------------------------------------- gestión de usuarios (US5)
    {
      provide: ListarUsuarios,
      inject: [REPOSITORIO_USUARIOS],
      useFactory: (usuarios: RepositorioUsuarios) => new ListarUsuarios({ usuarios }),
    },
    {
      provide: BuscarUsuarios,
      inject: [REPOSITORIO_USUARIOS],
      useFactory: (usuarios: RepositorioUsuarios) => new BuscarUsuarios({ usuarios }),
    },
    {
      provide: CrearUsuario,
      inject: [REPOSITORIO_USUARIOS, HASHER_CLAVES, GENERADOR_SECRETOS, RELOJ],
      useFactory: (
        usuarios: RepositorioUsuarios,
        hasher: HasherClaves,
        generador: GeneradorSecretos,
        reloj: Reloj,
      ) => new CrearUsuario({ usuarios, hasher, generador, reloj }),
    },
    {
      provide: ActualizarUsuario,
      inject: [
        REPOSITORIO_USUARIOS,
        REPOSITORIO_SESIONES,
        ALMACEN_VERSION_SEGURIDAD,
        RELOJ,
        REGISTRO_EVENTOS_SEGURIDAD,
      ],
      useFactory: (
        usuarios: RepositorioUsuarios,
        sesiones: RepositorioSesiones,
        almacen: AlmacenVersionSeguridad,
        reloj: Reloj,
        eventos: RegistroEventosSeguridad,
      ) => new ActualizarUsuario({ usuarios, sesiones, almacen, reloj, eventos }),
    },
    {
      provide: ReemplazarRoles,
      inject: [REPOSITORIO_USUARIOS, ALMACEN_VERSION_SEGURIDAD, RELOJ, REGISTRO_EVENTOS_SEGURIDAD],
      useFactory: (
        usuarios: RepositorioUsuarios,
        almacen: AlmacenVersionSeguridad,
        reloj: Reloj,
        eventos: RegistroEventosSeguridad,
      ) => new ReemplazarRoles({ usuarios, almacen, reloj, eventos }),
    },
    {
      provide: AsignarClaveTemporal,
      inject: [
        REPOSITORIO_USUARIOS,
        REPOSITORIO_SESIONES,
        HASHER_CLAVES,
        ALMACEN_VERSION_SEGURIDAD,
        RELOJ,
        REGISTRO_EVENTOS_SEGURIDAD,
      ],
      useFactory: (
        usuarios: RepositorioUsuarios,
        sesiones: RepositorioSesiones,
        hasher: HasherClaves,
        almacen: AlmacenVersionSeguridad,
        reloj: Reloj,
        eventos: RegistroEventosSeguridad,
      ) => new AsignarClaveTemporal({ usuarios, sesiones, hasher, almacen, reloj, eventos }),
    },

    JwtAuthGuard,
    RolesGuard,
    // ------------------------------------------- identidad del administrado (004)
    {
      provide: VerificarIdentidadAdministrado,
      inject: [
        SERVICIO_IDENTIFICACION,
        REPOSITORIO_VERIFICACIONES,
        LIMITADOR_INTENTOS,
        GENERADOR_SECRETOS,
        PROTECTOR_DATOS,
        ENVIADOR_OTP,
        RELOJ,
      ],
      useFactory: (
        servicio: ServicioIdentificacion,
        verificaciones: RepositorioVerificaciones,
        limitador: LimitadorIntentosIdentidad,
        generador: GeneradorSecretos,
        protector: ProtectorDatos,
        enviador: EnviadorOTP,
        reloj: Reloj,
      ) =>
        new VerificarIdentidadAdministrado({
          servicio,
          verificaciones,
          limitador,
          generador,
          protector,
          enviador,
          reloj,
        }),
    },
    {
      provide: VerificarOtpAdministrado,
      inject: [
        REPOSITORIO_VERIFICACIONES,
        LIMITADOR_INTENTOS,
        GENERADOR_SECRETOS,
        EMISOR_TOKENS,
        RELOJ,
      ],
      useFactory: (
        verificaciones: RepositorioVerificaciones,
        limitador: LimitadorIntentosIdentidad,
        generador: GeneradorSecretos,
        emisor: EmisorTokensIdentidad,
        reloj: Reloj,
      ) => new VerificarOtpAdministrado({ verificaciones, limitador, generador, emisor, reloj }),
    },
    {
      provide: ConfirmarIdentidadEnLinea,
      inject: [REPOSITORIO_VERIFICACIONES, PROTECTOR_DATOS],
      useFactory: (verificaciones: RepositorioVerificaciones, protector: ProtectorDatos) =>
        new ConfirmarIdentidadEnLinea(verificaciones, protector),
    },
    {
      provide: FachadaSeguridad,
      inject: [ConfirmarIdentidadEnLinea, SERVICIO_IDENTIFICACION, EMISOR_TOKENS],
      useFactory: (
        confirmar: ConfirmarIdentidadEnLinea,
        servicio: ServicioIdentificacion,
        emisor: EmisorTokensJwt,
      ) => new FachadaSeguridad(confirmar, new VerificarIdentidadPresencial(servicio), emisor),
    },
    TokenIdentidadGuard,
    SolicitanteGuard,
    ConsultaOPersonalGuard,
  ],
  // Lo que necesitan los guards de la fachada cuando otro módulo los usa.
  exports: [
    EMISOR_TOKENS,
    ResolverUsuarioAutenticado,
    JwtAuthGuard,
    RolesGuard,
    TokenIdentidadGuard,
    SolicitanteGuard,
    ConsultaOPersonalGuard,
    FachadaSeguridad,
  ],
})
export class SeguridadModule {}
