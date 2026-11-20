import { Global, Module, type OnModuleInit } from '@nestjs/common';
import { DespachadorEventos } from '../../compartido/infraestructura/despachador-eventos';
import { AplicarPagoRegistrado } from './aplicacion/aplicar-pago-registrado';
import type { LectorParaCaja } from './dominio/puertos/lector-para-caja';
import { FachadaTramites } from './fachada';
import { LectorParaCajaPostgres } from './infraestructura/lector-para-caja-postgres';
import { manejadorPagoRegistrado } from './infraestructura/manejador-pago-registrado';
import { CajaController, LECTOR_PARA_CAJA } from './presentacion/caja.controller';
import type { ProtectorDatos } from '../../compartido/dominio/protector-datos';
import { PrismaServicio } from '../../compartido/infraestructura/prisma.servicio';
import { PROTECTOR_DATOS } from '../../compartido/infraestructura/protector-datos-aes-gcm';
import { REDIS_CLIENTE } from '../../compartido/infraestructura/redis.proveedor';
import type Redis from 'ioredis';
import { FachadaCatalogo } from '../catalogo/fachada';
import { FachadaLicencias } from '../licencias/fachada';
import { FachadaPagos } from '../pagos/fachada';
import type { DatosPagoConsulta } from './dominio/puertos/datos-pago-consulta';
import { DATOS_PAGO_CONSULTA } from './presentacion/bandeja.controller';
import { FachadaSeguridad } from '../seguridad/fachada';
import { DatosPagoConsultaFachadas } from './infraestructura/datos-pago-consulta-fachadas';
import { SubsanarObservacion } from './aplicacion/subsanar-observacion';
import { RepositorioSubsanacionPostgres } from './infraestructura/repositorio-subsanacion-postgres';
import { SubsanacionController } from './presentacion/subsanacion.controller';
import { AplicarLicenciaEmitida } from './aplicacion/aplicar-licencia-emitida';
import { CompletarVencimientos } from './aplicacion/completar-vencimientos';
import type { PlazosHabiles } from './dominio/puertos/plazos-habiles';
import {
  PlazosFachada,
  RepositorioVencimientosPostgres,
} from './infraestructura/repositorio-vencimientos-postgres';
import { FachadaPlazos } from '../plazos/fachada';

const PLAZOS_HABILES = Symbol('PLAZOS_HABILES');
import { TransicionesSistema } from './aplicacion/transiciones-sistema';
import { LectorParaModulosPostgres } from './infraestructura/lector-para-modulos-postgres';
import {
  manejadorLicenciaEmitida,
  manejadorResultadoItse,
} from './infraestructura/manejadores-006';
import { AplicarResultadoItse } from './aplicacion/aplicar-resultado-itse';
import { ResultadosInspeccionFachada } from './infraestructura/resultados-inspeccion-fachada';
import { FachadaInspecciones } from '../inspecciones/fachada';
import { ConsultarAuditoriaExpediente } from './aplicacion/consultar-auditoria-expediente';
import {
  LectorAuditoriaPostgres,
  NombresPersonalFachada,
} from './infraestructura/lector-auditoria-postgres';
import { AuditoriaController } from './presentacion/auditoria.controller';
import {
  DescargarDocumento,
  ListarExpedientes,
  ObtenerDetalleExpediente,
} from './aplicacion/bandeja-expedientes';
import { ConsultarEstado } from './aplicacion/consultar-estado';
import {
  ConfirmarRiesgo,
  AprobarExpediente,
  DenegarExpediente,
  IniciarEvaluacion,
  ObservarExpediente,
} from './aplicacion/decisiones-evaluador';
import { LicenciasDelGrupo } from './aplicacion/licencias-del-grupo';
import type { CatalogoEvaluacion } from './dominio/puertos/catalogo-evaluacion';
import type { RepositorioDecisiones } from './dominio/puertos/repositorio-decisiones';
import { CatalogoEvaluacionFachada } from './infraestructura/catalogo-evaluacion-fachada';
import { RepositorioDecisionesPostgres } from './infraestructura/repositorio-decisiones-postgres';
import { EvaluacionController } from './presentacion/evaluacion.controller';
import { DescartarDocumentosVencidos } from './aplicacion/descartar-documentos-vencidos';
import { PresentarSolicitud } from './aplicacion/presentar-solicitud';
import { SubirDocumento } from './aplicacion/subir-documento';
import type { AlmacenArchivos } from '../../compartido/dominio/almacen-archivos';
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
import { ALMACEN_ARCHIVOS } from '../../compartido/infraestructura/almacen-archivos-disco';

export { ALMACEN_ARCHIVOS };
const CATALOGO_EVALUACION = Symbol('CATALOGO_EVALUACION');
const REPOSITORIO_DECISIONES = Symbol('REPOSITORIO_DECISIONES');

const huella = new HuellaSha256();
const reloj = new RelojSistema();

// Es global para que Pagos inyecte `FachadaTramites` sin importar el interior de `tramites` (005).
@Global()
@Module({
  // `ConsultaController` va antes: `POST expedientes/consultar` es una ruta fija.
  controllers: [
    ConsultaController,
    DocumentosController,
    ExpedientesController,
    BandejaController,
    EvaluacionController,
    CajaController,
    SubsanacionController,
    AuditoriaController,
  ],
  providers: [
    // Días hábiles por la fachada de Plazos (006).
    {
      provide: PLAZOS_HABILES,
      inject: [FachadaPlazos],
      useFactory: (plazos: FachadaPlazos): PlazosHabiles => new PlazosFachada(plazos),
    },
    // Decisiones del evaluador (005).
    {
      provide: CATALOGO_EVALUACION,
      inject: [FachadaCatalogo],
      useFactory: (catalogo: FachadaCatalogo): CatalogoEvaluacion =>
        new CatalogoEvaluacionFachada(catalogo),
    },
    {
      provide: REPOSITORIO_DECISIONES,
      inject: [PrismaServicio],
      useFactory: (prisma: PrismaServicio): RepositorioDecisiones =>
        new RepositorioDecisionesPostgres(prisma),
    },
    {
      provide: IniciarEvaluacion,
      inject: [REPOSITORIO_DECISIONES, PLAZOS_HABILES],
      useFactory: (decisiones: RepositorioDecisiones, plazos: PlazosHabiles) =>
        new IniciarEvaluacion({ decisiones, reloj, plazos }),
    },
    {
      provide: ConfirmarRiesgo,
      inject: [REPOSITORIO_DECISIONES, CATALOGO_EVALUACION, PLAZOS_HABILES],
      useFactory: (
        decisiones: RepositorioDecisiones,
        catalogo: CatalogoEvaluacion,
        plazos: PlazosHabiles,
      ) => new ConfirmarRiesgo({ decisiones, reloj, plazos }, catalogo),
    },
    {
      provide: ObservarExpediente,
      inject: [REPOSITORIO_DECISIONES, PLAZOS_HABILES],
      useFactory: (decisiones: RepositorioDecisiones, plazos: PlazosHabiles) =>
        new ObservarExpediente({ decisiones, reloj, plazos }),
    },
    {
      provide: DenegarExpediente,
      inject: [REPOSITORIO_DECISIONES, PLAZOS_HABILES],
      useFactory: (decisiones: RepositorioDecisiones, plazos: PlazosHabiles) =>
        new DenegarExpediente({ decisiones, reloj, plazos }),
    },
    {
      provide: AprobarExpediente,
      inject: [REPOSITORIO_DECISIONES, PLAZOS_HABILES],
      useFactory: (decisiones: RepositorioDecisiones, plazos: PlazosHabiles) =>
        new AprobarExpediente({ decisiones, reloj, plazos }),
    },
    {
      provide: LicenciasDelGrupo,
      inject: [CATALOGO_EVALUACION],
      useFactory: (catalogo: CatalogoEvaluacion) => new LicenciasDelGrupo(catalogo),
    },
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
      provide: DATOS_PAGO_CONSULTA,
      inject: [FachadaPagos, FachadaSeguridad, FachadaLicencias],
      useFactory: (pagos: FachadaPagos, seguridad: FachadaSeguridad, licencias: FachadaLicencias) =>
        new DatosPagoConsultaFachadas(pagos, seguridad, licencias),
    },
    {
      provide: ConsultarEstado,
      inject: [PrismaServicio, PROTECTOR_DATOS, REDIS_CLIENTE, DATOS_PAGO_CONSULTA],
      useFactory: (
        prisma: PrismaServicio,
        protector: ProtectorDatos,
        redis: Redis,
        pago: DatosPagoConsulta,
      ) =>
        new ConsultarEstado({
          expedientes: new RepositorioExpedientesPostgres(prisma, protector),
          limitador: new LimitadorConsultasRedis(redis),
          pago,
        }),
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
      inject: [PrismaServicio, PROTECTOR_DATOS, FachadaCatalogo, FachadaSeguridad, PLAZOS_HABILES],
      useFactory: (
        prisma: PrismaServicio,
        protector: ProtectorDatos,
        catalogo: FachadaCatalogo,
        seguridad: FachadaSeguridad,
        plazos: PlazosHabiles,
      ) =>
        new PresentarSolicitud({
          unidad: new UnidadDeTrabajoTramitesPostgres(prisma, protector),
          catalogo: new CatalogoRecetasFachada(catalogo),
          verificador: new VerificadorIdentidadFachada(seguridad),
          documentos: new RepositorioDocumentosTemporalesPostgres(prisma),
          huella,
          reloj,
          plazos,
        }),
    },
    // Auditoría del expediente para la jefatura (005, historia 6).
    {
      provide: ConsultarAuditoriaExpediente,
      inject: [PrismaServicio, FachadaSeguridad],
      useFactory: (prisma: PrismaServicio, seguridad: FachadaSeguridad) =>
        new ConsultarAuditoriaExpediente({
          lector: new LectorAuditoriaPostgres(prisma),
          nombres: new NombresPersonalFachada(seguridad),
        }),
    },
    // Subsanación de la observación (005, historia 4).
    {
      provide: SubsanarObservacion,
      inject: [PrismaServicio, PROTECTOR_DATOS, FachadaSeguridad, PLAZOS_HABILES],
      useFactory: (
        prisma: PrismaServicio,
        protector: ProtectorDatos,
        seguridad: FachadaSeguridad,
        plazos: PlazosHabiles,
      ) =>
        new SubsanarObservacion({
          repositorio: new RepositorioSubsanacionPostgres(prisma, protector),
          verificador: new VerificadorIdentidadFachada(seguridad),
          documentos: new RepositorioDocumentosTemporalesPostgres(prisma),
          reloj,
          plazos,
        }),
    },
    // Pago en caja (005): lectura para Pagos y paso a PAGADO al consumir `PagoRegistrado`.
    {
      provide: LECTOR_PARA_CAJA,
      inject: [PrismaServicio],
      useFactory: (prisma: PrismaServicio): LectorParaCaja => new LectorParaCajaPostgres(prisma),
    },
    {
      provide: FachadaTramites,
      inject: [LECTOR_PARA_CAJA, PrismaServicio, PROTECTOR_DATOS, PLAZOS_HABILES],
      useFactory: (
        lector: LectorParaCaja,
        prisma: PrismaServicio,
        protector: ProtectorDatos,
        plazos: PlazosHabiles,
      ) => {
        const vencimientos = new RepositorioVencimientosPostgres(prisma);
        return new FachadaTramites(lector, new LectorParaModulosPostgres(prisma, protector), {
          completar: new CompletarVencimientos({ vencimientos, plazos, reloj }),
          vencimientos,
        });
      },
    },
    // Transiciones del sistema por ruta (006): licencia emitida, resultado ITSE y pago de ruta B.
    {
      provide: TransicionesSistema,
      inject: [REPOSITORIO_DECISIONES],
      useFactory: (decisiones: RepositorioDecisiones) =>
        new TransicionesSistema({ decisiones, reloj }),
    },
    {
      provide: AplicarResultadoItse,
      inject: [TransicionesSistema, FachadaInspecciones],
      useFactory: (transiciones: TransicionesSistema, inspecciones: FachadaInspecciones) =>
        new AplicarResultadoItse({
          transiciones,
          resultados: new ResultadosInspeccionFachada(inspecciones),
        }),
    },
    {
      provide: AplicarLicenciaEmitida,
      inject: [TransicionesSistema],
      useFactory: (transiciones: TransicionesSistema) => new AplicarLicenciaEmitida(transiciones),
    },
    {
      provide: AplicarPagoRegistrado,
      inject: [REPOSITORIO_DECISIONES, PLAZOS_HABILES],
      useFactory: (decisiones: RepositorioDecisiones, plazos: PlazosHabiles) =>
        new AplicarPagoRegistrado({ decisiones, reloj, plazos }),
    },
  ],
  exports: [FachadaTramites],
})
export class TramitesModule implements OnModuleInit {
  constructor(
    private readonly despachador: DespachadorEventos,
    private readonly aplicarPago: AplicarPagoRegistrado,
    private readonly aplicarLicencia: AplicarLicenciaEmitida,
    private readonly aplicarResultado: AplicarResultadoItse,
  ) {}

  onModuleInit(): void {
    this.despachador.registrar('PagoRegistrado', manejadorPagoRegistrado(this.aplicarPago));
    this.despachador.registrar('LicenciaEmitida', manejadorLicenciaEmitida(this.aplicarLicencia));
    this.despachador.registrar(
      'ResultadoITSERegistrado',
      manejadorResultadoItse(this.aplicarResultado),
    );
  }
}
