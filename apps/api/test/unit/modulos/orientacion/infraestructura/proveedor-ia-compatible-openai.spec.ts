import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { ConfiguracionOrientacion } from '../../../../../src/compartido/infraestructura/configuracion';
import type { MensajeProveedor } from '../../../../../src/modulos/orientacion/dominio/puertos';
import { ProveedorIaCompatibleOpenAI } from '../../../../../src/modulos/orientacion/infraestructura/proveedor-ia-compatible-openai';

// research R-05 y contracts/proveedor-ia.md de la 012. Se prueba contra un servidor HTTP LOCAL que
// simula al proveedor: nunca se llama al proveedor real ni se usa la clave real.

const CLAVE_FICTICIA = 'clave-ficticia-de-prueba-012';

interface PeticionRecibida {
  readonly metodo: string | undefined;
  readonly ruta: string | undefined;
  readonly autorizacion: string | undefined;
  readonly cuerpo: Record<string, unknown>;
}

type Manejador = (peticion: IncomingMessage, respuesta: ServerResponse) => void;

let servidor: Server;
let base: string;
let manejador: Manejador;
let recibidas: PeticionRecibida[];

const responderJson =
  (estado: number, cuerpo: unknown): Manejador =>
  (_peticion, respuesta) => {
    respuesta.writeHead(estado, { 'Content-Type': 'application/json' });
    respuesta.end(JSON.stringify(cuerpo));
  };

const completado = (contenido: unknown) => ({
  choices: [{ message: { role: 'assistant', content: contenido } }],
});

beforeAll(async () => {
  servidor = createServer((peticion, respuesta) => {
    let datos = '';
    peticion.on('data', (parte: Buffer) => {
      datos += parte.toString('utf8');
    });
    peticion.on('end', () => {
      recibidas.push({
        metodo: peticion.method,
        ruta: peticion.url,
        autorizacion: peticion.headers.authorization,
        cuerpo: datos ? (JSON.parse(datos) as Record<string, unknown>) : {},
      });
      manejador(peticion, respuesta);
    });
  });
  await new Promise<void>((listo) => servidor.listen(0, '127.0.0.1', listo));
  base = `http://127.0.0.1:${String((servidor.address() as AddressInfo).port)}/v1`;
});

afterAll(async () => {
  servidor.closeAllConnections();
  await new Promise((listo) => servidor.close(listo));
});

beforeEach(() => {
  recibidas = [];
  manejador = responderJson(200, completado('{"tipo":"RESPONDIDA","texto":"Hola"}'));
});

const configuracion = (
  cambios: Partial<ConfiguracionOrientacion> = {},
): ConfiguracionOrientacion => ({
  apiUrl: base,
  modelo: 'modelo-de-prueba',
  apiKey: CLAVE_FICTICIA,
  // Amplio a propósito: con la máquina cargada, una respuesta correcta del servidor local puede tardar
  // más de 200 ms. Solo la prueba de tiempo agotado usa 200 ms.
  tiempoMaximoMs: 5000,
  limitePreguntas: 10,
  formatoJson: true,
  ...cambios,
});

const mensajes: readonly MensajeProveedor[] = [
  { rol: 'system', contenido: 'reglas' },
  { rol: 'user', contenido: '¿Cuánto cuesta?' },
];

const responder = (cambios: Partial<ConfiguracionOrientacion> = {}) =>
  new ProveedorIaCompatibleOpenAI(configuracion(cambios)).responder(mensajes);

describe('ProveedorIaCompatibleOpenAI', () => {
  it('con 200 devuelve OK con el contenido del primer mensaje', async () => {
    await expect(responder()).resolves.toEqual({
      tipo: 'OK',
      contenido: '{"tipo":"RESPONDIDA","texto":"Hola"}',
    });
  });

  it('llama a POST /chat/completions con la clave en Authorization y el cuerpo del contrato', async () => {
    await responder();

    expect(recibidas).toHaveLength(1);
    expect(recibidas[0]).toEqual({
      metodo: 'POST',
      ruta: '/v1/chat/completions',
      autorizacion: `Bearer ${CLAVE_FICTICIA}`,
      cuerpo: {
        model: 'modelo-de-prueba',
        temperature: 0.2,
        max_tokens: 600,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: 'reglas' },
          { role: 'user', content: '¿Cuánto cuesta?' },
        ],
      },
    });
  });

  it('sin formato JSON no envía response_format', async () => {
    await responder({ formatoJson: false });

    expect(recibidas[0]?.cuerpo).not.toHaveProperty('response_format');
  });

  it.each([
    [429, 'CUOTA_AGOTADA'],
    [401, 'CLAVE_INVALIDA'],
    [403, 'CLAVE_INVALIDA'],
    [500, 'FALLA'],
    [503, 'FALLA'],
    [400, 'FALLA'],
  ])('con HTTP %i devuelve %s', async (estado, tipo) => {
    manejador = responderJson(estado, { error: { message: `detalle con ${CLAVE_FICTICIA}` } });

    await expect(responder()).resolves.toEqual({ tipo });
  });

  it('si el proveedor tarda más que el tiempo máximo devuelve TIEMPO_AGOTADO', async () => {
    manejador = (peticion, respuesta) => {
      setTimeout(() => {
        responderJson(200, completado('{}'))(peticion, respuesta);
      }, 3000);
    };

    // Margen amplio: con la máquina cargada (cobertura en paralelo) el corte puede tardar más que
    // los 200 ms, pero nunca los 3 s del proveedor lento.
    const inicio = Date.now();
    await expect(responder({ tiempoMaximoMs: 200 })).resolves.toEqual({
      tipo: 'TIEMPO_AGOTADO',
    });
    expect(Date.now() - inicio).toBeLessThan(2500);
  });

  it('si la conexión se rechaza devuelve FALLA', async () => {
    const cerrado = createServer();
    await new Promise<void>((listo) => cerrado.listen(0, '127.0.0.1', listo));
    const puerto = (cerrado.address() as AddressInfo).port;
    await new Promise((listo) => cerrado.close(listo));

    await expect(responder({ apiUrl: `http://127.0.0.1:${String(puerto)}/v1` })).resolves.toEqual({
      tipo: 'FALLA',
    });
  });

  it.each([
    ['sin choices', {}],
    ['con choices vacío', { choices: [] }],
    ['sin content', { choices: [{ message: {} }] }],
    ['con content vacío', completado('   ')],
    ['con content que no es texto', completado(42)],
  ])('una respuesta 200 %s es RESPUESTA_INVALIDA', async (_caso, cuerpo) => {
    manejador = responderJson(200, cuerpo);

    await expect(responder()).resolves.toEqual({ tipo: 'RESPUESTA_INVALIDA' });
  });

  it('un cuerpo 200 que no es JSON es RESPUESTA_INVALIDA', async () => {
    manejador = (_peticion, respuesta) => {
      respuesta.writeHead(200, { 'Content-Type': 'text/html' });
      respuesta.end('<html>no es json</html>');
    };

    await expect(responder()).resolves.toEqual({ tipo: 'RESPUESTA_INVALIDA' });
  });

  it('sin clave devuelve NO_CONFIGURADO sin hacer ninguna petición', async () => {
    await expect(responder({ apiKey: null })).resolves.toEqual({ tipo: 'NO_CONFIGURADO' });
    expect(recibidas).toHaveLength(0);
  });

  it('ningún resultado ni error contiene la clave', async () => {
    const resultados = [];
    for (const estado of [200, 401, 429, 500]) {
      manejador = responderJson(estado, completado(`eco ${CLAVE_FICTICIA}`));
      resultados.push(await responder());
    }
    const fallidos = resultados.filter((resultado) => resultado.tipo !== 'OK');

    expect(JSON.stringify(fallidos)).not.toContain(CLAVE_FICTICIA);
    expect(String(new ProveedorIaCompatibleOpenAI(configuracion()))).not.toContain(CLAVE_FICTICIA);
    expect(JSON.stringify(new ProveedorIaCompatibleOpenAI(configuracion()))).not.toContain(
      CLAVE_FICTICIA,
    );
  });
});
