import { fechaLima } from '../../../compartido/dominio/fecha-lima';
import type { EstadoExpediente } from '../dominio/estado-publico';
import type { PlazosHabiles } from '../dominio/puertos/plazos-habiles';
import type { Reloj } from '../dominio/puertos/reloj';
import type { RepositorioVencimientos } from '../dominio/puertos/repositorio-vencimientos';

/** Estados en los que el plazo corre (la Municipalidad debe actuar). */
export const ESTADOS_PLAZO_CORRIENDO: readonly EstadoExpediente[] = [
  'REGISTRADO',
  'EN_EVALUACION',
  'PAGADO',
  'EN_INSPECCION',
  'APROBADO',
];

/** Estados con el plazo suspendido (espera al administrado, research §R-04 de la 006). */
export const ESTADOS_PLAZO_SUSPENDIDO: readonly EstadoExpediente[] = [
  'OBSERVADO',
  'PENDIENTE_PAGO',
];

/**
 * Completa una vez el vencimiento de los expedientes presentados antes de la 006 (FR-026, research
 * §R-06): desde su presentación, con el plazo de su receta. Si están suspendidos, guarda los días que
 * quedaban. Idempotente: solo toca los que siguen sin vencimiento ni plazo suspendido.
 */
export class CompletarVencimientos {
  constructor(
    private readonly d: {
      readonly vencimientos: Pick<RepositorioVencimientos, 'sinVencimiento' | 'fijar'>;
      readonly plazos: PlazosHabiles;
      readonly reloj: Reloj;
    },
  ) {}

  async ejecutar(): Promise<number> {
    const hoy = fechaLima(this.d.reloj.ahora());
    const pendientes = await this.d.vencimientos.sinVencimiento([
      ...ESTADOS_PLAZO_CORRIENDO,
      ...ESTADOS_PLAZO_SUSPENDIDO,
    ]);
    for (const expediente of pendientes) {
      const vence = await this.d.plazos.sumarDiasHabiles(
        fechaLima(expediente.presentadoEn),
        expediente.plazoDias,
      );
      const suspendido = ESTADOS_PLAZO_SUSPENDIDO.includes(expediente.estado);
      await this.d.vencimientos.fijar(
        expediente.id,
        suspendido
          ? {
              vencePlazoEn: null,
              plazoRestanteDias: Math.max(0, await this.d.plazos.diasHabilesRestantes(hoy, vence)),
            }
          : { vencePlazoEn: vence, plazoRestanteDias: null },
      );
    }
    return pendientes.length;
  }
}
