import { readFileSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { dirname, join } from 'node:path';

// Swagger UI en /api/docs y el contrato en /api/docs/openapi.json (008, research §R-01 y §R-03;
// specs/008-cierre-sprint2/contracts/documentacion-api.md). Los archivos de Swagger UI salen de
// `swagger-ui-dist` (una lista cerrada, sin rutas arbitrarias) y la página es propia, sin código en
// línea ni recursos de terceros. Solo estas rutas llevan una CSP ajustada (estilos en línea de
// Swagger UI); el resto del sistema conserva sus cabeceras.

export const RUTA_DOCUMENTACION = '/api/docs';

/** CSP de la documentación: igual a la del portal salvo `style-src 'unsafe-inline'`. */
export const CSP_DOCUMENTACION =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; " +
  "connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; " +
  "frame-ancestors 'none'";

/** Archivos de `swagger-ui-dist` que se sirven, con su tipo. */
const ARCHIVOS_SWAGGER: Readonly<Record<string, string>> = {
  'swagger-ui.css': 'text/css; charset=utf-8',
  'swagger-ui-bundle.js': 'text/javascript; charset=utf-8',
  'swagger-ui-standalone-preset.js': 'text/javascript; charset=utf-8',
  'favicon-32x32.png': 'image/png',
  'favicon-16x16.png': 'image/png',
};

const INDEX_HTML = `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Documentación de la API – Licencias de Funcionamiento de Huanta</title>
    <link rel="icon" type="image/png" href="favicon-32x32.png" />
    <link rel="stylesheet" href="swagger-ui.css" />
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="swagger-ui-bundle.js"></script>
    <script src="swagger-ui-standalone-preset.js"></script>
    <script src="inicializador.js"></script>
  </body>
</html>
`;

/**
 * Configuración de Swagger UI. `validatorUrl: null`: no consulta el validador externo. El token que se
 * pega en "Authorize" no se guarda en el navegador (`persistAuthorization: false`).
 */
const INICIALIZADOR_JS = `window.addEventListener('load', function () {
  window.ui = SwaggerUIBundle({
    url: 'openapi.json',
    dom_id: '#swagger-ui',
    deepLinking: true,
    validatorUrl: null,
    persistAuthorization: false,
    tryItOutEnabled: false,
    presets: [SwaggerUIBundle.presets.apis, SwaggerUIStandalonePreset],
    layout: 'StandaloneLayout',
  });
});
`;

type Manejador = (
  peticion: IncomingMessage,
  respuesta: ServerResponse,
  siguiente: () => void,
) => void;

export interface AplicacionConUse {
  use(ruta: string, manejador: Manejador): unknown;
}

const directorioSwaggerUi = (): string => dirname(require.resolve('swagger-ui-dist/package.json'));

const enviar = (
  respuesta: ServerResponse,
  tipo: string,
  cuerpo: string | Buffer,
  cache: string,
): void => {
  respuesta.statusCode = 200;
  respuesta.setHeader('Content-Type', tipo);
  respuesta.setHeader('Cache-Control', cache);
  respuesta.setHeader('Content-Security-Policy', CSP_DOCUMENTACION);
  respuesta.setHeader('X-Content-Type-Options', 'nosniff');
  respuesta.setHeader('Referrer-Policy', 'no-referrer');
  respuesta.setHeader('X-Frame-Options', 'DENY');
  respuesta.end(cuerpo);
};

/**
 * Crea el manejador de /api/docs. Se monta con `app.use('/api/docs', …)`, que quita ese prefijo de
 * `req.url`. Lo que no reconoce pasa al siguiente (Nest responde 404).
 */
export const crearManejadorDocumentacion = (
  contrato: Readonly<Record<string, unknown>>,
  carpetaSwagger: string = directorioSwaggerUi(),
): Manejador => {
  const contratoJson = JSON.stringify(contrato);
  const archivos = new Map<string, Buffer>();
  const leerArchivo = (nombre: string): Buffer => {
    const guardado = archivos.get(nombre);
    if (guardado !== undefined) {
      return guardado;
    }
    const contenido = readFileSync(join(carpetaSwagger, nombre));
    archivos.set(nombre, contenido);
    return contenido;
  };

  return (peticion, respuesta, siguiente) => {
    if (peticion.method !== 'GET' && peticion.method !== 'HEAD') {
      siguiente();
      return;
    }
    const ruta = (peticion.url ?? '/').split('?')[0] ?? '/';
    // Sin la barra final, las rutas relativas de la página apuntarían a /api/: se redirige.
    const original = (peticion as IncomingMessage & { originalUrl?: string }).originalUrl;
    if (original !== undefined && (original.split('?')[0] ?? '').endsWith(RUTA_DOCUMENTACION)) {
      respuesta.statusCode = 301;
      respuesta.setHeader('Location', `${RUTA_DOCUMENTACION}/`);
      respuesta.end();
      return;
    }
    if (ruta === '/' || ruta === '' || ruta === '/index.html') {
      enviar(respuesta, 'text/html; charset=utf-8', INDEX_HTML, 'no-cache');
      return;
    }
    if (ruta === '/openapi.json') {
      enviar(respuesta, 'application/json; charset=utf-8', contratoJson, 'no-cache');
      return;
    }
    if (ruta === '/inicializador.js') {
      enviar(respuesta, 'text/javascript; charset=utf-8', INICIALIZADOR_JS, 'no-cache');
      return;
    }
    const nombre = ruta.slice(1);
    const tipo = ARCHIVOS_SWAGGER[nombre];
    if (tipo !== undefined) {
      enviar(respuesta, tipo, leerArchivo(nombre), 'public, max-age=86400');
      return;
    }
    siguiente();
  };
};

/** Monta la documentación si está activa; apagada, las rutas no existen (404). */
export const montarDocumentacion = (
  app: AplicacionConUse,
  opciones: {
    readonly activa: boolean;
    readonly contrato: () => Readonly<Record<string, unknown>>;
  },
): boolean => {
  if (!opciones.activa) {
    return false;
  }
  app.use(RUTA_DOCUMENTACION, crearManejadorDocumentacion(opciones.contrato()));
  return true;
};
