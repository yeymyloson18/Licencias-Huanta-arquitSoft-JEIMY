import { AplicarPagoRegistrado } from '../../../../../src/modulos/tramites/aplicacion/aplicar-pago-registrado';
import { CompletarVencimientos } from '../../../../../src/modulos/tramites/aplicacion/completar-vencimientos';
import { ObservarExpediente } from '../../../../../src/modulos/tramites/aplicacion/decisiones-evaluador';
import {
  reanudarPlazo,
  suspenderPlazo,
} from '../../../../../src/modulos/tramites/aplicacion/plazo-expediente';
import type { PlazosHabiles } from '../../../../../src/modulos/tramites/dominio/puertos/plazos-habiles';
import type { ExpedienteSinVencimiento } from '../../../../../src/modulos/tramites/dominio/puertos/repositorio-vencimientos';
import { DecisionesEnMemoria } from '../apoyo/decisiones-en-memoria';
import { RelojFalso } from '../apoyo/dobles';

// Plazos simulados: cada día de calendario es hábil (los fines de semana y feriados son de Plazos).
const plazos: PlazosHabiles = {
  sumarDiasHabiles: (desde, dias) => {
    const fecha = new Date(`${desde}T00:00:00Z`);
    fecha.setUTCDate(fecha.getUTCDate() + dias);
    return Promise.resolve(fecha.toISOString().slice(0, 10));
  },
  diasHabilesRestantes: (hoy, vence) =>
    Promise.resolve(
      Math.round((Date.parse(`${vence}T00:00:00Z`) - Date.parse(`${hoy}T00:00:00Z`)) / 86_400_000),
    ),
};

// RelojFalso arranca el 2026-11-19 (Lima).
describe('Plazo del expediente en días hábiles (FR-026 a FR-027a de la 006)', () => {
  it('suspender guarda los días que quedaban (0 si ya venció) y vacía el vencimiento', async () => {
    expect(await suspenderPlazo(plazos, '2026-11-22', '2026-11-19')).toEqual({
      vencePlazoEn: null,
      plazoRestanteDias: 3,
    });
    expect(await suspenderPlazo(plazos, '2026-11-17', '2026-11-19')).toEqual({
      vencePlazoEn: null,
      plazoRestanteDias: 0,
    });
    expect(await suspenderPlazo(plazos, null, '2026-11-19')).toEqual({});
    expect(await suspenderPlazo(undefined, '2026-11-22', '2026-11-19')).toEqual({});
  });

  it('reanudar vence tantos días hábiles después de hoy como quedaban', async () => {
    expect(await reanudarPlazo(plazos, 3, '2026-11-25')).toEqual({
      vencePlazoEn: '2026-11-28',
      plazoRestanteDias: null,
    });
    expect(await reanudarPlazo(plazos, null, '2026-11-25')).toEqual({});
    expect(await reanudarPlazo(undefined, 3, '2026-11-25')).toEqual({});
  });

  it('observar fija 2 días hábiles para subsanar y suspende el plazo', async () => {
    const decisiones = new DecisionesEnMemoria({
      estado: 'EN_EVALUACION',
      vencePlazoEn: '2026-11-21',
    });

    await new ObservarExpediente({ decisiones, reloj: new RelojFalso(), plazos }).ejecutar({
      numero: 'EXP-2026-000001',
      version: 5,
      usuarioId: 'evaluador-1',
      descripcion: 'Falta el croquis de ubicación',
      plazoSubsanarEn: new Date('2030-01-01T00:00:00Z'),
    });

    expect(decisiones.aplicadas[0]).toMatchObject({
      observacion: { plazoSubsanarEn: new Date('2026-11-21T00:00:00Z') },
      cambios: { vencePlazoEn: null, plazoRestanteDias: 2 },
    });
  });

  it('sin plazos (004 y 005) observar usa la fecha recibida y no toca el plazo', async () => {
    const decisiones = new DecisionesEnMemoria({ estado: 'EN_EVALUACION' });
    const fecha = new Date('2026-12-01T00:00:00Z');

    await new ObservarExpediente({ decisiones, reloj: new RelojFalso() }).ejecutar({
      numero: 'EXP-2026-000001',
      version: 5,
      usuarioId: 'evaluador-1',
      descripcion: 'Falta el croquis de ubicación',
      plazoSubsanarEn: fecha,
    });

    expect(decisiones.aplicadas[0]?.observacion?.plazoSubsanarEn).toBe(fecha);
    expect(decisiones.aplicadas[0]?.cambios).toEqual({});
  });

  it('al registrarse el pago se reanuda el plazo suspendido', async () => {
    const decisiones = new DecisionesEnMemoria({ estado: 'PENDIENTE_PAGO', plazoRestanteDias: 1 });

    await new AplicarPagoRegistrado({ decisiones, reloj: new RelojFalso(), plazos }).ejecutar({
      numeroExpediente: 'EXP-2026-000001',
    });

    expect(decisiones.aplicadas[0]?.cambios).toEqual({
      vencePlazoEn: '2026-11-20',
      plazoRestanteDias: null,
    });
  });
});

describe('CompletarVencimientos (FR-026 de la 006)', () => {
  it('calcula desde la presentación; si está suspendido guarda los días que quedaban', async () => {
    const pendientes: ExpedienteSinVencimiento[] = [
      {
        id: 'a',
        estado: 'EN_EVALUACION',
        presentadoEn: new Date('2026-11-17T15:00:00Z'),
        plazoDias: 8,
      },
      {
        id: 'b',
        estado: 'OBSERVADO',
        presentadoEn: new Date('2026-11-17T15:00:00Z'),
        plazoDias: 8,
      },
      {
        id: 'c',
        estado: 'PENDIENTE_PAGO',
        presentadoEn: new Date('2026-11-01T15:00:00Z'),
        plazoDias: 2,
      },
    ];
    const fijados: unknown[] = [];

    const completados = await new CompletarVencimientos({
      vencimientos: {
        sinVencimiento: () => Promise.resolve(pendientes),
        fijar: (id, plazo) => {
          fijados.push({ id, ...plazo });
          return Promise.resolve();
        },
      },
      plazos,
      reloj: new RelojFalso(),
    }).ejecutar();

    expect(completados).toBe(3);
    expect(fijados).toEqual([
      { id: 'a', vencePlazoEn: '2026-11-25', plazoRestanteDias: null },
      { id: 'b', vencePlazoEn: null, plazoRestanteDias: 6 },
      { id: 'c', vencePlazoEn: null, plazoRestanteDias: 0 },
    ]);
  });
});
