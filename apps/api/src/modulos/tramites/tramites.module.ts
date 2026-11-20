import { Module } from '@nestjs/common';
import type { ProtectorDatos } from '../../compartido/dominio/protector-datos';
import { CONFIGURACION, type Configuracion } from '../../compartido/infraestructura/configuracion';
import { PrismaServicio } from '../../compartido/infraestructura/prisma.servicio';
import { PROTECTOR_DATOS } from '../../compartido/infraestructura/protector-datos-aes-gcm';
import { REDIS_CLIENTE } from '../../compartido/infraestructura/redis.proveedor';
import type Redis from 'ioredis';
import { FachadaCatalogo } from '../catalogo/fachada';
import { FachadaSeguridad } from '../seguridad/fachada';
import {
  DescargarDocumento,
  ListarExpedientes,
  ObtenerDetalleExpediente,
} from './aplicacion/bandeja-expedientes';
import { ConsultarEstado } from './aplicacion/consultar-estado';
import { DescartarDocumentosVencidos } from './aplicacion/descartar-documentos-vencidos';
import { PresentarSolicitud } from './aplicacion/presentar-solicitud';
import { SubirDocumento } from './aplicacion/subir-documento';
import type { AlmacenArchivos } from './dominio/puertos/almacen-archivos';
import { AlmacenArchivosDisco } from './infraestructura/almacen-archivos-disco';
import { CatalogoRecetasFachada } from './infraestructura/catalogo-recetas-fachada';
import { GeneradorIdsCrypto } from './infraestructura/generador-ids-crypto';
import { LimitadorConsultasRedis } from './infraestructura/limitador-consultas-redis';
import { HuellaSha256 } from './infraestructura/huella-sha256';
import { RelojSistema } from './infraestructura/reloj-sistema';
import { TareaDescarteDocumentos } from './infraestructura/tarea-descarte-documentos';
import { RepositorioExpedientesPostgres } from './infraestructura/repositorio-expedientes-postgres';
import { RepositorioDocumentosTemporalesPostgres } from './infraestructura/repositorio-documentos-temporales-postgres';
import { UnidadDeTrabajoTramitesPostgres } from './infraestructura/unidad-de-trabajo-tramites-postgres';
import { VerificadorIdentidadFachada } from './infraestructura/verificador-identidad-fachada';
import { BandejaController } from './presentacion/bandeja.controller';
import { ConsultaController } from './presentacion/consulta.controller';
import { DocumentosController } from './presentacion/documentos.controller';
import { ExpedientesController } from './presentacion/expedientes.controller';

// Raíz de composición del módulo Trámites (funcionalidad 004). Usa Catálogo y Seguridad solo por sus
// fachadas (principio I): Catálogo y Seguridad son globales y exportan sus fachadas.
export const ALMACEN_ARCHIVOS = Symbol('ALMACEN_ARCHIVOS');

const huella = new HuellaSha256();
const reloj = new RelojSistema();

@Module({
  // `ConsultaController` va antes: `POST expedientes/consultar` es una ruta fija.
  controllers: [ConsultaController, DocumentosController, ExpedientesController, BandejaController],
  providers: [
    {
      provide: TareaDescarteDocumentos,
      inject: [PrismaServicio, ALMACEN_ARCHIVOS],
      useFactory: (prisma: PrismaServicio, almacen: AlmacenArchivos) =>
        new TareaDescarteDocumentos(
          prisma,
          new DescartarDocumentosVencidos({
            documentos: new RepositorioDocumentosTemporalesPostgres(prisma),
            almacen,
            reloj,
          }),
        ),
    },
    {
      provide: ListarExpedientes,
      inject: [PrismaServicio, PROTECTOR_DATOS],
      useFactory: (prisma: PrismaServicio, protector: ProtectorDatos) =>
        new ListarExpedientes(new RepositorioExpedientesPostgres(prisma, protector)),
    },
    {
      provide: ObtenerDetalleExpediente,
      inject: [PrismaServicio, PROTECTOR_DATOS],
      useFactory: (prisma: PrismaServicio, protector: ProtectorDatos) =>
        new ObtenerDetalleExpediente({
          expedientes: new RepositorioExpedientesPostgres(prisma, protector),
          reloj,
        }),
    },
    {
      provide: DescargarDocumento,
      inject: [PrismaServicio, PROTECTOR_DATOS, ALMACEN_ARCHIVOS],
      useFactory: (prisma: PrismaServicio, protector: ProtectorDatos, almacen: AlmacenArchivos) =>
        new DescargarDocumento({
          expedientes: new RepositorioExpedientesPostgres(prisma, protector),
          almacen,
        }),
    },
    {
      provide: ConsultarEstado,
      inject: [PrismaServicio, PROTECTOR_DATOS, REDIS_CLIENTE],
      useFactory: (prisma: PrismaServicio, protector: ProtectorDatos, redis: Redis) =>
        new ConsultarEstado({
          expedientes: new RepositorioExpedientesPostgres(prisma, protector),
          limitador: new LimitadorConsultasRedis(redis),
        }),
    },
    {
      provide: ALMACEN_ARCHIVOS,
      inject: [CONFIGURACION],
      useFactory: (configuracion: Configuracion): Promise<AlmacenArchivos> =>
        AlmacenArchivosDisco.crear(configuracion.almacenArchivosRuta),
    },
    {
      provide: SubirDocumento,
      inject: [ALMACEN_ARCHIVOS, PrismaServicio],
      useFactory: (almacen: AlmacenArchivos, prisma: PrismaServicio) =>
        new SubirDocumento({
          almacen,
          documentos: new RepositorioDocumentosTemporalesPostgres(prisma),
          huella,
          ids: new GeneradorIdsCrypto(),
          reloj,
        }),
    },
    {
      provide: PresentarSolicitud,
      inject: [PrismaServicio, PROTECTOR_DATOS, FachadaCatalogo, FachadaSeguridad],
      useFactory: (
        prisma: PrismaServicio,
        protector: ProtectorDatos,
        catalogo: FachadaCatalogo,
        seguridad: FachadaSeguridad,
      ) =>
        new PresentarSolicitud({
          unidad: new UnidadDeTrabajoTramitesPostgres(prisma, protector),
          catalogo: new CatalogoRecetasFachada(catalogo),
          verificador: new VerificadorIdentidadFachada(seguridad),
          documentos: new RepositorioDocumentosTemporalesPostgres(prisma),
          huella,
          reloj,
        }),
    },
  ],
})
export class TramitesModule {}
