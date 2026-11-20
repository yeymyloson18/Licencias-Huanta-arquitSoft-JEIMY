import { Module } from '@nestjs/common';
import { CompartidoModule } from './compartido/compartido.module';
import { CatalogoModule } from './modulos/catalogo/catalogo.module';
import { SeguridadModule } from './modulos/seguridad/seguridad.module';
import { PagosModule } from './modulos/pagos/pagos.module';
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
  ],
})
export class AppModule {}
