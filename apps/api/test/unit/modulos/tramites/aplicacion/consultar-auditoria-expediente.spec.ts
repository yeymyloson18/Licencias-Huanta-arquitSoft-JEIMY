import { ConsultarAuditoriaExpediente } from '../../../../../src/modulos/tramites/aplicacion/consultar-auditoria-expediente';
import { ErrorExpedienteNoEncontrado } from '../../../../../src/modulos/tramites/aplicacion/errores';
import type { RegistroAuditoriaTramites } from '../../../../../src/modulos/tramites/dominio/puertos/lector-auditoria';

const EVALUADOR = '00000000-0000-4000-8000-0000000000e1';
const T0 = new Date('2026-11-20T15:00:00.000Z');

const REGISTROS: RegistroAuditoriaTramites[] = [
  {
    usuarioId: null,
    accion: 'PRESENTAR_EN_LINEA',
    numeroExpediente: 'EXP-2026-000001',
    detalle: null,
    ocurridoEn: T0,
  },
  {
    usuarioId: EVALUADOR,
    accion: 'CONFIRMAR_RIESGO',
    numeroExpediente: 'EXP-2026-000001',
    detalle: { codigoReceta: 'LIC-02' },
    ocurridoEn: T0,
  },
];

describe('ConsultarAuditoriaExpediente (RF25, historia 6 de la 005)', () => {
  let existe: boolean;
  const pedidos: string[][] = [];
  const consultar = () =>
    new ConsultarAuditoriaExpediente({
      lector: {
        existeExpediente: () => Promise.resolve(existe),
        listar: () => Promise.resolve(REGISTROS),
      },
      nombres: {
        nombresDe: (ids) => {
          pedidos.push([...ids]);
          return Promise.resolve(new Map([[EVALUADOR, 'Evaluador de Prueba']]));
        },
      },
    }).ejecutar('EXP-2026-000001');

  beforeEach(() => {
    existe = true;
    pedidos.length = 0;
  });

  it('devuelve las decisiones con el nombre del usuario y el expediente como referencia', async () => {
    const registros = await consultar();

    expect(registros).toEqual([
      {
        usuarioId: null,
        nombreUsuario: null,
        accion: 'PRESENTAR_EN_LINEA',
        referencia: 'EXP-2026-000001',
        detalle: null,
        ocurridoEn: T0,
      },
      {
        usuarioId: EVALUADOR,
        nombreUsuario: 'Evaluador de Prueba',
        accion: 'CONFIRMAR_RIESGO',
        referencia: 'EXP-2026-000001',
        detalle: { codigoReceta: 'LIC-02' },
        ocurridoEn: T0,
      },
    ]);
    expect(pedidos).toEqual([[EVALUADOR]]);
  });

  it('un expediente inexistente no se encuentra', async () => {
    existe = false;

    await expect(consultar()).rejects.toBeInstanceOf(ErrorExpedienteNoEncontrado);
  });
});
