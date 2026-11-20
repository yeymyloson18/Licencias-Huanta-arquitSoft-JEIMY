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
    expect(estadoRequerido(accion, 'A')).toBe(desde);
  });

  describe('transiciones del sistema por ruta (006)', () => {
    it.each<[AccionExpediente, 'A' | 'B' | 'C', EstadoExpediente, EstadoExpediente]>([
      ['INICIAR_INSPECCION_PREVIA', 'B', 'PAGADO', 'EN_INSPECCION'],
      ['EMITIR_LICENCIA', 'A', 'APROBADO', 'LICENCIA_EMITIDA'],
      ['EMITIR_LICENCIA', 'B', 'EN_INSPECCION', 'LICENCIA_EMITIDA'],
      ['EMITIR_LICENCIA_PROVISIONAL', 'C', 'APROBADO', 'LICENCIA_PROVISIONAL'],
      ['ESPERAR_ITSE_POSTERIOR', 'A', 'LICENCIA_EMITIDA', 'ITSE_POSTERIOR_PENDIENTE'],
      ['FINALIZAR', 'B', 'LICENCIA_EMITIDA', 'FINALIZADO'],
      ['FINALIZAR', 'A', 'ITSE_POSTERIOR_PENDIENTE', 'FINALIZADO'],
      ['DENEGAR_POR_ITSE', 'B', 'EN_INSPECCION', 'DENEGADO'],
      ['DERIVAR_A_FISCALIZACION', 'A', 'ITSE_POSTERIOR_PENDIENTE', 'DERIVADO_A_FISCALIZACION'],
      ['DERIVAR_A_FISCALIZACION', 'C', 'LICENCIA_PROVISIONAL', 'DERIVADO_A_FISCALIZACION'],
    ])('%s en ruta %s: %s → %s', (accion, ruta, desde, hacia) => {
      expect(siguienteEstado(desde, ruta, accion)).toBe(hacia);
      expect(estadoRequerido(accion, ruta)).toBe(desde);
    });

    it.each<[AccionExpediente, 'A' | 'B' | 'C', EstadoExpediente]>([
      ['INICIAR_INSPECCION_PREVIA', 'A', 'PAGADO'],
      ['EMITIR_LICENCIA', 'C', 'APROBADO'],
      ['EMITIR_LICENCIA', 'A', 'EN_INSPECCION'],
      ['EMITIR_LICENCIA_PROVISIONAL', 'A', 'APROBADO'],
      ['FINALIZAR', 'A', 'LICENCIA_EMITIDA'],
      ['FINALIZAR', 'C', 'LICENCIA_PROVISIONAL'],
      ['DENEGAR_POR_ITSE', 'A', 'ITSE_POSTERIOR_PENDIENTE'],
      ['DERIVAR_A_FISCALIZACION', 'B', 'EN_INSPECCION'],
    ])('%s no corresponde en ruta %s desde %s', (accion, ruta, desde) => {
      expect(() => siguienteEstado(desde, ruta, accion)).toThrow(ErrorTransicionInvalida);
    });

    it('una acción sin transición en esa ruta no tiene estado requerido', () => {
      expect(estadoRequerido('INICIAR_INSPECCION_PREVIA', 'A')).toBeNull();
    });

    it('FINALIZADO, DENEGADO y DERIVADO_A_FISCALIZACION son finales', () => {
      const acciones: AccionExpediente[] = [
        'EMITIR_LICENCIA',
        'FINALIZAR',
        'DERIVAR_A_FISCALIZACION',
        'ESPERAR_ITSE_POSTERIOR',
      ];
      for (const estado of ['FINALIZADO', 'DENEGADO', 'DERIVADO_A_FISCALIZACION'] as const) {
        for (const ruta of ['A', 'B', 'C'] as const) {
          for (const accion of acciones) {
            expect(() => siguienteEstado(estado, ruta, accion)).toThrow(ErrorTransicionInvalida);
          }
        }
      }
    });
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
