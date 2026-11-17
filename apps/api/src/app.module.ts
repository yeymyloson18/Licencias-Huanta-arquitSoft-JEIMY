import { Module } from '@nestjs/common';
import { CompartidoModule } from './compartido/compartido.module';
import { SaludModule } from './operacion/salud/salud.module';

@Module({
  imports: [CompartidoModule, SaludModule],
})
export class AppModule {}
