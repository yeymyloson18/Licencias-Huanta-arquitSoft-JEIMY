import { Global, Module, type OnModuleInit } from '@nestjs/common';
import { DespachadorEventos } from '../../compartido/infraestructura/despachador-eventos';
import { PrismaServicio } from '../../compartido/infraestructura/prisma.servicio';
import { FachadaSeguridad } from '../seguridad/fachada';
import { FachadaTramites } from '../tramites/fachada';
import { ConsultarAuditoriaPagos } from './aplicacion/consultar-auditoria-pagos';
import { CorregirNumeroRecibo } from './aplicacion/corregir-numero-recibo';
import { NombresUsuariosFachada } from './infraestructura/nombres-usuarios-fachada';
import { AuditoriaPagosController } from './presentacion/auditoria-pagos.controller';
import { ConsultarEsquela, RegistrarPagoEnCaja } from './aplicacion/caja';
import { DescargarPdfEsquela } from './aplicacion/descargar-pdf-esquela';
import { GenerarEsquela } from './aplicacion/generar-esquela';
import { FachadaPagos } from './fachada';
import { PdfEsquelaPdfLib } from './infraestructura/pdf-esquela-pdflib';
import type { EstadoExpediente } from './dominio/puertos/estado-expediente';
import type { RepositorioEsquelas } from './dominio/puertos/repositorio-esquelas';
import { EstadoExpedienteFachada } from './infraestructura/estado-expediente-fachada';
import { manejadorEsquelaSolicitada } from './infraestructura/manejador-esquela-solicitada';
import { RelojSistema } from './infraestructura/reloj-sistema';
import { RepositorioEsquelasPostgres } from './infraestructura/repositorio-esquelas-postgres';
import { EsquelasController } from './presentacion/esquelas.controller';

// Raíz de composición del módulo Pagos en caja (funcionalidad 005): esquela, PDF, registro y
// corrección del pago y auditoría de pagos. Usa Trámites y Seguridad solo por sus fachadas (son
// globales), y recibe `EsquelaSolicitada` por la cola de eventos (research §R-01).

const reloj = new RelojSistema();
const REPOSITORIO_ESQUELAS = Symbol('REPOSITORIO_ESQUELAS');
const ESTADO_EXPEDIENTE = Symbol('ESTADO_EXPEDIENTE');

@Global()
@Module({
  controllers: [EsquelasController, AuditoriaPagosController],
  exports: [FachadaPagos],
  providers: [
    {
      provide: CorregirNumeroRecibo,
      inject: [REPOSITORIO_ESQUELAS, ESTADO_EXPEDIENTE],
      useFactory: (esquelas: RepositorioEsquelas, expedientes: EstadoExpediente) =>
        new CorregirNumeroRecibo({ esquelas, expedientes, reloj }),
    },
    {
      provide: ConsultarAuditoriaPagos,
      inject: [REPOSITORIO_ESQUELAS, FachadaSeguridad],
      useFactory: (esquelas: RepositorioEsquelas, seguridad: FachadaSeguridad) =>
        new ConsultarAuditoriaPagos({ esquelas, nombres: new NombresUsuariosFachada(seguridad) }),
    },
    {
      provide: FachadaPagos,
      inject: [REPOSITORIO_ESQUELAS],
      useFactory: (esquelas: RepositorioEsquelasPostgres) => new FachadaPagos(esquelas, esquelas),
    },
    {
      provide: DescargarPdfEsquela,
      inject: [REPOSITORIO_ESQUELAS, ESTADO_EXPEDIENTE],
      useFactory: (esquelas: RepositorioEsquelas, expedientes: EstadoExpediente) =>
        new DescargarPdfEsquela({ esquelas, expedientes, pdf: new PdfEsquelaPdfLib() }),
    },
    {
      provide: REPOSITORIO_ESQUELAS,
      inject: [PrismaServicio],
      useFactory: (prisma: PrismaServicio): RepositorioEsquelasPostgres =>
        new RepositorioEsquelasPostgres(prisma),
    },
    {
      provide: ESTADO_EXPEDIENTE,
      inject: [FachadaTramites],
      useFactory: (tramites: FachadaTramites): EstadoExpediente =>
        new EstadoExpedienteFachada(tramites),
    },
    {
      provide: GenerarEsquela,
      inject: [REPOSITORIO_ESQUELAS],
      useFactory: (esquelas: RepositorioEsquelas) => new GenerarEsquela({ esquelas, reloj }),
    },
    {
      provide: ConsultarEsquela,
      inject: [REPOSITORIO_ESQUELAS, ESTADO_EXPEDIENTE],
      useFactory: (esquelas: RepositorioEsquelas, expedientes: EstadoExpediente) =>
        new ConsultarEsquela({ esquelas, expedientes }),
    },
    {
      provide: RegistrarPagoEnCaja,
      inject: [REPOSITORIO_ESQUELAS, ESTADO_EXPEDIENTE],
      useFactory: (esquelas: RepositorioEsquelas, expedientes: EstadoExpediente) =>
        new RegistrarPagoEnCaja({ esquelas, expedientes, reloj }),
    },
  ],
})
export class PagosModule implements OnModuleInit {
  constructor(
    private readonly despachador: DespachadorEventos,
    private readonly generarEsquela: GenerarEsquela,
  ) {}

  onModuleInit(): void {
    this.despachador.registrar(
      'EsquelaSolicitada',
      manejadorEsquelaSolicitada(this.generarEsquela),
    );
  }
}
