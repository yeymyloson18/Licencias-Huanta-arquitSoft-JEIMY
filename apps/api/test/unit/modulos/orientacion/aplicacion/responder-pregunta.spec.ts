import { ResponderPregunta } from '../../../../../src/modulos/orientacion/aplicacion/responder-pregunta';
import { ErrorPreguntaInvalida } from '../../../../../src/modulos/orientacion/dominio/pregunta-orientacion';
import type {
  FuenteCatalogo,
  LicenciaVigente,
  MensajeProveedor,
  ProveedorOrientacion,
  ResultadoProveedor,
} from '../../../../../src/modulos/orientacion/dominio/puertos';
import { MARCA_DATO_PERSONAL } from '../../../../../src/modulos/orientacion/dominio/quitar-datos-personales';
import {
  ACLARACION_ORIENTACION,
  TEXTO_CONSULTA_TRAMITE,
  TEXTO_SIN_INFORMACION,
} from '../../../../../src/modulos/orientacion/dominio/mensajes-orientacion';
import { LICENCIAS, TEMAS } from '../dominio/licencias-de-prueba';

// ResponderPregunta (012, research R-04 a R-07), con dobles de los puertos: nunca el proveedor real.

class ProveedorDoble implements ProveedorOrientacion {
  readonly llamadas: (readonly MensajeProveedor[])[] = [];
  resultado: ResultadoProveedor = { tipo: 'OK', contenido: '{}' };

  responder(mensajes: readonly MensajeProveedor[]): Promise<ResultadoProveedor> {
    this.llamadas.push(mensajes);
    return Promise.resolve(this.resultado);
  }

  modelo(respuesta: Record<string, unknown>): this {
    this.resultado = { tipo: 'OK', contenido: JSON.stringify(respuesta) };
    return this;
  }

  /** Todo el texto enviado en la última llamada. */
  texto(): string {
    return (this.llamadas.at(-1) ?? []).map((mensaje) => mensaje.contenido).join('\n');
  }
}

const preparar = (licencias: readonly LicenciaVigente[] = LICENCIAS) => {
  const proveedor = new ProveedorDoble();
  const catalogo: FuenteCatalogo = { licenciasVigentes: () => Promise.resolve(licencias) };
  let ahora = 1_000;
  const caso = new ResponderPregunta({
    catalogo,
    guia: { temas: () => TEMAS },
    proveedor,
    reloj: {
      ahora: () => {
        ahora += 250;
        return ahora;
      },
    },
  });
  const preguntar = (pregunta: string, historial: { rol: string; texto: string }[] = []) =>
    caso.ejecutar({ pregunta, historial });
  return { proveedor, preguntar };
};

describe('ResponderPregunta: camino principal (US1)', () => {
  it('envía las reglas, el CONTEXTO entre delimitadores y la conversación en orden', async () => {
    const { proveedor, preguntar } = preparar();
    proveedor.modelo({ tipo: 'RESPONDIDA', texto: 'Sí.', codigosReceta: [] });

    await preguntar('¿Cuánto cuesta la de bodega?', [
      { rol: 'PERSONA', texto: 'Hola' },
      { rol: 'ORIENTADOR', texto: 'Hola, ¿en qué le ayudo?' },
    ]);

    const mensajes = proveedor.llamadas[0] ?? [];
    expect(mensajes.map((mensaje) => mensaje.rol)).toEqual(['system', 'user', 'assistant', 'user']);
    const sistema = mensajes[0]?.contenido ?? '';
    expect(sistema).toContain('Usa SOLO el CONTEXTO');
    expect(sistema).toContain('SIN_INFORMACION');
    expect(sistema).toContain('FUERA_DE_TEMA');
    expect(sistema).toContain('CONSULTA_TRAMITE');
    expect(sistema).toMatch(/<<<CONTEXTO[\s\S]*LIC-09[\s\S]*CONTEXTO>>>/);
    expect(sistema).toContain('S/ 0.00');
    expect(mensajes.at(-1)?.contenido).toBe('¿Cuánto cuesta la de bodega?');
    // La pregunta nunca se mezcla con el CONTEXTO.
    expect(sistema).not.toContain('¿Cuánto cuesta la de bodega?');
  });

  it('la pregunta y el historial salen hacia el proveedor ya sin datos personales', async () => {
    const { proveedor, preguntar } = preparar();
    proveedor.modelo({ tipo: 'CONSULTA_TRAMITE', texto: 'x' });

    const salida = await preguntar('mi DNI es 40000001, ¿cómo va?', [
      { rol: 'PERSONA', texto: 'mi cel es 987654321' },
    ]);

    expect(proveedor.texto()).not.toMatch(/40000001|987654321/);
    expect(proveedor.texto()).toContain(MARCA_DATO_PERSONAL);
    expect(salida.respuesta.datoPersonalQuitado).toBe(true);
  });

  it('RESPONDIDA con un código vigente → texto del modelo y enlace FICHA', async () => {
    const { proveedor, preguntar } = preparar();
    proveedor.modelo({
      tipo: 'RESPONDIDA',
      texto: 'La de riesgo medio cuesta S/ 177.10.',
      codigosReceta: ['LIC-02'],
    });

    const salida = await preguntar('¿Cuánto cuesta la de riesgo medio?');

    expect(salida.respuesta).toEqual({
      resultado: 'RESPONDIDA',
      texto: 'La de riesgo medio cuesta S/ 177.10.',
      enlaces: [{ tipo: 'FICHA', codigoReceta: 'LIC-02' }],
      aclaracion: expect.stringContaining('Esta es una orientación') as unknown,
      datoPersonalQuitado: false,
    });
    expect(salida.desenlace).toBe('RESPONDIDA');
    expect(salida.duracionMs).toBe(250);
  });

  it('descarta los códigos que no son licencias vigentes y no repite enlaces', async () => {
    const { proveedor, preguntar } = preparar();
    proveedor.modelo({
      tipo: 'RESPONDIDA',
      texto: 'Vea estas.',
      codigosReceta: ['LIC-02', 'TRF-01', 'LIC-99', 'LIC-02', 'LIC-03'],
    });

    const salida = await preguntar('¿cuáles hay?');

    expect(salida.respuesta.enlaces).toEqual([
      { tipo: 'FICHA', codigoReceta: 'LIC-02' },
      { tipo: 'FICHA', codigoReceta: 'LIC-03' },
    ]);
  });

  it('sin códigos ni tema que coincida → enlace ASISTENTE', async () => {
    const { proveedor, preguntar } = preparar();
    proveedor.modelo({ tipo: 'RESPONDIDA', texto: 'Use el asistente.', codigosReceta: [] });

    expect((await preguntar('hola, buenas tardes')).respuesta.enlaces).toEqual([
      { tipo: 'ASISTENTE' },
    ]);
  });

  it('sin códigos, con un tema que coincide → los enlaces de ese tema', async () => {
    const { proveedor, preguntar } = preparar();
    proveedor.modelo({ tipo: 'RESPONDIDA', texto: 'En caja.' });

    expect((await preguntar('¿Cómo pago?')).respuesta.enlaces).toEqual([{ tipo: 'CONSULTA' }]);
  });

  it('con un catálogo cambiado, el CONTEXTO lleva la tasa nueva (FR-012)', async () => {
    const cambiado = LICENCIAS.map((licencia) =>
      licencia.codigo === 'LIC-02' ? { ...licencia, tasa: '199.00' } : licencia,
    );
    const { proveedor, preguntar } = preparar(cambiado);
    proveedor.modelo({ tipo: 'RESPONDIDA', texto: 'x' });

    await preguntar('¿cuánto cuesta la de riesgo medio?');

    expect(proveedor.texto()).toContain('S/ 199.00');
    expect(proveedor.texto()).not.toContain('S/ 177.10');
  });

  it('una respuesta del modelo que no es válida → NO_DISPONIBLE (RESPUESTA_INVALIDA)', async () => {
    const { proveedor, preguntar } = preparar();
    proveedor.resultado = { tipo: 'OK', contenido: 'no es json' };

    const salida = await preguntar('¿cómo pago?');

    expect(salida.respuesta.resultado).toBe('NO_DISPONIBLE');
    expect(salida.desenlace).toBe('RESPUESTA_INVALIDA');
  });

  it('una falla del proveedor → NO_DISPONIBLE con el desenlace de la falla', async () => {
    const { proveedor, preguntar } = preparar();
    proveedor.resultado = { tipo: 'TIEMPO_AGOTADO' };

    const salida = await preguntar('¿cómo pago?');

    expect(salida.respuesta).toMatchObject({
      resultado: 'NO_DISPONIBLE',
      enlaces: [{ tipo: 'ASISTENTE' }, { tipo: 'LICENCIAS' }],
      aclaracion: null,
    });
    expect(salida.desenlace).toBe('TIEMPO_AGOTADO');
  });

  it('una pregunta inválida lanza ErrorPreguntaInvalida y no llama al proveedor', async () => {
    const { proveedor, preguntar } = preparar();

    await expect(preguntar('   ')).rejects.toBeInstanceOf(ErrorPreguntaInvalida);
    expect(proveedor.llamadas).toHaveLength(0);
  });
});

describe('ResponderPregunta: nunca datos inventados (US2)', () => {
  it('una cifra que no está en el CONTEXTO → SIN_INFORMACION con el texto fijo (RECHAZADA_POR_REVISION)', async () => {
    const { proveedor, preguntar } = preparar();
    proveedor.modelo({
      tipo: 'RESPONDIDA',
      texto: 'La de riesgo medio cuesta S/ 999.99 y demora 30 días.',
      codigosReceta: ['LIC-02'],
    });

    const salida = await preguntar('¿Cuánto cuesta la de riesgo medio?');

    expect(salida.respuesta).toEqual({
      resultado: 'SIN_INFORMACION',
      texto: TEXTO_SIN_INFORMACION,
      enlaces: [{ tipo: 'LICENCIAS' }],
      aclaracion: null,
      datoPersonalQuitado: false,
    });
    expect(salida.desenlace).toBe('RECHAZADA_POR_REVISION');
    expect(JSON.stringify(salida)).not.toContain('999.99');
  });

  it('las cifras del catálogo pasan la revisión (también las de otras licencias de la tabla)', async () => {
    const { proveedor, preguntar } = preparar();
    proveedor.modelo({
      tipo: 'RESPONDIDA',
      texto: 'La de riesgo medio cuesta S/ 177.10; la de riesgo alto, S/ 305.90 y 8 días hábiles.',
      codigosReceta: ['LIC-02', 'LIC-03'],
    });

    const salida = await preguntar('¿Cuál es más barata, la de riesgo medio o la de riesgo alto?');

    expect(salida.respuesta.resultado).toBe('RESPONDIDA');
    expect(salida.desenlace).toBe('RESPONDIDA');
  });

  it('SIN_INFORMACION del modelo → el texto fijo del sistema, no el del modelo', async () => {
    const { proveedor, preguntar } = preparar();
    proveedor.modelo({ tipo: 'SIN_INFORMACION', texto: 'Creo que cuesta S/ 50, no estoy seguro.' });

    const salida = await preguntar('¿Cuánto cuesta un permiso de anuncios?');

    expect(salida.respuesta.texto).toBe(TEXTO_SIN_INFORMACION);
    expect(salida.respuesta.enlaces).toEqual([{ tipo: 'LICENCIAS' }]);
    expect(salida.desenlace).toBe('SIN_INFORMACION');
  });

  it.each([
    ['SIN_INFORMACION', { tipo: 'SIN_INFORMACION', texto: 'x' }],
    ['FUERA_DE_TEMA', { tipo: 'FUERA_DE_TEMA', texto: 'x' }],
    ['CONSULTA_TRAMITE', { tipo: 'CONSULTA_TRAMITE', texto: 'x' }],
  ])('la aclaración (FR-008) es null con %s', async (_tipo, modelo) => {
    const { proveedor, preguntar } = preparar();
    proveedor.modelo(modelo);

    expect((await preguntar('hola')).respuesta.aclaracion).toBeNull();
  });

  it('la aclaración acompaña a toda respuesta RESPONDIDA', async () => {
    const { proveedor, preguntar } = preparar();
    proveedor.modelo({ tipo: 'RESPONDIDA', texto: 'En caja.' });

    expect((await preguntar('¿Cómo pago?')).respuesta.aclaracion).toBe(ACLARACION_ORIENTACION);
  });

  describe('trámites que no se atienden en este sistema (I2 del análisis)', () => {
    it('la pregunta lleva al CONTEXTO el tema de trámites no atendidos', async () => {
      const { proveedor, preguntar } = preparar();
      proveedor.modelo({ tipo: 'RESPONDIDA', texto: 'x' });

      await preguntar('¿Cómo hago la transferencia de mi licencia?');

      expect(proveedor.texto()).toContain('Tema: tramites-no-atendidos');
    });

    it('si el modelo lo responde con el texto del tema (sin cifras), se muestra con LICENCIAS', async () => {
      const { proveedor, preguntar } = preparar();
      proveedor.modelo({
        tipo: 'RESPONDIDA',
        texto: 'La transferencia no se atiende en este sistema. Consulte en Mesa de partes.',
      });

      const salida = await preguntar('¿Cómo hago la transferencia de mi licencia?');

      expect(salida.respuesta).toMatchObject({
        resultado: 'RESPONDIDA',
        texto: 'La transferencia no se atiende en este sistema. Consulte en Mesa de partes.',
        enlaces: [{ tipo: 'LICENCIAS' }],
      });
    });

    it('si el modelo responde SIN_INFORMACION, se usa el texto fijo', async () => {
      const { proveedor, preguntar } = preparar();
      proveedor.modelo({ tipo: 'SIN_INFORMACION', texto: 'x' });

      expect((await preguntar('¿Cómo hago la transferencia de mi licencia?')).respuesta.texto).toBe(
        TEXTO_SIN_INFORMACION,
      );
    });
  });
});

describe('ResponderPregunta: los datos personales no salen (US3)', () => {
  it('CONSULTA_TRAMITE → texto fijo y enlace CONSULTA', async () => {
    const { proveedor, preguntar } = preparar();
    proveedor.modelo({ tipo: 'CONSULTA_TRAMITE', texto: 'Su expediente está en evaluación.' });

    const salida = await preguntar('¿cómo va mi expediente?');

    expect(salida.respuesta).toEqual({
      resultado: 'CONSULTA_TRAMITE',
      texto: TEXTO_CONSULTA_TRAMITE,
      enlaces: [{ tipo: 'CONSULTA' }],
      aclaracion: null,
      datoPersonalQuitado: false,
    });
    expect(salida.desenlace).toBe('CONSULTA_TRAMITE');
  });

  it('un número de expediente no es un dato personal: llega al proveedor tal cual', async () => {
    const { proveedor, preguntar } = preparar();
    proveedor.modelo({ tipo: 'CONSULTA_TRAMITE', texto: 'x' });

    const salida = await preguntar('¿cómo va el EXP-2026-000123?');

    expect(proveedor.texto()).toContain('EXP-2026-000123');
    expect(salida.respuesta.datoPersonalQuitado).toBe(false);
    // El caso de uso no tiene ningún puerto de trámites: nunca trae datos de un expediente.
    expect(salida.respuesta.texto).toBe(TEXTO_CONSULTA_TRAMITE);
  });

  it('avisa que quitó un dato aunque esté solo en el historial', async () => {
    const { proveedor, preguntar } = preparar();
    proveedor.modelo({ tipo: 'RESPONDIDA', texto: 'En caja.' });

    const salida = await preguntar('¿Cómo pago?', [
      { rol: 'PERSONA', texto: 'escríbanme a ana.perez@correo.pe' },
    ]);

    expect(salida.respuesta.datoPersonalQuitado).toBe(true);
    expect(proveedor.texto()).not.toContain('ana.perez@correo.pe');
  });

  it('sin datos personales, datoPersonalQuitado es false', async () => {
    const { proveedor, preguntar } = preparar();
    proveedor.modelo({ tipo: 'RESPONDIDA', texto: 'En caja.' });

    expect((await preguntar('¿Cómo pago?')).respuesta.datoPersonalQuitado).toBe(false);
  });
});
