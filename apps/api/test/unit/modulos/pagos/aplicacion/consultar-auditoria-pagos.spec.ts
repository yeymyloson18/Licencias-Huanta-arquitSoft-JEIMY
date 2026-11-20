import { ConsultarAuditoriaPagos } from '../../../../../src/modulos/pagos/aplicacion/consultar-auditoria-pagos';
import { ErrorDatoPagos } from '../../../../../src/modulos/pagos/dominio/errores';
import type {
  FiltroAuditoriaPagos,
  RegistroAuditoriaPago,
} from '../../../../../src/modulos/pagos/dominio/puertos/repositorio-esquelas';

const CAJERO = '00000000-0000-4000-8000-0000000000c1';
const JEFATURA = '00000000-0000-4000-8000-0000000000c2';

const REGISTROS: RegistroAuditoriaPago[] = [
  {
    usuarioId: JEFATURA,
    accion: 'CORREGIR_RECIBO',
    codigoEsquela: 'ESQ-EXP-2026-000001',
    reciboAnterior: 'REC-0001',
    reciboNuevo: 'REC-0002',
    motivo: 'El cajero digitó mal el número',
    ocurridoEn: new Date('2026-11-21T15:00:00.000Z'),
  },
  {
    usuarioId: CAJERO,
    accion: 'REGISTRAR_PAGO',
    codigoEsquela: 'ESQ-EXP-2026-000001',
    reciboAnterior: null,
    reciboNuevo: 'REC-0001',
    motivo: null,
    ocurridoEn: new Date('2026-11-20T15:00:00.000Z'),
  },
];

describe('ConsultarAuditoriaPagos (RF25, historia 6 de la 005)', () => {
  const filtros: FiltroAuditoriaPagos[] = [];
  const consultar = (filtro: Partial<Parameters<ConsultarAuditoriaPagos['ejecutar']>[0]> = {}) =>
    new ConsultarAuditoriaPagos({
      esquelas: {
        listarAuditoria: (recibido) => {
          filtros.push(recibido);
          return Promise.resolve({ total: 7, datos: REGISTROS });
        },
      },
      nombres: {
        nombresDe: () => Promise.resolve(new Map([[CAJERO, 'Cajero de Prueba']])),
      },
    }).ejecutar({ desde: null, hasta: null, pagina: 1, porPagina: 20, ...filtro });

  beforeEach(() => {
    filtros.length = 0;
  });

  it('devuelve los registros con el nombre del usuario y la esquela como referencia', async () => {
    const pagina = await consultar();

    expect(pagina).toMatchObject({ pagina: 1, porPagina: 20, total: 7 });
    expect(pagina.datos[1]).toEqual({
      usuarioId: CAJERO,
      nombreUsuario: 'Cajero de Prueba',
      accion: 'REGISTRAR_PAGO',
      referencia: 'ESQ-EXP-2026-000001',
      detalle: { reciboAnterior: null, reciboNuevo: 'REC-0001', motivo: null },
      ocurridoEn: new Date('2026-11-20T15:00:00.000Z'),
    });
    expect(pagina.datos[0]?.nombreUsuario).toBeNull();
  });

  it('las fechas incluyen el día completo en hora de Lima (UTC-5)', async () => {
    await consultar({ desde: '2026-11-20', hasta: '2026-11-21' });

    expect(filtros[0]).toMatchObject({
      desde: new Date('2026-11-20T05:00:00.000Z'),
      hasta: new Date('2026-11-22T05:00:00.000Z'),
    });
  });

  it('sin fechas no filtra y limita la página a 50', async () => {
    await consultar({ porPagina: 100 });

    expect(filtros[0]).toEqual({ desde: null, hasta: null, pagina: 1, porPagina: 50 });
  });

  it('una fecha final anterior a la inicial es un dato inválido', async () => {
    await expect(consultar({ desde: '2026-11-21', hasta: '2026-11-19' })).rejects.toBeInstanceOf(
      ErrorDatoPagos,
    );
  });
});
