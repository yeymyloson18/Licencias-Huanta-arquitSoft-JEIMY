import { ErrorDatoPagos } from '../dominio/errores';
import type { NombresUsuarios } from '../dominio/puertos/nombres-usuarios';
import type { RepositorioEsquelas } from '../dominio/puertos/repositorio-esquelas';

/** Esquema `RegistroAuditoria` del contrato: referencia = código de la esquela. */
export interface RegistroAuditoriaPagos {
  readonly usuarioId: string;
  readonly nombreUsuario: string | null;
  readonly accion: string;
  readonly referencia: string;
  readonly detalle: {
    readonly reciboAnterior: string | null;
    readonly reciboNuevo: string;
    readonly motivo: string | null;
  };
  readonly ocurridoEn: Date;
}

const POR_PAGINA_MAXIMO = 50;
const DIA_MS = 24 * 60 * 60 * 1000;
/** Lima no tiene horario de verano: siempre UTC-5. */
const DESFASE_LIMA_MS = 5 * 60 * 60 * 1000;

/** Inicio del día `AAAA-MM-DD` en Lima, como instante. */
const inicioDiaLima = (fecha: string): Date =>
  new Date(Date.parse(`${fecha}T00:00:00Z`) + DESFASE_LIMA_MS);

/**
 * `GET /pagos/auditoria` (RF25, historia 6 de la 005): pagos y correcciones, del más reciente al más
 * antiguo; `desde` y `hasta` incluyen el día completo en hora de Lima. Sin datos del titular.
 */
export class ConsultarAuditoriaPagos {
  constructor(
    private readonly d: {
      readonly esquelas: Pick<RepositorioEsquelas, 'listarAuditoria'>;
      readonly nombres: NombresUsuarios;
    },
  ) {}

  async ejecutar(filtro: {
    readonly desde: string | null;
    readonly hasta: string | null;
    readonly pagina: number;
    readonly porPagina: number;
  }) {
    const desde = filtro.desde === null ? null : inicioDiaLima(filtro.desde);
    const hasta =
      filtro.hasta === null ? null : new Date(inicioDiaLima(filtro.hasta).getTime() + DIA_MS);
    if (desde !== null && hasta !== null && desde >= hasta) {
      throw new ErrorDatoPagos('hasta', 'La fecha final no puede ser anterior a la inicial');
    }
    const porPagina = Math.min(filtro.porPagina, POR_PAGINA_MAXIMO);
    const pagina = await this.d.esquelas.listarAuditoria({
      desde,
      hasta,
      pagina: filtro.pagina,
      porPagina,
    });
    const nombres = await this.d.nombres.nombresDe(pagina.datos.map((r) => r.usuarioId));
    return {
      pagina: filtro.pagina,
      porPagina,
      total: pagina.total,
      datos: pagina.datos.map((registro): RegistroAuditoriaPagos => ({
        usuarioId: registro.usuarioId,
        nombreUsuario: nombres.get(registro.usuarioId) ?? null,
        accion: registro.accion,
        referencia: registro.codigoEsquela,
        detalle: {
          reciboAnterior: registro.reciboAnterior,
          reciboNuevo: registro.reciboNuevo,
          motivo: registro.motivo,
        },
        ocurridoEn: registro.ocurridoEn,
      })),
    };
  }
}
