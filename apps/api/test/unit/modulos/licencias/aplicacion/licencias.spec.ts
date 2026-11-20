import {
  ConsultarLicencia,
  VerificarLicencia,
} from '../../../../../src/modulos/licencias/aplicacion/consultar-licencia';
import { EmitirLicencia } from '../../../../../src/modulos/licencias/aplicacion/emitir-licencia';
import {
  ErrorExpedienteSinDatos,
  ErrorLicenciaDeOtroExpediente,
  ErrorLicenciaNoEncontrada,
} from '../../../../../src/modulos/licencias/aplicacion/errores';
import {
  type DatosExpedienteParaLicencia,
  Licencia,
} from '../../../../../src/modulos/licencias/dominio/licencia';
import {
  ErrorLimitadorNoDisponible,
  type RepositorioLicencias,
  type ResultadoEmision,
} from '../../../../../src/modulos/licencias/dominio/puertos';

// Datos FICTICIOS.
const EXPEDIENTE: DatosExpedienteParaLicencia = {
  numeroExpediente: 'EXP-2026-000001',
  codigoReceta: 'LIC-02',
  nombreComercial: null,
  giro: 'Bodega',
  zona: 'Centro',
  razonSocial: 'Comercial Huanta S.A.C.',
  nombreTitular: 'Juana Pérez',
  vigenciaMeses: null,
};
const EN = new Date('2026-11-20T15:00:00.000Z');
const reloj = { ahora: () => EN };

class LicenciasEnMemoria implements RepositorioLicencias {
  readonly licencias: Licencia[] = [];
  readonly publicadas: string[] = [];
  /** Simula que otra entrega del evento emitió entre la lectura y la escritura. */
  carrera: Licencia | null = null;
  vigenteDe(numero: string) {
    return Promise.resolve(this.licencias.find((l) => l.numeroExpediente === numero) ?? null);
  }
  porNumero(numero: string) {
    return Promise.resolve(this.licencias.find((l) => l.numero === numero) ?? null);
  }
  porCodigo(codigo: string) {
    return Promise.resolve(
      this.licencias.find((l) => l.aDatos().codigoVerificacion === codigo) ?? null,
    );
  }
  emitir(armar: (correlativo: number) => Licencia): Promise<ResultadoEmision> {
    if (this.carrera !== null) {
      return Promise.resolve({ tipo: 'YA_EXISTIA', licencia: this.carrera });
    }
    const licencia = armar(this.licencias.length + 1);
    this.licencias.push(licencia);
    return Promise.resolve({ tipo: 'EMITIDA', licencia });
  }
  publicarEmitida(licencia: Licencia) {
    this.publicadas.push(licencia.numero);
    return Promise.resolve();
  }
  registrarCertificado() {
    return Promise.resolve('REGISTRADO' as const);
  }
  avisarCertificadosPorVencer() {
    return Promise.resolve(0);
  }
}

describe('EmitirLicencia (FR-001, FR-003 y FR-004 de la 006)', () => {
  let licencias: LicenciasEnMemoria;
  let datos: DatosExpedienteParaLicencia | null;
  const emitir = (certificado: { numero: string; emitidoEn: string } | null = null) =>
    new EmitirLicencia({
      licencias,
      expedientes: { datosParaLicencia: () => Promise.resolve(datos) },
      aleatorio: { bytes: (n) => new Uint8Array(n).fill(7) },
      reloj,
    }).ejecutar({ numeroExpediente: 'EXP-2026-000001', tipo: 'DEFINITIVA', certificado });

  beforeEach(() => {
    licencias = new LicenciasEnMemoria();
    datos = EXPEDIENTE;
  });

  it('emite una licencia con número, código y el certificado (ruta B)', async () => {
    const licencia = await emitir({ numero: 'ITSE-9', emitidoEn: '2026-11-19' });

    expect(licencia.aDatos()).toMatchObject({
      numero: 'LF-2026-000001',
      titularPublico: 'Comercial Huanta S.A.C.',
      certificado: { numero: 'ITSE-9', venceEn: '2028-11-19' },
    });
    expect(licencia.aDatos().codigoVerificacion).toHaveLength(22);
  });

  it('si ya hay una vigente no emite otra y vuelve a publicar LicenciaEmitida', async () => {
    const primera = await emitir();

    const segunda = await emitir();

    expect(segunda).toBe(primera);
    expect(licencias.licencias).toHaveLength(1);
    expect(licencias.publicadas).toEqual(['LF-2026-000001']);
  });

  it('si otra entrega ganó la carrera, publica la existente', async () => {
    const otra = Licencia.emitir({
      correlativo: 9,
      codigoVerificacion: 'B'.repeat(22),
      tipo: 'DEFINITIVA',
      expediente: EXPEDIENTE,
      certificado: null,
      en: EN,
    });
    licencias.carrera = otra;

    expect(await emitir()).toBe(otra);
    expect(licencias.publicadas).toEqual(['LF-2026-000009']);
  });

  it('sin datos del expediente falla (el evento se reintenta)', async () => {
    datos = null;

    await expect(emitir()).rejects.toBeInstanceOf(ErrorExpedienteSinDatos);
  });
});

describe('ConsultarLicencia y VerificarLicencia (FR-019 a FR-022 de la 006)', () => {
  let licencias: LicenciasEnMemoria;
  let licencia: Licencia;

  beforeEach(async () => {
    licencias = new LicenciasEnMemoria();
    licencia = (
      await licencias.emitir(() =>
        Licencia.emitir({
          correlativo: 3,
          codigoVerificacion: 'C'.repeat(22),
          tipo: 'DEFINITIVA',
          expediente: EXPEDIENTE,
          certificado: null,
          en: EN,
        }),
      )
    ).licencia;
  });

  const consultar = () =>
    new ConsultarLicencia({
      licencias,
      pdf: { generar: (_datos, url) => Promise.resolve(new TextEncoder().encode(url)) },
      reloj,
      urlPublicaPortal: 'https://licencias.ejemplo.pe/',
    });

  it('el personal y el administrado del mismo expediente la leen con su estado', async () => {
    const leida = await consultar().obtener(licencia.numero, { tipo: 'PERSONAL' });

    expect(leida).toMatchObject({
      numero: 'LF-2026-000003',
      estado: 'VIGENTE',
      itseEstado: 'SIN_CERTIFICADO',
    });
    await expect(
      consultar().obtener(licencia.numero, {
        tipo: 'CONSULTA',
        numeroExpediente: 'EXP-2026-000001',
      }),
    ).resolves.toBeDefined();
  });

  it('con el token de otro expediente se rechaza; una inexistente no se encuentra', async () => {
    await expect(
      consultar().obtener(licencia.numero, {
        tipo: 'CONSULTA',
        numeroExpediente: 'EXP-2026-000002',
      }),
    ).rejects.toBeInstanceOf(ErrorLicenciaDeOtroExpediente);
    await expect(
      consultar().obtener('LF-2026-999999', { tipo: 'PERSONAL' }),
    ).rejects.toBeInstanceOf(ErrorLicenciaNoEncontrada);
  });

  it('el PDF lleva la URL pública de verificación', async () => {
    const pdf = await consultar().pdf(licencia.numero, { tipo: 'PERSONAL' });

    expect(new TextDecoder().decode(pdf)).toBe(
      `https://licencias.ejemplo.pe/verificar/${'C'.repeat(22)}`,
    );
  });

  describe('verificación pública', () => {
    let fallos: number;
    let liberados: number;
    let caido: boolean;
    const verificar = (codigo: string) =>
      new VerificarLicencia({
        licencias,
        reloj,
        limitador: {
          reservar: () => {
            if (caido) {
              return Promise.reject(new ErrorLimitadorNoDisponible());
            }
            fallos += 1;
            return Promise.resolve(
              fallos > 10
                ? { permitido: false, segundosRestantes: 600 }
                : { permitido: true, segundosRestantes: 0 },
            );
          },
          liberar: () => {
            fallos -= 1;
            liberados += 1;
            return Promise.resolve();
          },
        },
      }).ejecutar({ codigo, origen: '203.0.113.9' });

    beforeEach(() => {
      fallos = 0;
      liberados = 0;
      caido = false;
    });

    it('un código válido devuelve la licencia y no suma intentos', async () => {
      const resultado = await verificar('C'.repeat(22));

      expect(resultado).toMatchObject({
        tipo: 'ENCONTRADA',
        licencia: { numero: 'LF-2026-000003' },
      });
      expect(liberados).toBe(1);
    });

    it('inexistente y mal formado responden igual y suman intentos', async () => {
      expect(await verificar('D'.repeat(22))).toEqual({ tipo: 'NO_ENCONTRADA' });
      expect(await verificar('otra-cosa')).toEqual({ tipo: 'NO_ENCONTRADA' });
      expect(fallos).toBe(2);
    });

    it('tras 10 fallos bloquea, aunque el código sea válido', async () => {
      for (let i = 0; i < 10; i += 1) {
        await verificar('D'.repeat(22));
      }

      expect(await verificar('C'.repeat(22))).toEqual({
        tipo: 'BLOQUEADO',
        segundosRestantes: 600,
      });
    });

    it('si el límite no responde, falla cerrado', async () => {
      caido = true;

      await expect(verificar('C'.repeat(22))).rejects.toBeInstanceOf(ErrorLimitadorNoDisponible);
    });
  });
});
