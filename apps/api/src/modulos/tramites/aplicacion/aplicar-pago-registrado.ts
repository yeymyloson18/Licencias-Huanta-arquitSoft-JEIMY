import { fechaLima } from '../../../compartido/dominio/fecha-lima';
import { siguienteEstado } from '../dominio/maquina-estados';
import type { PlazosHabiles } from '../dominio/puertos/plazos-habiles';
import { reanudarPlazo } from './plazo-expediente';
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
    private readonly d: {
      readonly decisiones: RepositorioDecisiones;
      readonly reloj: Reloj;
      /** Días hábiles (006): al pagar se reanuda el plazo suspendido. */
      readonly plazos?: PlazosHabiles;
    },
  ) {}

  async ejecutar(evento: { readonly numeroExpediente: string }): Promise<ResultadoPagoAplicado> {
    for (let intento = 0; intento < 2; intento += 1) {
      const expediente = await this.d.decisiones.obtenerParaDecidir(evento.numeroExpediente);
      if (expediente === null || expediente.estado !== 'PENDIENTE_PAGO') {
        return 'YA_APLICADO';
      }
      const pagado = siguienteEstado(expediente.estado, expediente.ruta, 'REGISTRAR_PAGO');
      // Ruta B (006): en la misma transacción pasa a EN_INSPECCION y pide la inspección PREVIA.
      const conInspeccion = expediente.ruta === 'B';
      const primero = {
        estadoAnterior: expediente.estado,
        estadoNuevo: pagado,
        comentario: 'Pago registrado en caja',
      };
      const segundo = conInspeccion
        ? {
            estadoAnterior: pagado,
            estadoNuevo: siguienteEstado(pagado, 'B', 'INICIAR_INSPECCION_PREVIA'),
            comentario: 'Espera la inspección ITSE previa',
          }
        : null;
      const pasos = segundo === null ? [primero] : [primero, segundo];
      const final = segundo ?? primero;
      const en = this.d.reloj.ahora();
      const plazo = await reanudarPlazo(this.d.plazos, expediente.plazoRestanteDias, fechaLima(en));
      const aplicado = await this.d.decisiones.aplicar({
        expedienteId: expediente.id,
        numero: expediente.numero,
        estadoEsperado: expediente.estado,
        versionEsperada: expediente.version,
        estadoNuevo: final.estadoNuevo,
        usuarioId: null,
        comentario: final.comentario,
        auditoria: null,
        historial: pasos,
        cambios: plazo,
        eventos: [
          ...pasos.map((paso) => ({
            tipo: 'EstadoExpedienteCambiado',
            datos: {
              numeroExpediente: expediente.numero,
              estadoAnterior: paso.estadoAnterior,
              estadoNuevo: paso.estadoNuevo,
            },
          })),
          ...(conInspeccion
            ? [
                {
                  tipo: 'InspeccionRequerida',
                  datos: { numeroExpediente: expediente.numero, tipo: 'PREVIA' },
                },
              ]
            : []),
        ],
        en,
      });
      if (aplicado) {
        return 'APLICADO';
      }
      // Otro cambio ganó entre la lectura y el guardado: se vuelve a leer una vez.
    }
    throw new ErrorPagoNoAplicado();
  }
}
