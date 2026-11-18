import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import { CONFIGURACION, type Configuracion } from './compartido/infraestructura/configuracion';
import { FiltroProblema } from './compartido/presentacion/filtro-problema';

/** Configuración común de la aplicación, compartida por `main.ts` y las pruebas de integración. */
export const configurarAplicacion = (app: INestApplication): void => {
  const configuracion = app.get<Configuracion>(CONFIGURACION);

  // IP real del cliente detrás del nginx del portal (y del balanceador en producción) para los
  // límites de intentos por origen (FR-007, research.md §R-08 de la 002).
  (app as NestExpressApplication).set('trust proxy', configuracion.trustProxySaltos);
  // No anunciar el framework (escaneo OWASP ZAP, research.md §R-18 de la 002).
  (app as NestExpressApplication).disable('x-powered-by');
  // Lee la cookie refresh_personal (research.md §R-05 de la 002).
  app.use(cookieParser());

  app.setGlobalPrefix('api/v1');
  app.useGlobalFilters(new FiltroProblema());
  app.enableShutdownHooks();
};
