import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { CONFIGURACION, type Configuracion } from './compartido/infraestructura/configuracion';
import { configurarAplicacion } from './configurar-aplicacion';

async function arrancar(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  configurarAplicacion(app);

  const configuracion = app.get<Configuracion>(CONFIGURACION);
  await app.listen(configuracion.puertoApi);

  // Solo puerto y versión: nunca URLs de conexión (principio VII).
  new Logger('Arranque').log(
    `API escuchando en el puerto ${String(configuracion.puertoApi)} (versión ${configuracion.versionServicio})`,
  );
}

void arrancar();
