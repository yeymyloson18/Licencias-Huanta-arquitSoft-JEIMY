import { z } from 'zod';
import type { ManejadorEvento } from '../../../compartido/infraestructura/despachador-eventos';
import type {
  AccionConfiguracion,
  RegistrarEventoConfiguracion,
} from '../aplicacion/registrar-evento-configuracion';

/** El evento no tiene la forma esperada; el despachador lo reintenta y avisa cada 10 fallos. */
export class ErrorEventoInvalidoSeguridad extends Error {
  constructor(tipo: string) {
    super(`Evento ${tipo} inválido`);
    this.name = 'ErrorEventoInvalidoSeguridad';
  }
}

const comun = { usuarioId: z.uuid(), en: z.iso.datetime() };
const esquemaReceta = z.object({ codigoReceta: z.string().regex(/^[A-Z0-9-]{1,10}$/), ...comun });
const esquemaFeriado = z.object({ fecha: z.iso.date(), ...comun });

/** Tipos de evento de la cola que Seguridad lleva a su auditoría (data-model.md §4 de la 009). */
export const EVENTOS_CONFIGURACION: readonly {
  readonly tipo: string;
  readonly accion: AccionConfiguracion;
}[] = [
  { tipo: 'RecetaActualizada', accion: 'RECETA_ACTUALIZADA' },
  { tipo: 'RecetaDesactivada', accion: 'RECETA_DESACTIVADA' },
  { tipo: 'RecetaReactivada', accion: 'RECETA_REACTIVADA' },
  { tipo: 'FeriadoRegistrado', accion: 'FERIADO_REGISTRADO' },
  { tipo: 'FeriadoEliminado', accion: 'FERIADO_ELIMINADO' },
];

/** Manejador de un tipo de evento: valida los datos y registra la acción. */
export const manejadorConfiguracion =
  (
    registrar: RegistrarEventoConfiguracion,
    tipo: string,
    accion: AccionConfiguracion,
  ): ManejadorEvento =>
  async (datos, meta) => {
    const esReceta = tipo.startsWith('Receta');
    const evento = esReceta ? esquemaReceta.safeParse(datos) : esquemaFeriado.safeParse(datos);
    if (!evento.success) {
      throw new ErrorEventoInvalidoSeguridad(tipo);
    }
    const objeto = 'codigoReceta' in evento.data ? evento.data.codigoReceta : evento.data.fecha;
    await registrar.ejecutar({
      accion,
      usuarioId: evento.data.usuarioId,
      objeto,
      en: new Date(evento.data.en),
      eventoId: meta.id,
    });
  };
