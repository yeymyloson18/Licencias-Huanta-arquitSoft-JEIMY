import { siguienteEstado } from '../dominio/maquina-estados';
import type { Reloj } from '../dominio/puertos/reloj';
import type { RepositorioDecisiones } from '../dominio/puertos/repositorio-decisiones';

/** El expediente no se pudo pasar a PAGADO en este intento; el despachador lo reintenta. */
export class ErrorPagoNoAplicado extends Error {
  constructor() {
    super('No se pudo aplicar el pago al expediente');
    this.name = 'ErrorPagoNoAplicado';
  }
}

export type ResultadoPagoAplicado = 'APLICADO' | 'YA_APLICADO';

/**
 * Pasa el expediente a PAGADO al consumir `PagoRegistrado` (FR-025 de la 005, research §R-06).
 * Idempotente: si el expediente ya no está PENDIENTE_PAGO (porque el evento llegó dos veces), no hace
 * nada. El cambio lo hace el sistema: historial sin usuario y evento `EstadoExpedienteCambiado`.
 */
export class AplicarPagoRegistrado {
  constructor(
    private readonly d: { readonly decisiones: RepositorioDecisiones; readonly reloj: Reloj },
  ) {}

  async ejecutar(evento: { readonly numeroExpediente: string }): Promise<ResultadoPagoAplicado> {
    for (let intento = 0; intento < 2; intento += 1) {
      const expediente = await this.d.decisiones.obtenerParaDecidir(evento.numeroExpediente);
      if (expediente === null || expediente.estado !== 'PENDIENTE_PAGO') {
        return 'YA_APLICADO';
      }
      const nuevo = siguienteEstado(expediente.estado, expediente.ruta, 'REGISTRAR_PAGO');
      const aplicado = await this.d.decisiones.aplicar({
        expedienteId: expediente.id,
        numero: expediente.numero,
        estadoEsperado: expediente.estado,
        versionEsperada: expediente.version,
        estadoNuevo: nuevo,
        usuarioId: null,
        comentario: 'Pago registrado en caja',
        auditoria: null,
        eventos: [
          {
            tipo: 'EstadoExpedienteCambiado',
            datos: {
              numeroExpediente: expediente.numero,
              estadoAnterior: expediente.estado,
              estadoNuevo: nuevo,
            },
          },
        ],
        en: this.d.reloj.ahora(),
      });
      if (aplicado) {
        return 'APLICADO';
      }
      // Otro cambio ganó entre la lectura y el guardado: se vuelve a leer una vez.
    }
    throw new ErrorPagoNoAplicado();
  }
}
