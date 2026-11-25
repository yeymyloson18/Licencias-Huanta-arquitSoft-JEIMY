import type { LicenciaVigente } from '../../../../../src/modulos/orientacion/dominio/puertos';
import { seleccionarContexto } from '../../../../../src/modulos/orientacion/dominio/seleccionar-contexto';
import {
  ACLARACION_ORIENTACION,
  armarMensajes,
  LARGO_MAXIMO_RESPUESTA,
  TEXTO_CONSULTA_TRAMITE,
  TEXTO_FUERA_DE_TEMA,
  TEXTO_NO_DISPONIBLE,
  TEXTO_SIN_INFORMACION,
} from '../../../../../src/modulos/orientacion/dominio/mensajes-orientacion';

// Textos fijos de contracts/api-orientacion.md (012). Cuando el resultado no es RESPONDIDA, el
// administrado ve estos textos, nunca el del modelo.

describe('mensajes de orientación', () => {
  it('cada texto fijo dice lo que pide el contrato', () => {
    expect(TEXTO_SIN_INFORMACION).toContain('No tengo esa información');
    expect(TEXTO_SIN_INFORMACION).toContain('Mesa de partes');
    expect(TEXTO_FUERA_DE_TEMA).toContain('Solo puedo ayudarle con licencias de funcionamiento');
    expect(TEXTO_CONSULTA_TRAMITE).toContain("'Consultar mi trámite'");
    expect(TEXTO_NO_DISPONIBLE).toContain("'¿Qué licencia necesito?'");
    expect(ACLARACION_ORIENTACION).toBe(
      'Esta es una orientación. Lo oficial es la ficha de cada licencia y la Municipalidad.',
    );
  });

  it('ningún texto fijo tiene montos ni plazos y todos caben en el largo máximo', () => {
    for (const texto of [
      TEXTO_SIN_INFORMACION,
      TEXTO_FUERA_DE_TEMA,
      TEXTO_CONSULTA_TRAMITE,
      TEXTO_NO_DISPONIBLE,
      ACLARACION_ORIENTACION,
    ]) {
      expect(texto).not.toMatch(/\d/);
      expect(texto.length).toBeLessThanOrEqual(LARGO_MAXIMO_RESPUESTA);
    }
  });
});

describe('armarMensajes (contracts/proveedor-ia.md)', () => {
  const licencia: LicenciaVigente = {
    codigo: 'LIC-01',
    nombre: 'Licencia de prueba',
    ruta: 'A',
    tasa: '159.50',
    plazoDias: 2,
    tipoPlazo: 'HABILES',
    calificacion: 'APROBACION_AUTOMATICA',
    ordenItse: 'POSTERIOR',
    plazoItseDias: 9,
    vigenciaMeses: null,
    requisitos: ['Solicitud'],
  };

  const sistema = (licencias: LicenciaVigente[]) =>
    armarMensajes(
      seleccionarContexto('licencia de prueba', [], licencias, []),
      [],
      'licencia de prueba',
    )[0]?.contenido ?? '';

  it('describe cada licencia en una fila de la tabla del CONTEXTO', () => {
    expect(sistema([licencia])).toContain(
      '- LIC-01 | Licencia de prueba | ruta A | tasa S/ 159.50 | plazo 2 días hábiles | ' +
        'aprobación automática | ITSE posterior, hasta 9 días hábiles | vigencia indeterminada',
    );
  });

  it('cubre plazos en días calendario, sin plazo, sin ITSE, gratuitas y con vigencia', () => {
    const texto = sistema([
      { ...licencia, codigo: 'LIC-02', tipoPlazo: 'CALENDARIO' },
      { ...licencia, codigo: 'LIC-03', plazoDias: null, ordenItse: null },
      {
        ...licencia,
        codigo: 'LIC-09',
        tasa: '0.00',
        calificacion: 'SERVICIO_EXCLUSIVO',
        ordenItse: 'DENTRO_6_MESES',
        plazoItseDias: null,
        vigenciaMeses: 12,
      },
      {
        ...licencia,
        codigo: 'LIC-04',
        calificacion: 'EVALUACION_PREVIA_SILENCIO_POSITIVO',
        ordenItse: 'PREVIA',
      },
    ]);

    expect(texto).toContain('plazo 2 días calendario');
    expect(texto).toMatch(/LIC-03 [^\n]*plazo: ver la ficha[^\n]*sin ITSE/);
    expect(texto).toMatch(
      /LIC-09 [^\n]*S\/ 0\.00 \(gratuita\)[^\n]*servicio prestado en exclusividad \| ITSE dentro de 6 meses \| vigencia 12 meses/,
    );
    expect(texto).toMatch(/LIC-04 [^\n]*evaluación previa con silencio positivo \| ITSE previa/);
  });

  it('agrega los requisitos de las recetas en detalle y los temas elegidos', () => {
    const contexto = seleccionarContexto(
      'licencia de prueba',
      [],
      [licencia],
      [
        {
          id: 'rutas',
          titulo: 'Rutas',
          palabrasClave: ['ruta'],
          respuesta: 'Tres rutas.',
          enlaces: [],
        },
      ],
    );
    const texto = armarMensajes(contexto, [], 'x')[0]?.contenido ?? '';

    expect(texto).toContain('Requisitos de LIC-01 (Licencia de prueba):\n- Solicitud');
    expect(texto).toContain('Tema: Rutas\nTres rutas.');
  });
});
