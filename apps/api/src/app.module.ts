import { Module } from '@nestjs/common';
import { CompartidoModule } from './compartido/compartido.module';
import { CatalogoModule } from './modulos/catalogo/catalogo.module';
import { SaludModule } from './operacion/salud/salud.module';

@Module({
  imports: [CompartidoModule, SaludModule, CatalogoModule],
})
export class AppModule {}
