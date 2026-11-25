import { Module } from '@nestjs/common';
import { CompartidoModule } from './compartido/compartido.module';
import { CatalogoModule } from './modulos/catalogo/catalogo.module';
import { SeguridadModule } from './modulos/seguridad/seguridad.module';
import { InspeccionesModule } from './modulos/inspecciones/inspecciones.module';
import { LicenciasModule } from './modulos/licencias/licencias.module';
import { NotificacionesModule } from './modulos/notificaciones/notificaciones.module';
import { OrientacionModule } from './modulos/orientacion/orientacion.module';
import { PagosModule } from './modulos/pagos/pagos.module';
import { PlazosModule } from './modulos/plazos/plazos.module';
import { ReportesModule } from './modulos/reportes/reportes.module';
import { TramitesModule } from './modulos/tramites/tramites.module';
import { SaludModule } from './operacion/salud/salud.module';

@Module({
  imports: [
    CompartidoModule,
    SeguridadModule,
    SaludModule,
    CatalogoModule,
    TramitesModule,
    PagosModule,
    PlazosModule,
    ReportesModule,
    InspeccionesModule,
    LicenciasModule,
    NotificacionesModule,
    OrientacionModule,
  ],
})
export class AppModule {}
