import {
  type Fecha,
  fechaLima,
  inicioDiaLima,
  sumarDias,
} from '../../../compartido/dominio/fecha-lima';
import { titularPublico } from '../../../compartido/dominio/titular-publico';
import { ESTADOS_PLAZO_SUSPENDIDO } from './completar-vencimientos';
import type {
  ExpedienteTerminado,
  LectorParaReportes,
} from '../dominio/puertos/lector-para-reportes';

/** Atención de un expediente para el tablero (007), en días de Lima y sin datos personales. */
export interface AtencionTerminada {
  readonly numero: string;
  readonly codigoReceta: string;
  readonly presentadoEn: Fecha;
  readonly terminadoEn: Fecha;
  /** Intervalos con el plazo suspendido (OBSERVADO o PENDIENTE_PAGO), recortados a la atención. */
  readonly suspensiones: readonly { readonly desde: Fecha; readonly hasta: Fecha }[];
}

export interface FilaEnTramite {
  readonly numero: string;
  readonly codigoReceta: string;
  readonly titularPublico: string;
  readonly giro: string;
  readonly zona: string;
  readonly estado: string;
  readonly presentadoEn: Fecha;
}

/** Suspensiones a partir del historial ordenado: entra a un estado suspendido y sale al siguiente. */
export const suspensionesDe = (
  expediente: ExpedienteTerminado,
): { readonly desde: Fecha; readonly hasta: Fecha }[] => {
  const historial = [...expediente.historial]
    .filter((paso) => paso.ocurridoEn <= expediente.terminadoEn)
    .sort((a, b) => a.ocurridoEn.getTime() - b.ocurridoEn.getTime());
  const suspensiones: { desde: Fecha; hasta: Fecha }[] = [];
  let inicio: Date | null = null;
  for (const paso of historial) {
    const suspendido = (ESTADOS_PLAZO_SUSPENDIDO as readonly string[]).includes(paso.estadoNuevo);
    if (suspendido && inicio === null) {
      inicio = paso.ocurridoEn;
    } else if (!suspendido && inicio !== null) {
      suspensiones.push({ desde: fechaLima(inicio), hasta: fechaLima(paso.ocurridoEn) });
      inicio = null;
    }
  }
  if (inicio !== null) {
    suspensiones.push({ desde: fechaLima(inicio), hasta: fechaLima(expediente.terminadoEn) });
  }
  return suspensiones;
};

/** Datos de Trámites para los reportes de la jefatura (007). Fechas `AAAA-MM-DD` de Lima. */
export class DatosParaReportes {
  constructor(private readonly lector: LectorParaReportes) {}

  conteoPorEstado(desde: Fecha, hasta: Fecha): Promise<Readonly<Record<string, number>>> {
    return this.lector.conteoPorEstado(inicioDiaLima(desde), inicioDiaLima(sumarDias(hasta, 1)));
  }

  async atencionesTerminadas(desde: Fecha, hasta: Fecha): Promise<AtencionTerminada[]> {
    const terminados = await this.lector.terminados(
      inicioDiaLima(desde),
      inicioDiaLima(sumarDias(hasta, 1)),
    );
    return terminados.map((expediente) => ({
      numero: expediente.numero,
      codigoReceta: expediente.codigoReceta,
      presentadoEn: fechaLima(expediente.presentadoEn),
      terminadoEn: fechaLima(expediente.terminadoEn),
      suspensiones: suspensionesDe(expediente),
    }));
  }

  async expedientesEnTramite(codigoReceta?: string): Promise<FilaEnTramite[]> {
    return (await this.lector.enTramite(codigoReceta)).map((fila) => ({
      numero: fila.numero,
      codigoReceta: fila.codigoReceta,
      titularPublico: titularPublico(fila),
      giro: fila.giro,
      zona: fila.zona,
      estado: fila.estado,
      presentadoEn: fechaLima(fila.presentadoEn),
    }));
  }
}
