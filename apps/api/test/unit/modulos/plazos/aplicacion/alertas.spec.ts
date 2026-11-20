import {
  ConsultarAlertas,
  ErrorAlertaNoEncontrada,
  ErrorAlertaYaAtendida,
  GenerarAlertas,
} from '../../../../../src/modulos/plazos/aplicacion/alertas';
import type {
  AlertaGuardada,
  RepositorioAlertas,
} from '../../../../../src/modulos/plazos/dominio/puertos';

const EN = new Date('2026-11-20T15:00:00.000Z'); // viernes 20-nov en Lima
const reloj = { ahora: () => EN };
// Días hábiles simulados: diferencia de días de calendario.
const plazos = {
  diasHabilesRestantes: (hoy: string, vence: string) =>
    Promise.resolve(Math.round((Date.parse(vence) - Date.parse(hoy)) / 86_400_000)),
};

class AlertasEnMemoria implements RepositorioAlertas {
  readonly alertas: AlertaGuardada[] = [];
  insertarSiNoExiste(numeroExpediente: string, venceEn: string, dias: number, en: Date) {
    if (
      this.alertas.some((a) => a.numeroExpediente === numeroExpediente && a.venceEn === venceEn)
    ) {
      return Promise.resolve(false);
    }
    this.alertas.push({
      id: this.alertas.length + 1,
      numeroExpediente,
      venceEn,
      diasHabilesRestantes: dias,
      generadaEn: en,
      atendidaEn: null,
      atendidaPor: null,
    });
    return Promise.resolve(true);
  }
  listar(soloPendientes: boolean) {
    return Promise.resolve(this.alertas.filter((a) => !soloPendientes || a.atendidaEn === null));
  }
  atender(id: number, usuarioId: string, en: Date) {
    const indice = this.alertas.findIndex((a) => a.id === id);
    const alerta = this.alertas[indice];
    if (alerta === undefined) {
      return Promise.resolve('NO_EXISTE' as const);
    }
    if (alerta.atendidaEn !== null) {
      return Promise.resolve('YA_ATENDIDA' as const);
    }
    this.alertas[indice] = { ...alerta, atendidaEn: en, atendidaPor: usuarioId };
    return Promise.resolve('ATENDIDA' as const);
  }
  obtener(id: number) {
    return Promise.resolve(this.alertas.find((a) => a.id === id) ?? null);
  }
}

describe('Alertas de plazos (FR-028 a FR-030 de la 006)', () => {
  let alertas: AlertasEnMemoria;
  let completados: number;

  const expedientes = {
    completarVencimientos: () => {
      completados += 1;
      return Promise.resolve(0);
    },
    conPlazo: () =>
      Promise.resolve([
        { numero: 'EXP-2026-000001', vencePlazoEn: '2026-11-21' }, // 1 día
        { numero: 'EXP-2026-000002', vencePlazoEn: '2026-11-22' }, // 2 días
        { numero: 'EXP-2026-000003', vencePlazoEn: '2026-11-23' }, // 3 días: no
        { numero: 'EXP-2026-000004', vencePlazoEn: '2026-11-18' }, // vencido
      ]),
    estadosDe: (numeros: readonly string[]) =>
      Promise.resolve(new Map(numeros.map((n) => [n, 'EN_EVALUACION']))),
  };

  const generar = () => new GenerarAlertas({ alertas, expedientes, plazos, reloj }).ejecutar();
  const consultar = () => new ConsultarAlertas({ alertas, expedientes, plazos, reloj });

  beforeEach(() => {
    alertas = new AlertasEnMemoria();
    completados = 0;
  });

  it('alerta con 2 días o menos y a los vencidos; no con 3 o más; completa vencimientos antes', async () => {
    expect(await generar()).toBe(3);

    expect(completados).toBe(1);
    expect(alertas.alertas.map((a) => [a.numeroExpediente, a.diasHabilesRestantes])).toEqual([
      ['EXP-2026-000001', 1],
      ['EXP-2026-000002', 2],
      ['EXP-2026-000004', -2],
    ]);
  });

  it('corriendo dos veces no duplica', async () => {
    await generar();

    expect(await generar()).toBe(0);
    expect(alertas.alertas).toHaveLength(3);
  });

  it('lista de la más urgente a la menos urgente con el estado del expediente', async () => {
    await generar();

    const lista = await consultar().listar(true);

    expect(lista.map((a) => a.numeroExpediente)).toEqual([
      'EXP-2026-000004',
      'EXP-2026-000001',
      'EXP-2026-000002',
    ]);
    expect(lista[0]).toMatchObject({ diasHabilesRestantes: -2, estadoExpediente: 'EN_EVALUACION' });
  });

  it('con los mismos días ordena por vencimiento; sin estado conocido devuelve null', async () => {
    await alertas.insertarSiNoExiste('EXP-2026-000009', '2026-11-22', 2, EN);
    await alertas.insertarSiNoExiste('EXP-2026-000008', '2026-11-22', 2, EN);
    const sinEstados = new ConsultarAlertas({
      alertas,
      expedientes: { estadosDe: () => Promise.resolve(new Map()) },
      plazos: { diasHabilesRestantes: () => Promise.resolve(2) },
      reloj,
    });

    const lista = await sinEstados.listar(true);

    expect(lista.map((a) => a.numeroExpediente)).toEqual(['EXP-2026-000009', 'EXP-2026-000008']);
    expect(lista[0]?.estadoExpediente).toBeNull();
  });

  it('si la alerta desaparece justo después de atenderla, no se encuentra', async () => {
    await generar();
    const repositorio = Object.assign(Object.create(alertas) as AlertasEnMemoria, {
      obtener: () => Promise.resolve(null),
    });

    await expect(
      new ConsultarAlertas({ alertas: repositorio, expedientes, plazos, reloj }).atender(
        1,
        'jefa-1',
      ),
    ).rejects.toBeInstanceOf(ErrorAlertaNoEncontrada);
  });

  it('atender marca quién y cuándo; repetir o una inexistente son errores', async () => {
    await generar();

    const atendida = await consultar().atender(1, 'jefa-1');

    expect(atendida).toMatchObject({ atendidaEn: EN, atendidaPor: 'jefa-1' });
    expect(await consultar().listar(true)).toHaveLength(2);
    expect(await consultar().listar(false)).toHaveLength(3);
    await expect(consultar().atender(1, 'jefa-1')).rejects.toBeInstanceOf(ErrorAlertaYaAtendida);
    await expect(consultar().atender(99, 'jefa-1')).rejects.toBeInstanceOf(ErrorAlertaNoEncontrada);
  });
});
