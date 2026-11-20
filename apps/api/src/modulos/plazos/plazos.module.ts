import { Global, Module } from '@nestjs/common';
import { PrismaServicio } from '../../compartido/infraestructura/prisma.servicio';
import { CalcularPlazos, GestionarFeriados } from './aplicacion/feriados';
import type { RepositorioFeriados } from './dominio/puertos';
import { FachadaPlazos } from './fachada';
import { RepositorioFeriadosPostgres } from './infraestructura/repositorio-feriados-postgres';
import { FeriadosController } from './presentacion/feriados.controller';

// Raíz de composición del módulo Plazos (006): feriados, días hábiles, alertas y reloj de plazos.

const REPOSITORIO_FERIADOS = Symbol('REPOSITORIO_FERIADOS');

@Global()
@Module({
  controllers: [FeriadosController],
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
  ],
})
export class PlazosModule {}
