import { esperarCumpleContrato } from '../../apoyo/validarContrato';

const json = { 'content-type': 'application/json; charset=utf-8' };

describe('esperarCumpleContrato', () => {
  it('acepta un cuerpo Salud válido', async () => {
    await expect(
      esperarCumpleContrato('get', '/salud', {
        status: 200,
        headers: json,
        body: { estado: 'OK', baseDeDatos: 'OK', cache: 'OK', version: '1.0.0' },
      }),
    ).resolves.toBeUndefined();
  });

  it('rechaza un cuerpo Salud con un valor fuera del enum', async () => {
    await expect(
      esperarCumpleContrato('get', '/salud', {
        status: 503,
        headers: json,
        body: { estado: 'ROTO', baseDeDatos: 'CAIDO', cache: 'OK' },
      }),
    ).rejects.toThrow(/no cumple el contrato/);
  });

  it('rechaza un cuerpo Salud sin un campo obligatorio', async () => {
    await expect(
      esperarCumpleContrato('get', '/salud', {
        status: 200,
        headers: json,
        body: { estado: 'OK', baseDeDatos: 'OK' },
      }),
    ).rejects.toThrow(/cache/);
  });

  it('rechaza un código de estado no declarado', async () => {
    await expect(
      esperarCumpleContrato('get', '/salud', { status: 500, headers: json, body: {} }),
    ).rejects.toThrow(/no declara la respuesta 500/);
  });

  it('rechaza un tipo de contenido no declarado', async () => {
    await expect(
      esperarCumpleContrato('get', '/salud', {
        status: 200,
        headers: { 'content-type': 'text/html' },
        body: '<html></html>',
      }),
    ).rejects.toThrow(/Tipo de contenido/);
  });

  it('resuelve respuestas definidas por $ref (422 del catálogo con Problema)', async () => {
    await expect(
      esperarCumpleContrato('get', '/catalogo/recetas', {
        status: 422,
        headers: { 'content-type': 'application/problem+json' },
        body: {
          type: 'https://licencias.example.pe/errores/validacion',
          title: 'Los datos no cumplen las reglas de validación',
          status: 422,
          errores: [{ campo: 'tipo', mensaje: 'Debe ser LICENCIA o TRAMITE_CONECTADO' }],
        },
      }),
    ).resolves.toBeUndefined();
  });

  it('valida tipos con null de OpenAPI 3.1 (RecetaResumen)', async () => {
    const receta = {
      codigo: 'TRF-01',
      nombre: 'Transferencia',
      tipo: 'TRAMITE_CONECTADO',
      tasa: '45.10',
    };

    await expect(
      esperarCumpleContrato('get', '/catalogo/recetas', {
        status: 200,
        headers: json,
        body: [{ ...receta, ruta: null, plazoDias: null }],
      }),
    ).resolves.toBeUndefined();
    await expect(
      esperarCumpleContrato('get', '/catalogo/recetas', {
        status: 200,
        headers: json,
        body: [{ ...receta, tasa: 45.1 }],
      }),
    ).rejects.toThrow(/no cumple el contrato/);
  });

  it('rechaza una operación que no existe en el contrato', async () => {
    await expect(
      esperarCumpleContrato('get', '/no-existe', { status: 200, headers: json, body: {} }),
    ).rejects.toThrow(/no define GET \/no-existe/);
  });
});
