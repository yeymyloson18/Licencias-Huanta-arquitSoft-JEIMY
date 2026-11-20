import {
  CrearAviso,
  EnviarAvisosPendientes,
  ErrorSinContacto,
} from '../../../../src/modulos/notificaciones/aplicacion/avisos';
import {
  elegirCanal,
  siguienteIntento,
  textoDelAviso,
} from '../../../../src/modulos/notificaciones/dominio/aviso';
import type {
  AvisoPorEnviar,
  RepositorioAvisos,
} from '../../../../src/modulos/notificaciones/dominio/puertos';

// Datos FICTICIOS.
const CORREO = 'titular.prueba@ejemplo.pe';
const CELULAR = '987000001';
const EN = new Date('2026-11-20T15:00:00.000Z');
const reloj = { ahora: () => EN };

describe('Aviso (dominio, FR-031 a FR-033 de la 006)', () => {
  it('por correo si lo dio; si no, por SMS', () => {
    expect(elegirCanal({ correo: ` ${CORREO} `, celular: CELULAR })).toEqual({
      canal: 'CORREO',
      destino: CORREO,
    });
    expect(elegirCanal({ correo: null, celular: CELULAR })).toEqual({
      canal: 'SMS',
      destino: CELULAR,
    });
    expect(elegirCanal({ correo: '  ', celular: CELULAR }).canal).toBe('SMS');
  });

  it('los textos llevan el expediente y el estado en lenguaje sencillo, sin datos personales', () => {
    const cambio = textoDelAviso({
      plantilla: 'CAMBIO_ESTADO',
      numeroExpediente: 'EXP-2026-000001',
      estado: 'PAGADO',
      descripcion: 'Tu pago fue registrado',
      siguientePaso: 'La municipalidad continuará con tu trámite',
    });
    const itse = textoDelAviso({
      plantilla: 'ITSE_POR_VENCER',
      numeroExpediente: 'EXP-2026-000001',
      venceEn: '2026-12-19',
    });

    expect(cambio).toBe(
      'Municipalidad de Huanta. Expediente EXP-2026-000001: Tu pago fue registrado. Qué sigue: La municipalidad continuará con tu trámite.',
    );
    expect(itse).toContain('vence el 19 de diciembre de 2026');
    expect(`${cambio}${itse}`).not.toMatch(/http|40000001|987000001/);
  });

  it('reintentos con espera creciente hasta 5; luego ninguno', () => {
    expect(siguienteIntento(1, EN)?.getTime()).toBe(EN.getTime() + 10_000);
    expect(siguienteIntento(4, EN)?.getTime()).toBe(EN.getTime() + 80_000);
    expect(siguienteIntento(5, EN)).toBeNull();
  });
});

class AvisosEnMemoria implements RepositorioAvisos {
  readonly creados: { eventoId: bigint; canal: string; destino: string }[] = [];
  pendientes: AvisoPorEnviar[] = [];
  readonly enviados: string[] = [];
  readonly fallos: {
    id: string;
    intentos: number;
    nombreError: string;
    reintentarEn: Date | null;
  }[] = [];
  crearSiNoExiste(aviso: { eventoId: bigint; canal: string; destino: string }) {
    if (this.creados.some((c) => c.eventoId === aviso.eventoId)) {
      return Promise.resolve(false);
    }
    this.creados.push(aviso);
    return Promise.resolve(true);
  }
  tomarPendientes() {
    return Promise.resolve(this.pendientes);
  }
  marcarEnviado(id: string) {
    this.enviados.push(id);
    return Promise.resolve();
  }
  marcarFallo(id: string, intentos: number, nombreError: string, reintentarEn: Date | null) {
    this.fallos.push({ id, intentos, nombreError, reintentarEn });
    return Promise.resolve();
  }
}

describe('CrearAviso y EnviarAvisosPendientes (FR-031 a FR-035 de la 006)', () => {
  let avisos: AvisosEnMemoria;
  let contacto: { correo: string | null; celular: string } | null;
  const expedientes = {
    contactoTitular: () => Promise.resolve(contacto),
    textoDeEstado: (estado: string) =>
      estado === 'DESCONOCIDO'
        ? null
        : { descripcion: 'Tu pago fue registrado', siguientePaso: 'Sigue' },
  };
  const crear = () => new CrearAviso({ avisos, expedientes, reloj });

  beforeEach(() => {
    avisos = new AvisosEnMemoria();
    contacto = { correo: CORREO, celular: CELULAR };
  });

  it('un aviso por evento: el mismo evento dos veces crea uno solo', async () => {
    const evento = { eventoId: 7n, numeroExpediente: 'EXP-2026-000001', estadoNuevo: 'PAGADO' };

    expect(await crear().cambioDeEstado(evento)).toBe(true);
    expect(await crear().cambioDeEstado(evento)).toBe(false);
    expect(avisos.creados).toEqual([
      expect.objectContaining({ eventoId: 7n, canal: 'CORREO', destino: CORREO }),
    ]);
  });

  it('aviso del ITSE por SMS cuando no hay correo; un estado desconocido no avisa', async () => {
    contacto = { correo: null, celular: CELULAR };

    await crear().itsePorVencer({
      eventoId: 8n,
      numeroExpediente: 'EXP-2026-000001',
      venceEn: '2026-12-19',
    });
    expect(
      await crear().cambioDeEstado({
        eventoId: 9n,
        numeroExpediente: 'EXP-2026-000001',
        estadoNuevo: 'DESCONOCIDO',
      }),
    ).toBe(false);

    expect(avisos.creados).toEqual([expect.objectContaining({ canal: 'SMS', destino: CELULAR })]);
  });

  it('sin contacto falla para reintentar', async () => {
    contacto = null;

    await expect(
      crear().cambioDeEstado({
        eventoId: 1n,
        numeroExpediente: 'EXP-2026-000001',
        estadoNuevo: 'PAGADO',
      }),
    ).rejects.toBeInstanceOf(ErrorSinContacto);
  });

  it('envía los pendientes; un fallo se reintenta y al quinto queda sin reintento', async () => {
    const datos = {
      plantilla: 'ITSE_POR_VENCER' as const,
      numeroExpediente: 'EXP-2026-000001',
      venceEn: '2026-12-19',
    };
    avisos.pendientes = [
      { id: 'a', canal: 'SMS', destino: CELULAR, datos, intentos: 0 },
      { id: 'b', canal: 'SMS', destino: 'falla', datos, intentos: 0 },
      { id: 'c', canal: 'SMS', destino: 'falla', datos, intentos: 4 },
    ];
    const textos: string[] = [];

    const resultado = await new EnviarAvisosPendientes({
      avisos,
      enviador: {
        enviar: (mensaje) => {
          if (mensaje.destino === 'falla') {
            class ErrorProveedor extends Error {
              override name = 'ErrorProveedor';
            }
            return Promise.reject(new ErrorProveedor('sin conexión'));
          }
          textos.push(mensaje.texto);
          return Promise.resolve();
        },
      },
      reloj,
    }).ejecutar();

    expect(resultado).toEqual({ enviados: 1, fallidos: 2 });
    expect(avisos.enviados).toEqual(['a']);
    expect(textos[0]).toContain('EXP-2026-000001');
    expect(avisos.fallos).toEqual([
      {
        id: 'b',
        intentos: 1,
        nombreError: 'ErrorProveedor',
        reintentarEn: new Date(EN.getTime() + 10_000),
      },
      { id: 'c', intentos: 5, nombreError: 'ErrorProveedor', reintentarEn: null },
    ]);
  });
});
