import { Module } from '@nestjs/common';
import { CompartidoModule } from './compartido/compartido.module';

@Module({
  imports: [CompartidoModule],
})
export class AppModule {}
