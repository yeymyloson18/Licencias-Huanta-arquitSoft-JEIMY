import { esEstadoExpediente } from '../../../../../src/modulos/tramites/dominio/estado-publico';
import {
  ESTADOS_DECISION_FINAL,
  ESTADOS_EN_TRAMITE,
} from '../../../../../src/modulos/tramites/dominio/puertos/lector-para-reportes';

describe('Estados de los reportes (007)', () => {
  it('son estados válidos y solo APROBADO es a la vez decisión final y "en trámite"', () => {
    expect([...ESTADOS_DECISION_FINAL, ...ESTADOS_EN_TRAMITE].every(esEstadoExpediente)).toBe(true);
    expect(ESTADOS_EN_TRAMITE.filter((estado) => ESTADOS_DECISION_FINAL.includes(estado))).toEqual([
      'APROBADO',
    ]);
    expect(ESTADOS_EN_TRAMITE).not.toContain('FINALIZADO');
  });
});
