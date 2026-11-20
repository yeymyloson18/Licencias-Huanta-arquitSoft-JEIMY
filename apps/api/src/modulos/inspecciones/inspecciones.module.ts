import { Global, Module, type OnModuleInit } from '@nestjs/common';
import type { AlmacenArchivos } from '../../compartido/dominio/almacen-archivos';
import { ALMACEN_ARCHIVOS } from '../../compartido/infraestructura/almacen-archivos-disco';
import { DespachadorEventos } from '../../compartido/infraestructura/despachador-eventos';
import { PrismaServicio } from '../../compartido/infraestructura/prisma.servicio';
import { FachadaSeguridad } from '../seguridad/fachada';
import { FachadaTramites } from '../tramites/fachada';
import {
  AsignarInspector,
  CrearInspeccion,
  ListarInspecciones,
  RegistrarResultado,
} from './aplicacion/inspecciones';
import type { PersonalInspecciones, RepositorioInspecciones } from './dominio/puertos';
import { FachadaInspecciones } from './fachada';
import {
  ExpedientesFachadaTramites,
  GeneradorIdsCrypto,
  manejadorInspeccionRequerida,
  PersonalFachadaSeguridad,
  RelojSistema,
} from './infraestructura/adaptadores';
import { RepositorioInspeccionesPostgres } from './infraestructura/repositorio-inspecciones-postgres';
import {
  InspeccionesController,
  PERSONAL_INSPECCIONES,
} from './presentacion/inspecciones.controller';

// Raíz de composición del módulo Inspecciones (006): inspección creada desde `InspeccionRequerida`,
// asignación por la jefatura y resultado con fotos del inspector asignado. Usa Trámites y Seguridad
// solo por sus fachadas (son globales); las fotos van al almacén compartido de archivos.

const reloj = new RelojSistema();
const REPOSITORIO_INSPECCIONES = Symbol('REPOSITORIO_INSPECCIONES');

@Global()
@Module({
  controllers: [InspeccionesController],
  exports: [FachadaInspecciones],
  providers: [
    {
      provide: REPOSITORIO_INSPECCIONES,
      inject: [PrismaServicio],
      useFactory: (prisma: PrismaServicio): RepositorioInspecciones =>
        new RepositorioInspeccionesPostgres(prisma),
    },
    {
      provide: PERSONAL_INSPECCIONES,
      inject: [FachadaSeguridad],
      useFactory: (seguridad: FachadaSeguridad): PersonalInspecciones =>
        new PersonalFachadaSeguridad(seguridad),
    },
    {
      provide: FachadaInspecciones,
      inject: [REPOSITORIO_INSPECCIONES],
      useFactory: (inspecciones: RepositorioInspecciones) => new FachadaInspecciones(inspecciones),
    },
    {
      provide: CrearInspeccion,
      inject: [REPOSITORIO_INSPECCIONES],
      useFactory: (inspecciones: RepositorioInspecciones) => new CrearInspeccion(inspecciones),
    },
    {
      provide: AsignarInspector,
      inject: [REPOSITORIO_INSPECCIONES, PERSONAL_INSPECCIONES],
      useFactory: (inspecciones: RepositorioInspecciones, personal: PersonalInspecciones) =>
        new AsignarInspector({ inspecciones, personal, reloj }),
    },
    {
      provide: RegistrarResultado,
      inject: [REPOSITORIO_INSPECCIONES, ALMACEN_ARCHIVOS],
      useFactory: (inspecciones: RepositorioInspecciones, almacen: AlmacenArchivos) =>
        new RegistrarResultado({ inspecciones, almacen, ids: new GeneradorIdsCrypto(), reloj }),
    },
    {
      provide: ListarInspecciones,
      inject: [REPOSITORIO_INSPECCIONES, PERSONAL_INSPECCIONES, FachadaTramites],
      useFactory: (
        inspecciones: RepositorioInspecciones,
        personal: PersonalInspecciones,
        tramites: FachadaTramites,
      ) =>
        new ListarInspecciones({
          inspecciones,
          personal,
          expedientes: new ExpedientesFachadaTramites(tramites),
        }),
    },
  ],
})
export class InspeccionesModule implements OnModuleInit {
  constructor(
    private readonly despachador: DespachadorEventos,
    private readonly crearInspeccion: CrearInspeccion,
  ) {}

  onModuleInit(): void {
    this.despachador.registrar(
      'InspeccionRequerida',
      manejadorInspeccionRequerida(this.crearInspeccion),
    );
  }
}
