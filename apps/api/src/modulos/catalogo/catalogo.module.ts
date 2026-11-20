import { Global, Module } from '@nestjs/common';
import type Redis from 'ioredis';
import { CONFIGURACION, type Configuracion } from '../../compartido/infraestructura/configuracion';
import { PrismaServicio } from '../../compartido/infraestructura/prisma.servicio';
import { REDIS_CLIENTE } from '../../compartido/infraestructura/redis.proveedor';
import { ActualizarReceta } from './aplicacion/actualizar-receta';
import { ListarRecetas } from './aplicacion/listar-recetas';
import { ListarRecetasAdmin } from './aplicacion/listar-recetas-admin';
import { ObtenerFicha } from './aplicacion/obtener-ficha';
import { ObtenerPreguntas } from './aplicacion/obtener-preguntas';
import { ObtenerRecetaAdmin } from './aplicacion/obtener-receta-admin';
import { ProponerLicencia } from './aplicacion/proponer-licencia';
import type { RepositorioCatalogo } from './dominio/repositorio-catalogo';
import { FachadaCatalogo } from './fachada';
import { InvalidadorCacheCatalogoRedis } from './infraestructura/invalidador-cache-catalogo-redis';
import { RelojSistema } from './infraestructura/reloj-sistema';
import { RepositorioCatalogoConCache } from './infraestructura/repositorio-catalogo-con-cache';
import { RepositorioCatalogoPostgres } from './infraestructura/repositorio-catalogo-postgres';
import { UnidadDeTrabajoCatalogoPostgres } from './infraestructura/unidad-de-trabajo-catalogo-postgres';
import { AsistenteController } from './presentacion/asistente.controller';
import { CatalogoAdminController } from './presentacion/catalogo-admin.controller';
import { CatalogoController } from './presentacion/catalogo.controller';

// Raíz de composición del módulo Catálogo: Postgres → envuelto por la caché → caso de uso. La edición
// (historia 3 de la 003) usa la unidad de trabajo de Postgres y borra la caché después de confirmar.
export const REPOSITORIO_CATALOGO = Symbol('REPOSITORIO_CATALOGO');

// Es global para que otros módulos inyecten `FachadaCatalogo` sin importar el interior de `catalogo`
// (regla de dependencia "aislamiento-entre-modulos"; lo usa Trámites desde la 004).
@Global()
@Module({
  controllers: [CatalogoController, AsistenteController, CatalogoAdminController],
  providers: [
    {
      provide: REPOSITORIO_CATALOGO,
      inject: [PrismaServicio, REDIS_CLIENTE, CONFIGURACION],
      useFactory: (
        prisma: PrismaServicio,
        redis: Redis,
        configuracion: Configuracion,
      ): RepositorioCatalogo =>
        new RepositorioCatalogoConCache(
          new RepositorioCatalogoPostgres(prisma),
          redis,
          configuracion.catalogoCacheTtlSegundos,
        ),
    },
    {
      provide: ListarRecetas,
      inject: [REPOSITORIO_CATALOGO],
      useFactory: (repositorio: RepositorioCatalogo) => new ListarRecetas(repositorio),
    },
    {
      provide: ObtenerFicha,
      inject: [REPOSITORIO_CATALOGO],
      useFactory: (repositorio: RepositorioCatalogo) => new ObtenerFicha(repositorio),
    },
    {
      provide: ObtenerPreguntas,
      inject: [REPOSITORIO_CATALOGO],
      useFactory: (repositorio: RepositorioCatalogo) => new ObtenerPreguntas(repositorio),
    },
    {
      provide: ProponerLicencia,
      inject: [REPOSITORIO_CATALOGO],
      useFactory: (repositorio: RepositorioCatalogo) => new ProponerLicencia(repositorio),
    },
    {
      provide: ListarRecetasAdmin,
      inject: [REPOSITORIO_CATALOGO],
      useFactory: (repositorio: RepositorioCatalogo) => new ListarRecetasAdmin(repositorio),
    },
    {
      provide: ObtenerRecetaAdmin,
      inject: [REPOSITORIO_CATALOGO],
      useFactory: (repositorio: RepositorioCatalogo) => new ObtenerRecetaAdmin(repositorio),
    },
    {
      provide: ActualizarReceta,
      inject: [PrismaServicio, REDIS_CLIENTE],
      useFactory: (prisma: PrismaServicio, redis: Redis) =>
        new ActualizarReceta(
          new UnidadDeTrabajoCatalogoPostgres(prisma),
          new InvalidadorCacheCatalogoRedis(redis),
          new RelojSistema(),
        ),
    },
    {
      provide: FachadaCatalogo,
      inject: [ListarRecetas, ObtenerFicha],
      useFactory: (listarRecetas: ListarRecetas, obtenerFicha: ObtenerFicha) =>
        new FachadaCatalogo(listarRecetas, obtenerFicha),
    },
  ],
  exports: [FachadaCatalogo],
})
export class CatalogoModule {}
