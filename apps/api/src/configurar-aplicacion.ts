import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import { CONFIGURACION, type Configuracion } from './compartido/infraestructura/configuracion';
import { join } from 'node:path';
import { FiltroProblema } from './compartido/presentacion/filtro-problema';
import {
  ErrorContratoApi,
  leerContratoApi,
  rutasCandidatasDelContrato,
  ubicarContrato,
} from './operacion/documentacion/contrato-api';
import { montarDocumentacion } from './operacion/documentacion/documentacion';

/** Carpeta `apps/api` (igual desde `src/` y desde `dist/`). */
const DIRECTORIO_API = join(__dirname, '..');

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

  // Swagger UI en /api/docs, fuera de /api/v1 (008). Apagada en producción salvo DOCS_API=true.
  montarDocumentacion(app, {
    activa: configuracion.docsApi,
    contrato: () => {
      const ruta =
        configuracion.docsApiContrato ?? ubicarContrato(rutasCandidatasDelContrato(DIRECTORIO_API));
      if (ruta === null) {
        throw new ErrorContratoApi(
          'No se encontró docs/06-contrato-api/openapi.yaml; indique DOCS_API_CONTRATO o DOCS_API=false',
        );
      }
      return leerContratoApi(ruta);
    },
  });

  app.setGlobalPrefix('api/v1');
  app.useGlobalFilters(new FiltroProblema());
  app.enableShutdownHooks();
};
