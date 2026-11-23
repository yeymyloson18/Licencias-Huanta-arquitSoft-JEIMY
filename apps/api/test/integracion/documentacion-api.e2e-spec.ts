import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { parse } from 'yaml';
import { CSP_DOCUMENTACION } from '../../src/operacion/documentacion/documentacion';
import { crearAplicacionDePrueba } from '../apoyo/aplicacion-prueba';

// Historia 1 de la 008 con la aplicación completa: /api/docs sirve Swagger UI y el contrato idéntico
// al openapi.yaml; las rutas de la API no reciben la CSP de la documentación. Corre en el job
// `pruebas` del CI.

const CONTRATO = join(__dirname, '..', '..', '..', '..', 'docs', '06-contrato-api', 'openapi.yaml');

describe('Documentación interactiva con la aplicación completa (008)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    ({ app } = (await crearAplicacionDePrueba()) as { app: INestApplication<App> });
  });

  afterAll(async () => {
    await app.close();
  });

  it('/api/docs/ responde 200 con Swagger UI y su CSP', async () => {
    const respuesta = await request(app.getHttpServer()).get('/api/docs/');

    expect(respuesta.status).toBe(200);
    expect(respuesta.text).toContain('swagger-ui-bundle.js');
    expect(respuesta.headers['content-security-policy']).toBe(CSP_DOCUMENTACION);
  });

  it('/api/docs/openapi.json es idéntico al contrato del repositorio', async () => {
    const respuesta = await request(app.getHttpServer()).get('/api/docs/openapi.json');

    expect(respuesta.status).toBe(200);
    expect(respuesta.body).toEqual(parse(readFileSync(CONTRATO, 'utf8')));
  });

  it('las rutas de la API no reciben la CSP de la documentación', async () => {
    const salud = await request(app.getHttpServer()).get('/api/v1/salud');
    const catalogo = await request(app.getHttpServer()).get('/api/v1/catalogo/recetas');

    expect(salud.headers['content-security-policy']).toBeUndefined();
    expect(catalogo.headers['content-security-policy']).toBeUndefined();
    expect(catalogo.headers['cache-control']).toBe('public, max-age=60');
  });
});
