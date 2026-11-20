import {
  AprobarExpediente,
  ConfirmarRiesgo,
  DenegarExpediente,
  IniciarEvaluacion,
  ObservarExpediente,
} from '../../../../../src/modulos/tramites/aplicacion/decisiones-evaluador';
import {
  ErrorExpedienteNoEncontrado,
  ErrorVersionCambiada,
  ErrorYaObservado,
} from '../../../../../src/modulos/tramites/aplicacion/errores';
import { ErrorValidacionSolicitud } from '../../../../../src/modulos/tramites/dominio/errores';
import { ErrorTransicionInvalida } from '../../../../../src/modulos/tramites/dominio/maquina-estados';
import type {
  CatalogoEvaluacion,
  LicenciaParaEvaluacion,
} from '../../../../../src/modulos/tramites/dominio/puertos/catalogo-evaluacion';
import type {
  Decision,
  ExpedienteParaDecidir,
  RepositorioDecisiones,
} from '../../../../../src/modulos/tramites/dominio/puertos/repositorio-decisiones';
import { RelojFalso, T0 } from '../apoyo/dobles';

// Decisiones del evaluador (CU13 de la 005). Datos FICTICIOS.

const LICENCIAS: Record<string, LicenciaParaEvaluacion> = {
  'LIC-02': {
    codigo: 'LIC-02',
    nombre: 'Licencia – riesgo medio',
    ruta: 'A',
    tasa: '177.10',
    nivelRiesgo: 'MEDIO',
    grupo: 'ESTABLECIMIENTO',
  },
  'LIC-03': {
    codigo: 'LIC-03',
    nombre: 'Licencia – riesgo alto',
    ruta: 'B',
    tasa: '305.90',
    nivelRiesgo: 'ALTO',
    grupo: 'ESTABLECIMIENTO',
  },
  'LIC-07': {
    codigo: 'LIC-07',
    nombre: 'Cesionarios – riesgo alto',
    ruta: 'B',
    tasa: '309.20',
    nivelRiesgo: 'ALTO',
    grupo: 'CESIONARIO',
  },
  'LIC-09': {
    codigo: 'LIC-09',
    nombre: 'Bodegas',
    ruta: 'C',
    tasa: '0.00',
    nivelRiesgo: 'BAJO',
    grupo: 'BODEGA',
  },
};

class CatalogoFalso implements CatalogoEvaluacion {
  obtener(codigo: string) {
    return Promise.resolve(LICENCIAS[codigo] ?? null);
  }
  listar() {
    return Promise.resolve(Object.values(LICENCIAS));
  }
}

/** Repositorio en memoria con la misma regla del UPDATE condicional. */
class DecisionesEnMemoria implements RepositorioDecisiones {
  expediente: ExpedienteParaDecidir | null = {
    id: 'id-1',
    numero: 'EXP-2026-000001',
    estado: 'EN_EVALUACION',
    ruta: 'A',
    codigoReceta: 'LIC-02',
    version: 3,
    yaObservado: false,
  };
  readonly aplicadas: Decision[] = [];
  /** Simula que otro usuario cambió el expediente justo antes de guardar. */
  cambioConcurrente: Partial<ExpedienteParaDecidir> | null = null;

  obtenerParaDecidir() {
    return Promise.resolve(this.expediente);
  }

  aplicar(decision: Decision) {
    if (this.cambioConcurrente && this.expediente) {
      this.expediente = { ...this.expediente, ...this.cambioConcurrente };
      this.cambioConcurrente = null;
    }
    const actual = this.expediente;
    if (
      actual === null ||
      actual.estado !== decision.estadoEsperado ||
      actual.version !== decision.versionEsperada
    ) {
      return Promise.resolve(false);
    }
    this.aplicadas.push(decision);
    this.expediente = {
      ...actual,
      estado: decision.estadoNuevo,
      version: actual.version + 1,
      codigoReceta: decision.cambios?.codigoReceta ?? actual.codigoReceta,
      yaObservado: actual.yaObservado || decision.observacion !== undefined,
    };
    return Promise.resolve(true);
  }
}

describe('Decisiones del evaluador (CU13 de la 005)', () => {
  let decisiones: DecisionesEnMemoria;
  const reloj = new RelojFalso();
  const decisor = { numero: 'EXP-2026-000001', version: 3, usuarioId: 'evaluador-1' };

  beforeEach(() => {
    decisiones = new DecisionesEnMemoria();
  });

  const confirmar = (codigoReceta: string | null = null, comentario: string | null = null) =>
    new ConfirmarRiesgo({ decisiones, reloj }, new CatalogoFalso()).ejecutar({
      ...decisor,
      codigoReceta,
      comentario,
    });

  const ultima = () => decisiones.aplicadas.at(-1);

  describe('IniciarEvaluacion', () => {
    it('REGISTRADO → EN_EVALUACION con el evaluador, historial, auditoría y evento', async () => {
      decisiones.expediente = {
        ...(decisiones.expediente as ExpedienteParaDecidir),
        estado: 'REGISTRADO',
      };

      await new IniciarEvaluacion({ decisiones, reloj }).ejecutar(decisor);

      expect(ultima()).toMatchObject({
        estadoEsperado: 'REGISTRADO',
        estadoNuevo: 'EN_EVALUACION',
        usuarioId: 'evaluador-1',
        auditoria: { accion: 'INICIAR_EVALUACION' },
        cambios: { evaluadorId: 'evaluador-1' },
        eventos: [
          {
            tipo: 'EstadoExpedienteCambiado',
            datos: {
              numeroExpediente: 'EXP-2026-000001',
              estadoAnterior: 'REGISTRADO',
              estadoNuevo: 'EN_EVALUACION',
            },
          },
        ],
        en: T0,
      });
    });

    it('desde EN_EVALUACION es una transición inválida', async () => {
      await expect(
        new IniciarEvaluacion({ decisiones, reloj }).ejecutar(decisor),
      ).rejects.toBeInstanceOf(ErrorTransicionInvalida);
    });
  });

  describe('ConfirmarRiesgo', () => {
    it('con la misma licencia: PENDIENTE_PAGO, niveles y EsquelaSolicitada con la tasa', async () => {
      await confirmar(null, 'Todo en orden');

      expect(ultima()).toMatchObject({
        estadoNuevo: 'PENDIENTE_PAGO',
        comentario: 'Todo en orden',
        auditoria: { accion: 'CONFIRMAR_RIESGO', detalle: { codigoReceta: 'LIC-02' } },
        cambios: {
          codigoReceta: 'LIC-02',
          ruta: 'A',
          nivelRiesgoPropuesto: 'MEDIO',
          nivelRiesgoConfirmado: 'MEDIO',
        },
      });
      expect(ultima()?.eventos).toContainEqual({
        tipo: 'EsquelaSolicitada',
        datos: {
          numeroExpediente: 'EXP-2026-000001',
          codigoReceta: 'LIC-02',
          concepto: 'Licencia – riesgo medio',
          monto: '177.10',
        },
      });
    });

    it('corregida a otra del grupo: toma su ruta y su tasa y audita CORREGIR_RIESGO', async () => {
      await confirmar('LIC-03');

      expect(ultima()).toMatchObject({
        auditoria: {
          accion: 'CORREGIR_RIESGO',
          detalle: { codigoRecetaAnterior: 'LIC-02', codigoRecetaNueva: 'LIC-03' },
        },
        cambios: {
          codigoReceta: 'LIC-03',
          ruta: 'B',
          nivelRiesgoPropuesto: 'MEDIO',
          nivelRiesgoConfirmado: 'ALTO',
        },
      });
      expect(JSON.stringify(ultima()?.eventos)).toContain('305.90');
    });

    it('a otro grupo se rechaza en codigoReceta', async () => {
      await expect(confirmar('LIC-07')).rejects.toBeInstanceOf(ErrorValidacionSolicitud);
      expect(decisiones.aplicadas).toHaveLength(0);
    });

    it('a una licencia que no está vigente se rechaza', async () => {
      await expect(confirmar('LIC-08')).rejects.toBeInstanceOf(ErrorValidacionSolicitud);
    });

    it('con tasa 0.00 pasa a PAGADO sin pedir esquela', async () => {
      decisiones.expediente = {
        ...(decisiones.expediente as ExpedienteParaDecidir),
        codigoReceta: 'LIC-09',
        ruta: 'C',
      };

      await confirmar();

      expect(ultima()).toMatchObject({ estadoNuevo: 'PAGADO', comentario: 'Sin pago: tasa 0.00' });
      expect(ultima()?.eventos.map((evento) => evento.tipo)).toEqual(['EstadoExpedienteCambiado']);
    });

    it('confirmar dos veces: la segunda es una transición inválida', async () => {
      await confirmar();

      await expect(
        new ConfirmarRiesgo({ decisiones, reloj }, new CatalogoFalso()).ejecutar({
          ...decisor,
          version: 4,
          codigoReceta: null,
          comentario: null,
        }),
      ).rejects.toBeInstanceOf(ErrorTransicionInvalida);
      expect(decisiones.aplicadas).toHaveLength(1);
    });

    it('si otro evaluador confirmó justo antes, 409 por estado', async () => {
      decisiones.cambioConcurrente = { estado: 'PENDIENTE_PAGO', version: 4 };

      await expect(confirmar()).rejects.toBeInstanceOf(ErrorTransicionInvalida);
    });

    it('si solo cambió la versión, 412', async () => {
      decisiones.cambioConcurrente = { version: 4 };

      await expect(confirmar()).rejects.toBeInstanceOf(ErrorVersionCambiada);
    });
  });

  describe('ObservarExpediente', () => {
    const observar = (descripcion: string) =>
      new ObservarExpediente({ decisiones, reloj }).ejecutar({
        ...decisor,
        descripcion,
        plazoSubsanarEn: null,
      });

    it('EN_EVALUACION → OBSERVADO con la observación', async () => {
      await observar('  Falta el croquis de ubicación  ');

      expect(ultima()).toMatchObject({
        estadoNuevo: 'OBSERVADO',
        auditoria: { accion: 'OBSERVAR' },
        observacion: { descripcion: 'Falta el croquis de ubicación', plazoSubsanarEn: null },
      });
    });

    it('un texto de menos de 10 caracteres se rechaza', async () => {
      await expect(observar('Falta')).rejects.toBeInstanceOf(ErrorValidacionSolicitud);
    });

    it('un texto de más de 1,000 caracteres se rechaza', async () => {
      await expect(observar('x'.repeat(1001))).rejects.toBeInstanceOf(ErrorValidacionSolicitud);
    });

    it('una segunda observación se rechaza', async () => {
      decisiones.expediente = {
        ...(decisiones.expediente as ExpedienteParaDecidir),
        yaObservado: true,
      };

      await expect(observar('Falta el croquis de ubicación')).rejects.toBeInstanceOf(
        ErrorYaObservado,
      );
    });
  });

  describe('DenegarExpediente', () => {
    it('EN_EVALUACION → DENEGADO con el motivo en el historial', async () => {
      await new DenegarExpediente({ decisiones, reloj }).ejecutar({
        ...decisor,
        motivo: 'El giro no está permitido en la zona',
      });

      expect(ultima()).toMatchObject({
        estadoNuevo: 'DENEGADO',
        comentario: 'El giro no está permitido en la zona',
        auditoria: { accion: 'DENEGAR', detalle: null },
      });
    });
  });

  describe('AprobarExpediente (historia 5)', () => {
    const aprobar = (comentario: string | null = null) =>
      new AprobarExpediente({ decisiones, reloj }).ejecutar({ ...decisor, comentario });
    const conEstado = (estado: ExpedienteParaDecidir['estado'], ruta: 'A' | 'B' | 'C') => {
      decisiones.expediente = {
        ...(decisiones.expediente as ExpedienteParaDecidir),
        estado,
        ruta,
      };
    };

    it.each(['A', 'C'] as const)(
      'PAGADO de ruta %s → APROBADO con auditoría y evento',
      async (ruta) => {
        conEstado('PAGADO', ruta);

        await aprobar();

        expect(ultima()).toMatchObject({
          estadoEsperado: 'PAGADO',
          estadoNuevo: 'APROBADO',
          comentario: 'Expediente aprobado',
          auditoria: { accion: 'APROBAR', detalle: null },
          eventos: [
            {
              tipo: 'EstadoExpedienteCambiado',
              datos: { estadoAnterior: 'PAGADO', estadoNuevo: 'APROBADO' },
            },
            // 006: definitiva en la ruta A, provisional en la C.
            {
              tipo: 'LicenciaSolicitada',
              datos: {
                numeroExpediente: 'EXP-2026-000001',
                tipo: ruta === 'C' ? 'PROVISIONAL' : 'DEFINITIVA',
              },
            },
          ],
        });
      },
    );

    it('guarda el comentario si lo hay', async () => {
      conEstado('PAGADO', 'A');

      await aprobar('  Todo conforme  ');

      expect(ultima()?.comentario).toBe('Todo conforme');
    });

    it('la ruta B (inspección previa) no se aprueba aquí', async () => {
      conEstado('PAGADO', 'B');

      await expect(aprobar()).rejects.toBeInstanceOf(ErrorTransicionInvalida);
    });

    it('un expediente que no está PAGADO no se aprueba', async () => {
      conEstado('PENDIENTE_PAGO', 'A');

      await expect(aprobar()).rejects.toBeInstanceOf(ErrorTransicionInvalida);
    });

    it('un comentario de más de 1000 caracteres es un error de validación', async () => {
      conEstado('PAGADO', 'A');

      await expect(aprobar('x'.repeat(1001))).rejects.toBeInstanceOf(ErrorValidacionSolicitud);
    });
  });

  it('una versión distinta de la leída es 412', async () => {
    await expect(
      new DenegarExpediente({ decisiones, reloj }).ejecutar({
        ...decisor,
        version: 2,
        motivo: 'El giro no está permitido en la zona',
      }),
    ).rejects.toBeInstanceOf(ErrorVersionCambiada);
  });

  it('un expediente que no existe es no encontrado', async () => {
    decisiones.expediente = null;

    await expect(
      new IniciarEvaluacion({ decisiones, reloj }).ejecutar(decisor),
    ).rejects.toBeInstanceOf(ErrorExpedienteNoEncontrado);
  });

  it('si el expediente desaparece al guardar es no encontrado', async () => {
    const repositorio = new DecisionesEnMemoria();
    let lecturas = 0;
    repositorio.obtenerParaDecidir = () => {
      lecturas += 1;
      return Promise.resolve(lecturas === 1 ? repositorio.expediente : null);
    };
    repositorio.aplicar = () => Promise.resolve(false);

    await expect(
      new DenegarExpediente({ decisiones: repositorio, reloj }).ejecutar({
        ...decisor,
        motivo: 'El giro no está permitido en la zona',
      }),
    ).rejects.toBeInstanceOf(ErrorExpedienteNoEncontrado);
  });
});
