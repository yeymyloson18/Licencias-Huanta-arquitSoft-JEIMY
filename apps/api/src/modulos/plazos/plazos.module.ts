import { Global, Module, type OnModuleInit } from '@nestjs/common';
import { CONFIGURACION, type Configuracion } from '../../compartido/infraestructura/configuracion';
import { PrismaServicio } from '../../compartido/infraestructura/prisma.servicio';
import { FachadaLicencias } from '../licencias/fachada';
import { FachadaTramites } from '../tramites/fachada';
import { ConsultarAlertas, GenerarAlertas } from './aplicacion/alertas';
import { CalcularPlazos, GestionarFeriados } from './aplicacion/feriados';
import type { RepositorioAlertas, RepositorioFeriados } from './dominio/puertos';
import { ExpedientesFachadaTramites } from './infraestructura/expedientes-fachada';
import { RelojPlazos } from './infraestructura/reloj-plazos';
import { RepositorioAlertasPostgres } from './infraestructura/repositorio-alertas-postgres';
import { AlertasController } from './presentacion/alertas.controller';
import { FachadaPlazos } from './fachada';
import { RepositorioFeriadosPostgres } from './infraestructura/repositorio-feriados-postgres';
import { FeriadosController } from './presentacion/feriados.controller';

// Raíz de composición del módulo Plazos (006): feriados, días hábiles, alertas y reloj de plazos.

const REPOSITORIO_FERIADOS = Symbol('REPOSITORIO_FERIADOS');
const REPOSITORIO_ALERTAS = Symbol('REPOSITORIO_ALERTAS');
const reloj = { ahora: () => new Date() };

@Global()
@Module({
  controllers: [FeriadosController, AlertasController],
  exports: [FachadaPlazos],
  providers: [
    {
      provide: REPOSITORIO_FERIADOS,
      inject: [PrismaServicio],
      useFactory: (prisma: PrismaServicio): RepositorioFeriados =>
        new RepositorioFeriadosPostgres(prisma),
    },
    {
      provide: GestionarFeriados,
      inject: [REPOSITORIO_FERIADOS],
      useFactory: (feriados: RepositorioFeriados) => new GestionarFeriados(feriados),
    },
    {
      provide: FachadaPlazos,
      inject: [REPOSITORIO_FERIADOS],
      useFactory: (feriados: RepositorioFeriados) =>
        new FachadaPlazos(new CalcularPlazos(feriados)),
    },
    {
      provide: REPOSITORIO_ALERTAS,
      inject: [PrismaServicio],
      useFactory: (prisma: PrismaServicio): RepositorioAlertas =>
        new RepositorioAlertasPostgres(prisma),
    },
    {
      provide: GenerarAlertas,
      inject: [REPOSITORIO_ALERTAS, REPOSITORIO_FERIADOS, FachadaTramites],
      useFactory: (
        alertas: RepositorioAlertas,
        feriados: RepositorioFeriados,
        tramites: FachadaTramites,
      ) =>
        new GenerarAlertas({
          alertas,
          expedientes: new ExpedientesFachadaTramites(tramites),
          plazos: new CalcularPlazos(feriados),
          reloj,
        }),
    },
    {
      provide: ConsultarAlertas,
      inject: [REPOSITORIO_ALERTAS, REPOSITORIO_FERIADOS, FachadaTramites],
      useFactory: (
        alertas: RepositorioAlertas,
        feriados: RepositorioFeriados,
        tramites: FachadaTramites,
      ) =>
        new ConsultarAlertas({
          alertas,
          expedientes: new ExpedientesFachadaTramites(tramites),
          plazos: new CalcularPlazos(feriados),
          reloj,
        }),
    },
    {
      provide: RelojPlazos,
      inject: [PrismaServicio, CONFIGURACION],
      useFactory: (prisma: PrismaServicio, configuracion: Configuracion) =>
        new RelojPlazos(prisma, configuracion.relojPlazosIntervaloMs),
    },
  ],
})
export class PlazosModule implements OnModuleInit {
  constructor(
    private readonly relojPlazos: RelojPlazos,
    private readonly generarAlertas: GenerarAlertas,
    private readonly licencias: FachadaLicencias,
  ) {}

  onModuleInit(): void {
    this.relojPlazos.registrar('alertas-de-plazo', () => this.generarAlertas.ejecutar());
    // 30 días antes del vencimiento del certificado ITSE, una sola vez (FR-034).
    this.relojPlazos.registrar('aviso-itse', () => this.licencias.avisarCertificadosPorVencer());
  }
}
