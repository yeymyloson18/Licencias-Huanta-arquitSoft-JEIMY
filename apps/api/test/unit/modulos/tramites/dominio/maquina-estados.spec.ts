import {
  type AccionExpediente,
  ErrorTransicionInvalida,
  estadoRequerido,
  estadoTrasConfirmarRiesgo,
  siguienteEstado,
} from '../../../../../src/modulos/tramites/dominio/maquina-estados';
import {
  ESTADOS_EXPEDIENTE,
  type EstadoExpediente,
} from '../../../../../src/modulos/tramites/dominio/estado-publico';

describe('Máquina de estados del expediente (research §R-03 de la 005)', () => {
  it.each<[AccionExpediente, EstadoExpediente, EstadoExpediente]>([
    ['INICIAR_EVALUACION', 'REGISTRADO', 'EN_EVALUACION'],
    ['CONFIRMAR_RIESGO', 'EN_EVALUACION', 'PENDIENTE_PAGO'],
    ['OBSERVAR', 'EN_EVALUACION', 'OBSERVADO'],
    ['SUBSANAR', 'OBSERVADO', 'EN_EVALUACION'],
    ['DENEGAR', 'EN_EVALUACION', 'DENEGADO'],
    ['REGISTRAR_PAGO', 'PENDIENTE_PAGO', 'PAGADO'],
    ['APROBAR', 'PAGADO', 'APROBADO'],
  ])('%s: %s → %s', (accion, desde, hacia) => {
    expect(siguienteEstado(desde, 'A', accion)).toBe(hacia);
    expect(estadoRequerido(accion)).toBe(desde);
  });

  it('aprobar se permite en las rutas A y C, no en la B', () => {
    expect(siguienteEstado('PAGADO', 'C', 'APROBAR')).toBe('APROBADO');
    expect(() => siguienteEstado('PAGADO', 'B', 'APROBAR')).toThrow(ErrorTransicionInvalida);
  });

  it('una acción desde otro estado se rechaza nombrando el estado actual', () => {
    const error: unknown = (() => {
      try {
        siguienteEstado('REGISTRADO', 'A', 'APROBAR');
      } catch (e) {
        return e;
      }
      return null;
    })();

    expect(error).toBeInstanceOf(ErrorTransicionInvalida);
    expect((error as ErrorTransicionInvalida).estadoActual).toBe('REGISTRADO');
    expect((error as Error).message).toContain('REGISTRADO');
  });

  it('DENEGADO es final: ninguna acción lo mueve', () => {
    const acciones: AccionExpediente[] = [
      'INICIAR_EVALUACION',
      'CONFIRMAR_RIESGO',
      'OBSERVAR',
      'SUBSANAR',
      'DENEGAR',
      'REGISTRAR_PAGO',
      'APROBAR',
    ];
    for (const accion of acciones) {
      expect(() => siguienteEstado('DENEGADO', 'A', accion)).toThrow(ErrorTransicionInvalida);
    }
  });

  it('cada acción tiene un solo estado de origen entre los 13 estados', () => {
    for (const estado of ESTADOS_EXPEDIENTE) {
      const permitidas = (['INICIAR_EVALUACION', 'CONFIRMAR_RIESGO'] as const).filter((accion) => {
        try {
          siguienteEstado(estado, 'A', accion);
          return true;
        } catch {
          return false;
        }
      });
      expect(permitidas.length).toBeLessThanOrEqual(1);
    }
  });

  it('con tasa 0.00 el expediente pasa a PAGADO; con tasa, a PENDIENTE_PAGO', () => {
    expect(estadoTrasConfirmarRiesgo(0)).toBe('PAGADO');
    expect(estadoTrasConfirmarRiesgo(177.1)).toBe('PENDIENTE_PAGO');
  });
});
