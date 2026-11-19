import {
  ESTADOS_EXPEDIENTE,
  esEstadoExpediente,
  TEXTO_ESTADO_PUBLICO,
} from '../../../../../src/modulos/tramites/dominio/estado-publico';

describe('Estado del expediente en lenguaje sencillo (FR-030 de la 004)', () => {
  it('tiene los 13 estados del contrato', () => {
    expect(ESTADOS_EXPEDIENTE).toHaveLength(13);
  });

  it.each(ESTADOS_EXPEDIENTE)('el estado %s tiene descripción y siguiente paso', (estado) => {
    expect(TEXTO_ESTADO_PUBLICO[estado].descripcion.length).toBeGreaterThan(0);
    expect(TEXTO_ESTADO_PUBLICO[estado].siguientePaso.length).toBeGreaterThan(0);
  });

  it('REGISTRADO dice que la solicitud espera evaluación', () => {
    expect(TEXTO_ESTADO_PUBLICO.REGISTRADO.descripcion).toBe(
      'Tu solicitud fue registrada y espera evaluación',
    );
  });

  it('reconoce los estados válidos', () => {
    expect(esEstadoExpediente('REGISTRADO')).toBe(true);
    expect(esEstadoExpediente('INVENTADO')).toBe(false);
  });
});
