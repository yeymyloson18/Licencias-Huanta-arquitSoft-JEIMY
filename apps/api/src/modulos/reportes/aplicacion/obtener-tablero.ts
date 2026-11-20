import { CalendarioHabil } from '../../../compartido/dominio/calendario-habil';
import { fechaLima } from '../../../compartido/dominio/fecha-lima';
import type {
  CacheReportes,
  FuenteCatalogo,
  FuenteFeriados,
  FuentePagos,
  FuenteTramites,
  Reloj,
} from '../dominio/puertos';
import { rangoDesde } from '../dominio/rango-fechas';
import { calcularTablero, type Tablero } from '../dominio/tablero';
import { conCache } from './cache';

/** Tablero de la jefatura para un rango (historia 1 de la 007), con caché de 5 minutos. */
export class ObtenerTablero {
  constructor(
    private readonly d: {
      readonly tramites: FuenteTramites;
      readonly pagos: FuentePagos;
      readonly catalogo: FuenteCatalogo;
      readonly feriados: FuenteFeriados;
      readonly cache: CacheReportes;
      readonly reloj: Reloj;
      readonly avisar: (mensaje: string) => void;
    },
  ) {}

  async ejecutar(entrada: { readonly desde?: string; readonly hasta?: string }): Promise<Tablero> {
    const ahora = this.d.reloj.ahora();
    const rango = rangoDesde(entrada, fechaLima(ahora));
    return conCache(
      this.d.cache,
      `rep:tablero:${rango.desde}:${rango.hasta}`,
      async () => {
        const [conteoPorEstado, atenciones, plazos, pagos] = await Promise.all([
          this.d.tramites.conteoPorEstado(rango.desde, rango.hasta),
          this.d.tramites.atencionesTerminadas(rango.desde, rango.hasta),
          this.d.catalogo.plazosPorReceta(),
          this.d.pagos.pagosRegistrados(rango.desde, rango.hasta),
        ]);
        // Un solo calendario para todas las atenciones: desde la presentación más antigua.
        const inicio = atenciones.reduce(
          (minimo, atencion) => (atencion.presentadoEn < minimo ? atencion.presentadoEn : minimo),
          rango.desde,
        );
        const calendario = new CalendarioHabil(
          await this.d.feriados.feriadosEntre(inicio, rango.hasta),
        );
        return calcularTablero({
          rango,
          generadoEn: ahora,
          conteoPorEstado,
          atenciones,
          plazos,
          pagos,
          calendario,
        });
      },
      this.d.avisar,
    );
  }
}
