import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { crearAplicacionDePrueba } from '../apoyo/aplicacion-prueba';
import {
  conProveedorSimulado,
  ProveedorOrientacionSimulado,
} from '../apoyo/proveedor-orientacion-simulado';
import { esperarCumpleContrato } from '../apoyo/validarContrato';

// Chat de orientación (012): POST /orientacion/preguntas con un proveedor SIMULADO. Nunca se llama al
// proveedor real ni se usa su clave (entorno-pruebas.ts la deja vacía). Usa el catálogo de
// demostración de las migraciones (LIC-01 a LIC-09).

interface RespuestaApi {
  readonly resultado: string;
  readonly texto: string;
  readonly enlaces: { tipo: string; codigoReceta?: string }[];
  readonly aclaracion: string | null;
  readonly datoPersonalQuitado: boolean;
}

describe('POST /orientacion/preguntas (012)', () => {
  let app: INestApplication<App>;
  const proveedor = new ProveedorOrientacionSimulado();

  const preguntar = (cuerpo: unknown) =>
    request(app.getHttpServer())
      .post('/api/v1/orientacion/preguntas')
      .send(cuerpo as object);

  beforeAll(async () => {
    ({ app } = (await crearAplicacionDePrueba({ ajustar: conProveedorSimulado(proveedor) })) as {
      app: INestApplication<App>;
    });
  });

  beforeEach(() => {
    proveedor.reiniciar();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('US1: responde con el catálogo vigente', () => {
    it('responde 200 según el contrato, con no-store, el texto del modelo y la ficha', async () => {
      proveedor.responderCon({
        tipo: 'RESPONDIDA',
        texto: 'La licencia de riesgo medio cuesta S/ 177.10 y demora 2 días hábiles.',
        codigosReceta: ['LIC-02'],
      });

      const respuesta = await preguntar({
        pregunta: '¿Cuánto cuesta la licencia de riesgo medio?',
      });

      expect(respuesta.status).toBe(200);
      await esperarCumpleContrato('post', '/orientacion/preguntas', respuesta);
      expect(respuesta.headers['cache-control']).toBe('no-store');
      expect(respuesta.body).toMatchObject({
        resultado: 'RESPONDIDA',
        texto: 'La licencia de riesgo medio cuesta S/ 177.10 y demora 2 días hábiles.',
        enlaces: [{ tipo: 'FICHA', codigoReceta: 'LIC-02' }],
        datoPersonalQuitado: false,
      });
      expect((respuesta.body as RespuestaApi).aclaracion).toContain('Esta es una orientación');
    });

    it('el proveedor recibió la tasa real de la receta en el CONTEXTO del mensaje de sistema', async () => {
      proveedor.responderCon({ tipo: 'RESPONDIDA', texto: 'Sí.', codigosReceta: [] });

      await preguntar({ pregunta: '¿Cuánto cuesta la licencia de riesgo medio?' }).expect(200);

      const sistema = proveedor.llamadas[0]?.[0];
      expect(sistema?.rol).toBe('system');
      expect(sistema?.contenido).toMatch(/LIC-02 \| [^\n]*riesgo medio[^\n]*S\/ 177\.10/);
      expect(sistema?.contenido).toContain('LIC-09');
    });

    it('un historial de 2 turnos llega al proveedor en orden (FR-013)', async () => {
      proveedor.responderCon({ tipo: 'RESPONDIDA', texto: 'Sí.', codigosReceta: ['LIC-09'] });

      await preguntar({
        pregunta: '¿y cuánto demora?',
        historial: [
          { rol: 'PERSONA', texto: 'Quiero abrir una bodega' },
          { rol: 'ORIENTADOR', texto: 'Le corresponde la licencia provisional para bodegas.' },
        ],
      }).expect(200);

      expect(proveedor.llamadas[0]?.slice(1)).toEqual([
        { rol: 'user', contenido: 'Quiero abrir una bodega' },
        { rol: 'assistant', contenido: 'Le corresponde la licencia provisional para bodegas.' },
        { rol: 'user', contenido: '¿y cuánto demora?' },
      ]);
    });

    it('descarta los códigos que no son licencias vigentes', async () => {
      proveedor.responderCon({
        tipo: 'RESPONDIDA',
        texto: 'Vea la ficha.',
        codigosReceta: ['TRF-01', 'LIC-99', 'LIC-09'],
      });

      const respuesta = await preguntar({ pregunta: 'bodega' }).expect(200);

      expect((respuesta.body as RespuestaApi).enlaces).toEqual([
        { tipo: 'FICHA', codigoReceta: 'LIC-09' },
      ]);
    });
  });

  describe('US2: nunca datos inventados', () => {
    it('una tasa inventada por el modelo nunca llega: SIN_INFORMACION', async () => {
      proveedor.responderCon({
        tipo: 'RESPONDIDA',
        texto: 'La tasa es S/ 999.99.',
        codigosReceta: ['LIC-02'],
      });

      const respuesta = await preguntar({ pregunta: '¿Cuánto cuesta la de riesgo medio?' });

      expect(respuesta.status).toBe(200);
      await esperarCumpleContrato('post', '/orientacion/preguntas', respuesta);
      expect(respuesta.text).not.toContain('999.99');
      expect(respuesta.body).toMatchObject({
        resultado: 'SIN_INFORMACION',
        enlaces: [{ tipo: 'LICENCIAS' }],
        aclaracion: null,
      });
    });
  });

  describe('validación (422)', () => {
    it.each([
      ['sin pregunta', {}],
      ['con la pregunta vacía', { pregunta: '' }],
      ['con la pregunta solo con espacios', { pregunta: '    ' }],
      ['con 501 caracteres', { pregunta: 'a'.repeat(501) }],
      [
        'con un historial de 7 turnos',
        {
          pregunta: '¿Y?',
          historial: Array.from({ length: 7 }, () => ({ rol: 'PERSONA', texto: 'x' })),
        },
      ],
      [
        'con un turno de rol desconocido',
        { pregunta: '¿Y?', historial: [{ rol: 'X', texto: 'x' }] },
      ],
      ['con un campo de más', { pregunta: '¿Y?', usuarioId: 'abc' }],
    ])('responde 422 %s, sin llamar al proveedor ni repetir el texto', async (_caso, cuerpo) => {
      const respuesta = await preguntar(cuerpo);

      expect(respuesta.status).toBe(422);
      await esperarCumpleContrato('post', '/orientacion/preguntas', respuesta);
      expect(respuesta.text).not.toContain('aaaaaaaaaa');
      expect(proveedor.llamadas).toHaveLength(0);
    });
  });
});
