import { Module } from '@nestjs/common';
import type Redis from 'ioredis';
import { CONFIGURACION, type Configuracion } from '../../compartido/infraestructura/configuracion';
import { PrismaServicio } from '../../compartido/infraestructura/prisma.servicio';
import { REDIS_CLIENTE } from '../../compartido/infraestructura/redis.proveedor';
import { ListarRecetas } from './aplicacion/listar-recetas';
import { ObtenerFicha } from './aplicacion/obtener-ficha';
import { ObtenerPreguntas } from './aplicacion/obtener-preguntas';
import { ProponerLicencia } from './aplicacion/proponer-licencia';
import type { RepositorioCatalogo } from './dominio/repositorio-catalogo';
import { FachadaCatalogo } from './fachada';
import { RepositorioCatalogoConCache } from './infraestructura/repositorio-catalogo-con-cache';
import { RepositorioCatalogoPostgres } from './infraestructura/repositorio-catalogo-postgres';
import { AsistenteController } from './presentacion/asistente.controller';
import { CatalogoController } from './presentacion/catalogo.controller';

// Raíz de composición del módulo Catálogo: Postgres → envuelto por la caché → caso de uso.
export const REPOSITORIO_CATALOGO = Symbol('REPOSITORIO_CATALOGO');

@Module({
  controllers: [CatalogoController, AsistenteController],
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
      provide: FachadaCatalogo,
      inject: [ListarRecetas],
      useFactory: (listarRecetas: ListarRecetas) => new FachadaCatalogo(listarRecetas),
    },
  ],
  exports: [FachadaCatalogo],
})
export class CatalogoModule {}
