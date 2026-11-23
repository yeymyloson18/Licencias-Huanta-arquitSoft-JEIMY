import { readFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { join } from 'node:path';
import request from 'supertest';
import { parse } from 'yaml';
import {
  ErrorContratoApi,
  leerContratoApi,
  rutasCandidatasDelContrato,
  ubicarContrato,
} from '../../../../src/operacion/documentacion/contrato-api';
import {
  CSP_DOCUMENTACION,
  montarDocumentacion,
  RUTA_DOCUMENTACION,
} from '../../../../src/operacion/documentacion/documentacion';

// Documentación interactiva (008): sin base de datos ni Redis. Un servidor HTTP mínimo imita el
// `app.use(ruta, manejador)` de Express (quita el prefijo y conserva `originalUrl`).

const RAIZ_API = join(__dirname, '..', '..', '..', '..');
const CONTRATO = join(RAIZ_API, '..', '..', 'docs', '06-contrato-api', 'openapi.yaml');

type Manejador = (
  peticion: IncomingMessage,
  respuesta: ServerResponse,
  siguiente: () => void,
) => void;

const servidorCon = (activa: boolean) => {
  const montados: [string, Manejador][] = [];
  montarDocumentacion(
    { use: (ruta, manejador) => montados.push([ruta, manejador]) },
    { activa, contrato: () => leerContratoApi(CONTRATO) },
  );
  return createServer((peticion, respuesta) => {
    const noEncontrado = () => {
      respuesta.statusCode = 404;
      respuesta.end('{}');
    };
    const url = peticion.url ?? '/';
    const montado = montados.find(([ruta]) => url === ruta || url.startsWith(`${ruta}/`));
    if (montado === undefined) {
      noEncontrado();
      return;
    }
    const [ruta, manejador] = montado;
    Object.assign(peticion, { originalUrl: url, url: url.slice(ruta.length) || '/' });
    manejador(peticion, respuesta, noEncontrado);
  });
};

describe('Contrato para la documentación (008)', () => {
  it('lee el openapi.yaml del repositorio como objeto', () => {
    const contrato = leerContratoApi(CONTRATO);

    expect(contrato).toEqual(parse(readFileSync(CONTRATO, 'utf8')));
    expect(contrato).toHaveProperty('openapi');
  });

  it('un archivo que no existe o que no es OpenAPI da un error claro', () => {
    expect(() => leerContratoApi('/no/existe.yaml')).toThrow(ErrorContratoApi);
    expect(() => leerContratoApi('x', () => '- una\n- lista\n')).toThrow(
      'no es un documento OpenAPI',
    );
    expect(() => leerContratoApi('x', () => 'openapi: 3.1.0\n')).toThrow(ErrorContratoApi);
  });

  it('busca el contrato en la imagen y luego en el repositorio', () => {
    const candidatas = rutasCandidatasDelContrato(RAIZ_API);

    expect(candidatas[0]).toBe(join(RAIZ_API, 'contrato', 'openapi.yaml'));
    expect(ubicarContrato(candidatas)).toBe(CONTRATO);
    expect(ubicarContrato(candidatas, () => false)).toBeNull();
  });
});

describe('Swagger UI en /api/docs (008)', () => {
  it('sirve la página con su CSP y redirige sin la barra final', async () => {
    const servidor = servidorCon(true);

    const pagina = await request(servidor).get(`${RUTA_DOCUMENTACION}/`);
    const sinBarra = await request(servidor).get(RUTA_DOCUMENTACION);

    expect(pagina.status).toBe(200);
    expect(pagina.headers['content-type']).toContain('text/html');
    expect(pagina.headers['content-security-policy']).toBe(CSP_DOCUMENTACION);
    expect(pagina.text).toContain('swagger-ui-bundle.js');
    expect(pagina.text).not.toMatch(/<script>|<style>|https?:\/\//);
    expect(sinBarra.status).toBe(301);
    expect(sinBarra.headers.location).toBe(`${RUTA_DOCUMENTACION}/`);
  });

  it('el contrato servido es idéntico al openapi.yaml y empieza por el servidor del mismo origen', async () => {
    const respuesta = await request(servidorCon(true)).get(`${RUTA_DOCUMENTACION}/openapi.json`);

    expect(respuesta.status).toBe(200);
    expect(respuesta.body).toEqual(parse(readFileSync(CONTRATO, 'utf8')));
    expect((respuesta.body as { servers: { url: string }[] }).servers[0]?.url).toBe('/api/v1');
  });

  it('sirve los archivos de Swagger UI de la lista y el inicializador sin validador externo', async () => {
    const servidor = servidorCon(true);

    const css = await request(servidor).get(`${RUTA_DOCUMENTACION}/swagger-ui.css`);
    const inicializador = await request(servidor).get(`${RUTA_DOCUMENTACION}/inicializador.js`);
    const fuera = await request(servidor).get(`${RUTA_DOCUMENTACION}/../package.json`);
    const otro = await request(servidor).get(`${RUTA_DOCUMENTACION}/package.json`);
    const metodo = await request(servidor).post(`${RUTA_DOCUMENTACION}/openapi.json`);

    expect(css.status).toBe(200);
    expect(css.headers['cache-control']).toBe('public, max-age=86400');
    expect(inicializador.text).toContain('validatorUrl: null');
    expect(inicializador.text).toContain('persistAuthorization: false');
    expect(fuera.status).toBe(404);
    expect(otro.status).toBe(404);
    expect(metodo.status).toBe(404);
  });

  it('apagada, ninguna ruta de la documentación existe', async () => {
    const servidor = servidorCon(false);

    expect((await request(servidor).get(`${RUTA_DOCUMENTACION}/`)).status).toBe(404);
    expect((await request(servidor).get(`${RUTA_DOCUMENTACION}/openapi.json`)).status).toBe(404);
  });

  it('la CSP de la documentación solo agrega estilos en línea a la del portal', () => {
    const portal = /Content-Security-Policy "([^"]+)"/.exec(
      readFileSync(join(RAIZ_API, '..', 'web', 'cabeceras-seguridad.conf'), 'utf8'),
    )?.[1];

    expect(CSP_DOCUMENTACION.replace(" 'unsafe-inline'", '').split('; ').sort()).toEqual(
      (portal ?? '').split('; ').sort(),
    );
  });
});
