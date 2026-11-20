import { Module, type OnModuleInit } from '@nestjs/common';
import { DespachadorEventos } from '../../compartido/infraestructura/despachador-eventos';
import { PrismaServicio } from '../../compartido/infraestructura/prisma.servicio';
import { GenerarEsquela } from './aplicacion/generar-esquela';
import { manejadorEsquelaSolicitada } from './infraestructura/manejador-esquela-solicitada';
import { RelojSistema } from './infraestructura/reloj-sistema';
import { RepositorioEsquelasPostgres } from './infraestructura/repositorio-esquelas-postgres';

// Raíz de composición del módulo Pagos en caja (funcionalidad 005): esquela, PDF, registro y
// corrección del pago y auditoría de pagos. Usa Trámites y Seguridad solo por sus fachadas, y
// recibe `EsquelaSolicitada` por la cola de eventos (research §R-01).

const reloj = new RelojSistema();

@Module({
  providers: [
    {
      provide: GenerarEsquela,
      inject: [PrismaServicio],
      useFactory: (prisma: PrismaServicio) =>
        new GenerarEsquela({ esquelas: new RepositorioEsquelasPostgres(prisma), reloj }),
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
