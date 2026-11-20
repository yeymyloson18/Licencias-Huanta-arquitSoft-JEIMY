import { ConsultarEstado } from '../../../../../src/modulos/tramites/aplicacion/consultar-estado';
import { ErrorDominio } from '../../../../../src/modulos/tramites/dominio/error-dominio';
import {
  ErrorLimitadorConsultasNoDisponible,
  type LimitadorConsultas,
  type ReservaConsulta,
} from '../../../../../src/modulos/tramites/dominio/puertos/limitador-consultas';
import type {
  ExpedienteConsultado,
  RepositorioExpedientes,
} from '../../../../../src/modulos/tramites/dominio/puertos/repositorio-expedientes';
import type { NumeroExpediente } from '../../../../../src/modulos/tramites/dominio/numero-expediente';
import { T0 } from '../apoyo/dobles';

// Datos FICTICIOS (specs/004-solicitud-consulta/quickstart.md).
const EXPEDIENTE: ExpedienteConsultado = {
  numero: 'EXP-2026-000001',
  estado: 'REGISTRADO',
  ruta: 'A',
  nombreLicencia: 'Licencia de funcionamiento – riesgo medio',
  presentadoEn: T0,
  vencePlazoEn: null,
  historial: [{ estado: 'REGISTRADO', ocurridoEn: T0 }],
  observacionesPendientes: ['Falta el croquis'],
  requisitos: [{ id: 11, descripcion: 'Croquis de ubicación' }],
};

/** Coincide si el documento es el DNI o el RUC del titular ficticio. */
class ExpedientesEnMemoria implements Pick<RepositorioExpedientes, 'buscarParaConsulta'> {
  readonly busquedas: { numero: string; documento: string }[] = [];
  expediente: ExpedienteConsultado = EXPEDIENTE;

  buscarParaConsulta(numero: NumeroExpediente, documento: string) {
    this.busquedas.push({ numero: numero.valor, documento });
    const coincide =
      numero.valor === EXPEDIENTE.numero && ['40000001', '10400000011'].includes(documento);
    return Promise.resolve(coincide ? this.expediente : null);
  }
}

class LimitadorFalso implements LimitadorConsultas {
  fallos = 0;
  caido = false;
  liberados = 0;

  reservar(): Promise<ReservaConsulta> {
    if (this.caido) {
      return Promise.reject(new ErrorLimitadorConsultasNoDisponible());
    }
    this.fallos += 1;
    return Promise.resolve(
      this.fallos > 5
        ? { permitido: false, segundosRestantes: 600 }
        : { permitido: true, segundosRestantes: 0 },
    );
  }

  liberar(): Promise<void> {
    this.fallos -= 1;
    this.liberados += 1;
    return Promise.resolve();
  }
}

describe('ConsultarEstado (CU05 de la 004)', () => {
  let expedientes: ExpedientesEnMemoria;
  let limitador: LimitadorFalso;
  let consultar: ConsultarEstado;

  beforeEach(() => {
    expedientes = new ExpedientesEnMemoria();
    limitador = new LimitadorFalso();
    consultar = new ConsultarEstado({ expedientes, limitador });
  });

  const ejecutar = (numeroExpediente: string, documento: string) =>
    consultar.ejecutar({ numeroExpediente, documento, origen: '203.0.113.7' });

  it('normaliza el número y el documento antes de buscar', async () => {
    const resultado = await ejecutar('  exp-2026-000001 ', ' 40000001 ');

    expect(resultado.tipo).toBe('ENCONTRADO');
    expect(expedientes.busquedas).toEqual([{ numero: 'EXP-2026-000001', documento: '40000001' }]);
  });

  it('con el RUC también encuentra el expediente', async () => {
    expect((await ejecutar('EXP-2026-000001', '10400000011')).tipo).toBe('ENCONTRADO');
  });

  it('devuelve el estado en lenguaje sencillo y sin datos personales', async () => {
    const resultado = await ejecutar('EXP-2026-000001', '40000001');

    expect(resultado).toEqual({
      tipo: 'ENCONTRADO',
      estado: {
        numero: 'EXP-2026-000001',
        estado: 'REGISTRADO',
        descripcionEstado: 'Tu solicitud fue registrada y espera evaluación',
        siguientePaso: 'La municipalidad revisará tus documentos y confirmará el nivel de riesgo',
        ruta: 'A',
        nombreLicencia: 'Licencia de funcionamiento – riesgo medio',
        presentadoEn: T0,
        vencePlazoEn: null,
        historial: [
          {
            estado: 'REGISTRADO',
            descripcion: 'Tu solicitud fue registrada y espera evaluación',
            ocurridoEn: T0,
          },
        ],
        observacionesPendientes: [],
        requisitosSubsanables: [],
        esquela: null,
        tokenConsulta: null,
      },
    });
    expect(JSON.stringify(resultado)).not.toMatch(/40000001|10400000011/);
  });

  describe('datos de pago y observaciones (005)', () => {
    const pedidos: string[] = [];
    const pago = {
      esquelaDe: (numero: string) => {
        pedidos.push(`esquela:${numero}`);
        return Promise.resolve({ codigo: `ESQ-${numero}`, monto: '177.10', pagada: false });
      },
      tokenConsulta: (numero: string) => {
        pedidos.push(`token:${numero}`);
        return Promise.resolve({ token: 'token-ficticio', expiraEn: 900 });
      },
    };
    const conEstado = async (estado: ExpedienteConsultado['estado']) => {
      expedientes.expediente = { ...EXPEDIENTE, estado };
      consultar = new ConsultarEstado({ expedientes, limitador, pago });
      const resultado = await ejecutar('EXP-2026-000001', '40000001');
      if (resultado.tipo !== 'ENCONTRADO') {
        throw new Error('esperaba ENCONTRADO');
      }
      return resultado.estado;
    };

    beforeEach(() => {
      pedidos.length = 0;
    });

    it('PENDIENTE_PAGO trae la esquela y el tokenConsulta', async () => {
      const estado = await conEstado('PENDIENTE_PAGO');

      expect(estado.esquela).toEqual({
        codigo: 'ESQ-EXP-2026-000001',
        monto: '177.10',
        pagada: false,
      });
      expect(estado.tokenConsulta).toEqual({ token: 'token-ficticio', expiraEn: 900 });
      expect(estado.observacionesPendientes).toEqual([]);
      expect(estado.requisitosSubsanables).toEqual([]);
    });

    it('PAGADO trae la esquela pero no el token', async () => {
      const estado = await conEstado('PAGADO');

      expect(estado.esquela).not.toBeNull();
      expect(estado.tokenConsulta).toBeNull();
      expect(pedidos).toEqual(['esquela:EXP-2026-000001']);
    });

    it('OBSERVADO trae las observaciones y no pide datos de pago', async () => {
      const estado = await conEstado('OBSERVADO');

      expect(estado.observacionesPendientes).toEqual(['Falta el croquis']);
      expect(estado.requisitosSubsanables).toEqual([
        { id: 11, descripcion: 'Croquis de ubicación' },
      ]);
      expect(estado.esquela).toBeNull();
      expect(pedidos).toEqual([]);
    });
  });

  it('un acierto no suma al contador', async () => {
    await ejecutar('EXP-2026-000001', '40000001');

    expect(limitador.fallos).toBe(0);
    expect(limitador.liberados).toBe(1);
  });

  it('si no coincide, el intento queda contado como fallo', async () => {
    expect((await ejecutar('EXP-2026-000001', '40000009')).tipo).toBe('NO_ENCONTRADO');
    expect((await ejecutar('EXP-2026-999999', '40000001')).tipo).toBe('NO_ENCONTRADO');

    expect(limitador.fallos).toBe(2);
    expect(limitador.liberados).toBe(0);
  });

  it('tras 5 fallos bloquea, aunque los datos sean correctos, y no busca', async () => {
    for (let intento = 0; intento < 5; intento += 1) {
      await ejecutar('EXP-2026-000001', '40000009');
    }
    const busquedas = expedientes.busquedas.length;

    const resultado = await ejecutar('EXP-2026-000001', '40000001');

    expect(resultado).toEqual({ tipo: 'BLOQUEADO', segundosRestantes: 600 });
    expect(expedientes.busquedas).toHaveLength(busquedas);
  });

  it('si el limitador no responde falla cerrado y no busca', async () => {
    limitador.caido = true;

    await expect(ejecutar('EXP-2026-000001', '40000001')).rejects.toBeInstanceOf(
      ErrorLimitadorConsultasNoDisponible,
    );
    expect(expedientes.busquedas).toHaveLength(0);
  });

  it('un número con formato inválido es un error del dominio (la presentación lo filtra antes)', async () => {
    await expect(ejecutar('EXP-26-1', '40000001')).rejects.toBeInstanceOf(ErrorDominio);
  });
});
