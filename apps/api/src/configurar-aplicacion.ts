import type { INestApplication } from '@nestjs/common';
import { FiltroProblema } from './compartido/presentacion/filtro-problema';

/** Configuración común de la aplicación, compartida por `main.ts` y las pruebas de integración. */
export const configurarAplicacion = (app: INestApplication): void => {
  app.setGlobalPrefix('api/v1');
  app.useGlobalFilters(new FiltroProblema());
  app.enableShutdownHooks();
};
