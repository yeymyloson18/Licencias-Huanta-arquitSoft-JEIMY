import {
  AplicarPagoRegistrado,
  ErrorPagoNoAplicado,
} from '../../../../../src/modulos/tramites/aplicacion/aplicar-pago-registrado';
import type {
  Decision,
  ExpedienteParaDecidir,
  RepositorioDecisiones,
} from '../../../../../src/modulos/tramites/dominio/puertos/repositorio-decisiones';
import { RelojFalso, T0 } from '../apoyo/dobles';

class DecisionesEnMemoria implements RepositorioDecisiones {
  expediente: ExpedienteParaDecidir | null = {
    id: 'id-1',
    numero: 'EXP-2026-000001',
    estado: 'PENDIENTE_PAGO',
    ruta: 'A',
    codigoReceta: 'LIC-02',
    version: 5,
    yaObservado: false,
  };
  readonly aplicadas: Decision[] = [];
  rechazar = 0;

  obtenerParaDecidir() {
    return Promise.resolve(this.expediente);
  }

  publicar() {
    return Promise.resolve();
  }

  aplicar(decision: Decision) {
    if (this.rechazar > 0) {
      this.rechazar -= 1;
      return Promise.resolve(false);
    }
    this.aplicadas.push(decision);
    if (this.expediente) {
      this.expediente = { ...this.expediente, estado: decision.estadoNuevo };
    }
    return Promise.resolve(true);
  }
}

describe('AplicarPagoRegistrado (FR-025 de la 005)', () => {
  const evento = { numeroExpediente: 'EXP-2026-000001' };

  it('PENDIENTE_PAGO → PAGADO por el sistema, con historial y evento', async () => {
    const decisiones = new DecisionesEnMemoria();

    const resultado = await new AplicarPagoRegistrado({
      decisiones,
      reloj: new RelojFalso(),
    }).ejecutar(evento);

    expect(resultado).toBe('APLICADO');
    expect(decisiones.aplicadas[0]).toMatchObject({
      estadoEsperado: 'PENDIENTE_PAGO',
      estadoNuevo: 'PAGADO',
      versionEsperada: 5,
      usuarioId: null,
      auditoria: null,
      comentario: 'Pago registrado en caja',
      eventos: [
        {
          tipo: 'EstadoExpedienteCambiado',
          datos: {
            numeroExpediente: 'EXP-2026-000001',
            estadoAnterior: 'PENDIENTE_PAGO',
            estadoNuevo: 'PAGADO',
          },
        },
      ],
      en: T0,
    });
  });

  it('si ya está PAGADO no cambia nada ni repite el evento (idempotente)', async () => {
    const decisiones = new DecisionesEnMemoria();
    const aplicar = new AplicarPagoRegistrado({ decisiones, reloj: new RelojFalso() });
    await aplicar.ejecutar(evento);

    expect(await aplicar.ejecutar(evento)).toBe('YA_APLICADO');
    expect(decisiones.aplicadas).toHaveLength(1);
  });

  it('si el expediente no existe no hace nada', async () => {
    const decisiones = new DecisionesEnMemoria();
    decisiones.expediente = null;

    expect(
      await new AplicarPagoRegistrado({ decisiones, reloj: new RelojFalso() }).ejecutar(evento),
    ).toBe('YA_APLICADO');
  });

  it('si otro cambio gana una vez, vuelve a leer y aplica', async () => {
    const decisiones = new DecisionesEnMemoria();
    decisiones.rechazar = 1;

    expect(
      await new AplicarPagoRegistrado({ decisiones, reloj: new RelojFalso() }).ejecutar(evento),
    ).toBe('APLICADO');
  });

  it('si no logra guardar en dos intentos, falla para que el despachador reintente', async () => {
    const decisiones = new DecisionesEnMemoria();
    decisiones.rechazar = 2;

    await expect(
      new AplicarPagoRegistrado({ decisiones, reloj: new RelojFalso() }).ejecutar(evento),
    ).rejects.toBeInstanceOf(ErrorPagoNoAplicado);
  });
});
